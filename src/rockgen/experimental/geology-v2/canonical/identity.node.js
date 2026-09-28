import { validateEditableSourcePackage } from './sourcePackage.node.js';
import { resolveControlProgram } from './field.node.js';

function primitiveHalfSize(primitive) {
  if (primitive.halfExtentsMetres) return primitive.halfExtentsMetres;
  if (primitive.radiiMetres) return primitive.radiiMetres;
  if (primitive.verticesMetres) return [
    Math.max(...primitive.verticesMetres.map((vertex) => Math.abs(vertex[0]))),
    Math.max(...primitive.verticesMetres.map((vertex) => Math.abs(vertex[1]))),
    primitive.halfDepthMetres,
  ];
  if (primitive.kind === 'polygonal-loft') return [
    Math.max(...primitive.levels.flatMap((level) => level.verticesMetres.map((vertex) => Math.abs(vertex[0])))),
    Math.max(...primitive.levels.map((level) => Math.abs(level.yMetres))),
    Math.max(...primitive.levels.flatMap((level) => level.verticesMetres.map((vertex) => Math.abs(vertex[1])))),
  ];
  if (primitive.levels) return [
    Math.max(...primitive.levels.map((level) => level.halfExtentsMetres[0] + Math.abs(level.offsetMetres[0]))),
    Math.max(...primitive.levels.map((level) => Math.abs(level.yMetres))),
    Math.max(...primitive.levels.map((level) => level.halfExtentsMetres[1] + Math.abs(level.offsetMetres[1]))),
  ];
  if (primitive.bottomHalfExtentsMetres) return [
    Math.max(primitive.bottomHalfExtentsMetres[0], primitive.topHalfExtentsMetres[0]) + Math.abs(primitive.topOffsetMetres[0]),
    primitive.halfHeightMetres,
    Math.max(primitive.bottomHalfExtentsMetres[1], primitive.topHalfExtentsMetres[1]) + Math.abs(primitive.topOffsetMetres[1]),
  ];
  return [
    Math.max(...primitive.baseRadiiMetres, ...primitive.topRadiiMetres),
    primitive.halfHeightMetres,
    Math.max(...primitive.baseRadiiMetres, ...primitive.topRadiiMetres),
  ];
}

function solidBounds(primitives) {
  const solids = primitives.filter((primitive) => primitive.operation === 'union');
  const minimum = [Infinity, Infinity, Infinity];
  const maximum = [-Infinity, -Infinity, -Infinity];
  for (const primitive of solids) {
    const half = primitiveHalfSize(primitive);
    for (let axis = 0; axis < 3; axis += 1) {
      minimum[axis] = Math.min(minimum[axis], primitive.centerMetres[axis] - half[axis]);
      maximum[axis] = Math.max(maximum[axis], primitive.centerMetres[axis] + half[axis]);
    }
  }
  return {
    dimensions: maximum.map((value, axis) => value - minimum[axis]),
    maximum,
    minimum,
  };
}

function coefficientOfVariation(values) {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (Math.abs(mean) < 1e-12) return 0;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / Math.abs(mean);
}

function polygonWidthAtY(vertices, y) {
  const intersections = [];
  for (let index = 0, previous = vertices.length - 1; index < vertices.length; previous = index, index += 1) {
    const a = vertices[previous];
    const b = vertices[index];
    if ((a[1] > y) === (b[1] > y)) continue;
    const fraction = (y - a[1]) / (b[1] - a[1]);
    intersections.push(a[0] + (b[0] - a[0]) * fraction);
  }
  return intersections.length >= 2 ? Math.max(...intersections) - Math.min(...intersections) : null;
}

function horizontalOverlapFraction(upper, lower) {
  const upperHalf = primitiveHalfSize(upper);
  const lowerHalf = primitiveHalfSize(lower);
  const overlapX = Math.max(0, Math.min(
    upper.centerMetres[0] + upperHalf[0],
    lower.centerMetres[0] + lowerHalf[0],
  ) - Math.max(
    upper.centerMetres[0] - upperHalf[0],
    lower.centerMetres[0] - lowerHalf[0],
  ));
  const overlapZ = Math.max(0, Math.min(
    upper.centerMetres[2] + upperHalf[2],
    lower.centerMetres[2] + lowerHalf[2],
  ) - Math.max(
    upper.centerMetres[2] - upperHalf[2],
    lower.centerMetres[2] - lowerHalf[2],
  ));
  const upperArea = upperHalf[0] * 2 * upperHalf[2] * 2;
  return overlapX * overlapZ / Math.max(upperArea, 1e-12);
}

function supportFraction(primitives) {
  const blocks = primitives.filter((primitive) => primitive.role === 'joint-block');
  const supports = primitives.filter((primitive) => primitive.operation === 'union');
  const fractions = blocks.map((block) => {
    const blockHalf = primitiveHalfSize(block);
    const blockBottom = block.centerMetres[1] - blockHalf[1];
    let best = 0;
    for (const candidate of supports) {
      if (candidate.id === block.id || candidate.centerMetres[1] >= block.centerMetres[1]) continue;
      const candidateHalf = primitiveHalfSize(candidate);
      const candidateTop = candidate.centerMetres[1] + candidateHalf[1];
      if (Math.abs(blockBottom - candidateTop) > Math.max(0.9, blockHalf[1] * 0.7)) continue;
      best = Math.max(best, horizontalOverlapFraction(block, candidate));
    }
    return best;
  });
  return fractions.reduce((sum, value) => sum + value, 0) / Math.max(fractions.length, 1);
}

function openingPrimitive(primitives) {
  return primitives.find((primitive) => primitive.operation === 'subtract' && primitive.role === 'opening');
}

function openingSize(primitive) {
  const half = primitiveHalfSize(primitive);
  return half.map((value) => value * 2);
}

function measure(sourcePackage) {
  const primitives = resolveControlProgram(sourcePackage).primitives;
  const bounds = solidBounds(primitives);
  const width = Math.max(bounds.dimensions[0], bounds.dimensions[2]);
  if (sourcePackage.subtypeId === 'tor-block-pile') {
    return {
      contactSupportFraction: supportFraction(primitives),
      heightWidthRatio: bounds.dimensions[1] / width,
      stackedMassCount: primitives.filter((primitive) => primitive.role === 'joint-block').length,
    };
  }
  if (sourcePackage.subtypeId === 'pillar-residual') {
    const body = primitives.find((primitive) => primitive.role === 'tower-body');
    let shaftWidths = [];
    if (body?.kind === 'polygonal-loft') {
      shaftWidths = body.levels.map((level) => {
        const x = level.verticesMetres.map((vertex) => vertex[0]);
        return Math.max(...x) - Math.min(...x);
      });
    } else if (body?.levels) {
      shaftWidths = body.levels.map((level) => Math.max(...level.halfExtentsMetres) * 2);
    }
    if (body?.verticesMetres) {
      const minimumY = Math.min(...body.verticesMetres.map((vertex) => vertex[1]));
      const maximumY = Math.max(...body.verticesMetres.map((vertex) => vertex[1]));
      shaftWidths = Array.from({ length: 7 }, (_, index) => polygonWidthAtY(
        body.verticesMetres,
        minimumY + (maximumY - minimumY) * (0.08 + index * 0.14),
      )).filter(Number.isFinite);
    }
    return {
      heightWidthRatio: bounds.dimensions[1] / width,
      shaftWidthVariation: coefficientOfVariation(shaftWidths),
    };
  }
  if (sourcePackage.subtypeId === 'hoodoo-caprock') {
    const body = primitives.find((primitive) => primitive.role === 'hoodoo-profile' && ['polygonal-loft', 'profiled-column'].includes(primitive.kind));
    const levelWidth = (level) => {
      if (level.halfExtentsMetres) return Math.max(...level.halfExtentsMetres) * 2;
      const x = level.verticesMetres.map((vertex) => vertex[0]);
      const z = level.verticesMetres.map((vertex) => vertex[1]);
      return Math.max(Math.max(...x) - Math.min(...x), Math.max(...z) - Math.min(...z));
    };
    const capLevels = body?.levels.filter((level) => level.morphologyZone === 'cap') ?? [];
    const shaftLevels = body?.levels.filter((level) => level.morphologyZone === 'shaft') ?? [];
    const baseLevels = body?.levels.filter((level) => level.morphologyZone === 'base') ?? [];
    const capWidth = capLevels.length > 0 ? Math.max(...capLevels.map(levelWidth)) : NaN;
    const shaftWidth = shaftLevels.length > 0 ? Math.max(...shaftLevels.map(levelWidth)) : NaN;
    const baseWidth = baseLevels.length > 0 ? Math.max(...baseLevels.map(levelWidth)) : NaN;
    return {
      baseWidthShaftWidthRatio: baseWidth / shaftWidth,
      capWidthMetres: capWidth,
      capWidthShaftWidthRatio: capWidth / shaftWidth,
      heightMetres: bounds.dimensions[1],
      // For a caprock hoodoo, "width" is the supporting shaft, not the deliberately
      // overhanging resistant cap. The cap is constrained independently above.
      heightWidthRatio: bounds.dimensions[1] / shaftWidth,
      shaftWidthMetres: shaftWidth,
      supportLandmarkCount: sourcePackage.identityLandmarks.filter((landmark) => landmark.role === 'support').length,
    };
  }
  if (sourcePackage.subtypeId === 'arch-sandstone') {
    const opening = openingPrimitive(primitives);
    const size = openingSize(opening);
    const roofTop = bounds.maximum[1];
    const openingTop = opening.centerMetres[1] + size[1] * 0.5;
    return {
      openingWidthHeightRatio: size[0] / size[1],
      roofThicknessSpanRatio: (roofTop - openingTop) / size[0],
      supportGraphPass: sourcePackage.identityLandmarks.filter((landmark) => landmark.role === 'support').length >= 2 ? 1 : 0,
    };
  }
  if (sourcePackage.subtypeId === 'cliff-module-straight') {
    const seams = sourcePackage.identityLandmarks.filter((landmark) => landmark.role === 'module-seam');
    const expected = sourcePackage.targetDimensionsMetres[0] * 0.5;
    return {
      faceContinuity: primitives.some((primitive) => primitive.role === 'continuous-wall') ? 1 : 0,
      seamProfileToleranceMetres: Math.max(...seams.map((landmark) => Math.abs(Math.abs(landmark.positionMetres[0]) - expected))),
    };
  }
  if (sourcePackage.subtypeId === 'mountain-modular-bedrock') {
    const roles = new Set(primitives.filter((primitive) => primitive.operation === 'union').map((primitive) => {
      if (primitive.role === 'primary-mass') return 'primary';
      if (primitive.role === 'secondary-buttress') return 'secondary';
      return 'tertiary';
    }));
    return {
      moduleCount: primitives.filter((primitive) => primitive.operation === 'union').length,
      seamProfileToleranceMetres: 0,
      silhouetteScaleLevels: roles.size,
    };
  }
  return {};
}

function validateCustomMeshIdentity(validated) {
  const sourcePackage = validated.package;
  const customMeshSource = sourcePackage.customMeshSource;
  const primitive = resolveControlProgram(sourcePackage).primitives.find((entry) => (
    entry.kind === 'custom-mesh' && entry.artifactId === customMeshSource.control.id
  ));
  const dimensionsMetres = primitive
    ? customMeshSource.control.dimensionsMetres.map((value, axis) => value * primitive.scale[axis])
    : [0, 0, 0];
  const baseTargetDimensionErrorFraction = Math.max(...customMeshSource.control.dimensionsMetres.map((value, axis) => (
    Math.abs(value - sourcePackage.targetDimensionsMetres[axis])
      / Math.max(sourcePackage.targetDimensionsMetres[axis], 1e-9)
  )));
  const resolvedDimensionChangeFraction = Math.max(...dimensionsMetres.map((value, axis) => (
    Math.abs(value - customMeshSource.control.dimensionsMetres[axis])
      / Math.max(customMeshSource.control.dimensionsMetres[axis], 1e-9)
  )));
  const measurements = {
    baseSupportRegionCount: customMeshSource.semanticRegions.filter((region) => region.role === 'base-support').length,
    contentBoundControlCount: primitive ? 1 : 0,
    dimensionsMetres,
    identityLandmarkCount: sourcePackage.identityLandmarks.length,
    semanticRegionCount: customMeshSource.semanticRegions.length,
    baseTargetDimensionErrorFraction,
    resolvedDimensionChangeFraction,
  };
  const checks = [
    { actual: measurements.contentBoundControlCount, metric: 'contentBoundControlCount', passed: measurements.contentBoundControlCount === 1, range: [1, 1] },
    { actual: measurements.semanticRegionCount, metric: 'semanticRegionCount', passed: measurements.semanticRegionCount >= 3, range: [3, Number.MAX_SAFE_INTEGER] },
    { actual: measurements.baseSupportRegionCount, metric: 'baseSupportRegionCount', passed: measurements.baseSupportRegionCount >= 1, range: [1, Number.MAX_SAFE_INTEGER] },
    { actual: measurements.identityLandmarkCount, metric: 'identityLandmarkCount', passed: measurements.identityLandmarkCount >= 3, range: [3, Number.MAX_SAFE_INTEGER] },
    { actual: baseTargetDimensionErrorFraction, metric: 'baseTargetDimensionErrorFraction', passed: baseTargetDimensionErrorFraction <= 1e-5, range: [0, 1e-5] },
  ];
  const deferredSubtypeMetricChecks = Object.entries(validated.subtype.identityMetrics).map(([metric, range]) => ({
    actual: null,
    metric,
    passed: null,
    range,
    status: 'requires-seven-view-visual-or-mesh-measurement-review',
  }));
  return Object.freeze({
    checks,
    deferredSubtypeMetricChecks,
    forbiddenDriftChecks: validated.subtype.forbiddenDrift.map((description) => ({
      description,
      passed: null,
      status: 'requires-seven-view-visual-confirmation',
    })),
    identityMode: 'content-bound-custom-mesh-structural-gate',
    measurements,
    passed: checks.every((check) => check.passed),
    requiredSilhouette: validated.subtype.requiredSilhouette,
    sourceContentId: validated.contentId,
    subtypeId: validated.subtype.id,
    visualApprovalRequired: true,
  });
}

export function validateCanonicalIdentity(sourcePackage) {
  const validated = validateEditableSourcePackage(sourcePackage);
  if (validated.package.customMeshSource) return validateCustomMeshIdentity(validated);
  const measurements = measure(validated.package);
  const checks = Object.entries(validated.subtype.identityMetrics).map(([metric, range]) => {
    const actual = measurements[metric];
    return {
      actual: Number.isFinite(actual) ? actual : null,
      metric,
      passed: Number.isFinite(actual) && actual >= range[0] && actual <= range[1],
      range,
    };
  });
  const forbiddenDriftChecks = validated.subtype.forbiddenDrift.map((description) => ({
    description,
    passed: checks.every((check) => check.passed),
    status: 'metric-proxy-requires-visual-confirmation',
  }));
  return Object.freeze({
    checks,
    forbiddenDriftChecks,
    measurements,
    passed: checks.length > 0 && checks.every((check) => check.passed),
    requiredSilhouette: validated.subtype.requiredSilhouette,
    sourceContentId: validated.contentId,
    subtypeId: validated.subtype.id,
    visualApprovalRequired: true,
  });
}
