// Environment Shader Lab engine: a focused stage for customizing the environment
// shader. Renders either a built-in procedural courtyard (always available —
// a fresh clone needs zero private assets) or a discovered assets-local
// drop-in environment, converts it with applyEnvironmentShader, re-applies
// setting edits live, and hosts a walkable mannequin preview so the shading
// can be judged at character scale. The legacy full environment surface
// (backdrops, lamp rigs, capture views) lives on at /shader-lab/legacy/?env=1.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import {
  advanceEnvironmentShaderTime,
  applyEnvironmentSettingsToMaterial,
  applyEnvironmentShader,
  resetEnvironmentShaderTime,
  setEnvironmentDebugOutput,
} from '../../../src/environment/environmentMaterialAdapter.js';
import { createEnvironmentSunShadowPass } from '../../../src/environment/environmentSunShadowPass.js';
import { loadModelAsset } from '../../../src/character/modelLoader.js';
import { createLabRenderer, whenRendererReady } from '../../shared/rendererFactory.js';
import {
  createWalkPreviewActions,
  installWalkPreviewController,
} from '../../shared/walkPreview.js';
import { computeModelBounds, materialList } from '../../shader-lab/sceneGeometry.js';
import { ENVIRONMENT_ASSET_OPTIONS } from '../../shader-lab/assetCatalog.js';
import { createStudyStage } from './studyStage.js';
import { createLoftStage } from './loftStage.js';

export const BUILTIN_STAGE_ID = 'builtin';

/** Stage choices: the built-in courtyard plus every assets-local drop-in. */
export const ENVIRONMENT_STAGE_OPTIONS = Object.freeze([
  Object.freeze({ id: BUILTIN_STAGE_ID, label: 'Courtyard (built-in)', modelUrl: null }),
  Object.freeze({ id: 'study', label: 'Cozy Study (CC0)', modelUrl: null }),
  Object.freeze({ id: 'loft', label: 'Reading Loft (CC0 · realistic)', modelUrl: null }),
  ...ENVIRONMENT_ASSET_OPTIONS
    .filter((option) => option.modelUrl)
    .map((option) => Object.freeze({ id: option.id, label: option.label, modelUrl: option.modelUrl })),
]);

const DEFAULT_CAMERA_POSITION = Object.freeze([7, 4.5, 9]);
const DEFAULT_TARGET = Object.freeze([0, 1.4, 0]);

// The built-in stage: floor, two walls, colonnade, crates, a lantern strip —
// enough surface variety (large planes, columns, emissive, foliage-free) to
// read every environment shader dial without any private assets.
function buildCourtyard() {
  const root = new THREE.Group();
  root.name = 'Courtyard (built-in)';
  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.92, ...extra });

  const floor = new THREE.Mesh(new THREE.BoxGeometry(22, 0.3, 22), mat(0xb9a98c));
  floor.position.y = -0.15;
  floor.name = 'Floor';
  root.add(floor);

  const back = new THREE.Mesh(new THREE.BoxGeometry(22, 6, 0.4), mat(0xcfc3ad));
  back.position.set(0, 3, -10.8);
  back.name = 'Back wall';
  root.add(back);

  const side = new THREE.Mesh(new THREE.BoxGeometry(0.4, 6, 22), mat(0xc4b8a2));
  side.position.set(-10.8, 3, 0);
  side.name = 'Side wall';
  root.add(side);

  for (let index = 0; index < 4; index += 1) {
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 5.4, 14), mat(0xd8cdb4));
    column.position.set(-7 + index * 4.6, 2.7, -9.6);
    column.name = `Column ${index + 1}`;
    root.add(column);
  }

  const crateA = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), mat(0x9a7a55));
  crateA.position.set(3.4, 0.8, 2.2);
  crateA.rotation.y = 0.5;
  crateA.name = 'Crate A';
  const crateB = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), mat(0x8a6c4c));
  crateB.position.set(4.6, 0.55, 3.4);
  crateB.rotation.y = -0.3;
  crateB.name = 'Crate B';
  root.add(crateA, crateB);

  const lantern = new THREE.Mesh(
    new THREE.BoxGeometry(4.4, 0.5, 0.25),
    mat(0xfff1c8, { emissive: 0xffd77a, emissiveIntensity: 1.6 }),
  );
  lantern.position.set(-4.5, 3.6, -10.5);
  lantern.name = 'Lantern strip';
  root.add(lantern);

  return root;
}

export function createEnvironmentLabEngine({ mount, store }) {
  const renderer = createLabRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x10131a);
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Node backends bypass three's shadow system — environmentSunShadowPass
  // renders the sun shadow map the environment materials sample.
  renderer.shadowMap.enabled = !renderer.isWebGPURenderer;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(...DEFAULT_CAMERA_POSITION);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.target.set(...DEFAULT_TARGET);

  const sun = new THREE.DirectionalLight(0xfff2dc, 1.15);
  sun.position.set(14, 20, 10);
  sun.castShadow = true;
  scene.add(sun);
  const ambient = new THREE.AmbientLight(0xbcc8e0, 0.34);
  scene.add(ambient);

  const environmentSunShadowPass = createEnvironmentSunShadowPass({ renderer, scene });

  const clock = new THREE.Clock();
  const frameCallbacks = new Set();
  resetEnvironmentShaderTime(0);

  let environmentRoot = null;
  let loadToken = 0;
  let disposed = false;

  // Walker collision: world-space AABBs of everything solid on the stage
  // (walls, furniture, crates). Floor-level meshes (rugs, the floor slab)
  // and the emissive daylight panel are walkable/passable.
  const WALKER_RADIUS = 0.34;
  const WALKER_HEIGHT = 1.7;
  let colliders = [];

  function rebuildColliders() {
    colliders = [];
    if (!environmentRoot) return;
    environmentRoot.updateWorldMatrix(true, true);
    environmentRoot.traverse((obj) => {
      if (!obj.isMesh || !obj.geometry) return;
      if (obj.name === 'Window daylight') return;
      const box = new THREE.Box3().setFromObject(obj);
      if (!Number.isFinite(box.min.x)) return;
      if (box.max.y < 0.2) return; // floor slabs, rugs
      colliders.push(box);
    });
  }

  function resolveWalkerCollisions(position) {
    for (const box of colliders) {
      if (position.y >= box.max.y || position.y + WALKER_HEIGHT <= box.min.y) continue;
      const closestX = Math.min(Math.max(position.x, box.min.x), box.max.x);
      const closestZ = Math.min(Math.max(position.z, box.min.z), box.max.z);
      const dx = position.x - closestX;
      const dz = position.z - closestZ;
      const distance = Math.hypot(dx, dz);
      if (distance >= WALKER_RADIUS) continue;
      if (distance > 1e-5) {
        const push = (WALKER_RADIUS - distance) / distance;
        position.x += dx * push;
        position.z += dz * push;
      } else {
        // Center inside the box: push out along the shallowest face.
        const exits = [
          { d: position.x - box.min.x + WALKER_RADIUS, x: -1, z: 0 },
          { d: box.max.x - position.x + WALKER_RADIUS, x: 1, z: 0 },
          { d: position.z - box.min.z + WALKER_RADIUS, x: 0, z: -1 },
          { d: box.max.z - position.z + WALKER_RADIUS, x: 0, z: 1 },
        ].sort((a, b) => a.d - b.d)[0];
        position.x += exits.x * exits.d;
        position.z += exits.z * exits.d;
      }
    }
  }

  // Walkable mannequin (tree-lab pattern): native locomotion clips, camera
  // follow via the shared controller; ground is flat y=0 on every stage.
  let mannequin = null;
  let mannequinLoading = false;
  let mixer = null;
  let walkActions = null;

  function onFrame(callback) {
    frameCallbacks.add(callback);
    return () => frameCallbacks.delete(callback);
  }

  function loadMannequin() {
    if (mannequin || mannequinLoading) return;
    mannequinLoading = true;
    new GLTFLoader().load('/characters/mannequin.glb', (gltf) => {
      mannequin = gltf.scene;
      mannequin.name = 'Walk mannequin';
      mannequin.traverse((child) => {
        if (child.isMesh) child.castShadow = true;
      });
      mannequin.position.set(1.5, 0, 1.5);
      mannequin.visible = store.getState().view.walkPreview;
      scene.add(mannequin);
      mixer = new THREE.AnimationMixer(mannequin);
      walkActions = createWalkPreviewActions({ clips: gltf.animations, mixer });
      environmentSunShadowPass.invalidate();
      mannequinLoading = false;
    }, undefined, (error) => {
      mannequinLoading = false;
      console.warn('Mannequin failed to load:', error);
      store.actions.setStatus('Mannequin model not available in this checkout.');
    });
  }

  function applySettings(settings) {
    if (!environmentRoot) return;
    environmentRoot.traverse((obj) => {
      if (!obj.isMesh || !obj.material) return;
      obj.castShadow = settings.features.shadowMask;
      obj.receiveShadow = settings.features.shadowMask;
      for (const mat of materialList(obj.material)) {
        if (mat?.userData?.environmentMaterial) {
          applyEnvironmentSettingsToMaterial(mat, settings);
        } else if (mat?.userData?.environmentAoOverlay) {
          mat.visible = settings.features.aoOverlay;
        } else if (mat?.userData?.environmentShadow) {
          mat.visible = settings.features.shadowMesh;
        }
      }
    });
    environmentSunShadowPass.invalidate();
  }

  function applyDebug(mode) {
    if (environmentRoot) setEnvironmentDebugOutput(environmentRoot, mode);
  }

  function frameEnvironment(box) {
    if (!box) return;
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(size.x, size.z) * 0.5;
    controls.target.set(center.x, Math.max(1.2, size.y * 0.3), center.z);
    camera.position.set(center.x + radius * 0.9, size.y * 0.75 + 2, center.z + radius * 1.15);
    controls.update();
  }

  async function loadStage(stageId) {
    const token = ++loadToken;
    const option = ENVIRONMENT_STAGE_OPTIONS.find((entry) => entry.id === stageId)
      ?? ENVIRONMENT_STAGE_OPTIONS[0];
    document.body.dataset.modelReady = 'false';
    store.actions.setStatus(`Loading ${option.label}…`);
    try {
      let root;
      if (option.modelUrl) {
        const asset = await loadModelAsset(option.modelUrl, { renderer });
        root = asset.root;
      } else if (option.id === 'study') {
        root = await createStudyStage({ renderer });
      } else if (option.id === 'loft') {
        root = await createLoftStage({ renderer });
      } else {
        root = buildCourtyard();
      }
      if (token !== loadToken || disposed) return;

      if (environmentRoot) {
        scene.remove(environmentRoot);
        environmentRoot.traverse((child) => child.geometry?.dispose?.());
      }
      environmentRoot = root;
      scene.add(environmentRoot);

      const box = computeModelBounds(environmentRoot);
      const state = await applyEnvironmentShader(environmentRoot, {
        environmentBox: box,
        hasSun: true,
        settings: store.getState().settings,
      });
      if (token !== loadToken || disposed) return;

      applySettings(store.getState().settings);
      applyDebug(store.getState().view.debug);
      frameEnvironment(box);
      rebuildColliders();
      environmentSunShadowPass.invalidate();

      store.actions.adoptEngineState({ convertedMeshCount: state.convertedMeshCount ?? 0 });
      document.body.dataset.environmentStage = option.id;
      document.body.dataset.modelReady = 'true';
      store.actions.setStatus(`Loaded ${option.label}.`);
    } catch (error) {
      if (token !== loadToken) return;
      console.error('Environment load failed:', error);
      document.body.dataset.modelReady = 'error';
      store.actions.setStatus(`Could not load the environment: ${error.message}`);
    }
  }

  function resetCamera() {
    const box = environmentRoot ? computeModelBounds(environmentRoot) : null;
    if (box) frameEnvironment(box);
    else {
      camera.position.set(...DEFAULT_CAMERA_POSITION);
      controls.target.set(...DEFAULT_TARGET);
      controls.update();
    }
  }

  const engineHandle = { camera, controls, onFrame, renderer, scene };

  installWalkPreviewController({
    camera,
    controls,
    engine: engineHandle,
    getActions: () => walkActions,
    getEnabled: () => store.getState().view.walkPreview,
    getWalker: () => mannequin,
    groundY: 0,
    moveHorizontal: (delta) => {
      mannequin.position.add(delta);
      resolveWalkerCollisions(mannequin.position);
    },
  });

  let appliedRevision = store.getState().docRevision;
  let appliedDebug = store.getState().view.debug;
  let appliedStage = store.getState().view.stage;
  store.subscribe(() => {
    const state = store.getState();
    sun.intensity = state.view.sunIntensity ?? sun.intensity;
    ambient.intensity = state.view.ambientIntensity ?? ambient.intensity;
    if (state.docRevision !== appliedRevision) {
      appliedRevision = state.docRevision;
      applySettings(state.settings);
    }
    if (state.view.debug !== appliedDebug) {
      appliedDebug = state.view.debug;
      applyDebug(appliedDebug);
    }
    if (state.view.stage !== appliedStage) {
      appliedStage = state.view.stage;
      loadStage(appliedStage);
    }
    if (state.view.walkPreview && !mannequin) loadMannequin();
    if (mannequin) mannequin.visible = state.view.walkPreview;
  });

  function animate() {
    if (disposed) return;
    requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 0.05);
    advanceEnvironmentShaderTime(delta);
    const walking = store.getState().view.walkPreview;
    if (walking) mixer?.update(delta);
    for (const callback of frameCallbacks) callback(delta);
    controls.update();
    if (renderer.isWebGPURenderer && document.body.dataset.modelReady === 'true') {
      environmentSunShadowPass.update({ dynamic: walking });
    }
    renderer.render(scene, camera);
  }

  function handleResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', handleResize);

  return {
    ...engineHandle,
    dispose() {
      disposed = true;
      window.removeEventListener('resize', handleResize);
      renderer.dispose?.();
    },
    resetCamera,
    async start() {
      await whenRendererReady(renderer);
      animate();
      await loadStage(store.getState().view.stage);
    },
  };
}
