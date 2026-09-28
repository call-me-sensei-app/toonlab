export function createFaceSettings(options?: any): {};
export const FACE_HEAD_SPACE_MODES: Readonly<{
    headBone: "headBone";
    static: "static";
}>;
export const FACE_GROUP: Readonly<{
    description: "Face-map shading, smoothed face normals and painted face details.";
    id: "face";
    label: "Face";
}>;
export const FACE_FIELDS: Readonly<{
    enabled: import("./fieldSchema.js").SettingField;
    map: Readonly<{
        auto: import("./fieldSchema.js").SettingField;
        texture: import("./fieldSchema.js").SettingField;
        mirror: import("./fieldSchema.js").SettingField;
        midU: import("./fieldSchema.js").SettingField;
        uvChannel: import("./fieldSchema.js").SettingField;
        softness: import("./fieldSchema.js").SettingField;
        offset: import("./fieldSchema.js").SettingField;
        strength: import("./fieldSchema.js").SettingField;
    }>;
    terminator: import("./fieldSchema.js").SettingField;
    softness: import("./fieldSchema.js").SettingField;
    normals: Readonly<{
        amount: import("./fieldSchema.js").SettingField;
        roundness: import("./fieldSchema.js").SettingField;
    }>;
    headSpace: import("./fieldSchema.js").SettingField;
    sceneShadowStrength: import("./fieldSchema.js").SettingField;
    nose: Readonly<{
        auto: import("./fieldSchema.js").SettingField;
        size: import("./fieldSchema.js").SettingField;
        strength: import("./fieldSchema.js").SettingField;
        tint: import("./fieldSchema.js").SettingField;
    }>;
    eyeWhiteShade: Readonly<{
        strength: import("./fieldSchema.js").SettingField;
        depth: import("./fieldSchema.js").SettingField;
        tint: import("./fieldSchema.js").SettingField;
    }>;
}>;
export const DEFAULT_FACE_SETTINGS: Readonly<{}>;
