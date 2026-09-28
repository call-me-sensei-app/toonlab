/**
 * Load a (possibly multi-file) glTF whose companion files live at arbitrary
 * CDN URLs. `resources` maps the glTF's internal relative URIs to real URLs
 * (Poly Haven serves textures/bin outside the glTF's own directory); a
 * LoadingManager URL modifier rewrites each request by suffix match, which
 * also covers URL-encoded variants.
 */
export function loadImportedModel({ url, resources, dracoDecoderPath, ktx2TranscoderPath, renderer, }: {
    url: any;
    resources?: {};
    dracoDecoderPath?: string;
    ktx2TranscoderPath?: string;
    renderer?: any;
}): Promise<THREE.Group<THREE.Object3DEventMap>>;
/**
 * PBR texture-set maps → a tiling MeshStandardMaterial. Prefers the packed
 * `arm` map (occlusion-R / roughness-G / metalness-B — the glTF ORM layout
 * three samples those slots from); falls back to individual AO/Rough maps.
 */
export function loadImportedTextureMaterial({ maps }: {
    maps: any;
}, { repeat }?: {
    repeat?: number;
}): Promise<THREE.MeshStandardMaterial>;
/**
 * An ambientCG ZIP download → tiling MeshStandardMaterial: fetch the archive
 * (through the backend/dev proxy in browsers — pass rewriteUrl), extract the
 * PBR maps in memory, and feed them to loadImportedTextureMaterial as
 * object-URLs (revoked once the textures are on the GPU).
 */
export function loadAmbientcgTextureMaterial({ url }: {
    url: any;
}, { repeat, rewriteUrl }?: {
    repeat?: number;
    rewriteUrl?: (value: any) => any;
}): Promise<THREE.MeshStandardMaterial>;
/**
 * The spawn snippet entry point: a saved import recipe → live content.
 *   model   → { kind: 'model', object3D }
 *   texture → { kind: 'texture', material }
 * Recipes store portable origin urls; browsers pass `rewriteUrl`
 * (e.g. rewriteAmbientcgDownloadUrl) to route zip fetches through the proxy.
 */
export function loadImportedAsset(recipe: any, { repeat, rewriteUrl }?: {
    repeat?: number;
    rewriteUrl?: (value: any) => any;
}): Promise<{
    kind: string;
    object3D: THREE.Group<THREE.Object3DEventMap>;
    material?: undefined;
} | {
    kind: string;
    material: THREE.MeshStandardMaterial;
    object3D?: undefined;
}>;
import * as THREE from 'three';
