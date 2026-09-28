import * as THREE from 'three';

import {
  createTextureSettings,
  disposeTextureMapTextures,
  evaluateTextureMaps,
  findTexturePreset,
  syncTextureMapTextures,
} from '../../../src/texgen/index.js';

const bakedMapCache = new Map();

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function addBoxProjectionUvs(geometry, { force = false } = {}) {
  if (!force && geometry.getAttribute('uv')) return;
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  if (!box || !position || !normal) return;
  const size = [
    Math.max(box.max.x - box.min.x, 1e-6),
    Math.max(box.max.y - box.min.y, 1e-6),
    Math.max(box.max.z - box.min.z, 1e-6),
  ];
  const uv = new Float32Array(position.count * 2);
  for (let index = 0; index < position.count; index += 1) {
    const nx = Math.abs(normal.getX(index));
    const ny = Math.abs(normal.getY(index));
    const nz = Math.abs(normal.getZ(index));
    if (nx >= ny && nx >= nz) {
      uv[index * 2] = (position.getZ(index) - box.min.z) / size[2];
      uv[(index * 2) + 1] = (position.getY(index) - box.min.y) / size[1];
    } else if (ny >= nx && ny >= nz) {
      uv[index * 2] = (position.getX(index) - box.min.x) / size[0];
      uv[(index * 2) + 1] = (position.getZ(index) - box.min.z) / size[2];
    } else {
      uv[index * 2] = (position.getX(index) - box.min.x) / size[0];
      uv[(index * 2) + 1] = (position.getY(index) - box.min.y) / size[1];
    }
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

async function bakedMapsForPreset(id) {
  if (!bakedMapCache.has(id)) {
    const preset = findTexturePreset(id);
    if (!preset) throw new Error(`Unknown Texture Lab material “${id}”.`);
    bakedMapCache.set(id, evaluateTextureMaps(createTextureSettings(preset.settings), { size: 256 })
      .catch((error) => {
        bakedMapCache.delete(id);
        throw error;
      }));
  }
  return bakedMapCache.get(id);
}

function applyMapsToMaterial(material, textures, surface) {
  if (!material) return;
  material.color?.set?.(0xffffff);
  material.map = textures.albedo;
  material.normalMap = textures.normal;
  material.roughnessMap = textures.roughness;
  material.roughness = clamp(Number(surface.pbrRoughness) || 0, 0, 1);
  material.normalScale?.setScalar?.(clamp(Number(surface.pbrNormalStrength) || 0, 0, 2));
  material.needsUpdate = true;
}

/**
 * Bakes and applies a selected Texture Lab PBR recipe to every mesh in a rock root.
 * Returns a disposer for the per-model GPU textures, or null when authored maps remain active.
 */
export async function applyRockPbrTexture(root, surface) {
  const presetId = String(surface?.pbrTexturePreset ?? 'none');
  if (!root || presetId === 'none') return null;
  const maps = await bakedMapsForPreset(presetId);
  const { textures } = syncTextureMapTextures(maps);
  const repeat = clamp(Number(surface.pbrTextureScale) || 1, 0.1, 20);
  for (const key of ['albedo', 'normal', 'roughness']) {
    textures[key].repeat.set(repeat, repeat);
    textures[key].needsUpdate = true;
  }
  root.traverse((object) => {
    if (!object.isMesh || !object.geometry) return;
    // Generated Texture Lab materials use a fresh projection for every
    // rebuilt sculpt result. Authored source materials keep their own UVs.
    addBoxProjectionUvs(object.geometry, { force: true });
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      applyMapsToMaterial(material, textures, surface);
    }
  });
  root.userData.toonlabRockPbrTexture = {
    normalStrength: clamp(Number(surface.pbrNormalStrength) || 0, 0, 2),
    presetId,
    roughness: clamp(Number(surface.pbrRoughness) || 0, 0, 1),
    scale: repeat,
  };
  return () => disposeTextureMapTextures(textures);
}
