// Fauna verification — no browser needed. Mirrors verify-pathgen.mjs:
// determinism (same seed → identical initial distributions, variants, and
// geometry), the fish depth invariant, butterfly mask compliance, the
// staggered tick budget, and the CPU budget. Run with:
//   node scripts/verify-fauna.mjs

import process from 'node:process';

import { createFaunaSimulation } from '../src/fauna/boids.js';
import { buildFaunaGeometry } from '../src/fauna/faunaBodies.js';
import {
  createFaunaRecipeDocument,
  createFaunaSettings,
  validateFaunaRecipeDocument,
} from '../src/fauna/faunaSettings.js';
import { createFauna } from '../src/fauna/stylizedFauna.js';

let failures = 0;
function check(label, condition, detail = '') {
  if (condition) {
    console.log(`ok   ${label}`);
  } else {
    failures += 1;
    console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

// Deterministic synthetic terrain: the same sine hills the demo uses, with a
// lake basin dipping to -12 m around (-141, 0).
const WATER_LEVEL = 0;
const heightAt = (x, z) => 12 * Math.sin(x / 90) * Math.cos(z / 90);

const FLOWER_DISCS = [
  { x: 60, z: 40, r: 30 },
  { x: 20, z: -60, r: 26 },
];
const flowerMask = (x, z) =>
  FLOWER_DISCS.some((d) => (x - d.x) ** 2 + (z - d.z) ** 2 < d.r * d.r);

const SPECIES = { birds: 40, butterflies: 60, dragonflies: 0, fish: 80 }; // 180 agents
const FOLLOW = { x: 0, y: 2, z: 0 };

function buildSim(seed, species = SPECIES) {
  return createFaunaSimulation({
    bounds: 200,
    heightAt,
    masks: { flowers: flowerMask },
    seed,
    species,
    waterLevel: WATER_LEVEL,
  });
}

function snapshotHash(sim) {
  let hash = 0x811c9dc5;
  const feed = (value) => {
    const quantized = Math.round(value * 1000);
    hash ^= quantized & 0xff;
    hash = Math.imul(hash, 0x01000193);
    hash ^= (quantized >> 8) & 0xff;
    hash = Math.imul(hash, 0x01000193);
  };
  for (const name of ['birds', 'butterflies', 'dragonflies', 'fish']) {
    const state = sim.species[name];
    const a = state.arrays;
    for (let i = 0; i < state.count; i += 1) {
      feed(a.px[i]); feed(a.py[i]); feed(a.pz[i]);
      feed(a.vx[i]); feed(a.vy[i]); feed(a.vz[i]);
      feed(a.variant[i]); feed(a.scale[i]);
    }
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

// --- determinism -------------------------------------------------------------
{
  const a = buildSim(42);
  const b = buildSim(42);
  const c = buildSim(43);
  check('same seed → identical initial distributions + variants',
    snapshotHash(a) === snapshotHash(b));
  check('different seed → different distributions',
    snapshotHash(a) !== snapshotHash(c));
  for (let k = 0; k < 500; k += 1) { a.update(0.016, FOLLOW); b.update(0.016, FOLLOW); }
  check('same seed → identical state after 500 updates',
    snapshotHash(a) === snapshotHash(b));

  const geometryHash = (seed) => {
    let hash = 0x811c9dc5;
    for (const species of ['birds', 'butterflies', 'dragonflies', 'fish']) {
      const geometry = buildFaunaGeometry(species, { seed, variant: 1 });
      for (const key of ['position', 'color', 'aWing', 'aTail']) {
        const array = geometry.getAttribute(key).array;
        for (let i = 0; i < array.length; i += 1) {
          hash = (Math.imul(hash, 31) + Math.round(array[i] * 10000)) | 0;
        }
      }
    }
    return hash;
  };
  check('same seed → identical body geometry', geometryHash(7) === geometryHash(7));
  check('different seed → different body geometry', geometryHash(7) !== geometryHash(8));
}

// --- full createFauna (node materials constructed, never rendered) -----------
{
  const fauna = createFauna({
    bounds: 200,
    heightAt,
    masks: { flowers: flowerMask },
    seed: 42,
    species: SPECIES,
    waterLevel: WATER_LEVEL,
  });
  fauna.update(0.016);
  const stats = fauna.stats;
  check('createFauna builds one InstancedMesh per species-variant',
    stats.drawCalls >= 8 && stats.drawCalls <= 12, `drawCalls=${stats.drawCalls}`);
  check('birds cast no shadows',
    fauna.root.children.every((mesh) => mesh.castShadow === false));
  const fish = fauna.root.children.filter((mesh) => mesh.name.includes('Fish'));
  const airborne = fauna.root.children.filter((mesh) => !mesh.name.includes('Fish'));
  check('fish keep the refraction pass (reflection-only exclusion)',
    fish.every((mesh) => mesh.userData.waterReflectionExclude === true
      && mesh.userData.waterExclude === undefined
      && mesh.userData.waterGrabExclude === undefined));
  check('airborne species skip the grab pass, keep the reflection',
    airborne.every((mesh) => mesh.userData.waterGrabExclude === true
      && mesh.userData.waterExclude === undefined));
  check('total triangles stay ambient-light (≤ 30k at defaults)',
    stats.triangles <= 30000, `triangles=${stats.triangles}`);
  fauna.dispose();
}

// --- fish depth invariant over 2000 ticks ------------------------------------
{
  const sim = buildSim(42);
  let worstAbove = -Infinity; // py - (waterLevel - 0.1): must stay ≤ 0
  let worstBelow = Infinity;  // py - (bed + 0.05): must stay ≥ 0
  for (let k = 0; k < 2000; k += 1) {
    sim.update(0.016, FOLLOW);
    const state = sim.species.fish;
    const a = state.arrays;
    for (let i = 0; i < state.count; i += 1) {
      worstAbove = Math.max(worstAbove, a.py[i] - (WATER_LEVEL - 0.1));
      worstBelow = Math.min(worstBelow, a.py[i] - (heightAt(a.px[i], a.pz[i]) + 0.05));
    }
  }
  check('fish never above waterLevel - 0.1 over 2000 ticks', worstAbove <= 0,
    `worst=${worstAbove.toFixed(3)}`);
  check('fish never below bed + 0.05 over 2000 ticks', worstBelow >= 0,
    `worst=${worstBelow.toFixed(3)}`);
}

// --- butterflies stay over the flower mask ------------------------------------
{
  const sim = buildSim(42);
  const TOLERANCE = 15; // meters beyond a disc edge (wander band + anchor hops)
  let worst = 0;
  for (let k = 0; k < 2000; k += 1) {
    sim.update(0.016, FOLLOW);
    if (k % 25 !== 0) continue;
    const state = sim.species.butterflies;
    const a = state.arrays;
    for (let i = 0; i < state.count; i += 1) {
      const excess = Math.min(...FLOWER_DISCS.map(
        (d) => Math.hypot(a.px[i] - d.x, a.pz[i] - d.z) - d.r,
      ));
      worst = Math.max(worst, excess);
    }
  }
  check(`butterflies stay within flower mask bounds (+${TOLERANCE} m)`,
    worst <= TOLERANCE, `worst=${worst.toFixed(2)} m`);
}

// --- staggered tick budget -----------------------------------------------------
{
  const sim = buildSim(42);
  const total = sim.stats.total;
  const budget = Math.max(1, Math.ceil(total / 4));
  let worst = 0;
  for (let k = 0; k < 200; k += 1) {
    sim.update(0.016, FOLLOW);
    worst = Math.max(worst, sim.stats.steeredLastUpdate);
  }
  check('≤ 1/4 of agents steered per update', worst <= budget,
    `worst=${worst} budget=${budget} total=${total}`);
}

// --- CPU budget ------------------------------------------------------------------
{
  const sim = buildSim(42);
  for (let k = 0; k < 300; k += 1) sim.update(0.016, FOLLOW); // warmup/JIT
  const started = performance.now();
  const RUNS = 2000;
  for (let k = 0; k < RUNS; k += 1) sim.update(0.016, FOLLOW);
  const mean = (performance.now() - started) / RUNS;
  check('180 agents: mean update(0.016) ≤ 1.0 ms', mean <= 1.0, `${mean.toFixed(4)} ms`);
  console.log(`     (measured ${mean.toFixed(4)} ms/update)`);
}

// --- population scaling linearity (smoke) ---------------------------------------
{
  const time = (species) => {
    const sim = buildSim(42, species);
    for (let k = 0; k < 200; k += 1) sim.update(0.016, FOLLOW);
    const started = performance.now();
    for (let k = 0; k < 1500; k += 1) sim.update(0.016, FOLLOW);
    return (performance.now() - started) / 1500;
  };
  const zero = time({ birds: 0, butterflies: 0, dragonflies: 0, fish: 0 });
  const one = time(SPECIES);
  const three = time({ birds: 120, butterflies: 180, dragonflies: 0, fish: 240 });
  check('populations off → near-zero cost', zero < Math.max(one * 0.5, 0.02),
    `zero=${zero.toFixed(4)} ms`);
  // Linear-ish: 3× the agents should cost well under 6× (no cliffs), and the
  // 3× run must still clear the same per-frame envelope.
  check('3× population scales linearly (no cliffs)',
    three < one * 6 && three <= 1.0,
    `1x=${one.toFixed(4)} ms 3x=${three.toFixed(4)} ms`);
}

// --- settings + recipe -------------------------------------------------------------
{
  const settings = createFaunaSettings({ birds: { maxSpeed: 999, palette: 'nope' } });
  check('settings clamp to schema ranges', settings.birds.maxSpeed === 30
    && settings.birds.palette === 'swallow');
  const recipe = createFaunaRecipeDocument({ seed: 9, species: { fish: 5000 } });
  const validation = validateFaunaRecipeDocument(recipe);
  check('recipe round-trip validates and caps populations',
    validation.ok && recipe.species.fish === 320,
    JSON.stringify(validation.errors));
}

console.log(failures === 0 ? '\nverify-fauna: all checks passed' : `\nverify-fauna: ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
