import * as THREE from 'three';

import { booleanField, colorField, createGroupValues, numberField, textureField } from './fieldSchema.js';

// `maps` — the source material's own maps (spec §4.9, §5.11): normal, AO
// (moves pixels into shadow), emissive, matcap (metal), a tiling detail
// texture, roughness/metalness and a specular colour map. The adapter picks
// each map from the source material; these values scale them.

export const MAPS_GROUP = Object.freeze({
  description: 'Strengths of the source material\'s normal, AO, emissive, matcap, detail, roughness/metalness and specular colour maps.',
  id: 'maps',
  label: 'Material Maps',
});

export const MAPS_FIELDS = Object.freeze({
  enabled: booleanField(true, 'Use the source material\'s maps.'),
  normal: Object.freeze({
    strength: numberField(1, 0, 2, 'Normal map strength on the lighting normal.'),
    scale: numberField(1, 0, 4, 'Multiplier on the source material\'s own normal scale.'),
  }),
  ao: Object.freeze({
    strength: numberField(1, 0, 1, 'AO map strength; occluded texels move into the shadow tone.'),
  }),
  emissive: Object.freeze({
    color: colorField([1, 1, 1], 'Multiplier on the source emissive colour.'),
    strength: numberField(1, 0, 8, 'Emission strength.'),
  }),
  matcap: Object.freeze({
    strength: numberField(1, 0, 2, 'Matcap strength where a matcap texture is present (metal).'),
  }),
  detail: Object.freeze({
    map: textureField('A tiling detail texture multiplied into the albedo (also `userData.toonDetailMap`).'),
    repeat: numberField(8, 0.1, 128, 'Detail texture tiling.'),
    strength: numberField(0, 0, 1, 'Detail texture strength (mid-grey is neutral).'),
  }),
  roughness: Object.freeze({
    strength: numberField(0.5, 0, 1, 'How much a roughness map dims the specular highlight.'),
  }),
  metalness: Object.freeze({
    strength: numberField(1, 0, 1, 'How much a metalness map drives the matcap and tints the highlight with the albedo.'),
  }),
  specularColor: Object.freeze({
    strength: numberField(1, 0, 1, 'Specular colour map strength.'),
  }),
});

export function createMapsSettings(options = null) {
  return createGroupValues(MAPS_FIELDS, options);
}

export const DEFAULT_MAPS_SETTINGS = Object.freeze(createMapsSettings());

// Extra textures a source material can carry in userData, with the colour
// space each is authored in.
const USER_DATA_TEXTURES = Object.freeze([
  ['toonDetailMap', THREE.SRGBColorSpace],
  ['toonEmissiveMap', THREE.SRGBColorSpace],
  ['toonFaceShadowMap', THREE.NoColorSpace],
  ['toonMatcapMap', THREE.SRGBColorSpace],
  ['toonNormalMap', THREE.NoColorSpace],
  ['toonOutlineWidthMap', THREE.NoColorSpace],
  ['toonRampMap', THREE.SRGBColorSpace],
  ['toonRoleMask', THREE.NoColorSpace],
  ['toonRoleMaskMap', THREE.NoColorSpace],
  ['toonShadeMap', THREE.SRGBColorSpace],
  ['toonShadingGradeMap', THREE.NoColorSpace],
  ['toonGradeMap', THREE.NoColorSpace],
  ['toonSpecularColorMap', THREE.SRGBColorSpace],
  ['toonSpecularMaskMap', THREE.NoColorSpace],
  ['specularMaskMap', THREE.NoColorSpace],
  ['toonStickerMap', THREE.SRGBColorSpace],
  ['stickerMap', THREE.SRGBColorSpace],
]);

/** Textures a source material carries beyond three's standard slots. */
export function collectMaterialMapTextures(mat) {
  const found = [];
  const userData = mat?.userData ?? {};
  for (const [key, colorSpace] of USER_DATA_TEXTURES) {
    if (userData[key]?.isTexture) found.push({ colorSpace, key, texture: userData[key] });
  }
  return found;
}

function usable(texture) {
  const image = texture?.image;
  if (!texture?.isTexture || !image) return null;
  if (texture.isDataTexture || texture.isCompressedTexture) return image.data || texture.mipmaps?.length ? texture : null;
  return image.width || image.videoWidth || image.data ? texture : null;
}

// glTF/VRM emissive factors are authored; MMD's loader stores the model's
// ambient colour in `emissive`, which would light the whole character.
const AUTHORED_EMISSIVE_FORMATS = new Set(['gltf', 'glb', 'vrm']);

/**
 * Picks the maps a converted material uses from its source material.
 * Returns textures (or null) plus the scalar inputs that go with them.
 */
export function resolveMaterialMaps(settings, mat) {
  const enabled = settings?.enabled !== false;
  const userData = mat?.userData ?? {};
  const pick = (...candidates) => (enabled ? candidates.map(usable).find(Boolean) ?? null : null);
  const format = String(userData.toonSource?.format ?? '').toLowerCase();
  const emissiveMap = pick(mat?.emissiveMap, userData.toonEmissiveMap);
  const emissiveColor = mat?.emissive?.isColor ? mat.emissive.clone() : new THREE.Color(0, 0, 0);
  const emissiveIntensity = Number.isFinite(mat?.emissiveIntensity) ? mat.emissiveIntensity : 1;
  const authoredEmissive = AUTHORED_EMISSIVE_FORMATS.has(format) || mat?.isMToonMaterial || Boolean(emissiveMap);
  let emissive = enabled && authoredEmissive && Math.max(emissiveColor.r, emissiveColor.g, emissiveColor.b) * emissiveIntensity > 1e-4
    ? emissiveColor.multiplyScalar(emissiveIntensity)
    : null;
  // Formats whose emissive colour is not authored: a map alone emits as is.
  if (!emissive && emissiveMap && !AUTHORED_EMISSIVE_FORMATS.has(format) && !mat?.isMToonMaterial) {
    emissive = new THREE.Color(1, 1, 1).multiplyScalar(emissiveIntensity);
  }
  const normalScale = mat?.normalScale?.isVector2 ? Math.abs(mat.normalScale.x) : 1;
  return {
    aoMap: pick(mat?.aoMap),
    aoMapIntensity: Number.isFinite(mat?.aoMapIntensity) ? mat.aoMapIntensity : 1,
    detailMap: pick(settings?.detail?.map, userData.toonDetailMap),
    emissiveColor: emissive,
    emissiveMap: emissive || emissiveMap ? emissiveMap : null,
    matcapMap: pick(mat?.matcap, userData.toonMatcapMap),
    metalnessMap: pick(mat?.metalnessMap),
    metalness: Number.isFinite(mat?.metalness) ? mat.metalness : 0,
    normalMap: pick(mat?.normalMap, userData.toonNormalMap),
    normalScale,
    roughnessMap: pick(mat?.roughnessMap),
    specularColorMap: pick(mat?.specularColorMap, userData.toonSpecularColorMap),
  };
}
