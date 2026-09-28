// Integrity checks for textures handed to the rock shader.
//
// A detail map only earns its slot if it can actually carry detail. Published
// catalog artifacts sometimes ship a placeholder in a real texture slot — a
// 4x4 normal map, for instance — which is materially worse than shipping
// nothing: the shader's own deterministic fallback is a usable surface, and a
// placeholder silently displaces it. Every consumer that harvests maps off an
// imported material needs the same predicate, so it lives here rather than in
// any one call site.
//
// This is deliberately a *resolution* test, not a content test. Reading pixels
// back is not possible for GPU-compressed formats (KTX2/Basis) without a
// decode, and resolution alone is sufficient to catch the placeholder class.

/**
 * Minimum edge length, in texels, for a map to be treated as carrying detail.
 *
 * A triplanar detail map is projected at metre scale, so its texel density is
 * what produces fracture and erosion relief. Below 16x16 there is no spatial
 * frequency left to project and the map is indistinguishable from a constant.
 */
export const MIN_DETAIL_MAP_EDGE_TEXELS = 16;

/** Texture slots treated as detail maps for integrity purposes. */
export const ROCK_DETAIL_MAP_SLOTS = Object.freeze([
  'rockNormal',
  'sandNormal',
  'sourceNormal',
  'stylizedNormal',
  'smoothness',
  'topMask',
]);

/**
 * Reads a texture's pixel dimensions across the shapes three.js uses:
 * `DataTexture`/`Texture` carry `image`, compressed KTX2 textures carry
 * `mipmaps[0]`, and loaders that went through `Source` carry `source.data`.
 *
 * @returns {{width: number, height: number} | null} null when undeterminable.
 */
export function resolveTextureSize(texture) {
  if (!texture?.isTexture) return null;
  const candidates = [
    texture.image,
    texture.source?.data,
    Array.isArray(texture.mipmaps) ? texture.mipmaps[0] : null,
  ];
  for (const candidate of candidates) {
    const width = Number(candidate?.width);
    const height = Number(candidate?.height);
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      return { width, height };
    }
  }
  return null;
}

/**
 * True when a texture is too small to carry the detail its slot implies.
 *
 * Undeterminable sizes return `false` — this guard removes maps only when it
 * can prove they are degenerate, so an unusual-but-valid texture is never
 * silently dropped.
 */
export function isDegenerateDetailMap(texture, {
  minEdgeTexels = MIN_DETAIL_MAP_EDGE_TEXELS,
} = {}) {
  const size = resolveTextureSize(texture);
  if (!size) return false;
  return size.width < minEdgeTexels || size.height < minEdgeTexels;
}

/**
 * Describes a texture for diagnostics without assuming it is loaded.
 */
export function describeTexture(texture) {
  const size = resolveTextureSize(texture);
  return {
    name: texture?.name || null,
    resolution: size ? `${size.width}x${size.height}` : 'unknown',
    uuid: texture?.uuid ?? null,
  };
}

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
export function withoutDegenerateDetailMaps(textures, {
  minEdgeTexels = MIN_DETAIL_MAP_EDGE_TEXELS,
  slots = ROCK_DETAIL_MAP_SLOTS,
} = {}) {
  const result = { ...(textures ?? {}) };
  const rejected = [];
  for (const slot of slots) {
    const texture = result[slot];
    if (!texture?.isTexture) continue;
    if (!isDegenerateDetailMap(texture, { minEdgeTexels })) continue;
    const described = describeTexture(texture);
    rejected.push({
      reason: `below the ${minEdgeTexels}x${minEdgeTexels} minimum for a detail map`,
      slot,
      texture: described,
    });
    delete result[slot];
  }
  return { rejected, textures: result };
}
