// Light and shading direction for the character material (spec §5.2).
//
// The sun is a colour: its hue is desaturated toward its own luminance by
// `sunTint`, then the whole colour is scaled so its brightest channel is at
// most `sunMax`. The sky ambient (ambient lights, light-probe L0, hemisphere
// lights) is capped at `skyMax` and floored at `skyFloor`, and only ever acts
// as a floor under the sun: the light a pixel is shaded with is the
// per-channel maximum of the two, so a neutral daylight sun leaves the albedo
// untouched and night falls back to the sky's own colour and level.

import {
  cameraWorldMatrix,
  dot,
  float,
  If,
  length,
  max,
  min,
  mix,
  normalize,
  select,
  smoothstep,
  sqrt,
  vec3,
  vec4,
} from 'three/tsl';

import { luma, maxComponent, minComponent, toDisplay, toLinear } from './displayColor.js';
import { MAX_TOON_POINT_LIGHTS, MAX_TOON_SPOT_LIGHTS, toonSceneLights } from './sceneLights.js';

const s = toonSceneLights;

/** Scales a colour so its brightest channel is at most `limit`. */
export function capBrightest(color, limit) {
  return color.mul(min(float(1), limit.div(max(maxComponent(color), 1e-4))));
}

/**
 * Desaturates a light colour (in display space) so its saturation is at most
 * `limit`, keeping its brightest channel.
 */
export function limitSaturation(color, limit) {
  const level = max(maxComponent(color), 1e-5);
  const display = toDisplay(color.div(level));
  const saturation = maxComponent(display).sub(minComponent(display)).div(max(maxComponent(display), 1e-4));
  const keep = min(float(1), limit.div(max(saturation, 1e-4)));
  const gentle = toLinear(mix(vec3(luma(display)), display, keep));
  return gentle.div(max(maxComponent(gentle), 1e-5)).mul(level);
}

/**
 * The sun and sky light for a surface with world normal `normal`.
 * Returns `{ light, sky, sunDirection }` nodes.
 */
export function characterLight(u, normal) {
  // The sun's hue is desaturated toward its own luminance in display space
  // (perceptually even: a deep orange sunset keeps a gentle warmth rather
  // than most of its orange), at the sun's luminance.
  const sunRaw = s.mainLightColor.mul(s.hasMainLight);
  const peak = max(maxComponent(sunRaw), 1e-5);
  const hueDisplay = toDisplay(sunRaw.div(peak));
  const tintedHue = toLinear(mix(vec3(luma(hueDisplay)), hueDisplay, u.sunTint));
  const sunTinted = tintedHue.mul(luma(sunRaw).div(max(luma(tintedHue), 1e-5)));
  const sun = capBrightest(sunTinted, u.sunMax);

  const hemisphereByNormal = mix(
    s.hemisphereGroundColor,
    s.hemisphereSkyColor,
    dot(normal, s.hemisphereUpWorld).mul(0.5).add(0.5),
  );
  const hemisphereFlat = s.hemisphereSkyColor.add(s.hemisphereGroundColor).mul(0.5);
  const hemisphere = mix(hemisphereFlat, hemisphereByNormal, u.hemisphereByNormal).mul(s.hasHemisphereLight);
  const skyRaw = vec3(s.ambientLightColor).add(hemisphere);
  const sky = max(capBrightest(skyRaw, u.skyMax), vec3(u.skyFloor)).toVar('toonSkyLight');

  // Keep the light's colour gentle: its display saturation is limited, so a
  // deep sunset or a blue night tints the character without turning it
  // orange or blue. The level (brightest channel) is kept.
  const limited = limitSaturation(max(sun, sky), u.lightMaxTint);
  const light = mix(vec3(1), limited, u.lightEnabled).toVar('toonLight');
  return { light, sky };
}

/**
 * Direction (world, toward the light) the character is shaded with: the sun,
 * blended toward a camera-relative key, its elevation capped.
 */
export function shadingDirection(u) {
  const sunDirection = normalize(s.mainLightDirectionWorld);
  const cameraKey = normalize(cameraWorldMatrix.mul(vec4(u.cameraLightDirection, 0)).xyz);
  const keyBlend = max(u.cameraLightStrength, float(1).sub(s.hasMainLight));
  const direction = normalize(mix(sunDirection, cameraKey, keyBlend)).toVar('toonShadeDirection');
  If(direction.y.greaterThan(u.maxSunElevationSin), () => {
    const horizontal = vec3(direction.x, 0, direction.z);
    const horizontalLength = length(horizontal);
    const cameraBack = cameraWorldMatrix.mul(vec4(0, 0, 1, 0)).xyz;
    const fallback = normalize(vec3(cameraBack.x, 0, cameraBack.z).add(vec3(0, 0, 1e-4)));
    const across = select(horizontalLength.greaterThan(1e-3), horizontal.div(max(horizontalLength, 1e-4)), fallback);
    const elevationCos = sqrt(max(float(1).sub(u.maxSunElevationSin.mul(u.maxSunElevationSin)), 0));
    direction.assign(normalize(across.mul(elevationCos).add(vec3(0, u.maxSunElevationSin, 0))));
  });
  // Cast shadows keep the real sun (spec §4.1); without a sun, the key.
  const castDirection = normalize(mix(sunDirection, cameraKey, float(1).sub(s.hasMainLight)));
  return { castDirection, direction };
}

// Distance falloff with a smooth cutoff window (the standard real-time
// point-light attenuation).
function distanceFalloff(distance, cutoff, decay) {
  const falloff = float(1).div(max(distance.pow(decay), 0.01)).toVar();
  If(cutoff.greaterThan(0), () => {
    const ratio = distance.div(cutoff);
    const window = max(float(1).sub(ratio.mul(ratio).mul(ratio.mul(ratio))), 0);
    falloff.mulAssign(window.mul(window));
  });
  return falloff;
}

/**
 * Point and spot lights as additive cel bands on the sides facing them,
 * summed and capped. Returns a linear colour to multiply the albedo by.
 */
export function localLightBands(u, worldPosition, normal) {
  const total = vec3(0).toVar('toonLocalLight');
  const band = (direction) => smoothstep(u.localLightSoftness.negate(), u.localLightSoftness, dot(normal, direction));
  for (let index = 0; index < MAX_TOON_POINT_LIGHTS; index += 1) {
    If(float(index).lessThan(s.pointLightCount), () => {
      const toLight = s.pointLightPositionsWorld.element(index).sub(worldPosition);
      const distance = length(toLight);
      const direction = toLight.div(max(distance, 1e-5));
      const params = s.pointLightParams.element(index);
      const falloff = distanceFalloff(distance, params.x, params.y);
      total.addAssign(s.pointLightColors.element(index).mul(falloff).mul(band(direction)));
    });
  }
  for (let index = 0; index < MAX_TOON_SPOT_LIGHTS; index += 1) {
    If(float(index).lessThan(s.spotLightCount), () => {
      const toLight = s.spotLightPositionsWorld.element(index).sub(worldPosition);
      const distance = length(toLight);
      const direction = toLight.div(max(distance, 1e-5));
      const params = s.spotLightParams.element(index);
      const cone = smoothstep(params.z, params.w, dot(direction, normalize(s.spotLightDirectionsWorld.element(index))));
      const falloff = distanceFalloff(distance, params.x, params.y);
      total.addAssign(s.spotLightColors.element(index).mul(falloff).mul(cone).mul(band(direction)));
    });
  }
  return capBrightest(total.mul(u.localLightIntensity), u.localLightMax);
}
