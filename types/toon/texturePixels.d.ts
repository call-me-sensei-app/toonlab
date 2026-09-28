/**
 * Reads a texture's pixels once (cached per image), downscaled to at most
 * `maxSize` on the long edge. Returns `{ data, width, height, channels }` with
 * 8-bit channels, or `null` when the pixels cannot be read.
 */
export function readTexturePixels(texture: any, { maxSize }?: {
    maxSize?: number;
}): any;
/**
 * Samples a texture at mesh UV `(u, v)` with the texture's own transform,
 * wrapping and flipY applied. Writes 0-255 RGBA into `target`.
 */
export function sampleTexturePixel(pixels: any, texture: any, u: any, v: any, target?: number[]): number[];
/**
 * Area-weighted random points on the triangles a material slot draws
 * (`materialIndex = null` for the whole geometry). Returns a Float32Array of
 * `[u, v, triangleIndex, ...]` triples — the distribution of UVs the rendered
 * surface actually samples, independent of how the atlas is laid out.
 */
export function sampleSurfaceUvs(geometry: any, { count, materialIndex, seed }?: {
    count?: number;
    materialIndex?: any;
    seed?: number;
}): any;
export function rasterizeTriangle(ax: any, ay: any, bx: any, by: any, cx: any, cy: any, width: any, height: any, visit: any): void;
