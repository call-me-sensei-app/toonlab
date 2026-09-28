/**
 * Bakes per-vertex local occlusion for every eligible mesh under `root`.
 * `isEligibleMesh(mesh)` selects receivers and occluders.
 */
export function bakeLocalOcclusion(root: any, { isEligibleMesh, ...options }?: {
    isEligibleMesh?: () => boolean;
}): {
    meshes: any[];
    occludedVertices: number;
    radius: number;
    surfels: number;
};
export const DEFAULT_OCCLUSION_BAKE: Readonly<{
    radius: 0.04;
    surfelFraction: number;
    backFacingWeight: 0.15;
    gain: 2.5;
}>;
