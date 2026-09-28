// Tiny shared math for the effect builders. Every builder in effects/ is a
// PURE function of (settings, rng, spawn options, clock) → backbone records,
// so the verify script exercises them in Node with no renderer; keep it that
// way — no THREE, no TSL, no Date/Math.random in this folder.

/** Linear interpolation. */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Uniform point on the unit sphere from two rng draws. */
export function randUnitVector(rng) {
  const z = rng() * 2 - 1;
  const theta = rng() * Math.PI * 2;
  const r = Math.sqrt(Math.max(1 - z * z, 0));
  return [r * Math.cos(theta), z, r * Math.sin(theta)];
}

/** Per-particle color variation: scales the whole rgb by 1 ± amount. */
export function jitterColor(rgb, rng, amount = 0.08) {
  const scale = 1 + (rng() * 2 - 1) * amount;
  return [rgb[0] * scale, rgb[1] * scale, rgb[2] * scale];
}

/** Normalizes a [x, y, z] array; falls back to +Y for degenerate input. */
export function normalized(v, fallback = [0, 1, 0]) {
  const x = Number(v?.[0]) || 0;
  const y = Number(v?.[1]) || 0;
  const z = Number(v?.[2]) || 0;
  const len = Math.hypot(x, y, z);
  return len > 1e-6 ? [x / len, y / len, z / len] : [...fallback];
}

/** Merges per-spawn overrides over a settings group (shallow — look knobs). */
export function withOverrides(group, overrides) {
  return overrides && typeof overrides === 'object' ? { ...group, ...overrides } : group;
}
