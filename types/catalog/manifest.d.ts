/** Normalizes + validates in one step; throws on unusable input. */
export function createCatalogEntry({ id, cluster, kind, label, description, recipe, thumbnail, spawn, tags, budget, runtime, }?: {
    kind?: string;
    label?: any;
    description?: any;
    recipe?: any;
    thumbnail?: any;
    spawn?: any;
    tags?: any[];
    budget?: any;
    runtime?: any;
}): {
    cluster: any;
    id: any;
    kind: string;
    label: any;
    spawn: any;
    tags: string[];
    version: number;
};
export function validateCatalogEntry(input: any): {
    errors: string[];
    ok: boolean;
};
export const CATALOG_ENTRY_VERSION: 1;
export const CATALOG_ENTRY_KINDS: readonly string[];
