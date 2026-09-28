// Nova Promenade — city scene assembly for the background/midground massing
// pass (§10.1).
//
// Every non-architectural system here is a first-party ToonLab system, wired
// the same way `labs/launch-world/coast/scene.js` wires the coastal scene, so
// the two halves of the launch world sit under one atmosphere:
//   ground            createGroundShaderMesh     (src/ground-shader)
//   surface runtime   createSceneSurfaceRuntime  (src/runtime)
//   sky + cloud       createSkySystem            (src/sky)
//   lighting/post     createSceneStyleRuntime + CALL_ME_SENSEI_STYLE_BUNDLE
//   architecture      buildCityMassing           (./massing.js -> src/buildinggen)
//
// NOT in this pass — integration points are marked INTEGRATION and no blockout
// stands in for any of them (§2):
//   Yua, ARCH-CITY-01..04, TREE-CITY-01/02, VEH-CITY-01/02, PROP-CITY-01/02,
//   ground features, signage, overhead elements, background figures.

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
import { applyEnvironmentShader } from '@call-me-sensei/toonlab/environment';
import { createPostProcessingPipeline } from '@call-me-sensei/toonlab/post';
import { PRESETS as SKY_PRESETS } from '@call-me-sensei/toonlab/sky';

import grassyLandTextureUrl from '../../shared/textures/grassy-land-texture.jpg';
import landTextureUrl from '../../shared/textures/land-texture.jpg';
import rockTextureUrl from '../../shared/textures/rock-texture.jpg';
import sandTextureUrl from '../../shared/textures/sand-texture.jpg';

import {
  BAND_ORIGIN,
  HERO_BLOCKS,
  YUA_MARK,
  buildCityMassing,
  cityRoleMaterial,
} from './massing.js';
import { buildStreetKit } from './streetkit.js';

/**
 * Shared with the coastal scene: the shipped `call-me-sensei` sunPath resolves
 * hour 8.5 to exactly 42.0deg of sun elevation, which is §6.5's requirement.
 * Both launch scenes must agree or the S05 match cut breaks.
 */
export const TIME_OF_DAY = 8.5;

/**
 * FILL-012 / D19-043. The city plate at the bundle's own day-curve exposure
 * measured three modal luma plateaus at 0.59 / 0.75 / 0.78 — two of them 0.03
 * apart — against `01-city-street-vehicles.png`'s 0.12 / 0.22 / 0.34. It is
 * roughly a stop and a half hot, and the analysis's §5.1 requirement is >= 3
 * SEPARATED plateaus.
 *
 * Neither documented control reaches it: `rendererConfiguration.toneMappingExposure`
 * is accepted and then overwritten (`lightingSystem.js:509` writes
 * `renderer.toneMappingExposure = frame.exposure` every frame, and the module
 * declares that ownership), and `post.setSettings({parameters:{exposure}})`
 * measurably does nothing once the bundle is applied under `watch: true`.
 *
 * So the scene re-asserts it after the lighting frame each tick. This is the
 * per-scene exposure OFFSET the lighting system should compose with its day
 * curve rather than overwrite; when that lands, this line deletes.
 */
export const EXPOSURE = 0.48;

/** Ground plate. Far wider than the 160 x 140 m world so no wide shot runs off it. */
const GROUND = Object.freeze({ depth: 620, width: 620 });

/**
 * Lens -> vertical FOV, for a 36 mm-wide full-frame image cropped to the 16:9
 * the §11 masters are delivered in. `camera.fov` in three.js is vertical, so
 * setting 28 directly would be wrong by 12 degrees.
 */
export function fovForLens(mm, aspect = 16 / 9) {
  const horizontal = 2 * Math.atan(18 / mm);
  return (2 * Math.atan(Math.tan(horizontal / 2) / aspect)) * (180 / Math.PI);
}

export const SHOTS = Object.freeze({
  // §11 S01 — 28 mm city crane/dolly reveal. This is the establishing hold the
  // crane settles into: down the avenue from the south, Yua's mark low-centre,
  // the west and east street walls raking away, the far band closing the vista
  // with a deliberate sky gap on the centreline.
  s01: Object.freeze({ lens: 28, position: [5, 13.5, 54], target: [-1, 11.5, -46] }),
  // §11 S05 — 24 mm, the widest lens in the plan and the most exposed shot.
  // Inside the avenue void, not inside CM-E1: the eye has to sit in a street.
  s05: Object.freeze({ lens: 24, position: [8, 5.6, 30], target: [-26, 10, -44] }),
  // §11 S10 — 40 mm final hero composition.
  s10: Object.freeze({ lens: 40, position: [-9, 3.4, 26], target: [6, 4.5, -40] }),
  // Review framings, not shots.
  west: Object.freeze({ lens: 35, position: [10, 5, -6], target: [-46, 12, -40] }),
  east: Object.freeze({ lens: 35, position: [-8, 5, -4], target: [44, 12, -44] }),
  plan: Object.freeze({ lens: 24, position: [10, 190, 130], target: [0, 0, -70] }),
});

async function loadLayerTexture(url) {
  const texture = await new THREE.TextureLoader().loadAsync(url);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

/**
 * Promenade splat. INTEGRATION: this is a two-role placeholder standing in for
 * the ground owner's authored paving, tactile strips, kerb profiles, tree pits
 * and wear — it exists so the architecture can be graded against the density
 * metric on a non-empty plate, and is explicitly NOT a ground deliverable.
 * Channels are the four fixed splat roles: R grass, G dirt, B rock, A sand.
 */
/**
 * Base surface under the city.
 *
 * The previous pass painted "planted verge" bands from a distance function
 * that ran straight across the carriageway, so grass appeared down the middle
 * of the road — a §6.2 violation ("no grass on pavement, building
 * footprints") and the most obvious single defect in the capture. The street
 * kit now models footways, kerbs and crossings as geometry, so this plate has
 * exactly one job: be the paving the city sits on. One channel, no bands, no
 * masks that can drift onto a roadway.
 *
 * INTEGRATION: the ground owner replaces this with the authored promenade
 * surface — paving modules, expansion joints, wear, drainage falls and the
 * sticker overlay. Channels are the four fixed splat roles
 * (R grass, G dirt, B rock, A sand); this uses B alone.
 */
function buildGroundField({ width = 128, depth = 128 } = {}) {
  const splat = new Uint8Array(width * depth * 4);
  for (let index = 0; index < width * depth; index += 1) {
    splat[index * 4 + 2] = 255; // rock -> fine stone paving
  }
  return { splat, splatD: depth, splatW: width };
}

function buildGroundGeometry() {
  const geometry = new THREE.PlaneGeometry(GROUND.width, GROUND.depth, 160, 160);
  geometry.rotateX(-Math.PI / 2);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** The promenade is authored flat; §10.1 specifies no terrain relief. */
export const cityHeight = () => 0;

/**
 * Builds the Nova Promenade background/midground massing pass.
 *
 * @param {object} options
 * @param {THREE.WebGPURenderer} options.renderer
 * @param {THREE.PerspectiveCamera} options.camera
 * @param {(stage: string) => void} [options.onProgress]
 * @param {'balanced'|'performance'} [options.quality]
 * @param {boolean} [options.shadows] engage the package sun-shadow pass —
 *   default off, see D19-041 in `docs/capability-status.md`
 */
export async function createNovaPromenade({
  camera,
  onProgress = () => {},
  quality = 'balanced',
  renderer,
  shadows = false,
}) {
  const scene = new THREE.Scene();
  scene.background = null;

  // --- 1. Surface runtime ---------------------------------------------------
  onProgress('Setting the promenade level');
  const surface = createSceneSurfaceRuntime({
    bounds: { max: { x: 310, z: 310 }, min: { x: -310, z: -310 } },
    heightAt: cityHeight,
    waterLevel: -60,
  });

  // --- 2. Ground ------------------------------------------------------------
  onProgress('Laying the paving');
  const layerTextures = await Promise.all([
    loadLayerTexture(grassyLandTextureUrl), // R grass -> planted verge
    // G "dirt" is the promenade. The stone texture, not the earth one: a
    // promenade is grey paving, and the earth map pushes the darkest quartile
    // of the lower two-thirds to a ~24deg warm hue when the parity metric
    // expects a city shadow family at 250-270deg.
    loadLayerTexture(rockTextureUrl), //       G dirt  -> promenade paving
    loadLayerTexture(landTextureUrl), //       B rock  -> unused here
    loadLayerTexture(sandTextureUrl), //       A sand  -> unused here
  ]);
  const ground = createGroundShaderMesh({
    field: buildGroundField(),
    geometry: buildGroundGeometry(),
    layers: layerTextures.map((texture) => ({ texture })),
    name: 'Nova Promenade · Ground',
    // The preset's dirtScale 13 / grassScale 16 are landscape numbers: at that
    // world scale the stone layer reads as a boulder field rather than paving.
    // A promenade wants a sub-metre module.
    // The preset's rockScale 25 is a landscape number — at that world scale
    // the stone layer reads as a boulder field. A promenade wants a sub-metre
    // paving module.
    settings: createGroundShaderSettings({
      preset: 'call_me_sensei',
      projection: { rockScale: 2.1 },
    }),
    styleTarget: { targetId: 'city/ground' },
  });
  scene.add(ground);

  // --- 3. Background and midground architecture -----------------------------
  onProgress('Building the city');
  const massing = buildCityMassing({ heightAt: cityHeight });

  onProgress('Laying the street');
  const street = buildStreetKit();
  const streetRoot = new THREE.Group();
  streetRoot.name = 'Nova Promenade · street level';
  for (const [role, geometry] of Object.entries(street.geometries)) {
    const mesh = new THREE.Mesh(geometry, cityRoleMaterial(role));
    mesh.name = `CityStreet-${role}`;
    mesh.castShadow = role !== 'paving';
    mesh.receiveShadow = true;
    streetRoot.add(mesh);
  }

  // One root, one conversion. The street kit MUST go through the environment
  // shader with the architecture: a plain MeshStandardMaterial left behind in
  // a Call Me Sensei scene renders dark saturated blue (D19-040), so a
  // half-converted city would have blue kerbs under stone buildings.
  const cityRoot = new THREE.Group();
  cityRoot.name = 'Nova Promenade · city';
  cityRoot.add(massing.root, streetRoot);

  // §3 names ToonLab Environment + Manufactured Surface as the runtime owner
  // for manufactured architecture, and it is not optional: buildinggen ships
  // plain MeshStandardMaterials, and under the Call Me Sensei rig a plain
  // standard material sees only the sun plus a low-energy SH sky probe, so
  // every shadow-side facade collapses to a dark saturated blue (D19-040).
  // Converting through the environment shader is what gives the architecture
  // the bundle's ambient, shadow-lift, AO warmth and cloud-shadow response —
  // and what puts it on the package sun-shadow pass with its far cascade.
  // NOTE: the pre-conversion materials are deliberately NOT disposed here.
  // buildinggen caches its five role materials process-wide
  // (`buildingRecipe.js` roleMaterial), so disposing them would poison every
  // later building built in the same page.
  await applyEnvironmentShader(cityRoot, {
    // 265k triangles of merged background mass; the per-vertex AO bake is a
    // hero-asset tool and would cost seconds here for pixels no wide shot
    // resolves. The grammar's own painted shading carries the grounding.
    bakeVertexAo: false,
    hasSun: true,
    objectClass: 'buildingExterior',
    parameters: {
      // Analysis §5.1/§5.5: three separated value plateaus, mean saturation
      // under 0.30. A high ambient with a lifted shadow keeps shadow-side
      // facades inside the mid plateau instead of crushing them to navy.
      ambientStrength: 0.4,
      // Measured: at aoWarmth 0.5 the darkest luminance quartile of the lower
      // two-thirds came out at hue 31deg — a warm shadow family. The benchmark
      // city plates sit at 214-267deg and the analysis §5.2 requires 250-270.
      // AO warmth is the knob that was doing it.
      aoWarmth: 0.1,
      shadowLift: 0.09,
      untexturedGradientStrength: 0.04,
    },
    scanStylize: false,
  });
  scene.add(cityRoot);

  // INTEGRATION: ARCH-CITY-01 (-18, 0, -8), ARCH-CITY-02 (-24, 0, -32),
  // ARCH-CITY-03 (-16, 0, 20), ARCH-CITY-04 (20, 0, -10). Their parcels are
  // reserved by `verifyLayout()` in massing.js and are asserted clear on every
  // build; drop the hero blocks straight onto those marks.
  // INTEGRATION: Yua at (0, 0, 4) facing SSW. A 21 m clearance cylinder around
  // the mark is refused to every mass this module owns.
  // INTEGRATION: TREE-CITY-01 x8 / TREE-CITY-02 x5, VEH-CITY-01/02,
  // PROP-CITY-01/02 street furniture, signage, overhead signal masts.

  // --- 4. Sky ---------------------------------------------------------------
  onProgress('Building the sky');
  const sky = await createSkySystem({
    camera,
    godRays: true,
    quality: quality === 'performance' ? 'medium' : 'high',
    renderer,
    scene,
    timeOfDay: { autoAdvanceSecondsPerDay: 0, latitude: 38, time: TIME_OF_DAY / 24 },
  });

  // --- 5. Post + style runtime ---------------------------------------------
  onProgress('Lighting the scene');
  const post = createPostProcessingPipeline({
    camera,
    renderer,
    scene,
    settings: { preset: 'call_me_sensei' },
  });

  const runtime = createSceneStyleRuntime({
    collisionHeightAt: cityHeight,
    // Binds the architecture to the lighting rig's environment tinting and to
    // the package sun-shadow pass.
    environmentRoot: cityRoot,
    post,
    quality,
    renderer,
    // §6.5 asks for filmic tone mapping; that is a RENDERER setting, not a post
    // setting (contracts §0.2 / D19-023).
    rendererConfiguration: {
      toneMapping: THREE.ACESFilmicToneMapping,
      toneMappingExposure: 1.02,
    },
    scene,
    sky,
    timeOfDay: TIME_OF_DAY,
  });

  await runtime.apply(CALL_ME_SENSEI_STYLE_BUNDLE, {
    discovery: 'scene-labels',
    mode: 'strict',
    watch: true,
  });

  await runtime.setSkyPreset(SKY_PRESETS.partlyCloudy, { timeOfDay: TIME_OF_DAY });

  // D19-041. The shipped Call Me Sensei sun contract sizes its shadow for a
  // character-scale scene: near cascade +-34 m / far 140 m, far cascade
  // 110 m extent / 300 m far (`callMeSenseiLightingContract.js:54-63`). §10.1's
  // world is 160 x 140 m and its modeled skyline runs to 280 m, so with the
  // shipped numbers every mass past the cascade renders unshadowed and the
  // whole city loses its contact and self-shadowing. `toonLabFarExtent` and
  // `toonLabFarCameraFar` are the pass's documented hooks
  // (`environmentSunShadowPass.js:429`, `:453`), so they are re-authored here
  // for the launch world rather than the contract being edited.
  let sun = null;
  scene.traverse((object) => { if (object.isDirectionalLight && object.shadow) sun = object; });
  if (sun) {
    // D19-041. The shipped Call Me Sensei sun contract sizes its shadow for a
    // character scene (near +-34 m / far 140 m, far cascade 110 m / 300 m,
    // `callMeSenseiLightingContract.js:54-63`). §10.1's world is 160 x 140 m
    // and its modeled skyline runs to 280 m. The near cascade stays tight so
    // the plaza keeps texel density; the far cascade carries the skyline.
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 260;
    sun.shadow.camera.left = -60;
    sun.shadow.camera.right = 60;
    sun.shadow.camera.top = 60;
    sun.shadow.camera.bottom = -60;
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.toonLabFarExtent = 300;
    sun.shadow.toonLabFarCameraFar = 620;
    sun.shadow.mapSize.set(4096, 4096);
    sun.shadow.normalBias = 0.06;
    sun.shadow.bias = -0.0006;
    sun.castShadow = shadows;
  }
 }

  // Analysis §5.6: the upper third of every wide is dead unless the cloud
  // carries internal value structure. Higher, thinner, more broken deck than
  // the coastal one, sheared so the tops lean and the layers separate.
  sky.clouds.applyParams({
    shape: {
      altitude: 1450,
      baseScale: 7600,
      baseStrength: 1.15,
      coverage: 0.42,
      density: 0.058,
      thickness: 2100,
      weatherScale: 44_000,
    },
    wind: { evolutionSpeed: 2.1, heading: 205, skew: 640, speed: 7.4 },
  });
  sky.godRays.applyParams({ enabled: true, strength: 0.7 });

  // Analysis §5.3 sets a hard ceiling of 0.5% of pixels above 0.98 luma, and
  // the master city plate clips 0.00%. Bloom stays on for the §6.5 read but
  // well under the schema default, with a high threshold.
  post.setSettings({
    features: { bloom: true },
    parameters: {
      bloomRadius: 0.09,
      bloomStrength: 0.1,
      bloomThreshold: 0.94,
      // Analysis §5.1: >= 3 SEPARATED luminance plateaus. Measured on the S01
      // plate at the shipped exposure, the three modal plateaus sat at
      // 0.59 / 0.75 / 0.78 -- two of them 0.03 apart -- against the benchmark's
      // 0.12 / 0.22 / 0.34. The plate was simply a stop and a half hot.
      //
      // `rendererConfiguration.toneMappingExposure` cannot fix it: the
      // lighting system owns `renderer.toneMappingExposure` and rewrites it
      // every frame from the bundle's day curve (D19-043), so the grade has to
      // happen in post, which is where the parity metric measures anyway.
      exposure: 0.6,
    },
    preset: 'call_me_sensei',
  });

  const lightingFrame = runtime.lighting?.frame ?? null;
  setGroundShaderSceneState(ground, {
    waterLevel: -60,
    ...(lightingFrame?.sunDirection ? { sunDirection: lightingFrame.sunDirection } : {}),
  });

  return {
    camera,
    ground,
    cityRoot,
    heroBlocks: HERO_BLOCKS,
    massing,
    street,
    post,
    runtime,
    scene,
    sky,
    surface,
    shadows,
    sun,
    yua: { mark: YUA_MARK },

    applyShot(shotId) {
      const shot = SHOTS[shotId] ?? SHOTS.s01;
      camera.fov = fovForLens(shot.lens, camera.aspect || 16 / 9);
      camera.position.set(...shot.position);
      camera.updateProjectionMatrix();
      return new THREE.Vector3(...shot.target);
    },

    update(delta) {
      sky.update(delta);
      runtime.update(delta, camera);
      // After the lighting frame, never before — see EXPOSURE / D19-043.
      renderer.toneMappingExposure = EXPOSURE;
    },

    resize(width, height, pixelRatio) {
      sky.resize?.(width, height);
      post.setSize(width, height, pixelRatio);
    },
  };
}
