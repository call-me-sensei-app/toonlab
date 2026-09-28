/**
 * Builds the environment NodeMaterial. Value defaults mirror the classic
 * ShaderMaterial uniform block in environmentShaderMaterials.js line for
 * line; `flags` mirrors the USE_ENV_* defines the classic factory sets.
 */
export function createEnvironmentNodeMaterial({ alphaBlend, alphaCutoff, baseColor, environmentBox, flags, hasSun, isEmissive, isFoliage, isGlossFloor, opacity, side, textureSet, }: {
    alphaBlend?: boolean;
    alphaCutoff?: number;
    baseColor?: THREE.Color;
    environmentBox?: any;
    flags: any;
    hasSun?: boolean;
    isEmissive?: boolean;
    isFoliage?: boolean;
    isGlossFloor?: boolean;
    opacity?: number;
    side?: 2;
    textureSet: any;
}): NodeMaterial;
export namespace environmentSharedUniformNodes {
    let time: import("three/webgpu").UniformNode<"float", number>;
    let cloudShadowStrength: import("three/webgpu").UniformNode<"float", number>;
    let cloudShadowCoverage: import("three/webgpu").UniformNode<"float", number>;
    let cloudShadowScale: import("three/webgpu").UniformNode<"float", number>;
    let cloudShadowVelocity: import("three/webgpu").UniformNode<"vec2", THREE.Vector2>;
    let envDebugMode: import("three/webgpu").UniformNode<"float", number>;
    let environmentOpenings: import("three/webgpu").UniformArrayNode<string>;
    let environmentOpeningCount: import("three/webgpu").UniformNode<"float", number>;
    let ambientProbe: import("three/webgpu").UniformArrayNode<string>;
    let planarReflectionMap: import("three/webgpu").TextureNode<"vec4">;
    let planarReflectionMatrix: import("three/webgpu").UniformNode<"mat4", THREE.Matrix4>;
}
import * as THREE from 'three';
import { NodeMaterial } from 'three/webgpu';
