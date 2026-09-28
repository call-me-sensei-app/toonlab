/** Fog uniform block for a foliage material. Default = effectively no fog. */
export function createFoliageFogUniforms(): {
    uFogColor: import("three/webgpu").UniformNode<"color", THREE.Color>;
    uFogNear: import("three/webgpu").UniformNode<"float", number>;
    uFogFar: import("three/webgpu").UniformNode<"float", number>;
};
/**
 * Applies linear fog to `color` using the billboarded view depth.
 * @param {*} color   vec3 node (mutated via return)
 * @param {*} vViewZ  varying float: viewPosition.z (negative forward)
 * @param {*} u       the fog uniform block
 * @returns fogged vec3 node
 */
export function applyFoliageFog(color: any, vViewZ: any, u: any): import("three/webgpu").Node<"vec3">;
/**
 * Copies a scene's linear Fog into a foliage material's fog uniforms. Call
 * once per frame (fog color/range can change with time of day). A null/absent
 * fog, or a non-linear FogExp2, disables fog (far = 1e9).
 */
export function syncFoliageFog(material: any, fog: any): void;
import * as THREE from 'three';
