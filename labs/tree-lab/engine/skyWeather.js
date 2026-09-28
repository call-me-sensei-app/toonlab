// Sky + weather rig for Tree Lab: a gradient sky dome driven by the
// shared time-of-day sampler (src/environment/environmentTimeOfDay.js), plus
// a weather layer (clear / cloudy / overcast / rain) that scales sun,
// ambient, fog, grass cloud shadows, and spawns rain streaks. Environment
// presentation is session state — never part of the recipe or exports.

import * as THREE from 'three';
import { max, mix, normalize, positionLocal, pow, sRGBTransferEOTF, uniform, vec4 } from 'three/tsl';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { sampleEnvironmentTimeOfDay } from '../../../src/environment/environmentTimeOfDay.js';
import {
  WeatherFieldRenderer,
  getWeatherPresetOptions,
  resolveWeatherPreset,
} from '../../../src/weather/index.js';

// Compatibility facade for the existing lab UI. The data now comes from the
// public weather registry, so every asset lab previews the same conditions.
export const WEATHER_PRESETS = Object.freeze(Object.fromEntries(
  getWeatherPresetOptions().map(({ id, label }) => {
    const settings = resolveWeatherPreset(id).settings;
    return [id, Object.freeze({
      ambientScale: settings.atmosphere.ambientIntensity,
      cloudShadow: settings.atmosphere.cloudShadowStrength,
      fogColor: settings.atmosphere.fogColor,
      fogScale: settings.atmosphere.fogRangeScale,
      label,
      precipitation: settings.precipitation,
      settings,
      skyGray: settings.atmosphere.skyDesaturation,
      sunScale: settings.atmosphere.sunIntensity,
      wind: settings.wind,
    })];
  }),
));

function desaturate(color, amount) {
  const gray = color.r * 0.299 + color.g * 0.587 + color.b * 0.114;
  color.lerp(new THREE.Color(gray, gray, gray), amount);
  return color;
}

// The TSL gradient pre-decodes to preserve the original on-screen colors
// through the WebGPURenderer's output transform.
function createDomeMaterial() {
  const uniforms = {
    uGroundColor: uniform(new THREE.Color(0xa9d7ea)),
    uTopColor: uniform(new THREE.Color(0x5da4e8)),
  };
  const material = new MeshBasicNodeMaterial({
    depthWrite: false,
    side: THREE.BackSide,
  });
  material.name = 'DesignerSky';
  material.fog = false;
  material.lights = false;
  const t = pow(max(normalize(positionLocal).y, 0.0), 0.55);
  material.colorNode = vec4(
    sRGBTransferEOTF(mix(uniforms.uGroundColor, uniforms.uTopColor, t)),
    1.0,
  );
  material.uniforms = uniforms;
  return material;
}

export function createSkyWeather({ engine, grass = null, store }) {
  const {
    ambient, camera, controls, hemi, scene, sun,
  } = engine;
  const baseFog = { far: scene.fog.far, near: scene.fog.near };

  // --- Gradient sky dome ----------------------------------------------------
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(320, 32, 16),
    createDomeMaterial(),
  );
  dome.renderOrder = -1;
  scene.add(dome);
  scene.background = null;

  // --- Shared precipitation runtime -----------------------------------------
  const precipitation = new WeatherFieldRenderer({ seed: 31 });
  const precipitationCenter = new THREE.Vector3();
  scene.add(precipitation);
  engine.onFrame((delta) => {
    precipitationCenter.set(controls.target.x, 0, controls.target.z);
    precipitation.update(delta, {
      camera,
      center: precipitationCenter,
      floorY: precipitationCenter.y,
      renderer: engine.renderer,
    });
  });

  // --- Apply hour + weather ---------------------------------------------------
  function apply() {
    const { sky } = store.getState();
    const weather = WEATHER_PRESETS[sky.weather] ?? WEATHER_PRESETS.clear;
    const state = sampleEnvironmentTimeOfDay(sky.hour);

    // Sun: keyframed color/intensity/direction, dimmed by weather. The base
    // designer sun is 1.6 at noon-ish, so scale against intensity 1.0 = 1.6.
    sun.color.copy(state.sunColor);
    sun.intensity = 1.6 * state.sunIntensity * weather.sunScale;
    const ratios = state.sunSourceRatios;
    sun.position.set(ratios.x * 40, ratios.y * 40, ratios.z * 40);
    ambient.intensity = 0.55 * state.ambientScale * weather.ambientScale;
    hemi.intensity = 0.5 * state.ambientScale * weather.ambientScale;

    // Sky dome + fog, grayed by weather. The sampler's sky values are TINTS
    // over a base sky, not absolute colors — multiply the designer's blues.
    const top = desaturate(
      new THREE.Color(0x5da4e8).multiply(state.skyTopTint), weather.skyGray);
    const groundTint = desaturate(
      new THREE.Color(0xa9d7ea).multiply(state.skyGroundTint), weather.skyGray);
    dome.material.uniforms.uTopColor.value.copy(top);
    dome.material.uniforms.uGroundColor.value.copy(groundTint);
    const fogColor = weather.fogColor
      ? new THREE.Color(...weather.fogColor)
      : desaturate(state.fogColor.clone(), weather.skyGray * 0.6);
    scene.fog.color.copy(fogColor);
    scene.fog.near = baseFog.near / weather.fogScale;
    scene.fog.far = baseFog.far / weather.fogScale;

    precipitation.applyWeatherSettings(weather.settings);

    // Grass reacts: cloud shadows sweep in cloudy weather.
    grass?.applySettings({
      cloudShadowStrength: weather.cloudShadow,
      sunColor: `#${state.sunColor.getHexString()}`,
    });

    // The toon canopy shader takes its own sun; keep it in step. Its sky
    // term drives the SHADOW side — soften the dome blue toward white or
    // shadowed leaves go navy.
    const canopySky = top.clone().lerp(new THREE.Color(1, 1, 1), 0.6);
    const direction = [ratios.x, ratios.y, ratios.z];
    // Dim foliage with the sun (floor keeps night readable, not black).
    const lightScale = Math.min(1, 0.3 + state.sunIntensity * weather.sunScale * 0.8);
    const sunColor = [
      state.sunColor.r * lightScale,
      state.sunColor.g * lightScale,
      state.sunColor.b * lightScale,
    ];
    canopySky.multiplyScalar(lightScale);
    engine.getPlant()?.setSun({
      direction,
      color: sunColor,
      sky: [canopySky.r, canopySky.g, canopySky.b],
    });
  }

  // Re-apply after every rebuild — rebuild() resets the plant's sun.
  engine.onRebuilt(() => apply());

  let lastSky = null;
  store.subscribe(() => {
    const { sky } = store.getState();
    if (sky !== lastSky) {
      lastSky = sky;
      apply();
    }
  });
  apply();

  return { apply };
}
