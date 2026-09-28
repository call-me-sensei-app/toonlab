/** Compact, JSON-safe LOD telemetry used by the Lab and glTF extras. */
export function summarizeRockLodPlan(plan: any, { levelCount }?: {
    levelCount?: number;
}): {
    levels: any;
    policy: {
        ratios: any[];
        role: any;
        triangleBudgets: any[];
    };
    sampledResolutions: any[];
    valid: boolean;
    validationErrors: any[];
    validationWarnings: any[];
};
export function prepareGeometryForExport(geometry: any, { ao, uv }?: {
    ao?: string;
    uv?: string;
}): any;
/**
 * Exports a geometry (or a ready-made mesh/scene) as a binary GLB.
 * Geometries are wrapped in a vertex-colored standard material so viewers
 * outside this repo show the baked look.
 *
 * @returns {Promise<ArrayBuffer>}
 */
export function exportGeometryToGLB(geometryOrObject: any, { ao, name, uv, }?: {
    ao?: string;
    name?: string;
    uv?: string;
}): Promise<ArrayBuffer>;
/**
 * Meshes the document at export resolution and exports it as GLB.
 *
 * With `lods` (default: the document's meshing.exportLods, on unless
 * disabled) the GLB carries meshes named <name>_LOD0/1/2. Each level is an
 * independent SDF re-mesh selected by adaptive triangle-budget search (about
 * 100% / 50% / 25% of LOD0), not by blindly halving grid resolution. This
 * keeps clean toon silhouettes and correctly baked colors/AO at every level.
 *
 * `uv: 'box'` adds box-projection UVs for detail textures (see
 * addBoxProjectionUvs for the trade-off).
 *
 * @returns {Promise<ArrayBuffer>}
 */
export function exportDocumentToGLB(document: any, { ao, lodPolicy, lods, name, normals, onLodPlan, resolution, strictLods, uv, }?: {
    ao?: string;
    lodPolicy?: any;
    lods?: any;
    name?: any;
    normals?: any;
    onLodPlan?: any;
    resolution?: any;
    strictLods?: any;
    uv?: string;
}): Promise<ArrayBuffer>;
/** Browser download helper for exported buffers (no-op outside browsers). */
export function downloadArrayBuffer(buffer: any, filename: any, mimeType?: string): void;
