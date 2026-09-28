/**
 * CPU-authored, world-space horizontal current field.
 *
 * The CPU retains full-precision velocity/mask arrays for gameplay queries.
 * A compact linearly-filtered RGBA8 texture mirrors the field for lightweight
 * GPU consumers such as shoreline-foam advection:
 *
 *   R/G = signed X/Z velocity encoded around 0.5
 *   B   = fluid/obstacle weight
 *   A   = valid authored domain
 *
 * This is deliberately not a shallow-water or Navier-Stokes solver. The
 * caller authors the large-scale velocity (`velocitySampler`) and optional
 * water-domain mask. A signed-distance sampler adds a deterministic
 * no-penetration projection near banks/rocks, but it cannot infer circulation,
 * pressure, wakes, separation, or downstream turbulence. Those need authored
 * vectors, a flow-map bake, or a real fluid solver upstream.
 *
 * `velocitySampler(x, z, out, context)` may mutate `out` or return a Vector2,
 * `[vx, vz]`, `{ x, z }`, `false`, or `null`. `context.time` lets a caller bake
 * a new tidal phase. For cheap whole-field tidal reversal between bakes, use
 * `setStrength(-1)`; CPU and GPU consumers receive the same multiplier.
 */
export class WaterCurrentField {
    constructor({ region, resolution, velocity, velocitySampler, sampler, maskSampler, domainMaskSampler, signedDistanceSampler, obstacleDistanceSampler, obstacleInfluence, obstacleDeflection, preserveTangentialSpeed, obstacleGradientStep, maxSpeed, strength, time, }?: {
        region?: {};
        resolution?: {
            x: number;
            y: number;
        };
        velocity?: number[];
        velocitySampler?: any;
        sampler?: any;
        maskSampler?: any;
        domainMaskSampler?: any;
        signedDistanceSampler?: any;
        obstacleDistanceSampler?: any;
        obstacleInfluence?: number;
        obstacleDeflection?: number;
        preserveTangentialSpeed?: number;
        obstacleGradientStep?: any;
        maxSpeed?: number;
        strength?: number;
        time?: number;
    });
    isWaterCurrentField: boolean;
    centerX: any;
    centerZ: any;
    worldWidth: number;
    worldDepth: number;
    resolutionX: number;
    resolutionY: number;
    region: THREE.Vector4;
    minX: number;
    minZ: number;
    cellSizeX: number;
    cellSizeZ: number;
    constantVelocity: THREE.Vector2;
    velocitySampler: any;
    maskSampler: any;
    obstacleDistanceSampler: any;
    obstacleInfluence: number;
    obstacleDeflection: number;
    preserveTangentialSpeed: number;
    obstacleGradientStep: number;
    maxSpeed: number;
    strength: any;
    time: any;
    revision: number;
    disposed: boolean;
    /** @type {{ time: number, field: WaterCurrentField }} */
    sampleContext: {
        time: number;
        field: WaterCurrentField;
    };
    velocities: Float32Array<ArrayBuffer>;
    weights: Float32Array<ArrayBuffer>;
    validity: Float32Array<ArrayBuffer>;
    encodedData: Uint8Array<ArrayBuffer>;
    texture: THREE.DataTexture;
    getRegion(out?: THREE.Vector4): THREE.Vector4;
    containsPoint(x: any, z: any): boolean;
    setStrength(strength: any): this;
    setTime(time: any, { rebuild }?: {
        rebuild?: boolean;
    }): this;
    setVelocitySampler(sampler: any, { rebuild }?: {
        rebuild?: boolean;
    }): this;
    setMaskSampler(sampler: any, { rebuild }?: {
        rebuild?: boolean;
    }): this;
    setObstacleDistanceSampler(sampler: any, { rebuild }?: {
        rebuild?: boolean;
    }): this;
    projectAtObstacle(x: any, z: any, velocity: any, distance: any): number;
    rebuild({ time }?: {
        time?: any;
    }): this;
    sampleChannelsAt(x: any, z: any, out: any): any;
    /** Bilinear CPU sample in metres/second. Outside/solid/invalid = (0, 0). */
    sampleAt(x: any, z: any, out?: THREE.Vector2): THREE.Vector2;
    /** Fluid-domain weight after obstacle and validity feathering, 0..1. */
    sampleWeightAt(x: any, z: any): number;
    dispose(): void;
}
export namespace WaterCurrentField {
    namespace _sampleChannels {
        let vx: number;
        let vz: number;
        let weight: number;
        let valid: number;
    }
}
import * as THREE from 'three';
