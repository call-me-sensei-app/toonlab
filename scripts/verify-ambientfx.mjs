// Ambient-fx verification — no browser needed. Mirrors verify-pathgen.mjs:
// determinism (same seed → identical emission), budgets (≤ 20k at defaults,
// density 0 → 0, 3× → ~3× linear), window containment + re-centering, time
// gates (fireflies off at noon, on at 21:00; pollen the inverse), and wind
// response (heading change rotates the drift vector).
// Run with: node scripts/verify-ambientfx.mjs

import process from 'node:process';

import * as THREE from 'three';

import {
  CUTOUT_NEAR_FADE_METERS,
  createAmbientFx,
  FADE_END_FRACTION,
  RECENTER_FRACTION,
  timeGateWeight,
} from '../src/ambientfx/index.js';

let failures = 0;
function check(label, condition, detail = '') {
  if (condition) {
    console.log(`ok   ${label}`);
  } else {
    failures += 1;
    console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

// Deterministic synthetic terrain with a wet basin so the water-margin and
// dry-land emitters both have work to do.
const WATER_LEVEL = -0.4;
const heightAt = (x, z) =>
  3.2 * Math.sin(x / 34) * Math.cos(z / 27) - 4 * Math.exp(-((x - 18) ** 2 + z ** 2) / 900);

const camera = new THREE.PerspectiveCamera();
camera.position.set(0, 4, 0);
camera.updateMatrixWorld();

function build(options = {}) {
  const fx = createAmbientFx({
    heightAt,
    seed: 42,
    timeOfDay: 12,
    waterLevel: WATER_LEVEL,
    ...options,
  });
  fx.update(0.016, camera);
  return fx;
}

function spawnHash(fx) {
  let hash = 0x811c9dc5;
  const feed = (value) => {
    const quantized = Math.round(value * 1000); // mm quantization, like pathgen
    for (const shift of [0, 8, 16]) {
      hash ^= (quantized >> shift) & 0xff;
      hash = Math.imul(hash, 0x01000193);
    }
  };
  for (const mesh of [...fx.root.children].sort((a, b) => a.name.localeCompare(b.name))) {
    const spawn = mesh.geometry.attributes.iSpawn;
    const data = mesh.geometry.attributes.iData;
    const count = mesh.geometry.instanceCount;
    for (let i = 0; i < count * 3; i += 1) feed(spawn.array[i]);
    for (let i = 0; i < count * 4; i += 1) feed(data.array[i]);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function forEachSpawn(fx, fn) {
  for (const mesh of fx.root.children) {
    const spawn = mesh.geometry.attributes.iSpawn;
    for (let i = 0; i < mesh.geometry.instanceCount; i += 1) {
      fn(spawn.array[i * 3], spawn.array[i * 3 + 1], spawn.array[i * 3 + 2]);
    }
  }
}

// --- determinism -------------------------------------------------------------
const a = build();
const b = build();
const c = build({ seed: 43 });
const hashA = spawnHash(a);
check('same seed → identical emission pattern', hashA === spawnHash(b), hashA);
check('different seed → different emission pattern', hashA !== spawnHash(c));

// Bloom volumes reroute petals to canopies, deterministically.
const sources = [{ color: [1, 0.7, 0.8], radius: 2.6, x: 4, y: 6, z: -3 }];
const withBloomA = build().addBloomSources(sources);
const withBloomB = build().addBloomSources(sources);
check('bloom sources emit deterministically', spawnHash(withBloomA) === spawnHash(withBloomB));
check('bloom sources change the petal binding', spawnHash(withBloomA) !== hashA);
check('canopy binding emits petals', withBloomA.stats.byEffect.petals > 20,
  `petals=${withBloomA.stats.byEffect.petals}`);

// --- budgets -----------------------------------------------------------------
check('defaults within the 20k live-particle budget', a.stats.liveParticles <= 20000,
  `live=${a.stats.liveParticles}`);
check('draw calls ≤ 3 for all five effects', a.stats.drawCalls <= 3,
  `draws=${a.stats.drawCalls}`);

const zero = build({
  effects: { fireflies: { density: 0 }, leaves: { density: 0 }, mist: { density: 0 }, petals: { density: 0 }, pollen: { density: 0 } },
});
check('density 0 → 0 particles', zero.stats.liveParticles === 0,
  `live=${zero.stats.liveParticles}`);

const triple = build({
  effects: { fireflies: { densityScale: 3 }, leaves: { densityScale: 3 }, mist: { densityScale: 3 }, petals: { densityScale: 3 }, pollen: { densityScale: 3 } },
});
const ratio = triple.stats.liveParticles / a.stats.liveParticles;
check('density 3× → ~3× particles (linear cost)', ratio > 2.6 && ratio < 3.4,
  `ratio=${ratio.toFixed(2)} (${a.stats.liveParticles} → ${triple.stats.liveParticles})`);
check('3× everything still within budget', triple.stats.liveParticles <= 20000,
  `live=${triple.stats.liveParticles}`);
check('stats expose unambiguous per-effect density scales',
  Object.values(triple.stats.densityScales).every((scale) => scale === 3));

const constructionProbe = createAmbientFx({
  heightAt,
  seed: 42,
  timeOfDay: 12,
  waterLevel: WATER_LEVEL,
});
check('construction stats begin honestly empty', constructionProbe.stats.liveParticles === 0);
constructionProbe.emitNow(camera);
check('emitNow makes build-time stats and first captures ready without a frame update',
  constructionProbe.stats.liveParticles > 0);
constructionProbe.dispose();

// --- window containment + follow re-centering --------------------------------
let maxDistance = 0;
forEachSpawn(a, (x, _y, z) => {
  maxDistance = Math.max(maxDistance, Math.hypot(x - a.stats.center.x, z - a.stats.center.z));
});
check('all live particles inside the window radius', maxDistance <= a.stats.windowRadius + 1e-6,
  `max=${maxDistance.toFixed(2)} radius=${a.stats.windowRadius}`);
check('fade completes inside the emitted disk (pop-free invariant)',
  FADE_END_FRACTION + RECENTER_FRACTION <= 1,
  `${FADE_END_FRACTION} + ${RECENTER_FRACTION}`);
check('petals and leaves collapse before becoming screen-sized camera blobs',
  CUTOUT_NEAR_FADE_METERS[0] >= 0.35 && CUTOUT_NEAR_FADE_METERS[1] <= 1.5,
  CUTOUT_NEAR_FADE_METERS.join('–'));

const roaming = build({ followTarget: { x: 0, y: 0, z: 0 } });
const before = spawnHash(roaming);
const far = build({ followTarget: { x: 180, y: 0, z: -60 } });
far.update(0.016, camera);
check('window re-centers on the follow target', far.stats.center.x === 180 && far.stats.center.z === -60,
  JSON.stringify(far.stats.center));
let maxAfter = 0;
forEachSpawn(far, (x, _y, z) => {
  maxAfter = Math.max(maxAfter, Math.hypot(x - 180, z + 60));
});
check('containment holds after re-centering', maxAfter <= far.stats.windowRadius + 1e-6,
  `max=${maxAfter.toFixed(2)}`);
check('moving the window changes emission (world-anchored cells)', spawnHash(far) !== before);

// Overlap stability: two windows 10% of a radius apart must agree on the
// particles they share — that is what makes re-emission invisible.
const nearShift = build({ followTarget: { x: 9, y: 0, z: 0 } });
const baseSpawns = new Set();
forEachSpawn(roaming, (x, y, z) => baseSpawns.add(`${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`));
let sharedSeen = 0;
let sharedMatched = 0;
forEachSpawn(nearShift, (x, y, z) => {
  if (Math.hypot(x - 0, z - 0) > roaming.stats.windowRadius - 12) return; // interior only
  sharedSeen += 1;
  if (baseSpawns.has(`${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`)) sharedMatched += 1;
});
check('overlapping region is bit-identical across re-emission',
  sharedSeen > 100 && sharedMatched === sharedSeen,
  `${sharedMatched}/${sharedSeen}`);

// --- time gates ---------------------------------------------------------------
check('fireflies gate = 0 at noon', timeGateWeight('duskNight', 12) === 0);
check('fireflies gate > 0 at 21:00', timeGateWeight('duskNight', 21) > 0.99);
check('pollen (day) gate > 0 at noon', timeGateWeight('day', 12) === 1);
check('pollen (day) gate = 0 at 21:00', timeGateWeight('day', 21) === 0);
check('mist gate peaks at dawn', timeGateWeight('dawnDusk', 6) === 1);

const gated = build({ timeOfDay: 12 });
check('fx gate weights track setTimeOfDay', (() => {
  const noon = gated.stats.gateWeights;
  gated.setTimeOfDay(21);
  const night = gated.stats.gateWeights;
  return noon.fireflies === 0 && noon.pollen === 1 && night.fireflies === 1 && night.pollen === 0;
})());

// --- wind response -------------------------------------------------------------
const windy = build();
windy.setWind(0, 1);
const east = windy.stats.wind.direction;
windy.setWind(Math.PI / 2, 1);
const south = windy.stats.wind.direction;
const rotated = Math.abs(east[0] * south[0] + east[1] * south[1]); // dot ≈ 0 → 90°
check('heading change rotates the drift vector', east[0] > 0.99 && south[1] > 0.99 && rotated < 1e-6,
  `east=${east.map((v) => v.toFixed(2))} south=${south.map((v) => v.toFixed(2))}`);
windy.setWind({ windDirection: [-1, 0], windSpeed: 2, windStrength: 0.3 });
check('grass-shaped wind settings apply', windy.stats.wind.direction[0] === -1
  && windy.stats.wind.speed === 2 && Math.abs(windy.stats.wind.strength - 0.3) < 1e-9);

// --- water-pass flags -----------------------------------------------------------
const mistMesh = a.root.children.find((m) => m.name === 'AmbientFxSoft');
const glowMesh = a.root.children.find((m) => m.name === 'AmbientFxGlow');
check('mist excluded from water passes', mistMesh?.userData.waterExclude === true);
check('fireflies stay in water passes (they reflect)', !glowMesh?.userData.waterExclude);

console.log(failures === 0 ? '\nverify-ambientfx: all checks passed' : `\nverify-ambientfx: ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
