export function createStickerSettings(options?: any): {
    blendMode: any;
    enabled: boolean;
    map: any;
    offset: any[];
    repeat: any[];
    strength: any;
    uvChannel: number;
};
export function resolveStickerForMaterial(settings: any, { isOutline, sourceMaterial }?: {
    isOutline?: boolean;
    sourceMaterial?: any;
}): {
    blendModeValue: any;
    enabled: boolean;
    map: any;
    offset: any;
    repeat: any;
    strength: any;
    uvChannel: any;
};
export const STICKER_BLEND_MODES: Readonly<{
    normal: "normal";
    add: "add";
    multiply: "multiply";
}>;
export const STICKER_BLEND_MODE_VALUES: Readonly<{
    normal: 0;
    add: 1;
    multiply: 2;
}>;
export const DEFAULT_STICKER_SETTINGS: Readonly<{
    blendMode: "normal";
    enabled: false;
    map: any;
    offset: number[];
    repeat: number[];
    strength: 1;
    uvChannel: 0;
}>;
