import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const temporaryRoot = await mkdtemp(join(tmpdir(), 'toonlab-packaged-character-'));
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}

try {
  const report = JSON.parse(run(npmCommand, [
    'pack',
    '--dry-run=false',
    '--json',
    '--ignore-scripts',
    '--pack-destination',
    temporaryRoot,
  ], {
    cwd: root,
    env: {
      ...process.env,
      npm_config_cache: join(temporaryRoot, 'npm-cache'),
    },
  }))[0];
  assert.equal(report.name, '@call-me-sensei/toonlab');
  assert.equal(report.version, packageJson.version);

  const consumerRoot = join(temporaryRoot, 'consumer');
  const packageScope = join(consumerRoot, 'node_modules', '@call-me-sensei');
  const packagePath = join(packageScope, 'toonlab');
  await mkdir(packageScope, { recursive: true });
  run('tar', ['-xzf', join(temporaryRoot, report.filename), '-C', packageScope]);
  await rename(join(packageScope, 'package'), packagePath);
  await symlink(join(root, 'node_modules', 'three'), join(consumerRoot, 'node_modules', 'three'));
  await writeFile(join(consumerRoot, 'package.json'), JSON.stringify({
    private: true,
    type: 'module',
  }));

  const consumerScript = `
    import assert from 'node:assert/strict';
    import { createHash } from 'node:crypto';
    import { Vector3 } from 'three';
    import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
    import {
      createCharacterRuntime,
      TOONLAB_MANNEQUIN_ASSET,
      TOONLAB_MANNEQUIN_ASSET_URL,
    } from '@call-me-sensei/toonlab/character';
    import {
      createModelAssetTranscoders,
      loadModelAsset,
    } from '@call-me-sensei/toonlab/loaders';
    import {
      CALL_ME_SENSEI_STYLE_BUNDLE,
      applyStyleBundle,
      auditSceneStyleContract,
      collectStyleTargets,
      readStyleTargetLabel,
    } from '@call-me-sensei/toonlab/styles';

    // Three's browser loader reports fetch progress through ProgressEvent;
    // Node supplies fetch but not that DOM constructor.
    globalThis.ProgressEvent ??= class ProgressEvent {
      constructor(type, init = {}) {
        this.type = type;
        Object.assign(this, init);
      }
    };

    assert.equal(typeof createModelAssetTranscoders, 'function');
    assert.equal(typeof loadModelAsset, 'function');
    assert.equal(typeof createCharacterRuntime, 'function');

    assert.equal(TOONLAB_MANNEQUIN_ASSET.animationClipCount, 46);
    assert.equal(TOONLAB_MANNEQUIN_ASSET.byteSize, 6670948);
    assert.equal(TOONLAB_MANNEQUIN_ASSET.url, TOONLAB_MANNEQUIN_ASSET_URL);
    assert.equal(
      TOONLAB_MANNEQUIN_ASSET_URL,
      'https://assets.toonlab.io/runtime/characters/mannequin/v1-37925f7d8278d5a7/mannequin.glb',
    );
    const response = await fetch(TOONLAB_MANNEQUIN_ASSET_URL, {
      headers: { Origin: 'https://toonlab.io' },
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /^model\\/gltf-binary/i);
    assert.equal(response.headers.get('access-control-allow-origin'), '*');
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.subarray(0, 4).toString('ascii'), 'glTF');
    assert.equal(bytes.length, TOONLAB_MANNEQUIN_ASSET.byteSize);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), TOONLAB_MANNEQUIN_ASSET.sha256);
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const gltf = await new Promise((resolve, reject) => (
      new GLTFLoader().parse(arrayBuffer, '', resolve, reject)
    ));
    assert.equal(gltf.animations.length, 46);
    let skinnedMeshCount = 0;
    gltf.scene.traverse((object) => { if (object.isSkinnedMesh) skinnedMeshCount += 1; });
    assert.ok(skinnedMeshCount > 0);
    const runtime = await createCharacterRuntime({
      animation: false,
      // Exercise the neutral package-owned NodeMaterial bridge used when a
      // WebGPU host defers the final look to strict style-bundle application.
      renderer: { isWebGPURenderer: true },
      targetHeight: 1.7,
      toon: false,
      url: TOONLAB_MANNEQUIN_ASSET_URL,
    });
    assert.equal(runtime.format, 'gltf');
    assert.ok(runtime.targetMesh?.isSkinnedMesh);
    assert.ok(Math.abs(runtime.bounds.getSize(new Vector3()).y - 1.7) < 0.01);
    const characterLabel = readStyleTargetLabel(runtime.carrier);
    assert.equal(characterLabel.domain, 'character');
    assert.equal(characterLabel.targetId, 'toonlab/character');
    const characterAudit = auditSceneStyleContract(runtime.carrier);
    assert.equal(characterAudit.readyToApply, true, JSON.stringify(characterAudit.issues));
    const characterTargets = collectStyleTargets(runtime.carrier);
    assert.equal(characterTargets.ok, true, JSON.stringify(characterTargets.issues));
    assert.equal(characterTargets.targets.length, 1);
    const characterApplication = await applyStyleBundle(CALL_ME_SENSEI_STYLE_BUNDLE, {
      mode: 'strict',
      targets: characterTargets.targets,
    });
    assert.equal(characterApplication.applied.length, 1);
    await characterApplication.revert();
    runtime.update(1 / 60);
    runtime.dispose();
    console.log(JSON.stringify({
      animationClipCount: gltf.animations.length,
      assetAuthority: 'public-r2',
      byteSize: bytes.length,
      labeledMaterials: Object.keys(characterLabel.materials.assignments).length,
      skinnedMeshCount,
      url: TOONLAB_MANNEQUIN_ASSET_URL,
    }));
  `;
  const consumerScriptPath = join(consumerRoot, 'verify.mjs');
  await writeFile(consumerScriptPath, consumerScript);
  const evidence = run(process.execPath, [consumerScriptPath], { cwd: consumerRoot }).trim();
  const parsedEvidence = JSON.parse(evidence);
  assert.equal(parsedEvidence.assetAuthority, 'public-r2');
  assert.equal(parsedEvidence.animationClipCount, 46);
  assert.ok(parsedEvidence.labeledMaterials > 0);
  console.log(`Packaged character verification passed: ${evidence}`);
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}
