/** Resolves a built-in palette by id, or accepts one of the catalog entries. */
export function resolveGrassColorPalette(paletteOrId: any): any;
/** Returns a new settings object with only the coordinated paint trio replaced. */
export function applyGrassColorPalette(settings: {}, paletteOrId: any): {
    baseColor: any[];
    shadowTint: any[];
    tipColor: any[];
};
/** Infers the active palette from all three colors; no palette id is persisted. */
export function matchGrassColorPalette(settings: any, epsilon?: number): Readonly<{
    baseColor: readonly number[];
    description: any;
    id: any;
    label: any;
    shadowTint: readonly number[];
    tipColor: readonly number[];
}>;
/**
 * Built-in grass paint palettes. Values are sRGB triplets because
 * StylizedGrassField uploads grass colors with THREE.SRGBColorSpace.
 */
export const GRASS_COLOR_PALETTES: readonly Readonly<{
    baseColor: readonly number[];
    description: any;
    id: any;
    label: any;
    shadowTint: readonly number[];
    tipColor: readonly number[];
}>[];
