export function isScanAssetMaterial(obj: any, mat: any): boolean;
export function stylizeScanBaseMap(texture: any, params?: {
    albedoMaxSize: number;
    albedoBlur: number;
    albedoSaturate: number;
    albedoBrightness: number;
    normalMapStrength: number;
    aoMapStrength: number;
    aoWarmth: number;
    saturation: number;
    shadowTintColor: number[];
    specularStrength: number;
    specularShininess: number;
    specularSoftness: number;
}): any;
export function applyScanStylizeToMaterial(material: any, params?: {
    albedoMaxSize: number;
    albedoBlur: number;
    albedoSaturate: number;
    albedoBrightness: number;
    normalMapStrength: number;
    aoMapStrength: number;
    aoWarmth: number;
    saturation: number;
    shadowTintColor: number[];
    specularStrength: number;
    specularShininess: number;
    specularSoftness: number;
}): any;
export namespace DEFAULT_SCAN_STYLIZE_PARAMS {
    let albedoMaxSize: number;
    let albedoBlur: number;
    let albedoSaturate: number;
    let albedoBrightness: number;
    let normalMapStrength: number;
    let aoMapStrength: number;
    let aoWarmth: number;
    let saturation: number;
    let shadowTintColor: number[];
    let specularStrength: number;
    let specularShininess: number;
    let specularSoftness: number;
}
