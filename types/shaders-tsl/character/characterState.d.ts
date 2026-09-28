/** The float texture bound until a render pass supplies its own. */
export function characterPassFallbackTexture(): any;
export function createCharacterShadingState(): {
    headForward: import("three/webgpu").UniformNode<"vec3", THREE.Vector3>;
    headPosition: import("three/webgpu").UniformNode<"vec3", THREE.Vector3>;
    headRestForward: import("three/webgpu").UniformNode<"vec3", THREE.Vector3>;
    headRestUp: import("three/webgpu").UniformNode<"vec3", THREE.Vector3>;
    headSphereCenter: import("three/webgpu").UniformNode<"vec3", THREE.Vector3>;
    headUp: import("three/webgpu").UniformNode<"vec3", THREE.Vector3>;
    headReady: import("three/webgpu").UniformNode<"float", number>;
    depthMap: import("three/webgpu").TextureNode<"vec4">;
    depthReady: import("three/webgpu").UniformNode<"float", number>;
    shadowMap: import("three/webgpu").TextureNode<"vec4">;
    shadowMatrix: import("three/webgpu").UniformNode<"mat4", THREE.Matrix4>;
    shadowDepthRange: import("three/webgpu").UniformNode<"float", number>;
    shadowMapSize: import("three/webgpu").UniformNode<"float", number>;
    shadowDirection: import("three/webgpu").UniformNode<"vec3", THREE.Vector3>;
    shadowReady: import("three/webgpu").UniformNode<"float", number>;
    faceFrame: any;
    materials: Set<any>;
};
/** The state shared by `root`'s materials, created on first use. */
export function characterShadingStateFor(root: any): any;
export function peekCharacterShadingState(root: any): any;
export function bindMaterialToCharacterState(material: any, state: any): void;
export function characterStateOfMaterial(material: any): any;
import * as THREE from 'three';
