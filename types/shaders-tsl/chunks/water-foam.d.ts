export function createWaterFoamChunk({ u, foamOctaves }: {
    u: any;
    foamOctaves: any;
}): {
    foamShape: (rawMask: any, restXZ: any, time: any) => import("three/webgpu").Node<"float">;
    shoreFoam: (columnDepth: any, viewDepthDiff: any, restXZ: any, time: any, pierce: any) => import("three/webgpu").VarNode<"float", import("three/webgpu").VarNode<"float", import("three/webgpu").ConstNode<"float", number>>>;
    whitecaps: (crest: any, gerstnerNormalY: any, restXZ: any, time: any) => import("three/webgpu").VarNode<"float", import("three/webgpu").VarNode<"float", import("three/webgpu").ConstNode<"float", number>>>;
};
