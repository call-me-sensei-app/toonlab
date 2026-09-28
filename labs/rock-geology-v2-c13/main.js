import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { createLabRenderer, whenRendererReady } from '../shared/rendererFactory.js';

const ROOT = '/artifacts/research/rock-geology-v2/checkpoint-09-tripo-p1-pilot/'
  + 'hoodoo-caprock/v31-scan-assisted-runtime-package/exports/';
const LODS = Object.freeze([
  Object.freeze({ id: 'LOD0', role: 'Desktop hero · 180,000 tris · embedded 4K', file: 'hoodoo-caprock-lod0-desktop-4k.glb', triangles: 180_000 }),
  Object.freeze({ id: 'LOD1', role: 'Mobile near · 60,000 tris · embedded 2K', file: 'hoodoo-caprock-lod1-mobile-near-2k.glb', triangles: 60_000 }),
  Object.freeze({ id: 'LOD2', role: 'Mobile mid · 20,000 tris · embedded 1K', file: 'hoodoo-caprock-lod2-mobile-mid-1k.glb', triangles: 20_000 }),
  Object.freeze({ id: 'LOD3', role: 'Mobile far · 6,000 tris · embedded 1K', file: 'hoodoo-caprock-lod3-mobile-far-1k.glb', triangles: 6_000 }),
]);
const SCALE_CASES = Object.freeze([
  Object.freeze({ id: '0.75× uniform', role: 'Runtime-safe envelope', scale: [0.75, 0.75, 0.75], rebake: false }),
  Object.freeze({ id: '1.20× width', role: 'Maximum runtime anisotropy', scale: [1.2, 1, 1], rebake: false }),
  Object.freeze({ id: '1.21× width', role: 'ToonLab routes to rebake', scale: [1.21, 1, 1], rebake: true }),
  Object.freeze({ id: '2× / 0.5×', role: 'Extreme: ToonLab routes to rebake', scale: [2, 1, 0.5], rebake: true }),
]);

const params = new URLSearchParams(location.search);
const mode = params.get('mode') === 'scale' ? 'scale' : 'lods';
const view = ['front', 'threeQuarter', 'top'].includes(params.get('view')) ? params.get('view') : 'threeQuarter';
document.body.dataset.hud = String(params.get('hud') !== '0');

const stage = document.getElementById('stage');
const status = document.getElementById('status');
const subtitle = document.getElementById('subtitle');
const legend = document.getElementById('legend');
subtitle.textContent = mode === 'lods' ? 'Authored LOD lineage' : 'Scale envelope and rebake routing';

const renderer = createLabRenderer({ alpha: false, antialias: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.append(renderer.domElement);
await whenRendererReady(renderer);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#101820');
scene.fog = new THREE.Fog('#101820', 25, 42);
scene.add(new THREE.HemisphereLight('#d9ecff', '#59493d', 1.7));
const key = new THREE.DirectionalLight('#ffe7c6', 3.6);
key.position.set(-7, 10, 9);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -12;
key.shadow.camera.right = 12;
key.shadow.camera.top = 7;
key.shadow.camera.bottom = -7;
key.shadow.camera.far = 40;
scene.add(key);
const fill = new THREE.DirectionalLight('#84b4df', 1.1);
fill.position.set(8, 4, -7);
scene.add(fill);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(40, 18),
  new THREE.MeshStandardMaterial({ color: '#4b4d4a', roughness: 1, metalness: 0 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const camera = new THREE.PerspectiveCamera(31, 1, 0.1, 100);
function applyView() {
  if (view === 'front') {
    camera.up.set(0, 1, 0);
    camera.position.set(0, 3.2, 23);
  } else if (view === 'top') {
    camera.up.set(0, 0, -1);
    camera.position.set(0, 24, 0.01);
  } else {
    camera.up.set(0, 1, 0);
    camera.position.set(12.5, 7.4, 19);
  }
  camera.lookAt(0, 1.45, 0);
}
applyView();

const loader = new GLTFLoader();
const roots = [];
const reportItems = [];
const xPositions = [-4.65, -1.55, 1.55, 4.65];

function prepareRoot(root, index, scale) {
  root.scale.fromArray(scale);
  root.updateMatrixWorld(true);
  const initial = new THREE.Box3().setFromObject(root);
  const centre = initial.getCenter(new THREE.Vector3());
  root.position.set(xPositions[index] - centre.x, -initial.min.y, -centre.z);
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
  });
  scene.add(root);
  roots.push(root);
}

if (mode === 'lods') {
  const gltfs = await Promise.all(LODS.map((entry) => loader.loadAsync(`${ROOT}${entry.file}`)));
  gltfs.forEach((gltf, index) => {
    const entry = LODS[index];
    prepareRoot(gltf.scene, index, [1, 1, 1]);
    reportItems.push({ id: entry.id, triangles: entry.triangles, role: entry.role, scale: [1, 1, 1] });
    legend.insertAdjacentHTML('beforeend', `<div class="legend-item safe"><strong>${entry.id}</strong><span>${entry.role}</span></div>`);
  });
} else {
  const gltf = await loader.loadAsync(`${ROOT}${LODS[0].file}`);
  const copies = SCALE_CASES.map(() => gltf.scene.clone(true));
  SCALE_CASES.forEach((entry, index) => {
    const root = copies[index];
    prepareRoot(root, index, entry.scale);
    reportItems.push({ id: entry.id, triangles: 180_000, role: entry.role, scale: entry.scale, rebake: entry.rebake });
    legend.insertAdjacentHTML('beforeend', `<div class="legend-item ${entry.rebake ? 'rebake' : 'safe'}"><strong>${entry.id}</strong><span>${entry.role}</span></div>`);
  });
}

function resize() {
  const width = innerWidth;
  const height = innerHeight;
  renderer.setSize(width, height, false);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
resize();
addEventListener('resize', resize);

let frames = 0;
renderer.setAnimationLoop(() => {
  renderer.render(scene, camera);
  frames += 1;
  if (frames === 12) {
    const report = {
      schema: 'toonlab/rock-geology-v2-c13-lab-report', version: 1,
      mode, view, rendererBackend: document.body.dataset.rendererBackend ?? 'unknown', items: reportItems,
    };
    document.body.dataset.c13Report = JSON.stringify(report);
    document.body.dataset.c13Ready = 'true';
    status.textContent = `${report.rendererBackend} · ${mode === 'lods' ? '4 admitted GLBs' : 'scale policy matrix'} · ${view}`;
  }
});
