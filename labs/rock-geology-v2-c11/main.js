import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import {
  applyRockShader,
  restoreRockShader,
} from '../../src/rock-shader/rockShaderRuntime.js';
import { inspectRockRegionBindings } from '../../src/rock-shader/rockRegionRuntime.js';
import { createLabRenderer, whenRendererReady } from '../shared/rendererFactory.js';

const CANONICAL_HOODOO_URL = '/artifacts/research/rock-geology-v2/checkpoint-09-tripo-p1-pilot/'
  + 'hoodoo-caprock/v31-scan-assisted-runtime-package/exports/'
  + 'hoodoo-caprock-lod0-desktop-4k.glb';
const REGION_HOODOO_URL = '/artifacts/research/rock-geology-v2/checkpoint-11-stylization/'
  + 'hoodoo-caprock/semantic-regions/'
  + 'hoodoo-caprock-lod0-desktop-4k-regions.glb';

const params = new URLSearchParams(location.search);
const regionMode = params.get('regions') === '1';
const HOODOO_URL = regionMode ? REGION_HOODOO_URL : CANONICAL_HOODOO_URL;
const mode = ['neutral', 'styled', 'restored'].includes(params.get('mode'))
  ? params.get('mode')
  : 'neutral';
const view = ['front', 'rear', 'left', 'right', 'top', 'bottom', 'threeQuarter', 'detail']
  .includes(params.get('view'))
  ? params.get('view')
  : 'threeQuarter';
const styleVariant = ['faithful', 'color-preserve', 'warm', 'heroic', 'toon', 'graphic'].includes(params.get('style'))
  ? params.get('style')
  : 'toon';
const restoreCycles = Math.max(1, Math.min(100, Number(params.get('cycles')) || 20));
document.body.dataset.hud = String(params.get('hud') !== '0');

// This is intentionally a material-only style document. C11 must preserve the
// canonical geometry, UVs, source PBR, HeightMicro, and signed HeightResidual.
// Shape-altering style controls belong on a duplicated high source followed by
// a full LOD/rebake pass; they are not legal in this reversible runtime proof.
const STYLE_VARIANTS = Object.freeze({
  faithful: Object.freeze({
    sourceAlbedoMode: 'blend',
    sourceAlbedoStrength: 0.76,
    tint: Object.freeze([1, 0.93, 0.84]),
    saturation: 0.88,
    contrast: 1.02,
    brightness: 0.015,
    projectionContrast: 1.35,
    nearDetailStrength: 0.28,
  }),
  'color-preserve': Object.freeze({
    sourceAlbedoMode: 'retain',
    sourceAlbedoStrength: 1,
    tint: Object.freeze([1, 1, 1]),
    saturation: 0.94,
    contrast: 1,
    brightness: 0,
    projectionContrast: 1.35,
    nearDetailStrength: 0.28,
  }),
  warm: Object.freeze({
    sourceAlbedoMode: 'blend',
    sourceAlbedoStrength: 0.68,
    tint: Object.freeze([1, 0.7, 0.44]),
    saturation: 0.86,
    contrast: 0.9,
    brightness: 0.025,
    projectionContrast: 1.85,
    nearDetailStrength: 0.24,
  }),
  heroic: Object.freeze({
    sourceAlbedoMode: 'blend',
    sourceAlbedoStrength: 0.52,
    tint: Object.freeze([1, 0.64, 0.36]),
    saturation: 0.94,
    contrast: 1.22,
    brightness: -0.015,
    projectionContrast: 2.35,
    nearDetailStrength: 0.38,
  }),
  toon: Object.freeze({
    sourceAlbedoMode: 'blend',
    sourceAlbedoStrength: 0.6,
    tint: Object.freeze([1, 0.88, 0.7]),
    saturation: 0.74,
    contrast: 0.88,
    brightness: 0.045,
    projectionContrast: 1.85,
    nearDetailStrength: 0.24,
  }),
  graphic: Object.freeze({
    sourceAlbedoMode: 'blend',
    sourceAlbedoStrength: 0.46,
    tint: Object.freeze([1, 0.82, 0.6]),
    saturation: 0.6,
    contrast: 0.78,
    brightness: 0.07,
    projectionContrast: 2.25,
    nearDetailStrength: 0.18,
  }),
});
const selectedStyle = STYLE_VARIANTS[styleVariant];

export const HOODOO_C11_STYLE = Object.freeze({
  preset: 'call_me_sensei',
  assetIntegration: Object.freeze({
    sourceAlbedoMode: selectedStyle.sourceAlbedoMode,
    sourceAlbedoStrength: selectedStyle.sourceAlbedoStrength,
    sourceNormalStrength: 1,
    sourceAoStrength: 1,
    vertexColorStrength: 0,
    vertexAoStrength: 0,
    regionTintStrength: regionMode ? 0.2 : 0,
    regionBaseTint: Object.freeze([0.82, 0.72, 0.64]),
    regionShaftTint: Object.freeze([1, 0.96, 0.9]),
    regionNeckTint: Object.freeze([0.76, 0.63, 0.52]),
    regionCapTint: Object.freeze([0.8, 0.68, 0.56]),
    regionNeckOverlayStrength: 0.55,
  }),
  material: Object.freeze({
    tint: selectedStyle.tint,
    metallic: 0,
    smoothness: 0.08,
  }),
  projection: Object.freeze({
    saturation: selectedStyle.saturation,
    contrast: selectedStyle.contrast,
    brightness: selectedStyle.brightness,
    projectionContrast: selectedStyle.projectionContrast,
    nearDetailStrength: selectedStyle.nearDetailStrength,
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
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.03;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.append(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#151c24');

// Fixed neutral studio lighting. The rock material is the only variable across
// neutral/styled/restored captures. A low fill makes the support footprint
// legible in the mandatory bottom view without changing its silhouette.
scene.add(new THREE.HemisphereLight('#dcecff', '#75624e', 1.45));
const key = new THREE.DirectionalLight('#fff0d5', 3.4);
key.position.set(-5.5, 8.5, 7);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -4;
key.shadow.camera.right = 4;
key.shadow.camera.top = 5;
key.shadow.camera.bottom = -5;
key.shadow.camera.near = 0.1;
key.shadow.camera.far = 30;
key.shadow.bias = -0.00035;
scene.add(key);
const fill = new THREE.DirectionalLight('#8fb7dc', 1.15);
fill.position.set(6, 3, -5);
scene.add(fill);
const supportFill = new THREE.DirectionalLight('#d9b68f', 0.82);
supportFill.position.set(0, -7, 1.5);
scene.add(supportFill);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(30, 30),
  new THREE.MeshStandardMaterial({ color: '#5c5a54', roughness: 1, metalness: 0 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

await whenRendererReady(renderer);
const gltf = await new GLTFLoader().loadAsync(HOODOO_URL);
const root = gltf.scene;
const meshes = [];
root.traverse((object) => {
  if (!object.isMesh) return;
  object.castShadow = true;
  object.receiveShadow = true;
  meshes.push(object);
});
if (meshes.length !== 1) throw new Error(`Expected one hoodoo mesh, found ${meshes.length}`);
const rockRegionInspection = regionMode
  ? inspectRockRegionBindings(root, { requireEveryMesh: true, sampleValues: true })
  : null;

const initialBounds = new THREE.Box3().setFromObject(root);
const initialCentre = initialBounds.getCenter(new THREE.Vector3());
root.position.sub(initialCentre);
root.updateMatrixWorld(true);
scene.add(root);
const bounds = new THREE.Box3().setFromObject(root);
const size = bounds.getSize(new THREE.Vector3());
ground.position.y = bounds.min.y - 0.008;

function textureSlots(material) {
  const slots = [
    'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap',
    'alphaMap', 'specularIntensityMap', 'clearcoatMap', 'clearcoatNormalMap',
  ];
  return Object.fromEntries(slots.map((slot) => [slot, material?.[slot] ?? null]));
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
      count: attribute.count,
      itemSize: attribute.itemSize,
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
    drawRange: { ...mesh.geometry.drawRange },
    groups: mesh.geometry.groups.map((group) => ({ ...group })),
    materialWasArray: Array.isArray(mesh.material),
    materials,
    textures: materials.map(textureSlots),
    castShadow: mesh.castShadow,
    receiveShadow: mesh.receiveShadow,
    userDataJson: JSON.stringify(mesh.userData),
  };
}

async function compareMeshState(before, mesh) {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const currentNames = Object.keys(mesh.geometry.attributes).sort();
  const attributeChecks = {};
  for (const name of before.attributeNames) {
    const current = mesh.geometry.getAttribute(name);
    attributeChecks[name] = {
      attributeIdentity: current === before.attributes[name].attribute,
      arrayIdentity: current?.array === before.attributes[name].array,
      bytesSha256: await digestView(current?.array ?? null),
      bytesEqual: (await digestView(current?.array ?? null)) === before.attributes[name].bytesSha256,
    };
  }
  const materialIdentity = materials.length === before.materials.length
    && materials.every((material, index) => material === before.materials[index]);
  const textureIdentity = materials.length === before.textures.length
    && materials.every((material, materialIndex) => Object.entries(before.textures[materialIndex])
      .every(([slot, texture]) => material?.[slot] === texture));
  const result = {
    meshIdentity: mesh === before.mesh,
    geometryIdentity: mesh.geometry === before.geometry,
    indexIdentity: mesh.geometry.index === before.index,
    indexArrayIdentity: mesh.geometry.index?.array === before.indexArray,
    indexBytesEqual: (await digestView(mesh.geometry.index?.array ?? null)) === before.indexSha256,
    attributeInventoryEqual: JSON.stringify(currentNames) === JSON.stringify(before.attributeNames),
    attributes: attributeChecks,
    drawRangeEqual: JSON.stringify(mesh.geometry.drawRange) === JSON.stringify(before.drawRange),
    groupsEqual: JSON.stringify(mesh.geometry.groups) === JSON.stringify(before.groups),
    materialArrayShapeEqual: Array.isArray(mesh.material) === before.materialWasArray,
    materialIdentity,
    textureIdentity,
    castShadowEqual: mesh.castShadow === before.castShadow,
    receiveShadowEqual: mesh.receiveShadow === before.receiveShadow,
    userDataEqual: JSON.stringify(mesh.userData) === before.userDataJson,
  };
  result.passed = Object.entries(result)
    .filter(([key]) => key !== 'attributes' && key !== 'passed')
    .every(([, value]) => value === true)
    && Object.values(attributeChecks).every((record) => (
      record.attributeIdentity
      && record.arrayIdentity
      && record.bytesEqual
    ));
  return result;
}

const baseline = await captureMeshState(meshes[0]);
const styleReports = [];
let activeMode = mode;
let restoreCount = 0;
let activeRestoreCycles = mode === 'restored' ? restoreCycles : 0;
let activeIdentity = null;
let activeSecondRestoreCount = null;
let styledActive = false;

const applyStyle = () => styleReports.push(applyRockShader(root, HOODOO_C11_STYLE, {
  castShadow: baseline.castShadow,
  receiveShadow: baseline.receiveShadow,
  detail: null,
  name: 'ToonLab · C11 Hoodoo caprock',
  variation: 17,
}));

if (mode === 'styled') {
  applyStyle();
  styledActive = true;
} else if (mode === 'restored') {
  for (let cycle = 0; cycle < restoreCycles; cycle += 1) {
    applyStyle();
    restoreCount += restoreRockShader(root);
  }
}

activeIdentity = mode === 'restored'
  ? await compareMeshState(baseline, meshes[0])
  : null;
activeSecondRestoreCount = mode === 'restored' ? restoreRockShader(root) : null;

const aspect = Math.max(1, stage.clientWidth || innerWidth) / Math.max(1, stage.clientHeight || innerHeight);
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);

function orientCamera(selectedView) {
  const distance = Math.max(size.x, size.y, size.z) * 3.2;
  const definitions = {
    front: { position: [0, 0, distance], up: [0, 1, 0], width: size.x, height: size.y },
    rear: { position: [0, 0, -distance], up: [0, 1, 0], width: size.x, height: size.y },
    left: { position: [-distance, 0, 0], up: [0, 1, 0], width: size.z, height: size.y },
    right: { position: [distance, 0, 0], up: [0, 1, 0], width: size.z, height: size.y },
    top: { position: [0, distance, 0], up: [0, 0, -1], width: size.x, height: size.z },
    bottom: { position: [0, -distance, 0], up: [0, 0, 1], width: size.x, height: size.z },
    threeQuarter: {
      position: [distance * 0.68, distance * 0.38, distance * 0.78],
      up: [0, 1, 0], width: size.x * 1.18, height: size.y,
    },
    detail: {
      position: [distance * 0.52, distance * 0.12, distance * 0.72],
      up: [0, 1, 0], width: size.x * 0.72, height: size.y * 0.58,
      target: [0, size.y * 0.16, 0],
    },
  };
  const shot = definitions[selectedView];
  const target = new THREE.Vector3(...(shot.target ?? [0, 0, 0]));
  camera.position.set(...shot.position);
  camera.up.set(...shot.up);
  camera.lookAt(target);
  const halfHeight = Math.max(shot.height * 0.54, (shot.width * 0.54) / aspect);
  camera.left = -halfHeight * aspect;
  camera.right = halfHeight * aspect;
  camera.top = halfHeight;
  camera.bottom = -halfHeight;
  camera.updateProjectionMatrix();
}

orientCamera(view);
ground.visible = !['top', 'bottom'].includes(view);

function resize() {
  const width = stage.clientWidth || innerWidth;
  const height = stage.clientHeight || innerHeight;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(width, height, false);
}
resize();
addEventListener('resize', resize);

function buildReport() {
  const styleReport = styleReports.at(-1) ?? null;
  return {
    schema: 'toonlab/rock-geology-v2-c11-browser-proof',
    version: 1,
    asset: {
      url: HOODOO_URL,
      meshCount: meshes.length,
      meshName: meshes[0].name,
      geometryName: meshes[0].geometry.name,
      dimensionsMetres: size.toArray(),
      triangles: meshes[0].geometry.index
        ? meshes[0].geometry.index.count / 3
        : meshes[0].geometry.getAttribute('position').count / 3,
    },
    mode: activeMode,
    styleVariant,
    regionMode,
    view,
    rendererKind: document.body.dataset.rendererKind,
    rendererBackend: document.body.dataset.rendererBackend,
    style: HOODOO_C11_STYLE,
    styleReport: activeMode === 'neutral' ? null : styleReport,
    retainedSourcePbr: activeMode === 'neutral' || !styleReport ? null : {
      retainedSourceTextures: styleReport.retainedSourceTextures,
      rejectedTextures: styleReport.rejectedTextures,
      geometryDetail: styleReport.geometryDetail,
    },
    restore: activeMode === 'restored' ? {
      cycles: activeRestoreCycles,
      restoreCount,
      secondRestoreCount: activeSecondRestoreCount,
      identity: activeIdentity,
    } : null,
    semanticMaskStatus: rockRegionInspection ? {
      passed: true,
      attribute: '_tl_rock_region',
      channels: ['base', 'shaft', 'neck', 'cap'],
      encoding: 'unorm8',
      meshCount: rockRegionInspection.meshCount,
      totalVertices: rockRegionInspection.totalVertices,
      totalBytes: rockRegionInspection.totalBytes,
      sourcePbrRebaked: false,
    } : {
      passed: false,
      reason: 'Canonical parent GLB intentionally has no region accessor; use regions=1 for the byte-preserving derived semantic GLB.',
    },
  };
}

function publishReport() {
  const report = buildReport();
  status.textContent = `${activeMode} · ${styleVariant} · ${view} · ${report.asset.triangles.toLocaleString()} tris · ${report.rendererBackend}`;
  document.body.dataset.rockReport = JSON.stringify(report);
  document.body.dataset.transitionReady = 'true';
  for (const button of document.querySelectorAll('[data-rock-mode]')) {
    button.setAttribute('aria-pressed', String(button.dataset.rockMode === activeMode));
  }
}

async function transitionTo(nextMode) {
  document.body.dataset.transitionReady = 'false';
  if (nextMode === 'styled') {
    if (!styledActive) {
      applyStyle();
      styledActive = true;
    }
    activeMode = 'styled';
    activeRestoreCycles = 0;
    activeIdentity = null;
    activeSecondRestoreCount = null;
  } else if (nextMode === 'neutral') {
    if (styledActive) {
      restoreRockShader(root);
      styledActive = false;
    }
    activeMode = 'neutral';
    activeRestoreCycles = 0;
    activeIdentity = null;
    activeSecondRestoreCount = null;
  } else {
    let cycleRestoreCount = 0;
    if (!styledActive) {
      applyStyle();
      styledActive = true;
    }
    cycleRestoreCount += restoreRockShader(root);
    styledActive = false;
    activeMode = 'restored';
    activeRestoreCycles = 1;
    restoreCount = cycleRestoreCount;
    activeIdentity = await compareMeshState(baseline, meshes[0]);
    activeSecondRestoreCount = restoreRockShader(root);
  }
  publishReport();
}

for (const button of document.querySelectorAll('[data-rock-mode]')) {
  button.addEventListener('click', () => {
    transitionTo(button.dataset.rockMode).catch((error) => {
      document.body.dataset.transitionError = String(error);
      document.body.dataset.transitionReady = 'error';
    });
  });
}
addEventListener('keydown', (event) => {
  const keyboardModes = { Digit1: 'neutral', Digit2: 'styled', Digit3: 'restored' };
  const nextMode = keyboardModes[event.code];
  if (!nextMode) return;
  transitionTo(nextMode).catch((error) => {
    document.body.dataset.transitionError = String(error);
    document.body.dataset.transitionReady = 'error';
  });
});

publishReport();

renderer.setAnimationLoop(() => renderer.render(scene, camera));
await renderer.compileAsync?.(scene, camera);
renderer.render(scene, camera);
await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
document.body.dataset.modelReady = 'true';
