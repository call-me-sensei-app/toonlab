import * as THREE from 'three';

import {
  DAY_CYCLE_PHASE,
  dayCycleProgressFromTime,
  fiveStopCurve,
  hourFromDayCycleTime,
  sampleDayCurve,
} from '../environment/dayCurves.js';
import { setEnvironmentState } from '../environment/environmentState.js';
import { SKY_SCENE_OVERRIDE_PRIORITIES } from './sceneOverrideLayers.js';

// Day/night-cycle driver: the one writer that turns a clock into a whole
// look. Every color samples a looping curve at the shared day-cycle progress
// (0 day, .25 sunset, .5 night, .75 sunrise — see dayCurves.js), and each
// update writes three sinks in one pass:
//   - the sky, through a 'dayCycle' override layer (below weather, so
//     weather tints the time of day instead of fighting it),
//   - the shared environment state (sun/moon, atmosphere fog + glow — the
//     post-composite atmosphere reads these),
//   - the world's transient sun adapter (light rig, shadows, vegetation).
//
// Curves are plain serializable stop arrays; the default set is the verdant
// daylight look. Styles override any subset via `curves`.

export const DEFAULT_DAY_CYCLE_CURVES = Object.freeze({
  zenithColor: fiveStopCurve([0.12, 0.5, 0.93], [0.34, 0.27, 0.5], [0.015, 0.03, 0.09], [0.28, 0.33, 0.58]),
  horizonColor: fiveStopCurve([0.62, 0.88, 1.0], [1.0, 0.55, 0.34], [0.05, 0.08, 0.15], [1.0, 0.68, 0.42]),
  groundColor: fiveStopCurve([0.42, 0.48, 0.55], [0.4, 0.3, 0.32], [0.05, 0.06, 0.1], [0.36, 0.32, 0.36]),
  sunColor: fiveStopCurve([1.0, 0.97, 0.88], [1.0, 0.55, 0.3], [0.62, 0.7, 0.95], [1.0, 0.7, 0.42]),
  cloudColor: fiveStopCurve([1.0, 1.0, 1.0], [1.0, 0.76, 0.62], [0.16, 0.19, 0.28], [1.0, 0.84, 0.7]),
  cloudShadeColor: fiveStopCurve([0.62, 0.75, 0.95], [0.55, 0.36, 0.5], [0.07, 0.09, 0.16], [0.5, 0.42, 0.58]),
  fogColor: fiveStopCurve([0.72, 0.84, 0.97], [0.94, 0.6, 0.44], [0.07, 0.09, 0.16], [0.9, 0.68, 0.5]),
  glowColor: fiveStopCurve([1.0, 0.88, 0.62], [1.0, 0.46, 0.26], [0.6, 0.7, 0.95], [1.0, 0.62, 0.36]),
  glowIntensity: fiveStopCurve(0.32, 0.95, 0.18, 0.85),
  sunIntensity: fiveStopCurve(1.0, 0.5, 0.1, 0.45),
  starsStrength: fiveStopCurve(0.0, 0.08, 1.0, 0.08),
  skyLightColor: fiveStopCurve([0.62, 0.78, 0.95], [0.6, 0.45, 0.55], [0.16, 0.2, 0.34], [0.55, 0.5, 0.62]),
  // Environment-material response: the converted world (terrain, rocks,
  // buildings) tints and darkens with the cycle, not just the sky dome.
  skyGroundTint: fiveStopCurve([1.05, 0.97, 0.9], [1.18, 0.78, 0.58], [0.22, 0.27, 0.44], [1.14, 0.86, 0.66]),
  skyTopTint: fiveStopCurve([0.86, 0.96, 1.08], [1.0, 0.72, 0.72], [0.2, 0.25, 0.44], [0.95, 0.82, 0.85]),
  exposureScale: fiveStopCurve(1.0, 0.82, 0.24, 0.7),
});

export function createSkyDayCycle({
  sky = null,
  world = null,
  lighting = null,
  // Converted environment materials under this root follow the cycle
  // (sky tints, height-fog color, exposure). Usually the world's terrainRoot.
  environmentRoot = null,
  // THREE.Fog whose color should track the atmosphere (world.fog).
  fog = null,
  // Weather system (world.weather): when present it OWNS scene.fog, so the
  // cycle writes the fog color through its baseline seam instead.
  weather = null,
  // Water surface (world.water): its color ramp and sun tint darken with
  // the cycle, so lakes stop glowing daylight-blue under the stars.
  water = null,
  curves = {},
  dayLength = 600,
  nightLength = 480,
  startTime = null,
  timeScale = 1,
  // Writes are throttled: the sky rebuild is cheap but not free, and the
  // reference system updates on an interval for the same reason.
  updateInterval = 0.2,
} = {}) {
  const curveSet = { ...DEFAULT_DAY_CYCLE_CURVES, ...curves };
  const span = { dayLength, nightLength };
  // Default start: mid-morning hold, matching the pre-cycle static look.
  let time = startTime ?? dayLength * 0.35;
  let scale = timeScale;
  let accumulator = updateInterval; // apply immediately on first update
  let pinnedProgress = null;
  let waterBase = null;

  const sunColor = new THREE.Color();
  const fogColor = new THREE.Color();
  const glowColor = new THREE.Color();
  const sunDirection = new THREE.Vector3();
  const moonDirection = new THREE.Vector3();

  function celestialDirection(hour, offsetHours) {
    // East-to-west sweep, rising at 06:00, setting at 18:00 (shifted by
    // offsetHours for the moon's opposite arc). Kept slightly above the
    // horizon plane so rigs and shadows never degenerate.
    const t = (((hour + offsetHours) - 6) / 12);
    const azimuth = THREE.MathUtils.lerp(-0.45, Math.PI + 0.45, THREE.MathUtils.clamp(t, 0, 1)) * -1;
    const elevation = Math.max(Math.sin(THREE.MathUtils.clamp(t, 0, 1) * Math.PI), 0.08);
    return new THREE.Vector3(
      Math.cos(azimuth) * (1 - elevation * 0.55),
      elevation,
      Math.sin(azimuth) * (1 - elevation * 0.55),
    ).normalize();
  }

  function apply() {
    const progress = pinnedProgress ?? dayCycleProgressFromTime(time, span);
    const hour = pinnedProgress !== null
      ? hourForProgress(pinnedProgress)
      : hourFromDayCycleTime(time, span);

    const nightness = THREE.MathUtils.smoothstep(
      Math.abs(progress - DAY_CYCLE_PHASE.night) < 0.25
        ? 1 - Math.abs(progress - DAY_CYCLE_PHASE.night) / 0.25
        : 0,
      0, 1,
    );
    const sunVisibility = 1 - nightness;

    sampleDayCurve(curveSet.sunColor, progress, { target: sunColor });
    sampleDayCurve(curveSet.fogColor, progress, { target: fogColor });
    sampleDayCurve(curveSet.glowColor, progress, { target: glowColor });
    const glowIntensity = sampleDayCurve(curveSet.glowIntensity, progress);
    const sunIntensity = sampleDayCurve(curveSet.sunIntensity, progress);
    const starsStrength = sampleDayCurve(curveSet.starsStrength, progress);

    sunDirection.copy(celestialDirection(hour, 0));
    moonDirection.copy(celestialDirection((hour + 12) % 24, 0));
    // At night the moon carries the light: the scene "sun" swings to the
    // moon's arc with the cool night color already sampled in sunColor.
    const lightDirection = nightness > 0.5 ? moonDirection : sunDirection;

    sky?.setSceneOverrideLayer?.('dayCycle', {
      zenithColor: sampleDayCurve(curveSet.zenithColor, progress),
      horizonColor: sampleDayCurve(curveSet.horizonColor, progress),
      groundColor: sampleDayCurve(curveSet.groundColor, progress),
      cloudColor: sampleDayCurve(curveSet.cloudColor, progress),
      cloudShadeColor: sampleDayCurve(curveSet.cloudShadeColor, progress),
      sunColor: [sunColor.r, sunColor.g, sunColor.b],
      sunDirection: [lightDirection.x, lightDirection.y, lightDirection.z],
      starsStrength,
    }, { priority: SKY_SCENE_OVERRIDE_PRIORITIES.lighting });

    setEnvironmentState({
      hour,
      dayCycleProgress: progress,
      sunDirection,
      sunColor,
      sunIntensity,
      sunVisibility,
      moonDirection,
      moonIntensity: nightness,
      moonVisibility: nightness,
      atmosphereFogColor: fogColor,
      atmosphereGlowColor: glowColor,
      atmosphereGlowIntensity: glowIntensity,
    });

    world?.setSun?.({
      color: [sunColor.r, sunColor.g, sunColor.b].map((c) => c * Math.max(sunIntensity, 0.12)),
      direction: lightDirection.toArray(),
      sky: sampleDayCurve(curveSet.skyLightColor, progress),
    });
    lighting?.setTimeOfDay?.(hour);

    if (weather?.setSceneBaseline) weather.setSceneBaseline({ fogColor });
    else if (fog?.color) fog.color.copy(fogColor);
    if (water?.applySettings) {
      const exposureScale = sampleDayCurve(curveSet.exposureScale, progress);
      // Cache the authored ramp once; every write derives from it so
      // repeated updates never compound.
      if (!waterBase && water.settings) {
        waterBase = {
          deepColor: [...(water.settings.deepColor ?? [0.02, 0.22, 0.4])],
          midColor: [...(water.settings.midColor ?? [0.07, 0.5, 0.66])],
          shallowColor: [...(water.settings.shallowColor ?? [0.28, 0.82, 0.79])],
        };
      }
      if (waterBase) {
        const scaleRamp = (rgb) => rgb.map((c) => c * (0.15 + exposureScale * 0.85));
        water.applySettings({
          deepColor: scaleRamp(waterBase.deepColor),
          midColor: scaleRamp(waterBase.midColor),
          shallowColor: scaleRamp(waterBase.shallowColor),
          sunColor: [sunColor.r, sunColor.g, sunColor.b],
        });
      }
    }
    if (environmentRoot) {
      const groundTint = sampleDayCurve(curveSet.skyGroundTint, progress);
      const topTint = sampleDayCurve(curveSet.skyTopTint, progress);
      const exposureScale = sampleDayCurve(curveSet.exposureScale, progress);
      environmentRoot.traverse?.((object) => {
        if (!object.isMesh || !object.material) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const mat of materials) {
          if (!mat?.userData?.environmentMaterial || !mat.uniforms) continue;
          mat.uniforms.skyGroundTint?.value?.setRGB?.(...groundTint);
          mat.uniforms.skyTopTint?.value?.setRGB?.(...topTint);
          mat.uniforms.heightFogColor?.value?.copy?.(fogColor);
          if (mat.uniforms.exposure) {
            // Scale relative to the material's authored exposure, captured
            // on first touch so repeated writes never compound.
            mat.userData.dayCycleBaseExposure ??= mat.uniforms.exposure.value;
            mat.uniforms.exposure.value = mat.userData.dayCycleBaseExposure * exposureScale;
          }
        }
      });
    }
    return progress;
  }

  function hourForProgress(progress) {
    // Inverse of the phase anchors, good enough for pinned previews.
    if (progress < 0.125) return 12;
    if (progress < 0.375) return 18;
    if (progress < 0.625) return 0;
    if (progress < 0.875) return 6;
    return 12;
  }

  return {
    get time() {
      return time;
    },
    get progress() {
      return pinnedProgress ?? dayCycleProgressFromTime(time, span);
    },
    /** Pins the cycle at a fixed progress (0 day, .25 sunset, .5 night, .75 sunrise); null resumes. */
    pinProgress(progress = null) {
      pinnedProgress = Number.isFinite(progress) ? ((progress % 1) + 1) % 1 : null;
      apply();
    },
    setTime(next) {
      if (Number.isFinite(next)) time = next;
      apply();
    },
    setTimeScale(next) {
      if (Number.isFinite(next)) scale = Math.max(next, 0);
    },
    update(delta = 0) {
      if (pinnedProgress !== null) return;
      time += Math.max(delta, 0) * scale;
      accumulator += delta;
      if (accumulator < updateInterval) return;
      accumulator = 0;
      apply();
    },
    apply,
  };
}
