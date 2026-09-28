// Azure Headland — authored instance dressing: the BranchTree ridge and grove,
// and the official catalog cliff set.
//
// Every object here comes from a first-party ToonLab system:
//   trees   parseBranchTreeDocument + createBranchTree  (src/vegetation/branchTree.js)
//           surfaced by setVegetationShader({ preset: 'call_me_sensei' })
//   cliffs  the §6.3 official catalog artifacts, surfaced through
//           createCatalogRockSurface + applyRockShader (src/rock-shader)
//
// Nothing in this file is a stand-in. The tree documents are the nine authored
// BranchTree recipes at assets-local/launch-world/trees/; the rock GLBs are the
// immutable catalog artifacts, and their surface completion is FILL-008, reused
// from labs/shared/azureHeadlandRocks.js rather than duplicated.
//
// PASS 2 exists because pass 1 shipped zero instances (§10.2 plans 26; the
// benchmark plate 09-beach-crowd-wide measures ~200). The counts below follow
// launch-plan/review/art-direction-parity-analysis.md §3 "Azure Headland":
// trees 24–30, rocks 9–12 in 3 clusters from 3 distinct base shapes, plus
// small boulders breaking the rock/sand seam.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

import { createBranchTree, parseBranchTreeDocument } from '../../../src/vegetation/branchTree.js';
import { applyRockShader } from '../../../src/rock-shader/rockShaderRuntime.js';
import {
  AZURE_HEADLAND_ROCKS,
  MOSS_ALBEDO_URL,
  resolveRockSurface,
} from '../../shared/azureHeadlandRocks.js';

import { headlandHeight, plantableMask, shoreZ, slopeAt } from './terrain.js';

const TREE_ROOT = '/assets-local/launch-world/trees';

// §6.1 / the tree documents' own `ridgeBearingDegrees`: the coast family leans
// downwind at 171.5deg, which matches the water's [0.15, -1.0] swell. The whole
// ridge therefore has to be yawed coherently — a per-instance random yaw would
// point a third of the ridge into the wind and destroy the read that the tree
// authoring exists to deliver. Jitter is +/-14deg around the bearing.
const RIDGE_BEARING_DEGREES = 171.5;

// ---------------------------------------------------------------------------
// Deterministic placement
// ---------------------------------------------------------------------------

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
// Trees
// ---------------------------------------------------------------------------

const TREE_DOCUMENTS = Object.freeze({
  'coast-a': Object.freeze(['TREE-COAST-HQ-A-V1', 'TREE-COAST-HQ-A-V2', 'TREE-COAST-HQ-A-V3']),
  'city-a': Object.freeze(['TREE-CITY-HQ-A-V1', 'TREE-CITY-HQ-A-V2', 'TREE-CITY-HQ-A-V3']),
  'city-b': Object.freeze(['TREE-CITY-HQ-B-V1', 'TREE-CITY-HQ-B-V2', 'TREE-CITY-HQ-B-V3']),
});

async function loadTreeDocument(id) {
  const response = await fetch(`${TREE_ROOT}/${id}.json`);
  if (!response.ok) throw new Error(`Tree document ${id} failed to load (${response.status}).`);
  const document = await response.json();
  return {
    assembly: document.launchWorld?.assembly ?? {},
    id,
    measured: document.launchWorld?.measured ?? {},
    settings: parseBranchTreeDocument(document),
  };
}

/**
 * The windswept ridge (§10.2) — extended from the plan's 9 to 16 so that no gap
 * between adjacent crowns exceeds 1.5 crown widths across the 160 m ridge,
 * which is the parity analysis's anti-repetition rule for this element class.
 *
 * PASS 2 fix: the ridge is authored in SHORELINE-RELATIVE coordinates, not in
 * world z. The authored waterline runs from z = +19 in the west bay to z = -28
 * at the eastern point, so a constant-z ridge line crossed the beach at one end
 * and sat 60 m behind the camera at the other. `shoreZ(x) + inland` keeps it
 * parallel to the coast, which is also what makes it read as a ridge.
 *
 * [x, inland, variant, scale]
 */
const RIDGE_LINE = Object.freeze([
  [-78, 48, 1, 1.02], [-69, 41, 2, 0.95], [-60, 50, 0, 1.06],
  [-51, 43, 2, 0.9], [-42, 52, 1, 1.0], [-33, 44, 0, 0.98],
  [-24, 50, 2, 1.04], [-15, 42, 1, 0.93], [-6, 49, 0, 1.08],
  [3, 43, 2, 0.97], [12, 51, 1, 1.02], [21, 44, 0, 0.94],
  [30, 49, 2, 1.05], [39, 42, 1, 0.99], [48, 47, 0, 1.03],
  [57, 40, 2, 0.96], [66, 46, 0, 1.03], [72, 39, 1, 0.98],
]);

/**
 * The sheltered park pocket (§10.2, "six TREE-CITY-01 instances"), extended to
 * 10 and tucked into the lee of the eastern bluff where the ridge trees would
 * have no wind justification for leaning. Same shoreline-relative frame.
 *
 * [x, inland, family, variant]
 */
const GROVE_CLUSTER = Object.freeze([
  [44, 62, 'city-b', 0], [52, 66, 'city-a', 1], [38, 70, 'city-b', 2],
  [57, 59, 'city-a', 0], [46, 56, 'city-b', 1], [61, 68, 'city-a', 2],
  [35, 60, 'city-a', 1], [54, 74, 'city-b', 0],
  [-40, 63, 'city-b', 2], [-33, 57, 'city-a', 0],
]);

/**
 * Builds and grounds every tree in the scene.
 *
 * @param {object} options
 * @param {{ place: Function }} options.surface  createSceneSurfaceRuntime handle
 * @param {THREE.Fog|null} [options.fog]
 */
export async function createCoastTrees({ surface, fog = null }) {
  const families = new Map();
  for (const [family, ids] of Object.entries(TREE_DOCUMENTS)) {
    families.set(family, await Promise.all(ids.map(loadTreeDocument)));
  }

  const group = new THREE.Group();
  group.name = 'Azure Headland · Trees';
  const random = rng(90_211);
  const instances = [];

  const build = (document, { x, z, scaleJitter, yawDegrees }) => {
    const tree = createBranchTree({
      ...document.settings,
      // Host-driven wind, matching the grass field and the swell direction.
      foliage: {
        windDirection: [0.15, -1.0],
        windSpeed: 0.85,
        windStrength: 0.16,
      },
      styleTarget: { targetId: `coast/tree-${document.id}-${instances.length}` },
    });
    tree.setVegetationShader({ preset: 'call_me_sensei' });
    if (fog) tree.setSceneFog(fog);

    const scale = (document.assembly.instanceScale ?? 1) * scaleJitter;
    tree.scale.setScalar(scale);
    tree.rotation.y = THREE.MathUtils.degToRad(yawDegrees);
    // `anchor: 'origin'` and then bury: the recipes measure their own bury
    // depth (the root flare's ground intersection), so seams are buried by the
    // authored terrain rather than hidden by scaling — §10.2's rule for rocks,
    // applied to trees for the same reason.
    surface.place(tree, { anchor: 'origin', x, z });
    tree.position.y -= (document.assembly.buryDepthMetres ?? 0) * scaleJitter;
    group.add(tree);
    instances.push({ id: document.id, scale, x, z });
    return tree;
  };

  for (const [x, inland, variant, scaleJitter] of RIDGE_LINE) {
    const document = families.get('coast-a')[variant];
    build(document, {
      scaleJitter,
      x,
      // Coherent downwind yaw with a narrow jitter band (see the constant).
      yawDegrees: RIDGE_BEARING_DEGREES + (random() - 0.5) * 28,
      z: shoreZ(x) + inland,
    });
  }

  for (const [x, inland, family, variant] of GROVE_CLUSTER) {
    const document = families.get(family)[variant];
    build(document, {
      scaleJitter: 0.92 + random() * 0.2,
      x,
      // The grove is sheltered, so it gets full yaw freedom — that is the
      // point of the contrast with the ridge.
      yawDegrees: random() * 360,
      z: shoreZ(x) + inland,
    });
  }

  return { group, instances, update: (delta) => { for (const child of group.children) child.update?.(delta); } };
}

// ---------------------------------------------------------------------------
// Cliffs
// ---------------------------------------------------------------------------

/**
 * Three clusters (§10.2 asks for two "discontinuous headland clusters"; the
 * parity analysis raises it to 3 clusters / 9–12 instances from 3 distinct base
 * shapes). `scale` stays inside §6.3's 0.92–1.08 band for every cliff-role
 * instance; the shoreline boulders below are a separate, declared class.
 */
const CLIFF_CLUSTERS = Object.freeze([
  // Eastern bluff shoulder — the terrain already rises to 7.4 m at x = 54.
  { id: 'rock-0119', scale: 1.06, x: 58, yaw: 24, z: -18 },
  { id: 'rock-0281', scale: 0.98, x: 64, yaw: 137, z: -12 },
  { id: 'rock-0119', scale: 0.93, x: 51, yaw: 212, z: -24 },
  { id: 'rock-0111', scale: 1.03, x: 68, yaw: 302, z: -21 },
  // Western bluff shoulder — the 4.6 m rise at x = -52.
  { id: 'rock-0111', scale: 1.05, x: -56, yaw: 61, z: 2 },
  { id: 'rock-0281', scale: 0.95, x: -49, yaw: 188, z: -4 },
  { id: 'rock-0119', scale: 1.0, x: -62, yaw: 274, z: -2 },
  // A third, low outcrop on the open beach between them — the discontinuity
  // §10.2 asks for, and the thing that stops the two bluffs reading as a pair.
  { id: 'rock-0281', scale: 1.07, x: 12, yaw: 41, z: -22 },
  { id: 'rock-0111', scale: 0.92, x: 19, yaw: 155, z: -26 },
  { id: 'rock-0119', scale: 0.96, x: 5, yaw: 249, z: -27 },
]);

/**
 * The foreground occluder (parity analysis: 18-30% of frame area, < 4 m from
 * camera, carrying readable human-scale construction).
 *
 * On a camera looking ALONG a coast, "inland" runs perpendicular to the view,
 * so any tree far enough inland to be plantable is also far enough sideways to
 * leave the frame. The near foreground on this hero is therefore the surf zone,
 * and the occluder is stone: two shoreline formations placed directly on the
 * hero camera's basis at 12 m and 16 m, one either side of the sightline.
 *
 * These carry the cliff-role scale band (§6.3, 0.92-1.08) because at 12 m they
 * are the most closely inspected geometry in the frame.
 */
const FOREGROUND_ROCKS = Object.freeze([
  { id: 'rock-0119', scale: 1.08, x: -47.8, yaw: 68, z: 7.3 },
  { id: 'rock-0281', scale: 1.04, x: -44.5, yaw: 214, z: 11.6 },
  { id: 'rock-0111', scale: 0.97, x: -41.3, yaw: 331, z: 17 },
]);

// Small boulders scattered along the wet-sand line, which is where the parity
// analysis puts them ("8–14 small boulders at the wet-sand line to break the
// rock/sand seam"). These are NOT cliff-role instances and deliberately sit
// outside §6.3's 0.92–1.08 scale band — uniform downscale, never stretch.
// Recorded as a declared deviation in docs/capability-status.md (D19-063).
const BOULDER_COUNT = 13;
const BOULDER_SCALE = Object.freeze([0.2, 0.42]);

function boulderPlacements() {
  const random = rng(4_711);
  const placements = [];
  for (let index = 0; index < BOULDER_COUNT; index += 1) {
    // Spread along the shoreline, sitting in the swash band where the wet-sand
    // memory will actually wash around them.
    const x = -84 + (index / (BOULDER_COUNT - 1)) * 168 + (random() - 0.5) * 9;
    const z = shoreZ(x) + (random() - 0.5) * 9 - 1.5;
    if (slopeAt(x, z) > 0.3) continue;
    placements.push({
      id: AZURE_HEADLAND_ROCKS[index % 3].id,
      scale: BOULDER_SCALE[0] + random() * (BOULDER_SCALE[1] - BOULDER_SCALE[0]),
      x,
      yaw: random() * 360,
      z,
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
 * Loads the §6.3 catalog cliffs and instances them across the three clusters.
 *
 * @param {object} options
 * @param {THREE.WebGPURenderer} options.renderer  required for KTX2 support detection
 * @param {{ place: Function }} options.surface
 */
export async function createCoastCliffs({ renderer, surface }) {
  const ktx2 = new KTX2Loader().setTranscoderPath('/basis/').setWorkerLimit(2).detectSupport(renderer);
  const gltfLoader = new GLTFLoader().setKTX2Loader(ktx2);
  const textureLoader = new THREE.TextureLoader();

  const mossTexture = await loadTexture(textureLoader, MOSS_ALBEDO_URL, { srgb: true });
  const textureCache = new Map();
  const prototypes = new Map();

  for (const rock of AZURE_HEADLAND_ROCKS) {
    const surfaceSpec = resolveRockSurface(rock);
    const gltf = await new Promise((resolve, reject) => {
      gltfLoader.load(rock.url, resolve, undefined, reject);
    });
    const root = gltf.scene;
    // The catalog packs all three LODs as sibling nodes; the launch frames are
    // hero stills, so LOD0 is pinned (the runtime LOD switch is a Gate 4 item).
    root.traverse((object) => {
      if (/_LOD\d$/.test(object.name)) object.visible = object.name.endsWith('_LOD0');
    });

    const textures = { moss: mossTexture };
    for (const [slot, url] of Object.entries(surfaceSpec.textureUrls)) {
      if (!textureCache.has(url)) {
        textureCache.set(url, await loadTexture(textureLoader, url, { srgb: slot === 'rock' }));
      }
      textures[slot] = textureCache.get(url);
    }
    applyRockShader(root, {
      preset: 'call_me_sensei',
      ...surfaceSpec.settings,
    }, {
      name: `ToonLab · ${rock.label}`,
      textures,
      variation: rock.variation,
    });
    prototypes.set(rock.id, root);
  }

  const group = new THREE.Group();
  group.name = 'Azure Headland · Cliffs';
  const placements = [...CLIFF_CLUSTERS, ...FOREGROUND_ROCKS, ...boulderPlacements()];
  for (const [index, placement] of placements.entries()) {
    const prototype = prototypes.get(placement.id);
    // Clone shares geometry and materials — 23 instances cost 3 material
    // compiles, not 23.
    const instance = prototype.clone(true);
    instance.name = `${placement.id}-${index}`;
    instance.scale.setScalar(placement.scale);
    instance.rotation.y = THREE.MathUtils.degToRad(placement.yaw);
    instance.traverse((object) => {
      if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; }
    });
    // `anchor: 'bounds'` grounds by Box3.min.y, so seams are buried by the
    // authored terrain rather than hidden by scaling (§10.2).
    surface.place(instance, { anchor: 'bounds', offset: -0.28 * placement.scale, x: placement.x, z: placement.z });
    group.add(instance);
  }

  return {
    boulderCount: placements.length - CLIFF_CLUSTERS.length - FOREGROUND_ROCKS.length,
    cliffCount: CLIFF_CLUSTERS.length + FOREGROUND_ROCKS.length,
    group,
  };
}

export { plantableMask, headlandHeight };
