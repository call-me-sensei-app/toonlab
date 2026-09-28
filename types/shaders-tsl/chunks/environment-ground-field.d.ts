export function groundFieldColorMapNode(): any;
export function groundFieldFilteredColorMapNode(): any;
export function groundFieldHeightMapNode(): any;
export function groundFieldSurfaceMapNode(): any;
export namespace environmentGroundField {
    let colorMap: any;
    let filteredColorMap: any;
    let surfaceMap: any;
    let heightMap: any;
    let matrix: import("three/webgpu").UniformNode<"mat4", THREE.Matrix4>;
    let heightMin: import("three/webgpu").UniformNode<"float", number>;
    let heightSpan: import("three/webgpu").UniformNode<"float", number>;
    let colorMipLevel: import("three/webgpu").UniformNode<"float", number>;
    let ready: import("three/webgpu").UniformNode<"float", number>;
}
/**
 * Ground albedo under a world position: rgb = color, a = coverage (0 where
 * no ground writer rendered, outside the field bounds, or before the pass
 * has run). Callers mix toward their own base color by alpha.
 */
export const sampleGroundColor: import("three/src/nodes/TSL.js").FnNode<[], import("three/webgpu").VarNode<"vec4", import("three/webgpu").VarNode<"vec4", import("three/webgpu").ConstNode<"vec4", THREE.Vector4>>>>;
/**
 * Ground surface properties under a world position:
 * rgb = roughness, specular, metalness; a = the color target's coverage.
 * This mirrors the landscape RVT material fields consumed by M_Foliage.
 */
export const sampleGroundSurface: import("three/src/nodes/TSL.js").FnNode<[], import("three/webgpu").VarNode<"vec4", import("three/webgpu").VarNode<"vec4", import("three/webgpu").ConstNode<"vec4", THREE.Vector4>>>>;
/**
 * World-space ground height under a position. Returns a far-below sentinel
 * (heightMin - heightSpan) when unavailable so naive height differences
 * produce zero blend rather than false contact.
 */
export const sampleGroundHeight: import("three/src/nodes/TSL.js").FnNode<[], import("three/webgpu").VarNode<"float", import("three/webgpu").VarNode<"float", import("three/webgpu").ConvertNode<"float">>>>;
/**
 * Contact-blend weight for melting a mesh base into the ground: 1 at or
 * below the ground surface, easing to 0 at blendHeight above it, scaled by
 * ground coverage. The mesh-base equivalent of the reference VT blend.
 */
export const groundBlendFactor: import("three/src/nodes/TSL.js").FnNode<[], import("three/webgpu").Node<"float">>;
import * as THREE from 'three';
