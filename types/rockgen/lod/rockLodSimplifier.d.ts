/**
 * Reduces an indexed rock mesh toward an explicit triangle budget with Three's
 * curvature-aware edge-collapse modifier. Rock AO is temporarily carried in
 * UV.x so every exported LOD retains the same intrinsic shading contract.
 */
export function simplifyRockGeometryToTriangleBudget(source: any, targetTriangles: any, { maxAttempts, }?: {
    maxAttempts?: number;
}): any;
/**
 * Restores the reference AABB after edge collapse. Extreme silhouette points
 * are the first vertices many generic simplifiers sacrifice on thin rocks;
 * this deterministic affine correction keeps LOD pivots, footprint, and total
 * extents stable without adding triangles.
 */
export function matchRockGeometryBounds(geometry: any, referenceGeometry: any): any;
