import { booleanField, createGroupValues, numberField, selectField } from './fieldSchema.js';

// `shadows` — cast shadows (spec §4.5, §5.5). Every cast shadow moves pixels
// into the shadow tone; none of them darkens the tone itself.
//
// - scene: the shared sun shadow map and cloud shadow of the environment;
// - character: an orthographic shadow map of the registered characters only
//   (characterRenderPasses.js), so limbs, hair and chin cast on the body;
// - hairOnFace: a short screen-space test against the depth prepass toward
//   the light — bangs on the forehead, hair on the cheeks.

export const CHARACTER_SHADOW_DIRECTIONS = Object.freeze({
  camera: 'camera',
  light: 'light',
});

export const SHADOWS_GROUP = Object.freeze({
  description: 'Cast shadows from the scenery, the character\'s own shadow map and the screen-space hair shadow.',
  id: 'shadows',
  label: 'Cast Shadows',
});

export const SHADOWS_FIELDS = Object.freeze({
  enabled: booleanField(true, 'Receive cast shadows.'),
  scene: Object.freeze({
    strength: numberField(1, 0, 1, 'How strongly the scenery\'s sun and cloud shadow move pixels into shadow (faces use face.sceneShadowStrength; eyes none).'),
  }),
  character: Object.freeze({
    enabled: booleanField(true, 'The character\'s own shadow map: limbs on the body, hair on the neck, chin on the throat.'),
    strength: Object.freeze({
      body: numberField(1, 0, 1, 'Character shadow strength on everything but the face.'),
      face: numberField(0.5, 0, 1, 'Character shadow strength on the face.'),
    }),
    direction: selectField(CHARACTER_SHADOW_DIRECTIONS.light, Object.values(CHARACTER_SHADOW_DIRECTIONS), '`light` casts from the sun; `camera` from a camera-relative direction for art-directed shadows.', { optionLabels: { camera: 'Camera Relative', light: 'Sun' } }),
    pitch: numberField(40, 0, 89, 'Camera-relative shadow direction: degrees above the view direction.', { step: 1 }),
    yaw: numberField(15, -180, 180, 'Camera-relative shadow direction: degrees to the side.', { step: 1 }),
    normalBias: numberField(0.005, 0, 0.05, 'Receiver offset along the normal, metres.'),
    depthBias: numberField(0.003, 0, 0.05, 'Receiver depth bias, metres, so short occluders (chin over neck) still cast.'),
    softness: numberField(1, 0, 4, 'Filter radius in shadow-map texels.'),
  }),
  hairOnFace: Object.freeze({
    strength: Object.freeze({
      face: numberField(0.7, 0, 1, 'Screen-space shadow on the face (bangs on the forehead, hair on the cheeks).'),
      body: numberField(0.3, 0, 1, 'Screen-space shadow on everything else (a sleeve on the arm, hair on the neck).'),
    }),
    width: numberField(0.012, 0, 0.1, 'How far toward the light, in world metres projected to the screen, the test looks.'),
  }),
});

export function createShadowSettings(options = null) {
  return createGroupValues(SHADOWS_FIELDS, options);
}

export const DEFAULT_SHADOW_SETTINGS = Object.freeze(createShadowSettings());
