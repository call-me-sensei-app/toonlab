/**
 * Applies storage-buffer skinning to positionLocal/normalLocal in place.
 * Call inside setupPosition (an active stack is required).
 */
export function applyToonStorageSkinning(skinnedMesh: any): void;
/**
 * Subclasses a node material so skinned meshes skin through the storage/PBO
 * path on non-WebGPU backends (built-in buffer skinning elsewhere). Used by
 * the anime material and by the character-pass depth/mask materials, which
 * render the same MMD-scale skeletons.
 */
export function withToonStorageSkinning(BaseNodeMaterial: any): {
    new (): {
        [x: string]: any;
        setupPosition(builder: any): any;
    };
    [x: string]: any;
};
/**
 * Per-frame CPU side: recompute bone matrices and re-upload the PBO texture.
 * Runs from the converted meshes' onBeforeRender (idempotent per frame).
 */
export function updateToonStorageSkinning(skinnedMesh: any): void;
