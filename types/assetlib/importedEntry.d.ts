/**
 * Normalized ref (+ the resolved download) → validated catalog entry.
 * For models pass `download` (resolvePolyhavenModelDownload result); for
 * texture sets pass `textureSet` (resolvePolyhavenTextureDownload result).
 */
export function importedAssetCatalogEntry(ref: any, { download, textureSet }?: {
    download?: any;
    textureSet?: any;
}): {
    cluster: any;
    id: any;
    kind: string;
    label: any;
    spawn: any;
    tags: string[];
    version: number;
};
export const IMPORTED_ENTRY_CLUSTER: "assetlib";
