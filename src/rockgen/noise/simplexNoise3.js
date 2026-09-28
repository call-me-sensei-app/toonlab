// Seeded 3D simplex noise (Gustavson's reference algorithm with the
// permutation table replaced by the rockgen lattice hash, so it is seedable
// without table setup). Used for domain warp, where value noise's lattice
// alignment would leave visible grid bias in the warped shapes.

import { hash3u } from './prng.js';

const F3 = 1 / 3;
const G3 = 1 / 6;

// 12 cube-edge gradient directions.
const GRAD3 = new Float32Array([
  1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0,
  1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1,
  0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1,
]);

function gradDot(seed, xi, yi, zi, x, y, z) {
  const g = (hash3u(seed, xi, yi, zi) % 12) * 3;
  return GRAD3[g] * x + GRAD3[g + 1] * y + GRAD3[g + 2] * z;
}

/** Seeded 3D simplex noise -> approximately [-1, 1]. */
export function simplexNoise3(seed, x, y, z) {
  const s = (x + y + z) * F3;
  const i = Math.floor(x + s);
  const j = Math.floor(y + s);
  const k = Math.floor(z + s);
  const t = (i + j + k) * G3;
  const x0 = x - (i - t);
  const y0 = y - (j - t);
  const z0 = z - (k - t);

  // Rank the simplex corner offsets by descending coordinate.
  let i1;
  let j1;
  let k1;
  let i2;
  let j2;
  let k2;
  if (x0 >= y0) {
    if (y0 >= z0) {
      i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0;
    } else if (x0 >= z0) {
      i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1;
    } else {
      i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1;
    }
  } else if (y0 < z0) {
    i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1;
  } else if (x0 < z0) {
    i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1;
  } else {
    i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0;
  }

  const x1 = x0 - i1 + G3;
  const y1 = y0 - j1 + G3;
  const z1 = z0 - k1 + G3;
  const x2 = x0 - i2 + 2 * G3;
  const y2 = y0 - j2 + 2 * G3;
  const z2 = z0 - k2 + 2 * G3;
  const x3 = x0 - 1 + 3 * G3;
  const y3 = y0 - 1 + 3 * G3;
  const z3 = z0 - 1 + 3 * G3;

  let n = 0;
  let f = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
  if (f > 0) {
    f *= f;
    n += f * f * gradDot(seed, i, j, k, x0, y0, z0);
  }
  f = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
  if (f > 0) {
    f *= f;
    n += f * f * gradDot(seed, i + i1, j + j1, k + k1, x1, y1, z1);
  }
  f = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
  if (f > 0) {
    f *= f;
    n += f * f * gradDot(seed, i + i2, j + j2, k + k2, x2, y2, z2);
  }
  f = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
  if (f > 0) {
    f *= f;
    n += f * f * gradDot(seed, i + 1, j + 1, k + 1, x3, y3, z3);
  }
  return 32 * n;
}
