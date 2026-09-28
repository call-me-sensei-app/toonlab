/** GLSL envLuma(color): Rec.709 luminance. */
export const envLuma: import("three/src/nodes/TSL.js").FnNode<[], import("three/webgpu").Node<"float">>;
/** GLSL applySaturation(color, amount): lerp from grayscale luma. */
export const applySaturation: import("three/src/nodes/TSL.js").FnNode<[], import("three/webgpu").Node<"vec3">>;
/**
 * GLSL windowPaneMask(color): 1 where the texel reads as a blue/cyan glass
 * pane, guarded against bright cloth/paper. Same smoothstep windows.
 */
export const windowPaneMask: import("three/src/nodes/TSL.js").FnNode<[], import("three/webgpu").Node<"float">>;
