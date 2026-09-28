// CPU reference for the active ToonLab reference renderer lighting path.
//
// This deliberately contains no Three nodes. It is the numerical oracle used
// to verify the WebGPU lighting adapter against the supplied ToonLab package,
// rather than against screenshots or hand-tuned constants.

const DIELECTRIC_SPECULAR = 0.04;
const ONE_MINUS_DIELECTRIC_SPECULAR = 1 - DIELECTRIC_SPECULAR;
const HALF_MIN = 0.00006103515625;
const HALF_MIN_SQRT = 0.0078125;

function freezeVector(values) {
  return Object.freeze([...values]);
}

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function saturate(value) {
  return Math.min(Math.max(value, 0), 1);
}

function multiplyColor(left, right) {
  return [0, 1, 2].map((index) => left[index] * right[index]);
}

function scaleColor(color, scalar) {
  return color.map((channel) => channel * scalar);
}

function addColor(left, right) {
  return left.map((channel, index) => channel + right[index]);
}

function dot(left, right) {
  return left.reduce((sum, value, index) => sum + value * right[index], 0);
}

function normalize(vector) {
  const length = Math.hypot(...vector);
  return length > 0 ? vector.map((value) => value / length) : [0, 0, 0];
}

/** ToonLab's Linear project conversion used for Light.color before intensity. */
export function toonLabLightingSrgbChannelToLinear(value) {
  const channel = finite(value);
  return channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
}

export function toonLabLightingSrgbToLinear(color) {
  return color.map(toonLabLightingSrgbChannelToLinear);
}

// Precise values exported from the supplied EnvironmentReferenceScene scene.
const TOONLAB_SUN_COLOR_SRGB = freezeVector([
  1,
  0.9443990588188171,
  0.8443396091461182,
]);
const TOONLAB_SUN_COLOR_LINEAR = freezeVector(
  toonLabLightingSrgbToLinear(TOONLAB_SUN_COLOR_SRGB),
);
const TOONLAB_SUN_FINAL_COLOR = freezeVector(
  scaleColor(TOONLAB_SUN_COLOR_LINEAR, 1.5),
);
const TOONLAB_RAY_DIRECTION = freezeVector([
  -0.6295879005986494,
  -0.7071067357898932,
  -0.3218992693690794,
]);
const THREE_RAY_DIRECTION = freezeVector([
  TOONLAB_RAY_DIRECTION[0],
  TOONLAB_RAY_DIRECTION[1],
  -TOONLAB_RAY_DIRECTION[2],
]);

export const TOONLAB_LIGHTING_REFERENCE = Object.freeze({
  authority: 'ToonLab reference renderer',
  brdf: Object.freeze({
    dielectricSpecular: DIELECTRIC_SPECULAR,
    oneMinusDielectricSpecular: ONE_MINUS_DIELECTRIC_SPECULAR,
    halfMin: HALF_MIN,
    halfMinSqrt: HALF_MIN_SQRT,
    // For stock Three Lambert only. A literal custom TOONLAB BRDF instead divides
    // the globally PI-scaled light back down and applies 0.96 itself.
    threeStockMetallicDiffuseInputScale:
      Math.PI * ONE_MINUS_DIELECTRIC_SPECULAR,
    threeCustomSurfaceInputScale: Math.PI,
  }),
  ambientProbe: Object.freeze({
    coefficient0Linear: freezeVector([0.08701412, 0.2798782, 0.6684512]),
    coefficients1Through8: 'zero',
    preconvolvedWithClampedCosine: true,
  }),
  sun: Object.freeze({
    colorSrgb: TOONLAB_SUN_COLOR_SRGB,
    colorLinear: TOONLAB_SUN_COLOR_LINEAR,
    finalColorLinear: TOONLAB_SUN_FINAL_COLOR,
    intensity: 1.5,
    // ToonLab +Z-forward, direction in which the light rays travel.
    toonLabRayDirection: TOONLAB_RAY_DIRECTION,
    toonLabSurfaceToLight: freezeVector(TOONLAB_RAY_DIRECTION.map((value) => -value)),
    // The ToonLab exporter reflects Z when producing glTF/Three coordinates.
    threeRayDirection: THREE_RAY_DIRECTION,
    threeSurfaceToLight: freezeVector(THREE_RAY_DIRECTION.map((value) => -value)),
  }),
  ssao: Object.freeze({
    method: 'BlueNoise',
    configuredRadius: 0.3,
    blueNoiseRadiusMultiplier: 1.5,
    shaderRadius: 0.45,
    samplePreset: 'Medium',
    sampleCount: 8,
    intensityInsideEstimator: 0.4,
    contrastExponent: 0.6,
    falloffDistance: 100,
    directLightingStrength: 0.25,
  }),
  sources: Object.freeze({
    sceneManifest:
      'assets-local/reference-environment/environment-scene/scene-manifest.json',
    brdf:
      'ToonLab renderer ShaderLibrary/BRDF.hlsl:9-96,177-214',
    lighting:
      'ToonLab renderer ShaderLibrary/Lighting.hlsl:32-100,302-403',
    ambientProbe:
      'ToonLab ambient-probe and spherical-harmonic contract',
    ambientOcclusion:
      'ToonLab renderer ShaderLibrary/AmbientOcclusion.hlsl:28-68',
    ssao:
      'ToonLab renderer Runtime/Passes/ScreenSpaceAmbientOcclusionPass.cs:84-103,435-447 + ShaderLibrary/SSAO.hlsl:29-47,385-447,528-535',
    threePhysicalSetup:
      'three/src/materials/nodes/MeshPhysicalNodeMaterial.js:348-354',
    threeRoughnessSetup:
      'three/src/nodes/functions/material/getRoughness.js:4-15',
  }),
});

/** Literal TOONLAB BRDFData initialization for metallic or specular workflow. */
export function initializeToonLabSurfaceBrdf({
  albedo = [1, 1, 1],
  metallic = 0,
  specular = [DIELECTRIC_SPECULAR, DIELECTRIC_SPECULAR, DIELECTRIC_SPECULAR],
  smoothness = 0.5,
  workflow = 'metallic',
} = {}) {
  const baseColor = albedo.map((channel) => finite(channel));
  const sourceSpecular = specular.map((channel) => finite(channel));
  const resolvedSmoothness = finite(smoothness, 0.5);
  let reflectivity;
  let oneMinusReflectivity;
  let diffuse;
  let brdfSpecular;

  if (workflow === 'specular') {
    reflectivity = Math.max(...sourceSpecular);
    oneMinusReflectivity = 1 - reflectivity;
    diffuse = scaleColor(baseColor, oneMinusReflectivity);
    brdfSpecular = sourceSpecular;
  } else {
    const resolvedMetallic = finite(metallic);
    oneMinusReflectivity = ONE_MINUS_DIELECTRIC_SPECULAR
      - resolvedMetallic * ONE_MINUS_DIELECTRIC_SPECULAR;
    reflectivity = 1 - oneMinusReflectivity;
    diffuse = scaleColor(baseColor, oneMinusReflectivity);
    brdfSpecular = baseColor.map((channel) => (
      DIELECTRIC_SPECULAR
      + (channel - DIELECTRIC_SPECULAR) * resolvedMetallic
    ));
  }

  const perceptualRoughness = 1 - resolvedSmoothness;
  const roughness = Math.max(
    perceptualRoughness * perceptualRoughness,
    HALF_MIN_SQRT,
  );
  const roughness2 = Math.max(roughness * roughness, HALF_MIN);

  return Object.freeze({
    albedo: freezeVector(baseColor),
    diffuse: freezeVector(diffuse),
    grazingTerm: saturate(resolvedSmoothness + reflectivity),
    normalizationTerm: roughness * 4 + 2,
    oneMinusReflectivity,
    perceptualRoughness,
    reflectivity,
    roughness,
    roughness2,
    roughness2MinusOne: roughness2 - 1,
    smoothness: resolvedSmoothness,
    specular: freezeVector(brdfSpecular),
    workflow: workflow === 'specular' ? 'specular' : 'metallic',
  });
}

/** Literal TOONLAB DirectBRDFSpecular scalar (desktop/full-real branch). */
export function evaluateToonLabSurfaceDirectSpecularScalar({
  brdf,
  normal = [0, 1, 0],
  lightDirection = [0, 1, 0],
  viewDirection = [0, 1, 0],
  realIsHalf = false,
} = {}) {
  if (!brdf) throw new TypeError('brdf is required');
  const normalDirection = normalize(normal);
  const incomingLight = normalize(lightDirection);
  const incomingView = normalize(viewDirection);
  const halfDirection = normalize(addColor(incomingLight, incomingView));
  const nDotH = saturate(dot(normalDirection, halfDirection));
  const lDotH = saturate(dot(incomingLight, halfDirection));
  const d = nDotH * nDotH * brdf.roughness2MinusOne + 1.00001;
  let scalar = brdf.roughness2 / (
    d * d
    * Math.max(0.1, lDotH * lDotH)
    * brdf.normalizationTerm
  );
  if (realIsHalf) scalar = Math.min(Math.max(scalar - HALF_MIN, 0), 1000);
  return scalar;
}

/** Direct light after distance, shadow and screen-space AO attenuation. */
export function evaluateToonLabSurfaceDirectLighting({
  brdf,
  lightColor = [1, 1, 1],
  normal = [0, 1, 0],
  lightDirection = [0, 1, 0],
  viewDirection = [0, 1, 0],
  distanceAttenuation = 1,
  shadowAttenuation = 1,
  directAmbientOcclusion = 1,
} = {}) {
  if (!brdf) throw new TypeError('brdf is required');
  const nDotL = saturate(dot(normalize(normal), normalize(lightDirection)));
  const attenuation = finite(distanceAttenuation, 1)
    * finite(shadowAttenuation, 1)
    * finite(directAmbientOcclusion, 1);
  const radiance = scaleColor(lightColor, attenuation * nDotL);
  const specularScalar = evaluateToonLabSurfaceDirectSpecularScalar({
    brdf,
    normal,
    lightDirection,
    viewDirection,
  });
  const diffuse = multiplyColor(radiance, brdf.diffuse);
  const specular = scaleColor(
    multiplyColor(radiance, brdf.specular),
    specularScalar,
  );
  return Object.freeze({
    diffuse: freezeVector(diffuse),
    nDotL,
    radiance: freezeVector(radiance),
    specular: freezeVector(specular),
    specularScalar,
    total: freezeVector(addColor(diffuse, specular)),
  });
}

/**
 * SSAO texture placement used by TOONLAB UniversalFragmentPBR.
 * The sample is already a visibility value after ToonLab's intensity/contrast
 * estimator and bilateral blur; intensity must not be applied again here.
 */
export function evaluateToonLabSurfaceSsaoFactors(sample, {
  directLightingStrength = 0.25,
  materialOcclusion = 1,
} = {}) {
  const visibility = saturate(finite(sample, 1));
  return Object.freeze({
    direct: 1 + (visibility - 1) * finite(directLightingStrength, 0.25),
    indirect: Math.min(visibility, finite(materialOcclusion, 1)),
    visibility,
  });
}

/** ToonLab's transfer from normalized obscurance to the final AO visibility. */
export function evaluateToonLabSsaoVisibilityFromObscurance(obscurance, {
  intensity = 0.4,
  contrastExponent = 0.6,
  viewDepth = 0,
  falloffDistance = 100,
} = {}) {
  const depthFalloff = Math.max(
    1 - Math.max(finite(viewDepth), 0) / finite(falloffDistance, 100),
    0,
  ) ** 2;
  const occlusion = saturate(
    Math.max(finite(obscurance), 0) * finite(intensity, 0.4) * depthFalloff,
  ) ** finite(contrastExponent, 0.6);
  return 1 - occlusion;
}

/** The F0 Three produces before the custom lighting model sees specularColor. */
export function evaluateThreePhysicalSpecularF0(sourceSpecular, {
  ior = 1.5,
  intensity = 1,
} = {}) {
  const resolvedIor = finite(ior, 1.5);
  const dielectricF0 = ((resolvedIor - 1) / (resolvedIor + 1)) ** 2;
  return sourceSpecular.map((channel) => (
    Math.min(dielectricF0 * finite(channel), 1) * finite(intensity, 1)
  ));
}
