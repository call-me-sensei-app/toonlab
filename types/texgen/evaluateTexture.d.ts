export function srgbToLinear(c: any): number;
export function linearToSrgb(c: any): number;
/**
 * Bakes every map for `settings` at `size`x`size`. Async and cancellable:
 * returns null when `shouldCancel()` goes true mid-bake. Pass the previous
 * result as `target` to reuse its buffers (same size only).
 *
 * Returns { size, albedo, heightBytes, normal, roughness, metalness, ao,
 * orm, emissive, height (Float32), emissiveEnabled, ms }.
 */
export function evaluateTextureMaps(rawSettings: any, { size, target, onProgress, shouldCancel, imagePixels, imageParams, }?: {
    size?: number;
    target?: any;
    onProgress?: any;
    shouldCancel?: any;
    imagePixels?: any;
    imageParams?: any;
}): Promise<any>;
/**
 * Any bitmap -> a complete tiling toon PBR material. `imagePixels` is
 * decoded RGBA ({ data, width, height }); decode stays the caller's job so
 * this works headless. `params` are DEFAULT_TEXTURE_IMAGE_PARAMS overrides
 * (seamless, heightDetail, heightBase, bands) and `settings` any partial
 * texture settings for the grade/surface/overlay stages on top.
 */
export function imageToTextureMaps(imagePixels: any, { params, settings, size, target, onProgress, shouldCancel, }?: {
    params?: {};
    settings?: {};
    size?: number;
    target?: any;
    onProgress?: any;
    shouldCancel?: any;
}): Promise<any>;
export const DEFAULT_TEXTURE_IMAGE_PARAMS: Readonly<{
    bands: 0;
    heightBase: 0.35;
    heightDetail: 0.65;
    seamless: true;
}>;
export const TEXTURE_MAP_IDS: readonly string[];
