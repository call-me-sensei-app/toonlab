import * as THREE from 'three';

export function toMaterialArray(material) {
  return (Array.isArray(material) ? material : [material]).filter(Boolean);
}

export function textureLabel(texture) {
  const image = texture?.image;
  return [
    texture?.name,
    image?.currentSrc,
    image?.src,
    image?.name,
  ].filter(Boolean).join(' ');
}

export function textureSourceUrl(texture) {
  const image = texture?.image;
  return image?.currentSrc || image?.src || '';
}

export function materialText(mat) {
  return [
    mat?.name,
    textureLabel(mat?.map),
    textureLabel(mat?.emissiveMap),
    textureLabel(mat?.alphaMap),
  ].filter(Boolean).join(' ').toLowerCase();
}

export function isUtilityTextureLabel(text) {
  return /(?:^|[_\-/])(lsab|smbe|normal|nrm|height|ao|mask|esa)(?:[_.?#\-/]|$)/i.test(text);
}

export function isFoliageMaterial(mat) {
  const text = materialText(mat);
  return (
    text.includes('leaf') ||
    text.includes('grass') ||
    text.includes('plant') ||
    text.includes('potted') ||
    text.includes('tree') ||
    text.includes('banana')
  );
}

export function sourceOpacity(mat) {
  return Number.isFinite(mat?.opacity) ? mat.opacity : 1;
}

export function usesAlphaCutout(mat) {
  const text = materialText(mat);
  return (
    (Number.isFinite(mat?.alphaTest) && mat.alphaTest > 0) ||
    Boolean(mat?.alphaMap) ||
    mat?.map?.transparent === true ||
    text.includes('leaf') ||
    text.includes('grass') ||
    text.includes('plant') ||
    text.includes('potted') ||
    text.includes('mask')
  );
}

export function alphaCutoffForMaterial(mat) {
  if (!usesAlphaCutout(mat)) return -1.0;
  if (isFoliageMaterial(mat)) return Math.max(mat?.alphaTest ?? 0.12, 0.08);
  return Math.max(mat?.alphaTest ?? 0.35, 0.35);
}

export function isEmissiveEnvironmentMaterial(mat) {
  const text = materialText(mat);
  return (
    Boolean(mat?.emissiveMap) ||
    text.includes('light') ||
    text.includes('lamp') ||
    text.includes('fire') ||
    text.includes('glow')
  );
}

export function materialBaseColor(mat, { baseMapWasUtility = false, resolvedDiffuseMap = false } = {}) {
  const color = mat?.color?.isColor ? mat.color.clone() : new THREE.Color(1, 1, 1);
  const strongestChannel = Math.max(color.r, color.g, color.b);
  if (isFoliageMaterial(mat) && strongestChannel < 0.14) {
    return resolvedDiffuseMap || !baseMapWasUtility
      ? new THREE.Color(1, 1, 1)
      : new THREE.Color(0.26, 0.36, 0.17);
  }

  return color;
}

export function isWindowCutoutMaterial(mat) {
  const text = materialText(mat);
  if (/(screen|curtain|blind|painting|banner|poster|floor|ceiling|pillar|chair|table|cup|plate|book|vase|plant|leaf|grass|tree)/i.test(text)) {
    return false;
  }

  return /(window|glass|pane|shutter)/i.test(text);
}

export function objectMaterialText(obj, materials) {
  return [
    obj?.name,
    obj?.parent?.name,
    ...materials.map((mat) => materialText(mat)),
  ].filter(Boolean).join(' ').toLowerCase();
}

export function isEnvironmentShadowMesh(obj, materials) {
  return /(?:^|[_\-\s])shadow\s*mesh(?:$|[_\-\s])|(?:^|[_\-\s])shadow(?:$|[_\-\s])/i
    .test(objectMaterialText(obj, materials));
}

export function isAoOverlayMaterial(mat) {
  return /(?:^|[_\-/])ao(?:[_.?#\-/]|$)|ambient.?occlusion/i.test(materialText(mat));
}

export function isEnvironmentAoOverlay(obj, materials) {
  const text = objectMaterialText(obj, materials);
  return /(?:^|[_\-\s])ao\d*(?:$|[_\-\s(])|mdbuild_ao/i.test(text) ||
    materials.some((mat) => isAoOverlayMaterial(mat));
}

// Explicit material roles. Heuristics above are the fallback for unlabeled
// packs; authors and integrators override them without renaming assets via:
//   1. userData.envRole on the material or mesh ('standard' opts out of all
//      heuristic special-casing),
//   2. conversion-time roleOverrides: [{ match: string|RegExp, role }] tested
//      against the material/object naming text.
export const ENVIRONMENT_MATERIAL_ROLES = Object.freeze([
  'standard',
  'foliage',
  'window',
  'emissive',
  'shadowMesh',
  'aoOverlay',
  'glossFloor',
]);

function normalizeEnvironmentRole(role) {
  return ENVIRONMENT_MATERIAL_ROLES.includes(role) ? role : null;
}

function roleFromOverrides(text, roleOverrides) {
  if (!Array.isArray(roleOverrides)) return null;
  for (const override of roleOverrides) {
    const match = override?.match;
    const role = normalizeEnvironmentRole(override?.role);
    if (!role || !match) continue;
    if (match instanceof RegExp ? match.test(text) : text.includes(String(match).toLowerCase())) {
      return role;
    }
  }
  return null;
}

// Resolves the effective role for one material on one object, and reports
// where the decision came from so misclassification is diagnosable:
// { role, source: 'userData' | 'override' | 'heuristic' | 'default' }.
export function classifyEnvironmentMaterialRole(obj, mat, { roleOverrides = null } = {}) {
  const explicit = normalizeEnvironmentRole(mat?.userData?.envRole)
    ?? normalizeEnvironmentRole(obj?.userData?.envRole);
  if (explicit) return { role: explicit, source: 'userData' };

  const text = objectMaterialText(obj, [mat]);
  const overridden = roleFromOverrides(text, roleOverrides);
  if (overridden) return { role: overridden, source: 'override' };

  const materials = [mat];
  if (isEnvironmentShadowMesh(obj, materials)) return { role: 'shadowMesh', source: 'heuristic' };
  if (isEnvironmentAoOverlay(obj, materials)) return { role: 'aoOverlay', source: 'heuristic' };
  if (isWindowCutoutMaterial(mat)) return { role: 'window', source: 'heuristic' };
  if (isFoliageMaterial(mat)) return { role: 'foliage', source: 'heuristic' };
  if (isEmissiveEnvironmentMaterial(mat)) return { role: 'emissive', source: 'heuristic' };
  return { role: 'standard', source: 'default' };
}
