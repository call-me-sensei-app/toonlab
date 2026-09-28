export function createEnvironmentLightingChunk({ u, tex, flags, cameraViewMatrixNode }: {
    u: any;
    tex: any;
    flags: any;
    cameraViewMatrixNode: any;
}): {
    environmentProbeIrradiance: (normal: any) => import("three/webgpu").Node<"vec3">;
    evaluateDirectionalLight: (normal: any) => {
        light: import("three/webgpu").VarNode<"vec3", import("three/webgpu").VarNode<"vec3", import("three/webgpu").ConstNode<"vec3", import("three").Vector3>>>;
        strongest: import("three/webgpu").VarNode<"float", import("three/webgpu").VarNode<"float", import("three/webgpu").ConstNode<"float", number>>>;
    };
    evaluateEnvironmentSpecular: (worldNormal: any, geometryPosition: any, sunlightVisibility: any) => import("three/webgpu").VarNode<"vec3", import("three/webgpu").VarNode<"vec3", import("three/webgpu").ConstNode<"vec3", import("three").Vector3>>>;
    evaluatePointLights: (normal: any, geometryPosition: any) => {
        light: import("three/webgpu").VarNode<"vec3", import("three/webgpu").VarNode<"vec3", import("three/webgpu").ConstNode<"vec3", import("three").Vector3>>>;
        strongest: import("three/webgpu").VarNode<"float", import("three/webgpu").VarNode<"float", import("three/webgpu").ConstNode<"float", number>>>;
    };
    evaluateSpotLights: (normal: any, geometryPosition: any) => {
        light: import("three/webgpu").VarNode<"vec3", import("three/webgpu").VarNode<"vec3", import("three/webgpu").ConstNode<"vec3", import("three").Vector3>>>;
        strongest: import("three/webgpu").VarNode<"float", import("three/webgpu").VarNode<"float", import("three/webgpu").ConstNode<"float", number>>>;
    };
    perturbEnvironmentNormal: (normal: any, worldPosition: any, uvNode: any) => import("three/webgpu").Node<"vec3">;
};
