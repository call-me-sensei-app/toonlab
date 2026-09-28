// THREE adapters for baked texture maps. Follows the repo texture
// conventions (src/debrisgen/debrisTextures.js): color-carrying maps are
// tagged SRGBColorSpace, data maps NoColorSpace, everything repeats and
// mipmaps. DataTexture needs an explicit needsUpdate on every write.

import * as THREE from 'three';

const MAP_COLOR_SPACES = Object.freeze({
  albedo: 'srgb',
  ao: 'data',
  emissive: 'srgb',
  heightBytes: 'data',
  metalness: 'data',
  normal: 'data',
  orm: 'data',
  roughness: 'data',
});

export const TEXTURE_THREE_MAP_IDS = Object.freeze(Object.keys(MAP_COLOR_SPACES));

function configure(texture, kind) {
  texture.colorSpace = kind === 'srgb' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Wraps every byte buffer of an evaluateTextureMaps() result in a
 * DataTexture. Pass a previous `textures` object to update in place —
 * buffers of an unchanged size are re-tagged with needsUpdate; a size
 * change disposes and recreates. Returns { textures, recreated }.
 */
export function syncTextureMapTextures(maps, textures = null) {
  const sizeChanged = !textures || textures.size !== maps.size;
  if (sizeChanged && textures) {
    for (const id of TEXTURE_THREE_MAP_IDS) textures[id]?.dispose();
  }
  const next = sizeChanged ? { size: maps.size } : textures;
  for (const [id, kind] of Object.entries(MAP_COLOR_SPACES)) {
    if (sizeChanged) {
      next[id] = configure(new THREE.DataTexture(maps[id], maps.size, maps.size, THREE.RGBAFormat), kind);
    } else {
      next[id].image.data = maps[id];
      next[id].needsUpdate = true;
    }
  }
  return { recreated: sizeChanged, textures: next };
}

/** Disposes every texture created by syncTextureMapTextures. */
export function disposeTextureMapTextures(textures) {
  if (!textures) return;
  for (const id of TEXTURE_THREE_MAP_IDS) textures[id]?.dispose();
}
