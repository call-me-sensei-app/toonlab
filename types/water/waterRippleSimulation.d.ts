export const WATER_SIM_MAX_IMPULSES: 16;
export class WaterRippleSimulation {
    constructor({ resolution, worldWidth, worldDepth, centerX, centerZ, }?: {
        resolution?: number;
        worldWidth?: number;
        worldDepth?: number;
        centerX?: number;
        centerZ?: number;
    });
    resolution: number;
    worldWidth: number;
    worldDepth: number;
    centerX: number;
    centerZ: number;
    parameters: {
        rippleDamping: number;
        ripplePropagation: number;
        rippleFoamDecay: number;
        rippleFoamGain: number;
    };
    targets: THREE.WebGLRenderTarget<THREE.Texture<unknown, THREE.TextureEventMap>>[];
    readIndex: number;
    initialized: boolean;
    timeAccumulator: number;
    pendingImpulses: any[];
    pendingShiftTexels: THREE.Vector2;
    material: import("three/webgpu").NodeMaterial;
    fullscreenScene: THREE.Scene<THREE.Object3DEventMap>;
    fullscreenCamera: THREE.OrthographicCamera;
    createTarget(): THREE.WebGLRenderTarget<THREE.Texture<unknown, THREE.TextureEventMap>>;
    get texture(): THREE.Texture<unknown, THREE.TextureEventMap>;
    get texelSize(): any;
    getRegion(out?: THREE.Vector4): THREE.Vector4;
    setParameters(parameters?: {}): this;
    setCenter(x: any, z: any): this;
    containsPoint(worldX: any, worldZ: any, margin?: number): boolean;
    addImpulse(worldX: any, worldZ: any, { radius, strength }?: {
        radius?: number;
        strength?: number;
    }): this;
    addRingImpulse(worldX: any, worldZ: any, { radius, strength, points }?: {
        radius?: number;
        strength?: number;
        points?: number;
    }): this;
    writeImpulseUniforms(): void;
    clearTargets(renderer: any): void;
    step(renderer: any): void;
    update(renderer: any, delta: any): void;
    dispose(): void;
}
import * as THREE from 'three';
