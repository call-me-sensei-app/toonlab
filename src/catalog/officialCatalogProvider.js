// Package-safe provider for immutable assets published by ToonLab's official
// catalogs. This module deliberately stops at discovery + URL/provenance
// resolution. Loading, decoded-resource caching, LOD selection, styling, and
// collision registration are separate runtime layers so consumers can use the
// same provider with Three.js, R3F, or a server-side tool.

export const OFFICIAL_CATALOG_ASSET_VERSION = 1;
export const OFFICIAL_CATALOG_PROVIDER_TRANSPORTS = Object.freeze([
  'workspace',
  'public-rock',
]);

const LEGACY_ROCK_ID = /^rock-\d{4}$/u;
const NATURE_REFERENCE_ROCK_ID = /^rock-c8-[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const ROCK_RECIPE_KIND = 'toonlab/rock-recipe';
const ROCK_GALLERY_RECIPE_SCHEMA = 'toonlab/rock-gallery-recipe';

function isRockId(value) {
  return LEGACY_ROCK_ID.test(value) || NATURE_REFERENCE_ROCK_ID.test(value);
}

function isRockRecipe(value) {
  return isRecord(value) && (
    value.kind === ROCK_RECIPE_KIND
    || value.schema === ROCK_GALLERY_RECIPE_SCHEMA
  );
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function frozenCopy(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(frozenCopy));
  if (!isRecord(value)) return value;
  return Object.freeze(Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, frozenCopy(entry)]),
  ));
}

function absoluteBaseUrl(baseUrl) {
  const fallback = globalThis.location?.href;
  try {
    const resolved = fallback ? new URL(baseUrl, fallback) : new URL(baseUrl);
    if (!['http:', 'https:'].includes(resolved.protocol)) {
      throw new Error(`unsupported protocol ${resolved.protocol}`);
    }
    if (!resolved.pathname.endsWith('/')) resolved.pathname += '/';
    resolved.search = '';
    resolved.hash = '';
    return resolved;
  } catch (error) {
    throw new TypeError(
      `Official catalog baseUrl must resolve to an absolute HTTP(S) URL: ${error.message}`,
    );
  }
}

/** Resolve a catalog-owned URL without depending on the current document URL. */
export function resolveOfficialCatalogUrl(reference, baseUrl) {
  if (typeof reference !== 'string' || !reference.trim()) return null;
  const resolved = new URL(reference, absoluteBaseUrl(baseUrl));
  if (!['http:', 'https:'].includes(resolved.protocol)) {
    throw new TypeError(`Official catalog asset URL uses unsupported protocol ${resolved.protocol}.`);
  }
  return resolved.href;
}

function artifactUrl(artifact) {
  return artifact?.download ?? artifact?.download_url ?? artifact?.downloadUrl ?? artifact?.url ?? null;
}

function artifactName(artifact) {
  return String(artifact?.name ?? artifact?.relative_path ?? artifact?.relativePath ?? '');
}

function artifactKey(value) {
  return String(value ?? '').trim().replace(/^\.\//u, '').toLowerCase();
}

function artifactByName(artifacts, ...names) {
  const wanted = new Set(names.map(artifactKey));
  return artifacts.find((artifact) => wanted.has(artifactKey(artifactName(artifact)))) ?? null;
}

function isModelArtifact(artifact) {
  const name = artifactName(artifact).toLowerCase();
  const contentType = String(artifact?.contentType ?? artifact?.content_type ?? '').toLowerCase();
  return name.endsWith('.glb') || name.endsWith('.gltf')
    || contentType === 'model/gltf-binary' || contentType === 'model/gltf+json';
}

function releaseFromUrl(value) {
  try {
    return new URL(value).pathname.match(/\/official\/([^/]+)\//u)?.[1] ?? null;
  } catch {
    return null;
  }
}

export class OfficialCatalogProviderError extends Error {
  constructor(message, { cause = null, code = 'invalid-catalog-asset', status = null } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'OfficialCatalogProviderError';
    this.code = code;
    this.status = status;
  }
}

/**
 * Normalize either the OSS workspace row or the hosted public-rock row into a
 * single immutable package contract. Provenance fields are mandatory for
 * official rocks so an id can never silently resolve to an unrelated model.
 */
export function normalizeOfficialCatalogAsset(rawAsset, {
  baseUrl,
  expectedId = null,
  expectedSource = null,
  provider = 'official',
} = {}) {
  if (!isRecord(rawAsset)) {
    throw new OfficialCatalogProviderError('Official catalog asset must be an object.');
  }
  const metadata = isRecord(rawAsset.metadata) ? rawAsset.metadata : {};
  const recipe = isRecord(rawAsset.recipe)
    ? rawAsset.recipe
    : isRecord(metadata.recipe) ? metadata.recipe : null;
  const id = String(rawAsset.id ?? '').trim();
  const source = String(rawAsset.source ?? metadata.source ?? expectedSource ?? '').trim();
  const kind = String(rawAsset.kind ?? 'model').trim();
  const catalog = String(metadata.catalog ?? rawAsset.catalog ?? (
    isRockRecipe(recipe) ? 'rocks' : ''
  )).trim().toLowerCase();
  const revision = Number(rawAsset.revision ?? metadata.revision);
  const recipeHash = String(rawAsset.recipeHash ?? metadata.recipeHash ?? '').trim();
  const artifacts = [
    ...(Array.isArray(rawAsset.artifacts) ? rawAsset.artifacts : []),
    ...(Array.isArray(rawAsset.files) ? rawAsset.files : []),
  ].filter(isRecord);
  const modelArtifact = artifactByName(artifacts, 'rock.glb')
    ?? artifacts.find(isModelArtifact)
    ?? null;
  const modelReference = rawAsset.download_url
    ?? rawAsset.downloadUrl
    ?? rawAsset.download?.url
    ?? artifactUrl(modelArtifact);
  const thumbnailReference = rawAsset.thumbnail_url
    ?? rawAsset.thumbnailUrl
    ?? rawAsset.thumbnail
    ?? null;

  const errors = [];
  if (!id) errors.push('id is required');
  if (expectedId && id !== expectedId) errors.push(`expected id ${expectedId}, received ${id || '(empty)'}`);
  if (!source) errors.push('source is required');
  if (expectedSource && source !== expectedSource) {
    errors.push(`expected source ${expectedSource}, received ${source || '(empty)'}`);
  }
  if (kind !== 'model') errors.push(`kind must be model, received ${kind || '(empty)'}`);
  if (!modelReference) errors.push('a model download URL is required');
  if (source === 'toonlab-rock') {
    if (!isRockId(id)) errors.push('ToonLab rock id must match rock-0001 or rock-c8-geology-subtype');
    if (catalog !== 'rocks') errors.push(`catalog must be rocks, received ${catalog || '(empty)'}`);
    if (!isRockRecipe(recipe)) {
      errors.push(`recipe must use ${ROCK_RECIPE_KIND} or ${ROCK_GALLERY_RECIPE_SCHEMA}`);
    }
    if (!Number.isInteger(revision) || revision < 1) errors.push('positive integer revision is required');
    if (!recipeHash) errors.push('recipeHash is required');
  }
  if (errors.length > 0) {
    throw new OfficialCatalogProviderError(
      `${id || 'Catalog row'} failed provenance validation: ${errors.join('; ')}.`,
    );
  }

  const modelUrl = resolveOfficialCatalogUrl(String(modelReference), baseUrl);
  const normalizedArtifacts = artifacts.map((artifact) => Object.freeze({
    byteSize: Number(artifact.byteSize ?? artifact.byte_size ?? 0) || 0,
    contentType: String(artifact.contentType ?? artifact.content_type ?? ''),
    name: artifactName(artifact),
    sha256: String(artifact.sha256 ?? ''),
    url: resolveOfficialCatalogUrl(artifactUrl(artifact), baseUrl),
  }));
  const artifactMap = Object.freeze(Object.fromEntries(normalizedArtifacts
    .filter((artifact) => artifact.name && artifact.url)
    .map((artifact) => [artifact.name, artifact])));
  const artifactUrlByName = (...names) => {
    const artifact = artifactByName(normalizedArtifacts, ...names);
    return artifact?.url ?? null;
  };
  const release = String(rawAsset.release ?? metadata.release ?? releaseFromUrl(modelUrl) ?? '').trim() || null;
  const domain = catalog === 'rocks' ? 'natural.rock' : String(metadata.domain ?? '').trim() || null;
  const recipeLod = isRecord(recipe?.lod) ? recipe.lod : null;
  const metadataLod = isRecord(rawAsset.lod ?? metadata.lod) ? rawAsset.lod ?? metadata.lod : null;
  const lodLevels = Array.isArray(recipe?.output?.lods)
    ? recipe.output.lods.map(String)
    : Array.isArray(metadataLod?.levels)
      ? metadataLod.levels.map(String)
      : [];
  const lodUrls = Object.freeze(Array.from({ length: 5 }, (_, level) => (
    artifactUrlByName(`lod${level}.glb`, `lod/LOD${level}.glb`)
  )));
  const hasLodPackage = lodUrls.some(Boolean) || lodLevels.length > 0;
  const lod = recipeLod || metadataLod || hasLodPackage
    ? Object.freeze({
      ...frozenCopy(recipeLod ?? metadataLod ?? {}),
      cullBelowPixels: Number(
        recipe?.output?.cullBelowPixels
        ?? metadataLod?.cullBelowPixels
        ?? 0,
      ) || 0,
      levels: Object.freeze(lodLevels),
      urls: lodUrls,
    })
    : null;
  const packageFiles = Object.freeze({
    collisionModelUrl: artifactUrlByName('collision.glb'),
    controlModelUrl: artifactUrlByName('control.glb'),
    lodModelUrls: lodUrls,
    manifestUrl: artifactUrlByName('manifest.json'),
    materialConfigUrl: artifactUrlByName('material-config.json'),
    natureProvenanceUrl: artifactUrlByName('nature-provenance.json', 'nature/provenance.json'),
    natureReferenceUrl: artifactUrlByName('nature-reference.jpg', 'nature/reference.jpg'),
    realisticModelUrl: modelUrl,
    realisticPreviewUrl: artifactUrlByName('realistic-preview.png'),
    recipeUrl: artifactUrlByName('recipe.json'),
    retainedHighModelUrl: artifactUrlByName('retained-high.glb', 'high.glb'),
    stylizedModelUrl: artifactUrlByName('rock-stylized.glb'),
    stylizedPreviewUrl: artifactUrlByName('stylized-preview.png'),
  });
  const collisionMetadata = rawAsset.collision ?? metadata.collision;

  return Object.freeze({
    artifacts: Object.freeze(normalizedArtifacts),
    artifactMap,
    catalog,
    collision: isRecord(collisionMetadata) && typeof collisionMetadata.kind === 'string'
      ? frozenCopy(collisionMetadata)
      : null,
    domain,
    id,
    identity: `${source}:${id}@${revision}:${recipeHash}`,
    kind,
    label: String(rawAsset.name ?? rawAsset.label ?? id),
    lod,
    metadata: frozenCopy(metadata),
    modelUrl,
    packageFiles,
    provider,
    provenance: Object.freeze({
      modelSha256: String(modelArtifact?.sha256 ?? metadata.modelSha256 ?? ''),
      recipeHash,
      release,
      revision,
      source,
    }),
    recipe: frozenCopy(recipe),
    schemaVersion: OFFICIAL_CATALOG_ASSET_VERSION,
    tags: Object.freeze((Array.isArray(rawAsset.tags) ? rawAsset.tags : []).map(String)),
    thumbnailUrl: resolveOfficialCatalogUrl(thumbnailReference, baseUrl),
  });
}

function requestHeaders(headers) {
  return { accept: 'application/json', ...headers };
}

async function fetchJson(fetchImpl, url, headers) {
  let response;
  try {
    response = await fetchImpl(url, { headers: requestHeaders(headers) });
  } catch (cause) {
    throw new OfficialCatalogProviderError(`Official catalog request failed for ${url}.`, {
      cause,
      code: 'catalog-request-failed',
    });
  }
  if (!response?.ok) {
    throw new OfficialCatalogProviderError(
      `Official catalog request returned HTTP ${response?.status ?? 'unknown'} for ${url}.`,
      { code: 'catalog-http-error', status: response?.status ?? null },
    );
  }
  try {
    return await response.json();
  } catch (cause) {
    throw new OfficialCatalogProviderError(`Official catalog returned invalid JSON for ${url}.`, {
      cause,
      code: 'catalog-json-error',
      status: response.status,
    });
  }
}

function queryUrl(endpoint, values) {
  const url = new URL(endpoint);
  Object.entries(values).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') return;
    url.searchParams.set(key, String(value));
  });
  return url.href;
}

/**
 * Create a provider for either:
 * - `workspace`: OSS `/api/toonlab/catalog` list/detail endpoints.
 * - `public-rock`: hosted `/api/v1/rock-catalog` release endpoint.
 */
export function createOfficialCatalogProvider({
  baseUrl,
  fetchImpl = globalThis.fetch,
  headers = {},
  name = null,
  publicRockPath = 'api/v1/rock-catalog',
  source = 'toonlab-rock',
  transport = 'workspace',
  workspacePath = 'api/toonlab/catalog',
} = {}) {
  if (!OFFICIAL_CATALOG_PROVIDER_TRANSPORTS.includes(transport)) {
    throw new TypeError(`Unknown official catalog transport “${transport}”.`);
  }
  if (typeof fetchImpl !== 'function') {
    throw new TypeError('Official catalog provider requires a fetch implementation.');
  }
  const base = absoluteBaseUrl(baseUrl).href;
  const endpoint = resolveOfficialCatalogUrl(
    transport === 'workspace' ? workspacePath : publicRockPath,
    base,
  );
  const providerName = name ?? `${transport}:${new URL(base).origin}`;

  const normalize = (asset, expectedId = null) => normalizeOfficialCatalogAsset(asset, {
    baseUrl: base,
    expectedId,
    expectedSource: source,
    provider: providerName,
  });

  async function listAssets(options = {}) {
    const url = transport === 'workspace'
      ? queryUrl(endpoint, {
        kind: options.kind ?? 'model',
        limit: options.limit ?? 500,
        offset: options.offset ?? 0,
        q: options.q ?? '',
        source: options.source ?? source,
      })
      : queryUrl(endpoint, {
        category: options.category,
        family: options.family,
        geology: options.geology,
        scale: options.scale,
        size: options.size,
        subcategory: options.subcategory,
        surface: options.surface,
      });
    const document = await fetchJson(fetchImpl, url, headers);
    const rows = transport === 'workspace' ? document?.items : document?.assets;
    if (!Array.isArray(rows)) {
      throw new OfficialCatalogProviderError(
        `${providerName} list response is missing ${transport === 'workspace' ? 'items' : 'assets'}.`,
        { code: 'catalog-shape-error' },
      );
    }
    const assets = rows.map((asset) => normalize(asset));
    return Object.freeze({
      assets: Object.freeze(assets),
      total: Number(document.total ?? document.pagination?.total ?? assets.length),
    });
  }

  async function getAsset(assetId) {
    const id = String(assetId ?? '').trim();
    if (!id) throw new TypeError('Official catalog asset id is required.');
    if (transport === 'workspace') {
      const url = `${endpoint.replace(/\/$/u, '')}/${encodeURIComponent(id)}`;
      const document = await fetchJson(fetchImpl, url, headers);
      if (!isRecord(document?.asset)) {
        throw new OfficialCatalogProviderError(`${providerName} detail response is missing asset.`, {
          code: 'catalog-shape-error',
        });
      }
      return normalize(document.asset, id);
    }
    const { assets } = await listAssets();
    const asset = assets.find((entry) => entry.id === id);
    if (!asset) {
      throw new OfficialCatalogProviderError(`${id} was not found in ${providerName}.`, {
        code: 'catalog-asset-not-found',
        status: 404,
      });
    }
    return asset;
  }

  return Object.freeze({
    baseUrl: base,
    getAsset,
    listAssets,
    name: providerName,
    resolveUrl: (reference) => resolveOfficialCatalogUrl(reference, base),
    source,
    transport,
  });
}
