// Periodic (seamlessly tiling) 2D noise for the procedural texture
// generator. Unlike src/rockgen/noise (infinite 3D fields), every function
// here takes integer periods and wraps its lattice, so a texture sampled
// over one period tiles exactly — no blend seams, no mirrored copies.
// Randomness flows through src/rockgen/noise/prng.js hashing only: no
// Math.random, deterministic per seed.

import { hash3u, hashCombine } from '../rockgen/noise/prng.js';

/** Wraps an integer lattice coordinate into [0, period). */
function wrapi(i, period) {
  const m = i % period;
  return m < 0 ? m + period : m;
}

/** Quintic fade used by value/gradient lattice noise. */
function fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Hashes a wrapped 2D lattice coordinate -> [0, 1). */
export function latticeHash2(seed, xi, yi, px, py) {
  return hash3u(seed, wrapi(xi, px), wrapi(yi, py), 0) / 4294967296;
}

// 16 fixed unit gradients (22.5 deg apart), written as literals so no
// transcendental math runs at generation time (same discipline as prng.js).
const GRAD_X = [
  1, 0.9239, 0.7071, 0.3827, 0, -0.3827, -0.7071, -0.9239,
  -1, -0.9239, -0.7071, -0.3827, 0, 0.3827, 0.7071, 0.9239,
];
const GRAD_Y = [
  0, 0.3827, 0.7071, 0.9239, 1, 0.9239, 0.7071, 0.3827,
  0, -0.3827, -0.7071, -0.9239, -1, -0.9239, -0.7071, -0.3827,
];

/**
 * Periodic 2D value noise -> [-1, 1].
 * x/y are lattice-space coordinates; px/py are integer periods >= 1.
 */
export function periodicValue2(seed, x, y, px, py) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const u = fade(fx);
  const v = fade(fy);
  const a = hash3u(seed, wrapi(xi, px), wrapi(yi, py), 0) / 4294967296;
  const b = hash3u(seed, wrapi(xi + 1, px), wrapi(yi, py), 0) / 4294967296;
  const c = hash3u(seed, wrapi(xi, px), wrapi(yi + 1, py), 0) / 4294967296;
  const d = hash3u(seed, wrapi(xi + 1, px), wrapi(yi + 1, py), 0) / 4294967296;
  return (lerp(lerp(a, b, u), lerp(c, d, u), v)) * 2 - 1;
}

/**
 * Periodic 2D gradient (Perlin) noise -> [-1, 1].
 * Sharper, less blocky than value noise; the go-to base for fbm.
 */
export function periodicPerlin2(seed, x, y, px, py) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const u = fade(fx);
  const v = fade(fy);
  const h00 = hash3u(seed, wrapi(xi, px), wrapi(yi, py), 0) & 15;
  const h10 = hash3u(seed, wrapi(xi + 1, px), wrapi(yi, py), 0) & 15;
  const h01 = hash3u(seed, wrapi(xi, px), wrapi(yi + 1, py), 0) & 15;
  const h11 = hash3u(seed, wrapi(xi + 1, px), wrapi(yi + 1, py), 0) & 15;
  const d00 = GRAD_X[h00] * fx + GRAD_Y[h00] * fy;
  const d10 = GRAD_X[h10] * (fx - 1) + GRAD_Y[h10] * fy;
  const d01 = GRAD_X[h01] * fx + GRAD_Y[h01] * (fy - 1);
  const d11 = GRAD_X[h11] * (fx - 1) + GRAD_Y[h11] * (fy - 1);
  // 2D Perlin with unit gradients spans about +-sqrt(2)/2; normalize.
  const n = lerp(lerp(d00, d10, u), lerp(d01, d11, u), v) * 1.4142135;
  return n < -1 ? -1 : n > 1 ? 1 : n;
}

/**
 * Periodic fractal Brownian motion -> [-1, 1] (amplitude-normalized).
 * Lacunarity is fixed at 2 so every octave keeps an integer period.
 */
export function periodicFbm2(seed, x, y, px, py, octaves = 4, gain = 0.5) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let fx = x;
  let fy = y;
  let fpx = px;
  let fpy = py;
  for (let o = 0; o < octaves; o += 1) {
    sum += amp * periodicPerlin2(hashCombine(seed, o), fx, fy, fpx, fpy);
    norm += amp;
    amp *= gain;
    fx *= 2;
    fy *= 2;
    fpx *= 2;
    fpy *= 2;
  }
  return sum / (norm || 1);
}

/** Periodic turbulence (sum of |perlin|) -> [0, 1]. Cloudy, creased. */
export function periodicTurbulence2(seed, x, y, px, py, octaves = 4, gain = 0.5) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let fx = x;
  let fy = y;
  let fpx = px;
  let fpy = py;
  for (let o = 0; o < octaves; o += 1) {
    const n = periodicPerlin2(hashCombine(seed, o), fx, fy, fpx, fpy);
    sum += amp * (n < 0 ? -n : n);
    norm += amp;
    amp *= gain;
    fx *= 2;
    fy *= 2;
    fpx *= 2;
    fpy *= 2;
  }
  return sum / (norm || 1);
}

/**
 * Periodic ridged multifractal -> [0, 1]. Sharp crests (rock, bark,
 * hammered metal). Octave weights follow the classic ridge feedback.
 */
export function periodicRidged2(seed, x, y, px, py, octaves = 4, gain = 0.5) {
  let sum = 0;
  let amp = 0.5;
  let weight = 1;
  let norm = 0;
  let fx = x;
  let fy = y;
  let fpx = px;
  let fpy = py;
  for (let o = 0; o < octaves; o += 1) {
    const n = periodicPerlin2(hashCombine(seed, o), fx, fy, fpx, fpy);
    let ridge = 1 - (n < 0 ? -n : n);
    ridge *= ridge * weight;
    weight = ridge * 2;
    weight = weight < 0 ? 0 : weight > 1 ? 1 : weight;
    sum += ridge * amp;
    norm += amp;
    amp *= gain;
    fx *= 2;
    fy *= 2;
    fpx *= 2;
    fpy *= 2;
  }
  return norm > 0 ? sum / norm : 0;
}

/** Periodic billow (|fbm| creases inverted to puffs) -> [-1, 1]. */
export function periodicBillow2(seed, x, y, px, py, octaves = 4, gain = 0.5) {
  return periodicTurbulence2(seed, x, y, px, py, octaves, gain) * 2 - 1;
}

/**
 * Periodic Worley/cellular noise. Returns { f1, f2, id } where f1/f2 are
 * the nearest/second-nearest feature distances (normalized so a typical
 * cell interior spans ~[0, 1]) and id is a stable uint32 for the owning
 * cell (per-cell colors, brick tints).
 */
export function periodicCellular2(seed, x, y, px, py, jitter = 1) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  let f1 = 1e9;
  let f2 = 1e9;
  let id = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const cx = xi + dx;
      const cy = yi + dy;
      const wx = wrapi(cx, px);
      const wy = wrapi(cy, py);
      const h = hash3u(seed, wx, wy, 0);
      const ox = 0.5 + jitter * (((h & 0xffff) / 65536) - 0.5);
      const oy = 0.5 + jitter * ((((h >>> 16) & 0xffff) / 65536) - 0.5);
      const ddx = cx + ox - x;
      const ddy = cy + oy - y;
      const d = ddx * ddx + ddy * ddy;
      if (d < f1) {
        f2 = f1;
        f1 = d;
        id = h;
      } else if (d < f2) {
        f2 = d;
      }
    }
  }
  return { f1: Math.sqrt(f1), f2: Math.sqrt(f2), id };
}

/**
 * Periodic domain-warp offset pair -> two decorrelated fbm channels in
 * [-1, 1]. Feed the result back into any periodic sampler: because the
 * offsets themselves tile with (px, py), the warped field still tiles.
 */
export function periodicWarp2(seed, x, y, px, py, octaves = 2) {
  return {
    wx: periodicFbm2(hashCombine(seed, 0x9e3779), x, y, px, py, octaves, 0.5),
    wy: periodicFbm2(hashCombine(seed, 0x85ebca), x + 7.31, y + 3.17, px, py, octaves, 0.5),
  };
}
