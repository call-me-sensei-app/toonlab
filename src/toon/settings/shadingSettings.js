import { booleanField, createGroupValues, numberField, selectField, textureField } from './fieldSchema.js';

// `shading` — where the one terminator sits and how it is shifted per surface
// (spec §4.2, §5.3). The lighting map is a bias in N·L units: the automatic one
// comes from the conversion-time occlusion bake (creases reach the shadow
// earlier), an authored one from a texture.

export const SHADING_GROUP = Object.freeze({
  description: 'The terminator between light and shadow and the lighting map that shifts it.',
  id: 'shading',
  label: 'Shading',
});

export const SHADING_FIELDS = Object.freeze({
  enabled: booleanField(true, 'Shade with a terminator. Off leaves every surface on its lit side.'),
  terminator: Object.freeze({
    cloth: numberField(0, -1, 1, 'Where the terminator sits in N·L on cloth and unclassified surfaces (0 = the half facing the light is lit; negative = more lit).'),
    hair: numberField(0, -1, 1, 'Terminator position on hair.'),
    skin: numberField(0, -1, 1, 'Terminator position on body skin.'),
  }),
  softness: numberField(0.04, 0, 0.5, 'Half-width of the terminator\'s soft edge in N·L.'),
  antiAlias: numberField(1, 0, 3, 'Widens the edge to at least about this many pixels (screen derivatives) so it never stair-steps.'),
  lightingMap: Object.freeze({
    auto: booleanField(true, 'Use the conversion-time occlusion bake as a per-vertex shadow bias: creases and inner surfaces reach the shadow earlier. Faces are excluded.'),
    autoStrength: Object.freeze({
      body: numberField(0.8, 0, 2, 'Bias at full occlusion, in N·L, on everything but hair and faces.'),
      hair: numberField(0.4, 0, 2, 'Bias at full occlusion on hair.'),
    }),
    autoStart: numberField(0.2, 0, 1, 'Occlusion at which the automatic bias starts.'),
    autoEnd: numberField(0.7, 0, 1, 'Occlusion at which the automatic bias is full.'),
    map: textureField('Authored per-texel shadow bias texture (also `userData.toonShadingGradeMap`, MToon shading-shift texture).'),
    channel: selectField(0, [0, 1, 2, 3], 'Channel of the authored map that holds the bias.', { numeric: true, optionLabels: { 0: 'Red', 1: 'Green', 2: 'Blue', 3: 'Alpha' } }),
    scale: numberField(0.5, -2, 2, 'Bias per unit of map value (N·L).'),
    pivot: numberField(0.5, 0, 1, 'Map value that means no bias.'),
  }),
});

export function createShadingSettings(options = null) {
  return createGroupValues(SHADING_FIELDS, options);
}

export const DEFAULT_SHADING_SETTINGS = Object.freeze(createShadingSettings());
