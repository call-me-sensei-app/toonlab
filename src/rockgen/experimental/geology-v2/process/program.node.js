import { canonicalizeJson, contentId, deriveNamespacedSeed } from '../canonical.node.js';
import { parseRockRecipe } from '../recipe.node.js';

export const PROCESS_FIELD_PROGRAM_SCHEMA = 'toonlab/rock-process-field-program';
export const PROCESS_FIELD_PROGRAM_VERSION = 1;

const PROCESS_KERNELS = Object.freeze({
  'spheroidal-weathering': ['spheroidal'],
  exfoliation: ['exfoliation'],
  'pressure-release': ['exfoliation'],
  'freeze-thaw': ['freeze-thaw'],
  'crack-propagation': ['freeze-thaw'],
  'thermal-weathering': ['thermal-salt'],
  'salt-weathering': ['thermal-salt', 'tafoni'],
  'case-hardening': ['tafoni'],
  'tafoni-weathering': ['tafoni'],
  'karst-dissolution': ['karst'],
  'evaporite-dissolution': ['karst'],
  'marine-abrasion': ['marine'],
  'marine-undercut': ['marine'],
  'fluvial-abrasion': ['fluvial'],
  'pothole-erosion': ['fluvial'],
  'aeolian-abrasion': ['aeolian'],
  'wind-deflation': ['aeolian'],
  'glacial-abrasion': ['glacial'],
  'glacial-plucking': ['glacial'],
  'glacial-striation': ['glacial'],
});

const TRANSPORT_PROCESSES = new Set([
  'rockfall', 'collapse', 'transport-rounding', 'sorting', 'imbrication',
  'burial', 'talus-deposition',
]);

function kernelDescriptors(processes) {
  const descriptors = [];
  processes.forEach((processId, processIndex) => {
    const kernelIds = PROCESS_KERNELS[processId] ?? [];
    kernelIds.forEach((kernelId, suborder) => descriptors.push({
      id: `${String(processIndex + 1).padStart(2, '0')}-${String(suborder + 1).padStart(2, '0')}-${kernelId}`,
      kernelId,
      processIndex,
      sourceProcessId: processId,
      suborder,
    }));
  });
  return descriptors;
}

/**
 * Compile only the already-authorized RockRecipe fields into deterministic C6
 * state. Kernel constants remain compiler-version state rather than hidden
 * recipe parameters.
 */
export function compileProcessFieldProgram(recipeValue, structuralProgram, fractureStage, options = {}) {
  const parsed = parseRockRecipe(recipeValue, options);
  if (structuralProgram.recipeContentId !== parsed.contentId) {
    throw new RangeError('Process fields require the StructuralFieldProgram compiled from the same RockRecipe.');
  }
  if (fractureStage.recipeContentId !== parsed.contentId
    || fractureStage.structureProgramContentId !== structuralProgram.programContentId) {
    throw new RangeError('Process fields require the matching frozen C5 fracture/block output.');
  }
  const recipe = parsed.recipe;
  const base = {
    schema: PROCESS_FIELD_PROGRAM_SCHEMA,
    version: PROCESS_FIELD_PROGRAM_VERSION,
    compilerPolicy: {
      cavityComposition: 'chronological-damage-conditioned-csg-difference',
      detachment: 'weathered-c5-support-graph-reachability',
      fieldSign: 'negative-is-retained-rock',
      massAccounting: 'c5-cell-volume-exact',
      timeLaw: 'monotonic-normalized-exposure',
    },
    environment: recipe.environment,
    exposureYears: recipe.weathering.exposureYears,
    fields: {
      freezeThawCyclesPerYear: recipe.weathering.freezeThawCyclesPerYear,
      moistureNormalized: recipe.weathering.moistureNormalized,
      saltExposureNormalized: recipe.processContext.saltExposureNormalized,
      thermalCyclesPerYear: recipe.weathering.thermalCyclesPerYear,
      waterRoutingNormalized: recipe.processContext.waterRoutingNormalized,
    },
    fractureBlockOutputContentId: fractureStage.outputContentId,
    kernels: kernelDescriptors(recipe.processes),
    lithology: recipe.lithology,
    processes: [...recipe.processes],
    recipeContentId: parsed.contentId,
    seeds: {
      transport: deriveNamespacedSeed(recipe.seed, recipe.seedNamespaces.transport),
      weathering: deriveNamespacedSeed(recipe.seed, recipe.seedNamespaces.weathering),
    },
    source: {
      detached: recipe.processContext.detached,
      formationId: recipe.formationId,
      landform: recipe.landform,
      sourceFormationId: recipe.processContext.sourceFormationId,
      sourceLithology: recipe.processContext.sourceLithology,
    },
    stability: { ...recipe.processContext.stability },
    structureProgramContentId: structuralProgram.programContentId,
    targetDimensionsMetres: [...recipe.targetDimensionsMetres],
    transport: {
      distanceMetres: recipe.processContext.transportDistanceMetres,
      enabledProcesses: recipe.processes.filter((process) => TRANSPORT_PROCESSES.has(process)),
    },
  };
  return canonicalizeJson({ ...base, programContentId: contentId(base) });
}

export function processKernelCoverage(program) {
  return [...new Set(program.kernels.map((kernel) => kernel.kernelId))].sort();
}
