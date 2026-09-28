// Stillwater Lane — the street's generated prop kit.
//
// Spec: launch-plan/21-stillwater-lane-street-addendum.md §3 (PROP-LANE-01/02/03) and §4
// (real ground detail and human-scale construction at close camera).
// Ledger: launch-plan/19-launch-production-decision-log.md.
//
// Mount these; do not reach into the asset directories directly. Every `metres` below was
// MEASURED from the delivered GLB's bounds by scripts/author-prop-group.py and is the number to
// place against, per the D19-146 standing rule. Nothing here came from a generation prompt.
//
// HOW THESE WERE MADE, IN ONE PARAGRAPH
//
// One concept image per group at 1K, `style: "raw"` (D19-147); one `image_to_model`; one
// `model_segment`; then author-prop-group.py partitions the segment's material slots into
// placeable objects, scales each one to its own real-world dimension, re-origins it to its
// footprint at ground level, and writes LOD0/1/2 plus the world-scale TEXCOORD_1 UV set. The
// generated atlas is DISCARDED (D-003) and every prop is surfaced from the §9 set through
// stillwaterPropSurfacing.js.
//
// WHAT THE GROUP RECIPE ACTUALLY BOUGHT, MEASURED
//
// D-018a claimed a group image gives coherent size relationships. It does not. Anchoring
// PROP-LANE-01 on the signal pole's real 5.0 m left the manhole 2.5 m across and the bollard at
// 1.56 m — an illustrator drawing a row gives each object similar VISUAL weight, which is the
// opposite of drawing to one scale. Every object is therefore scaled independently. What the
// recipe DID buy is real and worth keeping: one shared weathering pass, one material family, and
// 19-25 credits an object instead of 42.

import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { fitPropToRecord, styleProp, surfaceProp } from './stillwaterPropSurfacing.js';
import { buildLaneOverheadWires } from './stillwaterLaneWires.js';

export { buildLaneOverheadWires };

const LANE_ROOT = '/assets-local/launch-world/props/lane';

// WEATHERING TINTS
//
// MAT-CITY-01 is "pale dressed stone", authored for a teahouse plinth and correct there. Bound
// raw to a utility pole it renders near-white in the styled rig, and a Japanese distribution pole
// is a mid-value stained grey. Measured in labs/prop-verify/ under the garden's own sun, not
// guessed against a swatch.
//
// The correction is a per-prop `tint` rather than a second baked recipe. The tile, the normal
// and the ORM are all still right; re-baking a whole material to move a value is how a set ends
// up carrying six near-duplicates. Tints live on the RECORD, so a prop cannot be mounted without
// its correction the way it could if the value sat at a call site.

/**
 * PROP-LANE-01 — street systems.
 *
 * `measured` is [x, height, z] in THREE.js axes, converted from the authoring script's Blender
 * triple. `scaleFrom` names the axis the record was solved on: height for anything a person
 * stands beside, footprint for anything set into the paving, because that is the dimension the
 * scene actually has to fit.
 */
export const LANE_STREET_SYSTEMS = Object.freeze([
  Object.freeze({
    id: 'signal-pole', label: 'Traffic signal pole with mast arm', slot: 'cityMetal',
    dir: 'PROP-LANE-01/signal-pole', metres: 5.0, scaleFrom: 'y',
    measured: Object.freeze([2.07, 5.0, 2.39]), triangles: Object.freeze([30988, 3996, 1198]),
    // Doc 21 §2's foreground occluder. The mast arm reaches 2.4 m into the street, which is
    // what makes it work at 18-30% of frame without blocking the subject.
    use: 'Foreground occluder at the street end; head is on the mast arm, not the pole',
    moss: 0.05,
  }),
  Object.freeze({
    id: 'wall-lamp', label: 'Wall-mounted street lamp on mounting pier', slot: 'cityStone',
    dir: 'PROP-LANE-01/wall-lamp', metres: 3.4, scaleFrom: 'y', tint: Object.freeze([0.76, 0.75, 0.72]),
    measured: Object.freeze([2.46, 3.4, 1.85]), triangles: Object.freeze([28043, 8998, 2399]),
    // Arrives with the pier it was drawn against. Bury the pier in a wall face — doc 21 §2 puts
    // wall-mounted utility along the boundary wall, so the pier is useful rather than waste.
    use: 'Garden boundary wall or shopfront flank; pier buries into the wall',
    moss: 0.4,
  }),
  Object.freeze({
    id: 'guard-rail', label: 'Painted steel pedestrian guard rail', slot: 'cityMetal',
    dir: 'PROP-LANE-01/guard-rail', metres: 1.1, scaleFrom: 'y',
    measured: Object.freeze([1.0, 1.1, 1.59]), triangles: Object.freeze([10712, 3199, 900]),
    use: 'Repeat along the kerb line; 1.1 m top rail is doc 21 §4’s rail band',
    moss: 0.1,
  }),
  Object.freeze({
    id: 'bollard', label: 'Concrete bollard with reflector band', slot: 'cityStone',
    dir: 'PROP-LANE-01/bollard', metres: 0.9, scaleFrom: 'y', tint: Object.freeze([0.80, 0.80, 0.78]),
    measured: Object.freeze([0.91, 0.9, 0.29]), triangles: Object.freeze([6985, 1997, 597]),
    use: 'Kerb line and gate approach',
    moss: 0.25,
  }),
  Object.freeze({
    id: 'drain-grates', label: 'Cast iron drain grates in concrete pad', slot: 'cityMetal',
    dir: 'PROP-LANE-01/drain-grates', metres: 1.2, scaleFrom: 'x',
    measured: Object.freeze([1.2, 0.067, 0.75]), triangles: Object.freeze([24438, 5998, 1597]),
    // Doc 21 §4 names drains explicitly as ground detail. Set flush and let the damp margin
    // moss run out of the pad edge.
    use: 'Set flush at the kerb channel; doc 21 §4 ground detail',
    moss: 0.55,
  }),
  Object.freeze({
    id: 'manhole', label: 'Cast iron manhole cover in concrete pad', slot: 'cityMetal',
    dir: 'PROP-LANE-01/manhole', metres: 0.9, scaleFrom: 'x',
    measured: Object.freeze([0.9, 0.207, 0.68]), triangles: Object.freeze([17236, 4500, 1199]),
    use: 'Set flush in the asphalt centre line',
    moss: 0.35,
  }),
  Object.freeze({
    id: 'utility-cabinet', label: 'Louvred utility cabinet on plinth', slot: 'cityMetal',
    dir: 'PROP-LANE-01/utility-cabinet', metres: 1.35, scaleFrom: 'y',
    measured: Object.freeze([0.46, 1.35, 0.92]), triangles: Object.freeze([21118, 4997, 1399]),
    use: 'Against the boundary wall; real louvres and hinges, not painted-on',
    moss: 0.3,
  }),
  Object.freeze({
    id: 'standpipe', label: 'Standpipe with valve wheel on plinth', slot: 'cityMetal',
    dir: 'PROP-LANE-01/standpipe', metres: 1.0, scaleFrom: 'y',
    measured: Object.freeze([0.39, 1.0, 0.34]), triangles: Object.freeze([13434, 3597, 999]),
    use: 'Wall base, beside the cabinet',
    moss: 0.45,
  }),
]);

/**
 * PROP-LANE-02 — street life.
 *
 * Six of eight ship. The two rejects are listed in `LANE_REJECTED` rather than deleted, because
 * a reject that leaves no trace gets regenerated by the next owner at the same cost.
 */
export const LANE_STREET_LIFE = Object.freeze([
  Object.freeze({
    id: 'vending-machine', label: 'Drinks vending machine, blank front', slot: 'cityMetal',
    dir: 'PROP-LANE-02/vending-machine', metres: 1.95, scaleFrom: 'y',
    measured: Object.freeze([0.66, 1.95, 1.0]), triangles: Object.freeze([11374, 8999, 2400]),
    // BLANK BY CONSTRUCTION. Doc 21 §3 prohibits readable text and brand marks; the concept was
    // prompted for a blank front and the delivered model has no lettering, logo or label
    // anywhere. If the panel needs art it comes from the 18-entry non-textual signage atlas
    // (launch-plan/review/signage-standdown.md) — colour fields and abstract marks, no
    // lettering — and never from a generated atlas, which §2 prohibits on flat geometry.
    use: 'Doc 21 §2 foreground occluder; the lit panel is the street’s one warm pool',
    signage: 'blank — see launch-plan/review/signage-standdown.md for the approved art source',
    moss: 0.05,
  }),
  Object.freeze({
    id: 'crates', label: 'Stacked plastic crates', slot: 'cityMetal',
    dir: 'PROP-LANE-02/crates', metres: 0.9, scaleFrom: 'y',
    measured: Object.freeze([0.84, 0.9, 0.55]), triangles: Object.freeze([12646, 4999, 1400]),
    use: 'Shopfront service side; stack and rotate for density',
    moss: 0.05,
  }),
  Object.freeze({
    id: 'barrel', label: 'Steel drum barrel', slot: 'cityMetal',
    dir: 'PROP-LANE-02/barrel', metres: 0.88, scaleFrom: 'y',
    measured: Object.freeze([0.65, 0.88, 0.79]), triangles: Object.freeze([7234, 3998, 1099]),
    use: 'Service alley clutter',
    moss: 0.2,
  }),
  Object.freeze({
    id: 'cones', label: 'Traffic cone', slot: 'cityMetal',
    dir: 'PROP-LANE-02/cones', metres: 0.7, scaleFrom: 'y',
    measured: Object.freeze([0.55, 0.7, 0.46]), triangles: Object.freeze([3258, 3000, 900]),
    // The concept drew two; the generator merged them into one cone with its weighted base.
    // One cone instanced two or three times reads better than a fused pair anyway.
    use: 'Instance 2-3 times; the cheapest saturated accent on the street',
    moss: 0,
  }),
  Object.freeze({
    id: 'waste-bin', label: 'Lidded waste bin', slot: 'cityMetal',
    dir: 'PROP-LANE-02/waste-bin', metres: 0.95, scaleFrom: 'y',
    measured: Object.freeze([0.75, 0.95, 0.58]), triangles: Object.freeze([6224, 3999, 1100]),
    use: 'Wall base beside the shopfront',
    moss: 0.15,
  }),
  Object.freeze({
    id: 'street-planter', label: 'Glazed street planter pot', slot: 'gardenCeramic',
    dir: 'PROP-LANE-02/street-planter', metres: 0.55, scaleFrom: 'y',
    measured: Object.freeze([0.43, 0.55, 0.42]), triangles: Object.freeze([4311, 4311, 1900]),
    // Ships EMPTY. The generated shrub was dropped at authoring time: foliage out of
    // image-to-3D is a blobby mass, and vegetation is a first-party ToonLab system rather than
    // an asset gap. Plant it from the tree/flower systems.
    use: 'Shopfront doorway; plant from the first-party vegetation systems, not from generation',
    moss: 0.3,
  }),
]);

/** PROP-LANE-03 — the pole hardware. The wire spans are procedural; see stillwaterLaneWires.js. */
export const LANE_POLES = Object.freeze([
  Object.freeze({
    id: 'pole-crossarm', label: 'Concrete pole, two timber crossarms and insulators',
    slot: 'cityStone', dir: 'PROP-LANE-03/pole-crossarm', metres: 10.0, scaleFrom: 'y', tint: Object.freeze([0.70, 0.71, 0.69]),
    measured: Object.freeze([1.21, 10.0, 3.4]), triangles: Object.freeze([35664, 6998, 1796]),
    // Attachment heights for buildLaneOverheadWires, as fractions re-derived from the model's
    // own crossarm positions rather than assumed.
    attachments: Object.freeze([7.4, 6.6, 4.9]),
    moss: 0.5,
  }),
  Object.freeze({
    id: 'pole-transformer', label: 'Concrete pole with transformer can', slot: 'cityStone',
    dir: 'PROP-LANE-03/pole-transformer', metres: 10.0, scaleFrom: 'y', tint: Object.freeze([0.70, 0.71, 0.69]),
    measured: Object.freeze([2.15, 10.0, 2.15]), triangles: Object.freeze([34228, 7995, 2097]),
    attachments: Object.freeze([7.4, 6.6, 4.9]),
    moss: 0.5,
  }),
  Object.freeze({
    id: 'pole-stay', label: 'Concrete pole with stay-wire anchor', slot: 'cityStone',
    dir: 'PROP-LANE-03/pole-stay', metres: 10.0, scaleFrom: 'y', tint: Object.freeze([0.72, 0.73, 0.71]),
    measured: Object.freeze([1.25, 10.0, 1.72]), triangles: Object.freeze([17670, 4993, 1394]),
    attachments: Object.freeze([7.4, 6.6, 4.9]),
    moss: 0.5,
  }),
  Object.freeze({
    id: 'pole-junction', label: 'Concrete pole with junction box and drop loops',
    slot: 'cityStone', dir: 'PROP-LANE-03/pole-junction', metres: 10.0, scaleFrom: 'y', tint: Object.freeze([0.70, 0.71, 0.69]),
    measured: Object.freeze([1.48, 10.0, 1.62]), triangles: Object.freeze([27900, 6996, 1796]),
    attachments: Object.freeze([7.4, 6.6, 4.9]),
    moss: 0.5,
  }),
  Object.freeze({
    id: 'pole-short', label: 'Short bracket pole', slot: 'cityStone',
    dir: 'PROP-LANE-03/pole-short', metres: 6.5, scaleFrom: 'y', tint: Object.freeze([0.68, 0.69, 0.67]),
    measured: Object.freeze([2.06, 6.5, 3.06]), triangles: Object.freeze([27208, 4999, 1398]),
    attachments: Object.freeze([5.2, 4.6, 3.4]),
    moss: 0.55,
  }),
]);

/**
 * Rejected, and why. Kept so the next owner does not pay 42 credits to rediscover it.
 *
 * Both failures share ONE cause, and it is a new rule rather than a restatement of D-016b.
 * D-016b predicted REAR coherence from volume complexity. These two are not about the rear and
 * not about complexity: a bicycle frame and a folding lattice are THIN OPEN STRUCTURES whose
 * members are finer than the generator's effective voxel, so they weld to each other everywhere,
 * the front included. Compact closed volumes in the SAME generation — the barrel, the bin, the
 * vending machine — came out clean at similar triangle counts.
 *
 * **Do not send open lattice or tubular frames through 1K image-to-3D.** Bicycles, railings with
 * thin balusters, ladders, scaffold, fencing wire and folding barriers all fall in this class.
 */
export const LANE_REJECTED = Object.freeze([
  Object.freeze({
    id: 'bicycle', dir: 'PROP-LANE-02/bicycle',
    reason: 'Frame tubes, forks, spokes and rack weld into a fused blob. Not a bicycle at any distance.',
  }),
  Object.freeze({
    id: 'barrier', dir: 'PROP-LANE-02/barrier',
    reason: 'Folding lattice welds into a tangle. Passable beyond ~8 m, fails at doc 21 §4’s close camera.',
  }),
]);

/** Everything the scene owner should mount, in one list. */
export const STILLWATER_LANE_PROPS = Object.freeze([
  ...LANE_STREET_SYSTEMS, ...LANE_STREET_LIFE, ...LANE_POLES,
]);

const loader = new GLTFLoader();

/**
 * Loads, scales, surfaces and styles one lane prop.
 *
 * Returns the styled root plus the counts a caller should ASSERT on:
 * `surfaceLightingMaterialCount` must be non-zero, or the prop is outside the scene's
 * shadow-fill model and will diverge from first-party stone beside it (D19-150 / D-018c).
 *
 * @param {object} prop  An entry from STILLWATER_LANE_PROPS.
 * @param {object} [options]
 * @param {number} [options.lod]         0 | 1 | 2.
 * @param {number} [options.shadowFill]  The scene's fill; the garden and lane share 0.35.
 * @param {number[]} [options.shadowFillTint]
 * @param {number} [options.moss]        Override the record's damp-margin moss weight.
 */
export async function loadLaneProp(prop, {
  lod = 0,
  shadowFill = 0.35,
  shadowFillTint = [1.16, 1.0, 0.86],
  moss = null,
} = {}) {
  const url = `${LANE_ROOT}/${prop.dir}/${prop.id}-lod${lod}.glb`;
  const gltf = await loader.loadAsync(url);
  const root = gltf.scene;
  root.name = `lane · ${prop.id}`;

  const fitted = fitPropToRecord(root, { metres: prop.metres, scaleFrom: prop.scaleFrom });
  const surfaced = await surfaceProp(root, prop.slot, {
    moss: Number.isFinite(moss) ? moss : (prop.moss ?? 0),
    tint: prop.tint ?? null,
  });

  const environmentRoot = new THREE.Group();
  environmentRoot.name = `Stillwater Lane · ${prop.id}`;
  environmentRoot.add(root);

  const styled = await styleProp(environmentRoot, {
    assetId: `launch-world/lane/${prop.id}`,
    roles: surfaced.slot.roles,
    shadowFill,
    shadowFillTint,
  });

  return {
    root: environmentRoot,
    prop,
    scale: fitted.scale,
    measured: fitted.size,
    materialId: surfaced.slot.id,
    pxPerCm: surfaced.slot.pxPerCm,
    convertedMeshCount: styled.convertedMeshCount,
    surfaceLightingMaterialCount: styled.surfaceLightingMaterialCount,
  };
}

/** Look up by id across all three lane sets. */
export function laneProp(id) {
  return STILLWATER_LANE_PROPS.find((p) => p.id === id) ?? null;
}
