// The Data3DTexture contract shared by the three cloud noise volumes.
//
// All of them are RGBA8 tiling fields sampled trilinearly with RepeatWrapping
// on every axis. Getting one axis wrong (wrapR defaults to ClampToEdge) puts a
// seam in the sky that looks like a shader bug rather than a texture setting,
// so the settings live in one place instead of three.

import * as THREE from 'three';

/**
 * Reads one authored number out of untrusted input, returning `fallback` for
 * anything absent. The single definition of "absent" for the whole noise module.
 *
 * `Number()` is not the guard it looks like: `Number(null)`, `Number('')`,
 * `Number([])` and `Number(false)` are all 0 and all pass `Number.isFinite`, so
 * a clamp downstream pins them to a range's minimum instead of falling back to a
 * default. A preset that round-tripped through JSON carries `null` for every
 * untouched field, so that difference is the difference between reloading a sky
 * and authoring a new one. Numeric strings stay legal because lab inputs and URL
 * parameters arrive as strings.
 */
export function resolveAuthoredNumber(value, fallback) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

/**
 * Hard floor for every noise volume, on every axis.
 *
 * Below 8 the band ladder has nothing left to resolve: every Worley rung
 * band-limits onto the same cell count, so the three erosion channels come out
 * byte-identical and what remains is not a cloud field. The floor lives here
 * rather than in each baker because the degenerate volume still samples cleanly
 * — nothing downstream can detect that it was handed junk.
 */
export const NOISE_VOLUME_MIN_DIM = 8;

/** Accepts 64, [64, 32, 64] or { x, y, z } and normalizes to { x, y, z }. */
export function resolveNoiseDims(dims, fallback = 64) {
  const clampAxis = (value) => {
    // An absent axis is the default, not zero: a preset that serialized `null`
    // — or `false`, or 0 — must not deserialize into a 2³ volume.
    const size = Math.round(resolveAuthoredNumber(value, fallback));
    if (!(size > 0)) return fallback;
    if (size < NOISE_VOLUME_MIN_DIM) {
      warnNoiseVolumeOnce(
        `noise-dim-floor:${size}`,
        `Noise volume axis ${size} is below the ${NOISE_VOLUME_MIN_DIM}-texel floor; `
        + `clamping to ${NOISE_VOLUME_MIN_DIM}. Below it every band collapses onto one `
        + 'cell count and the erosion channels come out identical.',
      );
    }
    return Math.min(Math.max(size, NOISE_VOLUME_MIN_DIM), 256);
  };
  if (Array.isArray(dims)) {
    return {
      x: clampAxis(dims[0]),
      y: clampAxis(dims[1] ?? dims[0]),
      z: clampAxis(dims[2] ?? dims[0]),
    };
  }
  if (dims && typeof dims === 'object') {
    return { x: clampAxis(dims.x), y: clampAxis(dims.y), z: clampAxis(dims.z) };
  }
  const size = clampAxis(dims);
  return { x: size, y: size, z: size };
}

/** `${x}x${y}x${z}:${seed}` — the cache key every volume generator uses. */
export function noiseVolumeKey(dims, seed) {
  return `${dims.x}x${dims.y}x${dims.z}:${seed}`;
}

const warnedKeys = new Set();

/**
 * Reports a degenerate volume configuration once per distinct `key`.
 *
 * A band ladder that collapsed, a mip level that hit the resolution floor, an
 * encoding that clipped — all of them produce a field that still *looks* like a
 * volume, so silence is the failure mode. Deduplicated because a lab bound to a
 * seed slider re-bakes on every drag, and a warning repeated a hundred times
 * buries the first one. The key is the configuration, not the seed: the same
 * resolution degenerates the same way whatever it is seeded with.
 */
export function warnNoiseVolumeOnce(key, message) {
  if (warnedKeys.has(key)) return false;
  warnedKeys.add(key);
  console.warn(message);
  return true;
}

/**
 * Wraps baked RGBA8 data in a fully configured tiling 3D texture.
 *
 * `generateMipmaps` stays off: three.js cannot build a 3D mip chain on the
 * WebGPU backend. Volumes that carry authored levels are configured and uploaded
 * by configureNoiseVolumeMipChain/uploadNoiseVolumeMipChain below.
 */
export function createNoiseVolumeTexture(data, dims, name) {
  const texture = new THREE.Data3DTexture(data, dims.x, dims.y, dims.z);
  texture.name = name;
  texture.format = THREE.RGBAFormat;
  texture.type = THREE.UnsignedByteType;
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.wrapR = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}

function volumeMipDims(dims, level) {
  const scale = 2 ** level;
  return {
    x: Math.max(1, Math.floor(dims.x / scale)),
    y: Math.max(1, Math.floor(dims.y / scale)),
    z: Math.max(1, Math.floor(dims.z / scale)),
  };
}

/**
 * Gives a Data3DTexture a full authored mip pyramid. WebGPU cannot generate
 * 3D mips through three's normal generator, so the byte levels are retained
 * until a renderer can copy them into the allocated GPU levels.
 */
export function configureNoiseVolumeMipChain(texture, levels, dims) {
  if (!texture?.isData3DTexture || !Array.isArray(levels) || levels.length < 2) {
    return texture;
  }
  texture.minFilter = THREE.LinearMipMapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.mipmaps = levels.map((unused, level) => {
    const size = volumeMipDims(dims, level);
    return { width: size.x, height: size.y, depth: size.z };
  });
  texture.userData.toonlabVolumeMipChain = {
    dims: { ...dims },
    levels,
    uploadedRenderers: new WeakSet(),
  };
  texture.needsUpdate = true;
  return texture;
}

/** Uploads the retained 3D mip levels once for each renderer. */
export function uploadNoiseVolumeMipChain(renderer, texture) {
  const chain = texture?.userData?.toonlabVolumeMipChain;
  if (!renderer?.copyTextureToTexture || !chain || chain.uploadedRenderers.has(renderer)) {
    return false;
  }

  const temps = [];
  for (let level = 1; level < chain.levels.length; level += 1) {
    const size = volumeMipDims(chain.dims, level);
    const temp = new THREE.Data3DTexture(
      chain.levels[level],
      size.x,
      size.y,
      size.z,
    );
    temp.format = THREE.RGBAFormat;
    temp.type = THREE.UnsignedByteType;
    temp.unpackAlignment = 1;
    temp.needsUpdate = true;
    renderer.copyTextureToTexture(
      temp,
      texture,
      new THREE.Box3(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(size.x, size.y, size.z),
      ),
      new THREE.Vector3(0, 0, 0),
      0,
      level,
    );
    temps.push(temp);
  }
  for (const temp of temps) temp.dispose();
  chain.uploadedRenderers.add(renderer);
  return true;
}

/** Quantizes a [0, 1] field value to a byte with round-half-up. */
export function encodeUnorm8(value) {
  const clamped = value < 0 ? 0 : value > 1 ? 1 : value;
  return (clamped * 255 + 0.5) | 0;
}

/** Quantizes a [-1, 1] field value to a byte, matching a `* 2 - 1` decode. */
export function encodeSnorm8(value) {
  return encodeUnorm8(value * 0.5 + 0.5);
}
