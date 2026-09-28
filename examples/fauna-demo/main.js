// ToonLab fauna demo — the smallest complete stage for the living layer:
// a sine-hill meadow with a western lake, a stylized sky, real water (so the
// fish read through the refraction pass), flower patches for the
// butterflies, and the fauna system at default populations.
//
// URL params: ?seed=42 &birds=40 &butterflies=60 &dragonflies=12 &fish=80
//             &dpr=1 &view=fish
// Keys 1/2/3/4 switch camera presets (lake / birds / fish top-down / meadow).
//
// This repository example uses the local fauna prototype through the Vite
// workspace alias. Fauna is not one of the public package entry points.

import * as THREE from 'three';
import { WebGPURenderer } from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { StylizedSky } from '@call-me-sensei/toonlab/sky';
import { WaterSurface } from '@call-me-sensei/toonlab/water';

import { createFauna } from '@call-me-sensei/toonlab/fauna';

const params = new URLSearchParams(location.search);
const intParam = (key, fallback) => {
  const value = Number.parseInt(params.get(key) ?? '', 10);
  return Number.isFinite(value) ? value : fallback;
};
const SEED = intParam('seed', 42);
const WATER_LEVEL = 0;
const SIZE = 400;

// The terrain contract, in full.
const heightAt = (x, z) => 12 * Math.sin(x / 90) * Math.cos(z / 90);

// Flower patches (dry meadow spots for this heightAt).
const FLOWER_DISCS = [
  { x: 60, z: 40, r: 30 },
  { x: 20, z: -60, r: 26 },
];
const flowerMask = (x, z) =>
  FLOWER_DISCS.some((d) => (x - d.x) ** 2 + (z - d.z) ** 2 < d.r * d.r);

function mulberry32(seed) {
  let state = (Math.trunc(seed) || 1) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildTerrain() {
  const segments = 160;
  const geometry = new THREE.PlaneGeometry(SIZE, SIZE, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  const pos = geometry.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const meadow = new THREE.Color().setRGB(0.36, 0.58, 0.26, THREE.SRGBColorSpace);
  const meadowHigh = new THREE.Color().setRGB(0.52, 0.68, 0.3, THREE.SRGBColorSpace);
  const sand = new THREE.Color().setRGB(0.82, 0.74, 0.54, THREE.SRGBColorSpace);
  const bed = new THREE.Color().setRGB(0.32, 0.42, 0.34, THREE.SRGBColorSpace);
  const flowerTint = new THREE.Color().setRGB(0.5, 0.66, 0.32, THREE.SRGBColorSpace);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = heightAt(x, z);
    pos.setY(i, y);
    if (y < WATER_LEVEL - 1.2) c.copy(bed);
    else if (y < WATER_LEVEL + 0.7) c.copy(sand);
    else c.lerpColors(meadow, meadowHigh, Math.min(1, (y - 0.7) / 11));
    if (y > WATER_LEVEL + 0.4 && flowerMask(x, z)) c.lerp(flowerTint, 0.55);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    roughness: 1, metalness: 0, vertexColors: true,
  }));
  mesh.name = 'demo-terrain';
  mesh.frustumCulled = false;
  return mesh;
}

// A sprinkle of instanced flower quads so the butterfly patches read as
// flower fields, not just tinted grass.
function buildFlowerSprinkle() {
  const rng = mulberry32(SEED * 7 + 5);
  const petals = [
    new THREE.Color().setRGB(0.98, 0.62, 0.75, THREE.SRGBColorSpace),
    new THREE.Color().setRGB(0.99, 0.95, 0.75, THREE.SRGBColorSpace),
    new THREE.Color().setRGB(0.95, 0.97, 0.98, THREE.SRGBColorSpace),
  ];
  const geometry = new THREE.PlaneGeometry(0.09, 0.09);
  const count = 900;
  const mesh = new THREE.InstancedMesh(
    geometry,
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, fog: true }),
    count,
  );
  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const eul = new THREE.Euler();
  let placed = 0;
  let guard = count * 40;
  while (placed < count && guard > 0) {
    guard -= 1;
    const disc = FLOWER_DISCS[placed % FLOWER_DISCS.length];
    const ang = rng() * Math.PI * 2;
    const rad = disc.r * Math.sqrt(rng());
    const x = disc.x + Math.cos(ang) * rad;
    const z = disc.z + Math.sin(ang) * rad;
    const y = heightAt(x, z);
    if (y < WATER_LEVEL + 0.4) continue;
    // Mostly face-up petals hugging the ground: dots, not confetti.
    eul.set(-Math.PI / 2 + (rng() - 0.5) * 0.35, rng() * Math.PI, 0);
    quat.setFromEuler(eul);
    matrix.compose(new THREE.Vector3(x, y + 0.05, z), quat, new THREE.Vector3(1, 1, 1));
    mesh.setMatrixAt(placed, matrix);
    mesh.setColorAt(placed, petals[placed % petals.length]);
    placed += 1;
  }
  mesh.count = placed;
  mesh.frustumCulled = false;
  mesh.userData.waterExclude = true; // ground sprinkle: invisible in water passes
  return mesh;
}

async function main() {
  const renderer = new WebGPURenderer({ antialias: true });
  const dpr = Number(params.get('dpr')) || Math.min(window.devicePixelRatio, 2);
  renderer.setPixelRatio(dpr);
  renderer.setSize(window.innerWidth, window.innerHeight);
  (window.__toonlabHostMount ?? document.body).appendChild(renderer.domElement);
  await renderer.init();

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(new THREE.Color(0.72, 0.83, 0.94), 180, 900);

  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1500);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.495;

  // Species views aim at the DENSEST live cluster of each population — a
  // global centroid lands in the empty air between flocks.
  const clusterOf = (name, radius = 26) => {
    const state = window.faunaDemo?.fauna?.simulation?.species?.[name];
    if (!state || state.count === 0) return null;
    const a = state.arrays;
    const r2 = radius * radius;
    let best = 0;
    let bestCount = -1;
    for (let i = 0; i < state.count; i += 1) {
      let n = 0;
      for (let j = 0; j < state.count; j += 1) {
        const dx = a.px[j] - a.px[i];
        const dz = a.pz[j] - a.pz[i];
        if (dx * dx + dz * dz < r2) n += 1;
      }
      if (n > bestCount) { bestCount = n; best = i; }
    }
    let x = 0; let y = 0; let z = 0; let vx = 0; let vy = 0; let vz = 0; let n = 0;
    for (let j = 0; j < state.count; j += 1) {
      const dx = a.px[j] - a.px[best];
      const dz = a.pz[j] - a.pz[best];
      if (dx * dx + dz * dz < r2) {
        x += a.px[j]; y += a.py[j]; z += a.pz[j];
        vx += a.vx[j]; vy += a.vy[j]; vz += a.vz[j];
        n += 1;
      }
    }
    return { n, vx: vx / n, vy: vy / n, vz: vz / n, x: x / n, y: y / n, z: z / n };
  };
  const VIEW_NAMES = ['orbit', 'birds', 'fish', 'butterflies', 'dragonflies'];
  const setView = (name) => {
    // Cameras stay OUTSIDE each species' flee radius, or the subjects
    // scatter out of frame while the shot settles.
    if (name === 'birds') {
      // Lead the flock and shoot from below: silhouettes against the sky.
      const c = clusterOf('birds') ?? { vx: 0, vy: 0, vz: 0, x: 0, y: 16, z: 0 };
      const ax = c.x + c.vx * 1.0;
      const az = c.z + c.vz * 1.0;
      const camY = Math.max(c.y - 6, heightAt(ax + 16, az + 26) + 1.5);
      camera.position.set(ax + 16, camY, az + 26);
      controls.target.set(ax, c.y + 2, az);
    } else if (name === 'fish') {
      const c = clusterOf('fish', 10) ?? { vx: 0, vz: 0, x: -141, y: -2, z: 0 };
      camera.position.set(c.x + c.vx * 1.2 + 1, WATER_LEVEL + 9, c.z + c.vz * 1.2 + 1);
      controls.target.set(c.x + c.vx * 1.2, c.y, c.z + c.vz * 1.2);
    } else if (name === 'butterflies') {
      // Tight cluster (one flower clump), low camera: wings against the sky.
      const c = clusterOf('butterflies', 3) ?? { x: 60, y: 2, z: 40 };
      camera.position.set(c.x + 2.6, c.y + 0.6, c.z + 4);
      controls.target.set(c.x, c.y + 0.7, c.z);
    } else if (name === 'dragonflies') {
      // Slightly above, looking down: a head-on dragonfly is a dot, a
      // top-down one is a needle with wings.
      const c = clusterOf('dragonflies', 10) ?? { x: -100, y: 0.6, z: 40 };
      camera.position.set(c.x + 1.7, Math.max(c.y + 1.3, WATER_LEVEL + 1.7), c.z + 2.2);
      controls.target.set(c.x, c.y, c.z);
    } else {
      // Wide establishing shot: the bird flock over the world, water behind.
      // Camera clamped inside the terrain so the shot never crosses the rim.
      const c = clusterOf('birds') ?? { x: -60, y: 14, z: 30 };
      const cx = Math.min(Math.max(c.x + 38, -SIZE / 2 + 20), SIZE / 2 - 20);
      const cz = Math.min(Math.max(c.z + 52, -SIZE / 2 + 20), SIZE / 2 - 20);
      camera.position.set(cx, Math.max(c.y + 7, 12), cz);
      controls.target.set(c.x, c.y - 2, c.z);
    }
    controls.update();
    for (const button of document.querySelectorAll('#hud button')) {
      button.dataset.active = String(button.id === `view-${name}`);
    }
  };

  // Sky + a light rig aligned to the sky sun (terrain is lit; fauna is
  // unlit by design and only needs the fog wiring below).
  const sky = new StylizedSky();
  scene.add(sky);
  const sunDir = new THREE.Vector3(...sky.settings.sunDirection).normalize();
  const sun = new THREE.DirectionalLight(0xfff4dc, 2.4);
  sun.position.copy(sunDir).multiplyScalar(300);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbdd8f5, 0x5a6a4a, 1.1));

  const terrain = buildTerrain();
  scene.add(terrain);
  scene.add(buildFlowerSprinkle());

  const water = new WaterSurface({
    bedHeight: heightAt,
    colorTone: 'anime', // clear pastel ramp — the koi must read through the refraction
    depth: SIZE,
    preset: 'lake',
    width: SIZE,
  });
  water.position.y = WATER_LEVEL;
  scene.add(water);

  const fauna = createFauna({
    bounds: { x: SIZE / 2 - 10, z: SIZE / 2 - 10 },
    followTarget: camera,
    heightAt,
    masks: { flowers: flowerMask },
    seed: SEED,
    species: {
      birds: intParam('birds', 40),
      butterflies: intParam('butterflies', 60),
      dragonflies: intParam('dragonflies', 12),
      fish: intParam('fish', 80),
    },
    waterLevel: WATER_LEVEL,
  });
  scene.add(fauna.root);

  // Height-fog layer: same parameters for water and fauna so nothing floats
  // sharp on the haze (the #1 giveaway per AGENTS.md).
  const fog = { color: [0.63, 0.8, 0.98], density: 0.0012, falloff: 400, floorY: -14 };
  fauna.setDistanceFog(fog);
  water.setDistanceFog?.(fog);
  fauna.setCloudShadow({ strength: 0.25 });

  window.faunaDemo = { camera, controls, fauna, setView, water };
  setView(params.get('view') ?? 'orbit');
  for (const name of VIEW_NAMES) {
    document.getElementById(`view-${name}`)?.addEventListener('click', () => setView(name));
  }
  window.addEventListener('keydown', (event) => {
    const index = Number.parseInt(event.key, 10) - 1;
    if (VIEW_NAMES[index]) setView(VIEW_NAMES[index]);
  });
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const fpsBox = document.getElementById('fps');
  const clock = new THREE.Clock();
  let frames = 0;
  let fpsTimer = 0;
  let firstFrame = true;

  renderer.setAnimationLoop(() => {
    const delta = Math.min(clock.getDelta(), 0.1);
    controls.update();
    sky.update(delta, camera);
    fauna.update(delta);
    water.update(renderer, scene, camera, delta);
    renderer.render(scene, camera);

    frames += 1;
    fpsTimer += delta;
    if (fpsTimer >= 0.5) {
      const stats = fauna.stats;
      fpsBox.textContent = `${Math.round(frames / fpsTimer)} fps · ${stats.total} agents · ${stats.drawCalls} draws`;
      frames = 0;
      fpsTimer = 0;
    }
    if (firstFrame) {
      firstFrame = false;
      document.getElementById('loading')?.remove();
      document.body.dataset.rendererBackend = renderer.backend?.isWebGPUBackend ? 'webgpu' : 'webgl2';
      document.body.dataset.demoReady = 'true';
    }
  });
}

main().catch((error) => {
  console.error(error);
  const loading = document.getElementById('loading');
  if (loading) loading.textContent = `Failed: ${error.message}`;
  document.body.dataset.demoReady = 'error';
});
