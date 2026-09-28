// Repository-only, family-agnostic high-to-low surface baker.
//
// Contract: callers provide a low mesh plus low/high signed-distance fields.
// The compiler traces the detailed surface from each low-mesh atlas texel and
// writes object normal + AO and height + curvature + semantic region pages.

import { ROCK_ATLAS_CHARTS } from './surfaceAtlas.js';

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function clamp01(value) {
  return clamp(value, 0, 1);
}

function encodeUnorm(value) {
  return Math.round(clamp01(value) * 255);
}

function normalize3(x, y, z) {
  const length = Math.sqrt(x * x + y * y + z * z);
  return length > 1e-10 ? [x / length, y / length, z / length] : [0, 1, 0];
}

function fieldNormal(evaluate, x, y, z, epsilon) {
  const px = evaluate(x + epsilon, y, z);
  const nx = evaluate(x - epsilon, y, z);
  const py = evaluate(x, y + epsilon, z);
  const ny = evaluate(x, y - epsilon, z);
  const pz = evaluate(x, y, z + epsilon);
  const nz = evaluate(x, y, z - epsilon);
  return {
    laplacianNumerator: px + nx + py + ny + pz + nz,
    normal: normalize3(px - nx, py - ny, pz - nz),
  };
}

function traceDetailedSurface(evaluate, point, normal, maximumDistance, epsilon) {
  const sample = (distance) => evaluate(
    point[0] + normal[0] * distance,
    point[1] + normal[1] * distance,
    point[2] + normal[2] * distance,
  );
  let distance = 0;
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const value = sample(distance);
    if (Math.abs(value) < epsilon * 0.35) {
      return { distance, hit: true };
    }
    const derivative = (sample(distance + epsilon) - sample(distance - epsilon)) / (2 * epsilon);
    if (Math.abs(derivative) < 0.08) break;
    distance = clamp(distance - value / derivative, -maximumDistance, maximumDistance);
  }

  const steps = 20;
  let previousDistance = -maximumDistance;
  let previousValue = sample(previousDistance);
  let bestDistance = previousDistance;
  let bestValue = Math.abs(previousValue);
  for (let step = 1; step <= steps; step += 1) {
    const nextDistance = -maximumDistance + (2 * maximumDistance * step) / steps;
    const nextValue = sample(nextDistance);
    if (Math.abs(nextValue) < bestValue) {
      bestDistance = nextDistance;
      bestValue = Math.abs(nextValue);
    }
    if ((previousValue < 0) !== (nextValue < 0)) {
      let lo = previousDistance;
      let hi = nextDistance;
      let loValue = previousValue;
      for (let iteration = 0; iteration < 10; iteration += 1) {
        const middle = (lo + hi) * 0.5;
        const middleValue = sample(middle);
        if ((loValue < 0) !== (middleValue < 0)) hi = middle;
        else {
          lo = middle;
          loValue = middleValue;
        }
      }
      return { distance: (lo + hi) * 0.5, hit: true };
    }
    previousDistance = nextDistance;
    previousValue = nextValue;
  }
  return { distance: bestDistance, hit: bestValue < epsilon * 2.5 };
}

function sampleAo(evaluate, point, normal, radius) {
  let occlusion = 0;
  let weight = 1;
  let weightSum = 0;
  for (let tap = 1; tap <= 5; tap += 1) {
    const distance = (radius * tap) / 5;
    const fieldDistance = evaluate(
      point[0] + normal[0] * distance,
      point[1] + normal[1] * distance,
      point[2] + normal[2] * distance,
    );
    occlusion += weight * Math.max(distance - fieldDistance, 0) / distance;
    weightSum += weight;
    weight *= 0.56;
  }
  return clamp01(1 - 0.82 * occlusion / weightSum);
}

function barycentric(px, py, ax, ay, bx, by, cx, cy) {
  const denominator = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
  if (Math.abs(denominator) < 1e-12) return null;
  const wa = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / denominator;
  const wb = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / denominator;
  const wc = 1 - wa - wb;
  const tolerance = -0.0005;
  return wa >= tolerance && wb >= tolerance && wc >= tolerance ? [wa, wb, wc] : null;
}

function dilatePages(normalAo, surface, coverage, width, height, passes) {
  let mask = coverage.slice();
  for (let pass = 0; pass < passes; pass += 1) {
    const previousMask = mask;
    mask = previousMask.slice();
    const normalCopy = normalAo.slice();
    const surfaceCopy = surface.slice();
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const texel = x + y * width;
        if (previousMask[texel]) continue;
        const neighbours = [
          x > 0 ? texel - 1 : -1,
          x + 1 < width ? texel + 1 : -1,
          y > 0 ? texel - width : -1,
          y + 1 < height ? texel + width : -1,
        ];
        const sourceTexel = neighbours.find((candidate) => candidate >= 0 && previousMask[candidate]);
        if (sourceTexel === undefined) continue;
        const targetOffset = texel * 4;
        const sourceOffset = sourceTexel * 4;
        normalCopy.set(normalAo.subarray(sourceOffset, sourceOffset + 4), targetOffset);
        surfaceCopy.set(surface.subarray(sourceOffset, sourceOffset + 4), targetOffset);
        mask[texel] = 1;
      }
    }
    normalAo.set(normalCopy);
    surface.set(surfaceCopy);
  }
  return mask;
}

/**
 * Bake two packed RGBA8 pages:
 * - normalAo: object-space normal.xyz, ambient occlusion
 * - surface: signed height, signed curvature, semantic region, coverage
 */
export function bakeRockSurface({
  atlas,
  atlasResolution = 512,
  evaluateHigh,
  maxProjectionDistance = 0.1,
  regionAt = () => 0,
} = {}) {
  if (!atlas?.geometry || typeof evaluateHigh !== 'function') {
    throw new Error('Surface bake requires an atlas geometry and detailed field.');
  }
  const width = Math.max(64, Math.round(atlasResolution));
  const height = width;
  const geometry = atlas.geometry;
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const uv = geometry.getAttribute('uv');
  const index = geometry.index;
  const normalAo = new Uint8Array(width * height * 4);
  const surface = new Uint8Array(width * height * 4);
  const coverage = new Uint8Array(width * height);
  const hitMask = new Uint8Array(width * height);
  const depthBuffer = new Float32Array(width * height).fill(-Infinity);
  let coveredTexels = 0;
  let hitTexels = 0;
  let projectionConflicts = 0;
  const epsilon = Math.max(maxProjectionDistance / 42, 0.0016);
  const curvatureScale = 0.026;
  const aoRadius = Math.max(maxProjectionDistance * 1.7, 0.12);

  for (let triangle = 0; triangle < index.count / 3; triangle += 1) {
    const ia = index.getX(triangle * 3);
    const ib = index.getX(triangle * 3 + 1);
    const ic = index.getX(triangle * 3 + 2);
    const ax = uv.getX(ia) * (width - 1);
    const ay = (1 - uv.getY(ia)) * (height - 1);
    const bx = uv.getX(ib) * (width - 1);
    const by = (1 - uv.getY(ib)) * (height - 1);
    const cx = uv.getX(ic) * (width - 1);
    const cy = (1 - uv.getY(ic)) * (height - 1);
    const minX = clamp(Math.floor(Math.min(ax, bx, cx) - 0.5), 0, width - 1);
    const maxX = clamp(Math.ceil(Math.max(ax, bx, cx) + 0.5), 0, width - 1);
    const minY = clamp(Math.floor(Math.min(ay, by, cy) - 0.5), 0, height - 1);
    const maxY = clamp(Math.ceil(Math.max(ay, by, cy) + 0.5), 0, height - 1);
    const chart = ROCK_ATLAS_CHARTS[atlas.triangleCharts[triangle]];

    for (let py = minY; py <= maxY; py += 1) {
      for (let px = minX; px <= maxX; px += 1) {
        const weights = barycentric(px + 0.5, py + 0.5, ax, ay, bx, by, cx, cy);
        if (!weights) continue;
        const [wa, wb, wc] = weights;
        const point = [
          position.getX(ia) * wa + position.getX(ib) * wb + position.getX(ic) * wc,
          position.getY(ia) * wa + position.getY(ib) * wb + position.getY(ic) * wc,
          position.getZ(ia) * wa + position.getZ(ib) * wb + position.getZ(ic) * wc,
        ];
        const lowNormal = normalize3(
          normal.getX(ia) * wa + normal.getX(ib) * wb + normal.getX(ic) * wc,
          normal.getY(ia) * wa + normal.getY(ib) * wb + normal.getY(ic) * wc,
          normal.getZ(ia) * wa + normal.getZ(ib) * wb + normal.getZ(ic) * wc,
        );
        const depth = point[chart.axis] * chart.direction;
        const texel = px + py * width;
        if (coverage[texel]) {
          if (Math.abs(depth - depthBuffer[texel]) > 0.004) projectionConflicts += 1;
          if (depth <= depthBuffer[texel]) continue;
        }
        const traced = traceDetailedSurface(
          evaluateHigh,
          point,
          lowNormal,
          maxProjectionDistance,
          epsilon,
        );
        const hitPoint = [
          point[0] + lowNormal[0] * traced.distance,
          point[1] + lowNormal[1] * traced.distance,
          point[2] + lowNormal[2] * traced.distance,
        ];
        const fieldSample = fieldNormal(
          evaluateHigh,
          hitPoint[0],
          hitPoint[1],
          hitPoint[2],
          epsilon,
        );
        const detailedNormal = fieldSample.normal;
        const ao = sampleAo(evaluateHigh, hitPoint, detailedNormal, aoRadius);
        const fieldCenter = evaluateHigh(...hitPoint);
        const laplacian = (fieldSample.laplacianNumerator - 6 * fieldCenter) / (epsilon * epsilon);
        const curvature = clamp(laplacian * curvatureScale, -1, 1);
        const region = regionAt(...hitPoint, detailedNormal, ao);
        const output = texel * 4;
        normalAo[output] = encodeUnorm(detailedNormal[0] * 0.5 + 0.5);
        normalAo[output + 1] = encodeUnorm(detailedNormal[1] * 0.5 + 0.5);
        normalAo[output + 2] = encodeUnorm(detailedNormal[2] * 0.5 + 0.5);
        normalAo[output + 3] = encodeUnorm(ao);
        surface[output] = encodeUnorm(traced.distance / maxProjectionDistance * 0.5 + 0.5);
        surface[output + 1] = encodeUnorm(curvature * 0.5 + 0.5);
        surface[output + 2] = encodeUnorm(region);
        surface[output + 3] = 255;
        if (!coverage[texel]) coveredTexels += 1;
        if (traced.hit && !hitMask[texel]) hitTexels += 1;
        else if (!traced.hit && hitMask[texel]) hitTexels -= 1;
        hitMask[texel] = traced.hit ? 1 : 0;
        coverage[texel] = 1;
        depthBuffer[texel] = depth;
      }
    }
  }

  const dilationPasses = Math.max(2, atlas.gutterTexels);
  const dilatedCoverage = dilatePages(
    normalAo,
    surface,
    coverage,
    width,
    height,
    dilationPasses,
  );
  return {
    height,
    normalAo,
    stats: {
      atlasCoverage: coveredTexels / (width * height),
      coveredTexels,
      dilationPasses,
      dilatedTexels: dilatedCoverage.reduce((total, value) => total + (value ? 1 : 0), 0),
      hitRate: coveredTexels > 0 ? hitTexels / coveredTexels : 0,
      hitTexels,
      projectionConflictRate: coveredTexels > 0 ? projectionConflicts / coveredTexels : 0,
      projectionConflicts,
    },
    surface,
    width,
  };
}
