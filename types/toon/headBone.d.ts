export function findHeadBone(root: any): any;
/**
 * The character's forward direction in its root's own frame: +Z by
 * convention, or `root.userData.toonForward` where the importer says
 * otherwise (three-vrm turns VRM 0.x models 180° on the root).
 */
export function characterForward(root: any): THREE.Vector3;
/**
 * World → character frame: the root's frame turned about +Y so the character
 * faces +Z (the frame head-space bakes and classifiers work in).
 */
export function characterFrameInverse(root: any): THREE.Matrix4;
/** Character frame → root's own frame (for positions stored on the root). */
export function characterFrameToRoot(root: any): THREE.Matrix4;
/**
 * The head bone, or — for an unrigged model whose head was located by
 * automatic roles (`root.userData.toonHeadEstimate`) — a rigid anchor object
 * placed at the estimated head centre under the root, so head-space face
 * lighting has a frame to follow.
 */
export function findOrCreateHeadAnchor(root: any): any;
export function createHeadTracker(root: any, { forward, up }?: {
    forward?: THREE.Vector3;
    up?: THREE.Vector3;
}): {
    headBone: any;
    state: {
        forward: THREE.Vector3;
        position: THREE.Vector3;
        up: THREE.Vector3;
    };
    update(): void;
};
import * as THREE from 'three';
