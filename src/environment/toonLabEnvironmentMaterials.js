// ToonLab-authoritative ToonLab foliage and Terrain/Lit inputs.
//
// Values below are taken from MV_Grass + M_Foliage and the eight TL_*.terrainlayer
// assets in the supplied ToonLab project. Licensed textures are populated
// by scripts/toonlab/extract-environment-baseline.mjs under assets-local/.

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
import { installToonLabMaterialPassCoupling } from './toonLabMaterialPassCoupling.js';
import { assertToonLabTextureUploadReady } from './toonLabTextureReadiness.js';
import { installToonLabSurfaceLighting } from './toonLabSurfaceLighting.js';

export const DEFAULT_TOONLAB_ENVIRONMENT_BASE_URL = null;

export const TOONLAB_GRASS = Object.freeze({
  sourceMaterial: 'MV_Grass',
  sourceGraph: 'S_FoliageShader',
  shaderGuid: '9def86e0e2fee9a4a8b1dbb313e05b9f',
  bottomColor: Object.freeze([0.35493752, 0.631, 0.25813636]),
  tipColor: Object.freeze([0.5241386, 0.7924528, 0.34015664]),
  specularColor: Object.freeze([0.17273237, 0.511, 0.057577446]),
  smoothness: 0.05,
  emissiveStrength: 0.03,
  hueVariationScale: 50,
  startFadeDistance: 80,
  endFadeDistance: 100,
  alphaClipThreshold: 0.9,
  additionalYOffset: 0.2,
  windIntensity: 10,
  windSpeed: 0.1,
  windWeight: 0.05,
  hueVariation: 0,
  hueShift: 0,
  useSolidTipColor: false,
  gradient: Object.freeze([
    Object.freeze({ color: Object.freeze([0.4357688, 0.894, 0.03144722]), position: 0 }),
    Object.freeze({ color: Object.freeze([0.243, 0.702, 0.043875]), position: 0.2735332 }),
    Object.freeze({ color: Object.freeze([0.1446691, 0.5660378, 0.01334995]), position: 0.6558785 }),
    Object.freeze({ color: Object.freeze([0.7573569, 0.879, 0.05892735]), position: 0.9499962 }),
  ]),
});

export const TOONLAB_GRASS_VARIANTS = Object.freeze({
  grass: Object.freeze({
    sourceMaterial: 'MV_Grass',
  }),
  snow: Object.freeze({
    sourceMaterial: 'MV_GrassSnow',
    bottomColor: Object.freeze([0.735849, 0.735849, 0.735849]),
    tipColor: Object.freeze([0.67637706, 0.791317, 0.809]),
    specularColor: Object.freeze([0.025364896, 0.3272502, 0.3584906]),
    smoothness: 0.039,
    hueVariation: 0.08,
    useSolidTipColor: true,
  }),
  desert: Object.freeze({
    sourceMaterial: 'MV_GrassDesert',
    bottomColor: Object.freeze([0.7830189, 0.5712707, 0.40258992]),
    tipColor: Object.freeze([0.72300005, 0.61576706, 0.138093]),
    specularColor: Object.freeze([0.5566038, 0.41351464, 0.27042544]),
    smoothness: 0.253,
    hueVariation: 0.02,
    useSolidTipColor: true,
  }),
});

export const TOONLAB_TERRAIN_LAYERS = Object.freeze({
  DesertDirt: Object.freeze({ diffuse: 'T_DesertDirt_BC.png', normal: null, tileSize: 26, metallic: 0.438, smoothness: 0.38, normalScale: 1 }),
  DesertGrass: Object.freeze({ diffuse: 'T_DesertGrass_BC.png', normal: null, tileSize: 10, metallic: 0.499, smoothness: 0.405, normalScale: 0.2 }),
  DesertSand: Object.freeze({ diffuse: 'T_DesertSand_BC.png', normal: 'T_DesertSand_N.png', tileSize: 20, metallic: 0.499, smoothness: 0.405, normalScale: 0.2 }),
  Dirt: Object.freeze({ diffuse: 'T_Dirt_BC.png', normal: 'T_Dirt_N.png', tileSize: 16, metallic: 0, smoothness: 0, normalScale: 1 }),
  Grass: Object.freeze({ diffuse: 'T_Grass2_BC.png', normal: null, tileSize: 12, metallic: 0.099, smoothness: 0.25, normalScale: 1 }),
  Rock: Object.freeze({ diffuse: 'T_RockClassic_BC.PNG', normal: 'T_RockClassic_N.PNG', tileSize: 32, metallic: 0, smoothness: 0, normalScale: 1 }),
  Sand: Object.freeze({ diffuse: 'T_Sand.png', normal: 'T_Sand_N.png', tileSize: 12, metallic: 0.614, smoothness: 0.228, normalScale: 1 }),
  Snow: Object.freeze({ diffuse: 'T_Snow_BC.PNG', normal: null, tileSize: 32, metallic: 0.791, smoothness: 0, normalScale: 1 }),
});

const textureCache = new Map();
let terrainTexturePromise = null;

function loadToonLabEnvironmentTexture(name, {
  baseUrl = DEFAULT_TOONLAB_ENVIRONMENT_BASE_URL,
  normal = false,
} = {}) {
  if (typeof baseUrl !== 'string' || !baseUrl.trim()) {
    throw new Error('A configured environment texture baseUrl is required.');
  }
  const url = `${baseUrl}/textures/${name}`;
  const cacheKey = `${url}|normal:${normal ? 1 : 0}`;
  if (!textureCache.has(cacheKey)) {
    textureCache.set(cacheKey, new THREE.TextureLoader().loadAsync(url).then((map) => {
      assertToonLabTextureUploadReady(
        map,
        `ToonLab environment texture ${url}`,
      );
      map.name = `ToonLab:${name}`;
      map.colorSpace = normal ? THREE.NoColorSpace : THREE.SRGBColorSpace;
      map.wrapS = THREE.RepeatWrapping;
      map.wrapT = THREE.RepeatWrapping;
      map.magFilter = THREE.LinearFilter;
      // Every copied source texture declares ToonLab FilterMode.Bilinear (not
      // trilinear) and anisotropic level 1 in its texture import.
      map.minFilter = THREE.LinearMipmapNearestFilter;
      map.generateMipmaps = true;
      map.anisotropy = 1;
      map.needsUpdate = true;
      return map;
    }).catch((error) => {
      textureCache.delete(cacheKey);
      throw new Error(
        `Missing extracted ToonLab environment texture ${url}. Run `
        + '`node scripts/toonlab/extract-environment-baseline.mjs`.',
        { cause: error },
      );
    }));
  }
  return textureCache.get(cacheKey);
}

export function resolveToonLabGrassVariant(profile) {
  if (profile?.family !== 'foliage') return false;
  const identity = `${profile.path ?? ''}|${profile.name ?? ''}`;
  if (/(?:^|[./|])MI_GrassSnow(?:_NoRVT)?(?:_LOD[12])?(?:[.|]|$)/.test(identity)) {
    return 'snow';
  }
  if (/(?:^|[./|])MI_Grass(?:_NoRVT)?_DesertDemo(?:_LOD[12])?(?:[.|]|$)/.test(identity)) {
    return 'desert';
  }
  if (/(?:^|[./|])MI_Grass(?:_NoRVT)?(?:_LOD[12])?(?:[.|]|$)/.test(identity)) {
    return 'grass';
  }
  return null;
}

export function isToonLabGrassProfile(profile) {
  return Boolean(resolveToonLabGrassVariant(profile));
}

export function toonLabGrassCastsShadow(profile) {
  // P_Grass1/P_Grass2 override MeshRenderer.m_CastShadows to Off on every LOD.
  return !isToonLabGrassProfile(profile);
}

export async function loadToonLabTerrainTextures(options = {}) {
  if (!terrainTexturePromise) {
    terrainTexturePromise = Promise.all(Object.entries(TOONLAB_TERRAIN_LAYERS)
      .map(async ([name, layer]) => [name, {
        ...layer,
        diffuseMap: await loadToonLabEnvironmentTexture(layer.diffuse, options),
        normalMap: layer.normal
          ? await loadToonLabEnvironmentTexture(layer.normal, { ...options, normal: true })
          : null,
      }]))
      .then((entries) => Object.freeze(Object.fromEntries(entries)))
      .catch((error) => {
        terrainTexturePromise = null;
        throw error;
      });
  }
  return terrainTexturePromise;
}

const toonLabDither = wgslFn(`
  fn toonLabFoliageDither(inputValue: f32, pixelPosition: vec2<f32>) -> f32 {
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

const toonLabGradientNoise = wgslFn(`
  fn toonLabFoliageGradientNoise(sourceUv: vec2<f32>, scale: f32) -> f32 {
    let p = sourceUv * scale;
    let ip = floor(p);
    var fp = fract(p);
    let d00 = dot(toonLabFoliageGradientDirection(ip), fp);
    let d01 = dot(toonLabFoliageGradientDirection(ip + vec2<f32>(0.0, 1.0)), fp - vec2<f32>(0.0, 1.0));
    let d10 = dot(toonLabFoliageGradientDirection(ip + vec2<f32>(1.0, 0.0)), fp - vec2<f32>(1.0, 0.0));
    let d11 = dot(toonLabFoliageGradientDirection(ip + vec2<f32>(1.0, 1.0)), fp - vec2<f32>(1.0, 1.0));
    fp = fp * fp * fp * (fp * (fp * 6.0 - 15.0) + 10.0);
    return mix(mix(d00, d01, fp.y), mix(d10, d11, fp.y), fp.x) + 0.5;
  }

  fn toonLabFoliageGradientDirection(p: vec2<f32>) -> vec2<f32> {
    let x = toonLabFoliageHashTchou(p);
    return normalize(vec2<f32>(x - floor(x + 0.5), abs(x) - 0.5));
  }

  fn toonLabFoliageHashTchou(p: vec2<f32>) -> f32 {
    var v = vec2<u32>(vec2<i32>(round(p)));
    v.y = v.y ^ 1103515245u;
    v.x = v.x + v.y;
    v.x = v.x * v.y;
    v.x = v.x ^ (v.x >> 5u);
    v.x = v.x * 668265261u;
    return f32(v.x >> 8u) * (1.0 / f32(0x00ffffffu));
  }
`);

const toonLabHueNormalized = wgslFn(`
  fn toonLabFoliageHueNormalized(inputColor: vec3<f32>, offset: f32) -> vec3<f32> {
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
    let d = q.x - min(q.w, q.y);
    let e = 1e-4;
    let value = select(q.x + e, q.x, d == 0.0);
    var hue = abs(q.z + (q.w - q.y) / (6.0 * d + e)) + offset;
    hue = select(hue, hue + 1.0, hue < 0.0);
    hue = select(hue, hue - 1.0, hue > 1.0);
    let hsv = vec3<f32>(hue, d / (q.x + e), value);
    let k2 = vec4<f32>(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    let p2 = abs(fract(hsv.xxx + k2.xyz) * 6.0 - k2.www);
    return hsv.z * mix(k2.xxx, clamp(p2 - k2.xxx, vec3<f32>(0.0), vec3<f32>(1.0)), hsv.y);
  }
`);

function toonLabGrassGradient(value) {
  const keys = TOONLAB_GRASS.gradient;
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

/**
 * Exact connected MV_Grass graph outputs adapted to Three's physical material.
 * Lighting integration is the engine bridge; color/alpha/WPO/PBR inputs remain
 * literal ToonLab graph logic and values.
 */
export async function buildToonLabGrassMaterial(profile, {
  baseUrl = null,
  hasVertexColors = false,
  state = null,
} = {}) {
  const variantId = resolveToonLabGrassVariant(profile) ?? 'grass';
  const variant = TOONLAB_GRASS_VARIANTS[variantId];
  const values = { ...TOONLAB_GRASS, ...variant };
  const noiseMap = await loadToonLabEnvironmentTexture(
    'T_NoiseRough_SplatterMap.png',
    { baseUrl },
  );
  const noiseUv = vec2(positionWorld.x, positionWorld.z).div(values.hueVariationScale);
  const tipNoise = texture(noiseMap).sample(noiseUv).r;
  const gradientTip = toonLabGrassGradient(tipNoise);
  const tipDistance = clamp(
    distance(cameraPosition, positionWorld).sub(30).div(50),
    0,
    1,
  );
  const distanceTipColor = mix(gradientTip, vec3(...values.tipColor), tipDistance);
  const tipColor = values.useSolidTipColor
    ? vec3(...values.tipColor)
    : distanceTipColor;
  let colorNode = mix(vec3(...values.bottomColor), tipColor, clamp(uv().y, 0, 1));
  const hueSeed = vec2(modelPosition.x, modelPosition.z).mul(10);
  const random = fract(sin(hueSeed.dot(vec2(12.9898, 78.233))).mul(43758.5453));
  const hueOffset = random.mul(2).sub(1).mul(values.hueVariation).add(values.hueShift);
  colorNode = toonLabHueNormalized(colorNode, hueOffset);

  const material = new MeshPhysicalNodeMaterial();
  material.side = THREE.DoubleSide;
  material.forceSinglePass = true;
  material.depthTest = true;
  material.depthWrite = true;
  material.colorNode = colorNode;
  material.emissiveNode = colorNode.mul(values.emissiveStrength);
  material.metalnessNode = float(0);
  material.roughnessNode = float(1 - values.smoothness);
  material.specularColorNode = vec3(...values.specularColor);
  material.specularIntensityNode = float(1);

  const radialDistance = distance(cameraPosition, positionWorld);
  const distanceVisibility = clamp(
    float(values.endFadeDistance).sub(radialDistance)
      .div(values.endFadeDistance - values.startFadeDistance),
    0,
    1,
  );
  const ditheredOpacity = toonLabDither(distanceVisibility.mul(2), screenCoordinate.xy);

  const vertexWeight = hasVertexColors ? vertexColor().rgb : vec3(1);
  const isLod = /_LOD[12](?:[.|]|$)/.test(`${profile?.path ?? ''}|${profile?.name ?? ''}`);
  const timeNode = state?.uniforms?.time ?? float(0);
  const animatedUv = uv().add(vec2(timeNode.mul(values.windSpeed), 0));
  const windNoise = toonLabGradientNoise(animatedUv, float(values.windIntensity));
  const windOffset = isLod
    ? vec3(0)
    : vec3(windNoise, 0, windNoise).mul(values.windWeight).mul(vertexWeight);
  const windPositionWorld = modelWorldMatrix.mul(vec4(positionLocal.add(windOffset), 1)).xyz;
  const liftedPositionWorld = windPositionWorld.add(
    vec3(0, values.additionalYOffset, 0).mul(vertexWeight),
  );
  const positionNode = modelWorldMatrixInverse.mul(vec4(liftedPositionWorld, 1)).xyz;
  installToonLabMaterialPassCoupling(material, {
    alphaChannel: '1 * distance dither',
    alphaNode: ditheredOpacity,
    alphaThreshold: values.alphaClipThreshold,
    positionMode: 'deformed',
    positionNode,
    shaderName: 'ToonLab Graphs/S_FoliageShader',
  });
  material.userData.toonLabGrass = {
    sourceMaterial: values.sourceMaterial,
    variantId,
  };
  installToonLabSurfaceLighting(material, { workflow: 'specular' });
  return material;
}
