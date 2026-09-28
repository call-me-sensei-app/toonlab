import * as THREE from 'three';

import { setEnvironmentAmbientProbeColors } from './environmentShaderMaterials.js';

// Six-direction ambient probe: renders the scene along ±X/±Y/±Z from one
// point (typically the room center at head height), averages each view to a
// single color, and publishes the result to every environment material via
// the shared ambientProbe uniform. One capture, no per-frame cost — refresh
// explicitly when lighting changes (time of day, lamps toggled).

const PROBE_DIRECTIONS = [
  { look: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0) },
  { look: new THREE.Vector3(-1, 0, 0), up: new THREE.Vector3(0, 1, 0) },
  { look: new THREE.Vector3(0, 1, 0), up: new THREE.Vector3(0, 0, -1) },
  { look: new THREE.Vector3(0, -1, 0), up: new THREE.Vector3(0, 0, 1) },
  { look: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0) },
  { look: new THREE.Vector3(0, 0, -1), up: new THREE.Vector3(0, 1, 0) },
];

function averageProbePixels(pixels, resolution, intensity) {
  let r = 0;
  let g = 0;
  let b = 0;
  const pixelCount = resolution * resolution;
  for (let i = 0; i < pixelCount; i += 1) {
    r += pixels[i * 4];
    g += pixels[i * 4 + 1];
    b += pixels[i * 4 + 2];
  }
  const scale = intensity / (pixelCount * 255);
  return new THREE.Color(r * scale, g * scale, b * scale);
}

/**
 * On the classic renderer this is fully synchronous and returns the colors.
 * On the node backends (WebGPU / forced WebGL2) pixel readback is async, so
 * it returns a Promise<colors>; `apply` publishes to the environment
 * materials either way, so fire-and-forget callers work on both.
 */
// Node backends keep one cached probe target per renderer: disposing the
// target immediately after the async readback races WebGPU's deferred
// command submission (validation: "buffer used in submit while destroyed").
const nodeBackendProbeTargets = new WeakMap();

export function captureEnvironmentAmbientProbe({
  renderer,
  scene,
  position = new THREE.Vector3(),
  near = 0.05,
  far = 200,
  resolution = 16,
  // Scales the averaged colors before publishing; 1 keeps the scene's own
  // brightness.
  intensity = 1,
  apply = true,
} = {}) {
  if (!renderer || !scene) return null;

  const isNodeBackend = Boolean(renderer.isWebGPURenderer);
  let renderTarget = null;
  if (isNodeBackend) {
    const atlasWidth = resolution * PROBE_DIRECTIONS.length;
    const cached = nodeBackendProbeTargets.get(renderer);
    if (cached?.width === atlasWidth) {
      renderTarget = cached;
    } else {
      cached?.dispose();
      renderTarget = new THREE.WebGLRenderTarget(atlasWidth, resolution, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
      });
      nodeBackendProbeTargets.set(renderer, renderTarget);
    }
  } else {
    renderTarget = new THREE.WebGLRenderTarget(resolution, resolution, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
  }
  const probeCamera = new THREE.PerspectiveCamera(90, 1, near, far);
  probeCamera.position.copy(position);

  const colors = [];

  const currentRenderTarget = renderer.getRenderTarget();
  const currentXrEnabled = renderer.xr.enabled;
  renderer.xr.enabled = false;

  const finish = () => {
    renderer.setRenderTarget(currentRenderTarget);
    renderer.xr.enabled = currentXrEnabled;
    if (!isNodeBackend) renderTarget.dispose();
    // The camera looking along +X sees the -X half of the room; a surface
    // normal pointing +X is lit by what lies in that view. So the probe slot
    // for +X normals is the +X-looking capture directly.
    if (apply) setEnvironmentAmbientProbeColors(colors);
    return colors;
  };

  const aimCamera = (direction) => {
    probeCamera.up.copy(direction.up);
    probeCamera.lookAt(position.clone().add(direction.look));
    probeCamera.updateMatrixWorld();
  };

  if (renderer.isWebGPURenderer) {
    // All six faces render back-to-back into one 6-tile atlas within a single
    // JS tick, then ONE async readback: awaiting between renders lets main
    // frames interleave, and the render-object revalidation that follows
    // destroys probe-context buffers while earlier probe submits are still
    // queued (WebGPU validation: "used in submit while destroyed").
    return (async () => {
      const previousAutoClear = renderer.autoClear;
      renderer.setRenderTarget(renderTarget);
      renderer.setScissorTest?.(false);
      renderer.clear();
      // One manual clear for the whole atlas; per-render autoClear would wipe
      // the previously rendered tiles.
      renderer.autoClear = false;
      PROBE_DIRECTIONS.forEach((direction, index) => {
        aimCamera(direction);
        renderer.setViewport(index * resolution, 0, resolution, resolution);
        renderer.render(scene, probeCamera);
      });
      renderer.autoClear = previousAutoClear;
      const pixels = await renderer.readRenderTargetPixelsAsync(
        renderTarget, 0, 0, resolution * PROBE_DIRECTIONS.length, resolution,
      );
      const atlasWidth = resolution * PROBE_DIRECTIONS.length;
      for (let index = 0; index < PROBE_DIRECTIONS.length; index += 1) {
        let r = 0;
        let g = 0;
        let b = 0;
        for (let y = 0; y < resolution; y += 1) {
          for (let x = 0; x < resolution; x += 1) {
            const p = (y * atlasWidth + index * resolution + x) * 4;
            r += pixels[p];
            g += pixels[p + 1];
            b += pixels[p + 2];
          }
        }
        const scale = intensity / (resolution * resolution * 255);
        colors.push(new THREE.Color(r * scale, g * scale, b * scale));
      }
      renderer.setViewport(0, 0, renderer.domElement.width, renderer.domElement.height);
      return finish();
    })();
  }

  const pixels = new Uint8Array(resolution * resolution * 4);
  for (const direction of PROBE_DIRECTIONS) {
    aimCamera(direction);
    renderer.setRenderTarget(renderTarget);
    renderer.clear();
    renderer.render(scene, probeCamera);
    renderer.readRenderTargetPixels(renderTarget, 0, 0, resolution, resolution, pixels);
    colors.push(averageProbePixels(pixels, resolution, intensity));
  }
  return finish();
}
