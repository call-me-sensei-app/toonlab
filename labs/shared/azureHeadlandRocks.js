// Azure Headland cliff set — the three §6.3 rocks and everything needed to
// render their completed surfaces.
//
// Selection and measured evidence: `launch-plan/review/cliff-asset-reselection.md`.
// Developer ruling D-009 amended §6.3 from `cliff-corner-kit` to `cliff-corner`;
// D-010 harmonizes the sharp-karst tint into the warm coastal palette.
//
// The catalog artifacts are immutable and are never edited. Everything here is
// the completion layer that ToonLab applies on top of them:
// `createCatalogRockSurface` derives the per-asset settings, and the texture
// URLs below resolve the detail maps the artifacts omit.

import {
  createCatalogRockSurface,
  resolveCatalogRockProjectionScale,
} from '../../src/catalog/officialCatalogRockSurfaces.js';

/** Warm pale limestone. §10.2's coastal palette anchor for stone. */
export const COASTAL_STONE_ANCHOR = Object.freeze([1, 1, 0.9876]);

const ROCK_ROOT = '/assets-local/launch-world/rocks';
const TEXTURE_ROOT = '/assets-local/rock-textures';

/**
 * Detail maps the catalog does not embed, resolved to repo content.
 * Both geologies currently resolve to the same source file — the package ships
 * four distinct normal maps across six geologies (see D19-010).
 */
export const ROCK_DETAIL_MAP_URLS = Object.freeze({
  'rock-sharp-karst-normal': `${TEXTURE_ROOT}/rock-sharp-karst-normal.png`,
  'rock-weathered-limestone-normal': `${TEXTURE_ROOT}/rock-weathered-limestone-normal.png`,
});

/**
 * Base maps the catalog's own `material-config.json` points at. The GLB embeds
 * KTX2 copies, but the artifact only ever exposes them through the imported
 * material at `sourceAlbedoStrength`; binding the source PNGs as the projected
 * base is what the material config intends and what the Pro path loads.
 */
const CANDIDATE_ROOT = '/assets-local/rock-texture-candidates';
export const ROCK_BASE_MAP_URLS = Object.freeze({
  // The candidates' `rock-roughness.png` is a constant 230 across every texel,
  // so binding it as a smoothness texture adds nothing over the scalar. Left
  // unbound deliberately — see D19-034.
  'sharp-karst': Object.freeze({
    rock: `${CANDIDATE_ROOT}/rocks-sharp-karst-subtle-v2/rock-albedo.png`,
  }),
  'weathered-limestone': Object.freeze({
    rock: `${CANDIDATE_ROOT}/rocks-weathered-limestone-subtle-v2/rock-albedo.png`,
  }),
});

export const MOSS_ALBEDO_URL = `${TEXTURE_ROOT}/layer-moss-albedo.png`;

/**
 * World-space projection period for the base and detail maps, in metres.
 *
 * The `call_me_sensei` default is 48 m, tuned against the licensed
 * mountain-scale reference meshes. A 4–6 m catalog cliff samples only ~8% of
 * the map at that period, which magnifies low-frequency blobs into the
 * silhouette instead of reading as stone. Tuned against shot S08's 85 mm
 * close-up, where the period controls whether the surface reads as bedded
 * limestone or as crumpled foil. See D19-031.
 */
export const FORMATION_PROJECTION_SCALE = 26;

/**
 * Role-ordered so index 0 is the primary headland edge. `variation` is the
 * per-asset decorrelation index and must stay stable — changing it changes the
 * rendered surface and invalidates captured evidence.
 */
export const AZURE_HEADLAND_ROCKS = Object.freeze([
  Object.freeze({
    cluster: 'headland-north',
    geology: 'weathered-limestone',
    id: 'rock-0119',
    label: 'Cliff Corner 8',
    // Measured LOD0 bounds, metres (width x height x depth).
    measured: Object.freeze([4.25968, 5.93778, 3.7944]),
    mossCoverage: 0.85,
    profileId: 'shape-132',
    role: 'ROCK-COAST-01',
    triangles: 4006,
    url: `${ROCK_ROOT}/rock-0119/rock.glb`,
    use: 'Primary headland edge',
    variation: 0,
  }),
  Object.freeze({
    cluster: 'headland-south',
    geology: 'sharp-karst',
    id: 'rock-0111',
    label: 'Cliff Corner 6',
    measured: Object.freeze([4.55026, 4.43142, 4.73387]),
    // Karst reads drier than the limestone it sits beside; less moss keeps the
    // two limestone rocks reading as the mossy pair rather than all three
    // wearing the same coverage.
    mossCoverage: 0.55,
    profileId: 'shape-124',
    role: 'ROCK-COAST-02',
    triangles: 3292,
    url: `${ROCK_ROOT}/rock-0111/rock.glb`,
    use: 'Secondary cliff turn',
    variation: 1,
  }),
  Object.freeze({
    cluster: 'headland-north',
    geology: 'weathered-limestone',
    id: 'rock-0281',
    label: 'Cliff Corner 7',
    measured: Object.freeze([4.21991, 3.69424, 4.56815]),
    // The low broad shelf sits closest to the waterline, so it carries the
    // most moss — and this is the asset that shares an albedo with rock-0119.
    mossCoverage: 1,
    profileId: 'shape-108',
    role: 'ROCK-COAST-03',
    triangles: 1586,
    url: `${ROCK_ROOT}/rock-0281/rock.glb`,
    use: 'Long shoreline transition',
    variation: 2,
  }),
]);

/**
 * Flattening applied to the projected detail normal.
 *
 * The repo's rock normal maps are full-amplitude — red and green span the
 * whole 0–254 range, i.e. near-vertical slopes everywhere. At the preset's
 * `nearFlatten: 0` those slopes shade to black under a directional key and the
 * rock reads as mottled soot rather than stone. See D19-033.
 */
export const FORMATION_NORMAL_FLATTEN = 0.93;

/**
 * Resolves one rock's completed surface: the rock-shader settings patch plus
 * the detail-map URLs an application must load for it.
 *
 * @param {object} rock         An `AZURE_HEADLAND_ROCKS` entry.
 * @param {object} [options]
 * @param {boolean} [options.moss]       Enable slope-aware moss.
 * @param {boolean} [options.harmonize]  Apply the D-010 palette harmonization.
 * @param {number} [options.mossCoverage] Override the asset's own coverage.
 *   Stillwater Garden (doc 20) places the same three assets in five roles that
 *   differ by how damp they are — a cascade stone and a gravel-sea island are
 *   not the same surface — so coverage becomes a per-ROLE property there while
 *   staying a per-ASSET property for the coastal set.
 * @param {number} [options.variation]   Override the decorrelation index. The
 *   asset default must not be renumbered (it keys the captured evidence);
 *   pass an explicit value when one asset appears in several roles at once.
 */
export function resolveRockSurface(rock, {
  moss = true,
  // REVERTED. D-010 harmonized `rock-0111`'s shipped sharp-karst tint
  // `[0.831, 0.8964, 1]` onto the coastal anchor, and that ruling is
  // overridden: a shipped `call_me_sensei` value is not ours to re-author, no
  // matter how well the harmonized version reads. The asset now renders with
  // the tint the catalog publishes.
  //
  // The finding stands and is recorded as D19-190 — the cool karst genuinely
  // does not sit in the same value family as the two limestone rocks beside
  // it. A scene that needs the harmonized look passes `harmonize: 1`
  // explicitly, scene-side, exactly as `stillwaterGardenStones.js` does.
  harmonize = false,
  mossCoverage = null,
  variation = null,
  // Derived per asset from its measured bounds rather than fixed, so texel
  // density stays constant across stone of different sizes (D19-031). The
  // 5.94 m hero cliff still resolves to the reviewed 26 m; smaller stone no
  // longer wears a landscape-scale projection. Pass a number to override.
  projectionScale = null,
  normalFlatten = FORMATION_NORMAL_FLATTEN,
} = {}) {
  const resolvedProjectionScale = Number.isFinite(projectionScale)
    ? projectionScale
    : resolveCatalogRockProjectionScale({ size: rock.measured });
  const surface = createCatalogRockSurface({
    geology: rock.geology,
    harmonize: harmonize ? 1 : 0,
    moss,
    mossCoverage: Number.isFinite(mossCoverage) ? mossCoverage : rock.mossCoverage,
    paletteAnchor: COASTAL_STONE_ANCHOR,
    variation: Number.isFinite(variation) ? Math.trunc(variation) : rock.variation,
  });
  const textureUrls = { ...(ROCK_BASE_MAP_URLS[rock.geology] ?? {}) };
  for (const [slot, name] of Object.entries(surface.requiredTextures)) {
    const url = ROCK_DETAIL_MAP_URLS[name];
    if (url) textureUrls[slot] = url;
  }
  return {
    ...surface,
    settings: {
      ...surface.settings,
      normals: { nearFlatten: normalFlatten },
      projection: { scale: resolvedProjectionScale },
    },
    textureUrls,
  };
}
