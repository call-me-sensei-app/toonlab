/** Single-octave 2D value noise in [0, 1]; p is a world-XZ coordinate. */
export const worldValueNoise2: import("three/src/nodes/TSL.js").FnNode<[], import("three/webgpu").Node<"float">>;
/** Three-octave fbm in [0, 1]; p is a world-XZ coordinate (pre-scaled). */
export const worldFbm2: import("three/src/nodes/TSL.js").FnNode<[], import("three/webgpu").Node<"float">>;
