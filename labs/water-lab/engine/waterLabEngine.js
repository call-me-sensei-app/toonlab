// Water Shader Lab: spectral open water, conservative beach/river cases,
// and an optical tank. Reference and stylized views share the same sampled
// surface. Terrain vertices, CPU contacts, and wet/dry state stay registered.
// Stage/bed changes restart the finite-domain experiment; changes in visual
// treatment preserve its state. See docs/water.md.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import {
  createWaterShoreMaterial,
  updateWaterShoreMaterial,
  WaterKelpField,
  WaterRain,
  WaterSurface,
} from '../../../src/water/index.js';
import { createFauna } from '../../../src/fauna/index.js';
import { createRockDocument, meshDocument } from '../../../src/rockgen/index.js';
import { createLabRenderer, whenRendererReady } from '../../shared/rendererFactory.js';
import { createCinematicWaterLighting } from '../experiments/cinematicLighting.js';
import { EXPERIMENT_STAGES, isWaterExperiment } from '../experiments/experimentModels.js';
import { createSurfScene, createWaterfallScene, createGlassScene, makeWaterMaterial } from '../experiments/experimentScenes.js';

// Keep every animated edge well beyond the normal orbit camera and the start
// of the horizon fog. Geometry density is capped independently below, so this
// fixes the visible 72 m tile boundary without tripling tessellation density.
const WATER_SIZE = 180;
const BALL_LIMIT = 10;
const SHIP_URL = '/assets-local/props/dutch_ship_medium/dutch_ship_medium_1k.gltf';
const FERN_URL = '/water-lab/cc0/quaternius/fern-1.glb';
const SAND_TEXTURE_URLS = Object.freeze({
  albedo: '/water-lab/cc0/polyhaven/coast-sand-01-diff-1k.jpg',
  arm: '/water-lab/cc0/polyhaven/coast-sand-01-arm-1k.jpg',
  normal: '/water-lab/cc0/polyhaven/coast-sand-01-nor-gl-1k.jpg',
});
// The ground plane spans 220 m; 64 repeats makes each scan tile about 3.4 m.
const SAND_TEXTURE_REPEAT = 64;
const CAMERA_MOUSE_BUTTONS = Object.freeze({
  pan: THREE.MOUSE.PAN,
  rotate: THREE.MOUSE.ROTATE,
  zoom: THREE.MOUSE.DOLLY,
});

// Deterministic hash noise (FallbackRockCluster pattern) — stage placements
// are identical on every load, so captures stay comparable.
function hash01(seed) {
  const n = Math.sin(seed * 91.7 + 12.9898) * 43758.5453;
  return n - Math.floor(n);
}

// --- stage grounds -----------------------------------------------------------

// The swash test: rest waterline at z=0 (level 0.36) on a measured 1:20
// profile. Incoming wave flux supplies water; reach is an output of the
// depth/momentum solve, not a prescribed excursion.
export function beachBedHeight(x, z) {
  const slopePart = 0.36 + z * 0.05;
  // Keep the complete z=-10..10 measurement beach on one 1:20 plane. The
  // previous deep-water blend started at z=-3, so the nominal 10 m drain ran
  // into a 1:4 shelf and could never represent a symmetric 20 m excursion.
  // Only steepen after the measured beach has ended.
  const deepPart = -0.24 + (z + 12) * 0.18;
  const base = THREE.MathUtils.lerp(
    deepPart,
    slopePart,
    THREE.MathUtils.smoothstep(z, -14, -11),
  );
  // This is a calibration beach, so its cross-shore profile must stay
  // monotonic. The old 14 cm relief was four times deeper than the rendered
  // swash film and punched dry islands through it. Sand detail remains in the
  // material/lighting while the geometry gives an exact distance reference.
  return base;
}

// Beach on +Z rising ~2.2 m above the default waterline, ~5.6 m deep on -Z.
export function basinBedHeight(x, z) {
  const t = THREE.MathUtils.smoothstep(z, -16, 12);
  const base = THREE.MathUtils.lerp(-5.6, 2.2, t);
  const swell = 0.4 * Math.sin(x * 0.32 + 1.7) * Math.cos(z * 0.21) * (1 - t * 0.55);
  return base + swell;
}

// Open water: deep everywhere plus one small island — the only land, so
// ocean/storm swell reads as a real body of water (and still has one shore
// to break against).
export function openBedHeight(x, z) {
  const dx = x + 11;
  const dz = z + 13;
  const island = 10.5 * Math.exp(-(dx * dx + dz * dz) / (2 * 6 * 6));
  return -7.5 + 0.4 * Math.sin(x * 0.18) * Math.cos(z * 0.2) + island;
}

// Two straight reaches isolate current behavior at known depths. Flow is +X;
// both banks are parallel to it. These are channel tests, not rapids/obstacle
// hydraulics: the current renderer has no pressure or discharge solver.
export function riverBedHeight(x, z) {
  const bank = THREE.MathUtils.smoothstep(Math.abs(z + 5), 3.5, 8);
  return THREE.MathUtils.lerp(-1.6, 2.2, bank);
}

export function narrowingRiverBedHeight(x, z) {
  const halfWidth = 3.8 - 1.8 * Math.exp(-(x*x)/60);
  return THREE.MathUtils.lerp(-1.6, 2.2, THREE.MathUtils.smoothstep(Math.abs(z+5), halfWidth, halfWidth+3));
}
export function obstacleRiverBedHeight(x, z) {
  return riverBedHeight(x,z) + 2.6*Math.exp(-(x*x+(z+5)*(z+5))/3.5);
}

export function shallowRiverBedHeight(x, z) {
  const bank = THREE.MathUtils.smoothstep(Math.abs(z + 5), 2, 6);
  return THREE.MathUtils.lerp(-0.15, 2.2, bank);
}

export const WATER_LAB_STAGES = Object.freeze([
  ...EXPERIMENT_STAGES,
  Object.freeze({ id: 'tank', label: 'Still-water optical tank' }),
  Object.freeze({ id: 'beach', label: 'Beach (swash)' }),
  Object.freeze({ id: 'shore', label: 'Shore basin' }),
  Object.freeze({ id: 'open', label: 'Open water (ship)' }),
  Object.freeze({ id: 'river', label: 'River · deep reach' }),
  Object.freeze({ id: 'river-shallow', label: 'River · shallow reach' }),
  Object.freeze({ id: 'river-narrowing', label: 'River · narrowing' }),
  Object.freeze({ id: 'river-obstacle', label: 'River · island wake' }),
]);

// Presets choose an appropriate test: river flows down a channel, coast
// uses the calibration beach, and ocean/storm use open water.
export const STAGE_BY_PRESET = Object.freeze({
  calm: 'shore',
  coast: 'beach',
  lake: 'shore',
  mirror: 'shore',
  ocean: 'open',
  river: 'river',
  storm: 'open',
});

const STAGE_DEFINITIONS = {
  tank: {
    bed: () => -3,
    boat: false,
    camera: { position: [9, 6, 12], target: [0, 0, 0] },
    kelpBand: null, fernPatches: [],
    rockSpots: [],
    underwater: { position: [3, -1.5, 1], floorPosition: [8,-1.5,8], target: [0, -1.5, -3], targetFraction: 0.5 },
  },
  river: {
    bed: riverBedHeight,
    boat: false,
    camera: { position: [15, 7, 12], target: [0, 0.2, -5] },
    kelpBand: [-7, -3],
    fernPatches: [{ count: 4, radius: 1.2, scale: 0.8, seed: 201, x: 0, z: -5 }],
    rockSpots: [
      { scale: 0.8, seed: 202, x: -5, z: 1 },
      { scale: 1, seed: 203, x: 6, z: -11 },
    ],
    underwater: { position: [4, -0.5, -5], target: [0, -1.1, -5] },
  },
  'river-shallow': {
    bed: shallowRiverBedHeight,
    boat: false,
    camera: { position: [12, 5, 9], target: [0, 0.2, -5] },
    kelpBand: [-6, -4],
    fernPatches: [],
    rockSpots: [
      { scale: 0.7, seed: 211, x: -5, z: -1 },
      { scale: 0.8, seed: 212, x: 5, z: -9 },
    ],
    underwater: { position: [3, 0.12, -5], target: [0, -0.05, -5] },
  },
  'river-narrowing': {
    bed: narrowingRiverBedHeight, boat: false,
    camera: { position: [13, 9, 12], target: [0, 0.2, -5] },
    kelpBand: [-6,-4], fernPatches: [], rockSpots: [],
    underwater: { position: [-4,-0.5,-5], target: [0,-1,-5] },
  },
  'river-obstacle': {
    bed: obstacleRiverBedHeight, boat: false,
    camera: { position: [13, 9, 12], target: [0, 0.2, -5] },
    kelpBand: [-6,-4], fernPatches: [], rockSpots: [],
    underwater: { position: [5,-0.5,-5], target: [2,-1,-5] },
  },
  beach: {
    bed: beachBedHeight,
    boat: false,
    camera: { position: [5, 4.5, 15], target: [0, 0.2, 1] },
    underwater: { position: [1.2,-0.5,-19], target: [0,-1,-18.8], targetFraction: -0.1 },
    // Keep vegetation behind the breaker so it cannot visually split the
    // surf transition into a second system.
    kelpBand: [-26, -13],
    fernPatches: [
      { count: 5, radius: 3.2, scale: 0.9, seed: 181, x: -7.5, z: -18 },
      { count: 5, radius: 3.6, scale: 1.0, seed: 182, x: 6.5, z: -21 },
    ],
    rockSpots: [
      { scale: 1.15, seed: 81, x: -4.5, z: 6.5 },
      { scale: 0.9, seed: 82, x: 6.2, z: 3.2 },
      { scale: 1.5, seed: 83, x: 1.5, z: -4.5 },
    ],
  },
  shore: {
    bed: basinBedHeight,
    boat: false,
    camera: { position: [12, 6.5, 19], target: [-1, 0.3, -5] },
    kelpBand: [-14, -2],
    fernPatches: [
      { count: 5, radius: 2.8, scale: 0.9, seed: 171, x: -7.5, z: -5.5 },
      { count: 6, radius: 3.5, scale: 1.05, seed: 172, x: 5.5, z: -9.5 },
      { count: 4, radius: 2.6, scale: 0.8, seed: 173, x: -2.5, z: -14 },
    ],
    rockSpots: [
      { scale: 1.6, seed: 71, x: 5.5, z: 4.8 },
      { scale: 1.3, seed: 72, x: -3.2, z: -0.8 },
      { scale: 1.8, seed: 73, x: 4.2, z: -7.2 },
      { scale: 2.2, seed: 74, x: -7.0, z: -12.5 },
    ],
  },
  open: {
    bed: openBedHeight,
    boat: true,
    // Zoomed out: the swell should read as a body of water, not a pond.
    camera: { position: [20, 11, 30], target: [0, 0.5, -4] },
    kelpBand: null,
    fernPatches: [
      { count: 5, radius: 2.8, scale: 1.0, seed: 191, x: -3.5, z: -13 },
      { count: 5, radius: 2.8, scale: 0.9, seed: 192, x: -18.5, z: -12.5 },
      { count: 4, radius: 3.2, scale: 1.1, seed: 193, x: 4.5, z: -4 },
    ],
    // Dress the islet's shore so it reads as land, not a sand blob.
    rockSpots: [
      { scale: 1.5, seed: 91, x: -8.2, z: -10.8 },
      { scale: 1.1, seed: 92, x: -13.6, z: -15.6 },
      { scale: 0.85, seed: 93, x: -9.4, z: -15.2 },
    ],
  },
};

export function waterLabGrid(stageId) {
  // Resolve centimetre-deep run-up across 25 cm cells; the generic metre
  // grid dissipated incoming bores before they could climb the beach.
  if (stageId === 'beach') return { width: 96, depth: 48, centerX: 0, centerZ: -8, columns: 65, rows: 193 };

  const size = stageId === 'open' ? WATER_SIZE : 96;
  return { width: size, depth: size, centerX: 0, centerZ: stageId === 'open' ? -40 : -20,
    columns: stageId === 'open' ? 128 : 80, rows: 96 };
}

export function waterLabFishBounds(stageId) {
  // The generic box stopped at z=-15, exactly where this beach first
  // reaches spawn depth. Shallow escape then pinned every fish to that wall.
  if(stageId==='beach')return {min:{x:-16,z:-29},max:{x:16,z:-16}};
  return {x:15,z:15};
}

export function buildBedMesh(waterLevel, bed, material, grid = waterLabGrid('shore')) {
  // Reuse every solved water vertex and diagonal in the bed mesh. A separate
  // coarse terrain grid can otherwise show water floating above a bank even
  // when the solver's own depths are positive and conservative.
  const axis = (center, size, count) => {
    const low=center-size/2, high=center+size/2;
    return [low-500,low-150,low-25,...Array.from({length:count},(_,i)=>low+i*size/(count-1)),high+25,high+150,high+500];
  };
  const xs=axis(grid.centerX,grid.width,grid.columns),zs=axis(grid.centerZ,grid.depth,grid.rows);
  const geometry = new THREE.PlaneGeometry(1, 1, xs.length-1, zs.length-1);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  for (let z=0;z<zs.length;z++) for (let x=0;x<xs.length;x++) {
    const i=z*xs.length+x;
    positions.setX(i,xs[x]); positions.setZ(i,zs[z]);
    geometry.attributes.uv.setXY(i,xs[x]/(WATER_SIZE+40)+0.5,zs[z]/(WATER_SIZE+40)+0.5);
  }
  const colors = new Float32Array(positions.count * 3);
  const sand = new THREE.Color(0.87, 0.78, 0.57);
  const shallows = new THREE.Color(0.62, 0.6, 0.45);
  const rock = new THREE.Color(0.17, 0.24, 0.27);
  const color = new THREE.Color();
  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    const height = bed(x, z);
    positions.setY(i, height);
    const depth = waterLevel - height;
    if (depth <= 0.25) {
      // Author a dry base only. The shared persistent shoreline field owns
      // inundation, moisture, sheen, and stranded foam at runtime, so the
      // exposed beach no longer snaps between a static dark stripe and water.
      color.copy(sand);
    } else if (depth < 2.2) {
      color.copy(shallows).lerp(sand, 1 - (depth - 0.25) / 1.95);
    } else {
      color.copy(rock).lerp(shallows, Math.max(0, 1 - (depth - 2.2) / 3));
    }
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material);
}

// See-through test rocks (rockgen river boulders) stepping down the ground so
// refraction, depth fade, and caustics can be judged at known depths. They are
// lab gauges rather than authored hero props: mesh one deterministic boulder
// once, then vary its proportions and rotation. Regenerating 3–4 complete
// rockgen documents on every Ground selection was the remaining input stall.
let sharedDepthRockGeometry = null;
function getSharedDepthRockGeometry() {
  if (sharedDepthRockGeometry) return sharedDepthRockGeometry;
  const document = createRockDocument({ preset: 'river-boulder', seed: 37 });
  sharedDepthRockGeometry = meshDocument(document);
  sharedDepthRockGeometry.computeBoundingBox();
  return sharedDepthRockGeometry;
}

function buildRocks(spots, bed) {
  const group = new THREE.Group();
  group.name = 'WaterLabRocks';
  const geometry = getSharedDepthRockGeometry();
  const material = new THREE.MeshStandardMaterial({ roughness: 0.9, vertexColors: true });
  for (const spot of spots) {
    const mesh = new THREE.Mesh(geometry, material);
    const scaleX = spot.scale * THREE.MathUtils.lerp(0.82, 1.18, hash01(spot.seed + 0.41));
    const scaleY = spot.scale * THREE.MathUtils.lerp(0.82, 1.12, hash01(spot.seed + 1.73));
    const scaleZ = spot.scale * THREE.MathUtils.lerp(0.84, 1.2, hash01(spot.seed + 2.97));
    mesh.scale.set(scaleX, scaleY, scaleZ);
    mesh.rotation.y = hash01(spot.seed) * Math.PI * 2;
    // Settle the boulder into the bed instead of perching it on top.
    mesh.position.set(
      spot.x,
      bed(spot.x, spot.z) - geometry.boundingBox.min.y * scaleY - 0.25 * spot.scale,
      spot.z,
    );
    group.add(mesh);
  }
  return group;
}

// Small fixed markers at 0/2/4/6 m make the wet edge's travel apparent.
function addBeachGauges(group) {
  const geometry = new THREE.CylinderGeometry(0.035, 0.035, 0.3, 8);
  const material = new THREE.MeshStandardMaterial({ color: 0xe9dfc7, roughness: 0.8 });
  for (const x of [-7, 7]) for (const z of [0, 2, 4, 6]) {
    const marker = new THREE.Mesh(geometry, material);
    marker.position.set(x, beachBedHeight(x,z) + 0.1, z);
    marker.userData.waterLabOwnedGeometry = true;
    group.add(marker);
  }
}

// Known-size optical gauges: 50 cm bands cross the waterline, while coloured
// targets at 0.5/1.5/2.5 m let refraction and attenuation be inspected directly.
function addTankGauges(group, waterLevel) {
  const poleGeometry = new THREE.CylinderGeometry(0.045, 0.045, 0.5, 12);
  const targetGeometry = new THREE.BoxGeometry(0.4, 0.4, 0.4);
  const colors = [0xd94332, 0xe5b844, 0x467ccd];
  colors.forEach((color,index) => {
    const paint = new THREE.MeshStandardMaterial({color,roughness:0.65});
    const white = new THREE.MeshStandardMaterial({color:0xf3f0e4,roughness:0.65});
    for(let band=0;band<9;band++) {
      const mesh=new THREE.Mesh(poleGeometry,band%2?paint:white);
      mesh.position.set((index-1)*3, -2.75+band*0.5, -3);
      mesh.userData.waterLabOwnedGeometry=true;group.add(mesh);
    }
    for(const depth of [0.5,1.5,2.5]) {
      const mesh=new THREE.Mesh(targetGeometry,paint);
      mesh.position.set((index-1)*3+0.6,waterLevel-depth,-3);
      mesh.userData.waterLabOwnedGeometry=true;group.add(mesh);
    }
  });
}

// Flow-reactive kelp bed — the visible readout for flowDirection/flowSpeed.
function buildKelp(count, band, bed, waterLevel, fernPatches = []) {
  if (count <= 0 || !band) return null;
  const placements = [];
  for (let i = 0; i < count; i += 1) {
    const x = (hash01(i * 3 + 1) - 0.5) * 30;
    const z = THREE.MathUtils.lerp(band[0], band[1], hash01(i * 3 + 2));
    const overlapsHeroPatch = fernPatches.some((patch) => (
      Math.hypot(x - patch.x, z - patch.z) < patch.radius * 1.15
    ));
    if (overlapsHeroPatch) continue;
    const bedY = bed(x, z);
    const depth = waterLevel - bedY;
    if (depth < 0.35) continue; // no blades on dry sand
    placements.push({
      // Blades stay submerged: cap the height by the local water column.
      height: Math.min(0.55 + hash01(i * 3 + 3) * 0.85, depth * 0.85),
      width: 0.06 + hash01(i * 3 + 4) * 0.07,
      x,
      y: bedY,
      z,
    });
  }
  if (placements.length === 0) return null;
  return new WaterKelpField({
    kelpColor: [0.24, 0.58, 0.38],
    kelpShadeColor: [0.07, 0.24, 0.22],
    placements,
    swayAmplitude: 0.18,
  });
}

// The ToonLab catalog's Quaternius Fern 1 is deliberately treated as a
// stylized sea fern, not a botanical claim. Sparse hero clusters add readable
// silhouette/scale while the procedural kelp remains the dense flow readout.
function buildSeaFerns(template, patches, plantCount, bed, waterLevel) {
  if (!template || plantCount <= 0 || !patches?.length) return null;
  const group = new THREE.Group();
  group.name = 'WaterLabSeaFerns';
  const density = THREE.MathUtils.clamp(plantCount / 60, 0, 2);
  const sourceMinY = template.userData.sourceMinY ?? 0;
  const sourceHeight = Math.max(template.userData.sourceHeight ?? 0.84, 1e-3);

  patches.forEach((patch) => {
    const count = Math.max(0, Math.round(patch.count * density));
    for (let i = 0; i < count; i += 1) {
      const seed = patch.seed + i * 19.37;
      const angle = hash01(seed + 0.17) * Math.PI * 2;
      const radius = Math.sqrt(hash01(seed + 1.31)) * patch.radius;
      const x = patch.x + Math.cos(angle) * radius;
      const z = patch.z + Math.sin(angle) * radius;
      const bedY = bed(x, z);
      const depth = waterLevel - bedY;
      if (depth < 0.48) continue;

      const desiredScale = patch.scale * THREE.MathUtils.lerp(
        0.72,
        1.28,
        hash01(seed + 2.63),
      );
      const scale = Math.min(desiredScale, depth * 0.78 / sourceHeight);
      if (scale < 0.22) continue;

      const pivot = new THREE.Group();
      const fern = template.clone(true);
      fern.scale.setScalar(scale);
      fern.position.y = -sourceMinY * scale - 0.025;
      pivot.position.set(x, bedY, z);
      pivot.rotation.y = hash01(seed + 4.11) * Math.PI * 2;
      pivot.userData.baseYaw = pivot.rotation.y;
      pivot.userData.phase = hash01(seed + 5.37) * Math.PI * 2;
      pivot.userData.swayScale = THREE.MathUtils.lerp(0.7, 1.2, hash01(seed + 7.03));
      pivot.add(fern);
      group.add(pivot);
    }
  });

  return group.children.length ? group : null;
}

function updateSeaFerns(group, time, settings) {
  if (!group) return;
  const flow = settings.flowDirection ?? [1, 0];
  const length = Math.hypot(flow[0] ?? 0, flow[1] ?? 0) || 1;
  const flowX = (flow[0] ?? 0) / length;
  const flowZ = (flow[1] ?? 0) / length;
  const speed = 0.48 + Math.min(settings.flowSpeed ?? 0, 4) * 0.34;
  const amplitude = 0.035 + Math.min(settings.flowSpeed ?? 0, 4) * 0.018;
  group.children.forEach((pivot) => {
    const sway = Math.sin(time * speed + pivot.userData.phase)
      * amplitude * pivot.userData.swayScale;
    pivot.rotation.set(
      sway * flowZ,
      pivot.userData.baseYaw,
      -sway * flowX,
    );
  });
}

// Low-poly toon boat stand-in for fresh clones without assets-local/ (the
// PhotoscanProps/FallbackRockCluster pattern).
function buildFallbackBoat() {
  const group = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x6d4a30, roughness: 0.8 });
  const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), wood);
  hull.scale.set(4.6, 1.1, 1.7);
  hull.position.y = 0.15;
  const cut = new THREE.Mesh(new THREE.BoxGeometry(9.4, 1.6, 3.6), new THREE.MeshStandardMaterial({ color: 0x4e3520, roughness: 0.85 }));
  cut.position.y = 1.05;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 6.4, 8), wood);
  mast.position.y = 3.2;
  const sail = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 3.4),
    new THREE.MeshStandardMaterial({ color: 0xf2ecdc, roughness: 0.9, side: THREE.DoubleSide }),
  );
  sail.position.set(0.2, 3.6, 0);
  sail.rotation.y = Math.PI / 2;
  group.add(hull, mast, sail);
  const clip = new THREE.Group();
  clip.add(group);
  // Fake keel line so buoyancy math has a draft to work with.
  clip.userData.draft = 0.55;
  clip.userData.halfLength = 4.2;
  clip.userData.halfBeam = 1.5;
  return clip;
}

function buildSkyGradient() {
  // A world-oriented sky is essential for refracted directions. A 2D screen
  // gradient caused a rectangular seam where the Snell window left the grab.
  const faces = Array.from({ length: 6 }, () => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128; return canvas;
  });
  const texture = new THREE.CubeTexture(faces);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function paintSkyGradient(texture, zenith, horizon, settings) {
  const signature = JSON.stringify([zenith,horizon,settings.sunDirection,settings.sunColor,settings.sunGlowStrength]);
  if (texture.userData.skySignature === signature) return;
  texture.userData.skySignature = signature;
  const top = new THREE.Color().setRGB(...zenith, THREE.SRGBColorSpace);
  const low = new THREE.Color().setRGB(...horizon, THREE.SRGBColorSpace);
  const sun = new THREE.Color().setRGB(...settings.sunColor, THREE.SRGBColorSpace);
  const direction = new THREE.Vector3(...settings.sunDirection).normalize();
  const ray = new THREE.Vector3(), color = new THREE.Color();
  texture.images.forEach((canvas, face) => {
    const ctx=canvas.getContext('2d'), pixels=ctx.createImageData(128,128);
    for(let y=0;y<128;y++)for(let x=0;x<128;x++) {
      const u=(x+0.5)/64-1,v=(y+0.5)/64-1;
      if(face===0)ray.set(1,-v,-u); else if(face===1)ray.set(-1,-v,u);
      else if(face===2)ray.set(u,1,v); else if(face===3)ray.set(u,-1,-v);
      else if(face===4)ray.set(u,-v,1); else ray.set(-u,-v,-1);
      ray.normalize();
      const t=Math.pow(Math.max(ray.y,0),0.55),glow=Math.pow(Math.max(ray.dot(direction),0),180)*settings.sunGlowStrength;
      color.copy(low).lerp(top,t); color.r+=sun.r*glow; color.g+=sun.g*glow; color.b+=sun.b*glow; color.convertLinearToSRGB();
      const i=(y*128+x)*4;
      pixels.data[i]=Math.round(Math.min(1,color.r)*255);pixels.data[i+1]=Math.round(Math.min(1,color.g)*255);pixels.data[i+2]=Math.round(Math.min(1,color.b)*255);pixels.data[i+3]=255;
    }
    ctx.putImageData(pixels,0,0);
  });
  texture.needsUpdate=true;
}

export function createWaterLabEngine({ mount, store }) {
  document.body.dataset.scene = 'water-lab';
  document.body.dataset.modelReady = 'false';
  document.body.dataset.waterReady = 'false';

  const renderer = createLabRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const sky = buildSkyGradient();
  scene.background = sky;
  const initialWaterSettings = store.getState().settings;
  // This is the lab's ordinary air-side horizon haze. WaterSurface now saves
  // and restores it around capture passes and owns the submerged atmosphere.
  scene.fog = new THREE.Fog(
    new THREE.Color(...initialWaterSettings.skyHorizonColor),
    55,
    150,
  );

  let stageId = store.getState().view.stage;
  let activeExperiment = null, experimentRoot = null, experimentMaterial = null, experimentStats = {};
  let lastExperimentSettings = store.getState().experimentSettings;
  let experimentRebuildTimer = null;
  let experimentReference = false;
  const stage = () => STAGE_DEFINITIONS[stageId] ?? STAGE_DEFINITIONS.shore;
  const bedAt = (x, z) => stage().bed(x, z);

  const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 800);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  // Match the other designer labs explicitly: changing the left-drag mode
  // must never disable the two camera actions that stay on wheel/right-drag.
  controls.enablePan = true;
  controls.enableRotate = true;
  controls.enableZoom = true;
  controls.minDistance = 2;
  // Keep the designer camera inside the fully animated 180 m tile. The far
  // skirt is a horizon safety net, not a second inspectable water system;
  // unbounded pan/zoom could previously put the camera beyond the detailed
  // mesh and expose its lower, flat edge as an obvious rectangular cutoff.
  controls.maxDistance = 65;
  controls.maxTargetRadius = 34;
  controls.screenSpacePanning = true;
  controls.zoomToCursor = true;
  let cameraInspectionMode = 'stage';
  function setCameraMode(mode) {
    const next = CAMERA_MOUSE_BUTTONS[mode] === undefined ? 'rotate' : mode;
    controls.mouseButtons.LEFT = CAMERA_MOUSE_BUTTONS[next];
    return next;
  }
  setCameraMode('rotate');
  function resetCamera() {
    cameraInspectionMode = 'stage';
    controls.minDistance = 2;
    controls.maxDistance = 65;
    const framing = activeExperiment ? {position:activeExperiment.camera,target:activeExperiment.target} : stage().camera;
    camera.position.set(...framing.position);
    controls.target.set(...framing.target);
    // OrbitControls clamps pan around cursor. Recenter that sphere for each
    // stage so Beach, basin, and open-water inspection all retain a useful
    // 68 m pan diameter without ever reaching the simulation boundary.
    controls.cursor.copy(controls.target);
    controls.update();
  }
  function setCameraView(view) {
    if (activeExperiment) {
      const key = view === 'overview' ? 'overview' : view === 'underwater-floor' ? 'side' : 'barrel';
      const framing = activeExperiment.getView?.(key)??activeExperiment.views[key];
      if(key==='barrel'&&activeExperiment.getView)store.actions.setView({paused:true});
      camera.position.set(...framing.position);controls.target.set(...framing.target);
      controls.minDistance=.2;controls.cursor.copy(controls.target);controls.update();
      return view;
    }
    if (view === 'close-up') {
      cameraInspectionMode=view;
      controls.minDistance=.15;
      const edge=stageId==='beach' ? water?.dynamics?.shoreEdgeAt() : null;
      const x=edge==null?controls.target.x:0,z=edge==null?controls.target.z:edge-.4;
      const y=water?.getHeightAt(x,z)??store.getState().settings.waterLevel;
      controls.target.set(x,y,z);
      camera.position.set(x+1.6,y+1.8,z+3.1);
      controls.cursor.copy(controls.target);
      controls.update();
      return view;
    }
    if (view === 'overview') {
      cameraInspectionMode = view;
      controls.maxDistance = 160;
      const grid=waterLabGrid(stageId), x=stageId==='beach'?20:0;
      const z=stageId==='beach'?-20:grid.centerZ;
      controls.target.set(x,store.getState().settings.waterLevel,z);
      camera.position.set(x,stageId==='beach'?110:35,z+0.1);
      controls.cursor.copy(controls.target);
      controls.update();
      return view;
    }
    if (view !== 'underwater-up' && view !== 'underwater-floor') {
      resetCamera();
      return 'stage';
    }
    const waterY = store.getState().settings.waterLevel;
    cameraInspectionMode = view;
    controls.minDistance = 0.15;
    if (stage().underwater) {
      const framing = stage().underwater;
      const position = view === 'underwater-floor' ? (framing.floorPosition ?? framing.position) : framing.position;
      const bedY = bedAt(position[0], position[2]);
      const column = Math.max(waterY - bedY, 0.05);
      camera.position.set(position[0], bedY + column * 0.5, position[2]);
      controls.target.set(framing.target[0], view === 'underwater-up'
        ? waterY + column : bedY + column * (framing.targetFraction ?? 0.15), framing.target[2]);
      controls.cursor.copy(controls.target);
      controls.update();
      return view;
    }
    if (view === 'underwater-up') {
      // Look decisively upward: the whole viewport intersects the nearby
      // surface, exposing the Snell window without grazing rays running all
      // the way to the finite lab tile's far edge. Anchor offshore so the
      // signed shoreline clipping cannot masquerade as a missing water tile.
      const patch = stage().fernPatches?.[stageId === 'open' ? 2 : 1]
        ?? stage().fernPatches?.[0]
        ?? { x: 0, z: -10 };
      camera.position.set(patch.x + 2.5, waterY - 1.2, patch.z + 3.5);
      controls.target.set(patch.x, waterY + 1.4, patch.z);
    } else {
      // Frame a planted patch across the bottom instead of pointing almost
      // straight down at one flat square metre. This makes albedo, normals,
      // caustics, rocks, and plant scale readable in the same inspection view.
      const patch = stage().fernPatches?.[stageId === 'open' ? 2 : 1]
        ?? stage().fernPatches?.[0]
        ?? { x: 0, z: -8 };
      const cameraX = patch.x + 4.2;
      let cameraZ = patch.z + 6;
      // Grounds have different profiles. Walk offshore until there is enough
      // room for an eye-height camera without placing it inside the terrain.
      for (let z = patch.z + 6; z >= patch.z - 6; z -= 0.5) {
        if (waterY - stage().bed(cameraX, z) >= 1.8) {
          cameraZ = z;
          break;
        }
      }
      const targetX = patch.x - 1.2;
      const targetZ = patch.z;
      const cameraFloorY = stage().bed(cameraX, cameraZ);
      const floorY = stage().bed(targetX, targetZ);
      camera.position.set(
        cameraX,
        Math.min(waterY - 0.24, cameraFloorY + 1.35),
        cameraZ,
      );
      controls.target.set(targetX, Math.min(waterY - 0.8, floorY + 0.45), targetZ);
    }
    controls.cursor.copy(controls.target);
    controls.update();
    return view;
  }
  resetCamera();

  const hemi = new THREE.HemisphereLight(0xcfe4ff, 0x6b6353, 0.75);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2.1);
  scene.add(sun);
  scene.add(sun.target);
  const cinematicLighting=createCinematicWaterLighting({renderer,scene,sun,hemi});

  // --- stage-owned objects (rebuilt on stage change) -------------------------
  let bedMesh = null;
  let rocks = null;
  let kelp = null;
  let seaFerns = null;
  let fernTemplate = null;
  let water = null;
  document.body.dataset.sandReady = 'loading';
  document.body.dataset.fernReady = 'loading';
  const sandLoadingManager = new THREE.LoadingManager();
  sandLoadingManager.onLoad = () => { document.body.dataset.sandReady = 'true'; };
  sandLoadingManager.onError = () => { document.body.dataset.sandReady = 'false'; };
  const sandTextureLoader = new THREE.TextureLoader(sandLoadingManager);
  function loadSandTexture(url, { colorSpace = THREE.NoColorSpace, name } = {}) {
    const map = sandTextureLoader.load(url);
    map.name = name ?? url;
    map.colorSpace = colorSpace;
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.RepeatWrapping;
    map.anisotropy = 4;
    return map;
  }
  const sandMaps = {
    albedo: loadSandTexture(SAND_TEXTURE_URLS.albedo, {
      colorSpace: THREE.SRGBColorSpace,
      name: 'CoastSand01Albedo',
    }),
    arm: loadSandTexture(SAND_TEXTURE_URLS.arm, { name: 'CoastSand01ARM' }),
    normal: loadSandTexture(SAND_TEXTURE_URLS.normal, { name: 'CoastSand01NormalGL' }),
  };
  // One material survives every Ground switch. Reusing its compiled graph is
  // essential on WebGPU, and its texture node simply follows the shore-state
  // ping-pong target each update.
  const shoreMaterial = createWaterShoreMaterial({
    albedoMap: sandMaps.albedo,
    armMap: sandMaps.arm,
    normalMap: sandMaps.normal,
    textureRepeat: SAND_TEXTURE_REPEAT,
  });

  // WebGPU encodes and submits work at the end of the render frame. Ground
  // controls can fire between the scene update and that submit, so disposing
  // a just-removed material immediately can invalidate a bind buffer that the
  // current command encoder still owns. Remove objects synchronously, then
  // release their GPU resources after two complete render boundaries.
  function disposeAfterRenderBoundary(dispose) {
    if (typeof globalThis.requestAnimationFrame !== 'function') {
      globalThis.setTimeout(dispose, 34);
      return;
    }
    globalThis.requestAnimationFrame(() => {
      globalThis.requestAnimationFrame(() => {
        const queue=renderer.backend?.device?.queue;
        if(queue?.onSubmittedWorkDone)queue.onSubmittedWorkDone().then(dispose,dispose);
        else dispose();
      });
    });
  }

  // An above-water-only horizon safety net. It sits below the deepest trough
  // so surface views read as continuing past the animated tile. Never show it
  // to a submerged camera: this full plane has no physical place inside the
  // water volume and otherwise appears as a flat blue ceiling over the bed.
  const skirtMaterial = new THREE.MeshBasicMaterial({ color: 0x2a5f80 });
  const skirt = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), skirtMaterial);
  skirt.rotation.x = -Math.PI / 2;
  skirt.visible = false;
  skirt.userData.waterExclude = true;
  scene.add(skirt);

  const dynamicsMode = () => stageId.startsWith('river') ? 'river' : stageId === 'beach' ? 'coast' : stageId === 'tank' ? 'tank' : 'spectral';
  function buildWater(settings) {
    const grid = waterLabGrid(stageId);
    const surface = new WaterSurface({
      width: grid.width,
      depth: grid.depth,
      dynamics: { mode: dynamicsMode(), columns: grid.columns, rows: grid.rows, spectralResolution: 32, warmupSeconds: stageId === 'beach' ? 22 : 0, renderExtent: stageId === 'beach' ? 600 : 0, shorelineAxis: stageId === 'beach' ? 'z' : null, foamParticles: stageId === 'beach', causticsCenter: [0,-8] },
      underwaterAtmosphere: { overlayOpacity: 0, fogNear: 0.3, fogFar: 38, waterPathFog: true },
      // About 67 cm between vertices: enough samples for a 10 m swash edge,
      // while the 180 m coverage remains practical on the WebGL fallback.
      segmentsPerMeter: 1.5,
      maxSegments: 270,
      simulation: { resolution: 288, worldSize: 26 },
      // The visible tile is biased offshore below, but the local interactive
      // ripple window belongs around the camera's inspection target. Without
      // an explicit follow point the simulation would follow the mesh origin
      // to z=-40 and beach splashes would fall outside its 26 m window.
      follow: (out) => out.set(controls.target.x, 0, controls.target.z),
      bedHeight: stage().bed,
      // The calibration beach has one known offshore axis (+Z propagation).
      // Other grounds include shelves/islands where this one-way mild-slope
      // field is not a valid diffraction model, so they retain plane phase.
      nearshorePhase: false,
      // Fixed world-space band around every lab shoreline. The anisotropic
      // 768x192 atlas gives ~23 cm cells in both axes: fine enough for torn
      // foam rather than blocky rafts, while remaining a small 30 Hz pass.
      shoreState: {
        region: { centerX: 0, centerZ: -2, width: WATER_SIZE, depth: 44 },
        resolution: { x: 768, y: 192 },
      },
      ...settings,
    });
    surface.position.y = settings.waterLevel;
    // Bias the single animated tile offshore: the measured z=-10..10 swash
    // remains well inside it, while the far z edge moves from ~111 m to
    // ~151 m from the beach camera—behind the scene's fully opaque fog.
    surface.position.z = grid.centerZ;
    surface.setDebugMode(store.getState().view.debug);
    surface.attachShoreStateMaterial(shoreMaterial);
    scene.add(surface);
    return surface;
  }

  function syncEnvironment(settings) {
    scene.fog.near = stageId === 'beach' ? 110 : stageId === 'open' ? 55 : 24;
    scene.fog.far = stageId === 'beach' ? 300 : stageId === 'open' ? 150 : 70;
    const direction = new THREE.Vector3(...settings.sunDirection);
    if (direction.lengthSq() < 1e-6) direction.set(0.35, 0.8, 0.45);
    direction.normalize();
    sun.position.copy(direction.multiplyScalar(60));
    sun.target.position.set(0, 0, 0);
    sun.color.setRGB(...settings.sunColor);
    paintSkyGradient(sky, settings.skyZenithColor, settings.skyHorizonColor, settings);
    skirt.visible = stageId !== 'beach';
    // Below the deepest wave trough, or it pokes through as flat pale patches.
    skirt.position.y = settings.waterLevel -
      Math.max(1.4, settings.waveAmplitude * Math.pow(settings.waveIntensity, 1.35) * 2.2 + 0.6);
    skirtMaterial.color.setRGB(
      settings.deepColor[0] * 0.85,
      settings.deepColor[1] * 0.85,
      settings.deepColor[2] * 0.9,
    );
  }

  function mirrorDataset(settings) {
    document.body.dataset.waterMode = settings.mode;
    document.body.dataset.waterStyle = settings.style;
    document.body.dataset.waterTone = settings.colorTone;
    document.body.dataset.waterLevel = settings.waterLevel.toFixed(3);
    document.body.dataset.waterStage = stageId;
  }

  function applySettings(settings) {
    hemi.intensity=stageId==='glass-box'?.14:.75;
    sun.intensity=stageId==='glass-box'?.15:2.1;
    if (activeExperiment) {
      syncEnvironment(settings);
      scene.environment = sky; scene.environmentIntensity = .65;
      scene.background = stageId === 'glass-box' ? new THREE.Color(0x111c31) : sky;
      if(stageId==='glass-box'){scene.fog.near=500;scene.fog.far=1000;}
      const cinematic=store.getState().experimentSettings.lighting==='cinematic';
      cinematicLighting.apply(stageId,store.getState().experimentSettings.lighting,store.getState().experimentSettings.exposure);
      scene.fog.color.setRGB(...settings.skyHorizonColor);
      if(cinematic&&stageId!=='glass-box'){
        paintSkyGradient(sky,[.07,.12,.21],[.26,.34,.4],{...settings,sunDirection:[-.56,.75,.37],sunColor:[1,.8,.6]});
        scene.fog.color.setRGB(.19,.25,.29);scene.fog.near=30;scene.fog.far=100;
      }
      skirt.visible = false;
      experimentReference=store.getState().view.reference;
      if(experimentReference) {
        experimentMaterial.color.set(0xffffff);experimentMaterial.attenuationColor.setRGB(.68,.94,.97);
      } else {
        experimentMaterial.color.setRGB(1,1,1);
        experimentMaterial.attenuationColor.setRGB(.68,.94,.97)
          .lerp(new THREE.Color().setRGB(...settings.deepColor,THREE.SRGBColorSpace),.04)
          .lerp(new THREE.Color().setRGB(...settings.midColor,THREE.SRGBColorSpace),.035);
      }
      experimentMaterial.roughness = .018 + settings.reflectionSoftness*.035;
      experimentMaterial.transmission = 1;
      experimentMaterial.attenuationDistance = experimentReference?1:Math.max(.3,settings.deepFadeDistance/4.2);
      experimentMaterial.userData.baseRoughness.value=experimentMaterial.roughness;
      if(stageId!=='waterfall'){
        experimentMaterial.attenuationColor.setRGB(.36,.82,.89);
        experimentMaterial.attenuationDistance=experimentReference?1.5:Math.max(.45,Math.min(2.2,settings.deepFadeDistance/3));
        experimentMaterial.userData.waterTint.value.setRGB(.72,.93,.96);
      }
      experimentMaterial.userData.foamColor.value.setRGB(...settings.foamColor,THREE.SRGBColorSpace);
      experimentMaterial.userData.detailStrength.value = settings.detailNormalStrength;
      experimentMaterial.userData.scatter.value.setRGB(.015,.1,.15).multiplyScalar(stageId==='glass-box'?.1:1);
      experimentRoot.traverse(object => {
        if(object.material?.userData.experimentFoam) object.material.color.setRGB(...settings.foamColor,THREE.SRGBColorSpace);
        if(object.material?.userData.thinSheet) {
          object.material.color.copy(experimentMaterial.color);object.material.attenuationColor.copy(experimentMaterial.attenuationColor);
          object.material.attenuationDistance=experimentMaterial.attenuationDistance;
        }
      });
      mirrorDataset(settings);
      return;
    }
    cinematicLighting.apply(null,'neutral');
    if (water && settings.quality !== water.settings.quality) {
      // TSL quality defines bake at material creation — rebuild the surface.
      scene.remove(water);
      water.dispose();
      water = null;
    }
    if (!water) {
      water = buildWater(settings);
    } else {
      water.applySettings(settings);
      water.position.y = settings.waterLevel;
    }
    updateWaterShoreMaterial(shoreMaterial, {
      stateField: water.dynamics ?? water.shoreState,
      foamColor: settings.foamColor,
      // The shared ground-side fringe is the dry half of swash foam, not an
      // independent effect. Its presentation follows the same dedicated
      // Swash Foam control as the water-side half.
      foamAmount: settings.swashFoamAmount,
      wetDarkening: settings.wetSandDarkening,
      // Wet sand is darker and smoother, but it is not a mirror. Mapping the
      // authored sheen directly to full clearcoat produced broad white cloud
      // patches from the bright sky instead of a restrained grazing glint.
      wetRoughness: THREE.MathUtils.lerp(0.52, 0.28, settings.wetSandSheen),
      wetClearcoat: settings.wetSandSheen * 0.48,
    });
    syncEnvironment(settings);
    mirrorDataset(settings);
  }

  // --- floating ship (open-water stage) ----------------------------------------
  let boat = null;
  let boatVisual = null;
  const boatPose = { pitch: 0, roll: 0, y: null };

  function mountBoatModel(model) {
    boatVisual = model;
    boatVisual.rotation.y = 0.55;
    boatVisual.position.set(3, 0, -3);
    boatVisual.visible = stage().boat;
    scene.add(boatVisual);
  }

  function syncSeaFerns(state = store.getState()) {
    if(activeExperiment){if(seaFerns)seaFerns.visible=false;return;}
    if (seaFerns) scene.remove(seaFerns);
    seaFerns = buildSeaFerns(
      fernTemplate,
      stage().fernPatches,
      state.view.kelp,
      stage().bed,
      state.settings.waterLevel,
    );
    if (seaFerns) scene.add(seaFerns);
  }

  new GLTFLoader().loadAsync(SHIP_URL).then((gltf) => {
    const ship = gltf.scene;
    const box = new THREE.Box3().setFromObject(ship);
    const size = box.getSize(new THREE.Vector3());
    const length = Math.max(size.x, size.z);
    const scale = 13 / Math.max(length, 1e-3); // ~13 m hull on the 40 m stage
    ship.scale.setScalar(scale);
    const wrapper = new THREE.Group();
    // Keel at wrapper -draft: the group origin rides the sampled wave height.
    const draft = 0.8;
    ship.position.y = -box.min.y * scale - draft;
    wrapper.add(ship);
    wrapper.userData.draft = draft;
    wrapper.userData.halfLength = (Math.max(size.x, size.z) * scale) / 2 * 0.7;
    wrapper.userData.halfBeam = (Math.min(size.x, size.z) * scale) / 2 * 0.7;
    wrapper.name = 'DutchShipMedium';
    mountBoatModel(wrapper);
    boat = wrapper;
  }).catch(() => {
    // Fresh clone without assets-local/: procedural toon boat stand-in.
    const fallback = buildFallbackBoat();
    fallback.name = 'FallbackBoat';
    mountBoatModel(fallback);
    boat = fallback;
  });

  new GLTFLoader().loadAsync(FERN_URL).then((gltf) => {
    fernTemplate = gltf.scene;
    const bounds = new THREE.Box3().setFromObject(fernTemplate);
    fernTemplate.userData.sourceMinY = bounds.min.y;
    fernTemplate.userData.sourceHeight = bounds.max.y - bounds.min.y;
    const materials = new Map();
    fernTemplate.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = false;
      object.receiveShadow = true;
      const sourceMaterials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      const tunedMaterials = sourceMaterials.map((source) => {
        if (!materials.has(source)) {
          const material = source.clone();
          material.name = `${source.name || 'FernLeaves'}_Underwater`;
          material.side = THREE.DoubleSide;
          material.roughness = 0.9;
          material.metalness = 0;
          material.emissive.set(0x173b29);
          material.emissiveMap = material.map;
          material.emissiveIntensity = 0.32;
          materials.set(source, material);
        }
        return materials.get(source);
      });
      object.material = Array.isArray(object.material) ? tunedMaterials : tunedMaterials[0];
    });
    document.body.dataset.fernReady = 'true';
    syncSeaFerns();
  }).catch(() => {
    // Procedural kelp still keeps the stage useful if an asset is removed.
    document.body.dataset.fernReady = 'false';
  });

  function updateBoat(delta) {
    if (!boat || !water || !boat.visible) return;
    const x = boat.position.x;
    const z = boat.position.z;
    const halfLength = boat.userData.halfLength;
    const halfBeam = boat.userData.halfBeam;
    const yaw = boat.rotation.y;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const bow = water.getHeightAt(x + cos * halfLength, z - sin * halfLength);
    const stern = water.getHeightAt(x - cos * halfLength, z + sin * halfLength);
    const port = water.getHeightAt(x + sin * halfBeam, z + cos * halfBeam);
    const starboard = water.getHeightAt(x - sin * halfBeam, z - cos * halfBeam);
    const targetY = (bow + stern + port + starboard) / 4;
    const targetPitch = Math.atan2(stern - bow, halfLength * 2) * 0.7;
    const targetRoll = Math.atan2(port - starboard, halfBeam * 2) * 0.6;
    // A hull this size responds slowly — heavy smoothing sells the mass.
    // Match the old 60 Hz response without changing buoyancy with frame rate.
    const response = 1 - Math.exp(Math.log(0.96) * 60 * delta);
    boatPose.y = boatPose.y === null ? targetY : THREE.MathUtils.lerp(boatPose.y, targetY, response);
    boatPose.pitch = THREE.MathUtils.lerp(boatPose.pitch, targetPitch, response);
    boatPose.roll = THREE.MathUtils.lerp(boatPose.roll, targetRoll, response);
    boat.position.y = boatPose.y;
    boat.rotation.x = boatPose.roll;
    boat.rotation.z = boatPose.pitch;
  }

  // --- rain ---------------------------------------------------------------------
  const rain = new WaterRain({ areaSize: 34, count: 2000 });
  rain.visible = false;
  scene.add(rain);

  // --- fish ---------------------------------------------------------------------
  let fauna = null;
  let faunaBuilt = { count: -1, stage: null, waterLevel: NaN };
  function syncFauna(count, waterLevel) {
    const unchanged = count === faunaBuilt.count &&
      faunaBuilt.stage === stageId &&
      Math.abs(waterLevel - faunaBuilt.waterLevel) <= 0.05;
    if (unchanged) return;
    if (fauna) {
      const staleFauna = fauna;
      scene.remove(staleFauna.root);
      disposeAfterRenderBoundary(() => staleFauna.dispose());
      fauna = null;
    }
    if (count > 0) {
      fauna = createFauna({
        bounds: waterLabFishBounds(stageId),
        heightAt: bedAt,
        seed: 7,
        species: { birds: 0, butterflies: 0, dragonflies: 0, fish: count },
        waterLevel,
      });
      scene.add(fauna.root);
    }
    faunaBuilt = { count, stage: stageId, waterLevel };
  }

  function rebuildStage() {
    const state = store.getState();
    clearTimeout(experimentRebuildTimer);experimentRebuildTimer=null;
    if (activeExperiment) {
      const previous = activeExperiment;scene.remove(experimentRoot);
      disposeAfterRenderBoundary(() => previous.dispose());
      activeExperiment = null; experimentRoot = null; experimentMaterial = null;
    }
    if (isWaterExperiment(stageId)) {
      delete document.body.dataset.waterError;
      // All cases share this lab's renderer, scene, controls, store and frame
      // loop. Only the water geometry/solver and authored surroundings change.
      water?.underwaterAtmosphere?.detach();
      for(const object of [water,bedMesh,rocks,kelp,seaFerns,boatVisual,fauna?.root,rain,skirt]) if(object)object.visible=false;
      experimentRoot = new THREE.Group();scene.add(experimentRoot);
      experimentMaterial = makeWaterMaterial();
      const create = stageId === 'barrel' ? createSurfScene : stageId === 'waterfall' ? createWaterfallScene : createGlassScene;
      activeExperiment = create({root:experimentRoot,waterMaterial:experimentMaterial,options:state.experimentSettings,renderer,
        onError:message=>{document.body.dataset.waterError=message;console.error(message);}});
      lastExperimentSettings=state.experimentSettings;
      applySettings(state.settings);resetCamera();return;
    }
    scene.background=sky;scene.environment=null;camera.clearViewOffset();
    if(water)water.visible=true;
    if (bedMesh) {
      const staleBed = bedMesh;
      scene.remove(staleBed);
      disposeAfterRenderBoundary(() => {
        staleBed.geometry.dispose();
      });
    }
    bedMesh = buildBedMesh(state.settings.waterLevel, stage().bed, shoreMaterial, waterLabGrid(stageId));
    scene.add(bedMesh);

    if (rocks) {
      const staleRocks = rocks;
      scene.remove(staleRocks);
      disposeAfterRenderBoundary(() => {
        const materials = new Set(), geometries = new Set();
        staleRocks.traverse((object) => {
          if (object.material) materials.add(object.material);
          if (object.userData.waterLabOwnedGeometry) geometries.add(object.geometry);
        });
        materials.forEach((material) => material.dispose());
        geometries.forEach((geometry) => geometry.dispose());
      });
    }
    rocks = buildRocks(stage().rockSpots, stage().bed);
    if (stageId === 'tank') addTankGauges(rocks, state.settings.waterLevel);
    if (stageId === 'beach') addBeachGauges(rocks);
    rocks.visible = state.view.rocks;
    scene.add(rocks);

    if (kelp) {
      const staleKelp = kelp;
      scene.remove(staleKelp);
      disposeAfterRenderBoundary(() => staleKelp.dispose());
    }
    kelp = buildKelp(
      state.view.kelp,
      stage().kelpBand,
      stage().bed,
      state.settings.waterLevel,
      stage().fernPatches,
    );
    if (kelp) {
      kelp.setFlow(state.settings.flowDirection, state.settings.flowSpeed);
      scene.add(kelp);
    }
    syncSeaFerns(state);

    // Preserve the material, render passes, ripple state, and animation clock.
    // Recreating them here made the new scene appear and then block input
    // while WebGPU compiled the complete water pipeline (and restarted every
    // foam cycle from the same frame). The graph already has shoaling enabled,
    // so only its per-vertex terrain samples need to change.
    if (water && (water.dynamics?.mode !== dynamicsMode() || water.width !== waterLabGrid(stageId).width || water.depth !== waterLabGrid(stageId).depth)) {
      const staleWater = water;
      scene.remove(staleWater); water = null;
      disposeAfterRenderBoundary(() => staleWater.dispose());
    }
    if (water && state.settings.quality === water.settings.quality) {
      water.setNearshorePhase(
        false,
        { bake: false },
      );
      // Defer the O(vertex-count) bed/phase bake to the normal update after
      // applySettings has moved the rest water level, avoiding two synchronous
      // bakes (old Y, then new Y) during the ground-selector event.
      water.setBedHeightSampler(stage().bed, { bake: false });
    }
    applySettings(state.settings);

    if (boatVisual) boatVisual.visible = stage().boat;
    boatPose.y = null;

    faunaBuilt.stage = null; // force fish onto the new ground
    syncFauna(state.view.fish, state.settings.waterLevel);
    resetCamera();
  }
  rebuildStage();
  document.body.dataset.waterReady = 'true';

  // --- toys: buoyant balls / sinkers -----------------------------------------------
  const ballGeometry = new THREE.SphereGeometry(0.32, 32, 24);
  const ballMaterial = new THREE.MeshStandardMaterial({ color: 0xf2734a, roughness: 0.5 });
  const sinkerMaterial = new THREE.MeshStandardMaterial({ color: 0x3b4754, metalness: 0.6, roughness: 0.35 });
  const balls = [];

  function removeBall(ball) {
    scene.remove(ball.mesh);
    const index = balls.indexOf(ball);
    if (index >= 0) balls.splice(index, 1);
  }

  function dropBall({ sinker = false } = {}) {
    if(activeExperiment)return;
    if (balls.length >= BALL_LIMIT) removeBall(balls[0]);
    const mesh = new THREE.Mesh(ballGeometry, sinker ? sinkerMaterial : ballMaterial);
    mesh.position.set(
      THREE.MathUtils.randFloatSpread(12),
      7 + Math.random() * 2,
      THREE.MathUtils.randFloatSpread(10) - 4,
    );
    scene.add(mesh);
    balls.push({ mesh, restTime: 0, sinker, splashed: false, vy: 0 });
  }

  function updateBalls(delta) {
    for (const ball of [...balls]) {
      ball.mesh.visible=true;
      const position = ball.mesh.position;
      const surfaceY = water.getHeightAt(position.x, position.z);
      const bedY = bedAt(position.x, position.z) + 0.32;
      const submerged = position.y < surfaceY;

      ball.vy -= 9.8 * delta;
      if (submerged) {
        if (!ball.splashed) {
          ball.splashed = true;
          water.splash({ x: position.x, y: surfaceY, z: position.z }, { strength: ball.sinker ? 1.3 : 0.9 });
        }
        if (ball.sinker) {
          ball.vy = Math.max(ball.vy, -2.2); // drag caps sink speed
        } else {
          const depth = Math.min(surfaceY - position.y, 0.64);
          ball.vy += (22 * depth - 3.2 * ball.vy) * delta; // buoyancy spring + damping
          water.addRipple(position, { radius: 0.4, strength: Math.min(Math.abs(ball.vy) * 0.2, 0.4) });
        }
      }
      position.y += ball.vy * delta;

      if (ball.sinker && position.y <= bedY) {
        position.y = bedY;
        ball.vy = 0;
        ball.restTime += delta;
        if (ball.restTime > 5) removeBall(ball);
      }
      if (position.y < -12) removeBall(ball);
    }
  }

  // --- pointer splashes ----------------------------------------------------------
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const waterPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  let stirring = false;
  let lastStir = 0;

  function pointerToWater(event) {
    if(activeExperiment||!water)return null;
    pointer.set(
      (event.clientX / window.innerWidth) * 2 - 1,
      -(event.clientY / window.innerHeight) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    waterPlane.constant = -water.position.y;
    if (!raycaster.ray.intersectPlane(waterPlane, hit)) return null;
    return water.containsPoint(hit.x, hit.z, 0.5) ? hit : null;
  }

  renderer.domElement.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !event.shiftKey) return;
    const point = pointerToWater(event);
    if (!point) return;
    stirring = true;
    controls.enabled = false;
    water.splash({ x: point.x, y: point.y, z: point.z }, { strength: 1 });
  });
  renderer.domElement.addEventListener('pointermove', (event) => {
    if (!stirring) return;
    const now = performance.now();
    if (now - lastStir < 30) return;
    lastStir = now;
    const point = pointerToWater(event);
    if (point) water.addRipple(point, { radius: 0.35, strength: 0.35 });
  });
  window.addEventListener('pointerup', () => {
    stirring = false;
    controls.enabled = true;
  });

  // --- store subscription -----------------------------------------------------------
  let lastRevision = store.getState().docRevision;
  let lastDebug = store.getState().view.debug;
  let lastKelpCount = store.getState().view.kelp;
  let lastPlantWaterLevel = store.getState().settings.waterLevel;
  store.subscribe(() => {
    const state = store.getState();
    if (state.view.stage !== stageId) {
      stageId = state.view.stage;
      const url=new URL(window.location.href);url.searchParams.set('waterStage',stageId);window.history.replaceState(null,'',url);
      lastRevision = state.docRevision;
      lastPlantWaterLevel = state.settings.waterLevel;
      rebuildStage();
      return;
    }
    if (activeExperiment) {
      if (state.experimentSettings !== lastExperimentSettings) {
        const old = lastExperimentSettings, next = state.experimentSettings;
        if (['fluidQuality','height','fallWidth','speed','discharge','columnHeight','columnWidth','waveHeight','breakerMode','impactRocks','midLedge'].some(key=>old[key]!==next[key])) {
          clearTimeout(experimentRebuildTimer);
          experimentRebuildTimer=setTimeout(()=>{
            const position=camera.position.clone(),target=controls.target.clone();
            rebuildStage();camera.position.copy(position);controls.target.copy(target);controls.update();
          },160);
        }
        if(old.lighting!==next.lighting||old.exposure!==next.exposure)applySettings(state.settings);
        lastExperimentSettings = next;
      }
      if(state.docRevision!==lastRevision||state.view.reference!==experimentReference){lastRevision=state.docRevision;applySettings(state.settings);}
      return;
    }
    if (state.docRevision !== lastRevision) {
      lastRevision = state.docRevision;
      applySettings(state.settings);
      kelp?.setFlow(state.settings.flowDirection, state.settings.flowSpeed);
      if (Math.abs(state.settings.waterLevel - lastPlantWaterLevel) > 0.05) {
        lastPlantWaterLevel = state.settings.waterLevel;
        syncSeaFerns(state);
      }
    }
    if (state.view.debug !== lastDebug) {
      lastDebug = state.view.debug;
      water.setDebugMode(state.view.debug);
    }
    if (state.view.rain !== rain.visible) rain.visible = state.view.rain;
    if (rocks) rocks.visible = state.view.rocks;
    if (state.view.kelp !== lastKelpCount) {
      lastKelpCount = state.view.kelp;
      if (kelp) {
        scene.remove(kelp);
        kelp.dispose();
      }
      kelp = buildKelp(
        state.view.kelp,
        stage().kelpBand,
        stage().bed,
        state.settings.waterLevel,
        stage().fernPatches,
      );
      if (kelp) {
        kelp.setFlow(state.settings.flowDirection, state.settings.flowSpeed);
        scene.add(kelp);
      }
      syncSeaFerns(state);
    }
    syncFauna(state.view.fish, state.settings.waterLevel);
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const clock = new THREE.Clock();
  let firstFrame = true;
  let rainImpulseBudget = 0;
  let pendingFrameStep = 0;
  let diagnosticsFrames = 0;
  let diagnosticsTime = performance.now();

  async function start() {
    await whenRendererReady(renderer);
    renderer.setAnimationLoop(() => {
      const rawDelta = Math.min(clock.getDelta(), 0.1);
      const view = store.getState().view;
      const delta = view.paused ? pendingFrameStep : rawDelta;
      pendingFrameStep = 0;
      if (activeExperiment) {
        for(const ball of balls)ball.mesh.visible=false;
        controls.update();
        const panel=document.querySelector('[data-testid="inspector"]');
        if(panel&&window.innerWidth>720)camera.setViewOffset(window.innerWidth,window.innerHeight,(window.innerWidth-64-panel.getBoundingClientRect().left)/2,0,window.innerWidth,window.innerHeight);
        experimentStats = activeExperiment.update(delta*(view.paused?1:store.getState().experimentSettings.timeScale),{...store.getState().experimentSettings,paused:view.paused,frameStep:view.paused&&delta>0});
        if(Boolean(view.preparing)!==Boolean(experimentStats.preparing))store.actions.setView({preparing:Boolean(experimentStats.preparing)});
        experimentMaterial.userData.detailSpectrum.update(experimentStats.time??0);
        activeExperiment.prepare?.(renderer,scene);
        cinematicLighting.prepare(stageId);
        experimentMaterial.userData.optics.capture(renderer,scene,camera);
        if(stageId==='glass-box'&&new URLSearchParams(location.search).has('waterAudit')&&!experimentMaterial.userData.audited&&experimentStats.particles>0){
          experimentMaterial.userData.audited=true;const settings=store.getState().experimentSettings;
          experimentMaterial.userData.optics.audit(renderer,camera,[-3+settings.columnWidth/2,settings.columnHeight/2,0]).then(sample=>{document.body.dataset.waterOpticalSample=JSON.stringify(sample);});
        }
        renderer.render(scene,camera);
        document.body.dataset.modelReady=experimentStats.error?'error':stageId==='waterfall'||experimentStats.particles>0?'true':'false';
        document.body.dataset.waterSimulationTime=String(experimentStats.time??0);
        document.body.dataset.waterSimulationDiagnostics=JSON.stringify(experimentStats);
        const timeline=document.querySelector('[data-testid="fluid-timeline"]');if(timeline&&document.activeElement!==timeline)timeline.value=String(experimentStats.time??0);
        const output=document.querySelector('[data-testid="water-diagnostics"]');
        if(output)output.textContent=`${(experimentStats.time??0).toFixed(2)} s · ${experimentStats.phase??''}`;
        if(experimentStats.ended&&!view.paused)store.actions.setView({paused:true});
        return;
      }
      if (water.dynamics) water.dynamics.reference = view.reference;
      controls.update();
      water.prepareDynamics(delta);
      updateBalls(delta);
      updateBoat(delta);
      fauna?.update(delta);
      kelp?.update(delta);
      if (kelp) kelp.visible = cameraInspectionMode !== 'underwater-floor';
      updateSeaFerns(seaFerns, water.time, store.getState().settings);
      if (rain.visible) {
        rain.update(delta, camera, renderer, water.position.y);
        // A fixed impulse rate: high-refresh displays must not make the
        // same rain setting inject proportionally more water disturbance.
        rainImpulseBudget += delta * 180;
        const impulses = Math.floor(rainImpulseBudget);
        rainImpulseBudget -= impulses;
        for (let i = 0; i < impulses; i += 1) {
          water.addRipple({
            x: controls.target.x + THREE.MathUtils.randFloatSpread(22),
            z: controls.target.z + THREE.MathUtils.randFloatSpread(22),
          }, { radius: 0.22, strength: 0.12 });
        }
      }
      water.update(renderer, scene, camera, delta);
      skirt.visible = stageId !== 'beach' && !water.underwaterAtmosphereState.active;
      renderer.render(scene, camera);
      diagnosticsFrames++;
      const now = performance.now();
      if (now-diagnosticsTime > 500) {
        const stats = water.dynamics?.diagnostics();
        const fps = Math.round(diagnosticsFrames*1000/(now-diagnosticsTime));
        document.body.dataset.waterFps = String(fps);
        document.body.dataset.waterSimulationTime = (stats?.time ?? 0).toFixed(3);
        document.body.dataset.waterMassError = String(stats?.massError ?? 0);
        const shoreEdge = stageId === 'beach' ? water.dynamics?.shoreEdgeAt() : null;
        document.body.dataset.waterShoreEdge = shoreEdge === null ? '' : String(shoreEdge);
        const swashStatus = stageId === 'beach'
          ? water.dynamics.warmupRemaining > 0 ? ' · Preparing incoming waves…'
            : shoreEdge === null ? '' : ` · Shoreline ${shoreEdge.toFixed(2)} m`
          : '';
        const output = document.querySelector('[data-testid="water-diagnostics"]');
        if (output) output.textContent = `${dynamicsMode() === 'spectral' ? 'Spectral waves' : 'Depth + flow'} · ${fps} fps · ${(stats?.time ?? 0).toFixed(view.paused ? 3 : 1)} s${swashStatus}`;
        diagnosticsFrames=0; diagnosticsTime=now;
      }
      if (firstFrame) {
        firstFrame = false;
        document.body.dataset.modelReady = 'true';
      }
    });
  }

  return {
    camera,
    controls,
    dropBall,
    renderer,
    resetCamera,
    scene,
    setCameraMode,
    setCameraView,
    stepFrame: () => { store.actions.setView({ paused: true }); pendingFrameStep = 1 / 60; },
    replay: () => {
      if(experimentStats.error)rebuildStage();
      else {activeExperiment?.reset();store.actions.setView({paused:false});}
    },
    seek: time => {activeExperiment?.seek?.(time);store.actions.setView({paused:true});},
    getWaterDiagnostics: () => activeExperiment ? experimentStats : water.dynamics?.diagnostics(),
    start,
  };
}
