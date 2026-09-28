import {
  createGeneratorRecipeDocument,
  deepMerge,
  parseGeneratorRecipeDocument,
  resolveGeneratorRecipe,
  serializeGeneratorRecipeDocument,
  validateGeneratorRecipeDocument,
} from '../core/generation.js';
import {
  createSoundscapePresetDocument,
  createSoundscapeSettings,
  sanitizeSoundscapeSettings,
} from './soundscapeSettings.js';

export const SOUNDSCAPE_GENERATOR_DOMAIN = 'soundscape';

const range = (min, max, step = 0.01, extra = {}) => Object.freeze({ $type: 'range', max, min, step, ...extra });
const chance = (probability) => Object.freeze({ $type: 'boolean', probability });
const choice = (...options) => Object.freeze({ $type: 'choice', options });

export const DEFAULT_SOUNDSCAPE_GENERATOR_DOMAINS = Object.freeze({
  adaptive: Object.freeze({
    smoothing: range(0.08, 1.4, 0.01, { distribution: 'log' }),
    values: Object.freeze({
      intensity: range(0.15, 0.78, 0.01),
      tension: range(0, 0.42, 0.01),
      weather: range(0, 0.72, 0.01),
    }),
  }),
  buses: Object.freeze({
    ambience: Object.freeze({ gain: range(0.52, 1.05, 0.01) }),
    detail: Object.freeze({ gain: range(0.24, 0.92, 0.01) }),
    music: Object.freeze({ gain: range(0.12, 0.72, 0.01) }),
  }),
  layers: Object.freeze({
    air: Object.freeze({
      enabled: chance(0.96),
      gain: range(0.12, 0.46, 0.005, { distribution: 'normal', mean: 0.26, deviation: 0.08 }),
      pan: range(-0.32, 0.22, 0.01),
      params: Object.freeze({
        color: choice({ value: 'brown', weight: 3 }, { value: 'pink', weight: 2 }, 'white'),
        highpass: range(38, 220, 1, { distribution: 'log' }),
        lowpass: range(1200, 5200, 10, { distribution: 'log' }),
        movement: range(0.03, 0.48, 0.01),
      }),
    }),
    drone: Object.freeze({
      enabled: chance(0.78),
      gain: range(0.015, 0.18, 0.002, { distribution: 'normal', mean: 0.07, deviation: 0.045 }),
      pan: range(-0.26, 0.26, 0.01),
      params: Object.freeze({
        detune: range(-18, 18, 1),
        frequency: range(48, 196, 0.1, { distribution: 'log' }),
        movement: range(0, 0.24, 0.01),
        waveform: choice({ value: 'sine', weight: 4 }, { value: 'triangle', weight: 2 }, 'sawtooth'),
      }),
    }),
    rustle: Object.freeze({
      enabled: chance(0.82),
      gain: range(0.025, 0.26, 0.005),
      pan: range(-0.64, 0.64, 0.01),
      params: Object.freeze({
        color: choice('pink', 'white', { value: 'brown', weight: 0.5 }),
        highpass: range(420, 2400, 10, { distribution: 'log' }),
        lowpass: range(2800, 11000, 10, { distribution: 'log' }),
        movement: range(0.16, 1.1, 0.01),
      }),
    }),
    wildlife: Object.freeze({
      enabled: chance(0.9),
      gain: range(0.035, 0.28, 0.005),
      pan: range(-0.78, 0.78, 0.01),
      params: Object.freeze({
        density: range(0.035, 0.72, 0.005, { distribution: 'log' }),
        duration: range(0.055, 0.48, 0.005),
        frequency: range(680, 4200, 1, { distribution: 'log' }),
        pitchSpread: range(0.05, 0.72, 0.01),
        waveform: choice({ value: 'sine', weight: 3 }, 'triangle', 'square'),
      }),
      voiceLimit: range(2, 8, 1, { integer: true }),
    }),
  }),
  master: Object.freeze({
    gain: range(0.45, 0.92, 0.01, { distribution: 'normal', mean: 0.69, deviation: 0.1 }),
    limiter: chance(0.94),
    transitionSeconds: range(0.35, 4.8, 0.05, { distribution: 'log' }),
  }),
  transport: Object.freeze({ bpm: range(54, 142, 1, { integer: true }) }),
});

const FAMILIES = new Map([
  ['living-landscape', {
    basePreset: 'living-landscape',
    description: 'Layered procedural air, foliage, wildlife and subtle tonal movement.',
    domains: DEFAULT_SOUNDSCAPE_GENERATOR_DOMAINS,
    label: 'Living Landscape',
  }],
  ['quiet-focus', {
    basePreset: 'minimal-focus',
    description: 'Sparse low-distraction beds for dialogue, building and exploration.',
    domains: deepMerge(DEFAULT_SOUNDSCAPE_GENERATOR_DOMAINS, {
      buses: { detail: { gain: range(0.08, 0.46, 0.01) }, music: { gain: range(0.04, 0.32, 0.01) } },
      layers: {
        drone: { gain: range(0.008, 0.07, 0.001) },
        rustle: { enabled: chance(0.28) },
        wildlife: { gain: range(0.008, 0.09, 0.002), params: { density: range(0.01, 0.18, 0.005) } },
      },
    }),
    label: 'Quiet Focus',
  }],
]);

export function registerSoundscapeGeneratorFamily(id, definition = {}, { overwrite = false } = {}) {
  const key = String(id ?? '').trim();
  if (!key) throw new Error('Soundscape generator family id is required.');
  if (!overwrite && FAMILIES.has(key)) throw new Error(`Soundscape generator family "${key}" already exists.`);
  FAMILIES.set(key, deepMerge(definition));
  return key;
}

export function getSoundscapeGeneratorFamilyOptions() {
  return [...FAMILIES.entries()].map(([id, definition]) => ({
    description: definition.description ?? '', id, label: definition.label ?? id,
  }));
}

export function createSoundscapeGeneratorRecipe(id = 'generated-soundscape', definition = {}) {
  const family = FAMILIES.get(definition.family ?? 'living-landscape') ?? {};
  const basePreset = definition.basePreset ?? family.basePreset ?? 'living-landscape';
  const baseSettings = createSoundscapeSettings({ preset: basePreset });
  return createGeneratorRecipeDocument(SOUNDSCAPE_GENERATOR_DOMAIN, id, {
    basePreset,
    configuration: deepMerge(baseSettings, family.configuration, definition.configuration),
    description: definition.description ?? family.description ?? '',
    domains: deepMerge(family.domains ?? DEFAULT_SOUNDSCAPE_GENERATOR_DOMAINS, definition.domains),
    label: definition.label ?? id,
    locks: definition.locks ?? [],
    seed: definition.seed ?? 1,
  });
}

export function validateSoundscapeGeneratorRecipe(input) {
  return validateGeneratorRecipeDocument(input, { domain: SOUNDSCAPE_GENERATOR_DOMAIN });
}

export function parseSoundscapeGeneratorRecipe(input) {
  return parseGeneratorRecipeDocument(input, { domain: SOUNDSCAPE_GENERATOR_DOMAIN });
}

export function serializeSoundscapeGeneratorRecipe(idOrDocument, definition = {}, { pretty = true } = {}) {
  return serializeGeneratorRecipeDocument(SOUNDSCAPE_GENERATOR_DOMAIN, idOrDocument, definition, { pretty });
}

export function resolveSoundscapeGeneratorRecipe(recipeInput, { budget, quality = 'balanced' } = {}) {
  const recipe = recipeInput?.type
    ? validateSoundscapeGeneratorRecipe(recipeInput).value
    : createSoundscapeGeneratorRecipe('generated-soundscape', recipeInput);
  if (!recipe) throw new Error('Invalid soundscape generator recipe.');
  const baseSettings = recipe.basePreset == null
    ? sanitizeSoundscapeSettings({})
    : createSoundscapeSettings({ preset: recipe.basePreset });
  return resolveGeneratorRecipe(recipe, {
    baseSettings,
    sanitizeSettings: (settings) => sanitizeSoundscapeSettings(settings, { budget, quality }),
  });
}

export function createGeneratedSoundscapePresetDocument(recipeInput, {
  budget,
  id = recipeInput?.id ? `${recipeInput.id}-resolved` : 'generated-soundscape-resolved',
  label = recipeInput?.label ? `${recipeInput.label} · resolved` : 'Generated Soundscape · resolved',
  quality = 'balanced',
} = {}) {
  return createSoundscapePresetDocument(id, {
    description: `Resolved from generator seed ${recipeInput?.seed ?? 1}.`,
    label,
    settings: resolveSoundscapeGeneratorRecipe(recipeInput, { budget, quality }),
  });
}
