// Rockgen settings schema: frozen defaults per setting group, group
// metadata, and the auto-generated field schema the debug settings panel
// renders (same pattern as environmentSettings.js). Piece-level groups
// (shape/heightfield/noise/warp/cuts/facet/cracks/strata/columns/falloff)
// apply to one rock piece;
// document-level groups (surface/meshing) apply to the whole document.

import { BUILT_IN_TEXTURE_PRESETS } from '../texgen/texturePresets.js';

/**
 * Base primitive the piece displaces. 'sketch' extrudes the piece's drawn
 * `outline` polygon (piece-level data, not a schema field) and falls back
 * to the ellipsoid until an outline exists.
 */
export const ROCK_SHAPE_TYPES = Object.freeze(['ellipsoid', 'sphere', 'box', 'capsule', 'sketch', 'heightfield']);

/** Normal generation modes for meshed documents. */
export const ROCK_NORMALS_MODES = Object.freeze(['gradient', 'flat']);

/** Procedural albedo styles layered into baked vertex colors. */
export const ROCK_SURFACE_TEXTURE_STYLES = Object.freeze([
  'none',
  'granite',
  'sandstone',
  'basalt',
  'limestone',
  'veined',
]);

const ROCK_PBR_TEXTURE_CATEGORIES = new Set(['stone']);
const ROCK_PBR_GROUND_TEXTURE_IDS = new Set([
  'desert-sand',
  'dry-dirt',
  'forest-floor',
  'fresh-snow',
  'gravel',
  'wet-mud',
]);

/** Texture Lab recipes that make sense as tiled PBR maps on rocks and cliffs. */
export const ROCK_PBR_TEXTURE_PRESETS = Object.freeze([
  Object.freeze({ id: 'none', label: 'None / authored GLB texture' }),
  ...BUILT_IN_TEXTURE_PRESETS
    .filter((entry) => (
      ROCK_PBR_TEXTURE_CATEGORIES.has(entry.category)
      || ROCK_PBR_GROUND_TEXTURE_IDS.has(entry.id)
    ))
    .map((entry) => Object.freeze({
      id: entry.id,
      label: `${entry.category === 'stone' ? 'Stone' : 'Ground'} — ${entry.label}`,
    })),
]);

export const DEFAULT_ROCK_SHAPE_SETTINGS = Object.freeze({
  capsuleLength: 1.5,
  cornerRadius: 0.25,
  sizeX: 1.0,
  sizeY: 0.75,
  sizeZ: 1.0,
  type: 'ellipsoid',
});

// Default displacement is deliberately quiet: noise past ~0.12 amplitude or
// warp past ~0.15 strength turns a fresh piece into a melted blob before
// the user touches anything.
export const DEFAULT_ROCK_NOISE_SETTINGS = Object.freeze({
  amplitude: 0.08,
  enabled: true,
  frequency: 1.4,
  gain: 0.5,
  lacunarity: 2.0,
  octaves: 3,
  ridged: false,
  seedOffset: 0,
});

export const DEFAULT_ROCK_WARP_SETTINGS = Object.freeze({
  enabled: true,
  frequency: 0.9,
  strength: 0.1,
});

/** Silhouette profiles for the eroded heightfield shape. */
export const ROCK_HEIGHTFIELD_PROFILES = Object.freeze(['mesa', 'ridge', 'slope', 'open']);

// Eroded heightfield ('heightfield' shape type): ridged relief shaped by a
// silhouette profile, terraced into strata bands, then run through ToonLab's
// first-party stylized drainage + thermal settling model.
export const DEFAULT_ROCK_HEIGHTFIELD_SETTINGS = Object.freeze({
  droplets: 0.5,
  erosion: 0.7,
  profile: 'mesa',
  relief: 0.65,
  roughness: 0.5,
  seedOffset: 0,
  terrace: 0.35,
  terraceSteps: 6,
  thermal: 0.6,
});

// Planar cuts: seeded flat half-space slices hard-intersected with the
// shape. The one stage whose output is genuinely planar — cut faces are
// applied in unwarped local space, after noise, so warp and fbm never
// bend them. This is what makes slabs, shards, and cliff walls possible;
// every other stage is a smooth displacement and can only round.
export const DEFAULT_ROCK_CUTS_SETTINGS = Object.freeze({
  bevel: 0.02,
  count: 6,
  depth: 0.3,
  enabled: false,
  seedOffset: 0,
  verticalBias: 0.6,
});

export const DEFAULT_ROCK_FACET_SETTINGS = Object.freeze({
  enabled: false,
  jitter: 1.0,
  scale: 2.2,
  strength: 0.25,
});

// Cracks: SPARSE deep fissures along large Voronoi cell borders, gated by
// a low-frequency coverage mask so they read as weathering patches — the
// Blender-geometry-nodes rock recipe's crack layer, distinct from facet
// (dense soft grooves everywhere).
export const DEFAULT_ROCK_CRACKS_SETTINGS = Object.freeze({
  coverage: 0.55,
  depth: 0.08,
  enabled: false,
  scale: 0.9,
  width: 0.09,
});

export const DEFAULT_ROCK_STRATA_SETTINGS = Object.freeze({
  enabled: false,
  frequency: 3,
  sharpness: 0.6,
  strength: 0.12,
  tiltDegrees: 8,
  warpAmount: 0.2,
});

// Columnar jointing (basalt columns / Liyue stone forest): 2D Voronoi cells
// in the ground plane become vertical prismatic columns — grooves at cell
// borders, a per-column height offset for the stepped skyline, and (when
// strata is on) per-column joint phase so break lines don't align.
export const DEFAULT_ROCK_COLUMNS_SETTINGS = Object.freeze({
  enabled: false,
  grooveDepth: 0.14,
  grooveWidth: 0.25,
  heightVariation: 0.9,
  scale: 1.6,
});

export const DEFAULT_ROCK_FALLOFF_SETTINGS = Object.freeze({
  bottomFlatten: 0,
  radialPinch: 0,
  topTaper: 0,
});

export const DEFAULT_ROCK_SURFACE_SETTINGS = Object.freeze({
  baseColor: Object.freeze([0.54, 0.52, 0.47]),
  cavityColor: Object.freeze([0.34, 0.31, 0.25]),
  topColor: Object.freeze([0.71, 0.73, 0.68]),
  topCoatStrength: 1,
  topHeightStart: 0.55,
  topSlopeStart: 0.72,
  colorNoise: 0.06,
  textureStyle: 'none',
  textureStrength: 0,
  textureScale: 1,
  pbrTexturePreset: 'none',
  pbrTextureScale: 2,
  pbrNormalStrength: 1,
  pbrRoughness: 1,
  veinColor: Object.freeze([0.82, 0.8, 0.72]),
  veinStrength: 0,
  stainColor: Object.freeze([0.56, 0.38, 0.2]),
  stainStrength: 0,
  mossColor: Object.freeze([0.28, 0.42, 0.2]),
  mossCoverage: 0,
  lichenColor: Object.freeze([0.68, 0.72, 0.5]),
  lichenCoverage: 0,
  aoRadius: 0.5,
  aoStrength: 1,
});

export const ROCK_SURFACE_TEXTURE_PRESETS = Object.freeze({
  bare: Object.freeze({
    description: 'Plain baked rock colors with only the height/cavity coat.',
    label: 'Bare',
    surface: Object.freeze({
      baseColor: Object.freeze([0.54, 0.52, 0.47]),
      cavityColor: Object.freeze([0.34, 0.31, 0.25]),
      colorNoise: 0.06,
      lichenCoverage: 0,
      mossCoverage: 0,
      stainStrength: 0,
      textureScale: 1,
      textureStrength: 0,
      textureStyle: 'none',
      topCoatStrength: 1,
      topColor: Object.freeze([0.71, 0.73, 0.68]),
      topHeightStart: 0.55,
      topSlopeStart: 0.72,
      veinStrength: 0,
    }),
  }),
  granite: Object.freeze({
    description: 'Cool speckled stone with restrained pale flecks.',
    label: 'Granite',
    surface: Object.freeze({
      baseColor: Object.freeze([0.56, 0.55, 0.53]),
      cavityColor: Object.freeze([0.31, 0.3, 0.31]),
      colorNoise: 0.04,
      lichenCoverage: 0.04,
      mossCoverage: 0,
      stainStrength: 0.05,
      textureScale: 1.5,
      textureStrength: 0.32,
      textureStyle: 'granite',
      topColor: Object.freeze([0.78, 0.79, 0.76]),
      veinStrength: 0.08,
    }),
  }),
  sandstone: Object.freeze({
    description: 'Warm sediment bands, dusted ledges, and light iron wash.',
    label: 'Sandstone',
    surface: Object.freeze({
      baseColor: Object.freeze([0.67, 0.47, 0.32]),
      cavityColor: Object.freeze([0.38, 0.24, 0.17]),
      colorNoise: 0.05,
      lichenCoverage: 0,
      mossCoverage: 0,
      stainColor: Object.freeze([0.62, 0.32, 0.16]),
      stainStrength: 0.22,
      textureScale: 1.35,
      textureStrength: 0.38,
      textureStyle: 'sandstone',
      topColor: Object.freeze([0.82, 0.66, 0.45]),
      veinStrength: 0,
    }),
  }),
  basalt: Object.freeze({
    description: 'Dark volcanic stone with blocky crystal breakup.',
    label: 'Basalt',
    surface: Object.freeze({
      baseColor: Object.freeze([0.34, 0.35, 0.36]),
      cavityColor: Object.freeze([0.18, 0.18, 0.2]),
      colorNoise: 0.035,
      lichenCoverage: 0.06,
      mossCoverage: 0,
      stainStrength: 0,
      textureScale: 1.1,
      textureStrength: 0.34,
      textureStyle: 'basalt',
      topColor: Object.freeze([0.52, 0.54, 0.55]),
      veinStrength: 0.03,
    }),
  }),
  limestone: Object.freeze({
    description: 'Warm sediment bands, chalky shelves, and dark limestone seams.',
    label: 'Limestone',
    surface: Object.freeze({
      baseColor: Object.freeze([0.6, 0.51, 0.39]),
      cavityColor: Object.freeze([0.25, 0.21, 0.17]),
      colorNoise: 0.045,
      lichenCoverage: 0.14,
      mossCoverage: 0,
      stainColor: Object.freeze([0.62, 0.39, 0.2]),
      stainStrength: 0.16,
      textureScale: 1.35,
      textureStrength: 0.58,
      textureStyle: 'limestone',
      topColor: Object.freeze([0.78, 0.72, 0.6]),
      veinStrength: 0.04,
    }),
  }),
  veined: Object.freeze({
    description: 'Quartz/mineral seams over a cool rock base.',
    label: 'Veined',
    surface: Object.freeze({
      baseColor: Object.freeze([0.48, 0.5, 0.53]),
      cavityColor: Object.freeze([0.25, 0.27, 0.31]),
      colorNoise: 0.035,
      lichenCoverage: 0.02,
      mossCoverage: 0,
      textureScale: 1.05,
      textureStrength: 0.18,
      textureStyle: 'veined',
      topColor: Object.freeze([0.68, 0.72, 0.74]),
      veinColor: Object.freeze([0.88, 0.86, 0.78]),
      veinStrength: 0.68,
    }),
  }),
  mossy: Object.freeze({
    description: 'Green ledge/cavity growth plus small pale lichen spots.',
    label: 'Moss',
    surface: Object.freeze({
      baseColor: Object.freeze([0.48, 0.46, 0.41]),
      cavityColor: Object.freeze([0.27, 0.25, 0.21]),
      colorNoise: 0.05,
      lichenCoverage: 0.16,
      mossColor: Object.freeze([0.24, 0.39, 0.18]),
      mossCoverage: 0.62,
      stainStrength: 0.06,
      textureScale: 1.2,
      textureStrength: 0.18,
      textureStyle: 'granite',
      topColor: Object.freeze([0.55, 0.61, 0.43]),
      topHeightStart: 0.4,
      topSlopeStart: 0.5,
      veinStrength: 0.02,
    }),
  }),
  lichen: Object.freeze({
    description: 'Dry exposed-face lichen over pale rock.',
    label: 'Lichen',
    surface: Object.freeze({
      baseColor: Object.freeze([0.55, 0.54, 0.48]),
      cavityColor: Object.freeze([0.32, 0.3, 0.25]),
      colorNoise: 0.045,
      lichenColor: Object.freeze([0.72, 0.74, 0.52]),
      lichenCoverage: 0.48,
      mossCoverage: 0.08,
      stainStrength: 0.04,
      textureScale: 1.35,
      textureStrength: 0.24,
      textureStyle: 'limestone',
      topColor: Object.freeze([0.76, 0.76, 0.65]),
      veinStrength: 0.02,
    }),
  }),
  snowcap: Object.freeze({
    description: 'Cold rock with a broken top-facing snow/dust cap.',
    label: 'Snow Cap',
    surface: Object.freeze({
      baseColor: Object.freeze([0.47, 0.49, 0.52]),
      cavityColor: Object.freeze([0.25, 0.27, 0.31]),
      colorNoise: 0.035,
      lichenCoverage: 0,
      mossCoverage: 0,
      stainStrength: 0,
      textureScale: 1.0,
      textureStrength: 0.18,
      textureStyle: 'granite',
      topCoatStrength: 1,
      topColor: Object.freeze([0.9, 0.93, 0.95]),
      topHeightStart: 0.45,
      topSlopeStart: 0.52,
      veinStrength: 0.02,
    }),
  }),
});

export const DEFAULT_ROCKGEN_MESHING_SETTINGS = Object.freeze({
  // Legacy procedural GLBs carry <name>_LOD0/1/2 as independently planned
  // SDF meshes. Source-mesh references ignore these settings and preserve
  // their authored LOD geometry exactly.
  exportLods: true,
  exportResolution: 224,
  normalsMode: 'gradient',
  previewResolution: 80,
  removeIslands: true,
  // Dual-contouring vertex placement: planar-cut edges and heightfield
  // ridgelines stay knife-sharp instead of chamfering by a voxel.
  sharpFeatures: true,
});

// Quality tiers couple meshing resolution and normal mode for a target
// viewing context, so hosts pick one word instead of tuning both by hand:
//
// - `hero` — close-up set pieces (< 20 m camera): highest resolution, flat
//   faceted normals so planar cuts read as stylized facets.
// - `gameplayHigh` — open-world gameplay cameras (50–160 m): gradient
//   normals (flat facets go near-black at range under toon lighting) at the
//   default resolutions.
// - `mobile` — low-end targets: reduced resolutions, gradient normals,
//   sharp-feature solve off.
export const ROCKGEN_QUALITY_LEVELS = Object.freeze(['hero', 'gameplayHigh', 'mobile']);

export const ROCKGEN_QUALITY_PRESETS = Object.freeze({
  gameplayHigh: Object.freeze({
    exportResolution: 224,
    normalsMode: 'gradient',
    previewResolution: 96,
    sharpFeatures: true,
  }),
  hero: Object.freeze({
    exportResolution: 288,
    normalsMode: 'flat',
    previewResolution: 128,
    sharpFeatures: true,
  }),
  mobile: Object.freeze({
    exportLods: false,
    exportResolution: 128,
    normalsMode: 'gradient',
    previewResolution: 56,
    sharpFeatures: false,
  }),
});

/**
 * Returns full meshing settings for a quality tier merged over
 * {@link DEFAULT_ROCKGEN_MESHING_SETTINGS}; unknown names return the plain
 * defaults. Spread the result into a preset's `meshing`:
 *
 *   const preset = resolveRockgenPreset('boulder', { style: 'call_me_sensei' });
 *   preset.meshing = { ...preset.meshing, ...resolveRockgenQuality('gameplayHigh') };
 */
export function resolveRockgenQuality(name) {
  const tier = ROCKGEN_QUALITY_PRESETS[name];
  return { ...DEFAULT_ROCKGEN_MESHING_SETTINGS, ...(tier ?? {}) };
}

export const ROCKGEN_SETTING_GROUPS = Object.freeze([
  Object.freeze({
    description: 'Base primitive the rock piece is displaced from.',
    id: 'shape',
    label: 'Base Shape',
  }),
  Object.freeze({
    description: 'Eroded landform for the Heightfield shape: relief, strata terracing, and real hydraulic/thermal erosion.',
    id: 'heightfield',
    label: 'Heightfield & Erosion',
  }),
  Object.freeze({
    description: 'FBM displacement that roughens the silhouette.',
    id: 'noise',
    label: 'Surface Noise',
  }),
  Object.freeze({
    description: 'Domain warp that swirls the shape before displacement, breaking symmetry.',
    id: 'warp',
    label: 'Domain Warp',
  }),
  Object.freeze({
    description: 'Seeded flat plane slices — dead-flat faces and sharp edges for slabs, shards, and cliff walls.',
    id: 'cuts',
    label: 'Planar Cuts',
  }),
  Object.freeze({
    description: 'Voronoi border grooves for a fractured look. Carves rounded creases, not flat planes — use Planar Cuts for slab faces.',
    id: 'facet',
    label: 'Voronoi Faceting',
  }),
  Object.freeze({
    description: 'Sparse deep fissures in weathered patches — big Voronoi borders gated by a coverage mask.',
    id: 'cracks',
    label: 'Cracks',
  }),
  Object.freeze({
    description: 'Sedimentary bands / terracing grooves along a tiltable axis.',
    id: 'strata',
    label: 'Strata',
  }),
  Object.freeze({
    description: 'Columnar jointing: vertical prismatic columns with stepped heights (basalt cliffs).',
    id: 'columns',
    label: 'Columns',
  }),
  Object.freeze({
    description: 'Shapes the silhouette: flatten the base, taper the top, pinch the sides.',
    id: 'falloff',
    label: 'Silhouette Falloff',
  }),
  Object.freeze({
    description: 'Procedural albedo layers, baked vertex colors, and SDF ambient occlusion (whole document).',
    id: 'surface',
    label: 'Surface Color & AO',
  }),
  Object.freeze({
    description: 'Grid resolutions and normal mode for preview and export meshing.',
    id: 'meshing',
    label: 'Meshing',
  }),
]);

export const ROCKGEN_SETTING_DEFAULTS = Object.freeze({
  columns: DEFAULT_ROCK_COLUMNS_SETTINGS,
  cracks: DEFAULT_ROCK_CRACKS_SETTINGS,
  cuts: DEFAULT_ROCK_CUTS_SETTINGS,
  facet: DEFAULT_ROCK_FACET_SETTINGS,
  heightfield: DEFAULT_ROCK_HEIGHTFIELD_SETTINGS,
  falloff: DEFAULT_ROCK_FALLOFF_SETTINGS,
  meshing: DEFAULT_ROCKGEN_MESHING_SETTINGS,
  noise: DEFAULT_ROCK_NOISE_SETTINGS,
  shape: DEFAULT_ROCK_SHAPE_SETTINGS,
  strata: DEFAULT_ROCK_STRATA_SETTINGS,
  surface: DEFAULT_ROCK_SURFACE_SETTINGS,
  warp: DEFAULT_ROCK_WARP_SETTINGS,
});

/** Groups that live on each piece (the rest belong to the document). */
export const ROCKGEN_PIECE_GROUP_IDS = Object.freeze(['shape', 'heightfield', 'noise', 'warp', 'cuts', 'facet', 'cracks', 'strata', 'columns', 'falloff']);

const SELECT_FIELD_OPTIONS = Object.freeze({
  'heightfield.profile': ROCK_HEIGHTFIELD_PROFILES,
  'meshing.normalsMode': ROCK_NORMALS_MODES,
  'surface.textureStyle': ROCK_SURFACE_TEXTURE_STYLES,
  'surface.pbrTexturePreset': ROCK_PBR_TEXTURE_PRESETS.map((entry) => entry.id),
  'shape.type': ROCK_SHAPE_TYPES,
});

const SELECT_FIELD_OPTION_LABELS = Object.freeze({
  'meshing.normalsMode': Object.freeze({ flat: 'Flat (faceted)', gradient: 'Gradient (smooth)' }),
  'surface.textureStyle': Object.freeze({
    basalt: 'Basalt',
    granite: 'Granite',
    limestone: 'Limestone',
    none: 'None',
    sandstone: 'Sandstone',
    veined: 'Veined',
  }),
  'surface.pbrTexturePreset': Object.freeze(Object.fromEntries(
    ROCK_PBR_TEXTURE_PRESETS.map((entry) => [entry.id, entry.label]),
  )),
  'shape.type': Object.freeze({
    box: 'Box',
    capsule: 'Capsule',
    ellipsoid: 'Ellipsoid',
    heightfield: 'Heightfield (eroded)',
    sketch: 'Sketch (drawn)',
    sphere: 'Sphere',
  }),
  'heightfield.profile': Object.freeze({
    mesa: 'Mesa (plateau)', open: 'Open', ridge: 'Ridge (crest)', slope: 'Slope (hillside)',
  }),
});

const COLOR_FIELD_KEYS = Object.freeze(new Set([
  'baseColor',
  'cavityColor',
  'lichenColor',
  'mossColor',
  'stainColor',
  'topColor',
  'veinColor',
]));

const FIELD_LABEL_OVERRIDES = Object.freeze({
  aoRadius: 'AO Radius',
  aoStrength: 'AO Strength',
  bevel: 'Edge Bevel',
  bottomFlatten: 'Flatten Base',
  count: 'Cut Count',
  depth: 'Cut Depth',
  grooveDepth: 'Groove Depth',
  grooveWidth: 'Groove Width',
  heightVariation: 'Height Steps',
  capsuleLength: 'Capsule Length',
  colorNoise: 'Color Noise',
  cornerRadius: 'Corner Radius',
  lichenColor: 'Lichen Color',
  lichenCoverage: 'Lichen Coverage',
  mossColor: 'Moss Color',
  mossCoverage: 'Moss Coverage',
  pbrNormalStrength: 'Normal Strength',
  pbrRoughness: 'Roughness',
  pbrTexturePreset: 'Texture Map',
  pbrTextureScale: 'Texture Tiling',
  radialPinch: 'Radial Pinch',
  seedOffset: 'Seed Offset',
  sizeX: 'Size X',
  sizeY: 'Size Y',
  sizeZ: 'Size Z',
  stainColor: 'Stain Color',
  stainStrength: 'Stain Strength',
  textureScale: 'Texture Scale',
  textureStrength: 'Texture Strength',
  textureStyle: 'Texture Style',
  tiltDegrees: 'Tilt (deg)',
  topCoatStrength: 'Top Coat',
  topHeightStart: 'Top Height Start',
  topSlopeStart: 'Top Slope Start',
  terraceSteps: 'Terrace Steps',
  topTaper: 'Taper Top',
  veinColor: 'Vein Color',
  veinStrength: 'Vein Strength',
  verticalBias: 'Vertical Bias',
  warpAmount: 'Band Warp',
});

const FIELD_DESCRIPTIONS = Object.freeze({
  'surface.pbrNormalStrength': 'Strength of the selected Texture Lab normal map.',
  'surface.pbrRoughness': 'Overall roughness multiplier for the selected PBR texture set.',
  'surface.pbrTexturePreset': 'Applies a real tileable Texture Lab albedo, normal, and roughness map set to the rock GLB.',
  'surface.pbrTextureScale': 'Number of times the selected PBR texture repeats across the source UVs.',
  'surface.lichenCoverage': 'Adds pale spotty lichen on exposed faces.',
  'surface.mossCoverage': 'Adds green moss on ledges and damp cavities.',
  'surface.stainStrength': 'Adds rusty mineral staining and rain streaks.',
  'surface.textureScale': 'Scales the procedural grain and patch pattern.',
  'surface.textureStrength': 'Blends the selected procedural rock texture into the baked color.',
  'surface.textureStyle': 'Chooses the procedural albedo pattern baked into vertex colors.',
  'surface.topCoatStrength': 'Strength of the top-facing snow, dust, moss, or highlight coat.',
  'surface.veinStrength': 'Adds thin quartz/mineral seams through the rock.',
});

const FIELD_RANGES = Object.freeze({
  'columns.grooveDepth': { max: 0.5, min: 0, step: 0.005 },
  'columns.grooveWidth': { max: 0.6, min: 0.02, step: 0.01 },
  'columns.heightVariation': { max: 2.5, min: 0, step: 0.01 },
  'columns.scale': { max: 6, min: 0.3, step: 0.05 },
  'cracks.coverage': { max: 1, min: 0, step: 0.01 },
  'cracks.depth': { max: 0.3, min: 0, step: 0.005 },
  'cracks.scale': { max: 4, min: 0.2, step: 0.05 },
  'cracks.width': { max: 0.3, min: 0.02, step: 0.005 },
  'cuts.bevel': { max: 0.25, min: 0, step: 0.005 },
  'cuts.count': { max: 24, min: 1, step: 1 },
  'cuts.depth': { max: 0.8, min: 0.02, step: 0.01 },
  'cuts.seedOffset': { max: 9999, min: 0, step: 1 },
  'cuts.verticalBias': { max: 1, min: 0, step: 0.01 },
  'facet.jitter': { max: 1, min: 0, step: 0.01 },
  'heightfield.droplets': { max: 1, min: 0, step: 0.01 },
  'heightfield.erosion': { max: 1, min: 0, step: 0.01 },
  'heightfield.relief': { max: 1, min: 0, step: 0.01 },
  'heightfield.roughness': { max: 1, min: 0, step: 0.01 },
  'heightfield.seedOffset': { max: 9999, min: 0, step: 1 },
  'heightfield.terrace': { max: 1, min: 0, step: 0.01 },
  'heightfield.terraceSteps': { max: 14, min: 2, step: 1 },
  'heightfield.thermal': { max: 1, min: 0, step: 0.01 },
  'facet.scale': { max: 8, min: 0.3, step: 0.05 },
  'facet.strength': { max: 0.8, min: 0, step: 0.005 },
  'falloff.bottomFlatten': { max: 1, min: 0, step: 0.01 },
  'falloff.radialPinch': { max: 1, min: 0, step: 0.01 },
  'falloff.topTaper': { max: 1, min: 0, step: 0.01 },
  'meshing.exportResolution': { max: 320, min: 32, step: 16 },
  'meshing.previewResolution': { max: 128, min: 24, step: 8 },
  'noise.amplitude': { max: 0.6, min: 0, step: 0.005 },
  'noise.frequency': { max: 8, min: 0.1, step: 0.05 },
  'noise.gain': { max: 0.9, min: 0.1, step: 0.01 },
  'noise.lacunarity': { max: 3.5, min: 1.2, step: 0.05 },
  'noise.octaves': { max: 8, min: 1, step: 1 },
  'noise.seedOffset': { max: 9999, min: 0, step: 1 },
  'shape.capsuleLength': { max: 20, min: 0.1, step: 0.05 },
  'shape.cornerRadius': { max: 1, min: 0, step: 0.01 },
  'shape.sizeX': { max: 20, min: 0.1, step: 0.05 },
  'shape.sizeY': { max: 20, min: 0.1, step: 0.05 },
  'shape.sizeZ': { max: 20, min: 0.1, step: 0.05 },
  'strata.frequency': { max: 12, min: 0.5, step: 0.1 },
  'strata.sharpness': { max: 1, min: 0, step: 0.01 },
  'strata.strength': { max: 0.5, min: 0, step: 0.005 },
  'strata.tiltDegrees': { max: 45, min: -45, step: 1 },
  'strata.warpAmount': { max: 1, min: 0, step: 0.01 },
  'surface.aoRadius': { max: 2, min: 0.05, step: 0.01 },
  'surface.aoStrength': { max: 2, min: 0, step: 0.01 },
  'surface.colorNoise': { max: 0.3, min: 0, step: 0.005 },
  'surface.lichenCoverage': { max: 1, min: 0, step: 0.01 },
  'surface.mossCoverage': { max: 1, min: 0, step: 0.01 },
  'surface.pbrNormalStrength': { max: 2, min: 0, step: 0.01 },
  'surface.pbrRoughness': { max: 1, min: 0, step: 0.01 },
  'surface.pbrTextureScale': { max: 20, min: 0.1, step: 0.1 },
  'surface.stainStrength': { max: 1, min: 0, step: 0.01 },
  'surface.textureScale': { max: 6, min: 0.1, step: 0.05 },
  'surface.textureStrength': { max: 1, min: 0, step: 0.01 },
  'surface.topCoatStrength': { max: 1, min: 0, step: 0.01 },
  'surface.topHeightStart': { max: 1, min: 0, step: 0.01 },
  'surface.topSlopeStart': { max: 1, min: 0, step: 0.01 },
  'surface.veinStrength': { max: 1, min: 0, step: 0.01 },
  'warp.frequency': { max: 4, min: 0.1, step: 0.05 },
  'warp.strength': { max: 1.5, min: 0, step: 0.01 },
});

function labelFromFieldName(key) {
  if (FIELD_LABEL_OVERRIDES[key]) return FIELD_LABEL_OVERRIDES[key];
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (char) => char.toUpperCase());
}

function descriptionForField(group, key) {
  const id = `${group.id}.${key}`;
  if (FIELD_DESCRIPTIONS[id]) return FIELD_DESCRIPTIONS[id];
  const label = labelFromFieldName(key).toLowerCase();
  if (key === 'enabled') return `Turns the ${group.label.toLowerCase()} stage on or off.`;
  return `Adjusts ${label} for ${group.label.toLowerCase()}.`;
}

function createRockgenFieldMetadata(group, key, value) {
  const id = `${group.id}.${key}`;
  const options = SELECT_FIELD_OPTIONS[id];
  const type = typeof value === 'boolean'
    ? 'boolean'
    : options
      ? 'select'
      : COLOR_FIELD_KEYS.has(key)
        ? 'color'
        : 'number';
  return Object.freeze({
    defaultValue: value,
    description: descriptionForField(group, key),
    group: group.id,
    id,
    key,
    label: labelFromFieldName(key),
    optionLabels: options ? SELECT_FIELD_OPTION_LABELS[id] : undefined,
    options: options ? [...options] : undefined,
    range: type === 'number' ? (FIELD_RANGES[id] ?? { max: 1, min: 0, step: 0.01 }) : undefined,
    serializable: true,
    type,
  });
}

export const ROCKGEN_SETTING_FIELD_SCHEMA = Object.freeze(Object.fromEntries(
  ROCKGEN_SETTING_GROUPS.map((group) => [
    group.id,
    Object.freeze(Object.fromEntries(
      Object.entries(ROCKGEN_SETTING_DEFAULTS[group.id])
        .map(([key, value]) => [key, createRockgenFieldMetadata(group, key, value)]),
    )),
  ]),
));

// --- Coercing creators ------------------------------------------------------

function numberOption(value, fallback, { max = Infinity, min = -Infinity } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(number, min), max);
}

function booleanOption(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function enumOption(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function colorOption(value, fallback) {
  if (Array.isArray(value) && value.length >= 3) {
    const channels = value.slice(0, 3).map(Number);
    if (channels.every(Number.isFinite)) {
      return channels.map((channel) => Math.min(Math.max(channel, 0), 1));
    }
  }
  return [...fallback];
}

function rangeFor(groupId, key) {
  return FIELD_RANGES[`${groupId}.${key}`];
}

function createGroupSettings(groupId, options, coercers) {
  const source = options && typeof options === 'object' ? options : {};
  const defaults = ROCKGEN_SETTING_DEFAULTS[groupId];
  const result = {};
  for (const [key, fallback] of Object.entries(defaults)) {
    const coerce = coercers?.[key];
    if (coerce) {
      result[key] = coerce(source[key], fallback);
    } else if (typeof fallback === 'boolean') {
      result[key] = booleanOption(source[key], fallback);
    } else if (Array.isArray(fallback)) {
      result[key] = colorOption(source[key], fallback);
    } else if (typeof fallback === 'number') {
      result[key] = numberOption(source[key], fallback, rangeFor(groupId, key));
    } else {
      result[key] = source[key] ?? fallback;
    }
  }
  return result;
}

export function createRockShapeSettings(options = null) {
  return createGroupSettings('shape', options, {
    type: (value, fallback) => enumOption(value, ROCK_SHAPE_TYPES, fallback),
  });
}

export function createRockNoiseSettings(options = null) {
  const settings = createGroupSettings('noise', options);
  settings.octaves = Math.round(settings.octaves);
  settings.seedOffset = Math.round(settings.seedOffset);
  return settings;
}

export function createRockWarpSettings(options = null) {
  return createGroupSettings('warp', options);
}

export function createRockCutsSettings(options = null) {
  const settings = createGroupSettings('cuts', options);
  settings.count = Math.round(settings.count);
  settings.seedOffset = Math.round(settings.seedOffset);
  return settings;
}

export function createRockFacetSettings(options = null) {
  return createGroupSettings('facet', options);
}

export function createRockCracksSettings(options = null) {
  return createGroupSettings('cracks', options);
}

export function createRockHeightfieldSettings(options = null) {
  const settings = createGroupSettings('heightfield', options, {
    profile: (value, fallback) => enumOption(value, ROCK_HEIGHTFIELD_PROFILES, fallback),
  });
  settings.seedOffset = Math.round(settings.seedOffset);
  settings.terraceSteps = Math.round(settings.terraceSteps);
  return settings;
}

export function createRockStrataSettings(options = null) {
  return createGroupSettings('strata', options);
}

export function createRockColumnsSettings(options = null) {
  return createGroupSettings('columns', options);
}

export function createRockFalloffSettings(options = null) {
  return createGroupSettings('falloff', options);
}

export function createRockSurfaceSettings(options = null) {
  return createGroupSettings('surface', options, {
    pbrTexturePreset: (value, fallback) => enumOption(
      value,
      ROCK_PBR_TEXTURE_PRESETS.map((entry) => entry.id),
      fallback,
    ),
    textureStyle: (value, fallback) => enumOption(value, ROCK_SURFACE_TEXTURE_STYLES, fallback),
  });
}

export function createRockgenMeshingSettings(options = null) {
  const settings = createGroupSettings('meshing', options, {
    normalsMode: (value, fallback) => enumOption(value, ROCK_NORMALS_MODES, fallback),
  });
  settings.exportResolution = Math.round(settings.exportResolution);
  settings.previewResolution = Math.round(settings.previewResolution);
  return settings;
}

/** All piece-level groups coerced from a partial `{ shape, noise, ... }`. */
export function createRockPieceSettings(options = null) {
  const source = options && typeof options === 'object' ? options : {};
  return {
    columns: createRockColumnsSettings(source.columns),
    cracks: createRockCracksSettings(source.cracks),
    cuts: createRockCutsSettings(source.cuts),
    facet: createRockFacetSettings(source.facet),
    heightfield: createRockHeightfieldSettings(source.heightfield),
    falloff: createRockFalloffSettings(source.falloff),
    noise: createRockNoiseSettings(source.noise),
    shape: createRockShapeSettings(source.shape),
    strata: createRockStrataSettings(source.strata),
    warp: createRockWarpSettings(source.warp),
  };
}
