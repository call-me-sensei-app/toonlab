export function registerPostGeneratorFamily(id: any, definition?: {}, { overwrite }?: {
    overwrite?: boolean;
}): string;
export function getPostGeneratorFamilyOptions(): {
    description: string;
    id: string;
    label: string;
}[];
export function createPostGeneratorRecipe(id?: string, definition?: {}): {
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
export function validatePostGeneratorRecipe(input: any): {
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
export function parsePostGeneratorRecipe(input: any): any;
export function serializePostGeneratorRecipe(idOrDocument: any, definition?: {}, { pretty }?: {
    pretty?: boolean;
}): string;
/** Resolves a generator document into a flat runtime settings object. */
export function resolvePostGeneratorRecipe(recipeInput: any, { quality }?: {
    quality?: string;
}): {
    features: any;
    parameters: {
        bloomBackgroundSuppress: 1;
        bloomCharacterBoost: 1;
        bloomCharacterSaturation: 1;
        bloomLevels: 5;
        bloomMode: "single";
        bloomRadius: 0.16;
        bloomStrength: 0;
        bloomThreshold: 0.995;
        bottomDark: 0;
        atmosphereBaseHeight: 0;
        atmosphereFar: 900;
        atmosphereGlowStrength: 1;
        atmosphereHeightFalloff: 0.012;
        atmosphereNear: 60;
        atmosphereStrength: 0.55;
        contrast: 1;
        depthCueColor: import("three").Color;
        depthCueFar: 24;
        depthCueNear: 1;
        depthCueStrength: 0;
        exposure: 1;
        lutMap: any;
        lutSize: 0;
        lutStrength: 0;
        motionBlurStrength: 0.55;
        outlineColor: import("three").Color;
        outlineDepthStrength: 0.16;
        outlineLumaStrength: 0.04;
        outlineStrength: 0;
        saturation: 1;
        strength: 1;
        topLight: 0;
        vignetteRadius: 0.55;
        vignetteSoftness: 0.34;
        vignetteStrength: 0;
        warmth: 0;
    };
    preset: any;
};
export function createGeneratedPostPresetDocument(recipeInput: any, { id, label, quality, }?: {
    id?: string;
    label?: string;
    quality?: string;
}): any;
export const POST_GENERATOR_DOMAIN: "post-processing";
export const DEFAULT_POST_GENERATOR_DOMAINS: Readonly<{
    features: Readonly<{
        bloom: Readonly<{
            $type: "boolean";
            probability: any;
        }>;
        colorGrade: Readonly<{
            $type: "boolean";
            probability: any;
        }>;
        depthCue: Readonly<{
            $type: "boolean";
            probability: any;
        }>;
        enabled: Readonly<{
            $type: "constant";
            value: true;
        }>;
        motionBlur: Readonly<{
            $type: "boolean";
            probability: any;
        }>;
        screenOutline: Readonly<{
            $type: "boolean";
            probability: any;
        }>;
        vignette: Readonly<{
            $type: "boolean";
            probability: any;
        }>;
        verticalGrade: Readonly<{
            $type: "boolean";
            probability: any;
        }>;
    }>;
    parameters: Readonly<{
        bloomBackgroundSuppress: Readonly<{
            $type: "range";
            max: any;
            min: any;
            step: number;
        }>;
        bloomCharacterBoost: Readonly<{
            $type: "range";
            max: any;
            min: any;
            step: number;
        }>;
        bloomLevels: Readonly<{
            $type: "range";
            max: any;
            min: any;
            step: number;
        }>;
        bloomMode: Readonly<{
            $type: "choice";
            options: any[];
        }>;
        bloomRadius: Readonly<{
            $type: "range";
            max: any;
            min: any;
            step: number;
        }>;
        bloomStrength: Readonly<{
            $type: "range";
            max: any;
            min: any;
            step: number;
        }>;
        bloomThreshold: Readonly<{
            $type: "range";
            max: any;
            min: any;
            step: number;
        }>;
        bottomDark: Readonly<{
            $type: "range";
            max: any;
            min: any;
            step: number;
        }>;
        contrast: Readonly<{
            $type: "range";
            max: any;
            min: any;
            step: number;
        }>;
        depthCueColor: Readonly<{
            $type: "color";
            from: number[];
            to: number[];
        }>;
        depthCueFar: Readonly<{
            $type: "range";
            max: any;
            min: any;
            step: number;
        }>;
        depthCueNear: Readonly<{
            $type: "range";
            max: any;
            min: any;
            step: number;
        }>;
        depthCueStrength: Readonly<{
            $type: "range";
            max: any;
            min: any;
            step: number;
        }>;
        exposure: Readonly<{
            $type: "range";
            max: any;
            min: any;
            step: number;
        }>;
        motionBlurStrength: Readonly<{
            $type: "range";
            max: any;
            min: any;
            step: number;
        }>;
        outlineColor: Readonly<{
            $type: "color";
            from: number[];
            to: number[];
            linked: true;
        }>;
        outlineDepthStrength: Readonly<{
            $type: "range";
            max: any;
            min: any;
            step: number;
        }>;
        outlineLumaStrength: Readonly<{
            $type: "range";
            max: any;
            min: any;
            step: number;
        }>;
        outlineStrength: Readonly<{
            $type: "range";
            max: any;
            min: any;
            step: number;
        }>;
        saturation: Readonly<{
            $type: "range";
            max: any;
            min: any;
            step: number;
        }>;
        strength: Readonly<{
            $type: "range";
            max: any;
            min: any;
            step: number;
        }>;
        topLight: Readonly<{
            $type: "range";
            max: any;
            min: any;
            step: number;
        }>;
        vignetteRadius: Readonly<{
            $type: "range";
            max: any;
            min: any;
            step: number;
        }>;
        vignetteSoftness: Readonly<{
            $type: "range";
            max: any;
            min: any;
            step: number;
        }>;
        vignetteStrength: Readonly<{
            $type: "range";
            max: any;
            min: any;
            step: number;
        }>;
        warmth: Readonly<{
            $type: "range";
            max: any;
            min: any;
            step: number;
        }>;
    }>;
}>;
