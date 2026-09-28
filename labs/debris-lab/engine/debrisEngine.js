// Three.js half of Debris Lab: deterministic recipe rebuilds, ToonLab
// environment-shader conversion, camera framing, and render/test gates.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import {
  advanceEnvironmentShaderTime,
  applyEnvironmentShader,
  resetEnvironmentShaderTime,
} from '../../../src/environment/environmentMaterialAdapter.js';
import { createEnvironmentSunShadowPass } from '../../../src/environment/environmentSunShadowPass.js';
import { createDebrisAsset, disposeDebrisAsset, settleDebrisPhysics } from '../../../src/debrisgen/index.js';
import { createLabRenderer, whenRendererReady } from '../../shared/rendererFactory.js';

const REBUILD_DEBOUNCE_MS = 90;

function sourceMaterials(root) {
  const result = new Set();
  root.traverse((object) => {
    if (!object.isMesh) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (material) result.add(material);
    }
  });
  return result;
}

function geometryHash(root) {
  let hash = 0x811c9dc5;
  root?.traverse((object) => {
    const attribute = object.isMesh ? object.geometry?.attributes?.position : null;
    if (!attribute) return;
    const view = new Uint8Array(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength);
    for (let index = 0; index < view.length; index += 1) {
      hash ^= view[index];
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
  });
  return hash >>> 0;
}

export function createDebrisEngine({ mount, store }) {
  document.body.dataset.scene = 'debris';
  document.body.dataset.modelReady = 'false';

  const renderer = createLabRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x7892a5);
  scene.fog = new THREE.Fog(0x9eb1bd, 20, 65);

  const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.05, 120);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI / 2 - 0.025;
  controls.minDistance = 0.8;
  controls.maxDistance = 35;

  const ambient = new THREE.AmbientLight(0xdfe8f2, 0.55);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xffe4bf, 1.05);
  sun.position.set(8, 12, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -10;
  sun.shadow.camera.right = 10;
  sun.shadow.camera.top = 10;
  sun.shadow.camera.bottom = -10;
  sun.shadow.bias = -0.0004;
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(38, 64).rotateX(-Math.PI / 2),
    new THREE.MeshToonMaterial({ color: 0x6d766b }),
  );
  ground.receiveShadow = true;
  ground.position.y = -0.012;
  scene.add(ground);

  const grid = new THREE.GridHelper(18, 36, 0xaab6ad, 0x849087);
  for (const material of Array.isArray(grid.material) ? grid.material : [grid.material]) {
    material.transparent = true;
    material.opacity = 0.16;
  }
  grid.position.y = 0.002;
  scene.add(grid);

  const environmentBox = new THREE.Box3(
    new THREE.Vector3(-20, -1, -20),
    new THREE.Vector3(20, 12, 20),
  );
  const sunShadowPass = createEnvironmentSunShadowPass({ renderer, scene });

  let asset = null;
  let rebuildTimer = 0;
  let rebuildToken = 0;
  let rebuildCount = 0;
  const rebuiltListeners = new Set();

  // WebGPU may still have the previous frame's bind groups in flight when a
  // recipe swap lands. Retire the detached asset after a few frames instead
  // of destroying its material buffers in the same task as scene removal.
  function retireAsset(previous) {
    if (!previous) return;
    scene.remove(previous);
    window.setTimeout(() => disposeDebrisAsset(previous), 180);
  }

  function frameComposition(view = 'hero') {
    if (!asset) return;
    const box = new THREE.Box3().setFromObject(asset);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z, 0.75);
    controls.target.set(center.x, Math.max(center.y * 0.55, 0.15), center.z);
    if (view === 'top') camera.position.set(center.x + 0.01, center.y + radius * 2.45, center.z + 0.01);
    else if (view === 'front') camera.position.set(center.x, center.y + radius * 0.62, center.z + radius * 2.3);
    else camera.position.set(center.x + radius * 1.5, center.y + radius, center.z + radius * 1.85);
    camera.near = Math.max(0.02, radius / 100);
    camera.far = Math.max(80, radius * 30);
    camera.updateProjectionMatrix();
    controls.update();
  }

  async function rebuild({ reframe = false } = {}) {
    window.clearTimeout(rebuildTimer);
    const token = ++rebuildToken;
    const settings = store.getState().settings;
    const next = createDebrisAsset(settings);
    try {
      await settleDebrisPhysics(next);
    } catch (error) {
      console.warn('Debris physics settle unavailable, using deterministic placement:', error);
    }
    const originals = sourceMaterials(next);
    const contrast = settings.surface.toonContrast;
    try {
      await applyEnvironmentShader(next, {
        bakeVertexAo: false,
        environmentBox,
        hasSun: true,
        parameters: {
          ambientStrength: 0.58 + (1 - contrast) * 0.16,
          aoWarmth: 0.52,
          shadowLift: 0.58 - contrast * 0.34,
          untexturedGradientStrength: 0.2 + settings.surface.edgeLight * 0.28,
          vertexAoStrength: 0.8,
        },
        scanStylize: false,
      });
    } catch (error) {
      console.error('Debris shader conversion failed:', error);
      disposeDebrisAsset(next);
      if (token === rebuildToken) document.body.dataset.modelReady = 'error';
      return;
    } finally {
      for (const material of originals) material.dispose();
    }
    if (token !== rebuildToken) {
      disposeDebrisAsset(next);
      return;
    }
    if (asset) {
      retireAsset(asset);
    }
    asset = next;
    scene.add(asset);
    rebuildCount += 1;
    const stats = next.userData.stats;
    document.body.dataset.debrisRebuildCount = String(rebuildCount);
    document.body.dataset.debrisMeshCount = String(stats.meshCount);
    document.body.dataset.debrisTriangleCount = String(stats.triangleCount);
    document.body.dataset.debrisVertexCount = String(stats.vertexCount);
    document.body.dataset.debrisSeed = String(settings.asset.seed);
    document.body.dataset.debrisType = settings.asset.type;
    document.body.dataset.debrisVariant = settings.asset.variant;
    document.body.dataset.debrisGeometryHash = String(geometryHash(asset));
    document.body.dataset.modelReady = 'true';
    if (reframe || rebuildCount === 1) frameComposition();
    for (const listener of [...rebuiltListeners]) listener(asset);
  }

  function scheduleRebuild(reframe) {
    window.clearTimeout(rebuildTimer);
    rebuildTimer = window.setTimeout(() => rebuild({ reframe }), REBUILD_DEBOUNCE_MS);
  }

  let lastRevision = store.getState().docRevision;
  store.subscribe(() => {
    const state = store.getState();
    if (state.docRevision === lastRevision) return;
    lastRevision = state.docRevision;
    if (state.lastChange.immediate) rebuild({ reframe: state.lastChange.reframe });
    else scheduleRebuild(state.lastChange.reframe);
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  async function start() {
    resetEnvironmentShaderTime();
    await rebuild({ reframe: true });
    await whenRendererReady(renderer);
    let previousTime = null;
    let firstFrame = true;
    renderer.setAnimationLoop((time) => {
      const delta = previousTime === null ? 0 : Math.min((time - previousTime) / 1000, 0.1);
      previousTime = time;
      advanceEnvironmentShaderTime(delta);
      controls.update();
      sunShadowPass.update({ dynamic: true });
      renderer.render(scene, camera);
      if (firstFrame) {
        firstFrame = false;
        document.body.dataset.debrisLabReady = 'true';
      }
    });
  }

  return {
    camera,
    controls,
    frameComposition,
    geometryHash: () => geometryHash(asset),
    getAsset: () => asset,
    onRebuilt(listener) {
      rebuiltListeners.add(listener);
      return () => rebuiltListeners.delete(listener);
    },
    rebuild,
    renderer,
    scene,
    start,
  };
}
