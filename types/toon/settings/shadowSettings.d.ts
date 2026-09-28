export function createShadowSettings(options?: any): {};
export const CHARACTER_SHADOW_DIRECTIONS: Readonly<{
    camera: "camera";
    light: "light";
}>;
export const SHADOWS_GROUP: Readonly<{
    description: "Cast shadows from the scenery, the character's own shadow map and the screen-space hair shadow.";
    id: "shadows";
    label: "Cast Shadows";
}>;
export const SHADOWS_FIELDS: Readonly<{
    enabled: import("./fieldSchema.js").SettingField;
    scene: Readonly<{
        strength: import("./fieldSchema.js").SettingField;
    }>;
    character: Readonly<{
        enabled: import("./fieldSchema.js").SettingField;
        strength: Readonly<{
            body: import("./fieldSchema.js").SettingField;
            face: import("./fieldSchema.js").SettingField;
        }>;
        direction: import("./fieldSchema.js").SettingField;
        pitch: import("./fieldSchema.js").SettingField;
        yaw: import("./fieldSchema.js").SettingField;
        normalBias: import("./fieldSchema.js").SettingField;
        depthBias: import("./fieldSchema.js").SettingField;
        softness: import("./fieldSchema.js").SettingField;
    }>;
    hairOnFace: Readonly<{
        strength: Readonly<{
            face: import("./fieldSchema.js").SettingField;
            body: import("./fieldSchema.js").SettingField;
        }>;
        width: import("./fieldSchema.js").SettingField;
    }>;
}>;
export const DEFAULT_SHADOW_SETTINGS: Readonly<{}>;
