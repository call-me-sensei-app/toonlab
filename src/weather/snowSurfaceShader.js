// Reusable snow-surface look module.
//
// Weather/accumulation systems own the current coverage and depth. This module
// owns how that accumulated snow renders on any compatible material domain.
// It returns composable TSL nodes rather than replacing the host material.

import * as THREE from 'three';
import {
  clamp,
  max,
  mix,
  normalWorldGeometry,
  positionWorld,
  smoothstep,
  uniform,
  vec3,
} from 'three/tsl';

import {
  worldFbm2,
  worldValueNoise2,
} from '../shaders-tsl/chunks/world-noise.js';

export const SNOW_SURFACE_SHADER_ID = 'snow-surface';

export const DEFAULT_SNOW_SURFACE_SETTINGS = Object.freeze({
  color: Object.freeze({
    powderTint: Object.freeze([0.68, 0.8, 0.96]),
    shadowTint: Object.freeze([0.18, 0.3, 0.58]),
    shadowTintStrength: 0.4,
  }),
  coverage: Object.freeze({
    contrast: 0.55,
    edgeNoiseScale: 0.42,
    edgeNoiseStrength: 0.08,
  }),
  structure: Object.freeze({
    macroScale: 0.16,
    macroStrength: 0.16,
    microScale: 5.5,
    microStrength: 0.045,
    troughDarkening: 0.14,
  }),
  response: Object.freeze({
    meltDarkening: 0.16,
    meltRoughness: 0.48,
    powderRoughness: 0.94,
    powderSpecular: 0.12,
    sparkleScale: 24,
    sparkleStrength: 0.12,
    sparkleThreshold: 0.94,
  }),
});

const FIELD_DEFINITIONS = Object.freeze({
  color: Object.freeze({
    powderTint: Object.freeze({ label: 'Powder Tint', type: 'color' }),
    shadowTint: Object.freeze({ label: 'Snow Shadow Tint', type: 'color' }),
    shadowTintStrength: Object.freeze({
      label: 'Shadow Body',
      range: Object.freeze({ max: 1, min: 0, step: 0.01 }),
    }),
  }),
  coverage: Object.freeze({
    contrast: Object.freeze({
      label: 'Coverage Contrast',
      range: Object.freeze({ max: 1, min: 0, step: 0.01 }),
    }),
    edgeNoiseScale: Object.freeze({
      label: 'Edge Noise Scale',
      range: Object.freeze({ max: 4, min: 0.01, step: 0.01 }),
    }),
    edgeNoiseStrength: Object.freeze({
      label: 'Edge Breakup',
      range: Object.freeze({ max: 0.5, min: 0, step: 0.005 }),
    }),
  }),
  structure: Object.freeze({
    macroScale: Object.freeze({
      label: 'Powder Mound Scale',
      range: Object.freeze({ max: 2, min: 0.005, step: 0.005 }),
    }),
    macroStrength: Object.freeze({
      label: 'Powder Mound Strength',
      range: Object.freeze({ max: 0.5, min: 0, step: 0.005 }),
    }),
    microScale: Object.freeze({
      label: 'Granule Scale',
      range: Object.freeze({ max: 40, min: 0.1, step: 0.1 }),
    }),
    microStrength: Object.freeze({
      label: 'Granule Strength',
      range: Object.freeze({ max: 0.4, min: 0, step: 0.005 }),
    }),
    troughDarkening: Object.freeze({
      label: 'Powder Trough Depth',
      range: Object.freeze({ max: 0.5, min: 0, step: 0.005 }),
    }),
  }),
  response: Object.freeze({
    powderRoughness: Object.freeze({
      label: 'Powder Roughness',
      range: Object.freeze({ max: 1, min: 0, step: 0.01 }),
    }),
    powderSpecular: Object.freeze({
      label: 'Powder Specular',
      range: Object.freeze({ max: 1, min: 0, step: 0.01 }),
    }),
    sparkleScale: Object.freeze({
      label: 'Sparkle Scale',
      range: Object.freeze({ max: 80, min: 1, step: 0.5 }),
    }),
    sparkleStrength: Object.freeze({
      label: 'Sparkle Strength',
      range: Object.freeze({ max: 1, min: 0, step: 0.01 }),
    }),
    sparkleThreshold: Object.freeze({
      label: 'Sparkle Threshold',
      range: Object.freeze({ max: 0.999, min: 0.5, step: 0.001 }),
    }),
    meltDarkening: Object.freeze({
      label: 'Melt Darkening',
      range: Object.freeze({ max: 1, min: 0, step: 0.01 }),
    }),
    meltRoughness: Object.freeze({
      label: 'Melt Roughness',
      range: Object.freeze({ max: 1, min: 0, step: 0.01 }),
    }),
  }),
});

export const SNOW_SURFACE_SHADER_FIELD_SCHEMA = Object.freeze(
  Object.fromEntries(Object.entries(FIELD_DEFINITIONS).map(([group, fields]) => [
    group,
    Object.freeze(Object.fromEntries(Object.entries(fields).map(([key, field]) => [
      key,
      Object.freeze({
        ...field,
        defaultValue: DEFAULT_SNOW_SURFACE_SETTINGS[group][key],
        group,
        id: `${group}.${key}`,
        key,
        type: field.type ?? 'number',
      }),
    ]))),
  ])),
);

function number(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function color(value, fallback) {
  if (!Array.isArray(value) || value.length < 3) return [...fallback];
  const channels = value.slice(0, 3).map(Number);
  return channels.every(Number.isFinite) ? channels : [...fallback];
}

export function createSnowSurfaceSettings(options = {}) {
  const defaults = DEFAULT_SNOW_SURFACE_SETTINGS;
  const input = options?.settings ?? options;
  return {
    color: {
      powderTint: color(input.color?.powderTint, defaults.color.powderTint),
      shadowTint: color(input.color?.shadowTint, defaults.color.shadowTint),
      shadowTintStrength: number(
        input.color?.shadowTintStrength,
        defaults.color.shadowTintStrength,
        0,
        1,
      ),
    },
    coverage: {
      contrast: number(input.coverage?.contrast, defaults.coverage.contrast, 0, 1),
      edgeNoiseScale: number(
        input.coverage?.edgeNoiseScale,
        defaults.coverage.edgeNoiseScale,
        0.001,
        10,
      ),
      edgeNoiseStrength: number(
        input.coverage?.edgeNoiseStrength,
        defaults.coverage.edgeNoiseStrength,
        0,
        0.75,
      ),
    },
    structure: {
      macroScale: number(input.structure?.macroScale, defaults.structure.macroScale, 0.001, 8),
      macroStrength: number(input.structure?.macroStrength, defaults.structure.macroStrength, 0, 1),
      microScale: number(input.structure?.microScale, defaults.structure.microScale, 0.01, 100),
      microStrength: number(input.structure?.microStrength, defaults.structure.microStrength, 0, 1),
      troughDarkening: number(
        input.structure?.troughDarkening,
        defaults.structure.troughDarkening,
        0,
        1,
      ),
    },
    response: {
      meltDarkening: number(input.response?.meltDarkening, defaults.response.meltDarkening, 0, 1),
      meltRoughness: number(input.response?.meltRoughness, defaults.response.meltRoughness, 0, 1),
      powderRoughness: number(input.response?.powderRoughness, defaults.response.powderRoughness, 0, 1),
      powderSpecular: number(input.response?.powderSpecular, defaults.response.powderSpecular, 0, 1),
      sparkleScale: number(input.response?.sparkleScale, defaults.response.sparkleScale, 0.01, 200),
      sparkleStrength: number(input.response?.sparkleStrength, defaults.response.sparkleStrength, 0, 2),
      sparkleThreshold: number(
        input.response?.sparkleThreshold,
        defaults.response.sparkleThreshold,
        0.01,
        0.9999,
      ),
    },
  };
}

function srgbUniform(value) {
  return uniform(new THREE.Color().setRGB(
    value[0],
    value[1],
    value[2],
    THREE.SRGBColorSpace,
  ));
}

export function createSnowSurfaceUniforms(options = {}) {
  const settings = createSnowSurfaceSettings(options);
  return {
    uSnowCoverageContrast: uniform(settings.coverage.contrast),
    uSnowEdgeNoiseScale: uniform(settings.coverage.edgeNoiseScale),
    uSnowEdgeNoiseStrength: uniform(settings.coverage.edgeNoiseStrength),
    uSnowMacroScale: uniform(settings.structure.macroScale),
    uSnowMacroStrength: uniform(settings.structure.macroStrength),
    uSnowMeltDarkening: uniform(settings.response.meltDarkening),
    uSnowMeltRoughness: uniform(settings.response.meltRoughness),
    uSnowMicroScale: uniform(settings.structure.microScale),
    uSnowMicroStrength: uniform(settings.structure.microStrength),
    uSnowPowderRoughness: uniform(settings.response.powderRoughness),
    uSnowPowderSpecular: uniform(settings.response.powderSpecular),
    uSnowPowderTint: srgbUniform(settings.color.powderTint),
    uSnowShadowTint: srgbUniform(settings.color.shadowTint),
    uSnowShadowTintStrength: uniform(settings.color.shadowTintStrength),
    uSnowSparkleScale: uniform(settings.response.sparkleScale),
    uSnowSparkleStrength: uniform(settings.response.sparkleStrength),
    uSnowSparkleThreshold: uniform(settings.response.sparkleThreshold),
    uSnowTroughDarkening: uniform(settings.structure.troughDarkening),
  };
}

function setSrgbUniform(node, value) {
  node.value.setRGB(
    value[0],
    value[1],
    value[2],
    THREE.SRGBColorSpace,
  );
}

export function updateSnowSurfaceUniforms(uniforms, options = {}) {
  const settings = createSnowSurfaceSettings(options);
  setSrgbUniform(uniforms.uSnowPowderTint, settings.color.powderTint);
  setSrgbUniform(uniforms.uSnowShadowTint, settings.color.shadowTint);
  uniforms.uSnowShadowTintStrength.value = settings.color.shadowTintStrength;
  uniforms.uSnowCoverageContrast.value = settings.coverage.contrast;
  uniforms.uSnowEdgeNoiseScale.value = settings.coverage.edgeNoiseScale;
  uniforms.uSnowEdgeNoiseStrength.value = settings.coverage.edgeNoiseStrength;
  uniforms.uSnowMacroScale.value = settings.structure.macroScale;
  uniforms.uSnowMacroStrength.value = settings.structure.macroStrength;
  uniforms.uSnowMicroScale.value = settings.structure.microScale;
  uniforms.uSnowMicroStrength.value = settings.structure.microStrength;
  uniforms.uSnowTroughDarkening.value = settings.structure.troughDarkening;
  uniforms.uSnowMeltDarkening.value = settings.response.meltDarkening;
  uniforms.uSnowMeltRoughness.value = settings.response.meltRoughness;
  uniforms.uSnowPowderRoughness.value = settings.response.powderRoughness;
  uniforms.uSnowPowderSpecular.value = settings.response.powderSpecular;
  uniforms.uSnowSparkleScale.value = settings.response.sparkleScale;
  uniforms.uSnowSparkleStrength.value = settings.response.sparkleStrength;
  uniforms.uSnowSparkleThreshold.value = settings.response.sparkleThreshold;
  return uniforms;
}

export function buildSnowSurfaceLayer({
  baseColor,
  baseRoughness = 0.9,
  baseSpecular = 0.08,
  coverage,
  geometryNormal = normalWorldGeometry,
  melt = 0,
  position = positionWorld,
  uniforms = createSnowSurfaceUniforms(),
}) {
  const edgeNoise = worldFbm2(
    position.xz.mul(uniforms.uSnowEdgeNoiseScale),
  ).sub(0.5);
  const noisyCoverage = clamp(
    coverage.add(edgeNoise.mul(uniforms.uSnowEdgeNoiseStrength)),
    0,
    1,
  );
  const transitionWidth = max(
    uniforms.uSnowCoverageContrast.oneMinus().mul(0.72),
    0.035,
  );
  const mask = smoothstep(
    transitionWidth.mul(-0.5).add(0.5),
    transitionWidth.mul(0.5).add(0.5),
    noisyCoverage,
  );

  const macro = worldFbm2(
    position.xz.mul(uniforms.uSnowMacroScale),
  ).sub(0.5).mul(2);
  const micro = worldFbm2(
    position.xz.mul(uniforms.uSnowMicroScale),
  ).sub(0.5).mul(2);
  const trough = macro.oneMinus().mul(0.5).clamp(0, 1);
  const powderVariation = macro.mul(uniforms.uSnowMacroStrength)
    .add(micro.mul(uniforms.uSnowMicroStrength))
    .sub(trough.mul(uniforms.uSnowTroughDarkening));

  const slopeBody = geometryNormal.y.oneMinus()
    .mul(uniforms.uSnowShadowTintStrength)
    .add(trough.mul(uniforms.uSnowTroughDarkening))
    .clamp(0, 1);
  let snowColor = mix(
    uniforms.uSnowPowderTint,
    uniforms.uSnowShadowTint,
    slopeBody,
  );
  snowColor = snowColor.mul(powderVariation.add(1));

  const sparkleNoise = worldValueNoise2(
    position.xz.mul(uniforms.uSnowSparkleScale),
  );
  const sparkle = smoothstep(
    uniforms.uSnowSparkleThreshold,
    1,
    sparkleNoise,
  ).mul(uniforms.uSnowSparkleStrength);
  snowColor = snowColor.add(vec3(sparkle));

  const meltAmount = clamp(melt, 0, 1);
  snowColor = snowColor.mul(
    meltAmount.mul(uniforms.uSnowMeltDarkening).oneMinus(),
  );
  const snowRoughness = mix(
    uniforms.uSnowPowderRoughness,
    uniforms.uSnowMeltRoughness,
    meltAmount,
  );
  const snowSpecular = clamp(
    uniforms.uSnowPowderSpecular.add(sparkle),
    0,
    1,
  );

  return {
    color: mix(baseColor, snowColor, mask),
    coverage: mask,
    roughness: mix(baseRoughness, snowRoughness, mask),
    snowColor,
    specular: mix(baseSpecular, snowSpecular, mask),
  };
}
