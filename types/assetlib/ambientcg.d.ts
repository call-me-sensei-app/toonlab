/** Absolute ambientCG download url → same request through the proxy route.
 * Recipes always store the ORIGINAL url (portable across Node/browser);
 * rewrite only at fetch time. */
export function rewriteAmbientcgDownloadUrl(url: any, base?: string): string;
/** One API page (`foundAssets`) → normalized refs with a `downloads` list. */
export function normalizeAmbientcgAssets(payload: any): {
    attribution: Readonly<{
        license: "CC0";
        sourceLabel: "ambientCG";
        sourceUrl: "https://ambientcg.com";
    }>;
    authors: any[];
    categories: string[];
    downloads: {
        attribute: any;
        fileName: any;
        filetype: any;
        sizeBytes: any;
        url: any;
    }[];
    id: any;
    kind: any;
    name: any;
    pageUrl: any;
    source: string;
    tags: any;
    thumbnailUrl: any;
}[];
/** Remote search (the corpus is too big to index locally like Poly Haven's).
 * Pass `id` for an exact asset lookup — the free-text `q` search does NOT
 * match asset ids like "Bricks097". */
export function searchAmbientcg({ query, id, type, limit, offset, apiUrl, fetchImpl, userAgent, }?: {
    query?: string;
    id?: any;
    type?: string;
    limit?: number;
    offset?: number;
    apiUrl?: string;
    fetchImpl?: typeof fetch;
    userAgent?: string;
}): Promise<{
    attribution: Readonly<{
        license: "CC0";
        sourceLabel: "ambientCG";
        sourceUrl: "https://ambientcg.com";
    }>;
    authors: any[];
    categories: string[];
    downloads: {
        attribute: any;
        fileName: any;
        filetype: any;
        sizeBytes: any;
        url: any;
    }[];
    id: any;
    kind: any;
    name: any;
    pageUrl: any;
    source: string;
    tags: any;
    thumbnailUrl: any;
}[]>;
/**
 * Pick a ZIP download from a normalized ref: exact `${resolution}-${format}`
 * attribute match (e.g. "1K-JPG"), else the smallest zip.
 */
export function resolveAmbientcgDownload(ref: any, { resolution, format }?: {
    resolution?: string;
    format?: string;
}): any;
export const AMBIENTCG_API_URL: "https://ambientcg.com/api/v2/full_json";
export const AMBIENTCG_GET_URL: "https://ambientcg.com/get";
/** Backend/dev-proxy routes the browser uses instead of ambientcg.com. */
export const AMBIENTCG_PROXY_API: "/api/ambientcg";
export const AMBIENTCG_PROXY_GET: "/api/ambientcg-get";
export const AMBIENTCG_ATTRIBUTION: Readonly<{
    license: "CC0";
    sourceLabel: "ambientCG";
    sourceUrl: "https://ambientcg.com";
}>;
