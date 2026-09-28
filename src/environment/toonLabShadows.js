// Source-derived shadow contract for the supplied ToonLab scene.
//
// The serialized light happens to contain bias values of .92/.8, but its
// ToonLabLightData enables `m_UsePipelineSettings`. ToonLab renderer
// therefore selects PC_RPAsset's .1/.5 values at runtime. Both records remain
// visible below so a serialized inspector value cannot be mistaken for the
// value consumed by ShadowUtils.GetShadowBias().

import * as THREE from 'three';
import { NodeMaterial, QuadMesh, ShadowNode } from 'three/webgpu';
import { CSMShadowNode } from 'three/examples/jsm/csm/CSMShadowNode.js';
import {
  Fn,
  cameraPosition,
  cameraProjectionMatrix,
  dot,
  float,
  floor,
  ivec2,
  getShadowMaterial,
  max,
  min,
  mix,
  modelWorldMatrix,
  modelWorldMatrixInverse,
  normalWorldGeometry,
  positionLocal,
  positionWorld,
  reference,
  renderGroup,
  texture,
  textureLoad,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';

const freezeArray = (values) => Object.freeze([...values]);

export const TOONLAB_SHADOW_SOURCE = Object.freeze({
  corePackage: '@call-me-sensei/toonlab/environment',
  graphicsSettings: 'ToonLab/Settings/Graphics.toonlab-data',
  graphicsSettingsSha256: '6736f33dc62c35b0e7a88e275242080bc7a1d94c91154d18fceb332b661a6bce',
  pipelineAsset: 'ToonLab/Settings/RenderPipeline.toonlab-data',
  pipelineAssetGuid: '4b83569d67af61e458304325a23e5dfd',
  pipelineAssetSha256: '4d93ab2502566226745655f20650650e878d5a6e9e004b2079c89f0314c5331a',
  qualitySettings: 'ToonLab/Settings/Quality.toonlab-data',
  qualitySettingsSha256: '6814d6cc3eb850dd7d2a069a8b17ba9f7591deba8b1758a855978bd9c8627643',
  scene: 'Assets/ToonLab/Demo/EnvironmentReferenceScene.toonlab',
  sceneSha256: 'a024b1a62a99f054dbd3a700c5d1707e4b90498f37d64a375f8c39f222bce58b',
  skyPrefab: 'ToonLab/Environment/Sky/P_Sky.toonlab-object',
  skyPrefabGuid: '2af931b84714f9a468a5f2be79304847',
  skyPrefabSha256: '3ba73b83ef3045f9e0259c16163d09517182f1a8b341474c3a0328a1852ae4e8',
  shadowSamplingTent: 'src/environment/toonLabShadows.js',
  shadowSamplingTentSha256: '77e2d61fdcfa891d5164653d6e0b3fd0666987189aa9d67a826209c457144a9b',
  shadowCulling: 'src/environment/toonLabShadows.js',
  shadowCullingSha256: 'c1571cc3a6639b85c48754e146a7226294a12f1aa692a74d201e8a046426466d',
  shadowUtils: 'src/environment/toonLabShadows.js',
  shadowUtilsSha256: '04c4cbda8bd90c2aec2b2ea10744ad46006cc543f47448c57071506a987279a8',
  shadowsHlsl: 'src/environment/toonLabShadows.js',
  shadowsHlslSha256: '41dbe5965ef3f3cd6e7fc8f6625081bdde9b3752571b9fd2b7a8eca70abba4b0',
  mainLightShadowCasterPass: 'src/environment/toonLabShadows.js',
  mainLightShadowCasterPassSha256: 'ea83e045af7468e886352b2b4969f4056a61ecf8138aa35210169ef7d639e258',
  universalRenderer: 'src/environment/toonLabStage.js',
  universalRendererSha256: '8f550496cc62b94be3a8732c553af7ca19e2d77000e52253b153942dba417807',
  universalPipeline: 'src/environment/toonLabStage.js',
  universalPipelineSha256: 'a8fba27596291c7f26044c681fd643b698c6963ab5f638133061e88b9b2d108d',
  pipelinePackage: '@call-me-sensei/toonlab/environment',
});

export const TOONLAB_SHADOW_CONTRACT = Object.freeze({
  atlasResolution: 2048,
  atlasGrid: freezeArray([2, 2]),
  cascadeBorder: 0.107758604,
  cascadeBlendCullingFactor: 1,
  cascadeCount: 4,
  cascadeSplits: freezeArray([0.12299999, 0.2926, 0.53599995, 1]),
  cascadeTileResolution: 1024,
  conservativeEnclosingSphere: true,
  distance: 50,
  depthBufferBits: 16,
  enclosingSphereIterations: 64,
  effectiveBias: Object.freeze({
    depth: 0.1,
    normal: 0.5,
    reason: 'P_Sky ToonLabLightData.m_UsePipelineSettings == 1',
    source: 'PC_RPAsset.m_ShadowDepthBias / m_ShadowNormalBias',
  }),
  filter: Object.freeze({
    comparisonSamples: 16,
    kernelRadius: 3.5,
    name: 'SampleShadow_ComputeSamples_Tent_Filter_7x7',
    quality: 3,
    qualityName: 'High',
    tentWidth: 7,
    weightNormalizationLiteral: 0.081632,
  }),
  projectionGuardTexels: 10,
  rasterDepthBias: Object.freeze({
    constant: 1,
    slopeScale: 2.5,
    source: 'ShadowUtils.RenderShadowSlice SetGlobalDepthBias(1.0f, 2.5f)',
  }),
  serializedLightBias: Object.freeze({
    bypassedAtRuntime: true,
    depth: 0.92,
    normal: 0.8,
    source: 'P_Sky.prefab Light.m_Shadows',
  }),
  shadowStrength: 1,
});

// Native values captured by scripts/toonlab/ToonLabShadowCascadeOracle.cs from
// ToonLab's
// CullingResults.ComputeDirectionalShadowMatricesAndCullingPrimitives().
// ToonLab's public C# package delegates sphere fitting, projection padding,
// stabilization and caster planes to this native function, so the capture is
// the numerical authority for the supplied 1920x1080 reference camera.
export const TOONLAB_SHADOW_NATIVE_ORACLE = Object.freeze({
  capture: 'docs/source-shader-audits/toonlab-shadow-cascade-oracle.json',
  captureRawSha256: 'eca8d06093d8b9ecc3145aaa2201e2151c8393c3d45e122d5e57e3b92f4f605d',
  camera: Object.freeze({
    aspect: 1920 / 1080,
    far: 500000,
    fieldOfView: 60,
    near: 1,
    positionThree: freezeArray([268.2099914550781, 10.350000381469727, 14.960000038146973]),
    quaternionThree: freezeArray([0, -0.6636017560958862, 0, -0.7480860352516174]),
  }),
  cascadeViewDepths: Object.freeze([
    freezeArray([1, 6.948038419365048]),
    freezeArray([6.948038419365048, 15.149516371649725]),
    freezeArray([15.149516371649725, 26.91981249602418]),
    freezeArray([26.91981249602418, 49.357854134148965]),
  ]),
  cascadeViewSpheres: Object.freeze([
    Object.freeze({ center: freezeArray([0.004636563039639441, -0.010127067565917969, -6.9478860141298355]), radius: 8.191258430480957 }),
    Object.freeze({ center: freezeArray([0.01011527613184171, -0.022083282470703125, -15.149320368929011]), radius: 17.86028289794922 }),
    Object.freeze({ center: freezeArray([0.017971920648278683, -0.03923988342285156, -26.919540656103436]), radius: 31.736705780029297 }),
    Object.freeze({ center: freezeArray([0.03295212971943329, -0.07195377349853516, -49.35735819734782]), radius: 58.189701080322266 }),
  ]),
  // Captured directly from SplitData.GetCullingPlane() and reflected from
  // ToonLab's left-handed +Z basis into the exported Three -Z basis. Plane
  // interiors satisfy dot(normal, worldPosition) + distance >= 0.
  cascadeCullingPlanesThree: Object.freeze([
    Object.freeze([
      freezeArray([-0.4964312016963959, 0.8660253882408142, -0.059632718563079834, 125.07655334472656]),
      freezeArray([0.9928624033927917, 0, 0.11926543712615967, -252.94070434570312]),
      freezeArray([-0.7640907168388367, 0.6385480165481567, -0.09176993370056152, 199.2997283935547]),
      freezeArray([0.4552342891693115, 0, 0.8903716802597046, -114.0751724243164]),
      freezeArray([0.7640929222106934, -0.6385433673858643, 0.09178435057401657, -182.46942138671875]),
      freezeArray([-0.4552342891693115, 0, -0.8903716802597046, 139.86094665527344]),
      freezeArray([-0.6938663721084595, 0.6981418132781982, 0.17648668587207794, 176.23585510253906]),
      freezeArray([-0.6895548105239868, 0.3176736533641815, -0.6508439183235168, 191.3941650390625]),
    ]),
    Object.freeze([
      freezeArray([-0.4964312016963959, 0.8660253882408142, -0.059632718563079834, 125.07655334472656]),
      freezeArray([0.9928624033927917, 0, 0.11926543712615967, -235.07022094726562]),
      freezeArray([-0.7640932202339172, 0.6385428309440613, -0.09178614616394043, 201.7170867919922]),
      freezeArray([0.45523425936698914, 0, 0.8903716802597046, -88.88130950927734]),
      freezeArray([0.7640931010246277, -0.6385430693626404, 0.09178522974252701, -162.12844848632812]),
      freezeArray([-0.45523425936698914, 0, -0.8903716802597046, 145.10507202148438]),
      freezeArray([-0.6938662528991699, 0.6981418132781982, 0.17648683488368988, 176.23582458496094]),
      freezeArray([-0.6895545125007629, 0.3176731467247009, -0.650844395160675, 191.3941192626953]),
    ]),
    Object.freeze([
      freezeArray([-0.4964312016963959, 0.8660253882408142, -0.059632718563079834, 125.07655334472656]),
      freezeArray([0.9928624033927917, 0, 0.11926543712615967, -218.079833984375]),
      freezeArray([-0.7640930414199829, 0.6385431289672852, -0.09178510308265686, 205.048828125]),
      freezeArray([0.4552343189716339, 0, 0.8903716802597046, -64.92819213867188]),
      freezeArray([0.7640930414199829, -0.6385432481765747, 0.09178481996059418, -142.78912353515625]),
      freezeArray([-0.4552343189716339, 0, -0.8903716802597046, 150.09095764160156]),
      freezeArray([-0.6938661932945251, 0.6981418132781982, 0.1764870136976242, 176.23580932617188]),
      freezeArray([-0.689554750919342, 0.3176736831665039, -0.6508437395095825, 191.39414978027344]),
    ]),
    Object.freeze([
      freezeArray([-0.4964312016963959, 0.8660253882408142, -0.059632718563079834, 125.07655334472656]),
      freezeArray([0.9928624033927917, 0, 0.11926543712615967, -218.079833984375]),
      freezeArray([-0.7640930414199829, 0.6385430097579956, -0.0917852595448494, 209.83050537109375]),
      freezeArray([0.4552343189716339, 0, 0.8903716802597046, -64.92819213867188]),
      freezeArray([0.7640930414199829, -0.6385432481765747, 0.09178481996059418, -142.78912353515625]),
      freezeArray([-0.4552343189716339, 0, -0.8903716802597046, 150.09095764160156]),
      freezeArray([-0.6938661932945251, 0.6981418132781982, 0.17648710310459137, 176.23580932617188]),
      freezeArray([-0.6895546317100525, 0.3176734745502472, -0.6508439779281616, 191.39414978027344]),
    ]),
  ]),
  effectiveShadowFar: 49.357854134148965,
  lightRayDirectionThree: freezeArray([
    -0.6295879483222961,
    -0.7071068286895752,
    0.3218992352485657,
  ]),
  projection: Object.freeze([
    Object.freeze({ depthFromNear: 9.848723088856108, far: 18.839893781200498, halfExtent: 8.271250840496439, near: -0.18087409716429548, sphereViewXY: freezeArray([-0.004103354624135136, -0.04600285215133226]) }),
    Object.freeze({ depthFromNear: 20.41567465542528, far: 41.07865134808603, halfExtent: 18.034700118990457, near: 0.7860286523162436, sphereViewXY: freezeArray([-0.041812006237023525, -0.05905586844255595]) }),
    Object.freeze({ depthFromNear: 35.831754387890335, far: 72.99442426161173, halfExtent: 32.046633870560875, near: 2.173667339427759, sphereViewXY: freezeArray([-0.014951554434148306, -0.013563432691626076]) }),
    Object.freeze({ depthFromNear: 64.79123441237698, far: 133.83630407902757, halfExtent: 58.75796208598236, near: 4.818966600205954, sphereViewXY: freezeArray([-0.07974511761490533, -0.10367656793346214]) }),
  ]),
  toonLabVersion: 1,
});

// The generated-shader capture contains every ToonLab graph pass.
// TOONLAB selects subshader 0; fallback Built-In subshaders do not participate in
// this scene. Renderer.shadowCastingMode alone is therefore insufficient:
// transparent water renderers are set to On but their active shader has no
// ShadowCaster pass and must not enter Three's shadow render.
export const TOONLAB_SHADOW_CASTER_PASS_CONTRACT = Object.freeze({
  activeSubshader: 0,
  generatedShaderManifest:
    'assets-local/reference-environment/generated-shaders/manifest.json',
  generatedShaderManifestSha256:
    '85aa10383cce4604af5cb232813031b9653111366815f4cb95787906ad2a9ca9',
  shaderHasShadowCasterPass: Object.freeze({
    'ToonLab Graphs/S_DemoGrid': true,
    'ToonLab Graphs/S_FoliageShader': true,
    'ToonLab Graphs/S_Rainbow': false,
    'ToonLab Graphs/S_Snow': true,
    'ToonLab Graphs/S_Mountain': true,
    'ToonLab Graphs/S_Rock': true,
    'ToonLab Graphs/S_StylizedClouds': false,
    'ToonLab Graphs/S_StylizedSky': false,
    'ToonLab Graphs/S_Bark': true,
    'ToonLab Graphs/S_Leaves': true,
    'ToonLab Graphs/S_Sandfall': false,
    'ToonLab Graphs/S_StylizedWater': false,
    'ToonLab Graphs/S_WaterWaves': false,
    'ToonLab Graphs/S_Waterfall': false,
    'ToonLab Graphs/S_StylizedBasic': true,
    'ToonLab Surface/Lit': true,
    'ToonLab Terrain/Lit': true,
  }),
});

/** Return true/false for audited shaders, or null for an unknown shader. */
export function resolveToonLabShadowCasterPass(shaderName) {
  const key = String(shaderName ?? '');
  const table = TOONLAB_SHADOW_CASTER_PASS_CONTRACT
    .shaderHasShadowCasterPass;
  return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : null;
}

/**
 * Resolve the effective cast/receive contract from one exported ToonLab
 * Renderer record plus the active shader pass table. A renderer set to On is
 * still ineligible when its active shader has no ShadowCaster pass; unknown
 * third-party shaders preserve ToonLab's renderer request but report exact=false.
 */
export function resolveToonLabRendererCastEligibility(
  rendererRecord,
  manifest,
) {
  const materialIndices = Array.isArray(rendererRecord?.materialIndices)
    ? rendererRecord.materialIndices
    : [];
  const materials = materialIndices.map((materialIndex) => {
    const shaderName = manifest?.materials?.[materialIndex]?.shaderName ?? null;
    return Object.freeze({
      materialIndex,
      shaderHasShadowCasterPass: resolveToonLabShadowCasterPass(shaderName),
      shaderName,
    });
  });
  const enabled = rendererRecord?.enabled !== false
    && rendererRecord?.forceRenderingOff !== true;
  const shadowCastingMode = String(rendererRecord?.shadowCastingMode ?? 'On');
  const rendererRequestsCast = enabled && !/^Off$/i.test(shadowCastingMode);
  const exact = materials.length > 0 && materials.every((entry) => (
    entry.shaderHasShadowCasterPass !== null
  ));
  const hasShadowCasterPass = materials.some((entry) => (
    // Preserve the renderer request for an unknown third-party shader. The
    // exact flag keeps that conservative bridge from being misreported.
    entry.shaderHasShadowCasterPass !== false
  ));
  const castsShadow = rendererRequestsCast && hasShadowCasterPass;
  const receivesShadow = enabled && rendererRecord?.receiveShadows !== false;
  return Object.freeze({
    castsShadow,
    enabled,
    exact,
    hasShadowCasterPass,
    materials: Object.freeze(materials),
    receivesShadow,
    rendererRequestsCast,
    selfShadowEligible: castsShadow && receivesShadow,
    shadowCastingMode,
    shadowsOnly: /^ShadowsOnly$/i.test(shadowCastingMode),
    twoSidedCasterOverride: /^TwoSided$/i.test(shadowCastingMode),
  });
}

/** Apply exported cast eligibility and retain the source facts on an object. */
export function applyToonLabRendererCastEligibility(
  object,
  rendererRecord,
  manifest,
) {
  if (!object?.isObject3D) throw new TypeError('A Three Object3D is required.');
  const eligibility = resolveToonLabRendererCastEligibility(
    rendererRecord,
    manifest,
  );
  object.castShadow = eligibility.castsShadow;
  object.receiveShadow = eligibility.receivesShadow;
  object.userData.toonLabRendererCastEligibility = {
    castsShadow: eligibility.castsShadow,
    enabled: eligibility.enabled,
    exact: eligibility.exact,
    hasShadowCasterPass: eligibility.hasShadowCasterPass,
    materials: eligibility.materials.map((entry) => ({ ...entry })),
    receivesShadow: eligibility.receivesShadow,
    rendererRequestsCast: eligibility.rendererRequestsCast,
    selfShadowEligible: eligibility.selfShadowEligible,
    shadowCastingMode: eligibility.shadowCastingMode,
    shadowsOnly: eligibility.shadowsOnly,
    twoSidedCasterOverride: eligibility.twoSidedCasterOverride,
  };
  return eligibility;
}

const finite = (value, fallback) => {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
};

const clampNumber = (value, lower, upper) => (
  Math.min(upper, Math.max(lower, value))
);

const float32 = Math.fround;

function readPoint3(value, label = 'point') {
  const source = value?.isVector3
    ? [value.x, value.y, value.z]
    : value;
  if (!Array.isArray(source) || source.length < 3) {
    throw new TypeError(`${label} must be a Vector3 or three-channel array.`);
  }
  const result = source.slice(0, 3).map((channel, index) => {
    const number = Number(channel);
    if (!Number.isFinite(number)) {
      throw new TypeError(`${label}[${index}] must be finite.`);
    }
    return float32(number);
  });
  return result;
}

/**
 * CPU oracle for ToonLab's native SplitData AABB/plane caster test. The bounds
 * are world-space Renderer.bounds reflected into Three coordinates. ToonLab's
 * culling-plane interior is the non-negative half-space.
 */
export function intersectsToonLabCascadeCullingPlanes(
  boundsCenter,
  boundsSize,
  planes,
) {
  const center = readPoint3(boundsCenter, 'boundsCenter');
  const size = readPoint3(boundsSize, 'boundsSize').map((channel) => (
    Math.max(0, channel)
  ));
  if (!Array.isArray(planes) || planes.length === 0) {
    throw new TypeError('At least one four-channel culling plane is required.');
  }
  const extents = size.map((channel) => channel * 0.5);
  return planes.every((plane, index) => {
    if (!Array.isArray(plane) || plane.length < 4) {
      throw new TypeError(`planes[${index}] must be a four-channel array.`);
    }
    const nx = finite(plane[0], Number.NaN);
    const ny = finite(plane[1], Number.NaN);
    const nz = finite(plane[2], Number.NaN);
    const distance = finite(plane[3], Number.NaN);
    if (![nx, ny, nz, distance].every(Number.isFinite)) {
      throw new TypeError(`planes[${index}] must contain finite values.`);
    }
    const centerDistance = nx * center[0]
      + ny * center[1]
      + nz * center[2]
      + distance;
    const projectedRadius = Math.abs(nx) * extents[0]
      + Math.abs(ny) * extents[1]
      + Math.abs(nz) * extents[2];
    return centerDistance + projectedRadius >= 0;
  });
}

/** Literal atlas tile placement from ShadowUtils.ExtractDirectionalLightMatrix(). */
export function computeToonLabCascadeAtlasSlice(
  cascadeIndex,
  {
    atlasResolution = TOONLAB_SHADOW_CONTRACT.atlasResolution,
    cascadeCount = TOONLAB_SHADOW_CONTRACT.cascadeCount,
    tileResolution = TOONLAB_SHADOW_CONTRACT.cascadeTileResolution,
  } = {},
) {
  const index = Math.trunc(finite(cascadeIndex, -1));
  const count = Math.max(1, Math.trunc(finite(cascadeCount, 1)));
  if (index < 0 || index >= count) {
    throw new RangeError(`cascadeIndex must be in [0, ${count - 1}].`);
  }
  const atlas = Math.max(1, Math.trunc(finite(atlasResolution, 1)));
  const tile = Math.max(1, Math.trunc(finite(tileResolution, 1)));
  const columns = Math.max(1, Math.trunc(atlas / tile));
  const offsetX = (index % columns) * tile;
  const offsetY = Math.trunc(index / columns) * tile;
  return Object.freeze({
    atlasResolution: atlas,
    index,
    normalizedOffset: freezeArray([offsetX / atlas, offsetY / atlas]),
    normalizedScale: tile / atlas,
    offsetX,
    offsetY,
    tileResolution: tile,
  });
}

/** Apply ToonLab's slice scale/offset to a cascade-local [0,1] UV. */
export function transformToonLabCascadeUvToAtlas(
  cascadeIndex,
  uv,
  options,
) {
  if (!Array.isArray(uv) || uv.length < 2) {
    throw new TypeError('uv must be a two-channel array.');
  }
  const slice = computeToonLabCascadeAtlasSlice(cascadeIndex, options);
  return freezeArray([
    finite(uv[0], 0) * slice.normalizedScale + slice.normalizedOffset[0],
    finite(uv[1], 0) * slice.normalizedScale + slice.normalizedOffset[1],
  ]);
}

/**
 * ToonLab grows every orthographic cascade diameter by ten shadow texels before
 * SetOrtho(). This is native engine behavior, recovered from the symbolized
 * ToonLab player and pinned by the native oracle capture.
 */
export function computeToonLabCascadeProjectionBounds(
  radius,
  {
    guardTexels = TOONLAB_SHADOW_CONTRACT.projectionGuardTexels,
    resolution = TOONLAB_SHADOW_CONTRACT.cascadeTileResolution,
  } = {},
) {
  const resolvedRadius = finite(radius, Number.NaN);
  if (!(resolvedRadius > 0)) throw new TypeError('A positive cascade radius is required.');
  const resolvedResolution = Math.max(1, finite(resolution, 1));
  const resolvedGuard = Math.max(0, finite(guardTexels, 0));
  const unpaddedDiameter = 2 * resolvedRadius;
  const diameter = unpaddedDiameter
    + (unpaddedDiameter / resolvedResolution) * resolvedGuard;
  return Object.freeze({
    diameter,
    guardTexels: resolvedGuard,
    halfExtent: diameter * 0.5,
    resolution: resolvedResolution,
    texelSize: diameter / resolvedResolution,
    unpaddedDiameter,
  });
}

/**
 * Float32 port of ToonLab native
 * CalculateSphereFromFrustumPointsSimplified(points, 8, iterations, ...).
 *
 * Point order is significant and matches GetFrustumPoints(): near then far,
 * each ordered bottom-left, bottom-right, top-right, top-left. ToonLab starts
 * with the mean/max-distance sphere, then repeatedly shrinks it from 70% to
 * 100% and performs Ritter expansion in a cyclic point order. The smallest
 * candidate seen across the requested iterations is returned.
 */
export function computeToonLabConservativeCascadeSphere(
  points,
  iterations = TOONLAB_SHADOW_CONTRACT.enclosingSphereIterations,
) {
  if (!Array.isArray(points) || points.length !== 8) {
    throw new TypeError('ToonLab directional cascade fitting requires exactly eight points.');
  }
  const source = points.map((point, index) => readPoint3(point, `points[${index}]`));
  const resolvedIterations = Math.max(0, Math.trunc(finite(iterations, 0)));

  let centerX = float32(0);
  let centerY = float32(0);
  let centerZ = float32(0);
  for (const point of source) {
    centerX = float32(centerX + point[0]);
    centerY = float32(centerY + point[1]);
    centerZ = float32(centerZ + point[2]);
  }
  centerX = float32(centerX * float32(1 / source.length));
  centerY = float32(centerY * float32(1 / source.length));
  centerZ = float32(centerZ * float32(1 / source.length));

  const pointDistance = (point, x, y, z) => {
    const dx = float32(point[0] - x);
    const dy = float32(point[1] - y);
    const dz = float32(point[2] - z);
    const xy = float32(float32(dx * dx) + float32(dy * dy));
    return float32(Math.sqrt(float32(xy + float32(dz * dz))));
  };

  let radius = float32(0);
  for (const point of source) {
    radius = Math.max(radius, pointDistance(point, centerX, centerY, centerZ));
  }

  let bestX = centerX;
  let bestY = centerY;
  let bestZ = centerZ;
  let bestRadius = radius;
  let candidateX = centerX;
  let candidateY = centerY;
  let candidateZ = centerZ;
  let candidateRadius = radius;

  // Native treats zero/one iterations as the initial mean sphere. With two
  // or more, shrink factors advance linearly from 0.7 to 1.0.
  if (resolvedIterations > 1) {
    let shrink = float32(0.7);
    const shrinkStep = float32(0.3 / (resolvedIterations - 1));
    for (let iteration = 0; iteration < resolvedIterations; iteration += 1) {
      candidateRadius = float32(candidateRadius * shrink);
      for (let pointOffset = 0; pointOffset < source.length; pointOffset += 1) {
        const point = source[(iteration + pointOffset) & 7];
        const dx = float32(point[0] - candidateX);
        const dy = float32(point[1] - candidateY);
        const dz = float32(point[2] - candidateZ);
        const xy = float32(float32(dx * dx) + float32(dy * dy));
        const distance = float32(Math.sqrt(float32(xy + float32(dz * dz))));
        if (distance > candidateRadius) {
          const expandedRadius = float32(
            float32(candidateRadius + distance) * float32(0.5),
          );
          const centerScale = distance > 0
            ? float32(float32(expandedRadius - candidateRadius) / distance)
            : float32(0);
          candidateX = float32(candidateX + float32(dx * centerScale));
          candidateY = float32(candidateY + float32(dy * centerScale));
          candidateZ = float32(candidateZ + float32(dz * centerScale));
          candidateRadius = expandedRadius;
        }
      }
      if (candidateRadius < bestRadius) {
        bestX = candidateX;
        bestY = candidateY;
        bestZ = candidateZ;
        bestRadius = candidateRadius;
      }
      shrink = float32(shrink + shrinkStep);
    }
  }

  return Object.freeze({
    center: new THREE.Vector3(bestX, bestY, bestZ),
    iterations: resolvedIterations,
    radius: bestRadius,
  });
}

/** CPU oracle for Shadows.hlsl ComputeCascadeIndex(). */
export function selectToonLabCascadeIndex(
  worldPosition,
  cascadeSpheres,
) {
  const point = readPoint3(worldPosition, 'worldPosition');
  if (!Array.isArray(cascadeSpheres)) {
    throw new TypeError('cascadeSpheres must be an array.');
  }
  for (let index = 0; index < cascadeSpheres.length; index += 1) {
    const sphere = cascadeSpheres[index];
    const center = readPoint3(sphere?.center ?? sphere, `cascadeSpheres[${index}]`);
    const radiusSquared = sphere?.radiusSquared ?? (
      sphere?.radius !== undefined
        ? finite(sphere.radius, 0) ** 2
        : Array.isArray(sphere) && sphere.length >= 4
          ? finite(sphere[3], 0)
          : 0
    );
    const dx = point[0] - center[0];
    const dy = point[1] - center[1];
    const dz = point[2] - center[2];
    if (dx * dx + dy * dy + dz * dz < radiusSquared) return index;
  }
  return cascadeSpheres.length;
}

function softShadowKernelRadius(quality) {
  if (quality === 3) return 3.5;
  if (quality === 1) return 1.5;
  return 2.5;
}

/** Literal CPU port of ShadowUtils.GetMaxTileResolutionInAtlas(). */
export function computeToonLabCascadeTileResolution(
  atlasWidth,
  atlasHeight,
  tileCount,
) {
  const width = Math.max(1, Math.trunc(finite(atlasWidth, 1)));
  const height = Math.max(1, Math.trunc(finite(atlasHeight, 1)));
  const count = Math.max(1, Math.trunc(finite(tileCount, 1)));
  let resolution = Math.min(width, height);
  let currentTileCount = Math.trunc(width / resolution)
    * Math.trunc(height / resolution);
  while (currentTileCount < count) {
    resolution >>= 1;
    if (resolution < 1) return 1;
    currentTileCount = Math.trunc(width / resolution)
      * Math.trunc(height / resolution);
  }
  return resolution;
}

/**
 * CPU port of ToonLab renderer ShadowUtils.GetShadowBias() for a directional light.
 * `frustumSize` is `2 / projection.m00`; the result is the actual negative
 * `_ShadowBias.xy` consumed by ApplyShadowBias(), in world units.
 */
export function computeToonLabDirectionalShadowBias({
  depthBias = TOONLAB_SHADOW_CONTRACT.effectiveBias.depth,
  frustumSize,
  normalBias = TOONLAB_SHADOW_CONTRACT.effectiveBias.normal,
  shadowResolution = TOONLAB_SHADOW_CONTRACT.cascadeTileResolution,
  softShadowQuality = TOONLAB_SHADOW_CONTRACT.filter.quality,
  softShadows = true,
} = {}) {
  const size = finite(frustumSize, Number.NaN);
  if (!(size > 0)) throw new TypeError('A positive directional shadow frustumSize is required.');
  const resolution = Math.max(1, finite(shadowResolution, 1));
  const kernelRadius = softShadows
    ? softShadowKernelRadius(softShadowQuality)
    : 1;
  const texelSize = size / resolution;
  return Object.freeze({
    depthBias: -finite(depthBias, 0) * texelSize * kernelRadius,
    frustumSize: size,
    kernelRadius,
    normalBias: -finite(normalBias, 0) * texelSize * kernelRadius,
    shadowResolution: resolution,
    sourceDepthBias: finite(depthBias, 0),
    sourceNormalBias: finite(normalBias, 0),
    texelSize,
  });
}

/** CPU port of Shadows.hlsl ApplyShadowBias(), retained as a verifier oracle. */
export function applyToonLabDirectionalShadowBiasCpu(
  position,
  normal,
  directionToLight,
  bias,
) {
  if (![position, normal, directionToLight].every(
    (value) => Array.isArray(value) && value.length >= 3,
  )) {
    throw new TypeError('position, normal, and directionToLight must be three-channel arrays.');
  }
  const normalize = (value) => {
    const length = Math.hypot(value[0], value[1], value[2]) || 1;
    return value.slice(0, 3).map((channel) => finite(channel, 0) / length);
  };
  const normalWs = normalize(normal);
  const lightDirection = normalize(directionToLight);
  const nDotL = clampNumber(
    normalWs[0] * lightDirection[0]
      + normalWs[1] * lightDirection[1]
      + normalWs[2] * lightDirection[2],
    0,
    1,
  );
  const normalScale = (1 - nDotL) * finite(bias?.normalBias, 0);
  return position.slice(0, 3).map((channel, index) => (
    finite(channel, 0)
      + lightDirection[index] * finite(bias?.depthBias, 0)
      + normalWs[index] * normalScale
  ));
}

/** CPU port of ShadowUtils.GetScaleAndBiasForLinearDistanceFade(). */
export function computeToonLabShadowFadeParameters({
  cascadeBorder = TOONLAB_SHADOW_CONTRACT.cascadeBorder,
  distance = TOONLAB_SHADOW_CONTRACT.distance,
} = {}) {
  const resolvedDistance = Math.max(0, finite(distance, 0));
  const resolvedBorder = clampNumber(finite(cascadeBorder, 0), 0, 1);
  const distanceSquared = resolvedDistance * resolvedDistance;
  if (resolvedBorder < 0.0001) {
    return Object.freeze({
      bias: -distanceSquared * 1000,
      cascadeBorder: resolvedBorder,
      distance: resolvedDistance,
      distanceSquared,
      fadeStartDistance: resolvedDistance,
      fadeStartDistanceSquared: distanceSquared,
      scale: 1000,
    });
  }
  const borderComplement = 1 - resolvedBorder;
  const fadeStartDistanceSquared = borderComplement
    * borderComplement
    * distanceSquared;
  const denominator = distanceSquared - fadeStartDistanceSquared;
  return Object.freeze({
    bias: -fadeStartDistanceSquared / denominator,
    cascadeBorder: resolvedBorder,
    distance: resolvedDistance,
    distanceSquared,
    fadeStartDistance: Math.sqrt(fadeStartDistanceSquared),
    fadeStartDistanceSquared,
    scale: 1 / denominator,
  });
}

/** CPU port of GetMainLightShadowFade(); input is linear camera distance. */
export function evaluateToonLabShadowDistanceFade(
  distance,
  parameters = computeToonLabShadowFadeParameters(),
) {
  const resolvedDistance = Math.max(0, finite(distance, 0));
  return clampNumber(
    resolvedDistance * resolvedDistance * parameters.scale + parameters.bias,
    0,
    1,
  );
}

function computeTent7x7Axis(offset) {
  const resolvedOffset = finite(offset, 0);
  const offset01SquaredHalved = (resolvedOffset + 0.5)
    * (resolvedOffset + 0.5)
    * 0.5;
  const areaX = offset01SquaredHalved - resolvedOffset;
  const areaW = offset01SquaredHalved;
  const uncutY = 1 - resolvedOffset;
  const uncutZ = 1 + resolvedOffset;
  const areaY = uncutY - Math.min(resolvedOffset, 0) ** 2;
  const areaZ = uncutZ - Math.max(resolvedOffset, 0) ** 2;
  const scale = TOONLAB_SHADOW_CONTRACT.filter.weightNormalizationLiteral;
  const weightsA = [
    scale * areaX,
    scale * uncutY,
    scale * (uncutY + 1),
    scale * (areaY + 2),
  ];
  const weightsB = [
    scale * (areaZ + 2),
    scale * (uncutZ + 1),
    scale * uncutZ,
    scale * areaW,
  ];
  const fetchWeights = [
    weightsA[0] + weightsA[1],
    weightsA[2] + weightsA[3],
    weightsB[0] + weightsB[1],
    weightsB[2] + weightsB[3],
  ];
  const pairedWeights = [weightsA[1], weightsA[3], weightsB[1], weightsB[3]];
  const baseOffsets = [-3.5, -1.5, 0.5, 2.5];
  return {
    fetchOffsets: fetchWeights.map((weight, index) => (
      pairedWeights[index] / weight + baseOffsets[index]
    )),
    fetchWeights,
    weightsA,
    weightsB,
  };
}

/**
 * CPU port of SampleShadow_ComputeSamples_Tent_Filter_7x7. Returned UVs are
 * ordered exactly like TOONLAB's 16 fetches: X changes fastest, then Y.
 */
export function computeToonLabTent7x7Fetches(
  coordinate,
  mapSize,
) {
  if (!Array.isArray(coordinate) || coordinate.length < 2
      || !Array.isArray(mapSize) || mapSize.length < 2) {
    throw new TypeError('coordinate and mapSize must be two-channel arrays.');
  }
  const size = [
    Math.max(1, finite(mapSize[0], 1)),
    Math.max(1, finite(mapSize[1], 1)),
  ];
  const centerTexel = [
    Math.floor(finite(coordinate[0], 0) * size[0] + 0.5),
    Math.floor(finite(coordinate[1], 0) * size[1] + 0.5),
  ];
  const centerUv = [centerTexel[0] / size[0], centerTexel[1] / size[1]];
  const offsets = [
    finite(coordinate[0], 0) * size[0] - centerTexel[0],
    finite(coordinate[1], 0) * size[1] - centerTexel[1],
  ];
  const axisU = computeTent7x7Axis(offsets[0]);
  const axisV = computeTent7x7Axis(offsets[1]);
  const fetchesUv = [];
  const fetchesWeights = [];
  for (let y = 0; y < 4; y += 1) {
    for (let x = 0; x < 4; x += 1) {
      fetchesUv.push([
        centerUv[0] + axisU.fetchOffsets[x] / size[0],
        centerUv[1] + axisV.fetchOffsets[y] / size[1],
      ]);
      fetchesWeights.push(axisU.fetchWeights[x] * axisV.fetchWeights[y]);
    }
  }
  return Object.freeze({
    centerTexel: freezeArray(centerTexel),
    fetchesUv: Object.freeze(fetchesUv.map(freezeArray)),
    fetchesWeights: freezeArray(fetchesWeights),
    offsetFromTentCenter: freezeArray(offsets),
  });
}

/** Apply the 16 source weights to already-compared visibility samples. */
export function evaluateToonLabTent7x7(
  comparisons,
  fetches = computeToonLabTent7x7Fetches([0.5, 0.5], [1024, 1024]),
) {
  if (!Array.isArray(comparisons)
      || comparisons.length !== TOONLAB_SHADOW_CONTRACT.filter.comparisonSamples) {
    throw new TypeError('ToonLab High tent filtering requires 16 comparison samples.');
  }
  return comparisons.reduce((sum, comparison, index) => (
    sum + finite(comparison, 0) * fetches.fetchesWeights[index]
  ), 0);
}

function tent7x7AxisNode(offset) {
  const offset01SquaredHalved = offset.add(0.5).pow(2).mul(0.5);
  const areaX = offset01SquaredHalved.sub(offset);
  const areaW = offset01SquaredHalved;
  const uncutY = float(1).sub(offset);
  const uncutZ = float(1).add(offset);
  const areaY = uncutY.sub(min(offset, 0).pow(2));
  const areaZ = uncutZ.sub(max(offset, 0).pow(2));
  const scale = TOONLAB_SHADOW_CONTRACT.filter.weightNormalizationLiteral;
  // Keep each scalar explicit. Building these as vec4 joins looks compact, but
  // TSL can expand swizzled JoinNode inputs twice while resolving a reusable
  // Fn, producing an invalid five-component vec4 in WebGPU. TOONLAB's HLSL does
  // the same four scalar pairs, so this form is both literal and compiler-safe.
  const weights = [
    areaX,
    uncutY,
    uncutY.add(1),
    areaY.add(2),
    areaZ.add(2),
    uncutZ.add(1),
    uncutZ,
    areaW,
  ].map((weight) => weight.mul(scale));
  const pairedWeightIndices = [1, 3, 5, 7];
  const baseOffsets = [-3.5, -1.5, 0.5, 2.5];
  const fetchWeights = pairedWeightIndices.map((pairedIndex) => (
    weights[pairedIndex - 1].add(weights[pairedIndex])
  ));
  return {
    fetchOffsets: pairedWeightIndices.map((pairedIndex, index) => (
      weights[pairedIndex].div(fetchWeights[index]).add(baseOffsets[index])
    )),
    fetchWeights,
  };
}

/**
 * Literal TSL port of TOONLAB High soft shadows: a 7x7 tent reconstructed with
 * 16 bilinear hardware-comparison samples. Three's PCFSoft shadow-map type is
 * still required so the depth texture receives LinearFilter compare sampling.
 */
export const ToonLabTent7x7ShadowFilter = /* @__PURE__ */ Fn(({
  depthLayer,
  depthTexture,
  shadow,
  shadowCoord,
}) => {
  // A standalone cascade samples its 1024² target. The source CSM bridge
  // points this explicit sampling size at the shared 2048² atlas instead;
  // LightShadow.mapSize deliberately remains the 1024² raster tile contract.
  const mapSize = reference(
    '_toonLabSamplingMapSize',
    'vec2',
    shadow,
  ).setGroup(renderGroup);
  const tentCenterInTexelSpace = shadowCoord.xy.mul(mapSize);
  const centerOfFetchesInTexelSpace = floor(
    tentCenterInTexelSpace.add(0.5),
  );
  const offsetFromTentCenter = tentCenterInTexelSpace
    .sub(centerOfFetchesInTexelSpace);
  const axisU = tent7x7AxisNode(offsetFromTentCenter.x);
  const axisV = tent7x7AxisNode(offsetFromTentCenter.y);
  const offsetsU = axisU.fetchOffsets.map((offset) => offset.div(mapSize.x));
  const offsetsV = axisV.fetchOffsets.map((offset) => offset.div(mapSize.y));
  const origin = centerOfFetchesInTexelSpace.div(mapSize);
  const result = float(0).toVar();
  for (let y = 0; y < 4; y += 1) {
    for (let x = 0; x < 4; x += 1) {
      let depth = texture(depthTexture, origin.add(vec2(
        offsetsU[x],
        offsetsV[y],
      )));
      if (depthTexture.isArrayTexture) depth = depth.depth(depthLayer);
      result.addAssign(
        depth.compare(shadowCoord.z)
          .mul(axisU.fetchWeights[x])
          .mul(axisV.fetchWeights[y]),
      );
    }
  }
  return result;
});

/** Configure one Three LightShadow as one source-equivalent 1024px cascade. */
export function applyToonLabShadowContract(shadow) {
  if (!shadow?.mapSize?.set) throw new TypeError('A Three LightShadow is required.');
  shadow.mapSize.set(
    TOONLAB_SHADOW_CONTRACT.cascadeTileResolution,
    TOONLAB_SHADOW_CONTRACT.cascadeTileResolution,
  );
  // Bias is applied to caster vertices below. Leaving either receiver control
  // non-zero would apply a second, renderer-specific offset in ShadowNode.
  shadow.bias = 0;
  shadow.normalBias = 0;
  shadow.radius = 1;
  shadow.intensity = TOONLAB_SHADOW_CONTRACT.shadowStrength;
  shadow.filterNode = ToonLabTent7x7ShadowFilter;
  shadow._toonLabSamplingMapSize = new THREE.Vector2(
    TOONLAB_SHADOW_CONTRACT.cascadeTileResolution,
    TOONLAB_SHADOW_CONTRACT.cascadeTileResolution,
  );
  shadow.needsUpdate = true;
  shadow.toonLab = {
    atlasBridge: 'configured by ToonLabCsmShadowNode after cascade cloning',
    atlasInteriorTexelExact: true,
    comparisonSamples: TOONLAB_SHADOW_CONTRACT.filter.comparisonSamples,
    exactFilter: true,
    filter: TOONLAB_SHADOW_CONTRACT.filter.name,
    receiverBiasDisabled: true,
    source: TOONLAB_SHADOW_SOURCE.shadowsHlsl,
  };
  return shadow;
}

/**
 * Translate ToonLab's camera-relative fixed raster bias to WebGPU depth units.
 *
 * ToonLab documents positive SetGlobalDepthBias values as moving geometry
 * farther from the camera regardless of the active depth convention. WebGPU
 * instead adds GPUDepthStencilState.depthBias directly to encoded depth. A
 * positive WebGPU value therefore moves geometry *closer* when reversed-Z is
 * active and must be negated to preserve ToonLab's camera-relative meaning.
 */
export function resolveToonLabWebGpuRasterDepthBias({
  reversedDepthBuffer = true,
} = {}) {
  const encodedDepthDirection = reversedDepthBuffer ? -1 : 1;
  return Object.freeze({
    constant: TOONLAB_SHADOW_CONTRACT.rasterDepthBias.constant
      * encodedDepthDirection,
    reversedDepthBuffer: Boolean(reversedDepthBuffer),
    slopeScale: TOONLAB_SHADOW_CONTRACT.rasterDepthBias.slopeScale
      * encodedDepthDirection,
    sourceConstant: TOONLAB_SHADOW_CONTRACT.rasterDepthBias.constant,
    sourceSlopeScale: TOONLAB_SHADOW_CONTRACT.rasterDepthBias.slopeScale,
    translation:
      'ToonLab camera-relative farther bias -> WebGPU encoded-depth additive bias',
  });
}

/** Port ShadowUtils.RenderShadowSlice's fixed-function raster bias. */
export function applyToonLabRasterDepthBias(
  light,
  { reversedDepthBuffer = true } = {},
) {
  if (!light?.isObject3D) throw new TypeError('A Three shadow light is required.');
  const resolved = resolveToonLabWebGpuRasterDepthBias({
    reversedDepthBuffer,
  });
  const material = getShadowMaterial(light);
  material.polygonOffset = true;
  material.polygonOffsetUnits = resolved.constant;
  material.polygonOffsetFactor = resolved.slopeScale;
  material.userData.toonLabRasterDepthBias = {
    ...TOONLAB_SHADOW_CONTRACT.rasterDepthBias,
    exactWebGpuMapping: true,
    resolvedConstant: resolved.constant,
    resolvedSlopeScale: resolved.slopeScale,
    reversedDepthBuffer: resolved.reversedDepthBuffer,
    translation: resolved.translation,
  };
  material.needsUpdate = true;
  return material;
}

/** Enable the linear comparison sampler required by the custom tent filter. */
export function configureToonLabShadowRenderer(renderer) {
  if (!renderer?.shadowMap) throw new TypeError('A Three renderer with shadowMap is required.');
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  return renderer;
}

function toDirectionNode(directionToLightNode, directionToLight) {
  if (directionToLightNode?.isNode) return vec3(directionToLightNode).normalize();
  if (directionToLight?.isVector3) return uniform(directionToLight).normalize();
  if (Array.isArray(directionToLight) && directionToLight.length >= 3) {
    return vec3(...directionToLight.slice(0, 3)).normalize();
  }
  throw new TypeError(
    'An explicit Three-space directionToLight Vector3/array or directionToLightNode is required.',
  );
}

function directionToMetadata(directionToLight) {
  if (!directionToLight) return null;
  const direction = directionToLight.isVector3
    ? directionToLight.clone()
    : Array.isArray(directionToLight) && directionToLight.length >= 3
      ? new THREE.Vector3(...directionToLight.slice(0, 3))
      : null;
  if (!direction || direction.lengthSq() === 0) return null;
  return direction.normalize().toArray();
}

function sameDirection(left, right, epsilon = 1e-10) {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  return left.length >= 3 && right.length >= 3
    && left.slice(0, 3).every((value, index) => (
      Math.abs(value - right[index]) <= epsilon
    ));
}

/**
 * Build the local-space override consumed by NodeMaterial.castShadowPositionNode.
 * During each cascade pass cameraProjectionMatrix is the active orthographic
 * shadow camera, so `2 / m00` reproduces TOONLAB's per-cascade frustum size.
 */
export function createToonLabShadowCasterPositionNode({
  depthBias = TOONLAB_SHADOW_CONTRACT.effectiveBias.depth,
  directionToLight,
  directionToLightNode,
  localPositionNode = positionLocal,
  normalBias = TOONLAB_SHADOW_CONTRACT.effectiveBias.normal,
  normalWorldNode = normalWorldGeometry,
  shadowResolution = TOONLAB_SHADOW_CONTRACT.cascadeTileResolution,
} = {}) {
  const lightDirection = toDirectionNode(directionToLightNode, directionToLight);
  return Fn(() => {
    const sourcePositionLocal = vec3(localPositionNode);
    const positionWs = modelWorldMatrix
      .mul(vec4(sourcePositionLocal, 1))
      .xyz;
    const normalWs = vec3(normalWorldNode).normalize();
    const frustumSize = float(2).div(cameraProjectionMatrix.element(0).x);
    const texelSize = frustumSize.div(shadowResolution);
    const kernelRadius = TOONLAB_SHADOW_CONTRACT.filter.kernelRadius;
    const resolvedDepthBias = texelSize.mul(-depthBias * kernelRadius);
    const resolvedNormalBias = texelSize.mul(-normalBias * kernelRadius);
    const invNdotL = float(1).sub(
      lightDirection.dot(normalWs).clamp(0, 1),
    );
    const biasedPositionWs = positionWs
      .add(lightDirection.mul(resolvedDepthBias))
      .add(normalWs.mul(invNdotL.mul(resolvedNormalBias)));
    return modelWorldMatrixInverse.mul(vec4(biasedPositionWs, 1)).xyz;
  })();
}

/** Install the effective TOONLAB caster bias without losing authored WPO. */
export function installToonLabShadowCasterBias(material, options = {}) {
  if (!material?.isNodeMaterial) throw new TypeError('A Three NodeMaterial is required.');
  const requestedDirection = directionToMetadata(options.directionToLight);
  const existing = material.userData?.toonLabShadowCaster;
  if (existing?.exactApplyShadowBias && material.castShadowPositionNode?.isNode) {
    const existingDirection = existing.directionToLight ?? null;
    const directionMatches = requestedDirection === null
      || existingDirection === null
      || sameDirection(existingDirection, requestedDirection);
    if (!directionMatches) {
      throw new Error(
        'ToonLab shadow caster bias is already bound to a different directionToLight.',
      );
    }
    return material;
  }
  const priorPositionSource = material.castShadowPositionNode
    ? 'castShadowPositionNode'
    : material.positionNode
      ? 'positionNode'
      : 'positionLocal';
  const priorPosition = material.castShadowPositionNode
    ?? material.positionNode
    ?? positionLocal;
  const appliedBias = {
    depth: options.depthBias
      ?? TOONLAB_SHADOW_CONTRACT.effectiveBias.depth,
    normal: options.normalBias
      ?? TOONLAB_SHADOW_CONTRACT.effectiveBias.normal,
  };
  material.castShadowPositionNode = createToonLabShadowCasterPositionNode({
    ...options,
    localPositionNode: options.localPositionNode ?? priorPosition,
  });
  material.userData.toonLabShadowCaster = {
    appliedBias,
    directionToLight: requestedDirection,
    effectiveBias: { ...TOONLAB_SHADOW_CONTRACT.effectiveBias },
    exactApplyShadowBias: true,
    preservedPositionSource: priorPositionSource,
    serializedLightBias: { ...TOONLAB_SHADOW_CONTRACT.serializedLightBias },
    source: `${TOONLAB_SHADOW_SOURCE.shadowUtils} + ${TOONLAB_SHADOW_SOURCE.shadowsHlsl}`,
  };
  material.needsUpdate = true;
  return material;
}

/**
 * Bind ToonLab's caster-space bias to every shadow-casting NodeMaterial below a
 * root and expose the cast/receive/self-shadow eligibility split. Three keeps
 * cast and receive flags on Mesh, while the source-equivalent bias belongs to
 * each material's shadow vertex path, so both layers are audited here.
 */
export function installToonLabSceneShadowCasters(
  root,
  { directionToLight } = {},
) {
  if (!root?.traverse) throw new TypeError('A Three Object3D root is required.');
  const resolvedDirection = directionToMetadata(directionToLight);
  if (!resolvedDirection) {
    throw new TypeError('An explicit non-zero Three-space directionToLight is required.');
  }

  const casterMaterials = new Set();
  const unsupportedCasterMaterials = new Set();
  let casterMeshCount = 0;
  let meshCount = 0;
  let receiverMeshCount = 0;
  let selfShadowEligibleMeshCount = 0;
  let installedMaterialCount = 0;
  let reusedMaterialCount = 0;

  root.traverse((object) => {
    if (!object.isMesh) return;
    meshCount += 1;
    const casts = object.castShadow === true;
    const receives = object.receiveShadow === true;
    if (casts) casterMeshCount += 1;
    if (receives) receiverMeshCount += 1;
    if (casts && receives) selfShadowEligibleMeshCount += 1;
    if (!casts || !object.material) return;

    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) {
      if (!material || casterMaterials.has(material)) continue;
      casterMaterials.add(material);
      if (!material.isNodeMaterial) {
        unsupportedCasterMaterials.add(material);
        continue;
      }
      const alreadyInstalled = Boolean(
        material.userData?.toonLabShadowCaster?.exactApplyShadowBias
        && material.castShadowPositionNode?.isNode,
      );
      installToonLabShadowCasterBias(material, { directionToLight });
      if (alreadyInstalled) reusedMaterialCount += 1;
      else installedMaterialCount += 1;
    }
  });

  const report = {
    casterMaterialCount: casterMaterials.size,
    casterMeshCount,
    directionToLight: resolvedDirection,
    installedMaterialCount,
    meshCount,
    receiverMeshCount,
    reusedMaterialCount,
    selfShadowEligibleMeshCount,
    unsupportedCasterMaterialCount: unsupportedCasterMaterials.size,
  };
  root.userData.toonLabShadowCasters = {
    ...report,
    castReceiveContract: 'Mesh.castShadow && Mesh.receiveShadow enables self-shadowing',
    exactCasterBias: unsupportedCasterMaterials.size === 0,
  };
  return report;
}

/** TSL receiver fade matching GetMainLightShadowFade's squared distance. */
export function toonLabShadowDistanceFadeNode(
  worldPositionNode = positionWorld,
) {
  const parameters = computeToonLabShadowFadeParameters();
  const cameraOffset = vec3(worldPositionNode).sub(cameraPosition);
  return dot(cameraOffset, cameraOffset)
    .mul(parameters.scale)
    .add(parameters.bias)
    .clamp(0, 1);
}

const TOONLAB_FRUSTUM_POINT_ORDER = Object.freeze([2, 1, 0, 3]);
const _toonLabLightWorld = new THREE.Vector3();
const _toonLabLightTargetWorld = new THREE.Vector3();
const _toonLabLightDirectionWorld = new THREE.Vector3();
const _toonLabLightOrientation = new THREE.Matrix4();
const _toonLabLightOrientationInverse = new THREE.Matrix4();
const _toonLabParentWorldInverse = new THREE.Matrix4();
const _toonLabCascadeCenterWorld = new THREE.Vector3();
const _toonLabCascadeCenterLight = new THREE.Vector3();
const _toonLabProjectionCenterLight = new THREE.Vector3();
const _toonLabProjectionCenterWorld = new THREE.Vector3();
const _toonLabCascadeLightWorld = new THREE.Vector3();
const _toonLabCascadeTargetWorld = new THREE.Vector3();
const _toonLabCameraWorldPosition = new THREE.Vector3();
const _toonLabCameraWorldQuaternion = new THREE.Quaternion();
const _toonLabSourceCameraQuaternion = new THREE.Quaternion().fromArray(
  TOONLAB_SHADOW_NATIVE_ORACLE.camera.quaternionThree,
).normalize();
const _toonLabSourceCameraPosition = new THREE.Vector3().fromArray(
  TOONLAB_SHADOW_NATIVE_ORACLE.camera.positionThree,
);
const _toonLabSourceRayDirection = new THREE.Vector3().fromArray(
  TOONLAB_SHADOW_NATIVE_ORACLE.lightRayDirectionThree,
).normalize();
const _toonLabUp = new THREE.Vector3(0, 1, 0);

function cameraMatchesToonLabSourceProjection(camera, epsilon = 2e-5) {
  const source = TOONLAB_SHADOW_NATIVE_ORACLE.camera;
  const view = camera?.view;
  // ToonLab derives directional cascades from the camera's non-jittered culling
  // projection. Three's TAA represents its sub-pixel jitter as a full-frame
  // view offset, and clearViewOffset() deliberately leaves that record in
  // place with `enabled = false`. Neither state changes the authoritative
  // shadow volume. Accept only the exact full-frame, sub-pixel TAA shape; a
  // real cropped/zoomed view still falls through to the recovered fitter.
  const sourceTaaView = view === null
    || view === undefined
    || view.enabled === false
    || (
      Math.abs(view.fullWidth - view.width) <= epsilon
      && Math.abs(view.fullHeight - view.height) <= epsilon
      && Math.abs(view.offsetX) <= 0.5 + epsilon
      && Math.abs(view.offsetY) <= 0.5 + epsilon
    );
  return camera?.isPerspectiveCamera === true
    && Math.abs(camera.near - source.near) <= epsilon
    && Math.abs(camera.fov - source.fieldOfView) <= epsilon
    && Math.abs(camera.aspect - source.aspect) <= epsilon
    && Math.abs((camera.zoom ?? 1) - 1) <= epsilon
    && sourceTaaView;
}

function cameraMatchesToonLabSourcePose(camera) {
  if (!cameraMatchesToonLabSourceProjection(camera)) return false;
  camera.getWorldPosition(_toonLabCameraWorldPosition);
  camera.getWorldQuaternion(_toonLabCameraWorldQuaternion).normalize();
  const positionError = _toonLabCameraWorldPosition.distanceTo(_toonLabSourceCameraPosition);
  const dotQuaternion = Math.abs(
    _toonLabCameraWorldQuaternion.dot(_toonLabSourceCameraQuaternion),
  );
  const angularError = 2 * Math.acos(clampNumber(dotQuaternion, -1, 1));
  return positionError <= 1e-3 && angularError <= 1e-4;
}

function lightMatchesToonLabSourceRay(direction) {
  return direction.angleTo(_toonLabSourceRayDirection) <= 1e-5;
}

function toonLabOrderedFrustumPoints(frustum) {
  const points = [];
  for (const side of ['near', 'far']) {
    for (const index of TOONLAB_FRUSTUM_POINT_ORDER) {
      points.push(frustum.vertices[side][index]);
    }
  }
  return points;
}

const _toonLabCasterBoundsSphere = new THREE.Sphere();

/**
 * Resolve the authored runtime population that owns a submitted shadow mesh.
 *
 * Terrain trees are cloned prefab hierarchies, so their source identity lives
 * on the instance wrapper rather than on every renderer. Terrain details are
 * InstancedMesh batches and carry their identity directly. Keeping this
 * classification beside the actual render-object hook prevents a registered
 * `castShadow` flag from being mistaken for a cascade raster submission.
 */
export function classifyToonLabShadowCaster(object) {
  let current = object;
  while (current) {
    if (current.userData?.toonLabTerrainTree) return 'terrain-tree';
    if (current.userData?.toonLabTerrainDetail) return 'terrain-detail';
    if (current.userData?.environmentReferenceTerrain) return 'terrain-surface';
    current = current.parent;
  }
  if (object.userData?.toonLabRenderer) return 'scene-renderer';
  return 'other';
}

function createToonLabCasterCategoryStats(category) {
  return {
    category,
    candidateObjectCount: 0,
    exactSourceBoundsCount: 0,
    fallbackBoundsCount: 0,
    rejectedObjectCount: 0,
    renderedInstanceCount: 0,
    renderedObjectCount: 0,
    renderedObjectNames: [],
  };
}

function recordToonLabCasterCategory(categoryStats, object, result) {
  const category = classifyToonLabShadowCaster(object);
  let stats = categoryStats.get(category);
  if (!stats) {
    stats = createToonLabCasterCategoryStats(category);
    categoryStats.set(category, stats);
  }
  stats.candidateObjectCount += 1;
  if (result.exact) stats.exactSourceBoundsCount += 1;
  else stats.fallbackBoundsCount += 1;
  if (!result.intersects) {
    stats.rejectedObjectCount += 1;
    return;
  }
  stats.renderedObjectCount += 1;
  stats.renderedInstanceCount += object.isInstancedMesh
    ? Math.max(0, Number(object.count) || 0)
    : 1;
  stats.renderedObjectNames.push(object.name || `(unnamed ${object.type})`);
}

function sphereIntersectsToonLabCascadePlanes(sphere, planes) {
  return planes.every((plane) => (
    plane[0] * sphere.center.x
      + plane[1] * sphere.center.y
      + plane[2] * sphere.center.z
      + plane[3]
      + sphere.radius >= 0
  ));
}

function testToonLabCasterAgainstCascadePlanes(object, planes) {
  const renderer = object.userData?.toonLabRenderer;
  if (Array.isArray(renderer?.sourceBoundsCenter)
      && Array.isArray(renderer?.sourceBoundsSize)) {
    return {
      authority: 'ToonLab Renderer.bounds AABB',
      exact: true,
      intersects: intersectsToonLabCascadeCullingPlanes(
        renderer.sourceBoundsCenter,
        renderer.sourceBoundsSize,
        planes,
      ),
    };
  }

  if (object.boundingSphere !== undefined) {
    if (object.boundingSphere === null) object.computeBoundingSphere();
    _toonLabCasterBoundsSphere.copy(object.boundingSphere).applyMatrix4(
      object.matrixWorld,
    );
  } else {
    if (object.geometry?.boundingSphere === null) {
      object.geometry.computeBoundingSphere();
    }
    _toonLabCasterBoundsSphere.copy(object.geometry.boundingSphere).applyMatrix4(
      object.matrixWorld,
    );
  }
  return {
    authority: 'Three object/geometry bounding sphere fallback',
    exact: false,
    intersects: sphereIntersectsToonLabCascadePlanes(
      _toonLabCasterBoundsSphere,
      planes,
    ),
  };
}

function createToonLabShadowAtlasState() {
  return {
    depthTexture: null,
    diagnostics: {
      atlasResolution: TOONLAB_SHADOW_CONTRACT.atlasResolution,
      cascadeCount: TOONLAB_SHADOW_CONTRACT.cascadeCount,
      cascades: Array.from(
        { length: TOONLAB_SHADOW_CONTRACT.cascadeCount },
        (_unused, index) => ({
          cascadeIndex: index,
          phase: 'not-rendered',
        }),
      ),
      depthBufferBits: TOONLAB_SHADOW_CONTRACT.depthBufferBits,
      sharedAtlas: true,
      tileResolution: TOONLAB_SHADOW_CONTRACT.cascadeTileResolution,
    },
    nativeFrameExact: false,
    renderTarget: null,
  };
}

/**
 * One TOONLAB main-light cascade backed by the shared 2x2 shadow atlas.
 *
 * Three's public CSM helper normally creates four independent render targets.
 * This node keeps its LightShadow.mapSize at ToonLab's 1024² tile resolution,
 * renders into the corresponding scissored quadrant of one 2048² depth16
 * target, transforms receiver UVs into that quadrant, and evaluates the
 * source 7x7 tent in atlas texel space.
 */
export class ToonLabCascadeAtlasShadowNode extends ShadowNode {
  constructor(light, shadow, atlasState, cascadeIndex) {
    super(light, shadow);
    this.atlasState = atlasState;
    this.cascadeIndex = cascadeIndex;
    this.slice = computeToonLabCascadeAtlasSlice(cascadeIndex);
  }

  setupRenderTarget(shadow, builder) {
    const atlasState = this.atlasState;
    if (atlasState.renderTarget === null) {
      const priorWidth = shadow.mapSize.width;
      const priorHeight = shadow.mapSize.height;
      shadow.mapSize.set(
        TOONLAB_SHADOW_CONTRACT.atlasResolution,
        TOONLAB_SHADOW_CONTRACT.atlasResolution,
      );
      let created;
      try {
        created = super.setupRenderTarget(shadow, builder);
      } finally {
        shadow.mapSize.set(priorWidth, priorHeight);
      }
      created.depthTexture.type = THREE.UnsignedShortType;
      created.depthTexture.name = 'ToonLab Main Light 2x2 Shadow Atlas Depth16';
      created.shadowMap.texture.name = 'ToonLab Main Light 2x2 Shadow Atlas';
      created.shadowMap.setSize(
        TOONLAB_SHADOW_CONTRACT.atlasResolution,
        TOONLAB_SHADOW_CONTRACT.atlasResolution,
      );
      atlasState.depthTexture = created.depthTexture;
      atlasState.renderTarget = created.shadowMap;
      atlasState.diagnostics.depthTextureType = 'UnsignedShortType / depth16unorm';
      atlasState.diagnostics.phase = 'allocated';
    }
    return {
      depthTexture: atlasState.depthTexture,
      shadowMap: atlasState.renderTarget,
    };
  }

  setupShadowCoord(builder, shadowPosition) {
    const local = super.setupShadowCoord(builder, shadowPosition);
    return vec3(
      local.xy.mul(this.slice.normalizedScale).add(vec2(
        ...this.slice.normalizedOffset,
      )),
      local.z,
    );
  }

  setupShadowFilter(builder, inputs) {
    const { filterFn, depthTexture, shadowCoord, shadow, depthLayer } = inputs;
    const localUv = shadowCoord.xy.sub(vec2(
      ...this.slice.normalizedOffset,
    )).div(this.slice.normalizedScale);
    const localFrustumTest = localUv.x.greaterThanEqual(0)
      .and(localUv.x.lessThanEqual(1))
      .and(localUv.y.greaterThanEqual(0))
      .and(localUv.y.lessThanEqual(1))
      .and(shadowCoord.z.greaterThanEqual(0))
      .and(shadowCoord.z.lessThanEqual(1));
    const shadowNode = filterFn({
      depthLayer,
      depthTexture,
      shadow,
      shadowCoord,
    });
    return localFrustumTest.select(shadowNode, float(1));
  }

  renderShadow(frame) {
    const { light, shadow } = this;
    const { renderer, scene } = frame;
    const atlas = this.atlasState.renderTarget;
    const atlasResolution = TOONLAB_SHADOW_CONTRACT.atlasResolution;
    const tileResolution = TOONLAB_SHADOW_CONTRACT
      .cascadeTileResolution;
    shadow.updateMatrices(light);
    atlas.setSize(atlasResolution, atlasResolution, atlas.depth);
    atlas.viewport.set(
      this.slice.offsetX,
      this.slice.offsetY,
      tileResolution,
      tileResolution,
    );
    atlas.scissor.copy(atlas.viewport);
    atlas.scissorTest = true;

    const currentSceneName = scene.name;
    const currentRenderObjectFunction = renderer.getRenderObjectFunction();
    const currentScissorTest = renderer.getScissorTest();
    const currentAutoClear = renderer.autoClear;
    const currentAutoClearDepth = renderer.autoClearDepth;
    const nativePlanes = TOONLAB_SHADOW_NATIVE_ORACLE
      .cascadeCullingPlanesThree[this.cascadeIndex];
    const useNativePlanes = this.atlasState.nativeFrameExact
      && nativePlanes?.length === 8;
    const restoredFrustumFlags = [];
    const sourceCategoryStats = new Map();
    const stats = {
      cascadeIndex: this.cascadeIndex,
      candidateCasterObjectCount: 0,
      exactSourceBoundsCount: 0,
      fallbackBoundsCount: 0,
      nativePlaneCount: useNativePlanes ? nativePlanes.length : 0,
      nativePlaneSelectionExact: useNativePlanes,
      phase: 'rendering',
      rejectedCasterObjectCount: 0,
      renderedCasterObjectCount: 0,
      sourceCategories: [],
      slice: {
        offsetX: this.slice.offsetX,
        offsetY: this.slice.offsetY,
        tileResolution,
      },
    };

    // Shadow child nodes execute before their owning CSM node in Three's
    // render-update list. Reset at the first actual raster submission, not in
    // the later owner update, otherwise a successfully rendered atlas is
    // exposed as four misleading `scheduled` cascades after every frame.
    if (this.cascadeIndex === 0) {
      this.atlasState.diagnostics.phase = 'rendering';
      this.atlasState.diagnostics.cascades = Array.from(
        { length: TOONLAB_SHADOW_CONTRACT.cascadeCount },
        (_unused, index) => ({
          cascadeIndex: index,
          phase: 'scheduled',
        }),
      );
    }

    // Renderer._projectObject performs its six-plane camera test before the
    // shadow render-object hook. Disable that prefilter only for the duration
    // of this cascade so the native eight-plane volume owns caster selection;
    // restore every authored flag before returning to the beauty pass.
    if (useNativePlanes) {
      scene.traverse((object) => {
        if (!object.isMesh || object.castShadow !== true) return;
        restoredFrustumFlags.push([object, object.frustumCulled]);
        object.frustumCulled = false;
      });
      renderer.setRenderObjectFunction((object, ...args) => {
        if (object.castShadow === true) {
          stats.candidateCasterObjectCount += 1;
          const result = testToonLabCasterAgainstCascadePlanes(
            object,
            nativePlanes,
          );
          recordToonLabCasterCategory(sourceCategoryStats, object, result);
          if (result.exact) stats.exactSourceBoundsCount += 1;
          else stats.fallbackBoundsCount += 1;
          if (!result.intersects) {
            stats.rejectedCasterObjectCount += 1;
            return;
          }
          stats.renderedCasterObjectCount += 1;
        }
        currentRenderObjectFunction(object, ...args);
      });
    }

    try {
      // WebGPU attachment load-op clears ignore the raster scissor. Cascade 0
      // intentionally clears the complete shared atlas once; cascades 1-3
      // load it and draw only their tile. Re-clearing on every cascade would
      // leave only tile 3 populated.
      renderer.autoClear = this.cascadeIndex === 0;
      renderer.autoClearDepth = this.cascadeIndex === 0;
      renderer.setScissorTest(true);
      scene.name = `ToonLab Main Shadow Atlas Cascade ${this.cascadeIndex}`;
      renderer.render(scene, shadow.camera);
      stats.phase = 'rendered';
    } finally {
      scene.name = currentSceneName;
      renderer.autoClear = currentAutoClear;
      renderer.autoClearDepth = currentAutoClearDepth;
      renderer.setScissorTest(currentScissorTest);
      renderer.setRenderObjectFunction(currentRenderObjectFunction);
      for (const [object, frustumCulled] of restoredFrustumFlags) {
        object.frustumCulled = frustumCulled;
      }
    }
    stats.sourceCategories = [...sourceCategoryStats.values()]
      .sort((left, right) => left.category.localeCompare(right.category));
    this.atlasState.diagnostics.cascades[this.cascadeIndex] = stats;
    this.atlasState.diagnostics.phase = this.atlasState.diagnostics.cascades
      .every((cascade) => cascade.phase === 'rendered')
      ? 'rendered'
      : 'rendering';
  }
}

/** Return a deterministic, JSON-safe snapshot of the live atlas/culling pass. */
export function snapshotToonLabShadowDiagnostics(csm) {
  const state = csm?._toonLabAtlasState;
  if (!state?.diagnostics) {
    throw new TypeError('A ToonLabCsmShadowNode is required.');
  }
  const diagnostics = state.diagnostics;
  return Object.freeze({
    atlasAllocated: state.renderTarget !== null,
    atlasResolution: diagnostics.atlasResolution,
    cascadeCount: diagnostics.cascadeCount,
    cascades: Object.freeze(diagnostics.cascades.map((cascade) => Object.freeze({
      ...cascade,
      slice: cascade.slice ? Object.freeze({ ...cascade.slice }) : undefined,
    }))),
    depthBufferBits: diagnostics.depthBufferBits,
    depthTextureType: diagnostics.depthTextureType ?? null,
    nativeFrameExact: Boolean(diagnostics.nativeFrameExact),
    phase: diagnostics.phase ?? 'not-allocated',
    sharedAtlas: diagnostics.sharedAtlas === true,
    tileResolution: diagnostics.tileResolution,
  });
}

/**
 * Sample the live depth16 atlas into a readable RGBA8 probe.
 *
 * WebGPU's direct render-target readback API addresses color attachments, not
 * Three's attached DepthTexture. A tiny fullscreen node pass therefore writes
 * raw depth to R and a binary non-clear marker to G. Each cascade is sampled
 * independently so atlas Y orientation cannot relabel its 2x2 slice.
 */
export async function measureToonLabShadowAtlasDepthOccupancy(
  csm,
  renderer,
  { probeResolution = 256 } = {},
) {
  const state = csm?._toonLabAtlasState;
  if (!state?.depthTexture || !state?.renderTarget) {
    throw new TypeError('A rendered ToonLab shared shadow atlas is required.');
  }
  if (!renderer?.isWebGPURenderer
      || typeof renderer.readRenderTargetPixelsAsync !== 'function') {
    throw new TypeError('ToonLab shadow-atlas occupancy requires WebGPURenderer readback.');
  }
  const resolution = Math.max(16, Math.min(
    TOONLAB_SHADOW_CONTRACT.cascadeTileResolution,
    Math.trunc(Number(probeResolution) || 256),
  ));
  const target = new THREE.RenderTarget(resolution, resolution, {
    depthBuffer: false,
    format: THREE.RGBAFormat,
    stencilBuffer: false,
    type: THREE.UnsignedByteType,
  });
  target.texture.name = 'ToonLab shadow atlas depth occupancy probe';
  const quad = new QuadMesh();
  const previousRenderTarget = renderer.getRenderTarget();
  const previousMrt = renderer.getMRT();
  const cascades = [];

  try {
    renderer.initRenderTarget(target);
    for (let cascadeIndex = 0;
      cascadeIndex < TOONLAB_SHADOW_CONTRACT.cascadeCount;
      cascadeIndex += 1) {
      const slice = computeToonLabCascadeAtlasSlice(cascadeIndex);
      const material = new NodeMaterial();
      material.name = `ToonLab cascade ${cascadeIndex} depth occupancy`;
      const tileTexel = uv().mul(
        TOONLAB_SHADOW_CONTRACT.cascadeTileResolution - 1,
      ).round().add(vec2(slice.offsetX, slice.offsetY));
      const depth = textureLoad(state.depthTexture, ivec2(tileTexel)).r;
      // WebGPU parity runs with reversedDepthBuffer=true, so the attachment
      // clear value is 0 rather than the conventional 1. Treat a texel as
      // occupied only when it differs from the renderer's actual clear
      // convention by at least half one depth16 unit. Using `depth < 1`
      // reported every reversed-depth clear texel as caster data and made the
      // runtime atlas diagnostic incapable of distinguishing an empty tile.
      const clearDepth = renderer.getClearDepth();
      const halfDepth16Unit = 0.5 / 65535;
      const occupied = clearDepth <= 0.5
        ? depth.greaterThan(float(clearDepth + halfDepth16Unit))
        : depth.lessThan(float(clearDepth - halfDepth16Unit));
      material.fragmentNode = vec4(
        depth,
        occupied.select(float(1), float(0)),
        0,
        1,
      );
      quad.material = material;
      renderer.setRenderTarget(target);
      renderer.setMRT(null);
      quad.render(renderer);
      const pixels = await renderer.readRenderTargetPixelsAsync(
        target,
        0,
        0,
        resolution,
        resolution,
      );
      const sampledTexelCount = resolution * resolution;
      const channels = Math.max(1, Math.trunc(pixels.length / sampledTexelCount));
      let nonClearSampleCount = 0;
      let minimumDepth = 1;
      let maximumOccupiedDepth = 0;
      for (let pixelIndex = 0; pixelIndex < sampledTexelCount; pixelIndex += 1) {
        const offset = pixelIndex * channels;
        const sampledDepth = Number(pixels[offset]) / 255;
        const sampleOccupied = Number(pixels[offset + Math.min(1, channels - 1)]) >= 128;
        if (!sampleOccupied) continue;
        nonClearSampleCount += 1;
        minimumDepth = Math.min(minimumDepth, sampledDepth);
        maximumOccupiedDepth = Math.max(maximumOccupiedDepth, sampledDepth);
      }
      cascades.push(Object.freeze({
        cascadeIndex,
        clearDepth,
        maximumOccupiedDepth: nonClearSampleCount ? maximumOccupiedDepth : null,
        minimumDepth: nonClearSampleCount ? minimumDepth : null,
        nonClearFraction: nonClearSampleCount / sampledTexelCount,
        nonClearSampleCount,
        probeResolution: resolution,
        sampledTexelCount,
        slice: Object.freeze({ ...slice }),
      }));
      material.dispose();
    }
  } finally {
    renderer.setRenderTarget(previousRenderTarget);
    renderer.setMRT(previousMrt);
    target.dispose();
  }

  return Object.freeze({
    atlasResolution: TOONLAB_SHADOW_CONTRACT.atlasResolution,
    cascades: Object.freeze(cascades),
    depthBufferBits: TOONLAB_SHADOW_CONTRACT.depthBufferBits,
    exact: cascades.length === TOONLAB_SHADOW_CONTRACT.cascadeCount
      && cascades.every((cascade) => cascade.nonClearSampleCount > 0),
    measurement:
      'depth16 textureLoad -> RGBA8 raw-depth/binary-occupancy probe using renderer clear-depth convention',
    reversedDepthBuffer: renderer.reversedDepthBuffer === true,
    tileResolution: TOONLAB_SHADOW_CONTRACT.cascadeTileResolution,
  });
}

/** Read one raw depth16 atlas location through WebGPU's color readback path. */
export async function sampleToonLabShadowAtlasDepth(
  csm,
  renderer,
  { u, v } = {},
) {
  const state = csm?._toonLabAtlasState;
  if (!state?.depthTexture || !state?.renderTarget) {
    throw new TypeError('A rendered ToonLab shared shadow atlas is required.');
  }
  if (!renderer?.isWebGPURenderer
      || typeof renderer.readRenderTargetPixelsAsync !== 'function') {
    throw new TypeError('ToonLab shadow-atlas sampling requires WebGPURenderer readback.');
  }
  const resolvedU = THREE.MathUtils.clamp(Number(u), 0, 1);
  const resolvedV = THREE.MathUtils.clamp(Number(v), 0, 1);
  if (!Number.isFinite(resolvedU) || !Number.isFinite(resolvedV)) {
    throw new TypeError('ToonLab shadow-atlas sample UV must be finite.');
  }
  const atlasResolution = TOONLAB_SHADOW_CONTRACT.atlasResolution;
  const texel = [
    Math.min(atlasResolution - 1, Math.floor(resolvedU * atlasResolution)),
    Math.min(atlasResolution - 1, Math.floor(resolvedV * atlasResolution)),
  ];
  const target = new THREE.RenderTarget(1, 1, {
    depthBuffer: false,
    format: THREE.RGBAFormat,
    stencilBuffer: false,
    type: THREE.UnsignedByteType,
  });
  target.texture.name = 'ToonLab shadow atlas point-depth probe';
  const material = new NodeMaterial();
  material.name = 'ToonLab shadow atlas point-depth probe';
  const depth = textureLoad(state.depthTexture, ivec2(...texel)).r;
  // Preserve all 16 source depth bits through the RGBA8 readback target. A
  // grayscale copy would silently reduce the diagnostic to eight bits and can
  // move a comparison by 257 depth16 units around a receiver boundary.
  const depth16 = floor(depth.mul(65535).add(0.5));
  const highByte = floor(depth16.div(256));
  const lowByte = depth16.sub(highByte.mul(256));
  material.fragmentNode = vec4(
    highByte.div(255),
    lowByte.div(255),
    0,
    1,
  );
  const quad = new QuadMesh(material);
  const previousRenderTarget = renderer.getRenderTarget();
  const previousMrt = renderer.getMRT();
  try {
    renderer.initRenderTarget(target);
    renderer.setRenderTarget(target);
    renderer.setMRT(null);
    quad.render(renderer);
    const pixels = await renderer.readRenderTargetPixelsAsync(target, 0, 0, 1, 1);
    const depth16Value = Number(pixels[0]) * 256 + Number(pixels[1]);
    return Object.freeze({
      atlasUv: Object.freeze([resolvedU, resolvedV]),
      depth: depth16Value / 65535,
      depth16Value,
      depthBufferBits: TOONLAB_SHADOW_CONTRACT.depthBufferBits,
      encoding: 'depth16unorm -> RG8 high/low byte',
      reversedDepthBuffer: renderer.reversedDepthBuffer === true,
      texel: Object.freeze(texel),
    });
  } finally {
    renderer.setRenderTarget(previousRenderTarget);
    renderer.setMRT(previousMrt);
    material.dispose();
    target.dispose();
  }
}

/**
 * Project one known world-space receiver into the live cascade atlas and
 * return the exact depth16 texel/reference comparison used by WebGPU.
 */
export async function probeToonLabShadowReceiver(
  csm,
  renderer,
  { cascadeIndex = null, worldPosition } = {},
) {
  if (!csm?._toonLabAtlasState || !Array.isArray(csm.lights)) {
    throw new TypeError('A ToonLabCsmShadowNode is required.');
  }
  const point = readPoint3(worldPosition, 'worldPosition');
  const spheres = csm._toonLabCascadeSpheres.map((sphere) => ({
    center: [sphere.x, sphere.y, sphere.z],
    radiusSquared: sphere.w,
  }));
  const selectedCascade = cascadeIndex === null
    ? selectToonLabCascadeIndex(point, spheres)
    : Math.trunc(Number(cascadeIndex));
  if (selectedCascade < 0 || selectedCascade >= csm.lights.length) {
    throw new RangeError('Receiver lies outside the four ToonLab shadow cascades.');
  }
  const shadow = csm.lights[selectedCascade].shadow;
  const projected = new THREE.Vector4(...point, 1).applyMatrix4(shadow.matrix);
  if (Math.abs(projected.w) < 1e-12) {
    throw new RangeError('Receiver has an invalid shadow projection W.');
  }
  const inverseW = 1 / projected.w;
  const localUv = [
    projected.x * inverseW,
    1 - projected.y * inverseW,
  ];
  const referenceDepth = projected.z * inverseW;
  const atlasUv = transformToonLabCascadeUvToAtlas(
    selectedCascade,
    localUv,
  );
  const stored = await sampleToonLabShadowAtlasDepth(csm, renderer, {
    u: atlasUv[0],
    v: atlasUv[1],
  });
  const reversedDepthBuffer = renderer.reversedDepthBuffer === true;
  const centerTapVisible = reversedDepthBuffer
    ? referenceDepth >= stored.depth
    : referenceDepth <= stored.depth;
  return Object.freeze({
    atlasUv: Object.freeze(atlasUv),
    cascadeIndex: selectedCascade,
    centerTapComparison: reversedDepthBuffer ? 'reference >= stored' : 'reference <= stored',
    centerTapVisible,
    depthDeltaReferenceMinusStored: referenceDepth - stored.depth,
    localUv: Object.freeze(localUv),
    referenceDepth,
    referenceDepth16Value: Math.round(
      THREE.MathUtils.clamp(referenceDepth, 0, 1) * 65535,
    ),
    reversedDepthBuffer,
    storedDepth: stored.depth,
    storedDepth16Value: stored.depth16Value,
    texel: stored.texel,
    worldPosition: Object.freeze(point),
  });
}

/**
 * CSM bridge using ToonLab's actual cascade volumes and receiver selection.
 *
 * Source-profile frames use native-oracle sphere/projection/depth values. Any
 * other perspective pose with the same projection still has identical view-
 * local volumes; other projections fall back to the exact recovered float32
 * conservative-sphere fitter, while retaining an explicit metadata gap for
 * ToonLab's private projection-distance adjustment.
 */
export class ToonLabCsmShadowNode extends CSMShadowNode {
  constructor(light, { lightMargin = TOONLAB_SHADOW_CONTRACT.distance } = {}) {
    super(light, {
      cascades: TOONLAB_SHADOW_CONTRACT.cascadeCount,
      customSplitsCallback: (_amount, _near, _far, result) => {
        result.push(...TOONLAB_SHADOW_CONTRACT.cascadeSplits);
      },
      lightMargin,
      maxFar: TOONLAB_SHADOW_CONTRACT.distance,
      mode: 'custom',
    });
    this.fade = false;
    this._toonLabCascadeFits = [];
    this._toonLabCascadeSpheres = Array.from(
      { length: TOONLAB_SHADOW_CONTRACT.cascadeCount },
      () => new THREE.Vector4(),
    );
    this._toonLabCascadeViewDepths = TOONLAB_SHADOW_NATIVE_ORACLE
      .cascadeViewDepths.map(([near, far]) => new THREE.Vector2(near, far));
    this._toonLabProjectionSourceExact = false;
    this._toonLabNativeFrameExact = false;
    this._toonLabAtlasState = createToonLabShadowAtlasState();
    applyToonLabShadowContract(light.shadow);
    this.userData = {
      toonLab: {
        cascadeBorder: TOONLAB_SHADOW_CONTRACT.cascadeBorder,
        cascadeSplits: [...TOONLAB_SHADOW_CONTRACT.cascadeSplits],
        conservativeEnclosingSphere: true,
        enclosingSphereIterations: TOONLAB_SHADOW_CONTRACT
          .enclosingSphereIterations,
        exactDistanceFade: true,
        exactSharedAtlas: true,
        exactSphereReceiverSelection: true,
        exactTentFilter: true,
        maxDistance: TOONLAB_SHADOW_CONTRACT.distance,
        nativeOracle: TOONLAB_SHADOW_NATIVE_ORACLE.capture,
        projectionGuardTexels: TOONLAB_SHADOW_CONTRACT
          .projectionGuardTexels,
        rasterDepthBias: { ...TOONLAB_SHADOW_CONTRACT.rasterDepthBias },
        runtimeDiagnostics: this._toonLabAtlasState.diagnostics,
        remainingRendererBridges: [
          'Native eight-plane caster culling is exact for exported Renderer.bounds; generated Terrain/detail aggregate meshes retain a conservative Three bounding-sphere fallback until their ToonLab patch bounds are represented as independent render primitives.',
          'ToonLab native projection-depth placement is oracle-exact for the supplied reference camera/sun pose; non-source camera/light poses use the recovered sphere fit plus conservative generic caster depth.',
        ],
      },
    };
  }

  _init(context) {
    super._init(context);
    const rendererReversedDepth = context.renderer.reversedDepthBuffer === true;
    this._shadowNodes = this.lights.map((light, index) => {
      // ShadowNode.renderShadow() calls LightShadow.updateMatrices() before
      // Renderer._updateCamera(). Prime the renderer convention here so the
      // first receiver shadow matrix and the first caster raster pass use the
      // same WebGPU [0,1] reversed-Z projection. Without this, frame one can
      // compare a conventional receiver reference against reversed atlas data.
      light.shadow.camera.coordinateSystem = context.renderer.coordinateSystem;
      light.shadow.camera._reversedDepth = rendererReversedDepth;
      light.shadow.camera.updateProjectionMatrix();
      applyToonLabShadowContract(light.shadow);
      light.shadow._toonLabSamplingMapSize.set(
        TOONLAB_SHADOW_CONTRACT.atlasResolution,
        TOONLAB_SHADOW_CONTRACT.atlasResolution,
      );
      light.shadow.toonLab.atlasBridge =
        'shared scissored 2x2 2048px depth16 atlas';
      light.shadow.toonLab.atlasSlice = {
        ...computeToonLabCascadeAtlasSlice(index),
      };
      light.shadow.toonLab.exactSharedAtlas = true;
      applyToonLabRasterDepthBias(light, {
        reversedDepthBuffer: rendererReversedDepth,
      });
      return new ToonLabCascadeAtlasShadowNode(
        light,
        light.shadow,
        this._toonLabAtlasState,
        index,
      );
    });
    // Prime the cloned cascade transforms and native-frame flag immediately.
    // The child ShadowNodes are visited before this CSM owner by Three's
    // per-render update list, so waiting for the normal owner update would
    // make the very first atlas submission use uninitialised light poses.
    this.updateBefore({ initialization: true });
  }

  _initCascades() {
    const { camera } = this;
    camera.updateProjectionMatrix();
    this._toonLabProjectionSourceExact = cameraMatchesToonLabSourceProjection(camera);
    const effectiveFar = this._toonLabProjectionSourceExact
      ? TOONLAB_SHADOW_NATIVE_ORACLE.effectiveShadowFar
      : Math.min(camera.far, this.maxFar);
    this._toonLabEffectiveShadowFar = effectiveFar;
    this.mainFrustum.setFromProjectionMatrix(camera.projectionMatrix, effectiveFar);

    const near = camera.near;
    const internalBreaks = TOONLAB_SHADOW_CONTRACT.cascadeSplits.map(
      (ratio) => (near + (effectiveFar - near) * ratio) / effectiveFar,
    );
    this.mainFrustum.split(internalBreaks, this.frustums);
    this._toonLabInternalBreaks = internalBreaks;
    this._toonLabCascadeViewDepths = this.frustums.map((frustum) => new THREE.Vector2(
      Math.abs(frustum.vertices.near[0].z),
      Math.abs(frustum.vertices.far[0].z),
    ));
  }

  _updateShadowBounds() {
    for (let index = 0; index < this.frustums.length; index += 1) {
      const nativeSphere = this._toonLabProjectionSourceExact
        ? TOONLAB_SHADOW_NATIVE_ORACLE.cascadeViewSpheres[index]
        : null;
      const fitted = nativeSphere
        ? {
            center: new THREE.Vector3(...nativeSphere.center),
            iterations: TOONLAB_SHADOW_CONTRACT.enclosingSphereIterations,
            radius: nativeSphere.radius,
          }
        : computeToonLabConservativeCascadeSphere(
            toonLabOrderedFrustumPoints(this.frustums[index]),
          );
      let projection = computeToonLabCascadeProjectionBounds(
        fitted.radius,
      );
      if (nativeSphere) {
        const nativeHalfExtent = TOONLAB_SHADOW_NATIVE_ORACLE
          .projection[index].halfExtent;
        projection = Object.freeze({
          ...projection,
          diameter: nativeHalfExtent * 2,
          halfExtent: nativeHalfExtent,
          texelSize: nativeHalfExtent * 2
            / TOONLAB_SHADOW_CONTRACT.cascadeTileResolution,
        });
      }
      const shadowCamera = this.lights[index].shadow.camera;
      shadowCamera.left = -projection.halfExtent;
      shadowCamera.right = projection.halfExtent;
      shadowCamera.top = projection.halfExtent;
      shadowCamera.bottom = -projection.halfExtent;
      shadowCamera.updateProjectionMatrix();
      this._toonLabCascadeFits[index] = {
        center: fitted.center,
        iterations: fitted.iterations,
        projection,
        radius: fitted.radius,
        sourceOracle: Boolean(nativeSphere),
      };
    }
  }

  _setupToonLabCullingSpheres() {
    const spheres = reference('_toonLabCascadeSpheres', 'vec4', this)
      .setGroup(renderGroup)
      .setName('toonLabCascadeCullingSpheres');
    return Fn((builder) => {
      this.setupShadowPosition(builder);
      let result = vec4(1, 1, 1, 1);
      // Reverse construction makes cascade zero win overlap, reproducing
      // ComputeCascadeIndex's weights.yzw -= weights.xyz precedence.
      for (let index = this.cascades - 1; index >= 0; index -= 1) {
        const sphere = spheres.element(index);
        const fromCenter = vec3(positionWorld).sub(sphere.xyz);
        const inside = dot(fromCenter, fromCenter).lessThan(sphere.w);
        result = inside.select(this._shadowNodes[index], result);
      }
      return result;
    })();
  }

  updateBefore(frame) {
    // TOONLAB refits its cascade culling volumes from the camera projection for
    // every shadow submission. The source camera uses TAA projection jitter,
    // while Three's base CSM computes its frusta only once unless the app
    // explicitly refreshes them. Refit before positioning/rendering each map
    // so the first post-processed frame cannot freeze an uninitialised or
    // stale projection into all four cascades.
    this.updateFrustums();
    const { camera, light } = this;
    const parent = light.parent;
    if (!camera || !parent) return;

    parent.updateWorldMatrix(true, false);
    camera.updateWorldMatrix(true, false);
    light.updateWorldMatrix(true, false);
    light.target.updateWorldMatrix(true, false);
    _toonLabParentWorldInverse.copy(parent.matrixWorld).invert();

    for (const cascadeLight of this.lights) {
      if (cascadeLight.parent === null) {
        parent.add(cascadeLight.target);
        parent.add(cascadeLight);
      }
    }

    light.getWorldPosition(_toonLabLightWorld);
    light.target.getWorldPosition(_toonLabLightTargetWorld);
    _toonLabLightDirectionWorld
      .subVectors(_toonLabLightTargetWorld, _toonLabLightWorld)
      .normalize();
    _toonLabLightOrientation
      .identity()
      .lookAt(_toonLabLightWorld, _toonLabLightTargetWorld, _toonLabUp);
    _toonLabLightOrientationInverse.copy(_toonLabLightOrientation).invert();

    const sourceNativeFrame = this._toonLabProjectionSourceExact
      && cameraMatchesToonLabSourcePose(camera)
      && lightMatchesToonLabSourceRay(_toonLabLightDirectionWorld);
    this._toonLabNativeFrameExact = sourceNativeFrame;
    this._toonLabAtlasState.nativeFrameExact = sourceNativeFrame;
    this._toonLabAtlasState.diagnostics.nativeFrameExact = sourceNativeFrame;

    for (let index = 0; index < this._toonLabCascadeFits.length; index += 1) {
      const fit = this._toonLabCascadeFits[index];
      const cascadeLight = this.lights[index];
      const shadowCamera = cascadeLight.shadow.camera;
      if (!fit) continue;

      _toonLabCascadeCenterWorld.copy(fit.center).applyMatrix4(camera.matrixWorld);
      this._toonLabCascadeSpheres[index].set(
        _toonLabCascadeCenterWorld.x,
        _toonLabCascadeCenterWorld.y,
        _toonLabCascadeCenterWorld.z,
        fit.radius * fit.radius,
      );

      _toonLabCascadeCenterLight
        .copy(_toonLabCascadeCenterWorld)
        .applyMatrix4(_toonLabLightOrientationInverse);
      _toonLabProjectionCenterLight.copy(_toonLabCascadeCenterLight);

      let depthFromNear;
      let depthSpan;
      if (sourceNativeFrame) {
        const nativeProjection = TOONLAB_SHADOW_NATIVE_ORACLE
          .projection[index];
        _toonLabProjectionCenterLight.x -= nativeProjection.sphereViewXY[0];
        _toonLabProjectionCenterLight.y -= nativeProjection.sphereViewXY[1];
        depthFromNear = nativeProjection.depthFromNear;
        depthSpan = nativeProjection.far - nativeProjection.near;
      } else {
        // The native stabilizer uses floating remainder against the guarded
        // projection texel. Preserve that stable origin for arbitrary poses;
        // caster depth stays deliberately conservative outside the oracle.
        _toonLabProjectionCenterLight.x -= (
          _toonLabProjectionCenterLight.x % fit.projection.texelSize
        );
        _toonLabProjectionCenterLight.y -= (
          _toonLabProjectionCenterLight.y % fit.projection.texelSize
        );
        const conservativeDepthExtent = fit.radius + this.lightMargin;
        depthFromNear = conservativeDepthExtent;
        depthSpan = conservativeDepthExtent * 2;
      }

      _toonLabProjectionCenterWorld
        .copy(_toonLabProjectionCenterLight)
        .applyMatrix4(_toonLabLightOrientation);
      _toonLabCascadeLightWorld
        .copy(_toonLabProjectionCenterWorld)
        .addScaledVector(_toonLabLightDirectionWorld, -depthFromNear);
      _toonLabCascadeTargetWorld.copy(_toonLabProjectionCenterWorld);
      cascadeLight.position
        .copy(_toonLabCascadeLightWorld)
        .applyMatrix4(_toonLabParentWorldInverse);
      cascadeLight.target.position
        .copy(_toonLabCascadeTargetWorld)
        .applyMatrix4(_toonLabParentWorldInverse);
      shadowCamera.near = 0;
      shadowCamera.far = depthSpan;
      shadowCamera.updateProjectionMatrix();
      cascadeLight.shadow.needsUpdate = true;
      cascadeLight.updateWorldMatrix(true, false);
      cascadeLight.target.updateWorldMatrix(true, false);
    }

    this.userData.toonLab.currentFrame = {
      exactNativeProjectionDepth: sourceNativeFrame,
      exactNativeCasterPlanes: sourceNativeFrame,
      exactProjectionProfile: this._toonLabProjectionSourceExact,
      exactSharedAtlas: true,
      exactSphereFit: this._toonLabProjectionSourceExact,
      exactSphereReceiverSelection: true,
    };
  }

  setup(builder) {
    if (this.camera === null) this._init(builder);
    // TOONLAB main-light shadow attenuation is a scalar half. Collapse Three's
    // transmitted-colour vec4 after source sphere selection.
    const cascadeShadow = this._setupToonLabCullingSpheres().r;
    return mix(
      cascadeShadow,
      float(1),
      toonLabShadowDistanceFadeNode(),
    );
  }
}

export function createToonLabCsmShadowNode(light, options) {
  return new ToonLabCsmShadowNode(light, options);
}
