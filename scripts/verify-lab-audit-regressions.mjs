import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { createGroundShaderMaterial, setGroundShaderSceneState, applyGroundShader } from '../src/ground-shader/index.js';

const values = new Map();
let failWrites = false;
const localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem(key, value) { if (failWrites) throw new Error('QuotaExceededError'); values.set(key, String(value)); },
  removeItem: (key) => values.delete(key),
};
const location = { href: 'http://localhost/tree-lab/', pathname: '/tree-lab/', search: '' };
globalThis.document = { body: { dataset: {} }, addEventListener() {}, removeEventListener() {} };
globalThis.window = {
  localStorage, location, history: { replaceState() {} },
  innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
  addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
};

for (const [path, factory, save, update] of [
  ['shader-lab/ui/store.js', 'createCharacterShaderStore', 'savePresetAs', 'updatePreset'],
  ['ground-shader-lab/ui/store.js', 'createGroundShaderLabStore', 'saveStyleAs', 'updateStyle'],
  ['grass-lab/ui/store.js', 'createGrassLabStore', 'savePresetAs', 'updatePreset'],
  ['tree-lab/store/designerStore.js', 'createDesignerStore', 'savePresetAs', 'updatePreset'],
  ['water-lab/store/waterStore.js', 'createWaterStore', 'savePresetAs', 'updatePreset'],
  ['texture-lab/store/textureStore.js', 'createTextureStore', 'savePresetAs', 'updatePreset'],
]) {
  values.clear(); failWrites = false;
  const module = await import(new URL(`../labs/${path}`, import.meta.url));
  const store = module[factory]({ urlParams: new URLSearchParams() });
  assert.equal(store.actions[save]('Saved audit fixture').ok, true, path);
  if (store.setState) store.setState({ presetDirty: true });
  else {
    const { TREE_SETTING_FIELD_SCHEMA } = await import('../src/vegetation/experimental.js');
    store.actions.setField(TREE_SETTING_FIELD_SCHEMA.plant.seed, 4321);
  }
  const before = store.getState();
  const persisted = [...values];
  failWrites = true;
  for (const action of [() => store.actions[save]('Rejected copy'), () => store.actions[update]()]) {
    const result = action();
    assert.equal(result.ok, false, `${path}: reject unsuccessful persistence`);
    assert.match(result.error ?? result.errors?.join(' ') ?? '', /browser storage/);
    assert.equal(store.getState(), before, `${path}: failed save preserves the edited document and dirty flag`);
    assert.deepEqual([...values], persisted, `${path}: failed update preserves the previously saved copy`);
  }
  window.localStorage = null;
  assert.equal(store.actions[save]('Unavailable storage').ok, false, path);
  assert.equal(store.getState(), before);
  window.localStorage = localStorage; failWrites = false;
  assert.equal(store.actions[update]().ok, true, `${path}: saving recovers`);
}

// Exercise the production modules with only browser/GPU and asset-loading
// boundaries substituted. No parallel browser sessions or network are needed.
let mockSequence = 0;
async function importWithMocks(relative, mocks) {
  const url = new URL(relative, import.meta.url);
  const sequence = ++mockSequence;
  globalThis.__labAuditMocks = Object.assign({}, ...Object.values(mocks));
  const source = (await readFile(url, 'utf8')).replace(/from\s+'([^']+)'/g, (_match, specifier) => {
    const names = mocks[specifier] && Object.keys(mocks[specifier]);
    const target = names
      ? `data:text/javascript,${encodeURIComponent(`export const { ${names.join(', ')} } = globalThis.__labAuditMocks; // ${sequence}`)}`
      : specifier.startsWith('.') ? new URL(specifier, url).href : import.meta.resolve(specifier);
    return `from ${JSON.stringify(target)}`;
  });
  const module = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  delete globalThis.__labAuditMocks;
  return module;
}
class OrbitControls {
  constructor() { this.target = new THREE.Vector3(); this.mouseButtons = {}; }
  update() {}
}
const renderer = {
  domElement: {}, shadowMap: {}, setPixelRatio() {}, setSize() {}, setClearColor() {}, dispose() {},
};
const renderMocks = {
  createLabRenderer: () => renderer,
  whenRendererReady: async () => {},
};
let resolveCharacter;
let latestRuntimeSettings;
const { createCharacterShaderEngine } = await importWithMocks('../labs/shader-lab/ui/engine.js', {
  'three/examples/jsm/controls/OrbitControls.js': { OrbitControls },
  '@call-me-sensei/toonlab/character': {
    createCharacterRuntime: (options) => new Promise((resolve) => {
      const captured = options.toon.settings;
      resolveCharacter = () => resolve({
        modelRoot: new THREE.Group(), clips: {}, bounds: null, toonState: { settings: captured },
        dispose() {}, setAnimationEnabled() {}, applyToonSettings(settings) { latestRuntimeSettings = settings; },
      });
    }),
  },
  '../../../src/toon/characterRenderPasses.js': { createCharacterRenderPasses: () => ({}) },
  '../../shared/rendererFactory.js': renderMocks,
  '../../shared/walkPreview.js': { installWalkPreviewController() {} },
  '../sceneGeometry.js': { writeModelBoundsDataset() {} },
});
const { createCharacterShaderStore } = await import('../labs/shader-lab/ui/store.js');
values.clear();
const characterStore = createCharacterShaderStore({ urlParams: new URLSearchParams() });
const characterEngine = createCharacterShaderEngine({ mount: { appendChild() {} }, store: characterStore });
const loading = characterEngine.setModel('/slow-character.glb');
characterStore.actions.setSetting('rim', 'inShadow', 0);
const editedSettings = characterStore.getState().settings;
assert.equal(editedSettings.rim.inShadow, 0, 'the edit lands in the profile');
resolveCharacter(); await loading;
assert.equal(characterStore.getState().settings, editedSettings, 'model loading must not overwrite newer edits');
assert.equal(latestRuntimeSettings, editedSettings, 'newly loaded model receives the latest profile');
characterEngine.dispose();

const { applyLabPreviewEnvironment } = await import('../labs/shared/previewEnvironmentRig.js');
const sun = new THREE.DirectionalLight();
sun.target.position.set(2, 0.7, -1);
const day = applyLabPreviewEnvironment(13, { sun });
const night = applyLabPreviewEnvironment(22, { sun });
assert.ok(day.sunColor.isColor && day.skyColor.isColor && day.sunDirection.isVector3);
assert.ok(day.sunIntensity > night.sunIntensity);
assert.notDeepEqual(day.sunDirection.toArray(), night.sunDirection.toArray());
const disabled = applyLabPreviewEnvironment(13, { sun, lightingEnabled: false });
assert.equal(disabled.sunIntensity, 0);
assert.equal(disabled.skyIntensity, 0);
assert.equal(sun.visible, false, 'shared shadow discovery must also see lighting as disabled');

const ground = createGroundShaderMaterial({ field: { splat: new Uint8Array([255, 0, 0, 0]), splatW: 1, splatD: 1 } });
const gu = ground.userData.toonlabGroundShader.sceneUniforms;
assert.equal(gu.uSceneGroundSunIntensity.value, 1, 'existing callers retain their original energy');
setGroundShaderSceneState(ground, { sunIntensity: 0, skyIntensity: 0 });
applyGroundShader(ground, { preset: 'call_me_sensei' });
assert.equal(gu.uSceneGroundSunIntensity.value, 0, 'style application preserves transient lighting');
assert.equal(gu.uSceneGroundSkyIntensity.value, 0);
ground.dispose();

const plants = [];
class PreviewPlant extends THREE.Group {
  constructor() { super(); plants.push(this); }
  applySettings() {}
  setSun(options) { this.userData.sun = options; }
  update() {}
  dispose() {}
}
let shadowUpdates = 0;
let shadowDisposed = false;
const camera = new THREE.PerspectiveCamera();
const scene = new THREE.Scene();
const { createShaderPreviewScene } = await importWithMocks('../labs/shared/shader-preview/proceduralScene.js', {
  '../../../src/vegetation/index.js': { StylizedTree: PreviewPlant, StylizedFlowerField: PreviewPlant, createCallMeSenseiGrassField: async () => new PreviewPlant() },
  '../../../src/propgen/index.js': { buildProp: () => ({ object3D: new THREE.Group() }) },
  '../../../src/sky/index.js': {
    PRESETS: { partlyCloudy: { noise: { weather: {} }, cloud: {} } },
    SkySystem: { create: async () => ({ backdrops: [new THREE.Group(), new THREE.Group()], clouds: {}, timeOfDay: { applyParams() {} }, skyColor: { applyParams() {} }, applyPreset: async () => {}, resize() {}, update() {}, dispose() {} }) },
  },
  '../../../src/environment/environmentSunShadowPass.js': { createEnvironmentSunShadowPass: () => ({ ready: true, update(options) { assert.equal(options.dynamic, true); assert.equal(options.camera, camera); shadowUpdates++; }, dispose() { shadowDisposed = true; } }) },
});
const preview = await createShaderPreviewScene({ authoredComponent: 'ground', camera, renderer, scene });
preview.applyTime(13);
for (const plant of plants) {
  assert.ok(plant.userData.sun.direction.every(Number.isFinite));
  assert.ok(plant.userData.sun.intensity > 0);
}
preview.applyComponentVisibility({ componentVisibility: { lighting: false } });
for (const plant of plants) {
  assert.equal(plant.userData.sun.intensity, 0);
  assert.equal(plant.userData.sun.skyIntensity, 0);
}
preview.applyComponentVisibility({ componentVisibility: { lighting: true } });
preview.update(1 / 60);
assert.equal(shadowUpdates, 1);
assert.ok(plants.every((plant) => plant.userData.sun.intensity > 0));
preview.dispose(); assert.equal(shadowDisposed, true);

const { createPreviewGroundMaterial } = await import('../labs/shared/previewGroundMaterial.js');
const previewGround = createPreviewGroundMaterial();
assert.equal(previewGround.userData.createGroundColorVariant().colorNode, previewGround.colorNode);
previewGround.userData.setPreviewLighting(disabled);
previewGround.dispose();

const frameEvents = [];
const frames = [];
globalThis.requestAnimationFrame = (callback) => frames.push(callback);
renderer.render = () => frameEvents.push('render');
const { createGrassLabEngine } = await importWithMocks('../labs/grass-lab/ui/engine.js', {
  'three/examples/jsm/controls/OrbitControls.js': { OrbitControls },
  '../../shared/rendererFactory.js': renderMocks,
  '../../shared/walkPreview.js': { createWalkPreviewActions() {}, installWalkPreviewController() {} },
  '../../../src/environment/environmentSunShadowPass.js': { createEnvironmentSunShadowPass: () => ({ ready: true, update() { frameEvents.push('shadow'); }, dispose() {} }) },
  '../../../src/environment/environmentGroundFieldPass.js': { createEnvironmentGroundFieldPass: () => ({ ready: true, invalidateColor() { frameEvents.push('invalidate-color'); }, update() { frameEvents.push('ground'); }, dispose() {} }) },
});
const { createGrassLabStore } = await import('../labs/grass-lab/ui/store.js');
values.clear();
const grassStore = createGrassLabStore({ urlParams: new URLSearchParams() });
const grassEngine = createGrassLabEngine({ mount: { appendChild() {} }, store: grassStore });
await grassEngine.start();
grassStore.actions.setView({ sunIntensity: 0, ambientIntensity: 0 });
const grassField = grassEngine.scene.children.find((object) => object.userData.callMeSenseiGrass);
for (const mesh of grassField.lodMeshes) {
  assert.equal(mesh.material.uniforms.uSunIntensity.value, 0);
  assert.equal(mesh.material.uniforms.uSkyIntensity.value, 0);
}
frameEvents.length = 0;
frames.shift()(16);
assert.deepEqual(frameEvents, ['shadow', 'invalidate-color', 'ground', 'render']);
grassEngine.dispose();

// Test the whole upload decision, including transparency far from the corner
// and a nearly opaque alpha value. Opaque images can still use JPEG.
let alpha = 254;
globalThis.Image = class { constructor() { this.width = 256; this.height = 256; } set src(_value) { queueMicrotask(() => this.onload()); } };
document.createElement = () => ({
  width: 0, height: 0,
  getContext: () => ({
    drawImage() {},
    getImageData(x, y, width, height) {
      const data = new Uint8ClampedArray(width * height * 4).fill(255);
      if (128 >= x && 128 < x + width && 128 >= y && 128 < y + height) data[((128 - y) * width + 128 - x) * 4 + 3] = alpha;
      return { data };
    },
  }),
  toDataURL: (type) => `data:${type};base64,fixture`,
});
const { fileToTextureImage } = await importWithMocks('../labs/texture-lab/ui/imageUpload.js', {
  '../../shared/ui/index.js': { toast() {} },
  '../../shared/download.js': { pickFile() {} },
});
const file = new Blob(['fixture'], { type: 'image/png' }); file.name = 'mask.png';
assert.match((await fileToTextureImage(file)).dataUrl, /^data:image\/png/);
alpha = 255;
assert.match((await fileToTextureImage(file)).dataUrl, /^data:image\/jpeg/);
console.log('Lab audit regressions passed: honest saves, concurrent character edits, lighting contract, shadow lifecycle, lit ground, and complete alpha preservation.');
