/** Creates a portable cookie reference. Runtime textures are intentionally not serialized. */
export function createLightCookie(value?: any): {
    channel: any;
    intensity: number;
    key: string;
    uri: string;
};
/** Creates a portable IES photometric-profile reference for host adapters. */
export function createLightIesProfile(value?: any): {
    intensity: number;
    key: string;
    uri: string;
};
/** Normalizes portable include/exclude tags used by host light-linking adapters. */
export function createLightLinking(value?: any): {
    excludeTags: string[];
    includeTags: string[];
};
/** Normalizes per-light shadow authoring without allocating a shadow map. */
export function createLightShadow(value?: any, type?: string): {
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
/** Normalizes toon-specific metadata preserved for material adapters. */
export function createLightArtisticSettings(value?: any): {
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
/**
 * Creates a complete JSON-compatible light descriptor.
 *
 * @param {string|object} typeOrOptions Light type or an object containing `type`.
 * @param {object} [options] Partial descriptor when the first argument is a type.
 */
export function createLightDescriptor(typeOrOptions?: string | object, options?: object): {
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
/** Re-normalizes a descriptor after applying a deep partial update. */
export function mergeLightDescriptor(descriptor: any, overrides?: {}): {
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
/** Performs structural validation without mutating or coercing the descriptor. */
export function validateLightDescriptor(value: any, { path }?: {
    path?: string;
}): Readonly<{
    errors: readonly any[];
    ok: boolean;
    valid: boolean;
    warnings: readonly any[];
}>;
/** Portable light families supported by the v1 recipe schema. */
export const LIGHT_TYPES: readonly string[];
export const SHADOW_CAPABLE_LIGHT_TYPES: readonly string[];
export const COOKIE_CAPABLE_LIGHT_TYPES: readonly string[];
export function createAmbientLightDescriptor(options?: {}): {
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
export function createHemisphereLightDescriptor(options?: {}): {
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
export function createDirectionalLightDescriptor(options?: {}): {
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
export function createPointLightDescriptor(options?: {}): {
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
export function createSpotLightDescriptor(options?: {}): {
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
export function createRectAreaLightDescriptor(options?: {}): {
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
export function createDiscAreaLightDescriptor(options?: {}): {
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
export function createTubeAreaLightDescriptor(options?: {}): {
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
