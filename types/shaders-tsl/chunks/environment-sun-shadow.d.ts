export function sunShadowMapNode(): any;
export function farSunShadowMapNode(): any;
export namespace environmentSunShadow {
    let bias: import("three/webgpu").UniformNode<"float", number>;
    let characterDepthBias: import("three/webgpu").UniformNode<"float", number>;
    let farMap: any;
    let farMapSize: import("three/webgpu").UniformNode<"float", number>;
    let farMatrix: import("three/webgpu").UniformNode<"mat4", THREE.Matrix4>;
    let farReady: import("three/webgpu").UniformNode<"float", number>;
    let map: any;
    let mapSize: import("three/webgpu").UniformNode<"float", number>;
    let matrix: import("three/webgpu").UniformNode<"mat4", THREE.Matrix4>;
    let normalBias: import("three/webgpu").UniformNode<"float", number>;
    let radius: import("three/webgpu").UniformNode<"float", number>;
    let ready: import("three/webgpu").UniformNode<"float", number>;
}
export const sampleEnvironmentSunShadow: import("three/src/nodes/TSL.js").FnNode<[], import("three/webgpu").VarNode<"float", import("three/webgpu").VarNode<"float", import("three/webgpu").ConstNode<"float", number>>>>;
export const sampleEnvironmentSunShadowWithNormal: import("three/src/nodes/TSL.js").FnNode<[], import("three/webgpu").VarNode<"float", import("three/webgpu").VarNode<"float", import("three/webgpu").ConstNode<"float", number>>>>;
import * as THREE from 'three';
