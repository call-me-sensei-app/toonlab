/**
 * Build a conservative, read-only label proposal for an imported manufactured
 * asset. Low-confidence and generic fallback classifications remain explicit
 * blockers until an agent/developer supplies an override.
 */
export function proposeManufacturedStyleTargetLabel(root: any, { assetId, confidenceThreshold, materialOverrides, targetId, }?: {
    assetId?: any;
    confidenceThreshold?: number;
    materialOverrides?: {};
    targetId?: any;
}): {
    analysis: {
        assetId: any;
        objectClass: any;
        records: any[];
        summary: {
            explicitCount: number;
            fallbackCount: number;
            inferredCount: number;
            lowConfidenceCount: number;
            materialUseCount: number;
            uniqueMaterialCount: number;
        };
        warnings: string[];
    };
    assetId: any;
    entries: {
        classification: any;
        material: any;
        materialId: any;
        useCount: any;
    }[];
    issues: ({
        code: string;
        materialId: any;
        message: string;
    } | {
        code: string;
        message: string;
        materialId?: undefined;
    })[];
    label: {
        extensions?: any;
        materials?: any;
        collision?: any;
        domain: any;
        assetId?: string;
        targetId?: string;
        schemaVersion: number;
    };
    objectClass: any;
    ready: boolean;
    summary: {
        autoResolvedMaterials: number;
        materialCount: number;
        overrideCount: number;
        unresolvedCount: number;
    };
    targetId: any;
};
/** Apply a previously reviewed proposal. No mutation occurs for a blocked proposal. */
export function applyManufacturedStyleTargetLabelProposal(root: any, proposal: any, { replace }?: {
    replace?: boolean;
}): any;
/** Propose and apply only when every live material is production-safe. */
export function labelManufacturedStyleTarget(root: any, options?: {}): {
    analysis: {
        assetId: any;
        objectClass: any;
        records: any[];
        summary: {
            explicitCount: number;
            fallbackCount: number;
            inferredCount: number;
            lowConfidenceCount: number;
            materialUseCount: number;
            uniqueMaterialCount: number;
        };
        warnings: string[];
    };
    assetId: any;
    entries: {
        classification: any;
        material: any;
        materialId: any;
        useCount: any;
    }[];
    issues: ({
        code: string;
        materialId: any;
        message: string;
    } | {
        code: string;
        message: string;
        materialId?: undefined;
    })[];
    label: {
        extensions?: any;
        materials?: any;
        collision?: any;
        domain: any;
        assetId?: string;
        targetId?: string;
        schemaVersion: number;
    };
    objectClass: any;
    ready: boolean;
    summary: {
        autoResolvedMaterials: number;
        materialCount: number;
        overrideCount: number;
        unresolvedCount: number;
    };
    targetId: any;
};
export class ManufacturedStyleLabelingError extends Error {
    constructor(proposal: any);
    proposal: any;
}
