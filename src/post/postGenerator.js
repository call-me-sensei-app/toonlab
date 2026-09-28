// Deterministic Post & Color style generation. Built-in families are useful
// starting domains, never a closed catalog: callers may replace/extend every
// domain leaf and register additional generator families.

import {
  createGeneratorRecipeDocument,
  deepMerge,
  parseGeneratorRecipeDocument,
  resolveGeneratorRecipe,
  serializeGeneratorRecipeDocument,
  validateGeneratorRecipeDocument,
} from '../core/generation.js';
import {
  createPostProcessingPresetDocument,
  createPostProcessingSettings,
  sanitizePostProcessingPresetSettings,
} from './postProcessing.js';

export const POST_GENERATOR_DOMAIN = 'post-processing';

const range = (min, max, step = 0.01, extra = {}) => Object.freeze({
  $type: 'range', max, min, step, ...extra,
});
const chance = (probability) => Object.freeze({ $type: 'boolean', probability });
const choice = (...options) => Object.freeze({ $type: 'choice', options });

export const DEFAULT_POST_GENERATOR_DOMAINS = Object.freeze({
  features: Object.freeze({
    bloom: chance(0.38),
    colorGrade: chance(0.78),
    depthCue: chance(0.45),
    enabled: Object.freeze({ $type: 'constant', value: true }),
    motionBlur: chance(0.18),
    screenOutline: chance(0.34),
    vignette: chance(0.72),
    verticalGrade: chance(0.28),
  }),
  parameters: Object.freeze({
    bloomBackgroundSuppress: range(0.35, 1, 0.01),
    bloomCharacterBoost: range(0.9, 2.2, 0.01),
    bloomLevels: range(3, 6, 1, { integer: true }),
    bloomMode: choice({ value: 'single', weight: 3 }, { value: 'pyramid', weight: 2 }),
    bloomRadius: range(0.04, 0.62, 0.01),
    bloomStrength: range(0.03, 0.42, 0.01, { distribution: 'normal', mean: 0.16, deviation: 0.1 }),
    bloomThreshold: range(0.72, 0.998, 0.001),
    bottomDark: range(0, 0.24, 0.01),
    contrast: range(0.88, 1.22, 0.01, { distribution: 'normal', mean: 1.04, deviation: 0.08 }),
    depthCueColor: Object.freeze({ $type: 'color', from: [0.46, 0.58, 0.76], to: [0.76, 0.88, 1] }),
    depthCueFar: range(18, 160, 1, { distribution: 'log' }),
    depthCueNear: range(0.5, 8, 0.1),
    depthCueStrength: range(0.02, 0.36, 0.01),
    exposure: range(0.82, 1.24, 0.01, { distribution: 'normal', mean: 1.04, deviation: 0.09 }),
    motionBlurStrength: range(0.08, 0.68, 0.01),
    outlineColor: Object.freeze({ $type: 'color', from: [0.015, 0.02, 0.035], to: [0.14, 0.18, 0.28], linked: true }),
    outlineDepthStrength: range(0.04, 0.72, 0.01),
    outlineLumaStrength: range(0, 0.28, 0.01),
    outlineStrength: range(0.08, 0.9, 0.01),
    saturation: range(0.78, 1.38, 0.01, { distribution: 'normal', mean: 1.12, deviation: 0.14 }),
    strength: range(0.55, 1, 0.01),
    topLight: range(0, 0.18, 0.01),
    vignetteRadius: range(0.55, 0.9, 0.01),
    vignetteSoftness: range(0.2, 0.62, 0.01),
    vignetteStrength: range(0.004, 0.16, 0.002, { distribution: 'normal', mean: 0.035, deviation: 0.03 }),
    warmth: range(-0.18, 0.28, 0.01, { distribution: 'normal', mean: 0.04, deviation: 0.1 }),
  }),
});

const FAMILY_DEFINITIONS = new Map([
  ['balanced-anime', {
    basePreset: 'softAnime',
    description: 'Vivid but restrained game-ready grades with bounded screen-space effects.',
    domains: DEFAULT_POST_GENERATOR_DOMAINS,
    label: 'Balanced Anime',
  }],
  ['dreamy', {
    basePreset: 'showcase',
    configuration: {
      features: { bloom: true, colorGrade: true, vignette: true },
      parameters: { bloomCharacterBoost: 1.5, saturation: 1.12, warmth: 0.1 },
    },
    domains: deepMerge(DEFAULT_POST_GENERATOR_DOMAINS, {
      parameters: {
        bloomRadius: range(0.28, 0.7, 0.01),
        bloomStrength: range(0.12, 0.48, 0.01),
        contrast: range(0.86, 1.08, 0.01),
      },
    }),
    label: 'Dreamy',
  }],
]);

export function registerPostGeneratorFamily(id, definition = {}, { overwrite = false } = {}) {
  const key = String(id ?? '').trim();
  if (!key) throw new Error('Post generator family id is required.');
  if (!overwrite && FAMILY_DEFINITIONS.has(key)) throw new Error(`Post generator family "${key}" already exists.`);
  FAMILY_DEFINITIONS.set(key, deepMerge(definition));
  return key;
}

export function getPostGeneratorFamilyOptions() {
  return [...FAMILY_DEFINITIONS.entries()].map(([id, definition]) => ({
    description: definition.description ?? '', id, label: definition.label ?? id,
  }));
}

export function createPostGeneratorRecipe(id = 'generated-post', definition = {}) {
  const family = FAMILY_DEFINITIONS.get(definition.family ?? 'balanced-anime') ?? {};
  return createGeneratorRecipeDocument(POST_GENERATOR_DOMAIN, id, {
    basePreset: definition.basePreset ?? family.basePreset ?? 'softAnime',
    configuration: deepMerge(family.configuration, definition.configuration),
    description: definition.description ?? '',
    domains: deepMerge(family.domains ?? DEFAULT_POST_GENERATOR_DOMAINS, definition.domains),
    label: definition.label ?? id,
    locks: definition.locks ?? [],
    seed: definition.seed ?? 1,
  });
}

export function validatePostGeneratorRecipe(input) {
  return validateGeneratorRecipeDocument(input, { domain: POST_GENERATOR_DOMAIN });
}

export function parsePostGeneratorRecipe(input) {
  return parseGeneratorRecipeDocument(input, { domain: POST_GENERATOR_DOMAIN });
}

export function serializePostGeneratorRecipe(idOrDocument, definition = {}, { pretty = true } = {}) {
  return serializeGeneratorRecipeDocument(
    POST_GENERATOR_DOMAIN,
    idOrDocument,
    definition,
    { pretty },
  );
}

function applyQualityBudget(settings, quality = 'balanced') {
  const next = createPostProcessingSettings(settings);
  if (quality === 'mobile') {
    Object.assign(next.features, { depthCue: false, motionBlur: false, screenOutline: false });
    next.parameters.bloomMode = 'single';
    next.parameters.bloomLevels = Math.min(next.parameters.bloomLevels, 3);
  } else if (quality === 'balanced') {
    next.parameters.bloomLevels = Math.min(next.parameters.bloomLevels, 5);
    // Keep at most two depth-consuming effects in the balanced tier.
    const depthFeatures = ['motionBlur', 'screenOutline', 'depthCue'].filter((key) => next.features[key]);
    for (const key of depthFeatures.slice(2)) next.features[key] = false;
  }
  return next;
}

/** Resolves a generator document into a flat runtime settings object. */
export function resolvePostGeneratorRecipe(recipeInput, { quality = 'balanced' } = {}) {
  const recipe = recipeInput?.type
    ? validatePostGeneratorRecipe(recipeInput).value
    : createPostGeneratorRecipe('generated-post', recipeInput);
  if (!recipe) throw new Error('Invalid post generator recipe.');
  const base = createPostProcessingSettings({ preset: recipe.basePreset ?? 'softAnime' });
  const settings = resolveGeneratorRecipe(recipe, {
    baseSettings: base,
    sanitizeSettings: createPostProcessingSettings,
  });
  return applyQualityBudget(settings, quality);
}

export function createGeneratedPostPresetDocument(recipeInput, {
  id = recipeInput?.id ? `${recipeInput.id}-resolved` : 'generated-post-resolved',
  label = recipeInput?.label ? `${recipeInput.label} · resolved` : 'Generated Post · resolved',
  quality = 'balanced',
} = {}) {
  const settings = resolvePostGeneratorRecipe(recipeInput, { quality });
  return createPostProcessingPresetDocument(id, {
    description: `Resolved from generator seed ${recipeInput?.seed ?? 1}.`,
    label,
    settings: sanitizePostProcessingPresetSettings(settings),
  });
}

