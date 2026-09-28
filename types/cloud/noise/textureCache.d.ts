export function getCloudTextureCacheStats(): {
    retainedBytes: number;
    retainedEntries: number;
    maxBytes: number;
    maxEntries: number;
};
export function createCloudTextureCache(namespace: any): {
    get(key: any): any;
    set(key: any, texture: any): void;
    values(): Generator<any, void, unknown>;
    clear(): void;
};
