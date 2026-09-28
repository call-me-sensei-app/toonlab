export function createHighlightSettings(options?: any): {};
export const HIGHLIGHTS_GROUP: Readonly<{
    description: "Stylised specular, the hair ring, the eye glint and the stocking streak.";
    id: "highlights";
    label: "Highlights";
}>;
export const HIGHLIGHTS_FIELDS: Readonly<{
    enabled: import("./fieldSchema.js").SettingField;
    specular: Readonly<{
        cloth: Readonly<{
            intensity: import("./fieldSchema.js").SettingField;
            size: import("./fieldSchema.js").SettingField;
            threshold: import("./fieldSchema.js").SettingField;
            softness: import("./fieldSchema.js").SettingField;
        }>;
        hair: Readonly<{
            intensity: import("./fieldSchema.js").SettingField;
            size: import("./fieldSchema.js").SettingField;
            threshold: import("./fieldSchema.js").SettingField;
            softness: import("./fieldSchema.js").SettingField;
        }>;
        skin: Readonly<{
            intensity: import("./fieldSchema.js").SettingField;
            size: import("./fieldSchema.js").SettingField;
            threshold: import("./fieldSchema.js").SettingField;
            softness: import("./fieldSchema.js").SettingField;
        }>;
        face: Readonly<{
            intensity: import("./fieldSchema.js").SettingField;
            size: import("./fieldSchema.js").SettingField;
            threshold: import("./fieldSchema.js").SettingField;
            softness: import("./fieldSchema.js").SettingField;
        }>;
        metal: Readonly<{
            intensity: import("./fieldSchema.js").SettingField;
            size: import("./fieldSchema.js").SettingField;
            threshold: import("./fieldSchema.js").SettingField;
            softness: import("./fieldSchema.js").SettingField;
        }>;
        eye: Readonly<{
            intensity: import("./fieldSchema.js").SettingField;
            size: import("./fieldSchema.js").SettingField;
            threshold: import("./fieldSchema.js").SettingField;
            softness: import("./fieldSchema.js").SettingField;
        }>;
        clothNeedsMask: import("./fieldSchema.js").SettingField;
        inShadow: import("./fieldSchema.js").SettingField;
        mask: Readonly<{
            map: import("./fieldSchema.js").SettingField;
            channel: import("./fieldSchema.js").SettingField;
            strength: import("./fieldSchema.js").SettingField;
            fromSource: import("./fieldSchema.js").SettingField;
        }>;
    }>;
    hair: Readonly<{
        enabled: import("./fieldSchema.js").SettingField;
        intensity: import("./fieldSchema.js").SettingField;
        width: import("./fieldSchema.js").SettingField;
        offset: import("./fieldSchema.js").SettingField;
        strands: import("./fieldSchema.js").SettingField;
        jitter: import("./fieldSchema.js").SettingField;
        lean: import("./fieldSchema.js").SettingField;
        shadowFloor: import("./fieldSchema.js").SettingField;
    }>;
    eye: Readonly<{
        enabled: import("./fieldSchema.js").SettingField;
        intensity: import("./fieldSchema.js").SettingField;
        size: import("./fieldSchema.js").SettingField;
    }>;
    sheer: Readonly<{
        auto: import("./fieldSchema.js").SettingField;
        color: import("./fieldSchema.js").SettingField;
        intensity: import("./fieldSchema.js").SettingField;
        power: import("./fieldSchema.js").SettingField;
    }>;
}>;
export const DEFAULT_HIGHLIGHT_SETTINGS: Readonly<{}>;
