// Preview-only composition shared by the first-party Rock and Ground Shader
// labs. Preview selections never enter the exported shader documents.

export const SHADER_PREVIEW_SCENE_PRESETS = Object.freeze([
  Object.freeze({
    id: 'procedural_hillside',
    label: 'Procedural hillside',
    description:
      'A ToonLab-owned terrain, rock, vegetation, cloud, prop, camera, and lighting test range.',
  }),
]);

export const SHADER_PREVIEW_STYLE_BUNDLES = Object.freeze([
  Object.freeze({
    id: 'call_me_sensei',
    label: 'Call Me Sensei',
    assignments: Object.freeze({
      clouds: 'call_me_sensei',
      flowers: 'call_me_sensei',
      grass: 'call_me_sensei',
      ground: 'call_me_sensei',
      lighting: 'call_me_sensei',
      manufacturedProps: 'call_me_sensei',
      rock: 'call_me_sensei',
      sky: 'call_me_sensei',
      tree: 'call_me_sensei',
    }),
  }),
  Object.freeze({
    id: 'neutral_review',
    label: 'Neutral review',
    assignments: Object.freeze({
      clouds: 'neutral_review',
      flowers: 'neutral_review',
      grass: 'neutral_review',
      ground: 'neutral_review',
      lighting: 'neutral_review',
      manufacturedProps: 'neutral_review',
      rock: 'neutral_review',
      sky: 'neutral_review',
      tree: 'neutral_review',
    }),
  }),
]);

export const SHADER_PREVIEW_COMPONENTS = Object.freeze([
  Object.freeze({
    description: 'A ToonLab Rock Generator fixture.',
    id: 'rock',
    label: 'Rock',
  }),
  Object.freeze({
    description: 'Procedural terrain with a four-channel painted splat field.',
    id: 'ground',
    label: 'Ground',
  }),
  Object.freeze({
    description: 'Procedural grass blades and groundcover.',
    id: 'grass',
    label: 'Grass',
  }),
  Object.freeze({
    description: 'Procedural tree canopy and bark forms.',
    id: 'tree',
    label: 'Tree',
  }),
  Object.freeze({
    description: 'Procedural petals, centers, and stems.',
    id: 'flowers',
    label: 'Flowers',
  }),
  Object.freeze({
    description: 'Simple first-party scale and material reference props.',
    id: 'manufacturedProps',
    label: 'Objects',
  }),
  Object.freeze({
    description: 'The shared ToonLab preview sky treatment.',
    id: 'sky',
    label: 'Sky',
  }),
  Object.freeze({
    description: 'Procedural cloud forms with no external texture inputs.',
    id: 'clouds',
    label: 'Clouds',
  }),
  Object.freeze({
    description: 'Shared sun, ambient fill, shadow, and exposure context.',
    id: 'lighting',
    label: 'Lighting',
  }),
]);

export const SHADER_PREVIEW_COMPONENT_STYLE_OPTIONS = Object.freeze([
  Object.freeze({ label: 'From bundle', value: 'inherit' }),
  Object.freeze({ label: 'Call Me Sensei', value: 'call_me_sensei' }),
  Object.freeze({ label: 'Neutral review', value: 'neutral_review' }),
]);

export const DEFAULT_SHADER_PREVIEW_SETTINGS = Object.freeze({
  bundle: 'call_me_sensei',
  componentStyles: Object.freeze(Object.fromEntries(
    SHADER_PREVIEW_COMPONENTS.map(({ id }) => [id, 'inherit']),
  )),
  componentVisibility: Object.freeze(Object.fromEntries(
    SHADER_PREVIEW_COMPONENTS.map(({ id }) => [id, true]),
  )),
  scenePreset: 'procedural_hillside',
});

export function createShaderPreviewSettings(input = null) {
  const source = input && typeof input === 'object' ? input : {};
  const bundle = SHADER_PREVIEW_STYLE_BUNDLES.some(({ id }) => id === source.bundle)
    ? source.bundle
    : DEFAULT_SHADER_PREVIEW_SETTINGS.bundle;
  const requestedScene = source.scenePreset === 'reference_hillside'
    ? 'procedural_hillside'
    : source.scenePreset;
  const scenePreset = SHADER_PREVIEW_SCENE_PRESETS.some(({ id }) => id === requestedScene)
    ? requestedScene
    : DEFAULT_SHADER_PREVIEW_SETTINGS.scenePreset;
  const componentStyles = Object.fromEntries(SHADER_PREVIEW_COMPONENTS.map(({ id }) => {
    const requested = source.componentStyles?.[id];
    const valid = SHADER_PREVIEW_COMPONENT_STYLE_OPTIONS.some(
      ({ value }) => value === requested,
    );
    return [id, valid ? requested : 'inherit'];
  }));
  const componentVisibility = Object.fromEntries(
    SHADER_PREVIEW_COMPONENTS.map(({ id }) => [
      id,
      source.componentVisibility?.[id] !== false,
    ]),
  );
  return { bundle, componentStyles, componentVisibility, scenePreset };
}

export function resolveShaderPreviewComponentStyles(input = null) {
  const settings = createShaderPreviewSettings(input);
  const bundle = SHADER_PREVIEW_STYLE_BUNDLES.find(
    ({ id }) => id === settings.bundle,
  ) ?? SHADER_PREVIEW_STYLE_BUNDLES[0];
  return Object.fromEntries(SHADER_PREVIEW_COMPONENTS.map(({ id }) => [
    id,
    settings.componentStyles[id] === 'inherit'
      ? bundle.assignments[id]
      : settings.componentStyles[id],
  ]));
}
