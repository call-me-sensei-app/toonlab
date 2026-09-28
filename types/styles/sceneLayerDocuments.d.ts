export const SCENE_LAYER_DOCUMENT_VERSION: 1;
export const SCENE_CONTENT_DOCUMENT_TYPE: "toonlab/scene-content";
export const SCENE_SCENARIO_DOCUMENT_TYPE: "toonlab/scene-scenario";
export const SCENE_QUALITY_DOCUMENT_TYPE: "toonlab/scene-quality";
export const SCENE_OVERRIDE_DOCUMENT_TYPE: "toonlab/scene-overrides";
export function validateSceneContentDocument(input: any): {
    errors: string[];
    ok: boolean;
    value: {
        [x: number]: any;
        type: any;
        version: number;
        id: any;
        label: any;
        description: any;
    };
    warnings: any[];
};
export function createSceneContentDocument(id: any, definition: any): {
    [x: number]: any;
    type: any;
    version: number;
    id: any;
    label: any;
    description: any;
};
export function parseSceneContentDocument(input: any): {
    errors: string[];
    ok: boolean;
    value: {
        [x: number]: any;
        type: any;
        version: number;
        id: any;
        label: any;
        description: any;
    };
    warnings: any[];
};
export function serializeSceneContentDocument(input: any, options: any): string;
export function validateSceneScenarioDocument(input: any): {
    errors: string[];
    ok: boolean;
    value: {
        [x: number]: any;
        type: any;
        version: number;
        id: any;
        label: any;
        description: any;
    };
    warnings: any[];
};
export function createSceneScenarioDocument(id: any, definition: any): {
    [x: number]: any;
    type: any;
    version: number;
    id: any;
    label: any;
    description: any;
};
export function parseSceneScenarioDocument(input: any): {
    errors: string[];
    ok: boolean;
    value: {
        [x: number]: any;
        type: any;
        version: number;
        id: any;
        label: any;
        description: any;
    };
    warnings: any[];
};
export function serializeSceneScenarioDocument(input: any, options: any): string;
export function validateSceneQualityDocument(input: any): {
    errors: string[];
    ok: boolean;
    value: {
        [x: number]: any;
        type: any;
        version: number;
        id: any;
        label: any;
        description: any;
    };
    warnings: any[];
};
export function createSceneQualityDocument(id: any, definition: any): {
    [x: number]: any;
    type: any;
    version: number;
    id: any;
    label: any;
    description: any;
};
export function parseSceneQualityDocument(input: any): {
    errors: string[];
    ok: boolean;
    value: {
        [x: number]: any;
        type: any;
        version: number;
        id: any;
        label: any;
        description: any;
    };
    warnings: any[];
};
export function serializeSceneQualityDocument(input: any, options: any): string;
export function validateSceneOverrideDocument(input: any): {
    errors: string[];
    ok: boolean;
    value: {
        [x: number]: any;
        type: any;
        version: number;
        id: any;
        label: any;
        description: any;
    };
    warnings: any[];
};
export function createSceneOverrideDocument(id: any, definition: any): {
    [x: number]: any;
    type: any;
    version: number;
    id: any;
    label: any;
    description: any;
};
export function parseSceneOverrideDocument(input: any): {
    errors: string[];
    ok: boolean;
    value: {
        [x: number]: any;
        type: any;
        version: number;
        id: any;
        label: any;
        description: any;
    };
    warnings: any[];
};
export function serializeSceneOverrideDocument(input: any, options: any): string;
