// Surface completion for official catalog rocks.
//
// Published catalog rock artifacts carry geometry, an albedo and an ORM, but
// they do not carry everything the rock shader can use. In 0.4.22 every cliff
// asset ships a 4x4 placeholder in the normal slot, ships no coverage mask,
// and ships `moss.enabled: false` regardless of a `moss-lichen` surface
// taxonomy. A consumer who places three catalog rocks therefore gets three
// flat, mossless rocks whose surfaces are keyed to geology rather than to the
// individual asset — and any two of the same geology render identically.
//
// This module supplies the missing half, deterministically:
//
//   * which detail maps a geology needs, so an application can resolve them
//     from wherever it keeps texture content (the package ships none);
//   * per-asset moss/lichen parameters derived from a variation index, so
//     several rocks of one family do not read as one rock repeated;
//   * optional palette harmonization, so a set spanning multiple geologies
//     stays in one value family instead of mixing warm and cool stone.
//
// It intentionally resolves no URLs and loads nothing. Texture content is
// application-owned; the geology-to-slot mapping and the parameter derivation
// are the parts that belong in the package.

/** Geologies the published rock catalog uses. */
export const CATALOG_ROCK_GEOLOGIES = Object.freeze([
  'alpine-granite',
  'blocky-granite',
  'columnar-basalt',
  'layered-sandstone',
  'sharp-karst',
  'weathered-limestone',
]);

/**
 * Detail maps each geology wants but the artifact does not embed, keyed by
 * rock-shader texture slot. Values are stable content names, not paths — an
 * application maps them onto its own asset layout.
 */
export const CATALOG_ROCK_DETAIL_MAPS = Object.freeze(
  Object.fromEntries(CATALOG_ROCK_GEOLOGIES.map((geology) => [
    geology,
    Object.freeze({ rockNormal: `rock-${geology}-normal` }),
  ])),
);

/**
 * Reviewed per-geology tint shipped in catalog `material-config.json`.
 * Reproduced here so harmonization has a documented starting point.
 */
export const CATALOG_ROCK_GEOLOGY_TINTS = Object.freeze({
  'alpine-granite': Object.freeze([0.9376, 0.9584, 1]),
  'blocky-granite': Object.freeze([0.9624, 0.9736, 1]),
  'columnar-basalt': Object.freeze([0.8892, 0.9204, 1]),
  'layered-sandstone': Object.freeze([1, 0.72, 0.58]),
  'sharp-karst': Object.freeze([0.831, 0.8964, 1]),
  'weathered-limestone': Object.freeze([1, 1, 0.9876]),
});

/**
 * Reference pairing for projection scale: a 5.94 m cliff reads correctly at a
 * 26 m triplanar period. Everything else is derived from this ratio.
 */
export const CATALOG_ROCK_PROJECTION_REFERENCE = Object.freeze({
  period: 26,
  size: 5.94,
});

/**
 * World-space triplanar period for an asset of a given size.
 *
 * The rock shader's projection period is absolute metres, so a value tuned for
 * a 4-6 m cliff is not a value that suits a 0.5 m stepping stone: the small
 * asset samples a proportionally tinier patch of the map and its surface reads
 * as a flat wash with one low-frequency blob drifting across it. Scale-aware
 * derivation keeps the *texel density* constant instead of the period, which is
 * what actually makes stone of different sizes look like the same rock type.
 *
 * This is the package-side answer to D19-031, which recorded that the shipped
 * projection default is not asset-scale aware.
 *
 * @param {object} options
 * @param {number|number[]} [options.size]  Largest dimension in metres, or a bounds triple.
 * @param {number} [options.min]            Floor, metres.
 * @param {number} [options.max]            Ceiling, metres.
 * @returns {number} projection period in metres.
 */
export function resolveCatalogRockProjectionScale({
  size = CATALOG_ROCK_PROJECTION_REFERENCE.size,
  min = 1.5,
  max = 64,
} = {}) {
  const largest = Array.isArray(size)
    ? Math.max(...size.map((value) => Math.abs(Number(value) || 0)))
    : Math.abs(Number(size) || 0);
  if (!(largest > 0)) return CATALOG_ROCK_PROJECTION_REFERENCE.period;
  const ratio = CATALOG_ROCK_PROJECTION_REFERENCE.period
    / CATALOG_ROCK_PROJECTION_REFERENCE.size;
  return Math.min(max, Math.max(min, largest * ratio));
}

function clamp01(value) {
  return Math.min(1, Math.max(0, Number(value) || 0));
}

function clampRange(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Small integer hash. Deterministic and well-spread for the tiny variation
 * indices a scene actually uses, so two adjacent indices do not produce two
 * nearly identical surfaces.
 */
function variationHash(variation, salt) {
  let hash = (Math.trunc(Number(variation) || 0) * 2654435761) ^ (salt * 40503);
  hash = Math.imul(hash ^ (hash >>> 15), 2246822507);
  hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
}

/** Signed jitter in [-amount, +amount], deterministic per (variation, salt). */
function jitter(variation, salt, amount) {
  return ((variationHash(variation, salt) * 2) - 1) * amount;
}

function mixColor(from, to, amount) {
  const t = clamp01(amount);
  return Object.freeze([0, 1, 2].map((i) => clamp01(from[i] + ((to[i] - from[i]) * t))));
}

/**
 * Resolves a geology's tint, optionally pulled toward a palette anchor.
 *
 * A rock set that spans geologies inherits their separate tints, which is
 * correct for a geological survey and wrong for a single location — a cool
 * blue-grey cliff beside two warm limestone ones reads as two different
 * worlds. `harmonize` is the dial between "catalog-faithful" (0) and "one
 * palette" (1).
 */
export function resolveCatalogRockTint({
  geology,
  anchor = null,
  harmonize = 0,
  tint = null,
} = {}) {
  if (Array.isArray(tint)) return Object.freeze(tint.slice(0, 3).map(clamp01));
  const base = CATALOG_ROCK_GEOLOGY_TINTS[geology] ?? Object.freeze([1, 1, 1]);
  if (!Array.isArray(anchor) || harmonize <= 0) return base;
  return mixColor(base, anchor.slice(0, 3).map(clamp01), harmonize);
}

/**
 * Deterministic moss/lichen parameters for one asset.
 *
 * The rock shader drives moss coverage from the luminance of the projected
 * moss texture times an upward-slope mask — there is no UV coverage mask to
 * author. Per-asset variety therefore comes from the projection size and the
 * coverage gain/threshold, jittered per variation index, combined with the
 * per-variation moss texture the shader runtime generates.
 *
 * Base values follow the `call_me_sensei` moss response; only the spread is
 * derived here.
 */
export function createCatalogRockMossSettings({
  variation = 0,
  coverage = 1,
  enabled = true,
  gain = 5.2,
  palette = null,
  size = Number.NaN,
  roughness = -1,
  relief = 0,
  fringe = 0,
  fringeScale = 0.35,
  formDriven = 0,
} = {}) {
  if (!enabled) return Object.freeze({ enabled: false });
  const strength = clamp01(coverage);
  // A moss palette is a property of the *plant*, not of the rock it grows on.
  // When a scene paints moss from several shaders — a moss bed, moss on stone,
  // moss in a paving joint — each picking its own green makes the moss change
  // species at every material boundary. Callers pass one shared stop list and
  // the low/high pair is read from it rather than eyeballed.
  const stops = Array.isArray(palette) && palette.length >= 2
    ? palette.filter((stop) => Array.isArray(stop) && stop.length >= 3)
    : null;
  const paletteSettings = stops && stops.length >= 2
    ? {
      // Deep shade value and lit-crown value: the moss ramp's working range,
      // not its extremes, so the darkest stop stays available to shadow.
      lowColor: Object.freeze(stops[Math.min(1, stops.length - 1)].slice(0, 3).map(clamp01)),
      highColor: Object.freeze(
        stops[Math.min(3, stops.length - 1)].slice(0, 3).map(clamp01),
      ),
    }
    : {};
  return Object.freeze({
    enabled: true,
    ...paletteSettings,
    // Off by default (-1 / 0) so an existing caller's look is untouched.
    roughness: Number.isFinite(roughness) ? roughness : -1,
    relief: clamp01(relief),
    fringe: clamp01(fringe),
    formDriven: clamp01(formDriven),
    fringeScale: clampRange(Number(fringeScale) || 0.35, 0.02, 1),
    // Projection size drives the shape of the patches. Spreading it is what
    // stops two rocks from wearing the same moss pattern at the same scale.
    //
    // It is also an ABSOLUTE world period, so — exactly like the base
    // projection in `resolveCatalogRockProjectionScale` — the tuned 18 m
    // means something different on every asset that is not cliff-sized. A
    // 1.3 m boulder samples 7% of the moss map at 18 m and comes out wearing
    // one or two isolated blobs rather than coverage, which reads as lichen
    // spots painted on. `size` lets a caller hold the sampled FRACTION
    // constant instead of the period. See D19-192.
    size: clampRange(
      (Number.isFinite(size) ? size : 18) + jitter(variation, 1, 6),
      0.05,
      50,
    ),
    sharpness: clampRange(1.92 + jitter(variation, 2, 0.34), 0, 8),
    // Threshold where moss starts on an upward face. Lower means moss creeps
    // further down the vertical faces.
    offset: clampRange(-0.15 + jitter(variation, 3, 0.12), -1, 1),
    // Coverage gain. The shader squares `luminance(moss) * multiply * slope`,
    // and a real moss albedo is dark — the shipped moss layer has a linear
    // luminance near 0.13, so the preset's 1.94 resolves to about 5% coverage
    // and reads as no moss at all (D19-032). Gain has to clear that before
    // `coverage` behaves like a 0..1 dial.
    // 5.2 makes `coverage` a 0..1 dial for INCIDENTAL weathering. A scene
    // where moss is a hero material — a garden, where it is the dominant
    // colour field — needs a higher gain before `coverage` spans the range
    // that matters, because the shader squares the product and the shipped
    // moss albedo is dark (D19-032).
    multiply: clampRange((gain * strength) + jitter(variation, 4, 0.55), 0, gain * 1.2),
    colorPower: clampRange(1.3 + jitter(variation, 5, 0.18), 0.05, 8),
  });
}

/**
 * Builds the settings patch and texture-slot requirements that complete a
 * catalog rock's surface.
 *
 * @param {object} options
 * @param {string} options.geology            Catalog taxonomy geology.
 * @param {number} [options.variation]        Per-asset index; equal indices give equal surfaces.
 * @param {boolean} [options.moss]            Enable slope-aware moss.
 * @param {number} [options.mossCoverage]     0..1 scale on moss coverage gain.
 * @param {number[]} [options.paletteAnchor]  RGB the set's tints are pulled toward.
 * @param {number} [options.harmonize]        0..1 strength of that pull.
 * @param {number[]} [options.tint]           Explicit tint, wins over harmonization.
 * @param {number[][]} [options.mossPalette]  Shared moss colour stops (see `createCatalogRockMossSettings`).
 * @param {number} [options.mossGain]         Coverage gain; raise where moss is a hero material.
 * @param {number} [options.mossSize]         Moss projection period, metres; derive from asset size.
 * @param {number} [options.mossRoughness]    Roughness under full moss; -1 leaves stone roughness.
 * @param {number} [options.mossRelief]       0..1 flattening of rock relief under moss.
 * @param {number} [options.mossFringe]       0..1 ragged break-up of the coverage boundary.
 * @returns {{settings: object, requiredTextures: object, geology: string, variation: number}}
 */
export function createCatalogRockSurface({
  geology,
  variation = 0,
  moss = true,
  mossCoverage = 1,
  paletteAnchor = null,
  harmonize = 0,
  tint = null,
  mossGain = 5.2,
  mossPalette = null,
  mossSize = Number.NaN,
  mossRoughness = -1,
  mossRelief = 0,
  mossFringe = 0,
  mossFormDriven = 0,
} = {}) {
  const index = Math.trunc(Number(variation) || 0);
  return Object.freeze({
    geology,
    requiredTextures: CATALOG_ROCK_DETAIL_MAPS[geology] ?? Object.freeze({}),
    settings: Object.freeze({
      material: Object.freeze({
        tint: resolveCatalogRockTint({ anchor: paletteAnchor, geology, harmonize, tint }),
      }),
      moss: createCatalogRockMossSettings({
        coverage: mossCoverage,
        enabled: moss,
        formDriven: mossFormDriven,
        fringe: mossFringe,
        gain: mossGain,
        palette: mossPalette,
        size: mossSize,
        relief: mossRelief,
        roughness: mossRoughness,
        variation: index,
      }),
    }),
    variation: index,
  });
}
