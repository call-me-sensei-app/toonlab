export function createOutlineSettings(options?: any): {};
export const OUTLINE_GROUP: Readonly<{
    description: "Inverted-hull ink outlines: widths, ink colour and screen-space behaviour.";
    id: "outline";
    label: "Outline";
}>;
export const OUTLINE_FIELDS: Readonly<{
    enabled: import("./fieldSchema.js").SettingField;
    width: Readonly<{
        cloth: import("./fieldSchema.js").SettingField;
        hair: import("./fieldSchema.js").SettingField;
        skin: import("./fieldSchema.js").SettingField;
        face: import("./fieldSchema.js").SettingField;
        eye: import("./fieldSchema.js").SettingField;
        metal: import("./fieldSchema.js").SettingField;
    }>;
    maxWidth: import("./fieldSchema.js").SettingField;
    screenSpace: import("./fieldSchema.js").SettingField;
    referenceDistance: import("./fieldSchema.js").SettingField;
    referenceFov: import("./fieldSchema.js").SettingField;
    fadeDistance: import("./fieldSchema.js").SettingField;
    ink: Readonly<{
        cloth: import("./fieldSchema.js").SettingField;
        hair: import("./fieldSchema.js").SettingField;
        skin: import("./fieldSchema.js").SettingField;
        face: import("./fieldSchema.js").SettingField;
        metal: import("./fieldSchema.js").SettingField;
    }>;
    inkSaturation: Readonly<{
        cloth: import("./fieldSchema.js").SettingField;
        hair: import("./fieldSchema.js").SettingField;
        skin: import("./fieldSchema.js").SettingField;
        face: import("./fieldSchema.js").SettingField;
        metal: import("./fieldSchema.js").SettingField;
    }>;
    inkHueShift: import("./fieldSchema.js").SettingField;
    lighting: Readonly<{
        cloth: Readonly<{
            mix: import("./fieldSchema.js").SettingField;
            min: import("./fieldSchema.js").SettingField;
            max: import("./fieldSchema.js").SettingField;
        }>;
        hair: Readonly<{
            mix: import("./fieldSchema.js").SettingField;
            min: import("./fieldSchema.js").SettingField;
            max: import("./fieldSchema.js").SettingField;
        }>;
        skin: Readonly<{
            mix: import("./fieldSchema.js").SettingField;
            min: import("./fieldSchema.js").SettingField;
            max: import("./fieldSchema.js").SettingField;
        }>;
        face: Readonly<{
            mix: import("./fieldSchema.js").SettingField;
            min: import("./fieldSchema.js").SettingField;
            max: import("./fieldSchema.js").SettingField;
        }>;
        metal: Readonly<{
            mix: import("./fieldSchema.js").SettingField;
            min: import("./fieldSchema.js").SettingField;
            max: import("./fieldSchema.js").SettingField;
        }>;
    }>;
    faceDepthPush: import("./fieldSchema.js").SettingField;
    honourSourceOff: import("./fieldSchema.js").SettingField;
    widthMap: import("./fieldSchema.js").SettingField;
    widthMapChannel: import("./fieldSchema.js").SettingField;
    widthVertexColorChannel: import("./fieldSchema.js").SettingField;
    smoothNormals: import("./fieldSchema.js").SettingField;
}>;
export const DEFAULT_OUTLINE_SETTINGS: Readonly<{}>;
