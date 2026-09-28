/**
 * Resolves a named tier or a custom `{ cloudOctaves }` build policy. Cloud
 * FBM loops are unrolled, so changing quality requires a material rebuild.
 */
export function resolveSkyQuality(value?: string): any;
/** Compile-time Sky deployment tiers. They never enter portable art presets. */
export const SKY_QUALITY_TIERS: Readonly<{
    low: Readonly<{
        cloudOctaves: 2;
        id: "low";
    }>;
    medium: Readonly<{
        cloudOctaves: 3;
        id: "medium";
    }>;
    high: Readonly<{
        cloudOctaves: 4;
        id: "high";
    }>;
}>;
export const SKY_QUALITY_OPTIONS: readonly string[];
