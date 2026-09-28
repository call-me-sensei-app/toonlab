/** Wraps an integer lattice coordinate into [0, period). */
export function wrapi(i: any, period: any): any;
/**
 * Largest lattice period a `dim`-texel axis can carry at `texelsPerCell`
 * samples per cell. Bands finer than this stop being a field and become hash
 * noise, so the volume bakers clamp their ladders through here instead of
 * baking aliasing that no filtering can remove.
 */
export function bandLimitPeriod(period: any, dim: any, texelsPerCell?: number): number;
/**
 * Periodic 3D gradient (Perlin) noise over a `period`³ lattice.
 * `sample(x, y, z)` takes tile coordinates and returns [-1, 1].
 */
export function createPeriodicPerlin3(seed: any, period: any): {
    period: number;
    sample(x: any, y: any, z: any): number;
};
/**
 * Periodic 3D Worley (cellular) noise over a `cells`³ lattice.
 * `sample(x, y, z)` takes tile coordinates and returns the nearest-feature
 * distance F1 in cell units, clamped to [0, 1] — 0 at a feature point, 1 in
 * the rare void. `jitter` in [0, 1] moves feature points from cell centres to
 * fully random positions.
 */
export function createPeriodicWorley3(seed: any, cells: any, jitter?: number): {
    cells: number;
    jitter: any;
    sample(x: any, y: any, z: any): number;
};
/**
 * Prebuilt Worley band ladder. `cellCounts` are requested cell counts in tile
 * units; each is band-limited against `dim` and then deduplicated, so a rung
 * that clamps onto an existing frequency shares that rung's field instead of
 * averaging a second decorrelated field at the same scale — which would wash
 * out the silhouette contrast a low tier can least afford to lose.
 *
 * Bands are seeded by their *cell count*, not their ladder index, so the same
 * frequency is the same field at every volume resolution. Switching quality
 * tiers then re-resolves the cloud field instead of reshuffling it.
 */
export function createWorleyLadder3(seed: any, cellCounts: any, { dim, jitter, texelsPerCell, }?: {
    dim?: number;
    jitter?: number;
    texelsPerCell?: number;
}): any;
/**
 * Nubis inverted-Worley FBM: three ladder rungs starting at `first`, weighted
 * 0.625/0.25/0.125 and inverted so cell interiors are bright. Returns [0, 1].
 * Rungs past the top of the ladder clamp to the top rung.
 */
export function invertedWorleyFbm3(bands: any, first: any, x: any, y: any, z: any): number;
/**
 * Periodic Perlin FBM. Octave periods are rounded to integers and each octave
 * is sampled through its own rounded period, so any lacunarity — including
 * the non-integer values the weather profile allows — still tiles exactly.
 * Octaves whose period exceeds the band limit are dropped rather than clamped
 * (an amplitude-normalized stack loses nothing by ending early, whereas a
 * clamped rung would double-weight one frequency).
 *
 * `sample(x, y, z)` takes tile coordinates and returns [-1, 1].
 */
export function createPeriodicPerlinFbm3(seed: any, { period, octaves, lacunarity, gain, dim, texelsPerCell, }?: {
    period?: number;
    octaves?: number;
    lacunarity?: number;
    gain?: number;
    dim?: number;
    texelsPerCell?: number;
}): {
    octaves: number;
    periods: number[];
    sample(x: any, y: any, z: any): number;
};
/** The canonical Nubis three-octave Worley weights. Sums to exactly 1. */
export const WORLEY_FBM_WEIGHTS: readonly number[];
