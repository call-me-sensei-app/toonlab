// Weapon-category effects: the impact burst (star flash + ballistic sparks)
// and the slash trail's edge sparkle. The slash ribbon itself is geometry,
// not particles — see core/trailRibbon.js; vfxSystem owns the ribbon pool
// and calls emitSlashSparkle along the sampled tip path.
//
// Every export is a pure builder: (settings, rng, options, clock) → backbone
// records grouped by blend state ({ glow: [...], puff: [...] }).

import { BURST_KIND } from '../core/burstBackbone.js';
import { jitterColor, lerp, normalized, randUnitVector, withOverrides } from './emitHelpers.js';

/**
 * Hit feedback at a point: one N-spike star flash plus `sparkCount · power`
 * ballistic sparks biased along the hit normal. `power` scales count, speed,
 * and flash size — 0.3 reads as a parry tick, 2 as a heavy finisher.
 */
export function emitImpact({ settings, rng, at, normal = [0, 1, 0], power = 1, now = 0, overrides = null }) {
  const e = withOverrides(settings.impact, overrides);
  if (!e.enabled) return { glow: [], puff: [] };
  const p = Math.max(Number(power) || 1, 0);
  const n = normalized(normal);
  const glow = [];

  const count = Math.round(e.sparkCount * p);
  for (let i = 0; i < count; i += 1) {
    const scatter = randUnitVector(rng);
    // Hemisphere bias: fold scatter toward the hit normal so sparks spray
    // OFF the surface, with enough spread to read as a shower.
    const dir = normalized([
      n[0] + scatter[0] * 0.85,
      Math.abs(n[1] + scatter[1] * 0.85),
      n[2] + scatter[2] * 0.85,
    ]);
    const speed = e.sparkSpeed * lerp(0.4, 1.2, rng()) * Math.sqrt(p);
    const size = 0.05 * lerp(0.7, 1.3, rng()) * p ** 0.3;
    const color = jitterColor(e.sparkColor, rng);
    glow.push({
      birth: now,
      extra: 3.5, // streak stretch along velocity
      gravity: e.gravity,
      kind: BURST_KIND.spark,
      lifetime: e.lifetime * lerp(0.5, 1.0, rng()),
      r: color[0] * e.intensity, g: color[1] * e.intensity, b: color[2] * e.intensity,
      seed: rng(),
      size0: size, size1: size * 0.35,
      vx: dir[0] * speed, vy: dir[1] * speed, vz: dir[2] * speed,
      x: at[0], y: at[1], z: at[2],
    });
  }

  if (e.flashSize > 0) {
    glow.push({
      birth: now,
      extra: e.spikes,
      gravity: 0,
      kind: BURST_KIND.flash,
      lifetime: Math.max(e.lifetime * 0.45, 0.08),
      r: e.flashColor[0] * e.intensity * 1.4,
      g: e.flashColor[1] * e.intensity * 1.4,
      b: e.flashColor[2] * e.intensity * 1.4,
      seed: rng(),
      size0: e.flashSize * Math.sqrt(p), size1: 0,
      vx: 0, vy: 0, vz: 0,
      x: at[0], y: at[1], z: at[2],
    });
  }

  // The action-RPG hit circle: a camera-facing ring that pops outward and
  // dies fast — reads as the hit "landing" even before the sparks resolve.
  if (e.shockwave) {
    glow.push({
      birth: now,
      extra: 0.22, // starting band thickness
      gravity: 0,
      kind: BURST_KIND.shockwave,
      lifetime: 0.3,
      r: e.flashColor[0] * e.intensity * 0.9,
      g: e.flashColor[1] * e.intensity * 0.9,
      b: e.flashColor[2] * e.intensity * 0.9,
      seed: rng(),
      size0: 0.12, size1: 1.25 * Math.sqrt(p),
      vx: 0, vy: 0, vz: 0,
      x: at[0], y: at[1], z: at[2],
    });
  }

  return { glow, puff: [] };
}

/**
 * Sparks shed from the blade tip while a slash trail is live. vfxSystem
 * accumulates `sparkle · dt` and calls this with the whole-spark count each
 * frame, so emission is framerate-independent and deterministic.
 */
export function emitSlashSparkle({ settings, rng, tip, count, now = 0, overrides = null }) {
  const e = withOverrides(settings.slash, overrides);
  if (!e.enabled || count <= 0) return { glow: [], puff: [] };
  const glow = [];
  for (let i = 0; i < count; i += 1) {
    const dir = randUnitVector(rng);
    const speed = lerp(0.4, 1.6, rng());
    const size = lerp(0.02, 0.05, rng());
    const color = jitterColor(e.color, rng, 0.12);
    glow.push({
      birth: now,
      extra: 2.0,
      gravity: 4,
      kind: BURST_KIND.spark,
      lifetime: lerp(0.12, 0.3, rng()),
      r: color[0] * e.intensity, g: color[1] * e.intensity, b: color[2] * e.intensity,
      seed: rng(),
      size0: size, size1: size * 0.3,
      vx: dir[0] * speed, vy: dir[1] * speed, vz: dir[2] * speed,
      x: tip[0], y: tip[1], z: tip[2],
    });
  }
  return { glow, puff: [] };
}
