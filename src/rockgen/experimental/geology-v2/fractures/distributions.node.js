import {
  clamp,
  createOrientationFrame,
  dot3,
  hash01,
  normalize3,
  scale3,
  add3,
} from '../structure/math.node.js';

function gaussian(seed, index, channel) {
  const u1 = Math.max(hash01(seed, index, channel, 0, 1), 1e-12);
  const u2 = hash01(seed, index, channel, 0, 2);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(Math.PI * 2 * u2);
}

function lognormalCandidate(seed, index, attempt, distribution) {
  const sigma = Math.max(0.03, distribution.standardDeviationNormalized * 0.5);
  const mu = Math.log(distribution.meanMetres) - sigma * sigma * 0.5;
  return Math.exp(mu + sigma * gaussian(seed, index, 100 + attempt));
}

function powerLawMean(minimum, maximum, exponent) {
  const normalization = Math.abs(exponent - 1) < 1e-9
    ? Math.log(maximum / minimum)
    : (maximum ** (1 - exponent) - minimum ** (1 - exponent)) / (1 - exponent);
  const firstMoment = Math.abs(exponent - 2) < 1e-9
    ? Math.log(maximum / minimum)
    : (maximum ** (2 - exponent) - minimum ** (2 - exponent)) / (2 - exponent);
  return firstMoment / normalization;
}

function powerLawExponent(distribution) {
  const target = clamp(
    distribution.meanMetres,
    distribution.minimumMetres + 1e-9,
    distribution.maximumMetres - 1e-9,
  );
  let lower = -24;
  let upper = 32;
  for (let iteration = 0; iteration < 80; iteration += 1) {
    const middle = (lower + upper) * 0.5;
    // The bounded power-law mean decreases monotonically as the exponent rises.
    if (powerLawMean(distribution.minimumMetres, distribution.maximumMetres, middle) > target) lower = middle;
    else upper = middle;
  }
  return (lower + upper) * 0.5;
}

export function sampleTruncatedSize(seed, index, distribution) {
  const minimum = distribution.minimumMetres;
  const maximum = distribution.maximumMetres;
  if (distribution.type === 'uniform') {
    return minimum + (maximum - minimum) * hash01(seed, index, 0, 0, 201);
  }
  if (distribution.type === 'power-law') {
    const exponent = powerLawExponent(distribution);
    const power = 1 - exponent;
    const u = hash01(seed, index, 0, 0, 202);
    if (Math.abs(power) < 1e-9) return minimum * ((maximum / minimum) ** u);
    return ((minimum ** power) + u * ((maximum ** power) - (minimum ** power))) ** (1 / power);
  }
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const value = lognormalCandidate(seed, index, attempt, distribution);
    if (value >= minimum && value <= maximum) return value;
  }
  return clamp(lognormalCandidate(seed, index, 17, distribution), minimum, maximum);
}

export function sampleOrientation(seed, index, set, originMetres) {
  const meanFrame = createOrientationFrame({
    dipDegrees: set.meanDipDegrees,
    dipDirectionDegrees: (set.meanStrikeDegrees + 90) % 360,
    originMetres,
    strikeDegrees: set.meanStrikeDegrees,
  });
  const concentration = set.orientationConcentration;
  const u = Math.max(hash01(seed, index, 301, 0, 1), 1e-15);
  const azimuth = Math.PI * 2 * hash01(seed, index, 302, 0, 2);
  // Exact inverse-CDF sample of the 3D von Mises–Fisher polar component.
  // The final axial fold reflects that n and -n denote the same rock plane.
  const polarCosine = concentration < 1e-7
    ? 2 * u - 1
    : 1 + Math.log(u + (1 - u) * Math.exp(-2 * concentration)) / concentration;
  const polarSine = Math.sqrt(Math.max(0, 1 - polarCosine * polarCosine));
  let normal = add3(scale3(meanFrame.normal, polarCosine), add3(
    scale3(meanFrame.strike, polarSine * Math.cos(azimuth)),
    scale3(meanFrame.downDip, polarSine * Math.sin(azimuth)),
  ));
  normal = normalize3(normal);
  if (normal[1] < 0) normal = scale3(normal, -1);
  const dipDegrees = Math.acos(clamp(normal[1], -1, 1)) * 180 / Math.PI;
  const dipDirectionDegrees = dipDegrees < 1e-8
    ? (set.meanStrikeDegrees + 90) % 360
    : ((Math.atan2(normal[0], normal[2]) * 180 / Math.PI) + 360) % 360;
  const strikeDegrees = (dipDirectionDegrees + 270) % 360;
  const frame = createOrientationFrame({ dipDegrees, dipDirectionDegrees, originMetres, strikeDegrees });
  // Geological plane normals are axial: n and -n describe the same plane.
  const deviationDegrees = Math.acos(clamp(Math.abs(dot3(frame.normal, meanFrame.normal)), -1, 1)) * 180 / Math.PI;
  return { deviationDegrees, frame };
}

export function distributionMoments(values) {
  if (values.length === 0) return { count: 0, maximum: null, mean: null, minimum: null, standardDeviation: null };
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return {
    count: values.length,
    maximum: Math.max(...values),
    mean,
    minimum: Math.min(...values),
    standardDeviation: Math.sqrt(variance),
  };
}
