// Unified ToonLab weather-field renderer. This is the visual backend used by
// WeatherSystem and first-party lab previews; weather documents remain plain
// world state while the renderer owns emitter topology and materials.

import * as THREE from 'three';

import { AtmosphericEffectsRenderer } from './atmosphericEffectsRenderer.js';
import { RainFieldRenderer } from './rainFieldRenderer.js';
import { createWeatherSettings } from './weatherSettings.js';

const RAIN_RATE_MAXIMUM = 500;
const FLAKE_RATE_MAXIMUM = 800;
const MIST_RATE_MAXIMUM = 25;

function clamp01(value) {
  return Math.min(1, Math.max(0, Number(value) || 0));
}

function directionDegrees(direction) {
  const x = Number(direction?.[0]) || 0;
  const z = Number(direction?.[1]) || 0;
  if (Math.abs(x) + Math.abs(z) < 1e-6) return 0;
  return THREE.MathUtils.radToDeg(Math.atan2(z, x));
}

function flakeKindFor(type) {
  if (type === 'snow') return 'snow';
  if (type === 'hail') return 'hail';
  if (type === 'sleet') return 'sleet';
  return 'dust';
}

function flakeGravityFor(type) {
  if (type === 'dust') return 3;
  if (type === 'hail' || type === 'sleet') return -1;
  return 0;
}

function flakeWeightFor(type, intensity) {
  if (type === 'snow' || type === 'hail' || type === 'dust') return intensity;
  if (type === 'sleet') return intensity * 0.72;
  return 0;
}

function rainWeightFor(type, intensity) {
  if (type === 'rain') return intensity;
  if (type === 'sleet') return intensity * 0.48;
  return 0;
}

function flakeLifetime(precipitation) {
  const travelTime = precipitation.fallHeight
    / Math.max(precipitation.speed, 0.05);
  return THREE.MathUtils.clamp(travelTime, 0.4, 4);
}

export class WeatherFieldRenderer extends THREE.Group {
  constructor({
    electricalMode = 'automatic',
    seed = 0x51a7e,
  } = {}) {
    super();
    this.name = 'ToonLab unified weather fields';
    this.enabled = true;
    this.electricalMode = electricalMode === 'manual'
      ? 'manual'
      : 'automatic';
    this.settings = createWeatherSettings();
    this.rain = new RainFieldRenderer({
      maxRate: RAIN_RATE_MAXIMUM,
      seed,
    });
    this.effects = new AtmosphericEffectsRenderer({
      seed: seed ^ 0x6a09e667,
    });
    this.add(this.rain, this.effects);

    // Compatibility for consumers that historically displayed
    // weather.precipitation.geometry.instanceCount.
    this.geometry = {};
    Object.defineProperty(this.geometry, 'instanceCount', {
      enumerable: true,
      get: () => this.particleCount,
    });
    this.applyWeatherSettings(this.settings);
  }

  get particleCount() {
    return [
      this.rain.drops,
      this.rain.splashes,
      this.effects.flakes,
      this.effects.embers,
      this.effects.mist,
      this.effects.windStreaks,
    ].reduce(
      (total, mesh) => total + (mesh.visible ? mesh.geometry.instanceCount : 0),
      0,
    );
  }

  #frameFromSettings(settings) {
    const {
      atmosphere,
      lightning,
      precipitation,
      wind,
    } = settings;
    const intensity = clamp01(precipitation.intensity);
    const rainAmount = rainWeightFor(precipitation.type, intensity);
    const flakeAmount = flakeWeightFor(precipitation.type, intensity);
    const lifetime = flakeLifetime(precipitation);
    const fogAmount = clamp01((atmosphere.fogRangeScale - 1) / 4);
    const windSpeed = Math.max(0, Number(wind.speed) || 0);
    const streakAmount = clamp01(
      Math.max(windSpeed - 1.2, 0) / 4.8
        + Math.max((Number(wind.strength) || 0) - 0.35, 0) * 0.35,
    );
    const automaticElectrical = this.electricalMode === 'automatic'
      && lightning.enabled;
    const electricStrength = automaticElectrical
      ? clamp01(Math.max(
        lightning.intensity / 8,
        lightning.strikesPerMinute / 12,
      ))
      : 0;
    const fogColor = atmosphere.fogColor ?? precipitation.color;

    return {
      profile: {
        id: precipitation.type === 'dust' ? 'dust' : precipitation.type,
        label: 'Runtime weather',
      },
      ceiling: { amount: atmosphere.cloudCoverage },
      fog: {
        mist: {
          amount: fogAmount,
          tint: [...fogColor, 0.04 + fogAmount * 0.12],
        },
      },
      precipitation: {
        embers: {
          amount: 0,
          size: 1,
          tint: [1, 0.38, 0.17, 1],
          turbulence: 1,
        },
        emission: {
          flakes: flakeAmount * FLAKE_RATE_MAXIMUM,
          mist: fogAmount * MIST_RATE_MAXIMUM,
          rain: rainAmount * RAIN_RATE_MAXIMUM,
        },
        flakes: {
          amount: flakeAmount,
          areaSize: precipitation.areaSize,
          fallHeight: precipitation.fallHeight,
          gravity: flakeGravityFor(precipitation.type),
          kind: flakeKindFor(precipitation.type),
          lifetime,
          size: THREE.MathUtils.clamp(precipitation.size / 0.09, 0.3, 2.6),
          speed: precipitation.speed,
          tint: [
            ...precipitation.color,
            precipitation.opacity * (0.5 + intensity * 0.5),
          ],
          turbulence: precipitation.type === 'dust'
            ? 2.4
            : 0.65 + windSpeed * 0.16,
        },
        rain: {
          amount: rainAmount,
          areaSize: precipitation.areaSize,
          speed: precipitation.speed,
          streakLength: precipitation.streakLength,
          tint: [
            ...precipitation.color,
            precipitation.opacity * (0.5 + intensity * 0.5),
          ],
        },
      },
      electric: {
        farArc: electricStrength,
        farFlash: electricStrength,
        nearRate: automaticElectrical
          ? clamp01(lightning.strikesPerMinute / 30)
          : 0,
        tintHigh: [...lightning.color, 1],
        tintLow: [...lightning.color, 1],
      },
      flow: {
        directionDegrees: directionDegrees(wind.direction),
        maximum: windSpeed * (1 + clamp01(wind.strength) * 0.35),
        minimum: windSpeed * 0.65,
        streakAmount,
        streakOpacity: 0.08 + streakAmount * 0.16,
        streakTint: precipitation.type === 'dust'
          ? precipitation.color
          : [0.88, 0.94, 1],
      },
    };
  }

  applyWeatherSettings(settings = {}) {
    this.settings = createWeatherSettings(settings);
    const frame = this.#frameFromSettings(this.settings);
    this.rain.applyFrame(frame);
    this.effects.applyFrame(frame);
    this.#applyVisibility();
    return this;
  }

  applySettings(precipitation = {}, wind = {}) {
    return this.applyWeatherSettings({
      ...this.settings,
      precipitation,
      wind,
    });
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    this.rain.setEnabled(this.enabled);
    this.effects.setEnabled(this.enabled);
    this.#applyVisibility();
    return this;
  }

  triggerLightning({
    duration = this.settings.lightning.duration,
    intensity = this.settings.lightning.intensity,
  } = {}) {
    this.effects.triggerElectrical({
      duration,
      strength: clamp01(intensity / 7),
    });
    return this;
  }

  update(delta, {
    camera,
    center,
    floorY = center?.y ?? 0,
    renderer,
  } = {}) {
    this.rain.update(delta, { camera, floorY, renderer });
    this.effects.update(delta, { camera, floorY, renderer });
    return this;
  }

  #applyVisibility() {
    this.visible = this.enabled
      && (this.rain.visible || this.effects.visible);
  }

  dispose() {
    this.rain.dispose();
    this.effects.dispose();
  }
}

export function createWeatherFieldRenderer(options = {}) {
  return new WeatherFieldRenderer(options);
}
