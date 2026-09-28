export function validateStyleMaterialContract(domain: any, input: any): {
    errors: string[];
    ok: boolean;
    value: any;
    warnings: any[];
} | {
    errors: string[];
    ok: boolean;
    value: {
        exemptions?: {};
        masks?: {};
        schemaVersion: number;
        assignments: {};
    };
    warnings: string[];
};
export function createStyleMaterialContract(domain: any, definition: any): any;
export function parseStyleMaterialContract(domain: any, input: any): {
    errors: string[];
    ok: boolean;
    value: any;
    warnings: any[];
};
export function serializeStyleMaterialContract(domain: any, input: any, { pretty }?: {
    pretty?: boolean;
}): string;
export const STYLE_MATERIAL_MASK_ENCODINGS: readonly string[];
export const STYLE_MATERIAL_EXEMPTION_STRATEGIES: readonly string[];
export const STYLE_DOMAIN_MATERIAL_ROLES: Readonly<{
    character: readonly string[];
    cloud: readonly any[];
    equipment: readonly string[];
    lighting: readonly any[];
    'manufactured.environment': readonly string[];
    'manufactured.surface': readonly string[];
    'natural.rock': readonly string[];
    post: readonly any[];
    prop: readonly string[];
    sky: readonly any[];
    'terrain.ground': readonly string[];
    'vegetation.flower': readonly ("foliageCard" | "flowerPetal" | "flowerCenter" | "herbaceousStem")[];
    'vegetation.grass': readonly "grassBlade"[];
    'vegetation.tree': readonly ("foliageCard" | "flowerPetal" | "flowerCenter" | "herbaceousStem" | "woodySurface")[];
    water: readonly string[];
}>;
export { STYLE_MATERIAL_CONTRACT_SCHEMA_VERSION, STYLE_MATERIAL_STABLE_ID_PATTERN } from "./styleMetadata.js";
