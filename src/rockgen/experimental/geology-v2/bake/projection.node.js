function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function normalize3(value, fallback = [0, 1, 0]) {
  const length = Math.hypot(...value);
  return length > 1e-12 ? value.map((component) => component / length) : fallback;
}

function evaluateAlong(evaluate, point, normal, distance) {
  return evaluate(
    point[0] + normal[0] * distance,
    point[1] + normal[1] * distance,
    point[2] + normal[2] * distance,
  );
}

/**
 * Find all bracketed roots inside a symmetric cage and select the root nearest
 * the low surface. This is the explicit disambiguation rule for thin shells,
 * concavities, and stacked surfaces; it never silently selects the first hit.
 */
export function traceCagedSurface(evaluate, point, normal, {
  cageDistance,
  epsilon,
  scanSteps = 48,
} = {}) {
  let distance = 0;
  let bestDistance = 0;
  let bestResidual = Math.abs(evaluateAlong(evaluate, point, normal, 0));
  for (let iteration = 0; iteration < 7; iteration += 1) {
    const value = evaluateAlong(evaluate, point, normal, distance);
    const residual = Math.abs(value);
    if (residual < bestResidual) {
      bestResidual = residual;
      bestDistance = distance;
    }
    if (residual <= epsilon) return { distance, hit: true, rootCount: 1, selection: 'nearest-to-low-surface' };
    const plus = evaluateAlong(evaluate, point, normal, distance + epsilon);
    const minus = evaluateAlong(evaluate, point, normal, distance - epsilon);
    const derivative = (plus - minus) / (2 * epsilon);
    if (Math.abs(derivative) < 0.04) break;
    const candidate = clamp(distance - value / derivative, -cageDistance, cageDistance);
    if (Math.abs(candidate - distance) < epsilon * 0.08) break;
    distance = candidate;
  }

  const roots = [];
  let previousDistance = -cageDistance;
  let previousValue = evaluateAlong(evaluate, point, normal, previousDistance);
  for (let step = 1; step <= scanSteps; step += 1) {
    const nextDistance = -cageDistance + 2 * cageDistance * step / scanSteps;
    const nextValue = evaluateAlong(evaluate, point, normal, nextDistance);
    if (Math.abs(nextValue) < bestResidual) {
      bestResidual = Math.abs(nextValue);
      bestDistance = nextDistance;
    }
    if ((previousValue < 0) !== (nextValue < 0)) {
      let lo = previousDistance;
      let hi = nextDistance;
      let loValue = previousValue;
      for (let iteration = 0; iteration < 18; iteration += 1) {
        const middle = (lo + hi) * 0.5;
        const middleValue = evaluateAlong(evaluate, point, normal, middle);
        if ((loValue < 0) !== (middleValue < 0)) hi = middle;
        else {
          lo = middle;
          loValue = middleValue;
        }
      }
      const root = (lo + hi) * 0.5;
      if (!roots.some((candidate) => Math.abs(candidate - root) <= epsilon * 2)) roots.push(root);
    }
    previousDistance = nextDistance;
    previousValue = nextValue;
  }
  if (roots.length) {
    roots.sort((left, right) => Math.abs(left) - Math.abs(right) || left - right);
    return { distance: roots[0], hit: true, rootCount: roots.length, selection: 'nearest-to-low-surface' };
  }
  // At a sharp low-poly corner the interpolated vertex normal can be tangent
  // to the displaced source, so no one-dimensional sign bracket exists even
  // though the source surface is nearby. Use a bounded 3D Newton projection as
  // an explicit last resort; it must converge inside the same cage and never
  // turns a residual-only sample into a hit.
  let projected = [...point];
  let projectedResidual = Math.abs(evaluate(...projected));
  for (let iteration = 0; iteration < 12; iteration += 1) {
    const value = evaluate(...projected);
    const gradient = [0, 1, 2].map((axis) => {
      const plus = [...projected];
      const minus = [...projected];
      plus[axis] += epsilon;
      minus[axis] -= epsilon;
      return (evaluate(...plus) - evaluate(...minus)) / (2 * epsilon);
    });
    const squaredLength = gradient.reduce((sum, component) => sum + component * component, 0);
    if (squaredLength < 1e-12) break;
    const candidate = projected.map((component, axis) => component - gradient[axis] * value / squaredLength);
    const offset = candidate.map((component, axis) => component - point[axis]);
    const offsetLength = Math.hypot(...offset);
    projected = offsetLength > cageDistance
      ? point.map((component, axis) => component + offset[axis] * cageDistance / offsetLength)
      : candidate;
    projectedResidual = Math.abs(evaluate(...projected));
    if (projectedResidual <= epsilon) {
      const projectedOffset = projected.map((component, axis) => component - point[axis]);
      return {
        distance: projectedOffset.reduce((sum, component, axis) => sum + component * normal[axis], 0),
        hit: true,
        point: projected,
        rootCount: 0,
        selection: 'bounded-nearest-surface-fallback',
      };
    }
  }
  return {
    distance: bestDistance,
    hit: false,
    residual: Math.min(bestResidual, projectedResidual),
    rootCount: 0,
    selection: 'nearest-residual-fallback',
  };
}

export function fieldNormalAndCurvature(evaluate, point, epsilon) {
  const center = evaluate(...point);
  const pairs = [0, 1, 2].map((axis) => {
    const plus = [...point];
    const minus = [...point];
    plus[axis] += epsilon;
    minus[axis] -= epsilon;
    return [evaluate(...plus), evaluate(...minus)];
  });
  const normal = normalize3(pairs.map(([plus, minus]) => plus - minus));
  const laplacian = pairs.reduce((sum, [plus, minus]) => sum + plus + minus - 2 * center, 0) / (epsilon * epsilon);
  return { curvature: laplacian, normal };
}

function sampleAmbientOcclusion(evaluate, point, normal, radius) {
  let occlusion = 0;
  let weight = 1;
  let weightSum = 0;
  for (let tap = 1; tap <= 5; tap += 1) {
    const distance = radius * tap / 5;
    const sample = evaluateAlong(evaluate, point, normal, distance);
    occlusion += weight * Math.max(distance - sample, 0) / distance;
    weightSum += weight;
    weight *= 0.56;
  }
  return clamp(1 - 0.78 * occlusion / weightSum, 0, 1);
}

function barycentric(point, a, b, c) {
  const denominator = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
  if (Math.abs(denominator) < 1e-14) return null;
  const wa = ((b[1] - c[1]) * (point[0] - c[0]) + (c[0] - b[0]) * (point[1] - c[1])) / denominator;
  const wb = ((c[1] - a[1]) * (point[0] - c[0]) + (a[0] - c[0]) * (point[1] - c[1])) / denominator;
  const wc = 1 - wa - wb;
  return wa >= -1e-7 && wb >= -1e-7 && wc >= -1e-7 ? [wa, wb, wc] : null;
}

function linearToSrgb(value) {
  const clamped = clamp(value, 0, 1);
  return clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * clamped ** (1 / 2.4) - 0.055;
}

function unorm(value) {
  return Math.round(clamp(value, 0, 1) * 255);
}

function createPage(width, height, colorSpace, channels) {
  return {
    channels,
    colorSpace,
    data: new Uint8Array(width * height * 4),
    height,
    width,
  };
}

function copyTexel(page, from, to) {
  page.data.copyWithin(to * 4, from * 4, from * 4 + 4);
}

function dilatePages(pages, coverage, width, height, passes) {
  let mask = coverage.slice();
  for (let pass = 0; pass < passes; pass += 1) {
    const before = mask;
    const after = before.slice();
    const assignments = [];
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
      const target = x + y * width;
      if (before[target]) continue;
      const candidates = [
        x > 0 ? target - 1 : -1,
        x + 1 < width ? target + 1 : -1,
        y > 0 ? target - width : -1,
        y + 1 < height ? target + width : -1,
      ];
      const source = candidates.find((candidate) => candidate >= 0 && before[candidate]);
      if (source === undefined) continue;
      after[target] = 1;
      assignments.push([source, target]);
    }
    for (const page of Object.values(pages)) for (const [source, target] of assignments) copyTexel(page, source, target);
    mask = after;
  }
  return mask;
}

function downsamplePage(page) {
  const width = Math.max(1, Math.floor(page.width / 2));
  const height = Math.max(1, Math.floor(page.height / 2));
  const output = createPage(width, height, page.colorSpace, page.channels);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const target = (x + y * width) * 4;
    const count = 4;
    for (let channel = 0; channel < 4; channel += 1) {
      let sum = 0;
      for (let oy = 0; oy < 2; oy += 1) for (let ox = 0; ox < 2; ox += 1) {
        const sourceX = Math.min(x * 2 + ox, page.width - 1);
        const sourceY = Math.min(y * 2 + oy, page.height - 1);
        sum += page.data[(sourceX + sourceY * page.width) * 4 + channel];
      }
      output.data[target + channel] = Math.round(sum / count);
    }
  }
  return output;
}

function buildMipChains(pages, maximumMipLevel) {
  return Object.fromEntries(Object.entries(pages).map(([id, page]) => {
    const levels = [page];
    while (levels.length <= maximumMipLevel && (levels.at(-1).width > 1 || levels.at(-1).height > 1)) {
      levels.push(downsamplePage(levels.at(-1)));
    }
    return [id, levels];
  }));
}

function finiteArray(array) {
  for (const value of array) if (!Number.isFinite(value)) return false;
  return true;
}

/** Bake the complete C7 neutral-realistic channel set from one shared field. */
export function bakeRockChannels({
  atlas,
  detailField,
  cageDistance,
} = {}) {
  if (!atlas?.mesh?.uvs || typeof detailField?.evaluate !== 'function') throw new Error('C7 bake requires an unwrapped mesh and dense detail field.');
  const mesh = atlas.mesh;
  const width = atlas.atlasResolution;
  const height = width;
  const pages = {
    baseColor: createPage(width, height, 'sRGB', 'rgb=lighting-free base color; a=coverage'),
    normal: createPage(width, height, 'linear', 'rgb=tangent normal +Y/OpenGL; a=coverage'),
    ormHeight: createPage(width, height, 'linear', 'r=ambient occlusion; g=roughness; b=height; a=coverage'),
    cavityCurvature: createPage(width, height, 'linear', 'r=cavity; g=signed curvature; b=height; a=coverage'),
    materialFabric: createPage(width, height, 'linear', 'r=material weakness; g=fabric weakness; b=deposition; a=coverage'),
    fracture: createPage(width, height, 'linear', 'r=fracture; g=cavity; b=curvature magnitude; a=coverage'),
    weathering: createPage(width, height, 'linear', 'r=weathering; g=exposure; b=wetness; a=coverage'),
  };
  const highPrecision = {
    ao: new Float32Array(width * height),
    curvature: new Float32Array(width * height),
    height: new Float32Array(width * height),
    normal: new Float32Array(width * height * 3),
    roughness: new Float32Array(width * height),
  };
  const coverage = new Uint8Array(width * height);
  const owner = new Int32Array(width * height).fill(-1);
  const lowPoints = new Float32Array(width * height * 3);
  let coveredTexels = 0;
  let hitTexels = 0;
  let projectionConflicts = 0;
  const projectionMissExamples = [];
  let nearestSurfaceFallbackTexels = 0;
  let ambiguousCageTexels = 0;
  let flippedUvTriangles = 0;
  let zeroAreaUvTriangles = 0;
  const epsilon = Math.max(cageDistance / 80, 2e-5);
  const aoRadius = cageDistance * 1.8;

  for (let face = 0; face < mesh.indices.length / 3; face += 1) {
    const ids = [mesh.indices[face * 3], mesh.indices[face * 3 + 1], mesh.indices[face * 3 + 2]];
    const uv = ids.map((vertex) => [mesh.uvs[vertex * 2] * width, (1 - mesh.uvs[vertex * 2 + 1]) * height]);
    const signedUvArea2 = (uv[1][0] - uv[0][0]) * (uv[2][1] - uv[0][1]) - (uv[1][1] - uv[0][1]) * (uv[2][0] - uv[0][0]);
    if (signedUvArea2 < 0) flippedUvTriangles += 1;
    if (Math.abs(signedUvArea2) <= 1e-8) zeroAreaUvTriangles += 1;
    const minX = clamp(Math.floor(Math.min(...uv.map((point) => point[0])) - 0.5), 0, width - 1);
    const maxX = clamp(Math.ceil(Math.max(...uv.map((point) => point[0])) + 0.5), 0, width - 1);
    const minY = clamp(Math.floor(Math.min(...uv.map((point) => point[1])) - 0.5), 0, height - 1);
    const maxY = clamp(Math.ceil(Math.max(...uv.map((point) => point[1])) + 0.5), 0, height - 1);
    for (let y = minY; y <= maxY; y += 1) for (let x = minX; x <= maxX; x += 1) {
      const weights = barycentric([x + 0.5, y + 0.5], uv[0], uv[1], uv[2]);
      if (!weights) continue;
      const point = [0, 1, 2].map((axis) => ids.reduce((sum, vertex, corner) => sum + mesh.positions[vertex * 3 + axis] * weights[corner], 0));
      const texel = x + y * width;
      if (coverage[texel]) {
        const separation = Math.hypot(
          point[0] - lowPoints[texel * 3],
          point[1] - lowPoints[texel * 3 + 1],
          point[2] - lowPoints[texel * 3 + 2],
        );
        if (separation > epsilon * 3) projectionConflicts += 1;
        continue;
      }
      const lowNormal = normalize3([0, 1, 2].map((axis) => ids.reduce((sum, vertex, corner) => sum + mesh.normals[vertex * 3 + axis] * weights[corner], 0)));
      let tangent = [0, 1, 2].map((axis) => ids.reduce((sum, vertex, corner) => sum + mesh.tangents[vertex * 4 + axis] * weights[corner], 0));
      const tangentDot = tangent[0] * lowNormal[0] + tangent[1] * lowNormal[1] + tangent[2] * lowNormal[2];
      tangent = normalize3(tangent.map((value, axis) => value - lowNormal[axis] * tangentDot), [1, 0, 0]);
      const handedness = ids.reduce((sum, vertex, corner) => sum + mesh.tangents[vertex * 4 + 3] * weights[corner], 0) < 0 ? -1 : 1;
      const bitangent = [
        (lowNormal[1] * tangent[2] - lowNormal[2] * tangent[1]) * handedness,
        (lowNormal[2] * tangent[0] - lowNormal[0] * tangent[2]) * handedness,
        (lowNormal[0] * tangent[1] - lowNormal[1] * tangent[0]) * handedness,
      ];
      const traced = traceCagedSurface(detailField.evaluate, point, lowNormal, { cageDistance, epsilon });
      nearestSurfaceFallbackTexels += Number(traced.selection === 'bounded-nearest-surface-fallback');
      if (!traced.hit && projectionMissExamples.length < 8) {
        projectionMissExamples.push({
          distance: traced.distance,
          normal: lowNormal,
          point,
          residual: traced.residual ?? null,
          rootCount: traced.rootCount,
          texel: [x, y],
        });
      }
      const hitPoint = traced.point ?? point.map((value, axis) => value + lowNormal[axis] * traced.distance);
      const differential = fieldNormalAndCurvature(detailField.evaluate, hitPoint, epsilon * 2);
      const ao = sampleAmbientOcclusion(detailField.evaluate, hitPoint, differential.normal, aoRadius);
      const curvature = clamp(differential.curvature * epsilon * 0.42, -1, 1);
      const semantic = detailField.sample(hitPoint, differential.normal, ao, curvature);
      const tangentNormal = normalize3([
        differential.normal[0] * tangent[0] + differential.normal[1] * tangent[1] + differential.normal[2] * tangent[2],
        differential.normal[0] * bitangent[0] + differential.normal[1] * bitangent[1] + differential.normal[2] * bitangent[2],
        differential.normal[0] * lowNormal[0] + differential.normal[1] * lowNormal[1] + differential.normal[2] * lowNormal[2],
      ], [0, 0, 1]);
      const signedHeight = clamp(traced.distance / cageDistance, -1, 1);
      highPrecision.ao[texel] = ao;
      highPrecision.curvature[texel] = curvature;
      highPrecision.height[texel] = traced.distance;
      highPrecision.normal.set(tangentNormal, texel * 3);
      highPrecision.roughness[texel] = semantic.roughness;
      const write = (page, values) => {
        const offset = texel * 4;
        page.data[offset] = unorm(values[0]);
        page.data[offset + 1] = unorm(values[1]);
        page.data[offset + 2] = unorm(values[2]);
        page.data[offset + 3] = 255;
      };
      write(pages.baseColor, semantic.baseColorLinear.map(linearToSrgb));
      write(pages.normal, tangentNormal.map((value) => value * 0.5 + 0.5));
      write(pages.ormHeight, [ao, semantic.roughness, signedHeight * 0.5 + 0.5]);
      write(pages.cavityCurvature, [semantic.cavity, curvature * 0.5 + 0.5, signedHeight * 0.5 + 0.5]);
      write(pages.materialFabric, [semantic.material, semantic.fabric, semantic.deposition]);
      write(pages.fracture, [semantic.fracture, semantic.cavity, Math.abs(curvature)]);
      write(pages.weathering, [semantic.weathering, semantic.exposure, semantic.wetness]);
      coverage[texel] = 1;
      owner[texel] = face;
      lowPoints.set(point, texel * 3);
      coveredTexels += 1;
      hitTexels += Number(traced.hit);
      ambiguousCageTexels += Number(traced.rootCount > 1);
    }
  }
  const dilationPasses = atlas.gutterTexels + 4;
  const dilatedCoverage = dilatePages(pages, coverage, width, height, dilationPasses);
  // A chart atlas must stop before its gutter collapses below two texels.
  // Lower runtime minification clamps to the last qualified mip instead of
  // accepting cross-chart bleeding in nominal 1x1/2x2 levels.
  const maximumQualifiedMipLevel = Math.max(1, Math.floor(Math.log2(atlas.gutterTexels)) - 1);
  const mipChains = buildMipChains(pages, maximumQualifiedMipLevel);
  return {
    coverage,
    highPrecision,
    mipChains,
    pages,
    stats: {
      ambiguousCageTexels,
      atlasCoverageFraction: coveredTexels / (width * height),
      coveredTexels,
      dilatedTexels: dilatedCoverage.reduce((sum, value) => sum + value, 0),
      dilationPasses,
      finiteHighPrecisionIntermediates: Object.values(highPrecision).every(finiteArray),
      flippedUvTriangles,
      hitRate: coveredTexels ? hitTexels / coveredTexels : 0,
      hitTexels,
      maximumQualifiedMipLevel,
      mipLevels: mipChains.baseColor.length,
      nearestSurfaceFallbackTexels,
      projectionConflictRate: coveredTexels ? projectionConflicts / coveredTexels : 0,
      projectionConflicts,
      projectionMissExamples,
      zeroAreaUvTriangles,
    },
  };
}

export function runProjectionCageFixtures() {
  const fixtures = [
    {
      expected: 0.012,
      id: 'thin-shell-nearest-wall',
      evaluate: (_x, y) => (y - 0.012) * (y + 0.045),
      point: [0, 0, 0], normal: [0, 1, 0],
    },
    {
      expected: -0.018,
      id: 'concave-recess-nearest-root',
      evaluate: (x, y) => (y + 0.018) * (y - 0.07) + x * x * 0.02,
      point: [0, 0, 0], normal: [0, 1, 0],
    },
    {
      expected: 0.009,
      id: 'stacked-surfaces-nearest-layer',
      evaluate: (_x, y) => (y - 0.009) * (y + 0.032) * (y - 0.081),
      point: [0, 0, 0], normal: [0, 1, 0],
    },
  ];
  return fixtures.map((fixture) => {
    const result = traceCagedSurface(fixture.evaluate, fixture.point, fixture.normal, {
      cageDistance: 0.1,
      epsilon: 1e-6,
      scanSteps: 80,
    });
    const absoluteError = Math.abs(result.distance - fixture.expected);
    return { ...result, absoluteError, expectedDistance: fixture.expected, id: fixture.id, pass: result.hit && absoluteError < 2e-5 };
  });
}
