// Adapter-driven game-feel runtime. It owns scheduling, deterministic effect
// selection, overlap composition and budgets, while hosts retain ownership of
// cameras, gameplay clocks, audio contexts, DOM and renderable objects.

import { deriveSeed, hashSeed } from '../core/generation.js';
import {
  applyGameFeelQualityBudget,
  GAME_FEEL_GENERATOR_DOMAIN,
  GAME_FEEL_PRESET_DOCUMENT_TYPE,
  resolveGameFeelGeneratorRecipe,
  sanitizeGameFeelSettings,
  validateGameFeelPresetDocument,
} from './gameFeelGenerator.js';

const effectFactories = new Map();
const DEFAULT_EFFECT_PRIORITIES = Object.freeze({
  timeWarp: 100,
  cameraImpulse: 90,
  scalePunch: 80,
  screenFlash: 70,
  haptics: 60,
  audioCue: 50,
});

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function callSafely(callback, argument, counters) {
  if (typeof callback !== 'function') return false;
  try {
    const result = callback(argument);
    if (result?.catch) result.catch(() => { counters.adapterErrors += 1; });
    // Adapters may explicitly decline a capability so the runtime can use a
    // browser fallback and report unsupported output honestly.
    return result !== false;
  } catch {
    counters.adapterErrors += 1;
    return false;
  }
}

function effectDuration(effect, fallback = 1 / 60) {
  return Math.max(1 / 1000, finite(effect?.duration, fallback));
}

/** Registers a serialized effect type without introducing a finite enum. */
export function registerGameFeelEffectType(type, factory, { overwrite = false } = {}) {
  const id = String(type ?? '').trim();
  if (!id) throw new Error('Game-feel effect type is required.');
  if (typeof factory !== 'function') throw new Error(`Game-feel effect "${id}" factory must be a function.`);
  if (!overwrite && effectFactories.has(id)) throw new Error(`Game-feel effect "${id}" already exists.`);
  effectFactories.set(id, factory);
  return id;
}

export function getGameFeelEffectTypeOptions() {
  return [...effectFactories.keys()];
}

function cameraImpulseFactory(context) {
  const cameraRig = context.adapters.cameraRig;
  const handle = cameraRig?.addImpulse?.({
    decay: context.effect.decay,
    duration: context.effect.duration,
    frequency: context.effect.frequency,
    power: context.effect.power * context.intensity,
    seed: context.seed,
  }) ?? null;
  return {
    duration: effectDuration(context.effect, 0.28),
    dispose() { handle?.stop?.(); },
  };
}

function timeWarpFactory(context) {
  const duration = effectDuration(context.effect, 0.1);
  const hold = clamp(finite(context.effect.hold, 0.38), 0, 1);
  const scale = clamp(1 - ((1 - finite(context.effect.scale, 0.12)) * context.intensity), 0, 1);
  return {
    duration,
    timeScaleAt(age) {
      if (age < 0 || age > duration) return 1;
      const holdEnd = duration * hold;
      if (age <= holdEnd || holdEnd >= duration) return scale;
      return scale + (1 - scale) * ((age - holdEnd) / (duration - holdEnd));
    },
    timeScaleBreaks: [duration * hold, duration],
  };
}

function hapticsFactory(context) {
  const argument = {
    duration: context.effect.duration,
    eventId: context.eventId,
    highFrequency: clamp(context.effect.highFrequency * context.intensity, 0, 1),
    intensity: context.intensity,
    lowFrequency: clamp(context.effect.lowFrequency * context.intensity, 0, 1),
    payload: context.payload,
  };
  let handled = callSafely(context.adapters.haptics, argument, context.counters);
  if (!handled) {
    const navigatorObject = globalThis.navigator;
    try {
      const gamepads = navigatorObject?.getGamepads?.() ?? [];
      const gamepad = [...gamepads].find((entry) => entry?.vibrationActuator?.playEffect);
      if (gamepad) {
        const result = gamepad.vibrationActuator.playEffect('dual-rumble', {
          duration: Math.round(argument.duration * 1000),
          strongMagnitude: argument.lowFrequency,
          weakMagnitude: argument.highFrequency,
        });
        result?.catch?.(() => { context.counters.adapterErrors += 1; });
        handled = true;
      } else if (typeof navigatorObject?.vibrate === 'function') {
        handled = navigatorObject.vibrate(Math.round(argument.duration * 1000)) !== false;
      }
    } catch {
      context.counters.adapterErrors += 1;
    }
  }
  if (handled) context.counters.hapticDispatches += 1;
  else context.counters.unsupportedHaptics += 1;
  return { duration: effectDuration(context.effect, 0.12) };
}

function screenFlashFactory(context) {
  const duration = effectDuration(context.effect, 0.12);
  const color = Array.isArray(context.effect.color) ? context.effect.color.slice(0, 3) : [1, 1, 1];
  const opacity = clamp(finite(context.effect.opacity, 0.18) * context.intensity, 0, 1);
  return {
    duration,
    sample(frame, progress) {
      frame.flashes.push({ color, opacity: opacity * (1 - progress) ** 2 });
    },
  };
}

function scalePunchFactory(context) {
  const duration = effectDuration(context.effect, 0.2);
  const target = context.payload.scaleTarget ?? context.payload.target ?? context.adapters.scaleTarget ?? null;
  const amount = Math.max(0, finite(context.effect.amount, 0.14) * context.intensity);
  return {
    duration,
    sample(frame, progress) {
      if (!target) return;
      // Fast expansion and a single soft undershoot. The curve is evaluated
      // from absolute age, so its pose does not depend on frame rate.
      const punch = Math.sin(progress * Math.PI) * amount;
      const settle = Math.sin(progress * Math.PI * 2) * amount * 0.14 * progress;
      frame.punches.push({ amount: punch - settle, target });
    },
  };
}

function audioCueFactory(context) {
  const handled = callSafely(context.adapters.audioCue, {
    effect: context.effect,
    eventId: context.eventId,
    gain: context.effect.gain * context.intensity,
    intensity: context.intensity,
    payload: context.payload,
    pitch: context.effect.pitch,
    seed: context.seed,
  }, context.counters);
  if (handled) context.counters.audioDispatches += 1;
  else context.counters.unsupportedAudio += 1;
  return { duration: 1 / 60 };
}

registerGameFeelEffectType('cameraImpulse', cameraImpulseFactory);
registerGameFeelEffectType('timeWarp', timeWarpFactory);
registerGameFeelEffectType('haptics', hapticsFactory);
registerGameFeelEffectType('screenFlash', screenFlashFactory);
registerGameFeelEffectType('scalePunch', scalePunchFactory);
registerGameFeelEffectType('audioCue', audioCueFactory);

function normalizeRuntimeSettings(input, quality = 'balanced') {
  let normalized;
  if (input?.type === `toonlab/${GAME_FEEL_GENERATOR_DOMAIN}-generator`) {
    normalized = resolveGameFeelGeneratorRecipe(input, { quality });
  } else if (input?.type === GAME_FEEL_PRESET_DOCUMENT_TYPE) {
    const result = validateGameFeelPresetDocument(input);
    if (!result.ok) throw new Error(result.errors.join(' '));
    normalized = result.value.settings;
  } else {
    normalized = sanitizeGameFeelSettings(input);
  }
  // Quality is a runtime concern, not just a generator concern. Applying the
  // cap here lets mobile safely tighten raw settings and imported presets too.
  return applyGameFeelQualityBudget(normalized, quality);
}

function scaleAt(entry, offset) {
  return clamp(finite(entry.instance.timeScaleAt?.(entry.age + offset), 1), 0, 1);
}

// The built-in time-warp curve is piecewise linear. Splitting at every phase
// boundary and pairwise crossing lets us integrate the minimum of overlapping
// warps exactly, so scaled time is invariant across 30/60/120 Hz update rates.
function integrateTimeScale(entries, delta) {
  const warps = entries.filter((entry) => typeof entry.instance.timeScaleAt === 'function');
  if (warps.length === 0 || delta <= 0) return delta;
  let points = [0, delta];
  for (const entry of warps) {
    for (const phase of entry.instance.timeScaleBreaks ?? [entry.duration]) {
      const offset = phase - entry.age;
      if (offset > 0 && offset < delta) points.push(offset);
    }
  }
  points = [...new Set(points)].sort((a, b) => a - b);
  const crossings = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    const inset = (to - from) * 1e-9;
    const sampleFrom = from + inset;
    const sampleTo = to - inset;
    for (let a = 0; a < warps.length; a += 1) {
      for (let b = a + 1; b < warps.length; b += 1) {
        const differenceFrom = scaleAt(warps[a], sampleFrom) - scaleAt(warps[b], sampleFrom);
        const differenceTo = scaleAt(warps[a], sampleTo) - scaleAt(warps[b], sampleTo);
        if (differenceFrom * differenceTo < 0) {
          crossings.push(sampleFrom + (sampleTo - sampleFrom) * (differenceFrom / (differenceFrom - differenceTo)));
        }
      }
    }
  }
  points = [...new Set([...points, ...crossings])].sort((a, b) => a - b);
  const minimumAt = (offset) => warps.reduce((minimum, entry) => Math.min(minimum, scaleAt(entry, offset)), 1);
  let integral = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    const inset = (to - from) * 1e-9;
    integral += (to - from) * (minimumAt(from + inset) + minimumAt(to - inset)) * 0.5;
  }
  return integral;
}

function writeTargetScale(target, multiplier, record, adapter, counters) {
  if (typeof adapter === 'function') {
    callSafely(adapter, { multiplier, target }, counters);
    record.lastMultiplier = multiplier;
    return;
  }
  const scale = target?.scale;
  if (!scale || !Number.isFinite(scale.x) || !Number.isFinite(scale.y) || !Number.isFinite(scale.z)) return;
  const previous = Math.max(record.lastMultiplier, 1e-6);
  const baseX = scale.x / previous;
  const baseY = scale.y / previous;
  const baseZ = scale.z / previous;
  if (typeof scale.set === 'function') scale.set(baseX * multiplier, baseY * multiplier, baseZ * multiplier);
  else Object.assign(scale, { x: baseX * multiplier, y: baseY * multiplier, z: baseZ * multiplier });
  record.lastMultiplier = multiplier;
}

function applyPunchFrame(frame, scaleRecords, adapters, counters) {
  const combined = new Map();
  for (const punch of frame.punches) {
    combined.set(punch.target, (combined.get(punch.target) ?? 0) + punch.amount);
  }
  const targets = new Set([...scaleRecords.keys(), ...combined.keys()]);
  for (const target of targets) {
    const record = scaleRecords.get(target) ?? { lastMultiplier: 1 };
    const multiplier = Math.max(0.05, 1 + (combined.get(target) ?? 0));
    writeTargetScale(target, multiplier, record, adapters.applyScalePunch, counters);
    if (combined.has(target)) scaleRecords.set(target, record);
    else scaleRecords.delete(target);
  }
}

function applyFlashFrame(frame, adapters, counters) {
  let opacity = 0;
  let weight = 0;
  const color = [0, 0, 0];
  for (const flash of frame.flashes) {
    const alpha = clamp(finite(flash.opacity, 0), 0, 1);
    opacity = 1 - ((1 - opacity) * (1 - alpha));
    weight += alpha;
    for (let channel = 0; channel < 3; channel += 1) color[channel] += finite(flash.color[channel], 1) * alpha;
  }
  if (weight > 0) for (let channel = 0; channel < 3; channel += 1) color[channel] /= weight;
  else color.fill(1);
  callSafely(adapters.setScreenFlash ?? adapters.screenFlash, { color, opacity }, counters);
  return { color, opacity };
}

/**
 * Creates a scheduler. `update(realDelta)` returns the gameplay delta after
 * hit-stop/time-warp; camera, flash and haptics continue on unscaled time.
 */
export function createGameFeelRuntime(options = {}) {
  if (options?.events || options?.master || options?.type) options = { settings: options };
  const adapters = { ...(options.adapters ?? {}) };
  if (options.cameraRig) adapters.cameraRig = options.cameraRig;
  const localFactories = new Map(effectFactories);
  for (const [type, factory] of Object.entries(options.effectFactories ?? {})) localFactories.set(type, factory);
  let settings = normalizeRuntimeSettings(options.settings ?? {}, options.quality);
  let disposed = false;
  let active = [];
  let elapsedReal = 0;
  let elapsedScaled = 0;
  let serial = 0;
  let lastTimeScale = 1;
  let lastFlash = { color: [1, 1, 1], opacity: 0 };
  const lastTriggers = new Map();
  const scaleRecords = new Map();
  const counters = {
    adapterErrors: 0,
    audioDispatches: 0,
    cooldownRejections: 0,
    effectsCompleted: 0,
    effectsDropped: 0,
    effectsStarted: 0,
    hapticDispatches: 0,
    triggerAttempts: 0,
    triggersAccepted: 0,
    unknownEffects: 0,
    unknownEvents: 0,
    unsupportedAudio: 0,
    unsupportedHaptics: 0,
    updates: 0,
  };

  function stopEntry(entry, completed = false) {
    try { entry.instance.dispose?.(); } catch { counters.adapterErrors += 1; }
    if (completed) counters.effectsCompleted += 1;
  }

  function enforceBudget() {
    const maximum = settings.master.maxConcurrentEffects;
    if (active.length <= maximum) return;
    active.sort((a, b) => b.priority - a.priority || b.serial - a.serial);
    const dropped = active.splice(maximum);
    for (const entry of dropped) stopEntry(entry);
    counters.effectsDropped += dropped.length;
  }

  const runtime = {
    configure(input, { quality = options.quality ?? 'balanced' } = {}) {
      if (disposed) return runtime;
      settings = normalizeRuntimeSettings(input, quality);
      enforceBudget();
      return runtime;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const entry of active) stopEntry(entry);
      active = [];
      const emptyFrame = { flashes: [], punches: [] };
      applyPunchFrame(emptyFrame, scaleRecords, adapters, counters);
      applyFlashFrame(emptyFrame, adapters, counters);
      callSafely(adapters.setTimeScale ?? adapters.timeScale, 1, counters);
      adapters.dispose?.();
      lastTimeScale = 1;
      lastFlash = { color: [1, 1, 1], opacity: 0 };
    },
    get scaledDelta() { return runtime._scaledDelta ?? 0; },
    get settings() { return settings; },
    get timeScale() { return lastTimeScale; },
    getStats() { return runtime.stats(); },
    stats() {
      const byType = {};
      for (const entry of active) byType[entry.type] = (byType[entry.type] ?? 0) + 1;
      return {
        ...counters,
        activeByType: byType,
        activeEffects: active.length,
        disposed,
        elapsedReal,
        elapsedScaled,
        flashOpacity: lastFlash.opacity,
        maxConcurrentEffects: settings.master.maxConcurrentEffects,
        maxEffectsPerTrigger: settings.master.maxEffectsPerTrigger,
        timeScale: lastTimeScale,
      };
    },
    trigger(eventId, payload = {}, triggerOptions = {}) {
      counters.triggerAttempts += 1;
      if (disposed) return { accepted: false, effectCount: 0, eventId, reason: 'disposed' };
      const id = String(eventId ?? '');
      const event = settings.events[id];
      if (!event) {
        counters.unknownEvents += 1;
        return { accepted: false, effectCount: 0, eventId: id, reason: 'unknown-event' };
      }
      if (!event.enabled) return { accepted: false, effectCount: 0, eventId: id, reason: 'disabled' };
      const previous = lastTriggers.get(id);
      if (!triggerOptions.ignoreCooldown && previous !== undefined && elapsedReal - previous < event.cooldown) {
        counters.cooldownRejections += 1;
        return { accepted: false, effectCount: 0, eventId: id, reason: 'cooldown' };
      }
      lastTriggers.set(id, elapsedReal);
      counters.triggersAccepted += 1;
      const triggerSeed = hashSeed(triggerOptions.seed ?? deriveSeed(options.seed ?? 1, `${id}:${++serial}`));
      const intensity = Math.max(0, finite(triggerOptions.intensity, 1)
        * event.intensity * settings.master.intensity * finite(payload.intensity, 1));
      const candidates = Object.entries(event.effects ?? {})
        .filter(([, effect]) => effect?.enabled !== false)
        .map(([type, effect]) => ({
          effect,
          factory: localFactories.get(type) ?? effectFactories.get(type),
          priority: finite(effect.priority, DEFAULT_EFFECT_PRIORITIES[type] ?? 40),
          type,
        }))
        .sort((a, b) => b.priority - a.priority || a.type.localeCompare(b.type));
      const supported = [];
      for (const candidate of candidates) {
        if (candidate.factory) supported.push(candidate);
        else {
          counters.unknownEffects += 1;
          counters.effectsDropped += 1;
        }
      }
      const maximum = Math.min(
        settings.master.maxEffectsPerTrigger,
        Math.max(0, settings.master.maxConcurrentEffects - active.length),
      );
      const selected = supported.slice(0, maximum);
      counters.effectsDropped += supported.length - selected.length;
      const handles = [];
      for (const candidate of selected) {
        const factory = candidate.factory;
        const effectSeed = deriveSeed(triggerSeed, candidate.type);
        try {
          const instance = factory({
            adapters,
            counters,
            effect: candidate.effect,
            event,
            eventId: id,
            intensity,
            payload: payload ?? {},
            runtime,
            seed: effectSeed,
            settings,
          }) ?? {};
          const entry = {
            age: 0,
            duration: Math.max(1 / 1000, finite(instance.duration, effectDuration(candidate.effect))),
            instance,
            priority: candidate.priority,
            serial: ++serial,
            type: candidate.type,
          };
          active.push(entry);
          counters.effectsStarted += 1;
          handles.push({
            type: candidate.type,
            stop() {
              const index = active.indexOf(entry);
              if (index < 0) return;
              active.splice(index, 1);
              stopEntry(entry);
            },
          });
        } catch {
          counters.adapterErrors += 1;
          counters.effectsDropped += 1;
        }
      }
      return { accepted: true, effectCount: handles.length, eventId: id, handles, intensity, seed: triggerSeed };
    },
    update(delta) {
      if (disposed) return { delta: 0, flash: lastFlash, realDelta: 0, timeScale: 1 };
      const realDelta = clamp(finite(delta, 0), 0, finite(options.maxDelta, 0.25));
      const scaledDelta = integrateTimeScale(active, realDelta);
      elapsedReal += realDelta;
      elapsedScaled += scaledDelta;
      runtime._scaledDelta = scaledDelta;
      counters.updates += 1;
      const frame = { flashes: [], punches: [] };
      const survivors = [];
      for (const entry of active) {
        entry.age += realDelta;
        const progress = clamp(entry.age / entry.duration, 0, 1);
        try {
          entry.instance.sample?.(frame, progress);
          entry.instance.update?.({
            delta: realDelta,
            elapsed: entry.age,
            frame,
            progress,
            scaledDelta,
          });
        } catch {
          counters.adapterErrors += 1;
        }
        if (entry.age + 1e-12 < entry.duration) survivors.push(entry);
        else stopEntry(entry, true);
      }
      active = survivors;
      lastTimeScale = active.reduce((minimum, entry) => (
        Math.min(minimum, typeof entry.instance.timeScaleAt === 'function' ? scaleAt(entry, 0) : 1)
      ), 1);
      callSafely(adapters.setTimeScale ?? adapters.timeScale, lastTimeScale, counters);
      applyPunchFrame(frame, scaleRecords, adapters, counters);
      lastFlash = applyFlashFrame(frame, adapters, counters);
      return { delta: scaledDelta, flash: lastFlash, realDelta, timeScale: lastTimeScale };
    },
  };
  return runtime;
}

/** Minimal browser adapters for lab/prototype use; all are optional. */
export function createGameFeelDomAdapters({
  audioContext = null,
  audioDestination = null,
  flashElement = null,
} = {}) {
  let context = audioContext;
  let ownsContext = false;
  const adapters = {
    audioCue({ eventId, gain, pitch }) {
      const Context = globalThis.AudioContext ?? globalThis.webkitAudioContext;
      if (!context && Context) {
        context = new Context();
        ownsContext = true;
      }
      if (!context) return false;
      context.resume?.().catch?.(() => {});
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      const base = eventId === 'reward' ? 620 : eventId === 'damage' ? 120 : eventId === 'movement' ? 280 : 190;
      oscillator.type = eventId === 'reward' ? 'sine' : 'triangle';
      oscillator.frequency.setValueAtTime(base * finite(pitch, 1), context.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(40, base * 0.62 * finite(pitch, 1)), context.currentTime + 0.09);
      envelope.gain.setValueAtTime(0.0001, context.currentTime);
      envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, finite(gain, 0.4) * 0.16), context.currentTime + 0.008);
      envelope.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.11);
      oscillator.connect(envelope).connect(audioDestination ?? context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.12);
      return true;
    },
    dispose() {
      if (ownsContext) context?.close?.().catch?.(() => {});
      context = null;
    },
    setScreenFlash({ color, opacity }) {
      if (!flashElement) return;
      const channels = color.map((channel) => Math.round(clamp(channel, 0, 1) * 255));
      flashElement.style.backgroundColor = `rgb(${channels.join(' ')})`;
      flashElement.style.opacity = String(opacity);
    },
  };
  return adapters;
}
