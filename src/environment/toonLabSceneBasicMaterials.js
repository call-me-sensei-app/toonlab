// Source-faithful reconstruction of the opaque material families that remain
// in the supplied EnvironmentReferenceScene export:
// - ToonLab Graphs/S_Snow
// - ToonLab Graphs/S_StylizedBasic
// - ToonLab Surface/Lit (the two embedded pine snow-cover records)
//
// Graph topology comes from the supplied ToonLab material graph assets and
// renderer-generated ToonLab renderer passes. Material values and texture import
// state come exclusively from scene-manifest.json.

import * as THREE from 'three';
import { MeshPhysicalNodeMaterial } from 'three/webgpu';
import {
  TBNViewMatrix,
  abs,
  clamp,
  dot,
  float,
  fract,
  max,
  mix,
  modelPosition,
  normalViewGeometry,
  normalWorldGeometry,
  normalize,
  positionLocal,
  positionWorld,
  sin,
  texture,
  uv,
  vec2,
  vec3,
  wgslFn,
} from 'three/tsl';

import { installToonLabMaterialPassCoupling } from './toonLabMaterialPassCoupling.js';
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

export const TOONLAB_SCENE_SNOW_SHADER = 'ToonLab Graphs/S_Snow';
export const TOONLAB_SCENE_BASIC_SHADER = 'ToonLab Graphs/S_StylizedBasic';
export const TOONLAB_SCENE_SURFACE_LIT_SHADER = 'ToonLab Surface/Lit';

export const DEFAULT_TOONLAB_SCENE_BASIC_BASE_URL =
  '/assets-local/reference-environment/environment-scene';

const TOONLAB_FLOAT_EPSILON = 5.960464478e-8;

const freezePass = (name, lightMode, file, exportedSha256) => Object.freeze({
  exportedSha256,
  file,
  lightMode,
  name,
});

export const TOONLAB_SCENE_SNOW_GRAPH = Object.freeze({
  sourceEngine: 'ToonLab reference renderer',
  sourceGraph: 'Environment/Misc/Shaders/S_Snow.toonlabgraph',
  sourceGraphGuid: '5c9c4e7afa7d06f468b7ab4f51503ba1',
  sourceGraphSha256: 'cdba7750b8caa9ceda09cd9dacad8dfda7dd21989a486078b051a434eb0ffb93',
  sourceSubgraph: 'Environment/Misc/Shaders/SG_Snow.toonlabsubgraph',
  sourceSubgraphSha256: 'b90c7b780063bdc8008d58ed865d7ad36eea13a5b3e896cc2ac268f6d421be91',
  sourceMaterial: 'Environment/Misc/Materials/M_Snow.mat',
  sourceMaterialSha256: '36e9cbf0f96830313dc33610e18f8548d52ecbf69617df0d683084f379e04fc8',
  generatedForwardFullSourceSha256:
    '59290305280dcd7e8aa7143b987310844ac9540a4ccdf4c9de6418b861bafd1a',
  generatedGraphRegionSha256:
    '733d38b1774a93ae204d5247ee6d11edfd69170829b10e10cd83f0ae9cad2e10',
  generatedPasses: Object.freeze({
    forward: freezePass(
      'ForwardLit',
      'UniversalForward',
      'passes/S_Snow/sub-00-pass-00-ForwardLit.shader',
      '9468deb385efb3d041b7834fdc064a938995fa7f47fab97adf15b955f0e0921b',
    ),
    shadow: freezePass(
      'ShadowCaster',
      'ShadowCaster',
      'passes/S_Snow/sub-00-pass-02-ShadowCaster.shader',
      '608e98873075d5979086e304eaa865c370fb5c383066fd4a264205b4b7850ed1',
    ),
    depth: freezePass(
      'DepthOnly',
      'DepthOnly',
      'passes/S_Snow/sub-00-pass-04-DepthOnly.shader',
      'c6ef8fafb3c12abae12cbe39622415c827a98263e9d2cb512eaca8ad1ed2f28c',
    ),
  }),
  connectedFormula: Object.freeze({
    projectedPosition: 'AbsoluteWorldSpacePosition / _Snow_Scale',
    triplanarWeights:
      'SafePositivePow(WorldSpaceNormal,1) / dot(SafePositivePow(WorldSpaceNormal,1),1)',
    triplanarSamples: 'SnowTexture(position.zy/.xz/.xy)',
    baseColor: 'triplanar * _Snow_Tint',
    emission: 'baseColor * _Snow_Emission',
    metallic: 0,
    smoothness: '_Snow_Smoothness',
    occlusion: 1,
    normalTs: 'IN.TangentSpaceNormal',
    vertex: 'identity Position/Normal/Tangent',
  }),
  disconnected: Object.freeze([
    'SG_Snow Alpha output (S_Snow has no connected surface Alpha block)',
    '_SnowWorldAligned=0 mask branch and VertexColor.g therefore do not affect this surface',
    'material texture scale/offset (subgraph texture input uses no-scale texture struct)',
  ]),
  renderState: Object.freeze({
    alphaClip: false,
    alphaMode: 'opaque',
    cull: 'Back',
    depthTest: 'LessEqual',
    depthWrite: true,
    renderFace: 2,
    renderQueue: 2000,
  }),
});

export const TOONLAB_SCENE_STYLIZED_BASIC_GRAPH = Object.freeze({
  sourceEngine: 'ToonLab reference renderer',
  sourceGraph: 'Materials/Shaders/S_StylizedBasic.toonlabgraph',
  sourceGraphGuid: '43df769df0a455a4daaa49030aacba53',
  sourceGraphSha256: 'ff4e7d975365971441090ea6623a51d4bee0f8fb8d4a16c8f107bd32e92b330b',
  sourceMaterial: 'Environment/Foliage/Materials/MV_BeachShells.mat',
  sourceMaterialSha256: '209dab5892fe37ec451dcab16af867b7f05c98a1cac3349d3c5158cd870691b1',
  generatedForwardFullSourceSha256:
    '9160a4651679c2c23495559389d3580061ddd506dbeffb6a31d6abe702205c02',
  generatedGraphRegionSha256:
    'ebea3cdc9d3978409117777c811efe0080848b4b968fd521d3b63d5fef0a189e',
  generatedPasses: Object.freeze({
    forward: freezePass(
      'ForwardLit',
      'UniversalForward',
      'passes/S_StylizedBasic/sub-00-pass-00-ForwardLit.shader',
      'f9e19d717908b82dad0c409d0869bba22fa8017b24f2c13ba2c915e22f5af80c',
    ),
    shadow: freezePass(
      'ShadowCaster',
      'ShadowCaster',
      'passes/S_StylizedBasic/sub-00-pass-02-ShadowCaster.shader',
      'dc3771f116395760ed629b6862079e23d11a6f0435993edafcf39e2c4c504cc6',
    ),
    depth: freezePass(
      'DepthOnly',
      'DepthOnly',
      'passes/S_StylizedBasic/sub-00-pass-04-DepthOnly.shader',
      'd0f98d6a1b8f68d3b1a5db6e125de1b9da3005ea65c28aff5f4c5487e06ad8ad',
    ),
  }),
  connectedFormula: Object.freeze({
    baseColor:
      'HueNormalized(branch(_Use_Color_Texture, BaseColorTexture(UV0), _Base_Color), hue)',
    hue:
      'RandomRange(TOONLAB_GRAPH_OBJECT_POSITION.xz*10,-_Hue_Variation,+_Hue_Variation)+_Hue_Shift',
    normalTs:
      'branch(_Normal_Map, NormalStrength(UnpackNormal(NormalTexture(UV0)),_Normal_Strength),float3(0,0,1))',
    emission: 'baseColor * _Emissive',
    metallic: 'branch(_Metallic_Map, MetallicTexture(UV0), _Metallic).r',
    smoothness: '1 - branch(_Roughness_Map, RoughnessTexture(UV0), _Roughness).r',
    occlusion: 1,
    vertex: 'identity Position/Normal/Tangent',
  }),
  disconnected: Object.freeze([
    'material texture scale/offset (all four graph texture properties use no-scale texture structs)',
  ]),
  renderState: Object.freeze({
    alphaClip: false,
    alphaMode: 'opaque',
    cull: 'Back',
    depthTest: 'LessEqual',
    depthWrite: true,
    renderFace: 2,
    renderQueue: 2000,
  }),
});

export const TOONLAB_SCENE_SURFACE_LIT_SOURCE = Object.freeze({
  sourceEngine: 'ToonLab reference renderer',
  shader: 'Packages/com.toonlab.render-pipelines.universal/Shaders/Lit.shader',
  shaderGuid: '933532a4fcc9baf4fa0491de14d08ed7',
  shaderSha256: 'd012fadd60a3e5c19a57d501a3e010ad0ee6067465fee135a421afea08b4da45',
  litInput: 'Packages/com.toonlab.render-pipelines.universal/Shaders/LitInput.hlsl',
  litInputSha256: '0a755082971cd052ea2c3595feefb28d5357db6b47ea406f592ce9d9ca40f0a6',
  forwardInclude: 'Packages/com.toonlab.render-pipelines.universal/Shaders/LitForwardPass.hlsl',
  forwardIncludeSha256: '272b5be87520963b145ecfc690499319cabaf1a2c9f3c97e1c032cd4beef8192',
  shadowInclude: 'Packages/com.toonlab.render-pipelines.universal/Shaders/ShadowCasterPass.hlsl',
  shadowIncludeSha256: '7db96c7b79c5c5ba306708efd96a74ab7799d13f0426f2c8f2fc34aeabc350e6',
  depthInclude: 'Packages/com.toonlab.render-pipelines.universal/Shaders/DepthOnlyPass.hlsl',
  depthIncludeSha256: 'e85742944bcb2d9fdc03a742e70232021dde254338dca18020ea0c71b1a04826',
  activePasses: Object.freeze({
    forward: Object.freeze({ index: 0, lightMode: 'UniversalForward', name: 'ForwardLit' }),
    shadow: Object.freeze({ index: 1, lightMode: 'ShadowCaster', name: 'ShadowCaster' }),
    depth: Object.freeze({ index: 3, lightMode: 'DepthOnly', name: 'DepthOnly' }),
  }),
  connectedFormula: Object.freeze({
    albedo: 'SampleAlbedoAlpha(_BaseMap) * _BaseColor; no BaseMap keyword => white * color',
    metallic: '_Metallic (no _METALLICSPECGLOSSMAP)',
    smoothness: '_Smoothness (no _METALLICSPECGLOSSMAP)',
    normalTs: 'float3(0,0,1) (no _NORMALMAP)',
    emission: '0 (no _EMISSION)',
    occlusion: '1 (no _OCCLUSIONMAP)',
    clearCoat: '0',
    vertex: 'identity authored Position',
  }),
});

const toonLabSceneBasicHueNormalized = wgslFn(`
  fn toonLabSceneBasicHueNormalized(inputColor: vec3<f32>, offset: f32) -> vec3<f32> {
    let k = vec4<f32>(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    let p = mix(
      vec4<f32>(inputColor.b, inputColor.g, k.w, k.z),
      vec4<f32>(inputColor.g, inputColor.b, k.x, k.y),
      step(inputColor.b, inputColor.g)
    );
    let q = mix(
      vec4<f32>(p.x, p.y, p.w, inputColor.r),
      vec4<f32>(inputColor.r, p.y, p.z, p.x),
      step(p.x, inputColor.r)
    );
    let difference = q.x - min(q.w, q.y);
    let epsilon = 1e-4;
    let value = select(q.x + epsilon, q.x, difference == 0.0);
    let hsvBase = vec3<f32>(
      abs(q.z + (q.w - q.y) / (6.0 * difference + epsilon)),
      difference / (q.x + epsilon),
      value
    );
    var hue = hsvBase.x + offset;
    hue = select(hue, hue + 1.0, hue < 0.0);
    hue = select(hue, hue - 1.0, hue > 1.0);
    let hsv = vec3<f32>(hue, hsvBase.y, hsvBase.z);
    let k2 = vec4<f32>(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    let p2 = abs(fract(hsv.xxx + k2.xyz) * 6.0 - k2.www);
    return hsv.z * mix(k2.xxx, clamp(p2 - k2.xxx, vec3<f32>(0.0), vec3<f32>(1.0)), hsv.y);
  }
`);

function finite(value, fallback = Number.NaN) {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function requiredProperty(properties, name, materialName) {
  const property = properties.get(name);
  if (!property) throw new Error(`${materialName} is missing required property ${name}.`);
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

function optionalTextureIndex(properties, name, materialName) {
  requiredProperty(properties, name, materialName);
  return readToonLabTextureIndex(properties, name);
}

function requiredTextureIndex(properties, name, materialName) {
  const index = optionalTextureIndex(properties, name, materialName);
  if (index < 0) throw new Error(`${materialName}.${name} has no exported texture.`);
  return index;
}

function requiredTextureRecord(manifest, textureIndex, materialName) {
  const record = manifest?.textures?.[textureIndex];
  if (!record?.exactSourceCopy || record?.importer?.present !== true) {
    throw new Error(
      `${materialName} texture ${textureIndex} lacks an exact copy or texture import record.`,
    );
  }
  return record;
}

function textureRecordSummary(manifest, textureIndex, materialName) {
  const record = requiredTextureRecord(manifest, textureIndex, materialName);
  return {
    assetGuid: record.asset?.guid ?? null,
    dimensions: [record.width, record.height],
    exactSourceCopy: record.exactSourceCopy,
    format: record.format,
    importer: { ...record.importer },
    index: textureIndex,
    name: record.name,
  };
}

function sourceRenderRecord(record) {
  return {
    doubleSidedGI: record.doubleSidedGI === true,
    enableInstancing: record.enableInstancing === true,
    globalIlluminationFlags: record.globalIlluminationFlags ?? null,
    keywords: [...(record.keywords ?? [])],
    renderQueue: record.renderQueue,
  };
}

function setOpaqueSurfaceState(material) {
  material.transparent = false;
  material.blending = THREE.NoBlending;
  material.depthTest = true;
  material.depthWrite = true;
  material.alphaToCoverage = false;
  material.premultipliedAlpha = false;
}

function installOpaquePassesAndLighting(material, shaderName) {
  installToonLabMaterialPassCoupling(material, {
    positionMode: 'authored',
    positionNode: positionLocal,
    shaderName,
  });
  installToonLabSurfaceLighting(material, {
    inputAdapter: 'toonlab-stage',
    workflow: 'metallic',
  });
}

/** Exact CPU mirror of the Triplanar node's SafePositivePow(..., 1) weights. */
export function evaluateToonLabSnowTriplanarWeights(normal) {
  if ((!Array.isArray(normal) && !ArrayBuffer.isView(normal)) || normal.length < 3) {
    throw new TypeError('Snow triplanar normal must contain three components.');
  }
  const safe = Array.from(normal).slice(0, 3).map((channel) => (
    Math.max(Math.abs(finite(channel)), TOONLAB_FLOAT_EPSILON)
  ));
  const sum = safe[0] + safe[1] + safe[2];
  return Object.freeze(safe.map((channel) => channel / sum));
}

/** CPU mirror of ToonLab graph ToonLabRandomRange_float. */
export function evaluateToonLabBasicRandomRange(seed, minValue, maxValue) {
  if ((!Array.isArray(seed) && !ArrayBuffer.isView(seed)) || seed.length < 2) {
    throw new TypeError('RandomRange seed must contain two components.');
  }
  const dotValue = finite(seed[0]) * 12.9898 + finite(seed[1]) * 78.233;
  const raw = Math.sin(dotValue) * 43758.5453;
  const random = raw - Math.floor(raw);
  const minimum = finite(minValue);
  const maximum = finite(maxValue);
  return minimum + (maximum - minimum) * random;
}

/** CPU mirror of ToonLab graph ToonLabHue_Normalized_float. */
export function evaluateToonLabBasicHueNormalized(color, offset = 0) {
  if ((!Array.isArray(color) && !ArrayBuffer.isView(color)) || color.length < 3) {
    throw new TypeError('Hue input must contain three components.');
  }
  const [r, g, b] = Array.from(color).slice(0, 3).map((value) => finite(value));
  const k = [0, -1 / 3, 2 / 3, -1];
  const p = b <= g ? [g, b, k[0], k[1]] : [b, g, k[3], k[2]];
  const q = p[0] <= r
    ? [r, p[1], p[2], p[0]]
    : [p[0], p[1], p[3], r];
  const difference = q[0] - Math.min(q[3], q[1]);
  const epsilon = 1e-4;
  const value = difference === 0 ? q[0] : q[0] + epsilon;
  let hue = Math.abs(q[2] + (q[3] - q[1]) / (6 * difference + epsilon))
    + finite(offset, 0);
  if (hue < 0) hue += 1;
  else if (hue > 1) hue -= 1;
  const saturation = difference / (q[0] + epsilon);
  const channel = (shift) => {
    const wrapped = hue + shift - Math.floor(hue + shift);
    const p2 = Math.abs(wrapped * 6 - 3);
    return value * (1 + (Math.min(1, Math.max(0, p2 - 1)) - 1) * saturation);
  };
  return Object.freeze([channel(0), channel(2 / 3), channel(1 / 3)]);
}

export function resolveToonLabSceneSnowInputs(materialRecord) {
  if (materialRecord?.shaderName !== TOONLAB_SCENE_SNOW_SHADER) {
    throw new TypeError(`Expected ${TOONLAB_SCENE_SNOW_SHADER}.`);
  }
  const materialName = materialRecord.name ?? `material-${materialRecord.index ?? 'unknown'}`;
  const properties = indexToonLabMaterialProperties(materialRecord);
  return Object.freeze({
    emission: requiredScalar(properties, '_Snow_Emission', materialName),
    materialIndex: materialRecord.index,
    materialName,
    renderQueue: materialRecord.renderQueue,
    scale: requiredScalar(properties, '_Snow_Scale', materialName),
    smoothness: requiredScalar(properties, '_Snow_Smoothness', materialName),
    textureIndex: requiredTextureIndex(properties, '_Snow_Texture', materialName),
    tint: Object.freeze(requiredVector(properties, '_Snow_Tint', materialName)),
  });
}

export function resolveToonLabSceneBasicInputs(materialRecord) {
  if (materialRecord?.shaderName !== TOONLAB_SCENE_BASIC_SHADER) {
    throw new TypeError(`Expected ${TOONLAB_SCENE_BASIC_SHADER}.`);
  }
  const materialName = materialRecord.name ?? `material-${materialRecord.index ?? 'unknown'}`;
  const properties = indexToonLabMaterialProperties(materialRecord);
  return Object.freeze({
    baseColor: Object.freeze(requiredVector(properties, '_Base_Color', materialName)),
    baseColorTextureIndex: optionalTextureIndex(properties, '_Base_Color_Texture', materialName),
    emissive: requiredScalar(properties, '_Emissive', materialName),
    hueShift: requiredScalar(properties, '_Hue_Shift', materialName),
    hueVariation: requiredScalar(properties, '_Hue_Variation', materialName),
    materialIndex: materialRecord.index,
    materialName,
    metallic: requiredScalar(properties, '_Metallic', materialName),
    metallicMap: requiredScalar(properties, '_Metallic_Map', materialName) >= 0.5,
    metallicTextureIndex: optionalTextureIndex(properties, '_Metallic_Texture', materialName),
    normalMap: requiredScalar(properties, '_Normal_Map', materialName) >= 0.5,
    normalStrength: requiredScalar(properties, '_Normal_Strength', materialName),
    normalTextureIndex: optionalTextureIndex(properties, '_Normal_Texture', materialName),
    renderQueue: materialRecord.renderQueue,
    roughness: requiredScalar(properties, '_Roughness', materialName),
    roughnessMap: requiredScalar(properties, '_Roughness_Map', materialName) >= 0.5,
    roughnessTextureIndex: optionalTextureIndex(properties, '_Roughness_Texture', materialName),
    useColorTexture: requiredScalar(properties, '_Use_Color_Texture', materialName) >= 0.5,
  });
}

export function resolveToonLabSceneSurfaceLitInputs(materialRecord) {
  if (materialRecord?.shaderName !== TOONLAB_SCENE_SURFACE_LIT_SHADER) {
    throw new TypeError(`Expected ${TOONLAB_SCENE_SURFACE_LIT_SHADER}.`);
  }
  const materialName = materialRecord.name ?? `material-${materialRecord.index ?? 'unknown'}`;
  const properties = indexToonLabMaterialProperties(materialRecord);
  const values = {
    alphaClip: requiredScalar(properties, '_AlphaClip', materialName),
    alphaToMask: requiredScalar(properties, '_AlphaToMask', materialName),
    baseColor: Object.freeze(requiredVector(properties, '_BaseColor', materialName)),
    baseMapIndex: optionalTextureIndex(properties, '_BaseMap', materialName),
    blend: requiredScalar(properties, '_Blend', materialName),
    clearCoatMask: requiredScalar(properties, '_ClearCoatMask', materialName),
    clearCoatSmoothness: requiredScalar(properties, '_ClearCoatSmoothness', materialName),
    cull: requiredScalar(properties, '_Cull', materialName),
    depthWrite: requiredScalar(properties, '_ZWrite', materialName),
    emissionColor: Object.freeze(requiredVector(properties, '_EmissionColor', materialName)),
    emissionMapIndex: optionalTextureIndex(properties, '_EmissionMap', materialName),
    environmentReflections: requiredScalar(properties, '_EnvironmentReflections', materialName),
    materialIndex: materialRecord.index,
    materialName,
    metallic: requiredScalar(properties, '_Metallic', materialName),
    metallicGlossMapIndex: optionalTextureIndex(properties, '_MetallicGlossMap', materialName),
    normalMapIndex: optionalTextureIndex(properties, '_BumpMap', materialName),
    occlusionMapIndex: optionalTextureIndex(properties, '_OcclusionMap', materialName),
    receiveShadows: requiredScalar(properties, '_ReceiveShadows', materialName),
    renderQueue: materialRecord.renderQueue,
    smoothness: requiredScalar(properties, '_Smoothness', materialName),
    specularColor: Object.freeze(requiredVector(properties, '_SpecColor', materialName)),
    specularHighlights: requiredScalar(properties, '_SpecularHighlights', materialName),
    surface: requiredScalar(properties, '_Surface', materialName),
    workflowMode: requiredScalar(properties, '_WorkflowMode', materialName),
  };
  const unsupported = [
    ['_Surface', values.surface, 0],
    ['_Blend', values.blend, 0],
    ['_Cull', values.cull, 2],
    ['_AlphaClip', values.alphaClip, 0],
    ['_AlphaToMask', values.alphaToMask, 0],
    ['_ZWrite', values.depthWrite, 1],
    ['_WorkflowMode', values.workflowMode, 1],
  ].filter(([, actual, expected]) => actual !== expected);
  const activeMaps = [
    ['_BaseMap', values.baseMapIndex],
    ['_MetallicGlossMap', values.metallicGlossMapIndex],
    ['_BumpMap', values.normalMapIndex],
    ['_OcclusionMap', values.occlusionMapIndex],
    ['_EmissionMap', values.emissionMapIndex],
  ].filter(([, index]) => index >= 0);
  if (unsupported.length || activeMaps.length || (materialRecord.keywords ?? []).length) {
    throw new Error(
      `${materialName} no longer matches the audited opaque, map-free ToonLab Surface/Lit records.`,
    );
  }
  return Object.freeze(values);
}

export function isToonLabSceneBasicMaterialRecord(materialRecord) {
  return materialRecord?.shaderName === TOONLAB_SCENE_SNOW_SHADER
    || materialRecord?.shaderName === TOONLAB_SCENE_BASIC_SHADER
    || materialRecord?.shaderName === TOONLAB_SCENE_SURFACE_LIT_SHADER;
}

function toonLabSourceWorldPosition() {
  return vec3(positionWorld.x, positionWorld.y, positionWorld.z.negate());
}

function toonLabSourceWorldNormal() {
  return vec3(
    normalWorldGeometry.x,
    normalWorldGeometry.y,
    normalWorldGeometry.z.negate(),
  );
}

/** Build the exact opaque S_Snow graph used by M_Snow. */
export async function buildToonLabSceneSnowMaterial(
  materialRecord,
  manifest,
  {
    baseUrl = DEFAULT_TOONLAB_SCENE_BASIC_BASE_URL,
    textureLoader,
  } = {},
) {
  const values = resolveToonLabSceneSnowInputs(materialRecord);
  if (!(values.scale > 0)) throw new RangeError(`${values.materialName} snow scale must be positive.`);
  const snowMap = await loadToonLabSceneTexture(
    manifest,
    values.textureIndex,
    { baseUrl, ...(textureLoader ? { textureLoader } : {}) },
  );
  if (!snowMap) throw new Error(`${values.materialName} could not load its snow texture.`);

  const projected = toonLabSourceWorldPosition().div(values.scale);
  const safeNormal = max(abs(toonLabSourceWorldNormal()), vec3(TOONLAB_FLOAT_EPSILON));
  const weights = safeNormal.div(
    safeNormal.x.add(safeNormal.y).add(safeNormal.z),
  );
  const snowTexture = texture(snowMap);
  const triplanar = snowTexture.sample(projected.zy).rgb.mul(weights.x)
    .add(snowTexture.sample(projected.xz).rgb.mul(weights.y))
    .add(snowTexture.sample(projected.xy).rgb.mul(weights.z));
  const tintLinear = linearizeToonLabColorProperty(values.tint);
  const colorNode = triplanar.mul(vec3(...tintLinear.slice(0, 3)));

  const material = new MeshPhysicalNodeMaterial();
  material.name = `ToonLab:${values.materialName}`;
  setOpaqueSurfaceState(material);
  material.colorNode = colorNode;
  material.emissiveNode = colorNode.mul(values.emission);
  material.metalnessNode = float(0);
  material.roughnessNode = clamp(float(1).sub(values.smoothness), 0, 1);
  material.normalNode = normalViewGeometry;
  material.aoNode = float(1);
  material.userData.toonLabMaterial = {
    contract: { ...TOONLAB_SCENE_SNOW_GRAPH.connectedFormula },
    exactInputs: true,
    graphExact: true,
    linearColorProperties: { snowTint: [...tintLinear] },
    materialIndex: values.materialIndex,
    reconstruction: 'toonlab-scene-s-snow',
    sourceMaterial: values.materialName,
    sourceShader: TOONLAB_SCENE_SNOW_SHADER,
  };
  material.userData.toonLabSceneBasic = {
    family: 'snow',
    generatedPasses: TOONLAB_SCENE_SNOW_GRAPH.generatedPasses,
    materialGuid: materialRecord.asset?.guid ?? null,
    parameters: values,
    renderState: sourceRenderRecord(materialRecord),
    source: TOONLAB_SCENE_SNOW_GRAPH,
    texture: textureRecordSummary(manifest, values.textureIndex, values.materialName),
  };
  material.userData.toonLabNormalIntegration =
    createToonLabNormalIntegrationMetadata({
      coordinateZSign: -1,
      decode: 'geometry-only; generated NormalTS is IN.TangentSpaceNormal',
      family: 'toonlab-environment-scene-snow',
      textureFlipY: true,
    });
  installOpaquePassesAndLighting(material, TOONLAB_SCENE_SNOW_SHADER);
  return material;
}

/** Build the exact S_StylizedBasic graph used by MV_BeachShells. */
export async function buildToonLabSceneStylizedBasicMaterial(
  materialRecord,
  manifest,
  {
    baseUrl = DEFAULT_TOONLAB_SCENE_BASIC_BASE_URL,
    geometryHints = {},
    textureLoader,
  } = {},
) {
  const values = resolveToonLabSceneBasicInputs(materialRecord);
  const requestedTextures = [
    values.useColorTexture ? ['baseColor', values.baseColorTextureIndex] : null,
    values.metallicMap ? ['metallic', values.metallicTextureIndex] : null,
    values.roughnessMap ? ['roughness', values.roughnessTextureIndex] : null,
    values.normalMap ? ['normal', values.normalTextureIndex] : null,
  ].filter(Boolean);
  for (const [label, index] of requestedTextures) {
    if (index < 0) throw new Error(`${values.materialName} enables ${label} without a texture.`);
    requiredTextureRecord(manifest, index, values.materialName);
  }
  const loadedEntries = await Promise.all(requestedTextures.map(async ([label, index]) => [
    label,
    await loadToonLabSceneTexture(
      manifest,
      index,
      { baseUrl, ...(textureLoader ? { textureLoader } : {}) },
    ),
  ]));
  const maps = Object.fromEntries(loadedEntries);
  if (loadedEntries.some(([, map]) => !map)) {
    throw new Error(`${values.materialName} could not load every enabled graph texture.`);
  }

  const sourceUv = geometryHints.uvNode ?? uv();
  const baseColorLinear = linearizeToonLabColorProperty(values.baseColor);
  let colorNode = values.useColorTexture
    ? texture(maps.baseColor).sample(sourceUv).rgb
    : vec3(...baseColorLinear.slice(0, 3));
  const objectPosition = geometryHints.objectPositionNode ?? modelPosition;
  const sourceObjectSeed = vec2(objectPosition.x, objectPosition.z.negate()).mul(10);
  const random = fract(sin(dot(sourceObjectSeed, vec2(12.9898, 78.233))).mul(43758.5453));
  const hueOffset = mix(
    float(-values.hueVariation),
    float(values.hueVariation),
    random,
  ).add(values.hueShift);
  colorNode = toonLabSceneBasicHueNormalized(colorNode, hueOffset);

  const metallicNode = values.metallicMap
    ? texture(maps.metallic).sample(sourceUv).r
    : float(values.metallic);
  const roughnessSource = values.roughnessMap
    ? texture(maps.roughness).sample(sourceUv).r
    : float(values.roughness);
  const hasTangents = geometryHints.hasTangents === true;
  let normalNode = normalViewGeometry;
  let flipGreenChannel = null;
  if (values.normalMap && hasTangents) {
    flipGreenChannel = maps.normal.userData?.toonLabTexture?.flipGreenChannel === true;
    const decoded = decodeToonLabNormalNode(
      texture(maps.normal).sample(sourceUv).rgb,
      flipGreenChannel ? -1 : 1,
    );
    normalNode = normalize(TBNViewMatrix.mul(
      applyToonLabNormalStrengthNode(decoded, values.normalStrength),
    ));
  }

  const material = new MeshPhysicalNodeMaterial();
  material.name = `ToonLab:${values.materialName}`;
  setOpaqueSurfaceState(material);
  material.colorNode = colorNode;
  material.emissiveNode = colorNode.mul(values.emissive);
  material.metalnessNode = metallicNode;
  material.roughnessNode = float(1).sub(roughnessSource);
  material.normalNode = normalNode;
  material.aoNode = float(1);
  material.userData.toonLabMaterial = {
    contract: { ...TOONLAB_SCENE_STYLIZED_BASIC_GRAPH.connectedFormula },
    exactInputs: true,
    graphExact: !values.normalMap || hasTangents,
    linearColorProperties: { baseColor: [...baseColorLinear] },
    materialIndex: values.materialIndex,
    reconstruction: 'toonlab-scene-s-stylized-basic',
    sourceMaterial: values.materialName,
    sourceShader: TOONLAB_SCENE_BASIC_SHADER,
  };
  material.userData.toonLabSceneBasic = {
    family: 'stylized-basic',
    generatedPasses: TOONLAB_SCENE_STYLIZED_BASIC_GRAPH.generatedPasses,
    geometryCapabilities: { hasTangents },
    materialGuid: materialRecord.asset?.guid ?? null,
    parameters: values,
    renderState: sourceRenderRecord(materialRecord),
    source: TOONLAB_SCENE_STYLIZED_BASIC_GRAPH,
    textures: Object.fromEntries(requestedTextures.map(([label, index]) => [
      label,
      textureRecordSummary(manifest, index, values.materialName),
    ])),
  };
  material.userData.toonLabNormalIntegration =
    createToonLabNormalIntegrationMetadata({
      coordinateZSign: -1,
      decode: values.normalMap
        ? hasTangents
          ? 'RG + importer green transform + reconstructed positive Z; ToonLab graph Normal Strength'
          : 'geometry-only fallback: active normal map but no tangent attribute'
        : 'geometry-only; _Normal_Map=false selects float3(0,0,1)',
      family: 'toonlab-environment-scene-stylized-basic',
      flipGreenChannel,
      textureFlipY: true,
    });
  installOpaquePassesAndLighting(material, TOONLAB_SCENE_BASIC_SHADER);
  return material;
}

/** Build either supplied map-free, opaque ToonLab Surface/Lit pine snow-cover material. */
export function buildToonLabSceneSurfaceLitMaterial(materialRecord) {
  const values = resolveToonLabSceneSurfaceLitInputs(materialRecord);
  const baseColorLinear = linearizeToonLabColorProperty(values.baseColor);
  const material = new MeshPhysicalNodeMaterial();
  material.name = `ToonLab:${values.materialName}`;
  setOpaqueSurfaceState(material);
  material.colorNode = vec3(...baseColorLinear.slice(0, 3));
  material.emissiveNode = vec3(0);
  material.metalnessNode = float(values.metallic);
  material.roughnessNode = clamp(float(1).sub(values.smoothness), 0, 1);
  material.normalNode = normalViewGeometry;
  material.aoNode = float(1);
  material.specularIntensityNode = float(1);
  material.userData.toonLabMaterial = {
    contract: { ...TOONLAB_SCENE_SURFACE_LIT_SOURCE.connectedFormula },
    exactInputs: true,
    graphExact: true,
    linearColorProperties: { baseColor: [...baseColorLinear] },
    materialIndex: values.materialIndex,
    reconstruction: 'toonlab-surface-lit-map-free-opaque',
    sourceMaterial: values.materialName,
    sourceShader: TOONLAB_SCENE_SURFACE_LIT_SHADER,
  };
  material.userData.toonLabSceneBasic = {
    activePasses: TOONLAB_SCENE_SURFACE_LIT_SOURCE.activePasses,
    family: 'toonlab-lit',
    materialGuid: materialRecord.asset?.guid ?? null,
    parameters: values,
    renderState: sourceRenderRecord(materialRecord),
    source: TOONLAB_SCENE_SURFACE_LIT_SOURCE,
  };
  material.userData.toonLabNormalIntegration =
    createToonLabNormalIntegrationMetadata({
      coordinateZSign: -1,
      decode: 'geometry-only; _NORMALMAP keyword absent selects float3(0,0,1)',
      family: 'toonlab-environment-scene-toonlab-lit',
      textureFlipY: null,
    });
  installOpaquePassesAndLighting(material, TOONLAB_SCENE_SURFACE_LIT_SHADER);
  return material;
}

/** Dispatch one of the three audited opaque scene families. */
export async function buildToonLabSceneBasicMaterial(
  materialRecord,
  manifest,
  options = {},
) {
  if (materialRecord?.shaderName === TOONLAB_SCENE_SNOW_SHADER) {
    return buildToonLabSceneSnowMaterial(materialRecord, manifest, options);
  }
  if (materialRecord?.shaderName === TOONLAB_SCENE_BASIC_SHADER) {
    return buildToonLabSceneStylizedBasicMaterial(materialRecord, manifest, options);
  }
  if (materialRecord?.shaderName === TOONLAB_SCENE_SURFACE_LIT_SHADER) {
    return buildToonLabSceneSurfaceLitMaterial(materialRecord);
  }
  throw new TypeError(`Unsupported ToonLab scene basic shader: ${materialRecord?.shaderName ?? 'missing'}.`);
}
