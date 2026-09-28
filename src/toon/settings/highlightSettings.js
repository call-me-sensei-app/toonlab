import { booleanField, colorField, createGroupValues, numberField, selectField, textureField } from './fieldSchema.js';

// `highlights` — restrained highlights (spec §4.7, §5.7, §5.10): a thresholded
// specular per surface, a band ring on hair that follows the head, an
// optional eye glint and the stocking streak.

export const HIGHLIGHTS_GROUP = Object.freeze({
  description: 'Stylised specular, the hair ring, the eye glint and the stocking streak.',
  id: 'highlights',
  label: 'Highlights',
});

function specularRole(intensity, size, threshold, softness, surface) {
  return Object.freeze({
    intensity: numberField(intensity, 0, 2, `Specular strength on ${surface}.`),
    size: numberField(size, 1, 512, `Specular exponent on ${surface}; larger = a tighter highlight.`, { step: 1 }),
    threshold: numberField(threshold, 0, 1, `Level of the specular lobe where the highlight starts on ${surface}.`),
    softness: numberField(softness, 0.001, 1, `Edge softness of the highlight on ${surface}.`),
  });
}

export const HIGHLIGHTS_FIELDS = Object.freeze({
  enabled: booleanField(true, 'Draw highlights.'),
  specular: Object.freeze({
    cloth: specularRole(0.075, 56, 0.72, 0.12, 'cloth'),
    hair: specularRole(0.18, 40, 0.62, 0.2, 'hair'),
    skin: specularRole(0.025, 24, 0.6, 0.3, 'body skin'),
    face: specularRole(0.025, 24, 0.6, 0.3, 'the face'),
    metal: specularRole(0.075, 32, 0.5, 0.2, 'metal'),
    eye: specularRole(0, 96, 0.6, 0.2, 'eyes'),
    clothNeedsMask: booleanField(false, 'Cloth shines only where a specular mask (source map or `userData.toonSpecularMaskMap`) says so; unmasked cloth is matte.'),
    inShadow: numberField(0.25, 0, 1, 'Specular visibility on the shadow side.'),
    mask: Object.freeze({
      map: textureField('Specular mask applied to every material.'),
      channel: selectField(0, [0, 1, 2, 3], 'Mask channel.', { numeric: true, optionLabels: { 0: 'Red', 1: 'Green', 2: 'Blue', 3: 'Alpha' } }),
      strength: numberField(1, 0, 1, 'How strongly the mask gates the highlight.'),
      fromSource: booleanField(true, 'Read masks from the source material (`userData.toonSpecularMaskMap`, specular maps).'),
    }),
  }),
  hair: Object.freeze({
    enabled: booleanField(true, 'A highlight ring on hair that follows the head\'s up axis.'),
    intensity: numberField(0.45, 0, 2, 'Hair ring strength.'),
    width: numberField(0.07, 0.005, 0.5, 'Width of the ring.'),
    offset: numberField(0.56, -1, 1, 'Moves the ring up (positive) or down the head.'),
    strands: numberField(11, 0, 64, 'How many strands the ring breaks into around the head.', { step: 1 }),
    jitter: numberField(0.05, 0, 0.5, 'How far each strand\'s piece of the ring wanders up and down.'),
    lean: numberField(1, 0, 1, 'How much the strand direction follows the head\'s up axis (1) rather than world up (0).'),
    shadowFloor: numberField(0.32, 0, 1, 'Ring visibility on the shadow side.'),
  }),
  eye: Object.freeze({
    enabled: booleanField(false, 'Dynamic eye glint (anime eyes usually paint their own).'),
    intensity: numberField(0.6, 0, 2, 'Eye glint strength.'),
    size: numberField(160, 1, 1024, 'Eye glint exponent.', { step: 1 }),
  }),
  sheer: Object.freeze({
    auto: booleanField(true, 'Draw the streak along the leg on detected stockings and tights.'),
    color: colorField([0.55, 0.45, 1], 'Streak colour.'),
    intensity: numberField(0.07, 0, 1, 'Streak strength.'),
    power: numberField(48, 1, 512, 'Streak narrowness.', { step: 1 }),
  }),
});

export function createHighlightSettings(options = null) {
  return createGroupValues(HIGHLIGHTS_FIELDS, options);
}

export const DEFAULT_HIGHLIGHT_SETTINGS = Object.freeze(createHighlightSettings());
