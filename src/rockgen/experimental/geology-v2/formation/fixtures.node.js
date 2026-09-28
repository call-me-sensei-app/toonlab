import { loadGeologyCatalog } from '../catalog.node.js';
import { createHeroRockRecipe, parseRockRecipe } from '../recipe.node.js';

const DEFINITIONS = Object.freeze([
  Object.freeze({
    id: 'steep-stratified-ridge',
    label: 'Steeply dipping stratified ridge',
    landform: 'stratified-ridge',
    lithology: 'quartz-arenite',
    dimensions: [480, 210, 190],
    seed: 91001,
    orientation: [18, 72, 108],
    profile: Object.freeze({ kind: 'steep-stratified-ridge', relief: 0.86, asymmetry: 0.3, ledgeStrength: 0.055, talusStrength: 0.17 }),
  }),
  Object.freeze({
    id: 'folded-ridge',
    label: 'Folded ridge',
    landform: 'folded-ridge',
    lithology: 'shale',
    dimensions: [420, 180, 180],
    seed: 91002,
    orientation: [34, 43, 124],
    profile: Object.freeze({ kind: 'folded-ridge', relief: 0.78, foldWavelength: 0.38, ledgeStrength: 0.045, talusStrength: 0.14 }),
  }),
  Object.freeze({
    id: 'fault-scarp',
    label: 'Finite fault scarp',
    landform: 'fault-scarp',
    lithology: 'mylonite',
    dimensions: [360, 160, 170],
    seed: 91003,
    orientation: [7, 68, 97],
    profile: Object.freeze({ kind: 'fault-scarp', relief: 0.74, faultThrow: 0.31, ledgeStrength: 0.04, talusStrength: 0.2 }),
  }),
  Object.freeze({
    id: 'shattered-alpine-ridge',
    label: 'Shattered alpine ridge',
    landform: 'shattered-alpine-ridge',
    lithology: 'granodiorite',
    dimensions: [520, 240, 220],
    seed: 91004,
    orientation: [61, 18, 151],
    profile: Object.freeze({ kind: 'shattered-alpine-ridge', relief: 0.94, shatterStrength: 0.24, ledgeStrength: 0.035, talusStrength: 0.24 }),
  }),
  Object.freeze({
    id: 'exfoliation-massif',
    label: 'Exfoliation massif',
    landform: 'exfoliation-massif',
    lithology: 'granite',
    dimensions: [460, 220, 360],
    seed: 91005,
    orientation: [0, 0, 90],
    profile: Object.freeze({ kind: 'exfoliation-massif', relief: 0.84, sheetStrength: 0.09, ledgeStrength: 0.025, talusStrength: 0.12 }),
  }),
  Object.freeze({
    id: 'volcanic-massif',
    label: 'Composite volcanic massif',
    landform: 'volcanic-massif',
    lithology: 'basalt',
    dimensions: [560, 250, 480],
    seed: 91006,
    orientation: [0, 0, 90],
    profile: Object.freeze({ kind: 'volcanic-massif', relief: 0.9, radialRidgeStrength: 0.16, ledgeStrength: 0.03, talusStrength: 0.15 }),
  }),
  Object.freeze({
    id: 'karst-tower-field',
    label: 'Karst tower field',
    landform: 'karst-tower-field',
    lithology: 'micritic-limestone',
    dimensions: [440, 200, 360],
    seed: 91007,
    orientation: [26, 16, 116],
    profile: Object.freeze({ kind: 'karst-tower-field', relief: 0.82, towerCount: 13, ledgeStrength: 0.045, talusStrength: 0.08 }),
  }),
]);

function rescaleGeology(recipe, dimensions) {
  const previousMaximum = Math.max(...recipe.targetDimensionsMetres);
  const nextMaximum = Math.max(...dimensions);
  const ratio = nextMaximum / previousMaximum;
  recipe.targetDimensionsMetres = [...dimensions];
  if (recipe.depositionalHistory) {
    const bedding = recipe.depositionalHistory.bedding;
    bedding.minimumThicknessMetres *= ratio;
    bedding.meanThicknessMetres *= ratio;
    bedding.maximumThicknessMetres *= ratio;
  }
  if (recipe.metamorphicFabric) recipe.metamorphicFabric.spacingMetres *= ratio;
  for (const set of recipe.fractureHistory.sets) {
    set.spacingMetres *= ratio;
    set.persistenceMetres *= ratio;
    set.apertureMetres *= ratio;
    set.roughnessMetres *= ratio;
    set.sizeDistribution.minimumMetres *= ratio;
    set.sizeDistribution.meanMetres *= ratio;
    set.sizeDistribution.maximumMetres *= ratio;
  }
}

function createFixture(definition, catalog) {
  const recipe = structuredClone(createHeroRockRecipe(definition.lithology, {
    catalog,
    qualityTier: 'hero',
    seed: definition.seed,
  }));
  rescaleGeology(recipe, definition.dimensions);
  recipe.id = `c9-${definition.id}`;
  recipe.label = `C9 ${definition.label}`;
  recipe.description = `${recipe.description}; continuous formation-domain target, never an enlarged prop.`;
  recipe.landform = definition.landform;
  recipe.scale = 'formation';
  const [strikeDegrees, dipDegrees, dipDirectionDegrees] = definition.orientation;
  recipe.geologyTransform = { originMetres: [0, 0, 0], strikeDegrees, dipDegrees, dipDirectionDegrees };
  if (recipe.depositionalHistory) {
    recipe.depositionalHistory.bedding.strikeDegrees = strikeDegrees;
    recipe.depositionalHistory.bedding.dipDegrees = dipDegrees;
  }
  if (recipe.metamorphicFabric) {
    recipe.metamorphicFabric.strikeDegrees = strikeDegrees;
    recipe.metamorphicFabric.dipDegrees = dipDegrees;
  }
  return Object.freeze({
    definition,
    profile: definition.profile,
    recipe: parseRockRecipe(recipe, { catalog }).recipe,
  });
}

export function listC9FormationDefinitions() {
  return DEFINITIONS;
}

export function createC9FormationFixture(id, options = {}) {
  const catalog = options.catalog ?? loadGeologyCatalog();
  const definition = DEFINITIONS.find((candidate) => candidate.id === id);
  if (!definition) throw new RangeError(`Unknown C9 formation target: ${id}`);
  return createFixture(definition, catalog);
}

export function createC9FormationFixtures(options = {}) {
  const catalog = options.catalog ?? loadGeologyCatalog();
  return Object.freeze(Object.fromEntries(DEFINITIONS.map((definition) => [
    definition.id,
    createFixture(definition, catalog),
  ])));
}
