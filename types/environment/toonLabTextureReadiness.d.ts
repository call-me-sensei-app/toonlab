/**
 * Return a serializable WebGPU upload-readiness report for a THREE.Texture.
 * Render-target textures are GPU-owned and therefore do not require a CPU
 * image. Every other texture must expose decoded pixels and non-zero bounds.
 */
export function inspectToonLabTextureUploadReadiness(texture: any): any;
/** Fail closed before any caller increments a pending texture's version. */
export function assertToonLabTextureUploadReady(texture: any, label?: string): any;
