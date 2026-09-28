// Portable authoring contract for energy that moves over a VFX volume.
//
// Themes are starting points, not opaque renderer presets. Applying one writes
// ordinary Effect Document parameters; any field can then be edited and the
// theme becomes "custom". Runtime randomness is derived from the effect seed,
// so identical documents and seeds reproduce the same circulation.

export const VFX_ENERGY_MOTION_CUSTOM_THEME_ID = 'custom';

export const VFX_ENERGY_MOTION_DIRECTIONS = Object.freeze([
  'clockwise',
  'counter-clockwise',
  'alternating',
]);

const freezeTheme = (theme) => Object.freeze({
  ...theme,
  settings: Object.freeze({ ...theme.settings }),
  tags: Object.freeze([...theme.tags]),
});

export const VFX_ENERGY_MOTION_THEMES = Object.freeze([
  freezeTheme({
    id: 'electric-orbit',
    label: 'Electric Orbit',
    description: 'Fast broken lightning arcs repeatedly wrap the surface.',
    icon: 'ϟ',
    tags: ['electric', 'readable', 'orbiting'],
    settings: {
      circulationCount: 6,
      circulationSpeed: 1.6,
      circulationDirection: 'alternating',
      circulationCoverage: 0.3,
      circulationIrregularity: 0.72,
      circulationBranching: 0.42,
      circulationThickness: 0.022,
      circulationSurfaceOffset: 1.68,
      circulationAxialWander: 0.52,
      circulationPlaneVariation: 0.78,
      circulationFlicker: 0.68,
    },
  }),
  freezeTheme({
    id: 'storm-crawl',
    label: 'Storm Crawl',
    description: 'Many short, nervous branches crawl unpredictably over the main body.',
    icon: '☇',
    tags: ['chaotic', 'branched', 'flickering'],
    settings: {
      circulationCount: 9,
      circulationSpeed: 0.92,
      circulationDirection: 'alternating',
      circulationCoverage: 0.19,
      circulationIrregularity: 0.96,
      circulationBranching: 0.82,
      circulationThickness: 0.016,
      circulationSurfaceOffset: 1.62,
      circulationAxialWander: 0.76,
      circulationPlaneVariation: 0.96,
      circulationFlicker: 0.92,
    },
  }),
  freezeTheme({
    id: 'plasma-bands',
    label: 'Plasma Bands',
    description: 'Long coherent bands circulate smoothly with restrained noise.',
    icon: '≈',
    tags: ['smooth', 'long-form', 'controlled'],
    settings: {
      circulationCount: 4,
      circulationSpeed: 1.08,
      circulationDirection: 'clockwise',
      circulationCoverage: 0.72,
      circulationIrregularity: 0.22,
      circulationBranching: 0.04,
      circulationThickness: 0.034,
      circulationSurfaceOffset: 1.5,
      circulationAxialWander: 0.32,
      circulationPlaneVariation: 0.44,
      circulationFlicker: 0.2,
    },
  }),
  freezeTheme({
    id: 'solar-loops',
    label: 'Solar Loops',
    description: 'Broad slower arcs rise away from the surface like magnetic prominences.',
    icon: '⌒',
    tags: ['broad', 'slow', 'elevated'],
    settings: {
      circulationCount: 3,
      circulationSpeed: 0.58,
      circulationDirection: 'counter-clockwise',
      circulationCoverage: 0.48,
      circulationIrregularity: 0.4,
      circulationBranching: 0.16,
      circulationThickness: 0.045,
      circulationSurfaceOffset: 2.05,
      circulationAxialWander: 0.48,
      circulationPlaneVariation: 0.86,
      circulationFlicker: 0.34,
    },
  }),
  freezeTheme({
    id: 'ion-cage',
    label: 'Ion Cage',
    description: 'Tight opposing arcs cross the front and rear to form an energetic cage.',
    icon: '◎',
    tags: ['crossing', 'fast', 'structured'],
    settings: {
      circulationCount: 8,
      circulationSpeed: 1.9,
      circulationDirection: 'alternating',
      circulationCoverage: 0.24,
      circulationIrregularity: 0.38,
      circulationBranching: 0.12,
      circulationThickness: 0.018,
      circulationSurfaceOffset: 1.58,
      circulationAxialWander: 0.9,
      circulationPlaneVariation: 0.7,
      circulationFlicker: 0.52,
    },
  }),
  freezeTheme({
    id: 'unstable-corona',
    label: 'Unstable Corona',
    description: 'Uneven medium arcs flare, vanish, and reform around the whole body.',
    icon: '✦',
    tags: ['pulsing', 'uneven', 'volatile'],
    settings: {
      circulationCount: 7,
      circulationSpeed: 1.28,
      circulationDirection: 'alternating',
      circulationCoverage: 0.38,
      circulationIrregularity: 0.78,
      circulationBranching: 0.56,
      circulationThickness: 0.027,
      circulationSurfaceOffset: 1.82,
      circulationAxialWander: 0.64,
      circulationPlaneVariation: 0.92,
      circulationFlicker: 0.84,
    },
  }),
]);

export const DEFAULT_VFX_ENERGY_MOTION_THEME_ID = 'electric-orbit';

const THEME_BY_ID = new Map(VFX_ENERGY_MOTION_THEMES.map((theme) => [theme.id, theme]));
const DEFAULT_THEME = THEME_BY_ID.get(DEFAULT_VFX_ENERGY_MOTION_THEME_ID);

const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export function getVfxEnergyMotionTheme(id = DEFAULT_VFX_ENERGY_MOTION_THEME_ID) {
  const theme = THEME_BY_ID.get(String(id)) ?? DEFAULT_THEME;
  return {
    ...theme,
    settings: { ...theme.settings },
    tags: [...theme.tags],
  };
}

export function getVfxEnergyMotionThemeOptions() {
  return VFX_ENERGY_MOTION_THEMES.map((theme) => ({
    description: theme.description,
    icon: theme.icon,
    id: theme.id,
    label: theme.label,
    settings: { ...theme.settings },
    tags: [...theme.tags],
  }));
}

export function resolveVfxEnergyMotionSettings(input = {}) {
  const requestedTheme = String(input.energyMotionTheme ?? DEFAULT_VFX_ENERGY_MOTION_THEME_ID);
  const base = requestedTheme === VFX_ENERGY_MOTION_CUSTOM_THEME_ID
    ? DEFAULT_THEME.settings
    : getVfxEnergyMotionTheme(requestedTheme).settings;
  const direction = VFX_ENERGY_MOTION_DIRECTIONS.includes(String(input.circulationDirection))
    ? String(input.circulationDirection)
    : base.circulationDirection;
  return {
    circulationEnabled: input.circulationEnabled === undefined
      ? true
      : Boolean(input.circulationEnabled),
    energyMotionTheme: requestedTheme === VFX_ENERGY_MOTION_CUSTOM_THEME_ID
      || THEME_BY_ID.has(requestedTheme)
      ? requestedTheme
      : DEFAULT_VFX_ENERGY_MOTION_THEME_ID,
    circulationCount: Math.round(clamp(
      finite(input.circulationCount, base.circulationCount),
      1,
      12,
    )),
    circulationSpeed: clamp(
      finite(input.circulationSpeed, base.circulationSpeed),
      0,
      4,
    ),
    circulationDirection: direction,
    circulationCoverage: clamp(
      finite(input.circulationCoverage, base.circulationCoverage),
      0.08,
      1,
    ),
    circulationIrregularity: clamp(
      finite(input.circulationIrregularity, base.circulationIrregularity),
      0,
      1,
    ),
    circulationBranching: clamp(
      finite(input.circulationBranching, base.circulationBranching),
      0,
      1,
    ),
    circulationThickness: clamp(
      finite(input.circulationThickness, base.circulationThickness),
      0.006,
      0.08,
    ),
    circulationSurfaceOffset: clamp(
      finite(input.circulationSurfaceOffset, base.circulationSurfaceOffset),
      1.05,
      2.4,
    ),
    circulationAxialWander: clamp(
      finite(input.circulationAxialWander, base.circulationAxialWander),
      0,
      1,
    ),
    circulationPlaneVariation: clamp(
      finite(input.circulationPlaneVariation, base.circulationPlaneVariation),
      0,
      1,
    ),
    circulationFlicker: clamp(
      finite(input.circulationFlicker, base.circulationFlicker),
      0,
      1,
    ),
  };
}
