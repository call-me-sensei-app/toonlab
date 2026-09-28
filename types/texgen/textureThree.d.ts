/**
 * Wraps every byte buffer of an evaluateTextureMaps() result in a
 * DataTexture. Pass a previous `textures` object to update in place —
 * buffers of an unchanged size are re-tagged with needsUpdate; a size
 * change disposes and recreates. Returns { textures, recreated }.
 */
export function syncTextureMapTextures(maps: any, textures?: any): {
    recreated: boolean;
    textures: any;
};
/** Disposes every texture created by syncTextureMapTextures. */
export function disposeTextureMapTextures(textures: any): void;
export const TEXTURE_THREE_MAP_IDS: readonly string[];
