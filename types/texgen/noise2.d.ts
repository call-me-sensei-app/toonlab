/** Hashes a wrapped 2D lattice coordinate -> [0, 1). */
export function latticeHash2(seed: any, xi: any, yi: any, px: any, py: any): number;
/**
 * Periodic 2D value noise -> [-1, 1].
 * x/y are lattice-space coordinates; px/py are integer periods >= 1.
 */
export function periodicValue2(seed: any, x: any, y: any, px: any, py: any): number;
/**
 * Periodic 2D gradient (Perlin) noise -> [-1, 1].
 * Sharper, less blocky than value noise; the go-to base for fbm.
 */
export function periodicPerlin2(seed: any, x: any, y: any, px: any, py: any): number;
/**
 * Periodic fractal Brownian motion -> [-1, 1] (amplitude-normalized).
 * Lacunarity is fixed at 2 so every octave keeps an integer period.
 */
export function periodicFbm2(seed: any, x: any, y: any, px: any, py: any, octaves?: number, gain?: number): number;
/** Periodic turbulence (sum of |perlin|) -> [0, 1]. Cloudy, creased. */
export function periodicTurbulence2(seed: any, x: any, y: any, px: any, py: any, octaves?: number, gain?: number): number;
/**
 * Periodic ridged multifractal -> [0, 1]. Sharp crests (rock, bark,
 * hammered metal). Octave weights follow the classic ridge feedback.
 */
export function periodicRidged2(seed: any, x: any, y: any, px: any, py: any, octaves?: number, gain?: number): number;
/** Periodic billow (|fbm| creases inverted to puffs) -> [-1, 1]. */
export function periodicBillow2(seed: any, x: any, y: any, px: any, py: any, octaves?: number, gain?: number): number;
/**
 * Periodic Worley/cellular noise. Returns { f1, f2, id } where f1/f2 are
 * the nearest/second-nearest feature distances (normalized so a typical
 * cell interior spans ~[0, 1]) and id is a stable uint32 for the owning
 * cell (per-cell colors, brick tints).
 */
export function periodicCellular2(seed: any, x: any, y: any, px: any, py: any, jitter?: number): {
    f1: number;
    f2: number;
    id: number;
};
/**
 * Periodic domain-warp offset pair -> two decorrelated fbm channels in
 * [-1, 1]. Feed the result back into any periodic sampler: because the
 * offsets themselves tile with (px, py), the warped field still tiles.
 */
export function periodicWarp2(seed: any, x: any, y: any, px: any, py: any, octaves?: number): {
    wx: number;
    wy: number;
};
