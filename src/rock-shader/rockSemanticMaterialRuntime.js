import {
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
} from 'three';

export const ROCK_MATERIAL_BINDING_SCHEMA = 'toonlab.rock-material-binding';
export const ROCK_SEMANTIC_MATERIAL_SET_SCHEMA = 'toonlab.rock-semantic-material-set';

const jsonPromises = new Map();
const texturePromises = new Map();

function absoluteUrl(value, base) {
  const fallback = globalThis.location?.href ?? 'http://toonlab.invalid/';
  return new URL(String(value), new URL(String(base), fallback)).href;
}

async function loadJson(url, fetchImpl) {
  if (!jsonPromises.has(url)) {
    const promise = fetchImpl(url).then(async (response) => {
      if (!response.ok) throw new Error(`Rock material dependency is unavailable (${response.status}): ${url}`);
      return response.json();
    }).catch((error) => {
      jsonPromises.delete(url);
      throw error;
    });
    jsonPromises.set(url, promise);
  }
  return jsonPromises.get(url);
}

function configureTexture(map, descriptor) {
  map.name = `ToonLab shared rock texture ${descriptor.hash}`;
  map.colorSpace = descriptor.colorSpace === 'srgb' ? SRGBColorSpace : NoColorSpace;
  map.flipY = false;
  map.wrapS = RepeatWrapping;
  map.wrapT = RepeatWrapping;
  map.magFilter = LinearFilter;
  map.minFilter = LinearMipmapLinearFilter;
  map.generateMipmaps = true;
  map.userData.toonlabContentHash = descriptor.hash;
  map.userData.toonLabImportSettings = {
    colorSpace: descriptor.colorSpace,
    flipGreenChannel: Boolean(descriptor.flipGreenChannel),
    textureFlipY: false,
  };
  map.needsUpdate = true;
  return map;
}

async function loadTexture(url, descriptor, textureLoader) {
  const key = `${descriptor.hash}|${url}`;
  if (!texturePromises.has(key)) {
    const promise = textureLoader.loadAsync(url)
      .then((map) => configureTexture(map, descriptor))
      .catch((error) => {
        texturePromises.delete(key);
        throw error;
      });
    texturePromises.set(key, promise);
  }
  return texturePromises.get(key);
}

const RUNTIME_TEXTURE_ROLES = Object.freeze({
  grassAlbedo: 'grass',
  grassBaseColor: 'grassBaseColor',
  grassRoughness: 'grassRoughness',
  mossPattern: 'moss',
  noise: 'noise',
  primaryAlbedo: 'rock',
  primaryNormal: 'rockNormal',
  primarySmoothness: 'smoothness',
  sandAlbedo: 'sand',
  sandNormal: 'sandNormal',
  snowAlbedo: 'snow',
  stripe: 'stripe',
  stylizedNormal: 'stylizedNormal',
  topMask: 'topMask',
});

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, finite(value, minimum)));
}

function multiplyColor(value, gain, maximum = 2) {
  const source = Array.isArray(value) ? value : [1, 1, 1];
  const multiplier = Array.isArray(gain) ? gain : [1, 1, 1];
  return source.slice(0, 3).map((channel, index) => clamp(
    finite(channel, 1) * finite(multiplier[index], 1),
    0,
    maximum,
  ));
}

function sourceProfileForRuntime(set, binding) {
  const source = structuredClone(set.profile);
  const variation = binding.materialVariation ?? {};
  source.id = set.id;
  source.sourceName = `semantic-set:${set.id}`;
  source.sourcePath = null;
  source.sourceGuid = set.id;
  source.base ??= {};
  source.base.tint = multiplyColor(source.base.tint, variation.colorGain);
  source.base.brightness = clamp(
    finite(source.base.brightness, 0) + finite(variation.brightnessOffset, 0),
    -1,
    1,
  );
  source.base.saturation = clamp(
    finite(source.base.saturation, 1) * finite(variation.saturationGain, 1),
    0,
    2,
  );
  source.base.contrast = clamp(
    finite(source.base.contrast, 1) * finite(variation.contrastGain, 1),
    0,
    3,
  );
  source.base.scale = clamp(
    finite(source.base.scale, 1.6) * finite(variation.projectionScaleGain, 1),
    0.05,
    256,
  );
  source.base.projectionContrast = clamp(
    finite(source.base.projectionContrast, 0.62) * finite(variation.projectionBlendGain, 1),
    0.05,
    4,
  );
  const sourceRoughness = 1 - Number(source.base.smoothness ?? 0);
  source.base.smoothness = 1 - Math.min(1, Math.max(
    0,
    sourceRoughness * finite(variation.roughnessGain, 1),
  ));
  source.base.metallic = Math.min(1, Math.max(
    0,
    Number(source.base.metallic ?? 0) * finite(variation.metallicGain, 1),
  ));
  source.layers ??= {};
  source.layers.maskEnabled = Number(source.layerMask?.semanticMaskStrength ?? 0) > 0;
  source.layers.sharpness = clamp(
    finite(source.layerMask?.sharpness, 0.8) * finite(variation.layerSharpnessGain, 1),
    0,
    8,
  );
  source.layers.offset = clamp(
    finite(source.layerMask?.offset, 0.3) + finite(variation.layerSlopeOffset, 0),
    -1,
    1,
  );
  const sourceHeightStart = finite(source.layerMask?.heightStart, 0.48);
  const sourceHeightEnd = finite(source.layerMask?.heightEnd, 0.88);
  const heightShift = clamp(
    finite(variation.layerHeightOffset, 0),
    -sourceHeightStart,
    1 - sourceHeightEnd,
  );
  source.layers.heightStart = sourceHeightStart + heightShift;
  source.layers.heightEnd = sourceHeightEnd + heightShift;
  source.layers.cavityStrength = Number(source.layerMask?.cavityStrength ?? 0);
  source.layers.exposureStrength = Number(source.layerMask?.exposureStrength ?? 0);
  source.layers.semanticMaskStrength = Number(source.layerMask?.semanticMaskStrength ?? 0);
  for (const role of ['grass', 'snow', 'sand']) {
    source.layers[role] = { ...(source.layers[role] ?? {}) };
    source.layers[role].scale = clamp(
      finite(source.layers[role].scale, 1) * finite(variation.layerScaleGain, 1),
      0.05,
      50,
    );
    source.layers[role].tint = multiplyColor(
      source.layers[role].tint,
      variation.layerTintGain,
    );
  }
  source.layers.sand.normalScale = clamp(
    finite(source.layers.sand.normalScale, source.layers.sand.scale)
      * finite(variation.layerScaleGain, 1),
    0.05,
    50,
  );
  source.moss ??= {};
  source.moss.size = Math.max(
    0.000001,
    finite(source.moss.size, 25) * finite(variation.mossScaleGain, 1),
  );
  source.moss.offset = finite(source.moss.offset, -0.15)
    + finite(variation.mossCoverageOffset, 0);
  source.base.striping = { ...(source.striping ?? {}), ...(source.base.striping ?? {}) };
  return source;
}

function bindingMaterials(root) {
  const materials = new Set();
  root?.traverse?.((object) => {
    if (!object?.isMesh) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (material?.userData?.toonlabRockMaterialBinding) materials.add(material);
    }
  });
  return [...materials];
}

function restoreSemanticMaskAttributeNames(root) {
  root?.traverse?.((object) => {
    if (!object?.isMesh) return;
    const bound = (Array.isArray(object.material) ? object.material : [object.material])
      .some((material) => material?.userData?.toonlabRockMaterialBinding);
    if (!bound) return;
    for (const name of ['rockCavity', 'rockExposure', 'rockHeight']) {
      const exportedName = `_${name.toLowerCase()}`;
      const attribute = object.geometry?.getAttribute(name)
        ?? object.geometry?.getAttribute(exportedName);
      if (!attribute) {
        throw new Error(`${object.name || 'Semantic rock mesh'} is missing required ${name} data.`);
      }
      if (!object.geometry.getAttribute(name)) object.geometry.setAttribute(name, attribute);
    }
  });
}

/**
 * Resolves every fail-closed GLB material binding before the asset is exposed.
 * Throws on any missing manifest, set, or source texture; there is no fallback.
 *
 * @param {import('three').Object3D} root
 * @param {{
 *   fetchImpl?: typeof globalThis.fetch,
 *   modelUrl?: string | URL,
 *   textureLoader?: TextureLoader,
 * }} [options]
 * @returns {Promise<{ materialSets: number, textures: number }>}
 */
export async function prepareRockSemanticMaterialBindings(root, {
  fetchImpl = globalThis.fetch?.bind(globalThis),
  modelUrl,
  textureLoader = new TextureLoader(),
} = {}) {
  const materials = bindingMaterials(root);
  if (materials.length === 0) return { materialSets: 0, textures: 0 };
  // glTF reserves custom vertex semantics with an underscore and GLTFLoader
  // exposes them lower-cased. Publish the shader-facing aliases only after a
  // semantic binding is identified, and fail rather than inventing masks.
  restoreSemanticMaskAttributeNames(root);
  if (typeof fetchImpl !== 'function') throw new Error('Semantic rock materials require fetch().');
  if (!modelUrl) throw new Error('Semantic rock materials require the geometry model URL.');

  const loadedHashes = new Set();
  const loadedSets = new Set();
  for (const material of materials) {
    const binding = material.userData.toonlabRockMaterialBinding;
    if (binding.schema !== ROCK_MATERIAL_BINDING_SCHEMA || binding.failClosed !== true) {
      throw new Error('Rock geometry contains an invalid or non-fail-closed material binding.');
    }
    const manifestUrl = absoluteUrl(binding.manifest, modelUrl);
    const manifest = await loadJson(manifestUrl, fetchImpl);
    if (manifest.schema !== 'toonlab.rock-semantic-material-library') {
      throw new Error(`Invalid semantic rock material library: ${manifestUrl}`);
    }
    const descriptor = manifest.sets?.find((entry) => entry.id === binding.materialSetId);
    if (!descriptor) throw new Error(`Rock material set ${binding.materialSetId} is absent.`);
    const setUrl = absoluteUrl(descriptor.file, manifestUrl);
    const set = await loadJson(setUrl, fetchImpl);
    if (set.schema !== ROCK_SEMANTIC_MATERIAL_SET_SCHEMA || set.id !== binding.materialSetId) {
      throw new Error(`Rock material set ${binding.materialSetId} failed identity validation.`);
    }
    const textures = {};
    const semanticTextures = {
      ...(set.semanticTextures ?? {}),
      ...(binding.semanticTextureOverrides ?? {}),
    };
    for (const [semanticRole, textureDescriptor] of Object.entries(semanticTextures)) {
      const runtimeRole = RUNTIME_TEXTURE_ROLES[semanticRole];
      if (!runtimeRole) continue;
      if (!textureDescriptor?.hash || !textureDescriptor?.file) {
        throw new Error(`${set.id}/${semanticRole} has no content-addressed source texture.`);
      }
      const libraryTexture = manifest.textures?.find((entry) => entry.hash === textureDescriptor.hash);
      if (
        !libraryTexture
        || libraryTexture.file !== textureDescriptor.file
        || libraryTexture.colorSpace !== textureDescriptor.colorSpace
        || Boolean(libraryTexture.normalMap) !== Boolean(textureDescriptor.normalMap)
      ) {
        throw new Error(`${set.id}/${semanticRole} is not registered by the material library.`);
      }
      const textureUrl = absoluteUrl(textureDescriptor.file, manifestUrl);
      textures[runtimeRole] = await loadTexture(textureUrl, textureDescriptor, textureLoader);
      loadedHashes.add(textureDescriptor.hash);
    }
    if (!textures.rock?.isTexture) throw new Error(`${set.id} has no primary rock albedo.`);
    material.userData.toonlabRockSemanticMaterial = Object.freeze({
      binding: structuredClone(binding),
      materialSetId: set.id,
      profile: sourceProfileForRuntime(set, binding),
      sourceChannels: structuredClone(set.sourceChannels ?? {}),
      textures: Object.freeze(textures),
    });
    // The serialized descriptor is invisible so an unresolved asset cannot
    // masquerade as a usable material. Once every dependency has loaded and
    // validated, make the transient live descriptor opaque so strict scene
    // material auditing can hand it to the rock adapter. It is replaced before
    // the acquired asset enters a rendered scene.
    material.opacity = 1;
    material.transparent = false;
    material.depthWrite = true;
    material.needsUpdate = true;
    loadedSets.add(set.id);
  }
  return { materialSets: loadedSets.size, textures: loadedHashes.size };
}

/** Preserves cache-owned Texture instances when official assets clone materials. */
export function copyRockSemanticMaterialBinding(source, target) {
  const semantic = source?.userData?.toonlabRockSemanticMaterial;
  if (semantic) target.userData.toonlabRockSemanticMaterial = semantic;
  return target;
}

export function rockSemanticMaterialTextures(material) {
  return material?.userData?.toonlabRockSemanticMaterial?.textures ?? null;
}

export function clearRockSemanticMaterialCaches({ disposeTextures = false } = {}) {
  if (disposeTextures) {
    for (const promise of texturePromises.values()) promise.then((texture) => texture.dispose()).catch(() => {});
  }
  texturePromises.clear();
  jsonPromises.clear();
}
