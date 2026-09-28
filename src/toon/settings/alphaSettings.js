import {
  hasAnyToken,
  materialText,
  roleIsFace,
  roleIsHair,
  roleIsSkin,
  roleIsTransparentOverlay,
} from '../../core/materialRoles.js';
import { ALPHA_COVERAGE_KINDS } from '../alphaCoverage.js';

export const ALPHA_COVERAGE_MODES = Object.freeze({
  auto: 'auto',
  trust: 'trust',
});

export const DEFAULT_ALPHA_SETTINGS = Object.freeze({
  blendCutoff: 0.02,
  costumeCutout: true,
  // 'auto' checks each inferred cutout against the measured alpha coverage
  // (see alphaCoverage.js) and drops cutouts over opaque or channel-packed
  // alpha; 'trust' honours every inference rule as-is.
  coverageMode: ALPHA_COVERAGE_MODES.auto,
  cutoutCutoff: 0.35,
  // Bayer-matrix screen-door fade (1 = fully visible). Unlike alpha blending
  // it needs no sorting, keeps depth writes, and works with outlines — the
  // standard way to fade a whole character in/out. Runtime helper:
  // setToonDitherOpacity(root, value).
  ditherOpacity: 1,
  enabled: true,
  expressionTokenCutout: true,
  eyeHighlightOrder: 12,
  eyeOrder: 11,
  faceCutout: true,
  // Brows, lashes and eye lines draw over bangs (the anime convention) by
  // pulling only their depth this many metres toward the camera while the
  // face points at it; hands, hats and the side view still cover them.
  // 0 turns it off.
  featuresOverHairDepth: 0.03,
  hairCutout: true,
  mapTransparentCutout: true,
  overlayDepthWrite: false,
  overlayOrder: 20,
  preserveSourceAlphaTest: true,
  scleraOrder: 10,
  skinCutout: true,
  sortOverlays: true,
  sourceAlphaMapCutout: true,
  sourceTransparentCutout: true,
  transparentOverlayBlend: true,
  transparentOpacityThreshold: 0.999,
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

function enabledOption(value) {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized !== 'off' && normalized !== 'none' && normalized !== 'false' && normalized !== '0';
  }
  return value !== false;
}

function normalizeAlphaOptions(options) {
  if (options === false) return { enabled: false };
  if (options === true) return { enabled: true };
  if (typeof options === 'string') return { enabled: enabledOption(options) };
  return options || {};
}

export function createAlphaSettings(options = null) {
  const source = normalizeAlphaOptions(options);
  const enabled = enabledOption(source.enabled);

  return {
    blendCutoff: enabled
      ? numberOption(firstDefined(source, ['blendCutoff', 'blendAlphaTest', 'blendThreshold']), DEFAULT_ALPHA_SETTINGS.blendCutoff, { min: 0, max: 1 })
      : -1,
    costumeCutout: source.costumeCutout !== undefined ? enabledOption(source.costumeCutout) : DEFAULT_ALPHA_SETTINGS.costumeCutout,
    coverageMode: Object.values(ALPHA_COVERAGE_MODES).includes(source.coverageMode)
      ? source.coverageMode
      : DEFAULT_ALPHA_SETTINGS.coverageMode,
    cutoutCutoff: enabled
      ? numberOption(firstDefined(source, ['cutoutCutoff', 'alphaCutoff', 'alphaTest', 'cutoutThreshold']), DEFAULT_ALPHA_SETTINGS.cutoutCutoff, { min: 0, max: 1 })
      : -1,
    ditherOpacity: numberOption(
      firstDefined(source, ['ditherOpacity', 'ditherFadeout', 'fadeOpacity']),
      DEFAULT_ALPHA_SETTINGS.ditherOpacity,
      { min: 0, max: 1 },
    ),
    enabled,
    expressionTokenCutout: source.expressionTokenCutout !== undefined ? enabledOption(source.expressionTokenCutout) : DEFAULT_ALPHA_SETTINGS.expressionTokenCutout,
    eyeHighlightOrder: numberOption(firstDefined(source, ['eyeHighlightOrder', 'catchlightOrder']), DEFAULT_ALPHA_SETTINGS.eyeHighlightOrder, { min: -100, max: 100 }),
    eyeOrder: numberOption(firstDefined(source, ['eyeOrder', 'irisOrder', 'pupilOrder']), DEFAULT_ALPHA_SETTINGS.eyeOrder, { min: -100, max: 100 }),
    faceCutout: source.faceCutout !== undefined ? enabledOption(source.faceCutout) : DEFAULT_ALPHA_SETTINGS.faceCutout,
    hairCutout: source.hairCutout !== undefined ? enabledOption(source.hairCutout) : DEFAULT_ALPHA_SETTINGS.hairCutout,
    mapTransparentCutout: source.mapTransparentCutout !== undefined ? enabledOption(source.mapTransparentCutout) : DEFAULT_ALPHA_SETTINGS.mapTransparentCutout,
    overlayDepthWrite: source.overlayDepthWrite !== undefined ? enabledOption(source.overlayDepthWrite) : DEFAULT_ALPHA_SETTINGS.overlayDepthWrite,
    featuresOverHairDepth: numberOption(source.featuresOverHairDepth, DEFAULT_ALPHA_SETTINGS.featuresOverHairDepth, { min: 0, max: 0.1 }),
    overlayOrder: numberOption(firstDefined(source, ['overlayOrder', 'transparentOverlayOrder']), DEFAULT_ALPHA_SETTINGS.overlayOrder, { min: -100, max: 100 }),
    preserveSourceAlphaTest: source.preserveSourceAlphaTest !== undefined ? enabledOption(source.preserveSourceAlphaTest) : DEFAULT_ALPHA_SETTINGS.preserveSourceAlphaTest,
    scleraOrder: numberOption(firstDefined(source, ['scleraOrder', 'eyeWhiteOrder']), DEFAULT_ALPHA_SETTINGS.scleraOrder, { min: -100, max: 100 }),
    skinCutout: source.skinCutout !== undefined ? enabledOption(source.skinCutout) : DEFAULT_ALPHA_SETTINGS.skinCutout,
    sortOverlays: source.sortOverlays !== undefined ? enabledOption(source.sortOverlays) : DEFAULT_ALPHA_SETTINGS.sortOverlays,
    sourceAlphaMapCutout: source.sourceAlphaMapCutout !== undefined ? enabledOption(source.sourceAlphaMapCutout) : DEFAULT_ALPHA_SETTINGS.sourceAlphaMapCutout,
    sourceTransparentCutout: source.sourceTransparentCutout !== undefined ? enabledOption(source.sourceTransparentCutout) : DEFAULT_ALPHA_SETTINGS.sourceTransparentCutout,
    transparentOverlayBlend: source.transparentOverlayBlend !== undefined ? enabledOption(source.transparentOverlayBlend) : DEFAULT_ALPHA_SETTINGS.transparentOverlayBlend,
    transparentOpacityThreshold: numberOption(
      firstDefined(source, ['transparentOpacityThreshold', 'opaqueOpacityThreshold', 'opacityThreshold']),
      DEFAULT_ALPHA_SETTINGS.transparentOpacityThreshold,
      { min: 0, max: 1 },
    ),
  };
}

export function sourceOpacity(mat) {
  return Number.isFinite(mat?.opacity) ? mat.opacity : 1;
}

// The author explicitly chose alpha blending (glTF/VRM alphaMode BLEND, which
// importers otherwise only surface as `transparent`). Other formats set
// `transparent` loosely, so it is not treated as a declaration.
export function declaresAlphaBlend(mat) {
  return String(mat?.userData?.toonSource?.alphaMode ?? '').toUpperCase() === 'BLEND';
}

// Soft alpha (mostly partial values) on a declared blend is coverage the author
// meant to blend — an eye overlay, a tint film — not packed data.
function isDeclaredSoftBlend(settings, mat, coverage) {
  return settings.coverageMode !== ALPHA_COVERAGE_MODES.trust &&
    coverage?.kind === ALPHA_COVERAGE_KINDS.data &&
    declaresAlphaBlend(mat);
}

// Evidence veto: in 'auto' mode no rule may cut against alpha that is
// measured to be opaque or packed data. Unknown coverage keeps the rules.
function coverageForbidsAlpha(settings, coverage) {
  if (settings.coverageMode === ALPHA_COVERAGE_MODES.trust) return false;
  return coverage?.kind === ALPHA_COVERAGE_KINDS.opaque || coverage?.kind === ALPHA_COVERAGE_KINDS.data;
}

export function usesAlphaCutout(mat, roleInfo, settings = createAlphaSettings(), coverage = null) {
  if (!settings.enabled || !mat || roleIsTransparentOverlay(roleInfo)) return false;
  if (coverageForbidsAlpha(settings, coverage)) return false;

  const text = materialText(mat);
  const tokenCutout = settings.expressionTokenCutout &&
    hasAnyToken(text, ['skin', 'costume', 'cloth', 'clothes', 'hair', 'expression']);

  return (
    (settings.preserveSourceAlphaTest && Number.isFinite(mat.alphaTest) && mat.alphaTest > 0) ||
    (settings.sourceAlphaMapCutout && Boolean(mat.alphaMap)) ||
    (settings.mapTransparentCutout && mat.map?.transparent === true) ||
    (settings.sourceTransparentCutout && mat.transparent === true && sourceOpacity(mat) >= settings.transparentOpacityThreshold) ||
    (settings.skinCutout && roleIsSkin(roleInfo)) ||
    (settings.faceCutout && roleIsFace(roleInfo)) ||
    (settings.hairCutout && roleIsHair(roleInfo)) ||
    (settings.costumeCutout && roleInfo?.role === 'costume') ||
    tokenCutout
  );
}

export function usesAlphaBlend(mat, roleInfo, settings = createAlphaSettings()) {
  if (!settings.enabled || !mat) return false;
  if (roleIsTransparentOverlay(roleInfo)) return settings.transparentOverlayBlend;
  return mat.transparent === true && sourceOpacity(mat) < settings.transparentOpacityThreshold;
}

export function alphaTestForMaterial(mat, roleInfo, settings = createAlphaSettings(), coverage = null) {
  if (usesAlphaBlend(mat, roleInfo, settings)) {
    return Math.max(mat?.alphaTest ?? settings.blendCutoff, settings.blendCutoff);
  }
  if (usesAlphaCutout(mat, roleInfo, settings, coverage)) {
    return Math.max(mat?.alphaTest ?? settings.cutoutCutoff, settings.cutoutCutoff);
  }
  return -1.0;
}

export function resolveAlphaForMaterial(settings, mat, roleInfo, coverage = null) {
  if (settings.enabled && mat && isDeclaredSoftBlend(settings, mat, coverage)) {
    return {
      alphaBlend: true,
      alphaCutout: false,
      alphaTest: settings.blendCutoff,
      coverage: ALPHA_COVERAGE_KINDS.soft,
      depthWrite: roleIsTransparentOverlay(roleInfo) ? settings.overlayDepthWrite : false,
      opacity: sourceOpacity(mat),
      textureAlpha: 1,
      transparent: true,
    };
  }
  const alphaBlend = usesAlphaBlend(mat, roleInfo, settings);
  const alphaCutout = usesAlphaCutout(mat, roleInfo, settings, coverage);
  // Packed data in the alpha channel must not modulate opacity either.
  const coverageVeto = coverageForbidsAlpha(settings, coverage);
  const ignoreTextureAlpha = coverageVeto && coverage.kind === ALPHA_COVERAGE_KINDS.data;
  // Opaque or data alpha on a fully opaque material leaves nothing to blend.
  const nothingTransparent = coverageVeto && sourceOpacity(mat) >= settings.transparentOpacityThreshold;

  return {
    alphaBlend,
    alphaCutout,
    alphaTest: alphaTestForMaterial(mat, roleInfo, settings, coverage),
    coverage: coverage?.kind ?? ALPHA_COVERAGE_KINDS.unknown,
    depthWrite: roleIsTransparentOverlay(roleInfo) ? settings.overlayDepthWrite : !alphaBlend,
    opacity: sourceOpacity(mat),
    textureAlpha: ignoreTextureAlpha ? 0 : 1,
    transparent: mat?.transparent === true && !alphaCutout && !nothingTransparent,
  };
}

export function materialAlphaDrawOrder(settings, mat, roleInfo) {
  if (!settings.sortOverlays) return 0;

  const text = materialText(mat);
  if (text.includes('白目') || roleInfo?.role === 'sclera') return settings.scleraOrder;
  if (roleInfo?.role === 'eye' || roleInfo?.role === 'iris' || roleInfo?.role === 'pupil') return settings.eyeOrder;
  if (roleInfo?.role === 'eyeHighlight' || roleInfo?.role === 'catchlight') return settings.eyeHighlightOrder;
  if (roleIsTransparentOverlay(roleInfo)) return settings.overlayOrder;
  return 0;
}
