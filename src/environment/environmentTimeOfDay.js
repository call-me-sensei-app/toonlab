import * as THREE from 'three';

import { environmentBackdropPeriodForHour, applyEnvironmentLampEmissive } from './environmentRigs.js';

// One authority for time-of-day environment state. sampleEnvironmentTimeOfDay
// interpolates keyframed lighting values for any hour; applyEnvironmentTimeOfDay
// pushes the sampled state into the rigs and converted materials in one call.
//
// Keyframes describe the classic anime-interior day: cool night with lamps
// carrying the room, warm low morning sun, neutral bright midday, amber
// evening, back to night.

const TIME_KEYFRAMES = [
  {
    hour: 0,
    sunColor: 0x9bbcff,
    sunIntensity: 0.1,
    ambientScale: 0.55,
    lampScale: 1.35,
    skyGroundTint: [0.82, 0.86, 1.0],
    skyTopTint: [0.62, 0.72, 1.02],
    fogColor: [0.32, 0.38, 0.55],
    accentScale: 0.2,
  },
  {
    hour: 6,
    sunColor: 0xffb56a,
    sunIntensity: 0.45,
    ambientScale: 0.8,
    lampScale: 0.7,
    skyGroundTint: [1.1, 0.94, 0.82],
    skyTopTint: [0.95, 0.9, 1.0],
    fogColor: [0.85, 0.7, 0.55],
    accentScale: 0.85,
  },
  {
    hour: 12,
    sunColor: 0xfff1d8,
    sunIntensity: 1.0,
    ambientScale: 1.0,
    lampScale: 0.0,
    skyGroundTint: [1.05, 0.97, 0.9],
    skyTopTint: [0.86, 0.96, 1.08],
    fogColor: [0.78, 0.85, 0.95],
    accentScale: 1.0,
  },
  {
    hour: 18,
    sunColor: 0xff884b,
    sunIntensity: 0.5,
    ambientScale: 0.78,
    lampScale: 0.8,
    skyGroundTint: [1.14, 0.9, 0.74],
    skyTopTint: [0.92, 0.84, 0.96],
    fogColor: [0.82, 0.6, 0.45],
    accentScale: 0.9,
  },
  {
    hour: 21,
    sunColor: 0x9bbcff,
    sunIntensity: 0.14,
    ambientScale: 0.58,
    lampScale: 1.3,
    skyGroundTint: [0.84, 0.87, 1.0],
    skyTopTint: [0.64, 0.74, 1.02],
    fogColor: [0.34, 0.4, 0.58],
    accentScale: 0.3,
  },
  // Wrap key (same as hour 0) so interpolation is seamless across midnight.
  {
    hour: 24,
    sunColor: 0x9bbcff,
    sunIntensity: 0.1,
    ambientScale: 0.55,
    lampScale: 1.35,
    skyGroundTint: [0.82, 0.86, 1.0],
    skyTopTint: [0.62, 0.72, 1.02],
    fogColor: [0.32, 0.38, 0.55],
    accentScale: 0.2,
  },
];

function lerpColorHex(a, b, t) {
  return new THREE.Color(a).lerp(new THREE.Color(b), t);
}

function lerpColorArray(a, b, t) {
  return new THREE.Color(
    THREE.MathUtils.lerp(a[0], b[0], t),
    THREE.MathUtils.lerp(a[1], b[1], t),
    THREE.MathUtils.lerp(a[2], b[2], t),
  );
}

export function sampleEnvironmentTimeOfDay(hour) {
  const normalized = ((Number(hour) % 24) + 24) % 24;
  let previous = TIME_KEYFRAMES[0];
  let next = TIME_KEYFRAMES[TIME_KEYFRAMES.length - 1];
  for (let i = 0; i < TIME_KEYFRAMES.length - 1; i += 1) {
    if (normalized >= TIME_KEYFRAMES[i].hour && normalized <= TIME_KEYFRAMES[i + 1].hour) {
      previous = TIME_KEYFRAMES[i];
      next = TIME_KEYFRAMES[i + 1];
      break;
    }
  }
  const span = Math.max(next.hour - previous.hour, 0.001);
  const t = THREE.MathUtils.clamp((normalized - previous.hour) / span, 0, 1);

  // Sun tracks east-to-west over the day; ratios feed the sun rig placement.
  const dayT = normalized / 24;
  const azimuth = (dayT - 0.5) * Math.PI * 1.6;
  const elevation = Math.max(Math.sin((normalized - 6) / 12 * Math.PI), 0.06);

  return {
    accentScale: THREE.MathUtils.lerp(previous.accentScale, next.accentScale, t),
    ambientScale: THREE.MathUtils.lerp(previous.ambientScale, next.ambientScale, t),
    backdropPeriod: environmentBackdropPeriodForHour(normalized),
    fogColor: lerpColorArray(previous.fogColor, next.fogColor, t),
    hour: normalized,
    lampScale: THREE.MathUtils.lerp(previous.lampScale, next.lampScale, t),
    skyGroundTint: lerpColorArray(previous.skyGroundTint, next.skyGroundTint, t),
    skyTopTint: lerpColorArray(previous.skyTopTint, next.skyTopTint, t),
    sunColor: lerpColorHex(previous.sunColor, next.sunColor, t),
    sunIntensity: THREE.MathUtils.lerp(previous.sunIntensity, next.sunIntensity, t),
    sunSourceRatios: {
      x: Math.sin(azimuth) * 0.85,
      y: 0.4 + elevation * 0.6,
      z: -Math.cos(azimuth) * 0.85,
    },
  };
}

// Pushes a sampled state into whatever pieces the caller wires up. Every
// target is optional, so integrators adopt this incrementally.
export function applyEnvironmentTimeOfDay(state, {
  backdrop = null,
  environmentRoot = null,
  lampRig = null,
  sunRig = null,
  sunIntensityScale = 1,
} = {}) {
  if (!state) return;

  sunRig?.setState({
    color: state.sunColor,
    intensity: state.sunIntensity * sunIntensityScale,
    sourceRatios: state.sunSourceRatios,
    diskOpacity: 0.62 * state.accentScale,
    spillOpacity: 0.3 * state.accentScale,
    beamOpacity: 0.28 * state.accentScale,
    shaftOpacity: 0.1 * state.accentScale,
  });
  lampRig?.setIntensity(state.lampScale);
  if (environmentRoot && lampRig) applyEnvironmentLampEmissive(environmentRoot, Math.max(state.lampScale, 0.15));
  backdrop?.setPeriod(state.backdropPeriod);

  environmentRoot?.traverse?.((obj) => {
    if (!obj.isMesh || !obj.material) return;
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of materials) {
      if (!mat?.userData?.environmentMaterial || !mat.uniforms) continue;
      mat.uniforms.skyGroundTint?.value?.copy?.(state.skyGroundTint);
      mat.uniforms.skyTopTint?.value?.copy?.(state.skyTopTint);
      mat.uniforms.heightFogColor?.value?.copy?.(state.fogColor);
    }
  });
}
