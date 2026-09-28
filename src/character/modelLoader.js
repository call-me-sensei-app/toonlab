import { FileLoader, LoadingManager } from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { TGALoader } from 'three/examples/jsm/loaders/TGALoader.js';
import { USDZLoader } from 'three/examples/jsm/loaders/USDZLoader.js';
import { unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

export const SUPPORTED_MODEL_FORMATS = ['pmx', 'pmd', 'fbx', 'glb', 'gltf', 'vrm', 'obj', 'usdz'];

const BASE_URL = import.meta.env?.BASE_URL || '/';
const TEXT_DECODER_LABELS_FOR_MOJIBAKE = ['macintosh', 'windows-1252'];
const SOURCE_TEXT_ENCODINGS_FOR_MOJIBAKE = ['shift_jis', 'gbk', 'big5'];

const additionalModelTextureAssetPaths = new Set();
const textEncodeMaps = new Map();

function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeAssetPath(url) {
  const cleanUrl = stripUrlSuffix(String(url || '')).replace(/\\/g, '/');
  const withoutOrigin = cleanUrl.replace(/^[a-z]+:\/\/[^/]+/i, '');
  const basePath = BASE_URL === '/' ? '/' : BASE_URL;
  const withoutBase = withoutOrigin.startsWith(basePath)
    ? withoutOrigin.slice(basePath.length)
    : withoutOrigin;

  return safeDecodeURIComponent(withoutBase).replace(/^\/+/, '');
}

function unicodeNormalizationVariants(value) {
  const text = String(value ?? '');
  return [...new Set([
    text,
    text.normalize('NFC'),
    text.normalize('NFD'),
  ])];
}

function addUnicodeKeyVariants(map, key, value) {
  for (const variant of unicodeNormalizationVariants(key)) {
    if (variant) map.set(variant, value);
  }
}

function addPathVariant(map, path, resolvedPath) {
  const normalizedPath = normalizeAssetPath(path);
  addUnicodeKeyVariants(map, normalizedPath, resolvedPath);
}

function buildModelTextureAssetIndex() {
  const byPath = new Map();
  const byDirectory = new Map();

  for (const sourcePath of additionalModelTextureAssetPaths) {
    addPathVariant(byPath, sourcePath, sourcePath);

    const normalizedSourcePath = normalizeAssetPath(sourcePath);
    const slashIndex = normalizedSourcePath.lastIndexOf('/');
    if (slashIndex === -1) continue;

    const directory = normalizedSourcePath.slice(0, slashIndex);
    const filename = normalizedSourcePath.slice(slashIndex + 1);
    const files = byDirectory.get(directory) ?? new Map();
    // macOS commonly stores filenames in decomposed Unicode form. PMX files
    // and TextDecoder return composed characters, so index both forms. This
    // is especially important after repairing mojibaked Chinese filenames.
    addUnicodeKeyVariants(files, filename, sourcePath);
    byDirectory.set(directory, files);
  }

  return { byDirectory, byPath };
}

let MODEL_TEXTURE_ASSET_INDEX = buildModelTextureAssetIndex();

export function registerModelTextureAssetPaths(paths) {
  for (const path of paths ?? []) {
    if (path) additionalModelTextureAssetPaths.add(path);
  }
  MODEL_TEXTURE_ASSET_INDEX = buildModelTextureAssetIndex();
}

function stripUrlSuffix(url) {
  return url.split(/[?#]/)[0];
}

export function getModelFormat(url) {
  const cleanUrl = stripUrlSuffix(url).toLowerCase();
  const extension = cleanUrl.slice(cleanUrl.lastIndexOf('.') + 1);
  if (extension === 'pmx' || extension === 'pmd') return 'mmd';
  if (extension === 'fbx') return 'fbx';
  if (extension === 'glb' || extension === 'gltf') return 'gltf';
  if (extension === 'vrm') return 'vrm';
  if (extension === 'obj') return 'obj';
  if (extension === 'usdz') return 'usdz';
  return extension || 'unknown';
}

export function getResourcePath(url) {
  const cleanUrl = stripUrlSuffix(url);
  const slashIndex = cleanUrl.lastIndexOf('/');
  return slashIndex === -1 ? './' : cleanUrl.slice(0, slashIndex + 1);
}

function loadAsync(loader, url) {
  return new Promise((resolve, reject) => {
    loader.load(url, resolve, undefined, reject);
  });
}

function loadArrayBuffer(url, manager = undefined) {
  const loader = new FileLoader(manager);
  loader.setResponseType('arraybuffer');
  return loadAsync(loader, url);
}

async function loadMmdSupport() {
  try {
    return await import('three-stdlib');
  } catch (error) {
    throw new Error(
      'PMX/PMD loading requires the optional peer dependency "three-stdlib".',
      { cause: error },
    );
  }
}

async function loadVrmSupport() {
  try {
    return await import('@pixiv/three-vrm');
  } catch (error) {
    throw new Error(
      'VRM loading requires the optional peer dependency "@pixiv/three-vrm".',
      { cause: error },
    );
  }
}

function getTextEncodeMap(label) {
  const cachedMap = textEncodeMaps.get(label);
  if (cachedMap) return cachedMap;

  const encodeMap = new Map();

  let decoder;
  try {
    decoder = new TextDecoder(label);
  } catch {
    textEncodeMaps.set(label, encodeMap);
    return encodeMap;
  }

  function addDecodedBytes(bytes) {
    const decoded = decoder.decode(Uint8Array.from(bytes));
    if (!decoded || decoded.includes('\uFFFD') || encodeMap.has(decoded)) return;
    encodeMap.set(decoded, bytes);
  }

  for (let byte = 0x00; byte <= 0x7f; byte += 1) addDecodedBytes([byte]);
  for (let byte = 0x80; byte <= 0xff; byte += 1) addDecodedBytes([byte]);

  for (let lead = 0x81; lead <= 0xfe; lead += 1) {
    for (let trail = 0x40; trail <= 0xfe; trail += 1) {
      if (trail === 0x7f) continue;
      addDecodedBytes([lead, trail]);
    }
  }

  textEncodeMaps.set(label, encodeMap);
  return encodeMap;
}

function encodeText(value, label) {
  const encoderMap = getTextEncodeMap(label);
  const bytes = [];

  for (const char of value) {
    const encoded = encoderMap.get(char);
    if (!encoded) return null;
    bytes.push(...encoded);
  }

  return Uint8Array.from(bytes);
}

function decodeBytes(bytes, label) {
  try {
    return new TextDecoder(label).decode(bytes);
  } catch {
    return null;
  }
}

function getMojibakeFilenameCandidates(filename) {
  const candidates = [];

  for (const sourceEncoding of SOURCE_TEXT_ENCODINGS_FOR_MOJIBAKE) {
    const sourceBytes = encodeText(filename, sourceEncoding);
    if (!sourceBytes) continue;

    for (const brokenEncoding of TEXT_DECODER_LABELS_FOR_MOJIBAKE) {
      const candidate = decodeBytes(sourceBytes, brokenEncoding);
      if (candidate && candidate !== filename && !candidates.includes(candidate)) {
        candidates.push(candidate);
      }
    }
  }

  return candidates;
}

function resolveKnownModelAssetUrl(url) {
  const normalizedPath = normalizeAssetPath(url);
  const exactAssetUrl = MODEL_TEXTURE_ASSET_INDEX.byPath.get(normalizedPath);
  if (exactAssetUrl) return exactAssetUrl;

  const slashIndex = normalizedPath.lastIndexOf('/');
  if (slashIndex === -1) return null;

  const directory = normalizedPath.slice(0, slashIndex);
  const filename = normalizedPath.slice(slashIndex + 1);
  const files = MODEL_TEXTURE_ASSET_INDEX.byDirectory.get(directory);
  if (!files) return null;

  for (const candidate of getMojibakeFilenameCandidates(filename)) {
    for (const variant of unicodeNormalizationVariants(candidate)) {
      const assetUrl = files.get(variant);
      if (assetUrl) return assetUrl;
    }
  }

  return null;
}

function createModelLoadingManager() {
  const manager = new LoadingManager();

  manager.setURLModifier((url) => {
    return resolveKnownModelAssetUrl(url) ?? url;
  });
  // FBX and OBJ exports from Max/Maya commonly reference TGA textures, which
  // the browser's image decoder cannot read.
  manager.addHandler(/\.tga$/i, new TGALoader(manager));

  return manager;
}

function isBinaryUsdFile(bytes) {
  const header = new Uint8Array(bytes.buffer, bytes.byteOffset, Math.min(bytes.byteLength, 8));
  const crateHeader = [0x50, 0x58, 0x52, 0x2d, 0x55, 0x53, 0x44, 0x43];
  return crateHeader.every((value, index) => header[index] === value);
}

function validateUsdzBuffer(buffer, url) {
  const zip = unzipSync(new Uint8Array(buffer));
  const usdEntries = Object.entries(zip).filter(([filename]) => /\.(usd|usda|usdc)$/i.test(filename));

  if (usdEntries.length === 0) {
    throw new Error(`USDZ file ${url} does not contain a USD scene file.`);
  }

  const firstUsdEntry = usdEntries[0];
  const [filename, bytes] = firstUsdEntry;
  const isCrate = /\.usdc$/i.test(filename) || (/\.usd$/i.test(filename) && isBinaryUsdFile(bytes));

  if (isCrate) {
    throw new Error(`USDZ file ${url} uses binary USDC/crate data (${filename}). Three.js USDZLoader only supports text USDA/USD scenes.`);
  }
}

export function createModelAssetTranscoders({ decoderBasePath, renderer = null } = {}) {
  if (!decoderBasePath) {
    throw new TypeError('createModelAssetTranscoders requires decoderBasePath.');
  }
  const normalizedDecoderBasePath = decoderBasePath.endsWith('/')
    ? decoderBasePath
    : `${decoderBasePath}/`;
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath(`${normalizedDecoderBasePath}draco/`);
  const ktx2Loader = renderer ? new KTX2Loader() : null;
  if (ktx2Loader) {
    ktx2Loader.setTranscoderPath(`${normalizedDecoderBasePath}basis/`);
    ktx2Loader.detectSupport(renderer);
  }
  return {
    dispose() {
      dracoLoader.dispose();
      ktx2Loader?.dispose();
    },
    dracoLoader,
    ktx2Loader,
    meshoptDecoder: MeshoptDecoder,
  };
}

function configureGltfLoader(loader, {
  decoderBasePath = null,
  renderer = null,
  transcoders = null,
} = {}) {
  if (transcoders) {
    loader.setMeshoptDecoder(transcoders.meshoptDecoder ?? MeshoptDecoder);
    if (transcoders.dracoLoader) loader.setDRACOLoader(transcoders.dracoLoader);
    if (transcoders.ktx2Loader) loader.setKTX2Loader(transcoders.ktx2Loader);
    return;
  }
  loader.setMeshoptDecoder(MeshoptDecoder);

  if (!decoderBasePath) return;

  const normalizedDecoderBasePath = decoderBasePath.endsWith('/')
    ? decoderBasePath
    : `${decoderBasePath}/`;

  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath(`${normalizedDecoderBasePath}draco/`);
  loader.setDRACOLoader(dracoLoader);

  if (renderer) {
    const ktx2Loader = new KTX2Loader();
    ktx2Loader.setTranscoderPath(`${normalizedDecoderBasePath}basis/`);
    ktx2Loader.detectSupport(renderer);
    loader.setKTX2Loader(ktx2Loader);
  }
}

// Records the source format on every material so conversion can apply the
// format's colour semantics (glTF records more detail itself).
function tagMaterialSourceFormat(root, format) {
  root?.traverse?.((obj) => {
    if (!obj.isMesh || !obj.material) return;
    for (const material of toMaterialArray(obj.material)) {
      if (!material || material.userData?.toonSource?.format) continue;
      material.userData.toonSource = { ...(material.userData.toonSource || {}), format };
    }
  });
}

function createModelAsset({ clips = [], format, materialUrl = null, resourcePath, root, url, vrm = null }) {
  tagMaterialSourceFormat(root, format);
  return {
    clips,
    format,
    materialUrl,
    resourcePath,
    root,
    url,
    vrm,
  };
}

function toMaterialArray(material) {
  if (!material) return [];
  return Array.isArray(material) ? material : [material];
}

function annotateGltfSourceMetadata(gltf, url) {
  const parser = gltf?.parser;
  const json = parser?.json;
  const associations = parser?.associations;
  if (!json || !associations || !gltf?.scene) return;

  const materials = new Set();
  gltf.scene.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    for (const material of toMaterialArray(obj.material)) materials.add(material);
  });

  for (const material of materials) {
    const association = associations.get(material);
    const materialIndex = association?.materials;
    if (!Number.isInteger(materialIndex)) continue;

    const materialDef = json.materials?.[materialIndex] || {};
    const baseColorTextureIndex = materialDef.pbrMetallicRoughness?.baseColorTexture?.index;
    const textureDef = Number.isInteger(baseColorTextureIndex)
      ? json.textures?.[baseColorTextureIndex]
      : null;
    const imageIndex = Number.isInteger(textureDef?.source) ? textureDef.source : null;
    const imageDef = Number.isInteger(imageIndex) ? json.images?.[imageIndex] : null;
    const textureName = textureDef?.name || '';
    const imageName = imageDef?.name || '';
    const imageUri = imageDef?.uri || '';

    material.userData.toonSource = {
      ...(material.userData.toonSource || {}),
      alphaMode: materialDef.alphaMode || 'OPAQUE',
      baseColorTextureIndex: Number.isInteger(baseColorTextureIndex) ? baseColorTextureIndex : null,
      format: 'gltf',
      imageCount: json.images?.length ?? 0,
      imageIndex,
      imageName,
      imageUri,
      materialIndex,
      materialName: materialDef.name || '',
      sourceUrl: url,
      textureName,
    };

    if (material.map) {
      material.map.userData.sourceName = textureName || imageName || '';
      material.map.userData.sourceUri = imageUri || '';
      material.map.userData.gltfImageName = imageName || '';
      material.map.userData.gltfImageUri = imageUri || '';
    }
  }
}

// Records on each MMD toon ramp (material.gradientMap) its file and whether it
// is one of MMD's shared toon01–10 presets or a ramp the model's author
// shipped: only authored ramps are imported as the material's shadow tone.
// Wraps three-stdlib's material builder; without it ramps simply stay
// unimported.
function tagMmdToonTextures(loader) {
  const materialBuilder = loader.meshBuilder?.materialBuilder;
  const loadTexture = materialBuilder?._loadTexture;
  if (typeof loadTexture !== 'function') return;
  materialBuilder._loadTexture = function loadTaggedTexture(filePath, textures, params, ...rest) {
    const texture = loadTexture.call(this, filePath, textures, params, ...rest);
    if (params?.isToonTexture && texture?.isTexture) {
      texture.userData.mmdToon = { file: String(filePath ?? ''), shared: params.isDefaultToonTexture === true };
    }
    return texture;
  };
}

export async function loadModelAsset(url, {
  decoderBasePath = null,
  materialUrl = null,
  renderer = null,
  transcoders = null,
} = {}) {
  const format = getModelFormat(url);
  const resourcePath = getResourcePath(url);
  const manager = createModelLoadingManager();

  if (format === 'mmd') {
    const { MMDLoader } = await loadMmdSupport();
    const loader = new MMDLoader(manager);
    loader.setResourcePath(resourcePath);
    tagMmdToonTextures(loader);
    const root = await loadAsync(loader, url);

    return createModelAsset({
      clips: root.animations || [],
      format: 'mmd',
      resourcePath,
      root,
      url,
    });
  }

  if (format === 'fbx') {
    const loader = new FBXLoader(manager);
    loader.setResourcePath(resourcePath);
    const root = await loadAsync(loader, url);

    return createModelAsset({
      clips: root.animations || [],
      format,
      resourcePath,
      root,
      url,
    });
  }

  if (format === 'gltf' || format === 'vrm') {
    const loader = new GLTFLoader(manager);
    loader.setResourcePath(resourcePath);
    configureGltfLoader(loader, { decoderBasePath, renderer, transcoders });
    let vrmUtils = null;
    if (format === 'vrm') {
      const { VRMLoaderPlugin, VRMUtils } = await loadVrmSupport();
      loader.register((parser) => new VRMLoaderPlugin(parser));
      vrmUtils = VRMUtils;
    }
    const gltf = await loadAsync(loader, url);
    annotateGltfSourceMetadata(gltf, url);

    const vrm = gltf.userData?.vrm ?? null;
    if (vrm) {
      // VRM0 models face +Z after this, matching VRM1/three convention. The
      // turn is a 180° rotation on the root itself, so in the root's own frame
      // a VRM0 character faces −Z; record that for head-frame consumers
      // (automatic roles, the face shadow bake, head tracking).
      vrmUtils.rotateVRM0(vrm);
      if (vrm.meta?.metaVersion === '0') gltf.scene.userData.toonForward = [0, 0, -1];
      // Clips animate the raw scene bones directly; without this vrm.update()
      // would overwrite them from the untouched normalized rig every frame.
      vrm.humanoid.autoUpdateHumanBones = false;
    }

    return createModelAsset({
      clips: gltf.animations || [],
      format: vrm ? 'vrm' : 'gltf',
      resourcePath,
      root: gltf.scene,
      url,
      vrm,
    });
  }

  if (format === 'obj') {
    const loader = new OBJLoader(manager);
    loader.setResourcePath(resourcePath);

    if (materialUrl) {
      const materialResourcePath = getResourcePath(materialUrl);
      const mtlLoader = new MTLLoader(manager);
      mtlLoader.setResourcePath(materialResourcePath);
      const materials = await loadAsync(mtlLoader, materialUrl);
      materials.preload();
      loader.setMaterials(materials);
    }

    const root = await loadAsync(loader, url);

    return createModelAsset({
      clips: root.animations || [],
      format,
      materialUrl,
      resourcePath,
      root,
      url,
    });
  }

  if (format === 'usdz') {
    const loader = new USDZLoader();
    const buffer = await loadArrayBuffer(url, manager);
    validateUsdzBuffer(buffer, url);
    const root = loader.parse(buffer);

    return createModelAsset({
      format,
      resourcePath,
      root,
      url,
    });
  }

  throw new Error(`Unsupported model format for ${url}. Supported formats: ${SUPPORTED_MODEL_FORMATS.join(', ')}.`);
}
