// Deterministic randomness for the VFX cluster. Same trio as ambientfx and
// fauna — duplicated on purpose (each cluster stays self-contained), and NOT
// re-exported from the cluster index so the root package surface doesn't
// grow another ambiguous `hashCombine`.

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

/** mulberry32 PRNG: uint32 seed -> () => [0, 1). No Math.random anywhere. */
export function mulberry32(seed) {
  let state = (Math.trunc(seed) || 1) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
