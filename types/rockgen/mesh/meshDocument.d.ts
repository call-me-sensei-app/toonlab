/**
 * Meshes a rock document into a THREE.BufferGeometry with the rockgen
 * attribute contract: `position`, `normal`, `color` (baked stylized
 * albedo), `envVertexAo` (1 = open), and `index` (dropped in 'flat'
 * normals mode, which de-indexes).
 *
 * @param {object} document Rock document.
 * @param {object} [options]
 * @param {number} [options.resolution] Cells along the longest bounds axis
 *   (defaults to `document.meshing.previewResolution`).
 * @param {{min: number[], max: number[]}} [options.bounds] Bounds override.
 * @param {'gradient'|'flat'} [options.normals] Normal mode override.
 * @param {{color?: boolean, ao?: boolean}} [options.attributes] Skip baked
 *   attributes (both default true).
 * @param {boolean} [options.includeHelpers] Include construction-only lab
 *   helpers such as hidden ground supports. Defaults false so preview/export
 *   match the final visible rock.
 * @param {string} [options.pieceId] Mesh one piece in its local space.
 */
export function meshDocument(document: object, { attributes, bounds, includeHelpers, normals, pieceId, resolution, }?: {
    resolution?: number;
    bounds?: {
        min: number[];
        max: number[];
    };
    normals?: "gradient" | "flat";
    attributes?: {
        color?: boolean;
        ao?: boolean;
    };
    includeHelpers?: boolean;
    pieceId?: string;
}): THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>;
/**
 * FNV-1a hash over every attribute's byte view (name-salted) plus the
 * index. Used by scripts/verify-rockgen.mjs to assert determinism and by
 * callers as a cheap content key.
 */
export function hashGeometry(geometry: any): string;
import * as THREE from 'three';
