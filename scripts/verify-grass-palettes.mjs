import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';

import {
  DEFAULT_GRASS_SETTINGS,
  GRASS_COLOR_PALETTES,
  applyGrassColorPalette,
  createGrassSettings,
  getGrassPresetOptions,
  matchGrassColorPalette,
  parseGrassPresetDocument,
  registerGrassPreset,
  resolveGrassColorPalette,
} from '../src/vegetation/stylizedGrass.js';
import {
  GRASS_CLUMP_LODS,
  RetainedGrassClumpField,
  StylizedGrassClumpField,
  createGrassClumpGeometry,
} from '../src/vegetation/grassClump.js';
import { resolveVegetationShaderPreset } from '../src/vegetation/vegetationShaders.js';

assert.ok(GRASS_COLOR_PALETTES.length >= 8, 'grass must ship a useful palette range');
assert.equal(new Set(GRASS_COLOR_PALETTES.map((entry) => entry.id)).size,
  GRASS_COLOR_PALETTES.length, 'grass palette ids must be unique');

for (const palette of GRASS_COLOR_PALETTES) {
  assert.ok(palette.id && palette.label && palette.description,
    'every grass palette needs stable identity and user-facing copy');
  for (const key of ['baseColor', 'tipColor', 'shadowTint']) {
    assert.equal(palette[key].length, 3, `${palette.id}.${key} must be an RGB triplet`);
    assert.ok(palette[key].every((channel) => Number.isFinite(channel)
      && channel >= 0 && channel <= 1), `${palette.id}.${key} must contain sRGB channels`);
  }
}

const defaults = createGrassSettings();
assert.equal(matchGrassColorPalette(defaults)?.id, 'sensei_meadow',
  'the studio-default grass colors should identify the matching palette');
const authoredSrgb = [128 / 255, 192 / 255, 64 / 255];
for (const input of [0x80c040, '#80c040', new THREE.Color('#80c040')]) {
  const resolvedColor = createGrassSettings({ baseColor: input }).baseColor;
  assert.ok(resolvedColor.every((channel, index) => (
    Math.abs(channel - authoredSrgb[index]) < 1e-5
  )), 'grass number/string/THREE.Color inputs must preserve the documented sRGB value');
}
assert.deepEqual(createGrassSettings({ baseColor: authoredSrgb }).baseColor, authoredSrgb,
  'grass array colors must remain authored sRGB triplets');

const clumpSettings = createGrassSettings({ preset: 'call_me_sensei_clump' });
assert.equal(clumpSettings.bladesPerClump, 40,
  'the first-party paint unit must be a composed 40-blade meadow clump');
assert.equal(clumpSettings.groundAdoptStrength, 1,
  'painted clumps must opt into P18-style ground-color adoption');
assert.deepEqual(clumpSettings.groundAdoptTint, [1, 1, 1],
  'the default meadow must adopt sampled ground color without whitening its roots');
assert.equal(clumpSettings.leanStrength, 0.24,
  'the meadow preset must keep blades upright instead of producing tangled patches');
assert.equal(clumpSettings.washLift, 0.68,
  'the meadow preset must retain the bright watercolor lift established by the parity lab');
assert.equal(clumpSettings.washOpacity, 0.82,
  'the meadow preset must layer translucent strokes instead of opaque dirty cutouts');
const callMeSenseiGrassShader = resolveVegetationShaderPreset('call_me_sensei').grass;
assert.equal(callMeSenseiGrassShader.tipHueShift, 0,
  'the Call Me Sensei default must not rotate green ground toward yellow');
assert.equal(callMeSenseiGrassShader.tipDesaturation, 0,
  'the Call Me Sensei default must preserve the saturation relationship of the sampled ground');
assert.ok(getGrassPresetOptions().some((option) => option.id === 'call_me_sensei_clump'));

const expectedClumpTriangles = [280, 98, 42];
for (const profile of GRASS_CLUMP_LODS) {
  const geometry = createGrassClumpGeometry({ lod: profile.level });
  assert.equal(geometry.userData.grassClump.triangleCount, expectedClumpTriangles[profile.level]);
  assert.ok(Math.abs(geometry.userData.grassClump.effectiveCoverageRatio - 1) <= 0.12,
    `LOD${profile.level} must preserve integrated blade coverage across camera distance`);
  assert.equal(geometry.getAttribute('aBladeOrigin').count, geometry.getAttribute('position').count);
  assert.equal(geometry.getAttribute('aBladeInfo').count, geometry.getAttribute('position').count);
  assert.ok(Array.from(geometry.getAttribute('normal').array)
    .every((component, index) => index % 3 === 1 ? component === 1 : component === 0),
  'clump blades must use the stable upward-authored foliage normal');
  geometry.dispose();
}

const clumpField = new StylizedGrassClumpField({
  frustumCulling: false,
  placements: [
    { forward: [1, 0, 0], normal: [0, Math.SQRT1_2, Math.SQRT1_2], x: 0, y: 0, z: 0 },
    { x: 60, y: 0, z: 0 },
    { x: 75, y: 0, z: 0 },
    { x: 90, y: 0, z: 0 },
  ],
});

for (const mesh of clumpField.lodMeshes) {
  const buffers = new Set(Object.values(mesh.geometry.attributes).map((attribute) => (
    attribute.isInterleavedBufferAttribute ? attribute.data : attribute
  )));
  assert.equal(buffers.size, 6,
    'Call Me Sensei clumps must stay below WebGPU\'s eight-vertex-buffer guarantee');
  assert.equal(mesh.geometry.userData.grassClump.vertexBufferCount, 6);
  const instanceAttributes = [
    mesh.geometry.getAttribute('iOrigin'),
    mesh.geometry.getAttribute('iClump'),
    mesh.geometry.getAttribute('iSurfaceNormal'),
    mesh.geometry.getAttribute('iSurfaceForward'),
  ];
  assert.ok(instanceAttributes.every((attribute) => attribute.isInterleavedBufferAttribute));
  assert.equal(new Set(instanceAttributes.map((attribute) => attribute.data)).size, 1,
    'all per-clump attributes must share one instanced buffer');
}
const lodCamera = new THREE.PerspectiveCamera();
for (let frame = 0; frame < 4; frame += 1) clumpField.update(0.1, lodCamera);
assert.deepEqual(clumpField.lodMeshes.map((mesh) => mesh.geometry.instanceCount), [1, 1, 2],
  'clump records must move through near/mid/far LOD pools without an implicit hard cull');
const retainedSurfaceNormalAttribute = clumpField.lodMeshes[0].geometry
  .getAttribute('iSurfaceNormal');
const retainedSurfaceNormal = [
  retainedSurfaceNormalAttribute.getX(0),
  retainedSurfaceNormalAttribute.getY(0),
  retainedSurfaceNormalAttribute.getZ(0),
];
assert.ok(retainedSurfaceNormal.every((value, index) =>
  Math.abs(value - [0, Math.SQRT1_2, Math.SQRT1_2][index]) < 1e-6),
'clump instances must retain normalized terrain alignment for P18-style placement');
const retainedSurfaceForwardAttribute = clumpField.lodMeshes[0].geometry
  .getAttribute('iSurfaceForward');
const retainedSurfaceForward = [
  retainedSurfaceForwardAttribute.getX(0),
  retainedSurfaceForwardAttribute.getY(0),
  retainedSurfaceForwardAttribute.getZ(0),
];
assert.ok(Math.abs(retainedSurfaceForward[0] - 1) < 1e-6
  && Math.abs(retainedSurfaceForward[1]) < 1e-6
  && Math.abs(retainedSurfaceForward[2]) < 1e-6,
'clump instances must retain a tangent forward axis for source-mesh transform parity');
assert.ok(clumpField.lodMeshes.every((mesh) =>
  mesh.material.userData.grassClump.groundColor.includes('ground field')));
assert.ok(clumpField.lodMeshes.every((mesh) => mesh.material.transparent),
  'the watercolor meadow preset must enable alpha blending on every LOD material');
clumpField.setSun({ color: '#80c040' });
const expectedSunLinear = new THREE.Color('#80c040');
assert.ok(clumpField.lodMeshes.every((mesh) => (
  ['r', 'g', 'b'].every((channel) => Math.abs(
    mesh.material.uniforms.uSunColor.value[channel] - expectedSunLinear[channel]
  ) < 1e-5)
)), 'clump live color setters must decode sRGB strings exactly once');
clumpField.setDistanceFade({ start: 70, end: 80 });
clumpField.updateLods(lodCamera);
assert.deepEqual(clumpField.lodMeshes.map((mesh) => mesh.geometry.instanceCount), [1, 1, 1],
  'the terminal LOD must stop submitting clumps after the shader fade is fully transparent');
assert.equal(clumpField.cullingStats.distanceCulledInstances, 1,
  'fog-hidden clumps must be reported as distance culled instead of silently drawn');
clumpField.dispose();

const cullingCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
cullingCamera.lookAt(0, 0, -1);
cullingCamera.updateProjectionMatrix();
cullingCamera.updateMatrixWorld(true);
const culledClumpField = new StylizedGrassClumpField({
  chunkSize: 4,
  cullPadding: 0,
  placements: [
    { x: 0, y: 0, z: -10 },
    { x: 0, y: 0, z: 10 },
    { x: 25, y: 0, z: -10 },
  ],
});
culledClumpField.updateLods(cullingCamera);
assert.deepEqual(
  culledClumpField.lodMeshes.map((mesh) => mesh.geometry.instanceCount),
  [1, 0, 0],
  'the package field must compact only camera-visible clumps into its three LOD buffers',
);
assert.equal(culledClumpField.cullingStats.visibleInstances, 1);
assert.equal(culledClumpField.cullingStats.culledInstances, 2);
assert.ok(culledClumpField.cullingStats.totalChunks >= 3,
  'large fields must be divided into spatial chunks before per-instance visibility tests');
assert.ok(culledClumpField.lodMeshes.every((mesh) => mesh.frustumCulled),
  'grass LOD meshes must retain normal renderer frustum culling as a final safety net');
assert.ok(culledClumpField.lodMeshes[0].geometry.boundingSphere.radius < 10,
  'visible grass bounds must describe submitted records instead of using a world-sized sentinel');
culledClumpField.dispose();

const retainedGeometries = expectedClumpTriangles.map((triangleCount, level) => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0,
    0.1, 0, 0,
    0, 0.3, 0,
  ], 3));
  geometry.setIndex([0, 1, 2]);
  geometry.userData.grassClump = { bladeCount: 40, level, triangleCount };
  return geometry;
});
const retainedMaterial = new THREE.MeshBasicMaterial();
const retainedField = new RetainedGrassClumpField({
  geometryLods: retainedGeometries,
  materials: retainedMaterial,
  placements: [{ matrix: new THREE.Matrix4().makeTranslation(2, 0, 0) }],
});
assert.equal(retainedField.lodMeshes[0].count, 1,
  'authored SM/MI packs must retain one paint record as one clump instance');
assert.deepEqual(Array.from(retainedField.lodMeshes[0].instanceMatrix.array.slice(12, 15)), [2, 0, 0],
  'authored clump fields must preserve supplied instance matrices exactly');
retainedField.dispose();
const retainedCulledField = new RetainedGrassClumpField({
  chunkSize: 2,
  cullPadding: 0,
  geometryLods: retainedGeometries,
  materials: retainedMaterial,
  placements: [
    { matrix: new THREE.Matrix4().makeTranslation(0, 0, -5) },
    { matrix: new THREE.Matrix4().makeTranslation(0, 0, 5) },
  ],
});
retainedCulledField.updateLods(cullingCamera);
assert.equal(retainedCulledField.lodMeshes.reduce((sum, mesh) => sum + mesh.count, 0), 1,
  'caller-authored clump packs must receive the same package-default spatial culling');
assert.equal(retainedCulledField.cullingStats.culledInstances, 1);
retainedCulledField.dispose();
retainedGeometries.forEach((geometry) => geometry.dispose());
retainedMaterial.dispose();

const original = createGrassSettings({
  cloudShadowStrength: 0.73,
  shadowStrength: 0.41,
  windResponse: 1.6,
  windStrength: 0.27,
});
const palette = resolveGrassColorPalette('wisteria');
assert.ok(palette, 'the fantasy purple palette must resolve');
const painted = createGrassSettings(applyGrassColorPalette(original, palette));
assert.equal(matchGrassColorPalette(painted)?.id, palette.id);
assert.deepEqual(painted.baseColor, [...palette.baseColor]);
assert.deepEqual(painted.tipColor, [...palette.tipColor]);
assert.deepEqual(painted.shadowTint, [...palette.shadowTint]);
assert.equal(painted.shadowStrength, original.shadowStrength,
  'a color palette must not change scene-shadow response');
assert.equal(painted.cloudShadowStrength, original.cloudShadowStrength,
  'a color palette must not change world cloud-shadow state');
assert.equal(painted.windResponse, original.windResponse,
  'a color palette must not change asset motion response');
assert.equal(painted.windStrength, original.windStrength,
  'a color palette helper must not change current world wind');
assert.notEqual(painted.baseColor, palette.baseColor, 'applied colors must be copied');

const customShadow = { ...painted, shadowTint: [...DEFAULT_GRASS_SETTINGS.shadowTint] };
assert.equal(matchGrassColorPalette(customShadow), null,
  'editing the shadow tone must clear a palette whose full trio no longer matches');
assert.throws(() => applyGrassColorPalette(original, 'missing-palette'), /Unknown grass color palette/);

const storage = new Map();
globalThis.window = {
  localStorage: {
    getItem: (key) => storage.get(key) ?? null,
    removeItem: (key) => storage.delete(key),
    setItem: (key, value) => storage.set(key, String(value)),
  },
  location: { search: '' },
};

const { createGrassLabStore } = await import('../labs/grass-lab/ui/store.js');
const sceneKeys = [
  'cloudShadowCoverage',
  'cloudShadowScale',
  'cloudShadowStrength',
  'cloudShadowVelocity',
  'gustFrequency',
  'gustSpeed',
  'pushRadius',
  'skyColor',
  'sunColor',
  'sunDirection',
  'windDirection',
  'windSpeed',
  'windStrength',
];

const lab = createGrassLabStore({ urlParams: new URLSearchParams() });
assert.equal(lab.getState().presetId, 'call_me_sensei_clump',
  'a fresh Grass Lab document must open the canonical first-party clump preset');
for (const key of sceneKeys) {
  assert.equal(key in lab.getState().settings, false,
    `Grass Lab document state must exclude current-scene ${key}`);
}

const revisionBeforeView = lab.getState().docRevision;
lab.actions.setView({
  cloudShadowStrength: 0.67,
  pushRadius: 1.8,
  windStrength: 0.41,
});
assert.equal(lab.getState().docRevision, revisionBeforeView,
  'preview weather/interaction must not create a document revision');
assert.equal(lab.getState().canUndo, false,
  'preview weather/interaction must not enter undo history');
assert.equal(storage.has('toonlab.grassLab.document.v1'), false,
  'preview weather/interaction must not create a saved draft');

lab.actions.setSetting('windResponse', 1.9);
const savedDraft = JSON.parse(storage.get('toonlab.grassLab.document.v1'));
assert.equal(savedDraft.settings.windResponse, 1.9);
assert.equal('view' in savedDraft, false);
for (const key of sceneKeys) assert.equal(key in savedDraft.settings, false);

const exported = parseGrassPresetDocument(lab.actions.exportDocument());
assert.equal(exported.ok, true, exported.errors.join(' '));
for (const key of sceneKeys) assert.equal(key in exported.value.settings, false);

lab.actions.undo();
assert.equal(lab.getState().settings.windResponse, clumpSettings.windResponse,
  'undo must restore the canonical first-party clump preset value');
assert.equal(lab.getState().view.windStrength, 0.41,
  'undoing authored settings must not reset current scene wind');
assert.equal(lab.getState().view.cloudShadowStrength, 0.67,
  'undoing authored settings must not reset current cloud state');
assert.equal(lab.getState().view.pushRadius, 1.8,
  'undoing authored settings must not reset interaction state');

registerGrassPreset('deep_link_grass', {
  label: 'Deep Link Grass',
  settings: { windResponse: 2.4 },
});
const deepLinkedLab = createGrassLabStore({
  urlParams: new URLSearchParams('grassPreset=deep_link_grass'),
});
assert.equal(deepLinkedLab.getState().presetId, 'deep_link_grass');
assert.equal(deepLinkedLab.getState().settings.windResponse, 2.4,
  'an explicit grassPreset deep link must win over a saved draft');

const saved = deepLinkedLab.actions.savePresetAs('Local Alpine');
assert.equal(saved.ok, true);
const localId = deepLinkedLab.getState().presetId;
assert.equal(deepLinkedLab.getState().localPresets.filter((entry) => entry.id === localId).length, 1);
assert.equal(getGrassPresetOptions().filter((entry) => entry.id === localId).length, 1,
  'saved local presets must have one registry/picker identity');
deepLinkedLab.actions.deletePreset(localId);
assert.equal(deepLinkedLab.getState().localPresets.some((entry) => entry.id === localId), false);
assert.equal(getGrassPresetOptions().some((entry) => entry.id === localId), false,
  'deleting a local preset must unregister it from the picker');

const grassLabEngineSource = fs.readFileSync(
  new URL('../labs/grass-lab/ui/engine.js', import.meta.url),
  'utf8',
);
const grassShaderSource = fs.readFileSync(
  new URL('../src/shaders-tsl/grass.js', import.meta.url),
  'utf8',
);
assert.match(
  grassShaderSource,
  /field now contains the ground's visible sun\/sky\/shared-shadow[\s\S]*shaded\.color\.assign\(mix\(shaded\.color, color, groundCoverage\)\)/,
  'ground-adopted grass must consume visible ground shadow color without applying a second conflicting light pass',
);
assert.match(grassLabEngineSource, /createCallMeSenseiGrassField/,
  'Grass Lab must preview the canonical first-party field factory');
assert.doesNotMatch(grassLabEngineSource, /new\s+StylizedGrass(?:Clump)?Field/,
  'Grass Lab must not bypass the canonical field factory with legacy constructors');
assert.match(grassLabEngineSource, /createEnvironmentGroundFieldPass/,
  'Grass Lab must capture its ground so Ground Adoption is visible while authoring');
assert.match(grassLabEngineSource, /groundField:\s*true/,
  'Grass Lab canonical grass must sample the first-party ground field');
assert.match(grassLabEngineSource, /userData\.callMeSenseiGrass/,
  'Grass Lab must publish the canonical factory provenance at runtime');
assert.match(grassLabEngineSource, /dataset\.grassFirstParty/,
  'Grass Lab must expose a first-party runtime assertion for capture gates');
assert.doesNotMatch(
  grassLabEngineSource,
  /(?:so[\s_-]*stylized|stylizednature|p18|sky[\s_-]*pro|assets-local)/i,
  'Grass Lab active runtime must not reference third-party or local comparison assets',
);

console.log(`grass palette verifier passed (${GRASS_COLOR_PALETTES.length} coordinated palettes)`);
