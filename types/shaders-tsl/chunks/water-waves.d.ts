export function createWaterWavesChunk({ wavesA, wavesB, waveCount }: {
    wavesA: any;
    wavesB: any;
    waveCount: any;
}): {
    gerstnerDisplacement: (restXZ: any, time: any) => import("three/webgpu").VarNode<"vec3", import("three/webgpu").VarNode<"vec3", import("three/webgpu").ConstNode<"vec3", import("three").Vector3>>>;
    gerstnerDisplacementFiltered: (restXZ: any, time: any, chopWeight: any, nearshore?: any) => import("three/webgpu").VarNode<"vec3", import("three/webgpu").VarNode<"vec3", import("three/webgpu").ConstNode<"vec3", import("three").Vector3>>>;
    gerstnerNormal: (restXZ: any, time: any) => {
        crest: import("three/webgpu").VarNode<"float", import("three/webgpu").Node<"float">>;
        normal: import("three/webgpu").VarNode<"vec3", import("three/webgpu").Node<"vec3">>;
    };
    gerstnerNormalFiltered: (restXZ: any, time: any, chopWeight: any, nearshore?: any) => {
        crest: import("three/webgpu").VarNode<"float", import("three/webgpu").Node<"float">>;
        normal: import("three/webgpu").VarNode<"vec3", import("three/webgpu").Node<"vec3">>;
    };
    gerstnerSwellHeight: (restXZ: any, time: any, nearshore?: any) => import("three/webgpu").VarNode<"float", import("three/webgpu").VarNode<"float", import("three/webgpu").ConstNode<"float", number>>>;
    primarySwellCycle: (time: any) => import("three/webgpu").Node<"float">;
};
