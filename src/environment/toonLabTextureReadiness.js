// First-frame upload guard for ToonLab-authored textures.
//
// WebGPU is stricter than WebGL about sampler readiness. In particular,
// setting `needsUpdate` on the placeholder returned by TextureLoader.load()
// increments the texture version while `texture.image` is still null. The
// backend then attempts to inspect `image.complete` during bind-group setup
// and fails before the first frame. ToonLab reconstruction loaders use this
// guard at their promise boundary so an adapter cannot accidentally turn a
// pending image into an uploadable texture.

function finiteDimension(value) {
  const dimension = Number(value);
  return Number.isFinite(dimension) && dimension > 0 ? dimension : 0;
}

function imageDimensions(image) {
  return {
    height: finiteDimension(
      image?.naturalHeight ?? image?.videoHeight ?? image?.height,
    ),
    width: finiteDimension(
      image?.naturalWidth ?? image?.videoWidth ?? image?.width,
    ),
  };
}

function inspectImage(image) {
  if (Array.isArray(image)) {
    if (image.length === 0) {
      return { ready: false, reason: 'empty-image-array' };
    }
    const faces = image.map(inspectImage);
    const failedFace = faces.findIndex((entry) => !entry.ready);
    return failedFace >= 0
      ? {
          ready: false,
          reason: `image-array-entry-${failedFace}-${faces[failedFace].reason}`,
        }
      : { ready: true, reason: 'decoded-image-array' };
  }
  if (!image) return { ready: false, reason: 'missing-image' };
  if (image.complete === false) {
    return { ready: false, reason: 'image-load-incomplete' };
  }
  if (Number.isFinite(Number(image.readyState))
      && Number(image.readyState) < 2) {
    return { ready: false, reason: 'video-frame-unavailable' };
  }
  const { height, width } = imageDimensions(image);
  if (!(width > 0 && height > 0)) {
    return { ready: false, reason: 'image-has-no-pixels', width, height };
  }
  // DataTexture/EXRLoader images expose a typed pixel payload. A null data
  // member is not equivalent to a decoded HTML image with no `data` member.
  if (Object.prototype.hasOwnProperty.call(image, 'data') && image.data == null) {
    return { ready: false, reason: 'pixel-data-missing', width, height };
  }
  return { ready: true, reason: 'decoded-image', width, height };
}

/**
 * Return a serializable WebGPU upload-readiness report for a THREE.Texture.
 * Render-target textures are GPU-owned and therefore do not require a CPU
 * image. Every other texture must expose decoded pixels and non-zero bounds.
 */
export function inspectToonLabTextureUploadReadiness(texture) {
  if (!texture?.isTexture) {
    return Object.freeze({
      ready: false,
      reason: 'not-a-three-texture',
    });
  }
  if (texture.isRenderTargetTexture) {
    return Object.freeze({
      name: texture.name || '',
      ready: true,
      reason: 'gpu-render-target-texture',
      uuid: texture.uuid,
      version: texture.version,
    });
  }
  const image = texture.source?.data ?? texture.image;
  const imageReport = inspectImage(image);
  return Object.freeze({
    ...imageReport,
    name: texture.name || '',
    uuid: texture.uuid,
    version: texture.version,
  });
}

/** Fail closed before any caller increments a pending texture's version. */
export function assertToonLabTextureUploadReady(texture, label = 'ToonLab texture') {
  const report = inspectToonLabTextureUploadReadiness(texture);
  if (!report.ready) {
    const error = new Error(
      `${label} is not decoded for its first WebGPU upload (${report.reason}). `
      + 'Custom texture loaders must return a Promise that resolves after image decode.',
    );
    error.name = 'ToonLabTextureNotReadyError';
    error.textureReadinessReport = report;
    throw error;
  }
  return texture;
}
