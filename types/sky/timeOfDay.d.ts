/**
 * Folds any day time onto [0, 1); 0 is midnight, 0.5 noon.
 *
 * In-range values pass through untouched. The modulo route is not exact —
 * ((0.85 % 1) + 1) % 1 lands on 0.8500000000000001 — and this runs on every
 * tick and every applyParams, so an authored preset time would drift away from
 * the number the author typed and break round-trip identity.
 *
 * `fallback` is what an unreadable time resolves to. Anything holding clock
 * state must pass the reading it wants to keep (see `createTimeOfDay`), because
 * landing on the factory default would jump the whole sky to noon. The
 * factory-default fallback is only for one-shot solves like `sunDirectionAt`,
 * which have no previous reading to hold.
 */
export function wrapDayTime(time: any, fallback?: 0.5): any;
/**
 * Phase terms a shaded moon disc needs, from the 0..1 phase dial.
 *
 * `illumination` is the lit fraction of the disc, (1 + cos ψ) / 2 for the
 * phase angle ψ = π(1 − 2·phase) — the fraction astronomy quotes, so a
 * quarter moon reads 0.5 and a new moon 0. Every moonshine term (disc, sky
 * ambient, cloud rim) scales by it, which is what keeps a sliver dim.
 *
 * `sin`/`cos` are that angle's trig, signed so waxing and waning light
 * opposite limbs. They hand the disc shader its sub-solar direction in disc
 * space, `vec3(sin, 0, cos)` with +x along the disc's tangent axis and +z
 * toward the viewer: a fragment is lit where dot(discNormal, that) > 0. The
 * terminator is fixed in disc space on purpose — the moon here is exactly
 * antipodal to the sun, so a geometric phase would always be new, and the
 * phase dial is an authored look, not a position.
 */
export function moonPhaseTerms(phase: any, target?: {
    illumination: number;
    sin: number;
    cos: number;
}): {
    illumination: number;
    sin: number;
    cos: number;
};
/**
 * Builds the clock. Pass any subset of TimeOfDayParams; the rest defaults.
 *
 * Driven uniforms (`moonDirection`, `skyDarkness`, `morningLight`,
 * `eveningLight`, `starRotation`, `moonPhaseIllumination`, `moonPhaseTrig`) are
 * declared here so materials can
 * bind them at build time. The three that need the celestial solve hold neutral
 * values until the first driver tick, which happens when the driver is
 * constructed; the two moon-phase terms are pure functions of `moonPhase`, so
 * this module keeps them correct from construction on — an env-map bake before
 * the driver exists must not light a new moon like a full one.
 */
export function createTimeOfDay(params?: {}): {
    time: import("three/webgpu").UniformNode<"float", number>;
    moonPhase: import("three/webgpu").UniformNode<"float", number>;
    moonIntensity: import("three/webgpu").UniformNode<"float", number>;
    moonDiscBrightness: import("three/webgpu").UniformNode<"float", number>;
    moonAngularSize: import("three/webgpu").UniformNode<"float", number>;
    moonColor: import("three/webgpu").UniformNode<"color", THREE.Color>;
    moonAmbient: import("three/webgpu").UniformNode<"float", number>;
    moonDirection: import("three/webgpu").UniformNode<"vec3", THREE.Vector3>;
    skyDarkness: import("three/webgpu").UniformNode<"float", number>;
    morningLight: import("three/webgpu").UniformNode<"float", number>;
    eveningLight: import("three/webgpu").UniformNode<"float", number>;
    starRotation: import("three/webgpu").UniformNode<"mat3", THREE.Matrix3>;
    moonPhaseIllumination: import("three/webgpu").UniformNode<"float", number>;
    moonPhaseTrig: import("three/webgpu").UniformNode<"vec2", THREE.Vector2>;
    /** Real seconds one simulated day takes. 0 pauses, which also releases sun.direction. */
    autoAdvanceSecondsPerDay: 600;
    /** Observer latitude in degrees, clamped to −90…90. Tilts the arcs and the star pole. */
    latitude: 45;
    /** Compass rotation of the whole celestial sphere, degrees. 0 = +Z, 90 = +X. */
    azimuth: 0;
    /**
     * Folds a host's direct `time.value` scrub back onto [0, 1) and returns it.
     *
     * The driver calls this once per tick, which is what makes
     * `timeOfDay.time.value = 0.85` a supported host path. An unreadable value
     * resolves to the last readable reading, not to the factory default: a bad
     * write should be ignored, not teleport the clock to noon.
     */
    foldTime(): 0.5;
    applyParams(next?: {}): void;
    toParams(): {
        time: any;
        autoAdvanceSecondsPerDay: 600;
        latitude: 45;
        azimuth: 0;
        moon: {
            phase: number;
            intensity: number;
            discBrightness: number;
            angularSize: number;
            color: THREE.Color;
            ambient: number;
        };
    };
};
export const DEFAULT_MOON_PARAMS: Readonly<{
    phase: 0.5;
    intensity: 1;
    discBrightness: 9;
    angularSize: 0.0003;
    color: readonly number[];
    ambient: 0.015;
}>;
export const DEFAULT_TIME_OF_DAY_PARAMS: Readonly<{
    time: 0.5;
    autoAdvanceSecondsPerDay: 600;
    latitude: 45;
    azimuth: 0;
    moon: Readonly<{
        phase: 0.5;
        intensity: 1;
        discBrightness: 9;
        angularSize: 0.0003;
        color: readonly number[];
        ambient: 0.015;
    }>;
}>;
/**
 * The `time.moon.color` descriptor, published here rather than in the SkyParams
 * envelope for the reason its sibling `sun.color` is published by sunDriver.js:
 * this module clamps the live colour to it on every applyParams and the envelope
 * declares the same field, so the channel maximum has one definition instead of
 * one per layer. Emissive like the sun tint, so it keeps its HDR headroom.
 */
export const MOON_COLOR_FIELD: Readonly<{
    derived: false;
    derive: any;
    description: any;
    fold: any;
    integer: false;
    label: any;
    limit: Readonly<{
        max: any;
        min: 0;
    }>;
    type: "color";
    unit: "linear RGB";
    uniform: boolean;
    value: readonly any[];
    wrap: any;
}>;
import * as THREE from 'three';
