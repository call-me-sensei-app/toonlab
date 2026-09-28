// Deterministic lighting generation on the shared recipe grammar.
//
// Two generator domains ship here:
//  - 'lighting-style'  → samples a coherent day-cycle palette (sun kelvins,
//    intensities, fog colors, ambient/exposure philosophy, schedule) and
//    builds a complete lighting-style settings object from it.
//  - 'light-fixture'   → samples one fixture kind (emission, behavior) plus
//    the *spreads* used for its per-placement variation domains, so a single
//    seed yields a fixture that itself yields endless placement variety.
//
// Families are starting points, never a closed catalog: register new ones or
// override any domain leaf per recipe.

import {
  createGeneratorRecipeDocument,
  deepMerge,
  parseGeneratorRecipeDocument,
  resolveGeneratorRecipe,
  serializeGeneratorRecipeDocument,
  validateGeneratorRecipeDocument,
} from '../core/generation.js';
import {
  createLightFixtureDocument,
  createLightFixtureSettings,
} from './lightingFixtures.js';
import {
  createLightingStylePresetDocument,
  createLightingStyleSettings,
} from './lightingStyle.js';
import { clamp, finite, isPlainObject } from './utils.js';

export const LIGHTING_STYLE_GENERATOR_DOMAIN = 'lighting-style';
export const LIGHT_FIXTURE_GENERATOR_DOMAIN = 'light-fixture';

const range = (min, max, step = 0.01, extra = {}) => Object.freeze({
  $type: 'range', max, min, step, ...extra,
});
const choice = (...options) => Object.freeze({ $type: 'choice', options });
const color = (from, to) => Object.freeze({ $type: 'color', from, to });

// ---------------------------------------------------------------------------
// Style generation.

export const DEFAULT_LIGHTING_STYLE_DOMAINS = Object.freeze({
  ambient: Object.freeze({
    dayScale: range(0.9, 1.25),
    intensity: range(0.32, 0.62),
    nightScale: range(0.45, 0.75),
  }),
  atmosphere: Object.freeze({
    fogDay: color([0.7, 0.78, 0.86], [0.88, 0.9, 0.98]),
    fogDusk: color([0.75, 0.5, 0.35], [0.98, 0.72, 0.55]),
    fogNight: color([0.24, 0.28, 0.44], [0.42, 0.46, 0.64]),
  }),
  exposure: Object.freeze({
    base: range(0.9, 1.12, 0.01, { distribution: 'normal', mean: 1.0, deviation: 0.05 }),
    nightScale: range(0.86, 0.98),
  }),
  fixtures: Object.freeze({
    intensityScale: range(0.9, 1.4),
    nightScale: range(1.05, 1.6),
  }),
  schedule: Object.freeze({
    sunriseHour: range(5.5, 7.5, 0.25),
    sunsetHour: range(17, 19.5, 0.25),
  }),
  sun: Object.freeze({
    accentScale: range(0.6, 1.2),
    dayIntensity: range(0.8, 1.3),
    dayKelvin: range(5000, 6800, 50),
    duskIntensity: range(0.35, 0.7),
    duskKelvin: range(1800, 3400, 50),
    nightIntensity: range(0.06, 0.2),
    nightKelvin: range(8000, 16000, 100),
  }),
});

/** Builds complete style settings from a sampled high-level palette. */
export function buildLightingStyleFromSample(sampled = {}, configuration = {}) {
  const sun = isPlainObject(sampled.sun) ? sampled.sun : {};
  const ambient = isPlainObject(sampled.ambient) ? sampled.ambient : {};
  const atmosphere = isPlainObject(sampled.atmosphere) ? sampled.atmosphere : {};
  const exposure = isPlainObject(sampled.exposure) ? sampled.exposure : {};
  const fixtures = isPlainObject(sampled.fixtures) ? sampled.fixtures : {};
  const schedule = isPlainObject(sampled.schedule) ? sampled.schedule : {};

  const sunrise = clamp(finite(schedule.sunriseHour, 6.5), 4, 10);
  const sunset = clamp(finite(schedule.sunsetHour, 18.5), Math.max(sunrise + 4, 14), 22);
  const midday = (sunrise + sunset) / 2;
  const nightKelvin = finite(sun.nightKelvin, 11000);
  const dayKelvin = finite(sun.dayKelvin, 5800);
  const duskKelvin = finite(sun.duskKelvin, 2600);
  const nightIntensity = finite(sun.nightIntensity, 0.12);
  const nightAmbient = finite(ambient.nightScale, 0.6);
  const nightFixture = finite(fixtures.nightScale, 1.3);
  const nightExposure = finite(exposure.nightScale, 0.92);
  const fogNight = atmosphere.fogNight ?? [0.32, 0.38, 0.55];
  const accent = finite(sun.accentScale, 1);

  // Sky palettes derive from the sampled fog palette so one seed stays one
  // coherent atmosphere; night zenith darkens the fog hue, horizons brighten it.
  const scaleColor = (rgb, factor, ceiling = 1) => rgb.map((channel) => clamp(channel * factor, 0, ceiling));
  const fogDay = atmosphere.fogDay ?? [0.78, 0.85, 0.95];
  const fogDusk = atmosphere.fogDusk ?? [0.85, 0.7, 0.55];
  const skyNight = { horizon: scaleColor(fogNight, 0.95), stars: 0.9, zenith: scaleColor(fogNight, 0.32) };
  const skyDay = {
    horizon: scaleColor(fogDay, 1.08),
    stars: 0,
    zenith: [clamp(fogDay[0] * 0.35, 0, 1), clamp(fogDay[1] * 0.62, 0, 1), clamp(fogDay[2] * 1.05, 0, 1)],
  };
  const skyDusk = { horizon: scaleColor(fogDusk, 1.12), stars: 0.05, zenith: [0.34, 0.35, 0.7] };

  const nightFrame = (hour) => ({
    accentScale: 0.2 * accent,
    ambientScale: nightAmbient,
    exposureScale: nightExposure,
    fixtureScale: nightFixture,
    fogColor: fogNight,
    hour,
    sky: skyNight,
    sunColor: { kelvin: nightKelvin },
    sunIntensity: nightIntensity,
  });

  return createLightingStyleSettings(deepMerge({
    ambientLight: { intensity: finite(ambient.intensity, 0.45) },
    dayCycle: [
      nightFrame(0),
      {
        accentScale: 0.9 * accent,
        ambientScale: (nightAmbient + finite(ambient.dayScale, 1)) / 2,
        exposureScale: 1,
        fixtureScale: nightFixture * 0.5,
        fogColor: atmosphere.fogDusk ?? [0.85, 0.7, 0.55],
        hour: sunrise,
        sky: skyDusk,
        sunColor: { kelvin: duskKelvin },
        sunIntensity: finite(sun.duskIntensity, 0.5),
      },
      {
        accentScale: accent,
        ambientScale: finite(ambient.dayScale, 1),
        exposureScale: 1.02,
        fixtureScale: 0,
        fogColor: atmosphere.fogDay ?? [0.78, 0.85, 0.95],
        hour: midday,
        sky: skyDay,
        sunColor: { kelvin: dayKelvin },
        sunIntensity: finite(sun.dayIntensity, 1),
      },
      {
        accentScale: 1.05 * accent,
        ambientScale: (nightAmbient + finite(ambient.dayScale, 1)) / 2,
        exposureScale: 1,
        fixtureScale: nightFixture * 0.6,
        fogColor: atmosphere.fogDusk ?? [0.82, 0.6, 0.45],
        hour: sunset,
        sky: skyDusk,
        sunColor: { kelvin: duskKelvin },
        sunIntensity: finite(sun.duskIntensity, 0.5),
      },
      nightFrame(Math.min(sunset + 2.5, 23.5)),
    ],
    exposure: { base: finite(exposure.base, 1) },
    fixtures: { intensityScale: finite(fixtures.intensityScale, 1) },
  }, configuration));
}

const STYLE_FAMILIES = new Map([
  ['anime-day', {
    description: 'Balanced storybook days: warm mornings, neutral noons, cool lamp-lit nights.',
    domains: DEFAULT_LIGHTING_STYLE_DOMAINS,
    label: 'Anime Day',
  }],
  ['call-me-sensei', {
    description: 'Vivid anime-open-world cycles: saturated punchy daylight, luminous cool shadows, strong golden hours, rich blue fixture-lit nights.',
    domains: deepMerge(DEFAULT_LIGHTING_STYLE_DOMAINS, {
      ambient: { dayScale: range(1.0, 1.3), intensity: range(0.5, 0.68), nightScale: range(0.55, 0.75) },
      atmosphere: {
        fogDay: color([0.62, 0.8, 0.95], [0.8, 0.9, 1.05]),
        fogDusk: color([0.95, 0.45, 0.3], [1.05, 0.72, 0.5]),
        fogNight: color([0.12, 0.16, 0.42], [0.24, 0.28, 0.58]),
      },
      exposure: { base: range(1.02, 1.14) },
      fixtures: { intensityScale: range(1.15, 1.5), nightScale: range(1.35, 1.7) },
      sun: {
        accentScale: range(1.0, 1.4),
        dayIntensity: range(1.05, 1.4),
        dayKelvin: range(5100, 5900, 50),
        duskIntensity: range(0.55, 0.85),
        duskKelvin: range(1900, 2700, 50),
        nightIntensity: range(0.12, 0.22),
        nightKelvin: range(10000, 13000, 100),
      },
    }),
    label: 'Call Me Sensei',
  }],
  ['golden', {
    description: 'Sun-drunk warm cycles with long amber golden hours.',
    domains: deepMerge(DEFAULT_LIGHTING_STYLE_DOMAINS, {
      exposure: { base: range(1.0, 1.15) },
      sun: {
        dayIntensity: range(1.0, 1.4),
        dayKelvin: range(4600, 5800, 50),
        duskKelvin: range(1700, 2600, 50),
      },
    }),
    label: 'Golden',
  }],
  ['noir-neon', {
    description: 'Dark cool cycles where fixtures carry the frame; saturated night fog.',
    domains: deepMerge(DEFAULT_LIGHTING_STYLE_DOMAINS, {
      ambient: { intensity: range(0.25, 0.45), nightScale: range(0.35, 0.55) },
      atmosphere: { fogNight: color([0.18, 0.12, 0.35], [0.4, 0.24, 0.55]) },
      exposure: { base: range(0.88, 1.0) },
      fixtures: { intensityScale: range(1.2, 1.7), nightScale: range(1.3, 1.8) },
      sun: { dayIntensity: range(0.5, 0.85), nightIntensity: range(0.04, 0.12), nightKelvin: range(10000, 20000, 100) },
    }),
    label: 'Noir Neon',
  }],
  ['pastel-overcast', {
    description: 'Soft flat cycles: high ambient, muted sun, gentle pastel fog.',
    domains: deepMerge(DEFAULT_LIGHTING_STYLE_DOMAINS, {
      ambient: { dayScale: range(1.1, 1.4), intensity: range(0.5, 0.7) },
      sun: { accentScale: range(0.15, 0.45), dayIntensity: range(0.4, 0.7), dayKelvin: range(6200, 7400, 50) },
    }),
    label: 'Pastel Overcast',
  }],
]);

export function registerLightingStyleGeneratorFamily(id, definition = {}, { overwrite = false } = {}) {
  const key = String(id ?? '').trim();
  if (!key) throw new Error('Lighting style generator family id is required.');
  if (!overwrite && STYLE_FAMILIES.has(key)) throw new Error(`Lighting style generator family "${key}" already exists.`);
  STYLE_FAMILIES.set(key, deepMerge(definition));
  return key;
}

export function getLightingStyleGeneratorFamilyOptions() {
  return [...STYLE_FAMILIES.entries()].map(([id, definition]) => ({
    description: definition.description ?? '', id, label: definition.label ?? id,
  }));
}

export function createLightingStyleGeneratorRecipe(id = 'generated-lighting-style', definition = {}) {
  const family = STYLE_FAMILIES.get(definition.family ?? 'anime-day') ?? {};
  return createGeneratorRecipeDocument(LIGHTING_STYLE_GENERATOR_DOMAIN, id, {
    basePreset: definition.basePreset ?? family.basePreset ?? null,
    configuration: deepMerge(family.configuration, definition.configuration),
    description: definition.description ?? '',
    domains: deepMerge(family.domains ?? DEFAULT_LIGHTING_STYLE_DOMAINS, definition.domains),
    label: definition.label ?? id,
    locks: definition.locks ?? [],
    seed: definition.seed ?? 1,
  });
}

export function validateLightingStyleGeneratorRecipe(input) {
  return validateGeneratorRecipeDocument(input, { domain: LIGHTING_STYLE_GENERATOR_DOMAIN });
}

export function parseLightingStyleGeneratorRecipe(input) {
  return parseGeneratorRecipeDocument(input, { domain: LIGHTING_STYLE_GENERATOR_DOMAIN });
}

export function serializeLightingStyleGeneratorRecipe(idOrDocument, definition = {}, { pretty = true } = {}) {
  return serializeGeneratorRecipeDocument(LIGHTING_STYLE_GENERATOR_DOMAIN, idOrDocument, definition, { pretty });
}

/** Resolves a style generator recipe into normalized lighting-style settings. */
export function resolveLightingStyleGeneratorRecipe(recipeInput) {
  const recipe = recipeInput?.type
    ? validateLightingStyleGeneratorRecipe(recipeInput).value
    : createLightingStyleGeneratorRecipe('generated-lighting-style', recipeInput);
  if (!recipe) throw new Error('Invalid lighting style generator recipe.');
  const sampled = resolveGeneratorRecipe(recipe, { sanitizeSettings: (value) => value });
  // The sampled tree is the high-level palette; configuration entries that
  // target the *style* schema pass through buildLightingStyleFromSample.
  return buildLightingStyleFromSample(sampled, recipe.configuration?.style ?? {});
}

export function createGeneratedLightingStyleDocument(recipeInput, {
  id = recipeInput?.id ? `${recipeInput.id}-resolved` : 'generated-lighting-style-resolved',
  label = recipeInput?.label ? `${recipeInput.label} · resolved` : 'Generated Lighting Style · resolved',
} = {}) {
  const settings = resolveLightingStyleGeneratorRecipe(recipeInput);
  return createLightingStylePresetDocument(id, {
    description: `Resolved from generator seed ${recipeInput?.seed ?? 1}.`,
    label,
    settings,
  });
}

// ---------------------------------------------------------------------------
// Fixture generation.

export const DEFAULT_LIGHT_FIXTURE_DOMAINS = Object.freeze({
  behavior: Object.freeze({
    flickerAmount: range(0, 0.3),
    flickerSpeed: range(3, 14, 0.5),
    scheduleMode: choice({ value: 'night', weight: 3 }, { value: 'always', weight: 1 }),
  }),
  emission: Object.freeze({
    distance: range(4, 16, 0.5),
    height: range(0.8, 4.5, 0.1),
    kelvin: range(1600, 3200, 25),
    lumens: range(120, 1400, 10, { distribution: 'log' }),
  }),
  variation: Object.freeze({
    intensitySpread: range(0.05, 0.3),
    kelvinSpread: range(50, 400, 10),
  }),
});

/** Builds complete fixture settings from a sampled definition. */
export function buildLightFixtureFromSample(sampled = {}, configuration = {}) {
  const emission = isPlainObject(sampled.emission) ? sampled.emission : {};
  const behavior = isPlainObject(sampled.behavior) ? sampled.behavior : {};
  const variation = isPlainObject(sampled.variation) ? sampled.variation : {};
  const kelvin = clamp(finite(emission.kelvin, 2200), 1000, 40000);
  const kelvinSpread = Math.max(finite(variation.kelvinSpread, 200), 0);
  const intensitySpread = clamp(finite(variation.intensitySpread, 0.15), 0, 1);
  return createLightFixtureSettings(deepMerge({
    base: {
      decay: 2,
      distance: Math.max(finite(emission.distance, 8), 0.5),
      intensity: { unit: 'lumens', value: Math.max(finite(emission.lumens, 400), 1) },
      position: [0, Math.max(finite(emission.height, 2.4), 0.05), 0],
      type: 'point',
    },
    category: 'practical',
    flicker: {
      amount: clamp(finite(behavior.flickerAmount, 0.08), 0, 1),
      speed: clamp(finite(behavior.flickerSpeed, 6), 0.05, 60),
    },
    schedule: { mode: behavior.scheduleMode === 'always' ? 'always' : 'night' },
    variation: {
      intensityScale: { $type: 'range', max: 1 + intensitySpread, min: Math.max(1 - intensitySpread, 0.05) },
      kelvin: {
        $type: 'range',
        max: clamp(kelvin + kelvinSpread, 1000, 40000),
        min: clamp(kelvin - kelvinSpread, 1000, 40000),
        step: 10,
      },
    },
  }, configuration));
}

const FIXTURE_FAMILIES = new Map([
  ['warm-practical', {
    description: 'Lanterns, lamps, and household practicals in the warm kelvin band.',
    domains: DEFAULT_LIGHT_FIXTURE_DOMAINS,
    label: 'Warm Practical',
  }],
  ['cms-practical', {
    description: 'Call Me Sensei practicals: saturated warm lanterns and lamps tuned to read against vivid blue nights.',
    domains: deepMerge(DEFAULT_LIGHT_FIXTURE_DOMAINS, {
      behavior: { flickerAmount: range(0.02, 0.14) },
      emission: { kelvin: range(1850, 2500, 25), lumens: range(300, 1400, 10, { distribution: 'log' }) },
      variation: { intensitySpread: range(0.1, 0.25), kelvinSpread: range(100, 300, 10) },
    }),
    label: 'CMS Practical',
  }],
  ['flame', {
    description: 'Fires, candles, and torches: very warm, heavy organic flicker.',
    domains: deepMerge(DEFAULT_LIGHT_FIXTURE_DOMAINS, {
      behavior: {
        flickerAmount: range(0.18, 0.45),
        flickerSpeed: range(6, 14, 0.5),
        scheduleMode: choice({ value: 'always', weight: 1 }),
      },
      emission: { height: range(0.4, 1.4, 0.05), kelvin: range(1450, 2000, 25) },
    }),
    label: 'Flame',
  }],
  ['neon', {
    description: 'Saturated signage: cool-to-acid hues, electrical stutter, night schedule.',
    domains: deepMerge(DEFAULT_LIGHT_FIXTURE_DOMAINS, {
      behavior: { flickerAmount: range(0.1, 0.35), flickerSpeed: range(16, 32, 1) },
      emission: { kelvin: range(6000, 12000, 100) },
    }),
    configuration: {
      base: { type: 'tubeArea', width: 1.6 },
      category: 'signage',
    },
    label: 'Neon',
  }],
]);

export function registerLightFixtureGeneratorFamily(id, definition = {}, { overwrite = false } = {}) {
  const key = String(id ?? '').trim();
  if (!key) throw new Error('Light fixture generator family id is required.');
  if (!overwrite && FIXTURE_FAMILIES.has(key)) throw new Error(`Light fixture generator family "${key}" already exists.`);
  FIXTURE_FAMILIES.set(key, deepMerge(definition));
  return key;
}

export function getLightFixtureGeneratorFamilyOptions() {
  return [...FIXTURE_FAMILIES.entries()].map(([id, definition]) => ({
    description: definition.description ?? '', id, label: definition.label ?? id,
  }));
}

export function createLightFixtureGeneratorRecipe(id = 'generated-fixture', definition = {}) {
  const family = FIXTURE_FAMILIES.get(definition.family ?? 'warm-practical') ?? {};
  return createGeneratorRecipeDocument(LIGHT_FIXTURE_GENERATOR_DOMAIN, id, {
    basePreset: definition.basePreset ?? family.basePreset ?? null,
    configuration: deepMerge(family.configuration, definition.configuration),
    description: definition.description ?? '',
    domains: deepMerge(family.domains ?? DEFAULT_LIGHT_FIXTURE_DOMAINS, definition.domains),
    label: definition.label ?? id,
    locks: definition.locks ?? [],
    seed: definition.seed ?? 1,
  });
}

export function validateLightFixtureGeneratorRecipe(input) {
  return validateGeneratorRecipeDocument(input, { domain: LIGHT_FIXTURE_GENERATOR_DOMAIN });
}

export function parseLightFixtureGeneratorRecipe(input) {
  return parseGeneratorRecipeDocument(input, { domain: LIGHT_FIXTURE_GENERATOR_DOMAIN });
}

export function serializeLightFixtureGeneratorRecipe(idOrDocument, definition = {}, { pretty = true } = {}) {
  return serializeGeneratorRecipeDocument(LIGHT_FIXTURE_GENERATOR_DOMAIN, idOrDocument, definition, { pretty });
}

/** Resolves a fixture generator recipe into normalized fixture settings. */
export function resolveLightFixtureGeneratorRecipe(recipeInput) {
  const recipe = recipeInput?.type
    ? validateLightFixtureGeneratorRecipe(recipeInput).value
    : createLightFixtureGeneratorRecipe('generated-fixture', recipeInput);
  if (!recipe) throw new Error('Invalid light fixture generator recipe.');
  const sampled = resolveGeneratorRecipe(recipe, { sanitizeSettings: (value) => value });
  return buildLightFixtureFromSample(sampled, recipe.configuration ?? {});
}

export function createGeneratedLightFixtureDocument(recipeInput, {
  id = recipeInput?.id ? `${recipeInput.id}-resolved` : 'generated-fixture-resolved',
  label = recipeInput?.label ? `${recipeInput.label} · resolved` : 'Generated Fixture · resolved',
} = {}) {
  const settings = resolveLightFixtureGeneratorRecipe(recipeInput);
  return createLightFixtureDocument(id, {
    description: `Resolved from generator seed ${recipeInput?.seed ?? 1}.`,
    label,
    settings,
  });
}
