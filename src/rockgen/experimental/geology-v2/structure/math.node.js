const DEG_TO_RAD = Math.PI / 180;

function cleanScalar(value) {
  return Object.is(value, -0) || Math.abs(value) < 1e-15 ? 0 : value;
}

function cleanVector(value) {
  return value.map(cleanScalar);
}

export function add3(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function subtract3(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function scale3(value, scalar) {
  return [value[0] * scalar, value[1] * scalar, value[2] * scalar];
}

export function dot3(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross3(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function length3(value) {
  return Math.hypot(value[0], value[1], value[2]);
}

export function normalize3(value) {
  const length = length3(value);
  if (!(length > 1e-15)) throw new RangeError('Cannot normalize a zero-length structural vector.');
  return scale3(value, 1 / length);
}

export function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function smootherstep01(value) {
  const t = clamp(value, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function circularDifferenceDegrees(a, b) {
  return Math.abs(((a - b + 540) % 360) - 180);
}

/**
 * ToonLab geology convention: +X east, +Y up, +Z north; azimuth is clockwise
 * from north. The frame is right-handed in the order strike, down-dip, normal.
 */
export function createOrientationFrame({
  dipDegrees,
  dipDirectionDegrees,
  originMetres,
  strikeDegrees,
}) {
  const strikeRadians = strikeDegrees * DEG_TO_RAD;
  const dipRadians = dipDegrees * DEG_TO_RAD;
  const dipDirectionRadians = dipDirectionDegrees * DEG_TO_RAD;
  const strike = cleanVector(normalize3([Math.sin(strikeRadians), 0, Math.cos(strikeRadians)]));
  const downDip = cleanVector(normalize3([
    Math.sin(dipDirectionRadians) * Math.cos(dipRadians),
    -Math.sin(dipRadians),
    Math.cos(dipDirectionRadians) * Math.cos(dipRadians),
  ]));
  const normal = cleanVector(normalize3(cross3(strike, downDip)));
  return {
    dipDegrees,
    dipDirectionDegrees,
    downDip,
    normal,
    originMetres: cleanVector(originMetres),
    strike,
    strikeDegrees,
  };
}

export function worldToFrame(frame, worldPoint) {
  const relative = subtract3(worldPoint, frame.originMetres);
  return [dot3(relative, frame.strike), dot3(relative, frame.downDip), dot3(relative, frame.normal)];
}

export function frameToWorld(frame, localPoint) {
  return add3(frame.originMetres, add3(
    scale3(frame.strike, localPoint[0]),
    add3(scale3(frame.downDip, localPoint[1]), scale3(frame.normal, localPoint[2])),
  ));
}

function mix32(value) {
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return value >>> 0;
}

export function hashLattice(seed, x = 0, y = 0, z = 0, channel = 0) {
  let value = mix32(seed >>> 0);
  value = mix32(value ^ Math.imul(x | 0, 0x9e3779b1));
  value = mix32(value ^ Math.imul(y | 0, 0x85ebca77));
  value = mix32(value ^ Math.imul(z | 0, 0xc2b2ae3d));
  value = mix32(value ^ Math.imul(channel | 0, 0x27d4eb2f));
  return value >>> 0;
}

export function hash01(seed, x = 0, y = 0, z = 0, channel = 0) {
  return hashLattice(seed, x, y, z, channel) / 0xffffffff;
}

function signedHash(seed, x, y, z, channel) {
  return hash01(seed, x, y, z, channel) * 2 - 1;
}

export function valueNoise2D(seed, x, y, channel = 0) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = smootherstep01(x - ix);
  const fy = smootherstep01(y - iy);
  const a = lerp(
    signedHash(seed, ix, iy, 0, channel),
    signedHash(seed, ix + 1, iy, 0, channel),
    fx,
  );
  const b = lerp(
    signedHash(seed, ix, iy + 1, 0, channel),
    signedHash(seed, ix + 1, iy + 1, 0, channel),
    fx,
  );
  return lerp(a, b, fy);
}

export function fractalNoise2D(seed, x, y, {
  octaves = 4,
  lacunarity = 2.071,
  gain = 0.5,
} = {}) {
  let amplitude = 1;
  let frequency = 1;
  let total = 0;
  let weight = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    total += valueNoise2D(seed, x * frequency, y * frequency, octave) * amplitude;
    weight += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }
  return total / Math.max(weight, 1e-12);
}

export function signedDistanceBox(point, halfExtents, rounding = 0) {
  const q = point.map((value, axis) => Math.abs(value) - halfExtents[axis] + rounding);
  const outside = Math.hypot(Math.max(q[0], 0), Math.max(q[1], 0), Math.max(q[2], 0));
  return outside + Math.min(Math.max(q[0], q[1], q[2]), 0) - rounding;
}

export function compactSupport(value) {
  const absolute = Math.abs(value);
  if (absolute >= 1) return 0;
  const squared = 1 - absolute * absolute;
  return squared * squared;
}
