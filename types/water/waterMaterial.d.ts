/**
 * Resolves a quality request into the water shader defines
 * `{ WATER_QUALITY, WATER_DETAIL_OCTAVES, WATER_FOAM_OCTAVES }`.
 *
 * Accepts either a named tier ('low' | 'medium' | 'high', see
 * WATER_QUALITY_TIERS) or a custom tier object:
 *
 *   { detailOctaves: 5, foamOctaves: 4, qualityLevel: 'high' }
 *
 * - `qualityLevel` picks the feature gate (0/'low' = no caustics or sparkles,
 *   1/'medium' = caustics + sparkles, 2/'high' = chromatic caustics) and the
 *   octave fallbacks; it defaults to 'high'.
 * - `detailOctaves` / `foamOctaves` override the noise octave counts
 *   (clamped to 1..8 integers).
 *
 * Unknown or missing values fall back to the 'high' tier, matching the
 * previous behavior.
 *
 * @param {string|{detailOctaves?: number, foamOctaves?: number, qualityLevel?: string|number}} quality
 * @returns {{WATER_QUALITY: number, WATER_DETAIL_OCTAVES: number, WATER_FOAM_OCTAVES: number}}
 */
export function resolveWaterQualityDefines(quality: string | {
    detailOctaves?: number;
    foamOctaves?: number;
    qualityLevel?: string | number;
}): {
    WATER_QUALITY: number;
    WATER_DETAIL_OCTAVES: number;
    WATER_FOAM_OCTAVES: number;
};
export function resolveWaterDebugMode(mode: any): any;
export function setWaterDebugMode(material: any, mode: any): any;
export function applyWaterSettingsToMaterial(material: any, options?: {}): any;
export function createWaterMaterial(options?: {}): any;
export function updateWaterMaterialCamera(material: any, renderer: any, camera: any): any;
/**
 * The named water quality tiers, keyed 'low' | 'medium' | 'high'. Each tier
 * maps to the shader defines it produces:
 * `{ WATER_QUALITY, WATER_DETAIL_OCTAVES, WATER_FOAM_OCTAVES }` — see
 * resolveWaterQualityDefines for the feature gates per WATER_QUALITY level.
 * Frozen; use a custom `{ detailOctaves, foamOctaves, qualityLevel }` quality
 * object to deviate from the named tiers.
 */
export const WATER_QUALITY_TIERS: Readonly<{
    low: Readonly<{
        WATER_QUALITY: 0;
        WATER_DETAIL_OCTAVES: 2;
        WATER_FOAM_OCTAVES: 2;
    }>;
    medium: Readonly<{
        WATER_QUALITY: 1;
        WATER_DETAIL_OCTAVES: 3;
        WATER_FOAM_OCTAVES: 3;
    }>;
    high: Readonly<{
        WATER_QUALITY: 2;
        WATER_DETAIL_OCTAVES: 4;
        WATER_FOAM_OCTAVES: 3;
    }>;
}>;
