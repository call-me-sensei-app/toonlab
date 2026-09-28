import { loadGeologyCatalog } from '../catalog.node.js';
import { createHeroRockRecipe } from '../recipe.node.js';
import { createC4StructuralFixtures } from '../structure/fixtures.node.js';

function set({
  apertureMetres = 0.035,
  chronologyNodeId = 'fracture',
  concentration = 800,
  dip,
  distribution = 'uniform',
  id,
  kind = 'joint',
  persistenceMetres = 70,
  roughnessMetres = 0.012,
  spacingMetres = 6,
  strike,
}) {
  return {
    apertureMetres,
    chronologyNodeId,
    id,
    kind,
    meanDipDegrees: dip,
    meanStrikeDegrees: strike,
    orientationConcentration: concentration,
    persistenceMetres,
    roughnessMetres,
    sizeDistribution: {
      // The four analytic block bases deliberately span their 24–36 m parent
      // volumes so the blind sort isolates joint-set geometry. The panels are
      // still finite; separate fixtures exercise visible tips and termination.
      maximumMetres: 160,
      meanMetres: 140,
      minimumMetres: 120,
      standardDeviationNormalized: distribution === 'power-law' ? 0.7 : 0.25,
      type: distribution,
    },
    spacingMetres,
  };
}

function basisRecipe(catalog, id, label, dimensions, sets) {
  const recipe = structuredClone(createHeroRockRecipe('granite', {
    catalog,
    seed: 5100 + sets.length,
    targetDimensionsMetres: dimensions,
  }));
  recipe.id = id;
  recipe.label = label;
  recipe.landform = 'block';
  recipe.scale = 'outcrop';
  recipe.fractureHistory.sets = sets;
  return recipe;
}

function equidimensional(catalog) {
  return basisRecipe(catalog, 'c5-equidimensional-blocks', 'C5 equidimensional blocks', [24, 24, 24], [
    set({ id: 'east-west-joints', strike: 0, dip: 90, spacingMetres: 6 }),
    set({ id: 'north-south-joints', strike: 90, dip: 90, spacingMetres: 6, distribution: 'lognormal' }),
    set({ id: 'horizontal-joints', strike: 0, dip: 0, spacingMetres: 6, kind: 'sheet', distribution: 'power-law' }),
  ]);
}

function rhombohedral(catalog) {
  return basisRecipe(catalog, 'c5-rhombohedral-blocks', 'C5 rhombohedral blocks', [24, 24, 24], [
    set({ id: 'oblique-a', strike: 0, dip: 64, spacingMetres: 6 }),
    set({ id: 'oblique-b', strike: 58, dip: 67, spacingMetres: 6, distribution: 'lognormal' }),
    set({ id: 'oblique-c', strike: 121, dip: 62, spacingMetres: 6, distribution: 'power-law' }),
  ]);
}

function tabular(catalog) {
  return basisRecipe(catalog, 'c5-tabular-blocks', 'C5 tabular blocks', [28, 18, 24], [
    set({ id: 'sheet-joints', strike: 12, dip: 4, spacingMetres: 2.2, kind: 'sheet' }),
  ]);
}

function polyhedral(catalog) {
  return basisRecipe(catalog, 'c5-polyhedral-blocks', 'C5 polyhedral blocks', [24, 22, 24], [
    set({ id: 'poly-a', strike: 3, dip: 55, spacingMetres: 7 }),
    set({ id: 'poly-b', strike: 47, dip: 72, spacingMetres: 7, distribution: 'lognormal' }),
    set({ id: 'poly-c', strike: 101, dip: 63, spacingMetres: 7, distribution: 'power-law' }),
    set({ id: 'poly-d', strike: 154, dip: 78, spacingMetres: 7 }),
  ]);
}

function terminatedAtUnconformity(catalog) {
  const recipe = structuredClone(createC4StructuralFixtures({ catalog }).unconformity);
  recipe.id = 'c5-joints-terminated-at-unconformity';
  recipe.label = 'C5 joints terminated at unconformity';
  recipe.targetDimensionsMetres = [240, 160, 200];
  recipe.fractureHistory.sets = [set({
    id: 'pre-erosion-joints',
    strike: 8,
    dip: 82,
    spacingMetres: 24,
    persistenceMetres: 360,
  })];
  recipe.fractureHistory.sets[0].sizeDistribution = {
    maximumMetres: 440,
    meanMetres: 380,
    minimumMetres: 320,
    standardDeviationNormalized: 0.2,
    type: 'lognormal',
  };
  return recipe;
}

function faultOffsetJoints(catalog) {
  const recipe = structuredClone(createC4StructuralFixtures({ catalog }).faultedUnconformity);
  recipe.id = 'c5-fault-offset-joints';
  recipe.label = 'C5 fault-offset joints';
  recipe.targetDimensionsMetres = [240, 160, 200];
  recipe.chronology.edges.push({ before: 'fracture', after: 'fault-event', relationship: 'offsets' });
  recipe.fractureHistory.sets = [set({
    id: 'offset-joints',
    strike: 20,
    dip: 76,
    spacingMetres: 24,
    persistenceMetres: 300,
  })];
  recipe.fractureHistory.sets[0].sizeDistribution = {
    maximumMetres: 380,
    meanMetres: 320,
    minimumMetres: 260,
    standardDeviationNormalized: 0.2,
    type: 'uniform',
  };
  return recipe;
}

function hierarchy(catalog) {
  const recipe = basisRecipe(catalog, 'c5-joint-hierarchy', 'C5 joint hierarchy', [36, 28, 34], []);
  recipe.chronology.nodes.push({ id: 'late-fracture', kind: 'fracture', order: 40 });
  recipe.chronology.edges.push(
    { before: 'process-02', after: 'late-fracture', relationship: 'precedes' },
    { before: 'fracture', after: 'late-fracture', relationship: 'terminates-at' },
  );
  recipe.fractureHistory.sets = [
    set({ id: 'early-primary', strike: 5, dip: 84, spacingMetres: 8, persistenceMetres: 60, chronologyNodeId: 'fracture' }),
    set({ id: 'late-cross-joints', strike: 92, dip: 78, spacingMetres: 9, persistenceMetres: 50, chronologyNodeId: 'late-fracture', distribution: 'power-law' }),
  ];
  return recipe;
}

function beddingDeflection(catalog) {
  const recipe = structuredClone(createHeroRockRecipe('shale', {
    catalog,
    seed: 5198,
    targetDimensionsMetres: [240, 150, 200],
  }));
  recipe.id = 'c5-bedding-deflection';
  recipe.label = 'C5 bedding deflection metadata';
  recipe.chronology.edges.push({ before: 'formation', after: 'fracture', relationship: 'deflects-along' });
  recipe.fractureHistory.sets = [set({
    id: 'bed-deflected-cleavage',
    strike: 32,
    dip: 18,
    spacingMetres: 24,
    persistenceMetres: 300,
    kind: 'cleavage',
  })];
  recipe.fractureHistory.sets[0].sizeDistribution = {
    maximumMetres: 380,
    meanMetres: 320,
    minimumMetres: 260,
    standardDeviationNormalized: 0.2,
    type: 'lognormal',
  };
  return recipe;
}

export function createC5FractureFixtures(options = {}) {
  const catalog = options.catalog ?? loadGeologyCatalog();
  return Object.freeze({
    beddingDeflection: beddingDeflection(catalog),
    equidimensional: equidimensional(catalog),
    faultOffsetJoints: faultOffsetJoints(catalog),
    hierarchy: hierarchy(catalog),
    polyhedral: polyhedral(catalog),
    rhombohedral: rhombohedral(catalog),
    tabular: tabular(catalog),
    terminatedAtUnconformity: terminatedAtUnconformity(catalog),
  });
}
