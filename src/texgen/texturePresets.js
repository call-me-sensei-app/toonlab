// Built-in material presets for the texture generator. Each entry is a
// partial settings document (merged over DEFAULT_TEXTURE_SETTINGS by
// createTextureSettings) plus tags used by the offline prompt mapper and
// the AI archetype catalog. Colors are hex — the settings factory converts.

export const TEXTURE_PRESET_CATEGORIES = Object.freeze([
  Object.freeze({ id: 'stone', label: 'Stone & masonry' }),
  Object.freeze({ id: 'ground', label: 'Ground & terrain' }),
  Object.freeze({ id: 'wood', label: 'Wood' }),
  Object.freeze({ id: 'metal', label: 'Metal' }),
  Object.freeze({ id: 'fabric', label: 'Fabric & leather' }),
  Object.freeze({ id: 'ceramic', label: 'Ceramic & man-made' }),
  Object.freeze({ id: 'organic', label: 'Organic & creature' }),
  Object.freeze({ id: 'liquid', label: 'Liquid, ice & fire' }),
  Object.freeze({ id: 'scifi', label: 'Sci-fi & glow' }),
  Object.freeze({ id: 'stylized', label: 'Stylized & graphic' }),
]);

const ramp = (color0, color1, color2, color3, color4) => ({ color0, color1, color2, color3, color4 });

const preset = (id, label, category, tags, settings) => Object.freeze({ category, id, label, settings, tags });

export const BUILT_IN_TEXTURE_PRESETS = Object.freeze([
  // ------------------------------------------------------------- stone
  preset('cliff-rock', 'Cliff rock', 'stone', ['rock', 'cliff', 'mountain', 'boulder', 'granite'], {
    base: { generator: 'ridged', scale: 5, detail: 5, stretchY: 1.6, warp: 0.25, contrast: 0.15 },
    detailA: { enabled: true, generator: 'fbm', blend: 'overlay', amount: 0.4, scale: 16 },
    color: { ...ramp('#2e2a28', '#4d4742', '#6e675e', '#8a8378', '#a89f90'), cavity: 0.5, sheen: 0.22, jitterHue: 0.03 },
    surface: { heightScale: 0.65, roughness: 0.85, roughnessContrast: 0.4 },
  }),
  preset('castle-bricks', 'Castle bricks', 'stone', ['brick', 'castle', 'wall', 'medieval', 'dungeon', 'fortress'], {
    base: { generator: 'bricks', columns: 4, rows: 8, gap: 0.07, bevel: 0.14, cellVariation: 0.45 },
    detailA: { enabled: true, generator: 'fbm', blend: 'overlay', amount: 0.3, scale: 14 },
    detailB: { enabled: true, generator: 'speckle', blend: 'add', amount: 0.12, scale: 32, cellVariation: 0.5 },
    color: { ...ramp('#241f1c', '#4a423b', '#6b6156', '#847a6c', '#9d9384'), jitterCells: true, jitterValue: 0.14, cavity: 0.55, sheen: 0.15 },
    surface: { heightScale: 0.6, roughness: 0.9, roughnessContrast: 0.35 },
  }),
  preset('mossy-bricks', 'Mossy bricks', 'stone', ['moss', 'brick', 'ruin', 'overgrown', 'ancient', 'swamp'], {
    base: { generator: 'bricks', columns: 4, rows: 8, gap: 0.07, bevel: 0.14, cellVariation: 0.4 },
    detailA: { enabled: true, generator: 'fbm', blend: 'overlay', amount: 0.3, scale: 14 },
    color: { ...ramp('#241f1c', '#48413a', '#665d52', '#7d7466', '#948a7b'), jitterCells: true, jitterValue: 0.12, cavity: 0.55 },
    accentA: {
      enabled: true, generator: 'fbm', scale: 6, warp: 0.4, coverage: 0.45, softness: 0.22, creviceBias: 0.7,
      color: '#3f5a26', colorB: '#6c8a38', blend: 'normal', roughnessShift: 0.2, heightShift: 0.05,
    },
    surface: { heightScale: 0.6, roughness: 0.9, roughnessContrast: 0.3 },
  }),
  preset('cobblestone', 'Cobblestone', 'stone', ['cobble', 'street', 'road', 'path', 'village'], {
    base: { generator: 'worley', scale: 7, cellJitter: 0.85, cellVariation: 0.4, contrast: 0.05 },
    detailA: { enabled: true, generator: 'fbm', blend: 'overlay', amount: 0.25, scale: 18 },
    color: { ...ramp('#1f1d1c', '#3d3a37', '#5b5651', '#736d64', '#8d8679'), pos1: 0.16, jitterCells: true, jitterValue: 0.12, cavity: 0.6, sheen: 0.2 },
    surface: { heightScale: 0.7, roughness: 0.85, roughnessContrast: 0.4 },
  }),
  preset('white-marble', 'White marble', 'stone', ['marble', 'polished', 'luxury', 'palace', 'statue', 'bathroom'], {
    base: { generator: 'marble', scale: 4, detail: 5, rings: 3, grain: 0.75, warp: 0.2 },
    detailA: { enabled: true, generator: 'fbm', blend: 'overlay', amount: 0.15, scale: 9 },
    color: { ...ramp('#8f8d95', '#c9c7cc', '#e8e6e8', '#f2f0f0', '#fbfaf8'), cavity: 0.12, sheen: 0.25, jitterValue: 0.04 },
    surface: { heightScale: 0.12, roughness: 0.22, roughnessContrast: 0.15, aoStrength: 0.25 },
  }),
  preset('black-gold-marble', 'Black & gold marble', 'stone', ['marble', 'gold', 'black', 'luxury', 'expensive', 'lobby'], {
    base: { generator: 'marble', scale: 4, detail: 5, rings: 4, grain: 0.85, warp: 0.3 },
    color: { ...ramp('#101216', '#181b21', '#22262d', '#8a6c26', '#e0b34c'), pos3: 0.88, rampSmooth: 0.8, cavity: 0.1, sheen: 0.3 },
    surface: { heightScale: 0.1, roughness: 0.2, roughnessContrast: 0.1, aoStrength: 0.2 },
  }),
  preset('granite', 'Speckled granite', 'stone', ['granite', 'speckle', 'counter', 'kitchen'], {
    base: { generator: 'fbm', scale: 6, detail: 4, contrast: -0.3 },
    detailB: { enabled: true, generator: 'speckle', blend: 'add', amount: 0.5, scale: 36, cellVariation: 0.75, edgeWidth: 0.22 },
    color: { ...ramp('#26242a', '#4b4750', '#6d6870', '#8b8590', '#b0aab2'), jitterValue: 0.1, cavity: 0.15 },
    surface: { heightScale: 0.15, roughness: 0.45, roughnessContrast: 0.1 },
  }),
  preset('sandstone-strata', 'Sandstone strata', 'stone', ['sandstone', 'canyon', 'desert', 'strata', 'layered', 'mesa'], {
    base: { generator: 'stripes', columns: 9, rotate90: true, warp: 0.4, warpScale: 4, contrast: -0.15 },
    detailA: { enabled: true, generator: 'fbm', blend: 'overlay', amount: 0.35, scale: 12, stretchX: 3 },
    color: { ...ramp('#6e4526', '#95602f', '#b57e42', '#cf9d5c', '#e5bd7e'), jitterValue: 0.1, cavity: 0.35, sheen: 0.2 },
    surface: { heightScale: 0.45, roughness: 0.85, roughnessContrast: 0.3 },
  }),
  preset('slate', 'Slate', 'stone', ['slate', 'shale', 'dark', 'flagstone'], {
    base: { generator: 'ridged', scale: 6, detail: 4, stretchX: 2.6, contrast: 0.2 },
    color: { ...ramp('#171a20', '#242833', '#333947', '#475062', '#5d677c'), cavity: 0.45, sheen: 0.3, jitterHue: 0.03 },
    surface: { heightScale: 0.4, roughness: 0.6, roughnessContrast: 0.35 },
  }),
  preset('basalt', 'Volcanic basalt', 'stone', ['basalt', 'volcanic', 'black', 'lava rock'], {
    base: { generator: 'turbulence', scale: 7, detail: 5, warp: 0.2, contrast: 0.1 },
    detailB: { enabled: true, generator: 'speckle', blend: 'add', amount: 0.2, scale: 30, cellVariation: 0.6 },
    color: { ...ramp('#0c0c0e', '#1b1a1d', '#2a292c', '#3a383b', '#4d4a4c'), cavity: 0.5, sheen: 0.12 },
    surface: { heightScale: 0.5, roughness: 0.95, roughnessContrast: 0.25 },
  }),

  // ------------------------------------------------------------- ground
  preset('meadow-grass', 'Meadow grass', 'ground', ['grass', 'lawn', 'meadow', 'field', 'green'], {
    base: { generator: 'fbm', scale: 12, detail: 5, detailGain: 0.55, stretchY: 1.6 },
    detailB: { enabled: true, generator: 'speckle', blend: 'add', amount: 0.25, scale: 40, cellVariation: 0.6 },
    color: { ...ramp('#1d3a14', '#2f5719', '#447722', '#5f942c', '#82b13e'), jitterHue: 0.07, jitterValue: 0.12, cavity: 0.3 },
    surface: { heightScale: 0.35, roughness: 1, roughnessContrast: 0.1 },
  }),
  preset('dry-dirt', 'Dry dirt', 'ground', ['dirt', 'soil', 'earth', 'dusty', 'trail'], {
    base: { generator: 'fbm', scale: 8, detail: 5, warp: 0.15 },
    detailB: { enabled: true, generator: 'speckle', blend: 'add', amount: 0.3, scale: 30, cellVariation: 0.55 },
    color: { ...ramp('#3a2a1c', '#55402a', '#6f5638', '#856a47', '#9c8158'), jitterValue: 0.1, cavity: 0.4 },
    surface: { heightScale: 0.4, roughness: 0.95, roughnessContrast: 0.2 },
  }),
  preset('cracked-mud', 'Cracked mud', 'ground', ['mud', 'cracked', 'drought', 'dry lake', 'wasteland'], {
    base: { generator: 'cracks', scale: 5, edgeWidth: 0.09, cellJitter: 0.9, cellVariation: 0.25, warp: 0.25 },
    detailA: { enabled: true, generator: 'fbm', blend: 'overlay', amount: 0.25, scale: 14 },
    color: { ...ramp('#33231a', '#5b4530', '#7d6244', '#977a55', '#ac9066'), cavity: 0.65, sheen: 0.12, jitterValue: 0.08 },
    surface: { heightScale: 0.55, roughness: 0.9, roughnessContrast: 0.45 },
  }),
  preset('desert-sand', 'Desert dunes', 'ground', ['sand', 'desert', 'dune', 'beach', 'ripple'], {
    base: { generator: 'fbm', scale: 7, detail: 3, stretchX: 4, warp: 0.2 },
    detailB: { enabled: true, generator: 'speckle', blend: 'add', amount: 0.12, scale: 44, cellVariation: 0.4, edgeWidth: 0.1 },
    color: { ...ramp('#8a5f33', '#b07f45', '#cc9a58', '#e0b26c', '#f0c983'), jitterValue: 0.06, cavity: 0.3, sheen: 0.3 },
    surface: { heightScale: 0.35, roughness: 0.85, roughnessContrast: 0.15 },
  }),
  preset('fresh-snow', 'Fresh snow', 'ground', ['snow', 'winter', 'ice', 'arctic', 'white'], {
    base: { generator: 'fbm', scale: 5, detail: 3, contrast: -0.35 },
    detailB: { enabled: true, generator: 'speckle', blend: 'add', amount: 0.18, scale: 48, cellVariation: 0.35, edgeWidth: 0.08 },
    color: { ...ramp('#9fb6d8', '#c3d3ea', '#e0eaf6', '#f2f7fc', '#ffffff'), cavity: 0.2, cavityTint: '#7d9cc9', sheen: 0.4 },
    surface: { heightScale: 0.3, roughness: 0.4, roughnessContrast: -0.2, aoStrength: 0.35 },
  }),
  preset('forest-floor', 'Forest floor', 'ground', ['forest', 'leaf', 'litter', 'undergrowth', 'woodland'], {
    base: { generator: 'turbulence', scale: 9, detail: 5, warp: 0.3 },
    detailB: { enabled: true, generator: 'speckle', blend: 'add', amount: 0.35, scale: 26, cellVariation: 0.7, edgeWidth: 0.24 },
    color: { ...ramp('#241a10', '#3e2c19', '#564023', '#6d5730', '#82683a'), jitterHue: 0.06, jitterValue: 0.14, cavity: 0.5 },
    accentA: {
      enabled: true, generator: 'fbm', scale: 5, warp: 0.4, coverage: 0.35, softness: 0.25, creviceBias: 0.4,
      color: '#37501f', colorB: '#59742c', blend: 'normal', roughnessShift: 0.1, heightShift: 0.03,
    },
    surface: { heightScale: 0.45, roughness: 1, roughnessContrast: 0.2 },
  }),
  preset('wet-mud', 'Wet mud', 'ground', ['mud', 'wet', 'swamp', 'bog', 'slick'], {
    base: { generator: 'fbm', scale: 6, detail: 4, warp: 0.35 },
    color: { ...ramp('#1c130c', '#2e2013', '#40301c', '#524026', '#665233'), cavity: 0.5, sheen: 0.35, sheenTint: '#cfd8e0' },
    surface: { heightScale: 0.4, roughness: 0.35, roughnessContrast: 0.5 },
  }),
  preset('asphalt', 'Asphalt', 'ground', ['asphalt', 'road', 'tarmac', 'street', 'parking'], {
    base: { generator: 'fbm', scale: 10, detail: 4, contrast: -0.4 },
    detailB: { enabled: true, generator: 'speckle', blend: 'add', amount: 0.4, scale: 46, cellVariation: 0.6, edgeWidth: 0.14 },
    color: { ...ramp('#151517', '#232326', '#2f2f33', '#3b3b40', '#4a4a4f'), jitterValue: 0.06, cavity: 0.3 },
    surface: { heightScale: 0.25, roughness: 0.9, roughnessContrast: 0.2 },
  }),
  preset('gravel', 'Gravel', 'ground', ['gravel', 'pebble', 'crushed stone', 'driveway'], {
    base: { generator: 'worley', scale: 15, cellJitter: 1, cellVariation: 0.55, contrast: 0.05 },
    color: { ...ramp('#26221f', '#453f39', '#615a51', '#7a7266', '#948b7c'), pos1: 0.15, jitterCells: true, jitterValue: 0.16, cavity: 0.5 },
    surface: { heightScale: 0.5, roughness: 0.9, roughnessContrast: 0.3 },
  }),

  // ------------------------------------------------------------- wood
  preset('oak-planks', 'Oak planks', 'wood', ['wood', 'plank', 'floor', 'oak', 'board'], {
    base: { generator: 'tiles', columns: 4, rows: 1, gap: 0.035, bevel: 0.05, cellVariation: 0.3 },
    detailA: { enabled: true, generator: 'woodGrain', blend: 'multiply', amount: 0.55, scale: 5, rings: 9, grain: 0.55, rotate90: true },
    color: { ...ramp('#3a2413', '#5c3c1e', '#7b5429', '#956b38', '#ab8149'), jitterCells: true, jitterValue: 0.12, cavity: 0.4, sheen: 0.2 },
    surface: { heightScale: 0.3, roughness: 0.65, roughnessContrast: 0.25 },
  }),
  preset('walnut-floor', 'Dark walnut floor', 'wood', ['walnut', 'dark wood', 'floor', 'mahogany', 'furniture'], {
    base: { generator: 'tiles', columns: 5, rows: 1, gap: 0.03, bevel: 0.04, cellVariation: 0.35 },
    detailA: { enabled: true, generator: 'woodGrain', blend: 'multiply', amount: 0.6, scale: 5, rings: 11, grain: 0.6, rotate90: true },
    color: { ...ramp('#190e08', '#2c1a0e', '#3f2715', '#52351d', '#654327'), jitterCells: true, jitterValue: 0.1, cavity: 0.35, sheen: 0.3 },
    surface: { heightScale: 0.22, roughness: 0.4, roughnessContrast: 0.2 },
  }),
  preset('weathered-planks', 'Weathered planks', 'wood', ['weathered', 'old wood', 'barn', 'driftwood', 'fence', 'pier'], {
    base: { generator: 'tiles', columns: 4, rows: 1, gap: 0.05, bevel: 0.07, cellVariation: 0.45 },
    detailA: { enabled: true, generator: 'woodGrain', blend: 'multiply', amount: 0.65, scale: 6, rings: 8, grain: 0.8, rotate90: true },
    detailB: { enabled: true, generator: 'cracks', blend: 'min', amount: 0.25, scale: 12, edgeWidth: 0.06, stretchY: 4 },
    color: { ...ramp('#2b2620', '#4a443b', '#645d51', '#7b7365', '#8f8778'), jitterCells: true, jitterValue: 0.14, cavity: 0.5 },
    wear: { damage: 0.4, dirt: 0.3 },
    surface: { heightScale: 0.4, roughness: 0.9, roughnessContrast: 0.35 },
  }),
  preset('tree-bark', 'Tree bark', 'wood', ['bark', 'tree', 'trunk', 'forest'], {
    base: { generator: 'ridged', scale: 7, detail: 5, stretchY: 3.4, warp: 0.2 },
    color: { ...ramp('#231710', '#3a281a', '#4f3a24', '#63492e', '#775a3a'), cavity: 0.6, sheen: 0.12, jitterValue: 0.1 },
    surface: { heightScale: 0.6, roughness: 0.95, roughnessContrast: 0.35 },
  }),
  preset('birch-wood', 'Birch wood', 'wood', ['birch', 'pale wood', 'plywood', 'scandinavian'], {
    base: { generator: 'woodGrain', scale: 3, rings: 5, grain: 0.35, stretchY: 1.5 },
    color: { ...ramp('#8d7350', '#b39670', '#cfb388', '#e2cba2', '#f0ddb8'), jitterValue: 0.06, cavity: 0.2, sheen: 0.2 },
    surface: { heightScale: 0.15, roughness: 0.55, roughnessContrast: 0.15 },
  }),
  preset('parquet', 'Parquet floor', 'wood', ['parquet', 'herringbone', 'floor', 'basket weave'], {
    base: { generator: 'basketWeave', columns: 4, rows: 4, gap: 0.05, bevel: 0.07 },
    detailA: { enabled: true, generator: 'woodGrain', blend: 'multiply', amount: 0.4, scale: 7, rings: 10, grain: 0.5 },
    color: { ...ramp('#4a2e15', '#6b4520', '#88592a', '#a06c36', '#b57f44'), jitterCells: true, jitterValue: 0.1, cavity: 0.3, sheen: 0.25 },
    surface: { heightScale: 0.25, roughness: 0.5, roughnessContrast: 0.2 },
  }),

  // ------------------------------------------------------------- metal
  preset('brushed-steel', 'Brushed steel', 'metal', ['steel', 'brushed', 'stainless', 'appliance', 'chrome'], {
    base: { generator: 'fbm', scale: 20, detail: 3, stretchX: 8, contrast: -0.35 },
    color: { ...ramp('#5c6066', '#767b82', '#8d939a', '#a3a9b0', '#bcc2c8'), cavity: 0.08, sheen: 0.25, jitterValue: 0.03 },
    surface: { heightScale: 0.08, normalStrength: 0.6, roughness: 0.38, roughnessContrast: -0.15, metalness: 1, aoStrength: 0.15 },
  }),
  preset('rusted-iron', 'Rusted iron', 'metal', ['rust', 'iron', 'corroded', 'oxidized', 'scrap', 'old metal'], {
    base: { generator: 'fbm', scale: 7, detail: 5, warp: 0.2 },
    detailB: { enabled: true, generator: 'speckle', blend: 'add', amount: 0.2, scale: 34, cellVariation: 0.5 },
    color: { ...ramp('#2c2b2c', '#413f40', '#565354', '#6b6767', '#807b79'), cavity: 0.35, sheen: 0.15 },
    accentA: {
      enabled: true, generator: 'turbulence', scale: 5, warp: 0.5, coverage: 0.55, softness: 0.25, creviceBias: 0.45,
      color: '#6e3312', colorB: '#b06a2a', blend: 'normal', roughnessShift: 0.45, heightShift: 0.04, metalShift: -0.85,
    },
    accentB: {
      enabled: true, generator: 'fbm', scale: 9, coverage: 0.25, softness: 0.2, creviceBias: 0.6,
      color: '#1d1512', colorB: '#33241c', blend: 'multiply', roughnessShift: 0.3, heightShift: -0.03,
    },
    surface: { heightScale: 0.35, roughness: 0.55, roughnessContrast: 0.3, metalness: 0.9 },
  }),
  preset('hammered-copper', 'Hammered copper', 'metal', ['copper', 'hammered', 'bronze', 'kettle', 'artisan'], {
    base: { generator: 'worley', scale: 8, cellJitter: 0.75, invert: true, contrast: 0.1 },
    detailA: { enabled: true, generator: 'fbm', blend: 'overlay', amount: 0.2, scale: 20 },
    color: { ...ramp('#3c1f10', '#67351a', '#8f4f26', '#b56d35', '#d68d4a'), cavity: 0.35, sheen: 0.35, sheenTint: '#ffd9a8' },
    surface: { heightScale: 0.35, roughness: 0.4, roughnessContrast: 0.3, metalness: 1 },
  }),
  preset('polished-gold', 'Polished gold', 'metal', ['gold', 'golden', 'treasure', 'trim', 'royal'], {
    base: { generator: 'fbm', scale: 6, detail: 3, contrast: -0.45 },
    color: { ...ramp('#6b4a12', '#96691c', '#c08c28', '#ddab38', '#f4c854'), cavity: 0.15, sheen: 0.3, sheenTint: '#fff2c4' },
    surface: { heightScale: 0.08, normalStrength: 0.6, roughness: 0.18, roughnessContrast: 0.1, metalness: 1, aoStrength: 0.15 },
  }),
  preset('galvanized-metal', 'Galvanized metal', 'metal', ['galvanized', 'zinc', 'sheet metal', 'industrial'], {
    base: { generator: 'cells', scale: 7, cellJitter: 1, cellVariation: 0.4, contrast: -0.2 },
    detailA: { enabled: true, generator: 'fbm', blend: 'overlay', amount: 0.25, scale: 22, stretchX: 2 },
    color: { ...ramp('#565b60', '#6e747a', '#848b91', '#979ea4', '#abb2b8'), jitterCells: true, jitterValue: 0.08, cavity: 0.1, sheen: 0.2 },
    surface: { heightScale: 0.1, normalStrength: 0.6, roughness: 0.5, roughnessContrast: -0.1, metalness: 0.95, aoStrength: 0.2 },
  }),
  preset('scifi-hull', 'Sci-fi hull panels', 'metal', ['sci-fi', 'hull', 'panel', 'spaceship', 'mech', 'plating'], {
    base: { generator: 'tiles', columns: 5, rows: 3, gap: 0.03, bevel: 0.05, cellVariation: 0.3 },
    detailB: { enabled: true, generator: 'speckle', blend: 'min', amount: 0.15, scale: 30, cellVariation: 0.4 },
    color: { ...ramp('#23272e', '#3a4049', '#4f5661', '#646c78', '#7b8490'), jitterCells: true, jitterValue: 0.1, cavity: 0.4, sheen: 0.25 },
    accentB: {
      enabled: true, generator: 'fbm', scale: 8, stretchY: 5, coverage: 0.3, softness: 0.25, creviceBias: 0.3,
      color: '#15171b', colorB: '#2a2e35', blend: 'multiply', roughnessShift: 0.3, heightShift: 0,
    },
    surface: { heightScale: 0.3, roughness: 0.45, roughnessContrast: 0.25, metalness: 0.9 },
  }),
  preset('copper-patina', 'Copper patina', 'metal', ['patina', 'verdigris', 'copper', 'statue', 'roof', 'aged'], {
    base: { generator: 'fbm', scale: 6, detail: 4, warp: 0.25 },
    color: { ...ramp('#33200f', '#553517', '#754a20', '#92602c', '#ab7639'), cavity: 0.3, sheen: 0.2 },
    accentA: {
      enabled: true, generator: 'turbulence', scale: 5, warp: 0.5, coverage: 0.55, softness: 0.3, creviceBias: 0.55,
      color: '#2f8a70', colorB: '#6fc4a5', blend: 'normal', roughnessShift: 0.4, heightShift: 0.03, metalShift: -0.7,
    },
    surface: { heightScale: 0.25, roughness: 0.45, roughnessContrast: 0.25, metalness: 0.95 },
  }),

  // ------------------------------------------------------------- fabric
  preset('denim', 'Denim', 'fabric', ['denim', 'jeans', 'jacket', 'blue fabric', 'textile'], {
    base: { generator: 'weave', columns: 34, rows: 34, gap: 0.14 },
    detailA: { enabled: true, generator: 'fbm', blend: 'overlay', amount: 0.2, scale: 5 },
    color: { ...ramp('#141c30', '#20304e', '#2c4166', '#3b537d', '#4f6892'), jitterValue: 0.06, cavity: 0.3, sheen: 0.15 },
    surface: { heightScale: 0.22, roughness: 0.95, roughnessContrast: 0.1, aoStrength: 0.4 },
  }),
  preset('canvas', 'Canvas', 'fabric', ['canvas', 'linen', 'burlap', 'sack', 'tent'], {
    base: { generator: 'weave', columns: 28, rows: 28, gap: 0.18 },
    detailA: { enabled: true, generator: 'fbm', blend: 'overlay', amount: 0.22, scale: 4 },
    color: { ...ramp('#6b5c44', '#8a795c', '#a29070', '#b5a480', '#c6b691'), jitterValue: 0.07, cavity: 0.25 },
    surface: { heightScale: 0.2, roughness: 1, roughnessContrast: 0.1, aoStrength: 0.35 },
  }),
  preset('tartan-plaid', 'Tartan plaid', 'fabric', ['plaid', 'tartan', 'flannel', 'scottish', 'checkered fabric'], {
    base: { generator: 'checker', columns: 6, rows: 6, warp: 0.03 },
    detailA: { enabled: true, generator: 'stripes', blend: 'multiply', amount: 0.45, columns: 12 },
    detailB: { enabled: true, generator: 'stripes', blend: 'multiply', amount: 0.45, columns: 12, rotate90: true },
    color: { ...ramp('#4a1420', '#77202c', '#9c3033', '#274224', '#3f6a35'), rampSmooth: 0.55, jitterValue: 0.04, cavity: 0.2 },
    surface: { heightScale: 0.12, roughness: 1, roughnessContrast: 0, aoStrength: 0.25 },
  }),
  preset('knit-wool', 'Knit wool', 'fabric', ['knit', 'wool', 'sweater', 'yarn', 'cozy'], {
    base: { generator: 'chevron', columns: 10, rows: 22, warp: 0.08 },
    detailA: { enabled: true, generator: 'fbm', blend: 'overlay', amount: 0.25, scale: 26, stretchY: 2 },
    color: { ...ramp('#7a6a55', '#998769', '#b3a07d', '#c7b58f', '#d8c8a2'), jitterValue: 0.07, cavity: 0.4, sheen: 0.1 },
    surface: { heightScale: 0.35, roughness: 1, roughnessContrast: 0.15, aoStrength: 0.45 },
  }),
  preset('leather', 'Leather', 'fabric', ['leather', 'hide', 'saddle', 'belt', 'boot'], {
    base: { generator: 'cracks', scale: 26, edgeWidth: 0.12, cellJitter: 1, cellVariation: 0.15 },
    detailA: { enabled: true, generator: 'fbm', blend: 'overlay', amount: 0.3, scale: 4, warp: 0.25 },
    color: { ...ramp('#2a150b', '#452411', '#5e3418', '#754521', '#8a552b'), pos1: 0.14, jitterValue: 0.07, cavity: 0.45, sheen: 0.3, sheenTint: '#e8c193' },
    surface: { heightScale: 0.15, roughness: 0.55, roughnessContrast: 0.3 },
  }),
  preset('worn-leather', 'Worn leather', 'fabric', ['old leather', 'worn', 'jacket', 'vintage', 'scuffed', 'antique'], {
    base: { generator: 'cracks', scale: 24, edgeWidth: 0.12, cellJitter: 1, cellVariation: 0.2 },
    detailA: { enabled: true, generator: 'fbm', blend: 'overlay', amount: 0.35, scale: 4, warp: 0.3 },
    detailB: { enabled: true, generator: 'cracks', blend: 'min', amount: 0.3, scale: 9, edgeWidth: 0.05, stretchX: 2.5, warp: 0.2 },
    color: {
      ...ramp('#1d0f08', '#331c0e', '#4a2b15', '#5f3c1e', '#714b28'),
      pos1: 0.12, jitterValue: 0.12, saturation: 0.85, cavity: 0.5, sheen: 0.45, sheenTint: '#d9b184',
    },
    wear: { damage: 0.45, dirt: 0.3 },
    accentB: {
      enabled: true, generator: 'turbulence', scale: 4, coverage: 0.35, softness: 0.3, creviceBias: -0.4,
      color: '#6d4d2c', colorB: '#8a6a40', blend: 'overlay', roughnessShift: -0.25, heightShift: 0,
    },
    surface: { heightScale: 0.16, roughness: 0.6, roughnessContrast: 0.35 },
  }),
  preset('carbon-fiber', 'Carbon fiber', 'fabric', ['carbon', 'fiber', 'racing', 'composite', 'tech'], {
    base: { generator: 'weave', columns: 22, rows: 22, gap: 0.08 },
    color: { ...ramp('#0a0b0d', '#15171b', '#22252b', '#2f333b', '#3e434d'), cavity: 0.3, sheen: 0.5, sheenTint: '#9fb4d8' },
    surface: { heightScale: 0.15, roughness: 0.3, roughnessContrast: -0.2, metalness: 0.4, aoStrength: 0.3 },
  }),

  // ------------------------------------------------------------- ceramic
  preset('bathroom-tiles', 'Bathroom tiles', 'ceramic', ['tile', 'bathroom', 'kitchen', 'porcelain', 'clean'], {
    base: { generator: 'tiles', columns: 8, rows: 8, gap: 0.05, bevel: 0.05, cellVariation: 0.1 },
    color: { ...ramp('#5f6a68', '#9fb5b0', '#c9dcd6', '#e2efe9', '#f4faf6'), jitterCells: true, jitterValue: 0.05, cavity: 0.35, sheen: 0.35 },
    surface: { heightScale: 0.18, roughness: 0.15, roughnessContrast: 0.35, aoStrength: 0.4 },
  }),
  preset('mosaic-tiles', 'Mosaic tiles', 'ceramic', ['mosaic', 'colorful', 'byzantine', 'pool', 'art'], {
    base: { generator: 'tiles', columns: 14, rows: 14, gap: 0.09, bevel: 0.08, cellVariation: 0.75 },
    color: {
      ...ramp('#20355c', '#2f6a8e', '#3f9d92', '#7cc4a2', '#e9e3c8'),
      jitterCells: true, jitterHue: 0.22, jitterValue: 0.15, cavity: 0.4, sheen: 0.3,
    },
    surface: { heightScale: 0.25, roughness: 0.25, roughnessContrast: 0.35, aoStrength: 0.45 },
  }),
  preset('hex-floor', 'Hex tiles', 'ceramic', ['hexagon', 'hex tile', 'honeycomb floor', 'cafe'], {
    base: { generator: 'hex', columns: 8, gap: 0.09, bevel: 0.12, cellVariation: 0.25 },
    color: { ...ramp('#1e2126', '#33383f', '#484e57', '#5d646e', '#747c86'), jitterCells: true, jitterValue: 0.1, cavity: 0.4, sheen: 0.2 },
    surface: { heightScale: 0.2, roughness: 0.35, roughnessContrast: 0.3, aoStrength: 0.4 },
  }),
  preset('terracotta', 'Terracotta', 'ceramic', ['terracotta', 'clay', 'pot', 'mediterranean', 'roof tile'], {
    base: { generator: 'fbm', scale: 7, detail: 4, contrast: -0.25 },
    detailB: { enabled: true, generator: 'speckle', blend: 'add', amount: 0.15, scale: 30, cellVariation: 0.45 },
    color: { ...ramp('#6e3018', '#8f4423', '#ab572c', '#c06a38', '#d17e46'), jitterValue: 0.07, cavity: 0.3, sheen: 0.15 },
    surface: { heightScale: 0.2, roughness: 0.85, roughnessContrast: 0.2 },
  }),
  preset('concrete', 'Concrete', 'ceramic', ['concrete', 'cement', 'wall', 'brutalist', 'sidewalk'], {
    base: { generator: 'fbm', scale: 5, detail: 5, contrast: -0.35 },
    detailB: { enabled: true, generator: 'speckle', blend: 'min', amount: 0.2, scale: 36, cellVariation: 0.5 },
    color: { ...ramp('#4d4b48', '#67655f', '#7d7b74', '#8f8d85', '#a19f96'), jitterValue: 0.07, cavity: 0.25 },
    accentB: {
      enabled: true, generator: 'fbm', scale: 4, stretchY: 3, coverage: 0.25, softness: 0.3, creviceBias: 0.3,
      color: '#3a3833', colorB: '#54524b', blend: 'multiply', roughnessShift: 0.15, heightShift: 0,
    },
    surface: { heightScale: 0.2, roughness: 0.9, roughnessContrast: 0.2 },
  }),
  preset('stucco', 'Stucco plaster', 'ceramic', ['stucco', 'plaster', 'wall', 'adobe', 'mediterranean'], {
    base: { generator: 'turbulence', scale: 9, detail: 4, contrast: -0.2 },
    color: { ...ramp('#9c8d76', '#b5a78d', '#cbbfa2', '#dcd1b4', '#eae1c6'), jitterValue: 0.05, cavity: 0.3 },
    surface: { heightScale: 0.3, roughness: 0.95, roughnessContrast: 0.2 },
  }),
  preset('roof-shingles', 'Roof shingles', 'ceramic', ['shingle', 'roof', 'slate roof', 'house'], {
    base: { generator: 'scales', columns: 6, rows: 10, cellVariation: 0.4 },
    detailA: { enabled: true, generator: 'fbm', blend: 'overlay', amount: 0.25, scale: 16 },
    color: { ...ramp('#1c1e24', '#31343d', '#464a55', '#5a5f6b', '#6f7480'), jitterCells: true, jitterValue: 0.12, cavity: 0.55 },
    surface: { heightScale: 0.45, roughness: 0.75, roughnessContrast: 0.3 },
  }),
  preset('circuit-board', 'Circuit board', 'ceramic', ['circuit', 'pcb', 'electronics', 'tech', 'motherboard'], {
    base: { generator: 'grid', columns: 18, rows: 18, gap: 0.1, bevel: 0.03, invert: true, warp: 0.02 },
    detailB: { enabled: true, generator: 'dots', blend: 'max', amount: 0.5, columns: 9, rows: 9, gap: 0.34, bevel: 0.05, cellJitter: 0.6 },
    color: { ...ramp('#0d2818', '#124024', '#1a5a30', '#7a9c48', '#d8c25a'), pos3: 0.82, rampSmooth: 0.5, cavity: 0.2 },
    surface: { heightScale: 0.15, roughness: 0.4, roughnessContrast: -0.3, metalness: 0.35 },
    emissive: { enabled: true, source: 'peaks', threshold: 0.8, width: 0.15, softness: 0.1, color: '#57ff9a', intensity: 1.6 },
  }),

  // ------------------------------------------------------------- organic
  preset('dragon-scales', 'Dragon scales', 'organic', ['dragon', 'scale', 'reptile', 'creature', 'fantasy'], {
    base: { generator: 'scales', columns: 7, rows: 11, cellVariation: 0.3 },
    detailA: { enabled: true, generator: 'fbm', blend: 'overlay', amount: 0.2, scale: 20 },
    color: { ...ramp('#0d1f1a', '#14382c', '#1d5540', '#2e7250', '#4a9464'), jitterCells: true, jitterHue: 0.05, jitterValue: 0.1, cavity: 0.6, sheen: 0.4, sheenTint: '#bfe8c9' },
    surface: { heightScale: 0.55, roughness: 0.45, roughnessContrast: 0.35 },
  }),
  preset('reptile-skin', 'Reptile skin', 'organic', ['lizard', 'snake', 'skin', 'crocodile'], {
    base: { generator: 'hex', columns: 13, gap: 0.14, bevel: 0.2, cellVariation: 0.35 },
    color: { ...ramp('#2c2a12', '#45421c', '#5d5a26', '#767230', '#8f8a3c'), jitterCells: true, jitterValue: 0.12, cavity: 0.55, sheen: 0.25 },
    surface: { heightScale: 0.4, roughness: 0.6, roughnessContrast: 0.3 },
  }),
  preset('coral', 'Coral', 'organic', ['coral', 'reef', 'sea', 'underwater'], {
    base: { generator: 'worleyF2', scale: 9, cellJitter: 1, warp: 0.35 },
    detailB: { enabled: true, generator: 'speckle', blend: 'add', amount: 0.2, scale: 36, cellVariation: 0.5 },
    color: { ...ramp('#6e2038', '#a03050', '#c94a62', '#e2707a', '#f29a94'), jitterHue: 0.05, cavity: 0.5, sheen: 0.2 },
    surface: { heightScale: 0.5, roughness: 0.8, roughnessContrast: 0.3 },
  }),
  preset('bone', 'Bone', 'organic', ['bone', 'ivory', 'skull', 'fossil'], {
    base: { generator: 'fbm', scale: 5, detail: 4, stretchX: 2.2, contrast: -0.3 },
    detailB: { enabled: true, generator: 'speckle', blend: 'min', amount: 0.25, scale: 30, cellVariation: 0.45, edgeWidth: 0.12 },
    color: { ...ramp('#786a52', '#9c8d70', '#bcae8d', '#d4c7a4', '#e7dcba'), jitterValue: 0.06, cavity: 0.35, sheen: 0.2 },
    surface: { heightScale: 0.25, roughness: 0.6, roughnessContrast: 0.25 },
  }),
  preset('alien-flesh', 'Alien flesh', 'organic', ['alien', 'flesh', 'organ', 'monster', 'biomass'], {
    base: { generator: 'billow', scale: 6, detail: 5, warp: 0.5 },
    detailA: { enabled: true, generator: 'worleyF2', blend: 'overlay', amount: 0.35, scale: 10, warp: 0.3 },
    color: { ...ramp('#2a0d22', '#4a1638', '#6d224c', '#8f325c', '#b04a68'), jitterHue: 0.06, cavity: 0.5, sheen: 0.5, sheenTint: '#ffc9d8' },
    surface: { heightScale: 0.5, roughness: 0.3, roughnessContrast: 0.4 },
    emissive: { enabled: true, source: 'crevices', threshold: 0.3, width: 0.25, softness: 0.2, color: '#c135b0', intensity: 1.2 },
  }),
  preset('animal-fur', 'Animal fur', 'organic', ['fur', 'fluffy', 'pelt', 'hair'], {
    base: { generator: 'fbm', scale: 18, detail: 5, detailGain: 0.6, stretchY: 7 },
    color: { ...ramp('#2e1d10', '#4c3018', '#684322', '#82562c', '#9a6b38'), jitterValue: 0.12, jitterHue: 0.03, cavity: 0.45, sheen: 0.25 },
    surface: { heightScale: 0.3, roughness: 0.95, roughnessContrast: 0.15 },
  }),
  preset('leopard-spots', 'Leopard spots', 'organic', ['leopard', 'cheetah', 'animal print', 'spots', 'safari'], {
    base: { generator: 'dots', columns: 8, rows: 8, gap: 0.2, bevel: 0.12, cellJitter: 1, cellVariation: 0.4, warp: 0.25, invert: true },
    detailA: { enabled: true, generator: 'fbm', blend: 'overlay', amount: 0.15, scale: 24 },
    color: { ...ramp('#241505', '#4d3010', '#a76f28', '#cf9a44', '#e4bc66'), pos1: 0.3, pos2: 0.48, rampSmooth: 0.35, jitterValue: 0.06 },
    surface: { heightScale: 0.12, roughness: 0.9, roughnessContrast: 0.1 },
  }),
  preset('zebra-stripes', 'Zebra stripes', 'organic', ['zebra', 'stripes', 'animal print', 'black and white'], {
    base: { generator: 'stripes', columns: 7, warp: 0.45, warpScale: 5, stretchY: 1.4 },
    color: { ...ramp('#131114', '#1d1a1d', '#8e8a86', '#dedad2', '#f7f4ec'), pos1: 0.42, pos2: 0.5, pos3: 0.58, rampSmooth: 0.25 },
    surface: { heightScale: 0.08, roughness: 0.85, roughnessContrast: 0 },
  }),

  // ------------------------------------------------------------- liquid
  preset('water-caustics', 'Water caustics', 'liquid', ['water', 'caustics', 'pool', 'ocean floor', 'sea'], {
    base: { generator: 'caustics', scale: 6, edgeWidth: 0.2, warp: 0.25 },
    detailA: { enabled: true, generator: 'fbm', blend: 'overlay', amount: 0.25, scale: 8, warp: 0.3 },
    color: { ...ramp('#0a2e4a', '#10496b', '#1a6d8e', '#3fa3b8', '#bfeef2'), pos3: 0.82, cavity: 0.15, sheen: 0.3 },
    surface: { heightScale: 0.25, roughness: 0.12, roughnessContrast: 0.2 },
  }),
  preset('lava-flow', 'Lava flow', 'liquid', ['lava', 'magma', 'molten', 'volcano', 'fire'], {
    base: { generator: 'cracks', scale: 5, edgeWidth: 0.14, cellJitter: 1, cellVariation: 0.3, warp: 0.4 },
    detailA: { enabled: true, generator: 'turbulence', blend: 'overlay', amount: 0.3, scale: 12 },
    color: { ...ramp('#1a0f0c', '#241a16', '#33261e', '#453528', '#584434'), cavity: 0.3, sheen: 0.1 },
    surface: { heightScale: 0.6, roughness: 0.9, roughnessContrast: 0.35 },
    emissive: { enabled: true, source: 'crevices', threshold: 0.34, width: 0.3, softness: 0.15, color: '#ff5a00', intensity: 4 },
  }),
  preset('cooled-magma', 'Cooling magma', 'liquid', ['magma', 'ember', 'cooling', 'obsidian', 'scorched'], {
    base: { generator: 'cracks', scale: 7, edgeWidth: 0.08, cellJitter: 1, warp: 0.3 },
    color: { ...ramp('#0b0a0c', '#161417', '#232025', '#302c31', '#403a3e'), cavity: 0.45, sheen: 0.2 },
    surface: { heightScale: 0.5, roughness: 0.75, roughnessContrast: 0.3 },
    emissive: { enabled: true, source: 'crevices', threshold: 0.22, width: 0.18, softness: 0.12, color: '#c9351a', intensity: 2 },
  }),
  preset('cracked-ice', 'Cracked ice', 'liquid', ['ice', 'frozen', 'glacier', 'frost', 'winter'], {
    base: { generator: 'cracks', scale: 5, edgeWidth: 0.05, cellJitter: 1, warp: 0.2, invert: true },
    detailA: { enabled: true, generator: 'fbm', blend: 'overlay', amount: 0.2, scale: 10 },
    color: { ...ramp('#eef8ff', '#c3e2f2', '#9cc8e4', '#7cb2d6', '#5e9bc4'), pos1: 0.14, cavity: 0.15, sheen: 0.5, sheenTint: '#ffffff' },
    surface: { heightScale: 0.2, roughness: 0.08, roughnessContrast: 0.3, aoStrength: 0.25 },
  }),
  preset('toxic-slime', 'Toxic slime', 'liquid', ['slime', 'toxic', 'goo', 'ooze', 'poison'], {
    base: { generator: 'billow', scale: 6, detail: 5, warp: 0.5 },
    color: { ...ramp('#0d2a10', '#17471a', '#256b22', '#3f9430', '#6fc04a'), cavity: 0.35, sheen: 0.55, sheenTint: '#d8ffc9' },
    surface: { heightScale: 0.45, roughness: 0.12, roughnessContrast: 0.4 },
    emissive: { enabled: true, source: 'peaks', threshold: 0.72, width: 0.3, softness: 0.25, color: '#4dff2e', intensity: 1.4 },
  }),

  // ------------------------------------------------------------- scifi
  preset('energy-plasma', 'Energy plasma', 'scifi', ['energy', 'plasma', 'magic', 'portal', 'arcane'], {
    base: { generator: 'caustics', scale: 5, edgeWidth: 0.25, warp: 0.6, warpScale: 4 },
    detailA: { enabled: true, generator: 'turbulence', blend: 'screen', amount: 0.35, scale: 9, warp: 0.4 },
    color: { ...ramp('#160a33', '#2c1461', '#4c1d94', '#8438c9', '#e26bf5'), cavity: 0, sheen: 0.3, sheenTint: '#9fd9ff' },
    surface: { heightScale: 0.25, roughness: 0.3, roughnessContrast: 0 },
    emissive: { enabled: true, source: 'peaks', threshold: 0.55, width: 0.4, softness: 0.3, color: '#b44dff', intensity: 3 },
  }),
  preset('hex-shield', 'Hex force shield', 'scifi', ['shield', 'hexagon', 'force field', 'hologram', 'barrier'], {
    base: { generator: 'hex', columns: 10, gap: 0.1, bevel: 0.08, cellVariation: 0.3 },
    color: { ...ramp('#04121f', '#082338', '#0d3653', '#144a6e', '#1d6089'), jitterCells: true, jitterValue: 0.15, cavity: 0.2 },
    surface: { heightScale: 0.15, roughness: 0.25, roughnessContrast: 0, metalness: 0.3 },
    emissive: { enabled: true, source: 'crevices', threshold: 0.3, width: 0.2, softness: 0.12, color: '#2fd6ff', intensity: 4.5 },
  }),
  preset('alien-circuit', 'Alien circuitry', 'scifi', ['alien tech', 'runes', 'glyph', 'ancient machine'], {
    base: { generator: 'grid', columns: 12, rows: 12, gap: 0.16, bevel: 0.04, invert: true, warp: 0.12, warpScale: 6 },
    detailB: { enabled: true, generator: 'cracks', blend: 'max', amount: 0.4, scale: 7, edgeWidth: 0.07, invert: true },
    color: { ...ramp('#0c1214', '#172226', '#233338', '#31454a', '#41585c'), cavity: 0.3, sheen: 0.2 },
    surface: { heightScale: 0.3, roughness: 0.5, roughnessContrast: 0.3, metalness: 0.6 },
    emissive: { enabled: true, source: 'peaks', threshold: 0.78, width: 0.2, softness: 0.12, color: '#38ffd0', intensity: 3 },
  }),
  preset('starfield-nebula', 'Nebula', 'scifi', ['nebula', 'space', 'galaxy', 'cosmos', 'stars'], {
    base: { generator: 'fbm', scale: 4, detail: 6, warp: 0.55, warpScale: 3 },
    detailB: { enabled: true, generator: 'speckle', blend: 'max', amount: 0.6, scale: 52, cellVariation: 0.3, edgeWidth: 0.07 },
    color: { ...ramp('#050514', '#141033', '#2c1a5e', '#63308f', '#e8dcf5'), pos3: 0.86, cavity: 0, sheen: 0 },
    surface: { heightScale: 0.1, roughness: 1, roughnessContrast: 0, aoStrength: 0 },
    emissive: { enabled: true, source: 'peaks', threshold: 0.82, width: 0.2, softness: 0.2, color: '#cfa4ff', intensity: 2 },
  }),

  // ------------------------------------------------------------- stylized
  preset('toon-clouds', 'Toon clouds', 'stylized', ['cloud', 'sky', 'cartoon', 'anime', 'puffy'], {
    base: { generator: 'billow', scale: 4, detail: 4, warp: 0.2 },
    color: { ...ramp('#7ba6d8', '#9fc0e6', '#c4daf0', '#e4eef8', '#ffffff'), rampSmooth: 0.22, cavity: 0.1, cavityTint: '#6f96c9' },
    surface: { heightScale: 0.3, normalStrength: 0.5, roughness: 1, roughnessContrast: 0, aoStrength: 0.2 },
  }),
  preset('forest-camo', 'Forest camo', 'stylized', ['camo', 'camouflage', 'military', 'army'], {
    base: { generator: 'cells', scale: 4, cellJitter: 1, cellVariation: 0.8, warp: 0.4, warpScale: 3 },
    color: { ...ramp('#2a2a1a', '#3d4a24', '#57652f', '#6f5d33', '#8a8250'), rampSmooth: 0.08, jitterCells: false },
    surface: { heightScale: 0.05, roughness: 1, roughnessContrast: 0, aoStrength: 0.1 },
  }),
  preset('halftone', 'Halftone dots', 'stylized', ['halftone', 'comic', 'pop art', 'print', 'manga'], {
    base: { generator: 'dots', columns: 22, rows: 22, gap: 0.16, bevel: 0.1 },
    color: { ...ramp('#20242c', '#333947', '#8c93a3', '#dfe3ea', '#f7f8fa'), pos1: 0.4, pos2: 0.5, pos3: 0.62, rampSmooth: 0.3 },
    surface: { heightScale: 0.05, roughness: 0.9, roughnessContrast: 0, aoStrength: 0.1 },
  }),
  preset('retro-checker', 'Retro checker', 'stylized', ['checker', 'diner', 'retro', 'race flag'], {
    base: { generator: 'checker', columns: 8, rows: 8 },
    detailA: { enabled: true, generator: 'fbm', blend: 'overlay', amount: 0.12, scale: 20 },
    color: { ...ramp('#1d2126', '#2c3138', '#9aa4ab', '#e8e3d5', '#f6f1e3'), pos1: 0.42, pos2: 0.5, pos3: 0.58, rampSmooth: 0.2, cavity: 0.15 },
    surface: { heightScale: 0.08, roughness: 0.35, roughnessContrast: 0.2 },
  }),
  preset('candy-stripes', 'Candy stripes', 'stylized', ['candy', 'stripes', 'circus', 'sweet', 'pink'], {
    base: { generator: 'stripes', columns: 10, warp: 0.05 },
    color: { ...ramp('#c2385a', '#dc5b78', '#f2f0e8', '#f7dce2', '#fcf3f0'), pos1: 0.44, pos2: 0.5, pos3: 0.56, rampSmooth: 0.25, sheen: 0.25 },
    surface: { heightScale: 0.06, roughness: 0.3, roughnessContrast: 0 },
  }),
]);

export function findTexturePreset(id) {
  return BUILT_IN_TEXTURE_PRESETS.find((entry) => entry.id === id) ?? null;
}
