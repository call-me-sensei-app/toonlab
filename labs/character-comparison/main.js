import * as THREE from 'three';

import { createCharacterRuntime } from '../../src/character/characterRuntime.js';
import { setLocomotionActionWeights } from '../../src/character/locomotionActions.js';
import { createLabRenderer, whenRendererReady } from '../shared/rendererFactory.js';

const params = new URLSearchParams(location.search);
const modelUrl = params.get('model') || '/assets-local/models/yua/yua.glb';
const view = (params.get('view') || 'front').toLowerCase();
const pose = (params.get('pose') || 'idle').toLowerCase();
const poseTime = Number(params.get('time') || (pose === 'idle' ? 0.8 : 0.42));
const targetHeight = Number(params.get('height') || 1.7455);
const toonPreset = params.get('toonPreset') || 'call_me_sensei';
const stage = document.getElementById('stage');
const slider = document.getElementById('split');
const divider = document.getElementById('divider');
const status = document.getElementById('status');

slider.value = String(THREE.MathUtils.clamp(Number(params.get('split') || 50), 0, 100));
document.body.dataset.labels = String(params.get('labels') !== '0');
document.body.dataset.divider = String(params.get('divider') !== '0');
document.body.dataset.interactive = String(params.get('interactive') !== '0');

const renderer = createLabRenderer({ antialias: true, alpha: false });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
stage.prepend(renderer.domElement);

function createReviewScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#d7e0ea');

  const hemisphere = new THREE.HemisphereLight('#eff7ff', '#8b817a', 1.15);
  scene.add(hemisphere);

  const key = new THREE.DirectionalLight('#fff7ed', 3.1);
  key.position.set(-2.4, 4.6, 3.5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -2.5;
  key.shadow.camera.right = 2.5;
  key.shadow.camera.top = 3.2;
  key.shadow.camera.bottom = -0.4;
  key.shadow.camera.near = 0.1;
  key.shadow.camera.far = 12;
  key.shadow.bias = -0.00025;
  scene.add(key);

  const rim = new THREE.DirectionalLight('#bddcff', 1.15);
  rim.position.set(2.8, 2.7, -2.6);
  scene.add(rim);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 12),
    new THREE.MeshStandardMaterial({ color: '#b9c4cf', roughness: 0.86, metalness: 0 }),
  );
  floor.name = 'Review floor';
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  return scene;
}

const neutralScene = createReviewScene();
const toonScene = createReviewScene();
const camera = new THREE.PerspectiveCamera(34, 1, 0.02, 30);

function configureView(runtime) {
  const turn = view === 'side' ? -90 : view === 'three-quarter' || view === 'threequarter' ? -28 : 0;
  runtime.carrier.rotation.y = THREE.MathUtils.degToRad(turn);
  runtime.carrier.updateMatrixWorld(true);

  if (view === 'face') {
    camera.fov = 29;
    camera.position.set(0, 1.53, 1.45);
    camera.lookAt(0, 1.50, 0);
  } else {
    camera.fov = 32;
    camera.position.set(0, 0.96, 3.35);
    camera.lookAt(0, 0.88, 0);
  }
  camera.updateProjectionMatrix();
}

function setPose(runtime) {
  const trackedBones = [
    'mixamorigHips',
    'mixamorigLeftArm',
    'mixamorigLeftLeg',
    'mixamorigLeftHandIndex3',
  ];
  const boneState = () => Object.fromEntries(trackedBones.map((name) => {
    const bone = runtime.targetMesh?.skeleton?.bones?.find((entry) => entry.name === name);
    return [name, bone?.quaternion?.toArray() ?? null];
  }));
  const before = boneState();
  const weights = pose === 'walk'
    ? { walk: 1 }
    : pose === 'run' || pose === 'strong'
      ? { run: 1 }
      : { idle: 1 };
  runtime.setAnimationEnabled(true);
  setLocomotionActionWeights(runtime.actions, weights);
  runtime.mixer?.update(Number.isFinite(poseTime) ? poseTime : 0.5);

  if (view === 'face') {
    runtime.modelRoot.traverse((object) => {
      if (!object?.morphTargetDictionary || !object.morphTargetInfluences) return;
      for (const [name, value] of [['mouthSmileLeft', 0.38], ['mouthSmileRight', 0.38]]) {
        const index = object.morphTargetDictionary[name];
        if (Number.isInteger(index)) object.morphTargetInfluences[index] = value;
      }
    });
  }
  runtime.modelRoot.updateMatrixWorld(true);
  const activeMorphs = {};
  runtime.modelRoot.traverse((object) => {
    if (!object?.morphTargetDictionary || !object.morphTargetInfluences) return;
    for (const [name, index] of Object.entries(object.morphTargetDictionary)) {
      const value = object.morphTargetInfluences[index] || 0;
      if (value > 0) activeMorphs[`${object.name}:${name}`] = value;
    }
  });
  return {
    activeMorphs,
    after: boneState(),
    before,
    clipTracks: Object.fromEntries(Object.entries(runtime.clips || {}).map(([name, clip]) => [name, clip.tracks.length])),
    clipTrackSamples: Object.fromEntries(Object.entries(runtime.clips || {}).map(([name, clip]) => [name, clip.tracks.slice(0, 5).map((track) => track.name)])),
    mixerTime: runtime.mixer?.time ?? null,
    weights: {
      idle: runtime.actions?.idle?.getEffectiveWeight?.() ?? null,
      run: runtime.actions?.run?.getEffectiveWeight?.() ?? null,
      walk: runtime.actions?.walk?.getEffectiveWeight?.() ?? null,
    },
  };
}

function runtimeOptions(parent, toon) {
  return {
    animation: {
      fallbackSourceUrl: '/characters/mannequin.glb',
      freestyle: false,
      roles: ['idle', 'walk', 'run'],
    },
    parent,
    renderer: toon ? renderer : null,
    targetHeight,
    toon,
    url: modelUrl,
  };
}

function resize() {
  const width = Math.max(1, stage.clientWidth);
  const height = Math.max(1, stage.clientHeight);
  const pixelRatio = Math.min(devicePixelRatio, 2);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function render() {
  const width = renderer.domElement.width;
  const height = renderer.domElement.height;
  const split = THREE.MathUtils.clamp(Number(slider.value) / 100, 0, 1);
  const splitPixels = Math.round(width * split);
  divider.style.left = `${split * 100}%`;

  renderer.setScissorTest(false);
  renderer.render(toonScene, camera);
  if (splitPixels > 0) {
    renderer.setScissorTest(true);
    renderer.setScissor(0, 0, splitPixels, height);
    renderer.render(neutralScene, camera);
    renderer.setScissorTest(false);
  }
}

try {
  await whenRendererReady(renderer);
  const [neutral, toon] = await Promise.all([
    createCharacterRuntime(runtimeOptions(neutralScene, false)),
    createCharacterRuntime(runtimeOptions(toonScene, { preset: toonPreset })),
  ]);
  configureView(neutral);
  configureView(toon);
  const neutralPoseEvidence = setPose(neutral);
  const toonPoseEvidence = setPose(toon);
  resize();
  render();

  const roles = Object.keys(toon.clips || {}).sort();
  const materialRoleSummary = toon.toonState?.materialRoleSummary || {};
  window.__YUA_REVIEW = { camera, neutral, toon, materialRoleSummary, pose, roles, view };
  document.body.dataset.model = modelUrl;
  document.body.dataset.pose = pose;
  document.body.dataset.view = view;
  document.body.dataset.rig = toon.rig?.type || 'none';
  document.body.dataset.animationSource = toon.animationSource;
  document.body.dataset.animationRoles = roles.join(',');
  document.body.dataset.poseEvidence = JSON.stringify({ neutral: neutralPoseEvidence, toon: toonPoseEvidence });
  document.body.dataset.materialRoles = JSON.stringify(materialRoleSummary.counts || {});
  document.body.dataset.ready = 'true';

  slider.addEventListener('input', render);
  addEventListener('resize', () => {
    resize();
    render();
  });
} catch (error) {
  console.error(error);
  status.textContent = error?.message || String(error);
  document.body.dataset.error = status.textContent;
}
