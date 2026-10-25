/**
 * Base-colour texels (RGBA, 0–255) at the UV of each vertex in `vertices`,
 * indexed by vertex (others zero), or null when the texture's pixels cannot
 * be read. The colour evidence these bakes use; a precomputed conversion
 * (autoRolesData.js) supplies recorded texels instead of reading pixels.
 */
export function sampleVertexTexels(material: any, geometry: any, vertices: any): Uint8Array<ArrayBuffer>;
/**
 * Bakes the lid coordinate onto every eye-white material's vertices.
 * `vertexTexels(mesh, material, slot, measure)` supplies the colour evidence
 * (default: `measure()`, sampleVertexTexels).
 * @returns {{ meshes: number, eyes: number, painted: string[] } | null}
 */
export function bakeEyeWhiteLid(root: any, { isScleraMaterial, vertexTexels }: {
    isScleraMaterial: any;
    vertexTexels?: (mesh: any, material: any, slot: any, measure: any) => any;
}): {
    meshes: number;
    eyes: number;
    painted: string[];
} | null;
/**
 * Bakes a sheer-fabric weight onto stockings and tights.
 * `vertexTexels` as for bakeEyeWhiteLid.
 * @returns {{ materials: string[] } | null}
 */
export function bakeSheerFabric(root: any, { isEligibleMaterial, vertexTexels }: {
    isEligibleMaterial: any;
    vertexTexels?: (mesh: any, material: any, slot: any, measure: any) => any;
}): {
    materials: string[];
} | null;
