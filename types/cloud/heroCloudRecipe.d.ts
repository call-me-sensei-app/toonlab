/** Normalizes a portable, placement-free hero-cloud recipe. */
export function createHeroCloudRecipe(input?: {}): {
    type: string;
    version: number;
    id: string;
    label: string;
    seed: number;
    bounds: {
        diameter: number;
        height: number;
    };
    footprint: {
        breakup: number;
        development: number;
        softness: number;
        strokes: any;
    };
};
/** Parses a portable hero-cloud recipe without accepting a future schema. */
export function parseHeroCloudRecipe(input: any): {
    errors: string[];
    ok: boolean;
    warnings: any[];
    value?: undefined;
} | {
    errors: string[];
    ok: boolean;
    value: {
        type: string;
        version: number;
        id: string;
        label: string;
        seed: number;
        bounds: {
            diameter: number;
            height: number;
        };
        footprint: {
            breakup: number;
            development: number;
            softness: number;
            strokes: any;
        };
    };
    warnings: string[];
};
export function serializeHeroCloudRecipe(input: any): string;
/** Rasterizes the top-down doodle to normalized cloud-column development. */
export function rasterizeHeroCloudFootprint(input: any, { resolution }?: {
    resolution?: number;
}): {
    data: Uint8Array<ArrayBuffer>;
    height: number;
    recipe: {
        type: string;
        version: number;
        id: string;
        label: string;
        seed: number;
        bounds: {
            diameter: number;
            height: number;
        };
        footprint: {
            breakup: number;
            development: number;
            softness: number;
            strokes: any;
        };
    };
    width: number;
};
/** Builds the weather-map texture the physical volume marcher consumes. */
export function createHeroCloudWeatherTexture(input: any, { resolution, }?: {
    resolution?: number;
}): THREE.DataTexture;
/**
 * Returns the SkyParams overrides used only to preview the recipe.
 * No world transform is serialized; the host remains responsible for placement.
 */
export function heroCloudSkyOverrides(input: any): {
    cloud: {
        cirrus: {
            strength: number;
        };
        haze: {
            density: number;
        };
        shape: {
            altitude: number;
            thickness: number;
            coverage: number;
            baseScale: number;
            baseStrength: number;
            weatherScale: number;
            erosionScaleBaseMultiplier: number;
            erosionShape: number;
            erosionStrengthBase: number;
            erosionStrengthPeak: number;
            edgeSoftness: number;
            edgeSoftnessFalloff: number;
            baseWeatherStrength: number;
            baseWeatherHeightStart: number;
            baseWeatherHeightEnd: number;
            horizonCoverageAmount: number;
        };
    };
    noise: {
        weather: {
            seed: number;
        };
    };
};
/** World-space preview centre for the padded, periodically sampled mask. */
export function getHeroCloudPreviewCenter(input: any): {
    x: number;
    y: number;
    z: number;
};
export const HERO_CLOUD_RECIPE_TYPE: "toonlab/hero-cloud-recipe";
export const HERO_CLOUD_RECIPE_VERSION: 1;
export const HERO_CLOUD_MAP_PADDING: 8;
export const HERO_CLOUD_DEFAULT_RESOLUTION: 512;
export const HERO_CLOUD_PREVIEW_ALTITUDE: 1400;
export const DEFAULT_HERO_CLOUD_RECIPE: Readonly<{
    type: "toonlab/hero-cloud-recipe";
    version: 1;
    id: "hero_cloud";
    label: "Hero Cloud";
    seed: 11;
    bounds: Readonly<{
        diameter: 6000;
        height: 3200;
    }>;
    footprint: Readonly<{
        breakup: 0.18;
        development: 0.82;
        softness: 0.34;
        strokes: readonly (Readonly<{
            mode: "add";
            radius: 0.19;
            strength: 0.94;
            points: readonly number[][];
        }> | Readonly<{
            mode: "add";
            radius: 0.24;
            strength: 1;
            points: readonly number[][];
        }> | Readonly<{
            mode: "add";
            radius: 0.19;
            strength: 0.92;
            points: readonly number[][];
        }> | Readonly<{
            mode: "add";
            radius: 0.14;
            strength: 0.82;
            points: readonly number[][];
        }> | Readonly<{
            mode: "add";
            radius: 0.12;
            strength: 0.78;
            points: readonly number[][];
        }>)[];
    }>;
}>;
import * as THREE from 'three';
