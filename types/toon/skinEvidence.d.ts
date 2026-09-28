/** sRGB components in 0–1. */
export function isSkinLikeColor(r: any, g: any, b: any): boolean;
/**
 * Fraction of the material's visible surface (resolved base colour × texture ×
 * vertex colour) that reads as skin. An unreadable texture counts as absent,
 * as it does when the material is converted.
 */
export function measureSkinEvidence(mat: any, geometry: any, { materialIndex, samples }?: {
    materialIndex?: any;
    samples?: number;
}): {
    fraction: number;
    sampleCount: number;
};
