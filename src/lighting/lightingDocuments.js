import {
  LIGHT_TYPES,
  createLightDescriptor,
  validateLightDescriptor,
} from './lightDescriptors.js';
import {
  clamp,
  cloneJson,
  createValidationResult,
  finite,
  formatValidationErrors,
  isPlainObject,
  slug,
  uniqueId,
} from './utils.js';

/** Type and schema stamps for saved LightingRecipe documents. */
export const LIGHTING_RECIPE_DOCUMENT_TYPE = 'toonlab/lighting-recipe';
export const LIGHTING_RECIPE_SCHEMA_VERSION = 1;

/** Type and schema stamps for saved, reusable lighting-look documents. */
export const LIGHTING_LOOK_DOCUMENT_TYPE = 'toonlab/lighting-look';
export const LIGHTING_LOOK_SCHEMA_VERSION = 1;

export const SHADOW_POLICY_MODES = Object.freeze(['budgeted', 'manual', 'disabled']);
export const SHADOW_UPDATE_MODES = Object.freeze(['everyFrame', 'auto', 'manual']);

/** Creates a serializable recipe-level shadow policy. */
export function createShadowPolicy(value = null) {
  const source = isPlainObject(value) ? value : {};
  const allowedTypes = Array.isArray(source.allowedTypes)
    ? source.allowedTypes.filter((type) => ['directional', 'point', 'spot'].includes(type))
    : ['directional', 'point', 'spot'];
  return {
    allowedTypes: [...new Set(allowedTypes)],
    directionalCascades: Math.round(clamp(finite(source.directionalCascades, 1), 1, 4)),
    maxShadowedLights: Math.round(clamp(finite(source.maxShadowedLights, 8), 0, 128)),
    maxShadowMapPixels: Math.round(Math.max(finite(source.maxShadowMapPixels, 16_777_216), 0)),
    mode: SHADOW_POLICY_MODES.includes(source.mode) ? source.mode : 'budgeted',
    updateMode: SHADOW_UPDATE_MODES.includes(source.updateMode) ? source.updateMode : 'auto',
  };
}

/**
 * Creates a normalized, mutable LightingRecipe document.
 * All positions and distances are expressed in meters.
 */
export function createLightingRecipe(options = {}) {
  const source = isPlainObject(options) ? options : {};
  const usedIds = new Set();
  const lights = (Array.isArray(source.lights) ? source.lights : [])
    .map((entry, index) => {
      const light = createLightDescriptor(entry);
      light.id = uniqueId(light.id || `light-${index + 1}`, usedIds, 'light');
      return light;
    });

  return {
    id: slug(source.id ?? source.name, 'lighting-recipe'),
    lights,
    metadata: isPlainObject(source.metadata) ? cloneJson(source.metadata) : {},
    name: String(source.name ?? 'Untitled Lighting Recipe'),
    schemaVersion: LIGHTING_RECIPE_SCHEMA_VERSION,
    shadowPolicy: createShadowPolicy(source.shadowPolicy),
    type: LIGHTING_RECIPE_DOCUMENT_TYPE,
  };
}

/** Structural validation for untrusted or hand-edited LightingRecipe JSON. */
export function validateLightingRecipe(value) {
  const errors = [];
  const warnings = [];
  if (!isPlainObject(value)) {
    errors.push({ message: 'must be a JSON object', path: 'recipe' });
    return createValidationResult(errors, warnings);
  }
  if (value.type !== LIGHTING_RECIPE_DOCUMENT_TYPE) {
    errors.push({ message: `must equal "${LIGHTING_RECIPE_DOCUMENT_TYPE}"`, path: 'recipe.type' });
  }
  if (!Number.isInteger(Number(value.schemaVersion))) {
    errors.push({ message: 'must be an integer', path: 'recipe.schemaVersion' });
  } else if (Number(value.schemaVersion) > LIGHTING_RECIPE_SCHEMA_VERSION) {
    errors.push({
      message: `version ${value.schemaVersion} is newer than supported version ${LIGHTING_RECIPE_SCHEMA_VERSION}`,
      path: 'recipe.schemaVersion',
    });
  } else if (Number(value.schemaVersion) < 1) {
    errors.push({ message: 'must be at least 1', path: 'recipe.schemaVersion' });
  }
  if (typeof value.id !== 'string' || !value.id.trim()) {
    errors.push({ message: 'must be a non-empty string', path: 'recipe.id' });
  }
  if (!Array.isArray(value.lights)) {
    errors.push({ message: 'must be an array', path: 'recipe.lights' });
  } else {
    const ids = new Set();
    value.lights.forEach((light, index) => {
      const result = validateLightDescriptor(light, { path: `recipe.lights[${index}]` });
      errors.push(...result.errors);
      warnings.push(...result.warnings);
      if (typeof light?.id === 'string') {
        if (ids.has(light.id)) errors.push({ message: `duplicate id "${light.id}"`, path: `recipe.lights[${index}].id` });
        ids.add(light.id);
      }
    });
  }
  if (value.shadowPolicy !== undefined && !isPlainObject(value.shadowPolicy)) {
    errors.push({ message: 'must be an object', path: 'recipe.shadowPolicy' });
  }
  if (isPlainObject(value.shadowPolicy)) {
    if (value.shadowPolicy.mode !== undefined && !SHADOW_POLICY_MODES.includes(value.shadowPolicy.mode)) {
      errors.push({ message: `must be one of ${SHADOW_POLICY_MODES.join(', ')}`, path: 'recipe.shadowPolicy.mode' });
    }
    if (Array.isArray(value.shadowPolicy.allowedTypes)) {
      const unsupported = value.shadowPolicy.allowedTypes.filter((type) => !LIGHT_TYPES.includes(type));
      if (unsupported.length > 0) warnings.push({
        message: `unsupported types are ignored: ${unsupported.join(', ')}`,
        path: 'recipe.shadowPolicy.allowedTypes',
      });
    }
  }
  return createValidationResult(errors, warnings);
}

/** Throws when a LightingRecipe is structurally invalid, otherwise returns it. */
export function assertLightingRecipe(value) {
  const result = validateLightingRecipe(value);
  if (!result.valid) throw new Error(formatValidationErrors('Lighting recipe', result));
  return value;
}

/** Serializes a validated LightingRecipe document. */
export function serializeLightingRecipe(recipe, { pretty = false } = {}) {
  assertLightingRecipe(recipe);
  return JSON.stringify(recipe, null, pretty ? 2 : undefined);
}

/** Parses, validates, and normalizes a LightingRecipe JSON string or object. */
export function deserializeLightingRecipe(jsonOrObject) {
  let source = jsonOrObject;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch (error) {
      throw new Error(`Invalid lighting recipe JSON: ${error.message}`);
    }
  }
  assertLightingRecipe(source);
  return createLightingRecipe(source);
}

/**
 * Creates a versioned look document. A look owns a recipe plus portable
 * environment/post hints and a quality profile reference or inline profile.
 */
export function createLightingLook(options = {}) {
  const source = isPlainObject(options) ? options : {};
  const recipe = typeof source.recipe === 'string'
    ? source.recipe
    : createLightingRecipe(isPlainObject(source.recipe) ? source.recipe : {});
  const quality = typeof source.quality === 'string'
    ? source.quality
    : isPlainObject(source.quality) ? cloneJson(source.quality) : 'balanced';
  return {
    environment: isPlainObject(source.environment) ? cloneJson(source.environment) : {},
    id: slug(source.id ?? source.name, 'lighting-look'),
    metadata: isPlainObject(source.metadata) ? cloneJson(source.metadata) : {},
    name: String(source.name ?? 'Untitled Lighting Look'),
    post: isPlainObject(source.post) ? cloneJson(source.post) : {},
    quality,
    recipe,
    schemaVersion: LIGHTING_LOOK_SCHEMA_VERSION,
    type: LIGHTING_LOOK_DOCUMENT_TYPE,
  };
}

/** Structural validation for reusable lighting-look documents. */
export function validateLightingLook(value) {
  const errors = [];
  const warnings = [];
  if (!isPlainObject(value)) {
    errors.push({ message: 'must be a JSON object', path: 'look' });
    return createValidationResult(errors, warnings);
  }
  if (value.type !== LIGHTING_LOOK_DOCUMENT_TYPE) {
    errors.push({ message: `must equal "${LIGHTING_LOOK_DOCUMENT_TYPE}"`, path: 'look.type' });
  }
  if (!Number.isInteger(Number(value.schemaVersion))) {
    errors.push({ message: 'must be an integer', path: 'look.schemaVersion' });
  } else if (Number(value.schemaVersion) > LIGHTING_LOOK_SCHEMA_VERSION) {
    errors.push({
      message: `version ${value.schemaVersion} is newer than supported version ${LIGHTING_LOOK_SCHEMA_VERSION}`,
      path: 'look.schemaVersion',
    });
  }
  if (typeof value.id !== 'string' || !value.id.trim()) {
    errors.push({ message: 'must be a non-empty string', path: 'look.id' });
  }
  if (typeof value.recipe !== 'string') {
    const recipeResult = validateLightingRecipe(value.recipe);
    errors.push(...recipeResult.errors.map((entry) => ({ ...entry, path: `look.${entry.path}` })));
    warnings.push(...recipeResult.warnings.map((entry) => ({ ...entry, path: `look.${entry.path}` })));
  } else if (!value.recipe.trim()) {
    errors.push({ message: 'preset reference must not be empty', path: 'look.recipe' });
  }
  if (typeof value.quality !== 'string' && !isPlainObject(value.quality)) {
    errors.push({ message: 'must be a quality preset id or inline profile', path: 'look.quality' });
  }
  if (value.environment !== undefined && !isPlainObject(value.environment)) {
    errors.push({ message: 'must be an object', path: 'look.environment' });
  }
  if (value.post !== undefined && !isPlainObject(value.post)) {
    errors.push({ message: 'must be an object', path: 'look.post' });
  }
  return createValidationResult(errors, warnings);
}

export function assertLightingLook(value) {
  const result = validateLightingLook(value);
  if (!result.valid) throw new Error(formatValidationErrors('Lighting look', result));
  return value;
}

export function serializeLightingLook(look, { pretty = false } = {}) {
  assertLightingLook(look);
  return JSON.stringify(look, null, pretty ? 2 : undefined);
}

export function deserializeLightingLook(jsonOrObject) {
  let source = jsonOrObject;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch (error) {
      throw new Error(`Invalid lighting look JSON: ${error.message}`);
    }
  }
  assertLightingLook(source);
  return createLightingLook(source);
}

// Explicit aliases make the saved-preset intent discoverable without creating
// a second schema for the exact same document.
export const createLightingLookPreset = createLightingLook;
export const validateLightingLookPreset = validateLightingLook;
export const serializeLightingLookPreset = serializeLightingLook;
export const deserializeLightingLookPreset = deserializeLightingLook;
