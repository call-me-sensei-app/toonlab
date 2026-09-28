// §9 ToonLab Texture Lab material set for the Pro launch-video world.
//
// Scene: **Stillwater Garden** (`launch-plan/20-stillwater-garden-scene-brief.md`),
// which supersedes doc 18 §10.1 Nova Promenade and §10.2 Azure Headland. §9's
// material discipline is unchanged; only the surfaces are.
//
// Every entry is a portable `toonlab.textureRecipe` document (ToonLab Texture
// Lab, `src/texgen`) plus the two things the recipe itself cannot carry:
//
//   1. `tile` — the intended WORLD-SPACE tile size in metres. Texel density is
//      set by tiling scale, not by map resolution alone:
//          px/cm = sourceResolution / (tile_m * 100)
//      §8 requires 10.24 px/cm on hero close-shot surfaces and 5.12 px/cm on
//      supporting assets. Shipping a map without its intended tile size is
//      shipping an unverifiable claim, so the number lives with the recipe.
//   2. `roles` — the semantic ToonLab material classification
//      (`src/environment/manufacturedMaterialContract.js`) applied to every
//      surface BEFORE the Manufactured Surface shader runs (§8).
//
// TILE SIZES ARE SMALLER THAN THE CANCELLED CITY SET, DELIBERATELY.
// The garden's hero camera space is ~24 x 18 m and there is no distant band at
// all: gravel, moss, paving and timber are all read from 1.4-3.5 m. A city
// façade could afford a 2-3 m tile because nobody stood 1.4 m from it. Nothing
// here is above 1.6 m, most sit at 1.0-1.2 m, and the whole set clears the hero
// bar by 2.5x or better. That headroom is the point: at a close camera the bar
// is a floor, not a target.
//
// Authoring constraints honoured here:
//   · §3 — ToonLab Texture Lab is the only source. No generated images.
//   · §8 — no baked directional lighting, cast shadows, matcaps or fake
//     reflections in albedo. `color.cavity` is held at 0 on every recipe
//     because it paints occlusion into base colour; occlusion is the AO/ORM
//     channel's job. `color.sheen` is used only where it stands for real
//     pigment loss on worn edges, never as a lighting cue.
//   · §13 — anime value structure: narrow albedo value ranges (graphic value
//     grouping), partial ramp banding, hue drift instead of value noise, and
//     per-cell tint variance as the anti-repetition device.
//   · §13 — no visible repetition: modules are sized to real construction, and
//     recipes avoid single high-contrast landmarks that survive 4x4 tiling.

/** Ramp helper — five stops, darkest crevice to highest ridge. */
const ramp = (color0, color1, color2, color3, color4) =>
  ({ color0, color1, color2, color3, color4 });

/**
 * Joint anisotropy for grid generators so a non-square module carries an even
 * world-space mortar line: sy = (tileU * rows) / (columns * tileV).
 * Square world tile => rows / columns.
 */
export const jointStretchY = (columns, rows) => rows / columns;

/**
 * Pulls a five-stop ramp toward its own mid stop.
 *
 * Anime value structure is graphic value GROUPING: a rendered wall is one value
 * with tooth inside it, not a continuous gradient. The benchmark frames hold
 * roughly an eight-point sRGB spread across a whole plaster or concrete mass; a
 * 26-point spread reads as stucco cloud however fine the detail on top of it is.
 */
const narrow = (stops, k) => {
  const mid = stops[2];
  return stops.map((stop) => stop.map((c, i) => mid[i] + (c - mid[i]) * k));
};

/**
 * The one moss palette in the world.
 *
 * MAT-GDN-02 is the moss BED. The rocks owner paints moss ON STONE and the
 * paving material paints moss INTO JOINTS. Three surfaces, three shaders, one
 * plant — so the stops live here, exported, and every consumer reads them
 * rather than eyeballing a green. Anything else and the moss changes species at
 * the edge of a stone.
 */
export const GARDEN_MOSS_STOPS = Object.freeze([
  [0.055, 0.098, 0.055],
  [0.118, 0.212, 0.096],
  [0.196, 0.322, 0.132],
  [0.302, 0.436, 0.176],
  [0.436, 0.556, 0.238],
]);

/** Mid and high moss stops, for consumers tinting a thin moss layer. */
export const GARDEN_MOSS_MID = GARDEN_MOSS_STOPS[2];
export const GARDEN_MOSS_HIGH = GARDEN_MOSS_STOPS[3];

/**
 * MAT-GDN-01 raked gravel — shared structure across rake states.
 *
 * Karesansui gravel is 5-15 mm crushed pale granite raked into furrows about
 * 5 cm apart. The furrows run along V in the tile, so a scene rakes in any
 * direction by rotating the material's UV frame; the tile is square and
 * periodic, so a rotated frame still tiles exactly. Concentric rings around a
 * set stone are a scene concern (radial UV or a decal ring), not a tile — no
 * square periodic tile can carry a centre.
 */
const GRAVEL_STRUCTURE = Object.freeze({
  // The GRAVEL is the base and the furrow only modulates it. The first pass
  // had it the other way round — a stripe base with grains layered over — and
  // the result read as knitted corduroy: a regular rib with a bead chain
  // running along each one. Raked gravel is loose stone everywhere with a
  // gentle rake pressed into it, and the layer order has to say so.
  base: {
    // 110 cells over a 1 m tile = 9 mm grains. Unreachable before the `scale`
    // cap moved from 64 to 256 (D19-053): the finest grain a 1 m tile could
    // describe was 1.6 cm, which is coarse aquarium gravel, not karesansui.
    generator: 'worley', scale: 110, cellJitter: 1, cellVariation: 0.60,
    contrast: 0.05,
  },
  detailB: {
    enabled: true, generator: 'speckle', blend: 'screen', amount: 0.14,
    scale: 200, edgeWidth: 0.04, cellVariation: 0.55,
  },
  wear: { damage: 0, dirt: 0.02 },
  accentA: { enabled: false },
  accentB: { enabled: false },
  surface: {
    // The rake is the signature read of a karesansui and it has to survive at
    // 3 m, where 9 mm grains have already collapsed into tone. Relief is
    // therefore pushed hard: the furrow modulates height at 0.62 and the whole
    // field is displaced at 0.46, so the trough shadow does the work the grain
    // cannot at that distance.
    heightScale: 0.46, normalStrength: 1.20, aoStrength: 0.62,
    roughness: 0.88, roughnessContrast: 0.24, metalness: 0,
  },
  emissive: { enabled: false },
});

const GRAVEL_COLOR = Object.freeze({
  ...ramp(
    [0.560, 0.548, 0.530],
    [0.690, 0.680, 0.660],
    [0.780, 0.772, 0.752],
    [0.848, 0.842, 0.824],
    [0.902, 0.898, 0.882],
  ),
  pos1: 0.24, pos2: 0.54, pos3: 0.80, rampSmooth: 0.70,
  // Per-GRAIN tint: the worley base carries a cell id, so every 9 mm stone
  // gets its own hue and value. Pale granite gravel is never one colour, and
  // this is the whole reason it does not read as a surface of paint.
  jitterHue: 0.030, jitterValue: 0.100, jitterScale: 9,
  jitterCells: true, jitterCellVariety: 0.60,
  cavity: 0, cavityTint: [0.46, 0.45, 0.44],
  sheen: 0, sheenTint: [1, 1, 0.98],
  saturation: 0.45, brightness: 0.94, contrast: 0.04, gamma: 1.0,
});

const GRAVEL_RAKES = Object.freeze([
  {
    suffix: 'straight',
    label: 'straight rake',
    seed: 20101,
    use: 'Open gravel sea — the long parallel runs between islands',
    furrow: {
      enabled: true, generator: 'stripes', blend: 'multiply', amount: 0.62,
      columns: 20, rows: 8, cellVariation: 0.42, contrast: -0.10,
    },
  },
  {
    suffix: 'curved',
    label: 'curved rake',
    seed: 20102,
    use: 'Gravel worked around a set stone or an island margin',
    furrow: {
      enabled: true, generator: 'stripes', blend: 'multiply', amount: 0.62,
      columns: 20, rows: 8, cellVariation: 0.42, contrast: -0.10,
      warp: 0.34, warpScale: 3,
    },
  },
]);

/**
 * MAT-CITY-01 survives the scene change as dressed stone plinth and footing
 * render — teahouse footings, wall base, gate post bases (brief §4: "may still
 * serve stone footings"). Retiled from 2.0 m to 1.2 m for the close camera.
 * The four city façade tints collapse to two: pale dressed stone and the dark
 * graphite plinth under the boundary wall.
 */
const CITY_CONCRETE_STRUCTURE = Object.freeze({
  base: {
    // Fine dressed stone, not stucco. 30 cells over a 1.2 m tile puts the base
    // frequency at 4 cm, and the contrast is pulled hard negative so it is
    // tooth, not weather.
    generator: 'fbm', scale: 30, detail: 4, detailGain: 0.42,
    contrast: -0.42, warp: 0.10, warpScale: 6,
  },
  detailA: {
    enabled: true, generator: 'fbm', blend: 'overlay', amount: 0.30,
    scale: 84, detail: 3, detailGain: 0.44,
  },
  detailB: {
    // 140 cells over a 1.2 m tile = 8.6 mm pinholes and form-face pitting.
    enabled: true, generator: 'speckle', blend: 'multiply', amount: 0.10,
    scale: 140, edgeWidth: 0.045, cellVariation: 0.5, warp: 0.45, warpScale: 14,
    contrast: 0.12,
  },
  wear: { damage: 0.04, dirt: 0.05 },
  accentB: { enabled: false },
  surface: {
    heightScale: 0.12, normalStrength: 0.8, aoStrength: 0.32,
    roughness: 0.82, roughnessContrast: 0.22, metalness: 0,
  },
  emissive: { enabled: false },
});

const CITY_CONCRETE_VARIANTS = Object.freeze([
  {
    suffix: null,
    tint: 'pale dressed stone',
    seed: 18101,
    material: 'Pale dressed stone plinth render',
    use: 'Teahouse footings, terrace plinth, tsukubai surround',
    stops: [
      [0.600, 0.601, 0.612], [0.679, 0.679, 0.687], [0.752, 0.750, 0.744],
      [0.812, 0.809, 0.800], [0.862, 0.858, 0.846],
    ],
    saturation: 0.55,
    wash: { color: [0.726, 0.736, 0.754], colorB: [0.788, 0.794, 0.802] },
  },
  {
    suffix: 'graphite',
    tint: 'graphite plinth',
    seed: 18104,
    material: 'Graphite stone plinth render',
    use: 'Boundary-wall base course, gate post bases, lantern plinths',
    stops: [
      [0.148, 0.155, 0.168], [0.204, 0.212, 0.228], [0.256, 0.265, 0.282],
      [0.310, 0.320, 0.338], [0.372, 0.382, 0.400],
    ],
    saturation: 0.66,
    wash: { color: [0.238, 0.248, 0.266], colorB: [0.286, 0.296, 0.314] },
  },
]);

const cityConcrete = (variant) => ({
  id: variant.suffix ? `MAT-CITY-01-${variant.suffix}` : 'MAT-CITY-01',
  setId: 'MAT-CITY-01',
  state: variant.suffix ?? 'pale',
  name: `Stillwater dressed stone — ${variant.tint}`,
  material: variant.material,
  resolution: 4096,
  tile: 1.2,
  heroUse: true,
  use: variant.use,
  shots: ['G01', 'G03', 'G05'],
  notes:
    'Carried over from the cancelled city set and retiled 2.0 m -> 1.2 m for '
    + 'the garden camera. No macro landmark inside the tile: a 1.2 m module of '
    + 'fine dressed stone has nothing that can be recognised when repeated, and '
    + 'course joints are geometry, not texture.',
  roles: {
    baseMaterial: 'mineral',
    finish: 'raw',
    renderMode: 'opaque',
    structuralRole: 'primaryMass',
    objectClass: 'buildingExterior',
  },
  alternateRoles: [
    { note: 'engawa soffit and eave underside', structuralRole: 'cavity' },
    { note: 'copings, sills and step nosings', structuralRole: 'trim' },
  ],
  settings: {
    ...CITY_CONCRETE_STRUCTURE,
    global: { seed: variant.seed },
    color: {
      ...ramp(...narrow(variant.stops, 0.55)),
      pos1: 0.30, pos2: 0.52, pos3: 0.74, rampSmooth: 0.72,
      jitterHue: 0.012, jitterValue: 0.030, jitterScale: 7,
      jitterCells: false, jitterCellVariety: 0,
      cavity: 0, cavityTint: [0.42, 0.43, 0.46],
      sheen: 0, sheenTint: [1, 0.99, 0.96],
      saturation: variant.saturation, brightness: 1.0, contrast: -0.10, gamma: 1.0,
    },
    accentA: {
      // Pour/dressing tonal drift, not a lighting cue: a wide, low-coverage
      // wash biased slightly into the crevices that shifts roughness only.
      enabled: true, generator: 'fbm', scale: 5, warp: 0.4, warpScale: 6,
      coverage: 0.07, softness: 0.28, creviceBias: 0.25, blend: 'normal',
      color: variant.wash.color, colorB: variant.wash.colorB,
      roughnessShift: 0.10, heightShift: 0.0, metalShift: 0,
    },
  },
});

/**
 * MAT-GDN-06 render types. White lime shikkui closes the garden on the
 * boundary wall; warm ochre earthen tsuchikabe is the teahouse infill the
 * manufactured-assets owner needs between exposed posts.
 */
const PLASTER_TYPES = Object.freeze([
  {
    suffix: null,
    label: 'lime plaster',
    material: 'Traditional white lime shikkui render',
    use: 'ARCH-GDN-02 boundary wall render, wall coping underside',
    seed: 20601,
    grit: 0.09,
    straw: false,
    jitterHue: 0.014,
    saturation: 0.62,
    stops: [
      [0.700, 0.672, 0.608], [0.772, 0.746, 0.684], [0.828, 0.804, 0.744],
      [0.870, 0.848, 0.792], [0.906, 0.886, 0.834],
    ],
    wash: { color: [0.792, 0.744, 0.640], colorB: [0.828, 0.788, 0.700] },
  },
  {
    suffix: 'ochre',
    label: 'ochre earthen plaster',
    material: 'Warm ochre earthen tsuchikabe render',
    use: 'ARCH-GDN-01 teahouse wall infill between exposed posts',
    seed: 20602,
    grit: 0.14,
    straw: true,
    jitterHue: 0.020,
    saturation: 0.88,
    stops: [
      [0.548, 0.452, 0.318], [0.636, 0.538, 0.386], [0.706, 0.606, 0.442],
      [0.762, 0.664, 0.494], [0.812, 0.718, 0.548],
    ],
    wash: { color: [0.672, 0.570, 0.412], colorB: [0.732, 0.634, 0.472] },
  },
]);

export const MATERIAL_SET = Object.freeze([
  // ---------------------------------------------- MAT-GDN-01 (two rake states)
  ...GRAVEL_RAKES.map((rake) => ({
    id: `MAT-GDN-01-${rake.suffix}`,
    setId: 'MAT-GDN-01',
    state: rake.suffix,
    name: `Stillwater raked gravel — ${rake.label}`,
    material: `Fine pale granite gravel (${rake.label})`,
    resolution: 4096,
    tile: 1.0,
    heroUse: true,
    use: rake.use,
    shots: ['G01', 'G02', 'G06'],
    module: { furrowPitchMillimetres: 50, grainMillimetres: 9 },
    notes:
      'Furrows run along V at a 50 mm pitch, so the scene rakes in ANY '
      + 'direction by rotating the material UV frame — the tile is square and '
      + 'periodic, so a rotated frame still tiles exactly. Two rake states '
      + 'ship: straight for the open gravel sea, curved (warp 0.34) for gravel '
      + 'worked around a set stone. Concentric rings around a stone are a scene '
      + 'concern, not a tile: no square periodic tile can carry a centre. '
      + 'Grain is 9 mm at scale 110, which the old scale cap of 64 could not '
      + 'reach on a 1 m tile.',
    roles: {
      baseMaterial: 'mineral',
      finish: 'raw',
      renderMode: 'opaque',
      structuralRole: 'primaryMass',
      objectClass: 'infrastructure',
    },
    alternateRoles: [
      { note: 'gravel spill onto the stone path edge', structuralRole: 'trim' },
    ],
    styleDomain: 'manufactured.surface',
    terrainDomainBlocked: 'D19-058',
    groundSplat: { channel: 'B', declaredAs: 'rock', intent: 'raked gravel', fillerRef: 'FILL-005' },
    settings: {
      ...GRAVEL_STRUCTURE,
      global: { seed: rake.seed },
      detailA: rake.furrow,
      color: { ...GRAVEL_COLOR },
    },
  })),

  // ---------------------------------------------------------------- MAT-GDN-02
  {
    id: 'MAT-GDN-02',
    name: 'Stillwater moss bed',
    material: 'Deep green moss bed',
    resolution: 4096,
    tile: 0.8,
    heroUse: true,
    use: 'Moss beds under the maple, pond margin, between stepping stones',
    shots: ['G01', 'G02', 'G04'],
    module: { cushionMillimetres: 36 },
    notes:
      'The hero material of the set and the smallest tile in it: 0.8 m gives '
      + '51.2 px/cm, 5x the hero bar, because moss is read from 1.4 m and its '
      + 'whole quality is in structure a coarser tile would smear. Cushions are '
      + '36 mm (billow at scale 22), sub-clumps 13 mm, shoot tips 3.6 mm. '
      + 'ONE palette is shared with moss on stone and moss in paving joints — '
      + 'GARDEN_MOSS_STOPS is exported for exactly that, because three shaders '
      + 'eyeballing three greens makes the moss change species at a stone edge. '
      + 'Value structure is carried by the height ramp (dark green in the '
      + 'crevices between cushions), which is pigment and depth, not baked '
      + 'occlusion — cavity stays 0 and AO is its own channel per §8.',
    roles: {
      // The contract has no organic/plant base material (D19-078); moss is a
      // matte dielectric and that is the closest honest classification.
      baseMaterial: 'genericDielectric',
      finish: 'matte',
      renderMode: 'opaque',
      structuralRole: 'primaryMass',
      objectClass: 'infrastructure',
    },
    alternateRoles: [
      { note: 'moss creeping onto stone — rocks owner, same palette', structuralRole: 'trim' },
    ],
    styleDomain: 'manufactured.surface',
    terrainDomainBlocked: 'D19-058',
    groundSplat: { channel: 'R', declaredAs: 'grass', intent: 'moss', fillerRef: 'FILL-005' },
    settings: {
      global: { seed: 20201 },
      base: {
        generator: 'billow', scale: 22, detail: 4, detailGain: 0.50,
        warp: 0.25, warpScale: 5, contrast: -0.10,
      },
      detailA: {
        // Sub-clumps. Kept gentle: at higher amounts the worley cell borders
        // resolve as dark filaments crawling over the bed, which reads as dead
        // thread rather than as the shadow between cushions.
        enabled: true, generator: 'worley', blend: 'multiply', amount: 0.20,
        scale: 60, cellJitter: 1, cellVariation: 0.45, contrast: 0.0,
      },
      detailB: {
        // 220 cells over 0.8 m = 3.6 mm shoot tips.
        enabled: true, generator: 'speckle', blend: 'screen', amount: 0.18,
        scale: 220, edgeWidth: 0.04, cellVariation: 0.5,
      },
      color: {
        ...ramp(...GARDEN_MOSS_STOPS),
        pos1: 0.22, pos2: 0.52, pos3: 0.80, rampSmooth: 0.58,
        jitterHue: 0.045, jitterValue: 0.080, jitterScale: 11,
        jitterCells: false, jitterCellVariety: 0,
        cavity: 0, cavityTint: [0.10, 0.16, 0.09],
        sheen: 0, sheenTint: [0.86, 0.94, 0.70],
        saturation: 1.10, brightness: 1.0, contrast: 0.02, gamma: 1.0,
      },
      wear: { damage: 0, dirt: 0 },
      accentA: {
        // Drier moss on the cushion crowns. Pigment, not a highlight: it is a
        // colour and a roughness change, and it is masked by height because
        // crowns genuinely dry first, not because light falls there.
        enabled: true, generator: 'fbm', scale: 4, warp: 0.35, warpScale: 4,
        coverage: 0.14, softness: 0.28, creviceBias: -0.40, blend: 'screen',
        color: [0.300, 0.352, 0.150], colorB: [0.252, 0.310, 0.128],
        roughnessShift: -0.06, heightShift: 0.0, metalShift: 0,
      },
      accentB: {
        // A second species: pale blue-green cushion moss in loose patches.
        enabled: true, generator: 'fbm', scale: 3, warp: 0.45, warpScale: 3,
        coverage: 0.12, softness: 0.30, creviceBias: 0.0, blend: 'multiply',
        color: [0.760, 0.880, 0.760], colorB: [0.700, 0.840, 0.740],
        roughnessShift: 0.05, heightShift: 0.01, metalShift: 0,
      },
      surface: {
        heightScale: 0.42, normalStrength: 1.15, aoStrength: 0.62,
        roughness: 0.94, roughnessContrast: 0.10, metalness: 0,
      },
      emissive: { enabled: false },
    },
  },

  // ---------------------------------------------------------------- MAT-GDN-03
  {
    id: 'MAT-GDN-03',
    name: 'Stillwater granite paving',
    material: 'Irregular granite paving and stepping stones',
    resolution: 4096,
    tile: 1.6,
    heroUse: true,
    use: 'Stone path, stepping stones across the moss, terrace paving',
    shots: ['G01', 'G02', 'G05'],
    module: { stoneMillimetres: 320 },
    notes:
      'Irregular paving is not a grid, so the base is worley rather than tiles: '
      + '32 cm stones with jittered centres and domed, foot-polished faces. '
      + 'Per-stone tint runs through jitterCellVariety 0.6 (D19-057) so the 25 '
      + 'stones in a tile are 25 different stones rather than 25 flat swatches '
      + 'with hue locked to value. Feldspar flecking is accentA; joint moss is '
      + 'accentB and uses GARDEN_MOSS_STOPS, the same palette as MAT-GDN-02 and '
      + 'the rocks owner.',
    roles: {
      baseMaterial: 'mineral',
      finish: 'raw',
      renderMode: 'opaque',
      structuralRole: 'primaryMass',
      objectClass: 'infrastructure',
    },
    alternateRoles: [
      { note: 'stepping stones read as discrete props', objectClass: 'prop' },
      { note: 'path edging and step nosings', structuralRole: 'trim' },
      { note: 'ARCH-GDN-01 teahouse stone footings under the posts', objectClass: 'buildingExterior' },
      { note: 'drainage channel edging along the eave drip line', objectClass: 'infrastructure', structuralRole: 'trim' },
      { note: 'lantern and tsukubai bodies — same granite as the rocks owner', objectClass: 'prop' },
    ],
    styleDomain: 'manufactured.surface',
    terrainDomainBlocked: 'D19-058',
    groundSplat: { channel: 'B', declaredAs: 'rock', intent: 'paving', fillerRef: 'FILL-005' },
    settings: {
      global: { seed: 20301 },
      base: {
        // `cracks` (cellular plates), not `worley`. Worley projects a domed
        // distance falloff, and a tile of it reads as packing foam: no flat
        // face, no joint, no sense of stone size. The crack generator gives a
        // FLAT face with a real groove between plates, which is what irregular
        // paving is, and it gives the joint that accentB's moss pools into.
        // `bias` pulls the plate faces off the top of the ramp. Without it the
        // faces saturate near 1.0, every stone lands in the last ramp segment,
        // and the per-stone tint has almost no colour left to travel through —
        // the variance is present in the data and invisible in the frame.
        generator: 'cracks', scale: 5, cellJitter: 1, cellVariation: 0.55,
        edgeWidth: 0.06, bias: -0.18, warp: 0.10, warpScale: 3,
      },
      detailA: {
        enabled: true, generator: 'fbm', blend: 'multiply', amount: 0.28,
        scale: 40, detail: 5, detailGain: 0.48,
      },
      detailB: {
        // 180 cells over 1.6 m = 9 mm crystal structure.
        enabled: true, generator: 'speckle', blend: 'multiply', amount: 0.22,
        scale: 180, edgeWidth: 0.045, cellVariation: 0.5,
      },
      color: {
        ...ramp(
          [0.238, 0.232, 0.226],
          [0.352, 0.346, 0.336],
          [0.472, 0.464, 0.450],
          [0.596, 0.588, 0.570],
          [0.726, 0.718, 0.700],
        ),
        // The plate generator saturates at 1.0 across a stone face, so the
        // ramp stops are pulled DOWN: at pos3 0.82 every face landed in the
        // top segment and the per-stone tint had almost no ramp left to travel
        // through. At 0.62 the faces spread across color2..color4 and the
        // stones actually differ.
        pos1: 0.10, pos2: 0.32, pos3: 0.68, rampSmooth: 0.72,
        // Per-stone tint is the anti-repetition device here, so it is worth
        // real amplitude: 0.16 of ramp travel is a visibly different stone,
        // and jitterCellVariety keeps hue from tracking value.
        jitterHue: 0.030, jitterValue: 0.220, jitterScale: 6,
        jitterCells: true, jitterCellVariety: 0.60,
        cavity: 0, cavityTint: [0.22, 0.22, 0.21],
        sheen: 0.05, sheenTint: [0.98, 0.98, 1.0],
        saturation: 0.42, brightness: 1.0, contrast: -0.05, gamma: 1.0,
      },
      wear: { damage: 0.06, dirt: 0.09 },
      accentA: {
        enabled: true, generator: 'speckle', scale: 200, edgeWidth: 0.05,
        cellVariation: 0.5, warp: 0, warpScale: 3,
        coverage: 0.32, softness: 0.10, creviceBias: 0, blend: 'screen',
        color: [0.860, 0.860, 0.840], colorB: [0.800, 0.790, 0.760],
        roughnessShift: -0.06, heightShift: 0.0, metalShift: 0,
      },
      accentB: {
        // Joint moss — GARDEN_MOSS_STOPS mid/high, painted (not multiplied) so
        // it is the same green the moss bed is, pooled into the joints.
        enabled: true, generator: 'fbm', scale: 6, warp: 0.45, warpScale: 5,
        coverage: 0.22, softness: 0.26, creviceBias: 0.75, blend: 'normal',
        color: GARDEN_MOSS_MID, colorB: GARDEN_MOSS_HIGH,
        roughnessShift: 0.14, heightShift: 0.01, metalShift: 0,
      },
      surface: {
        heightScale: 0.30, normalStrength: 1.0, aoStrength: 0.55,
        roughness: 0.72, roughnessContrast: 0.34, metalness: 0,
      },
      emissive: { enabled: false },
    },
  },

  // ---------------------------------------------------------------- MAT-GDN-04
  {
    id: 'MAT-GDN-04',
    name: 'Stillwater packed earth path',
    material: 'Fine damp packed garden earth',
    resolution: 4096,
    tile: 1.2,
    heroUse: true,
    use: 'Path between paving stones, planting bed margins, gate approach',
    shots: ['G01', 'G05'],
    notes:
      'Softer than the gravel and quieter than the paving, which is its whole '
      + 'job: it is the surface that lets the other three read. Damp, so its '
      + 'roughness sits at 0.80 rather than the 0.92 dry earth would take, and '
      + 'the ramp is warm brown rather than grey. 170 cells over 1.2 m gives '
      + 'the 7 mm pebbles pressed into a swept path.',
    roles: {
      baseMaterial: 'mineral',
      finish: 'matte',
      renderMode: 'opaque',
      structuralRole: 'primaryMass',
      objectClass: 'infrastructure',
    },
    styleDomain: 'manufactured.surface',
    terrainDomainBlocked: 'D19-058',
    groundSplat: { channel: 'G', declaredAs: 'dirt', intent: 'packed earth', fillerRef: null },
    settings: {
      global: { seed: 20401 },
      base: {
        generator: 'fbm', scale: 26, detail: 5, detailGain: 0.46,
        contrast: -0.35, warp: 0.20, warpScale: 5,
      },
      detailA: {
        enabled: true, generator: 'fbm', blend: 'overlay', amount: 0.28,
        scale: 78, detail: 3, detailGain: 0.44,
      },
      detailB: {
        enabled: true, generator: 'speckle', blend: 'multiply', amount: 0.16,
        scale: 170, edgeWidth: 0.05, cellVariation: 0.5,
      },
      color: {
        ...ramp(
          [0.190, 0.150, 0.112],
          [0.268, 0.216, 0.162],
          [0.332, 0.272, 0.208],
          [0.392, 0.326, 0.252],
          [0.448, 0.378, 0.296],
        ),
        pos1: 0.26, pos2: 0.54, pos3: 0.80, rampSmooth: 0.74,
        jitterHue: 0.018, jitterValue: 0.045, jitterScale: 7,
        jitterCells: false, jitterCellVariety: 0,
        cavity: 0, cavityTint: [0.16, 0.13, 0.10],
        sheen: 0, sheenTint: [1, 0.96, 0.90],
        saturation: 0.80, brightness: 1.0, contrast: -0.04, gamma: 1.0,
      },
      wear: { damage: 0, dirt: 0.04 },
      accentA: { enabled: false },
      accentB: { enabled: false },
      surface: {
        heightScale: 0.16, normalStrength: 0.85, aoStrength: 0.40,
        roughness: 0.80, roughnessContrast: 0.20, metalness: 0,
      },
      emissive: { enabled: false },
    },
  },

  // ---------------------------------------------------------------- MAT-GDN-05
  {
    id: 'MAT-GDN-05',
    name: 'Stillwater aged cedar',
    material: 'Aged cedar / cypress timber',
    resolution: 4096,
    tile: 1.2,
    heroUse: true,
    use: 'ARCH-GDN-01 teahouse frame, engawa decking, gate posts, bridge deck',
    shots: ['G02', 'G03', 'G05'],
    module: { columns: 6, rows: 1, cellMetres: [0.2, 1.2], jointMillimetres: 2 },
    notes:
      '200 mm boards running the full tile height with NO butt joint — right '
      + 'for a post, a beam and a veranda board alike, and only authorable '
      + 'because the stretch clamp moved to 0.125 (D19-053); at the old 4:1 '
      + 'limit a 200 mm module capped at 800 mm and every post grew a false '
      + 'joint. Grain is a 1.5 mm streak running 10 cm (scale 40 x stretchX '
      + '2.5 = 800 streak periods across the tile), with one cathedral cycle '
      + 'per board. Checking runs along the grain via a stretched crack layer. '
      + 'Per-board tint is jitterCellVariety 0.6.',
    roles: {
      baseMaterial: 'wood',
      finish: 'raw',
      renderMode: 'opaque',
      structuralRole: 'primaryMass',
      objectClass: 'buildingExterior',
    },
    alternateRoles: [
      { note: 'engawa boards and bridge deck', objectClass: 'infrastructure' },
      { note: 'rafters, purlins and eave underside', structuralRole: 'cavity' },
      { note: 'kumiko frames, rails and sill trim', structuralRole: 'trim' },
      { note: 'interior post and beam faces', objectClass: 'buildingInterior' },
    ],
    settings: {
      global: { seed: 20501 },
      base: {
        generator: 'bricks', columns: 6, rows: 1, gap: 0.008, bevel: 0.05,
        cellVariation: 0.24, stretchX: 1, stretchY: jointStretchY(6, 1),
      },
      detailA: {
        enabled: true, generator: 'woodGrain', blend: 'multiply', amount: 0.34,
        scale: 40, rings: 6, grain: 0.92, stretchX: 2.5, stretchY: 1.2,
        detail: 3, warp: 0.05, warpScale: 5,
      },
      detailB: {
        // Checking splits run ALONG the board: fine in U, elongated in V.
        enabled: true, generator: 'cracks', blend: 'multiply', amount: 0.08,
        scale: 14, stretchX: 4, stretchY: 0.5, edgeWidth: 0.02, cellJitter: 1,
      },
      color: {
        ...ramp(
          [0.238, 0.176, 0.122],
          [0.386, 0.296, 0.208],
          [0.492, 0.398, 0.294],
          [0.572, 0.482, 0.372],
          [0.640, 0.556, 0.444],
        ),
        pos1: 0.16, pos2: 0.52, pos3: 0.80, rampSmooth: 0.66,
        jitterHue: 0.028, jitterValue: 0.070, jitterScale: 6,
        jitterCells: true, jitterCellVariety: 0.60,
        cavity: 0, cavityTint: [0.18, 0.14, 0.10],
        sheen: 0.04, sheenTint: [1, 0.97, 0.90],
        hueShift: 0,
        saturation: 1.12, brightness: 1.0, contrast: 0.0, gamma: 1.0,
      },
      wear: { damage: 0.08, dirt: 0.03 },
      accentA: { enabled: false },
      accentB: { enabled: false },
      surface: {
        heightScale: 0.22, normalStrength: 0.95, aoStrength: 0.34,
        roughness: 0.74, roughnessContrast: 0.24, metalness: 0,
      },
      emissive: { enabled: false },
    },
  },

  // -------------------------------------------- MAT-GDN-06 (two render types)
  ...PLASTER_TYPES.map((type) => ({
    id: type.suffix ? `MAT-GDN-06-${type.suffix}` : 'MAT-GDN-06',
    setId: 'MAT-GDN-06',
    state: type.suffix ?? 'shikkui',
    name: `Stillwater ${type.label}`,
    material: type.material,
    resolution: 4096,
    tile: 1.5,
    heroUse: true,
    use: type.use,
    shots: ['G03', 'G05', 'G06'],
    notes:
      'Plaster is the flattest surface in the garden and has to stay that way: '
      + 'the base contrast is -0.48 so the low frequency is trowel movement '
      + 'rather than weather, and the ramp is narrowed for graphic value '
      + 'grouping. A cloudy plaster reads as 3D render, and these walls stand '
      + 'in the enclosing band where any noise fights the maple in front of '
      + 'them. Two renders ship: white shikkui for the boundary wall, warm '
      + 'ochre tsuchikabe for ARCH-GDN-01 wall infill — the ochre carries '
      + 'visible chopped straw (accentB), which is what separates an earthen '
      + 'wall from a painted one at 70 mm.',
    roles: {
      baseMaterial: 'mineral',
      finish: 'matte',
      renderMode: 'opaque',
      structuralRole: 'primaryMass',
      objectClass: 'buildingExterior',
    },
    alternateRoles: [
      { note: 'teahouse interior wall lining', objectClass: 'buildingInterior' },
      { note: 'panel infill between exposed posts', structuralRole: 'secondaryStructure' },
    ],
    settings: {
      global: { seed: type.seed },
      base: {
        generator: 'fbm', scale: 24, detail: 4, detailGain: 0.42,
        contrast: -0.48, warp: 0.14, warpScale: 4,
      },
      detailA: {
        enabled: true, generator: 'fbm', blend: 'overlay', amount: 0.26,
        scale: 70, detail: 3, detailGain: 0.44,
      },
      detailB: {
        enabled: true, generator: 'speckle', blend: 'multiply', amount: type.grit,
        scale: 150, edgeWidth: 0.04, cellVariation: 0.45,
      },
      color: {
        ...ramp(...narrow(type.stops, 0.60)),
        pos1: 0.30, pos2: 0.54, pos3: 0.78, rampSmooth: 0.72,
        jitterHue: type.jitterHue, jitterValue: 0.028, jitterScale: 6,
        jitterCells: false, jitterCellVariety: 0,
        cavity: 0, cavityTint: [0.58, 0.56, 0.50],
        sheen: 0, sheenTint: [1, 0.99, 0.95],
        saturation: type.saturation, brightness: 1.0, contrast: -0.10, gamma: 1.0,
      },
      wear: { damage: 0.03, dirt: 0.04 },
      accentA: {
        enabled: true, generator: 'fbm', scale: 4, warp: 0.4, warpScale: 4,
        coverage: 0.10, softness: 0.30, creviceBias: 0.20, blend: 'normal',
        color: type.wash.color, colorB: type.wash.colorB,
        roughnessShift: 0.08, heightShift: 0.0, metalShift: 0,
      },
      accentB: type.straw
        ? {
          // Chopped rice straw in the render. Fine cracked filaments, so a
          // crack mask stretched hard along U reads as scattered fibres.
          enabled: true, generator: 'cracks', scale: 40, stretchX: 2.2, stretchY: 0.8,
          edgeWidth: 0.02, cellJitter: 1, warp: 0.5, warpScale: 8,
          coverage: 0.20, softness: 0.14, creviceBias: 0, blend: 'multiply',
          color: [0.760, 0.700, 0.560], colorB: [0.820, 0.772, 0.640],
          roughnessShift: 0.06, heightShift: 0.005, metalShift: 0,
        }
        : { enabled: false },
      surface: {
        heightScale: type.straw ? 0.14 : 0.10, normalStrength: 0.70,
        aoStrength: 0.28, roughness: 0.88, roughnessContrast: 0.16, metalness: 0,
      },
      emissive: { enabled: false },
    },
  })),

  // ---------------------------------------------------------------- MAT-GDN-07
  {
    id: 'MAT-GDN-07',
    name: 'Stillwater ibushi roof tile',
    material: 'Dark smoked ceramic roof tile',
    resolution: 4096,
    tile: 1.0,
    heroUse: true,
    use: 'ARCH-GDN-01 teahouse roof, ARCH-GDN-02 wall coping and gate roof',
    shots: ['G03', 'G05', 'G06'],
    module: { columns: 4, rows: 3, cellMetres: [0.25, 0.333], jointMillimetres: 3 },
    notes:
      'The strongest repeating form in the set, so repetition control is the '
      + 'whole design. 250 x 333 mm kawara on a 1 m tile is 12 tiles per '
      + 'repeat; the anti-repetition device is per-tile tonal variance at '
      + 'jitterCellVariety 0.65 — ibushi genuinely fires unevenly, so a roof of '
      + 'identically-toned tiles is the thing that looks fake, not the module '
      + 'grid. Measured macro contrast is the number to watch on this material; '
      + 'a consumer laying more than ~6 m of roof should offset alternate '
      + 'courses in UV as well.',
    roles: {
      baseMaterial: 'ceramic',
      finish: 'glazed',
      renderMode: 'opaque',
      structuralRole: 'secondaryStructure',
      objectClass: 'buildingExterior',
    },
    alternateRoles: [
      { note: 'ridge tiles and end caps', structuralRole: 'trim' },
      { note: 'boundary-wall coping', objectClass: 'infrastructure' },
    ],
    settings: {
      global: { seed: 20701 },
      base: {
        // `bias` keeps the tile faces off the top of the ramp. Without it every
        // face saturates in the last ramp segment and the per-tile firing
        // variance — the only thing standing between this and a printed roof —
        // has no colour left to travel through.
        generator: 'bricks', columns: 4, rows: 3, gap: 0.012, bevel: 0.10,
        cellVariation: 0.38, bias: -0.16, stretchX: 1, stretchY: jointStretchY(4, 3),
      },
      detailA: {
        // The barrel roll: one ridge per tile column, aligned to the base grid.
        enabled: true, generator: 'stripes', blend: 'multiply', amount: 0.42,
        columns: 4, rows: 2, cellVariation: 0.06, contrast: -0.20,
      },
      detailB: {
        enabled: true, generator: 'speckle', blend: 'multiply', amount: 0.10,
        scale: 160, edgeWidth: 0.04, cellVariation: 0.45,
      },
      color: {
        ...ramp(
          [0.062, 0.070, 0.082],
          [0.108, 0.120, 0.140],
          [0.152, 0.168, 0.192],
          [0.208, 0.226, 0.252],
          [0.286, 0.306, 0.334],
        ),
        pos1: 0.12, pos2: 0.36, pos3: 0.68, rampSmooth: 0.62,
        jitterHue: 0.028, jitterValue: 0.140, jitterScale: 5,
        jitterCells: true, jitterCellVariety: 0.65,
        cavity: 0, cavityTint: [0.05, 0.06, 0.07],
        sheen: 0, sheenTint: [0.90, 0.94, 1.0],
        saturation: 0.55, brightness: 1.0, contrast: 0.02, gamma: 1.0,
      },
      wear: { damage: 0.04, dirt: 0.05 },
      accentA: { enabled: false },
      accentB: { enabled: false },
      surface: {
        heightScale: 0.55, normalStrength: 1.20, aoStrength: 0.62,
        roughness: 0.34, roughnessContrast: 0.42, metalness: 0,
      },
      emissive: { enabled: false },
    },
  },

  // ------------------------------------------------------ MAT-GDN-07-plain
  {
    id: 'MAT-GDN-07-plain',
    setId: 'MAT-GDN-07',
    state: 'plain',
    name: 'Stillwater ibushi ceramic (plain)',
    material: 'Dark smoked ceramic, no module',
    resolution: 4096,
    tile: 0.5,
    heroUse: true,
    use: 'Ridge tiles, hip tiles, round eave-end caps, gable ornaments, wall coping',
    shots: ['G03', 'G05', 'G06'],
    notes:
      'A ridge tile, a hip tile and a round eave-end cap are different FORMS of '
      + 'the same ceramic, and form is geometry. Rather than bake three modules '
      + 'that would fight the mesh they are wrapped on, this is the field '
      + 'material with the module removed: identical fired surface, identical '
      + 'ramp and roughness as MAT-GDN-07, no tile grid. The 0.5 m tile gives '
      + '81.92 px/cm because a ridge member is 150-250 mm across and reads at '
      + '70 mm on the hero framing — 8x the hero bar, which at this framing is '
      + 'a floor, not a target.',
    roles: {
      baseMaterial: 'ceramic',
      finish: 'glazed',
      renderMode: 'opaque',
      structuralRole: 'trim',
      objectClass: 'buildingExterior',
    },
    alternateRoles: [
      { note: 'boundary-wall coping runs', objectClass: 'infrastructure' },
      { note: 'gable ornament and finial', objectClass: 'prop' },
    ],
    settings: {
      global: { seed: 20702 },
      base: {
        generator: 'fbm', scale: 20, detail: 4, detailGain: 0.44,
        contrast: -0.40, warp: 0.16, warpScale: 5,
      },
      detailA: {
        enabled: true, generator: 'fbm', blend: 'overlay', amount: 0.24,
        scale: 62, detail: 3, detailGain: 0.42,
      },
      detailB: {
        enabled: true, generator: 'speckle', blend: 'multiply', amount: 0.10,
        scale: 160, edgeWidth: 0.04, cellVariation: 0.45,
      },
      color: {
        ...ramp(
          [0.062, 0.070, 0.082],
          [0.108, 0.120, 0.140],
          [0.152, 0.168, 0.192],
          [0.208, 0.226, 0.252],
          [0.286, 0.306, 0.334],
        ),
        pos1: 0.24, pos2: 0.54, pos3: 0.80, rampSmooth: 0.62,
        jitterHue: 0.020, jitterValue: 0.045, jitterScale: 8,
        jitterCells: false, jitterCellVariety: 0,
        cavity: 0, cavityTint: [0.05, 0.06, 0.07],
        sheen: 0, sheenTint: [0.90, 0.94, 1.0],
        saturation: 0.55, brightness: 1.0, contrast: 0.02, gamma: 1.0,
      },
      wear: { damage: 0.04, dirt: 0.05 },
      accentA: { enabled: false },
      accentB: { enabled: false },
      surface: {
        heightScale: 0.12, normalStrength: 0.80, aoStrength: 0.30,
        roughness: 0.34, roughnessContrast: 0.42, metalness: 0,
      },
      emissive: { enabled: false },
    },
  },

  // ---------------------------------------------------------------- MAT-GDN-08
  {
    id: 'MAT-GDN-08',
    name: 'Stillwater bamboo',
    material: 'Aged bamboo culm and fence panel',
    resolution: 4096,
    tile: 1.0,
    heroUse: true,
    use: 'PROP-GDN-02 fence panels and screens, tsukubai spout, deer-scarer',
    shots: ['G02', 'G04', 'G06'],
    module: { culmMillimetres: 50, nodeSpacingMillimetres: 333 },
    notes:
      '50 mm culms running along V with node rings every 333 mm (a rotate90 '
      + 'stripe layer at high contrast). Per-culm tint is not optional: a '
      + 'bamboo screen of identical culms is the single most obviously fake '
      + 'surface in a garden, so jitterCellVariety 0.60 rides on jitterHue '
      + '0.038 — real aged bamboo runs from green-gold to grey-tan culm to culm '
      + 'and the hue must move independently of the value.',
    roles: {
      baseMaterial: 'wood',
      finish: 'raw',
      renderMode: 'opaque',
      structuralRole: 'secondaryStructure',
      objectClass: 'infrastructure',
    },
    alternateRoles: [
      { note: 'tsukubai spout and deer-scarer', objectClass: 'prop' },
      { note: 'screen frames and rope-bound rails', structuralRole: 'trim' },
    ],
    settings: {
      global: { seed: 20801 },
      base: {
        // rows: 1 because a culm is CONTINUOUS. At rows: 4 the stripe
        // generator re-rolls its per-row phase and amplitude four times down
        // the tile, and every culm picked up three horizontal tone steps where
        // no bamboo has a joint.
        generator: 'stripes', columns: 20, rows: 1, cellVariation: 0.30,
        contrast: -0.35, bias: -0.15,
      },
      detailA: {
        // Node rings across the culms.
        enabled: true, generator: 'stripes', blend: 'multiply', amount: 0.34,
        columns: 3, rows: 2, cellVariation: 0.40, contrast: 0.85, rotate90: true,
      },
      detailB: {
        // Fine culm fiber: many periods in U, few in V -> lines along the culm.
        enabled: true, generator: 'fbm', blend: 'multiply', amount: 0.16,
        scale: 60, stretchX: 3, stretchY: 0.5, detail: 3, detailGain: 0.45,
      },
      color: {
        ...ramp(
          [0.318, 0.296, 0.190],
          [0.470, 0.442, 0.276],
          [0.596, 0.566, 0.360],
          [0.686, 0.658, 0.442],
          [0.760, 0.734, 0.522],
        ),
        pos1: 0.12, pos2: 0.40, pos3: 0.72, rampSmooth: 0.68,
        jitterHue: 0.045, jitterValue: 0.140, jitterScale: 5,
        jitterCells: true, jitterCellVariety: 0.60,
        cavity: 0, cavityTint: [0.24, 0.23, 0.16],
        sheen: 0.05, sheenTint: [1, 0.99, 0.86],
        saturation: 0.90, brightness: 1.0, contrast: 0.0, gamma: 1.0,
      },
      wear: { damage: 0.05, dirt: 0.05 },
      accentA: { enabled: false },
      accentB: { enabled: false },
      surface: {
        heightScale: 0.40, normalStrength: 1.10, aoStrength: 0.50,
        roughness: 0.52, roughnessContrast: 0.30, metalness: 0,
      },
      emissive: { enabled: false },
    },
  },

  // ---------------------------------------------------------------- MAT-GDN-09
  {
    id: 'MAT-GDN-09',
    name: 'Stillwater pond bed',
    material: 'Pond bed — silt, pebble and submerged stone',
    resolution: 4096,
    tile: 1.6,
    heroUse: true,
    use: 'Koi pond basin, cascade plunge pool, pond margin below the waterline',
    shots: ['G02', 'G04'],
    notes:
      'This material is only ever seen THROUGH water, which sets its whole '
      + 'grade: low contrast (-0.08), a dark olive-brown value band, and no '
      + 'bright accent anywhere, because the water owner needs the surface '
      + 'reflection and the caustics to be the brightest thing at the '
      + 'waterline. Relief stays honest in the map (13 cm submerged stones, '
      + '3.5 cm pebbles) and the water shader does the refraction softening — '
      + 'this map must not pre-soften what the shallows are supposed to reveal. '
      + 'Algae film caps the stone tops via accentA, which is where it grows.',
    roles: {
      baseMaterial: 'mineral',
      finish: 'raw',
      renderMode: 'opaque',
      structuralRole: 'primaryMass',
      objectClass: 'infrastructure',
    },
    alternateRoles: [
      { note: 'dry pond margin above the waterline', structuralRole: 'trim' },
    ],
    styleDomain: 'manufactured.surface',
    terrainDomainBlocked: 'D19-058',
    groundSplat: { channel: 'G', declaredAs: 'dirt', intent: 'pond silt', fillerRef: 'FILL-005' },
    settings: {
      global: { seed: 20901 },
      base: {
        generator: 'worley', scale: 12, cellJitter: 1, cellVariation: 0.40,
        edgeWidth: 0.10, bias: -0.12, warp: 0.15, warpScale: 4,
      },
      detailA: {
        enabled: true, generator: 'worley', blend: 'overlay', amount: 0.40,
        scale: 46, cellJitter: 1, cellVariation: 0.50, contrast: 0.20,
      },
      detailB: {
        enabled: true, generator: 'fbm', blend: 'multiply', amount: 0.28,
        scale: 30, detail: 5, detailGain: 0.50, warp: 0.25, warpScale: 4,
      },
      color: {
        ...ramp(
          [0.118, 0.124, 0.100],
          [0.196, 0.204, 0.164],
          [0.282, 0.290, 0.234],
          [0.372, 0.376, 0.306],
          [0.462, 0.462, 0.384],
        ),
        pos1: 0.14, pos2: 0.42, pos3: 0.74, rampSmooth: 0.76,
        jitterHue: 0.050, jitterValue: 0.120, jitterScale: 6,
        jitterCells: true, jitterCellVariety: 0.60,
        cavity: 0, cavityTint: [0.08, 0.09, 0.07],
        sheen: 0, sheenTint: [0.90, 0.96, 0.90],
        saturation: 0.72, brightness: 1.0, contrast: -0.08, gamma: 1.0,
      },
      wear: { damage: 0, dirt: 0.06 },
      accentA: {
        enabled: true, generator: 'fbm', scale: 5, warp: 0.4, warpScale: 4,
        coverage: 0.30, softness: 0.30, creviceBias: -0.25, blend: 'screen',
        color: [0.130, 0.196, 0.078], colorB: [0.096, 0.156, 0.062],
        roughnessShift: -0.10, heightShift: 0.0, metalShift: 0,
      },
      accentB: { enabled: false },
      surface: {
        heightScale: 0.30, normalStrength: 0.75, aoStrength: 0.45,
        roughness: 0.62, roughnessContrast: 0.20, metalness: 0,
      },
      emissive: { enabled: false },
    },
  },

  // ---------------------------------------------------------------- MAT-GDN-10
  {
    id: 'MAT-GDN-10',
    name: 'Stillwater shoji paper',
    material: 'Washi shoji paper',
    resolution: 2048,
    tile: 1.0,
    heroUse: true,
    procedural: true,
    use: 'ARCH-GDN-01 shoji screens — the 2 m interior read per §8 is lit through this',
    shots: ['G03', 'G05'],
    notes:
      'Not on the brief\'s nine, added because ARCH-GDN-01 cannot be built '
      + 'without it: §8 requires a genuine 2 m interior read and the teahouse '
      + 'reads through its screens. The kumiko lattice is GEOMETRY, not texture '
      + '— this map carries only washi: long fibre streaks (stretchX 6) and the '
      + 'bark inclusions that catch light when a screen is lit from behind. '
      + 'renderMode is `translucent` and the albedo is deliberately flat and '
      + 'warm-white; the read is the transmission profile, never painted glow.',
    roles: {
      baseMaterial: 'paper',
      finish: 'matte',
      renderMode: 'translucent',
      structuralRole: 'primaryMass',
      objectClass: 'buildingExterior',
    },
    alternateRoles: [
      { note: 'seen from inside the teahouse', objectClass: 'buildingInterior' },
      { note: 'lantern paper panels', objectClass: 'prop', structuralRole: 'lightEmitter' },
    ],
    settings: {
      global: { seed: 21001 },
      base: {
        generator: 'fbm', scale: 3, detail: 2, detailGain: 0.30, contrast: -0.80,
      },
      detailA: {
        enabled: true, generator: 'fbm', blend: 'overlay', amount: 0.14,
        scale: 60, stretchX: 6, stretchY: 0.4, detail: 3, detailGain: 0.40,
      },
      detailB: {
        enabled: true, generator: 'speckle', blend: 'screen', amount: 0.10,
        scale: 120, edgeWidth: 0.05, cellVariation: 0.35,
      },
      color: {
        ...ramp(
          [0.828, 0.812, 0.762],
          [0.868, 0.854, 0.808],
          [0.898, 0.886, 0.844],
          [0.922, 0.912, 0.874],
          [0.944, 0.936, 0.902],
        ),
        pos1: 0.26, pos2: 0.52, pos3: 0.78, rampSmooth: 0.86,
        jitterHue: 0.008, jitterValue: 0.016, jitterScale: 5,
        jitterCells: false, jitterCellVariety: 0,
        cavity: 0, cavityTint: [0.80, 0.79, 0.75],
        sheen: 0, sheenTint: [1, 1, 0.98],
        saturation: 0.50, brightness: 1.0, contrast: -0.06, gamma: 1.0,
      },
      wear: { damage: 0, dirt: 0 },
      accentA: { enabled: false },
      accentB: { enabled: false },
      surface: {
        heightScale: 0.04, normalStrength: 0.35, aoStrength: 0.10,
        roughness: 0.90, roughnessContrast: 0.10, metalness: 0,
      },
      emissive: { enabled: false },
    },
  },

  // ------------------------------------------- MAT-GDN-11 (tatami: mat + heri)
  {
    id: 'MAT-GDN-11-mat',
    setId: 'MAT-GDN-11',
    state: 'mat',
    name: 'Stillwater tatami — igusa field',
    material: 'Woven igusa rush tatami field',
    resolution: 4096,
    tile: 0.45,
    heroUse: true,
    use: 'ARCH-GDN-01 teahouse interior floor, seen through the open shoji',
    shots: ['G03', 'G05'],
    module: { strandMillimetres: 1.76, warpLineSpacingMillimetres: 41 },
    notes:
      'The finest structure in the whole set and a direct consequence of the '
      + '`columns` cap moving from 64 to 256 (D19-053): 256 rush strands over a '
      + '0.45 m tile is a **1.76 mm** strand, which is real igusa. At the old '
      + 'cap the same tile could only describe a 7 mm strand and the floor '
      + 'would have read as corduroy. A tatami mat is 910 x 1820 mm, so this '
      + 'tile lays 2 x 4 to the mat; the sewn warp lines every 41 mm are '
      + 'detailA (a rotated stripe at contrast 0.6) and are what keeps the '
      + 'weave from reading as a gradient. 91.02 px/cm — the highest density in '
      + 'the set, because §8 requires a genuine 2 m interior read and this is '
      + 'the surface that interior is mostly made of.',
    roles: {
      baseMaterial: 'textile',
      finish: 'raw',
      renderMode: 'opaque',
      structuralRole: 'primaryMass',
      objectClass: 'buildingInterior',
    },
    alternateRoles: [
      { note: 'a single mat treated as a placed prop', objectClass: 'prop' },
    ],
    settings: {
      global: { seed: 21101 },
      base: {
        generator: 'stripes', columns: 256, rows: 6, cellVariation: 0.40,
        contrast: -0.25, bias: -0.15,
      },
      detailA: {
        // Sewn warp lines across the strands.
        enabled: true, generator: 'stripes', blend: 'multiply', amount: 0.26,
        columns: 11, rows: 2, cellVariation: 0.20, contrast: 0.90, rotate90: true,
      },
      detailB: {
        // Broad sun-fade banding crossing the strand direction.
        enabled: true, generator: 'fbm', blend: 'multiply', amount: 0.14,
        scale: 30, stretchX: 0.3, stretchY: 4, detail: 3, detailGain: 0.45,
      },
      color: {
        ...ramp(
          [0.462, 0.428, 0.238],
          [0.606, 0.566, 0.322],
          [0.716, 0.676, 0.408],
          [0.796, 0.760, 0.492],
          [0.856, 0.826, 0.576],
        ),
        pos1: 0.12, pos2: 0.38, pos3: 0.70, rampSmooth: 0.70,
        jitterHue: 0.030, jitterValue: 0.140, jitterScale: 7,
        jitterCells: true, jitterCellVariety: 0.60,
        cavity: 0, cavityTint: [0.34, 0.31, 0.18],
        sheen: 0.05, sheenTint: [1, 0.99, 0.86],
        saturation: 0.86, brightness: 1.0, contrast: -0.04, gamma: 1.0,
      },
      wear: { damage: 0, dirt: 0.02 },
      accentA: { enabled: false },
      accentB: { enabled: false },
      surface: {
        heightScale: 0.20, normalStrength: 0.90, aoStrength: 0.42,
        roughness: 0.62, roughnessContrast: 0.30, metalness: 0,
      },
      emissive: { enabled: false },
    },
  },
  {
    id: 'MAT-GDN-11-heri',
    setId: 'MAT-GDN-11',
    state: 'heri',
    name: 'Stillwater tatami — heri border cloth',
    material: 'Indigo heri border cloth',
    resolution: 2048,
    tile: 0.25,
    heroUse: true,
    use: 'ARCH-GDN-01 tatami border strips',
    shots: ['G03', 'G05'],
    module: { threadMillimetres: 1.4, borderWidthMillimetres: 50 },
    notes:
      'A 50 mm cloth strip carrying the only hard graphic line on the interior '
      + 'floor, so it gets its own tile rather than a corner of the mat map: '
      + '0.25 m at 2048 is 81.92 px/cm and a 1.4 mm thread. The weave is the '
      + 'shipped cloth generator at 180 x 180; the muted gold warp is accentA, '
      + 'kept at 0.10 coverage because a loud heri would pull the eye off the '
      + 'garden through the open screen.',
    roles: {
      baseMaterial: 'textile',
      finish: 'raw',
      renderMode: 'opaque',
      structuralRole: 'trim',
      objectClass: 'buildingInterior',
    },
    settings: {
      global: { seed: 21102 },
      base: {
        generator: 'weave', columns: 180, rows: 180, gap: 0.18,
      },
      detailA: {
        enabled: true, generator: 'stripes', blend: 'multiply', amount: 0.24,
        columns: 6, rows: 1, cellVariation: 0.10, contrast: 0.50, rotate90: true,
      },
      detailB: { enabled: false },
      color: {
        ...ramp(
          [0.048, 0.056, 0.082],
          [0.078, 0.090, 0.126],
          [0.108, 0.124, 0.168],
          [0.148, 0.166, 0.214],
          [0.196, 0.216, 0.266],
        ),
        pos1: 0.24, pos2: 0.54, pos3: 0.80, rampSmooth: 0.72,
        jitterHue: 0.010, jitterValue: 0.024, jitterScale: 9,
        jitterCells: false, jitterCellVariety: 0,
        cavity: 0, cavityTint: [0.04, 0.05, 0.07],
        sheen: 0.04, sheenTint: [0.80, 0.84, 0.94],
        saturation: 0.82, brightness: 1.0, contrast: -0.04, gamma: 1.0,
      },
      wear: { damage: 0, dirt: 0.02 },
      accentA: {
        enabled: true, generator: 'stripes', columns: 6, rows: 1,
        cellVariation: 0.1, warp: 0, warpScale: 3,
        coverage: 0.10, softness: 0.10, creviceBias: -0.2, blend: 'screen',
        color: [0.360, 0.300, 0.150], colorB: [0.300, 0.252, 0.128],
        roughnessShift: -0.05, heightShift: 0.0, metalShift: 0,
      },
      accentB: { enabled: false },
      surface: {
        heightScale: 0.10, normalStrength: 0.70, aoStrength: 0.30,
        roughness: 0.66, roughnessContrast: 0.24, metalness: 0,
      },
      emissive: { enabled: false },
    },
  },

  // ------------------------------ MAT-CITY-01 (carried over: stone plinths)
  ...CITY_CONCRETE_VARIANTS.map(cityConcrete),

  // ---------------------------------- MAT-CITY-02 (carried over: metal fittings)
  {
    id: 'MAT-CITY-02',
    name: 'Stillwater charcoal iron fitting',
    material: 'Charcoal powder-coated / blackened metal',
    resolution: 2048,
    tile: 0.6,
    heroUse: true,
    use: 'Gate hardware, lantern fittings, rainchain brackets, screen ironwork',
    shots: ['G03', 'G05'],
    notes:
      'Carried over from the cancelled city set and retiled 1.0 m -> 0.6 m, '
      + 'because garden ironwork is 30-80 mm across and is read from 1.5 m. '
      + 'A dielectric film over metal, so metalness stays 0 — that is what '
      + 'separates it from a bare-metal finish at a glance (§4 material '
      + 'separation), and it is why its finish is `painted` rather than `raw`.',
    roles: {
      baseMaterial: 'metal',
      finish: 'painted',
      renderMode: 'opaque',
      structuralRole: 'secondaryStructure',
      objectClass: 'buildingExterior',
    },
    alternateRoles: [
      { note: 'gate straps, hinges and pintles', structuralRole: 'fastener' },
      { note: 'lantern fire-box frames', objectClass: 'fixture' },
      { note: 'rails and rainchain brackets', structuralRole: 'trim' },
    ],
    settings: {
      global: { seed: 18201 },
      base: {
        generator: 'fbm', scale: 22, detail: 3, detailGain: 0.35, contrast: -0.5,
      },
      detailA: {
        // Orange-peel: 96 cells over a 0.6 m tile = 6 mm stipple.
        enabled: true, generator: 'speckle', blend: 'overlay', amount: 0.14,
        scale: 96, edgeWidth: 0.05, cellVariation: 0.5, warp: 0.4, warpScale: 14,
      },
      detailB: { enabled: false },
      color: {
        ...ramp(
          [0.050, 0.053, 0.060],
          [0.078, 0.082, 0.092],
          [0.104, 0.110, 0.122],
          [0.132, 0.139, 0.152],
          [0.168, 0.176, 0.192],
        ),
        pos1: 0.28, pos2: 0.52, pos3: 0.76, rampSmooth: 0.85,
        jitterHue: 0.006, jitterValue: 0.012, jitterScale: 12,
        jitterCells: false, jitterCellVariety: 0,
        cavity: 0, cavityTint: [0.04, 0.042, 0.048],
        sheen: 0.05, sheenTint: [0.72, 0.75, 0.80],
        saturation: 0.9, brightness: 1.0, contrast: -0.15, gamma: 1.0,
      },
      wear: { damage: 0.05, dirt: 0.03 },
      accentA: { enabled: false },
      accentB: { enabled: false },
      surface: {
        heightScale: 0.06, normalStrength: 0.6, aoStrength: 0.20,
        roughness: 0.42, roughnessContrast: 0.30, metalness: 0,
      },
      emissive: { enabled: false },
    },
  },
]);

/**
 * Materials authored for the cancelled Nova Promenade / Azure Headland scenes.
 * Their bakes, recipes and proof sheets stay on disk — they are correct work
 * against a scene that no longer exists — but they are no longer baked, no
 * longer proofed, and no longer part of any quality claim. The bake writes this
 * list into `material-set.json` so a consumer reading the manifest cannot
 * mistake a stale row for a live material.
 */
export const RETIRED_MATERIALS = Object.freeze([
  { id: 'MAT-CITY-01-warm', reason: 'city façade tint variety — scene cancelled' },
  { id: 'MAT-CITY-01-cool', reason: 'city façade tint variety — scene cancelled' },
  { id: 'MAT-CITY-03', reason: 'sidewalk stone — city scene cancelled' },
  { id: 'MAT-CITY-04', reason: 'urban asphalt — city scene cancelled' },
  { id: 'MAT-CITY-05', reason: 'glazed alley tile — city scene cancelled' },
  { id: 'MAT-CITY-06', reason: 'brushed stainless — city scene cancelled (D19-075 fix stands)' },
  { id: 'MAT-COAST-01', reason: 'coastal decking — superseded by MAT-GDN-05 aged cedar' },
  { id: 'MAT-COAST-02-dry', reason: 'beach sand — coastal scene cancelled' },
  { id: 'MAT-COAST-02-compacted', reason: 'beach sand — coastal scene cancelled' },
  { id: 'MAT-COAST-02-wet', reason: 'beach sand — coastal scene cancelled' },
  { id: 'MAT-COAST-03', reason: 'salt-weathered concrete — superseded by MAT-GDN-06 plaster' },
  { id: 'MAT-SHARED-01-clear', reason: 'architectural glass — no glazing in the garden' },
  { id: 'MAT-SHARED-01-tinted', reason: 'architectural glass — no glazing in the garden' },
]);

/** px/cm at the source resolution and intended world tile size. */
export function texelDensity(entry) {
  return entry.resolution / (entry.tile * 100);
}

/** §8 bars. */
export const HERO_TEXEL_BAR = 10.24;
export const SUPPORTING_TEXEL_BAR = 5.12;
