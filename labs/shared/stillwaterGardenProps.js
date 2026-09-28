// Stillwater Garden — the generated prop kit, complete.
//
// Spec: launch-plan/20-stillwater-garden-scene-brief.md §3.
// Ledger: launch-plan/19-launch-production-decision-log.md D-017, D-018, D-018a/b/c.
//
// Batch 1 (D-018) delivered three lanterns, the tsukubai and five stepping stones. This module
// carries those AND the four items §3 still listed as outstanding — path edging, planters, the
// deer-scarer and the timber bridge — so the scene owner mounts one registry rather than
// tracking which batch a prop came from.
//
// The garden and the lane share stillwaterPropSurfacing.js, and that is deliberate: doc 21 §5
// requires one shared sun, one shadow family and ONE MOSS SPECIES across the wall, so the two
// halves must not surface through two code paths that can drift apart.
//
// PLACEMENT CONTRACT
//
// `metres` is MEASURED from the delivered GLB, never taken from a generation prompt (D19-146),
// and `scaleFrom` names the axis it was solved on. Every prop is re-origined to its own
// footprint centre at ground level by the authoring scripts, so placement is `position.set(x, 0,
// z)` against the terrain height sampler and nothing else.

import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import {
  GARDEN_MOSS_STOPS,
  fitPropToRecord,
  styleProp,
  surfaceProp,
} from './stillwaterPropSurfacing.js';

export { GARDEN_MOSS_STOPS };

const PROPS_ROOT = '/assets-local/launch-world/props';

/**
 * Batch 1 — D-018. Files sit directly in their asset directory rather than in a per-part
 * subdirectory, because they were authored by author-prop-lods.py before the group script
 * existed. The `file` field absorbs that difference so callers do not have to know.
 */
export const GARDEN_PROPS_BATCH_1 = Object.freeze([
  Object.freeze({
    id: 'lantern-yukimi', label: 'Stone lantern — yukimi (snow-viewing)', slot: 'granite',
    dir: 'PROP-GDN-01-lantern-yukimi', file: 'lantern', metres: 1.2, scaleFrom: 'longest',
    measured: Object.freeze([0.79, 1.2, 0.87]),
    // Broad, low, three-legged. §3 wants three lantern forms that read as different OBJECTS at
    // any distance, not one silhouette rescaled — see D-018.
    use: 'Water’s edge, low and broad over the pond lip',
    moss: 0.55,
  }),
  Object.freeze({
    id: 'lantern-kasuga', label: 'Stone lantern — kasuga (tall pedestal)', slot: 'granite',
    dir: 'PROP-GDN-01-lantern-kasuga', file: 'm-kasuga', metres: 2.4, scaleFrom: 'longest',
    use: 'Path junction; the upright accent of the lantern group',
    moss: 0.4,
  }),
  Object.freeze({
    id: 'lantern-oribe', label: 'Stone lantern — oribe (buried post)', slot: 'granite',
    dir: 'PROP-GDN-01-lantern-oribe', file: 'm-oribe', metres: 1.5, scaleFrom: 'longest',
    use: 'Beside the tsukubai, buried in the moss bed',
    moss: 0.65,
  }),
  Object.freeze({
    id: 'tsukubai', label: 'Tsukubai basin with kakei spout and ladle', slot: 'granite',
    dir: 'PROP-GDN-01-tsukubai', file: 'm-tsukubai', metres: 1.3, scaleFrom: 'longest',
    // Segmented into stone basin / bamboo / water / setting stones — genuinely four materials
    // in one object, which is the material-separation use of model_segment (D-016a).
    use: 'Set in its own stone group; the wettest prop in the garden',
    moss: 0.75,
  }),
  Object.freeze({
    id: 'stepping-stones', label: 'Stepping stones ×5', slot: 'granite',
    dir: 'GAP-GDN-STEPPING-STONE-01-stones', file: 'm-stones', metres: 3.5, scaleFrom: 'longest',
    // Closes GAP-GDN-STEPPING-STONE-01. Five separately placeable stones at h/footprint 0.236,
    // inside the required ~0.25 ceiling — zero of 480 catalog rocks could do this.
    use: 'Across the moss bed; place each stone individually to a walking stride',
    separated: 'segmented/stones-5x-separated.glb — 5 meshes, one per stone',
    moss: 0.6,
  }),
  Object.freeze({
    id: 'bamboo-fence', label: 'Bamboo fence panel — kenninji-gaki', slot: 'bamboo',
    dir: 'PROP-GDN-02-bamboo-fence', file: 'fence', metres: 2.0, scaleFrom: 'longest',
    use: 'Repeat along the garden’s inner screen line',
    moss: 0.25,
  }),
]);

/**
 * Path edging — six split granite kerb bars.
 *
 * Six bars rather than one repeated: §13 rejects obvious repetition, and a kerb run is the most
 * visible place to get caught at it. Each bar is ~0.9 × 0.20 × 0.20 m with an individually
 * split top face, so a run alternating the six reads as dressed stone rather than as extrusion.
 *
 * Doc 21 §3 reuses this same set as the STREET kerb. That is not a compromise — a Japanese back
 * street and the garden path beside it genuinely use the same dressed granite, and sharing it is
 * one more thing tying the two spaces together.
 */
export const GARDEN_PATH_EDGING = Object.freeze([1, 2, 3, 4, 5, 6].map((n) => Object.freeze({
  id: `kerb-0${n}`, label: `Split granite kerb bar ${n}`, slot: 'granite',
  dir: `PROP-GDN-03-kerb/kerb-0${n}`, metres: 0.9, scaleFrom: 'longest',
  use: 'Path edging and street kerb; alternate all six along a run',
  moss: 0.5,
})));

/** Planters — five distinct forms, all shipped EMPTY. */
export const GARDEN_PLANTERS = Object.freeze([
  Object.freeze({
    id: 'planter-bowl', label: 'Wide low glazed ceramic bowl', slot: 'gardenCeramic',
    dir: 'PROP-GDN-03-planters/planter-bowl', metres: 0.55, scaleFrom: 'x',
    measured: Object.freeze([0.55, 0.28, 0.54]), moss: 0.35,
  }),
  Object.freeze({
    id: 'planter-cylinder', label: 'Tall glazed cylinder', slot: 'gardenCeramic',
    dir: 'PROP-GDN-03-planters/planter-cylinder', metres: 0.75, scaleFrom: 'y',
    measured: Object.freeze([0.57, 0.75, 0.56]), moss: 0.4,
  }),
  Object.freeze({
    id: 'planter-pot', label: 'Unglazed earthenware pot, rolled rim', slot: 'gardenCeramic',
    dir: 'PROP-GDN-03-planters/planter-pot', metres: 0.45, scaleFrom: 'y',
    measured: Object.freeze([0.52, 0.45, 0.52]), moss: 0.45,
  }),
  Object.freeze({
    id: 'planter-box', label: 'Weathered timber planter box', slot: 'timber',
    dir: 'PROP-GDN-03-planters/planter-box', metres: 0.5, scaleFrom: 'y',
    measured: Object.freeze([0.62, 0.5, 0.56]), moss: 0.5,
  }),
  Object.freeze({
    id: 'planter-trough', label: 'Hollowed granite trough', slot: 'granite',
    dir: 'PROP-GDN-03-planters/planter-trough', metres: 0.9, scaleFrom: 'longest',
    measured: Object.freeze([0.77, 0.49, 0.9]), moss: 0.7,
  }),
].map(Object.freeze));

/**
 * The two single objects, both segmented for MATERIAL separation rather than instance
 * separation — the D-016a use of `model_segment`, not the D-018a one.
 *
 * Their LOD0 is decimated to 150k because unlike the street furniture these ARE hero props at
 * §8's band: the deer-scarer is a moving focal object and the bridge is walked across.
 */
export const GARDEN_FEATURES = Object.freeze([
  Object.freeze({
    id: 'shishi-odoshi', label: 'Deer-scarer (shishi-odoshi)', slot: 'bamboo',
    dir: 'PROP-GDN-03-shishi-odoshi', file: 'PROP-GDN-03-shishi-seg',
    metres: 1.35, scaleFrom: 'longest',
    measured: Object.freeze([0.77, 0.81, 1.35]), triangles: Object.freeze([149991, 39988, 9995]),
    // Bamboo pivot tube, two upright posts, kakei spout and a granite strike stone: 10 segment
    // slots across two material families. The strike stone and the wet margin around it want
    // `granite` and heavy moss; everything else is `bamboo`.
    materials: Object.freeze({ bamboo: 'tube, posts, spout', granite: 'strike stone' }),
    use: 'Beside the pond inlet; the strike stone stays visibly wet',
    moss: 0.7,
  }),
  Object.freeze({
    id: 'bridge', label: 'Arched timber footbridge with granite abutments', slot: 'timber',
    dir: 'PROP-GDN-03-bridge', file: 'PROP-GDN-03-bridge-seg',
    metres: 3.2, scaleFrom: 'longest',
    measured: Object.freeze([1.59, 1.19, 3.2]), triangles: Object.freeze([149974, 39981, 9980]),
    materials: Object.freeze({ timber: 'deck, beams, handrails, posts', granite: 'abutment blocks' }),
    // 1.19 m to the handrail top sits just under doc 21 §4's 0.95-1.15 m rail band once the
    // arch rise is subtracted at the crown, which is where a person actually holds it.
    use: 'Across the stream at the pond outlet; walkable, 1.59 m clear width',
    moss: 0.6,
  }),
]);

/** Everything, in one list. */
export const STILLWATER_GARDEN_PROPS = Object.freeze([
  ...GARDEN_PROPS_BATCH_1, ...GARDEN_PATH_EDGING, ...GARDEN_PLANTERS, ...GARDEN_FEATURES,
]);

const loader = new GLTFLoader();

/**
 * Loads, scales, surfaces and styles one garden prop.
 *
 * Assert `surfaceLightingMaterialCount > 0` on the result. A zero there means the prop is
 * outside the scene's shadow-fill model and WILL diverge from the first-party stone beside it,
 * by more the more fill the scene adopts — the D19-150 failure, fixed in the adapter by D-018c
 * and re-checkable here.
 */
export async function loadGardenProp(prop, {
  lod = 0,
  shadowFill = 0.35,
  shadowFillTint = [1.16, 1.0, 0.86],
  moss = null,
} = {}) {
  const stem = prop.file ?? prop.id;
  const url = `${PROPS_ROOT}/${prop.dir}/${stem}-lod${lod}.glb`;
  const gltf = await loader.loadAsync(url);
  const root = gltf.scene;
  root.name = `garden · ${prop.id}`;

  const fitted = fitPropToRecord(root, { metres: prop.metres, scaleFrom: prop.scaleFrom });
  const surfaced = await surfaceProp(root, prop.slot, {
    moss: Number.isFinite(moss) ? moss : (prop.moss ?? 0),
  });

  const environmentRoot = new THREE.Group();
  environmentRoot.name = `Stillwater Garden · ${prop.id}`;
  environmentRoot.add(root);

  const styled = await styleProp(environmentRoot, {
    assetId: `launch-world/props/${prop.id}`,
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

/** Look up by id. */
export function gardenProp(id) {
  return STILLWATER_GARDEN_PROPS.find((p) => p.id === id) ?? null;
}

/**
 * OUTSTANDING, and not dressed as done.
 *
 * The cavity-masked moss bake D-018b asked for is still not built. `surfaceProp`'s `moss`
 * weight is a uniform base tint from `GARDEN_MOSS_STOPS[3]` — the right SPECIES from the shared
 * palette, so nothing here has to be un-picked later, but uniform. It puts moss on crowns as
 * well as in crevices, and the difference between that and moss that grew is exactly the
 * difference D-018b called a fail.
 *
 * The estimator needed already exists and needs no work from its owner:
 * `computeMeshCavity(geometry, gain = 2.6)` in src/rock-shader/rockGeometryDetail.js is exported,
 * generic over any BufferGeometry, and normalised by local edge length — which is what makes it
 * behave identically on a 0.4 m kerb bar and a 3.2 m bridge. What remains is to sample the §9
 * albedo, tint low-cavity texels toward GARDEN_MOSS_STOPS[2] by the cavity term, and bake per
 * prop.
 */
export const GARDEN_PROP_MOSS_BAKE_STATUS = Object.freeze({
  built: false,
  blocker: 'none — estimator available, bake not yet written',
  estimator: 'computeMeshCavity(geometry, 2.6) — src/rock-shader/rockGeometryDetail.js',
  spec: 'D-018b cause 2; palette GARDEN_MOSS_STOPS',
});
