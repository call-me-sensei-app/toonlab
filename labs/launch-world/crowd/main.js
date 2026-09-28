// FILL-006 verification + Gate 4 measurement lab. Route: /labs/launch-world/crowd/
//
// This lab exists for two reasons and no others:
//   1. see the figures — silhouette, build, colourway, material separation,
//      grounding and contact shadow, at review distance and close up;
//   2. MEASURE the Gate 4 cost the parity analysis asked for and nobody has:
//      load time, heap, draw calls, triangles and frame time as a function of
//      figure count, at 1440p and at 4K.
//
// Query parameters:
//   ?count=N     figures to build (default 18)
//   ?shot=lineup|crowd|close|garden
//   ?res=1440|2160|native   render resolution for the measurement
//   ?renderer=webgl         force the WebGL fallback backend
//   ?ui=0                   strip chrome for captures
//   ?seed=N                 placement seed (determinism check)

import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import {
  createGroundShaderMesh,
  createGroundShaderSettings,
} from '@call-me-sensei/toonlab/ground-shader';

import { createLabRenderer, whenRendererReady } from '../../shared/rendererFactory.js';
import grassyLandTextureUrl from '../../shared/textures/grassy-land-texture.jpg';
import landTextureUrl from '../../shared/textures/land-texture.jpg';
import rockTextureUrl from '../../shared/textures/rock-texture.jpg';
import sandTextureUrl from '../../shared/textures/sand-texture.jpg';

import { CROWD_FIGURES } from './figureLibrary.js';
import { createCrowdPopulation } from './crowdRuntime.js';
import { buildReviewPlacements, groundHeightAt } from './placements.js';

const params = new URLSearchParams(location.search);
const count = params.has('count') && Number.isFinite(Number(params.get('count')))
  ? Math.max(0, Math.min(Math.trunc(Number(params.get('count'))), 120))
  : 18;
const seed = Number.isFinite(Number(params.get('seed'))) ? Number(params.get('seed')) : 20260815;
const resolution = params.get('res') ?? 'native';

const stage = document.querySelector('#stage');
const loading = document.querySelector('#loading');
const detail = document.querySelector('#loadingDetail');
const readout = document.querySelector('#readout');
if (params.get('ui') === '0') document.body.dataset.ui = '0';

const SHOTS = {
  close: { fov: 34, position: [0, 1.55, 6.4], target: [0, 1.0, 0] },
  crowd: { fov: 40, position: [14, 6.2, 26], target: [-2, 1.2, -4] },
  garden: { fov: 50, position: [3.2, 2.0, 9.6], target: [0.4, 1.0, 1.4] },
  lineup: { fov: 30, position: [0, 2.2, 22], target: [0, 1.0, 0] },
};

function progress(text) { if (detail) detail.textContent = text; }

async function loadLayerTexture(url) {
  const texture = await new THREE.TextureLoader().loadAsync(url);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

/** Splat brick: a moss/earth field, so contact stamps are read against a real surface. */
function buildGroundField({ width = 128, depth = 128 } = {}) {
  const splat = new Uint8Array(width * depth * 4);
  for (let index = 0; index < width * depth; index += 1) {
    const x = (index % width) / width;
    const z = Math.floor(index / width) / depth;
    const moss = Math.max(0, Math.min(1, 0.55 + 0.45 * Math.sin(x * 7.1) * Math.cos(z * 5.3)));
    splat[index * 4] = Math.round(moss * 255);
    splat[index * 4 + 1] = Math.round((1 - moss) * 255);
  }
  return { splat, splatD: depth, splatW: width };
}

function buildGroundGeometry() {
  const geometry = new THREE.PlaneGeometry(120, 120, 120, 120);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i += 1) {
    position.setY(i, groundHeightAt(position.getX(i), position.getZ(i)));
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

async function main() {
  const renderer = createLabRenderer({ alpha: false, antialias: true });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  stage.append(renderer.domElement);
  await whenRendererReady(renderer);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#b6d7e4');
  scene.fog = new THREE.Fog('#c3dde8', 40, 240);

  const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.1, 600);

  // Warm key + cool sky fill. Deliberately simple: this lab measures the crowd
  // system, and a full style runtime would put the scene's cost in the numbers.
  const sun = new THREE.DirectionalLight('#ffeccd', 2.5);
  sun.position.set(-16, 22, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -26;
  sun.shadow.camera.right = 26;
  sun.shadow.camera.top = 26;
  sun.shadow.camera.bottom = -26;
  sun.shadow.camera.far = 90;
  sun.shadow.normalBias = 0.03;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight('#dcf0ff', '#6b7f66', 1.15));

  progress('Painting the ground');
  const layers = await Promise.all([
    loadLayerTexture(grassyLandTextureUrl),
    loadLayerTexture(landTextureUrl),
    loadLayerTexture(rockTextureUrl),
    loadLayerTexture(sandTextureUrl),
  ]);
  const ground = createGroundShaderMesh({
    field: buildGroundField(),
    geometry: buildGroundGeometry(),
    layers: layers.map((texture) => ({ texture })),
    name: 'Crowd lab · ground',
    settings: createGroundShaderSettings({ preset: 'call_me_sensei', projection: { grassScale: 3.2 } }),
    styleTarget: { targetId: 'crowd-lab/ground' },
  });
  ground.receiveShadow = true;
  scene.add(ground);

  progress('Building the population');
  const heapBefore = performance.memory?.usedJSHeapSize ?? 0;
  const placements = params.get('set') === 'garden'
    ? [{ activity: 'sit', at: [0, 0], figure: 'FIG-GARDEN-01', phase: 0.22, yaw: 0.35 },
      { activity: 'idle', at: [1.6, -0.4], figure: 'FIG-GARDEN-01', phase: 0.6, yaw: -0.2 }]
    : buildReviewPlacements({ count, seed });
  const crowd = await createCrowdPopulation({
    contactShadow: { opacity: 0.4, radius: 0.46, tint: '#4a3550' },
    heightAt: groundHeightAt,
    onProgress: progress,
    parent: scene,
    placements,
    renderer,
    seed,
    toon: { preset: 'call_me_sensei' },
  });
  const heapAfter = performance.memory?.usedJSHeapSize ?? 0;

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 1;
  controls.maxDistance = 140;
  controls.maxPolarAngle = Math.PI * 0.495;

  function setShot(id) {
    const shot = SHOTS[id] ?? SHOTS.lineup;
    camera.fov = shot.fov;
    camera.position.set(...shot.position);
    camera.updateProjectionMatrix();
    controls.target.set(...shot.target);
    controls.update();
    document.body.dataset.crowdShot = id;
    for (const button of document.querySelectorAll('#hud [data-shot]')) {
      button.classList.toggle('active', button.dataset.shot === id);
    }
  }
  for (const button of document.querySelectorAll('#hud [data-shot]')) {
    button.addEventListener('click', () => setShot(button.dataset.shot));
  }
  for (const button of document.querySelectorAll('#hud [data-count]')) {
    button.addEventListener('click', () => {
      const next = new URL(location.href);
      next.searchParams.set('count', button.dataset.count);
      location.href = next;
    });
    button.classList.toggle('active', Number(button.dataset.count) === count);
  }
  setShot(SHOTS[params.get('shot')] ? params.get('shot') : 'lineup');

  function resize() {
    let width = innerWidth;
    let height = innerHeight;
    let pixelRatio = Math.min(devicePixelRatio, 2);
    if (resolution === '1440') { width = 2560; height = 1440; pixelRatio = 1; }
    if (resolution === '2160') { width = 3840; height = 2160; pixelRatio = 1; }
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, resolution === 'native');
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  resize();
  addEventListener('resize', () => { if (resolution === 'native') resize(); });

  const backendName = renderer.backend?.isWebGPUBackend ? 'WebGPU' : 'WebGL2';
  document.body.dataset.crowdBackend = backendName;
  document.body.dataset.crowdFigures = String(crowd.census.figures);
  document.body.dataset.crowdArchetypes = String(crowd.census.archetypes);
  document.body.dataset.crowdTriangles = String(crowd.census.triangles);
  document.body.dataset.crowdRetargets = String(crowd.census.retargets);
  document.body.dataset.crowdBuildMs = crowd.timings.total.toFixed(1);
  document.body.dataset.crowdSourceMs = crowd.timings.source.toFixed(1);
  document.body.dataset.crowdGeometryMs = crowd.timings.geometry.toFixed(1);
  document.body.dataset.crowdToonMs = crowd.timings.toon.toFixed(1);
  document.body.dataset.crowdHeapMb = ((heapAfter - heapBefore) / 1048576).toFixed(2);
  document.body.dataset.crowdLibrary = String(CROWD_FIGURES.length);
  document.body.dataset.crowdReady = 'false';

  loading?.remove();

  const timer = new THREE.Timer();
  timer.connect(document);
  let frames = 0;
  let fpsFrames = 0;
  let fpsTime = 0;
  const frameSamples = [];

  renderer.setAnimationLoop(() => {
    timer.update();
    const delta = Math.min(timer.getDelta(), 0.05);
    const t = performance.now();
    controls.update();
    crowd.update(delta);
    renderer.render(scene, camera);
    frameSamples.push(performance.now() - t);
    if (frameSamples.length > 240) frameSamples.shift();

    frames += 1;
    fpsFrames += 1;
    fpsTime += delta;
    if (fpsTime >= 0.5) {
      const fps = Math.round(fpsFrames / fpsTime);
      fpsFrames = 0;
      fpsTime = 0;
      const sorted = [...frameSamples].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
      const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
      const info = renderer.info.render ?? {};
      document.body.dataset.crowdFps = String(fps);
      document.body.dataset.crowdDrawCalls = String(info.drawCalls ?? 0);
      document.body.dataset.crowdCpuFrameMs = median.toFixed(2);
      if (readout) {
        readout.textContent = [
          `FILL-006 crowd · ${backendName}`,
          `figures        ${crowd.census.figures}  (${crowd.census.archetypes} archetypes, ${crowd.census.colourways} colourways)`,
          `library        ${CROWD_FIGURES.length} designs`,
          `triangles      ${crowd.census.triangles.toLocaleString()}`,
          `draw calls     ${info.drawCalls ?? '?'}   (scene total)`,
          `source loads   ${crowd.census.sourceLoads}    retargets ${crowd.census.retargets}`,
          `build          ${crowd.timings.total.toFixed(0)} ms  (source ${crowd.timings.source.toFixed(0)} / geo ${crowd.timings.geometry.toFixed(0)} / toon ${crowd.timings.toon.toFixed(0)})`,
          `heap delta     ${((heapAfter - heapBefore) / 1048576).toFixed(1)} MB`,
          `render         ${renderer.domElement.width}x${renderer.domElement.height}`,
          `fps            ${fps}   cpu frame ${median.toFixed(2)} ms  p95 ${p95.toFixed(2)} ms`,
        ].join('\n');
      }
    }
    if (frames === 120) document.body.dataset.crowdReady = 'true';
  });

  globalThis.toonlabCrowd = { camera, controls, crowd, renderer, scene };
}

main().catch((error) => {
  console.error(error);
  document.body.dataset.crowdReady = 'false';
  document.body.dataset.crowdError = error.message ?? String(error);
  if (loading) {
    loading.innerHTML = '';
    loading.dataset.error = 'true';
    const title = document.createElement('strong');
    title.textContent = 'Crowd lab failed';
    const message = document.createElement('pre');
    message.textContent = error.stack ?? error.message ?? String(error);
    loading.append(title, message);
  }
});
