export function createRampSettings(options?: any): {};
export const RAMP_GROUP: Readonly<{
    description: "Shadow tones per kind of surface and the warm band just inside the terminator.";
    id: "ramp";
    label: "Shadow Tones";
}>;
export const RAMP_FIELDS: Readonly<{
    enabled: import("./fieldSchema.js").SettingField;
    tone: Readonly<{
        cloth: import("./fieldSchema.js").SettingField;
        hair: import("./fieldSchema.js").SettingField;
        skin: import("./fieldSchema.js").SettingField;
        face: import("./fieldSchema.js").SettingField;
        metal: import("./fieldSchema.js").SettingField;
        eye: import("./fieldSchema.js").SettingField;
    }>;
    band: Readonly<{
        width: import("./fieldSchema.js").SettingField;
        cloth: import("./fieldSchema.js").SettingField;
        hair: import("./fieldSchema.js").SettingField;
        skin: import("./fieldSchema.js").SettingField;
    }>;
    importMmdRamp: import("./fieldSchema.js").SettingField;
    importMToon: import("./fieldSchema.js").SettingField;
}>;
export const DEFAULT_RAMP_SETTINGS: Readonly<{}>;
