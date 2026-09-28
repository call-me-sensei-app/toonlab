/**
 * Normalizes any partial input into a complete WeatherMapProfile: every field
 * present, every value finite and inside its range, integers rounded. The
 * result is plain JSON — presets serialize it verbatim.
 */
export function createWeatherMapProfile(input?: {}): {};
/**
 * Snaps a requested resolution onto the nearest WEATHER_MAP_RESOLUTIONS member.
 *
 * A snap, not a clamp into a wider range: 64, 128 and 2048 are not cheaper or
 * finer versions of the same coverage field. The four-texels-per-cell band limit
 * means a 64² map keeps only 3 of the default ladder's 5 coverage octaves
 * (periods 4, 8, 16 instead of 4…64), so admitting one would bake a *different*
 * sky at 1/16 the texel count of the lowest tier — silently, from a preset that
 * merely serialized a null.
 */
export function resolveWeatherMapResolution(resolution?: number): number;
/**
 * Bakes the RGBA8 weather map. Returned separately from the texture so the
 * determinism checks and headless tools can read the bytes without a renderer.
 */
export function createWeatherMapData({ resolution, seed, profile, }?: {
    resolution?: number;
    seed?: number;
    profile?: {};
}): {
    coverageMean: number;
    coverageOctavePeriods: number[];
    data: Uint8Array<ArrayBuffer>;
    profile: {};
    resolution: number;
    seed: number;
    version: number;
};
/**
 * Bakes an uncached weather map. Callers own dispose().
 *
 * `generateMipmaps` defaults off. A raymarch loop has no coherent screen-space
 * derivative, so an implicit mip selection inside the march reads a random
 * level and the coverage field dissolves. Turn it on only together with an
 * explicit level on the sampling side.
 */
export function createWeatherMap({ resolution, seed, profile, generateMipmaps, }?: {
    resolution?: number;
    seed?: number;
    profile?: {};
    generateMipmaps?: boolean;
}): THREE.DataTexture;
/**
 * Cached weather map, keyed by resolution, seed and profile. A tier switch that
 * returns to a resolution already baked pays nothing; a profile edit does not
 * collide with the old map.
 */
export function getWeatherMap({ resolution, seed, profile, generateMipmaps, }?: {
    resolution?: number;
    seed?: number;
    profile?: {};
    generateMipmaps?: boolean;
}): any;
/** Releases every cached weather map. */
export function disposeWeatherMaps(): void;
export const WEATHER_MAP_SCHEMA_VERSION: 1;
/**
 * The legal weather-map resolutions — the quality tiers' set and the only values
 * `resolveWeatherMapResolution` returns. `src/sky/skyQualityTiers.js` imports
 * this rather than declaring a range of its own, so the tier field, the resolver
 * and the spec's tier table cannot drift apart.
 */
export const WEATHER_MAP_RESOLUTIONS: readonly number[];
/** Resolution used when none is given, or when the request is unusable. */
export const WEATHER_MAP_DEFAULT_RESOLUTION: 1024;
/**
 * The preset-tunable knobs, with the metadata the lab renders controls from.
 * Ranges are the useful range, not the safe range — every value is clamped to
 * them, so a preset authored outside them loads as the nearest legal sky.
 */
export const WEATHER_MAP_PROFILE_FIELDS: Readonly<{
    octaves: Readonly<{
        description: "Number of coverage FBM octaves. More octaves add smaller cloud clusters inside the large ones.";
        group: "coverage";
        label: "Octaves";
        range: Readonly<{
            max: 8;
            min: 1;
            step: 1;
        }>;
        type: "number";
        value: 5;
    }>;
    period: Readonly<{
        description: "Lattice periods across one weather-map repeat at the first octave. Higher values make cloud groups smaller.";
        group: "coverage";
        label: "Base Period";
        range: Readonly<{
            max: 32;
            min: 1;
            step: 1;
        }>;
        type: "number";
        value: 4;
    }>;
    lacunarity: Readonly<{
        description: "Frequency step between octaves. Rounded to an integer period per octave so the map still tiles exactly.";
        group: "coverage";
        label: "Lacunarity";
        range: Readonly<{
            max: 4;
            min: 1.5;
            step: 0.01;
        }>;
        type: "number";
        value: 2;
    }>;
    gain: Readonly<{
        description: "Amplitude step between octaves. Higher values roughen the coverage boundary; lower values smooth it.";
        group: "coverage";
        label: "Gain";
        range: Readonly<{
            max: 0.8;
            min: 0.2;
            step: 0.01;
        }>;
        type: "number";
        value: 0.5;
    }>;
    warp: Readonly<{
        description: "Domain-warp amount in tile units. Bends cloud groups into streets and hooks instead of round blobs. 0 disables it.";
        group: "coverage";
        label: "Warp";
        range: Readonly<{
            max: 1;
            min: 0;
            step: 0.005;
        }>;
        type: "number";
        value: 0;
    }>;
    warpPeriod: Readonly<{
        description: "Lattice periods of the warp field. Low values sweep whole regions; high values ripple edges.";
        group: "coverage";
        label: "Warp Period";
        range: Readonly<{
            max: 16;
            min: 1;
            step: 1;
        }>;
        type: "number";
        value: 2;
    }>;
    coverageContrast: Readonly<{
        description: "Contrast of the coverage field about 0.5. High values separate sky and cloud into hard regions.";
        group: "coverage";
        label: "Coverage Contrast";
        range: Readonly<{
            max: 4;
            min: 0.1;
            step: 0.01;
        }>;
        type: "number";
        value: 1.32;
    }>;
    coverageBias: Readonly<{
        description: "Added to coverage after contrast. Positive fills the sky, negative clears it. Distinct from shape.coverage, which scales the whole field at runtime.";
        group: "coverage";
        label: "Coverage Bias";
        range: Readonly<{
            max: 1;
            min: -1;
            step: 0.005;
        }>;
        type: "number";
        value: -0.24;
    }>;
    typePeriod: Readonly<{
        description: "Lattice periods of the cloud-type field. Low values give one weather system across the sky.";
        group: "type";
        label: "Type Period";
        range: Readonly<{
            max: 16;
            min: 1;
            step: 1;
        }>;
        type: "number";
        value: 3;
    }>;
    typeBias: Readonly<{
        description: "Added to cloud type. Positive pushes the sky toward developed cumulus, negative toward flat stratus.";
        group: "type";
        label: "Type Bias";
        range: Readonly<{
            max: 1;
            min: -1;
            step: 0.005;
        }>;
        type: "number";
        value: 0;
    }>;
    precipitationPeriod: Readonly<{
        description: "Lattice periods of the precipitation field, before coverage gates it.";
        group: "precipitation";
        label: "Precipitation Period";
        range: Readonly<{
            max: 16;
            min: 1;
            step: 1;
        }>;
        type: "number";
        value: 1;
    }>;
    precipitationBias: Readonly<{
        description: "Added to precipitation before coverage gates it. Positive rains from more of the deck.";
        group: "precipitation";
        label: "Precipitation Bias";
        range: Readonly<{
            max: 1;
            min: -1;
            step: 0.005;
        }>;
        type: "number";
        value: 0;
    }>;
}>;
/** Default WeatherMapProfile. */
export const WEATHER_MAP_PROFILE_DEFAULTS: Readonly<{
    [k: string]: 0 | 2 | 4 | 1 | 3 | 5 | 0.5 | 1.32 | -0.24;
}>;
import * as THREE from 'three';
