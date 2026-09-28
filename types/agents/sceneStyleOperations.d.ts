export function validateSceneStyleManifest(input: any): {
    errors: string[];
    ok: boolean;
    value: any;
};
export function runSceneStyleOperation(operation: any, input: any, { bundle, mode, }?: {
    bundle?: string;
    mode?: string;
}): {
    ok: boolean;
    operation: any;
    mode: string;
    errors: any[];
    manifest?: undefined;
    targets?: undefined;
    audit?: undefined;
    plan?: undefined;
    applied?: undefined;
    expectedBundleId?: undefined;
    appliedBundleId?: undefined;
} | {
    ok: boolean;
    operation: any;
    manifest: {
        name: any;
        targetCount: any;
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
    mode?: undefined;
    errors?: undefined;
    audit?: undefined;
    plan?: undefined;
    applied?: undefined;
    expectedBundleId?: undefined;
    appliedBundleId?: undefined;
} | {
    ok: boolean;
    operation: any;
    audit: {
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
    mode?: undefined;
    errors?: undefined;
    manifest?: undefined;
    targets?: undefined;
    plan?: undefined;
    applied?: undefined;
    expectedBundleId?: undefined;
    appliedBundleId?: undefined;
} | {
    ok: boolean;
    operation: any;
    audit: {
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
    plan: {
        bundleId: any;
        mode: string;
        operations: {
            action: string;
            domain: any;
            targetId: any;
        }[];
        rejected: {
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
    mode?: undefined;
    errors?: undefined;
    manifest?: undefined;
    targets?: undefined;
    applied?: undefined;
    expectedBundleId?: undefined;
    appliedBundleId?: undefined;
} | {
    ok: boolean;
    operation: any;
    audit: {
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
    plan: {
        bundleId: any;
        mode: string;
        operations: {
            action: string;
            domain: any;
            targetId: any;
        }[];
        rejected: {
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
    applied: boolean;
    mode?: undefined;
    errors?: undefined;
    manifest?: undefined;
    targets?: undefined;
    expectedBundleId?: undefined;
    appliedBundleId?: undefined;
} | {
    ok: boolean;
    operation: any;
    applied: boolean;
    audit: {
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
    manifest: any;
    plan: {
        bundleId: any;
        mode: string;
        operations: {
            action: string;
            domain: any;
            targetId: any;
        }[];
        rejected: {
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
    mode?: undefined;
    errors?: undefined;
    targets?: undefined;
    expectedBundleId?: undefined;
    appliedBundleId?: undefined;
} | {
    ok: boolean;
    operation: any;
    audit: {
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
    expectedBundleId: any;
    appliedBundleId: any;
    mode?: undefined;
    errors?: undefined;
    manifest?: undefined;
    targets?: undefined;
    plan?: undefined;
    applied?: undefined;
};
export const SCENE_STYLE_MANIFEST_TYPE: "toonlab/scene-style-manifest";
export const SCENE_STYLE_MANIFEST_VERSION: 1;
export const SCENE_STYLE_OPERATION_NAMES: readonly string[];
