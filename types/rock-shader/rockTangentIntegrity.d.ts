/**
 * Audits a geometry tangent attribute before a normal-mapped material can
 * consume it. A missing tangent attribute is valid: Three.js derives a
 * derivative TBN frame. A present but zero/invalid attribute is not valid and
 * produces literal black facets in WebGPU/TSL normal mapping.
 */
export function inspectRockGeometryTangents(geometry: any, { epsilon, orthogonalityTolerance, }?: {
    epsilon?: number;
    orthogonalityTolerance?: number;
}): {
    vertices: any;
    hasTangents: boolean;
    tangentVertices: any;
    invalidVertices: number;
    zeroLength: number;
    nonFinite: number;
    invalidHandedness: number;
    nonOrthogonal: number;
    countMismatch: boolean;
    itemSizeInvalid: boolean;
    valid: boolean;
};
/**
 * Removes only invalid tangent attributes. Three.js then uses its derivative
 * tangent frame, which is the safe fallback for degenerate UV islands. Vertex
 * positions, normals, UVs, indices, materials, and texture files are untouched.
 */
export function sanitizeRockGeometryTangents(geometry: any, options?: {}): {
    removed: boolean;
    vertices: any;
    hasTangents: boolean;
    tangentVertices: any;
    invalidVertices: number;
    zeroLength: number;
    nonFinite: number;
    invalidHandedness: number;
    nonOrthogonal: number;
    countMismatch: boolean;
    itemSizeInvalid: boolean;
    valid: boolean;
};
/** Audits and repairs every mesh below a rock root. */
export function sanitizeRockTangents(root: any, options?: {}): {
    meshes: number;
    meshesWithTangents: number;
    repairedMeshes: number;
    vertices: number;
    tangentVertices: number;
    invalidVertices: number;
    issues: any[];
};
