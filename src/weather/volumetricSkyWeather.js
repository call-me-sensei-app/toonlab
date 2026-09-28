// Transient weather composition for the volumetric SkySystem.
//
// Weather is scene state, not authored sky style. This adapter therefore takes
// an immutable SkyParams baseline and returns a composed runtime value; callers
// keep the baseline and re-run this function whenever the condition changes.

import * as THREE from 'three';

import {
  createSkyParams,
  toSerializableSkyParams,
} from '../sky/skyParams.js';
import { createWeatherSettings } from './weatherSettings.js';

function clamp01(value) {
  return Math.min(Math.max(Number(value) || 0, 0), 1);
}

function volumetricCoverage(baseCoverage, skyCoverage) {
  const base = clamp01(baseCoverage);
  const requested = clamp01(skyCoverage);
  if (requested <= base) return requested;
  // Weather expresses the desired fraction of occupied sky. The volumetric
  // control is instead a threshold over an already-authored coverage map, and
  // 1 means "use the full map." Compress only the upper half of the weather
  // range so overcast conditions broaden the deck without becoming a slab.
  return Math.min(0.84, base + (requested - base) * 0.72);
}

function weatherColor(source, tint, darkening, desaturation) {
  const channels = source?.isColor
    ? [source.r, source.g, source.b]
    : Array.isArray(source) ? source : [1, 1, 1];
  const dark = clamp01(darkening);
  const grayAmount = clamp01(desaturation);
  const colored = channels.map((value, index) => (
    value * (tint[index] ?? 1) * (1 - dark)
  ));
  const gray = colored[0] * 0.299 + colored[1] * 0.587 + colored[2] * 0.114;
  return colored.map((value) => value + (gray - value) * grayAmount);
}

function tintCloudStyle(style, atmosphere) {
  const tint = atmosphere.skyTint;
  const gray = atmosphere.skyDesaturation;
  const dark = atmosphere.skyDarkening;
  return {
    ...style,
    tone: {
      ...style.tone,
      shadowColor: weatherColor(style.tone.shadowColor, tint, dark * 0.7, gray),
      midColor: weatherColor(style.tone.midColor, tint, dark * 0.55, gray),
      lightColor: weatherColor(style.tone.lightColor, tint, dark * 0.4, gray),
    },
    blueShadow: {
      ...style.blueShadow,
      color: weatherColor(style.blueShadow.color, tint, dark * 0.65, gray),
    },
    whiteTop: {
      ...style.whiteTop,
      color: weatherColor(style.whiteTop.color, tint, dark * 0.35, gray),
    },
    lightBlend: {
      ...style.lightBlend,
      bottomColor: weatherColor(style.lightBlend.bottomColor, tint, dark * 0.7, gray),
      middleColor: weatherColor(style.lightBlend.middleColor, tint, dark * 0.5, gray),
    },
    timePalette: {
      ...style.timePalette,
      morningTop: weatherColor(style.timePalette.morningTop, tint, dark * 0.4, gray),
      morningBottom: weatherColor(style.timePalette.morningBottom, tint, dark * 0.7, gray),
      eveningTop: weatherColor(style.timePalette.eveningTop, tint, dark * 0.4, gray),
      eveningBottom: weatherColor(style.timePalette.eveningBottom, tint, dark * 0.7, gray),
      // Night already has a dedicated dark, saturated cobalt palette. Applying
      // the daytime weather grade a second time collapses the top/bottom value
      // separation into a flat navy sheet. Weather can cool the palette, but
      // the top stays readable and the bottom remains the darker anchor.
      nightTop: weatherColor(
        style.timePalette.nightTop,
        tint,
        dark * 0.12,
        gray * 0.18,
      ),
      nightBottom: weatherColor(
        style.timePalette.nightBottom,
        tint,
        dark * 0.32,
        gray * 0.08,
      ),
      // Dense weather removes direct-light structure from the physical march.
      // Compensate inside the night colour stage so rolling bodies remain
      // legible; this is radiance shaping only and never touches density/alpha.
      nightBrightness: Math.min(
        4,
        style.timePalette.nightBrightness * (1 + dark * 0.85),
      ),
      nightContrast: style.timePalette.nightContrast * (1 - dark * 0.45),
      nightDetail: style.timePalette.nightDetail * (1 - gray * 0.25),
    },
  };
}

function tintSkyStyle(style, atmosphere) {
  const tint = atmosphere.skyTint;
  const gray = atmosphere.skyDesaturation;
  const dark = atmosphere.skyDarkening;
  return {
    ...style,
    palette: {
      ...style.palette,
      zenithColor: weatherColor(style.palette.zenithColor, tint, dark, gray),
      horizonColor: weatherColor(style.palette.horizonColor, tint, dark * 0.7, gray),
    },
    timePalette: {
      ...style.timePalette,
      morningZenith: weatherColor(style.timePalette.morningZenith, tint, dark, gray),
      morningHorizon: weatherColor(style.timePalette.morningHorizon, tint, dark * 0.7, gray),
      eveningZenith: weatherColor(style.timePalette.eveningZenith, tint, dark, gray),
      eveningHorizon: weatherColor(style.timePalette.eveningHorizon, tint, dark * 0.7, gray),
      nightZenith: weatherColor(
        style.timePalette.nightZenith,
        tint,
        dark * 0.18,
        gray * 0.12,
      ),
      nightHorizon: weatherColor(
        style.timePalette.nightHorizon,
        tint,
        dark * 0.12,
        gray * 0.1,
      ),
    },
  };
}

/**
 * Composes canonical Weather settings over a volumetric SkyParams baseline.
 *
 * The returned value is a new normalized SkyParams object. The input is never
 * changed. Cloud density stays exactly on the baseline; a weather condition
 * changes coverage, lighting, wind, fog and colour, while the density and
 * shape controls that define the realistic silhouette remain authored by the
 * selected sky preset.
 */
export function applySkyWeather(params, weatherSettings, { aboveClouds = false } = {}) {
  const base = toSerializableSkyParams(createSkyParams(params));
  const weather = createWeatherSettings(weatherSettings);
  const atmosphere = weather.atmosphere;
  const sunTint = new THREE.Color(...atmosphere.sunTint);
  const sunColor = new THREE.Color(...base.sun.color).multiply(sunTint);

  // Overcast describes what an observer below the cloud layer receives: less
  // direct sun, a cooler sky and more local haze. Above the layer, the clear
  // atmosphere and full sun are still present. Coverage and wind remain
  // weather-driven so the same broad cloud deck is visible from either side.
  const skyAtmosphere = aboveClouds
    ? base.atmosphere
    : {
      ...base.atmosphere,
      // Physical snapshots have no authored palette to tint, so exposure still
      // carries a restrained share of weather darkening in V1.
      exposure: base.atmosphere.exposure * (1 - atmosphere.skyDarkening * 0.25),
      fogDensity: base.atmosphere.fogDensity * atmosphere.fogRangeScale,
      style: tintSkyStyle(base.atmosphere.style, atmosphere),
    };
  const cloudLighting = aboveClouds
    ? base.cloud.lighting
    : {
      ...base.cloud.lighting,
      ambientIntensity: base.cloud.lighting.ambientIntensity * atmosphere.ambientIntensity,
    };
  const cloudStyle = aboveClouds
    ? base.cloud.style
    : tintCloudStyle(base.cloud.style, atmosphere);
  const sun = aboveClouds
    ? base.sun
    : {
      ...base.sun,
      color: [sunColor.r, sunColor.g, sunColor.b],
      intensity: base.sun.intensity * atmosphere.sunIntensity,
    };

  return createSkyParams({
    ...base,
    atmosphere: skyAtmosphere,
    cloud: {
      ...base.cloud,
      shape: {
        ...base.cloud.shape,
        coverage: volumetricCoverage(
          base.cloud.shape.coverage,
          atmosphere.cloudCoverage,
        ),
      },
      lighting: cloudLighting,
      style: cloudStyle,
      wind: {
        ...base.cloud.wind,
        speed: base.cloud.wind.speed * atmosphere.cloudSpeed,
      },
    },
    sun,
  });
}
