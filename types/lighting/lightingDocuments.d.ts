/** Creates a serializable recipe-level shadow policy. */
export function createShadowPolicy(value?: any): {
    allowedTypes: any[];
    directionalCascades: number;
    maxShadowedLights: number;
    maxShadowMapPixels: number;
    mode: any;
    updateMode: any;
};
/**
 * Creates a normalized, mutable LightingRecipe document.
 * All positions and distances are expressed in meters.
 */
export function createLightingRecipe(options?: {}): {
    id: string;
    lights: any;
    metadata: any;
    name: string;
    schemaVersion: number;
    shadowPolicy: {
        allowedTypes: any[];
        directionalCascades: number;
        maxShadowedLights: number;
        maxShadowMapPixels: number;
        mode: any;
        updateMode: any;
    };
    type: string;
};
/** Structural validation for untrusted or hand-edited LightingRecipe JSON. */
export function validateLightingRecipe(value: any): Readonly<{
    errors: readonly any[];
    ok: boolean;
    valid: boolean;
    warnings: readonly any[];
}>;
/** Throws when a LightingRecipe is structurally invalid, otherwise returns it. */
export function assertLightingRecipe(value: any): any;
/** Serializes a validated LightingRecipe document. */
export function serializeLightingRecipe(recipe: any, { pretty }?: {
    pretty?: boolean;
}): string;
/** Parses, validates, and normalizes a LightingRecipe JSON string or object. */
export function deserializeLightingRecipe(jsonOrObject: any): {
    id: string;
    lights: any;
    metadata: any;
    name: string;
    schemaVersion: number;
    shadowPolicy: {
        allowedTypes: any[];
        directionalCascades: number;
        maxShadowedLights: number;
        maxShadowMapPixels: number;
        mode: any;
        updateMode: any;
    };
    type: string;
};
/**
 * Creates a versioned look document. A look owns a recipe plus portable
 * environment/post hints and a quality profile reference or inline profile.
 */
export function createLightingLook(options?: {}): {
    environment: any;
    id: string;
    metadata: any;
    name: string;
    post: any;
    quality: any;
    recipe: any;
    schemaVersion: number;
    type: string;
};
/** Structural validation for reusable lighting-look documents. */
export function validateLightingLook(value: any): Readonly<{
    errors: readonly any[];
    ok: boolean;
    valid: boolean;
    warnings: readonly any[];
}>;
export function assertLightingLook(value: any): any;
export function serializeLightingLook(look: any, { pretty }?: {
    pretty?: boolean;
}): string;
export function deserializeLightingLook(jsonOrObject: any): {
    environment: any;
    id: string;
    metadata: any;
    name: string;
    post: any;
    quality: any;
    recipe: any;
    schemaVersion: number;
    type: string;
};
/** Type and schema stamps for saved LightingRecipe documents. */
export const LIGHTING_RECIPE_DOCUMENT_TYPE: "toonlab/lighting-recipe";
export const LIGHTING_RECIPE_SCHEMA_VERSION: 1;
/** Type and schema stamps for saved, reusable lighting-look documents. */
export const LIGHTING_LOOK_DOCUMENT_TYPE: "toonlab/lighting-look";
export const LIGHTING_LOOK_SCHEMA_VERSION: 1;
export const SHADOW_POLICY_MODES: readonly string[];
export const SHADOW_UPDATE_MODES: readonly string[];
/**
 * Creates a versioned look document. A look owns a recipe plus portable
 * environment/post hints and a quality profile reference or inline profile.
 */
export function createLightingLookPreset(options?: {}): {
    environment: any;
    id: string;
    metadata: any;
    name: string;
    post: any;
    quality: any;
    recipe: any;
    schemaVersion: number;
    type: string;
};
/** Structural validation for reusable lighting-look documents. */
export function validateLightingLookPreset(value: any): Readonly<{
    errors: readonly any[];
    ok: boolean;
    valid: boolean;
    warnings: readonly any[];
}>;
export function serializeLightingLookPreset(look: any, { pretty }?: {
    pretty?: boolean;
}): string;
export function deserializeLightingLookPreset(jsonOrObject: any): {
    environment: any;
    id: string;
    metadata: any;
    name: string;
    post: any;
    quality: any;
    recipe: any;
    schemaVersion: number;
    type: string;
};
