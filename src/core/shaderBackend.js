// Active shader backend for the material factories in src/.
//
// 'tsl'  — WebGPURenderer (WebGPU or forced-WebGL2 backend) + NodeMaterial.
//
// The renderer factory sets this at boot, BEFORE any material factory runs.
// TSL is also the module default so setup utilities that create materials
// before renderer construction still land on the supported path.

let activeShaderBackend = 'tsl';

export function setActiveShaderBackend(backend) {
  if (backend !== 'tsl') {
    console.warn(`Unsupported shader backend "${backend}"; using TSL.`);
  }
  activeShaderBackend = 'tsl';
}

export function getActiveShaderBackend() {
  return activeShaderBackend;
}

export function isTslBackend() {
  return true;
}
