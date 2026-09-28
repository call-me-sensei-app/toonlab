// Lighting Lab stage: renderer / camera / frame-loop lifecycle only.
//
// Scene dressing lives in scenes.js and every light flows through the
// createLightingSystem instance that main.js wires up — the stage itself
// never creates lights. Stages use MeshStandardMaterial dressing, so the
// style-driven sun renders real shadow maps via native three shadow mapping
// on both the WebGPU and TSL-WebGL renderer paths.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { createLabRenderer, whenRendererReady } from '../shared/rendererFactory.js';

export async function createLightingLabStage({ mount }) {
  const renderer = createLabRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  mount.appendChild(renderer.domElement);
  await whenRendererReady(renderer);
  guardSharedUniformGroupDestruction(renderer);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x101623);
  scene.fog = new THREE.Fog(0x101623, 30, 130);

  // Far plane sized for the composed outdoor world's sky dome.
  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 2500);
  camera.position.set(14, 8, 16);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.minDistance = 2;
  controls.maxDistance = 120;

  const frameCallbacks = new Set();
  let disposed = false;
  let previous = performance.now();
  renderer.setAnimationLoop((now = performance.now()) => {
    if (disposed) return;
    const delta = Math.min(Math.max((now - previous) / 1000, 0), 0.1);
    previous = now;
    controls.update();
    for (const callback of frameCallbacks) callback(delta);
    // The lighting system owns the fog color; mirroring it (darkened, so
    // night skies stay night after the linear→sRGB lift) into the background
    // keeps the sky reading with the style's day cycle. Composed worlds
    // cover this with their own sky dome.
    scene.background.copy(scene.fog.color).multiplyScalar(0.5);
    renderer.render(scene, camera);
  });

  const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener('resize', onResize);

  return {
    camera,
    controls,
    renderer,
    scene,
    /** Registers a per-frame callback; returns an unsubscribe function. */
    onFrame(callback) {
      frameCallbacks.add(callback);
      return () => frameCallbacks.delete(callback);
    },
    setView(position, target) {
      camera.position.fromArray(position);
      controls.target.fromArray(target);
      camera.lookAt(controls.target);
      controls.update();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      window.removeEventListener('resize', onResize);
      renderer.setAnimationLoop(null);
      frameCallbacks.clear();
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

// three r185: disposing render objects decrements shared bind-group use
// counts and can destroy the SHARED 'render'/'frame' uniform-group buffer
// while live bind groups still reference it — Dawn then raises "used in
// submit while destroyed" on every frame until the bindings rebuild. The
// factory's deferred-destroy patch cannot help a buffer that stays
// referenced, so this lab (scene switches + light churn are its core loop)
// skips destroying shared node-group buffers entirely; the renderer simply
// reuses them on the next bind. One small buffer intentionally outlives its
// last user. Re-evaluate on the next three version bump.
function guardSharedUniformGroupDestruction(renderer) {
  const backend = renderer.backend;
  if (!backend?.destroyUniformBuffer) return;
  const originalDestroy = backend.destroyUniformBuffer.bind(backend);
  backend.destroyUniformBuffer = (uniformBuffer) => {
    if (uniformBuffer?.isNodeUniformsGroup && uniformBuffer.groupNode?.shared) return;
    originalDestroy(uniformBuffer);
  };
}

/** Disposes a dressing subtree: geometries, materials, and scene membership. */
export function disposeSceneRoot(root) {
  if (!root) return;
  root.traverse((object) => {
    object.geometry?.dispose?.();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const item of materials) item?.dispose?.();
  });
  root.removeFromParent();
}
