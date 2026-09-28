// ToonLab VFX-arena example — the gameplay-VFX cluster driven the way a game
// would drive it: gameplay events call vfx.spawn(), one system renders all of
// it. A choreography loop exercises every effect by category:
//
//   weapon   — a swinging blade with a slash trail; periodic impact bursts
//   magic    — fireballs lobbed across the arena, detonating on the ground
//   movement — a runner circling the arena shedding footstep dust, with a
//              landing ring each lap
//
// Automation gates (headless verification): body dataset gets vfxArenaReady,
// vfxLiveGlow / vfxLivePuff / vfxDrawCalls / vfxSpawns, refreshed each frame.
// ?seed=N reseeds the system; same seed → same choreography.

import * as THREE from 'three';
import { WebGPURenderer } from 'three/webgpu';

import { createVfxSystem } from '@call-me-sensei/toonlab/vfxgen';

const params = new URLSearchParams(window.location.search);
const SEED = Number(params.get('seed')) || 20260715;
if (params.get('hud') === '0') document.getElementById('hint')?.remove();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x121722);

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 200);
camera.position.set(0, 4.2, 11);
camera.lookAt(0, 1.1, 0);

// Arena floor: two flat toon tones so dust reads against the ground.
const floor = new THREE.Mesh(
  new THREE.CircleGeometry(11, 48),
  new THREE.MeshBasicMaterial({ color: 0x2a3242 }),
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);
const inner = new THREE.Mesh(
  new THREE.CircleGeometry(6.5, 48),
  new THREE.MeshBasicMaterial({ color: 0x333d51 }),
);
inner.rotation.x = -Math.PI / 2;
inner.position.y = 0.005;
scene.add(inner);

// Stand-ins for gameplay actors (deliberately crude — the VFX is the show).
const dummy = new THREE.Mesh(
  new THREE.CapsuleGeometry(0.32, 1.0, 4, 12),
  new THREE.MeshBasicMaterial({ color: 0x4a5670 }),
);
dummy.position.set(-2.4, 0.85, 0);
scene.add(dummy);

const swordPivot = new THREE.Object3D();
swordPivot.position.set(2.2, 1.15, 0);
scene.add(swordPivot);
const blade = new THREE.Mesh(
  new THREE.BoxGeometry(0.05, 1.25, 0.12),
  new THREE.MeshBasicMaterial({ color: 0xb9c4d8 }),
);
blade.position.y = 0.65;
swordPivot.add(blade);

const runner = new THREE.Mesh(
  new THREE.SphereGeometry(0.2, 12, 8),
  new THREE.MeshBasicMaterial({ color: 0x5a6a8a }),
);
scene.add(runner);

// --- the VFX system ----------------------------------------------------------
const vfx = createVfxSystem({
  heightAt: () => 0,
  style: 'call_me_sensei',
  seed: SEED,
});
scene.add(vfx.root);

let trail = null;
let clockTime = 0;
let lastLap = -1;
let lastStep = -1;
let lastSwing = -1;
let lastImpact = -1;
let lastBolt = -1;

function choreography(t) {
  // Weapon: a 1.1 s figure-eight swing every 2 s; trail starts and stops
  // with the swing like an attack animation would drive it.
  const swingId = Math.floor(t / 2);
  const swingT = (t % 2) / 1.1;
  if (swingT <= 1) {
    swordPivot.rotation.z = Math.sin(swingT * Math.PI * 2) * 1.5;
    swordPivot.rotation.y = Math.sin(swingT * Math.PI) * 2.4;
    if (swingId !== lastSwing) {
      lastSwing = swingId;
      trail?.stop();
      trail = vfx.spawn('slash', { base: [0, 0.55, 0], follow: swordPivot, tip: [0, 1.3, 0] });
    }
  } else if (trail?.active) {
    trail.stop();
  }

  // Weapon: an impact on the dummy toward the end of each swing.
  const impactId = Math.floor((t - 0.9) / 2);
  if (impactId >= 0 && impactId !== lastImpact) {
    lastImpact = impactId;
    vfx.spawn('impact', {
      at: [dummy.position.x + 0.35, 1.15, dummy.position.z],
      normal: [1, 0.35, 0],
      power: 0.55 + (impactId % 3) * 0.45,
    });
  }

  // Magic: a fireball lobbed across the arena every 2.8 s.
  const boltId = Math.floor(t / 2.8);
  if (boltId !== lastBolt) {
    lastBolt = boltId;
    const side = boltId % 2 === 0 ? 1 : -1;
    vfx.spawn('fireball', {
      from: [4.5 * side, 1.6, -3.5],
      gravity: 4.5,
      velocity: [-4.2 * side, 3.2, 2.6],
    });
  }

  // Movement: the runner circles the arena — a footstep every 0.22 s of arc,
  // a landing ring as it crosses the lap line.
  const lapT = t * 0.55;
  runner.position.set(Math.cos(lapT) * 4.6, 0.2, Math.sin(lapT) * 4.6);
  const stepId = Math.floor(t / 0.22);
  if (stepId !== lastStep) {
    lastStep = stepId;
    vfx.spawn('footstep', {
      at: [runner.position.x, 0, runner.position.z],
      dir: [-Math.sin(lapT), 0, Math.cos(lapT)],
    });
  }
  const lapId = Math.floor(lapT / (Math.PI * 2));
  if (lapId !== lastLap) {
    lastLap = lapId;
    vfx.spawn('landing', { at: [runner.position.x, 0, runner.position.z], power: 1.5 });
  }
}

// Click to lob a fireball toward the pointer's arena position.
addEventListener('pointerdown', (event) => {
  const ndc = new THREE.Vector2(
    (event.clientX / innerWidth) * 2 - 1,
    -(event.clientY / innerHeight) * 2 + 1,
  );
  const ray = new THREE.Raycaster();
  ray.setFromCamera(ndc, camera);
  const target = new THREE.Vector3();
  ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), target);
  if (!target) return;
  vfx.spawn('fireball', {
    from: [camera.position.x, 1.8, camera.position.z - 2],
    velocity: [
      (target.x - camera.position.x) * 0.9,
      3.4,
      (target.z - camera.position.z + 2) * 0.9,
    ],
    gravity: 6,
  });
});

// --- renderer + loop ----------------------------------------------------------
const renderer = new WebGPURenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
(window.__toonlabHostMount ?? document.body).appendChild(renderer.domElement);
document.body.dataset.vfxArenaReady = 'false';
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const clock = new THREE.Clock();
await renderer.init();

renderer.setAnimationLoop(() => {
  const delta = Math.min(clock.getDelta(), 0.1);
  clockTime += delta;
  choreography(clockTime);
  vfx.update(delta, camera);
  renderer.render(scene, camera);

  const stats = vfx.stats;
  document.body.dataset.vfxArenaReady = 'true';
  document.body.dataset.vfxLiveGlow = String(stats.live.glow);
  document.body.dataset.vfxLivePuff = String(stats.live.puff);
  document.body.dataset.vfxDrawCalls = String(stats.drawCalls);
  document.body.dataset.vfxSpawns = String(stats.spawnsTotal);
});
