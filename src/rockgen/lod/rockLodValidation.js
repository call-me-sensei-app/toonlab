import { compareRockLodGeometry } from './rockLodMetrics.js';
import { resolveReferenceRockLodPolicy } from './rockLodPolicy.js';

function message(level, text) {
  return { level, text };
}

/**
 * Validates a planned LOD set. Equal topology is legal only when explicitly
 * marked as minimum-resolution/topology limited, or while the preceding mesh
 * is below the policy's tiny-mesh threshold.
 */
export function validateRockLodLevels(levels, {
  policy: policyOption = 'boulder',
} = {}) {
  const policy = resolveReferenceRockLodPolicy(policyOption);
  const errors = [];
  const warnings = [];
  const comparisons = [];

  if (!Array.isArray(levels) || levels.length !== policy.levelCount) {
    return {
      comparisons,
      errors: [message(
        null,
        `A rock LOD plan for this policy must contain exactly ${policy.levelCount} level(s).`,
      )],
      valid: false,
      warnings,
    };
  }

  const base = levels[0];
  for (let index = 0; index < levels.length; index += 1) {
    const level = levels[index];
    const expectedLevel = index;
    if (level.level !== expectedLevel) {
      errors.push(message(expectedLevel, `Expected level ${expectedLevel}, received ${level.level}.`));
    }
    if (!Number.isFinite(level.triangleCount) || level.triangleCount <= 0) {
      errors.push(message(expectedLevel, 'Triangle count must be a positive finite number.'));
      continue;
    }
    if (level.triangleCount > policy.triangleBudgets[index]) {
      const minimumLimited = level.resolution === policy.minResolution && level.limitedByMinimum;
      const target = `LOD${index} has ${level.triangleCount} triangles, above its ${policy.triangleBudgets[index]} budget`;
      if (minimumLimited) warnings.push(message(index, `${target}; the minimum grid is already in use.`));
      else errors.push(message(index, `${target}.`));
    }

    if (index === 0) continue;
    const previous = levels[index - 1];
    if (level.triangleCount >= previous.triangleCount) {
      const legalRetention = Boolean(level.retainedTopology)
        && policy.allowTinyTopologyRetention
        && !level.reducible
        && (previous.triangleCount <= policy.tinyTriangleThreshold
          || level.resolution === policy.minResolution
          || level.retentionReason === 'topology-plateau');
      if (legalRetention) {
        warnings.push(message(index, `LOD${index} legally retains ${level.triangleCount} tiny/minimum topology triangles.`));
      } else {
        errors.push(message(
          index,
          `LOD${index} must have fewer triangles than LOD${index - 1} when the mesh is reducible.`,
        ));
      }
    }

    if (!level.limitedByMinimum && !level.retainedTopology) {
      const actualRatio = level.triangleCount / base.triangleCount;
      const expectedRatio = policy.ratios[index];
      const relativeError = Math.abs(actualRatio - expectedRatio) / expectedRatio;
      if (relativeError > policy.ratioTolerance) {
        errors.push(message(
          index,
          `LOD${index} ratio ${actualRatio.toFixed(3)} misses target ${expectedRatio.toFixed(3)} by ${(relativeError * 100).toFixed(1)}%.`,
        ));
      }
    }

    if (!base.geometry || !level.geometry) {
      warnings.push(message(index, `LOD${index} geometry was omitted; bounds/silhouette validation was skipped.`));
      continue;
    }
    const comparison = compareRockLodGeometry(base.geometry, level.geometry, {
      gridSize: policy.silhouetteGridSize,
    });
    comparisons.push({ level: index, ...comparison });
    if (comparison.bounds.maxSizeError > policy.boundsSizeTolerance) {
      errors.push(message(
        index,
        `LOD${index} bounds size drift ${(comparison.bounds.maxSizeError * 100).toFixed(1)}% exceeds ${(policy.boundsSizeTolerance * 100).toFixed(1)}%.`,
      ));
    }
    if (comparison.bounds.centerDrift > policy.boundsCenterTolerance) {
      errors.push(message(
        index,
        `LOD${index} bounds center drift ${(comparison.bounds.centerDrift * 100).toFixed(1)}% exceeds ${(policy.boundsCenterTolerance * 100).toFixed(1)}%.`,
      ));
    }
    const silhouetteThreshold = policy.silhouetteThresholds?.[index]
      ?? policy.silhouetteThreshold;
    if (comparison.silhouette.min < silhouetteThreshold) {
      errors.push(message(
        index,
        `LOD${index} minimum silhouette IoU ${comparison.silhouette.min.toFixed(3)} is below ${silhouetteThreshold.toFixed(3)}.`,
      ));
    }
  }

  return { comparisons, errors, valid: errors.length === 0, warnings };
}
