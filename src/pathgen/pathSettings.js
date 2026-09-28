// Canonical settings and field metadata for the path/road/bridge generator.
// Follows the library-wide convention: DEFAULT_PATH_SETTINGS holds the
// grouped values, PATH_SETTING_GROUPS + PATH_SETTING_FIELD_SCHEMA drive the
// debug panel and the generated settings reference, and the recipe document
// ({ schema, version, seed, routes, auto, settings }) rebuilds the identical
// network forever.

export const PATH_STYLES = Object.freeze([
  Object.freeze({ id: 'dirt', label: 'Dirt' }),
  Object.freeze({ id: 'stone', label: 'Stone' }),
  Object.freeze({ id: 'planks', label: 'Planks' }),
]);

export const PATH_STYLE_IDS = Object.freeze(PATH_STYLES.map((entry) => entry.id));

export const DEFAULT_PATH_SETTINGS = Object.freeze({
  routing: Object.freeze({
    pointCount: 4,
    slopeCost: 26,
    waterCost: 14,
    reuseBonus: 0.45,
    gridStep: 8,
    shoreMargin: 0.6,
    loopChance: 0.35,
  }),
  ribbon: Object.freeze({
    width: 2.6,
    widthWobble: 0.22,
    edgeSkirt: 1.1,
    lift: 0.07,
    smoothing: 16,
    stepLength: 2,
    edgeFade: 1.4,
  }),
  bridge: Object.freeze({
    arc: 0.1,
    railStyle: 'posts',
    postSpacing: 2.2,
    minSpan: 4,
    pierSpacing: 7,
    deckClearance: 1.1,
  }),
  stairs: Object.freeze({
    slopeThreshold: 0.45,
    stepHeight: 0.19,
  }),
});

export const PATH_SETTING_GROUPS = Object.freeze([
  Object.freeze({
    id: 'routing',
    label: 'Routing',
    description: 'Cost-field router: how strongly slope and water repel routes, and how much existing paths attract reuse (forks and junctions).',
  }),
  Object.freeze({
    id: 'ribbon',
    label: 'Ribbon',
    description: 'The walkable strip: width, hand-drawn wobble, edge skirts that tuck into the terrain, and the height-profile smoothing that flattens the walk.',
  }),
  Object.freeze({
    id: 'bridge',
    label: 'Bridges',
    description: 'Arched plank bridges generated where a route crosses open water.',
  }),
  Object.freeze({
    id: 'stairs',
    label: 'Stairs',
    description: 'Stepped stone segments swapped in where the route climbs steeply. Visual only — paths.heightAt stays a smooth ramp.',
  }),
]);

const FIELD_DEFINITIONS = Object.freeze({
  routing: Object.freeze({
    pointCount: {
      label: 'Points of Interest',
      description: 'Auto mode: number of destinations probed from the terrain and connected into a network.',
      range: { min: 2, max: 8, step: 1 },
    },
    slopeCost: {
      label: 'Slope Cost',
      description: 'How expensive climbing is for the router. Higher values hug contours and produce switchbacks instead of straight climbs.',
      range: { min: 0, max: 80, step: 1 },
    },
    waterCost: {
      label: 'Water Cost',
      description: 'Cost multiplier for crossing water. High enough that routes only cross where a bridge is worth it, low enough that crossings still happen.',
      range: { min: 2, max: 60, step: 1 },
    },
    reuseBonus: {
      label: 'Reuse Bonus',
      description: 'Cost discount (0..1) on cells an earlier route already walks — the source of natural forks and shared trunk roads.',
      range: { min: 0, max: 0.9, step: 0.05 },
    },
    gridStep: {
      label: 'Grid Step',
      description: 'Router grid resolution in meters. Smaller steps find finer detours and cost more to solve.',
      range: { min: 3, max: 24, step: 1 },
    },
    shoreMargin: {
      label: 'Shore Margin',
      description: 'Meters above the waterline a cell must be to count as dry land.',
      range: { min: 0, max: 2, step: 0.1 },
    },
    loopChance: {
      label: 'Loop Chance',
      description: 'Auto mode: chance to add one extra ring road beyond the spanning network.',
      range: { min: 0, max: 1, step: 0.05 },
    },
  }),
  ribbon: Object.freeze({
    width: {
      label: 'Width',
      description: 'Walkable ribbon width in meters (dirt trail 2–3, stone road 3–4).',
      range: { min: 1, max: 6, step: 0.1 },
    },
    widthWobble: {
      label: 'Width Wobble',
      description: 'Low-frequency width variation (0..1) for the hand-drawn look. 0 is a survey-straight road.',
      range: { min: 0, max: 0.6, step: 0.02 },
    },
    edgeSkirt: {
      label: 'Edge Skirt',
      description: 'Extra meters each side that slope down and tuck under the terrain so the ribbon never floats on side slopes.',
      range: { min: 0.2, max: 2.5, step: 0.05 },
    },
    lift: {
      label: 'Lift',
      description: 'Meters the ribbon rides above the height profile — the true-overlay offset that prevents z-fighting.',
      range: { min: 0.02, max: 0.25, step: 0.01 },
    },
    smoothing: {
      label: 'Profile Smoothing',
      description: 'Moving-average window in meters applied to the terrain height along the route; the flattened profile is what paths.heightAt reports.',
      range: { min: 0, max: 40, step: 1 },
    },
    stepLength: {
      label: 'Step Length',
      description: 'Meters between ribbon cross-sections. Smaller steps follow curves tighter and spend more triangles.',
      range: { min: 1, max: 5, step: 0.25 },
    },
    edgeFade: {
      label: 'Edge Fade',
      description: 'Meters past the ribbon edge over which maskAt falls from 1 to 0 — the band where grass and flowers thin out.',
      range: { min: 0.2, max: 4, step: 0.1 },
    },
  }),
  bridge: Object.freeze({
    arc: {
      label: 'Arch',
      description: 'Deck rise as a fraction of span length. 0 is a flat causeway, 0.14 a strong arched footbridge.',
      range: { min: 0, max: 0.18, step: 0.01 },
    },
    railStyle: {
      label: 'Rail Style',
      description: 'Bridge railing construction.',
      type: 'select',
      options: ['posts', 'beams', 'none'],
      optionLabels: { posts: 'Posts + top rail', beams: 'Posts + double beams', none: 'No rails' },
    },
    postSpacing: {
      label: 'Post Spacing',
      description: 'Meters between railing posts.',
      range: { min: 1.2, max: 4, step: 0.1 },
    },
    minSpan: {
      label: 'Minimum Span',
      description: 'Meters of open water a route must cross before a bridge is generated (shorter crossings ford instead).',
      range: { min: 2, max: 12, step: 0.5 },
    },
    pierSpacing: {
      label: 'Pier Spacing',
      description: 'Long crossings get support piers to the bed every this many meters.',
      range: { min: 4, max: 16, step: 0.5 },
    },
    deckClearance: {
      label: 'Deck Clearance',
      description: 'Minimum meters between the water level and the deck at mid-span.',
      range: { min: 0.3, max: 3, step: 0.1 },
    },
  }),
  stairs: Object.freeze({
    slopeThreshold: {
      label: 'Slope Threshold',
      description: 'Rise-over-run along the route beyond which the ribbon switches to stepped stone segments.',
      range: { min: 0.2, max: 0.9, step: 0.05 },
    },
    stepHeight: {
      label: 'Step Height',
      description: 'Riser height of generated steps in meters.',
      range: { min: 0.12, max: 0.3, step: 0.01 },
    },
  }),
});

function createPathFieldMetadata(group, key, field) {
  const defaultValue = DEFAULT_PATH_SETTINGS[group.id][key];
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

export const PATH_SETTING_FIELD_SCHEMA = Object.freeze(
  Object.fromEntries(
    PATH_SETTING_GROUPS.map((group) => [
      group.id,
      Object.freeze(
        Object.fromEntries(
          Object.entries(FIELD_DEFINITIONS[group.id] ?? {})
            .map(([key, field]) => [key, createPathFieldMetadata(group, key, field)]),
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

export function clonePathSettings(settings = DEFAULT_PATH_SETTINGS) {
  return cloneValue(settings);
}

/** Normalizes partial overrides over the defaults; unknown keys are dropped. */
export function createPathSettings(overrides = {}) {
  const result = clonePathSettings(DEFAULT_PATH_SETTINGS);
  for (const groupId of Object.keys(result)) {
    const group = overrides?.[groupId];
    if (!group || typeof group !== 'object') continue;
    for (const key of Object.keys(result[groupId])) {
      if (group[key] === undefined) continue;
      result[groupId][key] = cloneValue(group[key]);
    }
  }
  const routing = result.routing;
  routing.pointCount = Math.min(12, Math.max(2, Math.round(Number(routing.pointCount) || 4)));
  routing.gridStep = Math.min(32, Math.max(2, Number(routing.gridStep) || 8));
  const ribbon = result.ribbon;
  ribbon.width = Math.min(8, Math.max(0.8, Number(ribbon.width) || 2.6));
  ribbon.stepLength = Math.min(6, Math.max(0.75, Number(ribbon.stepLength) || 2));
  if (!['posts', 'beams', 'none'].includes(result.bridge.railStyle)) {
    result.bridge.railStyle = 'posts';
  }
  return result;
}

export const PATH_RECIPE_SCHEMA = 'pathRecipe';
export const PATH_RECIPE_VERSION = 1;

/**
 * Normalizes a route spec: either `{ from: [x, z], to: [x, z], style }`
 * (cost-field routed) or `{ points: [[x, z], …], style }` (explicit
 * centerline — village streets want exact control, not a router's opinion).
 */
export function normalizeRouteSpec(route) {
  const point = (value) => (Array.isArray(value) && value.length >= 2
    ? [Number(value[0]) || 0, Number(value[1]) || 0]
    : null);
  const style = PATH_STYLE_IDS.includes(route?.style) ? route.style : 'dirt';
  if (Array.isArray(route?.points)) {
    const points = route.points.map(point).filter(Boolean);
    if (points.length < 2) return null;
    return { points, style, wander: route.wander !== false };
  }
  const from = point(route?.from);
  const to = point(route?.to);
  if (!from || !to) return null;
  return { from, style, to };
}

/**
 * Serializable recipe: everything needed to rebuild the identical network
 * given the same terrain (`heightAt` itself is the host's, not serialized).
 */
export function createPathRecipeDocument({ seed = 1, routes = null, auto = null, settings = {} } = {}) {
  const document = {
    schema: PATH_RECIPE_SCHEMA,
    seed: Math.round(Number(seed) || 1),
    settings: createPathSettings(settings),
    version: PATH_RECIPE_VERSION,
  };
  if (Array.isArray(routes) && routes.length > 0) {
    document.routes = routes.map(normalizeRouteSpec).filter(Boolean);
  }
  if (auto && typeof auto === 'object') {
    document.auto = {
      count: Math.min(12, Math.max(2, Math.round(Number(auto.count) || 4))),
      styles: Array.isArray(auto.styles) && auto.styles.length > 0
        ? auto.styles.filter((style) => PATH_STYLE_IDS.includes(style))
        : ['dirt'],
    };
    if (document.auto.styles.length === 0) document.auto.styles = ['dirt'];
  }
  return document;
}

export function validatePathRecipeDocument(input) {
  const errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { errors: ['Recipe document must be an object.'], ok: false };
  }
  if (input.schema !== PATH_RECIPE_SCHEMA) errors.push(`schema must be "${PATH_RECIPE_SCHEMA}".`);
  if (!Number.isInteger(input.version) || input.version < 1 || input.version > PATH_RECIPE_VERSION) {
    errors.push(`version must be an integer between 1 and ${PATH_RECIPE_VERSION}.`);
  }
  if (!Number.isFinite(Number(input.seed))) errors.push('seed must be a number.');
  if (input.routes !== undefined) {
    if (!Array.isArray(input.routes)) errors.push('routes must be an array when present.');
    else if (input.routes.some((route) => !normalizeRouteSpec(route))) {
      errors.push('every route needs { from: [x, z], to: [x, z] }.');
    }
  }
  if (input.auto !== undefined && (typeof input.auto !== 'object' || input.auto === null)) {
    errors.push('auto must be an object when present.');
  }
  if (!input.routes?.length && !input.auto) {
    errors.push('recipe needs routes, auto, or both.');
  }
  return { errors, ok: errors.length === 0 };
}
