/** Seeded 3D value noise -> [-1, 1]. */
export function valueNoise3(seed: any, x: any, y: any, z: any): number;
/**
 * Fractional Brownian motion over valueNoise3, normalized by the octave
 * amplitude sum so the result stays in roughly [-1, 1] for any octave count.
 */
export function fbm3(seed: any, x: any, y: any, z: any, octaves?: number, lacunarity?: number, gain?: number): number;
/**
 * Ridged FBM: sharp creases where the underlying noise crosses zero.
 * Returns [0, 1] with 1 at the ridge lines.
 */
export function ridgedFbm3(seed: any, x: any, y: any, z: any, octaves?: number, lacunarity?: number, gain?: number): number;
