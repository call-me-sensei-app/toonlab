// Drop-in character model discovery, shared by every lab's character picker.
//
// `npm run assets:local` scans the gitignored assets-local/ folder into
// generated manifests (labs/shared/*.generated.js); this module turns the
// character manifest into picker entries. A model surfaces in the pickers
// when its path follows one of these conventions:
//
//   assets-local/models/<name>.<ext>                       loose file
//   assets-local/models/<character>/<character>.<ext>      drop-in folder
//   assets-local/models/<character>/model.<ext>            (alias main file)
//   assets-local/models/<character>/source/<main>.<ext>    packaged download
//   assets-local/models/tests/<FORMAT>/<character>/...     format test grid
//
// Sibling files (textures, .mtl, extra meshes) never become picker entries;
// they are listed in the manifest so loaders can resolve them. Documented for
// users in docs/characters.md ("Local drop-in folder").

const LOCAL_CHARACTER_ASSET_MODULES = import.meta.glob('/labs/shared/localCharacterAssets.generated.js', { eager: true });
const LOCAL_ENVIRONMENT_ASSET_MODULES = import.meta.glob('/labs/shared/localEnvironmentAssets.generated.js', { eager: true });

function firstGlobModule(modules) {
  return Object.values(modules ?? {})[0] ?? null;
}

function sanitizeLocalCharacterAssetManifest(module) {
  return {
    materialPaths: Array.isArray(module?.materialPaths) ? module.materialPaths : [],
    modelPaths: Array.isArray(module?.modelPaths) ? module.modelPaths : [],
    texturePaths: Array.isArray(module?.texturePaths) ? module.texturePaths : [],
  };
}

function sanitizeLocalEnvironmentAssetManifest(module) {
  return {
    backgroundPaths: Array.isArray(module?.backgroundPaths) ? module.backgroundPaths : [],
    modelPaths: Array.isArray(module?.modelPaths) ? module.modelPaths : [],
    texturePaths: Array.isArray(module?.texturePaths) ? module.texturePaths : [],
  };
}

export const LOCAL_CHARACTER_ASSET_MANIFEST =
  sanitizeLocalCharacterAssetManifest(firstGlobModule(LOCAL_CHARACTER_ASSET_MODULES));
export const LOCAL_ENVIRONMENT_ASSET_MANIFEST =
  sanitizeLocalEnvironmentAssetManifest(firstGlobModule(LOCAL_ENVIRONMENT_ASSET_MODULES));

export function safeDecodeUrlComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function normalizeAssetUrlPath(value) {
  return safeDecodeUrlComponent(String(value ?? ''))
    .split(/[?#]/)[0]
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
}

export function filenameFromPath(value) {
  const cleanPath = normalizeAssetUrlPath(value);
  return cleanPath.slice(cleanPath.lastIndexOf('/') + 1);
}

export function directoryFromPath(value) {
  const cleanPath = normalizeAssetUrlPath(value);
  const slashIndex = cleanPath.lastIndexOf('/');
  return slashIndex === -1 ? '' : cleanPath.slice(0, slashIndex);
}

export function stripFileExtension(value) {
  return String(value ?? '').replace(/\.[^.]+$/, '');
}

export function normalizeNameKey(value) {
  return safeDecodeUrlComponent(String(value ?? ''))
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

export function toTitleCaseLabel(value) {
  const words = safeDecodeUrlComponent(String(value ?? ''))
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  return words
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`)
    .join(' ') || 'Model';
}

export function slugifyAssetId(value) {
  return safeDecodeUrlComponent(String(value ?? ''))
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'asset';
}

function fileExtension(filename) {
  const dotIndex = String(filename ?? '').lastIndexOf('.');
  return dotIndex === -1 ? '' : filename.slice(dotIndex + 1).toLowerCase();
}

// Parse one manifest model path into { format, formatLabel, modelUrl, name },
// or null when the file is not a picker "main file" (see conventions above).
export function parseLocalCharacterModelPath(sourcePath) {
  const modelUrl = normalizeAssetUrlPath(sourcePath);
  const segments = modelUrl.split('/').filter(Boolean);
  const modelsIndex = segments.findIndex((segment, index) => (
    segment === 'models' && segments[index - 1] === 'assets-local'
  ));
  if (modelsIndex === -1 || modelsIndex + 1 >= segments.length) return null;

  const rest = segments.slice(modelsIndex + 1);
  const filename = rest.at(-1);
  const fileBase = stripFileExtension(filename);
  const fileKey = normalizeNameKey(fileBase);
  if (!filename || !fileKey) return null;

  // Test grid: assets-local/models/tests/<FORMAT>/<character>/...
  if (rest[0] === 'tests') {
    const format = rest[1];
    const testRest = rest.slice(2);
    if (!format || testRest.length === 0) return null;

    let characterNameSource = '';
    let isMainFile = false;

    if (testRest.length === 1 || testRest[0] === 'source') {
      characterNameSource = fileBase;
      isMainFile = true;
    } else {
      const characterFolder = testRest[0];
      const characterKey = normalizeNameKey(characterFolder);
      characterNameSource = characterFolder;

      if (testRest.length === 2) {
        isMainFile = fileKey === characterKey || fileKey === 'model';
      } else if (testRest.length === 3 && testRest[1] === 'source') {
        isMainFile = fileKey === characterKey || fileKey === 'model';
      }
    }

    if (!isMainFile || !characterNameSource) return null;
    return {
      format: format.toLowerCase(),
      formatLabel: format.toUpperCase(),
      modelUrl,
      name: toTitleCaseLabel(characterNameSource),
    };
  }

  // Drop-in: a loose file or a character folder directly under models/.
  const format = fileExtension(filename);
  if (!format) return null;

  let characterNameSource = '';
  let isMainFile = false;

  if (rest.length === 1) {
    characterNameSource = fileBase;
    isMainFile = true;
  } else {
    const characterFolder = rest[0];
    const characterKey = normalizeNameKey(characterFolder);
    characterNameSource = characterFolder;

    if (rest.length === 2) {
      isMainFile = fileKey === characterKey || fileKey === 'model';
    } else if (rest.length === 3 && rest[1] === 'source') {
      isMainFile = fileKey === characterKey || fileKey === 'model';
    }
  }

  if (!isMainFile || !characterNameSource) return null;
  return {
    format,
    formatLabel: format.toUpperCase(),
    modelUrl,
    name: toTitleCaseLabel(characterNameSource),
  };
}

// OBJ models need their MTL passed explicitly to the loader. Find the
// sibling material for a drop-in model: same directory, base name matching
// the model file / character name / "model", else the directory's only MTL.
export function findLocalCharacterMaterialUrl(modelUrl, characterName = '') {
  const modelDirectory = directoryFromPath(modelUrl);
  const modelBaseKey = normalizeNameKey(stripFileExtension(filenameFromPath(modelUrl)));
  const characterKey = normalizeNameKey(characterName);
  const materials = LOCAL_CHARACTER_ASSET_MANIFEST.materialPaths
    .map(normalizeAssetUrlPath)
    .filter((materialUrl) => directoryFromPath(materialUrl) === modelDirectory)
    .sort((a, b) => a.localeCompare(b));
  const preferred = materials.find((materialUrl) => {
    const materialBaseKey = normalizeNameKey(stripFileExtension(filenameFromPath(materialUrl)));
    return materialBaseKey === modelBaseKey || materialBaseKey === characterKey || materialBaseKey === 'model';
  });
  if (preferred) return preferred;
  return materials.length === 1 ? materials[0] : null;
}

// Every discovered drop-in model, ready for a picker: sorted, labeled, with a
// stable id derived from the model URL.
export function buildLocalCharacterModelOptions() {
  return LOCAL_CHARACTER_ASSET_MANIFEST.modelPaths
    .map(parseLocalCharacterModelPath)
    .filter(Boolean)
    .map((entry) => ({
      format: entry.format,
      formatLabel: entry.formatLabel,
      id: `character-${slugifyAssetId(entry.modelUrl)}`,
      label: `${entry.name} (${entry.formatLabel})`,
      materialUrl: entry.format === 'obj'
        ? findLocalCharacterMaterialUrl(entry.modelUrl, entry.name)
        : null,
      modelUrl: entry.modelUrl,
      name: entry.name,
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.formatLabel.localeCompare(b.formatLabel));
}
