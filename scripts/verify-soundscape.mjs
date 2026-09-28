import assert from 'node:assert/strict';

import {
  createGeneratedSoundscapePresetDocument,
  createSoundscapeGeneratorRecipe,
  createSoundscapeRuntime,
  createSoundscapeSettings,
  getSoundscapeLayerTypeOptions,
  parseSoundscapeGeneratorRecipe,
  registerSoundscapeLayerType,
  resolveSoundscapeGeneratorRecipe,
  serializeSoundscapeGeneratorRecipe,
  unregisterSoundscapeLayerType,
} from '../src/soundscape/index.js';
import { hashValue, stableStringify } from '../src/core/generation.js';

class FakeParam {
  constructor(value = 0) { this.value = value; }
  cancelScheduledValues() {}
  exponentialRampToValueAtTime(value) { this.value = value; }
  linearRampToValueAtTime(value) { this.value = value; }
  setTargetAtTime(value) { this.value = value; }
  setValueAtTime(value) { this.value = value; }
}

class FakeNode {
  constructor() {
    this.connections = [];
    this.gain = new FakeParam(1);
    this.pan = new FakeParam(0);
    this.frequency = new FakeParam(440);
    this.detune = new FakeParam(0);
    this.playbackRate = new FakeParam(1);
    this.threshold = new FakeParam(-24);
    this.knee = new FakeParam(30);
    this.ratio = new FakeParam(12);
  }
  connect(destination) { this.connections.push(destination); return destination; }
  disconnect() { this.connections.length = 0; }
  start() { this.started = true; }
  stop() {
    this.stopped = true;
    const callback = this.onended;
    this.onended = null;
    callback?.();
  }
}

class FakeAudioContext {
  constructor() {
    this.bufferSourceCount = 0;
    this.currentTime = 1;
    this.destination = new FakeNode();
    this.oscillatorCount = 0;
    this.sampleRate = 12000;
    this.state = 'suspended';
  }
  createBiquadFilter() { return new FakeNode(); }
  createBuffer(channels, length) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { duration: length / this.sampleRate, getChannelData: (channel) => data[channel] };
  }
  createBufferSource() { this.bufferSourceCount += 1; return new FakeNode(); }
  createDynamicsCompressor() { return new FakeNode(); }
  createGain() { return new FakeNode(); }
  createOscillator() { this.oscillatorCount += 1; return new FakeNode(); }
  createStereoPanner() { return new FakeNode(); }
  async close() { this.state = 'closed'; }
  async decodeAudioData() { return this.createBuffer(1, this.sampleRate); }
  async resume() { this.state = 'running'; }
  async suspend() { this.state = 'suspended'; }
}

const base = createSoundscapeGeneratorRecipe('verification', { label: 'Verification', seed: 1 });
const signatures = new Set();
for (let seed = 1; seed <= 10_000; seed += 1) {
  const recipe = createSoundscapeGeneratorRecipe('verification', {
    configuration: base.configuration,
    domains: base.domains,
    seed,
  });
  const settings = resolveSoundscapeGeneratorRecipe(recipe);
  signatures.add(hashValue({
    air: settings.layers.air,
    drone: settings.layers.drone,
    master: settings.master,
    wildlife: settings.layers.wildlife,
  }));
}
assert(signatures.size >= 9_990, `Expected at least 9,990 unique results, received ${signatures.size}.`);

const deterministicRecipe = createSoundscapeGeneratorRecipe('deterministic', { seed: 879123 });
assert.equal(
  stableStringify(resolveSoundscapeGeneratorRecipe(deterministicRecipe)),
  stableStringify(resolveSoundscapeGeneratorRecipe(deterministicRecipe)),
  'The same recipe must resolve identically.',
);
const serialized = serializeSoundscapeGeneratorRecipe(deterministicRecipe);
const parsed = parseSoundscapeGeneratorRecipe(serialized);
assert(parsed.ok, parsed.errors?.join(' '));
assert.equal(stableStringify(parsed.value), stableStringify(deterministicRecipe), 'Recipe JSON must round-trip.');

const locked = createSoundscapeGeneratorRecipe('locked', {
  configuration: { master: { gain: 0.613 } },
  locks: ['master.gain'],
  seed: 19,
});
assert.equal(resolveSoundscapeGeneratorRecipe(locked).master.gain, 0.613);
locked.seed = 922;
assert.equal(resolveSoundscapeGeneratorRecipe(locked).master.gain, 0.613, 'Locked fields must survive regeneration.');

const preset = createGeneratedSoundscapePresetDocument(deterministicRecipe, { quality: 'mobile' });
assert.equal(preset.type, 'toonlab/soundscape-preset');
assert(preset.settings.budget.maxNodes <= 32);
assert(preset.settings.budget.maxVoices <= 10);

const minimalFocus = createSoundscapeSettings('minimal-focus');
assert.equal(minimalFocus.layers.wildlife.params.density, 0.08, 'Minimal Focus must override params.density.');
assert.equal(minimalFocus.layers.wildlife.density, undefined, 'Minimal Focus must not create a dead top-level density field.');

const openRecipeResult = parseSoundscapeGeneratorRecipe(JSON.stringify({
  basePreset: null,
  configuration: {
    budget: { maxLayers: 12, maxNodes: 80, maxVoices: 30 },
    buses: { world: { gain: 0.7, mute: false } },
    layers: {
      'project-rain-canopy': {
        bus: 'world', enabled: true, gain: 0.2, params: { density: 0.4 }, type: 'project-rain', voiceLimit: 3,
      },
    },
    master: { gain: 0.8, limiter: true },
  },
  domains: {
    layers: {
      'project-rain-canopy': { params: { density: { $type: 'range', min: 0.1, max: 0.9, step: 0.001 } } },
    },
  },
  id: 'open-project-graph',
  label: 'Open Project Graph',
  locks: [],
  seed: 418,
  type: 'toonlab/soundscape-generator',
  version: 1,
}));
assert(openRecipeResult.ok, openRecipeResult.errors?.join(' '));
const openSettings = resolveSoundscapeGeneratorRecipe(openRecipeResult.value);
assert(openSettings.layers['project-rain-canopy'], 'Arbitrary project layer ids must resolve.');
assert(openSettings.layers['project-rain-canopy'].params.density >= 0.1);
assert(openSettings.layers['project-rain-canopy'].params.density <= 0.9);

let extensionUpdates = 0;
registerSoundscapeLayerType('verify-extension', ({ context, destination, tools }) => {
  const gain = tools.node(() => context.createGain());
  gain.connect(destination);
  return {
    start: () => true,
    stop() {},
    trigger: () => true,
    update() { extensionUpdates += 1; },
  };
});
assert(getSoundscapeLayerTypeOptions().some((entry) => entry.id === 'verify-extension'));
const extensionContext = new FakeAudioContext();
const extensionRuntime = createSoundscapeRuntime({
  audioContext: extensionContext,
  settings: createSoundscapeSettings({
    layers: {
      extension: { bus: 'detail', enabled: true, gain: 0.4, type: 'verify-extension', voiceLimit: 1 },
    },
  }),
});
assert((await extensionRuntime.start()).ok);
extensionRuntime.update(0.1, { intensity: 0.9 });
assert(extensionUpdates > 0, 'Extension layer update should run.');
assert.equal(extensionRuntime.trigger('extension'), 1);
await extensionRuntime.dispose();
assert.equal(extensionRuntime.stats().nodes, 0);
unregisterSoundscapeLayerType('verify-extension');

const rebuildContext = new FakeAudioContext();
const rebuildRuntime = createSoundscapeRuntime({ audioContext: rebuildContext });
assert((await rebuildRuntime.start()).ok);
const initialNoiseSources = rebuildContext.bufferSourceCount;
const noiseChanged = rebuildRuntime.settings;
noiseChanged.layers.air.params.color = noiseChanged.layers.air.params.color === 'brown' ? 'pink' : 'brown';
rebuildRuntime.transition(noiseChanged, { duration: 0 });
await new Promise((resolve) => setTimeout(resolve, 0));
assert(rebuildContext.bufferSourceCount > initialNoiseSources, 'Changing noise color must rebuild its constructed buffer source.');
const initialOscillators = rebuildContext.oscillatorCount;
const waveformChanged = rebuildRuntime.settings;
waveformChanged.layers.drone.params.waveform = waveformChanged.layers.drone.params.waveform === 'sine' ? 'triangle' : 'sine';
rebuildRuntime.transition(waveformChanged, { duration: 0 });
await new Promise((resolve) => setTimeout(resolve, 0));
assert(rebuildContext.oscillatorCount > initialOscillators, 'Changing oscillator waveform must rebuild the constructed oscillator.');
await rebuildRuntime.dispose();

const assetRequests = [];
const assetContext = new FakeAudioContext();
const assetRuntime = createSoundscapeRuntime({
  assetResolver: async (asset) => {
    assetRequests.push(asset);
    return assetContext.createBuffer(1, 128);
  },
  audioContext: assetContext,
  settings: {
    layers: {
      soundtrack: {
        asset: '/audio/forest-a.ogg', bus: 'music', enabled: true, gain: 0.2, type: 'asset', voiceLimit: 2,
      },
    },
  },
});
assert((await assetRuntime.start()).ok);
const nextAsset = assetRuntime.settings;
nextAsset.layers.soundtrack.asset = '/audio/forest-b.ogg';
assetRuntime.transition(nextAsset, { duration: 0 });
await new Promise((resolve) => setTimeout(resolve, 0));
assert.deepEqual(assetRequests.slice(-2), ['/audio/forest-a.ogg', '/audio/forest-b.ogg'], 'Changing an asset URL must resolve a rebuilt source.');
await assetRuntime.dispose();

registerSoundscapeLayerType('verify-silent', () => ({
  start: () => false,
  stop() {},
  update() {},
}));
const silentRuntime = createSoundscapeRuntime({
  audioContext: new FakeAudioContext(),
  settings: { layers: { silent: { enabled: true, type: 'verify-silent' } } },
});
assert((await silentRuntime.start()).ok);
const silentStats = silentRuntime.stats();
assert(silentStats.skippedLayers.some((entry) => entry.id === 'silent' && /no playable source/i.test(entry.reason)));
assert.equal(silentStats.activeLayers, 4, 'A start() === false layer must not be counted as active.');
await silentRuntime.dispose();

const silentOnlyRecipe = parseSoundscapeGeneratorRecipe(JSON.stringify({
  basePreset: null,
  configuration: { layers: { silent: { enabled: true, type: 'verify-silent' } } },
  domains: {},
  id: 'silent-only',
  label: 'Silent Only',
  locks: [],
  seed: 1,
  type: 'toonlab/soundscape-generator',
  version: 1,
}));
assert(silentOnlyRecipe.ok);
const silentOnlyRuntime = createSoundscapeRuntime({
  audioContext: new FakeAudioContext(),
  recipe: silentOnlyRecipe.value,
});
const silentOnlyStart = await silentOnlyRuntime.start();
assert.equal(silentOnlyStart.ok, false);
assert.equal(silentOnlyRuntime.stats().status, 'silent');
assert.equal(silentOnlyRuntime.stats().activeLayers, 0);
assert(silentOnlyRuntime.stats().skippedLayers.some((entry) => entry.id === 'silent'));
await silentOnlyRuntime.dispose();
unregisterSoundscapeLayerType('verify-silent');

const budgetContext = new FakeAudioContext();
const crowdedLayers = Object.fromEntries(Array.from({ length: 24 }, (_, index) => [
  `noise-${index}`,
  { bus: 'ambience', enabled: true, gain: 0.1, params: { color: 'white' }, type: 'noise', voiceLimit: 8 },
]));
const budgetRuntime = createSoundscapeRuntime({
  audioContext: budgetContext,
  budget: { maxLayers: 4, maxNodes: 7, maxVoices: 2 },
  quality: 'mobile',
  settings: { budget: { maxLayers: 100, maxNodes: 1000, maxVoices: 1000 }, layers: crowdedLayers },
});
assert((await budgetRuntime.start()).ok);
let budgetStats = budgetRuntime.stats();
assert(budgetStats.nodes <= 7, `Node budget exceeded: ${budgetStats.nodes}.`);
assert(budgetStats.voices <= 2, `Voice budget exceeded: ${budgetStats.voices}.`);
assert(budgetStats.activeLayers <= 4, `Layer budget exceeded: ${budgetStats.activeLayers}.`);
budgetRuntime.applySnapshot('dramatic', { duration: 0.2 });
budgetRuntime.update(0.1);
assert(budgetRuntime.stats().transitionActive);
budgetRuntime.update(0.1);
assert(!budgetRuntime.stats().transitionActive);
await budgetRuntime.suspend();
assert.equal(budgetRuntime.stats().status, 'suspended');
assert((await budgetRuntime.start()).ok);
await budgetRuntime.dispose();
budgetStats = budgetRuntime.stats();
assert.equal(budgetStats.disposed, true);
assert.equal(budgetStats.nodes, 0);
assert.equal(budgetStats.voices, 0);

const unavailableRuntime = createSoundscapeRuntime();
const unavailable = await unavailableRuntime.start();
assert.equal(unavailable.ok, false, 'Missing AudioContext must fail gracefully.');
assert.equal(unavailableRuntime.stats().status, 'unavailable');
await unavailableRuntime.dispose();

console.log(`soundscape verifier passed (${signatures.size} unique results / 10,000 seeds)`);
