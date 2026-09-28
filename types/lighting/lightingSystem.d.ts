export function createLightingSystem({ camera, capabilities, quality, renderer, scene, seed, style, textureResolver, timeOfDay, }?: {
    camera?: any;
    capabilities?: any;
    quality?: any;
    renderer?: any;
    scene?: any;
    seed?: number;
    style?: string;
    textureResolver?: any;
    timeOfDay?: number;
}): {
    /** Binds scene handles. Call with a stylized world or explicit targets. */
    attach({ driveSunPosition, environmentRoot, fog, getSun, getSunDirection, lampRig, sky, sunDistance, setSunDirection, setSun, sunRig, weather, water, }?: {
        driveSunPosition?: boolean;
        environmentRoot?: any;
        fog?: any;
        getSun?: any;
        getSunDirection?: any;
        lampRig?: any;
        sky?: any;
        sunDistance?: number;
        setSunDirection?: any;
        setSun?: any;
        sunRig?: any;
        weather?: any;
        water?: any;
    }): /*elided*/ any;
    /** Convenience: binds the handles a createStylizedWorld result exposes. */
    attachWorld(world: any, options?: {}): /*elided*/ any;
    detach(): /*elided*/ any;
    /** Swaps the whole lighting identity. Placements survive. */
    setStyle(nextStyle: any): /*elided*/ any;
    setQuality(nextQuality: any): /*elided*/ any;
    /** Sets the hour (0-24). The entire look follows the style's day cycle. */
    setTimeOfDay(nextHour: any): {
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
    /**
     * Overrides the scene-space direction toward the sun without replacing
     * the active time-of-day palette. Pass null to return direction ownership
     * to the day curve.
     */
    setSunDirection(direction?: any): any[];
    /** Advances the day cycle; use from update loops for live cycles. */
    advanceTime(hoursDelta: any): {
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
    /**
     * Weather integration point: one multiplicative layer instead of a second
     * writer on the same lights/fog/exposure.
     */
    setWeatherModulation(nextModulation: any): /*elided*/ any;
    /** Places a fixture. Returns a handle: { id, descriptor, light, remove, set }. */
    place(fixture: any, position?: any, { id, overrides, seed: placementSeed, target }?: {
        id?: any;
        overrides?: any;
        seed?: any;
        target?: any;
    }): {
        descriptor: {
            angle: number;
            artistic: {
                bandSoftness: number;
                diffuseMultiplier: number;
                rimInfluence: number;
                role: any;
                shadowTint: {
                    rgb: any;
                    temperatureKelvin: number;
                    tint: number[];
                };
                specularMultiplier: number;
            };
            castShadow: boolean;
            color: {
                rgb: any;
                temperatureKelvin: number;
                tint: number[];
            };
            cookie: {
                channel: any;
                intensity: number;
                key: string;
                uri: string;
            };
            decay: number;
            distance: number;
            enabled: boolean;
            groundColor: {
                rgb: any;
                temperatureKelvin: number;
                tint: number[];
            };
            height: number;
            id: string;
            intensity: {
                artisticMultiplier: number;
                referenceDistance: number;
                unit: any;
                value: number;
            };
            ies: {
                intensity: number;
                key: string;
                uri: string;
            };
            layers: number[];
            linking: {
                excludeTags: string[];
                includeTags: string[];
            };
            maxDistance: number;
            name: string;
            penumbra: number;
            position: any[];
            priority: number;
            shadow: {
                bias: number;
                enabled: boolean;
                extent: number;
                far: number;
                mapSize: number;
                near: number;
                normalBias: number;
                priority: number;
                radius: number;
            };
            tags: string[];
            target: any[];
            type: any;
            userData: any;
            width: number;
        };
        id: string;
        light: any;
        remove: () => boolean;
        set: (nextOverrides: any) => {
            angle: number;
            artistic: {
                bandSoftness: number;
                diffuseMultiplier: number;
                rimInfluence: number;
                role: any;
                shadowTint: {
                    rgb: any;
                    temperatureKelvin: number;
                    tint: number[];
                };
                specularMultiplier: number;
            };
            castShadow: boolean;
            color: {
                rgb: any;
                temperatureKelvin: number;
                tint: number[];
            };
            cookie: {
                channel: any;
                intensity: number;
                key: string;
                uri: string;
            };
            decay: number;
            distance: number;
            enabled: boolean;
            groundColor: {
                rgb: any;
                temperatureKelvin: number;
                tint: number[];
            };
            height: number;
            id: string;
            intensity: {
                artisticMultiplier: number;
                referenceDistance: number;
                unit: any;
                value: number;
            };
            ies: {
                intensity: number;
                key: string;
                uri: string;
            };
            layers: number[];
            linking: {
                excludeTags: string[];
                includeTags: string[];
            };
            maxDistance: number;
            name: string;
            penumbra: number;
            position: any[];
            priority: number;
            shadow: {
                bias: number;
                enabled: boolean;
                extent: number;
                far: number;
                mapSize: number;
                near: number;
                normalBias: number;
                priority: number;
                radius: number;
            };
            tags: string[];
            target: any[];
            type: any;
            userData: any;
            width: number;
        };
    };
    removePlacement(idOrHandle: any): boolean;
    /** Applies a scene overlay; adjustments blend in over blendSeconds. */
    applyOverlay(overlay: any, { blendSeconds }?: {
        blendSeconds?: number;
    }): string;
    removeOverlay(id: any, { blendSeconds }?: {
        blendSeconds?: number;
    }): boolean;
    /** Per-frame: overlay blends, fixture flicker, light budget selection. */
    update(delta?: number, nextCamera?: any): void;
    stats(): {
        activeLightCount: any;
        backend: any;
        hour: number;
        overlayCount: number;
        placementCount: number;
        placementsByFixture: {};
        shadowedLightCount: any;
        totalLightCount: any;
        warnings: any;
    };
    toJSON(): {
        placements: any[];
        style: any;
        timeOfDay: number;
    };
    /** Removes placements/overlays/modulation and re-applies the style. */
    reset(): /*elided*/ any;
    dispose(): void;
    readonly frame: {
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
    readonly sunDirection: any[];
    readonly manager: {
        addLight: (descriptorSource: any) => string;
        addToScene: (nextScene: any) => /*elided*/ any;
        applyLook: (lookOptions: any) => {
            environment: any;
            post: any;
        };
        removeLight: (id: any) => boolean;
        capabilities: any;
        dispose: () => void;
        getDiagnostics: () => any;
        getLight: (id: any) => any;
        group: THREE.Group<THREE.Object3DEventMap>;
        removeFromScene: () => /*elided*/ any;
        requestShadowUpdate: (id?: any) => number;
        setLightEnabled: (id: any, enabled: any) => boolean;
        setQuality: (nextQuality: any) => /*elided*/ any;
        setRecipe: (nextRecipe: any) => /*elided*/ any;
        subscribe: (listener: any) => () => boolean;
        update: (options?: {}, maybeCamera?: any) => any;
        updateLight: (id: any, overrides: any) => {
            angle: number;
            artistic: {
                bandSoftness: number;
                diffuseMultiplier: number;
                rimInfluence: number;
                role: any;
                shadowTint: {
                    rgb: any;
                    temperatureKelvin: number;
                    tint: number[];
                };
                specularMultiplier: number;
            };
            castShadow: boolean;
            color: {
                rgb: any;
                temperatureKelvin: number;
                tint: number[];
            };
            cookie: {
                channel: any;
                intensity: number;
                key: string;
                uri: string;
            };
            decay: number;
            distance: number;
            enabled: boolean;
            groundColor: {
                rgb: any;
                temperatureKelvin: number;
                tint: number[];
            };
            height: number;
            id: string;
            intensity: {
                artisticMultiplier: number;
                referenceDistance: number;
                unit: any;
                value: number;
            };
            ies: {
                intensity: number;
                key: string;
                uri: string;
            };
            layers: number[];
            linking: {
                excludeTags: string[];
                includeTags: string[];
            };
            maxDistance: number;
            name: string;
            penumbra: number;
            position: any[];
            priority: number;
            shadow: {
                bias: number;
                enabled: boolean;
                extent: number;
                far: number;
                mapSize: number;
                near: number;
                normalBias: number;
                priority: number;
                radius: number;
            };
            tags: string[];
            target: any[];
            type: any;
            userData: any;
            width: number;
        };
        readonly quality: {
            allowAreaLights: boolean;
            allowCookies: boolean;
            description: string;
            id: string;
            label: string;
            maxDistance: number;
            maxLights: number;
            maxLightsByType: {
                [k: string]: number;
            };
            maxShadowedLights: number;
            maxShadowMapPixels: number;
            shadowMapSizeScale: number;
        };
        readonly recipe: {
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
        readonly scene: any;
    };
    readonly quality: any;
    readonly skyLightProbe: any;
    readonly style: any;
    readonly timeOfDay: number;
    getDiagnostics: () => any;
    /** Toon-response metadata for material adapters (band softness, tint). */
    getToonResponse: () => any;
};
import * as THREE from 'three';
