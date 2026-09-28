import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { createPostProcessingPipeline } from '../../src/post/index.js';
import { inspectRockRegionBindings } from '../../src/rock-shader/rockRegionRuntime.js';
import { applyRockShader, restoreRockShader } from '../../src/rock-shader/rockShaderRuntime.js';
import { createSkySystem } from '../../src/sky/index.js';
import {
  CALL_ME_SENSEI_STYLE_BUNDLE,
  createSceneStyleRuntime,
  createStyleTarget,
  createStyleTargetLabel,
  labelStyleTarget,
} from '../../src/styles/index.js';
import { createLabRenderer, whenRendererReady } from '../shared/rendererFactory.js';

const HOODOO_URL = '/artifacts/research/rock-geology-v2/checkpoint-11-stylization/'
  + 'hoodoo-caprock/semantic-regions/hoodoo-caprock-lod0-desktop-4k-regions.glb';
const params = new URLSearchParams(location.search);
const view = ['front', 'rear', 'left', 'right', 'top', 'bottom', 'threeQuarter', 'contact']
  .includes(params.get('view')) ? params.get('view') : 'threeQuarter';
const initialMode = ['neutral', 'styled', 'restored'].includes(params.get('mode'))
  ? params.get('mode') : 'neutral';
const restoreCycles = Math.max(1, Math.min(100, Number(params.get('cycles')) || 20));
const freezeAfterWarmup = params.get('capture') === '1';
document.body.dataset.hud = String(params.get('hud') !== '0');

const HOODOO_C11_STYLE = Object.freeze({
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

const stage = document.getElementById('stage');
const status = document.getElementById('status');
const renderer = createLabRenderer({ alpha: false, antialias: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
stage.append(renderer.domElement);
await whenRendererReady(renderer);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#87b6d6');
scene.fog = new THREE.Fog('#b7d8e8', 45, 180);
const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 500);

const gltf = await new GLTFLoader().loadAsync(HOODOO_URL);
const root = gltf.scene;
const meshes = [];
root.traverse((object) => {
  if (!object.isMesh) return;
  object.castShadow = true;
  object.receiveShadow = true;
  meshes.push(object);
});
if (meshes.length !== 1) throw new Error(`Expected one hoodoo mesh, found ${meshes.length}.`);
const regionInspection = inspectRockRegionBindings(root, { requireEveryMesh: true, sampleValues: true });
const sourceBounds = new THREE.Box3().setFromObject(root);
const sourceCentre = sourceBounds.getCenter(new THREE.Vector3());
root.position.set(-sourceCentre.x, -sourceBounds.min.y, -sourceCentre.z);
root.updateMatrixWorld(true);
scene.add(root);
const bounds = new THREE.Box3().setFromObject(root);
const size = bounds.getSize(new THREE.Vector3());

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(160, 160, 64, 64),
  new THREE.MeshStandardMaterial({ color: '#80735e', metalness: 0, roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.008;
ground.receiveShadow = true;
ground.castShadow = false;
ground.name = 'C11 production ground';
scene.add(ground);

labelStyleTarget(root, createStyleTargetLabel('natural.rock', { targetId: 'c11/hoodoo' }));
labelStyleTarget(ground, createStyleTargetLabel('terrain.ground', { targetId: 'c11/ground' }));

function textureSlots(material) {
  return Object.fromEntries([
    'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap',
    'alphaMap', 'specularIntensityMap', 'clearcoatMap', 'clearcoatNormalMap',
  ].map((slot) => [slot, material?.[slot] ?? null]));
}

async function digestView(viewValue) {
  if (!viewValue) return null;
  const bytes = new Uint8Array(viewValue.buffer, viewValue.byteOffset, viewValue.byteLength);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

async function captureMeshState(mesh) {
  const attributes = {};
  for (const [name, attribute] of Object.entries(mesh.geometry.attributes)) {
    attributes[name] = {
      attribute,
      array: attribute.array,
      bytesSha256: await digestView(attribute.array),
    };
  }
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return {
    mesh,
    geometry: mesh.geometry,
    index: mesh.geometry.index,
    indexArray: mesh.geometry.index?.array ?? null,
    indexSha256: await digestView(mesh.geometry.index?.array ?? null),
    attributes,
    attributeNames: Object.keys(attributes).sort(),
    materials,
    materialWasArray: Array.isArray(mesh.material),
    textures: materials.map(textureSlots),
    castShadow: mesh.castShadow,
    receiveShadow: mesh.receiveShadow,
    userDataJson: JSON.stringify(mesh.userData),
  };
}

async function compareMeshState(before, mesh) {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const attributes = {};
  for (const name of before.attributeNames) {
    const current = mesh.geometry.getAttribute(name);
    attributes[name] = current === before.attributes[name].attribute
      && current?.array === before.attributes[name].array
      && (await digestView(current?.array ?? null)) === before.attributes[name].bytesSha256;
  }
  const result = {
    meshIdentity: mesh === before.mesh,
    geometryIdentity: mesh.geometry === before.geometry,
    indexIdentity: mesh.geometry.index === before.index,
    indexArrayIdentity: mesh.geometry.index?.array === before.indexArray,
    indexBytesEqual: (await digestView(mesh.geometry.index?.array ?? null)) === before.indexSha256,
    attributeInventoryEqual: JSON.stringify(Object.keys(mesh.geometry.attributes).sort()) === JSON.stringify(before.attributeNames),
    attributes,
    materialArrayShapeEqual: Array.isArray(mesh.material) === before.materialWasArray,
    materialIdentity: materials.length === before.materials.length
      && materials.every((material, index) => material === before.materials[index]),
    textureIdentity: materials.length === before.textures.length
      && materials.every((material, materialIndex) => Object.entries(before.textures[materialIndex])
        .every(([slot, texture]) => material?.[slot] === texture)),
    castShadowEqual: mesh.castShadow === before.castShadow,
    receiveShadowEqual: mesh.receiveShadow === before.receiveShadow,
    userDataEqual: JSON.stringify(mesh.userData) === before.userDataJson,
  };
  result.passed = Object.entries(result)
    .filter(([key]) => !['attributes', 'passed'].includes(key))
    .every(([, passed]) => passed === true)
    && Object.values(attributes).every(Boolean);
  return result;
}

const baseline = await captureMeshState(meshes[0]);
const baselineMaterial = meshes[0].material;
const sky = await createSkySystem({ camera, renderer, scene, quality: 'medium' });
const post = createPostProcessingPipeline({ camera, renderer, scene, settings: { preset: 'off' } });
const runtime = createSceneStyleRuntime({
  collision: false,
  fog: scene.fog,
  post,
  quality: 'balanced',
  renderer,
  scene,
  sky,
  timeOfDay: 13,
});
const application = await runtime.apply(CALL_ME_SENSEI_STYLE_BUNDLE, {
  discovery: 'manual',
  mode: 'strict',
  targets: [createStyleTarget('c11/ground', 'terrain.ground', ground)],
});
if (meshes[0].material !== baselineMaterial) {
  throw new Error('Shared scene style application modified the hoodoo before the controlled rock toggle.');
}

function orientCamera(selectedView) {
  const height = size.y;
  const targetY = height * 0.46;
  const distance = height * 2.25;
  const shots = {
    front: [[0, targetY, distance], [0, targetY, 0], [0, 1, 0]],
    rear: [[0, targetY, -distance], [0, targetY, 0], [0, 1, 0]],
    left: [[-distance, targetY, 0], [0, targetY, 0], [0, 1, 0]],
    right: [[distance, targetY, 0], [0, targetY, 0], [0, 1, 0]],
    top: [[0, distance, 0], [0, 0, 0], [0, 0, -1]],
    bottom: [[0, -distance, 0], [0, height * 0.38, 0], [0, 0, 1]],
    threeQuarter: [[distance * 0.72, height * 0.8, distance * 0.84], [0, targetY, 0], [0, 1, 0]],
    contact: [[distance * 0.76, height * 0.17, distance * 0.72], [0, height * 0.22, 0], [0, 1, 0]],
  };
  const [position, target, up] = shots[selectedView];
  camera.position.set(...position);
  camera.up.set(...up);
  camera.lookAt(...target);
  camera.updateProjectionMatrix();
  ground.visible = !['top', 'bottom'].includes(selectedView);
}
orientCamera(view);

let activeMode = initialMode;
let styledActive = false;
let styleReport = null;
let restoreReport = null;
let frames = 0;
let systemsWarmed = false;
let transitionFrames = 0;
const applyStyle = () => {
  styleReport = applyRockShader(root, HOODOO_C11_STYLE, {
    castShadow: baseline.castShadow,
    receiveShadow: baseline.receiveShadow,
    detail: null,
    name: 'ToonLab · C11 production hoodoo',
    variation: 17,
  });
  styledActive = true;
  return styleReport;
};

async function setMode(nextMode, cycles = 1) {
  document.body.dataset.ready = 'false';
  document.body.dataset.frames = '0';
  if (styledActive) {
    restoreRockShader(root);
    styledActive = false;
  }
  styleReport = null;
  restoreReport = null;
  if (nextMode === 'styled') {
    applyStyle();
  } else if (nextMode === 'restored') {
    let restored = 0;
    for (let index = 0; index < cycles; index += 1) {
      applyStyle();
      restored += restoreRockShader(root);
      styledActive = false;
    }
    restoreReport = {
      cycles,
      restored,
      secondRestoreCount: restoreRockShader(root),
      identity: await compareMeshState(baseline, meshes[0]),
    };
  }
  activeMode = nextMode;
  if (systemsWarmed && freezeAfterWarmup) transitionFrames = 0;
  else frames = 0;
  for (const button of document.querySelectorAll('[data-rock-mode]')) {
    button.setAttribute('aria-pressed', String(button.dataset.rockMode === activeMode));
  }
}
await setMode(initialMode, initialMode === 'restored' ? restoreCycles : 1);

function jsonClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildSceneLookSignature() {
  return {
    camera: {
      far: camera.far,
      fov: camera.fov,
      near: camera.near,
      position: camera.position.toArray(),
      quaternion: camera.quaternion.toArray(),
      projectionMatrix: camera.projectionMatrix.toArray(),
    },
    lighting: jsonClone(runtime.lighting.frame),
    fog: { color: scene.fog.color.getHex(), near: scene.fog.near, far: scene.fog.far },
    sky: jsonClone(sky.toParams()),
    post: jsonClone(post.settings),
    quality: jsonClone(runtime.quality),
    renderer: {
      backend: document.body.dataset.rendererBackend,
      outputColorSpace: renderer.outputColorSpace,
      toneMapping: renderer.toneMapping,
      toneMappingExposure: renderer.toneMappingExposure,
    },
  };
}

function publishReport() {
  const inspector = runtime.inspector.snapshot();
  const report = {
    schema: 'toonlab/rock-geology-v2-c11-production-scene-proof',
    version: 1,
    asset: { url: HOODOO_URL, triangles: 180000, meshCount: meshes.length },
    mode: activeMode,
    view,
    rendererBackend: document.body.dataset.rendererBackend,
    style: HOODOO_C11_STYLE,
    styleReport,
    restore: restoreReport,
    semanticRegions: {
      passed: regionInspection.passed,
      meshCount: regionInspection.meshCount,
      totalVertices: regionInspection.totalVertices,
      totalBytes: regionInspection.totalBytes,
    },
    application: {
      discovery: application.discovery,
      objectTargetIds: application.applied.map((entry) => entry.targetId),
      systemTargetIds: application.systems.applied.map((entry) => entry.targetId),
      hoodooWasSceneStyleTarget: application.applied.some((entry) => entry.targetId === 'c11/hoodoo'),
    },
    inspector,
    shadowPass: {
      health: runtime.shadowPass?.health ?? null,
      casterCoverage: runtime.shadowPass?.casterCoverage ?? null,
      receiverCoverage: runtime.shadowPass?.receiverCoverage ?? null,
    },
    sceneLookSignature: buildSceneLookSignature(),
  };
  document.body.dataset.productionReport = JSON.stringify(report);
  document.body.dataset.ready = 'true';
  status.textContent = `${activeMode} · ${view} · shared scene · ${report.rendererBackend} · shadow ${report.shadowPass.health?.ok ? 'healthy' : 'warming'}`;
}

function resize() {
  const width = Math.max(1, stage.clientWidth || innerWidth);
  const height = Math.max(1, stage.clientHeight || innerHeight);
  const pixelRatio = Math.min(devicePixelRatio, 2);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  sky.resize?.(width, height);
  post.setSize(width, height, pixelRatio);
}
resize();
addEventListener('resize', resize);

for (const button of document.querySelectorAll('[data-rock-mode]')) {
  button.addEventListener('click', () => setMode(
    button.dataset.rockMode,
    button.dataset.rockMode === 'restored' ? restoreCycles : 1,
  ).catch((error) => {
    document.body.dataset.error = String(error);
  }));
}
addEventListener('keydown', (event) => {
  const nextMode = { Digit1: 'neutral', Digit2: 'styled', Digit3: 'restored' }[event.code];
  if (nextMode) setMode(nextMode, nextMode === 'restored' ? restoreCycles : 1)
    .catch((error) => { document.body.dataset.error = String(error); });
});

renderer.setAnimationLoop(() => {
  if (!systemsWarmed || !freezeAfterWarmup) {
    sky.update(0);
    runtime.update(1 / 60, camera);
  }
  post.render(0);
  frames += 1;
  document.body.dataset.frames = String(frames);
  if (!systemsWarmed && frames >= 32) {
    systemsWarmed = true;
    publishReport();
  } else if (systemsWarmed && freezeAfterWarmup && document.body.dataset.ready !== 'true') {
    transitionFrames += 1;
    if (transitionFrames >= 4) publishReport();
  }
});

addEventListener('pagehide', () => {
  runtime.dispose();
  sky.dispose();
  post.dispose();
}, { once: true });

globalThis.__TOONLAB_C11_PRODUCTION = { camera, post, renderer, root, runtime, scene, sky };
