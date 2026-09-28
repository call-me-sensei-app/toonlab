/**
 * Installs the deterministic capture boundary shared by visual fixtures.
 * Interactive scenes do not pay for or expose this path unless enabled.
 */
export function installGoldenSceneCapture(state, { enabled = false } = {}) {
  if (!enabled) return null;
  let captureCamera = null;
  let frozenPng = null;
  let goldenFrame = 0;
  state.setFrameloop('never');

  const advanceFrames = async (count = 1) => {
    for (let index = 0; index < count; index += 1) {
      goldenFrame += 1;
      state.advance(goldenFrame / 60, true);
      // WebGPU rendering is asynchronous. A native frame lets every submitted
      // package pass present before the next deterministic simulation tick.
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  };

  const present = async () => {
    const activeCamera = captureCamera ?? state.camera;
    // Drain any queued interactive invalidation first, then snapshot directly
    // after the explicit review-camera render. A second RAF here allowed the
    // host loop to overwrite the canvas with its controller camera.
    await new Promise((resolve) => requestAnimationFrame(resolve));
    if (typeof state.gl.renderAsync === 'function') {
      await state.gl.renderAsync(state.scene, activeCamera);
    } else {
      state.gl.render(state.scene, activeCamera);
    }
  };

  const api = {
    advanceFrames,
    present,
    async freeze(pose = null) {
      await advanceFrames(1);
      // Controller subscriptions run during advance. The review camera is a
      // clone applied afterwards, so physics settling cannot move it.
      if (pose?.position && pose?.target) {
        captureCamera = state.camera.clone();
        captureCamera.position.fromArray(pose.position);
        captureCamera.lookAt(...pose.target);
        captureCamera.updateMatrixWorld(true);
      }
      await present();
      const source = state.gl.domElement;
      const snapshot = document.createElement('canvas');
      snapshot.width = source.width;
      snapshot.height = source.height;
      snapshot.getContext('2d').drawImage(source, 0, 0);
      frozenPng = snapshot.toDataURL('image/png');
      document.body.dataset.goldenCaptureFrozen = 'true';
    },
    readPng() {
      if (!frozenPng) throw new Error('Golden frame has not been frozen.');
      return frozenPng;
    },
    getState() {
      const camera = captureCamera ?? state.camera;
      return {
        camera: {
          position: camera.position.toArray(),
          quaternion: camera.quaternion.toArray(),
        },
        frame: goldenFrame,
        frozen: Boolean(frozenPng),
      };
    },
  };
  window.__toonlabGoldenCapture = api;
  return api;
}
