// Shared Three.js adapter for the universal Lab preview environment. It
// changes only preview-scene objects and DOM evidence; it never mutates or
// serializes the artifact being authored.

import * as THREE from 'three';

import { sampleEnvironmentTimeOfDay } from '../../src/environment/environmentTimeOfDay.js';
import {
  formatLabPreviewHour,
  sampleLabPreviewReferenceState,
} from './previewEnvironmentContract.js';

function setColor(target, value) {
  target?.set?.(value);
}

export function applyLabPreviewEnvironment(hour, {
  ambientIntensity = 0.4,
  ambientLight = null,
  background = true,
  hemisphereIntensity = 0.5,
  hemisphereLight = null,
  lightingEnabled = true,
  renderer = null,
  scene = null,
  sunDistance = 12,
  sunIntensity = 1,
  sun = null,
} = {}) {
  const timeState = sampleEnvironmentTimeOfDay(hour);
  const referenceState = sampleLabPreviewReferenceState(hour);

  if (sun) {
    setColor(sun.color, referenceState.directLightColor);
    sun.intensity = lightingEnabled ? Math.max(0.06, timeState.sunIntensity * sunIntensity) : 0;
    sun.visible = lightingEnabled;
    sun.position.set(
      timeState.sunSourceRatios.x * sunDistance,
      Math.max(timeState.sunSourceRatios.y * sunDistance, 0.75),
      timeState.sunSourceRatios.z * sunDistance,
    );
  }

  if (ambientLight) {
    setColor(ambientLight.color, referenceState.ambientColor);
    ambientLight.intensity = lightingEnabled ? timeState.ambientScale * ambientIntensity : 0;
  }

  if (hemisphereLight) {
    setColor(hemisphereLight.color, referenceState.ambientColor);
    setColor(hemisphereLight.groundColor, referenceState.shadowTint);
    hemisphereLight.intensity = lightingEnabled ? timeState.ambientScale * hemisphereIntensity : 0;
  }

  if (background) {
    const backgroundColor = timeState.fogColor.clone()
      .lerp(new THREE.Color(referenceState.ambientColor), 0.32);
    scene?.background?.copy?.(backgroundColor);
    scene?.fog?.color?.copy?.(backgroundColor);
    renderer?.setClearColor?.(backgroundColor);
  }

  document.body.dataset.previewTimeOfDay = formatLabPreviewHour(referenceState.hour);
  document.body.dataset.previewPreset = referenceState.preset;
  document.body.dataset.previewShadowTint = referenceState.shadowTint;

  const sunDirection = sun
    ? sun.position.clone().sub(sun.target.position).normalize()
    : new THREE.Vector3(timeState.sunSourceRatios.x,
      Math.max(timeState.sunSourceRatios.y, 0.75 / sunDistance), timeState.sunSourceRatios.z).normalize();
  return {
    referenceState,
    timeState,
    sunColor: new THREE.Color(referenceState.directLightColor),
    skyColor: new THREE.Color(referenceState.ambientColor),
    sunDirection,
    sunIntensity: lightingEnabled ? (sun?.intensity ?? Math.max(0.06, timeState.sunIntensity * sunIntensity)) : 0,
    skyIntensity: lightingEnabled ? timeState.ambientScale * (ambientIntensity + hemisphereIntensity) : 0,
  };
}
