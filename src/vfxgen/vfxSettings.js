// Canonical settings and field metadata for the gameplay-VFX cluster
// (weapon: slash trails + impacts; magic: fireballs; movement: footstep and
// landing dust). Follows the library-wide convention: DEFAULT_VFX_SETTINGS
// holds grouped values, VFX_SETTING_GROUPS + VFX_SETTING_FIELD_SCHEMA drive
// the debug panel and the generated settings reference.
//
// Unlike ambientfx (a steady windowed atmosphere), every effect here is
// EVENT-DRIVEN: the host spawns it at a gameplay moment (a swing, a hit, a
// cast, a footfall) and it runs its lifetime out. Settings hold the LOOK of
// each effect; per-spawn options (position, direction, power, follow target)
// are runtime arguments to createVfxSystem().spawn — see vfxSystem.js.

import { resolveVfxEnergyMotionSettings } from './vfxEnergyMotion.js';

/** Effect ids in backbone kind order where applicable. */
export const VFX_EFFECT_IDS = Object.freeze([
  'slash',
  'impact',
  'fireball',
  'chargedShot',
  'footstep',
  'landing',
]);

/** Gameplay categories — the organizing axis for docs, panels, and presets. */
export const VFX_CATEGORIES = Object.freeze({
  magic: Object.freeze(['fireball', 'chargedShot']),
  movement: Object.freeze(['footstep', 'landing']),
  weapon: Object.freeze(['slash', 'impact']),
});

/** Category of an effect id ('weapon' | 'magic' | 'movement'). */
export function vfxCategoryOf(effectId) {
  for (const [category, ids] of Object.entries(VFX_CATEGORIES)) {
    if (ids.includes(effectId)) return category;
  }
  return null;
}

/**
 * Default gameplay-VFX settings. Budgets: the one-shot backbone renders in
 * two draw calls (glow + puff) regardless of how many effects are live;
 * maxParticles bounds the ring buffers, maxTrails/maxProjectiles bound the
 * pooled ribbon and projectile meshes (construction-only).
 */
export const DEFAULT_VFX_SETTINGS = Object.freeze({
  shared: Object.freeze({
    maxParticles: 4096,
    maxProjectiles: 8,
    maxLayeredProjectiles: 8,
    maxTrails: 8,
    timeScale: 1.0,
  }),
  // --- weapon ---------------------------------------------------------------
  slash: Object.freeze({
    enabled: true,
    color: Object.freeze([0.55, 0.8, 1.0]),
    coreColor: Object.freeze([1.0, 1.0, 1.0]),
    lifetime: 0.28,
    bands: 3,
    intensity: 1.0,
    sparkle: 60,
    segments: 96,
  }),
  impact: Object.freeze({
    enabled: true,
    sparkColor: Object.freeze([1.0, 0.85, 0.45]),
    flashColor: Object.freeze([1.0, 0.97, 0.88]),
    sparkCount: 26,
    sparkSpeed: 7.0,
    gravity: 18,
    flashSize: 0.9,
    spikes: 6,
    shockwave: true,
    lifetime: 0.5,
    intensity: 1.0,
  }),
  // --- magic ------------------------------------------------------------------
  fireball: Object.freeze({
    enabled: true,
    coreSize: 0.42,
    coreColor: Object.freeze([1.0, 0.95, 0.6]),
    flameColor: Object.freeze([1.0, 0.45, 0.12]),
    emberRate: 90,
    emberSize: Object.freeze([0.05, 0.12]),
    emberLifetime: 0.55,
    intensity: 1.2,
    explosionPower: 1.6,
    scorchRing: true,
    ringColor: Object.freeze([1.0, 0.55, 0.2]),
  }),
  chargedShot: Object.freeze({
    enabled: true,
    length: 1.8,
    radius: 0.46,
    coreIntensity: 2.4,
    shellIntensity: 1.35,
    filamentDensity: 1.25,
    filamentSpeed: 1.2,
    turbulence: 0.7,
    trailLength: 1.15,
    particleRate: 160,
    impactPower: 2.2,
    coreColor: Object.freeze([0.9, 0.98, 1.0]),
    edgeColor: Object.freeze([0.28, 0.62, 1.0]),
    accentColor: Object.freeze([0.55, 0.82, 1.0]),
    lightIntensity: 2.4,
    bloomContribution: 0.8,
    circulationEnabled: true,
    energyMotionTheme: 'electric-orbit',
    circulationCount: 6,
    circulationSpeed: 1.6,
    circulationDirection: 'alternating',
    circulationCoverage: 0.3,
    circulationIrregularity: 0.72,
    circulationBranching: 0.42,
    circulationThickness: 0.022,
    circulationSurfaceOffset: 1.68,
    circulationAxialWander: 0.52,
    circulationPlaneVariation: 0.78,
    circulationFlicker: 0.68,
    releaseDepth: 0.28,
    releaseIrregularity: 0.38,
    releaseLobes: 3,
  }),
  // --- movement ---------------------------------------------------------------
  footstep: Object.freeze({
    enabled: true,
    puffCount: 5,
    sizeRange: Object.freeze([0.1, 0.22]),
    color: Object.freeze([0.78, 0.72, 0.62]),
    lifetime: 0.55,
    rise: 0.5,
    spread: 0.22,
  }),
  landing: Object.freeze({
    enabled: true,
    puffCount: 14,
    ringRadius: 1.1,
    sizeRange: Object.freeze([0.18, 0.38]),
    color: Object.freeze([0.78, 0.72, 0.62]),
    lifetime: 0.7,
  }),
});

export const VFX_SETTING_GROUPS = Object.freeze([
  Object.freeze({
    id: 'shared',
    label: 'Shared',
    description: 'Budgets and global pacing for every effect. The one-shot backbone renders all bursts in two draw calls; these bound its ring buffers and the pooled trail/projectile meshes.',
  }),
  Object.freeze({
    id: 'slash',
    label: 'Slash Trail',
    category: 'weapon',
    description: 'Weapon-swing ribbon sampled from a followed blade (base + tip anchors), with a stepped toon fade and edge sparkle. The anime arc smear.',
  }),
  Object.freeze({
    id: 'impact',
    label: 'Impact Burst',
    category: 'weapon',
    description: 'Hit feedback: a radial star flash plus ballistic sparks with gravity. `power` at spawn scales count, speed, and flash size.',
  }),
  Object.freeze({
    id: 'fireball',
    label: 'Fireball',
    category: 'magic',
    description: 'Projectile: a flame-shaded core billboard shedding embers in flight; explodes into an impact burst, smoke puffs, and an expanding scorch ring.',
  }),
  Object.freeze({
    id: 'chargedShot',
    label: 'Charged Energy Shot',
    category: 'magic',
    description: 'Template-backed layered projectile: directional mesh core, animated energy shell and filaments, internal motes, boundary sparks, travel trail, local light, and impact presentation.',
  }),
  Object.freeze({
    id: 'footstep',
    label: 'Footstep Dust',
    category: 'movement',
    description: 'Small chunky dust puffs kicked up at a footfall. Cheap enough to fire every step.',
  }),
  Object.freeze({
    id: 'landing',
    label: 'Landing Ring',
    category: 'movement',
    description: 'The classic landing hit: a radial ring of dust puffs expanding outward from the touch-down point. `power` at spawn scales radius and count.',
  }),
]);

const enabledField = { label: 'Enabled', description: 'Master toggle for the effect.', type: 'boolean' };
const intensityField = {
  label: 'Intensity',
  description: 'Emissive brightness multiplier on the glow parts.',
  range: { min: 0, max: 4, step: 0.05 },
};
const lifetimeField = (max, caption) => ({
  label: 'Lifetime',
  description: caption,
  range: { min: 0.05, max, step: 0.01 },
});

const FIELD_DEFINITIONS = Object.freeze({
  shared: Object.freeze({
    maxParticles: {
      label: 'Max Particles',
      description: 'Ring-buffer capacity of the one-shot backbone (sparks, embers, puffs, rings, flashes). Oldest instances are overwritten first. Construction-only.',
      range: { min: 256, max: 32768, step: 256 },
    },
    maxProjectiles: {
      label: 'Max Projectiles',
      description: 'Pooled legacy billboard projectile cores (fireballs in flight). Spawns beyond this reuse the oldest. Construction-only.',
      range: { min: 1, max: 32, step: 1 },
    },
    maxLayeredProjectiles: {
      label: 'Max Layered Projectiles',
      description: 'Pooled template-backed layered projectile roots. Spawns beyond this reuse the oldest. Construction-only.',
      range: { min: 1, max: 32, step: 1 },
    },
    maxTrails: {
      label: 'Max Trails',
      description: 'Pooled slash-trail ribbons live at once. Spawns beyond this reuse the oldest. Construction-only.',
      range: { min: 1, max: 32, step: 1 },
    },
    timeScale: {
      label: 'Time Scale',
      description: 'Global VFX clock multiplier — hit-stop and slow-motion hooks feed this.',
      range: { min: 0, max: 2, step: 0.01 },
    },
  }),
  slash: Object.freeze({
    enabled: enabledField,
    color: { label: 'Body Color', description: 'The solid body of the arc — the flat saturated fill.', type: 'color' },
    coreColor: { label: 'Edge Band', description: 'Leading-edge band color along the blade-tip side; white body+edge banding is the reference action-RPG read.', type: 'color' },
    lifetime: lifetimeField(1.5, 'Seconds a ribbon segment persists before the tail erodes over it.'),
    bands: {
      label: 'Erosion Bands',
      description: 'Cel quantization of the tail erosion sweep — fewer bands, chunkier stepped tail.',
      range: { min: 1, max: 8, step: 1 },
    },
    intensity: intensityField,
    sparkle: {
      label: 'Sparkle Rate',
      description: 'Sparks per second shed from the blade tip while the trail is active.',
      range: { min: 0, max: 300, step: 5 },
    },
    segments: {
      label: 'Segments',
      description: 'Ribbon history capacity in spline points — longer fast swings need more. Construction-only.',
      range: { min: 8, max: 256, step: 4 },
    },
  }),
  impact: Object.freeze({
    enabled: enabledField,
    sparkColor: { label: 'Spark Color', description: 'Ballistic spark color (additive).', type: 'color' },
    flashColor: { label: 'Flash Color', description: 'Radial star-flash color at the hit point.', type: 'color' },
    sparkCount: {
      label: 'Spark Count',
      description: 'Sparks per burst at power 1; spawn `power` scales this.',
      range: { min: 0, max: 120, step: 1 },
    },
    sparkSpeed: {
      label: 'Spark Speed',
      description: 'Initial spark speed in m/s, biased along the hit normal.',
      range: { min: 0, max: 30, step: 0.5 },
    },
    gravity: {
      label: 'Gravity',
      description: 'Downward pull on sparks in m/s² — high values read as metal chips.',
      range: { min: 0, max: 60, step: 1 },
    },
    flashSize: {
      label: 'Flash Size',
      description: 'Star-flash quad size in meters at power 1.',
      range: { min: 0, max: 4, step: 0.05 },
    },
    spikes: {
      label: 'Flash Spikes',
      description: 'Point count of the star flash — 4 reads as an action-RPG glint, 6–8 as an anime hit star.',
      range: { min: 3, max: 12, step: 1 },
    },
    shockwave: {
      label: 'Shockwave Ring',
      description: 'Camera-facing expanding ring at the hit point — the action-RPG hit circle. Tinted by Flash Color.',
      type: 'boolean',
    },
    lifetime: lifetimeField(2, 'Seconds sparks live (the flash pops in about a quarter of this).'),
    intensity: intensityField,
  }),
  fireball: Object.freeze({
    enabled: enabledField,
    coreSize: {
      label: 'Core Size',
      description: 'Flame-core billboard radius in meters.',
      range: { min: 0.05, max: 2, step: 0.01 },
    },
    coreColor: { label: 'Core Color', description: 'Hot center of the flame shader.', type: 'color' },
    flameColor: { label: 'Flame Color', description: 'Outer flame licks and ember tint.', type: 'color' },
    emberRate: {
      label: 'Ember Rate',
      description: 'Embers shed per second while the projectile flies.',
      range: { min: 0, max: 400, step: 5 },
    },
    emberSize: { label: 'Ember Size', description: 'Min/max ember size in meters.', type: 'vector2' },
    emberLifetime: lifetimeField(2, 'Seconds each shed ember lives.'),
    intensity: intensityField,
    explosionPower: {
      label: 'Explosion Power',
      description: '`power` handed to the impact burst + smoke on detonation.',
      range: { min: 0, max: 5, step: 0.05 },
    },
    scorchRing: { label: 'Scorch Ring', description: 'Expanding ground ring on detonation.', type: 'boolean' },
    ringColor: { label: 'Ring Color', description: 'Scorch-ring glow color.', type: 'color' },
  }),
  chargedShot: Object.freeze({
    enabled: enabledField,
    length: {
      label: 'Length',
      description: 'Projectile length in meters at full charge.',
      range: { min: 0.6, max: 4, step: 0.01 },
    },
    radius: {
      label: 'Radius',
      description: 'Projectile radius in meters at full charge.',
      range: { min: 0.12, max: 1.2, step: 0.01 },
    },
    coreIntensity: {
      label: 'Core Intensity',
      description: 'Emission multiplier for the directional inner body.',
      range: { min: 0, max: 5, step: 0.05 },
    },
    shellIntensity: {
      label: 'Shell Intensity',
      description: 'Emission multiplier for the outer energy volume.',
      range: { min: 0, max: 4, step: 0.05 },
    },
    filamentDensity: {
      label: 'Filament Density',
      description: 'Density of animated veins across the outer shell.',
      range: { min: 0.25, max: 3, step: 0.05 },
    },
    filamentSpeed: {
      label: 'Filament Speed',
      description: 'Flow speed of shell veins and internal streaks.',
      range: { min: 0, max: 4, step: 0.05 },
    },
    circulationEnabled: {
      label: 'Circulating Energy',
      description: 'Procedural seeded energy arcs that move over the projectile volume.',
      type: 'boolean',
    },
    energyMotionTheme: {
      label: 'Energy Motion Theme',
      description: 'Authored starting theme or custom parameter set.',
      type: 'text',
    },
    circulationCount: {
      label: 'Circulation Arc Count',
      description: 'Primary surface arcs before branch forks.',
      range: { min: 1, max: 12, step: 1 },
    },
    circulationSpeed: {
      label: 'Circulation Speed',
      description: 'Cycles per authored motion unit.',
      range: { min: 0, max: 4, step: 0.01 },
    },
    circulationDirection: {
      label: 'Circulation Direction',
      description: 'Clockwise, counter-clockwise, or alternating per arc.',
      type: 'text',
    },
    circulationCoverage: {
      label: 'Arc Length',
      description: 'Fraction of a full orbit covered by each arc.',
      range: { min: 0.08, max: 1, step: 0.01 },
    },
    circulationIrregularity: {
      label: 'Arc Irregularity',
      description: 'Seeded angular and axial deviation from a uniform orbit.',
      range: { min: 0, max: 1, step: 0.01 },
    },
    circulationBranching: {
      label: 'Arc Branching',
      description: 'Frequency and reach of connected lightning forks.',
      range: { min: 0, max: 1, step: 0.01 },
    },
    circulationThickness: {
      label: 'Arc Thickness',
      description: 'Normalized width of the bright surface ribbon.',
      range: { min: 0.006, max: 0.08, step: 0.001 },
    },
    circulationSurfaceOffset: {
      label: 'Orbit Clearance',
      description: 'Visible gap between the main projectile body and the circulating lightning.',
      range: { min: 1.05, max: 2.4, step: 0.01 },
    },
    circulationAxialWander: {
      label: 'Front–Rear Wander',
      description: 'How far an arc travels between nose and tail.',
      range: { min: 0, max: 1, step: 0.01 },
    },
    circulationPlaneVariation: {
      label: '3D Plane Variation',
      description: 'Tilts arcs onto different seeded planes and adds non-planar depth wobble.',
      range: { min: 0, max: 1, step: 0.01 },
    },
    circulationFlicker: {
      label: 'Arc Reformation',
      description: 'Seeded disappearance and reformation instead of continuous uniform bands.',
      range: { min: 0, max: 1, step: 0.01 },
    },
    releaseDepth: {
      label: 'Release Ring Depth',
      description: 'Out-of-plane depth along the firing axis.',
      range: { min: 0.05, max: 0.65, step: 0.01 },
    },
    releaseIrregularity: {
      label: 'Release Ring Irregularity',
      description: 'Restrained seeded variation around the loop.',
      range: { min: 0, max: 0.75, step: 0.01 },
    },
    releaseLobes: {
      label: 'Release Ring Ripples',
      description: 'Gentle undulations around the closed loop.',
      range: { min: 2, max: 7, step: 1 },
    },
    turbulence: {
      label: 'Turbulence',
      description: 'Internal-particle motion and boundary instability.',
      range: { min: 0, max: 2, step: 0.05 },
    },
    trailLength: {
      label: 'Trail Length',
      description: 'Lifetime and visual reach of particles shed behind the projectile.',
      range: { min: 0, max: 3, step: 0.05 },
    },
    particleRate: {
      label: 'Particle Amount',
      description: 'Internal motes and boundary sparks emitted per second.',
      range: { min: 0, max: 500, step: 5 },
    },
    impactPower: {
      label: 'Impact Power',
      description: 'Presentation power of the contact flash, shockwave, sparks, and smoke.',
      range: { min: 0, max: 5, step: 0.05 },
    },
    coreColor: {
      label: 'Core Color',
      description: 'Hot inner energy color.',
      type: 'color',
    },
    edgeColor: {
      label: 'Edge Color',
      description: 'Outer shell and travel-trail color.',
      type: 'color',
    },
    accentColor: {
      label: 'Accent Color',
      description: 'Filament, compression-ring, and impact accent color.',
      type: 'color',
    },
    lightIntensity: {
      label: 'Local Light',
      description: 'Optional local point-light intensity at full charge.',
      range: { min: 0, max: 8, step: 0.1 },
    },
    bloomContribution: {
      label: 'Bloom Contribution',
      description: 'Authored bloom recommendation exposed to compatible host post stacks.',
      range: { min: 0, max: 2, step: 0.05 },
    },
  }),
  footstep: Object.freeze({
    enabled: enabledField,
    puffCount: {
      label: 'Puff Count',
      description: 'Dust puffs per footfall.',
      range: { min: 0, max: 20, step: 1 },
    },
    sizeRange: { label: 'Size Range', description: 'Min/max puff size in meters (puffs grow ~2× over life).', type: 'vector2' },
    color: { label: 'Color', description: 'Dust color — sample the ground palette.', type: 'color' },
    lifetime: lifetimeField(2, 'Seconds a puff lives.'),
    rise: {
      label: 'Rise',
      description: 'Upward drift in m/s — heavier dust settles faster.',
      range: { min: 0, max: 2, step: 0.05 },
    },
    spread: {
      label: 'Spread',
      description: 'Horizontal scatter radius in meters around the footfall.',
      range: { min: 0, max: 1, step: 0.01 },
    },
  }),
  landing: Object.freeze({
    enabled: enabledField,
    puffCount: {
      label: 'Puff Count',
      description: 'Puffs around the ring at power 1; spawn `power` scales this.',
      range: { min: 0, max: 40, step: 1 },
    },
    ringRadius: {
      label: 'Ring Radius',
      description: 'Meters the dust ring expands to at power 1.',
      range: { min: 0.2, max: 5, step: 0.05 },
    },
    sizeRange: { label: 'Size Range', description: 'Min/max puff size in meters.', type: 'vector2' },
    color: { label: 'Color', description: 'Dust color — sample the ground palette.', type: 'color' },
    lifetime: lifetimeField(2, 'Seconds the ring takes to expand and fade.'),
  }),
});

function createVfxFieldMetadata(group, key, field) {
  const defaultValue = DEFAULT_VFX_SETTINGS[group.id][key];
  return Object.freeze({
    defaultValue: Array.isArray(defaultValue) ? [...defaultValue] : defaultValue,
    description: field.description,
    group: group.id,
    id: `${group.id}.${key}`,
    key,
    label: field.label,
    optionLabels: field.optionLabels ?? null,
    options: field.options ?? null,
    range: field.range ?? null,
    serializable: true,
    type: field.type ?? (typeof defaultValue === 'boolean' ? 'boolean'
      : typeof defaultValue === 'number' ? 'number' : 'text'),
  });
}

export const VFX_SETTING_FIELD_SCHEMA = Object.freeze(
  Object.fromEntries(
    VFX_SETTING_GROUPS.map((group) => [
      group.id,
      Object.freeze(
        Object.fromEntries(
          Object.entries(FIELD_DEFINITIONS[group.id] ?? {})
            .map(([key, field]) => [key, createVfxFieldMetadata(group, key, field)]),
        ),
      ),
    ]),
  ),
);

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, cloneValue(entry)]),
  );
  return value;
}

export function cloneVfxSettings(settings = DEFAULT_VFX_SETTINGS) {
  return cloneValue(settings);
}

function clampNumber(value, fallback, min = -Infinity, max = Infinity) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

/**
 * Normalizes nested partial overrides over the defaults; unknown keys are
 * dropped, malformed values fall back. Presets resolve in
 * `createVfxSystem({ preset })` (see vfxPresets.js) — this function is the
 * plain merge/validate step.
 */
export function createVfxSettings(overrides = {}) {
  const result = cloneVfxSettings(DEFAULT_VFX_SETTINGS);
  for (const groupId of Object.keys(result)) {
    const group = overrides?.[groupId];
    if (!group || typeof group !== 'object') continue;
    for (const key of Object.keys(result[groupId])) {
      if (group[key] === undefined) continue;
      result[groupId][key] = cloneValue(group[key]);
    }
  }
  const shared = result.shared;
  shared.maxParticles = Math.round(clampNumber(shared.maxParticles, 4096, 64, 131072));
  shared.maxProjectiles = Math.round(clampNumber(shared.maxProjectiles, 8, 1, 64));
  shared.maxLayeredProjectiles = Math.round(clampNumber(shared.maxLayeredProjectiles, 8, 1, 64));
  shared.maxTrails = Math.round(clampNumber(shared.maxTrails, 8, 1, 64));
  shared.timeScale = clampNumber(shared.timeScale, 1, 0, 8);
  for (const id of VFX_EFFECT_IDS) {
    const effect = result[id];
    effect.enabled = Boolean(effect.enabled);
    if ('lifetime' in effect) effect.lifetime = clampNumber(effect.lifetime, DEFAULT_VFX_SETTINGS[id].lifetime, 0.02, 10);
    if ('intensity' in effect) effect.intensity = clampNumber(effect.intensity, 1, 0);
  }
  result.slash.segments = Math.round(clampNumber(result.slash.segments, 96, 4, 256));
  result.slash.bands = Math.round(clampNumber(result.slash.bands, 3, 1, 12));
  result.impact.spikes = Math.round(clampNumber(result.impact.spikes, 6, 3, 16));
  result.impact.sparkCount = Math.round(clampNumber(result.impact.sparkCount, 26, 0, 500));
  result.fireball.emberRate = clampNumber(result.fireball.emberRate, 90, 0, 2000);
  result.fireball.emberLifetime = clampNumber(result.fireball.emberLifetime, 0.55, 0.05, 5);
  result.chargedShot.length = clampNumber(result.chargedShot.length, 1.8, 0.1, 10);
  result.chargedShot.radius = clampNumber(result.chargedShot.radius, 0.46, 0.03, 3);
  result.chargedShot.coreIntensity = clampNumber(result.chargedShot.coreIntensity, 2.4, 0, 20);
  result.chargedShot.shellIntensity = clampNumber(result.chargedShot.shellIntensity, 1.35, 0, 20);
  result.chargedShot.filamentDensity = clampNumber(result.chargedShot.filamentDensity, 1.25, 0.05, 8);
  result.chargedShot.filamentSpeed = clampNumber(result.chargedShot.filamentSpeed, 1.2, 0, 12);
  result.chargedShot.turbulence = clampNumber(result.chargedShot.turbulence, 0.7, 0, 8);
  result.chargedShot.trailLength = clampNumber(result.chargedShot.trailLength, 1.15, 0, 8);
  result.chargedShot.particleRate = clampNumber(result.chargedShot.particleRate, 160, 0, 4000);
  result.chargedShot.impactPower = clampNumber(result.chargedShot.impactPower, 2.2, 0, 12);
  result.chargedShot.lightIntensity = clampNumber(result.chargedShot.lightIntensity, 2.4, 0, 30);
  result.chargedShot.bloomContribution = clampNumber(result.chargedShot.bloomContribution, 0.8, 0, 4);
  Object.assign(
    result.chargedShot,
    resolveVfxEnergyMotionSettings(result.chargedShot),
  );
  result.footstep.puffCount = Math.round(clampNumber(result.footstep.puffCount, 5, 0, 100));
  result.landing.puffCount = Math.round(clampNumber(result.landing.puffCount, 14, 0, 200));
  return result;
}
