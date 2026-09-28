// Night Market street — entry point.
//
// Deliberately plain Three.js: no ToonLab imports. See scene.js for why, and
// launch-plan/22-night-market-replica-spec.md for the target frame.

import * as THREE from 'three';

import { SHOTS, buildNightMarket } from './scene.js';

const params = new URLSearchParams(location.search);
const stage = document.getElementById('stage');
const loading = document.getElementById('loading');
const loadingDetail = document.getElementById('loadingDetail');
const shotName = document.getElementById('shotName');
const shotStats = document.getElementById('shotStats');

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// Spec §7: dark scene, bright sources, wide value range. Tone mapping and
// exposure are owned by lighting.js — these are only a sane starting state so
// the scene is never rendered with the renderer's raw defaults.
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
stage.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.1, 400);

const progress = (text) => { if (loadingDetail) loadingDetail.textContent = text; };

const { scene, ctx, built, skipped, swaps, emissives } = await buildNightMarket({ renderer, camera, onProgress: progress });

function applyShot(key) {
  const shot = SHOTS[key] ?? SHOTS.hero;
  camera.position.set(...shot.position);
  camera.lookAt(new THREE.Vector3(...shot.target));
  camera.fov = shot.fov;
  camera.updateProjectionMatrix();
  if (shotName) shotName.textContent = key.toUpperCase();
  document.querySelectorAll('#hud nav button').forEach((b) => {
    b.classList.toggle('active', b.dataset.shot === key);
  });
}

let currentShot = params.get('shot') ?? 'hero';
applyShot(currentShot);

document.querySelectorAll('#hud nav button').forEach((button) => {
  button.addEventListener('click', () => { currentShot = button.dataset.shot; applyShot(currentShot); });
});

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

// The garden build learned this the hard way (D19-264): the frame is not the
// frame for well over a thousand frames once temporal effects are running.
// Capture waits on a settled frame count, not on "ready".
const SETTLE_FRAMES = Number(params.get('settle') ?? 900);
let frames = 0;
const clock = new THREE.Clock();

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.1);
  const t = clock.getElapsedTime();
  for (const fn of ctx.updaters ?? []) fn(dt, t);
  renderer.render(scene, camera);
  frames += 1;

  if (frames === 1) {
    loading?.remove();
    const stats = emissives.stats();
    if (shotStats) {
      // Surface the A/B state in the HUD and the dataset. A capture taken with
      // a module omitted or a swap layer active must be self-describing, or a
      // comparison frame is indistinguishable from a full build later on.
      const off = skipped.length ? ` · OFF: ${skipped.join(',')}` : '';
      const sw = swaps.length ? ` · SWAP: ${swaps.join(',')}` : '';
      shotStats.textContent = `${built.length}/5 modules · ${stats.total} emissives · ${renderer.info.render.triangles.toLocaleString()} tris${off}${sw}`;
    }
    document.body.dataset.marketModules = built.join(',');
    document.body.dataset.marketSkipped = skipped.join(',');
    document.body.dataset.marketSwaps = swaps.join(',');
    document.body.dataset.marketEmissives = String(stats.total);
  }
  if (frames === SETTLE_FRAMES) {
    document.body.dataset.marketReady = 'true';
    document.body.dataset.marketFrames = String(frames);
  }
}
frame();
