import * as THREE from 'three';

export const BASE_TEXTURE_MATERIAL_COLOR_MODES = Object.freeze({
  legacy: 'legacy',
  source: 'source',
  texture: 'texture',
  white: 'white',
});

export const BASE_TEXTURE_SATURATION_MODES = Object.freeze({
  legacy: 'legacy',
  source: 'source',
  custom: 'custom',
});

export const DEFAULT_BASE_TEXTURE_SETTINGS = Object.freeze({
  customSaturation: 1,
  materialColorMode: BASE_TEXTURE_MATERIAL_COLOR_MODES.legacy,
  saturationMode: BASE_TEXTURE_SATURATION_MODES.legacy,
});

const MATERIAL_COLOR_MODE_ALIASES = Object.freeze({
  '': BASE_TEXTURE_MATERIAL_COLOR_MODES.legacy,
  auto: BASE_TEXTURE_MATERIAL_COLOR_MODES.legacy,
  default: BASE_TEXTURE_MATERIAL_COLOR_MODES.legacy,
  ignore: BASE_TEXTURE_MATERIAL_COLOR_MODES.texture,
  legacy: BASE_TEXTURE_MATERIAL_COLOR_MODES.legacy,
  none: BASE_TEXTURE_MATERIAL_COLOR_MODES.white,
  preserve: BASE_TEXTURE_MATERIAL_COLOR_MODES.source,
  raw: BASE_TEXTURE_MATERIAL_COLOR_MODES.source,
  source: BASE_TEXTURE_MATERIAL_COLOR_MODES.source,
  texture: BASE_TEXTURE_MATERIAL_COLOR_MODES.texture,
  textureonly: BASE_TEXTURE_MATERIAL_COLOR_MODES.texture,
  white: BASE_TEXTURE_MATERIAL_COLOR_MODES.white,
});

const SATURATION_MODE_ALIASES = Object.freeze({
  '': BASE_TEXTURE_SATURATION_MODES.legacy,
  auto: BASE_TEXTURE_SATURATION_MODES.legacy,
  custom: BASE_TEXTURE_SATURATION_MODES.custom,
  default: BASE_TEXTURE_SATURATION_MODES.legacy,
  legacy: BASE_TEXTURE_SATURATION_MODES.legacy,
  preserve: BASE_TEXTURE_SATURATION_MODES.source,
  raw: BASE_TEXTURE_SATURATION_MODES.source,
  source: BASE_TEXTURE_SATURATION_MODES.source,
});

function normalizeKey(value) {
  return String(value ?? '')
    .trim()
    .replace(/[\s_-]+/g, '')
    .toLowerCase();
}

function normalizeMaterialColorMode(value, fallback) {
  return MATERIAL_COLOR_MODE_ALIASES[normalizeKey(value)] ?? fallback;
}

function normalizeSaturationMode(value, fallback) {
  return SATURATION_MODE_ALIASES[normalizeKey(value)] ?? fallback;
}

export function createBaseTextureSettings(options = null) {
  if (!options) return DEFAULT_BASE_TEXTURE_SETTINGS;

  if (typeof options === 'string') {
    return {
      ...DEFAULT_BASE_TEXTURE_SETTINGS,
      materialColorMode: normalizeMaterialColorMode(options, DEFAULT_BASE_TEXTURE_SETTINGS.materialColorMode),
    };
  }

  const preserveSource = options.preserveSource === true || options.preserve === true;
  const fallbackMode = preserveSource
    ? BASE_TEXTURE_MATERIAL_COLOR_MODES.source
    : DEFAULT_BASE_TEXTURE_SETTINGS.materialColorMode;
  const fallbackSaturationMode = preserveSource
    ? BASE_TEXTURE_SATURATION_MODES.source
    : DEFAULT_BASE_TEXTURE_SETTINGS.saturationMode;
  const customSaturation = Number.isFinite(options.customSaturation)
    ? options.customSaturation
    : Number.isFinite(options.saturation)
      ? options.saturation
      : DEFAULT_BASE_TEXTURE_SETTINGS.customSaturation;

  return {
    customSaturation,
    materialColorMode: normalizeMaterialColorMode(
      options.materialColorMode ?? options.materialColor ?? options.colorMode,
      fallbackMode,
    ),
    saturationMode: normalizeSaturationMode(
      options.saturationMode ?? options.saturationPolicy,
      fallbackSaturationMode,
    ),
  };
}

export function getSourceMaterialColor(mat) {
  return mat?.color?.isColor ? mat.color : new THREE.Color(1, 1, 1);
}

// Importers that fill in a grey diffuse the artist never chose (FBX's 0.8,
// OBJ/MTL defaults, some MMD exports) would darken every textured material.
// A near-grey multiplier in that mid band on those formats is treated as that
// default. glTF/VRM baseColorFactor is an explicit, spec-defined multiply, and
// a near-black factor is never an importer default — both are kept.
const AUTHORED_COLOR_FORMATS = new Set(['gltf', 'glb', 'vrm']);
// In FBX a texture connected to DiffuseColor replaces the colour rather than
// multiplying it (Max exports often leave the colour black), but three's
// FBXLoader keeps both, so the colour is ignored whenever a map is present.
const TEXTURE_REPLACES_COLOR_FORMATS = new Set(['fbx']);

function sourceFormat(mat) {
  return String(mat?.userData?.toonSource?.format ?? '').toLowerCase();
}

function isImporterDefaultMultiplier(mat, color) {
  if (AUTHORED_COLOR_FORMATS.has(sourceFormat(mat))) return false;
  if (TEXTURE_REPLACES_COLOR_FORMATS.has(sourceFormat(mat))) return true;
  if (mat?.isMToonMaterial) return false;
  const maxChannel = Math.max(color.r, color.g, color.b);
  const minChannel = Math.min(color.r, color.g, color.b);
  const luma = color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
  return maxChannel - minChannel < 0.04 && luma > 0.35 && luma < 0.98;
}

export function resolveBaseMaterialColor(mat, settings = DEFAULT_BASE_TEXTURE_SETTINGS) {
  const sourceColor = getSourceMaterialColor(mat);
  const hasTexture = mat?.map?.isTexture === true;
  const mode = settings.materialColorMode ?? DEFAULT_BASE_TEXTURE_SETTINGS.materialColorMode;

  if (mode === BASE_TEXTURE_MATERIAL_COLOR_MODES.white) return new THREE.Color(1, 1, 1);
  if (mode === BASE_TEXTURE_MATERIAL_COLOR_MODES.texture && hasTexture) return new THREE.Color(1, 1, 1);
  if (
    mode === BASE_TEXTURE_MATERIAL_COLOR_MODES.legacy &&
    hasTexture &&
    isImporterDefaultMultiplier(mat, sourceColor)
  ) {
    return new THREE.Color(1, 1, 1);
  }

  return sourceColor;
}

export function resolveBaseMapSaturation({ isFace = false, isSkin = false } = {}, settings = DEFAULT_BASE_TEXTURE_SETTINGS) {
  const mode = settings.saturationMode ?? DEFAULT_BASE_TEXTURE_SETTINGS.saturationMode;
  if (mode === BASE_TEXTURE_SATURATION_MODES.source) return 1;
  if (mode === BASE_TEXTURE_SATURATION_MODES.custom) return settings.customSaturation;
  return isSkin || isFace ? 0.98 : 1.04;
}
