/**
 * Ordered transient layers for active water. Lower priorities establish a
 * base that higher priorities can derive from or replace. Runtime policy is
 * never serialized into a portable water preset.
 */
export const WATER_SCENE_OVERRIDE_PRIORITIES: Readonly<{
    lighting: 100;
    weather: 200;
    scene: 300;
}>;
/**
 * Authored fallback fields that a live scene may replace without editing the
 * portable water asset. Palette, wave structure, foam, and interaction
 * response remain authored settings.
 */
export const WATER_SCENE_OVERRIDE_KEYS: readonly string[];
