export function toMaterialArray(material: any): any[];
export function textureLabel(texture: any): string;
export function textureSourceUrl(texture: any): any;
export function materialText(mat: any): string;
export function isUtilityTextureLabel(text: any): boolean;
export function isFoliageMaterial(mat: any): boolean;
export function sourceOpacity(mat: any): any;
export function usesAlphaCutout(mat: any): boolean;
export function alphaCutoffForMaterial(mat: any): number;
export function isEmissiveEnvironmentMaterial(mat: any): boolean;
export function materialBaseColor(mat: any, { baseMapWasUtility, resolvedDiffuseMap }?: {
    baseMapWasUtility?: boolean;
    resolvedDiffuseMap?: boolean;
}): any;
export function isWindowCutoutMaterial(mat: any): boolean;
export function objectMaterialText(obj: any, materials: any): string;
export function isEnvironmentShadowMesh(obj: any, materials: any): boolean;
export function isAoOverlayMaterial(mat: any): boolean;
export function isEnvironmentAoOverlay(obj: any, materials: any): any;
export function classifyEnvironmentMaterialRole(obj: any, mat: any, { roleOverrides }?: {
    roleOverrides?: any;
}): {
    role: any;
    source: string;
};
export const ENVIRONMENT_MATERIAL_ROLES: readonly string[];
