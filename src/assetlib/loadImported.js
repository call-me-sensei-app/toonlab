// Three.js side of asset import: turn a saved import recipe (or a freshly
// resolved download) into a live object/material. The style pass stays the
// caller's job — the lab and worlds run applyEnvironmentShader (or
// applyToonShader for characters) over the result, exactly like procedural
// assets, so imports always render in the active style set.

import * as THREE from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

import { readZipEntries } from './zip.js';

/**
 * Load a (possibly multi-file) glTF whose companion files live at arbitrary
 * CDN URLs. `resources` maps the glTF's internal relative URIs to real URLs
 * (Poly Haven serves textures/bin outside the glTF's own directory); a
 * LoadingManager URL modifier rewrites each request by suffix match, which
 * also covers URL-encoded variants.
 */
export async function loadImportedModel({
  url,
  resources = {},
  dracoDecoderPath = '/draco/gltf/',
  ktx2TranscoderPath = '/basis/',
  renderer = null,
}) {
  const manager = new THREE.LoadingManager();
  const byPath = Object.entries(resources);
  manager.setURLModifier((requested) => {
    for (const [relativePath, remoteUrl] of byPath) {
      if (requested.endsWith(relativePath) || requested.endsWith(encodeURI(relativePath))) {
        return remoteUrl;
      }
    }
    return requested;
  });
  const loader = new GLTFLoader(manager);
  const dracoLoader = new DRACOLoader(manager);
  dracoLoader.setDecoderPath(dracoDecoderPath);
  loader.setDRACOLoader(dracoLoader);
  const ktx2Loader = renderer
    ? new KTX2Loader(manager)
      .setTranscoderPath(ktx2TranscoderPath)
      .detectSupport(renderer)
    : null;
  if (ktx2Loader) loader.setKTX2Loader(ktx2Loader);
  let gltf;
  try {
    gltf = await loader.loadAsync(url);
  } finally {
    dracoLoader.dispose();
    ktx2Loader?.dispose();
  }
  const object = gltf.scene ?? gltf.scenes?.[0];
  if (!object) throw new Error('loadImportedModel: glTF contained no scene.');
  object.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  return object;
}

/**
 * PBR texture-set maps → a tiling MeshStandardMaterial. Prefers the packed
 * `arm` map (occlusion-R / roughness-G / metalness-B — the glTF ORM layout
 * three samples those slots from); falls back to individual AO/Rough maps.
 */
export async function loadImportedTextureMaterial({ maps }, { repeat = 1 } = {}) {
  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin('anonymous');
  const load = async (slot, { srgb = false } = {}) => {
    if (!maps?.[slot]?.url) return null;
    const texture = await loader.loadAsync(maps[slot].url);
    texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeat, repeat);
    return texture;
  };
  const [diffuse, normal, arm, roughness, ao] = await Promise.all([
    load('diffuse', { srgb: true }),
    load('normal'),
    load('arm'),
    maps?.arm ? null : load('roughness'),
    maps?.arm ? null : load('ao'),
  ]);
  if (!diffuse) throw new Error('loadImportedTextureMaterial: texture set has no diffuse map.');
  const material = new THREE.MeshStandardMaterial({
    aoMap: arm ?? ao ?? null,
    map: diffuse,
    metalness: arm ? 1 : 0,
    metalnessMap: arm ?? null,
    normalMap: normal ?? null,
    roughness: 1,
    roughnessMap: arm ?? roughness ?? null,
  });
  return material;
}

// ambientCG archive entry names → material slots (Bricks097_1K-JPG_Color.jpg …)
const AMBIENTCG_MAP_PATTERNS = Object.freeze({
  ao: /_AmbientOcclusion\.(jpg|png)$/i,
  diffuse: /_Color\.(jpg|png)$/i,
  displacement: /_Displacement\.(jpg|png)$/i,
  normal: /_NormalGL\.(jpg|png)$/i,
  roughness: /_Roughness\.(jpg|png)$/i,
});

/**
 * An ambientCG ZIP download → tiling MeshStandardMaterial: fetch the archive
 * (through the backend/dev proxy in browsers — pass rewriteUrl), extract the
 * PBR maps in memory, and feed them to loadImportedTextureMaterial as
 * object-URLs (revoked once the textures are on the GPU).
 */
export async function loadAmbientcgTextureMaterial({ url }, { repeat = 1, rewriteUrl = (value) => value } = {}) {
  const response = await fetch(rewriteUrl(url));
  if (!response.ok) throw new Error(`loadAmbientcgTextureMaterial: ${response.status} for ${url}`);
  const entries = await readZipEntries(await response.arrayBuffer());
  const maps = {};
  const objectUrls = [];
  for (const [slot, pattern] of Object.entries(AMBIENTCG_MAP_PATTERNS)) {
    const entry = entries.find((candidate) => pattern.test(candidate.name));
    if (!entry) continue;
    const type = entry.name.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
    const objectUrl = URL.createObjectURL(new Blob([entry.data], { type }));
    objectUrls.push(objectUrl);
    maps[slot] = { url: objectUrl };
  }
  try {
    return await loadImportedTextureMaterial({ maps }, { repeat });
  } finally {
    for (const objectUrl of objectUrls) URL.revokeObjectURL(objectUrl);
  }
}

/**
 * The spawn snippet entry point: a saved import recipe → live content.
 *   model   → { kind: 'model', object3D }
 *   texture → { kind: 'texture', material }
 * Recipes store portable origin urls; browsers pass `rewriteUrl`
 * (e.g. rewriteAmbientcgDownloadUrl) to route zip fetches through the proxy.
 */
export async function loadImportedAsset(recipe, { repeat = 1, rewriteUrl = (value) => value } = {}) {
  if (recipe?.kind === 'model' && recipe.download) {
    return { kind: 'model', object3D: await loadImportedModel(recipe.download) };
  }
  if (recipe?.kind === 'texture' && recipe.textureSet) {
    return { kind: 'texture', material: await loadImportedTextureMaterial(recipe.textureSet, { repeat }) };
  }
  if (recipe?.kind === 'texture' && recipe.download?.url) {
    return { kind: 'texture', material: await loadAmbientcgTextureMaterial(recipe.download, { repeat, rewriteUrl }) };
  }
  throw new Error(`loadImportedAsset: unsupported recipe kind "${recipe?.kind}".`);
}
