export const cloudShadowHash: import("three/src/nodes/TSL.js").FnNode<[], import("three/webgpu").Node<"float">>;
export const cloudShadowNoise: import("three/src/nodes/TSL.js").FnNode<[], import("three/webgpu").Node<"float">>;
/**
 * GLSL stylizedCloudShadow(worldXZ, time, strength, coverage, scale,
 * velocity): sunlight visibility factor in [1 - strength, 1]. strength below
 * 0.001 short-circuits to fully lit (same If shape as the GLSL early return,
 * so the fbm costs nothing while disabled).
 */
export const stylizedCloudShadow: import("three/src/nodes/TSL.js").FnNode<[], import("three/webgpu").VarNode<"float", import("three/webgpu").VarNode<"float", import("three/webgpu").ConstNode<"float", number>>>>;
