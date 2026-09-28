/**
 * environmentDebugColor(...) — returns finalColor when mode matches no table
 * entry (including mode 0 / off), else the selected debug view.
 */
export function environmentDebugColor({ mode, albedo, litColor, ambient, directLight, pointLight, spotLight, sunlightVisibility, aoMul, bakedGi, normal, vertexAo, specular, emissiveMask, windowMask, roomOcclusion, alpha, finalColor, }: {
    mode: any;
    albedo: any;
    litColor: any;
    ambient: any;
    directLight: any;
    pointLight: any;
    spotLight: any;
    sunlightVisibility: any;
    aoMul: any;
    bakedGi: any;
    normal: any;
    vertexAo: any;
    specular: any;
    emissiveMask: any;
    windowMask: any;
    roomOcclusion: any;
    alpha: any;
    finalColor: any;
}): import("three/webgpu").Node<"vec4">;
