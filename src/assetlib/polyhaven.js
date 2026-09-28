// CC0 asset source: Poly Haven (polyhaven.com) — photoscanned models, PBR
// texture sets, and HDRIs, all CC0. The current API page says the live API is
// free for any use and requires visible credit plus a unique application UA:
//   https://polyhaven.com/our-api
// Browsers cannot override User-Agent, so browser calls use the identifying
// /api/polyhaven dev/host proxy. Node calls add ASSETLIB_USER_AGENT here.
//
// Donation-vault ("early access") assets never appear in the public /assets
// dump today; the date_published guard below keeps them out if that changes.

import { ASSETLIB_USER_AGENT, ASSET_REF_KINDS, pickResolution } from './assetRef.js';

export const POLYHAVEN_API_URL = 'https://api.polyhaven.com';
export const POLYHAVEN_BROWSER_API_URL = '/api/polyhaven';
export const POLYHAVEN_THUMB_URL = 'https://cdn.polyhaven.com/asset_img/thumbs';

export const POLYHAVEN_ATTRIBUTION = Object.freeze({
  license: 'CC0',
  sourceLabel: 'Poly Haven',
  sourceUrl: 'https://polyhaven.com',
});

/** API `type` param values, in the order the lab offers them. */
export const POLYHAVEN_ASSET_TYPES = Object.freeze(['models', 'textures', 'hdris']);

const KIND_BY_TYPE = { hdris: 'hdri', models: 'model', textures: 'texture' };

// files-doc keys for texture-set maps → the material slots we care about.
// `arm` is a packed occlusion(R)/roughness(G)/metalness(B) map — exactly the
// glTF ORM layout three.js samples aoMap/roughnessMap/metalnessMap from.
const TEXTURE_MAP_KEYS = Object.freeze({
  ao: 'AO',
  arm: 'arm',
  diffuse: 'Diffuse',
  displacement: 'Displacement',
  normal: 'nor_gl',
  roughness: 'Rough',
});

export function polyhavenThumbnailUrl(id, { width = 256, height = 256 } = {}) {
  return `${POLYHAVEN_THUMB_URL}/${encodeURIComponent(id)}.png?width=${width}&height=${height}`;
}

export function polyhavenAssetPageUrl(id) {
  return `https://polyhaven.com/a/${encodeURIComponent(id)}`;
}

/**
 * Raw `GET /assets?type=…` payload (`{ id: info }`) → sorted array of
 * normalized asset refs. `now` is epoch seconds; assets published in the
 * future (donation vault) are dropped.
 */
export function normalizePolyhavenIndex(raw, { type = 'models', now = Date.now() / 1000 } = {}) {
  const kind = KIND_BY_TYPE[type];
  if (!kind || !ASSET_REF_KINDS.includes(kind)) {
    throw new Error(`normalizePolyhavenIndex: unknown type "${type}".`);
  }
  const refs = [];
  for (const [id, info] of Object.entries(raw ?? {})) {
    if (!info || typeof info !== 'object') continue;
    if ((info.date_published ?? 0) > now) continue;
    refs.push({
      attribution: POLYHAVEN_ATTRIBUTION,
      authors: Object.keys(info.authors ?? {}),
      categories: (info.categories ?? []).map((value) => String(value).toLowerCase()),
      datePublished: info.date_published ?? 0,
      dimensions: info.dimensions ?? null,
      id,
      kind,
      maxResolution: info.max_resolution ?? null,
      name: info.name ?? id,
      pageUrl: polyhavenAssetPageUrl(id),
      polycount: info.polycount ?? null,
      source: 'polyhaven',
      tags: (info.tags ?? []).map((value) => String(value).toLowerCase()),
      thumbnailUrl: info.thumbnail_url ?? polyhavenThumbnailUrl(id),
    });
  }
  return refs.sort((a, b) => a.name.localeCompare(b.name));
}

const indexCache = new Map();

function defaultPolyhavenApiUrl() {
  return typeof window === 'undefined' ? POLYHAVEN_API_URL : POLYHAVEN_BROWSER_API_URL;
}

function polyhavenRequestOptions(headers) {
  const merged = new Headers(headers);
  if (typeof window === 'undefined' && !merged.has('user-agent')) {
    merged.set('user-agent', ASSETLIB_USER_AGENT);
  }
  return { headers: merged };
}

/** Full asset index for one type, normalized; cached per type per session.
 * Browser hosts must implement `/api/polyhaven` as an identifying proxy;
 * Node defaults to the upstream API and supplies ASSETLIB_USER_AGENT. */
export function fetchPolyhavenIndex({
  type = 'models',
  fetchImpl = fetch,
  headers = {},
  apiUrl = defaultPolyhavenApiUrl(),
  now = Date.now() / 1000,
} = {}) {
  const cacheKey = `${apiUrl}\n${type}`;
  if (!indexCache.has(cacheKey)) {
    const promise = (async () => {
      const response = await fetchImpl(
        `${apiUrl.replace(/\/$/, '')}/assets?type=${type}`,
        polyhavenRequestOptions(headers),
      );
      if (!response.ok) throw new Error(`Poly Haven /assets?type=${type}: ${response.status}`);
      return normalizePolyhavenIndex(await response.json(), { now, type });
    })();
    // a failed fetch must not poison the session cache
    promise.catch(() => indexCache.delete(cacheKey));
    indexCache.set(cacheKey, promise);
  }
  return indexCache.get(cacheKey);
}

/** Raw `GET /files/{id}` document, using the same browser/Node routing. */
export async function fetchPolyhavenFiles(id, {
  fetchImpl = fetch,
  headers = {},
  apiUrl = defaultPolyhavenApiUrl(),
} = {}) {
  const response = await fetchImpl(
    `${apiUrl.replace(/\/$/, '')}/files/${encodeURIComponent(id)}`,
    polyhavenRequestOptions(headers),
  );
  if (!response.ok) throw new Error(`Poly Haven /files/${id}: ${response.status}`);
  return response.json();
}

/**
 * files doc → one loadable glTF download:
 *   { format: 'gltf', resolution, url, sizeBytes,
 *     resources: { 'textures/…_diff_1k.jpg': 'https://…', '….bin': '…' } }
 * `resources` maps the glTF's internal relative URIs to their real CDN URLs
 * (Poly Haven hosts them outside the glTF's directory) — feed it to
 * loadImportedModel, which resolves them via a LoadingManager URL modifier.
 */
export function resolvePolyhavenModelDownload(filesDoc, { resolution = '1k' } = {}) {
  const byResolution = filesDoc?.gltf;
  const picked = pickResolution(byResolution, resolution);
  if (!picked) throw new Error('resolvePolyhavenModelDownload: no glTF files in document.');
  const entry = byResolution[picked]?.gltf;
  if (!entry?.url) throw new Error(`resolvePolyhavenModelDownload: no glTF url at ${picked}.`);
  const resources = {};
  let sizeBytes = entry.size ?? 0;
  for (const [relativePath, file] of Object.entries(entry.include ?? {})) {
    resources[relativePath] = file.url;
    sizeBytes += file.size ?? 0;
  }
  return { format: 'gltf', resolution: picked, resources, sizeBytes, url: entry.url };
}

/**
 * files doc → PBR map urls for a texture set:
 *   { resolution, format, maps: { diffuse: {url,sizeBytes}, normal, arm, … } }
 * Prefers `arm` (packed ORM) plus diffuse/normal; individual AO/Rough are
 * still included when present so callers can choose.
 */
export function resolvePolyhavenTextureDownload(filesDoc, { resolution = '1k', format = 'jpg' } = {}) {
  const maps = {};
  let picked = null;
  for (const [slot, key] of Object.entries(TEXTURE_MAP_KEYS)) {
    const byResolution = filesDoc?.[key];
    if (!byResolution) continue;
    const mapResolution = pickResolution(byResolution, resolution);
    if (!mapResolution) continue;
    const byFormat = byResolution[mapResolution];
    const file = byFormat?.[format] ?? byFormat?.jpg ?? byFormat?.png;
    if (!file?.url) continue;
    picked = picked ?? mapResolution;
    maps[slot] = { sizeBytes: file.size ?? 0, url: file.url };
  }
  if (!maps.diffuse) throw new Error('resolvePolyhavenTextureDownload: no diffuse map found.');
  return { format, maps, resolution: picked };
}
