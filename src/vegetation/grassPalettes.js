// Curated grass material palettes. These are intentionally smaller than a
// grass preset: they repaint only the blade root, tip, and material shadow
// tone. Geometry, motion, shadow strength, scene light, and the IP-wide
// VegetationShaderProfile remain owned by their respective scopes.

const COLOR_KEYS = Object.freeze(['baseColor', 'tipColor', 'shadowTint']);

function color(value) {
  if (Array.isArray(value) && value.length >= 3) {
    return Object.freeze(value.slice(0, 3).map(Number));
  }
  const hex = String(value ?? '').replace(/^#/, '');
  if (!/^[0-9a-f]{6}$/i.test(hex)) throw new Error(`Invalid grass palette color "${value}".`);
  return Object.freeze([
    parseInt(hex.slice(0, 2), 16) / 255,
    parseInt(hex.slice(2, 4), 16) / 255,
    parseInt(hex.slice(4, 6), 16) / 255,
  ]);
}

function definePalette({ id, label, description, baseColor, tipColor, shadowTint }) {
  return Object.freeze({
    baseColor: color(baseColor),
    description,
    id,
    label,
    shadowTint: color(shadowTint),
    tipColor: color(tipColor),
  });
}

/**
 * Built-in grass paint palettes. Values are sRGB triplets because
 * StylizedGrassField uploads grass colors with THREE.SRGBColorSpace.
 */
export const GRASS_COLOR_PALETTES = Object.freeze([
  definePalette({
    id: 'sensei_meadow',
    label: 'Sensei Meadow',
    description: 'The balanced green meadow used by the studio grass preset.',
    baseColor: [0.42, 0.68, 0.24],
    tipColor: [0.74, 0.9, 0.42],
    shadowTint: [0.42, 0.47, 0.62],
  }),
  definePalette({
    id: 'spring_lime',
    label: 'Spring Lime',
    description: 'Young yellow-green blades with a cool spring shadow.',
    baseColor: '#5fa13e',
    tipColor: '#b9e45f',
    shadowTint: '#66718a',
  }),
  definePalette({
    id: 'deep_forest',
    label: 'Deep Forest',
    description: 'Dense woodland green with a muted blue-green shadow.',
    baseColor: '#245c35',
    tipColor: '#61a857',
    shadowTint: '#455969',
  }),
  definePalette({
    id: 'sage_field',
    label: 'Sage Field',
    description: 'Soft desaturated greens for uplands and windswept fields.',
    baseColor: '#6e8657',
    tipColor: '#b9c98a',
    shadowTint: '#687181',
  }),
  definePalette({
    id: 'dry_prairie',
    label: 'Dry Prairie',
    description: 'Sun-dried ochre grass with a violet-brown shadow.',
    baseColor: '#98713e',
    tipColor: '#d9c476',
    shadowTint: '#6f6274',
  }),
  definePalette({
    id: 'autumn_amber',
    label: 'Autumn Amber',
    description: 'Warm russet and amber blades grounded by a plum shadow.',
    baseColor: '#a4522c',
    tipColor: '#e0a548',
    shadowTint: '#745268',
  }),
  definePalette({
    id: 'wisteria',
    label: 'Wisteria',
    description: 'Fantasy violet grass with lavender tips and a deep lilac shadow.',
    baseColor: '#7254a5',
    tipColor: '#b9a3ed',
    shadowTint: '#62587e',
  }),
  definePalette({
    id: 'moonlit_blue',
    label: 'Moonlit Blue',
    description: 'Cool blue grass for nocturnal, alpine, or magical biomes.',
    baseColor: '#345f85',
    tipColor: '#73b6c5',
    shadowTint: '#4f5d7a',
  }),
  definePalette({
    id: 'sakura_field',
    label: 'Sakura Field',
    description: 'Rose-pink blades with pale blossom tips and a mauve shadow.',
    baseColor: '#a9567d',
    tipColor: '#ed9fbf',
    shadowTint: '#755775',
  }),
  definePalette({
    id: 'crimson_field',
    label: 'Crimson Field',
    description: 'Deep red fantasy grass with coral tips and a cool wine shadow.',
    baseColor: '#7d3041',
    tipColor: '#d66963',
    shadowTint: '#594e69',
  }),
]);

/** Resolves a built-in palette by id, or accepts one of the catalog entries. */
export function resolveGrassColorPalette(paletteOrId) {
  if (typeof paletteOrId === 'string') {
    return GRASS_COLOR_PALETTES.find((entry) => entry.id === paletteOrId) ?? null;
  }
  if (paletteOrId && COLOR_KEYS.every((key) => Array.isArray(paletteOrId[key]))) {
    return paletteOrId;
  }
  return null;
}

/** Returns a new settings object with only the coordinated paint trio replaced. */
export function applyGrassColorPalette(settings = {}, paletteOrId) {
  const palette = resolveGrassColorPalette(paletteOrId);
  if (!palette) throw new Error(`Unknown grass color palette "${String(paletteOrId)}".`);
  return {
    ...settings,
    baseColor: [...palette.baseColor],
    shadowTint: [...palette.shadowTint],
    tipColor: [...palette.tipColor],
  };
}

function sameColor(left, right, epsilon) {
  return Array.isArray(left) && Array.isArray(right) && left.length >= 3 && right.length >= 3
    && left.slice(0, 3).every((channel, index) =>
      Math.abs(Number(channel) - Number(right[index])) <= epsilon);
}

/** Infers the active palette from all three colors; no palette id is persisted. */
export function matchGrassColorPalette(settings, epsilon = 1e-5) {
  return GRASS_COLOR_PALETTES.find((palette) =>
    COLOR_KEYS.every((key) => sameColor(settings?.[key], palette[key], epsilon))) ?? null;
}

