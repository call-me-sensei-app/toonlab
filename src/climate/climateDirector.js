import { cloneClimateProfile, resolveClimateProfile } from './climateProfiles.js';
import { createClimateSequence, DEFAULT_CLIMATE_SEQUENCE } from './climateSequence.js';

const clamp01 = (value) => Math.min(1, Math.max(0, Number(value) || 0));
const smoothstep = (value) => value * value * (3 - 2 * value);
const lerp = (from, to, amount) => from + (to - from) * amount;

export const CLIMATE_RUNTIME_LIMITS = Object.freeze({
  emission: Object.freeze({
    rain: 500,
    flakes: 800,
    mist: 25,
  }),
  surface: Object.freeze({
    puddleMaximum: 0.6,
    puddleRiseRate: 0.005,
    wetnessRiseRate: 0.06,
  }),
  electrical: Object.freeze({
    farMaximumRate: 6,
    nearMaximumRate: 1,
    randomness: 0.5,
    flashLevel: 75,
    impulse: 100000,
  }),
  flow: Object.freeze({
    directionDegrees: 36,
    variationFrequency: 50,
    streakHeightMinimum: 0.5,
    streakHeightMaximum: 1,
    streakLengthMinimum: 1.5,
    streakLengthMaximum: 2.5,
    streakEmissionMaximum: 1.2000000476837158,
  }),
  audio: Object.freeze({
    rainGain: 0.5,
    thunderGain: 0.30000001192092896,
    windGain: 0.20000000298023224,
  }),
  coordinator: Object.freeze({
    updateInterval: 0.5,
    exposureProbeInterval: 2,
  }),
});

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function blendTree(from, to, amount) {
  if (typeof from === 'number' && typeof to === 'number') return lerp(from, to, amount);
  if (Array.isArray(from) && Array.isArray(to)) {
    return from.map((value, index) => blendTree(value, to[index] ?? value, amount));
  }
  if (isRecord(from) && isRecord(to)) {
    return Object.fromEntries(
      [...new Set([...Object.keys(from), ...Object.keys(to)])]
        .map((key) => [key, blendTree(from[key], to[key], amount)]),
    );
  }
  return amount >= 1 ? structuredClone(to) : structuredClone(from);
}

function cyclicPhase(phase) {
  const value = Number(phase);
  if (!Number.isFinite(value)) return 0;
  return ((value % 1) + 1) % 1;
}

function samplePhaseTint(tint, phase) {
  const stops = [
    tint.noon,
    tint.dusk,
    tint.midnight,
    tint.dawn,
    tint.noon,
  ];
  const scaled = cyclicPhase(phase) * 4;
  const index = Math.min(3, Math.floor(scaled));
  const amount = scaled - index;
  return blendTree(stops[index], stops[index + 1], amount);
}

function createDetailEvent(type, detail) {
  const event = new Event(type);
  Object.defineProperty(event, 'detail', { value: detail, enumerable: true });
  return event;
}

function createRandom(seed) {
  let state = Number(seed) >>> 0;
  if (state === 0) state = 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

function normalizeMode(mode) {
  if (mode !== 'fixed' && mode !== 'sequence') {
    throw new RangeError('Climate mode must be "fixed" or "sequence".');
  }
  return mode;
}

export class ClimateDirector extends EventTarget {
  constructor({
    dayPhase = 0,
    exposure = 1,
    mode = 'fixed',
    profile = 'openSky',
    seed = 0x51a7e,
    sequence = DEFAULT_CLIMATE_SEQUENCE,
    sink = null,
  } = {}) {
    super();
    this.dayPhase = cyclicPhase(dayPhase);
    this.exposure = clamp01(exposure);
    this.mode = normalizeMode(mode);
    this.sequence = sequence === DEFAULT_CLIMATE_SEQUENCE
      ? sequence
      : createClimateSequence(sequence);
    this.sink = sink;
    this.random = createRandom(seed);
    this.sequenceIndex = 0;
    this.sequenceHold = 0;
    this.transition = null;
    this.disposed = false;

    const initial = this.mode === 'sequence'
      ? this.sequence[0].profile
      : profile;
    this.profile = cloneClimateProfile(initial);
    if (this.mode === 'sequence') this.sequenceHold = this.#sampleHold(this.sequence[0]);
    this.frame = this.#composeFrame(this.profile);
    this.#publish();
  }

  #sampleHold(entry) {
    return lerp(entry.holdMinimum, entry.holdMaximum, this.random());
  }

  #composeFrame(profile) {
    const exposed = this.exposure;
    const rainAmount = profile.rain.amount * exposed;
    const flakeAmount = profile.flakes.amount * exposed;
    const mistAmount = profile.mist.amount * exposed;
    const emberAmount = profile.embers.amount * exposed;
    const electricAmount = Math.max(
      profile.electric.farArc,
      profile.electric.farFlash,
      profile.electric.nearRate,
    ) * exposed;
    return {
      profile: { id: profile.id, label: profile.label },
      dayPhase: this.dayPhase,
      exposure: exposed,
      air: {
        ...structuredClone(profile.air),
        sampledTint: samplePhaseTint(profile.air.tint, this.dayPhase),
      },
      ceiling: structuredClone(profile.ceiling),
      fog: {
        depth: structuredClone(profile.depthFog),
        mist: { ...structuredClone(profile.mist), amount: mistAmount },
        volume: structuredClone(profile.volumeFog),
      },
      precipitation: {
        rain: { ...structuredClone(profile.rain), amount: rainAmount },
        flakes: { ...structuredClone(profile.flakes), amount: flakeAmount },
        embers: { ...structuredClone(profile.embers), amount: emberAmount },
        emission: {
          rain: rainAmount * CLIMATE_RUNTIME_LIMITS.emission.rain,
          flakes: flakeAmount * CLIMATE_RUNTIME_LIMITS.emission.flakes,
          mist: mistAmount * CLIMATE_RUNTIME_LIMITS.emission.mist,
        },
      },
      light: structuredClone(profile.light),
      electric: {
        ...structuredClone(profile.electric),
        farArc: profile.electric.farArc * exposed,
        farFlash: profile.electric.farFlash * exposed,
        nearRate: profile.electric.nearRate * exposed,
      },
      flow: {
        ...structuredClone(profile.flow),
        directionDegrees: CLIMATE_RUNTIME_LIMITS.flow.directionDegrees,
        variationFrequency: CLIMATE_RUNTIME_LIMITS.flow.variationFrequency,
        streakHeightMinimum: CLIMATE_RUNTIME_LIMITS.flow.streakHeightMinimum,
        streakHeightMaximum: CLIMATE_RUNTIME_LIMITS.flow.streakHeightMaximum,
        streakLengthMinimum: CLIMATE_RUNTIME_LIMITS.flow.streakLengthMinimum,
        streakLengthMaximum: CLIMATE_RUNTIME_LIMITS.flow.streakLengthMaximum,
        streakEmissionMaximum: CLIMATE_RUNTIME_LIMITS.flow.streakEmissionMaximum,
      },
      surface: {
        wetnessTarget: rainAmount,
        puddleTarget: Math.min(
          CLIMATE_RUNTIME_LIMITS.surface.puddleMaximum,
          rainAmount * CLIMATE_RUNTIME_LIMITS.surface.puddleMaximum,
        ),
        wetnessRiseRate: CLIMATE_RUNTIME_LIMITS.surface.wetnessRiseRate,
        puddleRiseRate: CLIMATE_RUNTIME_LIMITS.surface.puddleRiseRate,
      },
      audio: {
        rainGain: rainAmount * CLIMATE_RUNTIME_LIMITS.audio.rainGain,
        thunderGain: electricAmount * CLIMATE_RUNTIME_LIMITS.audio.thunderGain,
        windGain: Math.min(1, profile.flow.maximum / 9)
          * CLIMATE_RUNTIME_LIMITS.audio.windGain,
      },
    };
  }

  #publish() {
    this.frame = this.#composeFrame(this.profile);
    if (typeof this.sink === 'function') this.sink(this.frame);
    else this.sink?.applyClimate?.(this.frame);
    this.dispatchEvent(createDetailEvent('frame', this.frame));
  }

  setDayPhase(phase) {
    this.dayPhase = cyclicPhase(phase);
    this.#publish();
    return this;
  }

  setExposure(exposure) {
    this.exposure = clamp01(exposure);
    this.#publish();
    return this;
  }

  setMode(mode) {
    this.mode = normalizeMode(mode);
    this.transition = null;
    if (this.mode === 'sequence') {
      this.sequenceIndex = 0;
      const entry = this.sequence[0];
      this.profile = cloneClimateProfile(entry.profile);
      this.sequenceHold = this.#sampleHold(entry);
    }
    this.#publish();
    return this;
  }

  setSequence(sequence, { restart = true } = {}) {
    this.sequence = sequence === DEFAULT_CLIMATE_SEQUENCE
      ? sequence
      : createClimateSequence(sequence);
    if (restart) this.setMode('sequence');
    return this;
  }

  setProfile(profile, { duration = 0, easing = smoothstep } = {}) {
    const target = cloneClimateProfile(profile);
    const seconds = Math.max(0, Number(duration) || 0);
    if (seconds === 0) {
      this.transition = null;
      this.profile = target;
      this.#publish();
      this.dispatchEvent(createDetailEvent('change', { profile: target.id }));
      return this;
    }
    this.transition = {
      duration: seconds,
      elapsed: 0,
      easing: typeof easing === 'function' ? easing : smoothstep,
      from: structuredClone(this.profile),
      to: target,
    };
    this.dispatchEvent(createDetailEvent('transitionstart', {
      from: this.transition.from.id,
      to: target.id,
      duration: seconds,
    }));
    return this;
  }

  #advanceSequence() {
    this.sequenceIndex = (this.sequenceIndex + 1) % this.sequence.length;
    const entry = this.sequence[this.sequenceIndex];
    this.sequenceHold = this.#sampleHold(entry);
    this.setProfile(entry.profile, { duration: entry.blendDuration });
  }

  update(deltaSeconds) {
    if (this.disposed) return this.frame;
    let remaining = Math.max(0, Number(deltaSeconds) || 0);

    // Consume the whole step so background tabs, server ticks, and recorded
    // playback stay deterministic even when one update crosses several holds.
    for (let guard = 0; remaining > 0 && guard < 2048; guard += 1) {
      if (this.transition) {
        const transition = this.transition;
        const transitionRemaining = transition.duration - transition.elapsed;
        const consumed = Math.min(remaining, transitionRemaining);
        transition.elapsed += consumed;
        remaining -= consumed;
        const progress = transition.duration === 0
          ? 1
          : transition.elapsed / transition.duration;
        this.profile = blendTree(
          transition.from,
          transition.to,
          clamp01(transition.easing(progress)),
        );
        if (progress < 1) break;
        this.profile = transition.to;
        this.transition = null;
        this.dispatchEvent(createDetailEvent('transitionend', {
          profile: this.profile.id,
        }));
        this.dispatchEvent(createDetailEvent('change', {
          profile: this.profile.id,
        }));
        continue;
      }

      if (this.mode !== 'sequence') break;
      const consumed = Math.min(remaining, this.sequenceHold);
      this.sequenceHold -= consumed;
      remaining -= consumed;
      if (this.sequenceHold > 0) break;
      this.#advanceSequence();
    }
    this.#publish();
    return this.frame;
  }

  triggerElectricalPulse({ strength = 1, position = null } = {}) {
    const detail = {
      strength: Math.max(0, Number(strength) || 0),
      position: position ? structuredClone(position) : null,
      tintLow: [...this.profile.electric.tintLow],
      tintHigh: [...this.profile.electric.tintHigh],
      flashLevel: CLIMATE_RUNTIME_LIMITS.electrical.flashLevel,
      impulse: CLIMATE_RUNTIME_LIMITS.electrical.impulse,
    };
    this.dispatchEvent(createDetailEvent('electricalpulse', detail));
    return detail;
  }

  dispose() {
    this.disposed = true;
    this.transition = null;
    this.sink = null;
  }
}

export function createClimateDirector(options) {
  return new ClimateDirector(options);
}
