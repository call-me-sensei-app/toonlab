// Ground Shader Lab authors one portable Ground profile on a first-party
// procedural terrain, splat field, and texture set. Preview style, visibility,
// weather, time, and camera state never enter the exported document.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import {
  applyGroundShader,
  createGroundPrintLayer,
  createGroundShaderMaterial,
  disposeGroundShaderMaterial,
  setGroundShaderSceneState,
} from '../../../src/ground-shader/index.js';
import { whenRendererReady } from '../../shared/rendererFactory.js';
import {
  createShaderPreviewRenderer,
  createShaderPreviewScene,
} from '../../shared/shader-preview/proceduralScene.js';

export async function createGroundShaderLabEngine({ mount, store }) {
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

  const previewScene = await createShaderPreviewScene({
    authoredComponent: 'ground',
    camera,
    renderer,
    scene,
  });
  await previewScene.setRockFixture('spire-05');
  const { groundRoot } = previewScene;
  if (!groundRoot?.isMesh) {
    throw new Error('The ToonLab procedural preview has no Ground Shader target.');
  }
  const sourceGroundMaterial = groundRoot.material;
  const groundBounds = new THREE.Box3().setFromObject(groundRoot, true);
  const printLayer = createGroundPrintLayer({
    bounds: groundBounds,
    resolution: 1024,
  });
  const material = createGroundShaderMaterial({
    field: previewScene.groundField,
    layers: previewScene.groundLayers,
    printLayer,
    settings: store.getState().settings,
  });
  groundRoot.material = material;
  groundRoot.castShadow = true;
  groundRoot.receiveShadow = true;

  const groundCenter = groundBounds.getCenter(new THREE.Vector3());
  const groundSize = groundBounds.getSize(new THREE.Vector3());
  let appliedRevision = -1;
  let appliedPreviewState = null;
  let appliedViewMode = null;
  let appliedWorldState = null;
  let autoCycleAccumulator = 0;
  let disposed = false;
  const clock = new THREE.Clock();

  function stampPrints(shape = store.getState().view.printShape) {
    const startCount = printLayer.stampCount;
    const pathYaw = Math.atan2(-0.28, 1);
    if (shape === 'paw') {
      for (let index = 0; index < 10; index += 1) {
        const z = 2.4 + index * 0.34;
        printLayer.stamp({
          position: { x: 3.4 + index * 0.27, z },
          pressure: 0.82,
          rotation: 0.62,
          shape: 'paw',
          size: [0.24, 0.3],
        });
      }
    } else if (shape === 'hoof') {
      for (let index = 0; index < 12; index += 1) {
        const z = -3.6 + index * 0.66;
        printLayer.stamp({
          position: { x: 3 - z * 0.28 + (index % 2 ? 0.18 : -0.18), z },
          pressure: 0.9,
          rotation: pathYaw,
          shape: 'hoof',
          size: [0.25, 0.31],
        });
      }
    } else if (shape === 'tire') {
      for (let index = 0; index < 34; index += 1) {
        const z = -4.8 + index * 0.3;
        printLayer.stamp({
          position: { x: 3 - z * 0.28, z },
          pressure: 0.76,
          rim: 0.1,
          rotation: pathYaw,
          shape: 'tire',
          size: [0.34, 0.36],
        });
      }
    } else if (shape === 'impact') {
      [[2.1, 3.25, 0.72], [4.7, 4.2, 0.46], [0.4, -1.0, 0.34]].forEach(([x, z, size]) => {
        printLayer.stamp({
          position: { x, z },
          pressure: 0.92,
          rotation: x * 0.41,
          shape: 'impact',
          size: [size, size],
        });
      });
    } else {
      for (let index = 0; index < 14; index += 1) {
        const z = -4.2 + index * 0.66;
        const left = index % 2 === 0;
        printLayer.stamp({
          position: { x: 3 - z * 0.28 + (left ? -0.14 : 0.14), z },
          pressure: 0.88,
          rotation: pathYaw,
          shape: left ? 'boot-left' : 'boot-right',
          size: [0.2, 0.42],
        });
      }
      // Carry the trail into the printable low sand patch as an immediate
      // cross-surface comparison when Snow preview is off.
      for (let index = 0; index < 4; index += 1) {
        const left = index % 2 === 0;
        printLayer.stamp({
          position: { x: 4.35 + index * 0.45, z: 4.0 + index * 0.18 },
          pressure: 0.9,
          rotation: 0.74,
          shape: left ? 'boot-left' : 'boot-right',
          size: [0.2, 0.42],
        });
      }
    }
    const added = printLayer.stampCount - startCount;
    store.actions.adoptEngineState({
      printCount: printLayer.stampCount,
      status: `Added ${added} ${shape} print${added === 1 ? '' : 's'}.`,
    });
    document.body.dataset.groundPrintCount = String(printLayer.stampCount);
    document.body.dataset.groundPrintShape = shape;
    return added;
  }

  function clearPrints() {
    printLayer.clear();
    store.actions.adoptEngineState({ printCount: 0, status: 'Cleared transient ground prints.' });
    document.body.dataset.groundPrintCount = '0';
  }

  function frameMode(mode = store.getState().view.viewMode) {
    if (mode === 'composition') {
      controls.target.copy(previewScene.resetCamera());
      controls.update();
      return;
    }
    camera.up.set(0, 1, 0);
    if (mode === 'surface') {
      controls.target.copy(groundCenter);
      camera.position.copy(groundCenter).add(new THREE.Vector3(
        groundSize.x * 0.28,
        Math.max(groundSize.y + 2.4, 4.4),
        groundSize.z * 0.38,
      ));
    } else {
      controls.target.copy(groundCenter);
      camera.position.copy(groundCenter).add(new THREE.Vector3(
        0.01,
        Math.max(groundSize.x, groundSize.z) * 0.78,
        0.01,
      ));
      camera.up.set(0, 0, -1);
    }
    camera.lookAt(controls.target);
    controls.update();
  }

  function applyProfile() {
    const report = applyGroundShader(material, store.getState().settings);
    store.actions.adoptEngineState({ coverage: report });
    document.body.dataset.groundShaderMatched = String(report.matched);
    document.body.dataset.groundShaderWrites = String(report.writes);
    document.body.dataset.groundShaderLoading = 'false';
  }

  function applyWorldState() {
    const state = store.getState();
    const environment = previewScene.applyTime(state.previewHour);
    setGroundShaderSceneState(material, {
      printVisibility: state.view.printsVisible ? 1 : 0,
      snowCover: state.view.snowCover,
      snowDepth: state.view.snowCover > 0 ? 0.12 : 0,
      skyColor: environment.skyColor,
      sunColor: environment.sunColor,
      sunDirection: environment.sunDirection,
      sunIntensity: environment.sunIntensity,
      skyIntensity: environment.skyIntensity,
      waterLevel: environment.waterLevel,
      wetness: state.view.wetness,
    });
    document.body.dataset.previewGroundSnowCover = String(state.view.snowCover);
    document.body.dataset.previewGroundWetness = String(state.view.wetness);
    appliedWorldState = JSON.stringify({
      hour: state.previewHour,
      printsVisible: state.view.printsVisible,
      snowCover: state.view.snowCover,
      wetness: state.view.wetness,
    });
  }

  function applyPreviewState() {
    const { preview } = store.getState();
    previewScene.applyComponentStyles(preview);
    previewScene.applyComponentVisibility(preview);
    appliedPreviewState = JSON.stringify(preview);
    applyWorldState();
  }

  const unsubscribe = store.subscribe(() => {
    const state = store.getState();
    if (state.docRevision !== appliedRevision) {
      appliedRevision = state.docRevision;
      applyProfile();
    }
    const worldState = JSON.stringify({
      hour: state.previewHour,
      printsVisible: state.view.printsVisible,
      snowCover: state.view.snowCover,
      wetness: state.view.wetness,
    });
    if (worldState !== appliedWorldState) applyWorldState();
    if (JSON.stringify(state.preview) !== appliedPreviewState) applyPreviewState();
    if (state.view.viewMode !== appliedViewMode) {
      appliedViewMode = state.view.viewMode;
      frameMode();
    }
  });

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
    printLayer.update(delta);
    previewScene.update(delta);
    renderer.render(scene, camera);
  }

  function handleResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    previewScene.resize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', handleResize);

  function setNavigationMode(mode = 'rotate') {
    controls.mouseButtons.LEFT = mode === 'pan'
      ? THREE.MOUSE.PAN
      : mode === 'zoom'
        ? THREE.MOUSE.DOLLY
        : THREE.MOUSE.ROTATE;
  }

  return {
    camera,
    clearPrints,
    controls,
    dispose() {
      disposed = true;
      unsubscribe();
      window.removeEventListener('resize', handleResize);
      groundRoot.material = sourceGroundMaterial;
      disposeGroundShaderMaterial(material);
      printLayer.dispose();
      previewScene.dispose();
      renderer.dispose();
    },
    renderer,
    resetCamera() {
      frameMode();
    },
    scene,
    setNavigationMode,
    stampPrints,
    async start() {
      const state = store.getState();
      appliedRevision = state.docRevision;
      appliedPreviewState = JSON.stringify(state.preview);
      appliedViewMode = state.view.viewMode;
      applyPreviewState();
      applyProfile();
      stampPrints(state.view.printShape);
      frameMode();
      document.body.dataset.modelReady = 'true';
      document.body.dataset.referenceScene = 'toonlab-procedural-shader-range';
      document.body.dataset.referenceStyle = 'toonlab-first-party';
      document.body.dataset.previewAssetSource = 'toonlab-procedural';
      document.body.dataset.groundPrintLayer = 'ready';
      animate();
    },
  };
}
