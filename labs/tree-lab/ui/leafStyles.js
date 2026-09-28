// Leaf style presets: species-flavored shape + palette pairs, with seasonal
// palette variants for deciduous species. Multi-color foliage is native —
// resolveCanopyColor accepts a color LIST, so a season can be "many colors"
// (autumn maple) with no engine work.
//
// Palettes are canopyColor specs (hex string or list of hex strings).

export const LEAF_STYLES = Object.freeze([
  {
    id: 'broadleaf',
    label: 'Broadleaf',
    shape: 'teardrop',
    seasons: {
      spring: '#7cc45f',
      summer: '#4da258',
      autumn: ['#d8923c', '#c86b32', '#a5522a'],
      winter: { colors: '#8a6b4d', density: 0.25 },
    },
  },
  {
    id: 'maple',
    label: 'Maple',
    shape: 'maple',
    seasons: {
      spring: '#8fd05e',
      summer: '#4f9e4c',
      autumn: ['#e0522f', '#e8863a', '#c93b2b', '#f0b043'],
      winter: { colors: '#7d5a41', density: 0.2 },
    },
  },
  {
    id: 'sakura',
    label: 'Sakura',
    shape: 'round',
    signatureSeason: 'spring',
    seasons: {
      spring: ['#f6c9dd', '#f2a9c9', '#fae3ee'],
      summer: '#6aa85c',
      autumn: ['#e8a05a', '#d97f4a'],
      winter: { colors: '#9b7a63', density: 0.18 },
    },
  },
  {
    id: 'gingko',
    label: 'Gingko',
    shape: 'gingko',
    signatureSeason: 'autumn',
    seasons: {
      spring: '#a4c95e',
      summer: '#7cb350',
      autumn: ['#f2c437', '#e8b02e'],
      winter: { colors: '#8a7350', density: 0.22 },
    },
  },
  {
    id: 'aspen',
    label: 'Aspen',
    shape: 'round',
    seasons: {
      spring: '#9ed06a',
      summer: '#8fbf4d',
      autumn: ['#f0c437', '#e89a2e'],
      winter: { colors: '#8f7a5c', density: 0.2 },
    },
  },
  {
    id: 'evergreen',
    label: 'Evergreen',
    shape: 'needle',
    // Conifers barely shift; no bare winter.
    seasons: {
      spring: '#4d8a58',
      summer: '#3f7d4f',
      autumn: '#3d7249',
      winter: '#38684a',
    },
  },
]);

export const SEASONS = Object.freeze(['spring', 'summer', 'autumn', 'winter']);

/** Resolves a style+season into { canopyColor, density|null }. */
export function resolveLeafSeason(style, season) {
  const entry = style.seasons[season] ?? style.seasons.summer;
  if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
    return { canopyColor: entry.colors, density: entry.density ?? null };
  }
  return { canopyColor: entry, density: null };
}
