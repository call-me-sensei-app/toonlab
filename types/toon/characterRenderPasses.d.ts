/**
 * Creates the character render passes for one scene and camera. Call
 * `update()` every frame before rendering the scene, `setSize()` when the
 * drawing buffer changes.
 * @param {{ camera: THREE.Camera, renderer: any, scene: THREE.Scene, shadowMapSize?: number, shadowMargin?: number, [option: string]: any }} options
 */
export function createCharacterRenderPasses({ camera, renderer, scene, shadowMapSize, shadowMargin, }?: {
    camera: THREE.Camera;
    renderer: any;
    scene: THREE.Scene;
    shadowMapSize?: number;
    shadowMargin?: number;
    [option: string]: any;
}): {
    readonly characterMaskTexture: any;
    readonly depthTexture: any;
    dispose: () => void;
    readonly registeredRoots: any[];
    registerCharacterRoot: (root: any) => {
        localBox: THREE.Box3;
        localSphere: THREE.Sphere;
        meshes: any[];
        root: any;
        sphereInHead: any;
        states: Set<any>;
        tracker: {
            headBone: any;
            state: {
                forward: THREE.Vector3;
                position: THREE.Vector3;
                up: THREE.Vector3;
            };
            update(): void;
        };
    };
    setCharacterMaskEnabled: (enabled?: boolean) => boolean;
    setSize: (width: any, height: any, pixelRatio?: number) => void;
    readonly shadowTexture: any;
    TOON_CHARACTER_LAYER: number;
    unregisterCharacterRoot: (root: any) => boolean;
    update: () => void;
};
/** Render layer the registered characters' meshes join (shadow map, mask). */
export const TOON_CHARACTER_LAYER: 30;
import * as THREE from 'three';
