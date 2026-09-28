/** Builds complete style settings from a sampled high-level palette. */
export function buildLightingStyleFromSample(sampled?: {}, configuration?: {}): {
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
export function registerLightingStyleGeneratorFamily(id: any, definition?: {}, { overwrite }?: {
    overwrite?: boolean;
}): string;
export function getLightingStyleGeneratorFamilyOptions(): {
    description: string;
    id: string;
    label: string;
}[];
export function createLightingStyleGeneratorRecipe(id?: string, definition?: {}): {
    basePreset: string;
    configuration: {};
    description: string;
    domains: {};
    id: string;
    label: string;
    locks: any[];
    seed: number;
    type: string;
    version: number;
};
export function validateLightingStyleGeneratorRecipe(input: any): {
    errors: any[];
    ok: boolean;
    value: {
        basePreset: string;
        configuration: {};
        description: string;
        domains: {};
        id: string;
        label: string;
        locks: any[];
        seed: number;
        type: string;
        version: number;
    };
    warnings: any[];
};
export function parseLightingStyleGeneratorRecipe(input: any): any;
export function serializeLightingStyleGeneratorRecipe(idOrDocument: any, definition?: {}, { pretty }?: {
    pretty?: boolean;
}): string;
/** Resolves a style generator recipe into normalized lighting-style settings. */
export function resolveLightingStyleGeneratorRecipe(recipeInput: any): {
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
export function createGeneratedLightingStyleDocument(recipeInput: any, { id, label, }?: {
    id?: string;
    label?: string;
}): any;
/** Builds complete fixture settings from a sampled definition. */
export function buildLightFixtureFromSample(sampled?: {}, configuration?: {}): {
    base: any;
    category: string;
    emissive: {
        meshPattern: string;
        scale: number;
    };
    flicker: {
        amount: number;
        speed: number;
    };
    schedule: {
        minimum: number;
        mode: any;
    };
    variation: any;
};
export function registerLightFixtureGeneratorFamily(id: any, definition?: {}, { overwrite }?: {
    overwrite?: boolean;
}): string;
export function getLightFixtureGeneratorFamilyOptions(): {
    description: string;
    id: string;
    label: string;
}[];
export function createLightFixtureGeneratorRecipe(id?: string, definition?: {}): {
    basePreset: string;
    configuration: {};
    description: string;
    domains: {};
    id: string;
    label: string;
    locks: any[];
    seed: number;
    type: string;
    version: number;
};
export function validateLightFixtureGeneratorRecipe(input: any): {
    errors: any[];
    ok: boolean;
    value: {
        basePreset: string;
        configuration: {};
        description: string;
        domains: {};
        id: string;
        label: string;
        locks: any[];
        seed: number;
        type: string;
        version: number;
    };
    warnings: any[];
};
export function parseLightFixtureGeneratorRecipe(input: any): any;
export function serializeLightFixtureGeneratorRecipe(idOrDocument: any, definition?: {}, { pretty }?: {
    pretty?: boolean;
}): string;
/** Resolves a fixture generator recipe into normalized fixture settings. */
export function resolveLightFixtureGeneratorRecipe(recipeInput: any): {
    base: any;
    category: string;
    emissive: {
        meshPattern: string;
        scale: number;
    };
    flicker: {
        amount: number;
        speed: number;
    };
    schedule: {
        minimum: number;
        mode: any;
    };
    variation: any;
};
export function createGeneratedLightFixtureDocument(recipeInput: any, { id, label, }?: {
    id?: string;
    label?: string;
}): any;
export const LIGHTING_STYLE_GENERATOR_DOMAIN: "lighting-style";
export const LIGHT_FIXTURE_GENERATOR_DOMAIN: "light-fixture";
export const DEFAULT_LIGHTING_STYLE_DOMAINS: Readonly<{
    ambient: Readonly<{
        dayScale: Readonly<{
            $type: "range";
            max: any;
            min: any;
            step: number;
        }>;
        intensity: Readonly<{
            $type: "range";
            max: any;
            min: any;
            step: number;
        }>;
        nightScale: Readonly<{
            $type: "range";
            max: any;
            min: any;
            step: number;
        }>;
    }>;
    atmosphere: Readonly<{
        fogDay: Readonly<{
            $type: "color";
            from: any;
            to: any;
        }>;
        fogDusk: Readonly<{
            $type: "color";
            from: any;
            to: any;
        }>;
        fogNight: Readonly<{
            $type: "color";
            from: any;
            to: any;
        }>;
    }>;
    exposure: Readonly<{
        base: Readonly<{
            $type: "range";
            max: any;
            min: any;
            step: number;
        }>;
        nightScale: Readonly<{
            $type: "range";
            max: any;
            min: any;
            step: number;
        }>;
    }>;
    fixtures: Readonly<{
        intensityScale: Readonly<{
            $type: "range";
            max: any;
            min: any;
            step: number;
        }>;
        nightScale: Readonly<{
            $type: "range";
            max: any;
            min: any;
            step: number;
        }>;
    }>;
    schedule: Readonly<{
        sunriseHour: Readonly<{
            $type: "range";
            max: any;
            min: any;
            step: number;
        }>;
        sunsetHour: Readonly<{
            $type: "range";
            max: any;
            min: any;
            step: number;
        }>;
    }>;
    sun: Readonly<{
        accentScale: Readonly<{
            $type: "range";
            max: any;
            min: any;
            step: number;
        }>;
        dayIntensity: Readonly<{
            $type: "range";
            max: any;
            min: any;
            step: number;
        }>;
        dayKelvin: Readonly<{
            $type: "range";
            max: any;
            min: any;
            step: number;
        }>;
        duskIntensity: Readonly<{
            $type: "range";
            max: any;
            min: any;
            step: number;
        }>;
        duskKelvin: Readonly<{
            $type: "range";
            max: any;
            min: any;
            step: number;
        }>;
        nightIntensity: Readonly<{
            $type: "range";
            max: any;
            min: any;
            step: number;
        }>;
        nightKelvin: Readonly<{
            $type: "range";
            max: any;
            min: any;
            step: number;
        }>;
    }>;
}>;
export const DEFAULT_LIGHT_FIXTURE_DOMAINS: Readonly<{
    behavior: Readonly<{
        flickerAmount: Readonly<{
            $type: "range";
            max: any;
            min: any;
            step: number;
        }>;
        flickerSpeed: Readonly<{
            $type: "range";
            max: any;
            min: any;
            step: number;
        }>;
        scheduleMode: Readonly<{
            $type: "choice";
            options: any[];
        }>;
    }>;
    emission: Readonly<{
        distance: Readonly<{
            $type: "range";
            max: any;
            min: any;
            step: number;
        }>;
        height: Readonly<{
            $type: "range";
            max: any;
            min: any;
            step: number;
        }>;
        kelvin: Readonly<{
            $type: "range";
            max: any;
            min: any;
            step: number;
        }>;
        lumens: Readonly<{
            $type: "range";
            max: any;
            min: any;
            step: number;
        }>;
    }>;
    variation: Readonly<{
        intensitySpread: Readonly<{
            $type: "range";
            max: any;
            min: any;
            step: number;
        }>;
        kelvinSpread: Readonly<{
            $type: "range";
            max: any;
            min: any;
            step: number;
        }>;
    }>;
}>;
