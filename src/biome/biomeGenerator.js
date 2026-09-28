// Seeded, extensible biome style generation. Families are only starting
// domain bundles: recipes embed their complete domain tree and can replace
// every leaf, so generation is never capped by the built-in choices.

import {
  createGeneratorRecipeDocument,
  deepMerge,
  parseGeneratorRecipeDocument,
  resolveGeneratorRecipe,
  serializeGeneratorRecipeDocument,
  validateGeneratorRecipeDocument,
} from '../core/generation.js';

export const BIOME_GENERATOR_DOMAIN = 'biome';
export const BIOME_PRESET_DOCUMENT_TYPE = 'toonlab/biome-preset';
export const BIOME_PRESET_SCHEMA_VERSION = 1;

const range = (min, max, step, extra = {}) => ({ $type: 'range', min, max, step, ...extra });
const choice = (options) => ({ $type: 'choice', options });
const bool = (probability) => ({ $type: 'boolean', probability });
// Linked interpolation travels through a deliberately authored palette line;
// independent RGB sampling tends to create accidental mud/brown combinations.
const color = (from, to, linked = true) => ({ $type: 'color', from, linked, to });

export const DEFAULT_BIOME_SETTINGS = Object.freeze({
  atmosphere: {
    fogDensity: 0.00065,
    fogFalloff: 14,
    skyRadius: 420,
  },
  features: {
    floatingIslands: false,
    flowers: true,
    grass: true,
    sinkholes: false,
    trees: true,
    water: true,
  },
  terrain: {
    archetype: 'rollingPlains',
    aspect: 1,
    depth: 42,
    floatingIslandCount: 3,
    morphology: {
      continent: { amp: 86, bias: -0.49, freq: 0.00125 },
      mountains: {
        amp: 112, freq: 0.00082, maskHigh: 0.68, maskLow: 0.49,
        ridgeExp: 1.7, ridgeFreq: 0.0072,
      },
      rim: { base: 44, ridged: 86 },
      rolling: { amp: 18, freq: 0.0038 },
      terraces: { blendHigh: 0.94, blendLow: 0.7, enabled: true, sharpness: 4, step: 16 },
    },
    palette: {
      golden: [0.78, 0.62, 0.24],
      haze: [0.62, 0.76, 0.92],
      meadow: [0.25, 0.58, 0.24],
      rock: [0.58, 0.64, 0.72],
      sand: [0.83, 0.75, 0.49],
      snow: [0.88, 0.92, 0.96],
    },
    sinkholeCount: 3,
    size: 420,
    waterCoverage: 0.18,
  },
  vegetation: {
    flowerDensity: 0.28,
    flowerRadius: 26,
    grassBaseColor: [0.16, 0.42, 0.18],
    grassDensity: 4.2,
    grassRadius: 38,
    grassTipColor: [0.45, 0.72, 0.28],
    treeCanopyColor: [0.23, 0.55, 0.24],
    treeKeepChance: 0.78,
    treeRadius: 105,
    treeSize: 2.8,
    treeSpacing: 10,
    windStrength: 0.18,
  },
  water: {
    deepColor: [0.04, 0.28, 0.48],
    shallowColor: [0.34, 0.82, 0.8],
  },
});

export const DEFAULT_BIOME_GENERATOR_DOMAINS = Object.freeze({
  atmosphere: {
    // Height fog multiplies distance fog by exp(-height / falloff). Outdoor
    // worlds need a short vertical falloff; values in the hundreds haze the
    // entire mountain column and flatten nearly every generated palette.
    fogDensity: range(0.00015, 0.0018, 0.00005, { distribution: 'log' }),
    fogFalloff: range(6, 40, 1, { distribution: 'normal', mean: 14, deviation: 7 }),
    skyRadius: range(280, 900, 10),
  },
  features: {
    floatingIslands: bool(0.12),
    flowers: bool(0.75),
    grass: bool(0.94),
    sinkholes: bool(0.24),
    trees: bool(0.9),
    water: bool(0.9),
  },
  terrain: {
    archetype: choice([
      { value: 'rollingPlains', weight: 3 },
      { value: 'lakeland', weight: 2 },
      { value: 'terracedKarst', weight: 2 },
      { value: 'alpine', weight: 1 },
      { value: 'archipelago', weight: 1 },
    ]),
    aspect: range(0.68, 1.48, 0.01, { distribution: 'normal', mean: 1, deviation: 0.18 }),
    depth: range(18, 120, 1, { distribution: 'normal', mean: 48, deviation: 22 }),
    floatingIslandCount: range(1, 8, 1, { integer: true }),
    morphology: {
      continent: {
        amp: range(40, 190, 1),
        bias: range(-0.7, -0.34, 0.005),
        freq: range(0.00065, 0.0022, 0.00001, { distribution: 'log' }),
      },
      mountains: {
        amp: range(28, 300, 1, { distribution: 'normal', mean: 126, deviation: 55 }),
        freq: range(0.00045, 0.0018, 0.00001, { distribution: 'log' }),
        maskHigh: range(0.56, 0.82, 0.005),
        maskLow: range(0.32, 0.62, 0.005),
        ridgeExp: range(1.15, 2.8, 0.01),
        ridgeFreq: range(0.0035, 0.014, 0.0001, { distribution: 'log' }),
      },
      rim: {
        base: range(24, 110, 1),
        ridged: range(44, 210, 1),
      },
      rolling: {
        amp: range(5, 42, 0.5),
        freq: range(0.0018, 0.009, 0.0001, { distribution: 'log' }),
      },
      terraces: {
        blendHigh: range(0.78, 1, 0.005),
        blendLow: range(0.42, 0.84, 0.005),
        enabled: bool(0.62),
        sharpness: range(1.5, 8, 0.1),
        step: range(5, 38, 0.5),
      },
    },
    palette: {
      golden: color([0.45, 0.28, 0.08], [0.98, 0.78, 0.35]),
      haze: color([0.42, 0.56, 0.72], [0.82, 0.9, 1]),
      meadow: color([0.08, 0.28, 0.1], [0.55, 0.76, 0.36]),
      rock: color([0.32, 0.34, 0.38], [0.82, 0.78, 0.74]),
      sand: color([0.58, 0.4, 0.2], [0.96, 0.88, 0.62]),
      snow: color([0.76, 0.82, 0.9], [1, 0.98, 0.96]),
    },
    sinkholeCount: range(1, 9, 1, { integer: true }),
    size: range(180, 1100, 10, { distribution: 'log' }),
    waterCoverage: range(0.01, 0.58, 0.005, { distribution: 'normal', mean: 0.2, deviation: 0.15 }),
  },
  vegetation: {
    flowerDensity: range(0.03, 1.2, 0.01, { distribution: 'log' }),
    flowerRadius: range(12, 70, 1),
    grassBaseColor: color([0.05, 0.16, 0.06], [0.38, 0.58, 0.22]),
    grassDensity: range(0.8, 10, 0.1, { distribution: 'log' }),
    grassRadius: range(18, 78, 1),
    grassTipColor: color([0.22, 0.4, 0.1], [0.72, 0.86, 0.38]),
    treeCanopyColor: color([0.06, 0.22, 0.08], [0.56, 0.74, 0.3]),
    treeKeepChance: range(0.28, 1, 0.01),
    treeRadius: range(48, 240, 2),
    treeSize: range(1.4, 4.8, 0.05),
    treeSpacing: range(5, 24, 0.5, { distribution: 'log' }),
    windStrength: range(0.03, 0.55, 0.01),
  },
  water: {
    deepColor: color([0.005, 0.08, 0.14], [0.13, 0.46, 0.54]),
    shallowColor: color([0.16, 0.54, 0.52], [0.58, 0.96, 0.84]),
  },
});

const FAMILY_DEFINITIONS = new Map([
  ['living-landscape', {
    description: 'Broad game-ready landscape domains with bounded vegetation budgets.',
    domains: DEFAULT_BIOME_GENERATOR_DOMAINS,
    label: 'Living Landscape',
  }],
  ['sky-realm', {
    configuration: { features: { floatingIslands: true, water: true } },
    domains: deepMerge(DEFAULT_BIOME_GENERATOR_DOMAINS, {
      features: { floatingIslands: { $type: 'boolean', probability: 0.92 } },
      terrain: {
        floatingIslandCount: range(3, 12, 1, { integer: true }),
        waterCoverage: range(0.18, 0.56, 0.005),
      },
    }),
    label: 'Sky Realm',
  }],
]);

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function number(value, fallback, min = -Infinity, max = Infinity) {
  return clamp(Number.isFinite(Number(value)) ? Number(value) : fallback, min, max);
}

function colorArray(value, fallback) {
  if (!Array.isArray(value) || value.length < 3) return [...fallback];
  return value.slice(0, 3).map((channel, index) => number(channel, fallback[index], 0, 1));
}

/** Normalizes a resolved biome into serializable runtime settings. */
export function sanitizeBiomeSettings(input = {}) {
  const source = deepMerge(DEFAULT_BIOME_SETTINGS, input);
  const terrain = source.terrain ?? {};
  const morphology = terrain.morphology ?? {};
  const mountains = morphology.mountains ?? {};
  const terraces = morphology.terraces ?? {};
  const maskLow = number(mountains.maskLow, 0.49, 0.05, 0.9);
  const blendLow = number(terraces.blendLow, 0.7, 0, 0.98);
  const output = {
    atmosphere: {
      fogDensity: number(source.atmosphere?.fogDensity, 0.00065, 0, 0.02),
      fogFalloff: number(source.atmosphere?.fogFalloff, 14, 1, 2000),
      skyRadius: number(source.atmosphere?.skyRadius, 420, 50, 4000),
    },
    features: Object.fromEntries(
      Object.keys(DEFAULT_BIOME_SETTINGS.features).map((key) => [key, Boolean(source.features?.[key])]),
    ),
    terrain: {
      archetype: String(terrain.archetype || 'rollingPlains'),
      aspect: number(terrain.aspect, 1, 0.25, 4),
      depth: number(terrain.depth, 42, 1, 500),
      floatingIslandCount: Math.round(number(terrain.floatingIslandCount, 3, 1, 64)),
      morphology: {
        continent: {
          amp: number(morphology.continent?.amp, 86, 1, 1000),
          bias: number(morphology.continent?.bias, -0.49, -2, 1),
          freq: number(morphology.continent?.freq, 0.00125, 0.00001, 1),
        },
        mountains: {
          amp: number(mountains.amp, 112, 1, 1600),
          freq: number(mountains.freq, 0.00082, 0.00001, 1),
          maskHigh: number(mountains.maskHigh, 0.68, maskLow + 0.01, 1),
          maskLow,
          ridgeExp: number(mountains.ridgeExp, 1.7, 0.1, 12),
          ridgeFreq: number(mountains.ridgeFreq, 0.0072, 0.00001, 1),
        },
        rim: {
          base: number(morphology.rim?.base, 44, 0, 1000),
          ridged: number(morphology.rim?.ridged, 86, 0, 1600),
        },
        rolling: {
          amp: number(morphology.rolling?.amp, 18, 0, 500),
          freq: number(morphology.rolling?.freq, 0.0038, 0.00001, 1),
        },
        terraces: {
          blendHigh: number(terraces.blendHigh, 0.94, blendLow + 0.01, 1),
          blendLow,
          enabled: Boolean(terraces.enabled),
          sharpness: number(terraces.sharpness, 4, 0.1, 30),
          step: number(terraces.step, 16, 0.1, 500),
        },
      },
      palette: Object.fromEntries(Object.entries(DEFAULT_BIOME_SETTINGS.terrain.palette).map(
        ([key, fallback]) => [key, colorArray(terrain.palette?.[key], fallback)],
      )),
      sinkholeCount: Math.round(number(terrain.sinkholeCount, 3, 1, 64)),
      size: number(terrain.size, 420, 40, 10000),
      waterCoverage: number(terrain.waterCoverage, 0.18, 0, 0.6),
    },
    vegetation: {
      flowerDensity: number(source.vegetation?.flowerDensity, 0.28, 0, 20),
      flowerRadius: number(source.vegetation?.flowerRadius, 26, 1, 1000),
      grassBaseColor: colorArray(source.vegetation?.grassBaseColor, DEFAULT_BIOME_SETTINGS.vegetation.grassBaseColor),
      grassDensity: number(source.vegetation?.grassDensity, 4.2, 0, 30),
      grassRadius: number(source.vegetation?.grassRadius, 38, 1, 1000),
      grassTipColor: colorArray(source.vegetation?.grassTipColor, DEFAULT_BIOME_SETTINGS.vegetation.grassTipColor),
      treeCanopyColor: colorArray(source.vegetation?.treeCanopyColor, DEFAULT_BIOME_SETTINGS.vegetation.treeCanopyColor),
      treeKeepChance: number(source.vegetation?.treeKeepChance, 0.78, 0, 1),
      treeRadius: number(source.vegetation?.treeRadius, 105, 1, 5000),
      treeSize: number(source.vegetation?.treeSize, 2.8, 0.1, 30),
      treeSpacing: number(source.vegetation?.treeSpacing, 10, 0.5, 200),
      windStrength: number(source.vegetation?.windStrength, 0.18, 0, 4),
    },
    water: {
      deepColor: colorArray(source.water?.deepColor, DEFAULT_BIOME_SETTINGS.water.deepColor),
      shallowColor: colorArray(source.water?.shallowColor, DEFAULT_BIOME_SETTINGS.water.shallowColor),
    },
  };
  return output;
}

export function registerBiomeGeneratorFamily(id, definition = {}, { overwrite = false } = {}) {
  const key = String(id ?? '').trim();
  if (!key) throw new Error('Biome generator family id is required.');
  if (!overwrite && FAMILY_DEFINITIONS.has(key)) throw new Error(`Biome generator family "${key}" already exists.`);
  FAMILY_DEFINITIONS.set(key, deepMerge(definition));
  return key;
}

export function getBiomeGeneratorFamilyOptions() {
  return [...FAMILY_DEFINITIONS.entries()].map(([id, definition]) => ({
    description: definition.description ?? '', id, label: definition.label ?? id,
  }));
}

export function createBiomeGeneratorRecipe(id = 'generated-biome', definition = {}) {
  const family = FAMILY_DEFINITIONS.get(definition.family ?? 'living-landscape') ?? {};
  return createGeneratorRecipeDocument(BIOME_GENERATOR_DOMAIN, id, {
    basePreset: definition.basePreset ?? 'outdoorGameplay',
    configuration: deepMerge(family.configuration, definition.configuration),
    description: definition.description ?? '',
    domains: deepMerge(family.domains ?? DEFAULT_BIOME_GENERATOR_DOMAINS, definition.domains),
    label: definition.label ?? id,
    locks: definition.locks ?? [],
    seed: definition.seed ?? 1,
  });
}

export function validateBiomeGeneratorRecipe(input) {
  return validateGeneratorRecipeDocument(input, { domain: BIOME_GENERATOR_DOMAIN });
}

export function parseBiomeGeneratorRecipe(input) {
  return parseGeneratorRecipeDocument(input, { domain: BIOME_GENERATOR_DOMAIN });
}

export function serializeBiomeGeneratorRecipe(idOrDocument, definition = {}, { pretty = true } = {}) {
  return serializeGeneratorRecipeDocument(BIOME_GENERATOR_DOMAIN, idOrDocument, definition, { pretty });
}

const QUALITY_BUDGETS = Object.freeze({
  mobile: { flowerDensity: 0.18, grassDensity: 2.5, grassRadius: 28, segments: 64, treeRadius: 72, treeSpacing: 13 },
  balanced: { flowerDensity: 0.5, grassDensity: 6, grassRadius: 48, segments: 112, treeRadius: 130, treeSpacing: 8 },
  cinematic: { flowerDensity: 1.2, grassDensity: 10, grassRadius: 78, segments: 192, treeRadius: 240, treeSpacing: 5 },
});

export function applyBiomeQualityBudget(input, quality = 'balanced') {
  const settings = sanitizeBiomeSettings(input);
  const budget = QUALITY_BUDGETS[quality] ?? QUALITY_BUDGETS.balanced;
  settings.runtime = {
    quality: QUALITY_BUDGETS[quality] ? quality : 'balanced',
    terrainSegments: budget.segments,
  };
  settings.vegetation.flowerDensity = Math.min(settings.vegetation.flowerDensity, budget.flowerDensity);
  settings.vegetation.grassDensity = Math.min(settings.vegetation.grassDensity, budget.grassDensity);
  settings.vegetation.grassRadius = Math.min(settings.vegetation.grassRadius, budget.grassRadius);
  settings.vegetation.treeRadius = Math.min(settings.vegetation.treeRadius, budget.treeRadius);
  settings.vegetation.treeSpacing = Math.max(settings.vegetation.treeSpacing, budget.treeSpacing);
  return settings;
}

/** Resolves a generator recipe into flat, budgeted runtime settings. */
export function resolveBiomeGeneratorRecipe(recipeInput, { quality = 'balanced' } = {}) {
  const validation = recipeInput?.type
    ? validateBiomeGeneratorRecipe(recipeInput)
    : { ok: true, value: createBiomeGeneratorRecipe('generated-biome', recipeInput) };
  if (!validation.ok) throw new Error(validation.errors.join(' '));
  const settings = resolveGeneratorRecipe(validation.value, {
    baseSettings: DEFAULT_BIOME_SETTINGS,
    sanitizeSettings: sanitizeBiomeSettings,
  });
  return applyBiomeQualityBudget(settings, quality);
}

export function createGeneratedBiomePresetDocument(recipeInput, options = {}) {
  const validation = recipeInput?.type
    ? validateBiomeGeneratorRecipe(recipeInput)
    : { ok: true, value: createBiomeGeneratorRecipe('generated-biome', recipeInput) };
  if (!validation.ok) throw new Error(validation.errors.join(' '));
  const recipe = validation.value;
  const settings = resolveBiomeGeneratorRecipe(recipe, { quality: options.quality });
  return {
    basePreset: recipe.basePreset ?? 'outdoorGameplay',
    description: `Resolved from generator seed ${recipe.seed}.`,
    id: options.id ?? `${recipe.id}-resolved`,
    label: options.label ?? `${recipe.label} · resolved`,
    seed: recipe.seed,
    settings,
    source: {
      recipeId: recipe.id,
      recipeVersion: recipe.version,
      seed: recipe.seed,
    },
    type: BIOME_PRESET_DOCUMENT_TYPE,
    version: BIOME_PRESET_SCHEMA_VERSION,
  };
}
