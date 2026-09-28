export function classifyAlphaSamples({ intermediate, total, transparent }: {
    intermediate: any;
    total: any;
    transparent: any;
}): "mask" | "data" | "opaque" | "unknown";
/**
 * Measures the alpha of `texture` over the surface of `geometry` drawn by the
 * slot `materialIndex` (null = whole geometry).
 */
export function measureAlphaCoverage(texture: any, geometry: any, { materialIndex, samples }?: {
    materialIndex?: any;
    samples?: number;
}): Readonly<{
    kind: "unknown";
    sampleCount: 0;
}> | {
    intermediateFraction: number;
    kind: "mask" | "data" | "opaque" | "unknown";
    sampleCount: number;
    transparentFraction: number;
};
export const ALPHA_COVERAGE_KINDS: Readonly<{
    data: "data";
    mask: "mask";
    opaque: "opaque";
    soft: "soft";
    unknown: "unknown";
}>;
