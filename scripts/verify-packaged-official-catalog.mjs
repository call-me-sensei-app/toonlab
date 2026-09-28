import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const temporaryRoot = await mkdtemp(join(tmpdir(), 'toonlab-official-catalog-'));
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
    'pack', '--dry-run=false', '--json', '--ignore-scripts', '--pack-destination', temporaryRoot,
  ], {
    cwd: root,
    env: { ...process.env, npm_config_cache: join(temporaryRoot, 'npm-cache') },
  }))[0];
  assert.equal(report.version, packageJson.version);

  const consumerRoot = join(temporaryRoot, 'consumer');
  const packageScope = join(consumerRoot, 'node_modules', '@call-me-sensei');
  const packagePath = join(packageScope, 'toonlab');
  await mkdir(packageScope, { recursive: true });
  run('tar', ['-xzf', join(temporaryRoot, report.filename), '-C', packageScope]);
  await rename(join(packageScope, 'package'), packagePath);
  await symlink(join(root, 'node_modules', 'three'), join(consumerRoot, 'node_modules', 'three'));
  await writeFile(join(consumerRoot, 'package.json'), JSON.stringify({ private: true, type: 'module' }));

  const consumerScript = `
    import assert from 'node:assert/strict';
    import * as THREE from 'three';
    import {
      CALL_ME_SENSEI_STYLE_BUNDLE,
      createToonLabInspector,
      createOfficialCatalogAssetRuntime as runtimeFromRoot,
      createOfficialCatalogProvider as fromRoot,
      createWorldCollision,
    } from '@call-me-sensei/toonlab';
    import {
      createCatalogLodRuntime,
      createOfficialCatalogAssetRuntime as runtimeFromSubpath,
      createOfficialCatalogProvider as fromSubpath,
      loadOfficialCatalogAsset,
      OFFICIAL_CATALOG_ASSET_VERSION,
    } from '@call-me-sensei/toonlab/official-catalog';

    assert.equal(fromRoot, fromSubpath);
    assert.equal(runtimeFromRoot, runtimeFromSubpath);
    const requests = [];
    const provider = fromSubpath({
      baseUrl: 'https://catalog.example/releases/current/',
      fetchImpl: async (url) => {
        requests.push(url);
        return new Response(JSON.stringify({ asset: {
          id: 'rock-0001',
          kind: 'model',
          name: 'Packed rock',
          source: 'toonlab-rock',
          download_url: 'models/rock.glb',
          metadata: {
            catalog: 'rocks',
            recipeHash: 'packed-recipe-hash',
            revision: 1,
            recipe: { kind: 'toonlab/rock-recipe', version: 1 },
          },
        } }), { status: 200 });
      },
    });
    const asset = await provider.getAsset('rock-0001');
    assert.equal(requests[0], 'https://catalog.example/releases/current/api/toonlab/catalog/rock-0001');
    assert.equal(asset.modelUrl, 'https://catalog.example/releases/current/models/rock.glb');
    assert.equal(asset.schemaVersion, OFFICIAL_CATALOG_ASSET_VERSION);
    const sourceRoot = new THREE.Group();
    sourceRoot.add(new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshStandardMaterial(),
    ));
    let loads = 0;
    const runtime = runtimeFromSubpath({
      loadModel: async (url) => {
        loads += 1;
        return { format: 'gltf', root: sourceRoot, url };
      },
      prepareTextures: async () => {},
      provider,
      renderer: {},
      transcodersFactory: () => ({ dispose() {} }),
    });
    const first = await runtime.acquireAsset(asset);
    const second = await runtime.acquireAsset(asset);
    assert.equal(loads, 1);
    assert.equal(first.root.children[0].geometry, second.root.children[0].geometry);
    assert.notEqual(first.root.children[0].material, second.root.children[0].material);
    first.release();
    second.release();
    await runtime.dispose();
    const lodRoot = new THREE.Group();
    for (const level of [0, 2]) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
      mesh.name = 'packed_LOD' + level + '_mesh';
      lodRoot.add(mesh);
    }
    const lod = createCatalogLodRuntime(lodRoot, { distances: [0, 20, 60] });
    lod.update({ distance: 100 });
    assert.equal(lod.level, 2);
    const placementRoot = new THREE.Group();
    const placementMesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    placementMesh.name = 'packed_LOD0_mesh';
    placementRoot.add(placementMesh);
    const placementRuntime = runtimeFromSubpath({
      loadModel: async (url) => ({ format: 'gltf', root: placementRoot, url }),
      prepareTextures: async () => {},
      provider,
      renderer: {},
      transcodersFactory: () => ({ dispose() {} }),
    });
    const collision = createWorldCollision();
    const inspector = createToonLabInspector({ bundle: CALL_ME_SENSEI_STYLE_BUNDLE });
    const placement = await loadOfficialCatalogAsset({
      assetId: asset.id,
      assetRuntime: placementRuntime,
      collisionWorld: collision,
      inspector,
      styleBundle: CALL_ME_SENSEI_STYLE_BUNDLE,
    });
    assert.equal(placement.object.children[0].userData.rockShaderPreset, 'call_me_sensei');
    assert.equal(collision.circles.length, 1);
    const inspected = inspector.snapshot().targets[0];
    assert.equal(inspected.adapterId, 'toonlab-official-catalog-rock');
    assert.equal(inspected.participation.collision.kind, 'bounds');
    assert.deepEqual(inspected.participation.lod.availableLevels, [0]);
    await placement.release();
    assert.equal(collision.circles.length, 0);
    assert.equal(inspector.snapshot().targets.length, 0);
    inspector.dispose();
    await placementRuntime.dispose();
    console.log(JSON.stringify({
      collisionAfterRelease: collision.circles.length,
      identity: asset.identity,
      loads,
      lodLevel: lod.level,
      inspectorLifecycle: true,
      modelUrl: asset.modelUrl,
    }));
  `;
  const consumerScriptPath = join(consumerRoot, 'verify.mjs');
  await writeFile(consumerScriptPath, consumerScript);
  const evidence = JSON.parse(run(process.execPath, [consumerScriptPath], { cwd: consumerRoot }).trim());
  assert.equal(evidence.identity, 'toonlab-rock:rock-0001@1:packed-recipe-hash');
  assert.equal(evidence.loads, 1);
  assert.equal(evidence.lodLevel, 2);
  assert.equal(evidence.collisionAfterRelease, 0);
  console.log(`Packaged official catalog verification passed: ${JSON.stringify(evidence)}`);
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}
