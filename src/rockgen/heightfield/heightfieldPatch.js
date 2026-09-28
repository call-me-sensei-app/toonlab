// Eroded heightfield patches for the 'heightfield' rock piece: the recipe
// the dedicated terrain tools (Gaea / World Machine / Terrain Mixer) all
// converge on, at rock-piece scale —
//
//   ridged+fbm relief  →  silhouette profile  →  terracing  →  EROSION
//
// The output is a normalized [0, 1] height grid the field compiler turns
// into an SDF (mesas, canyon walls, mountain flanks with real drainage),
// plus the erosion masks for stylization. Everything derives from hashed
// noise + the seeded erosion sim, so patches are bit-deterministic and a
// document's golden hash covers them.
//
// Patches are memoized on their full parameter key: meshing re-samples the
// field millions of times, and slider drags must not re-erode per sample.

import { fbm3, ridgedFbm3 } from '../noise/valueNoise3.js';
import { hashCombine } from '../noise/prng.js';
import { erodeHeightfield } from './heightfieldErosion.js';

export const HEIGHTFIELD_PROFILES = Object.freeze(['mesa', 'ridge', 'slope', 'open']);

const PATCH_RESOLUTION = 128;
const CACHE_LIMIT = 8;
const cache = new Map(); // key -> patch (insertion-ordered; oldest evicted)

const SEED_RELIEF = 17;
const SEED_DETAIL = 41;

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// Silhouette profiles shape the patch before erosion so droplets carve
// the landform rather than a noise plane:
//   mesa  — flat elevated plateau falling off toward every rim
//   ridge — a crest along Z, falling off toward ±X (canyon/cliff walls)
//   slope — one-directional ramp, high at -X (a hillside band)
//   open  — raw relief edge to edge
function profileWeight(profile, u, v) {
  if (profile === 'mesa') {
    const rim = Math.min(u, 1 - u, v, 1 - v) * 2; // 0 at rim, 1 at center
    const t = clamp01(rim / 0.55);
    return 0.15 + 0.85 * (t * t * (3 - 2 * t));
  }
  if (profile === 'ridge') {
    const crest = 1 - Math.abs(u - 0.5) * 2;
    const t = clamp01(crest / 0.75);
    return 0.1 + 0.9 * (t * t * (3 - 2 * t));
  }
  if (profile === 'slope') {
    return 0.15 + 0.85 * clamp01(1.15 - u * 1.3);
  }
  return 1; // open
}

// Soft terracing (the cliff-banding move): quantize height into steps but
// keep a smoothed remainder so bands read as strata, not stairsteps.
function terraceHeight(h, amount, steps) {
  if (amount <= 0) return h;
  const scaled = h * steps;
  const base = Math.floor(scaled);
  const frac = scaled - base;
  const sharp = clamp01((frac - 0.5) / 0.28 + 0.5);
  const stepped = (base + sharp * sharp * (3 - 2 * sharp)) / steps;
  return h + (stepped - h) * amount;
}

/**
 * Builds (or returns cached) an eroded patch for one heightfield piece.
 *
 * @param {number} seed Combined document+piece seed (uint32).
 * @param {object} hf The piece's `heightfield` settings group.
 * @returns {{ heights: Float32Array, masks: object, resolution: number,
 *   sample(u: number, v: number): number }} heights normalized to [0, 1].
 */
export function getHeightfieldPatch(seed, hf) {
  const key = [
    seed >>> 0, hf.profile, hf.relief, hf.roughness, hf.terrace, hf.terraceSteps,
    hf.erosion, hf.droplets, hf.thermal, hf.seedOffset,
  ].join('|');
  const cached = cache.get(key);
  if (cached) return cached;

  const res = PATCH_RESOLUTION;
  const patchSeed = hashCombine(seed >>> 0, (hf.seedOffset >>> 0) || 0);
  const reliefSeed = hashCombine(patchSeed, SEED_RELIEF);
  const detailSeed = hashCombine(patchSeed, SEED_DETAIL);

  // --- base relief: ridged backbone blended with rolling fbm ---------------
  const heights = new Float32Array(res * res);
  const frequency = 2.2 + hf.roughness * 2.4;
  for (let iz = 0; iz < res; iz += 1) {
    for (let ix = 0; ix < res; ix += 1) {
      const u = ix / (res - 1);
      const v = iz / (res - 1);
      const ridged = ridgedFbm3(reliefSeed, u * frequency, 0, v * frequency, 5, 2.05, 0.5);
      const rolling = fbm3(detailSeed, u * frequency * 1.7, 0, v * frequency * 1.7, 4, 2.0, 0.5)
        * 0.5 + 0.5;
      let h = ridged * hf.relief + rolling * (1 - hf.relief);
      h = terraceHeight(clamp01(h), hf.terrace, Math.max(2, Math.round(hf.terraceSteps)));
      h *= profileWeight(hf.profile, u, v);
      // Mesas are PLATEAUS: soft-clamp the caprock so peaks flatten into a
      // tabletop instead of a mountain (relief above the cap compresses).
      if (hf.profile === 'mesa' && h > 0.62) h = 0.62 + (h - 0.62) * 0.18;
      heights[iz * res + ix] = h;
    }
  }

  // --- erosion --------------------------------------------------------------
  let masks = null;
  let final = heights;
  if (hf.erosion > 0) {
    // Heights are normalized: talus/minSlope stay in per-cell units scaled
    // to the patch's implied relief (1.0 over ~res cells).
    const result = erodeHeightfield({
      height: res,
      heightmap: heights,
      params: {
        droplets: Math.round(10_000 + hf.droplets * 70_000),
        seed: patchSeed,
        strength: hf.erosion,
        talus: (0.35 + (1 - hf.thermal) * 0.9) * (1.4 / res) * 20,
        thermalIterations: Math.round(hf.thermal * 60),
        thermalStrength: 0.25 + hf.thermal * 0.45,
      },
      width: res,
    });
    final = result.eroded;
    masks = result;
    // Erosion deposits can push past 1: renormalize into [0, 1] so sizeY
    // stays the honest height bound the SDF metrics rely on.
    let max = 1e-6;
    for (let i = 0; i < final.length; i += 1) if (final[i] > max) max = final[i];
    if (max > 1) for (let i = 0; i < final.length; i += 1) final[i] /= max;
  }

  const bilinear = (array, u, v) => {
    const fx = clamp01(u) * (res - 1);
    const fz = clamp01(v) * (res - 1);
    const ix = Math.min(Math.floor(fx), res - 2);
    const iz = Math.min(Math.floor(fz), res - 2);
    const tx = fx - ix;
    const tz = fz - iz;
    const row = iz * res + ix;
    const a = array[row];
    const b = array[row + 1];
    const c = array[row + res];
    const d = array[row + res + 1];
    return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
  };

  const patch = {
    heights: final,
    masks,
    resolution: res,
    /** Erosion story for stylization: deposition + water flow at (u, v). */
    sampleMasks(u, v) {
      if (!masks) return null;
      return {
        flow: bilinear(masks.flow, u, v),
        sediment: bilinear(masks.depositionMask, u, v),
      };
    },
    sample(u, v) {
      const fx = clamp01(u) * (res - 1);
      const fz = clamp01(v) * (res - 1);
      const ix = Math.min(Math.floor(fx), res - 2);
      const iz = Math.min(Math.floor(fz), res - 2);
      const tx = fx - ix;
      const tz = fz - iz;
      const row = iz * res + ix;
      const a = final[row];
      const b = final[row + 1];
      const c = final[row + res];
      const d = final[row + res + 1];
      return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
    },
  };

  cache.set(key, patch);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
  return patch;
}
