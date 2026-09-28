export function luma(color: any): import("three/webgpu").Node<"float">;
export function maxComponent(color: any): import("three/webgpu").Node<"float">;
export function minComponent(color: any): import("three/webgpu").Node<"float">;
/** Linear → display (sRGB-encoded), clamped to the representable range. */
export function toDisplay(linear: any): import("three/webgpu").Node;
/** Display (sRGB-encoded) → linear. */
export function toLinear(display: any): import("three/webgpu").Node;
/** Multiplies a linear colour by a display-space multiplier. */
export function displayMultiply(linear: any, multiplier: any): import("three/webgpu").Node;
/** Display chroma (max − min channel) of a linear colour. */
export function displayChroma(linear: any): import("three/webgpu").Node<"float">;
export const rgbToHsv: import("three/src/nodes/TSL.js").FnNode<[], import("three/webgpu").VarNode<"vec3", import("three/webgpu").JoinNode<"vec3">>>;
export const hsvToRgb: import("three/src/nodes/TSL.js").FnNode<[], any>;
