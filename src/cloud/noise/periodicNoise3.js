// Periodic (seamlessly tiling) 3D noise primitives for the volumetric cloud
// system. The cloud volumes are sampled with RepeatWrapping across a sky tens
// of kilometres wide, so a lattice that does not wrap puts a hard seam every
// repeat — the one artifact a raymarched sky can never hide. Every sampler
// here takes an integer lattice period and wraps its lattice through it, so a
// field evaluated over one unit tile continues exactly into the next.
//
// All randomness flows through rockgen/noise/prng.js integer hashing: no
// Math.random, no transcendental math at generation time, so a seed produces
// bit-identical volumes on every run and every engine.
//
// Lattices are prebuilt rather than hashed per sample because the volume
// bakers evaluate the same handful of bands at a quarter of a million texels;
// hoisting the hashing out of that loop is the difference between a bake the
// lab can run interactively and one it cannot.
//
// Samplers take *tile* coordinates (one unit = one full repeat) rather than
// lattice coordinates. Callers therefore never hold a frequency and a period
// that can drift out of sync, which is the usual way tiling breaks.

import { hash3u, hashCombine } from '../../rockgen/noise/prng.js';

/** Wraps an integer lattice coordinate into [0, period). */
export function wrapi(i, period) {
  const m = i % period;
  return m < 0 ? m + period : m;
}

/** Quintic fade — C2 continuous, so no lattice-aligned creases. */
function fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

// Perlin's improved-noise gradient set: the 12 cube-edge midpoints,
// normalized to unit length. No axis-aligned member, which is what keeps the
// field from showing grid-aligned streaks.
const E = 0.70710678118654752;
const GRADIENTS = [
  E, E, 0, -E, E, 0, E, -E, 0, -E, -E, 0,
  E, 0, E, -E, 0, E, E, 0, -E, -E, 0, -E,
  0, E, E, 0, -E, E, 0, E, -E, 0, -E, -E,
];

// With unit gradients the trilinear interpolation of the corner dot products
// peaks at sqrt(3)/2; scale by its reciprocal so a band spans [-1, 1].
const PERLIN_NORMALIZATION = 1.1547005383792515;

/** The canonical Nubis three-octave Worley weights. Sums to exactly 1. */
export const WORLEY_FBM_WEIGHTS = Object.freeze([0.625, 0.25, 0.125]);

function clamp01(value) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * Largest lattice period a `dim`-texel axis can carry at `texelsPerCell`
 * samples per cell. Bands finer than this stop being a field and become hash
 * noise, so the volume bakers clamp their ladders through here instead of
 * baking aliasing that no filtering can remove.
 */
export function bandLimitPeriod(period, dim, texelsPerCell = 4) {
  const limit = Math.max(1, Math.floor(dim / texelsPerCell));
  const requested = Math.max(1, Math.round(period));
  return requested < limit ? requested : limit;
}

/**
 * Periodic 3D gradient (Perlin) noise over a `period`³ lattice.
 * `sample(x, y, z)` takes tile coordinates and returns [-1, 1].
 */
export function createPeriodicPerlin3(seed, period) {
  const p = Math.max(1, Math.round(period));
  const gradients = new Float32Array(p * p * p * 3);
  for (let z = 0; z < p; z += 1) {
    for (let y = 0; y < p; y += 1) {
      for (let x = 0; x < p; x += 1) {
        const g = (hash3u(seed, x, y, z) % 12) * 3;
        const o = ((z * p + y) * p + x) * 3;
        gradients[o] = GRADIENTS[g];
        gradients[o + 1] = GRADIENTS[g + 1];
        gradients[o + 2] = GRADIENTS[g + 2];
      }
    }
  }

  function corner(xw, yw, zw, dx, dy, dz) {
    const o = ((zw * p + yw) * p + xw) * 3;
    return gradients[o] * dx + gradients[o + 1] * dy + gradients[o + 2] * dz;
  }

  return {
    period: p,
    sample(x, y, z) {
      const lx = x * p;
      const ly = y * p;
      const lz = z * p;
      const xi = Math.floor(lx);
      const yi = Math.floor(ly);
      const zi = Math.floor(lz);
      const fx = lx - xi;
      const fy = ly - yi;
      const fz = lz - zi;
      const x0 = wrapi(xi, p);
      const y0 = wrapi(yi, p);
      const z0 = wrapi(zi, p);
      const x1 = wrapi(xi + 1, p);
      const y1 = wrapi(yi + 1, p);
      const z1 = wrapi(zi + 1, p);
      const gx = fx - 1;
      const gy = fy - 1;
      const gz = fz - 1;

      const n000 = corner(x0, y0, z0, fx, fy, fz);
      const n100 = corner(x1, y0, z0, gx, fy, fz);
      const n010 = corner(x0, y1, z0, fx, gy, fz);
      const n110 = corner(x1, y1, z0, gx, gy, fz);
      const n001 = corner(x0, y0, z1, fx, fy, gz);
      const n101 = corner(x1, y0, z1, gx, fy, gz);
      const n011 = corner(x0, y1, z1, fx, gy, gz);
      const n111 = corner(x1, y1, z1, gx, gy, gz);

      const u = fade(fx);
      const v = fade(fy);
      const w = fade(fz);
      const a = n000 + (n100 - n000) * u;
      const b = n010 + (n110 - n010) * u;
      const c = n001 + (n101 - n001) * u;
      const d = n011 + (n111 - n011) * u;
      const e = a + (b - a) * v;
      const f = c + (d - c) * v;
      const n = (e + (f - e) * w) * PERLIN_NORMALIZATION;
      return n < -1 ? -1 : n > 1 ? 1 : n;
    },
  };
}

/**
 * Periodic 3D Worley (cellular) noise over a `cells`³ lattice.
 * `sample(x, y, z)` takes tile coordinates and returns the nearest-feature
 * distance F1 in cell units, clamped to [0, 1] — 0 at a feature point, 1 in
 * the rare void. `jitter` in [0, 1] moves feature points from cell centres to
 * fully random positions.
 */
export function createPeriodicWorley3(seed, cells, jitter = 1) {
  const c = Math.max(1, Math.round(cells));
  const j = clamp01(jitter);
  // Offsets, not absolute positions: a neighbour cell outside the lattice
  // keeps its own unwrapped origin and borrows the wrapped cell's offset,
  // which is what makes the periodic images line up.
  const offsets = new Float32Array(c * c * c * 3);
  for (let z = 0; z < c; z += 1) {
    for (let y = 0; y < c; y += 1) {
      for (let x = 0; x < c; x += 1) {
        const h = hash3u(seed, x, y, z);
        const o = ((z * c + y) * c + x) * 3;
        // Three decorrelated offsets from one hash (11/11/10 bits).
        offsets[o] = 0.5 + j * (((h & 0x7ff) / 0x7ff) - 0.5);
        offsets[o + 1] = 0.5 + j * ((((h >>> 11) & 0x7ff) / 0x7ff) - 0.5);
        offsets[o + 2] = 0.5 + j * ((((h >>> 22) & 0x3ff) / 0x3ff) - 0.5);
      }
    }
  }

  return {
    cells: c,
    jitter: j,
    sample(x, y, z) {
      const lx = x * c;
      const ly = y * c;
      const lz = z * c;
      const xi = Math.floor(lx);
      const yi = Math.floor(ly);
      const zi = Math.floor(lz);
      let f1 = Infinity;
      for (let dz = -1; dz <= 1; dz += 1) {
        const cz = zi + dz;
        const wz = wrapi(cz, c) * c;
        for (let dy = -1; dy <= 1; dy += 1) {
          const cy = yi + dy;
          const wy = (wz + wrapi(cy, c)) * c;
          for (let dx = -1; dx <= 1; dx += 1) {
            const cx = xi + dx;
            const o = (wy + wrapi(cx, c)) * 3;
            const px = cx + offsets[o] - lx;
            const py = cy + offsets[o + 1] - ly;
            const pz = cz + offsets[o + 2] - lz;
            const d = px * px + py * py + pz * pz;
            if (d < f1) f1 = d;
          }
        }
      }
      const d1 = Math.sqrt(f1);
      return d1 > 1 ? 1 : d1;
    },
  };
}

/**
 * Prebuilt Worley band ladder. `cellCounts` are requested cell counts in tile
 * units; each is band-limited against `dim` and then deduplicated, so a rung
 * that clamps onto an existing frequency shares that rung's field instead of
 * averaging a second decorrelated field at the same scale — which would wash
 * out the silhouette contrast a low tier can least afford to lose.
 *
 * Bands are seeded by their *cell count*, not their ladder index, so the same
 * frequency is the same field at every volume resolution. Switching quality
 * tiers then re-resolves the cloud field instead of reshuffling it.
 */
export function createWorleyLadder3(seed, cellCounts, {
  dim = 64,
  jitter = 1,
  texelsPerCell = 4,
} = {}) {
  const byCells = new Map();
  return cellCounts.map((requested) => {
    const cells = bandLimitPeriod(requested, dim, texelsPerCell);
    let band = byCells.get(cells);
    if (!band) {
      band = createPeriodicWorley3(hashCombine(seed, cells), cells, jitter);
      byCells.set(cells, band);
    }
    return band;
  });
}

/**
 * Nubis inverted-Worley FBM: three ladder rungs starting at `first`, weighted
 * 0.625/0.25/0.125 and inverted so cell interiors are bright. Returns [0, 1].
 * Rungs past the top of the ladder clamp to the top rung.
 */
export function invertedWorleyFbm3(bands, first, x, y, z) {
  const last = bands.length - 1;
  let sum = 0;
  for (let i = 0; i < 3; i += 1) {
    const index = first + i;
    const band = bands[index < last ? index : last];
    sum += WORLEY_FBM_WEIGHTS[i] * (1 - band.sample(x, y, z));
  }
  return sum;
}

/**
 * Periodic Perlin FBM. Octave periods are rounded to integers and each octave
 * is sampled through its own rounded period, so any lacunarity — including
 * the non-integer values the weather profile allows — still tiles exactly.
 * Octaves whose period exceeds the band limit are dropped rather than clamped
 * (an amplitude-normalized stack loses nothing by ending early, whereas a
 * clamped rung would double-weight one frequency).
 *
 * `sample(x, y, z)` takes tile coordinates and returns [-1, 1].
 */
export function createPeriodicPerlinFbm3(seed, {
  period = 2,
  octaves = 4,
  lacunarity = 2,
  gain = 0.5,
  dim = 64,
  texelsPerCell = 4,
} = {}) {
  const limit = Math.max(1, Math.floor(dim / Math.max(1, texelsPerCell)));
  const requestedOctaves = Math.max(1, Math.round(octaves));
  const ratio = Math.max(1.0001, Number(lacunarity) || 2);
  const octaveGain = Math.min(Math.max(Number(gain) || 0.5, 0.01), 0.99);
  const layers = [];
  let amplitudeSum = 0;
  let amplitude = 1;
  let requestedPeriod = Math.max(1, Math.round(period));
  for (let o = 0; o < requestedOctaves; o += 1) {
    const rounded = Math.max(1, Math.round(requestedPeriod));
    if (o > 0 && rounded > limit) break;
    // Seeded by the period actually used, so — as with the Worley ladder — a
    // given frequency is the same field at every volume resolution.
    const octavePeriod = Math.min(rounded, limit);
    layers.push({
      amplitude,
      noise: createPeriodicPerlin3(hashCombine(seed, octavePeriod), octavePeriod),
    });
    amplitudeSum += amplitude;
    amplitude *= octaveGain;
    requestedPeriod *= ratio;
  }
  const inverseSum = 1 / (amplitudeSum || 1);

  return {
    octaves: layers.length,
    periods: layers.map((layer) => layer.noise.period),
    sample(x, y, z) {
      let sum = 0;
      for (let o = 0; o < layers.length; o += 1) {
        sum += layers[o].amplitude * layers[o].noise.sample(x, y, z);
      }
      return sum * inverseSum;
    },
  };
}
