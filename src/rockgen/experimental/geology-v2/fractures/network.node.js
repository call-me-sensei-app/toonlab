import { canonicalizeJson, contentId, deriveNamespacedSeed } from '../canonical.node.js';
import { loadGeologyCatalog } from '../catalog.node.js';
import { RockGeologyError } from '../errors.js';
import { parseRockRecipe } from '../recipe.node.js';
import { createStructuralField, restoreStructuralPoint } from '../structure/field.node.js';
import {
  add3,
  clamp,
  createOrientationFrame,
  cross3,
  dot3,
  fractalNoise2D,
  frameToWorld,
  hash01,
  length3,
  normalize3,
  scale3,
  subtract3,
  worldToFrame,
} from '../structure/math.node.js';
import { distributionMoments, sampleOrientation, sampleTruncatedSize } from './distributions.node.js';
import { buildFlatSpatialIndex, pointQueryBounds, querySpatialIndex } from './spatialIndex.node.js';

export const FRACTURE_NETWORK_PROGRAM_SCHEMA = 'toonlab/rock-fracture-network-program';
export const FRACTURE_NETWORK_PROGRAM_VERSION = 1;

function fail(code, message, path, suggestion, details = {}) {
  throw new RockGeologyError(code, message, { details, path, suggestion });
}

function formationCorners(program) {
  const result = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
    result.push(frameToWorld(program.frames.formation, [
      program.bounds.halfExtentsMetres[0] * x,
      program.bounds.halfExtentsMetres[1] * y,
      program.bounds.halfExtentsMetres[2] * z,
    ]));
  }
  return result;
}

function projectedExtents(frame, corners) {
  const local = corners.map((corner) => worldToFrame(frame, corner));
  return [0, 1, 2].map((axis) => Math.max(...local.map((point) => Math.abs(point[axis]))));
}

function fractureBounds(fracture, padding = 0) {
  const points = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
    points.push(add3(fracture.centerMetres, add3(
      scale3(fracture.frame.strike, fracture.halfLengthMetres * x),
      add3(
        scale3(fracture.frame.downDip, fracture.halfPersistenceMetres * y),
        scale3(fracture.frame.normal, (fracture.apertureMetres * 0.5 + fracture.roughnessMetres) * z),
      ),
    )));
  }
  return {
    // A later fault can translate an old fracture in any world direction.
    // Conservatively expand every AABB axis by the full restored offset.
    maximum: [0, 1, 2].map((axis) => Math.max(...points.map((point) => point[axis])) + padding),
    minimum: [0, 1, 2].map((axis) => Math.min(...points.map((point) => point[axis])) - padding),
  };
}

function meanOrientationFrame(set, originMetres) {
  return createOrientationFrame({
    dipDegrees: set.meanDipDegrees,
    dipDirectionDegrees: (set.meanStrikeDegrees + 90) % 360,
    originMetres,
    strikeDegrees: set.meanStrikeDegrees,
  });
}

function orientationFrameFromNormal(normalValue, originMetres, fallbackStrikeDegrees) {
  let normal = normalize3(normalValue);
  if (normal[1] < 0) normal = scale3(normal, -1);
  const dipDegrees = Math.acos(clamp(normal[1], -1, 1)) * 180 / Math.PI;
  const dipDirectionDegrees = dipDegrees < 1e-8
    ? (fallbackStrikeDegrees + 90) % 360
    : ((Math.atan2(normal[0], normal[2]) * 180 / Math.PI) + 360) % 360;
  return createOrientationFrame({
    dipDegrees,
    dipDirectionDegrees,
    originMetres,
    strikeDegrees: (dipDirectionDegrees + 270) % 360,
  });
}

function deflectOrientation(sampled, set, centerMetres, field, meanFrame) {
  if (set.interactions.deflectsAlongEventIds.length === 0) return sampled;
  let fabricNormal = field.orientationAt(centerMetres, 0.08);
  if (dot3(fabricNormal, sampled.frame.normal) < 0) fabricNormal = scale3(fabricNormal, -1);
  const frame = orientationFrameFromNormal(normalize3(add3(
    scale3(sampled.frame.normal, 0.35),
    scale3(fabricNormal, 0.65),
  )), centerMetres, set.meanStrikeDegrees);
  return {
    deviationDegrees: Math.acos(clamp(Math.abs(dot3(frame.normal, meanFrame.normal)), -1, 1)) * 180 / Math.PI,
    frame,
  };
}

function event(program, id) {
  return program.chronology.nodes.find((node) => node.id === id) ?? null;
}

function eventRelationships(program, id) {
  return program.chronology.relationships.filter((relationship) => relationship.before === id || relationship.after === id);
}

function compileSetMetadata(set, setIndex, program) {
  const chronologyEvent = event(program, set.chronologyNodeId);
  if (!chronologyEvent) {
    fail(
      'FRACTURE_EVENT_MISSING',
      `Fracture set “${set.id}” references an event absent from the structural dependency.`,
      `$.fractureHistory.sets[${setIndex}].chronologyNodeId`,
      'Recompile the matching StructuralFieldProgram from the same canonical recipe.',
    );
  }
  const explicitTermination = program.chronology.relationships.find((relationship) => (
    relationship.before === chronologyEvent.id && relationship.relationship === 'terminates-at'
  ));
  let termination = explicitTermination ? {
    eventId: explicitTermination.after,
    eventOrder: explicitTermination.afterOrder,
    reason: 'explicit-terminates-at',
  } : null;
  if (!termination && program.unconformity && chronologyEvent.order < program.unconformity.youngerOrder) {
    termination = {
      eventId: program.unconformity.erosionEventId,
      eventOrder: program.unconformity.erosionOrder,
      reason: 'eroded-before-younger-deposition',
    };
  }
  return {
    ...set,
    eventOrder: chronologyEvent.order,
    hierarchyRank: chronologyEvent.order * 1000 + Math.round(set.persistenceMetres),
    interactions: {
      cutsEventIds: program.chronology.nodes
        .filter((node) => node.order < chronologyEvent.order && ['deposition', 'intrusion', 'metamorphism'].includes(node.kind))
        .map((node) => node.id),
      deflectsAlongEventIds: program.chronology.relationships
        .filter((relationship) => relationship.after === chronologyEvent.id && relationship.relationship === 'deflects-along')
        .map((relationship) => relationship.before),
      offsetByFaultEventIds: program.faults
        .filter((fault) => fault.eventOrder > chronologyEvent.order && fault.restoresEventIds.includes(chronologyEvent.id))
        .map((fault) => fault.eventId),
      relationships: eventRelationships(program, chronologyEvent.id),
      termination,
    },
  };
}

function roughnessOffset(program, fracture, local) {
  if (!(fracture.roughnessMetres > 0)) return 0;
  const scale = Math.max(fracture.sizeMetres * 0.18, fracture.roughnessMetres * 6, 1e-6);
  return fractalNoise2D(
    program.fractureSeed ^ fracture.numericId,
    local[0] / scale,
    local[1] / scale,
    { octaves: 3, lacunarity: 2.119, gain: 0.48 },
  ) * fracture.roughnessMetres;
}

function presentAabbPadding(structuralProgram, setMetadata) {
  return structuralProgram.faults
    .filter((fault) => setMetadata.interactions.offsetByFaultEventIds.includes(fault.eventId))
    .reduce((sum, fault) => sum + fault.offsetMetres, 0);
}

function relationForIntersection(structuralProgram, left, right) {
  if (left.eventId === right.eventId) return 'coeval-intersection';
  const older = left.eventOrder < right.eventOrder ? left : right;
  const younger = older === left ? right : left;
  const relationship = structuralProgram.chronology.relationships.find((entry) => (
    entry.before === older.eventId && entry.after === younger.eventId
  ));
  if (relationship?.relationship === 'terminates-at') return 'terminates';
  if (relationship?.relationship === 'deflects-along') return 'deflects';
  if (relationship?.relationship === 'offsets') return 'offsets';
  return 'younger-crosses-older';
}

function lineInterval(fracture, point, direction) {
  const relative = subtract3(point, fracture.centerMetres);
  const x0 = dot3(relative, fracture.frame.strike) / Math.max(fracture.halfLengthMetres, 1e-12);
  const y0 = dot3(relative, fracture.frame.downDip) / Math.max(fracture.halfPersistenceMetres, 1e-12);
  const dx = dot3(direction, fracture.frame.strike) / Math.max(fracture.halfLengthMetres, 1e-12);
  const dy = dot3(direction, fracture.frame.downDip) / Math.max(fracture.halfPersistenceMetres, 1e-12);
  const a = dx * dx + dy * dy;
  const b = 2 * (x0 * dx + y0 * dy);
  const c = x0 * x0 + y0 * y0 - 1;
  if (a < 1e-14) return c <= 0 ? [-Infinity, Infinity] : null;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const root = Math.sqrt(discriminant);
  return [(-b - root) / (2 * a), (-b + root) / (2 * a)];
}

function formationLineInterval(structuralProgram, point, direction) {
  const frame = structuralProgram.frames.formation;
  const localPoint = worldToFrame(frame, point);
  const localDirection = [frame.strike, frame.downDip, frame.normal].map((axis) => dot3(direction, axis));
  let minimum = -Infinity;
  let maximum = Infinity;
  for (let axis = 0; axis < 3; axis += 1) {
    const halfExtent = structuralProgram.bounds.halfExtentsMetres[axis];
    if (Math.abs(localDirection[axis]) < 1e-14) {
      if (Math.abs(localPoint[axis]) > halfExtent) return null;
      continue;
    }
    const left = (-halfExtent - localPoint[axis]) / localDirection[axis];
    const right = (halfExtent - localPoint[axis]) / localDirection[axis];
    minimum = Math.max(minimum, Math.min(left, right));
    maximum = Math.min(maximum, Math.max(left, right));
    if (!(maximum > minimum)) return null;
  }
  return [minimum, maximum];
}

function clipEndpointToFormation(field, insidePoint, endpoint) {
  if (field.evaluate(endpoint).insideFormation) return endpoint;
  let inside = insidePoint;
  let outside = endpoint;
  for (let iteration = 0; iteration < 40; iteration += 1) {
    const midpoint = scale3(add3(inside, outside), 0.5);
    if (field.evaluate(midpoint).insideFormation) inside = midpoint;
    else outside = midpoint;
  }
  return inside;
}

function fractureIntersection(left, right, structuralProgram, field) {
  const directionRaw = cross3(left.frame.normal, right.frame.normal);
  const denominator = dot3(directionRaw, directionRaw);
  if (denominator < 1e-10) return null;
  const direction = scale3(directionRaw, 1 / Math.sqrt(denominator));
  const d1 = dot3(left.frame.normal, left.centerMetres);
  const d2 = dot3(right.frame.normal, right.centerMetres);
  const point = scale3(add3(
    scale3(cross3(right.frame.normal, directionRaw), d1),
    scale3(cross3(directionRaw, left.frame.normal), d2),
  ), 1 / denominator);
  const leftInterval = lineInterval(left, point, direction);
  const rightInterval = lineInterval(right, point, direction);
  const parentInterval = formationLineInterval(structuralProgram, point, direction);
  if (!leftInterval || !rightInterval || !parentInterval) return null;
  const minimum = Math.max(leftInterval[0], rightInterval[0], parentInterval[0]);
  const maximum = Math.min(leftInterval[1], rightInterval[1], parentInterval[1]);
  if (!(maximum > minimum + 1e-7)) return null;
  let startMetres = add3(point, scale3(direction, minimum));
  let endMetres = add3(point, scale3(direction, maximum));
  const midpoint = scale3(add3(startMetres, endMetres), 0.5);
  if (!field.evaluate(midpoint).insideFormation) return null;
  startMetres = clipEndpointToFormation(field, midpoint, startMetres);
  endMetres = clipEndpointToFormation(field, midpoint, endMetres);
  return {
    endMetres,
    fractureIds: [left.id, right.id].sort(),
    kind: relationForIntersection(structuralProgram, left, right),
    lengthMetres: length3(subtract3(endMetres, startMetres)),
    startMetres,
  };
}

export function compileFractureNetworkProgram(recipeValue, structuralProgram, options = {}) {
  const catalog = options.catalog ?? loadGeologyCatalog();
  const parsed = parseRockRecipe(recipeValue, { catalog });
  const field = createStructuralField(structuralProgram);
  if (structuralProgram.recipeContentId !== parsed.contentId) {
    fail(
      'FRACTURE_STRUCTURE_RECIPE_MISMATCH',
      'Fracture network and StructuralFieldProgram must originate from the same canonical RockRecipe.',
      '$.structuralProgram.recipeContentId',
      'Recompile both stages from the same compilation plan.',
      { fractureRecipeContentId: parsed.contentId, structureRecipeContentId: structuralProgram.recipeContentId },
    );
  }
  const fractureSeed = deriveNamespacedSeed(parsed.recipe.seed, parsed.recipe.seedNamespaces.fractures);
  const corners = formationCorners(structuralProgram);
  const setMetadata = parsed.recipe.fractureHistory.sets.map((set, index) => compileSetMetadata(set, index, structuralProgram));
  const fractures = [];
  for (const [setIndex, set] of setMetadata.entries()) {
    const meanFrame = meanOrientationFrame(set, structuralProgram.frames.formation.originMetres);
    const extents = projectedExtents(meanFrame, corners);
    const count = Math.max(1, Math.round((extents[2] * 2) / set.spacingMetres));
    if (count > 512) {
      fail(
        'FRACTURE_SET_CAPACITY_EXCEEDED',
        `Fracture set “${set.id}” requires ${count} panels; compiler v1 supports at most 512 per set.`,
        `$.fractureHistory.sets[${setIndex}].spacingMetres`,
        'Increase spacing, reduce target dimensions, or use a reviewed compiler version with a higher capacity.',
        { count, maximum: 512 },
      );
    }
    const step = extents[2] * 2 / count;
    for (let index = 0; index < count; index += 1) {
      const numericId = (setIndex + 1) * 1_000_000 + index + 1;
      const offset = -extents[2] + (index + 0.5) * step
        + (hash01(fractureSeed, setIndex, index, 0, 401) - 0.5) * Math.min(step, set.spacingMetres) * 0.32;
      const lateral = (hash01(fractureSeed, setIndex, index, 0, 402) - 0.5) * extents[0] * 1.2;
      const vertical = (hash01(fractureSeed, setIndex, index, 0, 403) - 0.5) * extents[1] * 1.2;
      const centerMetres = frameToWorld(meanFrame, [lateral, vertical, offset]);
      const sampled = deflectOrientation(
        sampleOrientation(fractureSeed ^ (setIndex + 1), index, set, centerMetres),
        set,
        centerMetres,
        field,
        meanFrame,
      );
      const sizeMetres = sampleTruncatedSize(fractureSeed ^ (setIndex + 1), index, set.sizeDistribution);
      const persistenceMetres = clamp(
        set.persistenceMetres * (0.78 + hash01(fractureSeed, setIndex, index, 0, 404) * 0.44),
        Math.max(set.apertureMetres * 4, set.sizeDistribution.minimumMetres * 0.35),
        set.sizeDistribution.maximumMetres,
      );
      const fracture = {
        apertureMetres: set.apertureMetres * (0.82 + hash01(fractureSeed, setIndex, index, 0, 405) * 0.36),
        centerMetres,
        eventId: set.chronologyNodeId,
        eventOrder: set.eventOrder,
        frame: sampled.frame,
        halfLengthMetres: sizeMetres * 0.5,
        halfPersistenceMetres: persistenceMetres * 0.5,
        hierarchyRank: set.hierarchyRank,
        id: `${set.id}/${String(index + 1).padStart(4, '0')}`,
        interactions: set.interactions,
        kind: set.kind,
        numericId,
        orientationDeviationDegrees: sampled.deviationDegrees,
        persistenceMetres,
        roughnessMetres: set.roughnessMetres * (0.8 + hash01(fractureSeed, setIndex, index, 0, 406) * 0.4),
        setId: set.id,
        sizeMetres,
      };
      fracture.bounds = fractureBounds(fracture, presentAabbPadding(structuralProgram, set));
      fractures.push(fracture);
    }
  }
  fractures.sort((left, right) => left.id.localeCompare(right.id));
  const spatialIndex = buildFlatSpatialIndex(fractures);
  const fractureIndexById = new Map(fractures.map((fracture, index) => [fracture.id, index]));
  const intersections = [];
  for (let leftIndex = 0; leftIndex < fractures.length; leftIndex += 1) {
    const candidateIds = querySpatialIndex(spatialIndex, fractures[leftIndex].bounds);
    for (const candidateId of candidateIds) {
      const rightIndex = fractureIndexById.get(candidateId);
      if (rightIndex <= leftIndex) continue;
      if (fractures[leftIndex].setId === fractures[rightIndex].setId) continue;
      const intersection = fractureIntersection(fractures[leftIndex], fractures[rightIndex], structuralProgram, field);
      if (intersection) intersections.push({ id: `intersection-${String(intersections.length + 1).padStart(5, '0')}`, ...intersection });
    }
  }
  const statisticsBySet = setMetadata.map((set) => {
    const members = fractures.filter((fracture) => fracture.setId === set.id);
    const meanNormal = meanOrientationFrame(set, structuralProgram.frames.formation.originMetres).normal;
    const orderedOffsets = members
      .map((fracture) => dot3(subtract3(fracture.centerMetres, structuralProgram.frames.formation.originMetres), meanNormal))
      .sort((a, b) => a - b);
    return {
      apertureMetres: distributionMoments(members.map((fracture) => fracture.apertureMetres)),
      count: members.length,
      orientationDeviationDegrees: distributionMoments(members.map((fracture) => fracture.orientationDeviationDegrees)),
      persistenceMetres: distributionMoments(members.map((fracture) => fracture.persistenceMetres)),
      roughnessMetres: distributionMoments(members.map((fracture) => fracture.roughnessMetres)),
      setId: set.id,
      sizeMetres: distributionMoments(members.map((fracture) => fracture.sizeMetres)),
      spacingMetres: distributionMoments(orderedOffsets.slice(1).map((value, index) => value - orderedOffsets[index])),
    };
  });
  const base = {
    schema: FRACTURE_NETWORK_PROGRAM_SCHEMA,
    version: FRACTURE_NETWORK_PROGRAM_VERSION,
    recipeContentId: parsed.contentId,
    structureProgramContentId: structuralProgram.programContentId,
    fractureSeed,
    sets: setMetadata,
    fractures,
    intersections,
    statisticsBySet,
    spatialIndex,
  };
  return canonicalizeJson({ ...base, programContentId: contentId(base) });
}

export function fracturePlaneValue(program, structuralProgram, fracture, worldPoint) {
  const restored = restoreStructuralPoint(
    structuralProgram,
    worldPoint,
    fracture.eventId,
    fracture.eventOrder,
  ).point;
  const local = worldToFrame(fracture.frame, restored);
  return local[2] - roughnessOffset(program, fracture, local);
}

export function fractureSignedDistance(program, structuralProgram, fracture, worldPoint) {
  const restored = restoreStructuralPoint(
    structuralProgram,
    worldPoint,
    fracture.eventId,
    fracture.eventOrder,
  ).point;
  const local = worldToFrame(fracture.frame, restored);
  const plane = Math.abs(local[2] - roughnessOffset(program, fracture, local)) - fracture.apertureMetres * 0.5;
  const radial = Math.hypot(
    local[0] / Math.max(fracture.halfLengthMetres, 1e-12),
    local[1] / Math.max(fracture.halfPersistenceMetres, 1e-12),
  );
  const boundary = (radial - 1) * Math.min(fracture.halfLengthMetres, fracture.halfPersistenceMetres);
  return Math.max(plane, boundary);
}

export function fractureIntersectsSegment(program, structuralProgram, fracture, startMetres, endMetres, options = {}) {
  const restoredStart = restoreStructuralPoint(structuralProgram, startMetres, fracture.eventId, fracture.eventOrder).point;
  const restoredEnd = restoreStructuralPoint(structuralProgram, endMetres, fracture.eventId, fracture.eventOrder).point;
  const startLocal = worldToFrame(fracture.frame, restoredStart);
  const endLocal = worldToFrame(fracture.frame, restoredEnd);
  const startValue = startLocal[2] - roughnessOffset(program, fracture, startLocal);
  const endValue = endLocal[2] - roughnessOffset(program, fracture, endLocal);
  if (startValue === 0 && endValue === 0) return null;
  if (startValue * endValue > 0) return null;
  const denominator = startValue - endValue;
  if (Math.abs(denominator) < 1e-15) return null;
  const t = clamp(startValue / denominator, 0, 1);
  const worldPoint = add3(startMetres, scale3(subtract3(endMetres, startMetres), t));
  const restoredPoint = add3(restoredStart, scale3(subtract3(restoredEnd, restoredStart), t));
  const local = worldToFrame(fracture.frame, restoredPoint);
  const radial = Math.hypot(
    local[0] / Math.max(fracture.halfLengthMetres, 1e-12),
    local[1] / Math.max(fracture.halfPersistenceMetres, 1e-12),
  );
  if (radial > 1 + (options.radialTolerance ?? 1e-9)) return null;
  if (fracture.interactions.termination) {
    const field = options.structuralField ?? createStructuralField(structuralProgram);
    const sample = field.evaluate(worldPoint);
    if (fracture.interactions.termination.eventId === structuralProgram.unconformity?.erosionEventId
      && sample.chronology.unconformitySignedDistanceMetres > 0) return null;
    const terminators = (options.fracturesByEventId?.get(fracture.interactions.termination.eventId)
      ?? program.fractures.filter((candidate) => candidate.eventId === fracture.interactions.termination.eventId))
      .filter((candidate) => candidate.id !== fracture.id);
    for (const terminator of terminators) {
      const restoredTerminatedPoint = restoreStructuralPoint(
        structuralProgram,
        worldPoint,
        terminator.eventId,
        terminator.eventOrder,
      ).point;
      const terminatedLocal = worldToFrame(terminator.frame, restoredTerminatedPoint);
      const terminatedRadial = Math.hypot(
        terminatedLocal[0] / Math.max(terminator.halfLengthMetres, 1e-12),
        terminatedLocal[1] / Math.max(terminator.halfPersistenceMetres, 1e-12),
      );
      if (terminatedRadial > 1 + (options.radialTolerance ?? 1e-9)) continue;
      const pointSide = terminatedLocal[2] - roughnessOffset(program, terminator, terminatedLocal);
      const restoredCenter = restoreStructuralPoint(
        structuralProgram,
        fracture.centerMetres,
        terminator.eventId,
        terminator.eventOrder,
      ).point;
      const centerLocal = worldToFrame(terminator.frame, restoredCenter);
      let centerSide = centerLocal[2] - roughnessOffset(program, terminator, centerLocal);
      if (Math.abs(centerSide) < 1e-12) centerSide = hash01(program.fractureSeed, fracture.numericId, terminator.numericId, 0, 907) - 0.5;
      if (pointSide * centerSide < -1e-10) return null;
    }
  }
  return { fractureId: fracture.id, local, radial, t, worldPoint };
}

export function queryFracturesAtPoint(program, structuralProgram, worldPoint, maximumDistanceMetres = 0) {
  const ids = querySpatialIndex(program.spatialIndex, pointQueryBounds(worldPoint, maximumDistanceMetres));
  const byId = new Map(program.fractures.map((fracture) => [fracture.id, fracture]));
  return ids.map((id) => byId.get(id)).filter((fracture) => (
    fractureSignedDistance(program, structuralProgram, fracture, worldPoint) <= maximumDistanceMetres
  ));
}
