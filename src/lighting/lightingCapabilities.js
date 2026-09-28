import { LIGHT_TYPES } from './lightDescriptors.js';
import { cloneJson, finite, isPlainObject } from './utils.js';

function detectBackend(renderer) {
  if (renderer?.isWebGPURenderer) return 'webgpu';
  if (renderer?.isWebGLRenderer && renderer.capabilities?.isWebGL2) return 'webgl2';
  if (renderer?.isWebGLRenderer) return 'webgl1';
  return 'unknown';
}

/**
 * Reports the portable Three.js lighting features available to this module.
 * This is a capability description, not a GPU benchmark or shader-limit test.
 */
export function createLightingCapabilityReport(options = {}) {
  const source = isPlainObject(options) ? options : {};
  const renderer = source.renderer ?? null;
  const backend = source.backend ?? detectBackend(renderer);
  const maxTextureUnits = Math.max(finite(renderer?.capabilities?.maxTextures, 0), 0);
  const maxTextureSize = Math.max(finite(renderer?.capabilities?.maxTextureSize, 0), 0);
  const warnings = [];

  if (backend === 'unknown') warnings.push('No renderer was supplied; runtime capabilities are conservative estimates.');
  if (backend === 'webgl1') warnings.push('WebGL1 is outside ToonLab lighting v1 support targets.');
  if (backend === 'webgl2') warnings.push('Large light counts remain shader- and material-dependent on WebGL2; use a measured quality profile.');

  return Object.freeze({
    backend,
    features: Object.freeze({
      areaLights: Object.freeze({
        discArea: 'rect-area-approximation',
        rectArea: true,
        tubeArea: 'rect-area-approximation',
      }),
      cookies: Object.freeze({ spot: true }),
      iesProfiles: 'metadata-only',
      lightLinking: 'three-layers-plus-metadata',
      globalIllumination: false,
      manyLights: false,
      manyLightRenderer: false,
      shadows: Object.freeze({
        ambient: false,
        directional: true,
        discArea: false,
        hemisphere: false,
        point: true,
        rectArea: false,
        spot: true,
        tubeArea: false,
      }),
    }),
    limits: Object.freeze({
      maxTextureSize,
      maxTextureUnits,
      recipeLightCount: 1024,
    }),
    renderer: renderer ? renderer.constructor?.name ?? 'Renderer' : null,
    supportedLightTypes: LIGHT_TYPES,
    warnings: Object.freeze(warnings),
  });
}

/** Returns one type-specific view of a capability report. */
export function getLightingTypeCapability(type, report = createLightingCapabilityReport()) {
  if (!LIGHT_TYPES.includes(type)) return null;
  const area = report.features.areaLights[type];
  return {
    areaRealization: area ?? null,
    cookies: Boolean(report.features.cookies[type]),
    iesProfiles: ['point', 'spot'].includes(type) ? report.features.iesProfiles : false,
    shadows: Boolean(report.features.shadows[type]),
    type,
  };
}

/** Creates a mutable JSON-safe snapshot suitable for logs and diagnostics UIs. */
export function snapshotLightingCapabilities(report) {
  return cloneJson(report ?? createLightingCapabilityReport());
}
