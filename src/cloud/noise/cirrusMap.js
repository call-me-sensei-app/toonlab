import { createCloudTextureCache } from './textureCache.js';
// Procedural high-cloud mask for the thin cirrus deck.
//
// Cirrus is not a shallower version of the lower volumetric layer. Ice-crystal
// sheets live kilometres above it, stretch strongly with upper-level wind, and
// are cheap enough to render as one optically thin surface. This texture is the
// authored density of that surface: broad anisotropic FBM supplies the veil,
// ridged turbulence breaks it into fibres, and a low-frequency periodic warp
// bends those fibres without introducing a repeat seam.

import * as THREE from 'three';

import { deriveSeed, hashSeed } from '../../core/generation.js';
import { periodicFbm2, periodicRidged2 } from '../../texgen/noise2.js';
import { encodeUnorm8 } from './noiseVolume.js';

export const CLOUD_CIRRUS_MAP_WIDTH = 1024;
export const CLOUD_CIRRUS_MAP_HEIGHT = 512;
export const CLOUD_CIRRUS_SEED_NAMESPACE = 'cloud-cirrus';

const mapCache = createCloudTextureCache('cirrus');

function smoothstep01(value) {
  const x = value < 0 ? 0 : value > 1 ? 1 : value;
  return x * x * (3 - 2 * x);
}

/** Analytic cirrus density in tile coordinates; periodic over u/v + integer. */
export function sampleCloudCirrusDensity(fieldSeed, u, v) {
  // The warp has matching integer periods at both faces. Adding it to the
  // long axis bends the streaks while preserving exact tiling.
  const warp = periodicFbm2(fieldSeed ^ 0x57a9, u * 3, v * 2, 3, 2, 3, 0.5);
  const warpedU = u * 8 + warp * 0.8;
  const veil = periodicFbm2(fieldSeed ^ 0x1ce5, warpedU, v * 2, 8, 2, 5, 0.52)
    * 0.5 + 0.5;
  const fibres = periodicRidged2(
    fieldSeed ^ 0x71b3,
    warpedU * 2,
    v * 3,
    16,
    3,
    5,
    0.52,
  );
  // Sparse veil plus bright filaments. The threshold keeps clear sky
  // genuinely clear; a plain FBM midpoint would cover the whole deck with
  // grey and turn the cirrus control into uniform haze.
  const veilMask = smoothstep01((veil - 0.42) / 0.38);
  const filamentMask = smoothstep01((fibres - 0.28) / 0.55);
  return Math.min(Math.max(veilMask * (0.28 + filamentMask * 0.72), 0), 1);
}

/** Bakes a seamlessly tiling single-channel cirrus mask into RGBA8 data. */
export function createCloudCirrusMapData({
  width = CLOUD_CIRRUS_MAP_WIDTH,
  height = CLOUD_CIRRUS_MAP_HEIGHT,
  seed = 1,
} = {}) {
  const w = Math.min(Math.max(Math.round(Number(width) || CLOUD_CIRRUS_MAP_WIDTH), 16), 2048);
  const h = Math.min(Math.max(Math.round(Number(height) || CLOUD_CIRRUS_MAP_HEIGHT), 16), 2048);
  const rootSeed = hashSeed(seed);
  const fieldSeed = deriveSeed(rootSeed, CLOUD_CIRRUS_SEED_NAMESPACE);
  const data = new Uint8Array(w * h * 4);
  let cursor = 0;
  let mean = 0;

  for (let y = 0; y < h; y += 1) {
    const v = (y + 0.5) / h;
    for (let x = 0; x < w; x += 1) {
      const u = (x + 0.5) / w;
      const density = sampleCloudCirrusDensity(fieldSeed, u, v);
      const encoded = encodeUnorm8(density);
      data[cursor] = encoded;
      data[cursor + 1] = encoded;
      data[cursor + 2] = encoded;
      data[cursor + 3] = 255;
      cursor += 4;
      mean += density;
    }
  }

  return { data, fieldSeed, height: h, mean: mean / (w * h), seed: rootSeed, width: w };
}

/** Creates an uncached, filterable cirrus mask. Callers own dispose(). */
export function createCloudCirrusMap(options = {}) {
  const baked = createCloudCirrusMapData(options);
  const map = new THREE.DataTexture(
    baked.data,
    baked.width,
    baked.height,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  map.name = `ToonLabCloudCirrus${baked.width}x${baked.height}`;
  map.colorSpace = THREE.NoColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.magFilter = THREE.LinearFilter;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.generateMipmaps = true;
  map.flipY = false;
  map.unpackAlignment = 1;
  map.needsUpdate = true;
  map.userData.toonlabCloudNoise = {
    fieldSeed: baked.fieldSeed,
    height: baked.height,
    kind: 'cirrus-map',
    mean: baked.mean,
    seed: baked.seed,
    width: baked.width,
  };
  return map;
}

/** Cached procedural cirrus mask, shared by systems using the same seed. */
export function getCloudCirrusMap(options = {}) {
  const width = Math.min(Math.max(Math.round(Number(options.width) || CLOUD_CIRRUS_MAP_WIDTH), 16), 2048);
  const height = Math.min(Math.max(Math.round(Number(options.height) || CLOUD_CIRRUS_MAP_HEIGHT), 16), 2048);
  const seed = hashSeed(options.seed ?? 1);
  const key = `${width}x${height}:${seed}`;
  const cached = mapCache.get(key);
  if (cached) return cached;
  const map = createCloudCirrusMap({ height, seed, width });
  mapCache.set(key, map);
  return map;
}

export function disposeCloudCirrusMaps() {
  for (const map of mapCache.values()) map.dispose();
  mapCache.clear();
}
