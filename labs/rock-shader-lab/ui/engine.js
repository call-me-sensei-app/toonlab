// Rock Shader Lab validates one reusable material profile on a first-party
// ToonLab Rock Generator fixture. All surrounding scene choices are preview
// state and never enter the portable shader document.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import {
  applyRockShader,
  disposeDefaultRockShaderTextures,
  restoreRockShader,
} from '../../../src/rock-shader/index.js';
import { whenRendererReady } from '../../shared/rendererFactory.js';
import {
  createShaderPreviewRenderer,
  createShaderPreviewScene,
  ROCK_SHADER_PREVIEW_FIXTURES,
} from '../../shared/shader-preview/proceduralScene.js';

export { ROCK_SHADER_PREVIEW_FIXTURES } from '../../shared/shader-preview/proceduralScene.js';

export async function createRockShaderLabEngine({ mount, store }) {
  const renderer = createShaderPreviewRenderer();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  mount.appendChild(renderer.domElement);
  await whenRendererReady(renderer);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    300,
  );
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.maxPolarAngle = Math.PI / 2 - 0.03;

  function setNavigationMode(mode = 'rotate') {
    controls.mouseButtons.LEFT = mode === 'pan'
      ? THREE.MOUSE.PAN
      : mode === 'zoom' ? THREE.MOUSE.DOLLY : THREE.MOUSE.ROTATE;
  }
  setNavigationMode();

  const previewScene = await createShaderPreviewScene({
    authoredComponent: 'rock',
    camera,
    renderer,
    scene,
  });
  controls.target.copy(previewScene.focus);
  controls.update();

  let appliedRevision = -1;
  let appliedFixture = null;
  let appliedPreviewHour = null;
  let appliedPreviewStyles = null;
  let autoCycleAccumulator = 0;
  let disposed = false;
  let fixtureRequest = 0;
  const clock = new THREE.Clock();

  function applyProfile() {
    const report = applyRockShader(
      previewScene.rockRoot,
      store.getState().settings,
    );
    store.actions.adoptEngineState({ coverage: report });
    document.body.dataset.shaderMatched = String(report.matched);
    document.body.dataset.shaderApplied = String(report.applied);
    document.body.dataset.rockTextureSource = report.textureSource;
  }

  async function applyFixture() {
    const fixture = store.getState().view.fixture;
    const request = ++fixtureRequest;
    document.body.dataset.previewFixtureLoading = 'true';
    try {
      restoreRockShader(previewScene.rockRoot);
      await previewScene.setRockFixture(fixture);
      if (disposed || request !== fixtureRequest) return;
      appliedFixture = fixture;
      applyProfile();
    } finally {
      if (request === fixtureRequest) {
        document.body.dataset.previewFixtureLoading = 'false';
      }
    }
  }

  function applyPreviewEnvironment() {
    const { previewHour } = store.getState();
    previewScene.applyTime(previewHour);
    appliedPreviewHour = previewHour;
  }

  function applyPreviewStyles() {
    const { preview } = store.getState();
    previewScene.applyComponentStyles(preview);
    previewScene.applyComponentVisibility(preview);
    appliedPreviewStyles = JSON.stringify(preview);
  }

  const unsubscribe = store.subscribe(() => {
    const state = store.getState();
    if (state.docRevision !== appliedRevision) {
      appliedRevision = state.docRevision;
      applyProfile();
    }
    if (state.view.fixture !== appliedFixture) void applyFixture();
    if (state.previewHour !== appliedPreviewHour) applyPreviewEnvironment();
    if (JSON.stringify(state.preview) !== appliedPreviewStyles) applyPreviewStyles();
  });

  function resetCamera() {
    controls.target.copy(previewScene.resetCamera());
    controls.update();
  }

  function handleResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    previewScene.resize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', handleResize);

  function animate() {
    if (disposed) return;
    requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 0.05);
    if (store.getState().previewAutoCycle) {
      autoCycleAccumulator += delta;
      if (autoCycleAccumulator >= 0.1) {
        const elapsed = autoCycleAccumulator;
        autoCycleAccumulator = 0;
        store.actions.setPreviewHour(store.getState().previewHour + elapsed * 0.5);
      }
    } else {
      autoCycleAccumulator = 0;
    }
    controls.update();
    previewScene.update(delta);
    renderer.render(scene, camera);
  }

  return {
    camera,
    controls,
    dispose() {
      disposed = true;
      fixtureRequest += 1;
      unsubscribe();
      window.removeEventListener('resize', handleResize);
      restoreRockShader(previewScene.rockRoot);
      previewScene.dispose();
      disposeDefaultRockShaderTextures();
      renderer.dispose();
    },
    renderer,
    resetCamera,
    setNavigationMode,
    scene,
    async start() {
      const state = store.getState();
      appliedRevision = state.docRevision;
      appliedFixture = state.view.fixture;
      appliedPreviewHour = state.previewHour;
      appliedPreviewStyles = JSON.stringify(state.preview);
      await previewScene.setRockFixture(appliedFixture);
      applyPreviewStyles();
      applyProfile();
      applyPreviewEnvironment();
      resetCamera();
      document.body.dataset.referenceScene = 'toonlab-procedural-shader-range';
      document.body.dataset.referenceStyle = 'toonlab-first-party';
      document.body.dataset.modelReady = 'true';
      animate();
    },
  };
}
