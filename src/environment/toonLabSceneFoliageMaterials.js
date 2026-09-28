// Manifest-driven reconstruction of ToonLab's S_FoliageShader family.
//
// This module intentionally consumes the canonical EnvironmentReferenceScene
// scene export instead of maintaining another table of material values. The
// graph topology and constants come from the supplied ToonLab Shader
// Graph assets; only the renderer integration is adapted to Three/WebGPU.

import * as THREE from 'three';
import { MeshPhysicalNodeMaterial } from 'three/webgpu';
import {
  cameraPosition,
  clamp,
  distance,
  float,
  fract,
  mix,
  modelPosition,
  modelWorldMatrix,
  modelWorldMatrixInverse,
  normalViewGeometry,
  positionLocal,
  positionWorld,
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

import {
  indexToonLabMaterialProperties,
  linearizeToonLabColorProperty,
  loadToonLabSceneTexture,
  readToonLabScalar,
  readToonLabTextureIndex,
  readToonLabVector,
} from './toonLabSceneRecords.js';
import { installToonLabMaterialPassCoupling } from './toonLabMaterialPassCoupling.js';
import { createToonLabNormalIntegrationMetadata } from './toonLabNormalIntegration.js';
import { installToonLabSurfaceLighting } from './toonLabSurfaceLighting.js';

export const TOONLAB_SCENE_FOLIAGE_SHADER =
  'ToonLab Graphs/S_FoliageShader';

export const DEFAULT_TOONLAB_SCENE_FOLIAGE_BASE_URL =
  '/assets-local/reference-environment/environment-scene';

export const TOONLAB_SCENE_FOLIAGE_NOISE_PROPERTY =
  '_SampleTexture2D_5e94c4f2e64d493eb9de801992ecd837_Texture_1_Texture2D';

const freezeColorKey = (color, position) => Object.freeze({
  color: Object.freeze(color),
  position,
});

/**
 * Constants serialized by S_FoliageShader.toonlabgraph and its two connected
 * subgraphs. Positions are the exact UInt16 Gradient key times divided by
 * 65535, not rounded values copied from an inspector.
 */
export const TOONLAB_SCENE_FOLIAGE_GRAPH = Object.freeze({
  sourceGraph: 'Environment/Foliage/Shaders/S_FoliageShader.toonlabgraph',
  sourceGraphSha256: '1426bd360f44c10510f77a70450c86feca99f132819af6fe78130daabf369dd7',
  cameraDitherGraph: 'Materials/Shaders/SG_CameraDithering.toonlabsubgraph',
  cameraDitherGraphSha256: '95586ca209f762a059f221bbccab74df9685c4cddc997121596d4578bf1f45dd',
  distanceFadeGraph: 'Materials/Shaders/SG_DistanceFade.toonlabsubgraph',
  distanceFadeGraphSha256: '4e33f7f9a63fdabb33d32725b7a9d9264f32b8b3f7aa19819256b8e054539623',
  cameraDitherMultiplier: 2,
  distanceDitherMultiplier: 2,
  distanceFadeOutThreshold: 0.05,
  tipDistanceRange: Object.freeze([30, 80]),
  hueObjectPositionScale: 10,
  randomDot: Object.freeze([12.9898, 78.233]),
  randomMultiplier: 43758.5453,
  windDirection: Object.freeze([1, 0, 1]),
  // ToonLabSceneExport reflects every object-local Z coordinate when it emits
  // the GLB. The connected graph's object-space (1,0,1) displacement must be
  // reflected by the same basis change before it is added to positionLocal.
  runtimeWindDirection: Object.freeze([1, 0, -1]),
  windUvDirection: Object.freeze([1, 0]),
  liftDirection: Object.freeze([0, 1, 0]),
  // _Height_Blend remains in every material record, but the graph contains no
  // PropertyNode for it. UV0.g is connected directly to the final Lerp T.
  heightBlendPropertyConnected: false,
  heightBlendSource: 'UV0.g',
  gradient: Object.freeze([
    freezeColorKey([0.43576884269714355, 0.8939999938011169, 0.031447216868400574], 0),
    freezeColorKey([0.24300001561641693, 0.7019999623298645, 0.04387499764561653], 17926 / 65535),
    freezeColorKey([0.14466914534568787, 0.5660377740859985, 0.013349945656955242], 42983 / 65535),
    freezeColorKey([0.7573568820953369, 0.8790000081062317, 0.058927346020936966], 62258 / 65535),
  ]),
});

const toonLabSceneFoliageDither = wgslFn(`
  fn toonLabSceneFoliageDither(inputValue: f32, pixelPosition: vec2<f32>) -> f32 {
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

// GradientNoiseNode.m_HashType=0 maps to ToonLab graph's Tchou hash. This is
// the generated function in GradientNoiseNode.cs with identical quintic
// interpolation and +0.5 output bias.
const toonLabSceneFoliageGradientNoise = wgslFn(`
  fn toonLabSceneFoliageGradientNoise(sourceUv: vec2<f32>, scale: f32) -> f32 {
    let p = sourceUv * scale;
    let ip = floor(p);
    var fp = fract(p);
    let d00 = dot(toonLabSceneFoliageGradientDirection(ip), fp);
    let d01 = dot(toonLabSceneFoliageGradientDirection(ip + vec2<f32>(0.0, 1.0)), fp - vec2<f32>(0.0, 1.0));
    let d10 = dot(toonLabSceneFoliageGradientDirection(ip + vec2<f32>(1.0, 0.0)), fp - vec2<f32>(1.0, 0.0));
    let d11 = dot(toonLabSceneFoliageGradientDirection(ip + vec2<f32>(1.0, 1.0)), fp - vec2<f32>(1.0, 1.0));
    fp = fp * fp * fp * (fp * (fp * 6.0 - 15.0) + 10.0);
    return mix(mix(d00, d01, fp.y), mix(d10, d11, fp.y), fp.x) + 0.5;
  }

  fn toonLabSceneFoliageGradientDirection(p: vec2<f32>) -> vec2<f32> {
    let x = toonLabSceneFoliageHashTchou(p);
    return normalize(vec2<f32>(x - floor(x + 0.5), abs(x) - 0.5));
  }

  fn toonLabSceneFoliageHashTchou(p: vec2<f32>) -> f32 {
    var value = vec2<u32>(vec2<i32>(round(p)));
    value.y = value.y ^ 1103515245u;
    value.x = value.x + value.y;
    value.x = value.x * value.y;
    value.x = value.x ^ (value.x >> 5u);
    value.x = value.x * 668265261u;
    return f32(value.x >> 8u) * (1.0 / f32(0x00ffffffu));
  }
`);

// HueNode.m_HueMode=1 is ToonLab graph's normalized HSV path. These statements
// are a direct WGSL transcription of ToonLabHue_Normalized in HueNode.cs.
const toonLabSceneFoliageHueNormalized = wgslFn(`
  fn toonLabSceneFoliageHueNormalized(inputColor: vec3<f32>, offset: f32) -> vec3<f32> {
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

function requiredProperty(properties, name, materialName) {
  const property = properties.get(name);
  if (!property) {
    throw new Error(`${materialName} is missing required S_FoliageShader property ${name}.`);
  }
  return property;
}

function requiredScalar(properties, name, materialName) {
  requiredProperty(properties, name, materialName);
  const value = readToonLabScalar(properties, name, Number.NaN);
  if (!Number.isFinite(value)) {
    throw new Error(`${materialName}.${name} is not a finite scalar.`);
  }
  return value;
}

function requiredVector(properties, name, materialName) {
  const property = requiredProperty(properties, name, materialName);
  if (!Array.isArray(property.value) || property.value.length < 3) {
    throw new Error(`${materialName}.${name} is not a color/vector property.`);
  }
  return readToonLabVector(properties, name, [0, 0, 0, 0]);
}

function requiredTextureIndex(properties, name, materialName) {
  requiredProperty(properties, name, materialName);
  const index = readToonLabTextureIndex(properties, name);
  if (index < 0) throw new Error(`${materialName}.${name} has no exported texture.`);
  return index;
}

/** Resolve literal material values from one canonical scene-manifest record. */
export function resolveToonLabSceneFoliageInputs(materialRecord) {
  if (materialRecord?.shaderName !== TOONLAB_SCENE_FOLIAGE_SHADER) {
    throw new TypeError(
      `Expected ${TOONLAB_SCENE_FOLIAGE_SHADER}; received `
      + `${materialRecord?.shaderName ?? 'no shader'}.`,
    );
  }
  const materialName = materialRecord.name ?? `material-${materialRecord.index ?? 'unknown'}`;
  const properties = indexToonLabMaterialProperties(materialRecord);
  const scalar = (name) => requiredScalar(properties, name, materialName);
  const color = (name) => requiredVector(properties, name, materialName);
  const useTexture = scalar('_Use_Texture') >= 0.5;
  const useSolidTipColor = scalar('_UseSolidTipColor') >= 0.5;

  return Object.freeze({
    alphaClipThreshold: scalar('_Alpha_Clip_Threshold'),
    bottomColor: Object.freeze(color('_Bottom_Color')),
    emissiveStrength: scalar('_Emissive_Strength'),
    endFadeDistance: scalar('_End_Fade_Distance'),
    foliageTextureIndex: requiredTextureIndex(properties, '_Foliage_Texture', materialName),
    // Serialized for compatibility with the source material, but intentionally
    // not consumed because the source graph has no PropertyNode for it.
    heightBlend: scalar('_Height_Blend'),
    hueShift: scalar('_Hue_Shift'),
    hueVariation: scalar('_Hue_Variation'),
    hueVariationScale: scalar('_Hue_Variation_Scale'),
    liftOffset: scalar('_Additional_Z_Offset'),
    lod: scalar('_LOD') >= 0.5,
    materialIndex: materialRecord.index,
    materialName,
    maxCameraFadeDistance: scalar('_Max_Distance_Fade'),
    minCameraFadeDistance: scalar('_Min_Distance_Fade'),
    noiseTextureIndex: requiredTextureIndex(
      properties,
      TOONLAB_SCENE_FOLIAGE_NOISE_PROPERTY,
      materialName,
    ),
    objectDistanceForFade: scalar('_ObjectDistanceForFade') >= 0.5,
    smoothness: scalar('_Smoothness'),
    specularColor: Object.freeze(color('_Specular_Color')),
    startFadeDistance: scalar('_Start_Fade_Distance'),
    textureTint: Object.freeze(color('_Texture_Tint')),
    tipColor: Object.freeze(color('_Tip_Color')),
    useSolidTipColor,
    useTexture,
    useWind: scalar('_UseWind') >= 0.5,
    windIntensity: scalar('_WindIntensity'),
    windSpeed: scalar('_WindSpeed'),
    windWeight: scalar('_WindWeight'),
  });
}

export function isToonLabSceneFoliageRecord(materialRecord) {
  return materialRecord?.shaderName === TOONLAB_SCENE_FOLIAGE_SHADER;
}

/** CPU mirror of SampleGradientV1 for source/verifier probes. */
export function sampleToonLabSceneFoliageGradient(value) {
  const keys = TOONLAB_SCENE_FOLIAGE_GRAPH.gradient;
  let result = [...keys[0].color];
  for (let index = 1; index < keys.length; index += 1) {
    const previous = keys[index - 1];
    const current = keys[index];
    const amount = THREE.MathUtils.clamp(
      (value - previous.position) / (current.position - previous.position),
      0,
      1,
    );
    result = result.map((channel, channelIndex) => THREE.MathUtils.lerp(
      channel,
      current.color[channelIndex],
      amount,
    ));
  }
  return result;
}

/**
 * Recover the supplied ToonLab world's XZ basis from ToonLab's reflected Three
 * basis. The reference exporter preserves X/Y and negates every ToonLab Z value, so
 * world/object-position driven texture and random seeds must negate Z once
 * before evaluating the source ToonLab graph.
 */
export function evaluateToonLabSceneFoliageSourceWorldXZ(position) {
  if ((!Array.isArray(position) && !ArrayBuffer.isView(position))
    || position.length < 3) {
    throw new TypeError('ToonLab foliage world position must contain three components.');
  }
  const x = Number(position[0]);
  const reflectedZ = Number(position[2]);
  if (!Number.isFinite(x) || !Number.isFinite(reflectedZ)) {
    throw new TypeError('ToonLab foliage world X/Z must be finite.');
  }
  return Object.freeze([x, -reflectedZ]);
}

/** Reflect one ToonLab object-space vector into the exported Three mesh basis. */
export function reflectToonLabSceneFoliageObjectVector(vector) {
  if ((!Array.isArray(vector) && !ArrayBuffer.isView(vector))
    || vector.length < 3) {
    throw new TypeError('ToonLab foliage object vector must contain three components.');
  }
  const result = [Number(vector[0]), Number(vector[1]), -Number(vector[2])];
  if (!result.every(Number.isFinite)) {
    throw new TypeError('ToonLab foliage object vector components must be finite.');
  }
  return Object.freeze(result);
}

function sampleToonLabGradientNode(value) {
  const keys = TOONLAB_SCENE_FOLIAGE_GRAPH.gradient;
  let result = vec3(...keys[0].color);
  for (let index = 1; index < keys.length; index += 1) {
    const previous = keys[index - 1];
    const current = keys[index];
    const amount = clamp(
      value.sub(previous.position).div(current.position - previous.position),
      0,
      1,
    );
    result = mix(result, vec3(...current.color), amount);
  }
  return result;
}

function distanceRamp(value, minimum, maximum) {
  return clamp(value.sub(minimum).div(maximum - minimum), 0, 1);
}

function distanceFadeVisibility(value, start, end) {
  return clamp(float(end).sub(value).div(end - start), 0, 1);
}

function textureRecordSummary(manifest, index) {
  const record = manifest?.textures?.[index];
  return record ? {
    exactSourceCopy: record.exactSourceCopy ?? null,
    importer: { ...(record.importer ?? {}) },
    index,
    name: record.name ?? null,
  } : null;
}

/**
 * Build one exact S_FoliageShader material from the canonical ToonLab scene
 * manifest.
 *
 * `geometryHints.objectPositionNode` is required for exact per-instance hue
 * and object-distance fading when the consumer packs many ToonLab objects into
 * one Three InstancedMesh. Without it, modelPosition is exact for ordinary
 * meshes and deliberately documented as the InstancedMesh parent fallback.
 */
export async function buildToonLabSceneFoliageMaterial(
  materialRecord,
  manifest,
  {
    baseUrl = DEFAULT_TOONLAB_SCENE_FOLIAGE_BASE_URL,
    geometryHints = {},
    state = null,
    textureLoader,
  } = {},
) {
  const values = resolveToonLabSceneFoliageInputs(materialRecord);
  const textureOptions = {
    baseUrl,
    ...(textureLoader ? { textureLoader } : {}),
  };
  const needsFoliageTexture = values.useTexture;
  const needsNoiseTexture = !values.useTexture && !values.useSolidTipColor;
  const [foliageMap, noiseMap] = await Promise.all([
    needsFoliageTexture
      ? loadToonLabSceneTexture(
        manifest,
        values.foliageTextureIndex,
        textureOptions,
      )
      : null,
    needsNoiseTexture
      ? loadToonLabSceneTexture(
        manifest,
        values.noiseTextureIndex,
        textureOptions,
      )
      : null,
  ]);
  if (needsFoliageTexture && !foliageMap) {
    throw new Error(`${values.materialName} could not load its foliage texture.`);
  }
  if (needsNoiseTexture && !noiseMap) {
    throw new Error(`${values.materialName} could not load its gradient-noise texture.`);
  }

  const surfaceUv = geometryHints.uvNode ?? uv();
  const localPosition = geometryHints.positionLocalNode ?? positionLocal;
  const fragmentWorldPosition = geometryHints.positionWorldNode ?? positionWorld;
  const objectWorldPosition = geometryHints.objectPositionNode ?? modelPosition;
  const worldMatrix = geometryHints.modelWorldMatrixNode ?? modelWorldMatrix;
  const worldMatrixInverse = geometryHints.modelWorldMatrixInverseNode
    ?? modelWorldMatrixInverse;
  const hasVertexColors = geometryHints.hasVertexColors === true
    || Boolean(geometryHints.vertexColorNode);
  const vertexWeight = geometryHints.vertexColorNode
    ? vec3(geometryHints.vertexColorNode)
    : hasVertexColors
      ? vertexColor().rgb
      : vec3(1);
  const linearColors = {
    bottom: linearizeToonLabColorProperty(values.bottomColor),
    specular: linearizeToonLabColorProperty(values.specularColor),
    textureTint: linearizeToonLabColorProperty(values.textureTint),
    tip: linearizeToonLabColorProperty(values.tipColor),
  };

  let foliageSample = null;
  let colorNode;
  if (values.useTexture) {
    // Foliage Texture.useTilingAndOffset=false in the source graph: the
    // material record's serialized scale/offset are deliberately not applied.
    foliageSample = texture(foliageMap).sample(surfaceUv);
    colorNode = foliageSample.rgb.mul(vec3(...linearColors.textureTint.slice(0, 3)));
  } else {
    let resolvedTipColor = vec3(...linearColors.tip.slice(0, 3));
    if (!values.useSolidTipColor) {
      const noiseUv = vec2(
        fragmentWorldPosition.x,
        float(fragmentWorldPosition.z).negate(),
      ).div(values.hueVariationScale);
      const tipNoise = texture(noiseMap).sample(noiseUv).r;
      const gradientTip = sampleToonLabGradientNode(tipNoise);
      const tipDistance = distanceRamp(
        distance(cameraPosition, fragmentWorldPosition),
        TOONLAB_SCENE_FOLIAGE_GRAPH.tipDistanceRange[0],
        TOONLAB_SCENE_FOLIAGE_GRAPH.tipDistanceRange[1],
      );
      resolvedTipColor = mix(
        gradientTip,
        vec3(...linearColors.tip.slice(0, 3)),
        tipDistance,
      );
    }
    // This is raw UV0.g, not saturate(UV0.g) and not _Height_Blend.
    colorNode = mix(
      vec3(...linearColors.bottom.slice(0, 3)),
      resolvedTipColor,
      surfaceUv.y,
    );
  }

  const hueSeed = vec2(
    objectWorldPosition.x,
    float(objectWorldPosition.z).negate(),
  )
    .mul(TOONLAB_SCENE_FOLIAGE_GRAPH.hueObjectPositionScale);
  const random = fract(sin(hueSeed.dot(vec2(
    ...TOONLAB_SCENE_FOLIAGE_GRAPH.randomDot,
  ))).mul(TOONLAB_SCENE_FOLIAGE_GRAPH.randomMultiplier));
  const hueOffset = mix(
    float(-values.hueVariation),
    float(values.hueVariation),
    random,
  ).add(values.hueShift);
  colorNode = toonLabSceneFoliageHueNormalized(colorNode, hueOffset);

  const fragmentDistance = distance(cameraPosition, fragmentWorldPosition);
  const cameraDistanceTarget = values.objectDistanceForFade
    ? objectWorldPosition
    : fragmentWorldPosition;
  const cameraVisibility = distanceRamp(
    distance(cameraPosition, cameraDistanceTarget),
    values.minCameraFadeDistance,
    values.maxCameraFadeDistance,
  );
  const cameraDither = toonLabSceneFoliageDither(
    cameraVisibility.mul(
      TOONLAB_SCENE_FOLIAGE_GRAPH.cameraDitherMultiplier,
    ),
    screenCoordinate.xy,
  );
  const fragmentDistanceVisibility = distanceFadeVisibility(
    fragmentDistance,
    values.startFadeDistance,
    values.endFadeDistance,
  );
  const distanceDither = toonLabSceneFoliageDither(
    fragmentDistanceVisibility.mul(
      TOONLAB_SCENE_FOLIAGE_GRAPH.distanceDitherMultiplier,
    ),
    screenCoordinate.xy,
  );
  const textureAlpha = foliageSample ? foliageSample.a : float(1);
  const opacityNode = textureAlpha.mul(cameraDither).mul(distanceDither);

  const timeNode = geometryHints.timeNode ?? state?.uniforms?.time ?? float(0);
  const windUv = surfaceUv.add(vec2(
    timeNode.mul(values.windSpeed),
    0,
  ));
  const windNoise = toonLabSceneFoliageGradientNoise(
    windUv,
    float(values.windIntensity),
  );
  const windOffset = vec3(
    ...TOONLAB_SCENE_FOLIAGE_GRAPH.runtimeWindDirection,
  ).mul(windNoise).mul(values.windWeight).mul(vertexWeight);
  // _LOD bypasses only the wind branch in the source graph. The world-space
  // Additional Z Offset (wired to Vector3.Y) remains active for MV_Grass_LOD.
  const windPositionLocal = values.lod || !values.useWind
    ? localPosition
    : localPosition.add(windOffset);
  const windPositionWorld = worldMatrix.mul(vec4(windPositionLocal, 1)).xyz;
  const liftedPositionWorld = windPositionWorld.add(
    vec3(0, values.liftOffset, 0).mul(vertexWeight),
  );
  const displacedPositionLocal = worldMatrixInverse
    .mul(vec4(liftedPositionWorld, 1))
    .xyz;
  const authoredWorldPosition = worldMatrix.mul(vec4(localPosition, 1)).xyz;
  const vertexDistanceVisibility = distanceFadeVisibility(
    distance(cameraPosition, authoredWorldPosition),
    values.startFadeDistance,
    values.endFadeDistance,
  );
  const positionNode = vertexDistanceVisibility
    .lessThan(TOONLAB_SCENE_FOLIAGE_GRAPH.distanceFadeOutThreshold)
    .select(localPosition, displacedPositionLocal);

  const material = new MeshPhysicalNodeMaterial();
  material.name = `ToonLab:${values.materialName}`;
  material.side = THREE.DoubleSide;
  material.forceSinglePass = true;
  material.depthTest = true;
  material.depthWrite = true;
  material.colorNode = colorNode;
  material.emissiveNode = colorNode.mul(values.emissiveStrength);
  material.metalnessNode = float(0);
  material.roughnessNode = clamp(float(1 - values.smoothness), 0, 1);
  material.specularColorNode = vec3(...linearColors.specular.slice(0, 3));
  material.specularIntensityNode = float(1);
  // TOONLAB leaves the interpolated normal unchanged on Cull Off foliage. Avoid
  // Three's default DoubleSide back-face negate, which is a different graph.
  material.normalNode = normalViewGeometry;
  installToonLabMaterialPassCoupling(material, {
    alphaChannel: '(UseTexture ? FoliageTexture.a : 1) * camera dither * distance dither',
    alphaNode: opacityNode,
    alphaThreshold: values.alphaClipThreshold,
    positionMode: 'deformed',
    positionNode,
    shaderName: TOONLAB_SCENE_FOLIAGE_SHADER,
  });
  material.userData.toonLabMaterial = {
    contract: {
      alpha: '(UseTexture ? FoliageTexture.a : 1) * SG_CameraDithering * SG_DistanceFade',
      alphaClip: `AlphaDiscard(alpha, ${values.alphaClipThreshold}); equality survives`,
      baseColor: values.useTexture
        ? 'HueNormalized(FoliageTexture.rgba * TextureTint).rgb'
        : 'HueNormalized(lerp(BottomColor,resolvedTipColor,UV0.g))',
      cameraDither: 'Dither(saturate(remap(distance(CameraWS,ObjectOrFragmentWS),Min,Max))*2)',
      colorProperties: 'ColorMode.Default serialized sRGB -> linear before graph math',
      distanceFade: 'Dither(saturate(remap(distance(PositionWS,CameraWS),Start,End,1,0))*2)',
      gradient: 'SampleGradientV1 Linear Blend; four exact UInt16-position color keys',
      heightBlend: '_Height_Blend disconnected; UV0.g is the final Lerp T',
      hue: 'HueMode.Normalized; RandomRange(ObjectPositionWS.xz*10,-variation,+variation)+shift',
      reflectedWorldBasis: 'source ToonLab XZ = ToonLab vec2(world.x,-world.z)',
      lighting: 'TOONLAB Universal Lit specular workflow; Specular port is direct F0',
      normal: 'Cull Off; unmodified interpolated geometry normal on back faces',
      sampler: 'canonical manifest texture import state',
      smoothness: values.smoothness,
      vertex: '_LOD bypasses wind only; lift remains; fully faded vertices bypass WPO',
      wind: 'GradientNoise(TilingAndOffset(UV0, Time*vec2(speed,0)), intensity) * reflectedObjectVector(1,0,1) * weight * COLOR.rgb',
    },
    exactInputs: true,
    graphExact: true,
    linearColorProperties: {
      bottom: [...linearColors.bottom],
      specular: [...linearColors.specular],
      textureTint: [...linearColors.textureTint],
      tip: [...linearColors.tip],
    },
    materialIndex: values.materialIndex,
    reconstruction: 'toonlab-s-foliage-record',
    sourceMaterial: values.materialName,
    sourceShader: TOONLAB_SCENE_FOLIAGE_SHADER,
    switches: {
      cameraDistanceSource: values.objectDistanceForFade ? 'object' : 'fragment',
      hasVertexColors,
      heightBlendPropertyConnected: false,
      lodWindBypass: values.lod,
      useSolidTipColor: values.useSolidTipColor,
      useTexture: values.useTexture,
      useWind: values.useWind,
    },
    textures: {
      foliage: needsFoliageTexture
        ? textureRecordSummary(manifest, values.foliageTextureIndex)
        : null,
      noise: needsNoiseTexture
        ? textureRecordSummary(manifest, values.noiseTextureIndex)
        : null,
    },
  };
  material.userData.toonLabNormalIntegration =
    createToonLabNormalIntegrationMetadata({
      coordinateZSign: -1,
      decode: 'geometry-only; Cull Off preserves interpolated normal on back faces',
      family: 'toonlab-environment-scene-foliage',
      textureFlipY: true,
    });
  installToonLabSurfaceLighting(material, { workflow: 'specular' });
  return material;
}
