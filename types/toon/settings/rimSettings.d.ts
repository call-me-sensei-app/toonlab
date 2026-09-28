export function createRimSettings(options?: any): {};
export const RIM_MODES: Readonly<{
    depth: "depth";
    view: "view";
}>;
export const RIM_GROUP: Readonly<{
    description: "The depth rim on the lit side and the faint silhouette rim.";
    id: "rim";
    label: "Rim";
}>;
export const RIM_FIELDS: Readonly<{
    enabled: import("./fieldSchema.js").SettingField;
    mode: import("./fieldSchema.js").SettingField;
    width: import("./fieldSchema.js").SettingField;
    threshold: import("./fieldSchema.js").SettingField;
    softness: import("./fieldSchema.js").SettingField;
    silhouette: Readonly<{
        body: import("./fieldSchema.js").SettingField;
        hair: import("./fieldSchema.js").SettingField;
    }>;
    intensity: Readonly<{
        cloth: import("./fieldSchema.js").SettingField;
        hair: import("./fieldSchema.js").SettingField;
        skin: import("./fieldSchema.js").SettingField;
        face: import("./fieldSchema.js").SettingField;
        eye: import("./fieldSchema.js").SettingField;
    }>;
    tint: import("./fieldSchema.js").SettingField;
    albedoMix: import("./fieldSchema.js").SettingField;
    inShadow: import("./fieldSchema.js").SettingField;
    fadeStart: import("./fieldSchema.js").SettingField;
    fadeEnd: import("./fieldSchema.js").SettingField;
}>;
export const DEFAULT_RIM_SETTINGS: Readonly<{}>;
