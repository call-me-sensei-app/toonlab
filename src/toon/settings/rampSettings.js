import { booleanField, colorField, createGroupValues, numberField } from './fieldSchema.js';

// `ramp` — the shadow tones (spec §4.3, §5.6). A tone multiplies the albedo in
// display (sRGB) space, the way an artist picks it: cool lavender-grey for
// cloth and hair, warm peach for skin. Just past the terminator a narrow band
// takes a warmer, more saturated multiplier before the plain tone.

export const RAMP_GROUP = Object.freeze({
  description: 'Shadow tones per kind of surface and the warm band just inside the terminator.',
  id: 'ramp',
  label: 'Shadow Tones',
});

export const RAMP_FIELDS = Object.freeze({
  enabled: booleanField(true, 'Colour shadows with the per-surface tones. Off uses a neutral grey tone and no band.'),
  tone: Object.freeze({
    cloth: colorField([0.77, 0.835, 0.91], 'Shadow tone for cloth and anything unclassified (display-space multiplier; Genshin white cloth: lit (239, 237, 238) → shadow (183, 198, 216)).'),
    hair: colorField([0.74, 0.76, 0.92], 'Shadow tone for hair.'),
    skin: colorField([0.92, 0.79, 0.74], 'Shadow tone for body skin (Genshin Ganyu neck: (238, 208, 189) → (220, 164, 140)); body skin textures run pinker than face textures, so it is lighter than the face tone.'),
    face: colorField([0.91, 0.71, 0.65], 'Shadow tone for the face.'),
    metal: colorField([0.7, 0.7, 0.8], 'Shadow tone for metal.'),
    eye: colorField([0.88, 0.88, 0.94], 'Shadow tone for eyes.'),
  }),
  band: Object.freeze({
    width: numberField(0.12, 0, 1, 'How far past the terminator (N·L) the warmer band reaches before the plain tone. 0 disables it.'),
    cloth: colorField([0.95, 0.8, 0.86], 'Band multiplier on cloth (warmer, more saturated than the tone).'),
    hair: colorField([0.82, 0.78, 0.96], 'Band multiplier on hair.'),
    skin: colorField([0.97, 0.78, 0.72], 'Band multiplier on skin. The face has no band.'),
  }),
  importMmdRamp: booleanField(false, 'Use an MMD model\'s own toon ramp (not the shared toon01–10) as that material\'s tone.'),
  importMToon: booleanField(true, 'VRM MToon: shade colour/texture replaces the tone; shading shift and toony set the terminator.'),
});

export function createRampSettings(options = null) {
  return createGroupValues(RAMP_FIELDS, options);
}

export const DEFAULT_RAMP_SETTINGS = Object.freeze(createRampSettings());
