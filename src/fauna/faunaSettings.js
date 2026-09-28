// Canonical settings and field metadata for the ambient fauna layer.
// Follows the library-wide convention: DEFAULT_FAUNA_SETTINGS holds the
// grouped values, FAUNA_SETTING_GROUPS + FAUNA_SETTING_FIELD_SCHEMA drive the
// debug panel and the generated settings reference, and the recipe document
// ({ schema, version, seed, species, settings }) rebuilds the identical
// population forever. Populations are passed to createFauna({ species })
// directly — they are budgets, not look settings — so they live beside the
// settings as caps/defaults rather than inside them.

/** Species ids in canonical order (also the staggered-tick walk order). */
export const FAUNA_SPECIES = Object.freeze(['birds', 'butterflies', 'dragonflies', 'fish']);

/**
 * Named palette ids per species. The color data lives in faunaBodies.js
 * (keyed by these ids); settings only validate the id so the settings module
 * stays dependency-free like the other *Settings modules.
 */
export const FAUNA_PALETTE_IDS = Object.freeze({
  birds: Object.freeze(['swallow', 'egret', 'finch']),
  butterflies: Object.freeze(['meadow', 'twilight']),
  dragonflies: Object.freeze(['pond', 'ember']),
  fish: Object.freeze(['koi', 'silver']),
});

/** Default population per species when createFauna gets no explicit budget. */
export const DEFAULT_FAUNA_POPULATIONS = Object.freeze({
  birds: 40,
  butterflies: 60,
  dragonflies: 12,
  fish: 80,
});

// Hard caps: the steering tick budget and the per-frame matrix writes scale
// linearly with population, so a runaway host request degrades to the cap
// instead of the frame rate.
export const FAUNA_POPULATION_CAPS = Object.freeze({
  birds: 160,
  butterflies: 240,
  dragonflies: 96,
  fish: 320,
});

/** Clamps `{ birds, butterflies, ... }` counts to integers within the caps. */
export function normalizeFaunaPopulations(species = {}) {
  const source = species && typeof species === 'object' ? species : {};
  const result = {};
  for (const name of FAUNA_SPECIES) {
    const requested = source[name] === undefined
      ? DEFAULT_FAUNA_POPULATIONS[name]
      : Number(source[name]);
    const count = Number.isFinite(requested) ? Math.round(requested) : DEFAULT_FAUNA_POPULATIONS[name];
    result[name] = Math.min(FAUNA_POPULATION_CAPS[name], Math.max(0, count));
  }
  return result;
}

export const DEFAULT_FAUNA_SETTINGS = Object.freeze({
  shared: Object.freeze({
    tickShare: 0.25,
    farDistance: 150,
  }),
  birds: Object.freeze({
    altitudeMin: 7,
    altitudeMax: 26,
    cruiseSpeed: 7,
    maxSpeed: 12,
    neighborRadius: 14,
    separationRadius: 2.6,
    cohesion: 0.9,
    alignment: 0.8,
    separation: 1.3,
    wander: 0.45,
    fleeRadius: 12,
    perchChance: 0.5,
    perchDuration: 11,
    flapHz: 3.4,
    scale: 1,
    palette: 'swallow',
  }),
  butterflies: Object.freeze({
    hoverMin: 0.5,
    hoverMax: 1.7,
    speed: 1.3,
    wanderRadius: 6,
    fleeRadius: 3.5,
    flapHz: 8.5,
    scale: 1,
    palette: 'meadow',
  }),
  dragonflies: Object.freeze({
    hoverHeight: 0.6,
    hoverRadius: 5,
    dartSpeed: 7,
    dartChance: 0.5,
    flapHz: 36,
    scale: 1,
    palette: 'pond',
  }),
  fish: Object.freeze({
    surfaceMargin: 0.3,
    bedMargin: 0.35,
    minSpawnDepth: 1.1,
    cruiseSpeed: 1.5,
    maxSpeed: 3.2,
    neighborRadius: 4,
    separationRadius: 0.8,
    cohesion: 0.9,
    alignment: 0.85,
    separation: 1.1,
    wander: 0.5,
    fleeRadius: 7,
    swayHz: 2.8,
    scale: 1,
    palette: 'koi',
  }),
});

export const FAUNA_SETTING_GROUPS = Object.freeze([
  Object.freeze({
    id: 'shared',
    label: 'Shared',
    description: 'Cross-species simulation budgets: the staggered steering-tick share and the distance beyond which agents degrade to scripted loops.',
  }),
  Object.freeze({
    id: 'birds',
    label: 'Birds',
    description: 'Flocking boids in a roaming altitude band; perch on registered points (or terrain) and flush when the follow target approaches.',
  }),
  Object.freeze({
    id: 'butterflies',
    label: 'Butterflies',
    description: 'Individual noise-wanderers anchored to flower-mask points, hovering just above the terrain.',
  }),
  Object.freeze({
    id: 'dragonflies',
    label: 'Dragonflies',
    description: 'Hover-and-dart flyers anchored to the water margin, holding a fixed height above the water surface.',
  }),
  Object.freeze({
    id: 'fish',
    label: 'Fish',
    description: 'Schooling boids clamped between the water surface and the bed; visible from above through the water refraction pass.',
  }),
]);

const FIELD_DEFINITIONS = Object.freeze({
  shared: Object.freeze({
    tickShare: {
      label: 'Tick Share',
      description: 'Fraction of all agents that receive a full steering tick per update; the rest integrate their last velocity. 0.25 = every agent steers at ~15 Hz on a 60 Hz host.',
      range: { min: 0.05, max: 0.5, step: 0.05 },
    },
    farDistance: {
      label: 'Far Distance',
      description: 'Meters from the follow target beyond which agents stop steering entirely and fly scripted circles (fish keep their depth clamps).',
      range: { min: 40, max: 400, step: 10 },
    },
  }),
  birds: Object.freeze({
    altitudeMin: {
      label: 'Altitude Min',
      description: 'Bottom of the preferred flight band, meters above the local terrain.',
      range: { min: 1, max: 40, step: 0.5 },
    },
    altitudeMax: {
      label: 'Altitude Max',
      description: 'Top of the preferred flight band, meters above the local terrain.',
      range: { min: 2, max: 80, step: 0.5 },
    },
    cruiseSpeed: {
      label: 'Cruise Speed',
      description: 'Relaxed flight speed in m/s; flocks settle around it.',
      range: { min: 1, max: 20, step: 0.5 },
    },
    maxSpeed: {
      label: 'Max Speed',
      description: 'Hard speed cap in m/s, reached when fleeing.',
      range: { min: 2, max: 30, step: 0.5 },
    },
    neighborRadius: {
      label: 'Neighbor Radius',
      description: 'Meters within which flockmates influence cohesion and alignment.',
      range: { min: 2, max: 30, step: 0.5 },
    },
    separationRadius: {
      label: 'Separation Radius',
      description: 'Personal-space radius in meters; closer neighbors are pushed away.',
      range: { min: 0.5, max: 8, step: 0.1 },
    },
    cohesion: {
      label: 'Cohesion',
      description: 'Pull toward the local flock center — the flock-tightness knob.',
      range: { min: 0, max: 2, step: 0.05 },
    },
    alignment: {
      label: 'Alignment',
      description: 'Pull toward the local average heading.',
      range: { min: 0, max: 2, step: 0.05 },
    },
    separation: {
      label: 'Separation',
      description: 'Push away from neighbors inside the separation radius.',
      range: { min: 0, max: 3, step: 0.05 },
    },
    wander: {
      label: 'Wander',
      description: 'Per-bird sinusoidal drift so flocks meander instead of orbiting.',
      range: { min: 0, max: 2, step: 0.05 },
    },
    fleeRadius: {
      label: 'Flee Radius',
      description: 'Meters from the follow target at which flying birds scatter and perched birds flush.',
      range: { min: 0, max: 40, step: 0.5 },
    },
    perchChance: {
      label: 'Perch Chance',
      description: 'Appetite for landing: expected perch attempts scale with this per ~10 s of flight.',
      range: { min: 0, max: 1, step: 0.05 },
    },
    perchDuration: {
      label: 'Perch Duration',
      description: 'Mean seconds a bird stays perched (each stay jitters ±40%).',
      range: { min: 2, max: 40, step: 1 },
    },
    flapHz: {
      label: 'Flap Rate',
      description: 'Wingbeats per second; the GPU flap phase/speed attributes derive from it. Birds glide (near-zero amplitude) when descending.',
      range: { min: 0.5, max: 8, step: 0.1 },
    },
    scale: {
      label: 'Scale',
      description: 'Uniform body scale multiplier (±12% per-bird jitter on top).',
      range: { min: 0.4, max: 2.5, step: 0.05 },
    },
    palette: {
      label: 'Palette',
      description: 'Named body palette; each palette carries 2–4 vertex-colored variants.',
      type: 'select',
      options: FAUNA_PALETTE_IDS.birds,
      optionLabels: { swallow: 'Swallow (indigo/cream/rust)', egret: 'Egret (white/slate)', finch: 'Finch (gold/brown)' },
    },
  }),
  butterflies: Object.freeze({
    hoverMin: {
      label: 'Hover Min',
      description: 'Bottom of the flutter band, meters above the local terrain.',
      range: { min: 0.1, max: 3, step: 0.05 },
    },
    hoverMax: {
      label: 'Hover Max',
      description: 'Top of the flutter band, meters above the local terrain.',
      range: { min: 0.2, max: 5, step: 0.05 },
    },
    speed: {
      label: 'Speed',
      description: 'Typical flutter speed in m/s.',
      range: { min: 0.2, max: 4, step: 0.05 },
    },
    wanderRadius: {
      label: 'Wander Radius',
      description: 'Meters a butterfly may drift from its flower-mask anchor before being pulled back.',
      range: { min: 2, max: 30, step: 0.5 },
    },
    fleeRadius: {
      label: 'Flee Radius',
      description: 'Meters from the follow target at which butterflies scatter upward.',
      range: { min: 0, max: 15, step: 0.25 },
    },
    flapHz: {
      label: 'Flap Rate',
      description: 'Wingbeats per second for the GPU wing fold.',
      range: { min: 2, max: 16, step: 0.25 },
    },
    scale: {
      label: 'Scale',
      description: 'Uniform body scale multiplier (±20% per-agent jitter on top).',
      range: { min: 0.4, max: 2.5, step: 0.05 },
    },
    palette: {
      label: 'Palette',
      description: 'Named wing palette; each palette carries up to 4 vertex-colored variants.',
      type: 'select',
      options: FAUNA_PALETTE_IDS.butterflies,
      optionLabels: { meadow: 'Meadow (monarch/morpho/cabbage/sulphur)', twilight: 'Twilight (violet/teal/moth)' },
    },
  }),
  dragonflies: Object.freeze({
    hoverHeight: {
      label: 'Hover Height',
      description: 'Meters above the water surface dragonflies hold.',
      range: { min: 0.2, max: 3, step: 0.05 },
    },
    hoverRadius: {
      label: 'Hover Radius',
      description: 'Meters of drift allowed around the current hover anchor.',
      range: { min: 1, max: 20, step: 0.5 },
    },
    dartSpeed: {
      label: 'Dart Speed',
      description: 'Straight-line speed in m/s when relocating to a new anchor.',
      range: { min: 1, max: 16, step: 0.5 },
    },
    dartChance: {
      label: 'Dart Chance',
      description: 'Appetite for relocating: expected darts scale with this per ~8 s of hovering.',
      range: { min: 0, max: 1, step: 0.05 },
    },
    flapHz: {
      label: 'Flap Rate',
      description: 'Wing oscillations per second; high rates read as the classic wing shimmer.',
      range: { min: 10, max: 60, step: 1 },
    },
    scale: {
      label: 'Scale',
      description: 'Uniform body scale multiplier.',
      range: { min: 0.4, max: 2.5, step: 0.05 },
    },
    palette: {
      label: 'Palette',
      description: 'Named body palette; each palette carries 2–3 vertex-colored variants.',
      type: 'select',
      options: FAUNA_PALETTE_IDS.dragonflies,
      optionLabels: { pond: 'Pond (crimson/cyan/jade)', ember: 'Ember (scarlet/amber)' },
    },
  }),
  fish: Object.freeze({
    surfaceMargin: {
      label: 'Surface Margin',
      description: 'Minimum meters a fish stays below the water surface (never breaches).',
      range: { min: 0.1, max: 2, step: 0.05 },
    },
    bedMargin: {
      label: 'Bed Margin',
      description: 'Minimum meters a fish stays above the terrain bed.',
      range: { min: 0.1, max: 2, step: 0.05 },
    },
    minSpawnDepth: {
      label: 'Min Spawn Depth',
      description: 'Meters of water column required for a fish spawn point; shallower bounds simply hold fewer fish.',
      range: { min: 0.3, max: 5, step: 0.1 },
    },
    cruiseSpeed: {
      label: 'Cruise Speed',
      description: 'Relaxed swim speed in m/s.',
      range: { min: 0.2, max: 5, step: 0.1 },
    },
    maxSpeed: {
      label: 'Max Speed',
      description: 'Hard speed cap in m/s, reached when fleeing.',
      range: { min: 0.5, max: 8, step: 0.1 },
    },
    neighborRadius: {
      label: 'Neighbor Radius',
      description: 'Meters within which schoolmates influence cohesion and alignment.',
      range: { min: 1, max: 12, step: 0.25 },
    },
    separationRadius: {
      label: 'Separation Radius',
      description: 'Personal-space radius in meters.',
      range: { min: 0.2, max: 4, step: 0.05 },
    },
    cohesion: {
      label: 'Cohesion',
      description: 'Pull toward the local school center — schooling tightness.',
      range: { min: 0, max: 2, step: 0.05 },
    },
    alignment: {
      label: 'Alignment',
      description: 'Pull toward the local average heading.',
      range: { min: 0, max: 2, step: 0.05 },
    },
    separation: {
      label: 'Separation',
      description: 'Push away from neighbors inside the separation radius.',
      range: { min: 0, max: 3, step: 0.05 },
    },
    wander: {
      label: 'Wander',
      description: 'Per-fish sinusoidal drift so schools roam the basin.',
      range: { min: 0, max: 2, step: 0.05 },
    },
    fleeRadius: {
      label: 'Flee Radius',
      description: 'Meters from the follow target (a swimmer, a bridge walker) at which fish scatter.',
      range: { min: 0, max: 25, step: 0.5 },
    },
    swayHz: {
      label: 'Sway Rate',
      description: 'Tail-sway cycles per second for the GPU body flex.',
      range: { min: 0.5, max: 8, step: 0.1 },
    },
    scale: {
      label: 'Scale',
      description: 'Uniform body scale multiplier (±25% per-fish jitter on top).',
      range: { min: 0.3, max: 3, step: 0.05 },
    },
    palette: {
      label: 'Palette',
      description: 'Named body palette: koi for ponds and lakes, silver for open water.',
      type: 'select',
      options: FAUNA_PALETTE_IDS.fish,
      optionLabels: { koi: 'Koi (kohaku/gold/asagi)', silver: 'Silver shoal' },
    },
  }),
});

function createFaunaFieldMetadata(group, key, field) {
  const defaultValue = DEFAULT_FAUNA_SETTINGS[group.id][key];
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
    type: field.type ?? (typeof defaultValue === 'boolean' ? 'boolean'
      : typeof defaultValue === 'number' ? 'number' : 'text'),
  });
}

export const FAUNA_SETTING_FIELD_SCHEMA = Object.freeze(
  Object.fromEntries(
    FAUNA_SETTING_GROUPS.map((group) => [
      group.id,
      Object.freeze(
        Object.fromEntries(
          Object.entries(FIELD_DEFINITIONS[group.id] ?? {})
            .map(([key, field]) => [key, createFaunaFieldMetadata(group, key, field)]),
        ),
      ),
    ]),
  ),
);

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, cloneValue(entry)]),
  );
  return value;
}

export function cloneFaunaSettings(settings = DEFAULT_FAUNA_SETTINGS) {
  return cloneValue(settings);
}

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

/** Normalizes partial grouped overrides over the defaults; unknown keys are dropped. */
export function createFaunaSettings(overrides = {}) {
  const result = cloneFaunaSettings(DEFAULT_FAUNA_SETTINGS);
  for (const groupId of Object.keys(result)) {
    const group = overrides?.[groupId];
    if (!group || typeof group !== 'object') continue;
    for (const key of Object.keys(result[groupId])) {
      if (group[key] === undefined) continue;
      result[groupId][key] = cloneValue(group[key]);
    }
  }
  // Clamp using each field's declared range so panel metadata and runtime
  // agree, then repair the few cross-field invariants the schema can't state.
  for (const group of FAUNA_SETTING_GROUPS) {
    const fields = FAUNA_SETTING_FIELD_SCHEMA[group.id];
    const values = result[group.id];
    for (const [key, field] of Object.entries(fields)) {
      if (field.type === 'number' && field.range) {
        values[key] = clampNumber(values[key], field.defaultValue, field.range.min, field.range.max);
      } else if (field.type === 'select') {
        if (!field.options.includes(values[key])) values[key] = field.defaultValue;
      }
    }
  }
  const birds = result.birds;
  if (birds.altitudeMax < birds.altitudeMin) birds.altitudeMax = birds.altitudeMin;
  if (birds.maxSpeed < birds.cruiseSpeed) birds.maxSpeed = birds.cruiseSpeed;
  const butterflies = result.butterflies;
  if (butterflies.hoverMax < butterflies.hoverMin) butterflies.hoverMax = butterflies.hoverMin;
  const fish = result.fish;
  if (fish.maxSpeed < fish.cruiseSpeed) fish.maxSpeed = fish.cruiseSpeed;
  if (fish.minSpawnDepth < fish.surfaceMargin + fish.bedMargin) {
    fish.minSpawnDepth = fish.surfaceMargin + fish.bedMargin;
  }
  return result;
}

export const FAUNA_RECIPE_SCHEMA = 'faunaRecipe';
export const FAUNA_RECIPE_VERSION = 1;

/**
 * Serializable recipe: everything needed to rebuild the identical population
 * given the same terrain (`heightAt` itself is the host's, not serialized).
 */
export function createFaunaRecipeDocument({ seed = 1, species = {}, settings = {} } = {}) {
  return {
    schema: FAUNA_RECIPE_SCHEMA,
    seed: Math.round(Number(seed) || 1),
    settings: createFaunaSettings(settings),
    species: normalizeFaunaPopulations(species),
    version: FAUNA_RECIPE_VERSION,
  };
}

export function validateFaunaRecipeDocument(input) {
  const errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { errors: ['Recipe document must be an object.'], ok: false };
  }
  if (input.schema !== FAUNA_RECIPE_SCHEMA) errors.push(`schema must be "${FAUNA_RECIPE_SCHEMA}".`);
  if (!Number.isInteger(input.version) || input.version < 1 || input.version > FAUNA_RECIPE_VERSION) {
    errors.push(`version must be an integer between 1 and ${FAUNA_RECIPE_VERSION}.`);
  }
  if (!Number.isFinite(Number(input.seed))) errors.push('seed must be a number.');
  if (input.species !== undefined && (typeof input.species !== 'object' || input.species === null)) {
    errors.push('species must be an object when present.');
  }
  return { errors, ok: errors.length === 0 };
}
