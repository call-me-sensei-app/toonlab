export function useToonLabScene({ bundle, enabled, environmentRoot, post, quality, sky, timeOfDay, water, }?: {
    bundle?: string;
    enabled?: boolean;
    environmentRoot?: any;
    post?: any;
    quality?: string;
    sky?: any;
    timeOfDay?: number;
    water?: any;
}): {
    apply(bundleInput?: any, { allowCustomAdapters, discovery, mode, targets, watch, }?: {
        allowCustomAdapters?: boolean;
        discovery?: string;
        mode?: string;
        targets?: any[];
        watch?: boolean;
    }): Promise<{
        applied: any[];
        discovery: {
            issues: any[];
            ok: boolean;
            targets: any[];
        };
        lighting: {
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
            attachWorld(world: any, options?: {}): /*elided*/ any;
            detach(): /*elided*/ any;
            setStyle(nextStyle: any): /*elided*/ any;
            setQuality(nextQuality: any): /*elided*/ any;
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
            setSunDirection(direction?: any): any[];
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
            setWeatherModulation(nextModulation: any): /*elided*/ any;
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
            applyOverlay(overlay: any, { blendSeconds }?: {
                blendSeconds?: number;
            }): string;
            removeOverlay(id: any, { blendSeconds }?: {
                blendSeconds?: number;
            }): boolean;
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
                group: import("three").Group<import("three").Object3DEventMap>;
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
            getToonResponse: () => any;
        };
        quality: Readonly<{
            applied: readonly any[];
            profile: any;
            revert(): Promise<{
                reason: string;
                reverted: boolean;
                systems?: undefined;
            } | {
                reverted: boolean;
                systems: any[];
                reason?: undefined;
            }>;
            skipped: readonly {
                reason: string;
                system: string;
            }[];
        }>;
        settings: {};
        systems: {
            applied: {
                domain: any;
                slot: any;
                targetId: any;
            }[];
            skipped: {
                domain: any;
                reason: string;
                slot: any;
                targetId: any;
            }[];
        };
        idempotent: boolean;
        ok: boolean;
        revert: () => Promise<{
            reason: string;
            reverted: boolean;
            targetId?: undefined;
            targets?: undefined;
        } | {
            reason: string;
            reverted: boolean;
            targetId: any;
            targets?: undefined;
        } | {
            reverted: boolean;
            targets: any[];
            reason?: undefined;
            targetId?: undefined;
        }>;
        setTargetEnabled: (targetId: any, enabledInput: any) => Promise<{
            changed: boolean;
            enabled: boolean;
            reason: string;
            targetId: any;
        } | {
            changed: boolean;
            enabled: boolean;
            targetId: any;
            reason?: undefined;
        }>;
        skipped: {
            domain: any;
            reason: string;
            slot: any;
            targetId: any;
        }[];
        targetControls: Readonly<{
            adapterId: any;
            domain: any;
            readonly enabled: boolean;
            slot: any;
            targetId: any;
        }>[];
        gaps: any[];
        issues: {
            code: any;
            message: any;
            severity: string;
            targetId: any;
        }[];
        plan: any[];
        bundle?: undefined;
        warnings?: undefined;
    } | {
        applied: any[];
        discovery: {
            issues: any[];
            ok: boolean;
            targets: any[];
        };
        lighting: {
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
            attachWorld(world: any, options?: {}): /*elided*/ any;
            detach(): /*elided*/ any;
            setStyle(nextStyle: any): /*elided*/ any;
            setQuality(nextQuality: any): /*elided*/ any;
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
            setSunDirection(direction?: any): any[];
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
            setWeatherModulation(nextModulation: any): /*elided*/ any;
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
            applyOverlay(overlay: any, { blendSeconds }?: {
                blendSeconds?: number;
            }): string;
            removeOverlay(id: any, { blendSeconds }?: {
                blendSeconds?: number;
            }): boolean;
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
                group: import("three").Group<import("three").Object3DEventMap>;
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
            getToonResponse: () => any;
        };
        quality: Readonly<{
            applied: readonly any[];
            profile: any;
            revert(): Promise<{
                reason: string;
                reverted: boolean;
                systems?: undefined;
            } | {
                reverted: boolean;
                systems: any[];
                reason?: undefined;
            }>;
            skipped: readonly {
                reason: string;
                system: string;
            }[];
        }>;
        settings: {};
        systems: {
            applied: {
                domain: any;
                slot: any;
                targetId: any;
            }[];
            skipped: {
                domain: any;
                reason: string;
                slot: any;
                targetId: any;
            }[];
        };
        idempotent: boolean;
        ok: boolean;
        revert: () => Promise<{
            reason: string;
            reverted: boolean;
            targetId?: undefined;
            targets?: undefined;
        } | {
            reason: string;
            reverted: boolean;
            targetId: any;
            targets?: undefined;
        } | {
            reverted: boolean;
            targets: any[];
            reason?: undefined;
            targetId?: undefined;
        }>;
        setTargetEnabled: (targetId: any, enabledInput: any) => Promise<{
            changed: boolean;
            enabled: boolean;
            reason: string;
            targetId: any;
        } | {
            changed: boolean;
            enabled: boolean;
            targetId: any;
            reason?: undefined;
        }>;
        skipped: {
            domain: any;
            reason: string;
            slot: any;
            targetId: any;
        }[];
        targetControls: Readonly<{
            adapterId: any;
            domain: any;
            readonly enabled: boolean;
            slot: any;
            targetId: any;
        }>[];
        bundle: any;
        gaps: {
            approvedBy: string;
            attempts: any[];
            bundleSlot: string;
            customImplementation: any;
            domain: string;
            feedbackNeeded: string;
            id: string;
            kind: string;
            provenance: any;
            reason: string;
            schema: string;
            status: string;
            targetId: string;
            version: number;
        }[];
        issues: {
            code: any;
            message: any;
            severity: string;
            targetId: any;
        }[];
        plan: {
            apply: any;
            domain: string;
            settings: any;
            slot: any;
            subject: any;
            target: any;
            targetId: string;
        }[];
        warnings: any[];
    }>;
    setSystems({ post: nextPost, sky: nextSky, water: nextWater, }?: {
        post?: any;
        sky?: any;
        water?: any;
    }): Promise</*elided*/ any>;
    dispose(): any;
    setTimeOfDay(hour: any): {
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
    setSunDirection(direction?: any): any[];
    setSkyPreset(preset: any, { timeOfDay }?: {
        timeOfDay?: any;
    }): Promise<any>;
    update(delta: any, camera: any): any;
    refreshStyleTargets: () => Promise<any>;
    readonly sceneDiscovery: {
        enabled: boolean;
        error: any;
        report: any;
    };
    readonly groundFieldPass: any;
    readonly collision: any;
    inspector: Readonly<{
        dispose(): void;
        registerApplication(application: any, { participation }?: {
            participation?: {};
        }): () => void;
        serialize({ pretty }?: {
            pretty?: boolean;
        }): string;
        setContext(next?: {}): Readonly<{
            active: {
                bundle: {
                    id: string;
                    label?: undefined;
                    type?: undefined;
                    version?: undefined;
                } | {
                    id: any;
                    label: any;
                    type: any;
                    version: any;
                };
                content: {
                    id: string;
                    label?: undefined;
                    type?: undefined;
                    version?: undefined;
                } | {
                    id: any;
                    label: any;
                    type: any;
                    version: any;
                };
                quality: {
                    id: string;
                    label?: undefined;
                    type?: undefined;
                    version?: undefined;
                } | {
                    id: any;
                    label: any;
                    type: any;
                    version: any;
                };
                scenario: {
                    id: string;
                    label?: undefined;
                    type?: undefined;
                    version?: undefined;
                } | {
                    id: any;
                    label: any;
                    type: any;
                    version: any;
                };
            };
            diagnostics: any;
            domains: any[];
            gaps: any;
            issues: any;
            package: {
                name: string;
                version: string;
            };
            targets: any[];
            telemetry: any;
            type: "toonlab/runtime-inspector";
            version: 1;
        }>;
        setDomainEnabled: (domain: any, enabled: any) => Promise<{
            changed: number;
            domain: any;
            enabled: boolean;
            targets: any[];
        }>;
        setTargetEnabled: (targetId: any, enabledInput: any) => Promise<{
            changed: boolean;
            enabled: boolean;
            reason: string;
            targetId: any;
        } | {
            changed: boolean;
            enabled: boolean;
            targetId: any;
            reason?: undefined;
        }>;
        snapshot: () => Readonly<{
            active: {
                bundle: {
                    id: string;
                    label?: undefined;
                    type?: undefined;
                    version?: undefined;
                } | {
                    id: any;
                    label: any;
                    type: any;
                    version: any;
                };
                content: {
                    id: string;
                    label?: undefined;
                    type?: undefined;
                    version?: undefined;
                } | {
                    id: any;
                    label: any;
                    type: any;
                    version: any;
                };
                quality: {
                    id: string;
                    label?: undefined;
                    type?: undefined;
                    version?: undefined;
                } | {
                    id: any;
                    label: any;
                    type: any;
                    version: any;
                };
                scenario: {
                    id: string;
                    label?: undefined;
                    type?: undefined;
                    version?: undefined;
                } | {
                    id: any;
                    label: any;
                    type: any;
                    version: any;
                };
            };
            diagnostics: any;
            domains: any[];
            gaps: any;
            issues: any;
            package: {
                name: string;
                version: string;
            };
            targets: any[];
            telemetry: any;
            type: "toonlab/runtime-inspector";
            version: 1;
        }>;
        subscribe(listener: any): () => boolean;
        updateTelemetry(next?: {}): Readonly<{
            active: {
                bundle: {
                    id: string;
                    label?: undefined;
                    type?: undefined;
                    version?: undefined;
                } | {
                    id: any;
                    label: any;
                    type: any;
                    version: any;
                };
                content: {
                    id: string;
                    label?: undefined;
                    type?: undefined;
                    version?: undefined;
                } | {
                    id: any;
                    label: any;
                    type: any;
                    version: any;
                };
                quality: {
                    id: string;
                    label?: undefined;
                    type?: undefined;
                    version?: undefined;
                } | {
                    id: any;
                    label: any;
                    type: any;
                    version: any;
                };
                scenario: {
                    id: string;
                    label?: undefined;
                    type?: undefined;
                    version?: undefined;
                } | {
                    id: any;
                    label: any;
                    type: any;
                    version: any;
                };
            };
            diagnostics: any;
            domains: any[];
            gaps: any;
            issues: any;
            package: {
                name: string;
                version: string;
            };
            targets: any[];
            telemetry: any;
            type: "toonlab/runtime-inspector";
            version: 1;
        }>;
    }>;
    readonly lighting: {
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
        attachWorld(world: any, options?: {}): /*elided*/ any;
        detach(): /*elided*/ any;
        setStyle(nextStyle: any): /*elided*/ any;
        setQuality(nextQuality: any): /*elided*/ any;
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
        setSunDirection(direction?: any): any[];
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
        setWeatherModulation(nextModulation: any): /*elided*/ any;
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
        applyOverlay(overlay: any, { blendSeconds }?: {
            blendSeconds?: number;
        }): string;
        removeOverlay(id: any, { blendSeconds }?: {
            blendSeconds?: number;
        }): boolean;
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
            group: import("three").Group<import("three").Object3DEventMap>;
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
        getToonResponse: () => any;
    };
    readonly quality: any;
    readonly sky: any;
    readonly rendererConfiguration: any;
    readonly scheduler: Readonly<{
        register(input: any): Readonly<{
            id: string;
            dispose(): boolean;
        }>;
        update(context?: {}): any;
        dispose(): boolean;
        setFrameBudget(nextMaxFrameMs: any): /*elided*/ any;
        readonly frameBudgetMs: number;
        readonly disposed: boolean;
        readonly lastFrame: any;
        readonly size: number;
    }>;
    readonly shadowPass: {
        readonly casterCoverage: Readonly<{
            byDomain: Readonly<{}>;
            coveredTargetIds: readonly any[];
            eligibleTargetIds: readonly any[];
            farTargetIds: readonly any[];
            nearTargetIds: readonly any[];
            uncoveredTargetIds: readonly any[];
        }>;
        readonly receiverCoverage: Readonly<{
            byDomain: Readonly<{}>;
            coveredTargetIds: readonly any[];
            eligibleTargetIds: readonly any[];
            farTargetIds: readonly any[];
            nearTargetIds: readonly any[];
            uncoveredTargetIds: readonly any[];
        }>;
        readonly ready: boolean;
        readonly health: Readonly<{
            backend: "node" | "classic-webgl-unused";
            casterCount: number;
            farReady: boolean;
            hiddenNonCasterCount: number;
            ok: boolean;
            ready: boolean;
            reason: string;
            renderCount: number;
            sunName: any;
        }>;
        readonly renderCount: number;
        readonly shadowTexture: any;
        readonly nearShadowTarget: any;
        readonly farShadowTarget: any;
        readonly shadowMatrix: import("three").Matrix4;
        readonly farShadowTexture: any;
        dispose: () => void;
        inspectDepthContent: ({ radius }?: {
            radius?: number;
        }) => Promise<Readonly<{
            ready: false;
            sampleCount: 0;
            writtenSampleCount: 0;
        }> | Readonly<{
            ready: true;
            sampleCount: number;
            samples: readonly Readonly<{
                cascade: any;
                minDepth: number;
                targetId: any;
                written: boolean;
            }>[];
            writtenSampleCount: number;
        }>>;
        invalidate: () => void;
        update: ({ camera, dynamic }?: {
            camera?: any;
            dynamic?: boolean;
        }) => void;
    };
};
export function ToonLabScene(props: any): any;
export function useStyleBundles(provider: any, { requestedId, user }?: {
    requestedId?: any;
    user?: any;
}): {
    error: any;
    loading: boolean;
    options: any[];
    selected: any;
};
