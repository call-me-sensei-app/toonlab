/**
 * Builds the atmosphere param group.
 *
 * Every field is exposed as a TSL uniform under its own name so shader graphs
 * read `atmosphere.turbidity` directly and hosts poke `.value`, matching the
 * documented surface. `applyParams` takes any subset; `toParams` returns all
 * eleven, and the pair round-trips exactly because every clamp is idempotent.
 */
export function createAtmosphereParams(params?: {}): {
    bakeRevision: number;
    /** Registers a re-bake listener. Returns the unsubscribe. */
    onBakeInvalidated(listener: any): () => void;
    applyParams(next?: {}): /*elided*/ any;
    toParams(): {
        rayleigh: number;
        turbidity: number;
        mieDirectionalG: number;
        mieScatteringStrength: number;
        multipleScattering: number;
        skyMultipleScattering: number;
        exposure: number;
        groundAlbedo: THREE.Color;
        fogDensity: number;
        fogFarFadeStart: number;
        fogFarFadeEnd: number;
    };
    rayleigh: import("three/webgpu").UniformNode<"float", number>;
    turbidity: import("three/webgpu").UniformNode<"float", number>;
    mieDirectionalG: import("three/webgpu").UniformNode<"float", number>;
    mieScatteringStrength: import("three/webgpu").UniformNode<"float", number>;
    multipleScattering: import("three/webgpu").UniformNode<"float", number>;
    skyMultipleScattering: import("three/webgpu").UniformNode<"float", number>;
    exposure: import("three/webgpu").UniformNode<"float", number>;
    groundAlbedo: import("three/webgpu").UniformNode<"color", THREE.Color>;
    fogDensity: import("three/webgpu").UniformNode<"float", number>;
    fogFarFadeStart: import("three/webgpu").UniformNode<"float", number>;
    fogFarFadeEnd: import("three/webgpu").UniformNode<"float", number>;
};
export const ATMOSPHERE_PARAM_SCHEMA: Readonly<{
    rayleigh: Readonly<{
        description: "Scattering by air molecules — what makes the sky blue and a low sun red. 1 matches Earth.";
        label: "Rayleigh";
        range: Readonly<{
            max: 3;
            min: 0;
            step: 0.01;
        }>;
        rebake: true;
        type: "number";
        unit: "";
        value: 1;
    }>;
    turbidity: Readonly<{
        description: "Aerosol haze load. 1 is a clear day, 15 heavy smog. Washes out sky color and broadens the sun halo.";
        label: "Turbidity";
        range: Readonly<{
            max: 15;
            min: 1;
            step: 0.01;
        }>;
        rebake: true;
        type: "number";
        unit: "";
        value: 3.3;
    }>;
    mieDirectionalG: Readonly<{
        description: "Forward-peak of the Henyey-Greenstein haze lobe. 0 spreads the glow over the whole sky, higher pulls it into a tight halo.";
        label: "Mie Directional G";
        range: Readonly<{
            max: 0.999;
            min: 0;
            step: 0.001;
        }>;
        rebake: false;
        type: "number";
        unit: "";
        value: 0.7;
    }>;
    mieScatteringStrength: Readonly<{
        description: "Art multiplier on halo brightness only. Does not change haze density or sky color.";
        label: "Mie Scattering Strength";
        range: Readonly<{
            max: 2;
            min: 0;
            step: 0.01;
        }>;
        rebake: false;
        type: "number";
        unit: "";
        value: 1;
    }>;
    multipleScattering: Readonly<{
        description: "Skylight filling cloud undersides and shadowed interiors, applied as 1 + this. Clouds only.";
        label: "Cloud Multiple Scattering";
        range: Readonly<{
            max: 2;
            min: 0;
            step: 0.01;
        }>;
        rebake: false;
        type: "number";
        unit: "";
        value: 0.2;
    }>;
    skyMultipleScattering: Readonly<{
        description: "Scale on the sky dome multiply-scattered term. This light pools near the horizon, so it is the daytime horizon-brightness control.";
        label: "Sky Multiple Scattering";
        range: Readonly<{
            max: 2;
            min: 0;
            step: 0.01;
        }>;
        rebake: false;
        type: "number";
        unit: "";
        value: 0.5;
    }>;
    exposure: Readonly<{
        description: "Master brightness on the linear HDR image. The post chain applies it; the sky dome itself never does.";
        label: "Exposure";
        range: Readonly<{
            max: 5;
            min: 0.05;
            step: 0.01;
        }>;
        rebake: false;
        type: "number";
        unit: "";
        value: 1;
    }>;
    groundAlbedo: Readonly<{
        description: "Reflectance of the ground under the atmosphere. Bounce light feeds the dome multiple scattering, so brighter ground lifts the horizon.";
        label: "Ground Albedo";
        rebake: true;
        type: "color";
        unit: "linear RGB";
        value: readonly number[];
    }>;
    fogDensity: Readonly<{
        description: "How fast distance fades geometry into the sky. 1 half-fades near 23 km; 0 disables aerial perspective.";
        label: "Fog Density";
        range: Readonly<{
            max: 5;
            min: 0;
            step: 0.01;
        }>;
        rebake: false;
        type: "number";
        unit: "";
        value: 1.25;
    }>;
    fogFarFadeStart: Readonly<{
        description: "Distance at which geometry starts being replaced by sky outright. Hides the rim of a finite world.";
        label: "Fog Far Fade Start";
        range: Readonly<{
            max: 100000000;
            min: 0;
            step: 1000;
        }>;
        rebake: false;
        type: "number";
        unit: "m";
        value: 1000000;
    }>;
    fogFarFadeEnd: Readonly<{
        description: "Distance at which geometry is fully replaced by sky. Always kept above fogFarFadeStart; the gap is the ramp.";
        label: "Fog Far Fade End";
        range: Readonly<{
            max: 100000000;
            min: 0;
            step: 1000;
        }>;
        rebake: false;
        type: "number";
        unit: "m";
        value: 1100000;
    }>;
}>;
export const ATMOSPHERE_PARAM_KEYS: readonly string[];
/** Fields whose value invalidates the precomputed scattering tables. */
export const ATMOSPHERE_REBAKE_KEYS: readonly string[];
export const DEFAULT_ATMOSPHERE_PARAMS: Readonly<{
    [k: string]: any;
}>;
import * as THREE from 'three';
