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
export function cloudBaseShapeDimsForMip(dims: any, level?: number): {
    x: number;
    y: number;
    z: number;
};
/**
 * Bakes the RGBA8 base-shape field. Returned separately from the texture so
 * verification scripts and headless tools can read the numbers without a
 * renderer.
 */
export function createCloudBaseShapeData({ dims, seed, }?: {
    dims?: number;
    seed?: number;
}): {
    data: Uint8Array<ArrayBuffer>;
    dims: {
        x: number;
        y: number;
        z: number;
    };
    fieldSeed: number;
    perlinPeriods: readonly any[];
    seed: number;
    levels: Uint8Array<ArrayBuffer>[];
    worleyCells: readonly number[];
};
/** Bakes an uncached base-shape volume. Callers own dispose(). */
export function createCloudBaseShapeVolume({ dims, seed, }?: {
    dims?: number;
    seed?: number;
}): import("three").Data3DTexture;
/**
 * Cached canonical base-shape volume, keyed by resolution. A tier switch that
 * returns to a resolution already baked pays nothing, and the shadow/env-map
 * bakes share the runtime's volumes.
 */
export function getCloudBaseShapeVolume({ dims, seed, }?: {
    dims?: number;
    seed?: number;
}): any;
/** Releases every cached base-shape volume. */
export function disposeCloudBaseShapeVolumes(): void;
/**
 * The master resolution the frequency plan is authored at, and the anchor mip
 * levels are measured from. Also the default when no dims are given.
 */
export const CLOUD_BASE_SHAPE_MASTER_DIM: 64;
/**
 * Hard floor for any resolved volume. Below 8³ the Worley ladder band-limits
 * every rung the erosion window reads onto one cell count, so G, B and A become
 * the same band and the three-band erosion basis the density recipe needs stops
 * existing — an honest clamp is worth more than a field-shaped 8-texel artifact.
 */
export const CLOUD_BASE_SHAPE_MIN_DIM: 8;
/**
 * Legacy namespace export retained for consumers of the discarded generator.
 * The canonical packed field does not read it.
 */
export const CLOUD_BASE_SHAPE_SEED_NAMESPACE: "cloud-base-shape";
/** Legacy export retained for consumers; the current density uses its own RGB strengths. */
export const CLOUD_BASE_SHAPE_EROSION_WEIGHTS: readonly number[];
/**
 * Frequency plan, in cells (Worley) or lattice periods (Perlin) across one
 * tile. Fixed in tile units rather than scaled per resolution: a quality tier
 * should re-resolve the same sky, not author a different one. Rungs finer than
 * the volume can carry are band-limited away inside the samplers.
 */
export const CLOUD_BASE_SHAPE_PLAN: Readonly<{
    worleyCells: readonly number[];
    worleyJitter: 1;
    worleyTexelsPerCell: 1;
}>;
