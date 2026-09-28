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
const temporaryRoot = await mkdtemp(join(tmpdir(), 'toonlab-packaged-style-labels-'));
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
    import * as THREE from 'three';
    import {
      createEnvironmentBackdrop,
      createEnvironmentDustMotes,
      createEnvironmentLampRig,
      createEnvironmentSunRig,
    } from '@call-me-sensei/toonlab/environment';
    import {
      CompiledTreeInstance,
      StylizedGrassClumpField,
    } from '@call-me-sensei/toonlab/vegetation';
    import {
      WaterBreakerSystem,
      WaterKelpField,
      WaterRain,
      WaterSplashSystem,
    } from '@call-me-sensei/toonlab/water';
    import {
      auditSceneStyleContract,
      applyStyleBundle,
      CALL_ME_SENSEI_STYLE_BUNDLE,
      collectStyleTargets,
      createToonLabInspector,
      createSceneContentDocument,
      createSceneQualityDocument,
      createSceneScenarioDocument,
      createStyleMaterialContract,
      createStyleTarget,
      createStyleTargetLabel,
      labelStyleTarget,
      parseStyleTargetLabel,
      readStyleTargetLabel,
      resolveSceneLook,
      removeStyleTargetLabel,
      serializeSceneStyleAudit,
      serializeSceneContentDocument,
      serializeStyleTargetLabel,
      STYLE_SCENE_AUDIT_DOCUMENT_TYPE,
      StyleBundleTransactionError,
      STYLE_TARGET_DOMAINS,
      STYLE_TARGET_LABEL_KEY,
      STYLE_TARGET_LABEL_SCHEMA_VERSION,
      TOONLAB_INSPECTOR_VERSION,
      validateStyleMaterialContract,
      validateStyleTargetLabel,
    } from '@call-me-sensei/toonlab/styles';

    const label = createStyleTargetLabel('natural.rock', {
      assetId: 'catalog:rock-0303',
      collision: 'solid',
      materials: createStyleMaterialContract('natural.rock', {
        assignments: { RockSurface: { roles: ['rock'] } },
      }),
      targetId: 'clean-scene/rock-1',
    });
    assert.equal(STYLE_TARGET_LABEL_KEY, 'toonlab');
    assert.equal(STYLE_TARGET_LABEL_SCHEMA_VERSION, 2);
    assert.ok(STYLE_TARGET_DOMAINS.includes('natural.rock'));
    assert.equal(validateStyleTargetLabel(label).ok, true);
    assert.deepEqual(parseStyleTargetLabel(serializeStyleTargetLabel(label)).value, label);
    assert.equal(validateStyleTargetLabel({ domain: 'natural.rock' }).ok, false);
    assert.equal(validateStyleTargetLabel({ domain: 'environment', schemaVersion: 2 }).ok, false);
    assert.equal(validateStyleMaterialContract('vegetation.flower', {
      schemaVersion: 1,
      assignments: { FlowerHead: { roles: ['flowerPetal', 'flowerCenter'] } },
    }).ok, false);
    const contentDocument = createSceneContentDocument('clean-scene', {
      content: { assets: [{ assetId: 'catalog:rock-0303' }] },
    });
    const scenarioDocument = createSceneScenarioDocument('noon-lake', {
      scenario: { sky: { timeOfDay: 'noon' }, water: { preset: 'lake' } },
    });
    const qualityDocument = createSceneQualityDocument('balanced', {
      quality: { renderer: { pixelRatio: 1 } },
    });
    assert.equal(JSON.parse(serializeSceneContentDocument(contentDocument)).id, 'clean-scene');
    assert.equal(scenarioDocument.scenario.water.preset, 'lake');
    assert.equal(qualityDocument.quality.renderer.pixelRatio, 1);
    const resolvedLook = resolveSceneLook({
      bundle: CALL_ME_SENSEI_STYLE_BUNDLE,
      content: contentDocument,
      quality: qualityDocument,
      scenario: scenarioDocument,
    });
    assert.equal(resolvedLook.systems.water.effective.preset, 'lake');
    assert.equal(resolvedLook.systems.water.effective.style, 'call_me_sensei');

    const scene = new THREE.Scene();
    const rock = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1),
      new THREE.MeshBasicMaterial({ name: 'RockSurface' }),
    );
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(4, 4),
      new THREE.MeshBasicMaterial({ name: 'GroundSurface' }),
    );
    const grass = new StylizedGrassClumpField({
      placements: [{ x: 0, y: 0, z: 0 }],
      styleTarget: { targetId: 'clean-scene/grass' },
    });
    const compiledLevels = [0, 1, 2, 3].map((level) => {
      const root = new THREE.Group();
      const material = new THREE.MeshStandardMaterial({ name: 'PackedCompiledTree' + level });
      material.userData.treeMaterialRole = level === 0 ? 'bark' : level === 1 ? 'leaf' : 'surface';
      root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), material));
      return root;
    });
    const compiledTree = new CompiledTreeInstance({
      ditherMode: 'bayer',
      levels: compiledLevels,
      manifest: {
        bounds: { center: [0, 1, 0], radius: 2 },
        catalogId: 'packed:compiled-tree',
        lods: [0, 1, 2, 3].map((level) => ({
          level,
          minScreenCoverage: [0.2, 0.1, 0.03, 0][level],
        })),
        surfaceLooks: [],
      },
    }, { styleTarget: { targetId: 'clean-scene/compiled-tree' } });
    scene.add(rock, ground, grass, compiledTree);

    const bounds = new THREE.Box3(
      new THREE.Vector3(-4, 0, -4),
      new THREE.Vector3(4, 4, 4),
    );
    const backdropTexture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    backdropTexture.needsUpdate = true;
    const sun = createEnvironmentSunRig({ scene, environmentBox: bounds });
    const lamps = createEnvironmentLampRig({ scene, environmentBox: bounds });
    const backdrop = createEnvironmentBackdrop({ scene, environmentBox: bounds, textures: backdropTexture });
    const dust = createEnvironmentDustMotes({ bounds, count: 2, scene });
    const splashes = new WaterSplashSystem({ dropletPoolSize: 2, sheetPoolSize: 2 });
    const breakers = new WaterBreakerSystem();
    const kelp = new WaterKelpField({ placements: [{ x: 0, y: 0, z: 0 }] });
    const rain = new WaterRain({ count: 2 });
    scene.add(splashes, breakers, kelp, rain);
    labelStyleTarget(rock, label);
    labelStyleTarget(ground, createStyleTargetLabel('terrain.ground', {
      materials: createStyleMaterialContract('terrain.ground', {
        assignments: { GroundSurface: { roles: ['ground'] } },
      }),
      targetId: 'clean-scene/ground',
    }));
    assert.deepEqual(readStyleTargetLabel(rock), label);
    const discovery = collectStyleTargets(scene);
    assert.equal(discovery.ok, true);
    assert.deepEqual(discovery.targets.map(({ id }) => id), [
      'clean-scene/compiled-tree',
      'clean-scene/grass',
      'clean-scene/ground',
      'clean-scene/rock-1',
    ]);
    assert.equal(removeStyleTargetLabel(ground), true);
    assert.equal(readStyleTargetLabel(ground), null);

    labelStyleTarget(ground, createStyleTargetLabel('terrain.ground', {
      materials: createStyleMaterialContract('terrain.ground', {
        assignments: { GroundSurface: { roles: ['ground'] } },
      }),
      targetId: 'clean-scene/ground',
    }));
    const audit = auditSceneStyleContract(scene, {
      mode: 'strict',
      rendererBackend: 'webgl',
    });
    assert.equal(audit.type, STYLE_SCENE_AUDIT_DOCUMENT_TYPE);
    assert.equal(audit.ok, true);
    assert.equal(audit.readyToApply, true);
    assert.equal(audit.targets.length, 4);
    assert.equal(audit.systems.length, 8);
    assert.deepEqual(JSON.parse(serializeSceneStyleAudit(audit)), audit);

    const transactionA = { value: 'source-a' };
    const transactionB = { value: 'source-b' };
    const adapter = (nextValue, fail = false) => ({
      apply(subject) {
        subject.value = nextValue;
        if (fail) throw new Error('packed injected failure');
      },
      capture: (subject) => subject.value,
      custom: true,
      id: 'packed-' + nextValue,
      restore: (subject, snapshot) => { subject.value = snapshot; },
    });
    let transactionFailure = null;
    try {
      await applyStyleBundle(CALL_ME_SENSEI_STYLE_BUNDLE, {
        targets: [
          createStyleTarget('packed/a', 'terrain.ground', transactionA, {
            adapter: adapter('styled-a'),
          }),
          createStyleTarget('packed/b', 'terrain.ground', transactionB, {
            adapter: adapter('styled-b', true),
          }),
        ],
      });
    } catch (error) {
      transactionFailure = error;
    }
    assert.ok(transactionFailure instanceof StyleBundleTransactionError);
    assert.equal(transactionFailure.rolledBack, true);
    assert.equal(transactionA.value, 'source-a');
    assert.equal(transactionB.value, 'source-b');

    const idempotentState = { value: 'source', writes: 0 };
    const idempotentAdapter = {
      apply(subject, settings) {
        subject.value = JSON.stringify(settings);
        subject.writes += 1;
      },
      capture: (subject) => ({ ...subject }),
      custom: true,
      id: 'packed-idempotent',
      restore: (subject, snapshot) => { Object.assign(subject, snapshot); },
    };
    const idempotentTarget = createStyleTarget(
      'packed/idempotent',
      'terrain.ground',
      idempotentState,
      { adapter: idempotentAdapter },
    );
    const firstApply = await applyStyleBundle(CALL_ME_SENSEI_STYLE_BUNDLE, {
      targets: [idempotentTarget],
    });
    const repeatedApply = await applyStyleBundle(CALL_ME_SENSEI_STYLE_BUNDLE, {
      targets: [idempotentTarget],
    });
    assert.equal(idempotentState.writes, 1);
    assert.equal(repeatedApply.idempotent, true);
    assert.equal((await firstApply.revert()).reverted, true);
    assert.deepEqual(idempotentState, { value: 'source', writes: 0 });

    const inspectorApply = await applyStyleBundle(CALL_ME_SENSEI_STYLE_BUNDLE, {
      targets: [idempotentTarget],
    });
    const inspector = createToonLabInspector({ bundle: CALL_ME_SENSEI_STYLE_BUNDLE });
    inspector.registerApplication(inspectorApply);
    assert.equal(inspector.snapshot().version, TOONLAB_INSPECTOR_VERSION);
    await inspector.setDomainEnabled('terrain.ground', false);
    assert.deepEqual(idempotentState, { value: 'source', writes: 0 });
    await inspector.setDomainEnabled('terrain.ground', true);
    assert.equal(idempotentState.writes, 1);
    await inspectorApply.revert();
    inspector.dispose();

    console.log(JSON.stringify({
      auditedTargets: audit.targets.length,
      auditedSystems: audit.systems.length,
      contentDocumentVersion: contentDocument.version,
      resolvedLookVersion: resolvedLook.version,
      domainCount: STYLE_TARGET_DOMAINS.length,
      discoveredTargets: discovery.targets.length,
      key: STYLE_TARGET_LABEL_KEY,
      schemaVersion: STYLE_TARGET_LABEL_SCHEMA_VERSION,
      targetId: label.targetId,
      transactionRolledBack: transactionFailure.rolledBack,
      repeatedApplyIdempotent: repeatedApply.idempotent,
      inspectorVersion: TOONLAB_INSPECTOR_VERSION,
    }));
  `;
  const consumerScriptPath = join(consumerRoot, 'verify.mjs');
  await writeFile(consumerScriptPath, consumerScript);
  const evidence = run(process.execPath, [consumerScriptPath], { cwd: consumerRoot }).trim();
  const parsedEvidence = JSON.parse(evidence);
  assert.equal(parsedEvidence.schemaVersion, 2);
  assert.equal(parsedEvidence.discoveredTargets, 4);
  assert.equal(parsedEvidence.auditedTargets, 4);
  assert.equal(parsedEvidence.auditedSystems, 8);
  assert.equal(parsedEvidence.contentDocumentVersion, 1);
  assert.equal(parsedEvidence.resolvedLookVersion, 1);
  assert.equal(parsedEvidence.key, 'toonlab');
  assert.equal(parsedEvidence.transactionRolledBack, true);
  assert.equal(parsedEvidence.repeatedApplyIdempotent, true);
  assert.equal(parsedEvidence.inspectorVersion, 1);
  console.log(`Packaged style target label verification passed: ${evidence}`);
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}
