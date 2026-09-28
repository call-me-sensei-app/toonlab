// The SkyParams envelope: the serialized preset schema and the contract between
// the labs, the presets, and the SkySystem.
//
//   { atmosphere: { ...physical, style }, sun, time,
//     cloud: { shape, lighting, wind, cirrus, haze, fade, style },
//     noise, godRays, nightSky }
//
// Per the spec's module ownership table this file owns the *envelope* —
// validate, serialize, round-trip — and not one of the groups inside it. Every
// group's names and defaults come from that group's owner by import:
//
//   cloud.*      -> ../cloud/cloudParams.js
//   atmosphere   -> ./atmosphereParams.js
//   sun          -> ./sunDriver.js
//   time, moon   -> ./timeOfDay.js
//   godRays      -> ./godRays.js
//   nightSky     -> ./nightSky.js
//   noise profile-> ../cloud/noise/weatherMap.js
//
// The envelope adds only what validation needs and an owner does not publish:
// the lab's slider domain, the hard clamp, and the wrap window. When a group's
// owner already publishes a range it is used verbatim as both, so the schema
// layer can never accept a value the owner would then silently move.
//
// Colour representation, per the owner's decision: live param objects hold
// THREE.Color in linear RGB; serialized documents hold [r, g, b] triples so they
// stay plain JSON. This layer converts at that boundary and nothing else does.

import {
  CLOUD_PARAMS_FIELD_SCHEMA,
  CLOUD_PARAM_GROUP_IDS,
  cloudParamsToLive,
  normalizeCloudParams,
} from '../cloud/cloudParams.js';
import {
  CLOUD_STYLE_FIELD_SCHEMA,
  cloudStyleParamsToLive,
  normalizeCloudStyleParams,
  toSerializableCloudStyleParams,
} from '../cloud/cloudStyle.js';
import { WEATHER_MAP_PROFILE_FIELDS, WEATHER_MAP_RESOLUTIONS } from '../cloud/noise/weatherMap.js';
import {
  DIMENSIONLESS,
  assertSchemaInvariants,
  colorFieldsToColors,
  deepFreeze,
  describe,
  fromOwnerSchema,
  hasValue,
  isObject,
  normalizeBlock,
  num,
  reportUnknownKeys,
  toChannels,
} from '../cloud/paramSchema.js';
import { ATMOSPHERE_PARAM_SCHEMA } from './atmosphereParams.js';
import { GOD_RAYS_PARAM_SCHEMA } from './godRays.js';
import { NIGHT_SKY_PARAM_SCHEMA } from './nightSky.js';
import {
  SKY_COLOR_FIELD_SCHEMA,
  normalizeSkyColorParams,
  skyColorParamsToLive,
  toSerializableSkyColorParams,
} from './skyColor.js';
import { DEFAULT_SUN_PARAMS, SUN_COLOR_FIELD } from './sunDriver.js';
import {
  DEFAULT_MOON_PARAMS,
  DEFAULT_TIME_OF_DAY_PARAMS,
  MOON_COLOR_FIELD,
  wrapDayTime,
} from './timeOfDay.js';

export const SKY_PARAMS_DOCUMENT_TYPE = 'toonlab/sky-params';
export const SKY_PARAMS_SCHEMA_VERSION = 9;

// ---------------------------------------------------------------------------
// atmosphere — owner: ./atmosphereParams.js
// ---------------------------------------------------------------------------

// The owner clamps every field to its own published range, so that range is the
// hard limit here too. Nothing is re-stated: names, defaults, units, and ranges
// all arrive from ATMOSPHERE_PARAM_SCHEMA.
const ATMOSPHERE_FIELDS = fromOwnerSchema(ATMOSPHERE_PARAM_SCHEMA);

// ---------------------------------------------------------------------------
// sun — owner: ./sunDriver.js
// ---------------------------------------------------------------------------

// Values come from DEFAULT_SUN_PARAMS. In particular `azimuth` is the owner's
// 180: at the default clock (time 0.5, latitude 45) the sun transits due south,
// which is what sunDriver.sunDirectionAt solves and what the spec's arc
// describes. A default of 0 (+Z, due north) put the schema 90 degrees away from
// the clock, so the sky snapped on the first tick.
const SUN_FIELDS = Object.freeze({
  elevation: num({
    description: 'Altitude the sun sits at. 0 is the horizon, 90 straight overhead.',
    label: 'Elevation',
    max: 90,
    min: -90,
    range: [-90, 90, 0.1],
    unit: 'degrees',
    uniform: false,
    value: DEFAULT_SUN_PARAMS.elevation,
  }),
  azimuth: num({
    description: 'Compass direction the sun sits along. 0 faces +Z, 90 faces +X.',
    label: 'Azimuth',
    range: [-180, 180, 0.1],
    unit: 'degrees',
    uniform: false,
    value: DEFAULT_SUN_PARAMS.azimuth,
    wrap: [-180, 180],
  }),
  intensity: num({
    description: 'Sun radiance at full daylight, written to peakIntensity. The brightness anchor for the whole sky.',
    label: 'Intensity',
    min: 0,
    range: [0, 40, 0.1],
    unit: DIMENSIONLESS,
    uniform: false,
    value: DEFAULT_SUN_PARAMS.intensity,
  }),
  // The owner's descriptor verbatim, not a second copy of it. The live sun
  // clamps every colour write to this same field, so the channel maximum cannot
  // drift between the sun standing in the lab and the preset written from it.
  color: SUN_COLOR_FIELD,
  discSize: num({
    description: 'Angular size of the sun disc, as 1 - cos of the angular radius. The default is roughly 1.4 degrees.',
    label: 'Disc Size',
    // The owner clamps to 0..2: 0 is a point and 2 is the whole sphere.
    max: 2,
    min: 0,
    range: [0.00005, 0.005, 0.00001],
    unit: DIMENSIONLESS,
    value: DEFAULT_SUN_PARAMS.discSize,
  }),
});

// ---------------------------------------------------------------------------
// time / moon — owner: ./timeOfDay.js
// ---------------------------------------------------------------------------

const MOON_FIELDS = Object.freeze({
  phase: num({
    description: 'Moon phase: 0 new and dark, 0.5 full, 1 new again. Brightness only — the arc is unchanged.',
    label: 'Phase',
    max: 1,
    min: 0,
    range: [0, 1, 0.001],
    unit: DIMENSIONLESS,
    value: DEFAULT_MOON_PARAMS.phase,
  }),
  intensity: num({
    description: 'Master over everything the moon lights: the disc, the sky ambient, and the light on cloud edges.',
    label: 'Moon Intensity',
    min: 0,
    range: [0, 4, 0.01],
    unit: DIMENSIONLESS,
    value: DEFAULT_MOON_PARAMS.intensity,
  }),
  discBrightness: num({
    description: 'Brightens the moon disc alone, on top of intensity.',
    label: 'Disc Brightness',
    min: 0,
    range: [0, 40, 0.1],
    unit: DIMENSIONLESS,
    value: DEFAULT_MOON_PARAMS.discBrightness,
  }),
  angularSize: num({
    description: 'Angular size of the moon disc, as 1 - cos of the angular radius. Same convention as sun.discSize.',
    label: 'Angular Size',
    max: 2,
    min: 0,
    range: [0.00005, 0.005, 0.00001],
    unit: DIMENSIONLESS,
    value: DEFAULT_MOON_PARAMS.angularSize,
  }),
  // The owner's descriptor verbatim, for the reason sun.color adopts its own.
  color: MOON_COLOR_FIELD,
  ambient: num({
    description: 'Ambient lift the moon adds to the night sky, which is what keeps night from going pitch black.',
    label: 'Night Ambient',
    max: 1,
    min: 0,
    range: [0, 1, 0.001],
    unit: DIMENSIONLESS,
    value: DEFAULT_MOON_PARAMS.ambient,
  }),
});

const TIME_FIELDS = Object.freeze({
  time: num({
    description: 'Master clock over one day: 0 midnight, 0.25 sunrise, 0.5 noon, 0.75 sunset.',
    // The clock's wrap is the owner's, not a second copy of it: 1 folds to 0
    // here exactly as it does on every driver tick.
    fold: wrapDayTime,
    label: 'Time',
    range: [0, 1, 0.0001],
    unit: DIMENSIONLESS,
    value: DEFAULT_TIME_OF_DAY_PARAMS.time,
  }),
  autoAdvanceSecondsPerDay: num({
    description: 'Real seconds one full day takes. 0 pauses the clock, which also frees sun.direction.',
    label: 'Seconds Per Day',
    min: 0,
    range: [0, 3600, 1],
    unit: 's',
    uniform: false,
    value: DEFAULT_TIME_OF_DAY_PARAMS.autoAdvanceSecondsPerDay,
  }),
  latitude: num({
    description: 'Observer latitude. 0 puts the noon sun overhead; 90 circles sun, moon, and stars parallel to the horizon.',
    label: 'Latitude',
    max: 90,
    min: -90,
    range: [-90, 90, 0.1],
    unit: 'degrees',
    uniform: false,
    value: DEFAULT_TIME_OF_DAY_PARAMS.latitude,
  }),
  azimuth: num({
    description: 'Rotates the whole celestial sphere — sun path, moon, and stars together — about the vertical axis.',
    label: 'Celestial Azimuth',
    range: [-180, 180, 0.1],
    unit: 'degrees',
    uniform: false,
    value: DEFAULT_TIME_OF_DAY_PARAMS.azimuth,
    wrap: [-180, 180],
  }),
});

// ---------------------------------------------------------------------------
// noise — owner: ../cloud/noise/weatherMap.js (profile)
// ---------------------------------------------------------------------------

// The profile's field set, ranges, and defaults are the generator's. Every value
// is CPU-side, so none of them is a uniform.
const WEATHER_PROFILE_FIELDS = fromOwnerSchema(
  WEATHER_MAP_PROFILE_FIELDS,
  {},
  { uniform: false },
);

const NOISE_WEATHER_FIELDS = Object.freeze({
  resolution: num({
    description: `Square resolution of the generated coverage map. One of ${WEATHER_MAP_RESOLUTIONS.join(', ')}. The quality tier sets it; a preset may override it.`,
    // Constrained to the generator's legal set, not to a range spanning it. A
    // range accepted 384 and the generator then baked 256, so a preset
    // round-tripped as 384 while the texture was something else — a document
    // that disagrees with the pixels, reported by nothing.
    integer: true,
    label: 'Weather Resolution',
    max: WEATHER_MAP_RESOLUTIONS[WEATHER_MAP_RESOLUTIONS.length - 1],
    min: WEATHER_MAP_RESOLUTIONS[0],
    options: WEATHER_MAP_RESOLUTIONS,
    range: [WEATHER_MAP_RESOLUTIONS[0], WEATHER_MAP_RESOLUTIONS[WEATHER_MAP_RESOLUTIONS.length - 1], 1],
    unit: 'pixels',
    uniform: false,
    // The default tier is `high`, so the default resolution is its 1024.
    value: 1024,
  }),
  seed: num({
    // The generator takes the seed as a sibling of the profile rather than a
    // field inside it, and the spec's lab-ownership list names it alongside
    // `resolution` and `profile`. It has to live in the document: without it a
    // preset reloads with a different cloud layout, so a sky cannot round-trip.
    description: 'PRNG seed for the coverage field. The same seed always regenerates the same map.',
    integer: true,
    label: 'Seed',
    max: 2147483647,
    min: 0,
    range: [0, 65535, 1],
    unit: DIMENSIONLESS,
    uniform: false,
    value: 1,
  }),
});

// ---------------------------------------------------------------------------
// godRays — owner: ./godRays.js       nightSky — owner: ./nightSky.js
// ---------------------------------------------------------------------------

// Both owner modules currently hold only their param group; the shaft march and
// the star panorama land in those same files later. Declaring the groups there
// from the start is what keeps that additive: the effect author adds TSL to
// godRays.js / nightSky.js and never edits this file, and there is no moment
// where a default exists in two modules — which is the state that makes an
// `export *` barrel throw.
const GOD_RAYS_FIELDS = fromOwnerSchema(
  GOD_RAYS_PARAM_SCHEMA,
  // Chosen per frame on the CPU from which light is active, not sampled in the
  // shader, so it is not a uniform.
  { moonGodRayScale: { uniform: false } },
);

const NIGHT_SKY_FIELDS = fromOwnerSchema(NIGHT_SKY_PARAM_SCHEMA);

// ---------------------------------------------------------------------------
// Published schema
// ---------------------------------------------------------------------------

/**
 * Field metadata for the whole SkyParams document. A node is a field descriptor
 * when it carries a `type`; otherwise it is a nested block of descriptors.
 */
export const SKY_PARAMS_FIELD_SCHEMA = Object.freeze({
  atmosphere: Object.freeze({
    ...ATMOSPHERE_FIELDS,
    style: SKY_COLOR_FIELD_SCHEMA,
  }),
  cloud: Object.freeze({
    ...CLOUD_PARAMS_FIELD_SCHEMA,
    style: CLOUD_STYLE_FIELD_SCHEMA,
  }),
  godRays: GOD_RAYS_FIELDS,
  nightSky: NIGHT_SKY_FIELDS,
  noise: Object.freeze({
    weather: Object.freeze({
      ...NOISE_WEATHER_FIELDS,
      profile: WEATHER_PROFILE_FIELDS,
    }),
  }),
  sun: SUN_FIELDS,
  time: Object.freeze({ ...TIME_FIELDS, moon: MOON_FIELDS }),
});

assertSchemaInvariants('skyParams', SKY_PARAMS_FIELD_SCHEMA);

export const SKY_PARAMS_BLOCK_IDS = Object.freeze([
  'atmosphere',
  'sun',
  'time',
  'cloud',
  'noise',
  'godRays',
  'nightSky',
]);

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

// The far-fade band divides by its own width, so the end has to clear the start.
//
// Raising the end runs after the field clamps, so it has to respect the end's
// own maximum itself — otherwise a start at the top of the range pushes the end
// one metre past it and the pair settles at a stable point *outside* the schema.
// When there is no headroom left, the start gives way instead.
function farFadeRule(path, params, report) {
  if (params.fogFarFadeEnd <= params.fogFarFadeStart) {
    // ATMOSPHERE_FIELDS, not the owner schema: the limit is added by the
    // fromOwnerSchema() conversion, so the owner's own entry has no `limit`.
    const endMax = ATMOSPHERE_FIELDS.fogFarFadeEnd.limit.max;
    const corrected = Math.min(params.fogFarFadeStart + 1, endMax);
    if (corrected > params.fogFarFadeStart) {
      report.warnings.push(
        `${path}.fogFarFadeEnd ${params.fogFarFadeEnd} was raised to ${corrected} to clear fogFarFadeStart.`,
      );
      params.fogFarFadeEnd = corrected;
    } else {
      const start = endMax - 1;
      report.warnings.push(
        `${path}.fogFarFadeStart ${params.fogFarFadeStart} was lowered to ${start}: `
        + `fogFarFadeEnd cannot clear it without exceeding its maximum of ${endMax}.`,
      );
      params.fogFarFadeStart = start;
      params.fogFarFadeEnd = endMax;
    }
  }
  return params;
}

function normalizeNoiseBlock(path, input, fallback, report) {
  if (hasValue(input) && !isObject(input)) {
    report.errors.push(`${path} must be an object (got ${describe(input)}).`);
  }
  const source = isObject(input) ? input : {};
  const base = isObject(fallback) ? fallback : {};
  const weatherSource = isObject(source.weather) ? source.weather : {};
  const weatherBase = isObject(base.weather) ? base.weather : {};
  if (hasValue(source.weather) && !isObject(source.weather)) {
    report.errors.push(`${path}.weather must be an object (got ${describe(source.weather)}).`);
  }
  const weather = normalizeBlock(
    `${path}.weather`,
    NOISE_WEATHER_FIELDS,
    weatherSource,
    weatherBase,
    report,
    { ignored: ['profile'] },
  );
  weather.profile = normalizeBlock(
    `${path}.weather.profile`,
    WEATHER_PROFILE_FIELDS,
    weatherSource.profile,
    weatherBase.profile,
    report,
  );
  reportUnknownKeys(path, { weather: true }, source, report);
  return { weather };
}

function normalizeTimeBlock(path, input, fallback, report) {
  if (hasValue(input) && !isObject(input)) {
    report.errors.push(`${path} must be an object (got ${describe(input)}).`);
  }
  const source = isObject(input) ? input : {};
  const base = isObject(fallback) ? fallback : {};
  const params = normalizeBlock(path, TIME_FIELDS, source, base, report, { ignored: ['moon'] });
  params.moon = colorFieldsToColors(
    MOON_FIELDS,
    normalizeBlock(`${path}.moon`, MOON_FIELDS, source.moon, base.moon, report),
  );
  return params;
}

function buildSkyParams(input, fallback, report) {
  if (hasValue(input) && !isObject(input)) {
    report.errors.push(`SkyParams must be an object (got ${describe(input)}).`);
  }
  const source = isObject(input) ? input : {};
  const base = isObject(fallback) ? fallback : {};
  const params = {
    atmosphere: {
      ...colorFieldsToColors(
        ATMOSPHERE_FIELDS,
        normalizeBlock(
          'atmosphere',
          ATMOSPHERE_FIELDS,
          source.atmosphere,
          base.atmosphere,
          report,
          { ignored: ['style'], rule: farFadeRule },
        ),
      ),
      style: skyColorParamsToLive(normalizeSkyColorParams(
        'atmosphere.style',
        source.atmosphere?.style,
        base.atmosphere?.style,
        report,
      )),
    },
    cloud: {
      ...cloudParamsToLive(normalizeCloudParams('cloud', source.cloud, base.cloud, report)),
      style: cloudStyleParamsToLive(normalizeCloudStyleParams(
        'cloud.style',
        source.cloud?.style,
        base.cloud?.style,
        report,
      )),
    },
    godRays: normalizeBlock('godRays', GOD_RAYS_FIELDS, source.godRays, base.godRays, report),
    nightSky: normalizeBlock('nightSky', NIGHT_SKY_FIELDS, source.nightSky, base.nightSky, report),
    noise: normalizeNoiseBlock('noise', source.noise, base.noise, report),
    sun: colorFieldsToColors(
      SUN_FIELDS,
      normalizeBlock('sun', SUN_FIELDS, source.sun, base.sun, report),
    ),
    time: normalizeTimeBlock('time', source.time, base.time, report),
  };
  reportUnknownKeys('SkyParams', Object.fromEntries(
    SKY_PARAMS_BLOCK_IDS.map((id) => [id, true]),
  ), source, report);
  return params;
}

export const DEFAULT_SKY_PARAMS = deepFreeze(
  buildSkyParams({}, null, { errors: [], warnings: [] }),
);

// DEFAULT_GOD_RAYS_PARAMS and DEFAULT_NIGHT_SKY_PARAMS are deliberately NOT
// re-exported here. They belong to ./godRays.js and ./nightSky.js, and both of
// those feed the same barrel this file does — a second binding of either name
// would be the `conflicting star exports` SyntaxError all over again. Read them
// off DEFAULT_SKY_PARAMS.godRays / .nightSky, or import the owner.
//
// The `noise` block is the envelope's own composition rather than one owner's
// group: the profile's fields come from noise/weatherMap.js while `resolution`
// is tier-driven (skyQualityTiers.weatherMapResolution) and `seed` has no owner
// module at all, so the default for the assembled block is published here.
export const DEFAULT_NOISE_PARAMS = DEFAULT_SKY_PARAMS.noise;

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

/**
 * Fills a partial SkyParams out to a complete, clamped one. Anything absent
 * falls back to `base` when given, otherwise to the schema defaults.
 */
export function createSkyParams(input = {}, base = null) {
  return buildSkyParams(input, base, { errors: [], warnings: [] });
}

/** Validates and normalizes a SkyParams object or JSON string. */
export function validateSkyParams(input, base = null) {
  let source = input;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch (error) {
      return { errors: [`Invalid SkyParams JSON: ${error.message}`], ok: false, value: null, warnings: [] };
    }
  }
  const report = { errors: [], warnings: [] };
  const value = buildSkyParams(source, base, report);
  return {
    errors: report.errors,
    ok: report.errors.length === 0,
    value: report.errors.length === 0 ? value : null,
    warnings: report.warnings,
  };
}

export const parseSkyParams = validateSkyParams;

function readText(value) {
  return String(value ?? '').trim();
}

// Built from params that have already been validated. Running the normalizer in
// here instead is what made createSkyParamsDocument unable to report anything:
// the validator only ever saw params this function had already sanitised.
function canonicalDocument(source, params) {
  const id = readText(source.id);
  return {
    description: String(source.description ?? ''),
    id,
    label: readText(source.label ?? source.title) || id,
    params,
    type: SKY_PARAMS_DOCUMENT_TYPE,
    version: SKY_PARAMS_SCHEMA_VERSION,
  };
}

/** Validates and normalizes a portable SkyParams document or JSON string. */
export function validateSkyParamsDocument(input) {
  let source = input;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch (error) {
      return { errors: [`Invalid SkyParams JSON: ${error.message}`], ok: false, value: null, warnings: [] };
    }
  }
  if (!isObject(source)) {
    return {
      errors: ['SkyParams document must be a JSON object.'],
      ok: false,
      value: null,
      warnings: [],
    };
  }
  const errors = [];
  if (source.type !== SKY_PARAMS_DOCUMENT_TYPE) {
    errors.push(`SkyParams document type must be "${SKY_PARAMS_DOCUMENT_TYPE}".`);
  }
  const version = Number(source.version ?? source.schemaVersion ?? SKY_PARAMS_SCHEMA_VERSION);
  if (!Number.isFinite(version)) errors.push('SkyParams document version must be a number.');
  else if (version > SKY_PARAMS_SCHEMA_VERSION) {
    errors.push(
      `SkyParams version ${version} is newer than supported version ${SKY_PARAMS_SCHEMA_VERSION}.`,
    );
  }
  if (!readText(source.id)) errors.push('SkyParams document id is required.');
  const params = validateSkyParams(source.params ?? source.sky ?? {});
  errors.push(...params.errors);
  const warnings = [...params.warnings];
  if (Number.isFinite(version) && version < SKY_PARAMS_SCHEMA_VERSION) {
    warnings.push(
      `SkyParams version ${version} was migrated to version ${SKY_PARAMS_SCHEMA_VERSION}; optional style modules default to the V1 bypass.`,
    );
  }
  return {
    errors,
    ok: errors.length === 0,
    value: errors.length === 0 ? canonicalDocument(source, params.value) : null,
    warnings,
  };
}

export const parseSkyParamsDocument = validateSkyParamsDocument;

/**
 * Builds a canonical document, throwing on anything the validator rejects. The
 * raw definition is what gets validated — a hex colour, a non-finite number, or
 * a structurally wrong block reaches the validator and raises.
 */
export function createSkyParamsDocument(id, definition = {}) {
  const source = isObject(definition) ? definition : {};
  const result = validateSkyParamsDocument({
    description: source.description,
    id: id ?? source.id,
    label: source.label ?? source.title,
    params: source.params ?? source.sky ?? {},
    // Passed through rather than assumed, so a document from a newer schema
    // raises instead of being silently relabelled as this one.
    type: source.type ?? SKY_PARAMS_DOCUMENT_TYPE,
    version: source.version ?? source.schemaVersion ?? SKY_PARAMS_SCHEMA_VERSION,
  });
  if (!result.ok) throw new Error(result.errors.join(' '));
  return result.value;
}

/**
 * Deep-copies params into a JSON-safe shape. Colors become `[r, g, b]` triples
 * so linear values above 1 survive the trip; `JSON.stringify` on a THREE.Color
 * would collapse it to an sRGB hex integer.
 *
 * Derived fields are written too, so a document is readable without recomputing
 * them. Reloading one is warning-clean because the validator only reports a
 * supplied derived value that *disagrees* with the rule.
 */
export function toSerializableSkyParams(params) {
  const source = createSkyParams(params);
  const flatten = (fields, block) => Object.fromEntries(
    Object.entries(fields).map(([key, field]) => [
      key,
      field.type === 'color' ? toChannels(block[key]) : block[key],
    ]),
  );
  const cloud = {};
  for (const id of CLOUD_PARAM_GROUP_IDS) {
    cloud[id] = flatten(CLOUD_PARAMS_FIELD_SCHEMA[id], source.cloud[id]);
  }
  cloud.style = toSerializableCloudStyleParams(source.cloud.style);
  return {
    atmosphere: {
      ...flatten(ATMOSPHERE_FIELDS, source.atmosphere),
      style: toSerializableSkyColorParams(source.atmosphere.style),
    },
    cloud,
    godRays: flatten(GOD_RAYS_FIELDS, source.godRays),
    nightSky: flatten(NIGHT_SKY_FIELDS, source.nightSky),
    noise: {
      weather: {
        ...flatten(NOISE_WEATHER_FIELDS, source.noise.weather),
        profile: flatten(WEATHER_PROFILE_FIELDS, source.noise.weather.profile),
      },
    },
    sun: flatten(SUN_FIELDS, source.sun),
    time: {
      ...flatten(TIME_FIELDS, source.time),
      moon: flatten(MOON_FIELDS, source.time.moon),
    },
  };
}

export function serializeSkyParams(params, { pretty = true } = {}) {
  return JSON.stringify(toSerializableSkyParams(params), null, pretty ? 2 : 0);
}

export function serializeSkyParamsDocument(idOrDocument, definition = {}, { pretty = true } = {}) {
  const document = isObject(idOrDocument) && idOrDocument.type === SKY_PARAMS_DOCUMENT_TYPE
    ? createSkyParamsDocument(idOrDocument.id, idOrDocument)
    : createSkyParamsDocument(idOrDocument, definition);
  return JSON.stringify({
    ...document,
    params: toSerializableSkyParams(document.params),
  }, null, pretty ? 2 : 0);
}
