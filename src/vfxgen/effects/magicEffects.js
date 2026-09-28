// Magic-category effects: the fireball's in-flight ember shed and its
// detonation (flame sparks + star flash + smoke puffs + expanding scorch
// ring). The projectile core itself is a pooled billboard mesh with the
// flame shader — see vfxSystem.js; these builders supply every particle
// around it.
//
// Every export is a pure builder: (settings, rng, options, clock) → backbone
// records grouped by blend state ({ glow: [...], puff: [...] }).

import { BURST_KIND } from '../core/burstBackbone.js';
import { jitterColor, lerp, normalized, randUnitVector, withOverrides } from './emitHelpers.js';

/**
 * Embers shed along the flight path. vfxSystem accumulates `emberRate · dt`
 * and calls this with the whole-ember count, positions jittered around the
 * projectile, so shedding is framerate-independent and deterministic.
 */
export function emitFireballEmbers({ settings, rng, at, velocity = [0, 0, 0], count, now = 0, overrides = null }) {
  const e = withOverrides(settings.fireball, overrides);
  if (!e.enabled || count <= 0) return { glow: [], puff: [] };
  const glow = [];
  for (let i = 0; i < count; i += 1) {
    const scatter = randUnitVector(rng);
    const color = jitterColor(
      rng() < 0.35 ? e.coreColor : e.flameColor, rng, 0.1);
    const size = lerp(e.emberSize[0], e.emberSize[1], rng());
    glow.push({
      birth: now,
      extra: lerp(0.08, 0.22, rng()), // wander radius
      gravity: -2.2, // buoyant — embers rise off the trail
      kind: BURST_KIND.ember,
      lifetime: e.emberLifetime * lerp(0.7, 1.3, rng()),
      r: color[0] * e.intensity, g: color[1] * e.intensity, b: color[2] * e.intensity,
      seed: rng(),
      size0: size, size1: size * 0.25,
      // Drop out of the slipstream: a touch of counter-velocity plus scatter.
      vx: scatter[0] * 0.6 - velocity[0] * 0.08,
      vy: scatter[1] * 0.6 - velocity[1] * 0.08 + 0.4,
      vz: scatter[2] * 0.6 - velocity[2] * 0.08,
      x: at[0] + scatter[0] * e.coreSize * 0.5,
      y: at[1] + scatter[1] * e.coreSize * 0.5,
      z: at[2] + scatter[2] * e.coreSize * 0.5,
    });
  }
  return { glow, puff: [] };
}

/**
 * Detonation at a point: flame sparks + an 8-ish spike flash + rising smoke
 * puffs + (optionally) the ground scorch ring. `power` defaults to the
 * settings' explosionPower; `normal` orients the spark spray (pass the
 * surface normal of whatever was hit).
 */
export function emitFireballExplosion({ settings, rng, at, normal = [0, 1, 0], power = null, now = 0, overrides = null }) {
  const e = withOverrides(settings.fireball, overrides);
  if (!e.enabled) return { glow: [], puff: [] };
  const p = Math.max(Number(power ?? e.explosionPower) || 1, 0);
  const n = normalized(normal);
  const glow = [];
  const puff = [];

  // Flame sparks — like an impact burst but slower, larger, flame-colored.
  const sparkCount = Math.round(14 * p);
  for (let i = 0; i < sparkCount; i += 1) {
    const scatter = randUnitVector(rng);
    const dir = normalized([
      n[0] + scatter[0], Math.abs(n[1] + scatter[1]) * 0.9, n[2] + scatter[2],
    ]);
    const speed = 4.5 * lerp(0.4, 1.2, rng()) * Math.sqrt(p);
    const size = 0.09 * lerp(0.7, 1.4, rng()) * p ** 0.3;
    const color = jitterColor(rng() < 0.4 ? e.coreColor : e.flameColor, rng, 0.1);
    glow.push({
      birth: now,
      extra: 2.2,
      gravity: 7,
      kind: BURST_KIND.spark,
      lifetime: lerp(0.3, 0.65, rng()),
      r: color[0] * e.intensity, g: color[1] * e.intensity, b: color[2] * e.intensity,
      seed: rng(),
      size0: size, size1: size * 0.3,
      vx: dir[0] * speed, vy: dir[1] * speed, vz: dir[2] * speed,
      x: at[0], y: at[1], z: at[2],
    });
  }

  glow.push({
    birth: now,
    extra: 8,
    gravity: 0,
    kind: BURST_KIND.flash,
    lifetime: 0.22,
    r: e.coreColor[0] * e.intensity * 1.6,
    g: e.coreColor[1] * e.intensity * 1.6,
    b: e.coreColor[2] * e.intensity * 1.6,
    seed: rng(),
    size0: 1.1 * Math.sqrt(p), size1: 0,
    vx: 0, vy: 0, vz: 0,
    x: at[0], y: at[1], z: at[2],
  });

  // Camera-facing blast circle — the same shockwave the impact burst uses,
  // scaled up; it sells the detonation's concussion before the smoke rises.
  glow.push({
    birth: now,
    extra: 0.2,
    gravity: 0,
    kind: BURST_KIND.shockwave,
    lifetime: 0.38,
    r: e.coreColor[0] * e.intensity * 0.9,
    g: e.coreColor[1] * e.intensity * 0.9,
    b: e.coreColor[2] * e.intensity * 0.9,
    seed: rng(),
    size0: 0.2, size1: 2.6 * Math.sqrt(p),
    vx: 0, vy: 0, vz: 0,
    x: at[0], y: at[1] + 0.4, z: at[2],
  });

  if (e.scorchRing) {
    glow.push({
      birth: now,
      extra: 0.18, // starting band thickness
      gravity: 0,
      kind: BURST_KIND.ring,
      lifetime: 0.55,
      r: e.ringColor[0] * e.intensity,
      g: e.ringColor[1] * e.intensity,
      b: e.ringColor[2] * e.intensity,
      seed: rng(),
      size0: 0.3, size1: 2.4 * p,
      vx: 0, vy: 0, vz: 0,
      x: at[0], y: at[1] + 0.03, z: at[2],
    });
  }

  // Smoke column: dark warm puffs rising off the blast.
  const puffCount = Math.round(7 * p);
  for (let i = 0; i < puffCount; i += 1) {
    const scatter = randUnitVector(rng);
    const shade = lerp(0.16, 0.3, rng());
    const size = lerp(0.28, 0.5, rng()) * p ** 0.4;
    puff.push({
      birth: now,
      extra: lerp(-2.5, 2.5, rng()), // spin
      gravity: -1.4, // buoyant rise
      kind: BURST_KIND.puff,
      lifetime: lerp(0.7, 1.2, rng()),
      r: shade * (1 + e.flameColor[0] * 0.4),
      g: shade,
      b: shade * 0.92,
      seed: rng(),
      size0: size * 0.5, size1: size * 1.9,
      vx: scatter[0] * 1.4,
      vy: Math.abs(scatter[1]) * 1.6 + 0.8,
      vz: scatter[2] * 1.4,
      x: at[0] + scatter[0] * 0.25,
      y: at[1] + Math.abs(scatter[1]) * 0.2,
      z: at[2] + scatter[2] * 0.25,
    });
  }

  return { glow, puff };
}
