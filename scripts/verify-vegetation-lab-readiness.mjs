import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const storage = new Map();
const location = {
  href: 'http://localhost/tree-lab/',
  pathname: '/tree-lab/',
  search: '',
};

globalThis.document = { body: { dataset: {} } };
globalThis.window = {
  history: {
    replaceState(_state, _title, next) {
      const url = new URL(String(next), location.href);
      location.href = url.href;
      location.pathname = url.pathname;
      location.search = url.search;
    },
  },
  localStorage: {
    clear() {
      storage.clear();
    },
    getItem(key) {
      return storage.get(key) ?? null;
    },
    removeItem(key) {
      storage.delete(key);
    },
    setItem(key, value) {
      storage.set(key, String(value));
    },
  },
  location,
};

const [
  { createVegetationMaterialLabStore },
  { createGrassLabStore },
  { createDesignerStore },
  {
    parseFlowerShaderProfilePresetDocument,
    parseGrassShaderProfilePresetDocument,
    parseTreeShaderPresetDocument,
  },
  {
    TREE_SETTING_FIELD_SCHEMA,
    validateTreeRecipeDocument,
  },
  { parseGrassPresetDocument },
  { parseStyleBundleDocument, resolveStyleBundleSettings },
] = await Promise.all([
  import('../labs/vegetation-shader-lab/ui/store.js'),
  import('../labs/grass-lab/ui/store.js'),
  import('../labs/tree-lab/store/designerStore.js'),
  import('../src/vegetation/vegetationShaders.js'),
  import('../src/vegetation/experimental.js'),
  import('../src/vegetation/stylizedGrass.js'),
  import('../src/styles/styleBundle.js'),
]);

const scopedParsers = {
  flower: parseFlowerShaderProfilePresetDocument,
  grass: parseGrassShaderProfilePresetDocument,
  tree: parseTreeShaderPresetDocument,
};

for (const scope of ['tree', 'grass', 'flower']) {
  storage.clear();
  const store = createVegetationMaterialLabStore({ scope, urlParams: new URLSearchParams() });
  const initialRimPower = store.getState().settings.lighting.rimPower;
  store.actions.setSetting('lighting', 'rimPower', Math.min(initialRimPower + 0.5, 8));
  store.actions.setView({ cameraMode: 'pan' });
  store.actions.setPreviewHour(18.5);

  const firstSave = store.actions.savePresetAs('Release Profile');
  assert.equal(firstSave.ok, true, `${scope} Save As should succeed`);
  const firstId = store.getState().presetId;
  const secondSave = store.actions.savePresetAs('Release Profile');
  assert.equal(secondSave.ok, true, `${scope} repeated Save As should succeed`);
  assert.notEqual(store.getState().presetId, firstId, `${scope} Save As must create a new entry`);
  assert.equal(store.getState().localPresets.length, 2, `${scope} profiles must remain independently searchable`);

  store.actions.setSetting('lighting', 'rimPower', Math.min(initialRimPower + 0.75, 8));
  const updatedRimPower = store.getState().settings.lighting.rimPower;
  assert.equal(store.actions.updatePreset().ok, true, `${scope} Update should succeed`);

  const profileJson = store.actions.exportDocument();
  const parsedProfile = scopedParsers[scope](profileJson);
  assert.equal(parsedProfile.ok, true, parsedProfile.errors?.join(' '));
  assert.equal(parsedProfile.value.settings.lighting.rimPower, updatedRimPower);
  assert.doesNotMatch(profileJson, /cameraMode|previewHour|scenePreset/,
    `${scope} runtime profile must exclude preview state`);

  const bundleJson = store.actions.exportStyleBundle();
  const parsedBundle = parseStyleBundleDocument(bundleJson);
  assert.equal(parsedBundle.ok, true, parsedBundle.errors?.join(' '));
  const resolved = resolveStyleBundleSettings(parsedBundle.value);
  assert.ok(resolved[`${scope}Shader`], `${scope} bundle must resolve its canonical runtime slot`);
  assert.equal(resolved[`${scope}Shader`].lighting.rimPower, updatedRimPower);
  assert.doesNotMatch(bundleJson, /cameraMode|previewHour|scenePreset/,
    `${scope} runtime bundle must exclude preview state`);

  const reload = createVegetationMaterialLabStore({ scope, urlParams: new URLSearchParams() });
  assert.equal(reload.getState().presetId, store.getState().presetId);
  assert.equal(reload.getState().settings.lighting.rimPower, updatedRimPower);
  assert.equal(reload.getState().view.cameraMode, 'pan');
  assert.equal(reload.getState().previewHour, 18.5);

  const storageBeforeFailure = new Map(storage);
  const savedId = store.getState().presetId;
  store.actions.setSetting('lighting', 'rimPower', 6.5);
  const workingDraft = store.getState();
  const setItem = window.localStorage.setItem;
  window.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
  for (const attempt of [
    () => store.actions.savePresetAs('Failed save'),
    () => store.actions.updatePreset(),
    () => store.actions.deletePreset(savedId),
  ]) {
    const result = attempt();
    assert.equal(result.ok, false, `${scope} must report storage failure`);
    assert.match(result.errors.join(' '), /browser storage/);
    assert.equal(store.getState(), workingDraft, 'failed writes must preserve the working draft');
  }
  window.localStorage.setItem = setItem;
  // Only the autosaved draft changed before the quota was exhausted.
  assert.equal(storage.get(`toonlab.vegetationShaderProfiles.${scope}.v1`),
    storageBeforeFailure.get(`toonlab.vegetationShaderProfiles.${scope}.v1`));
  assert.equal(store.actions.updatePreset().ok, true, 'saving can recover after storage becomes available');
}

storage.clear();
const grassStore = createGrassLabStore({ urlParams: new URLSearchParams() });
grassStore.actions.setSetting('clumpRadius', 0.75);
grassStore.actions.setView({ cameraMode: 'zoom', mode: 'meadow' });
assert.equal(grassStore.actions.savePresetAs('Groundcover Study').ok, true);
const firstGrassId = grassStore.getState().presetId;
assert.equal(grassStore.actions.savePresetAs('Groundcover Study').ok, true);
assert.notEqual(grassStore.getState().presetId, firstGrassId);
assert.equal(grassStore.getState().localPresets.length, 2);
grassStore.actions.setSetting('clumpRadius', 0.85);
assert.equal(grassStore.actions.updatePreset().ok, true);
const grassJson = grassStore.actions.exportDocument();
const parsedGrass = parseGrassPresetDocument(grassJson);
assert.equal(parsedGrass.ok, true, parsedGrass.errors?.join(' '));
assert.equal(parsedGrass.value.settings.clumpRadius, 0.85);
assert.doesNotMatch(grassJson, /cameraMode|walkPreview|sunIntensity/,
  'runtime grass asset must exclude preview state');
const reloadedGrass = createGrassLabStore({ urlParams: new URLSearchParams() });
assert.equal(reloadedGrass.getState().presetId, grassStore.getState().presetId);
assert.equal(reloadedGrass.getState().settings.clumpRadius, 0.85);
assert.equal(reloadedGrass.getState().view.cameraMode, 'zoom');
assert.equal(reloadedGrass.getState().view.mode, 'meadow');

storage.clear();
location.href = 'http://localhost/tree-lab/';
location.pathname = '/tree-lab/';
location.search = '';
const treeStore = createDesignerStore({ urlParams: new URLSearchParams() });
treeStore.actions.setField(TREE_SETTING_FIELD_SCHEMA.plant.seed, 4312);
const firstTreeSave = treeStore.actions.savePresetAs('Hero Shrub');
assert.equal(firstTreeSave.ok, true);
treeStore.actions.setField(TREE_SETTING_FIELD_SCHEMA.plant.seed, 4313);
assert.equal(treeStore.actions.updatePreset().ok, true);
assert.equal(treeStore.actions.getRecipeDocument().options.seed, 4313);
assert.equal(validateTreeRecipeDocument(treeStore.actions.getRecipeDocument()).ok, true);
const secondTreeSave = treeStore.actions.savePresetAs('Hero Shrub');
assert.equal(secondTreeSave.ok, true);
assert.notEqual(secondTreeSave.preset.id, firstTreeSave.preset.id);

const reloadedTree = createDesignerStore({
  urlParams: new URLSearchParams(`?treePreset=${encodeURIComponent(firstTreeSave.preset.id)}`),
});
assert.equal(reloadedTree.getState().presetId, firstTreeSave.preset.id);
assert.equal(reloadedTree.actions.getRecipeDocument().options.seed, 4313);

const sourcePaths = [
  '../labs/vegetation-shader-lab/ui/App.jsx',
  '../labs/grass-lab/ui/App.jsx',
  '../labs/tree-lab/ui/App.jsx',
  '../labs/tree-lab/ui/screens/GalleryScreen.jsx',
];
const [vegetationApp, grassApp, treeApp, treeGallery] = await Promise.all(
  sourcePaths.map((path) => readFile(new URL(path, import.meta.url), 'utf8')),
);

for (const [name, source] of [
  ['vegetation shader', vegetationApp],
  ['grass generator', grassApp],
  ['tree generator', treeApp],
  ['tree gallery', treeGallery],
]) {
  assert.match(source, /BrandLockup/, `${name} must render the ToonLab lockup`);
}
for (const [name, source] of [
  ['vegetation shader', vegetationApp],
  ['grass generator', grassApp],
  ['tree generator', treeApp],
]) {
  assert.match(source, /Save As|copy\.saveAs|savePresetAs\(/, `${name} must expose Save As`);
  assert.match(source, /Update saved|copy\.updateSavedAsset|updatePreset\(/, `${name} must expose Update`);
  assert.match(source, /Export|copy\.export[A-Z]/, `${name} must expose export`);
  assert.match(source, /Rotate|copy\.rotate/, `${name} must expose rotate`);
  assert.match(source, /Pan|copy\.pan/, `${name} must expose pan`);
  assert.match(source, /Zoom|copy\.zoom/, `${name} must expose zoom`);
}
assert.match(vegetationApp, /Export bundle with \{VEGETATION_SHADER_SCOPES\[state\.scope\]\.label\} slot only/);
assert.match(vegetationApp, /StyleBundleExportPrompt/);
assert.match(vegetationApp, /SearchSelect/);
assert.match(grassApp, /SearchSelect/);
assert.match(treeGallery, /type="search"/);
assert.match(treeGallery, /tree, or shrub/);
assert.match(treeApp, /engine\.exportGlb|ExportDialog/,
  'tree generation must retain baked GLB export');

console.log('Vegetation lab save/update/reload/search/export/camera readiness verified.');
