/** Scales a colour so its brightest channel is at most `limit`. */
export function capBrightest(color: any, limit: any): any;
/**
 * Desaturates a light colour (in display space) so its saturation is at most
 * `limit`, keeping its brightest channel.
 */
export function limitSaturation(color: any, limit: any): any;
/**
 * The sun and sky light for a surface with world normal `normal`.
 * Returns `{ light, sky, sunDirection }` nodes.
 */
export function characterLight(u: any, normal: any): {
    light: import("three/webgpu").VarNode<"vec3", import("three/webgpu").Node<"vec3">>;
    sky: import("three/webgpu").VarNode<"vec3", import("three/webgpu").Node<"vec3">>;
};
/**
 * Direction (world, toward the light) the character is shaded with: the sun,
 * blended toward a camera-relative key, its elevation capped.
 */
export function shadingDirection(u: any): {
    castDirection: import("three/webgpu").Node<"vec3">;
    direction: import("three/webgpu").VarNode<"vec3", import("three/webgpu").Node<"vec3">>;
};
/**
 * Point and spot lights as additive cel bands on the sides facing them,
 * summed and capped. Returns a linear colour to multiply the albedo by.
 */
export function localLightBands(u: any, worldPosition: any, normal: any): any;
