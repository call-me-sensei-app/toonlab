// Pure particle builders for the Charged Energy Shot template. The layered
// projectile body is mesh-led (core/chargedShotCore.js); these builders own
// only travel shedding and contact/expiration bursts.

import { BURST_KIND } from '../core/burstBackbone.js';
import {
  jitterColor,
  lerp,
  normalized,
  randUnitVector,
  withOverrides,
} from './emitHelpers.js';

const clamp01 = (value) => Math.min(Math.max(Number(value) || 0, 0), 1);

export function emitChargedShotTrail({
  at,
  charge = 1,
  count,
  now = 0,
  overrides = null,
  rng,
  settings,
  velocity = [0, 0, 0],
}) {
  const effect = withOverrides(settings.chargedShot, overrides);
  if (!effect.enabled || count <= 0 || effect.trailLength <= 0) return { glow: [], puff: [] };
  const c = clamp01(charge);
  const glow = [];
  const radius = effect.radius * lerp(0.62, 1, c);
  const lifetimeBase = Math.max(effect.trailLength, 0.02);
  for (let index = 0; index < count; index += 1) {
    const scatter = randUnitVector(rng);
    const boundary = rng() < 0.46;
    const color = jitterColor(boundary ? effect.accentColor : effect.edgeColor, rng, 0.12);
    const size = effect.radius * lerp(boundary ? 0.035 : 0.025, boundary ? 0.09 : 0.065, rng())
      * lerp(0.65, 1.25, c);
    const counter = boundary ? 0.055 : 0.085;
    glow.push({
      birth: now,
      extra: boundary ? lerp(2.2, 4.2, rng()) : effect.turbulence * lerp(0.08, 0.24, rng()),
      gravity: boundary ? lerp(0.4, 2.2, rng()) : -effect.turbulence * 0.65,
      kind: boundary ? BURST_KIND.spark : BURST_KIND.ember,
      lifetime: lifetimeBase * lerp(boundary ? 0.18 : 0.3, boundary ? 0.46 : 0.72, rng()),
      r: color[0] * effect.shellIntensity,
      g: color[1] * effect.shellIntensity,
      b: color[2] * effect.shellIntensity,
      seed: rng(),
      size0: size,
      size1: size * (boundary ? 0.2 : 0.35),
      vx: scatter[0] * effect.turbulence - velocity[0] * counter,
      vy: scatter[1] * effect.turbulence - velocity[1] * counter,
      vz: scatter[2] * effect.turbulence - velocity[2] * counter,
      x: at[0] + scatter[0] * radius,
      y: at[1] + scatter[1] * radius,
      z: at[2] + scatter[2] * radius,
    });
  }
  return { glow, puff: [] };
}

export function emitChargedShotImpact({
  at,
  charge = 1,
  normal = [0, 1, 0],
  now = 0,
  overrides = null,
  power = null,
  rng,
  settings,
}) {
  const effect = withOverrides(settings.chargedShot, overrides);
  if (!effect.enabled) return { glow: [], puff: [] };
  const c = clamp01(charge);
  const p = Math.max(Number(power ?? effect.impactPower) || 0, 0) * lerp(0.45, 1, c);
  const n = normalized(normal);
  const glow = [];
  const puff = [];

  const sparkCount = Math.round(12 * p);
  for (let index = 0; index < sparkCount; index += 1) {
    const scatter = randUnitVector(rng);
    const direction = normalized([
      n[0] + scatter[0] * 0.95,
      n[1] + scatter[1] * 0.95,
      n[2] + scatter[2] * 0.95,
    ], n);
    const speed = lerp(3.2, 8.5, rng()) * Math.sqrt(Math.max(p, 0.1));
    const color = jitterColor(rng() < 0.35 ? effect.coreColor : effect.accentColor, rng, 0.1);
    const size = effect.radius * lerp(0.08, 0.2, rng()) * Math.max(p, 0.25) ** 0.24;
    glow.push({
      birth: now,
      extra: lerp(2.8, 5.2, rng()),
      gravity: lerp(2, 9, rng()),
      kind: BURST_KIND.spark,
      lifetime: lerp(0.22, 0.65, rng()),
      r: color[0] * effect.coreIntensity,
      g: color[1] * effect.coreIntensity,
      b: color[2] * effect.coreIntensity,
      seed: rng(),
      size0: size,
      size1: size * 0.2,
      vx: direction[0] * speed,
      vy: direction[1] * speed,
      vz: direction[2] * speed,
      x: at[0],
      y: at[1],
      z: at[2],
    });
  }

  glow.push({
    birth: now,
    extra: 8,
    gravity: 0,
    kind: BURST_KIND.flash,
    lifetime: 0.2,
    r: effect.coreColor[0] * effect.coreIntensity * 1.6,
    g: effect.coreColor[1] * effect.coreIntensity * 1.6,
    b: effect.coreColor[2] * effect.coreIntensity * 1.6,
    seed: rng(),
    size0: effect.radius * 2.5 * Math.sqrt(Math.max(p, 0.1)),
    size1: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    x: at[0],
    y: at[1],
    z: at[2],
  });

  glow.push({
    birth: now,
    extra: 0.18,
    gravity: 0,
    kind: BURST_KIND.shockwave,
    lifetime: 0.34,
    r: effect.accentColor[0] * effect.shellIntensity,
    g: effect.accentColor[1] * effect.shellIntensity,
    b: effect.accentColor[2] * effect.shellIntensity,
    seed: rng(),
    size0: effect.radius * 0.35,
    size1: effect.radius * 5.5 * Math.sqrt(Math.max(p, 0.1)),
    vx: 0,
    vy: 0,
    vz: 0,
    x: at[0],
    y: at[1],
    z: at[2],
  });

  const puffCount = Math.round(3.5 * p);
  for (let index = 0; index < puffCount; index += 1) {
    const scatter = randUnitVector(rng);
    const size = effect.radius * lerp(0.28, 0.62, rng()) * Math.max(p, 0.25) ** 0.28;
    puff.push({
      birth: now,
      extra: lerp(-3, 3, rng()),
      gravity: -0.55,
      kind: BURST_KIND.puff,
      lifetime: lerp(0.42, 0.85, rng()),
      r: effect.edgeColor[0] * 0.32 + 0.12,
      g: effect.edgeColor[1] * 0.2 + 0.14,
      b: effect.edgeColor[2] * 0.2 + 0.18,
      seed: rng(),
      size0: size * 0.45,
      size1: size * 1.7,
      vx: n[0] * lerp(0.4, 1.4, rng()) + scatter[0] * 0.75,
      vy: n[1] * lerp(0.4, 1.4, rng()) + scatter[1] * 0.75,
      vz: n[2] * lerp(0.4, 1.4, rng()) + scatter[2] * 0.75,
      x: at[0] + scatter[0] * effect.radius * 0.25,
      y: at[1] + scatter[1] * effect.radius * 0.25,
      z: at[2] + scatter[2] * effect.radius * 0.25,
    });
  }
  return { glow, puff };
}

export function emitChargedShotExpiration({
  at,
  charge = 1,
  now = 0,
  overrides = null,
  rng,
  settings,
}) {
  const effect = withOverrides(settings.chargedShot, overrides);
  if (!effect.enabled) return { glow: [], puff: [] };
  const c = clamp01(charge);
  const glow = [];
  const count = Math.round(8 + c * 12);
  for (let index = 0; index < count; index += 1) {
    const direction = randUnitVector(rng);
    const color = jitterColor(effect.edgeColor, rng, 0.12);
    const size = effect.radius * lerp(0.04, 0.12, rng());
    glow.push({
      birth: now,
      extra: effect.turbulence * 0.2,
      gravity: -0.35,
      kind: BURST_KIND.ember,
      lifetime: lerp(0.18, 0.42, rng()),
      r: color[0] * effect.shellIntensity,
      g: color[1] * effect.shellIntensity,
      b: color[2] * effect.shellIntensity,
      seed: rng(),
      size0: size,
      size1: 0,
      vx: direction[0] * lerp(0.25, 1.1, rng()),
      vy: direction[1] * lerp(0.25, 1.1, rng()),
      vz: direction[2] * lerp(0.25, 1.1, rng()),
      x: at[0],
      y: at[1],
      z: at[2],
    });
  }
  return { glow, puff: [] };
}
