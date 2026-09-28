/** Creates a complete runtime budget profile from a partial object. */
export function createLightingQualityProfile(options?: {}): {
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
/** Returns a new mutable descriptor for a built-in luminaire. */
export function resolveLuminairePreset(id?: string, overrides?: {}): {
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
/** Returns a new mutable LightingRecipe for a built-in rig. */
export function resolveLightingRigPreset(id?: string, overrides?: {}): {
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
/** Returns a new mutable quality profile for a built-in profile id or inline profile. */
export function resolveLightingQualityPreset(idOrProfile?: string, overrides?: {}): {
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
/** Returns a complete look document with inline recipe and quality objects. */
export function resolveLightingLookPreset(id?: string, overrides?: {}): {
    environment: any;
    id: string;
    metadata: any;
    name: string;
    post: any;
    quality: any;
    recipe: any;
    schemaVersion: number;
    type: string;
};
/**
 * Lists preset picker entries. With no kind all entries are returned in one
 * flat array; pass `luminaire`, `rig`, `look`, or `quality` to filter.
 */
export function getLightingPresetOptions(kind?: any): {
    description: any;
    id: any;
    kind: any;
    label: any;
}[];
/** Generic resolver for UIs that keep the preset family as data. */
export function resolveLightingPreset(kind: any, id: any, overrides?: {}): {
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
} | {
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
} | {
    environment: any;
    id: string;
    metadata: any;
    name: string;
    post: any;
    quality: any;
    recipe: any;
    schemaVersion: number;
    type: string;
} | {
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
export const LIGHTING_QUALITY_PRESETS: any;
export const LIGHTING_LUMINAIRE_PRESETS: any;
export const LIGHTING_RIG_PRESETS: any;
export const LIGHTING_LOOK_PRESETS: any;
