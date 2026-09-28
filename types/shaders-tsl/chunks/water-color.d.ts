export function createWaterColorChunk({ u, flags }: {
    u: any;
    flags: any;
}): {
    absorptionTint: (effectiveDepth: any) => {
        absorb: import("three/webgpu").VarNode<"float", import("three/webgpu").Node<"float">>;
        tint: import("three/webgpu").VarNode<"float", import("three/webgpu").Node<"float">>;
    };
    caustics: (groundWorld: any, columnDepth: any, time: any) => import("three/webgpu").VarNode<"vec3", import("three/webgpu").VarNode<"vec3", import("three/webgpu").ConstNode<"vec3", import("three").Vector3>>>;
    pierceProximity: (screenUv: any, waterViewDistance: any, surfaceHeight: any) => import("three/webgpu").VarNode<"float", import("three/webgpu").VarNode<"float", import("three/webgpu").ConstNode<"float", number>>>;
    refractedUv: (screenUv: any, surfaceNormal: any, waterViewDistance: any, viewDepthDiff: any) => import("three/webgpu").VarNode<"vec2", import("three/webgpu").VarNode<"vec2", import("three/webgpu").ConstNode<"vec2", import("three").Vector2>>>;
    sceneRawDepth: (screenUv: any) => import("three/webgpu").VarNode<"float", import("three/webgpu").Node<"float">>;
    viewDistanceFromDepth: (rawDepth: any) => import("three/webgpu").VarNode<"float", import("three/webgpu").VarNode<"float", import("three/webgpu").ConstNode<"float", number>>>;
    worldFromDepth: (screenUv: any, rawDepth: any) => any;
};
