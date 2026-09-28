/**
 * Reads a texture's pixel dimensions across the shapes three.js uses:
 * `DataTexture`/`Texture` carry `image`, compressed KTX2 textures carry
 * `mipmaps[0]`, and loaders that went through `Source` carry `source.data`.
 *
 * @returns {{width: number, height: number} | null} null when undeterminable.
 */
export function resolveTextureSize(texture: any): {
    width: number;
    height: number;
} | null;
/**
 * True when a texture is too small to carry the detail its slot implies.
 *
 * Undeterminable sizes return `false` — this guard removes maps only when it
 * can prove they are degenerate, so an unusual-but-valid texture is never
 * silently dropped.
 */
export function isDegenerateDetailMap(texture: any, { minEdgeTexels, }?: {
    minEdgeTexels?: number;
}): boolean;
/**
 * Describes a texture for diagnostics without assuming it is loaded.
 */
export function describeTexture(texture: any): {
    name: any;
    resolution: string;
    uuid: any;
};
/**
 * Removes degenerate detail maps from a texture set.
 *
 * Returns a new object plus the list of rejected slots so callers can report
 * the substitution rather than hiding it — a dropped map changes the rendered
 * result and should be visible in an asset report.
 *
 * @param {Record<string, unknown>} textures
 * @param {{minEdgeTexels?: number, slots?: readonly string[]}} [options]
 * @returns {{textures: Record<string, unknown>, rejected: Array<{slot: string, reason: string, texture: object}>}}
 */
export function withoutDegenerateDetailMaps(textures: Record<string, unknown>, { minEdgeTexels, slots, }?: {
    minEdgeTexels?: number;
    slots?: readonly string[];
}): {
    textures: Record<string, unknown>;
    rejected: Array<{
        slot: string;
        reason: string;
        texture: object;
    }>;
};
/**
 * Minimum edge length, in texels, for a map to be treated as carrying detail.
 *
 * A triplanar detail map is projected at metre scale, so its texel density is
 * what produces fracture and erosion relief. Below 16x16 there is no spatial
 * frequency left to project and the map is indistinguishable from a constant.
 */
export const MIN_DETAIL_MAP_EDGE_TEXELS: 16;
/** Texture slots treated as detail maps for integrity purposes. */
export const ROCK_DETAIL_MAP_SLOTS: readonly string[];
