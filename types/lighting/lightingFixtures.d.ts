/** Normalizes fixture settings; `variation` keeps the shared domain grammar. */
export function createLightFixtureSettings(source?: {}): {
    base: any;
    category: string;
    emissive: {
        meshPattern: string;
        scale: number;
    };
    flicker: {
        amount: number;
        speed: number;
    };
    schedule: {
        minimum: number;
        mode: any;
    };
    variation: any;
};
/**
 * Deterministically resolves one placement of a fixture into a complete
 * light descriptor plus runtime hints (flicker phase, schedule).
 */
export function resolveFixturePlacement(fixtureSettings: any, { id, overrides, position, seed, target, }?: {
    id?: any;
    overrides?: any;
    position?: any;
    seed?: number;
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
    flicker: {
        amount: number;
        speed: number;
    };
    flickerPhase: number;
    schedule: {
        minimum: number;
        mode: any;
    };
    seed: number;
};
export function registerLightFixture(id: any, definition?: {}, { overwrite }?: {
    overwrite?: boolean;
}): string;
export function getLightFixtureOptions(): {
    category: any;
    description: any;
    id: any;
    label: any;
}[];
export function resolveLightFixture(value: any): any;
export function validateLightFixtureDocument(input: any): {
    errors: string[];
    ok: boolean;
    value: {
        description: string;
        id: any;
        label: string;
        settings: any;
        type: any;
        version: any;
    };
    warnings: any[];
};
export function createLightFixtureDocument(id: any, definition?: {}): any;
export function parseLightFixtureDocument(input: any): any;
export function serializeLightFixtureDocument(idOrDocument: any, definition?: {}, { pretty }?: {
    pretty?: boolean;
}): string;
export function registerLightFixtureDocument(document: any, { overwrite }?: {
    overwrite?: boolean;
}): string;
export const LIGHT_FIXTURE_DOCUMENT_TYPE: "toonlab/light-fixture";
export const LIGHT_FIXTURE_SCHEMA_VERSION: 1;
export const FIXTURE_SCHEDULE_MODES: readonly string[];
/** Only a base light-type change forces recreating placed lights. */
export const LIGHT_FIXTURE_APPLY_METADATA: Readonly<{
    '*': "hot";
    'base.type': "rebuild";
}>;
/** Normalizes fixture settings; `variation` keeps the shared domain grammar. */
export function sanitizeLightFixtureSettings(source?: {}): {
    base: any;
    category: string;
    emissive: {
        meshPattern: string;
        scale: number;
    };
    flicker: {
        amount: number;
        speed: number;
    };
    schedule: {
        minimum: number;
        mode: any;
    };
    variation: any;
};
