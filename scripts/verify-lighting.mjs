// Lighting contract verification: documents, presets, photometry helpers,
// deterministic runtime budgets, capability truthfulness, and ToonLab handoff.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';

import * as root from '../src/index.js';
import * as lighting from '../src/lighting/index.js';
import {
  shadowClipAdjustGL,
  shadowClipAdjustWebGPU,
} from '../src/shaders-tsl/chunks/pass-depth-color.js';
import { createLabLight, normalizeRecipe } from '../labs/lighting-lab/lightingApi.js';

let checks = 0;
function check(label, callback) {
  callback();
  checks += 1;
  console.log(`ok   ${label}`);
}

check('lighting API is public from the root export', () => {
  assert.equal(root.createLightingManager, lighting.createLightingManager);
  assert.equal(root.createLightingSystem, lighting.createLightingSystem);
  assert.equal(
    root.createCallMeSenseiSkyLightProbe,
    lighting.createCallMeSenseiSkyLightProbe,
  );
});

const packagedLighting = await import('@call-me-sensei/toonlab/lighting');
check('lighting package subpath is exported', () => {
  assert.equal(packagedLighting.createLightingSystem, lighting.createLightingSystem);
  assert.equal(
    packagedLighting.CALL_ME_SENSEI_LIGHTING_CONTRACT.id,
    'call-me-sensei-reference',
  );
  assert.equal(
    packagedLighting.CALL_ME_SENSEI_LIGHTING_CONTRACT.sun.intensity,
    8,
    'the shared daylight contract must preserve the accepted P18 white-sun calibration',
  );
});

check('the Call Me Sensei shadow contract projects each backend correctly', () => {
  assert.equal(shadowClipAdjustGL.elements[5], -1,
    'TSL WebGL TextureNode render targets must project into top-left logical UVs');
  assert.equal(shadowClipAdjustWebGPU.elements[5], -1,
    'native WebGPU render targets must flip into top-left texture orientation');
  assert.equal(
    lighting.CALL_ME_SENSEI_LIGHTING_CONTRACT.sun.shadow.bias,
    -0.0004,
    'the float depth-color pass needs the canonical receiver bias',
  );
  assert.equal(
    lighting.CALL_ME_SENSEI_LIGHTING_CONTRACT.sun.shadow.cameraFar,
    140,
    'the 60 m sun offset and 68 m coverage volume must fit inside the shadow depth range',
  );
  assert.equal(
    lighting.CALL_ME_SENSEI_LIGHTING_CONTRACT.sun.shadow.characterDepthBias,
    0.001,
    'skinned receivers need the package character depth guard',
  );
  assert.equal(
    lighting.CALL_ME_SENSEI_LIGHTING_CONTRACT.sun.shadow.normalBias,
    0.01,
    'the shared sun must use the character-safe receiver offset',
  );
  assert.equal(
    lighting.CALL_ME_SENSEI_LIGHTING_CONTRACT.sun.shadow.farExtent,
    110,
    'visible outdoor casters need a far coverage cascade beyond the character window',
  );
});

const environmentShadowPassSource = await readFile(
  new URL('../src/environment/environmentSunShadowPass.js', import.meta.url),
  'utf8',
);
const environmentShadowSamplerSource = await readFile(
  new URL('../src/shaders-tsl/chunks/environment-sun-shadow.js', import.meta.url),
  'utf8',
);
const characterShaderSource = await readFile(
  new URL('../src/shaders-tsl/character/characterMaterial.js', import.meta.url),
  'utf8',
);
check('the node-backend shadow pass separates environment and character receiver bias', () => {
  assert.match(
    environmentShadowPassSource,
    /environmentSunShadow\.normalBias\.value = Math\.max\(shadow\.normalBias \?\? 0, 0\)/,
  );
  assert.match(
    environmentShadowSamplerSource,
    /normalWorldGeometry,[\s\S]*?environmentSunShadow\.normalBias,[\s\S]*?environmentSunShadow\.bias,/,
  );
  assert.match(
    environmentShadowSamplerSource,
    /normalize\(receiverNormal\)\.mul\(normalBias\)/,
  );
  assert.match(
    characterShaderSource,
    /sampleEnvironmentSunShadowWithNormal\(\s*worldPosition,\s*geometryNormal\)/,
    'skinned characters must use the character-specific shared shadow sampler',
  );
  assert.match(
    environmentShadowSamplerSource,
    /receiverNormal,[\s\S]*?0\.0,[\s\S]*?environmentSunShadow\.bias\.sub\(environmentSunShadow\.characterDepthBias\)/,
    'character receivers must use a triangle-stable depth guard instead of normal-space bias',
  );
  assert.match(
    environmentShadowPassSource,
    /environmentSunShadow\.characterDepthBias\.value = Math\.max\([\s\S]*?shadow\.toonLabConstantDepthBias \?\? 0\.001/,
    'the active bundle sun must propagate its character receiver guard',
  );
  assert.doesNotMatch(
    environmentShadowSamplerSource,
    /normalBias: uniform\(0\.5\)/,
    'the old terrain-sized default must never return to shared receivers',
  );
});

check('new asynchronous casters receive one primary-material warmup frame', () => {
  assert.match(environmentShadowPassSource, /const warmedCasterSources = new WeakMap\(\)/);
  assert.match(environmentShadowPassSource, /if \(needsPrimaryRenderWarmup\) \{[\s\S]*?return;[\s\S]*?\}/);
});

check('the shared shadow pass preserves near detail and far scene coverage', () => {
  assert.match(environmentShadowPassSource, /EnvironmentSunShadow\.FarDepth/);
  assert.match(
    environmentShadowPassSource,
    /const farMapSize = mapSize/,
    'both WebGPU cascade targets must use one backend-safe attachment size',
  );
  assert.match(
    environmentShadowPassSource,
    /farFocusSnap = 2[\s\S]*?!farShadowMatrix\.equals\(lastFarRenderedMatrix\)/,
    'the far cascade must be stabilized and updated on movement, not continuously',
  );
  assert.match(environmentShadowPassSource, /farSunShadowMapNode\(\)\.value = farShadowTarget\.texture/);
  assert.match(environmentShadowSamplerSource, /near\.inside\.not\(\)\.and\(environmentSunShadow\.farReady\)/);
  assert.match(environmentShadowSamplerSource, /environmentSunShadow\.farMatrix/);
  assert.match(environmentShadowPassSource, /updateCasterCoverage\(\)/);
  assert.match(environmentShadowPassSource, /get casterCoverage\(\)/);
  assert.match(environmentShadowPassSource, /updateReceiverCoverage\(\)/);
  assert.match(environmentShadowPassSource, /get receiverCoverage\(\)/);
  assert.match(environmentShadowPassSource, /get ready\(\)/);
  assert.match(environmentShadowPassSource, /get renderCount\(\)/);
  assert.match(environmentShadowPassSource, /inspectDepthContent/);
});

check('all four reusable preset families are registered', () => {
  const options = lighting.getLightingPresetOptions();
  for (const kind of ['luminaire', 'rig', 'look', 'quality']) {
    assert.ok(options.some((option) => option.kind === kind), `missing ${kind}`);
  }
  assert.ok(lighting.getLightingPresetOptions('luminaire').length >= 6);
  assert.ok(lighting.getLightingPresetOptions('rig').length >= 4);
});

check('Lighting Lab normalization preserves advanced descriptor intent', () => {
  const light = createLabLight('spot', {
    artistic: { role: 'key' },
    color: { temperatureKelvin: 4200 },
    cookie: { uri: 'cookies/key.png' },
    ies: { uri: 'profiles/key.ies' },
    linking: { includeTags: ['hero'] },
  });
  assert.equal(light.artistic.role, 'key');
  assert.equal(light.color.temperatureKelvin, 4200);
  assert.equal(light.cookie.uri, 'cookies/key.png');
  assert.equal(light.ies.uri, 'profiles/key.ies');
  assert.deepEqual(light.linking.includeTags, ['hero']);
});

check('Lighting Lab keeps preset names, color temperature, and artistic roles', () => {
  const normalized = normalizeRecipe(lighting.resolveLightingRigPreset('three_point_character'));
  const key = normalized.lights.find((light) => light.id === 'key');
  assert.equal(key.name, 'Key');
  assert.equal(key.color.temperatureKelvin, 4800);
  assert.equal(key.artistic.role, 'key');
});

const spot = lighting.createSpotLightDescriptor({
  castShadow: true,
  cookie: { channel: 'r', uri: 'cookies/window.png' },
  ies: { key: 'ies/studio' },
  intensity: { unit: 'lumens', value: 1200 },
  layers: [2, 0, 2],
  linking: { excludeTags: ['ui'], includeTags: ['hero', 'hero'] },
  name: 'Window key',
  shadow: { enabled: true, mapSize: 1500 },
});

check('descriptors preserve cookies, IES, linking, layers, and shadow policy', () => {
  assert.equal(spot.type, 'spot');
  assert.equal(spot.cookie.uri, 'cookies/window.png');
  assert.equal(spot.ies.key, 'ies/studio');
  assert.deepEqual(spot.layers, [0, 2]);
  assert.deepEqual(spot.linking.includeTags, ['hero']);
  assert.equal(spot.shadow.mapSize, 2048);
  assert.equal(spot.castShadow, true);
});

check('disc and tube area intent remains first-class', () => {
  assert.equal(lighting.createDiscAreaLightDescriptor().type, 'discArea');
  assert.equal(lighting.createTubeAreaLightDescriptor().type, 'tubeArea');
  assert.equal(lighting.getLightingTypeCapability('discArea').areaRealization, 'rect-area-approximation');
});

check('validation reports both ok and valid', () => {
  const valid = lighting.validateLightDescriptor(spot);
  assert.equal(valid.ok, true);
  assert.equal(valid.valid, true);
  const invalid = lighting.validateLightDescriptor({ ...spot, type: 'laser' });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.length > 0);
});

check('physical-light helpers produce stable conversions', () => {
  assert.ok(Math.abs(lighting.lumensToCandela(Math.PI * 4) - 1) < 1e-10);
  assert.ok(Math.abs(lighting.candelaToLumens(1) - Math.PI * 4) < 1e-10);
  assert.equal(lighting.luxAtDistance(400, 2), 100);
  const warm = lighting.colorTemperatureToRgb(2000);
  assert.ok(warm[0] > warm[2]);
  assert.ok(lighting.resolveThreeLightIntensity('spot', spot.intensity, spot) > 0);
});

const recipe = lighting.createLightingRecipe({
  id: 'verification-rig',
  lights: [
    spot,
    { id: spot.id, intensity: { unit: 'lumens', value: 700 }, position: [2, 2, 0], type: 'point' },
    { castShadow: true, id: 'sun', intensity: { unit: 'lux', value: 3 }, shadow: { enabled: true }, type: 'directional' },
    { id: 'soft-disc', intensity: { unit: 'nits', value: 4 }, position: [0, 3, 2], type: 'discArea' },
  ],
  name: 'Verification Rig',
});

check('recipes normalize duplicate ids and round-trip as versioned JSON', () => {
  assert.deepEqual(recipe.lights.slice(0, 2).map((light) => light.id), ['window-key', 'window-key-2']);
  const json = lighting.serializeLightingRecipe(recipe, { pretty: true });
  assert.ok(json.includes('\n  "type"'));
  const restored = lighting.deserializeLightingRecipe(json);
  assert.deepEqual(restored, recipe);
  assert.equal(lighting.validateLightingRecipe(restored).ok, true);
});

check('lighting looks own a recipe, quality, environment, and post hints', () => {
  const look = lighting.resolveLightingLookPreset('golden_hour');
  assert.equal(look.type, lighting.LIGHTING_LOOK_DOCUMENT_TYPE);
  assert.equal(look.recipe.type, lighting.LIGHTING_RECIPE_DOCUMENT_TYPE);
  assert.equal(look.quality.id, 'high');
  assert.equal(lighting.deserializeLightingLook(lighting.serializeLightingLook(look)).id, look.id);
});

check('quality presets expose explicit deterministic budgets', () => {
  const mobile = lighting.resolveLightingQualityPreset('mobile');
  assert.equal(mobile.maxLights, 8);
  assert.equal(mobile.maxLightsByType.point, 4);
  assert.equal(mobile.maxShadowedLights, 1);
  assert.equal(mobile.allowAreaLights, false);
});

check('capability reports do not claim engine-native renderer features', () => {
  const report = lighting.createLightingCapabilityReport({ backend: 'webgpu' });
  assert.equal(report.backend, 'webgpu');
  assert.equal(report.features.manyLights, false);
  assert.equal(report.features.globalIllumination, false);
  assert.equal(report.features.manyLightRenderer, false);
  assert.equal(report.features.iesProfiles, 'metadata-only');
});

const toonlab = lighting.exportLightingRecipeToToonLab(recipe, {
  globalIllumination: 'prefer',
  manyLights: 'require',
});

check('ToonLab export preserves local-light Many Lights and Dynamic GI intent', () => {
  assert.equal(toonlab.platform.name, 'ToonLab');
  assert.equal(toonlab.rendererIntent.manyLights.intent, 'require');
  assert.equal(toonlab.rendererIntent.globalIllumination.intent, 'prefer');
  assert.equal(toonlab.lights.find((light) => light.toonlabType === 'spot').manyLights.eligibleIntent, true);
  assert.equal(toonlab.lights.find((light) => light.toonlabType === 'directional').manyLights.eligibleIntent, false);
  assert.deepEqual(lighting.threePositionToToonLab([1, 2, 3]), [-300, 100, 200]);
  assert.equal(JSON.parse(lighting.serializeToonLabLightingManifest(toonlab)).type, lighting.TOONLAB_LIGHTING_MANIFEST_TYPE);
});

const manyLights = lighting.createLightingRecipe({
  id: 'runtime-budget-test',
  lights: [
    { id: 'ambient', intensity: 0.15, type: 'ambient' },
    { castShadow: true, id: 'sun', priority: 100, shadow: { enabled: true, priority: 100 }, type: 'directional' },
    ...Array.from({ length: 10 }, (_, index) => ({
      castShadow: true,
      cookie: index === 0 ? { uri: 'cookie.png' } : null,
      id: `local-${index}`,
      intensity: { unit: 'lumens', value: 600 },
      maxDistance: 100,
      position: [index - 5, 2, 0],
      priority: 50 - index,
      shadow: { enabled: true, mapSize: 512, priority: 50 - index },
      type: index === 0 ? 'spot' : 'point',
    })),
    { id: 'area', position: [0, 3, 1], type: 'rectArea' },
  ],
  shadowPolicy: { maxShadowedLights: 12, maxShadowMapPixels: 64 * 1024 * 1024 },
});

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera();
const cookieTexture = new THREE.Texture();
const manager = lighting.createLightingManager({
  camera,
  quality: 'mobile',
  recipe: manyLights,
  scene,
  textureResolver: () => cookieTexture,
});

check('runtime manager realizes a scene-owned rig', () => {
  assert.equal(manager.group.parent, scene);
  assert.equal(manager.getLight('sun')?.isDirectionalLight, true);
  assert.equal(manager.getLight('local-0')?.isSpotLight, true);
});

check('mobile runtime caps total, per-type, area, and shadow selections', () => {
  const diagnostics = manager.getDiagnostics();
  assert.ok(diagnostics.activeLightCount <= 8);
  assert.ok(diagnostics.countsByType.point.active <= 4);
  assert.ok(diagnostics.shadowedLightCount <= 1);
  assert.equal(diagnostics.entries.find((entry) => entry.id === 'area').cullReason, 'area-lights-disabled');
});

check('runtime updates lights, quality, enable state, and shadow requests', () => {
  assert.equal(manager.setLightEnabled('local-0', false), true);
  assert.equal(manager.getDiagnostics().entries.find((entry) => entry.id === 'local-0').cullReason, 'disabled');
  manager.updateLight('local-1', { priority: 999 });
  assert.equal(manager.recipe.lights.find((light) => light.id === 'local-1').priority, 999);
  manager.setQuality('high');
  assert.equal(manager.quality.id, 'high');
  assert.ok(manager.requestShadowUpdate() >= 1);
});

await new Promise((resolve) => queueMicrotask(resolve));
check('spot cookie resolver state is diagnosed', () => {
  manager.setLightEnabled('local-0', true);
  manager.update();
  assert.equal(manager.getDiagnostics().entries.find((entry) => entry.id === 'local-0').cookieStatus, 'ready');
});

check('look application returns portable environment/post hints', () => {
  const hints = manager.applyLook('daylight');
  assert.equal(manager.recipe.id, 'outdoor-sun');
  assert.equal(manager.quality.id, 'balanced');
  assert.equal(hints.environment.timeOfDay, 14);
});

manager.dispose();
check('runtime manager disposes and detaches cleanly', () => {
  assert.equal(manager.group.parent, null);
  assert.equal(scene.children.includes(manager.group), false);
});

// ---------------------------------------------------------------------------
// Style + fixture + system + generator surface.

import { hashValue } from '../src/core/generation.js';

check('lighting styles register, resolve, sample, and round-trip as documents', () => {
  const options = lighting.getLightingStylePresetOptions();
  for (const id of ['storybook', 'call-me-sensei', 'golden-summer', 'overcast-pastel', 'neon-night']) {
    assert.ok(options.some((option) => option.id === id), `missing style ${id}`);
  }
  const style = lighting.resolveLightingStylePreset('call-me-sensei');
  const noon = lighting.sampleLightingStyle(style, 12);
  const night = lighting.sampleLightingStyle(style, 0);
  assert.ok(noon.sunIntensity > night.sunIntensity);
  assert.ok(night.fixtureScale > 1, 'fixtures must carry CMS nights');
  assert.ok(noon.exposure > 1, 'CMS daylight is high-key');
  const doc = lighting.createLightingStylePresetDocument('cms-copy', { label: 'Copy', settings: style });
  const parsed = lighting.parseLightingStylePresetDocument(lighting.serializeLightingStylePresetDocument(doc));
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.value.settings, doc.settings);
  assert.equal(lighting.validateLightingStylePresetDocument({ ...doc, version: 99 }).ok, false);
});

check('fixtures resolve deterministic seeded placements and round-trip', () => {
  const options = lighting.getLightFixtureOptions();
  for (const id of ['street-lamp', 'paper-lantern', 'window-glow', 'neon-sign', 'campfire', 'shrine-candle', 'cms-lantern', 'cms-city-neon', 'cms-street-lamp']) {
    assert.ok(options.some((option) => option.id === id), `missing fixture ${id}`);
  }
  const fixture = lighting.resolveLightFixture('cms-lantern');
  const a = lighting.resolveFixturePlacement(fixture, { position: [1, 2, 3], seed: 11 });
  const b = lighting.resolveFixturePlacement(fixture, { position: [1, 2, 3], seed: 11 });
  const c = lighting.resolveFixturePlacement(fixture, { position: [1, 2, 3], seed: 12 });
  assert.deepEqual(a.descriptor, b.descriptor);
  assert.notDeepEqual(a.descriptor, c.descriptor);
  assert.deepEqual(a.descriptor.position, [1, 2, 3]);
  const fixtureDoc = lighting.createLightFixtureDocument('cms-lantern-copy', { settings: fixture });
  const parsedFixture = lighting.parseLightFixtureDocument(lighting.serializeLightFixtureDocument(fixtureDoc));
  assert.equal(parsedFixture.ok, true);
  assert.deepEqual(parsedFixture.value.settings, fixtureDoc.settings);
});

check('custom styles and fixtures register without touching built-ins', () => {
  lighting.registerLightingStylePreset('verify-style', {
    settings: { dayCycle: [{ hour: 12, sunIntensity: 2 }] },
  }, { overwrite: true });
  assert.equal(lighting.resolveLightingStylePreset('verify-style').dayCycle.some((frame) => frame.sunIntensity === 2), true);
  lighting.registerLightFixture('verify-fixture', {
    settings: { base: { type: 'spot' }, variation: { intensityScale: { $type: 'range', max: 2, min: 1 } } },
  }, { overwrite: true });
  assert.equal(lighting.resolveLightFixture('verify-fixture').base.type, 'spot');
  assert.throws(() => lighting.registerLightFixture('verify-fixture', {}));
});

check('style generator: 10k seeds resolve deterministic and diverse', () => {
  const signatures = new Set();
  for (let seedValue = 1; seedValue <= 10_000; seedValue += 1) {
    const settings = lighting.resolveLightingStyleGeneratorRecipe(
      lighting.createLightingStyleGeneratorRecipe('sweep', { family: 'call-me-sensei', seed: seedValue }),
    );
    signatures.add(hashValue(settings));
  }
  assert.ok(signatures.size > 9_900, `style diversity too low: ${signatures.size}`);
  const recipe = lighting.createLightingStyleGeneratorRecipe('repeat', { seed: 77 });
  assert.equal(hashValue(lighting.resolveLightingStyleGeneratorRecipe(recipe)), hashValue(lighting.resolveLightingStyleGeneratorRecipe(recipe)));
});

check('fixture generator: 10k seeds resolve deterministic and diverse', () => {
  const signatures = new Set();
  for (let seedValue = 1; seedValue <= 10_000; seedValue += 1) {
    const settings = lighting.resolveLightFixtureGeneratorRecipe(
      lighting.createLightFixtureGeneratorRecipe('sweep', { family: 'cms-practical', seed: seedValue }),
    );
    signatures.add(hashValue(settings));
  }
  assert.ok(signatures.size > 9_900, `fixture diversity too low: ${signatures.size}`);
});

check('generator recipes respect locks and round-trip', () => {
  const locked = lighting.createLightingStyleGeneratorRecipe('locked', {
    configuration: { sun: { dayKelvin: 5555 } },
    locks: ['sun.dayKelvin'],
    seed: 3,
  });
  const resolvedA = lighting.resolveLightingStyleGeneratorRecipe(locked);
  const resolvedB = lighting.resolveLightingStyleGeneratorRecipe({ ...locked, seed: 4 });
  const kelvinOf = (settings) => settings.dayCycle.find((frame) => frame.fixtureScale === 0);
  assert.notEqual(hashValue(resolvedA), hashValue(resolvedB), 'unlocked leaves must still vary');
  assert.deepEqual(kelvinOf(resolvedA).sunColor, kelvinOf(resolvedB).sunColor, 'locked kelvin must not vary');
  const parsed = lighting.parseLightingStyleGeneratorRecipe(lighting.serializeLightingStyleGeneratorRecipe(locked));
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.value.locks, ['sun.dayKelvin']);
});

const systemScene = new THREE.Scene();
systemScene.fog = new THREE.Fog(0x8899aa, 5, 80);
const systemBaseFog = systemScene.fog.color.clone();
const observedRockSkyColors = [];
const rockSceneMaterial = new THREE.MeshBasicMaterial();
rockSceneMaterial.userData.toonLabRockSceneState = {
  setSkyColor(value) {
    observedRockSkyColors.push([...value]);
  },
};
const rockSceneMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), rockSceneMaterial);
systemScene.add(rockSceneMesh);
const system = lighting.createLightingSystem({
  camera, scene: systemScene, style: 'call-me-sensei', timeOfDay: 21,
});
system.attach({ driveSunPosition: true, fog: systemScene.fog });

check('lighting system owns sun, ambient, and fog through the day cycle', () => {
  const sun = system.manager.group.children.find((child) => child.isDirectionalLight);
  assert.ok(sun);
  assert.equal(sun.castShadow, true);
  assert.equal(sun.shadow.normalBias, 0.01);
  assert.equal(sun.shadow.toonLabConstantDepthBias, 0.001);
  assert.equal(sun.shadow.camera.left, -lighting.CALL_ME_SENSEI_LIGHTING_CONTRACT.sun.shadow.cameraExtent);
  assert.equal(sun.shadow.camera.right, lighting.CALL_ME_SENSEI_LIGHTING_CONTRACT.sun.shadow.cameraExtent);
  camera.position.set(14, 4, 16);
  camera.lookAt(14, 0, 0);
  camera.updateMatrixWorld();
  system.update(0.016, camera);
  assert.ok(Math.abs(sun.target.position.x) > 1, 'the default outdoor shadow window follows the camera');
  assert.ok(system.manager.group.children.some((child) => child.isAmbientLight));
  assert.ok(system.manager.group.children.some((child) => child.isLightProbe));
  assert.equal(system.skyLightProbe.visible, true);
  assert.equal(system.skyLightProbe.userData.callMeSenseiLighting.baseSh.isSphericalHarmonics3, true);
  const nightFog = systemScene.fog.color.clone();
  system.setTimeOfDay(12);
  assert.equal(systemScene.fog.color.equals(nightFog), false, 'fog must follow the cycle');
  system.setTimeOfDay(18);
  assert.deepEqual(observedRockSkyColors.at(-1), [1, 0.5, 0.32000000000000006]);
  system.setTimeOfDay(21);
});

check('placed fixtures vary by seed, follow schedules, and update in place', () => {
  const lampA = system.place('cms-street-lamp', [4, 0, 2]);
  const lampB = system.place('cms-street-lamp', [8, 0, 2]);
  assert.notEqual(lampA.light.color.getHexString(), lampB.light.color.getHexString(), 'seeded variation');
  const nightIntensity = lampA.light.intensity;
  assert.ok(nightIntensity > 0);
  system.setTimeOfDay(12);
  assert.ok(lampA.light.intensity < nightIntensity, 'night fixture dims at noon');
  system.setTimeOfDay(21);
  const lightBefore = lampA.light;
  lampA.set({ position: [5, 0, 2] });
  assert.equal(system.manager.getLight(lampA.id), lightBefore, 'same-type edits must not recreate the light');
  assert.equal(lightBefore.position.x, 5);
  system.update(0.016, camera);
  const first = lampA.light.intensity;
  system.update(0.016, camera);
  assert.notEqual(lampA.light.intensity, first, 'flicker animates');
});

check('overlays blend adjustments and their fixtures in and out', () => {
  const overlayId = system.applyOverlay({
    adjustments: { ambientScale: 1.5, exposureScale: 1.2 },
    fixtures: [{ fixture: 'shrine-candle', position: [0, 1, 0] }],
    id: 'verify-overlay',
  }, { blendSeconds: 0.1 });
  for (let step = 0; step < 12; step += 1) system.update(0.016, camera);
  assert.equal(system.stats().overlayCount, 1);
  assert.equal(system.stats().placementsByFixture['shrine-candle'], 1);
  system.removeOverlay(overlayId, { blendSeconds: 0.05 });
  for (let step = 0; step < 12; step += 1) system.update(0.016, camera);
  assert.equal(system.stats().overlayCount, 0);
  assert.equal(system.stats().placementsByFixture['shrine-candle'] ?? 0, 0);
});

const areaPlacement = system.place('cms-city-neon', [2, 3, 0]);
system.update(0.016, camera);
await lighting.ensureAreaLightSupport();
system.update(0.016, camera);

check('area-light fixtures activate once LTC textures load instead of crashing', () => {
  assert.equal(lighting.getAreaLightSupportState(), 'ready');
  const entry = system.getDiagnostics().entries.find((candidate) => candidate.id === areaPlacement.id);
  assert.equal(entry.active, true, `neon should be active, got ${entry.cullReason}`);
});

check('system serializes, resets, and disposes with state restoration', () => {
  const snapshot = system.toJSON();
  assert.ok(snapshot.placements.length >= 3);
  assert.equal(snapshot.timeOfDay, 21);
  assert.ok(Array.isArray(snapshot.style.dayCycle));
  system.setWeatherModulation({ fogColorTint: [0.5, 0.5, 0.5], sunIntensityScale: 0.4 });
  system.reset();
  assert.equal(system.stats().placementCount, 0);
  system.dispose();
  rockSceneMesh.geometry.dispose();
  rockSceneMaterial.dispose();
  assert.equal(systemScene.fog.color.equals(systemBaseFog), true, 'dispose must restore fog');
  assert.equal(system.manager.group.parent, null);
});

check('the style day cycle drives an attached sky dome and restores it', () => {
  const style = lighting.resolveLightingStylePreset('call-me-sensei');
  const noon = lighting.sampleLightingStyle(style, 12);
  const night = lighting.sampleLightingStyle(style, 0);
  assert.ok(night.starsStrength > 0.5, 'CMS nights must be starry');
  assert.equal(noon.starsStrength, 0, 'CMS noon has no stars');
  assert.ok(noon.skyZenithColor[2] > night.skyZenithColor[2], 'noon zenith is bluer/brighter than night');
  const generated = lighting.resolveLightingStyleGeneratorRecipe(
    lighting.createLightingStyleGeneratorRecipe('sky-check', { seed: 5 }),
  );
  assert.ok(generated.dayCycle.every((frame) => Array.isArray(frame.sky.zenith)), 'generated styles carry sky palettes');

  const fakeSky = {
    applySettings(options) { Object.assign(this.settings, options); return this.settings; },
    settings: { cloudCoverage: 0.5, horizonColor: [9, 9, 9], starsStrength: 9, sunColor: [9, 9, 9], sunDirection: [9, 9, 9], zenithColor: [9, 9, 9] },
  };
  const skyScene = new THREE.Scene();
  const skySystem = lighting.createLightingSystem({ scene: skyScene, style: 'call-me-sensei', timeOfDay: 0 });
  skySystem.attach({ driveSunPosition: true, sky: fakeSky });
  assert.ok(fakeSky.settings.starsStrength > 0.5, 'attached sky follows the night frame');
  skySystem.setTimeOfDay(12);
  assert.equal(fakeSky.settings.starsStrength, 0, 'attached sky follows the noon frame');
  skySystem.dispose();
  assert.equal(fakeSky.settings.starsStrength, 9, 'dispose restores captured sky settings');
  assert.equal(fakeSky.settings.cloudCoverage, 0.5, 'undriven sky fields are never touched');
});

check('world sun input and environment tint ownership restore cleanly on detach', () => {
  const environmentRoot = new THREE.Group();
  const environmentObject = new THREE.Object3D();
  const environmentMaterial = {
    uniforms: {
      heightFogColor: { value: new THREE.Color(0.11, 0.22, 0.33) },
      skyGroundTint: { value: new THREE.Color(0.44, 0.55, 0.66) },
      skyTopTint: { value: new THREE.Color(0.77, 0.88, 0.99) },
    },
    userData: { environmentMaterial: true },
  };
  environmentObject.isMesh = true;
  environmentObject.material = environmentMaterial;
  environmentRoot.add(environmentObject);
  const originalEnvironment = Object.fromEntries(
    Object.entries(environmentMaterial.uniforms).map(([key, entry]) => [key, entry.value.clone()]),
  );
  const originalSun = {
    color: [0.91, 0.82, 0.73],
    direction: [0.2, 0.9, 0.1],
    sky: [0.31, 0.42, 0.63],
  };
  let worldSun = structuredClone(originalSun);
  const scene = new THREE.Scene();
  const fog = new THREE.Fog(0xabcdef, 10, 100);
  scene.fog = fog;
  const owner = lighting.createLightingSystem({ scene, style: 'call-me-sensei', timeOfDay: 12 });
  owner.attach({
    environmentRoot,
    fog,
    getSun: () => worldSun,
    getSunDirection: () => worldSun.direction,
    setSun: (next) => { worldSun = structuredClone(next); },
    setSunDirection: (direction) => { worldSun.direction = [...direction]; },
  });
  const rainFog = [0.2, 0.3, 0.4];
  owner.setWeatherModulation({ fogColorOverride: rainFog });
  assert.deepEqual(environmentMaterial.uniforms.heightFogColor.value.toArray(), rainFog,
    'terrain height fog must use the same effective Weather color as scene fog');
  assert.deepEqual(worldSun.color, owner.frame.sunColor, 'world vegetation receives the Lighting sun color');
  assert.deepEqual(worldSun.sky, owner.frame.skyHorizonColor, 'world vegetation receives the Lighting sky fill');
  owner.detach();
  assert.deepEqual(worldSun, originalSun, 'detaching restores every world sun input');
  for (const [key, color] of Object.entries(originalEnvironment)) {
    assert.ok(environmentMaterial.uniforms[key].value.equals(color), `${key} must restore on detach`);
  }
  owner.dispose();
});

check('the environment sun rig applies a true direction in non-square worlds', () => {
  const scene = new THREE.Scene();
  const environmentBox = new THREE.Box3(
    new THREE.Vector3(-1000, -5, -40),
    new THREE.Vector3(1000, 25, 40),
  );
  const rig = root.createEnvironmentSunRig({
    accents: {
      beam: { enabled: false },
      disk: { enabled: false },
      shaft: { enabled: false },
      spill: { enabled: false },
    },
    environmentBox,
    scene,
    shadow: { enabled: false },
  });
  const requested = new THREE.Vector3(0.12, 0.24, 0.96).normalize();
  assert.equal(rig.light.intensity, Math.PI,
    'one environment sun must compensate the ToonLab surface PI normalization');
  rig.setDirection(requested);
  const actual = rig.light.position.clone().sub(rig.light.target.position).normalize();
  assert.ok(actual.distanceTo(requested) < 1e-10,
    'direction must not be distorted by environment-box aspect ratio');
  rig.dispose();
});

check('the lighting system surface is public and package-owned', () => {
  assert.equal(typeof lighting.createLightingSystem, 'function');
  assert.equal(typeof lighting.resolveFixturePlacement, 'function');
  assert.equal(typeof lighting.resolveLightingStyleGeneratorRecipe, 'function');
  assert.equal(root.createLightingSystem, lighting.createLightingSystem);
  assert.equal(root.resolveFixturePlacement, lighting.resolveFixturePlacement);
  assert.equal(
    root.resolveLightingStyleGeneratorRecipe,
    lighting.resolveLightingStyleGeneratorRecipe,
  );
});

console.log(`\nverify-lighting: ${checks} checks passed`);
