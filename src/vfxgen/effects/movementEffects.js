// Movement-category effects: footstep dust puffs and the landing ring — the
// ground-feedback layer that makes body movement read as WEIGHT. Both are
// dust-only (puff group); movement feedback is matter, not light.
//
// Every export is a pure builder: (settings, rng, options, clock) → backbone
// records grouped by blend state ({ glow: [...], puff: [...] }).

import { BURST_KIND } from '../core/burstBackbone.js';
import { jitterColor, lerp, normalized, withOverrides } from './emitHelpers.js';

/**
 * A footfall: a few small puffs kicked slightly backward from the travel
 * direction (`dir`, optional XZ heading) and drifting up. Cheap enough to
 * fire every step.
 */
export function emitFootstep({ settings, rng, at, dir = null, now = 0, overrides = null }) {
  const e = withOverrides(settings.footstep, overrides);
  if (!e.enabled) return { glow: [], puff: [] };
  const heading = dir ? normalized([dir[0], 0, dir[2] ?? dir[1]]) : null;
  const puff = [];
  for (let i = 0; i < e.puffCount; i += 1) {
    const angle = rng() * Math.PI * 2;
    const radius = rng() * e.spread;
    const size = lerp(e.sizeRange[0], e.sizeRange[1], rng());
    const color = jitterColor(e.color, rng, 0.07);
    // Kick opposite the heading (dust trails the foot), plus radial scatter.
    const kick = heading ? 0.5 + rng() * 0.4 : 0;
    puff.push({
      birth: now,
      extra: lerp(-3, 3, rng()), // spin
      gravity: -0.5, // gentle rise
      kind: BURST_KIND.puff,
      lifetime: e.lifetime * lerp(0.75, 1.25, rng()),
      r: color[0], g: color[1], b: color[2],
      seed: rng(),
      size0: size * 0.6, size1: size * 2.1,
      vx: Math.cos(angle) * radius * 2 - (heading ? heading[0] * kick : 0),
      vy: e.rise * lerp(0.5, 1.0, rng()),
      vz: Math.sin(angle) * radius * 2 - (heading ? heading[2] * kick : 0),
      x: at[0] + Math.cos(angle) * radius,
      y: at[1] + 0.03,
      z: at[2] + Math.sin(angle) * radius,
    });
  }
  return { glow: [], puff };
}

/**
 * A touch-down: a ring of puffs expanding radially from the landing point —
 * the classic anime landing hit. `power` scales count and radius (1 = a hop,
 * 2+ = a superhero landing).
 */
export function emitLanding({ settings, rng, at, power = 1, now = 0, overrides = null }) {
  const e = withOverrides(settings.landing, overrides);
  if (!e.enabled) return { glow: [], puff: [] };
  const p = Math.max(Number(power) || 1, 0);
  const count = Math.round(e.puffCount * p);
  const radius = e.ringRadius * Math.sqrt(p);
  const puff = [];
  for (let i = 0; i < count; i += 1) {
    // Even ring spacing with jitter — even spacing is what makes it a RING.
    const angle = (i / Math.max(count, 1)) * Math.PI * 2 + (rng() - 0.5) * 0.5;
    const size = lerp(e.sizeRange[0], e.sizeRange[1], rng()) * p ** 0.3;
    const color = jitterColor(e.color, rng, 0.07);
    const lifetime = e.lifetime * lerp(0.8, 1.2, rng());
    // Launch speed tuned so the decelerating puff covers ~the ring radius
    // over its life (backbone decel integrates to ~0.7 · v · lifetime).
    const speed = radius / (0.7 * lifetime);
    puff.push({
      birth: now,
      extra: lerp(-2.5, 2.5, rng()),
      gravity: -0.3,
      kind: BURST_KIND.puff,
      lifetime,
      r: color[0], g: color[1], b: color[2],
      seed: rng(),
      size0: size * 0.55, size1: size * 2.0,
      vx: Math.cos(angle) * speed,
      vy: 0.4 * lerp(0.6, 1.2, rng()),
      vz: Math.sin(angle) * speed,
      x: at[0] + Math.cos(angle) * 0.15,
      y: at[1] + 0.04,
      z: at[2] + Math.sin(angle) * 0.15,
    });
  }
  return { glow: [], puff };
}
