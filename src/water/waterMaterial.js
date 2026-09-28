import * as THREE from 'three';

import { createWaterNodeMaterial } from '../shaders-tsl/water.js';
import {
  buildGerstnerWaves,
  createWaterSettings,
  WATER_DEBUG_MODES,
  WATER_GERSTNER_WAVE_COUNT,
} from './waterSettings.js';

// Quality tiers gate the most expensive fragment features:
// low    — no caustics/sparkles, 2-octave detail noise
// medium — caustics + sparkles, no chromatic caustics, 3-octave detail
// high   — chromatic caustics, 4-octave detail
const QUALITY_DEFINES = Object.freeze({
  low: Object.freeze({ WATER_QUALITY: 0, WATER_DETAIL_OCTAVES: 2, WATER_FOAM_OCTAVES: 2 }),
  medium: Object.freeze({ WATER_QUALITY: 1, WATER_DETAIL_OCTAVES: 3, WATER_FOAM_OCTAVES: 3 }),
  high: Object.freeze({ WATER_QUALITY: 2, WATER_DETAIL_OCTAVES: 4, WATER_FOAM_OCTAVES: 3 }),
});

/**
 * The named water quality tiers, keyed 'low' | 'medium' | 'high'. Each tier
 * maps to the shader defines it produces:
 * `{ WATER_QUALITY, WATER_DETAIL_OCTAVES, WATER_FOAM_OCTAVES }` — see
 * resolveWaterQualityDefines for the feature gates per WATER_QUALITY level.
 * Frozen; use a custom `{ detailOctaves, foamOctaves, qualityLevel }` quality
 * object to deviate from the named tiers.
 */
export const WATER_QUALITY_TIERS = QUALITY_DEFINES;

function clampOctaves(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(8, Math.max(1, Math.round(number)));
}

/**
 * Resolves a quality request into the water shader defines
 * `{ WATER_QUALITY, WATER_DETAIL_OCTAVES, WATER_FOAM_OCTAVES }`.
 *
 * Accepts either a named tier ('low' | 'medium' | 'high', see
 * WATER_QUALITY_TIERS) or a custom tier object:
 *
 *   { detailOctaves: 5, foamOctaves: 4, qualityLevel: 'high' }
 *
 * - `qualityLevel` picks the feature gate (0/'low' = no caustics or sparkles,
 *   1/'medium' = caustics + sparkles, 2/'high' = chromatic caustics) and the
 *   octave fallbacks; it defaults to 'high'.
 * - `detailOctaves` / `foamOctaves` override the noise octave counts
 *   (clamped to 1..8 integers).
 *
 * Unknown or missing values fall back to the 'high' tier, matching the
 * previous behavior.
 *
 * @param {string|{detailOctaves?: number, foamOctaves?: number, qualityLevel?: string|number}} quality
 * @returns {{WATER_QUALITY: number, WATER_DETAIL_OCTAVES: number, WATER_FOAM_OCTAVES: number}}
 */
export function resolveWaterQualityDefines(quality) {
  if (quality && typeof quality === 'object') {
    const level = quality.qualityLevel;
    const numericLevel = Number(level);
    const tier = Number.isFinite(numericLevel)
      ? Object.values(QUALITY_DEFINES)
        .find((entry) => entry.WATER_QUALITY === Math.min(2, Math.max(0, Math.round(numericLevel))))
      : QUALITY_DEFINES[String(level ?? 'high').toLowerCase()];
    const base = tier ?? QUALITY_DEFINES.high;
    return Object.freeze({
      WATER_QUALITY: base.WATER_QUALITY,
      WATER_DETAIL_OCTAVES: clampOctaves(quality.detailOctaves, base.WATER_DETAIL_OCTAVES),
      WATER_FOAM_OCTAVES: clampOctaves(quality.foamOctaves, base.WATER_FOAM_OCTAVES),
    });
  }
  return QUALITY_DEFINES[String(quality ?? '').toLowerCase()] ?? QUALITY_DEFINES.high;
}

// createWaterSettings normalizes `quality` to a named tier string, so a
// custom tier object must be pulled from the raw options before it is lost.
function requestedWaterQuality(options, settings) {
  const raw = options && typeof options === 'object' ? options.quality : undefined;
  return raw && typeof raw === 'object' ? raw : settings.quality;
}

// Water colors are authored as sRGB values in settings/presets; uniforms are
// uploaded in linear working space and converted back at the end of the
// fragment shader, matching the pipeline used by built-in materials.
function setSrgbColorUniform(uniform, value) {
  if (!uniform) return;
  const [r, g, b] = Array.isArray(value) ? value : [value?.r ?? 1, value?.g ?? 1, value?.b ?? 1];
  if (!uniform.value?.isColor) uniform.value = new THREE.Color();
  uniform.value.setRGB(r, g, b, THREE.SRGBColorSpace);
}

function setVector2Uniform(uniform, value) {
  if (!uniform) return;
  if (!uniform.value?.isVector2) uniform.value = new THREE.Vector2();
  uniform.value.set(value?.[0] ?? value?.x ?? 1, value?.[1] ?? value?.y ?? 0);
}

function setDirection3Uniform(uniform, value) {
  if (!uniform) return;
  if (!uniform.value?.isVector3) uniform.value = new THREE.Vector3();
  uniform.value
    .set(value?.[0] ?? value?.x ?? 0, value?.[1] ?? value?.y ?? 1, value?.[2] ?? value?.z ?? 0)
    .normalize();
}

function writeWaveUniforms(material, waves) {
  const wavesA = material.uniforms.uWavesA.value;
  const wavesB = material.uniforms.uWavesB.value;
  for (let i = 0; i < WATER_GERSTNER_WAVE_COUNT; i += 1) {
    const wave = waves[i];
    wavesA[i].set(wave.dirX, wave.dirZ, wave.omega, wave.waveNumber);
    wavesB[i].set(wave.amplitude, wave.phase, wave.steepness, wave.crestWeight);
  }
}

export function resolveWaterDebugMode(mode) {
  if (typeof mode === 'number' && Number.isFinite(mode)) return Math.max(0, Math.floor(mode));
  return WATER_DEBUG_MODES[String(mode ?? 'off').toLowerCase()] ?? 0;
}

export function setWaterDebugMode(material, mode) {
  if (material?.uniforms?.uDebugMode) {
    material.uniforms.uDebugMode.value = resolveWaterDebugMode(mode);
  }
  return material;
}

export function applyWaterSettingsToMaterial(material, options = {}) {
  const uniforms = material?.uniforms;
  if (!uniforms) return material;
  const settings = createWaterSettings(options);
  const waves = buildGerstnerWaves(settings);

  writeWaveUniforms(material, waves);
  if (uniforms.uSwashIncidenceX) {
    uniforms.uSwashIncidenceX.value = waves[0]?.dirX ?? 0;
  }

  uniforms.uDetailNormalStrength.value = settings.detailNormalStrength;
  uniforms.uDetailScale.value = settings.detailScale;
  setVector2Uniform(uniforms.uFlowDirection, settings.flowDirection);
  uniforms.uFlowSpeed.value = settings.flowSpeed;

  setSrgbColorUniform(uniforms.uShallowColor, settings.shallowColor);
  setSrgbColorUniform(uniforms.uMidColor, settings.midColor);
  setSrgbColorUniform(uniforms.uDeepColor, settings.deepColor);
  uniforms.uDepthFadeDistance.value = settings.depthFadeDistance;
  uniforms.uDeepFadeDistance.value = settings.deepFadeDistance;
  uniforms.uOpacity.value = settings.opacity;
  uniforms.uRefractionStrength.value = settings.refractionStrength;
  uniforms.uIndexOfRefraction.value = settings.indexOfRefraction;
  uniforms.uUnderwaterTransmission.value = settings.underwaterTransmission;
  uniforms.uUnderwaterTintStrength.value = settings.underwaterTintStrength;
  uniforms.uCausticsStrength.value = settings.causticsStrength;
  uniforms.uCausticsScale.value = settings.causticsScale;
  uniforms.uCausticsSpeed.value = settings.causticsSpeed;

  setSrgbColorUniform(uniforms.uFoamColor, settings.foamColor);
  uniforms.uFoamAmount.value = settings.foamAmount;
  uniforms.uSwashFoamAmount.value = settings.swashFoamAmount;
  uniforms.uFoamContactDistance.value = settings.foamContactDistance;
  uniforms.uFoamLineSpacing.value = settings.foamLineSpacing;
  uniforms.uFoamNoiseScale.value = settings.foamNoiseScale;
  uniforms.uWhitecapAmount.value = settings.whitecapAmount;
  uniforms.uRippleFoamStrength.value = settings.rippleFoamStrength;

  setDirection3Uniform(uniforms.uSunDirection, settings.sunDirection);
  setSrgbColorUniform(uniforms.uSunColor, settings.sunColor);
  uniforms.uSpecularStrength.value = settings.specularStrength;
  uniforms.uSpecularShininess.value = settings.specularShininess;
  uniforms.uSpecularStretch.value = settings.specularStretch;
  uniforms.uSparkleStrength.value = settings.sparkleStrength;
  uniforms.uSparkleScale.value = settings.sparkleScale;
  uniforms.uSparkleSpeed.value = settings.sparkleSpeed;
  uniforms.uSunGlowStrength.value = settings.sunGlowStrength;
  uniforms.uSceneShadowStrength.value = settings.sceneShadowStrength;
  uniforms.uFresnelStrength.value = settings.fresnelStrength;
  uniforms.uFresnelPower.value = settings.fresnelPower;
  uniforms.uFresnelBias.value = settings.fresnelBias;
  uniforms.uReflectionSoftness.value = settings.reflectionSoftness;
  setSrgbColorUniform(uniforms.uFresnelColor, settings.fresnelColor);
  setSrgbColorUniform(uniforms.uSkyZenithColor, settings.skyZenithColor);
  setSrgbColorUniform(uniforms.uSkyHorizonColor, settings.skyHorizonColor);
  uniforms.uReflectionStrength.value = settings.reflectionStrength;
  uniforms.uReflectionDistortion.value = settings.reflectionDistortion;

  uniforms.uRippleHeightScale.value = settings.rippleHeightScale;
  uniforms.uShoalingDepth.value = settings.shoalingDepth;
  uniforms.uShorelineWaves.value = settings.shorelineWaves;
  uniforms.uShorelineRunup.value = settings.shorelineRunup;
  uniforms.uRunupDistance.value = settings.runupDistance;
  if (uniforms.uBreakerEnabled) {
    uniforms.uBreakerEnabled.value = settings.breakerEnabled === false ? 0 : 1;
  }
  if (uniforms.uBreakerAmount) uniforms.uBreakerAmount.value = settings.breakerAmount;
  // Total swell energy — normalizes breaker foam and scales swash run-up.
  const waveEnergy = waves.reduce((sum, wave) => sum + Math.abs(wave.amplitude), 0);
  uniforms.uWaveEnergy.value = waveEnergy;
  material.userData.waterWaveEnergy = waveEnergy;

  const qualityDefines = resolveWaterQualityDefines(requestedWaterQuality(options, settings));
  const currentDefines = material.defines ?? {};
  if (currentDefines.WATER_QUALITY !== qualityDefines.WATER_QUALITY
    || currentDefines.WATER_DETAIL_OCTAVES !== qualityDefines.WATER_DETAIL_OCTAVES
    || currentDefines.WATER_FOAM_OCTAVES !== qualityDefines.WATER_FOAM_OCTAVES) {
    material.defines = { ...material.defines, ...qualityDefines };
    material.needsUpdate = true;
  }

  material.userData.waterMaterial = true;
  material.userData.waterSettings = settings;
  material.userData.gerstnerWaves = waves;
  return material;
}

export function createWaterMaterial(options = {}) {
  const settings = createWaterSettings(options);
  const requestedQuality = requestedWaterQuality(options, settings);
  const qualityDefines = resolveWaterQualityDefines(requestedQuality);

  // Node-backend material: same uniform-name surface, quality defines baked
  // as graph flags (a later quality change needs a new material on this
  // backend). `options.shoaling` is the WATER_SHOALING define analog —
  // WaterSurface passes it when a bed sampler bakes aBedHeight.
  const material = createWaterNodeMaterial({
    waveCount: WATER_GERSTNER_WAVE_COUNT,
    qualityLevel: qualityDefines.WATER_QUALITY,
    detailOctaves: qualityDefines.WATER_DETAIL_OCTAVES,
    foamOctaves: qualityDefines.WATER_FOAM_OCTAVES,
    shoaling: Boolean(options.shoaling),
    dynamics: Boolean(options.dynamics),
  });
  return applyWaterSettingsToMaterial(
    material,
    typeof requestedQuality === 'object' ? { ...settings, quality: requestedQuality } : settings,
  );
}

const invViewProjScratch = new THREE.Matrix4();

// Node backends: the water fragment reconstructs world positions with the
// literal GLSL math — screenUv/rawDepth * 2 - 1 into uInvViewProjMatrix — so
// the backend differences are composed into the matrix on the CPU
// (docs/tsl-conventions.md #6): screenUV is top-left-origin on both node
// backends (y-negate), and WebGPU NDC z is [0,1] (the stored [0,1] window
// depth IS the WebGPU NDC z, so z' maps 2d-1 back to d). These are the
// inverses of pass-depth-color's shadowClipAdjust* matrices.
const ndcAdjustWebGPU = new THREE.Matrix4().set(
  1, 0, 0, 0,
  0, -1, 0, 0,
  0, 0, 0.5, 0.5,
  0, 0, 0, 1,
);
const ndcAdjustGL = new THREE.Matrix4().set(
  1, 0, 0, 0,
  0, -1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
);

// Per-frame camera/screen uniform refresh. WaterSurface calls this for you;
// it is exported for projects driving the material directly.
export function updateWaterMaterialCamera(material, renderer, camera) {
  const uniforms = material?.uniforms;
  if (!uniforms) return material;
  renderer.getDrawingBufferSize(uniforms.uResolution.value);
  uniforms.uCameraNear.value = camera.near;
  uniforms.uCameraFar.value = camera.far;
  if (uniforms.uDepthTargetNeedsReverse) {
    uniforms.uDepthTargetNeedsReverse.value = renderer.reversedDepthBuffer ? 1 : 0;
  }
  invViewProjScratch.multiplyMatrices(camera.matrixWorld, camera.projectionMatrixInverse);
  invViewProjScratch.multiply(
    renderer.coordinateSystem === THREE.WebGPUCoordinateSystem ? ndcAdjustWebGPU : ndcAdjustGL,
  );
  uniforms.uInvViewProjMatrix.value.copy(invViewProjScratch);
  return material;
}
