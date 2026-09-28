import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';

import * as assetPolicy from '@call-me-sensei/toonlab/asset-policy';
import * as collision from '@call-me-sensei/toonlab/world-collision';
import * as environment from '@call-me-sensei/toonlab/environment';
import * as groundShader from '@call-me-sensei/toonlab/ground-shader';
import * as rockgen from '@call-me-sensei/toonlab/rockgen';
import * as sky from '@call-me-sensei/toonlab/sky';
import * as styles from '@call-me-sensei/toonlab/styles';
import * as vegetation from '@call-me-sensei/toonlab/vegetation';
import * as water from '@call-me-sensei/toonlab/water';
import { TOONLAB_VERSION } from '@call-me-sensei/toonlab';

let checks = 0;
function awaitable(value) {
  return value && typeof value.then === 'function' ? value : Promise.resolve(value);
}

const pending = [];
function test(label, callback) {
  pending.push(awaitable(callback()).then(() => {
    checks += 1;
    console.log(`ok   ${label}`);
  }));
}

test('Call Me Sensei is a complete anime-game style bundle', () => {
  const bundle = styles.CALL_ME_SENSEI_STYLE_BUNDLE;
  assert.equal(bundle.version, 2);
  assert.equal(bundle.artDirection.family, 'anime-game');
  assert.equal(bundle.artDirection.rendering, 'cel-shaded');
  assert.deepEqual(
    Object.keys(bundle.slots).sort(),
    [...styles.CALL_ME_SENSEI_STYLE_SLOT_IDS].sort(),
  );
  assert.deepEqual(styles.getFirstPartyStyleBundle('call_me_sensei'), bundle);
  assert.equal(styles.getFirstPartyStyleBundle('call-me-sensei'), bundle);
  for (const slotId of styles.CALL_ME_SENSEI_STYLE_SLOT_IDS) {
    assert.deepEqual(
      bundle.slots[slotId],
      { style: 'call_me_sensei' },
      `${slotId} must use the Call Me Sensei treatment`,
    );
  }
  assert.equal(
    styles.resolveStyleBundleSettings(bundle).manufacturedSurface.style,
    'call_me_sensei',
  );
  assert.deepEqual(bundle.coverage.unsupported, ['vfx', 'renderer']);
  assert.equal(styles.resolveStyleBundleSettings(bundle).lighting.skyProbe.enabled, true);
  assert.equal(
    styles.resolveStyleBundleSettings(bundle).lighting.skyProbe.referenceContract,
    'call-me-sensei-reference',
  );
  const grass = styles.resolveStyleBundleSettings(bundle).grass;
  assert.equal(grass.groundAdoptStrength, 1);
  assert.equal(grass.groundAdoptHeight, 0.88);
  assert.deepEqual(grass.groundAdoptTint, [1, 1, 1]);
  assert.equal(grass.bladesPerClump, 40);
});

test('scene layer documents round-trip and reject cross-layer ownership leaks', () => {
  const content = styles.createSceneContentDocument('showcase-content', {
    content: {
      assets: [{ assetId: 'catalog:rock-0303', domain: 'natural.rock' }],
      systems: { grass: { implementation: 'toonlab:grass-clumps', preset: 'meadow' } },
    },
    label: 'Showcase content',
  });
  const scenario = styles.createSceneScenarioDocument('noon-calm-lake', {
    label: 'Noon calm lake',
    scenario: {
      sky: { timeOfDay: 'noon', weather: 'clear' },
      water: { preset: 'lake', waveIntensity: 0.2 },
      wind: { strength: 0.3 },
    },
  });
  const quality = styles.createSceneQualityDocument('balanced', {
    quality: {
      cloud: { resolutionScale: 0.5 },
      renderer: { pixelRatio: 1 },
      shadows: { mapSize: 2048 },
    },
  });
  const overrides = styles.createSceneOverrideDocument('screenshot-overrides', {
    description: 'Lock the hero capture state without modifying portable content or scenario documents.',
    overrides: {
      systems: { water: { waveIntensity: 0.1 } },
      targets: { 'geology/hero-rock': { visible: true } },
    },
  });

  for (const [document, parse, serialize] of [
    [content, styles.parseSceneContentDocument, styles.serializeSceneContentDocument],
    [scenario, styles.parseSceneScenarioDocument, styles.serializeSceneScenarioDocument],
    [quality, styles.parseSceneQualityDocument, styles.serializeSceneQualityDocument],
    [overrides, styles.parseSceneOverrideDocument, styles.serializeSceneOverrideDocument],
  ]) {
    assert.deepEqual(parse(serialize(document)).value, document);
  }

  assert.throws(() => styles.createSceneContentDocument('bad-content', {
    content: { grass: { style: 'call_me_sensei' } },
  }), /content cannot contain field "style"/);
  assert.throws(() => styles.createSceneScenarioDocument('bad-scenario', {
    scenario: { rocks: [{ assetId: 'catalog:rock-0303' }] },
  }), /scenario cannot contain field "assetId"/);
  assert.throws(() => styles.createSceneQualityDocument('bad-quality', {
    quality: { weather: 'clear' },
  }), /quality cannot contain field "weather"/);
  assert.equal(styles.parseSceneContentDocument('{').ok, false);
});

test('scene look composition preserves content and scenario while style changes', () => {
  const content = styles.createSceneContentDocument('composition-content', {
    content: {
      assets: [{ assetId: 'catalog:rock-0303', domain: 'natural.rock' }],
      systems: {
        grass: { implementation: 'toonlab:grass-clumps', preset: 'meadow' },
        water: { implementation: 'toonlab:water-surface' },
      },
    },
  });
  const scenario = styles.createSceneScenarioDocument('composition-scenario', {
    scenario: {
      sky: { timeOfDay: 'noon', weather: 'clear' },
      water: { preset: 'lake', waveIntensity: 0.2 },
    },
  });
  const quality = styles.createSceneQualityDocument('composition-quality', {
    quality: {
      renderer: { pixelRatio: 1 },
      water: { reflectionScale: 0.5 },
    },
  });
  const overrides = styles.createSceneOverrideDocument('composition-overrides', {
    description: 'Pin the screenshot wave amplitude after all reusable layers.',
    overrides: {
      systems: { water: { waveIntensity: 0.1 } },
      targets: { 'geology/hero-rock': { visible: true } },
    },
  });
  const sourceSnapshot = JSON.stringify({ content, overrides, quality, scenario });
  const callMeSensei = styles.resolveSceneLook({
    bundle: 'call-me-sensei', content, overrides, quality, scenario,
  });
  assert.equal(JSON.stringify({ content, overrides, quality, scenario }), sourceSnapshot,
    'composition must not mutate source documents');
  assert.equal(callMeSensei.systems.water.content.implementation, 'toonlab:water-surface');
  assert.equal(callMeSensei.systems.water.effective.style, 'call_me_sensei');
  assert.equal(callMeSensei.systems.water.effective.preset, 'lake');
  assert.equal(callMeSensei.systems.water.effective.reflectionScale, 0.5);
  assert.equal(callMeSensei.systems.water.effective.waveIntensity, 0.1);
  assert.equal(callMeSensei.systems.sky.effective.timeOfDay, 'noon');
  assert.deepEqual(callMeSensei.targets, { 'geology/hero-rock': { visible: true } });

  const alternate = styles.createStyleBundleDocument('alternate-style', {
    slots: {
      ...styles.CALL_ME_SENSEI_STYLE_BUNDLE.slots,
      water: { style: 'default' },
    },
  });
  const changedStyle = styles.resolveSceneLook({
    bundle: alternate, content, overrides, quality, scenario,
  });
  assert.equal(changedStyle.systems.water.effective.style, 'default');
  assert.equal(changedStyle.systems.water.effective.preset, 'lake');
  assert.deepEqual(changedStyle.content, callMeSensei.content);
  assert.deepEqual(changedStyle.scenario, callMeSensei.scenario);
  const serialized = JSON.parse(styles.serializeResolvedSceneLook(changedStyle));
  assert.equal(serialized.type, styles.RESOLVED_SCENE_LOOK_DOCUMENT_TYPE);
  assert.deepEqual(serialized.content, changedStyle.content);
  assert.deepEqual(serialized.scenario, changedStyle.scenario);
  assert.deepEqual(serialized.systems.water.effective, changedStyle.systems.water.effective);
});

test('the built-in grass adapter lands field settings as well as shader settings', async () => {
  const grassRoot = new THREE.Group();
  let appliedFieldSettings = null;
  grassRoot.applySettings = (settings) => {
    appliedFieldSettings = settings;
    return settings;
  };
  const result = await styles.applyStyleBundle(styles.CALL_ME_SENSEI_STYLE_BUNDLE, {
    targets: [styles.createStyleTarget('meadow', 'vegetation.grass', grassRoot)],
  });
  assert.equal(result.applied.length, 1);
  assert.equal(appliedFieldSettings.groundAdoptStrength, 1);
  assert.equal(appliedFieldSettings.bladesPerClump, 40);
});

test('labeled ground automatically publishes color for bundle grass', async () => {
  const sourceTexture = new THREE.DataTexture(
    new Uint8Array([102, 153, 68, 255]),
    1,
    1,
    THREE.RGBAFormat,
  );
  sourceTexture.wrapS = THREE.ClampToEdgeWrapping;
  sourceTexture.wrapT = THREE.ClampToEdgeWrapping;
  const sourceMaterial = new THREE.MeshBasicMaterial({ color: 0x669944, map: sourceTexture });
  sourceMaterial.userData.toonlabMaterialId = 'GroundSurface';
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(4, 4),
    sourceMaterial,
  );
  assert.notEqual(ground.userData.groundFieldWrite, true);
  const result = await styles.applyStyleBundle(styles.CALL_ME_SENSEI_STYLE_BUNDLE, {
    targets: [styles.createStyleTarget('ground', 'terrain.ground', ground)],
  });
  assert.equal(result.applied.length, 1);
  assert.equal(ground.userData.groundFieldWrite, true);
  assert.equal(ground.receiveShadow, true);
  assert.notEqual(ground.material, sourceMaterial,
    'a labeled ordinary ground material must be converted, not silently skipped');
  assert.ok(ground.material.userData.toonlabGroundShader,
    'the bundle must install the canonical Ground Shader adapter');
  assert.equal(ground.material.userData.toonlabMaterialId, 'GroundSurface');
  assert.deepEqual(ground.material.userData.toonlabSourceTextureIds, [sourceTexture.uuid],
    'the converted material must retain auditable source-texture lineage');
  assert.notEqual(
    ground.material.userData.toonlabOwnedLayerTextures[0],
    sourceTexture,
    'world-projection setup must use a clone instead of mutating the source texture',
  );
  assert.equal(sourceTexture.wrapS, THREE.ClampToEdgeWrapping);
  assert.equal(sourceTexture.wrapT, THREE.ClampToEdgeWrapping);
  let generatedDisposed = false;
  ground.material.addEventListener('dispose', () => { generatedDisposed = true; });
  await result.setTargetEnabled('ground', false);
  assert.equal(ground.material, sourceMaterial,
    'turning the ground style off must restore the exact source material');
  assert.equal(ground.receiveShadow, false,
    'turning the ground style off must restore the source shadow state');
  assert.equal(generatedDisposed, true,
    'turning the ground style off must dispose the generated package material');
  ground.geometry.dispose();
  ground.material.dispose();
  sourceTexture.dispose();
});

test('scene style runtime owns the ground field requested by the bundle', async () => {
  const scene = new THREE.Scene();
  const renderer = {
    isWebGPURenderer: false,
    shadowMap: { enabled: false, type: null },
    toneMappingExposure: 1,
  };
  const runtime = styles.createSceneStyleRuntime({ renderer, scene });
  assert.equal(runtime.groundFieldPass, null);
  await runtime.apply('call-me-sensei');
  assert.ok(runtime.groundFieldPass);
  assert.ok(runtime.shadowPass, 'the bundle runtime must own its shared shadow pass');
  assert.equal(renderer.shadowMap.enabled, true, 'native receivers must work without host wiring');
  await runtime.dispose();
  assert.equal(renderer.shadowMap.enabled, false, 'dispose must restore the renderer shadow state');
});

test('scene style runtime keeps node renderers on the package shadow path only', async () => {
  const scene = new THREE.Scene();
  const renderer = {
    backend: { isWebGPUBackend: true },
    isWebGPURenderer: true,
    shadowMap: { autoUpdate: true, enabled: false, needsUpdate: false, type: null },
    toneMappingExposure: 1,
  };
  const runtime = styles.createSceneStyleRuntime({ renderer, scene });
  await runtime.apply('call-me-sensei');
  assert.equal(renderer.shadowMap.enabled, false,
    'WebGPU must not submit a duplicate native shadow pass beside ToonLab passes');
  assert.ok(runtime.shadowPass, 'the package shadow pass remains available on WebGPU');
  await runtime.dispose();
});

test('scene style runtime rolls shared systems back when a target fails', async () => {
  const scene = new THREE.Scene();
  const renderer = {
    isWebGPURenderer: false,
    shadowMap: { enabled: false, type: null },
    toneMappingExposure: 1,
  };
  const runtime = styles.createSceneStyleRuntime({ renderer, scene });
  const sourceLightingId = runtime.lighting.style.id;
  const subject = { value: 'source' };
  const adapter = {
    apply(target) {
      target.value = 'mutated';
      throw new Error('injected scene runtime failure');
    },
    capture: (target) => target.value,
    custom: true,
    id: 'test-scene-runtime-failure',
    restore(target, snapshot) { target.value = snapshot; },
  };
  await assert.rejects(
    runtime.apply('call-me-sensei', {
      targets: [styles.createStyleTarget('runtime/failure', 'terrain.ground', subject, { adapter })],
    }),
    styles.StyleBundleTransactionError,
  );
  assert.equal(subject.value, 'source');
  assert.equal(runtime.lighting.style.id, sourceLightingId);
  assert.equal(renderer.shadowMap.enabled, false);
  assert.equal(runtime.groundFieldPass, null);
  await runtime.dispose();
});

test('scene style runtime dispose reverts styled targets', async () => {
  const renderer = {
    isWebGPURenderer: false,
    shadowMap: { enabled: false, type: null },
    toneMappingExposure: 1,
  };
  const runtime = styles.createSceneStyleRuntime({ renderer, scene: new THREE.Scene() });
  const subject = { value: 'source' };
  const adapter = {
    apply(target) { target.value = 'styled'; },
    capture: (target) => target.value,
    custom: true,
    id: 'test-scene-runtime-dispose',
    restore(target, snapshot) { target.value = snapshot; },
  };
  await runtime.apply('call-me-sensei', {
    targets: [styles.createStyleTarget('runtime/dispose', 'terrain.ground', subject, { adapter })],
  });
  assert.equal(subject.value, 'styled');
  await runtime.dispose();
  assert.equal(subject.value, 'source');
  assert.equal(renderer.shadowMap.enabled, false);
});

test('scene style runtime restores prior system bindings when a late bind fails', async () => {
  const originalSky = {
    applied: 0,
    applyPreset() { return Promise.resolve(); },
    clouds: {},
    setTimeOfDay() { this.applied += 1; },
    sun: {},
    toParams: () => sky.createSkyParams(),
  };
  const runtime = styles.createSceneStyleRuntime({
    renderer: { isWebGPURenderer: false, toneMappingExposure: 1 },
    scene: new THREE.Scene(),
    sky: originalSky,
  });
  await runtime.apply('call-me-sensei');
  const nextWater = {
    settings: { style: 'source' },
    setStyle(style) { this.settings = { style }; },
  };
  const failingSky = {
    applyPreset() { throw new Error('injected async-system bind failure'); },
    clouds: {},
    sun: {},
    toParams: () => sky.createSkyParams(),
  };
  await assert.rejects(
    runtime.setSystems({ sky: failingSky, water: nextWater }),
    styles.StyleBundleTransactionError,
  );
  assert.deepEqual(nextWater.settings, { style: 'source' });
  runtime.setTimeOfDay(13);
  assert.equal(originalSky.applied, 1, 'the previous sky binding must remain active');
  await runtime.dispose();
});

test('generic scene runtime behavior depends on resolved documents, not bundle id', async () => {
  const renamedBundle = styles.createStyleBundleDocument('studio-renamed-copy', {
    slots: styles.CALL_ME_SENSEI_STYLE_BUNDLE.slots,
  });
  let scenario = sky.createSkyParams({ cloud: { shape: { coverage: 0.23 } } });
  let applied = null;
  const skySystem = {
    applyPreset(params) {
      scenario = sky.createSkyParams(params);
      applied = scenario;
      return Promise.resolve();
    },
    clouds: {},
    sun: {},
    toParams() { return scenario; },
  };
  const renderer = {
    isWebGPURenderer: false,
    shadowMap: { enabled: false, type: null },
    toneMappingExposure: 1,
  };
  const runtime = styles.createSceneStyleRuntime({
    renderer,
    scene: new THREE.Scene(),
    sky: skySystem,
  });
  await runtime.apply(renamedBundle);
  assert.equal(applied.cloud.shape.coverage, 0.49,
    'the named Call Me Sensei sky style must install its reviewed partly-cloudy baseline');
  assert.equal(applied.cloud.style.enabled, true);
  assert.equal(applied.atmosphere.style.enabled, true);
  assert.equal(renderer.shadowMap.enabled, true);
  await runtime.dispose();
  assert.equal(renderer.shadowMap.enabled, false);
});

test('generic scene composition contains no first-party bundle-id branch', async () => {
  const source = await readFile(new URL('../src/styles/sceneStyleRuntime.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /bundle\??\.id\s*===/);
  assert.doesNotMatch(source, /style:\s*['"]call-me-sensei['"]/);
});

test('Call Me Sensei installs its partly-cloudy baseline and preserves later explicit conditions', async () => {
  let scenario = sky.createSkyParams({ cloud: { shape: { coverage: 0.23 } } });
  let applied = null;
  const skySystem = {
    applyPreset(params) {
      scenario = sky.createSkyParams(params);
      applied = scenario;
      return Promise.resolve();
    },
    clouds: {},
    setTimeOfDay(hour, { autoAdvanceSecondsPerDay, sunDirection } = {}) {
      const direction = sunDirection
        ? new THREE.Vector3().fromArray(sunDirection)
        : sky.sunDirectionAt(
          hour / 24,
          scenario.time.latitude,
          scenario.time.azimuth,
        );
      scenario = sky.createSkyParams({
        ...scenario,
        sun: {
          ...scenario.sun,
          azimuth: sky.azimuthOf(direction),
          elevation: sky.elevationOf(direction),
        },
        time: { ...scenario.time, autoAdvanceSecondsPerDay, time: hour / 24 },
      });
    },
    sun: {},
    toParams() { return scenario; },
  };
  const runtime = styles.createSceneStyleRuntime({
    renderer: { isWebGPURenderer: false, toneMappingExposure: 1 },
    scene: new THREE.Scene(),
    sky: skySystem,
  });
  await runtime.apply('call-me-sensei');
  assert.equal(applied.cloud.shape.coverage, 0.49,
    'strict bundle application must replace an arbitrary cloud condition with the reviewed baseline');
  assert.equal(applied.cloud.style.enabled, true);
  assert.equal(applied.time.time, 13 / 24,
    'strict bundle application must default to the reviewed P18 noon keyframe without host wiring');
  const partlyCloudy = sky.createSkyParams({ cloud: { shape: { coverage: 0.49 } } });
  const changed = await runtime.setSkyPreset(partlyCloudy, { timeOfDay: 11 });
  assert.equal(changed.cloud.shape.coverage, 0.49,
    'changing physical sky condition must preserve that condition');
  assert.equal(changed.cloud.style.enabled, true,
    'changing physical sky condition must reapply the active bundle style');
  assert.equal(sky.matchSkyStyleSnapshot(changed), '2.10',
    'changing physical sky condition must retain the Call Me Sensei sky/cloud snapshot');
  assert.equal(changed.time.time, 11 / 24,
    'changing sky condition must keep the sky and lighting clock coordinated');
  runtime.setTimeOfDay(22);
  assert.ok(scenario.sun.elevation < 0,
    'the visible SkySystem sun must cross below the horizon at Night');
  await runtime.dispose();
});

test('the OSS Style Bundle builder always exposes the protected canonical default', async () => {
  const source = await readFile(new URL('../labs/styles/main.js', import.meta.url), 'utf8');
  assert.match(source, /CALL_ME_SENSEI_STYLE_BUNDLE/);
  assert.match(source, /built-in · read-only/);
  assert.match(source, /Fork bundle to customize/);
  assert.match(source, /Call Me Sensei is the protected canonical Style Bundle/);
  assert.doesNotMatch(source, /'tree', 'grass', 'flowers'/);
  assert.doesNotMatch(source, /getWeatherStyleOptions|weather-preset|\bdebris:/);
  for (const slotId of styles.CALL_ME_SENSEI_STYLE_SLOT_IDS) {
    assert.match(source, new RegExp(`\\b${slotId}\\b`), `${slotId} must be surfaced by the OSS builder`);
  }
});

test('v1 bundles migrate visual slots and report asset identity', () => {
  const parsed = styles.parseStyleBundleDocument({
    description: 'Legacy test',
    id: 'legacy',
    label: 'Legacy',
    schema: styles.STYLE_BUNDLE_DOCUMENT_TYPE,
    slots: {
      grass: { style: 'call_me_sensei' },
      tree: { creation: 'tree-1' },
      vegetationShader: { style: 'call_me_sensei' },
      water: { style: 'call_me_sensei' },
    },
    version: 1,
  });
  assert.equal(parsed.ok, true, parsed.errors?.join(' '));
  assert.equal(parsed.value.version, 2);
  assert.deepEqual(parsed.value.slots.treeShader, { style: 'call_me_sensei' });
  assert.deepEqual(parsed.value.slots.grassShader, { style: 'call_me_sensei' });
  assert.deepEqual(parsed.value.slots.flowerShader, { style: 'call_me_sensei' });
  assert.equal(parsed.value.slots.tree, undefined);
  assert.deepEqual(parsed.legacyAssetSelections.tree, { creation: 'tree-1' });
  assert.deepEqual(parsed.legacyAssetSelections.grass, { style: 'call_me_sensei' });
  assert.ok(parsed.warnings.some((warning) => warning.includes('asset slot')));
  assert.equal(JSON.parse(styles.serializeStyleBundle(parsed.value)).version, 2);
});

test('strict style application preflights before mutation', async () => {
  let mutations = 0;
  const valid = {
    apply: () => { mutations += 1; },
    domain: 'character',
    id: 'hero',
    subject: {},
  };
  const invalid = { domain: 'unknown', id: 'mystery', subject: {} };
  await assert.rejects(
    styles.applyStyleBundle(styles.CALL_ME_SENSEI_STYLE_BUNDLE, {
      targets: [valid, invalid],
    }),
    styles.StyleBundleApplicationError,
  );
  assert.equal(mutations, 0);

  const targets = Object.keys(styles.STYLE_DOMAIN_SLOT_ROUTES).map((domain) => ({
    apply: (_subject, settings) => {
      assert.ok(settings);
      mutations += 1;
    },
    domain,
    id: domain,
    subject: {},
  }));
  const result = await styles.applyStyleBundle(
    styles.CALL_ME_SENSEI_STYLE_BUNDLE,
    { targets },
  );
  assert.equal(result.applied.length, targets.length);
  assert.equal(mutations, targets.length);
});

test('strict style application reconciles declared roles with live material slots', async () => {
  const root = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: 0x64748b, name: '' });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
  root.add(mesh);
  styles.labelStyleTarget(root, styles.createStyleTargetLabel('manufactured.surface', {
    assetId: 'fixture:strict-live-coverage',
    materials: styles.createStyleMaterialContract('manufactured.surface', {
      assignments: {
        ExpectedPaintedMetal: { roles: ['primaryMass'] },
      },
    }),
    targetId: 'fixture/strict-live-coverage',
  }));
  const targets = styles.collectStyleTargets(root).targets;
  const sourceColor = material.color.getHex();
  await assert.rejects(
    styles.applyStyleBundle(styles.CALL_ME_SENSEI_STYLE_BUNDLE, {
      mode: 'strict',
      targets,
    }),
    (error) => {
      assert.ok(error instanceof styles.StyleBundleApplicationError);
      const codes = new Set(error.audit.issues.map(({ code }) => code));
      assert.equal(codes.has('missing-material-id'), true);
      assert.equal(codes.has('unconsumed-material-assignment'), true);
      return true;
    },
  );
  assert.equal(material.color.getHex(), sourceColor, 'strict rejection must occur before mutation');
  assert.equal(material.userData.toonlabMaterialId, undefined);
  mesh.geometry.dispose();
  material.dispose();
});

test('adapter failure rolls every target back to its captured state', async () => {
  const first = { value: 'source-a' };
  const second = { value: 'source-b' };
  const adapter = (nextValue, { fail = false } = {}) => ({
    apply(subject) {
      subject.value = nextValue;
      if (fail) throw new Error('injected adapter failure');
    },
    capture(subject) { return subject.value; },
    custom: true,
    id: `test-${nextValue}`,
    restore(subject, snapshot) { subject.value = snapshot; },
  });
  let failure = null;
  try {
    await styles.applyStyleBundle(styles.CALL_ME_SENSEI_STYLE_BUNDLE, {
      targets: [
        styles.createStyleTarget('transaction/a', 'terrain.ground', first, {
          adapter: adapter('styled-a'),
        }),
        styles.createStyleTarget('transaction/b', 'terrain.ground', second, {
          adapter: adapter('styled-b', { fail: true }),
        }),
      ],
    });
  } catch (error) {
    failure = error;
  }
  assert.ok(failure instanceof styles.StyleBundleTransactionError);
  assert.equal(failure.stage, 'apply');
  assert.equal(failure.rolledBack, true);
  assert.deepEqual(failure.applied.map(({ targetId }) => targetId), ['transaction/a']);
  assert.equal(first.value, 'source-a');
  assert.equal(second.value, 'source-b');
});

test('rollback restores built-in Object3D materials, flags, metadata, and geometry attributes', async () => {
  const sourceMaterial = new THREE.MeshBasicMaterial({ color: 0x667788, name: 'SourceRock' });
  const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(1), sourceMaterial);
  const failureSubject = { value: 'source' };
  const failingAdapter = {
    apply(subject) {
      subject.value = 'mutated';
      throw new Error('stop after rock');
    },
    capture: (subject) => subject.value,
    custom: true,
    id: 'test-failing-ground',
    restore: (subject, snapshot) => { subject.value = snapshot; },
  };
  await assert.rejects(
    styles.applyStyleBundle(styles.CALL_ME_SENSEI_STYLE_BUNDLE, {
      targets: [
        styles.createStyleTarget('transaction/rock', 'natural.rock', rock),
        styles.createStyleTarget('transaction/failure', 'terrain.ground', failureSubject, {
          adapter: failingAdapter,
        }),
      ],
    }),
    styles.StyleBundleTransactionError,
  );
  assert.equal(rock.material, sourceMaterial);
  assert.equal(rock.castShadow, false);
  assert.equal(rock.receiveShadow, false);
  assert.equal(rock.userData.rockShaderPreset, undefined);
  assert.equal(rock.geometry.getAttribute('color'), undefined);
  assert.equal(rock.geometry.getAttribute('envVertexAo'), undefined);
  assert.equal(failureSubject.value, 'source');
  rock.geometry.dispose();
  sourceMaterial.dispose();
});

test('style application is idempotent and A to B to A can unwind with revert', async () => {
  const state = { value: 'source', writes: 0 };
  const adapter = {
    apply(subject, settings) {
      subject.value = JSON.stringify(settings);
      subject.writes += 1;
    },
    capture: (subject) => ({ value: subject.value, writes: subject.writes }),
    custom: true,
    id: 'test-switchable-ground',
    restore(subject, snapshot) { Object.assign(subject, snapshot); },
  };
  const target = styles.createStyleTarget('switch/ground', 'terrain.ground', state, { adapter });
  const styleA = styles.CALL_ME_SENSEI_STYLE_BUNDLE;
  const styleB = styles.createStyleBundleDocument('default-ground', {
    slots: { groundShader: { style: 'default' } },
  });

  const firstA = await styles.applyStyleBundle(styleA, { targets: [target] });
  const valueA = state.value;
  assert.equal(state.writes, 1);

  const repeatedA = await styles.applyStyleBundle(styleA, { targets: [target] });
  assert.equal(repeatedA.idempotent, true);
  assert.deepEqual(repeatedA.applied, []);
  assert.equal(repeatedA.skipped[0].reason, 'already-applied');
  assert.equal(state.writes, 1);

  const appliedB = await styles.applyStyleBundle(styleB, { targets: [target] });
  const valueB = state.value;
  assert.notEqual(valueB, valueA);
  assert.equal(state.writes, 2);

  const secondA = await styles.applyStyleBundle(styleA, { targets: [target] });
  assert.equal(state.value, valueA);
  assert.equal(state.writes, 3);

  assert.deepEqual(await secondA.revert(), { reverted: true, targets: ['switch/ground'] });
  assert.equal(state.value, valueB);
  assert.equal((await secondA.revert()).reason, 'already-reverted');
  assert.equal((await repeatedA.revert()).reason, 'already-applied');

  assert.equal((await appliedB.revert()).reverted, true);
  assert.equal(state.value, valueA);
  assert.equal((await firstA.revert()).reverted, true);
  assert.deepEqual(state, { value: 'source', writes: 0 });
});

test('package inspector toggles unwind to the exact pre-ToonLab source', async () => {
  const state = { marker: 'source', nested: { value: 7 }, writes: 0 };
  const adapter = {
    apply(subject, settings) {
      subject.marker = JSON.stringify(settings);
      subject.nested.value += 10;
      subject.writes += 1;
    },
    capture: (subject) => structuredClone(subject),
    custom: true,
    id: 'test-inspector-ground',
    restore(subject, snapshot) { Object.assign(subject, structuredClone(snapshot)); },
  };
  const target = styles.createStyleTarget('inspector/ground', 'terrain.ground', state, { adapter });
  const first = await styles.applyStyleBundle(styles.CALL_ME_SENSEI_STYLE_BUNDLE, {
    targets: [target],
  });
  const secondBundle = styles.createStyleBundleDocument('inspector-second', {
    slots: { groundShader: { style: 'second' } },
  });
  const second = await styles.applyStyleBundle(secondBundle, { targets: [target] });
  const styledSecond = structuredClone(state);
  assert.equal(styledSecond.writes, 2);
  assert.equal(styledSecond.nested.value, 27);

  const inspector = styles.createToonLabInspector({
    bundle: secondBundle,
    quality: { id: 'balanced', label: 'Balanced', type: 'toonlab/scene-quality', version: 1 },
  });
  inspector.registerApplication(first);
  inspector.registerApplication(second);
  const initial = inspector.snapshot();
  assert.equal(initial.type, styles.TOONLAB_INSPECTOR_DOCUMENT_TYPE);
  assert.equal(initial.version, styles.TOONLAB_INSPECTOR_VERSION);
  assert.equal(initial.package.version, TOONLAB_VERSION);
  assert.deepEqual(initial.domains[0], {
    controllable: true,
    domain: 'terrain.ground',
    enabled: true,
    targets: ['inspector/ground'],
  });
  assert.equal(initial.targets[0].adapterId, 'test-inspector-ground');
  assert.equal(initial.targets[0].transactionCount, 2);

  await inspector.setDomainEnabled('terrain.ground', false);
  assert.deepEqual(state, { marker: 'source', nested: { value: 7 }, writes: 0 });
  assert.equal(inspector.snapshot().domains[0].enabled, false);

  await inspector.setTargetEnabled('inspector/ground', true);
  assert.deepEqual(state, styledSecond);
  assert.equal(inspector.snapshot().targets[0].enabled, true);
  assert.equal(JSON.parse(inspector.serialize()).package.name, '@call-me-sensei/toonlab');
  inspector.dispose();
  await second.revert();
  await first.revert();
  assert.deepEqual(state, { marker: 'source', nested: { value: 7 }, writes: 0 });
});

test('character toggles restore source hierarchy and refresh shared render passes', async () => {
  const sourceMaterial = new THREE.MeshStandardMaterial({ color: 0x88aadd });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), sourceMaterial);
  const character = new THREE.Group();
  character.add(mesh);
  let refreshes = 0;
  character.userData.toonlabCharacterStyleIntegration = {
    refresh() { refreshes += 1; },
  };
  const target = styles.createStyleTarget('inspector/character', 'character', character);
  const application = await styles.applyStyleBundle(styles.CALL_ME_SENSEI_STYLE_BUNDLE, {
    targets: [target],
  });
  const firstGeneratedCount = mesh.children.filter((child) => (
    child.userData?.isToonOutline || child.userData?.isToonFurShell
  )).length;
  assert.equal(refreshes, 1, 'bundle apply refreshes character render-pass integration');
  assert.notEqual(mesh.material, sourceMaterial);

  await application.setTargetEnabled(target.id, false);
  assert.equal(refreshes, 2, 'source restore refreshes character render-pass integration');
  assert.equal(mesh.material, sourceMaterial);
  assert.equal(mesh.children.filter((child) => (
    child.userData?.isToonOutline || child.userData?.isToonFurShell
  )).length, 0, 'transaction-owned character children are removed');

  await application.setTargetEnabled(target.id, true);
  assert.equal(refreshes, 3);
  assert.equal(mesh.children.filter((child) => (
    child.userData?.isToonOutline || child.userData?.isToonFurShell
  )).length, firstGeneratedCount, 're-enable does not accumulate generated children');
  await application.setTargetEnabled(target.id, false);
  mesh.geometry.dispose();
  sourceMaterial.dispose();
});

test('transaction restore preserves exact runtime texture identity', async () => {
  const sourceTexture = new THREE.Texture();
  sourceTexture.name = 'source-texture';
  const liveRenderTargetTexture = new THREE.Texture();
  liveRenderTargetTexture.isRenderTargetTexture = true;
  liveRenderTargetTexture.name = 'live-render-target';
  const material = new THREE.MeshBasicMaterial();
  material.uniforms = { sceneColor: { value: sourceTexture } };
  const root = new THREE.Group();
  root.add(new THREE.Mesh(new THREE.BufferGeometry(), material));
  const adapter = {
    apply(subject) {
      subject.children[0].material.uniforms.sceneColor.value = liveRenderTargetTexture;
    },
    custom: true,
    id: 'test-runtime-texture-identity',
  };
  const target = styles.createStyleTarget(
    'inspector/runtime-texture',
    'terrain.ground',
    root,
    { adapter },
  );
  const application = await styles.applyStyleBundle(styles.CALL_ME_SENSEI_STYLE_BUNDLE, {
    targets: [target],
  });
  assert.equal(material.uniforms.sceneColor.value, liveRenderTargetTexture);

  await application.setTargetEnabled(target.id, false);
  assert.equal(
    material.uniforms.sceneColor.value,
    sourceTexture,
    'restore must replace the resource reference instead of copying into the live target',
  );
  assert.equal(
    liveRenderTargetTexture.name,
    'live-render-target',
    'restoring another texture must not mutate the live render-target texture',
  );

  await application.setTargetEnabled(target.id, true);
  assert.equal(material.uniforms.sceneColor.value, liveRenderTargetTexture);
  await application.revert();
  material.dispose();
  sourceTexture.dispose();
  liveRenderTargetTexture.dispose();
});

test('versioned style target labels are strict and JSON portable', () => {
  const input = {
    assetId: 'catalog:rock-0303',
    collision: 'solid',
    materials: styles.createStyleMaterialContract('natural.rock', {
      assignments: { RockSurface: { roles: ['rock'] } },
    }),
    targetId: 'north-island/rock-1',
  };
  const label = styles.createStyleTargetLabel('natural.rock', input);
  assert.deepEqual(label, {
    schemaVersion: 2,
    targetId: 'north-island/rock-1',
    assetId: 'catalog:rock-0303',
    domain: 'natural.rock',
    collision: 'solid',
    materials: {
      schemaVersion: 1,
      assignments: { RockSurface: { roles: ['rock'] } },
    },
  });
  assert.equal(styles.STYLE_TARGET_LABEL_KEY, 'toonlab');
  assert.equal(styles.STYLE_TARGET_LABEL_SCHEMA_VERSION, 2);

  const serialized = styles.serializeStyleTargetLabel(label);
  const parsed = styles.parseStyleTargetLabel(serialized);
  assert.equal(parsed.ok, true, parsed.errors.join(' '));
  assert.deepEqual(parsed.value, label);
  assert.notEqual(parsed.value, label);
});

test('collision metadata validates bounds, convex, trimesh, and blocker adapters', async () => {
  const definitions = {
    blockers: collision.createCollisionMetadata('blockers', {
      circles: [{ radius: 0.5, x: 1, z: 0 }],
    }),
    bounds: collision.createCollisionMetadata('bounds', { padding: 0.25 }),
    convex: collision.createCollisionMetadata('convex', { source: 'collider' }),
    trimesh: collision.createCollisionMetadata('trimesh', { source: 'render-mesh' }),
  };
  assert.deepEqual(Object.keys(definitions).sort(), ['blockers', 'bounds', 'convex', 'trimesh']);
  assert.equal(collision.validateCollisionMetadata({ kind: 'bounds', version: 99 }).ok, false);
  assert.equal(collision.validateCollisionMetadata({ kind: 'blockers', version: 1 }).ok, false);

  const labeled = styles.createStyleTargetLabel('natural.rock', {
    collision: definitions.bounds,
    targetId: 'collision/labeled-rock',
  });
  assert.deepEqual(labeled.collision, definitions.bounds);
  assert.deepEqual(
    styles.parseStyleTargetLabel(styles.serializeStyleTargetLabel(labeled)).value,
    labeled,
  );

  const world = collision.createWorldCollision({ cellSize: 2 });
  const boundsSubject = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 4), new THREE.MeshBasicMaterial());
  boundsSubject.position.set(3, 0, 5);
  const boundsResult = await collision.registerCollisionTarget({
    collision: world,
    metadata: definitions.bounds,
    subject: boundsSubject,
    targetId: 'collision/bounds',
  });
  assert.equal(boundsResult.registered, 1);
  assert.equal(boundsResult.blockers[0].x, 3);
  assert.equal(boundsResult.blockers[0].z, 5);
  assert.ok(Math.abs(boundsResult.blockers[0].radius - (Math.hypot(2, 4) / 2 + 0.25)) < 1e-9);

  const blockerSubject = new THREE.Group();
  blockerSubject.position.set(10, 0, 0);
  blockerSubject.scale.setScalar(2);
  const blockersResult = await collision.registerCollisionTarget({
    collision: world,
    metadata: definitions.blockers,
    subject: blockerSubject,
    targetId: 'collision/blockers',
  });
  assert.deepEqual(blockersResult.blockers, [{ radius: 1, x: 12, z: 0 }]);

  const routed = [];
  const physicsAdapter = collision.createCollisionAdapter('test/physics', {
    kinds: ['convex', 'trimesh'],
    register: ({ metadata, targetId }) => {
      routed.push({ kind: metadata.kind, targetId });
      return { registered: 1 };
    },
  });
  await collision.registerCollisionTarget({
    adapter: physicsAdapter,
    metadata: definitions.convex,
    subject: boundsSubject,
    targetId: 'collision/convex',
  });
  await collision.registerCollisionTarget({
    adapter: physicsAdapter,
    metadata: definitions.trimesh,
    subject: boundsSubject,
    targetId: 'collision/trimesh',
  });
  assert.deepEqual(routed, [
    { kind: 'convex', targetId: 'collision/convex' },
    { kind: 'trimesh', targetId: 'collision/trimesh' },
  ]);
  await assert.rejects(
    collision.registerCollisionTarget({
      metadata: definitions.trimesh,
      subject: boundsSubject,
    }),
    /does not support "trimesh"/,
  );
  boundsSubject.geometry.dispose();
  boundsSubject.material.dispose();
});

test('style target labels reject guesses, unknown domains, and future versions', () => {
  const missingVersion = styles.validateStyleTargetLabel({ domain: 'natural.rock' });
  assert.equal(missingVersion.ok, false);
  assert.ok(missingVersion.errors.some((message) => message.includes('schemaVersion')));

  const unknownDomain = styles.validateStyleTargetLabel({
    domain: 'environment',
    schemaVersion: 2,
  });
  assert.equal(unknownDomain.ok, false);
  assert.ok(unknownDomain.errors.some((message) => message.includes('Unknown style target domain')));

  const future = styles.validateStyleTargetLabel({
    domain: 'natural.rock',
    schemaVersion: 3,
  });
  assert.equal(future.ok, false);
  assert.ok(future.errors.some((message) => message.includes('newer than supported')));

  const renamedField = styles.validateStyleTargetLabel({
    domain: 'natural.rock',
    schemaVersion: 2,
    version: 1,
  });
  assert.equal(renamedField.ok, false);
  assert.ok(renamedField.errors.some((message) => message.includes('Unknown style target label field')));
});

test('v1 style target labels migrate explicit roles into the v2 material contract', () => {
  const source = {
    domain: 'natural.rock',
    extensions: { studio: { biome: 'meadow' } },
    roles: { RockSurface: 'rock' },
    schemaVersion: 1,
  };
  const migrated = styles.migrateStyleTargetLabel(source);
  assert.deepEqual(migrated, {
    domain: 'natural.rock',
    extensions: { studio: { biome: 'meadow' } },
    materials: {
      schemaVersion: 1,
      assignments: { RockSurface: { roles: ['rock'] } },
    },
    schemaVersion: 2,
  });
  assert.notEqual(migrated, source);
  assert.equal(styles.validateStyleTargetLabel(migrated).ok, true);
});

test('mixed material roles require a complete authored mask', () => {
  const withoutMask = styles.validateStyleMaterialContract('vegetation.flower', {
    schemaVersion: 1,
    assignments: {
      FlowerHead: { roles: ['flowerPetal', 'flowerCenter'] },
    },
  });
  assert.equal(withoutMask.ok, false);
  assert.ok(withoutMask.errors.some((message) => message.includes('requires a maskId')));

  const incompleteMask = styles.validateStyleMaterialContract('vegetation.flower', {
    schemaVersion: 1,
    assignments: {
      FlowerHead: { maskId: 'flower-regions', roles: ['flowerPetal', 'flowerCenter'] },
    },
    masks: {
      'flower-regions': {
        encoding: 'texture-channel',
        selectors: { flowerPetal: { component: 'r', range: [0.5, 1] } },
        source: 'textures:flower-regions',
      },
    },
  });
  assert.equal(incompleteMask.ok, false);
  assert.ok(incompleteMask.errors.some((message) => message.includes('no selector for role "flowerCenter"')));

  const complete = styles.createStyleMaterialContract('vegetation.flower', {
    assignments: {
      FlowerHead: { maskId: 'flower-regions', roles: ['flowerPetal', 'flowerCenter'] },
    },
    masks: {
      'flower-regions': {
        encoding: 'texture-channel',
        selectors: {
          flowerCenter: { component: 'g', range: [0.5, 1] },
          flowerPetal: { component: 'r', range: [0.5, 1] },
        },
        source: 'textures:flower-regions',
      },
    },
  });
  assert.equal(styles.validateStyleMaterialContract('vegetation.flower', complete).ok, true);
  assert.deepEqual(
    styles.parseStyleMaterialContract(
      'vegetation.flower',
      styles.serializeStyleMaterialContract('vegetation.flower', complete),
    ).value,
    complete,
  );
});

test('mixed-role compatibility exemptions must be explicit and approved', () => {
  const unapproved = styles.validateStyleMaterialContract('vegetation.flower', {
    schemaVersion: 1,
    assignments: {
      FlowerHead: { exemptionId: 'legacy-flower-head', roles: ['flowerPetal', 'flowerCenter'] },
    },
    exemptions: {
      'legacy-flower-head': {
        approved: false,
        fallbackRole: 'flowerPetal',
        reason: 'The source asset has one indivisible material.',
        strategy: 'single-role',
      },
    },
  });
  assert.equal(unapproved.ok, false);
  assert.ok(unapproved.errors.some((message) => message.includes('approved must be true')));

  const approved = styles.createStyleMaterialContract('vegetation.flower', {
    assignments: {
      FlowerHead: { exemptionId: 'legacy-flower-head', roles: ['flowerPetal', 'flowerCenter'] },
    },
    exemptions: {
      'legacy-flower-head': {
        approved: true,
        fallbackRole: 'flowerPetal',
        reason: 'The source asset has one indivisible material.',
        strategy: 'single-role',
      },
    },
  });
  assert.equal(styles.validateStyleMaterialContract('vegetation.flower', approved).ok, true);
});

test('material roles are domain specific', () => {
  const wrongDomain = styles.validateStyleMaterialContract('natural.rock', {
    schemaVersion: 1,
    assignments: { RockSurface: { roles: ['foliageCard'] } },
  });
  assert.equal(wrongDomain.ok, false);
  assert.ok(wrongDomain.errors.some((message) => message.includes('Unknown material role')));
});

test('style application preflight rejects an invalid nested material contract', () => {
  const target = styles.createStyleTarget('mixed-flower', 'vegetation.flower', new THREE.Group(), {
    labels: {
      materials: {
        schemaVersion: 1,
        assignments: {
          FlowerHead: { roles: ['flowerPetal', 'flowerCenter'] },
        },
      },
    },
  });
  const audit = styles.auditStyleBundleApplication(styles.CALL_ME_SENSEI_STYLE_BUNDLE, [target]);
  assert.equal(audit.ok, false);
  assert.equal(audit.plan.length, 0);
  assert.ok(audit.issues.some(({ code }) => code === 'invalid-material-contract'));
});

test('style target labels write, read, replace, migrate, and remove safely', () => {
  const root = new THREE.Group();
  root.userData.hostField = 'preserved';
  const first = styles.createStyleTargetLabel('natural.rock', {
    targetId: 'rocks/hero',
  });
  assert.deepEqual(styles.labelStyleTarget(root, first), first);
  assert.deepEqual(styles.readStyleTargetLabel(root), first);
  assert.deepEqual(styles.labelStyleTarget(root, first), first, 'identical writes must be idempotent');

  const replacement = styles.createStyleTargetLabel('terrain.ground', {
    targetId: 'terrain/main',
  });
  assert.throws(() => styles.labelStyleTarget(root, replacement), styles.StyleTargetLabelError);
  styles.labelStyleTarget(root, replacement, { replace: true });
  assert.deepEqual(styles.readStyleTargetLabel(root), replacement);
  assert.equal(root.userData.hostField, 'preserved');
  assert.equal(styles.removeStyleTargetLabel(root), true);
  assert.equal(styles.removeStyleTargetLabel(root), false);
  assert.equal(styles.readStyleTargetLabel(root), null);
  assert.equal(root.userData.hostField, 'preserved');

  root.userData.toonlab = {
    domain: 'natural.rock',
    roles: { RockSurface: 'rock' },
    schemaVersion: 1,
    targetId: 'rocks/legacy',
  };
  const migrated = styles.readStyleTargetLabel(root);
  assert.equal(migrated.schemaVersion, 2);
  assert.deepEqual(migrated.materials.assignments.RockSurface.roles, ['rock']);
  assert.equal(root.userData.toonlab.schemaVersion, 1, 'reads must not mutate stored source data');
});

test('scene label discovery is deterministic and reports unsafe labels', () => {
  const scene = new THREE.Scene();
  const grass = new THREE.Group();
  const rock = new THREE.Group();
  const nestedFlower = new THREE.Group();
  grass.name = 'Grass';
  rock.name = 'Rock';
  nestedFlower.name = 'Flower';
  scene.add(grass, rock);
  rock.add(nestedFlower);
  styles.labelStyleTarget(grass, styles.createStyleTargetLabel('vegetation.grass', {
    targetId: 'vegetation/meadow',
  }));
  styles.labelStyleTarget(rock, styles.createStyleTargetLabel('natural.rock', {
    targetId: 'geology/hero-rock',
  }));
  styles.labelStyleTarget(nestedFlower, styles.createStyleTargetLabel('vegetation.flower', {
    targetId: 'vegetation/rock-flower',
  }));

  const discovered = styles.collectStyleTargets(scene);
  assert.equal(discovered.ok, true);
  assert.deepEqual(discovered.targets.map(({ id }) => id), [
    'geology/hero-rock',
    'vegetation/meadow',
    'vegetation/rock-flower',
  ]);
  assert.equal(discovered.targets[0].subject, rock);
  assert.equal(discovered.targets[2].subject, nestedFlower);

  const missingId = new THREE.Group();
  missingId.userData.toonlab = styles.createStyleTargetLabel('water');
  const duplicate = new THREE.Group();
  duplicate.userData.toonlab = styles.createStyleTargetLabel('natural.rock', {
    targetId: 'geology/hero-rock',
  });
  const invalid = new THREE.Group();
  invalid.userData.toonlab = { domain: 'environment', schemaVersion: 2 };
  scene.add(missingId, duplicate, invalid);
  const unsafe = styles.collectStyleTargets(scene);
  assert.equal(unsafe.ok, false);
  assert.deepEqual(unsafe.issues.map(({ code }) => code).sort(), [
    'duplicate-target-id',
    'invalid-label',
    'missing-target-id',
  ]);
  assert.equal(unsafe.targets.length, 3, 'valid unique targets remain discoverable');
});

test('scene style runtime can apply discovered labels without a manual target array', async () => {
  const scene = new THREE.Scene();
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(4, 4),
    new THREE.MeshBasicMaterial({ color: 0x669944 }),
  );
  scene.add(ground);
  styles.labelStyleTarget(ground, styles.createStyleTargetLabel('terrain.ground', {
    targetId: 'terrain/main',
  }));
  const renderer = {
    isWebGPURenderer: false,
    shadowMap: { enabled: false, type: null },
    toneMappingExposure: 1,
  };
  const runtime = styles.createSceneStyleRuntime({ renderer, scene });
  const result = await runtime.apply('call-me-sensei', { discovery: 'scene-labels' });
  assert.deepEqual(result.applied, [{
    domain: 'terrain.ground',
    slot: 'groundShader',
    targetId: 'terrain/main',
  }]);
  assert.equal(result.discovery.ok, true);
  assert.equal(result.discovery.targets.length, 1);
  assert.equal(ground.userData.groundFieldWrite, true);
  await runtime.dispose();
  ground.geometry.dispose();
  ground.material.dispose();
});

test('scene style runtime discovers and registers late package targets', async () => {
  const scene = new THREE.Scene();
  const renderer = {
    isWebGPURenderer: false,
    shadowMap: { enabled: false, type: null },
    toneMappingExposure: 1,
  };
  const runtime = styles.createSceneStyleRuntime({ renderer, scene });
  await runtime.apply('call-me-sensei', {
    discovery: 'scene-labels',
    watch: true,
  });
  const lateGround = new THREE.Mesh(
    new THREE.PlaneGeometry(4, 4),
    new THREE.MeshBasicMaterial({ color: 0x669944 }),
  );
  styles.labelStyleTarget(lateGround, styles.createStyleTargetLabel('terrain.ground', {
    targetId: 'terrain/late',
  }));
  scene.add(lateGround);

  const refreshed = await runtime.refreshStyleTargets();
  assert.equal(refreshed.applied, 1);
  assert.deepEqual(runtime.inspector.snapshot().domains.map(({ domain }) => domain), [
    'lighting',
    'terrain.ground',
  ]);
  assert.equal(lateGround.userData.groundFieldWrite, true);
  await runtime.inspector.setDomainEnabled('terrain.ground', false);
  assert.equal(lateGround.userData.groundFieldWrite, undefined);
  await runtime.inspector.setDomainEnabled('terrain.ground', true);
  assert.equal(lateGround.userData.groundFieldWrite, true);

  const replacementGround = new THREE.Mesh(
    new THREE.PlaneGeometry(4, 4),
    new THREE.MeshBasicMaterial({ color: 0x447755 }),
  );
  styles.labelStyleTarget(replacementGround, styles.createStyleTargetLabel('terrain.ground', {
    targetId: 'terrain/late',
  }));
  scene.remove(lateGround);
  scene.add(replacementGround);
  const replacement = await runtime.refreshStyleTargets();
  assert.equal(replacement.applied, 1, 'same-id replacement subject is styled');
  assert.equal(lateGround.userData.groundFieldWrite, undefined, 'removed subject is restored');
  assert.equal(replacementGround.userData.groundFieldWrite, true);
  assert.equal(
    runtime.inspector.snapshot().targets.filter(({ targetId }) => targetId === 'terrain/late').length,
    1,
    'inspector owns only the live replacement subject',
  );
  await runtime.inspector.setDomainEnabled('terrain.ground', false);
  assert.equal(replacementGround.userData.groundFieldWrite, undefined);
  await runtime.inspector.setDomainEnabled('terrain.ground', true);
  assert.equal(replacementGround.userData.groundFieldWrite, true);

  await runtime.dispose();
  lateGround.geometry.dispose();
  lateGround.material.dispose();
  replacementGround.geometry.dispose();
  replacementGround.material.dispose();
});

test('strict discovery fails before shared renderer state mutates', async () => {
  const scene = new THREE.Scene();
  const invalid = new THREE.Group();
  invalid.userData.toonlab = { domain: 'environment', schemaVersion: 2 };
  scene.add(invalid);
  const renderer = {
    isWebGPURenderer: false,
    shadowMap: { enabled: false, type: null },
    toneMappingExposure: 1,
  };
  const runtime = styles.createSceneStyleRuntime({ renderer, scene });
  await assert.rejects(
    runtime.apply('call-me-sensei', { discovery: 'scene-labels' }),
    styles.StyleTargetDiscoveryError,
  );
  assert.equal(renderer.shadowMap.enabled, false);
  assert.equal(runtime.groundFieldPass, null);
  await runtime.dispose();
});

test('scene routing audit emits deterministic explicit routes and named exemptions', () => {
  const scene = new THREE.Scene();
  const rock = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1),
    new THREE.ShaderMaterial({ name: 'RockSurface' }),
  );
  rock.name = 'HeroRock';
  scene.add(rock);
  styles.labelStyleTarget(rock, styles.createStyleTargetLabel('natural.rock', {
    assetId: 'catalog:rock-0303',
    materials: styles.createStyleMaterialContract('natural.rock', {
      assignments: {
        RockSurface: { exemptionId: 'studio-rock-renderer', roles: ['rock'] },
      },
      exemptions: {
        'studio-rock-renderer': {
          adapterId: 'studio:rock-v1',
          approved: true,
          reason: 'The studio renderer supplies an equivalent supported rock path.',
          strategy: 'custom-adapter',
        },
      },
    }),
    targetId: 'geology/hero-rock',
  }));

  const report = styles.auditSceneStyleContract(scene, {
    bundle: styles.CALL_ME_SENSEI_STYLE_BUNDLE,
    rendererBackend: 'webgpu',
    systemDomains: styles.STYLE_TARGET_DOMAINS.filter((domain) => domain !== 'natural.rock'),
  });
  assert.equal(report.type, styles.STYLE_SCENE_AUDIT_DOCUMENT_TYPE);
  assert.equal(report.version, 1);
  assert.equal(report.package.version, TOONLAB_VERSION);
  assert.equal(report.rendererBackend, 'webgpu');
  assert.equal(report.ok, true);
  assert.equal(report.readyToApply, true);
  assert.deepEqual(report.routes, [{
    domain: 'natural.rock',
    slot: 'rock',
    status: 'explicit',
    targetId: 'geology/hero-rock',
  }]);
  assert.deepEqual(report.exemptions, [{
    adapterId: 'studio:rock-v1',
    exemptionId: 'studio-rock-renderer',
    materialId: 'RockSurface',
    reason: 'The studio renderer supplies an equivalent supported rock path.',
    targetId: 'geology/hero-rock',
  }]);
  assert.equal(report.inferences.length, 0, 'the audit must never guess silently');
  const serialized = styles.serializeSceneStyleAudit(report, { pretty: true });
  assert.deepEqual(JSON.parse(serialized), report);
  assert.doesNotMatch(serialized, /"subject"/);

  rock.geometry.dispose();
  rock.material.dispose();
});

test('scene routing audit covers unsafe label, material, and bundle categories', () => {
  const scene = new THREE.Scene();

  const unlabeled = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ name: 'Unlabeled' }));
  unlabeled.name = 'UnlabeledProp';
  scene.add(unlabeled);

  const unknownDomain = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ name: 'Unknown' }));
  unknownDomain.userData.toonlab = {
    domain: 'environment',
    schemaVersion: 2,
    targetId: 'bad/unknown-domain',
  };
  scene.add(unknownDomain);

  const mixed = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ name: 'FlowerAtlas' }));
  mixed.userData.toonlab = {
    domain: 'vegetation.flower',
    materials: {
      assignments: { FlowerAtlas: { roles: ['flowerPetal', 'flowerCenter'] } },
      schemaVersion: 1,
    },
    schemaVersion: 2,
    targetId: 'bad/mixed-flower',
  };
  scene.add(mixed);

  const unknownRole = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ name: 'TreePart' }));
  unknownRole.userData.toonlab = {
    domain: 'vegetation.tree',
    materials: {
      assignments: { TreePart: { roles: ['environment'] } },
      schemaVersion: 1,
    },
    schemaVersion: 2,
    targetId: 'bad/unknown-role',
  };
  scene.add(unknownRole);

  const transparentRock = new THREE.Mesh(
    new THREE.BoxGeometry(),
    new THREE.MeshBasicMaterial({ name: 'RockSurface', opacity: 0.5, transparent: true }),
  );
  styles.labelStyleTarget(transparentRock, styles.createStyleTargetLabel('natural.rock', {
    materials: styles.createStyleMaterialContract('natural.rock', {
      assignments: { RockSurface: { roles: ['rock'] } },
    }),
    targetId: 'bad/transparent-rock',
  }));
  scene.add(transparentRock);

  const customRock = new THREE.Mesh(
    new THREE.BoxGeometry(),
    new THREE.ShaderMaterial({ name: 'CustomRock' }),
  );
  styles.labelStyleTarget(customRock, styles.createStyleTargetLabel('natural.rock', {
    materials: styles.createStyleMaterialContract('natural.rock', {
      assignments: { CustomRock: { roles: ['rock'] } },
    }),
    targetId: 'bad/custom-rock',
  }));
  scene.add(customRock);

  const tree = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ name: 'Leaves' }));
  styles.labelStyleTarget(tree, styles.createStyleTargetLabel('vegetation.tree', {
    targetId: 'bad/unassigned-tree',
  }));
  scene.add(tree);

  const partialBundle = styles.createStyleBundleDocument('partial-ground', {
    slots: { groundShader: { style: 'call_me_sensei' } },
  });
  const report = styles.auditSceneStyleContract(scene, { bundle: partialBundle });
  const codes = new Set(report.issues.map(({ code }) => code));
  for (const code of [
    'missing-root-domain',
    'unknown-domain',
    'mixed-material-mask-required',
    'missing-material-role',
    'unknown-material-role',
    'unsupported-transparent-material',
    'unsupported-custom-material',
    'missing-slot',
    'unused-bundle-slot',
  ]) {
    assert.equal(codes.has(code), true, `expected scene audit category ${code}`);
  }
  assert.equal(report.ok, false);
  assert.equal(report.readyToApply, false);
  assert.equal(report.issues.every(({ consequence, remediation }) => consequence && remediation), true);

  const contaminatedBundle = {
    ...partialBundle,
    slots: {
      rock: {
        assetId: 'catalog:rock-0303',
        style: 'call_me_sensei',
        timeOfDay: 'noon',
      },
    },
  };
  const contaminated = styles.auditSceneStyleContract(new THREE.Scene(), {
    bundle: contaminatedBundle,
  });
  const contaminatedCodes = new Set(contaminated.issues.map(({ code }) => code));
  assert.equal(contaminatedCodes.has('asset-preset-in-style-bundle'), true);
  assert.equal(contaminatedCodes.has('runtime-condition-in-style-bundle'), true);

  for (const object of [unlabeled, unknownDomain, mixed, unknownRole, transparentRock, customRock, tree]) {
    object.geometry.dispose();
    object.material.dispose();
  }
});

test('advisory scene audit reports proposals without claiming readiness', () => {
  const scene = new THREE.Scene();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ name: 'Source' }));
  scene.add(mesh);
  const report = styles.auditSceneStyleContract(scene, { mode: 'advisory' });
  assert.equal(report.ok, true);
  assert.equal(report.readyToApply, false);
  assert.equal(report.issues[0].code, 'missing-root-domain');
  assert.equal(report.issues[0].severity, 'warning');
  mesh.geometry.dispose();
  mesh.material.dispose();
});

test('package system-owned render roots are audited without fake style targets', () => {
  const scene = new THREE.Scene();
  const cloudLayer = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial());
  cloudLayer.userData.toonlabSystemOwner = {
    domain: 'cloud',
    systemId: 'toonlab/sky-system-clouds',
    version: 1,
  };
  scene.add(cloudLayer);
  const report = styles.auditSceneStyleContract(scene);
  assert.equal(report.readyToApply, true);
  assert.equal(report.targets.length, 0);
  assert.deepEqual(report.systems, [{
    domain: 'cloud',
    nodePath: 'Scene[0]/Mesh[0]',
    systemId: 'toonlab/sky-system-clouds',
  }]);
  cloudLayer.geometry.dispose();
  cloudLayer.material.dispose();
});

test('aggregate forest and compiled-tree factories emit deterministic style metadata', async () => {
  const forestLeafMap = new THREE.DataTexture(
    new Uint8Array([255, 255, 255, 255]),
    1,
    1,
  );
  forestLeafMap.needsUpdate = true;
  const forest = new vegetation.StylizedForest({
    placements: [{ seed: 7, x: 0, y: 0, z: 0 }],
    settings: { foliage: { leafMap: forestLeafMap } },
    styleTarget: { targetId: 'factory/forest' },
    variants: 1,
  });
  const forestScene = new THREE.Scene();
  forestScene.add(forest);
  const forestReport = styles.auditSceneStyleContract(forestScene, { mode: 'strict' });
  assert.equal(forestReport.ok, true, JSON.stringify(forestReport.issues, null, 2));
  assert.equal(forestReport.readyToApply, true, JSON.stringify(forestReport.issues, null, 2));
  assert.deepEqual(forestReport.targets.map(({ targetId }) => targetId), ['factory/forest']);
  assert.equal(forestReport.exemptions[0].adapterId, 'toonlab/stylized-forest');
  const forestTargets = styles.collectStyleTargets(forestScene).targets;
  const forestApplication = await styles.applyStyleBundle(
    styles.CALL_ME_SENSEI_STYLE_BUNDLE,
    { targets: forestTargets },
  );
  assert.equal(forestApplication.applied.length, 1);
  await forestApplication.revert();
  forest.dispose();
  forestLeafMap.dispose();

  const sourceLevels = [0, 1, 2, 3].map((level) => {
    const root = new THREE.Group();
    root.name = `LOD${level}`;
    const role = level < 2 ? (level === 0 ? 'bark' : 'leaf') : 'surface';
    const material = new THREE.MeshStandardMaterial({ name: `Compiled ${role}` });
    material.userData.treeMaterialRole = role;
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), material));
    return root;
  });
  const asset = {
    ditherMode: 'bayer',
    levels: sourceLevels,
    manifest: {
      bounds: { center: [0, 1, 0], radius: 2 },
      catalogId: 'test:compiled-tree',
      lods: [0, 1, 2, 3].map((level) => ({
        level,
        minScreenCoverage: [0.2, 0.1, 0.03, 0][level],
      })),
      surfaceLooks: [],
    },
  };
  const compiled = new vegetation.CompiledTreeInstance(asset, {
    styleTarget: { targetId: 'factory/compiled-tree' },
  });
  const compiledScene = new THREE.Scene();
  compiledScene.add(compiled);
  const compiledReport = styles.auditSceneStyleContract(compiledScene, { mode: 'strict' });
  assert.equal(compiledReport.ok, true, JSON.stringify(compiledReport.issues, null, 2));
  assert.equal(compiledReport.readyToApply, true, JSON.stringify(compiledReport.issues, null, 2));
  assert.deepEqual(compiledReport.targets.map(({ targetId }) => targetId), ['factory/compiled-tree']);
  compiled.dispose();
  sourceLevels.forEach((root) => root.traverse((object) => {
    object.geometry?.dispose?.();
    object.material?.dispose?.();
  }));
});

test('environment and auxiliary water factories declare package system ownership', () => {
  const scene = new THREE.Scene();
  const bounds = new THREE.Box3(
    new THREE.Vector3(-4, 0, -4),
    new THREE.Vector3(4, 4, 4),
  );
  const backdropTexture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  backdropTexture.needsUpdate = true;
  const sun = environment.createEnvironmentSunRig({ scene, environmentBox: bounds });
  const lamps = environment.createEnvironmentLampRig({ scene, environmentBox: bounds });
  const backdrop = environment.createEnvironmentBackdrop({
    environmentBox: bounds,
    scene,
    textures: backdropTexture,
  });
  const dust = environment.createEnvironmentDustMotes({ bounds, count: 2, scene });
  const splashes = new water.WaterSplashSystem({ dropletPoolSize: 2, sheetPoolSize: 2 });
  const breakers = new water.WaterBreakerSystem();
  const kelp = new water.WaterKelpField({ placements: [{ x: 0, y: 0, z: 0 }] });
  const rain = new water.WaterRain({ count: 2 });
  scene.add(splashes, breakers, kelp, rain);

  const report = styles.auditSceneStyleContract(scene, { mode: 'strict' });
  assert.equal(report.ok, true, JSON.stringify(report.issues, null, 2));
  assert.equal(report.readyToApply, true, JSON.stringify(report.issues, null, 2));
  assert.deepEqual(report.targets, []);
  assert.deepEqual(report.systems.map(({ systemId }) => systemId), [
    'toonlab/environment-backdrop',
    'toonlab/environment-dust-motes',
    'toonlab/environment-lamp-rig',
    'toonlab/environment-sun-rig',
    'toonlab/water-breaker-system',
    'toonlab/water-kelp-field',
    'toonlab/water-rain',
    'toonlab/water-splash-system',
  ]);

  sun.dispose();
  lamps.dispose();
  backdrop.dispose();
  dust.dispose();
  splashes.dispose();
  breakers.dispose();
  kelp.dispose();
  rain.dispose();
  backdropTexture.dispose();
});

test('public scene factories emit audit-ready labels and apply a bundle without host targets', async () => {
  const scene = new THREE.Scene();
  const ground = groundShader.createGroundShaderMesh({
    field: { splat: new Uint8Array([255, 0, 0, 0]), splatD: 1, splatW: 1 },
    geometry: new THREE.PlaneGeometry(2, 2),
    styleTarget: { targetId: 'factory/ground' },
  });
  const grass = new vegetation.StylizedGrassField({
    placements: [{ x: 0, y: 0, z: 0 }],
    styleTarget: { targetId: 'factory/grass' },
  });
  const grassClumps = new vegetation.StylizedGrassClumpField({
    placements: [{ x: 0, y: 0, z: 0 }],
    styleTarget: { targetId: 'factory/grass-clumps' },
  });
  const flowers = new vegetation.StylizedFlowerField({
    placements: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 1 }],
    seed: 812,
    styleTarget: { targetId: 'factory/flowers' },
  });
  const repeatFlowers = new vegetation.StylizedFlowerField({
    placements: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 1 }],
    seed: 812,
    styleTarget: { targetId: 'factory/flowers-repeat' },
  });
  assert.deepEqual(
    [...flowers.geometry.getAttribute('iInfo').array],
    [...repeatFlowers.geometry.getAttribute('iInfo').array],
    'identical flower-field inputs must produce identical instance attributes',
  );
  repeatFlowers.geometry.dispose();
  repeatFlowers.material.dispose();
  const leafMap = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  leafMap.needsUpdate = true;
  const tree = new vegetation.StylizedTree({
    foliage: { leafMap },
    styleTarget: { targetId: 'factory/tree' },
  });
  const bush = new vegetation.StylizedBush({
    foliage: { leafMap },
    styleTarget: { targetId: 'factory/bush' },
  });
  const flower = new vegetation.StylizedFlower({
    foliage: { leafMap },
    styleTarget: { targetId: 'factory/flower' },
  });
  const understory = new vegetation.StylizedUnderstory({
    groundCover: [{ x: 0, y: 0, z: 0 }],
    shrubs: [{ x: 1, y: 0, z: 1 }],
    styleTarget: { targetId: 'factory/understory' },
  });
  const contactShadows = new vegetation.StylizedContactShadowField({
    placements: [{ radius: 1, x: 0, y: 0, z: 0 }],
  });
  const lake = new water.WaterSurface({
    depth: 1,
    passes: false,
    segmentsPerMeter: 1,
    simulation: false,
    splashes: false,
    styleTarget: { targetId: 'factory/water' },
    width: 1,
  });
  const dome = new sky.StylizedSky({
    styleTarget: { targetId: 'factory/sky' },
  });
  const rockRuntime = rockgen.createRockLodObject(
    rockgen.createRockDocument({ preset: 'boulder', seed: 13 }),
    {
      planOptions: { maxResolution: 16 },
      styleTarget: { targetId: 'factory/rock' },
    },
  );
  scene.add(
    ground, grass, grassClumps, flowers, tree, bush, flower, understory,
    contactShadows, lake, dome, rockRuntime.lod,
  );

  const report = styles.auditSceneStyleContract(scene, { mode: 'strict' });
  assert.equal(report.ok, true, JSON.stringify(report.issues, null, 2));
  assert.equal(report.readyToApply, true, JSON.stringify(report.issues, null, 2));
  assert.deepEqual(report.targets.map(({ targetId }) => targetId), [
    'factory/bush',
    'factory/flower',
    'factory/flowers',
    'factory/grass',
    'factory/grass-clumps',
    'factory/ground',
    'factory/rock',
    'factory/sky',
    'factory/tree',
    'factory/understory',
    'factory/water',
  ]);
  assert.equal(report.systems.some(({ systemId }) => (
    systemId === 'toonlab/vegetation-contact-shadows'
  )), true);
  assert.equal(report.targets.every(({ materials }) => (
    materials.every(({ materialId }) => materialId)
  )), true);
  const discovery = styles.collectStyleTargets(scene);
  assert.equal(discovery.ok, true);
  const applied = await styles.applyStyleBundle(styles.CALL_ME_SENSEI_STYLE_BUNDLE, {
    targets: discovery.targets,
  });
  assert.equal(applied.applied.length, report.targets.length);

  ground.material.userData.toonlabGroundShader.splatTexture.dispose();
  ground.geometry.dispose();
  ground.material.dispose();
  grass.dispose();
  grassClumps.dispose();
  flowers.dispose();
  tree.dispose();
  bush.dispose();
  flower.dispose();
  understory.dispose();
  contactShadows.dispose();
  leafMap.dispose();
  lake.dispose();
  dome.dispose();
  rockRuntime.plan.levels.forEach((level) => level.geometry.dispose());
  if (rockRuntime.ownsSharedMaterial) rockRuntime.lod.levels[0].object.material.dispose();
});

test('custom adapters create explicit feedback gaps', () => {
  const audit = styles.auditStyleBundleApplication(
    styles.CALL_ME_SENSEI_STYLE_BUNDLE,
    [{
      adapter: { apply() {}, custom: true, id: 'studio-renderer' },
      domain: 'prop',
      id: 'custom-prop',
      subject: {},
    }],
  );
  assert.equal(audit.ok, true);
  assert.equal(audit.gaps.length, 1);
  assert.equal(audit.gaps[0].kind, 'custom-shader-adapter');
});

test('asset policy supports ask/advisory, strict, and open decisions', () => {
  const missing = assetPolicy.evaluateAssetCandidate(null, {
    domain: 'natural.rock',
    sourceClass: 'external-cc0',
  });
  assert.equal(missing.allowed, true);
  assert.equal(missing.decision, 'warn');
  assert.equal(missing.needsDeveloperDecision, true);

  const strict = assetPolicy.CALL_ME_SENSEI_STRICT_ASSET_POLICY;
  assert.equal(assetPolicy.evaluateAssetCandidate(strict, {
    domain: 'natural.rock', sourceClass: 'toonlab-gallery',
  }).allowed, true);
  assert.equal(assetPolicy.evaluateAssetCandidate(strict, {
    domain: 'natural.rock', sourceClass: 'procedural',
  }).allowed, false);
  assert.equal(assetPolicy.evaluateAssetCandidate(strict, {
    domain: 'vegetation.tree', sourceClass: 'procedural',
  }).allowed, true, 'the supported package BranchTree satisfies strict tree sourcing');

  const open = assetPolicy.createAssetSourcingPolicy('open-test', { mode: 'open' });
  assert.equal(assetPolicy.evaluateAssetCandidate(open, {
    domain: 'vegetation.tree', sourceClass: 'custom',
  }).allowed, true);
});

test('gap reports are machine and human readable', () => {
  const gap = assetPolicy.createAssetGapRecord({
    domain: 'cloud',
    feedbackNeeded: 'Add a supported cloud adapter.',
    id: 'custom-cloud',
    kind: 'custom-shader',
    reason: 'No supported renderer matched.',
  });
  const markdown = assetPolicy.renderAssetGapReport([gap]);
  assert.equal(gap.schema, assetPolicy.ASSET_GAP_DOCUMENT_TYPE);
  assert.match(markdown, /custom-cloud/);
  assert.match(markdown, /Add a supported cloud adapter/);
});

test('public ground and vegetation barrels contain no internal-reference API names', () => {
  for (const module of [groundShader, vegetation]) {
    assert.deepEqual(
      Object.keys(module).filter((name) => /p18/i.test(name)),
      [],
    );
  }
  assert.equal(typeof groundShader.createGroundShaderMaterial, 'function');
  assert.equal(typeof groundShader.applyGroundShader, 'function');
});

await Promise.all(pending);
console.log(`\nStyle contract verified: ${checks} groups.`);
