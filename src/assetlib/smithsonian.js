// CC0 asset source: Smithsonian 3D Open Access (3d.si.edu) — museum-grade
// scans published through the keyless Smithsonian 3D file API. This is not
// the broader api.si.edu Collections API (which uses an api.data.gov key).
// The 3D API states that every file in its response is part of Smithsonian
// Open Access; this client still accepts only the low Web3D GLB rows used by
// browsers and joins their separately indexed Image2D thumbnail rows. The
// API responds with CORS `*`, so browser and Node callers use it directly.

import { ASSETLIB_USER_AGENT } from './assetRef.js';

export const SMITHSONIAN_3D_API_URL = 'https://3d-api.si.edu/api/v1.0';

export const SMITHSONIAN_3D_ATTRIBUTION = Object.freeze({
  license: 'CC0',
  sourceLabel: 'Smithsonian 3D Open Access',
  sourceUrl: 'https://3d.si.edu',
});

const ALLOWED_FILE_HOSTS = new Set(['3d-api.si.edu', 'cdn.3d-api.si.edu']);
const PAGE_SIZE = 1000;
const UUID_TITLE = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

function requestOptions(headers) {
  const merged = new Headers(headers);
  if (typeof window === 'undefined' && !merged.has('user-agent')) {
    merged.set('user-agent', ASSETLIB_USER_AGENT);
  }
  return { headers: merged };
}

function packageId(content) {
  return String(content?.model_url ?? '').replace(/^3d_package:/, '').trim();
}

function trustedFileUrl(value) {
  const raw = String(value ?? '');
  // Some legacy rows wrap the CDN URL inside a 3d-api.si.edu path.
  const nestedIndex = raw.indexOf('https://', 'https://'.length);
  const candidate = nestedIndex > 0 ? raw.slice(nestedIndex) : raw;
  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' && ALLOWED_FILE_HOSTS.has(url.hostname) ? url.toString() : null;
  } catch {
    return null;
  }
}

function words(value) {
  return [...new Set(String(value ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2))]
    .slice(0, 20);
}

/** Official Image2D/Thumb rows keyed by the 3D package they illustrate. */
export function normalizeSmithsonianThumbnails(rows) {
  const thumbnails = new Map();
  for (const row of rows ?? []) {
    const content = row?.content ?? {};
    const id = packageId(content);
    if (!id || thumbnails.has(id)) continue;
    if (String(content.file_type ?? '').toLowerCase() !== 'jpg') continue;
    if (String(content.quality ?? '').toLowerCase() !== 'thumb') continue;
    if (String(content.usage ?? '').toLowerCase() !== 'image2d') continue;
    const thumbnailUrl = trustedFileUrl(content.uri);
    if (thumbnailUrl) thumbnails.set(id, thumbnailUrl);
  }
  return thumbnails;
}

/** Official low-quality Web3D GLB rows -> normalized asset refs. */
export function normalizeSmithsonianModels(rows, thumbnailByPackageId = new Map()) {
  const refs = [];
  const seen = new Set();
  for (const row of rows ?? []) {
    const content = row?.content ?? {};
    const id = packageId(content);
    if (!id || seen.has(id)) continue;
    if (String(content.file_type ?? '').toLowerCase() !== 'glb') continue;
    if (String(content.model_type ?? '').toLowerCase() !== 'glb') continue;
    if (String(content.quality ?? '').toLowerCase() !== 'low') continue;
    if (String(content.usage ?? '').toLowerCase() !== 'web3d') continue;
    const modelUrl = trustedFileUrl(content.uri);
    if (!modelUrl) continue;
    seen.add(id);

    const name = (String(row.title ?? id).trim().replace(/^:\s*/, '') || id);
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'object';
    const owningUnit = String(content.owning_unit ?? row.owning_unit ?? '').trim().toLowerCase();
    refs.push({
      attribution: SMITHSONIAN_3D_ATTRIBUTION,
      authors: [],
      categories: ['smithsonian open access', owningUnit].filter(Boolean),
      download: {
        format: 'glb',
        resources: {},
        sizeBytes: Number(content.file_size) || 0,
        url: modelUrl,
      },
      id,
      kind: 'model',
      name,
      openAccess: true,
      pageUrl: `https://3d.si.edu/object/3d/${encodeURIComponent(`${slug}:${id}`)}`,
      source: 'smithsonian',
      tags: words(name),
      thumbnailUrl: thumbnailByPackageId.get(id) ?? null,
    });
  }
  return refs;
}

/** Gallery cards need both visual and human metadata. The raw file index
 * also contains unpublished/legacy packages whose only title is a UUID and
 * which have no Image2D thumbnail; those remain valid downloadable refs but
 * must not become blank public-gallery cards. */
export function isSmithsonianGalleryReady(ref) {
  const name = String(ref?.name ?? '').trim();
  return Boolean(ref?.thumbnailUrl)
    && Boolean(name)
    && name !== ref?.id
    && !UUID_TITLE.test(name);
}

/** Fetch every page for one file type/quality pair. */
export async function fetchSmithsonianFileRows({
  apiUrl = SMITHSONIAN_3D_API_URL,
  fetchImpl = fetch,
  fileType,
  headers = {},
  modelId = null,
  quality,
  pageSize = PAGE_SIZE,
} = {}) {
  if (!fileType || !quality) throw new Error('Smithsonian 3D fileType and quality are required.');
  const allRows = [];
  let start = 0;
  let rowCount = Number.POSITIVE_INFINITY;
  while (start < rowCount) {
    const params = new URLSearchParams({
      file_quality: quality,
      file_type: fileType,
      rows: String(pageSize),
      start: String(start),
    });
    if (modelId) params.set('model_url', String(modelId).replace(/^3d_package:/, ''));
    const response = await fetchImpl(
      `${apiUrl.replace(/\/$/, '')}/content/file/search?${params}`,
      requestOptions(headers),
    );
    if (!response.ok) throw new Error(`Smithsonian 3D file search: ${response.status}`);
    const payload = await response.json();
    const page = Array.isArray(payload?.rows) ? payload.rows : [];
    allRows.push(...page);
    rowCount = Number(payload?.rowCount);
    if (!Number.isFinite(rowCount)) rowCount = start + page.length;
    if (page.length === 0) break;
    start += page.length;
  }
  return allRows;
}

const indexCache = new Map();
const assetCache = new Map();

/** One package lookup for ToonLab's detail page. */
export function fetchSmithsonianAsset(id, {
  apiUrl = SMITHSONIAN_3D_API_URL,
  fetchImpl = fetch,
  headers = {},
} = {}) {
  const modelId = String(id ?? '').replace(/^3d_package:/, '').trim();
  if (!modelId) return Promise.resolve(null);
  const cacheKey = `${apiUrl}\n${modelId}`;
  if (!assetCache.has(cacheKey)) {
    const promise = (async () => {
      const [modelRows, thumbnailRows] = await Promise.all([
        fetchSmithsonianFileRows({ apiUrl, fetchImpl, fileType: 'glb', headers, modelId, quality: 'Low' }),
        fetchSmithsonianFileRows({ apiUrl, fetchImpl, fileType: 'jpg', headers, modelId, quality: 'Thumb' }),
      ]);
      return normalizeSmithsonianModels(
        modelRows,
        normalizeSmithsonianThumbnails(thumbnailRows),
      ).find((ref) => ref.id === modelId) ?? null;
    })();
    promise.catch(() => assetCache.delete(cacheKey));
    assetCache.set(cacheKey, promise);
  }
  return assetCache.get(cacheKey);
}

/** Full browser-ready Smithsonian CC0 3D index, cached per API endpoint. */
export function fetchSmithsonianIndex({
  apiUrl = SMITHSONIAN_3D_API_URL,
  fetchImpl = fetch,
  headers = {},
} = {}) {
  if (!indexCache.has(apiUrl)) {
    const promise = (async () => {
      const [modelRows, thumbnailRows] = await Promise.all([
        fetchSmithsonianFileRows({ apiUrl, fetchImpl, fileType: 'glb', headers, quality: 'Low' }),
        fetchSmithsonianFileRows({ apiUrl, fetchImpl, fileType: 'jpg', headers, quality: 'Thumb' }),
      ]);
      return normalizeSmithsonianModels(
        modelRows,
        normalizeSmithsonianThumbnails(thumbnailRows),
      ).sort((a, b) => a.name.localeCompare(b.name));
    })();
    promise.catch(() => indexCache.delete(apiUrl));
    indexCache.set(apiUrl, promise);
  }
  return indexCache.get(apiUrl);
}
