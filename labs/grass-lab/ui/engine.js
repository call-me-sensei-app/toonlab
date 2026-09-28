// Grass Lab engine: ToonLab's canonical first-party procedural grass clump.
// Every preview scale uses createCallMeSenseiGrassField, the same reusable
// static-mesh/material/LOD paint unit used by Landscape. No retained reference
// mesh, texture, or third-party grass package participates in this lab.
// The preview rig supplies current light, wind, cloud shadow, and interaction
// independently. The walk mannequin doubles as the grass push target.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { createEnvironmentGroundFieldPass } from '../../../src/environment/environmentGroundFieldPass.js';
import { createEnvironmentSunShadowPass } from '../../../src/environment/environmentSunShadowPass.js';
import { createPreviewGroundMaterial } from '../../shared/previewGroundMaterial.js';
import { environmentGroundField } from '../../../src/shaders-tsl/chunks/environment-ground-field.js';
import { createCallMeSenseiGrassField } from '../../../src/vegetation/callMeSenseiGrass.js';
import { createLabRenderer, whenRendererReady } from '../../shared/rendererFactory.js';
import {
  createWalkPreviewActions,
  installWalkPreviewController,
} from '../../shared/walkPreview.js';

export const GRASS_PREVIEW_MODES = Object.freeze([
  // Keep the historical ids so persisted preview state remains compatible.
  Object.freeze({ count: 1, id: 'blade', label: 'Clump', radius: 0 }),
  Object.freeze({ count: 9, id: 'tuft', label: 'Cluster', radius: 1.15 }),
  Object.freeze({ count: 70, id: 'patch', label: 'Patch', radius: 3.25 }),
  Object.freeze({ count: 420, id: 'meadow', label: 'Meadow', radius: 8.4 }),
]);

const CAMERA_BY_MODE = Object.freeze({
  blade: { position: [1.4, 1.05, 1.8], target: [0, 0.34, 0] },
  meadow: { position: [11, 7, 14], target: [0, 0.4, 0] },
  patch: { position: [5, 3.1, 6.2], target: [0, 0.38, 0] },
  tuft: { position: [2.5, 1.7, 3.1], target: [0, 0.34, 0] },
});

// Deterministic placements per mode — the field must not reshuffle on every
// settings rebuild.
function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function placementsForMode(mode) {
  const spec = GRASS_PREVIEW_MODES.find((entry) => entry.id === mode) ?? GRASS_PREVIEW_MODES[2];
  if (spec.id === 'blade') return [{ phase: 0.5, scale: 1, x: 0, y: 0, yaw: 0, z: 0 }];
  const random = mulberry32(1337);
  const placements = [];
  for (let index = 0; index < spec.count; index += 1) {
    const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(random()) * spec.radius;
    placements.push({
      phase: random(),
      scale: 0.88 + random() * 0.24,
      x: Math.cos(angle) * radius,
      y: 0,
      yaw: random() * Math.PI * 2,
      z: Math.sin(angle) * radius,
    });
  }
  return placements;
}

export function createGrassLabEngine({ mount, store }) {
  const renderer = createLabRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fc6dc);
  scene.fog = new THREE.Fog(0x9fc6dc, 18, 48);
  const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.05, 200);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  const cameraMouseButtons = {
    pan: THREE.MOUSE.PAN,
    rotate: THREE.MOUSE.ROTATE,
    zoom: THREE.MOUSE.DOLLY,
  };
  let appliedCameraMode = null;
  function syncCameraMode() {
    const cameraMode = store.getState().view.cameraMode ?? 'rotate';
    if (cameraMode === appliedCameraMode) return;
    appliedCameraMode = cameraMode;
    controls.mouseButtons.LEFT = cameraMouseButtons[cameraMode] ?? THREE.MOUSE.ROTATE;
    document.body.dataset.cameraMode = cameraMode;
  }
  syncCameraMode();

  const sun = new THREE.DirectionalLight(0xfff2dc, 1.2);
  sun.position.set(10, 16, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -12;
  sun.shadow.camera.right = 12;
  sun.shadow.camera.top = 12;
  sun.shadow.camera.bottom = -12;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun);
  scene.add(sun.target);
  const ambient = new THREE.AmbientLight(0xbcc8e0, 0.5);
  scene.add(ambient);

  const groundGeometry = new THREE.CircleGeometry(11, 64).rotateX(-Math.PI / 2);
  const groundMaterial = createPreviewGroundMaterial({ color: 0x557548, roughness: 0.98 });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.name = 'Grass Lab first-party ground-field writer';
  ground.receiveShadow = true;
  ground.userData.groundFieldWrite = true;
  scene.add(ground);
  const sunShadowPass = createEnvironmentSunShadowPass({ renderer, scene });
  environmentGroundField.colorMipLevel.value = 0;
  const groundFieldPass = createEnvironmentGroundFieldPass({
    renderer,
    resolution: 768,
    scene,
  });

  const timer = new THREE.Timer();
  timer.connect(document);
  const frameCallbacks = new Set();
  let grass = null;
  let disposed = false;
  let rebuildRequest = 0;
  // Retired fields dispose a couple frames later — destroying buffers the
  // renderer already submitted this frame trips WebGPU validation.
  const retired = [];

  function retireGrass(field) {
    if (!field) return;
    scene.remove(field);
    retired.push({ field, frames: 0 });
  }

  // Walkable mannequin — also the grass push target so blades part.
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
      mannequin.position.set(1.2, 0, 1.2);
      mannequin.visible = store.getState().view.walkPreview;
      scene.add(mannequin);
      mixer = new THREE.AnimationMixer(mannequin);
      walkActions = createWalkPreviewActions({ clips: gltf.animations, mixer });
      grass?.setPushTarget?.(mannequin);
      mannequinLoading = false;
    }, undefined, () => {
      mannequinLoading = false;
      store.actions.setStatus('Mannequin model not available in this checkout.');
    });
  }

  function frameMode(mode) {
    const view = CAMERA_BY_MODE[mode] ?? CAMERA_BY_MODE.patch;
    camera.position.set(...view.position);
    controls.target.set(...view.target);
    controls.update();
  }

  // The scene rig pushes its light into the grass — sun direction from the
  // actual light, warm sun / cool sky tints scaled by the preview sliders.
  function applySceneLightToGrass() {
    if (!grass) return;
    const direction = sun.position.clone().normalize();
    const sunIntensity = sun.visible ? sun.intensity : 0;
    const skyIntensity = ambient.visible ? ambient.intensity : 0;
    grass.setSun({
      sky: ambient.color.clone().convertLinearToSRGB().toArray(),
      color: sun.color.clone().convertLinearToSRGB().toArray(),
      intensity: sunIntensity,
      skyIntensity,
      direction: [direction.x, direction.y, direction.z],
    });
    groundMaterial.userData.setPreviewLighting({
      sunDirection: direction, sunColor: sun.color, skyColor: ambient.color, sunIntensity, skyIntensity,
    });
  }

  function applySceneStateToGrass() {
    if (!grass) return;
    const { view } = store.getState();
    grass.setWind({
      direction: view.windDirection,
      gustFrequency: view.gustFrequency,
      gustSpeed: view.gustSpeed,
      speed: view.windSpeed,
      strength: view.windStrength,
    });
    grass.setCloudShadow({
      coverage: view.cloudShadowCoverage,
      scale: view.cloudShadowScale,
      strength: view.cloudShadowStrength,
      velocity: view.cloudShadowVelocity,
    });
    grass.setPushRadius(view.pushRadius);
  }

  async function rebuildGrass() {
    const request = ++rebuildRequest;
    document.body.dataset.modelReady = 'false';
    const state = store.getState();
    const placements = placementsForMode(state.view.mode);
    const nextGrass = await createCallMeSenseiGrassField({
      ...state.settings,
      groundField: true,
      placements,
      preset: 'call_me_sensei_clump',
      variant: 'primary',
    });
    if (disposed || request !== rebuildRequest) {
      nextGrass.dispose?.();
      return;
    }
    retireGrass(grass);
    grass = nextGrass;
    if (mannequin) grass.setPushTarget?.(mannequin);
    scene.add(grass);
    applySceneLightToGrass();
    applySceneStateToGrass();
    store.actions.adoptEngineState({
      bladeCount: grass.bladeCount ?? 0,
      clumpCount: placements.length,
    });
    const provenance = grass.userData.callMeSenseiGrass;
    document.body.dataset.grassApi = 'createCallMeSenseiGrassField';
    document.body.dataset.grassClumpCount = String(placements.length);
    document.body.dataset.grassFirstParty = String(provenance?.firstParty === true);
    document.body.dataset.grassProcedural = String(provenance?.procedural === true);
    document.body.dataset.groundFieldReady = String(groundFieldPass.ready);
    document.body.dataset.modelReady = 'true';
  }

  function resetCamera() {
    frameMode(store.getState().view.mode);
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
  });

  let appliedRevision = store.getState().docRevision;
  let appliedMode = store.getState().view.mode;
  store.subscribe(() => {
    const state = store.getState();
    syncCameraMode();
    sun.intensity = state.view.sunIntensity ?? sun.intensity;
    ambient.intensity = state.view.ambientIntensity ?? ambient.intensity;
    applySceneLightToGrass();
    applySceneStateToGrass();
    if (state.view.mode !== appliedMode) {
      appliedMode = state.view.mode;
      void rebuildGrass();
      frameMode(appliedMode);
    }
    if (state.docRevision !== appliedRevision) {
      appliedRevision = state.docRevision;
      // Blade geometry bakes per instance — rebuild; everything else would
      // re-tune live, and a rebuild covers both simply and fast enough here.
      void rebuildGrass();
    }
    if (state.view.walkPreview && !mannequin) loadMannequin();
    if (mannequin) mannequin.visible = state.view.walkPreview;
  });

  function animate(timestamp) {
    if (disposed) return;
    requestAnimationFrame(animate);
    timer.update(timestamp);
    const delta = Math.min(timer.getDelta(), 0.05);
    if (store.getState().view.walkPreview) mixer?.update(delta);
    grass?.update?.(delta, camera);
    for (const callback of frameCallbacks) callback(delta);
    controls.update();
    sunShadowPass.update({ camera, dynamic: true });
    groundFieldPass.invalidateColor();
    groundFieldPass.update();
    document.body.dataset.previewSunShadowReady = String(sunShadowPass.ready);
    renderer.render(scene, camera);
    for (let index = retired.length - 1; index >= 0; index -= 1) {
      const entry = retired[index];
      entry.frames += 1;
      if (entry.frames > 6) {
        entry.field.dispose?.();
        retired.splice(index, 1);
      }
    }
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
      rebuildRequest += 1;
      window.removeEventListener('resize', handleResize);
      timer.dispose();
      grass?.dispose?.();
      for (const entry of retired) entry.field.dispose?.();
      retired.length = 0;
      sunShadowPass.dispose();
      groundFieldPass.dispose();
      groundGeometry.dispose();
      groundMaterial.dispose();
      renderer.dispose?.();
    },
    resetCamera,
    async start() {
      await whenRendererReady(renderer);
      groundFieldPass.update();
      await rebuildGrass();
      frameMode(store.getState().view.mode);
      requestAnimationFrame(animate);
    },
  };
}
