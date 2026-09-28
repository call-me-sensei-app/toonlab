/**
 * Raw projects.json → CC0-only collection descriptors:
 *   { id, name, creator, description, license, assetDataFile, pageUrl }
 */
export function normalizeOs3dProjects(raw: any): {
    assetDataFile: any;
    creator: any;
    description: any;
    id: any;
    license: any;
    name: any;
    pageUrl: any;
}[];
/**
 * One collection's assets/*.json + its project descriptor → normalized refs
 * (kind is always 'model'; download embedded like Poly Pizza's). Drafts,
 * non-public rows, and non-glTF formats are dropped.
 */
export function normalizeOs3dAssets(raw: any, project: any): {
    attribution: {
        sourceLabel: "Open Source 3D Assets";
        sourceUrl: "https://opensource3dassets.com";
        license: any;
    };
    authors: any[];
    categories: string[];
    download: {
        format: string;
        resources: {};
        sizeBytes: any;
        url: any;
    };
    id: any;
    kind: string;
    name: any;
    pageUrl: any;
    source: string;
    tags: any;
    thumbnailUrl: any;
}[];
/**
 * Full CC0 index (projects.json + every CC0 collection's asset file, fetched
 * in parallel), normalized and cached per session. A collection that fails
 * to fetch is skipped rather than blanking the browser; the projects.json
 * fetch itself failing throws.
 */
export function fetchOs3dIndex({ dataUrl, fetchImpl }?: {
    dataUrl?: string;
    fetchImpl?: typeof fetch;
}): any;
export const OS3D_DATA_URL: "https://raw.githubusercontent.com/ToxSam/open-source-3d-assets/main/data";
export const OS3D_SOURCE: Readonly<{
    sourceLabel: "Open Source 3D Assets";
    sourceUrl: "https://opensource3dassets.com";
}>;
