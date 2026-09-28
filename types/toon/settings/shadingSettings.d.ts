export function createShadingSettings(options?: any): {};
export const SHADING_GROUP: Readonly<{
    description: "The terminator between light and shadow and the lighting map that shifts it.";
    id: "shading";
    label: "Shading";
}>;
export const SHADING_FIELDS: Readonly<{
    enabled: import("./fieldSchema.js").SettingField;
    terminator: Readonly<{
        cloth: import("./fieldSchema.js").SettingField;
        hair: import("./fieldSchema.js").SettingField;
        skin: import("./fieldSchema.js").SettingField;
    }>;
    softness: import("./fieldSchema.js").SettingField;
    antiAlias: import("./fieldSchema.js").SettingField;
    lightingMap: Readonly<{
        auto: import("./fieldSchema.js").SettingField;
        autoStrength: Readonly<{
            body: import("./fieldSchema.js").SettingField;
            hair: import("./fieldSchema.js").SettingField;
        }>;
        autoStart: import("./fieldSchema.js").SettingField;
        autoEnd: import("./fieldSchema.js").SettingField;
        map: import("./fieldSchema.js").SettingField;
        channel: import("./fieldSchema.js").SettingField;
        scale: import("./fieldSchema.js").SettingField;
        pivot: import("./fieldSchema.js").SettingField;
    }>;
}>;
export const DEFAULT_SHADING_SETTINGS: Readonly<{}>;
