// Stillwater Garden — the launch scene's stone.
//
// Spec: launch-plan/20-stillwater-garden-scene-brief.md §1 (rock is the hero),
// §2 (five-band layering, colour structure) and §3 (ToonLab-owned ledger).
// Selection evidence: launch-plan/review/garden-stone-selection.md
// Supersedes, for this scene only: labs/shared/azureHeadlandRocks.js, which
// remains correct for the coastal headland it was selected for.
//
// WHY THIS FILE EXISTS
//
// The garden was assembled from the Azure Headland cliff set scaled to
// 0.16-0.44. That set is the `cliff-corner` family, and `cliff-corner` is a
// TILING KIT: flat cut faces and right-angle corners are what tiling requires,
// so they are a feature of the family rather than a defect in any asset. At
// garden size those features read as breeze blocks (D19-090, escalating
// D19-015). No scene-side placement change and no shader parameter fixes it —
// it is asset form, and the fix is different assets.
//
// A Japanese garden wants the opposite: rounded, weathered, settled boulders
// with soft convex form, no cut faces, no right angles, and an irregular
// organic silhouette.
//
// WHAT THE RE-TRIAGE FOUND
//
// All 480 first-party rocks across 35 families were re-scored for FORM rather
// than for family name, using the generator parameters the catalog publishes
// (`erosion`, `fracture`, `strata`) and confirmed against 4-view turntables.
// Two findings drive this file:
//
//   * FORM IS AVAILABLE. `rounded-boulder` (17 assets / 11 profiles) and
//     `flat-shelf` (16 / 11) are genuinely rounded, convex and cut-face-free
//     at 1.2-2.6 m. They needed no authoring. Family name is NOT a guide —
//     `river-worn-rock`, which sounds exactly right, contains flat-topped cut
//     wedges and orange tree-stump forms, and every `layered-sandstone` asset
//     renders terracotta and is rejected on hue (D19-034 confirmed again).
//
//   * DENSITY IS NOT. These families ship 120-462 triangles at LOD0, against
//     1,586-4,006 for the cliff families — the catalog spent its density
//     budget on landmark scale. 120 triangles is HALF the `cliff-corner-kit`
//     count that was rejected outright for "generic low-poly appearance"
//     (D19-091). Left alone they read as faceted lumps at the garden's close
//     camera.
//
// Density is closed procedurally rather than by authoring new assets:
// `applyRockGeometryDetail` subdivides and displaces with an fBm field keyed
// to the variation index, and `resolveRockGeometryDetailForSize` scales the
// displacement to the asset so a 1.3 m boulder does not wear a 6 m cliff's
// relief. Nothing here edits a catalog artifact, spends a credit, or creates a
// second identity for a published asset.

import {
  createCatalogRockSurface,
  resolveCatalogRockProjectionScale,
} from '../../src/catalog/officialCatalogRockSurfaces.js';
import { resolveRockGeometryDetailForSize } from '../../src/rock-shader/rockGeometryDetail.js';
import { GARDEN_MOSS_STOPS } from '../../scripts/launch-world-material-set.mjs';

/**
 * The garden's stone palette anchor.
 *
 * NOT the coastal `[1, 1, 0.9876]`. The catalog's own geology tints are all
 * near-white (0.89-1.0 on every channel) and the candidate albedos are nearly
 * constant, so a near-white anchor on top of them is what made the first pass
 * read as poured concrete — nothing in the chain had any value left to give.
 * Japanese garden stone is a mid-value cool grey-green granite, and the anchor
 * has to sit at that value for the stone to have anywhere to sit in the
 * scene's value structure: below the raked gravel, above the moss.
 *
 * It also governs how the moss reads. Against near-white stone the shared moss
 * greens are a value away from black, and the patches resolve as high-contrast
 * camouflage blotches rather than as a plant on a rock. Bringing the stone to a
 * mid value closes that gap without touching the shared palette.
 *
 * The stone's remaining flatness at close range is NOT geometry — the detail
 * pass is confirmed reaching these assets (2,376 -> 50,496 triangles across the
 * nine, with 0.039-0.072 m of relief). It is that the catalog's candidate
 * albedos are near-constant and its ORM carries no real roughness detail
 * (D19-034), so there is almost no macro variation for the light to find.
 */
export const GARDEN_STONE_ANCHOR = Object.freeze([0.42, 0.455, 0.47]);

/**
 * Coverage gain for moss on stone.
 *
 * The package default of 5.2 makes `coverage` a 0..1 dial for *incidental*
 * weathering, which is what the coastal cliffs wanted. Here moss is the
 * dominant colour field of the scene and 5.2 resolved to a barely-visible
 * film — the shader squares its product and the shipped moss albedo has a
 * linear luminance near 0.13 (D19-032), so the gain has to clear that twice
 * over before a garden's coverage range is reachable at all.
 */
export const GARDEN_MOSS_GAIN = 3.3;

/**
 * How hard the three geologies are pulled onto that anchor.
 *
 * Not 1. Full harmonization resolves every stone to the identical tint, which
 * buys palette unity at the cost of the thing that makes a stone group read as
 * a group of *stones* — a real garden's set stones are the same rock type but
 * not the same rock. 0.65 keeps basalt perceptibly cooler than granite while
 * closing the gap that made the coastal set look like two different worlds.
 */
export const GARDEN_STONE_HARMONIZE = 0.65;

/** Shared with the moss bed and the paving-joint moss. Never eyeball a green. */
export { GARDEN_MOSS_STOPS };

const ROCK_ROOT = '/assets-local/launch-world/rocks';
const TEXTURE_ROOT = '/assets-local/rock-textures';
const CANDIDATE_ROOT = '/assets-local/rock-texture-candidates';

/**
 * Detail normals the catalog artifacts do not embed (every one ships a 4x4
 * placeholder — D19-010). `alpine-granite` and `blocky-granite` resolve to the
 * same file: only four distinct normals exist across the six geologies. That
 * is tolerable here in a way it was not for the cliffs, because the per-asset
 * separation now comes from the fBm displacement, which is genuinely unique
 * per variation index rather than a shared map at a different period.
 */
export const GARDEN_DETAIL_MAP_URLS = Object.freeze({
  'rock-alpine-granite-normal': `${TEXTURE_ROOT}/rock-alpine-granite-normal.png`,
  'rock-blocky-granite-normal': `${TEXTURE_ROOT}/rock-blocky-granite-normal.png`,
  'rock-columnar-basalt-normal': `${TEXTURE_ROOT}/rock-columnar-basalt-normal.png`,
});

/** Base maps the catalog `material-config.json` points at, resolved in-repo. */
export const GARDEN_BASE_MAP_URLS = Object.freeze({
  'alpine-granite': Object.freeze({
    rock: `${CANDIDATE_ROOT}/rocks-alpine-granite-subtle-v2/rock-albedo.png`,
  }),
  'blocky-granite': Object.freeze({
    rock: `${CANDIDATE_ROOT}/rocks-blocky-granite-subtle-v2/rock-albedo.png`,
  }),
  'columnar-basalt': Object.freeze({
    rock: `${CANDIDATE_ROOT}/rocks-columnar-basalt-subtle-v2/rock-albedo.png`,
  }),
});

export const MOSS_ALBEDO_URL = `${TEXTURE_ROOT}/layer-moss-albedo.png`;

/**
 * Moss as a material rather than a tint.
 *
 * The shipped `call_me_sensei` moss is a pure colour `mix()` in a desaturated
 * sage, tuned for incidental weathering on a distant cliff. In this garden
 * moss is a hero material seen at close camera in nearly every frame, and
 * three things had to change for it to sit ON the stone instead of being
 * painted over it (all three default to off in the package):
 *
 *   * `roughness` — moss is matte; carrying the stone's specular is most of
 *     why it lit like a wet stain.
 *   * `relief` — a moss cushion buries the relief it grows over. With the
 *     stone's crevice normals showing straight through, the eye reads one
 *     surface wearing a colour.
 *   * `fringe` — the coverage mask is a smooth power curve, so its boundary
 *     was an airbrushed gradient. Real moss ends in ragged separate cushions.
 *
 * Colour comes from `GARDEN_MOSS_STOPS`, so moss on stone and moss on the
 * ground agree where a set stone meets its bed.
 */
export const GARDEN_MOSS_RESPONSE = Object.freeze({
  formDriven: 0.62,
  relief: 0.78,
  roughness: 0.94,

  // --- margin: ragged, not airbrushed -----------------------------------
  //
  // `fringe` was already set on the previous pass and did nothing visible, for
  // a reason that had nothing to do with its value: it sampled the moss ALBEDO
  // at a smaller period and centred that sample on 0.5. The shipped moss map is
  // a flat dark colour map — linear luminance 0.092-0.279 with 99.3% of its
  // texels inside a single decile — so the term evaluated to a near-constant
  // -0.75 and eroded the boundary uniformly instead of breaking it up. The
  // contour just moved inward and stayed as smooth as before (D19-211). The
  // source is now world-space fBm, which is balanced about zero by
  // construction, and `fringeScale` is a fraction of the PATCH period rather
  // than of the projection period, because the patch boundary is what it has to
  // chew. 0.16 x 0.38 m puts the fringe detail near 6 cm — a moss frond, which
  // is the scale at which a margin reads as fibrous rather than as a cut edge.
  fringe: 0.85,
  fringeScale: 0.16,

  // --- coverage mask: the fix for the dip-dyed cap --------------------
  //
  // The shipped coverage curve squares its product and clamps, so coverage
  // crosses 0 to 1 over a sliver of the moisture range. Moisture is dominated
  // by the upward-slope term, so the result was a near-horizontal waterline:
  // uniform moss above, bare stone below, as if the stone had been dipped.
  //
  // `coverage >= 0` switches the shader to the patch-mask path, where a
  // world-space fractal noise decides WHERE moss actually took hold and the
  // transition runs across a real band instead of a cliff edge.
  band: 0.18,
  // A moss cushion is a real-world size — roughly 5-20 cm — and it does not
  // get bigger because the stone did. World-space noise at a FIXED period is
  // therefore correct here, and is why patch scale is not derived from the
  // asset the way projection and relief are. Three octaves puts the finest
  // detail near 0.05 m, which is what keeps the patch EDGES fibrous. At three
  // octaves the noise is smooth enough that the smoothstep cuts clean curves
  // through it and the moss reads as camouflage blotches.
  patchScale: 0.38,
  patchOctaves: 5,
  // High strength is what breaks the cap into separate cushions with bare stone
  // between them; at 0 the mask collapses back to an unbroken cap. It is also
  // the dial that puts bare-stone breaks INSIDE a high-coverage patch, which is
  // what stops a cascade stone at 0.72 from resolving as a solid green cap
  // again once the support field stopped saturating.
  patchStrength: 0.88,
  patchContrast: 1.15,

  // --- value: moss and stone in one narrow band ------------------------
  //
  // The patch mask worked and the result still read as camouflage, because
  // camouflage is what near-black-green patches on near-white stone ARE. Real
  // moss sits at a close value to the damp stone around it and separates by hue
  // and texture, not by luminance. Two causes, both structural (D19-210):
  //
  // The colour ramp never left its bottom end. `mix(lowColor, highColor)` was
  // driven by the raw rgb moss sample, and the shipped moss map is a flat dark
  // colour map — measured linear luminance 0.092-0.279 with 99.3% of its texels
  // inside ONE decile and channel means r 0.079 / g 0.147 / b 0.041. The ramp
  // coordinate therefore never cleared ~0.09: every one of the five authored
  // palette stops collapsed onto `lowColor`, `highColor` was unreachable, and
  // the per-channel coordinate skewed hue on top of crushing value. Remapping
  // the map's MEASURED range onto the ramp puts the mean at t≈0.36 and spreads
  // that one crowded decile across the palette, which is where the moss gets
  // its internal variation — the texture half of "separates by hue and
  // texture". These two numbers are properties of the bound moss map, not taste:
  // re-measure them if the map is ever replaced.
  patternFloor: 0.105,
  patternCeiling: 0.14,
  // And the stone comes down to meet it. Moss grows where stone stays wet, and
  // wet stone is much darker than dry — so damping the rock across the support
  // field is the physically correct way to close a value gap that would
  // otherwise have to be closed by lifting the shared palette (which belongs to
  // the ground and the props owner too) or by grading the whole scene (which is
  // the scene owner's call — see the recommendation in
  // launch-plan/review/garden-stone-value-grade.md). It also leaves a damp halo
  // just outside each cushion, because moss does not begin at a dry edge.
  damp: 0.3,

  // --- form: bare crowns ------------------------------------------------
  //
  // Moss was evenly distributed including over exposed crowns. Two causes,
  // and the first one is the reason the second was invisible:
  //
  //   * `rockCavity` was never actually reaching the shader (D19-214). The
  //     gate that admits it was comparing a TSL node with `> 0`, which is
  //     always false, so the support term was pure slope all along — the
  //     "slope + cavity" model existed in the source and was dead code.
  //   * `slope` saturates. At the previously resolved sharpness 2.19 / offset
  //     -0.205 it hit 1.0 by n.y = 0.36, so across the top two-thirds of every
  //     boulder the support field was a constant and the colonisation noise was
  //     the ONLY thing deciding where moss went. Noise uncorrelated with form
  //     is the definition of camouflage.
  //
  // A gentler slope curve restores the gradient, and `exposure` — the rectified
  // convex half of the same curvature estimate that produces `rockCavity` —
  // finally lets a crown score as dry. Bare crowns are not a side effect; they
  // are the strongest single cue that moss grew rather than got printed.
  //
  // These three were calibrated together and do not transfer separately.
  // Removing the saturation entirely (sharpness 1 / offset 0) was tried and is
  // wrong: it starves the near-vertical faces, and the upright tateishi
  // `rock-0222` is mostly vertical face, so it came out bare while the low
  // reclining stones kept their moss — the opposite of what a garden does. Real
  // moss is heavy on a shaded vertical flank; what it avoids is the dry crown.
  // 1.5 / -0.15 gives a vertical face real support and saturates only above
  // n.y = 0.77, and `exposure` then carves the crown back out of that top
  // sliver. `exposure` also cannot go much above this on ROUNDED stock: a
  // rounded boulder is convex nearly everywhere, so a large exposure penalty
  // stops behaving like a crown mask and starts behaving like a global coverage
  // cut, which silently breaks the per-role coverage semantics. At 0.6 the
  // macro term is mild and most of the crown/pit separation comes from the
  // micro-bumps the displacement pass folds in.
  sharpness: 1.5,
  offset: -0.15,
  exposure: 0.6,

  // --- depth: a cushion, not a decal ------------------------------------
  //
  // `relief` flattens the STONE's detail under the moss, but nothing ever
  // raised the moss itself, so a patch stayed geometrically identical to the
  // rock it sat on (D19-213). `cushion` tilts the shading normal along the
  // gradient of the same patch field the mask is built from, so the relief
  // lands exactly on the cushions; `contact` adds the occlusion a raised mass
  // casts into the crease where it meets bare stone, which is the evidence the
  // eye uses to conclude the moss has thickness at all.
  cushion: 0.3,
  contact: 0.16,
});

/**
 * RECOMMENDED SCENE-SIDE VALUE GRADE — for the garden scene owner.
 *
 * NOT APPLIED HERE. `resolveGardenStoneSurface` does not return it and nothing
 * in this file uses it. It is exported so the recommendation is executable
 * rather than prose, and so the scene owner can adopt it with one spread. The
 * full write-up, with the measurements below and the captured A/B, is
 * `launch-plan/review/garden-stone-value-grade.md`. Preview it at
 * `/garden-stone-gate/?grade=1`.
 *
 * THE STONE IS NOT ACTUALLY TOO BRIGHT. MEASURED, AND IT SURPRISED ME.
 *
 * Both previous passes — and my own eye on the first look at this one —
 * described the stone as "near-white". Measuring the captured frames says
 * otherwise. Across the whole boulder in `AB85-all-on.png`, bare stone means
 * **linear 0.072**, sRGB8 [70, 74, 64], and the single brightest bare pixel on
 * the asset is linear 0.122. That is a mid-dark grey, not white.
 *
 * What makes it READ as white is that it is a desaturated neutral — measured
 * chroma about 7% — sitting against a saturated yellow-green moss and an olive
 * ground. It is simultaneous contrast, a chroma fact, not a luminance one. Any
 * recommendation to grade the stone DARKER is therefore chasing the wrong
 * variable, and would also undo the moss work: after this pass moss and stone
 * are 0.050 and 0.072, i.e. **0.54 stops apart**, and darkening the stone from
 * here re-opens the gap the whole colour fix was about closing.
 *
 * (I wrote that recommendation first, measured it, and it made the value gap
 * worse — 0.54 stops to 1.12. The numbers below are the corrected version.)
 *
 * WHAT IS ACTUALLY WRONG: NO RANGE, AND NO HUE
 *
 * The rock shader's colour chain is, in linear space and in this order:
 *
 *     ((albedo - 0.5) x projection.contrast + 0.5 + projection.brightness)
 *       x material.tint
 *
 * `call_me_sensei` authors `contrast: 0.72` and `brightness: 0.04`. Both are
 * correct for the distant coastal cliffs the preset was tuned on and neither is
 * to be edited. What they do to a garden stone at 1.5 m is:
 *
 *   * The catalog's candidate albedos have almost no range to begin with.
 *     Measured linear luminance: `alpine-granite` 0.452-0.555 (mean 0.503),
 *     `blocky-granite` 0.442-0.543 (0.497), `columnar-basalt` 0.363-0.441
 *     (0.402) — a spread of about 0.10 on a 0..1 scale. D19-034, now quantified.
 *   * `contrast: 0.72` is a COMPRESSION, so it pulls that toward 0.5 and shrinks
 *     the spread further, to 0.073. It is the one value in the chain actively
 *     removing the variation the surface needs.
 *   * The garden then applies a harmonized tint of [0.610, 0.637, 0.656] — very
 *     nearly achromatic, 7% chroma. So the stone arrives at the light as a flat
 *     neutral with a 0.073 working range.
 *
 * Against `launch-plan/ananta-refererence/09-beach-crowd-wide.png`, where every
 * natural surface is luminous and carries real chroma even in shadow, a flat
 * achromatic surface is the thing that reads wrong — not its brightness.
 *
 * WHAT THE SCENE NEEDS: more tonal range, and a hue
 *
 *   * `contrast: 1.5` EXPANDS the albedo range instead of compressing it.
 *     Measured on the render: stone tonal spread 0.118 -> 0.140.
 *   * `brightness: -0.11` holds the value where it is, so the range comes for
 *     free rather than at the cost of the moss/stone proximity. Measured: stone
 *     0.072 -> 0.080, moss/stone separation 0.54 -> 0.67 stops. Still a narrow
 *     band; the two still separate by hue rather than by luminance.
 *   * `tint: [0.58, 0.63, 0.72]` is the same LUMINANCE as the tint already in
 *     use (0.626 vs 0.633) but cool blue-grey instead of neutral. Measured:
 *     stone sRGB8 [70, 74, 64] (warm olive) -> [69, 78, 78] (cool grey). Cool
 *     blue-grey stone against warm yellow-green moss is a real complementary
 *     separation, which is what "separates by hue, not luminance" requires.
 *
 * A green-grey tint was tried first and is WRONG: at [0.55, 0.66, 0.60] the
 * stone enters the moss's own hue family and the two stop separating at all.
 *
 * The three values only work together. `contrast` alone lightens the stone;
 * `tint` alone flattens it, because tint is multiplicative and scales level and
 * spread together — which is exactly why the previous pass found a tint of 0.61
 * still not solving it and correctly stopped rather than pushing harder.
 *
 * `material.tint` is applied BEFORE the moss is mixed in, so none of this
 * touches the moss or the shared `GARDEN_MOSS_STOPS` palette.
 *
 * Final exposure remains the scene's. These numbers were measured under this
 * review lab's rig, so treat the DIRECTION and the ratios as the recommendation
 * and re-check the absolute level under the shipped style runtime.
 */
export const GARDEN_STONE_VALUE_GRADE = Object.freeze({
  material: Object.freeze({ tint: Object.freeze([0.58, 0.63, 0.72]) }),
  projection: Object.freeze({ brightness: -0.11, contrast: 1.5 }),
});

/**
 * The garden stone set.
 *
 * Nine assets, nine distinct `profileId`s — no two share a base shape, which
 * is the trap that sank the original cliff kit and which 65% of the catalog
 * falls into (D19-013). `measured` is read from each GLB's LOD0 POSITION
 * accessor and agrees with catalog `dimensionsMeters` to 5 decimal places on
 * all nine; `triangles` is counted from the glTF JSON chunk.
 *
 * `moss` is a per-ROLE property, not a per-asset one: dampness is a fact about
 * where a stone sits. A cascade lip under constant spray and a gravel-sea
 * island in a dry karesansui are the same rock family and must not wear the
 * same moss.
 *
 * `variation` keys both the moss spread and the fBm displacement field, so it
 * must stay stable — changing it changes the rendered surface and invalidates
 * captured evidence.
 */
export const STILLWATER_GARDEN_STONES = Object.freeze([
  Object.freeze({
    character: 'worn',
    geology: 'alpine-granite',
    group: 'set-stone',
    id: 'rock-0222',
    label: 'Rounded Boulder 11',
    measured: Object.freeze([1.27692, 1.27251, 0.88415]),
    moss: 0.55,
    profileId: 'shape-042',
    role: 'GDN-SET-01',
    triangles: 120,
    url: `${ROCK_ROOT}/rock-0222/rock.glb`,
    // The only asset in the catalog that is both garden-scale and genuinely
    // taller than its footprint (h/footprint 1.20) while staying rounded — the
    // upright accent a set-stone group is composed around. Its profile twin
    // `rock-0084` is the same shape at 1.02 and is deliberately unused.
    use: 'Set-stone group — upright anchor (tateishi)',
    variation: 10,
  }),
  Object.freeze({
    character: 'worn',
    geology: 'blocky-granite',
    group: 'set-stone',
    id: 'rock-0206',
    label: 'Rounded Boulder 13',
    measured: Object.freeze([1.64623, 0.91691, 1.5647]),
    moss: 0.7,
    profileId: 'shape-026',
    role: 'GDN-SET-02',
    triangles: 214,
    url: `${ROCK_ROOT}/rock-0206/rock.glb`,
    use: 'Set-stone group — broad settled companion',
    variation: 11,
  }),
  Object.freeze({
    character: 'worn',
    geology: 'blocky-granite',
    group: 'set-stone',
    id: 'rock-0247',
    label: 'Rounded Boulder 16',
    measured: Object.freeze([1.59531, 0.71387, 1.00471]),
    moss: 0.45,
    profileId: 'shape-074',
    role: 'GDN-SET-03',
    triangles: 284,
    url: `${ROCK_ROOT}/rock-0247/rock.glb`,
    use: 'Set-stone group — low reclining stone',
    variation: 12,
  }),
  Object.freeze({
    // Frost-shattered rather than water-rolled: the lip wants a crisper arris
    // than a boulder so the falling edge stays legible.
    character: 'weathered',
    geology: 'columnar-basalt',
    group: 'cascade',
    id: 'rock-0088',
    label: 'Flat Shelf 8',
    measured: Object.freeze([2.01774, 0.55959, 1.20579]),
    // The wettest stone in the garden — but not 1.0. Under the coverage-mask
    // path 1.0 means moss takes every supported surface, and the lip stopped
    // reading as stone at all. A cascade rock is heavily mossed AND still
    // visibly rock; 0.72 keeps the wet lip and the dry outer edges.
    moss: 0.72,
    profileId: 'shape-046',
    role: 'GDN-CAS-01',
    triangles: 462,
    url: `${ROCK_ROOT}/rock-0088/rock.glb`,
    // Its top plate overhangs the base on every turntable view — the undercut
    // waist that makes water sheet off the lip and fall clear instead of
    // dribbling down the face.
    use: 'Cascade — overhanging lip stone',
    variation: 13,
  }),
  Object.freeze({
    character: 'worn',
    geology: 'columnar-basalt',
    group: 'cascade',
    id: 'rock-0076',
    label: 'Rounded Boulder 6',
    measured: Object.freeze([1.30761, 1.0855, 1.65794]),
    moss: 0.6,
    profileId: 'shape-034',
    role: 'GDN-CAS-02',
    triangles: 290,
    url: `${ROCK_ROOT}/rock-0076/rock.glb`,
    use: 'Cascade — flanking shoulder stone',
    variation: 14,
  }),
  Object.freeze({
    character: 'worn',
    geology: 'alpine-granite',
    group: 'gravel-island',
    id: 'rock-0227',
    label: 'Flat Shelf 14',
    measured: Object.freeze([1.89252, 0.3639, 1.02445]),
    // Dry karesansui: the gravel sea reads as water precisely because nothing
    // in it is wet.
    moss: 0.15,
    profileId: 'shape-054',
    role: 'GDN-ISL-01',
    triangles: 374,
    url: `${ROCK_ROOT}/rock-0227/rock.glb`,
    use: 'Gravel sea — larger settled island',
    variation: 15,
  }),
  Object.freeze({
    character: 'worn',
    geology: 'columnar-basalt',
    group: 'gravel-island',
    id: 'rock-0202',
    label: 'Flat Shelf 4',
    measured: Object.freeze([1.52679, 0.2411, 1.15892]),
    moss: 0.2,
    profileId: 'shape-022',
    role: 'GDN-ISL-02',
    triangles: 310,
    url: `${ROCK_ROOT}/rock-0202/rock.glb`,
    // The flattest asset in the catalog at h/footprint 0.18 — a lens rather
    // than a lump, which is what keeps it reading as an island in the raked
    // gravel rather than a rock dropped on it.
    use: 'Gravel sea — low lens island',
    variation: 16,
  }),
  Object.freeze({
    character: 'worn',
    geology: 'columnar-basalt',
    group: 'path-edging',
    id: 'rock-0010',
    label: 'Rounded Boulder 17',
    measured: Object.freeze([1.19622, 0.73963, 1.22673]),
    moss: 0.35,
    profileId: 'shape-010',
    role: 'GDN-EDG-01',
    triangles: 140,
    url: `${ROCK_ROOT}/rock-0010/rock.glb`,
    use: 'Path edging — rounded lozenge',
    variation: 17,
  }),
  Object.freeze({
    character: 'worn',
    geology: 'blocky-granite',
    group: 'path-edging',
    id: 'rock-0092',
    label: 'Rounded Boulder 7',
    measured: Object.freeze([1.41171, 0.73621, 1.21823]),
    moss: 0.3,
    profileId: 'shape-050',
    role: 'GDN-EDG-02',
    triangles: 182,
    url: `${ROCK_ROOT}/rock-0092/rock.glb`,
    use: 'Path edging — low worn stone',
    variation: 18,
  }),
]);

/**
 * Stepping stones are NOT in this set.
 *
 * `GAP-GDN-STEPPING-STONE-01` recorded that zero of 480 assets reach
 * 0.4-0.8 m across at a height/footprint below ~0.25; the re-triage confirms
 * it independently (the flattest asset under 1.0 m across is `rock-0238` at
 * 0.49). That gap is closed by another owner under D-018 and is deliberately
 * not duplicated here.
 */
export const GARDEN_STEPPING_STONE_OWNER = 'Garden stepping-stone asset authoring';

/**
 * Normal-map flattening for garden stone.
 *
 * The repo's rock normals are full-amplitude, which shades to soot under a
 * directional key (D19-033). The coastal set flattens to 0.93; garden stone
 * goes further because a water-worn boulder genuinely carries less fine relief
 * than a fractured cliff, and because the fBm displacement now supplies the
 * relief that the map used to have to fake.
 */
export const GARDEN_NORMAL_FLATTEN = 0.96;

/**
 * Resolves one garden stone's completed surface.
 *
 * @param {object} stone                A `STILLWATER_GARDEN_STONES` entry.
 * @param {object} [options]
 * @param {number} [options.scale]      Uniform placement scale; folded into the
 *   size the projection period and displacement are derived from, so a scaled
 *   stone keeps the same texel density and the same relief-to-size ratio.
 * @param {boolean} [options.moss]      Enable moss.
 * @param {number} [options.mossCoverage] Override the role's coverage.
 * @param {number} [options.variation]  Override the decorrelation index.
 * @param {number} [options.triangleTarget] Post-subdivision triangle target.
 * @param {number} [options.normalFlatten]  Detail-normal flattening.
 * @returns {{settings: object, requiredTextures: object, geology: string,
 *   variation: number, textureUrls: object, geometryDetail: object}}
 */
export function resolveGardenStoneSurface(stone, {
  scale = 1,
  moss = true,
  mossCoverage = null,
  variation = null,
  triangleTarget = 2600,
  normalFlatten = GARDEN_NORMAL_FLATTEN,
  // Optional consumer override for the palette anchor. Defaults to
  // GARDEN_STONE_ANCHOR so every existing caller is byte-identical; the garden
  // scene passes a warmer anchor (D19-206).
  paletteAnchor = GARDEN_STONE_ANCHOR,
} = {}) {
  const placementScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const size = stone.measured.map((extent) => extent * placementScale);
  const index = Number.isFinite(variation) ? Math.trunc(variation) : stone.variation;
  const surface = createCatalogRockSurface({
    geology: stone.geology,
    harmonize: GARDEN_STONE_HARMONIZE,
    moss,
    mossCoverage: Number.isFinite(mossCoverage) ? mossCoverage : stone.moss,
    mossFormDriven: GARDEN_MOSS_RESPONSE.formDriven,
    mossFringe: GARDEN_MOSS_RESPONSE.fringe,
    mossGain: GARDEN_MOSS_GAIN,
    // Hold the sampled FRACTION of the moss map constant rather than the
    // period, the same correction `resolveCatalogRockProjectionScale` makes
    // for the base map. The shipped 18 m period on a 1.3 m stone samples 7% of
    // the map and yields one or two isolated blobs — lichen spots, not moss
    // coverage. See D19-192.
    mossSize: 18 * (Math.max(...size) / 5.94) * 2.2,
    mossPalette: GARDEN_MOSS_STOPS,
    mossRelief: GARDEN_MOSS_RESPONSE.relief,
    mossRoughness: GARDEN_MOSS_RESPONSE.roughness,
    paletteAnchor,
    variation: index,
  });

  const textureUrls = { ...(GARDEN_BASE_MAP_URLS[stone.geology] ?? {}) };
  for (const [slot, name] of Object.entries(surface.requiredTextures)) {
    const url = GARDEN_DETAIL_MAP_URLS[name];
    if (url) textureUrls[slot] = url;
  }

  return {
    ...surface,
    geometryDetail: resolveRockGeometryDetailForSize({
      character: stone.character,
      size,
      triangleTarget,
      triangles: stone.triangles,
      variation: index,
    }),
    settings: {
      ...surface.settings,
      moss: {
        ...surface.settings.moss,
        fringeScale: GARDEN_MOSS_RESPONSE.fringeScale,
        contact: GARDEN_MOSS_RESPONSE.contact,
        cushion: GARDEN_MOSS_RESPONSE.cushion,
        damp: GARDEN_MOSS_RESPONSE.damp,
        exposure: GARDEN_MOSS_RESPONSE.exposure,
        patternCeiling: GARDEN_MOSS_RESPONSE.patternCeiling,
        patternFloor: GARDEN_MOSS_RESPONSE.patternFloor,
        // Unsaturated slope, so the support field carries real information
        // across the upper hemisphere instead of pinning at 1. See the note on
        // `sharpness` in GARDEN_MOSS_RESPONSE.
        offset: GARDEN_MOSS_RESPONSE.offset,
        sharpness: GARDEN_MOSS_RESPONSE.sharpness,
        // The role's dampness becomes the coverage target directly. This
        // replaces the gain arithmetic the legacy curve needed: `coverage` is
        // the fraction of supported surface moss takes, so a cascade lip at
        // 1.0 and a dry gravel island at 0.15 mean exactly that.
        band: GARDEN_MOSS_RESPONSE.band,
        coverage: Number.isFinite(mossCoverage) ? mossCoverage : stone.moss,
        patchContrast: GARDEN_MOSS_RESPONSE.patchContrast,
        patchOctaves: GARDEN_MOSS_RESPONSE.patchOctaves,
        patchScale: GARDEN_MOSS_RESPONSE.patchScale,
        patchStrength: GARDEN_MOSS_RESPONSE.patchStrength,
      },
      normals: { nearFlatten: normalFlatten },
      projection: { scale: resolveCatalogRockProjectionScale({ size }) },
    },
    textureUrls,
  };
}

/** Convenience: every stone in one compositional group, in role order. */
export function gardenStonesForGroup(group) {
  return STILLWATER_GARDEN_STONES.filter((stone) => stone.group === group);
}
