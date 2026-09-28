import { loadGeologyCatalog } from '../catalog.node.js';
import { createHeroRockRecipe, parseRockRecipe } from '../recipe.node.js';

const TRANSPORT = new Set(['rockfall', 'collapse', 'transport-rounding', 'sorting', 'imbrication', 'burial', 'talus-deposition']);

function fixture(catalog, lithology, id, processes, mutate = () => {}) {
  const recipe = structuredClone(createHeroRockRecipe(lithology, { catalog, seed: 6100 + id.length * 17 }));
  recipe.id = `c6-${id}`;
  recipe.label = `C6 causal fixture — ${id}`;
  recipe.processes = [...processes];
  recipe.weathering.processes = [...processes];
  const prefix = recipe.chronology.nodes
    .filter((node) => node.order <= recipe.chronology.nodes.find((candidate) => candidate.id === 'fracture').order)
    .sort((left, right) => left.order - right.order);
  recipe.chronology.nodes = [
    ...prefix,
    ...processes.map((process, index) => ({
      id: `process-${String(index + 1).padStart(2, '0')}`,
      kind: TRANSPORT.has(process) ? 'transport' : 'weathering',
      order: 30 + index,
    })),
  ];
  recipe.chronology.edges = recipe.chronology.nodes.slice(1).map((node, index) => ({
    after: node.id,
    before: recipe.chronology.nodes[index].id,
    relationship: 'precedes',
  }));
  mutate(recipe);
  return parseRockRecipe(recipe, { catalog }).recipe;
}

export function createC6ProcessFixtures(options = {}) {
  const catalog = options.catalog ?? loadGeologyCatalog();
  return Object.freeze({
    aeolian: fixture(catalog, 'quartz-arenite', 'aeolian', ['aeolian-abrasion', 'wind-deflation'], (recipe) => {
      recipe.environment = 'arid';
      recipe.weathering.moistureNormalized = 0.18;
      recipe.weathering.thermalCyclesPerYear = 320;
    }),
    combinedA: fixture(catalog, 'granite', 'combined-a', ['spheroidal-weathering', 'exfoliation', 'freeze-thaw'], (recipe) => {
      recipe.weathering.moistureNormalized = 0.62;
      recipe.weathering.freezeThawCyclesPerYear = 78;
    }),
    combinedB: fixture(catalog, 'granite', 'combined-b', ['freeze-thaw', 'exfoliation', 'spheroidal-weathering'], (recipe) => {
      recipe.weathering.moistureNormalized = 0.62;
      recipe.weathering.freezeThawCyclesPerYear = 78;
    }),
    exfoliation: fixture(catalog, 'granite', 'exfoliation', ['exfoliation', 'pressure-release']),
    fluvial: fixture(catalog, 'pumice', 'fluvial', ['fluvial-abrasion', 'pothole-erosion'], (recipe) => {
      recipe.environment = 'fluvial';
      if (recipe.depositionalHistory) recipe.depositionalHistory.environment = 'fluvial';
      recipe.weathering.moistureNormalized = 0.86;
      recipe.processContext.waterRoutingNormalized = 0.82;
    }),
    freezeThaw: fixture(catalog, 'granodiorite', 'freeze-thaw', ['freeze-thaw', 'crack-propagation'], (recipe) => {
      recipe.weathering.moistureNormalized = 0.72;
      recipe.weathering.freezeThawCyclesPerYear = 105;
    }),
    glacial: fixture(catalog, 'anorthosite', 'glacial', ['glacial-abrasion', 'glacial-plucking', 'glacial-striation'], (recipe) => {
      recipe.environment = 'glacial';
      recipe.weathering.freezeThawCyclesPerYear = 110;
    }),
    karst: fixture(catalog, 'micritic-limestone', 'karst', ['karst-dissolution'], (recipe) => {
      recipe.processContext.waterRoutingNormalized = 0.9;
      recipe.weathering.moistureNormalized = 0.88;
      recipe.weathering.exposureYears = 280000;
    }),
    marine: fixture(catalog, 'shale', 'marine', ['marine-abrasion', 'marine-undercut'], (recipe) => {
      recipe.environment = 'coastal';
      recipe.weathering.moistureNormalized = 0.86;
      recipe.processContext.saltExposureNormalized = 0.72;
    }),
    spheroidal: fixture(catalog, 'granite', 'spheroidal', ['spheroidal-weathering']),
    tafoni: fixture(catalog, 'quartz-arenite', 'tafoni', ['tafoni-weathering'], (recipe) => {
      recipe.materialProperties.porosityFraction = 0.18;
      recipe.materialProperties.permeabilitySquareMetres = 1e-12;
      recipe.processContext.saltExposureNormalized = 0.82;
      recipe.weathering.moistureNormalized = 0.46;
      recipe.weathering.exposureYears = 65000;
    }),
    talus: fixture(catalog, 'quartzite', 'talus', ['freeze-thaw', 'rockfall', 'talus-deposition', 'sorting', 'imbrication'], (recipe) => {
      recipe.landform = 'talus-fan';
      recipe.processContext.detached = true;
      recipe.processContext.sourceFormationId = recipe.formationId;
      recipe.processContext.sourceLithology = recipe.lithology;
      recipe.processContext.transportDistanceMetres = 180;
      const maximumDimension = Math.max(...recipe.targetDimensionsMetres);
      const baseSet = recipe.fractureHistory.sets[0];
      const spanningSet = {
        ...baseSet,
        orientationConcentration: 64,
        persistenceMetres: maximumDimension * 2.2,
        sizeDistribution: {
          ...baseSet.sizeDistribution,
          maximumMetres: maximumDimension * 2.4,
          meanMetres: maximumDimension * 2,
          minimumMetres: maximumDimension * 1.5,
          standardDeviationNormalized: 0.12,
        },
      };
      recipe.fractureHistory.sets = [
        { ...spanningSet, id: 'talus-joints-a', meanStrikeDegrees: 8, meanDipDegrees: 84, spacingMetres: maximumDimension * 0.18 },
        { ...spanningSet, id: 'talus-joints-b', meanStrikeDegrees: 96, meanDipDegrees: 79, spacingMetres: maximumDimension * 0.2 },
        { ...spanningSet, id: 'talus-joints-c', meanStrikeDegrees: 42, meanDipDegrees: 28, spacingMetres: maximumDimension * 0.24 },
      ];
    }),
    thermalSalt: fixture(catalog, 'tuff', 'thermal-salt', ['thermal-weathering', 'salt-weathering'], (recipe) => {
      recipe.materialProperties.porosityFraction = 0.2;
      recipe.processContext.saltExposureNormalized = 0.78;
      recipe.weathering.moistureNormalized = 0.36;
      recipe.weathering.thermalCyclesPerYear = 340;
    }),
    transport: fixture(catalog, 'granodiorite', 'transport', ['transport-rounding', 'sorting', 'imbrication'], (recipe) => {
      recipe.environment = 'fluvial';
      recipe.processContext.detached = true;
      recipe.processContext.transportDistanceMetres = 12000;
      recipe.weathering.moistureNormalized = 0.82;
    }),
  });
}
