// Lab renderer factory — the single place that interprets the `?renderer=` flag.
//
// Renderer values:
//   absent / `renderer=webgpu`  → TSL via WebGPURenderer WebGPU backend
//   `renderer=webgl`            → TSL via WebGPURenderer forceWebGL
//   `renderer=webgpu-forced-gl` → compatibility alias for `renderer=webgl`
//
// WebGPURenderer construction is synchronous but its backend boots async, so
// callers keep a synchronous `const renderer = createLabRenderer(...)` and
// gate their first frame on `whenRendererReady(renderer)`.
//
// Automation contract (capture scripts assert these, do not rename):
//   document.body.dataset.rendererKind    — requested kind, set at creation
//   document.body.dataset.rendererBackend — actual backend after init:
//                                           'webgpu' | 'webgl2-fallback'

import { WebGPURenderer } from 'three/webgpu';
import {
  createToonLabRendererOptions,
  stabilizeToonLabWebGPUResourceLifetime,
} from '@call-me-sensei/toonlab/renderer';

import { setActiveShaderBackend } from '../../src/core/shaderBackend.js';
import {
  isTslWebGlRendererKind,
  resolveRendererKind,
} from './rendererKind.js';

export { RENDERER_KINDS, resolveRendererKind } from './rendererKind.js';

function reportBackend(renderer, kind) {
  if (typeof document === 'undefined') return;
  document.body.dataset.rendererKind = kind;
  if (renderer.backend?.isWebGPUBackend === true) {
    document.body.dataset.rendererBackend = 'webgpu';
  } else {
    document.body.dataset.rendererBackend = 'webgl2-fallback';
  }
}

/**
 * Creates the renderer for the resolved `?renderer=` kind. Synchronous —
 * WebGPU backend init starts immediately; await {@link whenRendererReady}
 * before the first render call.
 */
export function createLabRenderer(options = {}, kind = resolveRendererKind()) {
  const resolvedKind = kind === 'webgpu' || isTslWebGlRendererKind(kind) ? kind : 'webgpu';
  if (resolvedKind !== kind) {
    console.warn(`Unknown renderer kind "${kind}", falling back to WebGPU`);
  }
  setActiveShaderBackend('tsl');
  const renderer = new WebGPURenderer(createToonLabRendererOptions({
    ...options,
    forceWebGL: isTslWebGlRendererKind(resolvedKind),
  }));
  renderer.userData ??= {};
  renderer.userData.labRendererKind = resolvedKind;
  renderer.userData.labRendererReady = renderer
    .init()
    .then(() => {
      stabilizeToonLabWebGPUResourceLifetime(renderer);
      reportBackend(renderer, resolvedKind);
    });
  return renderer;
}

/** Resolves when the renderer can render. */
export function whenRendererReady(renderer) {
  return renderer?.userData?.labRendererReady ?? Promise.resolve();
}
