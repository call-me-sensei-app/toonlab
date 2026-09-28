export function readStyleMaterialId(material: any): any;
/** Collect unique live material slots below one labeled root. */
export function collectStyleTargetMaterials(root: any, { pathByNode }?: {
    pathByNode?: any;
}): any[];
/**
 * Reconcile a declared material contract with the live material objects it is
 * supposed to cover. This is intentionally shared by scene audit and strict
 * bundle preflight so the latter cannot trust stale declarations.
 */
export function auditStyleTargetMaterialCoverage(domain: any, label: any, subject: any): {
    issues: {
        code: string;
        materialId: any;
        message: string;
        severity: string;
    }[];
    materials: any[];
};
export const STYLE_TRANSPARENT_MATERIAL_ROLES: Set<string>;
