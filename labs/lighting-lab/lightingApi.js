// Lighting Lab integration boundary.
//
// The lab authors lighting *styles* and *fixtures* (see main.js) and drives
// everything through createLightingSystem, so presets come exclusively from
// the src/lighting registries — the old lab-side fallback preset catalogs are
// gone. What remains here is the thin recipe-normalization surface the verify
// scripts (and the ToonLab handoff) share with the lab.

import {
  createLightDescriptor,
  createLightingRecipe,
  exportLightingRecipeToToonLab,
} from '../../src/lighting/index.js';

const TYPE_DEFAULTS = Object.freeze({
  ambient: { intensity: 0.18, position: [0, 4, 0], shadow: false },
  hemisphere: { intensity: 0.45, position: [0, 8, 0], shadow: false },
  directional: { intensity: 3.2, position: [7, 12, 6], shadow: true },
  point: { intensity: 720, position: [2, 3, 2], shadow: true },
  spot: { intensity: 1100, position: [3, 6, 4], shadow: true },
  rectArea: { intensity: 460, position: [3, 4, 3], shadow: false },
  discArea: { intensity: 460, position: [3, 4, 3], shadow: false },
  tubeArea: { intensity: 460, position: [3, 4, 3], shadow: false },
});

let labLightCounter = 0;

function clone(value) {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

export function slug(value, fallback = 'lighting-style') {
  return String(value || fallback).trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || fallback;
}

function rgbArray(value, fallback = [1, 1, 1]) {
  if (Array.isArray(value) && value.length >= 3) return value.slice(0, 3).map(Number);
  if (Array.isArray(value?.rgb)) return value.rgb.slice(0, 3).map(Number);
  if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) {
    return [1, 3, 5].map((offset) => parseInt(value.slice(offset, offset + 2), 16) / 255);
  }
  return [...fallback];
}

function intensityObject(value, fallback, type) {
  const defaultUnit = type === 'directional'
    ? 'lux'
    : ['point', 'spot'].includes(type)
      ? 'lumens'
      : ['rectArea', 'discArea', 'tubeArea'].includes(type) ? 'nits' : 'unitless';
  if (value && typeof value === 'object') {
    return {
      value: Number(value.value ?? fallback),
      unit: value.unit || defaultUnit,
      artisticMultiplier: Number(value.artisticMultiplier ?? 1),
      referenceDistance: Number(value.referenceDistance ?? 1),
    };
  }
  return { value: Number(value ?? fallback), unit: defaultUnit, artisticMultiplier: 1, referenceDistance: 1 };
}

/** Builds a complete editable light descriptor with lab-friendly defaults. */
export function createLabLight(type = 'point', overrides = {}) {
  const normalizedType = TYPE_DEFAULTS[type] ? type : 'point';
  const defaults = TYPE_DEFAULTS[normalizedType];
  labLightCounter += 1;
  const base = {
    ...clone(overrides),
    id: overrides.id || `${normalizedType}-${labLightCounter}`,
    name: overrides.name || normalizedType.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase()),
    type: normalizedType,
    enabled: overrides.enabled ?? true,
    artistic: clone(overrides.artistic || {}),
    color: overrides.color === undefined
      ? { rgb: rgbArray(null, normalizedType === 'point' ? [1, 0.72, 0.38] : [1, 0.94, 0.82]) }
      : clone(overrides.color),
    intensity: intensityObject(overrides.intensity, defaults.intensity, normalizedType),
    position: clone(overrides.position || defaults.position),
    target: clone(overrides.target || [0, 1.2, 0]),
    priority: Number(overrides.priority ?? 50),
    maxDistance: Number(overrides.maxDistance ?? (normalizedType === 'directional' ? 500 : 60)),
    distance: Number(overrides.distance ?? (normalizedType === 'point' || normalizedType === 'spot' ? 24 : 0)),
    decay: Number(overrides.decay ?? 2),
    angle: Number(overrides.angle ?? Math.PI / 5),
    penumbra: Number(overrides.penumbra ?? 0.35),
    width: Number(overrides.width ?? 4),
    height: Number(overrides.height ?? 3),
    groundColor: clone(overrides.groundColor || [0.18, 0.22, 0.34]),
    ies: clone(overrides.ies ?? null),
    layers: clone(overrides.layers || [0]),
    linking: clone(overrides.linking || {}),
    tags: clone(overrides.tags || []),
    shadow: {
      enabled: overrides.shadow?.enabled ?? overrides.castShadow ?? defaults.shadow,
      priority: Number(overrides.shadow?.priority ?? overrides.priority ?? 50),
      mapSize: Number(overrides.shadow?.mapSize ?? 1024),
      bias: Number(overrides.shadow?.bias ?? -0.0003),
      normalBias: Number(overrides.shadow?.normalBias ?? 0.025),
      radius: Number(overrides.shadow?.radius ?? 1.5),
      near: Number(overrides.shadow?.near ?? 0.1),
      far: Number(overrides.shadow?.far ?? 80),
      extent: Number(overrides.shadow?.extent ?? 40),
    },
    castShadow: overrides.castShadow ?? overrides.shadow?.enabled ?? defaults.shadow,
    cookie: overrides.cookie ?? null,
    userData: clone(overrides.userData || {}),
  };
  return createLightDescriptor(normalizedType, base);
}

function normalizeLight(light, index = 0) {
  return createLabLight(light?.type, {
    ...clone(light || {}),
    id: light?.id || `light-${index + 1}`,
    name: light?.name || `Light ${index + 1}`,
  });
}

/** Normalizes arbitrary rig-shaped input into a versioned lighting recipe. */
export function normalizeRecipe(input, fallbackId = 'custom-rig') {
  let source = input?.recipe || input?.rig || input?.settings || input;
  if (source?.lighting?.lights) source = source.lighting;
  if (!source?.lights && source?.light) source = { ...source, lights: [source.light] };
  if (!source?.lights && source?.type && TYPE_DEFAULTS[source.type]) source = { lights: [source] };
  const id = slug(source?.id || fallbackId, fallbackId);
  return createLightingRecipe({
    type: 'toonlab/lighting-recipe',
    schemaVersion: 1,
    id,
    name: source?.name || source?.label || id.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
    lights: (source?.lights || []).map(normalizeLight),
    shadowPolicy: clone(source?.shadowPolicy || {
      allowedTypes: ['directional', 'point', 'spot'],
      directionalCascades: 1,
      maxShadowedLights: 8,
      maxShadowMapPixels: 16_777_216,
      mode: 'budgeted',
      updateMode: 'auto',
    }),
    metadata: clone(source?.metadata || {}),
  });
}

/** ToonLab manifest for a rig built from live descriptors (lab placements). */
export function exportToonLabManifest(recipe, options = {}) {
  const value = exportLightingRecipeToToonLab(normalizeRecipe(recipe), options);
  return JSON.stringify(value, null, 2);
}
