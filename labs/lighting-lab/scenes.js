// Lighting Lab preview scenes — real composed house content only:
//
// • outdoor / night-camp: the playground WATER SCENE (labs/playground
//   SCENE_MODE 'water' — the scene the Water Lab's walk preview opens),
//   ported verbatim in ./waterStage.js (same seabed, same src/water surface,
//   same stylized sky, same grass carpet, same trees — see that module).
//   Outdoor lands at golden hour on the 'sunset' environment; night-camp is
//   the same composition on 'moonlit' at 21:30 with campfire + shore-lantern
//   dressing and call_me_sensei fireflies.
// • interior: an original Liyue-INSPIRED tea room (original geometry, never
//   licensed content) run through the environment-shader pipeline
//   (applyEnvironmentShader + createEnvironmentLampRig).
//
// No THREE lights are ever created here: lighting always flows through the
// createLightingSystem instance (the interior's warm lamp rig comes from
// src/environment and is handed to the system via attach({ lampRig }), so
// the style's fixtureScale drives it).
//
// Adding a preview scene = appending one entry to SCENES below:
//   { id, label, timeOfDay?, fixtures: [...], build(context) }
// `build({ camera, renderer, scene })` may be async and returns an instance:
//   {
//     root,             // group main.js adds to the stage scene (cached;
//                       //  hidden rather than rebuilt on scene switches)
//     environmentRoot?, // subtree whose environment materials take the
//                       //  style's sky tints
//     attach?,          // extra system.attach options ({ fog, lampRig, … })
//     sunShadow?,       // per-scene sun shadow-camera overrides
//     fixtures?,        // extra placements computed from built geometry
//     walker?,          // { object, mixer, actions, groundHeightAt,
//                       //   moveHorizontal } — main.js drives the shared
//                       //  walk preview from the active scene's walker
//     view?,            // { camera, target } override
//     update?(delta, frame),
//     dispose(),
//   }
// Every seed/coordinate below is a literal so a scene renders identically on
// every load.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

import { applyEnvironmentShader } from '../../src/environment/environmentMaterialAdapter.js';
import {
  applyEnvironmentLampEmissive,
  createEnvironmentLampRig,
} from '../../src/environment/environmentRigs.js';
import { createEnvironmentSunShadowPass } from '../../src/environment/environmentSunShadowPass.js';
import { createRockDocument, meshDocument } from '../../src/rockgen/index.js';
import { applyToonShader } from '../../src/toon/toonMaterialAdapter.js';
import { createWalkPreviewActions } from '../shared/walkPreview.js';

function material(color, options = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0.02, ...options });
}

function mesh(geometry, surface, { position, rotation, scale, cast = true, receive = true, name } = {}) {
  const object = new THREE.Mesh(geometry, surface);
  if (position) object.position.fromArray(position);
  if (rotation) object.rotation.set(...rotation);
  if (scale) object.scale.fromArray(scale);
  object.castShadow = cast;
  object.receiveShadow = receive;
  if (name) object.name = name;
  return object;
}

// ---------------------------------------------------------------------------
// The ported water stage is browser-only (bundler texture imports), so it is
// loaded lazily — Node-side verify scripts import this module directly.
// labs/playground/params.js tags document.body.dataset.scene on import;
// restore the lab's tag afterwards.

let waterStagePromise = null;
function loadWaterStageModule() {
  if (!waterStagePromise) {
    const sceneTag = document.body.dataset.scene;
    waterStagePromise = import('./waterStage.js').then((module) => {
      if (sceneTag) document.body.dataset.scene = sceneTag;
      return module;
    });
  }
  return waterStagePromise;
}

// ---------------------------------------------------------------------------
// Studio-standard 1.8m mannequin with its native locomotion clips, walkable
// in every scene. The glTF is fetched once; each scene gets a SkeletonUtils
// clone with its own mixer so cached scenes keep independent walkers.

const gltfLoader = new GLTFLoader();
let mannequinAssetPromise = null;

function loadMannequinAsset() {
  if (!mannequinAssetPromise) {
    mannequinAssetPromise = new Promise((resolve, reject) => {
      gltfLoader.load('/characters/mannequin.glb', resolve, undefined, reject);
    });
  }
  return mannequinAssetPromise;
}

/**
 * Adds a walkable mannequin to `root` and returns the walker record main.js
 * feeds to the shared walk-preview controller. Returns null (scene still
 * works, just not walkable) when the model is missing from the checkout.
 */
async function createSceneWalker(root, {
  facing = 0,
  groundHeightAt = () => 0,
  moveHorizontal = null,
  position = [0, 0],
}) {
  let asset;
  try {
    asset = await loadMannequinAsset();
  } catch (error) {
    console.warn('Mannequin failed to load:', error);
    return null;
  }
  const mannequin = cloneSkinned(asset.scene);
  mannequin.name = 'Walkable mannequin';
  mannequin.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  // House character pipeline, same as the playground's model path: the CMS
  // anime toon shader whose scene-light sync follows the SYSTEM's sun and
  // ambient — the mannequin rides the style's day cycle like everything else.
  applyToonShader(mannequin, { outline: true, preset: 'call_me_sensei', shaderMode: 'anime' });
  const [x, z] = position;
  mannequin.position.set(x, groundHeightAt(x, z), z);
  mannequin.rotation.y = facing;
  root.add(mannequin);
  const mixer = new THREE.AnimationMixer(mannequin);
  const actions = createWalkPreviewActions({ clips: asset.animations, mixer });
  return {
    actions,
    groundHeightAt,
    mixer,
    moveHorizontal,
    object: mannequin,
    update(delta) {
      mixer.update(delta);
    },
  };
}

// ---------------------------------------------------------------------------
// Outdoor: the ported playground water scene at golden hour — the mannequin
// spawns on the dry sand behind the waterline exactly where the playground
// character does, ready to wade.

async function buildOutdoor({ camera, renderer, scene }) {
  const { buildWaterStage } = await loadWaterStageModule();
  const stage = await buildWaterStage({ camera, envPreset: 'sunset', renderer, scene });

  const walker = await createSceneWalker(stage.root, {
    facing: 0.2,
    groundHeightAt: stage.groundHeightAt,
    moveHorizontal: stage.moveHorizontal,
    position: [0, -4],
  });
  if (walker) stage.setWalker(walker.object);

  return {
    root: stage.root,
    environmentRoot: stage.root,
    attach: { fog: stage.fog, sky: stage.sky, sunDistance: 140 },
    sunShadow: stage.sunShadow,
    walker,
    view: {
      camera: [0.7, 2.9, -9.6],
      target: [0.1, 1.2, -3.2],
    },
    update(delta) {
      stage.update(delta);
      walker?.update(delta);
    },
    dispose() {
      stage.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
// Night camp: the same shore at 21:30 under the moonlit environment, dressed
// as an inviting camp — a rockgen fire ring with glowing embers (the
// 'campfire' fixture is the light), a signature lantern on a wooden post at
// the waterline, fireflies from the call_me_sensei ambient-fx preset. The
// hero "standing next to a lantern at night" shot. NO buildings, NO neon.

const CAMP = Object.freeze({ x: -2.8, z: -4.6 });
const LANTERN_POST = Object.freeze({ x: 0.6, z: -2.3 });

function addCampfire(root, fixtures, heightAt) {
  const campY = heightAt(CAMP.x, CAMP.z);
  const group = new THREE.Group();
  group.name = 'Campfire';
  group.position.set(CAMP.x, campY, CAMP.z);

  // Fire ring: rockgen river boulders (vertex-colored generator output —
  // approved separately from the rejected prop/building generators).
  const rockMaterial = new THREE.MeshStandardMaterial({ metalness: 0, roughness: 0.92, vertexColors: true });
  const ringSeeds = [101, 102, 103, 104, 105, 106, 107];
  const scratch = new THREE.Vector3();
  ringSeeds.forEach((seed, index) => {
    const geometry = meshDocument(createRockDocument({ preset: 'river-boulder', seed }));
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    geometry.boundingBox.getSize(scratch);
    const fit = 0.4 / Math.max(scratch.x, scratch.y, scratch.z, 1e-4);
    const rock = new THREE.Mesh(geometry, rockMaterial);
    const angle = (index / ringSeeds.length) * Math.PI * 2 + 0.4;
    rock.position.set(Math.cos(angle) * 0.58, 0.02, Math.sin(angle) * 0.58);
    rock.scale.setScalar(fit);
    rock.rotation.y = angle * 2.3;
    rock.castShadow = true;
    rock.receiveShadow = true;
    rock.name = `Fire ring rock ${seed}`;
    group.add(rock);
  });

  // Charred logs leaned into the pit + an ember mound as the visible source.
  const logMaterial = material(0x33251a, { roughness: 0.9 });
  const logGeometry = new THREE.CylinderGeometry(0.045, 0.06, 0.66, 7);
  const logs = [
    [0.1, 0.15, -0.05, 0.5, 1.15],
    [-0.12, 0.16, 0.07, 2.6, 1.2],
    [0.02, 0.17, 0.12, 4.5, 1.1],
  ];
  for (const [x, y, z, yaw, tilt] of logs) {
    const log = mesh(logGeometry, logMaterial, { position: [x, y, z], name: 'Campfire log' });
    log.rotation.set(tilt, yaw, 0);
    group.add(log);
  }
  group.add(mesh(new THREE.SphereGeometry(0.18, 12, 8), material(0xff7a26, {
    emissive: 0xff9042, emissiveIntensity: 1.7, roughness: 0.5,
  }), { position: [0, 0.09, 0], scale: [1, 0.55, 1], cast: false, name: 'Campfire embers' }));
  group.add(mesh(new THREE.SphereGeometry(0.08, 10, 6), material(0xffd9a0, {
    emissive: 0xffc23e, emissiveIntensity: 2.3, roughness: 0.4,
  }), { position: [0.03, 0.22, 0.02], cast: false, name: 'Campfire flame core' }));

  root.add(group);
  fixtures.push({
    fixture: 'campfire',
    // The stock campfire is tuned for open plazas; against the moonlit
    // grass it blows out, so the placement carries a gentler pool.
    overrides: { distance: 9, intensity: { unit: 'lumens', value: 520 } },
    position: [CAMP.x, campY + 0.55, CAMP.z],
    seed: 61,
  });

  // A pair of sitting logs facing the fire completes the camp.
  const seatGeometry = new THREE.CylinderGeometry(0.14, 0.15, 1.35, 9);
  const seatMaterial = material(0x46311f, { roughness: 0.9 });
  const seats = [
    [CAMP.x - 1.55, CAMP.z + 0.75, 0.55],
    [CAMP.x + 0.55, CAMP.z - 1.75, 2.1],
  ];
  for (const [x, z, yaw] of seats) {
    const seat = mesh(seatGeometry, seatMaterial, {
      position: [x, heightAt(x, z) + 0.14, z], name: 'Sitting log',
    });
    seat.rotation.set(Math.PI / 2, 0, yaw);
    root.add(seat);
  }
}

function addLanternPost(root, fixtures, heightAt) {
  const baseY = heightAt(LANTERN_POST.x, LANTERN_POST.z);
  const group = new THREE.Group();
  group.name = 'Shore lantern post';
  group.position.set(LANTERN_POST.x, baseY, LANTERN_POST.z);

  const wood = material(0x3d2c1e, { roughness: 0.8 });
  group.add(mesh(new THREE.CylinderGeometry(0.055, 0.075, 2.5, 8), wood, {
    position: [0, 1.25, 0], name: 'Lantern post',
  }));
  // Arm reaching over the water (+z), with a short brace.
  group.add(mesh(new THREE.BoxGeometry(0.07, 0.07, 0.72), wood, {
    position: [0, 2.38, 0.3], name: 'Lantern arm',
  }));
  const brace = mesh(new THREE.BoxGeometry(0.05, 0.05, 0.5), wood, { position: [0, 2.12, 0.18] });
  brace.rotation.x = -0.8;
  group.add(brace);
  // Hanging paper lantern: warm emissive body between dark caps — the
  // visible source for the cms-lantern fixture.
  group.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.16, 6), wood, { position: [0, 2.28, 0.56], cast: false }));
  group.add(mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.045, 10), wood, { position: [0, 2.18, 0.56], cast: false }));
  group.add(mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.3, 12), material(0xffd9a0, {
    emissive: 0xffb257, emissiveIntensity: 1.6, roughness: 0.4,
  }), { position: [0, 2.0, 0.56], cast: false, name: 'Lantern paper' }));
  group.add(mesh(new THREE.CylinderGeometry(0.085, 0.095, 0.05, 10), wood, { position: [0, 1.82, 0.56], cast: false }));

  root.add(group);
  fixtures.push({
    fixture: 'cms-lantern',
    position: [LANTERN_POST.x, baseY + 2.0, LANTERN_POST.z + 0.56],
    seed: 62,
  });
}

async function buildNightCamp({ camera, renderer, scene }) {
  const { buildWaterStage } = await loadWaterStageModule();
  const stage = await buildWaterStage({
    // Fireflies + warm slow blink from the studio ambient-fx preset;
    // day-gated effects stay silent at 21.5.
    ambientfx: {
      effects: { fireflies: { density: 1.5 }, leaves: false },
      preset: 'call_me_sensei',
      seed: 5,
      timeOfDay: 21.5,
    },
    camera,
    // Grass parts around the fire pit and the lantern post.
    clearings: [
      { radius: 1.6, x: CAMP.x, z: CAMP.z },
      { radius: 0.5, x: LANTERN_POST.x, z: LANTERN_POST.z },
    ],
    envPreset: 'moonlit',
    renderer,
    scene,
  });

  const fixtures = [];
  addCampfire(stage.root, fixtures, stage.heightAt);
  addLanternPost(stage.root, fixtures, stage.heightAt);
  // The walk preview can't stroll through the fire pit or the post.
  stage.blockers.push(
    { radius: 0.8, x: CAMP.x, z: CAMP.z },
    { radius: 0.2, x: LANTERN_POST.x, z: LANTERN_POST.z },
  );

  // The mannequin stands beside the fire, facing the lantern and the
  // moonlit water.
  const standX = CAMP.x + 1.1;
  const standZ = CAMP.z + 1.1;
  const walker = await createSceneWalker(stage.root, {
    facing: Math.atan2(LANTERN_POST.x - standX, LANTERN_POST.z - standZ),
    groundHeightAt: stage.groundHeightAt,
    moveHorizontal: stage.moveHorizontal,
    position: [standX, standZ],
  });
  if (walker) stage.setWalker(walker.object);

  return {
    root: stage.root,
    environmentRoot: stage.root,
    attach: { fog: stage.fog, sky: stage.sky, sunDistance: 140 },
    sunShadow: stage.sunShadow,
    fixtures,
    walker,
    view: {
      camera: [-4.6, 2.6, -9.4],
      target: [0.6, 0.95, -1.7],
    },
    update(delta) {
      stage.update(delta);
      walker?.update(delta);
    },
    dispose() {
      stage.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
// Interior: an original Liyue-INSPIRED tea room — warm post-and-beam wood,
// paneled plaster walls, a folding screen, low table, shelf alcoves, and
// red/gold trim — genre-inspired original geometry (no licensed room ever
// ships) run through the same environment-shader pipeline as the playground's
// indoor walkabout: applyEnvironmentShader + createEnvironmentLampRig +
// applyEnvironmentLampEmissive, with the lamp rig handed to the lighting
// system so the style's fixtureScale drives the practicals.

const ROOM = Object.freeze({ halfX: 5.2, halfZ: 4.0, height: 3.6 });
const LANTERN_SPOTS = Object.freeze([
  [-1.7, 2.62, 0.5],
  [2.1, 2.62, -1.3],
]);

function buildRoomShell(root) {
  const beamWood = material(0x4a3122, { roughness: 0.72 });
  const darkWood = material(0x38251a, { roughness: 0.7 });
  const floorWood = material(0x6e4b2f, { roughness: 0.82 });
  const plaster = material(0xd9c7a3, { roughness: 0.95 });
  const gold = material(0xc9a24a, { metalness: 0.35, roughness: 0.45 });
  const lacquer = material(0x8c2f23, { roughness: 0.55 });

  const { halfX, halfZ, height } = ROOM;

  // Floor: wide plank slab with darker seams.
  root.add(mesh(new THREE.BoxGeometry(halfX * 2 + 0.6, 0.24, halfZ * 2 + 0.6), floorWood, {
    position: [0, -0.12, 0], cast: false, name: 'Room floor',
  }));
  for (let i = -4; i <= 4; i += 1) {
    root.add(mesh(new THREE.BoxGeometry(0.045, 0.012, halfZ * 2), darkWood, {
      position: [i * 1.15, 0.005, 0], cast: false, name: 'Floor seam',
    }));
  }

  // Walls: plaster panels with a wood baseboard, waist rail, and top rail.
  const wallDefs = [
    { size: [halfX * 2, height, 0.24], position: [0, height / 2, -halfZ], name: 'Back wall' },
    { size: [0.24, height, halfZ * 2], position: [halfX, height / 2, 0], name: 'Right wall' },
  ];
  for (const wall of wallDefs) {
    root.add(mesh(new THREE.BoxGeometry(...wall.size), plaster, { position: wall.position, name: wall.name }));
  }
  // Front (+z) side is the veranda entrance: a lintel band over an open
  // middle framed by two plaster shoulders — the authoring camera reads the
  // room like an open tea house instead of staring at a sealed box.
  root.add(mesh(new THREE.BoxGeometry(3.1, height, 0.24), plaster, {
    position: [-halfX + 1.55, height / 2, halfZ], name: 'Front wall left shoulder',
  }));
  root.add(mesh(new THREE.BoxGeometry(2.4, height, 0.24), plaster, {
    position: [halfX - 1.2, height / 2, halfZ], name: 'Front wall right shoulder',
  }));
  root.add(mesh(new THREE.BoxGeometry(halfX * 2, height - 2.8, 0.24), plaster, {
    position: [0, (height + 2.8) / 2, halfZ], name: 'Front lintel band',
  }));
  // Open sliding-door panels parked against the shoulders.
  for (const doorX of [-1.35, 2.55]) {
    const door = new THREE.Group();
    door.position.set(doorX, 0, halfZ - 0.16);
    door.add(mesh(new THREE.BoxGeometry(1.1, 2.7, 0.06), darkWood, { position: [0, 1.4, 0], name: 'Door frame' }));
    door.add(mesh(new THREE.BoxGeometry(0.94, 2.5, 0.07), material(0xe9ddc2, { roughness: 0.9 }), {
      position: [0, 1.4, 0], cast: false, name: 'Door paper panel',
    }));
    for (const railY of [0.9, 1.55, 2.2]) {
      door.add(mesh(new THREE.BoxGeometry(1.0, 0.05, 0.08), darkWood, { position: [0, railY, 0], cast: false }));
    }
    root.add(door);
  }
  // Left wall carries the window: built from segments around the opening
  // (opening z ∈ [-1.7, 0.1], y ∈ [0.9, 2.9]).
  root.add(mesh(new THREE.BoxGeometry(0.24, height, halfZ - 1.7), plaster, {
    position: [-halfX, height / 2, (-halfZ + -1.7) / 2], name: 'Left wall seaward',
  }));
  root.add(mesh(new THREE.BoxGeometry(0.24, height, halfZ - 0.1), plaster, {
    position: [-halfX, height / 2, (halfZ + 0.1) / 2], name: 'Left wall landward',
  }));
  root.add(mesh(new THREE.BoxGeometry(0.24, 0.9, 1.8), plaster, {
    position: [-halfX, 0.45, -0.8], name: 'Left wall sill band',
  }));
  root.add(mesh(new THREE.BoxGeometry(0.24, height - 2.9, 1.8), plaster, {
    position: [-halfX, (height + 2.9) / 2, -0.8], name: 'Left wall lintel band',
  }));

  // Window: dark frame, lattice mullions, and a dusk-lit pane the
  // window-glow fixture sits behind.
  const frame = new THREE.Group();
  frame.name = 'Window frame';
  frame.position.set(-halfX + 0.02, 1.9, -0.8);
  frame.add(mesh(new THREE.BoxGeometry(0.14, 2.1, 0.1), darkWood, { position: [0, 0, -0.95] }));
  frame.add(mesh(new THREE.BoxGeometry(0.14, 2.1, 0.1), darkWood, { position: [0, 0, 0.95] }));
  frame.add(mesh(new THREE.BoxGeometry(0.14, 0.1, 2.0), darkWood, { position: [0, 1.0, 0] }));
  frame.add(mesh(new THREE.BoxGeometry(0.14, 0.1, 2.0), darkWood, { position: [0, -1.0, 0] }));
  for (const zOffset of [-0.475, 0, 0.475]) {
    frame.add(mesh(new THREE.BoxGeometry(0.06, 1.9, 0.045), darkWood, { position: [0, 0, zOffset], cast: false }));
  }
  for (const yOffset of [-0.5, 0.1, 0.65]) {
    frame.add(mesh(new THREE.BoxGeometry(0.06, 0.045, 1.9), darkWood, { position: [0, yOffset, 0], cast: false }));
  }
  frame.add(mesh(new THREE.PlaneGeometry(1.84, 1.94), material(0xf3c98e, {
    emissive: 0xe8a866, emissiveIntensity: 0.6, roughness: 0.4,
  }), { position: [-0.08, 0, 0], rotation: [0, Math.PI / 2, 0], cast: false, name: 'Window dusk pane' }));
  root.add(frame);

  // Posts and beams: columns at corners and wall midspans, a beam ring at
  // the top plate, and exposed ceiling beams under a dark ceiling.
  const postGeometry = new THREE.BoxGeometry(0.24, height, 0.24);
  const postSpots = [
    [-halfX + 0.12, -halfZ + 0.12], [halfX - 0.12, -halfZ + 0.12],
    [-halfX + 0.12, halfZ - 0.12], [halfX - 0.12, halfZ - 0.12],
    [0, -halfZ + 0.12], [0, halfZ - 0.12], [-halfX + 0.12, 2.2], [halfX - 0.12, -1.6],
  ];
  for (const [x, z] of postSpots) {
    root.add(mesh(postGeometry, beamWood, { position: [x, height / 2, z], name: 'Post' }));
  }
  root.add(mesh(new THREE.BoxGeometry(halfX * 2 + 0.3, 0.22, 0.3), beamWood, { position: [0, height - 0.24, -halfZ + 0.16], name: 'Top plate' }));
  root.add(mesh(new THREE.BoxGeometry(halfX * 2 + 0.3, 0.22, 0.3), beamWood, { position: [0, height - 0.24, halfZ - 0.16], name: 'Top plate' }));
  root.add(mesh(new THREE.BoxGeometry(0.3, 0.22, halfZ * 2), beamWood, { position: [-halfX + 0.16, height - 0.24, 0], name: 'Top plate' }));
  root.add(mesh(new THREE.BoxGeometry(0.3, 0.22, halfZ * 2), beamWood, { position: [halfX - 0.16, height - 0.24, 0], name: 'Top plate' }));
  for (const beamX of [-3.4, -1.15, 1.15, 3.4]) {
    root.add(mesh(new THREE.BoxGeometry(0.18, 0.26, halfZ * 2), beamWood, {
      position: [beamX, height - 0.13, 0], name: 'Ceiling beam',
    }));
  }
  root.add(mesh(new THREE.BoxGeometry(halfX * 2 + 0.6, 0.16, halfZ * 2 + 0.6), darkWood, {
    position: [0, height + 0.1, 0], cast: false, name: 'Ceiling',
  }));

  // Wainscot rails + red/gold trim lines on the plaster.
  for (const [y, thickness] of [[0.92, 0.09], [2.62, 0.07]]) {
    root.add(mesh(new THREE.BoxGeometry(halfX * 2 - 0.2, thickness, 0.06), beamWood, {
      position: [0, y, -halfZ + 0.16], cast: false, name: 'Wall rail',
    }));
    root.add(mesh(new THREE.BoxGeometry(0.06, thickness, halfZ * 2 - 0.2), beamWood, {
      position: [halfX - 0.16, y, 0], cast: false, name: 'Wall rail',
    }));
  }
  root.add(mesh(new THREE.BoxGeometry(halfX * 2 - 0.2, 0.035, 0.07), gold, {
    position: [0, 2.72, -halfZ + 0.17], cast: false, name: 'Gold trim',
  }));
  root.add(mesh(new THREE.BoxGeometry(0.07, 0.035, halfZ * 2 - 0.2), gold, {
    position: [halfX - 0.17, 2.72, 0], cast: false, name: 'Gold trim',
  }));
  root.add(mesh(new THREE.BoxGeometry(halfX * 2 - 0.2, 0.16, 0.05), lacquer, {
    position: [0, 2.52, -halfZ + 0.17], cast: false, name: 'Lacquer band',
  }));

  return { beamWood, darkWood, gold, lacquer, plaster };
}

function buildRoomFurnishings(root, palette) {
  const { beamWood, darkWood, gold, lacquer } = palette;
  const cream = material(0xe8dcc0, { roughness: 0.9 });

  // Low tea table on a deep-red rug, with a simple ceramic set.
  root.add(mesh(new THREE.CylinderGeometry(1.65, 1.65, 0.02, 28), material(0x6b2118, { roughness: 0.95 }), {
    position: [0.7, 0.018, 0.3], cast: false, name: 'Rug',
  }));
  root.add(mesh(new THREE.CylinderGeometry(1.68, 1.68, 0.012, 28), gold, {
    position: [0.7, 0.006, 0.3], cast: false, name: 'Rug gold ring',
  }));
  const table = new THREE.Group();
  table.name = 'Low table';
  table.position.set(0.7, 0, 0.3);
  table.add(mesh(new THREE.BoxGeometry(1.5, 0.07, 0.8), darkWood, { position: [0, 0.42, 0], name: 'Table top' }));
  table.add(mesh(new THREE.BoxGeometry(1.42, 0.03, 0.72), lacquer, { position: [0, 0.462, 0], cast: false, name: 'Table lacquer inlay' }));
  for (const [x, z] of [[-0.62, -0.3], [0.62, -0.3], [-0.62, 0.3], [0.62, 0.3]]) {
    table.add(mesh(new THREE.BoxGeometry(0.09, 0.4, 0.09), darkWood, { position: [x, 0.2, z] }));
  }
  table.add(mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.14, 12), cream, { position: [-0.22, 0.55, 0.05], name: 'Teapot' }));
  table.add(mesh(new THREE.CylinderGeometry(0.045, 0.038, 0.05, 10), cream, { position: [0.08, 0.51, -0.12], name: 'Tea cup' }));
  table.add(mesh(new THREE.CylinderGeometry(0.045, 0.038, 0.05, 10), cream, { position: [0.2, 0.51, 0.18], name: 'Tea cup' }));
  root.add(table);
  for (const [x, z] of [[0.7, 1.35], [0.7, -0.75]]) {
    root.add(mesh(new THREE.BoxGeometry(0.55, 0.09, 0.55), material(0x9a4a33, { roughness: 0.9 }), {
      position: [x, 0.045, z], cast: false, name: 'Floor cushion',
    }));
  }

  // Folding screen: three lacquered panels in a zigzag, gold borders.
  const screen = new THREE.Group();
  screen.name = 'Folding screen';
  screen.position.set(3.55, 0, -2.9);
  screen.rotation.y = -0.5;
  const panelAngles = [0.5, 0, -0.5];
  panelAngles.forEach((angle, index) => {
    const panel = new THREE.Group();
    panel.position.set((index - 1) * 0.86, 0, 0);
    panel.rotation.y = angle;
    panel.add(mesh(new THREE.BoxGeometry(0.9, 1.85, 0.045), lacquer, { position: [0, 0.985, 0], name: 'Screen panel' }));
    panel.add(mesh(new THREE.BoxGeometry(0.78, 1.7, 0.055), material(0xb03a28, { roughness: 0.6 }), {
      position: [0, 0.985, 0], cast: false, name: 'Screen panel inset',
    }));
    panel.add(mesh(new THREE.BoxGeometry(0.9, 0.05, 0.06), gold, { position: [0, 1.94, 0], cast: false }));
    panel.add(mesh(new THREE.BoxGeometry(0.9, 0.05, 0.06), gold, { position: [0, 0.06, 0], cast: false }));
    screen.add(panel);
  });
  root.add(screen);

  // Shelf alcove against the back wall: open shelving with ceramics.
  const shelfUnit = new THREE.Group();
  shelfUnit.name = 'Shelf alcove';
  shelfUnit.position.set(-2.6, 0, -3.7);
  shelfUnit.add(mesh(new THREE.BoxGeometry(2.4, 2.9, 0.08), darkWood, { position: [0, 1.45, -0.2], name: 'Shelf back' }));
  shelfUnit.add(mesh(new THREE.BoxGeometry(0.09, 2.9, 0.5), beamWood, { position: [-1.16, 1.45, 0] }));
  shelfUnit.add(mesh(new THREE.BoxGeometry(0.09, 2.9, 0.5), beamWood, { position: [1.16, 1.45, 0] }));
  shelfUnit.add(mesh(new THREE.BoxGeometry(0.09, 2.9, 0.5), beamWood, { position: [0, 1.45, 0] }));
  for (const y of [0.35, 1.05, 1.75, 2.45]) {
    shelfUnit.add(mesh(new THREE.BoxGeometry(2.32, 0.06, 0.48), beamWood, { position: [0, y, 0], name: 'Shelf' }));
  }
  shelfUnit.add(mesh(new THREE.BoxGeometry(2.4, 0.05, 0.52), gold, { position: [0, 2.92, 0], cast: false, name: 'Shelf gold cap' }));
  const vaseSpots = [
    [-0.6, 0.35, 0x7391b8, 0.14, 0.34], [0.55, 0.35, 0xb8683f, 0.11, 0.26],
    [-0.55, 1.05, 0xe8dcc0, 0.1, 0.3], [0.6, 1.05, 0x8c2f23, 0.13, 0.24],
    [-0.62, 1.75, 0xb8683f, 0.09, 0.22], [0.5, 1.75, 0x7391b8, 0.12, 0.3],
    [0.02, 2.45, 0xe8dcc0, 0.12, 0.26],
  ];
  for (const [x, shelfY, color, radius, tall] of vaseSpots) {
    shelfUnit.add(mesh(new THREE.CylinderGeometry(radius * 0.55, radius, tall, 10), material(color, { roughness: 0.55 }), {
      position: [x, shelfY + 0.03 + tall / 2, 0.05], name: 'Vase',
    }));
  }
  root.add(shelfUnit);

  // Hanging scroll between the alcove and the screen.
  root.add(mesh(new THREE.BoxGeometry(0.66, 1.5, 0.02), cream, {
    position: [0.9, 1.9, -3.85], cast: false, name: 'Hanging scroll',
  }));
  root.add(mesh(new THREE.BoxGeometry(0.72, 0.06, 0.04), lacquer, { position: [0.9, 2.68, -3.85], cast: false }));
  root.add(mesh(new THREE.BoxGeometry(0.72, 0.06, 0.04), lacquer, { position: [0.9, 1.12, -3.85], cast: false }));

  // Hanging paper lanterns: warm emissive bodies under the ceiling beams —
  // the visible sources for the paper-lantern fixtures AND the anchor
  // positions for the environment lamp rig.
  for (const [x, y, z] of LANTERN_SPOTS) {
    const lantern = new THREE.Group();
    lantern.name = 'Hanging lantern';
    lantern.position.set(x, y, z);
    lantern.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.7, 5), darkWood, { position: [0, 0.52, 0], cast: false, name: 'Lantern cord' }));
    lantern.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 12), darkWood, { position: [0, 0.19, 0], cast: false }));
    lantern.add(mesh(new THREE.CylinderGeometry(0.15, 0.13, 0.34, 14), material(0xffdca6, {
      emissive: 0xffb257, emissiveIntensity: 1.9, roughness: 0.4,
    }), { position: [0, 0, 0], cast: false, name: 'Lantern paper' }));
    lantern.add(mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.05, 12), darkWood, { position: [0, -0.19, 0], cast: false }));
    lantern.add(mesh(new THREE.BoxGeometry(0.04, 0.1, 0.04), gold, { position: [0, -0.27, 0], cast: false, name: 'Lantern tassel mount' }));
    lantern.add(mesh(new THREE.BoxGeometry(0.025, 0.16, 0.025), lacquer, { position: [0, -0.38, 0], cast: false, name: 'Lantern tassel' }));
    root.add(lantern);
  }
}

// Interior walk bounds: the room shell minus furniture blockers.
const INTERIOR_BLOCKERS = Object.freeze([
  { radius: 1.0, x: 0.7, z: 0.3 },   // low table
  { radius: 1.05, x: 3.55, z: -2.9 }, // folding screen
  { radius: 1.3, x: -2.6, z: -3.6 },  // shelf alcove
]);

function interiorMoveHorizontal(step, { walker }) {
  walker.position.x = THREE.MathUtils.clamp(walker.position.x + step.x, -ROOM.halfX + 0.55, ROOM.halfX - 0.55);
  walker.position.z = THREE.MathUtils.clamp(walker.position.z + step.z, -ROOM.halfZ + 0.55, ROOM.halfZ - 0.55);
  for (const blocker of INTERIOR_BLOCKERS) {
    const dx = walker.position.x - blocker.x;
    const dz = walker.position.z - blocker.z;
    const minDistance = blocker.radius + 0.3;
    const distance = Math.hypot(dx, dz);
    if (distance < minDistance) {
      const nx = distance < 1e-5 ? 1 : dx / distance;
      const nz = distance < 1e-5 ? 0 : dz / distance;
      walker.position.x = blocker.x + nx * minDistance;
      walker.position.z = blocker.z + nz * minDistance;
    }
  }
}

async function buildInterior({ renderer, scene }) {
  const root = new THREE.Group();
  root.name = 'Lighting Lab · Liyue-inspired interior';

  const palette = buildRoomShell(root);
  buildRoomFurnishings(root, palette);

  // The playground indoor pipeline over the original geometry: anime
  // environment shading (wrapped lighting, sky tints, height fog hooks) plus
  // the warm lamp rig anchored at the hanging lanterns. The rig parents to
  // this scene's root so the cached scene shows/hides as one unit; main.js
  // hands it to the lighting system via attach({ lampRig }) so the style's
  // fixtureScale drives the practicals through the day cycle.
  root.updateMatrixWorld(true);
  const environmentBox = new THREE.Box3().setFromObject(root);
  await applyEnvironmentShader(root, {
    environmentBox,
    features: { alphaCutout: false, foliageCutout: false },
    hasSun: true,
    parameters: {
      ambientStrength: 0.5,
      shadowTintColor: [0.72, 0.74, 0.9],
    },
    shaderMode: 'anime',
  });
  const lampRig = createEnvironmentLampRig({
    color: 0xffc27a,
    environmentBox,
    glow: { opacity: 0.16, sizeRatio: 0.02 },
    intensity: 1.5,
    positions: LANTERN_SPOTS.map(([x, y, z]) => new THREE.Vector3(x, y - 0.05, z)),
    scene: root,
    spot: { castShadow: false },
  });
  applyEnvironmentLampEmissive(root, 1);

  const walker = await createSceneWalker(root, {
    facing: 2.5,
    moveHorizontal: interiorMoveHorizontal,
    position: [-2.2, 2.2],
  });

  // The environment-shader materials sample the SHARED node-backend
  // sun-shadow map. Without a pass of its own, the interior would keep
  // reading whatever the shore scenes last rendered into it (stale tree
  // shadows smeared on the walls) — each scene refreshes the map while it
  // is the active one.
  const sunShadowPass = renderer?.isWebGPURenderer
    ? createEnvironmentSunShadowPass({ renderer, scene })
    : null;

  return {
    root,
    environmentRoot: root,
    attach: { lampRig },
    // Low dusk sun raking a small room needs a healthier normal bias than
    // the outdoor default or the walls pick up jagged self-shadow patterns.
    sunShadow: { bias: -0.0005, far: 80, normalBias: 0.08 },
    walker,
    update(delta) {
      walker?.update(delta);
      sunShadowPass?.update({ dynamic: true });
    },
    dispose() {
      sunShadowPass?.dispose();
      lampRig?.dispose();
    },
  };
}

// New scenes are added by appending to SCENES — the tab strip, placement
// tracking, lazy build cache, per-frame handle, and disposal in main.js are
// fully data-driven from this array.
export const SCENES = Object.freeze([
  {
    id: 'outdoor',
    label: 'Outdoor',
    camera: [0.7, 2.9, -9.6],
    target: [0.1, 1.2, -3.2],
    // Golden hour by default: warm light raking the bay is the hero read
    // (the ported stage matches with its 'sunset' environment preset).
    timeOfDay: 17.5,
    build: buildOutdoor,
    fixtures: [],
  },
  {
    id: 'night-camp',
    label: 'Night Camp',
    camera: [-4.6, 2.6, -9.4],
    target: [0.6, 0.95, -1.7],
    // Land at night so the campfire/lantern vocabulary carries the frame.
    timeOfDay: 21.5,
    build: buildNightCamp,
    // Campfire + shore lantern placements are computed against the terrain
    // in buildNightCamp and returned as instance fixtures.
    fixtures: [],
  },
  {
    id: 'interior',
    label: 'Interior',
    camera: [3.8, 2.1, 3.3],
    target: [-2.0, 1.25, -1.6],
    // Dusk by default so the practicals and the window glow read together.
    timeOfDay: 18.75,
    build: buildInterior,
    fixtures: [
      { fixture: 'window-glow', position: [-4.8, 1.9, -0.8], target: [0.7, 1.0, 0.3], seed: 41 },
      // Warm practicals at the hanging lanterns' paper bodies.
      { fixture: 'paper-lantern', position: [-1.7, 2.57, 0.5], seed: 42 },
      { fixture: 'paper-lantern', position: [2.1, 2.57, -1.3], seed: 43 },
      // A devotional flame on the tea table.
      { fixture: 'shrine-candle', position: [0.48, 0.62, 0.35], seed: 44 },
    ],
  },
]);
