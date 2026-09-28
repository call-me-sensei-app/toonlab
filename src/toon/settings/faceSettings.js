import { booleanField, colorField, createGroupValues, numberField, selectField, textureField } from './fieldSchema.js';

// `face` — faces are shaded by a face map (a per-texel threshold of how far
// the light may swing round the head before the texel goes dark), not by
// their normals, plus the painted nose shadow and eye-white shade
// (spec §4.4, §5.4, §5.10).

export const FACE_HEAD_SPACE_MODES = Object.freeze({
  headBone: 'headBone',
  static: 'static',
});

export const FACE_GROUP = Object.freeze({
  description: 'Face-map shading, smoothed face normals and painted face details.',
  id: 'face',
  label: 'Face',
});

export const FACE_FIELDS = Object.freeze({
  enabled: booleanField(true, 'Treat face surfaces as faces. Off shades them like skin.'),
  map: Object.freeze({
    auto: booleanField(true, 'Bake a face map from the face geometry when a face has none.'),
    texture: textureField('Authored face map (also `userData.toonFaceShadowMap`).'),
    mirror: booleanField(true, 'The map covers light from the character\'s right; mirror it for light from the left.'),
    midU: numberField(0.5, 0, 1, 'The face\'s centre line in the map\'s u coordinate.'),
    uvChannel: selectField(0, [0, 1], 'UV set an authored face map uses (the automatic bake has its own planar coordinates).', { numeric: true, optionLabels: { 0: 'UV', 1: 'UV2' } }),
    softness: numberField(0.02, 0, 0.3, 'Edge softness of the face-map threshold.'),
    offset: numberField(0, -0.5, 0.5, 'Bias added to the stored threshold (positive = more lit).'),
    strength: numberField(1, 0, 1, 'How strongly the face map (rather than the terminator) shades the face.'),
  }),
  terminator: numberField(-0.48, -1, 1, 'The face\'s terminator in N·L when no face map is used.'),
  softness: numberField(0.22, 0, 1, 'Soft edge of the face terminator when no face map is used.'),
  normals: Object.freeze({
    amount: numberField(0.75, 0, 1, 'Replace face normals by a smooth head-shaped field for lighting (0 = model normals).'),
    roundness: numberField(0.75, 0, 1, '0 = one flat forward normal for the whole face, 1 = a sphere around the head.'),
  }),
  headSpace: selectField(FACE_HEAD_SPACE_MODES.headBone, Object.values(FACE_HEAD_SPACE_MODES), 'Track the head bone at runtime, or a static per-character frame.', { optionLabels: { headBone: 'Head Bone (Tracked)', static: 'Static Frame' } }),
  sceneShadowStrength: numberField(0.5, 0, 1, 'Cast shadows from the scenery reach the face at this strength.'),
  nose: Object.freeze({
    auto: booleanField(true, 'Paint the leaf-shaped nose shadow where the face bake found a nose the texture does not already draw.'),
    size: numberField(1, 0.25, 3, 'Size of the nose shadow relative to the measured nose.'),
    strength: numberField(1, 0, 1, 'Opacity of the nose shadow.'),
    tint: colorField([0.93, 0.79, 0.78], 'Nose-shadow multiplier on the skin (display space).'),
  }),
  eyeWhiteShade: Object.freeze({
    strength: numberField(1, 0, 1, 'Opacity of the shade under the upper lid on eye whites.'),
    depth: numberField(0.4, 0, 1, 'How far down the eye white the shade reaches (0 = upper lid, 1 = lower edge).'),
    tint: colorField([0.76, 0.7, 0.71], 'Eye-white shade multiplier (display space).'),
  }),
});

export function createFaceSettings(options = null) {
  return createGroupValues(FACE_FIELDS, options);
}

export const DEFAULT_FACE_SETTINGS = Object.freeze(createFaceSettings());
