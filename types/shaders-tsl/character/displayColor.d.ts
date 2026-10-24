export function luma(color: any): import("three/webgpu").Node<"float">;
export function maxComponent(color: any): import("three/webgpu").Node<"float">;
export function minComponent(color: any): import("three/webgpu").Node<"float">;
/** Linear → display (sRGB-encoded), clamped to the representable range. */
export function toDisplay(linear: any): import("three/webgpu").Node;
/** Display (sRGB-encoded) → linear. */
export function toLinear(display: any): import("three/webgpu").Node;
/** Multiplies a linear colour by a display-space multiplier. */
export function displayMultiply(linear: any, multiplier: any): import("three/webgpu").Node;
/**
 * Raises the display saturation of a linear colour toward that of
 * `reference` (the same surface before the light's colour), keeping its hue
 * and brightest channel: `amount` 1 restores the reference's saturation
 * where the light took some away, 0 leaves the colour as it is. Never lowers
 * saturation, and leaves near-grey colours alone (no hue to restore).
 */
export function keepSaturation(linear: any, reference: any, amount: any): import("three/webgpu").Node;
/** Display chroma (max − min channel) of a linear colour. */
export function displayChroma(linear: any): import("three/webgpu").Node<"float">;
export const rgbToHsv: import("three/src/nodes/TSL.js").FnNode<[], import("three/webgpu").VarNode<"vec3", import("three/webgpu").JoinNode<"vec3">>>;
export const hsvToRgb: import("three/src/nodes/TSL.js").FnNode<[], any>;
