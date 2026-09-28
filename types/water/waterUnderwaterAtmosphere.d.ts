export function createWaterUnderwaterAtmosphereOptions(options?: boolean): {
    enabled: boolean;
    fogNear: 0.5;
    fogFar: 32;
    colorScale: readonly number[];
    overlayOpacity: 0.22;
    clipToSurfaceBounds: true;
    boundsMargin: 0;
    clearFogNode: true;
    color?: undefined;
    waterPathFog?: undefined;
} | {
    enabled: any;
    fogNear: number;
    fogFar: number;
    colorScale: any[];
    color: any[];
    overlayOpacity: number;
    clipToSurfaceBounds: any;
    boundsMargin: number;
    clearFogNode: any;
    waterPathFog: any;
};
export function resolveWaterUnderwaterAtmosphereState({ cameraX, cameraY, cameraZ, waterX, waterY, waterZ, surfaceY, bedY, width, depth, settings, options, }?: {
    cameraX?: number;
    cameraY?: number;
    cameraZ?: number;
    waterX?: number;
    waterY?: number;
    waterZ?: number;
    surfaceY?: any;
    bedY?: number;
    width?: number;
    depth?: number;
    settings?: {};
    options?: boolean;
}): {
    active: boolean;
    insideBounds: boolean;
    submergedDepth: number;
    color: any[];
    fogNear: number;
    fogFar: number;
    overlayOpacity: number;
    clearFogNode: any;
    waterPathFog: any;
    waterY: any;
    surfaceY: any;
    bedY: number;
};
export const DEFAULT_WATER_UNDERWATER_ATMOSPHERE: Readonly<{
    enabled: true;
    fogNear: 0.5;
    fogFar: 32;
    colorScale: readonly number[];
    overlayOpacity: 0.22;
    clipToSurfaceBounds: true;
    boundsMargin: 0;
    clearFogNode: true;
}>;
export class WaterUnderwaterAtmosphere {
    constructor(options?: boolean);
    options: {
        enabled: boolean;
        fogNear: 0.5;
        fogFar: 32;
        colorScale: readonly number[];
        overlayOpacity: 0.22;
        clipToSurfaceBounds: true;
        boundsMargin: 0;
        clearFogNode: true;
        color?: undefined;
        waterPathFog?: undefined;
    } | {
        enabled: any;
        fogNear: number;
        fogFar: number;
        colorScale: any[];
        color: any[];
        overlayOpacity: number;
        clipToSurfaceBounds: any;
        boundsMargin: number;
        clearFogNode: any;
        waterPathFog: any;
    };
    scene: any;
    state: {
        active: boolean;
        insideBounds: boolean;
        submergedDepth: number;
        color: any[];
        fogNear: number;
        fogFar: number;
        overlayOpacity: number;
        clearFogNode: any;
        waterPathFog: any;
        waterY: any;
        surfaceY: any;
        bedY: number;
    };
    detach(): void;
    beginFrame(scene: any): void;
    update(scene: any, inputs?: {}): {
        active: boolean;
        insideBounds: boolean;
        submergedDepth: number;
        color: any[];
        fogNear: number;
        fogFar: number;
        overlayOpacity: number;
        clearFogNode: any;
        waterPathFog: any;
        waterY: any;
        surfaceY: any;
        bedY: number;
    };
    dispose(): void;
}
