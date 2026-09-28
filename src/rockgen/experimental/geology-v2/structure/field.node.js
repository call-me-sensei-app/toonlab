import { contentId } from '../canonical.node.js';
import { RockGeologyError } from '../errors.js';
import {
  STRUCTURAL_FIELD_PROGRAM_SCHEMA,
  STRUCTURAL_FIELD_PROGRAM_VERSION,
  structuralFabricKind,
} from './program.node.js';
import {
  add3,
  clamp,
  compactSupport,
  dot3,
  fractalNoise2D,
  scale3,
  signedDistanceBox,
  subtract3,
  worldToFrame,
} from './math.node.js';

const EPSILON = 1e-10;

function fail(code, message, path, suggestion, details = {}) {
  throw new RockGeologyError(code, message, { details, path, suggestion });
}

function clean(value) {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, clean(entry)]));
  }
  if (typeof value !== 'number') return value;
  if (Object.is(value, -0)) return 0;
  return value;
}

function validateProgram(program) {
  if (!program || typeof program !== 'object') {
    fail('STRUCTURE_PROGRAM_REQUIRED', 'Structural field evaluation requires a compiled program.', '$', 'Call compileStructuralFieldProgram first.');
  }
  if (program.schema !== STRUCTURAL_FIELD_PROGRAM_SCHEMA || program.version !== STRUCTURAL_FIELD_PROGRAM_VERSION) {
    fail(
      'STRUCTURE_PROGRAM_VERSION_UNSUPPORTED',
      `Expected ${STRUCTURAL_FIELD_PROGRAM_SCHEMA} v${STRUCTURAL_FIELD_PROGRAM_VERSION}.`,
      '$',
      'Recompile the RockRecipe with the matching experimental compiler.',
      { actualSchema: program.schema, actualVersion: program.version },
    );
  }
  const { programContentId, ...base } = program;
  const actualContentId = contentId(base);
  if (programContentId !== actualContentId) {
    fail(
      'STRUCTURE_PROGRAM_CONTENT_ID_MISMATCH',
      'Structural field program content does not match its content identifier.',
      '$.programContentId',
      'Do not mutate compiled programs; recompile from the canonical RockRecipe.',
      { actualContentId, declaredContentId: programContentId },
    );
  }
}

function faultSupport(fault, worldPoint) {
  const local = worldToFrame(fault.frame, worldPoint);
  const along = compactSupport(local[0] / Math.max(fault.halfLengthMetres, EPSILON));
  const vertical = compactSupport(local[1] / Math.max(fault.halfHeightMetres, EPSILON));
  return { local, value: along * vertical };
}

/**
 * Restores a present-day point into coordinates that existed at eventOrder.
 * Newer faults are undone newest-first, matching implicit geological modelling.
 */
export function restoreStructuralPoint(program, worldPoint, eventId, eventOrder) {
  let restored = [...worldPoint];
  const appliedFaults = [];
  const faults = [...program.faults].sort((left, right) => right.eventOrder - left.eventOrder);
  for (const fault of faults) {
    if (fault.eventOrder <= eventOrder || !fault.restoresEventIds.includes(eventId)) continue;
    const support = faultSupport(fault, restored);
    if (support.value <= 0 || support.local[2] <= 0) continue;
    const displacement = scale3(fault.slipVectorMetres, support.value);
    restored = subtract3(restored, displacement);
    appliedFaults.push({ eventId: fault.eventId, support: support.value, displacementMetres: displacement });
  }
  return { point: restored, appliedFaults };
}

function foldDisplacement(program, worldPoint, eventOrder) {
  let displacement = 0;
  const local = worldToFrame(program.frames.primaryFabric, worldPoint);
  for (const fold of program.folds) {
    if (fold.eventOrder <= eventOrder) continue;
    const across = local[1] - fold.centerAcrossMetres;
    const normalizedAcross = across / Math.max(fold.halfWidthMetres, EPSILON);
    // A localized cosine-Gaussian warp creates an anticline/syncline without
    // tiling the formation or perturbing its global coordinate contract.
    displacement += fold.amplitudeMetres
      * Math.exp(-0.72 * normalizedAcross * normalizedAcross)
      * Math.cos(normalizedAcross * Math.PI * 0.72);
  }
  return displacement;
}

function contactRoughness(program, fabricLocal) {
  if (!(program.layers.contactAmplitudeMetres > 0)) return 0;
  const scale = Math.max(program.layers.contactNoiseScaleMetres, EPSILON);
  return fractalNoise2D(
    program.structureSeed ^ 0x51ed270b,
    fabricLocal[0] / scale,
    fabricLocal[1] / scale,
    { octaves: 4, lacunarity: 2.071, gain: 0.48 },
  ) * program.layers.contactAmplitudeMetres;
}

function stratigraphicCoordinate(program, worldPoint, frame, eventId, eventOrder) {
  const restored = restoreStructuralPoint(program, worldPoint, eventId, eventOrder);
  const local = worldToFrame(frame, restored.point);
  const value = local[2]
    - foldDisplacement(program, restored.point, eventOrder)
    + contactRoughness(program, local);
  return { appliedFaults: restored.appliedFaults, local, restoredPoint: restored.point, value };
}

function unconformityHeight(program, worldPoint) {
  if (!program.unconformity) return null;
  const restored = restoreStructuralPoint(
    program,
    worldPoint,
    program.unconformity.erosionEventId,
    program.unconformity.erosionOrder,
  );
  const local = worldToFrame(program.unconformity.surfaceFrame, restored.point);
  const scale = Math.max(program.unconformity.noiseScaleMetres, EPSILON);
  const roughness = fractalNoise2D(
    program.structureSeed ^ 0x68bc21eb,
    local[0] / scale,
    local[1] / scale,
    { octaves: 3, lacunarity: 2.137, gain: 0.46 },
  ) * program.unconformity.amplitudeMetres;
  return { appliedFaults: restored.appliedFaults, local, value: local[2] - roughness };
}

function locateLayer(layers, coordinate) {
  let low = 0;
  let high = layers.units.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const unit = layers.units[middle];
    if (coordinate < unit.bottomMetres) high = middle - 1;
    else if (coordinate > unit.topMetres) low = middle + 1;
    else return unit;
  }
  return coordinate < layers.units[0].bottomMetres
    ? layers.units[0]
    : layers.units[layers.units.length - 1];
}

function evaluateIntrusion(program, intrusion, worldPoint, unconformity) {
  const restored = restoreStructuralPoint(program, worldPoint, intrusion.eventId, intrusion.eventOrder);
  const local = worldToFrame(intrusion.frame, restored.point);
  const radial = Math.hypot(
    local[0] / Math.max(intrusion.halfLengthMetres, EPSILON),
    local[1] / Math.max(intrusion.halfHeightMetres, EPSILON),
  );
  let inside = radial <= 1 && Math.abs(local[2]) <= intrusion.halfThicknessMetres;
  let terminated = false;
  if (inside && intrusion.termination) {
    const terminationValue = program.unconformity
      && intrusion.termination.eventId === program.unconformity.erosionEventId
      ? unconformity?.value
      : worldToFrame(
        intrusion.termination.frame,
        restoreStructuralPoint(
          program,
          worldPoint,
          intrusion.termination.eventId,
          intrusion.termination.eventOrder,
        ).point,
      )[2];
    const rejected = intrusion.termination.keepNegativeSide
      ? terminationValue > 0
      : terminationValue < 0;
    if (rejected) {
      inside = false;
      terminated = true;
    }
  }
  return { appliedFaults: restored.appliedFaults, inside, local, radial, terminated };
}

function propertyFields(program, unit, intrusion) {
  const source = program.baseMaterialProperties;
  const variation = unit.variation;
  const intrusionFactor = intrusion ? (intrusion.kind === 'vein' ? 1.12 : 1.05) : 1;
  const hardnessNormalized = clamp(source.hardnessNormalized * variation.hardnessFactor * intrusionFactor, 0, 1);
  const porosityFraction = clamp(source.porosityFraction * variation.porosityFactor * (intrusion ? 0.72 : 1), 0, 0.65);
  const permeabilitySquareMetres = Math.max(
    0,
    source.permeabilitySquareMetres * (10 ** variation.permeabilityExponent) * (intrusion ? 0.55 : 1),
  );
  const cementationNormalized = clamp(source.cementationNormalized * variation.cementationFactor * intrusionFactor, 0, 1);
  const weatheringSusceptibilityNormalized = clamp(
    (1 - hardnessNormalized) * 0.46
      + porosityFraction * 0.3
      + (1 - cementationNormalized) * 0.2
      + clamp(Math.log10(permeabilitySquareMetres + 1e-20) + 16, 0, 5) * 0.008,
    0,
    1,
  );
  return {
    cementationNormalized,
    hardnessNormalized,
    permeabilitySquareMetres,
    porosityFraction,
    weatheringSusceptibilityNormalized,
  };
}

function fabricFields(program, stratigraphy, unit) {
  const thickness = Math.max(unit.topMetres - unit.bottomMetres, EPSILON);
  const distanceToContactMetres = Math.min(
    Math.abs(stratigraphy.value - unit.bottomMetres),
    Math.abs(unit.topMetres - stratigraphy.value),
  );
  const phaseNormalized = clamp((stratigraphy.value - unit.bottomMetres) / thickness, 0, 1);
  const kind = structuralFabricKind(program);
  if (kind === 'sedimentary') {
    return { kind, beddingPhaseNormalized: phaseNormalized, distanceToContactMetres };
  }
  if (kind === 'metamorphic') {
    return {
      kind,
      distanceToContactMetres,
      foliationPhaseNormalized: phaseNormalized,
      lineationCoordinateMetres: stratigraphy.local[0],
    };
  }
  return {
    kind,
    distanceToContactMetres,
    flowBandPhaseNormalized: program.layers.kind === 'igneous-flow-banding' ? phaseNormalized : null,
    massiveDomainNoise: fractalNoise2D(
      program.structureSeed ^ 0x02e5be93,
      stratigraphy.local[0] / Math.max(program.layers.contactNoiseScaleMetres, EPSILON),
      stratigraphy.local[1] / Math.max(program.layers.contactNoiseScaleMetres, EPSILON),
      { octaves: 3, lacunarity: 2.227, gain: 0.5 },
    ),
  };
}

export function createStructuralField(program) {
  validateProgram(program);
  const formationEvent = program.chronology.formationEvent;

  function formationCoordinates(worldPoint) {
    return clean(worldToFrame(program.frames.formation, worldPoint));
  }

  function evaluate(worldPoint) {
    if (!Array.isArray(worldPoint) || worldPoint.length !== 3 || worldPoint.some((value) => !Number.isFinite(value))) {
      fail('STRUCTURE_POINT_INVALID', 'Structural field samples require a finite [x,y,z] world point.', '$.worldPoint', 'Pass three finite SI coordinates.');
    }
    const formationLocal = worldToFrame(program.frames.formation, worldPoint);
    const envelopeDistanceMetres = signedDistanceBox(
      formationLocal,
      program.bounds.halfExtentsMetres,
      program.bounds.roundingMetres,
    );
    const unconformity = unconformityHeight(program, worldPoint);
    const usesYoungerPackage = Boolean(program.unconformity && unconformity.value >= 0);
    const frame = usesYoungerPackage ? program.unconformity.youngerFrame : program.frames.primaryFabric;
    const eventId = usesYoungerPackage ? program.unconformity.youngerEventId : formationEvent.id;
    const eventOrder = usesYoungerPackage ? program.unconformity.youngerOrder : formationEvent.order;
    const stratigraphy = stratigraphicCoordinate(program, worldPoint, frame, eventId, eventOrder);
    const unit = locateLayer(program.layers, stratigraphy.value);
    const intrusionSamples = program.intrusions.map((intrusion) => ({
      intrusion,
      sample: evaluateIntrusion(program, intrusion, worldPoint, unconformity),
    }));
    const activeIntrusion = intrusionSamples
      .filter((entry) => entry.sample.inside)
      .sort((left, right) => right.intrusion.eventOrder - left.intrusion.eventOrder)[0] ?? null;
    const materialId = activeIntrusion?.intrusion.materialId
      ?? (program.hostLithology ? `${program.hostLithology}/${unit.id.split('/').at(-1)}` : unit.id);
    return clean({
      worldPointMetres: [...worldPoint],
      formationCoordinatesMetres: formationLocal,
      envelopeDistanceMetres,
      insideFormation: envelopeDistanceMetres <= 0,
      packageId: usesYoungerPackage ? 'younger' : 'older',
      stratigraphicCoordinateMetres: stratigraphy.value,
      unitId: unit.id,
      unitIndex: unit.index,
      materialId,
      materialFields: propertyFields(program, unit, activeIntrusion?.intrusion ?? null),
      fabricFields: fabricFields(program, stratigraphy, unit),
      chronology: {
        sampledEventId: eventId,
        sampledEventOrder: eventOrder,
        restoredFaults: stratigraphy.appliedFaults,
        unconformityRestoredFaultEventIds: unconformity?.appliedFaults.map((fault) => fault.eventId) ?? [],
        unconformitySignedDistanceMetres: unconformity?.value ?? null,
        intrusion: activeIntrusion ? {
          eventId: activeIntrusion.intrusion.eventId,
          kind: activeIntrusion.intrusion.kind,
        } : null,
        intrusionSamples: intrusionSamples.map((entry) => ({
          eventId: entry.intrusion.eventId,
          inside: entry.sample.inside,
          restoredFaultEventIds: entry.sample.appliedFaults.map((fault) => fault.eventId),
          terminated: entry.sample.terminated,
        })),
      },
    });
  }

  function orientationAt(worldPoint, stepMetres = 0.01) {
    if (!(stepMetres > 0)) throw new RangeError('orientationAt stepMetres must be positive.');
    const gradient = [0, 1, 2].map((axis) => {
      const lower = [...worldPoint];
      const upper = [...worldPoint];
      lower[axis] -= stepMetres;
      upper[axis] += stepMetres;
      return (evaluate(upper).stratigraphicCoordinateMetres - evaluate(lower).stratigraphicCoordinateMetres) / (stepMetres * 2);
    });
    const length = Math.hypot(...gradient);
    return clean(length > EPSILON ? scale3(gradient, 1 / length) : [0, 1, 0]);
  }

  return Object.freeze({
    evaluate,
    formationCoordinates,
    orientationAt,
    program,
  });
}

export function structuralFieldsEqualAtWorldPoint(leftField, rightField, worldPoint) {
  return JSON.stringify(leftField.evaluate(worldPoint)) === JSON.stringify(rightField.evaluate(worldPoint));
}
