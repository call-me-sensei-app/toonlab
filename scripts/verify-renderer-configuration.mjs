import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  ACESFilmicToneMapping,
  BasicShadowMap,
  Color,
  LinearSRGBColorSpace,
  NoToneMapping,
  PCFSoftShadowMap,
  SRGBColorSpace,
} from 'three';

import {
  TOONLAB_RENDERER_CONFIGURATION_VERSION,
  configureToonLabRenderer,
  createToonLabRendererOptions,
  createToonLabRendererProfile,
  detectToonLabRendererBackend,
  stabilizeToonLabWebGPUResourceLifetime,
} from '../src/renderer/index.js';

function rendererFixture({ webgpu = false, native = false } = {}) {
  let pixelRatio = 0.75;
  let clearColor = new Color(0x123456);
  let clearAlpha = 0.35;
  return {
    backend: webgpu ? { isWebGPUBackend: native } : undefined,
    isWebGPURenderer: webgpu,
    outputColorSpace: LinearSRGBColorSpace,
    shadowMap: {
      autoUpdate: false,
      enabled: false,
      needsUpdate: false,
      type: BasicShadowMap,
    },
    toneMapping: ACESFilmicToneMapping,
    toneMappingExposure: 1.7,
    getClearAlpha: () => clearAlpha,
    getClearColor: (target) => target.copy(clearColor),
    getPixelRatio: () => pixelRatio,
    setClearColor(value, alpha = 1) {
      clearColor = value?.isColor ? value.clone() : new Color(value);
      clearAlpha = alpha;
    },
    setPixelRatio(value) { pixelRatio = value; },
    snapshot() {
      return {
        clearAlpha,
        clearColor: clearColor.getHex(),
        outputColorSpace: this.outputColorSpace,
        pixelRatio,
        shadowMap: { ...this.shadowMap },
        toneMapping: this.toneMapping,
        toneMappingExposure: this.toneMappingExposure,
      };
    },
  };
}

assert.deepEqual(createToonLabRendererOptions({ powerPreference: 'high-performance' }), {
  antialias: true,
  powerPreference: 'high-performance',
});
assert.equal(createToonLabRendererProfile({ devicePixelRatio: 3 }).pixelRatio, 2);
assert.equal(createToonLabRendererProfile({ pixelRatio: 0.1 }).pixelRatio, 0.5);
assert.equal(TOONLAB_RENDERER_CONFIGURATION_VERSION, 1);

for (const fixture of [
  { backend: 'webgpu', native: true, nativeShadows: true, webgpu: true },
  { backend: 'webgl2-fallback', native: false, nativeShadows: false, webgpu: true },
  { backend: 'webgl', native: false, nativeShadows: true, webgpu: false },
]) {
  const renderer = rendererFixture(fixture);
  const before = renderer.snapshot();
  assert.equal(detectToonLabRendererBackend(renderer), fixture.backend);
  const handle = configureToonLabRenderer(renderer, {
    clearAlpha: 0.8,
    clearColor: 0xabcdef,
    devicePixelRatio: 2.5,
  });
  assert.equal(handle.backend, fixture.backend);
  assert.equal(handle.diagnostics.backend, fixture.backend);
  assert.equal(handle.diagnostics.nativeShadows, fixture.nativeShadows);
  assert.equal(handle.diagnostics.profileVersion, 1);
  assert.equal(handle.diagnostics.resourceLifetimeStabilized, false);
  assert.equal(renderer.outputColorSpace, SRGBColorSpace);
  assert.equal(renderer.toneMapping, NoToneMapping);
  assert.equal(renderer.toneMappingExposure, 1);
  assert.equal(renderer.getPixelRatio(), 2);
  assert.equal(renderer.shadowMap.enabled, fixture.nativeShadows);
  if (fixture.nativeShadows) assert.equal(renderer.shadowMap.type, PCFSoftShadowMap);
  assert.equal(renderer.getClearColor(new Color()).getHex(), 0xabcdef);
  assert.equal(renderer.getClearAlpha(), 0.8);
  assert.equal(handle.restore(), true);
  assert.deepEqual(renderer.snapshot(), before, `${fixture.backend} restores exactly`);
  assert.equal(handle.restore(), false, `${fixture.backend} restore is idempotent`);
}

const explicit = rendererFixture({ webgpu: true, native: false });
const explicitHandle = configureToonLabRenderer(explicit, { shadows: true });
assert.equal(explicit.shadowMap.enabled, true, 'host can explicitly opt into fallback native shadows');
explicitHandle.dispose();

const invalid = rendererFixture();
const invalidBefore = invalid.snapshot();
assert.throws(() => configureToonLabRenderer(invalid, { shadows: 'sometimes' }), /shadows/);
assert.deepEqual(invalid.snapshot(), invalidBefore, 'invalid input cannot partially configure renderer');

const retired = { destroys: 0, destroy() { this.destroys += 1; } };
const replacement = { destroys: 0, destroy() { this.destroys += 1; } };
const binding = {};
const backendData = new Map([[binding, { buffer: retired }]]);
let queueDrains = 0;
const nativeBackend = {
  delete(subject) { backendData.delete(subject); },
  destroyUniformBuffer() { throw new Error('the unsafe backend destroy must be replaced'); },
  device: {
    queue: {
      onSubmittedWorkDone() {
        queueDrains += 1;
        return Promise.resolve();
      },
    },
  },
  get(subject) {
    if (!backendData.has(subject)) backendData.set(subject, {});
    return backendData.get(subject);
  },
  isWebGPUBackend: true,
};
const retirementStatus = stabilizeToonLabWebGPUResourceLifetime({
  backend: nativeBackend,
  isWebGPURenderer: true,
});
assert.deepEqual(retirementStatus, { installed: true, reason: null });
nativeBackend.destroyUniformBuffer(binding);
assert.equal(backendData.has(binding), false, 'retired binding data detaches synchronously');
backendData.set(binding, { buffer: replacement });
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(queueDrains, 2, 'retirement spans encoded and submitted work boundaries');
assert.equal(retired.destroys, 1, 'the captured retired GPUBuffer is destroyed once');
assert.equal(replacement.destroys, 0, 'a reused binding\'s new GPUBuffer remains live');
assert.equal(
  stabilizeToonLabWebGPUResourceLifetime({ backend: nativeBackend }).installed,
  true,
  'installation is backend-idempotent',
);

const playgroundSource = await readFile(
  new URL('../labs/playground/ecctrlMain.jsx', import.meta.url),
  'utf8',
);
const rendererFactorySource = await readFile(
  new URL('../labs/shared/rendererFactory.js', import.meta.url),
  'utf8',
);
const rendererConfigurationSource = await readFile(
  new URL('../src/renderer/rendererConfiguration.js', import.meta.url),
  'utf8',
);
assert.match(playgroundSource, /runtime\.rendererConfiguration\?\.backend/);
assert.doesNotMatch(playgroundSource, /gl\.(?:outputColorSpace|toneMapping|toneMappingExposure)\s*=/);
assert.doesNotMatch(playgroundSource, /gl\.setPixelRatio\(/);
assert.match(rendererFactorySource, /createToonLabRendererOptions/);
assert.match(
  rendererFactorySource,
  /stabilizeToonLabWebGPUResourceLifetime\(renderer\)/,
  'the shared Lab renderer must install the package lifetime guard after init',
);
assert.match(
  rendererConfigurationSource,
  /backend\.delete\(uniformBuffer\);[\s\S]*?retiredBuffer\.destroy\(\)/,
  'the retired binding record must detach before its captured allocation is destroyed',
);

console.log('Renderer configuration verification passed.');
