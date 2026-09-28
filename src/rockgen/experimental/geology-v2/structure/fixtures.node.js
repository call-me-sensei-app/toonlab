import { loadGeologyCatalog } from '../catalog.node.js';
import { createHeroRockRecipe } from '../recipe.node.js';

function cloneHero(lithologyId, seed, catalog) {
  return structuredClone(createHeroRockRecipe(lithologyId, { catalog, seed }));
}

function appendSequentialEvent(recipe, event) {
  const previous = [...recipe.chronology.nodes].sort((a, b) => b.order - a.order)[0];
  recipe.chronology.nodes.push(event);
  recipe.chronology.edges.push({ before: previous.id, after: event.id, relationship: 'precedes' });
}

function planarBedding(catalog) {
  const recipe = cloneHero('quartz-arenite', 4101, catalog);
  recipe.id = 'c4-planar-bedding';
  recipe.label = 'C4 analytic planar bedding';
  recipe.fabrics = ['planar-bedding', 'thick-bedding'];
  recipe.landform = 'stratified-ridge';
  recipe.geologyTransform = {
    dipDegrees: 28,
    dipDirectionDegrees: 127,
    originMetres: [0, 0, 0],
    strikeDegrees: 37,
  };
  recipe.depositionalHistory.bedding.strikeDegrees = 37;
  recipe.depositionalHistory.bedding.dipDegrees = 28;
  return recipe;
}

function foldedBedding(catalog) {
  const recipe = cloneHero('shale', 4102, catalog);
  recipe.id = 'c4-folded-bedding';
  recipe.label = 'C4 analytic folded bedding';
  recipe.landform = 'folded-ridge';
  return recipe;
}

function faultedFabric(catalog) {
  const recipe = cloneHero('mylonite', 4103, catalog);
  recipe.id = 'c4-faulted-fabric';
  recipe.label = 'C4 analytic finite fault';
  return recipe;
}

function unconformity(catalog) {
  const recipe = cloneHero('quartz-arenite', 4104, catalog);
  recipe.id = 'c4-unconformity';
  recipe.label = 'C4 analytic erosional unconformity';
  recipe.fabrics = [...new Set([...recipe.fabrics, 'unconformity'])];
  appendSequentialEvent(recipe, { id: 'erosion', kind: 'erosion', order: 40 });
  appendSequentialEvent(recipe, { id: 'younger-deposition', kind: 'deposition', order: 50 });
  return recipe;
}

function dyke(catalog) {
  const recipe = cloneHero('dolerite', 4105, catalog);
  recipe.id = 'c4-dyke';
  recipe.label = 'C4 analytic dyke';
  recipe.hostLithology = 'quartz-arenite';
  recipe.fabrics = [...new Set([...recipe.fabrics, 'dyke-contact'])];
  return recipe;
}

function sill(catalog) {
  const recipe = cloneHero('dolerite', 4106, catalog);
  recipe.id = 'c4-sill';
  recipe.label = 'C4 analytic sill';
  recipe.landform = 'sill';
  recipe.hostLithology = 'quartz-arenite';
  recipe.fabrics = [...new Set(recipe.fabrics.filter((fabric) => fabric !== 'dyke-contact').concat('sill-contact'))];
  return recipe;
}

function vein(catalog) {
  const recipe = cloneHero('pegmatite', 4107, catalog);
  recipe.id = 'c4-vein';
  recipe.label = 'C4 analytic vein';
  recipe.hostLithology = 'granite';
  recipe.fabrics = [...new Set([...recipe.fabrics, 'veined'])];
  return recipe;
}

function terminatedDyke(catalog) {
  const recipe = dyke(catalog);
  recipe.id = 'c4-terminated-dyke';
  recipe.label = 'C4 analytic terminated dyke';
  appendSequentialEvent(recipe, { id: 'erosion', kind: 'erosion', order: 40 });
  recipe.chronology.edges.push({ before: 'formation', after: 'erosion', relationship: 'terminates-at' });
  return recipe;
}

function faultedDyke(catalog) {
  const recipe = dyke(catalog);
  recipe.id = 'c4-faulted-dyke';
  recipe.label = 'C4 analytic faulted dyke';
  recipe.fabrics = [...new Set([...recipe.fabrics, 'fault-brecciation'])];
  appendSequentialEvent(recipe, { id: 'fault-event', kind: 'deformation', order: 40 });
  recipe.chronology.edges.push({ before: 'formation', after: 'fault-event', relationship: 'offsets' });
  return recipe;
}

function faultedUnconformity(catalog) {
  const recipe = unconformity(catalog);
  recipe.id = 'c4-faulted-unconformity';
  recipe.label = 'C4 analytic faulted unconformity';
  recipe.fabrics = [...new Set([...recipe.fabrics, 'fault-brecciation'])];
  appendSequentialEvent(recipe, { id: 'fault-event', kind: 'deformation', order: 60 });
  for (const eventId of ['formation', 'erosion', 'younger-deposition']) {
    recipe.chronology.edges.push({ before: eventId, after: 'fault-event', relationship: 'offsets' });
  }
  return recipe;
}

function largestFormation(catalog) {
  const recipe = planarBedding(catalog);
  recipe.id = 'c4-largest-formation';
  recipe.label = 'C4 largest formation periodicity audit';
  recipe.targetDimensionsMetres = [5000, 1800, 3600];
  const maximum = Math.max(...recipe.targetDimensionsMetres);
  recipe.depositionalHistory.bedding.minimumThicknessMetres = maximum * 0.025;
  recipe.depositionalHistory.bedding.meanThicknessMetres = maximum * 0.06;
  recipe.depositionalHistory.bedding.maximumThicknessMetres = maximum * 0.14;
  return recipe;
}

export function createC4StructuralFixtures(options = {}) {
  const catalog = options.catalog ?? loadGeologyCatalog();
  return Object.freeze({
    dyke: dyke(catalog),
    faultedDyke: faultedDyke(catalog),
    faultedFabric: faultedFabric(catalog),
    faultedUnconformity: faultedUnconformity(catalog),
    foldedBedding: foldedBedding(catalog),
    largestFormation: largestFormation(catalog),
    planarBedding: planarBedding(catalog),
    sill: sill(catalog),
    terminatedDyke: terminatedDyke(catalog),
    unconformity: unconformity(catalog),
    vein: vein(catalog),
  });
}

export function createC4InvalidStructuralFixtures(options = {}) {
  const catalog = options.catalog ?? loadGeologyCatalog();
  const inconsistentOrientation = planarBedding(catalog);
  inconsistentOrientation.id = 'c4-invalid-orientation';
  inconsistentOrientation.geologyTransform.dipDirectionDegrees = 142;

  const missingFoldEvent = foldedBedding(catalog);
  missingFoldEvent.id = 'c4-invalid-fold-chronology';
  missingFoldEvent.chronology.nodes = missingFoldEvent.chronology.nodes.filter((node) => node.id !== 'deformation');
  missingFoldEvent.chronology.edges = [
    { before: 'formation', after: 'fracture', relationship: 'precedes' },
    { before: 'fracture', after: 'process-01', relationship: 'precedes' },
    { before: 'process-01', after: 'process-02', relationship: 'precedes' },
  ];

  const missingFaultOffset = faultedFabric(catalog);
  missingFaultOffset.id = 'c4-invalid-fault-offset';
  missingFaultOffset.chronology.edges = missingFaultOffset.chronology.edges.filter((edge) => edge.relationship !== 'offsets');

  const missingUnconformityEvents = planarBedding(catalog);
  missingUnconformityEvents.id = 'c4-invalid-unconformity';
  missingUnconformityEvents.fabrics.push('unconformity');

  const incompatibleCoolingLimestone = cloneHero('micritic-limestone', 4199, catalog);
  incompatibleCoolingLimestone.id = 'c4-invalid-cooling-limestone';
  incompatibleCoolingLimestone.fabrics.push('cooling-columns');

  return Object.freeze({
    incompatibleCoolingLimestone,
    inconsistentOrientation,
    missingFaultOffset,
    missingFoldEvent,
    missingUnconformityEvents,
  });
}
