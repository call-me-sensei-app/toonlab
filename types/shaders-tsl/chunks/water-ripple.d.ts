export function createWaterRippleChunk({ u }: {
    u: any;
}): {
    rippleGradient: (restXZ: any) => import("three/webgpu").VarNode<"vec2", import("three/webgpu").VarNode<"vec2", import("three/webgpu").ConstNode<"vec2", import("three").Vector2>>>;
    rippleMask: (uv: any) => import("three/webgpu").Node<"vec3">;
    rippleSample: (restXZ: any) => import("three/webgpu").VarNode<"vec3", import("three/webgpu").VarNode<"vec3", import("three/webgpu").ConstNode<"vec3", import("three").Vector3>>>;
    rippleUv: (restXZ: any) => any;
};
