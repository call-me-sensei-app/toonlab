export class WaterRain extends THREE.Points<THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>, THREE.Material<THREE.MaterialEventMap> | THREE.Material<THREE.MaterialEventMap>[], THREE.Object3DEventMap> {
    constructor({ count, areaSize, fallHeight, speed, streakLength, wind, color, opacity, }?: {
        count?: number;
        areaSize?: number;
        fallHeight?: number;
        speed?: number;
        streakLength?: number;
        wind?: number[];
        color?: number[];
        opacity?: number;
    });
    setIntensity(intensity: any): this;
    intensity: number;
    update(delta: any, camera: any, renderer: any, waterLevel?: number): this;
    dispose(): void;
}
import * as THREE from 'three';
