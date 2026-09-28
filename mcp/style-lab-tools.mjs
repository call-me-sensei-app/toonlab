import {
  createGeneratedPostPresetDocument,
  createPostGeneratorRecipe,
  getPostGeneratorFamilyOptions,
  validatePostGeneratorRecipe,
  validatePostProcessingPresetDocument,
} from '../src/post/index.js';
import {
  createCameraGeneratorRecipeDocument,
  generateCameraPreset,
  getCameraGeneratorArchetypeOptions,
  validateCameraGeneratorRecipeDocument,
  validateCameraPresetDocument,
} from '../src/camera/index.js';
import {
  createGameFeelGeneratorRecipe,
  createGeneratedGameFeelPresetDocument,
  getGameFeelGeneratorFamilyOptions,
  validateGameFeelGeneratorRecipe,
  validateGameFeelPresetDocument,
} from '../src/game-feel/index.js';
import {
  createGeneratedLightFixtureDocument,
  createGeneratedLightingStyleDocument,
  createLightFixtureGeneratorRecipe,
  createLightingStyleGeneratorRecipe,
  getLightFixtureGeneratorFamilyOptions,
  getLightingStyleGeneratorFamilyOptions,
  validateLightFixtureDocument,
  validateLightFixtureGeneratorRecipe,
  validateLightingStyleGeneratorRecipe,
  validateLightingStylePresetDocument,
} from '../src/lighting/index.js';

const QUALITY_OPTIONS = Object.freeze(['mobile', 'balanced', 'cinematic']);

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function cleanId(value, fallback) {
  return String(value ?? fallback)
    .trim()
    .replace(/[^a-zA-Z0-9._/-]+/g, '_') || fallback;
}

function parseDocument(value, label) {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

function normalizedValidation(result) {
  if (result?.ok) return result;
  const errors = result?.errors?.length ? result.errors : ['Document validation failed.'];
  return { errors, ok: false, value: null, warnings: result?.warnings ?? [] };
}

const ADAPTERS = new Map([
  ['post', {
    create: createPostGeneratorRecipe,
    families: getPostGeneratorFamilyOptions,
    generate: (recipe, options) => createGeneratedPostPresetDocument(recipe, options),
    validatePreset: validatePostProcessingPresetDocument,
    validateRecipe: validatePostGeneratorRecipe,
  }],
  ['camera', {
    create: createCameraGeneratorRecipeDocument,
    families: getCameraGeneratorArchetypeOptions,
    generate: (recipe, options) => generateCameraPreset(recipe, options),
    validatePreset: validateCameraPresetDocument,
    validateRecipe: validateCameraGeneratorRecipeDocument,
  }],
  ['game-feel', {
    create: createGameFeelGeneratorRecipe,
    families: getGameFeelGeneratorFamilyOptions,
    generate: (recipe, options) => createGeneratedGameFeelPresetDocument(recipe, options),
    validatePreset: validateGameFeelPresetDocument,
    validateRecipe: validateGameFeelGeneratorRecipe,
  }],
  ['lighting-style', {
    create: createLightingStyleGeneratorRecipe,
    families: getLightingStyleGeneratorFamilyOptions,
    generate: (recipe, options) => createGeneratedLightingStyleDocument(recipe, options),
    validatePreset: validateLightingStylePresetDocument,
    validateRecipe: validateLightingStyleGeneratorRecipe,
  }],
  ['light-fixture', {
    create: createLightFixtureGeneratorRecipe,
    families: getLightFixtureGeneratorFamilyOptions,
    generate: (recipe, options) => createGeneratedLightFixtureDocument(recipe, options),
    validatePreset: validateLightFixtureDocument,
    validateRecipe: validateLightFixtureGeneratorRecipe,
  }],
]);

const LAB_METADATA = Object.freeze({
  post: Object.freeze({
    budgetedQuality: true,
    label: 'Post & Color Lab',
    packageImport: '@call-me-sensei/toonlab/post',
    runtimeApis: ['createPostProcessingPipeline'],
    scope: 'Color grading, bloom, outline, vignette, depth cues, and screen-space effects.',
  }),
  camera: Object.freeze({
    budgetedQuality: false,
    label: 'Camera Lab',
    packageImport: '@call-me-sensei/toonlab/camera',
    runtimeApis: ['createCameraRig', 'createCameraDirector'],
    scope: 'Composable follow, framing, collision, damping, noise, impulse, and lens behavior.',
  }),
  'game-feel': Object.freeze({
    budgetedQuality: true,
    label: 'Game Feel Lab',
    packageImport: '@call-me-sensei/toonlab/game-feel',
    runtimeApis: ['createGameFeelRuntime'],
    scope: 'Event-driven camera, time, motion, haptics, audio, flash, and project-defined effect orchestration.',
  }),
  'lighting-style': Object.freeze({
    budgetedQuality: true,
    label: 'Lighting Lab · Styles',
    labPath: '/lighting-lab/',
    packageImport: '@call-me-sensei/toonlab/lighting',
    runtimeApis: ['createLightingSystem'],
    scope: 'Game-wide lighting identity: day-cycle palette, sun path, ambient/exposure philosophy, shadow policy.',
  }),
  'light-fixture': Object.freeze({
    budgetedQuality: false,
    label: 'Lighting Lab · Fixtures',
    labPath: '/lighting-lab/',
    packageImport: '@call-me-sensei/toonlab/lighting',
    runtimeApis: ['createLightingSystem', 'resolveFixturePlacement'],
    scope: 'Reusable light fixtures with seeded per-placement variation, flicker, and day/night schedules.',
  }),
});

const LAB_IDS = Object.freeze([...ADAPTERS.keys()]);

function getAdapter(id) {
  const adapter = ADAPTERS.get(id);
  if (!adapter) throw new Error(`Unknown style lab "${id}". Expected one of: ${LAB_IDS.join(', ')}.`);
  return adapter;
}

function recipeDefinition(args, lab = null) {
  const definition = {};
  for (const [input, output = input] of [
    ['base_preset', 'basePreset'],
    ['configuration'],
    ['description'],
    ['domains'],
    ['family'],
    ['label'],
    ['locks'],
    ['seed'],
  ]) {
    if (args[input] !== undefined) definition[output] = clone(args[input]);
  }
  // Camera calls its starting families archetypes and stores the selected id
  // in basePreset. Keep the generic MCP `family` vocabulary consistent while
  // mapping it to the camera document contract.
  if (lab === 'camera' && args.family !== undefined && args.base_preset === undefined) {
    definition.basePreset = String(args.family);
  }
  return definition;
}

export function listStyleLabs() {
  return {
    architecture: {
      designTime: 'Labs and MCP author generator recipes, inspect variants, validate documents, and save presets.',
      runtime: 'The npm package applies resolved presets deterministically without editor dependencies.',
    },
    count: LAB_IDS.length,
    labs: LAB_IDS.map((id) => ({
      id,
      ...LAB_METADATA[id],
      families: getAdapter(id).families(),
      generation: {
        deterministic: true,
        domainOverrides: true,
        locks: true,
        maxMcpBatch: 64,
        qualities: LAB_METADATA[id].budgetedQuality ? QUALITY_OPTIONS : [],
        seedSpace: 'uint32 (zero normalizes to 1)',
      },
    })),
  };
}

export async function createStyleRecipe(args, { saveCreation, workspace } = {}) {
  const lab = String(args.lab ?? '');
  const adapter = getAdapter(lab);
  const id = cleanId(args.id, `${lab}-generator`);
  const recipe = adapter.create(id, recipeDefinition(args, lab));
  const validation = normalizedValidation(adapter.validateRecipe(recipe));
  if (!validation.ok) throw new Error(validation.errors.join(' '));
  const file = args.save === false || !saveCreation ? null : await saveCreation(workspace, {
    document: validation.value,
    kind: `${lab}-recipe`,
    name: args.name ?? validation.value.label ?? id,
  });
  return {
    file,
    lab,
    recipe: validation.value,
    runtime: LAB_METADATA[lab],
  };
}

export async function generateStylePresets(args, { saveCreation, workspace } = {}) {
  const lab = String(args.lab ?? '');
  const adapter = getAdapter(lab);
  const provided = parseDocument(args.recipe, 'recipe');
  const recipe = provided ?? adapter.create(`${lab}-generator`, recipeDefinition(args, lab));
  const validation = normalizedValidation(adapter.validateRecipe(recipe));
  if (!validation.ok) throw new Error(validation.errors.join(' '));
  const count = Math.max(1, Math.min(64, Math.floor(Number(args.count) || 1)));
  const startSeed = (Number(args.start_seed ?? args.seed ?? validation.value.seed ?? 1) >>> 0) || 1;
  const requestedQuality = QUALITY_OPTIONS.includes(args.quality) ? args.quality : 'balanced';
  const quality = LAB_METADATA[lab].budgetedQuality ? requestedQuality : null;
  const presets = [];
  for (let index = 0; index < count; index += 1) {
    // Recipes reserve zero as the default seed. Wrap over 1..2^32-1 without
    // producing the duplicate `1, 1` pair at the uint32 boundary.
    const seed = ((startSeed - 1 + index) % 0xffffffff) + 1;
    const seededRecipe = { ...validation.value, seed };
    const id = `${validation.value.id}-${seed}`;
    const preset = adapter.generate(seededRecipe, {
      id,
      label: `${validation.value.label} · ${seed}`,
      presetId: id,
      ...(quality ? { quality } : {}),
      seed,
    });
    const presetValidation = normalizedValidation(adapter.validatePreset(preset));
    if (!presetValidation.ok) throw new Error(`Seed ${seed}: ${presetValidation.errors.join(' ')}`);
    presets.push(presetValidation.value);
  }
  const document = {
    lab,
    presets,
    quality,
    qualityApplied: Boolean(quality),
    recipe: validation.value,
    schema: 'toonlab/style-preset-batch',
    startSeed,
    version: 1,
  };
  const file = args.save === false || !saveCreation ? null : await saveCreation(workspace, {
    document,
    kind: `${lab}-presets`,
    name: args.name ?? `${validation.value.label} ${startSeed}-${((startSeed - 1 + count - 1) % 0xffffffff) + 1}`,
  });
  return {
    count: presets.length,
    file,
    lab,
    presets,
    quality,
    qualityApplied: Boolean(quality),
    recipe: validation.value,
    startSeed,
  };
}

export function validateStyleDocument(args) {
  const lab = String(args.lab ?? '');
  const adapter = getAdapter(lab);
  const document = parseDocument(args.document, 'document');
  const kind = args.kind === 'preset' ? 'preset' : 'recipe';
  return {
    kind,
    lab,
    ...normalizedValidation(kind === 'preset'
      ? adapter.validatePreset(document)
      : adapter.validateRecipe(document)),
  };
}

export const STYLE_LAB_TOOLS = Object.freeze([
  Object.freeze({
    annotations: { readOnlyHint: true },
    description: 'List the seven generative style labs, their open domains, authoring capabilities, and npm runtime APIs.',
    inputSchema: { additionalProperties: false, properties: {}, type: 'object' },
    name: 'list_style_labs',
    title: 'List ToonLab style labs',
  }),
  Object.freeze({
    annotations: { destructiveHint: false, idempotentHint: true },
    description: 'Create and optionally save an editable deterministic generator recipe for any style lab. Domains may be replaced or extended; this is not a fixed preset catalog.',
    inputSchema: {
      additionalProperties: false,
      properties: {
        base_preset: { type: ['string', 'null'] },
        configuration: { type: 'object' },
        description: { type: 'string' },
        domains: { type: 'object' },
        family: { type: 'string' },
        id: { type: 'string' },
        lab: { enum: LAB_IDS, type: 'string' },
        label: { type: 'string' },
        locks: { items: { type: 'string' }, type: 'array' },
        name: { type: 'string' },
        save: { default: true, type: 'boolean' },
        seed: { type: 'integer' },
      },
      required: ['lab'],
      type: 'object',
    },
    name: 'create_style_recipe',
    title: 'Create a ToonLab style recipe',
  }),
  Object.freeze({
    annotations: { destructiveHint: false, idempotentHint: true },
    description: 'Resolve one to 64 deterministic runtime presets from a style recipe and optionally save the batch. Any uint32 seed can produce another variant.',
    inputSchema: {
      additionalProperties: false,
      properties: {
        count: { default: 1, maximum: 64, minimum: 1, type: 'integer' },
        lab: { enum: LAB_IDS, type: 'string' },
        name: { type: 'string' },
        quality: {
          default: 'balanced',
          description: 'Applied by Post, Biome, Soundscape, and Game Feel; other lab presets have no tiered runtime budget.',
          enum: QUALITY_OPTIONS,
          type: 'string',
        },
        recipe: { type: ['object', 'string'] },
        save: { default: true, type: 'boolean' },
        seed: { type: 'integer' },
        start_seed: { type: 'integer' },
      },
      required: ['lab'],
      type: 'object',
    },
    name: 'generate_style_presets',
    title: 'Generate ToonLab style presets',
  }),
  Object.freeze({
    annotations: { readOnlyHint: true },
    description: 'Validate an editable recipe or resolved runtime preset against the selected lab schema.',
    inputSchema: {
      additionalProperties: false,
      properties: {
        document: { type: ['object', 'string'] },
        kind: { enum: ['recipe', 'preset'], type: 'string' },
        lab: { enum: LAB_IDS, type: 'string' },
      },
      required: ['document', 'kind', 'lab'],
      type: 'object',
    },
    name: 'validate_style_document',
    title: 'Validate a ToonLab style document',
  }),
]);

export function isStyleLabTool(name) {
  return STYLE_LAB_TOOLS.some((tool) => tool.name === name);
}

export async function callStyleLabTool(name, args, context = {}) {
  if (name === 'list_style_labs') return listStyleLabs();
  if (name === 'create_style_recipe') return createStyleRecipe(args, context);
  if (name === 'generate_style_presets') return generateStylePresets(args, context);
  if (name === 'validate_style_document') return validateStyleDocument(args);
  throw new Error(`Unknown style-lab tool "${name}".`);
}
