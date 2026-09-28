export function polyhavenThumbnailUrl(id: any, { width, height }?: {
    width?: number;
    height?: number;
}): string;
export function polyhavenAssetPageUrl(id: any): string;
/**
 * Raw `GET /assets?type=…` payload (`{ id: info }`) → sorted array of
 * normalized asset refs. `now` is epoch seconds; assets published in the
 * future (donation vault) are dropped.
 */
export function normalizePolyhavenIndex(raw: any, { type, now }?: {
    type?: string;
    now?: number;
}): {
    attribution: Readonly<{
        license: "CC0";
        sourceLabel: "Poly Haven";
        sourceUrl: "https://polyhaven.com";
    }>;
    authors: string[];
    categories: any;
    datePublished: any;
    dimensions: any;
    id: string;
    kind: any;
    maxResolution: any;
    name: any;
    pageUrl: string;
    polycount: any;
    source: string;
    tags: any;
    thumbnailUrl: any;
}[];
/** Full asset index for one type, normalized; cached per type per session.
 * Browser hosts must implement `/api/polyhaven` as an identifying proxy;
 * Node defaults to the upstream API and supplies ASSETLIB_USER_AGENT. */
export function fetchPolyhavenIndex({ type, fetchImpl, headers, apiUrl, now, }?: {
    type?: string;
    fetchImpl?: typeof fetch;
    headers?: {};
    apiUrl?: string;
    now?: number;
}): any;
/** Raw `GET /files/{id}` document, using the same browser/Node routing. */
export function fetchPolyhavenFiles(id: any, { fetchImpl, headers, apiUrl, }?: {
    fetchImpl?: typeof fetch;
    headers?: {};
    apiUrl?: string;
}): Promise<any>;
/**
 * files doc → one loadable glTF download:
 *   { format: 'gltf', resolution, url, sizeBytes,
 *     resources: { 'textures/…_diff_1k.jpg': 'https://…', '….bin': '…' } }
 * `resources` maps the glTF's internal relative URIs to their real CDN URLs
 * (Poly Haven hosts them outside the glTF's directory) — feed it to
 * loadImportedModel, which resolves them via a LoadingManager URL modifier.
 */
export function resolvePolyhavenModelDownload(filesDoc: any, { resolution }?: {
    resolution?: string;
}): {
    format: string;
    resolution: string;
    resources: {};
    sizeBytes: any;
    url: any;
};
/**
 * files doc → PBR map urls for a texture set:
 *   { resolution, format, maps: { diffuse: {url,sizeBytes}, normal, arm, … } }
 * Prefers `arm` (packed ORM) plus diffuse/normal; individual AO/Rough are
 * still included when present so callers can choose.
 */
export function resolvePolyhavenTextureDownload(filesDoc: any, { resolution, format }?: {
    resolution?: string;
    format?: string;
}): {
    format: string;
    maps: {};
    resolution: string;
};
export const POLYHAVEN_API_URL: "https://api.polyhaven.com";
export const POLYHAVEN_BROWSER_API_URL: "/api/polyhaven";
export const POLYHAVEN_THUMB_URL: "https://cdn.polyhaven.com/asset_img/thumbs";
export const POLYHAVEN_ATTRIBUTION: Readonly<{
    license: "CC0";
    sourceLabel: "Poly Haven";
    sourceUrl: "https://polyhaven.com";
}>;
/** API `type` param values, in the order the lab offers them. */
export const POLYHAVEN_ASSET_TYPES: readonly string[];
