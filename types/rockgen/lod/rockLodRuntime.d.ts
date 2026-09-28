export function normalizeRockLodDistances(value?: readonly number[]): number[];
/**
 * Builds a runtime-native THREE.LOD from legacy planned Surface Nets geometries.
 * THREE.LOD compares camera and object world positions with Vector3 distance,
 * so aerial/vertical cameras demote rocks correctly without a custom updater.
 *
 * `materialFactory({ document, geometry, level, plan })` may return a distinct
 * material per level. Without it, `material` is reused, or one shared
 * vertex-color material is created for the whole LOD object.
 */
export function createRockLodObject(document: any, { castShadow, distances: distanceOption, hysteresis, material, materialFactory, name, planOptions, receiveShadow, styleTarget, }?: {
    castShadow?: boolean;
    distances?: readonly number[];
    hysteresis?: number;
    material?: any;
    materialFactory?: any;
    name?: any;
    planOptions?: {};
    receiveShadow?: boolean;
    styleTarget?: {};
}): {
    lod: THREE.LOD<THREE.Object3DEventMap>;
    ownsSharedMaterial: boolean;
    plan: {
        levels: {
            actualRatio: number;
            level: number;
            limitedByMinimum: boolean;
            method: string;
            removedVertices: any;
            reducible: boolean;
            resolution: number;
            retainedTopology: boolean;
            retentionReason: any;
            targetRatio: number;
            targetTriangles: any;
            triangleBudget: any;
            triangleCount: any;
        }[];
        policy: Readonly<{
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
        sampledResolutions: any[];
        validation: {
            comparisons: any[];
            errors: {
                level: any;
                text: any;
            }[];
            valid: boolean;
            warnings: any[];
        };
    };
    report: Readonly<{
        distances: readonly number[];
        levels: readonly Readonly<{
            actualRatio: number;
            distance: number;
            level: number;
            limitedByMinimum: boolean;
            resolution: number;
            retainedTopology: boolean;
            targetRatio: number;
            targetTriangles: any;
            triangleBudget: any;
            triangleCount: any;
        }>[];
        role: any;
        validation: {
            comparisons: any[];
            errors: {
                level: any;
                text: any;
            }[];
            valid: boolean;
            warnings: any[];
        };
    }>;
};
export const DEFAULT_ROCK_LOD_DISTANCES: readonly number[];
import * as THREE from 'three';
