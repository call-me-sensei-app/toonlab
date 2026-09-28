// Reusable light fixtures — the game's lighting vocabulary.
//
// A fixture defines one *kind* of practical light ("street lamp", "paper
// lantern") once: a base light descriptor, seeded variation domains so many
// placements feel hand-tuned rather than cloned, flicker behavior, and a
// day/night schedule. Scenes then reference fixtures by id and position;
// resolveFixturePlacement turns (fixture, seed) into a concrete descriptor
// deterministically, so the same placement renders identically in a lab,
// through MCP, and in a shipped game.

import {
  cloneSerializable,
  createSeededRandom,
  deepMerge,
  deriveSeed,
  generateDomainValues,
  hashSeed,
  validateGeneratorDomains,
} from '../core/generation.js';
import {
  createSettingsPresetDocument,
  parsePresetDocument,
  serializePresetDocument,
  validateSettingsPresetDocument,
} from '../core/presetDocuments.js';
import { colorTemperatureToRgb } from './colorIntensity.js';
import { createLightDescriptor } from './lightDescriptors.js';
import { clamp, cloneJson, finite, isPlainObject, slug } from './utils.js';

export const LIGHT_FIXTURE_DOCUMENT_TYPE = 'toonlab/light-fixture';
export const LIGHT_FIXTURE_SCHEMA_VERSION = 1;

export const FIXTURE_SCHEDULE_MODES = Object.freeze(['always', 'night', 'day']);

/** Only a base light-type change forces recreating placed lights. */
export const LIGHT_FIXTURE_APPLY_METADATA = Object.freeze({ '*': 'hot', 'base.type': 'rebuild' });

function normalizeFlicker(source = {}) {
  const input = isPlainObject(source) ? source : {};
  return {
    amount: clamp(finite(input.amount, 0), 0, 1),
    speed: clamp(finite(input.speed, 6), 0.05, 60),
  };
}

function normalizeSchedule(source = {}) {
  const input = isPlainObject(source) ? source : {};
  return {
    minimum: clamp(finite(input.minimum, 0), 0, 1),
    mode: FIXTURE_SCHEDULE_MODES.includes(input.mode) ? input.mode : 'night',
  };
}

/** Normalizes fixture settings; `variation` keeps the shared domain grammar. */
export function createLightFixtureSettings(source = {}) {
  const input = isPlainObject(source) ? source : {};
  const variation = isPlainObject(input.variation) ? cloneSerializable(input.variation) : {};
  const domainCheck = validateGeneratorDomains(variation);
  if (!domainCheck.ok) {
    throw new Error(`Invalid fixture variation domains: ${domainCheck.errors.join(' ')}`);
  }
  const emissive = isPlainObject(input.emissive) ? input.emissive : {};
  return {
    // Kept as an authoring partial (not a full descriptor) so unset fields
    // keep tracking descriptor defaults; placements run createLightDescriptor.
    base: isPlainObject(input.base) ? cloneSerializable(input.base) : { type: 'point' },
    category: String(input.category ?? 'practical'),
    emissive: {
      meshPattern: emissive.meshPattern ? String(emissive.meshPattern) : null,
      scale: clamp(finite(emissive.scale, 1), 0, 8),
    },
    flicker: normalizeFlicker(input.flicker),
    schedule: normalizeSchedule(input.schedule),
    variation,
  };
}

export const sanitizeLightFixtureSettings = createLightFixtureSettings;

/**
 * Applies sampled variation onto a fixture's base descriptor source.
 * `kelvin` is a first-class variation key: it resolves through the shared
 * black-body fit into `color`, so warmth can vary as one number.
 */
function applyVariation(base, sampled) {
  const variation = isPlainObject(sampled) ? { ...sampled } : {};
  if (variation.kelvin !== undefined) {
    variation.color = colorTemperatureToRgb(variation.kelvin);
    delete variation.kelvin;
  }
  if (variation.intensityScale !== undefined) {
    const scale = Math.max(finite(variation.intensityScale, 1), 0);
    const intensity = isPlainObject(base.intensity) ? { ...base.intensity } : { value: finite(base.intensity, 1) };
    intensity.artisticMultiplier = Math.max(finite(intensity.artisticMultiplier, 1), 0) * scale;
    variation.intensity = intensity;
    delete variation.intensityScale;
  }
  return deepMerge(base, variation);
}

/**
 * Deterministically resolves one placement of a fixture into a complete
 * light descriptor plus runtime hints (flicker phase, schedule).
 */
export function resolveFixturePlacement(fixtureSettings, {
  id = null,
  overrides = null,
  position = null,
  seed = 1,
  target = null,
} = {}) {
  const fixture = createLightFixtureSettings(fixtureSettings);
  const placementSeed = hashSeed(seed);
  const sampled = generateDomainValues(fixture.variation, { seed: placementSeed });
  let descriptorSource = applyVariation(fixture.base, sampled);
  if (isPlainObject(overrides)) descriptorSource = deepMerge(descriptorSource, overrides);
  if (Array.isArray(position)) descriptorSource.position = position.slice(0, 3).map((value) => finite(value, 0));
  if (Array.isArray(target)) descriptorSource.target = target.slice(0, 3).map((value) => finite(value, 0));
  if (id) descriptorSource.id = String(id);
  const descriptor = createLightDescriptor(descriptorSource);
  return {
    descriptor,
    flicker: fixture.flicker,
    // Deterministic per-placement phase so synchronized flicker never happens.
    flickerPhase: createSeededRandom(deriveSeed(placementSeed, 'flicker')).float(0, Math.PI * 2),
    schedule: fixture.schedule,
    seed: placementSeed,
  };
}

// ---------------------------------------------------------------------------
// Registry — starting vocabulary, never a boundary.

const FIXTURE_PRESETS = new Map();

export function registerLightFixture(id, definition = {}, { overwrite = false } = {}) {
  const key = slug(id, 'fixture');
  if (!overwrite && FIXTURE_PRESETS.has(key)) {
    throw new Error(`Light fixture "${key}" already exists. Pass { overwrite: true } to replace it.`);
  }
  const source = isPlainObject(definition) ? definition : {};
  FIXTURE_PRESETS.set(key, {
    description: String(source.description ?? ''),
    label: String(source.label ?? source.name ?? key),
    settings: createLightFixtureSettings(source.settings ?? source),
  });
  return key;
}

export function getLightFixtureOptions() {
  return [...FIXTURE_PRESETS.entries()].map(([id, entry]) => ({
    category: entry.settings.category, description: entry.description, id, label: entry.label,
  }));
}

export function resolveLightFixture(value) {
  if (typeof value === 'string') {
    const entry = FIXTURE_PRESETS.get(value) ?? FIXTURE_PRESETS.get(slug(value, 'fixture'));
    if (!entry) {
      throw new Error(`Unknown light fixture "${value}". Registered: ${[...FIXTURE_PRESETS.keys()].join(', ')}.`);
    }
    return cloneJson(entry.settings);
  }
  if (isPlainObject(value) && value.type === LIGHT_FIXTURE_DOCUMENT_TYPE) {
    return createLightFixtureSettings(value.settings);
  }
  return createLightFixtureSettings(value);
}

// ---------------------------------------------------------------------------
// Versioned documents (shared core envelope).

function migrateFixtureDocument(input) {
  return {
    ...input,
    id: input.id ?? input.name,
    label: input.label ?? input.title ?? input.name,
    settings: input.settings ?? input.fixture ?? {},
    type: LIGHT_FIXTURE_DOCUMENT_TYPE,
    version: Number(input.version ?? input.schemaVersion ?? 1),
  };
}

export function validateLightFixtureDocument(input) {
  return validateSettingsPresetDocument(input, {
    documentType: LIGHT_FIXTURE_DOCUMENT_TYPE,
    migrateDocument: migrateFixtureDocument,
    normalizeId: (value) => slug(value, ''),
    sanitizeSettings: createLightFixtureSettings,
    schemaVersion: LIGHT_FIXTURE_SCHEMA_VERSION,
  });
}

export function createLightFixtureDocument(id, definition = {}) {
  return createSettingsPresetDocument(id, definition, {
    collectSettings: (source) => createLightFixtureSettings(source.settings ?? source),
    documentType: LIGHT_FIXTURE_DOCUMENT_TYPE,
    schemaVersion: LIGHT_FIXTURE_SCHEMA_VERSION,
    validateDocument: validateLightFixtureDocument,
  });
}

export function parseLightFixtureDocument(input) {
  return parsePresetDocument(input, validateLightFixtureDocument, {
    invalidJsonLabel: 'light fixture',
  });
}

export function serializeLightFixtureDocument(idOrDocument, definition = {}, { pretty = true } = {}) {
  return serializePresetDocument(idOrDocument, definition, {
    createDocument: createLightFixtureDocument,
    pretty,
  });
}

export function registerLightFixtureDocument(document, { overwrite = true } = {}) {
  const result = validateLightFixtureDocument(document);
  if (!result.ok) throw new Error(result.errors.join(' '));
  return registerLightFixture(result.value.id, {
    description: result.value.description,
    label: result.value.label,
    settings: result.value.settings,
  }, { overwrite });
}

// ---------------------------------------------------------------------------
// Built-in vocabulary.

const range = (min, max, step = 0.01) => ({ $type: 'range', max, min, step });

registerLightFixture('street-lamp', {
  description: 'Warm sodium pole lamp with a wide soft pool and slight per-lamp warmth drift.',
  label: 'Street Lamp',
  settings: {
    base: {
      castShadow: false,
      decay: 2,
      distance: 14,
      intensity: { unit: 'lumens', value: 900 },
      position: [0, 4.2, 0],
      type: 'point',
    },
    category: 'architectural',
    emissive: { meshPattern: 'lamp', scale: 1 },
    flicker: { amount: 0.03, speed: 8 },
    schedule: { mode: 'night' },
    variation: {
      intensityScale: range(0.85, 1.15),
      kelvin: range(1900, 2400, 10),
    },
  },
});

registerLightFixture('paper-lantern', {
  description: 'Small warm lantern with gentle candle flicker; hangs low, fades in at dusk.',
  label: 'Paper Lantern',
  settings: {
    base: {
      decay: 2,
      distance: 7,
      intensity: { unit: 'lumens', value: 260 },
      position: [0, 2.2, 0],
      type: 'point',
    },
    category: 'practical',
    emissive: { meshPattern: 'lantern', scale: 1.2 },
    flicker: { amount: 0.12, speed: 5 },
    schedule: { mode: 'night' },
    variation: {
      distance: range(6, 9, 0.1),
      intensityScale: range(0.75, 1.25),
      kelvin: range(1700, 2200, 10),
    },
  },
});

registerLightFixture('window-glow', {
  description: 'Interior spill through a window; rect-area softbox, appears at night.',
  label: 'Window Glow',
  settings: {
    base: {
      height: 1.4,
      intensity: { unit: 'nits', value: 9 },
      position: [0, 1.8, 0],
      type: 'rectArea',
      width: 1.1,
    },
    category: 'architectural',
    schedule: { mode: 'night', minimum: 0.05 },
    variation: {
      intensityScale: range(0.7, 1.3),
      kelvin: range(2300, 3600, 25),
    },
  },
});

registerLightFixture('neon-sign', {
  description: 'Saturated tube glow with electrical stutter; picks a hue per placement.',
  label: 'Neon Sign',
  settings: {
    base: {
      height: 0.18,
      intensity: { unit: 'nits', value: 22 },
      position: [0, 2.6, 0],
      type: 'tubeArea',
      width: 1.6,
    },
    category: 'signage',
    flicker: { amount: 0.22, speed: 24 },
    schedule: { mode: 'night', minimum: 0.35 },
    variation: {
      color: {
        $type: 'choice',
        options: [
          { value: [1, 0.18, 0.5], weight: 3 },
          { value: [0.2, 0.85, 1], weight: 3 },
          { value: [0.62, 0.3, 1], weight: 2 },
          { value: [0.25, 1, 0.6], weight: 2 },
          { value: [1, 0.62, 0.12], weight: 1 },
        ],
      },
      intensityScale: range(0.8, 1.3),
    },
  },
});

registerLightFixture('campfire', {
  description: 'Strong warm flame with heavy organic flicker; always lit.',
  label: 'Campfire',
  settings: {
    base: {
      castShadow: true,
      decay: 2,
      distance: 12,
      intensity: { unit: 'lumens', value: 1500 },
      position: [0, 0.7, 0],
      shadow: { enabled: true, mapSize: 512 },
      type: 'point',
    },
    category: 'effect',
    flicker: { amount: 0.35, speed: 11 },
    schedule: { mode: 'always' },
    variation: {
      intensityScale: range(0.9, 1.1),
      kelvin: range(1500, 2000, 10),
    },
  },
});

registerLightFixture('cms-lantern', {
  description: 'Call Me Sensei signature lantern: saturated amber glow with a wide halo, tuned to read against vivid blue nights.',
  label: 'CMS Lantern',
  settings: {
    base: {
      decay: 2,
      distance: 10,
      intensity: { unit: 'lumens', value: 420 },
      position: [0, 2.4, 0],
      type: 'point',
    },
    category: 'practical',
    emissive: { meshPattern: 'lantern', scale: 1.5 },
    flicker: { amount: 0.09, speed: 5 },
    schedule: { mode: 'night', minimum: 0.08 },
    variation: {
      distance: range(8.5, 12, 0.1),
      intensityScale: range(0.85, 1.3),
      kelvin: range(1850, 2150, 10),
    },
  },
});

registerLightFixture('cms-city-neon', {
  description: 'Call Me Sensei city signage: acid ZZZ-palette tube glow with confident stutter for night streets.',
  label: 'CMS City Neon',
  settings: {
    base: {
      height: 0.2,
      intensity: { unit: 'nits', value: 30 },
      position: [0, 3, 0],
      type: 'tubeArea',
      width: 1.8,
    },
    category: 'signage',
    flicker: { amount: 0.18, speed: 26 },
    schedule: { mode: 'night', minimum: 0.45 },
    variation: {
      color: {
        $type: 'choice',
        options: [
          { value: [1, 0.12, 0.55], weight: 3 },
          { value: [0.1, 0.9, 1], weight: 3 },
          { value: [0.75, 0.25, 1], weight: 2 },
          { value: [1, 0.85, 0.1], weight: 2 },
          { value: [0.2, 1, 0.5], weight: 1 },
        ],
      },
      intensityScale: range(0.9, 1.45),
      width: range(1.2, 2.6, 0.1),
    },
  },
});

registerLightFixture('cms-street-lamp', {
  description: 'Call Me Sensei street lamp: brighter, warmer pole light with a saturated pool for vivid night streets.',
  label: 'CMS Street Lamp',
  settings: {
    base: {
      castShadow: false,
      decay: 2,
      distance: 17,
      intensity: { unit: 'lumens', value: 1250 },
      position: [0, 4.6, 0],
      type: 'point',
    },
    category: 'architectural',
    emissive: { meshPattern: 'lamp', scale: 1.3 },
    flicker: { amount: 0.02, speed: 9 },
    schedule: { mode: 'night' },
    variation: {
      intensityScale: range(0.9, 1.2),
      kelvin: range(2000, 2500, 10),
    },
  },
});

registerLightFixture('shrine-candle', {
  description: 'Tiny devotional flame; near-pure candlelight with soft flicker.',
  label: 'Shrine Candle',
  settings: {
    base: {
      decay: 2,
      distance: 3.5,
      intensity: { unit: 'lumens', value: 90 },
      position: [0, 0.9, 0],
      type: 'point',
    },
    category: 'practical',
    flicker: { amount: 0.2, speed: 7 },
    schedule: { mode: 'always' },
    variation: {
      intensityScale: range(0.7, 1.2),
      kelvin: range(1550, 1900, 10),
    },
  },
});
