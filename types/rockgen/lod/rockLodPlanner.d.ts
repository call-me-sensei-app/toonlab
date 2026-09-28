/**
 * Surface meshes scale approximately with resolution squared, so a triangle
 * target uses sqrt(target/reference) rather than the exporter's historical
 * direct half/quarter resolution convention.
 */
export function estimateSurfaceNetsResolution({ maxResolution, minResolution, referenceResolution, referenceTriangles, targetTriangles, }: {
    maxResolution?: number;
    minResolution?: number;
    referenceResolution: any;
    referenceTriangles: any;
    targetTriangles: any;
}): number;
/**
 * Searches integer grid resolutions around the Surface Nets sqrt estimate.
 * The callback may return either a triangle count or `{ triangleCount, ... }`.
 * Results include every sampled resolution for diagnostics and reuse.
 */
export function searchSurfaceNetsResolution({ maxResolution, measureTriangles, minResolution, neighborhood, preference, reference, targetTriangles, }: {
    maxResolution?: number;
    measureTriangles: any;
    minResolution?: number;
    neighborhood?: number;
    preference?: string;
    reference?: any;
    targetTriangles: any;
}): any;
/**
 * Meshes and plans a deterministic LOD set for a legacy procedural document.
 * Returned geometries can be passed straight to an exporter; callers that
 * only need resolutions may set `keepGeometries: false` after validation.
 * Source-mesh reference documents deliberately fail through meshDocument;
 * their exact authored LODs are loaded by referenceAssetLoader instead.
 */
export function planRockLodMeshes(document: any, { includeHelpers, keepGeometries, maxResolution, mesh, meshOptions, policy: policyOption, validate, }?: {
    includeHelpers?: boolean;
    keepGeometries?: boolean;
    maxResolution?: any;
    mesh?: typeof meshDocument;
    meshOptions?: {};
    policy?: any;
    validate?: boolean;
}): {
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
import { meshDocument } from '../mesh/meshDocument.js';
