export class WaterKelpField extends THREE.Mesh<THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>, THREE.Material<THREE.MaterialEventMap> | THREE.Material<THREE.MaterialEventMap>[], THREE.Object3DEventMap> {
    constructor({ placements, heightRange, widthRange, swayAmplitude, kelpColor, kelpShadeColor, shadowStrength, seed, }?: {
        placements?: any[];
        heightRange?: number[];
        widthRange?: number[];
        swayAmplitude?: number;
        kelpColor?: number[];
        kelpShadeColor?: number[];
        shadowStrength?: number;
        seed?: number;
    });
    setFlow(flowDirection: any, flowSpeed: any): this;
    update(delta: any): this;
    dispose(): void;
}
import * as THREE from 'three';
