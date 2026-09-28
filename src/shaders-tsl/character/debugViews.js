// Debug views of the character material (spec §5.12). Every view is compiled
// into the material; selecting one is a uniform write.

export const CHARACTER_DEBUG_VIEWS = Object.freeze([
  ['off', 'Off'],
  ['albedo', 'Albedo'],
  ['sourceAlbedo', 'Source Albedo'],
  ['litAmount', 'Lit Amount'],
  ['terminator', 'Terminator Only'],
  ['sceneShadow', 'Scene Shadow'],
  ['characterShadow', 'Character Shadow'],
  ['screenSpaceShadow', 'Screen-Space Shadow'],
  ['faceMap', 'Face Map'],
  ['shadowColor', 'Shadow Colour'],
  ['lightColor', 'Light Colour'],
  ['rim', 'Rim'],
  ['depthRim', 'Depth Rim'],
  ['specular', 'Specular'],
  ['hairHighlight', 'Hair Highlight'],
  ['roles', 'Roles'],
  ['alpha', 'Alpha'],
  ['lightingMap', 'Lighting Map'],
  ['normalMap', 'Normal Map'],
  ['ao', 'AO'],
  ['emissive', 'Emissive'],
  ['matcap', 'Matcap'],
]);

/** View name → uniform value. */
export const CHARACTER_DEBUG_VIEW_IDS = Object.freeze(
  Object.fromEntries(CHARACTER_DEBUG_VIEWS.map(([name], index) => [name, index])),
);

export const CHARACTER_DEBUG_VIEW_LABELS = Object.freeze(Object.fromEntries(CHARACTER_DEBUG_VIEWS));
