// Original non-textual sign, fabric and graphic-panel set for the Pro
// launch-video world — Azure Headland (§10.2).
//
// WHY THIS SET EXISTS
// -------------------
// `launch-plan/review/art-direction-parity-analysis.md` §2 found an unowned
// contradiction. §8 of the production plan requires sign panels to "remain blank
// for original ToonLab art", but blank panels do not read as clean — they read
// as untextured placeholder, which §13 rejects outright as "generic low-poly or
// mobile-blockout appearance". Nobody owned the replacement.
//
// The approved resolution is an **original non-textual graphic set**: shapes,
// icons, colour fields, patterns, stripes, rings and abstract marks, with **no
// readable text in any language**. That satisfies §8's blank-of-text intent
// while supplying the colour density the frame needs, and it sidesteps §13's
// "generated text gibberish" criterion entirely, because there is no lettering
// to get wrong.
//
// SCOPE — COASTAL ONLY
// --------------------
// The city scene was cancelled mid-authoring (developer: ToonLab owns nature
// systems, so Azure Headland is the whole video). Everything that existed to
// dress a dense city street — shop blade signs, transit wayfinding, vending
// panels, stacked tenant columns, alley lanterns — was dropped, and with it the
// ~50-panels-per-frame density target that had driven the entry count.
//
// What remains is a smaller set, each member of which is on screen CLOSER and
// LONGER: S06 is a 32 mm lateral move across the café and S08 is an 85 mm
// detail montage, so this material is held rather than glimpsed. Scope shrank;
// the quality bar did not.
//
// Coverage is the five classes the coastal scene actually needs:
//   · parasol / awning / windbreak fabric  — 6 entries
//   · café pavilion graphics and boards    — 5 entries
//   · beach-safety and boardwalk wayfinding — 4 entries
//   · lookout-pavilion markings            — 1 entry
//   · small utility and service plates     — 2 entries
//
// Three to six members per class is not padding: one member per class means a
// family that reads as a single object recoloured, which is exactly the
// "repeated prop pattern obvious in the hero frame" §13 rejects — and S06 is a
// lateral move, the most punishing camera for repetition, because it parallaxes
// each instance past the frame one at a time.
//
// PROVENANCE (§3 / §2)
// --------------------
// Every pixel comes from ToonLab Texture Lab (`src/texgen`,
// `@call-me-sensei/toonlab/texgen`) via `evaluateTextureMaps`, which is pure
// CPU, DOM-free, seeded and deterministic. No generated images anywhere in the
// chain, and no atlas applied to flat geometry: each entry is a real tileable
// material bound at a declared world tile size, exactly like the §9 set.
//
// TEXEL DENSITY (§8)
// ------------------
// The §9 texture owner established, and `launch-plan/review/texture-material-set.md`
// documents, that density is a property of the map/tile-size PAIRING:
//
//     pxPerCm = sourceResolution / (worldTileMetres * 100)
//
// That convention is followed verbatim rather than reinvented — same helper
// shape, same 10.24 / 5.12 px/cm bars, same rule that an entry without a
// declared tile size is an unverifiable quality claim (D19-052 / FILL-011).
//
// A sign or a parasol adds one thing a wall material does not need: it is a
// BOUNDED object, not an unbounded surface. So each entry also declares the
// physical panel it is authored for and the tile repeat across it. The consumer
// binds `repeat` and gets the declared density; binding anything else moves the
// density and voids the claim.
//
// COLOUR DISCIPLINE (§10.2) — AND THE ONE REAL DECISION IN THIS FILE
// ------------------------------------------------------------------
// §10.2's structure is luminous turquoise-to-deep-blue water, warm pale sand and
// sunlit concrete, saturated but natural greens, a cool atmospheric skyline, and
// **coral accents limited to furniture and pavilion detail**. That last clause
// is this set's entire remit: furniture and pavilion detail is what this file
// makes.
//
// The decision: **this set spends its accent budget on coral and warm ochre, and
// deliberately contains no saturated turquoise or cyan.**
//
// The reason is that the water already owns turquoise, and it owns it at high
// luminosity across a large fraction of every coastal frame. A saturated cyan
// parasol or teal safety flag would merge into the water rather than accent
// against it, and §10.2 explicitly requires that nothing "compete with Yua or
// the water highlights". Coral is the correct accent precisely because it sits
// opposite the water on the wheel: it separates at every distance, it is what
// `09-beach-crowd-wide.png` and `10-beach-selfie-close.png` both actually use
// for their parasols and loungers, and §10.2 names it by name. Where this set
// needs a cool colour it uses a DEEP MARINE BLUE — dark and low-chroma enough to
// read as dyed canvas rather than as a piece of the sea.
//
// The `accentBudget` field keeps that honest. Every entry declares the fraction
// of its own area it intends to spend above 0.55 HSV saturation, the bake
// MEASURES the realised fraction, and the bake fails the entry if the
// measurement exceeds the declared budget. Fabric is allowed to be broadly
// saturated — a striped parasol is half accent colour by construction, and
// `10`'s foreground canopy is a single flat warm field — because a parasol is a
// small object high in frame. Concrete, enamel and utility entries are held near
// zero, which is what makes the fabric read as accent at all.
//
// One further note from the references, and it is the reason SGN-PARA-02 exists:
// `10`'s nearest parasol carries **no graphic whatsoever**. It is a plain
// cream-ochre canvas plane with a gentle value falloff and visible seam ribs.
// At 85 mm that reads better than any mark would. Not every panel needs a
// device, and a set that insisted otherwise would look like a brand exercise.
//
// EMISSIVE (§8)
// -------------
// §8 permits emissive "only for real fixtures". Exactly ONE entry in this set is
// a lit fixture — the café menu light box — and it is the only entry with
// `emissive.enabled`. It carries `structuralRole: 'lightEmitter'` and
// `contentFlags: ['emissive']` so the classification and the map agree. Its
// intensity is deliberately low: under §10.2's bright daylight key a lit board
// in a shaded pavilion should barely register, and a board that glows hard in
// full sun is a defect, not a feature.
//
// ORIGINALITY — HARD REQUIREMENT
// ------------------------------
// No real brands, no recognisable logos, no copied Ananta marks or signage
// designs, and no text that could be mistaken for a real language. Every mark
// below is a composition of ToonLab's own shipped procedural generators —
// discs, rings, hexes, chevrons, bar stacks, stripe fields, scalloped lappets,
// framed plates — parameterised from scratch. What is extracted from the
// references is the PRINCIPLE (a beach reads its colour accents off fabric;
// safety marks are colour fields; kiosks carry scalloped valances), never a
// design.
//
// Two originality traps were avoided explicitly:
//   · **No numerals.** A digit is text in every language. Bay and post markers
//     use dot rows instead (SGN-PLATE-02).
//   · **No cross emblem** on the lookout markings. A red cross on white is a
//     protected emblem under the Geneva Conventions, not a generic safety icon.
//     SGN-LOOK-01 uses a diagonal hazard band instead.
//
// AUTHORING CONSTRAINTS INHERITED FROM THE §9 SET
// ----------------------------------------------
//   · `color.cavity` is 0 on every entry — it paints occlusion into base colour
//     (D19-054), and §8 forbids baked lighting in albedo. Occlusion is the
//     AO/ORM channel's job.
//   · `color.sheen` is 0 on every entry. On printed vinyl or dyed canvas there
//     is no worn ridge highlight to stand for, so there is nothing it could
//     honestly mean.
//   · Detail layers never use the default `overlay` blend over a pattern base,
//     which is a no-op there (D19-055).
//   · `stretchX` raises the feature period across U and therefore reads as
//     VERTICAL streaking; the field labels are inverted (D19-060). Used
//     accordingly, not as labelled.

/** Five-stop ramp helper — darkest crevice to highest ridge. */
const ramp = (color0, color1, color2, color3, color4) =>
  ({ color0, color1, color2, color3, color4 });

// ---------------------------------------------------------------- palette ---
//
// Fixed once so eighteen entries cannot drift into eighteen different corals.
// Authored against §10.2 and measured off `09` and `10`.

const PALETTE = Object.freeze({
  // The §10.2 accent — furniture and pavilion detail, and nothing else.
  coral: [0.867, 0.373, 0.310],
  coralDeep: [0.643, 0.212, 0.180],
  coralPale: [0.941, 0.647, 0.588],

  // Warm ochre / canvas — the second accent. `10`'s foreground parasol.
  ochre: [0.925, 0.741, 0.435],
  ochreDeep: [0.769, 0.545, 0.259],

  // Deep marine blue. NOT turquoise: dark and low-chroma so it reads as dyed
  // canvas rather than as a piece of the sea (see the colour note above).
  marine: [0.129, 0.235, 0.376],
  marineMid: [0.208, 0.361, 0.510],

  // Field colours — warm pale sand and sunlit concrete carry most panel area.
  canvas: [0.953, 0.933, 0.890],
  sand: [0.878, 0.835, 0.757],
  saltWhite: [0.918, 0.918, 0.902],
  saltGrey: [0.780, 0.788, 0.784],
  timber: [0.694, 0.545, 0.396],
  timberDeep: [0.478, 0.353, 0.243],
  slateCool: [0.396, 0.435, 0.471],
  charcoal: [0.149, 0.157, 0.173],
  ink: [0.078, 0.082, 0.094],

  // The single emissive fixture — warm white, never saturated.
  glowPaper: [1.000, 0.925, 0.808],
});

/** Shared surface response for a printed / painted sign face. */
const PRINTED_FACE = Object.freeze({
  heightScale: 0.05, normalStrength: 0.35, aoStrength: 0.18,
  roughness: 0.62, roughnessContrast: 0.14, metalness: 0,
});

/**
 * Shared surface response for dyed canvas. Higher roughness, deeper relief and
 * stronger occlusion than printed sheet — this is the difference that stops a
 * parasol reading as a painted plate hung at an angle, which is §4's
 * material-separation requirement applied to fabric.
 */
const CANVAS_FACE = Object.freeze({
  heightScale: 0.11, normalStrength: 0.58, aoStrength: 0.28,
  roughness: 0.88, roughnessContrast: 0.10, metalness: 0,
});

/** Vitreous enamel on steel — harder, glossier, cooler than printed sheet. */
const ENAMEL_FACE = Object.freeze({
  heightScale: 0.05, normalStrength: 0.32, aoStrength: 0.16,
  roughness: 0.32, roughnessContrast: 0.18, metalness: 0,
});

/** Colour-block defaults every entry shares, so a mark reads as a mark. */
const GRAPHIC_COLOR = Object.freeze({
  // Hard cel bands: a printed graphic has edges, not gradients. 0.10 rather
  // than 0 keeps roughly a one-texel ramp so the edge antialiases instead of
  // stair-stepping, which §13 rejects.
  rampSmooth: 0.10,
  jitterHue: 0.006, jitterValue: 0.012, jitterScale: 8,
  jitterCells: false, jitterCellVariety: 0,
  cavity: 0, cavityTint: [0.5, 0.5, 0.5],
  sheen: 0, sheenTint: [1, 1, 1],
  hueShift: 0, brightness: 1, contrast: 0, gamma: 1,
});

/** Salt air and UV. Coastal signage weathers faster than city signage. */
const COASTAL_WEAR = Object.freeze({ damage: 0.04, dirt: 0.06 });
const FABRIC_WEAR = Object.freeze({ damage: 0.03, dirt: 0.07 });
const NO_WEAR = Object.freeze({ damage: 0, dirt: 0 });

const NO_ACCENT = Object.freeze({ enabled: false });
const NO_EMISSIVE = Object.freeze({ enabled: false });
const NO_DETAIL = Object.freeze({ enabled: false });

/**
 * Canvas weave micro-structure. At scale 120 over a ~1 m tile this is roughly
 * 8 mm, which is real awning canvas. Shared so every fabric entry weaves at the
 * same physical pitch — two fabrics on one terrace with different weave scales
 * read as two different materials, which is wrong.
 */
const weave = (columns) => Object.freeze({
  enabled: true, generator: 'weave', blend: 'multiply', amount: 0.15,
  columns, rows: columns, gap: 0.30,
});

/** Fine print / paper tooth, kept subtle enough not to read as dirt. */
const printTooth = (scale, amount = 0.07) => Object.freeze({
  enabled: true, generator: 'fbm', blend: 'multiply', amount,
  scale, detail: 3, detailGain: 0.4,
});

/** Semantic role tuple for a printed graphic panel (§8). */
const GRAPHIC_ROLES = Object.freeze({
  baseMaterial: 'genericDielectric',
  finish: 'matte',
  renderMode: 'opaque',
  structuralRole: 'graphic',
  objectClass: 'signage',
  contentFlags: Object.freeze(['graphic']),
});

/** Semantic role tuple for dyed canopy / awning canvas. */
const FABRIC_ROLES = Object.freeze({
  baseMaterial: 'textile',
  finish: 'matte',
  renderMode: 'opaque',
  structuralRole: 'secondaryStructure',
  objectClass: 'furniture',
  contentFlags: Object.freeze(['graphic']),
});

/** Semantic role tuple for vitreous-enamel institutional plate. */
const ENAMEL_ROLES = Object.freeze({
  baseMaterial: 'metal',
  finish: 'glazed',
  renderMode: 'opaque',
  structuralRole: 'graphic',
  objectClass: 'infrastructure',
  contentFlags: Object.freeze(['graphic']),
});

export const SIGNAGE_SET = Object.freeze([

  // ======================================================================
  // A. PARASOL, AWNING AND WINDBREAK FABRIC
  //
  //    The highest-value class in the set, and the retarget said so: a beach
  //    reads its colour accents largely off fabric. In `09` the parasol row
  //    is the single strongest colour statement in the frame, and in `10` the
  //    foreground canopy occupies the top-right quadrant on its own.
  //
  //    Mapping note for the canopy entries: a parasol canopy unwraps
  //    conically with U running around the circumference, so a `stripes`
  //    pattern in U becomes RADIAL WEDGES on the built canopy. `mapping`
  //    records this per entry — bound as a flat plane instead, these two
  //    entries are simply wrong, and that is worth stating rather than
  //    discovering.
  // ======================================================================

  {
    id: 'SGN-PARA-01',
    family: 'parasol',
    name: 'Parasol canopy — radial wedge, coral',
    mark: 'Alternating coral and cream radial wedges with a fine canvas weave',
    resolution: 2048,
    tile: 1.2,
    mapping: 'conicalCanopy — U runs around the circumference, V from crown to hem',
    panel: { width: 1.2, height: 1.2, repeat: [1, 1], object: '2.4 m dia. canopy' },
    heroUse: true,
    accentBudget: 0.58,
    use: 'Beach and café-terrace parasols; PROP-COAST-02 canopy slot',
    shots: ['S05', 'S06', 'S08', 'S09'],
    roles: FABRIC_ROLES,
    alternateRoles: [
      { note: 'boardwalk shade sail', objectClass: 'prop' },
      { note: 'pavilion terrace canopy', objectClass: 'buildingExterior' },
    ],
    notes:
      'Twelve wedges around the canopy, which is the count a real eight-to-twelve-rib '
      + 'parasol carries. Half the canopy is accent colour by construction and the budget '
      + 'says so; what holds the scene total down is that a parasol is a small object high '
      + 'in frame, not that its fabric is restrained.',
    settings: {
      global: { seed: 22001 },
      base: {
        generator: 'stripes', columns: 12, rows: 1, cellVariation: 0.10,
        warp: 0.02, warpScale: 5, contrast: 0.55,
      },
      detailA: weave(120),
      detailB: NO_DETAIL,
      color: {
        ...ramp(PALETTE.coralDeep, PALETTE.coral, PALETTE.coral,
          PALETTE.canvas, PALETTE.canvas),
        pos1: 0.30, pos2: 0.46, pos3: 0.52,
        ...GRAPHIC_COLOR, saturation: 0.94,
      },
      wear: FABRIC_WEAR,
      accentA: NO_ACCENT,
      accentB: NO_ACCENT,
      surface: CANVAS_FACE,
      emissive: NO_EMISSIVE,
    },
  },

  {
    id: 'SGN-PARA-02',
    family: 'parasol',
    name: 'Parasol canopy — plain ochre canvas',
    mark: 'No device. Flat warm-ochre canvas with seam ribs and a crown-to-hem value falloff',
    resolution: 2048,
    tile: 1.2,
    mapping: 'conicalCanopy — U runs around the circumference, V from crown to hem',
    panel: { width: 1.2, height: 1.2, repeat: [1, 1], object: '2.8 m dia. canopy' },
    heroUse: true,
    accentBudget: 0.16,
    use: 'The near / hero parasol — the one the 85 mm S08 montage can hold on',
    shots: ['S06', 'S08', 'S09'],
    roles: FABRIC_ROLES,
    alternateRoles: [{ note: 'café terrace square canopy', objectClass: 'buildingExterior' }],
    notes:
      'Deliberately undecorated. `10-beach-selfie-close.png` puts a plain cream-ochre canopy '
      + 'across its top-right quadrant and it is the best-reading fabric in the plate — at '
      + '85 mm a flat dyed canvas with real weave and honest seam ribs beats any mark. This '
      + 'is also what keeps the set from looking like a brand exercise: the hero parasol is '
      + 'the one with nothing printed on it. The ribs are eight wide, low-contrast bands — '
      + 'the shading between panels of a sewn canopy, not a stripe pattern.',
    settings: {
      global: { seed: 22002 },
      base: {
        generator: 'stripes', columns: 8, rows: 1, cellVariation: 0.22,
        warp: 0.04, warpScale: 4, contrast: -0.45,
      },
      detailA: weave(120),
      detailB: printTooth(30, 0.10),
      color: {
        ...ramp(PALETTE.ochreDeep, PALETTE.ochre, PALETTE.ochre,
          PALETTE.canvas, PALETTE.canvas),
        pos1: 0.26, pos2: 0.54, pos3: 0.84,
        ...GRAPHIC_COLOR, rampSmooth: 0.55, saturation: 0.80,
      },
      wear: FABRIC_WEAR,
      accentA: NO_ACCENT,
      accentB: NO_ACCENT,
      surface: CANVAS_FACE,
      emissive: NO_EMISSIVE,
    },
  },

  {
    id: 'SGN-PARA-03',
    status:
      'not-at-benchmark — the lappets resolve at the tile\'s top and bottom edges with a solid field between, instead of one narrow hanging band, and the V seam measures 79.96/255 because `scales` at rows:1 is not V-periodic (D19-081). Needs a different generator, not a parameter pass.',
    family: 'parasol',
    name: 'Valance — scalloped lappet band',
    mark: 'Scalloped hanging lappets, cream over coral, canvas weave',
    resolution: 1024,
    tile: 0.5,
    panel: { width: 3.4, height: 0.24, repeat: [7, 0.48] },
    heroUse: true,
    accentBudget: 0.96,
    use: 'Hanging valance at a parasol hem, kiosk fascia, and the pavilion awning edge',
    shots: ['S06', 'S08', 'S09'],
    roles: {
      baseMaterial: 'textile', finish: 'matte', renderMode: 'alphaCutout',
      structuralRole: 'trim', objectClass: 'furniture', contentFlags: ['graphic'],
    },
    alternateRoles: [{ note: 'kiosk fascia valance', objectClass: 'buildingExterior' }],
    notes:
      'The single most effective silhouette device on any shade structure — `09` gets much '
      + 'of its beach-club read from scalloped parasol hems, and `10`\'s kiosk repeats it. '
      + 'Built on `scales`, ToonLab\'s shingle generator, at one row so it produces a single '
      + 'lappet band rather than a fish-scale field. `alphaCutout` because the space between '
      + 'lappets must be cut, with the height map as the cut source; §13 rejects alpha halos, '
      + 'so the consumer uses a cutoff, never alpha blending.',
    settings: {
      global: { seed: 22003 },
      base: {
        generator: 'scales', columns: 7, rows: 1, cellVariation: 0.15,
        warp: 0.02, warpScale: 4, contrast: 0.4,
      },
      detailA: weave(90),
      detailB: NO_DETAIL,
      color: {
        ...ramp(PALETTE.coralDeep, PALETTE.coral, PALETTE.canvas,
          PALETTE.canvas, PALETTE.canvas),
        pos1: 0.22, pos2: 0.40, pos3: 0.60,
        ...GRAPHIC_COLOR, saturation: 0.88,
      },
      wear: FABRIC_WEAR,
      accentA: NO_ACCENT,
      accentB: NO_ACCENT,
      surface: {
        heightScale: 0.14, normalStrength: 0.62, aoStrength: 0.30,
        roughness: 0.88, roughnessContrast: 0.10, metalness: 0,
      },
      emissive: NO_EMISSIVE,
    },
  },

  {
    id: 'SGN-AWN-01',
    family: 'awning',
    name: 'Pavilion awning — wide two-tone band',
    mark: 'Broad alternating coral and cream bands on canvas',
    resolution: 2048,
    tile: 1.0,
    panel: { width: 4.0, height: 1.6, repeat: [4, 1.6] },
    heroUse: true,
    accentBudget: 0.55,
    use: 'ARCH-COAST-01 café terrace awning; boardwalk kiosk canopy',
    shots: ['S06', 'S07', 'S08'],
    roles: {
      ...FABRIC_ROLES, objectClass: 'buildingExterior',
    },
    alternateRoles: [
      { note: 'freestanding market canopy', objectClass: 'prop' },
      { note: 'lookout pavilion shade', objectClass: 'infrastructure' },
    ],
    notes:
      'The awning is the pavilion\'s colour statement and it is what S07\'s locked wipe will '
      + 'sit against, so the stripe pitch is set to the largest in the set: six bands over '
      + '4 m is a ~33 cm stripe, which still reads as a stripe at the far end of a lateral '
      + 'move rather than dissolving into a tint.',
    settings: {
      global: { seed: 22010 },
      base: {
        generator: 'stripes', columns: 6, rows: 1, cellVariation: 0.12,
        warp: 0.02, warpScale: 5, contrast: 0.55,
      },
      detailA: weave(120),
      detailB: NO_DETAIL,
      color: {
        ...ramp(PALETTE.coralDeep, PALETTE.coral, PALETTE.coral,
          PALETTE.canvas, PALETTE.canvas),
        pos1: 0.30, pos2: 0.46, pos3: 0.52,
        ...GRAPHIC_COLOR, saturation: 0.92,
      },
      wear: FABRIC_WEAR,
      accentA: NO_ACCENT,
      accentB: NO_ACCENT,
      surface: CANVAS_FACE,
      emissive: NO_EMISSIVE,
    },
  },

  {
    id: 'SGN-AWN-02',
    family: 'awning',
    name: 'Pavilion awning — narrow ochre triple stripe',
    mark: 'Fine ochre / cream / ochre triple stripe on canvas',
    resolution: 2048,
    tile: 1.0,
    panel: { width: 4.0, height: 1.6, repeat: [4, 1.6] },
    heroUse: true,
    accentBudget: 0.36,
    use: 'Second awning colourway — the boardwalk side, against SGN-AWN-01 on the café',
    shots: ['S06', 'S08'],
    roles: { ...FABRIC_ROLES, objectClass: 'buildingExterior' },
    alternateRoles: [{ note: 'board-rack shade', objectClass: 'prop' }],
    notes:
      'Fourteen stripes against SGN-AWN-01\'s six over the same tile. The variation that '
      + 'actually reads at distance is PITCH, not hue: two awnings differing only in colour '
      + 'read as the same object recoloured, and S06 is a lateral move, which is the camera '
      + 'that exposes that fastest.',
    settings: {
      global: { seed: 22011 },
      base: {
        generator: 'stripes', columns: 14, rows: 1, cellVariation: 0.10,
        warp: 0.02, warpScale: 6, contrast: 0.5,
      },
      detailA: weave(120),
      detailB: NO_DETAIL,
      color: {
        ...ramp(PALETTE.ochreDeep, PALETTE.ochre, PALETTE.sand,
          PALETTE.canvas, PALETTE.canvas),
        pos1: 0.26, pos2: 0.44, pos3: 0.60,
        ...GRAPHIC_COLOR, saturation: 0.84,
      },
      wear: FABRIC_WEAR,
      accentA: NO_ACCENT,
      accentB: NO_ACCENT,
      surface: CANVAS_FACE,
      emissive: NO_EMISSIVE,
    },
  },

  {
    id: 'SGN-WIND-01',
    family: 'windbreak',
    name: 'Windbreak panel — colour-field bays',
    mark: 'Vertical colour-field bays, coral / cream / marine, separated by pole channels',
    resolution: 2048,
    tile: 1.0,
    panel: { width: 4.0, height: 1.0, repeat: [4, 1] },
    heroUse: true,
    accentBudget: 0.79,
    use: 'Beach windbreak run along the wet-sand line; terrace screen at the pavilion',
    shots: ['S05', 'S06', 'S08'],
    roles: { ...FABRIC_ROLES, objectClass: 'prop' },
    alternateRoles: [{ note: 'boardwalk screen infill', objectClass: 'infrastructure' }],
    notes:
      'A windbreak is the one fabric object that stands vertically at eye level on open '
      + 'sand, so it is doing depth work no parasol can: it plants a hard vertical at a '
      + 'measurable distance and gives the eye something to scale the beach by. The pole '
      + 'channels are the dark `grid` detail — a windbreak without visible channels reads as '
      + 'a hanging sheet.',
    settings: {
      global: { seed: 22012 },
      base: {
        generator: 'stripes', columns: 3, rows: 1, cellVariation: 0.55,
        warp: 0.02, warpScale: 4, contrast: 0.6,
      },
      detailA: {
        enabled: true, generator: 'grid', blend: 'multiply', amount: 0.34,
        columns: 3, rows: 1, gap: 0.05, bevel: 0.02,
      },
      detailB: weave(110),
      color: {
        ...ramp(PALETTE.marine, PALETTE.marineMid, PALETTE.canvas,
          PALETTE.coral, PALETTE.coral),
        pos1: 0.26, pos2: 0.50, pos3: 0.74,
        ...GRAPHIC_COLOR, saturation: 0.88,
      },
      wear: FABRIC_WEAR,
      accentA: NO_ACCENT,
      accentB: NO_ACCENT,
      surface: CANVAS_FACE,
      emissive: NO_EMISSIVE,
    },
  },

  // ======================================================================
  // B. CAFÉ PAVILION GRAPHICS
  //
  //    S06 tracks laterally across the café and S08 holds at 85 mm, so this
  //    is the closest and longest-held material in the set. Density targets
  //    here are the tightest: the menu box is 25.6 px/cm and the A-frame is
  //    29.26 px/cm, both around 2.5-3x the §8 hero bar.
  // ======================================================================

  {
    id: 'SGN-CAFE-01',
    status:
      'not-at-benchmark — the rules read correctly but the accent discs resolve as scattered tilted ellipses rather than one placed disc. Accent-overlay cell targeting (D19-080).',
    family: 'pavilionGraphic',
    name: 'Pavilion fascia — rule and disc',
    mark: 'Salt-white concrete field, twin charcoal rules, one coral disc off centre',
    resolution: 2048,
    tile: 1.2,
    panel: { width: 4.8, height: 1.2, repeat: [4, 1] },
    heroUse: true,
    accentBudget: 0.10,
    use: 'ARCH-COAST-01 frontage band above the terrace glazing',
    shots: ['S06', 'S07', 'S08'],
    roles: GRAPHIC_ROLES,
    alternateRoles: [
      { note: 'parapet band on the lookout pavilion', structuralRole: 'trim',
        objectClass: 'buildingExterior' },
      { note: 'boardwalk kiosk fascia', objectClass: 'prop' },
    ],
    notes:
      'Sits directly on MAT-COAST-03 salt-weathered white concrete, so the field colour is '
      + 'matched to that material rather than to the printed families — the fascia should '
      + 'read as a band applied to the pavilion, not as a separate object bolted on. The '
      + 'disc sits off-centre and the rules run edge to edge so a 4-tile repeat reads as a '
      + 'rhythm rather than a stamp. Smallest accent budget of any coloured entry, because '
      + 'this covers the most linear metres of any graphic on the pavilion.',
    settings: {
      global: { seed: 22020 },
      base: {
        generator: 'grid', columns: 1, rows: 3, gap: 0.05, bevel: 0.012,
        contrast: 0.5,
      },
      detailA: NO_DETAIL,
      detailB: printTooth(80),
      color: {
        ...ramp(PALETTE.charcoal, PALETTE.slateCool, PALETTE.saltGrey,
          PALETTE.saltWhite, PALETTE.saltWhite),
        pos1: 0.16, pos2: 0.34, pos3: 0.56,
        ...GRAPHIC_COLOR, saturation: 0.82,
      },
      wear: COASTAL_WEAR,
      accentA: {
        enabled: true, generator: 'dots', columns: 3, rows: 1,
        gap: 0.62, bevel: 0.02, cellJitter: 0.55, cellVariation: 0,
        blend: 'normal', color: PALETTE.coral, colorB: PALETTE.coral,
        coverage: 0.30, softness: 0.02, creviceBias: 0,
        roughnessShift: 0, heightShift: 0, metalShift: 0, contrast: 0.9,
      },
      accentB: NO_ACCENT,
      surface: PRINTED_FACE,
      emissive: NO_EMISSIVE,
    },
  },

  {
    id: 'SGN-CAFE-02',
    status:
      'not-at-benchmark — the hex grid and wood grain read well, but the intended single filled hex resolves as small specks in every cell, which read as blemishes. Accent-overlay cell targeting (D19-080).',
    family: 'pavilionGraphic',
    name: 'Counter front — hex bay panel',
    mark: 'Warm timber field carrying a row of outlined hexes, one filled coral',
    resolution: 2048,
    tile: 0.8,
    panel: { width: 2.4, height: 0.9, repeat: [3, 1.125] },
    heroUse: true,
    accentBudget: 0.09,
    use: 'Café counter front and service-hatch panelling — the S08 close subject',
    shots: ['S06', 'S08'],
    roles: {
      baseMaterial: 'wood', finish: 'varnished', renderMode: 'opaque',
      structuralRole: 'graphic', objectClass: 'furniture',
      contentFlags: ['graphic'],
    },
    alternateRoles: [{ note: 'boardwalk bench-end panel', objectClass: 'prop' }],
    notes:
      'Counter graphics on timber rather than on sheet, so the base carries a real wood '
      + 'value structure under the mark and the mark reads as inlay. 25.6 px/cm — this is a '
      + 'surface an 85 mm lens sits on at about 1.5 m, and it is the entry most likely to '
      + 'expose a soft texture. The quietest coloured entry in the set by accent budget.',
    settings: {
      global: { seed: 22021 },
      base: {
        generator: 'hex', columns: 3, gap: 0.16, bevel: 0.035,
        cellVariation: 0.30, warp: 0, contrast: 0.35,
      },
      detailA: {
        enabled: true, generator: 'woodGrain', blend: 'multiply', amount: 0.22,
        scale: 26, stretchX: 2.0, rings: 9, grain: 0.75, detail: 4,
      },
      detailB: printTooth(90),
      color: {
        ...ramp(PALETTE.timberDeep, PALETTE.timber, PALETTE.sand,
          PALETTE.canvas, PALETTE.canvas),
        pos1: 0.20, pos2: 0.42, pos3: 0.68,
        ...GRAPHIC_COLOR, saturation: 0.80,
      },
      wear: COASTAL_WEAR,
      accentA: {
        enabled: true, generator: 'dots', columns: 3, rows: 2,
        gap: 0.70, bevel: 0.04, cellJitter: 0.8, cellVariation: 0,
        blend: 'normal', color: PALETTE.coral, colorB: PALETTE.coralDeep,
        coverage: 0.14, softness: 0.03, creviceBias: 0,
        roughnessShift: 0, heightShift: 0, metalShift: 0, contrast: 0.9,
      },
      accentB: NO_ACCENT,
      surface: {
        heightScale: 0.08, normalStrength: 0.44, aoStrength: 0.24,
        roughness: 0.48, roughnessContrast: 0.20, metalness: 0,
      },
      emissive: NO_EMISSIVE,
    },
  },

  {
    id: 'SGN-MENU-01',
    status:
      'close — the panel grid and frame read correctly, but the ochre accent lands in all six panels instead of one, so the board reads as patterned rather than as one highlighted panel. Accent-overlay cell targeting (D19-080).',
    family: 'pavilionGraphic',
    name: 'Menu light box — panel grid',
    mark: 'Six panels in a charcoal frame, one ochre, the rest warm white',
    resolution: 2048,
    tile: 0.8,
    panel: { width: 0.8, height: 1.2, repeat: [1, 1.5] },
    heroUse: true,
    accentBudget: 0.13,
    emissiveFixture: true,
    use: 'Illuminated menu board under the café canopy',
    shots: ['S06', 'S08'],
    roles: {
      baseMaterial: 'polymer', finish: 'matte', renderMode: 'opaque',
      structuralRole: 'lightEmitter', objectClass: 'signage',
      contentFlags: ['graphic', 'emissive'],
    },
    alternateRoles: [
      { note: 'unlit daytime board', structuralRole: 'graphic', contentFlags: ['graphic'] },
      { note: 'interior board above the counter', objectClass: 'buildingInterior' },
    ],
    notes:
      'The ONLY emissive entry in the set. §8 permits emissive for real fixtures and this is '
      + 'one — a lit box under a shaded canopy. Intensity is deliberately low at 1.2: under '
      + '§10.2\'s bright daylight key a board that glows hard in full sun is a defect, and '
      + 'the honest behaviour is that it barely registers except where the canopy shades it. '
      + 'The lit panels are the emissive source and the frame is not, which is how a light '
      + 'box actually behaves — it glows through its faces, not through its extrusion. An '
      + 'unlit alternate role exists for instances outside the canopy shadow.',
    settings: {
      global: { seed: 22022 },
      base: {
        generator: 'tiles', columns: 2, rows: 3, gap: 0.09, bevel: 0.025,
        cellVariation: 0.22, warp: 0, contrast: 0.45,
      },
      detailA: NO_DETAIL,
      detailB: printTooth(95, 0.06),
      color: {
        ...ramp(PALETTE.ink, PALETTE.charcoal, PALETTE.saltGrey,
          PALETTE.glowPaper, PALETTE.glowPaper),
        pos1: 0.18, pos2: 0.34, pos3: 0.56,
        ...GRAPHIC_COLOR, saturation: 0.86,
      },
      wear: { damage: 0.02, dirt: 0.05 },
      accentA: {
        enabled: true, generator: 'dots', columns: 2, rows: 3,
        gap: 0.30, bevel: 0.03, cellJitter: 0, cellVariation: 0.9,
        blend: 'normal', color: PALETTE.ochre, colorB: PALETTE.ochreDeep,
        coverage: 0.14, softness: 0.03, creviceBias: -0.5,
        roughnessShift: 0, heightShift: 0, metalShift: 0, contrast: 0.9,
      },
      accentB: NO_ACCENT,
      surface: {
        heightScale: 0.08, normalStrength: 0.42, aoStrength: 0.24,
        roughness: 0.40, roughnessContrast: 0.16, metalness: 0,
      },
      emissive: {
        enabled: true, color: PALETTE.glowPaper, intensity: 1.2,
        source: 'peaks', threshold: 0.52, width: 0.42, softness: 0.10,
      },
    },
  },

  {
    id: 'SGN-MENU-02',
    status:
      'not-at-benchmark — the warped stripes plus speckle resolve as torn-poster mottling rather than chalk rules on slate. This entry needs re-authoring from the base layer up, not a tweak.',
    family: 'pavilionGraphic',
    name: 'A-frame board — slate rules',
    mark: 'Dark slate field with pale wandering rules and a coral corner block',
    resolution: 2048,
    tile: 0.7,
    panel: { width: 0.7, height: 1.0, repeat: [1, 1.43] },
    heroUse: true,
    accentBudget: 0.07,
    use: 'Pavement A-frame at the café entrance and the head of the boardwalk',
    shots: ['S06', 'S08', 'S09'],
    roles: {
      baseMaterial: 'mineral', finish: 'matte', renderMode: 'opaque',
      structuralRole: 'graphic', objectClass: 'furniture', contentFlags: ['graphic'],
    },
    alternateRoles: [{ note: 'wall-mounted slate panel', objectClass: 'buildingInterior' }],
    notes:
      'The rules are `stripes` under heavy warp so they wander like chalk rather than sitting '
      + 'like print — and they are deliberately NOT letterforms. This is the entry where the '
      + 'no-text rule is most at risk: the obvious way to make a chalkboard read is to imply '
      + 'writing, and anything that implies writing risks becoming the language gibberish §13 '
      + 'rejects. So the rules are unambiguously rules — full width, evenly spaced, unbroken, '
      + 'no word-shaped gaps. 29.26 px/cm, the second highest in the set.',
    settings: {
      global: { seed: 22023 },
      base: {
        generator: 'stripes', columns: 1, rows: 9, cellVariation: 0.35,
        warp: 0.16, warpScale: 7, contrast: 0.3,
      },
      detailA: {
        enabled: true, generator: 'fbm', blend: 'multiply', amount: 0.20,
        scale: 22, detail: 5, detailGain: 0.5,
      },
      detailB: {
        enabled: true, generator: 'speckle', blend: 'multiply', amount: 0.10,
        scale: 120, edgeWidth: 0.06, cellVariation: 0.6,
      },
      color: {
        ...ramp(PALETTE.ink, PALETTE.charcoal, PALETTE.slateCool,
          PALETTE.saltGrey, PALETTE.saltWhite),
        pos1: 0.24, pos2: 0.52, pos3: 0.80,
        ...GRAPHIC_COLOR, rampSmooth: 0.30, saturation: 0.68,
      },
      wear: { damage: 0.05, dirt: 0.10 },
      accentA: {
        enabled: true, generator: 'grid', columns: 3, rows: 4,
        gap: 0.55, bevel: 0.03, blend: 'normal',
        color: PALETTE.coral, colorB: PALETTE.coralDeep,
        coverage: 0.08, softness: 0.03, creviceBias: -0.4,
        roughnessShift: -0.05, heightShift: 0, metalShift: 0, contrast: 0.85,
      },
      accentB: NO_ACCENT,
      surface: {
        heightScale: 0.10, normalStrength: 0.45, aoStrength: 0.28,
        roughness: 0.86, roughnessContrast: 0.14, metalness: 0,
      },
      emissive: NO_EMISSIVE,
    },
  },

  {
    id: 'SGN-DECAL-01',
    family: 'pavilionGraphic',
    name: 'Glazing manifestation — frosted band and dot field',
    mark: 'Frosted horizontal band with a graded dot field fading out at both edges',
    resolution: 2048,
    tile: 1.2,
    panel: { width: 3.6, height: 1.2, repeat: [3, 1] },
    heroUse: true,
    accentBudget: 0.00,
    use: 'Manifestation band on the café pavilion glazing',
    shots: ['S06', 'S07', 'S08'],
    roles: {
      baseMaterial: 'polymer', finish: 'matte', renderMode: 'translucent',
      structuralRole: 'graphic', objectClass: 'buildingExterior',
      contentFlags: ['graphic'],
    },
    alternateRoles: [{ note: 'lookout pavilion balustrade glazing', objectClass: 'infrastructure' }],
    notes:
      'Zero accent budget: a manifestation band is white frost on glass, full stop. Its value '
      + 'is not colour — it is that it stops a hero storefront reading as a hole. §13 rejects '
      + '"paper-thin glazing or no interior depth in a hero storefront", and a frosted band '
      + 'gives the glass a surface to catch light on without the painted fake reflection §8 '
      + 'forbids. `translucent` so MAT-SHARED-01\'s transmissive profile and the modelled '
      + 'interior depth behind it still read through.',
    settings: {
      global: { seed: 22024 },
      base: {
        generator: 'dots', columns: 40, rows: 14, gap: 0.30, bevel: 0.06,
        cellJitter: 0, cellVariation: 0.15, contrast: 0.2,
      },
      detailA: {
        enabled: true, generator: 'stripes', blend: 'multiply', amount: 0.55,
        columns: 1, rows: 3, contrast: 0.35,
      },
      detailB: NO_DETAIL,
      color: {
        ...ramp(PALETTE.saltGrey, PALETTE.saltWhite, PALETTE.canvas,
          [0.976, 0.976, 0.980], [1, 1, 1]),
        pos1: 0.30, pos2: 0.58, pos3: 0.80,
        ...GRAPHIC_COLOR, jitterHue: 0, jitterValue: 0.006, saturation: 0.30,
      },
      wear: NO_WEAR,
      accentA: NO_ACCENT,
      accentB: NO_ACCENT,
      surface: {
        heightScale: 0.03, normalStrength: 0.22, aoStrength: 0.08,
        roughness: 0.66, roughnessContrast: 0.30, metalness: 0,
      },
      emissive: NO_EMISSIVE,
    },
  },

  // ======================================================================
  // C. BEACH SAFETY AND BOARDWALK WAYFINDING
  //
  //    The universal-symbol family: colour-field flags and icon plates that
  //    communicate without a single letter. This is the class where the
  //    no-text rule costs nothing at all, because real beach safety marking
  //    is already language-free by design — a flag IS its colour.
  // ======================================================================

  {
    id: 'SGN-FLAG-01',
    status:
      'not-at-benchmark — the horizontal split field is present but the hoist band resolves as several vertical stripes across the flag. Accent-overlay cell targeting (D19-080).',
    family: 'safetyFlag',
    name: 'Beach flag — split colour field',
    mark: 'Horizontal split field, coral over ochre, with a hoist band',
    resolution: 1024,
    tile: 0.7,
    panel: { width: 0.7, height: 0.5, repeat: [1, 0.71] },
    heroUse: true,
    accentBudget: 0.62,
    use: 'Flagged patrol area at the head of the beach; boardwalk approach markers',
    shots: ['S05', 'S06', 'S09'],
    roles: {
      baseMaterial: 'textile', finish: 'matte', renderMode: 'alphaCutout',
      structuralRole: 'graphic', objectClass: 'infrastructure',
      contentFlags: ['graphic'],
    },
    alternateRoles: [{ note: 'terrace pennant', objectClass: 'prop' }],
    notes:
      'A beach flag is a pure colour field — it is the cleanest possible answer to the '
      + 'no-text requirement, because real beach safety flags carry no lettering in any '
      + 'country. This is a split field with a hoist band rather than any national or '
      + 'organisational flag: the two-tone horizontal split is generic marine practice, not '
      + 'a specific emblem. High accent fraction on a very small object, and it is high in '
      + 'frame on a pole where it breaks the horizon — the cheapest silhouette work available.',
    settings: {
      global: { seed: 22030 },
      base: {
        generator: 'stripes', columns: 1, rows: 2, cellVariation: 0,
        warp: 0.05, warpScale: 3, contrast: 0.7,
      },
      detailA: weave(80),
      detailB: NO_DETAIL,
      color: {
        ...ramp(PALETTE.coralDeep, PALETTE.coral, PALETTE.coral,
          PALETTE.ochre, PALETTE.ochre),
        pos1: 0.26, pos2: 0.48, pos3: 0.54,
        ...GRAPHIC_COLOR, saturation: 0.98,
      },
      wear: FABRIC_WEAR,
      accentA: {
        enabled: true, generator: 'grid', columns: 6, rows: 1,
        gap: 0.84, bevel: 0.02, blend: 'normal',
        color: PALETTE.canvas, colorB: PALETTE.sand,
        coverage: 0.14, softness: 0.02, creviceBias: 0, contrast: 0.9,
        roughnessShift: 0, heightShift: 0.01, metalShift: 0,
      },
      accentB: NO_ACCENT,
      surface: {
        heightScale: 0.09, normalStrength: 0.46, aoStrength: 0.22,
        roughness: 0.88, roughnessContrast: 0.08, metalness: 0,
      },
      emissive: NO_EMISSIVE,
    },
  },

  {
    id: 'SGN-FLAG-02',
    family: 'safetyFlag',
    name: 'Condition flag — marine field with chevron',
    mark: 'Deep marine field crossed by a single cream chevron',
    resolution: 1024,
    tile: 0.7,
    panel: { width: 0.7, height: 0.5, repeat: [1, 0.71] },
    heroUse: true,
    accentBudget: 0.52,
    use: 'Second flag on the same run — conditions marker beside the patrol flag',
    shots: ['S05', 'S06', 'S09'],
    roles: {
      baseMaterial: 'textile', finish: 'matte', renderMode: 'alphaCutout',
      structuralRole: 'graphic', objectClass: 'infrastructure',
      contentFlags: ['graphic'],
    },
    alternateRoles: [{ note: 'boardwalk route pennant', objectClass: 'signage' }],
    notes:
      'Marine blue rather than turquoise, for the reason in the colour note at the head of '
      + 'this file: a saturated cyan flag against luminous turquoise water is invisible. At '
      + 'this value the flag separates from the water by VALUE, which survives any lighting '
      + 'condition. Different generator family from SGN-FLAG-01 (chevron, not split field) so '
      + 'a two-flag run is not one flag recoloured.',
    settings: {
      global: { seed: 22031 },
      base: {
        generator: 'chevron', columns: 1, rows: 2, warp: 0.04, warpScale: 3,
        contrast: 0.55,
      },
      detailA: weave(80),
      detailB: NO_DETAIL,
      color: {
        ...ramp(PALETTE.marine, PALETTE.marine, PALETTE.marineMid,
          PALETTE.canvas, PALETTE.canvas),
        pos1: 0.30, pos2: 0.52, pos3: 0.66,
        ...GRAPHIC_COLOR, saturation: 0.90,
      },
      wear: FABRIC_WEAR,
      accentA: NO_ACCENT,
      accentB: NO_ACCENT,
      surface: {
        heightScale: 0.09, normalStrength: 0.46, aoStrength: 0.22,
        roughness: 0.88, roughnessContrast: 0.08, metalness: 0,
      },
      emissive: NO_EMISSIVE,
    },
  },

  {
    id: 'SGN-SAFE-01',
    status:
      'FAILED — `chevron` blended at `min`/0.85 crushes the whole tile to near-black, so neither the ochre field nor the triangle survives. The measured accent fraction is 0.0% against a 0.56 declaration, which is the gate catching a real defect rather than a budget miss.',
    family: 'safetyPlate',
    name: 'Hazard plate — ochre field, triangle mark',
    mark: 'Ochre enamel field, heavy charcoal border, centred charcoal triangle',
    resolution: 1024,
    tile: 0.6,
    panel: { width: 0.6, height: 0.6, repeat: [1, 1] },
    heroUse: true,
    accentBudget: 0.56,
    use: 'Beach-hazard plate on posts at the shoreline approach and the rock clusters',
    shots: ['S06', 'S08', 'S09'],
    roles: ENAMEL_ROLES,
    alternateRoles: [{ note: 'boardwalk edge warning', objectClass: 'prop' }],
    notes:
      'A bordered triangle on an ochre field is the universal hazard grammar and it carries '
      + 'no text in any language — the same principle reference `03` uses for its warning '
      + 'plate, executed with an original mark rather than the reference\'s pictogram. Small '
      + 'panel, so a high accent fraction costs almost no frame area, and it is exactly the '
      + 'kind of small high-chroma institutional object that anchors a shaded pocket.',
    settings: {
      global: { seed: 22032 },
      base: {
        generator: 'dots', columns: 1, rows: 1, gap: 0.30, bevel: 0.02,
        cellJitter: 0, cellVariation: 0, contrast: 0.5,
      },
      detailA: {
        enabled: true, generator: 'chevron', blend: 'min', amount: 0.85,
        columns: 1, rows: 1, contrast: 0.4,
      },
      detailB: NO_DETAIL,
      color: {
        ...ramp(PALETTE.charcoal, PALETTE.ink, PALETTE.ochreDeep,
          PALETTE.ochre, PALETTE.ochre),
        pos1: 0.26, pos2: 0.44, pos3: 0.58,
        ...GRAPHIC_COLOR, saturation: 1.0,
      },
      wear: COASTAL_WEAR,
      accentA: {
        enabled: true, generator: 'grid', columns: 1, rows: 1,
        gap: 0.11, bevel: 0.01, blend: 'normal',
        color: PALETTE.charcoal, colorB: PALETTE.ink,
        coverage: 0.50, softness: 0.02, creviceBias: 0,
        roughnessShift: 0.1, heightShift: 0, metalShift: 0, contrast: 0.9,
      },
      accentB: NO_ACCENT,
      surface: ENAMEL_FACE,
      emissive: NO_EMISSIVE,
    },
  },

  {
    id: 'SGN-WAY-01',
    family: 'wayfinding',
    name: 'Boardwalk waymarker — coral roundel',
    mark: 'Salt-white enamel plate, concentric coral ring, charcoal core',
    resolution: 1024,
    tile: 0.45,
    panel: { width: 0.45, height: 0.45, repeat: [1, 1] },
    heroUse: true,
    accentBudget: 0.24,
    use: 'Boardwalk route markers on posts, headland path junctions, overlook approach',
    shots: ['S06', 'S08', 'S09'],
    roles: ENAMEL_ROLES,
    alternateRoles: [
      { note: 'pavilion-mounted directory plate', objectClass: 'buildingExterior' },
      { note: 'café table marker', objectClass: 'furniture' },
    ],
    notes:
      'A roundel is the most compact recognisable wayfinding device there is, and the ring '
      + 'form comes straight out of `dots` with a wide bevel — no text needed for it to read '
      + 'as institutional signage. 22.76 px/cm on a 45 cm plate that S09 passes within about '
      + 'a metre of during the walkable move.',
    settings: {
      global: { seed: 22033 },
      base: {
        generator: 'dots', columns: 1, rows: 1, gap: 0.14, bevel: 0.26,
        cellJitter: 0, cellVariation: 0, contrast: 0.15,
      },
      detailA: NO_DETAIL,
      detailB: printTooth(70, 0.06),
      color: {
        ...ramp(PALETTE.charcoal, PALETTE.charcoal, PALETTE.coral,
          PALETTE.saltGrey, PALETTE.saltWhite),
        pos1: 0.32, pos2: 0.56, pos3: 0.76,
        ...GRAPHIC_COLOR, saturation: 0.94,
      },
      wear: COASTAL_WEAR,
      accentA: NO_ACCENT,
      accentB: NO_ACCENT,
      surface: ENAMEL_FACE,
      emissive: NO_EMISSIVE,
    },
  },

  // ======================================================================
  // D. LOOKOUT PAVILION MARKINGS
  // ======================================================================

  {
    id: 'SGN-LOOK-01',
    family: 'lookoutMarking',
    name: 'Lookout banding — diagonal hazard band',
    mark: 'Broad diagonal coral and cream hazard banding on painted steel',
    resolution: 2048,
    tile: 0.8,
    panel: { width: 2.4, height: 0.4, repeat: [3, 0.5] },
    heroUse: true,
    accentBudget: 0.55,
    use: 'ARCH-COAST-02 lookout structure banding — legs, rail edges, ladder stringers',
    shots: ['S06', 'S08', 'S09'],
    roles: {
      baseMaterial: 'metal', finish: 'painted', renderMode: 'opaque',
      structuralRole: 'trim', objectClass: 'infrastructure',
      contentFlags: ['graphic'],
    },
    alternateRoles: [
      { note: 'boardwalk edge marking', objectClass: 'prop' },
      { note: 'shoreline post banding', objectClass: 'signage' },
    ],
    notes:
      'Deliberately NOT a cross emblem. A red cross on white is protected under the Geneva '
      + 'Conventions and is not a generic safety icon; diagonal hazard banding carries the '
      + 'same "this is a safety structure" read with no emblem risk at all. §10.2 wants the '
      + 'lookout to provide human scale near the beach, and banded legs do that better than a '
      + 'plain painted post — the band pitch is a ruler the eye can read distance off.',
    settings: {
      global: { seed: 22040 },
      base: {
        generator: 'chevron', columns: 4, rows: 1, warp: 0, contrast: 0.65,
      },
      detailA: NO_DETAIL,
      detailB: printTooth(70, 0.09),
      color: {
        ...ramp(PALETTE.coralDeep, PALETTE.coral, PALETTE.coral,
          PALETTE.canvas, PALETTE.canvas),
        pos1: 0.28, pos2: 0.48, pos3: 0.54,
        ...GRAPHIC_COLOR, saturation: 0.92,
      },
      wear: { damage: 0.07, dirt: 0.08 },
      accentA: NO_ACCENT,
      accentB: NO_ACCENT,
      surface: {
        heightScale: 0.06, normalStrength: 0.38, aoStrength: 0.20,
        roughness: 0.52, roughnessContrast: 0.20, metalness: 0,
      },
      emissive: NO_EMISSIVE,
    },
  },

  // ======================================================================
  // E. SMALL UTILITY AND SERVICE PLATES
  //
  //    The smallest members, and the ones that take a scene from "signed" to
  //    "lived in". They also carry the tightest texel demand in the whole
  //    launch world: a 25 cm plate that an 85 mm lens sees from 1.5 m.
  // ======================================================================

  {
    id: 'SGN-PLATE-01',
    family: 'utilityPlate',
    name: 'Service plate — bar and fixings',
    mark: 'Small charcoal plate, single pale bar, four pale corner fixings',
    resolution: 1024,
    tile: 0.25,
    panel: { width: 0.25, height: 0.16, repeat: [1, 0.64] },
    heroUse: true,
    accentBudget: 0.00,
    use: 'Shower and tap plates, boardwalk service hatches, pavilion plant labels',
    shots: ['S06', 'S08'],
    roles: {
      baseMaterial: 'metal', finish: 'painted', renderMode: 'opaque',
      structuralRole: 'graphic', objectClass: 'infrastructure',
      contentFlags: ['graphic'],
    },
    alternateRoles: [{ note: 'board-rack end plate', objectClass: 'prop' }],
    notes:
      '40.96 px/cm — 4x the hero bar, and the highest density in the launch world. It needs '
      + 'it: a 25 cm plate seen by an 85 mm lens at 1.5 m is the tightest texel demand '
      + 'anywhere in either scene. Zero accent by intent — this is the desaturated '
      + 'counterweight that lets the fabric read as accent at all.',
    settings: {
      global: { seed: 22050 },
      base: {
        generator: 'grid', columns: 1, rows: 2, gap: 0.16, bevel: 0.03,
        contrast: 0.45,
      },
      detailA: {
        enabled: true, generator: 'dots', blend: 'max', amount: 0.55,
        columns: 2, rows: 2, gap: 0.80, bevel: 0.04, cellJitter: 0,
      },
      detailB: printTooth(50, 0.10),
      color: {
        ...ramp(PALETTE.ink, PALETTE.charcoal, PALETTE.slateCool,
          PALETTE.saltGrey, PALETTE.saltWhite),
        pos1: 0.22, pos2: 0.46, pos3: 0.72,
        ...GRAPHIC_COLOR, saturation: 0.55,
      },
      wear: { damage: 0.08, dirt: 0.10 },
      accentA: NO_ACCENT,
      accentB: NO_ACCENT,
      surface: {
        heightScale: 0.10, normalStrength: 0.48, aoStrength: 0.26,
        roughness: 0.56, roughnessContrast: 0.20, metalness: 0,
      },
      emissive: NO_EMISSIVE,
    },
  },

  {
    id: 'SGN-PLATE-02',
    status:
      'not-at-benchmark — the border accent covers the plate and the four coral dots are lost. Accent-overlay cell targeting (D19-080).',
    family: 'utilityPlate',
    name: 'Post marker — dot row',
    mark: 'Salt-white enamel plate with a row of four coral dots and a thin border',
    resolution: 1024,
    tile: 0.25,
    panel: { width: 0.25, height: 0.25, repeat: [1, 1] },
    heroUse: true,
    accentBudget: 0.25,
    use: 'Boardwalk post markers, parasol-base bay markers, café table numbers',
    shots: ['S06', 'S08', 'S09'],
    roles: ENAMEL_ROLES,
    alternateRoles: [{ note: 'café table marker', objectClass: 'furniture' }],
    notes:
      'A dot row is how you mark a bay without a numeral, and a numeral is exactly the thing '
      + 'this set must not contain — a digit is text in every language. Four dots reads as '
      + '"bay four" to a viewer without ever being a character. 40.96 px/cm.',
    settings: {
      global: { seed: 22051 },
      base: {
        generator: 'dots', columns: 4, rows: 1, gap: 0.42, bevel: 0.05,
        cellJitter: 0, cellVariation: 0, contrast: 0.3,
      },
      detailA: NO_DETAIL,
      detailB: printTooth(60),
      color: {
        ...ramp(PALETTE.coralDeep, PALETTE.coral, PALETTE.saltGrey,
          PALETTE.saltWhite, PALETTE.saltWhite),
        pos1: 0.28, pos2: 0.50, pos3: 0.70,
        ...GRAPHIC_COLOR, saturation: 0.92,
      },
      wear: COASTAL_WEAR,
      accentA: {
        enabled: true, generator: 'grid', columns: 1, rows: 1,
        gap: 0.10, bevel: 0.01, blend: 'normal',
        color: PALETTE.slateCool, colorB: PALETTE.charcoal,
        coverage: 0.45, softness: 0.02, creviceBias: 0,
        roughnessShift: 0.05, heightShift: 0, metalShift: 0, contrast: 0.9,
      },
      accentB: NO_ACCENT,
      surface: ENAMEL_FACE,
      emissive: NO_EMISSIVE,
    },
  },
]);

// ------------------------------------------------------------------ metrics --

/**
 * px/cm at the source resolution and intended world tile size.
 * Identical convention and formula to the §9 material set
 * (`scripts/launch-world-material-set.mjs`) — deliberately not a parallel one.
 */
export function texelDensity(entry) {
  return entry.resolution / (entry.tile * 100);
}

/** §8 bars, restated from the §9 set so both files fail the same way. */
export const HERO_TEXEL_BAR = 10.24;
export const SUPPORTING_TEXEL_BAR = 5.12;

/**
 * Parity-analysis §5.5 threshold: the accent colours must be the only pixels
 * above this HSV saturation anywhere in the scene.
 */
export const ACCENT_SATURATION_THRESHOLD = 0.55;

/** The §10.2 colour band this set is allowed to spend. Exported for the report. */
export const SIGNAGE_PALETTE = PALETTE;
