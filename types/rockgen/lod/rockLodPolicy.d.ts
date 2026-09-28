/**
 * Creates a normalized procedural-rock LOD policy with up to three levels.
 *
 * Role budgets are hard ceilings when an integer Surface Nets resolution can
 * attain them. `minResolution` mirrors meshDocument's hard minimum of 8; a
 * budget below what that grid can represent is reported as minimum-limited,
 * rather than pretending that the cap was met.
 */
export function createReferenceRockLodPolicy(options?: {}): Readonly<{
    allowTinyTopologyRetention: boolean;
    boundsCenterTolerance: any;
    boundsSizeTolerance: any;
    levelCount: any;
    maxResolution: any;
    minResolution: any;
    probeResolution: any;
    ratioTolerance: any;
    ratios: readonly any[];
    role: any;
    silhouetteGridSize: any;
    silhouetteThreshold: any;
    silhouetteThresholds: any;
    tinyTriangleThreshold: any;
    triangleBudgets: readonly any[];
}>;
export function resolveReferenceRockLodPolicy(roleOrPolicy?: string, overrides?: {}): Readonly<{
    allowTinyTopologyRetention: boolean;
    boundsCenterTolerance: any;
    boundsSizeTolerance: any;
    levelCount: any;
    maxResolution: any;
    minResolution: any;
    probeResolution: any;
    ratioTolerance: any;
    ratios: readonly any[];
    role: any;
    silhouetteGridSize: any;
    silhouetteThreshold: any;
    silhouetteThresholds: any;
    tinyTriangleThreshold: any;
    triangleBudgets: readonly any[];
}>;
/**
 * Resolves catalog/reference metadata without coupling the planner to a
 * catalog schema. Explicit options win; otherwise `reference.targetTriangles`
 * becomes LOD0 and the policy derives its half/quarter budgets.
 */
export function createReferenceRockLodPolicyForDocument(document: any, options?: {}): Readonly<{
    allowTinyTopologyRetention: boolean;
    boundsCenterTolerance: any;
    boundsSizeTolerance: any;
    levelCount: any;
    maxResolution: any;
    minResolution: any;
    probeResolution: any;
    ratioTolerance: any;
    ratios: readonly any[];
    role: any;
    silhouetteGridSize: any;
    silhouetteThreshold: any;
    silhouetteThresholds: any;
    tinyTriangleThreshold: any;
    triangleBudgets: readonly any[];
}>;
/** Returns actual triangle targets for a measured LOD0 mesh. */
export function createRockLodTriangleTargets(lod0Triangles: any, roleOrPolicy?: string): readonly Readonly<{
    level: number;
    ratio: any;
    triangleBudget: any;
    targetTriangles: number;
}>[];
export const REFERENCE_ROCK_LOD_RATIOS: readonly number[];
export const REFERENCE_ROCK_LOD_ROLE_BUDGETS: Readonly<{
    [k: string]: readonly number[];
}>;
export const REFERENCE_ROCK_LOD_ROLES: readonly string[];
