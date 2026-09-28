// Azure Headland — coastal scene assembly (launch video, §10.2).
//
// Every visible system here is a first-party ToonLab system:
//   terrain surface   createSceneSurfaceRuntime  (src/runtime/sceneSurfaceRuntime.js)
//   ground            createGroundShaderMesh     (src/ground-shader)
//   water             surface.createWaterSurface -> WaterSurface (src/water)
//   grass             surface.createGrassField   -> createCallMeSenseiGrassField
//   sky + cloud       createSkySystem            (src/sky)
//   lighting/post     createSceneStyleRuntime + CALL_ME_SENSEI_STYLE_BUNDLE
//
// Assembly order follows launch-plan/contracts/launch-world-runtime-contracts.md §10:
// surface -> ground -> water (registers its footprint) -> objects -> grass -> sky/style.
//
// NOT in this pass, by instruction — integration points are marked INTEGRATION:
//   Yua (hero character), TREE-COAST-01/TREE-CITY-01, ROCK-COAST-01/02/03,
//   ARCH-COAST-01/02. No blockout stands in for them (§2).

import * as THREE from 'three/webgpu';

import {
  CALL_ME_SENSEI_STYLE_BUNDLE,
  createSceneStyleRuntime,
  createSceneSurfaceRuntime,
  createSkySystem,
} from '@call-me-sensei/toonlab';
import {
  createGroundShaderMesh,
  createGroundShaderSettings,
  setGroundShaderSceneState,
} from '@call-me-sensei/toonlab/ground-shader';
import { resolveLightingStylePreset } from '@call-me-sensei/toonlab/lighting';
import { createPostProcessingPipeline } from '@call-me-sensei/toonlab/post';
import { PRESETS as SKY_PRESETS } from '@call-me-sensei/toonlab/sky';
import { clearEnvironmentCloudShadowPass } from '../../../src/sky/cloudShadow.js';

import grassyLandTextureUrl from '../../shared/textures/grassy-land-texture.jpg';
import landTextureUrl from '../../shared/textures/land-texture.jpg';
import rockTextureUrl from '../../shared/textures/rock-texture.jpg';
import sandTextureUrl from '../../shared/textures/sand-texture.jpg';

import { createCoastCliffs, createCoastTrees } from './props.js';
import {
  BOUNDS,
  WATER_LEVEL,
  YUA_FACING,
  YUA_MARK,
  buildGroundField,
  buildTerrainGeometry,
  duneGrassMask,
  grassMask,
  headlandHeight,
  plantableMask,
  shoreZ,
} from './terrain.js';

// ---------------------------------------------------------------------------
// Authored constants — every one traceable to the plan or the contracts file
// ---------------------------------------------------------------------------

// DECISION (contracts §11 item 2). PASS 2 REVERSES the pass-1 choice, and the
// reason is worth recording because it is the whole coastal shadow family.
//
// Option A was hour 8.5, which the shipped `call-me-sensei` sunPath resolves to
// exactly 42.0deg. It hits §6.5's number and misses §6.5's sentence — "late-
// morning sun". Hour 8.5 sits 36% of the way from the style's hour-6 keyframe
// to its hour-13 one, so the whole rig interpolates into DAWN: sun colour
// [1, 0.71, 0.56], sky probe [0.49, 0.54, 0.69] at 0.82 energy. A dim cold
// probe with no ambient term is exactly the mechanism that renders sand cold
// and cliff shadow faces navy — the defect both the art-direction and rocks
// workstreams reported independently.
//
// Option B is taken instead: keep the hour at 10 (genuinely late morning, and
// the palette that goes with it) and reshape the sun path's height term so
// that hour lands on 42.0deg. `heightScale = 0.4219` with the other shipped
// sunPath defaults gives atan((0.4 + 0.4219 x 0.866) / 0.85) = 42.0deg.
// Only the height term moves; azimuth, orbit radius and minElevation are the
// shipped values.
export const TIME_OF_DAY = 10;
const COASTAL_SUN_HEIGHT_SCALE = 0.4219;

// Aerial perspective (§6.5 "subtle aerial perspective"; parity analysis §5.4:
// "discrete banding, not a fog ramp"). One colour drives all three recession
// systems so the bands agree across water, terrain and foliage:
//   scene.fog             -> trees, and ToonLab Water mirrors it into uSceneFog
//   water.setDistanceFog  -> the exponential term that flattens the far swell
//   ground settings.distance -> the terrain's own atmospheric tint
// Pass 1 had none of these, so the bay held full saturation to the horizon and
// got DARKER with distance while the benchmark plate gets paler.
const HORIZON = Object.freeze({
  // A pale, slightly warm haze — the coastal shadow family is violet-magenta
  // (parity analysis measures 327-330deg on both beach plates), not the city's
  // blue, and the haze has to belong to the same family or the far band reads
  // as a blue card behind a warm beach.
  color: 0xc7d4dc,
  // Land is only ~90 m deep, so the near plane sits past the whole headland;
  // the far plane is where the water is expected to have reached sky value.
  fogFar: 1400,
  fogNear: 260,
  // Exponential term on the water only. At 240 m this is ~46% hazed, at 500 m
  // ~78%: a visible value STEP between the mid and far bands rather than a
  // ramp, which is what §5.4 asks for.
  waterFogDensity: 0.0013,
});

// The Ground Shader's `distance.color` is a linear-space triplet, not an sRGB
// hex — passing the sRGB values straight through washes the far terrain lighter
// than the fog it is supposed to match.
// Sun azimuth. The shipped `call-me-sensei` sun path has `azimuthOffset: 0`,
// which puts the sun in the NORTH-WEST at this hour, i.e.
// directly behind the bay and shining into the hero lens. Every land surface
// the camera could see was its own shadow side, and with no ambient term in the
// Call Me Sensei rig (only the sun plus a cool SH probe) the cliffs rendered as
// navy blocks and the headland lost all value structure.
//
// This rotates the path so hour 10 lands the sun in the WEST-SOUTH-WEST, over
// the hero camera's shoulder. Only the azimuth moves — `elevation` is derived from
// `timeOfDay` through the untouched height terms, so the §6.5 42.0deg holds.
// Recorded as D19-064.
// Measured: the shipped path resolves az = azimuthOffset + (hour/24 - 0.5) x
// azimuthArc, so hour 10 at offset 0 gives -24deg. -1.414 rad puts it at 255deg
// — west-south-west, behind the hero eye.
const COASTAL_SUN_AZIMUTH_OFFSET = -1.414;

const HORIZON_LINEAR = new THREE.Color(HORIZON.color)
  .convertSRGBToLinear()
  .toArray();

// Water tile. It has to run past the frustum in every hero shot, so it is far
// wider than the 240 x 180 m world; the animated tile is biased offshore and
// the interactive ripple window follows the camera target.
const WATER = Object.freeze({
  depth: 340,
  maxSegments: 384,
  positionZ: -110,
  segmentsPerMeter: 1.5,
  width: 400,
});

export const SHOTS = Object.freeze({
  // §10.2 hero framing: Yua's mark (4, 2.2, 18) on the overlook facing WNW.
  // The camera sits behind and to her right so she reads as foreground-left
  // against the bay, with the breaker line and the headland bluff beyond.
  // PASS 2 reframe. Pass 1 looked straight out to sea from the ridge, which put
  // every land instance behind the camera and left 60% of the frame as open
  // water — the composition that made the scene read empty regardless of how
  // much was in it. The eye now stands on the western bay and looks EAST ALONG
  // THE COAST, which is the benchmark plate's own construction
  // (09-beach-crowd-wide): water down one side, the receding shoreline curve as
  // the depth spine, the populated land mass down the other, a destination mass
  // at the vanishing end (here the eastern bluff, its cliff cluster and the
  // sheltered grove), and a foreground occluder closing the near edge.
  //
  // The sun sits WSW (see COASTAL_SUN_AZIMUTH_OFFSET), over the camera's
  // shoulder, so the headland, the cliffs and the surf are all front-lit
  // instead of silhouetted, and shadows rake away down the beach.
  hero: Object.freeze({
    fov: 40,
    position: [-58, 6.4, 16],
    target: [46, 5.2, -8],
  }),
  // Straight down the promenade — the depth-band read.
  promenade: Object.freeze({
    fov: 34,
    position: [46, 6.6, 30],
    target: [-46, 1.2, 8],
  }),
  // Standing on the wet sand, into the surf.
  swash: Object.freeze({
    fov: 40,
    position: [-8, 2.1, -4],
    target: [-16, 0.1, -34],
  }),
  // The whole headland, for composition review.
  wide: Object.freeze({
    fov: 44,
    position: [78, 34, 92],
    target: [-6, 0, -14],
  }),
  // The eastern bluff, where ROCK-COAST-01/02 land.
  bluff: Object.freeze({
    fov: 40,
    position: [24, 8.5, 6],
    target: [58, 3.5, -26],
  }),
});

// Awaited, never fire-and-forget: ToonLab Water's grab pass re-renders the
// whole scene, and the WebGPU backend throws on any material still holding a
// texture whose image has not decoded (see docs/capability-status.md
// D19-026). Decoding before the ground mesh exists removes the race.
async function loadLayerTexture(url) {
  const texture = await new THREE.TextureLoader().loadAsync(url);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  // The Ground Shader projects in world space and disables the texture matrix
  // (groundShaderMaterial.js sampleProjectedLayer), so repeat/offset here are
  // deliberately left at identity — scale lives in settings.projection.
  return texture;
}

// ---------------------------------------------------------------------------

/**
 * Builds the Azure Headland coastal scene.
 *
 * @param {object} options
 * @param {THREE.WebGPURenderer} options.renderer
 * @param {THREE.PerspectiveCamera} options.camera
 * @param {(stage: string) => void} [options.onProgress]
 * @param {number} [options.grassCount] per-field placement cap (§6.2 max 18000)
 * @param {'balanced'|'performance'} [options.quality]
 * @param {boolean} [options.shadows] engage the sun's cast shadows (D19-041)
 */
export async function createAzureHeadland({
  camera,
  grassCount = 18_000,
  grassWashOpacity = null,
  onProgress = () => {},
  cloudShadow = true,
  quality = 'balanced',
  renderer,
  shadows = false,
}) {
  const scene = new THREE.Scene();
  scene.background = null;
  // Authored once, consumed by the trees, by ToonLab Water (which mirrors
  // scene.fog into uSceneFog*), and echoed into the Ground Shader's own
  // `distance` group below. See HORIZON.
  const fog = new THREE.Fog(HORIZON.color, HORIZON.fogNear, HORIZON.fogFar);
  scene.fog = fog;

  // --- 1. Terrain surface ---------------------------------------------------
  onProgress('Authoring the headland');
  const surface = createSceneSurfaceRuntime({
    bounds: BOUNDS,
    heightAt: headlandHeight,
    waterLevel: WATER_LEVEL,
  });

  // --- 2. Ground shader -----------------------------------------------------
  onProgress('Painting the ground');
  const layerTextures = await Promise.all([
    loadLayerTexture(grassyLandTextureUrl), // R grass -> lawn
    loadLayerTexture(landTextureUrl), //       G dirt  -> promenade
    loadLayerTexture(rockTextureUrl), //       B rock  -> cliff
    loadLayerTexture(sandTextureUrl), //       A sand  -> beach
  ]);
  const ground = createGroundShaderMesh({
    field: buildGroundField({ depth: 384, width: 512 }),
    geometry: buildTerrainGeometry({ segmentsX: 320, segmentsZ: 240 }),
    layers: layerTextures.map((texture) => ({ texture })),
    name: 'Azure Headland · Ground',
    settings: createGroundShaderSettings({
      preset: 'call_me_sensei',
      // The preset's distance defaults are start 500 m / end 15 km — mountain
      // scale. In a 240 m world that is "off", so the headland held full
      // contrast to the bluff line while the water behind it hazed, and the
      // two read as separate paintings. Rescaled to the world, and pointed at
      // the same horizon colour as the fog so the bands agree.
      distance: {
        color: HORIZON_LINEAR,
        detailFade: 1,
        end: 620,
        start: 95,
        strength: 0.58,
      },
    }),
    styleTarget: { targetId: 'coast/ground' },
  });
  scene.add(ground);

  // --- 3. Water -------------------------------------------------------------
  // Registered BEFORE the grass so the scatter excludes the footprint.
  // `surface.createWaterSurface` wires bedHeight: sampleHeight for us — which
  // is what gates shoaling, the breaker system and the shore-state field
  // (swash / run-up / wet-sand memory). §6.4 forbids a flat plane, and the
  // architecture enforces it: without a real bed those systems do not run.
  onProgress('Filling the bay');
  const water = surface.createWaterSurface({
    breakerAmount: 0.55,
    // How far the lip wraps. The coast preset leaves the 0.8 default, which
    // barrels; a shore-break on a 1:30 dissipative terrace spills down the
    // face instead, and spilling breakers are what the benchmark plate shows.
    breakerCurl: 0.42,
    breakerEnabled: true,
    // Peel rate along the crest. Above 1 the barrel travels down the line, so
    // the break is a moving event rather than the whole 240 m collapsing on
    // the same frame — the single biggest cue that the surf is not a loop.
    breakerPeel: 1.35,
    breakerScale: 1.08,
    // Shallow-water clarity. Widened from the caustic default so the caustic
    // depth window covers the whole inner terrace rather than a 6 m strip.
    causticsScale: 0.62,
    causticsSpeed: 0.5,
    // §10.2 wants visible caustics. The `anime` tone's own 0.3 is tuned for a
    // swimmer's-eye lake; on a sunlit 1.5 m terrace under a 42deg sun it
    // disappears. Explicit override — only possible since D19-005 was fixed.
    causticsStrength: 0.66,
    colorTone: 'anime',
    // The three-band depth gradient §10.2 asks for, sized to the bed authored
    // in terrain.js: turquoise holds to ~62 m offshore, the mid band runs to
    // ~290 m, and true deep only appears past the shelf edge where the haze is
    // already carrying it. The `anime` tone's 1.8 / 4.2 are lake distances and
    // put every one of those transitions inside the first 40 m.
    deepFadeDistance: 7.2,
    depth: WATER.depth,
    depthFadeDistance: 2.6,
    // Larger, slower ripple cells. At the pass-1 default of 1.15 the fbm
    // period fell below a texel by mid-frame and the surface read as a fixed
    // screen-space weave (§13: "repeated pattern"). Widening the cell plus the
    // new horizon fade in the shader (D19-061) removes it at the source.
    detailNormalStrength: 0.38, // §6.4 — live now that D19-005 is fixed
    detailScale: 0.62,
    foamAmount: 1.05,
    // The simulation's 26 m interactive window must sit where the camera is
    // looking, not at the tile origin 110 m offshore.
    follow: (out) => out.set(camera.position.x, 0, camera.position.z - 12),
    maxSegments: WATER.maxSegments,
    nearshorePhase: { incidentAxis: 'z', referenceX: 0, referenceZ: 0 },
    position: { x: 0, z: WATER.positionZ },
    preset: 'coast',
    quality: 'high',
    // Broken, structured foam. Pass 1 read as a hard white blob with a hard
    // edge: at the coast preset's 0.6 the foam noise cell is wider than the
    // swash band itself, so the band saturates to solid paint instead of
    // breaking into fingers. A finer cell plus tighter line spacing gives the
    // directional streak structure the benchmark plate shows.
    foamLineSpacing: 0.34,
    foamNoiseScale: 1.45,
    // Fresh-water clarity through the shallow band, so the sand reads THROUGH
    // the turquoise rather than under an opaque sheet (§10.2 "luminous").
    opacity: 0.83,
    refractionStrength: 0.52,
    reflectionStrength: 0.46, // §6.4 — live now that D19-005 is fixed
    rippleFoamStrength: 1.15,
    // Horizontal run-up in metres. Left at the preset's automatic 0 the swash
    // reach is energy-derived and lands around 3 m, which on a 1:24 berm is
    // barely a wet line. 9 m of reach is what puts a real wet-sand band on the
    // beach and gives the memory something to trail behind.
    runupDistance: 9,
    sceneQuality: quality,
    // Wet-sand memory (§6.4). The residue outliving the aerated film by 3x is
    // the "memory trailing the run-up" — the darker, matte band that stays
    // behind after the foam itself has drained.
    shorelineRunup: 0.88,
    swashFoamLifetime: 5.5,
    swashFoamResidueLifetime: 17,
    segmentsPerMeter: WATER.segmentsPerMeter,
    // World-anchored wetness/foam memory across the whole shoreline band.
    // The authored waterline runs z = +8 (west bay) to z = -26 (east point),
    // so the band is centred at -9 and 62 m deep.
    shoreState: {
      region: { centerX: 0, centerZ: -9, depth: 62, width: 260 },
      resolution: { x: 1024, y: 256 },
    },
    style: 'call_me_sensei',
    styleTarget: { targetId: 'coast/water' },
    // Pulled back from the preset's 1.35: paired with the finer noise cell
    // above, 1.35 still saturated. The swash now reads as broken directional
    // fingers rather than a poured edge.
    swashFoamAmount: 0.92,
    waveAmplitude: 0.42,
    waveDirection: [0.15, -1.0],
    // Not in §6.4, and required. The `coast` preset ships spread 0.5, which
    // resolveWaterSettings turns into a 76deg fan (waterSettings.js:770); two
    // coherent trains at that angle read as a regular diamond lattice across
    // the whole bay — an automatic §13 rejection ("repeated pattern obvious in
    // the hero frame"). Real nearshore swell refracts nearly parallel, so the
    // fan narrows to a modest band and the crests run as long shore-parallel
    // lines. PASS 2 raises it from 0.14, which was too coherent in the other
    // direction and marched the whole bay as one corduroy sheet.
    waveDirectionSpread: 0.24,
    waveIntensity: 0.5,
    waveLength: 9.0,
    // Preset default 0.75 pinches crests into sawtooth at this tile density.
    waveSteepness: 0.55,
    // Offshore whitecaps. The coast preset's 0.22 speckles the entire far
    // field, and at 300 m one whitecap is sub-pixel, so it aliases into the
    // same regular weave the detail normals produced. Whitecaps belong on the
    // near swell only; the break line carries the far read.
    whitecapAmount: 0.075,
    wetSandDarkening: 0.66,
    wetSandDryTime: 150,
    // Less glaze. 0.78 turned the whole wet band into a mirror that competed
    // with the water highlights, which §10.2 explicitly forbids.
    wetSandSheen: 0.6,
    width: WATER.width,
  });
  scene.add(water);

  // --- 3b. Cliffs and trees --------------------------------------------------
  //
  // ROCK-COAST-01 (`rock-0119`), ROCK-COAST-02 (`rock-0111`), ROCK-COAST-03
  // (`rock-0281`) — the AMENDED §6.3 set (D-009). `rock-0169`/`rock-0449`/
  // `rock-0460` were REJECTED (252-262 tris, two shared `shape-290`) — see
  // `launch-plan/review/cliff-asset-validation.md`.
  //
  // Every rock routes through `resolveRockSurface()` in
  // labs/shared/azureHeadlandRocks.js (FILL-008). That completion layer is not
  // optional: every catalog cliff ships a 307-byte 4x4 placeholder in the
  // normal slot and `moss.enabled: false` (D19-010/D19-012), so a bare
  // `loadOfficialCatalogAsset` renders flat, mossless stone. `variation` keys
  // the per-asset surface and the captured evidence — never renumber it.
  onProgress('Setting the headland cliffs');
  const cliffs = await createCoastCliffs({ renderer, surface });
  scene.add(cliffs.group);

  // TREE-COAST-HQ-A V1-V3 on the windswept ridge, TREE-CITY-HQ-A/B in the
  // sheltered pocket. Added BEFORE the style bundle is applied so scene-label
  // discovery finds every canopy and trunk material in one pass.
  onProgress('Planting the ridge');
  const trees = await createCoastTrees({ fog, surface });
  scene.add(trees.group);

  // INTEGRATION: ARCH-COAST-01 (-20, 1.0, 8) and ARCH-COAST-02 (26, 0.8, -4).
  // Terrain already lands within 0.2 m of both authored heights.

  // --- 4. Grass -------------------------------------------------------------
  // §6.2 caps a FIELD at 18 000 placements, not the scene. Two fields with the
  // two shipped clump variants give the headland real density and silhouette
  // variety while each stays inside the cap.
  onProgress('Scattering the headland grass');
  // PASS 2. Pass 1 ran two fields that differed only in blade count, so the
  // headland read as one height, one colour and one clump scale across 180 m.
  // Three fields now carry three distinct roles, and their art direction is
  // applied per field after the bundle lands (see GRASS_ROLES below):
  //   lawn      the dense body of the headland
  //   meadow    taller, sparser, darker — clump-scale variety and silhouette
  //   dune      sparse marram tufts standing IN the sand, which is what
  //             actually dissolves the grass/sand seam §6.2 forbids
  const grassArea = { max: { x: 92, z: 78 }, min: { x: -92, z: -2 } };
  const GRASS_ROLES = Object.freeze([
    Object.freeze({
      bladesPerClump: 36,
      id: 'lawn',
      mask: grassMask,
      minSpacing: 0.34,
      seed: 4211,
      // The shipped preset pairs baseColor [0.17,0.32,0.05] with tipColor
      // [0.62,0.84,0.28]. At clump scale that gradient is the signature look;
      // at field scale the viewer sees mostly tips, and a 180 m headland reads
      // as a pale wheat field rather than §10.2's "saturated but natural
      // greens" (D19-027). Only the tip is pulled back.
      settings: Object.freeze({ bladeHeightRange: [0.36, 0.78], tipColor: [0.4, 0.63, 0.19] }),
      share: 1,
      variant: 'primary',
    }),
    Object.freeze({
      bladesPerClump: 24,
      id: 'meadow',
      mask: grassMask,
      minSpacing: 0.72,
      seed: 7331,
      settings: Object.freeze({
        backlitStrength: 0.52,
        baseColor: [0.13, 0.26, 0.06],
        bladeHeightRange: [0.62, 1.26],
        tipColor: [0.46, 0.66, 0.22],
      }),
      share: 0.42,
      variant: 'secondary',
    }),
    Object.freeze({
      bladesPerClump: 16,
      id: 'dune',
      mask: duneGrassMask,
      minSpacing: 0.95,
      seed: 5309,
      settings: Object.freeze({
        // Salt-bleached marram: paler, greyer, and taller than lawn grass, so
        // the tufts read as a different plant rather than as leftover lawn.
        backlitStrength: 0.58,
        baseColor: [0.22, 0.28, 0.12],
        bladeHeightRange: [0.55, 1.18],
        leanStrength: 0.42,
        tipColor: [0.63, 0.68, 0.36],
      }),
      share: 0.3,
      variant: 'secondary',
    }),
  ]);

  const grassFields = [];
  for (const role of GRASS_ROLES) {
    const field = await surface.createGrassField({
      bladesPerClump: role.bladesPerClump,
      count: Math.round(grassCount * role.share),
      groundAdoptStrength: 1,
      mask: role.mask,
      max: grassArea.max,
      min: grassArea.min,
      minSpacing: role.minSpacing,
      preset: 'call_me_sensei_clump',
      pushRadius: 1.2,
      // 'high' would THROW — scene quality profiles are balanced|performance.
      quality,
      seed: role.seed,
      styleTarget: { targetId: `coast/headland-grass-${role.id}` },
      variant: role.variant,
    });
    field.setWind({
      direction: [0.72, -0.69],
      gustFrequency: 0.18,
      gustSpeed: 0.9,
      speed: 1.0,
      strength: role.id === 'dune' ? 0.11 : 0.07,
    });
    scene.add(field);
    grassFields.push({ field, role });
  }

  // INTEGRATION: grass.setPushTarget(yua.carrier) once the hero lands.

  // --- 5. Sky ---------------------------------------------------------------
  onProgress('Building the sky');
  const sky = await createSkySystem({
    camera,
    godRays: true,
    quality: quality === 'performance' ? 'medium' : 'high',
    renderer,
    scene,
    timeOfDay: { autoAdvanceSecondsPerDay: 0, latitude: 38, time: TIME_OF_DAY / 24 },
  });

  // --- 6. Post + style runtime ---------------------------------------------
  onProgress('Lighting the scene');
  const post = createPostProcessingPipeline({
    camera,
    renderer,
    scene,
    settings: { preset: 'call_me_sensei' },
  });

  const runtime = createSceneStyleRuntime({
    collisionHeightAt: headlandHeight,
    fog,
    post,
    quality, // 'high' THROWS here
    renderer,
    // §6.5 asks for filmic tone mapping; that is a RENDERER setting, not a
    // post setting (D19-023).
    rendererConfiguration: {
      toneMapping: THREE.ACESFilmicToneMapping,
      toneMappingExposure: 1.06,
    },
    scene,
    sky,
    timeOfDay: TIME_OF_DAY,
    water,
  });

  await runtime.apply(CALL_ME_SENSEI_STYLE_BUNDLE, {
    discovery: 'scene-labels',
    mode: 'strict',
    watch: true,
  });

  // partlyCloudy is the SkySystem physical preset (not a "scenario"), and is
  // the bundle's own physical default. Going through the runtime keeps the
  // style snapshot and the coordinated lighting frame intact.
  await runtime.setSkyPreset(SKY_PRESETS.partlyCloudy, { timeOfDay: TIME_OF_DAY });

  // DIAGNOSTIC (?cloudshadow=0)
  if (cloudShadow === false) clearEnvironmentCloudShadowPass();

  // D19-041. The shipped Call Me Sensei sun contract sizes its shadow for a
  // CHARACTER scene: near cascade +-34 m / far 140 m
  // (`callMeSenseiLightingContract.js:54-63`). Azure Headland is 240 x 180 m
  // with a 400 m water tile, so with the shipped numbers essentially every
  // receiver in the frame sits outside the cascade and samples cleared depth —
  // which tests as occluded. The visible result is the whole world rendered at
  // a constant shadow multiply: cliffs as navy slabs, grass as dark olive, no
  // cast shadows anywhere. Re-authored for the launch world here rather than
  // editing the shipped contract, which is correct for what it was sized for.
  let sun = null;
  scene.traverse((object) => { if (object.isDirectionalLight && object.shadow) sun = object; });
  if (sun) {
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 420;
    sun.shadow.camera.left = -140;
    sun.shadow.camera.right = 140;
    sun.shadow.camera.top = 140;
    sun.shadow.camera.bottom = -140;
    sun.shadow.camera.updateProjectionMatrix();
    // The pass's documented hooks (`environmentSunShadowPass.js:429`, `:453`).
    sun.shadow.toonLabFarExtent = 320;
    sun.shadow.toonLabFarCameraFar = 700;
    sun.shadow.mapSize.set(4096, 4096);
    sun.shadow.normalBias = 0.08;
    sun.shadow.bias = -0.0008;
    sun.castShadow = shadows;
    if (!shadows) {
      // D19-041 + D19-062. `toonLabSurfaceLighting.direct()` gates its whole
      // sun term on `light.shadow.toonLabLightingContract`: when the marker is
      // present it multiplies the direct radiance by the environment sun-shadow
      // sample RAW, with no authored strength. The pass never renders in this
      // scene (`shadowPass.renderCount` stays 0), so every receiver inside the
      // cascade samples cleared depth, tests as occluded, and the sun term
      // becomes exactly zero — leaving only the blue SH probe. Every catalog
      // rock rendered as a flat saturated navy slab; proven by setting
      // `lighting.skyFillStrength: 0`, which turned them pure black rather than
      // merely unlit-looking.
      //
      // Clearing the marker makes `sharedSunVisibility` fall back to float(1),
      // which is the correct fail-OPEN behaviour for a pass that has produced
      // nothing. Remove this once D19-041 is fixed.
      delete sun.shadow.toonLabLightingContract;
    }
  }

  // §6.5 "directional layered clouds". The bundle's `cloud` slot resolves to
  // schema defaults (D19-006 / FILL-004), so the coastal look is authored
  // here explicitly: an onshore deck travelling with the swell, sheared so
  // tops lean downwind and the layers separate.
  sky.clouds.applyParams({
    shape: {
      altitude: 1180,
      baseScale: 9400,
      baseStrength: 1.05,
      coverage: 0.46,
      density: 0.052,
      thickness: 2450,
      weatherScale: 52_000,
    },
    wind: { evolutionSpeed: 2.4, heading: 172, skew: 780, speed: 8.5 },
  });
  // "Restrained god rays": on, but well below the schema default of 2.
  sky.godRays.applyParams({ enabled: true, strength: 0.85 });

  // Headland grass art direction. The bundle's `grass` slot calls
  // field.applySettings() with the shipped Call Me Sensei values
  // (styleAdapters.js applyGrass), so any per-field authoring must land AFTER
  // the bundle or it is silently reverted. Each field carries its own role
  // (see GRASS_ROLES) — that per-role authoring IS the variety.
  for (const { field, role } of grassFields) {
    field.applySettings({
      preset: 'call_me_sensei',
      ...role.settings,
      ...(Number.isFinite(Number(grassWashOpacity))
        ? { washOpacity: Number(grassWashOpacity) }
        : {}),
    });
  }

  // §6.5 restrained bloom. The `call_me_sensei` post preset ships bloom off
  // (D19-025), so it is re-enabled explicitly, after the bundle lands.
  post.setSettings({
    features: { bloom: true },
    parameters: { bloomRadius: 0.1, bloomStrength: 0.14, bloomThreshold: 0.9 },
    preset: 'call_me_sensei',
  });

  // Water aerial perspective. `scene.fog` alone is linear and reaches the
  // horizon at 900 m; the exponential term is what produces a value STEP
  // between the mid and far water bands rather than a ramp (parity analysis
  // §5.4). Applied after the bundle because applyWater re-pushes settings.
  water.setDistanceFog({ color: HORIZON.color, density: HORIZON.waterFogDensity });

  // Coastal shadow family. Measured on both benchmark beach plates at
  // 327-330deg (violet-magenta); the shipped `call-me-sensei` lighting style
  // ships [0.42, 0.5, 0.85], which is ~250deg blue-violet and correct for the
  // city. A single global cool fill produces cold, wrong sand — parity
  // analysis §5.2. Only the shadow tint moves; the sun path, keyframes and
  // exposure stay exactly as shipped, so `setTimeOfDay` still behaves.
  // --- Coastal lighting authoring -------------------------------------------
  //
  // §4 requires "colored shadow families" and §6.5 prescribes a single "cool
  // sky fill" for BOTH scenes. Those two are in conflict, and the parity
  // analysis settles it with measurements: city shadows in the benchmark run
  // 214-267deg blue-violet, beach shadows run 327-330deg violet-magenta. A
  // beach lit by the city's fill renders cold, wrong sand — which is what pass
  // 1 did. The coastal fill is therefore authored separately here.
  //
  // The mechanism matters. `shadowTint` alone is a toon-response term; the
  // thing that actually lights every N.L <= 0 surface in this rig is the SH
  // sky probe, because `ambientLight` is disabled by design. So the probe
  // colour and energy are authored too, plus `skyGroundTint` — the probe's
  // lower hemisphere, which is physically the warm bounce off 43,000 m2 of
  // sunlit sand and is the term the benchmark's luminous warm shadows are
  // made of. `skyTopTint` stays cool: that contrast is what makes the ground
  // bounce read as bounce rather than as a global warm cast.
  const coastalLightingStyle = resolveLightingStylePreset('call-me-sensei');
  const COASTAL_KEYFRAME = Object.freeze({
    accentScale: 1.15,
    ambientScale: 1,
    exposureScale: 1.06,
    fixtureScale: 0,
    // Neutral-warm haze at ~320deg. A blue fog colour would put the far band
    // in the city's shadow family and fight the sand.
    fogColor: [0.88, 0.82, 0.86],
    hour: TIME_OF_DAY,
    sky: { horizon: [0.78, 0.9, 1.02], stars: 0, zenith: [0.2, 0.5, 1.0] },
    // Warm sand bounce, ~335deg. This is the lower hemisphere of the probe.
    skyGroundTint: [1.28, 0.94, 1.08],
    // ~323deg, and bright: "luminous never-crushed shadows" is the style's own
    // stated intent, which the dawn interpolation was defeating.
    skyProbeColor: [0.95, 0.82, 0.9],
    skyProbeEnergy: 1.15,
    // The sky itself stays cool overhead.
    skyTopTint: [0.9, 0.97, 1.12],
    sunColor: [1, 0.955, 0.88],
    sunIntensity: 7.1,
  });
  runtime.lighting?.setStyle({
    ...coastalLightingStyle,
    // Inserted, not replaced: hours 0/6/13/18/22 stay exactly as shipped, so
    // the style still behaves for any other hour and `setTimeOfDay` sweeps
    // smoothly through the coastal keyframe rather than jumping at it.
    dayCycle: [...(coastalLightingStyle.dayCycle ?? []), COASTAL_KEYFRAME]
      .sort((a, b) => a.hour - b.hour),
    sunPath: {
      ...(coastalLightingStyle.sunPath ?? {}),
      azimuthOffset: COASTAL_SUN_AZIMUTH_OFFSET,
      heightScale: COASTAL_SUN_HEIGHT_SCALE,
    },
    toonResponse: {
      ...(coastalLightingStyle.toonResponse ?? {}),
      // ~321deg. The shipped [0.42, 0.5, 0.85] is ~250deg and correct for the
      // city.
      shadowTint: [0.78, 0.55, 0.7],
    },
  });
  runtime.setTimeOfDay(TIME_OF_DAY);

  // Ground scene state: waterLevel drives the Ground Shader's own shoreline
  // wet band, which is what marries the sand to the water's swash.
  const lightingFrame = runtime.lighting?.frame ?? null;
  setGroundShaderSceneState(ground, {
    waterLevel: WATER_LEVEL,
    ...(lightingFrame?.sunDirection
      ? { sunDirection: lightingFrame.sunDirection }
      : {}),
  });

  return {
    camera,
    cliffs,
    fog,
    ground,
    grassFields,
    post,
    runtime,
    scene,
    shoreZ,
    sky,
    surface,
    trees,
    water,
    yua: { facing: YUA_FACING, mark: YUA_MARK, plantableMask },

    // Instance census for the density gate (parity analysis §3).
    census: Object.freeze({
      boulders: cliffs.boulderCount,
      cliffs: cliffs.cliffCount,
      grassClumps: grassFields.reduce((total, { field }) => total + field.placements.length, 0),
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
      for (const { field } of grassFields) field.update(delta, camera);
      trees.update(delta);
      sky.update(delta);
      water.update(renderer, scene, camera, delta);
      runtime.update(delta, camera);
    },

    resize(width, height, pixelRatio) {
      sky.resize?.(width, height);
      post.setSize(width, height, pixelRatio);
    },
  };
}
