// The eight shipped look presets.
//
// Each entry is a fully-specified SkyParams: applying one FULLY REPLACES sky
// state, so anything an author leaves out below is filled from the schema
// default by `createSkyParams` before the registry is frozen. Presets are look
// only — they never carry the quality tier, the march budgets or the env-map
// bake config — but they DO carry `godRays.enabled` and the weather-map
// resolution, which are both part of the preset contract.
//
// Three authoring rules the file follows throughout:
//
//   1. `sun.elevation` and `sun.azimuth` are
//      SOLVED from it rather than authored, by the same `sunDirectionAt` the
//      driver runs every frame. A preset whose sun disagreed with its clock
//      would snap the moment the clock ticked, and `toParams()` would not be the
//      inverse of `applyPreset` it claims to be.
//   2. `latitude` is therefore the dial for how high the sun stands, because on
//      an equinox arc elevation is `asin(cos(latitude) * cos(hourAngle))` and the
//      clock fixes the hour angle. That is how three presets share the 10:51
//      readout and still range from a 42-degree midday sun to a low storm sun.
//   3. `autoAdvanceSecondsPerDay` is 0 in every preset. A look is pinned to a
//      time of day; a running clock would walk the sun out of the pose within a
//      second of the preset being applied.
//
// Colours are linear RGB THREE.Color.
// Serialized documents carry `[r, g, b]` triples — `toSerializableSkyParams` is
// the boundary that converts, not this file.

import * as THREE from 'three';

import { createSkyParams } from './skyParams.js';
import { azimuthOf, elevationOf, sunDirectionAt } from './sunDriver.js';

/** `HH:MM` as a day time on [0, 1), the unit `time.time` publishes. */
function dayTime(clock) {
  const [hours, minutes] = String(clock).split(':').map(Number);
  return ((hours + minutes / 60) % 24) / 24;
}

/**
 * Sun angles for a clock reading at a latitude and celestial swing, solved with
 * the shipped arc.
 *
 * `sunDirectionAt` is the same solve `createSunDriver` runs every frame, so a
 * preset's sun cannot disagree with the driver's.
 */
function sunAt(clock, latitude, azimuth) {
  const direction = sunDirectionAt(dayTime(clock), latitude, azimuth, new THREE.Vector3());
  return { azimuth: azimuthOf(direction), elevation: elevationOf(direction) };
}

/** Folds a bearing onto (-180, 180], the range `azimuthOf` reports. */
function foldBearing(degrees) {
  const value = ((degrees + 180) % 360 + 360) % 360;
  return value - 180;
}

/**
 * The celestial swing that puts the sun on a chosen compass bearing.
 *
 * Rotating the celestial frame by A moves every body's bearing by exactly +A
 * (the frame rotation is rigid about the vertical axis), so the swing is a
 * subtraction rather than a search. `time.azimuth` rotates the celestial frame
 * so the sun's arc lines up with the world. It also lets two presets share a
 * clock while using different solar bearings.
 */
function swingFor(clock, latitude, sunBearing) {
  return foldBearing(sunBearing - sunAt(clock, latitude, 0).azimuth);
}

/** Linear-RGB colour, spelled out so no value here goes through the sRGB path. */
function linear(r, g, b) {
  return new THREE.Color().setRGB(r, g, b, THREE.LinearSRGBColorSpace);
}

/**
 * Expands an authored delta into a complete, normalised SkyParams.
 *
 * `createSkyParams` with no base is the same fixed point `SkySystem.applyPreset`
 * computes, so what the registry holds is exactly what `toParams()` reads back
 * after the preset is applied — clamps, folds and derived values included.
 */
function preset({ clock, latitude, sunBearing, ...authored }) {
  const azimuth = swingFor(clock, latitude, sunBearing);
  return Object.freeze(createSkyParams({
    ...authored,
    sun: { ...sunAt(clock, latitude, azimuth), ...authored.sun },
    time: {
      autoAdvanceSecondsPerDay: 0,
      azimuth,
      latitude,
      time: dayTime(clock),
      ...authored.time,
    },
  }));
}

// --- the registry ------------------------------------------------------------

export const PRESETS = Object.freeze({
  /**
   * Scattered fair-weather cumulus under a high midday sun — the startup
   * default, and the frame with the brightest highlight of the eight because the
   * solar aureole sits right at the top edge of shot. This makes the top-centre
   * patch warmer and flatter than the horizon. It is the startup preset.
   */
  partlyCloudy: preset({
    clock: '14:59',
    latitude: 45,
    sunBearing: -125.3852333469329,
    atmosphere: {
      rayleigh: 0.41,
      turbidity: 1,
      mieDirectionalG: 0.8,
      mieScatteringStrength: 0.19,
      multipleScattering: 0.99,
      skyMultipleScattering: 0.66,
      exposure: 1,
      groundAlbedo: linear(0.23, 0.23, 0.23),
      fogDensity: 1.25,
      fogFarFadeStart: 9100,
      fogFarFadeEnd: 12600,
    },
    sun: {
      elevation: 44,
      azimuth: -125.3852333469329,
      intensity: 7.81,
      color: linear(1, 0.95, 0.85),
      discSize: 0.0004,
    },
    time: {
      time: 0.6246442263011153,
      moon: {
        phase: 0.2,
        intensity: 1.0001,
        angularSize: 0.0005,
        color: linear(0.7011018919268015, 0.783537791521566, 0.9473065367320066),
        ambient: 0.015,
        discBrightness: 4,
      },
    },
    cloud: {
      shape: {
        altitude: 4000,
        thickness: 5200,
        coverage: 0.49,
        density: 0.019,
        horizonCoverageStart: 20000,
        horizonCoverageRamp: 45000,
        horizonCoverageAmount: 0.12,
        edgeSoftness: 0.095,
        edgeSoftnessFalloff: 1,
        weatherScale: 29000,
        baseScale: 7500,
        baseStrength: 0.69,
        erosionScaleBaseMultiplier: 0.13,
        erosionStrengthBase: 0.24,
        erosionStrengthPeak: 2.15,
        erosionShape: 1,
        baseWeatherStrength: 0.54,
        baseWeatherHeightStart: 0,
        baseWeatherHeightEnd: 0.13,
      },
      lighting: {
        scatteringAlbedo: 1,
        powderStrength: 0.7,
        ambientIntensity: 0.7,
        groundBounceAlbedo: linear(0.009134058699157796, 0.015208514418949472, 0.018500220124016652),
        baseShadowStrength: 0.88,
        baseShadowHeight: 0.13,
        moonGain: 0.65,
      },
      wind: {
        heading: 181,
        speed: 89,
        evolutionSpeed: 60.8,
        skew: 1750,
      },
      cirrus: {
        scale: 35000,
        strength: 0,
      },
      haze: {
        scale: 40000,
        density: 0,
      },
      fade: {
        hazeDensityScale: 0.62,
        horizonMeltStart: 25000,
        horizonMeltEnd: 45000,
      },
    },
    noise: {
      weather: {
        resolution: 1024,
        profile: {
          octaves: 5,
          period: 4,
          lacunarity: 2,
          gain: 0.5,
          warp: 0,
          coverageContrast: 1.32,
          coverageBias: -0.24,
          precipitationPeriod: 1,
        },
      },
    },
    godRays: {
      enabled: true,
      moonGodRayScale: 0.26,
      strength: 0.67,
      sharpness: 9.2,
      extinction: 0,
      maxDistance: 1500,
    },
  }),

  /**
   * Low sun with a broad warm Mie aureole and a deep cumulus deck. The only
   * preset with a red-dominant zenith, and its horizon is warmer still — that
   * ordering is Rayleigh optical depth along a low sun path, not a tint, so the
   * aerosol load is the heaviest of the eight and the sun sits under 5 degrees.
   *
   * The sun stands off to the left of frame rather than in it: the reference's
   * disc is a few pixels below the measured band, and a disc inside the band
   * would put the frame maximum at 1.0 against the reference's 0.64.
   */
  stunningSunset: preset({
    clock: '17:40',
    latitude: 23.05,
    sunBearing: 44,
    atmosphere: {
      rayleigh: 2.1,
      turbidity: 6,
      mieDirectionalG: 0.78,
      mieScatteringStrength: 0.8,
      multipleScattering: 0.35,
      skyMultipleScattering: 2,
      exposure: 1.46,
      groundAlbedo: linear(0.1, 0.09, 0.08),
      fogDensity: 1.4,
    },
    sun: {
      intensity: 22,
      color: linear(1, 0.92, 0.78),
      discSize: 0.0003,
    },
    cloud: {
      shape: {
        altitude: 1800,
        thickness: 3600,
        coverage: 0.82,
        density: 0.035,
        baseScale: 8000,
        baseStrength: 1.15,
        weatherScale: 40000,
        erosionScaleBaseMultiplier: 0.12,
        erosionShape: 0.3,
        erosionStrengthBase: 0.6,
        erosionStrengthPeak: 1.5,
        edgeSoftness: 0.08,
      },
      lighting: {
        scatteringAlbedo: 0.93,
        powderStrength: 0.7,
        ambientIntensity: 0.25,
        groundBounceAlbedo: linear(0.16, 0.13, 0.11),
      },
      cirrus: {
        scale: 22000,
        strength: 0.12,
      },
      fade: {
        horizonMeltStart: 16000,
        horizonMeltEnd: 28000,
        hazeDensityScale: 0.7,
      },
    },
    noise: {
      weather: {
        resolution: 1024,
        profile: {
          coverageContrast: 1.3,
          coverageBias: -0.04,
          period: 6,
          typeBias: 0.3,
          warp: 0.35,
        },
      },
    },
    godRays: {
      enabled: true,
    },
  }),

  /**
   * Heavy overcast with a towering storm deck. Nearly flat and almost neutral:
   * heavy optical depth, with little forward scatter reaching the eye. The
   * exposure is the reference demo's own 0.52x compensation, so the deck has to
   * be dark BEFORE it — dialling exposure further would flatten what structure the
   * frame still has. The two knobs that actually hold it down are the aerial
   * perspective on the cloud image (`fade.hazeDensityScale`, which at the shipped
   * 1.0 washes an opaque deck all the way back to sky colour) and a heavy ambient
   * fill that lifts the underside back off black once the wash is gone.
   */
  thunderstorm: preset({
    clock: '10:51',
    latitude: 45,
    sunBearing: -14,
    atmosphere: {
      rayleigh: 1,
      turbidity: 3.5,
      mieDirectionalG: 0.6,
      mieScatteringStrength: 0.4,
      multipleScattering: 0.05,
      skyMultipleScattering: 0.4,
      exposure: 0.52,
      groundAlbedo: linear(0.06, 0.06, 0.055),
      fogDensity: 2,
    },
    sun: {
      intensity: 8,
      color: linear(1, 0.95, 0.85),
      discSize: 0.0003,
    },
    cloud: {
      shape: {
        altitude: 1200,
        thickness: 6000,
        coverage: 0.8,
        density: 0.03,
        baseScale: 7000,
        baseStrength: 1.1,
        weatherScale: 40000,
        erosionScaleBaseMultiplier: 0.16,
        erosionShape: 0.4,
        erosionStrengthBase: 0.3,
        erosionStrengthPeak: 1,
        edgeSoftness: 0.14,
        horizonCoverageAmount: 0.2,
        horizonCoverageStart: 15000,
        horizonCoverageRamp: 25000,
      },
      lighting: {
        scatteringAlbedo: 0.75,
        powderStrength: 1.4,
        ambientIntensity: 0.25,
        groundBounceAlbedo: linear(0.04, 0.04, 0.035),
        baseShadowStrength: 0.8,
        baseShadowHeight: 0.8,
      },
      haze: {
        density: 0,
        scale: 40000,
      },
      fade: {
        hazeDensityScale: 0.35,
        horizonMeltStart: 40000,
        horizonMeltEnd: 60000,
      },
    },
    noise: {
      weather: {
        resolution: 1024,
        profile: {
          coverageContrast: 0.7,
          coverageBias: 0.25,
          period: 3,
          typeBias: 0.6,
        },
      },
    },
    godRays: {
      enabled: false,
    },
  }),

  /**
   * Tall storm deck under a low warm sun, with thick horizon coverage. The widest
   * tonal spread of the eight — p50 against p95 is a factor of seven — so the deck
   * is BACK-lit: the sun stands nine degrees up on the camera's own bearing, which
   * is what leaves dark bases and brilliantly lit tops instead of a flatly shaded
   * ceiling. The powder term and a high scattering albedo carry the tops; the base
   * shadow keeps the median down.
   *
   * Two honest departures from the reference frame. The separate storm-haze layer
   * is off (`haze.density` 0): it drives off coverage, and on a deck this covered
   * it flattened the very spread this preset exists for. And the sun's own disc is
   * still in shot — the horizon bank thins it but does not bury it, which is the
   * main reason the frame maximum overshoots.
   */
  stormyEvening: preset({
    clock: '10:51',
    latitude: 80,
    sunBearing: 0,
    atmosphere: {
      rayleigh: 1.2,
      turbidity: 3,
      mieDirectionalG: 0.74,
      mieScatteringStrength: 0.6,
      multipleScattering: 0.3,
      skyMultipleScattering: 0.7,
      exposure: 0.65,
      groundAlbedo: linear(0.08, 0.08, 0.07),
      fogDensity: 1.6,
    },
    sun: {
      intensity: 11,
      color: linear(1, 0.95, 0.86),
      discSize: 0.0003,
    },
    cloud: {
      shape: {
        altitude: 1600,
        thickness: 5500,
        coverage: 0.8,
        density: 0.02,
        baseScale: 7000,
        baseStrength: 1.15,
        weatherScale: 45000,
        erosionScaleBaseMultiplier: 0.14,
        erosionShape: 0.3,
        erosionStrengthBase: 0.4,
        erosionStrengthPeak: 1.3,
        edgeSoftness: 0.1,
        horizonCoverageAmount: 0.35,
        horizonCoverageStart: 15000,
        horizonCoverageRamp: 25000,
      },
      lighting: {
        scatteringAlbedo: 0.95,
        powderStrength: 1.6,
        ambientIntensity: 0.25,
        groundBounceAlbedo: linear(0.1, 0.1, 0.085),
        baseShadowStrength: 0.7,
        baseShadowHeight: 0.55,
      },
      haze: {
        density: 0,
        scale: 40000,
      },
      fade: {
        hazeDensityScale: 0.5,
        horizonMeltStart: 40000,
        horizonMeltEnd: 60000,
      },
    },
    noise: {
      weather: {
        resolution: 1024,
        profile: {
          coverageContrast: 1.1,
          coverageBias: 0.22,
          period: 4,
          typeBias: 0.4,
        },
      },
    },
    godRays: {
      enabled: true,
    },
  }),

  /**
   * Night sky with a lit moon and dim moonlit clouds. The clock puts the sun
   * 12.8 degrees down, which is past nautical twilight, so the only light in
   * frame is the moon opposite it and the star panorama. `sunBearing` is
   * therefore the moon's bearing plus 180: the moon sits a little left of
   * centre, where the reference has it.
   */
  moonlitNight: preset({
    clock: '04:47',
    latitude: 45,
    sunBearing: -172,
    atmosphere: {
      rayleigh: 1,
      turbidity: 2.6,
      mieDirectionalG: 0.7,
      mieScatteringStrength: 1,
      multipleScattering: 0.2,
      skyMultipleScattering: 0.5,
      exposure: 1,
      groundAlbedo: linear(0.1, 0.1, 0.1),
      fogDensity: 1.25,
    },
    sun: {
      intensity: 6.6,
      color: linear(1, 0.95, 0.85),
      discSize: 0.0003,
    },
    time: {
      moon: {
        phase: 0.42,
        intensity: 0.22,
        discBrightness: 40,
        angularSize: 0.0003,
        color: linear(0.7, 0.78, 0.95),
        ambient: 0.008,
      },
    },
    cloud: {
      shape: {
        altitude: 2200,
        thickness: 4000,
        coverage: 0.72,
        density: 0.01,
        baseScale: 6000,
        baseStrength: 1.1,
        weatherScale: 30000,
        erosionScaleBaseMultiplier: 0.12,
        erosionShape: 0.3,
        erosionStrengthBase: 0.6,
        erosionStrengthPeak: 1.5,
        edgeSoftness: 0.09,
      },
      lighting: {
        scatteringAlbedo: 0.85,
        powderStrength: 1.2,
        ambientIntensity: 0.06,
        groundBounceAlbedo: linear(0.03, 0.03, 0.035),
        moonGain: 0.5,
      },
      fade: {
        horizonMeltStart: 16000,
        horizonMeltEnd: 28000,
      },
    },
    noise: {
      weather: {
        resolution: 1024,
        profile: {
          coverageContrast: 1.3,
          coverageBias: 0.05,
          period: 5,
          typeBias: -0.18,
          warp: 0.3,
        },
      },
    },
    godRays: {
      enabled: true,
    },
    nightSky: {
      intensity: 0.12,
    },
  }),

  /**
   * High midday sun over a soft, low-density cumulus deck with crisp billows.
   * The deepest blue of the daylight presets: a low aerosol load, a barely-there
   * Mie halo, and a Rayleigh depth above Earth's so the blue channel saturates
   * well before the horizon and the sky keeps its colour all the way down.
   */
  fluffy: preset({
    clock: '14:59',
    latitude: 25,
    sunBearing: 0,
    atmosphere: {
      rayleigh: 1.7,
      turbidity: 2,
      mieDirectionalG: 0.7,
      mieScatteringStrength: 0.3,
      multipleScattering: 0.3,
      skyMultipleScattering: 2,
      exposure: 1,
      groundAlbedo: linear(0.03, 0.029, 0.026),
      fogDensity: 1.25,
    },
    sun: {
      intensity: 5,
      color: linear(1, 0.95, 0.85),
      discSize: 0.0003,
    },
    cloud: {
      shape: {
        altitude: 1500,
        thickness: 3200,
        coverage: 0.72,
        density: 0.035,
        baseScale: 8000,
        baseStrength: 1.15,
        weatherScale: 40000,
        erosionScaleBaseMultiplier: 0.1,
        erosionShape: 0.1,
        erosionStrengthBase: 0.8,
        erosionStrengthPeak: 1.8,
        edgeSoftness: 0.07,
      },
      lighting: {
        scatteringAlbedo: 0.99,
        powderStrength: 1.1,
        ambientIntensity: 0.9,
        groundBounceAlbedo: linear(0.18, 0.17, 0.15),
        baseShadowStrength: 0,
        baseShadowHeight: 0.5,
      },
      fade: {
        horizonMeltStart: 25000,
        horizonMeltEnd: 40000,
      },
    },
    noise: {
      weather: {
        resolution: 1024,
        profile: {
          coverageContrast: 1.8,
          coverageBias: -0.06,
          period: 6,
          typeBias: 0.3,
          warp: 0.28,
        },
      },
    },
    godRays: {
      enabled: true,
    },
  }),

  /**
   * Thick atmospheric haze under a high sun — a muted, washed-out horizon. It
   * reads as almost no cloud because the deck is thin high cirrus that stays
   * blue-biased, so the look is the washed horizon and the low contrast, not
   * coverage: the zenith is the darkest and bluest of the daylight presets while
   * the horizon is nearly white.
   */
  hazy: preset({
    clock: '10:51',
    latitude: 45,
    sunBearing: -68,
    atmosphere: {
      rayleigh: 1,
      turbidity: 3,
      mieDirectionalG: 0.66,
      mieScatteringStrength: 0.6,
      multipleScattering: 0.25,
      skyMultipleScattering: 1.5,
      exposure: 1,
      groundAlbedo: linear(0.06, 0.057, 0.051),
      fogDensity: 2.2,
    },
    sun: {
      intensity: 4.27,
      color: linear(1, 0.95, 0.85),
      discSize: 0.0003,
    },
    cloud: {
      shape: {
        altitude: 3000,
        thickness: 700,
        coverage: 0.45,
        density: 0.003,
        baseScale: 12000,
        baseStrength: 0.4,
        weatherScale: 60000,
        erosionScaleBaseMultiplier: 0.35,
        erosionShape: 0.85,
        erosionStrengthBase: 1.4,
        erosionStrengthPeak: 1.4,
        edgeSoftness: 0.24,
      },
      lighting: {
        scatteringAlbedo: 0.95,
        powderStrength: 0.5,
        ambientIntensity: 0.6,
        groundBounceAlbedo: linear(0.18, 0.17, 0.15),
      },
      cirrus: {
        scale: 18000,
        strength: 0.045,
      },
      fade: {
        hazeDensityScale: 1.6,
        horizonMeltStart: 16000,
        horizonMeltEnd: 30000,
      },
    },
    noise: {
      weather: {
        resolution: 1024,
        profile: {
          coverageContrast: 0.8,
          coverageBias: -0.1,
          period: 4,
          typeBias: -0.55,
          warp: 0.5,
        },
      },
    },
    godRays: {
      enabled: true,
    },
  }),

  /**
   * High midday sun over tall, dense, bright-white cumulus with soft rounded
   * storybook edges. The highest median of the eight and, because no sun disc is
   * in frame, a LOWER maximum than `partlyCloudy` — bright dense bodies rather
   * than a blown highlight.
   */
  pixar: preset({
    clock: '14:59',
    latitude: 20,
    sunBearing: 0,
    atmosphere: {
      rayleigh: 1.7,
      turbidity: 1.4,
      mieDirectionalG: 0.68,
      mieScatteringStrength: 0.35,
      multipleScattering: 0.4,
      skyMultipleScattering: 2,
      exposure: 1,
      groundAlbedo: linear(0.03, 0.029, 0.026),
      fogDensity: 1.1,
    },
    sun: {
      intensity: 6.4,
      color: linear(1, 0.96, 0.9),
      discSize: 0.0003,
    },
    cloud: {
      shape: {
        altitude: 1800,
        thickness: 5000,
        coverage: 0.78,
        density: 0.045,
        baseScale: 8000,
        baseStrength: 1.25,
        weatherScale: 40000,
        erosionScaleBaseMultiplier: 0.14,
        erosionShape: 0,
        erosionStrengthBase: 0.8,
        erosionStrengthPeak: 1.8,
        edgeSoftness: 0.12,
        edgeSoftnessFalloff: 0.6,
      },
      lighting: {
        scatteringAlbedo: 0.97,
        powderStrength: 0.6,
        ambientIntensity: 1,
        groundBounceAlbedo: linear(0.22, 0.21, 0.19),
        baseShadowStrength: 0,
        baseShadowHeight: 0.6,
      },
      fade: {
        horizonMeltStart: 25000,
        horizonMeltEnd: 40000,
      },
    },
    noise: {
      weather: {
        resolution: 1024,
        seed: 2,
        profile: {
          coverageContrast: 1.4,
          coverageBias: 0,
          period: 5,
          typeBias: 0.45,
          warp: 0.22,
        },
      },
    },
    godRays: {
      enabled: true,
    },
  }),
});

/** Preset keys, in the order the reference documents them. */
export const PRESET_NAMES = Object.freeze(Object.keys(PRESETS));

/** The reference's documented startup default. */
export const DEFAULT_PRESET_NAME = 'partlyCloudy';
