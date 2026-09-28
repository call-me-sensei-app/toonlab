// Character Shader Lab engine: a focused character stage for the schema-driven
// React workspace (ui/App.jsx). Renders ONE character with the toon shader on
// a simple studio ground, plays its native idle clip, and hosts the shared
// walk-preview controller so the character can be driven around like the
// Playground. The legacy full-surface page (environment captures, post
// pipeline HUD, mixamo tooling) lives on at /shader-lab/legacy/.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import {
  createCharacterRuntime,
} from '@call-me-sensei/toonlab/character';
import { createCharacterRenderPasses } from '../../../src/toon/characterRenderPasses.js';
import { createLabRenderer, whenRendererReady } from '../../shared/rendererFactory.js';
import {
  installWalkPreviewController,
} from '../../shared/walkPreview.js';
import { writeModelBoundsDataset } from '../sceneGeometry.js';

const MODEL_TARGET_SIZE = 2.4;
const DEFAULT_CAMERA_POSITION = Object.freeze([0, 1.6, 4.5]);
const DEFAULT_TARGET = Object.freeze([0, 1.2, 0]);

export function createCharacterShaderEngine({ mount, store }) {
  const renderer = createLabRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x16181d);
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(...DEFAULT_CAMERA_POSITION);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.target.set(...DEFAULT_TARGET);

  // Studio lights — same rig as the legacy character stage.
  const sun = new THREE.DirectionalLight(0xfff1de, 1.18);
  sun.position.set(1.8, 3.8, 3.4);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0xa8b7d4, 0.42));
  scene.add(new THREE.HemisphereLight(0xe8f0ff, 0x25202e, 0.26));

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.95 }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // Depth prepass / character shadow map / head tracking consumed by the
  // converted toon materials; passes auto-skip when a setting does not use them.
  const characterRenderPasses = createCharacterRenderPasses({ camera, renderer, scene });

  const clock = new THREE.Clock();
  const frameCallbacks = new Set();
  // The rig is the walker: its origin is the character's feet at ground
  // level, so the walk controller can snap position.y to the ground without
  // caring where the model's own pivot sits.
  const characterRig = new THREE.Group();
  characterRig.name = 'Character rig';
  scene.add(characterRig);

  let modelRoot = null;
  let characterRuntime = null;
  let mixer = null;
  let walkActions = null;
  let loadToken = 0;
  let disposed = false;

  function onFrame(callback) {
    frameCallbacks.add(callback);
    return () => frameCallbacks.delete(callback);
  }

  function clearModel() {
    characterRuntime?.dispose();
    characterRuntime = null;
    modelRoot = null;
    mixer = null;
    walkActions = null;
  }

  async function loadCharacter(url, materialUrl = null) {
    const token = ++loadToken;
    document.body.dataset.modelReady = 'false';
    store.actions.setStatus('Loading character…');
    try {
      const runtime = await createCharacterRuntime({
        animation: true,
        carrier: characterRig,
        materialUrl,
        renderer,
        renderPasses: characterRenderPasses,
        targetHeight: MODEL_TARGET_SIZE,
        toon: { settings: store.getState().settings },
        url,
      });
      if (token !== loadToken || disposed) {
        runtime.dispose();
        return;
      }
      clearModel();
      characterRuntime = runtime;
      modelRoot = runtime.modelRoot;
      // Model selection is preview state. Edits made while assets load remain
      // authoritative, including undo/redo and switching the open profile.
      runtime.applyToonSettings(store.getState().settings);
      characterRig.position.set(0, 0, 0);
      characterRig.rotation.set(0, 0, 0);
      const box = runtime.bounds;
      writeModelBoundsDataset(box);
      store.actions.adoptEngineState({
        convertedMeshCount: runtime.toonState?.convertedMeshCount ?? 0,
      });
      mixer = runtime.mixer;
      walkActions = runtime.actions;
      document.body.dataset.characterAnimationSource = runtime.animationSource;
      document.body.dataset.characterAnimationRetarget = runtime.rig
        ? `${runtime.rig.type}:${runtime.animationSource}`
        : 'none';
      store.actions.adoptEngineState({
        hasClips: Object.keys(runtime.clips).length > 0,
        hasLocomotion: Boolean(walkActions),
      });
      syncAnimationState(); // a model loaded with the toggle off starts in bind pose

      if (box) {
        const height = box.getSize(new THREE.Vector3()).y;
        controls.target.set(0, Math.max(0.75, Math.min(1.35, height * 0.55)), 0);
      }
      document.body.dataset.modelUrl = url;
      document.body.dataset.modelReady = 'true';
      store.actions.setStatus(`Loaded ${url.split('/').pop()}.`);
    } catch (error) {
      if (token !== loadToken) return;
      console.error('Character load failed:', error);
      document.body.dataset.modelReady = 'error';
      store.actions.setStatus(`Could not load the character: ${error.message}`);
    }
  }

  function applySettings(settings) {
    characterRuntime?.applyToonSettings(settings);
  }

  function resetCamera() {
    camera.position.set(...DEFAULT_CAMERA_POSITION);
    controls.target.set(...DEFAULT_TARGET);
    characterRig.position.set(0, 0, 0);
    characterRig.rotation.set(0, 0, 0);
    controls.update();
  }

  function setNavigationMode(mode = 'rotate') {
    controls.mouseButtons.LEFT = mode === 'pan'
      ? THREE.MOUSE.PAN
      : mode === 'zoom'
        ? THREE.MOUSE.DOLLY
        : THREE.MOUSE.ROTATE;
  }

  const engineHandle = { camera, controls, onFrame, renderer, scene };

  installWalkPreviewController({
    camera,
    controls,
    engine: engineHandle,
    getActions: () => walkActions,
    getEnabled: () => store.getState().walkPreview,
    getWalker: () => (modelRoot ? characterRig : null),
    groundY: 0,
  });

  // Whether the mixer samples this frame. When animation goes fully off the
  // skeleton is restored to its bind pose (T-pose) — pausing or zero-weighting
  // actions alone would freeze the last animation frame instead.
  let animationsRunning = true;

  function syncAnimationState() {
    const state = store.getState();
    const running = Boolean(mixer) && (state.animate || state.walkPreview);
    if (animationsRunning !== running) characterRuntime?.setAnimationEnabled(running);
    animationsRunning = running;
    if (running && !state.walkPreview && walkActions?.idle) {
      // Hand the weights back to the idle loop after a walk ends — the walk
      // controller owns them while the preview is enabled.
      walkActions.idle.setEffectiveWeight(1);
      walkActions.walk?.setEffectiveWeight(0);
      walkActions.run?.setEffectiveWeight(0);
    }
  }

  // Store → engine: settings edits re-apply live; docRevision drives it.
  let appliedRevision = store.getState().docRevision;
  store.subscribe(() => {
    const state = store.getState();
    if (state.docRevision !== appliedRevision) {
      appliedRevision = state.docRevision;
      applySettings(state.settings);
    }
    syncAnimationState();
  });

  function animate() {
    if (disposed) return;
    requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 0.05);
    if (animationsRunning) characterRuntime?.update(delta);
    for (const callback of frameCallbacks) callback(delta);
    controls.update();
    characterRenderPasses.update();
    renderer.render(scene, camera);
  }

  function handleResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    characterRenderPasses.setSize(window.innerWidth, window.innerHeight, window.devicePixelRatio);
  }
  window.addEventListener('resize', handleResize);

  return {
    ...engineHandle,
    dispose() {
      disposed = true;
      window.removeEventListener('resize', handleResize);
      clearModel();
      renderer.dispose?.();
    },
    resetCamera,
    setNavigationMode,
    setModel: loadCharacter,
    async start() {
      await whenRendererReady(renderer);
      animate();
      const { modelMtl, modelUrl } = store.getState();
      await loadCharacter(modelUrl, modelMtl);
    },
  };
}
