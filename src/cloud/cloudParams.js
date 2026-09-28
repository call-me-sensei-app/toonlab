// The six live cloud parameter groups the raymarcher reads: shape, lighting,
// wind, cirrus, haze, fade. Every name, default, and unit is the compatibility
// surface — see docs/sky-cloud-parameters.md.
//
// This module is the sole owner of those six groups, per the spec's module
// ownership table. It deliberately declares nothing else: `atmosphere` belongs
// to sky/atmosphereParams.js, `sun` to sky/sunDriver.js, `time` (with `moon`)
// to sky/timeOfDay.js, the weather-map profile to noise/weatherMap.js, and the
// SkyParams envelope that stitches them together to sky/skyParams.js. Declaring
// a second copy of any of them is what made `export *` barrels throw
// conflicting-star-export errors and let the same field carry two different
// defaults.
//
// Colors are linear RGB. Live params hold THREE.Color; serialized documents hold
// [r, g, b] triples. paramSchema.js converts at that boundary.

import * as THREE from 'three';
import { uniform } from 'three/tsl';

import {
  DIMENSIONLESS,
  assertSchemaInvariants,
  channelsToColor,
  col,
  colorFieldsToColors,
  deepFreeze,
  describe,
  hasValue,
  isObject,
  normalizeBlock,
  normalizeChannels,
  normalizeNumber,
  num,
  reportDerived,
  reportUnknownKeys,
} from './paramSchema.js';

/** `fade.maxMarchDist` is always `horizonMeltEnd` plus this margin. */
export const MAX_MARCH_DIST_MARGIN = 2000;

// Scroll the shape field back along the wind bearing. Keeping the distance in
// its own accumulator makes evolution independent from bulk drift while both
// remain in the same coordinate frame.
const evolutionAxis = new THREE.Vector3(0, 0, 1);
export const CLOUD_EVOLUTION_AXIS = Object.freeze(evolutionAxis.toArray());

// ---------------------------------------------------------------------------
// cloud.shape — where cloud exists and what silhouette it cuts
// ---------------------------------------------------------------------------

const CLOUD_SHAPE_FIELDS = Object.freeze({
  altitude: num({
    description: 'Height of the cloud bases above the ground.',
    label: 'Altitude',
    min: 0,
    range: [0, 8000, 10],
    unit: 'm',
    value: 1400,
  }),
  thickness: num({
    description: 'Height of the cloud shell, measured up from the altitude.',
    label: 'Thickness',
    // The shell height divides every height fraction in the marcher.
    min: 1,
    range: [100, 12000, 10],
    unit: 'm',
    value: 2800,
  }),
  coverage: num({
    description: 'How much of the sky holds cloud. 0 clears it; 1 uses the full coverage map.',
    label: 'Coverage',
    min: 0,
    range: [0, 1, 0.001],
    unit: DIMENSIONLESS,
    value: 1,
  }),
  density: num({
    description: 'How much light a metre of cloud blocks. Higher reads as thicker, more opaque cloud.',
    label: 'Density',
    min: 0,
    range: [0, 0.5, 0.001],
    unit: '1/m',
    value: 0.048,
  }),
  baseScale: num({
    description: 'World distance the cloud-shape noise spans before it repeats. Larger makes individual clouds bigger.',
    label: 'Base Scale',
    min: 1,
    range: [500, 40000, 10],
    unit: 'm',
    value: 8000,
  }),
  baseStrength: num({
    description: 'Scales the cloud-shape noise. Raising it swells the tops without moving the bases.',
    label: 'Base Strength',
    min: 0,
    range: [0, 3, 0.01],
    unit: DIMENSIONLESS,
    value: 1,
  }),
  weatherScale: num({
    description: 'World distance the coverage map spans before it repeats. Push the repeat past the horizon and it stops reading as tiling.',
    label: 'Weather Scale',
    min: 1,
    range: [2000, 200000, 100],
    unit: 'm',
    value: 40000,
  }),
  erosionScaleBaseMultiplier: num({
    description: 'Size of the erosion detail relative to baseScale. Lower values carve finer wisps; 0 removes the erosion field entirely.',
    label: 'Erosion Scale',
    // The docs publish the useful range as 0–1, so 0 has to be storable. It
    // means "no erosion detail", not "detail of size zero": the marcher must
    // skip the erosion sample rather than divide the sample position by
    // baseScale * 0. Clamping this to 0.001 instead put the published low end
    // out of reach and made a slider parked at its own minimum warn.
    max: 1,
    min: 0,
    range: [0, 1, 0.01],
    unit: DIMENSIONLESS,
    value: 0.5,
  }),
  erosionShape: num({
    description: 'Character of the erosion. 0 gives billowy cauliflower edges; 1 gives torn wispy ones.',
    label: 'Erosion Shape',
    max: 1,
    min: 0,
    range: [0, 1, 0.01],
    unit: DIMENSIONLESS,
    value: 0,
  }),
  erosionStrengthBase: num({
    description: 'How hard erosion carves at the bottom of the cloud.',
    label: 'Erosion Base',
    min: 0,
    range: [0, 5, 0.01],
    unit: DIMENSIONLESS,
    value: 1,
  }),
  erosionStrengthPeak: num({
    description: 'How hard erosion carves at the top of the cloud.',
    label: 'Erosion Peak',
    min: 0,
    range: [0, 5, 0.01],
    unit: DIMENSIONLESS,
    value: 1,
  }),
  edgeSoftness: num({
    description: 'How gradually cloud fades in at the base of the shell.',
    label: 'Edge Softness',
    max: 1,
    min: 0,
    range: [0, 0.5, 0.001],
    unit: 'shell height fraction',
    value: 0.05,
  }),
  edgeSoftnessFalloff: num({
    description: 'Tightens edgeSoftness as height climbs, so bases stay soft while tops stay crisp. 1 holds the same softness everywhere.',
    label: 'Softness Falloff',
    min: 0,
    range: [0, 4, 0.01],
    unit: '1/km',
    value: 1,
  }),
  baseWeatherStrength: num({
    description: 'Eats the bottoms of thin clouds while leaving thick ones intact, so a patchy sky lifts off the shell floor.',
    label: 'Base Carve',
    min: 0,
    range: [0, 2, 0.01],
    unit: DIMENSIONLESS,
    value: 0,
  }),
  baseWeatherHeightStart: num({
    description: 'Height where baseWeatherStrength carves hardest. Nearer 0 bites at the very bottom of the shell.',
    label: 'Base Carve Start',
    max: 1,
    min: 0,
    range: [0, 1, 0.001],
    unit: 'shell height fraction',
    value: 0.05,
  }),
  baseWeatherHeightEnd: num({
    description: 'Height above which baseWeatherStrength stops carving.',
    label: 'Base Carve End',
    max: 1,
    min: 0,
    range: [0, 1, 0.001],
    unit: 'shell height fraction',
    value: 0.1,
  }),
  horizonCoverageAmount: num({
    description: 'Adds coverage to distant cloud, banking it up along the horizon while the sky overhead stays as-is. May exceed 1.',
    label: 'Horizon Bank',
    min: 0,
    range: [0, 2, 0.01],
    unit: DIMENSIONLESS,
    value: 0,
  }),
  horizonCoverageStart: num({
    description: 'How far from the camera the horizon bank starts building.',
    label: 'Horizon Bank Start',
    min: 0,
    range: [0, 60000, 100],
    unit: 'm',
    value: 10000,
  }),
  horizonCoverageRamp: num({
    description: 'Distance over which the horizon bank builds from normal coverage to full.',
    label: 'Horizon Bank Ramp',
    // Divides the bank ramp.
    min: 1,
    range: [100, 80000, 100],
    unit: 'm',
    value: 20000,
  }),
});

// ---------------------------------------------------------------------------
// cloud.lighting — how light moves through a cubic metre of cloud
// ---------------------------------------------------------------------------

const CLOUD_LIGHTING_FIELDS = Object.freeze({
  scatteringAlbedo: num({
    description: 'How much light survives each bounce inside a cloud. 1 loses nothing and reads bright white; lower reads grey and heavy.',
    label: 'Scattering Albedo',
    max: 1,
    min: 0,
    range: [0, 1, 0.001],
    unit: DIMENSIONLESS,
    value: 0.9,
  }),
  powderStrength: num({
    description: 'Darkens the thin outer edges of sunlit cloud, which is what stops them reading as flat cotton.',
    label: 'Powder',
    min: 0,
    range: [0, 4, 0.01],
    unit: DIMENSIONLESS,
    value: 1,
  }),
  ambientIntensity: num({
    description: 'Skylight filling the parts of a cloud the sun does not reach.',
    label: 'Ambient',
    min: 0,
    range: [0, 3, 0.01],
    unit: DIMENSIONLESS,
    value: 0.6,
  }),
  groundBounceAlbedo: col({
    description: 'Colour of the ground below the clouds, which tints the light bouncing up onto their undersides.',
    label: 'Ground Bounce',
    value: [0.18, 0.17, 0.15],
  }),
  baseShadowStrength: num({
    description: 'Darkens cloud bottoms. 0 leaves them lit; 1 shades them to the floor of the shell.',
    label: 'Base Shadow',
    max: 1,
    min: 0,
    range: [0, 1, 0.01],
    unit: DIMENSIONLESS,
    value: 0,
  }),
  baseShadowHeight: num({
    description: 'How far up the cloud the base darkening reaches before light returns to full.',
    label: 'Base Shadow Height',
    max: 1,
    min: 0,
    range: [0, 1, 0.01],
    unit: 'shell height fraction',
    value: 0.6,
  }),
  moonGain: num({
    description: 'Moonlight falling on cloud edges at night.',
    label: 'Moon Gain',
    min: 0,
    range: [0, 4, 0.01],
    unit: DIMENSIONLESS,
    value: 1,
  }),
});

// ---------------------------------------------------------------------------
// cloud.wind — drift and evolution, integrated by advance(dt)
// ---------------------------------------------------------------------------

const CLOUD_WIND_FIELDS = Object.freeze({
  heading: num({
    description: 'Direction clouds travel toward. 0 is +Z, 90 is +X.',
    label: 'Heading',
    range: [0, 360, 1],
    unit: 'degrees',
    // A plain number: the drift direction it feeds is the driven uniform.
    uniform: false,
    value: 0,
  }),
  speed: num({
    description: 'How fast clouds drift across the sky. 0 holds them still.',
    label: 'Speed',
    range: [0, 200, 0.1],
    unit: 'm/s',
    uniform: false,
    value: 0,
  }),
  evolutionSpeed: num({
    description: 'How fast clouds change shape as they drift. Independent of speed, so they can churn in place.',
    label: 'Evolution',
    range: [0, 120, 0.1],
    unit: 'm/s',
    uniform: false,
    value: 0,
  }),
  skew: num({
    description: 'Leans cloud tops downwind of their bases by this distance, the way real cloud shears in a wind gradient.',
    label: 'Skew',
    range: [-4000, 4000, 10],
    unit: 'm',
    value: 0,
  }),
});

// ---------------------------------------------------------------------------
// cloud.cirrus / cloud.haze — the thin deck above the volumetric shell
// ---------------------------------------------------------------------------

const CLOUD_CIRRUS_FIELDS = Object.freeze({
  scale: num({
    description: 'World distance the cirrus texture spans before it repeats. Larger stretches the streaks out.',
    label: 'Cirrus Scale',
    min: 1,
    range: [2000, 200000, 100],
    unit: 'm',
    value: 30000,
  }),
  strength: num({
    description: 'How opaque the cirrus deck reads. 0 hides it.',
    label: 'Cirrus Strength',
    min: 0,
    range: [0, 2, 0.01],
    unit: DIMENSIONLESS,
    value: 0,
  }),
});

const CLOUD_HAZE_FIELDS = Object.freeze({
  density: num({
    description: 'How opaque the storm haze reads for a given amount of cloud coverage. 0 hides it.',
    label: 'Haze Density',
    min: 0,
    range: [0, 8, 0.01],
    unit: DIMENSIONLESS,
    value: 0,
  }),
  scale: num({
    description: 'World distance the haze layer spans before it repeats. Independent of shape.weatherScale even though both read the same coverage.',
    label: 'Haze Scale',
    min: 1,
    range: [2000, 200000, 100],
    unit: 'm',
    value: 40000,
  }),
});

// ---------------------------------------------------------------------------
// cloud.fade — aerial perspective and the horizon melt
// ---------------------------------------------------------------------------

const CLOUD_FADE_FIELDS = Object.freeze({
  hazeDensityScale: num({
    description: 'How much atmosphere sits between camera and cloud. 1 matches the real atmosphere; 0 removes it.',
    label: 'Haze Scale',
    min: 0,
    range: [0, 4, 0.01],
    unit: DIMENSIONLESS,
    value: 1,
  }),
  horizonMeltStart: num({
    description: 'Distance at which clouds begin dissolving into the sky.',
    label: 'Melt Start',
    min: 0,
    range: [0, 200000, 100],
    unit: 'm',
    value: 25000,
  }),
  horizonMeltEnd: num({
    description: 'Distance at which clouds have fully dissolved into the sky. Held at or above horizonMeltStart.',
    label: 'Melt End',
    min: 0,
    range: [0, 200000, 100],
    unit: 'm',
    value: 40000,
  }),
  maxMarchDist: num({
    // Derived rather than authored: extending the march is a consequence of
    // pushing the melt out, never an independent decision.
    derived: true,
    derive: (params) => params.horizonMeltEnd + MAX_MARCH_DIST_MARGIN,
    description: 'How far the view ray marches before giving up. Read-only, always horizonMeltEnd + 2000.',
    label: 'Max March Distance',
    min: 0,
    range: [0, 202000, 100],
    unit: 'm',
    value: 42000,
  }),
});

// ---------------------------------------------------------------------------
// Published schema
// ---------------------------------------------------------------------------

export const CLOUD_PARAM_GROUP_IDS = Object.freeze([
  'shape',
  'lighting',
  'wind',
  'cirrus',
  'haze',
  'fade',
]);

export const CLOUD_PARAM_GROUPS = Object.freeze([
  Object.freeze({
    description: 'Shell geometry, coverage field, erosion character, and edge treatment.',
    id: 'shape',
    label: 'Shape',
  }),
  Object.freeze({
    description: 'Scattering, powder, ambient fill, ground bounce, and moonlight.',
    id: 'lighting',
    label: 'Lighting',
  }),
  Object.freeze({
    description: 'Drift heading and speed, shape evolution, and wind shear.',
    id: 'wind',
    label: 'Wind',
  }),
  Object.freeze({
    description: 'The thin high deck sampled from a host-supplied texture.',
    id: 'cirrus',
    label: 'Cirrus',
  }),
  Object.freeze({
    description: 'Storm haze on the cirrus deck, driven by cloud coverage instead of a texture.',
    id: 'haze',
    label: 'Haze',
  }),
  Object.freeze({
    description: 'Aerial perspective and the horizon melt window that ends the march.',
    id: 'fade',
    label: 'Fade',
  }),
]);

/** Field metadata for the six cloud groups, keyed by group id. */
export const CLOUD_PARAMS_FIELD_SCHEMA = Object.freeze({
  cirrus: CLOUD_CIRRUS_FIELDS,
  fade: CLOUD_FADE_FIELDS,
  haze: CLOUD_HAZE_FIELDS,
  lighting: CLOUD_LIGHTING_FIELDS,
  shape: CLOUD_SHAPE_FIELDS,
  wind: CLOUD_WIND_FIELDS,
});

assertSchemaInvariants('cloudParams', CLOUD_PARAMS_FIELD_SCHEMA);

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

// The melt window must never invert: raising the start past the end drags the
// end up, so the effect cannot be switched off by pushing the start out.
function meltWindowRule(path, params, report) {
  if (params.horizonMeltEnd < params.horizonMeltStart) {
    report.warnings.push(
      `${path}.horizonMeltEnd ${params.horizonMeltEnd} was raised to horizonMeltStart ${params.horizonMeltStart}.`,
    );
    params.horizonMeltEnd = params.horizonMeltStart;
  }
  return params;
}

/**
 * Normalizes the whole `cloud` block of a SkyParams document. Exported for
 * sky/skyParams.js, which owns the envelope but not these six groups.
 */
export function normalizeCloudParams(path, input, fallback, report) {
  if (hasValue(input) && !isObject(input)) {
    report.errors.push(`${path} must be an object (got ${describe(input)}).`);
  }
  const source = isObject(input) ? input : {};
  const base = isObject(fallback) ? fallback : {};
  if (hasValue(source.enabled)) {
    report.warnings.push(
      `"${path}.enabled" is not a parameter; assign the master switch on the cloud system directly.`,
    );
  }
  const params = {};
  for (const id of CLOUD_PARAM_GROUP_IDS) {
    params[id] = normalizeBlock(
      `${path}.${id}`,
      CLOUD_PARAMS_FIELD_SCHEMA[id],
      source[id],
      base[id],
      report,
      id === 'fade' ? { rule: meltWindowRule } : {},
    );
  }
  reportUnknownKeys(path, CLOUD_PARAMS_FIELD_SCHEMA, source, report, ['enabled', 'style']);
  return params;
}

/** Live-params view of a normalized cloud block: colour triples become Colors. */
export function cloudParamsToLive(params) {
  return {
    ...params,
    lighting: colorFieldsToColors(CLOUD_LIGHTING_FIELDS, params.lighting),
  };
}

export const DEFAULT_CLOUD_PARAMS = deepFreeze(
  cloudParamsToLive(normalizeCloudParams('cloud', {}, null, { errors: [], warnings: [] })),
);

// ---------------------------------------------------------------------------
// Live cloud parameter groups
// ---------------------------------------------------------------------------

// Errors and warnings both reach the console. Dropping the warnings made the
// live path silent about clamping, unknown keys, and replaced derived values,
// which is exactly the class of mistake a lab needs told about — and it made
// the class path disagree with the document path about the same input.
function warnReport(scope, report) {
  for (const message of report.errors) console.warn(`[cloudParams] ${scope}: ${message}`);
  for (const message of report.warnings) console.warn(`[cloudParams] ${scope}: ${message}`);
}

/**
 * One cloud parameter group. Uniform-backed fields expose a TSL node whose
 * `.value` the marcher reads; plain-number fields are assigned directly, which
 * is what lets `heading`/`speed` change without a uniform upload.
 */
export class CloudParamGroup {
  constructor(id, fields) {
    // Non-enumerable so iterating or logging a group shows parameters only,
    // not the schema table behind them.
    Object.defineProperties(this, {
      _derived: { value: {}, writable: false },
      _fields: { value: fields, writable: false },
      id: { value: id, writable: false },
    });
    for (const [key, field] of Object.entries(fields)) {
      if (field.derived) {
        this._derived[key] = uniform(field.value);
        // A getter rather than a plain property, so "read-only" is enforced
        // rather than merely documented.
        Object.defineProperty(this, key, {
          enumerable: true,
          get: () => this._derived[key],
        });
      } else if (field.type === 'color') {
        this[key] = uniform(channelsToColor(field.value));
      } else if (field.uniform) {
        this[key] = uniform(field.value);
      } else {
        this[key] = field.value;
      }
    }
  }

  /** Writes any subset of this group's params. Omitted fields stay put. */
  applyParams(params = {}) {
    const report = { errors: [], warnings: [] };
    const suppliedDerived = this._writeFields(params, report);
    this._applyRules(report);
    this._syncDerived();
    // Reported after the rules and the sync, so the comparison is against the
    // value the group actually settled on rather than a stale placeholder.
    for (const [key, supplied] of suppliedDerived) {
      reportDerived(`cloud.${this.id}.${key}`, supplied, this._derived[key].value, report);
    }
    warnReport(`cloud.${this.id}.applyParams`, report);
    return this;
  }

  /** Reads every field back, including derived ones. */
  toParams() {
    const params = {};
    for (const [key, field] of Object.entries(this._fields)) {
      if (field.type === 'color') {
        params[key] = new THREE.Color().copy(this[key].value);
      } else if (field.uniform || field.derived) {
        params[key] = this[key].value;
      } else {
        params[key] = this[key];
      }
    }
    return params;
  }

  /**
   * Cross-field clamps, given the report to explain itself in. Overridden where
   * a group has a coupled window; a no-op everywhere else.
   */
  _applyRules() {}

  /** Recomputes anything derived from the authored fields. */
  _syncDerived() {}

  _writeFields(params, report) {
    const source = isObject(params) ? params : {};
    const suppliedDerived = [];
    for (const [key, field] of Object.entries(this._fields)) {
      if (field.derived) {
        // Read-only, so the value is not written — but it is reported, which is
        // what the document path already did and this path did not.
        if (hasValue(source[key])) suppliedDerived.push([key, source[key]]);
        continue;
      }
      if (!hasValue(source[key])) continue;
      const path = `cloud.${this.id}.${key}`;
      if (field.type === 'color') {
        const channels = normalizeChannels(path, field, source[key], this[key].value, report);
        this[key].value.setRGB(channels[0], channels[1], channels[2]);
      } else if (field.uniform) {
        this[key].value = normalizeNumber(path, field, source[key], this[key].value, report);
      } else {
        this[key] = normalizeNumber(path, field, source[key], this[key], report);
      }
    }
    reportUnknownKeys(`cloud.${this.id}`, this._fields, source, report);
    return suppliedDerived;
  }
}

export class CloudShape extends CloudParamGroup {
  constructor() {
    super('shape', CLOUD_SHAPE_FIELDS);
  }
}

export class CloudLighting extends CloudParamGroup {
  constructor() {
    super('lighting', CLOUD_LIGHTING_FIELDS);
  }
}

export class CloudCirrus extends CloudParamGroup {
  constructor() {
    super('cirrus', CLOUD_CIRRUS_FIELDS);
  }
}

export class CloudHaze extends CloudParamGroup {
  constructor() {
    super('haze', CLOUD_HAZE_FIELDS);
  }
}

/**
 * Drift and evolution. `advance(dt)` integrates them independently and
 * refreshes the driven `direction` / `offset` / `evolutionOffset` uniforms.
 */
export class CloudWind extends CloudParamGroup {
  constructor() {
    super('wind', CLOUD_WIND_FIELDS);
    Object.defineProperties(this, {
      _direction: { value: uniform(new THREE.Vector3(0, 0, 1)), writable: false },
      _evolutionOffset: { value: uniform(new THREE.Vector3()), writable: false },
      _offset: { value: uniform(new THREE.Vector3()), writable: false },
    });
    this._refreshDirection();
  }

  /** Unit drift direction in the XZ plane. Driven; read-only. */
  get direction() {
    return this._direction;
  }

  /** Accumulated world-space drift, in metres. Driven; read-only. */
  get offset() {
    return this._offset;
  }

  /** Accumulated shape-churn walk, in metres. Driven; read-only. */
  get evolutionOffset() {
    return this._evolutionOffset;
  }

  /**
   * Integrates one frame of drift and evolution. Deterministic: the result is a
   * function of the dt sequence alone.
   */
  advance(dt) {
    // Heading can change between frames, so drift accumulates as a vector.
    // Rebuilding the offset from a scalar distance would teleport the whole
    // field the moment the wind turned.
    this._refreshDirection();
    const step = Number.isFinite(dt) ? dt : 0;
    this._offset.value.addScaledVector(this._direction.value, this.speed * step);
    this._evolutionOffset.value.addScaledVector(
      this._direction.value,
      this.evolutionSpeed * step,
    );
    return this;
  }

  /** Returns the field to its un-advanced state, for reproducible captures. */
  reset() {
    this._offset.value.set(0, 0, 0);
    this._evolutionOffset.value.set(0, 0, 0);
    this._refreshDirection();
    return this;
  }

  _syncDerived() {
    this._refreshDirection();
  }

  _refreshDirection() {
    const radians = THREE.MathUtils.degToRad(this.heading);
    // heading 0 travels toward +Z, 90 toward +X.
    this._direction.value.set(Math.sin(radians), 0, Math.cos(radians));
  }
}

/** Aerial perspective and the horizon melt, with the derived march ceiling. */
export class CloudFade extends CloudParamGroup {
  constructor() {
    super('fade', CLOUD_FADE_FIELDS);
    this.sync();
  }

  /**
   * Refreshes `maxMarchDist` from `horizonMeltEnd`. A raw `add(2000)` node has
   * no readable `.value`, and the lab display and the serializer both need the
   * number, so the derived value lives in a uniform this keeps in step.
   */
  sync() {
    this._derived.maxMarchDist.value = CLOUD_FADE_FIELDS.maxMarchDist.derive({
      horizonMeltEnd: this.horizonMeltEnd.value,
    });
    return this;
  }

  toParams() {
    this.sync();
    return super.toParams();
  }

  _applyRules(report) {
    if (this.horizonMeltEnd.value < this.horizonMeltStart.value) {
      report.warnings.push(
        `cloud.fade.horizonMeltEnd ${this.horizonMeltEnd.value} was raised to `
        + `horizonMeltStart ${this.horizonMeltStart.value}.`,
      );
      this.horizonMeltEnd.value = this.horizonMeltStart.value;
    }
  }

  _syncDerived() {
    this.sync();
  }
}

/**
 * The six cloud parameter groups. `enabled` is the master switch and is
 * deliberately outside the params contract: `applyParams` never writes it and
 * `toParams` never reads it, so a preset cannot switch the layer off.
 */
export class CloudParams {
  constructor(params = null) {
    this.enabled = true;
    this.shape = new CloudShape();
    this.lighting = new CloudLighting();
    this.wind = new CloudWind();
    this.cirrus = new CloudCirrus();
    this.haze = new CloudHaze();
    this.fade = new CloudFade();
    if (params) this.applyParams(params);
  }

  applyParams(params = {}) {
    const source = isObject(params) ? params : {};
    const report = { errors: [], warnings: [] };
    if (hasValue(params) && !isObject(params)) {
      report.errors.push(`cloud must be an object (got ${describe(params)}).`);
    }
    if (hasValue(source.enabled)) {
      report.warnings.push(
        '"cloud.enabled" is not a parameter; assign the master switch on the cloud system directly.',
      );
    }
    reportUnknownKeys('cloud', CLOUD_PARAMS_FIELD_SCHEMA, source, report, ['enabled', 'style']);
    warnReport('cloud.applyParams', report);
    for (const id of CLOUD_PARAM_GROUP_IDS) {
      if (hasValue(source[id])) this[id].applyParams(source[id]);
    }
    return this;
  }

  toParams() {
    return {
      shape: this.shape.toParams(),
      lighting: this.lighting.toParams(),
      wind: this.wind.toParams(),
      cirrus: this.cirrus.toParams(),
      haze: this.haze.toParams(),
      fade: this.fade.toParams(),
    };
  }

  /** Per-frame tick: integrates wind and refreshes derived fade state. */
  update(dt) {
    this.wind.advance(dt);
    this.fade.sync();
    return this;
  }
}

export function createCloudParams(params = null) {
  return new CloudParams(params);
}
