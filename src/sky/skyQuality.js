const TIERS = Object.freeze({
  low: Object.freeze({ cloudOctaves: 2, id: 'low' }),
  medium: Object.freeze({ cloudOctaves: 3, id: 'medium' }),
  high: Object.freeze({ cloudOctaves: 4, id: 'high' }),
});

/** Compile-time Sky deployment tiers. They never enter portable art presets. */
export const SKY_QUALITY_TIERS = TIERS;
export const SKY_QUALITY_OPTIONS = Object.freeze(Object.keys(TIERS));

/**
 * Resolves a named tier or a custom `{ cloudOctaves }` build policy. Cloud
 * FBM loops are unrolled, so changing quality requires a material rebuild.
 */
export function resolveSkyQuality(value = 'high') {
  if (value && typeof value === 'object') {
    const fallback = TIERS[String(value.id ?? value.quality ?? '').toLowerCase()] ?? TIERS.high;
    const requested = Number(value.cloudOctaves);
    const cloudOctaves = Number.isFinite(requested)
      ? Math.min(5, Math.max(1, Math.round(requested)))
      : fallback.cloudOctaves;
    const named = Object.values(TIERS).find((tier) => tier.cloudOctaves === cloudOctaves);
    return Object.freeze({ cloudOctaves, id: named?.id ?? 'custom' });
  }
  return TIERS[String(value ?? '').toLowerCase()] ?? TIERS.high;
}
