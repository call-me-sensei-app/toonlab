export function createWaterShoreStateChunk({ u }: {
    u: any;
}): {
    shoreStateCoverage: (worldXZ: any) => import("three/webgpu").VarNode<"vec3", import("three/webgpu").Node<"vec3">>;
    shoreStateSample: (worldXZ: any) => any;
    shoreStateUv: (worldXZ: any) => any;
};
