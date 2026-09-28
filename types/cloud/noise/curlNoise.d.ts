/**
 * Builds the divergence-free field.
 *
 * `sample(x, y, z)` takes tile coordinates and writes the normalized curl into
 * `out`, returning it — components land in about [-1, 1]. `curl()` returns the
 * same vector unnormalized, which is what the divergence check needs.
 */
export function createCurlNoiseField({ seed, plan }?: {
    seed?: number;
    plan?: {};
}): {
    componentPeak: number;
    curl: (x: any, y: any, z: any, out: any) => any;
    epsilon: number;
    lengthPeak: number;
    sample(x: any, y: any, z: any, out?: {
        x: number;
        y: number;
        z: number;
    }): {
        x: number;
        y: number;
        z: number;
    };
    scale: number;
    seed: number;
};
/**
 * Bakes the RGBA8 curl volume. Returned separately from the texture so the
 * divergence and tiling checks can read the numbers without a renderer.
 */
export function createCurlNoiseData({ dims, seed, plan, }?: {
    dims?: number;
    seed?: number;
    plan?: {};
}): {
    clippedTexels: number;
    data: Uint8Array<ArrayBuffer>;
    dims: {
        x: number;
        y: number;
        z: number;
    };
    field: {
        componentPeak: number;
        curl: (x: any, y: any, z: any, out: any) => any;
        epsilon: number;
        lengthPeak: number;
        sample(x: any, y: any, z: any, out?: {
            x: number;
            y: number;
            z: number;
        }): {
            x: number;
            y: number;
            z: number;
        };
        scale: number;
        seed: number;
    };
    peakLength: number;
    seed: number;
};
/** Bakes an uncached curl volume. Callers own dispose(). */
export function createCurlNoiseVolume({ dims, seed, plan, }?: {
    dims?: number;
    seed?: number;
    plan?: {};
}): import("three").Data3DTexture;
/** Cached curl volume, keyed by resolution and seed. */
export function getCurlNoiseVolume({ dims, seed, plan, }?: {
    dims?: number;
    seed?: number;
    plan?: {};
}): any;
/** Releases every cached curl volume. */
export function disposeCurlNoiseVolumes(): void;
/**
 * Samples a baked curl volume as an advection offset, in metres.
 *
 * `scale` is the world size of one tile — pass the same repeat the erosion
 * detail uses so wisps shear at the scale they are carved at. `strength` is the
 * offset magnitude in metres at full field energy. RepeatWrapping does the
 * tiling, so the world position needs no fract() first.
 */
export function curlNoiseOffsetNode(volume: any, { position, scale, strength, }: {
    position: any;
    scale: any;
    strength: any;
}): any;
/** Default resolution. Curl is a low-frequency advection field; 32³ is ample. */
export const CURL_NOISE_DEFAULT_DIMS: 32;
/**
 * Potential-field plan. `epsilon` is the central-difference step in tile units:
 * small enough to read as a derivative, large enough that the difference of two
 * nearly equal FBM samples keeps its significant digits.
 */
export const CURL_NOISE_PLAN: Readonly<{
    epsilon: number;
    gain: 0.6;
    lacunarity: 2;
    octaves: 3;
    period: 3;
}>;
/** Decodes a packed curl texel back to a signed vector in about [-1, 1]. */
export const decodeCurlNoise: import("three/src/nodes/TSL.js").FnNode<[], any>;
