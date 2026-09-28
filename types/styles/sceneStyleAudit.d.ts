/**
 * Produces a deterministic, read-only routing report. It never guesses a
 * domain or material role and never mutates the scene, renderer, or bundle.
 */
export function auditSceneStyleContract(scene: any, { bundle, mode, renderer, rendererBackend, systemDomains, }?: {
    bundle?: any;
    mode?: string;
    renderer?: any;
    rendererBackend?: any;
    systemDomains?: any[];
}): {
    type: string;
    version: number;
    package: {
        name: string;
        version: string;
    };
    mode: string;
    rendererBackend: string;
    bundle: {
        id: any;
        version: any;
    };
    ok: boolean;
    readyToApply: boolean;
    summary: {
        blockingIssueCount: number;
        exemptionCount: number;
        issueCount: number;
        routeCount: number;
        targetCount: number;
        warningCount: number;
    };
    targets: {
        assetId: any;
        domain: any;
        materialCount: number;
        materials: {
            custom: any;
            materialId: any;
            nodePath: any;
            roles: any;
            transparent: any;
        }[];
        nodePath: any;
        targetId: any;
    }[];
    systems: any[];
    routes: {
        domain: any;
        slot: any;
        status: string;
        targetId: any;
    }[];
    exemptions: {
        adapterId: any;
        exemptionId: any;
        materialId: any;
        reason: any;
        targetId: any;
    }[];
    inferences: any[];
    issues: {
        nodePath?: any;
        materialId?: any;
        assetId?: any;
        targetId?: any;
        code: any;
        severity: any;
        message: any;
        consequence: any;
        remediation: any;
    }[];
};
export function serializeSceneStyleAudit(report: any, { pretty }?: {
    pretty?: boolean;
}): string;
export const STYLE_SCENE_AUDIT_DOCUMENT_TYPE: "toonlab/scene-style-audit";
export const STYLE_SCENE_AUDIT_SCHEMA_VERSION: 1;
export const STYLE_SCENE_AUDIT_MODES: readonly string[];
