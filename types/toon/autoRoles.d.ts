/**
 * Infers per-vertex role weights for the eligible meshes under `root`.
 * `isEligible(material)` selects materials whose roles are unknown.
 * Returns a report; `applied` is false (with a `reason`) when evidence is
 * insufficient, in which case nothing is modified.
 */
export function inferAutoRoleWeights(root: any, { headBone, isEligible, skinTolerance, }?: {
    headBone?: any;
    isEligible?: () => boolean;
    skinTolerance?: number;
}): {
    applied: boolean;
    reason: string;
    medianRgb?: undefined;
    referenceSkinFraction?: undefined;
    counts?: undefined;
    headVertexCount?: undefined;
    meshes?: undefined;
    faceFrame?: undefined;
    maskedMeshes?: undefined;
    method?: undefined;
    skinReference?: undefined;
    skinTolerance?: undefined;
} | {
    applied: boolean;
    medianRgb: any[];
    reason: string;
    referenceSkinFraction: number;
    counts?: undefined;
    headVertexCount?: undefined;
    meshes?: undefined;
    faceFrame?: undefined;
    maskedMeshes?: undefined;
    method?: undefined;
    skinReference?: undefined;
    skinTolerance?: undefined;
} | {
    applied: boolean;
    counts: {
        face: number;
        hair: number;
        skin: number;
    };
    headVertexCount: number;
    meshes: number;
    faceFrame: {
        rx: number;
        ry: number;
        x: number;
        y: number;
    };
    maskedMeshes: number;
    method: string;
    skinReference: any[];
    skinTolerance: number;
    reason?: undefined;
    medianRgb?: undefined;
    referenceSkinFraction?: undefined;
};
export const AUTO_ROLE_ATTRIBUTE: "toonRoleWeights";
