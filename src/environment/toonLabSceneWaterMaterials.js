// Source-faithful reconstruction of the three supplied ToonLab water graphs:
// S_StylizedWater, S_WaterWaves, and S_Waterfall.
//
// This module is a transcription of the supplied ToonLab graph JSON,
// renderer-generated ToonLab renderer ForwardLit source, material YAML, and exported
// texture import records. It deliberately does not add refraction, vertex
// displacement, depth-only output, or shadow casting: none exists in source.

import * as THREE from 'three';
import {
  CubeMapNode,
  MeshPhysicalNodeMaterial,
  ViewportDepthTextureNode,
} from 'three/webgpu';
import {
  Fn,
  TBNViewMatrix,
  cameraFar,
  cameraNear,
  cameraPosition,
  clamp,
  distance,
  dot,
  float,
  floor,
  fract,
  linearDepth,
  max,
  mix,
  normalViewGeometry,
  normalWorldGeometry,
  normalize,
  positionView,
  positionViewDirection,
  positionWorld,
  pow,
  screenUV,
  sin,
  texture,
  time,
  uv,
  vec2,
  vec3,
  vec4,
  vertexColor,
} from 'three/tsl';

import {
  applyToonLabNormalStrengthNode,
  createToonLabNormalIntegrationMetadata,
  decodeToonLabNormalNode,
} from './toonLabNormalIntegration.js';
import {
  indexToonLabMaterialProperties,
  linearizeToonLabColorProperty,
  loadToonLabSceneTexture,
  readToonLabScalar,
  readToonLabTextureIndex,
  readToonLabVector,
} from './toonLabSceneRecords.js';
import { installToonLabSurfaceLighting } from './toonLabSurfaceLighting.js';

export const TOONLAB_SCENE_STYLIZED_WATER_SHADER =
  'ToonLab Graphs/S_StylizedWater';
export const TOONLAB_SCENE_WATER_WAVES_SHADER =
  'ToonLab Graphs/S_WaterWaves';
export const TOONLAB_SCENE_WATERFALL_SHADER =
  'ToonLab Graphs/S_Waterfall';

export const DEFAULT_TOONLAB_SCENE_WATER_BASE_URL =
  '/assets-local/reference-environment/environment-scene';

const ACTIVE_PASSES = Object.freeze([
  'ForwardLit',
  'GBuffer',
  'MotionVectors',
  'DepthNormals',
  'Meta',
  'SceneSelectionPass',
  'ScenePickingPass',
  'Universal 2D',
  '<Unnamed Pass 0>',
]);

// The source graph reads TOONLAB's camera depth texture. Three's equivalent copies
// the currently bound framebuffer, whose depth format is context-dependent:
// the direct canvas is depth24plus while the reversed-depth scene PassNode is
// depth32float. A single shared DepthTexture therefore fails in one of those
// two paths. Mirror ViewportTextureNode's per-reference cache, but keep every
// copy texture's type/format synchronized with the source attachment.
class ToonLabViewportDepthTextureNode extends ViewportDepthTextureNode {
  constructor(uvNode = screenUV, levelNode = null, depthTexture = null) {
    const initialDepthTexture = depthTexture ?? new THREE.DepthTexture(
      1,
      1,
      THREE.UnsignedIntType,
    );
    initialDepthTexture.name =
      'ToonLab Stylized Water adaptive viewport depth';
    initialDepthTexture.format = THREE.DepthFormat;
    initialDepthTexture.minFilter = THREE.NearestFilter;
    initialDepthTexture.magFilter = THREE.NearestFilter;
    super(uvNode, levelNode, initialDepthTexture);
  }

  getTextureForReference(reference = null) {
    const viewportDepth = super.getTextureForReference(reference);
    const sourceDepth = reference?.depthTexture;
    const sourceType = sourceDepth?.type ?? THREE.UnsignedIntType;
    const sourceFormat = sourceDepth?.format ?? THREE.DepthFormat;

    if (
      viewportDepth.type !== sourceType
      || viewportDepth.format !== sourceFormat
    ) {
      viewportDepth.type = sourceType;
      viewportDepth.format = sourceFormat;
      viewportDepth.needsUpdate = true;
    }

    return viewportDepth;
  }

  updateBefore(frame) {
    // WebGPURenderer.compileAsync() evaluates material update nodes without a
    // bound render context. There is no framebuffer to copy in that phase and
    // WebGPUBackend.get(null) would otherwise throw. The actual draw evaluates
    // this node again with the camera pass bound.
    if (frame.renderer._currentRenderContext == null) return;
    const renderTarget = frame.renderer.getRenderTarget();
    if (renderTarget !== null && renderTarget.depthTexture == null) return;
    super.updateBefore(frame);
  }
}

const toonLabViewportDepthTexture = (uvNode = screenUV) =>
  new ToonLabViewportDepthTextureNode(uvNode);

const transparentRenderState = ({ alphaClip, cull, queue, receiveShadows }) =>
  Object.freeze({
    alphaClip,
    alphaMode: 'Alpha',
    blend: 'One OneMinusSrcAlpha, One OneMinusSrcAlpha',
    blendModePreserveSpecular: true,
    castShadows: false,
    cull,
    depthTest: 'LessEqual',
    depthWrite: false,
    receiveShadows,
    renderQueue: queue,
    surfaceType: 'Transparent',
  });

const freezeSource = ({
  disconnected = [],
  fullSourceSha256,
  generatedFunctionsSha256,
  graphGuid,
  graphRegionSha256,
  graphSha256,
  materialSha256,
  passFile,
  passSha256,
  renderState,
  shader,
}) => Object.freeze({
  activePasses: ACTIVE_PASSES,
  disconnected: Object.freeze(disconnected),
  generatedForwardFullSourceSha256: fullSourceSha256,
  generatedForwardPass: passFile,
  generatedForwardPassSha256: passSha256,
  generatedFunctionsSha256,
  generatedGraphRegionSha256: graphRegionSha256,
  generatedSurface: 'Universal Lit / Specular workflow',
  renderState,
  shader,
  sourceEngine: 'ToonLab reference renderer',
  sourceGraphGuid: graphGuid,
  sourceGraphSha256: graphSha256,
  sourceMaterialSha256: materialSha256,
  vertex: 'identity Position/Normal/Tangent',
});

export const TOONLAB_SCENE_STYLIZED_WATER_GRAPH = freezeSource({
  shader: TOONLAB_SCENE_STYLIZED_WATER_SHADER,
  graphGuid: '70bb56f130f5b124bae9e94c46b39487',
  graphSha256: '630cb7d547eec84900a1f817eb6e7b7db6d6a89b2c336e615653067babdac204',
  materialSha256: 'bad86982d36fbb7aa05526b4456d38798fc6105297fbfea0e9308d09d9b543c9',
  fullSourceSha256: '3721900316a78746346ec0a5e326d8ed1fc58ab6a50eea1dafe1449300bc971c',
  passFile: 'passes/S_StylizedWater/sub-00-pass-00-ForwardLit.shader',
  passSha256: 'c9b168fdf41de3d7ad6979dd9db8d05509a4e34afd12bdd7ce01fd15507d6f57',
  graphRegionSha256: 'ef12040f0154aa4b63165a69a1a9c654721eb9f808684441ecec78c0a1e5c1dc',
  generatedFunctionsSha256: '2b7d59fec05e1000489c88ea76f18d3bf09826479bea6cf647fb7dae57ba0f48',
  renderState: transparentRenderState({
    alphaClip: false,
    cull: 'Back (render front faces)',
    queue: 3000,
    receiveShadows: false,
  }),
  disconnected: [
    '_Water_Emissive_Strength',
    'caustic distortion Texture2D slot has no material texture and samples ToonLab default white',
    'Scene Color / opaque texture / refraction',
    'vertex displacement',
    'ShadowCaster and DepthOnly passes',
  ],
});

export const TOONLAB_SCENE_WATER_WAVES_GRAPH = freezeSource({
  shader: TOONLAB_SCENE_WATER_WAVES_SHADER,
  graphGuid: '9761f6fbf7b2e5848b8603fa53e2a8d4',
  graphSha256: 'cc6d4231ac0b1247b6daf1012594df0d0eec4fa13888420d141f9bfe021e56cc',
  materialSha256: '57d368479a8665b4f6414876163308561fde4e8bdbc0957adf586441f74ab220',
  fullSourceSha256: 'f5770770d4fe2ccd09061ead380dd5b41e90c027631744c166ec51201cbb9c0a',
  passFile: 'passes/S_WaterWaves/sub-00-pass-00-ForwardLit.shader',
  passSha256: 'f7f42a1df0464d0ebff5080ca47c60f89972e734acca759f877d9d630aae1a49',
  graphRegionSha256: 'c7abd36b6370ae87f65be95c15272b282c7c73ff0f24ee2bf1996f92d1d731b6',
  generatedFunctionsSha256: 'b66a898be642ca70ea666d8be0ef6038a576bfdc78a3df47dd33cedd54db4fb0',
  renderState: transparentRenderState({
    alphaClip: 0.01,
    cull: 'Off (render both faces)',
    queue: 3001,
    receiveShadows: true,
  }),
  disconnected: [
    'Scene Depth and Scene Color',
    'vertex displacement',
    'ShadowCaster and DepthOnly passes',
  ],
});

export const TOONLAB_SCENE_WATERFALL_GRAPH = freezeSource({
  shader: TOONLAB_SCENE_WATERFALL_SHADER,
  graphGuid: '775909a9cf6cc5b41863ed5b1f2de0fd',
  graphSha256: 'bf9c719bd9f8d42d8d6a75230da32e938d939e074a26a733f53f1d686164a685',
  materialSha256: '8ffe0bc1db2786987e5bc9faa8f48feb8d7d73531def025c22b72dc5308492f9',
  fullSourceSha256: '235662ae27a262ee73f9ea18d1ef422e6c1198ef835e3537d4fc9dcc4b8a4636',
  passFile: 'passes/S_Waterfall/sub-00-pass-00-ForwardLit.shader',
  passSha256: '09b0afb023d069c35c4d2a4a754a63780336d8addbd13e73cb7b410a8c7ca6a2',
  graphRegionSha256: 'de9adf418fe28b31bed35a713626f8621bd62906d0a0dd3d4eb3f7727bf2d54b',
  generatedFunctionsSha256: 'a77eff4712ce7ac8ad507f5c04fd9de7f19533d6b41fa209b6f233e7d5d6af28',
  renderState: transparentRenderState({
    alphaClip: false,
    cull: 'Off (render both faces)',
    queue: 3002,
    receiveShadows: true,
  }),
  disconnected: [
    '_Specular',
    'Scene Depth and Scene Color',
    'vertex displacement (vertex COLOR.r affects fragment Alpha only)',
    'ShadowCaster and DepthOnly passes',
  ],
});

export const TOONLAB_STYLIZED_THRESHOLD_SOURCE = Object.freeze({
  graphSha256: '9980c99d11f72f9599eb8b89c1b45aa5d1b0c0551872afdfcc7a2f7515a2d00f',
  formula:
    'enabled ? (saturate(In).r >= Threshold ? saturate(remap(In,[Threshold,1],[GradientMin,1])) : 0) : In',
});

export const TOONLAB_SCENE_WATER_RENDERER_BOUNDARIES = Object.freeze({
  depthCopy:
    'S_StylizedWater actively copies the current Three framebuffer depth; unlike TOONLAB _CameraDepthTexture, a transparent surface that wrote depth earlier can be present in that copy.',
  fog:
    'Generated ForwardLit requests TOONLAB fog; ToonLab applies the shared ToonLab fog stage after scene compositing, so overlapping transparent layers do not have identical per-fragment fog/blend ordering.',
  nonForwardPasses:
    'Generated GBuffer, MotionVectors, DepthNormals, Meta, editor selection/picking, and Universal2D passes are audited but have no family-specific Three dispatch.',
  opaqueTexture: 'not required: no source Scene Color node or opaque-texture sample',
  refraction: 'not implemented because the supplied source graph has no refraction path',
  sorting:
    'ToonLab queues 3000/3001/3002 are retained as metadata; Three transparent sorting is object-depth based, and Waterfall/Waves are material groups on one mesh.',
});

const STYLIZED_WATER_TEXTURES = Object.freeze({
  causticA: '_SampleTexture2D_385d9436b29d451e821f4556a08954e1_Texture_1_Texture2D',
  causticB: '_SampleTexture2D_5327e910dba549538ac51ed149ead1cc_Texture_1_Texture2D',
  causticDistortion: '_SampleTexture2D_ca15378ba36941c6b0a4f9262f00b943_Texture_1_Texture2D',
  normal: '_Normal',
  reflection: '_SampleCubemap_85a6607ef6da46718303fd2c9b573a4b_Cube_1_Cubemap',
  shorelineMask: '_SampleTexture2D_28f766f5fef2475581b2759e77b1fd47_Texture_1_Texture2D',
  shorelineNoise: '_SampleTexture2D_ed127a5d1143482098a67f7c89dbe981_Texture_1_Texture2D',
});

const WATER_WAVES_TEXTURES = Object.freeze({
  mask: '_SampleTexture2D_265cfaf7b2d4441c8377787a97cd5246_Texture_1_Texture2D',
  roughA: '_SampleTexture2D_d64f7bc5147c423194792e76b69cf39d_Texture_1_Texture2D',
  roughB: '_SampleTexture2D_d58b35da80d94d59bbf4e99a4fe04dff_Texture_1_Texture2D',
  smooth: '_SampleTexture2D_b64e666e3eb44de9b026045710f2ded9_Texture_1_Texture2D',
});

const WATERFALL_TEXTURES = Object.freeze({
  detailRough: '_SampleTexture2D_645233efc7394ea0979d3e3c7beb3d1d_Texture_1_Texture2D',
  distortion: '_SampleTexture2D_237e64246889426ca324d0bfe0a3cfbc_Texture_1_Texture2D',
  edgeBase: '_SampleTexture2D_35c6753a984e411d8ff8c2ca44b82445_Texture_1_Texture2D',
  edgeEmission: '_SampleTexture2D_661373004c4647c4a1d10886dbe433b1_Texture_1_Texture2D',
  roughA: '_SampleTexture2D_2dce4595a0604448843afaf3078c9cf9_Texture_1_Texture2D',
  roughB: '_SampleTexture2D_be6cbed60853473fa43772a227c98bf7_Texture_1_Texture2D',
  waterlines: '_SampleTexture2D_98f66eb971fd4938a9f260fed69c8779_Texture_1_Texture2D',
});

const WATER_GRADIENT = Object.freeze([
  Object.freeze({ color: [0.04491666, 0.3109616, 0.539], alpha: 0.9803922, colorAt: 0.008819715, alphaAt: 0.02941939 }),
  Object.freeze({ color: [0.07156626, 0.3864579, 0.594], alpha: 0.9960784, colorAt: 0.320592, alphaAt: 0.1382315 }),
  Object.freeze({ color: [0.00392159, 0.772549, 0.3369935], alpha: 0.7215686, colorAt: 0.7911803, alphaAt: 0.5647059 }),
  Object.freeze({ color: [0.01960785, 0.5843138, 0.420484], alpha: 0.5333334, colorAt: 1, alphaAt: 1 }),
]);

function requiredProperty(properties, name, materialName) {
  const property = properties.get(name);
  if (!property) throw new Error(`${materialName} is missing required water property ${name}.`);
  return property;
}

function requiredScalar(properties, name, materialName) {
  requiredProperty(properties, name, materialName);
  const value = readToonLabScalar(properties, name, Number.NaN);
  if (!Number.isFinite(value)) throw new Error(`${materialName}.${name} is not finite.`);
  return value;
}

function requiredVector(properties, name, materialName) {
  const property = requiredProperty(properties, name, materialName);
  if (!Array.isArray(property.value) || property.value.length < 4) {
    throw new Error(`${materialName}.${name} is not a four-channel vector.`);
  }
  return readToonLabVector(properties, name, [0, 0, 0, 0]);
}

function requiredTextureIndex(properties, name, materialName) {
  requiredProperty(properties, name, materialName);
  const index = readToonLabTextureIndex(properties, name);
  if (index < 0) throw new Error(`${materialName}.${name} has no exported texture.`);
  return index;
}

function optionalTextureIndex(properties, name, materialName) {
  requiredProperty(properties, name, materialName);
  return readToonLabTextureIndex(properties, name);
}

function freezeValues(value) {
  for (const [key, entry] of Object.entries(value)) {
    if (Array.isArray(entry)) value[key] = Object.freeze(entry);
  }
  return Object.freeze(value);
}

export function resolveToonLabSceneStylizedWaterInputs(materialRecord) {
  if (materialRecord?.shaderName !== TOONLAB_SCENE_STYLIZED_WATER_SHADER) {
    throw new TypeError(`Expected ${TOONLAB_SCENE_STYLIZED_WATER_SHADER}.`);
  }
  const p = indexToonLabMaterialProperties(materialRecord);
  const name = materialRecord.name ?? 'M_StylizedWater';
  return freezeValues({
    materialIndex: materialRecord.index,
    materialName: name,
    renderQueue: materialRecord.renderQueue,
    waterColorMultiplier: requiredScalar(p, '_Water_Color_Multiplier', name),
    waterOpacityMultiplier: requiredScalar(p, '_Water_Opacity_Multiplier', name),
    waterSaturationMultiplier: requiredScalar(p, '_Water_Saturation_Multiplier', name),
    waterColorDepth: requiredScalar(p, '_Water_Color_Depth', name),
    waterColorFresnelMultiplier: requiredScalar(p, '_Water_Color_Fresnel_Multiplier', name),
    waterColorFalloff: requiredScalar(p, '_Water_Color_Falloff', name),
    shorelineFadeDepth: requiredScalar(p, '_Shoreline_Fade_Depth', name),
    smoothness: requiredScalar(p, '_Smoothness', name),
    smoothnessFresnel: requiredScalar(p, '_Smoothness_Fresnel', name),
    normalTextureIndex: requiredTextureIndex(p, STYLIZED_WATER_TEXTURES.normal, name),
    normalStrength: requiredScalar(p, '_Normal_Strength', name),
    waterScale: requiredScalar(p, '_Water_Scale', name),
    detailScale: requiredScalar(p, '_Water_Detail_Scale', name),
    detailNormalStrength: requiredScalar(p, '_Detail_Normal_Strength', name),
    detailNormalDistortion: requiredScalar(p, '_Detail_Normal_Distortion', name),
    specularColor: requiredVector(p, '_Specular_Color', name),
    specularColorFar: requiredVector(p, '_Specular_Color_Far', name),
    specularAdditionalFalloff: requiredScalar(p, '_Specular_Additional_Falloff', name),
    disconnectedWaterEmissiveStrength: requiredScalar(p, '_Water_Emissive_Strength', name),
    reflectionOffset: requiredScalar(p, '_Reflection_Offset', name),
    reflectionMultiplier: requiredScalar(p, '_Reflection_Multiplier', name),
    reflectionMaximum: requiredScalar(p, '_Reflection_Maximum', name),
    reflectionNormalInfluence: requiredScalar(p, '_Reflection_Normal_Influence', name),
    reflectionFresnel: requiredScalar(p, '_Reflection_Fresnel', name),
    reflectionDistanceMax: requiredScalar(p, '_Reflection_Distance_Max', name),
    reflectionDistanceMin: requiredScalar(p, '_Reflection_Distance_Min', name),
    causticsScale: requiredScalar(p, '_Caustics_Scale', name),
    causticStrength: requiredScalar(p, '_Caustic_Strength', name),
    causticsSpeed: requiredScalar(p, '_Caustics_Speed', name),
    causticsDepth: requiredScalar(p, '_Caustics_Depth', name),
    causticVisualOffset: requiredScalar(p, '_Caustic_Visual_Offset', name),
    causticDistortion: requiredScalar(p, '_Caustic_Distortion', name),
    shorelineFoamDistance: requiredScalar(p, '_Shoreline_Foam_Distance', name),
    shorelineFoamWaves: requiredScalar(p, '_Shoreline_Foam_Waves', name),
    shorelineFoamSpeed: requiredScalar(p, '_Shoreline_Foam_Speed', name),
    shorelineFoamColor: requiredVector(p, '_Shoreline_Foam_Color', name),
    shorelineFoamOpacity: requiredScalar(p, '_Shoreline_Foam_Opacity', name),
    shorelineFoamNoiseIntensity: requiredScalar(p, '_Shoreline_Foam_Noise_Intensity', name),
    shorelineFoamNoiseScale: requiredScalar(p, '_Shoreline_Foam_Noise_Scale', name),
    frameRate: requiredScalar(p, '_Frame_Rate', name),
    spriteCellResolution: requiredScalar(p, '_Sprite_Cell_Resolution', name),
    oversampling: requiredScalar(p, '_Oversampling', name),
    shorelineNoiseTextureIndex: requiredTextureIndex(p, STYLIZED_WATER_TEXTURES.shorelineNoise, name),
    shorelineMaskTextureIndex: requiredTextureIndex(p, STYLIZED_WATER_TEXTURES.shorelineMask, name),
    causticDistortionTextureIndex: optionalTextureIndex(p, STYLIZED_WATER_TEXTURES.causticDistortion, name),
    causticATextureIndex: requiredTextureIndex(p, STYLIZED_WATER_TEXTURES.causticA, name),
    causticBTextureIndex: requiredTextureIndex(p, STYLIZED_WATER_TEXTURES.causticB, name),
    reflectionTextureIndex: requiredTextureIndex(p, STYLIZED_WATER_TEXTURES.reflection, name),
  });
}

export function resolveToonLabSceneWaterWavesInputs(materialRecord) {
  if (materialRecord?.shaderName !== TOONLAB_SCENE_WATER_WAVES_SHADER) {
    throw new TypeError(`Expected ${TOONLAB_SCENE_WATER_WAVES_SHADER}.`);
  }
  const p = indexToonLabMaterialProperties(materialRecord);
  const name = materialRecord.name ?? 'M_WaterWaves';
  return freezeValues({
    materialIndex: materialRecord.index,
    materialName: name,
    renderQueue: materialRecord.renderQueue,
    foamColor: requiredVector(p, '_Foam_Color', name),
    emissive: requiredScalar(p, '_Emissive', name),
    smoothness: requiredScalar(p, '_Smoothness', name),
    opacity: requiredScalar(p, '_Opacity', name),
    thresholdRendering: requiredScalar(p, '_Threshold_Rendering', name),
    styleThreshold: requiredScalar(p, '_Style_Threshold', name),
    styleThresholdGradientMin: requiredScalar(p, '_Style_Threshold_Gradient_Min', name),
    noiseSize: requiredScalar(p, '_Noise_Size', name),
    causticsWarp: requiredScalar(p, '_Caustics_Warp', name),
    smoothTextureIndex: requiredTextureIndex(p, WATER_WAVES_TEXTURES.smooth, name),
    roughATextureIndex: requiredTextureIndex(p, WATER_WAVES_TEXTURES.roughA, name),
    roughBTextureIndex: requiredTextureIndex(p, WATER_WAVES_TEXTURES.roughB, name),
    maskTextureIndex: requiredTextureIndex(p, WATER_WAVES_TEXTURES.mask, name),
  });
}

export function resolveToonLabSceneWaterfallInputs(materialRecord) {
  if (materialRecord?.shaderName !== TOONLAB_SCENE_WATERFALL_SHADER) {
    throw new TypeError(`Expected ${TOONLAB_SCENE_WATERFALL_SHADER}.`);
  }
  const p = indexToonLabMaterialProperties(materialRecord);
  const name = materialRecord.name ?? 'M_Waterfall';
  return freezeValues({
    materialIndex: materialRecord.index,
    materialName: name,
    renderQueue: materialRecord.renderQueue,
    waterLineSize: requiredScalar(p, '_Water_Line_Size', name),
    smoothness: requiredScalar(p, '_Smoothness', name),
    disconnectedSpecular: requiredScalar(p, '_Specular', name),
    emissive: requiredScalar(p, '_Emissive', name),
    topColor: requiredVector(p, '_Top_Color', name),
    bottomColor: requiredVector(p, '_Bottom_Color', name),
    opacityTop: requiredScalar(p, '_Opacity_Top', name),
    opacityBottom: requiredScalar(p, '_Opacity_Bottom', name),
    foamColor: requiredVector(p, '_Foam_Color', name),
    thresholdRendering: requiredScalar(p, '_Threshold_Rendering', name),
    distortion: requiredScalar(p, '_Distortion', name),
    noiseOpacity: requiredScalar(p, '_Noise_Opacity', name),
    noiseSize: requiredScalar(p, '_Noise_Size', name),
    fallSpeed: requiredScalar(p, '_Fall_Speed', name),
    noiseThreshold: requiredScalar(p, '_Noise_Threshold', name),
    noiseThresholdGradientMin: requiredScalar(p, '_Noise_Threshold_Gradient_Min', name),
    detailNoiseOpacity: requiredScalar(p, '_Detail_Noise_Opacity', name),
    detailNoiseScale: requiredScalar(p, '_Detail_Noise_Scale', name),
    detailNoiseSpeed: requiredScalar(p, '_Detail_Noise_Speed', name),
    detailNoiseThreshold: requiredScalar(p, '_Detail_Noise_Threshold', name),
    detailNoiseThresholdGradientMin: requiredScalar(p, '_Detail_Noise_Threshold_Gradient_Min', name),
    distortionTextureIndex: requiredTextureIndex(p, WATERFALL_TEXTURES.distortion, name),
    waterlinesTextureIndex: requiredTextureIndex(p, WATERFALL_TEXTURES.waterlines, name),
    roughATextureIndex: requiredTextureIndex(p, WATERFALL_TEXTURES.roughA, name),
    roughBTextureIndex: requiredTextureIndex(p, WATERFALL_TEXTURES.roughB, name),
    detailRoughTextureIndex: requiredTextureIndex(p, WATERFALL_TEXTURES.detailRough, name),
    edgeBaseTextureIndex: requiredTextureIndex(p, WATERFALL_TEXTURES.edgeBase, name),
    edgeEmissionTextureIndex: requiredTextureIndex(p, WATERFALL_TEXTURES.edgeEmission, name),
  });
}

export function isToonLabSceneWaterFamilyRecord(materialRecord) {
  return materialRecord?.shaderName === TOONLAB_SCENE_STYLIZED_WATER_SHADER
    || materialRecord?.shaderName === TOONLAB_SCENE_WATER_WAVES_SHADER
    || materialRecord?.shaderName === TOONLAB_SCENE_WATERFALL_SHADER;
}

export function evaluateToonLabThreshold(value, {
  enabled = true,
  gradientMin = 0,
  threshold = 0.5,
} = {}) {
  const source = Number(value);
  if (!enabled) return source;
  const saturated = Math.min(1, Math.max(0, source));
  if (saturated < threshold) return 0;
  const remapped = gradientMin
    + ((source - threshold) * (1 - gradientMin)) / (1 - threshold);
  return Math.min(1, Math.max(0, remapped));
}

function thresholdNode(value, threshold, gradientMin, enabled) {
  if (!enabled) return float(value);
  const source = float(value);
  const remapped = source.sub(threshold)
    .mul((1 - gradientMin) / (1 - threshold))
    .add(gradientMin);
  return clamp(source, 0, 1)
    .greaterThanEqual(threshold)
    .select(clamp(remapped, 0, 1), float(0));
}

function interpolateCpu(a, b, amount) {
  return a + (b - a) * Math.min(1, Math.max(0, amount));
}

function sampleIndependentGradientCpu(value, channel, positionChannel) {
  let result = WATER_GRADIENT[0][channel];
  for (let index = 1; index < WATER_GRADIENT.length; index += 1) {
    const previous = WATER_GRADIENT[index - 1];
    const current = WATER_GRADIENT[index];
    result = interpolateCpu(
      result,
      current[channel],
      (value - previous[positionChannel])
        / (current[positionChannel] - previous[positionChannel]),
    );
  }
  return result;
}

export function sampleToonLabWaterGradientCpu(value) {
  return [
    ...[0, 1, 2].map((channelIndex) => {
      let result = WATER_GRADIENT[0].color[channelIndex];
      for (let index = 1; index < WATER_GRADIENT.length; index += 1) {
        const previous = WATER_GRADIENT[index - 1];
        const current = WATER_GRADIENT[index];
        result = interpolateCpu(
          result,
          current.color[channelIndex],
          (value - previous.colorAt) / (current.colorAt - previous.colorAt),
        );
      }
      return result;
    }),
    sampleIndependentGradientCpu(value, 'alpha', 'alphaAt'),
  ];
}

function sampleWaterGradientNode(value) {
  let color = vec3(...WATER_GRADIENT[0].color);
  let alpha = float(WATER_GRADIENT[0].alpha);
  for (let index = 1; index < WATER_GRADIENT.length; index += 1) {
    const previous = WATER_GRADIENT[index - 1];
    const current = WATER_GRADIENT[index];
    color = mix(
      color,
      vec3(...current.color),
      clamp(value.sub(previous.colorAt).div(current.colorAt - previous.colorAt), 0, 1),
    );
    alpha = mix(
      alpha,
      float(current.alpha),
      clamp(value.sub(previous.alphaAt).div(current.alphaAt - previous.alphaAt), 0, 1),
    );
  }
  return vec4(color, alpha);
}

export function evaluateToonLabWaterWavesCpu({
  mask = 1,
  roughA = 0,
  roughB = 0,
} = {}, values) {
  const foamColorLinear = linearizeToonLabColorProperty(values.foamColor);
  const threshold = evaluateToonLabThreshold((roughA + roughB) * mask, {
    enabled: values.thresholdRendering >= 0.5,
    gradientMin: values.styleThresholdGradientMin,
    threshold: values.styleThreshold,
  });
  return Object.freeze({
    alpha: threshold * values.opacity,
    emission: foamColorLinear.slice(0, 3).map((channel) => (
      channel * values.emissive * Math.min(1, Math.max(0, threshold))
    )),
    smoothness: values.smoothness * threshold * values.opacity,
    threshold,
  });
}

export function evaluateToonLabWaterfallCpu({
  detailRough = 0,
  edgeBase = 1,
  edgeEmission = 1,
  mainRoughA = 0,
  mainRoughB = 0,
  uvY = 0,
  vertexRed = 1,
  waterline = 0,
} = {}, values) {
  const topColorLinear = linearizeToonLabColorProperty(values.topColor);
  const bottomColorLinear = linearizeToonLabColorProperty(values.bottomColor);
  const foamColorLinear = linearizeToonLabColorProperty(values.foamColor);
  const main = evaluateToonLabThreshold(mainRoughA + mainRoughB, {
    enabled: values.thresholdRendering >= 0.5,
    gradientMin: values.noiseThresholdGradientMin,
    threshold: values.noiseThreshold,
  }) * values.noiseOpacity;
  const detail = evaluateToonLabThreshold(detailRough, {
    enabled: values.thresholdRendering >= 0.5,
    gradientMin: values.detailNoiseThresholdGradientMin,
    threshold: values.detailNoiseThreshold,
  }) * values.detailNoiseOpacity;
  const foamMask = (waterline + main + detail) * edgeBase;
  const gradient = topColorLinear.map((channel, index) => Math.min(1, Math.max(
    0,
    channel + (bottomColorLinear[index] - channel) * (1 - uvY),
  )));
  const baseColor = gradient.map((channel, index) => (
    channel + (foamColorLinear[index] - channel) * foamMask
  ));
  const baseOpacity = values.opacityTop
    + (values.opacityBottom - values.opacityTop) * (1 - uvY);
  return Object.freeze({
    alpha: (baseOpacity + (1 - baseOpacity) * foamMask) * vertexRed,
    baseColor: Object.freeze(baseColor.slice(0, 3)),
    detail,
    emission: Object.freeze(baseColor.slice(0, 3).map(
      (channel) => channel * edgeEmission * values.emissive,
    )),
    foamMask,
    main,
  });
}

export function evaluateToonLabWaterDepthCpu({
  distanceToCamera = 0,
  fresnel = 0,
  sceneEyeDepth = 0,
  surfaceEyeDepth = 0,
} = {}, values) {
  const depthDifference = sceneEyeDepth - surfaceEyeDepth;
  const depthDenominator = values.waterColorDepth
    + (values.waterColorDepth * values.waterColorFresnelMultiplier
      - values.waterColorDepth) * fresnel;
  const depth01 = Math.min(1, Math.max(0, depthDifference / depthDenominator));
  const distanceFade = Math.min(1, Math.max(0, (distanceToCamera - 200) / 800));
  const gradientTime = (1 - depth01 ** values.waterColorFalloff) * (1 - distanceFade);
  const gradient = sampleToonLabWaterGradientCpu(gradientTime);
  const shorelineFade = Math.min(1, Math.max(0, depthDifference / values.shorelineFadeDepth));
  return Object.freeze({
    depth01,
    depthDifference,
    gradient: Object.freeze(gradient),
    gradientTime,
    opacityBase: gradient[3] * values.waterOpacityMultiplier * shorelineFade,
    shorelineFade,
  });
}

export function evaluateToonLabWaterFlipbookCpu(baseUv, elapsed, values) {
  const grid = baseUv.map((channel) => channel * values.oversampling);
  const gutter = values.oversampling / values.spriteCellResolution;
  const within = grid.map((channel) => (
    ((channel - Math.floor(channel)) + gutter) * (1 - 2 * gutter) / 16
  ));
  const frame = elapsed * values.frameRate;
  const offset = [
    ((Math.floor(frame) / 16) % 1 + 1) % 1,
    ((-Math.floor(frame / 16) / 16) % 1 + 1) % 1,
  ];
  return Object.freeze({
    gradientUv: Object.freeze(grid.map((channel) => channel / 16)),
    sampleUv: Object.freeze(within.map((channel, index) => channel + offset[index])),
  });
}

function validateTextureRecord(manifest, index, materialName) {
  const record = manifest?.textures?.[index];
  if (!record?.exactSourceCopy || record?.importer?.present !== true) {
    throw new Error(`${materialName} texture ${index} lacks exact source/importer evidence.`);
  }
  return record;
}

async function loadTextures(manifest, values, names, options) {
  const entries = await Promise.all(Object.entries(names).map(async ([key, index]) => {
    validateTextureRecord(manifest, index, values.materialName);
    const loaded = await loadToonLabSceneTexture(manifest, index, options);
    if (!loaded) throw new Error(`${values.materialName} could not load texture ${index}.`);
    return [key, loaded];
  }));
  return Object.fromEntries(entries);
}

function toonLabPreserveSpecularTransparentState(material, graph, alphaNode) {
  material.transparent = true;
  material.depthTest = true;
  material.depthFunc = THREE.LessEqualDepth;
  material.depthWrite = false;
  material.premultipliedAlpha = false;
  material.blending = THREE.CustomBlending;
  material.blendEquation = THREE.AddEquation;
  material.blendSrc = THREE.OneFactor;
  material.blendDst = THREE.OneMinusSrcAlphaFactor;
  material.blendEquationAlpha = THREE.AddEquation;
  material.blendSrcAlpha = THREE.OneFactor;
  material.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
  material.side = graph.renderState.cull.startsWith('Off')
    ? THREE.DoubleSide
    : THREE.FrontSide;
  material.forceSinglePass = material.side === THREE.DoubleSide;
  material.opacityNode = alphaNode;
  material.userData.toonLabTransparency = {
    ...graph.renderState,
    rendererQueueGap: TOONLAB_SCENE_WATER_RENDERER_BOUNDARIES.sorting,
  };
}

function atlasNormalSample(normalMap, baseUv, elapsed, values, strength) {
  const grid = baseUv.mul(values.oversampling);
  const gutter = values.oversampling / values.spriteCellResolution;
  const withinCell = fract(grid).add(gutter).mul(1 - 2 * gutter).div(16);
  const frame = elapsed.mul(values.frameRate);
  const frameOffset = vec2(
    fract(floor(frame).div(16)),
    fract(floor(frame.div(16)).div(16).negate()),
  );
  const gradientUv = grid.div(16);
  const source = texture(normalMap)
    .sample(withinCell.add(frameOffset))
    .grad(gradientUv.dFdx(), gradientUv.dFdy());
  const decoded = decodeToonLabNormalNode(source, 1);
  return {
    decoded,
    strengthened: applyToonLabNormalStrengthNode(decoded, strength),
  };
}

function sourceWorldXZ(worldPositionNode) {
  // ToonLabSceneExport reflects geometry Z. Reconstruct ToonLab absolute-world XZ
  // before evaluating the graph's world-anchored texture coordinates.
  return vec2(worldPositionNode.x, worldPositionNode.z.negate());
}

async function buildStylizedWater(materialRecord, manifest, options) {
  const values = resolveToonLabSceneStylizedWaterInputs(materialRecord);
  const linearColors = Object.freeze({
    shorelineFoamColor: Object.freeze(
      linearizeToonLabColorProperty(values.shorelineFoamColor),
    ),
    specularColor: Object.freeze(
      linearizeToonLabColorProperty(values.specularColor),
    ),
    specularColorFar: Object.freeze(
      linearizeToonLabColorProperty(values.specularColorFar),
    ),
  });
  if (values.causticDistortionTextureIndex !== -1) {
    throw new Error(`${values.materialName} source default-white caustic slot unexpectedly has a texture.`);
  }
  const maps = await loadTextures(manifest, values, {
    causticA: values.causticATextureIndex,
    causticB: values.causticBTextureIndex,
    normal: values.normalTextureIndex,
    reflection: values.reflectionTextureIndex,
    shorelineMask: values.shorelineMaskTextureIndex,
    shorelineNoise: values.shorelineNoiseTextureIndex,
  }, options);
  const geometryHints = options.geometryHints ?? {};
  if (geometryHints.hasTangents !== true) {
    throw new Error(`${values.materialName} requires source TANGENT for its normal and caustic graph.`);
  }
  const elapsed = geometryHints.timeNode ?? options.state?.uniforms?.time ?? time;
  const fragmentWorld = geometryHints.positionWorldNode ?? positionWorld;
  const toonLabWorldXZ = sourceWorldXZ(fragmentWorld);
  const radialDistance = distance(cameraPosition, fragmentWorld);
  const viewDirectionWorld = normalize(cameraPosition.sub(fragmentWorld));
  const geometryFresnel = pow(
    float(1).sub(clamp(dot(normalize(normalWorldGeometry), viewDirectionWorld), 0, 1)),
    1,
  );

  const sceneEyeDepth = linearDepth(toonLabViewportDepthTexture(screenUV))
    .mul(cameraFar.sub(cameraNear))
    .add(cameraNear);
  const surfaceEyeDepth = positionView.z.negate();
  const depthDifference = sceneEyeDepth.sub(surfaceEyeDepth);
  const depthDenominator = mix(
    values.waterColorDepth,
    values.waterColorDepth * values.waterColorFresnelMultiplier,
    geometryFresnel,
  );
  const depth01 = clamp(depthDifference.div(depthDenominator), 0, 1);
  const distanceColorFade = clamp(radialDistance.sub(200).div(800), 0, 1);
  const gradientTime = float(1)
    .sub(pow(depth01, values.waterColorFalloff))
    .mul(float(1).sub(distanceColorFade));
  const waterGradient = sampleWaterGradientNode(gradientTime);
  const multipliedWater = waterGradient.rgb.mul(values.waterColorMultiplier);
  const luminance = dot(multipliedWater, vec3(0.2126729, 0.7151522, 0.072175));
  const waterColor = mix(
    vec3(luminance),
    multipliedWater,
    values.waterSaturationMultiplier,
  );

  const shorelineNoise = texture(maps.shorelineNoise)
    .sample(toonLabWorldXZ.div(values.shorelineFoamNoiseScale)).r;
  const noiseTerm = shorelineNoise.mul(-values.shorelineFoamNoiseIntensity);
  const shorelineDenominator = float(values.shorelineFoamDistance)
    .add(noiseTerm.mul(-0.04));
  const shoreline = float(1).sub(clamp(depthDifference.div(shorelineDenominator), 0, 1));
  const wavePhase = shoreline.mul(values.shorelineFoamWaves)
    .sub(elapsed.add(noiseTerm).mul(values.shorelineFoamSpeed));
  const wave = sin(wavePhase).mul(shoreline.greaterThan(0).select(1, 0));
  const shorelineMaskNoise = texture(maps.shorelineMask)
    .sample(toonLabWorldXZ.div(25)).r;
  const foamMask = wave.mul(shorelineMaskNoise).greaterThanEqual(0.1).select(1, 0);
  const foamColor = vec3(...linearColors.shorelineFoamColor.slice(0, 3));
  const baseColor = mix(waterColor, mix(waterColor, foamColor, foamMask), 0.75);

  const baseNormalSample = atlasNormalSample(
    maps.normal,
    toonLabWorldXZ.div(values.waterScale),
    elapsed,
    values,
    values.normalStrength,
  );
  const detailBaseUv = toonLabWorldXZ.div(values.detailScale)
    .add(baseNormalSample.decoded.xy.mul(values.detailNormalDistortion * 0.1));
  const detailNormalSample = atlasNormalSample(
    maps.normal,
    detailBaseUv,
    elapsed,
    values,
    values.detailNormalStrength,
  );
  const blendedNormalTs = normalize(vec3(
    baseNormalSample.strengthened.xy.add(detailNormalSample.strengthened.xy),
    baseNormalSample.strengthened.z.mul(detailNormalSample.strengthened.z),
  ));
  const shorelineFade = clamp(depthDifference.div(values.shorelineFadeDepth), 0, 1);
  const opacityBase = waterGradient.a
    .mul(values.waterOpacityMultiplier)
    .mul(shorelineFade);
  const finalNormalTs = applyToonLabNormalStrengthNode(
    blendedNormalTs,
    opacityBase,
  );
  const normalViewNode = normalize(TBNViewMatrix.mul(finalNormalTs));

  const tangentViewDirection = positionViewDirection.mul(TBNViewMatrix);
  const causticDistortion = float(values.causticDistortion); // default white sample * scalar
  const causticAuv = toonLabWorldXZ.div(values.causticsScale * 2)
    .add(elapsed.mul(values.causticsSpeed * 0.02))
    .add(tangentViewDirection.xy.mul(values.causticVisualOffset))
    .add(causticDistortion);
  const causticBuv = toonLabWorldXZ.div(values.causticsScale)
    .add(elapsed.mul(values.causticsSpeed * -0.5 * 0.02))
    .add(tangentViewDirection.xy.mul(values.causticVisualOffset))
    .add(causticDistortion);
  const caustics = texture(maps.causticA).sample(causticAuv)
    .mul(texture(maps.causticB).sample(causticBuv))
    .mul(values.causticStrength)
    .mul(float(1).sub(clamp(depthDifference.div(values.causticsDepth), 0, 1)))
    .mul(shorelineFade);

  const reflectionNormalTs = applyToonLabNormalStrengthNode(
    finalNormalTs,
    values.reflectionNormalInfluence,
  );
  const sourceViewDirection = vec3(
    viewDirectionWorld.x,
    viewDirectionWorld.y,
    viewDirectionWorld.z.negate(),
  );
  const reflectedToonLab = sourceViewDirection.reflect(reflectionNormalTs);
  const reflectedRuntime = vec3(
    reflectedToonLab.x,
    reflectedToonLab.y,
    reflectedToonLab.z.negate(),
  );
  const reflectionSample = new CubeMapNode(texture(maps.reflection)).context({
    forceUVContext: true,
    getTextureLevel: () => float(0),
    getUV: () => reflectedRuntime,
  });
  const reflectionFresnel = pow(
    float(1).sub(clamp(dot(normalize(normalWorldGeometry), viewDirectionWorld), 0, 1)),
    values.reflectionFresnel,
  );
  const reflection = clamp(
    reflectionSample.r.add(values.reflectionOffset)
      .mul(values.reflectionMultiplier)
      .mul(reflectionFresnel),
    0,
    values.reflectionMaximum,
  ).mul(clamp(
    float(1).sub(
      radialDistance.sub(values.reflectionDistanceMin)
        .div(values.reflectionDistanceMax - values.reflectionDistanceMin),
    ),
    0,
    1,
  ));
  const emission = caustics.rgb.add(reflection);
  const specular = mix(
    vec3(...linearColors.specularColorFar.slice(0, 3)),
    vec3(...linearColors.specularColor.slice(0, 3)),
    pow(shorelineFade, values.specularAdditionalFalloff),
  );
  const smoothness = mix(values.smoothnessFresnel, values.smoothness, shorelineFade);
  const shorelineFoamOpacity = foamMask.mul(values.shorelineFoamOpacity);
  const alphaNear = mix(opacityBase, float(1), shorelineFoamOpacity);
  const alpha = mix(alphaNear, float(1), clamp(radialDistance.sub(150).div(150), 0, 1));

  const material = new MeshPhysicalNodeMaterial();
  material.name = `ToonLab:${values.materialName}`;
  material.colorNode = baseColor;
  material.emissiveNode = emission;
  material.metalnessNode = float(0);
  material.roughnessNode = clamp(float(1).sub(smoothness), 0, 1);
  material.specularColorNode = specular;
  material.specularIntensityNode = float(1);
  material.normalNode = normalViewNode;
  material.receivedShadowNode = Fn(() => float(1));
  toonLabPreserveSpecularTransparentState(
    material,
    TOONLAB_SCENE_STYLIZED_WATER_GRAPH,
    alpha,
  );
  installToonLabSurfaceLighting(material, {
    diffuseAlphaNode: alpha,
    workflow: 'specular',
  });
  material.userData.toonLabMaterial = {
    exactInputs: true,
    graphExact: true,
    linearColorProperties: linearColors,
    materialIndex: values.materialIndex,
    normalIntegration: createToonLabNormalIntegrationMetadata({
      coordinateZSign: -1,
      decode: 'RG UnpackNormal + ToonLab graph NormalStrength + NormalBlend',
      family: 'S_StylizedWater',
      flipGreenChannel: false,
      textureFlipY: true,
    }),
    opaqueTextureRequired: false,
    passCoupling: { depthOnly: false, shadowCaster: false },
    rendererBoundaries: TOONLAB_SCENE_WATER_RENDERER_BOUNDARIES,
    reflectionBridge: 'source equirectangular EXR -> generated cubemap, explicit LOD 0',
    sceneDepth: 'active viewportDepthTexture Linear01/eye-depth bridge',
    sourceGraph: TOONLAB_SCENE_STYLIZED_WATER_GRAPH,
    sourceMaterial: values.materialName,
    sourceShader: materialRecord.shaderName,
    vertexDeformation: false,
  };
  return material;
}

async function buildWaterWaves(materialRecord, manifest, options) {
  const values = resolveToonLabSceneWaterWavesInputs(materialRecord);
  const foamColorLinear = Object.freeze(
    linearizeToonLabColorProperty(values.foamColor),
  );
  const maps = await loadTextures(manifest, values, {
    mask: values.maskTextureIndex,
    roughA: values.roughATextureIndex,
    roughB: values.roughBTextureIndex,
    smooth: values.smoothTextureIndex,
  }, options);
  const geometryHints = options.geometryHints ?? {};
  const elapsed = geometryHints.timeNode ?? options.state?.uniforms?.time ?? time;
  const surfaceUv = geometryHints.uvNode ?? uv();
  const mainUv = surfaceUv.mul(values.noiseSize).add(vec2(0, elapsed.mul(0.4)));
  const warp = texture(maps.smooth)
    .sample(surfaceUv.add(vec2(elapsed.mul(0.05), elapsed.mul(0.1))))
    .r.mul(values.causticsWarp);
  const warpedUv = mainUv.add(warp);
  const noise = texture(maps.roughA).sample(warpedUv).r
    .add(texture(maps.roughB).sample(warpedUv).r)
    .mul(texture(maps.mask).sample(surfaceUv).r);
  const threshold = thresholdNode(
    noise,
    values.styleThreshold,
    values.styleThresholdGradientMin,
    values.thresholdRendering >= 0.5,
  );
  const alpha = threshold.mul(values.opacity);
  const foamColor = vec3(...foamColorLinear.slice(0, 3));

  const material = new MeshPhysicalNodeMaterial();
  material.name = `ToonLab:${values.materialName}`;
  material.colorNode = foamColor;
  material.emissiveNode = foamColor
    .mul(values.emissive)
    .mul(clamp(threshold, 0, 1));
  material.metalnessNode = float(0);
  material.roughnessNode = clamp(
    float(1).sub(float(values.smoothness).mul(alpha)),
    0,
    1,
  );
  material.specularColorNode = vec3(0);
  material.specularIntensityNode = float(1);
  // The generated Cull Off pass does not define VARYINGS_NEED_CULLFACE, so
  // ToonLab feeds the original geometric normal to both faces. Override Three's
  // DoubleSide face-direction flip to preserve that generated contract.
  material.normalNode = normalViewGeometry;
  material.maskNode = alpha.greaterThanEqual(0.01);
  toonLabPreserveSpecularTransparentState(
    material,
    TOONLAB_SCENE_WATER_WAVES_GRAPH,
    alpha,
  );
  installToonLabSurfaceLighting(material, {
    diffuseAlphaNode: alpha,
    workflow: 'specular',
  });
  material.userData.toonLabMaterial = {
    alphaClipThreshold: 0.01,
    exactInputs: true,
    graphExact: true,
    linearColorProperties: Object.freeze({ foamColor: foamColorLinear }),
    materialIndex: values.materialIndex,
    normalIntegration: 'generated Cull Off pass keeps back-face normals unflipped',
    opaqueTextureRequired: false,
    passCoupling: { depthOnly: false, shadowCaster: false },
    rendererBoundaries: TOONLAB_SCENE_WATER_RENDERER_BOUNDARIES,
    sceneDepth: false,
    sourceGraph: TOONLAB_SCENE_WATER_WAVES_GRAPH,
    sourceMaterial: values.materialName,
    sourceShader: materialRecord.shaderName,
    vertexDeformation: false,
  };
  return material;
}

function rendererBoundsSize(geometryHints, materialName) {
  const source = geometryHints?.rendererBoundsSize;
  if ((!Array.isArray(source) && !ArrayBuffer.isView(source)) || source.length < 3) {
    throw new Error(`${materialName} requires exported Renderer.boundsSize.`);
  }
  const result = Array.from(source).slice(0, 3).map(Number);
  if (!result.every(Number.isFinite)) {
    throw new Error(`${materialName} Renderer.boundsSize is not finite.`);
  }
  return result;
}

async function buildWaterfall(materialRecord, manifest, options) {
  const values = resolveToonLabSceneWaterfallInputs(materialRecord);
  const linearColors = Object.freeze({
    bottomColor: Object.freeze(
      linearizeToonLabColorProperty(values.bottomColor),
    ),
    foamColor: Object.freeze(
      linearizeToonLabColorProperty(values.foamColor),
    ),
    topColor: Object.freeze(
      linearizeToonLabColorProperty(values.topColor),
    ),
  });
  const maps = await loadTextures(manifest, values, {
    detailRough: values.detailRoughTextureIndex,
    distortion: values.distortionTextureIndex,
    edgeBase: values.edgeBaseTextureIndex,
    edgeEmission: values.edgeEmissionTextureIndex,
    roughA: values.roughATextureIndex,
    roughB: values.roughBTextureIndex,
    waterlines: values.waterlinesTextureIndex,
  }, options);
  const geometryHints = options.geometryHints ?? {};
  if (geometryHints.hasVertexColors !== true && !geometryHints.vertexColorNode) {
    throw new Error(`${values.materialName} requires source COLOR_0 for fragment Alpha.`);
  }
  const bounds = rendererBoundsSize(geometryHints, values.materialName);
  const elapsed = geometryHints.timeNode ?? options.state?.uniforms?.time ?? time;
  const surfaceUv = geometryHints.uvNode ?? uv();
  const scaledUv = surfaceUv.mul(vec2(
    Math.max(bounds[0], bounds[2]) / 14,
    (bounds[1] + 3) / 20,
  ));
  const distortion = texture(maps.distortion)
    .sample(scaledUv.add(vec2(elapsed.mul(0.05), elapsed.mul(-0.1))))
    .r.mul(values.distortion);
  const waterlineUv = scaledUv.mul(vec2(1, -0.4))
    .add(vec2(0, elapsed.mul(-0.2)))
    .add(distortion)
    .div(values.waterLineSize);
  const waterline = texture(maps.waterlines).sample(waterlineUv).r;
  const mainOffset = vec2(0, elapsed.mul(values.fallSpeed));
  const roughA = texture(maps.roughA).sample(
    scaledUv.mul(vec2(1.5, 0.5)).div(values.noiseSize)
      .add(mainOffset).add(distortion),
  ).r;
  const roughB = texture(maps.roughB).sample(
    scaledUv.mul(vec2(1, 0.3)).div(values.noiseSize)
      .add(mainOffset).add(distortion),
  ).r;
  const mainNoise = thresholdNode(
    roughA.add(roughB),
    values.noiseThreshold,
    values.noiseThresholdGradientMin,
    values.thresholdRendering >= 0.5,
  ).mul(values.noiseOpacity);
  const detailUv = scaledUv.mul(vec2(2, 1.6))
    .div(values.noiseSize)
    .div(values.detailNoiseScale)
    .add(vec2(0, elapsed.mul(values.fallSpeed * values.detailNoiseSpeed)))
    .add(distortion);
  const detailNoise = thresholdNode(
    texture(maps.detailRough).sample(detailUv).r,
    values.detailNoiseThreshold,
    values.detailNoiseThresholdGradientMin,
    values.thresholdRendering >= 0.5,
  ).mul(values.detailNoiseOpacity);
  const foamMask = waterline.add(mainNoise).add(detailNoise)
    .mul(texture(maps.edgeBase).sample(surfaceUv).r);
  const vertical = float(1).sub(surfaceUv.y);
  const gradient = clamp(mix(
    vec4(...linearColors.topColor),
    vec4(...linearColors.bottomColor),
    vertical,
  ), 0, 1);
  const base = mix(gradient, vec4(...linearColors.foamColor), foamMask);
  const emission = base.rgb
    .mul(texture(maps.edgeEmission).sample(surfaceUv).r)
    .mul(values.emissive);
  const opacityBase = mix(values.opacityTop, values.opacityBottom, vertical);
  const sourceVertexColor = geometryHints.vertexColorNode
    ? vec4(geometryHints.vertexColorNode)
    : vertexColor();
  const alpha = mix(opacityBase, float(1), foamMask).mul(sourceVertexColor.r);

  const material = new MeshPhysicalNodeMaterial();
  material.name = `ToonLab:${values.materialName}`;
  material.colorNode = base.rgb;
  material.emissiveNode = emission;
  material.metalnessNode = float(0);
  material.roughnessNode = clamp(float(1).sub(values.smoothness), 0, 1);
  material.specularColorNode = vec3(0);
  material.specularIntensityNode = float(1);
  // See S_WaterWaves above: this generated Cull Off pass likewise omits the
  // cull-face varying and therefore does not flip the geometric normal.
  material.normalNode = normalViewGeometry;
  toonLabPreserveSpecularTransparentState(
    material,
    TOONLAB_SCENE_WATERFALL_GRAPH,
    alpha,
  );
  installToonLabSurfaceLighting(material, {
    diffuseAlphaNode: alpha,
    workflow: 'specular',
  });
  material.userData.toonLabMaterial = {
    exactInputs: true,
    graphExact: true,
    linearColorProperties: linearColors,
    materialIndex: values.materialIndex,
    normalIntegration: 'generated Cull Off pass keeps back-face normals unflipped',
    opaqueTextureRequired: false,
    passCoupling: { depthOnly: false, shadowCaster: false },
    rendererBoundaries: TOONLAB_SCENE_WATER_RENDERER_BOUNDARIES,
    rendererBoundsSize: bounds,
    sceneDepth: false,
    sourceGraph: TOONLAB_SCENE_WATERFALL_GRAPH,
    sourceMaterial: values.materialName,
    sourceShader: materialRecord.shaderName,
    vertexColor: 'COLOR_0.r -> fragment Alpha only',
    vertexDeformation: false,
  };
  return material;
}

export async function buildToonLabSceneWaterFamilyMaterial(
  materialRecord,
  manifest,
  {
    baseUrl = DEFAULT_TOONLAB_SCENE_WATER_BASE_URL,
    geometryHints = null,
    state = null,
    textureLoader = null,
  } = {},
) {
  const options = {
    baseUrl,
    geometryHints: geometryHints ?? {},
    state,
    ...(textureLoader ? { textureLoader } : {}),
  };
  if (materialRecord?.shaderName === TOONLAB_SCENE_STYLIZED_WATER_SHADER) {
    return buildStylizedWater(materialRecord, manifest, options);
  }
  if (materialRecord?.shaderName === TOONLAB_SCENE_WATER_WAVES_SHADER) {
    return buildWaterWaves(materialRecord, manifest, options);
  }
  if (materialRecord?.shaderName === TOONLAB_SCENE_WATERFALL_SHADER) {
    return buildWaterfall(materialRecord, manifest, options);
  }
  throw new TypeError(`Unsupported ToonLab water shader ${materialRecord?.shaderName ?? 'unknown'}.`);
}

export function createToonLabSceneWaterPassReport(manifest) {
  return Object.freeze([
    TOONLAB_SCENE_STYLIZED_WATER_SHADER,
    TOONLAB_SCENE_WATER_WAVES_SHADER,
    TOONLAB_SCENE_WATERFALL_SHADER,
  ].map((shader) => {
    const material = manifest?.materials?.find((entry) => entry.shaderName === shader);
    const graph = shader === TOONLAB_SCENE_STYLIZED_WATER_SHADER
      ? TOONLAB_SCENE_STYLIZED_WATER_GRAPH
      : shader === TOONLAB_SCENE_WATER_WAVES_SHADER
        ? TOONLAB_SCENE_WATER_WAVES_GRAPH
        : TOONLAB_SCENE_WATERFALL_GRAPH;
    return Object.freeze({
      activePasses: graph.activePasses,
      alphaClip: graph.renderState.alphaClip,
      depthOnly: false,
      forward: true,
      materialIndex: material?.index ?? null,
      renderQueue: material?.renderQueue ?? graph.renderState.renderQueue,
      sceneColor: false,
      sceneDepth: shader === TOONLAB_SCENE_STYLIZED_WATER_SHADER,
      shadowCaster: false,
      shader,
      vertexDeformation: false,
    });
  }));
}
