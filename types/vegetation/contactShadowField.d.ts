export const CONTACT_SHADOW_AERIAL_FADE: Readonly<{
    end: 0.68;
    start: 0.34;
}>;
/**
 * One-draw soft contact pools for vegetation and rocks. The low opacity and
 * cool sky tint are deliberate: these anchor objects without ever becoming
 * the pitch-black decals that stylized outdoor scenes commonly inherit.
 */
export class StylizedContactShadowField extends THREE.InstancedMesh<THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>, THREE.Material<THREE.MaterialEventMap> | THREE.Material<THREE.MaterialEventMap>[], THREE.InstancedMeshEventMap> {
    constructor({ placements, color, opacity }?: {
        placements?: any[];
        color?: number;
        opacity?: number;
    });
    _alphaMap: THREE.DataTexture;
    _baseOpacity: number;
    _cameraDirection: THREE.Vector3;
    /**
     * Contact pools are a gameplay-range grounding cue. From steep flyover and
     * top-down views they minify into dark one-pixel dirt, so fade the entire
     * bounded field as the camera turns downward.
     */
    update(camera: any): this;
}
import * as THREE from 'three';
