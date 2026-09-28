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
export function resolveAuthoredNumber(value: any, fallback: any): any;
/** Accepts 64, [64, 32, 64] or { x, y, z } and normalizes to { x, y, z }. */
export function resolveNoiseDims(dims: any, fallback?: number): {
    x: number;
    y: number;
    z: number;
};
/** `${x}x${y}x${z}:${seed}` — the cache key every volume generator uses. */
export function noiseVolumeKey(dims: any, seed: any): string;
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
export function warnNoiseVolumeOnce(key: any, message: any): boolean;
/**
 * Wraps baked RGBA8 data in a fully configured tiling 3D texture.
 *
 * `generateMipmaps` stays off: three.js cannot build a 3D mip chain on the
 * WebGPU backend. Volumes that carry authored levels are configured and uploaded
 * by configureNoiseVolumeMipChain/uploadNoiseVolumeMipChain below.
 */
export function createNoiseVolumeTexture(data: any, dims: any, name: any): THREE.Data3DTexture;
/**
 * Gives a Data3DTexture a full authored mip pyramid. WebGPU cannot generate
 * 3D mips through three's normal generator, so the byte levels are retained
 * until a renderer can copy them into the allocated GPU levels.
 */
export function configureNoiseVolumeMipChain(texture: any, levels: any, dims: any): any;
/** Uploads the retained 3D mip levels once for each renderer. */
export function uploadNoiseVolumeMipChain(renderer: any, texture: any): boolean;
/** Quantizes a [0, 1] field value to a byte with round-half-up. */
export function encodeUnorm8(value: any): number;
/** Quantizes a [-1, 1] field value to a byte, matching a `* 2 - 1` decode. */
export function encodeSnorm8(value: any): number;
/**
 * Hard floor for every noise volume, on every axis.
 *
 * Below 8 the band ladder has nothing left to resolve: every Worley rung
 * band-limits onto the same cell count, so the three erosion channels come out
 * byte-identical and what remains is not a cloud field. The floor lives here
 * rather than in each baker because the degenerate volume still samples cleanly
 * — nothing downstream can detect that it was handed junk.
 */
export const NOISE_VOLUME_MIN_DIM: 8;
import * as THREE from 'three';
