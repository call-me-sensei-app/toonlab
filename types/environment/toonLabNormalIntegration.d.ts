/** ToonLab UnpackNormalMapRGorAG over the raw source texture sample. */
export function decodeToonLabNormalNode(sampleNode: any, greenSign?: number): import("three/webgpu").VarNode<"vec3", import("three/webgpu").JoinNode<"vec3">>;
/** ToonLab graph Normal Strength node, including its sub-one Z interpolation. */
export function applyToonLabNormalStrengthNode(input: any, strength: any): import("three/webgpu").VarNode<"vec3", import("three/webgpu").JoinNode<"vec3">>;
/** TOONLAB UnpackNormalScale: scale decoded XY while retaining reconstructed Z. */
export function applyToonLabNormalScaleNode(input: any, strength: any): import("three/webgpu").VarNode<"vec3", import("three/webgpu").ConstNode<"vec3", import("three").Vector3>>;
/** CPU mirror used by deterministic source-integration gates. */
export function decodeToonLabNormalSample(sample: any, { flipGreenChannel, strength, strengthMode, }?: {
    flipGreenChannel?: boolean;
    strength?: number;
    strengthMode?: string;
}): number[];
/** Map a tangent-space normal through an exported glTF tangent basis. */
export function toonLabTangentNormalToWorld({ normal, tangent, tangentNormal, }?: {}): number[];
export function reflectToonLabVector(vector: any, zSign?: number): any[];
export function createToonLabNormalIntegrationMetadata({ coordinateZSign, decode, family, flipGreenChannel, textureFlipY, }?: {
    coordinateZSign?: number;
    decode?: string;
    flipGreenChannel?: any;
}): {
    coordinateZSign: number;
    decode: string;
    family: any;
    flipGreenChannel: any;
    outputSpace: string;
    tangentBasis: string;
    textureFlipY: boolean;
};
export const TOONLAB_NORMAL_INTEGRATION_CONTRACT: any;
