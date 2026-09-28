// Local character/environment asset discovery and the HUD asset catalogs.

import {
  buildLocalCharacterModelOptions,
  directoryFromPath,
  filenameFromPath,
  findLocalCharacterMaterialUrl,
  LOCAL_CHARACTER_ASSET_MANIFEST,
  LOCAL_ENVIRONMENT_ASSET_MANIFEST,
  normalizeAssetUrlPath,
  normalizeNameKey,
  slugifyAssetId,
  stripFileExtension,
  toTitleCaseLabel,
} from '../shared/localModelCatalog.js';
import { DEFAULT_MODEL_URL } from './modelDefaults.js';

export { normalizeAssetUrlPath };
export { DEFAULT_MODEL_URL };

// Default character = the bundled CC0 mannequin, so a fresh clone renders
// with zero private assets. Private test models (Ganyu et al.) live in the
// gitignored assets-local/ drop-in and surface in the HUD Model select once
// `npm run assets:local` has scanned them (see labs/shared/localModelCatalog.js).
const TEST_CHARACTER_MATERIAL_ASSET_PATHS = LOCAL_CHARACTER_ASSET_MANIFEST.materialPaths;
export const TEST_CHARACTER_TEXTURE_ASSET_PATHS = LOCAL_CHARACTER_ASSET_MANIFEST.texturePaths;
const TEST_ENVIRONMENT_BACKGROUND_ASSET_PATHS = LOCAL_ENVIRONMENT_ASSET_MANIFEST.backgroundPaths;
const TEST_ENVIRONMENT_MODEL_ASSET_PATHS = LOCAL_ENVIRONMENT_ASSET_MANIFEST.modelPaths;
export const TEST_ENVIRONMENT_TEXTURE_ASSET_PATHS = LOCAL_ENVIRONMENT_ASSET_MANIFEST.texturePaths;

const TEST_CHARACTER_MATERIAL_URLS = TEST_CHARACTER_MATERIAL_ASSET_PATHS
  .map(normalizeAssetUrlPath)
  .sort((a, b) => a.localeCompare(b));
const TEST_ENVIRONMENT_MODEL_URLS = TEST_ENVIRONMENT_MODEL_ASSET_PATHS
  .map(normalizeAssetUrlPath)
  .sort((a, b) => a.localeCompare(b));
const TEST_ENVIRONMENT_BACKGROUND_URLS = TEST_ENVIRONMENT_BACKGROUND_ASSET_PATHS
  .map(normalizeAssetUrlPath)
  .sort((a, b) => a.localeCompare(b));

// Default environment for the `?env=1` shortcut: the first discovered
// drop-in environment, or nothing on a tree with no assets-local/ content
// (main.js then falls back to loading the default character instead).
export const DEFAULT_ENVIRONMENT_URL = TEST_ENVIRONMENT_MODEL_URLS[0] ?? '';

function buildCharacterAssetOptions() {
  const discoveredOptions = buildLocalCharacterModelOptions()
    .map((entry) => ({
      format: entry.formatLabel,
      id: entry.id,
      label: entry.label,
      materialUrl: entry.format === 'obj'
        ? findLocalCharacterMaterialUrl(entry.modelUrl, entry.name)
        : null,
      modelUrls: [entry.modelUrl],
      name: entry.name,
    }))
    .filter((entry) => normalizeAssetUrlPath(entry.modelUrls[0]) !== normalizeAssetUrlPath(DEFAULT_MODEL_URL));

  return [
    ...discoveredOptions,
    {
      format: 'Demo',
      id: 'none',
      label: 'No Character',
      materialUrl: null,
      modelUrls: [],
      name: 'None',
    },
  ];
}

export const CHARACTER_ASSET_OPTIONS = buildCharacterAssetOptions();

function parseTestEnvironmentModelPath(sourcePath) {
  const modelUrl = normalizeAssetUrlPath(sourcePath);
  const segments = modelUrl.split('/').filter(Boolean);
  const collectionIndex = segments.findIndex((segment, index) => (
    (segment === 'tests' || segment === 'examples') &&
    segments[index - 1] === 'environments' &&
    segments[index - 2] === 'assets-local'
  ));
  if (collectionIndex === -1 || collectionIndex + 3 >= segments.length) return null;

  const collection = segments[collectionIndex];
  const kind = segments[collectionIndex + 1];
  const modelsIndex = segments.indexOf('models', collectionIndex + 2);
  if (!kind || modelsIndex === -1 || modelsIndex + 1 >= segments.length) return null;

  const scenePathSegments = segments.slice(collectionIndex + 2, modelsIndex);
  const sceneFolder = scenePathSegments.at(-1);
  const regionFolder = scenePathSegments.length > 1 ? scenePathSegments.at(-2) : null;
  if (!sceneFolder) return null;

  const filename = segments.at(-1);
  const fileBase = stripFileExtension(filename);
  const sceneRoot = segments.slice(0, modelsIndex).join('/');
  return {
    collection,
    fileBase,
    filename,
    kind: kind.toLowerCase(),
    kindLabel: toTitleCaseLabel(kind),
    modelUrl,
    name: toTitleCaseLabel(sceneFolder),
    region: regionFolder ? toTitleCaseLabel(regionFolder) : '',
    sceneFolder,
    sceneRoot,
  };
}

function environmentModelPriority(entry, group) {
  const fileKey = normalizeNameKey(entry.fileBase);
  const sceneKey = normalizeNameKey(entry.sceneFolder);
  if (fileKey === sceneKey) return 0;
  if (fileKey === 'model') return 1;
  if (/scene|environment|indoor|room|stage/.test(fileKey)) return 2;
  if (group.length === 1) return 3;
  if (/\.fbx$/i.test(entry.filename)) return 4;
  if (/\.(glb|gltf)$/i.test(entry.filename)) return 5;
  return 10;
}

function backdropPeriodFromFilename(url) {
  const key = normalizeNameKey(stripFileExtension(filenameFromPath(url)));
  if (/morning|dawn|sunrise/.test(key)) return 'morning';
  if (/evening|dusk|sunset/.test(key)) return 'evening';
  if (/night|moon|midnight/.test(key)) return 'night';
  if (/day|noon|afternoon/.test(key)) return 'day';
  return null;
}

function findEnvironmentBackdropUrls(sceneRoot) {
  const sceneBackgroundDirectory = `${sceneRoot}/backgrounds`;
  const regionRoot = directoryFromPath(sceneRoot);
  const regionBackgroundDirectory = regionRoot ? `${regionRoot}/backgrounds` : '';
  const regionScenePrefix = regionRoot ? `${regionRoot}/` : '';
  const urls = TEST_ENVIRONMENT_BACKGROUND_URLS
    .map((url) => {
      const directory = directoryFromPath(url);
      const priority = directory === sceneBackgroundDirectory
        ? 0
        : directory === regionBackgroundDirectory
          ? 1
          : regionScenePrefix && directory.startsWith(regionScenePrefix) && directory.endsWith('/backgrounds')
            ? 2
            : 99;
      return { priority, url };
    })
    .filter((entry) => entry.priority < 99)
    .sort((a, b) => a.priority - b.priority || a.url.localeCompare(b.url))
    .map((entry) => entry.url);
  const result = {};

  for (const url of urls) {
    const period = backdropPeriodFromFilename(url);
    if (period && !result[period]) result[period] = url;
  }

  if (!result.day && urls.length === 1) result.day = urls[0];
  return result;
}

function buildEnvironmentAssetOptions() {
  const groups = new Map();
  for (const entry of TEST_ENVIRONMENT_MODEL_URLS
    .map(parseTestEnvironmentModelPath)
    .filter(Boolean)) {
    const group = groups.get(entry.sceneRoot) ?? [];
    group.push(entry);
    groups.set(entry.sceneRoot, group);
  }

  const discoveredOptions = Array.from(groups.values())
    .map((group) => {
      const entry = [...group].sort((a, b) => (
        environmentModelPriority(a, group) - environmentModelPriority(b, group) ||
        a.modelUrl.localeCompare(b.modelUrl)
      ))[0];
      const backdropUrls = findEnvironmentBackdropUrls(entry.sceneRoot);
      return {
        backdropUrls,
        collection: entry.collection,
        format: entry.kindLabel,
        id: `environment-${slugifyAssetId(entry.sceneRoot)}`,
        label: `${entry.name} (${entry.kindLabel})`,
        modelUrl: entry.modelUrl,
        name: entry.name,
        view: entry.kind === 'indoor' ? 'interior' : 'exterior',
      };
    })
    .sort((a, b) => (
      Number(normalizeAssetUrlPath(b.modelUrl) === normalizeAssetUrlPath(DEFAULT_ENVIRONMENT_URL)) -
      Number(normalizeAssetUrlPath(a.modelUrl) === normalizeAssetUrlPath(DEFAULT_ENVIRONMENT_URL)) ||
      a.name.localeCompare(b.name) ||
      a.format.localeCompare(b.format)
    ));

  return [
    ...discoveredOptions,
    {
      backdropUrls: {},
      collection: 'Demo',
      format: 'Demo',
      id: 'none',
      label: 'No Environment',
      modelUrl: null,
      name: 'None',
      view: 'interior',
    },
  ];
}

export const ENVIRONMENT_ASSET_OPTIONS = buildEnvironmentAssetOptions();

export function normalizedUrlListKey(urls) {
  return urls
    .map((url) => normalizeAssetUrlPath(url).toLowerCase())
    .sort()
    .join('|');
}

export function clearEnvironmentBackdropParams(params) {
  for (const key of [
    'backdrop',
    'envBackdrop',
    'envBackdropDay',
    'envBackdropNoon',
    'envBackdropMorning',
    'envBackdropEvening',
    'envBackdropNight',
  ]) {
    params.delete(key);
  }
}

export function modelLabelFromUrl(url) {
  const cleanUrl = url.split(/[?#]/)[0];
  const fileName = cleanUrl.slice(cleanUrl.lastIndexOf('/') + 1) || cleanUrl;
  try {
    return decodeURIComponent(fileName);
  } catch {
    return fileName;
  }
}
