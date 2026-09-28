export function bakeFaceShadowMap(root: any, { isFaceMaterial, isWeightEligible, ...options }?: {}): {
    coveredTexels: number;
    noseMark: {
        center: any;
        drawn: boolean;
        evidence: {
            regionDarkest: number;
            regionDark: number;
            samples: number[];
            surroundMedian: number;
        };
        size: number[];
    };
    noseTip: THREE.Vector3Tuple;
    frame: {
        center: THREE.Vector3Tuple;
        extent: number;
    };
    meshes: any[];
    texture: THREE.DataTexture;
};
export const DEFAULT_FACE_SHADOW_BAKE: Readonly<{
    angles: 48;
    castElevation: 25;
    depthSize: 192;
    noseRadius: 0.32;
    sphereBlend: 0.9;
    size: 256;
    smoothRadius: 2;
}>;
import * as THREE from 'three';
