// Preview-only composition state for the first-party procedural garden.
// These values are deliberately excluded from exported shader documents.

export const VEGETATION_PREVIEW_SCENE_PRESETS = Object.freeze([
  Object.freeze({
    id: 'natural_meadow',
    label: 'Natural meadow',
    description: 'Continuous first-party green meadow for plant silhouette review.',
  }),
  Object.freeze({
    id: 'ground_adoption_zones',
    label: 'Ground adoption zones',
    description: 'Cool green, warm dry, and soil zones for spatial grass-tint review.',
  }),
]);

export const VEGETATION_PREVIEW_STYLE_BUNDLES = Object.freeze([
  Object.freeze({ id: 'call_me_sensei', label: 'Call Me Sensei' }),
  Object.freeze({ id: 'neutral_review', label: 'Neutral review' }),
]);

export const VEGETATION_PREVIEW_COMPONENTS = Object.freeze([
  Object.freeze({ id: 'ground', label: 'Ground', description: 'Procedural review ground.' }),
  Object.freeze({ id: 'grass', label: 'Grass', description: 'ToonLab StylizedGrassField groundcover.' }),
  Object.freeze({ id: 'tree', label: 'Tree', description: 'ToonLab procedural tree recipe.' }),
  Object.freeze({ id: 'flowers', label: 'Flowers', description: 'ToonLab procedural flower recipe.' }),
  Object.freeze({ id: 'lighting', label: 'Lighting', description: 'Universal lab time-of-day rig.' }),
]);

export const VEGETATION_PREVIEW_COMPONENT_STYLE_OPTIONS = Object.freeze([
  Object.freeze({ label: 'From bundle', value: 'inherit' }),
  Object.freeze({ label: 'Call Me Sensei', value: 'call_me_sensei' }),
  Object.freeze({ label: 'Neutral review', value: 'neutral_review' }),
]);

export const DEFAULT_VEGETATION_PREVIEW_SETTINGS = Object.freeze({
  bundle: 'call_me_sensei',
  componentStyles: Object.freeze(Object.fromEntries(
    VEGETATION_PREVIEW_COMPONENTS.map(({ id }) => [id, 'inherit']),
  )),
  componentVisibility: Object.freeze(Object.fromEntries(
    VEGETATION_PREVIEW_COMPONENTS.map(({ id }) => [id, true]),
  )),
  scenePreset: 'natural_meadow',
});

export function createVegetationPreviewSettings(input = null) {
  const source = input && typeof input === 'object' ? input : {};
  const bundle = VEGETATION_PREVIEW_STYLE_BUNDLES.some(({ id }) => id === source.bundle)
    ? source.bundle
    : DEFAULT_VEGETATION_PREVIEW_SETTINGS.bundle;
  const scenePreset = VEGETATION_PREVIEW_SCENE_PRESETS.some(({ id }) => id === source.scenePreset)
    ? source.scenePreset
    : DEFAULT_VEGETATION_PREVIEW_SETTINGS.scenePreset;
  return {
    bundle,
    componentStyles: Object.fromEntries(VEGETATION_PREVIEW_COMPONENTS.map(({ id }) => {
      const requested = source.componentStyles?.[id];
      const valid = VEGETATION_PREVIEW_COMPONENT_STYLE_OPTIONS.some(
        ({ value }) => value === requested,
      );
      return [id, valid ? requested : 'inherit'];
    })),
    componentVisibility: Object.fromEntries(
      VEGETATION_PREVIEW_COMPONENTS.map(({ id }) => [
        id,
        source.componentVisibility?.[id] !== false,
      ]),
    ),
    scenePreset,
  };
}

export function resolveVegetationPreviewComponentStyles(input = null) {
  const settings = createVegetationPreviewSettings(input);
  return Object.fromEntries(VEGETATION_PREVIEW_COMPONENTS.map(({ id }) => [
    id,
    settings.componentStyles[id] === 'inherit'
      ? settings.bundle
      : settings.componentStyles[id],
  ]));
}
