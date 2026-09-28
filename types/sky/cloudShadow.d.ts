/** Samples a baked cloud-shadow projection. Returns 1 in full light, 0 in shadow. */
export function sampleCloudShadowNode(worldPosition: any, shadowMapNode: any, projection: any): import("three/webgpu").Node<"float">;
/** Publish the active Sky System cloud bake to every ToonLab receiver. */
export function syncEnvironmentCloudShadowPass(pass: any): boolean;
export function clearEnvironmentCloudShadowPass(pass?: any): boolean;
/**
 * Builds the top-down transmittance pass. `cloudVolume.densityField` is shared
 * with the primary marcher, including its live textures and wind uniforms.
 */
export function createCloudShadowPass({ cloudVolume, clouds, sun, timeOfDay, resolution, extent, groundReferenceY, bakeInterval, }?: {
    timeOfDay?: any;
    resolution?: number;
    extent?: number;
    groundReferenceY?: number;
    bakeInterval?: number;
}): {
    axisU: import("three/webgpu").UniformNode<"vec3", THREE.Vector3>;
    axisV: import("three/webgpu").UniformNode<"vec3", THREE.Vector3>;
    center: import("three/webgpu").UniformNode<"vec3", THREE.Vector3>;
    enabledUniform: import("three/webgpu").UniformNode<"float", number>;
    extent: import("three/webgpu").UniformNode<"float", number>;
    intensity: import("three/webgpu").UniformNode<"float", number>;
    lightDirection: import("three/webgpu").UniformNode<"vec3", THREE.Vector3>;
    lightSteps: import("three/webgpu").UniformNode<"float", number>;
    material: MeshBasicNodeMaterial;
    mipLevel: import("three/webgpu").UniformNode<"float", number>;
    planetCenter: import("three/webgpu").UniformNode<"vec3", THREE.Vector3>;
    projection: {
        axisU: import("three/webgpu").UniformNode<"vec3", THREE.Vector3>;
        axisV: import("three/webgpu").UniformNode<"vec3", THREE.Vector3>;
        center: import("three/webgpu").UniformNode<"vec3", THREE.Vector3>;
        enabled: import("three/webgpu").UniformNode<"float", number>;
        extent: import("three/webgpu").UniformNode<"float", number>;
        intensity: import("three/webgpu").UniformNode<"float", number>;
    };
    target: THREE.RenderTarget<THREE.Texture<unknown, THREE.TextureEventMap>, THREE.RenderTargetEventMap>;
    texture: THREE.Texture<unknown, THREE.TextureEventMap>;
    enabled: boolean;
    readonly resolution: number;
    bakeInterval: number;
    groundReferenceY: number;
    setLightDirection(value?: any): any;
    setResolution(value: any): void;
    updateFrame(camera: any): void;
    bake(renderer: any): boolean;
    dispose(): void;
};
export const CLOUD_SHADOW_DEFAULT_EXTENT: 4000;
export const CLOUD_SHADOW_DEFAULT_LIGHT_STEPS: 8;
export const CLOUD_SHADOW_EDGE_FADE_START: 0.8;
export const CLOUD_SHADOW_NIGHT_THRESHOLD: number;
export namespace environmentCloudShadow {
    let axisU: import("three/webgpu").UniformNode<"vec3", THREE.Vector3>;
    let axisV: import("three/webgpu").UniformNode<"vec3", THREE.Vector3>;
    let center: import("three/webgpu").UniformNode<"vec3", THREE.Vector3>;
    let enabled: import("three/webgpu").UniformNode<"float", number>;
    let extent: import("three/webgpu").UniformNode<"float", number>;
    let intensity: import("three/webgpu").UniformNode<"float", number>;
    let map: import("three/webgpu").TextureNode<"vec4">;
    let ready: import("three/webgpu").UniformNode<"float", number>;
}
/**
 * Authoritative cloud visibility for a ToonLab receiver. `fallbackVisibility`
 * preserves legacy/standalone procedural clouds until a Sky System publishes
 * its actual volumetric-cloud transmittance map.
 */
export const sampleEnvironmentCloudShadow: import("three/src/nodes/TSL.js").FnNode<[], import("three/webgpu").VarNode<"float", import("three/webgpu").VarNode<"float", import("three/webgpu").ConstNode<"float", number>>>>;
import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
