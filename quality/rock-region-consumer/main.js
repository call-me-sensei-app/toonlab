import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import {
  applyRockShader,
  inspectRockRegionBindings,
  restoreRockShader,
} from '@call-me-sensei/toonlab/rock-shader';

const params = new URLSearchParams(location.search);
const backend = params.get('renderer') === 'webgl' ? 'webgl' : 'webgpu';
const stage = document.querySelector('#stage');
const status = document.querySelector('#status');
const renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL: backend === 'webgl' });
renderer.setPixelRatio(1);
renderer.setSize(stage.clientWidth || 800, stage.clientHeight || 800);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
stage.append(renderer.domElement);
await renderer.init();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xb8cee0);
scene.add(new THREE.HemisphereLight(0xe8f4ff, 0x5d4939, 2.2));
const sun = new THREE.DirectionalLight(0xffe2bd, 3.6);
sun.position.set(4, 6, 5);
scene.add(sun);

const gltf = await new GLTFLoader().loadAsync('/hoodoo-regions.glb');
const root = gltf.scene;
scene.add(root);
const meshes = [];
root.traverse((object) => {
  if (object.isMesh) meshes.push(object);
});
if (meshes.length !== 1) throw new Error(`Expected one visual mesh, received ${meshes.length}.`);
const mesh = meshes[0];
const regionInspection = inspectRockRegionBindings(root);
const bounds = new THREE.Box3().setFromObject(root);
const size = bounds.getSize(new THREE.Vector3());
const center = bounds.getCenter(new THREE.Vector3());
root.position.y -= bounds.min.y;

const textureSlots = ['map', 'normalMap', 'aoMap', 'roughnessMap', 'metalnessMap'];
function materialList() {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}
function snapshot() {
  const materials = materialList();
  return {
    mesh,
    geometry: mesh.geometry,
    index: mesh.geometry.index,
    indexArray: mesh.geometry.index?.array,
    attributes: Object.fromEntries(Object.entries(mesh.geometry.attributes).map(([name, attribute]) => [
      name,
      { attribute, array: attribute.array },
    ])),
    materials,
    textures: materials.map((material) => Object.fromEntries(
      textureSlots.map((slot) => [slot, material?.[slot] ?? null]),
    )),
    materialWasArray: Array.isArray(mesh.material),
    userData: JSON.stringify(mesh.userData),
    castShadow: mesh.castShadow,
    receiveShadow: mesh.receiveShadow,
  };
}
const baseline = snapshot();

function exactRestore() {
  const materials = materialList();
  const currentAttributes = Object.entries(mesh.geometry.attributes);
  return mesh === baseline.mesh
    && mesh.geometry === baseline.geometry
    && mesh.geometry.index === baseline.index
    && mesh.geometry.index?.array === baseline.indexArray
    && Array.isArray(mesh.material) === baseline.materialWasArray
    && materials.length === baseline.materials.length
    && materials.every((material, index) => material === baseline.materials[index])
    && materials.every((material, materialIndex) => textureSlots.every(
      (slot) => material?.[slot] === baseline.textures[materialIndex][slot],
    ))
    && currentAttributes.length === Object.keys(baseline.attributes).length
    && currentAttributes.every(([name, attribute]) => (
      attribute === baseline.attributes[name]?.attribute
      && attribute.array === baseline.attributes[name]?.array
    ))
    && JSON.stringify(mesh.userData) === baseline.userData
    && mesh.castShadow === baseline.castShadow
    && mesh.receiveShadow === baseline.receiveShadow;
}

const STYLE = Object.freeze({
  preset: 'call_me_sensei',
  assetIntegration: Object.freeze({
    sourceAlbedoMode: 'blend',
    sourceAlbedoStrength: 0.76,
    sourceNormalStrength: 1,
    sourceAoStrength: 1,
    vertexColorStrength: 0,
    vertexAoStrength: 0,
    regionTintStrength: 0.2,
    regionBaseTint: Object.freeze([0.82, 0.72, 0.64]),
    regionShaftTint: Object.freeze([1, 0.96, 0.9]),
    regionNeckTint: Object.freeze([0.76, 0.63, 0.52]),
    regionCapTint: Object.freeze([0.8, 0.68, 0.56]),
    regionNeckOverlayStrength: 0.55,
  }),
  material: Object.freeze({ tint: Object.freeze([1, 0.93, 0.84]), metallic: 0, smoothness: 0.08 }),
  projection: Object.freeze({
    saturation: 0.88,
    contrast: 1.02,
    brightness: 0.015,
    projectionContrast: 1.35,
    nearDetailStrength: 0.28,
    nearDetailScale: 1.15,
  }),
  lighting: Object.freeze({
    exposure: 0.98,
    ambientFloor: 0.035,
    skyFillStrength: 0.78,
    skyFillTint: Object.freeze([0.82, 0.9, 1]),
  }),
  distanceTint: Object.freeze({ strength: 0 }),
  moss: Object.freeze({ enabled: false }),
  striping: Object.freeze({ enabled: false }),
});

let styled = false;
let styleReport = null;
function apply() {
  if (styled) return;
  styleReport = applyRockShader(root, STYLE, {
    castShadow: baseline.castShadow,
    receiveShadow: baseline.receiveShadow,
    detail: null,
    name: 'Packed consumer hoodoo',
    variation: 17,
  });
  styled = true;
}
function restore() {
  if (!styled) return 0;
  const count = restoreRockShader(root);
  styled = false;
  return count;
}

let restoreCount = 0;
for (let cycle = 0; cycle < 20; cycle += 1) {
  apply();
  restoreCount += restore();
}
if (!exactRestore()) throw new Error('Twenty packed-consumer restore cycles did not restore exact object identity.');

const camera = new THREE.PerspectiveCamera(34, 1, 0.01, 100);
const views = {
  front: [0, size.y * 0.52, Math.max(size.z, 1) * 4.1],
  rear: [0, size.y * 0.52, -Math.max(size.z, 1) * 4.1],
  left: [-Math.max(size.x, 1) * 4.1, size.y * 0.52, 0],
  right: [Math.max(size.x, 1) * 4.1, size.y * 0.52, 0],
  top: [0, Math.max(size.y, 1) * 4.1, 0.001],
  bottom: [0, -Math.max(size.y, 1) * 4.1, 0.001],
};
function setView(view = 'front') {
  camera.position.fromArray(views[view] ?? views.front);
  camera.up.set(0, 1, 0);
  if (view === 'top') camera.up.set(0, 0, -1);
  if (view === 'bottom') camera.up.set(0, 0, 1);
  camera.lookAt(center.x, size.y * 0.5, center.z);
  camera.updateProjectionMatrix();
}
setView(params.get('view') ?? 'front');

function report(mode) {
  const result = {
    schema: 'toonlab/rock-region-clean-consumer',
    version: 1,
    passed: exactRestore() || mode === 'styled',
    backendRequested: backend,
    backendActual: renderer.backend?.isWebGPUBackend ? 'webgpu' : 'webgl',
    mode,
    restoreCycles: 20,
    restoreCount,
    exactRestore: mode === 'styled' ? null : exactRestore(),
    regionVertices: regionInspection.totalVertices,
    regionBytes: regionInspection.totalBytes,
    retainedSourceTextures: styleReport?.retainedSourceTextures ?? null,
    geometryDetail: styleReport?.geometryDetail ?? null,
  };
  document.body.dataset.rockRegionReport = JSON.stringify(result);
  document.body.dataset.rockRegionReady = 'true';
  status.textContent = `${result.backendActual} · ${mode} · ${result.regionVertices.toLocaleString()} semantic vertices`;
  return result;
}

async function setMode(mode) {
  document.body.dataset.rockRegionReady = 'false';
  if (mode === 'styled') apply();
  else if (mode === 'restored') {
    apply();
    restoreCount += restore();
    if (!exactRestore()) throw new Error('Restore transition lost exact identity.');
  } else restore();
  if (renderer.renderAsync) await renderer.renderAsync(scene, camera);
  else renderer.render(scene, camera);
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  return report(mode);
}

window.__rockRegionQa = Object.freeze({
  setMode,
  setView(view) {
    setView(view);
  },
});

await renderer.compileAsync?.(scene, camera);
await setMode('neutral');
