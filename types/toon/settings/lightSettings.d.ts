export function createLightSettings(options?: any): {};
export const LIGHT_GROUP: Readonly<{
    description: "How the scene's sun, sky, probes and local lights reach the character.";
    id: "light";
    label: "Light";
}>;
export const LIGHT_FIELDS: Readonly<{
    enabled: import("./fieldSchema.js").SettingField;
    sunMax: import("./fieldSchema.js").SettingField;
    sunTint: import("./fieldSchema.js").SettingField;
    maxTint: import("./fieldSchema.js").SettingField;
    skyFloor: import("./fieldSchema.js").SettingField;
    skyMax: import("./fieldSchema.js").SettingField;
    shadeSkyTint: import("./fieldSchema.js").SettingField;
    shadowSkyTint: import("./fieldSchema.js").SettingField;
    cameraLight: Readonly<{
        strength: import("./fieldSchema.js").SettingField;
        azimuth: import("./fieldSchema.js").SettingField;
        elevation: import("./fieldSchema.js").SettingField;
    }>;
    maxSunElevation: import("./fieldSchema.js").SettingField;
    hemisphereByNormal: import("./fieldSchema.js").SettingField;
    localLights: Readonly<{
        intensity: import("./fieldSchema.js").SettingField;
        max: import("./fieldSchema.js").SettingField;
        softness: import("./fieldSchema.js").SettingField;
    }>;
    highlightShadowFloor: import("./fieldSchema.js").SettingField;
}>;
export const DEFAULT_LIGHT_SETTINGS: Readonly<{}>;
