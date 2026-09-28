/**
 * Bakes the RGBA8 erosion field. Returned separately from the texture so
 * verification scripts can read the numbers without a renderer.
 */
export function createCloudErosionData({ dims, seed, }?: {
    dims?: number;
    seed?: number;
}): {
    data: Uint8Array<ArrayBuffer>;
    dims: {
        x: number;
        y: number;
        z: number;
    };
    distinctBands: number;
    fieldSeed: number;
    seed: number;
    worleyCells: any;
};
/** Bakes an uncached erosion volume. Callers own dispose(). */
export function createCloudErosionVolume({ dims, seed, }?: {
    dims?: number;
    seed?: number;
}): import("three").Data3DTexture;
/** Cached erosion volume, keyed by resolution and seed. */
export function getCloudErosionVolume({ dims, seed, }?: {
    dims?: number;
    seed?: number;
}): any;
/** Releases every cached erosion volume. */
export function disposeCloudErosionVolumes(): void;
/** Default resolution. Not tier-driven: erosion is cheap at every tier. */
export const CLOUD_EROSION_DEFAULT_DIMS: 32;
/**
 * Seed namespace for this volume's bands.
 *
 * createWorleyLadder3 seeds each band by its cell count, so a frequency is the
 * same field at every volume resolution — and, without a namespace, the same
 * field in every *volume* that requests that count. The base-shape volume's
 * ladder overlaps this plan at 4/8/16 cells, so the two combined fields became
 * strongly correlated. Carving a cloud with a copy of its own erosion basis
 * flattens the silhouette instead of tearing it, and at
 * `shape.erosionScaleBaseMultiplier = 1.0` — the top of the spec's authoring
 * range, where both volumes are read at the same tile coordinate — the two
 * fields were 0.69 correlated. Namespacing the seed drops that to ~0.
 */
export const CLOUD_EROSION_SEED_NAMESPACE: "cloud-erosion";
/** Weights the A channel packs, and the density field's own detail FBM. */
export const CLOUD_EROSION_DETAIL_WEIGHTS: readonly number[];
/**
 * Frequency plan in cells across one tile. Fixed in tile units so a custom
 * resolution re-resolves the same field rather than authoring a new one.
 */
export const CLOUD_EROSION_PLAN: Readonly<{
    cells: readonly number[];
    jitter: 1;
    texelsPerCell: 2;
}>;
