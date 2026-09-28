export const SKY_CLOUD_WORKSPACE = 'integration';
export const CLOUD_WORKSPACE = 'cloud';
export const SKY_WORKSPACE = 'sky';

export const LAB_WORKSPACES = Object.freeze({
  [CLOUD_WORKSPACE]: Object.freeze({
    id: CLOUD_WORKSPACE,
    label: 'Cloud Shader Lab',
    subtitle: 'Volumetric Cloud',
    tabs: Object.freeze([
      Object.freeze({ description: 'Compare the unchanged physical volume with the authored stylized result.', id: 'preview', label: 'Preview' }),
      Object.freeze({ description: 'Paint a reusable footprint and export the volumetric hero-cloud recipe.', id: 'hero-cloud', label: 'Hero Cloud' }),
      Object.freeze({ description: 'Author density, erosion, light transport, cirrus, and aerial response.', id: 'cloud-look', label: 'Shape & Light' }),
      Object.freeze({ description: 'Author the anime cloud palette and time-of-day color treatments.', id: 'cloud-style', label: 'Stylization' }),
    ]),
  }),
  [SKY_WORKSPACE]: Object.freeze({
    id: SKY_WORKSPACE,
    label: 'Sky Shader Lab',
    subtitle: 'Atmosphere & Celestials',
    tabs: Object.freeze([
      Object.freeze({ description: 'Review the atmosphere against stable cloud, light, weather, and camera contexts.', id: 'preview', label: 'Preview' }),
      Object.freeze({ description: 'Author physically based clear-air scattering.', id: 'atmosphere', label: 'Atmosphere' }),
      Object.freeze({ description: 'Author anime daylight and time-of-day sky palettes.', id: 'sky-style', label: 'Palette' }),
      Object.freeze({ description: 'Control the sun, moon, panorama stars, and celestial rays.', id: 'celestial', label: 'Sun, Moon & Stars' }),
    ]),
  }),
  [SKY_CLOUD_WORKSPACE]: Object.freeze({
    id: SKY_CLOUD_WORKSPACE,
    label: 'Sky & Cloud Lab',
    subtitle: 'Environment Integration',
    tabs: Object.freeze([
      Object.freeze({ description: 'Qualify the composed sky and cloud system under shared review contexts.', id: 'preview', label: 'Preview' }),
      Object.freeze({ description: 'Place and animate the volumetric cloud shell in the world.', id: 'cloud-world', label: 'Cloud Field' }),
      Object.freeze({ description: 'Generate the deterministic weather map that drives coverage.', id: 'generation', label: 'Generation' }),
      Object.freeze({ description: 'Set scene-owned sun bearing and time for integration review.', id: 'environment', label: 'Scene State' }),
    ]),
  }),
});

export function resolveLabWorkspace(value) {
  return LAB_WORKSPACES[value] ?? LAB_WORKSPACES[SKY_CLOUD_WORKSPACE];
}

export function resolveLabTab(workspace, value) {
  const config = resolveLabWorkspace(workspace);
  return config.tabs.some((tab) => tab.id === value)
    ? value
    : config.tabs[0].id;
}
