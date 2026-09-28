import { loadGeologyCatalog } from '../catalog.node.js';
import { createHeroRockRecipe, parseRockRecipe } from '../recipe.node.js';

export const C8_BASIS_MATRIX = Object.freeze({
  draft: Object.freeze({ seedsPerFamily: 32, meshResolution: 32 }),
  production: Object.freeze({ seedsPerFamily: 8, meshResolution: 48 }),
  hero: Object.freeze({ seedsPerFamily: 4, meshResolution: 64 }),
});

export const C8_HERO_ROLES = Object.freeze([
  'median',
  'challenging',
  'extreme-valid',
  'worst-passing',
]);

const DEFINITIONS = Object.freeze([
  {
    id: 'jointed-exfoliating-granite',
    label: 'Jointed / exfoliating granite',
    mechanism: 'orthogonal joints, sheet joints, spheroidal edge retreat',
    threshold: 0.78,
    variants: [
      { id: 'granite-boulder', lithology: 'granite', landform: 'boulder', scale: 'prop', dimensions: [3.8, 2.9, 3.1] },
      { id: 'granite-tor', lithology: 'granite', landform: 'tor', scale: 'outcrop', dimensions: [8.2, 10.5, 7.1] },
    ],
  },
  {
    id: 'cross-bedded-sandstone',
    label: 'Cross-bedded / differentially eroded sandstone',
    mechanism: 'inclined cross sets, resistant ledges, finite arch opening',
    threshold: 0.78,
    variants: [
      { id: 'sandstone-cliff', lithology: 'quartz-arenite', landform: 'cliff', scale: 'outcrop', dimensions: [10.5, 9.4, 6.2] },
      { id: 'sandstone-arch', lithology: 'quartz-arenite', landform: 'arch', scale: 'outcrop', dimensions: [11.2, 8.5, 5.4], stability: true, collapseStage: 'arch' },
    ],
  },
  {
    id: 'columnar-entablature-basalt',
    label: 'Columnar / entablature basalt',
    mechanism: 'polygonal colonnade, vertical cooling joints, disordered entablature',
    threshold: 0.82,
    variants: [
      { id: 'basalt-colonnade', lithology: 'basalt', landform: 'column-field', scale: 'outcrop', dimensions: [9.4, 8.6, 6.8] },
      { id: 'basalt-entablature', lithology: 'basalt', landform: 'column-field', scale: 'outcrop', dimensions: [9.1, 8.2, 6.5] },
    ],
  },
  {
    id: 'bedded-karst-limestone',
    label: 'Bedded karst limestone',
    mechanism: 'bedding, orthogonal joints, solution runnels, supported voids',
    threshold: 0.78,
    variants: [
      { id: 'limestone-spire', lithology: 'micritic-limestone', landform: 'karst-spire', scale: 'outcrop', dimensions: [6.6, 11.4, 5.8] },
      { id: 'limestone-cave', lithology: 'micritic-limestone', landform: 'cave-mouth', scale: 'outcrop', dimensions: [10.4, 7.7, 6.5], stability: true, collapseStage: 'cave' },
    ],
  },
  {
    id: 'fissile-shale-slate',
    label: 'Fissile shale / slate',
    mechanism: 'thin bedding or slaty cleavage, platy breakage, slope-forming debris',
    threshold: 0.76,
    variants: [
      { id: 'shale-slope', lithology: 'shale', landform: 'slope', scale: 'outcrop', dimensions: [10.8, 5.8, 8.2] },
      { id: 'slate-outcrop', lithology: 'slate', landform: 'outcrop', scale: 'outcrop', dimensions: [8.5, 7.2, 5.2] },
    ],
  },
  {
    id: 'folded-foliated-metamorphic',
    label: 'Folded / foliated gneiss and schist',
    mechanism: 'continuous folded foliation, compositional bands, joint-bounded mass',
    threshold: 0.76,
    variants: [
      { id: 'gneiss-outcrop', lithology: 'gneiss', landform: 'outcrop', scale: 'outcrop', dimensions: [10.4, 8.2, 6.3] },
      { id: 'schist-outcrop', lithology: 'mica-schist', landform: 'outcrop', scale: 'outcrop', dimensions: [9.2, 7.1, 5.8] },
    ],
  },
  {
    id: 'coarse-clastic-conglomerate-breccia',
    label: 'Conglomerate / volcanic breccia',
    mechanism: 'discrete clasts, supported contacts, clast breakout and matrix retreat',
    threshold: 0.80,
    variants: [
      { id: 'conglomerate-outcrop', lithology: 'conglomerate', landform: 'outcrop', scale: 'outcrop', dimensions: [9.3, 7.4, 6.4] },
      { id: 'volcanic-breccia-outcrop', lithology: 'volcanic-breccia', landform: 'outcrop', scale: 'outcrop', dimensions: [8.8, 7.1, 6.1] },
    ],
  },
  {
    id: 'transported-river-talus',
    label: 'Transported river boulder / inherited talus',
    mechanism: 'transport rounding, source lineage, sorting, imbrication, stable deposition',
    threshold: 0.78,
    variants: [
      { id: 'river-boulder', lithology: 'granodiorite', landform: 'boulder', scale: 'prop', dimensions: [4.4, 2.6, 3.3], detached: true },
      { id: 'talus-assembly', lithology: 'quartzite', landform: 'talus-fan', scale: 'outcrop', dimensions: [10.8, 4.8, 8.7], detached: true, source: true },
    ],
  },
]);

function rescaleRecipe(recipe, dimensions) {
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

function scaleForMaximumDimension(maximumDimension) {
  if (maximumDimension <= 5) return 'prop';
  if (maximumDimension <= 50) return 'outcrop';
  if (maximumDimension <= 200) return 'module';
  return 'formation';
}

function makeRecipe(definition, variant, qualityTier, seed, catalog) {
  const recipe = structuredClone(createHeroRockRecipe(variant.lithology, { catalog, qualityTier, seed }));
  rescaleRecipe(recipe, variant.dimensions);
  recipe.id = `c8-${definition.id}-${variant.id}-${qualityTier}-${seed}`;
  recipe.label = `C8 ${definition.label} — ${variant.id}`;
  recipe.description = `${recipe.description}; C8 bounded basis specimen for ${definition.mechanism}.`;
  recipe.landform = variant.landform;
  recipe.scale = variant.scale;
  if (variant.detached !== undefined) recipe.processContext.detached = variant.detached;
  if (variant.source) {
    recipe.processContext.sourceFormationId = recipe.formationId;
    recipe.processContext.sourceLithology = recipe.lithology;
  }
  if (variant.stability) {
    recipe.processContext.stability = { mode: 'support-graph', passed: true };
    recipe.processContext.collapseStage = variant.collapseStage;
  }
  return parseRockRecipe(recipe, { catalog }).recipe;
}

export function listC8BasisDefinitions() {
  return DEFINITIONS;
}

export function createC8BasisFixture(familyId, qualityTier, seedIndex, options = {}) {
  const catalog = options.catalog ?? loadGeologyCatalog();
  const definition = DEFINITIONS.find((candidate) => candidate.id === familyId);
  if (!definition) throw new RangeError(`Unknown C8 basis family: ${familyId}`);
  if (!Object.hasOwn(C8_BASIS_MATRIX, qualityTier)) throw new RangeError(`Unknown C8 quality tier: ${qualityTier}`);
  if (!Number.isInteger(seedIndex) || seedIndex < 0 || seedIndex >= C8_BASIS_MATRIX[qualityTier].seedsPerFamily) {
    throw new RangeError(`C8 ${qualityTier} seed index must be inside its predeclared tier population.`);
  }
  const variantIndex = seedIndex % definition.variants.length;
  const variant = definition.variants[variantIndex];
  const tierOffset = { draft: 0, production: 10_000, hero: 20_000 }[qualityTier];
  const familyIndex = DEFINITIONS.indexOf(definition);
  const seed = 80_000 + tierOffset + familyIndex * 1000 + seedIndex;
  return Object.freeze({
    definition,
    heroRole: qualityTier === 'hero' ? C8_HERO_ROLES[seedIndex] : null,
    qualityTier,
    recipe: makeRecipe(definition, variant, qualityTier, seed, catalog),
    seedIndex,
    variant,
  });
}

export function createC8BasisFixtures(options = {}) {
  const catalog = options.catalog ?? loadGeologyCatalog();
  return Object.freeze(Object.fromEntries(DEFINITIONS.map((definition) => [
    definition.id,
    Object.freeze(Object.fromEntries(Object.keys(C8_BASIS_MATRIX).map((qualityTier) => [
      qualityTier,
      Object.freeze(Array.from(
        { length: C8_BASIS_MATRIX[qualityTier].seedsPerFamily },
        (_, seedIndex) => createC8BasisFixture(definition.id, qualityTier, seedIndex, { catalog }),
      )),
    ]))),
  ])));
}

export function scaleC8BasisFixture(fixture, scaleFactor, options = {}) {
  if (!(scaleFactor > 0) || !Number.isFinite(scaleFactor)) throw new RangeError('C8 scale factor must be finite and positive.');
  const catalog = options.catalog ?? loadGeologyCatalog();
  const recipe = structuredClone(fixture.recipe);
  const dimensions = recipe.targetDimensionsMetres.map((value) => value * scaleFactor);
  rescaleRecipe(recipe, dimensions);
  recipe.scale = scaleForMaximumDimension(Math.max(...dimensions));
  recipe.id = `${fixture.recipe.id}-scale-${String(scaleFactor).replace('.', 'p')}`;
  recipe.label = `${fixture.recipe.label} — ${scaleFactor}x recompile`;
  return Object.freeze({
    ...fixture,
    recipe: parseRockRecipe(recipe, { catalog }).recipe,
    scaleFactor,
  });
}
