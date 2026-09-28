export class WaterRenderExtension {
    constructor(dynamics: any, extent: any);
    dynamics: any;
    xs: any[];
    zs: any[];
    geometry: THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>;
    states: Float32Array<ArrayBuffer>;
    normals: Float32Array<ArrayBuffer>;
    wetDistances: Float32Array<ArrayBuffer>;
    mesh: THREE.Mesh<THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>, any, THREE.Object3DEventMap>;
    sample: {};
    incoming(x: any, z: any, stepX?: number, stepZ?: number): number;
    update(): void;
    dispose(): void;
}
import * as THREE from 'three';
