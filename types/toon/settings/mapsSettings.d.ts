export function createMapsSettings(options?: any): {};
/** Textures a source material carries beyond three's standard slots. */
export function collectMaterialMapTextures(mat: any): {
    colorSpace: string;
    key: string;
    texture: any;
}[];
/**
 * Picks the maps a converted material uses from its source material.
 * Returns textures (or null) plus the scalar inputs that go with them.
 */
export function resolveMaterialMaps(settings: any, mat: any): {
    aoMap: any;
    aoMapIntensity: any;
    detailMap: any;
    emissiveColor: any;
    emissiveMap: any;
    matcapMap: any;
    metalnessMap: any;
    metalness: any;
    normalMap: any;
    normalScale: number;
    roughnessMap: any;
    specularColorMap: any;
};
export const MAPS_GROUP: Readonly<{
    description: "Strengths of the source material's normal, AO, emissive, matcap, detail, roughness/metalness and specular colour maps.";
    id: "maps";
    label: "Material Maps";
}>;
export const MAPS_FIELDS: Readonly<{
    enabled: import("./fieldSchema.js").SettingField;
    normal: Readonly<{
        strength: import("./fieldSchema.js").SettingField;
        scale: import("./fieldSchema.js").SettingField;
    }>;
    ao: Readonly<{
        strength: import("./fieldSchema.js").SettingField;
    }>;
    emissive: Readonly<{
        color: import("./fieldSchema.js").SettingField;
        strength: import("./fieldSchema.js").SettingField;
    }>;
    matcap: Readonly<{
        strength: import("./fieldSchema.js").SettingField;
    }>;
    detail: Readonly<{
        map: import("./fieldSchema.js").SettingField;
        repeat: import("./fieldSchema.js").SettingField;
        strength: import("./fieldSchema.js").SettingField;
    }>;
    roughness: Readonly<{
        strength: import("./fieldSchema.js").SettingField;
    }>;
    metalness: Readonly<{
        strength: import("./fieldSchema.js").SettingField;
    }>;
    specularColor: Readonly<{
        strength: import("./fieldSchema.js").SettingField;
    }>;
}>;
export const DEFAULT_MAPS_SETTINGS: Readonly<{}>;
