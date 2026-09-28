// Cheap world-space 2D value noise for TSL materials — shared by the
// terrain's noise-broken cliff transitions and the grass wind-color sheen.
// Hash-based (no texture fetch), stable across backends, tileless.

import { abs, add, dot, floor, fract, Fn, mix, sin, vec2 } from 'three/tsl';

const hash2 = /*@__PURE__*/ Fn(([cell]) => {
  return fract(sin(dot(cell, vec2(127.1, 311.7))).mul(43758.5453123));
});

/** Single-octave 2D value noise in [0, 1]; p is a world-XZ coordinate. */
export const worldValueNoise2 = /*@__PURE__*/ Fn(([p]) => {
  const cell = floor(p).toVar();
  const f = fract(p).toVar();
  // smoothstep fade per axis
  const t = f.mul(f).mul(f.mul(-2.0).add(3.0)).toVar();
  const a = hash2(cell);
  const b = hash2(cell.add(vec2(1.0, 0.0)));
  const c = hash2(cell.add(vec2(0.0, 1.0)));
  const d = hash2(cell.add(vec2(1.0, 1.0)));
  return mix(mix(a, b, t.x), mix(c, d, t.x), t.y);
});

/** Three-octave fbm in [0, 1]; p is a world-XZ coordinate (pre-scaled). */
export const worldFbm2 = /*@__PURE__*/ Fn(([p]) => {
  const n0 = worldValueNoise2(p);
  const n1 = worldValueNoise2(p.mul(2.13).add(vec2(19.7, 41.3)));
  const n2 = worldValueNoise2(p.mul(4.37).add(vec2(73.1, 7.9)));
  return add(n0.mul(0.5714), add(n1.mul(0.2857), n2.mul(0.1429)));
});
