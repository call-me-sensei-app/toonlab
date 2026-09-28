// Stillwater Garden — the launch scene's trees and low planting.
//
// Spec: launch-plan/20-stillwater-garden-scene-brief.md §2 (colour structure,
// five-band layering) and §3 (ToonLab-owned asset ledger).
// Authoring notes: launch-plan/review/tree-replacement-authoring.md
//
// Single source of truth. The review lab (labs/tree-gate1/) and the authoring
// script (scripts/stillwater-garden-trees.mjs, which measures every variant
// and emits the portable BranchTree documents) both import this file, so a
// number can never drift between what was reviewed and what was shipped.
//
// Everything here is ToonLab-owned and procedural: BranchTree for the two tree
// families, StylizedBush for the clipped azalea masses. Nothing is generated,
// nothing is imported, no credits are spent.

// Seed rule, carried over from the previous pass:
//     variantSeed = baseSeed + variantIndex * 137
// 137 is prime and is not a rational multiple of the foliage sampler's 101.3
// per-attachment stride, so no variant can alias onto another's tuft sequence.
export const GARDEN_SEED_STRIDE = 137;

// The garden's shaping bearing, as an azimuth clockwise from +Z.
//
// §2 puts the pine mass on the northern planted rise with the camera
// approaching from the south, so the stand is shaped toward the camera: pads
// open to the viewer instead of presenting their edges, and the whole group
// reads as one wind-and-shears history rather than as three unrelated trees.
// 195 deg is south-south-west, which keeps the lean across the frame rather
// than straight down the lens.
export const GARDEN_SHAPING_BEARING_DEGREES = 195;

// Zero, deliberately, and this is a finding rather than an omission.
//
// The previous pass pre-compensated the authored bow heading by a measured
// constant so a windswept stand would centre on the wind bearing. That works
// at its `gnarliness` of 0.24. It does NOT work here: at the 0.5-0.56 these
// pines need to look pruned rather than grown, the per-segment gnarl
// perturbation dominates the trunk apex, and the map from `bendDirection` to
// achieved apex bearing stops being a rotation. Measured over three attempts
// on the same three seeds, moving the authored heading by -56 deg moved the
// measured stand mean by +51 deg — the wrong way, and by a different amount
// per variant (299 / 276 / 332). Chasing a constant here would be fitting
// noise. Recorded as D19-131.
//
// What is still true and still load-bearing is that all three variants share
// one authored bow, so the family bows from one cause. Landing the STAND on
// the scene bearing is then done at placement, where the runtime guide puts
// it anyway: each document carries its own measured apex azimuth, and
// assembly yaws the instance by (bearing - measured) plus a small jitter.
// That is exact rather than approximate, and it is measured per build.
//
// Bearing is measured on the trunk APEX, not the crown centroid. The centroid
// is the obvious metric and the wrong one once pad pruning is active: a
// sparse, farthest-point-sampled subset of tips swings the crown's centre of
// mass by tens of degrees for reasons unrelated to the trunk, which produced a
// 63 deg phantom error and a 300 deg scatter before the metric was changed.
export const GARDEN_PINE_BEARING_PRECOMPENSATION_DEGREES = 0;

/**
 * The vegetation shader profile every Stillwater Garden plant is assembled
 * with — NOT a bare `{ preset: 'call_me_sensei' }`.
 *
 * Two shipped preset values have to be overridden per scene, both measured
 * and photographed in this pass (D19-128, D19-129):
 *
 *   foliage.styleColorStrength — ships at 1, which blends the asset-authored
 *     canopy palette all the way into the style's own dark green. At 1 the
 *     autumn maple renders GREEN on its sun-struck crown with the authored
 *     red surviving only on the shaded underside; the canopy colour a recipe
 *     author writes has essentially no authority. The field's own description
 *     calls it "legacy aggregate-only" and the deprecation table names
 *     `tree.canopyColor` as its replacement, so the shipped 1 is the outlier.
 *     0.35 keeps the style's value grading — which is real and worth having,
 *     the crown is noticeably deeper and less poster-like than at 0 — while
 *     letting the authored hue through.
 *
 *   bark.shadowFloor / skyFillStrength — the preset's 0.42/0.04 is authored
 *     for a trunk seen against sky. On a tips-placement tree the bare limbs
 *     cross the tree's OWN crown, and a 3 cm twig turned away from the sun
 *     lands near black and reads as a crack scribbled over the foliage.
 *
 *   lighting.skyFillStrength — ships at 0.16, which crushes the shaded half
 *     of a canopy to a near-black maroon. §2 asks for shadows that are "warm,
 *     luminous and coloured — never neutral grey", and 0.16 does not deliver
 *     it on a saturated canopy. Photographed A/B in this pass (D19-141).
 *
 *     This is the vegetation family's ONLY shadow lift. It is not the
 *     `installToonLabSurfaceLighting({ shadowFill })` option: a BranchTree's
 *     canopy and bark are bare NodeMaterials that light themselves from their
 *     own sun/sky uniforms and never install the ToonLab surface lighting
 *     model at all, so `shadowFill` cannot reach a plant (D19-142).
 *
 * All three are scene-side overrides on purpose: changing the shipped preset
 * would silently recolour every tree, grass clump and flower in every other
 * scene. THREE separate overrides against one preset is however a preset
 * problem rather than a scene problem, and it is escalated as such — see the
 * deficiency entries. Nothing here should be treated as the final home for
 * these values.
 */
export const GARDEN_VEGETATION_SHADER = Object.freeze({
  preset: 'call_me_sensei',
  settings: Object.freeze({
    bark: Object.freeze({ shadowFloor: 0.6, skyFillStrength: 0.1 }),
    foliage: Object.freeze({ styleColorStrength: 0.35 }),
    lighting: Object.freeze({ skyFillStrength: 0.42 }),
  }),
});

const bearingRadians = (degrees) => ((degrees * Math.PI) / 180 + Math.PI * 2) % (Math.PI * 2);

export const GARDEN_PINE_BEND_DIRECTION = bearingRadians(
  GARDEN_SHAPING_BEARING_DEGREES + GARDEN_PINE_BEARING_PRECOMPENSATION_DEGREES,
);

// ---------------------------------------------------------------------------
// GDN-MAPLE-HERO — Acer palmatum. The scene's single saturated accent (§2).
//
// What has to be true at 85 mm, which is where this tree lives:
//   * multi-stemmed — `branches.start` sits at 0.05-0.09 so the first order of
//     limbs leaves the trunk almost at the ground and reads as several stems;
//   * layered horizontally — in HORIZONTAL PLATES with visible sky and limb
//     between them, which is the species' signature and the one thing the
//     first version of this recipe did not deliver. It had the right idea
//     (`layered-sprays`, wide `branches.angle`, pad pruning) and still built
//     a dome with a tiered edge, for two reasons that took a render to see:
//     a spray disc was built ACROSS THE TWIG, so a twig rising at 50 deg
//     carried a disc tilted at 50 deg and a few hundred randomly tilted
//     saucers add up to a shell; and farthest-point pad pruning spaces
//     masses equally in all three axes, so no pad count could produce an
//     anisotropic structure. `cluster.plateAlignment` fixes the first and
//     `cluster.plates` the second;
//   * trunk on show — the crown skirted to within a metre of the ground and
//     buried the trunk this recipe spends gnarl, twist and a dedicated bark
//     generator on. `cluster.crownBase` lifts the foliage without touching
//     the low fork that makes it read multi-stemmed;
//   * fine — small cards carrying the dissected seven-lobe `palmate` outline,
//     never the blunt five-point 'maple' star, which is a sugar maple;
//   * sculptural — high `trunk.gnarl` and `twist` with real bend, because the
//     bare trunk is as much of the subject as the canopy in a garden.
// ---------------------------------------------------------------------------

const MAPLE_BASE_SEED = 3301;

function mapleVariant({
  variant, seed, label, silhouette, targetHeightMetres, branches, cluster, trunk, leaves,
}) {
  return {
    id: `GDN-MAPLE-HERO-V${variant}`,
    family: 'GDN-MAPLE-HERO',
    species: 'Acer palmatum — Japanese maple',
    variant,
    label,
    silhouette,
    slot: 'garden-maple-hero',
    slotLabel: 'Foreground occluder + focal accent (§2 band 1, 1-3 instances)',
    seedRule: `base seed ${MAPLE_BASE_SEED} + ${variant - 1} x ${GARDEN_SEED_STRIDE}`,
    targetHeightMetres,
    settings: {
      seed,
      size: 2.4,
      branches: {
        angle: 56,
        children: 6,
        forceStrength: -0.01,
        gnarliness: 0.36,
        lengthRatio: 0.46,
        levels: 4,
        maxAttachments: 700,
        maxBranches: 900,
        radialSegments: 10,
        radiusRatio: 0.74,
        start: 0.3,
        ...branches,
      },
      trunk: {
        bend: 0.32,
        bendDirection: bearingRadians(GARDEN_SHAPING_BEARING_DEGREES - 40),
        // Light, on purpose. `trunk.color` TINTS the bark map rather than
        // replacing it, so an authored colour at the value the real bark reads
        // at multiplies against a map already carrying that value and the
        // trunk goes black. The map owns the value; this owns the hue.
        color: '#d8c7b4',
        gnarl: 0.38,
        height: 1.9,
        lean: 0.34,
        leanOffset: 0,
        radialSegments: 12,
        radiusBottom: 0.24,
        radiusTop: 0.055,
        // RESTORED to the library default (branchTree.js:102 ships `true`).
        //
        // This was authored `false` as a workaround for black-scribble limbs
        // inside the crown — a symptom that was later re-diagnosed as a
        // sun-direction-dependent occlusion term, not a shadow-receiving
        // problem. Disabling receipt removed the terminator that makes a trunk
        // read as a cylinder at all: bark had no shading anywhere, and a maple
        // trunk at 4.6 m from the hero eye rendered as a flat brown stripe.
        // If the scribbles return, fix the occlusion term or the key — not
        // this flag.
        receiveShadow: true,
        textureRef: 'maple',
        twist: 0.16,
        ...trunk,
      },
      leaves: {
        cluster: {
          architecture: 'layered-sprays',
          cards: 22,
          // Lift the foliage skirt clear of the lower third of the crown.
          // The limbs still fork at `branches.start` 0.26-0.42 and still read
          // multi-stemmed; what changes is that they no longer carry leaves
          // all the way down, so the sculptural trunk this recipe spends
          // gnarl, twist and a dedicated bark generator on is actually in
          // frame. Without it the crown skirts to within a metre of the
          // ground and there is no camera that photographs the trunk from
          // outside the canopy.
          crownBase: 0.22,
          // Hold the card total while the plates take out four fifths of the
          // attachments: the crown is being RESTRUCTURED, not thinned. The
          // density was never the defect — 1,246-1,597 cards/m was already
          // measured and photographed as genuinely dense. WHERE the cards sat
          // was the defect. Authored per variant below, because how many tips
          // a given seed leaves inside the bands is a property of that seed's
          // skeleton and not something one constant can serve.
          densityBoost: 1,
          // Isotropic pad pruning is what stopped the pine being broccoli,
          // and on the maple it bought a stacked EDGE and nothing more — the
          // interior stayed one continuous mass, because farthest-point
          // sampling spaces masses equally in all three axes and an Acer
          // palmatum's structure is anisotropic. Kept, but well above the
          // previous 40: its job here is lateral spacing WITHIN a plate, and
          // on these seeds the plates bind first, so it is a ceiling rather
          // than the operative control.
          pads: 150,
          // The signature. Five tiers across the crown carrying a fifth of
          // their own pitch each, so about four fifths of the crown height is
          // gap a viewer sees sky and limb through. Pitch has to beat the
          // card height or the cards bridge their own gaps, which is why the
          // cards below are smaller than the previous pass's; and the tiers
          // are jittered because a real tree is not a comb.
          plates: { count: 5, jitter: 0.12, thickness: 0.2 },
          // Flat WITH THE GROUND, not with the twig. This is the half that
          // the pad machinery could not express: without it each tier is a
          // thicket of saucers tilted at whatever angle their twig left the
          // limb at, and five bands of randomly tilted saucers still add up
          // to a dome. Held below 1 so the tiers are not machined flat.
          plateAlignment: 0.88,
          // A perfectly level plate reads as a shelf, and a stack of shelves
          // is a Cornus controversa or an acacia — which is exactly what this
          // recipe looked like at droop 0 (photographed). The sag is what
          // makes it Acer.
          plateDroop: 0.22,
          radius: 0.44,
          sizeRange: [0.12, 0.21],
          sprayLayers: 3,
          spraySpread: 0.8,
          sprayThickness: 0.1,
          ...cluster,
        },
        color: '#b8492c',
        // Below 1 deliberately. `leaves.density` is the ONLY control over
        // `openness = max(0, 1 - density)`, which is what cuts the gap
        // pockets and thins the crown underside; at 1 or above a canopy has
        // no holes at all. The previous pass could not go below 1 because
        // density was also its only card-count lever — with `cluster.cards`
        // carrying the count, gaps and density are finally separable, and a
        // garden tree three metres from the lens needs the gaps.
        density: 0.8,
        shape: 'palmate',
        ...leaves,
      },
      roots: 'medium',
    },
  };
}

export const GARDEN_MAPLES = [
  mapleVariant({
    variant: 1,
    seed: MAPLE_BASE_SEED,
    label: 'GDN-MAPLE-HERO variant 1 — low multi-stem, deep tiers',
    silhouette: 'low multi-stem, deep tiers',
    targetHeightMetres: 3.4,
    branches: { angle: 58, children: 6, lengthRatio: 0.48, start: 0.26, gnarliness: 0.38 },
    cluster: { densityBoost: 0.72 },
    trunk: { height: 1.7, lean: 0.38, bend: 0.34, gnarl: 0.4 },
    leaves: { color: '#b8492c' },
  }),
  mapleVariant({
    variant: 2,
    seed: MAPLE_BASE_SEED + GARDEN_SEED_STRIDE,
    label: 'GDN-MAPLE-HERO variant 2 — broad umbrella, wide tiers',
    silhouette: 'broad umbrella, wide tiers',
    targetHeightMetres: 4.2,
    branches: { angle: 64, children: 6, lengthRatio: 0.5, start: 0.34, gnarliness: 0.3 },
    cluster: { densityBoost: 0.68, plates: { count: 6, jitter: 0.14, thickness: 0.3 } },
    trunk: { height: 2.05, lean: 0.24, bend: 0.26, gnarl: 0.32, twist: 0.12 },
    leaves: { color: '#c4642f' },
  }),
  mapleVariant({
    variant: 3,
    seed: MAPLE_BASE_SEED + GARDEN_SEED_STRIDE * 2,
    label: 'GDN-MAPLE-HERO variant 3 — upright sculptural single stem',
    silhouette: 'upright sculptural single stem',
    targetHeightMetres: 3.8,
    branches: { angle: 50, children: 5, lengthRatio: 0.42, start: 0.42, gnarliness: 0.44 },
    cluster: { densityBoost: 1.42 },
    trunk: { height: 2.4, lean: 0.44, bend: 0.42, gnarl: 0.46, twist: 0.24 },
    leaves: { color: '#a83a2e' },
  }),
];

// ---------------------------------------------------------------------------
// GDN-PINE-MASS — Pinus thunbergii. The enclosing mass that closes sightlines
// honestly (§2 band 5).
//
// The failure mode this recipe is written against is the excurrent conifer
// cone. Explicitly NOT used: `skeleton.conifer`, which shortens children
// toward the leader and builds exactly that cone. A cloud-pruned garden pine
// is decurrent and irregular — a few heavy limbs, each ending in a distinct
// flat foliage pad, with bare wood visible between the pads. That structure
// comes from three things here:
//   * `leafPlacement: 'tips'` with no shell fill (BranchTree's own default) —
//     foliage exists only at branch ends, so the wood in between stays on show;
//   * the `layered-sprays` tuft architecture with a wide, thin spray — each
//     tip becomes a flat PAD rather than a ball;
//   * a low `children` with high `gnarliness`, so the limbs are few, heavy and
//     irregular instead of numerous and even.
// ---------------------------------------------------------------------------

const PINE_BASE_SEED = 2801;

function pineVariant({
  variant, seed, label, silhouette, targetHeightMetres, branches, trunk, leaves,
}) {
  return {
    id: `GDN-PINE-MASS-V${variant}`,
    family: 'GDN-PINE-MASS',
    species: 'Pinus thunbergii — Japanese black pine',
    variant,
    label,
    silhouette,
    slot: 'garden-pine-mass',
    slotLabel: 'Enclosing mass, northern planted rise (§2 band 5, 5-7 instances)',
    seedRule: `base seed ${PINE_BASE_SEED} + ${variant - 1} x ${GARDEN_SEED_STRIDE}`,
    targetHeightMetres,
    settings: {
      seed,
      size: 2.8,
      branches: {
        angle: 62,
        children: 5,
        forceStrength: -0.02,
        gnarliness: 0.5,
        lengthRatio: 0.44,
        levels: 4,
        maxAttachments: 700,
        maxBranches: 900,
        radialSegments: 10,
        radiusRatio: 0.7,
        start: 0.3,
        ...branches,
      },
      trunk: {
        bend: 0.26,
        bendDirection: GARDEN_PINE_BEND_DIRECTION,
        color: '#5c5347',
        gnarl: 0.46,
        height: 3.4,
        lean: 0.3,
        leanOffset: 0,
        radialSegments: 12,
        radiusBottom: 0.28,
        radiusTop: 0.06,
        // RESTORED to the library default, with the maple. A cloud-pruned pine
        // shows MORE bare limb than any other tree here, which makes it the
        // recipe that gains most from a real shadow terminator on the wood —
        // the same fact that was previously read as the reason to switch it
        // off. See the maple's note.
        receiveShadow: true,
        textureRef: 'pine',
        twist: 0.2,
        ...trunk,
      },
      leaves: {
        cluster: {
          architecture: 'layered-sprays',
          cards: 34,
          pads: 22,
          radius: 0.62,
          sizeRange: [0.34, 0.56],
          sprayLayers: 3,
          spraySpread: 1.05,
          sprayThickness: 0.18,
        },
        color: '#20402c',
        coverageScale: 1,
        // See the maple's note: below 1 to buy gap pockets. A pine needs them
        // more than the maple does, because the pads only read as separate
        // pads if sky gets between them.
        density: 0.7,
        shape: 'needle-fascicle',
        ...leaves,
      },
      // NOT 'large', and not 'medium' either. Both root presets throw long,
      // thin, sharply tapered roots that render as black spikes lying flat on
      // the ground at any camera low enough to see the base — photographed in
      // this pass at both settings. 'small' still flares the collar enough for
      // the Gate 1 ground-contact shot without the spider legs.
      roots: 'small',
    },
  };
}

export const GARDEN_PINES = [
  pineVariant({
    variant: 1,
    seed: PINE_BASE_SEED,
    label: 'GDN-PINE-MASS variant 1 — slanting, low broad pads',
    silhouette: 'slanting, low broad pads',
    targetHeightMetres: 6.5,
    branches: { angle: 64, children: 5, lengthRatio: 0.44, gnarliness: 0.5, start: 0.3 },
    trunk: { height: 3.4, lean: 0.3, bend: 0.28, gnarl: 0.46 },
    leaves: { color: '#20402c' },
  }),
  pineVariant({
    variant: 2,
    seed: PINE_BASE_SEED + GARDEN_SEED_STRIDE,
    label: 'GDN-PINE-MASS variant 2 — tall irregular, high pads',
    silhouette: 'tall irregular, high pads',
    targetHeightMetres: 7.4,
    branches: { angle: 54, children: 5, lengthRatio: 0.4, gnarliness: 0.54, start: 0.4 },
    trunk: { height: 4.1, lean: 0.16, bend: 0.2, gnarl: 0.5, twist: 0.26 },
    leaves: { color: '#294a35' },
  }),
  pineVariant({
    variant: 3,
    seed: PINE_BASE_SEED + GARDEN_SEED_STRIDE * 2,
    label: 'GDN-PINE-MASS variant 3 — short broad, heavily shaped',
    silhouette: 'short broad, heavily shaped',
    targetHeightMetres: 5.6,
    branches: { angle: 72, children: 4, lengthRatio: 0.5, gnarliness: 0.56, start: 0.22 },
    trunk: { height: 2.8, lean: 0.42, bend: 0.36, gnarl: 0.52, twist: 0.14 },
    leaves: { color: '#1c3826' },
  }),
];

export const GARDEN_TREES = [...GARDEN_MAPLES, ...GARDEN_PINES];

// ---------------------------------------------------------------------------
// GDN-SHRUB — clipped azalea masses. StylizedBush, NOT BranchTree.
//
// A clipped azalea is a solid rounded leaf mass with no visible woody
// structure at all. BranchTree is the wrong instrument for it in a specific,
// measurable way: BranchTree hard-sets `leafPlacement: 'tips'` with no shell
// fill, which is exactly the property that makes its pine pads and its maple
// tiers work — foliage only at branch ends, wood on show in between. That is
// the opposite of a sheared mass. Forcing it would mean building a woody
// skeleton and then hiding all of it, paying for several thousand triangles of
// trunk and limb that no frame will ever see.
//
// StylizedBush is the same first-party canopy system with the skeleton removed:
// same deterministic seeding, same leaf-card geometry, same vegetation shader,
// same wind and shadow contract. It is the correct ToonLab tool here.
//
// Moss beds, pond-edge planting and the ornamental clumps stay with ToonLab
// Grass — they are ground-plane cover, not a discrete object with a silhouette.
// ---------------------------------------------------------------------------

const SHRUB_BASE_SEED = 6421;

export const GARDEN_SHRUBS = [
  {
    id: 'GDN-SHRUB-V1',
    family: 'GDN-SHRUB',
    species: 'Rhododendron indicum — clipped satsuki azalea',
    variant: 1,
    label: 'GDN-SHRUB variant 1 — tight low dome',
    engine: 'stylized-bush',
    slot: 'garden-low-planting',
    slotLabel: 'Clipped low planting along the path and pond margin (§2 band 2)',
    seedRule: `base seed ${SHRUB_BASE_SEED} + 0 x ${GARDEN_SEED_STRIDE}`,
    targetHeightMetres: 0.55,
    settings: {
      seed: SHRUB_BASE_SEED,
      size: 0.32,
      canopyColor: '#33632f',
      width: 1.5,
      depth: 1.4,
      flatten: 0.46,
      leafDensity: 1.4,
      canopyLayout: { lobeCount: 5, spread: 0.72 },
      canopy: { cardCount: 2600, cardSizeRange: [0.3, 0.5], shellFill: true },
    },
  },
  {
    id: 'GDN-SHRUB-V2',
    family: 'GDN-SHRUB',
    species: 'Rhododendron indicum — clipped satsuki azalea',
    variant: 2,
    label: 'GDN-SHRUB variant 2 — taller rounded mass',
    engine: 'stylized-bush',
    slot: 'garden-low-planting',
    slotLabel: 'Clipped low planting along the path and pond margin (§2 band 2)',
    seedRule: `base seed ${SHRUB_BASE_SEED} + 1 x ${GARDEN_SEED_STRIDE}`,
    targetHeightMetres: 0.85,
    settings: {
      seed: SHRUB_BASE_SEED + GARDEN_SEED_STRIDE,
      size: 0.37,
      canopyColor: '#2e5b2c',
      width: 1.25,
      depth: 1.2,
      flatten: 0.6,
      leafDensity: 1.45,
      canopyLayout: { lobeCount: 6, spread: 0.6 },
      canopy: { cardCount: 2800, cardSizeRange: [0.28, 0.46], shellFill: true },
    },
  },
  {
    id: 'GDN-SHRUB-V3',
    family: 'GDN-SHRUB',
    species: 'Rhododendron indicum — clipped satsuki azalea',
    variant: 3,
    label: 'GDN-SHRUB variant 3 — long low drift',
    engine: 'stylized-bush',
    slot: 'garden-low-planting',
    slotLabel: 'Clipped low planting along the path and pond margin (§2 band 2)',
    seedRule: `base seed ${SHRUB_BASE_SEED} + 2 x ${GARDEN_SEED_STRIDE}`,
    targetHeightMetres: 0.45,
    settings: {
      seed: SHRUB_BASE_SEED + GARDEN_SEED_STRIDE * 2,
      size: 0.23,
      canopyColor: '#38683a',
      width: 2.1,
      depth: 1.3,
      flatten: 0.4,
      leafDensity: 1.35,
      canopyLayout: { lobeCount: 7, spread: 0.95 },
      canopy: { cardCount: 2400, cardSizeRange: [0.32, 0.52], shellFill: true },
    },
  },
];

export const STILLWATER_GARDEN_PLANTING = [...GARDEN_TREES, ...GARDEN_SHRUBS];
