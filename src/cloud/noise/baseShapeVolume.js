import { createCloudTextureCache } from './textureCache.js';
// Cloud base-shape volume — packed inverted-Worley FBMs.
//
//   R  inverted Worley FBM at 4 / 8 / 16 cells
//   G  inverted Worley FBM at 8 / 16 / 32 cells
//   B  inverted Worley FBM at 16 / 32 / 64 cells
//   A  1 (unused)
//
// The cloud density samples RGB once at the base scale to dilate the top and
// samples the same texture again at the erosion scale. This is deliberately not
// the Perlin-Worley + separate erosion-volume path used by the discarded lab.
//
// The hash has no author seed, so it produces one canonical field. The public
// seed remains in uncached bake metadata for document compatibility, but does
// not perturb these bytes. Cached textures use canonical seed 0 and share one
// texture and mip chain per resolution, independent of the authored seed.
//
// Every band is periodic over the unit tile and the texture wraps on all three
// axes, so the field continues exactly across a repeat. Sampling is at texel
// centres; opposite faces are one texel apart in a continuous field rather
// than equal, which is what makes trilinear RepeatWrapping seamless.
//
// The CPU bake also builds a full 2x2x2 box-filtered mip chain. Three
// cannot generate 3D mips on WebGPU, so noiseVolume.js allocates the levels and
// uploads each one through renderer.copyTextureToTexture before the first march.
// Shadow and environment bakes may still request a separately cached coarser
// volume to reduce their storage and sampling cost.

import { hashSeed } from '../../core/generation.js';
import {
  createNoiseVolumeTexture,
  configureNoiseVolumeMipChain,
  encodeUnorm8,
  noiseVolumeKey,
  resolveNoiseDims,
  warnNoiseVolumeOnce,
} from './noiseVolume.js';

// The tier table is not duplicated here: `baseShapeDims` belongs to
// src/sky/skyQualityTiers.js, which is its sole owner. This module only needs
// the resolution the frequency plan below is *authored* against.

/**
 * The master resolution the frequency plan is authored at, and the anchor mip
 * levels are measured from. Also the default when no dims are given.
 */
export const CLOUD_BASE_SHAPE_MASTER_DIM = 64;

/**
 * Hard floor for any resolved volume. Below 8³ the Worley ladder band-limits
 * every rung the erosion window reads onto one cell count, so G, B and A become
 * the same band and the three-band erosion basis the density recipe needs stops
 * existing — an honest clamp is worth more than a field-shaped 8-texel artifact.
 */
export const CLOUD_BASE_SHAPE_MIN_DIM = 8;

/**
 * Legacy namespace export retained for consumers of the discarded generator.
 * The canonical packed field does not read it.
 */
export const CLOUD_BASE_SHAPE_SEED_NAMESPACE = 'cloud-base-shape';

/** Legacy export retained for consumers; the current density uses its own RGB strengths. */
export const CLOUD_BASE_SHAPE_EROSION_WEIGHTS = Object.freeze([0.625, 0.25, 0.125]);

/**
 * Frequency plan, in cells (Worley) or lattice periods (Perlin) across one
 * tile. Fixed in tile units rather than scaled per resolution: a quality tier
 * should re-resolve the same sky, not author a different one. Rungs finer than
 * the volume can carry are band-limited away inside the samplers.
 */
export const CLOUD_BASE_SHAPE_PLAN = Object.freeze({
  // Three overlapping FBMs share one 4/8/16/32/64 ladder.
  worleyCells: Object.freeze([4, 8, 16, 32, 64]),
  worleyJitter: 1,
  // The 64-cell rung is intentionally one texel per cell and receives only
  // 0.25 weight in A, matching the published 64-cubed generator. Coarser tiers
  // band-limit it through createWorleyLadder3 instead of inventing new rungs.
  worleyTexelsPerCell: 1,
});

const volumeCache = createCloudTextureCache('base-shape');

// Fixed u32 hash and cellular sampler. These stay local rather than using the
// seeded noise utilities because the canonical base-shape bake must remain
// byte-identical across projects and sessions.
function hash33(x, y, z) {
  let px = (Math.imul(x >>> 0, 1664525) + 1013904223) >>> 0;
  let py = (Math.imul(y >>> 0, 1664525) + 1013904223) >>> 0;
  let pz = (Math.imul(z >>> 0, 1664525) + 1013904223) >>> 0;

  px = (px + Math.imul(py, pz)) >>> 0;
  py = (py + Math.imul(pz, px)) >>> 0;
  pz = (pz + Math.imul(px, py)) >>> 0;
  px = (px ^ (px >>> 16)) >>> 0;
  py = (py ^ (py >>> 16)) >>> 0;
  pz = (pz ^ (pz >>> 16)) >>> 0;
  px = (px + Math.imul(py, pz)) >>> 0;
  py = (py + Math.imul(pz, px)) >>> 0;
  pz = (pz + Math.imul(px, py)) >>> 0;

  const inverse = 1 / 4294967295;
  return [px * inverse, py * inverse, pz * inverse];
}

function positiveModulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function worley3(position, cells) {
  const sx = position[0] * cells;
  const sy = position[1] * cells;
  const sz = position[2] * cells;
  const ix = Math.floor(sx);
  const iy = Math.floor(sy);
  const iz = Math.floor(sz);
  const fx = sx - ix;
  const fy = sy - iy;
  const fz = sz - iz;
  let minimumSquared = 1;

  for (let dz = -1; dz <= 1; dz += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const random = hash33(
          positiveModulo(ix + dx, cells),
          positiveModulo(iy + dy, cells),
          positiveModulo(iz + dz, cells),
        );
        const ox = dx + random[0] - fx;
        const oy = dy + random[1] - fy;
        const oz = dz + random[2] - fz;
        minimumSquared = Math.min(minimumSquared, ox * ox + oy * oy + oz * oz);
      }
    }
  }
  return Math.min(Math.sqrt(minimumSquared), 1);
}

function invertedWorleyFbm(position, cells) {
  return 1 - (
    worley3(position, cells[0]) * 0.625
    + worley3(position, cells[1]) * 0.25
    + worley3(position, cells[2]) * 0.125
  );
}

/**
 * Volume resolution standing in for mip `level` of `dims`. The shadow bake and
 * the env-map bake ask the cloud field for a coarser read; they get a second,
 * smaller cached volume of the same seeded field rather than a filtered mip.
 *
 * The level is relative to the 64³ master plan, never to the tier's already
 * reduced `baseShapeDims`. Shifting the tier dims compounds two reductions: the
 * low tier's 16³ at cloudShadowMipLevel 3 resolved to 2³, an eight-texel field
 * with one erosion band feeding both the ground-shadow and env-map bakes. It
 * also made "mip 3" mean a different resolution at every tier, so a shadow bake
 * would not match across tiers. Anchoring at the master plan fixes both, and the
 * result is capped at `dims` because a coarser read must never cost more than
 * the volume it is standing in for.
 */
export function cloudBaseShapeDimsForMip(dims, level = 0) {
  const base = resolveNoiseDims(dims, CLOUD_BASE_SHAPE_MASTER_DIM);
  const shift = Math.max(0, Math.round(Number(level) || 0));
  // 2 ** shift rather than >> shift: the shift operand is masked to 5 bits, so
  // `64 >> 32` is 64 and a wild level would silently resolve the full volume.
  const target = CLOUD_BASE_SHAPE_MASTER_DIM / 2 ** Math.min(shift, 30);
  const clamped = [];
  const axis = (size, name) => {
    const reduced = Math.min(size, Math.max(1, Math.floor(target)));
    if (reduced >= CLOUD_BASE_SHAPE_MIN_DIM) return reduced;
    clamped.push(`${name} ${reduced}`);
    return CLOUD_BASE_SHAPE_MIN_DIM;
  };
  const resolved = resolveNoiseDims({
    x: axis(base.x, 'x'),
    y: axis(base.y, 'y'),
    z: axis(base.z, 'z'),
  }, CLOUD_BASE_SHAPE_MASTER_DIM);
  if (clamped.length > 0) {
    warnNoiseVolumeOnce(
      `base-shape-mip:${base.x}x${base.y}x${base.z}:${shift}`,
      `[baseShapeVolume] Mip level ${shift} of ${base.x}x${base.y}x${base.z} resolves to `
      + `${clamped.join(', ')}, below the ${CLOUD_BASE_SHAPE_MIN_DIM}³ floor; the bake will read `
      + `a ${resolved.x}x${resolved.y}x${resolved.z} volume instead. Lower cloudShadowMipLevel / `
      + 'envMapMipBase to get the level you asked for.',
    );
  }
  return resolved;
}

/**
 * Bakes the RGBA8 base-shape field. Returned separately from the texture so
 * verification scripts and headless tools can read the numbers without a
 * renderer.
 */
export function createCloudBaseShapeData({
  dims = CLOUD_BASE_SHAPE_MASTER_DIM,
  seed = 1,
} = {}) {
  const size = resolveNoiseDims(dims, CLOUD_BASE_SHAPE_MASTER_DIM);
  const rootSeed = hashSeed(seed);
  const fieldSeed = 0;
  const data = new Uint8Array(size.x * size.y * size.z * 4);
  const invX = 1 / size.x;
  const invY = 1 / size.y;
  const invZ = 1 / size.z;
  let cursor = 0;
  for (let z = 0; z < size.z; z += 1) {
    const w = z * invZ;
    for (let y = 0; y < size.y; y += 1) {
      const v = y * invY;
      for (let x = 0; x < size.x; x += 1) {
        const u = x * invX;
        const position = [u, v, w];
        const low = invertedWorleyFbm(position, [4, 8, 16]);
        const mid = invertedWorleyFbm(position, [8, 16, 32]);
        const high = invertedWorleyFbm(position, [16, 32, 64]);
        data[cursor] = encodeUnorm8(low);
        data[cursor + 1] = encodeUnorm8(mid);
        data[cursor + 2] = encodeUnorm8(high);
        data[cursor + 3] = 255;
        cursor += 4;
      }
    }
  }

  // Store a complete box-filtered 3D mip pyramid. Besides preventing
  // distant aliasing, this is what lets base and erosion samples choose
  // independent cone-footprint LODs from the same packed volume.
  const levels = [data];
  let source = data;
  let sourceDims = size;
  while (sourceDims.x > 1 || sourceDims.y > 1 || sourceDims.z > 1) {
    const nextDims = {
      x: Math.max(1, sourceDims.x >> 1),
      y: Math.max(1, sourceDims.y >> 1),
      z: Math.max(1, sourceDims.z >> 1),
    };
    const next = new Uint8Array(nextDims.x * nextDims.y * nextDims.z * 4);
    let nextCursor = 0;
    for (let z = 0; z < nextDims.z; z += 1) {
      for (let y = 0; y < nextDims.y; y += 1) {
        for (let x = 0; x < nextDims.x; x += 1) {
          const accum = [0, 0, 0, 0];
          for (let oz = 0; oz < 2; oz += 1) {
            for (let oy = 0; oy < 2; oy += 1) {
              for (let ox = 0; ox < 2; ox += 1) {
                const sx = (x * 2 + ox) % sourceDims.x;
                const sy = (y * 2 + oy) % sourceDims.y;
                const sz = (z * 2 + oz) % sourceDims.z;
                const index = (sx + sy * sourceDims.x
                  + sz * sourceDims.x * sourceDims.y) * 4;
                accum[0] += source[index];
                accum[1] += source[index + 1];
                accum[2] += source[index + 2];
                accum[3] += source[index + 3];
              }
            }
          }
          next[nextCursor] = Math.round(accum[0] * 0.125);
          next[nextCursor + 1] = Math.round(accum[1] * 0.125);
          next[nextCursor + 2] = Math.round(accum[2] * 0.125);
          next[nextCursor + 3] = Math.round(accum[3] * 0.125);
          nextCursor += 4;
        }
      }
    }
    levels.push(next);
    source = next;
    sourceDims = nextDims;
  }

  return {
    data,
    dims: size,
    fieldSeed,
    perlinPeriods: Object.freeze([]),
    seed: rootSeed,
    levels,
    worleyCells: CLOUD_BASE_SHAPE_PLAN.worleyCells,
  };
}

/** Bakes an uncached base-shape volume. Callers own dispose(). */
export function createCloudBaseShapeVolume({
  dims = CLOUD_BASE_SHAPE_MASTER_DIM,
  seed = 1,
} = {}) {
  const baked = createCloudBaseShapeData({ dims, seed });
  const texture = createNoiseVolumeTexture(
    baked.data,
    baked.dims,
    `ToonLabCloudBaseShape${baked.dims.x}x${baked.dims.y}x${baked.dims.z}`,
  );
  configureNoiseVolumeMipChain(texture, baked.levels, baked.dims);
  texture.userData.toonlabCloudNoise = {
    dims: baked.dims,
    erosionWeights: CLOUD_BASE_SHAPE_EROSION_WEIGHTS,
    // `seed` is retained for document compatibility; `fieldSeed` is always 0
    // because the source generator's u32 hash has no author seed.
    fieldSeed: baked.fieldSeed,
    kind: 'base-shape',
    perlinPeriods: baked.perlinPeriods,
    seed: baked.seed,
    worleyCells: baked.worleyCells,
  };
  return texture;
}

/**
 * Cached canonical base-shape volume, keyed by resolution. A tier switch that
 * returns to a resolution already baked pays nothing, and the shadow/env-map
 * bakes share the runtime's volumes.
 */
export function getCloudBaseShapeVolume({
  dims = CLOUD_BASE_SHAPE_MASTER_DIM,
  seed = 1,
} = {}) {
  const size = resolveNoiseDims(dims, CLOUD_BASE_SHAPE_MASTER_DIM);
  const key = noiseVolumeKey(size, 0);
  const cached = volumeCache.get(key);
  if (cached) return cached;
  const texture = createCloudBaseShapeVolume({ dims: size, seed: 0 });
  volumeCache.set(key, texture);
  return texture;
}

/** Releases every cached base-shape volume. */
export function disposeCloudBaseShapeVolumes() {
  for (const texture of volumeCache.values()) texture.dispose();
  volumeCache.clear();
}
