import {
  cloneSerializable, createSeededRandom, deepMerge, hashSeed, stableStringify,
} from '../core/generation.js';
import { resolveSoundscapeGeneratorRecipe } from './soundscapeGenerator.js';
import { createSoundscapeSettings, sanitizeSoundscapeSettings } from './soundscapeSettings.js';

const LAYER_TYPES = new Map();

function clamp(value, min, max, fallback = min) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(Math.max(number, min), max) : fallback;
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function audioTime(context) {
  return Number.isFinite(context?.currentTime) ? context.currentTime : 0;
}

function setParam(parameter, value, context, ramp = 0.025) {
  if (!parameter) return;
  const next = Number(value);
  if (!Number.isFinite(next)) return;
  const now = audioTime(context);
  try {
    parameter.cancelScheduledValues?.(now);
    if (ramp > 0 && parameter.setTargetAtTime) parameter.setTargetAtTime(next, now, ramp);
    else if (parameter.setValueAtTime) parameter.setValueAtTime(next, now);
    else parameter.value = next;
  } catch {
    try { parameter.value = next; } catch { /* readonly AudioParam shim */ }
  }
}

function safeConnect(source, destination) {
  try { source?.connect?.(destination); } catch { /* optional node in reduced contexts */ }
}

function safeDisconnect(node) {
  try { node?.disconnect?.(); } catch { /* already disconnected */ }
}

function safeStop(node, when) {
  try { node?.stop?.(when); } catch { /* already stopped */ }
}

function getPath(source, path) {
  return String(path).split('.').reduce((value, key) => value?.[key], source);
}

function setPath(source, path, value) {
  const keys = String(path).split('.');
  let target = source;
  for (const key of keys.slice(0, -1)) {
    if (!isObject(target[key])) target[key] = {};
    target = target[key];
  }
  target[keys.at(-1)] = value;
}

function interpolateSettings(from, to, amount) {
  if (typeof from === 'number' && typeof to === 'number') return from + (to - from) * amount;
  if (Array.isArray(from) || Array.isArray(to)) return cloneSerializable(amount < 1 ? from ?? to : to ?? from);
  if (!isObject(from) && !isObject(to)) return cloneSerializable(amount < 1 ? from ?? to : to ?? from);
  const output = {};
  for (const key of new Set([...Object.keys(from ?? {}), ...Object.keys(to ?? {})])) {
    output[key] = interpolateSettings(from?.[key], to?.[key], amount);
  }
  return output;
}

function structureSignature(settings) {
  return JSON.stringify({
    budget: settings.budget,
    buses: Object.keys(settings.buses ?? {}),
    layers: Object.entries(settings.layers ?? {}).map(([id, layer]) => {
      const definition = LAYER_TYPES.get(layer.type);
      let construction = null;
      try { construction = definition?.constructionKey?.(layer) ?? null; } catch { construction = null; }
      return [id, layer.type, layer.enabled, layer.bus, stableStringify(construction)];
    }),
    limiter: settings.master?.limiter,
  });
}

function createBudgetController(limits) {
  let nodes = 0;
  let voices = 0;
  const layerVoices = new Map();
  let droppedNodes = 0;
  let droppedVoices = 0;

  return {
    node(layerId) {
      if (nodes >= limits.maxNodes) {
        droppedNodes += 1;
        return null;
      }
      nodes += 1;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        nodes = Math.max(0, nodes - 1);
      };
    },
    stats() {
      return { droppedNodes, droppedVoices, nodes, voices };
    },
    voice(layerId, layerLimit = limits.maxVoices) {
      const current = layerVoices.get(layerId) ?? 0;
      if (voices >= limits.maxVoices || current >= Math.max(1, Number(layerLimit) || 1)) {
        droppedVoices += 1;
        return null;
      }
      voices += 1;
      layerVoices.set(layerId, current + 1);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        voices = Math.max(0, voices - 1);
        layerVoices.set(layerId, Math.max(0, (layerVoices.get(layerId) ?? 1) - 1));
      };
    },
  };
}

function createGraphTools(controller, layerId) {
  const nodes = new Map();
  const voices = new Set();
  return {
    dispose() {
      for (const release of voices) release();
      voices.clear();
      for (const [node, release] of nodes) {
        safeDisconnect(node);
        release();
      }
      nodes.clear();
    },
    node(factory) {
      const release = controller.node(layerId);
      if (!release) return null;
      try {
        const node = factory();
        if (!node) throw new Error('Audio node factory returned no node.');
        nodes.set(node, release);
        return node;
      } catch {
        release();
        return null;
      }
    },
    releaseNode(node) {
      const release = nodes.get(node);
      if (!release) return;
      nodes.delete(node);
      safeDisconnect(node);
      release();
    },
    releaseVoice(release) {
      if (!release || !voices.has(release)) return;
      voices.delete(release);
      release();
    },
    voice(limit) {
      const release = controller.voice(layerId, limit);
      if (release) voices.add(release);
      return release;
    },
  };
}

export function registerSoundscapeLayerType(type, definition, { overwrite = false } = {}) {
  const id = String(type ?? '').trim();
  if (!id) throw new Error('Soundscape layer type id is required.');
  if (!overwrite && LAYER_TYPES.has(id)) throw new Error(`Soundscape layer type "${id}" already exists.`);
  const normalized = typeof definition === 'function' ? { create: definition } : definition;
  if (!normalized || typeof normalized.create !== 'function') throw new Error('A soundscape layer type requires a create() factory.');
  LAYER_TYPES.set(id, {
    constructionKey: typeof normalized.constructionKey === 'function' ? normalized.constructionKey : null,
    create: normalized.create,
    description: String(normalized.description ?? ''),
    label: String(normalized.label ?? id),
  });
  return id;
}

export function unregisterSoundscapeLayerType(type) {
  return LAYER_TYPES.delete(String(type));
}

export function getSoundscapeLayerTypeOptions() {
  return [...LAYER_TYPES.entries()].map(([id, definition]) => ({
    description: definition.description, id, label: definition.label,
  }));
}

function createNoiseBuffer(context, color, seed) {
  if (!context?.createBuffer) return null;
  const length = Math.max(128, Math.floor((context.sampleRate || 44100) * 2));
  const buffer = context.createBuffer(1, length, context.sampleRate || 44100);
  const channel = buffer?.getChannelData?.(0);
  if (!channel) return buffer;
  const random = createSeededRandom(seed, 'noise-buffer');
  let brown = 0;
  let pink0 = 0;
  let pink1 = 0;
  for (let index = 0; index < channel.length; index += 1) {
    const white = random.float(-1, 1);
    if (color === 'brown') {
      brown = (brown + 0.02 * white) / 1.02;
      channel[index] = brown * 3.1;
    } else if (color === 'pink') {
      pink0 = 0.99765 * pink0 + white * 0.099046;
      pink1 = 0.963 * pink1 + white * 0.2965164;
      channel[index] = (pink0 + pink1 + white * 0.1848) * 0.18;
    } else channel[index] = white * 0.62;
  }
  return buffer;
}

async function createNoiseLayer({ context, destination, id, settings, tools }) {
  const gain = tools.node(() => context.createGain());
  const pan = tools.node(() => context.createStereoPanner());
  const highpass = tools.node(() => context.createBiquadFilter());
  const lowpass = tools.node(() => context.createBiquadFilter());
  if (!gain) throw new Error('Node budget exhausted before noise layer gain.');
  if (highpass) {
    highpass.type = 'highpass';
    safeConnect(highpass, lowpass ?? pan ?? gain);
  }
  if (lowpass) {
    lowpass.type = 'lowpass';
    safeConnect(lowpass, pan ?? gain);
  }
  if (pan) safeConnect(pan, gain);
  safeConnect(gain, destination);
  let source = null;
  let releaseVoice = null;
  let phase = 0;

  function apply(next, delta = 0) {
    phase += delta * clamp(next.params?.movement, 0, 8, 0);
    const movement = 0.9 + Math.sin(phase * Math.PI * 2) * 0.1;
    setParam(gain.gain, next.gain * movement, context);
    setParam(pan?.pan, next.pan, context);
    setParam(highpass?.frequency, clamp(next.params?.highpass, 10, 22000, 60), context);
    setParam(lowpass?.frequency, clamp(next.params?.lowpass, 10, 22000, 3200), context);
  }

  return {
    start() {
      if (source || !context.createBufferSource) return false;
      releaseVoice = tools.voice(settings.voiceLimit);
      if (!releaseVoice) return false;
      source = tools.node(() => context.createBufferSource());
      if (!source) {
        tools.releaseVoice(releaseVoice);
        releaseVoice = null;
        return false;
      }
      source.buffer = createNoiseBuffer(context, settings.params?.color, hashSeed(`${id}:${settings.params?.color ?? 'white'}`));
      source.loop = true;
      safeConnect(source, highpass ?? lowpass ?? pan ?? gain);
      try { source.start(); } catch { /* reduced context */ }
      apply(settings);
      return true;
    },
    stop() {
      if (!source) return;
      safeStop(source);
      tools.releaseNode(source);
      source = null;
      tools.releaseVoice(releaseVoice);
      releaseVoice = null;
    },
    update: apply,
    trigger() { return false; },
  };
}

async function createOscillatorLayer({ context, destination, settings, tools }) {
  const gain = tools.node(() => context.createGain());
  const pan = tools.node(() => context.createStereoPanner());
  const filter = tools.node(() => context.createBiquadFilter());
  if (!gain) throw new Error('Node budget exhausted before oscillator layer gain.');
  if (filter) {
    filter.type = 'lowpass';
    safeConnect(filter, pan ?? gain);
  }
  if (pan) safeConnect(pan, gain);
  safeConnect(gain, destination);
  let oscillator = null;
  let releaseVoice = null;
  let phase = 0;

  function apply(next, delta = 0) {
    phase += delta * clamp(next.params?.movement, 0, 8, 0);
    const drift = Math.sin(phase * Math.PI * 2) * clamp(next.params?.detune, -1200, 1200, 0);
    setParam(gain.gain, next.gain, context);
    setParam(pan?.pan, next.pan, context);
    setParam(oscillator?.frequency, clamp(next.params?.frequency, 8, 22000, 110), context, 0.08);
    setParam(oscillator?.detune, drift, context, 0.08);
    setParam(filter?.frequency, clamp(next.params?.lowpass, 80, 22000, 2200), context);
  }

  return {
    start() {
      if (oscillator || !context.createOscillator) return false;
      releaseVoice = tools.voice(settings.voiceLimit);
      if (!releaseVoice) return false;
      oscillator = tools.node(() => context.createOscillator());
      if (!oscillator) {
        tools.releaseVoice(releaseVoice);
        releaseVoice = null;
        return false;
      }
      oscillator.type = settings.params?.waveform ?? 'sine';
      safeConnect(oscillator, filter ?? pan ?? gain);
      apply(settings);
      try { oscillator.start(); } catch { /* reduced context */ }
      return true;
    },
    stop() {
      if (!oscillator) return;
      safeStop(oscillator);
      tools.releaseNode(oscillator);
      oscillator = null;
      tools.releaseVoice(releaseVoice);
      releaseVoice = null;
    },
    update: apply,
    trigger() { return false; },
  };
}

async function createProceduralEventLayer({ context, destination, id, settings, tools }) {
  const output = tools.node(() => context.createGain());
  const pan = tools.node(() => context.createStereoPanner());
  if (!output) throw new Error('Node budget exhausted before procedural layer output.');
  if (pan) safeConnect(pan, output);
  safeConnect(output, destination);
  const random = createSeededRandom(settings.seed ?? hashSeed(id), 'procedural-events');
  let current = settings;
  let elapsed = 0;
  let nextEvent = 0.2 + random.float(0, 1);

  function trigger(payload = {}) {
    if (!context.createOscillator || !context.createGain) return false;
    const releaseVoice = tools.voice(current.voiceLimit);
    if (!releaseVoice) return false;
    const oscillator = tools.node(() => context.createOscillator());
    const envelope = tools.node(() => context.createGain());
    if (!oscillator || !envelope) {
      if (oscillator) tools.releaseNode(oscillator);
      if (envelope) tools.releaseNode(envelope);
      tools.releaseVoice(releaseVoice);
      return false;
    }
    const now = audioTime(context);
    const duration = clamp(payload.duration ?? current.params?.duration, 0.025, 4, 0.18);
    const spread = clamp(current.params?.pitchSpread, 0, 2, 0.3);
    const pitch = clamp(
      payload.frequency ?? current.params?.frequency * (1 + random.float(-spread, spread)),
      20,
      22000,
      1200,
    );
    oscillator.type = payload.waveform ?? current.params?.waveform ?? 'sine';
    setParam(oscillator.frequency, pitch, context, 0);
    try {
      envelope.gain.setValueAtTime?.(0.0001, now);
      envelope.gain.exponentialRampToValueAtTime?.(Math.max(0.0001, current.gain), now + Math.min(0.025, duration * 0.25));
      envelope.gain.exponentialRampToValueAtTime?.(0.0001, now + duration);
    } catch { setParam(envelope.gain, current.gain, context, 0); }
    safeConnect(oscillator, envelope);
    safeConnect(envelope, pan ?? output);
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      tools.releaseNode(oscillator);
      tools.releaseNode(envelope);
      tools.releaseVoice(releaseVoice);
    };
    oscillator.onended = release;
    try {
      oscillator.start(now);
      oscillator.stop(now + duration + 0.02);
    } catch { release(); }
    return true;
  }

  return {
    start() { return true; },
    stop() {},
    trigger,
    update(next, delta = 0) {
      current = next;
      setParam(output.gain, 1, context);
      setParam(pan?.pan, current.pan, context);
      elapsed += Math.max(0, delta);
      if (elapsed >= nextEvent) {
        trigger();
        elapsed = 0;
        const density = clamp(current.params?.density, 0.001, 32, 0.2);
        nextEvent = -Math.log(Math.max(0.0001, 1 - random.next())) / density;
      }
    },
  };
}

async function defaultAssetResolver(asset, context, assets) {
  const source = assets?.[asset] ?? asset;
  if (source && typeof source !== 'string') return source;
  if (!source || typeof fetch !== 'function' || !context?.decodeAudioData) return null;
  const response = await fetch(source);
  if (!response.ok) throw new Error(`Unable to load soundscape asset ${source}: ${response.status}.`);
  return context.decodeAudioData(await response.arrayBuffer());
}

async function createAssetLayer({ assets, context, destination, resolveAsset, settings, tools }) {
  const output = tools.node(() => context.createGain());
  const pan = tools.node(() => context.createStereoPanner());
  if (!output) throw new Error('Node budget exhausted before asset layer output.');
  if (pan) safeConnect(pan, output);
  safeConnect(output, destination);
  let current = settings;
  let buffer = null;
  try {
    buffer = await resolveAsset(settings.asset ?? settings.params?.asset, context, assets);
  } catch { buffer = null; }

  function trigger(payload = {}) {
    if (!buffer || !context.createBufferSource) return false;
    const releaseVoice = tools.voice(current.voiceLimit);
    if (!releaseVoice) return false;
    const source = tools.node(() => context.createBufferSource());
    if (!source) {
      tools.releaseVoice(releaseVoice);
      return false;
    }
    source.buffer = buffer;
    source.loop = Boolean(payload.loop);
    source.playbackRate && setParam(source.playbackRate, payload.playbackRate ?? current.playbackRate, context, 0);
    safeConnect(source, pan ?? output);
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      tools.releaseNode(source);
      tools.releaseVoice(releaseVoice);
    };
    source.onended = release;
    try { source.start(0, Math.max(0, payload.offset ?? 0)); } catch { release(); return false; }
    return true;
  }

  return {
    start() { return current.autostart ? trigger({ loop: current.loop !== false }) : Boolean(buffer); },
    stop() {},
    trigger,
    update(next) {
      current = next;
      setParam(output.gain, current.gain, context);
      setParam(pan?.pan, current.pan, context);
    },
  };
}

registerSoundscapeLayerType('noise', {
  constructionKey: (settings) => ({ color: settings.params?.color ?? 'white' }),
  create: createNoiseLayer,
  description: 'Seeded continuous white, pink or brown noise with procedural movement.',
  label: 'Procedural Noise',
});
registerSoundscapeLayerType('oscillator', {
  constructionKey: (settings) => ({ waveform: settings.params?.waveform ?? 'sine' }),
  create: createOscillatorLayer,
  description: 'Continuous tonal bed generated entirely with Web Audio oscillators.',
  label: 'Oscillator Bed',
});
registerSoundscapeLayerType('procedural-events', {
  constructionKey: (settings) => ({ seed: settings.seed ?? null }),
  create: createProceduralEventLayer,
  description: 'Deterministic Poisson-timed synthetic details and gameplay one-shots.',
  label: 'Procedural Events',
});
registerSoundscapeLayerType('asset', {
  constructionKey: (settings) => ({
    asset: settings.asset ?? settings.params?.asset ?? null,
    autostart: Boolean(settings.autostart),
    loop: settings.loop !== false,
  }),
  create: createAssetLayer,
  description: 'Decoded AudioBuffer or URL-backed layer for custom recordings and music.',
  label: 'Audio Asset',
});

function normalizeRuntimeInput(input, quality, budget) {
  if (input?.type === 'toonlab/soundscape-generator') return resolveSoundscapeGeneratorRecipe(input, { budget, quality });
  if (input?.type === 'toonlab/soundscape-preset') return sanitizeSoundscapeSettings(input.settings, { budget, quality });
  return createSoundscapeSettings(input ?? {}, { budget, quality });
}

function applyAdaptiveMappings(settings, adaptiveValues) {
  const output = cloneSerializable(settings);
  for (const [parameter, mappings] of Object.entries(settings.adaptive?.mappings ?? {})) {
    const amount = clamp(adaptiveValues[parameter], 0, 1, 0);
    for (const mapping of mappings) {
      const curve = clamp(mapping.curve, 0.05, 8, 1);
      const mapped = Number(mapping.from) + (Number(mapping.to) - Number(mapping.from)) * amount ** curve;
      const current = Number(getPath(output, mapping.path));
      const next = mapping.mode === 'multiply' ? current * mapped : mapping.mode === 'add' ? current + mapped : mapped;
      if (Number.isFinite(next)) setPath(output, mapping.path, next);
    }
  }
  return output;
}

/**
 * Creates a package-grade Web Audio soundscape. The AudioContext is created
 * lazily by start(), keeping construction safe before a user gesture and in
 * SSR/Node environments.
 */
export function createSoundscapeRuntime(options = {}) {
  const quality = options.quality ?? 'balanced';
  const runtimeBudget = options.budget ?? {};
  let baseSettings = normalizeRuntimeInput(options.recipe ?? options.preset ?? options.settings, quality, runtimeBudget);
  let appliedSettings = cloneSerializable(baseSettings);
  let context = options.audioContext ?? null;
  let ownsContext = false;
  let status = 'idle';
  let disposed = false;
  let controller = createBudgetController(baseSettings.budget);
  let mixerTools = null;
  let masterNode = null;
  let limiterNode = null;
  let buses = new Map();
  let layers = new Map();
  let skippedLayers = [];
  let transitionState = null;
  let adaptiveTargets = { ...baseSettings.adaptive.values };
  let adaptiveValues = { ...adaptiveTargets };
  let buildPromise = null;
  let transitionCount = 0;

  const resolveAsset = options.assetResolver ?? ((asset, audioContext, assets) => defaultAssetResolver(asset, audioContext, assets));

  function ensureContext() {
    if (context) return context;
    const Constructor = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!Constructor) return null;
    try {
      context = new Constructor({ latencyHint: options.latencyHint ?? 'interactive' });
      ownsContext = true;
      return context;
    } catch { return null; }
  }

  function teardownGraph() {
    for (const entry of layers.values()) {
      try { entry.handle.stop?.(); } catch { /* layer already stopped */ }
      try { entry.handle.dispose?.(); } catch { /* optional extension cleanup */ }
      entry.tools.dispose();
    }
    layers.clear();
    buses.clear();
    mixerTools?.dispose();
    mixerTools = null;
    masterNode = null;
    limiterNode = null;
  }

  async function buildGraph() {
    if (buildPromise) return buildPromise;
    buildPromise = (async () => {
      const activeContext = ensureContext();
      if (!activeContext || disposed) return false;
      teardownGraph();
      controller = createBudgetController(baseSettings.budget);
      skippedLayers = [];
      mixerTools = createGraphTools(controller, '$mixer');
      masterNode = mixerTools.node(() => activeContext.createGain());
      if (!masterNode) {
        status = 'budget-exhausted';
        return false;
      }
      setParam(masterNode.gain, baseSettings.master.gain, activeContext, 0);
      if (baseSettings.master.limiter && activeContext.createDynamicsCompressor) {
        limiterNode = mixerTools.node(() => activeContext.createDynamicsCompressor());
      }
      if (limiterNode) {
        setParam(limiterNode.threshold, -3, activeContext, 0);
        setParam(limiterNode.knee, 5, activeContext, 0);
        setParam(limiterNode.ratio, 12, activeContext, 0);
        safeConnect(limiterNode, masterNode);
      }
      safeConnect(masterNode, activeContext.destination);
      for (const [id, settings] of Object.entries(baseSettings.buses)) {
        const node = mixerTools.node(() => activeContext.createGain());
        if (!node) break;
        setParam(node.gain, settings.mute ? 0 : settings.gain, activeContext, 0);
        safeConnect(node, limiterNode ?? masterNode);
        buses.set(id, node);
      }
      for (const [id, settings] of Object.entries(baseSettings.layers)) {
        if (!settings.enabled) continue;
        const definition = LAYER_TYPES.get(settings.type);
        if (!definition) {
          skippedLayers.push({ id, reason: `Unknown layer type ${settings.type}` });
          continue;
        }
        const tools = createGraphTools(controller, id);
        try {
          const handle = await definition.create({
            assets: options.assets ?? {},
            context: activeContext,
            destination: buses.get(settings.bus) ?? masterNode,
            id,
            resolveAsset,
            settings,
            tools,
          });
          if (!handle) throw new Error('Layer factory returned no handle.');
          const started = await handle.start?.();
          if (started === false) {
            try { handle.stop?.(); } catch { /* incomplete source cleanup */ }
            try { handle.dispose?.(); } catch { /* optional extension cleanup */ }
            tools.dispose();
            skippedLayers.push({ id, reason: 'Layer produced no playable source.' });
            continue;
          }
          layers.set(id, { handle, settings, tools, type: settings.type });
        } catch (error) {
          tools.dispose();
          skippedLayers.push({ id, reason: error.message });
        }
      }
      appliedSettings = cloneSerializable(baseSettings);
      applyLiveSettings(0);
      return true;
    })().finally(() => { buildPromise = null; });
    return buildPromise;
  }

  function applyLiveSettings(delta) {
    if (!context) return;
    const settings = applyAdaptiveMappings(appliedSettings, adaptiveValues);
    setParam(masterNode?.gain, settings.master.gain, context);
    for (const [id, node] of buses) {
      const bus = settings.buses[id];
      if (bus) setParam(node.gain, bus.mute ? 0 : bus.gain, context);
    }
    for (const [id, entry] of layers) {
      const layer = settings.layers[id];
      if (!layer) continue;
      entry.settings = layer;
      try { entry.handle.update?.(layer, delta, adaptiveValues); } catch { /* isolate extension failures */ }
    }
  }

  function setAdaptiveParameters(values = {}) {
    for (const [key, value] of Object.entries(values)) adaptiveTargets[key] = clamp(value, 0, 1, adaptiveTargets[key] ?? 0);
    return { ...adaptiveTargets };
  }

  function transition(input, { duration = baseSettings.master.transitionSeconds } = {}) {
    if (disposed) return false;
    const target = normalizeRuntimeInput(input, quality, runtimeBudget);
    transitionState = {
      duration: Math.max(0, Number(duration) || 0),
      elapsed: 0,
      from: cloneSerializable(appliedSettings),
      previousStructure: structureSignature(baseSettings),
      target,
    };
    transitionCount += 1;
    if (transitionState.duration === 0) update(0);
    return true;
  }

  function applySnapshot(snapshot, options = {}) {
    const patch = typeof snapshot === 'string' ? baseSettings.snapshots?.[snapshot] : snapshot;
    if (!isObject(patch)) return false;
    return transition(deepMerge(baseSettings, patch), options);
  }

  function update(deltaSeconds = 0, adaptivePatch) {
    if (disposed) return;
    const delta = Math.max(0, Math.min(Number(deltaSeconds) || 0, 1));
    if (adaptivePatch) setAdaptiveParameters(adaptivePatch);
    const smoothing = Math.max(0, baseSettings.adaptive.smoothing);
    const blend = smoothing <= 0 ? 1 : 1 - Math.exp(-delta / Math.max(0.0001, smoothing));
    for (const [key, target] of Object.entries(adaptiveTargets)) {
      adaptiveValues[key] = (adaptiveValues[key] ?? target) + (target - (adaptiveValues[key] ?? target)) * blend;
    }
    if (transitionState) {
      transitionState.elapsed += delta;
      const amount = transitionState.duration <= 0 ? 1 : Math.min(1, transitionState.elapsed / transitionState.duration);
      appliedSettings = sanitizeSoundscapeSettings(interpolateSettings(transitionState.from, transitionState.target, amount), {
        budget: runtimeBudget,
        quality,
      });
      if (amount >= 1) {
        const previousStructure = transitionState.previousStructure;
        baseSettings = transitionState.target;
        appliedSettings = cloneSerializable(baseSettings);
        adaptiveTargets = { ...baseSettings.adaptive.values, ...adaptiveTargets };
        transitionState = null;
        if (structureSignature(baseSettings) !== previousStructure && context) void buildGraph();
      }
    }
    applyLiveSettings(delta);
  }

  function trigger(event, payload = {}) {
    if (disposed) return 0;
    let targets = [];
    const route = baseSettings.events?.[event];
    if (typeof route === 'string') targets = [route];
    else if (Array.isArray(route)) targets = route;
    else if (Array.isArray(route?.layers)) targets = route.layers;
    else if (layers.has(event)) targets = [event];
    else if (payload.layer && layers.has(payload.layer)) targets = [payload.layer];
    else if (event === 'all') targets = [...layers.keys()];
    else targets = [...layers].filter(([, entry]) => entry.settings.triggers?.includes?.(event)).map(([id]) => id);
    let accepted = 0;
    for (const id of targets) {
      try { if (layers.get(id)?.handle.trigger?.(payload) !== false) accepted += 1; } catch { /* isolate layer failure */ }
    }
    return accepted;
  }

  async function start() {
    if (disposed) return { ok: false, reason: 'disposed' };
    const activeContext = ensureContext();
    if (!activeContext) {
      status = 'unavailable';
      return { ok: false, reason: 'audio-context-unavailable' };
    }
    try { await activeContext.resume?.(); } catch { /* context may already be running */ }
    const graphReady = layers.size > 0 || await buildGraph();
    const ok = Boolean(graphReady && layers.size > 0);
    status = ok ? 'running' : status === 'budget-exhausted' ? status : 'silent';
    return { ok: Boolean(ok), reason: ok ? null : status };
  }

  async function suspend() {
    if (disposed) return false;
    try { await context?.suspend?.(); } catch { /* externally managed context */ }
    status = 'suspended';
    return true;
  }

  function stats() {
    const budgetStats = controller.stats();
    return {
      activeLayers: layers.size,
      adaptive: { ...adaptiveValues },
      budget: { ...baseSettings.budget },
      contextState: context?.state ?? 'unavailable',
      disposed,
      nodes: budgetStats.nodes,
      quality,
      skippedLayers: cloneSerializable(skippedLayers),
      status,
      transitionActive: Boolean(transitionState),
      transitionCount,
      voices: budgetStats.voices,
      voicesDropped: budgetStats.droppedVoices,
      nodesDropped: budgetStats.droppedNodes,
    };
  }

  async function dispose() {
    if (disposed) return;
    disposed = true;
    status = 'disposed';
    teardownGraph();
    if (ownsContext && options.closeContextOnDispose !== false) {
      try { await context?.close?.(); } catch { /* context already closed */ }
    }
    context = null;
  }

  return {
    applySnapshot,
    dispose,
    get audioContext() { return context; },
    get settings() { return cloneSerializable(baseSettings); },
    setAdaptiveParameters,
    start,
    stats,
    suspend,
    transition,
    trigger,
    update,
  };
}

export const createSoundscape = createSoundscapeRuntime;
