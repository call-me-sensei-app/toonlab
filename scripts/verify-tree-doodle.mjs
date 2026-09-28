import assert from 'node:assert/strict';

import {
  TREE_SETTING_FIELD_SCHEMA,
  TREE_RECIPE_VERSION,
  cloneTreeSettings,
  compileTreeLodLevels,
  createPlantFromRecipe,
  createProceduralTreeLeafTexture,
  createTreeSpeciesRecipe,
  parseTreeRecipeDocument,
  recipeFromSettings,
  settingsFromRecipe,
} from '../src/vegetation/experimental.js';
import {
  mergeSketchIntoRecipe,
  normalizeSketch,
  sketchFromOptions,
} from '../labs/tree-lab/store/docUtils.js';

const storage = new Map();
globalThis.document = { body: { dataset: {} } };
globalThis.window = {
  location: { pathname: '/tree-lab/', search: '' },
  localStorage: {
    getItem: (key) => storage.get(key) ?? null,
    removeItem: (key) => storage.delete(key),
    setItem: (key, value) => storage.set(key, value),
  },
};

const { createDesignerStore } = await import('../labs/tree-lab/store/designerStore.js');

function triangles(geometry) {
  return Math.floor((geometry.index?.count ?? geometry.getAttribute('position').count) / 3);
}

function createHeadlessPlant(recipe) {
  const leafMap = createProceduralTreeLeafTexture({ seed: recipe.options.seed ?? 1 });
  const plant = createPlantFromRecipe({
    ...recipe,
    options: {
      ...recipe.options,
      foliage: { ...(recipe.options.foliage ?? {}), leafMap },
    },
  });
  return { leafMap, plant };
}

const trunk = Object.freeze({
  points: Object.freeze([
    Object.freeze([0, 0, 0]),
    Object.freeze([0.08, 0.9, 0.03]),
    Object.freeze([-0.06, 1.8, 0.08]),
    Object.freeze([0.04, 2.7, 0.03]),
  ]),
  radiusStart: 0.18,
  radiusEnd: 0.07,
  leafTip: false,
});
const branch = Object.freeze({
  points: Object.freeze([
    Object.freeze([0, 1.45, 0.06]),
    Object.freeze([0.55, 1.85, 0.12]),
    Object.freeze([1.05, 2.15, 0.18]),
  ]),
  radiusStart: 0.075,
  radiusEnd: 0.018,
  leafTip: true,
});
const foliageArea = Object.freeze({
  offset: Object.freeze([0.82, 2.05, 0.16]),
  radius: 0.48,
});

// The blank-canvas action remains the same public Tree Lab workflow.
const store = createDesignerStore({ urlParams: new URLSearchParams() });
store.actions.newTree({ drawn: true, randomize: false });
assert.equal(store.getState().settings.plant.speciesProfileId, '');
assert.equal(store.getState().settings.skeleton.generator, 'drawn');
assert.equal(store.getState().tool, 'branch');
store.actions.setSketchMode(true);
assert.equal(store.getState().sketchMode, true);
assert.equal(store.getState().tool, 'doodleWood');

// Converted doodles remain v3 legacy-woody recipes and preserve every
// authored side-channel through settings/recipe hydration.
const settings = cloneTreeSettings();
settings.skeleton.generator = 'drawn';
const sketch = normalizeSketch({
  branchSpines: [trunk, branch],
  extraBlobs: [foliageArea],
  extraAttachments: [{
    position: [1.05, 2.15, 0.18],
    direction: [0.8, 0.5, 0.1],
  }],
});
const drawnRecipe = parseTreeRecipeDocument(
  mergeSketchIntoRecipe(recipeFromSettings(settings), sketch),
);
assert.equal(drawnRecipe.version, TREE_RECIPE_VERSION);
assert.equal(drawnRecipe.architecture.engine, 'legacy-woody');
assert.equal(drawnRecipe.options.skeleton.generator, 'drawn');
assert.deepEqual(drawnRecipe.options.branchSpines, [trunk, branch]);
assert.deepEqual(sketchFromOptions(drawnRecipe.options), sketch);
assert.equal(settingsFromRecipe(drawnRecipe).skeleton.generator, 'drawn');

const { leafMap: drawnLeafMap, plant: drawnPlant } = createHeadlessPlant(drawnRecipe);
assert.ok(triangles(drawnPlant.trunkMesh.geometry) > 100);
assert.ok(drawnPlant.canopyMesh.geometry.getAttribute('position').count > 0);
drawnPlant.dispose();
drawnLeafMap.dispose();

const drawnCompilation = compileTreeLodLevels(drawnRecipe);
assert.equal(drawnCompilation.levels.length, 4);
assert.equal(drawnCompilation.report.valid, true);
assert.ok(drawnCompilation.report.levels.every((level) => level.triangles > 0));
drawnCompilation.dispose();

// Sketch tools also compose with a selected v3 species. This protects the
// previously broken case where strokes serialized but the species renderer
// silently ignored them.
const speciesRecipe = createTreeSpeciesRecipe('quercus-robur', {
  lifeStage: 'mature',
  seed: 47,
});
const { leafMap: baseLeafMap, plant: baseSpecies } = createHeadlessPlant(speciesRecipe);
const baseTriangles = triangles(baseSpecies.trunkMesh.geometry);
const baseFoliageAttachments = baseSpecies.foliageAttachments.length;
baseSpecies.dispose();
baseLeafMap.dispose();

const hybridRecipe = parseTreeRecipeDocument({
  ...speciesRecipe,
  options: {
    ...speciesRecipe.options,
    branchSpines: [branch],
    extraBlobs: [foliageArea],
    extraAttachments: [{
      position: [1.05, 2.15, 0.18],
      direction: [0.8, 0.5, 0.1],
    }],
  },
});
const { leafMap: hybridLeafMap, plant: hybridPlant } = createHeadlessPlant(hybridRecipe);
assert.ok(triangles(hybridPlant.trunkMesh.geometry) > baseTriangles);
assert.ok(hybridPlant.userData.doodleParts.some((part) => part.semantic === 'doodle-axis'));
assert.ok(hybridPlant.userData.doodleParts.some(
  (part) => part.semantic === 'doodle-foliage-area',
));
assert.ok(hybridPlant.foliageAttachments.length > baseFoliageAttachments);
hybridPlant.dispose();
hybridLeafMap.dispose();

const hybridCompilation = compileTreeLodLevels(hybridRecipe);
assert.equal(hybridCompilation.levels.length, 4);
assert.equal(
  hybridCompilation.report.valid,
  true,
  JSON.stringify(hybridCompilation.report, null, 2),
);
const exportedSemantics = [];
hybridCompilation.levels[0].traverse((object) => {
  exportedSemantics.push(...Object.values(object.userData?.toonlabSemanticParts ?? {})
    .map((part) => part.semantic));
});
assert.ok(exportedSemantics.includes('doodle-axis'));
assert.ok(exportedSemantics.includes('doodle-foliage-area'));
hybridCompilation.dispose();

const speciesField = TREE_SETTING_FIELD_SCHEMA.plant.speciesProfileId;
store.actions.setField(speciesField, 'quercus-robur');
assert.equal(store.getState().settings.plant.speciesProfileId, 'quercus-robur');
store.actions.setSketchMode(true);
assert.equal(store.getState().tool, 'doodleWood');
assert.equal(store.getState().settings.plant.speciesProfileId, 'quercus-robur');

console.log('Verified blank-canvas, converted, exported, and species-hybrid Tree Lab doodles.');
