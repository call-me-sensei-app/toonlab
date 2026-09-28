import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { ProceduralSpeciesTree } from '../src/vegetation/proceduralSpeciesTree.js';
import { StylizedFlower } from '../src/vegetation/stylizedFlower.js';
import { createFlowerBloomNodeMaterial } from '../src/shaders-tsl/flower.js';
import { createTreeLeafNodeMaterial } from '../src/shaders-tsl/tree-leaf.js';
import { createWoodySurfaceNodeMaterial } from '../src/shaders-tsl/woody-surface.js';
import { createCallMeSenseiGrassField } from '../src/vegetation/callMeSenseiGrass.js';
import { createVegetationMaterialLabStore } from '../labs/vegetation-shader-lab/ui/store.js';
import { parseTreeShaderPreviewAsset } from '../labs/vegetation-shader-lab/previewAssets.js';
import { applyVegetationShaderScope, VEGETATION_SHADER_SCOPES } from '../src/vegetation/vegetationShaders.js';

// Exercise the species adapter with real shader materials, without generating
// unrelated botanical geometry or requiring a browser canvas for leaf sprites.
const leafMap = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
const species = Object.create(ProceduralSpeciesTree.prototype);
species.canopyMesh = { material: createTreeLeafNodeMaterial({ leafMap }) };
species.trunkMesh = { material: createWoodySurfaceNodeMaterial() };
const sunlight = { direction: [1, 0, 0], color: [0.8, 0.4, 0.2], sky: [0.1, 0.2, 0.3], intensity: 0.14, skyIntensity: 0.2 };
assert.equal(species.setSun(sunlight), species);
for (const mesh of [species.canopyMesh, species.trunkMesh]) {
  const u = mesh.material.uniforms;
  assert.equal(u.uSunIntensity.value, 0.14);
  assert.equal(u.uSkyIntensity.value, 0.2);
  assert.deepEqual(u.uSunDirection.value.toArray(), [1, 0, 0]);
  assert.ok(u.uSunColor.value.equals(new THREE.Color().setRGB(...sunlight.color, THREE.SRGBColorSpace)));
}
assert.equal(species.setSurfaceWeather({ wetness: 0.7, snowCover: 0.8 }), species);
for (const mesh of [species.canopyMesh, species.trunkMesh]) {
  assert.equal(mesh.material.uniforms.uWetness.value, 0.7);
  assert.equal(mesh.material.uniforms.uSnowCover.value, 0.8);
}
species.setSurfaceWeather({ wetness: 2 });
assert.equal(species.trunkMesh.material.uniforms.uWetness.value, 1);
assert.equal(species.canopyMesh.material.uniforms.uSnowCover.value, 0.8, 'partial updates preserve snow');
const fog = new THREE.Fog(0xaabbcc, 22, 58);
assert.equal(species.setSceneFog(fog), species);
assert.equal(species.canopyMesh.material.uniforms.uFogNear.value, 22);
assert.equal(species.canopyMesh.material.uniforms.uFogFar.value, 58);
assert.ok(species.canopyMesh.material.uniforms.uFogColor.value.equals(fog.color));
species.setSceneFog(null);
assert.equal(species.canopyMesh.material.uniforms.uFogFar.value, 1e9);
const flower = Object.create(StylizedFlower.prototype);
flower.canopyMesh = species.canopyMesh;
flower.trunkMesh = species.trunkMesh;
flower.headsMesh = { material: createFlowerBloomNodeMaterial() };
flower.setSun({ intensity: 0, skyIntensity: 0 });
for (const mesh of [flower.canopyMesh, flower.trunkMesh, flower.headsMesh]) {
  assert.equal(mesh.material.uniforms.uSunIntensity.value, 0);
  assert.equal(mesh.material.uniforms.uSkyIntensity.value, 0);
}
flower.headsMesh.material.dispose();
species.canopyMesh.material.dispose();
species.trunkMesh.material.dispose();
leafMap.dispose();

const storage = new Map();
globalThis.document = { body: { dataset: {} }, addEventListener() {}, removeEventListener() {} };
globalThis.window = {
  devicePixelRatio: 1, innerWidth: 1280, innerHeight: 720,
  location: { search: '' }, addEventListener() {}, removeEventListener() {},
  localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
};
const frames = [];
globalThis.requestAnimationFrame = (callback) => frames.push(callback);
const events = [];
const shadowPass = {
  ready: true,
  update(options) { events.push(['shadow', options]); },
  dispose() { events.push(['dispose-shadow']); },
};
const renderer = {
  domElement: {}, shadowMap: {}, setPixelRatio() {}, setSize() {},
  render() { events.push(['render']); }, dispose() { events.push(['dispose-renderer']); },
};
class OrbitControls {
  constructor() { this.target = new THREE.Vector3(); this.mouseButtons = {}; }
  update() {}
}
function plant(recipe) {
  const root = new THREE.Group();
  root.userData.recipe = recipe;
  root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshBasicMaterial()));
  root.setSun = (options) => { root.userData.sun = options; };
  root.dispose = () => { root.userData.disposed = true; root.children[0].geometry.dispose(); root.children[0].material.dispose(); };
  return root;
}

// Load the actual engine, substituting only GPU/browser boundaries and plant
// generation. Store subscriptions, asset swaps, lighting, and frame scheduling
// run unchanged; real shader rendering is covered by browser verification.
globalThis.__vegetationPreviewTest = {
  OrbitControls,
  createLabRenderer: () => renderer,
  whenRendererReady: async () => {},
  createEnvironmentSunShadowPass: () => shadowPass,
  createEnvironmentGroundFieldPass: () => ({
    ready: true,
    update() { events.push(['ground']); },
    invalidate() {}, invalidateColor() {}, dispose() {},
  }),
  createCallMeSenseiGrassField,
  createPlantFromRecipe: plant,
  applyVegetationShaderScope,
  VEGETATION_SHADER_SCOPES,
};
const replacements = {
  'three/examples/jsm/controls/OrbitControls.js': ['OrbitControls'],
  '../../shared/rendererFactory.js': ['createLabRenderer', 'whenRendererReady'],
  '../../../src/environment/environmentSunShadowPass.js': ['createEnvironmentSunShadowPass'],
  '../../../src/environment/environmentGroundFieldPass.js': ['createEnvironmentGroundFieldPass'],
  '../../../src/vegetation/callMeSenseiGrass.js': ['createCallMeSenseiGrassField'],
  '../../../src/vegetation/experimental.js': ['createPlantFromRecipe', 'applyVegetationShaderScope', 'VEGETATION_SHADER_SCOPES'],
};
const engineUrl = new URL('../labs/vegetation-shader-lab/ui/engine.js', import.meta.url);
const source = (await readFile(engineUrl, 'utf8')).replace(/from\s+'([^']+)'/g, (match, specifier) => {
  const names = replacements[specifier];
  const target = names
    ? `data:text/javascript,${encodeURIComponent(`export const { ${names.join(', ')} } = globalThis.__vegetationPreviewTest;`)}`
    : specifier.startsWith('.') ? new URL(specifier, engineUrl).href : import.meta.resolve(specifier);
  return `from ${JSON.stringify(target)}`;
});
const { createVegetationMaterialLabEngine } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const store = createVegetationMaterialLabStore({ scope: 'tree' });
const engine = await createVegetationMaterialLabEngine({ mount: { appendChild() {} }, store });
await engine.start();
const preview = engine.scene.getObjectByName('ToonLab procedural vegetation preview');
const treeRoot = () => preview.children.find((root) => root.userData.toonlabShaderPreviewAsset?.id !== undefined
  && root.userData.toonlabShaderPreviewAsset.id !== 'toonlab-call-me-sensei-meadow'
  && root.userData.recipe.type === 'tree');
const dayIntensity = treeRoot().userData.sun.intensity;
store.actions.setPreviewComponentVisible('lighting', false);
assert.equal(treeRoot().userData.sun.intensity, 0);
assert.equal(treeRoot().userData.sun.skyIntensity, 0);
const meadow = preview.children.find((root) => root.userData.toonlabShaderPreviewAsset?.id === 'toonlab-call-me-sensei-meadow');
for (const mesh of meadow.lodMeshes) {
  assert.equal(mesh.material.uniforms.uSunIntensity.value, 0);
  assert.equal(mesh.material.uniforms.uSkyIntensity.value, 0);
}
assert.equal(engine.scene.children.find((object) => object.isDirectionalLight).visible, false);
store.actions.setPreviewComponentVisible('lighting', true);
assert.equal(treeRoot().userData.sun.intensity, dayIntensity);

const recipe = structuredClone(store.getState().view.previewAsset.recipe);
recipe.id = 'same-import-id';
store.actions.setPreviewAsset(parseTreeShaderPreviewAsset(recipe).value);
await Promise.resolve();
const first = treeRoot();
recipe.options.size = 2.5;
store.actions.setPreviewAsset(parseTreeShaderPreviewAsset(recipe).value);
await Promise.resolve();
const second = treeRoot();
assert.notEqual(second, first, 'same-ID recipe import must replace the rendered plant');
assert.equal(second.userData.recipe.options.size, 2.5);
assert.equal(first.parent, null);
assert.notEqual(first.userData.disposed, true, 'old GPU resources retire after submitted frames');
const ground = engine.scene.getObjectByName('ToonLab procedural meadow ground');
assert.equal(ground.material.userData.createGroundColorVariant().colorNode, ground.material.colorNode,
  'grass must sample the visible ground lighting graph, not unlit vertex albedo');
events.length = 0;
for (let index = 0; index < 6; index += 1) frames.shift()(index * 16);
assert.equal(first.userData.disposed, true);
for (let index = 0; index < events.length; index += 3) {
  assert.equal(events[index][0], 'shadow');
  assert.equal(events[index][1].camera, engine.camera);
  assert.equal(events[index][1].dynamic, true, 'wind requires refreshing the shadow map each frame');
  assert.equal(events[index + 1][0], 'ground', 'grass samples the refreshed shadowed ground');
  assert.equal(events[index + 2][0], 'render');
}
engine.dispose();
assert.ok(events.some(([event]) => event === 'dispose-shadow'));
const eventCount = events.length;
frames.shift()(112);
assert.equal(events.length, eventCount, 'disposed engines must not render or update shadow resources');
delete globalThis.__vegetationPreviewTest;
console.log('Vegetation preview shadow lifecycle, lighting, recipe replacement, and species world-state verified.');
