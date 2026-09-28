export function ensureAreaLightSupport(): any;
export function getAreaLightSupportState(): string;
/**
 * Realizes a LightingRecipe as Three.js lights and manages runtime budgets.
 * The manager does not replace the renderer's lighting algorithm: it selects,
 * configures, and diagnoses ordinary Three.js lights.
 */
export function createLightingManager({ capabilities, camera: initialCamera, disposeCookieTextures, onDiagnostics, quality: initialQuality, recipe: initialRecipe, renderer, scene: initialScene, textureResolver, }?: {
    capabilities?: any;
    camera?: any;
    disposeCookieTextures?: boolean;
    onDiagnostics?: any;
    quality?: string;
    recipe?: any;
    renderer?: any;
    scene?: any;
    textureResolver?: any;
}): {
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
/** Alias emphasizing that a manager owns one realized rig. */
export function createLightingRig(options?: {}): {
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
/** Convenience recipe-first entry point for Three.js realization. */
export function realizeLightingRecipe(recipe: any, options?: {}): {
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
import * as THREE from 'three';
