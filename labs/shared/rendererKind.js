// `?renderer=` flag tokens.
// Dependency-free so labs/shared/entry.js can stamp the kind before any lab
// (and its three.js imports) loads. Renderer creation for a kind lives in
// rendererFactory.js.
//
//   absent / `renderer=webgpu`  → TSL via WebGPURenderer WebGPU backend
//   `renderer=webgl`            → TSL via WebGPURenderer forceWebGL
//   `renderer=webgpu-forced-gl` → compatibility alias for `renderer=webgl`

export const RENDERER_KINDS = Object.freeze([
  'webgpu',
  'webgl',
  'webgpu-forced-gl',
]);

export const RENDERER_SWITCHER_KINDS = Object.freeze([
  'webgpu',
  'webgl',
]);

export function resolveRendererKind(search = window.location.search) {
  const raw = (new URLSearchParams(search).get('renderer') || 'webgpu').toLowerCase();
  return RENDERER_KINDS.includes(raw) ? raw : 'webgpu';
}

export function isTslWebGlRendererKind(kind) {
  return kind === 'webgl' || kind === 'webgpu-forced-gl';
}
