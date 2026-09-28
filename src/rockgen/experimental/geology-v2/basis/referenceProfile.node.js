import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { contentId } from '../canonical.node.js';
import { clamp, hash01 } from '../structure/math.node.js';

const PROFILE_URL = new URL('./reference-profiles/cliff-bedded-grand-canyon-r1.json', import.meta.url);
const PROFILE_BYTES = readFileSync(PROFILE_URL);
const PROFILE_BYTE_SHA256 = createHash('sha256').update(PROFILE_BYTES).digest('hex');
const PROFILE = JSON.parse(PROFILE_BYTES.toString('utf8'));

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function pointSegmentDistance2D(point, start, end) {
  const edge = [end[0] - start[0], end[1] - start[1]];
  const relative = [point[0] - start[0], point[1] - start[1]];
  const edgeSquaredLength = edge[0] * edge[0] + edge[1] * edge[1];
  const projection = edgeSquaredLength > 1e-12
    ? clamp((relative[0] * edge[0] + relative[1] * edge[1]) / edgeSquaredLength, 0, 1)
    : 0;
  return Math.hypot(relative[0] - edge[0] * projection, relative[1] - edge[1] * projection);
}

function segmentOrientation2D(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function pointOnSegment2D(point, start, end, epsilon) {
  if (Math.abs(segmentOrientation2D(start, end, point)) > epsilon) return false;
  return point[0] >= Math.min(start[0], end[0]) - epsilon
    && point[0] <= Math.max(start[0], end[0]) + epsilon
    && point[1] >= Math.min(start[1], end[1]) - epsilon
    && point[1] <= Math.max(start[1], end[1]) + epsilon;
}

function segmentsIntersect2D(a, b, c, d, epsilon) {
  const abC = segmentOrientation2D(a, b, c);
  const abD = segmentOrientation2D(a, b, d);
  const cdA = segmentOrientation2D(c, d, a);
  const cdB = segmentOrientation2D(c, d, b);
  const abStraddles = (abC > epsilon && abD < -epsilon) || (abC < -epsilon && abD > epsilon);
  const cdStraddles = (cdA > epsilon && cdB < -epsilon) || (cdA < -epsilon && cdB > epsilon);
  if (abStraddles && cdStraddles) return true;
  return (Math.abs(abC) <= epsilon && pointOnSegment2D(c, a, b, epsilon))
    || (Math.abs(abD) <= epsilon && pointOnSegment2D(d, a, b, epsilon))
    || (Math.abs(cdA) <= epsilon && pointOnSegment2D(a, c, d, epsilon))
    || (Math.abs(cdB) <= epsilon && pointOnSegment2D(b, c, d, epsilon));
}

export function validateReferencePolygon(vertices, id) {
  if (!Array.isArray(vertices) || vertices.length < 3) throw new RangeError(`${id} must contain at least three landmarks.`);
  let signedAreaTwice = 0;
  let maximumCoordinate = 0;
  for (const vertex of vertices) {
    if (!Array.isArray(vertex) || vertex.length !== 2 || vertex.some((value) => !Number.isFinite(value))) {
      throw new TypeError(`${id} contains an invalid compiled landmark.`);
    }
    maximumCoordinate = Math.max(maximumCoordinate, Math.abs(vertex[0]), Math.abs(vertex[1]));
  }
  for (let index = 0; index < vertices.length; index += 1) {
    const current = vertices[index];
    const next = vertices[(index + 1) % vertices.length];
    signedAreaTwice += current[0] * next[1] - next[0] * current[1];
    if (Math.hypot(next[0] - current[0], next[1] - current[1]) <= maximumCoordinate * 0.004) {
      throw new RangeError(`${id} contains a collapsed profile edge.`);
    }
  }
  if (Math.abs(signedAreaTwice) <= maximumCoordinate * maximumCoordinate * 0.04) {
    throw new RangeError(`${id} has insufficient signed area.`);
  }
  const minimumClearance = maximumCoordinate * 0.003;
  const intersectionEpsilon = maximumCoordinate * maximumCoordinate * 1e-10;
  for (let first = 0; first < vertices.length; first += 1) {
    const firstNext = (first + 1) % vertices.length;
    for (let second = first + 1; second < vertices.length; second += 1) {
      const secondNext = (second + 1) % vertices.length;
      if (firstNext === second || secondNext === first) continue;
      const a = vertices[first];
      const b = vertices[firstNext];
      const c = vertices[second];
      const d = vertices[secondNext];
      if (segmentsIntersect2D(a, b, c, d, intersectionEpsilon)) throw new RangeError(`${id} is self-intersecting.`);
      const clearance = Math.min(
        pointSegmentDistance2D(a, c, d), pointSegmentDistance2D(b, c, d),
        pointSegmentDistance2D(c, a, b), pointSegmentDistance2D(d, a, b),
      );
      if (clearance <= minimumClearance) throw new RangeError(`${id} violates nonadjacent-edge clearance.`);
    }
  }
  return true;
}

function validateTemplate(profile) {
  if (profile.schema !== 'toonlab/rock-reference-macro-profile' || profile.version !== 1) {
    throw new TypeError('Unsupported rock reference macro profile schema.');
  }
  if (profile.profileType !== 'orthogonal-visual-hull') throw new TypeError('Unsupported reference profile type.');
  if (profile.evidence.generatedViewsAreGeologyEvidence !== false) {
    throw new TypeError('Generated hidden views must not be represented as geology evidence.');
  }
  if (profile.authorityContract?.calibrationMode !== 'per-view-shape-normalized-authored-hypothesis'
    || profile.authorityContract.commonMetricCalibrationAvailable !== false
    || profile.authorityContract.claimsExactSourceReconstruction !== false) {
    throw new TypeError('The inconsistent generated sheet must remain an explicitly non-metric authored hypothesis.');
  }
  const panels = profile.panelEvidence?.panels;
  if (!panels || profile.panelEvidence.sheetDimensionsPixels?.join('x') !== '1536x1024') {
    throw new TypeError('Reference profile must bind the admitted 1536x1024 panel sheet.');
  }
  for (const panelId of profile.evidence.viewOrder) {
    const panel = panels[panelId];
    if (!panel || !Array.isArray(panel.cropPixels) || panel.cropPixels.length !== 4
      || !/^[a-f0-9]{64}$/.test(panel.foregroundMaskSha256)) {
      throw new TypeError(`${profile.id}/${panelId} lacks its crop or foreground mask binding.`);
    }
  }
  for (const id of ['frontXY', 'sideZY', 'topXZ', 'bottomSupportXZ']) {
    const control = profile.profiles[id];
    if (!Array.isArray(control) || control.some((vertex) => !Array.isArray(vertex) || vertex.length !== 4 || vertex.some((value) => !Number.isFinite(value)))) {
      throw new TypeError(`${profile.id}/${id} contains invalid control landmarks.`);
    }
    const binding = profile.viewBindings?.[id];
    if (!binding || !panels[binding.panelId] || binding.pixelLandmarks?.length !== control.length) {
      throw new TypeError(`${profile.id}/${id} lacks a one-to-one pixel landmark binding.`);
    }
    validateReferencePolygon(control.map((vertex) => vertex.slice(0, 2)), `${profile.id}/${id}`);
  }
  return profile;
}

deepFreeze(validateTemplate(PROFILE));

export const CLIFF_BEDDED_GRAND_CANYON_R1 = PROFILE;
export const CLIFF_BEDDED_GRAND_CANYON_R1_BYTE_SHA256 = PROFILE_BYTE_SHA256;
export const CLIFF_BEDDED_GRAND_CANYON_R1_CONTENT_ID = contentId(PROFILE);

function instantiateProfile(profile, horizontalScale, verticalScale, seed, channel) {
  const variation = CLIFF_BEDDED_GRAND_CANYON_R1.variation;
  const horizontalBias = hash01(seed, channel, 101) * 2 - 1;
  const verticalBias = hash01(seed, channel, 102) * 2 - 1;
  const horizontalPhase = hash01(seed, channel, 103) * Math.PI * 2;
  const verticalPhase = hash01(seed, channel, 104) * Math.PI * 2;
  const frequency = lerp(variation.minimumFrequency, variation.maximumFrequency, hash01(seed, channel, 105));
  const vertices = profile.map(([horizontal, vertical, horizontalJitter, verticalJitter], index) => [
    (horizontal + (horizontalBias * variation.horizontalBiasWeight
      + Math.sin(horizontalPhase + index * frequency) * (1 - variation.horizontalBiasWeight)) * horizontalJitter) * horizontalScale,
    (vertical + (verticalBias * variation.verticalBiasWeight
      + Math.sin(verticalPhase + index * frequency * variation.verticalFrequencyRatio) * (1 - variation.verticalBiasWeight)) * verticalJitter) * verticalScale,
  ]);
  validateReferencePolygon(vertices, `${CLIFF_BEDDED_GRAND_CANYON_R1.id}/${channel}`);
  return Object.freeze(vertices.map((vertex) => Object.freeze(vertex)));
}

export function compileCliffBeddedGrandCanyonMacro(dimensions, seed) {
  if (!Array.isArray(dimensions) || dimensions.length !== 3
    || dimensions.some((value) => !Number.isFinite(value) || !(value > 0))) {
    throw new TypeError('Reference macro dimensions must be three positive finite metres.');
  }
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new TypeError('Reference macro seed must be an unsigned 32-bit integer.');
  }
  const h = dimensions.map((value) => value * CLIFF_BEDDED_GRAND_CANYON_R1.extentScale);
  return Object.freeze({
    bottomSupportXZ: instantiateProfile(CLIFF_BEDDED_GRAND_CANYON_R1.profiles.bottomSupportXZ, h[0], h[2], seed, 3204),
    byteSha256: CLIFF_BEDDED_GRAND_CANYON_R1_BYTE_SHA256,
    contentId: CLIFF_BEDDED_GRAND_CANYON_R1_CONTENT_ID,
    frontXY: instantiateProfile(CLIFF_BEDDED_GRAND_CANYON_R1.profiles.frontXY, h[0], h[1], seed, 3201),
    id: CLIFF_BEDDED_GRAND_CANYON_R1.id,
    sideZY: instantiateProfile(CLIFF_BEDDED_GRAND_CANYON_R1.profiles.sideZY, h[2], h[1], seed, 3202),
    topXZ: instantiateProfile(CLIFF_BEDDED_GRAND_CANYON_R1.profiles.topXZ, h[0], h[2], seed, 3203),
  });
}

export function signedDistanceReferencePolygon2D(point, vertices) {
  let minimumSquaredDistance = Infinity;
  let sign = 1;
  for (let index = 0, previous = vertices.length - 1; index < vertices.length; previous = index, index += 1) {
    const start = vertices[previous];
    const end = vertices[index];
    const edge = [end[0] - start[0], end[1] - start[1]];
    const relative = [point[0] - start[0], point[1] - start[1]];
    const edgeSquaredLength = edge[0] * edge[0] + edge[1] * edge[1];
    const projection = edgeSquaredLength > 1e-12
      ? clamp((relative[0] * edge[0] + relative[1] * edge[1]) / edgeSquaredLength, 0, 1)
      : 0;
    const nearest = [relative[0] - edge[0] * projection, relative[1] - edge[1] * projection];
    minimumSquaredDistance = Math.min(minimumSquaredDistance, nearest[0] * nearest[0] + nearest[1] * nearest[1]);
    const crossesUp = point[1] >= start[1] && point[1] < end[1];
    const crossesDown = point[1] >= end[1] && point[1] < start[1];
    const isLeft = edge[0] * relative[1] > edge[1] * relative[0];
    if ((crossesUp && isLeft) || (crossesDown && !isLeft)) sign *= -1;
  }
  return sign * Math.sqrt(minimumSquaredDistance);
}

export function evaluateReferenceVisualHull(compiledMacro, point) {
  return Math.max(
    signedDistanceReferencePolygon2D([point[0], point[1]], compiledMacro.frontXY),
    signedDistanceReferencePolygon2D([point[2], point[1]], compiledMacro.sideZY),
    signedDistanceReferencePolygon2D([point[0], point[2]], compiledMacro.topXZ),
  );
}
