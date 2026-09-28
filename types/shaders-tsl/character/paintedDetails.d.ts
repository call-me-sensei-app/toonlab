/**
 * Nose shadow and its faint lit-side highlight. `faceUv` are the planar face
 * coordinates (u grows toward the character's right, v up), `lateral` the
 * light's component along the head's right axis. Returns `{ shadow, highlight }`.
 */
export function noseShadow(u: any, faceUv: any, lateral: any): {
    highlight: import("three/webgpu").Node<"vec3">;
    shadow: import("three/webgpu").Node<"vec3">;
};
/**
 * Shade under the upper lid on an eye white: `lid` is 0 at the upper lid and
 * 1 at the lower edge; flat to 55% of the depth, then fading.
 */
export function eyeWhiteShade(u: any, lid: any): import("three/webgpu").Node<"vec3">;
/**
 * The streak along a stocking: the leg axis is world up projected onto the
 * surface; the streak is where the normal, turned about that axis, faces the
 * half vector.
 */
export function sheerStreak(u: any, normal: any, halfVector: any, weight: any): import("three/webgpu").Node<"vec3">;
