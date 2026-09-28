import {
  Color,
  NoToneMapping,
  PCFSoftShadowMap,
  SRGBColorSpace,
} from 'three';

export const TOONLAB_RENDERER_CONFIGURATION_VERSION = 1;

const WEBGPU_RESOURCE_RETIREMENT = new WeakMap();

const BACKENDS = Object.freeze({
  WEBGL: 'webgl',
  WEBGL2_FALLBACK: 'webgl2-fallback',
  WEBGPU: 'webgpu',
});

export const TOONLAB_RENDERER_BACKENDS = Object.freeze(Object.values(BACKENDS));

function finitePositive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function freezeRecord(value) {
  return Object.freeze({ ...value });
}

function waitForEncodedAndSubmittedWork(device, retire) {
  device.queue.onSubmittedWorkDone()
    .then(() => device.queue.onSubmittedWorkDone())
    .then(retire)
    .catch(() => {
      // Device loss already retires its allocations; no host recovery action
      // is possible or necessary for this old buffer.
    });
}

/**
 * Installs ToonLab's Three r185 WebGPU uniform-buffer retirement guard.
 *
 * Three can dispose a render object's uniform buffer while a same-frame
 * command encoder still references it. The guard detaches that retired buffer
 * from Three's binding record immediately, so reuse allocates a fresh buffer,
 * and destroys only the captured old GPUBuffer after encoded/submitted work
 * has drained. The installation is renderer-backend scoped and idempotent.
 */
export function stabilizeToonLabWebGPUResourceLifetime(renderer) {
  const backend = renderer?.backend;
  const existing = backend && WEBGPU_RESOURCE_RETIREMENT.get(backend);
  if (existing) return existing;
  const device = backend?.device;
  if (!backend?.destroyUniformBuffer || !device?.queue?.onSubmittedWorkDone) {
    return freezeRecord({ installed: false, reason: 'unsupported-backend' });
  }

  backend.destroyUniformBuffer = (uniformBuffer) => {
    const retiredBuffer = backend.get(uniformBuffer)?.buffer;
    // Delete the binding record now. If Three reuses this binding before the
    // queue drains, createUniformBuffer() must allocate a new GPUBuffer rather
    // than observe the allocation scheduled for retirement.
    backend.delete(uniformBuffer);
    if (!retiredBuffer) return;
    waitForEncodedAndSubmittedWork(device, () => {
      try {
        retiredBuffer.destroy();
      } catch {
        // Another owner may already have retired the allocation.
      }
    });
  };

  const status = freezeRecord({ installed: true, reason: null });
  WEBGPU_RESOURCE_RETIREMENT.set(backend, status);
  return status;
}

export function detectToonLabRendererBackend(renderer) {
  if (renderer?.isWebGPURenderer === true) {
    return renderer.backend?.isWebGPUBackend === true
      ? BACKENDS.WEBGPU
      : BACKENDS.WEBGL2_FALLBACK;
  }
  return BACKENDS.WEBGL;
}

export function createToonLabRendererOptions(options = {}) {
  return {
    antialias: true,
    ...options,
  };
}

export function createToonLabRendererProfile({
  clearAlpha,
  clearColor,
  devicePixelRatio = globalThis.devicePixelRatio ?? 1,
  maxPixelRatio = 2,
  minPixelRatio = 0.5,
  outputColorSpace = SRGBColorSpace,
  pixelRatio,
  shadows = 'auto',
  shadowType = PCFSoftShadowMap,
  toneMapping = NoToneMapping,
  toneMappingExposure = 1,
} = {}) {
  const minimum = finitePositive(minPixelRatio, 0.5);
  const maximum = Math.max(minimum, finitePositive(maxPixelRatio, 2));
  const requestedPixelRatio = finitePositive(pixelRatio, finitePositive(devicePixelRatio, 1));
  return freezeRecord({
    clearAlpha,
    clearColor,
    maxPixelRatio: maximum,
    minPixelRatio: minimum,
    outputColorSpace,
    pixelRatio: Math.min(maximum, Math.max(minimum, requestedPixelRatio)),
    shadows,
    shadowType,
    toneMapping,
    toneMappingExposure: Number.isFinite(Number(toneMappingExposure))
      ? Number(toneMappingExposure)
      : 1,
  });
}

function resolveNativeShadows(profile, backend, current) {
  if (profile.shadows === 'preserve') return current;
  if (typeof profile.shadows === 'boolean') return profile.shadows;
  if (profile.shadows !== 'auto') {
    throw new TypeError('Renderer shadows must be "auto", "preserve", true, or false.');
  }
  return backend !== BACKENDS.WEBGL2_FALLBACK;
}

function captureClearState(renderer) {
  if (typeof renderer.getClearColor !== 'function') return null;
  const color = renderer.getClearColor(new Color());
  return {
    alpha: typeof renderer.getClearAlpha === 'function' ? renderer.getClearAlpha() : undefined,
    color: color?.clone?.() ?? color,
  };
}

function restoreOptionalProperty(subject, key, snapshot) {
  if (snapshot.had) subject[key] = snapshot.value;
  else delete subject[key];
}

/**
 * Applies ToonLab's renderer defaults and returns an idempotent restoration
 * handle. The renderer remains owned by the host and is never disposed here.
 */
export function configureToonLabRenderer(renderer, options = {}) {
  if (!renderer || typeof renderer !== 'object') {
    throw new TypeError('configureToonLabRenderer requires a renderer object.');
  }
  const profile = createToonLabRendererProfile(options);
  const backend = detectToonLabRendererBackend(renderer);
  const resourceLifetime = stabilizeToonLabWebGPUResourceLifetime(renderer);
  const shadowMap = renderer.shadowMap ?? null;
  const original = {
    clear: captureClearState(renderer),
    outputColorSpace: { had: 'outputColorSpace' in renderer, value: renderer.outputColorSpace },
    pixelRatio: typeof renderer.getPixelRatio === 'function' ? renderer.getPixelRatio() : null,
    shadowAutoUpdate: shadowMap
      ? { had: 'autoUpdate' in shadowMap, value: shadowMap.autoUpdate }
      : null,
    shadowEnabled: shadowMap
      ? { had: 'enabled' in shadowMap, value: shadowMap.enabled }
      : null,
    shadowNeedsUpdate: shadowMap
      ? { had: 'needsUpdate' in shadowMap, value: shadowMap.needsUpdate }
      : null,
    shadowType: shadowMap
      ? { had: 'type' in shadowMap, value: shadowMap.type }
      : null,
    toneMapping: { had: 'toneMapping' in renderer, value: renderer.toneMapping },
    toneMappingExposure: {
      had: 'toneMappingExposure' in renderer,
      value: renderer.toneMappingExposure,
    },
  };
  const nativeShadows = shadowMap
    ? resolveNativeShadows(profile, backend, Boolean(shadowMap.enabled))
    : false;

  renderer.outputColorSpace = profile.outputColorSpace;
  renderer.toneMapping = profile.toneMapping;
  renderer.toneMappingExposure = profile.toneMappingExposure;
  renderer.setPixelRatio?.(profile.pixelRatio);

  if (shadowMap) {
    shadowMap.enabled = nativeShadows;
    if (nativeShadows) {
      shadowMap.type = profile.shadowType;
      shadowMap.autoUpdate = true;
      shadowMap.needsUpdate = true;
    }
  }

  if (profile.clearColor !== undefined && typeof renderer.setClearColor === 'function') {
    renderer.setClearColor(
      profile.clearColor,
      profile.clearAlpha ?? original.clear?.alpha ?? 1,
    );
  } else if (profile.clearAlpha !== undefined && original.clear
    && typeof renderer.setClearColor === 'function') {
    renderer.setClearColor(original.clear.color, profile.clearAlpha);
  }

  const diagnostics = freezeRecord({
    backend,
    nativeShadows,
    outputColorSpace: profile.outputColorSpace,
    pixelRatio: profile.pixelRatio,
    profileVersion: TOONLAB_RENDERER_CONFIGURATION_VERSION,
    resourceLifetimeStabilized: resourceLifetime.installed,
    shadowType: nativeShadows ? profile.shadowType : null,
    toneMapping: profile.toneMapping,
    toneMappingExposure: profile.toneMappingExposure,
  });
  let restored = false;

  function restore() {
    if (restored) return false;
    restored = true;
    restoreOptionalProperty(renderer, 'outputColorSpace', original.outputColorSpace);
    restoreOptionalProperty(renderer, 'toneMapping', original.toneMapping);
    restoreOptionalProperty(renderer, 'toneMappingExposure', original.toneMappingExposure);
    if (original.pixelRatio !== null) renderer.setPixelRatio?.(original.pixelRatio);
    if (shadowMap) {
      restoreOptionalProperty(shadowMap, 'enabled', original.shadowEnabled);
      restoreOptionalProperty(shadowMap, 'type', original.shadowType);
      restoreOptionalProperty(shadowMap, 'autoUpdate', original.shadowAutoUpdate);
      restoreOptionalProperty(shadowMap, 'needsUpdate', original.shadowNeedsUpdate);
    }
    if (original.clear && typeof renderer.setClearColor === 'function') {
      renderer.setClearColor(original.clear.color, original.clear.alpha);
    }
    return true;
  }

  return Object.freeze({
    backend,
    diagnostics,
    dispose: restore,
    profile,
    restore,
  });
}
