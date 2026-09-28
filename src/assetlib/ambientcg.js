// CC0 asset source: ambientCG (ambientcg.com) — PBR material sets, CC0.
//
// The ambientCG API sends no CORS headers, so browsers reach it through a
// backend route: the Vite dev server proxies AMBIENTCG_PROXY_API →
// /api/v2/full_json and AMBIENTCG_PROXY_GET → /get (see vite.config.js);
// any future hosted backend implements the same two paths. Node callers
// (MCP tools, scripts) hit ambientcg.com directly — pass the default urls.
//
// Downloads are ZIP archives (e.g. Bricks097_1K-JPG.zip) — there is no
// per-map file URL; extract with src/assetlib/zip.js (browser/Node) or
// node:zlib. /get 302-redirects to their CDN, so proxies must follow
// redirects server-side.

import { ASSETLIB_USER_AGENT } from './assetRef.js';

export const AMBIENTCG_API_URL = 'https://ambientcg.com/api/v2/full_json';
export const AMBIENTCG_GET_URL = 'https://ambientcg.com/get';

/** Backend/dev-proxy routes the browser uses instead of ambientcg.com. */
export const AMBIENTCG_PROXY_API = '/api/ambientcg';
export const AMBIENTCG_PROXY_GET = '/api/ambientcg-get';

/** Absolute ambientCG download url → same request through the proxy route.
 * Recipes always store the ORIGINAL url (portable across Node/browser);
 * rewrite only at fetch time. */
export function rewriteAmbientcgDownloadUrl(url, base = AMBIENTCG_PROXY_GET) {
  return String(url ?? '').replace(AMBIENTCG_GET_URL, base);
}

export const AMBIENTCG_ATTRIBUTION = Object.freeze({
  license: 'CC0',
  sourceLabel: 'ambientCG',
  sourceUrl: 'https://ambientcg.com',
});

const KIND_BY_DATA_TYPE = { HDRI: 'hdri', Material: 'texture', Model: 'model' };

/** One API page (`foundAssets`) → normalized refs with a `downloads` list. */
export function normalizeAmbientcgAssets(payload) {
  const refs = [];
  for (const asset of payload?.foundAssets ?? []) {
    const kind = KIND_BY_DATA_TYPE[asset.dataType];
    if (!kind) continue;
    const downloads = [];
    for (const folder of Object.values(asset.downloadFolders ?? {})) {
      for (const group of Object.values(folder.downloadFiletypeCategories ?? {})) {
        for (const download of group.downloads ?? []) {
          downloads.push({
            attribute: download.attribute,
            fileName: download.fileName,
            filetype: download.filetype,
            sizeBytes: download.size ?? 0,
            url: download.downloadLink,
          });
        }
      }
    }
    refs.push({
      attribution: AMBIENTCG_ATTRIBUTION,
      authors: [],
      categories: [asset.displayCategory, asset.category]
        .filter(Boolean)
        .map((value) => String(value).toLowerCase()),
      downloads,
      id: asset.assetId,
      kind,
      name: asset.displayName || asset.assetId,
      pageUrl: asset.shortLink ?? `https://ambientcg.com/a/${encodeURIComponent(asset.assetId)}`,
      source: 'ambientcg',
      tags: (asset.tags ?? []).map((value) => String(value).toLowerCase()),
      thumbnailUrl: asset.previewImage?.['256-PNG'] ?? Object.values(asset.previewImage ?? {})[0] ?? null,
    });
  }
  return refs;
}

/** Remote search (the corpus is too big to index locally like Poly Haven's).
 * Pass `id` for an exact asset lookup — the free-text `q` search does NOT
 * match asset ids like "Bricks097". */
export async function searchAmbientcg({
  query = '',
  id = null,
  type = 'Material',
  limit = 50,
  offset = 0,
  apiUrl = AMBIENTCG_API_URL,
  fetchImpl = fetch,
  // identify per ToS from Node; browsers cannot set UA (the proxy's origin
  // request identifies the app instead)
  userAgent = typeof window === 'undefined' ? ASSETLIB_USER_AGENT : null,
} = {}) {
  const params = new URLSearchParams({
    include: 'imageData,downloadData,tagData,displayData',
    limit: String(limit),
    offset: String(offset),
  });
  if (!id) params.set('type', type);
  if (id) params.set('id', id);
  else if (query) params.set('q', query);
  const response = await fetchImpl(`${apiUrl}?${params}`, {
    headers: userAgent ? { 'user-agent': userAgent } : {},
  });
  if (!response.ok) throw new Error(`ambientCG API: ${response.status}`);
  return normalizeAmbientcgAssets(await response.json());
}

/**
 * Pick a ZIP download from a normalized ref: exact `${resolution}-${format}`
 * attribute match (e.g. "1K-JPG"), else the smallest zip.
 */
export function resolveAmbientcgDownload(ref, { resolution = '1K', format = 'JPG' } = {}) {
  const zips = (ref?.downloads ?? []).filter((download) => download.filetype === 'zip');
  if (zips.length === 0) throw new Error(`resolveAmbientcgDownload: no zip downloads on "${ref?.id}".`);
  const wanted = `${resolution}-${format}`.toUpperCase();
  const exact = zips.find((download) => (download.attribute ?? '').toUpperCase() === wanted);
  return exact ?? zips.sort((a, b) => a.sizeBytes - b.sizeBytes)[0];
}
