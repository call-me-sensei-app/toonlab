// Time-of-day / celestial state helpers plus the sun and moon glow materials.

import * as THREE from 'three';

import { numberParam, URL_PARAMS } from './params.js';
import {
  createSunBeamMaterial as createRigSunBeamMaterial,
  createSunDiskMaterial as createRigSunDiskMaterial,
  createSunShaftMaterial as createRigSunShaftMaterial,
  createSunSpillMaterial as createRigSunSpillMaterial,
} from '../../src/environment/environmentRigs.js';

const DEFAULT_ENVIRONMENT_SUN_SOURCE = new THREE.Vector3(-0.46, 0.98, -0.42);
const DEFAULT_ENVIRONMENT_SUN_TARGET = new THREE.Vector3(0.08, 0.12, 0.42);
const DEFAULT_ENVIRONMENT_TIME_OF_DAY = 14;
const ENVIRONMENT_SUNRISE_HOUR = 6;
const ENVIRONMENT_SUNSET_HOUR = 18;
const ENVIRONMENT_SUN_REFERENCE_HOUR = 14;

export function normalizeTimeOfDay(value, fallback = DEFAULT_ENVIRONMENT_TIME_OF_DAY) {
  if (value === null || value === undefined || value === '') {
    return ((fallback % 24) + 24) % 24;
  }
  const number = Number(value);
  const base = Number.isFinite(number) ? number : fallback;
  return ((base % 24) + 24) % 24;
}

export function formatTimeOfDay(value) {
  const normalized = normalizeTimeOfDay(value);
  const totalMinutes = Math.round(normalized * 60) % (24 * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function backdropPeriodForTime(timeOfDay) {
  const hour = normalizeTimeOfDay(timeOfDay);
  if (hour >= 5 && hour < 10) return 'morning';
  if (hour >= 10 && hour < 16) return 'day';
  if (hour >= 16 && hour < 20) return 'evening';
  return 'night';
}

function rotateNormalizedEnvironmentVector(vector, radians) {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return new THREE.Vector3(
    vector.x * cos - vector.z * sin,
    vector.y,
    vector.x * sin + vector.z * cos,
  );
}

function dayLightFactor(timeOfDay) {
  const hour = normalizeTimeOfDay(timeOfDay);
  if (hour < ENVIRONMENT_SUNRISE_HOUR || hour > ENVIRONMENT_SUNSET_HOUR) return 0;
  const t = (hour - ENVIRONMENT_SUNRISE_HOUR) / (ENVIRONMENT_SUNSET_HOUR - ENVIRONMENT_SUNRISE_HOUR);
  return Math.max(0, Math.sin(t * Math.PI));
}

function moonLightFactor(timeOfDay) {
  const hour = normalizeTimeOfDay(timeOfDay);
  const nightHour = hour >= ENVIRONMENT_SUNSET_HOUR
    ? hour - ENVIRONMENT_SUNSET_HOUR
    : hour + (24 - ENVIRONMENT_SUNSET_HOUR);
  const t = nightHour / 12;
  return Math.max(0, Math.sin(Math.min(1, Math.max(0, t)) * Math.PI));
}

export function resolveCelestialState(timeOfDay, roomYawDegrees, maxIntensity) {
  const hour = normalizeTimeOfDay(timeOfDay);
  const dayFactor = dayLightFactor(hour);
  const isSun = dayFactor > 0.001;
  const visibilityFactor = isSun ? dayFactor : moonLightFactor(hour);
  const sourceReference = new THREE.Vector3(
    numberParam('envSunX', DEFAULT_ENVIRONMENT_SUN_SOURCE.x),
    numberParam('envSunY', DEFAULT_ENVIRONMENT_SUN_SOURCE.y),
    numberParam('envSunZ', DEFAULT_ENVIRONMENT_SUN_SOURCE.z),
  );
  const targetReference = new THREE.Vector3(
    numberParam('envSunTargetX', DEFAULT_ENVIRONMENT_SUN_TARGET.x),
    numberParam('envSunTargetY', DEFAULT_ENVIRONMENT_SUN_TARGET.y),
    numberParam('envSunTargetZ', DEFAULT_ENVIRONMENT_SUN_TARGET.z),
  );
  const sourceAngleReference = Math.atan2(sourceReference.z, sourceReference.x);
  const sourceHorizontalRadius = Math.hypot(sourceReference.x, sourceReference.z);
  const trackedHour = isSun
    ? hour
    : normalizeTimeOfDay(hour + 12);
  const skyRotation = (trackedHour - ENVIRONMENT_SUN_REFERENCE_HOUR) * (Math.PI / 12) +
    THREE.MathUtils.degToRad(roomYawDegrees);
  const elevationFactor = Math.pow(Math.max(visibilityFactor, 0), isSun ? 0.55 : 0.68);
  const source = rotateNormalizedEnvironmentVector(sourceReference, skyRotation);
  const target = rotateNormalizedEnvironmentVector(targetReference, skyRotation);

  source.x = Math.cos(sourceAngleReference + skyRotation) * sourceHorizontalRadius;
  source.z = Math.sin(sourceAngleReference + skyRotation) * sourceHorizontalRadius;
  source.y = THREE.MathUtils.lerp(0.18, sourceReference.y, elevationFactor);

  const horizonWarmth = isSun ? 1 - THREE.MathUtils.smoothstep(visibilityFactor, 0.2, 0.9) : 0;
  const dayColor = new THREE.Color(0xffd6a0).lerp(new THREE.Color(0xfff1d8), 1 - horizonWarmth * 0.7);
  const horizonColor = new THREE.Color(hour < 12 ? 0xffb56a : 0xff884b);
  const sunColor = horizonColor.lerp(dayColor, 1 - horizonWarmth);
  const moonColor = new THREE.Color(0x9bbcff);
  const intensity = maxIntensity * (isSun
    ? THREE.MathUtils.lerp(0.12, 1.0, elevationFactor)
    : THREE.MathUtils.lerp(0.04, 0.2, elevationFactor));

  return {
    color: isSun ? sunColor : moonColor,
    diskColor: isSun ? sunColor : new THREE.Color(0xd7e4ff),
    diskOpacity: visibilityFactor * (isSun ? 0.62 : 0.34),
    isSun,
    kind: isSun ? 'sun' : 'moon',
    source,
    target,
    skyRotation,
    timeLabel: formatTimeOfDay(hour),
    visibilityFactor,
    intensity,
    shaftOpacity: visibilityFactor * (isSun ? 0.1 : 0.018),
    spillOpacity: visibilityFactor * (isSun ? 0.3 : 0.045),
    warmBeamOpacity: visibilityFactor * (isSun ? 0.28 : 0.035),
  };
}

export function defaultTurnForCaptureView(captureView) {
  if (captureView === 'side') return 90;
  if (captureView === 'back') return 180;
  return null;
}

// The sun/moon glow quads share the environment rig factories, which handle
// both shader backends (classic GLSL and TSL node materials); the shader-lab
// versions only inject the ?envSun*Opacity URL overrides.
export function createSunSpillMaterial() {
  return createRigSunSpillMaterial({
    color: new THREE.Color(1.0, 0.7, 0.34),
    opacity: Number(URL_PARAMS.get('envSunSpillOpacity')) || 0.3,
  });
}

export function createSunShaftMaterial() {
  return createRigSunShaftMaterial({
    color: new THREE.Color(1.0, 0.82, 0.52),
    opacity: Number(URL_PARAMS.get('envSunShaftOpacity')) || 0.1,
  });
}

export function createSunDiskMaterial() {
  return createRigSunDiskMaterial({
    color: new THREE.Color(1.0, 0.78, 0.38),
    opacity: Number(URL_PARAMS.get('envSunDiskOpacity')) || 0.62,
  });
}

export function createSunBeamMaterial() {
  return createRigSunBeamMaterial({
    color: new THREE.Color(1.0, 0.72, 0.34),
    opacity: Number(URL_PARAMS.get('envSunBeamOpacity')) || 0.28,
  });
}
