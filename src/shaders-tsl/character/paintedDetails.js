// Painted details (spec §5.10): the nose shadow and the eye-white shade modify
// the albedo, so shading applies on top; the stocking streak is a highlight.

import {
  abs,
  clamp,
  dot,
  exp,
  float,
  fwidth,
  length,
  max,
  mix,
  normalize,
  pow,
  select,
  smoothstep,
  vec3,
} from 'three/tsl';

// Width of the switch between the two sides of the nose, in the light's
// lateral component: narrow, so both sides are never drawn at half strength.
const SIDE_SWITCH = [-0.17, -0.11];

/**
 * Coverage of the leaf-shaped nose shadow at leaf coordinates (x from the
 * ridge in leaf widths, y from −1 bottom tip to +1 top tip). The outline was
 * fitted to Genshin's nose shadow: a belly a quarter of the way up, tips
 * turning off the ridge only near the ends.
 */
function leafCoverage(x, y) {
  const above = y.greaterThanEqual(-0.25);
  const t = select(above, y.add(0.25).div(1.25), y.add(0.25).div(0.75));
  const exponent = select(above, float(1.4), float(1.1));
  const outer = float(0.34).add(pow(max(float(1).sub(t.mul(t)), 0), exponent).mul(0.66));
  const inner = float(0.02).add(pow(smoothstep(0.75, 1, abs(y)), 2.5).mul(0.32));
  const edgeX = max(fwidth(x), 0.02);
  const edgeY = max(fwidth(y), 0.02);
  return smoothstep(inner.sub(edgeX), inner.add(edgeX), x)
    .mul(float(1).sub(smoothstep(outer.sub(edgeX), outer.add(edgeX), x)))
    .mul(float(1).sub(smoothstep(float(1).sub(edgeY), float(1).add(edgeY), abs(y))));
}

/**
 * Nose shadow and its faint lit-side highlight. `faceUv` are the planar face
 * coordinates (u grows toward the character's right, v up), `lateral` the
 * light's component along the head's right axis. Returns `{ shadow, highlight }`.
 */
export function noseShadow(u, faceUv, lateral) {
  const onLeft = smoothstep(SIDE_SWITCH[0], SIDE_SWITCH[1], lateral);
  const width = max(u.noseLeaf.x.mul(u.noseSize), 1e-5);
  const halfHeight = max(u.noseLeaf.y.mul(u.noseSize), 1e-5);
  const across = faceUv.x.sub(u.noseCenter.x).div(width);
  const y = faceUv.y.sub(u.noseCenter.y).div(halfHeight);
  const left = leafCoverage(across.negate(), y);
  const right = leafCoverage(across, y);
  return {
    highlight: mix(left, right, onLeft).mul(u.noseStrength),
    shadow: mix(right, left, onLeft).mul(u.noseStrength),
  };
}

/**
 * Shade under the upper lid on an eye white: `lid` is 0 at the upper lid and
 * 1 at the lower edge; flat to 55% of the depth, then fading.
 */
export function eyeWhiteShade(u, lid) {
  const depth = max(u.eyeWhiteDepth, 1e-3);
  return float(1).sub(smoothstep(depth.mul(0.55), depth, lid)).mul(u.eyeWhiteStrength);
}

/**
 * The streak along a stocking: the leg axis is world up projected onto the
 * surface; the streak is where the normal, turned about that axis, faces the
 * half vector.
 */
export function sheerStreak(u, normal, halfVector, weight) {
  const up = vec3(0, 1, 0);
  const axisRaw = up.sub(normal.mul(dot(normal, up)));
  const axis = axisRaw.div(max(length(axisRaw), 1e-3));
  const across = halfVector.sub(axis.mul(dot(axis, halfVector)));
  const facing = clamp(dot(normal, normalize(across.add(vec3(0, 0, 1e-5)))), 0, 1);
  // A narrow line: falls to half about 3° either side at the default power.
  const line = exp(float(1).sub(facing).mul(u.sheerPower).mul(-12));
  return line.mul(weight).mul(u.sheerIntensity).mul(1.5);
}
