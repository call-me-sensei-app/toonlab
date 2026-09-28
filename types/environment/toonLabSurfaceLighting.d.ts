export function resolveToonLabSurfaceInputAdapter(inputAdapter?: "toonlab-stage"): Readonly<{
    directInput: "ToonLab Light radiance pre-multiplied by PI for stock Three Lambert coexistence";
    directNormalization: number;
    id: "toonlab-stage";
    indirectInput: "ToonLab bakedGI pre-multiplied by PI before entering Three irradiance";
    indirectNormalization: number;
}> | Readonly<{
    directInput: "raw ToonLab source-stage analytic-light radiance using ToonLab Lambert energy convention";
    directNormalization: number;
    id: "toonlab-captured-scene-sh";
    indirectInput: "Three LightProbe cosine-convolved irradiance from the ToonLab captured-scene SH";
    indirectNormalization: number;
}>;
/** CPU oracle for the diffuse-only direct/indirect input decomposition. */
export function evaluateToonLabSurfaceDiffuseDecomposition({ brdfDiffuse, directStrength, directInput, indirectInput, inputAdapter, nDotL, }?: {
    brdfDiffuse?: number[];
    directStrength?: number;
    directInput?: number[];
    indirectInput?: number[];
    inputAdapter?: "toonlab-stage";
    nDotL?: number;
}): Readonly<{
    adapterId: "toonlab-stage" | "toonlab-captured-scene-sh";
    directDiffuse: readonly any[];
    directRadiance: readonly any[];
    indirectBakedGi: readonly any[];
    indirectDiffuse: readonly any[];
    totalDiffuse: readonly any[];
}>;
/** Install TOONLAB lighting on an existing MeshPhysicalNodeMaterial instance. */
export function installToonLabSurfaceLighting(material: any, options?: {}): any;
export const TOONLAB_SURFACE_LIGHTING_SOURCE: Readonly<{
    captureReport: "assets-local/reference-environment/environment-capture-current/toonlab-reference.txt";
    captureReportSha256: "9d3c4e758e256013cb1f4fd6517d754b61e86f7ebda7e63f55683651b8b32f98";
    ambientProbe: "ShaderLibrary/AmbientProbe.hlsl";
    ambientProbeSha256: "c34711410eddad9de1f189ced4e711d02c0245cfb8dd3bb93d06944ad8d5aa54";
    brdf: "ShaderLibrary/BRDF.hlsl";
    brdfSha256: "1e8427056b0ab3046adf753d72fc3afee3d54c335e38a4d1069e6eedb0f78075";
    corePackage: "@call-me-sensei/toonlab/environment";
    globalIllumination: "ShaderLibrary/GlobalIllumination.hlsl";
    globalIlluminationSha256: "a2eac4011d4ef041fda672e9f612993d1de035f46b882ecf4c3852ba40c87198";
    lighting: "ShaderLibrary/Lighting.hlsl";
    lightingSha256: "26ab9a1634466a75ea8926528e882e05f9960fbb60f5021c044decb03d156e38";
    sphericalHarmonics: "ShaderLibrary/SphericalHarmonics.hlsl";
    sphericalHarmonicsSha256: "ad654583b2dffc159ebad16383d560f6e710d1b2fe87aa18e1a47596cb0261da";
    sphericalHarmonicsUpload: "Runtime/Utilities/BatchRendererGroupGlobals.cs";
    sphericalHarmonicsUploadSha256: "bb5c52577e4fab32bc1b9d39c252992faec1c6879cc8ac53b612fd938f8f1842";
    sceneManifest: "assets-local/reference-environment/environment-capture-current/scene-manifest.json";
    sceneManifestSha256: "762ac1e90938e2d793618163dc150990f8c03ccdb02fedde70646c7244170179";
    sceneDocument: "Assets/ToonLab/Demo/EnvironmentReferenceScene.toonlab";
    sceneDocumentSha256: "a024b1a62a99f054dbd3a700c5d1707e4b90498f37d64a375f8c39f222bce58b";
    pipelinePackage: "@call-me-sensei/toonlab/environment";
}>;
/**
 * Renderer-boundary conventions accepted by the ToonLab BRDF.
 *
 * Both indirect adapters consume Three's physical, cosine-convolved
 * irradiance and divide by PI exactly once. Direct inputs also require an
 * explicit boundary. ToonLab Stage removes its deliberate PI pre-scale to
 * recover TOONLAB light radiance. The ToonLab source stage divides raw ToonLab radiance by
 * PI because ToonLab Default Lit contains Lambert's 1 / PI while literal TOONLAB Lit
 * does not. Without that cross-engine conversion ToonLab-derived rocks become
 * PI times brighter than the ToonLab materials they replace.
 */
export const TOONLAB_SURFACE_INPUT_ADAPTERS: Readonly<{
    toonLabStage: Readonly<{
        directInput: "ToonLab Light radiance pre-multiplied by PI for stock Three Lambert coexistence";
        directNormalization: number;
        id: "toonlab-stage";
        indirectInput: "ToonLab bakedGI pre-multiplied by PI before entering Three irradiance";
        indirectNormalization: number;
    }>;
    toonLabCapturedSceneSh: Readonly<{
        directInput: "raw ToonLab source-stage analytic-light radiance using ToonLab Lambert energy convention";
        directNormalization: number;
        id: "toonlab-captured-scene-sh";
        indirectInput: "Three LightProbe cosine-convolved irradiance from the ToonLab captured-scene SH";
        indirectNormalization: number;
    }>;
}>;
export const TOONLAB_SURFACE_LIGHTING_CONTRACT: Readonly<{
    source: "ToonLab renderer ShaderLibrary/BRDF.hlsl + Lighting.hlsl";
    directDiffuse: "radiance * BRDFData.diffuse (no 1/PI)";
    indirectDiffuse: "bakedGI * BRDFData.diffuse (no 1/PI)";
    directSpecular: "TOONLAB DirectBRDFSpecular optimized GGX";
    shadowFill: "authored fraction of the sun retained where the package sun-shadow pass reports occlusion (0 = TOONLAB literal)";
    defaultInputAdapter: "toonlab-stage";
    inputNormalization: "direct radiance and cosine-convolved indirect irradiance are normalized independently";
    threeLightInputScaleInverse: number;
    dielectricSpecular: 0.04;
    environmentReflections: Readonly<{
        activeContribution: "black";
        customReflection: any;
        defaultMode: "Skybox";
        reflectionBounces: 1;
        reflectionIntensity: 1;
        skyboxMaterial: any;
    }>;
}>;
export class ToonLabSurfaceLightingModel extends PhysicalLightingModel {
    constructor({ diffuseAlphaNode, directStrength, indirectStrength, indirectTint, indirectTintNode, indirectReplaceTintNode, indirectTintBlendNode, indirectTintMode, inputAdapter, perceptualRoughnessNode, shadowFill, shadowFillTint, useSharedSunShadow, specularF0Node, workflow, }?: {
        diffuseAlphaNode?: import("three/webgpu").VarNode<"float", import("three/webgpu").ConstNode<"float", number>>;
        directStrength?: number;
        indirectStrength?: number;
        indirectTint?: number[];
        indirectTintNode?: any;
        indirectReplaceTintNode?: any;
        indirectTintBlendNode?: any;
        indirectTintMode?: string;
        inputAdapter?: "toonlab-stage";
        perceptualRoughnessNode?: import("three/webgpu").MaterialNode;
        shadowFill?: number;
        shadowFillTint?: number[];
        useSharedSunShadow?: boolean;
        specularF0Node?: import("three/webgpu").MaterialNode;
        workflow?: string;
    });
    diffuseAlphaNode: import("three/webgpu").VarNode<"float", import("three/webgpu").ConstNode<"float", number>>;
    directStrength: import("three/webgpu").VarNode<"float", import("three/webgpu").ConstNode<"float", number>>;
    indirectStrength: import("three/webgpu").VarNode<"float", import("three/webgpu").ConstNode<"float", number>>;
    indirectTint: import("three/webgpu").VarNode<"vec3", import("three/webgpu").ConstNode<"vec3", import("three").Vector3>>;
    indirectReplaceTint: import("three/webgpu").VarNode<"vec3", import("three/webgpu").ConstNode<"vec3", import("three").Vector3>>;
    indirectTintBlend: any;
    indirectTintMode: string;
    inputAdapter: Readonly<{
        directInput: "ToonLab Light radiance pre-multiplied by PI for stock Three Lambert coexistence";
        directNormalization: number;
        id: "toonlab-stage";
        indirectInput: "ToonLab bakedGI pre-multiplied by PI before entering Three irradiance";
        indirectNormalization: number;
    }> | Readonly<{
        directInput: "raw ToonLab source-stage analytic-light radiance using ToonLab Lambert energy convention";
        directNormalization: number;
        id: "toonlab-captured-scene-sh";
        indirectInput: "Three LightProbe cosine-convolved irradiance from the ToonLab captured-scene SH";
        indirectNormalization: number;
    }>;
    perceptualRoughnessNode: import("three/webgpu").MaterialNode;
    shadowFill: number;
    shadowFillTint: number[];
    useSharedSunShadow: boolean;
    workflow: string;
    specularF0Node: import("three/webgpu").MaterialNode;
    direct({ lightDirection, lightColor, lightNode, reflectedLight }: {
        lightDirection: any;
        lightColor: any;
        lightNode: any;
        reflectedLight: any;
    }): void;
    indirectDiffuse(builder: any): void;
    indirectSpecular(): void;
}
import { PhysicalLightingModel } from 'three/webgpu';
