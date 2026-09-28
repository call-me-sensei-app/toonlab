// Manifest-driven reconstruction of ToonLab's S_Leaves and S_Bark
// ToonLab Graphs for the exported EnvironmentReferenceScene scene.
//
// This module is intentionally record-driven: every material switch, scalar,
// color, and texture comes from scene-manifest.json. The ToonLab graph edge
// topology remains the authority when an exposed/serialized property is not
// connected to a master output.

import * as THREE from 'three';
import { MeshPhysicalNodeMaterial } from 'three/webgpu';
import {
  TBNViewMatrix,
  abs,
  cameraPosition,
  clamp,
  distance,
  dot,
  faceDirection,
  float,
  fract,
  max,
  mix,
  modelPosition,
  modelWorldMatrix,
  modelWorldMatrixInverse,
  normalViewGeometry,
  normalWorldGeometry,
  normalize,
  positionLocal,
  positionWorld,
  pow,
  screenCoordinate,
  sin,
  texture,
  uv,
  vec2,
  vec3,
  vec4,
  vertexColor,
  wgslFn,
} from 'three/tsl';
import { assertToonLabTextureUploadReady } from './toonLabTextureReadiness.js';

import {
  applyToonLabNormalStrengthNode,
  createToonLabNormalIntegrationMetadata,
  decodeToonLabNormalNode,
} from './toonLabNormalIntegration.js';
import { installToonLabMaterialPassCoupling } from './toonLabMaterialPassCoupling.js';
import { installToonLabSurfaceLighting } from './toonLabSurfaceLighting.js';

export const DEFAULT_TOONLAB_SCENE_BASE_URL =
  '/assets-local/reference-environment/environment-scene';

export const TOONLAB_SCENE_TREE_SHADERS = Object.freeze({
  bark: 'ToonLab Graphs/S_Bark',
  leaves: 'ToonLab Graphs/S_Leaves',
});

export const TOONLAB_SCENE_TREE_SOURCE = Object.freeze({
  bark: Object.freeze({
    graph: 'Assets/ToonLab/Environment/Trees/Shaders/S_Bark.toonlabgraph',
    graphGuid: '016550df8fe3d84418b52fbdc767f495',
    graphSha256: '0ab87ac5464f9b3d4e4090b2299cc4df55c0155ff79458e62b91a84829ff2689',
    snowSubgraph: 'Assets/ToonLab/Environment/Misc/Shaders/SG_Snow.toonlabsubgraph',
    snowSubgraphGuid: '6a05f3a127ccc3a48b05e65c3bbe517f',
    snowSubgraphSha256: 'b90c7b780063bdc8008d58ed865d7ad36eea13a5b3e896cc2ac268f6d421be91',
  }),
  cameraDither: Object.freeze({
    graph: 'Assets/ToonLab/Materials/Shaders/SG_CameraDithering.toonlabsubgraph',
    graphGuid: '0a5473d7af329294c8f319a1acc7f8cb',
    graphSha256: '95586ca209f762a059f221bbccab74df9685c4cddc997121596d4578bf1f45dd',
  }),
  leaves: Object.freeze({
    graph: 'Assets/ToonLab/Environment/Trees/Shaders/S_Leaves.toonlabgraph',
    graphGuid: 'a65bec4bef9f96c4c9dde8ad2a20a99a',
    graphSha256: '94840ad60699adc079acb523e3b6b0ce82ef2e791f39043c71dd23195577ba62',
    singleMaterialSubgraph:
      'Assets/ToonLab/Environment/Trees/Shaders/SG_SingleMaterialTree.toonlabsubgraph',
    singleMaterialSubgraphGuid: 'cab5ae69164c8a04d9406ba069305408',
    singleMaterialSubgraphSha256:
      '925238411f958e3a0b308335f076d541d6bc5bc5ffeb8400f989a7cfe6010af0',
  }),
});

const TOONLAB_CONTRAST_MIDPOINT = 0.217637640824031;
const TOONLAB_FLOAT_EPSILON = 5.960464478e-8;
const DEFAULT_TEXTURE_LOADER = new THREE.TextureLoader();
const textureCaches = new WeakMap();

/**
 * Convert one serialized ToonLab graph ColorMode.Default property into the
 * linear working-space value placed in ToonLab's material CBUFFER.
 *
 * ToonLabSceneExport records Material.GetColor(), i.e. the inspector/sRGB
 * property value. Unlike an sRGB texture sample, a TSL numeric constant has
 * no automatic decode, so the conversion has to happen before graph math.
 */
export function linearizeToonLabSceneTreeColorProperty(value) {
  const source = Array.isArray(value) || ArrayBuffer.isView(value)
    ? Array.from(value)
    : [];
  return [
    finite(source[0], 0),
    finite(source[1], 0),
    finite(source[2], 0),
  ].map((channel) => (
    channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4
  ));
}

function toonLabTreeColorPropertyNode(value) {
  return vec3(...linearizeToonLabSceneTreeColorProperty(value));
}

const LEAF_DEFAULTS = Object.freeze({
  alphaClip: 0.4,
  colorTexture: false,
  emissiveStrength: 0.1,
  gradientColor: Object.freeze([0, 0, 0, 0]),
  gradientOffset: 0,
  gradientStretch: 1,
  hueShift: 0,
  hueVariation: 0,
  lod: false,
  mainColor: Object.freeze([0.1177983284, 1, 0, 1]),
  maxDistanceFade: 3,
  minDistanceFade: 2,
  objectDistanceForFade: false,
  singleMaterialLod: false,
  smoothness: 0,
  specularColor: Object.freeze([0, 0, 0, 0]),
  sssBrightness: 0,
  sssColor: Object.freeze([0, 0, 0, 0]),
  sssOffset: 0,
  twoSidedSign: true,
  useGradient: false,
  useWind: true,
  useWorldGradient: false,
  windDirection: Object.freeze([1, 0, 0, 0]),
  windIntensity: 1.5,
  windScale: 2,
  windSpeed: 0.25,
  worldGradientContrast: 0,
  worldGradientSize: 400,
});

const BARK_DEFAULTS = Object.freeze({
  emissiveStrength: 0.1,
  moss: false,
  mossColor: Object.freeze([0.3333333433, 0.4078431726, 0.2470588386, 1]),
  mossColor2: Object.freeze([0.2156862915, 0.3254902065, 0.1019607931, 1]),
  mossMultiply: 2,
  mossOffset: 0.3,
  mossSharpness: 1,
  mossSize: 1200,
  mossWorldAligned: true,
  normalStrength: 1,
  smoothnessMultiplier: 1,
  snow: false,
  snowOffset: 0.3,
  snowScale: 500,
  snowSharpness: 0.8,
  snowTint: Object.freeze([0, 0, 0, 0]),
  snowWorldAligned: true,
  specularColor: Object.freeze([0, 0, 0, 0]),
  tintColor: Object.freeze([1, 1, 1, 0]),
  tintMix: 0.5,
  xScale: 1,
  yScale: 1,
});

const toonLabTreeSimpleNoise = wgslFn(`
  fn toonLabSceneTreeSimpleNoise(sourceUv: vec2<f32>, scale: f32) -> f32 {
    var result = 0.0;
    result += toonLabSceneTreeValueNoise(sourceUv * (scale / 1.0)) * 0.125;
    result += toonLabSceneTreeValueNoise(sourceUv * (scale / 2.0)) * 0.25;
    result += toonLabSceneTreeValueNoise(sourceUv * (scale / 4.0)) * 0.5;
    return result;
  }

  fn toonLabSceneTreeValueNoise(sourceUv: vec2<f32>) -> f32 {
    let cell = floor(sourceUv);
    var weight = fract(sourceUv);
    weight = weight * weight * (vec2<f32>(3.0) - 2.0 * weight);
    let r0 = toonLabSceneTreeHashTchou(cell);
    let r1 = toonLabSceneTreeHashTchou(cell + vec2<f32>(1.0, 0.0));
    let r2 = toonLabSceneTreeHashTchou(cell + vec2<f32>(0.0, 1.0));
    let r3 = toonLabSceneTreeHashTchou(cell + vec2<f32>(1.0, 1.0));
    return mix(mix(r0, r1, weight.x), mix(r2, r3, weight.x), weight.y);
  }

  fn toonLabSceneTreeHashTchou(inputValue: vec2<f32>) -> f32 {
    var value = vec2<u32>(vec2<i32>(round(inputValue)));
    value.y = value.y ^ 1103515245u;
    value.x = value.x + value.y;
    value.x = value.x * value.y;
    value.x = value.x ^ (value.x >> 5u);
    value.x = value.x * 668265261u;
    return f32(value.x >> 8u) * (1.0 / f32(0x00ffffffu));
  }
`);

const toonLabTreeDither = wgslFn(`
  fn toonLabSceneTreeDither(inputValue: f32, pixelPosition: vec2<f32>) -> f32 {
    let thresholds = array<f32, 16>(
      1.0 / 17.0,  9.0 / 17.0,  3.0 / 17.0, 11.0 / 17.0,
      13.0 / 17.0, 5.0 / 17.0, 15.0 / 17.0,  7.0 / 17.0,
      4.0 / 17.0, 12.0 / 17.0,  2.0 / 17.0, 10.0 / 17.0,
      16.0 / 17.0, 8.0 / 17.0, 14.0 / 17.0,  6.0 / 17.0
    );
    let x = u32(max(floor(pixelPosition.x), 0.0)) % 4u;
    let y = u32(max(floor(pixelPosition.y), 0.0)) % 4u;
    return inputValue - thresholds[x * 4u + y];
  }
`);

// HueNode.m_HueMode=1 is ToonLab graph's normalized HSV path.
const toonLabTreeHueNormalized = wgslFn(`
  fn toonLabSceneTreeHueNormalized(sourceColor: vec3<f32>, offset: f32) -> vec3<f32> {
    let p = select(
      vec4<f32>(sourceColor.b, sourceColor.g, -1.0, 2.0 / 3.0),
      vec4<f32>(sourceColor.g, sourceColor.b, 0.0, -1.0 / 3.0),
      sourceColor.g >= sourceColor.b
    );
    let q = select(
      vec4<f32>(p.x, p.y, p.w, sourceColor.r),
      vec4<f32>(sourceColor.r, p.y, p.z, p.x),
      sourceColor.r >= p.x
    );
    let difference = q.x - min(q.w, q.y);
    let epsilon = 1e-4;
    let value = select(q.x + epsilon, q.x, difference == 0.0);
    var hue = abs(q.z + (q.w - q.y) / (6.0 * difference + epsilon)) + offset;
    if (hue < 0.0) {
      hue += 1.0;
    } else if (hue > 1.0) {
      hue -= 1.0;
    }
    let saturation = difference / (q.x + epsilon);
    let hueRgb = abs(fract(vec3<f32>(hue) + vec3<f32>(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
    return value * mix(vec3<f32>(1.0), clamp(hueRgb - 1.0, vec3<f32>(0.0), vec3<f32>(1.0)), saturation);
  }
`);

function finite(value, fallback = 0) {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function property(record, name) {
  return record?.properties?.find((value) => value?.name === name) ?? null;
}

function scalar(record, name, fallback = 0) {
  return finite(property(record, name)?.value?.[0], fallback);
}

function flag(record, name, fallback = false) {
  return scalar(record, name, fallback ? 1 : 0) > 0.5;
}

function vector(record, name, fallback, size = fallback.length) {
  const source = property(record, name)?.value;
  return Array.from({ length: size }, (_, index) => finite(source?.[index], fallback[index] ?? 0));
}

function textureIndex(record, name) {
  const value = Number(property(record, name)?.texture);
  return Number.isInteger(value) ? value : -1;
}

function textureTransform(record, name) {
  const entry = property(record, name);
  return {
    offset: vector({ properties: [{ name, value: entry?.textureOffset }] }, name, [0, 0], 2),
    scale: vector({ properties: [{ name, value: entry?.textureScale }] }, name, [1, 1], 2),
  };
}

function uvWithTextureTransform(uvNode, record, name) {
  const transform = textureTransform(record, name);
  return uvNode.mul(vec2(...transform.scale)).add(vec2(...transform.offset));
}

function textureRecordsFrom(options) {
  const source = options.textureRecords ?? options.textures ?? options.manifest?.textures;
  if (!Array.isArray(source)) {
    throw new TypeError('ToonLab scene tree materials require the manifest texture-record array.');
  }
  return source;
}

function textureRecord(records, index, label) {
  const result = records[index];
  if (!result || result.index !== index || !result.exactSourceCopy) {
    throw new Error(`ToonLab scene tree material has no exact source texture for ${label} (index ${index}).`);
  }
  return result;
}

function joinUrl(baseUrl, relativePath) {
  return `${String(baseUrl).replace(/\/$/, '')}/${String(relativePath).replace(/^\//, '')}`;
}

function wrapMode(value) {
  if (/clamp/i.test(String(value))) return THREE.ClampToEdgeWrapping;
  if (/mirror/i.test(String(value))) return THREE.MirroredRepeatWrapping;
  return THREE.RepeatWrapping;
}

function configureTexture(map, record) {
  const importer = record.importer ?? {};
  const point = /point/i.test(String(importer.filterMode));
  const trilinear = /trilinear/i.test(String(importer.filterMode));
  map.name = `ToonLabScene:${record.name}`;
  map.colorSpace = importer.sRGBTexture ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  // ToonLabSceneExport.cs writes source UV.y verbatim. These PNGs therefore use
  // TextureLoader's bottom-left bridge, rather than GLTFLoader's no-flip path.
  map.flipY = true;
  map.wrapS = wrapMode(importer.wrapMode);
  map.wrapT = wrapMode(importer.wrapMode);
  map.magFilter = point ? THREE.NearestFilter : THREE.LinearFilter;
  map.generateMipmaps = Boolean(importer.mipmapEnabled);
  map.minFilter = importer.mipmapEnabled
    ? point
      ? THREE.NearestMipmapNearestFilter
      : trilinear
        ? THREE.LinearMipmapLinearFilter
        : THREE.LinearMipmapNearestFilter
    : point
      ? THREE.NearestFilter
      : THREE.LinearFilter;
  map.anisotropy = Math.max(1, Math.trunc(finite(importer.anisoLevel, 1)));
  map.userData.toonLabImportSettings = {
    ...importer,
    exactSourceCopy: record.exactSourceCopy,
    sourceGuid: record.asset?.guid ?? null,
    textureFlipY: true,
  };
  map.needsUpdate = true;
  return map;
}

async function loadTextureRecord(record, options) {
  const baseUrl = options.baseUrl ?? DEFAULT_TOONLAB_SCENE_BASE_URL;
  const url = joinUrl(baseUrl, record.exactSourceCopy);
  const loader = options.loadTexture ?? options.textureLoader ?? DEFAULT_TEXTURE_LOADER;
  if ((typeof loader !== 'function' && typeof loader?.loadAsync !== 'function')
      || (typeof loader !== 'function' && !loader)) {
    throw new TypeError('textureLoader must expose loadAsync(url), or loadTexture must be a function.');
  }
  let cache = textureCaches.get(loader);
  if (!cache) {
    cache = new Map();
    textureCaches.set(loader, cache);
  }
  const key = `${url}|${record.index}`;
  if (!cache.has(key)) {
    cache.set(key, Promise.resolve(
      typeof loader === 'function' ? loader(url, record) : loader.loadAsync(url),
    ).then((map) => {
      if (!map?.isTexture) throw new Error(`Texture loader did not return a THREE.Texture for ${url}.`);
      assertToonLabTextureUploadReady(
        map,
        `ToonLab scene tree texture ${url}`,
      );
      return configureTexture(map, record);
    }).catch((error) => {
      cache.delete(key);
      throw error;
    }));
  }
  return cache.get(key);
}

async function requiredPropertyTexture(record, records, name, options) {
  const index = textureIndex(record, name);
  if (index < 0) throw new Error(`${record?.name ?? 'ToonLab material'} requires ${name}.`);
  return loadTextureRecord(textureRecord(records, index, name), options);
}

function geometryCapabilities(options) {
  const source = options.geometryCapabilities ?? options.geometry ?? {};
  const fallbackColor = source.missingVertexColor ?? options.missingVertexColor ?? [1, 1, 1, 1];
  return {
    hasTangents: source.hasTangents ?? options.hasTangents ?? true,
    hasUv2: source.hasUv2 ?? options.hasUv2 ?? true,
    hasVertexColors: source.hasVertexColors ?? options.hasVertexColors ?? true,
    missingVertexColor: Array.from({ length: 4 }, (_, index) => finite(fallbackColor[index], 1)),
  };
}

function vertexColorOrFallback(capabilities) {
  return capabilities.hasVertexColors
    ? vertexColor()
    : vec4(...capabilities.missingVertexColor);
}

function stateFloat(value, fallback) {
  return value?.isNode ? value : float(finite(value, fallback));
}

function stateVec3(value, fallback) {
  if (value?.isNode) return value;
  if (value?.isVector3) return vec3(value.x, value.y, value.z);
  if (Array.isArray(value)) return vec3(
    finite(value[0], fallback[0]),
    finite(value[1], fallback[1]),
    finite(value[2], fallback[2]),
  );
  return vec3(...fallback);
}

function toonLabWorldPosition(zSign) {
  return vec3(positionWorld.x, positionWorld.y, positionWorld.z.mul(zSign));
}

function toonLabWorldGeometryNormal(zSign) {
  return vec3(
    normalWorldGeometry.x,
    normalWorldGeometry.y,
    normalWorldGeometry.z.mul(zSign),
  );
}

function threeWorldPositionFromToonLab(value, zSign) {
  return vec3(value.x, value.y, value.z.mul(zSign));
}

function toonLabContrast(input, amount) {
  return input.sub(TOONLAB_CONTRAST_MIDPOINT)
    .mul(float(amount))
    .add(TOONLAB_CONTRAST_MIDPOINT);
}

function toonLabTriplanarColor(map, tile, zSign) {
  const projected = toonLabWorldPosition(zSign).mul(float(tile));
  const sourceNormal = toonLabWorldGeometryNormal(zSign);
  const safeNormal = max(abs(sourceNormal), vec3(TOONLAB_FLOAT_EPSILON));
  const weights = safeNormal.div(max(
    safeNormal.x.add(safeNormal.y).add(safeNormal.z),
    TOONLAB_FLOAT_EPSILON,
  ));
  const mapNode = texture(map);
  return mapNode.sample(projected.zy).rgb.mul(weights.x)
    .add(mapNode.sample(projected.xz).rgb.mul(weights.y))
    .add(mapNode.sample(projected.xy).rgb.mul(weights.z));
}

function leafValues(record) {
  return {
    alphaClip: scalar(record, '_Alpha_Clip', LEAF_DEFAULTS.alphaClip),
    colorTexture: flag(record, '_UseColorTexture', LEAF_DEFAULTS.colorTexture),
    emissiveStrength: scalar(record, '_Emissive_Strength', LEAF_DEFAULTS.emissiveStrength),
    gradientColor: vector(record, '_Gradient_Color', LEAF_DEFAULTS.gradientColor, 4),
    gradientOffset: scalar(record, '_Gradient_Offset', LEAF_DEFAULTS.gradientOffset),
    gradientStretch: scalar(record, '_Gradient_Stretch', LEAF_DEFAULTS.gradientStretch),
    hueShift: scalar(record, '_Hue_Shift', LEAF_DEFAULTS.hueShift),
    hueVariation: scalar(record, '_Hue_Variation', LEAF_DEFAULTS.hueVariation),
    lod: flag(record, '_LOD', LEAF_DEFAULTS.lod),
    mainColor: vector(record, '_Main_Color', LEAF_DEFAULTS.mainColor, 4),
    maxDistanceFade: scalar(record, '_Max_Distance_Fade', LEAF_DEFAULTS.maxDistanceFade),
    minDistanceFade: scalar(record, '_Min_Distance_Fade', LEAF_DEFAULTS.minDistanceFade),
    objectDistanceForFade: flag(
      record,
      '_ObjectDistanceForFade',
      LEAF_DEFAULTS.objectDistanceForFade,
    ),
    singleMaterialLod: flag(record, '_SingleMaterialLOD', LEAF_DEFAULTS.singleMaterialLod),
    smoothness: scalar(record, '_Smoothness', LEAF_DEFAULTS.smoothness),
    specularColor: vector(record, '_Specular_Color', LEAF_DEFAULTS.specularColor, 4),
    sssBrightness: scalar(record, '_SSS_Brightness', LEAF_DEFAULTS.sssBrightness),
    sssColor: vector(record, '_SSS_Color', LEAF_DEFAULTS.sssColor, 4),
    sssOffset: scalar(record, '_SSS_Offset', LEAF_DEFAULTS.sssOffset),
    twoSidedSign: flag(record, '_UseTwoSidedSign', LEAF_DEFAULTS.twoSidedSign),
    useGradient: flag(record, '_UseGradient', LEAF_DEFAULTS.useGradient),
    useWind: flag(record, '_UseWind', LEAF_DEFAULTS.useWind),
    useWorldGradient: flag(
      record,
      '_UseWorldGradient',
      LEAF_DEFAULTS.useWorldGradient,
    ),
    windDirection: vector(record, '_Wind_Direction', LEAF_DEFAULTS.windDirection, 4),
    windIntensity: scalar(record, '_WindIntensity', LEAF_DEFAULTS.windIntensity),
    windScale: scalar(record, '_WindScale', LEAF_DEFAULTS.windScale),
    windSpeed: scalar(record, '_WindSpeed', LEAF_DEFAULTS.windSpeed),
    worldGradientContrast: scalar(
      record,
      '_World_Gradient_Contrast',
      LEAF_DEFAULTS.worldGradientContrast,
    ),
    worldGradientSize: scalar(
      record,
      '_World_Gradient_Size',
      LEAF_DEFAULTS.worldGradientSize,
    ),
    // These properties exist in the blackboard/material records but have no
    // PropertyNode/edge to a connected S_Leaves master output.
    disconnected: {
      smoothnessMap: flag(record, '_UseSmoothnessMap', false),
      smoothnessTexture: textureIndex(record, '_Smoothness_Texture'),
      specularScalar: scalar(record, '_Specular', 0),
    },
  };
}

function barkValues(record) {
  return {
    emissiveStrength: scalar(record, '_Emissive_Strength', BARK_DEFAULTS.emissiveStrength),
    moss: flag(record, '_Moss', BARK_DEFAULTS.moss),
    mossColor: vector(record, '_Moss_Color', BARK_DEFAULTS.mossColor, 4),
    mossColor2: vector(record, '_Moss_Color_2', BARK_DEFAULTS.mossColor2, 4),
    mossMultiply: scalar(record, '_Moss_Multiply', BARK_DEFAULTS.mossMultiply),
    mossOffset: scalar(record, '_Moss_Offset', BARK_DEFAULTS.mossOffset),
    mossSharpness: scalar(record, '_Moss_Sharpness', BARK_DEFAULTS.mossSharpness),
    mossSize: scalar(record, '_Moss_Size', BARK_DEFAULTS.mossSize),
    mossWorldAligned: flag(
      record,
      '_MossWorldAligned',
      BARK_DEFAULTS.mossWorldAligned,
    ),
    normalStrength: scalar(record, '_Normal_Strength', BARK_DEFAULTS.normalStrength),
    smoothnessMultiplier: scalar(
      record,
      '_Smoothness_Multiplier',
      BARK_DEFAULTS.smoothnessMultiplier,
    ),
    snow: flag(record, '_Snow', BARK_DEFAULTS.snow),
    snowOffset: scalar(record, '_Snow_Offset', BARK_DEFAULTS.snowOffset),
    snowScale: scalar(record, '_Snow_Scale', BARK_DEFAULTS.snowScale),
    snowSharpness: scalar(record, '_Snow_Sharpness', BARK_DEFAULTS.snowSharpness),
    snowTint: vector(record, '_Snow_Tint', BARK_DEFAULTS.snowTint, 4),
    snowWorldAligned: flag(
      record,
      '_SnowWorldAligned',
      BARK_DEFAULTS.snowWorldAligned,
    ),
    specularColor: vector(record, '_Specular_Color', BARK_DEFAULTS.specularColor, 4),
    tintColor: vector(record, '_Tint_Color', BARK_DEFAULTS.tintColor, 4),
    tintMix: scalar(record, '_Tint_Mix', BARK_DEFAULTS.tintMix),
    xScale: scalar(record, '_XScale', BARK_DEFAULTS.xScale),
    yScale: scalar(record, '_YScale', BARK_DEFAULTS.yScale),
    // These serialized values are intentionally retained for auditability but
    // do not reach any connected S_Bark master output in the supplied graph.
    disconnected: {
      mossSmoothness: scalar(record, '_Moss_Smoothness', 1.3),
      mossSpecular: scalar(record, '_Moss_Specular', 0.5),
      snowEmission: scalar(record, '_Snow_Emission', 0),
      snowSmoothness: scalar(record, '_Snow_Smoothness', 0),
      specularScalar: scalar(record, '_Specular', 0.1),
    },
  };
}

export function isToonLabSceneTreeMaterialRecord(record) {
  return record?.shaderName === TOONLAB_SCENE_TREE_SHADERS.leaves
    || record?.shaderName === TOONLAB_SCENE_TREE_SHADERS.bark;
}

export function readToonLabSceneTreeMaterialParameters(record) {
  if (record?.shaderName === TOONLAB_SCENE_TREE_SHADERS.leaves) {
    return { family: 'leaves', ...leafValues(record) };
  }
  if (record?.shaderName === TOONLAB_SCENE_TREE_SHADERS.bark) {
    return { family: 'bark', ...barkValues(record) };
  }
  throw new TypeError(`Unsupported ToonLab scene tree shader: ${record?.shaderName ?? 'missing'}.`);
}

/** Build one S_Leaves material directly from a scene-manifest material record. */
export async function buildToonLabSceneLeavesMaterial(record, options = {}) {
  if (record?.shaderName !== TOONLAB_SCENE_TREE_SHADERS.leaves) {
    throw new TypeError('buildToonLabSceneLeavesMaterial requires an S_Leaves record.');
  }
  const records = textureRecordsFrom(options);
  const capabilities = geometryCapabilities(options);
  const values = leafValues(record);
  const zSign = finite(options.coordinateZSign, -1) < 0 ? -1 : 1;
  const leafMap = await requiredPropertyTexture(record, records, '_Leaf_Texture', options);
  const [colorMap, worldGradientMap, woodMap] = await Promise.all([
    values.colorTexture
      ? requiredPropertyTexture(record, records, '_Basic_Color_Texture', options)
      : null,
    values.useGradient && values.useWorldGradient
      ? requiredPropertyTexture(
        record,
        records,
        '_SampleTexture2D_db2fa32299ac42f38d0435a90020f5ea_Texture_1_Texture2D',
        options,
      )
      : null,
    values.singleMaterialLod
      ? requiredPropertyTexture(record, records, '_SingleMaterialWoodTexture', options)
      : null,
  ]);

  const sourceVertexColor = vertexColorOrFallback(capabilities);
  const gradientUv = capabilities.hasUv2 ? uv(2) : vec2(0);
  let leafColor;
  if (values.colorTexture) {
    leafColor = texture(colorMap).sample(
      uvWithTextureTransform(uv(), record, '_Basic_Color_Texture'),
    ).rgb;
  } else if (values.useGradient) {
    let gradientAmount;
    if (values.useWorldGradient) {
      const sourcePosition = toonLabWorldPosition(zSign);
      const worldUv = vec2(sourcePosition.x, sourcePosition.z)
        .div(values.worldGradientSize);
      const sampledNoise = texture(worldGradientMap).sample(
        uvWithTextureTransform(
          worldUv,
          record,
          '_SampleTexture2D_db2fa32299ac42f38d0435a90020f5ea_Texture_1_Texture2D',
        ),
      ).rgb;
      gradientAmount = clamp(
        toonLabContrast(sampledNoise, values.worldGradientContrast),
        0,
        1,
      );
    } else {
      gradientAmount = float(1).sub(clamp(
        gradientUv.y.add(values.gradientOffset).mul(values.gradientStretch),
        0,
        1,
      ));
    }
    leafColor = mix(
      toonLabTreeColorPropertyNode(values.mainColor),
      toonLabTreeColorPropertyNode(values.gradientColor),
      gradientAmount,
    );
  } else {
    leafColor = toonLabTreeColorPropertyNode(values.mainColor);
  }

  const sourceObjectPosition = vec2(modelPosition.x, modelPosition.z.mul(zSign)).mul(10);
  const hueRandom = fract(
    sin(dot(sourceObjectPosition, vec2(12.9898, 78.233))).mul(43758.5453),
  );
  const hueAmount = mix(
    float(-values.hueVariation),
    float(values.hueVariation),
    hueRandom,
  ).add(values.hueShift);
  leafColor = toonLabTreeHueNormalized(leafColor, hueAmount);

  let colorNode = leafColor;
  if (values.singleMaterialLod) {
    const woodColor = texture(woodMap).sample(
      uvWithTextureTransform(uv(), record, '_SingleMaterialWoodTexture'),
    ).rgb;
    colorNode = mix(woodColor, leafColor, sourceVertexColor.r);
  }

  const leafSample = texture(leafMap).sample(
    uvWithTextureTransform(uv(), record, '_Leaf_Texture'),
  );
  const fadePosition = values.objectDistanceForFade ? modelPosition : positionWorld;
  const cameraFade = clamp(
    distance(cameraPosition, fadePosition)
      .sub(values.minDistanceFade)
      .div(values.maxDistanceFade - values.minDistanceFade),
    0,
    1,
  );
  const cameraDither = toonLabTreeDither(cameraFade.mul(2), screenCoordinate.xy);
  const leafOpacity = leafSample.r.mul(cameraDither);
  const opacityNode = values.singleMaterialLod
    ? mix(float(1), leafOpacity, sourceVertexColor.r)
    : leafOpacity;

  const state = options.state ?? {};
  const stateUniforms = state.uniforms ?? state;
  const viewDirection = normalize(cameraPosition.sub(positionWorld));
  // Fallback is the exported reference directional-light forward/ray vector after
  // the ToonLab (x,y,z) -> Three (x,y,-z) scene conversion.
  const lightDirection = normalize(stateVec3(
    stateUniforms.sunDirection,
    [-0.6295879392527137, -0.7071067792032899, 0.32189928913234844],
  ));
  const viewLight = clamp(dot(viewDirection, lightDirection), 0, 1);
  const backLight = dot(lightDirection, normalWorldGeometry.negate());
  const remappedBackLight = backLight
    .add(1)
    .mul((2 - values.sssOffset) / 2)
    .add(-1 + values.sssOffset);
  const sssFactor = clamp(viewLight.mul(remappedBackLight), 0, 1);

  const material = new MeshPhysicalNodeMaterial();
  material.name = `ToonLabScene:${record.name}`;
  material.side = THREE.DoubleSide;
  material.forceSinglePass = true;
  material.depthTest = true;
  material.depthWrite = true;
  material.colorNode = colorNode;
  material.emissiveNode = colorNode.mul(values.emissiveStrength).add(
    toonLabTreeColorPropertyNode(values.sssColor)
      .mul(values.sssBrightness)
      .mul(sssFactor),
  );
  material.metalnessNode = float(0);
  material.roughnessNode = clamp(float(1).sub(values.smoothness), 0, 1);
  material.specularColorNode = toonLabTreeColorPropertyNode(values.specularColor);
  material.specularIntensityNode = float(1);
  material.normalNode = values.twoSidedSign
    ? normalViewGeometry.mul(faceDirection)
    : normalViewGeometry;

  let positionNode;
  if (values.useWind && !values.lod) {
    const authoredThreeWorld = modelWorldMatrix.mul(vec4(positionLocal, 1)).xyz;
    const authoredToonLabWorld = vec3(
      authoredThreeWorld.x,
      authoredThreeWorld.y,
      authoredThreeWorld.z.mul(zSign),
    );
    const timeNode = stateFloat(stateUniforms.time, 0);
    const direction = normalize(vec2(values.windDirection[0], values.windDirection[1]));
    const windUv = vec2(authoredToonLabWorld.x, authoredToonLabWorld.z).add(
      direction.mul(timeNode).mul(values.windSpeed),
    );
    const windNoise = toonLabTreeSimpleNoise(windUv, float(1 / values.windScale));
    const windOffset = windNoise.sub(0.5)
      .mul(values.windIntensity)
      .mul(sourceVertexColor.r);
    const displacedToonLabWorld = authoredToonLabWorld.add(vec3(windOffset));
    const displacedThreeWorld = threeWorldPositionFromToonLab(displacedToonLabWorld, zSign);
    positionNode = modelWorldMatrixInverse.mul(vec4(displacedThreeWorld, 1)).xyz;
  } else {
    positionNode = positionLocal;
  }
  installToonLabMaterialPassCoupling(material, {
    alphaChannel: values.singleMaterialLod
      ? 'lerp(1, LeafTexture.r * camera dither, VertexColor.r)'
      : 'LeafTexture.r * camera dither',
    alphaNode: opacityNode,
    alphaThreshold: values.alphaClip,
    positionMode: values.useWind && !values.lod ? 'deformed' : 'authored',
    positionNode,
    shaderName: TOONLAB_SCENE_TREE_SHADERS.leaves,
  });

  material.userData.toonLabSceneTree = {
    coordinateZSign: zSign,
    family: 'leaves',
    geometryCapabilities: capabilities,
    materialGuid: record.asset?.guid ?? null,
    materialIndex: record.index,
    materialName: record.name,
    parameters: values,
    reconstruction: 'toonlab-scene-s-leaves',
    shaderGuid: record.shader?.guid ?? TOONLAB_SCENE_TREE_SOURCE.leaves.graphGuid,
    shaderName: record.shaderName,
    sourceGraph: TOONLAB_SCENE_TREE_SOURCE.leaves.graph,
    topology: {
      alpha: values.singleMaterialLod
        ? 'lerp(1,LeafTexture.r*CameraDither,VertexColor.r)'
        : 'LeafTexture.r*CameraDither',
      baseColor: values.singleMaterialLod
        ? 'lerp(WoodTexture,Hue(LeafColor),VertexColor.r)'
        : 'Hue(LeafColor)',
      smoothness: '_Smoothness (smoothness-map blackboard fields are disconnected)',
      specular: '_Specular_Color (_Specular is disconnected)',
      wind: values.useWind && !values.lod
        ? 'world SimpleNoise broadcast XYZ * VertexColor.r'
        : 'authored Position (UseWind=false or LOD=true)',
    },
  };
  material.userData.toonLabNormalIntegration =
    createToonLabNormalIntegrationMetadata({
      coordinateZSign: zSign,
      decode: 'geometry-only',
      family: 'toonlab-environment-scene-leaves',
      textureFlipY: true,
    });
  installToonLabSurfaceLighting(material, { workflow: 'specular' });
  return material;
}

/** Build one S_Bark material directly from a scene-manifest material record. */
export async function buildToonLabSceneBarkMaterial(record, options = {}) {
  if (record?.shaderName !== TOONLAB_SCENE_TREE_SHADERS.bark) {
    throw new TypeError('buildToonLabSceneBarkMaterial requires an S_Bark record.');
  }
  const records = textureRecordsFrom(options);
  const capabilities = geometryCapabilities(options);
  const values = barkValues(record);
  const zSign = finite(options.coordinateZSign, -1) < 0 ? -1 : 1;
  const [diffuseMap, normalMap, smoothnessMap, mossMap, snowMap] = await Promise.all([
    requiredPropertyTexture(record, records, '_Diffuse_Texture', options),
    requiredPropertyTexture(record, records, '_Normal_Texture', options),
    requiredPropertyTexture(record, records, '_Smoothness_Texture', options),
    values.moss ? requiredPropertyTexture(record, records, '_MossTexture', options) : null,
    values.snow ? requiredPropertyTexture(record, records, '_Snow_Texture', options) : null,
  ]);
  const sourceVertexColor = vertexColorOrFallback(capabilities);
  const diffuseUv = uvWithTextureTransform(
    uv().mul(vec2(values.xScale, values.yScale)),
    record,
    '_Diffuse_Texture',
  );
  const normalUv = uvWithTextureTransform(uv(), record, '_Normal_Texture');
  const smoothnessUv = uvWithTextureTransform(uv(), record, '_Smoothness_Texture');
  const barkColor = mix(
    texture(diffuseMap).sample(diffuseUv).rgb,
    toonLabTreeColorPropertyNode(values.tintColor),
    values.tintMix,
  );

  let barkAndMossColor = barkColor;
  if (values.moss) {
    // S_Bark wires Moss Size directly to Triplanar.Tile (not its reciprocal).
    const mossNoise = toonLabTriplanarColor(mossMap, values.mossSize, zSign).r;
    const mossColor = mix(
      toonLabTreeColorPropertyNode(values.mossColor2),
      toonLabTreeColorPropertyNode(values.mossColor),
      pow(max(mossNoise, 0), 2),
    );
    const directionMask = values.mossWorldAligned
      ? clamp(
        toonLabWorldGeometryNormal(zSign).y.mul(values.mossSharpness).sub(values.mossOffset),
        0,
        1,
      )
      : sourceVertexColor.g;
    const mossMask = clamp(
      pow(directionMask.mul(values.mossMultiply).mul(mossNoise), 2),
      0,
      1,
    );
    barkAndMossColor = mix(barkColor, mossColor, mossMask);
  }

  let colorNode = barkAndMossColor;
  if (values.snow) {
    // SG_Snow wires 1 / SnowScale to Triplanar.Tile and outputs Alpha=1-mask.
    const snowColor = toonLabTriplanarColor(snowMap, 1 / values.snowScale, zSign)
      .mul(toonLabTreeColorPropertyNode(values.snowTint));
    const snowMask = values.snowWorldAligned
      ? clamp(
        toonLabWorldGeometryNormal(zSign).y.mul(values.snowSharpness).sub(values.snowOffset),
        0,
        1,
      )
      : sourceVertexColor.g;
    colorNode = mix(snowColor, barkAndMossColor, float(1).sub(snowMask));
  }

  const smoothnessNode = texture(smoothnessMap)
    .sample(smoothnessUv)
    .r
    .mul(values.smoothnessMultiplier);
  const flipGreenChannel = Boolean(
    normalMap.userData?.toonLabImportSettings?.flipGreenChannel,
  );
  const decodedNormal = decodeToonLabNormalNode(
    texture(normalMap).sample(normalUv).rgb,
    flipGreenChannel ? -1 : 1,
  );

  const material = new MeshPhysicalNodeMaterial();
  material.name = `ToonLabScene:${record.name}`;
  material.side = THREE.FrontSide;
  material.depthTest = true;
  material.depthWrite = true;
  material.colorNode = colorNode;
  // The connected graph multiplies the final BaseColor composite; SG_Snow's
  // own Emission output and its serialized Snow Emission are not connected.
  material.emissiveNode = colorNode.mul(values.emissiveStrength);
  material.metalnessNode = float(0);
  material.roughnessNode = clamp(float(1).sub(smoothnessNode), 0, 1);
  material.specularColorNode = toonLabTreeColorPropertyNode(values.specularColor);
  material.specularIntensityNode = float(1);
  material.normalNode = capabilities.hasTangents
    ? normalize(TBNViewMatrix.mul(
      applyToonLabNormalStrengthNode(decodedNormal, values.normalStrength),
    ))
    : normalViewGeometry;
  installToonLabMaterialPassCoupling(material, {
    positionMode: 'authored',
    positionNode: positionLocal,
    shaderName: TOONLAB_SCENE_TREE_SHADERS.bark,
  });
  material.userData.toonLabSceneTree = {
    coordinateZSign: zSign,
    family: 'bark',
    geometryCapabilities: capabilities,
    materialGuid: record.asset?.guid ?? null,
    materialIndex: record.index,
    materialName: record.name,
    parameters: values,
    reconstruction: 'toonlab-scene-s-bark',
    shaderGuid: record.shader?.guid ?? TOONLAB_SCENE_TREE_SOURCE.bark.graphGuid,
    shaderName: record.shaderName,
    sourceGraph: TOONLAB_SCENE_TREE_SOURCE.bark.graph,
    topology: {
      baseColor: 'lerp(SG_Snow.BaseColor,BarkMossColor,SG_Snow.Alpha)',
      emission: 'final BaseColor * _Emissive_Strength',
      normal: capabilities.hasTangents
        ? 'UnpackNormal + NormalStrength -> tangent-to-view'
        : 'geometry-normal fallback: exported geometry has no tangent attribute',
      smoothness: 'SmoothnessTexture.r * _Smoothness_Multiplier',
      specular: '_Specular_Color (_Specular/MossSpecular are disconnected)',
    },
  };
  material.userData.toonLabNormalIntegration =
    createToonLabNormalIntegrationMetadata({
      coordinateZSign: zSign,
      decode: capabilities.hasTangents
        ? 'RG + importer green transform + reconstructed positive Z; ToonLab graph Normal Strength'
        : 'geometry-only fallback: no tangent attribute',
      family: 'toonlab-environment-scene-bark',
      flipGreenChannel,
      textureFlipY: true,
    });
  installToonLabSurfaceLighting(material, { workflow: 'specular' });
  return material;
}

/** Dispatch an exported scene material record to its exact tree-family builder. */
export async function buildToonLabSceneTreeMaterial(record, options = {}) {
  if (record?.shaderName === TOONLAB_SCENE_TREE_SHADERS.leaves) {
    return buildToonLabSceneLeavesMaterial(record, options);
  }
  if (record?.shaderName === TOONLAB_SCENE_TREE_SHADERS.bark) {
    return buildToonLabSceneBarkMaterial(record, options);
  }
  throw new TypeError(`Unsupported ToonLab scene tree shader: ${record?.shaderName ?? 'missing'}.`);
}
