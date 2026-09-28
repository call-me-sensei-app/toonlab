/**
 * Renderer-boundary conversions for an exported ToonLab source scene.
 *
 * ToonLab's deferred directional-light path and Three's physical-light path
 * both evaluate a Lambert diffuse BRDF with the same 1 / PI normalization.
 * Directional-light and SkyLight intensities therefore cross this boundary
 * unchanged; a legacy 0.2 display calibration is not a unit conversion.
 */
export const TOONLAB_SOURCE_RADIOMETRIC_SCALE = 1;

// Source-authoritative stages must not carry presentation tuning. Query-string
// multipliers remain useful diagnostics, but an unmodified showcase URL uses
// the exported component values without compensating exposure, fill, or fog
// scales. Keep these values shared so a later visual calibration cannot
// silently become the baseline again.
export const TOONLAB_SOURCE_STAGE_INPUT_SCALES = Object.freeze({
  directionalLight: 1,
  fogDensity: 1,
  skyLight: 1,
});

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function resolveToonLabDirectionalIntensity(properties = {}, scale = 1) {
  return Math.max(0, finiteNumber(properties.intensity, 0))
    * Math.max(0, finiteNumber(scale, TOONLAB_SOURCE_RADIOMETRIC_SCALE));
}

export function resolveToonLabSkyLightIntensity(properties = {}, scale = 1) {
  return Math.max(0, finiteNumber(properties.intensity, 1))
    * Math.max(0, finiteNumber(scale, TOONLAB_SOURCE_RADIOMETRIC_SCALE));
}

/**
 * Resolve the source values consumed by ToonLab's legacy radial point-light path.
 *
 * UPointLightComponent only applies its legacy intensity multiplier of 16
 * when inverse-square falloff is enabled with unitless intensity. The two
 * ToonLabShowcase lights explicitly disable inverse-square falloff, so their proxy
 * brightness remains the authored value and LightFalloffExponent controls the
 * normalized-radius mask instead.
 */
export function resolveToonLabPointLightContract(properties = {}) {
  const useInverseSquaredFalloff = properties.use_inverse_squared_falloff !== false;
  const intensityUnits = String(properties.intensity_units ?? '');
  const unitless = intensityUnits === '' || intensityUnits.includes('UNITLESS');
  const authoredIntensity = Math.max(0, finiteNumber(properties.intensity, 0));
  const intensity = useInverseSquaredFalloff && unitless
    ? authoredIntensity * 16
    : authoredIntensity;

  return {
    attenuationRadiusMeters: Math.max(
      Number.EPSILON,
      finiteNumber(properties.attenuation_radius, 0) * 0.01,
    ),
    intensity,
    intensityUnits: unitless ? 'unitless' : intensityUnits,
    lightFalloffExponent: Math.max(
      Number.EPSILON,
      finiteNumber(properties.light_falloff_exponent, 8),
    ),
    useInverseSquaredFalloff,
  };
}

/**
 * CPU form of DynamicLightingCommon.ush::RadialAttenuation().
 * Useful for verifying the shader-side source contract at known distances.
 */
export function evaluateToonLabRadialAttenuation(
  distanceMeters,
  attenuationRadiusMeters,
  falloffExponent,
) {
  const distance = Math.max(0, finiteNumber(distanceMeters, 0));
  const radius = Math.max(
    Number.EPSILON,
    finiteNumber(attenuationRadiusMeters, Number.EPSILON),
  );
  const exponent = Math.max(Number.EPSILON, finiteNumber(falloffExponent, 8));
  const normalizedDistanceSquared = Math.min(1, (distance * distance) / (radius * radius));
  return (1 - normalizedDistanceSquared) ** exponent;
}

/**
 * Reproduce FDirectionalLightSceneProxy::ComputeAccumulatedScale().
 *
 * CSMShadowNode expects each split as normalized view depth, while ToonLab first
 * interpolates between the actual near plane and the CSM far distance. Keep
 * that near-plane term so a source camera remains deterministic at any clip.
 */
export function computeToonLabCascadeBreaks({
  cascadeCount,
  exponent,
  near = 0,
  far = 1,
}) {
  const count = Math.max(1, Math.round(finiteNumber(cascadeCount, 1)));
  const distribution = Math.max(0.1, finiteNumber(exponent, 1));
  const nearDistance = Math.max(0, finiteNumber(near, 0));
  const farDistance = Math.max(nearDistance + Number.EPSILON, finiteNumber(far, 1));
  const accumulated = [];
  let currentScale = 1;
  let totalScale = 0;

  for (let index = 0; index < count; index += 1) {
    totalScale += currentScale;
    accumulated.push(totalScale);
    currentScale *= distribution;
  }

  return accumulated.map((value) => {
    const fraction = value / totalScale;
    const splitDistance = nearDistance + fraction * (farDistance - nearDistance);
    return splitDistance / farDistance;
  });
}
