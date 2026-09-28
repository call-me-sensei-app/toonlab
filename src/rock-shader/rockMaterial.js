// Canonical rock and mountain material runtime, reconstructed from ToonLab's
// S_Rock and S_Mountain graphs. This module belongs to the reusable rock
// shader domain; procedural rock generation consumes it through the public
// rock-shader contract but does not own it.
//
// This is intentionally separate from referenceSourceMaterial.js. The ToonLab and
// ToonLab packages share art direction and source textures, but their rock graphs,
// material values, distance metrics, and PBR attribute semantics are not identical.

import {
  Color,
  ClampToEdgeWrapping,
  LinearFilter,
  LinearMipmapLinearFilter,
  LinearMipmapNearestFilter,
  MirroredRepeatWrapping,
  NearestFilter,
  NearestMipmapNearestFilter,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
} from 'three';
import { MeshPhysicalNodeMaterial } from 'three/webgpu';
import { mx_fractal_noise_float } from 'three/tsl';
import {
  TBNViewMatrix,
  abs,
  attribute,
  cameraPosition,
  cameraViewMatrix,
  clamp,
  cos,
  distance,
  dot,
  float,
  max,
  mix,
  normalWorldGeometry,
  normalize,
  positionWorld,
  pow,
  sin,
  smoothstep,
  step,
  texture,
  transformNormalByViewMatrix,
  transpose,
  uniform,
  uv,
  vec2,
  vec3,
  vertexColor,
} from 'three/tsl';
import {
  applyToonLabNormalStrengthNode as toonLabNormalStrength,
  createToonLabNormalIntegrationMetadata,
  decodeToonLabNormalNode as decodeToonLabNormal,
} from '../environment/toonLabNormalIntegration.js';
import {
  SURFACE_MATERIAL_MODE,
  registerSurfaceMaterialMode,
} from '../environment/surfaceMaterialModes.js';
import {
  sampleGroundColor,
  sampleGroundSurface,
} from '../shaders-tsl/chunks/environment-ground-field.js';
import {
  normalizeToonLabRockMaterialLibrarySchema,
} from '../environment/toonLabRockMaterialResolver.js';
import { installToonLabSurfaceLighting } from '../environment/toonLabSurfaceLighting.js';
import {
  ROCK_CAVITY_ATTRIBUTE,
  ROCK_EXPOSURE_ATTRIBUTE,
} from './rockGeometryDetail.js';

export const TOONLAB_ROCK_MANIFEST_SCHEMA = 'toonlab.rock-material-library';
export const TOONLAB_ROCK_MANIFEST_VERSION = 1;
export const TOONLAB_ROCK_SHADER_GUID = 'a6fcfd526cd108942a6a8db5ebeda498';
export const TOONLAB_MOUNTAIN_SHADER_GUID = '6e81e92635c971147869e2fa22f70601';
export const DEFAULT_TOONLAB_ROCK_LIBRARY_BASE_URL = null;

// Both source ToonLab Graphs retain ToonLab's default Position/Normal/Tangent
// vertex blocks, but none of those blocks has an incoming edge. Neither graph
// contains a Time node. Their generated vertex position is therefore the
// authored mesh position in visible, depth, motion-vector and ShadowCaster
// passes; Terrain placement must not classify rock prototypes as wind trees.
export const TOONLAB_ROCK_FAMILY_VERTEX_MOTION_CONTRACT = Object.freeze({
  [TOONLAB_ROCK_SHADER_GUID]: Object.freeze({
    mode: 'authored-static',
    sourceShader: 'ToonLab Graphs/S_Rock',
    sourceVertexPositionConnected: false,
    timeDependent: false,
  }),
  [TOONLAB_MOUNTAIN_SHADER_GUID]: Object.freeze({
    mode: 'authored-static',
    sourceShader: 'ToonLab Graphs/S_Mountain',
    sourceVertexPositionConnected: false,
    timeDependent: false,
  }),
});

const TOONLAB_CONTRAST_MIDPOINT = 0.217637640824031;
const TOONLAB_FLOAT_EPSILON = 5.960464478e-8;
const texturePromiseCache = new Map();

/**
 * Clean, engine-independent representation of the exposed S_Rock properties.
 * Distances and texture scales are ToonLab world meters. Colors are the numeric
 * shader-property values; texture color-space decoding is controlled by the
 * manifest's texture import metadata.
 *
 * `layers.*.smoothness`, `moss.specular`, `layers.worldAligned`, and the
 * serialized Sand Blend Offset are deliberately absent: those exposed ToonLab
 * properties do not reach S_Rock's connected master outputs.
 */
export const TOONLAB_ROCK_PROFILE_DEFAULTS = Object.freeze({
  id: 'toonlab-rock-default',
  sourceName: 'S_Rock graph defaults',
  sourcePath: null,
  sourceGuid: null,
  coordinates: Object.freeze({
    // Provisional ToonLab-world handedness bridge. Keep +1 while applying this
    // material to already-authored Three geometry; use -1 when the paired
    // scene conversion maps ToonLab (x,y,z) to Three (x,y,-z).
    zSign: 1,
    // Multiplies authored world-distance thresholds without changing any
    // triplanar texture scale. ToonLab-authored values and the glTF/Three scene
    // are both expressed in metres, including ToonLab exports whose centimetres
    // were converted by the glTF exporter, so the parity value is 1.
    distanceScale: 1,
  }),
  base: Object.freeze({
    mode: 'triplanar',
    upAxis: 'y',
    scale: 1,
    tint: Object.freeze([1, 1, 1]),
    saturation: 1,
    contrast: 1,
    brightness: 0,
    nearDetailScale: 1.4,
    nearDetailStrength: 0.24,
    nearDetailDistance: 55,
    projectionContrast: 0.5,
    sideOnly: false,
    closeTintDistance: 500,
    farTintDistance: 15000,
    distantTint: Object.freeze([0.7882353663, 0.7882353663, 0.7882353663]),
    distantTintMix: 0.5,
    metallic: 0,
    smoothness: 0,
    useSmoothnessTexture: false,
    smoothnessContrast: 1,
    emissiveStrength: 0.3,
    striping: Object.freeze({
      enabled: false,
      scale: 2500,
      contrast: 0.25,
      color: Object.freeze([1, 0, 1]),
    }),
  }),
  lighting: Object.freeze({
    exposure: 1,
    ambientFloor: 0.04,
    skyColorInfluence: 0.35,
    skyFillStrength: 1,
    skyFillTint: Object.freeze([1, 1, 1]),
    shadowFill: 0,
    shadowFillTint: Object.freeze([1, 1, 1]),
  }),
  shoreline: Object.freeze({
    wetBandWidth: 0.8,
    wetBandDarkening: 0.22,
    wetRoughness: 0.26,
  }),
  normals: Object.freeze({
    distance: 20000,
    nearFlatten: 0,
    farFlatten: 1,
    useSmoothed: false,
    // ToonLab's texture import flipGreenChannel is false for the supplied maps.
    // Set to -1 only when a resolver supplies a green-flipped normal texture.
    normalGreenSign: 1,
  }),
  moss: Object.freeze({
    enabled: false,
    size: 1200,
    sharpness: 1,
    offset: 0.3,
    multiply: 2,
    colorPower: 1.3,
    lowColor: Object.freeze([0.2156862915, 0.3254902065, 0.1019607931]),
    highColor: Object.freeze([0.3333333433, 0.4078431726, 0.2470588386]),
    // --- moss as a material rather than a tint -------------------------
    // All three default to "off" so the shipped look is unchanged: a moss
    // that only mixes color is exactly the previous behaviour.
    //
    // Moss is a matte cushion; stone is not. Leaving roughness alone is why
    // moss reads as a stain *under* the stone's own specular rather than as
    // a plant sitting on it. -1 disables the response.
    roughness: -1,
    // A moss cushion buries the relief it grows over. Flattening the rock's
    // detail normal under the mask is what makes it sit ON the surface;
    // without it the stone's crevices show straight through the moss.
    relief: 0,
    // Break-up of the coverage boundary. The mask is a smooth power curve,
    // so its edge is an airbrushed gradient — the single strongest reason
    // moss reads as paint. A high-frequency sample pushed through the
    // threshold gives the ragged fringe real moss has.
    fringe: 0,
    fringeScale: 0.35,
    // 0..1 blend of the coverage source from the moss albedo's luminance
    // toward a constant, handing patch shape to the geometric moisture field.
    formDriven: 0,
    coverage: -1,
    band: 0.18,
    patchScale: 0.6,
    patchStrength: 0.8,
    patchOctaves: 3,
    patchContrast: 1.6,
    // --- value, form and depth (D19-210 … D19-213) ---------------------
    // Inert defaults: -1 and 0 reproduce the shipped render byte for byte.
    // Remap of the moss map's own luminance range onto the colour ramp. The
    // shipped path uses the raw rgb sample, and the shipped moss albedo lives
    // in a linear luminance band of 0.092-0.279, so the ramp coordinate never
    // clears ~0.09 and `highColor` is unreachable.
    patternFloor: -1,
    patternCeiling: 1,
    // Darkens stone across the wet field, so moss and stone meet at a close
    // value the way they do in life instead of green-on-white.
    damp: 0,
    // Convex, weather-exposed form suppressing moss. Without it the support
    // term can add moss to hollows but cannot take it off a crown.
    exposure: 0,
    // The moss cushion's own raised form, and the occlusion it casts where it
    // meets bare stone.
    cushion: 0,
    contact: 0,
  }),
  layers: Object.freeze({
    maskEnabled: true,
    sharpness: 0.8,
    offset: 0.3,
    heightStart: 0.48,
    heightEnd: 0.88,
    cavityStrength: 0,
    exposureStrength: 0,
    semanticMaskStrength: 1,
    grass: Object.freeze({
      enabled: true,
      useGroundShader: false,
      scale: 1,
      tint: Object.freeze([1, 1, 1]),
      saturation: 1,
      emission: 0,
      roughness: -1,
      metalness: -1,
    }),
    snow: Object.freeze({
      enabled: false,
      scale: 500,
      tint: Object.freeze([0, 0, 0]),
      saturation: 1,
      emission: 0,
      roughness: -1,
      metalness: -1,
    }),
    sand: Object.freeze({
      enabled: true,
      useGroundShader: false,
      scale: 500,
      tint: Object.freeze([0, 0, 0]),
      saturation: 0,
      emission: 0,
      roughness: -1,
      metalness: -1,
      normalScale: 0,
      normalStrength: 1,
      normalRotationDegrees: 30,
    }),
  }),
  textureRefs: Object.freeze({}),
});

export const TOONLAB_MOUNTAIN_PROFILE_DEFAULTS = Object.freeze({
  id: 'toonlab-mountain-default',
  sourceName: 'S_Mountain graph defaults',
  sourcePath: null,
  sourceGuid: null,
  coordinates: Object.freeze({
    zSign: 1,
    // ToonLab's FBX UVs are bottom-origin. ToonLab's glTF exporter writes the same
    // mesh UVs in glTF's top-origin convention; texture sampling compensates
    // through image conventions, but S_Mountain's procedural UV.y gradients
    // require an explicit flip for those exported meshes.
    flipProceduralUvY: false,
  }),
  textureScale: 500,
  grassSlopeMax: 0,
  grassTopFadeout: 0.6,
  grassNoiseStrength: 0.25,
  noiseSize: 1000,
  smoothness: 0,
  snowNoiseStrength: 0.5,
  snowTopAmount: 0.3,
  textureRefs: Object.freeze({}),
});

function finite(value, fallback) {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

/**
 * Numeric clamp for the JS-side normalizers.
 *
 * NOT `clamp` from `three/tsl`. That name is imported into this module for the
 * shader graph, and calling it on a plain number returns a NODE, not a number —
 * which is silently almost-correct, because a node operand is legal everywhere
 * the graph consumes these values. It is catastrophically wrong everywhere JS
 * does: `node > 0` is false, `node === 0.85` is false, `Number(node)` is NaN,
 * and `JSON.stringify(node)` is not the value.
 *
 * That is not hypothetical. `vertexCavityStrength` was clamped with the TSL
 * function and then gated with `> 0`, so the gate was permanently false and the
 * `rockCavity` attribute never reached the moss mask at all — the support term
 * that the whole patch model is built on was pure slope, which saturates. See
 * D19-214. Four profile scalars were leaking nodes the same way.
 */
function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function bool(value, fallback) {
  if (typeof value === 'boolean') return value;
  if (Number.isFinite(Number(value))) return Number(value) !== 0;
  return fallback;
}

function projectionMode(value, fallback = 'triplanar') {
  return value === 'directional-bedding' || value === 'triplanar' ? value : fallback;
}

function projectionUpAxis(value, fallback = 'y') {
  return value === 'x' || value === 'y' || value === 'z' ? value : fallback;
}

function color3(value, fallback) {
  if (Array.isArray(value)) {
    return [
      finite(value[0], fallback[0]),
      finite(value[1], fallback[1]),
      finite(value[2], fallback[2]),
    ];
  }
  if (value && typeof value === 'object') {
    return [
      finite(value.r ?? value.x, fallback[0]),
      finite(value.g ?? value.y, fallback[1]),
      finite(value.b ?? value.z, fallback[2]),
    ];
  }
  return [...fallback];
}

function toonLabSrgbChannelToLinear(value) {
  const channel = finite(value, 0);
  return channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
}

function toonLabColorProperty(value) {
  // Every exposed S_Rock color is ColorMode.Default. ToonLab graph declares
  // those values as ToonLab material `Color` properties, so ToonLab converts the
  // serialized inspector/sRGB value to linear before placing it in the
  // material CBUFFER. TSL constants are already working-space values and need
  // that conversion explicitly; using the YAML numbers directly made moss,
  // distant tint, and layer tints substantially too bright.
  return vec3(...color3(value, [0, 0, 0]).map(toonLabSrgbChannelToLinear));
}

/**
 * Fills omitted profile fields from the serialized S_Rock graph defaults.
 * The returned object is detached from both the input and exported defaults.
 */
export function normalizeToonLabRockProfile(profile = {}) {
  const defaults = TOONLAB_ROCK_PROFILE_DEFAULTS;
  const coordinates = profile.coordinates ?? {};
  const base = profile.base ?? {};
  const striping = base.striping ?? {};
  const lighting = profile.lighting ?? {};
  const shoreline = profile.shoreline ?? {};
  const normals = profile.normals ?? {};
  const moss = profile.moss ?? {};
  const layers = profile.layers ?? {};
  const grass = layers.grass ?? {};
  const snow = layers.snow ?? {};
  const sand = layers.sand ?? {};

  return {
    id: String(profile.id ?? defaults.id),
    sourceName: String(profile.sourceName ?? defaults.sourceName),
    sourcePath: profile.sourcePath == null ? null : String(profile.sourcePath),
    sourceGuid: profile.sourceGuid == null ? null : String(profile.sourceGuid),
    coordinates: {
      zSign: finite(coordinates.zSign, defaults.coordinates.zSign) < 0 ? -1 : 1,
      distanceScale: Math.max(
        finite(coordinates.distanceScale, defaults.coordinates.distanceScale),
        0.000001,
      ),
    },
    base: {
      mode: projectionMode(base.mode, defaults.base.mode),
      upAxis: projectionUpAxis(base.upAxis, defaults.base.upAxis),
      scale: finite(base.scale, defaults.base.scale),
      tint: color3(base.tint, defaults.base.tint),
      saturation: finite(base.saturation, defaults.base.saturation),
      contrast: finite(base.contrast, defaults.base.contrast),
      brightness: finite(base.brightness, defaults.base.brightness),
      nearDetailScale: Math.max(
        finite(base.nearDetailScale, defaults.base.nearDetailScale),
        0.0001,
      ),
      nearDetailStrength: clampNumber(
        finite(base.nearDetailStrength, defaults.base.nearDetailStrength),
        0,
        1,
      ),
      nearDetailDistance: Math.max(
        finite(base.nearDetailDistance, defaults.base.nearDetailDistance),
        0.0001,
      ),
      projectionContrast: finite(
        base.projectionContrast,
        defaults.base.projectionContrast,
      ),
      sideOnly: bool(base.sideOnly, defaults.base.sideOnly),
      closeTintDistance: finite(
        base.closeTintDistance,
        defaults.base.closeTintDistance,
      ),
      farTintDistance: finite(base.farTintDistance, defaults.base.farTintDistance),
      distantTint: color3(base.distantTint, defaults.base.distantTint),
      distantTintMix: finite(base.distantTintMix, defaults.base.distantTintMix),
      metallic: finite(base.metallic, defaults.base.metallic),
      smoothness: finite(base.smoothness, defaults.base.smoothness),
      useSmoothnessTexture: bool(
        base.useSmoothnessTexture,
        defaults.base.useSmoothnessTexture,
      ),
      smoothnessContrast: finite(
        base.smoothnessContrast,
        defaults.base.smoothnessContrast,
      ),
      emissiveStrength: finite(base.emissiveStrength, defaults.base.emissiveStrength),
      striping: {
        enabled: bool(striping.enabled, defaults.base.striping.enabled),
        scale: finite(striping.scale, defaults.base.striping.scale),
        contrast: finite(striping.contrast, defaults.base.striping.contrast),
        color: color3(striping.color, defaults.base.striping.color),
      },
    },
    lighting: {
      exposure: Math.max(finite(lighting.exposure, defaults.lighting.exposure), 0),
      ambientFloor: clampNumber(
        finite(lighting.ambientFloor, defaults.lighting.ambientFloor),
        0,
        1,
      ),
      skyColorInfluence: clampNumber(
        finite(lighting.skyColorInfluence, defaults.lighting.skyColorInfluence),
        0,
        1,
      ),
      skyFillStrength: Math.max(
        finite(lighting.skyFillStrength, defaults.lighting.skyFillStrength),
        0,
      ),
      skyFillTint: color3(lighting.skyFillTint, defaults.lighting.skyFillTint),
      shadowFill: clampNumber(
        finite(lighting.shadowFill, defaults.lighting.shadowFill),
        0,
        1,
      ),
      shadowFillTint: color3(
        lighting.shadowFillTint,
        defaults.lighting.shadowFillTint,
      ),
    },
    shoreline: {
      // Spread first, coerce after — the same shape the moss group uses. The
      // entries below still clamp every field that has a meaningful range; the
      // spread only ensures a field added to the schema later reaches the
      // shader instead of being dropped silently between validation and use.
      ...shoreline,
      wetBandWidth: Math.max(
        finite(shoreline.wetBandWidth, defaults.shoreline.wetBandWidth),
        0,
      ),
      wetBandDarkening: clampNumber(
        finite(shoreline.wetBandDarkening, defaults.shoreline.wetBandDarkening),
        0,
        1,
      ),
      wetRoughness: clampNumber(
        finite(shoreline.wetRoughness, defaults.shoreline.wetRoughness),
        0.02,
        1,
      ),
    },
    normals: {
      ...normals,
      distance: finite(normals.distance, defaults.normals.distance),
      // Do not clamp: shipped Classic Rocks deliberately uses -0.1, producing
      // Normal Strength 1.1 in the source graph.
      nearFlatten: finite(normals.nearFlatten, defaults.normals.nearFlatten),
      farFlatten: finite(normals.farFlatten, defaults.normals.farFlatten),
      useSmoothed: bool(normals.useSmoothed, defaults.normals.useSmoothed),
      normalGreenSign: finite(normals.normalGreenSign, defaults.normals.normalGreenSign),
    },
    moss: {
      // Spread first so a field the settings schema gained still reaches the
      // shader; the explicit entries below then coerce and default the ones
      // the graph reads directly. See the note in `rockShaderSettingsToProfile`.
      ...moss,
      enabled: bool(moss.enabled, defaults.moss.enabled),
      size: finite(moss.size, defaults.moss.size),
      sharpness: finite(moss.sharpness, defaults.moss.sharpness),
      offset: finite(moss.offset, defaults.moss.offset),
      multiply: finite(moss.multiply, defaults.moss.multiply),
      colorPower: finite(moss.colorPower, defaults.moss.colorPower),
      lowColor: color3(moss.lowColor, defaults.moss.lowColor),
      highColor: color3(moss.highColor, defaults.moss.highColor),
      roughness: finite(moss.roughness, defaults.moss.roughness),
      relief: finite(moss.relief, defaults.moss.relief),
      fringe: finite(moss.fringe, defaults.moss.fringe),
      fringeScale: finite(moss.fringeScale, defaults.moss.fringeScale),
      formDriven: finite(moss.formDriven, defaults.moss.formDriven),
      coverage: finite(moss.coverage, defaults.moss.coverage),
      band: finite(moss.band, defaults.moss.band),
      patchScale: finite(moss.patchScale, defaults.moss.patchScale),
      patchStrength: finite(moss.patchStrength, defaults.moss.patchStrength),
      patchOctaves: finite(moss.patchOctaves, defaults.moss.patchOctaves),
      patchContrast: finite(moss.patchContrast, defaults.moss.patchContrast),
      patternFloor: finite(moss.patternFloor, defaults.moss.patternFloor),
      patternCeiling: finite(moss.patternCeiling, defaults.moss.patternCeiling),
      damp: finite(moss.damp, defaults.moss.damp),
      exposure: finite(moss.exposure, defaults.moss.exposure),
      cushion: finite(moss.cushion, defaults.moss.cushion),
      contact: finite(moss.contact, defaults.moss.contact),
    },
    layers: {
      maskEnabled: bool(layers.maskEnabled, defaults.layers.maskEnabled),
      sharpness: finite(layers.sharpness, defaults.layers.sharpness),
      offset: finite(layers.offset, defaults.layers.offset),
      heightStart: finite(layers.heightStart, defaults.layers.heightStart),
      heightEnd: finite(layers.heightEnd, defaults.layers.heightEnd),
      cavityStrength: finite(layers.cavityStrength, defaults.layers.cavityStrength),
      exposureStrength: finite(layers.exposureStrength, defaults.layers.exposureStrength),
      semanticMaskStrength: clampNumber(
        finite(layers.semanticMaskStrength, defaults.layers.semanticMaskStrength),
        0,
        1,
      ),
      grass: {
        ...grass,
        enabled: bool(grass.enabled, defaults.layers.grass.enabled),
        useGroundShader: bool(
          grass.useGroundShader,
          defaults.layers.grass.useGroundShader,
        ),
        scale: finite(grass.scale, defaults.layers.grass.scale),
        tint: color3(grass.tint, defaults.layers.grass.tint),
        saturation: finite(grass.saturation, defaults.layers.grass.saturation),
        emission: finite(grass.emission, defaults.layers.grass.emission),
        roughness: finite(grass.roughness, defaults.layers.grass.roughness),
        metalness: finite(grass.metalness, defaults.layers.grass.metalness),
      },
      snow: {
        ...snow,
        enabled: bool(snow.enabled, defaults.layers.snow.enabled),
        scale: finite(snow.scale, defaults.layers.snow.scale),
        tint: color3(snow.tint, defaults.layers.snow.tint),
        saturation: finite(snow.saturation, defaults.layers.snow.saturation),
        emission: finite(snow.emission, defaults.layers.snow.emission),
        roughness: finite(snow.roughness, defaults.layers.snow.roughness),
        metalness: finite(snow.metalness, defaults.layers.snow.metalness),
      },
      sand: {
        ...sand,
        enabled: bool(sand.enabled, defaults.layers.sand.enabled),
        useGroundShader: bool(
          sand.useGroundShader,
          defaults.layers.sand.useGroundShader,
        ),
        scale: finite(sand.scale, defaults.layers.sand.scale),
        tint: color3(sand.tint, defaults.layers.sand.tint),
        saturation: finite(sand.saturation, defaults.layers.sand.saturation),
        emission: finite(sand.emission, defaults.layers.sand.emission),
        roughness: finite(sand.roughness, defaults.layers.sand.roughness),
        metalness: finite(sand.metalness, defaults.layers.sand.metalness),
        normalScale: finite(sand.normalScale, defaults.layers.sand.normalScale),
        normalStrength: finite(sand.normalStrength, defaults.layers.sand.normalStrength),
        normalRotationDegrees: finite(
          sand.normalRotationDegrees,
          defaults.layers.sand.normalRotationDegrees,
        ),
      },
    },
    textureRefs: { ...(profile.textureRefs ?? {}) },
  };
}

export function normalizeToonLabMountainProfile(profile = {}) {
  const defaults = TOONLAB_MOUNTAIN_PROFILE_DEFAULTS;
  const coordinates = profile.coordinates ?? {};
  return {
    id: String(profile.id ?? defaults.id),
    sourceName: String(profile.sourceName ?? defaults.sourceName),
    sourcePath: profile.sourcePath == null ? null : String(profile.sourcePath),
    sourceGuid: profile.sourceGuid == null ? null : String(profile.sourceGuid),
    coordinates: {
      zSign: finite(coordinates.zSign, defaults.coordinates.zSign) < 0 ? -1 : 1,
      flipProceduralUvY: bool(
        coordinates.flipProceduralUvY,
        defaults.coordinates.flipProceduralUvY,
      ),
    },
    textureScale: finite(profile.textureScale, defaults.textureScale),
    grassSlopeMax: finite(profile.grassSlopeMax, defaults.grassSlopeMax),
    grassTopFadeout: finite(
      profile.grassTopFadeout,
      defaults.grassTopFadeout,
    ),
    grassNoiseStrength: finite(
      profile.grassNoiseStrength,
      defaults.grassNoiseStrength,
    ),
    noiseSize: finite(profile.noiseSize, defaults.noiseSize),
    smoothness: finite(profile.smoothness, defaults.smoothness),
    snowNoiseStrength: finite(
      profile.snowNoiseStrength,
      defaults.snowNoiseStrength,
    ),
    snowTopAmount: finite(profile.snowTopAmount, defaults.snowTopAmount),
    textureRefs: { ...(profile.textureRefs ?? {}) },
  };
}

function resolvedNumber(resolved, key, fallback) {
  return finite(resolved?.floats?.[key] ?? resolved?.ints?.[key], fallback);
}

function resolvedBool(resolved, key, fallback) {
  const value = resolved?.floats?.[key] ?? resolved?.ints?.[key];
  return bool(value, fallback);
}

function resolvedColor(resolved, key, fallback) {
  return color3(resolved?.colors?.[key], fallback);
}

function firstTextureSlot(resolved, ...keys) {
  for (const key of keys) {
    const slot = resolved?.textures?.[key];
    if (slot && Number(slot.fileID) !== 0 && slot.guid) return slot;
  }
  return null;
}

/**
 * Converts one material entry from rock-material-library.json into the clean
 * profile contract consumed by createToonRockMaterial().
 */
export function toonLabRockProfileFromResolvedMaterial(materialEntry) {
  if (!materialEntry?.resolved) {
    throw new TypeError('A ToonLab rock material entry with resolved properties is required.');
  }
  const shaderGuid = materialEntry.shader?.guid ?? materialEntry.directShader?.guid;
  if (shaderGuid && shaderGuid !== TOONLAB_ROCK_SHADER_GUID) {
    throw new Error(
      `${materialEntry.name ?? materialEntry.assetPath ?? 'Material'} uses ${shaderGuid}, not S_Rock.`,
    );
  }

  const d = TOONLAB_ROCK_PROFILE_DEFAULTS;
  const r = materialEntry.resolved;
  return normalizeToonLabRockProfile({
    id: materialEntry.guid ?? materialEntry.assetPath ?? materialEntry.name,
    sourceName: materialEntry.name,
    sourcePath: materialEntry.assetPath,
    sourceGuid: materialEntry.guid,
    base: {
      scale: resolvedNumber(r, '_Rock_Scale', d.base.scale),
      tint: resolvedColor(r, '_Rock_Tint', d.base.tint),
      saturation: resolvedNumber(r, '_Saturation', d.base.saturation),
      contrast: resolvedNumber(r, '_Contrast', d.base.contrast),
      brightness: resolvedNumber(r, '_Rock_Brightness', d.base.brightness),
      projectionContrast: resolvedNumber(
        r,
        '_Projection_Contrast',
        d.base.projectionContrast,
      ),
      sideOnly: resolvedBool(r, '_Side_Project_Only', d.base.sideOnly),
      closeTintDistance: resolvedNumber(
        r,
        '_Close_Tint_Blend_Distance',
        d.base.closeTintDistance,
      ),
      farTintDistance: resolvedNumber(
        r,
        '_Far_Tint_Blend_Distance',
        d.base.farTintDistance,
      ),
      distantTint: resolvedColor(r, '_Distant_Tint_Blend', d.base.distantTint),
      distantTintMix: resolvedNumber(
        r,
        '_Distant_Tint_Blend_Lerp_Alpha_Mix',
        d.base.distantTintMix,
      ),
      metallic: resolvedNumber(r, '_RockMetallic', d.base.metallic),
      smoothness: resolvedNumber(r, '_Smoothness', d.base.smoothness),
      useSmoothnessTexture: resolvedBool(
        r,
        '_Smoothness_Texture_1',
        d.base.useSmoothnessTexture,
      ),
      smoothnessContrast: resolvedNumber(
        r,
        '_Smoothness_Contrast',
        d.base.smoothnessContrast,
      ),
      emissiveStrength: resolvedNumber(
        r,
        '_Emissive_Strength',
        d.base.emissiveStrength,
      ),
      striping: {
        enabled: resolvedBool(r, '_RockStriping', d.base.striping.enabled),
        scale: resolvedNumber(r, '_Rock_Strping_Scale', d.base.striping.scale),
        contrast: resolvedNumber(
          r,
          '_Rock_Striping_Contrast',
          d.base.striping.contrast,
        ),
        color: resolvedColor(
          r,
          '_Rock_Striping_Overlay_Color',
          d.base.striping.color,
        ),
      },
    },
    normals: {
      distance: resolvedNumber(r, '_Rock_Normal_Distance', d.normals.distance),
      nearFlatten: resolvedNumber(r, '_Rock_Normal_Flatten', d.normals.nearFlatten),
      farFlatten: resolvedNumber(
        r,
        '_Distant_Rock_Normal_Flatten',
        d.normals.farFlatten,
      ),
      useSmoothed: resolvedBool(r, '_UseSmoothedNormalMap', d.normals.useSmoothed),
      normalGreenSign: d.normals.normalGreenSign,
    },
    moss: {
      // Spread the defaults first. No TOONLAB renderer property backs the
      // ToonLab-added fields — they are capability, not Unity-shader parity —
      // so they must resolve from the defaults and stay off unless a caller
      // sets them. Naming them one by one meant every new field silently
      // vanished from this path until someone remembered a fifth edit; the
      // spread makes that structurally impossible. The entries below then
      // override exactly the fields a renderer property does back.
      ...d.moss,
      enabled: resolvedBool(r, '_Moss', d.moss.enabled),
      size: resolvedNumber(r, '_Moss_Size', d.moss.size),
      sharpness: resolvedNumber(r, '_Moss_Sharpness', d.moss.sharpness),
      offset: resolvedNumber(r, '_Moss_Offset', d.moss.offset),
      multiply: resolvedNumber(r, '_Moss_Multiply', d.moss.multiply),
      colorPower: resolvedNumber(r, '_Moss_Smoothness', d.moss.colorPower),
      lowColor: resolvedColor(r, '_Moss_Color_2', d.moss.lowColor),
      highColor: resolvedColor(r, '_Moss_Color', d.moss.highColor),
    },
    layers: {
      maskEnabled: resolvedBool(r, '_MaskTopLayer', d.layers.maskEnabled),
      sharpness: resolvedNumber(
        r,
        '_TopLayer_Blend_Sharpness',
        d.layers.sharpness,
      ),
      offset: resolvedNumber(r, '_TopLayer_Blend_Offset', d.layers.offset),
      grass: {
        enabled: resolvedBool(r, '_TopGrass', d.layers.grass.enabled),
        scale: resolvedNumber(r, '_Grass_Scale', d.layers.grass.scale),
        tint: resolvedColor(r, '_Grass_Tint', d.layers.grass.tint),
        saturation: resolvedNumber(r, '_Grass_Saturation', d.layers.grass.saturation),
        emission: resolvedNumber(r, '_Grass_Emission', d.layers.grass.emission),
      },
      snow: {
        enabled: resolvedBool(r, '_TopSnow', d.layers.snow.enabled),
        scale: resolvedNumber(r, '_Snow_Scale', d.layers.snow.scale),
        tint: resolvedColor(r, '_Snow_Tint', d.layers.snow.tint),
        // S_Rock leaves the SG_SubLayer saturation input disconnected for snow.
        saturation: 1,
        emission: resolvedNumber(r, '_Snow_Emission', d.layers.snow.emission),
      },
      sand: {
        enabled: resolvedBool(r, '_TopSand', d.layers.sand.enabled),
        scale: resolvedNumber(r, '_Sand_Scale', d.layers.sand.scale),
        tint: resolvedColor(r, '_Sand_Tint', d.layers.sand.tint),
        saturation: resolvedNumber(r, '_Sand_Saturation', d.layers.sand.saturation),
        emission: resolvedNumber(r, '_Sand_Emission', d.layers.sand.emission),
        normalScale: resolvedNumber(r, '_Sand_Normal_Scale', d.layers.sand.normalScale),
        normalStrength: resolvedNumber(
          r,
          '_Sand_Normal_Strength',
          d.layers.sand.normalStrength,
        ),
        normalRotationDegrees: 30,
      },
    },
    textureRefs: {
      rock: firstTextureSlot(r, '_Rock_Texture'),
      rockNormal: firstTextureSlot(r, '_Rock_Normal_Texture'),
      stylizedNormal: firstTextureSlot(r, '_Stylized_Normal_Map'),
      smoothness: firstTextureSlot(r, '_Smoothness_Texture'),
      stripe: firstTextureSlot(r, '_Rock_Striping_Texture'),
      moss: firstTextureSlot(r, '_MossTexture'),
      // `_Base_Color` is a serialized legacy slot and is disconnected from
      // S_Rock. A null `_Top_Layer_Mask` means the ToonLab graph default white.
      topMask: firstTextureSlot(r, '_Top_Layer_Mask'),
      grass: firstTextureSlot(r, '_Grass_Texture'),
      snow: firstTextureSlot(r, '_Snow_Texture'),
      sand: firstTextureSlot(r, '_Sand_Texture'),
      sandNormal: firstTextureSlot(r, '_Sand_Normal_Texture'),
    },
  });
}

/** Converts one resolved S_Mountain material entry into its connected graph inputs. */
export function toonLabMountainProfileFromResolvedMaterial(materialEntry) {
  if (!materialEntry?.resolved) {
    throw new TypeError('A ToonLab mountain material entry with resolved properties is required.');
  }
  const shaderGuid = materialEntry.shader?.guid ?? materialEntry.directShader?.guid;
  if (shaderGuid && shaderGuid !== TOONLAB_MOUNTAIN_SHADER_GUID) {
    throw new Error(
      `${materialEntry.name ?? materialEntry.assetPath ?? 'Material'} uses ${shaderGuid}, not S_Mountain.`,
    );
  }

  const d = TOONLAB_MOUNTAIN_PROFILE_DEFAULTS;
  const r = materialEntry.resolved;
  return normalizeToonLabMountainProfile({
    id: materialEntry.guid ?? materialEntry.assetPath ?? materialEntry.name,
    sourceName: materialEntry.name,
    sourcePath: materialEntry.assetPath,
    sourceGuid: materialEntry.guid,
    textureScale: resolvedNumber(r, '_Texture_Scale', d.textureScale),
    grassSlopeMax: resolvedNumber(r, '_Grass_Slope_Max', d.grassSlopeMax),
    grassTopFadeout: resolvedNumber(
      r,
      '_Grass_Top_Fadeout',
      d.grassTopFadeout,
    ),
    grassNoiseStrength: resolvedNumber(
      r,
      '_Grass_Noise_Strength',
      d.grassNoiseStrength,
    ),
    noiseSize: resolvedNumber(r, '_Noise_Size', d.noiseSize),
    smoothness: resolvedNumber(r, '_Smoothness', d.smoothness),
    snowNoiseStrength: resolvedNumber(
      r,
      '_Snow_Noise_Strength',
      d.snowNoiseStrength,
    ),
    snowTopAmount: resolvedNumber(r, '_Snow_Top_Amount', d.snowTopAmount),
    textureRefs: {
      noise: firstTextureSlot(
        r,
        '_SampleTexture2D_4da0d8ebd864413a95e355934b01bf4b_Texture_1_Texture2D',
      ),
      rock: firstTextureSlot(
        r,
        '_SampleTexture2D_5fb9278c5b51455bb51fcf51e6afd491_Texture_1_Texture2D',
      ),
      snow: firstTextureSlot(
        r,
        '_SampleTexture2D_d8b599d9da0b48309b3bf5702f47bc6c_Texture_1_Texture2D',
      ),
      grass: firstTextureSlot(
        r,
        '_SampleTexture2D_f70ef7e3c77a4c2b97e36f9585a47570_Texture_1_Texture2D',
      ),
    },
  });
}

function safeScale(value) {
  return max(abs(float(value)), 0.000001);
}

function toonLabSourcePosition(coordinates) {
  return vec3(
    positionWorld.x,
    positionWorld.y,
    positionWorld.z.mul(coordinates.zSign),
  );
}

function toonLabSourceGeometryNormal(coordinates) {
  return vec3(
    normalWorldGeometry.x,
    normalWorldGeometry.y,
    normalWorldGeometry.z.mul(coordinates.zSign),
  );
}

// Exact ToonLab graph Saturation node coefficients.
function toonLabSaturation(input, amount) {
  const luma = dot(input, vec3(0.2126729, 0.7151522, 0.0721750));
  return vec3(luma).add(input.sub(vec3(luma)).mul(float(amount)));
}

// Exact ToonLab graph Contrast node: gamma-space midpoint, no output clamp.
function toonLabContrast(input, amount) {
  return input.sub(TOONLAB_CONTRAST_MIDPOINT)
    .mul(float(amount))
    .add(TOONLAB_CONTRAST_MIDPOINT);
}

function toonLabLinearRamp(input, low, high) {
  return clamp(
    input.sub(float(low)).div(max(float(high).sub(float(low)), 0.000001)),
    0,
    1,
  );
}

function toonLabTriplanarWeights(normalNode, blend) {
  // ToonLab graph's SafePositivePow clamps abs(base) to FLT_EPS. Its exponent
  // cap is irrelevant to the supplied 0.5-3.0 material values.
  const safeNormal = max(abs(normalNode), vec3(TOONLAB_FLOAT_EPSILON));
  const weights = pow(safeNormal, vec3(Math.max(finite(blend, 1), 0.000001)));
  return weights.div(max(weights.x.add(weights.y).add(weights.z), 0.000001));
}

export function toonLabTriplanarColor(map, scale, blend = 1, coordinates = { zSign: 1 }) {
  const mapNode = texture(map);
  const sourcePosition = toonLabSourcePosition(coordinates);
  const sourceNormal = toonLabSourceGeometryNormal(coordinates);
  const projected = sourcePosition.div(safeScale(scale));
  const weights = toonLabTriplanarWeights(sourceNormal, blend);
  return mapNode.sample(projected.zy).rgb.mul(weights.x)
    .add(mapNode.sample(projected.xz).rgb.mul(weights.y))
    .add(mapNode.sample(projected.xy).rgb.mul(weights.z));
}

const DIRECTIONAL_BEDDING_AXES = Object.freeze({
  x: Object.freeze({
    lateral: Object.freeze([
      Object.freeze({ faceAxis: 'y', uAxis: 'z', uv: 'zx' }),
      Object.freeze({ faceAxis: 'z', uAxis: 'y', uv: 'yx' }),
    ]),
    suppressedProjectionAxis: 'x',
    upAxis: 'x',
  }),
  y: Object.freeze({
    lateral: Object.freeze([
      Object.freeze({ faceAxis: 'x', uAxis: 'z', uv: 'zy' }),
      Object.freeze({ faceAxis: 'z', uAxis: 'x', uv: 'xy' }),
    ]),
    suppressedProjectionAxis: 'y',
    upAxis: 'y',
  }),
  z: Object.freeze({
    lateral: Object.freeze([
      Object.freeze({ faceAxis: 'x', uAxis: 'y', uv: 'yz' }),
      Object.freeze({ faceAxis: 'y', uAxis: 'x', uv: 'xz' }),
    ]),
    suppressedProjectionAxis: 'z',
    upAxis: 'z',
  }),
});

/**
 * Describes the compile-time directional-bedding graph. The returned data is
 * deliberately plain CPU data so authoring tools and focused verifiers can
 * prove which axis is suppressed without compiling a WebGPU pipeline.
 */
export function describeToonLabDirectionalBeddingProjection(upAxis = 'y') {
  const resolved = projectionUpAxis(upAxis, 'y');
  const descriptor = DIRECTIONAL_BEDDING_AXES[resolved];
  return {
    lateral: descriptor.lateral.map((entry) => ({ ...entry })),
    suppressedProjectionAxis: descriptor.suppressedProjectionAxis,
    upAxis: descriptor.upAxis,
  };
}

function directionalBeddingState(scale, blend, coordinates, upAxis) {
  const descriptor = DIRECTIONAL_BEDDING_AXES[projectionUpAxis(upAxis, 'y')];
  const projected = toonLabSourcePosition(coordinates).div(safeScale(scale));
  const geometryNormal = toonLabSourceGeometryNormal(coordinates);
  const exponent = float(Math.max(finite(blend, 1), 0.000001));
  const upWeight = pow(
    max(abs(geometryNormal[descriptor.upAxis]), TOONLAB_FLOAT_EPSILON),
    exponent,
  );
  const lateralWeights = descriptor.lateral.map(({ faceAxis }) => pow(
    max(abs(geometryNormal[faceAxis]), TOONLAB_FLOAT_EPSILON),
    exponent,
  ).add(upWeight.mul(0.5)));
  const denominator = max(lateralWeights[0].add(lateralWeights[1]), 0.000001);
  return {
    descriptor,
    geometryNormal,
    projected,
    weights: lateralWeights.map((weight) => weight.div(denominator)),
  };
}

export function toonLabDirectionalBeddingColor(
  map,
  scale,
  blend = 1,
  coordinates = { zSign: 1 },
  upAxis = 'y',
) {
  const mapNode = texture(map);
  const state = directionalBeddingState(scale, blend, coordinates, upAxis);
  const sample = ({ uv: swizzle }) => mapNode.sample(vec2(
    state.projected[swizzle[0]],
    state.projected[swizzle[1]],
  )).rgb;
  return sample(state.descriptor.lateral[0]).mul(state.weights[0])
    .add(sample(state.descriptor.lateral[1]).mul(state.weights[1]));
}

function toonLabSideProjection(map, scale, projectionContrast, {
  negativeScale = true,
  clampResult = true,
  coordinates = { zSign: 1 },
} = {}) {
  const denominator = negativeScale ? safeScale(scale).negate() : safeScale(scale);
  const sourcePosition = toonLabSourcePosition(coordinates);
  const sourceNormal = toonLabSourceGeometryNormal(coordinates);
  const projected = sourcePosition.div(denominator);
  const mapNode = texture(map);
  // The Contrast result is intentionally not saturated before Lerp. Values
  // above one extrapolate when Projection Contrast is high.
  const blend = toonLabContrast(abs(sourceNormal.x), projectionContrast);
  const projectedColor = mix(
    mapNode.sample(projected.xy).rgb,
    mapNode.sample(projected.zy).rgb,
    blend,
  );
  return clampResult ? clamp(projectedColor, 0, 1) : projectedColor;
}

function toonLabRockProjection(map, profile) {
  // Directional bedding has explicit precedence. `sideOnly` remains the exact
  // legacy graph for old presets, but cannot re-enable the suppressed top-axis
  // sample on a bedded C8 surface.
  return profile.base.mode === 'directional-bedding'
    ? toonLabDirectionalBeddingColor(
      map,
      profile.base.scale,
      profile.base.projectionContrast,
      profile.coordinates,
      profile.base.upAxis,
    )
    : profile.base.sideOnly
    ? toonLabSideProjection(map, profile.base.scale, profile.base.projectionContrast, {
      coordinates: profile.coordinates,
    })
    : toonLabTriplanarColor(
      map,
      profile.base.scale,
      profile.base.projectionContrast,
      profile.coordinates,
    );
}

function toonLabOverlay(base, blend, opacity) {
  const low = base.mul(blend).mul(2);
  const high = vec3(1).sub(vec3(1).sub(base).mul(vec3(1).sub(blend)).mul(2));
  const overlay = mix(low, high, step(vec3(0.5), base));
  return mix(base, overlay, opacity);
}

function normalGreenSignForTexture(map, profileSign) {
  // texture import.flipGreenChannel is applied while ToonLab builds the
  // runtime normal texture. ToonLab samples the licensed source PNG directly,
  // so reproduce that import transform before the ToonLab graph sees it.
  const importerSign = map?.userData?.toonLabImportSettings?.flipGreenChannel ? -1 : 1;
  return finite(profileSign, 1) * importerSign;
}

function safeNormalizeDirection(direction, fallback = vec3(0, 0, 1)) {
  const valid = step(float(1e-12), dot(direction, direction));
  return normalize(mix(fallback, direction, valid));
}

function worldNormalToTangent(worldNormal) {
  const viewNormal = transformNormalByViewMatrix(worldNormal, cameraViewMatrix);
  return safeNormalizeDirection(transpose(TBNViewMatrix).mul(viewNormal));
}

export function tangentNormalToView(tangentNormal) {
  return safeNormalizeDirection(TBNViewMatrix.mul(tangentNormal));
}

export function toonLabTriplanarNormal(map, scale, blend, greenSign, coordinates) {
  const projected = toonLabSourcePosition(coordinates).div(safeScale(scale));
  const geometryNormal = toonLabSourceGeometryNormal(coordinates);
  const weights = toonLabTriplanarWeights(geometryNormal, blend);
  const mapNode = texture(map);
  let normalX = decodeToonLabNormal(mapNode.sample(projected.zy).rgb, greenSign);
  let normalY = decodeToonLabNormal(mapNode.sample(projected.xz).rgb, greenSign);
  let normalZ = decodeToonLabNormal(mapNode.sample(projected.xy).rgb, greenSign);

  // ToonLab graph Triplanar's normal-texture whiteout blend, before its
  // AbsoluteWorld -> Tangent space conversion.
  normalX = vec3(normalX.xy.add(geometryNormal.zy), abs(normalX.z).mul(geometryNormal.x));
  normalY = vec3(normalY.xy.add(geometryNormal.xz), abs(normalY.z).mul(geometryNormal.y));
  normalZ = vec3(normalZ.xy.add(geometryNormal.xy), abs(normalZ.z).mul(geometryNormal.z));
  const sourceWorldNormal = normalX.zyx.mul(weights.x)
    .add(normalY.xzy.mul(weights.y))
    .add(normalZ.xyz.mul(weights.z));
  const worldNormal = vec3(
    sourceWorldNormal.x,
    sourceWorldNormal.y,
    sourceWorldNormal.z.mul(coordinates.zSign),
  );
  return worldNormalToTangent(worldNormal);
}

function directionalBeddingNormalCandidate(decoded, geometryNormal, entry, upAxis) {
  const components = {
    x: geometryNormal.x,
    y: geometryNormal.y,
    z: geometryNormal.z,
  };
  components[entry.faceAxis] = abs(decoded.z).mul(geometryNormal[entry.faceAxis]);
  components[entry.uAxis] = decoded.x.add(geometryNormal[entry.uAxis]);
  components[upAxis] = decoded.y.add(geometryNormal[upAxis]);
  return vec3(components.x, components.y, components.z);
}

export function toonLabDirectionalBeddingNormal(
  map,
  scale,
  blend,
  greenSign,
  coordinates,
  upAxis = 'y',
) {
  const state = directionalBeddingState(scale, blend, coordinates, upAxis);
  const mapNode = texture(map);
  const candidates = state.descriptor.lateral.map((entry) => {
    const decoded = decodeToonLabNormal(mapNode.sample(vec2(
      state.projected[entry.uv[0]],
      state.projected[entry.uv[1]],
    )).rgb, greenSign);
    return directionalBeddingNormalCandidate(
      decoded,
      state.geometryNormal,
      entry,
      state.descriptor.upAxis,
    );
  });
  const sourceWorldNormal = safeNormalizeDirection(
    candidates[0].mul(state.weights[0]).add(candidates[1].mul(state.weights[1])),
    state.geometryNormal,
  );
  const worldNormal = safeNormalizeDirection(vec3(
    sourceWorldNormal.x,
    sourceWorldNormal.y,
    sourceWorldNormal.z.mul(coordinates.zSign),
  ), state.geometryNormal);
  return worldNormalToTangent(worldNormal);
}

function toonLabNormalBlend(a, b) {
  // S_Rock's Normal Blend node uses BlendMode.Default, not RNM.
  return normalize(vec3(a.xy.add(b.xy), a.z.mul(b.z)));
}

function toonLabRotateDegrees(inputUv, degrees) {
  const centered = inputUv.sub(vec2(0.5));
  const angle = float(degrees * (Math.PI / 180));
  const sine = sin(angle);
  const cosine = cos(angle);
  return vec2(
    centered.x.mul(cosine).add(centered.y.mul(sine)),
    centered.x.mul(sine).negate().add(centered.y.mul(cosine)),
  ).add(vec2(0.5));
}

function toonLabSandNormal(map, layer, greenSign, coordinates) {
  // The source graph uses Absolute World XZ / -abs(scale), then a fixed
  // 30-degree rotation around (0.5, 0.5), not UV0 or triplanar sampling.
  const projected = toonLabSourcePosition(coordinates)
    .div(safeScale(layer.normalScale).negate());
  const rotatedUv = toonLabRotateDegrees(projected.xz, layer.normalRotationDegrees);
  const decoded = decodeToonLabNormal(
    texture(map).sample(rotatedUv).rgb,
    normalGreenSignForTexture(map, greenSign),
  );
  return toonLabNormalStrength(decoded, layer.normalStrength);
}

function toonLabTopMask(profile, topMaskTexture, assetIntegration) {
  const denominator = Math.max(1 - profile.layers.offset, 0.000001);
  let mask = clamp(
    normalWorldGeometry.y
      .sub(profile.layers.offset)
      .div(denominator)
      .mul(profile.layers.sharpness),
    0,
    1,
  );
  if (assetIntegration.semanticMaskAttributes) {
    const height = smoothstep(
      float(profile.layers.heightStart),
      float(Math.max(profile.layers.heightEnd, profile.layers.heightStart + 0.0001)),
      attribute('rockHeight', 'float'),
    );
    const cavity = attribute('rockCavity', 'float').mul(profile.layers.cavityStrength);
    const exposure = attribute('rockExposure', 'float').mul(profile.layers.exposureStrength);
    const form = clamp(height.mul(float(1).add(cavity)).mul(float(1).sub(exposure)), 0, 1);
    mask = mask.mul(form);
  }
  if (profile.layers.maskEnabled && topMaskTexture) {
    const authored = texture(topMaskTexture).sample(uv()).r;
    mask = mask.mul(mix(1, authored, profile.layers.semanticMaskStrength));
  }
  return clamp(mask, 0, 1);
}

function applyToonLabSubLayer(state, layer, map, mask, coordinates) {
  if (!layer.enabled) return state;
  let sampled = toonLabSaturation(
    toonLabTriplanarColor(map, layer.scale, 1, coordinates),
    layer.saturation,
  ).mul(toonLabColorProperty(layer.tint));
  // The environment ground-field pass contains the actual styled ground
  // shader color at this world XZ position. For selected grass-capped rocks,
  // use it as the top surface so the cap continues the surrounding terrain
  // instead of sampling a separate neon/noisy grass bitmap. The projected
  // texture remains a deterministic fallback before/outside the ground field.
  if (layer.useGroundShader) {
    const groundColor = sampleGroundColor(positionWorld);
    sampled = mix(sampled, groundColor.rgb, groundColor.a);
  }
  const color = mix(state.color, sampled, mask);
  // This unusual dependency is exact SG_SubLayer behavior: emission is based
  // on the already blended Out_BC and multiplied by Alpha a second time.
  const emission = state.emission.add(color.mul(layer.emission).mul(mask));
  return { color, emission };
}

function assertTexture(value, key, reason) {
  if (!value?.isTexture) {
    throw new TypeError(`ToonLab S_Rock requires textures.${key} ${reason}.`);
  }
}

function validateTextures(profile, textures) {
  assertTexture(textures.rock, 'rock', 'for the base projection');
  if (profile.base.useSmoothnessTexture) {
    assertTexture(textures.smoothness, 'smoothness', 'when useSmoothnessTexture is true');
  }
  if (profile.base.striping.enabled) {
    assertTexture(textures.stripe, 'stripe', 'when striping is enabled');
  }
  if (profile.moss.enabled) assertTexture(textures.moss, 'moss', 'when moss is enabled');
  if (profile.layers.grass.enabled) {
    assertTexture(textures.grass, 'grass', 'when the grass sublayer is enabled');
  }
  if (profile.layers.snow.enabled) {
    assertTexture(textures.snow, 'snow', 'when the snow sublayer is enabled');
  }
  if (profile.layers.sand.enabled) {
    assertTexture(textures.sand, 'sand', 'when the sand sublayer is enabled');
    if (profile.layers.sand.normalStrength > 0) {
      assertTexture(
        textures.sandNormal,
        'sandNormal',
        'when the sand sublayer normal strength is greater than zero',
      );
    }
  }
}

function textureKeysForProfile(profile, { includeInactive = false } = {}) {
  const keys = new Set(['rock']);
  if (includeInactive) {
    for (const [key, slot] of Object.entries(profile.textureRefs)) {
      if (slot) keys.add(key);
    }
    return keys;
  }
  if (profile.textureRefs.rockNormal) keys.add('rockNormal');
  if (profile.normals.useSmoothed && profile.textureRefs.stylizedNormal) {
    keys.add('stylizedNormal');
  }
  if (profile.base.useSmoothnessTexture) keys.add('smoothness');
  if (profile.base.striping.enabled) keys.add('stripe');
  if (profile.moss.enabled) keys.add('moss');
  // Alpha also suppresses smoothness without an enabled color sublayer.
  if (profile.layers.maskEnabled && profile.textureRefs.topMask) keys.add('topMask');
  if (profile.layers.grass.enabled) keys.add('grass');
  if (profile.layers.snow.enabled) keys.add('snow');
  if (profile.layers.sand.enabled) {
    keys.add('sand');
    if (profile.layers.sand.normalStrength > 0) keys.add('sandNormal');
  }
  return keys;
}

/**
 * Builds a TSL material from a normalized profile and resolved THREE.Texture
 * objects. Source alpha semantics are retained when an imported material uses
 * masking or transparency. This ports the S_Rock graph inputs; final pixels still
 * depend on matching ToonLab's deferred BRDF, SSAO, shadows, ambient probe,
 * fog, TAA, and post-processing.
 */
export function createToonRockMaterial({
  assetIntegration = null,
  profile = {},
  textures = {},
  name = null,
} = {}) {
  const resolvedProfile = normalizeToonLabRockProfile(profile);
  validateTextures(resolvedProfile, textures);
  const resolvedAssetIntegration = {
    sourceAlbedoStrength: clampNumber(
      finite(assetIntegration?.sourceAlbedoStrength, 0),
      0,
      1,
    ),
    sourceNormalStrength: clampNumber(
      finite(assetIntegration?.sourceNormalStrength, 1),
      0,
      2,
    ),
    sourceAoStrength: clampNumber(
      finite(assetIntegration?.sourceAoStrength, 1),
      0,
      2,
    ),
    // glTF material factors are already linear working-space values. Keep
    // them separate from ToonLab inspector colors, which require sRGB decode.
    sourceColor: color3(assetIntegration?.sourceColor, [1, 1, 1]),
    sourceEmissive: color3(assetIntegration?.sourceEmissive, [0, 0, 0]),
    sourceEmissiveIntensity: Math.max(0, finite(assetIntegration?.sourceEmissiveIntensity, 1)),
    sourceOpacity: clampNumber(finite(assetIntegration?.sourceOpacity, 1), 0, 1),
    sourceAlphaTest: clampNumber(finite(assetIntegration?.sourceAlphaTest, 0), 0, 1),
    sourceTransparent: Boolean(assetIntegration?.sourceTransparent),
    sourceDepthWrite: assetIntegration?.sourceDepthWrite !== false,
    sourceSide: Number.isInteger(assetIntegration?.sourceSide) ? assetIntegration.sourceSide : null,
    sourceMetalnessFactor: clampNumber(finite(assetIntegration?.sourceMetalnessFactor, 0), 0, 1),
    sourceRoughnessFactor: clampNumber(finite(assetIntegration?.sourceRoughnessFactor, 1), 0, 1),
    sourceSpecularFactor: clampNumber(finite(assetIntegration?.sourceSpecularFactor, 1), 0, 1),
    primaryNormalStrength: clampNumber(
      finite(assetIntegration?.primaryNormalStrength, 1),
      0,
      2,
    ),
    primarySpecularStrength: clampNumber(
      finite(assetIntegration?.primarySpecularStrength, 1),
      0,
      2,
    ),
    semanticMaskAttributes: Boolean(assetIntegration?.semanticMaskAttributes),
    rockRegionAttributes: Boolean(assetIntegration?.rockRegionAttributes),
    regionTintStrength: clampNumber(
      finite(assetIntegration?.regionTintStrength, 0),
      0,
      1,
    ),
    regionBaseTint: color3(assetIntegration?.regionBaseTint, [1, 1, 1]),
    regionShaftTint: color3(assetIntegration?.regionShaftTint, [1, 1, 1]),
    regionNeckTint: color3(assetIntegration?.regionNeckTint, [1, 1, 1]),
    regionCapTint: color3(assetIntegration?.regionCapTint, [1, 1, 1]),
    regionNeckOverlayStrength: clampNumber(
      finite(assetIntegration?.regionNeckOverlayStrength, 0),
      0,
      1,
    ),
    vertexAoStrength: Math.max(0, finite(assetIntegration?.vertexAoStrength, 0)),
    // Reads the `rockCavity` channel written by rockGeometryDetail. Gated the
    // same way as the other optional vertex channels: 0 means the attribute is
    // not required to exist, so meshes without geometry detail are unaffected.
    vertexCavityStrength: clampNumber(
      finite(assetIntegration?.vertexCavityStrength, 0),
      0,
      4,
    ),
    vertexColorStrength: clampNumber(
      finite(assetIntegration?.vertexColorStrength, 0),
      0,
      1,
    ),
  };

  const radialDistance = distance(cameraPosition, positionWorld);
  const authoredDistanceScale = resolvedProfile.coordinates.distanceScale;
  const topMask = toonLabTopMask(resolvedProfile, textures.topMask, resolvedAssetIntegration);
  const rockProjection = toonLabRockProjection(textures.rock, resolvedProfile);
  let colorNode = toonLabContrast(
    toonLabSaturation(rockProjection, resolvedProfile.base.saturation),
    resolvedProfile.base.contrast,
  ).add(resolvedProfile.base.brightness).mul(
    toonLabColorProperty(resolvedProfile.base.tint),
  );
  if (
    resolvedAssetIntegration.sourceAlbedoStrength > 0
    && textures.sourceRock?.isTexture
  ) {
    // Imported catalog albedo is authored in mesh UV space. Re-projecting it
    // at the package macro scale erased precisely the baked cracks and strata
    // that the controlled blend is meant to retain.
    const sourceProjection = texture(textures.sourceRock).sample(uv()).rgb.mul(
      vec3(...resolvedAssetIntegration.sourceColor),
    );
    colorNode = mix(
      colorNode,
      toonLabContrast(
        toonLabSaturation(sourceProjection, resolvedProfile.base.saturation),
        resolvedProfile.base.contrast,
      ).add(resolvedProfile.base.brightness).mul(
        toonLabColorProperty(resolvedProfile.base.tint),
      ),
      resolvedAssetIntegration.sourceAlbedoStrength,
    );
  }

  // The macro projection carries the authored silhouette-scale color breakup;
  // a second metre-scale octave preserves readable rock surface detail close
  // to the camera without changing that macro identity.
  const nearDetailProfile = {
    ...resolvedProfile,
    base: {
      ...resolvedProfile.base,
      scale: resolvedProfile.base.nearDetailScale,
    },
  };
  const nearDetailSample = toonLabRockProjection(textures.rock, nearDetailProfile);
  const nearDetailValue = dot(nearDetailSample, vec3(0.2126, 0.7152, 0.0722));
  const nearDetailFade = clamp(
    radialDistance.div(resolvedProfile.base.nearDetailDistance),
    0,
    1,
  ).oneMinus().mul(resolvedProfile.base.nearDetailStrength);
  colorNode = colorNode.mul(mix(
    1,
    mix(0.78, 1.22, nearDetailValue),
    nearDetailFade,
  ));

  const distantAmount = toonLabLinearRamp(
    radialDistance,
    resolvedProfile.base.closeTintDistance * authoredDistanceScale,
    resolvedProfile.base.farTintDistance * authoredDistanceScale,
  );
  colorNode = mix(
    colorNode,
    mix(
      colorNode,
      toonLabColorProperty(resolvedProfile.base.distantTint),
      resolvedProfile.base.distantTintMix,
    ),
    distantAmount,
  );

  if (resolvedProfile.base.striping.enabled) {
    const stripeProjected = resolvedProfile.base.mode === 'directional-bedding'
      ? toonLabDirectionalBeddingColor(
        textures.stripe,
        resolvedProfile.base.striping.scale,
        resolvedProfile.base.projectionContrast,
        resolvedProfile.coordinates,
        resolvedProfile.base.upAxis,
      )
      : toonLabSideProjection(
        textures.stripe,
        resolvedProfile.base.striping.scale,
        resolvedProfile.base.projectionContrast,
        {
          negativeScale: false,
          clampResult: false,
          coordinates: resolvedProfile.coordinates,
        },
      );
    const stripeOpacity = clamp(
      toonLabContrast(stripeProjected.r, resolvedProfile.base.striping.contrast),
      0,
      1,
    );
    colorNode = toonLabOverlay(
      colorNode,
      toonLabColorProperty(resolvedProfile.base.striping.color),
      stripeOpacity,
    );
  }

  if (
    resolvedAssetIntegration.rockRegionAttributes
    && resolvedAssetIntegration.regionTintStrength > 0
  ) {
    const regions = attribute('_tl_rock_region', 'vec4');
    const primaryTint = vec3(...resolvedAssetIntegration.regionBaseTint).mul(regions.x)
      .add(vec3(...resolvedAssetIntegration.regionShaftTint).mul(regions.y))
      .add(vec3(...resolvedAssetIntegration.regionCapTint).mul(regions.w));
    const neckBlend = regions.z.mul(resolvedAssetIntegration.regionNeckOverlayStrength);
    const geologicalTint = mix(
      primaryTint,
      vec3(...resolvedAssetIntegration.regionNeckTint),
      neckBlend,
    );
    colorNode = colorNode.mul(mix(
      vec3(1),
      geologicalTint,
      resolvedAssetIntegration.regionTintStrength,
    ));
  }

  // Hoisted so the roughness and normal stages downstream can read the same
  // coverage the color stage used. Moss that only tints is moss that cannot
  // sit on the stone.
  let mossMaskNode = null;
  let mossDampNode = null;
  let mossCushionNode = null;
  if (resolvedProfile.moss.enabled) {
    const mossSample = toonLabTriplanarColor(
      textures.moss,
      resolvedProfile.moss.size,
      1,
      resolvedProfile.coordinates,
    );
    const mossLuminance = dot(max(mossSample, vec3(0)), vec3(0.2126, 0.7152, 0.0722));
    // --- colour ramp ----------------------------------------------------
    //
    // The shipped path feeds the raw rgb sample straight into the palette
    // `mix()`. That silently assumes the moss map's channels span 0..1, and the
    // shipped map does not come close: its linear luminance occupies
    // 0.092-0.279 with 99.3% of texels inside one decile, and its channel means
    // are r 0.079 / g 0.147 / b 0.041. Two things follow, and together they are
    // most of why moss rendered as near-black-green camouflage on near-white
    // stone (D19-210):
    //
    //   * the ramp coordinate never clears ~0.09, so moss resolves to
    //     `lowColor` — the darkest working stop — essentially everywhere, and
    //     `highColor` and the whole upper half of the authored palette are
    //     unreachable. Five carefully chosen stops collapse to one flat dark
    //     green with no internal variation for the eye to read as texture.
    //   * the coordinate is a vec3, so each palette channel is driven by the
    //     matching texture channel. The map's red is half its green, so the
    //     ramp's red end stays pinned while green rises, skewing hue on top of
    //     crushing value. The coverage mask below was already fixed for exactly
    //     this cross-channel bug; the colour stage was not.
    //
    // A floor of 0 or more switches to a scalar coordinate remapped from the
    // map's measured range, which reaches the full palette and fixes the hue
    // skew at once. -1 keeps the shipped behaviour byte for byte.
    let mossPattern;
    if (resolvedProfile.moss.patternFloor >= 0) {
      const floor = resolvedProfile.moss.patternFloor;
      const ceiling = Math.max(floor + 1e-4, resolvedProfile.moss.patternCeiling);
      mossPattern = pow(
        clamp(mossLuminance.sub(floor).div(ceiling - floor), 0, 1),
        float(resolvedProfile.moss.colorPower),
      );
    } else {
      mossPattern = pow(
        max(mossSample, vec3(0)),
        vec3(resolvedProfile.moss.colorPower),
      );
    }
    const mossColor = mix(
      toonLabColorProperty(resolvedProfile.moss.lowColor),
      toonLabColorProperty(resolvedProfile.moss.highColor),
      mossPattern,
    );
    const slope = clamp(
      normalWorldGeometry.y
        .mul(resolvedProfile.moss.sharpness)
        .sub(resolvedProfile.moss.offset),
      0,
      1,
    );
    // Coverage is scalar. Using RGB moss texels as the interpolation mask
    // cross-mixed color channels and could turn green source moss magenta.
    let mossCoverage = dot(mossSample, vec3(0.2126, 0.7152, 0.0722));
    // The shader has no coverage-mask input: it reuses the moss ALBEDO as its
    // own mask. That texture is a colour map, so its luminance is
    // high-frequency, and pushing it through the gain needed to clear its dark
    // average (D19-032) binarises the grain into pepper — isolated bright
    // texels scattered over the stone. It reads as lichen spotting, which is
    // fine for incidental weathering on a distant cliff and wrong wherever
    // moss is supposed to be a continuous cushion.
    //
    // `formDriven` blends the coverage source toward a constant, handing the
    // patch shape to the smooth geometric moisture field (slope + cavity)
    // instead. The texture then modulates a continuous cap rather than
    // defining it, and `fringe` supplies the ragged boundary. 0 is the shipped
    // behaviour. See D19-193.
    if (resolvedProfile.moss.formDriven > 0) {
      mossCoverage = mix(
        mossCoverage,
        float(1),
        float(Math.min(1, resolvedProfile.moss.formDriven)),
      );
    }
    // Moisture, not slope. Slope alone puts moss on upward faces and nowhere
    // else, which is why a slope-only mask reads as a flat tint painted onto
    // ledges. Real moss follows where water lingers and light is indirect:
    // crevices, hollows, and the shaded junctions between slabs. `rockCavity`
    // carries that concavity per vertex, so it adds moisture on vertical and
    // shaded surfaces that the slope term scores at zero — and because it is an
    // interpolated geometric field rather than a threshold on a constant, the
    // resulting boundary is irregular and follows the form.
    let moisture = resolvedAssetIntegration.vertexCavityStrength > 0
      ? clamp(
        slope.add(
          attribute(ROCK_CAVITY_ATTRIBUTE, 'float')
            .mul(resolvedAssetIntegration.vertexCavityStrength),
        ),
        0,
        1,
      )
      : slope;
    // ...and the other half of the same fact. `rockCavity` says where water
    // lingers; nothing said where it never does. Both terms above only ever
    // ADD, and `slope` saturates hard — at the garden's resolved sharpness 2.19
    // / offset -0.205 it reaches 1.0 by n.y = 0.36, which is roughly the top
    // two-thirds of a boulder. Across that whole region the support field is a
    // constant 1 and carries no information about the form at all, so the
    // colonisation noise alone decides where moss lands. Noise uncorrelated
    // with form is exactly what camouflage is, and it is why moss sat as
    // happily on an exposed sunlit crown as in a shaded hollow (D19-212).
    //
    // `rockExposure` is the rectified negative curvature from the same
    // estimator, so crowns, ridges and shoulders finally score above zero and
    // can be subtracted back out. Bare crowns are not a side effect here —
    // they are the single strongest cue that moss grew rather than was printed.
    if (
      resolvedProfile.moss.exposure > 0
      && resolvedAssetIntegration.vertexCavityStrength > 0
    ) {
      moisture = clamp(
        moisture.sub(
          attribute(ROCK_EXPOSURE_ATTRIBUTE, 'float')
            .mul(resolvedProfile.moss.exposure),
        ),
        0,
        1,
      );
    }
    let mossMask;
    if (resolvedProfile.moss.coverage >= 0) {
      // --- coverage-mask path -------------------------------------------
      //
      // The legacy expression below squares its product and clamps, which
      // makes the transition band extremely narrow: coverage crosses from 0 to
      // 1 over a sliver of the moisture range. Since moisture is dominated by
      // the upward-slope term, the result is a near-horizontal waterline with
      // uniform moss above and bare stone below — the stone reads as dip-dyed
      // to a level rather than colonised.
      //
      // Real moss is patchy: dense in hollows and on shaded faces, thinning to
      // bare crowns and exposed ridges, with an irregular broken edge and
      // detached islands. That needs a second, independent field — WHERE it
      // actually took hold — which the shader had no input for. This is it.
      //
      //   support = where moss CAN grow   (slope + rockCavity)
      //   patch   = where it DID colonise (fractal noise, world space)
      //   gate    = support gated by patch
      //   mask    = smoothstep across a WIDE band, not a squared clamp
      //
      // Noise is evaluated in world space, so two placements of the same asset
      // colonise differently without needing a per-asset uniform, and a stone
      // does not swim when the scene moves it.
      const patchNoise = mx_fractal_noise_float(
        positionWorld.div(Math.max(resolvedProfile.moss.patchScale, 0.01)),
        Math.max(1, Math.trunc(resolvedProfile.moss.patchOctaves)),
        2,
        0.5,
        1,
      );
      // fBm returns roughly [-1, 1]; remap, then push contrast so cushions
      // separate into distinct masses instead of a smooth cloud.
      const patch = clamp(
        patchNoise.mul(0.5).add(0.5).sub(0.5)
          .mul(resolvedProfile.moss.patchContrast)
          .add(0.5),
        0,
        1,
      );
      const gate = moisture.mul(
        mix(float(1), patch, float(resolvedProfile.moss.patchStrength)),
      );
      // Threshold IS the coverage dial: at coverage 1 moss takes every
      // supported surface, at 0.15 only the wettest, best-colonised pockets.
      const threshold = Math.min(0.98, Math.max(0.02,
        1 - resolvedProfile.moss.coverage));
      const band = Math.max(0.001, resolvedProfile.moss.band);
      mossMask = clamp(
        smoothstep(float(threshold - band), float(threshold + band), gate),
        0,
        1,
      );
      // Damp stone. Moss and stone read at a close value in life for a physical
      // reason: moss only grows where the stone stays wet, and wet stone is
      // markedly darker than dry stone. The shipped shader had no term for it,
      // so the only levers on the moss/stone value gap were the shared palette
      // (which belongs to the ground and the props owner too) and the scene's
      // global grade. This is the correct third lever, and it also leaves a
      // damp halo just outside each cushion — moss does not begin at a dry
      // edge. The halo comes free by taking the same gate at a threshold one
      // band-width lower, so it always tracks the moss it surrounds.
      if (resolvedProfile.moss.damp > 0) {
        mossDampNode = clamp(
          smoothstep(
            float(threshold - (band * 3)),
            float(threshold + band),
            gate,
          ),
          0,
          1,
        );
      }
      // The cushion's own form. `relief` flattens the STONE's detail normal
      // under the moss, which stops crevices showing through, but nothing ever
      // raised the moss itself — so the patch stayed geometrically identical to
      // the rock beneath it and read as a decal (D19-213). A cushion is a soft
      // raised mass, and what makes the eye read "raised" is that its shading
      // normal tilts away from the surface as the mass swells.
      //
      // The patch field is already a height field in all but name: high inside
      // a cushion, low outside. Its world-space gradient is therefore the slope
      // of the cushion's surface, and the finite differences below cost three
      // extra fBm evaluations at the same period the mask already uses, so the
      // relief lands exactly on the patches rather than as unrelated bumps.
      if (resolvedProfile.moss.cushion > 0) {
        const period = Math.max(resolvedProfile.moss.patchScale, 0.01);
        // TWO octaves, not the mask's five, and a step sized to them. The
        // cushion's shape is the MASS of the mound, which is the low-frequency
        // part of the patch field; the high octaves are the fibrous margin the
        // `fringe` term already owns. Differencing across all five aliases
        // those fine octaves and returns a noisy gradient that reads as grain
        // rather than as a swelling — which is why the first attempt at this
        // was invisible at any strength.
        const octaves = 2;
        const step = 0.14;
        const at = (dx, dy, dz) => mx_fractal_noise_float(
          positionWorld.div(period).add(vec3(dx, dy, dz)),
          octaves,
          2,
          0.5,
          1,
        );
        const centre = at(0, 0, 0);
        mossCushionNode = vec3(
          at(step, 0, 0).sub(centre),
          at(0, step, 0).sub(centre),
          at(0, 0, step).sub(centre),
        ).div(step);
      }
    } else {
      mossMask = clamp(
        pow(mossCoverage.mul(resolvedProfile.moss.multiply).mul(moisture), 2),
        0,
        1,
      );
    }
    if (resolvedProfile.moss.fringe > 0) {
      // The mask above is a smooth curve, so its boundary is an airbrushed
      // gradient — moss fading politely to nothing. Real moss ends in a ragged
      // margin that breaks into detached fragments. Pushing the mask through a
      // high-frequency field breaks the contour without moving the coverage:
      // values well inside a patch stay saturated because the perturbation is
      // weighted by `edge`, which is zero except in the transition band.
      //
      // THE SOURCE HAD TO CHANGE. This sampled the moss ALBEDO at a smaller
      // period and centred it on 0.5, which cannot work and never did: that
      // texture's linear luminance is 0.092-0.279 with 99.3% of its texels
      // inside a single decile, so the term evaluated to a near-constant -0.75
      // and the "fringe" was a uniform erosion of the boundary — the contour
      // moved inward and stayed just as smooth. The centring assumed a balanced
      // noise map and got a flat dark colour map (D19-211).
      //
      // World-space fBm at a fraction of the patch period is an actual noise
      // field: balanced about zero by construction, independent of whatever
      // albedo happens to be bound, and coherent across the triplanar seams the
      // texture sample was not.
      const fringeNoise = mx_fractal_noise_float(
        positionWorld.div(Math.max(
          resolvedProfile.moss.patchScale * resolvedProfile.moss.fringeScale,
          0.01,
        )),
        3,
        2,
        0.5,
        1,
      );
      // `edge` peaks at 1 in the middle of the transition and vanishes at both
      // ends, so the fringe chews the boundary and leaves the interior alone.
      const edge = mossMask.mul(mossMask.oneMinus()).mul(4);
      mossMask = clamp(
        mossMask.add(
          fringeNoise.mul(edge).mul(resolvedProfile.moss.fringe),
        ),
        0,
        1,
      );
    }
    mossMaskNode = mossMask;
    // Damp the STONE before the moss is mixed over it, so the darkening lands
    // on bare rock in the halo and is simply overwritten inside the patches.
    if (mossDampNode) {
      colorNode = colorNode.mul(
        float(1).sub(mossDampNode.mul(resolvedProfile.moss.damp)),
      );
    }
    colorNode = mix(colorNode, mossColor, mossMask);
    // Contact shading. A raised mass occludes the crease where it meets the
    // surface it sits on; without that line the eye has no evidence the cushion
    // has any thickness, which is the other half of why moss read as flat. The
    // `edge` weighting confines it to the margin, so cushion interiors and open
    // stone are both untouched.
    if (resolvedProfile.moss.contact > 0) {
      // Cubed, not linear. `mask·(1-mask)·4` peaks at 1 but falls off slowly,
      // and once `fringe` has chewed the boundary the mask is in transition
      // across a wide, noisy region — so a linear weight smears sooty lace over
      // half the stone instead of drawing a crease. The cube pulls it back to a
      // narrow line hugging the actual margin.
      const margin = pow(mossMask.mul(mossMask.oneMinus()).mul(4), float(3));
      colorNode = colorNode.mul(
        float(1).sub(margin.mul(resolvedProfile.moss.contact)),
      );
    }
  }

  let layerState = {
    color: colorNode,
    // The base emission multiply receives the post-moss color branch.
    emission: colorNode.mul(resolvedProfile.base.emissiveStrength),
  };
  // Exact graph order: later enabled calls paint over earlier calls.
  layerState = applyToonLabSubLayer(
    layerState,
    resolvedProfile.layers.grass,
    textures.grass,
    topMask,
    resolvedProfile.coordinates,
  );
  const sceneWaterLevel = uniform(-10000);
  const sceneSkyColor = uniform(new Color(1, 1, 1));
  const skyPeak = max(
    max(sceneSkyColor.r, sceneSkyColor.g),
    max(sceneSkyColor.b, float(0.001)),
  );
  const skyChroma = sceneSkyColor.div(skyPeak);
  const lowLightProbeBlend = float(1).sub(smoothstep(
    float(0.45),
    float(0.8),
    skyPeak,
  ));
  const readabilityTint = mix(
    vec3(1, 1, 1),
    skyChroma,
    resolvedProfile.lighting.skyColorInfluence,
  );
  const wetBandMask = clamp(
    abs(positionWorld.y.sub(sceneWaterLevel)).div(max(
      resolvedProfile.shoreline.wetBandWidth,
      0.0001,
    )),
    0,
    1,
  ).oneMinus();
  const wetColorScale = float(1).sub(
    wetBandMask.mul(resolvedProfile.shoreline.wetBandDarkening),
  );
  layerState = {
    color: layerState.color
      .mul(wetColorScale),
    emission: layerState.emission
      // A small albedo-relative floor keeps deep faces legible, but its color
      // is transient scene state. Feeding the active sky here means the same
      // sandstone is cool under a daylight sky and warm at golden hour without
      // baking either cast into its geological Base Color.
      .add(mix(
        layerState.color.mul(readabilityTint),
        vec3(dot(layerState.color, vec3(0.2126, 0.7152, 0.0722)))
          .mul(readabilityTint),
        lowLightProbeBlend.mul(0.7),
      ).mul(
        float(resolvedProfile.lighting.ambientFloor)
          .mul(lowLightProbeBlend.mul(3).add(1)),
      ))
      .mul(wetColorScale),
  };
  layerState = applyToonLabSubLayer(
    layerState,
    resolvedProfile.layers.snow,
    textures.snow,
    topMask,
    resolvedProfile.coordinates,
  );
  layerState = applyToonLabSubLayer(
    layerState,
    resolvedProfile.layers.sand,
    textures.sand,
    topMask,
    resolvedProfile.coordinates,
  );
  if (resolvedAssetIntegration.vertexColorStrength > 0) {
    const assetColor = vertexColor().rgb;
    const styledAssetColor = layerState.color.mul(assetColor);
    layerState = {
      color: mix(
        layerState.color,
        styledAssetColor,
        resolvedAssetIntegration.vertexColorStrength,
      ),
      emission: mix(
        layerState.emission,
        layerState.emission.mul(assetColor),
        resolvedAssetIntegration.vertexColorStrength,
      ),
    };
  }

  const smoothnessSource = resolvedProfile.base.useSmoothnessTexture
    ? toonLabContrast(
      clamp(toonLabRockProjection(textures.smoothness, resolvedProfile).r, 0, 1),
      resolvedProfile.base.smoothnessContrast,
    )
    : float(1);
  let rockSmoothness = smoothnessSource.mul(resolvedProfile.base.smoothness);
  if (
    resolvedAssetIntegration.sourceAlbedoStrength > 0
    && textures.sourceRoughness?.isTexture
  ) {
    // glTF metallic-roughness textures store perceptual roughness in G.
    // Blend that authored breakup into the shared rock smoothness instead of
    // retaining a texture reference that the visible shader never consumes.
    const sourceSmoothness = clamp(
      texture(textures.sourceRoughness).sample(uv()).g
        .mul(resolvedAssetIntegration.sourceRoughnessFactor),
      0,
      1,
    ).oneMinus();
    rockSmoothness = mix(
      rockSmoothness,
      sourceSmoothness,
      resolvedAssetIntegration.sourceAlbedoStrength,
    );
  }
  // The S_Rock graph applies this mask even when every top-layer toggle is off.
  const finalSmoothness = rockSmoothness.mul(topMask.oneMinus());

  const stylizedNormal = resolvedProfile.normals.useSmoothed && textures.stylizedNormal
    ? decodeToonLabNormal(
      texture(textures.stylizedNormal).sample(uv()).rgb,
      normalGreenSignForTexture(
        textures.stylizedNormal,
        resolvedProfile.normals.normalGreenSign,
      ),
    )
    : vec3(0, 0, 1);
  let combinedNormal = stylizedNormal;
  if (textures.rockNormal) {
    const crackNormal = resolvedProfile.base.mode === 'directional-bedding'
      ? toonLabDirectionalBeddingNormal(
        textures.rockNormal,
        resolvedProfile.base.scale,
        resolvedProfile.base.projectionContrast,
        normalGreenSignForTexture(
          textures.rockNormal,
          resolvedProfile.normals.normalGreenSign,
        ),
        resolvedProfile.coordinates,
        resolvedProfile.base.upAxis,
      )
      : toonLabTriplanarNormal(
        textures.rockNormal,
        resolvedProfile.base.scale,
        resolvedProfile.base.projectionContrast,
        normalGreenSignForTexture(
          textures.rockNormal,
          resolvedProfile.normals.normalGreenSign,
        ),
        resolvedProfile.coordinates,
      );
    const normalFade = clamp(
      radialDistance.div(Math.max(
        resolvedProfile.normals.distance * authoredDistanceScale,
        0.000001,
      )),
      0,
      1,
    );
    const flatness = mix(
      resolvedProfile.normals.nearFlatten,
      resolvedProfile.normals.farFlatten,
      normalFade,
    );
    combinedNormal = toonLabNormalBlend(
      stylizedNormal,
      toonLabNormalStrength(
        crackNormal,
        float(1).sub(flatness).mul(resolvedAssetIntegration.primaryNormalStrength),
      ),
    );
  }
  if (
    resolvedAssetIntegration.sourceNormalStrength > 0
    && textures.sourceNormal?.isTexture
  ) {
    const sourceNormal = decodeToonLabNormal(
      texture(textures.sourceNormal).sample(uv()).rgb,
      normalGreenSignForTexture(
        textures.sourceNormal,
        resolvedProfile.normals.normalGreenSign,
      ),
    );
    combinedNormal = toonLabNormalBlend(
      combinedNormal,
      toonLabNormalStrength(
        sourceNormal,
        resolvedAssetIntegration.sourceNormalStrength,
      ),
    );
  }

  // A moss cushion buries the relief underneath it. Flattening the rock's
  // detail normal toward the surface normal wherever moss is dense is what
  // separates "moss growing on stone" from "green painted over stone" — with
  // the stone's crevice normals still showing through, the eye reads one
  // surface with a colour on it. Applied before the top-layer blend so a
  // grass/snow layer still wins where it overlaps.
  if (mossMaskNode && resolvedProfile.moss.relief > 0) {
    combinedNormal = normalize(mix(
      combinedNormal,
      vec3(0, 0, 1),
      mossMaskNode.mul(resolvedProfile.moss.relief),
    ));
  }

  const hasTopLayer = resolvedProfile.layers.grass.enabled
    || resolvedProfile.layers.snow.enabled
    || resolvedProfile.layers.sand.enabled;
  const hasSandNormalResponse = resolvedProfile.layers.sand.enabled
    && resolvedProfile.layers.sand.normalStrength > 0
    && Boolean(textures.sandNormal);
  if (hasTopLayer) {
    const topNormal = hasSandNormalResponse
      ? toonLabSandNormal(
        textures.sandNormal,
        resolvedProfile.layers.sand,
        resolvedProfile.normals.normalGreenSign,
        resolvedProfile.coordinates,
      )
      : stylizedNormal;
    combinedNormal = normalize(mix(combinedNormal, topNormal, topMask));
  }

  const useGroundTopSurface = (
    resolvedProfile.layers.grass.enabled
    && resolvedProfile.layers.grass.useGroundShader
  ) || (
    resolvedProfile.layers.sand.enabled
    && resolvedProfile.layers.sand.useGroundShader
  );
  let metalnessNode = clamp(float(resolvedProfile.base.metallic), 0, 1);
  if (
    resolvedAssetIntegration.sourceAlbedoStrength > 0
    && textures.sourceMetalness?.isTexture
  ) {
    // glTF packs metalness in B and roughness in G.
    const sourceMetalness = clamp(
      texture(textures.sourceMetalness).sample(uv()).b
        .mul(resolvedAssetIntegration.sourceMetalnessFactor),
      0,
      1,
    );
    metalnessNode = mix(
      metalnessNode,
      sourceMetalness,
      resolvedAssetIntegration.sourceAlbedoStrength,
    );
  }
  let roughnessNode = mix(
    clamp(finalSmoothness.oneMinus(), 0, 1),
    resolvedProfile.shoreline.wetRoughness,
    wetBandMask,
  );
  // Moss is matte and stone is not. Without this the moss patch carries the
  // stone's specular response and lights like wet rock, which is most of why
  // it reads as a stain rather than a plant.
  if (mossMaskNode && resolvedProfile.moss.roughness >= 0) {
    roughnessNode = mix(
      roughnessNode,
      float(Math.min(1, Math.max(0, resolvedProfile.moss.roughness))),
      mossMaskNode,
    );
  }
  let specularIntensityNode = float(resolvedAssetIntegration.primarySpecularStrength);
  if (
    resolvedAssetIntegration.sourceAlbedoStrength > 0
    && textures.sourceSpecular?.isTexture
  ) {
    // KHR_materials_specular stores dielectric intensity in alpha.
    const sourceSpecular = clamp(
      texture(textures.sourceSpecular).sample(uv()).a
        .mul(resolvedAssetIntegration.sourceSpecularFactor),
      0,
      1,
    );
    specularIntensityNode = mix(
      specularIntensityNode,
      sourceSpecular,
      resolvedAssetIntegration.sourceAlbedoStrength,
    );
  }
  // Each replaceable top layer owns its complete surface response. Applying
  // these in the same grass -> snow -> sand order as color guarantees that a
  // sand selection cannot retain grass color, roughness, metalness, or normal.
  for (const [layer, roughnessMap] of [
    [resolvedProfile.layers.grass, textures.grassRoughness],
    [resolvedProfile.layers.snow, null],
    [resolvedProfile.layers.sand, null],
  ]) {
    if (!layer.enabled) continue;
    let layerRoughness = layer.roughness >= 0
      ? float(Math.min(1, Math.max(0, layer.roughness)))
      : roughnessNode;
    if (roughnessMap?.isTexture) {
      layerRoughness = clamp(
        toonLabTriplanarColor(
          roughnessMap,
          layer.scale,
          1,
          resolvedProfile.coordinates,
        ).r,
        0,
        1,
      );
    }
    roughnessNode = mix(roughnessNode, layerRoughness, topMask);
    if (layer.metalness >= 0) {
      metalnessNode = mix(
        metalnessNode,
        float(Math.min(1, Math.max(0, layer.metalness))),
        topMask,
      );
    }
    // Source sublayers expose no separate specular map; replacing the layer
    // therefore resets dielectric intensity instead of leaking stone response.
    specularIntensityNode = mix(specularIntensityNode, float(1), topMask);
  }
  if (useGroundTopSurface) {
    const groundSurface = sampleGroundSurface(positionWorld);
    const groundSurfaceMask = topMask.mul(groundSurface.a);
    roughnessNode = mix(roughnessNode, groundSurface.r, groundSurfaceMask);
    specularIntensityNode = mix(
      specularIntensityNode,
      groundSurface.g,
      groundSurfaceMask,
    );
    metalnessNode = mix(metalnessNode, groundSurface.b, groundSurfaceMask);
  }

  const material = new MeshPhysicalNodeMaterial();
  material.name = name ?? `ToonLab_${resolvedProfile.sourceName}`;
  material.colorNode = layerState.color;
  // A flat tangent-space normal is mathematically the geometry normal, but
  // forcing it through TBN still depends on valid mesh tangents. Some authored
  // cliff side UV islands are degenerate and therefore carry zero tangents;
  // their invalid TBN turns otherwise healthy surfaces literal black. Only
  // install a tangent-space normal node when a connected texture contributes
  // a real normal response.
  const hasNormalResponse = Boolean(textures.rockNormal)
    || (resolvedAssetIntegration.sourceAlbedoStrength > 0 && Boolean(textures.sourceNormal))
    || (resolvedProfile.normals.useSmoothed && Boolean(textures.stylizedNormal))
    || hasSandNormalResponse;
  if (hasNormalResponse) material.normalNode = tangentNormalToView(combinedNormal);
  // The moss cushion's relief, applied in WORLD space after the tangent chain
  // rather than inside it. The cushion field is world-space fBm and the mask is
  // built from world-space terms, so expressing the tilt in tangent space would
  // mean routing a world gradient through a TBN that some authored rock UV
  // islands cannot supply — the same degenerate-tangent hazard the guard above
  // exists for. Perturbing the geometric normal instead needs no tangents at
  // all, which also lets the cushion be the sole normal response on an asset
  // that binds no normal map.
  if (mossMaskNode && mossCushionNode && resolvedProfile.moss.cushion > 0) {
    const surface = normalWorldGeometry;
    // Keep only the component of the gradient lying in the surface's tangent
    // plane; the part along the normal would scale the normal rather than tilt
    // it, which is not a slope.
    const tangential = mossCushionNode.sub(
      surface.mul(dot(mossCushionNode, surface)),
    );
    // Downhill on the height field means the surface tips that way, hence the
    // subtraction. Scaled by the mask so bare stone is untouched and the tilt
    // fades in exactly where the cushion swells.
    const cushionWorld = normalize(
      surface.sub(tangential.mul(
        mossMaskNode.mul(resolvedProfile.moss.cushion * 1.6),
      )),
    );
    // Two arguments, not one: the second is the matrix to transform BY. The
    // cushion normal is world-space, so that is the camera view matrix.
    const cushionView = transformNormalByViewMatrix(cushionWorld, cameraViewMatrix);
    material.normalNode = hasNormalResponse
      ? normalize(mix(material.normalNode, cushionView, mossMaskNode))
      : cushionView;
  }
  material.metalnessNode = metalnessNode;
  // TOONLAB exposes smoothness while Three exposes roughness.
  material.roughnessNode = roughnessNode;
  // TOONLAB metallic workflow's dielectric reflectance is 0.04, matching IOR 1.5.
  material.iorNode = float(1.5);
  material.specularIntensityNode = specularIntensityNode;
  const sourceEmission = textures.sourceEmissive?.isTexture
    ? texture(textures.sourceEmissive).sample(uv()).rgb.mul(
      vec3(...resolvedAssetIntegration.sourceEmissive),
    ).mul(resolvedAssetIntegration.sourceEmissiveIntensity)
    : vec3(...resolvedAssetIntegration.sourceEmissive)
      .mul(resolvedAssetIntegration.sourceEmissiveIntensity);
  material.emissiveNode = layerState.emission.add(
    sourceEmission.mul(resolvedAssetIntegration.sourceAlbedoStrength),
  );
  const vertexAoNode = resolvedAssetIntegration.vertexAoStrength > 0
    ? clamp(
      mix(
        float(1),
        attribute('envVertexAo', 'float'),
        resolvedAssetIntegration.vertexAoStrength,
      ),
      0,
      1,
    )
    : float(1);
  const primaryAoNode = textures.rockAo?.isTexture
    ? clamp(toonLabRockProjection(textures.rockAo, resolvedProfile).r, 0, 1)
    : float(1);
  const authoredAoNode = vertexAoNode.mul(primaryAoNode);
  material.aoNode = (
    resolvedAssetIntegration.sourceAoStrength > 0
    && textures.sourceAo?.isTexture
  )
    ? authoredAoNode.mul(mix(
      float(1),
      texture(textures.sourceAo).sample(uv()).r,
      resolvedAssetIntegration.sourceAoStrength,
    ))
    : authoredAoNode;
  const usesSourceAlpha = resolvedAssetIntegration.sourceAlphaTest > 0
    || resolvedAssetIntegration.sourceTransparent
    || resolvedAssetIntegration.sourceOpacity < 1;
  if (usesSourceAlpha) {
    material.opacityNode = textures.sourceRock?.isTexture
      ? texture(textures.sourceRock).sample(uv()).a.mul(resolvedAssetIntegration.sourceOpacity)
      : float(resolvedAssetIntegration.sourceOpacity);
    material.alphaTestNode = resolvedAssetIntegration.sourceAlphaTest > 0
      ? float(resolvedAssetIntegration.sourceAlphaTest)
      : null;
  }
  material.transparent = usesSourceAlpha && resolvedAssetIntegration.sourceTransparent;
  material.opacity = usesSourceAlpha ? resolvedAssetIntegration.sourceOpacity : 1;
  material.alphaTest = 0;
  material.depthWrite = usesSourceAlpha ? resolvedAssetIntegration.sourceDepthWrite : true;
  if (resolvedAssetIntegration.sourceSide !== null) material.side = resolvedAssetIntegration.sourceSide;
  material.userData.toonLabRockProfile = resolvedProfile;
  material.userData.toonLabRockSceneState = {
    setSkyColor(value) {
      const channels = value?.isColor
        ? [value.r, value.g, value.b]
        : Array.isArray(value) || ArrayBuffer.isView(value)
          ? Array.from(value).slice(0, 3).map(Number)
          : null;
      if (channels?.length === 3 && channels.every(Number.isFinite)) {
        sceneSkyColor.value.setRGB(...channels);
      }
      return sceneSkyColor.value.toArray();
    },
    setWaterLevel(value) {
      const next = Number(value);
      if (Number.isFinite(next)) sceneWaterLevel.value = next;
      return sceneWaterLevel.value;
    },
    skyColor: sceneSkyColor,
    waterLevel: sceneWaterLevel,
  };
  material.userData.toonLabRockAssetIntegration = resolvedAssetIntegration;
  material.userData.toonLabSourceShader = {
    assetPath: 'Environment/Rocks/Shaders/S_Rock.toonlabgraph',
    guid: TOONLAB_ROCK_SHADER_GUID,
  };
  material.userData.toonLabVertexMotion = {
    ...TOONLAB_ROCK_FAMILY_VERTEX_MOTION_CONTRACT[TOONLAB_ROCK_SHADER_GUID],
  };
  material.userData.toonLabNormalImport = {
    decode: 'UnpackNormalMapRGorAG-compatible RG + reconstructed positive Z',
    perTextureFlipGreenChannel: true,
  };
  const rockTextureFlipY = textures.rockNormal?.isTexture
    ? Boolean(textures.rockNormal.flipY)
    : null;
  material.userData.toonLabNormalIntegration =
    createToonLabNormalIntegrationMetadata({
      coordinateZSign: resolvedProfile.coordinates.zSign,
      decode: 'RG + per-texture importer green transform + reconstructed positive Z; ToonLab graph Normal Strength',
      family: 'toonlab-s-rock',
      flipGreenChannel: 'per-texture texture import state',
      textureFlipY: rockTextureFlipY,
    });
  // Live Preview diagnostics must be sourced by the material family itself.
  // The raw branch is the untouched source albedo projection: no tint,
  // distance color, moss/top layers, normal response, emission, or lighting.
  // Keeping it here prevents pages from substituting a flat fallback color for
  // any S_Rock material loaded through the ToonLab source-material path.
  registerSurfaceMaterialMode(material, SURFACE_MATERIAL_MODE.neutralLit, {
    colorNode: rockProjection,
    family: 'rock',
    keepsLighting: true,
    keepsTextures: true,
    vertexDeformation: false,
  });
  registerSurfaceMaterialMode(material, SURFACE_MATERIAL_MODE.rawTexture, {
    colorNode: rockProjection,
    family: 'rock',
    keepsLighting: false,
    keepsTextures: true,
    vertexDeformation: false,
  });
  const warmSkyBlend = smoothstep(
    float(0),
    float(0.25),
    sceneSkyColor.r.sub(sceneSkyColor.b),
  );
  const preserveProbeChroma = max(warmSkyBlend, lowLightProbeBlend);
  installToonLabSurfaceLighting(material, {
    // Keep geological Base Color invariant. The captured intensity-8 sun still
    // needs the historical rock calibration, but applying it to albedo also
    // crushed the sky probe and every shaded face. Direct light owns that
    // calibration now; indirect light and the readability floor see the real
    // material color.
    directStrength: resolvedProfile.lighting.exposure,
    indirectStrength: resolvedProfile.lighting.skyFillStrength,
    indirectTint: resolvedProfile.lighting.skyFillTint,
    // The scene probe supplies irradiance magnitude, while this live uniform
    // supplies its visible time-of-day colour. This preserves geological Base
    // Color and makes the same shaded face blue at noon, warm at sunset, and
    // deep blue at night without rebuilding or retexturing the material.
    // A bright neutral daytime probe receives visible-sky chroma. Low-light
    // and warm-hour probes already contain their authored colour, so preserve
    // them instead of multiplying that colour a second time. Double-tinting
    // the dark-blue night probe crushed red sandstone almost to black.
    indirectTintNode: mix(skyChroma, vec3(1), preserveProbeChroma)
      .mul(vec3(...resolvedProfile.lighting.skyFillTint)),
    indirectTintMode: 'multiply',
    shadowFill: resolvedProfile.lighting.shadowFill,
    shadowFillTint: resolvedProfile.lighting.shadowFillTint,
    // Native directional shadows already cover these meshes. Re-sampling the
    // package depth atlas here double-shadowed the full rock at sunset; cloud
    // transmittance remains shared inside the lighting bridge.
    useSharedSunShadow: false,
    workflow: 'metallic',
  });
  return material;
}

function validateMountainTextures(textures) {
  for (const key of ['noise', 'rock', 'grass', 'snow']) {
    assertTexture(textures[key], key, 'for the connected S_Mountain graph input');
  }
}

/**
 * Exact connected outputs of ToonLab's separate S_Mountain ToonLab graph.
 * Unlike S_Rock, this graph has no normal texture or emission branch: it
 * projects rock/grass/snow in world XZ, then derives grass and snow masks from
 * geometry normal, UV0.y, and one shared noise sample.
 */
export function createToonLabMountainMaterial({
  profile = {},
  textures = {},
  name = null,
} = {}) {
  const resolvedProfile = normalizeToonLabMountainProfile(profile);
  validateMountainTextures(textures);

  const sourcePosition = toonLabSourcePosition(resolvedProfile.coordinates);
  const planar = vec2(sourcePosition.x, sourcePosition.z);
  const baseUv = planar.div(safeScale(resolvedProfile.textureScale));
  const noiseUv = planar.div(safeScale(resolvedProfile.noiseSize));
  const rock = texture(textures.rock).sample(baseUv).rgb;
  const grass = texture(textures.grass).sample(baseUv.mul(2)).rgb;
  const snow = texture(textures.snow).sample(baseUv).rgb;
  const centeredNoise = texture(textures.noise).sample(noiseUv).r.sub(0.5);

  const sourceUvY = resolvedProfile.coordinates.flipProceduralUvY
    ? uv().y.oneMinus()
    : uv().y;
  const authoredUvY = clamp(sourceUvY, 0, 1);
  const slopeStart = 1 - resolvedProfile.grassSlopeMax;
  // S_Mountain uses an unclamped Remap here; the product is saturated only
  // after the procedural UV-height fade has been applied.
  const grassSlope = normalWorldGeometry.y
    .add(centeredNoise.mul(resolvedProfile.grassNoiseStrength))
    .sub(slopeStart)
    .div(0.04);
  // The first two-key Gradient is black->white. Its subsequent remap from
  // [fade-1, fade] to [1, 0] reduces exactly to fade - UV.y.
  const grassHeight = clamp(
    float(resolvedProfile.grassTopFadeout).sub(authoredUvY),
    0,
    1,
  );
  const grassMask = clamp(grassSlope.mul(grassHeight), 0, 1);

  // The snow Gradient is white->black; noise is added before the reversed
  // 0.05-wide threshold remap.
  const snowHeight = authoredUvY.oneMinus().add(
    centeredNoise.mul(resolvedProfile.snowNoiseStrength),
  );
  const snowMask = clamp(
    float(1).sub(
      snowHeight.sub(resolvedProfile.snowTopAmount).div(0.05),
    ),
    0,
    1,
  );

  const material = new MeshPhysicalNodeMaterial();
  material.name = name ?? `ToonLab_${resolvedProfile.sourceName}`;
  material.colorNode = mix(mix(rock, grass, grassMask), snow, snowMask);
  material.metalnessNode = float(0);
  material.roughnessNode = clamp(float(1 - resolvedProfile.smoothness), 0, 1);
  material.iorNode = float(1.5);
  material.specularIntensityNode = float(1);
  material.emissiveNode = vec3(0);
  material.aoNode = float(1);
  material.transparent = false;
  material.opacity = 1;
  material.alphaTest = 0;
  material.depthWrite = true;
  material.userData.toonLabMountainProfile = resolvedProfile;
  material.userData.toonLabSourceShader = {
    assetPath: 'Environment/Rocks/Shaders/S_Mountain.toonlabgraph',
    guid: TOONLAB_MOUNTAIN_SHADER_GUID,
  };
  material.userData.toonLabVertexMotion = {
    ...TOONLAB_ROCK_FAMILY_VERTEX_MOTION_CONTRACT[TOONLAB_MOUNTAIN_SHADER_GUID],
  };
  const mountainTexture = textures.rock ?? textures.noise;
  material.userData.toonLabNormalIntegration =
    createToonLabNormalIntegrationMetadata({
      coordinateZSign: resolvedProfile.coordinates.zSign,
      decode: 'geometry-only; S_Mountain has no connected normal-map input',
      family: 'toonlab-s-mountain',
      textureFlipY: mountainTexture?.isTexture
        ? Boolean(mountainTexture.flipY)
        : null,
    });
  installToonLabSurfaceLighting(material, { workflow: 'metallic' });
  return material;
}

function joinUrl(baseUrl, relativePath) {
  if (!relativePath) return null;
  if (/^(?:data:|blob:|https?:\/\/|\/\/)/i.test(relativePath)) return relativePath;
  return `${String(baseUrl).replace(/\/$/, '')}/${String(relativePath).replace(/^\//, '')}`;
}

function manifestDirectory(url) {
  const value = String(url);
  const slash = value.lastIndexOf('/');
  return slash >= 0 ? value.slice(0, slash) : '.';
}

async function resolveManifest(manifest, baseUrl) {
  if (manifest && typeof manifest === 'object') {
    return { manifest, baseUrl: baseUrl ?? DEFAULT_TOONLAB_ROCK_LIBRARY_BASE_URL };
  }
  if (!manifest && (typeof baseUrl !== 'string' || !baseUrl.trim())) {
    throw new Error('A rock material manifest or configured baseUrl is required.');
  }
  const manifestUrl = typeof manifest === 'string'
    ? joinUrl(baseUrl ?? '', manifest)
    : joinUrl(
      baseUrl ?? DEFAULT_TOONLAB_ROCK_LIBRARY_BASE_URL,
      'rock-material-library.json',
    );
  const response = await fetch(manifestUrl, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`ToonLab rock material manifest is unavailable (${response.status}).`);
  }
  const responseText = await response.text();
  let resolvedManifest;
  try {
    resolvedManifest = JSON.parse(responseText);
  } catch (error) {
    const contentType = response.headers.get('content-type') ?? 'unknown';
    throw new Error(
      `ToonLab rock material manifest returned invalid JSON `
      + `(${response.status}; ${contentType}).`,
      { cause: error },
    );
  }
  return {
    manifest: resolvedManifest,
    baseUrl: baseUrl ?? manifestDirectory(manifestUrl),
  };
}

function validateManifest(manifest) {
  if (normalizeToonLabRockMaterialLibrarySchema(manifest?.schema)
      !== TOONLAB_ROCK_MANIFEST_SCHEMA
    || Number(manifest?.schemaVersion) !== TOONLAB_ROCK_MANIFEST_VERSION) {
    throw new Error('Invalid ToonLab rock material library manifest.');
  }
  if (!Array.isArray(manifest.materials) || !manifest.texturesByGuid) {
    throw new Error('ToonLab rock manifest is missing materials or texturesByGuid.');
  }
}

function findMaterialEntry(manifest, selector) {
  if (selector?.resolved) return selector;
  const value = String(selector ?? '');
  const entry = manifest.materials.find((candidate) => (
    candidate.assetPath === value || candidate.guid === value || candidate.name === value
  ));
  if (!entry) throw new Error(`ToonLab rock material was not found: ${value || '(empty selector)'}`);
  return entry;
}

function wrappingFromToonLab(value) {
  if (Number(value) === 1) return ClampToEdgeWrapping;
  if (Number(value) === 2 || Number(value) === 3) return MirroredRepeatWrapping;
  return RepeatWrapping;
}

function applyTextureImportSettings(result, record, { textureFlipY = false } = {}) {
  const settings = record?.importSettings ?? {};
  result.name = record?.assetPath?.split('/').at(-1) ?? record?.guid ?? result.name;
  result.colorSpace = settings.sRGBTexture || settings.colorSpace === 'srgb'
    ? SRGBColorSpace
    : NoColorSpace;
  result.flipY = Boolean(textureFlipY);
  result.wrapS = wrappingFromToonLab(settings.wrapU);
  result.wrapT = wrappingFromToonLab(settings.wrapV);
  result.generateMipmaps = settings.mipmapEnabled !== false;
  const filterMode = Number(settings.filterMode ?? 1);
  if (filterMode === 0) {
    result.magFilter = NearestFilter;
    result.minFilter = result.generateMipmaps ? NearestMipmapNearestFilter : NearestFilter;
  } else if (filterMode === 2) {
    result.magFilter = LinearFilter;
    result.minFilter = result.generateMipmaps ? LinearMipmapLinearFilter : LinearFilter;
  } else {
    result.magFilter = LinearFilter;
    result.minFilter = result.generateMipmaps ? LinearMipmapNearestFilter : LinearFilter;
  }
  result.anisotropy = Math.max(1, finite(settings.aniso, 1));
  result.userData.toonLabTextureGuid = record?.guid ?? null;
  result.userData.toonLabImportSettings = {
    ...settings,
    textureFlipY: Boolean(textureFlipY),
  };
  result.needsUpdate = true;
  return result;
}

async function loadManifestTexture({
  key,
  slot,
  manifest,
  material,
  baseUrl,
  resolveTexture,
  textureFlipY,
  textureLoader,
}) {
  if (!slot || Number(slot.fileID) === 0 || !slot.guid) return null;
  const record = manifest.texturesByGuid[slot.guid];
  if (!record?.outputFile) {
    throw new Error(`ToonLab texture ${slot.guid} for ${material.name}/${key} is unresolved.`);
  }
  if (resolveTexture) {
    const resolved = await resolveTexture({
      key,
      slot,
      record,
      manifest,
      material,
      baseUrl,
      textureFlipY,
    });
    if (resolved != null && !resolved.isTexture) {
      throw new TypeError(`resolveTexture returned a non-Texture for ${material.name}/${key}.`);
    }
    return resolved;
  }
  if (typeof baseUrl !== 'string' || !baseUrl.trim()) {
    throw new Error(
      `A configured baseUrl or resolveTexture callback is required for ${material.name}/${key}.`,
    );
  }

  const url = joinUrl(baseUrl, record.outputFile);
  const cacheKey = `${url}|flipY=${Boolean(textureFlipY)}`;
  if (!texturePromiseCache.has(cacheKey)) {
    texturePromiseCache.set(cacheKey, textureLoader.loadAsync(url)
      .then((result) => applyTextureImportSettings(result, record, { textureFlipY }))
      .catch((error) => {
        texturePromiseCache.delete(cacheKey);
        throw error;
      }));
  }
  return texturePromiseCache.get(cacheKey);
}

/**
 * High-level loader for the generated ToonLab library manifest.
 *
 * `material` may be an assetPath, GUID, material name, or a manifest entry.
 * `resolveTexture({ key, slot, record, manifest, material, baseUrl })` can be
 * supplied by hosts with their own cache/asset system. Without it, outputFile
 * paths are loaded relative to baseUrl with texture import metadata applied.
 * `coordinates: { zSign: -1 }` reconstructs ToonLab projection space when the
 * paired scene conversion reflects ToonLab Z into Three Z. `distanceScale`
 * bridges source distance units without changing world-projected texture
 * scales. ToonLab material values and glTF/Three scene coordinates are both
 * metres after export, so source parity normally uses 1.
 * `textureFlipY` is false for the supplied ToonLabShowcase ToonLab glTF bridge and true
 * for ToonLabSceneExport.cs geometry, whose UV.y values are copied unchanged.
 */
export async function loadToonRockMaterialInputs({
  manifest = null,
  material,
  baseUrl = null,
  resolveTexture = null,
  textureLoader = new TextureLoader(),
  coordinates = null,
  normalGreenSign = null,
  textureFlipY = false,
  includeInactiveTextures = false,
} = {}) {
  const resolvedLibrary = await resolveManifest(manifest, baseUrl);
  validateManifest(resolvedLibrary.manifest);
  const entry = findMaterialEntry(resolvedLibrary.manifest, material);
  let profile = toonLabRockProfileFromResolvedMaterial(entry);
  if (coordinates) profile = normalizeToonLabRockProfile({ ...profile, coordinates });
  if (normalGreenSign != null) {
    profile = normalizeToonLabRockProfile({
      ...profile,
      normals: {
        ...profile.normals,
        normalGreenSign,
      },
    });
  }
  const textures = {};
  const textureKeys = textureKeysForProfile(profile, {
    includeInactive: includeInactiveTextures,
  });
  await Promise.all([...textureKeys].map(async (key) => {
    const slot = profile.textureRefs[key];
    textures[key] = await loadManifestTexture({
      key,
      slot,
      manifest: resolvedLibrary.manifest,
      material: entry,
      baseUrl: resolvedLibrary.baseUrl,
      resolveTexture,
      textureFlipY,
      textureLoader,
    });
  }));
  return {
    entry,
    manifest: resolvedLibrary.manifest,
    profile,
    textures,
  };
}

export async function loadToonRockMaterial({
  manifest = null,
  material,
  baseUrl = null,
  resolveTexture = null,
  textureLoader = new TextureLoader(),
  name = null,
  coordinates = null,
  normalGreenSign = null,
  textureFlipY = false,
  includeInactiveTextures = false,
} = {}) {
  const {
    profile,
    textures,
  } = await loadToonRockMaterialInputs({
    manifest,
    material,
    baseUrl,
    resolveTexture,
    textureLoader,
    coordinates,
    normalGreenSign,
    textureFlipY,
    includeInactiveTextures,
  });
  const result = createToonRockMaterial({ profile, textures, name });
  result.userData.toonLabNormalIntegration.textureFlipY = Boolean(textureFlipY);
  return result;
}

/** High-level loader for the S_Mountain entries in the shared ToonLab manifest. */
export async function loadToonLabMountainMaterial({
  manifest = null,
  material,
  baseUrl = null,
  resolveTexture = null,
  textureLoader = new TextureLoader(),
  name = null,
  coordinates = null,
  textureFlipY = false,
} = {}) {
  const resolvedLibrary = await resolveManifest(manifest, baseUrl);
  validateManifest(resolvedLibrary.manifest);
  const entry = findMaterialEntry(resolvedLibrary.manifest, material);
  let profile = toonLabMountainProfileFromResolvedMaterial(entry);
  if (coordinates) {
    profile = normalizeToonLabMountainProfile({ ...profile, coordinates });
  }
  const textures = {};
  await Promise.all(['noise', 'rock', 'grass', 'snow'].map(async (key) => {
    const slot = profile.textureRefs[key];
    textures[key] = await loadManifestTexture({
      key,
      slot,
      manifest: resolvedLibrary.manifest,
      material: entry,
      baseUrl: resolvedLibrary.baseUrl,
      resolveTexture,
      textureFlipY,
      textureLoader,
    });
  }));
  const result = createToonLabMountainMaterial({ profile, textures, name });
  result.userData.toonLabNormalIntegration.textureFlipY = Boolean(textureFlipY);
  return result;
}
