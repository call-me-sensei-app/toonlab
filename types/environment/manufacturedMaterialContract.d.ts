/**
 * Creates a canonical, versioned manufactured-material classification.
 */
export function createManufacturedMaterialClassification(options?: {}): any;
/**
 * Classifies one loaded Three.js material. Explicit metadata wins; names and
 * PBR properties provide a conservative automatic fallback.
 */
export function classifyManufacturedMaterial(object: any, materialOverride?: any): any;
/**
 * Infers the stable object-level class used for broad profiles such as
 * building exteriors. Explicit root metadata always wins.
 */
export function inferManufacturedObjectClass(root: any): any;
/**
 * Validates the IP-owned material look table stored in an environment preset.
 */
export function validateManufacturedMaterialLook(input: any): {
    errors: string[];
    ok: boolean;
    value: {
        version: number;
        default: {
            features: {};
            parameters: {};
        };
        baseMaterials: {};
        finishes: {};
        renderModes: {};
        structuralRoles: {};
        contentFlags: {};
        objectClasses: {};
        assets: {};
    };
    warnings: any[];
};
export function createManufacturedMaterialLook(input?: {}): {
    version: number;
    default: {
        features: {};
        parameters: {};
    };
    baseMaterials: {};
    finishes: {};
    renderModes: {};
    structuralRoles: {};
    contentFlags: {};
    objectClasses: {};
    assets: {};
};
/**
 * Resolves sparse IP profiles in a deterministic order. The global
 * environment settings remain the catch-all and are merged by the adapter.
 */
export function resolveManufacturedMaterialLook(materialLook: any, { assetId, classification, objectClass, }?: {
    assetId?: string;
    classification?: any;
    objectClass?: string;
}): {
    appliedProfiles: any[];
    features: {};
    parameters: {};
};
export function validateManufacturedMaterialManifest(input: any): {
    errors: string[];
    ok: boolean;
    value: any;
    warnings: any[];
} | {
    errors: string[];
    ok: boolean;
    value: {
        type: string;
        version: number;
        assetId: string;
        objectClass: any;
        assignments: {
            selector: any;
            classification: any;
        }[];
    };
    warnings: string[];
};
/**
 * Applies a JSON sidecar manifest to any loaded Object3D. Object-specific
 * assignments are stored on the object so a shared source material may still
 * classify differently at distinct uses.
 */
export function applyManufacturedMaterialManifest(root: any, manifest: any): {
    appliedAssignmentCount: number;
    assetId: any;
    objectClass: any;
    warnings: any[] | string[];
};
/**
 * Audits a loaded Object3D before shader conversion. This works for GLB,
 * FBX, OBJ, USDZ, VRM, or procedural meshes because it inspects the loaded
 * Three.js graph, not the source container.
 */
export function analyzeManufacturedAsset(root: any, { confidenceThreshold }?: {
    confidenceThreshold?: number;
}): {
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
export const MANUFACTURED_MATERIAL_MANIFEST_TYPE: "toonlab/manufactured-material-manifest";
export const MANUFACTURED_MATERIAL_MANIFEST_VERSION: 1;
export const MANUFACTURED_MATERIAL_LOOK_VERSION: 1;
export const MANUFACTURED_MATERIAL_BASES: readonly string[];
export const MANUFACTURED_MATERIAL_FINISHES: readonly string[];
export const MANUFACTURED_RENDER_MODES: readonly string[];
export const MANUFACTURED_STRUCTURAL_ROLES: readonly string[];
export const MANUFACTURED_CONTENT_FLAGS: readonly string[];
export const MANUFACTURED_OBJECT_CLASSES: readonly string[];
export const URBAN_MATERIAL_BASES: readonly string[];
export const URBAN_MATERIAL_FINISHES: readonly string[];
export const URBAN_RENDER_MODES: readonly string[];
export const URBAN_STRUCTURAL_ROLES: readonly string[];
export const URBAN_CONTENT_FLAGS: readonly string[];
