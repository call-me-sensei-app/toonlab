import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { createCharacterRuntime } from '../../src/character/characterRuntime.js';
import { setLocomotionActionWeights } from '../../src/character/locomotionActions.js';
import { createLabRenderer, whenRendererReady } from '../shared/rendererFactory.js';
import { createLaunchWorld, resolveLaunchShot } from './world.js';

const params = new URLSearchParams(location.search);
const initialShot = ['city', 'coast', 'alley', 'face'].includes(params.get('shot')) ? params.get('shot') : 'city';
const modelUrl = params.get('model') || '/assets-local/models/yua/yua.glb';
const stage = document.getElementById('stage');
const loadingDetail = document.getElementById('loadingDetail');
const split = document.getElementById('split');
const divider = document.getElementById('divider');
const shotName = document.getElementById('shotName');
const compareToggle = document.getElementById('compareToggle');
let compareEnabled = params.get('compare') !== '0';
document.body.dataset.compare = String(compareEnabled);
document.body.dataset.hud = String(params.get('hud') !== '0');

const renderer = createLabRenderer({ antialias: true, alpha: false });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = initialShot === 'alley' ? 1.22 : 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(initialShot === 'alley' ? '#324566' : '#83d0ef');
scene.fog = new THREE.FogExp2(initialShot === 'alley' ? '#31445d' : '#a9ddeb', initialShot === 'alley' ? 0.009 : 0.0042);
const camera = new THREE.PerspectiveCamera(37, 1, 0.05, 420);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.055;
controls.minDistance = 1.2;
controls.maxDistance = 70;
controls.maxPolarAngle = Math.PI * 0.49;

const evening = initialShot === 'alley';
const hemisphere = new THREE.HemisphereLight(evening ? '#8cadff' : '#e9f9ff', evening ? '#4a3d57' : '#76967f', evening ? 0.86 : 1.08);
scene.add(hemisphere);
const sun = new THREE.DirectionalLight(evening ? '#ffb082' : '#fff0cb', evening ? 2.35 : 2.65);
sun.position.set(evening ? -22 : -30, evening ? 18 : 38, evening ? 9 : 25);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.camera.left = -45;
sun.shadow.camera.right = 45;
sun.shadow.camera.top = 50;
sun.shadow.camera.bottom = -25;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 150;
sun.shadow.bias = -0.00018;
sun.shadow.normalBias = 0.028;
scene.add(sun);
const fill = new THREE.DirectionalLight(evening ? '#6e8cff' : '#85d9ff', evening ? 1.1 : 0.62);
fill.position.set(30, 18, -35);
scene.add(fill);

await whenRendererReady(renderer);
const world = await createLaunchWorld({ evening, onProgress: (value) => { loadingDetail.textContent = value; } });
scene.add(world.root);

loadingDetail.textContent = 'Preparing Yua and fallback locomotion…';
const characterOptions = (toon) => ({
  animation: { fallbackSourceUrl: '/characters/mannequin.glb', freestyle: false, roles: ['idle', 'walk', 'run'] },
  parent: scene,
  renderer: toon ? renderer : null,
  targetHeight: 1.7455,
  toon,
  url: modelUrl,
});
const [neutralCharacter, toonCharacter] = await Promise.all([
  createCharacterRuntime(characterOptions(false)),
  createCharacterRuntime(characterOptions({ preset: 'call_me_sensei' })),
]);
neutralCharacter.carrier.name = 'Yua — original PBR';
toonCharacter.carrier.name = 'Yua — ToonLab Pro';
setLocomotionActionWeights(neutralCharacter.actions, { idle: 1 });
setLocomotionActionWeights(toonCharacter.actions, { idle: 1 });

const desiredCamera = new THREE.Vector3();
const desiredTarget = new THREE.Vector3();
let activeShot = initialShot;
let shotTransition = 1;

function applyCharacterShot(shot) {
  [neutralCharacter, toonCharacter].forEach((runtime) => {
    runtime.carrier.position.fromArray(shot.character);
    runtime.carrier.rotation.y = shot.yaw;
    runtime.carrier.updateMatrixWorld(true);
    runtime.modelRoot.traverse((object) => {
      if (!object?.morphTargetDictionary || !object.morphTargetInfluences) return;
      for (const name of ['mouthSmileLeft', 'mouthSmileRight']) {
        const index = object.morphTargetDictionary[name];
        if (Number.isInteger(index)) object.morphTargetInfluences[index] = activeShot === 'face' ? 0.32 : 0.08;
      }
    });
  });
}

function setShot(id, immediate = false) {
  activeShot = id;
  const shot = resolveLaunchShot(id);
  desiredCamera.fromArray(shot.position);
  desiredTarget.fromArray(shot.target);
  applyCharacterShot(shot);
  split.value = String({ alley: 51, city: 35, coast: 50, face: 50 }[id] ?? 50);
  camera.fov = id === 'face' ? 29 : id === 'city' ? 35 : 37;
  camera.updateProjectionMatrix();
  shotName.textContent = shot.label;
  document.querySelectorAll('[data-shot]').forEach((button) => button.classList.toggle('active', button.dataset.shot === id));
  renderer.toneMappingExposure = id === 'alley' ? 1.22 : 1.08;
  if (immediate) {
    camera.position.copy(desiredCamera);
    controls.target.copy(desiredTarget);
    shotTransition = 1;
  } else {
    shotTransition = 0;
  }
  const next = new URL(location.href);
  if (id === 'city') next.searchParams.delete('shot'); else next.searchParams.set('shot', id);
  history.replaceState(null, '', next);
}

setShot(initialShot, true);

function resize() {
  const width = Math.max(1, stage.clientWidth);
  const height = Math.max(1, stage.clientHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function setComparisonVisibility(neutral, toon) {
  neutralCharacter.carrier.visible = neutral;
  toonCharacter.carrier.visible = toon;
}

function renderComparison() {
  const width = renderer.domElement.width;
  const height = renderer.domElement.height;
  const fraction = THREE.MathUtils.clamp(Number(split.value) / 100, 0, 1);
  divider.style.left = `${fraction * 100}%`;
  setComparisonVisibility(false, true);
  renderer.setScissorTest(false);
  renderer.render(scene, camera);
  if (compareEnabled && fraction > 0) {
    setComparisonVisibility(true, false);
    renderer.setScissorTest(true);
    renderer.setScissor(0, 0, Math.round(width * fraction), height);
    renderer.render(scene, camera);
    renderer.setScissorTest(false);
  }
  setComparisonVisibility(false, true);
}

document.querySelectorAll('[data-shot]').forEach((button) => button.addEventListener('click', () => {
  const target = button.dataset.shot;
  if (target === 'alley' && activeShot !== 'alley') {
    const next = new URL(location.href);
    next.searchParams.set('shot', 'alley');
    location.href = next;
    return;
  }
  if (activeShot === 'alley' && target !== 'alley') {
    const next = new URL(location.href);
    if (target === 'city') next.searchParams.delete('shot'); else next.searchParams.set('shot', target);
    location.href = next;
    return;
  }
  setShot(target);
}));

compareToggle.addEventListener('click', () => {
  compareEnabled = !compareEnabled;
  compareToggle.setAttribute('aria-pressed', String(compareEnabled));
  document.body.dataset.compare = String(compareEnabled);
});

resize();
document.body.dataset.launchWorldId = world.root.userData.launchWorld.id;
document.body.dataset.environmentMeshes = String(world.environmentReport.convertedMeshCount);
document.body.dataset.walkableReady = String(world.root.userData.launchWorld.readyForWalkableIntegration);
document.body.dataset.characterRig = toonCharacter.rig?.type ?? 'unknown';
document.body.dataset.characterAnimationSource = toonCharacter.animationSource;
document.body.dataset.ready = 'true';
loadingDetail.textContent = 'Ready';
globalThis.__TOONLAB_LAUNCH_WORLD = { camera, controls, neutralCharacter, scene, toonCharacter, world };

const timer = new THREE.Timer();
timer.connect(document);
renderer.setAnimationLoop(() => {
  timer.update();
  const delta = Math.min(timer.getDelta(), 0.05);
  neutralCharacter.update(delta);
  toonCharacter.update(delta);
  if (shotTransition < 1) {
    shotTransition = Math.min(1, shotTransition + delta * 1.25);
    const eased = 1 - Math.pow(1 - shotTransition, 3);
    camera.position.lerp(desiredCamera, eased * 0.09 + 0.01);
    controls.target.lerp(desiredTarget, eased * 0.09 + 0.01);
  }
  controls.update();
  renderComparison();
});

addEventListener('resize', resize);
addEventListener('pagehide', () => {
  timer.disconnect();
  neutralCharacter.dispose();
  toonCharacter.dispose();
}, { once: true });
