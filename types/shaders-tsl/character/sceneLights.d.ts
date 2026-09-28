/** The main light's view-space direction (toward the light), normalised. */
export function getMainLightDirection(): import("three/webgpu").Node<"vec3">;
/** The main light's world-space direction (toward the light), normalised. */
export function getMainLightDirectionWorld(): import("three/webgpu").Node<"vec3">;
/**
 * The scene's main directional light: the visible one marked
 * `userData.toonMainLight`, else the brightest visible one.
 */
export function findToonMainLight(scene: any): any;
/**
 * Mirrors the scene's lights into the shared uniforms. Cheap to call from
 * every mesh's onBeforeRender: it re-collects only when the scene, camera or
 * frame changed. Pass `renderer` when available.
 */
export function syncToonSceneLights(scene: any, camera: any, renderer?: any): boolean;
/** Unconditionally re-collects the scene's lights into the shared uniforms. */
export function collectToonSceneLights(scene: any, camera: any): {
    ambientLightColor: import("three/webgpu").UniformNode<"color", THREE.Color>;
    hasHemisphereLight: import("three/webgpu").UniformNode<"float", number>;
    hasMainLight: import("three/webgpu").UniformNode<"float", number>;
    hemisphereGroundColor: import("three/webgpu").UniformNode<"color", THREE.Color>;
    hemisphereSkyColor: import("three/webgpu").UniformNode<"color", THREE.Color>;
    hemisphereUpWorld: import("three/webgpu").UniformNode<"vec3", THREE.Vector3>;
    mainLightColor: import("three/webgpu").UniformNode<"color", THREE.Color>;
    mainLightDirection: import("three/webgpu").UniformNode<"vec3", THREE.Vector3>;
    mainLightDirectionWorld: import("three/webgpu").UniformNode<"vec3", THREE.Vector3>;
    pointLightColors: import("three/webgpu").UniformArrayNode<string>;
    pointLightCount: import("three/webgpu").UniformNode<"float", number>;
    pointLightParams: import("three/webgpu").UniformArrayNode<string>;
    pointLightPositions: import("three/webgpu").UniformArrayNode<string>;
    pointLightPositionsWorld: import("three/webgpu").UniformArrayNode<string>;
    spotLightColors: import("three/webgpu").UniformArrayNode<string>;
    spotLightCount: import("three/webgpu").UniformNode<"float", number>;
    spotLightDirections: import("three/webgpu").UniformArrayNode<string>;
    spotLightDirectionsWorld: import("three/webgpu").UniformArrayNode<string>;
    spotLightParams: import("three/webgpu").UniformArrayNode<string>;
    spotLightPositions: import("three/webgpu").UniformArrayNode<string>;
    spotLightPositionsWorld: import("three/webgpu").UniformArrayNode<string>;
};
export const MAX_TOON_POINT_LIGHTS: 4;
export const MAX_TOON_SPOT_LIGHTS: 4;
export namespace toonSceneLights {
    let ambientLightColor: import("three/webgpu").UniformNode<"color", THREE.Color>;
    let hasHemisphereLight: import("three/webgpu").UniformNode<"float", number>;
    let hasMainLight: import("three/webgpu").UniformNode<"float", number>;
    let hemisphereGroundColor: import("three/webgpu").UniformNode<"color", THREE.Color>;
    let hemisphereSkyColor: import("three/webgpu").UniformNode<"color", THREE.Color>;
    let hemisphereUpWorld: import("three/webgpu").UniformNode<"vec3", THREE.Vector3>;
    let mainLightColor: import("three/webgpu").UniformNode<"color", THREE.Color>;
    let mainLightDirection: import("three/webgpu").UniformNode<"vec3", THREE.Vector3>;
    let mainLightDirectionWorld: import("three/webgpu").UniformNode<"vec3", THREE.Vector3>;
    let pointLightColors: import("three/webgpu").UniformArrayNode<string>;
    let pointLightCount: import("three/webgpu").UniformNode<"float", number>;
    let pointLightParams: import("three/webgpu").UniformArrayNode<string>;
    let pointLightPositions: import("three/webgpu").UniformArrayNode<string>;
    let pointLightPositionsWorld: import("three/webgpu").UniformArrayNode<string>;
    let spotLightColors: import("three/webgpu").UniformArrayNode<string>;
    let spotLightCount: import("three/webgpu").UniformNode<"float", number>;
    let spotLightDirections: import("three/webgpu").UniformArrayNode<string>;
    let spotLightDirectionsWorld: import("three/webgpu").UniformArrayNode<string>;
    let spotLightParams: import("three/webgpu").UniformArrayNode<string>;
    let spotLightPositions: import("three/webgpu").UniformArrayNode<string>;
    let spotLightPositionsWorld: import("three/webgpu").UniformArrayNode<string>;
}
/** Zero vector node, handy for disabled light inputs. */
export const NO_LIGHT: import("three/webgpu").VarNode<"vec3", import("three/webgpu").ConstNode<"vec3", THREE.Vector3>>;
import * as THREE from 'three';
