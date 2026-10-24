import { booleanField, colorField, createGroupValues, numberField, selectField, textureField } from './fieldSchema.js';

// `outline` — inverted-hull ink lines (spec §4.8, §5.9). A line is a deeper,
// more saturated version of the lit surface under it: the fill times the
// role's ink in display space, its saturation raised and its hue stepped.

export const OUTLINE_GROUP = Object.freeze({
  description: 'Inverted-hull ink outlines: widths, ink colour and screen-space behaviour.',
  id: 'outline',
  label: 'Outline',
});

function lightingRole(mix, surface) {
  return Object.freeze({
    mix: numberField(mix, 0, 1, `How much the line on ${surface} follows the cel lighting (darker on the shadow side).`),
    min: numberField(0, 0, 1, `Minimum line brightness on ${surface}.`),
    max: numberField(1, 0, 1, `Maximum line brightness on ${surface}.`),
  });
}

export const OUTLINE_FIELDS = Object.freeze({
  enabled: booleanField(true, 'Draw ink outlines.'),
  width: Object.freeze({
    cloth: numberField(0.0045, 0, 0.03, 'Line width on cloth, metres at the reference framing.'),
    hair: numberField(0.004, 0, 0.03, 'Line width on hair.'),
    skin: numberField(0.0035, 0, 0.03, 'Line width on body skin.'),
    face: numberField(0.0025, 0, 0.03, 'Line width on the face.'),
    eye: numberField(0, 0, 0.03, 'Line width on eyes.'),
    metal: numberField(0.0045, 0, 0.03, 'Line width on metal.'),
  }),
  maxWidth: numberField(0.014, 0, 0.1, 'Upper limit of the world-space width after screen-space correction.'),
  screenSpace: numberField(1, 0, 1, 'Keep a constant on-screen width at any distance (relative to the reference framing).'),
  referenceDistance: numberField(4, 0.1, 100, 'Camera distance the widths are authored at, metres.'),
  referenceFov: numberField(40, 1, 120, 'Vertical field of view the widths are authored at, degrees.', { step: 1 }),
  fadeDistance: numberField(12, 0.1, 500, 'Past this camera distance lines stop growing in world space (they thin on screen).'),
  ink: Object.freeze({
    cloth: colorField([0.34, 0.33, 0.4], 'Ink on cloth: display-space multiplier on the lit colour under the line.'),
    hair: colorField([0.42, 0.4, 0.5], 'Ink on hair: a dark, slightly cool version of the hair colour, so strands read as clean ink rather than a light fringe.'),
    skin: colorField([0.62, 0.36, 0.34], 'Ink on body skin.'),
    face: colorField([0.62, 0.36, 0.34], 'Ink on the face.'),
    metal: colorField([0.34, 0.33, 0.4], 'Ink on metal.'),
  }),
  inkSaturation: Object.freeze({
    cloth: numberField(0, 0, 1, 'Saturation added to the line on cloth (scaled by the fill\'s chroma, so grey lines stay neutral).'),
    hair: numberField(0, 0, 1, 'Saturation added to the line on hair.'),
    skin: numberField(0, 0, 1, 'Saturation added to the line on skin.'),
    face: numberField(0, 0, 1, 'Saturation added to the line on the face.'),
    metal: numberField(0, 0, 1, 'Saturation added to the line on metal.'),
  }),
  inkHueShift: numberField(0, -0.5, 0.5, 'Hue step of the line in turns (scaled by the fill\'s chroma).'),
  lighting: Object.freeze({
    cloth: lightingRole(0.2, 'cloth'),
    hair: lightingRole(0.2, 'hair'),
    skin: lightingRole(0.2, 'skin'),
    face: lightingRole(0.2, 'the face'),
    metal: lightingRole(0.2, 'metal'),
  }),
  faceDepthPush: numberField(0.02, 0, 0.2, 'Push face hull lines back in depth (metres) so they show only on the silhouette, not across nose and eyelids.'),
  // The same push for the other roles. Layered parts (a jacket over a shirt, sleeves, separate hair locks) each
  // carry their own hull, so without it every inner edge inks a full-width line across the body; pushed back,
  // a part's hull only shows where the part stands clear of what is behind it (its silhouette).
  depthPush: Object.freeze({
    cloth: numberField(0, 0, 0.2, 'Push cloth hull lines back in depth (metres): inner edges of layered clothing stop inking across the body; silhouettes stay.'),
    hair: numberField(0.012, 0, 0.2, 'Push hair hull lines back in depth (metres): edges of overlapping locks stop inking (thin strands otherwise ink a line as wide as themselves); the hair silhouette stays.'),
    skin: numberField(0, 0, 0.2, 'Push body-skin hull lines back in depth (metres).'),
    metal: numberField(0, 0, 0.2, 'Push metal hull lines back in depth (metres).'),
  }),
  honourSourceOff: booleanField(true, 'Respect a source material\'s "no outline" (MMD edge flag off).'),
  widthMap: textureField('Per-texel width multiplier (also `userData.toonOutlineWidthMap`, MToon outline width texture).'),
  widthMapChannel: selectField(0, [0, 1, 2, 3], 'Width map channel.', { numeric: true, optionLabels: { 0: 'Red', 1: 'Green', 2: 'Blue', 3: 'Alpha' } }),
  widthVertexColorChannel: selectField(-1, [-1, 0, 1, 2, 3], 'Vertex colour channel that multiplies the width (-1 = none).', { numeric: true, optionLabels: { '-1': 'None', 0: 'Red', 1: 'Green', 2: 'Blue', 3: 'Alpha' } }),
  smoothNormals: booleanField(true, 'Bake averaged normals so hard-edged meshes keep a closed hull.'),
});

export function createOutlineSettings(options = null) {
  return createGroupValues(OUTLINE_FIELDS, options);
}

export const DEFAULT_OUTLINE_SETTINGS = Object.freeze(createOutlineSettings());
