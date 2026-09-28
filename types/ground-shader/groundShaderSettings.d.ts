export function createGroundShaderSettings(options?: {}): {};
export function validateGroundShaderPresetDocument(input: any): {
    errors: string[];
    ok: boolean;
    value: {
        description: string;
        id: string;
        label: string;
        settings: {};
        type: string;
        version: number;
    };
    warnings: string[];
};
export function createGroundShaderPresetDocument(id: any, definition?: {}): {
    description: string;
    id: string;
    label: string;
    settings: {};
    type: string;
    version: number;
};
export function serializeGroundShaderPreset(idOrDocument: any, definition?: {}, { pretty }?: {
    pretty?: boolean;
}): string;
export function registerGroundShaderPreset(id: any, definition?: {}, { overwrite }?: {
    overwrite?: boolean;
}): {
    description: string;
    id: string;
    label: string;
    value: string;
};
export function registerSerializedGroundShaderPreset(input: any, options?: {}): {
    description: string;
    id: string;
    label: string;
    value: string;
};
export function getGroundShaderPresetOptions(): {
    description: any;
    id: any;
    label: any;
    value: any;
}[];
export function resolveGroundShaderPreset(id?: string, overrides?: {}): {};
export const GROUND_SHADER_DOCUMENT_TYPE: "toonlab/ground-shader-preset";
export const GROUND_SHADER_SCHEMA_VERSION: 1;
export const DEFAULT_GROUND_SHADER_PRESET: "call_me_sensei";
export const DEFAULT_GROUND_SHADER_SETTINGS: Readonly<{}>;
export const GROUND_SHADER_FIELD_SCHEMA: Readonly<{}>;
export const GROUND_SHADER_UNIFORM_BY_FIELD: Readonly<{}>;
export const GROUND_SHADER_SETTING_GROUPS: readonly Readonly<{
    description: "Coordinated base treatment for the four semantic ground layers." | "World-space layer scale and steep-surface projection." | "Large-scale color variation that prevents flat, repeating terrain." | "How steep terrain transitions toward the rock treatment." | "Response to the current scene water level; the water level itself is never serialized." | "Shared physically based response for the ground surface." | "Ground-specific response to the current scene sun and sky." | "How ground responds to current wetness and snow coverage." | "How printable dirt, sand, and snow respond to transient footprint and track stamps." | "Atmospheric recession and detail simplification over viewing distance.";
    id: string;
    label: "Lighting" | "Weather Response" | "Material Response" | "Shoreline Response" | "Ground Layers" | "Projection" | "Macro Variation" | "Slope Response" | "Print Response" | "Distance Treatment";
}>[];
export function parseGroundShaderPresetDocument(input: any): {
    errors: string[];
    ok: boolean;
    value: {
        description: string;
        id: string;
        label: string;
        settings: {};
        type: string;
        version: number;
    };
    warnings: string[];
};
/** Complete portable Call Me Sensei starting point used by the Ground Shader Lab. */
export const CALL_ME_SENSEI_GROUND_SHADER_SETTINGS: Readonly<{}>;
export const GROUND_SHADER: Readonly<{
    createDocument: typeof createGroundShaderPresetDocument;
    createSettings: typeof createGroundShaderSettings;
    defaults: Readonly<{}>;
    description: "Reusable terrain treatment with bounded transient print response, independent from landscape geometry and collision.";
    documentType: "toonlab/ground-shader-preset";
    fieldSchema: Readonly<{}>;
    getPresetOptions: typeof getGroundShaderPresetOptions;
    groups: readonly Readonly<{
        description: "Coordinated base treatment for the four semantic ground layers." | "World-space layer scale and steep-surface projection." | "Large-scale color variation that prevents flat, repeating terrain." | "How steep terrain transitions toward the rock treatment." | "Response to the current scene water level; the water level itself is never serialized." | "Shared physically based response for the ground surface." | "Ground-specific response to the current scene sun and sky." | "How ground responds to current wetness and snow coverage." | "How printable dirt, sand, and snow respond to transient footprint and track stamps." | "Atmospheric recession and detail simplification over viewing distance.";
        id: string;
        label: "Lighting" | "Weather Response" | "Material Response" | "Shoreline Response" | "Ground Layers" | "Projection" | "Macro Variation" | "Slope Response" | "Print Response" | "Distance Treatment";
    }>[];
    id: "ground";
    label: "Ground Shader";
    registerPreset: typeof registerGroundShaderPreset;
    validateDocument: typeof validateGroundShaderPresetDocument;
}>;
