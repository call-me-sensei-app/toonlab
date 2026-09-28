// Stillwater Garden — authored instance dressing: the stone set and the
// BranchTree maple/pine planting.
//
// Every object here comes from a first-party ToonLab system:
//   stone   the official catalog artifacts, surfaced through
//           resolveGardenStoneSurface + applyRockShader (src/rock-shader),
//           reusing labs/shared/stillwaterGardenStones.js rather than forking it.
//           NOTE: this scene moved off the coastal `cliff-corner` set — those
//           are a TILING KIT whose flat cut faces and right-angle corners are a
//           requirement of tiling, and at the 0.16–0.44 downscale needed for
//           garden size they read as breeze blocks (D19-090). The garden set is
//           `rounded-boulder` / `flat-shelf`, re-scored from the catalog's own
//           published generator parameters rather than family names, which are
//           actively misleading (`river-worn-rock` is cut wedges and stumps).
//   trees   createBranchTree (src/vegetation/branchTree.js), surfaced by
//           setVegetationShader({ preset: 'call_me_sensei' })
//
// Nothing in this file is a stand-in. There is no placeholder for the
// manufactured items (teahouse, gate, wall, lanterns, tsukubai, bridge) — §2
// prefers an empty, prepared site to a blockout, and the terrain already
// carries their pads and their spine.
//
// Doc 20 §4 raises the stone scope: "Stone is the subject. Three assets is not
// enough". Three base shapes is what the accepted set contains, so variety is
// bought where it can honestly be bought — five distinct SCALE CLASSES, each
// with its own projection period so texel density stays constant, per-instance
// moss coverage, per-instance surface variation, and setting attitude (tilt +
// bury depth) authored per role the way a garden's stones actually are.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

import { createBranchTree, parseBranchTreeDocument } from '../../../src/vegetation/branchTree.js';
import { GARDEN_VEGETATION_SHADER } from '../../shared/stillwaterGardenTrees.js';
import { applyRockShader } from '../../../src/rock-shader/rockShaderRuntime.js';
import {
  GARDEN_STONE_VALUE_GRADE,
  MOSS_ALBEDO_URL,
  STILLWATER_GARDEN_STONES,
  gardenStonesForGroup,
  resolveGardenStoneSurface,
} from '../../shared/stillwaterGardenStones.js';

import {
  BOUNDARY,
  CASCADE,
  PATH,
  POND_MARGIN,
  UPPER_POOL_LEVEL,
  gardenHeight,
  plantableMask,
} from './terrain.js';

// D19-206 IS WITHDRAWN, and its scene-side warm anchor with it.
//
// That entry read the stone as "white-blue", blamed the cool
// `GARDEN_STONE_ANCHOR`, and reversed the channel order to [0.50, 0.468, 0.425]
// to drag the set warm. The stone workstream then MEASURED the same surface
// (`launch-plan/review/garden-stone-value-grade.md`) and found the premise
// false: bare stone means 0.072 linear — a mid-dark grey, not a bright one —
// and what makes it read white is that it is a desaturated NEUTRAL standing
// against saturated greens. Simultaneous contrast, a chroma problem wearing a
// value problem's clothes. Warming the anchor moved it further into the moss's
// own hue family, which is the direction that makes it worse.
//
// `GARDEN_STONE_VALUE_GRADE` is that workstream's recommendation, adopted whole
// rather than re-derived: expand the tonal range (`contrast` 0.72 -> 1.5, which
// buys +19% spread for the key light to model form with), hold the value where
// it is (`brightness` -0.11, so the range costs nothing against the moss/stone
// proximity), and swap the neutral for a COOL blue-grey at the same luminance
// (0.626 against 0.633). Cool stone against warm yellow-green moss is a
// complementary separation — which is what lets the two sit inside one value
// band and still read as different materials.
//
// `material.tint` is applied BEFORE the moss mix, so none of this touches the
// moss, the cushion work or GARDEN_MOSS_STOPS.
//
// D19-250 — THE GRADE'S TINT OVERSHOOTS INTO VISIBLE LAVENDER. Scene-side pull-
// back, and a recommendation recorded for the stone owner rather than an edit to
// their module.
//
// The DIRECTION is right and is kept: hue is the axis that separates stone from
// moss here, because the two sit inside one narrow value band by design. What is
// wrong is the magnitude. Measured on the recommended tint:
//
//   [0.58, 0.63, 0.72]   chroma (max-min)/max = 19.4%,  luminance 0.6259
//
// Against a catalog albedo whose own chroma is ~7%, a 19% multiplicative push is
// not a cool grey, it is a colour: `garden-pass6-hero.png` renders every set
// stone, every margin stone and the whole stepping-stone run periwinkle, and the
// sanzon triad — the mid-band subject — reads as painted blue against the pond.
// The review lab the grade was measured in has a neutral moss-tinted floor and a
// bare sky; the shipped rig adds a violet SH probe (`skyProbeColor` [0.88, 0.83,
// 1.0]) and a violet `shadowTint`, so the same tint arrives with the scene's own
// violet stacked on top of it. That is why the lab A/B read as "cool grey" and
// the assembled frame reads as lavender.
//
// The pull-back holds LUMINANCE (0.6259 -> 0.6252, within 0.1%) and halves the
// chroma, so every measurement the grade was justified by — the tonal spread from
// `contrast: 1.5`, the moss/stone separation from `brightness: -0.11` — is
// untouched. Only the hue magnitude moves.
//
//   [0.605, 0.628, 0.658]  chroma 8.1%,  luminance 0.6252
//
// Still cooler than the achromatic tint it replaced, so the complementary
// separation the grade exists for survives; no longer a hue the eye names.
const GARDEN_STONE_TINT_PULLBACK = Object.freeze([0.605, 0.628, 0.658]);

// The scene-side `GARDEN_STONE_TINT` override is GONE, deliberately.
//
// It existed to drag the coastal set's near-white `COASTAL_STONE_ANCHOR`
// ([1, 1, 0.9876]) toward garden granite. The garden stone module now owns that
// decision properly — `GARDEN_STONE_ANCHOR` plus `GARDEN_STONE_HARMONIZE` — and
// a second tint applied on top would fight a harmonisation that was measured
// against the moss palette. One owner per decision.

// Seeded LCG. Placement must be identical run to run — the filler register's
// equivalence test and every A/B capture depend on it.
function rng(seed) {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };
}

// ---------------------------------------------------------------------------
// Stone
// ---------------------------------------------------------------------------

/**
 * Scale classes.
 *
 * `bury` is the fraction of the instance's own height that sits below grade.
 * Japanese garden setting buries roughly a third of a set stone so it reads as
 * outcrop rather than as an object placed on the lawn; a stepping stone is
 * buried almost entirely and shows only its walking face.
 *
 * `projection` is derived per class from the asset's measured bounds times the
 * class scale, so a 0.14-scale stepping stone samples the detail map at the
 * same texel density as a 0.42-scale cascade rock. Without it every downscaled
 * instance reads lower-frequency and the small stone turns to soap (D19-031,
 * D19-063).
 */
// PASS 2 — RESCALED FOR GARDEN-SCALE ASSETS.
//
// These scales used to run 0.16–0.44 because the source was the §6.3 COASTAL
// cliff set, whose hero asset measures 4.26 x 5.94 x 3.79 m. Uniformly
// downscaling a cliff by 0.16 is exactly what D19-090 recorded: the kit's flat
// vertical cut faces and right-angle corners survive the downscale, so the
// garden filled with what read as a scatter of concrete breeze-blocks.
//
// `STILLWATER_GARDEN_STONES` replaces them with rounded, water-worn catalog
// forms already AT garden scale — the set-stone anchor measures 1.28 x 1.27 x
// 0.88 m — so the classes now sit near 1.0 and the asset provides the form
// instead of a downscale pretending to.
//
// `group` binds each class to the compositional group the stone module authored
// it for, so a cascade stone is a stone chosen to sit in falling water rather
// than whichever asset happened to be at index 0.
export const STONE_CLASSES = Object.freeze({
  cascade: Object.freeze({ bury: 0.18, group: 'cascade', moss: 1.15, scale: 1.12, tilt: 0.1 }),
  island: Object.freeze({ bury: 0.4, group: 'gravel-island', moss: 0.4, scale: 0.78, tilt: 0.05 }),
  margin: Object.freeze({ bury: 0.54, group: 'path-edging', moss: 1.05, scale: 0.62, tilt: 0.08 }),
  set: Object.freeze({ bury: 0.3, group: 'set-stone', moss: 0.85, scale: 1.0, tilt: 0.14 }),
  // A stepping stone shows its walking face and nothing else: most of its own
  // height sits under the water and the bed.
  stepping: Object.freeze({ bury: 0.82, group: 'path-edging', moss: 0.25, scale: 0.56, tilt: 0.03 }),
});

/**
 * The hand-set stone. Every group is a composition, not a scatter:
 *
 * - `cascade`  the falls arrangement — a tall flanking pair and the lip stone
 *              the water breaks over.
 * - `sanzon`   the classical triad on the pond's north-east margin, read
 *              across the water from the near path.
 * - `island`   two stone groups standing in the raked gravel.
 * - `accent`   single stones marking the path bend and the terrace approach.
 *
 * `[x, z, asset, yaw, class, scaleJitter]`
 */
const SET_STONES = Object.freeze([
  // Cascade arrangement, flanking the drop axis.
  [-13.4, -10.0, 0, 24, 'cascade', 1.06],
  [-10.5, -11.6, 1, 208, 'cascade', 0.92],
  [-12.4, -11.4, 2, 132, 'cascade', 1.0],
  [-9.6, -8.6, 2, 301, 'margin', 1.04],

  // The sanzon triad on the far (north-east) margin — the mid-band subject.
  [1.2, -8.5, 0, 48, 'set', 1.05],
  [2.6, -9.4, 1, 176, 'set', 0.86],
  [-0.2, -9.5, 2, 292, 'set', 0.94],

  // Gravel-sea islands.
  [-13.0, 3.0, 1, 66, 'island', 1.02],
  [-12.1, 4.1, 2, 231, 'island', 0.78],
  [-9.2, 6.9, 0, 143, 'island', 0.9],
  [-10.1, 7.6, 2, 18, 'island', 0.7],

  // Path and terrace accents.
  [-8.9, 8.4, 0, 205, 'set', 0.82],
  [5.9, -1.2, 1, 97, 'margin', 1.0],
  [12.6, -6.2, 0, 260, 'set', 0.88],
  [-2.4, 12.4, 2, 34, 'margin', 0.92],
]);

/**
 * Pond-margin stones and the stepping-stone run, both authored in the pond
 * margin's own curve frame (`createCurveFrame`, D19-066 / FILL-013).
 *
 * A constant-width band around an irregular pond cannot be expressed as a
 * rectangle with a hole in it, and a hand-authored table in world XZ drifts off
 * the waterline exactly the way the coastal tree ridge did. `stepAlong`
 * distributes by ARC LENGTH, so the stones stay evenly spaced around the pond's
 * lobes instead of bunching where the bearing parameter bunches.
 *
 * Positive offset is inward (the curve's left normal on a closed loop), so the
 * stepping stones sit IN the shallow shelf and the margin stones sit just
 * outside the waterline on the bank.
 */
function curveStones() {
  const placements = [];

  const marginStones = POND_MARGIN.stepAlong({
    heightAt: gardenHeight,
    jitterAlong: 0.55,
    jitterOffset: 0.22,
    offset: -0.32,
    seed: 3_307,
    spacing: 3.15,
  });
  for (const [index, stone] of marginStones.entries()) {
    placements.push({
      asset: index % 3,
      className: 'margin',
      scaleJitter: 0.78 + ((index * 37) % 11) / 24,
      x: stone.x,
      yaw: (index * 137.5) % 360,
      z: stone.z,
    });
  }

  // The crossing: a run of stepping stones through the shallow south margin,
  // between bearings 0.62 and 2.32 rad. Depth on that arc is 0.10–0.30 m, so
  // the stones stand proud of the water and the caustics break around them.
  const crossing = POND_MARGIN.stepAlong({
    alongRange: [0.72, 2.1],
    heightAt: gardenHeight,
    jitterAlong: 0.09,
    jitterOffset: 0.16,
    offset: 1.05,
    seed: 5_101,
    // Stride, not paving. Pass 1 ran them at 0.86 m and produced a continuous
    // white kerb through the shallows instead of a line of stones you could
    // count.
    spacing: 1.18,
  });
  for (const [index, stone] of crossing.entries()) {
    placements.push({
      asset: (index + 1) % 3,
      className: 'stepping',
      // A stepping-stone run alternates a wide stone with a narrow one so the
      // stride reads as designed rather than as a paved strip.
      scaleJitter: index % 2 === 0 ? 1.06 : 0.82,
      x: stone.x,
      yaw: (index * 63.7) % 360,
      z: stone.z,
    });
  }

  return placements;
}

function loadTexture(loader, url, { srgb }) {
  return new Promise((resolve, reject) => {
    loader.load(url, (texture) => {
      texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.anisotropy = 8;
      resolve(texture);
    }, undefined, reject);
  });
}

/**
 * Loads the catalog stone and instances it across every garden role.
 *
 * @param {object} options
 * @param {THREE.WebGPURenderer} options.renderer required for KTX2 support detection
 * @param {{ place: Function }} options.surface
 */
export async function createGardenStone({ renderer, surface }) {
  const ktx2 = new KTX2Loader().setTranscoderPath('/basis/').setWorkerLimit(2).detectSupport(renderer);
  const gltfLoader = new GLTFLoader().setKTX2Loader(ktx2);
  const textureLoader = new THREE.TextureLoader();

  const mossTexture = await loadTexture(textureLoader, MOSS_ALBEDO_URL, { srgb: true });
  const textureCache = new Map();
  const sources = new Map();

  for (const stone of STILLWATER_GARDEN_STONES) {
    const gltf = await new Promise((resolve, reject) => {
      gltfLoader.load(stone.url, resolve, undefined, reject);
    });
    const root = gltf.scene;
    // The catalog packs all three LODs as sibling nodes; the launch frames are
    // hero stills, so LOD0 is pinned (the runtime LOD switch is a Gate 4 item).
    root.traverse((object) => {
      if (/_LOD\d$/.test(object.name)) object.visible = object.name.endsWith('_LOD0');
    });
    sources.set(stone.id, root);
  }

  // One prototype per (stone x class it is authored for). Each class only ever
  // draws from its own compositional group, so a cascade placement gets a stone
  // chosen to stand in falling water rather than whichever asset sat at index 0
  // — which is what the old `asset: 0|1|2` index was really doing.
  const prototypes = new Map();
  const classNames = Object.keys(STONE_CLASSES);
  for (const [classIndex, className] of classNames.entries()) {
    const stoneClass = STONE_CLASSES[className];
    const groupStones = gardenStonesForGroup(stoneClass.group);
    for (const [stoneIndex, stone] of groupStones.entries()) {
      const surfaceSpec = resolveGardenStoneSurface(stone, {
        // Doc 20 §4 promotes moss on stone from a "variation trick" to a hero
        // material, and each ROLE carries its own coverage: the cascade and
        // margin stones are permanently damp, the gravel-sea islands are
        // deliberately dry. The module owns the palette (GARDEN_MOSS_STOPS), so
        // moss cannot change species where a stone meets the ground or a
        // lantern base.
        mossCoverage: Math.min(stone.moss * stoneClass.moss, 1),
        // No `paletteAnchor` override — the stone module's own
        // `GARDEN_STONE_ANCHOR` stands, and `GARDEN_STONE_VALUE_GRADE` below
        // supplies the tint the grade was measured with. See the withdrawal of
        // D19-206 at the top of this file.
        //
        // The placement scale is handed to the resolver rather than applied
        // only to the transform, so the projection period and the displacement
        // relief are both derived from the stone's FINISHED size — texel
        // density and relief-to-size ratio stay constant across classes.
        scale: stoneClass.scale,
        // Decorrelates a stone that appears in more than one class.
        variation: stone.variation + classIndex * 3,
      });
      const textures = { moss: mossTexture };
      for (const [slot, url] of Object.entries(surfaceSpec.textureUrls)) {
        if (!textureCache.has(url)) {
          textureCache.set(url, await loadTexture(textureLoader, url, { srgb: slot === 'rock' }));
        }
        textures[slot] = textureCache.get(url);
      }
      const root = sources.get(stone.id).clone(true);
      applyRockShader(root, {
        preset: 'call_me_sensei',
        ...surfaceSpec.settings,
        // The pass-1 D19-062 mitigation (`ambientFloor`, `skyFillStrength`)
        // stays removed — the fill belongs in the lighting model.
        //
        // `GARDEN_STONE_VALUE_GRADE`, adopted whole. Spread LAST so the grade's
        // `projection` merges onto the resolver's `projection.scale` rather
        // than replacing it: the scale is a texel-density solve per class and
        // losing it would put every downscaled stone back on the wrong period
        // (D19-031 / D19-063).
        material: {
          ...(surfaceSpec.settings.material ?? {}),
          ...GARDEN_STONE_VALUE_GRADE.material,
          // D19-250, LAST so it wins over the grade's own tint. See the block at
          // the top of this file — the grade's direction is kept, its magnitude
          // is halved at matched luminance.
          tint: [...GARDEN_STONE_TINT_PULLBACK],
        },
        projection: {
          ...(surfaceSpec.settings.projection ?? {}),
          ...GARDEN_STONE_VALUE_GRADE.projection,
        },
      }, {
        // The catalog's rounded families ship 120–462 triangles, which is under
        // half what got the cliff kit rejected. The stone module closes that
        // procedurally, and the subdivision has to run through `detail` because
        // it replaces every vertex buffer before any attribute is written.
        detail: surfaceSpec.geometryDetail,
        name: `ToonLab · ${stone.label} · ${className}`,
        textures,
        variation: surfaceSpec.variation,
      });
      prototypes.set(`${className}:${stoneIndex}`, root);
    }
    prototypes.set(`${className}:count`, groupStones.length);
  }

  const group = new THREE.Group();
  group.name = 'Stillwater Garden · Stone';
  const random = rng(8_819);
  const placements = [
    ...SET_STONES.map(([x, z, asset, yaw, className, scaleJitter]) => ({
      asset, className, scaleJitter, x, yaw, z,
    })),
    ...curveStones(),
  ];

  const census = {};
  for (const [index, placement] of placements.entries()) {
    const stoneClass = STONE_CLASSES[placement.className];
    // `asset` selects WITHIN the class's compositional group, so an out-of-range
    // index wraps onto a stone the group actually contains instead of throwing
    // or silently reaching into another role's set.
    const groupCount = prototypes.get(`${placement.className}:count`);
    const stoneIndex = ((placement.asset % groupCount) + groupCount) % groupCount;
    const prototype = prototypes.get(`${placement.className}:${stoneIndex}`);
    const instance = prototype.clone(true);
    instance.name = `${placement.className}-${stoneIndex}-${index}`;
    const scale = stoneClass.scale * placement.scaleJitter;
    instance.scale.setScalar(scale);
    instance.rotation.y = THREE.MathUtils.degToRad(placement.yaw);
    // Setting attitude. A garden stone is never level; the tilt is what gives
    // a group its direction of travel and is authored per class.
    instance.rotation.x = (random() - 0.5) * 2 * stoneClass.tilt;
    instance.rotation.z = (random() - 0.5) * 2 * stoneClass.tilt;
    instance.traverse((object) => {
      if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; }
    });
    // `anchor: 'bounds'` grounds by Box3.min.y, then the class bury depth
    // sinks it, so seams are buried by the authored terrain rather than hidden
    // by scaling.
    instance.updateWorldMatrix(true, true);
    const height = new THREE.Box3().setFromObject(instance).getSize(new THREE.Vector3()).y;
    surface.place(instance, {
      anchor: 'bounds',
      offset: -height * stoneClass.bury,
      x: placement.x,
      z: placement.z,
    });
    group.add(instance);
    census[placement.className] = (census[placement.className] ?? 0) + 1;
  }

  return { census, count: placements.length, group };
}

// ---------------------------------------------------------------------------
// Trees
// ---------------------------------------------------------------------------
//
// The authored garden recipes, loaded as portable BranchTree documents from the
// trees workstream (`scripts/stillwater-garden-trees.mjs`; recipes live in
// `labs/shared/stillwaterGardenTrees.js`). Three maple variants for the hero
// autumn accent, three pine variants for the enclosing mass, three shrubs for
// the low planting that stops the garden reading as trees standing in a field.
//
// Each document carries its own `launchWorld.assembly` block — `instanceScale`,
// `buryDepthMetres`, and the vegetation shader to apply — so the scene honours
// what was measured and reviewed rather than re-deriving it. That is the whole
// point of a portable document: what is measured headlessly is what renders.
//
// Traps this path avoids, recorded while the recipes were briefly authored
// in-scene here:
//   D19-030  `size` is a canopy-card budget as well as a scale, so scaling a
//            tree DOWN through it silently destroys 60-78% of its leaf cards.
//            Instance scale lives on the transform, never on `size`.
//   D19-028  `branches.children` above 8 exhausts the branch budget and yields
//            a leafless skeleton.

const TREE_ROOT = '/assets-local/launch-world/trees';

const TREE_DOCUMENTS = Object.freeze({
  maple: Object.freeze(['GDN-MAPLE-HERO-V1', 'GDN-MAPLE-HERO-V2', 'GDN-MAPLE-HERO-V3']),
  pine: Object.freeze(['GDN-PINE-MASS-V1', 'GDN-PINE-MASS-V2', 'GDN-PINE-MASS-V3']),
  shrub: Object.freeze(['GDN-SHRUB-V1', 'GDN-SHRUB-V2', 'GDN-SHRUB-V3']),
});

async function loadTreeDocument(id) {
  const response = await fetch(`${TREE_ROOT}/${id}.json`);
  if (!response.ok) throw new Error(`Tree document ${id} failed to load (${response.status}).`);
  const document = await response.json();
  return {
    assembly: document.launchWorld?.assembly ?? {},
    id,
    // The AUTHORED leaf colour, taken straight off the document rather than out
    // of the parsed settings — `parseBranchTreeDocument` returns a
    // `{ errors, ok, value }` envelope, so `settings.leaves` is not reachable
    // from its result. D19-205 restores this onto the material uniforms.
    leafColor: document.settings?.leaves?.color ?? null,
    measured: document.launchWorld?.measured ?? {},
    settings: parseBranchTreeDocument(document),
  };
}

/**
 * Hand-set planting. `[x, z, family, variant, scale, yawDegrees]`.
 *
 * The hero maple is the §2 foreground occluder: it stands 4.6 m from the hero
 * eye on the near-left, so its branch mass closes the top-left of the frame
 * without hiding the pond.
 */
const SPECIMEN_TREES = Object.freeze([
  // THE HERO MAPLE — §2's foreground occluder, and the frame's focal colour.
  //
  // Variant 2 is `GDN-MAPLE-HERO-V3`, the rebuilt Acer palmatum: cascading
  // horizontal plates with sky between them over a visible sculptural trunk.
  // V1 stood here through pass 1, which is most of why the hero frame had no
  // foreground at all — V1 is the upright massed variant and it was set 6.8 m
  // out, far enough to read as just another mid-band tree.
  //
  // Now at 4.6 m from the hero eye (which stands at [-1.5, 2.35, 14.0]) and
  // offset right of the sightline, so the branch plates close the top-right of
  // the frame and the pond reads UNDER them. §2 asks for 18-30% of frame from
  // the occluder; this is what buys the near band of the five-band structure.
  //
  // D19-200. The line above states the intent; (3.05, 9.85) did not deliver it
  // and pass 2 shipped with NO autumn accent anywhere in the hero frame. The
  // placement was never wrong about distance-in-metres so much as about
  // BEARING, and bearing is the thing the eye actually sees:
  //
  //   from the hero eye, (3.05, 9.85) lies 6.16 m out at 43.7 deg off the
  //   camera axis, and the hero's half-horizontal FOV at 16:9 is 32.9 deg
  //   (fov 40 is VERTICAL). The trunk therefore stood ~11 deg beyond the right
  //   frame edge; only an outer sliver of canopy grazed the corner.
  //
  // That is measurable and it was measured: the isolated V3 plate
  // `captures/trees/GDN-MAPLE-HERO-V3-hero.png` grades at 16.1% warm-accent
  // pixels and `ab-styleColorStrength-0.35-garden.png` at 20.4%, while
  // `garden-pass2-hero.png` grades at 1.0% against reference `09`'s 7.8%. The
  // canopy was never green — D19-128's 0.35 override works and is NOT touched
  // here. The accent was simply outside the frame.
  //
  // Solved on bearing at the authored 4.6 m: 28 deg off-axis, which puts the
  // trunk ~5 deg inside the right edge with the canopy opening leftward across
  // the top-right and the pond reading under it. Clear of the stone path
  // (x = -3.4 at this z) and standing over the south moss pocket.
  [0.95, 10.1, 'maple', 2, 1.0, -150],
  [4.9, -8.9, 'maple', 1, 0.9, 32],
  [-14.4, -2.4, 'maple', 0, 0.74, 265],
  [13.2, -9.4, 'pine', 0, 0.9, 74],
  [7.4, -12.6, 'pine', 1, 1.02, 199],
  [-6.6, -12.9, 'pine', 2, 0.94, 311],
  // Low planting at the path bend, the pond margin and the terrace approach.
  [-8.2, 9.2, 'shrub', 0, 1.05, 24],
  [-4.4, 2.0, 'shrub', 1, 0.92, 187],
  [6.6, 1.4, 'shrub', 2, 1.0, 302],
  [11.4, -1.6, 'shrub', 0, 0.88, 61],
  [-13.6, 5.4, 'shrub', 1, 0.96, 233],
  [1.6, -11.4, 'shrub', 2, 1.06, 118],
]);

/**
 * Builds and grounds every tree.
 *
 * The enclosing pine mass is placed with `BOUNDARY.stepAlong` — the boundary is
 * a spine, so the mass follows it at a constant set-back for its whole length
 * instead of drifting the way a constant-world-z line would (D19-066).
 */
/**
 * The per-family vegetation profile.
 *
 * D19-205. THE AUTUMN MAPLE RENDERS GREEN, and `foliage.styleColorStrength` is
 * not the control that fixes it in an assembled scene. That was worth three
 * rounds of confusion, so the measurement is recorded here:
 *
 *   styleColorStrength   0     0.35    1
 *   warm-accent pixels   0.54  0.54    0.56     <- no effect whatsoever
 *
 * against 16.1% on the isolated `GDN-MAPLE-HERO-V3-hero.png` plate from the
 * SAME recipe. The recipe is right, the authored `leaves.color` (#a83a2e) is
 * present in the document and survives into `createBranchTree`, and the garden
 * override was live at render time (`uStyleFoliageStyleColorStrength` reads
 * back 0.35). The colour still does not come from any of them.
 *
 * What differs from the gate lab is the STYLE BUNDLE. Every tree is discovered
 * by `runtime.apply(..., { discovery: 'scene-labels' })` — and it cannot opt
 * out: dropping `styleTarget` does not detach it, it just collides, because
 * BranchTree falls back to the shared id `toonlab/tree` and 38 instances throw
 * `StyleTargetDiscoveryError`. The bundle's tree domain then owns the canopy
 * colour, and the vegetation-shader colour uniforms are vestigial underneath.
 *
 * So the palette is driven through the mechanism that actually renders rather
 * than fought: the style's own replacement colour is SET to the maple's
 * authored autumn, at full strength. `mainColor` is the leaf body and
 * `gradientColor` the tip; both come from the recipe's own `leaves.color` so
 * the accent stays a property of the asset and not a number invented in the
 * scene. Pines and shrubs keep the garden's reviewed 0.35 blend, which is
 * correct for them — their authored greens and the style's green agree.
 */
function gardenVegetationProfile(family, document) {
  const base = GARDEN_VEGETATION_SHADER;
  if (family !== 'maple') return base;
  const leaf = document.leafColor;
  if (!Array.isArray(leaf) || leaf.length < 3) return base;
  // Tip runs slightly hotter and lighter than the body, which is what an Acer
  // palmatum actually does and what keeps the crown from reading as a decal.
  const tip = [
    Math.min(leaf[0] * 1.12 + 0.04, 1),
    Math.min(leaf[1] * 1.18 + 0.05, 1),
    Math.min(leaf[2] * 1.05, 1),
  ];
  return {
    ...base,
    settings: {
      ...base.settings,
      foliage: {
        ...base.settings.foliage,
        gradientColor: tip,
        mainColor: [leaf[0], leaf[1], leaf[2]],
        styleColorStrength: 1,
      },
    },
  };
}

export async function createGardenTrees({ surface, fog = null, styleTargets = true }) {
  const families = new Map();
  for (const [family, ids] of Object.entries(TREE_DOCUMENTS)) {
    families.set(family, await Promise.all(ids.map(loadTreeDocument)));
  }

  const group = new THREE.Group();
  group.name = 'Stillwater Garden · Trees';
  const random = rng(61_403);
  const instances = [];

  const build = (family, variant, { scale, x, yawDegrees, z }) => {
    const documents = families.get(family);
    const document = documents[variant % documents.length];
    const tree = createBranchTree({
      ...document.settings,
      foliage: {
        // A garden is sheltered: the wind read is a drift, not a gale, and it
        // matches the grass fields and the pond ripple direction.
        windDirection: [0.62, -0.78],
        windSpeed: 0.6,
        windStrength: family === 'pine' ? 0.055 : 0.085,
      },
      ...(styleTargets ? { styleTarget: { targetId: `garden/tree-${document.id}-${instances.length}` } } : {}),
    });
    // D19-205. Each tree carries its OWN vegetation profile, because the maple
    // needs a different one from the pines and shrubs — see
    // `gardenVegetationProfile`. Stored on the instance so the post-bundle
    // re-apply can restore the per-family profile rather than a shared one.
    const profile = gardenVegetationProfile(family, document);
    tree.userData.gardenVegetationProfile = profile;
    tree.userData.gardenLeafColor = document.leafColor;
    tree.setVegetationShader(profile);
    if (fog) tree.setSceneFog(fog);
    // Instance scale on the TRANSFORM, over the document's own measured
    // `instanceScale`. Never through `size` — D19-030.
    const finalScale = (document.assembly.instanceScale ?? 1) * scale;
    tree.scale.setScalar(finalScale);
    tree.rotation.y = THREE.MathUtils.degToRad(yawDegrees);
    // The root-flare bury goes through `place`'s own `offset`, not through a
    // post-hoc position edit: `surface.audit` records the grounding target at
    // placement time, so adjusting y afterwards reports every tree as
    // `object-off-surface` and buries the real signal.
    surface.place(tree, {
      anchor: 'origin',
      offset: -(document.assembly.buryDepthMetres ?? 0.12) * finalScale,
      x,
      z,
    });
    group.add(tree);
    instances.push({ family, id: document.id, scale: finalScale, x, z });
    return tree;
  };

  for (const [x, z, family, variant, scale, yawDegrees] of SPECIMEN_TREES) {
    build(family, variant, { scale, x, yawDegrees, z });
  }

  // The enclosing pine mass. Set back 2.6 m inside the boundary line, with the
  // set-back and the spacing jittered so the row is a mass and not a colonnade.
  const screen = BOUNDARY.stepAlong({
    heightAt: gardenHeight,
    jitterAlong: 0.9,
    jitterOffset: 0.85,
    mask: (x, z) => plantableMask(x, z),
    offset: 2.4,
    seed: 2_204,
    spacing: 3.1,
  });
  for (const [index, stand] of screen.entries()) {
    build('pine', index, {
      scale: 0.86 + random() * 0.46,
      x: stand.x,
      yawDegrees: random() * 360,
      z: stand.z,
    });
  }

  return {
    group,
    instances,

    /**
     * Hands the scene's sun to every plant.
     *
     * D19-130: the vegetation shaders do NOT read scene lights. `BranchTree`,
     * `StylizedTree` and `StylizedBush` build bare `NodeMaterial`s that light
     * entirely from their own `uSunDirection` / `uSunColor` / `uSkyColor`
     * uniforms, and a host that never calls `setSun` gets the module default
     * direction `(0.35, 0.72, 0.42)` — a north-west key, in a garden whose sun
     * is authored to the south-east at 128°.
     *
     * That is why every canopy in pass 1 read as a flat plastic lollipop no
     * matter what the lighting rig was doing: the trees were lit by a different
     * sun than the ground they stand on, and nothing warns. Each tree document
     * marks this `REQUIRED` in its own `launchWorld.assembly.sun` field.
     *
     * `shadowFill` cannot reach these materials either (D19-160) — they never
     * install `ToonLabSurfaceLightingModel`. The procedural equivalent is the
     * vegetation shader's `lighting.skyFillStrength`, already carried by
     * `GARDEN_VEGETATION_SHADER`.
     */
    setSun(options) {
      for (const child of group.children) child.setSun?.(options);
      return this;
    },

    /**
     * Re-applies the garden's vegetation shader to every plant.
     *
     * D19-203. `build()` already calls `setVegetationShader` per tree, and for
     * two passes that looked sufficient — every tree provably received
     * `GARDEN_VEGETATION_SHADER`, and the trees workstream's own gate lab
     * rendered the maples correctly autumn from the same recipes.
     *
     * The scene did not, and the discriminator is ORDER. The style bundle lands
     * at `runtime.apply(CALL_ME_SENSEI_STYLE_BUNDLE, ...)` AFTER the trees are
     * built, and it re-authors the vegetation slot from the shipped preset —
     * which carries `foliage.styleColorStrength: 1` (D19-128) against the
     * garden's 0.35. So the override was applied, and then silently discarded,
     * and the maple's authored `#a83a2e` was blended back into the preset's
     * near-black-green `mainColor` before a single frame was drawn.
     *
     * This is D19-032/D19-089 — "author AFTER the bundle" — and the scene had
     * already learned it for the GRASS fields, which are re-authored in exactly
     * this way a few lines below the bundle call. The trees were simply never
     * given the same treatment, and nothing warned, because a wrongly-coloured
     * canopy is still a perfectly plausible canopy. Same failure family as
     * D19-190: the tree looked fine, so three review rounds blamed the recipes.
     *
     * Evidence that separates "override is wrong" from "override was reverted":
     * the isolated plate `captures/trees/ab-styleColorStrength-0.35-garden.png`
     * grades at 20.4% warm-accent pixels and the assembled hero frame at 1.0%,
     * from the same value on the same recipe.
     */
    /**
     * Restores each plant's AUTHORED leaf colour onto the material uniforms
     * that actually render it. Must run AFTER the style bundle.
     *
     * D19-205. The garden's maples rendered green in the assembled scene while
     * the identical recipe rendered autumn in `labs/tree-gate1/`. Every obvious
     * explanation was measured and eliminated in turn:
     *
     *   - the recipe is right — `leaves.color` is #a83a2e and it is present in
     *     the exported document and survives into `createBranchTree`;
     *   - `foliage.styleColorStrength` is NOT the control. Swept 0 / 0.35 / 1,
     *     the graded warm-accent share moved 0.54 / 0.54 / 0.56 percent. No
     *     effect at all, against 16.1% on the isolated plate;
     *   - the garden override is live — `uStyleFoliageStyleColorStrength` reads
     *     back 0.35 at render time, so nothing is discarding the profile;
     *   - driving the style's replacement palette (`foliage.mainColor` /
     *     `gradientColor`) to the autumn colour also did nothing;
     *   - the tree cannot opt out of bundle discovery: removing `styleTarget`
     *     does not detach it, it throws `StyleTargetDiscoveryError` because
     *     BranchTree falls back to the shared id `toonlab/tree`.
     *
     * A live uniform readback on the hero maple's `StylizedTreeFoliage` found
     * the actual cause, and it is none of the above:
     *
     *     uLitColor    [0.030, 0.196, 0.040]   <- GREEN
     *     uShadowColor [0.025, 0.175, 0.051]   <- GREEN
     *     uCrownColor  [0.087, 0.321, 0.045]   <- GREEN
     *
     * These are BranchTree's OWN colour uniforms, and they are what the shader
     * renders. The authored [0.659, 0.227, 0.180] never reaches them — the
     * bundle re-authors them from the preset's foliage family. Confirmed by
     * mutation: forcing these three turned the canopy from hue 136 deg to
     * hue 26.8 deg, a warm orange, with nothing else changed.
     *
     * So the colour is restored here, from each plant's own document rather
     * than from a number invented in the scene. This is a genuine gap and it is
     * registered as FILL-017: there is no supported way to tell a style bundle
     * "adopt my grading but preserve this asset's authored albedo", which is
     * exactly what an authored species palette needs.
     */
    restoreAuthoredFoliageColour() {
      let restored = 0;
      for (const child of group.children) {
        const leaf = child.userData?.gardenLeafColor;
        if (!Array.isArray(leaf) || leaf.length < 3) continue;
        // The document stores sRGB; these uniforms are working (linear) space.
        const lit = new THREE.Color(leaf[0], leaf[1], leaf[2]).convertSRGBToLinear();
        child.traverse((node) => {
          if (!node.isMesh || !node.material) return;
          const materials = Array.isArray(node.material) ? node.material : [node.material];
          for (const material of materials) {
            if (!/Foliage/.test(material.name ?? '')) continue;
            const uniforms = material.uniforms ?? {};
            // Lit body, a deeper shaded side, and a slightly hotter crown tip —
            // the same three-way relationship the preset's own palette uses, so
            // only the HUE changes and the style's value grading is preserved.
            uniforms.uLitColor?.value?.setRGB?.(lit.r * 0.88, lit.g * 0.9, lit.b * 0.92);
            uniforms.uShadowColor?.value?.setRGB?.(lit.r * 0.34, lit.g * 0.4, lit.b * 0.5);
            // Crown lift is deliberately small. At 1.3 the maple rendered as
            // neon poster paint — "saturated, never lurid" is the benchmark
            // (ref 01 satMean 0.294), and a crown hotter than the body by more
            // than ~10% is what tips a warm accent into fluorescence.
            uniforms.uCrownColor?.value?.setRGB?.(
              Math.min(lit.r * 1.06, 1),
              Math.min(lit.g * 1.1, 1),
              Math.min(lit.b * 1.05, 1),
            );
            restored += 1;
          }
        });
      }
      return restored;
    },

    setVegetationShader(profile = null) {
      for (const child of group.children) {
        // Each tree's OWN profile wins (D19-205) — the maple's autumn palette
        // must not be flattened back to the shared one by a blanket re-apply.
        child.setVegetationShader?.(child.userData?.gardenVegetationProfile ?? profile);
      }
      return this;
    },

    update: (delta) => { for (const child of group.children) child.update?.(delta); },
  };
}

export { CASCADE, PATH, UPPER_POOL_LEVEL };
