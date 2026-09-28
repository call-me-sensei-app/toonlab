import { booleanField, createGroupValues, numberField } from './fieldSchema.js';

// `light` — how the scene's light reaches a character (spec §4.1, §5.2).
//
// The sun is taken as a colour (hue + level) rather than an energy: a bright
// physical sun is scaled down as a whole to `sunMax`, so a warm sun keeps its
// hue instead of clipping to white channel by channel. The sky ambient only
// ever acts as a floor under that light, never as an additive wash.

export const LIGHT_GROUP = Object.freeze({
  description: 'How the scene\'s sun, sky, probes and local lights reach the character.',
  id: 'light',
  label: 'Light',
});

export const LIGHT_FIELDS = Object.freeze({
  enabled: booleanField(true, 'Use the scene\'s lights. Off shades with a neutral white light from the camera-relative key.'),
  sunMax: numberField(1, 0, 4, 'Brightest channel the sun may contribute. A physically bright sun is scaled down as a whole to this, keeping its hue.'),
  sunTint: numberField(1, 0, 1, 'Share of the sun\'s hue the character takes (0 = a grey light of the same luminance).'),
  maxTint: numberField(0.14, 0, 1, 'Largest display saturation the light may carry, so a deep sunset or a blue night tints the character gently instead of turning it orange or blue. 1 = no limit.'),
  skyFloor: numberField(0.04, 0, 1, 'Minimum light level from the sky ambient; the character never goes fully black.'),
  skyMax: numberField(1, 0, 4, 'Cap on the sky ambient\'s contribution (brightest channel).'),
  shadeSkyTint: numberField(0.15, 0, 1, 'In the scenery\'s cast shade the light takes this share of the sky\'s hue at the sun\'s level.'),
  shadowSkyTint: numberField(0.35, 0, 1, 'On the shadow side the light leans this far toward the sky\'s hue (at the light\'s level), so shadows stay cool and colourful under a warm sun.'),
  cameraLight: Object.freeze({
    strength: numberField(0, 0, 1, '0 shades with the sun\'s direction; 1 with a key fixed relative to the camera. Cast shadows keep the real sun.'),
    azimuth: numberField(-25, -180, 180, 'Camera-relative key azimuth in degrees (negative = from the camera\'s left).', { step: 1 }),
    elevation: numberField(35, -89, 89, 'Camera-relative key elevation in degrees.', { step: 1 }),
  }),
  maxSunElevation: numberField(90, 0, 90, 'Caps the shading direction\'s elevation (degrees) so a noon sun cannot hollow out eye sockets. 90 = off.', { step: 1 }),
  hemisphereByNormal: booleanField(true, 'Hemisphere lights shade by normal (sky above, ground below); off averages them into the flat sky ambient.'),
  localLights: Object.freeze({
    intensity: numberField(1, 0, 4, 'Point and spot lights add their colour on the side facing them as their own cel band.'),
    max: numberField(1, 0, 4, 'Cap on the summed local-light contribution (brightest channel).'),
    softness: numberField(0.08, 0.005, 1, 'Half-width of a local light\'s cel band edge in N·L.'),
  }),
  highlightShadowFloor: numberField(0.25, 0, 1, 'Highlights keep this share of their strength inside shadow.'),
});

export function createLightSettings(options = null) {
  return createGroupValues(LIGHT_FIELDS, options);
}

export const DEFAULT_LIGHT_SETTINGS = Object.freeze(createLightSettings());
