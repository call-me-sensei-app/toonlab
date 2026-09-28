// Shared TSL sprite shapes — the "texture set" of the VFX cluster, drawn as
// signed-distance/analytic masks on a unit quad instead of any image asset
// (same zero-texture policy as texgen). Every helper takes `p`, the quad UV
// remapped to [-1, 1] (`uv().mul(2).sub(1)`), and returns a 0..1 mask node.
//
// Trig-only on purpose: these run in the one-shot backbone's fragment shader
// on both WebGPU and the WebGL2 fallback, so no texture fetches, no loops,
// no derivatives.

import {
  abs, atan, clamp, cos, float, floor, fract, length, max, mix, pow, sin, smoothstep, vec2,
} from 'three/tsl';

/** Soft radial dot: 1 at center → 0 at the rim; `hardness` sharpens the core. */
export function softDot(p, hardness = 1.8) {
  return pow(clamp(length(p).oneMinus(), 0.0, 1.0), hardness);
}

/** Hot-core dot: soft halo plus a tight bright center (sparks, embers). */
export function emberDot(p) {
  const d = length(p);
  const halo = pow(clamp(d.oneMinus(), 0.0, 1.0), 1.6);
  const core = pow(clamp(d.oneMinus(), 0.0, 1.0), 6.0);
  return halo.mul(0.55).add(core);
}

/**
 * N-point star flash (the anime hit star): a radial falloff whose rim is
 * modulated by cos(spikes·θ), plus a hot center. `spikes` may be a node
 * (per-instance attribute) or a number.
 */
export function starburst(p, spikes, sharpness = 3.0) {
  const angle = atan(p.y, p.x);
  const lobe = pow(abs(cos(angle.mul(spikes).mul(0.5))), sharpness);
  const radius = length(p);
  const arm = clamp(radius.div(mix(0.18, 1.0, lobe)).oneMinus(), 0.0, 1.0);
  const core = pow(clamp(radius.mul(3.2).oneMinus(), 0.0, 1.0), 2.0);
  return clamp(arm.mul(arm).add(core), 0.0, 1.0);
}

/**
 * Ring band centered at `radius01` (0..1 of the quad) with soft `thickness`
 * (number or node — per-instance attributes welcome). Expanding shockwaves/
 * scorch rings animate `radius01` from the vertex side by growing the QUAD
 * and keeping the band fixed — this stays static.
 */
export function ringBand(p, radius01 = 0.72, thickness = 0.16) {
  const width = float(thickness);
  const d = abs(length(p).sub(radius01));
  return smoothstep(width, width.mul(0.25), d);
}

/**
 * Blobby toon puff: a circle whose rim wobbles with two angular harmonics
 * seeded per particle — chunky hand-drawn smoke, no noise texture. Returns
 * the SIGNED coverage (>0 inside), thresholded by the caller so cutout and
 * soft variants can share it.
 */
export function puffBlob(p, seed, wobble = 0.18) {
  const angle = atan(p.y, p.x);
  const rim = sin(angle.mul(3.0).add(seed.mul(37.0))).mul(0.6)
    .add(sin(angle.mul(5.0).sub(seed.mul(91.0))).mul(0.4));
  const radius = rim.mul(wobble).add(0.82);
  return radius.sub(length(p));
}

/**
 * Rising flame lick mask for the fireball core: a circle stretched upward
 * whose rim is eaten by upward-scrolling sine licks. `t` animates; `seed`
 * de-syncs projectiles. Returns 0..1 coverage, ~1 in the body, feathering
 * through the licks.
 */
export function flameLicks(p, t, seed) {
  // Flames read taller than wide; bias the field downward so the base is round
  // and the licks live on top.
  const q = vec2(p.x, p.y.mul(0.78).add(0.12)).toVar();
  const angle = atan(q.y, q.x);
  const licks = sin(angle.mul(5.0).add(t.mul(9.0)).add(seed.mul(53.0))).mul(0.5)
    .add(sin(angle.mul(9.0).sub(t.mul(13.0)).add(seed.mul(17.0))).mul(0.3));
  // Licks only bite where the shape points up (angle ≈ +90°).
  const upBias = smoothstep(-0.2, 0.9, q.y.div(max(length(q), 1e-3)));
  const rim = licks.mul(0.16).mul(upBias).add(0.8);
  return smoothstep(0.12, -0.08, length(q).sub(rim));
}

/**
 * Quantizes a 0..1 fade into `bands` cel steps (top step = 1, bottom = 0).
 * `bands` may be a node or a number; bands ≤ 1 collapses to a hard cut.
 */
export function celBands(fade, bands) {
  const steps = max(bands, 1.0);
  return clamp(floor(clamp(fade, 0.0, 1.0).mul(steps)).div(max(steps.sub(1.0), 1.0)), 0.0, 1.0);
}

/** Cheap per-fragment hash sparkle in 0..1 (grain for dust, glitter). */
export function hashSparkle(p, seed) {
  return fract(sin(p.x.mul(127.1).add(p.y.mul(311.7)).add(seed.mul(74.7))).mul(43758.5453));
}
