// Deterministic integer hashing for all rockgen randomness. Every
// generation-time random value flows through these functions — no
// Math.random, and nothing here calls transcendental Math functions whose
// rounding may vary between JS engines — so the same document produces
// bit-identical geometry on every run (verified by scripts/verify-rockgen.mjs).

/** Chris Wellons' lowbias32: uint32 -> well-mixed uint32. */
export function lowbias32(x) {
  let h = x >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** Mixes two uint32 seeds into one (order-sensitive). */
export function hashCombine(a, b) {
  return lowbias32((a >>> 0) ^ (Math.imul(b >>> 0, 0x9e3779b9) >>> 0));
}

/** Hashes a 3D integer lattice coordinate under a seed -> uint32. */
export function hash3u(seed, xi, yi, zi) {
  let h = seed >>> 0;
  h = (h ^ (Math.imul(xi | 0, 0x8da6b343) >>> 0)) >>> 0;
  h = (h ^ (Math.imul(yi | 0, 0xd8163841) >>> 0)) >>> 0;
  h = (h ^ (Math.imul(zi | 0, 0xcb1ab31f) >>> 0)) >>> 0;
  return lowbias32(h);
}

/** Hashes a 3D integer lattice coordinate under a seed -> [0, 1). */
export function hash3f(seed, xi, yi, zi) {
  return hash3u(seed, xi, yi, zi) / 4294967296;
}

/**
 * sfc32 PRNG for sequential draws (piece placement jitter, preset scatter).
 * Returns a function yielding floats in [0, 1). Seed all four words for a
 * healthy state; hashSeeds(seed) below does that from one uint32.
 */
export function sfc32(a, b, c, d) {
  let sa = a >>> 0;
  let sb = b >>> 0;
  let sc = c >>> 0;
  let sd = d >>> 0;
  return function next() {
    const t = (sa + sb + sd) >>> 0;
    sd = (sd + 1) >>> 0;
    sa = sb ^ (sb >>> 9);
    sb = (sc + (sc << 3)) >>> 0;
    sc = ((sc << 21) | (sc >>> 11)) >>> 0;
    sc = (sc + t) >>> 0;
    return t / 4294967296;
  };
}

/** Builds an sfc32 generator from a single uint32 seed. */
export function createRandom(seed) {
  const s = seed >>> 0;
  const random = sfc32(lowbias32(s), lowbias32(s + 1), lowbias32(s + 2), lowbias32(s + 3));
  // sfc32 needs a few warm-up rounds before the state is well mixed.
  for (let i = 0; i < 8; i += 1) random();
  return random;
}
