/**
 * Infers per-vertex role weights for the eligible meshes under `root`.
 * `isEligible(material)` selects materials whose roles are unknown.
 * Returns a report; `applied` is false (with a `reason`) when evidence is
 * insufficient, in which case nothing is modified.
 *
 * The analysis runs in the declared character frame (`root.userData.toonForward`,
 * +Z when none is declared). Only when a model declares nothing and its +Z
 * analysis finds no skin in the cheek band is its rest-pose facing estimated
 * (estimateRestForward) and the analysis retried from that side. The estimate
 * is a fallback, never an override: light warm hair (ash, silver, blond) is
 * skin-coloured by hue and can outweigh the face in it. The inferred axis is
 * kept, and written to the root so later bakes and head tracking agree, only
 * when the retry succeeds.
 */
export function inferAutoRoleWeights(root: any, { headBone, isEligible, skinTolerance, }?: {
    headBone?: any;
    isEligible?: () => boolean;
    skinTolerance?: number;
}): {
    applied: boolean;
    medianRgb: any[];
    reason: string;
    referenceSkinFraction: number;
    counts?: undefined;
    headVertexCount?: undefined;
    meshes?: undefined;
    faceFrame?: undefined;
    forwardInferred?: undefined;
    head?: undefined;
    maskedMeshes?: undefined;
    maskDegenerateTriangles?: undefined;
    maskRepartitionedTexels?: undefined;
    method?: undefined;
    skinReference?: undefined;
    skinSplit?: undefined;
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
    forwardInferred: {
        forward: number[];
        samples: number;
        strength: number;
    };
    head: {
        center: THREE.Vector3Tuple;
        radiusX: number;
        radiusY: number;
    };
    maskedMeshes: number;
    maskDegenerateTriangles: number;
    maskRepartitionedTexels: number;
    method: string;
    referenceSkinFraction: number;
    skinReference: any[];
    skinSplit: {
        boundary: number;
        groups: any[];
        hair: string;
    };
    skinTolerance: number;
    reason?: undefined;
    medianRgb?: undefined;
} | {
    applied: boolean;
    reason: string;
};
export const AUTO_ROLE_ATTRIBUTE: "toonRoleWeights";
import * as THREE from 'three';
