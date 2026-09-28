export function viewToScreenUV(viewPosition: any): import("three/webgpu").VarNode<"vec2", import("three/webgpu").JoinNode<"vec2">>;
/** Screen UV of this pixel shifted by a view-space offset at `viewPosition`. */
export function offsetScreenUV(viewPosition: any, viewOffset: any, baseUV?: import("three/webgpu").VarNode<"vec2", import("three/webgpu").JoinNode<"vec2">>): import("three/webgpu").Node<"vec2">;
/**
 * Screen-UV change per metre of a lateral (view-plane) offset at this
 * pixel's depth: exact for perspective and orthographic cameras.
 */
export function uvPerMetre(viewPosition: any): import("three/webgpu").Node<"vec2">;
/** `{ depth, face }` from a value stored by the character passes. */
export function decodeStoredDepth(stored: any): {
    depth: import("three/webgpu").Node<"float">;
    face: any;
};
/** Window depth written by the depth prepass → distance in front of the camera. */
export function prepassDistance(windowDepth: any): import("three/webgpu").Node<"float">;
/**
 * The character's own orthographic shadow map (characterRenderPasses.js):
 * normal-offset and slope-scaled bias, bilinear filtering, and a fade toward the
 * edge of the map's coverage.
 */
export function characterShadowVisibility(u: any, state: any, worldPosition: any, geometryNormal: any, faceLike: any, gate: any): import("three/webgpu").VarNode<"float", import("three/webgpu").VarNode<"float", import("three/webgpu").ConstNode<"float", number>>>;
/**
 * Screen-space shadow toward the light against the depth prepass: something
 * in front of the short ray toward the light (bangs over the forehead, hair
 * on the cheek) shadows the pixel. Face receivers ignore face occluders
 * (`faceWeight`), so a face never shadows itself.
 */
export function screenSpaceShadowVisibility(u: any, state: any, viewPosition: any, lightDirectionWorld: any, faceWeight: any, gate: any): import("three/webgpu").Node<"float">;
export const FACE_DEPTH_OFFSET: 2;
