// Sticker / decal overlay.
//
// Blends an overlay texture into the albedo before lighting, so the sticker
// shades with the same cel bands as the rest of the surface. Covers the
// "runtime texture overlay" use case (ice, rock, tattoos, damage decals).
// The sampler is compiled in per material only when a map is present.
//
// Map sources, in priority order:
//   1. settings.map (applies to every matching material)
//   2. material.userData.toonStickerMap / stickerMap (per-material)

export const STICKER_BLEND_MODES = Object.freeze({
  normal: 'normal',
  add: 'add',
  multiply: 'multiply',
});

export const STICKER_BLEND_MODE_VALUES = Object.freeze({
  [STICKER_BLEND_MODES.normal]: 0,
  [STICKER_BLEND_MODES.add]: 1,
  [STICKER_BLEND_MODES.multiply]: 2,
});

export const DEFAULT_STICKER_SETTINGS = Object.freeze({
  blendMode: STICKER_BLEND_MODES.normal,
  enabled: false,
  map: null,
  offset: [0, 0],
  repeat: [1, 1],
  strength: 1,
  // 0 = uv, 1 = uv2.
  uvChannel: 0,
});

function firstDefined(source, keys) {
  for (const key of keys) {
    if (source?.[key] !== undefined) return source[key];
  }
  return undefined;
}

function numberOption(value, fallback, { min = -Infinity, max = Infinity } = {}) {
  const nextValue = Number(value);
  if (!Number.isFinite(nextValue)) return fallback;
  return Math.min(max, Math.max(min, nextValue));
}

function vector2Option(value, fallback) {
  if (Array.isArray(value) && value.length >= 2) {
    return [numberOption(value[0], fallback[0]), numberOption(value[1], fallback[1])];
  }
  if (typeof value === 'object' && value !== null) {
    return [numberOption(value.x, fallback[0]), numberOption(value.y, fallback[1])];
  }
  return [...fallback];
}

function blendModeOption(value, fallback) {
  const key = String(value ?? '').trim().toLowerCase();
  if (['add', 'additive', 'screen'].includes(key)) return STICKER_BLEND_MODES.add;
  if (['multiply', 'mul', 'darken'].includes(key)) return STICKER_BLEND_MODES.multiply;
  if (['normal', 'blend', 'alpha', 'alphablend'].includes(key)) return STICKER_BLEND_MODES.normal;
  return fallback;
}

function normalizeStickerOptions(options) {
  if (options === false) return { enabled: false };
  if (options === true) return { enabled: true };
  return options || {};
}

export function createStickerSettings(options = null) {
  const source = normalizeStickerOptions(options);
  const enabled = source.enabled === true || (source.enabled !== false && Boolean(source.map));

  return {
    blendMode: blendModeOption(firstDefined(source, ['blendMode', 'blend', 'mode']), DEFAULT_STICKER_SETTINGS.blendMode),
    enabled,
    map: firstDefined(source, ['map', 'stickerMap', 'texture']) ?? DEFAULT_STICKER_SETTINGS.map,
    offset: vector2Option(firstDefined(source, ['offset', 'uvOffset']), DEFAULT_STICKER_SETTINGS.offset),
    repeat: vector2Option(firstDefined(source, ['repeat', 'uvRepeat', 'tiling']), DEFAULT_STICKER_SETTINGS.repeat),
    strength: numberOption(firstDefined(source, ['strength', 'intensity', 'opacity']), DEFAULT_STICKER_SETTINGS.strength, { min: 0, max: 1 }),
    uvChannel: numberOption(firstDefined(source, ['uvChannel']), DEFAULT_STICKER_SETTINGS.uvChannel, { min: 0, max: 1 }) >= 0.5 ? 1 : 0,
  };
}

export function resolveStickerForMaterial(settings, { isOutline = false, sourceMaterial = null } = {}) {
  const materialMap = sourceMaterial?.userData?.toonStickerMap ??
    sourceMaterial?.userData?.stickerMap ??
    null;
  const map = settings.map ?? materialMap;

  return {
    blendModeValue: STICKER_BLEND_MODE_VALUES[settings.blendMode] ?? 0,
    enabled: settings.enabled && !isOutline && Boolean(map) && settings.strength > 0,
    map,
    offset: settings.offset,
    repeat: settings.repeat,
    strength: settings.strength,
    uvChannel: settings.uvChannel,
  };
}
