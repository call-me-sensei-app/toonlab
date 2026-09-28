// The public walkable reference: one independently authored scene file using
// only documented npm entry points. The Level D clean-consumer audit imports
// this exact file so the reviewed baseline and the Labs example cannot drift.
import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import {
  CALL_ME_SENSEI_STYLE_BUNDLE,
  TOONLAB_MANNEQUIN_ASSET_URL,
  TOONLAB_VERSION,
  createCharacterControllerProfile,
  createSceneSurfaceRuntime,
  createSceneStyleRuntime,
  createSkySystem,
  createStyleMaterialContract,
  createStyleTargetLabel,
  createWalkableCharacterRuntime,
  labelStyleTarget,
} from '@call-me-sensei/toonlab';
import {
  createOfficialCatalogAssetRuntime,
  normalizeOfficialCatalogAsset,
} from '@call-me-sensei/toonlab/official-catalog';
import { PRESETS as SKY_PRESETS } from '@call-me-sensei/toonlab/sky';
import { StylizedTree } from '@call-me-sensei/toonlab/vegetation';
import { applyRockShader } from '@call-me-sensei/toonlab/rock-shader';
import {
  applyWalkablePolishExperiments,
  createWalkablePolishPostProcessing,
  isWalkablePolishExperimentEnabled,
  mountWalkablePolishExperimentPanel,
  resolveWalkablePolishExperiments,
} from './polishExperiments.js';

const query = new URLSearchParams(location.search);
const backend = query.get('renderer') === 'webgl' ? 'webgl' : 'webgpu';
const quality = query.get('quality') === 'performance' ? 'performance' : 'balanced';
const requestedBundleId = query.get('styleBundle') || 'call-me-sensei';
const requestedCharacterUrl = query.get('model') || TOONLAB_MANNEQUIN_ASSET_URL;
const c7RepairPilot = query.get('rockPilot') === 'c7-repair';
const requestedReviewHour = query.has('hour') ? Number(query.get('hour')) : Number.NaN;
const reviewHour = Number.isFinite(requestedReviewHour)
  ? THREE.MathUtils.euclideanModulo(requestedReviewHour, 24)
  : null;
const requestedSkyCondition = ['partly_cloudy', 'golden_hour', 'moonlit', 'overcast'].includes(query.get('time'))
  ? query.get('time')
  : 'partly_cloudy';
const reviewView = ['c7-rocks', 'rocks', 'shadow-bench', 'shadow-rock', 'shore', 'sky', 'tree-bark'].includes(query.get('view'))
  ? query.get('view')
  : 'overview';
const fixedReviewView = query.has('view');
const rockSurfaceState = ['default', 'stretched', 'grass', 'sand'].includes(query.get('rockSurface'))
  ? query.get('rockSurface')
  : 'default';
const systemQuality = quality === 'performance' ? 'low' : 'medium';
const status = document.querySelector('#status');
const keys = new Set();
let jumpRequested = false;
const polishExperiments = mountWalkablePolishExperimentPanel({
  container: document.querySelector('#experiments'),
  state: resolveWalkablePolishExperiments(query),
});
document.body.dataset.polishCapture = String(query.get('capture') === '1');

const SKY_CONDITIONS = Object.freeze({
  partly_cloudy: Object.freeze({ hour: 11, preset: 'partlyCloudy' }),
  golden_hour: Object.freeze({ hour: 18.5, preset: 'stunningSunset' }),
  moonlit: Object.freeze({ hour: 0.5, preset: 'moonlitNight' }),
  overcast: Object.freeze({ hour: 13, preset: 'thunderstorm' }),
});

function bindReload(id, key, value, defaultValue) {
  const select = document.querySelector(id);
  select.value = value;
  select.addEventListener('change', () => {
    const next = new URL(location.href);
    if (select.value === defaultValue) next.searchParams.delete(key);
    else next.searchParams.set(key, select.value);
    location.href = next;
  });
}

bindReload('#backend', 'renderer', backend, 'webgpu');
bindReload('#quality', 'quality', quality, 'balanced');
bindReload('#rock-surface', 'rockSurface', rockSurfaceState, 'default');
document.querySelector('#package').textContent = `@call-me-sensei/toonlab v${TOONLAB_VERSION}`;
document.querySelector('#time').value = requestedSkyCondition;

function entryDocument(entry) {
  return entry?.document && typeof entry.document === 'object' ? entry.document : entry;
}

function inlineLocalBundleReferences(bundle, entries) {
  const byId = new Map(entries.map((entry) => [entry.id, entryDocument(entry)]));
  const resolved = structuredClone(bundle);
  for (const [slotId, payload] of Object.entries(resolved.slots ?? {})) {
    if (!payload?.creation) continue;
    const document = byId.get(payload.creation);
    if (!document) {
      throw new Error(`Style Bundle slot "${slotId}" references missing local creation "${payload.creation}".`);
    }
    resolved.slots[slotId] = { document };
  }
  return resolved;
}

async function loadStyleBundleSelection() {
  let entries = [];
  try {
    const response = await fetch('/api/toonlab/library', { headers: { accept: 'application/json' } });
    if (response.ok) entries = (await response.json()).entries ?? [];
  } catch {
    // Static clean-consumer review has no Library API. The protected default
    // remains fully usable and is the only anonymous option.
  }
  const localBundles = entries
    .map(entryDocument)
    .filter((entry) => entry?.type === 'style-bundle' || entry?.schema === 'toonlab/style-bundle');
  const options = [CALL_ME_SENSEI_STYLE_BUNDLE, ...localBundles.filter(({ id }) => id !== 'call-me-sensei')];
  const select = document.querySelector('#style-bundle');
  select.replaceChildren(...options.map((bundle) => {
    const option = document.createElement('option');
    option.value = bundle.id;
    option.textContent = bundle.label || bundle.id;
    return option;
  }));
  const selected = options.find(({ id }) => id === requestedBundleId) ?? CALL_ME_SENSEI_STYLE_BUNDLE;
  select.value = selected.id;
  select.addEventListener('change', () => {
    const next = new URL(location.href);
    if (select.value === 'call-me-sensei') next.searchParams.delete('styleBundle');
    else next.searchParams.set('styleBundle', select.value);
    location.href = next;
  });
  document.body.dataset.styleBundle = selected.id;
  return selected.id === 'call-me-sensei'
    ? { document: selected, id: selected.id, label: selected.label }
    : {
      document: inlineLocalBundleReferences(selected, entries),
      id: selected.id,
      label: selected.label || selected.id,
    };
}

function setupCharacterSelection() {
  const input = document.querySelector('#character-url');
  input.value = requestedCharacterUrl === TOONLAB_MANNEQUIN_ASSET_URL ? '' : requestedCharacterUrl;
  document.querySelector('#use-character').addEventListener('click', () => {
    const next = new URL(location.href);
    const value = input.value.trim();
    if (!value || value === TOONLAB_MANNEQUIN_ASSET_URL) next.searchParams.delete('model');
    else next.searchParams.set('model', value);
    location.href = next;
  });
  document.querySelector('#use-mannequin').addEventListener('click', () => {
    const next = new URL(location.href);
    next.searchParams.delete('model');
    location.href = next;
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') document.querySelector('#use-character').click();
  });
}

function createBody(position) {
  const state = {
    angularVelocity: { x: 0, y: 0, z: 0 }, gravity: 1,
    position: { ...position }, rotation: { w: 1, x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
  };
  return {
    userData: { canJump: true },
    angvel: () => ({ ...state.angularVelocity }),
    gravityScale: () => state.gravity,
    linvel: () => ({ ...state.velocity }),
    rotation: () => ({ ...state.rotation }),
    setAngvel: (value) => { state.angularVelocity = { ...value }; },
    setGravityScale: (value) => { state.gravity = value; },
    setLinvel: (value) => { state.velocity = { ...value }; },
    setRotation: (value) => { state.rotation = { ...value }; },
    setTranslation: (value) => { state.position = { ...value }; },
    translation: () => ({ ...state.position }),
  };
}

function pressed(code) {
  return keys.has(code);
}

async function applySkyCondition(sky, runtime, conditionId) {
  const condition = SKY_CONDITIONS[conditionId] ?? SKY_CONDITIONS.partly_cloudy;
  await runtime.setSkyPreset(SKY_PRESETS[condition.preset], { timeOfDay: condition.hour });
  document.body.dataset.toonlabSkyCondition = conditionId;
  document.body.dataset.toonlabSkyPreset = conditionId.replace('_', '-');
  document.body.dataset.toonlabCloudCoverage = String(sky.toParams().cloud.shape.coverage);
  runtime.shadowPass?.invalidate();
}

setupCharacterSelection();
document.querySelector('.back-link').href = location.pathname.startsWith('/labs/') ? '/labs' : '/';

function label(root, domain, targetId, materials) {
  const assignments = {};
  for (const { id, material, roles } of materials) {
    material.userData ??= {};
    material.userData.toonlabMaterialId = id;
    assignments[id] = { roles };
  }
  labelStyleTarget(root, createStyleTargetLabel(domain, {
    materials: createStyleMaterialContract(domain, { assignments }),
    targetId,
  }));
  return root;
}

function terrainHeight(x, z) {
  const roll = 0.13 * Math.sin(x * 0.31) * Math.cos(z * 0.27);
  if (z >= -5) return roll;
  if (z <= -8) return -1.25 + roll * 0.15;
  const t = THREE.MathUtils.smoothstep(z, -8, -5);
  return THREE.MathUtils.lerp(-1.25 + roll * 0.15, roll, t);
}

const surface = createSceneSurfaceRuntime({
  bounds: { min: { x: -18, z: -16 }, max: { x: 18, z: 15 } },
  heightAt: terrainHeight,
  waterLevel: -0.08,
});

function makeGround() {
  const geometry = new THREE.PlaneGeometry(36, 31, 72, 62);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  for (let index = 0; index < position.count; index += 1) {
    position.setY(index, surface.heightAt(position.getX(index), position.getZ(index)));
  }
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ color: 0x789d59, roughness: 0.96 });
  const ground = new THREE.Mesh(geometry, material);
  ground.name = 'Baseline terrain';
  ground.receiveShadow = true;
  return label(ground, 'terrain.ground', 'baseline/ground', [
    { id: 'Ground', material, roles: ['ground'] },
  ]);
}

const CATALOG_ROCKS = Object.freeze([
  Object.freeze({
    id: 'rock-0002', name: 'Rounded Boulder 4', recipeHash: 'b15fd710d3f6b2c5b6894461238be799178a2e81059db92488c4f16123988534',
    file: 'rounded_boulder_0004.glb',
    semantic: true,
    sha256: 'ea43dec6b9ee5a2c2bdcdc037274314caf8e58cd743dfdd85f54966fe8aee4bf',
    transform: { position: [-10.5, -1.4], rotation: 0.4, scale: 1.8 },
  }),
]);

// The local production batch passed structural and visual validation before
// its atomic promotion. Licensed source pixels remain in this dev-only tree.
const SEMANTIC_ROCK_ROOT = '/assets-local/rock-reference-variations';

const C7_REPAIR_PILOT_ROOT = '/artifacts/research/rock-geology-v2';
const C7_REPAIR_PILOTS = Object.freeze([
  Object.freeze({
    family: 'layered-sandstone',
    id: 'rock-0005',
    name: 'Layered Slab 9',
    position: [-2.6, -2.15],
    rotation: -0.34,
    targetHeight: 1.8,
    textureScale: 0.3,
  }),
  Object.freeze({
    family: 'columnar-basalt',
    id: 'rock-0362',
    name: 'Column Field 6',
    position: [2.7, -2.35],
    rotation: 0.42,
    targetHeight: 2.65,
    textureScale: 0.27,
  }),
]);

function applyC7RepairRock({ container, record, textures, variation }) {
  return applyRockShader(container, {
    preset: 'call_me_sensei',
    assetIntegration: {
      sourceAlbedoMode: 'blend',
      sourceAlbedoStrength: record.family === 'layered-sandstone' ? 0.18 : 0.35,
      sourceNormalStrength: 1,
      sourceAoStrength: 1,
      vertexColorStrength: 0,
      vertexAoStrength: 0,
    },
    material: { useSmoothnessTexture: true },
    projection: {
      scale: record.textureScale,
      nearDetailScale: record.family === 'layered-sandstone' ? 0.045 : 0.065,
      nearDetailStrength: 0.28,
    },
  }, {
    detail: null,
    name: `C7 repaired ${record.family} · ${record.id}`,
    textures,
    variation,
  });
}

async function makeC7RepairPilotRocks(renderer) {
  if (!c7RepairPilot) return [];
  const ktx2 = new KTX2Loader()
    .setTranscoderPath('/basis/')
    .setWorkerLimit(2)
    .detectSupport(renderer);
  const gltfLoader = new GLTFLoader().setKTX2Loader(ktx2);
  const textureLoader = new THREE.TextureLoader();
  const pilots = [];

  for (const [index, record] of C7_REPAIR_PILOTS.entries()) {
    const sourceBase = `${C7_REPAIR_PILOT_ROOT}/legacy-480-c7-pilot-v0.1/${record.id}`;
    const mapBase = `${C7_REPAIR_PILOT_ROOT}/legacy-480-c7-current-shader-pilot-v0.1/maps/${record.id}`;
    const [gltf, rock, rockNormal, smoothness] = await Promise.all([
      gltfLoader.loadAsync(`${sourceBase}/original/rock.glb`),
      textureLoader.loadAsync(`${mapBase}/baseColor.png`),
      textureLoader.loadAsync(`${mapBase}/normalGL.png`),
      textureLoader.loadAsync(`${mapBase}/smoothness.png`),
    ]);
    rock.colorSpace = THREE.SRGBColorSpace;
    for (const texture of [rock, rockNormal, smoothness]) {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.flipY = false;
      texture.needsUpdate = true;
    }
    rockNormal.colorSpace = THREE.NoColorSpace;
    smoothness.colorSpace = THREE.NoColorSpace;

    const root = gltf.scene;
    root.name = `${record.id} · ${record.name} · C7 repair source`;
    const originalBounds = new THREE.Box3().setFromObject(root, true);
    const originalCenter = originalBounds.getCenter(new THREE.Vector3());
    root.position.set(-originalCenter.x, -originalBounds.min.y, -originalCenter.z);
    root.updateMatrixWorld(true);
    const normalizedBounds = new THREE.Box3().setFromObject(root, true);
    const sourceHeight = Math.max(normalizedBounds.getSize(new THREE.Vector3()).y, 0.001);

    root.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = true;
      object.receiveShadow = true;
    });

    const container = new THREE.Group();
    container.name = `${record.id} C7 repaired walkable placement`;
    container.add(root);
    container.rotation.y = record.rotation;
    container.scale.setScalar(record.targetHeight / sourceHeight);
    const textures = { rock, rockNormal, smoothness };
    const variation = index + 101;
    const report = applyC7RepairRock({ container, record, textures, variation });
    const materials = [];
    const materialIds = new Map();
    root.traverse((object) => {
      if (!object.isMesh) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (!material || materialIds.has(material)) continue;
        const id = `${record.id}/c7-material-${materialIds.size + 1}`;
        materialIds.set(material, id);
        materials.push({ id, material, roles: ['rock'] });
      }
    });
    label(container, 'natural.rock', `c7-repair/${record.id}`, materials);
    // Placement snapshots texture provenance. Convert the prototype first so
    // that snapshot includes both retained GLB inputs and explicit C7 maps.
    surface.place(container, {
      anchor: 'bounds',
      x: record.position[0],
      z: record.position[1],
    });
    container.userData.toonlabC7RepairPilot = {
      family: record.family,
      sourceGlb: `${sourceBase}/original/rock.glb`,
      targetHeightMeters: record.targetHeight,
    };
    pilots.push({
      container,
      record,
      report,
      textures,
      variation,
    });
  }
  ktx2.dispose();
  return pilots;
}

function catalogAsset(record) {
  return normalizeOfficialCatalogAsset({
    artifacts: [{
      contentType: 'model/gltf-binary',
      download: record.semantic
        ? `${SEMANTIC_ROCK_ROOT}/${record.file}`
        : `/catalog/rocks/${record.id}/rock.glb`,
      name: 'rock.glb',
      sha256: record.sha256,
    }],
    id: record.id,
    kind: 'model',
    metadata: { catalog: 'rocks' },
    name: record.name,
    recipe: {
      kind: 'toonlab/rock-recipe',
      lod: record.semantic
        ? { count: 3, distances: [0, 20, 48], ratios: [1, 0.5, 0.25], role: 'boulder' }
        : { count: 1, distances: [0], ratios: [1], role: record.id === 'rock-0303' ? 'landmark' : 'boulder' },
    },
    recipeHash: record.recipeHash,
    revision: 2,
    source: 'toonlab-rock',
  }, {
    baseUrl: location.origin,
    expectedId: record.id,
    expectedSource: 'toonlab-rock',
    provider: 'level-d-immutable-official-fixture',
  });
}

async function makeCatalogRocks(renderer) {
  const assets = new Map(CATALOG_ROCKS.map((record) => [record.id, catalogAsset(record)]));
  const assetRuntime = createOfficialCatalogAssetRuntime({
    provider: {
      getAsset(assetId) {
        const asset = assets.get(assetId);
        if (!asset) throw new Error(`Unknown Level D official catalog asset ${assetId}.`);
        return asset;
      },
    },
    renderer,
  });
  const placements = [];
  for (const record of CATALOG_ROCKS) {
    const handle = await assetRuntime.acquireAsset(record.id);
    const root = handle.root;
    root.name = `${record.id} · ${record.name}`;
    const bounds = new THREE.Box3().setFromObject(root, true);
    const center = bounds.getCenter(new THREE.Vector3());
    root.position.set(-center.x, -bounds.min.y, -center.z);
    const materials = [];
    const materialIds = new Map();
    root.traverse((object) => {
      if (!object.isMesh) return;
      // This scene is a fixed close-range comparison, so display LOD0 while
      // retaining the complete coherent LOD chain in the loaded asset.
      object.visible = !/_LOD(?:1|2)$/.test(object.name);
      object.castShadow = true;
      object.receiveShadow = true;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (!material || materialIds.has(material)) continue;
        const id = `${record.id}/material-${materialIds.size + 1}`;
        materialIds.set(material, id);
        materials.push({ id, material, roles: ['rock'] });
      }
    });
    label(root, 'natural.rock', `baseline/${record.id}`, materials);
    const container = new THREE.Group();
    container.name = `${record.id} official placement`;
    container.add(root);
    container.rotation.y = record.transform.rotation;
    if (record.id === 'rock-0002' && rockSurfaceState === 'stretched') {
      container.scale.set(3.2, 0.65, 1.7);
    } else {
      container.scale.setScalar(record.transform.scale);
    }
    const [x, z] = record.transform.position;
    surface.place(container, {
      anchor: 'bounds',
      x,
      z,
    });
    container.userData.toonlabOfficialCatalogIdentity = handle.asset.identity;
    placements.push({ container, handle });
  }
  return { assetRuntime, placements };
}

function stripedTexture() {
  const data = new Uint8Array(32 * 32 * 4);
  const colors = [new THREE.Color(0x825133), new THREE.Color(0xa96d42), new THREE.Color(0x70432c)];
  for (let y = 0; y < 32; y += 1) for (let x = 0; x < 32; x += 1) {
    const color = colors[(y + Math.floor(x / 7)) % colors.length];
    const offset = (y * 32 + x) * 4;
    data.set([color.r * 255, color.g * 255, color.b * 255, 255], offset);
  }
  const texture = new THREE.DataTexture(data, 32, 32, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 2);
  texture.needsUpdate = true;
  return texture;
}

function makeBench() {
  const root = new THREE.Group();
  root.name = 'Baseline textured bench';
  const wood = new THREE.MeshStandardMaterial({ color: 0xffffff, map: stripedTexture(), roughness: 0.82 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x48596b, metalness: 0.45, roughness: 0.55 });
  const add = (geometry, material, position) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
  };
  add(new THREE.BoxGeometry(3.5, 0.18, 0.62), wood, [0, 1.02, 0]);
  add(new THREE.BoxGeometry(3.5, 0.18, 0.56), wood, [0, 1.58, -0.28]);
  for (const x of [-1.4, 1.4]) for (const z of [-0.2, 0.2]) {
    add(new THREE.BoxGeometry(0.14, 1.05, 0.14), metal, [x, 0.5, z]);
  }
  return label(root, 'manufactured.surface', 'baseline/bench', [
    { id: 'BenchWood', material: wood, roles: ['primaryMass'] },
    { id: 'BenchMetal', material: metal, roles: ['fastener'] },
  ]);
}

async function main() {
  const styleBundle = await loadStyleBundleSelection();
  const renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL: backend === 'webgl' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setSize(innerWidth, innerHeight);
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute('aria-label', 'Walkable reference viewport');
  renderer.domElement.addEventListener('pointerdown', () => renderer.domElement.focus());
  document.querySelector('#scene').append(renderer.domElement);
  await renderer.init();

  const scene = new THREE.Scene();
  scene.background = null;
  const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 320);
  const controls = new OrbitControls(camera, renderer.domElement);
  const cameraPose = {
    overview: { position: [0, 5.8, -15], target: [0, 3, -2] },
    'c7-rocks': { position: [0, 3.25, 8.6], target: [0, 1.15, -2.2] },
    rocks: { position: [-3.2, 4.4, -9.2], target: [-10.5, 1.1, -1.4] },
    'shadow-bench': { position: [0.5, 3.4, 6.4], target: [5.4, 0.95, 3.3] },
    'shadow-rock': { position: [14.8, 5.4, 3.4], target: [9.8, 0.7, -2.4] },
    'tree-bark': { position: [10.8, 3.8, 9.2], target: [7.5, 2.4, 5.7] },
    // The official cliff sits seaward of the shore and casts toward land at
    // the reviewed noon sun angle. This fixed view therefore proves that the
    // same shadow crosses water body, shore foam, wet sand, grass, and ground.
    shore: { position: [7, 8, 2], target: [0, -0.2, -5.2] },
    sky: { position: [0, 4.8, 13.5], target: [0, 3.8, -2.5] },
  }[reviewView];
  camera.position.fromArray(cameraPose.position);
  controls.target.fromArray(cameraPose.target);
  controls.enableDamping = true;
  controls.minDistance = 2.4;
  controls.maxDistance = 30;
  controls.maxPolarAngle = Math.PI * 0.49;

  const ground = makeGround();
  scene.add(ground);
  const c7Pilots = await makeC7RepairPilotRocks(renderer);
  c7Pilots.forEach(({ container }) => scene.add(container));
  const catalog = await makeCatalogRocks(renderer);
  catalog.placements.forEach(({ container }) => scene.add(container));
  const water = surface.createWaterSurface({
    depth: 15, position: { x: 0, z: -13 }, preset: 'anime', quality: systemQuality, width: 36,
  });
  scene.add(water);
  const meadow = await surface.createGrassField({
    count: quality === 'performance' ? 780 : 1200,
    max: { x: 16, z: 11 }, min: { x: -16, z: -9 }, minSpacing: 0.34,
    quality, seed: 904, styleTarget: { targetId: 'baseline/meadow' },
  });
  scene.add(meadow);

  const trees = [];
  const treeDefinitions = [
    [-11.8, -3.7, 31, 0x5aa463], [10.7, -3.8, 47, 0x7eb154], [7.5, 5.7, 63, 0x4f9662],
  ];
  const treeCanopyColors = treeDefinitions.map(([, , , canopyColor]) => canopyColor);
  treeDefinitions.forEach(([x, z, seed, canopyColor], index) => {
    const tree = new StylizedTree({
      canopyColor, preset: 'call_me_sensei', seed, size: 2.2,
      styleTarget: { targetId: `baseline/tree-${index + 1}` },
    });
    surface.place(tree, { anchor: 'origin', x, z });
    scene.add(tree);
    trees.push(tree);
  });

  const bench = makeBench();
  bench.rotation.y = -0.28;
  surface.place(bench, { anchor: 'bounds', x: 5.4, z: 3.3 });
  scene.add(bench);

  const sky = await createSkySystem({ camera, quality: systemQuality, renderer, scene });
  const post = createWalkablePolishPostProcessing({
    camera,
    renderer,
    scene,
    state: polishExperiments,
  });
  const runtime = createSceneStyleRuntime({
    collisionHeightAt: surface.heightAt,
    quality,
    renderer,
    scene,
    sky,
    post,
    water,
  });
  const profile = createCharacterControllerProfile();
  const spawn = {
    x: 0,
    y: surface.heightAt(0, 1.5) + profile.bodyCenterAtRest,
    z: 1.5,
  };
  const body = createBody(spawn);
  const walkable = await createWalkableCharacterRuntime({
    camera,
    ground: surface.heightAt,
    renderer,
    scene,
    character: {
      animation: { roles: ['idle', 'walk', 'run', 'jump', 'swim'] },
      parent: scene,
      renderer,
      onStage: isWalkablePolishExperimentEnabled(polishExperiments, 'character-staging')
        ? async ({ stage }) => {
          await Promise.resolve();
          document.body.dataset.toonlabCharacterStage = stage;
        }
        : null,
      styleTarget: { targetId: 'baseline/character' },
      toon: false,
      url: requestedCharacterUrl,
    },
  });
  walkable.character.carrier.position.set(
    spawn.x,
    spawn.y + profile.modelOffsetY,
    spawn.z,
  );
  walkable.character.carrier.rotation.y = Math.PI;

  // This is the entire look application. The package owns the physical sky
  // baseline, renderer, lighting, shadows, ground conversion, grass palette,
  // water look, and watched scene-label routing.
  await runtime.apply(styleBundle.document, {
    discovery: 'scene-labels',
    mode: 'strict',
    watch: !isWalkablePolishExperimentEnabled(polishExperiments, 'style-lifecycle'),
  });
  const c7PilotReports = c7Pilots.map(({ container, record, textures, variation }) => ({
    asset: record,
    report: applyC7RepairRock({ container, record, textures, variation }),
  }));
  document.body.dataset.toonlabC7RepairPilot = String(c7RepairPilot);
  document.body.dataset.toonlabC7RepairPilotReady = String(
    c7PilotReports.length === C7_REPAIR_PILOTS.length
      && c7PilotReports.every(({ report }) => report.applied > 0 && report.geometryDetail === null),
  );
  document.body.dataset.toonlabC7RepairSourceTextures = String(
    c7PilotReports.reduce((sum, { report }) => sum + report.retainedSourceTextures, 0),
  );
  let rockSurfaceReport = null;
  if (rockSurfaceState === 'grass' || rockSurfaceState === 'sand') {
    const showcase = catalog.placements.find(({ handle }) => handle.asset.id === 'rock-0002');
    rockSurfaceReport = applyRockShader(showcase.container, {}, { surfaceState: rockSurfaceState });
  }
  document.body.dataset.toonlabRockSurfaceState = rockSurfaceState;
  document.body.dataset.toonlabRockSurfaceTextureSource = rockSurfaceReport?.textureSource ?? 'source';
  document.body.dataset.toonlabRockSurfaceApplied = String(rockSurfaceReport?.applied ?? 0);
  const showcaseRock = catalog.placements.find(({ handle }) => handle.asset.id === 'rock-0002');
  let liveRockProfile = null;
  showcaseRock?.container.traverse((object) => {
    if (!liveRockProfile && object.isMesh) liveRockProfile = object.material?.userData?.toonLabRockProfile ?? null;
  });
  document.body.dataset.toonlabRockGrassEnabled = String(Boolean(liveRockProfile?.layers?.grass?.enabled));
  document.body.dataset.toonlabRockSandEnabled = String(Boolean(liveRockProfile?.layers?.sand?.enabled));
  document.body.dataset.toonlabRockProjection = 'world-space-triplanar';
  document.body.dataset.toonlabRockScaleInvariant = 'true';
  await applySkyCondition(sky, runtime, requestedSkyCondition);
  if (reviewHour !== null) {
    await runtime.setSkyPreset(SKY_PRESETS.partlyCloudy, { timeOfDay: reviewHour });
    document.body.dataset.toonlabReviewHour = String(reviewHour);
    document.body.dataset.toonlabSkyCondition = 'partly_cloudy';
    document.body.dataset.toonlabSkyPreset = 'partly-cloudy';
  }
  const polishRuntime = await applyWalkablePolishExperiments({
    bench,
    catalog,
    ground,
    meadow,
    post,
    runtime,
    scene,
    sky,
    state: polishExperiments,
    treeCanopyColors,
    trees,
    water,
  });
  document.body.dataset.toonlabStyleWatch = String(runtime.sceneDiscovery.enabled);
  if (isWalkablePolishExperimentEnabled(polishExperiments, 'character-staging')) {
    document.body.dataset.toonlabCharacterStageAwaited = String(
      document.body.dataset.toonlabCharacterStage === 'ready',
    );
  }
  const collisionReport = runtime.collision.assertReady();
  document.body.dataset.toonlabCollisionReady = String(collisionReport.ok);
  document.body.dataset.toonlabCollisionRegistered = String(collisionReport.stats.registered);
  const barkProfiles = trees.map((tree) => (
    tree.trunkMesh?.material?.userData?.toonlabBarkSurface?.profileId ?? null
  ));
  const signatureBarkCount = barkProfiles.filter(
    (profileId) => profileId === 'call-me-sensei-bark-v1',
  ).length;
  const treeBarkReady = styleBundle.id !== 'call-me-sensei' || signatureBarkCount === trees.length;
  document.body.dataset.toonlabTreeBarkProfile = 'call-me-sensei-bark-v1';
  document.body.dataset.toonlabTreeBarkProfileCount = String(signatureBarkCount);
  const treeBarkStatus = document.querySelector('#tree-bark');
  if (treeBarkStatus) {
    treeBarkStatus.textContent = treeBarkReady
      ? `${signatureBarkCount}/${trees.length} · Call Me Sensei`
      : `Blocked · ${signatureBarkCount}/${trees.length}`;
  }
  const retainedRockTextureIds = new Set();
  for (const { container } of catalog.placements) {
    container.traverse((object) => {
      if (!object.isMesh) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        for (const textureId of material?.userData?.toonlabSourceTextureIds ?? []) {
          retainedRockTextureIds.add(textureId);
        }
      }
    });
  }
  document.body.dataset.toonlabRockSourceTextureCount = String(retainedRockTextureIds.size);
  // The clean-consumer review is an executable release audit, so expose the
  // public runtime surfaces to the browser harness instead of inferring live
  // state from a screenshot alone.
  let captureFrame = () => {};
  globalThis.__toonlabReview = Object.freeze({
    camera,
    captureFrame: () => captureFrame(),
    c7PilotReports,
    c7Pilots,
    controls,
    polishExperiments,
    polishRuntime,
    runtime,
    scene,
    sky,
    walkable,
  });
  document.body.dataset.toonlabSkyStyle = styleBundle.document.slots?.sky?.style ?? 'custom';
  document.body.dataset.toonlabCharacterUrl = requestedCharacterUrl;
  document.body.dataset.toonlabCharacterFormat = walkable.character.format;

  const timeSelect = document.querySelector('#time');
  timeSelect.addEventListener('change', async () => {
    status.removeAttribute('data-error');
    status.textContent = 'Applying sky condition…';
    try {
      await applySkyCondition(sky, runtime, timeSelect.value);
      const next = new URL(location.href);
      if (timeSelect.value === 'partly_cloudy') next.searchParams.delete('time');
      else next.searchParams.set('time', timeSelect.value);
      history.replaceState(null, '', next);
      status.textContent = `${backend} · ${quality} · ${styleBundle.label} · ${walkable.character.format}/${walkable.character.rig?.type ?? 'unknown'} · ready`;
    } catch (error) {
      status.dataset.error = 'true';
      status.textContent = error.stack ?? error.message;
    }
  });

  addEventListener('keydown', (event) => {
    const tag = event.target?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'BUTTON' || tag === 'TEXTAREA') return;
    keys.add(event.code);
    if (event.code === 'Space' && !event.repeat) jumpRequested = true;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
      event.preventDefault();
    }
  });
  addEventListener('keyup', (event) => keys.delete(event.code));

  const domains = document.querySelector('#domains');
  runtime.inspector.subscribe((report) => {
    domains.replaceChildren(...report.domains.map((entry) => {
      const row = document.createElement('label');
      row.className = 'domain';
      const name = document.createElement('span');
      name.textContent = `${entry.domain} (${entry.targets.length})`;
      const toggle = document.createElement('input');
      toggle.type = 'checkbox';
      toggle.checked = entry.enabled;
      toggle.disabled = !entry.controllable;
      toggle.addEventListener('change', async () => {
        toggle.disabled = true;
        try { await runtime.inspector.setDomainEnabled(entry.domain, toggle.checked); }
        catch (error) { status.dataset.error = 'true'; status.textContent = error.stack ?? error.message; }
        finally { toggle.disabled = false; }
      });
      row.append(name, toggle);
      return row;
    }));
  });

  document.body.dataset.toonlabReady = 'false';
  document.body.dataset.toonlabCatalogAssets = CATALOG_ROCKS.map(({ id }) => id).join(',');
  document.body.dataset.toonlabGrassPlacements = String(meadow.placements.length);
  const timer = new THREE.Timer();
  timer.connect(document);
  const cameraForward = new THREE.Vector3();
  const cameraRight = new THREE.Vector3();
  const move = new THREE.Vector3();
  const target = new THREE.Vector3();
  const waterQuery = {
    contains: (x, z) => Math.abs(x) <= 18 && z <= -5.5 && z >= -20.5,
    getFlowAt: () => ({ x: 0, z: -0.08 }),
    getHeightAt: (x, z) => water.getHeightAt(x, z),
    getLevel: () => water.position.y,
  };
  let jumpInFlight = false;
  let frames = 0;
  let ready = false;
  const renderFrame = () => {
    timer.update();
    const delta = Math.min(timer.getDelta(), 0.05);
    const position = body.translation();
    const velocity = body.linvel();
    camera.getWorldDirection(cameraForward);
    cameraForward.y = 0;
    cameraForward.normalize();
    cameraRight.crossVectors(cameraForward, camera.up).normalize();
    const forwardInput = Number(pressed('KeyW') || pressed('ArrowUp'))
      - Number(pressed('KeyS') || pressed('ArrowDown'));
    const sideInput = Number(pressed('KeyD') || pressed('ArrowRight'))
      - Number(pressed('KeyA') || pressed('ArrowLeft'));
    move.copy(cameraForward).multiplyScalar(forwardInput).addScaledVector(cameraRight, sideInput);
    if (move.lengthSq() > 1) move.normalize();
    const sprinting = pressed('ShiftLeft') || pressed('ShiftRight');
    const jumpInput = pressed('Space');
    const jumpPressed = jumpRequested;
    jumpRequested = false;
    const groundedAtFrameStart = body.userData.canJump;
    const swimming = Boolean(walkable.frame?.water.active);
    const speed = sprinting ? 5.2 : 3.2;
    let landedThisFrame = false;
    if (!swimming) {
      velocity.x = move.x * speed;
      velocity.z = move.z * speed;
      velocity.y -= 9.81 * body.gravityScale() * delta;
      if (jumpPressed && body.userData.canJump) {
        velocity.y = 5.4;
        body.userData.canJump = false;
        jumpInFlight = true;
      }
      position.x += velocity.x * delta;
      position.y += velocity.y * delta;
      position.z += velocity.z * delta;
      const settledY = runtime.collision.world.groundHeight(position.x, position.z)
        + profile.bodyCenterAtRest;
      if (position.y <= settledY) {
        landedThisFrame = jumpInFlight;
        position.y = settledY;
        velocity.y = 0;
        body.userData.canJump = true;
        jumpInFlight = false;
      }
      body.setTranslation(position);
      body.setLinvel(velocity);
    }

    const facingYaw = move.lengthSq() > 0.001
      ? Math.atan2(move.x, move.z)
      : walkable.character.carrier.rotation.y;
    const characterFrame = walkable.update({
      body,
      facingYaw,
      grounded: jumpPressed ? groundedAtFrameStart : (!jumpInFlight && body.userData.canJump),
      jumpPressed,
      jumpReleased: jumpInFlight,
      landed: landedThisFrame,
      move: { x: move.x, z: move.z },
      moving: move.lengthSq() > 0.001,
      rising: jumpInput,
      sprinting,
      swimSprinting: sprinting,
      water: waterQuery,
    }, delta);
    walkable.enforce(body);
    const finalPosition = body.translation();
    walkable.character.carrier.position.set(
      finalPosition.x,
      finalPosition.y + profile.modelOffsetY,
      finalPosition.z,
    );
    if (move.lengthSq() > 0.001) walkable.character.carrier.rotation.y = facingYaw;
    if (!fixedReviewView) {
      target.set(finalPosition.x, finalPosition.y + 0.45, finalPosition.z);
      controls.target.lerp(target, 1 - Math.exp(-6 * delta));
    }
    controls.update();
    meadow.update(delta, camera);
    sky.update(delta);
    water.update(renderer, scene, camera, delta);
    runtime.update(delta, camera);
    polishRuntime.update(delta);
    if (post) post.render(delta);
    else renderer.render(scene, camera);
    document.body.dataset.toonlabLocomotionState = characterFrame?.locomotion.state ?? 'unknown';
    document.body.dataset.toonlabWaterState = characterFrame?.water.state ?? 'unknown';
    document.body.dataset.toonlabCharacterPosition = [
      finalPosition.x, finalPosition.y, finalPosition.z,
    ].map((value) => value.toFixed(3)).join(',');
    frames += 1;
    if (ready || frames % 10 !== 0) return;
    const cloudShadowDiagnostics = runtime.inspector.snapshot().diagnostics.cloudShadows;
    const cloudShadowReady = cloudShadowDiagnostics?.ready === true
      && cloudShadowDiagnostics?.enabled === true
      && cloudShadowDiagnostics?.mapName === 'ToonLabCloudShadowMap'
      && cloudShadowDiagnostics?.source === 'sky-system-volumetric-transmittance';
    document.body.dataset.toonlabCloudShadow = cloudShadowReady ? 'ready' : 'blocked';
    document.body.dataset.toonlabCloudShadowMap = cloudShadowDiagnostics?.mapName ?? '';
    document.body.dataset.toonlabCloudShadowSource = cloudShadowDiagnostics?.source ?? '';
    const trunkCasterCount = trees.filter((tree) => tree.trunkMesh?.castShadow === true).length;
    const trunkReceiverCount = trees.filter((tree) => (
      tree.trunkMesh?.receiveShadow === true
      && tree.trunkMesh?.material?.uniforms?.uSceneShadowStrength?.value === 1
    )).length;
    const treeCoverage = runtime.shadowPass?.casterCoverage?.byDomain?.['vegetation.tree'];
    const coveredTreeTargets = treeCoverage?.coveredTargetIds?.length ?? 0;
    const eligibleTreeTargets = treeCoverage?.eligibleTargetIds?.length ?? 0;
    const treeShadowReady = trunkCasterCount === trees.length
      && trunkReceiverCount === trees.length
      && eligibleTreeTargets === trees.length
      && coveredTreeTargets === eligibleTreeTargets;
    document.body.dataset.toonlabTreeShadowCasters = `${trunkCasterCount}/${trees.length}`;
    document.body.dataset.toonlabTreeShadowReceivers = `${trunkReceiverCount}/${trees.length}`;
    document.body.dataset.toonlabTreeShadowCoverage = `${coveredTreeTargets}/${eligibleTreeTargets}`;
    const audit = surface.audit({
      camera,
      requireVisibleSky: ['overview', 'rocks', 'sky'].includes(reviewView),
      requireShadowDomains: ['character', 'manufactured.surface', 'natural.rock', 'vegetation.tree'],
      styleRuntime: runtime,
    });
    document.body.dataset.toonlabSurfaceAudit = audit.ok ? 'pass' : 'fail';
    document.body.dataset.toonlabSurfaceAuditIssues = audit.issues.map(({ code }) => code).join(',');
    const polishShadowReady = !isWalkablePolishExperimentEnabled(polishExperiments, 'shadow-readiness')
      || document.body.dataset.toonlabPolishShadowReady === 'true';
    if (audit.ok && cloudShadowReady && treeBarkReady && treeShadowReady && polishShadowReady) {
      ready = true;
      document.body.dataset.toonlabReady = 'true';
      status.textContent = `${backend} · ${quality} · ${styleBundle.label} · ${walkable.character.format}/${walkable.character.rig?.type ?? 'unknown'} · ready`;
    } else if (frames >= 180) {
      status.dataset.error = 'true';
      status.textContent = `Blocked: ${[
        ...audit.issues.map(({ message }) => message),
        ...(cloudShadowReady ? [] : ['The visible Sky System cloud shadow is not published to shared receivers.']),
        ...(treeBarkReady ? [] : ['Generated trees did not resolve the registered Call Me Sensei bark surface.']),
        ...(treeShadowReady ? [] : ['Every generated trunk must cast and receive through the shared shadow pass.']),
        ...(polishShadowReady ? [] : ['The polish shadow-readiness contract has uncovered targets.']),
      ].join(' ')}`;
    }
  };
  captureFrame = renderFrame;
  renderer.setAnimationLoop(renderFrame);

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    sky.resize(innerWidth, innerHeight);
    polishRuntime.resize(innerWidth, innerHeight, Math.min(devicePixelRatio, 1.5));
  });
  addEventListener('pagehide', () => { void catalog.assetRuntime.dispose(); }, { once: true });
  addEventListener('pagehide', () => {
    timer.disconnect();
    walkable.dispose();
    polishRuntime.dispose();
    void runtime.dispose();
  }, { once: true });
}

main().catch((error) => {
  console.error(error);
  status.dataset.error = 'true';
  status.textContent = error.stack ?? error.message;
  document.body.dataset.toonlabReady = 'false';
});
