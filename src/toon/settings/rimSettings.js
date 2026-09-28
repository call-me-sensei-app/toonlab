import { booleanField, colorField, createGroupValues, numberField, selectField } from './fieldSchema.js';

// `rim` — a thin lit edge where a surface stands in front of a far background
// (spec §4.6, §5.8). The depth mode reads the depth prepass; the view mode is a
// view-angle rim and the fallback when no prepass runs.

export const RIM_MODES = Object.freeze({
  depth: 'depth',
  view: 'view',
});

export const RIM_GROUP = Object.freeze({
  description: 'The depth rim on the lit side and the faint silhouette rim.',
  id: 'rim',
  label: 'Rim',
});

export const RIM_FIELDS = Object.freeze({
  enabled: booleanField(true, 'Draw the rim.'),
  mode: selectField(RIM_MODES.depth, Object.values(RIM_MODES), '`depth` uses the depth prepass; `view` is a view-angle rim (also the fallback without a prepass).', { optionLabels: { depth: 'Depth (Screen Space)', view: 'View Angle' } }),
  width: numberField(0.004, 0, 0.05, 'Rim width in world metres, projected to the screen at the pixel\'s depth.'),
  threshold: numberField(0.04, 0, 1, 'How much farther (metres) the sampled surface must be for a rim.'),
  softness: numberField(0.03, 0.001, 1, 'Fade of the rim past the threshold, metres.'),
  silhouette: Object.freeze({
    body: numberField(0, 0, 2, 'A second, fainter rim all around the silhouette regardless of the light side, relative to the role\'s rim.'),
    hair: numberField(0, 0, 2, 'Silhouette rim on hair.'),
  }),
  intensity: Object.freeze({
    cloth: numberField(0.13, 0, 2, 'Rim strength on cloth, metal and unclassified surfaces.'),
    hair: numberField(0.23, 0, 2, 'Rim strength on hair.'),
    skin: numberField(0.13, 0, 2, 'Rim strength on body skin.'),
    face: numberField(0.13, 0, 2, 'Rim strength on the face.'),
    eye: numberField(0.04, 0, 2, 'Rim strength on eyes.'),
  }),
  tint: colorField([0.82, 0.9, 1], 'Rim colour (times the light).'),
  albedoMix: numberField(0.35, 0, 1, 'Share of the albedo in the rim colour.'),
  inShadow: numberField(0.35, 0, 1, 'Rim visibility on the shadow side.'),
  fadeStart: numberField(20, 0, 500, 'Distance (metres) at which the depth rim starts to fade.'),
  fadeEnd: numberField(30, 0, 500, 'Distance (metres) at which the depth rim is gone.'),
});

export function createRimSettings(options = null) {
  return createGroupValues(RIM_FIELDS, options);
}

export const DEFAULT_RIM_SETTINGS = Object.freeze(createRimSettings());
