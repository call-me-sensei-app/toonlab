/** A thresholded highlight from N·H: a flat shape, not a smooth lobe. */
export function stylizedSpecular({ intensity, normal, halfVector, size, softness, threshold }: {
    intensity: any;
    normal: any;
    halfVector: any;
    size: any;
    softness: any;
    threshold: any;
}): import("three/webgpu").Node<"vec3">;
/**
 * The hair ring: strands run along the head's up axis projected onto the
 * surface, and the ring sits where that strand direction is at a fixed angle
 * to the view — a band around the head that stays put as the light moves.
 * It breaks into strands by a vertical offset that varies smoothly around
 * the head (no steps between strands).
 */
export function hairRing(u: any, { head, normal, viewDirection, worldPosition }: {
    head: any;
    normal: any;
    viewDirection: any;
    worldPosition: any;
}): import("three/webgpu").Node<"vec3">;
/** Matcap lookup from the view-space normal (stable against view rotation). */
export function matcapUV(normalWorld: any, viewPosition: any): import("three/webgpu").Node<"vec2">;
/**
 * Rim amount. Depth mode samples the prepass `width` metres (projected at the
 * pixel's depth) toward the light's screen direction and draws a rim where
 * the surface there is farther by more than the threshold; the silhouette rim
 * does the same outward along the screen-space normal. Both are skipped where
 * the opposite side is clear too (a strand thinner than the rim). View mode —
 * and the fallback without a prepass — is a view-angle rim on the lit side.
 */
export function rimAmount(u: any, state: any, { lightDirection, normal, normalView, silhouette, viewDirection, viewPosition }: {
    lightDirection: any;
    normal: any;
    normalView: any;
    silhouette: any;
    viewDirection: any;
    viewPosition: any;
}): {
    depthRim: import("three/webgpu").VarNode<"float", import("three/webgpu").VarNode<"float", import("three/webgpu").ConstNode<"float", number>>>;
    rim: never;
};
