/**
 * Guards the invariant this module exists to protect: the march budget is fixed
 * and must never appear in the tier table. Runs at import time and is exported
 * so the verify scripts can assert it too.
 */
export function assertFixedMarchBudget(): Readonly<{
    lightSteps: 6;
    primarySteps: 128;
}>;
/** The march budget, which is the same object for every tier by construction. */
export function resolveMarchBudget(): Readonly<{
    lightSteps: 6;
    primarySteps: 128;
}>;
export function resolveQualityLevelName(level: any): string;
/**
 * Merges a `Partial<QualityLevelConfig>` over a named tier. Unknown fields, any
 * attempt to override the fixed march budget, and any value a field cannot
 * represent are all reported and dropped — nothing is discarded silently.
 */
export function resolveQuality(level?: string, overrides?: {}): Readonly<{}>;
/** Primary march steps per view ray. Fixed across every tier. */
export const CLOUD_PRIMARY_MARCH_STEPS: 128;
/** Light-march steps per primary sample. Fixed across every tier. */
export const CLOUD_LIGHT_MARCH_STEPS: 6;
export const CLOUD_MARCH_BUDGET: Readonly<{
    lightSteps: 6;
    primarySteps: 128;
}>;
export const QUALITY_LEVELS: Readonly<{
    low: Readonly<{
        baseShapeDims: Readonly<{
            x: any;
            y: any;
            z: any;
        }>;
        cloudHistoryDiv: 4;
        cloudShadowMipLevel: 3;
        cloudShadowResolution: 128;
        envMapClouds: false;
        envMapEnabled: true;
        envMapHeight: 128;
        envMapMarchSteps: 24;
        envMapMipBase: 3;
        envMapWidth: 256;
        godRaySteps: 16;
        godRaysEnabled: false;
        weatherMapResolution: 256;
    }>;
    medium: Readonly<{
        baseShapeDims: Readonly<{
            x: any;
            y: any;
            z: any;
        }>;
        cloudHistoryDiv: 2;
        cloudShadowMipLevel: 2;
        cloudShadowResolution: 256;
        envMapClouds: true;
        envMapEnabled: true;
        envMapHeight: 192;
        envMapMarchSteps: 32;
        envMapMipBase: 2;
        envMapWidth: 384;
        godRaySteps: 16;
        godRaysEnabled: true;
        weatherMapResolution: 512;
    }>;
    high: Readonly<{
        baseShapeDims: Readonly<{
            x: any;
            y: any;
            z: any;
        }>;
        cloudHistoryDiv: 2;
        cloudShadowMipLevel: 2;
        cloudShadowResolution: 512;
        envMapClouds: true;
        envMapEnabled: true;
        envMapHeight: 256;
        envMapMarchSteps: 48;
        envMapMipBase: 1;
        envMapWidth: 512;
        godRaySteps: 24;
        godRaysEnabled: true;
        weatherMapResolution: 1024;
    }>;
    ultra: Readonly<{
        baseShapeDims: Readonly<{
            x: any;
            y: any;
            z: any;
        }>;
        cloudHistoryDiv: 2;
        cloudShadowMipLevel: 1;
        cloudShadowResolution: 1024;
        envMapClouds: true;
        envMapEnabled: true;
        envMapHeight: 512;
        envMapMarchSteps: 64;
        envMapMipBase: 1;
        envMapWidth: 1024;
        godRaySteps: 24;
        godRaysEnabled: true;
        weatherMapResolution: 1024;
    }>;
}>;
export const QUALITY_LEVEL_NAMES: readonly string[];
export const DEFAULT_QUALITY_LEVEL: "high";
export const QUALITY_LEVEL_OPTIONS: readonly (Readonly<{
    description: "Quarter-rate cloud reconstruction, no god rays, cloud-free reflections.";
    id: "low";
    label: "Low";
    value: "low";
}> | Readonly<{
    description: "Half-rate reconstruction with god rays and clouded reflections.";
    id: "medium";
    label: "Medium";
    value: "medium";
}> | Readonly<{
    description: "Default tier: half-rate reconstruction, full-detail shape volume.";
    id: "high";
    label: "High";
    value: "high";
}> | Readonly<{
    description: "Sharpest shadows and reflections; same march budget as every other tier.";
    id: "ultra";
    label: "Ultra";
    value: "ultra";
}>)[];
export const QUALITY_LEVEL_FIELDS: Readonly<{
    cloudHistoryDiv: Readonly<{
        description: "Reconstruction divisor. The cloud image renders at screen size divided by this and upscales, so each step quarters the work.";
        label: "Cloud History Divisor";
        options: readonly number[];
        type: "integer";
    }>;
    cloudShadowResolution: Readonly<{
        description: "Square resolution of the top-down cloud shadow bake.";
        label: "Shadow Resolution";
        max: 1024;
        min: 128;
        type: "integer";
        unit: "pixels";
    }>;
    cloudShadowMipLevel: Readonly<{
        description: "Cloud-field detail the shadow bake reads, as a halving of the 64-cubed master volume. 0 is finest; the resolved volume never goes below 8 cubed.";
        label: "Shadow Mip";
        max: 3;
        min: 0;
        type: "integer";
    }>;
    godRaysEnabled: Readonly<{
        description: "Runs the crepuscular-ray march. A preset may override this.";
        label: "God Rays";
        type: "boolean";
    }>;
    godRaySteps: Readonly<{
        description: "Samples per view ray in the god-ray march. The dominant cost of the effect.";
        label: "God Ray Steps";
        min: 1;
        type: "integer";
    }>;
    envMapEnabled: Readonly<{
        description: "Bakes the reflection environment map.";
        label: "Env Map";
        type: "boolean";
    }>;
    envMapClouds: Readonly<{
        description: "Bakes clouds into the reflection as well as the sky dome.";
        label: "Env Map Clouds";
        type: "boolean";
    }>;
    envMapWidth: Readonly<{
        description: "Equirectangular bake width.";
        label: "Env Map Width";
        min: 8;
        type: "integer";
        unit: "pixels";
    }>;
    envMapHeight: Readonly<{
        description: "Equirectangular bake height, normally half the width.";
        label: "Env Map Height";
        min: 8;
        type: "integer";
        unit: "pixels";
    }>;
    envMapMarchSteps: Readonly<{
        description: "Cloud march steps for the env-map bake. Independent of the on-screen budget, and far lower.";
        label: "Env Map March Steps";
        min: 1;
        type: "integer";
    }>;
    envMapMipBase: Readonly<{
        description: "Base-shape detail floor for the bake, as a halving of the 64-cubed master volume. Higher buys cheaper, softer reflections; the resolved volume never goes below 8 cubed.";
        label: "Env Map Mip Base";
        min: 0;
        type: "integer";
    }>;
    weatherMapResolution: Readonly<{
        description: `Square resolution of the CPU-generated coverage map. One of ${string}.`;
        label: "Weather Resolution";
        options: readonly number[];
        type: "integer";
        unit: "pixels";
    }>;
    baseShapeDims: Readonly<{
        description: "Base-shape 3D noise resolution. Always generated on the CPU, cached per (resolution, seed). Cost scales with texel count — 64 cubed is 8x the texels of 32 cubed and takes a few hundred ms — so drive it from a debounced control.";
        label: "Base Shape Dims";
        max: 64;
        min: 8;
        type: "dims3";
        unit: "voxels";
    }>;
}>;
/** Env-map defaults when one is built directly rather than seeded from a tier. */
export const DEFAULT_ENV_MAP_OPTIONS: Readonly<{
    cloudMarchSteps: 16;
    cloudMipBase: 0;
    includeClouds: true;
    skipFrames: 4;
    width: 384;
}>;
