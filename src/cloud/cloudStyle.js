// Optional art direction layered over the physical cloud renderer.
//
// The physical CloudParams contract remains independent in cloudParams.js.
// This file owns only presentation controls, grouped by modules so each stage
// can be bypassed without changing density, light transport, atmosphere, or
// temporal reconstruction. The master switch is the V1 escape hatch.

import * as THREE from 'three';
import { uniform } from 'three/tsl';

import {
  DIMENSIONLESS,
  assertSchemaInvariants,
  bool,
  channelsToColor,
  col,
  colorFieldsToColors,
  deepFreeze,
  describe,
  hasValue,
  isObject,
  normalizeBlock,
  num,
  toChannels,
} from './paramSchema.js';

const CLOUD_STYLE_MASTER_FIELDS = Object.freeze({
  enabled: bool({
    description: 'Master bypass for every optional cloud styling module. Off is the unchanged V1 renderer.',
    label: 'Enable Styling',
    value: false,
  }),
  amount: num({
    description: 'Blends all enabled styling modules over the physical cloud result.',
    label: 'Style Amount',
    max: 1,
    min: 0,
    range: [0, 1, 0.01],
    unit: DIMENSIONLESS,
    value: 1,
  }),
});

const CLOUD_TONE_FIELDS = Object.freeze({
  enabled: bool({
    description: 'Remaps physical cloud illumination through an authored three-colour tone ramp.',
    label: 'Enable Tone',
    value: false,
  }),
  shadowColor: col({
    description: 'Colour used for the darkest readable cloud masses.',
    label: 'Shadow',
    value: [0.18, 0.3, 0.52],
  }),
  midColor: col({
    description: 'Colour used across the broad body of the cloud.',
    label: 'Midtone',
    value: [0.56, 0.71, 0.9],
  }),
  lightColor: col({
    description: 'Colour used on the brightest sun-facing cloud forms.',
    label: 'Highlight',
    value: [1, 0.96, 0.86],
  }),
  shadowPoint: num({
    description: 'Physical light level where shadow begins transitioning into the midtone.',
    label: 'Shadow Point',
    max: 1,
    min: 0,
    range: [0, 1, 0.01],
    unit: DIMENSIONLESS,
    value: 0.16,
  }),
  lightPoint: num({
    description: 'Physical light level where the midtone begins transitioning into highlight.',
    label: 'Light Point',
    max: 1,
    min: 0,
    range: [0, 1, 0.01],
    unit: DIMENSIONLESS,
    value: 0.46,
  }),
  softness: num({
    description: 'Width of both tone transitions. Lower values make clearer painted bands.',
    label: 'Tone Softness',
    max: 0.5,
    min: 0.001,
    range: [0.001, 0.5, 0.001],
    unit: DIMENSIONLESS,
    value: 0.08,
  }),
  shadowLift: num({
    description: 'Minimum cloud radiance after tone mapping, keeping shaded bodies readable.',
    label: 'Shadow Lift',
    max: 2,
    min: 0,
    range: [0, 2, 0.01],
    unit: 'radiance',
    value: 0.12,
  }),
  highlightCompression: num({
    description: 'Compresses bright cloud radiance so white form survives exposure and bloom.',
    label: 'Highlight Compression',
    max: 1,
    min: 0,
    range: [0, 1, 0.01],
    unit: DIMENSIONLESS,
    value: 0.12,
  }),
  brightness: num({
    description: 'Final brightness multiplier for the styled cloud tones.',
    label: 'Brightness',
    max: 4,
    min: 0,
    range: [0, 4, 0.01],
    unit: DIMENSIONLESS,
    value: 1.05,
  }),
});

const CLOUD_BLUE_SHADOW_FIELDS = Object.freeze({
  enabled: bool({
    description: 'Adds an authored blue skylight tint only to the darker cloud body.',
    label: 'Enable Blue Shadow',
    value: false,
  }),
  color: col({
    description: 'Blue skylight colour applied to cloud shadows while preserving their brightness.',
    label: 'Shadow Blue',
    value: [0.08, 0.28, 0.68],
  }),
  amount: num({
    description: 'Strength of the blue skylight tint inside the selected shadow range.',
    label: 'Blue Amount',
    max: 1,
    min: 0,
    range: [0, 1, 0.01],
    unit: DIMENSIONLESS,
    value: 0.65,
  }),
  range: num({
    description: 'How far the blue tint reaches from the darkest underside into the cloud midtones.',
    label: 'Shadow Range',
    max: 1,
    min: 0,
    range: [0, 1, 0.01],
    unit: DIMENSIONLESS,
    value: 0.36,
  }),
  softness: num({
    description: 'Softness of the transition between blue shadow and the existing cloud colour.',
    label: 'Blend Softness',
    max: 0.5,
    min: 0.001,
    range: [0.001, 0.5, 0.001],
    unit: DIMENSIONLESS,
    value: 0.14,
  }),
});

const CLOUD_SHADOW_WASH_FIELDS = Object.freeze({
  enabled: bool({
    description: 'Softens the selected cloud-shadow region into a broad, pale painted wash.',
    label: 'Enable Shadow Wash',
    value: false,
  }),
  lift: num({
    description: 'Target brightness of the painted underside. Higher values make the wash paler.',
    label: 'Lift',
    max: 2,
    min: 0,
    range: [0, 2, 0.01],
    unit: 'radiance',
    value: 0.32,
  }),
  detail: num({
    description: 'Amount of the original shadow variation retained inside the wash.',
    label: 'Detail',
    max: 1,
    min: 0,
    range: [0, 1, 0.01],
    unit: DIMENSIONLESS,
    value: 0.4,
  }),
  blend: num({
    description: 'Softness of the transition from the painted underside into the bright cloud body.',
    label: 'Blend',
    max: 0.5,
    min: 0.001,
    range: [0.001, 0.5, 0.001],
    unit: DIMENSIONLESS,
    value: 0.16,
  }),
});

const CLOUD_INNER_PAINT_FIELDS = Object.freeze({
  enabled: bool({
    description: 'Restricts the painted shadow treatment to the cloud interior while preserving the physical outer edge.',
    label: 'Enable Inner Paint',
    value: false,
  }),
  amount: num({
    description: 'Strength of the interior-only painted treatment.',
    label: 'Amount',
    max: 1,
    min: 0,
    range: [0, 1, 0.01],
    unit: DIMENSIONLESS,
    value: 1,
  }),
  edgeKeep: num({
    description: 'Minimum visible cloud opacity kept entirely physical before interior paint begins.',
    label: 'Edge Keep',
    max: 1,
    min: 0,
    range: [0, 1, 0.01],
    unit: DIMENSIONLESS,
    value: 0.22,
  }),
  edgeBlend: num({
    description: 'Softness of the transition from the untouched physical edge into the painted interior.',
    label: 'Edge Blend',
    max: 1,
    min: 0.001,
    range: [0.001, 1, 0.001],
    unit: DIMENSIONLESS,
    value: 0.28,
  }),
});

const CLOUD_WHITE_TOP_FIELDS = Object.freeze({
  enabled: bool({
    description: 'Broadens the clean sunlit colour across the upper cloud body without changing its silhouette.',
    label: 'Enable White Top',
    value: false,
  }),
  color: col({
    description: 'Warm-white colour painted into the sun-reachable upper cloud body.',
    label: 'Top White',
    value: [1, 0.98, 0.92],
  }),
  amount: num({
    description: 'Strength of the white-top treatment inside the selected upper region.',
    label: 'Amount',
    max: 1,
    min: 0,
    range: [0, 1, 0.01],
    unit: DIMENSIONLESS,
    value: 1,
  }),
  area: num({
    description: 'How broadly the white region extends down from the sunlit cloud top.',
    label: 'Area',
    max: 1,
    min: 0,
    range: [0, 1, 0.01],
    unit: DIMENSIONLESS,
    value: 0.62,
  }),
  softness: num({
    description: 'Softness of the transition from white top into the existing cloud middle.',
    label: 'Softness',
    max: 0.5,
    min: 0.001,
    range: [0.001, 0.5, 0.001],
    unit: DIMENSIONLESS,
    value: 0.14,
  }),
  detail: num({
    description: 'Amount of physical light variation retained inside the white region.',
    label: 'Detail',
    max: 1,
    min: 0,
    range: [0, 1, 0.01],
    unit: DIMENSIONLESS,
    value: 0.35,
  }),
});

const CLOUD_TOP_LIGHT_FIELDS = Object.freeze({
  enabled: bool({
    description: 'Restores physical sunlight variation across the painted white cloud top.',
    label: 'Enable Top Light',
    value: false,
  }),
  amount: num({
    description: 'Amount of sunlight shape shown across the white cloud top.',
    label: 'Light Detail',
    max: 1,
    min: 0,
    range: [0, 1, 0.01],
    unit: DIMENSIONLESS,
    value: 0.7,
  }),
});

const CLOUD_SURFACE_LIGHT_FIELDS = Object.freeze({
  enabled: bool({
    description: 'Uses the first visible cloud layer for white-top lighting instead of averaging light through the whole cloud body.',
    label: 'Enable Surface Light',
    value: false,
  }),
  amount: num({
    description: 'Blends from whole-cloud lighting to the light measured at the visible cloud surface.',
    label: 'Surface Light',
    max: 1,
    min: 0,
    range: [0, 1, 0.01],
    unit: DIMENSIONLESS,
    value: 1,
  }),
});

const CLOUD_LIGHT_BLEND_FIELDS = Object.freeze({
  enabled: bool({
    description: 'Blends the warm white top through a pale blue middle into the cooler underside without changing cloud shape.',
    label: 'Enable Light Blend',
    value: false,
  }),
  bottomColor: col({
    description: 'Cool blue used at the shaded bottom of the painted cloud interior.',
    label: 'Bottom Blue',
    value: [0.28, 0.5, 0.82],
  }),
  middleColor: col({
    description: 'Pale blue used between the white top and cool underside.',
    label: 'Middle Blue',
    value: [0.68, 0.84, 0.98],
  }),
  amount: num({
    description: 'Strength of the cool tint below the existing white cloud top.',
    label: 'Amount',
    max: 1,
    min: 0,
    range: [0, 1, 0.01],
    unit: DIMENSIONLESS,
    value: 0.5,
  }),
  balance: num({
    description: 'Light level where the bottom blue gives way to the pale blue middle.',
    label: 'Blue Split',
    max: 1,
    min: 0,
    range: [0, 1, 0.01],
    unit: DIMENSIONLESS,
    value: 0.16,
  }),
  softness: num({
    description: 'Width of the transition from bottom blue to pale blue.',
    label: 'Softness',
    max: 0.5,
    min: 0.001,
    range: [0.001, 0.5, 0.001],
    unit: DIMENSIONLESS,
    value: 0.14,
  }),
  detail: num({
    description: 'Amount of the existing physical cloud colour retained through the tint.',
    label: 'Keep Detail',
    max: 1,
    min: 0,
    range: [0, 1, 0.01],
    unit: DIMENSIONLESS,
    value: 0.65,
  }),
});

const CLOUD_TIME_PALETTE_FIELDS = Object.freeze({
  enabled: bool({
    description: 'Adds authored morning, evening, and night colours from the existing sky clock.',
    label: 'Enable Time Palette',
    value: false,
  }),
  morningEnabled: bool({
    description: 'Enables only the morning cloud tint. Afternoon, evening, and night are unchanged.',
    label: 'Enable Morning',
    value: true,
  }),
  morningTop: col({
    description: 'Warm colour applied to the brighter cloud body in the morning.',
    label: 'Morning Top',
    value: [1, 0.56, 0.3],
  }),
  morningBottom: col({
    description: 'Cool colour applied to the shaded cloud body in the morning.',
    label: 'Morning Bottom',
    value: [0.32, 0.24, 0.5],
  }),
  morningAmount: num({
    description: 'Strength of the authored morning cloud colours.',
    label: 'Morning Amount',
    max: 1,
    min: 0,
    range: [0, 1, 0.01],
    unit: DIMENSIONLESS,
    value: 0.82,
  }),
  morningDetail: num({
    description: 'Amount of the existing physical cloud colour retained only in the morning.',
    label: 'Morning Detail',
    max: 1,
    min: 0,
    range: [0, 1, 0.01],
    unit: DIMENSIONLESS,
    value: 0.3,
  }),
  morningBrightness: num({
    description: 'Brightness of the compressed cloud interior only in the morning.',
    label: 'Morning Brightness',
    max: 2,
    min: 0,
    range: [0, 2, 0.01],
    unit: DIMENSIONLESS,
    value: 0.72,
  }),
  eveningEnabled: bool({
    description: 'Enables only the evening cloud tint. Morning, afternoon, and night are unchanged.',
    label: 'Enable Evening',
    value: true,
  }),
  eveningTop: col({
    description: 'Warm colour applied to the brighter cloud body in the evening.',
    label: 'Evening Top',
    value: [1, 0.42, 0.22],
  }),
  eveningBottom: col({
    description: 'Cooler colour applied to the shaded cloud body in the evening.',
    label: 'Evening Bottom',
    value: [0.4, 0.16, 0.35],
  }),
  eveningAmount: num({
    description: 'Strength of the authored evening cloud colours.',
    label: 'Evening Amount',
    max: 1,
    min: 0,
    range: [0, 1, 0.01],
    unit: DIMENSIONLESS,
    value: 0.9,
  }),
  eveningDetail: num({
    description: 'Amount of the existing physical cloud colour retained only in the evening.',
    label: 'Evening Detail',
    max: 1,
    min: 0,
    range: [0, 1, 0.01],
    unit: DIMENSIONLESS,
    value: 0.25,
  }),
  eveningBrightness: num({
    description: 'Brightness of the compressed cloud interior only in the evening.',
    label: 'Evening Brightness',
    max: 2,
    min: 0,
    range: [0, 2, 0.01],
    unit: DIMENSIONLESS,
    value: 0.65,
  }),
  nightEnabled: bool({
    description: 'Enables only the night cloud tint. Morning, afternoon, and evening are unchanged.',
    label: 'Enable Night',
    value: true,
  }),
  nightTop: col({
    description: 'Moonlit colour applied to the brighter cloud body at night.',
    label: 'Night Top',
    value: [0.15, 0.32, 0.72],
  }),
  nightBottom: col({
    description: 'Deep-blue colour applied to the shaded cloud body at night.',
    label: 'Night Bottom',
    value: [0.02, 0.05, 0.18],
  }),
  nightAmount: num({
    description: 'Strength of the authored night cloud colours.',
    label: 'Night Amount',
    max: 1,
    min: 0,
    range: [0, 1, 0.01],
    unit: DIMENSIONLESS,
    value: 1,
  }),
  nightDetail: num({
    description: 'Amount of the existing physical cloud colour retained only at night.',
    label: 'Night Detail',
    max: 1,
    min: 0,
    range: [0, 1, 0.01],
    unit: DIMENSIONLESS,
    value: 0.22,
  }),
  nightContrast: num({
    description: 'Strength of the night-only value compression. Lower values keep more readable cloud-body definition.',
    label: 'Night Contrast',
    max: 1,
    min: 0,
    range: [0, 1, 0.01],
    unit: DIMENSIONLESS,
    value: 0.25,
  }),
  nightBrightness: num({
    description: 'Brightness of the compressed cloud interior only at night.',
    label: 'Night Brightness',
    max: 4,
    min: 0,
    range: [0, 4, 0.01],
    unit: DIMENSIONLESS,
    value: 0.32,
  }),
});

export const CLOUD_STYLE_MODULE_IDS = Object.freeze([
  'tone',
  'blueShadow',
  'shadowWash',
  'innerPaint',
  'whiteTop',
  'topLight',
  'surfaceLight',
  'lightBlend',
  'timePalette',
]);

export const CLOUD_STYLE_FIELD_SCHEMA = Object.freeze({
  ...CLOUD_STYLE_MASTER_FIELDS,
  tone: CLOUD_TONE_FIELDS,
  blueShadow: CLOUD_BLUE_SHADOW_FIELDS,
  shadowWash: CLOUD_SHADOW_WASH_FIELDS,
  innerPaint: CLOUD_INNER_PAINT_FIELDS,
  whiteTop: CLOUD_WHITE_TOP_FIELDS,
  topLight: CLOUD_TOP_LIGHT_FIELDS,
  surfaceLight: CLOUD_SURFACE_LIGHT_FIELDS,
  lightBlend: CLOUD_LIGHT_BLEND_FIELDS,
  timePalette: CLOUD_TIME_PALETTE_FIELDS,
});

assertSchemaInvariants('cloudStyle', CLOUD_STYLE_FIELD_SCHEMA);

function toneWindowRule(path, params, report) {
  if (params.lightPoint < params.shadowPoint) {
    report.warnings.push(
      `${path}.lightPoint ${params.lightPoint} was raised to shadowPoint ${params.shadowPoint}.`,
    );
    params.lightPoint = params.shadowPoint;
  }
  return params;
}

export function normalizeCloudStyleParams(path, input, fallback, report) {
  if (hasValue(input) && !isObject(input)) {
    report.errors.push(`${path} must be an object (got ${describe(input)}).`);
  }
  const source = isObject(input) ? input : {};
  const base = isObject(fallback) ? fallback : {};
  const params = normalizeBlock(
    path,
    CLOUD_STYLE_MASTER_FIELDS,
    source,
    base,
    report,
    { ignored: CLOUD_STYLE_MODULE_IDS },
  );
  params.tone = normalizeBlock(
    `${path}.tone`,
    CLOUD_TONE_FIELDS,
    source.tone,
    base.tone,
    report,
    { rule: toneWindowRule },
  );
  params.blueShadow = normalizeBlock(
    `${path}.blueShadow`,
    CLOUD_BLUE_SHADOW_FIELDS,
    source.blueShadow,
    base.blueShadow,
    report,
  );
  params.shadowWash = normalizeBlock(
    `${path}.shadowWash`,
    CLOUD_SHADOW_WASH_FIELDS,
    source.shadowWash,
    base.shadowWash,
    report,
  );
  params.innerPaint = normalizeBlock(
    `${path}.innerPaint`,
    CLOUD_INNER_PAINT_FIELDS,
    source.innerPaint,
    base.innerPaint,
    report,
  );
  params.whiteTop = normalizeBlock(
    `${path}.whiteTop`,
    CLOUD_WHITE_TOP_FIELDS,
    source.whiteTop,
    base.whiteTop,
    report,
  );
  params.topLight = normalizeBlock(
    `${path}.topLight`,
    CLOUD_TOP_LIGHT_FIELDS,
    source.topLight,
    base.topLight,
    report,
  );
  params.surfaceLight = normalizeBlock(
    `${path}.surfaceLight`,
    CLOUD_SURFACE_LIGHT_FIELDS,
    source.surfaceLight,
    base.surfaceLight,
    report,
  );
  params.lightBlend = normalizeBlock(
    `${path}.lightBlend`,
    CLOUD_LIGHT_BLEND_FIELDS,
    source.lightBlend,
    base.lightBlend,
    report,
  );
  params.timePalette = normalizeBlock(
    `${path}.timePalette`,
    CLOUD_TIME_PALETTE_FIELDS,
    source.timePalette,
    base.timePalette,
    report,
  );
  return params;
}

export function cloudStyleParamsToLive(params) {
  return {
    ...params,
    tone: colorFieldsToColors(CLOUD_TONE_FIELDS, params.tone),
    blueShadow: colorFieldsToColors(CLOUD_BLUE_SHADOW_FIELDS, params.blueShadow),
    shadowWash: colorFieldsToColors(CLOUD_SHADOW_WASH_FIELDS, params.shadowWash),
    innerPaint: colorFieldsToColors(CLOUD_INNER_PAINT_FIELDS, params.innerPaint),
    whiteTop: colorFieldsToColors(CLOUD_WHITE_TOP_FIELDS, params.whiteTop),
    topLight: colorFieldsToColors(CLOUD_TOP_LIGHT_FIELDS, params.topLight),
    surfaceLight: colorFieldsToColors(CLOUD_SURFACE_LIGHT_FIELDS, params.surfaceLight),
    lightBlend: colorFieldsToColors(CLOUD_LIGHT_BLEND_FIELDS, params.lightBlend),
    timePalette: colorFieldsToColors(CLOUD_TIME_PALETTE_FIELDS, params.timePalette),
  };
}

function serializeModule(fields, params) {
  return Object.fromEntries(Object.entries(fields).map(([key, field]) => [
    key,
    field.type === 'color' ? toChannels(params[key]) : params[key],
  ]));
}

export function toSerializableCloudStyleParams(params) {
  const source = cloudStyleParamsToLive(normalizeCloudStyleParams(
    'cloud.style',
    params,
    null,
    { errors: [], warnings: [] },
  ));
  return {
    enabled: source.enabled,
    amount: source.amount,
    tone: serializeModule(CLOUD_TONE_FIELDS, source.tone),
    blueShadow: serializeModule(CLOUD_BLUE_SHADOW_FIELDS, source.blueShadow),
    shadowWash: serializeModule(CLOUD_SHADOW_WASH_FIELDS, source.shadowWash),
    innerPaint: serializeModule(CLOUD_INNER_PAINT_FIELDS, source.innerPaint),
    whiteTop: serializeModule(CLOUD_WHITE_TOP_FIELDS, source.whiteTop),
    topLight: serializeModule(CLOUD_TOP_LIGHT_FIELDS, source.topLight),
    surfaceLight: serializeModule(CLOUD_SURFACE_LIGHT_FIELDS, source.surfaceLight),
    lightBlend: serializeModule(CLOUD_LIGHT_BLEND_FIELDS, source.lightBlend),
    timePalette: serializeModule(CLOUD_TIME_PALETTE_FIELDS, source.timePalette),
  };
}

export const DEFAULT_CLOUD_STYLE_PARAMS = deepFreeze(cloudStyleParamsToLive(
  normalizeCloudStyleParams('cloud.style', {}, null, { errors: [], warnings: [] }),
));

function warnReport(report) {
  for (const message of report.errors) console.warn(`[cloudStyle] ${message}`);
  for (const message of report.warnings) console.warn(`[cloudStyle] ${message}`);
}

class CloudStyleBlock {
  constructor(fields, params) {
    Object.defineProperty(this, '_fields', { value: fields });
    for (const [key, field] of Object.entries(fields)) {
      if (field.type === 'color') this[key] = uniform(channelsToColor(field.value));
      else if (field.type === 'boolean') this[key] = uniform(field.value ? 1 : 0);
      else this[key] = uniform(field.value);
    }
    this.setNormalized(params);
  }

  setNormalized(params) {
    for (const [key, field] of Object.entries(this._fields)) {
      const value = params[key];
      if (field.type === 'color') this[key].value.copy(value);
      else if (field.type === 'boolean') this[key].value = value ? 1 : 0;
      else this[key].value = value;
    }
    return this;
  }

  toParams() {
    return Object.fromEntries(Object.entries(this._fields).map(([key, field]) => [
      key,
      field.type === 'color'
        ? new THREE.Color().copy(this[key].value)
        : field.type === 'boolean'
          ? this[key].value >= 0.5
          : this[key].value,
    ]));
  }
}

/** Live uniform-backed style state consumed by the cloud shader. */
export class CloudStyleParams {
  constructor(params = null) {
    const defaults = DEFAULT_CLOUD_STYLE_PARAMS;
    this.master = new CloudStyleBlock(CLOUD_STYLE_MASTER_FIELDS, defaults);
    this.tone = new CloudStyleBlock(CLOUD_TONE_FIELDS, defaults.tone);
    this.blueShadow = new CloudStyleBlock(CLOUD_BLUE_SHADOW_FIELDS, defaults.blueShadow);
    this.shadowWash = new CloudStyleBlock(CLOUD_SHADOW_WASH_FIELDS, defaults.shadowWash);
    this.innerPaint = new CloudStyleBlock(CLOUD_INNER_PAINT_FIELDS, defaults.innerPaint);
    this.whiteTop = new CloudStyleBlock(CLOUD_WHITE_TOP_FIELDS, defaults.whiteTop);
    this.topLight = new CloudStyleBlock(CLOUD_TOP_LIGHT_FIELDS, defaults.topLight);
    this.surfaceLight = new CloudStyleBlock(CLOUD_SURFACE_LIGHT_FIELDS, defaults.surfaceLight);
    this.lightBlend = new CloudStyleBlock(CLOUD_LIGHT_BLEND_FIELDS, defaults.lightBlend);
    this.timePalette = new CloudStyleBlock(CLOUD_TIME_PALETTE_FIELDS, defaults.timePalette);
    if (params) this.applyParams(params);
  }

  get enabled() {
    return this.master.enabled;
  }

  get amount() {
    return this.master.amount;
  }

  applyParams(params = {}) {
    const report = { errors: [], warnings: [] };
    const normalized = cloudStyleParamsToLive(normalizeCloudStyleParams(
      'cloud.style',
      params,
      this.toParams(),
      report,
    ));
    warnReport(report);
    this.master.setNormalized(normalized);
    this.tone.setNormalized(normalized.tone);
    this.blueShadow.setNormalized(normalized.blueShadow);
    this.shadowWash.setNormalized(normalized.shadowWash);
    this.innerPaint.setNormalized(normalized.innerPaint);
    this.whiteTop.setNormalized(normalized.whiteTop);
    this.topLight.setNormalized(normalized.topLight);
    this.surfaceLight.setNormalized(normalized.surfaceLight);
    this.lightBlend.setNormalized(normalized.lightBlend);
    this.timePalette.setNormalized(normalized.timePalette);
    return this;
  }

  toParams() {
    return {
      ...this.master.toParams(),
      tone: this.tone.toParams(),
      blueShadow: this.blueShadow.toParams(),
      shadowWash: this.shadowWash.toParams(),
      innerPaint: this.innerPaint.toParams(),
      whiteTop: this.whiteTop.toParams(),
      topLight: this.topLight.toParams(),
      surfaceLight: this.surfaceLight.toParams(),
      lightBlend: this.lightBlend.toParams(),
      timePalette: this.timePalette.toParams(),
    };
  }
}

export function createCloudStyleParams(params = null) {
  return new CloudStyleParams(params);
}
