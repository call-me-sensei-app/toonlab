// Family-specific WebGPU reconstructions of the licensed ToonLab source
// materials. These consume the exact exported material-instance profiles and
// remain separate from ToonLab's generic environment shader.

import * as THREE from 'three';
import {
  MeshBasicNodeMaterial,
  MeshPhysicalNodeMaterial,
  MeshSSSNodeMaterial,
} from 'three/webgpu';
import {
  abs,
  cameraViewMatrix,
  cameraPosition,
  clamp,
  cos,
  cross,
  dot,
  faceDirection,
  float,
  fract,
  luminance,
  max,
  mix,
  mod,
  normalMap as normalMapNode,
  normalViewGeometry,
  normalWorld,
  normalWorldGeometry,
  normalize,
  positionLocal,
  positionView,
  positionWorld,
  pow,
  sign,
  sin,
  smoothstep,
  step,
  texture,
  transformNormalByViewMatrix,
  uniform,
  uv,
  vec2,
  vec3,
  vertexColor,
  wgslFn,
} from 'three/tsl';

import {
  loadToonLabMountainMaterial,
  loadToonRockMaterial,
} from '../rock-shader/rockMaterial.js';
import {
  sampleGroundColor,
  sampleGroundHeight,
  sampleGroundSurface,
} from '../shaders-tsl/chunks/environment-ground-field.js';
import {
  DEFAULT_TOONLAB_SOURCE_BASE_URL,
  TOONLAB_SHOWCASE_WEIGHTMAP_CONTRACT,
  toonLabScalar as scalar,
  toonLabSwitch as switchValue,
  toonLabTexturePath as texturePath,
  toonLabVector as vector,
} from './toonLabSourceLibrary.js';
import {
  loadToonLabRockMaterialIndex,
  resolveToonLabRockMaterial,
} from './toonLabRockMaterialResolver.js';
import {
  buildToonLabGrassMaterial,
  isToonLabGrassProfile,
  toonLabGrassCastsShadow,
} from './toonLabEnvironmentMaterials.js';
import {
  buildToonLabPineBarkMaterial,
  buildToonLabPineLeavesMaterial,
  isToonLabPineBarkProfile,
  isToonLabPineLeavesProfile,
} from './toonLabTreeMaterials.js';
import {
  installToonLabSurfaceLighting,
} from './toonLabSurfaceLighting.js';
import {
  SURFACE_MATERIAL_MODE,
  copySurfaceMaterialModes,
  registerSurfaceMaterialMode,
  resolveSurfaceMaterialMode,
} from './surfaceMaterialModes.js';
import { installToonLabSourceDefaultLitLighting } from './toonLabSourceDefaultLit.js';
import { installToonLabSourceSubsurfaceLighting } from './toonLabSourceSubsurfaceLighting.js';
import { toonLabSourceDitherTemporalAA } from './toonLabSourceTemporal.js';

const templateCaches = new WeakMap();
let toonRockMaterialIndexPromise = null;

const CURVE_ATLASES = Object.freeze({
  clouds: 'Atlas_Clouds',
  sky: 'Atlas_Sky',
  grass: 'Curve_Grass_Atlas',
  leaves: 'Curve_Leaves_Atlas',
});

const LANDSCAPE_FUNCTION_TEXTURES = Object.freeze({
  autoCliffNoise: '/Game/ToonLab/Textures/Noise/T_NoiseStylized.T_NoiseStylized',
  desertDirtNormal: '/Game/ToonLab/Environment/Landscape/Textures/T_DesertDirt_Rocks_N.T_DesertDirt_Rocks_N',
  desertSandNormal: '/Game/ToonLab/Environment/Landscape/Textures/T_DesertSand_N.T_DesertSand_N',
  desertSandRoughness: '/Game/ToonLab/Textures/Noise/T_ChromaNoise_Bilinear.T_ChromaNoise_Bilinear',
  desertSandVariance: '/Game/ToonLab/Textures/Noise/T_NoiseRough_HighContrast.T_NoiseRough_HighContrast',
  dirtNormal: '/Game/ToonLab/Environment/Landscape/Textures/T_Dirt1_N.T_Dirt1_N',
  dirtRoughness: '/Game/ToonLab/Environment/Landscape/Textures/T_Dirt1_R.T_Dirt1_R',
  grassVariance: '/Game/ToonLab/Textures/Noise/T_NoiseRough.T_NoiseRough',
  sandNormal: '/Game/ToonLab/Environment/Landscape/Textures/T_Sand_N.T_Sand_N',
  sandRoughness: '/Game/ToonLab/Environment/Landscape/Textures/T_Sand_R.T_Sand_R',
  sparkleChroma: '/Game/ToonLab/Textures/Noise/T_ChromaNoise2x_Nearest.T_ChromaNoise2x_Nearest',
  sparkleMask: '/Game/ToonLab/Textures/Masks/T_SphereMask.T_SphereMask',
  snowSpecular: '/Game/ToonLab/Textures/Noise/T_ChromaNoise_Blurred.T_ChromaNoise_Blurred',
});

const CLOUD_LITE_TEXTURE =
  '/Game/ToonLab/Environment/Sky/Textures/CloudLayers/T_CloudLayer03.T_CloudLayer03';

const TOONLAB_SHOWCASE_SOURCE_ASSET = 'Demonstration_ToonLabShowcase';
const TOONLAB_SHOWCASE_COLORMAP =
  '/Game/ToonLab/Environment/Landscape/Textures/T_Grass_ColormapSnow.T_Grass_ColormapSnow';

/**
 * Restore renderer adapters that Three's NodeMaterial.clone() cannot copy.
 *
 * `setupLightingModel` is installed as an instance function by each adapter.
 * NodeMaterial.copy() enumerates the destination instance, so that source-only
 * function is silently absent from every cached-template clone unless it is
 * reinstalled here. Materials built through this module run in the ToonLab-authored
 * source stage; ToonLab-derived graphs therefore require the ToonLab-to-TOONLAB Lambert
 * energy / captured-SH boundary rather than the PI-premultiplied ToonLab-stage
 * boundary.
 */
export function rehydrateToonLabSourceMaterialLighting(material) {
  if (!material?.isNodeMaterial) return material;
  const defaultLitLighting = material.userData?.toonLabSourceDefaultLitLighting;
  if (defaultLitLighting) {
    installToonLabSourceDefaultLitLighting(material);
  }
  const toonLabLighting = material.userData?.toonLabSurfaceLighting;
  if (toonLabLighting) {
    installToonLabSurfaceLighting(material, {
      inputAdapter: 'toonlab-captured-scene-sh',
      workflow: toonLabLighting.workflow,
    });
  }
  if (material.userData?.toonLabSourceSubsurfaceLighting) {
    installToonLabSourceSubsurfaceLighting(material);
  }
  material.userData.toonLabSourceLightingClone = {
    lightingModel: defaultLitLighting
      ? 'toonlab-legacy-default-lit'
      : toonLabLighting
        ? 'toonlab-surface'
        : material.userData?.toonLabSourceSubsurfaceLighting
          ? 'toonlab-legacy-subsurface'
          : null,
    rehydrated: Boolean(
      defaultLitLighting
      || toonLabLighting
      || material.userData?.toonLabSourceSubsurfaceLighting
    ),
    sourceStageInputAdapter: toonLabLighting ? 'toonlab-captured-scene-sh' : null,
  };
  return material;
}

// ToonLab materials use shared sampler sources extensively. The target WebGPU
// adapter exposes 48 sampled textures but only 16 samplers, while Three's
// ordinary TextureNode path assigns one sampler binding to every filterable
// texture. Keep every ToonLab texture and coordinate input, but reproduce bilinear
// and trilinear filtering with samplerless textureLoad calls. The private
// texture clones are flagged Nearest/Nearest only to stop Three from allocating
// unused sampler bindings; filtering still happens below from their original
// authored sampler state.
const sourceSamplerlessTextureState = new WeakMap();
const sourceTextureSampleSamplerless = wgslFn(`
  fn sourceTextureSampleSamplerless(
    sourceTexture: texture_2d<f32>,
    sourceUv: vec2<f32>,
    addressMode: vec2<f32>,
    mipFilterMode: f32,
    maxAnisotropy: f32
  ) -> vec4<f32> {
    let levelCount = textureNumLevels(sourceTexture);
    let maxLevel = f32(levelCount - 1u);
    var lod = 0.0;
    var majorUv = vec2<f32>(0.0);
    var tapCount = 1u;
    if (mipFilterMode > 0.5 && levelCount > 1u) {
      let size0 = vec2<f32>(textureDimensions(sourceTexture, 0u));
      let dx = dpdx(sourceUv * size0);
      let dy = dpdy(sourceUv * size0);
      let dxLength = length(dx);
      let dyLength = length(dy);
      let major = select(dy, dx, dxLength >= dyLength);
      let majorLength = max(dxLength, dyLength);
      let authoredAnisotropy = clamp(maxAnisotropy, 1.0, 8.0);
      let minorLength = max(
        min(dxLength, dyLength),
        majorLength / authoredAnisotropy
      );
      lod = clamp(log2(max(minorLength, 1e-4)), 0.0, maxLevel);
      let anisotropicRatio = clamp(
        majorLength / max(minorLength, 1e-4),
        1.0,
        authoredAnisotropy
      );
      tapCount = min(8u, u32(ceil(anisotropicRatio)));
      majorUv = major / size0;
    }

    if (tapCount == 1u) {
      return sourceTextureAtLod(
        sourceTexture,
        sourceUv,
        lod,
        vec2<i32>(addressMode),
        mipFilterMode
      );
    }

    var accumulated = vec4<f32>(0.0);
    for (var index = 0u; index < 8u; index = index + 1u) {
      if (index < tapCount) {
        let offset = (f32(index) + 0.5) / f32(tapCount) - 0.5;
        accumulated = accumulated + sourceTextureAtLod(
          sourceTexture,
          sourceUv + majorUv * offset,
          lod,
          vec2<i32>(addressMode),
          mipFilterMode
        );
      }
    }
    return accumulated / f32(tapCount);
  }

  fn sourceTextureAtLod(
    sourceTexture: texture_2d<f32>,
    sourceUv: vec2<f32>,
    lod: f32,
    addressMode: vec2<i32>,
    mipFilterMode: f32
  ) -> vec4<f32> {
    let levelCount = textureNumLevels(sourceTexture);
    if (mipFilterMode > 0.5 && mipFilterMode < 1.5) {
      return sourceTextureBilinear(
        sourceTexture,
        sourceUv,
        u32(round(lod)),
        addressMode
      );
    }
    let lowLevel = u32(floor(lod));
    let highLevel = min(lowLevel + 1u, levelCount - 1u);
    let lowSample = sourceTextureBilinear(
      sourceTexture,
      sourceUv,
      lowLevel,
      addressMode
    );
    if (highLevel == lowLevel) {
      return lowSample;
    }
    let highSample = sourceTextureBilinear(
      sourceTexture,
      sourceUv,
      highLevel,
      addressMode
    );
    return mix(lowSample, highSample, fract(lod));
  }

  fn sourceTextureBilinear(
    sourceTexture: texture_2d<f32>,
    sourceUv: vec2<f32>,
    mipLevel: u32,
    addressMode: vec2<i32>
  ) -> vec4<f32> {
    let dimensions = vec2<i32>(textureDimensions(sourceTexture, mipLevel));
    let texel = sourceUv * vec2<f32>(dimensions) - vec2<f32>(0.5);
    let base = vec2<i32>(floor(texel));
    let weight = fract(texel);
    let x0 = sourceTextureAddressIndex(base.x, dimensions.x, addressMode.x);
    let x1 = sourceTextureAddressIndex(base.x + 1, dimensions.x, addressMode.x);
    let y0 = sourceTextureAddressIndex(base.y, dimensions.y, addressMode.y);
    let y1 = sourceTextureAddressIndex(base.y + 1, dimensions.y, addressMode.y);
    let a = textureLoad(sourceTexture, vec2<i32>(x0, y0), mipLevel);
    let b = textureLoad(sourceTexture, vec2<i32>(x1, y0), mipLevel);
    let c = textureLoad(sourceTexture, vec2<i32>(x0, y1), mipLevel);
    let d = textureLoad(sourceTexture, vec2<i32>(x1, y1), mipLevel);
    return mix(mix(a, b, weight.x), mix(c, d, weight.x), weight.y);
  }

  fn sourceTextureAddressIndex(index: i32, size: i32, mode: i32) -> i32 {
    if (mode == 1) {
      return ((index % size) + size) % size;
    }
    if (mode == 2) {
      let period = size * 2;
      let wrapped = ((index % period) + period) % period;
      return select(wrapped, period - wrapped - 1, wrapped >= size);
    }
    return clamp(index, 0, size - 1);
  }
`);

function sourceAddressMode(wrapping) {
  if (wrapping === THREE.RepeatWrapping) return 1;
  if (wrapping === THREE.MirroredRepeatWrapping) return 2;
  return 0;
}

function sourceUsesMipmaps(map) {
  return map.generateMipmaps !== false
    && map.minFilter !== THREE.NearestFilter
    && map.minFilter !== THREE.LinearFilter;
}

function sourceMipFilterMode(map) {
  if (!sourceUsesMipmaps(map)) return 0;
  if (map.minFilter === THREE.LinearMipmapNearestFilter
    || map.minFilter === THREE.NearestMipmapNearestFilter) return 1;
  return 2;
}

function createSamplerlessSourceTexture(map, cloneCache, prepared) {
  if (!map?.isTexture) return map;
  if (cloneCache.has(map)) return cloneCache.get(map);
  const clone = map.clone();
  clone.name = map.name;
  const state = Object.freeze({
    addressMode: Object.freeze([
      sourceAddressMode(map.wrapS),
      sourceAddressMode(map.wrapT),
    ]),
    anisotropy: map.anisotropy,
    magFilter: map.magFilter,
    minFilter: map.minFilter,
    mipFilterMode: sourceMipFilterMode(map),
  });
  clone.minFilter = THREE.NearestFilter;
  clone.magFilter = THREE.NearestFilter;
  clone.anisotropy = 1;
  clone.needsUpdate = true;
  sourceSamplerlessTextureState.set(clone, state);
  cloneCache.set(map, clone);
  prepared.push(clone);
  return clone;
}

function makeSourceTexturesSamplerless(maps, weightPackTextures = []) {
  const cloneCache = new WeakMap();
  const prepared = [];
  for (const [name, map] of Object.entries(maps)) {
    maps[name] = createSamplerlessSourceTexture(map, cloneCache, prepared);
  }
  const packs = weightPackTextures.map((map) =>
    createSamplerlessSourceTexture(map, cloneCache, prepared));
  return { count: prepared.length, packs };
}

function sourceTextureSample(map, coordinates, {
  anisotropic = false,
} = {}) {
  const samplerlessState = sourceSamplerlessTextureState.get(map);
  if (!samplerlessState) return texture(map).sample(coordinates);
  // WebGPU creates an sRGB texture format for exported ToonLab textures whose
  // metadata says sRGB. Both textureSample and textureLoad therefore return
  // working-linear values from the GPU. Applying colorSpaceToWorking here
  // decoded those values a second time and made the Landscape grass/dirt
  // several stops too dark. Linear mask/normal maps remain NoColorSpace and
  // use the same path without any transfer conversion.
  return sourceTextureSampleSamplerless(
    texture(map),
    coordinates,
    vec2(...samplerlessState.addressMode),
    float(samplerlessState.mipFilterMode),
    float(anisotropic ? samplerlessState.anisotropy : 1),
  );
}

function sourceSceneProfile(profile, sourceAssetName, sourceSceneVariant = null) {
  if (sourceAssetName !== TOONLAB_SHOWCASE_SOURCE_ASSET || !profile) return profile;
  // ToonLab's glTF exporter serializes the static-mesh slot name (`MI_Grass`),
  // while the authored ToonLabShowcase level overrides that slot with the NoRVT
  // instances. Reapply the level override before constructing the browser
  // material so the port uses the same snow colormap and avoids a missing-RVT
  // black fallback.
  const isToonLabShowcaseGrass = profile.family === 'foliage'
    && /MI_Grass(?:_NoRVT)?(?:_LOD[12])?\./.test(profile.path);
  if (!isToonLabShowcaseGrass) return profile;
  // Landscape AutoGrass is authored with MI_Grass itself and intentionally
  // samples the Landscape RVT. Only the manually placed static-mesh foliage
  // in the ToonLabShowcase level uses the NoRVT colormap override below.
  if (sourceSceneVariant === 'landscape-auto-grass') return profile;
  const next = structuredClone(profile);
  next.parameters.texture['Color Map'] = TOONLAB_SHOWCASE_COLORMAP;
  next.parameters.scalar['Grass Colormap Size'] = 50000;
  next.parameters.static_switch['UseColorMap?'] = true;
  next.parameters.static_switch['UseRVTColor?'] = false;
  next.parameters.static_switch['BlendWithLandscape?'] = false;
  next.parameters.static_switch['ShrinkOffgrassFoliage?'] = false;
  return next;
}

function pathName(path) {
  return String(path ?? '').split('.').at(-1)?.split('/').at(-1) ?? '';
}

function linearColor(values, fallback = [1, 1, 1]) {
  const color = Array.isArray(values) ? values : fallback;
  return vec3(color[0] ?? fallback[0], color[1] ?? fallback[1], color[2] ?? fallback[2]);
}

function cheapContrast(value, contrast) {
  return clamp(value.sub(0.5).mul(Number(contrast) + 1).add(0.5), 0, 1);
}

function stableUnit(value) {
  let hash = 2166136261;
  const text = String(value ?? '');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

function sourceUv(context, channel = 0) {
  if (channel === 2 && context.hasUv2) return uv(2);
  return uv();
}

function toonLabDirection(values, fallback = [0, 0, 1]) {
  const value = Array.isArray(values) ? values : fallback;
  // ToonLab (X,Y,Z) -> Three (X,Z,-Y).
  return normalize(vec3(
    value[0] ?? fallback[0],
    value[2] ?? fallback[2],
    -(value[1] ?? fallback[1]),
  ));
}

function sourceInstanceIdentity(profile, object = null) {
  // ToonLab's glTF export expands foliage instances into separate nodes and
  // does not serialize PerInstanceRandom. Reconstruct it in the uniform's
  // per-object update instead of putting object/instance nodes in a cached
  // graph: those nodes have no bound Object3D on non-instanced glTF meshes
  // during a material-template update and make the first rendered frame fail.
  const world = new THREE.Vector3();
  if (object?.isObject3D) object.getWorldPosition(world);
  const toonLabX = world.x * 100;
  const toonLabY = -world.z * 100;
  const key = `${profile?.path ?? ''}|${object?.name ?? ''}|${toonLabX.toFixed(4)}|${toonLabY.toFixed(4)}`;
  return {
    actorToonLab: [toonLabX, toonLabY],
    random: stableUnit(key),
  };
}

function sourcePerInstanceRandom(profile) {
  const fallback = sourceInstanceIdentity(profile).random;
  return uniform(fallback).onObjectUpdate(
    ({ object }) => sourceInstanceIdentity(profile, object).random,
  );
}

function toonLabHueShift(colorNode, amountNode) {
  // ToonLab's Engine HueShift material function is RotateAboutAxis around
  // normalize(1,1,1), followed by adding the source color. RotateAboutAxis
  // receives turns, not radians, and internally returns the position delta.
  const axis = vec3(1 / Math.sqrt(3));
  const angle = amountNode.mul(Math.PI * 2);
  const cosine = cos(angle);
  const sine = sin(angle);
  return colorNode.mul(cosine)
    .add(cross(axis, colorNode).mul(sine))
    .add(axis.mul(dot(axis, colorNode)).mul(float(1).sub(cosine)));
}

function sourceDesaturate(colorNode, fractionNode) {
  // ToonLabShowcase has r.LegacyLuminanceFactors=1, so ToonLab's Desaturation uses the
  // legacy 0.30/0.59/0.11 luminance vector rather than Rec.709.
  const grey = dot(colorNode, vec3(0.3, 0.59, 0.11));
  return mix(colorNode, vec3(grey), fractionNode);
}

function sourceScreen(baseNode, blendNode) {
  return vec3(1).sub(
    vec3(1).sub(baseNode).mul(vec3(1).sub(blendNode)),
  );
}

function sourceOverlay(baseNode, blendNode) {
  const low = baseNode.mul(blendNode).mul(2);
  const high = vec3(1).sub(
    vec3(1).sub(baseNode).mul(vec3(1).sub(blendNode)).mul(2),
  );
  return mix(low, high, step(vec3(0.5), baseNode));
}

function linearRemap(valueNode, inputLow, inputHigh, outputLow = 0, outputHigh = 1) {
  return valueNode
    .sub(inputLow)
    .div(Number(inputHigh) - Number(inputLow))
    .mul(Number(outputHigh) - Number(outputLow))
    .add(outputLow);
}

function rotateSourceUv(coordinates, turnsNode, center = vec2(0.5)) {
  const angle = turnsNode.mul(Math.PI * 2);
  const angleCos = cos(angle);
  const angleSin = sin(angle);
  const centered = coordinates.sub(center);
  return vec2(
    centered.x.mul(angleCos).sub(centered.y.mul(angleSin)),
    centered.x.mul(angleSin).add(centered.y.mul(angleCos)),
  ).add(center);
}

function sourcePixelDepthCm() {
  return positionView.z.negate().mul(100);
}

function sourceHueShiftAmount(profile, object = null, sourceActorIdentity = null) {
  const variation = scalar(profile, 'Hue Variation', 0);
  const shift = scalar(profile, 'Hue Shift', 0);
  const identity = sourceActorIdentity
    ? {
        actorToonLab: [
          Number(sourceActorIdentity.locationCm?.[0]) || 0,
          Number(sourceActorIdentity.locationCm?.[1]) || 0,
        ],
        random: Number(sourceActorIdentity.perInstanceRandom) || 0,
      }
    : sourceInstanceIdentity(profile, object);
  const [toonLabX, toonLabY] = identity.actorToonLab;
  const rawSeed = identity.random + toonLabX * 0.713145 + toonLabY * 0.713145;
  const seed = ((rawSeed % 1) + 1) % 1;
  const wave = Math.sin(seed * Math.PI * 2);
  const signedCube = wave * Math.abs(wave) * Math.abs(wave);
  return signedCube * variation + shift;
}

function sourceHueVariance(colorNode, profile, sourceActorIdentity = null) {
  const variation = scalar(profile, 'Hue Variation', 0);
  const shift = scalar(profile, 'Hue Shift', 0);
  if (variation === 0 && shift === 0) return colorNode;
  const hueAmount = uniform(sourceHueShiftAmount(
    profile,
    null,
    sourceActorIdentity,
  )).onObjectUpdate(
    ({ object }) => sourceHueShiftAmount(profile, object, sourceActorIdentity),
  );
  return toonLabHueShift(colorNode, hueAmount);
}

function lerpFive(a, b, c, d, e, timeNode) {
  const x = fract(timeNode).mul(4);
  let result = mix(a, b, clamp(x, 0, 1));
  result = mix(result, c, clamp(x.sub(1), 0, 1));
  result = mix(result, d, clamp(x.sub(2), 0, 1));
  return mix(result, e, clamp(x.sub(3), 0, 1));
}

function applyDayCycleEmission(inputNode, profile, state) {
  if (!switchValue(profile, 'UseDayCycleEmission?', true)) return inputNode;
  const day = scalar(profile, 'Day Emission Multiplier', 1);
  const cycle = lerpFive(
    day,
    scalar(profile, 'Sunset Emission Multiplier', 0.1),
    scalar(profile, 'Night Emission Multiplier', 0),
    scalar(profile, 'Sunrise Emission Multiplier', 0.1),
    day,
    state.uniforms.dayCycleProgress,
  );
  if (!switchValue(profile, 'UseWeather?', true)) return inputNode.mul(cycle);
  return inputNode.mul(mix(
    cycle,
    scalar(profile, 'Overcast Emission Multiplier', 0.25),
    clamp(state.uniforms.overcast, 0, 1),
  ));
}

function sourceEmission(colorNode, profile, state, emissiveMapNode = null) {
  let inputNode = colorNode.mul(scalar(profile, 'Emissive Strength', 0));
  const useEmissiveMap = switchValue(
    profile,
    'Emissive Map?',
    switchValue(profile, 'EmissiveMap?', false),
  );
  if (emissiveMapNode && useEmissiveMap) {
    inputNode = inputNode.mul(emissiveMapNode.rgb);
  }
  return applyDayCycleEmission(inputNode, profile, state);
}

function sourceTemporalDither(amountNode, state) {
  return toonLabSourceDitherTemporalAA(clamp(amountNode, 0, 1), state);
}

function sourceToonLabWorldXY(worldOffsetToonLabMeters = null) {
  if (worldOffsetToonLabMeters) {
    // The parity contract uses canonical metres (x,y,z), which Three renders
    // as (x,y,-z). ToonLab receives the canonical basis as (z,x,y), so the
    // retained Landscape horizontal basis is ToonLab X/Y = (-Three Z, Three X).
    return vec2(positionWorld.z.negate(), positionWorld.x).add(vec2(
      Number(worldOffsetToonLabMeters[0]) || 0,
      Number(worldOffsetToonLabMeters[1]) || 0,
    ));
  }
  // Ordinary glTF source meshes retain ToonLab (X,Y) -> Three (X,-Z).
  return vec2(positionWorld.x, positionWorld.z.negate());
}

function planarAtToonLabWorldXY(map, sourceWorld, scaleMeters, offset = null) {
  const scale = max(float(Math.max(Number(scaleMeters) || 1, 0.001)), 0.001);
  let coordinates = sourceWorld.div(scale);
  if (offset) coordinates = coordinates.add(vec2(offset[0] ?? 0, offset[1] ?? 0));
  return sourceTextureSample(map, coordinates);
}

function planar(map, scaleMeters, offset = null) {
  return planarAtToonLabWorldXY(map, sourceToonLabWorldXY(), scaleMeters, offset);
}

function planarCentered(
  map,
  scaleXMeters,
  scaleYMeters,
  offsetX = 0,
  offsetY = 0,
  worldOffsetToonLabMeters = null,
) {
  const scale = vec2(
    Math.max(Number(scaleXMeters) || 1, 0.001),
    Math.max(Number(scaleYMeters) || 1, 0.001),
  );
  const sourceWorld = sourceToonLabWorldXY(worldOffsetToonLabMeters);
  const coordinates = sourceWorld.div(scale).add(
    vec2(0.5 + Number(offsetX || 0), 0.5 + Number(offsetY || 0)),
  );
  return sourceTextureSample(map, coordinates);
}

function landscapeLayerCoordinates(
  sourceAssetName,
  record = null,
  worldOffsetToonLabMeters = null,
) {
  const sourceContract = sourceAssetName === TOONLAB_SHOWCASE_SOURCE_ASSET
    ? TOONLAB_SHOWCASE_WEIGHTMAP_CONTRACT
    : null;
  const originCm = record?.originCm ?? sourceContract?.originCm ?? [0, 0];
  const quadScaleCm = record?.quadScaleCm ?? sourceContract?.quadScaleCm ?? [100, 100];
  // Canonical metres map to ToonLab centimetres as (z,x,y). Three renders
  // canonical Z with the opposite sign, therefore the retained Landscape
  // horizontal basis is ToonLab X/Y = (-Three Z, Three X).
  const toonLabWorldMeters = sourceToonLabWorldXY(worldOffsetToonLabMeters);
  const toonLabWorldCm = toonLabWorldMeters.mul(100);
  return toonLabWorldCm
    .sub(vec2(originCm[0], originCm[1]))
    .div(vec2(quadScaleCm[0], quadScaleCm[1]));
}

function landscapeWindColor(profile, state, maps, sourceWorld = sourceToonLabWorldXY()) {
  if (!switchValue(profile, 'UseWindColor?', false)
    || !maps['Wind Color Noise']
    || !maps['Wind Color Mask']) {
    return float(0);
  }
  const windSize = Math.max(scalar(profile, 'Wind Size', 8000) / 100, 0.001);
  const worldUv = sourceWorld.div(windSize);
  const rotated = rotateSourceUv(worldUv, state.uniforms.windAngle);
  const speed = state.uniforms.windSpeed;
  const noiseUv = rotated.add(vec2(
    state.uniforms.time.mul(speed).mul(0.04),
    0,
  ));
  const maskSize = scalar(profile, 'Mask Size', 1.5);
  const maskUv = rotated
    .mul(vec2(maskSize, maskSize * 0.6))
    .add(vec2(
      state.uniforms.time.mul(speed).mul(0.06),
      state.uniforms.time.mul(speed).mul(0.02),
    ));
  return sourceTextureSample(maps['Wind Color Noise'], noiseUv).r
    .mul(sourceTextureSample(maps['Wind Color Mask'], maskUv).r)
    .mul(scalar(profile, 'Wind Mask Multiply', 3))
    .mul(clamp(state.uniforms.time, 0, 1));
}

function snowDayWeatherFactor(profile, state) {
  if (!switchValue(profile, 'SnowDayAndWeather?', true)) return float(1);
  const day = lerpFive(1, 0.4, 0.1, 0.4, 1, state.uniforms.dayCycleProgress);
  return mix(day, 0, clamp(state.uniforms.overcast, 0, 1));
}

function snowSparkleLayer(profile, state, maps, {
  brightnessName,
  rotationName,
  scaleName,
}) {
  if (!maps.sparkleChroma || !maps.sparkleMask) return vec3(0);
  const scaleCm = Math.max(scalar(profile, scaleName, 1600), 0.001);
  const scaleMeters = scaleCm / 100;
  const rotation = float(scalar(profile, rotationName, 0));
  const worldXY = vec2(positionWorld.x, positionWorld.z.negate());
  const rotated = switchValue(profile, 'NeedWorldRotation?', true)
    ? rotateSourceUv(worldXY, rotation, vec2(0))
    : worldXY;

  const chroma = sourceTextureSample(maps.sparkleChroma, rotated.div(scaleMeters)).rgb;
  const sparkleDirection = normalize(chroma.sub(0.5));
  const cameraVector = normalize(cameraPosition.sub(positionWorld));
  const facing = dot(cameraVector, sparkleDirection);
  let sparkleSignal = abs(facing);
  if (!switchValue(profile, 'SimpleSparkle?', false)) {
    const speed = Math.max(scalar(profile, 'Snow Twinkle Speed', 1), 0.001);
    const period = 1 / speed;
    const wave = mod(
      facing.add(9999).sub(period / 4),
      period,
    ).sub(period);
    // This is the exported non-simple triangle-wave branch: the final
    // Subtract node is (4 / period * abs(wave)) - 1, before tolerance remap.
    sparkleSignal = abs(wave).mul(4 / period).sub(1);
  }
  const tolerance = scalar(profile, 'Snow Twinkle Tolerance', 0.95);
  const angleMask = clamp(linearRemap(sparkleSignal, tolerance, 1), 0, 1);

  const sphere = sourceTextureSample(
    maps.sparkleMask,
    rotated.div(scaleMeters / 256),
  ).r;
  let sphereMask = sphere;
  if (switchValue(profile, 'SparklShrinkNear?', true)) {
    const shrinkAmount = scalar(profile, 'Snow Sparkle Shrink Amount', 0.3);
    const shrinkThreshold = clamp(linearRemap(
      sourcePixelDepthCm(),
      scalar(profile, 'Snow Sparkle Shrink Near Distance', 500),
      scalar(profile, 'Snow Shrink Far Distance', 1500),
      shrinkAmount,
      0,
    ), 0, shrinkAmount);
    sphereMask = clamp(
      sphere.sub(shrinkThreshold).div(max(float(1).sub(shrinkThreshold), 0.0001)),
      0,
      1,
    );
  }

  // The active source branch uses a volume-noise texture for additional
  // intensity variance. That VolumeTexture is not present in the supplied
  // browser manifest, so the only non-invented fallback is neutral variance.
  const topFacing = switchValue(profile, 'SparkleProject3D?', false)
    ? float(1)
    : clamp(linearRemap(normalWorldGeometry.y, 0.2, 0.5), 0, 1);
  let intensity = angleMask
    .mul(sphereMask)
    .mul(topFacing)
    .mul(scalar(profile, brightnessName, 20));

  if (switchValue(profile, 'SparkleDayAndWeather?', true)) {
    const day = lerpFive(1, 0.3, 0.3, 0.3, 1, state.uniforms.dayCycleProgress);
    const weather = mix(1, 0.75, clamp(state.uniforms.overcast, 0, 1));
    intensity = intensity.mul(day).mul(weather);
  }
  const distanceFade = clamp(linearRemap(
    sourcePixelDepthCm(),
    scalar(profile, 'Snow Sparkle Fade Start', 200),
    scalar(profile, 'Snow Sparkle Fade End', 2500),
    1,
    0,
  ), 0, 1);
  return linearColor(vector(profile, 'Snow Sparkle Color', [0.627031, 0.663767, 1]))
    .mul(intensity)
    .mul(distanceFade);
}

function snowSparkle(profile, state, maps) {
  if (!switchValue(profile, 'SnowSparkle?', true)) return vec3(0);
  let result = snowSparkleLayer(profile, state, maps, {
    brightnessName: 'Snow Sparkle Brightness',
    rotationName: 'Snow Sparkle Rotation',
    scaleName: 'Snow Sparkle Scale',
  });
  if (switchValue(profile, 'SnowSparkleDualLayer?', true)) {
    result = result.add(snowSparkleLayer(profile, state, maps, {
      brightnessName: 'Snow Sparkle 2 Brightness',
      rotationName: 'Snow Sparkle 2 Rotation',
      scaleName: 'Snow Sparkle 2 Scale',
    }));
  }
  return result;
}

function buildSnowNodes(profile, state, maps) {
  const colorNode = planar(
    maps['Snow Texture'],
    scalar(profile, 'Snow Scale', 5000) / 100,
  ).rgb;
  const specularNoise = maps.snowSpecular
    ? planar(
      maps.snowSpecular,
      scalar(profile, 'Snow Specular Scale', 75) / 100,
    ).r
    : float(0.5);
  const specularNode = mix(
    scalar(profile, 'Snow Spec Min', 0.1),
    scalar(profile, 'Snow Spec Max', 0.3),
    specularNoise,
  );
  const emissiveNode = colorNode
    .mul(scalar(profile, 'Snow Emission', 0.05))
    .mul(snowDayWeatherFactor(profile, state))
    .add(snowSparkle(profile, state, maps));
  return {
    colorNode,
    emissiveNode,
    metalnessNode: float(0),
    roughnessNode: float(scalar(profile, 'Snow Rough', 0.5)),
    specularNode,
  };
}

function sourceProfileCastsShadow(profile) {
  // ToonLab's grass prefabs explicitly disable cast shadows on every LOD. Other
  // families retain their scene/component shadow metadata.
  return toonLabGrassCastsShadow(profile);
}

function triplanar(map, scaleMeters, {
  contrast = 4,
  normalNode = normalWorld,
  sideOnly = false,
} = {}) {
  const scale = max(float(Math.max(Number(scaleMeters) || 1, 0.001)), 0.001);
  const projectionPower = Math.max(Number(contrast) || 0, 0.0001);
  const weights = pow(abs(normalNode), vec3(projectionPower));
  const weightX = weights.x;
  const weightY = sideOnly ? float(0) : weights.y;
  const weightZ = weights.z;
  const weightSum = max(weightX.add(weightY).add(weightZ), 0.0001);
  return sourceTextureSample(
    map,
    vec2(positionWorld.z.negate(), positionWorld.y).div(scale),
  ).mul(weightX)
    .add(sourceTextureSample(
      map,
      vec2(positionWorld.x, positionWorld.z.negate()).div(scale),
    ).mul(weightY))
    .add(sourceTextureSample(map, positionWorld.xy.div(scale)).mul(weightZ))
    .div(weightSum);
}

function unpackSourceNormal(sampleNode) {
  // ToonLab normal textures use the DirectX (+Y) convention. Source PNGs are
  // loaded without a vertical flip, so invert green before basis conversion.
  return vec3(
    sampleNode.r.mul(2).sub(1),
    float(1).sub(sampleNode.g.mul(2)),
    sampleNode.b.mul(2).sub(1),
  );
}

function sourceWorldAlignedNormal(map, scaleMeters, {
  contrast = 3,
  flatTop = false,
  sideOnly = false,
} = {}) {
  const scale = max(float(Math.max(Number(scaleMeters) || 1, 0.001)), 0.001);
  const projectionPower = Math.max(Number(contrast) || 0, 0.0001);
  const weights = pow(abs(normalWorldGeometry), vec3(projectionPower));
  const weightX = weights.x;
  const weightY = sideOnly ? float(0) : weights.y;
  const weightZ = weights.z;
  const weightSum = max(weightX.add(weightY).add(weightZ), 0.0001);

  const sampleX = unpackSourceNormal(
    sourceTextureSample(
      map,
      vec2(positionWorld.z.negate(), positionWorld.y).div(scale),
    ).rgb,
  );
  const sampleY = unpackSourceNormal(
    sourceTextureSample(
      map,
      vec2(positionWorld.x, positionWorld.z.negate()).div(scale),
    ).rgb,
  );
  const sampleZ = unpackSourceNormal(
    sourceTextureSample(map, positionWorld.xy.div(scale)).rgb,
  );
  const signX = sign(normalWorldGeometry.x);
  const signY = sign(normalWorldGeometry.y);
  const signZ = sign(normalWorldGeometry.z);
  const normalX = vec3(
    sampleX.z.mul(signX),
    sampleX.y,
    sampleX.x.negate().mul(signX),
  );
  const projectedY = vec3(
    sampleY.x.mul(signY),
    sampleY.z.mul(signY),
    sampleY.y.negate(),
  );
  const normalY = flatTop ? vec3(0, signY, 0) : projectedY;
  const normalZ = vec3(
    sampleZ.x.mul(signZ),
    sampleZ.y,
    sampleZ.z.mul(signZ),
  );
  return normalize(
    normalX.mul(weightX)
      .add(normalY.mul(weightY))
      .add(normalZ.mul(weightZ))
      .div(weightSum),
  );
}

function wetSurface(colorNode, roughnessNode, profile, state) {
  if (!switchValue(profile, 'UseWeather?', true)
    || !switchValue(profile, 'RainWetness?', true)) {
    return { colorNode, roughnessNode };
  }
  const wet = clamp(state.uniforms.rainWetness, 0, 1);
  const darkening = scalar(profile, 'Puddle Darkening', 0.18);
  const desaturation = scalar(profile, 'Puddle Desaturation', 0);
  const wetColor = sourceDesaturate(
    colorNode,
    wet.mul(desaturation),
  ).mul(float(1).sub(wet.mul(Math.min(darkening, 0.85))));
  return {
    colorNode: wetColor,
    roughnessNode: mix(
      roughnessNode,
      scalar(profile, 'Wet Roughness', 0.3),
      wet,
    ),
  };
}

function configureSourceSubsurface(material, colorNode, opacityNode, {
  thinCardTransmissionFallback = false,
} = {}) {
  // Keep the ToonLab graph inputs exact and isolate renderer translation here.
  // The thickness fields remain populated for graph inspection/backward
  // compatibility, but the installed lighting model evaluates ToonLab's
  // MSM_SUBSURFACE direct and front/back SkyLight equations instead of Three's
  // unrelated experimental half-vector thickness lobe.
  material.thicknessColorNode = colorNode;
  material.thicknessAttenuationNode = clamp(opacityNode, 0, 1);
  material.thicknessDistortionNode = float(0.1);
  material.thicknessAmbientNode = float(0);
  material.thicknessPowerNode = float(2);
  material.thicknessScaleNode = float(10);
  return installToonLabSourceSubsurfaceLighting(material, {
    subsurfaceColorNode: colorNode,
    subsurfaceOpacityNode: clamp(opacityNode, 0, 1),
    thinCardTransmissionFallback,
  });
}

function configureLeafSubsurface(
  material,
  colorNode,
  profile,
  state,
  textureColorNode = vec3(1),
  { thinCardTransmissionFallback = false } = {},
) {
  const colorCycle = lerpFive(1, 0.5, 0.4, 0.5, 1, state.uniforms.dayCycleProgress);
  const opacityCycle = lerpFive(1, 2, 3, 2, 1, state.uniforms.dayCycleProgress);
  return configureSourceSubsurface(
    material,
    colorNode
      .mul(textureColorNode)
      .mul(scalar(profile, 'SS Strength', 0.3))
      .mul(colorCycle),
    float(scalar(profile, 'SS Opacity', 0.08)).mul(opacityCycle),
    { thinCardTransmissionFallback },
  );
}

function configureFoliageSubsurface(
  material,
  colorNode,
  profile,
  { thinCardTransmissionFallback = false } = {},
) {
  return configureSourceSubsurface(
    material,
    colorNode.mul(scalar(profile, 'SS Strength', 0.3)),
    float(scalar(profile, 'SS Opacity', 0.08)),
    { thinCardTransmissionFallback },
  );
}

function windOffset(profile, state, {
  sway = false,
  weight = uv().y,
} = {}) {
  const enabled = switchValue(profile, 'UseWind?', false)
    || (sway && switchValue(profile, 'Tree Sway?', false));
  if (!enabled) return vec3(0);
  const direction = vec2(
    cos(state.uniforms.windAngle.mul(Math.PI * 2)),
    sin(state.uniforms.windAngle.mul(Math.PI * 2)),
  );
  const localPhase = positionLocal.x.mul(0.17).add(positionLocal.z.mul(0.13));
  const phase = state.uniforms.time
    .mul(state.uniforms.windSpeed)
    .mul(scalar(profile, 'Wind Speed', 0.5))
    .mul(Math.PI * 2)
    .add(localPhase);
  const flutter = sin(phase).mul(0.7).add(sin(phase.mul(1.71).add(1.3)).mul(0.3));
  const amplitude = scalar(profile, 'Wind Intensity', 0.8)
    * scalar(profile, 'Wind Weight', 0.25)
    / 100;
  let offset = vec3(direction.x, 0, direction.y)
    .mul(flutter)
    .mul(state.uniforms.windIntensity)
    .mul(amplitude)
    .mul(clamp(weight, 0, 1));
  if (sway && switchValue(profile, 'Tree Sway?', false)) {
    const swayPhase = state.uniforms.time.mul(state.uniforms.swaySpeed).add(localPhase.mul(0.35));
    const swayAmount = state.uniforms.swayLean
      .mul(scalar(profile, 'Sway Intensity Multiplier', 1))
      .div(100);
    offset = offset.add(
      vec3(direction.x, 0, direction.y)
        .mul(sin(swayPhase))
        .mul(swayAmount)
        .mul(clamp(weight, 0, 1)),
    );
  }
  return offset;
}

function foliageWindColor(profile, state, maps) {
  if (!switchValue(profile, 'UseWindColor?', false)
    || !maps['Wind Color Noise']
    || !maps['Wind Color Mask']) {
    return float(0);
  }
  const windSize = Math.max(scalar(profile, 'Wind Size', 8000) / 100, 0.001);
  const world = sourceToonLabWorldXY(state.userData?.worldOffsetToonLabMeters).div(windSize);
  const angle = state.uniforms.windAngle.mul(Math.PI * 2);
  const angleCos = cos(angle);
  const angleSin = sin(angle);
  const rotated = vec2(
    world.x.mul(angleCos).sub(world.y.mul(angleSin)),
    world.x.mul(angleSin).add(world.y.mul(angleCos)),
  );
  const speed = state.uniforms.windSpeed;
  const noiseUv = rotated.add(vec2(
    state.uniforms.time.mul(speed).mul(0.04),
    state.uniforms.time.mul(speed).mul(0.04),
  ));
  const maskSize = scalar(profile, 'Mask Size', 1.5);
  const maskUv = rotated
    .mul(vec2(maskSize, maskSize * 0.6))
    .add(vec2(
      state.uniforms.time.mul(speed).mul(0.06),
      state.uniforms.time.mul(speed).mul(0.02),
    ));
  const noise = sourceTextureSample(maps['Wind Color Noise'], noiseUv).r;
  const mask = sourceTextureSample(maps['Wind Color Mask'], maskUv).r;
  return noise
    .mul(mask)
    .mul(scalar(profile, 'Wind Mask Multiply', 3))
    .mul(clamp(state.uniforms.time, 0, 1));
}

function finalizeMaterial(material, profile, family) {
  material.name = `Source::${pathName(profile.path)}`;
  // The supplied sky and cloud domes are ordinary ToonLab surfaces with
  // IsSky=false. They participate in the level's exponential-height fog just
  // like the other source materials.
  material.fog = true;
  material.userData.environmentShaderExclude = true;
  material.userData.toonLabSource = {
    family,
    materialPath: profile.path,
    reconstruction: 'source-profile',
  };
  return material;
}

function setShaderSwipeBaseline(material, {
  alphaTestNode = null,
  colorNode = null,
  opacityNode = null,
} = {}) {
  // Keep comparison-only nodes out of NodeMaterial properties. Three/WebGPU
  // discovers arbitrary `*Node` fields while compiling a material; attaching
  // the raw baseline there makes the active P17 graph compile those extra
  // texture bindings too. A WeakMap keeps the diagnostic completely inert
  // until Live Preview explicitly asks for it.
  registerSurfaceMaterialMode(material, SURFACE_MATERIAL_MODE.neutralLit, {
    alphaTestNode,
    colorNode,
    keepsLighting: true,
    keepsTextures: true,
    opacityNode,
    vertexDeformation: false,
  });
  registerSurfaceMaterialMode(material, SURFACE_MATERIAL_MODE.rawTexture, {
    alphaTestNode,
    colorNode,
    keepsLighting: false,
    keepsTextures: true,
    opacityNode,
    vertexDeformation: false,
  });
  material.userData.shaderSwipeBaseline = {
    alpha: Boolean(opacityNode),
    mode: 'neutral-standard-lit-texture',
    vertexDeformation: false,
  };
  return material;
}

export function resolveToonLabShaderSwipeBaseline(material) {
  return resolveSurfaceMaterialMode(
    material,
    SURFACE_MATERIAL_MODE.neutralLit,
  );
}

function recordSourceContract(material, contract) {
  material.userData.toonLabSource.contract = contract;
  return material;
}

function createStateUniforms(snapshot) {
  const scalarValue = (name, fallback) => Number.isFinite(snapshot.scalars[name])
    ? snapshot.scalars[name] : fallback;
  const vectorValue = (name, fallback) => snapshot.vectors[name] ?? fallback;
  const sun = vectorValue('Sun Light Direction', [0.35, 0.8, 0.4, 1]);
  const moon = vectorValue('Moon Light Direction', [-0.35, 0.6, -0.5, 1]);
  return {
    currentTime: uniform(scalarValue('Current Time', 0)),
    dayCycleProgress: uniform(scalarValue('Day Cycle Progress', 0)),
    dayLength: uniform(scalarValue('Day Length', 500)),
    moonDirection: uniform(new THREE.Vector3(moon[0], moon[2], -moon[1]).normalize()),
    nightLength: uniform(scalarValue('Night Length', 500)),
    overcast: uniform(scalarValue('Overcast', 0)),
    rainPuddles: uniform(scalarValue('Rain Puddles', 0)),
    rainStrength: uniform(scalarValue('Rain Strength', 0)),
    rainWetness: uniform(scalarValue('Rain Wetness', 0)),
    skyColor: uniform(new THREE.Color(0.45, 0.62, 0.9)),
    snowCover: uniform(0),
    sunDirection: uniform(new THREE.Vector3(sun[0], sun[1], sun[2]).normalize()),
    sunColor: uniform(new THREE.Color(1, 0.9, 0.72)),
    swayDamping: uniform(scalarValue('Global Sway Damping', 0.5)),
    swayLean: uniform(scalarValue('Global Sway Lean', 3)),
    swaySpeed: uniform(scalarValue('Global Sway Speed', 0.25)),
    time: uniform(scalarValue('Current Time', 0)),
    weatherAtmosphereMix: uniform(scalarValue('Weather Atmosphere Mix', 0)),
    windAngle: uniform(scalarValue('Global Wind Angle', 0.2)),
    windIntensity: uniform(scalarValue('Global Wind Intensity', 1.2)),
    windSpeed: uniform(scalarValue('Global Wind Speed', 1)),
  };
}

export function createToonLabSourceEnvironmentState(library, overrides = {}) {
  const snapshot = library.createGlobalParameterSnapshot(overrides);
  const uniforms = createStateUniforms(snapshot);
  uniforms.temporalSampleIndex = uniform(
    Number.isFinite(overrides.temporalSampleIndex)
      ? Math.max(0, Math.trunc(overrides.temporalSampleIndex))
      : 0,
  );
  return {
    snapshot,
    temporal: {
      ditherNoiseTexture: overrides.temporalDitherNoiseTexture ?? null,
    },
    uniforms,
  };
}

export function updateToonLabSourceEnvironmentState(state, values = {}) {
  const u = state?.uniforms;
  if (!u) return state;
  const numbers = {
    currentTime: 'currentTime',
    dayCycleProgress: 'dayCycleProgress',
    dayLength: 'dayLength',
    nightLength: 'nightLength',
    overcast: 'overcast',
    rainPuddles: 'rainPuddles',
    rainStrength: 'rainStrength',
    rainWetness: 'rainWetness',
    snowCover: 'snowCover',
    swayDamping: 'swayDamping',
    swayLean: 'swayLean',
    swaySpeed: 'swaySpeed',
    temporalSampleIndex: 'temporalSampleIndex',
    time: 'time',
    weatherAtmosphereMix: 'weatherAtmosphereMix',
    windAngle: 'windAngle',
    windIntensity: 'windIntensity',
    windSpeed: 'windSpeed',
  };
  for (const [input, slot] of Object.entries(numbers)) {
    if (Number.isFinite(values[input])) u[slot].value = values[input];
  }
  if (values.sunDirection) {
    const direction = values.sunDirection;
    u.sunDirection.value.set(
      direction.x ?? direction[0] ?? 0,
      direction.y ?? direction[1] ?? 1,
      direction.z ?? direction[2] ?? 0,
    ).normalize();
  }
  if (values.sunColor) u.sunColor.value.copy(values.sunColor);
  if (values.skyColor) u.skyColor.value.copy(values.skyColor);
  if (values.moonDirection) {
    const direction = values.moonDirection;
    u.moonDirection.value.set(
      direction.x ?? direction[0] ?? 0,
      direction.y ?? direction[1] ?? 1,
      direction.z ?? direction[2] ?? 0,
    ).normalize();
  }
  return state;
}

export function advanceToonLabSourceEnvironmentState(state, delta = 0) {
  if (state?.uniforms?.time && Number.isFinite(delta)) {
    state.uniforms.time.value += Math.max(0, Math.min(delta, 0.1));
  }
  return state;
}

async function loadProfileTextures(library, profile, names, options = {}) {
  const entries = names.map((name) => [name, texturePath(profile, name)]);
  const loaded = await Promise.all(entries.map(([, path]) =>
    path ? library.loadTexture(path, options).catch(() => null) : null));
  return Object.fromEntries(entries.map(([name], index) => [name, loaded[index]]));
}

async function buildLeaves(profile, context) {
  const { library, state, hasVertexColors } = context;
  const maps = await loadProfileTextures(library, profile, [
    'Basic Color Texture',
    'Emissive Map',
    'LeafTexture',
    'Roughness Map',
    'Subsurface Texture',
  ], { flipY: false });
  const leafMap = maps.LeafTexture;
  if (!leafMap) throw new Error(`${profile.path} has no exported LeafTexture.`);
  const retainedPineLeafMask = profile.path.endsWith(
    '/MI_PineLeaves.MI_PineLeaves',
  );
  if (retainedPineLeafMask) {
    // T_Leaf_Pine inherits TEXTUREGROUP_World. ToonLab's active device
    // profile specifies MinMagFilter=aniso, MipFilter=point and
    // TMGS_SimpleAverage. Three's generic trilinear mip blend thins the pine
    // needles between adjacent mip levels, so select the nearest generated
    // mip while preserving linear/aniso filtering inside that mip.
    leafMap.minFilter = THREE.LinearMipmapNearestFilter;
    leafMap.needsUpdate = true;
  }
  const baseUv = uv();
  const gradientUv = sourceUv(context, 2);
  const leaf = texture(leafMap).sample(baseUv);

  let mainColor = linearColor(vector(profile, 'Main Color', [0.02, 0.18, 0.04]));
  let gradientColor = linearColor(vector(profile, 'Gradient Color', [0.4, 0.8, 0.12]));
  if (switchValue(profile, 'UseCurveColor?', false)) {
    const atlas = library.resolveCurve(CURVE_ATLASES.leaves);
    const mainCurve = library.createCurveTexture(library.resolveCurveAtlasRow(
      atlas,
      scalar(profile, 'Main Color Curve', 0),
    ));
    const gradientCurve = library.createCurveTexture(library.resolveCurveAtlasRow(
      atlas,
      scalar(profile, 'Gradient Color Curve', 1),
    ));
    const curveTime = vec2(fract(state.uniforms.dayCycleProgress), 0.5);
    if (mainCurve) mainColor = texture(mainCurve).sample(curveTime).rgb;
    if (gradientCurve) gradientColor = texture(gradientCurve).sample(curveTime).rgb;
  }

  let colorNode = mainColor;
  if (switchValue(profile, 'UseGradient?', true)) {
    const gradientInput = gradientUv.y.add(scalar(profile, 'Gradient Offset', 0));
    const gradient = cheapContrast(gradientInput, scalar(profile, 'Gradient Contrast', 0));
    // M_Leaves.LinearInterpolate_0: A = Gradient Color, B = Main Color.
    // ToonLab's Lerp is A * (1 - Alpha) + B * Alpha, so preserving the authored
    // pin order matters: reversing these inputs inverts the UV2 foliage ramp.
    colorNode = mix(gradientColor, colorNode, gradient);
  }
  if (switchValue(profile, 'UseColorTexture?', false) && maps['Basic Color Texture']) {
    colorNode = texture(maps['Basic Color Texture']).sample(baseUv).rgb;
  }
  colorNode = sourceHueVariance(colorNode, profile, context.sourceActorIdentity);

  let roughnessNode = float(scalar(profile, 'Roughness', 0.75));
  if (switchValue(profile, 'UseRoughnessMap?', false) && maps['Roughness Map']) {
    roughnessNode = texture(maps['Roughness Map'])
      .sample(baseUv)
      .r
      .mul(scalar(profile, 'Roughness', 0.75));
  }
  const material = new MeshSSSNodeMaterial();
  material.side = THREE.DoubleSide;
  material.forceSinglePass = true;
  material.colorNode = colorNode;
  material.roughnessNode = clamp(roughnessNode, 0.02, 1);
  material.metalnessNode = float(0);
  material.specularIntensityNode = clamp(float(scalar(profile, 'Specular', 0.1)), 0, 1);
  // M_Leaves writes tangent-space +Z * TwoSidedSign when TwoSidedNormals? is
  // enabled. ToonLab then multiplies the transformed world normal by
  // TwoSidedSign again in MaterialTemplate.ush. The two signs cancel, so the
  // final normal is the authored geometric normal on both sides. When the
  // graph switch is disabled only the engine-boundary sign remains.
  material.normalNode = switchValue(profile, 'TwoSidedNormals?', true)
    ? normalViewGeometry
    : normalViewGeometry.mul(faceDirection);

  const opacityMultiply = scalar(profile, 'Opacity Multiply', 1);
  // The retained P16 actor is a fully visible, non-fading StaticMeshActor:
  // PerInstanceFadeAmount=1 and MI_PineLeaves Opacity Multiply=1. ToonLab displays
  // DitherTemporalAA through an already-warmed temporal resolve. Showing one
  // raw dither frame in this non-temporal parity viewport turns the averaged
  // pine-mask mip texels into the screen-door stripes seen on oblique cards.
  // Specialize the known full-visibility result to one; preserve the literal
  // source dither for profiles that can actually fade.
  const analyticallyResolvedFullVisibility = retainedPineLeafMask
    && opacityMultiply >= 1;
  const dither = analyticallyResolvedFullVisibility
    ? float(1)
    : sourceTemporalDither(float(opacityMultiply), state);
  let visibleMask = leaf.r;
  if (switchValue(profile, 'CullPerpendiculars?', false)) {
    const cameraVector = normalize(cameraPosition.sub(positionWorld));
    visibleMask = visibleMask.mul(clamp(
      dot(normalWorld, cameraVector).add(scalar(profile, 'Perpendicular Trim', 0.1)),
      0,
      1,
    ));
  }
  visibleMask = visibleMask.mul(dither);
  const shadowMask = leaf.r.mul(dither);
  material.opacityNode = visibleMask;
  material.alphaTestNode = float(1 / 3);
  // MF_Occlusion and perpendicular camera trimming are visible-pass only.
  // ToonLab ShadowReplace keeps the source alpha silhouette for shadow maps.
  material.maskShadowNode = shadowMask.greaterThan(float(1 / 3));
  material.alphaToCoverage = false;

  let subsurfaceColor = vec3(1);
  if (switchValue(profile, 'UseTexturedSS?', false) && maps['Subsurface Texture']) {
    subsurfaceColor = texture(maps['Subsurface Texture']).sample(baseUv).rgb;
  }
  const emissiveMap = maps['Emissive Map']
    ? texture(maps['Emissive Map']).sample(baseUv)
    : null;
  material.emissiveNode = sourceEmission(colorNode, profile, state, emissiveMap);
  configureLeafSubsurface(material, colorNode, profile, state, subsurfaceColor, {
    thinCardTransmissionFallback: retainedPineLeafMask,
  });

  const windWeight = hasVertexColors ? vertexColor().r : gradientUv.y;
  material.positionNode = positionLocal.add(windOffset(profile, state, {
    sway: true,
    weight: windWeight,
  }));
  setShaderSwipeBaseline(material, {
    colorNode: maps['Basic Color Texture']
      ? texture(maps['Basic Color Texture']).sample(baseUv).rgb
      : leaf.rgb,
    opacityNode: leaf.r,
    alphaTestNode: float(1 / 3),
  });
  return recordSourceContract(finalizeMaterial(material, profile, 'leaves'), {
    alpha: 'LeafTexture.r',
    alphaClip: 1 / 3,
    gradientUv: context.hasUv2 ? 2 : 0,
    hueVariance: context.sourceActorIdentity
      ? 'retained-ToonLab-StaticMeshActor-position-plus-zero-PerInstanceRandom'
      : 'runtime-object-position-plus-reconstructed-PerInstanceRandom',
    shadowMask: 'source-alpha-without-camera-occlusion-or-perpendicular-trim',
    shadingModel: 'MSM_SUBSURFACE',
    subsurfaceLighting: 'ToonLab direct transmission + front/back captured-SkyLight SH',
    transmissionShadow: retainedPineLeafMask
      ? 'authored SS Opacity separates thin-card transmission from opaque surface visibility'
      : 'surface visibility fallback',
    textureMipFilter: retainedPineLeafMask
      ? 'TEXTUREGROUP_World MinMagFilter=aniso, MipFilter=point, TMGS_SimpleAverage'
      : 'source texture metadata default',
    temporalDither: analyticallyResolvedFullVisibility
      ? 'analytic warmed-TAA full-visibility result; PerInstanceFadeAmount=1 and Opacity Multiply=1'
      : 'ToonLab DitherTemporalAA(Opacity Multiply); PerInstanceFadeAmount fixed to 1',
    twoSidedNormal: switchValue(profile, 'TwoSidedNormals?', true)
      ? 'M_Leaves +Z * TwoSidedSign, then ToonLab material-boundary TwoSidedSign; net authored geometric normal'
      : 'M_Leaves +Z, then ToonLab material-boundary TwoSidedSign; net face-corrected geometric normal',
    toonLabMaterialBoundaryNormal: 'MaterialTemplate.ush: Parameters.WorldNormal *= Parameters.TwoSidedSign',
    toonLabMaterialTemplateSha256: '2d237cc8c53a024341a6a3828a251a655fbc9a266c0a2d7ed7e244be90bf292d',
    vertexColor: hasVertexColors ? 'r:wpo-weight' : 'absent',
  });
}

async function buildFoliage(profile, context) {
  if (isToonLabGrassProfile(profile)
    && context.sourceAssetName !== TOONLAB_SHOWCASE_SOURCE_ASSET) {
    const material = await buildToonLabGrassMaterial(profile, {
      ...context,
      baseUrl: context.library?.environmentBaseUrl,
    });
    finalizeMaterial(material, profile, 'foliage');
    Object.assign(material.userData.toonLabSource, {
      reconstruction: 'toonlab-s-foliage',
      sourceEngine: 'ToonLab reference renderer',
      sourceMaterial: material.userData.toonLabGrass?.sourceMaterial ?? 'MV_Grass',
      sourceToonLabGraph: 'S_FoliageShader',
    });
    return recordSourceContract(material, {
      alpha: 'ToonLab ordered 4x4 dither * radial 80-100m fade',
      alphaClip: 0.9,
      baseColor: 'lerp(MV_Grass.Bottom, noise-gradient/tip-distance, UV0.y)',
      castShadow: false,
      emission: 'BaseColor * 0.03',
      gradientUv: 0,
      lighting: 'TOONLAB Lit specular-workflow adapter',
      roughness: '1 - ToonLab Smoothness(.05) = .95',
      source: `${material.userData.toonLabGrass?.sourceMaterial ?? 'MV_Grass'} `
        + '+ MV_Grass + M_Foliage + compiled S_FoliageShader',
      specular: '[.17273237,.511,.057577446]',
      vertex: 'deterministic ToonLab GradientNoise wind + .2m world-Y vertex-color lift',
      vertexColor: context.hasVertexColors ? 'rgb:wpo-mask' : 'absent/fallback-one',
    });
  }
  const { library, state, hasVertexColors } = context;
  const retainedDaisyMask = context.sourceAssetName === TOONLAB_SHOWCASE_SOURCE_ASSET
    && context.sourceSceneVariant === 'retained-instanced-daisies'
    && profile.path.endsWith('/MI_Daisy.MI_Daisy');
  const maps = await loadProfileTextures(library, profile, [
    'Color Map',
    'Emissive Map',
    'Foliage Texture',
    'Height Texture',
    'Hue Texture',
    'Wind Color Mask',
    'Wind Color Noise',
  ], { flipY: false });
  const useTexture = Boolean(
    switchValue(profile, 'UseTexture?', false) && maps['Foliage Texture'],
  );
  const baseUv = uv();
  const gradientUv = sourceUv(context, 2);
  const foliageSample = useTexture ? texture(maps['Foliage Texture']).sample(uv()) : null;
  const windColor = foliageWindColor(profile, state, maps);
  const windBoost = scalar(profile, 'Wind Color Boost', 2.5);
  let colorNode;
  if (useTexture) {
    const base = foliageSample.rgb
      .mul(linearColor(vector(profile, 'TextureTint', [1, 1, 1])));
    colorNode = mix(base, base.mul(windBoost), windColor);
  } else {
    const ground = sampleGroundColor(positionWorld);
    let rootColor = linearColor(vector(profile, 'Base Color', [0.15, 0.33, 0.07]));
    if (switchValue(profile, 'UseRVTColor?', false)) {
      // ToonLab's RVT sample is only authoritative where the landscape writer has
      // coverage and valid color data. Preserve MI_Grass's authored Base
      // Color outside that coverage instead of multiplying the blade down to
      // black when a renderer target exposes coverage before its color data.
      const validRvt = ground.a.mul(step(
        1 / 255,
        max(max(ground.r, ground.g), ground.b),
      ));
      rootColor = mix(rootColor, ground.rgb, validRvt);
    } else if (switchValue(profile, 'UseBinaryColor?', false)) {
      rootColor = mix(
        linearColor(vector(profile, 'Offgrass Color', [0.4, 0.35, 0.16])),
        rootColor,
        ground.a,
      );
    } else if (switchValue(profile, 'UseColorMap?', false) && maps['Color Map']) {
      const mapSize = scalar(profile, 'Grass Colormap Size', 100000) / 100;
      rootColor = planarCentered(
        maps['Color Map'],
        mapSize,
        mapSize,
        0,
        0,
        state.userData?.worldOffsetToonLabMeters,
      )
        .rgb
        .mul(scalar(profile, 'Colormap Multiply', 1));
    }

    let tipColor;
    if (switchValue(profile, 'CurveColoredTips?', false) && maps['Hue Texture']) {
      const atlas = library.resolveCurve(CURVE_ATLASES.grass);
      const curveTexture = library.createCurveTexture(library.resolveCurveAtlasRow(
        atlas,
        scalar(profile, 'Grass Color Curve', 0),
      ));
      if (curveTexture) {
        const hueScale = scalar(profile, 'Hue Variance Scale', 4000) / 100;
        const hueNoise = planar(maps['Hue Texture'], hueScale).r;
        tipColor = texture(curveTexture).sample(vec2(hueNoise, 0.5)).rgb;
      }
    }
    if (!tipColor) {
      tipColor = rootColor.add(scalar(profile, 'Tip Brightness', 0.1));
      const grey = dot(tipColor, vec3(0.3, 0.59, 0.11));
      tipColor = mix(
        tipColor,
        vec3(grey),
        scalar(profile, 'Tip Desaturation', -0.5),
      );
      tipColor = toonLabHueShift(tipColor, float(scalar(profile, 'Tip Hue Shift', -0.06)));
    }
    rootColor = mix(rootColor, rootColor.mul(windBoost), windColor);
    tipColor = mix(tipColor, tipColor.mul(windBoost), windColor);
    colorNode = mix(tipColor, rootColor, gradientUv.y);
  }
  colorNode = sourceHueVariance(colorNode, profile);

  const roughness = scalar(profile, 'Roughness', 0.5);
  const roughnessNode = mix(
    roughness,
    roughness * scalar(profile, 'Random Roughness', 1),
    sourcePerInstanceRandom(profile),
  );
  const localSpecularNode = mix(
    scalar(profile, 'Specular', 0.05),
    scalar(profile, 'Specular', 0.05) * 3,
    windColor,
  );
  let specularNode = localSpecularNode;
  if (switchValue(profile, 'UseRVTColor?', false)) {
    const groundSurface = sampleGroundSurface(positionWorld);
    specularNode = mix(
      localSpecularNode,
      groundSurface.g,
      gradientUv.y.mul(groundSurface.a),
    );
  }
  const material = new MeshSSSNodeMaterial();
  material.side = THREE.DoubleSide;
  material.forceSinglePass = true;
  // COLOR_0 is authored exclusively as a WPO mask in M_Foliage. Letting the
  // renderer's generic vertex-color path consume it would multiply those
  // black-to-white deformation weights into Base Color.
  material.vertexColors = false;
  material.colorNode = colorNode;
  material.roughnessNode = clamp(roughnessNode, 0.02, 1);
  material.metalnessNode = float(scalar(profile, 'Metallic', 0));
  material.specularIntensityNode = clamp(specularNode, 0, 1);
  // M_Foliage's TwoSidedNormals branch resolves both sides to the authored
  // interpolated grass normal. Three's default DoubleSide path negates the
  // reverse face a second time, turning half of each clump into a downward
  // normal and therefore a near-black skylight response.
  material.normalNode = normalViewGeometry;
  const emissiveMap = maps['Emissive Map']
    ? texture(maps['Emissive Map']).sample(baseUv)
    : null;
  material.emissiveNode = sourceEmission(colorNode, profile, state, emissiveMap);
  configureFoliageSubsurface(material, colorNode, profile, {
    thinCardTransmissionFallback: retainedDaisyMask,
  });

  const baseMask = foliageSample ? foliageSample.a : float(1);
  // The retained FoliageInstancedStaticMeshComponent has no cull distance
  // and its source graph receives PerInstanceFadeAmount=1. Resolve the
  // warmed-TAA full-visibility result analytically for P17 instead of showing
  // one temporal-dither frame in deterministic comparisons.
  const dither = retainedDaisyMask
    ? float(1)
    : sourceTemporalDither(float(1), state);
  const visibleMask = baseMask.mul(dither);
  const shadowMask = baseMask.mul(dither);
  material.opacityNode = visibleMask;
  material.alphaTestNode = float(1 / 3);
  material.maskShadowNode = shadowMask.greaterThan(float(1 / 3));
  material.alphaToCoverage = false;

  let wpo = windOffset(profile, state, { weight: float(1) });
  if (maps['Height Texture']) {
    const heightNoise = planarAtToonLabWorldXY(
      maps['Height Texture'],
      sourceToonLabWorldXY(state.userData?.worldOffsetToonLabMeters),
      scalar(profile, 'Height Texture Scale', 2500) / 100,
    ).r;
    const heightCm = mix(
      scalar(profile, 'Height Min', 5),
      scalar(profile, 'Height Max', 20),
      heightNoise,
    );
    wpo = wpo.add(vec3(0, heightCm.div(100), 0));
  }
  wpo = wpo.add(vec3(
    scalar(profile, 'AdditionalX', 0) / 100,
    scalar(profile, 'AdditionalZ', 0) / 100,
    -scalar(profile, 'AdditionalY', 0) / 100,
  ));
  wpo = wpo.add(vec3(
    0,
    windColor.mul(scalar(profile, 'Wind Color WPO', 0) / 100),
    0,
  ));
  if (switchValue(profile, 'ShrinkOffgrassFoliage?', false)) {
    const grassMask = sampleGroundColor(positionWorld).a;
    wpo = wpo.mul(mix(
      scalar(profile, 'Offgrass Height', 1),
      1,
      pow(grassMask, 3),
    ));
  }
  wpo = vec3(
    wpo.x,
    wpo.y.mul(scalar(profile, 'Final Z Multiply', 1)),
    wpo.z,
  );
  if (hasVertexColors) {
    // ToonLab multiplies XYZ WPO by COLOR_0.rgb before coordinate conversion.
    wpo = wpo.mul(vec3(vertexColor().r, vertexColor().b, vertexColor().g));
  }
  material.positionNode = positionLocal.add(wpo);
  setShaderSwipeBaseline(material, {
    colorNode: foliageSample?.rgb ?? colorNode,
    opacityNode: baseMask,
    alphaTestNode: float(1 / 3),
  });
  return recordSourceContract(finalizeMaterial(material, profile, 'foliage'), {
    alpha: useTexture ? 'FoliageTexture.a' : '1',
    alphaClip: 1 / 3,
    colormap: 'worldXY*ColormapMultiply',
    gradientUv: context.hasUv2 ? 2 : 0,
    shadowMask: 'source-alpha-without-camera-occlusion',
    shadingModel: 'MSM_SUBSURFACE',
    subsurfaceLighting: 'ToonLab direct transmission + front/back captured-SkyLight SH',
    temporalDither: retainedDaisyMask
      ? 'analytic warmed-TAA full-visibility result; PerInstanceFadeAmount=1'
      : 'ToonLab DitherTemporalAA(PerInstanceFadeAmount); input fixed to 1',
    transmissionShadow: retainedDaisyMask
      ? 'authored SS Opacity separates thin-card transmission from masked surface visibility'
      : 'surface visibility fallback',
    twoSidedNormal: switchValue(profile, 'TwoSidedNormals?', true)
      ? 'flat tangent normal * TwoSidedSign'
      : 'flat tangent normal',
    vertexColor: hasVertexColors ? 'rgb:wpo-mask' : 'absent',
  });
}

async function buildBark(profile, context) {
  const { library, state, hasVertexColors } = context;
  const maps = await loadProfileTextures(library, profile, [
    'Diffuse Texture',
    'Emissive Map',
    'MossTexture',
    'Normal Texture',
    'Rough Texture',
    'Snow Texture',
  ], { flipY: false });
  maps.snowSpecular = await library.loadTexture(
    LANDSCAPE_FUNCTION_TEXTURES.snowSpecular,
  ).catch(() => null);
  const diffuse = maps['Diffuse Texture'];
  if (!diffuse) throw new Error(`${profile.path} has no exported Diffuse Texture.`);
  const barkUv = uv().mul(vec2(
    scalar(profile, 'XScale', 1),
    scalar(profile, 'YScale', 1),
  ));
  const barkSample = texture(diffuse).sample(barkUv);
  const tint = linearColor(vector(profile, 'TintColor', [1, 1, 1]));
  let colorNode = mix(barkSample.rgb, tint, scalar(profile, 'TintMix', 0));
  if (switchValue(profile, 'HueVariance?', false)) {
    colorNode = sourceHueVariance(colorNode, profile);
  }

  let roughnessNode = maps['Rough Texture']
    ? texture(maps['Rough Texture']).sample(barkUv).r.mul(scalar(profile, 'RoughMult', 1))
    : float(scalar(profile, 'RoughMult', 0.8));
  let specularNode = float(scalar(profile, 'Specular', 0.2));
  let mossMask = float(0);
  let mossColor = vec3(0);

  if (switchValue(profile, 'Moss?', false) && maps.MossTexture) {
    const mossNoise = clamp(triplanar(
      maps.MossTexture,
      scalar(profile, 'MossSize', 1200) / 100,
    ).r, 0, 1);
    const directionMask = switchValue(profile, 'WorldAligned?', true)
      ? clamp(
        dot(
          normalWorld,
          toonLabDirection(vector(profile, 'MossDirection', [0, 0, 1])),
        )
          .mul(scalar(profile, 'MossSharpness', 1))
          .sub(scalar(profile, 'MossOffset', 0.3)),
        0,
        1,
      )
      : (hasVertexColors ? vertexColor().g : float(0));
    mossMask = clamp(pow(
      mossNoise
        .mul(scalar(profile, 'Moss Multiply', 5))
        .mul(directionMask),
      2,
    ), 0, 1);
    mossColor = mix(
      linearColor(vector(profile, 'Moss Color 2', [0.05, 0.35, 0])),
      linearColor(vector(profile, 'Moss Color', [0.18, 0.43, 0.06])),
      pow(mossNoise, 2),
    );
    colorNode = mix(colorNode, mossColor, mossMask);
    roughnessNode = mix(
      roughnessNode,
      clamp(mossNoise.mul(scalar(profile, 'Moss Roughness', 1.3)), 0, 1),
      mossMask,
    );
    specularNode = mix(
      specularNode,
      scalar(profile, 'Moss Specular', 0.5),
      mossMask,
    );
  }

  let snowMask = float(0);
  let snowColor = vec3(0);
  if (switchValue(profile, 'Snow?', false) && maps['Snow Texture']) {
    snowColor = planar(
      maps['Snow Texture'],
      scalar(profile, 'Snow Scale', 5000) / 100,
    ).rgb;
    snowMask = switchValue(profile, 'SnowWorldAligned?', true)
      ? clamp(
        dot(
          normalWorld,
          toonLabDirection(vector(profile, 'Snow Direction', [0, 0, 1])),
        )
          .mul(scalar(profile, 'Snow Sharpness', 8))
          .sub(scalar(profile, 'Snow Offset', 0.3)),
        0,
        1,
      )
      : (hasVertexColors ? vertexColor().g : float(0));
    colorNode = mix(colorNode, snowColor, snowMask);
    roughnessNode = mix(
      roughnessNode,
      scalar(profile, 'Snow Rough', 0.5),
      snowMask,
    );
    const snowSpecularNoise = maps.snowSpecular
      ? planar(
        maps.snowSpecular,
        scalar(profile, 'Snow Specular Scale', 75) / 100,
      ).r
      : float(0.5);
    const snowSpecular = mix(
      scalar(profile, 'Snow Spec Min', 0.1),
      scalar(profile, 'Snow Spec Max', 0.3),
      snowSpecularNoise,
    );
    specularNode = mix(specularNode, snowSpecular, snowMask);
  }

  const wet = wetSurface(colorNode, roughnessNode, profile, state);
  const material = new MeshPhysicalNodeMaterial();
  material.side = THREE.FrontSide;
  material.colorNode = wet.colorNode;
  material.roughnessNode = clamp(wet.roughnessNode, 0.02, 1);
  material.metalnessNode = float(0);
  material.specularIntensityNode = clamp(specularNode, 0, 1);
  if (maps['Normal Texture']) {
    const normalStrength = 1 - THREE.MathUtils.clamp(
      scalar(profile, 'NormalFlatness', 0), 0, 1,
    );
    material.normalNode = normalMapNode(
      texture(maps['Normal Texture']).sample(barkUv).rgb,
      vec2(normalStrength, -normalStrength),
    );
  }

  let emissiveInput = wet.colorNode.mul(scalar(profile, 'Emissive Strength', 0));
  if (switchValue(profile, 'Moss?', false)) {
    let mossEmission = mossColor.mul(scalar(profile, 'Moss Emissive Strength', 0));
    if (switchValue(profile, 'MossEmissiveMap?', false) && maps['Emissive Map']) {
      mossEmission = mossEmission.mul(triplanar(
        maps['Emissive Map'],
        Math.max(scalar(profile, 'Moss Emissive Map Scale', 1), 0.001),
      ).rgb).mul(linearColor(vector(profile, 'Emissive Tint', [1, 1, 1])));
    }
    emissiveInput = mix(emissiveInput, mossEmission, mossMask);
  }
  if (switchValue(profile, 'Snow?', false)) {
    const snowEmission = snowColor.mul(scalar(profile, 'Snow Emission', 0.05));
    emissiveInput = mix(emissiveInput, snowEmission, snowMask);
  }
  material.emissiveNode = applyDayCycleEmission(emissiveInput, profile, state);
  material.positionNode = positionLocal.add(windOffset(profile, state, {
    sway: true,
    weight: uv().y,
  }));
  setShaderSwipeBaseline(material, {
    colorNode: barkSample.rgb,
  });
  installToonLabSourceDefaultLitLighting(material);
  return recordSourceContract(finalizeMaterial(material, profile, 'bark'), {
    lighting:
      'ToonLab legacy Default Lit Lambert + punctual GGX + captured-SkyLight boundary',
    mossProjection: 'world-aligned-triplanar-or-vertex-g',
    shadingModel: 'MSM_DEFAULT_LIT',
    snowProjection: 'worldXY-planar',
    tint: 'lerp(diffuse,TintColor,TintMix)',
    vertexColor: hasVertexColors ? 'g:moss-or-snow-mask' : 'absent',
  });
}

async function buildTreeLod(profile, context) {
  const { library, state, hasVertexColors } = context;
  const maps = await loadProfileTextures(library, profile, [
    'Filled Leaf Texture',
    'Leaf Texture',
    'SS Texture',
  ], { flipY: false });
  const baseUv = uv();
  const gradientUv = sourceUv(context, 2);
  let leafColor = linearColor(vector(profile, 'Leaf Color', [0.08, 0.28, 0.03]));
  let gradientColor = linearColor(
    vector(profile, 'Leaf Gradient Color', [0.35, 0.65, 0.08]),
  );
  if (switchValue(profile, 'UseCurveColor?', false)) {
    const atlas = library.resolveCurve(CURVE_ATLASES.leaves);
    const leafCurve = library.createCurveTexture(
      library.resolveCurveAtlasRow(atlas, scalar(profile, 'Main Color Curve', 0)),
    );
    const gradientCurve = library.createCurveTexture(
      library.resolveCurveAtlasRow(atlas, scalar(profile, 'Gradient Color Curve', 1)),
    );
    const curveTime = vec2(fract(state.uniforms.dayCycleProgress), 0.5);
    if (leafCurve) leafColor = texture(leafCurve).sample(curveTime).rgb;
    if (gradientCurve) gradientColor = texture(gradientCurve).sample(curveTime).rgb;
  }
  const leafGradient = cheapContrast(
    gradientUv.y.add(scalar(profile, 'Gradient Offset', 0)),
    scalar(profile, 'Gradient Contrast', 0),
  );
  let leaves = switchValue(profile, 'UseGradient?', true)
    ? mix(leafColor, gradientColor, leafGradient)
    : leafColor;
  leaves = sourceHueVariance(leaves, profile);
  if (switchValue(profile, 'UseTexture?', false) && maps['Leaf Texture']) {
    leaves = texture(maps['Leaf Texture']).sample(baseUv).rgb;
  }

  let bark = linearColor(vector(profile, 'Bark Color', [0.3, 0.2, 0.12]));
  if (switchValue(profile, 'Snow?', false)) {
    const snowMask = clamp(
      normalWorld.y.mul(scalar(profile, 'Snow Sharpness', 3)),
      0,
      1,
    );
    bark = mix(
      bark,
      linearColor(vector(profile, 'Snow Color', [0.9, 0.9, 0.9])),
      snowMask,
    );
  }

  const leafSelector = hasVertexColors
    ? vertexColor().r
    : smoothstep(0.3, 0.7, gradientUv.y);
  const colorNode = mix(bark, leaves, leafSelector);
  const filledLeaf = maps['Filled Leaf Texture']
    ? texture(maps['Filled Leaf Texture']).sample(baseUv).r
    : float(1);
  const opacityMask = mix(1, filledLeaf, leafSelector);

  const material = new MeshSSSNodeMaterial();
  material.side = THREE.DoubleSide;
  material.forceSinglePass = true;
  material.colorNode = colorNode;
  material.roughnessNode = clamp(float(scalar(profile, 'Roughness', 0.75)), 0.02, 1);
  material.metalnessNode = float(0);
  material.specularIntensityNode = clamp(float(scalar(profile, 'Specular', 0.1)), 0, 1);
  material.opacityNode = opacityMask;
  material.alphaTestNode = float(1 / 3);
  material.maskShadowNode = opacityMask.greaterThan(float(1 / 3));
  material.alphaToCoverage = false;
  material.emissiveNode = sourceEmission(colorNode, profile, state);

  let ssColor = colorNode.mul(scalar(profile, 'SS Strength', 0.3));
  if (switchValue(profile, 'SubsurfaceTexture?', false) && maps['SS Texture']) {
    ssColor = ssColor.mul(texture(maps['SS Texture']).sample(baseUv).rgb);
  }
  configureSourceSubsurface(
    material,
    ssColor.mul(leafSelector),
    mix(1, scalar(profile, 'SS Opacity', 0.08), leafSelector),
  );
  setShaderSwipeBaseline(material, {
    colorNode: switchValue(profile, 'UseTexture?', false) && maps['Leaf Texture']
      ? mix(bark, texture(maps['Leaf Texture']).sample(baseUv).rgb, leafSelector)
      : colorNode,
    opacityNode: opacityMask,
    alphaTestNode: float(1 / 3),
  });
  return recordSourceContract(finalizeMaterial(material, profile, 'treeLod'), {
    alpha: 'lerp(1,FilledLeafTexture.r,VertexColor.r)',
    gradientUv: context.hasUv2 ? 2 : 0,
    leafSelector: hasVertexColors ? 'color.r' : 'uv-fallback',
    shadingModel: 'MSM_SUBSURFACE',
    snow: 'bark-only-normal-z',
    subsurfaceLighting: 'ToonLab direct transmission + front/back captured-SkyLight SH',
    twoSidedNormal: switchValue(profile, 'TwoSidedNormals?', true)
      ? 'flat tangent normal * TwoSidedSign'
      : 'flat tangent normal',
  });
}

async function buildSnow(profile, context) {
  const { library, state } = context;
  const maps = await loadProfileTextures(library, profile, ['Snow Texture'], { flipY: false });
  if (!maps['Snow Texture']) {
    throw new Error(`${profile.path} has no exported Snow Texture.`);
  }
  const embedded = await Promise.all([
    library.loadTexture(LANDSCAPE_FUNCTION_TEXTURES.snowSpecular, { flipY: false })
      .catch(() => null),
    library.loadTexture(LANDSCAPE_FUNCTION_TEXTURES.sparkleChroma, { flipY: false })
      .catch(() => null),
    library.loadTexture(LANDSCAPE_FUNCTION_TEXTURES.sparkleMask, { flipY: false })
      .catch(() => null),
  ]);
  [maps.snowSpecular, maps.sparkleChroma, maps.sparkleMask] = embedded;
  const nodes = buildSnowNodes(profile, state, maps);
  const material = new MeshPhysicalNodeMaterial();
  material.side = THREE.FrontSide;
  material.depthTest = true;
  material.depthWrite = true;
  material.colorNode = nodes.colorNode;
  material.roughnessNode = clamp(nodes.roughnessNode, 0.02, 1);
  material.metalnessNode = nodes.metalnessNode;
  material.specularIntensityNode = clamp(nodes.specularNode, 0, 1);
  material.emissiveNode = nodes.emissiveNode;
  installToonLabSourceDefaultLitLighting(material);
  return recordSourceContract(finalizeMaterial(material, profile, 'snow'), {
    colorProjection: 'absolute-toonlab-world-xy',
    dayWeather: 'snow-five-point-day-curve-and-overcast',
    intensityVariance: 'neutral-until-source-T_3DNoise-volume-is-exported',
    normal: 'flat-tangent-space',
    lighting:
      'ToonLab legacy Default Lit Lambert + punctual GGX + captured-SkyLight boundary',
    shadingModel: 'MSM_DEFAULT_LIT',
    sparkle: switchValue(profile, 'SnowSparkleDualLayer?', true)
      ? 'dual-layer-source-2d-projection'
      : 'single-layer-source-2d-projection',
    specular: 'T_ChromaNoise_Blurred.r',
  });
}

export async function buildToonLabLandscapeMaterial(profile, context) {
  const { library, state } = context;
  const maps = await loadProfileTextures(library, profile, [
    'Color Map',
    'Desert Dirt Roughness',
    'Desert Dirt Texture',
    'Desert Sand Texture',
    'DirtTexture',
    'Grass Color Texture',
    'Grass Roughness Texture',
    'Hue Texture',
    'Rock Normal Texture',
    'Rock Texture',
    'Roughness Map',
    'SandTexture',
    'Snow Texture',
    'Wind Color Mask',
    'Wind Color Noise',
  ], { flipY: false });
  const embeddedTextureEntries = await Promise.all(
    Object.entries(LANDSCAPE_FUNCTION_TEXTURES).map(async ([name, path]) => [
      name,
      await library.loadTexture(path, { flipY: false }).catch(() => null),
    ]),
  );
  Object.assign(maps, Object.fromEntries(embeddedTextureEntries));

  const isToonLabShowcase = context.sourceAssetName === TOONLAB_SHOWCASE_SOURCE_ASSET;
  // ToonLabShowcase is an ToonLab-authored Landscape with ten painted weight layers,
  // AutoCliff, height blending, rain wetness, and scene-specific textures.
  // ToonLab Terrain/Lit belongs to EnvironmentReferenceScene and cannot be combined
  // with these masks for an apple-to-apple scene comparison.
  const toonLabTerrainLayers = null;
  if (toonLabTerrainLayers) {
    for (const [layerName, layer] of Object.entries(toonLabTerrainLayers)) {
      maps[`toonLabTerrain${layerName}Diffuse`] = layer.diffuseMap;
      if (layer.normalMap) maps[`toonLabTerrain${layerName}Normal`] = layer.normalMap;
    }
  }
  let landscapeWeightSet = null;
  if (isToonLabShowcase) {
    if (typeof library.loadLandscapeWeightmapTextures !== 'function') {
      throw new Error('ToonLabShowcase requires the authoritative Landscape weightmap loader.');
    }
    landscapeWeightSet = await library.loadLandscapeWeightmapTextures(
      context.sourceAssetName,
      TOONLAB_SHOWCASE_WEIGHTMAP_CONTRACT,
    );
  }
  const weightInspection = landscapeWeightSet?.inspection
    ?? library.inspectLandscapeWeightmapSet?.(
      context.sourceAssetName,
      TOONLAB_SHOWCASE_WEIGHTMAP_CONTRACT,
    )
    ?? {
      errors: ['source library has no Landscape weightmap resolver'],
      record: null,
      status: 'missing',
    };
  let weightBindings = landscapeWeightSet?.bindings ?? null;
  let weightPackTextures = landscapeWeightSet?.textures ?? null;
  const samplerlessTextures = makeSourceTexturesSamplerless(
    maps,
    weightPackTextures ?? [],
  );
  if (weightPackTextures) {
    weightPackTextures = samplerlessTextures.packs;
    weightBindings = Object.fromEntries(Object.entries(weightBindings).map(
      ([layerName, binding]) => [layerName, Object.freeze({
        ...binding,
        texture: weightPackTextures[binding.packIndex],
      })],
    ));
  }
  const landscapeCoord = landscapeLayerCoordinates(
    context.sourceAssetName,
    weightInspection.record,
    state.userData?.worldOffsetToonLabMeters,
  );
  const sourceWorldXY = sourceToonLabWorldXY(state.userData?.worldOffsetToonLabMeters);

  const grassScale = scalar(profile, 'Global Scale', 1600) / 100;
  const rockScale = scalar(profile, 'Rock Scale', 2500) / 100;
  const grassPrimary = planarAtToonLabWorldXY(
    maps['Grass Color Texture'],
    sourceWorldXY,
    grassScale,
  ).rgb;
  const grassSecondary = planarAtToonLabWorldXY(
    maps['Grass Color Texture'],
    sourceWorldXY,
    grassScale * 1.75,
  ).rgb;
  let grassVariance = float(0);
  if (maps.grassVariance) {
    grassVariance = clamp(planarAtToonLabWorldXY(
      maps.grassVariance,
      sourceWorldXY,
      scalar(profile, 'Grass Variance Scale', 8417.2) / 100,
    ).r.mul(scalar(profile, 'Grass Variance Multiply', 2)), 0, 1);
  }
  const grassSample = mix(grassPrimary, grassSecondary, grassVariance);
  const grassTint = linearColor(vector(profile, 'Grass Tint', [0.42, 0.6, 0.433]));
  let grassColor = grassSample.mul(grassTint);
  if (switchValue(profile, 'UseColorMap?', false) && maps['Color Map']) {
    const colormap = planarCentered(
      maps['Color Map'],
      scalar(profile, 'Grass Colormap ScaleX', 100000) / 100,
      scalar(profile, 'Grass Colormap ScaleY', 100000) / 100,
      scalar(profile, 'Grass Colormap OffsetX', 0),
      scalar(profile, 'Grass Colormap OffsetY', 0),
      state.userData?.worldOffsetToonLabMeters,
    ).rgb;
    const grey = sourceDesaturate(grassSample, 1).r;
    const low = colormap.mul(grey.mul(2));
    const high = vec3(1).sub(vec3(1).sub(colormap).mul(grey.oneMinus().mul(2)));
    grassColor = mix(low, high, step(0.5, grey));
  }

  if (maps['Hue Texture']) {
    const hueNoise = planarAtToonLabWorldXY(
      maps['Hue Texture'],
      sourceWorldXY,
      scalar(profile, 'Hue Variance Scale', 8000) / 100,
    ).rgb;
    const hueAmount = hueNoise
      .add(scalar(profile, 'Hue Pre-Offset', -0.05))
      .mul(scalar(profile, 'Hue Variance Strength', -0.1))
      .add(scalar(profile, 'Hue Post Offset', -0.01));
    grassColor = toonLabHueShift(grassColor, hueAmount);
  }

  const windColor = landscapeWindColor(profile, state, maps, sourceWorldXY);
  const windColorBoostAmount = scalar(profile, 'Wind Color Boost', 1.2);
  const windColorBoost = lerpFive(
    windColorBoostAmount,
    1,
    1,
    1,
    windColorBoostAmount,
    state.uniforms.dayCycleProgress,
  );
  grassColor = mix(grassColor, grassColor.mul(windColorBoost), windColor);
  const grassSpecular = mix(
    0.1,
    lerpFive(1, 0.4, 0.2, 0.4, 1, state.uniforms.dayCycleProgress),
    windColor,
  );
  const grassRoughness = maps['Grass Roughness Texture']
    ? mix(
      planarAtToonLabWorldXY(
        maps['Grass Roughness Texture'],
        sourceWorldXY,
        grassScale,
      ).r,
      planarAtToonLabWorldXY(
        maps['Grass Roughness Texture'],
        sourceWorldXY,
        grassScale * 1.75,
      ).r,
      grassVariance,
    )
    : float(0.9);
  const grassEmission = grassColor.mul(scalar(profile, 'Grass Emissive', 0.03));

  const rockSample = triplanar(
    maps['Rock Texture'],
    rockScale,
    {
      contrast: scalar(profile, 'Projection Contrast', 0.5),
      normalNode: normalWorldGeometry,
      sideOnly: switchValue(profile, 'SideProjectOnly?', false),
    },
  );
  const rockNear = rockSample.rgb
    .mul(linearColor(vector(profile, 'Rock Tint', [0.893, 0.922, 0.83])));
  const rockDistance = clamp(linearRemap(
    sourcePixelDepthCm(),
    scalar(profile, 'Close Tint Blend Distance', 500),
    scalar(profile, 'Far Tint Blend Distance', 15000),
  ), 0, 1);
  const rockFar = mix(
    rockNear,
    linearColor(vector(profile, 'Distant Tint Blend', [0.59375, 0.59375, 0.59375])),
    scalar(profile, 'Distant Tint Blend Lerp Alpha Mix', 0.5),
  );
  const rockColor = mix(rockNear, rockFar, rockDistance);
  const rockRoughness = switchValue(profile, 'RoughnessMap?', false)
    && maps['Roughness Map']
    ? triplanar(maps['Roughness Map'], rockScale, {
      contrast: scalar(profile, 'Projection Contrast', 0.5),
      normalNode: normalWorldGeometry,
      sideOnly: switchValue(profile, 'SideProjectOnly?', false),
    }).r
      .mul(scalar(profile, 'Roughness', 1.2))
    : cheapContrast(rockSample.r, 0.3).mul(scalar(profile, 'Roughness', 1.2));

  let rockNormalView = normalViewGeometry;
  if (maps['Rock Normal Texture']) {
    let rockNormalWorld = sourceWorldAlignedNormal(
      maps['Rock Normal Texture'],
      rockScale,
      {
        contrast: scalar(profile, 'Projection Contrast', 0.5),
        flatTop: switchValue(profile, 'FlatTopCrackNormals?', false),
        sideOnly: switchValue(profile, 'SideProjectOnly?', false),
      },
    );
    const closeFlatness = THREE.MathUtils.clamp(
      scalar(profile, 'Rock Normal Flatten', 0), 0, 1,
    );
    const farFlatness = switchValue(profile, 'FlattenDistantCracks?', true)
      ? THREE.MathUtils.clamp(
        scalar(profile, 'Distant Rock Normal Flatten', 1), 0, 1,
      )
      : closeFlatness;
    const normalFade = clamp(
      sourcePixelDepthCm().div(Math.max(
        scalar(profile, 'Rock Normal Distance', 20000),
        0.001,
      )),
      0,
      1,
    );
    rockNormalWorld = normalize(mix(
      rockNormalWorld,
      normalWorldGeometry,
      mix(closeFlatness, farFlatness, normalFade),
    ));
    rockNormalView = transformNormalByViewMatrix(rockNormalWorld, cameraViewMatrix);
  }

  const slope = linearRemap(
    normalWorldGeometry.y,
    scalar(profile, 'Auto Cliff Start', 0.85),
    scalar(profile, 'Auto Cliff Fade', 0.8),
  );
  const cliffNoise = maps.autoCliffNoise
    ? sourceTextureSample(maps.autoCliffNoise,
      landscapeCoord.div(Math.max(scalar(profile, 'Auto Cliff Noise Scale', 80), 0.001)),
    ).r.mul(scalar(profile, 'Auto Cliff Noise Strength', 2))
    : float(0);
  let cliffMask = switchValue(profile, 'AutoCliff?', true)
    ? clamp(slope.sub(cliffNoise), 0, 1)
    : float(0);
  // AutoGrass drives the procedural grass/RVT output in ToonLab. It does not
  // alter the visible AutoCliff material blend.

  const rockSurface = {
    color: rockColor,
    emissive: sourceEmission(rockColor, profile, state),
    metalness: float(scalar(profile, 'Metallic', 0.1)),
    normal: rockNormalView,
    roughness: rockRoughness,
    specular: float(scalar(profile, 'Specular', 0.2)),
  };
  const grassSurface = {
    color: grassColor,
    emissive: grassEmission,
    metalness: float(0),
    normal: normalViewGeometry,
    roughness: grassRoughness,
    specular: grassSpecular,
  };
  // Raw color-only input used by Live Preview. Use the primary source albedo,
  // not M_Landscape's secondary-scale variance branch.
  let shaderSwipeColorNode = grassPrimary;

  let paintedSurface = grassSurface;
  let paintedWeights = null;
  if (weightBindings) {
    const dirtUv = landscapeCoord.div(Math.max(scalar(profile, 'Dirt Scale', 13), 0.001));
    const dirtSample = sourceTextureSample(
      maps.DirtTexture,
      dirtUv,
      { anisotropic: true },
    ).rgb;
    const dirtColor = dirtSample.mul(
      linearColor(vector(profile, 'Dirt Tint', [0.5, 0.529, 0.552])),
    );
    const dirtNormalStrength = 1 - THREE.MathUtils.clamp(
      scalar(profile, 'Dirt Flatten', 0.5), 0, 1,
    );
    const dirtSurface = {
      color: dirtColor,
      emissive: vec3(0),
      metalness: float(0),
      normal: maps.dirtNormal
        ? normalMapNode(
          sourceTextureSample(
            maps.dirtNormal,
            dirtUv,
            { anisotropic: true },
          ).rgb,
          vec2(dirtNormalStrength, -dirtNormalStrength),
        )
        : normalViewGeometry,
      roughness: maps.dirtRoughness
        ? sourceTextureSample(
          maps.dirtRoughness,
          dirtUv,
          { anisotropic: true },
        ).r
        : float(1),
      specular: float(scalar(profile, 'Dirt Specular', 0.1)),
    };

    const sandUv = landscapeCoord.div(Math.max(scalar(profile, 'Sand Scale', 10), 0.001));
    const sandSample = sourceTextureSample(maps.SandTexture, sandUv).rgb;
    const sandBase = sandSample.mul(
      linearColor(vector(profile, 'Sand Tint', [0.831, 0.811, 0.623])),
    );
    const waterline = clamp(
      positionWorld.y.mul(100)
        .sub(scalar(profile, 'Waterline Height', 20))
        .div(Math.max(scalar(profile, 'Waterline Distance', 75), 0.001)),
      0,
      1,
    );
    const sandNormalStrength = 1 - THREE.MathUtils.clamp(
      scalar(profile, 'Sand Flatten', 0.3), 0, 1,
    );
    const sandSurface = {
      color: mix(sandBase.mul(scalar(profile, 'Water Darken', 0.7)), sandBase, waterline),
      emissive: vec3(0),
      metalness: float(0),
      normal: maps.sandNormal
        ? normalMapNode(
          sourceTextureSample(maps.sandNormal, sandUv).rgb,
          vec2(sandNormalStrength, -sandNormalStrength),
        )
        : normalViewGeometry,
      roughness: maps.sandRoughness
        ? sourceTextureSample(maps.sandRoughness, sandUv).r
        : float(1),
      specular: float(scalar(profile, 'Sand Specular', 0.15)),
    };

    const snowNodes = buildSnowNodes(profile, state, maps);
    const snowSurface = {
      color: snowNodes.colorNode,
      emissive: snowNodes.emissiveNode,
      metalness: snowNodes.metalnessNode,
      normal: normalViewGeometry,
      roughness: snowNodes.roughnessNode,
      specular: snowNodes.specularNode,
    };
    const snowGrassBlueSurface = {
      ...snowSurface,
      color: snowSurface.color.mul(linearColor(
        vector(profile, 'SnowGrassBlue Color', [0.373, 0.47, 0.896]),
      )),
    };

    const desertGrassUv = sourceWorldXY.div(Math.max(
      scalar(profile, 'Desert Grass Scale', 1024) / 100,
      0.001,
    ));
    const desertGrassSample = sourceTextureSample(
      maps['Grass Color Texture'],
      desertGrassUv,
    ).rgb;
    const desertGrassBase = sourceOverlay(
      sourceDesaturate(desertGrassSample, 1),
      linearColor(vector(profile, 'Desert Grass Tint', [0.604, 0.214, 0.099])),
    );
    const cameraVector = normalize(cameraPosition.sub(positionWorld));
    const desertFresnel = pow(
      clamp(float(1).sub(dot(normalWorldGeometry, cameraVector)), 0, 1),
      scalar(profile, 'Desert Sand Fresnel Falloff', 4),
    );
    const desertGrassColor = mix(
      desertGrassBase,
      desertGrassBase.mul(scalar(profile, 'Desert Sand Fresnel Multiply', 2)),
      desertFresnel,
    );
    const desertGrassSurface = {
      color: desertGrassColor,
      emissive: desertGrassColor.mul(
        scalar(profile, 'Desert Grass Emission', 0.2),
      ),
      metalness: float(0),
      normal: normalViewGeometry,
      roughness: float(scalar(profile, 'Desert Grass Roughness', 0.4)),
      specular: float(scalar(profile, 'Desert Grass Specular', 0.5)),
    };

    const desertDirtUv = sourceWorldXY.div(Math.max(
      scalar(profile, 'Desert Dirt Scale', 1024) / 100,
      0.001,
    ));
    const desertDirtBase = sourceTextureSample(
      maps['Desert Dirt Texture'],
      desertDirtUv,
    ).rgb;
    const desertDirtTint = linearColor(
      vector(profile, 'Desert Dirt Tint', [0.604, 0.214, 0.099]),
    );
    const desertDirtColor = desertDirtBase.mul(mix(
      desertDirtTint,
      desertDirtTint.mul(2),
      desertFresnel,
    ));
    const desertDirtNormalStrength = 1 - THREE.MathUtils.clamp(
      scalar(profile, 'Desert Dirt Normal Flatness', 0.5), 0, 1,
    );
    const desertDirtSurface = {
      color: desertDirtColor,
      emissive: desertDirtColor.mul(
        scalar(profile, 'Desert Dirt Emissive', 0.1),
      ),
      metalness: float(0),
      normal: maps.desertDirtNormal
        ? normalMapNode(
          sourceTextureSample(maps.desertDirtNormal, desertDirtUv).rgb,
          vec2(desertDirtNormalStrength, -desertDirtNormalStrength),
        )
        : normalViewGeometry,
      roughness: maps['Desert Dirt Roughness']
        ? sourceTextureSample(maps['Desert Dirt Roughness'], desertDirtUv).r
          .mul(scalar(profile, 'Desert Dirt Roughness Multiplier', 1))
        : float(1),
      specular: float(scalar(profile, 'Desert Dirt Specular', 0.2)),
    };

    const desertSandUv = sourceWorldXY.div(Math.max(
      scalar(profile, 'Desert Sand Scale', 1024) / 100,
      0.001,
    ));
    const desertSandSample = sourceTextureSample(
      maps['Desert Sand Texture'],
      desertSandUv,
    ).rgb;
    const desertSandBase = sourceDesaturate(desertSandSample, 1);
    const desertSandVariance = maps.desertSandVariance
      ? sourceTextureSample(maps.desertSandVariance, sourceWorldXY.div(Math.max(
        scalar(profile, 'Desert Sand Color Variance Scale', 50000) / 100,
        0.001,
      ))).r
      : float(0);
    const desertSandColorBase = mix(
      sourceOverlay(
        desertSandBase,
        linearColor(vector(profile, 'Desert Sand Tint', [0.597, 0.292, 0.156])),
      ),
      sourceOverlay(
        desertSandBase,
        linearColor(vector(profile, 'Desert Sand Tint 2', [0.597, 0.246, 0.114])),
      ),
      desertSandVariance,
    );
    const desertSandColor = mix(
      desertSandColorBase,
      desertSandColorBase.mul(scalar(profile, 'Desert Sand Fresnel Multiply', 2)),
      desertFresnel,
    );
    const desertSandRoughnessNoise = maps.desertSandRoughness
      ? sourceTextureSample(maps.desertSandRoughness, sourceWorldXY.div(5)).r
      : float(0.5);
    let desertSandNormalView = normalViewGeometry;
    if (maps.desertSandNormal) {
      let desertSandNormalWorld = sourceWorldAlignedNormal(
        maps.desertSandNormal,
        scalar(profile, 'Desert Sand Normal Texture Scale', 2400) / 100,
      );
      const desertNormalFade = clamp(
        sourcePixelDepthCm().div(Math.max(
          scalar(profile, 'Desert Sand Normal Far Distance', 3000),
          0.001,
        )),
        0,
        1,
      );
      desertSandNormalWorld = normalize(mix(
        desertSandNormalWorld,
        normalWorldGeometry,
        mix(
          scalar(profile, 'Desert Sand Normal Near Flatness', 0),
          scalar(profile, 'Desert Sand Normal Far Flatness', 1),
          desertNormalFade,
        ),
      ));
      desertSandNormalView = transformNormalByViewMatrix(
        desertSandNormalWorld,
        cameraViewMatrix,
      );
    }
    const desertSandSurface = {
      color: desertSandColor,
      emissive: desertSandColor.mul(scalar(profile, 'Desert Sand Emissive', 0.1)),
      metalness: float(0),
      normal: desertSandNormalView,
      roughness: mix(
        scalar(profile, 'Desert Sand Roughness Min', 0.5),
        scalar(profile, 'Desert Sand Roughness Max', 0.7),
        desertSandRoughnessNoise,
      ),
      specular: float(scalar(profile, 'Desert Sand Specular', 0.2)),
    };

    const sourceSurfaces = {
      DesertDirt: desertDirtSurface,
      DesertGrass: desertGrassSurface,
      DesertSand: desertSandSurface,
      Dirt: dirtSurface,
      Grass: grassSurface,
      Rock: rockSurface,
      Sand: sandSurface,
      Snow: snowSurface,
      SnowGrass: snowSurface,
      SnowGrassBlue: snowGrassBlueSurface,
    };
    const sourceRawColors = {
      DesertDirt: desertDirtBase,
      DesertGrass: desertGrassSample,
      DesertSand: desertSandSample,
      Dirt: dirtSample,
      Grass: grassPrimary,
      Rock: rockSample.rgb,
      Sand: sandSample,
      // Texture projection is retained, while snow response, sparkle,
      // weather, tint, and emission remain authored-mode responsibilities.
      Snow: planar(
        maps['Snow Texture'],
        scalar(profile, 'Snow Scale', 5000) / 100,
      ).rgb,
      SnowGrass: planar(
        maps['Snow Texture'],
        scalar(profile, 'Snow Scale', 5000) / 100,
      ).rgb,
      SnowGrassBlue: planar(
        maps['Snow Texture'],
        scalar(profile, 'Snow Scale', 5000) / 100,
      ).rgb,
    };
    let surfaces = sourceSurfaces;
    if (toonLabTerrainLayers) {
      const toonLabSurface = (layerName) => {
        const layer = toonLabTerrainLayers[layerName];
        const layerUv = sourceWorldXY.div(Math.max(layer.tileSize, 0.001));
        const diffuseMap = maps[`toonLabTerrain${layerName}Diffuse`];
        const normalMap = maps[`toonLabTerrain${layerName}Normal`];
        return {
          color: sourceTextureSample(diffuseMap, layerUv).rgb,
          emissive: vec3(0),
          metalness: float(layer.metallic),
          normal: normalMap
            ? normalMapNode(
              sourceTextureSample(normalMap, layerUv).rgb,
              vec2(layer.normalScale, layer.normalScale),
            )
            : normalViewGeometry,
          roughness: float(1 - layer.smoothness),
          // TOONLAB Terrain/Lit uses the standard dielectric F0 before its metallic
          // blend; Three's physical material reaches that with intensity 1.
          specular: float(1),
        };
      };
      const exact = Object.fromEntries(
        Object.keys(toonLabTerrainLayers).map((layerName) => [
          layerName,
          toonLabSurface(layerName),
        ]),
      );
      surfaces = {
        ...exact,
        SnowGrass: exact.Snow,
        SnowGrassBlue: exact.Snow,
      };
    }

    const weightSize = vec2(
      TOONLAB_SHOWCASE_WEIGHTMAP_CONTRACT.width,
      TOONLAB_SHOWCASE_WEIGHTMAP_CONTRACT.height,
    );
    const weightUv = clamp(
      landscapeCoord.add(0.5).div(weightSize),
      vec2(
        0.5 / TOONLAB_SHOWCASE_WEIGHTMAP_CONTRACT.width,
        0.5 / TOONLAB_SHOWCASE_WEIGHTMAP_CONTRACT.height,
      ),
      vec2(
        (TOONLAB_SHOWCASE_WEIGHTMAP_CONTRACT.width - 0.5)
          / TOONLAB_SHOWCASE_WEIGHTMAP_CONTRACT.width,
        (TOONLAB_SHOWCASE_WEIGHTMAP_CONTRACT.height - 0.5)
          / TOONLAB_SHOWCASE_WEIGHTMAP_CONTRACT.height,
      ),
    );
    const heightSignal = maps.autoCliffNoise
      ? sourceTextureSample(maps.autoCliffNoise,
        landscapeCoord.div(Math.max(scalar(profile, 'Height Noise Scale', 30), 0.001)),
      ).r.mul(scalar(profile, 'Height Noise Strength', 1.1))
      : float(0);
    const sourceWeights = {};
    const modifiedWeights = {};
    for (const layerName of TOONLAB_SHOWCASE_WEIGHTMAP_CONTRACT.layers) {
      const binding = weightBindings[layerName];
      const rawWeight = sourceTextureSample(
        binding.texture,
        weightUv,
      )[binding.channel];
      sourceWeights[layerName] = rawWeight;
      modifiedWeights[layerName] = !toonLabTerrainLayers
        && TOONLAB_SHOWCASE_WEIGHTMAP_CONTRACT.heightBlendLayers.includes(layerName)
        ? clamp(rawWeight.mul(2).sub(1).add(heightSignal), 0.0001, 1)
        : rawWeight;
    }
    let weightSum = float(0);
    for (const layerName of TOONLAB_SHOWCASE_WEIGHTMAP_CONTRACT.layers) {
      weightSum = weightSum.add(modifiedWeights[layerName]);
    }
    const normalizedWeightDenominator = max(weightSum, 1e-8);
    paintedWeights = Object.fromEntries(
      TOONLAB_SHOWCASE_WEIGHTMAP_CONTRACT.layers.map((layerName) => [
        layerName,
        modifiedWeights[layerName].div(normalizedWeightDenominator),
      ]),
    );
    let sourceWeightSum = float(0);
    for (const layerName of TOONLAB_SHOWCASE_WEIGHTMAP_CONTRACT.layers) {
      sourceWeightSum = sourceWeightSum.add(sourceWeights[layerName]);
    }
    const sourceWeightDenominator = max(sourceWeightSum, 1e-8);
    const sourcePlacementWeights = Object.fromEntries(
      TOONLAB_SHOWCASE_WEIGHTMAP_CONTRACT.layers.map((layerName) => [
        layerName,
        sourceWeights[layerName].div(sourceWeightDenominator),
      ]),
    );
    const blendField = (field, initial) => {
      let result = initial;
      for (const layerName of TOONLAB_SHOWCASE_WEIGHTMAP_CONTRACT.layers) {
        result = result.add(surfaces[layerName][field].mul(paintedWeights[layerName]));
      }
      return result;
    };
    paintedSurface = {
      color: blendField('color', vec3(0)),
      emissive: blendField('emissive', vec3(0)),
      metalness: blendField('metalness', float(0)),
      normal: normalize(blendField('normal', vec3(0))),
      roughness: blendField('roughness', float(0)),
      specular: blendField('specular', float(0)),
    };
    let rawColorBlend = vec3(0);
    for (const layerName of TOONLAB_SHOWCASE_WEIGHTMAP_CONTRACT.layers) {
      rawColorBlend = rawColorBlend.add(
        sourceRawColors[layerName].mul(sourcePlacementWeights[layerName]),
      );
    }
    shaderSwipeColorNode = rawColorBlend;
  }

  let colorNode;
  let roughnessNode;
  let specularNode;
  let metalnessNode;
  let emissiveNode;
  let normalNode;
  if (toonLabTerrainLayers) {
    // ToonLab's supplied landscape is stock TOONLAB Terrain/Lit. It has no ToonLab
    // AutoCliff, height-blend, day-cycle emission, or rain-wetness stage.
    colorNode = paintedSurface.color;
    roughnessNode = paintedSurface.roughness;
    specularNode = paintedSurface.specular;
    metalnessNode = paintedSurface.metalness;
    emissiveNode = paintedSurface.emissive;
    normalNode = normalize(paintedSurface.normal);
    cliffMask = float(0);
  } else {
    // M_Landscape normalizes the painted layers, replaces them with MF_Rock on
    // AutoCliff slopes, then applies MF_RainWetness.
    colorNode = mix(paintedSurface.color, rockSurface.color, cliffMask);
    roughnessNode = mix(paintedSurface.roughness, rockSurface.roughness, cliffMask);
    specularNode = mix(paintedSurface.specular, rockSurface.specular, cliffMask);
    metalnessNode = mix(paintedSurface.metalness, rockSurface.metalness, cliffMask);
    emissiveNode = mix(paintedSurface.emissive, rockSurface.emissive, cliffMask);
    normalNode = normalize(mix(paintedSurface.normal, rockSurface.normal, cliffMask));
    const wet = wetSurface(colorNode, roughnessNode, profile, state);
    colorNode = wet.colorNode;
    roughnessNode = wet.roughnessNode;
    if (switchValue(profile, 'UseWeather?', true)
      && switchValue(profile, 'RainWetness?', true)) {
      const wetness = clamp(state.uniforms.rainWetness, 0, 1);
      specularNode = mix(
        specularNode,
        clamp(specularNode.mul(scalar(profile, 'Wet Specular', 1)), 0, 1),
        wetness,
      );
    }
  }

  const material = new MeshPhysicalNodeMaterial();
  material.side = THREE.FrontSide;
  material.colorNode = colorNode;
  material.roughnessNode = clamp(roughnessNode, 0.02, 1);
  material.metalnessNode = clamp(metalnessNode, 0, 1);
  material.specularIntensityNode = clamp(specularNode, 0, 1);
  material.emissiveNode = emissiveNode;
  material.normalNode = normalNode;
  setShaderSwipeBaseline(material, {
    colorNode: shaderSwipeColorNode,
  });
  installToonLabSourceDefaultLitLighting(material);
  return recordSourceContract(finalizeMaterial(material, profile, 'landscape'), {
    autoCliff: toonLabTerrainLayers
      ? 'disabled; absent from ToonLab Terrain/Lit'
      : 'saturate(remap(VertexNormalWS.z,.85,.8)-noise)',
    autoGrassAffectsSurface: false,
    inferredSnow: false,
    layerBlendOrder: toonLabTerrainLayers
      ? 'ToonLab Terrain/Lit normalized splat weights'
      : 'painted-layers-then-auto-cliff-then-rain-wetness',
    landscapeCoordinates: 'actor-local-quad-units',
    lighting:
      'ToonLab legacy Default Lit Lambert + punctual GGX + captured-SkyLight boundary',
    rockNormal: 'world-aligned-projection-with-pixel-depth-flattening',
    weightmaps: {
      binding: weightBindings
        ? 'authoritative-ten-mask-three-rgba-packs'
        : 'diagnostic-grass-fallback',
      blend: weightBindings
        ? (toonLabTerrainLayers
          ? 'ToonLab Terrain/Lit normalized splat weights; no mask/height maps'
          : 'height:clamp(2*w-1+T_NoiseStylized.r*1.1,.0001,1); '
            + 'weight:w; normalize-all-ten-together')
        : null,
      errors: [...weightInspection.errors],
      fallback: weightBindings
        ? null
        : 'Grass plus source AutoCliff; no inferred painted layers',
      heightBlendLayers: [...TOONLAB_SHOWCASE_WEIGHTMAP_CONTRACT.heightBlendLayers],
      requiredLayers: [...TOONLAB_SHOWCASE_WEIGHTMAP_CONTRACT.layers],
      samplerlessFiltering:
        'manual-bilinear-trilinear-textureLoad; authored-address-modes; '
        + 'P14 dirt base/normal/roughness authored 8x anisotropy',
      samplerlessColorTransfer:
        'WebGPU sRGB texture formats decode on textureLoad; no second shader decode',
      samplerlessTextureCount: samplerlessTextures.count,
      status: weightInspection.status,
      textureNames: weightPackTextures
        ? weightPackTextures.map((weightTexture) => weightTexture.name)
        : [],
      weightBlendLayers: [...TOONLAB_SHOWCASE_WEIGHTMAP_CONTRACT.weightBlendLayers],
      weightsConnected: Boolean(paintedWeights),
    },
  });
}

async function buildWater(profile, context) {
  const { library, state } = context;
  const maps = await loadProfileTextures(library, profile, [
    'Detail Normal Texture',
    'Stylized Texture',
    'Waves Displacement Texture',
    'Waves Normal Texture',
  ], { flipY: false });
  const waterScale = scalar(profile, 'Waves Scale', 8000) / 100;
  const waveSpeed = scalar(profile, 'Wave Speed', 0.2);
  const waveUv = positionWorld.xz.div(Math.max(waterScale, 0.001))
    .add(vec2(state.uniforms.time.mul(waveSpeed * 0.015), state.uniforms.time.mul(waveSpeed * -0.011)));
  const wave = maps['Waves Displacement Texture']
    ? texture(maps['Waves Displacement Texture']).sample(waveUv)
    : null;
  const scattering = linearColor(vector(profile, 'Scattering Color', [0.02, 0.12, 0.63]));
  const absorption = linearColor(vector(profile, 'Absorption Color', [1, 0.17, 0]));
  const facing = pow(clamp(dot(normalize(normalWorld), vec3(0, 1, 0)), 0, 1), 2);
  const colorNode = mix(scattering, scattering.add(absorption.mul(0.08)), facing);
  const material = new MeshPhysicalNodeMaterial();
  material.side = THREE.DoubleSide;
  material.transparent = true;
  material.depthWrite = false;
  material.opacity = 0.78;
  material.colorNode = colorNode;
  material.roughnessNode = clamp(float(scalar(profile, 'Roughness', 0.12)), 0.02, 1);
  material.metalnessNode = clamp(float(scalar(profile, 'Metallic', 0)), 0, 1);
  material.specularIntensityNode = clamp(float(scalar(profile, 'Specular 2', 0.2)), 0, 1);
  if (maps['Waves Normal Texture']) {
    material.normalNode = normalMapNode(
      texture(maps['Waves Normal Texture']).sample(waveUv).rgb,
      vec2(1, -1),
    );
  }
  if (wave && switchValue(profile, 'WaterDisplacement?', true)) {
    const height = scalar(profile, 'Main Wave Displace Height', 80) / 100;
    material.positionNode = positionLocal.add(vec3(0, wave.r.sub(0.5).mul(height), 0));
  }
  return finalizeMaterial(material, profile, 'water');
}

async function buildSky(profile, context) {
  const { library } = context;
  const maps = await loadProfileTextures(library, profile, [
    'BG Cloud Texture',
    'Nebula Texture',
    'Star Texture',
  ], { flipY: false });
  const atlas = library.resolveCurve(CURVE_ATLASES.sky);
  const dayCurve = library.resolveCurveAtlasRow(atlas, scalar(profile, 'Day Curve', 0));
  const dayTexture = library.createCurveTexture(dayCurve);
  let skyColor = dayTexture
    ? texture(dayTexture).sample(vec2(clamp(float(1).sub(uv().y), 0, 1), 0.5)).rgb
    : vec3(0.12, 0.45, 0.9);
  skyColor = skyColor.mul(scalar(profile, 'Sky Brightness', 1));
  if (switchValue(profile, 'BackgroundClouds?', true) && maps['BG Cloud Texture']) {
    const verticalStretch = Math.max(
      scalar(profile, 'BG Clouds Vertical Stretch', 1),
      0.001,
    );
    const cloudUv = uv()
      .sub(0.5)
      .div(vec2(1, verticalStretch))
      .add(0.5)
      .add(vec2(0, scalar(profile, 'BG Clouds Vertical Offset', 0)));
    const cloud = texture(maps['BG Cloud Texture'])
      .sample(cloudUv)
      .rgb
      .mul(linearColor(vector(profile, 'BG Clouds Tint', [0.529, 0.747966, 1])));
    const screened = sourceScreen(skyColor, cloud);
    skyColor = mix(
      skyColor,
      screened,
      scalar(profile, 'BG Clouds Strength', 0.3),
    );
  }
  skyColor = sourceDesaturate(
    skyColor,
    1 - scalar(profile, 'Saturation', 1),
  );
  const material = new MeshBasicNodeMaterial();
  material.side = THREE.FrontSide;
  material.depthWrite = true;
  material.depthTest = true;
  material.fog = true;
  material.colorNode = skyColor;
  return recordSourceContract(finalizeMaterial(material, profile, 'sky'), {
    backgroundClouds: 'static-tinted-texture-screen-blend',
    blendMode: 'opaque',
    curveTime: '1-uv0.y',
    depthTest: true,
    depthWrite: true,
    fog: true,
    shadingModel: 'unlit',
    sidedness: 'front',
    temporalDither: 'ToonLab exact graph, Good64x64TilingNoiseHighFreq, Random=1',
  });
}

async function buildClouds(profile, context) {
  const { library, state } = context;
  // M_StylizedClouds_Lite embeds this texture sample directly in its parent
  // graph, so it does not appear as an overridable instance parameter. It is
  // nevertheless part of the supplied source material and texture inventory.
  const cloudMap = await library.loadTexture(CLOUD_LITE_TEXTURE, { flipY: false });
  const atlas = library.resolveCurve(CURVE_ATLASES.clouds);
  const curve = library.resolveCurveAtlasRow(
    atlas,
    scalar(profile, 'CloudColor', 0),
  );
  const curveTexture = library.createCurveTexture(curve);
  const rotation = scalar(profile, 'Rotation Speed', -0.0005);
  const verticalStretch = scalar(profile, 'Vertical Stretch', 1);
  const panned = vec2(
    uv().x.add(state.uniforms.time.mul(rotation)),
    uv().y.add(scalar(profile, 'Vertical Offset', 0)),
  );
  // Engine/ScaleUVsByCenter divides the centered coordinate by Texture
  // Scale. Its optional 0-1 mask output is not connected in the source graph.
  const coordinates = panned.sub(0.5).div(vec2(1, verticalStretch)).add(0.5);
  const cloudSample = texture(cloudMap).sample(coordinates);
  // In the source graph the cloud texture's R channel is the CurveTime input
  // of the CloudColor CurveAtlasRowParameter. Alpha is the silhouette mask;
  // Strength multiplies the evaluated cloud color, not the mask.
  const cloudColor = curveTexture
    ? texture(curveTexture).sample(vec2(clamp(cloudSample.r, 0, 1), 0.5)).rgb
    : vec3(0.92, 0.96, 1);
  const cloudMask = sourceTemporalDither(cloudSample.a, state);
  const cloudStrength = scalar(profile, 'Strength', 1);
  const material = new MeshBasicNodeMaterial();
  material.side = THREE.FrontSide;
  material.transparent = false;
  material.depthTest = true;
  material.depthWrite = true;
  material.fog = true;
  material.colorNode = cloudColor.mul(cloudStrength);
  material.opacityNode = cloudMask;
  material.alphaTestNode = float(1 / 3);
  material.maskShadowNode = cloudMask.greaterThan(float(1 / 3));
  material.alphaToCoverage = false;
  return recordSourceContract(finalizeMaterial(material, profile, 'clouds'), {
    alpha: 'DitherTemporalAA(T_CloudLayer03.a)',
    alphaClip: 1 / 3,
    blendMode: 'masked',
    color: 'Curve_Clouds_Classic_Day(T_CloudLayer03.r)*Strength',
    coordinateMaskConnected: false,
    depthTest: true,
    depthWrite: true,
    fog: true,
    shadingModel: 'unlit',
    sidedness: 'front',
  });
}

async function buildFallback(profile, context) {
  const { library, state } = context;
  const textureEntries = Object.entries(profile.parameters?.texture ?? {});
  const colorTexture = textureEntries.find(([name]) =>
    /(?:base|color|diffuse|texture)/i.test(name)
    && !/(?:normal|rough|mask|height|displace)/i.test(name));
  const map = colorTexture
    ? await library.loadTexture(colorTexture[1]).catch(() => null)
    : null;
  const firstVector = Object.values(profile.parameters?.vector ?? {})[0];
  let colorNode = linearColor(firstVector, [0.65, 0.65, 0.65]);
  if (map) colorNode = texture(map).sample(uv()).rgb;
  const material = new MeshPhysicalNodeMaterial();
  material.side = THREE.DoubleSide;
  material.colorNode = colorNode;
  material.roughnessNode = clamp(float(scalar(profile, 'Roughness', 0.7)), 0.02, 1);
  material.metalnessNode = clamp(float(scalar(profile, 'Metallic', 0)), 0, 1);
  material.specularIntensityNode = clamp(float(scalar(profile, 'Specular', 0.2)), 0, 1);
  material.emissiveNode = sourceEmission(colorNode, profile, state);
  return finalizeMaterial(material, profile, profile.family ?? 'misc');
}

function isStylizedBasicProfile(profile) {
  return Boolean(profile?.chain?.includes(
    '/Game/ToonLab/Materials/M_StylizedBasic.M_StylizedBasic',
  ));
}

/**
 * Exact active M_StylizedBasic graph used by the supplied cactus and beach
 * shell instances.
 *
 * Unlike ToonLab's S_StylizedBasic counterpart, ToonLab consumes the roughness
 * texture directly. The optional VT branch follows MF_VTBlend's authored
 * world-height formulas; no shipped instance enables both landscape blending
 * and normal blending, so the active source set needs no inferred ground
 * normal.
 */
async function buildStylizedBasic(profile, context) {
  const {
    importedPbr = null,
    library,
    sourceActorIdentity,
    state,
  } = context;
  const maps = await loadProfileTextures(library, profile, [
    'Base Color Texture',
    'Emissive Texture',
    'Metallic Texture',
    'Normal Texture',
    'Roughness Texture',
    'Specular Texture',
  ], { flipY: false });
  const coordinates = uv();
  const baseTextureSample = importedPbr?.map
    ? texture(importedPbr.map).sample(coordinates)
    : maps['Base Color Texture']
    ? sourceTextureSample(maps['Base Color Texture'], coordinates)
    : null;
  const baseColorFactor = linearColor(
    importedPbr?.color
      ? [importedPbr.color.r, importedPbr.color.g, importedPbr.color.b]
      : vector(profile, 'Base Color', [0.541667, 0.541667, 0.541667]),
  );
  let colorNode = baseTextureSample
    ? baseTextureSample.rgb.mul(baseColorFactor)
    : baseColorFactor;
  colorNode = sourceHueVariance(colorNode, profile, sourceActorIdentity);

  const metallicTextureSample = importedPbr?.metalnessMap
    ? texture(importedPbr.metalnessMap).sample(coordinates)
    : maps['Metallic Texture']
    ? sourceTextureSample(maps['Metallic Texture'], coordinates)
    : null;
  let metalnessNode = importedPbr
    ? metallicTextureSample
      ? metallicTextureSample.b.mul(importedPbr.metalness)
      : float(importedPbr.metalness)
    : switchValue(profile, 'MetallicMap?', false) && metallicTextureSample
    ? metallicTextureSample.r
    : float(scalar(profile, 'Metallic', 0));

  const roughnessTextureSample = importedPbr?.roughnessMap
    ? texture(importedPbr.roughnessMap).sample(coordinates)
    : maps['Roughness Texture']
    ? sourceTextureSample(maps['Roughness Texture'], coordinates)
    : null;
  let roughnessNode = importedPbr
    ? roughnessTextureSample
      ? roughnessTextureSample.g.mul(importedPbr.roughness)
      : float(importedPbr.roughness)
    : switchValue(profile, 'RoughnessMap?', false) && roughnessTextureSample
    ? roughnessTextureSample.r
    : float(scalar(profile, 'Roughness', 0.5));

  const specularTextureSample = maps['Specular Texture']
    ? sourceTextureSample(maps['Specular Texture'], coordinates)
    : null;
  let specularNode = switchValue(profile, 'SpecularMap?', false)
    && specularTextureSample
    ? specularTextureSample.r
    : float(scalar(profile, 'Specular', 0.5));

  let normalNode = normalViewGeometry;
  const normalTextureSample = importedPbr?.normalMap
    ? texture(importedPbr.normalMap).sample(coordinates)
    : maps['Normal Texture']
    ? sourceTextureSample(maps['Normal Texture'], coordinates)
    : null;
  if (importedPbr?.normalMap && normalTextureSample) {
    normalNode = normalMapNode(
      normalTextureSample.rgb,
      vec2(
        importedPbr.normalScale?.x ?? 1,
        importedPbr.normalScale?.y ?? 1,
      ),
    );
  } else if (switchValue(profile, 'NormalMap?', false) && normalTextureSample) {
    const strength = scalar(profile, 'Normal Strength', 1);
    normalNode = normalMapNode(
      normalTextureSample.rgb,
      vec2(strength, -strength),
    );
  }

  const blendWithLandscape = switchValue(profile, 'BlendWithLandscape?', false);
  if (blendWithLandscape) {
    const groundColor = sampleGroundColor(positionWorld);
    const groundSurface = sampleGroundSurface(positionWorld);
    const heightDeltaCm = positionWorld.y
      .sub(sampleGroundHeight(positionWorld))
      .mul(100);
    const distanceCm = Math.max(
      scalar(profile, 'VT Blend - Distance', 100),
      0.001,
    );
    const offsetCm = scalar(profile, 'VT Blend - Offset', 0);
    const falloff = Math.max(scalar(profile, 'VT Blend - Falloff', 2), 0.001);
    const colorAlpha = pow(
      float(1).sub(clamp(
        heightDeltaCm.add(offsetCm).div(distanceCm),
        0,
        1,
      )),
      falloff,
    ).mul(groundColor.a);
    const surfaceAlpha = float(1).sub(clamp(
      heightDeltaCm.div(distanceCm / 6),
      0,
      1,
    )).mul(groundSurface.a);
    colorNode = mix(colorNode, groundColor.rgb, colorAlpha);
    specularNode = mix(specularNode, groundSurface.g, surfaceAlpha);
    // The only supplied instance with BlendWithLandscape? enabled has
    // BlendNormals? disabled. Preserve its authored local normal exactly.
  }

  const emissiveTextureSample = importedPbr?.emissiveMap
    ? texture(importedPbr.emissiveMap).sample(coordinates)
    : maps['Emissive Texture']
    ? sourceTextureSample(maps['Emissive Texture'], coordinates)
    : null;
  const importedEmissive = importedPbr
    ? linearColor([
        importedPbr.emissive.r,
        importedPbr.emissive.g,
        importedPbr.emissive.b,
      ]).mul(importedPbr.emissiveIntensity)
    : null;
  const emissiveInput = importedPbr
    ? emissiveTextureSample
      ? emissiveTextureSample.rgb.mul(importedEmissive)
      : importedEmissive
    : switchValue(profile, 'EmissiveMap?', false) && emissiveTextureSample
    ? emissiveTextureSample.rgb
    : colorNode;
  const emissiveNode = applyDayCycleEmission(
    importedPbr
      ? emissiveInput
      : emissiveInput.mul(scalar(profile, 'Emissive Strength', 0)),
    profile,
    state,
  );

  const material = new MeshPhysicalNodeMaterial();
  material.side = THREE.FrontSide;
  material.colorNode = colorNode;
  material.metalnessNode = clamp(metalnessNode, 0, 1);
  // M_StylizedBasic outputs ToonLab roughness directly. Do not apply the
  // smoothness inversion used by ToonLab's S_StylizedBasic port.
  material.roughnessNode = clamp(roughnessNode, 0, 1);
  material.specularIntensityNode = clamp(specularNode, 0, 1);
  material.normalNode = normalNode;
  material.emissiveNode = emissiveNode;
  setShaderSwipeBaseline(material, {
    colorNode: baseTextureSample
      ? baseTextureSample.rgb.mul(baseColorFactor)
      : baseColorFactor,
  });
  installToonLabSourceDefaultLitLighting(material);
  return recordSourceContract(finalizeMaterial(
    material,
    profile,
    'stylizedBasic',
  ), {
    baseColor: 'UseColorTexture? Base Color Texture : Base Color; MF_HueVariance',
    blendNormals: blendWithLandscape
      ? 'authored disabled on every active VT-blended source instance'
      : 'inactive because BlendWithLandscape? is false',
    emissive: 'EmissiveMap? texture : post-hue base; strength; MF_DayCycleEmission',
    landscapeBlend: blendWithLandscape
      ? 'MF_VTBlend world-height color and specular branches'
      : 'inactive',
    lighting: 'ToonLab Default Lit',
    metallic: 'MetallicMap? texture.r : Metallic',
    normal: switchValue(profile, 'NormalMap?', false)
      ? 'FlattenNormal(Normal Texture, 1-Normal Strength)'
      : 'tangent-space +Z / authored geometry normal',
    roughness: 'RoughnessMap? texture.r : Roughness; direct ToonLab roughness',
    shadingModel: 'MSM_DEFAULT_LIT',
    sidedness: 'front',
    specular: 'SpecularMap? texture.r : Specular',
    sourceGraph: '/Game/ToonLab/Materials/M_StylizedBasic',
    vtBlend: blendWithLandscape
      ? {
          baseAlpha: 'pow(1-saturate((WorldZ-GroundZ+Offset)/Distance),Falloff)',
          normalBlend: switchValue(profile, 'BlendNormals?', false),
          surfaceAlpha: '1-saturate((WorldZ-GroundZ)/(Distance/6))',
        }
      : null,
  });
}

/**
 * Route an ordinary imported PBR material through the Call Me Sensei
 * manufactured-surface implementation without changing the imported mesh.
 *
 * This is intentionally narrow: it preserves the authored PBR factors, maps,
 * normal strength, emission, and sidedness present in the supplied GLB.
 */
export async function createToonLabBasicMaterialFromPbr(
  sourceMaterial,
  {
    library,
    sourceActorIdentity = null,
    sourceAssetName = 'imported-solid-prop',
    state = null,
  } = {},
) {
  if (!library) {
    throw new Error('createToonLabBasicMaterialFromPbr requires a source library.');
  }
  const color = sourceMaterial?.color ?? new THREE.Color(1, 1, 1);
  const profileName = String(sourceMaterial?.name || 'ImportedSolid')
    .replace(/[^A-Za-z0-9_-]+/g, '_');
  const profile = {
    path: `/ToonLab/CallMeSensei/${sourceAssetName}/${profileName}.${profileName}`,
    family: 'misc',
    chain: [
      `/ToonLab/CallMeSensei/${sourceAssetName}/${profileName}.${profileName}`,
      '/Game/ToonLab/Materials/M_StylizedBasic.M_StylizedBasic',
    ],
    parameters: {
      scalar: {
        'Day Emission Multiplier': 1,
        'Emissive Strength': 0,
        'Hue Shift': 0,
        'Hue Variation': 0,
        Metallic: Number(sourceMaterial?.metalness) || 0,
        'Night Emission Multiplier': 0,
        'Normal Strength': 0,
        'Overcast Emission Multiplier': 0.25,
        Roughness: Number.isFinite(sourceMaterial?.roughness)
          ? sourceMaterial.roughness
          : 0.5,
        Specular: Number.isFinite(sourceMaterial?.specularIntensity)
          ? sourceMaterial.specularIntensity
          : 0.5,
        'Sunrise Emission Multiplier': 0.1,
        'Sunset Emission Multiplier': 0.1,
      },
      vector: {
        'Base Color': [color.r, color.g, color.b, 1],
      },
      texture: {},
      static_switch: {
        'BlendNormals?': false,
        'BlendWithLandscape?': false,
        'EmissiveMap?': false,
        'MetallicMap?': false,
        'NormalMap?': false,
        'RoughnessMap?': false,
        'SpecularMap?': false,
        'UseColorTexture?': false,
        // Call Me Sensei owns the general solid-surface response only. Imported
        // emission is preserved verbatim; time/weather modulation remains
        // frozen until its declared checkpoint.
        'UseDayCycleEmission?': false,
        'UseWeather?': false,
      },
    },
  };
  const material = await buildStylizedBasic(profile, {
    hasUv2: false,
    hasVertexColors: false,
    importedPbr: {
      color,
      emissive: sourceMaterial?.emissive ?? new THREE.Color(0, 0, 0),
      emissiveIntensity: Number.isFinite(sourceMaterial?.emissiveIntensity)
        ? sourceMaterial.emissiveIntensity
        : 1,
      emissiveMap: sourceMaterial?.emissiveMap ?? null,
      map: sourceMaterial?.map ?? null,
      metalness: Number.isFinite(sourceMaterial?.metalness)
        ? sourceMaterial.metalness
        : 0,
      metalnessMap: sourceMaterial?.metalnessMap ?? null,
      normalMap: sourceMaterial?.normalMap ?? null,
      normalScale: sourceMaterial?.normalScale ?? new THREE.Vector2(1, 1),
      roughness: Number.isFinite(sourceMaterial?.roughness)
        ? sourceMaterial.roughness
        : 0.5,
      roughnessMap: sourceMaterial?.roughnessMap ?? null,
    },
    library,
    sourceActorIdentity,
    sourceAssetName,
    sourceSceneVariant: 'call-me-sensei-imported-solid-prop',
    state: state ?? createToonLabSourceEnvironmentState(library),
  });
  material.name = `CallMeSensei::${sourceAssetName}::${profileName}`;
  // Fab/Sketchfab GLBs commonly author foliage-like thin pieces, slats, and
  // lamp housings as double-sided. M_StylizedBasic's native beach fixtures
  // remain front-sided, while the imported adapter preserves the GLB's
  // explicit surface contract.
  material.side = sourceMaterial?.side ?? THREE.FrontSide;
  material.userData.toonLabSource.reconstruction =
    'imported-pbr-input-through-M_StylizedBasic';
  material.userData.toonLabSource.contract.inputAuthority = {
    baseColor: sourceMaterial?.map
      ? 'GLB pbrMetallicRoughness.baseColorTexture * baseColorFactor'
      : 'GLB pbrMetallicRoughness.baseColorFactor',
    emission: sourceMaterial?.emissiveMap
      ? 'GLB emissiveTexture * emissiveFactor * KHR_materials_emissive_strength'
      : 'GLB emissiveFactor * KHR_materials_emissive_strength',
    metallic: sourceMaterial?.metalnessMap
      ? 'GLB metallicRoughnessTexture.b * metallicFactor'
      : 'GLB pbrMetallicRoughness.metallicFactor',
    normal: sourceMaterial?.normalMap
      ? 'GLB normalTexture with authored normalScale'
      : 'authored geometry normal',
    roughness: sourceMaterial?.roughnessMap
      ? 'GLB metallicRoughnessTexture.g * roughnessFactor'
      : 'GLB pbrMetallicRoughness.roughnessFactor',
    sidedness: material.side === THREE.DoubleSide
      ? 'GLB doubleSided'
      : 'GLB front-sided',
    texture: sourceMaterial?.map
      || sourceMaterial?.metalnessMap
      || sourceMaterial?.roughnessMap
      || sourceMaterial?.normalMap
      || sourceMaterial?.emissiveMap
      ? 'embedded GLB PBR maps decoded by GLTFLoader with authored color spaces'
      : 'none authored in supplied GLB',
  };
  return material;
}

async function buildToonLabRock(profile, context) {
  if (!toonRockMaterialIndexPromise) {
    toonRockMaterialIndexPromise = loadToonLabRockMaterialIndex()
      .catch((error) => {
        toonRockMaterialIndexPromise = null;
        throw error;
      });
  }
  const index = await toonRockMaterialIndexPromise;
  const resolution = resolveToonLabRockMaterial(profile, {
    allowFallback: true,
    index,
    sourceAssetName: context.sourceAssetName,
  });
  if (!resolution?.materialRecord) {
    throw new Error(`No ToonLab S_Rock profile matches ${profile.path}.`);
  }
  const material = await loadToonRockMaterial({
    manifest: index.manifest,
    material: resolution.materialRecord,
    coordinates: {
      zSign: 1,
      // Both the ToonLab material parameters and the glTF/Three scene are in
      // metres. These values are intentionally not converted from ToonLab units:
      // ToonLab's authored 500/15000/20000 distance thresholds must remain
      // 500/15000/20000 world metres.
      distanceScale: 1,
    },
  });
  finalizeMaterial(material, profile, 'rock');
  Object.assign(material.userData.toonLabSource, {
    reconstruction: 'toonlab-s-rock',
    toonLabMaterial: resolution.toonLabMaterialName,
    toonLabProfileId: resolution.profileId,
    toonLabMatchKind: resolution.matchKind,
    toonLabExactProfile: resolution.isExact,
    sourceDistanceScale: 1,
  });
  return recordSourceContract(material, {
    alpha: 'opaque',
    baseColor: 'ToonLab S_Rock ToonLab graph',
    distance: 'radial world distance; ToonLab metres preserved 1:1',
    layers: 'Grass -> Snow -> Sand sequential SG_SubLayer chain',
    lighting: 'TOONLAB Lit metallic-workflow adapter',
    normal: 'ToonLabGraph triplanar + distance flatten + NormalBlend',
    sourceEngine: 'ToonLab reference renderer',
    sourceMaterial: resolution.toonLabMaterialName,
    sourceProfileExact: resolution.isExact,
  });
}

async function buildToonLabMountain(profile, context) {
  if (!toonRockMaterialIndexPromise) {
    toonRockMaterialIndexPromise = loadToonLabRockMaterialIndex()
      .catch((error) => {
        toonRockMaterialIndexPromise = null;
        throw error;
      });
  }
  const index = await toonRockMaterialIndexPromise;
  const resolution = resolveToonLabRockMaterial(profile, {
    allowFallback: true,
    index,
    sourceAssetName: context.sourceAssetName,
  });
  if (!resolution?.materialRecord) {
    throw new Error(`No ToonLab S_Mountain profile matches ${profile.path}.`);
  }
  const material = await loadToonLabMountainMaterial({
    manifest: index.manifest,
    material: resolution.materialRecord,
    coordinates: {
      zSign: 1,
      // This showcase geometry came through ToonLab's glTF exporter. Its UV V is
      // the inverse of the supplied ToonLab FBX, which matters only where the
      // graph treats UV.y as scalar height rather than as texture coordinates.
      flipProceduralUvY: true,
    },
  });
  finalizeMaterial(material, profile, 'mountain');
  Object.assign(material.userData.toonLabSource, {
    reconstruction: 'toonlab-s-mountain',
    toonLabMaterial: resolution.toonLabMaterialName,
    toonLabProfileId: resolution.profileId,
    toonLabMatchKind: resolution.matchKind,
    toonLabExactProfile: resolution.isExact,
  });
  return recordSourceContract(material, {
    baseColor: 'ToonLab S_Mountain ToonLab graph',
    grass: 'world-XZ sample + geometry slope + procedural UV0 height fade',
    lighting: 'TOONLAB Lit metallic-workflow adapter',
    normal: 'authored geometry normal (S_Mountain has no connected normal map)',
    snow: 'world-XZ sample + reversed UV0 height gradient + noise threshold',
    sourceEngine: 'ToonLab reference renderer',
    sourceMaterial: resolution.toonLabMaterialName,
    sourceProfileExact: resolution.isExact,
  });
}

async function buildToonLabPineLeaves(profile, context) {
  const result = await buildToonLabPineLeavesMaterial(profile, context);
  finalizeMaterial(result.material, profile, 'leaves');
  Object.assign(result.material.userData.toonLabSource, {
    reconstruction: result.reconstruction,
    toonLabExactProfile: true,
    toonLabSourceGraph: result.sourceGraph,
    toonLabSourceMaterial: result.sourceMaterial,
  });
  return recordSourceContract(result.material, result.contract);
}

async function buildToonLabPineBark(profile, context) {
  const result = await buildToonLabPineBarkMaterial(profile, context);
  finalizeMaterial(result.material, profile, 'bark');
  Object.assign(result.material.userData.toonLabSource, {
    reconstruction: result.reconstruction,
    toonLabExactProfile: true,
    toonLabSourceGraph: result.sourceGraph,
    toonLabSourceMaterial: result.sourceMaterial,
  });
  return recordSourceContract(result.material, result.contract);
}

async function buildTemplate(profile, context) {
  if (isStylizedBasicProfile(profile)) {
    return buildStylizedBasic(profile, context);
  }
  switch (profile.family) {
    case 'rock':
      // ToonLab is the portable shader authority for the rock family. Resolve
      // the exact MV_* counterpart of every imported MI_* slot and execute the
      // supplied S_Rock graph/property chain. The literal ToonLab reconstruction
      // remains available in Rock Lab for forensic A/B checks, but is not the
      // production showcase binding.
      return buildToonLabRock(profile, context);
    case 'mountain':
      return buildToonLabMountain(profile, context);
    case 'leaves':
      return isToonLabPineLeavesProfile(profile)
        && context.sourceAssetName !== TOONLAB_SHOWCASE_SOURCE_ASSET
        ? buildToonLabPineLeaves(profile, context)
        : buildLeaves(profile, context);
    case 'foliage': return buildFoliage(profile, context);
    case 'bark':
      return isToonLabPineBarkProfile(profile)
        && context.sourceAssetName !== TOONLAB_SHOWCASE_SOURCE_ASSET
        ? buildToonLabPineBark(profile, context)
        : buildBark(profile, context);
    case 'treeLod': return buildTreeLod(profile, context);
    case 'landscape': return buildToonLabLandscapeMaterial(profile, context);
    case 'snow': return buildSnow(profile, context);
    case 'water':
    case 'waterLegacy': return buildWater(profile, context);
    case 'sky': return buildSky(profile, context);
    case 'clouds': return buildClouds(profile, context);
    default: return buildFallback(profile, context);
  }
}

/**
 * Builds one uncached material from an already-resolved source profile.
 *
 * Shader-profile adapters use this path when editor settings deliberately
 * create a new parameterized profile with the same source material path.
 * The ordinary `createToonLabSourceMaterial()` cache is path-based and is
 * therefore correct for immutable source profiles but not for live authoring.
 */
export async function createToonLabSourceMaterialFromProfile(profileReference, {
  hasUv2 = false,
  hasVertexColors = false,
  library,
  sourceActorIdentity = null,
  sourceAssetName = null,
  sourceSceneVariant = null,
  state = null,
} = {}) {
  if (!library) {
    throw new Error('createToonLabSourceMaterialFromProfile requires a source library.');
  }
  const resolved = library.resolveMaterial(profileReference);
  if (!resolved) {
    throw new Error(`Unknown ToonLab material profile: ${profileReference}`);
  }
  const profile = sourceSceneProfile(
    resolved,
    sourceAssetName,
    sourceSceneVariant,
  );
  const environmentState = state ?? createToonLabSourceEnvironmentState(library);
  const material = await buildTemplate(profile, {
    hasUv2,
    hasVertexColors,
    library,
    sourceActorIdentity,
    sourceAssetName,
    sourceSceneVariant,
    state: environmentState,
  });
  return rehydrateToonLabSourceMaterialLighting(material);
}

export async function createToonLabSourceMaterial(profileReference, {
  hasUv2 = false,
  hasVertexColors = false,
  library,
  sourceActorIdentity = null,
  sourceAssetName = null,
  sourceSceneVariant = null,
  state = null,
} = {}) {
  if (!library) throw new Error('createToonLabSourceMaterial requires a source library.');
  const profile = sourceSceneProfile(
    library.resolveMaterial(profileReference),
    sourceAssetName,
    sourceSceneVariant,
  );
  if (!profile) throw new Error(`Unknown ToonLab material profile: ${profileReference}`);
  const environmentState = state ?? createToonLabSourceEnvironmentState(library);
  if (!templateCaches.has(library)) templateCaches.set(library, new Map());
  const cache = templateCaches.get(library);
  const sourceActorIdentityKey = sourceActorIdentity
    ? [
        ...(sourceActorIdentity.locationCm ?? [0, 0, 0]),
        Number(sourceActorIdentity.perInstanceRandom) || 0,
      ].join(',')
    : '';
  const key = `${profile.path}|uv2:${hasUv2 ? 1 : 0}|vc:${hasVertexColors ? 1 : 0}`
    + `|asset:${sourceAssetName ?? ''}|variant:${sourceSceneVariant ?? ''}`
    + `|actor:${sourceActorIdentityKey}`;
  if (!cache.has(key)) {
    cache.set(key, buildTemplate(profile, {
      hasUv2,
      hasVertexColors,
      library,
      sourceActorIdentity,
      sourceAssetName,
      sourceSceneVariant,
      state: environmentState,
    }).catch((error) => {
      cache.delete(key);
      throw error;
    }));
  }
  const template = await cache.get(key);
  const material = template.clone();
  material.name = template.name;
  material.userData = JSON.parse(JSON.stringify(template.userData ?? {}));
  copySurfaceMaterialModes(template, material);
  return rehydrateToonLabSourceMaterialLighting(material);
}

export async function applyToonLabSourceMaterials(root, {
  library,
  sourceActorIdentity = null,
  sourceAssetName,
  sourceSceneVariant = null,
  state = null,
} = {}) {
  if (!library) throw new Error('applyToonLabSourceMaterials requires a source library.');
  if (!sourceAssetName) throw new Error('applyToonLabSourceMaterials requires sourceAssetName.');
  const environmentState = state ?? createToonLabSourceEnvironmentState(library);
  const jobs = [];
  const unresolved = [];
  let materialCount = 0;
  let meshCount = 0;
  root.traverse((object) => {
    if (!object.isMesh || !object.material) return;
    meshCount += 1;
    if (!object.geometry.attributes.normal) object.geometry.computeVertexNormals();
    const originals = Array.isArray(object.material) ? object.material : [object.material];
    const replacements = new Array(originals.length);
    const shadowSlots = new Array(originals.length).fill(true);
    const materialJobs = originals.map((original, materialIndex) => {
      const resolved = library.resolveMeshSlot(
        sourceAssetName,
        original?.name,
        materialIndex,
      );
      if (!resolved?.profile) {
        unresolved.push({
          material: original?.name ?? '',
          materialIndex,
          object: object.name ?? '',
        });
        replacements[materialIndex] = original;
        return Promise.resolve();
      }
      materialCount += 1;
      shadowSlots[materialIndex] = sourceProfileCastsShadow(resolved.profile);
      return createToonLabSourceMaterial(resolved.profile, {
        hasUv2: Boolean(object.geometry.attributes.uv2),
        hasVertexColors: Boolean(object.geometry.attributes.color),
        library,
        sourceActorIdentity,
        sourceAssetName,
        sourceSceneVariant,
        state: environmentState,
      }).then((material) => {
        replacements[materialIndex] = material;
      });
    });
    jobs.push(Promise.all(materialJobs).then(() => {
      object.material = Array.isArray(object.material) ? replacements : replacements[0];
      object.castShadow = shadowSlots.some(Boolean);
      object.receiveShadow = true;
      object.userData.toonLabSourceAsset = sourceAssetName;
    }));
  });
  await Promise.all(jobs);
  return {
    materialCount,
    meshCount,
    sourceAssetName,
    state: environmentState,
    unresolved,
  };
}

export async function applyToonLabNamedSourceMaterials(root, {
  library,
  sourceActorIdentity = null,
  sourceAssetName = 'authored-scene',
  sourceSceneVariant = null,
  state = null,
} = {}) {
  if (!library) throw new Error('applyToonLabNamedSourceMaterials requires a source library.');
  const environmentState = state ?? createToonLabSourceEnvironmentState(library);
  const materials = new Map();
  const importedMaterials = new Set();
  const unresolved = [];
  let meshCount = 0;

  const jobs = [];
  root.traverse((object) => {
    if (!object.isMesh || !object.material) return;
    meshCount += 1;
    if (!object.geometry.attributes.normal) object.geometry.computeVertexNormals();
    const originals = Array.isArray(object.material) ? object.material : [object.material];
    originals.forEach((material) => importedMaterials.add(material));
    const shadowSlots = new Array(originals.length).fill(true);
    jobs.push(Promise.all(originals.map(async (original, materialIndex) => {
      const profile = library.resolveMaterial(original?.name);
      if (!profile) {
        unresolved.push({
          material: original?.name ?? '',
          materialIndex,
          object: object.name ?? '',
        });
        return original;
      }
      const hasVertexColors = Boolean(object.geometry.attributes.color);
      const hasUv2 = Boolean(object.geometry.attributes.uv2);
      shadowSlots[materialIndex] = sourceProfileCastsShadow(profile);
      const key = `${profile.path}|uv2:${hasUv2 ? 1 : 0}|vc:${hasVertexColors ? 1 : 0}`
        + `|variant:${sourceSceneVariant ?? ''}`
        + `|actor:${sourceActorIdentity
          ? [
              ...(sourceActorIdentity.locationCm ?? [0, 0, 0]),
              Number(sourceActorIdentity.perInstanceRandom) || 0,
            ].join(',')
          : ''}`;
      if (!materials.has(key)) {
        materials.set(key, createToonLabSourceMaterial(profile, {
          hasUv2,
          hasVertexColors,
          library,
          sourceActorIdentity,
          sourceAssetName,
          sourceSceneVariant,
          state: environmentState,
        }));
      }
      return materials.get(key);
    })).then((replacements) => {
      object.material = Array.isArray(object.material) ? replacements : replacements[0];
      object.castShadow = shadowSlots.some(Boolean);
      object.receiveShadow = true;
      object.userData.toonLabSourceAsset = sourceAssetName;
    }));
  });
  await Promise.all(jobs);
  for (const imported of importedMaterials) imported?.dispose?.();
  return {
    materialCount: materials.size,
    meshCount,
    sourceAssetName,
    state: environmentState,
    unresolved,
  };
}

function isFailedAuthoredBakeMaterial(material) {
  if (!material || material.map) return false;
  const color = material.color;
  return Boolean(
    color
    && color.r >= 0.95
    && color.g <= 0.05
    && color.b >= 0.95,
  );
}

/**
 * Repairs only the explicit magenta failure sentinels emitted by ToonLab's
 * glTF material baker. Successful per-mesh native bakes remain untouched;
 * failed slots fall back to the audited live reconstruction of the same
 * source material instance.
 */
export async function repairToonLabAuthoredBakeMaterials(root, {
  library,
  sourceAssetName = 'authored-scene',
  state = null,
} = {}) {
  if (!library) throw new Error('repairToonLabAuthoredBakeMaterials requires a source library.');
  const environmentState = state ?? createToonLabSourceEnvironmentState(library);
  const liveMaterials = new Map();
  const importedMaterials = new Set();
  const replacedMaterials = new Set();
  const unresolved = [];
  let fallbackSlotCount = 0;
  let meshCount = 0;

  const jobs = [];
  root.traverse((object) => {
    if (!object.isMesh || !object.material) return;
    meshCount += 1;
    if (!object.geometry.attributes.normal) object.geometry.computeVertexNormals();
    const originals = Array.isArray(object.material) ? object.material : [object.material];
    originals.forEach((material) => importedMaterials.add(material));
    jobs.push(Promise.all(originals.map(async (original, materialIndex) => {
      if (!isFailedAuthoredBakeMaterial(original)) return original;
      const profile = library.resolveAuthoredBakeMaterial(original?.name);
      if (!profile) {
        unresolved.push({
          material: original?.name ?? '',
          materialIndex,
          object: object.name ?? '',
        });
        return original;
      }
      const hasVertexColors = Boolean(object.geometry.attributes.color);
      const hasUv2 = Boolean(object.geometry.attributes.uv2);
      const key = `${profile.path}|uv2:${hasUv2 ? 1 : 0}|vc:${hasVertexColors ? 1 : 0}`;
      if (!liveMaterials.has(key)) {
        liveMaterials.set(key, createToonLabSourceMaterial(profile, {
          hasUv2,
          hasVertexColors,
          library,
          sourceAssetName,
          state: environmentState,
        }));
      }
      fallbackSlotCount += 1;
      replacedMaterials.add(original);
      return liveMaterials.get(key);
    })).then((replacements) => {
      object.material = Array.isArray(object.material) ? replacements : replacements[0];
      object.castShadow = true;
      object.receiveShadow = true;
      object.userData.toonLabSourceAsset = sourceAssetName;
    }));
  });
  await Promise.all(jobs);
  for (const material of replacedMaterials) {
    if (importedMaterials.has(material)) material.dispose?.();
  }
  return {
    fallbackMaterialCount: liveMaterials.size,
    fallbackSlotCount,
    meshCount,
    sourceAssetName,
    state: environmentState,
    unresolved,
  };
}

export const TOONLAB_SOURCE_MATERIAL_BASE_URL =
  DEFAULT_TOONLAB_SOURCE_BASE_URL;
