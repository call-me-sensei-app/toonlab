// Deterministic game-feel event recipes. Built-in events are examples, not a
// ceiling: registries can add arbitrary event ids and effect graphs, while a
// recipe embeds the complete result for portable design/runtime parity.

import {
  cloneSerializable,
  createGeneratorRecipeDocument,
  deepMerge,
  parseGeneratorRecipeDocument,
  resolveGeneratorRecipe,
  serializeGeneratorRecipeDocument,
  validateGeneratorRecipeDocument,
} from '../core/generation.js';
import { parsePresetDocument } from '../core/presetDocuments.js';

export const GAME_FEEL_GENERATOR_DOMAIN = 'game-feel';
export const GAME_FEEL_PRESET_DOCUMENT_TYPE = 'toonlab/game-feel-preset';
export const GAME_FEEL_PRESET_SCHEMA_VERSION = 1;

const range = (min, max, step, extra = {}) => ({ $type: 'range', min, max, step, ...extra });
const bool = (probability) => ({ $type: 'boolean', probability });
const choice = (options) => ({ $type: 'choice', options });
const color = (from, to) => ({ $type: 'color', from, linked: true, to });

const EVENT_DEFINITIONS = new Map();
const FAMILY_DEFINITIONS = new Map();

const BASE_EFFECTS = Object.freeze({
  audioCue: Object.freeze({ enabled: true, gain: 0.5, pitch: 1 }),
  cameraImpulse: Object.freeze({ decay: 8, duration: 0.28, enabled: true, frequency: 14, power: 0.75 }),
  haptics: Object.freeze({ duration: 0.12, enabled: true, highFrequency: 0.28, lowFrequency: 0.48 }),
  scalePunch: Object.freeze({ amount: 0.14, duration: 0.2, enabled: true }),
  screenFlash: Object.freeze({ color: [1, 0.9, 0.72], duration: 0.12, enabled: true, opacity: 0.18 }),
  timeWarp: Object.freeze({ duration: 0.1, enabled: true, hold: 0.38, scale: 0.12 }),
});

function eventDefaults(overrides = {}) {
  return deepMerge({
    cooldown: 0.035,
    enabled: true,
    intensity: 1,
    effects: BASE_EFFECTS,
  }, overrides);
}

function eventDomains(overrides = {}) {
  return deepMerge({
    cooldown: range(0.01, 0.14, 0.005, { distribution: 'log' }),
    enabled: bool(0.96),
    intensity: range(0.55, 1.5, 0.01, { distribution: 'normal', mean: 1, deviation: 0.22 }),
    effects: {
      audioCue: {
        enabled: bool(0.9),
        gain: range(0.18, 0.95, 0.01),
        pitch: range(0.72, 1.42, 0.01),
      },
      cameraImpulse: {
        decay: range(3, 16, 0.1),
        duration: range(0.08, 0.62, 0.01),
        enabled: bool(0.96),
        frequency: range(4, 28, 0.5),
        power: range(0.18, 1.8, 0.01, { distribution: 'normal', mean: 0.75, deviation: 0.38 }),
      },
      haptics: {
        duration: range(0.035, 0.38, 0.005),
        enabled: bool(0.82),
        highFrequency: range(0.04, 0.9, 0.01),
        lowFrequency: range(0.08, 1, 0.01),
      },
      scalePunch: {
        amount: range(0.03, 0.34, 0.005),
        duration: range(0.08, 0.45, 0.01),
        enabled: bool(0.9),
      },
      screenFlash: {
        color: color([0.35, 0.65, 1], [1, 0.42, 0.2]),
        duration: range(0.045, 0.35, 0.005),
        enabled: bool(0.84),
        opacity: range(0.04, 0.42, 0.01),
      },
      timeWarp: {
        duration: range(0.035, 0.28, 0.005),
        enabled: bool(0.86),
        hold: range(0.08, 0.72, 0.01),
        scale: range(0.02, 0.7, 0.01, { distribution: 'normal', mean: 0.18, deviation: 0.18 }),
      },
    },
  }, overrides);
}

/** Adds an event channel with arbitrary defaults and generator domains. */
export function registerGameFeelEventType(id, definition = {}, {
  inheritDefaultDomains = false,
  overwrite = false,
} = {}) {
  const key = String(id ?? '').trim();
  if (!key) throw new Error('Game-feel event id is required.');
  if (!overwrite && EVENT_DEFINITIONS.has(key)) throw new Error(`Game-feel event "${key}" already exists.`);
  EVENT_DEFINITIONS.set(key, {
    defaults: eventDefaults(definition.defaults),
    description: String(definition.description ?? ''),
    // Third-party event defaults remain exact unless the author explicitly
    // supplies domains. Built-ins opt into the complete continuous domain
    // tree below; extensions can opt in too without a closed event enum.
    domains: inheritDefaultDomains
      ? eventDomains(definition.domains)
      : deepMerge(definition.domains),
    label: String(definition.label || key),
  });
  return key;
}

registerGameFeelEventType('impact', {
  label: 'Impact',
  defaults: {},
}, { inheritDefaultDomains: true });
registerGameFeelEventType('damage', {
  label: 'Damage',
  defaults: {
    effects: {
      audioCue: { gain: 0.7, pitch: 0.82 },
      cameraImpulse: { duration: 0.42, power: 1.15 },
      haptics: { duration: 0.22, highFrequency: 0.35, lowFrequency: 0.72 },
      screenFlash: { color: [1, 0.18, 0.12], opacity: 0.3 },
      timeWarp: { duration: 0.16, scale: 0.08 },
    },
  },
}, { inheritDefaultDomains: true });
registerGameFeelEventType('movement', {
  label: 'Movement accent',
  defaults: {
    cooldown: 0.08,
    effects: {
      cameraImpulse: { duration: 0.18, power: 0.32 },
      haptics: { duration: 0.06, highFrequency: 0.1, lowFrequency: 0.12 },
      screenFlash: { enabled: false },
      timeWarp: { enabled: false },
    },
  },
}, { inheritDefaultDomains: true });
registerGameFeelEventType('reward', {
  label: 'Reward',
  defaults: {
    effects: {
      audioCue: { gain: 0.72, pitch: 1.24 },
      cameraImpulse: { duration: 0.35, frequency: 7, power: 0.42 },
      haptics: { duration: 0.26, highFrequency: 0.55, lowFrequency: 0.25 },
      screenFlash: { color: [1, 0.84, 0.18], duration: 0.28, opacity: 0.22 },
      timeWarp: { duration: 0.08, hold: 0.1, scale: 0.7 },
    },
  },
}, { inheritDefaultDomains: true });

function currentSettingsDefaults() {
  return {
    master: {
      intensity: 1,
      maxConcurrentEffects: 18,
      maxEffectsPerTrigger: 8,
    },
    events: Object.fromEntries(
      [...EVENT_DEFINITIONS.entries()].map(([id, definition]) => [id, definition.defaults]),
    ),
  };
}

export const DEFAULT_GAME_FEEL_SETTINGS = Object.freeze(currentSettingsDefaults());

function currentDomains() {
  return {
    master: {
      intensity: range(0.45, 1.6, 0.01, { distribution: 'normal', mean: 1, deviation: 0.24 }),
      maxConcurrentEffects: range(8, 32, 1, { integer: true }),
      maxEffectsPerTrigger: range(4, 12, 1, { integer: true }),
    },
    events: Object.fromEntries(
      [...EVENT_DEFINITIONS.entries()].map(([id, definition]) => [id, definition.domains]),
    ),
  };
}

export const DEFAULT_GAME_FEEL_GENERATOR_DOMAINS = Object.freeze(currentDomains());

FAMILY_DEFINITIONS.set('responsive', {
  description: 'Readable impact feedback with short freezes and layered sensory accents.',
  label: 'Responsive',
});
FAMILY_DEFINITIONS.set('arcade', {
  configuration: {
    master: { intensity: 1.25 },
    events: {
      impact: { effects: { scalePunch: { amount: 0.24 }, timeWarp: { scale: 0.07 } } },
    },
  },
  domains: {
    events: {
      impact: {
        effects: {
          cameraImpulse: { power: range(0.8, 2.4, 0.01) },
          screenFlash: { opacity: range(0.16, 0.5, 0.01) },
        },
      },
    },
  },
  label: 'Arcade',
});

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const finite = (value, fallback, min = -Infinity, max = Infinity) => (
  clamp(Number.isFinite(Number(value)) ? Number(value) : fallback, min, max)
);

function cleanEffect(type, source = {}) {
  const effect = cloneSerializable(source && typeof source === 'object' ? source : {});
  effect.enabled = source.enabled === undefined ? true : Boolean(source.enabled);
  if (type === 'cameraImpulse') {
    effect.decay = finite(source.decay, 8, 0.01, 100);
    effect.duration = finite(source.duration, 0.28, 0.001, 10);
    effect.frequency = finite(source.frequency, 14, 0, 200);
    effect.power = finite(source.power, 0.75, 0, 20);
  } else if (type === 'timeWarp') {
    effect.duration = finite(source.duration, 0.1, 0.001, 10);
    effect.hold = finite(source.hold, 0.38, 0, 1);
    effect.scale = finite(source.scale, 0.12, 0, 1);
  } else if (type === 'haptics') {
    effect.duration = finite(source.duration, 0.12, 0.001, 10);
    effect.highFrequency = finite(source.highFrequency, 0.28, 0, 1);
    effect.lowFrequency = finite(source.lowFrequency, 0.48, 0, 1);
  } else if (type === 'screenFlash') {
    effect.duration = finite(source.duration, 0.12, 0.001, 10);
    effect.opacity = finite(source.opacity, 0.18, 0, 1);
    effect.color = Array.isArray(source.color)
      ? source.color.slice(0, 3).map((channel) => finite(channel, 1, 0, 1))
      : [1, 0.9, 0.72];
  } else if (type === 'scalePunch') {
    effect.amount = finite(source.amount, 0.14, 0, 2);
    effect.duration = finite(source.duration, 0.2, 0.001, 10);
  } else if (type === 'audioCue') {
    effect.gain = finite(source.gain, 0.5, 0, 4);
    effect.pitch = finite(source.pitch, 1, 0.05, 8);
  }
  return effect;
}

/** Preserves custom event/effect ids while normalizing known runtime fields. */
export function sanitizeGameFeelSettings(input = {}) {
  const source = deepMerge(currentSettingsDefaults(), input);
  const events = {};
  for (const [id, value] of Object.entries(source.events ?? {})) {
    const event = value && typeof value === 'object' ? value : {};
    events[id] = {
      cooldown: finite(event.cooldown, 0.035, 0, 60),
      enabled: event.enabled === undefined ? true : Boolean(event.enabled),
      intensity: finite(event.intensity, 1, 0, 10),
      effects: Object.fromEntries(Object.entries(event.effects ?? {}).map(
        ([type, effect]) => [type, cleanEffect(type, effect)],
      )),
    };
  }
  return {
    master: {
      intensity: finite(source.master?.intensity, 1, 0, 10),
      maxConcurrentEffects: Math.round(finite(source.master?.maxConcurrentEffects, 18, 1, 256)),
      maxEffectsPerTrigger: Math.round(finite(source.master?.maxEffectsPerTrigger, 8, 1, 64)),
    },
    events,
  };
}

export function registerGameFeelGeneratorFamily(id, definition = {}, { overwrite = false } = {}) {
  const key = String(id ?? '').trim();
  if (!key) throw new Error('Game-feel family id is required.');
  if (!overwrite && FAMILY_DEFINITIONS.has(key)) throw new Error(`Game-feel family "${key}" already exists.`);
  FAMILY_DEFINITIONS.set(key, deepMerge(definition));
  return key;
}

export function getGameFeelGeneratorFamilyOptions() {
  return [...FAMILY_DEFINITIONS.entries()].map(([id, definition]) => ({
    description: definition.description ?? '', id, label: definition.label ?? id,
  }));
}

export function getGameFeelEventOptions() {
  return [...EVENT_DEFINITIONS.entries()].map(([id, definition]) => ({
    description: definition.description, id, label: definition.label,
  }));
}

export function createGameFeelGeneratorRecipe(id = 'generated-game-feel', definition = {}) {
  const family = FAMILY_DEFINITIONS.get(definition.family ?? 'responsive') ?? {};
  return createGeneratorRecipeDocument(GAME_FEEL_GENERATOR_DOMAIN, id, {
    // Capture current registry defaults in the portable recipe. This is
    // essential for event types registered after module initialization,
    // especially custom effects that have no generator domain of their own.
    configuration: deepMerge(currentSettingsDefaults(), family.configuration, definition.configuration),
    description: definition.description ?? '',
    domains: deepMerge(currentDomains(), family.domains, definition.domains),
    label: definition.label ?? id,
    locks: definition.locks ?? [],
    seed: definition.seed ?? 1,
  });
}

export function validateGameFeelGeneratorRecipe(input) {
  return validateGeneratorRecipeDocument(input, { domain: GAME_FEEL_GENERATOR_DOMAIN });
}

export function parseGameFeelGeneratorRecipe(input) {
  return parseGeneratorRecipeDocument(input, { domain: GAME_FEEL_GENERATOR_DOMAIN });
}

export function serializeGameFeelGeneratorRecipe(idOrDocument, definition = {}, { pretty = true } = {}) {
  return serializeGeneratorRecipeDocument(GAME_FEEL_GENERATOR_DOMAIN, idOrDocument, definition, { pretty });
}

const QUALITY_BUDGETS = Object.freeze({
  mobile: { concurrent: 8, perTrigger: 5 },
  balanced: { concurrent: 18, perTrigger: 8 },
  cinematic: { concurrent: 32, perTrigger: 12 },
});

export function applyGameFeelQualityBudget(input, quality = 'balanced') {
  const settings = sanitizeGameFeelSettings(input);
  const budget = QUALITY_BUDGETS[quality] ?? QUALITY_BUDGETS.balanced;
  settings.master.maxConcurrentEffects = Math.min(settings.master.maxConcurrentEffects, budget.concurrent);
  settings.master.maxEffectsPerTrigger = Math.min(settings.master.maxEffectsPerTrigger, budget.perTrigger);
  settings.runtime = { quality: QUALITY_BUDGETS[quality] ? quality : 'balanced' };
  return settings;
}

export function resolveGameFeelGeneratorRecipe(recipeInput, { quality = 'balanced' } = {}) {
  const validation = recipeInput?.type
    ? validateGameFeelGeneratorRecipe(recipeInput)
    : { ok: true, value: createGameFeelGeneratorRecipe('generated-game-feel', recipeInput) };
  if (!validation.ok) throw new Error(validation.errors.join(' '));
  const settings = resolveGeneratorRecipe(validation.value, {
    baseSettings: currentSettingsDefaults(),
    sanitizeSettings: sanitizeGameFeelSettings,
  });
  return applyGameFeelQualityBudget(settings, quality);
}

export function createGeneratedGameFeelPresetDocument(recipeInput, options = {}) {
  const document = {
    description: `Resolved from generator seed ${recipeInput?.seed ?? 1}.`,
    id: options.id ?? `${recipeInput?.id ?? 'generated-game-feel'}-resolved`,
    label: options.label ?? `${recipeInput?.label ?? 'Generated Game Feel'} · resolved`,
    settings: resolveGameFeelGeneratorRecipe(recipeInput, { quality: options.quality }),
    type: GAME_FEEL_PRESET_DOCUMENT_TYPE,
    version: GAME_FEEL_PRESET_SCHEMA_VERSION,
  };
  const result = validateGameFeelPresetDocument(document);
  if (!result.ok) throw new Error(result.errors.join(' '));
  return result.value;
}

function normalizeDocumentId(value) {
  return String(value ?? '').trim().replace(/[^a-zA-Z0-9._/-]+/g, '_');
}

/** Validates the flat, runtime-ready counterpart to a generator recipe. */
export function validateGameFeelPresetDocument(input) {
  const errors = [];
  const warnings = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { errors: ['Game-feel preset must be a JSON object.'], ok: false, value: null, warnings };
  }
  if (input.type !== GAME_FEEL_PRESET_DOCUMENT_TYPE) {
    errors.push(`Game-feel preset type must be "${GAME_FEEL_PRESET_DOCUMENT_TYPE}".`);
  }
  const version = Number(input.version ?? 1);
  if (!Number.isInteger(version) || version < 1) errors.push('Game-feel preset version must be a positive integer.');
  if (version > GAME_FEEL_PRESET_SCHEMA_VERSION) {
    errors.push(`Game-feel preset version ${version} is newer than supported version ${GAME_FEEL_PRESET_SCHEMA_VERSION}.`);
  }
  const id = normalizeDocumentId(input.id);
  if (!id) errors.push('Game-feel preset id is required.');
  return {
    errors,
    ok: errors.length === 0,
    value: errors.length > 0 ? null : {
      description: String(input.description ?? ''),
      id,
      label: String(input.label || id),
      settings: sanitizeGameFeelSettings(input.settings),
      type: GAME_FEEL_PRESET_DOCUMENT_TYPE,
      version: GAME_FEEL_PRESET_SCHEMA_VERSION,
    },
    warnings,
  };
}

export function parseGameFeelPresetDocument(input) {
  return parsePresetDocument(input, validateGameFeelPresetDocument, { invalidJsonLabel: 'game-feel preset' });
}

export function serializeGameFeelPresetDocument(input, { pretty = true } = {}) {
  const result = validateGameFeelPresetDocument(input);
  if (!result.ok) throw new Error(result.errors.join(' '));
  return JSON.stringify(result.value, null, pretty ? 2 : 0);
}
