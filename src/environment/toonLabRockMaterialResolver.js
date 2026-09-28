// Cross-engine identity bridge for the licensed ToonLab rock materials.
//
// ToonLab and ToonLab ship the same meshes with different material identifiers:
// ToonLab generally uses MI_* object paths, ToonLab uses MV_* material variants,
// and the FBX slots frequently retain a third M_* name. Keep this lookup
// separate from both shader math and source extraction so neither renderer has
// to branch on engine-specific names.

export const TOONLAB_ROCK_MATERIAL_LIBRARY_SCHEMA =
  'toonlab.rock-material-library';

export const TOONLAB_ROCK_MATERIAL_LIBRARY_SCHEMA_VERSION = 1;

export const DEFAULT_TOONLAB_ROCK_MATERIAL_LIBRARY_URL = null;

export function normalizeToonLabRockMaterialLibrarySchema(schema) {
  if (schema === TOONLAB_ROCK_MATERIAL_LIBRARY_SCHEMA) {
    return TOONLAB_ROCK_MATERIAL_LIBRARY_SCHEMA;
  }
  if (typeof schema !== 'string') return null;

  const prefix = 'toonlab.';
  const suffix = '.rock-material-library';
  if (!schema.startsWith(prefix) || !schema.endsWith(suffix)) return null;

  const producerNamespace = schema.slice(prefix.length, -suffix.length);
  if (!/^[a-z0-9-]+(?:\.[a-z0-9-]+)*$/u.test(producerNamespace)) return null;

  // Extractors may qualify this stable v1 contract with their producer
  // namespace. Normalize that transport detail at the boundary while keeping
  // the schema version and full payload validation below authoritative.
  return TOONLAB_ROCK_MATERIAL_LIBRARY_SCHEMA;
}

// The extractor deliberately stores paths relative to the ToonLab package
// root (not ToonLab's project-level `Assets/ToonLab` prefix). Keeping the
// descriptors in the same namespace lets asset paths be compared directly and
// keeps the manifest portable when the package is mounted elsewhere.
const TOONLAB_MATERIAL_ROOT = 'Environment/Rocks/Materials';
const materialLibraryPromises = new Map();

function profile(id, sourceName, relativePath) {
  return Object.freeze({
    id,
    sourceName,
    toonLabMaterialName: sourceName,
    assetPath: `${TOONLAB_MATERIAL_ROOT}/${relativePath}`,
  });
}

/**
 * Stable IDs for all 42 ToonLab rock material assets. `sourceName` is the exact
 * ToonLab `.mat` material name consumed by the extracted material manifest.
 */
export const TOONLAB_ROCK_PROFILES = Object.freeze([
  profile('rock-base', 'M_Rock', 'M_Rock.mat'),
  profile('mountain-base', 'M_Mountain', 'M_Mountain.mat'),

  profile('classic', 'MV_RockClassic', 'Classic/MV_RockClassic.mat'),
  profile(
    'classic-boulder-clumps',
    'MV_RockClassic_ClumpClassic',
    'Classic/MV_RockClassic_ClumpClassic.mat',
  ),
  profile(
    'classic-boulders',
    'MV_RockClassic_Boulders',
    'Classic/MV_RockClassic_Boulders.mat',
  ),
  profile(
    'classic-boulders-snow',
    'MV_RockClassic_Boulders_Snowy',
    'Classic/MV_RockClassic_Boulders_Snowy.mat',
  ),
  profile('classic-cliff', 'MV_RockClassic_Cliff', 'Classic/MV_RockClassic_Cliff.mat'),
  profile(
    'classic-cliff-no-grass',
    'MV_RockClassic_Cliff_NoGrass',
    'Classic/MV_RockClassic_Cliff_NoGrass.mat',
  ),
  profile(
    'classic-cliff-snow',
    'MV_RockClassic_Cliff_Snow',
    'Classic/MV_RockClassic_Cliff_Snow.mat',
  ),
  profile(
    'classic-platforms',
    'MV_RockClassic_Platforms',
    'Classic/MV_RockClassic_Platforms.mat',
  ),
  profile('classic-rocks', 'MV_RockClassic_Rocks', 'Classic/MV_RockClassic_Rocks.mat'),
  profile(
    'classic-rocks-moss',
    'MV_RockClassic_Rocks_Mossy',
    'Classic/MV_RockClassic_Rocks_Mossy.mat',
  ),
  profile(
    'classic-rocks-snow',
    'MV_RockClassic_Rocks_Snowy',
    'Classic/MV_RockClassic_Rocks_Snowy.mat',
  ),
  profile(
    'classic-shelves',
    'MV_RockClassic_Shelves',
    'Classic/MV_RockClassic_Shelves.mat',
  ),
  profile(
    'classic-shelves-no-grass',
    'MV_RockClassic_Shelves NoGrass',
    'Classic/MV_RockClassic_Shelves NoGrass.mat',
  ),
  profile(
    'classic-shelves-snow',
    'MV_RockClassic_Shelves_Snow',
    'Classic/MV_RockClassic_Shelves_Snow.mat',
  ),

  profile('cubic', 'MV_RockCubic', 'Cubic/MV_RockCubic.mat'),
  profile('cubic-cliff', 'MV_RockCubic_Cliff', 'Cubic/MV_RockCubic_Cliff.mat'),
  profile('cubic-metric', 'MV_RockCubic_Metric', 'Cubic/MV_RockCubic_Metric.mat'),
  profile('cubic-rocks', 'MV_RockCubic_Rocks', 'Cubic/MV_RockCubic_Rocks.mat'),

  profile('desert', 'MV_RockDesert', 'Desert/MV_RockDesert.mat'),
  profile('desert-cliff', 'MV_RockDesert_Cliff', 'Desert/MV_RockDesert_Cliff.mat'),
  profile('desert-hoodoo', 'MV_RockDesert_Hoodoo', 'Desert/MV_RockDesert_Hoodoo.mat'),
  profile('desert-rocks', 'MV_RockDesert_Rocks', 'Desert/MV_RockDesert_Rocks.mat'),
  profile('desert-shelf', 'MV_RockDesert_Shelf', 'Desert/MV_RockDesert_Shelf.mat'),
  profile('desert-shelves', 'MV_RockDesert_Shelves', 'Desert/MV_RockDesert_Shelves.mat'),

  profile('hexic', 'MV_RockHexic', 'Hexic/MV_RockHexic.mat'),
  profile('hexic-pieces', 'MV_RockHexic_Pieces', 'Hexic/MV_RockHexic_Pieces.mat'),
  profile(
    'hexic-platforms',
    'MV_RockHexic_Platforms',
    'Hexic/MV_RockHexic_Platforms.mat',
  ),
  profile(
    'hexic-rock-slanted',
    'MV_RockHexic_RockSlanted',
    'Hexic/MV_RockHexic_RockSlanted.mat',
  ),
  profile('hexic-rocks', 'MV_RockHexic_Rocks', 'Hexic/MV_RockHexic_Rocks.mat'),
  profile(
    'hexic-rocks-moss',
    'MV_RockHexic_Rocks_Mossy',
    'Hexic/MV_RockHexic_Rocks_Mossy.mat',
  ),
  profile('hexic-spire', 'MV_RockHexic_Spire', 'Hexic/MV_RockHexic_Spire.mat'),
  profile(
    'hexic-spire-moss',
    'MV_RockHexic_Spire_Mossy',
    'Hexic/MV_RockHexic_Spire_Mossy.mat',
  ),

  profile('mountain', 'MV_Mountain', 'Mountain/MV_Mountain.mat'),

  profile('spire', 'MV_RockSpire', 'Spire/MV_RockSpire.mat'),
  profile('spire-rocks', 'MV_RockSpire_Rocks', 'Spire/MV_RockSpire_Rocks.mat'),
  profile(
    'spire-rocks-moss',
    'MV_RockSpire_Rocks_Mossy',
    'Spire/MV_RockSpire_Rocks_Mossy.mat',
  ),
  profile('spire-shelves', 'MV_RockSpire_Shelves', 'Spire/MV_RockSpire_Shelves.mat'),
  profile(
    'spire-shelves-snow',
    'MV_RockSpire_Shelves_Snow',
    'Spire/MV_RockSpire_Shelves_Snow.mat',
  ),
  profile('spire-spires', 'MV_RockSpire_Spires', 'Spire/MV_RockSpire_Spires.mat'),
  profile(
    'spire-spires-snow',
    'MV_RockSpire_Spires_Snow',
    'Spire/MV_RockSpire_Spires_Snow.mat',
  ),
]);

export const TOONLAB_ROCK_PROFILE_IDS = Object.freeze(
  TOONLAB_ROCK_PROFILES.map(({ id }) => id),
);

// These 42 source names have a direct ToonLab profile counterpart. The 23
// leaf profiles assigned to the 324 reference meshes were additionally
// confirmed by matching every ToonLab static-mesh assignment to the same ToonLab FBX
// importer assignment. Root/parent profiles are included for scene imports.
export const TOONLAB_ROCK_MATERIAL_CROSSWALK = Object.freeze({
  M_Rock: 'rock-base',
  MI_Rock: 'rock-base',
  M_Mountain: 'mountain-base',
  MI_Mountain: 'mountain',

  MI_RockClassic: 'classic',
  MI_RockClassic_BoulderClumps: 'classic-boulder-clumps',
  MI_RockClassic_Boulders: 'classic-boulders',
  MI_RockClassic_Boulders_Snow: 'classic-boulders-snow',
  MI_RockClassic_Cliff: 'classic-cliff',
  MI_RockClassic_Cliff_NoGrass: 'classic-cliff-no-grass',
  MI_RockClassic_Cliff_Snow: 'classic-cliff-snow',
  MI_RockClassic_Platforms: 'classic-platforms',
  MI_RockClassic_Rocks: 'classic-rocks',
  MI_RockClassic_Rocks_MossWorld: 'classic-rocks-moss',
  MI_RockClassic_Rocks_Snow: 'classic-rocks-snow',
  MI_RockClassic_Shelves: 'classic-shelves',
  MI_RockClassic_Shelves_NoGrass: 'classic-shelves-no-grass',
  MI_RockClassic_Shelves_Snow: 'classic-shelves-snow',

  MI_RockCubic: 'cubic',
  MI_RockCubic_Cliff: 'cubic-cliff',
  MI_RockCubic_Metric: 'cubic-metric',
  MI_RockCubic_Rocks: 'cubic-rocks',

  MI_RockDesert: 'desert',
  MI_RockDesert_Cliff: 'desert-cliff',
  MI_RockDesert_Hoodoo: 'desert-hoodoo',
  MI_RockDesert_Rocks: 'desert-rocks',
  MI_RockDesert_Shelves: 'desert-shelves',

  MI_RockHexic: 'hexic',
  MI_RockHexic_Pieces: 'hexic-pieces',
  MI_RockHexic_Platforms: 'hexic-platforms',
  MI_RockHexic_Rocks: 'hexic-rocks',
  MI_RockHexic_RocksSlanted: 'hexic-rock-slanted',
  MI_RockHexic_Rocks_MossWorld: 'hexic-rocks-moss',
  MI_RockHexic_Spire: 'hexic-spire',
  MI_RockHexic_Spire_MossWorld: 'hexic-spire-moss',

  MI_RockSpire: 'spire',
  MI_RockSpire_Rocks: 'spire-rocks',
  MI_RockSpire_Rocks_MossWorld: 'spire-rocks-moss',
  MI_RockSpire_Shelves: 'spire-shelves',
  MI_RockSpire_Shelves_Snow: 'spire-shelves-snow',
  MI_RockSpire_Spires: 'spire-spires',
  MI_RockSpire_Spires_Snow: 'spire-spires-snow',
});

// The source inventory contains variants which the ToonLab pack does not expose
// as distinct `.mat` assets. These aliases are deliberately opt-in: silently
// treating a demo/grass/snow/moss variant as its parent would make a visual
// parity failure look like a successful exact match.
export const TOONLAB_ROCK_MATERIAL_FALLBACKS = Object.freeze({
  MI_RockClassic_BoulderClumps_Snow: 'classic-boulder-clumps',
  MI_RockClassic_Boulders_MossWorld: 'classic-boulders',
  MI_RockClassic_Boulders_Snow_Demo: 'classic-boulders-snow',
  MI_RockClassic_Cliff_Demo: 'classic-cliff',
  MI_RockClassic_Rocks_Demo: 'classic-rocks',
  MI_RockClassic_Rocks_Snow_Demo: 'classic-rocks-snow',
  MI_RockClassic_Shelves_Demo: 'classic-shelves',

  MI_RockCubic_Grass: 'cubic',

  MI_RockDesert_Cliff_Grass: 'desert-cliff',
  MI_RockDesert_Cliff_NoTopLayer: 'desert-cliff',
  MI_RockDesert_Rocks_Grass: 'desert-rocks',
  MI_RockDesert_Shelves_Grass: 'desert-shelves',

  MI_RockHexic_Pieces_Demo: 'hexic-pieces',
  MI_RockHexic_Pieces_MossVertex: 'hexic-pieces',
  MI_RockHexic_Platforms_Demo: 'hexic-platforms',
  MI_RockHexic_Platforms_MossVertex: 'hexic-platforms',
  MI_RockHexic_RocksSlanted_Demo: 'hexic-rock-slanted',
  MI_RockHexic_Rocks_Demo: 'hexic-rocks',
  MI_RockHexic_Rocks_MossVertex: 'hexic-rocks-moss',
  MI_RockHexic_Spire_Demo: 'hexic-spire',
  MI_RockHexic_Spire_MossVertex: 'hexic-spire-moss',

  MI_Mountain_China: 'mountain',
  MI_Mountain_Snowy: 'mountain',

  MI_RockSpire_Rocks_Snow: 'spire-rocks',
  MI_RockSpire_Shelves_Demo: 'spire-shelves',
  MI_RockSpire_Shelves_GrassNoMask: 'spire-shelves',
  MI_RockSpire_Shelves_NoGrass: 'spire-shelves',
  MI_RockSpire_Spires_Grass: 'spire-spires',
});

const descriptorsById = new Map(
  TOONLAB_ROCK_PROFILES.map((descriptor) => [descriptor.id, descriptor]),
);

function referenceValue(reference) {
  if (typeof reference === 'string') return reference;
  if (!reference || typeof reference !== 'object') return '';
  return reference.path
    ?? reference.toonLabPath
    ?? reference.assetPath
    ?? reference.sourceName
    ?? reference.toonLabMaterialName
    ?? reference.materialName
    ?? reference.name
    ?? '';
}

/** Returns the material basename without engine path/wrapper/clone syntax. */
export function normalizeToonLabRockMaterialReference(reference) {
  let value = String(referenceValue(reference) ?? '').trim();
  if (!value) return '';
  value = value.replace(/^\w+'/, '').replace(/'$/, '');
  value = value.split(/[\\/]/).at(-1) ?? value;
  value = value.replace(/\.mat$/i, '');
  const dot = value.lastIndexOf('.');
  if (dot >= 0) {
    const tail = value.slice(dot + 1);
    // ToonLab object paths repeat the object name after a dot; DCC/FBX imports use
    // numeric suffixes such as MI_RockDesert.071. Both reduce to one basename.
    value = /^\d+$/.test(tail) ? value.slice(0, dot) : tail;
  }
  return value.replace(/\s+\(Instance\)$/i, '').trim();
}

function lookupKey(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/_+/g, '_');
}

function lookupCandidates(reference) {
  const name = normalizeToonLabRockMaterialReference(reference);
  const key = lookupKey(name);
  const candidates = [key];
  // ToonLab's glTF exporter and Blender append numeric collision suffixes.
  const withoutNumericSuffix = key.replace(/_\d{3}$/, '');
  if (withoutNumericSuffix !== key) candidates.push(withoutNumericSuffix);
  return { candidates, name };
}

function makeIdLookup(source, { includeFbxSlotAliases = false } = {}) {
  const lookup = new Map();
  for (const [name, id] of Object.entries(source)) {
    lookup.set(lookupKey(name), { id, name });
    if (includeFbxSlotAliases && name.startsWith('MI_Rock')) {
      const slotName = name.replace(/^MI_/, 'M_');
      lookup.set(lookupKey(slotName), { id, name });
    }
  }
  return lookup;
}

const exactSourceLookup = makeIdLookup(TOONLAB_ROCK_MATERIAL_CROSSWALK, {
  includeFbxSlotAliases: true,
});
const fallbackSourceLookup = makeIdLookup(TOONLAB_ROCK_MATERIAL_FALLBACKS, {
  includeFbxSlotAliases: true,
});
const toonLabNameLookup = new Map();

for (const descriptor of TOONLAB_ROCK_PROFILES) {
  toonLabNameLookup.set(lookupKey(descriptor.toonLabMaterialName), {
    id: descriptor.id,
    name: descriptor.toonLabMaterialName,
  });
  // ToonLab's FBX importer retains M_* slot names even when it remaps the slot
  // to an MV_* material variant. Mountain is excluded because M_Mountain is
  // the distinct root material, not an alias for MV_Mountain.
  if (descriptor.toonLabMaterialName.startsWith('MV_Rock')) {
    const slotName = descriptor.toonLabMaterialName.replace(/^MV_/, 'M_');
    toonLabNameLookup.set(lookupKey(slotName), { id: descriptor.id, name: slotName });
  }
}

function sourceAssetBasename(sourceAssetName) {
  return String(sourceAssetName ?? '')
    .split(/[\\/]/)
    .at(-1)
    ?.replace(/\.(?:fbx|glb|gltf)$/i, '') ?? '';
}

function assetAssignmentOverride(sourceName, sourceAssetName) {
  const asset = sourceAssetBasename(sourceAssetName);
  if (!asset) return null;
  if (sourceName === 'MI_RockDesert_Cliff' && asset === 'SM_RockDesert_CliffHalf05') {
    return 'desert';
  }
  if (sourceName === 'MI_RockDesert_Shelves' && /^SM_RockDesert_Shelf\d+$/i.test(asset)) {
    return 'desert-shelf';
  }
  return null;
}

/**
 * Resolves a ToonLab object path, ToonLab material/slot name, or canonical profile ID
 * to a stable ToonLab profile descriptor. Missing ToonLab-only source variants are
 * rejected unless `allowFallback` is explicitly enabled.
 */
export function resolveToonLabRockProfile(reference, {
  allowFallback = false,
  sourceAssetName = null,
} = {}) {
  if (descriptorsById.has(reference)) {
    const descriptor = descriptorsById.get(reference);
    return Object.freeze({
      ...descriptor,
      profileId: descriptor.id,
      inputName: String(reference),
      matchedName: descriptor.id,
      matchKind: 'profile-id',
      isExact: true,
    });
  }

  const { candidates, name: inputName } = lookupCandidates(reference);
  for (const candidate of candidates) {
    const toonLabMatch = toonLabNameLookup.get(candidate);
    if (toonLabMatch) {
      const descriptor = descriptorsById.get(toonLabMatch.id);
      return Object.freeze({
        ...descriptor,
        profileId: descriptor.id,
        inputName,
        matchedName: toonLabMatch.name,
        matchKind: toonLabMatch.name === descriptor.toonLabMaterialName
          ? 'toonlab-material'
          : 'toonlab-fbx-slot',
        isExact: true,
      });
    }

    const sourceMatch = exactSourceLookup.get(candidate);
    if (sourceMatch) {
      const overrideId = assetAssignmentOverride(sourceMatch.name, sourceAssetName);
      const descriptor = descriptorsById.get(overrideId ?? sourceMatch.id);
      return Object.freeze({
        ...descriptor,
        profileId: descriptor.id,
        inputName,
        matchedName: sourceMatch.name,
        matchKind: overrideId ? 'source-asset-assignment' : 'source-crosswalk',
        isExact: true,
      });
    }

    if (allowFallback) {
      const fallbackMatch = fallbackSourceLookup.get(candidate);
      if (fallbackMatch) {
        const descriptor = descriptorsById.get(fallbackMatch.id);
        return Object.freeze({
          ...descriptor,
          profileId: descriptor.id,
          inputName,
          matchedName: fallbackMatch.name,
          matchKind: 'source-parent-fallback',
          isExact: false,
        });
      }
    }
  }
  return null;
}

/** Validates and indexes the extractor's stable v1 manifest contract. */
export function createToonLabRockMaterialIndex(manifest) {
  const schema = normalizeToonLabRockMaterialLibrarySchema(manifest?.schema);
  if (!schema) {
    throw new Error(
      `Invalid ToonLab rock material library schema: ${manifest?.schema ?? 'missing'}.`,
    );
  }
  if (Number(manifest.schemaVersion)
    !== TOONLAB_ROCK_MATERIAL_LIBRARY_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported ToonLab rock material library schema version: ${manifest.schemaVersion}.`,
    );
  }
  if (!Array.isArray(manifest.materials)) {
    throw new Error('ToonLab rock material library must contain a materials array.');
  }

  const byName = new Map();
  const byGuid = new Map();
  const byAssetPath = new Map();
  for (const material of manifest.materials) {
    if (!material || typeof material.name !== 'string' || !material.name.trim()) {
      throw new Error('ToonLab rock material library contains a material without a name.');
    }
    const nameKey = lookupKey(material.name);
    if (byName.has(nameKey)) {
      throw new Error(`Duplicate ToonLab rock material name: ${material.name}.`);
    }
    byName.set(nameKey, material);
    if (material.guid) {
      if (byGuid.has(material.guid)) {
        throw new Error(`Duplicate ToonLab rock material GUID: ${material.guid}.`);
      }
      byGuid.set(material.guid, material);
    }
    if (material.assetPath) byAssetPath.set(material.assetPath, material);
  }

  return Object.freeze({
    byAssetPath,
    byGuid,
    byName,
    manifest,
    materials: manifest.materials,
    schema,
    schemaVersion: Number(manifest.schemaVersion),
    sourceSchema: manifest.schema,
  });
}

/**
 * Fetches and validates the extracted ToonLab material library once per URL.
 * A failed request is removed from the cache so development-server retries
 * work after the extractor writes the file.
 */
export async function loadToonLabRockMaterialLibrary({
  fetchImpl = globalThis.fetch,
  url = DEFAULT_TOONLAB_ROCK_MATERIAL_LIBRARY_URL,
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('A fetch implementation is required to load ToonLab rock materials.');
  }
  if (typeof url !== 'string' || !url.trim()) {
    throw new Error('A configured rock material library URL is required.');
  }
  const cacheKey = String(url);
  if (!materialLibraryPromises.has(cacheKey)) {
    materialLibraryPromises.set(cacheKey, Promise.resolve()
      .then(() => fetchImpl(cacheKey, { cache: 'no-cache' }))
      .then(async (response) => {
        if (!response?.ok) {
          throw new Error(
            `ToonLab rock material library is unavailable (${response?.status ?? 'network error'}).`,
          );
        }
        const responseText = await response.text();
        let manifest;
        try {
          manifest = JSON.parse(responseText);
        } catch (error) {
          const contentType = response.headers?.get?.('content-type') ?? 'unknown';
          throw new Error(
            `ToonLab rock material library returned invalid JSON from ${cacheKey} `
            + `(content-type: ${contentType}).`,
            { cause: error },
          );
        }
        createToonLabRockMaterialIndex(manifest);
        return manifest;
      })
      .catch((error) => {
        materialLibraryPromises.delete(cacheKey);
        throw error;
      }));
  }
  return materialLibraryPromises.get(cacheKey);
}

export async function loadToonLabRockMaterialIndex(options = {}) {
  return createToonLabRockMaterialIndex(
    await loadToonLabRockMaterialLibrary(options),
  );
}

/**
 * Resolves identity and, when a manifest/index is supplied, returns the exact
 * raw material record that the ToonLab-profile normalizer should consume.
 */
export function resolveToonLabRockMaterial(reference, {
  allowFallback = false,
  index = null,
  manifest = null,
  sourceAssetName = null,
  strictManifest = true,
} = {}) {
  const resolution = resolveToonLabRockProfile(reference, {
    allowFallback,
    sourceAssetName,
  });
  if (!resolution) return null;
  const materialIndex = index ?? (manifest
    ? createToonLabRockMaterialIndex(manifest)
    : null);
  const materialRecord = materialIndex?.byName.get(
    lookupKey(resolution.toonLabMaterialName),
  ) ?? null;
  if (materialIndex && !materialRecord && strictManifest) {
    throw new Error(
      `ToonLab rock material manifest is missing ${resolution.toonLabMaterialName}.`,
    );
  }
  return Object.freeze({ ...resolution, materialRecord });
}

export function requireToonLabRockMaterial(reference, options = {}) {
  const resolution = resolveToonLabRockMaterial(reference, options);
  if (!resolution) {
    throw new Error(`Unknown ToonLab rock material: ${referenceValue(reference)}`);
  }
  return resolution;
}
