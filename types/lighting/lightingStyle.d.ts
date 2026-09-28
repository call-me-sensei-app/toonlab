/** Normalizes a complete lighting style from a partial source. */
export function createLightingStyleSettings(source?: {}): {
    ambientLight: {
        color: any;
        enabled: boolean;
        intensity: number;
    };
    dayCycle: any[];
    exposure: {
        base: number;
        enabled: boolean;
    };
    fixtures: {
        intensityScale: number;
    };
    quality: any;
    shadowPolicy: {
        allowedTypes: any[];
        directionalCascades: number;
        maxShadowedLights: number;
        maxShadowMapPixels: number;
        mode: any;
        updateMode: any;
    };
    skyProbe: {
        colorSrgb8: any;
        enabled: boolean;
        intensity: number;
        referenceContract: any;
        threeCoefficients: any;
    };
    sunPath: {
        azimuthArc: number;
        azimuthOffset: number;
        heightBase: number;
        heightScale: number;
        minElevation: number;
        orbitRadius: number;
    };
    toonResponse: {
        bandSoftness: number;
        rimInfluence: number;
        shadowTint: any;
    };
};
/**
 * Samples the style's day cycle at an hour (0-24, wrapping). Returns plain
 * arrays/numbers so callers decide what becomes a THREE object.
 */
export function sampleLightingStyle(settings: any, hour?: number): {
    accentScale: any;
    ambientScale: any;
    exposure: number;
    fixtureScale: any;
    fogColor: any[];
    hour: number;
    skyGroundTint: any[];
    skyHorizonColor: any[];
    skyTopTint: any[];
    skyProbeColor: any[];
    skyProbeEnergy: any;
    skyZenithColor: any[];
    starsStrength: any;
    sunColor: any[];
    sunElevation: number;
    sunIntensity: any;
    sunSourceRatios: {
        x: number;
        y: any;
        z: number;
    };
};
/** Registers a lighting style preset. Returns the normalized id. */
export function registerLightingStylePreset(id: any, definition?: {}, { overwrite }?: {
    overwrite?: boolean;
}): string;
export function getLightingStylePresetOptions(): {
    description: any;
    id: any;
    label: any;
}[];
/** Resolves an id, document, or settings object into normalized settings. */
export function resolveLightingStylePreset(value?: string): any;
export function validateLightingStylePresetDocument(input: any): {
    errors: string[];
    ok: boolean;
    value: {
        description: string;
        id: any;
        label: string;
        settings: any;
        type: any;
        version: any;
    };
    warnings: any[];
};
export function createLightingStylePresetDocument(id: any, definition?: {}): any;
export function parseLightingStylePresetDocument(input: any): any;
export function serializeLightingStylePresetDocument(idOrDocument: any, definition?: {}, { pretty }?: {
    pretty?: boolean;
}): string;
/** Registers a parsed/validated style document in the runtime registry. */
export function registerLightingStylePresetDocument(document: any, { overwrite }?: {
    overwrite?: boolean;
}): string;
export const LIGHTING_STYLE_DOCUMENT_TYPE: "toonlab/lighting-style";
export const LIGHTING_STYLE_SCHEMA_VERSION: 1;
/** Every lighting-style field applies as a hot update; nothing forces a rebuild. */
export const LIGHTING_STYLE_APPLY_METADATA: Readonly<{
    '*': "hot";
}>;
/** Normalizes a complete lighting style from a partial source. */
export function sanitizeLightingStyleSettings(source?: {}): {
    ambientLight: {
        color: any;
        enabled: boolean;
        intensity: number;
    };
    dayCycle: any[];
    exposure: {
        base: number;
        enabled: boolean;
    };
    fixtures: {
        intensityScale: number;
    };
    quality: any;
    shadowPolicy: {
        allowedTypes: any[];
        directionalCascades: number;
        maxShadowedLights: number;
        maxShadowMapPixels: number;
        mode: any;
        updateMode: any;
    };
    skyProbe: {
        colorSrgb8: any;
        enabled: boolean;
        intensity: number;
        referenceContract: any;
        threeCoefficients: any;
    };
    sunPath: {
        azimuthArc: number;
        azimuthOffset: number;
        heightBase: number;
        heightScale: number;
        minElevation: number;
        orbitRadius: number;
    };
    toonResponse: {
        bandSoftness: number;
        rimInfluence: number;
        shadowTint: any;
    };
};
