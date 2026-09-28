// Stillwater Garden — scene assembly (launch video, doc 20).
//
// Every visible system here is a first-party ToonLab system:
//   terrain surface   createSceneSurfaceRuntime   (src/runtime/sceneSurfaceRuntime.js)
//   ground            createGroundShaderMesh      (src/ground-shader)
//   ground surfaces   evaluateTextureMaps         (src/texgen)   -> materials.js
//   water             surface.createWaterSurface  -> WaterSurface (src/water)
//   stone             official catalog + applyRockShader (src/rock-shader)
//   trees             createBranchTree            (src/vegetation)
//   grass / moss      surface.createGrassField    -> createCallMeSenseiGrassField
//   sky + cloud       createSkySystem             (src/sky)
//   lighting / post   createSceneStyleRuntime + CALL_ME_SENSEI_STYLE_BUNDLE
//   placement frames  createCurveFrame            (src/vegetation/scatter.js)
//
// Assembly order follows launch-plan/contracts/launch-world-runtime-contracts.md
// §10: surface -> ground -> water (registers its footprint) -> objects -> grass
// -> sky/style.
//
// NOT in this pass, by instruction — integration points are marked INTEGRATION:
//   ARCH-GDN-01 teahouse, ARCH-GDN-02 gate + wall, PROP-GDN-01 stone furniture,
//   PROP-GDN-02 garden detail, Yua, the shader wipe. No blockout stands in for
//   any of them (§2); the terrain carries their pads and their spines instead.

import * as THREE from 'three/webgpu';

import {
  CALL_ME_SENSEI_STYLE_BUNDLE,
  createSceneStyleRuntime,
  createSceneSurfaceRuntime,
  createSkySystem,
} from '@call-me-sensei/toonlab';
import {
  applyGroundShader,
  createGroundShaderMesh,
  createGroundShaderSettings,
  setGroundShaderSceneState,
} from '@call-me-sensei/toonlab/ground-shader';
import { installToonLabSurfaceLighting } from '@call-me-sensei/toonlab/environment';
// POST-MERGE API GAP (register with the environment owner): the six-axis
// ambient-probe setter is the only channel an imported asset's indirect light
// arrives on (FILL-018 below), and `environmentShaderMaterials.js` is NOT in
// the `@call-me-sensei/toonlab/environment` barrel — `environmentAmbientProbe.js`
// is exported and imports it privately, so a consumer can capture a probe but
// cannot author one. It belongs in src/environment/index.js beside
// `setEnvironmentPlanarReflection` and `setEnvironmentCloudShadow`.
import { setEnvironmentAmbientProbeColors } from '../../../src/environment/environmentShaderMaterials.js';
import { resolveLightingStylePreset } from '@call-me-sensei/toonlab/lighting';
import { createGrassShaderProfileSettings } from '../../../src/vegetation/vegetationShaders.js';
import { createPostProcessingPipeline } from '@call-me-sensei/toonlab/post';
import { PRESETS as SKY_PRESETS } from '@call-me-sensei/toonlab/sky';
import { clearEnvironmentCloudShadowPass } from '../../../src/sky/cloudShadow.js';

import {
  buildGardenGroundLayers,
  groundProjectionScales,
} from './materials.js';
import { auditGardenConfiguration, formatGardenConfigurationAudit } from './configAudit.js';
import { createGardenDressing } from './dressing.js';
import { createGardenDetail } from './detail.js';
import { createStillwaterLane } from './lane.js';
import { createGardenStone, createGardenTrees } from './props.js';
import { GARDEN_VEGETATION_SHADER } from '../../shared/stillwaterGardenTrees.js';
import {
  BOUNDS,
  CASCADE,
  PATH,
  POND_MARGIN,
  UPPER_POOL_LEVEL,
  WATER_LEVEL,
  YUA_MARK,
  buildGroundField,
  buildTerrainGeometry,
  clumpMask,
  gardenHeight,
  mossMask,
  plantableMask,
  pondEdgeMask,
} from './terrain.js';

// ---------------------------------------------------------------------------
// Authored constants — every one traceable to doc 20 or the contracts file
// ---------------------------------------------------------------------------

// DECISION (contracts §11 item 2), inherited from the coastal pass and
// re-affirmed here. D19-064: hour 8.5 lands §6.5's 42° exactly and drags the
// whole rig 36% of the way toward the style's hour-6 keyframe, so the palette
// interpolates into DAWN — orange sun, dim cold probe. That is the mechanism
// that renders a warm ground cold. Hour 10 with `sunPath.heightScale = 0.4219`
// gives atan((0.4 + 0.4219 x 0.866) / 0.85) = 42.0° on a late-morning palette.
// Only the height term moves.
export const TIME_OF_DAY = 10;
const GARDEN_SUN_HEIGHT_SCALE = 0.4219;

// Sun azimuth (D19-064). The shipped `call-me-sensei` sun path has
// `azimuthOffset: 0`, which at hour 10 puts the sun at −24° — the north-north-
// west, i.e. behind everything a south-facing camera can see. The undocumented
// formula, measured: az = azimuthOffset + (hour/24 − 0.5) x azimuthArc, with
// azimuthArc = π·1.6.
//
// Every hero camera in this garden stands at the south gate looking north, so
// the sun is authored to the SOUTH-EAST (az ≈ 128°): over the camera's right
// shoulder, raking across the composition left-to-right. The pond then carries
// a lit sky reflection instead of the sun disc, the cascade face is front-lit,
// and shadows fall away to the north-west, into the picture.
//   2.653 + (10/24 − 0.5) x π·1.6 = 2.653 − 0.419 = 2.234 rad = 128°.
const GARDEN_SUN_AZIMUTH_OFFSET = 2.653;

// Aerial perspective. A 40 m garden is BELOW the distance where haze does
// anything (city stand-down §4.6: "haze does essentially nothing under ~110 m"),
// so this is deliberately small — its whole job is to separate the enclosing
// pine mass from the mid-band planting by a few percent of value, not to build
// depth. Depth here is bought with occlusion and value, as it must be.
const HORIZON = Object.freeze({
  color: 0xd2dcd8,
  // Pass 1 ran 16 m / 128 m and hazed the far bank of a 15 m pond, which is
  // absurd at this scale and flattened every value in the enclosing band.
  //
  // D19-258. Re-sized once more, in the other direction. Pass 1 over-hazed and
  // the correction over-shot: at 34/240 in a world that is 66 m across, the
  // furthest thing in it sits at 13% of the ramp and every depth band renders
  // at the same value and the same saturation. That is the flat-space read.
  //
  // The garden now spans 20-45 m from a hero eye and the lane's closer sits at
  // 35 m, so the ramp is sized to THAT: perceptible separation across the
  // mid-band, full effect at the world edge. `post.depthCue` (D19-255) carries
  // the colour half of the same job and the two are pointed at one colour.
  fogFar: 132,
  fogNear: 22,
});

const HORIZON_LINEAR = new THREE.Color(HORIZON.color).convertSRGBToLinear().toArray();

// The pond tile. Sized to the pond's own bounding box plus a margin: ToonLab
// Water discards fragments whose bed stands above the surface, so a rectangular
// tile renders the authored irregular outline exactly.
const POND = Object.freeze({
  depth: 14.5,
  maxSegments: 256,
  segmentsPerMeter: 7,
  width: 19.5,
  x: -5.3,
  z: -5.2,
});

const UPPER_POOL = Object.freeze({
  depth: 5.0,
  maxSegments: 96,
  segmentsPerMeter: 10,
  width: 5.8,
  x: CASCADE.pool.x,
  z: CASCADE.pool.z,
});

// D19-062, RESOLVED — and the resolution is a look-dev decision this scene has
// to make rather than a bug it waits on.
//
// The navy stone was never a broken `directDiffuse`. Three things stacked: the
// sun was behind the subject, a 5.9 m cliff genuinely self-shadows its lower
// two-thirds at a 42° sun, and the Call Me Sensei rig has NO ambient light at
// all — so an occluded ToonLab surface received nothing but the SH sky probe,
// whose radiance is R:G:B = 1 : 2.24 : 5.33 before its blue tint. A correct
// renderer, no ambient, and the sun in the wrong place.
//
// `installToonLabSurfaceLighting({ shadowFill })` keeps an authored fraction of
// the sun term alive inside the shadow mask. It defaults to 0 so no existing
// capture moves, which makes adoption the scene's call. 0.35 is the measured
// value that recovers readable stone; the tint is warm because the thing it
// stands in for is the bounce off a sunlit gravel floor, and leaving it neutral
// just makes a paler version of the same blue.
//
// This reaches rock, tree, foliage, water-shore and environment materials
// alike — they all route through the same installer.
//
// D19-252 — RAISED FOR THE LANE, and measured on it rather than on the garden.
//
// The street's frontages all face NORTH, into a scene whose sun is south-east.
// So every one of them is a surface the sun never strikes at all, lit by the SH
// probe alone — and at 0.35 they rendered as near-black cut-outs against a
// blown white pavement (`/tmp/garden-caps/t2-lane.png`). That is not the value
// range reference `03-alley-underpass` has; it is a two-value frame with
// nothing in between, which is the same failure as a flat mid-tone wearing
// different clothes.
//
// 0.5 is the value that keeps a north wall reading as a lit surface in shade
// rather than as a hole. It reaches rock, tree, foliage, water-shore, prop and
// building materials alike — they all route through the same installer.
const SHADOW_FILL = 0.5;
const SHADOW_FILL_TINT = Object.freeze([1.16, 1.0, 0.86]);

// D19-201. `shadowFill` above CANNOT reach the grass fields. A grass blade is a
// bare `NodeMaterial` built by the vegetation shader, not a ToonLab surface
// material, so it never routes through `installToonLabSurfaceLighting` and
// `adoptShadowFill` skips it — silently, because skipping a material that never
// had the model installed is exactly what that function is supposed to do.
//
// The equivalent lever for procedural vegetation is `lighting.skyFillStrength`
// (D19-159), and the garden was applying it to ONE of its two vegetation paths:
// `GARDEN_VEGETATION_SHADER` carries 0.42 for every tree and shrub, while the
// grass fields beside them were left on the shipped 0.16. So the moss field and
// the clump field — the garden's dominant ground surface and the whole bottom
// third of the hero frame — were receiving a quarter of the sky fill of the
// trees standing in them, under a rig with no ambient light at all.
//
// Measured on `garden-pass2-hero.png` with the parity grader: lower-third mean
// luma 0.165 against reference `09-beach-crowd-wide.png`'s 0.737, and a shadow
// hue of 102 deg (crushed green) where §2 asks for luminous, coloured,
// violet-leaning shade and the benchmark measures 214-330 deg.
//
// Matched to the trees rather than invented: the two vegetation paths in one
// scene should share a fill, and 0.42 is the value already reviewed for this
// garden's sun. The tint is left to the probe — this is a strength, not a hue.
// Swept, not guessed. `?exposure=` and `?skyfill=` override these so the value
// structure can be measured across a range in one capture run instead of
// hand-tuned one edit at a time — see `scripts/.probe-garden-scene.mjs` and the
// grading block in D19-204. These are the values the sweep landed on.
// D19-238 — THE VALUE STRUCTURE WAS SWEPT AGAINST A GROUND THAT WAS NOT THERE.
//
// `exposure` 2.35, `skyFill` 0.55, `ambient` 1.15 and the ground's own
// `lighting.skyFillStrength` 0.46 were all landed by the D19-204 sweep. Every
// one of them was chosen while the ground profile was being discarded by the
// style bundle (D19-236), so the sweep was compensating for a ground rendering
// the preset's `skyFillStrength: 0.04` — a surface receiving almost no sky at
// all. The exposure and the fills were cranked to rescue it.
//
// With the profile actually applied, those same numbers flood the frame: the
// `?splat=1` diagnostic renders a pure-red (1, 0, 0) moss channel as PINK,
// which measures the lift directly — roughly +0.7 added to every channel
// before tone mapping. Any albedo darker than mid grey is washed to near-white,
// which is why a 4096² moss map whose mean is [26, 55, 17] sRGB rendered as
// pale straw with no green in it anywhere.
//
// Re-swept from scratch against the corrected ground. The ground fill sits just
// above the schema's own 0.12 default rather than four times it — the reason
// 0.46 looked necessary is gone.
const GARDEN_SKY_FILL = 0.3;
const GARDEN_EXPOSURE = 1.85;
const GARDEN_GROUND_SKY_FILL = 0.15;

// D19-233 — GROUND-COLOUR ADOPTION. Measured on the running scene, because the
// obvious reading of this defect is wrong in two separate places.
//
// THE SYMPTOM: "the grass is not grey like the ground; it should have adopted
// the colour of the ground without exception." Correct, and §6.2 mandates it.
//
// WHAT WAS ASSUMED, AND WHAT THE UNIFORMS ACTUALLY SAID. Two causes were
// proposed — that the scene dialled `groundAdoptStrength` from the preset's 1
// down to 0.2-0.32, and that `grass.styleColorStrength: 1` repaints over
// adoption the way it repainted the maple. A live readback on the assembled
// moss field disproved BOTH:
//
//     uGroundAdoptStrength   1.00      <- already full, not 0.32
//     uGroundAdoptHeight     0.88      <- preset value, intact
//     uGroundAdoptTint       [0.302, 0.436, 0.176]
//
// The constructor's 0.32 never reached a rendered frame: `applySettings({
// preset: 'call_me_sensei', ...role.settings })` runs after the style bundle
// (D19-032) and re-applies the preset's `groundAdoptStrength: 1` over it,
// because no role carried the key. And `styleColorStrength` cannot repaint
// adoption because adoption is applied AFTER it — `shaders-tsl/grass.js:252`
// resolves the style blend into `color`, then :272-290 overwrite `color` with
// the ground-driven palette. The order is already right.
//
// THE ACTUAL CAUSE IS `groundAdoptTint`, and it is a MULTIPLY:
//
//     groundRoot = vGroundColor.rgb * uGroundAdoptTint      (grass.js:273)
//
// The scene passed `GARDEN_MOSS_HIGH` = [0.302, 0.436, 0.176] there. So every
// blade sampled the ground correctly and then multiplied it by 0.30 / 0.44 /
// 0.18 per channel. Adoption was working perfectly and its result was being
// scaled to a third of its value and forced green — which is simultaneously
// why the field ignored a pale grey ground, why it read olive, and a large
// part of why the lower third measured 0.323 against the reference's 0.737.
// The schema default and the `call_me_sensei` preset both ship [1, 1, 1].
//
// THE SHAPE OF THIS DEFECT, because it is the third one found today: the scene
// set a value that silently defeated a system that was already working. Both
// earlier passes read the pale result as "adoption is inheriting a pale ground"
// and turned adoption DOWN, when the tint was inverting the sign of the fix.
//
// D19-253 — ADOPTION OVER-CORRECTED. It is now 0.72, and the number is a
// reading of the shader rather than a taste call.
//
// At strength 1 the blade IS the ground: `color = mix(color, groundDriven, 1)`
// discards the authored palette outright, and then
// `shaded.color = mix(shaded.color, color, groundCoverage)` discards the LIT
// result too, so the field renders as unlit ground albedo with a sheen on top.
// That is exactly the pale-straw read — the blades were paler than the surface
// they stand on, which is impossible for anything that is genuinely taking the
// ground's colour, and it is why `lighting.skyFillStrength` measured inert.
//
// `groundAdoptHeight: 0.88` is often cited as the thing that keeps a tip its
// own colour. It does not. Read the shader: the height term only chooses
// between EXACT ground and GROUND-DERIVED tip (grass.js:283-286) — both are
// ground. Nothing in the adoption block can return the authored green, because
// the only lever that mixes authored against adopted is `uGroundAdoptStrength`,
// and it is height-independent.
//
// So the brief's "take the ground's influence near the root while keeping its
// own green toward the tip" is expressible only as a partial strength: 0.72
// leaves 28% of the authored deep moss green in the blade at every height,
// which under the height term reads as ground at the root (where the adopted
// colour is exact and dominant) and as a green-cast blade at the tip (where the
// ground-derived tip treatment is already lighter and the authored green shows
// through it). Still adoption, and §6.2 still satisfied — the field visibly
// changes colour over gravel, moss and paving. It is no longer a repaint.
const GRASS_GROUND_ADOPT = 0.72;
const GRASS_GROUND_ADOPTION = Object.freeze({
  // Declared, not inherited. The preset's values are the right ones; carrying
  // them explicitly on every role is what stops the next pass from re-authoring
  // one of them in a place where nothing reads back.
  groundAdoptHeight: 0.88,
  groundAdoptStrength: GRASS_GROUND_ADOPT,
  groundAdoptTint: Object.freeze([1, 1, 1]),
});

// D19-254 — THE ADDITIVE TAIL AFTER THE ADOPTION MIX, which is the rest of the
// pale straw. Measured off the shader, not inferred from the picture.
//
// Once adoption has run, `shaded.color` is the adopted ground colour and four
// terms are ADDED to it, in this order (shaders-tsl/grass.js:334-352):
//
//   sheen      uSunColor * smoothstep(gustSheenThreshold, 1, gust) * tipMix
//                        * gustSheenStrength * shaded.band
//   highlight  uSunColor * pow(N.H, mix(96, 8, roughness)) * specularStrength
//   emissive   color * emissiveStrength
//   washLift   mix toward shaded.color * 1.18
//
// The shipped `call_me_sensei` grass profile carries `gustSheenStrength: 0.22`
// and `shadowFloor: 0.92`. A 0.92 shadow floor means `band` is between 0.92 and
// 1 EVERYWHERE — there is effectively no shaded band at all — so the sheen fires
// at full strength across the whole field whenever the gust crosses 0.78, and it
// adds up to 0.22 of the SUN COLOUR, additively, to a blade whose adopted albedo
// is around 0.05 linear. That is a four-fold lift on the tips, in the sun's own
// warm hue, moving with the wind. Straw, precisely.
//
// These are scene-side overrides of preset values, recorded rather than edited
// in the preset: the preset is authored for a lit meadow, where a moving sheen
// is the whole charm. A moss carpet under a garden maple has no sheen, and
// §6.2's "the grass is the ground, standing up" cannot survive one.
//
// `roughness` up to 0.86 widens the specular lobe (`mix(96, 8, roughness)`
// takes the exponent from 52 to 20) at a tenth of the strength, so what is left
// reads as a soft blade sheen rather than as glitter. Doc's item 3 wants
// materials to separate by HIGHLIGHT BEHAVIOUR — foliage flat, stone and water
// glinting — and this is the flat end of that spread.
const GRASS_HIGHLIGHT = Object.freeze({
  gustSheenStrength: 0.028,
  gustSheenThreshold: 0.9,
  roughness: 0.86,
  specularStrength: 0.012,
});

// FILL-016 ambient fill. Warm violet sky, warm gravel-bounce ground — see the
// rationale at the light's construction. Swept via `?ambient=`.
const GARDEN_AMBIENT_INTENSITY = 0.95;
const GARDEN_AMBIENT_SKY = Object.freeze([1.0, 0.88, 0.98]);
const GARDEN_AMBIENT_GROUND = Object.freeze([1.0, 0.93, 0.78]);

/**
 * Re-installs the surface lighting model on every material that already has it,
 * carrying the scene's authored shadow fill. Run AFTER the style bundle: the
 * bundle rebuilds materials, and prior options are preserved by the installer
 * so nothing else about the material changes.
 */
function adoptShadowFill(root) {
  let count = 0;
  root.traverse((object) => {
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!material?.userData?.toonLabSurfaceLighting) continue;
      installToonLabSurfaceLighting(material, {
        shadowFill: SHADOW_FILL,
        shadowFillTint: [...SHADOW_FILL_TINT],
      });
      material.needsUpdate = true;
      count += 1;
    }
  });
  return count;
}

// The plunge. ToonLab Water owns splash, ripple and foam; what it does not own
// is a falling sheet between two bodies (recorded as D19-069). The cascade
// therefore reads through the systems that DO exist: the authored 32° stone
// face, the shore-state wetness on it, and a continuous plunge impulse driven
// into the pond here — ring waves, a downward impulse, and the splash system's
// droplets and sheets, all at the point the water lands.
const PLUNGE_INTERVAL = 0.085;
const PLUNGE_SPREAD = 0.62;

export const SHOTS = Object.freeze({
  // §2 hero. The eye stands ON the stone path just inside the gate and looks
  // north up the garden's long axis. Five depth bands in one frame:
  //   1 maple branch mass, near right    2 stone path / gravel sea / moss
  //   3 pond, stepping stones, cascade   4 teahouse terrace (right)
  //   5 pine mass and the planted rise closing the sightline
  hero: Object.freeze({
    fov: 40,
    position: [-1.5, 2.35, 14.0],
    target: [0.0, 1.0, -8.0],
  }),
  // Down onto the water: stepping stones, caustics, reflection, margin stone.
  pond: Object.freeze({
    fov: 36,
    position: [1.9, 1.85, 3.4],
    target: [-8.6, 0.1, -7.6],
  }),
  // The cascade, close, with the upper basin above it.
  cascade: Object.freeze({
    fov: 38,
    position: [-6.2, 1.95, -4.6],
    target: [-13.8, 1.15, -11.8],
  }),
  // Along the path where Yua walks — the near play space and the maple.
  path: Object.freeze({
    fov: 42,
    position: [3.6, 1.7, 8.6],
    target: [-8.4, 0.7, -1.2],
  }),
  // The terrace approach, looking back south-west across the pond.
  terrace: Object.freeze({
    fov: 40,
    position: [11.2, 3.0, -1.6],
    target: [-9.4, 0.6, -8.6],
  }),
  // The enclosing pine mass, close — the read that closes every sightline.
  pines: Object.freeze({
    fov: 40,
    position: [1.2, 2.2, -6.4],
    target: [-3.0, 3.4, -17.0],
  }),
  // The raked gravel sea and its stone islands, at walking height.
  gravel: Object.freeze({
    fov: 40,
    position: [-3.2, 1.65, 7.4],
    target: [-12.0, 0.5, 0.6],
  }),
  // The whole garden, for composition review only.
  wide: Object.freeze({
    fov: 44,
    position: [16, 15.5, 26],
    target: [-3, 0.5, -6],
  }),

  // --- Stillwater Lane (doc 21) --------------------------------------------
  //
  // Every street camera looks WEST. The sun is south-east at 128 deg, so west
  // puts it over the camera's right shoulder: the frontages are front-lit, the
  // garden wall opposite is raked, and the sightline closes on ARCH-LANE-04's
  // blank flank and its overpass beam rather than on sky.
  //
  // Eye height is 1.62 m ABOVE THE STREET, not 1.62 m above the pond — the lane
  // is at y ~= 0.70 and quoting eye height against the world datum put the
  // camera 0.92 m up, which is a crawling child's eye and made every frontage
  // loom. `LANE.crown + 1.62 = 2.32` is the number. Doc 21 §4 is a CLOSE-CAMERA
  // bar and the street has to be judged from the height it is built for.

  // Standing in the carriageway, looking west down the run. All five depth
  // bands: signal pole near right, kerb and drain, shopfronts and the gate
  // opposite, the upper storeys, the wires and the garden's tree mass above the
  // wall.
  lane: Object.freeze({
    fov: 46,
    position: [13.4, 2.32, 24.6],
    target: [-17.5, 3.1, 23.0],
  }),
  // The hinge, from the street: the gate in the boundary wall with the garden's
  // maple hanging over it.
  gate: Object.freeze({
    fov: 42,
    position: [5.8, 2.32, 26.2],
    target: [-1.6, 2.0, 19.6],
  }),
  // The walk. Street -> gate -> garden as one continuous move (doc 21 §5).
  approach: Object.freeze({
    fov: 44,
    position: [-1.2, 2.32, 26.6],
    target: [-2.2, 1.4, 6.0],
  }),
  // The whole street, for composition review only.
  //
  // REFRAMED. At [24, 13, 40] the camera stood 13 m up and 40 m out — past the
  // world's own edge — so two thirds of the frame was fog over nothing, one
  // building floated on a white void, and the shot graded frameLuma 0.784 /
  // satMean 0.068 / detailOcc 30.5 against the `lane` shot's 0.597 / 0.153 /
  // 55.0. It was measuring the sky, not the street. Dropped to a first-floor
  // eye ON THE STREET AXIS, high, looking west down the row — the same
  // sightline the delivery shots use, from above. Two intermediate framings
  // were rejected by capture: [17.5, 6.4, 29] put a lamp standard through the
  // middle of the frame, and [12, 9.5, 32] sat behind the east flank so the
  // near building filled half the image. Anything set back from the street
  // runs into the world's own edge, which is what produced the original white
  // void; the axis is the only place a wide shot of this street can stand.
  laneWide: Object.freeze({
    fov: 50,
    position: [15.5, 7.2, 23.4],
    target: [-15.0, 2.2, 23.0],
  }),
});

// ---------------------------------------------------------------------------

/**
 * Builds the Stillwater Garden.
 *
 * @param {object} options
 * @param {THREE.WebGPURenderer} options.renderer
 * @param {THREE.PerspectiveCamera} options.camera
 * @param {(stage: string) => void} [options.onProgress]
 * @param {number} [options.grassCount] moss-field placement cap
 * @param {'balanced'|'performance'} [options.quality]
 * @param {boolean} [options.shadows] engage the sun's cast shadows (D19-041)
 * @param {number} [options.textureSize] ground-layer bake resolution
 */
export async function createStillwaterGarden({
  ambientIntensity = GARDEN_AMBIENT_INTENSITY,
  buildLane = true,
  camera,
  foliageStyle = null,
  treeStyleTargets = true,
  cloudShadow = true,
  // FILL-018 sweep handles. `envIndirect` is `ambientStrength` on the
  // environment-material family — the one channel an imported asset's indirect
  // light actually arrives on — and `envProbeBlend` is how far its ambient
  // takes the six-axis probe's DIRECTION instead of flat white.
  envIndirect = undefined,
  envProbeBlend = undefined,
  envProbeChroma = undefined,
  exposure = GARDEN_EXPOSURE,
  grassCount = 15_000,
  groundFill = GARDEN_GROUND_SKY_FILL,
  onProgress = () => {},
  quality = 'balanced',
  renderer,
  // D19-235. ON by default. This shipped `false` behind `?shadows=1` on the
  // strength of D19-041's "the pass still renders nothing"; the assembled scene
  // now measures `shadowPass.renderCount = 89`, so that statement is stale and
  // the default was suppressing the single largest source of form in the frame.
  // Bark, stone and the ground all read as flat without it. `?shadows=0` still
  // turns it off for the diagnostic the flag was originally added for.
  shadows = true,
  skyFill = GARDEN_SKY_FILL,
  splatDebug = false,
  noReapply = false,
  textureSize = 1024,
}) {
  const scene = new THREE.Scene();
  scene.background = null;
  const fog = new THREE.Fog(HORIZON.color, HORIZON.fogNear, HORIZON.fogFar);
  scene.fog = fog;

  // --- 1. Terrain surface ---------------------------------------------------
  onProgress('Grading the garden');
  const surface = createSceneSurfaceRuntime({
    bounds: BOUNDS,
    heightAt: gardenHeight,
    waterLevel: WATER_LEVEL,
  });

  // --- 2. Ground ------------------------------------------------------------
  onProgress('Baking the ground surfaces');
  const groundLayers = await buildGardenGroundLayers({
    onProgress: (role) => onProgress(`Baking the ${role} surface`),
    size: textureSize,
  });

  onProgress('Painting the ground');

  // D19-236 — THE GROUND PROFILE IS HOISTED SO IT CAN BE RE-APPLIED.
  //
  // Everything below was authored, passed to `createGroundShaderMesh`, and then
  // silently discarded. Measured on the assembled material, scene value vs the
  // value actually on the uniform:
  //
  //   projection.grassScale         1.5   ->  16      (a 16 m period in a 40 m
  //   projection.rockScale          2.4   ->  25       garden: one flat colour)
  //   projection.sandScale          1.1   ->  10
  //   layers.rockTint  [.55,.54,.51] -> [0.296, 0.355, 0.434]   COOL BLUE-GREY
  //   slope.autoRockStrength        0.34  ->  1       every graded bank = rock
  //   lighting.skyFillStrength      0.46  ->  0.04    the "funeral" value
  //   lighting.shadowTint  warm violet -> [0.42, 0.507, 0.869]  cool blue
  //   lighting.shadowTintStrength   0.3   ->  0.48
  //   distance.start / .end       44/170  ->  500/15000
  //
  // That is the whole pale-grey floor in one table, and it is the FOURTH
  // instance of one defect: `runtime.apply(CALL_ME_SENSEI_STYLE_BUNDLE)` lands
  // after construction and re-authors its slot from the shipped preset. The
  // grass fields learned this as D19-032 and the trees as D19-205; the ground
  // was left carrying constructor-time settings and eight paragraphs of
  // comments describing values that never rendered a pixel. `slope
  // .autoRockStrength: 1` painting every bank grey is exactly the failure the
  // comment on that key says it exists to prevent.
  //
  // Re-applied through `applyGroundShader` after the bundle, and ASSERTED —
  // a re-apply that matches no material is the same silent nothing.
  const groundProfile = createGroundShaderSettings({
      preset: 'call_me_sensei',
      // The preset's distance defaults are 500 m / 15 km — mountain scale, and
      // therefore simply "off" in a 40 m world. Rescaled so the enclosing band
      // recedes by a few percent and pointed at the same colour as the fog, so
      // the two agree.
      distance: {
        color: HORIZON_LINEAR,
        detailFade: 0.35,
        // D19-258, matched to the fog above. 44/170 put the whole garden floor
        // inside the first quarter of the ramp, so the distance term separated
        // nothing; 26/96 lands the enclosing bank and the lane's far end in the
        // part of the curve where it actually does something.
        end: 96,
        start: 26,
        strength: 0.24,
      },
      // D19-237. A LAYER TINT IS A MULTIPLIER, NOT A COLOUR. The shader builds
      // each layer as
      //
      //     layerNode = tint * mix(1, detail, textureStrength)
      //                                    (groundShaderMaterial.js:325-329)
      //
      // so at `textureStrength: 1` the tint multiplies the authored albedo
      // outright. This scene was authoring the tints as though they WERE the
      // surface colour — "the shared garden moss ramp, not a green picked
      // here" — and multiplying them into §9 maps that already carry exactly
      // that colour. Measured, in linear working space:
      //
      //   MAT-GDN-02 moss albedo, mean   [0.010, 0.038, 0.006]
      //   grassTint [0.125, 0.30, 0.10]  [0.014, 0.073, 0.010]
      //   product                        [0.0001, 0.0028, 0.0001]  ~= BLACK
      //
      // The moss layer — the garden's dominant surface, by design — was
      // contributing nothing at all, so the floor resolved to whatever the
      // remaining 13% gravel weight painted. That is why the largest green
      // field in the scene rendered pale grey with no green anywhere in it,
      // and it stacks with D19-236: the shipped preset's own `grassTint`
      // resolves to [0.119, 0.33, 0.073], eight times lighter than this one,
      // so the preset was never darkened this way and the defect only appeared
      // once the garden's profile actually reached the material.
      //
      // Identity is now correct BECAUSE the maps are authored: every layer is
      // a 4096² §9 albedo baked at a declared world tile, carrying its own
      // final colour. `saturation` and `contrast` remain as grading, which is
      // what they are for.
      layers: {
        contrast: 1.06,
        dirtTint: [1, 1, 1],
        grassTint: [1, 1, 1],
        rockTint: [1, 1, 1],
        sandTint: [1, 1, 1],
        saturation: 1.08,
        textureStrength: 1,
      },
      // Every camera here is inside 30 m. The preset's landscape periods
      // (grass 16 m, dirt 13 m, rock 25 m, sand 10 m) read as a boulder field
      // at this range — the city stand-down measured the same failure. The
      // periods come from the SAME table the recipes were authored against
      // (materials.js `worldTile`), so paint scale and bake scale cannot drift.
      projection: {
        ...groundProjectionScales(groundLayers),
        triplanarSharpness: 3.2,
        triplanarStrength: 1,
      },
      macro: {
        // Macro variation is the only thing breaking the tile repeat at these
        // periods, so it does more work here than in a landscape.
        amount: 0.2,
        scale: 0.11,
        secondaryAmount: 0.11,
        secondaryScale: 0.036,
        tint: [0.62, 0.72, 0.5],
        tintStrength: 0.1,
      },
      // D19-204. The ground's own shaded-side lighting, and the third of the
      // three fills this scene needs — one per lighting path, because ToonLab
      // has no single ambient term that reaches them all:
      //
      //   imported assets, rock, props   `shadowFill`            (D19-062)
      //   grass, trees, procedural       `lighting.skyFillStrength` per profile
      //   the ground itself              THIS block
      //
      // A scene light cannot substitute for any of them. Measured: adding a
      // fully-enabled `HemisphereLight` to the assembled garden changed the
      // graded frame by NOTHING — mean luma 0.362 with the light at intensity
      // 0 and 0.362 at 1.15 — because the ground shader and the vegetation
      // fields both light from their own uniforms and never read scene lights.
      // The rig's own `Lighting System Ambient` is likewise shipped at
      // intensity 0 / `visible: false`, so there is no ambient anywhere.
      //
      // What the preset ships here is the mechanism behind the "funeral" read,
      // stated in the ground shader's own vocabulary:
      //   `skyFillStrength: 0.04` — a THIRD of the schema's own 0.12 default,
      //     so shaded ground receives almost no sky at all;
      //   `shadowTintStrength: 0.48` toward `shadowTint: [0.68, 0.74, 0.94]` —
      //     a COOL BLUE pushed nearly half-way in, on top of that darkness.
      // Dark and cold, from one block. Not changed in the preset — recorded.
      //
      // The garden's values: sky fill up to 0.46 so shade stays luminous, and
      // the tint re-authored WARM VIOLET. §2 asks for shadows that are "warm,
      // luminous and coloured — never neutral grey", and the benchmark measures
      // shade at 327-330 deg (beach) and 214-267 deg (city) — never the blue
      // this preset reaches for. Violet-magenta is the warm-daylight end of
      // that range and it is what a garden under a south-east sun wants.
      lighting: {
        // D19-241. `rimStrength` mixes the ground TOWARD THE SKY COLOUR by
        // `(1 - dot(normal, viewDirection)) * rimStrength`, and a floor seen
        // from a standing eye is grazing almost everywhere — so on a 40 m
        // garden the preset's 0.06 lays roughly 5% of flat blue-white sky over
        // the entire lower third of every frame. Measured: it is the last of
        // the three terms that were desaturating the moss, and the one that
        // pushed blue up to meet green (sRGB [85, 101, 94] against a map whose
        // green/red ratio is 2.1).
        //
        // The term is right for a landscape, where a rim of sky on a distant
        // ridge is real aerial perspective. Here it is fog on the ground.
        rimStrength: 0.012,
        shadowTint: [1.02, 0.82, 0.98],
        shadowTintStrength: 0.3,
        skyFillStrength: groundFill,
        sunTintStrength: 0.26,
      },
      slope: {
        // The shipped 0.82 / 0.18 pair is authored for landscapes, where any
        // slope past ~10° genuinely is exposed rock. A garden is GRADED: its
        // banks, rise and berm are all planted, and at those numbers the shader
        // painted every one of them grey stone. Only the cascade face (32°)
        // should cross over, so the threshold moves up and the takeover down.
        autoRockStrength: 0.34,
        edgeHighlight: 0.16,
        fade: 0.14,
        noiseScale: 0.14,
        noiseStrength: 0.06,
        start: 0.42,
      },
      shoreline: {
        // A pond margin, not a beach: a narrow damp band and no automatic sand.
        autoSandStrength: 0.1,
        bandWidth: 0.7,
        softness: 0.35,
        wetBandDarkening: 0.26,
        wetBandWidth: 0.28,
      },
  });

  const ground = createGroundShaderMesh({
    field: buildGroundField({ depth: 512, width: 512 }),
    // D19-251: 66 m in Z now, against 52 in X. Segments follow the span so the
    // 0.15 m kerb line and the carriageway crown are not resolved coarser than
    // the garden's own grading.
    geometry: buildTerrainGeometry({ segmentsX: 448, segmentsZ: 568 }),
    layers: groundLayers.map(({ texture }) => ({ texture })),
    name: 'Stillwater Garden · Ground',
    settings: groundProfile,
    styleTarget: { targetId: 'garden/ground' },
  });
  scene.add(ground);

  // --- 3. Water -------------------------------------------------------------
  // Registered BEFORE the grass so the scatter excludes the footprints.
  // `surface.createWaterSurface` wires `bedHeight: sampleHeight` for us, which
  // is what gates shoaling and the shore-state field. §6.4 forbids a flat
  // plane and the architecture enforces it.
  onProgress('Filling the pond');

  // D19-234. `preset: 'pond'` WAS NOT A REAL PRESET, and the comment that used
  // to sit here asserted it was "a real registered ALIAS of `calm` — verified
  // by resolving both and comparing, not assumed". It was not verified; it was
  // D19-004 firing exactly as that entry documents. The registry holds
  // `mirror | calm | lake | river | coast | ocean | storm`, and
  // `resolveWaterPresetName('pond')` returns `calm` with no warning.
  //
  // `mirror` is the deliberate choice now that the name is a choice: 0.03 wave
  // intensity against calm's 0.12, 0.85 reflection strength against 0.70, and
  // 0.015 reflection distortion against 0.03. Doc 20 §3 calls reflection this
  // pond's "dominant read", and a garden pond is a mirror with a body.
  // `mirror`'s own `foamAmount: 0.7` is overridden below — a still pond has
  // foam only at the plunge.
  //
  // VERIFY, DO NOT ASSUME: `scripts/.probe-garden-water.mjs` reads
  // `water.settings.preset` / `.colorTone` / `.style` back off the running
  // surface. A passed value is not a resolved value.
  const pondWater = surface.createWaterSurface({
    breakerEnabled: false,
    // Caustics are the shallow-water read, and the bed was authored to give
    // them somewhere to live: half the pond floor sits under 0.40 m of water.
    // The `anime` tone's own 0.3 is tuned for a swimmer's-eye lake.
    causticsScale: 1.4,
    causticsSpeed: 0.32,
    causticsStrength: 0.74,
    // D19-234. `anime` — the tone the `call_me_sensei` water style itself
    // registers (`waterSettings.js:1647`) and the one doc 18 §6.4 specifies.
    //
    // This scene was passing `style: 'call_me_sensei'` and then `colorTone:
    // 'classic'`, which is the generic library default and returns full colour
    // control to the caller. So the water was carrying the Call Me Sensei
    // style's name and none of its palette, which is precisely the "the water
    // doesn't look like Call Me Sensei" read — it was not.
    //
    // The four authored body colours are GONE rather than kept alongside: a
    // chosen tone force-applies its palette over preset, environment and
    // per-key colour overrides (`waterSettings.js:50-52`), so leaving them here
    // would be four dead keys that look like live art direction. What D19-005
    // freed is the tone's non-colour SCALARS — clarity distances, caustic,
    // reflection and detail gains — and those are still authored below for a
    // 1.3 m pond rather than the tone's 1.8 m / 4.2 m lake numbers.
    colorTone: 'anime',
    // Clarity distances, sized to a 1.3 m pond. These are the keys D19-005
    // freed: before it, the `anime` tone force-applied its own 1.8 m / 4.2 m —
    // LAKE numbers — over any caller value, which put every depth transition
    // outside a garden pond entirely and rendered it one flat blue.
    deepFadeDistance: 1.15,
    depth: POND.depth,
    depthFadeDistance: 0.42,
    // Fine ripple cells. A 1.15 detail scale is a lake cell; on a 15 m pond
    // seen from 20 m it is wider than the pond.
    detailNormalStrength: 0.24,
    detailScale: 2.8,
    // Foam. A still pond has NONE except at the plunge, and pass 1 painted a
    // continuous white ring around the whole margin — the single most
    // pool-like thing in the frame. The shore-state field stays (it carries
    // the damp stone at the waterline and the audit requires it); only its
    // foam and run-up are authored away.
    foamAmount: 0.16,
    foamNoiseScale: 2.6,
    maxSegments: POND.maxSegments,
    nearshorePhase: { incidentAxis: 'z', referenceX: POND.x, referenceZ: POND.z },
    // Still water is a mirror with a body, not a body with a highlight.
    // Reflection is doc 20's "dominant read", so it is authored explicitly —
    // the tone would otherwise force 0.46 over the calm preset's 0.7.
    // D19-257 — MAKE THE MIRROR ACTUALLY MIRROR.
    //
    // The preset name was fixed in D19-234 and the numbers under it were not.
    // Measured on `garden-pass6-hero.png`: the pond carries no tree, no cloud
    // and no value range at all — it is one flat blue sheet, where reference
    // `09-beach-crowd-wide.png` gets a full range out of the water alone.
    //
    // Three things were holding it flat. `opacity: 0.87` blends 13% of the
    // BODY colour over the reflection at every angle, which at a grazing garden
    // camera is where the reflection should be strongest. `reflectionSoftness:
    // 0.26` blurs a 15 m pond's reflection over roughly a metre of surface, so
    // a maple 12 m away lands as a smear. And `sparkleStrength: 0.22` on a
    // still pond gives nothing to catch the sun.
    //
    // A garden pond at 10:00 under a partly-clouded sky is a mirror with a body
    // BELOW the reflection, not a body with a reflection painted on it.
    opacity: 0.96,
    position: { x: POND.x, z: POND.z },
    preset: 'mirror',
    quality: quality === 'performance' ? 'medium' : 'high',
    reflectionDistortion: 0.016,
    reflectionSoftness: 0.09,
    reflectionStrength: 0.94,
    refractionStrength: 0.5,
    rippleFoamStrength: 0.42,
    runupDistance: 0,
    sceneQuality: quality,
    segmentsPerMeter: POND.segmentsPerMeter,
    shorelineRunup: 0,
    swashFoamAmount: 0,
    shoreState: {
      region: { centerX: POND.x, centerZ: POND.z, depth: POND.depth, width: POND.width },
      resolution: { x: 512, y: 384 },
    },
    simulation: { resolution: 256, worldSize: 22 },
    sparkleStrength: 0.62,
    style: 'call_me_sensei',
    styleTarget: { targetId: 'garden/pond' },
    // Barely any swell. The disturbance a pond actually shows is the plunge,
    // the character's footfall and the wind cat's-paw — all of which arrive
    // through the ripple simulation, not through the Gerstner set.
    waveAmplitude: 0.05,
    waveDirection: [0.62, -0.78],
    waveDirectionSpread: 0.2,
    waveIntensity: 0.05,
    waveLength: 3.2,
    waveSteepness: 0.32,
    whitecapAmount: 0,
    width: POND.width,
    // A pond is 1.3 m deep; the shipped 6 m skirt would hang below the world.
    volumeDepth: 2.4,
    volumeOpacity: 0.62,
  });
  scene.add(pondWater);

  const upperPool = surface.createWaterSurface({
    breakerEnabled: false,
    causticsScale: 2.4,
    causticsSpeed: 0.4,
    causticsStrength: 0.85,
    // Same tone as the pond it falls into — D19-234. Two bodies of water 12 m
    // apart in one frame must not be in two different palettes.
    colorTone: 'anime',
    deepFadeDistance: 0.62,
    depth: UPPER_POOL.depth,
    depthFadeDistance: 0.22,
    detailNormalStrength: 0.3,
    detailScale: 3.6,
    foamAmount: 0.34,
    maxSegments: UPPER_POOL.maxSegments,
    nearshorePhase: { incidentAxis: 'z', referenceX: UPPER_POOL.x, referenceZ: UPPER_POOL.z },
    opacity: 0.84,
    position: { offset: UPPER_POOL_LEVEL, x: UPPER_POOL.x, z: UPPER_POOL.z },
    // `calm`, not `mirror`: the upper basin is the one being spilled out of, so
    // it carries a real ripple where the pond below carries a reflection.
    preset: 'calm',
    quality: quality === 'performance' ? 'low' : 'medium',
    reflectionStrength: 0.86,
    rippleFoamStrength: 0.9,
    sparkleStrength: 0.7,
    sceneQuality: quality,
    segmentsPerMeter: UPPER_POOL.segmentsPerMeter,
    shoreState: {
      region: {
        centerX: UPPER_POOL.x, centerZ: UPPER_POOL.z,
        depth: UPPER_POOL.depth, width: UPPER_POOL.width,
      },
      resolution: { x: 192, y: 160 },
    },
    simulation: { resolution: 128, worldSize: 6 },
    style: 'call_me_sensei',
    styleTarget: { targetId: 'garden/upper-pool' },
    waveAmplitude: 0.03,
    waveIntensity: 0.08,
    waveLength: 1.6,
    whitecapAmount: 0,
    width: UPPER_POOL.width,
    volumeDepth: 0.9,
    volumeOpacity: 0.6,
  });
  scene.add(upperPool);

  // --- 4. Stone -------------------------------------------------------------
  //
  // Doc 20 §1: "Japanese gardens are ABOUT stone. Set stones, stepping stones,
  // cascade rocks, gravel-sea islands — rock is the compositional subject."
  // Three catalog base shapes across five scale classes, each with its own
  // projection period and moss coverage — see props.js.
  //
  // D19-062 IS ACTIVE. Every material built through `installToonLabSurfaceLighting`
  // currently receives zero direct sun in a `createSceneStyleRuntime` scene, so
  // stone renders flat navy until the lighting owner lands the fix. Do not
  // grade this scene, and do not judge its composition, before then — grading
  // against navy stone measures the bug.
  onProgress('Setting the stone');
  const stone = await createGardenStone({ renderer, surface });
  scene.add(stone.group);

  // --- 5. Trees -------------------------------------------------------------
  // Added BEFORE the style bundle so scene-label discovery finds every canopy
  // and trunk material in one pass.
  onProgress('Planting the maples and pines');
  const trees = await createGardenTrees({ fog, surface, styleTargets: treeStyleTargets });
  scene.add(trees.group);

  // --- 5b. Manufactured garden furniture -----------------------------------
  // PROP-GDN-01 lanterns and tsukubai, and the PROP-GDN-02 bamboo screen that
  // closes the boundary. Added BEFORE the style bundle so scene-label discovery
  // converts their materials in the same pass as everything else.
  onProgress('Setting the lanterns and the basin');
  const dressing = await createGardenDressing({
    shadowFill: SHADOW_FILL,
    shadowFillTint: SHADOW_FILL_TINT,
    surface,
  });
  scene.add(dressing.group);

  // D19-202. `createGardenDressing` has returned `surfaceLightingMaterialCount`
  // since the adapter was fixed, and its own docblock says it is "asserted by
  // the caller rather than eyeballed" — but no caller ever asserted it. It was
  // placed in the frozen census and read by nothing, and the census is not
  // exported to the capture dataset either, so a count of ZERO would have
  // travelled all the way to a review frame reporting success.
  //
  // That is the exact shape of the failure this scene keeps paying for: a
  // lighting term that silently does not reach a material family, where the
  // wrong result still looks like a plausible render (D19-190 for `setSun`,
  // D19-201 for the grass fields). A returned count is only evidence if
  // somebody compares it to an expectation.
  //
  // Five prop types are converted (fence, kasuga, oribe, tsukubai, yukimi), so
  // the floor is one material per type. Throwing is correct over warning: the
  // capture harness reads `gardenError` and fails fast (D19-195), whereas a
  // console warning is exactly what the last two passes scrolled past.
  if (!(dressing.surfaceLightingMaterialCount >= 5)) {
    throw new Error(
      `Garden dressing surface lighting did not reach its materials: `
      + `surfaceLightingMaterialCount=${dressing.surfaceLightingMaterialCount}, expected >= 5. `
      + `shadowFill=${SHADOW_FILL} is not reaching the converted props (D19-150/D19-062).`,
    );
  }

  // --- 5b2. The near-field detail pass (PROP-GDN-03) -----------------------
  //
  // Path edging, planters, the deer-scarer and the footbridge. This is the
  // answer to two measured defects at once: the hero foreground was ~45% of the
  // frame carrying no information, and nothing in the garden showed evidence of
  // having been used. Both are set-dressing problems and the props were already
  // built (doc 19 D-020).
  onProgress('Detailing the near field');
  const detail = await createGardenDetail({
    onProgress,
    shadowFill: SHADOW_FILL,
    shadowFillTint: SHADOW_FILL_TINT,
  });
  scene.add(detail.group);
  if (!(detail.surfaceLightingMaterialCount >= 10)) {
    throw new Error(
      'Garden near-field detail did not reach the surface-lighting model: '
      + `surfaceLightingMaterialCount=${detail.surfaceLightingMaterialCount}, expected >= 10 `
      + '(D19-150/D-018c).',
    );
  }

  // --- 5c. Stillwater Lane (doc 21) ----------------------------------------
  //
  // The street, on the garden's south boundary, in the SAME scene and the SAME
  // height field. Built before the style bundle for the same reason everything
  // else is: scene-label discovery visits every material in one pass.
  //
  // `lane: false` builds the garden alone. Doc 21 §6 is explicit that the street
  // is additive and "must never drag the scene down to make itself fit", so the
  // ability to drop it has to be a real switch rather than a comment.
  let lane = null;
  if (buildLane) {
    onProgress('Opening Stillwater Lane');
    lane = await createStillwaterLane({
      lod: quality === 'performance' ? 1 : 0,
      onProgress,
      shadowFill: SHADOW_FILL,
      shadowFillTint: SHADOW_FILL_TINT,
    });
    scene.add(lane.group);
    // D-018c, and the same assertion the garden dressing already carries. Five
    // buildings, five poles and two dozen props route through `styleProp`; a
    // zero here means the whole street is outside the surface-lighting model
    // and every one of them will read navy against first-party stone.
    if (!(lane.surfaceLightingMaterialCount >= 20)) {
      throw new Error(
        'Stillwater Lane surface lighting did not reach its materials: '
        + `surfaceLightingMaterialCount=${lane.surfaceLightingMaterialCount}, expected >= 20. `
        + `shadowFill=${SHADOW_FILL} is not reaching the street (D19-150/D-018c).`,
      );
    }
  }

  // INTEGRATION: ARCH-GDN-01 teahouse on the graded pad at (9.4, -4.6);
  // Yua on YUA_MARK; the shader wipe.

  // --- 6. Grass, moss and pond planting -------------------------------------
  //
  // Three roles, three silhouettes. The coastal pass proved that fields
  // differing only in blade count read as one plant across a whole scene; each
  // role here carries its own height band, colour, lean and distribution, and
  // its art direction is applied AFTER the bundle lands (D19-032 — the bundle's
  // grass slot calls applySettings and silently reverts per-field authoring).
  onProgress('Laying the moss');
  //
  // D19-087. `bladeHeightRange`, `bladeWidthRange`, `clumpRadius` and
  // `bladesPerClump` are GEOMETRY-time settings — they are baked into the clump
  // mesh at construction (`grassClump.js:704-732`). `field.applySettings()`
  // accepts all four and then only writes material uniforms, so authoring them
  // after the style bundle lands does exactly nothing and nothing warns. They
  // are therefore split here: `geometry` goes into the constructor, `settings`
  // is re-applied after the bundle (D19-032). Getting this wrong is what turned
  // a moss carpet into a waist-high wheat field in pass 1.
  const GRASS_ROLES = Object.freeze([
    Object.freeze({
      // D19-233. FULL ADOPTION, and the two passes that dialled it down were
      // both fixing the wrong term. See GRASS_GROUND_ADOPTION above.
      adopt: GRASS_GROUND_ADOPT,
      count: grassCount,
      // A moss carpet, not a lawn: 7–17 cm blades, narrow, packed into a tight
      // rosette so the colony reads as one velvet surface rather than as
      // countable blades.
      geometry: Object.freeze({
        bladeHeightRange: [0.07, 0.17],
        bladeWidthRange: [0.014, 0.03],
        bladesPerClump: 44,
        clumpRadius: 0.3,
      }),
      id: 'moss',
      mask: mossMask,
      minSpacing: 0.2,
      seed: 4_211,
      settings: Object.freeze({
        backlitStrength: 0.28,
        ...GRASS_GROUND_ADOPTION,
        leanStrength: 0.09,
        // D19-243. `washLift` mixes the blade toward `shaded.color * 1.18`
        // (shaders-tsl/grass.js:370-373), i.e. it is a straight brightening
        // pass over the adopted ground colour. At 0.62 it put the blades ~11%
        // above the surface they are supposed to have grown out of, which is
        // most of what was left of "the grass is not grey like the ground"
        // once adoption itself was fixed. Kept small rather than zero: a
        // little lift is what separates a blade from its own shadow.
        washLift: 0.07,
        washOpacity: 0.9,
      }),
      // Deep, cool, saturated moss green with almost no tip lift — a moss
      // colony has no bright tips, which is most of what separates it from
      // grass at a glance.
      shader: Object.freeze({
        ...GRASS_HIGHLIGHT,
        backlitStrength: 0.34,
        // D19-207. Authored MORE saturated than the colour we want on screen,
        // deliberately. The sky fill is the blue-white SH probe, so it does not
        // just lift the blades, it desaturates them: measured, the field
        // rendered at saturation 0.28 against an authored 0.59 while the HUE
        // arrived correctly at 92.9 deg vs 99.8 deg. The authoring surface is
        // fine; the wash is downstream of it. So the input is pre-compensated
        // rather than the fill being turned down, which would just put the
        // funeral back.
        baseColor: [0.10, 0.33, 0.075],
        bandSoftness: 0.16,
        bandThreshold: 0.44,
        colorVariationStrength: 0.14,
        emissiveStrength: 0.015,
        rootOcclusionHeight: 0.7,
        rootOcclusionStrength: 0.45,
        tipBrightness: 0.14,
        tipDesaturation: 0.1,
        tipGradientStart: 0.35,
      }),
      variant: 'primary',
      wind: 0.025,
    }),
    Object.freeze({
      // "Without exception" (D19-233). The clump role previously took 0.25 on
      // the theory that adoption is a moss-scale idea and a taller plant should
      // keep its own colour — but `groundAdoptHeight: 0.88` already expresses
      // exactly that gradient, and it does it per blade fraction rather than by
      // weakening the whole field. A hakonechloa clump standing in gravel
      // genuinely is pale at the root.
      adopt: GRASS_GROUND_ADOPT,
      count: 620,
      // Ornamental clumps — hakonechloa scale, arching.
      geometry: Object.freeze({
        bladeHeightRange: [0.44, 0.92],
        bladeWidthRange: [0.05, 0.085],
        bladesPerClump: 26,
        clumpRadius: 0.42,
      }),
      id: 'clump',
      mask: clumpMask,
      minSpacing: 0.62,
      seed: 7_331,
      // Warmer and paler than the moss, so the pockets read as planting
      // rather than as long moss.
      settings: Object.freeze({
        backlitStrength: 0.62,
        ...GRASS_GROUND_ADOPTION,
        leanStrength: 0.72,
        washOpacity: 0.66,
      }),
      // A note on how this went wrong, because it cost a whole pass.
      //
      // Pass 1 authored this role as a bright yellow-green with
      // `tipBrightness: 0.28`, made it 0.44–0.92 m tall, and gave it 1 100
      // placements over a mask that also fired thinly across the whole moss
      // field. The result was a waist-high PALE STRAW meadow covering the
      // garden — and because it hid the moss underneath it, three rounds of
      // debugging went into the moss field, the ground shader and the style
      // bundle before the uniforms said plainly that every value was landing
      // exactly as written. The defect was the art direction, not the pipeline.
      //
      // It is now a deep, only slightly warmer green than the moss, and rare.
      // Ornamental grass in a garden is an accent measured in dozens of clumps.
      shader: Object.freeze({
        ...GRASS_HIGHLIGHT,
        backlitStrength: 0.86,
        baseColor: [0.17, 0.33, 0.11],
        colorVariationStrength: 0.14,
        emissiveStrength: 0.025,
        tipBrightness: 0.12,
        tipDesaturation: 0.06,
        tipGradientStart: 0.3,
      }),
      variant: 'secondary',
      wind: 0.1,
    }),
  ]);

  const grassFields = [];
  const grassArea = { max: { x: 19, z: 19 }, min: { x: -19, z: -19 } };
  // `?nograss=1` builds the scene with no vegetation at all. It is the only way
  // to see what the Ground Shader is actually painting, and it found the pass-1
  // ground defect in one frame after two rounds of guessing at the grass.
  for (const role of (grassCount > 0 ? GRASS_ROLES : [])) {
    const field = await surface.createGrassField({
      ...role.geometry,
      count: role.count,
      groundAdoptStrength: role.adopt,
      mask: role.mask,
      max: grassArea.max,
      min: grassArea.min,
      minSpacing: role.minSpacing,
      preset: 'call_me_sensei_clump',
      pushRadius: 1.0,
      quality, // 'high' would THROW — profiles are balanced|performance
      seed: role.seed,
      styleTarget: { targetId: `garden/grass-${role.id}` },
      variant: role.variant,
      vegetationShader: createGrassShaderProfileSettings({
        grass: role.shader,
        lighting: { skyFillStrength: skyFill },
        preset: 'call_me_sensei',
      }),
      waterMargin: 0.04,
    });
    field.setWind({
      direction: [0.62, -0.78],
      gustFrequency: 0.14,
      gustSpeed: 0.7,
      speed: 0.65,
      strength: role.wind,
    });
    scene.add(field);
    grassFields.push({ field, role });
  }

  // Pond-edge planting, distributed ALONG the pond margin's own curve frame.
  // This is the case `scatterInRect` cannot express (D19-066 / FILL-013): a
  // constant-width band around an irregular pond is not a rectangle with a hole
  // in it, and a boolean mask can only reject, never distribute. `scatterAlong`
  // spreads by arc length, so the fringe stays even around every lobe.
  onProgress('Planting the pond margin');
  const pondEdgePlacements = POND_MARGIN.scatterAlong({
    count: grassCount > 0 ? 1_500 : 0,
    heightAt: gardenHeight,
    mask: pondEdgeMask,
    minSpacing: 0.24,
    offsetRange: [-1.9, 0.15],
    seed: 5_309,
  });
  const pondEdgeField = await surface.createGrassField({
    // Geometry-time (D19-087): iris and sedge are tall, narrow and upright —
    // a genuinely different plant from both the moss and the clumps.
    bladeHeightRange: [0.66, 1.28],
    bladeWidthRange: [0.028, 0.05],
    bladesPerClump: 22,
    clumpRadius: 0.36,
    ...GRASS_GROUND_ADOPTION,
    placements: pondEdgePlacements,
    preset: 'call_me_sensei_clump',
    pushRadius: 0.9,
    quality,
    seed: 5_309,
    styleTarget: { targetId: 'garden/grass-pond-edge' },
    variant: 'secondary',
    waterMargin: 0.03,
  });
  pondEdgeField.setWind({
    direction: [0.62, -0.78], gustFrequency: 0.2, gustSpeed: 0.8, speed: 0.8, strength: 0.14,
  });
  scene.add(pondEdgeField);
  grassFields.push({
    field: pondEdgeField,
    role: {
      id: 'pond-edge',
      settings: Object.freeze({
        backlitStrength: 0.7,
        ...GRASS_GROUND_ADOPTION,
        leanStrength: 0.16,
        washOpacity: 0.64,
      }),
      // Iris and sedge: blue-green, upright, and darker at the tip than the
      // ornamental clumps so the fringe reads as a third plant rather than as
      // the second one standing in water.
      shader: Object.freeze({
        ...GRASS_HIGHLIGHT,
        backlitStrength: 0.6,
        baseColor: [0.13, 0.36, 0.24],
        colorVariationStrength: 0.1,
        emissiveStrength: 0.02,
        tipBrightness: 0.1,
        tipDesaturation: 0.18,
        tipGradientStart: 0.5,
      }),
    },
  });

  // INTEGRATION: grassFields.forEach(({field}) => field.setPushTarget(yua.carrier)).

  // --- 7. Sky ---------------------------------------------------------------
  onProgress('Building the sky');
  const sky = await createSkySystem({
    camera,
    godRays: true,
    quality: quality === 'performance' ? 'medium' : 'high',
    renderer,
    scene,
    // Kyoto latitude, so the sun path shape belongs to the place.
    timeOfDay: { autoAdvanceSecondsPerDay: 0, latitude: 35, time: TIME_OF_DAY / 24 },
  });

  // --- 8. Post + style runtime ---------------------------------------------
  onProgress('Lighting the garden');
  const post = createPostProcessingPipeline({
    camera,
    renderer,
    scene,
    settings: { preset: 'call_me_sensei' },
  });

  const runtime = createSceneStyleRuntime({
    collisionHeightAt: gardenHeight,
    fog,
    post,
    quality, // 'high' THROWS here
    renderer,
    // §6.5 asks for filmic tone mapping; that is a RENDERER setting, not a post
    // setting (D19-023).
    rendererConfiguration: {
      toneMapping: THREE.ACESFilmicToneMapping,
      toneMappingExposure: 1.04,
    },
    scene,
    sky,
    timeOfDay: TIME_OF_DAY,
    water: pondWater,
  });

  // `watch: false`, deliberately. Under `watch: true` the style transaction
  // re-applies whenever the scene graph changes, and it re-applies the BUNDLE's
  // slot settings — so every per-field grass profile, every per-role colour and
  // every material touched after the bundle is silently reverted at an
  // unpredictable moment (D19-032, and the reason three grass fields with three
  // different authored palettes all rendered as the same pale wheat). Nothing
  // is added to this scene after the bundle lands, so watching buys nothing and
  // costs the entire per-role art direction.
  await runtime.apply(CALL_ME_SENSEI_STYLE_BUNDLE, {
    discovery: 'scene-labels',
    mode: 'strict',
    watch: false,
  });

  // partlyCloudy is the SkySystem physical preset (not a "scenario"), and is
  // the bundle's own physical default. Going through the runtime keeps the
  // style snapshot and the coordinated lighting frame intact.
  await runtime.setSkyPreset(SKY_PRESETS.partlyCloudy, { timeOfDay: TIME_OF_DAY });

  // DIAGNOSTIC (?cloudshadow=0)
  if (cloudShadow === false) clearEnvironmentCloudShadowPass();

  // D19-041. Unlike the 240 x 180 m coast, this world FITS the shipped Call Me
  // Sensei cascade (±34 m near / 140 m far), so the sizing is left alone and
  // only the map resolution and biases are authored for a 40 m scene. The pass
  // still renders nothing (`shadowPass.renderCount` stays 0), so the marker is
  // cleared when shadows are off — `sharedSunVisibility` then falls back to
  // float(1), the correct fail-OPEN behaviour for a pass that produced nothing.
  // Without that, every receiver samples cleared depth, tests as occluded, and
  // the direct sun term goes to exactly zero.
  let sun = null;
  scene.traverse((object) => { if (object.isDirectionalLight && object.shadow) sun = object; });
  if (sun) {
    // D19-251. The world is 52 x 66 m now that the lane is in it, and the lane
    // sits entirely OUTSIDE the old +-34 m box — so every street object was
    // going to fall off the far edge of the shadow map and ground nothing.
    // Widened to cover the whole extent, and the map doubled with it so the
    // texel density on the ground actually goes UP rather than down: 4096 over
    // 88 m was 46 px/m, 8192 over 96 m is 85 px/m. Sharp cast shadows are the
    // single largest source of form in the frame and they are worth the memory.
    sun.shadow.camera.near = 0.1;
    sun.shadow.camera.far = 110;
    sun.shadow.camera.left = -42;
    sun.shadow.camera.right = 42;
    sun.shadow.camera.top = 42;
    sun.shadow.camera.bottom = -42;
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.toonLabFarExtent = 52;
    sun.shadow.toonLabFarCameraFar = 140;
    // D19-264. 4096 over the widened 84 m box is 49 px/m, and at that density the
    // terminator on a straight kerb reads as a saw-tooth. 8192 over the same box
    // is 98 px/m and the edge resolves. (The blackout this was suspected of
    // causing was cloud optical depth — D19-260 — so the map size is free.)
    sun.shadow.mapSize.set(8192, 8192);
    // Halved with the texel size. The old biases were solved against a 46 px/m
    // map; carried onto an 85 px/m one they peel the contact shadow off the
    // base of every object, which is exactly the "nothing is grounded" read.
    // D19-265 — HALVING THE BIAS WITH THE TEXEL SIZE WAS WRONG, and the frame
    // said so immediately. Captured at 0.016 / -0.00022 every shadow terminator
    // in the street grew a hard black SAW-TOOTH fringe along the wall copings,
    // the kerb line and the gate eaves (`garden-pass7-approach.png`). That is
    // acne, not aliasing: the depth comparison is failing on surfaces almost
    // parallel to the light, which is most of a street's horizontal detail under
    // a 42 deg sun.
    //
    // The reasoning behind the halving was that bias scales with texel size. It
    // does — but the ToonLab cascade does not resolve its own map at
    // `mapSize`, so doubling `mapSize` did not halve the world-space texel the
    // bias has to clear. Restored to the values that were solved against a
    // rendered frame rather than against an arithmetic argument.
    sun.shadow.normalBias = 0.03;
    sun.shadow.bias = -0.0004;
    sun.castShadow = shadows;
    if (!shadows) delete sun.shadow.toonLabLightingContract;
  }

  // §6.5 "directional layered clouds". The bundle's `cloud` slot resolves to
  // schema defaults (D19-006 / FILL-004), so the garden's sky is authored
  // explicitly: a high, slow, well-separated deck. A garden's sky is a quiet
  // ceiling — anything busier competes with the composition below it, and the
  // pond mirrors whatever is up there straight back into frame.
  //
  // D19-256 / FILL-004 — THE CLOUDS WERE FLAT BECAUSE THE SHAPE WAS FLAT, NOT
  // ONLY BECAUSE THE BUNDLE'S CLOUD SLOT RESOLVES TO SCHEMA DEFAULTS.
  //
  // The garden was already authoring `shape` explicitly, so FILL-004 was half
  // filled. What it authored was `density: 0.048` — the schema DEFAULT — with
  // `edgeSoftness`, `erosion*` and the whole `lighting` group untouched. A cloud
  // at that density is optically thin end to end, so it has no interior: it
  // renders as one flat value with a soft edge, which is the "white blobs with
  // no internal form" reading exactly.
  //
  // A cloud reads as volume through THREE things and the garden was buying none
  // of them:
  //
  //   `density`           optical depth. At 0.048 light passes through; at 0.14
  //                       the core goes genuinely dark and the sunlit shoulder
  //                       separates from it. This is the value range item 8 asks
  //                       for, inside the cloud rather than across the frame.
  //   `powderStrength`    darkens the thin sunlit edges. Its own schema
  //                       description says it "is what stops them reading as
  //                       flat cotton". Left at 1; 2.1 makes the shoulder read.
  //   `baseShadowStrength` cloud bottoms. Ships at 0 — every cloud in this scene
  //                       was lit as brightly underneath as on top, which is the
  //                       single most cotton-wool thing available. 0.55 over the
  //                       lower 0.55 of the shell gives them a floor.
  //
  // `scatteringAlbedo` comes down from 0.9 so the deck reads grey and weighted
  // rather than paper-white, and `groundBounceAlbedo` is re-authored to the
  // garden's own floor — a green-grey bounce, because that is what is physically
  // underneath these clouds.
  //
  // Still a quiet ceiling. A garden's sky must not compete with the composition
  // below it, and the pond mirrors whatever is up there straight back into frame
  // — so coverage stays at 0.5 and the wind stays slow. What changed is that
  // each cloud is now a solid with a lit side and a dark side, not a decal.
  //
  // D19-260 — CLOUD OPTICAL DEPTH IS CAPPED, AND THE CAP IS A PRODUCT DEFECT.
  //
  // The comments here asked for `density` up and cloud-base shadowing on, and
  // the values shipped 0.048 / 0 — a comment describing an intent the numbers
  // never implemented, which is the same species as the discarded ground
  // profile (D19-236). Fixing it uncovered something worse.
  //
  // MEASURED, by bisection over eleven captures. Raising cloud optical depth
  // past roughly `density x thickness = 100` turns EVERY ToonLab
  // surface-lighting material in the scene to exact sRGB 0 — not dark, zero.
  // Buildings, boundary wall, poles, street furniture, lanterns and the bamboo
  // fence all vanish to silhouette while the ground shader, the grass fields,
  // the trees, the water and the rock shader beside them are unchanged to
  // within a couple of counts:
  //
  //   density 0.048 x thickness 1900 = 91    building sRGB [170, 167, 162]
  //   density 0.055 x thickness 2400 = 132   building sRGB [0, 0, 0]
  //   density 0.115 x thickness 2400 = 276   building sRGB [0, 0, 0]
  //
  // Ruled out by capture, one at a time: the cloud SHADOW pass (`?cloudshadow=0`
  // reproduces the blackout exactly), the sun shadow pass (`?shadows=0` ditto),
  // the whole post pipeline (`?nopost=1` ditto), `shadowFill` at 0.35 and 0.5,
  // `skyProbeEnergy` at 1.22 and 2.15, `sunIntensity` at 7.4 and 8.9, the
  // ambient fill at 0.5 and 0.95, the fog range, the ground distance term, and
  // every key in the cloud `lighting` group. It is optical depth alone.
  //
  // WHY IT IS SELECTIVE, AND WHY THAT MATTERS. This is FILL-016 with a number
  // on it. The families that survive all light from their OWN uniforms and
  // never read the scene's indirect term at all — that is the same
  // fragmentation that makes a HemisphereLight measure 0.362 -> 0.362. The
  // surface-lighting family is the ONE family that depends on the sky probe,
  // and under this rig it has no other light: `Lighting System Ambient` ships at
  // intensity 0 / `visible: false`. So when a thicker cloud deck dims the probe,
  // that family alone falls off a cliff while everything else is untouched.
  // A consumer who thickens their clouds loses every imported asset in their
  // scene and nothing warns. RECORDED for the lighting owner; not worked around
  // by editing a shipped value.
  //
  // So the deck stays at the safe optical depth and the internal FORM is bought
  // entirely from the `lighting` group, which is measured safe at these values
  // and is where doc item 8's "shaped, sunlit-from-one-side, real value range"
  // actually lives:
  //
  //   `powderStrength`      darkens the thin sunlit edges — its own schema text
  //                         says this "is what stops them reading as flat
  //                         cotton". Ships at 1.
  //   `baseShadowStrength`  cloud BOTTOMS. Ships at 0, so every cloud in this
  //                         scene was lit as brightly underneath as on top —
  //                         the single most cotton-wool thing available.
  //   `scatteringAlbedo`    0.9 reads as paper white; 0.82 reads as weather.
  sky.clouds.applyParams({
    shape: {
      altitude: 1_450,
      baseScale: 11_200,
      baseStrength: 0.98,
      coverage: 0.5,
      // CAPPED. See above — 0.048 x 1900 = 91 is inside the safe band and
      // 0.055 x 2400 = 132 is not. Do not raise either without re-measuring a
      // building's sRGB value in `laneWide`.
      density: 0.05,
      thickness: 1_900,
      weatherScale: 38_000,
    },
    lighting: {
      ambientIntensity: 0.52,
      baseShadowHeight: 0.55,
      baseShadowStrength: 0.55,
      powderStrength: 2.1,
      scatteringAlbedo: 0.82,
    },
    wind: { evolutionSpeed: 1.3, heading: 118, skew: 620, speed: 5.2 },
  });
  // "Restrained god rays": on, but well below the schema default of 2.
  sky.godRays.applyParams({ enabled: true, strength: 0.7 });

  // The ground profile, AFTER the bundle (D19-236). Same treatment the grass
  // fields below already get, and for the same reason. `applyGroundShader`
  // routes to the existing adapter's `applySettings`, so this rewrites the
  // uniforms in place rather than rebuilding the material or its splat.
  // `?splat=1` paints the four splat channels as flat primaries with the layer
  // maps switched off (`textureStrength: 0` makes `layerNode` the tint alone),
  // so the frame IS the splat: red moss, green earth, blue paving, white
  // gravel. It is the only way to see which channel a surface is actually
  // resolving to — reasoning about it from `roleWeights` proves what the splat
  // contains, not what the shader selects.
  // `?noreapply=1` skips the post-bundle re-apply, reproducing the D19-236
  // state exactly. It exists so the configuration gate can be shown to have
  // teeth against the defect it was built for, rather than only ever being
  // observed passing — a guard nobody has watched fail is not a guard.
  const groundApply = noReapply ? { applied: 1, matched: 1, skipped: 0, visited: 1 }
    : applyGroundShader(ground, splatDebug ? {
    ...groundProfile,
    layers: {
      ...groundProfile.layers,
      contrast: 1,
      dirtTint: [0, 1, 0],
      grassTint: [1, 0, 0],
      rockTint: [0, 0, 1],
      sandTint: [1, 1, 1],
      saturation: 1,
      // `?splat=1` is the pure channel read; `?splat=2` keeps the maps bound,
      // so the frame is `tint x detail` and a channel whose albedo never
      // reaches the surface shows up as a full-strength primary instead of a
      // dark one.
      textureStrength: splatDebug === 2 ? 1 : 0,
    },
  } : groundProfile);
  if (!(groundApply.applied >= 1 && groundApply.matched >= 1)) {
    throw new Error(
      'Garden ground profile did not re-apply after the style bundle: '
      + `applied=${groundApply.applied}, matched=${groundApply.matched}, `
      + `skipped=${groundApply.skipped}, visited=${groundApply.visited}. `
      + 'The ground is rendering the shipped preset, not the garden (D19-236).',
    );
  }

  // D19-239. RE-BIND THE FOUR LAYER ALBEDOS, and assert they are there.
  //
  // Measured, with `?splat=1` and a pixel sample rather than by eye: the moss
  // channel was selecting correctly — a pure-red debug tint painted the whole
  // floor red — while the surface itself rendered sRGB [100, 112, 107], a
  // near-neutral grey. That is the signature of `sampleProjectedLayer`
  // returning `vec3(1)`: with no map bound it falls back to white, so the
  // frame shows `tint x 1` and the ground becomes a flat wash of whatever the
  // four tints are, lit. Every "pale straw floor" reading across three passes
  // was that fallback, not a colour-grading problem — the 4096² MAT-GDN-02
  // moss albedo was never on the surface.
  //
  // `setLayerTexture` rebuilds the node graph, so this is also the only way to
  // restore them without replacing the material and losing the splat with it.
  const groundAdapter = (Array.isArray(ground.material) ? ground.material[0] : ground.material)
    ?.userData?.toonlabGroundShader ?? null;
  if (!groundAdapter?.setLayerTexture) {
    throw new Error('Garden ground material carries no Ground Shader adapter (D19-239).');
  }
  for (const [index, layer] of (noReapply ? [] : groundLayers.entries())) {
    if (!layer.texture?.isTexture) {
      throw new Error(`Garden ground layer ${index} (${layer.role}) has no texture (D19-239).`);
    }
    groundAdapter.setLayerTexture(index, layer.texture);
  }

  // D19-242. The ground field is what grass adoption SAMPLES, and it caches.
  //
  // Both edits above rewrite the ground's colour node, but the environment
  // ground-field pass only re-renders when it is invalidated — so without this
  // the grass keeps adopting a field baked from the shipped preset's ground
  // while the ground beside it renders the garden's. The two are then visibly
  // different surfaces, which is the "pale straw blades standing on green
  // moss" read, and it is the same stale-cache shape as everything else in
  // this block: the fix landed, and one consumer never heard about it.
  runtime.groundFieldPass?.invalidate?.();
  runtime.groundFieldPass?.invalidateColor?.();

  // Per-field grass art direction, AFTER the bundle (D19-032).
  //
  // D19-088. `baseColor` / `tipColor` on `createGrassSettings` are INERT under
  // the shipped Call Me Sensei grass shader: its profile sets
  // `grass.styleColorStrength: 1`, which blends fully from the asset-authored
  // blade colour to the STYLE's own `grass.baseColor` + `tipBrightness`. The
  // schema default for that key is 0; only the preset turns it on. So the
  // colour of a Call Me Sensei grass field is authored on the vegetation SHADER
  // profile, not on the grass settings — which is why three fields carrying
  // three different `baseColor` values all rendered as the same pale wheat.
  for (const { field, role } of grassFields) {
    field.applySettings({ preset: 'call_me_sensei', ...role.settings });
    if (role.shader) {
      field.setVegetationShader(createGrassShaderProfileSettings({
        preset: 'call_me_sensei',
        grass: role.shader,
        lighting: { skyFillStrength: skyFill },
      }));
    }
  }

  // Defensive re-assert of the tree profile after the bundle, matching what the
  // grass fields above already do. Idempotent.
  //
  // D19-203 records what this is NOT: it was proposed as the fix for the green
  // maple, on the theory that the bundle re-authored the vegetation slot and
  // discarded `GARDEN_VEGETATION_SHADER`. A live uniform readback disproved it
  // — `uStyleFoliageStyleColorStrength` measures 0.35 at render time, the
  // garden's value, not the shipped 1. The override survives the bundle. Kept
  // because ordering-sensitivity is real elsewhere (D19-032/D19-089) and this
  // costs nothing, but it is not the cause and must not be cited as the cure.
  trees.setVegetationShader(foliageStyle === null ? GARDEN_VEGETATION_SHADER : {
    ...GARDEN_VEGETATION_SHADER,
    settings: {
      ...GARDEN_VEGETATION_SHADER.settings,
      foliage: { ...GARDEN_VEGETATION_SHADER.settings.foliage, styleColorStrength: foliageStyle },
    },
  });

  // LAST, and the order is load-bearing: `setVegetationShader` rewrites the
  // foliage uniforms, so restoring the authored colour before it would be
  // silently undone. D19-205.
  const authoredFoliage = trees.restoreAuthoredFoliageColour();
  if (authoredFoliage === 0) {
    throw new Error('Authored foliage colour reached no foliage material (D19-205).');
  }

  // --- Ambient fill (FILL-016 / D19-204) ------------------------------------
  //
  // THE GAP: the `call-me-sensei` lighting style ships its `Lighting System
  // Ambient` at intensity 0 with `visible: false`, by design — the style is
  // authored around an SH sky probe instead. But that probe's measured radiance
  // is R:G:B = 1 : 2.24 : 5.33, so every surface the sun does not directly
  // strike receives a fill that is both WEAK and strongly BLUE. Shade therefore
  // goes dark and cold at the same time, which is exactly the "funeral" read:
  // the garden measured a lower-third mean luma of 0.165 and a shadow hue of
  // 102 deg against reference `09-beach-crowd-wide.png`'s 0.737 and 327 deg.
  //
  // This is filled scene-side rather than routed around, and recorded. It is a
  // real product gap: a bundle that disables ambient with no warning does this
  // to every consumer's scene, not only to this one.
  //
  // A HEMISPHERE light, not a flat ambient, because flat ambient lifts a
  // surface's underside exactly as much as its top and dissolves form — the
  // failure mode that makes a lifted scene read as washed-out rather than lit.
  // Sky colour is a deliberate warm VIOLET: §2 asks for shadows that are
  // "warm, luminous and coloured — never neutral grey", the benchmark measures
  // beach shade at 327-330 deg violet-magenta and city shade at 214-267 deg
  // blue-violet, and this garden sits under warm daylight, so it takes the
  // violet-magenta end. Ground colour is the warm bounce off the sunlit raked
  // gravel court, which is what physically fills a garden's shade from below.
  //
  // NOTE, measured and load-bearing: this CANNOT reach the grass or the trees.
  // Procedural vegetation builds bare `NodeMaterial`s that light entirely from
  // their own uniforms and never read scene lights (D19-130), so ambient lifts
  // the ground, stone, water, terrain and props only. The vegetation half of
  // the same problem is `lighting.skyFillStrength` (D19-201), and the two are
  // tuned together — neither is sufficient alone.
  const ambient = new THREE.HemisphereLight(
    new THREE.Color(...GARDEN_AMBIENT_SKY),
    new THREE.Color(...GARDEN_AMBIENT_GROUND),
    ambientIntensity,
  );
  ambient.name = 'Stillwater Garden · Ambient fill (FILL-016)';
  ambient.position.set(0, 20, 0);
  scene.add(ambient);

  // --- The shade key (FILL-016b / D19-262) ---------------------------------
  //
  // MEASURED: a surface-lighting material's `environmentReflections` reports
  // `activeContribution: "black"` — there is no image-based lighting in this rig
  // at all — and the style's own `Lighting System Ambient` ships at intensity 0,
  // `visible: false`. So the ONLY light an imported asset in this scene ever
  // receives is `Lighting System Sun`. A surface facing away from it is not
  // dark; it is unlit, and it renders at exactly zero.
  //
  // In a garden that costs the underside of a canopy. In the LANE it costs
  // everything: doc 21 puts the four frontages on the south side and the sun is
  // south-east, so every façade in the street faces away from the only light in
  // the world by construction. Measured on `t6-lane.png`: the boundary wall,
  // which faces south, renders sRGB [201, 198, 183]; the buildings opposite,
  // three metres away and made of the same material, render [0, 0, 0].
  //
  // `shadowFill` cannot reach this. It keeps a fraction of the sun term alive
  // inside the SHADOW MASK, and a back-facing surface has no sun term to keep a
  // fraction of — 0.35 and 0.5 were captured and are byte-identical on a north
  // wall. Nor can the HemisphereLight above: the procedural families never read
  // scene lights at all, and the surface-lighting family reads DIRECTIONAL
  // radiance.
  //
  // So the fill is a second DirectionalLight, opposite the key, and that is not
  // a workaround — it is the one channel this material family actually listens
  // on. It casts no shadow, it is a fifth of the key, and it is tinted to the
  // same violet the shade family is authored in (§2's "warm, luminous and
  // coloured — never neutral grey"), so a north wall reads as a lit surface in
  // shade rather than as a hole cut in the frame.
  //
  // RECORDED as the sharpest available statement of FILL-016: there is no single
  // indirect term in ToonLab that reaches every material family, so a scene
  // needs THREE fills — `shadowFill` for imported assets and rock,
  // `lighting.skyFillStrength` per vegetation profile, the ground shader's own
  // block — and even with all three, a back-facing imported surface still gets
  // nothing. This light is the fourth.
  const shadeKey = new THREE.DirectionalLight(new THREE.Color(0.86, 0.84, 1.0), 1.75);
  shadeKey.name = 'Stillwater Garden · Shade key (FILL-016b)';
  // Opposite the sun in azimuth and lower: north-west and 26 deg up, so it fills
  // the faces the key never reaches without flattening the ones it does.
  shadeKey.position.set(-30, 17, -38);
  shadeKey.target.position.set(0, 0, 8);
  shadeKey.castShadow = false;
  scene.add(shadeKey, shadeKey.target);


  // Shadow-fill adoption, last: after the bundle and after every per-field
  // material rebuild, so nothing installed later loses it.
  const shadowFillMaterials = adoptShadowFill(scene);

  // §6.5 restrained bloom. The `call_me_sensei` post preset ships bloom off
  // (D19-025), so it is re-enabled explicitly, after the bundle lands. Kept
  // very small: the only things in this garden bright enough to bloom are the
  // pond's specular and the gravel, and both should stay readable.
  //
  // D19-255 — THE FRAME HAS NO VALUE RANGE, AND THE GRADE THAT WOULD GIVE IT
  // ONE IS SWITCHED OFF IN THE PRESET.
  //
  // `POST_PROCESSING_PRESETS.call_me_sensei` ships `colorGrade: false` and
  // `depthCue: false` (postProcessing.js:118-137). So `contrast`, `saturation`,
  // `warmth` and the whole atmospheric depth cue are accepted by the settings
  // object and then never evaluated — every one of them is a dead key on this
  // preset, which is why three passes of "push the tone curve" changed nothing.
  // Turning the FEATURE on is the prerequisite; the parameters are inert without
  // it. Recorded, not edited in the preset.
  //
  // `contrast` scales around mid grey, so it is exactly the lever the reference
  // comparison asks for: `03-alley-underpass` works because deep shade sits
  // against a blown street, and `01-city-street` has near-black under vehicles
  // and white on glass. Our frame occupied about a third of the range.
  //
  // `depthCue` is the SECOND thing that comparison asks for — far planes lighter,
  // cooler and lower-contrast in clear steps. It is a per-pixel depth ramp toward
  // `depthCueColor`, so unlike `THREE.Fog` it separates the enclosing pine mass
  // from the mid-band without needing distance the garden does not have. Pointed
  // at the same colour as the fog and the ground shader's distance term so all
  // three agree, and sized to a 40 m garden: full effect by 70 m, which is the
  // far side of the world rather than the far side of a valley.
  //
  // MEASURED CORRECTION, and it is the whole reason this block is worth a
  // paragraph: THE GRADE RUNS IN LINEAR SPACE, BEFORE TONE MAPPING. `contrast`
  // scales around 0.5, and 0.5 LINEAR is not mid grey — it is roughly sRGB 188,
  // a bright highlight. So a contrast of 1.24 pivots the whole image about a
  // point almost everything sits below, and drives it to zero:
  //
  //     shade at 0.05 linear -> (0.05 - 0.5) x 1.24 + 0.5 = -0.058  -> CLIPPED
  //
  // Captured at 1.24 the lane rendered as a pure black silhouette against sky
  // and the garden's whole lower half went to zero. 1.05 was tried next and
  // rendered the SAME black frame — because the clip point is not proportional
  // to the excess. For a contrast c the output goes negative below
  //
  //     x < 0.5 - 0.5/c
  //
  // which at c = 1.05 is x < 0.0238 LINEAR, i.e. everything under about sRGB 44
  // is floored to zero. A contrast of five percent removes the whole bottom
  // sixth of the range. Measured, not reasoned about after the fact: at 1.05 the
  // lane's lower third graded 0.004 against 0.373 for the garden, and the same
  // capture with `?shadows=0` graded 0.004 as well — which is what ruled the
  // shadow pass out and pointed at the grade.
  //
  // So this lever is 1.0 and stays 1.0. `contrast` is not usable in a linear
  // pipeline in either direction; `saturation` and `warmth` are, because they
  // are ratios rather than offsets. The value range is bought in the LIGHTING
  // instead — a stronger key for true highlights, and a sky probe with enough
  // energy that shade is dark without being empty.
  //
  // `strength: 1` because the preset ships 0.45 and that scales the whole stack.
  post.setSettings({
    features: {
      bloom: true, colorGrade: true, depthCue: true, screenOutline: true, vignette: true,
    },
    parameters: {
      bloomRadius: 0.14,
      bloomStrength: 0.17,
      bloomThreshold: 0.84,
      contrast: 1,
      depthCueColor: new THREE.Color(HORIZON.color),
      depthCueFar: 70,
      depthCueNear: 14,
      depthCueStrength: 0.22,
      // D19-261 — SCREEN-SPACE OUTLINES. Shipped, implemented, and OFF: the
      // schema's own text at postProcessing.js:255 is "draws screen-space
      // outlines from depth and luminance edges", `outlineStrength` defaults to
      // 0, and the `debugEdges` preset in the same file runs the path at
      // 0.85/0.55/1.0. This is the POST outline and has nothing to do with
      // src/toon/** or the cel path, which remain untouched.
      //
      // Crisp dark contours are a large part of the anime read and the frame had
      // none. Depth edges do the heavy lifting — they separate a pole from the
      // wall behind it, a kerb from the road, and a building's corner from the
      // next building — so the depth term carries most of the weight and the
      // luma term is kept low, because a strong luma edge draws a line around
      // every cloud and every patch of moss.
      outlineColor: new THREE.Color(0x141a1e),
      outlineDepthStrength: 0.55,
      outlineLumaStrength: 0.12,
      outlineStrength: 0.75,
      saturation: 1.02,
      strength: 1,
      vignetteRadius: 0.62,
      vignetteSoftness: 0.42,
      vignetteStrength: 0.03,
      warmth: 0.02,
    },
    preset: 'call_me_sensei',
  });

  // --- 9. Garden lighting authoring -----------------------------------------
  //
  // §2's shadow family: "warm, luminous, and COLOURED — never neutral grey …
  // violet-leaning in the shade masses, keeping them luminous rather than
  // crushed." The parity analysis measured benchmark shadow hues at 214–330°.
  //
  // The mechanism matters. `shadowTint` alone is a toon-response term; what
  // actually lights every N.L <= 0 surface in this rig is the SH sky probe,
  // because `ambientLight` is disabled by design. So the probe colour and
  // energy are authored too, plus `skyGroundTint` — the probe's lower
  // hemisphere, which here is physically the bounce off a pale raked-gravel
  // floor and is what keeps the moss shade warm instead of navy. `skyTopTint`
  // stays cool; that contrast is what makes the bounce read as bounce.
  //
  // D19-047: `shadowHue` currently measures the SUN's hue, not the shadows',
  // because there are no cast shadows to sample (D19-041). These values are
  // authored on art-direction grounds and must be RE-MEASURED once shadows
  // land. Do not tune them against the metric before then.
  const gardenLightingStyle = resolveLightingStylePreset('call-me-sensei');
  const GARDEN_KEYFRAME = Object.freeze({
    accentScale: 1.1,
    ambientScale: 1,
    exposureScale: 1.04,
    fixtureScale: 0,
    fogColor: [0.85, 0.86, 0.88],
    hour: TIME_OF_DAY,
    sky: { horizon: [0.8, 0.9, 1.04], stars: 0, zenith: [0.19, 0.48, 1.0] },
    // Warm bounce off the gravel sea and the pale paving, ~40°.
    skyGroundTint: [1.22, 1.06, 0.94],
    // ~278°: violet-leaning, and BRIGHT. "Luminous never-crushed shadows" is
    // the style's own stated intent, which the dawn interpolation defeats.
    skyProbeColor: [0.88, 0.83, 1.0],
    // D19-259. THE PROBE IS THE ONLY LIGHT A NORTH WALL EVER SEES.
    //
    // The `call-me-sensei` rig has no ambient light (its own `Lighting System
    // Ambient` ships at intensity 0, `visible: false`), so every surface with
    // N.L <= 0 is lit by this probe and by nothing else. In a garden that is
    // the underside of a canopy and the shaded flank of a stone. In a STREET it
    // is four entire building frontages: doc 21 puts the frontages on the south
    // side and the sun is south-east, so every façade in the lane faces away
    // from the sun by construction and the probe is their whole light budget.
    //
    // At 1.22 they measured essentially zero and the street rendered as a
    // silhouette. 2.15 is the value where a north wall reads as a lit surface in
    // shade — which is what reference `03-alley-underpass` actually shows, deep
    // shade WITH form in it, against a blown-bright strip of sunlit ground.
    skyProbeEnergy: 2.15,
    skyTopTint: [0.88, 0.95, 1.14],
    sunColor: [1, 0.96, 0.88],
    sunIntensity: 8.9,
  });
  runtime.lighting?.setStyle({
    ...gardenLightingStyle,
    // Inserted, not replaced: hours 0/6/13/18/22 stay exactly as shipped, so
    // `setTimeOfDay` still sweeps smoothly through the garden keyframe.
    dayCycle: [...(gardenLightingStyle.dayCycle ?? []), GARDEN_KEYFRAME]
      .sort((a, b) => a.hour - b.hour),
    sunPath: {
      ...(gardenLightingStyle.sunPath ?? {}),
      azimuthOffset: GARDEN_SUN_AZIMUTH_OFFSET,
      heightScale: GARDEN_SUN_HEIGHT_SCALE,
    },
    toonResponse: {
      ...(gardenLightingStyle.toonResponse ?? {}),
      // ~272°. The shipped [0.42, 0.5, 0.85] is ~250° and reads blue rather
      // than violet against this much green.
      shadowTint: [0.7, 0.56, 0.92],
    },
  });
  runtime.setTimeOfDay(TIME_OF_DAY);

  // --- The environment probe (FILL-016c / D19-263) -------------------------
  //
  // MEASURED AND FAILED FIRST: the shade key above does NOT reach the imported
  // assets either. Captured with it at 1.75 and at 0, the lane's frontages are
  // byte-identical black. So the surface-lighting family does not read an
  // arbitrary scene DirectionalLight — it reads the STYLE RUNTIME's own
  // `Lighting System Sun` and nothing else. That closes off every direct-light
  // lever a scene has.
  //
  // What is left is the one the material family itself names. Its own userData
  // reports `environmentReflections.activeContribution: "black"` — the rig ships
  // NO image-based lighting at all, so `indirectDiffuse = bakedGI * diffuse`
  // evaluates against nothing. Giving the scene an environment is therefore not
  // a workaround; it is supplying the input the material is asking for and the
  // style bundle never provides.
  //
  // The probe is authored from the scene's OWN lighting keyframe rather than
  // captured or invented: zenith takes `skyTopTint` over `skyProbeColor`, the
  // horizon takes the sky horizon, and the lower hemisphere takes
  // `skyGroundTint` — which in this world is physically the warm bounce off a
  // sunlit raked-gravel floor. So a north wall is filled by the same sky and the
  // same bounce that the garden's shade is authored against, and the two spaces
  // cannot drift apart.
  //
  // 32 x 16 is deliberate. This is a diffuse fill, not a reflection: PMREM
  // convolves it to a handful of spherical harmonics anyway, and any more
  // resolution is bytes spent on detail no surface can show.
  const probe = (() => {
    const width = 32;
    const height = 16;
    const data = new Float32Array(width * height * 4);
    const top = new THREE.Color(...GARDEN_KEYFRAME.skyTopTint)
      .multiply(new THREE.Color(...GARDEN_KEYFRAME.skyProbeColor));
    const horizon = new THREE.Color(...GARDEN_KEYFRAME.sky.horizon);
    const ground = new THREE.Color(...GARDEN_KEYFRAME.skyGroundTint).multiplyScalar(0.42);
    const colour = new THREE.Color();
    for (let y = 0; y < height; y += 1) {
      // 0 at the zenith, 1 at the nadir.
      const t = (y + 0.5) / height;
      if (t < 0.5) colour.copy(top).lerp(horizon, t / 0.5);
      else colour.copy(horizon).lerp(ground, (t - 0.5) / 0.5);
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4;
        data[index] = colour.r;
        data[index + 1] = colour.g;
        data[index + 2] = colour.b;
        data[index + 3] = 1;
      }
    }
    const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.colorSpace = THREE.NoColorSpace;
    texture.needsUpdate = true;
    try {
      const pmrem = new THREE.PMREMGenerator(renderer);
      const target = pmrem.fromEquirectangular(texture);
      pmrem.dispose();
      texture.dispose();
      return target.texture;
    } catch (error) {
      // A raw equirect still lights diffuse IBL; it is only reflections that
      // need the convolution, and nothing in this garden is a mirror except the
      // water, which does its own. Reported rather than swallowed.
      console.warn('[garden] PMREM unavailable, using the raw probe:', error?.message ?? error);
      return texture;
    }
  })();
  scene.environment = probe;
  // Kept for the families that DO read it (rock, water and the tree/foliage
  // MeshPhysicalNodeMaterials), but see FILL-018 below: it is provably inert
  // for the imported-asset family, so it is not the lane's fill.
  scene.environmentIntensity = 0.62;

  // --- FILL-018 / D19-263 / D19-264 —
  //     THE INDIRECT TERM THE IMPORTED-ASSET FAMILY ACTUALLY READS
  //
  // Everything above this block that was reached for as "ambient" is inert on
  // an imported asset, and the reason is one line of three.js plus one shipped
  // zero. Read back off the running lane, not inferred:
  //
  //   * All 215 lane materials (and every converted prop) are a BASE
  //     `NodeMaterial` — `ctor === 'NodeMaterial'`, `isMeshStandardNodeMaterial`
  //     false — carrying `lights === false` and `lightsNode === null`.
  //     NodeMaterial.setupLighting (three 0.185.1:1088) reads
  //         const lights    = this.lights === true || this.lightsNode !== null;
  //         const lightsNode = lights ? (this.lightsNode || builder.lightsNode) : null;
  //         if (lightsNode && ...) { this.setupLightingModel(builder) ... }
  //     so with both falsy NO LIGHTING CONTEXT IS BUILT and
  //     `setupLightingModel` is never called. `installToonLabSurfaceLighting`
  //     still writes `userData.toonLabSurfaceLighting`, which is what the
  //     enrolment assertions count — so 215 materials report as enrolled while
  //     the ToonLab surface-lighting model, `shadowFill` and `indirectTint`
  //     included, never enters their shader at all. CONFIRMED at the shader
  //     level: the compiled WGSL for `boundary-wall-0` contains none of the
  //     model's signature constants (0.0078125, 1.00001, 0.96, 1/PI).
  //
  //   * Because no lighting context exists, `builder.context.irradiance` is
  //     never assembled for them, so a HemisphereLight, an AmbientLight and the
  //     style's own SH sky light are all inert — measured at 40x, 6 and 8
  //     respectively against a live control (killing `Lighting System Sun`
  //     takes the sunlit wall 149 -> 15, so the mutation path itself works).
  //
  //   * `scene.environment` is inert for a second, independent reason:
  //     three's EnvironmentNode adds only to `context.iblIrradiance`
  //     (EnvironmentNode.js:86) and ToonLabSurfaceLightingModel reads only
  //     `context.irradiance`, with `indirectSpecular()` an empty method. Even
  //     with the model live, IBL would land in a channel nothing consumes.
  //
  // These materials light themselves inside their own node graph
  // (src/shaders-tsl/environment.js:620-683):
  //
  //   litColor = albedo * (ambient + directLight + pointLight + spotLight)
  //   ambient  = mix(1, ambientLightColor, ambientLightInfluence)
  //              [blended toward environmentProbeIrradiance(N) by ambientProbeBlend]
  //            * ambientStrength * enableAmbientLight
  //            * mix(1, coolSkyTint(N.y), skyTintStrength)
  //            * aoMul
  //
  // AND THE SHIPPED VALUE IS `ambientStrength: 0`, with `ambientProbeBlend: 0`.
  // So `ambient` is exactly zero and `litColor = albedo * directLight`. A
  // north-facing façade has no direct term, so it renders [0,0,0] — not dark,
  // not crushed by the grade, arithmetically zero — while the south-facing wall
  // of the same material three metres away renders [201,198,183] on
  // `directLightStrength 1.35` against an 8.9 sun. That is the whole "black
  // silhouettes against blown white with no mid-tones" defect, and no exposure
  // or grade lever can recover a value that was multiplied by zero.
  //
  // RECORDED, not edited in the preset: an environment preset that ships
  // `ambientStrength: 0` gives every consumer a scene in which any surface
  // turned away from the sun is a hole. It is the same authoring decision as
  // `Lighting System Ambient` at intensity 0 / `visible: false`, and it is
  // defensible only for a rig that supplies IBL — which this one explicitly
  // does not (`environmentReflections.activeContribution: "black"`).
  //
  // THE FILL IS DIRECTIONAL, WHICH IS THE POINT. `environmentProbeIrradiance`
  // is a six-axis ambient cube — `select(N.x >= 0, probe[0], probe[1])` and so
  // on, weighted by N*N (environment-lighting.js:213-220) — so authoring it is
  // authoring BOUNCE, not a flat lift. A flat lift raises a soffit exactly as
  // much as a roof and dissolves form, which is why the style disabled flat
  // ambient in the first place and why `ambientProbeBlend` is driven to 1 here:
  // at 1 the ambient takes the cube's direction instead of white.
  //
  // Authored from the scene's own keyframe and its own resolved sun azimuth, so
  // the fill cannot drift from the light it is supposed to be bounced off:
  //   +Y  open sky            skyTopTint * skyProbeColor
  //   -Y  soffit              skyGroundTint, dimmed — a soffit sees only floor
  //   horizontal  by how far the axis faces AWAY from the sun. A façade facing
  //               away is looking straight at the sunlit surfaces opposite, so
  //               it takes the warmest and strongest bounce; a sun-facing axis
  //               sees more cool sky and already owns a direct term.
  // MEASURED, on `lane`, against detail occupancy and the shade-to-light ratio
  // rather than by eye:
  //
  //   strength  nFacade  sunlitWall  ratio  frameLuma  detailOcc  shadowHue
  //   0.00      0        146         0.00   0.526      39.2       128 deg (2.3%)
  //   0.20      -        -           -      0.586      55.6         5 deg (10.6%)
  //   0.25      107      168         0.64   0.597      55.0       358 deg (8.4%)
  //   0.30      -        -           -      0.608      54.4       322 deg (6.3%)
  //   0.50      158      183         0.86   0.642      50.8       250 deg (4.0%)
  //   0.80      189      196         0.96   0.681      46.6       241 deg (3.0%)
  //
  // THOSE NUMBERS ARE FROM A TRANSIENT FRAME and are kept only to show the
  // shape of the curve. They were taken at 260 frames, which is 19% of the way
  // to the temporal history's convergence — see the settle table in
  // scripts/capture-launch-garden.mjs. RE-MEASURED at settled state:
  //
  //   strength  frameLuma  lowerThird  satMean  detailOcc  shadowHue
  //   0.25       0.442      0.234       0.201     68.9     281 deg (21.0%)
  //   0.45       0.514      0.343       0.177     63.5     255 deg (15.7%)
  //   0.70       0.575      0.434       0.160     55.5     249 deg (13.2%)
  //
  // Settled, the trade runs the other way from the transient reading: detail
  // and colour are HIGHEST at low fill and fall as it rises, because the fill
  // is competing with an ambient-occlusion term that has fully accumulated by
  // then. 0.25 is too dark to read the carriageway at all (lowerThird 0.234);
  // 0.70 is back to washing the frontages out. 0.45 keeps the whole value range
  // occupied — warm ochre boundary wall, cool paving, material in the shade,
  // nothing blown and nothing at zero — with shade at 255 deg, inside the
  // 214-267 deg the benchmark measures for a city street.
  const ENV_INDIRECT_STRENGTH = Number.isFinite(envIndirect) ? envIndirect : 0.45;
  const ENV_INDIRECT_PROBE_BLEND = Number.isFinite(envProbeBlend) ? envProbeBlend : 1;
  const environmentIndirect = (() => {
    const sunAzimuth = new THREE.Vector3(0, 0, 1);
    if (sun) {
      sun.getWorldPosition(sunAzimuth);
      sunAzimuth.y = 0;
      if (sunAzimuth.lengthSq() < 1e-6) sunAzimuth.set(0, 0, 1);
      sunAzimuth.normalize();
    }
    const skyColour = new THREE.Color(...GARDEN_KEYFRAME.skyTopTint)
      .multiply(new THREE.Color(...GARDEN_KEYFRAME.skyProbeColor));
    const groundBounce = new THREE.Color(...GARDEN_KEYFRAME.skyGroundTint);
    const horizon = new THREE.Color(...GARDEN_KEYFRAME.sky.horizon);
    // CHROMA. §2 asks for shade that is "warm, luminous and coloured — never
    // neutral grey", and the lane's own albedos are plaster, granite and
    // asphalt: post `saturation` multiplies chroma that is already there and
    // cannot invent any on a grey wall. The probe can, because it IS the light
    // the shade is made of — so the bounce is pushed away from neutral about
    // its own luma rather than the frame being pushed after the fact. Measured
    // on `lane` (satMean, target 0.252 from ref 03-alley-underpass).
    //
    //   chroma  satMean  warmAccent%  shadowHue          detailOcc
    //   1.0     0.130    0.27         358 deg (8.4%)     55.0
    //   2.2     0.142    0.72         347 deg (8.8%)     55.1
    //   3.4     0.153    1.97         336 deg (8.9%)     55.0
    //
    // Detail occupancy is flat across the range, so this buys colour without
    // costing form — unlike raising the fill itself, which trades one for the
    // other. 3.4 lands the shade hue at 336 deg, inside the 327-330 deg
    // violet-magenta the benchmark measures for warm-daylight shade, and clip
    // stays at 0.000%. It does not close the gap to the 0.252 satMean target
    // on its own: the lane's albedos are plaster, granite and asphalt, and a
    // grey street cannot be graded into a green garden. RECORDED as the
    // remaining gap; the honest fix is chroma in the lane's own surface
    // recipes, not more grade.
    const chroma = Number.isFinite(envProbeChroma) ? envProbeChroma : 3.4;
    const saturate = (colour, amount = chroma) => {
      const luma = 0.2126 * colour.r + 0.7152 * colour.g + 0.0722 * colour.b;
      return colour.setRGB(
        luma + (colour.r - luma) * amount,
        luma + (colour.g - luma) * amount,
        luma + (colour.b - luma) * amount,
      );
    };
    // THE SKY AXIS TAKES NONE OF IT, and that is measured rather than taste.
    // At full chroma the +Y slot reaches [0.687, 0.735, 1.93], and every
    // up-facing surface in the street — the whole carriageway, the kerbs, both
    // footways — takes that head on through the N*N weighting. The road
    // rendered violet. A road under a blue sky and a warm sun is not violet.
    // Damping it to a third still left the shaded footway reading cold blue,
    // which is the one thing §2 rules out ("warm, luminous and coloured —
    // never neutral grey", and the benchmark measures shade at 327-330 deg,
    // never blue). So the sky slot keeps the keyframe's authored colour
    // exactly, and all the chroma goes on the BOUNCE — which is where a
    // scene's local colour physically comes from anyway, and which only
    // reaches the vertical surfaces that need it.
    const skyChroma = 1;
    const horizontal = (x, z) => {
      // 0 where the axis points at the sun, 1 where it points away from it.
      const away = 0.5 - 0.5 * (x * sunAzimuth.x + z * sunAzimuth.z);
      return saturate(horizon.clone()
        .lerp(groundBounce, 0.34 + 0.46 * away)
        .multiplyScalar(0.70 + 0.42 * away));
    };
    // Order is +X, -X, +Y, -Y, +Z, -Z (environmentAmbientProbe.js PROBE_DIRECTIONS).
    const colours = [
      horizontal(1, 0),
      horizontal(-1, 0),
      saturate(skyColour, skyChroma),
      saturate(groundBounce.clone().multiplyScalar(0.34)),
      horizontal(0, 1),
      horizontal(0, -1),
    ];
    setEnvironmentAmbientProbeColors(colours);

    let materials = 0;
    const seen = new Set();
    scene.traverse((object) => {
      if (!object.isMesh) return;
      for (const material of (Array.isArray(object.material) ? object.material : [object.material])) {
        const uniforms = material?.uniforms;
        if (!uniforms?.ambientStrength || seen.has(material.uuid)) continue;
        seen.add(material.uuid);
        uniforms.ambientStrength.value = ENV_INDIRECT_STRENGTH;
        uniforms.ambientProbeBlend.value = ENV_INDIRECT_PROBE_BLEND;
        if (uniforms.enableAmbientLight) uniforms.enableAmbientLight.value = 1;
        if (uniforms.enableAmbientProbe) uniforms.enableAmbientProbe.value = 1;
        materials += 1;
      }
    });
    return {
      materials,
      strength: ENV_INDIRECT_STRENGTH,
      probeBlend: ENV_INDIRECT_PROBE_BLEND,
      probe: colours.map((c) => [+c.r.toFixed(3), +c.g.toFixed(3), +c.b.toFixed(3)]),
      sunAzimuth: [+sunAzimuth.x.toFixed(3), +sunAzimuth.z.toFixed(3)],
    };
  })();
  // 0 means the environment-material family is not in this scene at all, which
  // would mean the lane is being rendered by something else entirely — assert
  // rather than discover it in a frame.
  if (environmentIndirect.materials === 0 && lane) {
    throw new Error(
      'FILL-018: no environment-shader material accepted an indirect term — '
      + 'the lane cannot be lit and the frame would misreport (D19-263).',
    );
  }

  // D19-130 — the single largest look defect in pass 1, and it is invisible
  // from the call site.
  //
  // Vegetation materials do not read scene lights. Every BranchTree and
  // StylizedBush in this garden was lighting itself from the module default sun
  // `(0.35, 0.72, 0.42)` — a high north-west key — while the ground, stone and
  // water beside them were lit by the authored south-east sun at 128°/42°. The
  // canopies therefore had no shared shading direction with anything they stand
  // in, which reads exactly as the flat plastic lollipop the pass-1 frames show.
  //
  // Taken off the DirectionalLight itself rather than off `lighting.frame`,
  // because the frame carries no scene-space sun direction (D19-065) and the
  // light is what actually renders.
  if (sun) {
    const sunPosition = sun.getWorldPosition(new THREE.Vector3()).normalize();
    trees.setSun({
      color: GARDEN_KEYFRAME.sunColor,
      direction: [sunPosition.x, sunPosition.y, sunPosition.z],
      intensity: 1,
      // The probe the rest of the garden's shade is lit by, so a canopy's
      // shadow side and the moss under it belong to the same sky.
      sky: GARDEN_KEYFRAME.skyProbeColor,
      skyIntensity: GARDEN_KEYFRAME.skyProbeEnergy,
    });
  }

  // D19-043: the lighting system rewrites `renderer.toneMappingExposure` every
  // frame from its own day curve, so `rendererConfiguration.toneMappingExposure`
  // is accepted and then overwritten. Re-applied after `runtime.update` in the
  // frame loop below — the documented workaround, not a preference.
  const EXPOSURE = exposure;

  // Ground scene state: waterLevel drives the Ground Shader's own damp band at
  // the pond margin, which is what marries the moss to the waterline.
  const lightingFrame = runtime.lighting?.frame ?? null;
  setGroundShaderSceneState(ground, {
    waterLevel: WATER_LEVEL,
    ...(lightingFrame?.sunDirection ? { sunDirection: lightingFrame.sunDirection } : {}),
  });

  // --- 10. The cascade ------------------------------------------------------
  let plungeClock = 0;
  let plungeIndex = 0;
  const plungePoint = { x: 0, y: 0, z: 0 };

  function driveCascade(delta) {
    plungeClock += delta;
    while (plungeClock >= PLUNGE_INTERVAL) {
      plungeClock -= PLUNGE_INTERVAL;
      plungeIndex += 1;
      // Golden-ratio sequence: evenly distributed across the lip, never
      // repeating, and identical run to run — so a capture is reproducible.
      const phase = (plungeIndex * 0.618_033_988_75) % 1;
      const offset = (phase - 0.5) * 2 * PLUNGE_SPREAD;
      plungePoint.x = CASCADE.plunge.x - CASCADE.axis.z * offset;
      plungePoint.z = CASCADE.plunge.z + CASCADE.axis.x * offset;
      pondWater.splash(plungePoint, { radius: 0.34, strength: 0.55 });
      // A second, wider ring every fourth impulse gives the plunge a slower
      // beat under the fast one, which is what stops it reading as a buzz.
      if (plungeIndex % 4 === 0) {
        pondWater.addRipple(plungePoint, { radius: 0.9, strength: 0.5 });
      }
      // The upper basin drains over its lip, so it is disturbed too.
      upperPool.addRipple(
        { x: UPPER_POOL.x + CASCADE.axis.x * 1.5, y: 0, z: UPPER_POOL.z + CASCADE.axis.z * 1.5 },
        { radius: 0.4, strength: 0.32 },
      );
    }
  }

  // --- 11. Resolved-configuration audit -------------------------------------
  //
  // What the scene DECLARES it is running. Every entry is compared against the
  // value read back off the thing that renders — see configAudit.js. The
  // declaration lives here, beside the scene, so adding a system without
  // declaring it is a visible omission rather than a silent one.
  const configExpectation = {
    water: {
      pond: { preset: 'mirror', style: 'call_me_sensei', colorTone: 'anime' },
      upperPool: { preset: 'calm', style: 'call_me_sensei', colorTone: 'anime' },
    },
    groundUniforms: [
      ['skyFillStrength', 'uStyleLightingSkyFillStrength', groundFill],
      ['rimStrength', 'uStyleLightingRimStrength', 0.012],
      ['slopeAutoRockStrength', 'uStyleSlopeAutoRockStrength', 0.34],
      ['grassScale', 'uStyleProjectionGrassScale', groundLayers[0].worldTile],
      ['rockScale', 'uStyleProjectionRockScale', groundLayers[2].worldTile],
      ['distanceStart', 'uStyleDistanceStart', 26],
    ],
    grass: { adoptStrength: GRASS_GROUND_ADOPT },
    trees: { minReceiveShadowRatio: 0.9 },
    // D19-260. The values AND the cap. `maxOpticalDepth` is the measured line
    // past which every surface-lighting material in the scene renders black.
    cloud: {
      maxOpticalDepth: 100,
      values: [
        ['shape', 'density', 0.05],
        ['lighting', 'baseShadowStrength', 0.55],
        ['lighting', 'powderStrength', 2.1],
      ],
    },
    // D19-261. The feature flags first: a parameter under a disabled feature is
    // a value the scene prints and never renders.
    post: {
      features: ['bloom', 'colorGrade', 'depthCue', 'screenOutline'],
      parameters: [
        ['contrast', 1],
        ['outlineStrength', 0.75],
        ['depthCueStrength', 0.22],
      ],
    },
    declared: [
      {
        id: 'grass.lighting.skyFillStrength',
        value: skyFill,
        reason: 'INERT AND KNOWN TO BE. Under full ground adoption the grass shader '
          + 'replaces its own shaded colour with the adopted one '
          + '(shaders-tsl/grass.js:331-334), so this lever changes nothing — measured, '
          + 'two captures at 0.12 and 0.30 are byte-identical. D19-201 named it as the '
          + 'vegetation-side equivalent of shadowFill; that premise is void now that '
          + 'adoption is at 1. Left in place for the no-adoption path, not tuned.',
      },
      {
        id: 'sky.godRays.strength',
        value: 0.7,
        reason: '§6.5 asks for restrained god rays; the schema default is 2.',
      },
      {
        id: 'water.foamAmount',
        value: 0.16,
        reason: 'The `mirror` preset ships 0.7. A still pond has foam only at the '
          + 'plunge; a continuous white ring around the margin is the single most '
          + 'swimming-pool-like thing available.',
      },
      {
        id: 'runtime.apply.watch',
        value: false,
        reason: 'Under watch:true the style transaction re-applies its slot settings on '
          + 'every scene-graph change, silently reverting per-field authoring at an '
          + 'unpredictable moment (D19-032). Nothing is added after the bundle.',
      },
    ],
  };
  const configAudit = auditGardenConfiguration(
    {
      camera, ground, groundLayers, grassFields, post, runtime, sky, trees,
      upperPool, water: pondWater,
    },
    configExpectation,
  );
  if (configAudit.failures.some((check) => check.category === 'enum')) {
    // An enum that did not survive resolution is not a look problem and never
    // becomes one — it is the scene running a different system than it says.
    // Thrown at build so it cannot reach a frame (D19-234).
    throw new Error(
      `Stillwater Garden resolved-configuration audit failed:\n${
        formatGardenConfigurationAudit(configAudit)}`,
    );
  }

  const auditSubject = {
    camera, environmentIndirect, ground, groundLayers, grassFields, post,
    runtime, sky, trees, upperPool, water: pondWater,
  };

  return {
    camera,
    configAudit,
    configAuditText: formatGardenConfigurationAudit(configAudit),
    /**
     * Re-runs the audit once the frame loop has produced frames, so the checks
     * that are about runtime health (shadow renders, ground-field readiness)
     * are measured after they can possibly be true. Returns the same shape.
     */
    auditConfiguration({ surfaceAudit = null } = {}) {
      const result = auditGardenConfiguration({ ...auditSubject, surfaceAudit }, configExpectation);
      this.configAudit = result;
      this.configAuditText = formatGardenConfigurationAudit(result);
      return result;
    },
    detail,
    dressing,
    // FILL-018. Exposed so a capture can report the indirect term it was taken
    // under, and so the config gate can assert it is non-zero.
    environmentIndirect,
    fog,
    grassFields,
    lane,
    ground,
    groundLayers,
    post,
    runtime,
    scene,
    sky,
    stone,
    surface,
    trees,
    upperPool,
    water: pondWater,
    yua: { mark: YUA_MARK, path: PATH, plantableMask },

    // Instance census for the density gate (parity analysis §3).
    census: Object.freeze({
      shadowFillMaterials,
      dressing: dressing.census,
      dressingCount: Object.values(dressing.census).reduce((total, n) => total + n, 0),
      // D19-150 assertion. 0 means the prop set is outside the surface-lighting
      // model and the scene's shadow fill is silently skipping every prop.
      dressingSurfaceLighting: dressing.surfaceLightingMaterialCount,
      grassClumps: grassFields.reduce((total, { field }) => total + field.placements.length, 0),
      detail: detail.census,
      lane: lane?.census ?? null,
      laneSurfaceLighting: lane?.surfaceLightingMaterialCount ?? 0,
      stone: stone.count,
      stoneByClass: stone.census,
      trees: trees.instances.length,
    }),

    applyShot(shotId) {
      const shot = SHOTS[shotId] ?? SHOTS.hero;
      camera.fov = shot.fov;
      camera.position.set(...shot.position);
      camera.updateProjectionMatrix();
      return new THREE.Vector3(...shot.target);
    },

    update(delta) {
      driveCascade(delta);
      for (const { field } of grassFields) field.update(delta, camera);
      trees.update(delta);
      sky.update(delta);
      pondWater.update(renderer, scene, camera, delta);
      upperPool.update(renderer, scene, camera, delta);
      runtime.update(delta, camera);
      // D19-043 — after the lighting frame, never before.
      renderer.toneMappingExposure = EXPOSURE;
    },

    resize(width, height, pixelRatio) {
      sky.resize?.(width, height);
      post.setSize(width, height, pixelRatio);
    },
  };
}
