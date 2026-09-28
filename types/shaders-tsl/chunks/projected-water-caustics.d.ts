/** Refresh the shared receiver from the active WaterSurface once per frame. */
export function updateProjectedWaterCaustics({ enabled, time, waterLevel, centerX, centerZ, halfWidth, halfDepth, color, intensity, scale, speed, flowDirection, waveDistortion, depthAttenuation, surfaceMap, surfaceRegion, }?: {
    surfaceMap?: any;
    surfaceRegion?: any;
}): void;
/**
 * Returns additive underwater caustic light for a world position/normal.
 * This deliberately stays branchless. A previous TSL `If`-wrapped version
 * compiled as a zeroed material branch on some WebGPU/WebGL node backends,
 * darkening the receiver whenever caustics were disabled above water.
 */
export function projectedWaterCaustics(worldPosition: any, worldNormal: any): import("three/webgpu").Node<"vec3">;
export namespace projectedWaterCausticUniforms {
    let map: import("three/webgpu").TextureNode<"vec4">;
    let surfaceMap: import("three/webgpu").TextureNode<"vec4">;
    let useSurfaceMap: import("three/webgpu").UniformNode<"float", number>;
    let surfaceRegion: import("three/webgpu").UniformNode<"vec4", THREE.Vector4>;
    let enabled: import("three/webgpu").UniformNode<"float", number>;
    let time: import("three/webgpu").UniformNode<"float", number>;
    let waterLevel: import("three/webgpu").UniformNode<"float", number>;
    let region: import("three/webgpu").UniformNode<"vec4", THREE.Vector4>;
    let color: import("three/webgpu").UniformNode<"color", THREE.Color>;
    let intensity: import("three/webgpu").UniformNode<"float", number>;
    let scale: import("three/webgpu").UniformNode<"float", number>;
    let speed: import("three/webgpu").UniformNode<"float", number>;
    let flowDirection: import("three/webgpu").UniformNode<"vec2", THREE.Vector2>;
    let waveDistortion: import("three/webgpu").UniformNode<"float", number>;
    let depthAttenuation: import("three/webgpu").UniformNode<"float", number>;
}
import * as THREE from 'three';
