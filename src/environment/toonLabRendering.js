// Renderer-level contract extracted from the supplied ToonLab
// project while EnvironmentReferenceScene is running. This is intentionally
// independent of the ToonLab export: PC_RPAsset, PC_Renderer, the active
// camera, RenderSettings and the scene's Global Volume are the authority.

import * as THREE from 'three';
import {
  TOONLAB_BLOOM_CONTRACT,
} from './toonLabBloom.js';
import {
  toonLabSurfaceBlueNoiseAmbientOcclusion,
} from './toonLabAmbientOcclusion.js';
import {
  TOONLAB_TAA_CONTRACT,
  ToonLabTemporalAANode,
  computeToonLabTaaJitter,
  toonLabTraa,
} from './toonLabTemporal.js';
import {
  abs,
  clamp,
  dot,
  exp2,
  float,
  floor,
  fog,
  log2,
  max,
  mix,
  positionView,
  perspectiveDepthToViewZ,
  pow,
  texture,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';

export {
  TOONLAB_TAA_CONTRACT,
  TOONLAB_TAA_SAMPLE_OFFSETS,
  TOONLAB_TAA_SOURCE,
  ToonLabTemporalAANode,
  computeToonLabTaaJitter,
  computeToonLabSurfaceTaaHistoryTaps,
  evaluateToonLabSurfaceTaaNeighborhood,
  evaluateToonLabSurfaceTaaPerceptualBlend,
  toonLabTraa,
  toonLabSurfaceHalton,
  toonLabSurfaceRgbToYCoCg,
  toonLabSurfaceYCoCgToRgb,
} from './toonLabTemporal.js';

export {
  TOONLAB_BLOOM_CONTRACT,
  TOONLAB_BLOOM_HORIZONTAL,
  TOONLAB_BLOOM_SOURCE,
  TOONLAB_BLOOM_VERTICAL,
  ToonLabGaussianBloomNode,
  applyToonLabBloomTint,
  computeToonLabBloomBaseResolution,
  computeToonLabBloomMipCount,
  computeToonLabBloomMipResolutions,
  evaluateToonLabBloomComposite,
  evaluateToonLabBloomPrefilter,
  toonLabBloom,
} from './toonLabBloom.js';

export {
  TOONLAB_SURFACE_BLUE_NOISE_SHA256,
  TOONLAB_SURFACE_SSAO_BILATERAL_KERNEL,
  TOONLAB_SURFACE_SSAO_RANDOM_UV,
  TOONLAB_SURFACE_SSAO_SOURCE,
  ToonLabSurfaceBlueNoiseAmbientOcclusionNode,
  evaluateToonLabSurfaceAlchemySample,
  evaluateToonLabSurfaceAlchemyVisibility,
  evaluateToonLabSurfaceSsaoBilateral,
  evaluateToonLabSurfaceSsaoFinalVisibility,
  assertToonLabSurfaceBlueNoiseTexturesReady,
  loadToonLabSurfaceBlueNoiseTexturesAsync,
  pickToonLabSurfaceBlueNoiseSamplePoint,
  toonLabSurfaceBlueNoiseAmbientOcclusion,
} from './toonLabAmbientOcclusion.js';

const LOG_2_10 = Math.log2(10);
const TOONLAB_LUT_SIZE = 32;
const TOONLAB_LUT_WIDTH = TOONLAB_LUT_SIZE * TOONLAB_LUT_SIZE;
const TOONLAB_REC709_LUMINANCE = Object.freeze([0.2126729, 0.7151522, 0.072175]);
const TOONLAB_LOG_C = Object.freeze({
  a: 5.555556,
  b: 0.047996,
  c: 0.244161,
  d: 0.386036,
});

function freezeArray(values) {
  return Object.freeze([...values]);
}

export function toonLabSrgbChannelToLinear(value) {
  const channel = Number(value) || 0;
  return channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
}

export function toonLabSrgbToLinear(values) {
  return values.map(toonLabSrgbChannelToLinear);
}

const FOG_COLOR_SRGB = freezeArray([
  0.51487797498703,
  0.7254297733306885,
  0.9430000185966492,
]);
const FOG_COLOR_LINEAR = freezeArray([
  0.22807127237319947,
  0.48505982756614687,
  0.8752002716064453,
]);
const SUN_COLOR_SRGB = freezeArray([1, 0.9443990588188171, 0.8443396091461182]);
const AMBIENT_SKY_SRGB = freezeArray([0.32643, 0.565616, 0.837]);
const COLOR_FILTER_SRGB = freezeArray([0.8867924, 0.8867924, 0.8867924]);

export const TOONLAB_RENDER_CONTRACT = Object.freeze({
  authority: 'ToonLab reference renderer',
  scene: 'Assets/ToonLab/Demo/EnvironmentReferenceScene.toonlab',
  pipeline: Object.freeze({
    name: 'PC_RPAsset',
    renderer: 'PC_Renderer',
    renderScale: 1,
    msaaSamples: 1,
    hdr: true,
    colorSpace: 'Linear',
    colorGradingMode: 'LDR',
    colorGradingLutSize: TOONLAB_LUT_SIZE,
    additionalLights: 'PerPixel',
    additionalLightsPerObject: 4,
    reflectionProbeBlending: true,
    reflectionProbeBoxProjection: true,
  }),
  camera: Object.freeze({
    near: 1,
    far: 500000,
    fieldOfView: 60,
    clearFlags: 'Skybox',
    // RenderSettings.skybox is null, so ToonLab's Skybox clear falls back to
    // this Camera background before the authored P_Sky mesh is drawn.
    backgroundColorSrgb: freezeArray([
      0.1921568661928177,
      0.3019607961177826,
      0.4745098054409027,
      0,
    ]),
    antiAliasing: 'TemporalAntiAliasing',
    taa: Object.freeze({
      quality: TOONLAB_TAA_CONTRACT.qualityName,
      frameInfluence: TOONLAB_TAA_CONTRACT.frameInfluence,
      jitterScale: TOONLAB_TAA_CONTRACT.jitterScale,
      varianceClampScale: TOONLAB_TAA_CONTRACT.varianceClampScale,
      contrastAdaptiveSharpening: 0,
      sequence: TOONLAB_TAA_CONTRACT.sequence,
      sequenceLength: TOONLAB_TAA_CONTRACT.sequenceLength,
    }),
  }),
  ambientProbe: Object.freeze({
    mode: 'Skybox',
    intensity: 1,
    skyColorSrgb: AMBIENT_SKY_SRGB,
    // The runtime probe has only SH coefficient 0 populated. It therefore
    // evaluates to this constant irradiance for every normal direction.
    coefficient0Linear: freezeArray([0.08701412, 0.2798782, 0.6684512]),
    coefficients1Through8: 'zero',
    // TOONLAB multiplies bakedGI by BRDFData.diffuse directly. Three treats an
    // AmbientLight as irradiance and applies Lambert 1/PI, so converting the
    // same probe value into Three's convention requires PI at the input.
    threeLambertInputScale: Math.PI,
  }),
  fog: Object.freeze({
    mode: 'Exponential',
    density: 0.0012,
    // Native Camera 0 Metal capture after Shader.SetGlobal* has populated
    // ToonLab's built-ins. ToonLab renderer's dynamic FOG_EXP branch multiplies
    // near-relative view Z by toonLabFogParams.x, then calls exp2(-factor).
    toonLabFogParams: freezeArray([
      0.0014413469471037388,
      0.001731234136968851,
      0,
      0,
    ]),
    colorSrgb: FOG_COLOR_SRGB,
    // Captured from the uploaded native `toonLabFogColor` global. Using that
    // float result avoids a second host-side sRGB conversion/rounding path.
    colorLinear: FOG_COLOR_LINEAR,
    distance: 'positive view-space Z',
  }),
  sun: Object.freeze({
    type: 'Directional',
    intensity: 1.5,
    colorSrgb: SUN_COLOR_SRGB,
    colorLinear: freezeArray(toonLabSrgbToLinear(SUN_COLOR_SRGB)),
    // ToonLab Light.forward is the direction travelled by the ray. The exported
    // glTF/Three scene reflects ToonLab Z to change handedness, so the same ray
    // must reflect Z as well. `rayDirection` is the Three-space value used by
    // the runtime; the original is retained for source verification.
    rayDirectionToonLab: freezeArray([
      -0.6295879006,
      -0.7071067358,
      -0.3218992694,
    ]),
    rayDirection: freezeArray([
      -0.6295879006,
      -0.7071067358,
      0.3218992694,
    ]),
    shadows: 'Soft',
    shadowStrength: 1,
    // These two values are serialized on P_Sky's Light component, but
    // ToonLabLightData.m_UsePipelineSettings=1 bypasses them.
    lightBias: 0.92,
    normalBias: 0.8,
    serializedLightBiasBypassed: true,
    effectiveLightBias: 0.1,
    effectiveNormalBias: 0.5,
    nearPlane: 0.1,
    // TOONLAB Universal Lit's direct diffuse branch does not include Lambert's
    // 1/PI. Three's PhysicalLightingModel does, requiring the same conversion.
    threeLambertInputScale: Math.PI,
  }),
  shadows: Object.freeze({
    distance: 50,
    cascadeCount: 4,
    cascadeSplits: freezeArray([0.12299999, 0.2926, 0.53599995, 1]),
    cascadeBorder: 0.107758604,
    cascadeAtlasLayout: '2x2',
    cascadeTileResolution: 1024,
    // PC_RPAsset's 2048 value is the full 2x2 main-light atlas, not the
    // resolution of each of its four cascade tiles.
    mainResolution: 2048,
    additionalResolution: 2048,
    pipelineDepthBias: 0.1,
    pipelineNormalBias: 0.5,
    softShadowQuality: 3,
  }),
  ssao: Object.freeze({
    method: 'BlueNoise Alchemy ScreenSpaceAmbientOcclusion RendererFeature',
    fullResolution: true,
    source: 1,
    normalSamples: 1,
    intensity: 0.4,
    directLightingStrength: 0.25,
    radius: 0.3,
    radiusMultiplier: 1.5,
    radiusInShader: 0.45,
    samplesPreset: 1,
    sampleCount: 8,
    blurQuality: 0,
    blur: 'High bilateral horizontal + vertical + small-kernel final',
    falloff: 100,
    contrast: 0.6,
  }),
  bloom: TOONLAB_BLOOM_CONTRACT,
  vignette: Object.freeze({
    colorLinear: freezeArray([0, 0, 0]),
    center: freezeArray([0.5, 0.5]),
    intensity: 0.4,
    intensityResolved: 1.2,
    smoothness: 0.2,
    smoothnessResolved: 1,
    rounded: false,
    roundnessResolved: 1,
  }),
  colorGrade: Object.freeze({
    postExposure: 0,
    contrast: 20,
    contrastMultiplier: 1.2,
    contrastPivot: 0.4135884,
    colorFilterSrgb: COLOR_FILTER_SRGB,
    colorFilterLinear: freezeArray(toonLabSrgbToLinear(COLOR_FILTER_SRGB)),
    hueShift: 0,
    saturation: -3.3,
    saturationMultiplier: 0.967,
    tonemapper: 'None',
    internalLutFormat: 'R8G8B8A8_UNorm',
  }),
  depthOfField: Object.freeze({ active: false }),
});

function clamp01(value) {
  return Math.min(Math.max(Number(value) || 0, 0), 1);
}

function linearToLogC(value) {
  const { a, b, c, d } = TOONLAB_LOG_C;
  return c * Math.log10(Math.max(a * value + b, 0)) + d;
}

function logCToLinear(value) {
  const { a, b, c, d } = TOONLAB_LOG_C;
  return (10 ** ((value - d) / c) - b) / a;
}

/**
 * CPU translation of the active LutBuilderLdr.shader graph. All inactive
 * grading overrides are identities, so the source graph reduces to LogC
 * contrast, the linear color filter and Rec.709 global saturation.
 */
export function evaluateToonLabLdrGrade(color) {
  const contract = TOONLAB_RENDER_CONTRACT.colorGrade;
  let result = [0, 1, 2].map((index) => clamp01(color?.[index]));
  result = result.map((value) => logCToLinear(
    (linearToLogC(value) - contract.contrastPivot)
      * contract.contrastMultiplier
      + contract.contrastPivot,
  ));
  result = result.map((value, index) => Math.max(
    value * contract.colorFilterLinear[index],
    0,
  ));
  const luminance = result.reduce(
    (sum, value, index) => sum + value * TOONLAB_REC709_LUMINANCE[index],
    0,
  );
  return result.map((value) => clamp01(
    luminance + contract.saturationMultiplier * (value - luminance),
  ));
}

let toonLabLdrLut = null;

/** Build the same 32x32x32 R8 strip LUT as TOONLAB's ColorGradingLutPass. */
export function createToonLabLdrLut() {
  if (toonLabLdrLut) return toonLabLdrLut;
  const data = new Uint8Array(TOONLAB_LUT_WIDTH * TOONLAB_LUT_SIZE * 4);
  for (let blue = 0; blue < TOONLAB_LUT_SIZE; blue += 1) {
    for (let green = 0; green < TOONLAB_LUT_SIZE; green += 1) {
      for (let red = 0; red < TOONLAB_LUT_SIZE; red += 1) {
        const x = blue * TOONLAB_LUT_SIZE + red;
        const offset = (green * TOONLAB_LUT_WIDTH + x) * 4;
        const graded = evaluateToonLabLdrGrade([
          red / (TOONLAB_LUT_SIZE - 1),
          green / (TOONLAB_LUT_SIZE - 1),
          blue / (TOONLAB_LUT_SIZE - 1),
        ]);
        data[offset] = Math.round(graded[0] * 255);
        data[offset + 1] = Math.round(graded[1] * 255);
        data[offset + 2] = Math.round(graded[2] * 255);
        data[offset + 3] = 255;
      }
    }
  }
  toonLabLdrLut = new THREE.DataTexture(
    data,
    TOONLAB_LUT_WIDTH,
    TOONLAB_LUT_SIZE,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  toonLabLdrLut.name = 'ToonLab.ToonLab.PC_RPAsset.LdrColorGrade32';
  toonLabLdrLut.colorSpace = THREE.NoColorSpace;
  toonLabLdrLut.flipY = false;
  toonLabLdrLut.wrapS = THREE.ClampToEdgeWrapping;
  toonLabLdrLut.wrapT = THREE.ClampToEdgeWrapping;
  toonLabLdrLut.minFilter = THREE.LinearFilter;
  toonLabLdrLut.magFilter = THREE.LinearFilter;
  toonLabLdrLut.generateMipmaps = false;
  toonLabLdrLut.needsUpdate = true;
  toonLabLdrLut.userData.toonLab = {
    format: 'R8G8B8A8_UNorm',
    size: TOONLAB_LUT_SIZE,
    source: 'TOONLAB LutBuilderLdr.shader',
  };
  return toonLabLdrLut;
}

/** Exact TOONLAB ApplyLut2D addressing and blue-slice interpolation. */
export function applyToonLabLdrGradeLut(inputNode, {
  lut = createToonLabLdrLut(),
} = {}) {
  const input = clamp(inputNode.rgb, 0, 1);
  const z = input.b.mul(TOONLAB_LUT_SIZE - 1);
  const slice = floor(z);
  const scale = vec2(1 / TOONLAB_LUT_WIDTH, 1 / TOONLAB_LUT_SIZE);
  const sampleUv = input.rg
    .mul(TOONLAB_LUT_SIZE - 1)
    .mul(scale)
    .add(scale.mul(0.5))
    .add(vec2(slice.mul(1 / TOONLAB_LUT_SIZE), 0));
  const lutNode = texture(lut);
  const lower = lutNode.sample(sampleUv).rgb;
  const upper = lutNode.sample(sampleUv.add(vec2(1 / TOONLAB_LUT_SIZE, 0))).rgb;
  return vec4(mix(lower, upper, z.sub(slice)), inputNode.a);
}

/**
 * Analytic form of the active LDR LUT builder. This avoids a cross-backend
 * top-left/bottom-left strip-texture convention mismatch while preserving the
 * source graph. It differs from ToonLab only by the final 8-bit LUT quantization
 * and trilinear interpolation (at most 1/255 per LUT channel).
 */
export function applyToonLabLdrGrade(inputNode) {
  const contract = TOONLAB_RENDER_CONTRACT.colorGrade;
  const source = clamp(inputNode.rgb, 0, 1);
  const logColor = log2(max(
    source.mul(TOONLAB_LOG_C.a).add(TOONLAB_LOG_C.b),
    0,
  )).div(LOG_2_10).mul(TOONLAB_LOG_C.c).add(TOONLAB_LOG_C.d);
  const contrastedLog = logColor
    .sub(contract.contrastPivot)
    .mul(contract.contrastMultiplier)
    .add(contract.contrastPivot);
  const linear = pow(
    vec3(10),
    contrastedLog.sub(TOONLAB_LOG_C.d).div(TOONLAB_LOG_C.c),
  ).sub(TOONLAB_LOG_C.b).div(TOONLAB_LOG_C.a);
  const filtered = max(
    linear.mul(vec3(...contract.colorFilterLinear)),
    0,
  );
  const luminance = dot(filtered, vec3(...TOONLAB_REC709_LUMINANCE));
  const graded = clamp(
    vec3(luminance).add(
      filtered.sub(vec3(luminance)).mul(contract.saturationMultiplier),
    ),
    0,
    1,
  );
  return vec4(graded, inputNode.a);
}

export function createToonLabFogNode() {
  const contract = TOONLAB_RENDER_CONTRACT.fog;
  const nearRelativeDistance = max(
    positionView.z.negate().sub(TOONLAB_RENDER_CONTRACT.camera.near),
    0,
  );
  const fogFactor = nearRelativeDistance.mul(contract.toonLabFogParams[0]);
  const amount = float(1).sub(exp2(fogFactor.negate()));
  return fog(vec3(...contract.colorLinear), clamp(amount, 0, 1));
}

/**
 * Apply ToonLab's exponential fog once, after opaque lighting and before the
 * camera post stack. `participationNode` is a material-family MRT contract:
 * PBR forward families write one because their TOONLAB include calls MixFog;
 * S_StylizedSky/S_StylizedClouds write zero because ToonLabGraph's
 * UniversalUnlitSubTarget include has no fog call. Keeping the blend here is
 * also important for the ToonLab SSAO decomposition: fog must not be evaluated
 * in each direct/indirect/emissive pass and then added three times.
 */
export function applyToonLabFog(
  inputNode,
  depthNode,
  camera,
  participationNode = float(1),
) {
  const contract = TOONLAB_RENDER_CONTRACT.fog;
  const viewZ = perspectiveDepthToViewZ(
    depthNode.r,
    float(camera.near),
    float(camera.far),
  );
  // InitializeInputDataFog remaps view Z so zero starts at the near plane,
  // then ComputeFogFactorZ0ToFar/ComputeFogIntensity execute the active
  // dynamic FOG_EXP branch against toonLabFogParams.x.
  const nearRelativeDistance = max(viewZ.negate().sub(float(camera.near)), 0);
  const fogFactor = nearRelativeDistance.mul(contract.toonLabFogParams[0]);
  const amount = clamp(
    float(1).sub(exp2(fogFactor.negate())),
    0,
    1,
  ).mul(clamp(participationNode, 0, 1));
  return vec4(
    mix(inputNode.rgb, vec3(...contract.colorLinear), amount),
    inputNode.a,
  );
}

export function applyToonLabVignette(inputNode) {
  const contract = TOONLAB_RENDER_CONTRACT.vignette;
  const distance = abs(uv().sub(vec2(...contract.center)))
    .mul(contract.intensityResolved);
  const factor = pow(
    clamp(float(1).sub(dot(distance, distance)), 0, 1),
    contract.smoothnessResolved,
  );
  return vec4(inputNode.rgb.mul(factor), inputNode.a);
}

export function evaluateToonLabFog(distance) {
  const contract = TOONLAB_RENDER_CONTRACT;
  const nearRelativeDistance = Math.max(
    (Number(distance) || 0) - contract.camera.near,
    0,
  );
  return 1 - (2 ** (-nearRelativeDistance * contract.fog.toonLabFogParams[0]));
}

export function evaluateToonLabVignette(u, v) {
  const contract = TOONLAB_RENDER_CONTRACT.vignette;
  const dx = Math.abs((Number(u) || 0) - contract.center[0])
    * contract.intensityResolved;
  const dy = Math.abs((Number(v) || 0) - contract.center[1])
    * contract.intensityResolved;
  return clamp01((1 - (dx * dx + dy * dy)) ** contract.smoothnessResolved);
}

/** Exact active TOONLAB BlueNoise/Alchemy SSAO feature and bilateral pass chain. */
export function toonLabAmbientOcclusion(
  depthNode,
  normalNode,
  camera,
  options = {},
) {
  const contract = TOONLAB_RENDER_CONTRACT.ssao;
  const node = toonLabSurfaceBlueNoiseAmbientOcclusion(
    depthNode,
    normalNode,
    camera,
    contract,
    options,
  );
  node.contract = Object.freeze({
    ...contract,
    ...node.contract,
    runtimeBridge: 'literal ToonLab renderer BlueNoise Alchemy + RGBA8 bilateral H/V/final R8 pass chain',
  });
  return node;
}
