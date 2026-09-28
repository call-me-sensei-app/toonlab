/** CPU form of the ToonLab Beer-Lambert/HSV transmission-color transform. */
export function evaluateToonLabSourceSubsurfaceTransmittedColor(subsurfaceColor: any, transmittanceDistanceMeters?: number): readonly number[];
/**
 * Diffuse-only CPU oracle for the ported ToonLab MSM_SUBSURFACE equations.
 * Specular is intentionally excluded because it remains the stock physical
 * bridge and is not part of the foliage hue-preservation correction.
 */
export function evaluateToonLabSourceSubsurfaceDiffuse({ baseColor, backIrradiance, frontIrradiance, gbufferAo, indirectAo, lightColor, lightDotNegativeView, normalDotLight, opticalTransmittance, opacity, subsurfaceColor, surfaceShadow, transmissionShadow, }?: {
    baseColor?: number[];
    backIrradiance?: number[];
    frontIrradiance?: number[];
    gbufferAo?: number;
    indirectAo?: number[];
    lightColor?: number[];
    lightDotNegativeView?: number;
    normalDotLight?: number;
    opticalTransmittance?: number;
    opacity?: number;
    subsurfaceColor?: number[];
    surfaceShadow?: number;
    transmissionShadow?: any;
}): Readonly<{
    backScatter: number;
    directSurface: any;
    directTransmission: any;
    inScatter: number;
    indirect: any;
    normalContribution: number;
    totalDiffuse: any;
    transmittedColor: readonly number[];
    transmissionColor: any;
    wrappedDiffuse: number;
}>;
/** Install the ToonLab MSM_SUBSURFACE lighting model on a node material. */
export function installToonLabSourceSubsurfaceLighting(material: any, { gbufferAoNode, opticalTransmittanceNode, subsurfaceColorNode, subsurfaceOpacityNode, thinCardTransmissionFallback, transmissionShadowNode, }?: {
    gbufferAoNode?: import("three/webgpu").VarNode<"float", import("three/webgpu").ConstNode<"float", number>>;
    opticalTransmittanceNode?: import("three/webgpu").VarNode<"float", import("three/webgpu").ConstNode<"float", number>>;
    subsurfaceColorNode?: any;
    subsurfaceOpacityNode?: any;
    thinCardTransmissionFallback?: boolean;
    transmissionShadowNode?: any;
}): any;
export const TOONLAB_SOURCE_SUBSURFACE_LIGHTING_SOURCE: Readonly<{
    basePass: "Engine/Shaders/Private/BasePassPixelShader.usf";
    basePassSha256: "ba8b1c5efd4fba2e67bdc22b16820b004102f2123b8bbaf66dff87cc2d17e1ef";
    deferredLighting: "Engine/Shaders/Private/DeferredLightingCommon.ush";
    deferredLightingSha256: "d3bcd5cf9c36cab57c281f6cad447816891836e3c05a67c8808cbb9ad83e2c46";
    deferredShading: "Engine/Shaders/Private/DeferredShadingCommon.ush";
    deferredShadingSha256: "589432a8fa90a6f365d3bba3b13c4387d80dd6018224abe68cd01d8aeda1c62f";
    engine: "ToonLab legacy MSM_SUBSURFACE";
    sceneRendering: "Engine/Source/Runtime/Renderer/Private/SceneRendering.cpp";
    sceneRenderingSha256: "5467b777eba023c92c4780981c70540b0d476151c3da559c6be939a9bf204647";
    shadingModels: "Engine/Shaders/Private/ShadingModels.ush";
    shadingModelsSha256: "27d661854c627ad0aa52673f553946a9c61add15674b32715b4a6297d02ed98f";
}>;
export const TOONLAB_SOURCE_SUBSURFACE_LIGHTING_CONTRACT: Readonly<{
    ambientOcclusion: "material AO defaults to one; accumulated indirect is then processed by the active renderer AO stage";
    direct: "DefaultLit surface + MSM_SUBSURFACE wrapped backscatter/in-scatter transmission";
    indirect: "(frontIrradiance * (DiffuseColor + SubsurfaceColor) + backIrradiance * SubsurfaceColor) / PI";
    normal: "face-corrected material normal; backface SkyLight evaluates the opposite world normal";
    opticalDistanceMeters: 0.15;
    remainingBridges: readonly string[];
    source: "ShadingModels.ush + BasePassPixelShader.usf + DeferredLightingCommon.ush";
    stage: "partial-renderer-parity";
    transmissionShadowFallback: "surface-shadow visibility, except retained thin-card leaves which use authored SS Opacity to separate transmission from the opaque surface mask";
}>;
export class ToonLabSourceSubsurfaceLightingModel extends PhysicalLightingModel {
    constructor({ gbufferAoNode, opticalTransmittanceNode, subsurfaceColorNode, subsurfaceOpacityNode, thinCardTransmissionFallback, transmissionShadowNode, }?: {
        gbufferAoNode?: import("three/webgpu").VarNode<"float", import("three/webgpu").ConstNode<"float", number>>;
        opticalTransmittanceNode?: import("three/webgpu").VarNode<"float", import("three/webgpu").ConstNode<"float", number>>;
        subsurfaceColorNode?: import("three/webgpu").VarNode<"vec3", import("three/webgpu").ConstNode<"vec3", import("three").Vector3>>;
        subsurfaceOpacityNode?: import("three/webgpu").VarNode<"float", import("three/webgpu").ConstNode<"float", number>>;
        thinCardTransmissionFallback?: boolean;
        transmissionShadowNode?: any;
    });
    gbufferAoNode: import("three/webgpu").VarNode<"float", import("three/webgpu").ConstNode<"float", number>>;
    opticalTransmittanceNode: import("three/webgpu").VarNode<"float", import("three/webgpu").ConstNode<"float", number>>;
    subsurfaceColorNode: import("three/webgpu").VarNode<"vec3", import("three/webgpu").ConstNode<"vec3", import("three").Vector3>>;
    subsurfaceOpacityNode: import("three/webgpu").VarNode<"float", import("three/webgpu").ConstNode<"float", number>>;
    thinCardTransmissionFallback: boolean;
    transmissionShadowNode: any;
    direct(input: any, builder: any): void;
    indirectDiffuse(builder: any): void;
}
import { PhysicalLightingModel } from 'three/webgpu';
