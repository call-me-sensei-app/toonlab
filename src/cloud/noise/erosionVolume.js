import { createCloudTextureCache } from './textureCache.js';
// Cloud erosion volume — the high-frequency Worley detail field that carves
// the cloud silhouette after the base shape has decided where cloud exists.
//
//   R  inverted Worley FBM, low detail (2 / 4 / 8 cells)
//   G  inverted Worley FBM, mid detail (4 / 8 / 16 cells)
//   B  inverted Worley FBM, high detail (8 / 16 cells)
//   A  R * 0.625 + G * 0.25 + B * 0.125, precombined
//
// Each RGB channel is already an overlapping FBM, matching Hillaire's published
// TileableVolumeNoise companion implementation. The density field combines the
// three FBMs once more, which is what gives erosion a broad support plus enough
// fine structure to break a silhouette:
//
//   detail   = r * 0.625 + g * 0.25 + b * 0.125            (or just the A channel)
//   wispy    = mix(detail, 1 - detail, saturate(heightFraction * 5))
//   modifier = mix(detail, wispy, erosionShape)
//   density  = remap(base, modifier * erosionStrength, 1, 0, 1)
//
// The A channel exists for the cheap paths — the shadow bake and the env-map
// bake carve with one weighted band instead of three, and a fetch they already
// have to make is cheaper than three multiplies they do not.
//
// The band limit here is deliberately looser than the base-shape volume's (two
// texels per cell rather than four). A detail field's job is high-frequency
// grain, not a resolvable silhouette, and the top rung of a 32³ detail volume
// is where the reference-class implementations sit.

import { deriveSeed, hashSeed } from '../../core/generation.js';
import {
  createNoiseVolumeTexture,
  encodeUnorm8,
  noiseVolumeKey,
  resolveNoiseDims,
  warnNoiseVolumeOnce,
} from './noiseVolume.js';
import { createWorleyLadder3 } from './periodicNoise3.js';

/** Default resolution. Not tier-driven: erosion is cheap at every tier. */
export const CLOUD_EROSION_DEFAULT_DIMS = 32;

/**
 * Seed namespace for this volume's bands.
 *
 * createWorleyLadder3 seeds each band by its cell count, so a frequency is the
 * same field at every volume resolution — and, without a namespace, the same
 * field in every *volume* that requests that count. The base-shape volume's
 * ladder overlaps this plan at 4/8/16 cells, so the two combined fields became
 * strongly correlated. Carving a cloud with a copy of its own erosion basis
 * flattens the silhouette instead of tearing it, and at
 * `shape.erosionScaleBaseMultiplier = 1.0` — the top of the spec's authoring
 * range, where both volumes are read at the same tile coordinate — the two
 * fields were 0.69 correlated. Namespacing the seed drops that to ~0.
 */
export const CLOUD_EROSION_SEED_NAMESPACE = 'cloud-erosion';

/** Weights the A channel packs, and the density field's own detail FBM. */
export const CLOUD_EROSION_DETAIL_WEIGHTS = Object.freeze([0.625, 0.25, 0.125]);

/**
 * Frequency plan in cells across one tile. Fixed in tile units so a custom
 * resolution re-resolves the same field rather than authoring a new one.
 */
export const CLOUD_EROSION_PLAN = Object.freeze({
  cells: Object.freeze([2, 4, 8, 16]),
  jitter: 1,
  texelsPerCell: 2,
});

const volumeCache = createCloudTextureCache('erosion');

/**
 * Bakes the RGBA8 erosion field. Returned separately from the texture so
 * verification scripts can read the numbers without a renderer.
 */
export function createCloudErosionData({
  dims = CLOUD_EROSION_DEFAULT_DIMS,
  seed = 1,
} = {}) {
  const size = resolveNoiseDims(dims, CLOUD_EROSION_DEFAULT_DIMS);
  const rootSeed = hashSeed(seed);
  // The public seed is reported unchanged so a preset can round-trip it; only
  // the field seed is namespaced.
  const fieldSeed = deriveSeed(rootSeed, CLOUD_EROSION_SEED_NAMESPACE);
  const bands = createWorleyLadder3(fieldSeed, CLOUD_EROSION_PLAN.cells, {
    dim: Math.min(size.x, size.y, size.z),
    jitter: CLOUD_EROSION_PLAN.jitter,
    texelsPerCell: CLOUD_EROSION_PLAN.texelsPerCell,
  });
  // Four bands are the contract, not a preference: RGB are the overlapping
  // FBMs [2/4/8], [4/8/16] and [8/16]. At two texels per cell a short axis of
  // 16 band-limits the last rung and loses the finest part of G/B.
  const distinctBands = new Set(bands).size;
  if (distinctBands < CLOUD_EROSION_PLAN.cells.length) {
    warnNoiseVolumeOnce(
      `erosion-bands:${size.x}x${size.y}x${size.z}`,
      `[erosionVolume] ${size.x}x${size.y}x${size.z} band-limits cells `
      + `[${CLOUD_EROSION_PLAN.cells}] to [${bands.map((band) => band.cells)}], leaving `
      + `${distinctBands} distinct band(s) of ${CLOUD_EROSION_PLAN.cells.length}: the repeated `
      + 'channels carry identical bytes and the detail FBM loses a band. Raise the resolution to '
      + `${CLOUD_EROSION_PLAN.cells[CLOUD_EROSION_PLAN.cells.length - 1]
        * CLOUD_EROSION_PLAN.texelsPerCell}³ or above for all three.`,
    );
  }
  const [weightR, weightG, weightB] = CLOUD_EROSION_DETAIL_WEIGHTS;

  const data = new Uint8Array(size.x * size.y * size.z * 4);
  const invX = 1 / size.x;
  const invY = 1 / size.y;
  const invZ = 1 / size.z;
  let cursor = 0;
  for (let z = 0; z < size.z; z += 1) {
    const w = (z + 0.5) * invZ;
    for (let y = 0; y < size.y; y += 1) {
      const v = (y + 0.5) * invY;
      for (let x = 0; x < size.x; x += 1) {
        const u = (x + 0.5) * invX;
        const w0 = 1 - bands[0].sample(u, v, w);
        const w1 = 1 - bands[1].sample(u, v, w);
        const w2 = 1 - bands[2].sample(u, v, w);
        const w3 = 1 - bands[3].sample(u, v, w);
        // Exact packing from Hillaire's reference generator. The highest
        // channel has two usable rungs at 32^3, hence 0.75 / 0.25.
        const low = w0 * 0.625 + w1 * 0.25 + w2 * 0.125;
        const mid = w1 * 0.625 + w2 * 0.25 + w3 * 0.125;
        const high = w2 * 0.75 + w3 * 0.25;
        data[cursor] = encodeUnorm8(low);
        data[cursor + 1] = encodeUnorm8(mid);
        data[cursor + 2] = encodeUnorm8(high);
        data[cursor + 3] = encodeUnorm8(low * weightR + mid * weightG + high * weightB);
        cursor += 4;
      }
    }
  }

  return {
    data,
    dims: size,
    distinctBands,
    fieldSeed,
    seed: rootSeed,
    worleyCells: bands.map((band) => band.cells),
  };
}

/** Bakes an uncached erosion volume. Callers own dispose(). */
export function createCloudErosionVolume({
  dims = CLOUD_EROSION_DEFAULT_DIMS,
  seed = 1,
} = {}) {
  const baked = createCloudErosionData({ dims, seed });
  const texture = createNoiseVolumeTexture(
    baked.data,
    baked.dims,
    `ToonLabCloudErosion${baked.dims.x}x${baked.dims.y}x${baked.dims.z}`,
  );
  texture.userData.toonlabCloudNoise = {
    detailWeights: CLOUD_EROSION_DETAIL_WEIGHTS,
    dims: baked.dims,
    distinctBands: baked.distinctBands,
    // `seed` is the public seed, so a lab can serialize it and get this volume
    // back; `fieldSeed` is the namespaced seed the bands were built from.
    fieldSeed: baked.fieldSeed,
    kind: 'erosion',
    seed: baked.seed,
    worleyCells: baked.worleyCells,
  };
  return texture;
}

/** Cached erosion volume, keyed by resolution and seed. */
export function getCloudErosionVolume({
  dims = CLOUD_EROSION_DEFAULT_DIMS,
  seed = 1,
} = {}) {
  const size = resolveNoiseDims(dims, CLOUD_EROSION_DEFAULT_DIMS);
  const key = noiseVolumeKey(size, hashSeed(seed));
  const cached = volumeCache.get(key);
  if (cached) return cached;
  const texture = createCloudErosionVolume({ dims: size, seed });
  volumeCache.set(key, texture);
  return texture;
}

/** Releases every cached erosion volume. */
export function disposeCloudErosionVolumes() {
  for (const texture of volumeCache.values()) texture.dispose();
  volumeCache.clear();
}
