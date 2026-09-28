export function computeBreakingDepth(settings: any, waveEnergy: any): number;
export function shouldUseDedicatedBreakerShell(settings: any, hasBedSampler?: boolean): boolean;
export function extractBreakLineChains({ bedSampler, originX, originZ, surfaceY, width, depth, breakDepth, waveDirX, waveDirZ, }: {
    bedSampler: any;
    originX: any;
    originZ: any;
    surfaceY: any;
    width: any;
    depth: any;
    breakDepth: any;
    waveDirX: any;
    waveDirZ: any;
}): any[];
export class WaterBreakerSystem extends THREE.Group<THREE.Object3DEventMap> {
    constructor();
    chains: any[];
    columns: any[];
    waves: any;
    params: {
        amount: number;
        curl: any;
        scale: any;
        peel: any;
        setPair: boolean;
    };
    time: number;
    material: import("three/webgpu").NodeMaterial;
    mesh: THREE.Mesh<THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>, import("three/webgpu").NodeMaterial, THREE.Object3DEventMap>;
    attachWaveUniforms(sourceMaterial: any): this;
    configure(settings: any, waveEnergy: any, waves?: any): this;
    rebuild({ bedSampler, originX, originZ, surfaceY, width, depth, settings, waveEnergy, waves }: {
        bedSampler: any;
        originX: any;
        originZ: any;
        surfaceY: any;
        width: any;
        depth: any;
        settings: any;
        waveEnergy: any;
        waves: any;
    }): this;
    update(time: any): this;
    sampleAt(x: any, z: any, result: any): any;
    dispose(): void;
}
import * as THREE from 'three';
