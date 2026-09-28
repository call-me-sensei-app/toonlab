import { createWeatherMapProfile } from '../../src/cloud/index.js';

export const SKY_ATMOSPHERE_SOURCE_DOCUMENT_TYPE = 'toonlab/sky-atmosphere-source';
export const SKY_ATMOSPHERE_SOURCE_DOCUMENT_VERSION = 1;

export const SKY_ATMOSPHERE_SOURCE_OUTPUTS = Object.freeze([
  'weather-map',
  'cirrus-map',
  'moon-albedo',
  'base-shape-volume',
  'erosion-volume',
  'curl-volume',
  'atmosphere-transmittance',
  'atmosphere-multiscattering',
]);

export const SKY_ATMOSPHERE_SOURCE_QUALITIES = Object.freeze(['draft', 'production']);

const DEFAULT_RECIPE = Object.freeze({
  atmosphere: Object.freeze({
    groundAlbedo: Object.freeze([0.18, 0.17, 0.15]),
    rayleigh: 1,
    turbidity: 3.3,
  }),
  output: 'weather-map',
  quality: 'draft',
  seed: 17,
  weather: Object.freeze(createWeatherMapProfile()),
});

function finite(value, fallback) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max, fallback) {
  return Math.min(Math.max(finite(value, fallback), min), max);
}

function clampColor(value, fallback) {
  if (!Array.isArray(value) || value.length < 3) return [...fallback];
  return [0, 1, 2].map((index) => clamp(value[index], 0, 1, fallback[index]));
}

function readLabel(value, fallback = '') {
  return String(value ?? '').trim() || fallback;
}

export function createSkyAtmosphereSourceRecipe(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const atmosphere = source.atmosphere && typeof source.atmosphere === 'object'
    ? source.atmosphere
    : {};
  return {
    atmosphere: {
      groundAlbedo: clampColor(
        atmosphere.groundAlbedo,
        DEFAULT_RECIPE.atmosphere.groundAlbedo,
      ),
      rayleigh: clamp(atmosphere.rayleigh, 0, 3, DEFAULT_RECIPE.atmosphere.rayleigh),
      turbidity: clamp(atmosphere.turbidity, 1, 15, DEFAULT_RECIPE.atmosphere.turbidity),
    },
    output: SKY_ATMOSPHERE_SOURCE_OUTPUTS.includes(source.output)
      ? source.output
      : DEFAULT_RECIPE.output,
    quality: SKY_ATMOSPHERE_SOURCE_QUALITIES.includes(source.quality)
      ? source.quality
      : DEFAULT_RECIPE.quality,
    seed: Math.round(clamp(source.seed, 0, 0xffffffff, DEFAULT_RECIPE.seed)) >>> 0,
    weather: createWeatherMapProfile(source.weather),
  };
}

export function createSkyAtmosphereSourceDocument(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const label = readLabel(source.label ?? source.name, 'Clear day sources');
  return {
    description: String(source.description ?? 'Deterministic source maps for ToonLab sky and clouds.'),
    id: readLabel(source.id, 'clear-day-sources'),
    label,
    recipe: createSkyAtmosphereSourceRecipe(source.recipe),
    type: SKY_ATMOSPHERE_SOURCE_DOCUMENT_TYPE,
    version: SKY_ATMOSPHERE_SOURCE_DOCUMENT_VERSION,
  };
}

export function validateSkyAtmosphereSourceDocument(input) {
  let source = input;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch (error) {
      return { errors: [`Invalid source recipe JSON: ${error.message}`], ok: false, value: null };
    }
  }
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return { errors: ['Source recipe must be a JSON object.'], ok: false, value: null };
  }
  const errors = [];
  if (source.type !== SKY_ATMOSPHERE_SOURCE_DOCUMENT_TYPE) {
    errors.push(`Source recipe type must be "${SKY_ATMOSPHERE_SOURCE_DOCUMENT_TYPE}".`);
  }
  const version = Number(source.version);
  if (!Number.isFinite(version)) errors.push('Source recipe version must be a number.');
  else if (version > SKY_ATMOSPHERE_SOURCE_DOCUMENT_VERSION) {
    errors.push(`Source recipe version ${version} is newer than this lab supports.`);
  }
  if (!readLabel(source.id)) errors.push('Source recipe id is required.');
  if (!readLabel(source.label ?? source.name)) errors.push('Source recipe label is required.');
  if (!source.recipe || typeof source.recipe !== 'object' || Array.isArray(source.recipe)) {
    errors.push('Source recipe must contain a recipe object.');
  }
  if (source.recipe?.output && !SKY_ATMOSPHERE_SOURCE_OUTPUTS.includes(source.recipe.output)) {
    errors.push(`Unknown source output "${source.recipe.output}".`);
  }
  if (source.recipe?.quality && !SKY_ATMOSPHERE_SOURCE_QUALITIES.includes(source.recipe.quality)) {
    errors.push(`Unknown bake quality "${source.recipe.quality}".`);
  }
  return {
    errors,
    ok: errors.length === 0,
    value: errors.length === 0 ? createSkyAtmosphereSourceDocument(source) : null,
  };
}

export function serializeSkyAtmosphereSourceDocument(document) {
  return `${JSON.stringify(createSkyAtmosphereSourceDocument(document), null, 2)}\n`;
}
