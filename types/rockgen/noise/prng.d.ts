/** Chris Wellons' lowbias32: uint32 -> well-mixed uint32. */
export function lowbias32(x: any): number;
/** Mixes two uint32 seeds into one (order-sensitive). */
export function hashCombine(a: any, b: any): number;
/** Hashes a 3D integer lattice coordinate under a seed -> uint32. */
export function hash3u(seed: any, xi: any, yi: any, zi: any): number;
/** Hashes a 3D integer lattice coordinate under a seed -> [0, 1). */
export function hash3f(seed: any, xi: any, yi: any, zi: any): number;
/**
 * sfc32 PRNG for sequential draws (piece placement jitter, preset scatter).
 * Returns a function yielding floats in [0, 1). Seed all four words for a
 * healthy state; hashSeeds(seed) below does that from one uint32.
 */
export function sfc32(a: any, b: any, c: any, d: any): () => number;
/** Builds an sfc32 generator from a single uint32 seed. */
export function createRandom(seed: any): () => number;
