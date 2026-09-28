export function registerRockShaderPreset(id: any, preset: any, { overwrite }?: {
    overwrite?: boolean;
}): string;
export function getRockShaderPresetOptions(): {
    description: any;
    label: any;
    value: any;
}[];
export function normalizeRockShaderPresetName(value: any): string;
export function createRockShaderSettings(options?: any): any;
export function createRockShaderPresetDocument(id: any, { description, label, settings, }?: {
    description?: string;
    label?: any;
    settings?: any;
}): {
    description: string;
    id: string;
    label: string;
    schema: string;
    settings: any;
    version: number;
};
export function parseRockShaderPresetDocument(input: any): {
    errors: string[];
    ok: boolean;
    value?: undefined;
} | {
    ok: boolean;
    value: {
        description: string;
        id: string;
        label: string;
        schema: string;
        settings: any;
        version: number;
    };
    errors?: undefined;
};
export function serializeRockShaderPreset(document: any, { pretty }?: {
    pretty?: boolean;
}): string;
export const ROCK_SHADER_DOCUMENT_TYPE: "toonlab/rock-shader-preset";
export const ROCK_SHADER_SCHEMA_VERSION: 1;
export const DEFAULT_ROCK_SHADER_PRESET: "call_me_sensei";
export const ROCK_SHADER_SETTING_GROUPS: readonly Readonly<{
    description: "World-space base projection and graphic texture treatment." | "Shared stone tint and physically based response." | "Rock-specific exposure and shaded-face readability under the current scene lighting." | "Portable wet-rock response around the current scene water level." | "Distance color recession shared by rocks, cliffs, and mountains." | "Near and far normal-detail behavior." | "Optional graphic sediment or mineral striping over side faces." | "Slope-aware moss treatment; current climate coverage remains scene-owned." | "Shared upward-facing mask for geological top layers." | "Optional authored grass-over-rock layer, separate from current weather." | "Authored snow response; the current snow amount remains runtime state." | "Optional authored sand-over-rock layer and its normal response." | "How stable asset-authored channels participate in the shared shader.";
    id: string;
    label: "Shared Lighting" | "Base Projection" | "Material Response" | "Shoreline Response" | "Distance Tint" | "Normal Detail" | "Striping" | "Moss Response" | "Top-Layer Mask" | "Grass Layer" | "Snow Layer" | "Sand Layer" | "Asset Integration";
}>[];
export const ROCK_SHADER_FIELD_SCHEMA: Readonly<{
    [k: string]: Readonly<{
        [k: string]: Readonly<{
            group: string;
            id: `${string}.${string}`;
            key: string;
            defaultValue: any;
            description: any;
            label: any;
            options: readonly any[];
            range: any;
            serializable: true;
            type: string;
        }>;
    }>;
}>;
export const DEFAULT_ROCK_SHADER_SETTINGS: Readonly<{
    [k: string]: Readonly<{
        [k: string]: any;
    }>;
}>;
export const CALL_ME_SENSEI_ROCK_SHADER_SETTINGS: Readonly<{
    projection: Readonly<{
        mode: "triplanar";
        upAxis: "y";
        scale: 48;
        saturation: 1;
        contrast: 1;
        brightness: 0;
        projectionContrast: 2;
        sideOnly: false;
        nearDetailScale: 1.2;
        nearDetailStrength: 0.42;
        nearDetailDistance: 70;
    }>;
    material: Readonly<{
        tint: readonly number[];
        metallic: 0;
        smoothness: 0.07;
        useSmoothnessTexture: false;
        smoothnessContrast: 1;
        emissiveStrength: 0;
    }>;
    lighting: Readonly<{
        exposure: 0.95;
        ambientFloor: 0.04;
        skyColorInfluence: 1;
        skyFillStrength: 0.72;
        skyFillTint: readonly number[];
        shadowFill: 0;
        shadowFillTint: readonly number[];
    }>;
    shoreline: Readonly<{
        wetBandWidth: 1;
        wetBandDarkening: 0.28;
        wetRoughness: 0.22;
    }>;
    distanceTint: Readonly<{
        closeDistance: 500;
        farDistance: 15000;
        color: readonly number[];
        strength: 0.42;
    }>;
    normals: Readonly<{
        distance: 30000;
        nearFlatten: 0;
        farFlatten: 1;
        useSmoothed: true;
        normalGreenSign: 1;
    }>;
    striping: Readonly<{
        enabled: false;
        scale: 2500;
        contrast: 0.25;
        color: readonly number[];
    }>;
    moss: Readonly<{
        enabled: false;
        size: 25;
        sharpness: 1.92;
        offset: -0.15;
        multiply: 1.94;
        colorPower: 1.3;
        lowColor: readonly number[];
        highColor: readonly number[];
        roughness: -1;
        relief: 0;
        fringe: 0;
        fringeScale: 0.35;
        formDriven: 0;
        coverage: -1;
        band: 0.18;
        patchScale: 0.6;
        patchStrength: 0.8;
        patchOctaves: 3;
        patchContrast: 1.6;
    }>;
    layerMask: Readonly<{
        useAssetMask: true;
        sharpness: 1.77;
        offset: 0.48;
    }>;
    grassLayer: Readonly<{
        enabled: false;
        useGroundShader: false;
        scale: 10;
        tint: readonly number[];
        saturation: 1;
        emission: 0;
    }>;
    snowLayer: Readonly<{
        enabled: false;
        scale: 11.51;
        tint: readonly number[];
        saturation: 1;
        emission: 0.03;
    }>;
    sandLayer: Readonly<{
        enabled: false;
        useGroundShader: false;
        scale: 5;
        tint: readonly number[];
        saturation: 1;
        emission: 0.1;
        normalScale: 20;
        normalStrength: 0.5;
        normalRotationDegrees: 30;
    }>;
    assetIntegration: Readonly<{
        sourceAlbedoMode: "blend";
        sourceAlbedoStrength: 0.5;
        sourceNormalStrength: 1;
        sourceAoStrength: 1;
        vertexColorStrength: 0;
        vertexAoStrength: 0;
    }>;
}>;
