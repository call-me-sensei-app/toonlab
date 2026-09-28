import {
  bumpDocumentRevision,
  createC7SurfaceSpecification,
  createRockDocument,
} from '../../../src/rockgen/index.js';

const LEGACY_ROCK_COUNT = 480;
const C8_ROCK_COUNT = 100;
const EXPECTED_ROCK_COUNT = LEGACY_ROCK_COUNT + C8_ROCK_COUNT;

// The Rock Lab does not own a second 480-item inventory. OSS reads the local
// Gallery database populated by the Pro release seed; Pro reads its public
// rock-catalog endpoint. Both normalize the same immutable release rows.
const FAMILY_PRESETS = Object.freeze({
  angular_boulder: 'granite-boulder',
  broad_wall: 'cliff-wall',
  capstone_stack: 'column-arch',
  cliff_corner: 'canyon-ridge',
  cliff_corner_kit: 'cliff-wall',
  cliff_overhang: 'sea-stack',
  cliff_termination: 'canyon-ridge',
  column_field: 'basalt-columns',
  column_kit: 'basalt-columns',
  distant_massif: 'canyon-ridge',
  flat_shelf: 'cliff-face',
  fractured_block: 'granite-boulder',
  hoodoo: 'karst-spire',
  hoodoo_cliff: 'karst-spire',
  isolated_peak: 'karst-spire',
  layered_face: 'eroded-mesa',
  layered_slab: 'cliff-wall',
  mesa: 'eroded-mesa',
  metric_block: 'lowpoly-boulder',
  monolith: 'shard-monolith',
  mountain_ridge: 'canyon-ridge',
  natural_arch: 'column-arch',
  river_worn_rock: 'river-boulder',
  rock_clump: 'scree-cluster',
  rock_platform: 'cliff-face',
  rock_ridge: 'canyon-ridge',
  rounded_boulder: 'river-boulder',
  scree_cluster: 'scree-cluster',
  shelf_stack: 'eroded-mesa',
  spire: 'karst-spire',
  stepped_face: 'eroded-mesa',
  straight_cliff_tile: 'cliff-wall',
  talus_rock: 'scree-cluster',
  vertical_face: 'cliff-face',
  weathered_fragment: 'boulder',
  caves_and_arches: 'column-arch',
  caves_arches_and_bridges: 'column-arch',
  cliffs_and_scarps: 'cliff-wall',
  coastal_residuals: 'sea-stack',
  deposits_and_fields: 'scree-cluster',
  detached_clasts: 'granite-boulder',
  fins_spires_and_hoodoos: 'karst-spire',
  intrusions: 'shard-monolith',
  plateaus_and_badlands: 'eroded-mesa',
  residuals_and_outcrops: 'granite-boulder',
  ridges_and_massifs: 'canyon-ridge',
  rock_surfaces_and_steps: 'cliff-face',
  volcanic_and_cooling_forms: 'basalt-columns',
});

function title(value) {
  return String(value).split(/[_-]/u)
    .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join(' ');
}

function hash(value) {
  let result = 0x811c9dc5;
  for (const character of String(value)) {
    result ^= character.charCodeAt(0);
    result = Math.imul(result, 0x01000193);
  }
  return result >>> 0;
}

function releaseFromUrl(value) {
  try {
    return new URL(value, window.location.href).pathname.match(/^\/official\/([^/]+)\//u)?.[1] ?? '';
  } catch {
    return '';
  }
}

function normalizeNatureProvenance(value) {
  if (!value || typeof value !== 'object') return null;
  const string = (field) => typeof field === 'string' ? field.trim() : '';
  const authoritySource = value.authorityReferences ?? value.authorities;
  const authorityReferences = Array.isArray(authoritySource)
    ? authoritySource.map((entry) => Object.freeze({
      claim: string(entry?.claim),
      url: string(entry?.url),
    })).filter((entry) => entry.url)
    : [];
  const imageUrl = string(value.image?.url ?? value.publicImage?.url);
  const source = value.source ?? {};
  return Object.freeze({
    authorityReferences: Object.freeze(authorityReferences),
    author: string(value.author ?? source.author),
    featureRationale: string(value.featureRationale ?? value.rationale),
    generatedViewsAreGeologyEvidence: value.generatedViewsAreGeologyEvidence === true,
    image: imageUrl ? Object.freeze({
      sha256: string(value.image?.sha256 ?? value.publicImage?.sha256),
      url: imageUrl,
    }) : null,
    observedFeatures: Object.freeze(
      (Array.isArray(value.observedFeatures) ? value.observedFeatures : [])
        .map(string)
        .filter(Boolean),
    ),
    photoLicense: string(value.photoLicense ?? source.license),
    photoLicenseUrl: string(value.photoLicenseUrl ?? source.licenseUrl),
    publicImageStatus: ['approved', 'blocked', 'missing'].includes(value.publicImageStatus)
      ? value.publicImageStatus
      : imageUrl ? 'approved' : 'missing',
    relationship: string(value.relationship) || 'morphology-reference-not-texture-source',
    rights: string(value.rights ?? source.rights),
    schema: string(value.schema) || 'toonlab/nature-provenance',
    schemaVersion: Number(value.schemaVersion) || 1,
    sourcePageUrl: string(value.sourcePageUrl ?? source.url),
    title: string(value.title ?? source.title),
  });
}

function siblingUrl(modelUrl, file) {
  if (!modelUrl) return null;
  try {
    return new URL(file, new URL('.', modelUrl)).href;
  } catch {
    return null;
  }
}

function normalizeGalleryAsset(asset, catalogIndex) {
  const metadata = asset.metadata ?? {};
  const taxonomy = asset.taxonomy ?? metadata.taxonomy ?? {};
  const recipe = asset.recipe ?? metadata.recipe ?? {};
  const familyId = String(asset.familyId || metadata.familyId || '').trim();
  const familyKey = familyId.replaceAll('-', '_');
  // Published C8 rows may use the morphology subtype itself as `familyId`.
  // Their editable source is already the authoritative control mesh, so the
  // rockgen preset is only a document scaffold; use Boulder when no broader
  // family-to-preset mapping was published instead of rejecting the asset.
  const preset = String(asset.editorPreset
    || metadata.editor?.preset
    || FAMILY_PRESETS[familyKey]
    || (/^rock-c8-/u.test(String(asset.id ?? '')) ? 'boulder' : '')).trim();
  const artifacts = Array.isArray(asset.artifacts) ? asset.artifacts : [];
  const c8Recipe = recipe.schema === 'toonlab/rock-gallery-recipe';
  const primaryModelUrl = asset.download_url
    || asset.downloadUrl
    || artifacts.find((entry) => entry.name === 'rock.glb')?.download
    || (c8Recipe ? artifacts.find((entry) => entry.name === 'control.glb')?.download : null)
    || null;
  const thumbnailUrl = asset.thumbnail_url || asset.thumbnailUrl || null;
  const id = String(asset.id ?? '');
  const sourceAssetId = String(asset.source_id ?? asset.sourceId ?? taxonomy.morphology
    ?? id.replace(/^rock-c8-/u, '')).trim();
  const modelUrl = c8Recipe
    ? artifacts.find((entry) => entry.name === 'control.glb')?.download
      ?? siblingUrl(primaryModelUrl, recipe.geometry?.control ?? 'control.glb')
    : primaryModelUrl;
  const materialConfigUrl = String(metadata.packages?.callMeSenseiRuntime ?? '').trim()
    || artifacts.find((entry) => entry.name === 'material-config.json')?.download
    || siblingUrl(primaryModelUrl, metadata.variation?.material ?? 'material-config.json');
  const sourceVersion = String(asset.release || releaseFromUrl(primaryModelUrl));
  const dimensionsMetres = asset.dimensionsMeters ?? metadata.dimensionsMeters;
  const dimensionsComplete = ['width', 'height', 'depth']
    .every((key) => Number.isFinite(Number(dimensionsMetres?.[key])) && Number(dimensionsMetres[key]) > 0);
  const missing = [
    !(/^rock-\d{4}$/u.test(id) || /^rock-c8-[a-z0-9-]+$/u.test(id)) && 'valid id',
    !familyId && 'family',
    !preset && 'editor preset',
    !modelUrl && 'model',
    !thumbnailUrl && 'thumbnail',
    !sourceVersion && 'release',
    !dimensionsComplete && 'dimensions',
  ].filter(Boolean);
  if (missing.length) {
    throw new Error(`${id || `catalog row ${catalogIndex + 1}`} is not a complete released Gallery rock (missing ${missing.join(', ')}).`);
  }
  const surfacePackage = asset.surfacePackage ?? metadata.surfacePackage ?? (c8Recipe ? {
    assetId: sourceAssetId,
    familyId,
    geometrySha256: String(recipe.geometry?.sha256 ?? asset.sha256 ?? ''),
    mapResolution: Number(recipe.output?.mapResolution) || 1024,
    profileId: String(metadata.profileId ?? recipe.material?.profileId ?? ''),
    projection: structuredClone(recipe.material?.projection ?? {}),
    schema: 'toonlab/c8-first100-geology-surface',
    seed: Number(recipe.material?.seed ?? recipe.generator?.seed ?? hash(id)) >>> 0,
    version: 3,
  } : null);
  return Object.freeze({
    catalogIndex,
    dimensionsMetres: Object.freeze({
      depth: Number(dimensionsMetres?.depth),
      height: Number(dimensionsMetres?.height),
      width: Number(dimensionsMetres?.width),
    }),
    familyId,
    familyLabel: title(familyId),
    file: c8Recipe ? 'control.glb' : 'rock.glb',
    galleryId: id,
    geology: taxonomy.geology,
    id,
    label: String(asset.name ?? id),
    materialConfigUrl,
    modelUrl,
    natureProvenance: normalizeNatureProvenance(asset.natureProvenance ?? metadata.natureProvenance),
    preset,
    recipeHash: String(asset.recipeHash ?? metadata.recipeHash ?? ''),
    revision: Number(asset.revision ?? metadata.revision ?? 0),
    seed: Number(recipe.generator?.seed ?? hash(`${sourceVersion}:${id}`)) >>> 0,
    sourceContentHash: String(asset.sha256
      ?? artifacts.find((entry) => entry.name === (c8Recipe ? 'control.glb' : 'rock.glb'))?.sha256
      ?? surfacePackage?.geometrySha256
      ?? ''),
    sourceMode: 'official-glb',
    sourceVersion,
    surfacePackage: surfacePackage ? Object.freeze(structuredClone(surfacePackage)) : null,
    tags: Object.freeze([...(asset.tags ?? [])].map(String)),
    thumbnailUrl,
    variationId: sourceAssetId || id,
  });
}

export let ROCK_VARIATION_CATALOG = Object.freeze([]);
export let ROCK_VARIATION_FAMILIES = Object.freeze([]);
let entryById = new Map();
let catalogPromise = null;

async function fetchJson(url) {
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw Object.assign(new Error(`${url} returned HTTP ${response.status}`), {
    status: response.status,
  });
  return response.json();
}

async function fetchCanonicalGalleryRocks() {
  // The hosted Pro route owns its public catalog API. Do not probe the OSS
  // workspace endpoint there: React Router may return an application response
  // for that unknown path, and treating it as a catalog produces a late,
  // misleading "incomplete rock" boot failure.
  if (String(window.location.pathname ?? '').startsWith('/labs/')) {
    const result = await fetchJson('/api/v1/rock-catalog');
    return result.assets ?? [];
  }
  try {
    const pageSize = 500;
    const first = await fetchJson(`/api/toonlab/catalog?kind=model&source=toonlab-rock&limit=${pageSize}`);
    const items = [...(first.items ?? [])];
    const total = Math.max(Number(first.total) || items.length, items.length);
    while (items.length < total) {
      const page = await fetchJson(
        `/api/toonlab/catalog?kind=model&source=toonlab-rock&limit=${pageSize}&offset=${items.length}`,
      );
      if (!page.items?.length) break;
      items.push(...page.items);
    }
    return items;
  } catch (error) {
    if (error.status !== 404) throw error;
    const result = await fetchJson('/api/v1/rock-catalog');
    return result.assets ?? [];
  }
}

export async function loadRockVariationCatalog({ force = false } = {}) {
  if (!force && ROCK_VARIATION_CATALOG.length === EXPECTED_ROCK_COUNT) return ROCK_VARIATION_CATALOG;
  if (!force && catalogPromise) return catalogPromise;
  catalogPromise = fetchCanonicalGalleryRocks().then((assets) => {
    const normalized = assets
      .map(normalizeGalleryAsset)
      .sort((left, right) => left.id.localeCompare(right.id));
    if (normalized.length !== EXPECTED_ROCK_COUNT) {
      throw new Error(`The canonical Gallery returned ${normalized.length} rocks; expected ${EXPECTED_ROCK_COUNT}.`);
    }
    const ids = new Set(normalized.map((entry) => entry.id));
    for (let index = 1; index <= LEGACY_ROCK_COUNT; index += 1) {
      const id = `rock-${String(index).padStart(4, '0')}`;
      if (!ids.has(id)) throw new Error(`The canonical Gallery is missing ${id}.`);
    }
    const c8Ids = normalized.filter((entry) => entry.id.startsWith('rock-c8-'));
    if (c8Ids.length !== C8_ROCK_COUNT) {
      throw new Error(`The canonical Gallery returned ${c8Ids.length} Nature Reference Rocks; expected ${C8_ROCK_COUNT}.`);
    }
    ROCK_VARIATION_CATALOG = Object.freeze(normalized);
    const familyIds = [...new Set(normalized.map((entry) => entry.familyId))];
    ROCK_VARIATION_FAMILIES = Object.freeze(
      familyIds.map((value) => Object.freeze({ label: title(value), value })),
    );
    entryById = new Map(normalized.map((entry) => [entry.id, entry]));
    return ROCK_VARIATION_CATALOG;
  }).catch((error) => {
    catalogPromise = null;
    throw error;
  });
  return catalogPromise;
}

export function getRockVariationCatalogEntry(id) {
  return entryById.get(String(id ?? '')) ?? null;
}

export function searchRockVariationCatalog({ family = 'all', text = '' } = {}) {
  const query = String(text).trim().toLocaleLowerCase();
  return ROCK_VARIATION_CATALOG.filter((entry) => {
    if (family !== 'all' && entry.familyId !== family) return false;
    if (!query) return true;
    return [
      entry.id,
      entry.label,
      entry.file,
      entry.familyId,
      entry.familyLabel,
      entry.geology ?? '',
      entry.preset,
      entry.natureProvenance?.title ?? '',
      entry.natureProvenance?.featureRationale ?? '',
      ...(entry.natureProvenance?.observedFeatures ?? []),
      ...entry.tags,
    ].join(' ').toLocaleLowerCase().includes(query);
  });
}

/** Build a portable, editable project whose source of truth is a Gallery GLB. */
export function createCatalogVariationDocument(idOrEntry, {
  strength = 0.3,
  style = 'call_me_sensei',
  variation = 0,
} = {}) {
  const entry = typeof idOrEntry === 'object' ? idOrEntry : getRockVariationCatalogEntry(idOrEntry);
  if (!entry) throw new Error(`Unknown Rock Lab catalog entry “${String(idOrEntry)}”.`);
  const variationIndex = Math.max(0, Math.round(Number(variation) || 0));
  const seed = hash(`${entry.seed}:${variationIndex}`);
  const releasedSurface = entry.surfacePackage;
  const surfacePackage = releasedSurface?.schema?.startsWith('toonlab/c8-')
    ? Object.freeze({
      ...structuredClone(releasedSurface),
      boundsAuthority: 'rock-lab-edited-source-bounds',
      geometrySha256: entry.sourceContentHash || releasedSurface.geometrySha256,
      seed: variationIndex === 0
        ? releasedSurface.seed
        : hash(`${entry.id}:${releasedSurface.schema}:${variationIndex}`),
    })
    : createC7SurfaceSpecification({
      assetId: entry.id,
      dimensionsMetres: entry.dimensionsMetres,
      geology: entry.geology,
      ...(variationIndex === 0 ? {} : { seed: hash(`${entry.id}:c7-v1:${variationIndex}`) }),
    });
  const document = createRockDocument({
    name: `${entry.label} Variation ${variationIndex + 1}`,
    preset: entry.preset,
    reference: {
      archetype: entry.familyId,
      catalogVersion: 1,
      family: entry.familyId,
      id: entry.id,
      recipeHash: entry.recipeHash,
      revision: entry.revision,
      role: entry.tags[0] ?? 'rock',
      series: entry.sourceVersion,
      sourceMode: 'mesh-template',
      surfaceMode: 'generated',
      surfacePackage,
      topFinish: 'bare',
      variation: Math.min(Math.max(Number(strength) || 0, 0), 1),
      variationSeed: seed,
    },
    seed,
    style,
  });
  Object.assign(document.surface, {
    lichenCoverage: 0,
    mossCoverage: 0,
    pbrTexturePreset: 'none',
    stainStrength: 0,
    topCoatStrength: 0,
    veinStrength: 0,
  });
  bumpDocumentRevision(document);
  return document;
}
