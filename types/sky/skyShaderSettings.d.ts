export function createSkyShaderSettings(options?: {}): {
    [k: string]: any;
};
export function validateSkyShaderPresetDocument(input: any): {
    errors: string[];
    ok: boolean;
    value: {
        atmosphere: {
            mieCoefficient: number;
            mieDirectionalG: number;
            rayleigh: number;
            turbidity: number;
        };
        description: string;
        id: string;
        label: string;
        settings: {
            [k: string]: any;
        };
        timeKeyframes: any[];
        type: string;
        version: number;
    };
    warnings: string[];
};
export function createSkyShaderPresetDocument(id: any, definition?: {}): {
    atmosphere: {
        mieCoefficient: number;
        mieDirectionalG: number;
        rayleigh: number;
        turbidity: number;
    };
    description: string;
    id: string;
    label: string;
    settings: {
        [k: string]: any;
    };
    timeKeyframes: any[];
    type: string;
    version: number;
};
export function serializeSkyShaderPreset(idOrDocument: any, definition?: {}, { pretty }?: {
    pretty?: boolean;
}): string;
export function registerSkyShaderPreset(id: any, definition?: {}, { overwrite }?: {
    overwrite?: boolean;
}): {
    description: string;
    id: string;
    label: string;
    value: string;
};
export function registerSerializedSkyShaderPreset(input: any, options?: {}): {
    description: string;
    id: string;
    label: string;
    value: string;
};
export function getSkyShaderPresetOptions(): {
    description: any;
    id: any;
    label: any;
    value: any;
}[];
export function applySkyShaderSettings(target: any, options?: {}): {
    [k: string]: any;
} | {
    atmosphere: {
        mieCoefficient: number;
        mieDirectionalG: number;
        rayleigh: number;
        turbidity: number;
    };
    settings: {
        [k: string]: any;
    };
    timeKeyframes: any[];
};
export const SKY_SHADER_DOCUMENT_TYPE: "toonlab/sky-shader-preset";
export const SKY_SHADER_SCHEMA_VERSION: 2;
export const DEFAULT_SKY_SHADER_PRESET: "call_me_sensei";
export const SKY_SHADER_SETTING_GROUPS: readonly (Readonly<{
    description: "Anime color-curve sampling, grading, region tints, and visible horizon treatment.";
    id: "gradient";
    label: "Gradient";
}> | Readonly<{
    description: "Appearance of the visible sun disc and halo. Direction and visibility come from time of day.";
    id: "sun";
    label: "Sun";
}> | Readonly<{
    description: "Appearance of the visible moon disc and halo. Direction and visibility come from time of day.";
    id: "moon";
    label: "Moon";
}> | Readonly<{
    description: "Procedural star-field appearance. The runtime clock controls day/night visibility.";
    id: "stars";
    label: "Stars";
}>)[];
export const SKY_SHADER_FIELD_SCHEMA: Readonly<{
    [k: string]: Readonly<{
        [k: string]: Readonly<{
            serializable: true;
            type: any;
            range?: any;
            defaultValue: any;
            description: any;
            group: "sun" | "gradient" | "stars" | "moon";
            id: `sun.${string}` | `gradient.${string}` | `stars.${string}` | `moon.${string}`;
            integer: any;
            key: string;
            label: any;
        }>;
    }>;
}>;
export const SKY_SHADER_FIELD_COUNT: number;
export const DEFAULT_SKY_SHADER_SETTINGS: Readonly<{
    [k: string]: any;
}>;
export const CALL_ME_SENSEI_SKY_SHADER_SETTINGS: Readonly<{
    atlasContrast: 1.04;
    atlasSaturation: 1.2;
    belowHorizonTint: readonly number[];
    horizonGlowStrength: 0.24;
    horizonTint: readonly number[];
    skyTint: readonly number[];
    starsStrength: 0.86;
    sunGlowStrength: 0.52;
    zenithTint: readonly number[];
}>;
export function parseSkyShaderPresetDocument(input: any): {
    errors: string[];
    ok: boolean;
    value: {
        atmosphere: {
            mieCoefficient: number;
            mieDirectionalG: number;
            rayleigh: number;
            turbidity: number;
        };
        description: string;
        id: string;
        label: string;
        settings: {
            [k: string]: any;
        };
        timeKeyframes: any[];
        type: string;
        version: number;
    };
    warnings: string[];
};
