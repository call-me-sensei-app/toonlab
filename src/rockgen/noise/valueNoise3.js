// Seeded 3D value noise + FBM stacks. Value noise (hashed lattice values,
// quintic interpolation) is the workhorse for rock displacement: cheaper than
// simplex per sample and its slightly blocky character reads well on stylized
// rock at the amplitudes rockgen uses.

import { hash3f } from './prng.js';

function fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Seeded 3D value noise -> [-1, 1]. */
export function valueNoise3(seed, x, y, z) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const tx = fade(x - xi);
  const ty = fade(y - yi);
  const tz = fade(z - zi);

  const c000 = hash3f(seed, xi, yi, zi);
  const c100 = hash3f(seed, xi + 1, yi, zi);
  const c010 = hash3f(seed, xi, yi + 1, zi);
  const c110 = hash3f(seed, xi + 1, yi + 1, zi);
  const c001 = hash3f(seed, xi, yi, zi + 1);
  const c101 = hash3f(seed, xi + 1, yi, zi + 1);
  const c011 = hash3f(seed, xi, yi + 1, zi + 1);
  const c111 = hash3f(seed, xi + 1, yi + 1, zi + 1);

  const x00 = lerp(c000, c100, tx);
  const x10 = lerp(c010, c110, tx);
  const x01 = lerp(c001, c101, tx);
  const x11 = lerp(c011, c111, tx);
  const y0 = lerp(x00, x10, ty);
  const y1 = lerp(x01, x11, ty);
  return lerp(y0, y1, tz) * 2 - 1;
}

/**
 * Fractional Brownian motion over valueNoise3, normalized by the octave
 * amplitude sum so the result stays in roughly [-1, 1] for any octave count.
 */
export function fbm3(seed, x, y, z, octaves = 4, lacunarity = 2, gain = 0.5) {
  let sum = 0;
  let amplitude = 1;
  let amplitudeSum = 0;
  let fx = x;
  let fy = y;
  let fz = z;
  for (let i = 0; i < octaves; i += 1) {
    sum += amplitude * valueNoise3(seed + i, fx, fy, fz);
    amplitudeSum += amplitude;
    amplitude *= gain;
    fx *= lacunarity;
    fy *= lacunarity;
    fz *= lacunarity;
  }
  return sum / amplitudeSum;
}

/**
 * Ridged FBM: sharp creases where the underlying noise crosses zero.
 * Returns [0, 1] with 1 at the ridge lines.
 */
export function ridgedFbm3(seed, x, y, z, octaves = 4, lacunarity = 2, gain = 0.5) {
  let sum = 0;
  let amplitude = 1;
  let amplitudeSum = 0;
  let fx = x;
  let fy = y;
  let fz = z;
  for (let i = 0; i < octaves; i += 1) {
    const n = valueNoise3(seed + i, fx, fy, fz);
    const ridge = 1 - Math.abs(n);
    sum += amplitude * ridge * ridge;
    amplitudeSum += amplitude;
    amplitude *= gain;
    fx *= lacunarity;
    fy *= lacunarity;
    fz *= lacunarity;
  }
  return sum / amplitudeSum;
}
