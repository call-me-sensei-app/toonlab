/**
 * Scatters shrubs and rosettes around an existing forest distribution. The
 * forest is the canopy layer, shrubs become understory, and the ordinary
 * grass field remains ground cover. Counts are hard-capped for predictable
 * open-world budgets.
 */
export function scatterUnderstory({ forestPlacements, heightAt, mask, seed, shrubsPerTree, groundCoverPerTree, maxShrubs, maxGroundCover, }?: {
    forestPlacements?: any[];
    heightAt?: any;
    mask?: any;
    seed?: number;
    shrubsPerTree?: number;
    groundCoverPerTree?: number;
    maxShrubs?: number;
    maxGroundCover?: number;
}): {
    groundCover: any[];
    shrubs: any[];
};
export const UNDERSTORY_AERIAL_FADE: Readonly<{
    end: 0.5;
    start: 0.24;
}>;
export class StylizedUnderstory extends THREE.Group<THREE.Object3DEventMap> {
    constructor({ groundCover, shrubs, seed, shrubPalette, groundPalette, shrubScaleRange, groundScaleRange, styleTarget, }?: {
        groundCover?: any[];
        shrubs?: any[];
        seed?: number;
        shrubPalette?: number[];
        groundPalette?: number[];
        shrubScaleRange?: number[];
        groundScaleRange?: number[];
        styleTarget?: {};
    });
    shrubCount: number;
    groundCoverCount: number;
    _geometries: THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>[];
    _materials: THREE.MeshStandardMaterial[];
    _cameraDirection: THREE.Vector3;
    shrubs: THREE.InstancedMesh<any, any, THREE.InstancedMeshEventMap>;
    groundCover: THREE.InstancedMesh<any, any, THREE.InstancedMeshEventMap>;
    /**
     * Understory is a gameplay-distance layer. As the camera pitches into an
     * aerial view, its tiny projected plants become visual dirt rather than a
     * readable height layer, so fade them before minification reaches a pixel.
     */
    update(camera: any): this;
    dispose(): void;
}
import * as THREE from 'three';
