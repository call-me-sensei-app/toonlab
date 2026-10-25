/**
 * The meshes conversion visits, in traversal order. Their index in this list
 * is a mesh's key in a precomputed record.
 */
export function listConvertibleMeshes(root: any): any[];
/**
 * The texture evidence conversion consults: per mesh and material slot the
 * alpha coverage, the skin share of a material named as skin, the
 * base-colour texels at the vertices the eye-white lid and stocking bakes
 * look at and an imported MMD toon ramp's tone; for the whole model whether
 * the face texture already draws a nose.
 * `measure` holds the live measurements; a recording source also stores what
 * was measured, and a precomputed source answers from the record only (null
 * where the record has nothing, which conversion treats as "no evidence", as
 * it does for an unreadable texture).
 */
export function createTextureEvidence({ meshes, measure, precomputed, record }: {
    meshes: any;
    measure?: {};
    precomputed?: any;
    record?: any;
}): {
    alphaCoverage: (mesh: any, material: any, slot: any) => any;
    mmdRampTone: (mesh: any, material: any, slot: any, measureFn: any) => any;
    noseDrawn: (measureFn: any) => any;
    skinEvidence: (mesh: any, material: any, slot: any) => any;
    vertexTexels: (mesh: any, material: any, slot: any, measureFn: any) => any;
};
/**
 * Collects what inferAutoRoleWeights wrote onto `root` into a record.
 * `inputs` are the conversion inputs the result depends on (recorded so a
 * runtime with different ones is warned); `evidence` the recorded texture
 * evidence.
 */
export function collectAutoRolesRecord(root: any, { autoRoles, evidence, forwardInferred, inputs, meshes }: {
    autoRoles: any;
    evidence: any;
    forwardInferred: any;
    inputs: any;
    meshes: any;
}): {
    autoRoles: any;
    evidence: any;
    format: string;
    forward: any[];
    forwardInferred: boolean;
    headEstimate: any;
    inputs: any;
    meshes: any[];
    model: {
        meshes: any;
        vertices: number;
    };
    toonlab: string;
    version: number;
};
/**
 * Why `record` cannot be applied to the meshes listConvertibleMeshes found,
 * or null when it matches.
 */
export function describeAutoRolesMismatch(record: any, meshes: any): string;
/**
 * Writes a record's automatic roles onto `root`, as inferAutoRoleWeights
 * would have. Returns the recorded analysis result (with `source:
 * 'precomputed'`), or `{ applied: false, reason }` without modifying anything
 * when the record does not match the model.
 */
export function applyAutoRolesRecord(root: any, record: any, meshes: any): any;
/** Names of recorded inputs that differ from this conversion's. */
export function differingAutoRolesInputs(recorded?: {}, current?: {}): string[];
/**
 * Box-filters an RGBA role mask down to at most `maxSize` on its long side by
 * an integer factor (a 1024 mask to 512 averages 2×2 texels). Averaging
 * keeps the role partition up to rounding. Returns the mask unchanged when it
 * already fits or the factor does not divide its size.
 */
export function downsampleRoleMask(mask: any, maxSize: any): any;
/**
 * Splits a record into a JSON document and its role masks. Each mask is
 * returned as raw RGBA (row 0 at v = 0, the top row of an image file) under
 * the URI the document names for it: `maskUri(meshIndex)` (default
 * `role-mask-<index>.png`, relative to the document). `maskSize` caps the
 * masks' size (box filter).
 */
export function serializeAutoRoles(record: any, { maskSize, maskUri, pretty }?: {
    maskSize?: number;
    maskUri?: (index: any) => string;
    pretty?: boolean;
}): {
    json: string;
    masks: any[];
};
/**
 * Turns a serialised record (JSON text or the parsed object) back into one
 * applyToonShader accepts. `masks` supplies each role mask by the URI the
 * document names: a texture (an image, a DataTexture or a CompressedTexture
 * such as KTX2) or raw `{ data, width, height }` RGBA. A mask left out is
 * dropped, and that mesh shades from its vertex weights alone.
 */
export function parseAutoRoles(input: any, { masks }?: {
    masks?: {};
}): any;
/**
 * Fetches a serialised record and its role masks (resolved relative to
 * `url`) and parses it. `loadTexture(url)` loads a mask (default: three's
 * TextureLoader); pass a KTX2Loader's `loadAsync` for `.ktx2` masks.
 */
export function loadAutoRoles(url: any, { fetch: fetchImpl, loadTexture }?: {
    fetch?: typeof fetch;
    loadTexture?: typeof loadImageTexture;
}): Promise<any>;
export const AUTO_ROLES_DATA_FORMAT: "toonlab.auto-roles";
export const AUTO_ROLES_DATA_VERSION: 1;
declare function loadImageTexture(url: any): Promise<THREE.Texture<HTMLImageElement, THREE.TextureEventMap>>;
import * as THREE from 'three';
export {};
