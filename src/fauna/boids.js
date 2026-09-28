// Steering core for the fauna layer — classic boids with cheap XZ spatial
// hashing, staggered ticks, and hard budgets. Pure JS with no THREE
// dependency so scripts/verify-fauna.mjs can run the whole simulation in
// Node and assert the invariants (fish depth clamps, mask compliance, tick
// budgets, determinism).
//
// The split of work is the whole performance story:
//  - a full steering TICK (neighbor search, forces, rand-gated decisions,
//    heightAt cache refresh) touches at most `tickShare` (default 1/4) of
//    all agents per update, walked round-robin;
//  - INTEGRATION (pos += v·dt, clamps, heading smoothing) runs for every
//    agent every frame — a few flops each, so motion stays 60 Hz smooth
//    while steering runs at ~15 Hz;
//  - agents farther than `farDistance` from the follow target skip steering
//    entirely and fly scripted circles (their tick only refreshes terrain
//    caches), so a distant flock costs integration alone.
//
// Determinism: one mulberry32 stream per agent (seeded from the world seed),
// advanced only inside that agent's own ticks; the walk order is fixed; no
// Math.random anywhere. Same seed + same update(dt) sequence → the same sky.

import {
  createFaunaSettings,
  FAUNA_SPECIES,
  normalizeFaunaPopulations,
} from './faunaSettings.js';

export const FAUNA_STATE = Object.freeze({
  FLY: 0,       // also HOVER for dragonflies
  APPROACH: 1,  // bird gliding to a claimed perch
  PERCHED: 2,
  DART: 3,      // dragonfly relocating
});

function mulberry32(seed) {
  let state = (Math.trunc(seed) || 1) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashCombine(a, b) {
  let h = (Math.imul(Math.trunc(a) | 0, 0x9e3779b1) ^ Math.imul(Math.trunc(b) | 0, 0x85ebca77)) | 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

// Per-agent rng: mulberry32 with the state array as backing store.
function nextRand(states, i) {
  const s = (states[i] + 0x6d2b79f5) >>> 0;
  states[i] = s;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function sampleHeight(heightAt, x, z) {
  if (typeof heightAt !== 'function') return 0;
  const y = Number(heightAt(x, z));
  return Number.isFinite(y) ? y : 0;
}

function normalizeBounds(bounds) {
  if (typeof bounds === 'number' && Number.isFinite(bounds)) {
    const half = Math.max(Math.abs(bounds), 10);
    return { minX: -half, maxX: half, minZ: -half, maxZ: half };
  }
  const source = bounds && typeof bounds === 'object' ? bounds : {};
  if (source.min && source.max) {
    return {
      minX: Number(source.min.x) || -200, maxX: Number(source.max.x) || 200,
      minZ: Number(source.min.z) || -200, maxZ: Number(source.max.z) || 200,
    };
  }
  const hx = Math.max(Math.abs(Number(source.x) || 200), 10);
  const hz = Math.max(Math.abs(Number(source.z) || Number(source.x) || 200), 10);
  return { minX: -hx, maxX: hx, minZ: -hz, maxZ: hz };
}

function makeArrays(count) {
  return {
    px: new Float32Array(count), py: new Float32Array(count), pz: new Float32Array(count),
    vx: new Float32Array(count), vy: new Float32Array(count), vz: new Float32Array(count),
    heading: new Float32Array(count), bank: new Float32Array(count),
    phase: new Float32Array(count), speedMul: new Float32Array(count), scale: new Float32Array(count),
    variant: new Uint8Array(count), state: new Uint8Array(count), far: new Uint8Array(count),
    amp: new Float32Array(count), ampTarget: new Float32Array(count),
    fold: new Float32Array(count), foldTarget: new Float32Array(count),
    timer: new Float32Array(count), cooldown: new Float32Array(count),
    groundY: new Float32Array(count),         // terrain cache (bed for fish)
    homeX: new Float32Array(count), homeY: new Float32Array(count), homeZ: new Float32Array(count),
    target: new Int32Array(count).fill(-1),   // perch index for birds
    turn: new Float32Array(count),            // scripted-loop yaw rate (rad/s)
    lastTick: new Float32Array(count),
    hoverBias: new Float32Array(count),       // per-agent band position 0..1
    wf: new Float32Array(count * 4),          // wander sinusoid freqs/phases
    rng: new Uint32Array(count),
  };
}

// Rejection-samples `count` points passing `accept(x, z)`; degrades to fewer
// points instead of hanging when the mask is starved.
function samplePool(rng, bounds, count, accept) {
  const pool = [];
  const spanX = bounds.maxX - bounds.minX;
  const spanZ = bounds.maxZ - bounds.minZ;
  let attempts = Math.max(count, 1) * 60;
  while (pool.length < count && attempts > 0) {
    attempts -= 1;
    const x = bounds.minX + rng() * spanX;
    const z = bounds.minZ + rng() * spanZ;
    if (accept(x, z)) pool.push({ x, z });
  }
  return pool;
}

/**
 * Creates the CPU fauna simulation. All coordinates are world meters.
 *
 * @param {Object} options
 * @param {number} [options.seed]
 * @param {Function} [options.heightAt] `(x, z) => y` terrain sampler.
 * @param {number} [options.waterLevel]
 * @param {number|{x,z}|{min,max}} [options.bounds] Roaming rectangle.
 * @param {Object} [options.species] Populations `{ birds, butterflies, dragonflies, fish }`.
 * @param {Object} [options.masks] `{ flowers?: (x, z) => boolean }` butterfly anchor mask.
 * @param {Object} [options.settings] Grouped overrides (see createFaunaSettings).
 * @param {Array} [options.perchPoints] Initial `{ x, y, z }` roosts.
 * @param {Object} [options.variantCounts] Geometry variants per species (the
 *   renderer passes the palette's real scheme count; variant assignment
 *   happens here so it is deterministic and Node-testable).
 */
export function createFaunaSimulation({
  seed = 1,
  heightAt = null,
  waterLevel = 0,
  bounds = 240,
  species = {},
  masks = {},
  settings = {},
  perchPoints = [],
  variantCounts: variantCountsOption = {},
} = {}) {
  const cfg = createFaunaSettings(settings);
  const populations = normalizeFaunaPopulations(species);
  const box = normalizeBounds(bounds);
  const rootRng = mulberry32(hashCombine(Math.round(Number(seed) || 1), 0xfa07a));
  const ground = (x, z) => sampleHeight(heightAt, x, z);
  const flowerMask = typeof masks?.flowers === 'function' ? masks.flowers : null;

  // --- shared pools ---------------------------------------------------------

  // Terrain roosts used when no host cluster has registered perch points yet.
  const perches = [];
  const addPerchPoints = (points) => {
    for (const p of points ?? []) {
      if (!Number.isFinite(p?.x) || !Number.isFinite(p?.z)) continue;
      perches.push({
        occupant: -1,
        x: Number(p.x),
        y: Number.isFinite(p.y) ? Number(p.y) : ground(p.x, p.z),
        z: Number(p.z),
      });
    }
  };
  if (Array.isArray(perchPoints) && perchPoints.length > 0) addPerchPoints(perchPoints);
  if (perches.length === 0 && populations.birds > 0) {
    addPerchPoints(samplePool(rootRng, box, 24, (x, z) => ground(x, z) > waterLevel + 0.5)
      .map((p) => ({ x: p.x, y: ground(p.x, p.z) + 0.15, z: p.z })));
  }

  // Butterfly anchors come FROM the mask, so wandering around an anchor
  // (radius-capped) keeps agents over the flower field by construction.
  // Fewer anchors than agents on purpose: shared anchors read as the flower
  // clumps butterflies gather on, instead of a uniform sprinkle.
  const dryLand = (x, z) => ground(x, z) > waterLevel + 0.2;
  const flowerPool = populations.butterflies > 0
    ? samplePool(rootRng, box, Math.max(8, Math.ceil(populations.butterflies / 5)),
      flowerMask ? (x, z) => flowerMask(x, z) && dryLand(x, z) : dryLand)
    : [];

  // Dragonfly anchors hover the shallow-water margin (bed just below the
  // waterline). Falls back to any water, then to the butterfly pool.
  const shoreWater = (x, z) => {
    const bed = ground(x, z);
    return bed < waterLevel - 0.15 && bed > waterLevel - 3.5;
  };
  let dragonPool = populations.dragonflies > 0
    ? samplePool(rootRng, box, Math.max(6, Math.ceil(populations.dragonflies / 2)), shoreWater)
    : [];
  if (populations.dragonflies > 0 && dragonPool.length === 0) {
    dragonPool = samplePool(rootRng, box, Math.max(12, populations.dragonflies),
      (x, z) => ground(x, z) < waterLevel - 0.15);
  }
  if (populations.dragonflies > 0 && dragonPool.length === 0) dragonPool = flowerPool;

  // --- species construction -------------------------------------------------

  const speciesStates = {};

  function initCommon(state, i, x, y, z, s, headingAngle, speed) {
    const a = state.arrays;
    a.px[i] = x; a.py[i] = y; a.pz[i] = z;
    a.vx[i] = Math.sin(headingAngle) * speed;
    a.vy[i] = 0;
    a.vz[i] = Math.cos(headingAngle) * speed;
    a.heading[i] = headingAngle;
    a.rng[i] = hashCombine(hashCombine(seed, state.speciesIndex * 0x51ed), i + 1);
    const r = () => nextRand(a.rng, i);
    a.variant[i] = Math.floor(r() * state.variantCount) % state.variantCount;
    a.phase[i] = r() * Math.PI * 2;
    a.speedMul[i] = 0.85 + r() * 0.3;
    a.scale[i] = s * (1 - state.scaleJitter / 2 + r() * state.scaleJitter);
    a.amp[i] = 1; a.ampTarget[i] = 1;
    a.turn[i] = (r() < 0.5 ? -1 : 1) * (0.25 + r() * 0.3);
    a.hoverBias[i] = r();
    a.wf[i * 4] = 0.25 + r() * 0.5;
    a.wf[i * 4 + 1] = r() * Math.PI * 2;
    a.wf[i * 4 + 2] = 0.3 + r() * 0.55;
    a.wf[i * 4 + 3] = r() * Math.PI * 2;
    a.groundY[i] = ground(x, z);
    a.lastTick[i] = -r() * 0.25; // desync first ticks
  }

  function makeSpecies(name, index, count, variantCount, scaleJitter, cellSize) {
    const state = {
      arrays: makeArrays(count),
      cell: Math.max(cellSize, 1),
      count,
      grid: new Map(),
      gridStamp: -1,
      name,
      scaleJitter,
      speciesIndex: index,
      variantCount: Math.max(1, variantCount),
    };
    speciesStates[name] = state;
    return state;
  }

  const variantCounts = {
    birds: 3, butterflies: 4, dragonflies: 3, fish: 4,
    ...(variantCountsOption && typeof variantCountsOption === 'object' ? variantCountsOption : {}),
  };

  // Birds spawn in a few flock clusters so the first frame already reads as
  // flocks, not confetti.
  {
    const s = makeSpecies('birds', 0, populations.birds, variantCounts.birds, 0.24, cfg.birds.neighborRadius);
    const clusters = samplePool(rootRng, box, Math.max(1, Math.ceil(s.count / 16)), () => true);
    for (let i = 0; i < s.count; i += 1) {
      const c = clusters[i % Math.max(clusters.length, 1)] ?? { x: 0, z: 0 };
      const x = c.x + (rootRng() - 0.5) * 24;
      const z = c.z + (rootRng() - 0.5) * 24;
      const g = ground(x, z);
      const y = g + cfg.birds.altitudeMin
        + rootRng() * Math.max(cfg.birds.altitudeMax - cfg.birds.altitudeMin, 1);
      initCommon(s, i, x, y, z, cfg.birds.scale, rootRng() * Math.PI * 2, cfg.birds.cruiseSpeed);
      s.arrays.timer[i] = 2 + rootRng() * 6; // perch-decision cooldown
    }
  }

  {
    const s = makeSpecies('butterflies', 1, populations.butterflies, variantCounts.butterflies, 0.4, 4);
    for (let i = 0; i < s.count; i += 1) {
      const anchor = flowerPool.length > 0 ? flowerPool[i % flowerPool.length] : { x: 0, z: 0 };
      const x = anchor.x + (rootRng() - 0.5) * 3;
      const z = anchor.z + (rootRng() - 0.5) * 3;
      const g = ground(x, z);
      const y = g + cfg.butterflies.hoverMin
        + rootRng() * Math.max(cfg.butterflies.hoverMax - cfg.butterflies.hoverMin, 0.1);
      initCommon(s, i, x, y, z, cfg.butterflies.scale, rootRng() * Math.PI * 2, cfg.butterflies.speed * 0.6);
      s.arrays.homeX[i] = anchor.x;
      s.arrays.homeZ[i] = anchor.z;
    }
  }

  {
    const s = makeSpecies('dragonflies', 2, populations.dragonflies, variantCounts.dragonflies, 0.3, 5);
    for (let i = 0; i < s.count; i += 1) {
      const anchor = dragonPool.length > 0 ? dragonPool[i % dragonPool.length] : { x: 0, z: 0 };
      const x = anchor.x + (rootRng() - 0.5) * 2;
      const z = anchor.z + (rootRng() - 0.5) * 2;
      initCommon(s, i, x, waterLevel + cfg.dragonflies.hoverHeight, z,
        cfg.dragonflies.scale, rootRng() * Math.PI * 2, 0.4);
      s.arrays.homeX[i] = anchor.x;
      s.arrays.homeZ[i] = anchor.z;
    }
  }

  // Fish spawn in schools at points with enough water column; a world with
  // no qualifying water simply holds zero fish (population budget, not error).
  {
    const deepEnough = (x, z) => waterLevel - ground(x, z) >= cfg.fish.minSpawnDepth;
    const schools = populations.fish > 0
      ? samplePool(rootRng, box, Math.max(1, Math.ceil(populations.fish / 14)), deepEnough)
      : [];
    const count = schools.length > 0 ? populations.fish : 0;
    const s = makeSpecies('fish', 3, count, variantCounts.fish, 0.5, cfg.fish.neighborRadius);
    for (let i = 0; i < s.count; i += 1) {
      const c = schools[i % schools.length];
      let x = c.x;
      let z = c.z;
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const cx = c.x + (rootRng() - 0.5) * 8;
        const cz = c.z + (rootRng() - 0.5) * 8;
        if (deepEnough(cx, cz)) { x = cx; z = cz; break; }
      }
      const bed = ground(x, z);
      const lo = bed + cfg.fish.bedMargin;
      const hi = waterLevel - cfg.fish.surfaceMargin;
      const y = Math.max(hi - (0.4 + rootRng() * 1.6), lo + 0.2);
      initCommon(s, i, x, y, z, cfg.fish.scale, rootRng() * Math.PI * 2, cfg.fish.cruiseSpeed);
      s.arrays.py[i] = Math.min(Math.max(y, lo), Math.max(hi, lo));
    }
  }

  // Fixed walk order for the staggered tick budget.
  const walk = [];
  for (const name of FAUNA_SPECIES) {
    const s = speciesStates[name];
    for (let i = 0; i < s.count; i += 1) walk.push({ i, s });
  }

  const stats = {
    agents: Object.fromEntries(FAUNA_SPECIES.map((name) => [name, speciesStates[name].count])),
    steeredLastUpdate: 0,
    tickBudget: Math.max(1, Math.ceil(walk.length * cfg.shared.tickShare)),
    total: walk.length,
    updates: 0,
  };

  const sim = {
    addPerchPoints,
    bounds: box,
    perches,
    settings: cfg,
    species: speciesStates,
    stats,
    time: 0,
    waterLevel,
  };

  // --- spatial hash ----------------------------------------------------------

  function rebuildGrid(state, stamp) {
    if (state.gridStamp === stamp) return;
    state.gridStamp = stamp;
    state.grid.clear();
    const { px, pz } = state.arrays;
    const inv = 1 / state.cell;
    for (let i = 0; i < state.count; i += 1) {
      const key = ((Math.floor(px[i] * inv) + 1024) << 12) | ((Math.floor(pz[i] * inv) + 1024) & 0xfff);
      const bucket = state.grid.get(key);
      if (bucket) bucket.push(i);
      else state.grid.set(key, [i]);
    }
  }

  const flock = { ax: 0, ay: 0, az: 0 };
  function accumulateFlock(state, i, radius, sepRadius, wCoh, wAli, wSep) {
    const a = state.arrays;
    const inv = 1 / state.cell;
    const cx = Math.floor(a.px[i] * inv);
    const cz = Math.floor(a.pz[i] * inv);
    const radiusSq = radius * radius;
    const sepSq = sepRadius * sepRadius;
    let n = 0;
    let sumX = 0; let sumY = 0; let sumZ = 0;
    let velX = 0; let velY = 0; let velZ = 0;
    let sepX = 0; let sepY = 0; let sepZ = 0;
    for (let gx = cx - 1; gx <= cx + 1; gx += 1) {
      for (let gz = cz - 1; gz <= cz + 1; gz += 1) {
        const bucket = state.grid.get(((gx + 1024) << 12) | ((gz + 1024) & 0xfff));
        if (!bucket) continue;
        for (let b = 0; b < bucket.length; b += 1) {
          const j = bucket[b];
          if (j === i) continue;
          const dx = a.px[j] - a.px[i];
          const dy = a.py[j] - a.py[i];
          const dz = a.pz[j] - a.pz[i];
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 > radiusSq) continue;
          n += 1;
          sumX += a.px[j]; sumY += a.py[j]; sumZ += a.pz[j];
          velX += a.vx[j]; velY += a.vy[j]; velZ += a.vz[j];
          if (d2 < sepSq && d2 > 1e-6) {
            const w = 1 / d2;
            sepX -= dx * w; sepY -= dy * w; sepZ -= dz * w;
          }
          if (n >= 10) break; // cap: flocking quality saturates fast
        }
        if (n >= 10) break;
      }
      if (n >= 10) break;
    }
    if (n === 0) {
      flock.ax = 0; flock.ay = 0; flock.az = 0;
      return;
    }
    const invN = 1 / n;
    flock.ax = (sumX * invN - a.px[i]) * wCoh + velX * invN * wAli + sepX * wSep;
    flock.ay = (sumY * invN - a.py[i]) * wCoh * 0.5 + velY * invN * wAli * 0.5 + sepY * wSep;
    flock.az = (sumZ * invN - a.pz[i]) * wCoh + velZ * invN * wAli + sepZ * wSep;
  }

  function clampSpeed(a, i, min, max) {
    const speed = Math.hypot(a.vx[i], a.vy[i], a.vz[i]);
    if (speed < 1e-5) return;
    const clamped = Math.min(Math.max(speed, min), max);
    if (clamped !== speed) {
      const k = clamped / speed;
      a.vx[i] *= k; a.vy[i] *= k; a.vz[i] *= k;
    }
  }

  function boundsForce(a, i, dt, strength = 3) {
    const margin = 10;
    if (a.px[i] < box.minX + margin) a.vx[i] += strength * dt * (box.minX + margin - a.px[i]);
    if (a.px[i] > box.maxX - margin) a.vx[i] += strength * dt * (box.maxX - margin - a.px[i]);
    if (a.pz[i] < box.minZ + margin) a.vz[i] += strength * dt * (box.minZ + margin - a.pz[i]);
    if (a.pz[i] > box.maxZ - margin) a.vz[i] += strength * dt * (box.maxZ - margin - a.pz[i]);
  }

  // --- species ticks ---------------------------------------------------------

  function birdTick(state, i, dt, follow, stamp) {
    const a = state.arrays;
    const b = cfg.birds;
    a.groundY[i] = ground(a.px[i], a.pz[i]);
    a.cooldown[i] = Math.max(0, a.cooldown[i] - dt);

    // TRUE 3D flee distance: a camera or player well above the flock is not
    // a threat; a walker at perch height is.
    const fx = follow ? a.px[i] - follow.x : 0;
    const fy = follow ? a.py[i] - (follow.y ?? 0) : 0;
    const fz = follow ? a.pz[i] - follow.z : 0;
    const followD2 = follow ? fx * fx + fy * fy + fz * fz : Infinity;

    if (a.state[i] === FAUNA_STATE.PERCHED) {
      a.timer[i] -= dt;
      if (a.timer[i] <= 0 || followD2 < b.fleeRadius * b.fleeRadius) {
        // Flush: launch up and away, wings out.
        const away = Math.max(Math.sqrt(followD2), 1e-3);
        const dirX = follow && followD2 < b.fleeRadius * b.fleeRadius ? fx / away : Math.sin(a.heading[i]);
        const dirZ = follow && followD2 < b.fleeRadius * b.fleeRadius ? fz / away : Math.cos(a.heading[i]);
        if (a.target[i] >= 0 && perches[a.target[i]]) perches[a.target[i]].occupant = -1;
        a.target[i] = -1;
        a.state[i] = FAUNA_STATE.FLY;
        a.foldTarget[i] = 0;
        a.ampTarget[i] = 1;
        a.vx[i] = dirX * b.cruiseSpeed * 1.2;
        a.vy[i] = b.cruiseSpeed * 0.55;
        a.vz[i] = dirZ * b.cruiseSpeed * 1.2;
        a.cooldown[i] = 6 + nextRand(a.rng, i) * 8;
      }
      return;
    }

    if (a.state[i] === FAUNA_STATE.APPROACH) {
      const perch = perches[a.target[i]];
      if (!perch || perch.occupant !== i) { a.state[i] = FAUNA_STATE.FLY; a.target[i] = -1; return; }
      const dx = perch.x - a.px[i];
      const dy = perch.y - a.py[i];
      const dz = perch.z - a.pz[i];
      const dist = Math.hypot(dx, dy, dz);
      if (dist < 0.6) {
        a.px[i] = perch.x; a.py[i] = perch.y + 0.1; a.pz[i] = perch.z;
        a.vx[i] = 0; a.vy[i] = 0; a.vz[i] = 0;
        a.state[i] = FAUNA_STATE.PERCHED;
        a.foldTarget[i] = 1;
        a.ampTarget[i] = 0;
        a.timer[i] = b.perchDuration * (0.6 + nextRand(a.rng, i) * 0.8);
        return;
      }
      // Arrive: decelerating approach, gliding (low flap amplitude).
      const arrive = Math.min(dist / 6, 1) * b.cruiseSpeed + 1.2;
      const inv = arrive / Math.max(dist, 1e-4);
      a.vx[i] += (dx * inv - a.vx[i]) * Math.min(1, 2.5 * dt);
      a.vy[i] += (dy * inv - a.vy[i]) * Math.min(1, 2.5 * dt);
      a.vz[i] += (dz * inv - a.vz[i]) * Math.min(1, 2.5 * dt);
      a.ampTarget[i] = 0.25;
      a.timer[i] -= dt;
      if (a.timer[i] < -20) { // stuck approach: give up
        if (perch) perch.occupant = -1;
        a.target[i] = -1;
        a.state[i] = FAUNA_STATE.FLY;
      }
      return;
    }

    // FLY. Far agents circle; only their caches refresh (above).
    if (a.far[i]) {
      clampSpeed(a, i, b.cruiseSpeed * 0.9, b.cruiseSpeed * 1.1);
      a.vy[i] *= 0.6;
      a.ampTarget[i] = 0.7;
      return;
    }

    rebuildGrid(state, stamp);
    accumulateFlock(state, i, b.neighborRadius, b.separationRadius,
      b.cohesion * 0.4, b.alignment * 0.55, b.separation * 1.6);
    a.vx[i] += flock.ax * dt;
    a.vy[i] += flock.ay * dt;
    a.vz[i] += flock.az * dt;

    // Wander + altitude band spring.
    const w = a.wf;
    a.vx[i] += Math.sin(sim.time * w[i * 4] + w[i * 4 + 1]) * b.wander * 1.6 * dt;
    a.vz[i] += Math.cos(sim.time * w[i * 4 + 2] + w[i * 4 + 3]) * b.wander * 1.6 * dt;
    const bandY = a.groundY[i] + b.altitudeMin
      + a.hoverBias[i] * Math.max(b.altitudeMax - b.altitudeMin, 1);
    a.vy[i] += (bandY - a.py[i]) * 0.35 * dt;
    a.vy[i] *= 1 - Math.min(1, 0.6 * dt);
    boundsForce(a, i, dt);

    if (followD2 < b.fleeRadius * b.fleeRadius) {
      const d = Math.max(Math.sqrt(followD2), 1e-3);
      a.vx[i] += (fx / d) * 26 * dt;
      a.vy[i] += 9 * dt;
      a.vz[i] += (fz / d) * 26 * dt;
      a.ampTarget[i] = 1;
      a.cooldown[i] = Math.max(a.cooldown[i], 4);
    } else if (a.cooldown[i] <= 0 && perches.length > 0
      && nextRand(a.rng, i) < b.perchChance * dt * 0.1) {
      // Claim the nearest free perch within gliding range.
      let best = -1;
      let bestD2 = 30 * 30;
      for (let p = 0; p < perches.length; p += 1) {
        if (perches[p].occupant >= 0) continue;
        const dx = perches[p].x - a.px[i];
        const dz = perches[p].z - a.pz[i];
        const d2 = dx * dx + dz * dz;
        if (d2 < bestD2) { bestD2 = d2; best = p; }
      }
      if (best >= 0) {
        perches[best].occupant = i;
        a.target[i] = best;
        a.state[i] = FAUNA_STATE.APPROACH;
        a.timer[i] = 0;
        return;
      }
      a.cooldown[i] = 3;
    }

    clampSpeed(a, i, b.cruiseSpeed * 0.55, b.maxSpeed);
    // Flap hard when climbing or slow, glide when descending.
    const speed = Math.hypot(a.vx[i], a.vy[i], a.vz[i]);
    a.ampTarget[i] = Math.min(1, Math.max(0.12,
      0.45 + a.vy[i] * 0.35 + (speed < b.cruiseSpeed ? 0.25 : 0)));
  }

  function butterflyTick(state, i, dt, follow) {
    const a = state.arrays;
    const b = cfg.butterflies;
    a.groundY[i] = ground(a.px[i], a.pz[i]);

    const hx = a.homeX[i] - a.px[i];
    const hz = a.homeZ[i] - a.pz[i];
    const homeD = Math.hypot(hx, hz);

    if (a.far[i]) {
      // Scripted loop around the anchor: pull home + keep the circling turn.
      if (homeD > 2) {
        a.vx[i] += hx / homeD * 0.8 * dt;
        a.vz[i] += hz / homeD * 0.8 * dt;
      }
      clampSpeed(a, i, b.speed * 0.4, b.speed);
      return;
    }

    // Anchor spring, ramping in over the last 30% of the wander radius.
    const over = homeD - b.wanderRadius * 0.7;
    if (over > 0) {
      const k = Math.min(over / Math.max(b.wanderRadius * 0.3, 0.5), 2) * 2.4;
      a.vx[i] += hx / Math.max(homeD, 1e-3) * k * dt;
      a.vz[i] += hz / Math.max(homeD, 1e-3) * k * dt;
    }

    // The flutter: sinusoid wander in XZ + a bobbing hover band.
    const w = a.wf;
    a.vx[i] += Math.sin(sim.time * (1.1 + w[i * 4]) + w[i * 4 + 1]) * b.speed * 2.6 * dt;
    a.vz[i] += Math.cos(sim.time * (1.2 + w[i * 4 + 2]) + w[i * 4 + 3]) * b.speed * 2.6 * dt;
    const hoverY = a.groundY[i] + b.hoverMin
      + a.hoverBias[i] * Math.max(b.hoverMax - b.hoverMin, 0.1);
    a.vy[i] += (hoverY - a.py[i]) * 2.2 * dt;
    a.vy[i] *= 1 - Math.min(1, 1.5 * dt);

    if (follow) {
      const fx = a.px[i] - follow.x;
      const fy = a.py[i] - (follow.y ?? 0);
      const fz = a.pz[i] - follow.z;
      const d2 = fx * fx + fy * fy + fz * fz; // 3D: an aerial camera is far
      if (d2 < b.fleeRadius * b.fleeRadius) {
        const d = Math.max(Math.sqrt(d2), 1e-3);
        a.vx[i] += (fx / d) * 8 * dt;
        a.vy[i] += 2.5 * dt;
        a.vz[i] += (fz / d) * 8 * dt;
      }
    }

    // Occasional anchor hop — only to NEARBY flower points, so butterflies
    // drift around their patch instead of migrating across the map (and the
    // flower-mask invariant holds through the transit).
    if (flowerPool.length > 1 && nextRand(a.rng, i) < 0.06 * dt) {
      const reach = b.wanderRadius * 3;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const pick = flowerPool[Math.floor(nextRand(a.rng, i) * flowerPool.length) % flowerPool.length];
        const dx = pick.x - a.px[i];
        const dz = pick.z - a.pz[i];
        if (dx * dx + dz * dz < reach * reach) {
          a.homeX[i] = pick.x;
          a.homeZ[i] = pick.z;
          break;
        }
      }
    }
    boundsForce(a, i, dt);
    clampSpeed(a, i, b.speed * 0.3, b.speed * 1.8);
  }

  function dragonflyTick(state, i, dt, follow) {
    const a = state.arrays;
    const b = cfg.dragonflies;
    a.groundY[i] = ground(a.px[i], a.pz[i]);
    const hoverY = waterLevel + b.hoverHeight * (0.7 + a.hoverBias[i] * 0.7);

    if (a.state[i] === FAUNA_STATE.DART) {
      const dx = a.homeX[i] - a.px[i];
      const dz = a.homeZ[i] - a.pz[i];
      const d = Math.hypot(dx, dz);
      if (d < 1) {
        a.state[i] = FAUNA_STATE.FLY;
        a.vx[i] *= 0.25; a.vz[i] *= 0.25;
      } else {
        a.vx[i] = dx / d * b.dartSpeed;
        a.vz[i] = dz / d * b.dartSpeed;
      }
      a.vy[i] += (hoverY - a.py[i]) * 4 * dt;
      return;
    }

    if (!a.far[i]) {
      // Hover jitter: tight, twitchy sinusoids — the dragonfly read.
      const w = a.wf;
      a.vx[i] += Math.sin(sim.time * (3 + w[i * 4] * 4) + w[i * 4 + 1]) * 3.2 * dt;
      a.vz[i] += Math.cos(sim.time * (3 + w[i * 4 + 2] * 4) + w[i * 4 + 3]) * 3.2 * dt;
      const hxD = a.homeX[i] - a.px[i];
      const hzD = a.homeZ[i] - a.pz[i];
      const dh = Math.hypot(hxD, hzD);
      if (dh > b.hoverRadius * 0.6) {
        a.vx[i] += hxD / Math.max(dh, 1e-3) * 3 * dt;
        a.vz[i] += hzD / Math.max(dh, 1e-3) * 3 * dt;
      }
      if (follow) {
        const fx = a.px[i] - follow.x;
        const fy = a.py[i] - (follow.y ?? 0);
        const fz = a.pz[i] - follow.z;
        const d2 = fx * fx + fy * fy + fz * fz;
        if (d2 < 6.25) { // dragonflies tolerate ~2.5 m before darting
          const d = Math.max(Math.sqrt(d2), 1e-3);
          a.vx[i] += (fx / d) * 14 * dt;
          a.vz[i] += (fz / d) * 14 * dt;
        }
      }
      if (dragonPool.length > 1 && nextRand(a.rng, i) < b.dartChance * dt * 0.125) {
        const pick = dragonPool[Math.floor(nextRand(a.rng, i) * dragonPool.length) % dragonPool.length];
        a.homeX[i] = pick.x;
        a.homeZ[i] = pick.z;
        a.state[i] = FAUNA_STATE.DART;
      }
    }
    a.vy[i] += (hoverY - a.py[i]) * 5 * dt;
    a.vy[i] *= 1 - Math.min(1, 3 * dt);
    boundsForce(a, i, dt);
    clampSpeed(a, i, 0, b.dartSpeed);
  }

  function fishTick(state, i, dt, follow, stamp) {
    const a = state.arrays;
    const f = cfg.fish;
    const bed = ground(a.px[i], a.pz[i]);
    a.groundY[i] = bed;
    const lo = bed + f.bedMargin;
    const hi = waterLevel - f.surfaceMargin;

    // Shallow-water escape dominates everything: swim down the bed gradient
    // before the depth clamps can ever pinch (see the invariant analysis in
    // scripts/verify-fauna.mjs).
    const room = hi - lo;
    if (room < 0.5) {
      const e = 1.5;
      const gx = (ground(a.px[i] + e, a.pz[i]) - ground(a.px[i] - e, a.pz[i])) / (2 * e);
      const gz = (ground(a.px[i], a.pz[i] + e) - ground(a.px[i], a.pz[i] - e)) / (2 * e);
      const g = Math.max(Math.hypot(gx, gz), 1e-4);
      const urgency = room < 0.2 ? 3 : 1;
      a.vx[i] += (-gx / g) * f.cruiseSpeed * 4 * urgency * dt;
      a.vz[i] += (-gz / g) * f.cruiseSpeed * 4 * urgency * dt;
      a.vy[i] -= 0.8 * dt;
      clampSpeed(a, i, f.cruiseSpeed * 0.6, f.maxSpeed);
      return;
    }

    if (a.far[i]) {
      clampSpeed(a, i, f.cruiseSpeed * 0.9, f.cruiseSpeed * 1.1);
      a.vy[i] *= 0.5;
      return;
    }

    rebuildGrid(state, stamp);
    accumulateFlock(state, i, f.neighborRadius, f.separationRadius,
      f.cohesion * 1.2, f.alignment * 0.7, f.separation * 0.35);
    a.vx[i] += flock.ax * dt;
    a.vy[i] += flock.ay * dt;
    a.vz[i] += flock.az * dt;

    const w = a.wf;
    a.vx[i] += Math.sin(sim.time * w[i * 4] * 0.7 + w[i * 4 + 1]) * f.wander * 0.8 * dt;
    a.vz[i] += Math.cos(sim.time * w[i * 4 + 2] * 0.7 + w[i * 4 + 3]) * f.wander * 0.8 * dt;
    // Preferred depth: a lane in the top of the water column — koi live where
    // the refraction pass can show them, not on the bed.
    const laneY = Math.max(hi - (0.2 + a.hoverBias[i] * 0.7), lo + Math.min(room, 2) * 0.15);
    a.vy[i] += (laneY - a.py[i]) * 0.8 * dt;
    a.vy[i] *= 1 - Math.min(1, 1.2 * dt);

    if (follow) {
      const fx = a.px[i] - follow.x;
      const fy = a.py[i] - (follow.y ?? 0);
      const fz = a.pz[i] - follow.z;
      // 3D: a swimmer or a bridge-walker close above scares fish; an aerial
      // camera does not empty the shot.
      const d2 = fx * fx + fy * fy + fz * fz;
      if (d2 < f.fleeRadius * f.fleeRadius) {
        const d = Math.max(Math.sqrt(d2), 1e-3);
        a.vx[i] += (fx / d) * 10 * dt;
        a.vz[i] += (fz / d) * 10 * dt;
      }
    }
    boundsForce(a, i, dt);
    clampSpeed(a, i, f.cruiseSpeed * 0.45, f.maxSpeed);
  }

  const TICKS = {
    birds: birdTick,
    butterflies: butterflyTick,
    dragonflies: dragonflyTick,
    fish: fishTick,
  };

  // --- integration (every agent, every frame) --------------------------------

  function integrate(dt, follow) {
    const far2 = cfg.shared.farDistance * cfg.shared.farDistance;
    for (const name of FAUNA_SPECIES) {
      const state = speciesStates[name];
      const a = state.arrays;
      const isFish = name === 'fish';
      const isBird = name === 'birds';
      for (let i = 0; i < state.count; i += 1) {
        // Far flag (cheap: one distance per agent per frame keeps the
        // degrade responsive even between that agent's steering ticks).
        if (follow) {
          const dx = a.px[i] - follow.x;
          const dz = a.pz[i] - follow.z;
          a.far[i] = dx * dx + dz * dz > far2 ? 1 : 0;
        } else {
          a.far[i] = 0;
        }

        const k = Math.min(1, 5 * dt);
        a.amp[i] += (a.ampTarget[i] - a.amp[i]) * k;
        a.fold[i] += (a.foldTarget[i] - a.fold[i]) * Math.min(1, 3.5 * dt);

        if (a.state[i] === FAUNA_STATE.PERCHED) continue;

        if (a.far[i] && a.state[i] === FAUNA_STATE.FLY) {
          // Scripted loop: constant-rate yaw — perfect circles, no steering.
          const wd = a.turn[i] * dt;
          const nvx = a.vx[i] - a.vz[i] * wd;
          a.vz[i] += a.vx[i] * wd;
          a.vx[i] = nvx;
        }

        a.px[i] += a.vx[i] * dt;
        a.py[i] += a.vy[i] * dt;
        a.pz[i] += a.vz[i] * dt;

        // Hard bounds (steering springs should make these no-ops).
        if (a.px[i] < box.minX) { a.px[i] = box.minX; a.vx[i] *= -0.5; }
        else if (a.px[i] > box.maxX) { a.px[i] = box.maxX; a.vx[i] *= -0.5; }
        if (a.pz[i] < box.minZ) { a.pz[i] = box.minZ; a.vz[i] *= -0.5; }
        else if (a.pz[i] > box.maxZ) { a.pz[i] = box.maxZ; a.vz[i] *= -0.5; }

        if (isFish) {
          const lo = a.groundY[i] + cfg.fish.bedMargin;
          const hi = waterLevel - cfg.fish.surfaceMargin;
          if (a.py[i] > hi) { a.py[i] = hi; if (a.vy[i] > 0) a.vy[i] = 0; }
          if (a.py[i] < lo) { a.py[i] = Math.min(lo, hi); if (a.vy[i] < 0) a.vy[i] = 0; }
        } else if (isBird) {
          const floor = a.groundY[i] + (a.state[i] === FAUNA_STATE.APPROACH ? 0.1 : 1.0);
          if (a.py[i] < floor) { a.py[i] = floor; if (a.vy[i] < 0) a.vy[i] = 0; }
        } else {
          const floor = name === 'dragonflies'
            ? Math.max(waterLevel + 0.15, a.groundY[i] + 0.2)
            : a.groundY[i] + cfg.butterflies.hoverMin * 0.5;
          if (a.py[i] < floor) { a.py[i] = floor; if (a.vy[i] < 0) a.vy[i] = 0; }
        }

        // Heading smoothing + banking from the applied turn.
        const speed2 = a.vx[i] * a.vx[i] + a.vz[i] * a.vz[i];
        if (speed2 > 1e-6) {
          const target = Math.atan2(a.vx[i], a.vz[i]);
          let delta = target - a.heading[i];
          delta -= Math.round(delta / (Math.PI * 2)) * Math.PI * 2;
          const maxTurn = 7 * dt;
          const applied = Math.min(Math.max(delta, -maxTurn), maxTurn);
          a.heading[i] += applied;
          const targetBank = Math.min(Math.max(applied / Math.max(dt, 1e-4) * -0.12, -0.6), 0.6);
          a.bank[i] += (targetBank - a.bank[i]) * Math.min(1, 6 * dt);
        } else {
          a.bank[i] *= 1 - Math.min(1, 4 * dt);
        }
      }
    }
  }

  // --- public update ----------------------------------------------------------

  let cursor = 0;
  sim.update = (delta, follow = null) => {
    const dt = Math.min(Math.max(Number(delta) || 0.016, 0.0005), 0.1);
    sim.time += dt;
    stats.updates += 1;

    integrate(dt, follow);

    // Staggered steering slice.
    let steered = 0;
    const budget = Math.min(stats.tickBudget, walk.length);
    for (let n = 0; n < budget; n += 1) {
      const entry = walk[cursor];
      cursor = (cursor + 1) % Math.max(walk.length, 1);
      const state = entry.s;
      const i = entry.i;
      const a = state.arrays;
      const dtTick = Math.min(Math.max(sim.time - a.lastTick[i], 1 / 240), 0.6);
      a.lastTick[i] = sim.time;
      TICKS[state.name](state, i, dtTick, follow, stats.updates);
      steered += 1;
    }
    stats.steeredLastUpdate = steered;
    return sim;
  };

  return sim;
}
