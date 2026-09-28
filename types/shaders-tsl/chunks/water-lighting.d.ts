export function createWaterLightingChunk({ u, physicalSurface }: {
    u: any;
    physicalSurface?: boolean;
}): {
    fresnelFactor: (viewDir: any, surfaceNormal: any) => any;
    proceduralSky: (reflectDir: any) => import("three/webgpu").Node<"float">;
    reflectionColor: (worldPosition: any, surfaceNormal: any, viewDir: any) => import("three/webgpu").VarNode<"vec3", import("three/webgpu").VarNode<"vec3", import("three/webgpu").ConvertNode<"vec3">>>;
    sparkles: (restXZ: any, surfaceNormal: any, viewDir: any, viewDistance: any, time: any) => import("three/webgpu").Node<"vec3">;
    specular: (viewDir: any, surfaceNormal: any, shadowFactor: any) => any;
};
