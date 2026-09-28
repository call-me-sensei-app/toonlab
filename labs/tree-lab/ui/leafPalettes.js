// Curated leaf color palettes: one-click canopy color + pinned three-tone
// (lit/shadow/crown) combinations. Complements the species leaf STYLES
// (shape + season) — a palette is pure paint and works on any tree.
// canopy may be a rich resolveCanopyColor spec (a LIST gives seeded per-card
// variety); crown/shadow/lit pin explicit tones, unset tones derive.

export const LEAF_PALETTES = Object.freeze([
  { id: 'spring_fresh', label: 'Spring Fresh', canopy: '#7cc45f', crown: '#d3e87a' },
  { id: 'lime_burst', label: 'Lime Burst', canopy: '#a8cf5a', crown: '#d6ea86' },
  { id: 'summer_deep', label: 'Summer Deep', canopy: '#3f8a46', shadow: '#26543b' },
  { id: 'tropical_lush', label: 'Tropical Lush', canopy: '#2fa05a', crown: '#7fd66b', shadow: '#17603c' },
  { id: 'olive_grove', label: 'Olive Grove', canopy: '#8a9a5b', crown: '#b8c184' },
  { id: 'sakura', label: 'Sakura', canopy: ['#f6c9dd', '#f2a9c9', '#fae3ee'], crown: '#ffeaf4', shadow: '#d387ab' },
  { id: 'plum_blossom', label: 'Plum Blossom', canopy: '#d873a8', crown: '#f4b8d9', shadow: '#a34f7e' },
  { id: 'wisteria', label: 'Wisteria', canopy: '#9a85d8', crown: '#c9bcf2', shadow: '#6f5aa8' },
  { id: 'autumn_blaze', label: 'Autumn Blaze', canopy: ['#e0522f', '#e8863a', '#f0b043'], crown: '#f5c96a' },
  { id: 'autumn_amber', label: 'Autumn Amber', canopy: ['#d8923c', '#c86b32'], crown: '#f2c96b' },
  { id: 'crimson_maple', label: 'Crimson Maple', canopy: '#c93b2b', crown: '#e8743d', shadow: '#7d2318' },
  { id: 'golden_gingko', label: 'Golden Gingko', canopy: '#f2c437', crown: '#ffe98a' },
  { id: 'winter_frost', label: 'Winter Frost', canopy: '#b9cfd2', crown: '#eaf5f5', shadow: '#7e97a3' },
  { id: 'blue_spruce', label: 'Blue Spruce', canopy: '#58808c', crown: '#8fb3ba', shadow: '#35525c' },
]);

/** Representative swatch colors for the UI chip (up to 3). */
export function paletteSwatches(palette) {
  const base = Array.isArray(palette.canopy) ? palette.canopy : [palette.canopy];
  return [base[0], palette.crown ?? base[1] ?? base[0], palette.shadow ?? base[base.length - 1]]
    .filter(Boolean).slice(0, 3);
}
