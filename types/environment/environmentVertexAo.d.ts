export function bakeEnvironmentVertexAo(meshes: any, { occluderRoot, environmentBox, rayCount, maxDistance, vertexBudget, occlusionFloor, sliceSize, onProgress, shouldContinue, }?: {
    occluderRoot?: any;
    environmentBox?: any;
    rayCount?: number;
    maxDistance?: any;
    vertexBudget?: number;
    occlusionFloor?: number;
    sliceSize?: number;
    onProgress?: any;
    shouldContinue?: () => boolean;
}): Promise<{
    aborted: boolean;
    bakedMeshCount: number;
    skippedMeshCount: number;
} | {
    bakedMeshCount: number;
    skippedMeshCount: number;
}>;
