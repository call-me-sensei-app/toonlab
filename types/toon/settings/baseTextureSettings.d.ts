export function createBaseTextureSettings(options?: any): Readonly<{
    customSaturation: 1;
    materialColorMode: "legacy";
    saturationMode: "legacy";
}> | {
    customSaturation: any;
    materialColorMode: any;
    saturationMode: any;
};
export function getSourceMaterialColor(mat: any): any;
export function resolveBaseMaterialColor(mat: any, settings?: Readonly<{
    customSaturation: 1;
    materialColorMode: "legacy";
    saturationMode: "legacy";
}>): any;
export function resolveBaseMapSaturation({ isFace, isSkin }?: {
    isFace?: boolean;
    isSkin?: boolean;
}, settings?: Readonly<{
    customSaturation: 1;
    materialColorMode: "legacy";
    saturationMode: "legacy";
}>): 1 | 0.98 | 1.04;
export const BASE_TEXTURE_MATERIAL_COLOR_MODES: Readonly<{
    legacy: "legacy";
    source: "source";
    texture: "texture";
    white: "white";
}>;
export const BASE_TEXTURE_SATURATION_MODES: Readonly<{
    legacy: "legacy";
    source: "source";
    custom: "custom";
}>;
export const DEFAULT_BASE_TEXTURE_SETTINGS: Readonly<{
    customSaturation: 1;
    materialColorMode: "legacy";
    saturationMode: "legacy";
}>;
