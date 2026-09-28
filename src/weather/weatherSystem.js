import * as THREE from 'three';

import { setEnvironmentState } from '../environment/environmentState.js';
import { setEnvironmentCloudShadow } from '../environment/environmentShaderMaterials.js';
import { environmentSharedUniformNodes } from '../shaders-tsl/environment.js';
import {
  createWeatherPresetDocument,
  resolveWeatherPreset,
  resolveWeatherSettings,
  resolveWeatherStyleName,
} from './weatherPresets.js';
import {
  DEFAULT_WEATHER_SETTINGS,
  createWeatherSettings,
  interpolateWeatherSettings,
  mergeWeatherSettings,
} from './weatherSettings.js';
import { WeatherFieldRenderer } from './weatherFieldRenderer.js';
import { SKY_SCENE_OVERRIDE_PRIORITIES } from '../sky/sceneOverrideLayers.js';
import { WATER_SCENE_OVERRIDE_PRIORITIES } from '../water/sceneOverrideLayers.js';

const scratchCenter = new THREE.Vector3();
const scratchCamera = new THREE.Vector3();
const scratchRipple = new THREE.Vector3();

function resolveTarget(value) {
  return typeof value === 'function' ? value() : value;
}

function copySettings(settings) {
  return createWeatherSettings(settings);
}

function finiteValue(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function vectorValue(value, size, { srgb = false } = {}) {
  if (value?.isColor) {
    const color = value.clone();
    if (srgb) color.convertLinearToSRGB();
    return [color.r, color.g, color.b].slice(0, size);
  }
  if (Array.isArray(value)) {
    const channels = value.slice(0, size).map(Number);
    return channels.length === size && channels.every(Number.isFinite) ? channels : null;
  }
  if (value && typeof value === 'object') {
    const keys = size === 2 ? ['x', 'y'] : ['x', 'y', 'z'];
    const channels = keys.map((key, index) => Number(value[key] ?? value[['r', 'g', 'b'][index]]));
    return channels.every(Number.isFinite) ? channels : null;
  }
  return null;
}

function representativeTarget(target) {
  return target?.variantTrees?.[0] ?? target;
}

function targetUniformMaps(target) {
  const source = representativeTarget(target);
  return [
    source?.material?.uniforms,
    source?.canopyMesh?.material?.uniforms,
    source?.trunkMesh?.material?.uniforms,
  ].filter(Boolean);
}

function targetSettingsSources(target) {
  const source = representativeTarget(target);
  return [
    source?.settings?.shared,
    source?.settings?.foliage,
    source?.settings,
  ].filter((value) => value && typeof value === 'object');
}

function readUniform(target, name) {
  for (const uniforms of targetUniformMaps(target)) {
    if (uniforms[name]?.value !== undefined) return uniforms[name].value;
  }
  return undefined;
}

function readSetting(target, key) {
  for (const settings of targetSettingsSources(target)) {
    if (settings[key] !== undefined) return settings[key];
  }
  return undefined;
}

function firstVector(...candidates) {
  for (const [value, size, options] of candidates) {
    const resolved = vectorValue(value, size, options);
    if (resolved) return resolved;
  }
  return null;
}

function firstNumber(...values) {
  for (const value of values) {
    const resolved = finiteValue(value);
    if (resolved !== null) return resolved;
  }
  return null;
}

function snapshotWeatherTarget(target) {
  if (!target || (typeof target !== 'object' && typeof target !== 'function')) return null;
  const statsWind = target.stats?.wind ?? null;
  const wind = {
    direction: firstVector(
      [readUniform(target, 'uWindDirection'), 2],
      [statsWind?.direction, 2],
      [readSetting(target, 'windDirection'), 2],
    ),
    gustFrequency: firstNumber(readUniform(target, 'uGustFrequency'), readSetting(target, 'gustFrequency')),
    gustSpeed: firstNumber(readUniform(target, 'uGustSpeed'), readSetting(target, 'gustSpeed')),
    speed: firstNumber(readUniform(target, 'uWindSpeed'), statsWind?.speed, readSetting(target, 'windSpeed')),
    strength: firstNumber(readUniform(target, 'uWindStrength'), statsWind?.strength, readSetting(target, 'windStrength')),
  };
  const cloudShadow = {
    coverage: firstNumber(readUniform(target, 'uCloudShadowCoverage'), readSetting(target, 'cloudShadowCoverage')),
    scale: firstNumber(readUniform(target, 'uCloudShadowScale'), readSetting(target, 'cloudShadowScale')),
    strength: firstNumber(readUniform(target, 'uCloudShadowStrength'), readSetting(target, 'cloudShadowStrength')),
    velocity: firstVector(
      [readUniform(target, 'uCloudShadowVelocity'), 2],
      [readSetting(target, 'cloudShadowVelocity'), 2],
    ),
  };
  const surfaceWeather = {
    snowCover: firstNumber(readUniform(target, 'uSnowCover')),
    wetness: firstNumber(readUniform(target, 'uWetness')),
  };
  const sun = {
    color: firstVector(
      [readUniform(target, 'uSunColor'), 3, { srgb: true }],
      [readSetting(target, 'sunColor'), 3],
    ),
    direction: firstVector(
      [readUniform(target, 'uSunDirection'), 3],
      [readSetting(target, 'sunDirection'), 3],
    ),
    sky: firstVector(
      [readUniform(target, 'uSkyColor'), 3, { srgb: true }],
      [readSetting(target, 'skyColor'), 3],
    ),
  };
  return { cloudShadow, sun, surfaceWeather, wind };
}

function completeSunState(source, fallback = {}) {
  const input = source && typeof source === 'object' ? source : {};
  const color = firstVector([input.color, 3], [fallback.color, 3]);
  const direction = firstVector([input.direction, 3], [fallback.direction, 3]);
  const sky = firstVector([input.sky, 3], [fallback.sky, 3]);
  return color && direction && sky ? { color, direction, sky } : null;
}

function definedEntries(source) {
  return Object.fromEntries(Object.entries(source).filter(([, value]) => value !== null && value !== undefined));
}

function seededRandom(seed) {
  let state = (Math.trunc(seed) || 1) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function weatheredColor(source, tint, darkening, desaturation) {
  const channels = Array.isArray(source) ? source : [source.r, source.g, source.b];
  const result = channels.map((value, index) => value * (tint[index] ?? 1) * (1 - darkening));
  const gray = result[0] * 0.299 + result[1] * 0.587 + result[2] * 0.114;
  return result.map((value) => value + (gray - value) * desaturation);
}

function snapshotSunRig(sunRig) {
  const light = sunRig?.light;
  if (!light) return null;
  const opacity = (mesh) => mesh?.material?.uniforms?.opacity?.value ?? null;
  return {
    beamOpacity: opacity(sunRig.beam),
    color: light.color.clone(),
    diskOpacity: opacity(sunRig.disk),
    intensity: light.intensity,
    shaftOpacity: opacity(sunRig.shaft),
    spillOpacity: opacity(sunRig.spill),
  };
}

function targetWorldPosition(target, output) {
  if (!target) return null;
  if (typeof target.getWorldPosition === 'function') return target.getWorldPosition(output);
  if (target.position) return output.copy(target.position);
  if (Number.isFinite(target.x)) return output.set(target.x, target.y ?? 0, target.z ?? 0);
  return null;
}

function createLightningTelemetry() {
  // Compatibility surface for hosts that read `lightningLight.intensity`.
  // Rendering is owned by WeatherFieldRenderer's branch + cloud-flash field.
  const object = new THREE.Object3D();
  object.name = 'Weather lightning telemetry';
  object.intensity = 0;
  object.visible = false;
  object.userData.environmentShaderExclude = true;
  object.userData.waterExclude = true;
  return object;
}

/**
 * Cross-system weather coordinator. It constructs precipitation/lightning and
 * temporarily owns its named runtime layers; every other response goes through
 * public adapters whose captured baseline is restored on disposal.
 */
export class WeatherSystem extends THREE.EventDispatcher {
  constructor({
    ambientFx = null,
    camera = null,
    cloudShadowBaseline = null,
    environmentRoot = null,
    fauna = null,
    flowers = null,
    followTarget = null,
    forest = null,
    getSun = null,
    grass = null,
    groundHeightAt = null,
    lighting = null,
    onLightning = null,
    onSurfaceChange = null,
    onThunder = null,
    precipitationFloorY = 0,
    preset = 'clear',
    renderer = null,
    scene = null,
    seed = 1,
    setCloudShadow = null,
    setSun = null,
    settings = {},
    sky = null,
    style = 'call_me_sensei',
    surfaceBaseline = null,
    sunRig = null,
    water = null,
  } = {}) {
    super();
    this.scene = scene;
    this.renderer = renderer;
    this.camera = camera;
    this.followTarget = followTarget;
    this.environmentRoot = environmentRoot;
    this.targets = { ambientFx, fauna, flowers, forest, grass, lighting, sky, sunRig, water };
    this.groundHeightAt = typeof groundHeightAt === 'function' ? groundHeightAt : null;
    this.precipitationFloorY = Number(precipitationFloorY) || 0;
    this.setCloudShadowAdapter = typeof setCloudShadow === 'function' ? setCloudShadow : null;
    this.getSunAdapter = typeof getSun === 'function' ? getSun : null;
    this.setSunAdapter = typeof setSun === 'function' ? setSun : null;
    this.onSurfaceChange = typeof onSurfaceChange === 'function' ? onSurfaceChange : null;
    this.random = seededRandom(seed);
    this.root = new THREE.Group();
    this.root.name = 'WeatherSystem';
    this.root.userData.environmentShaderExclude = true;
    this.root.userData.waterExclude = true;

    this.currentPreset = preset;
    // The weather STYLE (identity — how conditions render) persists across
    // condition changes; conditions are the world-state axis. Resolve the
    // effective identity once so historical `preset: 'call_me_sensei'`
    // construction also keeps that style when setPreset/transitionTo is used.
    this.currentStyle = resolveWeatherPreset(preset, { style }).style;
    this.settings = resolveWeatherSettings(preset, settings, { style: this.currentStyle });
    this.targetSettings = copySettings(this.settings);
    this.transition = null;
    this._dirty = true;
    this._rippleAccumulator = 0;
    this._lightningCountdown = 0;
    this._flashRemaining = 0;
    this._thunderQueue = [];
    this._disposed = false;
    this._targetBaselines = new WeakMap();

    const precipitation = new WeatherFieldRenderer({
      electricalMode: 'manual',
      seed,
    });
    this.precipitation = precipitation;
    this.root.add(precipitation);

    // Public compatibility telemetry; visible electrical rendering lives in
    // the unified field renderer above.
    this.lightningLight = createLightningTelemetry();
    this.root.add(this.lightningLight);

    this._originalFog = scene?.fog ?? null;
    this._baseFog = this._originalFog?.isFog
      ? { color: this._originalFog.color.clone(), far: this._originalFog.far, near: this._originalFog.near }
      : { color: new THREE.Color(0.72, 0.83, 0.94), far: 900, near: 180 };
    this._weatherFog = this._originalFog?.isFog
      ? this._originalFog
      : new THREE.Fog(this._baseFog.color.clone(), this._baseFog.near, this._baseFog.far);

    const skyTarget = resolveTarget(sky);
    this._baseSky = skyTarget?.settings ? structuredClone(skyTarget.settings) : null;
    this._skyOverrideLayer = Symbol('ToonLab WeatherSystem sky layer');
    this._baseSun = snapshotSunRig(resolveTarget(sunRig));
    const waterTarget = resolveTarget(water);
    this._baseWaterWaveIntensity = Number(waterTarget?.settings?.waveIntensity) || 0;
    this._waterOverrideLayer = Symbol('ToonLab WeatherSystem water layer');
    this._baseEnvironmentCloudShadow = {
      coverage: environmentSharedUniformNodes.cloudShadowCoverage.value,
      scale: environmentSharedUniformNodes.cloudShadowScale.value,
      strength: environmentSharedUniformNodes.cloudShadowStrength.value,
      velocity: vectorValue(environmentSharedUniformNodes.cloudShadowVelocity.value, 2),
    };
    this._baseCloudShadow = cloudShadowBaseline && typeof cloudShadowBaseline === 'object'
      ? structuredClone(cloudShadowBaseline)
      : (this.setCloudShadowAdapter ? { strength: 0 } : structuredClone(this._baseEnvironmentCloudShadow));
    this._baseSurfaceState = {
      ...DEFAULT_WEATHER_SETTINGS.surface,
      ...(surfaceBaseline && typeof surfaceBaseline === 'object' ? structuredClone(surfaceBaseline) : {}),
    };
    this._ambientLights = new Map();
    scene?.traverse?.((object) => {
      if (object.isAmbientLight || object.isHemisphereLight) this._ambientLights.set(object, object.intensity);
    });

    for (const target of this._currentTransientTargets()) this._rememberTarget(target);
    let adapterSun = null;
    try {
      adapterSun = this.getSunAdapter?.() ?? null;
    } catch {
      // A host getter is optional; target/Sky settings below remain a safe fallback.
    }
    const firstTargetSun = this._currentTransientTargets()
      .map((target) => this._targetBaselines.get(target)?.sun)
      .find((value) => value?.color && value?.direction && value?.sky);
    this._baseSceneSun = completeSunState(adapterSun, firstTargetSun ?? {
      color: this._baseSky?.sunColor,
      direction: this._baseSky?.sunDirection,
      sky: this._baseSky?.zenithColor,
    });

    if (onLightning) this.addEventListener('lightning', onLightning);
    if (onThunder) this.addEventListener('thunder', onThunder);
    scene?.add?.(this.root);
    this._applyFrame(this.settings);
  }

  _currentTransientTargets() {
    return [...new Set([
      resolveTarget(this.targets.ambientFx),
      resolveTarget(this.targets.fauna),
      resolveTarget(this.targets.flowers),
      resolveTarget(this.targets.forest),
      resolveTarget(this.targets.grass),
      resolveTarget(this.targets.water),
    ].filter(Boolean))];
  }

  _rememberTarget(target) {
    if (target && !this._targetBaselines.has(target)) {
      this._targetBaselines.set(target, snapshotWeatherTarget(target));
    }
    return target;
  }

  _applyStandaloneSun(atmosphere) {
    if (!this._baseSceneSun) return;
    const sceneSun = {
      color: this._baseSceneSun.color.map((value, index) =>
        value * (atmosphere.sunTint[index] ?? 1)),
      direction: this._baseSceneSun.direction.slice(),
      sky: weatheredColor(
        this._baseSceneSun.sky,
        atmosphere.skyTint,
        atmosphere.skyDarkening,
        atmosphere.skyDesaturation,
      ),
    };
    if (this.setSunAdapter) {
      this.setSunAdapter(sceneSun);
      return;
    }
    for (const target of this._currentTransientTargets()) {
      this._rememberTarget(target)?.setSun?.(sceneSun);
    }
  }

  _restoreTransientTargets({ restoreSun = true } = {}) {
    const ambientFx = resolveTarget(this.targets.ambientFx);
    for (const target of this._currentTransientTargets()) {
      const baseline = this._targetBaselines.get(target) ?? snapshotWeatherTarget(target);
      if (target.setWind) {
        const wind = definedEntries(baseline?.wind ?? {});
        if (target === ambientFx) {
          target.setWind(Object.keys(wind).length > 0 ? {
            ...(wind.direction ? { windDirection: wind.direction } : {}),
            ...(wind.speed !== undefined ? { windSpeed: wind.speed } : {}),
            ...(wind.strength !== undefined ? { windStrength: wind.strength } : {}),
          } : { windStrength: 0 });
        } else {
          target.setWind(Object.keys(wind).length > 0 ? wind : { strength: 0 });
        }
      }
      if (target.setSurfaceWeather) {
        const surfaceWeather = definedEntries(baseline?.surfaceWeather ?? {});
        target.setSurfaceWeather(Object.keys(surfaceWeather).length > 0
          ? surfaceWeather
          : { snowCover: 0, wetness: 0 });
      }
      if (target.setCloudShadow) {
        const cloudShadow = definedEntries(baseline?.cloudShadow ?? {});
        target.setCloudShadow(Object.keys(cloudShadow).length > 0
          ? cloudShadow
          : { strength: 0 });
      }
      if (restoreSun && !this.setSunAdapter && target.setSun) {
        const sun = completeSunState(baseline?.sun, this._baseSceneSun ?? {});
        if (sun) target.setSun(sun);
      }
    }
  }

  get state() {
    return {
      preset: this.currentPreset,
      settings: copySettings(this.settings),
      transitioning: Boolean(this.transition),
      transitionProgress: this.transition
        ? Math.min(this.transition.elapsed / this.transition.duration, 1)
        : 1,
    };
  }

  /** Active one-writer Lighting coordinator, if the host attached one. */
  get lightingSystem() {
    return resolveTarget(this.targets.lighting);
  }

  /** True after teardown; useful to coordinators resolving detach ownership. */
  get disposed() {
    return this._disposed;
  }

  /** Pre-Weather scene sun captured from the optional world adapter. */
  get sunBaseline() {
    return this._baseSceneSun ? structuredClone(this._baseSceneSun) : null;
  }

  /** Pre-Weather physical sun-rig state, serialized for ownership handoff. */
  get sunRigBaseline() {
    if (!this._baseSun) return null;
    return {
      beamOpacity: this._baseSun.beamOpacity,
      color: this._baseSun.color.toArray(),
      diskOpacity: this._baseSun.diskOpacity,
      intensity: this._baseSun.intensity,
      shaftOpacity: this._baseSun.shaftOpacity,
      spillOpacity: this._baseSun.spillOpacity,
    };
  }

  /**
   * Hands sun, ambient, and fog-color ownership to Lighting. Weather then
   * supplies modulation only; removing Lighting restores the direct fallback.
   */
  setLightingSystem(lighting = null) {
    if (this._disposed) return this;
    const previous = this.lightingSystem;
    if (previous === lighting) return this;
    previous?.setWeatherModulation?.();
    if (lighting) {
      const sunRig = resolveTarget(this.targets.sunRig);
      if (sunRig?.light && this._baseSun) {
        sunRig.setState?.({ color: this._baseSun.color, intensity: this._baseSun.intensity });
      }
      for (const [light, intensity] of this._ambientLights) light.intensity = intensity;
      if (this._originalFog?.isFog) this._originalFog.color.copy(this._baseFog.color);
    }
    this.targets.lighting = lighting;
    this._dirty = true;
    this._applyFrame(this.settings);
    return this;
  }

  /**
   * Updates the pre-weather scene baseline that conditions modulate — the
   * seam a time-of-day driver writes through. Weather owns scene.fog at
   * runtime, so day/night fog color must land here, not on scene.fog.
   */
  setSceneBaseline({ fogColor } = {}) {
    if (this._disposed) return this;
    if (fogColor !== undefined && this._baseFog?.color) {
      if (fogColor?.isColor) this._baseFog.color.copy(fogColor);
      else if (Array.isArray(fogColor)) this._baseFog.color.setRGB(...fogColor);
      if (this._originalFog?.isFog) this._originalFog.color.copy(this._baseFog.color);
      this._dirty = true;
      this._applyFrame(this.settings);
    }
    return this;
  }

  setPreset(name, overrides = {}) {
    if (this._disposed) return this;
    this.currentPreset = name;
    this.settings = resolveWeatherSettings(name, overrides, { style: this.currentStyle });
    this.targetSettings = copySettings(this.settings);
    this.transition = null;
    this._dirty = true;
    this._applyFrame(this.settings);
    return this;
  }

  /**
   * Switches the weather STYLE (identity) and re-resolves the current
   * condition through it. Conditions keep their meteorological keys; the
   * style fills rendition character where a condition does not specify.
   */
  setStyle(style, { duration = 0 } = {}) {
    if (this._disposed) return this;
    this.currentStyle = resolveWeatherStyleName(style);
    if (typeof this.currentPreset === 'string') {
      if (duration > 0) return this.transitionTo(this.currentPreset, { duration });
      return this.setPreset(this.currentPreset);
    }
    return this;
  }

  applySettings(overrides = {}, { duration = 0 } = {}) {
    if (this._disposed) return this;
    const target = mergeWeatherSettings(this.settings, overrides);
    if (duration > 0) return this.transitionTo(target, { duration });
    this.currentPreset = null;
    this.settings = target;
    this.targetSettings = copySettings(target);
    this.transition = null;
    this._dirty = true;
    this._applyFrame(this.settings);
    return this;
  }

  transitionTo(presetOrSettings, { duration = 4, overrides = {} } = {}) {
    if (this._disposed) return this;
    const target = typeof presetOrSettings === 'string'
      ? resolveWeatherSettings(presetOrSettings, overrides, { style: this.currentStyle })
      : mergeWeatherSettings(createWeatherSettings(presetOrSettings), overrides);
    this.currentPreset = typeof presetOrSettings === 'string' ? presetOrSettings : null;
    this.targetSettings = target;
    const seconds = Math.max(Number(duration) || 0, 0);
    if (seconds === 0) {
      this.settings = copySettings(target);
      this.transition = null;
      this._applyFrame(this.settings);
      return this;
    }
    this.transition = { duration: seconds, elapsed: 0, from: copySettings(this.settings), to: copySettings(target) };
    return this;
  }

  setWeather(presetOrSettings, options) {
    return this.transitionTo(presetOrSettings, options);
  }

  refresh() {
    if (this._disposed) return this;
    this._dirty = true;
    this._applyFrame(this.settings);
    return this;
  }

  _applyFrame(settings) {
    const atmosphere = settings.atmosphere;
    const wind = settings.wind;
    const lighting = this.lightingSystem;
    setEnvironmentState({
      weatherCloudFade: atmosphere.skyDarkening,
      weatherOvercast: THREE.MathUtils.clamp((atmosphere.cloudCoverage - 0.08) / 0.92, 0, 1),
      weatherPrecipitation: settings.precipitation.intensity,
      weatherThunder: settings.lightning.enabled ? 1 : 0,
      weatherWindMultiplier: wind.speed,
    });
    for (const target of this._currentTransientTargets()) this._rememberTarget(target);
    const sky = resolveTarget(this.targets.sky);
    if (sky?.setSceneOverrideLayer) {
      sky.setSceneOverrideLayer(this._skyOverrideLayer, (base) => ({
        cloudColor: weatheredColor(base.cloudColor, atmosphere.skyTint, atmosphere.skyDarkening * 0.45, atmosphere.skyDesaturation),
        cloudCoverage: atmosphere.cloudCoverage,
        cloudShadeColor: weatheredColor(base.cloudShadeColor, atmosphere.skyTint, atmosphere.skyDarkening * 0.7, atmosphere.skyDesaturation),
        cloudSpeed: base.cloudSpeed * atmosphere.cloudSpeed,
        groundColor: weatheredColor(base.groundColor, atmosphere.skyTint, atmosphere.skyDarkening, atmosphere.skyDesaturation),
        horizonColor: weatheredColor(base.horizonColor, atmosphere.skyTint, atmosphere.skyDarkening * 0.7, atmosphere.skyDesaturation),
        zenithColor: weatheredColor(base.zenithColor, atmosphere.skyTint, atmosphere.skyDarkening, atmosphere.skyDesaturation),
      }), { priority: SKY_SCENE_OVERRIDE_PRIORITIES.weather });
    } else if ((sky?.setSceneOverrides || sky?.applySettings) && this._baseSky) {
      const overrides = {
        cloudColor: weatheredColor(this._baseSky.cloudColor, atmosphere.skyTint, atmosphere.skyDarkening * 0.45, atmosphere.skyDesaturation),
        cloudCoverage: atmosphere.cloudCoverage,
        cloudShadeColor: weatheredColor(this._baseSky.cloudShadeColor, atmosphere.skyTint, atmosphere.skyDarkening * 0.7, atmosphere.skyDesaturation),
        cloudSpeed: this._baseSky.cloudSpeed * atmosphere.cloudSpeed,
        groundColor: weatheredColor(this._baseSky.groundColor, atmosphere.skyTint, atmosphere.skyDarkening, atmosphere.skyDesaturation),
        horizonColor: weatheredColor(this._baseSky.horizonColor, atmosphere.skyTint, atmosphere.skyDarkening * 0.7, atmosphere.skyDesaturation),
        zenithColor: weatheredColor(this._baseSky.zenithColor, atmosphere.skyTint, atmosphere.skyDarkening, atmosphere.skyDesaturation),
      };
      if (sky.setSceneOverrides) sky.setSceneOverrides(overrides);
      else sky.applySettings(overrides);
    }

    const sunRig = resolveTarget(this.targets.sunRig);
    if (lighting?.setWeatherModulation) {
      lighting.setWeatherModulation({
        ambientScale: atmosphere.ambientIntensity,
        fogColorOverride: atmosphere.fogColor,
        sunColorTint: atmosphere.sunTint,
        sunIntensityScale: atmosphere.sunIntensity,
      });
    } else if (sunRig?.light && this._baseSun) {
      const color = this._baseSun.color.clone();
      color.multiply(new THREE.Color(...atmosphere.sunTint));
      sunRig.setState?.({
        beamOpacity: this._baseSun.beamOpacity === null ? undefined : this._baseSun.beamOpacity * atmosphere.sunIntensity,
        color,
        diskOpacity: this._baseSun.diskOpacity === null ? undefined : this._baseSun.diskOpacity * atmosphere.sunIntensity,
        intensity: this._baseSun.intensity * atmosphere.sunIntensity,
        shaftOpacity: this._baseSun.shaftOpacity === null ? undefined : this._baseSun.shaftOpacity * atmosphere.sunIntensity,
        spillOpacity: this._baseSun.spillOpacity === null ? undefined : this._baseSun.spillOpacity * atmosphere.sunIntensity,
      });
    }
    if (!lighting?.setWeatherModulation) {
      this._applyStandaloneSun(atmosphere);
      for (const [light, intensity] of this._ambientLights) {
        light.intensity = intensity * atmosphere.ambientIntensity;
      }
    }

    if (this.scene) {
      this.scene.fog = this._weatherFog;
      if (!lighting?.setWeatherModulation) {
        const color = atmosphere.fogColor
          ? new THREE.Color(...atmosphere.fogColor)
          : this._baseFog.color;
        this._weatherFog.color.copy(color);
      }
      this._weatherFog.near = this._baseFog.near / atmosphere.fogRangeScale;
      this._weatherFog.far = this._baseFog.far / atmosphere.fogRangeScale;
    }

    const cloudShadow = {
      coverage: atmosphere.cloudShadowCoverage,
      scale: atmosphere.cloudShadowScale,
      strength: atmosphere.cloudShadowStrength,
      velocity: [
        wind.direction[0] * wind.speed * 0.012,
        wind.direction[1] * wind.speed * 0.012,
      ],
    };
    if (this.setCloudShadowAdapter) this.setCloudShadowAdapter(cloudShadow);
    else {
      setEnvironmentCloudShadow(cloudShadow);
      resolveTarget(this.targets.water)?.setCloudShadow?.(cloudShadow);
      resolveTarget(this.targets.grass)?.setCloudShadow?.(cloudShadow);
      resolveTarget(this.targets.flowers)?.setCloudShadow?.(cloudShadow);
      resolveTarget(this.targets.forest)?.setCloudShadow?.(cloudShadow);
      resolveTarget(this.targets.fauna)?.setCloudShadow?.(cloudShadow);
    }

    resolveTarget(this.targets.grass)?.setWind?.({
      direction: wind.direction,
      gustFrequency: wind.gustFrequency,
      gustSpeed: wind.gustSpeed,
      speed: wind.speed,
      strength: wind.strength,
    });
    resolveTarget(this.targets.flowers)?.setWind?.({
      direction: wind.direction,
      speed: wind.speed,
      strength: wind.strength,
    });
    resolveTarget(this.targets.forest)?.setWind?.({
      direction: wind.direction,
      speed: wind.speed,
      strength: wind.strength,
    });
    resolveTarget(this.targets.ambientFx)?.setWind?.({
      windDirection: wind.direction,
      windSpeed: wind.speed,
      windStrength: wind.strength,
    });

    const water = resolveTarget(this.targets.water);
    if (water?.setSceneOverrideLayer) {
      water.setSceneOverrideLayer(this._waterOverrideLayer, (base) => ({
        waveIntensity: Math.min(base.waveIntensity + settings.surface.waterWaveBoost, 1),
      }), { priority: WATER_SCENE_OVERRIDE_PRIORITIES.weather });
    } else {
      water?.applySettings?.({
        waveIntensity: Math.min(this._baseWaterWaveIntensity + settings.surface.waterWaveBoost, 1),
      });
    }
    const surfaceWeather = {
      snowCover: settings.surface.snowCover,
      wetness: settings.surface.wetness,
    };
    resolveTarget(this.targets.grass)?.setSurfaceWeather?.(surfaceWeather);
    resolveTarget(this.targets.flowers)?.setSurfaceWeather?.(surfaceWeather);
    resolveTarget(this.targets.forest)?.setSurfaceWeather?.(surfaceWeather);
    this.precipitation.applyWeatherSettings(settings);
    this.root.userData.weatherSurface = { ...settings.surface };
    this.onSurfaceChange?.({ ...settings.surface });
    this.dispatchEvent({ settings: copySettings(settings), type: 'change' });
    this._dirty = false;
  }

  _resolveCenter() {
    const target = resolveTarget(this.followTarget);
    const camera = resolveTarget(this.camera);
    const targetPosition = targetWorldPosition(target, scratchCenter);
    const cameraPosition = targetWorldPosition(camera, scratchCamera);
    const position = targetPosition ?? cameraPosition ?? scratchCenter.set(0, 0, 0);
    let floorY = targetPosition?.y ?? this.precipitationFloorY;
    if (this.groundHeightAt) floorY = Number(this.groundHeightAt(position.x, position.z)) || floorY;
    return scratchCenter.set(position.x, floorY, position.z);
  }

  _scheduleLightning() {
    const rate = this.settings.lightning.strikesPerMinute;
    if (!(rate > 0)) {
      this._lightningCountdown = Infinity;
      return;
    }
    this._lightningCountdown = (60 / rate) * (0.5 + this.random());
  }

  triggerLightning() {
    if (this._disposed) return this;
    const lightning = this.settings.lightning;
    if (!lightning.enabled) return this;
    const center = this._resolveCenter();
    const angle = this.random() * Math.PI * 2;
    const distance = 60 + this.random() * 240;
    this.lightningLight.position.set(
      center.x + Math.cos(angle) * distance,
      center.y + 35 + this.random() * 80,
      center.z + Math.sin(angle) * distance,
    );
    this._flashRemaining = lightning.duration;
    this.lightningLight.intensity = lightning.intensity;
    this.lightningLight.visible = true;
    this.precipitation.triggerLightning({
      duration: lightning.duration,
      intensity: lightning.intensity,
    });
    const thunderDelay = Math.max(distance / 343, 0.08);
    const event = { distance, position: this.lightningLight.position.clone(), thunderDelay, type: 'lightning' };
    this.dispatchEvent(event);
    this._thunderQueue.push({ distance, remaining: thunderDelay });
    return this;
  }

  _updateLightning(delta) {
    const lightning = this.settings.lightning;
    if (lightning.enabled && lightning.strikesPerMinute > 0) {
      if (!Number.isFinite(this._lightningCountdown) || this._lightningCountdown <= 0) this._scheduleLightning();
      this._lightningCountdown -= delta;
      if (this._lightningCountdown <= 0) {
        this.triggerLightning();
        this._scheduleLightning();
      }
    } else {
      this._lightningCountdown = Infinity;
    }

    if (this._flashRemaining > 0) {
      this._flashRemaining = Math.max(this._flashRemaining - delta, 0);
      const phase = this._flashRemaining / Math.max(lightning.duration, 0.01);
      const stutter = Math.sin(phase * 42) > 0.15 ? 1 : 0.22;
      this.lightningLight.intensity = lightning.intensity * phase * phase * stutter;
      this.lightningLight.visible = this.lightningLight.intensity > 0;
    } else {
      this.lightningLight.intensity = 0;
      this.lightningLight.visible = false;
    }

    for (let index = this._thunderQueue.length - 1; index >= 0; index -= 1) {
      const thunder = this._thunderQueue[index];
      thunder.remaining -= delta;
      if (thunder.remaining <= 0) {
        this.dispatchEvent({ distance: thunder.distance, type: 'thunder' });
        this._thunderQueue.splice(index, 1);
      }
    }
  }

  _updateWaterRipples(delta, center) {
    const water = resolveTarget(this.targets.water);
    const rate = this.settings.surface.waterRippleRate;
    if (!water?.addRipple || !(rate > 0)) return;
    this._rippleAccumulator += rate * delta;
    let count = Math.min(Math.floor(this._rippleAccumulator), 5);
    this._rippleAccumulator -= count;
    const radius = this.settings.precipitation.areaSize * 0.42;
    while (count > 0) {
      count -= 1;
      const angle = this.random() * Math.PI * 2;
      const distance = Math.sqrt(this.random()) * radius;
      scratchRipple.set(
        center.x + Math.cos(angle) * distance,
        water.position?.y ?? 0,
        center.z + Math.sin(angle) * distance,
      );
      water.addRipple(scratchRipple, {
        radius: 0.14 + this.random() * 0.2,
        strength: 0.12 + this.settings.precipitation.intensity * 0.2,
      });
    }
  }

  update(delta = 0.016) {
    if (this._disposed) return this;
    const dt = Math.min(Math.max(Number(delta) || 0.016, 0), 0.1);
    if (this.transition) {
      this.transition.elapsed = Math.min(this.transition.elapsed + dt, this.transition.duration);
      const raw = this.transition.elapsed / this.transition.duration;
      const eased = raw * raw * (3 - 2 * raw);
      this.settings = interpolateWeatherSettings(this.transition.from, this.transition.to, eased);
      this._applyFrame(this.settings);
      if (raw >= 1) {
        this.settings = copySettings(this.transition.to);
        this.transition = null;
      }
    } else if (this._dirty) {
      this._applyFrame(this.settings);
    }
    const center = this._resolveCenter();
    this.precipitation.update(dt, {
      camera: resolveTarget(this.camera),
      center,
      floorY: center.y,
      renderer: resolveTarget(this.renderer),
    });
    this._updateLightning(dt);
    this._updateWaterRipples(dt, center);
    return this;
  }

  toJSON({ id = this.currentPreset ?? 'custom-weather', label = 'Custom Weather' } = {}) {
    return createWeatherPresetDocument(id, { label, settings: this.targetSettings });
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    setEnvironmentState({
      weatherCloudFade: 0,
      weatherOvercast: 0,
      weatherPrecipitation: 0,
      weatherThunder: 0,
      weatherWindMultiplier: 1,
    });
    this.precipitation.dispose();
    this.root.parent?.remove(this.root);
    const lighting = this.lightingSystem;
    this.targets.lighting = null;
    lighting?.setWeatherModulation?.();
    if (this._originalFog?.isFog) {
      if (!lighting?.setWeatherModulation) this._originalFog.color.copy(this._baseFog.color);
      this._originalFog.near = this._baseFog.near;
      this._originalFog.far = this._baseFog.far;
    }
    if (this.scene) this.scene.fog = this._originalFog;
    if (!lighting?.setWeatherModulation) {
      for (const [light, intensity] of this._ambientLights) light.intensity = intensity;
    }
    const sky = resolveTarget(this.targets.sky);
    if (sky?.clearSceneOverrideLayer) {
      sky.clearSceneOverrideLayer(this._skyOverrideLayer);
    } else if (sky?.clearSceneOverrides) {
      sky.clearSceneOverrides();
    } else if (sky?.applySettings && this._baseSky) {
      sky.applySettings(this._baseSky);
    }
    const sunRig = resolveTarget(this.targets.sunRig);
    if (!lighting?.setWeatherModulation && sunRig?.light && this._baseSun) {
      sunRig.setState?.({ color: this._baseSun.color, intensity: this._baseSun.intensity });
    }
    const water = resolveTarget(this.targets.water);
    if (water?.clearSceneOverrideLayer) water.clearSceneOverrideLayer(this._waterOverrideLayer);
    else water?.applySettings?.({ waveIntensity: this._baseWaterWaveIntensity });

    // Weather owns these values only while alive. Restore exact live target
    // baselines when they were inspectable; otherwise disable the effect
    // explicitly instead of leaving the last storm frame behind.
    if (this.setCloudShadowAdapter) this.setCloudShadowAdapter(structuredClone(this._baseCloudShadow));
    else setEnvironmentCloudShadow(this._baseEnvironmentCloudShadow);
    this._restoreTransientTargets({ restoreSun: !lighting?.setWeatherModulation });
    if (!lighting?.setWeatherModulation && this.setSunAdapter && this._baseSceneSun) {
      this.setSunAdapter(structuredClone(this._baseSceneSun));
    }
    this.root.userData.weatherSurface = structuredClone(this._baseSurfaceState);
    this.onSurfaceChange?.(structuredClone(this._baseSurfaceState));
  }
}

export function createWeatherSystem(options = {}) {
  return new WeatherSystem(options);
}
