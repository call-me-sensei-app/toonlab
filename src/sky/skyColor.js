// Optional colour grading layered over the physical atmosphere.
//
// The atmosphere still owns scattering, haze, the sun and aerial perspective.
// This module only establishes an authored sky palette after scattering, with
// a master bypass and a module bypass so V1 and every earlier snapshot remain
// available without rebuilding the shader.

import * as THREE from 'three';
import {
  dot,
  float,
  max,
  mix,
  normalize,
  saturate,
  smoothstep,
  uniform,
  vec3,
} from 'three/tsl';

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
} from '../cloud/paramSchema.js';

const SKY_COLOR_MASTER_FIELDS = Object.freeze({
  enabled: bool({
    description: 'Master bypass for optional sky-colour styling. Off is the unchanged physical atmosphere.',
    label: 'Enable Sky Color',
    value: false,
  }),
  amount: num({
    description: 'Blends the styled sky palette over the physical atmosphere.',
    label: 'Sky Color Amount',
    max: 1,
    min: 0,
    range: [0, 1, 0.01],
    unit: DIMENSIONLESS,
    value: 1,
  }),
});

const SKY_PALETTE_FIELDS = Object.freeze({
  enabled: bool({
    description: 'Applies an authored zenith-to-horizon palette while retaining physical variation.',
    label: 'Enable Palette',
    value: false,
  }),
  zenithColor: col({
    description: 'Sky colour directly overhead.',
    label: 'Zenith',
    value: [0.21, 0.57, 0.78],
  }),
  horizonColor: col({
    description: 'Sky colour at the horizon.',
    label: 'Horizon',
    value: [0.66, 0.85, 1],
  }),
  horizonBlend: num({
    description: 'How far the horizon colour rises into the sky before becoming the zenith colour.',
    label: 'Horizon Blend',
    max: 0.5,
    min: 0.02,
    range: [0.02, 0.5, 0.01],
    unit: DIMENSIONLESS,
    value: 0.14,
  }),
  saturation: num({
    description: 'Saturation of the authored sky palette. 1 preserves its colour and 0 makes it grey.',
    label: 'Saturation',
    max: 2,
    min: 0,
    range: [0, 2, 0.01],
    unit: DIMENSIONLESS,
    value: 1,
  }),
  contrast: num({
    description: 'Contrast around the middle of the styled sky range.',
    label: 'Contrast',
    max: 2,
    min: 0,
    range: [0, 2, 0.01],
    unit: DIMENSIONLESS,
    value: 1,
  }),
  brightness: num({
    description: 'Final brightness of the styled sky palette.',
    label: 'Brightness',
    max: 2,
    min: 0,
    range: [0, 2, 0.01],
    unit: DIMENSIONLESS,
    value: 1,
  }),
});

const SKY_TIME_PALETTE_FIELDS = Object.freeze({
  enabled: bool({
    description: 'Adds authored morning, evening, and night colours from the existing sky clock.',
    label: 'Enable Time Palette',
    value: false,
  }),
  morningEnabled: bool({
    description: 'Enables only the morning sky grade. Afternoon, evening, and night are unchanged.',
    label: 'Enable Morning',
    value: true,
  }),
  morningZenith: col({
    description: 'Upper-sky colour while the morning sun is near the horizon.',
    label: 'Morning Zenith',
    value: [0.12, 0.4, 0.8],
  }),
  morningHorizon: col({
    description: 'Horizon colour while the morning sun is near the horizon.',
    label: 'Morning Horizon',
    value: [1, 0.56, 0.3],
  }),
  morningAmount: num({
    description: 'Strength of the authored morning colours.',
    label: 'Morning Amount',
    max: 1,
    min: 0,
    range: [0, 1, 0.01],
    unit: DIMENSIONLESS,
    value: 0.72,
  }),
  morningFill: num({
    description: 'Adds a warm ambient floor only while the morning sun is near the horizon.',
    label: 'Morning Fill',
    max: 1,
    min: 0,
    range: [0, 1, 0.01],
    unit: DIMENSIONLESS,
    value: 0.24,
  }),
  eveningEnabled: bool({
    description: 'Enables only the evening sky grade. Morning, afternoon, and night are unchanged.',
    label: 'Enable Evening',
    value: true,
  }),
  eveningZenith: col({
    description: 'Upper-sky colour while the evening sun is near the horizon.',
    label: 'Evening Zenith',
    value: [0.38, 0.2, 0.44],
  }),
  eveningHorizon: col({
    description: 'Horizon colour while the evening sun is near the horizon.',
    label: 'Evening Horizon',
    value: [1, 0.42, 0.18],
  }),
  eveningAmount: num({
    description: 'Strength of the authored evening colours.',
    label: 'Evening Amount',
    max: 1,
    min: 0,
    range: [0, 1, 0.01],
    unit: DIMENSIONLESS,
    value: 0.75,
  }),
  eveningFill: num({
    description: 'Adds a warm ambient floor only while the evening sun is near the horizon.',
    label: 'Evening Fill',
    max: 1,
    min: 0,
    range: [0, 1, 0.01],
    unit: DIMENSIONLESS,
    value: 0.22,
  }),
  nightEnabled: bool({
    description: 'Enables only the night sky grade. Morning, afternoon, and evening are unchanged.',
    label: 'Enable Night',
    value: true,
  }),
  nightZenith: col({
    description: 'Upper-sky colour during full night.',
    label: 'Night Zenith',
    value: [0.005, 0.015, 0.08],
  }),
  nightHorizon: col({
    description: 'Horizon colour during full night.',
    label: 'Night Horizon',
    value: [0.02, 0.06, 0.2],
  }),
  nightAmount: num({
    description: 'Strength of the authored night colours.',
    label: 'Night Amount',
    max: 1,
    min: 0,
    range: [0, 1, 0.01],
    unit: DIMENSIONLESS,
    value: 1,
  }),
  nightFill: num({
    description: 'Adds a deep-blue ambient floor only during night.',
    label: 'Night Fill',
    max: 1,
    min: 0,
    range: [0, 1, 0.01],
    unit: DIMENSIONLESS,
    value: 0.14,
  }),
  nightStars: num({
    description: 'Brightness of the star panorama only while the night palette is active.',
    label: 'Night Stars',
    max: 2,
    min: 0,
    range: [0, 2, 0.01],
    unit: DIMENSIONLESS,
    value: 1,
  }),
});

const SKY_STAR_FIELD_FIELDS = Object.freeze({
  enabled: bool({
    description: 'Shapes a supplied panorama into sparse, crisp night-sky anchors while retaining a subtle diffuse celestial band.',
    label: 'Enable Star Field',
    value: false,
  }),
  amount: num({
    description: 'Blends from the supplied panorama to the polished star-field treatment.',
    label: 'Star Field Amount',
    max: 1,
    min: 0,
    range: [0, 1, 0.01],
    unit: DIMENSIONLESS,
    value: 1,
  }),
  pointThreshold: num({
    description: 'Panorama luminance where distinct star points begin to separate from the diffuse field.',
    label: 'Point Threshold',
    max: 1,
    min: 0,
    range: [0, 1, 0.005],
    unit: DIMENSIONLESS,
    value: 0.02,
  }),
  pointSoftness: num({
    description: 'Soft transition from the diffuse celestial field into distinct star points.',
    label: 'Point Softness',
    max: 1,
    min: 0.005,
    range: [0.005, 1, 0.005],
    unit: DIMENSIONLESS,
    value: 0.06,
  }),
  diffuseStrength: num({
    description: 'Amount of faint panorama and celestial-band radiance retained behind the distinct stars.',
    label: 'Diffuse Field',
    max: 1,
    min: 0,
    range: [0, 1, 0.01],
    unit: DIMENSIONLESS,
    value: 0.08,
  }),
  pointBrightness: num({
    description: 'Brightness of the distinct star points after the diffuse field is separated.',
    label: 'Point Brightness',
    max: 2,
    min: 0,
    range: [0, 2, 0.01],
    unit: DIMENSIONLESS,
    value: 0.75,
  }),
});

export const SKY_COLOR_MODULE_IDS = Object.freeze(['palette', 'timePalette', 'starField']);

export const SKY_COLOR_FIELD_SCHEMA = Object.freeze({
  ...SKY_COLOR_MASTER_FIELDS,
  palette: SKY_PALETTE_FIELDS,
  timePalette: SKY_TIME_PALETTE_FIELDS,
  starField: SKY_STAR_FIELD_FIELDS,
});

assertSchemaInvariants('skyColor', SKY_COLOR_FIELD_SCHEMA);

export function normalizeSkyColorParams(path, input, fallback, report) {
  if (hasValue(input) && !isObject(input)) {
    report.errors.push(`${path} must be an object (got ${describe(input)}).`);
  }
  const source = isObject(input) ? input : {};
  const base = isObject(fallback) ? fallback : {};
  const params = normalizeBlock(
    path,
    SKY_COLOR_MASTER_FIELDS,
    source,
    base,
    report,
    { ignored: SKY_COLOR_MODULE_IDS },
  );
  params.palette = normalizeBlock(
    `${path}.palette`,
    SKY_PALETTE_FIELDS,
    source.palette,
    base.palette,
    report,
  );
  params.timePalette = normalizeBlock(
    `${path}.timePalette`,
    SKY_TIME_PALETTE_FIELDS,
    source.timePalette,
    base.timePalette,
    report,
  );
  params.starField = normalizeBlock(
    `${path}.starField`,
    SKY_STAR_FIELD_FIELDS,
    source.starField,
    base.starField,
    report,
  );
  return params;
}

export function skyColorParamsToLive(params) {
  return {
    ...params,
    palette: colorFieldsToColors(SKY_PALETTE_FIELDS, params.palette),
    timePalette: colorFieldsToColors(SKY_TIME_PALETTE_FIELDS, params.timePalette),
    starField: colorFieldsToColors(SKY_STAR_FIELD_FIELDS, params.starField),
  };
}

export function toSerializableSkyColorParams(params) {
  const source = skyColorParamsToLive(normalizeSkyColorParams(
    'atmosphere.style',
    params,
    null,
    { errors: [], warnings: [] },
  ));
  return {
    enabled: source.enabled,
    amount: source.amount,
    palette: Object.fromEntries(Object.entries(SKY_PALETTE_FIELDS).map(([key, field]) => [
      key,
      field.type === 'color' ? toChannels(source.palette[key]) : source.palette[key],
    ])),
    timePalette: Object.fromEntries(Object.entries(SKY_TIME_PALETTE_FIELDS).map(([key, field]) => [
      key,
      field.type === 'color' ? toChannels(source.timePalette[key]) : source.timePalette[key],
    ])),
    starField: Object.fromEntries(Object.entries(SKY_STAR_FIELD_FIELDS).map(([key, field]) => [
      key,
      field.type === 'color' ? toChannels(source.starField[key]) : source.starField[key],
    ])),
  };
}

export const DEFAULT_SKY_COLOR_PARAMS = deepFreeze(skyColorParamsToLive(
  normalizeSkyColorParams('atmosphere.style', {}, null, { errors: [], warnings: [] }),
));

function warnReport(report) {
  for (const message of report.errors) console.warn(`[skyColor] ${message}`);
  for (const message of report.warnings) console.warn(`[skyColor] ${message}`);
}

class SkyColorBlock {
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

/** Live uniform-backed state consumed by the atmosphere shader. */
export class SkyColorParams {
  constructor(params = null) {
    const defaults = DEFAULT_SKY_COLOR_PARAMS;
    this.master = new SkyColorBlock(SKY_COLOR_MASTER_FIELDS, defaults);
    this.palette = new SkyColorBlock(SKY_PALETTE_FIELDS, defaults.palette);
    this.timePalette = new SkyColorBlock(SKY_TIME_PALETTE_FIELDS, defaults.timePalette);
    this.starField = new SkyColorBlock(SKY_STAR_FIELD_FIELDS, defaults.starField);
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
    const normalized = skyColorParamsToLive(normalizeSkyColorParams(
      'atmosphere.style',
      params,
      this.toParams(),
      report,
    ));
    warnReport(report);
    this.master.setNormalized(normalized);
    this.palette.setNormalized(normalized.palette);
    this.timePalette.setNormalized(normalized.timePalette);
    this.starField.setNormalized(normalized.starField);
    return this;
  }

  toParams() {
    return {
      ...this.master.toParams(),
      palette: this.palette.toParams(),
      timePalette: this.timePalette.toParams(),
      starField: this.starField.toParams(),
    };
  }
}

export function createSkyColorParams(params = null) {
  return new SkyColorParams(params);
}

const SKY_LUMINANCE = vec3(0.2126, 0.7152, 0.0722);

/** Applies the optional palettes to physical sky radiance, leaving the sun separate. */
export function applySkyColorNode(
  radiance,
  viewDirection,
  style = null,
  timeOfDay = null,
) {
  const physical = max(vec3(radiance), vec3(0));
  if (!style?.enabled || (!style?.palette?.enabled && !style?.timePalette?.enabled)) {
    return physical;
  }

  const palette = style.palette;
  const direction = normalize(viewDirection).toVar();
  // Gameplay and review cameras can sit above uneven terrain and see a few
  // degrees below the mathematical horizon. Leaving that region as ungraded
  // physical radiance produces a hard grey/black belt between the styled sky
  // and the world. Carry the authored horizon palette through the shallow
  // below-horizon region; world geometry still occludes the deeper dome.
  const skyMask = smoothstep(-0.32, 0.04, direction.y).toVar();
  const gradient = smoothstep(0, max(palette.horizonBlend, 0.02), direction.y).toVar();
  const target = mix(palette.horizonColor, palette.zenithColor, gradient).toVar();

  // Resolve the time state before the daytime palette. The V2.1 palette is a
  // daylight art direction, so allowing it to remain active after evening is
  // what produced the cyan night leakage in the first V2.7 attempt.
  const timePalette = style.timePalette;
  const night = saturate(timeOfDay?.skyDarkness ?? float(0)).toVar();
  const clock = saturate(timeOfDay?.time ?? float(0.5)).toVar();
  const eveningSide = smoothstep(0.48, 0.52, clock).toVar();
  const morning = saturate(timeOfDay?.morningLight ?? float(0)).toVar();
  const evening = saturate(timeOfDay?.eveningLight ?? float(0)).toVar();
  const timePresence = timePalette
    ? saturate(max(
      max(
        morning.mul(timePalette.morningEnabled),
        evening.mul(timePalette.eveningEnabled),
      ),
      night.mul(timePalette.nightEnabled),
    ).mul(timePalette.enabled))
    : float(0);

  // This follows the established AtmosphereSky grade: compress HDR scattering
  // before blending toward authored colours so the post tonemapper does not
  // wash every channel back toward white.
  const scattering = physical.div(physical.add(1)).toVar();
  // A strict authored style must land on its reviewed display palette instead
  // of inheriting an exposure-dependent wash from the HDR scattering buffer.
  // The physical atmosphere still owns the sun, haze, aerial perspective, and
  // cloud volume; this module owns the final clear-sky colour by definition.
  const colored = target.toVar();
  const luminance = dot(colored, SKY_LUMINANCE).toVar();
  const saturated = mix(vec3(luminance), colored, max(palette.saturation, 0));
  const contrasted = saturated.sub(0.5).mul(max(palette.contrast, 0)).add(0.5);
  const styled = max(contrasted.mul(max(palette.brightness, 0)), vec3(0));
  const amount = saturate(
    style.enabled
      .mul(palette.enabled)
      .mul(style.amount)
      .mul(skyMask)
      .mul(timePresence.oneMinus()),
  );
  const dayResult = mix(physical, styled, amount).toVar();

  if (!timePalette) return dayResult;
  const morningTarget = mix(
    timePalette.morningHorizon,
    timePalette.morningZenith,
    gradient,
  ).toVar();
  const eveningTarget = mix(
    timePalette.eveningHorizon,
    timePalette.eveningZenith,
    gradient,
  ).toVar();
  const nightTarget = mix(
    timePalette.nightHorizon,
    timePalette.nightZenith,
    gradient,
  ).toVar();
  const warmTarget = mix(morningTarget, eveningTarget, eveningSide).toVar();
  const timeTarget = mix(warmTarget, nightTarget, night).toVar();

  // Treat the authored colours as a chromatic grade over compressed physical
  // scattering, not as replacement pixels. Normalizing back to the physical
  // luminance retains the atmosphere's real sun/horizon variation and prevents
  // a flat painted wash from taking over the whole dome.
  const targetLuminance = max(dot(timeTarget, SKY_LUMINANCE), 1e-4).toVar();
  const targetTint = timeTarget.div(targetLuminance).toVar();
  const tintedScattering = scattering
    .mul(mix(vec3(1), targetTint, 0.78))
    .toVar();
  const scatteringLuminance = dot(scattering, SKY_LUMINANCE).toVar();
  const tintedLuminance = max(dot(tintedScattering, SKY_LUMINANCE), 1e-4).toVar();
  const warmFill = mix(
    timePalette.morningFill,
    timePalette.eveningFill,
    eveningSide,
  ).toVar();
  const timeFill = mix(warmFill, timePalette.nightFill, night).toVar();
  const timeStyled = max(
    tintedScattering
      .mul(scatteringLuminance.div(tintedLuminance))
      .add(timeTarget.mul(timeFill)),
    vec3(0),
  ).toVar();
  const timeAmount = max(
    max(
      morning.mul(timePalette.morningEnabled).mul(timePalette.morningAmount),
      evening.mul(timePalette.eveningEnabled).mul(timePalette.eveningAmount),
    ),
    night.mul(timePalette.nightEnabled).mul(timePalette.nightAmount),
  ).toVar();
  const timeSkyMask = smoothstep(-0.32, 0.005, direction.y).toVar();
  const timeBlend = saturate(
    style.enabled
      .mul(timePalette.enabled)
      .mul(style.amount)
      .mul(timeSkyMask)
      .mul(timeAmount),
  ).toVar();
  // A real branch is deliberate here. At daytime the V2.7 stage must return
  // the exact V2.6 node value, not merely run a second colour expression with
  // a nominal blend of zero. This also prevents inactive time calculations
  // from leaking NaN/precision differences into the approved daylight path.
  return timeBlend.greaterThan(1e-5).select(
    mix(dayResult, timeStyled, timeBlend),
    dayResult,
  );
}
