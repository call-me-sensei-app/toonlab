/** CPU oracle for ToonLab's legacy GBuffer material conversion. */
export function evaluateToonLabSourceDefaultLitMaterialInputs({ baseColor, metallic, roughness, specular, }?: {
    baseColor?: number[];
    metallic?: number;
    roughness?: number;
    specular?: number;
}): Readonly<{
    baseColor: readonly any[];
    dielectricF0: number;
    diffuseAlbedo: readonly any[];
    f0: readonly any[];
    f90: number;
    metallic: number;
    roughness: number;
    specular: number;
}>;
/**
 * CPU oracle for DefaultLitBxDF with zero-size punctual lights.
 * `lightColor` must already include light falloff, tint, and surface shadow.
 */
export function evaluateToonLabSourceDefaultLitDirect({ baseColor, lightColor, lightDirection, metallic, normal, roughness, specular, viewDirection, }?: {
    baseColor?: number[];
    lightColor?: number[];
    lightDirection?: number[];
    metallic?: number;
    normal?: number[];
    roughness?: number;
    specular?: number;
    viewDirection?: number[];
}): Readonly<{
    brdfDiffuse: readonly any[];
    brdfSpecular: readonly any[];
    diffuse: readonly any[];
    f0: readonly any[];
    f90: number;
    nDotH: number;
    nDotL: number;
    nDotV: number;
    specular: readonly any[];
    total: readonly any[];
    vDotH: number;
}>;
/** CPU oracle for the captured-SkyLight diffuse boundary. */
export function evaluateToonLabSourceDefaultLitIndirectDiffuse({ baseColor, irradiance, metallic, roughness, specular, }?: {
    baseColor?: number[];
    irradiance?: number[];
    metallic?: number;
    roughness?: number;
    specular?: number;
}): readonly any[];
/**
 * CPU oracle for ToonLab's split-sum environment BRDF after the renderer supplies
 * its preintegrated AB sample. This verifies the exact F0/F90 boundary without
 * pretending that Three's DFG LUT texels equal ToonLab's PreIntegratedGF texels.
 */
export function evaluateToonLabSourceDefaultLitEnvBrdf({ f0, preintegratedAb, radiance, }?: {
    f0?: number[];
    preintegratedAb?: number[];
    radiance?: number[];
}): Readonly<{
    brdf: readonly any[];
    f90: number;
    reflected: readonly any[];
}>;
/** CPU source formula retained for the unresolved deferred AO compositor. */
export function evaluateToonLabSourceDefaultLitSpecularOcclusion({ ambientOcclusion, nDotV, roughness, }?: {
    ambientOcclusion?: number;
    nDotV?: number;
    roughness?: number;
}): number;
/** Install ToonLab legacy Default Lit on an ordinary opaque node material. */
export function installToonLabSourceDefaultLitLighting(material: any, options?: {}): any;
export const TOONLAB_SOURCE_DEFAULT_LIT_SOURCE: Readonly<{
    brdf: "Engine/Shaders/Private/BRDF.ush";
    brdfSha256: "0de81cc25c9b035a77aeb0e2f1be3e730c0f117f9250fe365104f30119b5e906";
    capture: any;
    captureSha256: any;
    deferredLighting: "Engine/Shaders/Private/DeferredLightingCommon.ush";
    deferredLightingSha256: "d3bcd5cf9c36cab57c281f6cad447816891836e3c05a67c8808cbb9ad83e2c46";
    projectConfig: "StylizedExploration/Config/DefaultEngine.ini";
    projectConfigSha256: "db8663d1d4a41aa5a9632b68dc88ddf7dcecbe8eebd7051ad23f10a9483ceee9";
    reflectionComposite: "Engine/Shaders/Private/ReflectionEnvironmentComposite.ush";
    reflectionCompositeSha256: "cb07271acf5f83593c2481346393f78cb18ab2b9079fb10ace366a0ec04920a1";
    reflectionPixel: "Engine/Shaders/Private/ReflectionEnvironmentPixelShader.usf";
    reflectionPixelSha256: "5f22072c6d98c9701ebb472b4617fdc58e2adee4cf4f79ccb1d221643e4e4a1f";
    shadingCommon: "Engine/Shaders/Private/ShadingCommon.ush";
    shadingCommonSha256: "7583ea665c6098f0957e63413971ad341dcb1588c634c7106bf955ce212c4189";
    shadingModels: "Engine/Shaders/Private/ShadingModels.ush";
    shadingModelsSha256: "27d661854c627ad0aa52673f553946a9c61add15674b32715b4a6297d02ed98f";
    skyDiffuse: "Engine/Shaders/Private/SkyLightingDiffuseShared.ush";
    skyDiffuseSha256: "9a725c7f015c310ed250207889f31bc9d63af8a9296e5ffa7a12b0d733d1de7c";
}>;
/**
 * Exactness boundary for the active ToonLabShowcase legacy Default Lit path.
 *
 * The direct BRDF is exact for the scene's zero-angle sun and zero-radius
 * point lights. The SkyLight diffuse boundary is exact once the capture node
 * supplies cosine-convolved irradiance. Reflection BRDF topology is ported,
 * but Three's DFG LUT/PMREM bytes are not ToonLab's PreIntegratedGF/reflection
 * capture buffers, and the active ToonLab SSR/AO composition is renderer-owned.
 */
export const TOONLAB_SOURCE_DEFAULT_LIT_CONTRACT: Readonly<{
    ambientOcclusion: "deferred renderer stage; deliberately not folded into the material BRDF";
    directDiffuse: "LightColor * saturate(N.L) * DiffuseColor / PI";
    directSpecular: "single-scatter isotropic GGX: D_GGX * Vis_SmithJointApprox * F_Schlick";
    energyConservation: false;
    indirectDiffuse: "cosine-convolved captured-SkyLight irradiance * DiffuseColor / PI";
    indirectSpecular: "filtered radiance * (F0 * AB.x + saturate(50 * F0.g) * AB.y)";
    roughDiffuse: false;
    source: "ToonLab legacy MSM_DEFAULT_LIT; Substrate disabled";
    stage: "partial-renderer-parity";
    punctualSourceShape: Readonly<{
        directionalLightSourceAngle: 0;
        pointLightSourceRadius: 0;
    }>;
    remainingBridges: readonly string[];
}>;
export class ToonLabSourceDefaultLitLightingModel extends PhysicalLightingModel {
    constructor({ metalnessNode, perceptualRoughnessNode, specularNode, }?: {
        metalnessNode?: import("three/webgpu").PropertyNode<"float">;
        perceptualRoughnessNode?: import("three/webgpu").MaterialNode;
        specularNode?: import("three/webgpu").VarNode<"float", import("three/webgpu").ConstNode<"float", number>>;
    });
    metalnessNode: import("three/webgpu").PropertyNode<"float">;
    perceptualRoughnessNode: import("three/webgpu").MaterialNode;
    specularNode: import("three/webgpu").VarNode<"float", import("three/webgpu").ConstNode<"float", number>>;
    direct({ lightDirection, lightColor, reflectedLight }: {
        lightDirection: any;
        lightColor: any;
        reflectedLight: any;
    }): void;
    indirectDiffuse(builder: any): void;
    indirectSpecular(builder: any): void;
    ambientOcclusion(): void;
}
import { PhysicalLightingModel } from 'three/webgpu';
