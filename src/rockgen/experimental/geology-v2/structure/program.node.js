import { canonicalizeJson, contentId, deriveNamespacedSeed } from '../canonical.node.js';
import { loadGeologyCatalog } from '../catalog.node.js';
import { RockGeologyError } from '../errors.js';
import { parseRockRecipe } from '../recipe.node.js';
import {
  circularDifferenceDegrees,
  createOrientationFrame,
  hash01,
  scale3,
} from './math.node.js';

export const STRUCTURAL_FIELD_PROGRAM_SCHEMA = 'toonlab/rock-structural-field-program';
export const STRUCTURAL_FIELD_PROGRAM_VERSION = 1;

const BEDDING_FABRICS = new Set([
  'laminated', 'planar-bedding', 'thin-bedding', 'medium-bedding', 'thick-bedding',
  'very-thick-bedding', 'cross-bedding', 'graded-bedding', 'folded-bedding',
  'unconformity',
]);
const FOLIATION_FABRICS = new Set([
  'slaty-cleavage', 'phyllitic-foliation', 'schistosity', 'crenulation',
  'gneissic-banding', 'migmatitic-banding', 'compositional-banding',
  'folded-foliation', 'shear-foliation', 'mylonitic-foliation',
]);
const FOLDED_FABRICS = new Set(['folded-bedding', 'folded-foliation', 'drag-fold', 'crenulation']);
// Slickensides and fault-oriented joints are evidence of shear, but they do not
// by themselves define a finite displacement field. Only explicit fault fabric,
// process, or landform declarations request a fault operation.
const FAULT_FABRICS = new Set(['fault-brecciation', 'drag-fold']);

function fail(code, message, path, suggestion, details = {}) {
  throw new RockGeologyError(code, message, { details, path, suggestion });
}

function circular(value) {
  return ((value % 360) + 360) % 360;
}

function validateOrientation(name, strikeDegrees, dipDegrees, dipDirectionDegrees) {
  if (dipDegrees === 0) return;
  const expected = circular(strikeDegrees + 90);
  const difference = circularDifferenceDegrees(expected, dipDirectionDegrees);
  if (difference > 0.5) {
    fail(
      'STRUCTURE_ORIENTATION_INCONSISTENT',
      `${name} dip direction must be strike + 90° under the ToonLab right-hand-rule convention.`,
      '$.geologyTransform',
      'Correct strike/dip direction before compiling; the structural stage will not silently rotate authored geology.',
      { differenceDegrees: difference, dipDirectionDegrees, expectedDipDirectionDegrees: expected, strikeDegrees },
    );
  }
}

function compileChronology(recipe) {
  const nodes = [...recipe.chronology.nodes].sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const relationships = recipe.chronology.edges.map((edge) => ({
    ...edge,
    afterOrder: nodeById.get(edge.after).order,
    beforeOrder: nodeById.get(edge.before).order,
  })).sort((left, right) => left.beforeOrder - right.beforeOrder
    || left.afterOrder - right.afterOrder
    || left.relationship.localeCompare(right.relationship));
  const firstOfKind = (kind) => nodes.find((node) => node.kind === kind) ?? null;
  const formation = nodes.find((node) => ['deposition', 'intrusion', 'metamorphism'].includes(node.kind)) ?? nodes[0];
  return {
    deformationEvent: firstOfKind('deformation'),
    erosionEvent: firstOfKind('erosion'),
    formationEvent: formation,
    nodes,
    relationships,
    youngerDepositionEvent: nodes.find((node) => (
      node.kind === 'deposition' && node.order > (firstOfKind('erosion')?.order ?? Infinity)
    )) ?? null,
  };
}

function thicknessAt(seed, index, minimum, mean, maximum) {
  const primary = hash01(seed, index, 0, 0, 1);
  const secondary = hash01(seed, index, 0, 0, 2);
  const centered = (primary + secondary) * 0.5;
  if (centered <= 0.5) return minimum + (mean - minimum) * centered * 2;
  return mean + (maximum - mean) * (centered - 0.5) * 2;
}

function materialVariation(seed, index) {
  return {
    cementationFactor: 0.88 + hash01(seed, index, 0, 0, 11) * 0.24,
    hardnessFactor: 0.84 + hash01(seed, index, 0, 0, 12) * 0.32,
    permeabilityExponent: (hash01(seed, index, 0, 0, 13) - 0.5) * 1.2,
    porosityFactor: 0.82 + hash01(seed, index, 0, 0, 14) * 0.36,
  };
}

function buildLayers({ classId, extent, recipe, seed }) {
  const maximumDimension = Math.max(...recipe.targetDimensionsMetres);
  let distribution;
  let kind;
  if (recipe.depositionalHistory || recipe.fabrics.some((fabric) => BEDDING_FABRICS.has(fabric))) {
    const bedding = recipe.depositionalHistory?.bedding;
    if (!bedding) {
      fail(
        'STRUCTURE_BEDDING_HISTORY_REQUIRED',
        'A bedding fabric requires explicit depositional thickness history.',
        '$.depositionalHistory',
        'Provide minimum, mean, and maximum bedding thickness in the frozen recipe contract.',
      );
    }
    distribution = {
      maximumMetres: bedding.maximumThicknessMetres,
      meanMetres: bedding.meanThicknessMetres,
      minimumMetres: bedding.minimumThicknessMetres,
    };
    kind = 'sedimentary-stratigraphy';
  } else if (classId === 'metamorphic') {
    const spacing = recipe.metamorphicFabric?.spacingMetres;
    if (!(spacing > 0)) {
      fail(
        'STRUCTURE_METAMORPHIC_SPACING_REQUIRED',
        'Metamorphic structural fields require an explicit foliation spacing.',
        '$.metamorphicFabric.spacingMetres',
        'Provide a positive SI spacing in the recipe.',
      );
    }
    distribution = {
      maximumMetres: spacing * 1.55,
      meanMetres: spacing,
      minimumMetres: spacing * 0.52,
    };
    kind = 'metamorphic-foliation';
  } else if (recipe.fabrics.includes('flow-banding')) {
    distribution = {
      maximumMetres: maximumDimension * 0.075,
      meanMetres: maximumDimension * 0.04,
      minimumMetres: maximumDimension * 0.018,
    };
    kind = 'igneous-flow-banding';
  } else {
    return {
      contactAmplitudeMetres: 0,
      contactNoiseScaleMetres: maximumDimension,
      contacts: [-extent, extent],
      distribution: null,
      kind: 'massive',
      units: [{
        bottomMetres: -extent,
        id: `${recipe.lithology}/massive-0000`,
        index: 0,
        topMetres: extent,
        variation: materialVariation(seed, 0),
      }],
    };
  }

  const units = [];
  let cursor = 0;
  let index = 0;
  while (cursor < extent) {
    const thickness = thicknessAt(
      seed,
      index,
      distribution.minimumMetres,
      distribution.meanMetres,
      distribution.maximumMetres,
    );
    units.push({
      bottomMetres: cursor,
      id: `${recipe.lithology}/unit-${index >= 0 ? `p${index}` : `n${Math.abs(index)}`}`,
      index,
      topMetres: Math.min(cursor + thickness, extent),
      variation: materialVariation(seed, index),
    });
    cursor += thickness;
    index += 1;
    if (index > 20_000) fail('STRUCTURE_LAYER_LIMIT', 'Layer generation exceeded 20,000 finite units.', '$.depositionalHistory.bedding', 'Increase minimum layer thickness or reduce formation dimensions.');
  }
  cursor = 0;
  index = -1;
  while (cursor > -extent) {
    const thickness = thicknessAt(
      seed,
      index,
      distribution.minimumMetres,
      distribution.meanMetres,
      distribution.maximumMetres,
    );
    units.push({
      bottomMetres: Math.max(cursor - thickness, -extent),
      id: `${recipe.lithology}/unit-n${Math.abs(index)}`,
      index,
      topMetres: cursor,
      variation: materialVariation(seed, index),
    });
    cursor -= thickness;
    index -= 1;
    if (index < -20_000) fail('STRUCTURE_LAYER_LIMIT', 'Layer generation exceeded 20,000 finite units.', '$.depositionalHistory.bedding', 'Increase minimum layer thickness or reduce formation dimensions.');
  }
  units.sort((left, right) => left.bottomMetres - right.bottomMetres);
  return {
    contactAmplitudeMetres: Math.min(distribution.minimumMetres * 0.09, distribution.meanMetres * 0.04),
    contactNoiseScaleMetres: distribution.meanMetres * 4.7,
    contacts: [units[0].bottomMetres, ...units.map((unit) => unit.topMetres)],
    distribution,
    kind,
    units,
  };
}

function primaryFabricFrame(recipe, classId) {
  const originMetres = recipe.geologyTransform.originMetres;
  if (recipe.depositionalHistory) {
    const bedding = recipe.depositionalHistory.bedding;
    return createOrientationFrame({
      dipDegrees: bedding.dipDegrees,
      dipDirectionDegrees: circular(bedding.strikeDegrees + 90),
      originMetres,
      strikeDegrees: bedding.strikeDegrees,
    });
  }
  if (classId === 'metamorphic') {
    const fabric = recipe.metamorphicFabric;
    return createOrientationFrame({
      dipDegrees: fabric.dipDegrees,
      dipDirectionDegrees: circular(fabric.strikeDegrees + 90),
      originMetres,
      strikeDegrees: fabric.strikeDegrees,
    });
  }
  return createOrientationFrame(recipe.geologyTransform);
}

function compileFolds(recipe, chronology, seed, primaryFrame) {
  if (!recipe.fabrics.some((fabric) => FOLDED_FABRICS.has(fabric))
    && recipe.landform !== 'folded-ridge') return [];
  const event = chronology.deformationEvent
    ?? chronology.nodes.find((node) => node.kind === 'metamorphism');
  if (!event) {
    fail(
      'STRUCTURE_FOLD_CHRONOLOGY_REQUIRED',
      'Folded fabric requires a deformation or metamorphism event.',
      '$.chronology',
      'Add an ordered deformation event after formation; folds cannot appear without chronology.',
    );
  }
  const maximumDimension = Math.max(...recipe.targetDimensionsMetres);
  const spacing = recipe.depositionalHistory?.bedding.meanThicknessMetres
    ?? recipe.metamorphicFabric?.spacingMetres
    ?? maximumDimension * 0.04;
  const sign = hash01(seed, 0, 0, 0, 21) < 0.5 ? -1 : 1;
  return [{
    amplitudeMetres: sign * Math.min(maximumDimension * 0.16, spacing * 3.4),
    axis: [...primaryFrame.strike],
    centerAcrossMetres: (hash01(seed, 0, 0, 0, 22) - 0.5) * maximumDimension * 0.18,
    eventId: event.id,
    eventOrder: event.order,
    halfWidthMetres: maximumDimension * (0.21 + hash01(seed, 0, 0, 0, 23) * 0.12),
    kind: 'finite-gaussian-fold',
  }];
}

function compileFaults(recipe, chronology, seed) {
  const requested = recipe.fabrics.some((fabric) => FAULT_FABRICS.has(fabric))
    || recipe.processes.includes('faulting')
    || recipe.landform === 'fault-scarp';
  if (!requested) return [];
  const event = chronology.nodes.find((node) => (
    node.kind === 'deformation'
    && chronology.relationships.some((edge) => edge.after === node.id && edge.relationship === 'offsets')
  )) ?? chronology.deformationEvent;
  if (!event) {
    fail(
      'STRUCTURE_FAULT_CHRONOLOGY_REQUIRED',
      'Fault structure requires an explicit deformation event.',
      '$.chronology',
      'Add a deformation node after the affected formation and an explicit offsets relationship.',
    );
  }
  const offsets = chronology.relationships.filter((edge) => edge.after === event.id && edge.relationship === 'offsets');
  if (offsets.length === 0) {
    fail(
      'STRUCTURE_FAULT_OFFSET_RELATIONSHIP_REQUIRED',
      'Fault deformation requires an explicit offsets chronology relationship.',
      '$.chronology.edges',
      'Connect the older affected event to the deformation event with relationship="offsets".',
    );
  }
  const maximumDimension = Math.max(...recipe.targetDimensionsMetres);
  const strikeDegrees = circular(recipe.geologyTransform.strikeDegrees + 28 + hash01(seed, 0, 0, 0, 31) * 24);
  const frame = createOrientationFrame({
    dipDegrees: 58 + hash01(seed, 0, 0, 0, 32) * 18,
    dipDirectionDegrees: circular(strikeDegrees + 90),
    originMetres: recipe.geologyTransform.originMetres,
    strikeDegrees,
  });
  const offsetMetres = maximumDimension * (0.045 + hash01(seed, 0, 0, 0, 33) * 0.035);
  return [{
    eventId: event.id,
    eventOrder: event.order,
    frame,
    halfHeightMetres: maximumDimension * 0.34,
    halfLengthMetres: maximumDimension * 0.43,
    kind: 'finite-displacement-fault',
    offsetMetres,
    restoresEventIds: offsets.map((edge) => edge.before),
    slipVectorMetres: scale3(frame.downDip, offsetMetres),
  }];
}

function compileUnconformity(recipe, chronology, seed, primaryFrame) {
  if (!recipe.fabrics.includes('unconformity')) return null;
  if (!chronology.erosionEvent || !chronology.youngerDepositionEvent) {
    fail(
      'STRUCTURE_UNCONFORMITY_CHRONOLOGY_REQUIRED',
      'Unconformity requires erosion followed by a younger deposition event.',
      '$.chronology',
      'Declare older deposition, erosion, and younger deposition in strict order.',
    );
  }
  const maximumDimension = Math.max(...recipe.targetDimensionsMetres);
  const youngerStrike = circular(primaryFrame.strikeDegrees + 13 + hash01(seed, 0, 0, 0, 41) * 19);
  const youngerDip = Math.max(0, primaryFrame.dipDegrees * 0.35 + hash01(seed, 0, 0, 0, 42) * 7);
  return {
    amplitudeMetres: maximumDimension * 0.012,
    erosionEventId: chronology.erosionEvent.id,
    erosionOrder: chronology.erosionEvent.order,
    kind: 'finite-erosional-unconformity',
    noiseScaleMetres: maximumDimension * 0.23,
    surfaceFrame: createOrientationFrame({
      dipDegrees: Math.min(14, primaryFrame.dipDegrees * 0.25),
      dipDirectionDegrees: circular(primaryFrame.strikeDegrees + 90),
      originMetres: recipe.geologyTransform.originMetres,
      strikeDegrees: primaryFrame.strikeDegrees,
    }),
    youngerEventId: chronology.youngerDepositionEvent.id,
    youngerOrder: chronology.youngerDepositionEvent.order,
    youngerFrame: createOrientationFrame({
      dipDegrees: youngerDip,
      dipDirectionDegrees: circular(youngerStrike + 90),
      originMetres: recipe.geologyTransform.originMetres,
      strikeDegrees: youngerStrike,
    }),
  };
}

function compileIntrusions(recipe, chronology, seed, primaryFrame) {
  let kind = null;
  if (recipe.landform === 'dyke' || recipe.fabrics.includes('dyke-contact')) kind = 'dyke';
  else if (recipe.landform === 'sill' || recipe.fabrics.includes('sill-contact')) kind = 'sill';
  else if (recipe.landform === 'vein' || recipe.fabrics.includes('veined')) kind = 'vein';
  if (!kind) return [];
  const event = chronology.nodes.find((node) => node.kind === 'intrusion')
    ?? chronology.nodes.find((node) => node.kind === 'fracture');
  if (!event) {
    fail('STRUCTURE_INTRUSION_CHRONOLOGY_REQUIRED', 'Dyke, sill, and vein fields require an intrusion or fracture event.', '$.chronology', 'Add the cross-cutting event to chronology.');
  }
  const maximumDimension = Math.max(...recipe.targetDimensionsMetres);
  let frame;
  if (kind === 'sill') frame = primaryFrame;
  else {
    const strikeDegrees = circular(primaryFrame.strikeDegrees + (kind === 'dyke' ? 37 : 61));
    frame = createOrientationFrame({
      dipDegrees: kind === 'dyke' ? 87 : 68,
      dipDirectionDegrees: circular(strikeDegrees + 90),
      originMetres: recipe.geologyTransform.originMetres,
      strikeDegrees,
    });
  }
  const terminates = chronology.relationships.find((edge) => (
    edge.before === event.id && edge.relationship === 'terminates-at'
  ));
  return [{
    embedded: recipe.hostLithology !== null || recipe.fabrics.includes(`${kind}-contact`) || kind === 'vein',
    eventId: event.id,
    eventOrder: event.order,
    frame,
    halfHeightMetres: maximumDimension * (kind === 'sill' ? 0.38 : 0.42),
    halfLengthMetres: maximumDimension * 0.43,
    halfThicknessMetres: maximumDimension * (kind === 'vein' ? 0.006 : 0.025),
    kind,
    materialId: kind === 'vein' ? `${recipe.lithology}/vein` : `${recipe.lithology}/${kind}`,
    termination: terminates ? {
      eventId: terminates.after,
      eventOrder: terminates.afterOrder,
      // Schema v1 has no independent contact orientation. The primary host
      // frame is therefore the declared, deterministic termination surface.
      frame: primaryFrame,
      keepNegativeSide: true,
    } : null,
  }];
}

export function compileStructuralFieldProgram(recipeValue, options = {}) {
  const catalog = options.catalog ?? loadGeologyCatalog();
  const parsed = parseRockRecipe(recipeValue, { catalog });
  const recipe = parsed.recipe;
  const lithology = catalog.lithologyById.get(recipe.lithology);
  validateOrientation(
    'Formation',
    recipe.geologyTransform.strikeDegrees,
    recipe.geologyTransform.dipDegrees,
    recipe.geologyTransform.dipDirectionDegrees,
  );
  const chronology = compileChronology(recipe);
  const seed = deriveNamespacedSeed(recipe.seed, recipe.seedNamespaces.structure);
  const formationFrame = createOrientationFrame(recipe.geologyTransform);
  const fabricFrame = primaryFabricFrame(recipe, lithology.class);
  const halfExtentsMetres = recipe.targetDimensionsMetres.map((value) => value * 0.5);
  const structuralExtent = Math.hypot(...halfExtentsMetres) * 1.35;
  const layers = buildLayers({
    classId: lithology.class,
    extent: structuralExtent,
    recipe,
    seed,
  });
  const folds = compileFolds(recipe, chronology, seed, fabricFrame);
  const faults = compileFaults(recipe, chronology, seed);
  const unconformity = compileUnconformity(recipe, chronology, seed, fabricFrame);
  const intrusions = compileIntrusions(recipe, chronology, seed, fabricFrame);
  const operations = [
    ...folds.map((entry) => ({ eventId: entry.eventId, eventOrder: entry.eventOrder, kind: entry.kind })),
    ...faults.map((entry) => ({ eventId: entry.eventId, eventOrder: entry.eventOrder, kind: entry.kind })),
    ...(unconformity ? [{ eventId: unconformity.erosionEventId, eventOrder: unconformity.erosionOrder, kind: unconformity.kind }] : []),
    ...intrusions.map((entry) => ({ eventId: entry.eventId, eventOrder: entry.eventOrder, kind: entry.kind })),
  ].sort((left, right) => left.eventOrder - right.eventOrder || left.kind.localeCompare(right.kind));
  const base = {
    schema: STRUCTURAL_FIELD_PROGRAM_SCHEMA,
    version: STRUCTURAL_FIELD_PROGRAM_VERSION,
    formationId: recipe.formationId,
    recipeContentId: parsed.contentId,
    lithology: recipe.lithology,
    lithologyClass: lithology.class,
    hostLithology: recipe.hostLithology,
    physicality: recipe.overrides.allowFantasticalOverride ? 'non-physical-art-directed' : 'geology-constrained',
    structureSeed: seed,
    bounds: {
      halfExtentsMetres,
      roundingMetres: Math.min(...halfExtentsMetres) * 0.035,
    },
    frames: {
      formation: formationFrame,
      primaryFabric: fabricFrame,
    },
    baseMaterialProperties: recipe.materialProperties,
    chronology,
    layers,
    folds,
    faults,
    unconformity,
    intrusions,
    operations,
    fabrics: recipe.fabrics,
  };
  return canonicalizeJson({ ...base, programContentId: contentId(base) });
}

export function structuralProgramCompatibility(recipeValue, options = {}) {
  try {
    const program = compileStructuralFieldProgram(recipeValue, options);
    return Object.freeze({ compatible: true, program, error: null });
  } catch (error) {
    if (!(error instanceof RockGeologyError)) throw error;
    return Object.freeze({
      compatible: false,
      error: Object.freeze({
        code: error.code,
        details: error.details,
        message: error.message,
        path: error.path,
        suggestion: error.suggestion,
      }),
      program: null,
    });
  }
}

export function structuralFabricKind(program) {
  if (program.layers.kind === 'sedimentary-stratigraphy') return 'sedimentary';
  if (program.layers.kind === 'metamorphic-foliation') return 'metamorphic';
  return 'igneous';
}

export function hasBeddingFabric(recipe) {
  return recipe.fabrics.some((fabric) => BEDDING_FABRICS.has(fabric));
}

export function hasFoliationFabric(recipe) {
  return recipe.fabrics.some((fabric) => FOLIATION_FABRICS.has(fabric));
}
