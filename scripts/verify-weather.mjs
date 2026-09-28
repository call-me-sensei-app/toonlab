// Weather verification — registry coverage, settings/document round trips,
// deterministic precipitation, transitions, and cross-system adapter writes.
// Run with: node scripts/verify-weather.mjs

import process from 'node:process';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';

import {
  AtmosphericEffectsRenderer,
  DEFAULT_SNOW_SURFACE_SETTINGS,
  RainFieldRenderer,
  SNOW_SURFACE_SHADER_FIELD_SCHEMA,
  SNOW_SURFACE_SHADER_ID,
  TOONLAB_RAIN_FIELD_PROFILE,
  TOONLAB_WEATHER_FIELD_PROFILES,
  WeatherFieldRenderer,
  WeatherPrecipitation,
  applySkyWeather,
  createSnowSurfaceSettings,
  createSnowSurfaceUniforms,
  createWeatherPresetDocument,
  createWeatherSettings,
  createWeatherSystem,
  getWeatherPresetOptions,
  getWeatherStyleOptions,
  parseWeatherPresetDocument,
  rebaseWeatherSettingsStyle,
  registerWeatherPresetDocument,
  resolveWeatherPreset,
} from '../src/weather/index.js';
import { createLightingSystem } from '../src/lighting/index.js';
import {
  PRESETS,
  StylizedSky,
  createSkyParams,
  createSkySettings,
  resolveSkyStyleSnapshot,
  toSerializableSkyParams,
} from '../src/sky/index.js';
import { WaterSurface } from '../src/water/index.js';

let failures = 0;
function check(label, condition, detail = '') {
  if (condition) console.log(`ok   ${label}`);
  else {
    failures += 1;
    console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const ids = new Set(getWeatherPresetOptions().map((entry) => entry.id));
for (const id of ['clear', 'fog', 'rain', 'thunderstorm', 'snow', 'blizzard', 'sleet', 'freezingRain', 'hail', 'dustStorm', 'sandstorm']) {
  check(`registry includes ${id}`, ids.has(id));
}
check('registry has broad condition coverage', ids.size >= 20, `count=${ids.size}`);

check('Snow Surface is a separate public shader module',
  SNOW_SURFACE_SHADER_ID === 'snow-surface');
const snowSurfaceFields = Object.values(SNOW_SURFACE_SHADER_FIELD_SCHEMA)
  .flatMap((group) => Object.values(group));
check('Snow Surface exposes its complete initial 18-field contract',
  snowSurfaceFields.length === 18, `count=${snowSurfaceFields.length}`);
const normalizedSnowSurface = createSnowSurfaceSettings({
  color: { powderTint: [0.3, 0.5, 0.9] },
  coverage: { contrast: 4 },
  response: { powderRoughness: -2, sparkleThreshold: 2 },
});
check('Snow Surface preserves valid style color',
  JSON.stringify(normalizedSnowSurface.color.powderTint)
    === JSON.stringify([0.3, 0.5, 0.9]));
check('Snow Surface clamps portable response values',
  normalizedSnowSurface.coverage.contrast === 1
    && normalizedSnowSurface.response.powderRoughness === 0
    && normalizedSnowSurface.response.sparkleThreshold === 0.9999);
check('Snow Surface defaults are independent mutable settings',
  normalizedSnowSurface.color.powderTint !== DEFAULT_SNOW_SURFACE_SETTINGS.color.powderTint);
const snowSurfaceUniforms = createSnowSurfaceUniforms();
check('Snow Surface publishes live TSL routes for every field',
  Object.keys(snowSurfaceUniforms).length === 18
    && snowSurfaceUniforms.uSnowPowderTint?.isNode
    && snowSurfaceUniforms.uSnowSparkleStrength?.isNode);

// Style axis: the signature identity is a STYLE rendered under every
// condition, never a condition entry of its own.
check('call_me_sensei is not listed as a condition', !ids.has('call_me_sensei'));
const styleIds = getWeatherStyleOptions().map((entry) => entry.id);
check('weather styles expose default and call_me_sensei',
  styleIds.includes('default') && styleIds.includes('call_me_sensei'));
const legacySignature = resolveWeatherPreset('call_me_sensei');
check('signature id resolves visible moving cloud-shadow defaults',
  legacySignature.settings.atmosphere.cloudCoverage === 0.48
  && legacySignature.settings.atmosphere.cloudShadowCoverage === 0.55
  && legacySignature.settings.atmosphere.cloudShadowScale === 0.008
  && legacySignature.settings.atmosphere.cloudShadowStrength === 0.52
  && legacySignature.settings.wind.gustFrequency === 0.42);
const plainRain = resolveWeatherPreset('rain');
const styledRain = resolveWeatherPreset('rain', { style: 'call_me_sensei' });
check('conditions keep their meteorological keys under a style',
  styledRain.settings.atmosphere.cloudCoverage === plainRain.settings.atmosphere.cloudCoverage);
check('a style fills rendition character under every condition',
  styledRain.settings.wind.gustFrequency === 0.42);
const legacyStyleSystem = createWeatherSystem({ preset: 'call_me_sensei', style: null });
legacyStyleSystem.setPreset('rain');
check('legacy signature-as-preset construction retains the style across condition changes',
  legacyStyleSystem.currentStyle === 'call_me_sensei'
    && legacyStyleSystem.settings.wind.gustFrequency === styledRain.settings.wind.gustFrequency);
legacyStyleSystem.dispose();
check('snow uses snow precipitation', resolveWeatherPreset('snow').settings.precipitation.type === 'snow');
check('hail uses hail precipitation', resolveWeatherPreset('hail').settings.precipitation.type === 'hail');
check('thunderstorm enables lightning', resolveWeatherPreset('thunderstorm').settings.lightning.enabled === true);
check('dust storm uses airborne dust', resolveWeatherPreset('dustStorm').settings.precipitation.type === 'dust');

const v27Style = resolveSkyStyleSnapshot('2.7');
const authoredVolumetricSky = toSerializableSkyParams(createSkyParams({
  ...PRESETS.partlyCloudy,
  atmosphere: {
    ...PRESETS.partlyCloudy.atmosphere,
    style: v27Style.skyColor,
  },
  cloud: {
    ...PRESETS.partlyCloudy.cloud,
    style: v27Style.cloudStyle,
  },
}));
const authoredVolumetricSkyBeforeWeather = JSON.stringify(authoredVolumetricSky);
const rainyVolumetricSky = applySkyWeather(
  authoredVolumetricSky,
  resolveWeatherPreset('rain').settings,
);
check('volumetric weather composition leaves the authored sky document untouched',
  JSON.stringify(authoredVolumetricSky) === authoredVolumetricSkyBeforeWeather);
check('volumetric weather never changes cloud density',
  rainyVolumetricSky.cloud.shape.density === authoredVolumetricSky.cloud.shape.density);
check('weather sky coverage is calibrated into the volumetric threshold domain',
  rainyVolumetricSky.cloud.shape.coverage > authoredVolumetricSky.cloud.shape.coverage
    && rainyVolumetricSky.cloud.shape.coverage
      < resolveWeatherPreset('rain').settings.atmosphere.cloudCoverage);
check('dark weather keeps the V2.7 night cloud stage readable',
  rainyVolumetricSky.cloud.style.timePalette.nightBrightness
    > authoredVolumetricSky.cloud.style.timePalette.nightBrightness
    && rainyVolumetricSky.cloud.style.timePalette.nightContrast
      < authoredVolumetricSky.cloud.style.timePalette.nightContrast);

const overcastAboveClouds = toSerializableSkyParams(applySkyWeather(
  authoredVolumetricSky,
  resolveWeatherPreset('overcast').settings,
  { aboveClouds: true },
));
check('overcast above clouds keeps the clear upper atmosphere',
  JSON.stringify(overcastAboveClouds.atmosphere)
    === JSON.stringify(authoredVolumetricSky.atmosphere));
check('overcast above clouds keeps full sunlight and cloud-top lighting',
  JSON.stringify(overcastAboveClouds.sun) === JSON.stringify(authoredVolumetricSky.sun)
    && JSON.stringify(overcastAboveClouds.cloud.lighting)
      === JSON.stringify(authoredVolumetricSky.cloud.lighting)
    && JSON.stringify(overcastAboveClouds.cloud.style)
      === JSON.stringify(authoredVolumetricSky.cloud.style));
check('overcast above clouds still uses weather coverage and wind',
  overcastAboveClouds.cloud.shape.coverage > authoredVolumetricSky.cloud.shape.coverage
    && overcastAboveClouds.cloud.wind.speed
      === authoredVolumetricSky.cloud.wind.speed
        * resolveWeatherPreset('overcast').settings.atmosphere.cloudSpeed);

const normalized = createWeatherSettings({
  atmosphere: { cloudCoverage: 9 },
  precipitation: { intensity: -2, type: 'unknown' },
  surface: { snowCover: 3 },
});
check('settings clamp cloud coverage', normalized.atmosphere.cloudCoverage === 1);
check('settings clamp precipitation intensity', normalized.precipitation.intensity === 0);
check('settings reject unknown precipitation type', normalized.precipitation.type === 'none');
check('settings clamp surface outputs', normalized.surface.snowCover === 1);

const document = createWeatherPresetDocument('custom-storm', {
  label: 'Custom Storm',
  settings: resolveWeatherPreset('thunderstorm').settings,
});
const parsed = parseWeatherPresetDocument(JSON.stringify(document));
check('preset document round-trips', parsed.ok && parsed.value.id === 'custom-storm');
check('document preserves lightning', parsed.value.settings.lightning.enabled === true);
registerWeatherPresetDocument(parsed.value, { overwrite: true });
const styledCustomStorm = resolveWeatherPreset('custom-storm', { style: 'call_me_sensei' });
check('registered custom conditions remain renderable through an IP-wide style',
  styledCustomStorm.style === 'call_me_sensei'
    && styledCustomStorm.settings.lightning.enabled === true
    && styledCustomStorm.settings.atmosphere.cloudShadowCoverage === 0.55);
const editedRain = createWeatherSettings({
  ...styledRain.settings,
  surface: { ...styledRain.settings.surface, wetness: 0.63 },
});
const defaultEditedRain = rebaseWeatherSettingsStyle(editedRain, {
  condition: 'rain',
  fromStyle: 'call_me_sensei',
  toStyle: 'default',
});
check('Weather style changes preserve condition identity and authored edits',
  defaultEditedRain.precipitation.type === 'rain'
    && defaultEditedRain.surface.wetness === 0.63
    && defaultEditedRain.wind.gustFrequency === plainRain.settings.wind.gustFrequency);

function seedHash(layer) {
  const values = layer.geometry.attributes.aWeatherSeed.array;
  let hash = 0x811c9dc5;
  for (let index = 0; index < Math.min(values.length, 1024); index += 1) {
    hash ^= Math.round(values[index] * 65535);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

const snowA = new WeatherPrecipitation({ maxParticles: 1200, seed: 42, settings: resolveWeatherPreset('snow').settings.precipitation });
const snowB = new WeatherPrecipitation({ maxParticles: 1200, seed: 42, settings: resolveWeatherPreset('snow').settings.precipitation });
const snowC = new WeatherPrecipitation({ maxParticles: 1200, seed: 43, settings: resolveWeatherPreset('snow').settings.precipitation });
check('precipitation seeds are deterministic', seedHash(snowA) === seedHash(snowB));
check('different precipitation seed changes the field', seedHash(snowA) !== seedHash(snowC));
check('precipitation stays one draw call', snowA.isMesh && snowA.geometry.instanceCount > 0);
check('precipitation respects capacity', snowA.geometry.instanceCount <= snowA.capacity);

const rainField = new RainFieldRenderer();
rainField.applyFrame({
  ceiling: { amount: 1 },
  flow: { directionDegrees: 36, maximum: 8, minimum: 4 },
  precipitation: {
    emission: { rain: 500 },
    rain: { amount: 1, tint: [0.701102, 0.947307, 1, 0.7] },
  },
});
const sourceRainCamera = new THREE.PerspectiveCamera(58, 16 / 9, 0.05, 1000);
sourceRainCamera.position.set(0, 2, 0);
sourceRainCamera.lookAt(0, 2, -1);
sourceRainCamera.updateMatrixWorld(true);
rainField.update(1 / 60, {
  camera: sourceRainCamera,
  floorY: 0,
  renderer: {
    getDrawingBufferSize(target) { return target.set(1280, 720); },
  },
});
check('rain field keeps drops and collision splashes as independent draws',
  rainField.children.length === 2
    && rainField.drops.isMesh
    && rainField.splashes.isMesh);
check('rain field profile preserves useful starting dimensions and velocity',
  JSON.stringify(TOONLAB_RAIN_FIELD_PROFILE.drops.widthMeters)
      === JSON.stringify([0.03, 0.04])
    && JSON.stringify(TOONLAB_RAIN_FIELD_PROFILE.drops.lengthMeters)
      === JSON.stringify([0.5, 0.8])
    && JSON.stringify(TOONLAB_RAIN_FIELD_PROFILE.drops.velocityMetersPerSecond)
      === JSON.stringify([30, 40]));
check('rain field uses a camera-local spawn transform',
  rainField.drops.material.uniforms.uCenter.value.distanceTo(
    new THREE.Vector3(0, 10, -10),
  ) < 0.0001);
check('downpour maps rate to live drops and collision splashes',
  rainField.drops.geometry.instanceCount === 1000
    && rainField.splashes.geometry.instanceCount === 80);
check('rain is additive, depth-tested, and not a screen overlay',
  rainField.drops.material.blending === THREE.AdditiveBlending
    && rainField.drops.material.depthTest
    && rainField.drops.material.depthWrite === false);
rainField.dispose();

const atmosphericEffects = new AtmosphericEffectsRenderer();
atmosphericEffects.applyFrame({
  profile: { id: 'whiteout' },
  ceiling: { amount: 1 },
  fog: { mist: { amount: 1, tint: [0.5, 0.7, 1, 0.2] } },
  precipitation: {
    emission: { flakes: 800, mist: 25 },
    embers: { amount: 0, size: 1, tint: [1, 0.4, 0.2, 1], turbulence: 1 },
    flakes: {
      amount: 1,
      gravity: 0,
      size: 1,
      tint: [1.35, 1.42, 1.5, 0.6],
      turbulence: 1.4,
    },
  },
  electric: {
    farArc: 0.5,
    farFlash: 0.3,
    nearRate: 0,
    tintHigh: [0.04, 0.07, 1],
    tintLow: [0.04, 0.2, 1],
  },
  flow: {
    directionDegrees: 36,
    maximum: 9,
    minimum: 6,
    streakAmount: 1,
    streakOpacity: 0.2,
  },
});
atmosphericEffects.update(1 / 60, {
  camera: sourceRainCamera,
  floorY: 0,
  renderer: {
    getDrawingBufferSize(target) { return target.set(1280, 720); },
  },
});
check('snow uses a camera-local three-dimensional particle field',
  TOONLAB_WEATHER_FIELD_PROFILES.flakes.cylinderRadiusMeters === 20
    && TOONLAB_WEATHER_FIELD_PROFILES.flakes.cylinderHeightMeters === 6
    && TOONLAB_WEATHER_FIELD_PROFILES.flakes.lifetimeSeconds === 4
    && atmosphericEffects.flakes.geometry.instanceCount === 3200);
check('snow keeps authored-scale flakes, gravity, turbulence, and depth testing',
  JSON.stringify(TOONLAB_WEATHER_FIELD_PROFILES.flakes.sizeMeters)
      === JSON.stringify([0.06, 0.12])
    && TOONLAB_WEATHER_FIELD_PROFILES.flakes.gravityMetersPerSecondSquared === 2
    && atmosphericEffects.flakes.material.depthTest
    && atmosphericEffects.flakes.material.depthWrite === false);
check('mist, embers, wind streaks, and electrical events are separate renderers',
  atmosphericEffects.mist.isMesh
    && atmosphericEffects.embers.isMesh
    && atmosphericEffects.windStreaks.isMesh
    && atmosphericEffects.electrical.isGroup
    && atmosphericEffects.mist.geometry.instanceCount === 75);
atmosphericEffects.dispose();

const unifiedFields = new WeatherFieldRenderer({
  electricalMode: 'manual',
  seed: 73,
});
unifiedFields.applyWeatherSettings(resolveWeatherPreset('heavyRain').settings);
check('unified weather routes rain through separate drop and splash fields',
  unifiedFields.rain.drops.visible
    && unifiedFields.rain.splashes.visible
    && !unifiedFields.effects.flakes.visible);
unifiedFields.applyWeatherSettings(resolveWeatherPreset('heavySnow').settings);
check('unified weather routes snow through the camera-local flake field',
  !unifiedFields.rain.drops.visible
    && unifiedFields.effects.flakes.visible
    && unifiedFields.effects.flakes.material.uniforms.uShape.value === 0);
unifiedFields.applyWeatherSettings(resolveWeatherPreset('hail').settings);
check('unified weather gives hail its pellet topology',
  unifiedFields.effects.flakes.visible
    && unifiedFields.effects.flakes.material.uniforms.uShape.value === 2);
unifiedFields.applyWeatherSettings(resolveWeatherPreset('dustStorm').settings);
check('unified weather gives dust a dark-particle-safe field',
  unifiedFields.effects.flakes.visible
    && unifiedFields.effects.flakes.material.uniforms.uShape.value === 1
    && unifiedFields.effects.flakes.material.blending === THREE.NormalBlending);
unifiedFields.applyWeatherSettings(resolveWeatherPreset('thunderstorm').settings);
unifiedFields.triggerLightning();
check('unified weather exposes coordinated branch and cloud-flash lightning',
  unifiedFields.effects.electrical.manualStrength > 0);
unifiedFields.dispose();

const migratedWeatherConsumers = [
  '../src/weather/weatherSystem.js',
  '../labs/tree-lab/engine/skyWeather.js',
].map((relativePath) => readFileSync(
  new URL(relativePath, import.meta.url),
  'utf8',
));
check('all first-party weather consumers use the unified field renderer',
  migratedWeatherConsumers.every((source) => (
    source.includes('WeatherFieldRenderer')
      && !source.includes('new WeatherPrecipitation')
  )));

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xa9c9e8, 100, 700);
const camera = new THREE.PerspectiveCamera();
camera.position.set(2, 6, 3);
camera.updateMatrixWorld();
const ambient = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambient);
const calls = { cloud: null, grass: null, surface: null, water: null };
const grass = {
  setCloudShadow(value) { calls.cloud = value; },
  setWind(value) { calls.grass = value; },
};
const water = new THREE.Object3D();
water.settings = { waveIntensity: 0.2 };
water.applySettings = (value) => { calls.water = value; water.settings = { ...water.settings, ...value }; };
water.setCloudShadow = (value) => { calls.cloud = value; };
water.addRipple = () => {};
const sky = {
  settings: createSkySettings({ preset: 'golden_hour' }),
  applySettings(value) { this.settings = createSkySettings({ ...this.settings, ...value }); },
};
const baseSky = structuredClone(sky.settings);
const system = createWeatherSystem({
  camera,
  grass,
  onSurfaceChange: (value) => { calls.surface = value; },
  preset: 'clear',
  scene,
  seed: 99,
  sky,
  water,
});
check('WeatherSystem defaults to the signature style on an explicit condition',
  system.currentPreset === 'clear' && system.currentStyle === 'call_me_sensei');
check('WeatherSystem renders through the unified field stack',
  system.precipitation instanceof WeatherFieldRenderer);
system.setPreset('rain');
check('WeatherSystem keeps its style identity when the condition changes',
  system.currentStyle === 'call_me_sensei'
    && system.settings.wind.gustFrequency === styledRain.settings.wind.gustFrequency);
system.setPreset('thunderstorm');
check('weather writes shared wind', calls.grass.strength === resolveWeatherPreset('thunderstorm').settings.wind.strength);
check('weather writes shared cloud shadow', calls.cloud.strength === 0);
check('weather writes water response', calls.water.waveIntensity > 0.2);
check('weather publishes surface response', calls.surface.wetness === 1);
check('weather scales scene fog', scene.fog.far < 700);
check('weather scales ambient lights', ambient.intensity < 0.5);
check('weather modulates the active sky', sky.settings.cloudCoverage !== baseSky.cloudCoverage);

let lightningEvents = 0;
system.addEventListener('lightning', () => { lightningEvents += 1; });
system.triggerLightning();
check('manual lightning emits an event', lightningEvents === 1);
check('lightning creates a visible flash', system.lightningLight.visible === true);

system.setPreset('clear');
system.transitionTo('snow', { duration: 1 });
for (let index = 0; index < 12; index += 1) system.update(0.1);
check('weather transition reaches its target', system.transition === null && system.settings.precipitation.type === 'snow');
check('transition updates precipitation renderer', system.precipitation.geometry.instanceCount > 0);

system.dispose();
snowA.dispose();
snowB.dispose();
snowC.dispose();
check('dispose restores original scene fog object', scene.fog !== null && scene.fog.far === 700);
check('dispose restores the authored sky baseline', JSON.stringify(sky.settings) === JSON.stringify(baseSky));

// Standalone Weather is a reversible runtime owner. Capture non-default live
// baselines, drive a rainy frame over them, then prove teardown restores every
// transient target (or adapter) instead of leaving the last storm behind.
const lifecycleWind = {
  direction: [0.2, 0.9],
  gustFrequency: 0.17,
  gustSpeed: 0.62,
  speed: 0.74,
  strength: 0.08,
};
const lifecycleCloud = {
  coverage: 0.31,
  scale: 0.019,
  strength: 0.12,
  velocity: [0.007, -0.003],
};
const lifecycleSurface = { snowCover: 0.14, wetness: 0.22 };
const lifecycleSunBaseline = {
  color: [0.91, 0.82, 0.68],
  direction: [0.25, 0.83, 0.41],
  sky: [0.52, 0.7, 0.9],
};
const lifecycleState = {
  cloud: structuredClone(lifecycleCloud),
  surface: structuredClone(lifecycleSurface),
  wind: structuredClone(lifecycleWind),
};
const lifecycleGrass = {
  material: {
    uniforms: {
      uCloudShadowCoverage: { value: lifecycleCloud.coverage },
      uCloudShadowScale: { value: lifecycleCloud.scale },
      uCloudShadowStrength: { value: lifecycleCloud.strength },
      uCloudShadowVelocity: { value: new THREE.Vector2(...lifecycleCloud.velocity) },
      uGustFrequency: { value: lifecycleWind.gustFrequency },
      uGustSpeed: { value: lifecycleWind.gustSpeed },
      uSnowCover: { value: lifecycleSurface.snowCover },
      uWetness: { value: lifecycleSurface.wetness },
      uWindDirection: { value: new THREE.Vector2(...lifecycleWind.direction) },
      uWindSpeed: { value: lifecycleWind.speed },
      uWindStrength: { value: lifecycleWind.strength },
    },
  },
  setCloudShadow(value) { lifecycleState.cloud = { ...lifecycleState.cloud, ...structuredClone(value) }; },
  setSurfaceWeather(value) { lifecycleState.surface = { ...lifecycleState.surface, ...structuredClone(value) }; },
  setWind(value) { lifecycleState.wind = { ...lifecycleState.wind, ...structuredClone(value) }; },
};
const ambientWindBaseline = { windDirection: [-0.4, 0.7], windSpeed: 0.55, windStrength: 0.06 };
let ambientWindState = structuredClone(ambientWindBaseline);
const lifecycleAmbientFx = {
  settings: { shared: structuredClone(ambientWindBaseline) },
  setWind(value) { ambientWindState = { ...ambientWindState, ...structuredClone(value) }; },
};
const cloudAdapterBaseline = { coverage: 0.28, scale: 0.015, strength: 0.09, velocity: [-0.004, 0.006] };
const cloudAdapterCalls = [];
const surfaceAdapterBaseline = {
  ice: 0.04,
  snowCover: 0.14,
  waterRippleRate: 0.2,
  waterWaveBoost: 0.03,
  wetness: 0.22,
};
const surfaceAdapterCalls = [];
const sunAdapterCalls = [];
let lifecycleSunState = structuredClone(lifecycleSunBaseline);
const lifecycleSystem = createWeatherSystem({
  ambientFx: lifecycleAmbientFx,
  cloudShadowBaseline: cloudAdapterBaseline,
  getSun: () => structuredClone(lifecycleSunState),
  grass: lifecycleGrass,
  onSurfaceChange: (value) => surfaceAdapterCalls.push(structuredClone(value)),
  preset: 'rain',
  setCloudShadow: (value) => cloudAdapterCalls.push(structuredClone(value)),
  setSun: (value) => {
    lifecycleSunState = structuredClone(value);
    sunAdapterCalls.push(structuredClone(value));
  },
  surfaceBaseline: surfaceAdapterBaseline,
});
check('standalone Weather drives the world sun adapter',
  sunAdapterCalls.length > 0
    && JSON.stringify(lifecycleSunState.sky) !== JSON.stringify(lifecycleSunBaseline.sky));
check('Weather temporarily replaces captured wind and surface state',
  lifecycleState.wind.strength === resolveWeatherPreset('rain').settings.wind.strength
    && lifecycleState.surface.wetness === resolveWeatherPreset('rain').settings.surface.wetness
    && ambientWindState.windStrength === resolveWeatherPreset('rain').settings.wind.strength);
lifecycleSystem.dispose();
check('dispose restores captured vegetation wind exactly',
  JSON.stringify(lifecycleState.wind) === JSON.stringify(lifecycleWind));
check('dispose restores captured vegetation cloud and surface state exactly',
  JSON.stringify(lifecycleState.cloud) === JSON.stringify(lifecycleCloud)
    && JSON.stringify(lifecycleState.surface) === JSON.stringify(lifecycleSurface));
check('dispose restores captured Ambient FX wind using its public key shape',
  JSON.stringify(ambientWindState) === JSON.stringify(ambientWindBaseline));
check('dispose restores host cloud and surface adapters',
  JSON.stringify(cloudAdapterCalls.at(-1)) === JSON.stringify(cloudAdapterBaseline)
    && JSON.stringify(surfaceAdapterCalls.at(-1)) === JSON.stringify(surfaceAdapterBaseline));
check('dispose restores the standalone world sun adapter baseline',
  JSON.stringify(lifecycleSunState) === JSON.stringify(lifecycleSunBaseline));

// Real-system composition: Lighting remains the sole sun/fog/ambient writer,
// while Weather supplies modulation and a higher-priority Sky resolver.
const composedScene = new THREE.Scene();
composedScene.fog = new THREE.Fog(0xa9c9e8, 100, 700);
const composedSky = new StylizedSky({ preset: 'golden_hour' });
const composedAuthoredSky = structuredClone(composedSky.settings);
const composedSun = new THREE.DirectionalLight(0xffffff, 2);
const composedSunRig = {
  light: composedSun,
  setState(value = {}) {
    if (value.color?.isColor) composedSun.color.copy(value.color);
    if (Number.isFinite(value.intensity)) composedSun.intensity = value.intensity;
  },
};
const composedWater = new WaterSurface({
  depth: 1,
  passes: false,
  segmentsPerMeter: 1,
  simulation: false,
  splashes: false,
  waveIntensity: 0.2,
  width: 1,
});
const composedWeather = createWeatherSystem({
  preset: 'rain',
  scene: composedScene,
  sky: composedSky,
  sunRig: composedSunRig,
  water: composedWater,
});
const composedLighting = createLightingSystem({
  scene: composedScene,
  style: 'call-me-sensei',
  timeOfDay: 12,
});
const originalWorldSunDirection = [0.35, 0.8, 0.45];
let composedWorldSunDirection = [...originalWorldSunDirection];
const composedWorld = {
  environmentRoot: new THREE.Group(),
  fog: composedScene.fog,
  get sunDirection() { return [...composedWorldSunDirection]; },
  setSunDirection(value) { composedWorldSunDirection = [...value]; },
  sky: composedSky,
  sunRig: composedSunRig,
  weather: composedWeather,
  water: composedWater,
};
composedLighting.attachWorld(composedWorld);
const rainSunScale = resolveWeatherPreset('rain').settings.atmosphere.sunIntensity;
check('attachWorld bridges Weather into the one-writer Lighting modulation API',
  composedWeather.lightingSystem === composedLighting);
check('composed sun is Lighting frame multiplied by Weather',
  Math.abs(composedSun.intensity - composedLighting.frame.sunIntensity * rainSunScale) < 1e-8);
const composedSunBeforeRefresh = composedSun.intensity;
composedWeather.refresh();
check('Weather refresh cannot race or replace the Lighting-owned sun',
  Math.abs(composedSun.intensity - composedSunBeforeRefresh) < 1e-8);
composedLighting.setTimeOfDay(18);
check('time-of-day changes retain active Weather modulation',
  Math.abs(composedSun.intensity - composedLighting.frame.sunIntensity * rainSunScale) < 1e-8);
check('attachWorld drives the world-owned sun direction adapter',
  JSON.stringify(composedWorldSunDirection) === JSON.stringify([
    composedLighting.frame.sunSourceRatios.x,
    composedLighting.frame.sunSourceRatios.y,
    composedLighting.frame.sunSourceRatios.z,
  ]));
check('Lighting and Weather occupy independent ordered Sky layers',
  composedSky.sceneOverrideLayers.length === 2
    && composedSky.sceneOverrideLayers[0].priority < composedSky.sceneOverrideLayers[1].priority);
check('system composition leaves the portable Sky baseline untouched',
  JSON.stringify(composedSky.settings) === JSON.stringify(composedAuthoredSky));
const rainWaveBoost = resolveWeatherPreset('rain').settings.surface.waterWaveBoost;
check('Weather adds transient Water energy without changing the portable baseline',
  composedWater.settings.waveIntensity === 0.2
    && Math.abs(composedWater.renderedSettings.waveIntensity - (0.2 + rainWaveBoost)) < 1e-8
    && JSON.stringify(composedWater.renderedSettings.sunDirection)
      === JSON.stringify(composedWorldSunDirection)
    && composedWater.sceneOverrideLayers.length === 2);
composedLighting.detach();
check('detaching Lighting returns ownership to standalone Weather',
  composedWeather.lightingSystem === null
    && Math.abs(composedSun.intensity - 2 * rainSunScale) < 1e-8);
check('Lighting detach clears only its own Sky layer', composedSky.sceneOverrideLayers.length === 1);
check('Lighting detach restores world direction and leaves only Weather on Water',
  JSON.stringify(composedWorldSunDirection) === JSON.stringify(originalWorldSunDirection)
    && composedWater.sceneOverrideLayers.length === 1);
composedLighting.attachWorld(composedWorld);
composedWeather.dispose();
check('disposing Weather clears only Weather-owned Sky and Water layers',
  composedSky.sceneOverrideLayers.length === 1
    && composedWater.sceneOverrideLayers.length === 1
    && composedWater.renderedSettings.waveIntensity === composedWater.settings.waveIntensity);
composedWeather.refresh();
check('disposed Weather cannot resurrect runtime layers',
  composedSky.sceneOverrideLayers.length === 1 && composedWater.sceneOverrideLayers.length === 1);
composedLighting.detach();
check('Lighting detaches cleanly after Weather was already disposed',
  composedSky.sceneOverrideLayers.length === 0 && composedWater.sceneOverrideLayers.length === 0);
composedLighting.dispose();
composedWater.dispose();
composedSky.dispose();

// If Weather is disposed before Lighting, the later Lighting detach must
// restore the pre-Weather world/rig baseline, not the rainy state Lighting
// observed when it originally attached.
const handoffScene = new THREE.Scene();
const handoffSun = new THREE.DirectionalLight(0xffffff, 2);
const opacitySlot = (value) => ({ material: { uniforms: { opacity: { value } } } });
const handoffRig = {
  beam: opacitySlot(0.28),
  disk: opacitySlot(0.62),
  light: handoffSun,
  shaft: opacitySlot(0.1),
  spill: opacitySlot(0.3),
  setState(value = {}) {
    if (value.color?.isColor) handoffSun.color.copy(value.color);
    if (Number.isFinite(value.intensity)) handoffSun.intensity = value.intensity;
    for (const key of ['beam', 'disk', 'shaft', 'spill']) {
      const opacity = value[`${key}Opacity`];
      if (Number.isFinite(opacity)) this[key].material.uniforms.opacity.value = opacity;
    }
  },
};
const handoffBaseline = {
  color: [1, 1, 1],
  direction: [0.35, 0.8, 0.45],
  sky: [0.62, 0.78, 0.95],
};
let handoffSunState = structuredClone(handoffBaseline);
const handoffWeather = createWeatherSystem({
  getSun: () => structuredClone(handoffSunState),
  preset: 'rain',
  setSun: (value) => { handoffSunState = structuredClone(value); },
  sunRig: handoffRig,
});
const handoffLighting = createLightingSystem({ scene: handoffScene, timeOfDay: 18 });
const handoffWorld = {
  get sunDirection() { return handoffSunState.direction.slice(); },
  get sunState() { return structuredClone(handoffSunState); },
  setSun(value) {
    handoffSunState = structuredClone(value);
    handoffSun.color.setRGB(...value.color);
  },
  setSunDirection(value) { handoffSunState.direction = [...value]; },
  sunRig: handoffRig,
  weather: handoffWeather,
};
handoffLighting.attachWorld(handoffWorld);
handoffWeather.dispose();
handoffLighting.detach();
check('disposing Weather before Lighting still restores the pre-Weather world sun',
  JSON.stringify(handoffSunState) === JSON.stringify(handoffBaseline));
check('disposing Weather before Lighting still restores the pre-Weather physical sun rig',
  handoffSun.intensity === 2
    && handoffRig.beam.material.uniforms.opacity.value === 0.28
    && handoffRig.disk.material.uniforms.opacity.value === 0.62
    && handoffRig.shaft.material.uniforms.opacity.value === 0.1
    && handoffRig.spill.material.uniforms.opacity.value === 0.3);
handoffLighting.dispose();

if (failures > 0) {
  console.error(`\n${failures} weather verification failure${failures === 1 ? '' : 's'}.`);
  process.exit(1);
}
console.log(`\nWeather verification passed (${ids.size} conditions).`);
