export function validateCompiledTreeManifest(input: any): {
    ok: boolean;
    errors: string[];
    value?: undefined;
} | {
    ok: boolean;
    value: any;
    errors?: undefined;
};
export function parseCompiledTreeManifest(input: any): any;
export function projectedTreeScreenCoverage(camera: any, worldCenter: any, radius: any, viewportHeight?: any): number;
export function resolveTreeDitherMode(renderer: any, temporalHistory?: boolean): "temporal" | "bayer";
export function loadCompiledTreeAsset(manifestOrUrl: any, { decoderBasePath, fetch: fetchFn, loadingManager, renderer, temporalHistory, }?: {
    decoderBasePath?: any;
    fetch?: typeof fetch;
    loadingManager?: any;
    renderer?: any;
    temporalHistory?: boolean;
}): Promise<{
    manifest: any;
    levels: any;
    textures: any;
    ditherMode: string;
    createInstance: (options: any) => CompiledTreeInstance;
    dispose(): void;
}>;
export const COMPILED_TREE_MANIFEST_SCHEMA: "toonlab/compiled-tree";
export const COMPILED_TREE_MANIFEST_VERSION: 1;
export const TREE_RUNTIME_QUALITY_PROFILES: Readonly<{
    mobile: Readonly<{
        detailedCount: 30;
        maxPlacements: 1500;
        variants: 3;
    }>;
    balanced: Readonly<{
        detailedCount: 72;
        maxPlacements: 2200;
        variants: 5;
    }>;
    high: Readonly<{
        detailedCount: 120;
        maxPlacements: 3000;
        variants: 8;
    }>;
}>;
export class CompiledTreeInstance extends THREE.Group<THREE.Object3DEventMap> {
    constructor(asset: any, { quality, transitionSeconds, hysteresis, surfaceLook, styleTarget, }?: {
        quality?: string;
        transitionSeconds?: number;
        hysteresis?: number;
        surfaceLook?: any;
        styleTarget?: {};
    });
    manifest: any;
    quality: string;
    transitionSeconds: number;
    hysteresis: number;
    ditherMode: any;
    ditherFrame: number;
    levels: any;
    currentLevel: number;
    nextLevel: number;
    transition: number;
    _worldCenter: THREE.Vector3;
    _boundsCenter: THREE.Vector3;
    setSurfaceLook(id: any): boolean;
    _resolveLevel(coverage: any): any;
    update(delta: any, camera: any): {
        coverage: number;
        level: number;
        transitioningTo: number;
    };
    dispose(): void;
}
import * as THREE from 'three';
