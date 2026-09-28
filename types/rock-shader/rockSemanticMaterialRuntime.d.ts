/**
 * Resolves every fail-closed GLB material binding before the asset is exposed.
 * Throws on any missing manifest, set, or source texture; there is no fallback.
 *
 * @param {import('three').Object3D} root
 * @param {{
 *   fetchImpl?: typeof globalThis.fetch,
 *   modelUrl?: string | URL,
 *   textureLoader?: TextureLoader,
 * }} [options]
 * @returns {Promise<{ materialSets: number, textures: number }>}
 */
export function prepareRockSemanticMaterialBindings(root: import("three").Object3D, { fetchImpl, modelUrl, textureLoader, }?: {
    fetchImpl?: typeof globalThis.fetch;
    modelUrl?: string | URL;
    textureLoader?: TextureLoader;
}): Promise<{
    materialSets: number;
    textures: number;
}>;
/** Preserves cache-owned Texture instances when official assets clone materials. */
export function copyRockSemanticMaterialBinding(source: any, target: any): any;
export function rockSemanticMaterialTextures(material: any): any;
export function clearRockSemanticMaterialCaches({ disposeTextures }?: {
    disposeTextures?: boolean;
}): void;
export const ROCK_MATERIAL_BINDING_SCHEMA: "toonlab.rock-material-binding";
export const ROCK_SEMANTIC_MATERIAL_SET_SCHEMA: "toonlab.rock-semantic-material-set";
import { TextureLoader } from 'three';
