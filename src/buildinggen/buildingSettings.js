// Canonical settings and field metadata for the building grammar. Grouped
// settings (footprint / massing / roof / facade / palette) in the same shape
// the tree cluster uses, so the debug panel, the generated settings
// reference, and recipe serialization all come free.

export const BUILDING_TYPES = Object.freeze({
  cottage: Object.freeze({
    label: 'Cottage',
    description: 'The Ghibli-adjacent staple: one-and-a-half floors, gable roof, timber facade, chimney.',
    icon: '🏡',
  }),
  shed: Object.freeze({
    label: 'Shed',
    description: 'Small single-slope outbuilding with a wide door.',
    icon: '🛖',
  }),
  farmhouse: Object.freeze({
    label: 'Farmhouse',
    description: 'L-footprint two-floor house — the composite-massing proof.',
    icon: '🏠',
  }),
  watchtower: Object.freeze({
    label: 'Watchtower',
    description: 'Tall narrow tower, floors stepping inward, balcony under a capped roof.',
    icon: '🗼',
  }),
  shrine: Object.freeze({
    label: 'Shrine',
    description: 'Open-fronted hall on a veranda plinth with a curved, deep-overhang roof.',
    icon: '⛩️',
  }),
});

export const BUILDING_ROOF_KINDS = Object.freeze(['gable', 'hip', 'shed', 'pagoda']);

export const DEFAULT_BUILDING_SETTINGS = Object.freeze({
  footprint: Object.freeze({
    kind: 'rect', // rect | L | T (farmhouse defaults to L)
    width: 6.5,
    depth: 5,
    wingRatio: 0.55, // L/T wing size relative to the main rect
  }),
  massing: Object.freeze({
    floors: 1,
    floorHeight: 2.5,
    atticRatio: 0.55, // gable-end attic half-floor height fraction
    inset: 0, // per-floor inward step (towers)
    wallLean: 0.012, // outward lean per meter of height — the hand-drawn read
  }),
  roof: Object.freeze({
    kind: 'gable',
    pitch: 0.85, // rise over half-span
    overhang: 0.55,
    curvature: 0, // upturned eaves (shrine roofs)
    ridgeDecor: 0, // 0..1 ridge cap + finials
  }),
  facade: Object.freeze({
    beams: 1, // 0..1 visible timber framing strength
    bayWidth: 1.6,
    windowChance: 0.75,
    windowWidth: 0.75,
    windowHeight: 0.95,
    doorWidth: 1.0,
    doorHeight: 2.0,
    baseHeight: 0.35, // stone base course
  }),
  palette: Object.freeze({
    wall: Object.freeze([0.82, 0.74, 0.6]),
    beam: Object.freeze([0.32, 0.22, 0.14]),
    roof: Object.freeze([0.42, 0.3, 0.24]),
    trim: Object.freeze([0.45, 0.46, 0.44]),
    door: Object.freeze([0.5, 0.3, 0.16]),
    // Window glazing. Default is the cool interior shade the grammar has
    // always drawn; authoring it is what makes warm lit interiors, tinted
    // curtain wall, and night windows reachable.
    glass: Object.freeze([0.22, 0.31, 0.38]),
    variation: 0.12,
  }),
});

// Per-type defaults layered over the base (same mechanism as prop types).
export const BUILDING_TYPE_DEFAULTS = Object.freeze({
  cottage: Object.freeze({
    footprint: Object.freeze({ depth: 5, kind: 'rect', width: 6.5 }),
    massing: Object.freeze({ atticRatio: 0.55, floors: 1 }),
    roof: Object.freeze({ kind: 'gable', overhang: 0.55, pitch: 0.9 }),
  }),
  shed: Object.freeze({
    facade: Object.freeze({ doorWidth: 1.6, windowChance: 0.25 }),
    footprint: Object.freeze({ depth: 3.2, kind: 'rect', width: 4 }),
    massing: Object.freeze({ atticRatio: 0, floors: 1 }),
    roof: Object.freeze({ kind: 'shed', overhang: 0.4, pitch: 0.35 }),
    palette: Object.freeze({ wall: [0.55, 0.42, 0.28] }),
  }),
  farmhouse: Object.freeze({
    footprint: Object.freeze({ depth: 6, kind: 'L', width: 9, wingRatio: 0.6 }),
    massing: Object.freeze({ atticRatio: 0.5, floors: 2 }),
    roof: Object.freeze({ kind: 'gable', overhang: 0.6, pitch: 0.8 }),
  }),
  watchtower: Object.freeze({
    facade: Object.freeze({ bayWidth: 1.3, windowChance: 0.5, windowHeight: 0.7, windowWidth: 0.55 }),
    footprint: Object.freeze({ depth: 3.4, kind: 'rect', width: 3.4 }),
    massing: Object.freeze({ atticRatio: 0, floors: 4, inset: 0.12 }),
    roof: Object.freeze({ kind: 'hip', overhang: 0.7, pitch: 0.7, ridgeDecor: 0.6 }),
    palette: Object.freeze({ wall: [0.6, 0.56, 0.5] }),
  }),
  shrine: Object.freeze({
    facade: Object.freeze({ baseHeight: 0.8, beams: 1, windowChance: 0 }),
    footprint: Object.freeze({ depth: 4.6, kind: 'rect', width: 6 }),
    massing: Object.freeze({ atticRatio: 0, floorHeight: 3, floors: 1 }),
    roof: Object.freeze({ curvature: 0.6, kind: 'pagoda', overhang: 1.1, pitch: 0.75, ridgeDecor: 0.8 }),
    palette: Object.freeze({
      beam: [0.62, 0.16, 0.1],
      roof: [0.3, 0.37, 0.43],
      wall: [0.9, 0.86, 0.78],
    }),
  }),
});

export const BUILDING_SETTING_GROUPS = Object.freeze([
  Object.freeze({ id: 'footprint', label: 'Footprint', description: 'Ground plan: rect, L, or T, in meters.' }),
  Object.freeze({ id: 'massing', label: 'Massing', description: 'Floors, per-floor inset, and the slight outward wall lean that keeps facades hand-drawn.' }),
  Object.freeze({ id: 'roof', label: 'Roof', description: 'Roof form: gable, hip, shed, or the curved pagoda-ish shrine roof. Roofs always overhang walls.' }),
  Object.freeze({ id: 'facade', label: 'Facade', description: 'Timber framing, window rhythm (windows never intersect beams), and the door (always on an exterior wall).' }),
  Object.freeze({ id: 'palette', label: 'Palette', description: 'Material role colors: wall, beam, roof, trim, door.' }),
]);

const FIELD_DEFINITIONS = Object.freeze({
  footprint: Object.freeze({
    kind: {
      label: 'Plan', description: 'Ground-plan shape.',
      options: ['rect', 'L', 'T'], optionLabels: { L: 'L-shape', T: 'T-shape', rect: 'Rectangle' }, type: 'select',
    },
    width: { label: 'Width', description: 'Main rect width in meters.', range: { max: 14, min: 2.5, step: 0.1 } },
    depth: { label: 'Depth', description: 'Main rect depth in meters.', range: { max: 12, min: 2.5, step: 0.1 } },
    wingRatio: { label: 'Wing Size', description: 'L/T wing size relative to the main rect.', range: { max: 0.85, min: 0.3, step: 0.05 } },
  }),
  massing: Object.freeze({
    floors: { label: 'Floors', description: 'Full floors (towers go tall).', range: { max: 5, min: 1, step: 1 } },
    floorHeight: { label: 'Floor Height', description: 'Meters per floor.', range: { max: 3.4, min: 2.1, step: 0.05 } },
    atticRatio: { label: 'Attic', description: 'Half-floor under a gable roof (0 = none).', range: { max: 0.8, min: 0, step: 0.05 } },
    inset: { label: 'Floor Inset', description: 'Meters each floor steps inward — watchtower massing.', range: { max: 0.3, min: 0, step: 0.01 } },
    wallLean: { label: 'Wall Lean', description: 'Outward lean per meter of height. Exaggerated proportions are settings, not bugs.', range: { max: 0.05, min: 0, step: 0.002 } },
  }),
  roof: Object.freeze({
    kind: {
      label: 'Kind', description: 'Roof construction.',
      options: [...BUILDING_ROOF_KINDS], optionLabels: { gable: 'Gable', hip: 'Hip', pagoda: 'Pagoda-ish', shed: 'Shed' }, type: 'select',
    },
    pitch: { label: 'Pitch', description: 'Rise over half-span.', range: { max: 1.4, min: 0.25, step: 0.05 } },
    overhang: { label: 'Overhang', description: 'Meters the roof reaches past the walls (invariant: > 0).', range: { max: 1.6, min: 0.25, step: 0.05 } },
    curvature: { label: 'Curvature', description: 'Upturned eave sweep — the shrine-roof signature.', range: { max: 1, min: 0, step: 0.05 } },
    ridgeDecor: { label: 'Ridge Decoration', description: 'Ridge cap beam and end finials.', range: { max: 1, min: 0, step: 0.05 } },
  }),
  facade: Object.freeze({
    beams: { label: 'Timber Framing', description: 'Visible beam grid strength (0 hides framing).', range: { max: 1, min: 0, step: 0.05 } },
    bayWidth: { label: 'Bay Width', description: 'Meters between beam columns; windows land mid-bay.', range: { max: 2.6, min: 1, step: 0.05 } },
    windowChance: { label: 'Window Chance', description: 'Chance an eligible bay gets a window.', range: { max: 1, min: 0, step: 0.05 } },
    windowWidth: { label: 'Window Width', description: 'Window width in meters (clamped inside its bay).', range: { max: 1.4, min: 0.4, step: 0.05 } },
    windowHeight: { label: 'Window Height', description: 'Window height in meters.', range: { max: 1.6, min: 0.4, step: 0.05 } },
    doorWidth: { label: 'Door Width', description: 'Door width in meters.', range: { max: 2.2, min: 0.7, step: 0.05 } },
    doorHeight: { label: 'Door Height', description: 'Door height in meters.', range: { max: 2.4, min: 1.7, step: 0.05 } },
    baseHeight: { label: 'Base Course', description: 'Stone base band height (shrines ride a full veranda plinth).', range: { max: 1.2, min: 0, step: 0.05 } },
  }),
  palette: Object.freeze({
    wall: { label: 'Wall', description: 'Plaster / plank wall color.', type: 'color' },
    beam: { label: 'Beam', description: 'Timber framing color.', type: 'color' },
    roof: { label: 'Roof', description: 'Roof surface color.', type: 'color' },
    trim: { label: 'Trim', description: 'Stone base, chimney, and sills.', type: 'color' },
    door: { label: 'Door', description: 'Door color.', type: 'color' },
    glass: { label: 'Glass', description: 'Window glazing color — cool by default; warm it for lit interiors.', type: 'color' },
    variation: { label: 'Variation', description: 'Per-vertex color drift.', range: { max: 0.4, min: 0, step: 0.01 } },
  }),
});

function createBuildingFieldMetadata(group, key, field) {
  const defaultValue = DEFAULT_BUILDING_SETTINGS[group.id][key];
  return Object.freeze({
    defaultValue: Array.isArray(defaultValue) ? [...defaultValue] : defaultValue,
    description: field.description,
    group: group.id,
    id: `${group.id}.${key}`,
    key,
    label: field.label,
    optionLabels: field.optionLabels ?? null,
    options: field.options ?? null,
    range: field.range ?? null,
    serializable: true,
    type: field.type ?? (typeof defaultValue === 'number' ? 'number' : 'text'),
  });
}

export const BUILDING_SETTING_FIELD_SCHEMA = Object.freeze(
  Object.fromEntries(
    BUILDING_SETTING_GROUPS.map((group) => [
      group.id,
      Object.freeze(
        Object.fromEntries(
          Object.entries(FIELD_DEFINITIONS[group.id] ?? {})
            .map(([key, field]) => [key, createBuildingFieldMetadata(group, key, field)]),
        ),
      ),
    ]),
  ),
);

function cloneValue(value) {
  if (Array.isArray(value)) return [...value];
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, cloneValue(entry)]),
  );
  return value;
}

export function cloneBuildingSettings(settings = DEFAULT_BUILDING_SETTINGS) {
  return cloneValue(settings);
}

/**
 * Normalizes `{ type, seed, …group overrides }` over the defaults and the
 * type's defaults. Type and seed ride alongside the groups (mirrors the
 * tree editor's plant group).
 */
export function createBuildingSettings(overrides = {}) {
  const type = BUILDING_TYPES[overrides.type] ? overrides.type : 'cottage';
  const result = cloneBuildingSettings(DEFAULT_BUILDING_SETTINGS);
  const typeDefaults = BUILDING_TYPE_DEFAULTS[type] ?? {};
  for (const groupId of Object.keys(result)) {
    if (typeDefaults[groupId]) Object.assign(result[groupId], cloneValue(typeDefaults[groupId]));
    const group = overrides[groupId];
    if (group && typeof group === 'object') {
      for (const key of Object.keys(result[groupId])) {
        if (group[key] !== undefined) result[groupId][key] = cloneValue(group[key]);
      }
    }
  }
  result.type = type;
  result.seed = Math.max(0, Math.round(Number(overrides.seed) || 1)) >>> 0;
  result.massing.floors = Math.min(6, Math.max(1, Math.round(result.massing.floors)));
  if (!BUILDING_ROOF_KINDS.includes(result.roof.kind)) result.roof.kind = 'gable';
  if (!['rect', 'L', 'T'].includes(result.footprint.kind)) result.footprint.kind = 'rect';
  return result;
}
