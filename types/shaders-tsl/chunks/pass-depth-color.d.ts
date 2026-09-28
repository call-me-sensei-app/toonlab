export function createPassDepthColorMaterial({ alphaTest, map, side, quantize256, viewDepthPush, pushWeight, }?: {
    alphaTest?: number;
    map?: any;
    side?: 2;
    quantize256?: boolean;
    viewDepthPush?: number;
    pushWeight?: any;
}): {
    [x: string]: any;
    setupPosition(builder: any): any;
};
export function applyShadowClipAdjust(matrix: any, renderer: any): any;
export const PassBasicNodeMaterial: {
    new (): {
        [x: string]: any;
        setupPosition(builder: any): any;
    };
    [x: string]: any;
};
export const shadowClipAdjustWebGPU: THREE.Matrix4;
export const shadowClipAdjustGL: THREE.Matrix4;
import * as THREE from 'three';
