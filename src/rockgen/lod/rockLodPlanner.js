import { meshDocument } from '../mesh/meshDocument.js';
import { getGeometryTriangleCount } from './rockLodMetrics.js';
import {
  createReferenceRockLodPolicyForDocument,
  createRockLodTriangleTargets,
  resolveReferenceRockLodPolicy,
} from './rockLodPolicy.js';
import {
  matchRockGeometryBounds,
  simplifyRockGeometryToTriangleBudget,
} from './rockLodSimplifier.js';
import { validateRockLodLevels } from './rockLodValidation.js';

function clampInteger(value, min, max) {
  return Math.min(Math.max(Math.round(Number(value)), min), max);
}

/**
 * Surface meshes scale approximately with resolution squared, so a triangle
 * target uses sqrt(target/reference) rather than the exporter's historical
 * direct half/quarter resolution convention.
 */
export function estimateSurfaceNetsResolution({
  maxResolution = 320,
  minResolution = 8,
  referenceResolution,
  referenceTriangles,
  targetTriangles,
}) {
  const min = clampInteger(minResolution, 8, 320);
  const max = clampInteger(maxResolution, min, 320);
  const resolution = clampInteger(referenceResolution, min, max);
  const triangles = Math.max(Number(referenceTriangles) || 1, 1);
  const target = Math.max(Number(targetTriangles) || 1, 1);
  return clampInteger(resolution * Math.sqrt(target / triangles), min, max);
}

function selectMeasurement(measurements, target, preference) {
  const candidates = [...measurements.values()].filter((entry) => !entry.invalid);
  if (candidates.length === 0) return null;
  const under = candidates.filter((entry) => entry.triangleCount <= target);
  if (preference === 'under' && under.length > 0) {
    under.sort((left, right) => (
      right.triangleCount - left.triangleCount
      || right.resolution - left.resolution
    ));
    return under[0];
  }
  candidates.sort((left, right) => (
    Math.abs(left.triangleCount - target) - Math.abs(right.triangleCount - target)
    || Number(left.triangleCount > target) - Number(right.triangleCount > target)
    || left.resolution - right.resolution
  ));
  return candidates[0];
}

/**
 * Searches integer grid resolutions around the Surface Nets sqrt estimate.
 * The callback may return either a triangle count or `{ triangleCount, ... }`.
 * Results include every sampled resolution for diagnostics and reuse.
 */
export function searchSurfaceNetsResolution({
  maxResolution = 320,
  measureTriangles,
  minResolution = 8,
  neighborhood = 2,
  preference = 'under',
  reference = null,
  targetTriangles,
}) {
  if (typeof measureTriangles !== 'function') {
    throw new TypeError('searchSurfaceNetsResolution requires a measureTriangles callback.');
  }
  const min = clampInteger(minResolution, 8, 320);
  const max = clampInteger(maxResolution, min, 320);
  const target = Math.max(Math.round(Number(targetTriangles) || 1), 1);
  const measurements = new Map();
  const measure = (value) => {
    const resolution = clampInteger(value, min, max);
    if (measurements.has(resolution)) return measurements.get(resolution);
    const raw = measureTriangles(resolution);
    const data = typeof raw === 'number' ? { triangleCount: raw } : raw;
    const triangleCount = Math.max(Math.round(Number(data?.triangleCount) || 0), 0);
    const measured = { ...data, resolution, triangleCount };
    measurements.set(resolution, measured);
    return measured;
  };

  const minimum = measure(min);
  if (min === max) {
    if (minimum.invalid) {
      throw new Error(`No non-empty Surface Nets mesh exists at resolution ${min}.`);
    }
    return {
      ...minimum,
      limitedByMinimum: minimum.triangleCount > target,
      samples: [...measurements.values()],
      targetTriangles: target,
    };
  }

  const referenceResolution = Number.isFinite(reference?.resolution)
    ? Math.round(reference.resolution)
    : Math.round((min + max) * 0.5);
  const referenceTriangles = Number.isFinite(reference?.triangleCount)
    ? Math.max(Math.round(reference.triangleCount), 1)
    : measure(clampInteger(referenceResolution, min, max)).triangleCount;
  const estimate = estimateSurfaceNetsResolution({
    maxResolution: max,
    minResolution: min,
    referenceResolution,
    referenceTriangles,
    targetTriangles: target,
  });
  const estimated = measure(estimate);

  let lower = estimated.triangleCount <= target ? estimated.resolution : null;
  let upper = estimated.triangleCount > target ? estimated.resolution : null;
  let cursor = estimated.resolution;
  let step = 1;
  if (lower !== null) {
    while (cursor < max && upper === null) {
      const next = Math.min(cursor + step, max);
      const measured = measure(next);
      if (measured.triangleCount <= target) lower = next;
      else upper = next;
      if (next === max) break;
      cursor = next;
      step *= 2;
    }
  } else {
    while (cursor > min && lower === null) {
      const next = Math.max(cursor - step, min);
      const measured = measure(next);
      if (measured.triangleCount <= target) lower = next;
      else upper = next;
      if (next === min) break;
      cursor = next;
      step *= 2;
    }
  }

  if (lower !== null && upper !== null) {
    let low = Math.min(lower, upper);
    let high = Math.max(lower, upper);
    while (high - low > 1) {
      const middle = Math.floor((low + high) / 2);
      const measured = measure(middle);
      if (measured.triangleCount <= target) low = middle;
      else high = middle;
    }
    lower = low;
    upper = high;
  }

  const anchors = new Set([min, estimate]);
  if (lower !== null) anchors.add(lower);
  if (upper !== null) anchors.add(upper);
  for (const anchor of anchors) {
    for (let offset = -neighborhood; offset <= neighborhood; offset += 1) {
      const resolution = anchor + offset;
      if (resolution >= min && resolution <= max) measure(resolution);
    }
  }

  let selected = selectMeasurement(measurements, target, preference);
  if (!selected) {
    for (let resolution = min; resolution <= max && !selected; resolution += 1) {
      measure(resolution);
      selected = selectMeasurement(measurements, target, preference);
    }
  }
  if (!selected) {
    throw new Error(`No non-empty Surface Nets mesh exists between resolutions ${min} and ${max}.`);
  }
  return {
    ...selected,
    limitedByMinimum: selected.resolution === min && selected.triangleCount > target,
    samples: [...measurements.values()].sort((left, right) => left.resolution - right.resolution),
    targetTriangles: target,
  };
}

/**
 * Meshes and plans a deterministic LOD set for a legacy procedural document.
 * Returned geometries can be passed straight to an exporter; callers that
 * only need resolutions may set `keepGeometries: false` after validation.
 * Source-mesh reference documents deliberately fail through meshDocument;
 * their exact authored LODs are loaded by referenceAssetLoader instead.
 */
export function planRockLodMeshes(document, {
  includeHelpers = false,
  keepGeometries = true,
  maxResolution = null,
  mesh = meshDocument,
  meshOptions = {},
  policy: policyOption = null,
  validate = true,
} = {}) {
  if (!document || typeof document !== 'object') {
    throw new TypeError('planRockLodMeshes requires a rock document.');
  }
  if (typeof mesh !== 'function') throw new TypeError('The rock LOD mesh callback must be a function.');
  const policyHasExplicitBudget = policyOption && typeof policyOption === 'object'
    && (Object.hasOwn(policyOption, 'triangleBudgets')
      || Object.hasOwn(policyOption, 'targetTriangles'));
  let policy = policyOption === null
    ? createReferenceRockLodPolicyForDocument(document)
    : resolveReferenceRockLodPolicy(policyOption, {
      ...(!policyHasExplicitBudget && Number.isFinite(Number(document.reference?.targetTriangles))
        ? { targetTriangles: Number(document.reference.targetTriangles) }
        : {}),
    });
  const maximum = clampInteger(
    maxResolution ?? document.meshing?.exportResolution ?? policy.maxResolution,
    policy.minResolution,
    policy.maxResolution,
  );
  const geometries = new Map();
  const invalidResolutions = new Set();
  const measureTriangles = (resolution) => {
    if (invalidResolutions.has(resolution)) {
      return { geometry: null, invalid: true, triangleCount: 0 };
    }
    if (!geometries.has(resolution)) {
      try {
        const geometry = mesh(document, {
          ...meshOptions,
          includeHelpers,
          resolution,
        });
        geometries.set(resolution, geometry);
      } catch (error) {
        if (!String(error?.message ?? error).includes('produced an empty surface')) throw error;
        invalidResolutions.add(resolution);
        return { geometry: null, invalid: true, triangleCount: 0 };
      }
    }
    const geometry = geometries.get(resolution);
    return { geometry, triangleCount: getGeometryTriangleCount(geometry) };
  };

  // Very thin or strongly elongated rocks can fall entirely between the
  // samples of an 8-cell grid. That is a grid limitation, not an empty rock.
  // If the nominal minimum is empty, scan through the probe neighborhood and
  // choose the first resolution after the last aliasing gap. Thin shapes can
  // briefly appear and disappear again (for example at grids 9 and 16), so
  // stopping at the first non-empty sample is not sufficient.
  let viableMinimum = policy.minResolution;
  if (measureTriangles(viableMinimum).invalid) {
    let lastEmpty = viableMinimum;
    let consecutiveSurfaces = 0;
    const scanFloor = Math.min(
      maximum,
      Math.max(policy.probeResolution, policy.minResolution + 8),
    );
    for (let resolution = policy.minResolution + 1;
      resolution <= maximum;
      resolution += 1) {
      const measurement = measureTriangles(resolution);
      if (!measurement.invalid) {
        consecutiveSurfaces += 1;
      } else {
        lastEmpty = resolution;
        consecutiveSurfaces = 0;
      }
      if (resolution >= scanFloor && consecutiveSurfaces >= 4) break;
    }
    viableMinimum = lastEmpty + 1;
  }
  if (viableMinimum > maximum) {
    throw new Error(
      `Rock LOD planning could not find a non-empty mesh between resolutions ${policy.minResolution} and ${maximum}.`,
    );
  }
  if (viableMinimum !== policy.minResolution) {
    policy = resolveReferenceRockLodPolicy({
      ...policy,
      minResolution: viableMinimum,
      probeResolution: Math.max(policy.probeResolution, viableMinimum),
    });
  }

  const probeResolution = Math.min(policy.probeResolution, maximum);
  const probe = measureTriangles(probeResolution);
  const baseSearch = searchSurfaceNetsResolution({
    maxResolution: maximum,
    measureTriangles,
    minResolution: policy.minResolution,
    reference: { resolution: probeResolution, triangleCount: probe.triangleCount },
    targetTriangles: policy.triangleBudgets[0],
  });
  // Author LOD0 from a stable probe-or-better surface, then edge-collapse to
  // the audited budget. Selecting a raw 8-cell mesh merely because it is
  // under budget can already destroy thin shelves before LOD reduction starts.
  let sourceResolution = Math.max(probeResolution, baseSearch.resolution);
  let sourceMeasurement = measureTriangles(sourceResolution);
  while (sourceMeasurement.invalid && sourceResolution < maximum) {
    sourceResolution += 1;
    sourceMeasurement = measureTriangles(sourceResolution);
  }
  if (sourceMeasurement.invalid) {
    sourceResolution = baseSearch.resolution;
    sourceMeasurement = baseSearch;
  }
  const authoredBase = simplifyRockGeometryToTriangleBudget(
    sourceMeasurement.geometry,
    policy.triangleBudgets[0],
  );
  const baseLevel = {
    actualRatio: 1,
    geometry: authoredBase.geometry,
    level: 0,
    limitedByMinimum: authoredBase.triangleCount > policy.triangleBudgets[0],
    method: authoredBase.retainedSource ? 'surface-nets' : 'simplified',
    removedVertices: authoredBase.removedVertices,
    reducible: false,
    resolution: sourceResolution,
    retainedTopology: false,
    retentionReason: null,
    targetRatio: 1,
    targetTriangles: policy.triangleBudgets[0],
    triangleBudget: policy.triangleBudgets[0],
    triangleCount: authoredBase.triangleCount,
  };
  const targets = createRockLodTriangleTargets(baseLevel.triangleCount, policy);
  const levels = [baseLevel];

  for (let index = 1; index < policy.levelCount; index += 1) {
    const previous = levels[index - 1];
    const target = targets[index];
    const simplified = simplifyRockGeometryToTriangleBudget(
      sourceMeasurement.geometry,
      target.targetTriangles,
    );
    if (!simplified.retainedSource) {
      matchRockGeometryBounds(simplified.geometry, baseLevel.geometry);
    }
    const retainedTopology = simplified.triangleCount >= previous.triangleCount;
    levels.push({
      actualRatio: simplified.triangleCount / baseLevel.triangleCount,
      geometry: simplified.geometry,
      level: index,
      limitedByMinimum: simplified.retainedSource && baseLevel.limitedByMinimum,
      method: simplified.retainedSource ? 'retained' : 'simplified',
      removedVertices: simplified.removedVertices,
      reducible: !retainedTopology,
      resolution: baseLevel.resolution,
      retainedTopology,
      retentionReason: retainedTopology
        ? simplified.retainedSource ? 'minimum-topology' : 'topology-plateau'
        : null,
      targetRatio: target.ratio,
      targetTriangles: target.targetTriangles,
      triangleBudget: target.triangleBudget,
      triangleCount: simplified.triangleCount,
    });
  }

  const validation = validate
    ? validateRockLodLevels(levels, { policy })
    : null;
  const resultLevels = keepGeometries
    ? levels
    : levels.map(({ geometry, ...level }) => level);
  return {
    levels: resultLevels,
    policy,
    sampledResolutions: [...geometries.keys()].sort((left, right) => left - right),
    validation,
  };
}
