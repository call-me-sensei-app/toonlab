import { createDebrisSettings } from './debrisSettings.js';

const DEBRIS_STYLES = new Map([
  ['default', Object.freeze({
    description: 'Debris presets exactly as authored.',
    label: 'Default',
    surface: Object.freeze({}),
  })],
  ['call_me_sensei', Object.freeze({
    description: 'Studio-managed signature debris rendition applied across every debris preset.',
    label: 'Call Me Sensei',
    surface: Object.freeze({
      edgeLight: 0.34,
      roughness: 0.88,
      toonContrast: 0.68,
      variation: 0.2,
    }),
  })],
]);

export function resolveDebrisStyleName(name) {
  const id = String(name ?? 'default').trim();
  return DEBRIS_STYLES.has(id) ? id : 'default';
}

export function getDebrisStyleOptions() {
  return Array.from(DEBRIS_STYLES.entries()).map(([id, style]) => ({
    description: style.description,
    id,
    label: style.label,
  }));
}

/** Applies one IP style over any built-in, local, or ad-hoc debris preset. */
export function applyDebrisStyle(settings, style = 'default') {
  const base = createDebrisSettings(settings);
  const rendition = DEBRIS_STYLES.get(resolveDebrisStyleName(style));
  return createDebrisSettings({
    ...base,
    surface: { ...base.surface, ...rendition.surface },
  });
}

function debrisValuesEqual(left, right) {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => debrisValuesEqual(value, right[index]));
  }
  if (left && right && typeof left === 'object' && typeof right === 'object') {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    return leftKeys.length === rightKeys.length
      && leftKeys.every((key) => Object.hasOwn(right, key)
        && debrisValuesEqual(left[key], right[key]));
  }
  return false;
}

function rebaseDebrisValue(current, oldBase, newBase) {
  if (debrisValuesEqual(current, oldBase)) return structuredClone(newBase);
  if (Array.isArray(current)) return structuredClone(current);
  if (current && typeof current === 'object'
    && oldBase && typeof oldBase === 'object'
    && newBase && typeof newBase === 'object') {
    return Object.fromEntries(Object.keys(current).map((key) => [
      key,
      Object.hasOwn(oldBase, key) && Object.hasOwn(newBase, key)
        ? rebaseDebrisValue(current[key], oldBase[key], newBase[key])
        : structuredClone(current[key]),
    ]));
  }
  return structuredClone(current);
}

/** Re-style debris without replacing its asset recipe or authored edits. */
export function rebaseDebrisSettingsStyle(settings, {
  baseSettings = createDebrisSettings(),
  fromStyle = 'default',
  toStyle = 'default',
} = {}) {
  const current = createDebrisSettings(settings);
  const base = createDebrisSettings(baseSettings);
  const oldBase = applyDebrisStyle(base, fromStyle);
  const newBase = applyDebrisStyle(base, toStyle);
  return createDebrisSettings(rebaseDebrisValue(current, oldBase, newBase));
}

function preset(id, label, type, variant, description, overrides = {}) {
  return Object.freeze({
    description,
    id,
    label,
    settings: createDebrisSettings({
      ...overrides,
      asset: { ...(overrides.asset ?? {}), type, variant },
    }),
    type,
    variant,
  });
}

export const BUILT_IN_DEBRIS_PRESETS = Object.freeze([
  preset('bleached-driftwood', 'Bleached driftwood', 'wood', 'driftwood', 'Salt-worn pale wood with broken fibers.', {
    asset: { count: 1, seed: 7301, spread: 0 },
    shape: { branchiness: 0.38, crookedness: 0.86, length: 3.05, splinters: 0.8, thickness: 0.23 },
    surface: { accentColor: [0.52, 0.39, 0.25], primaryColor: [0.52, 0.43, 0.31], secondaryColor: [0.78, 0.68, 0.5], variation: 0.24 },
  }),
  preset('forest-branch', 'Forest branch', 'wood', 'branch', 'Bark-dark fallen limb with secondary twigs.', {
    asset: { count: 1, seed: 4407, spread: 0 },
    shape: { branchiness: 0.74, crookedness: 0.5, length: 3.2, splinters: 0.38, thickness: 0.25 },
    surface: { accentColor: [0.38, 0.16, 0.045], primaryColor: [0.12, 0.055, 0.018], secondaryColor: [0.28, 0.13, 0.045], variation: 0.16 },
  }),
  preset('dry-twig-pile', 'Dry twig pile', 'wood', 'twigPile', 'A light scatter of snapped dry sticks.', {
    asset: { count: 12, seed: 991, spread: 1.25 },
    shape: { branchiness: 0.18, crookedness: 0.58, length: 0.92, splinters: 0.62, thickness: 0.055 },
    surface: { accentColor: [0.42, 0.2, 0.07], primaryColor: [0.16, 0.07, 0.02], secondaryColor: [0.35, 0.17, 0.055] },
  }),
  preset('weathered-leg-bones', 'Weathered long bones', 'bone', 'longBone', 'Sun-bleached animal bones with enlarged joints.', {
    asset: { count: 5, seed: 2204, spread: 1.35 },
    shape: { curvature: 0.24, damage: 0.48, jointSize: 1.32, length: 1.18, thickness: 0.1 },
  }),
  preset('small-animal-skull', 'Small animal skull', 'bone', 'skull', 'Stylized cranium, sockets, snout, and broken jaw.', {
    asset: { count: 1, seed: 8764, spread: 0 },
    shape: { curvature: 0.2, damage: 0.62, jointSize: 1.08, length: 1.4, thickness: 0.16 },
  }),
  preset('herbivore-jaw', 'Herbivore jaw bones', 'bone', 'jawBone', 'Half jaws with molar rows and a bare diastema.', {
    asset: { count: 3, seed: 4152, spread: 1.05 },
    shape: { curvature: 0.4, damage: 0.35, jointSize: 1.1, length: 1.5, thickness: 0.11 },
  }),
  preset('shed-antlers', 'Shed antlers', 'bone', 'antler', 'Curving antler beams with forked tines.', {
    asset: { count: 2, seed: 6108, spread: 1.1 },
    shape: { curvature: 0.76, damage: 0.22, jointSize: 0.92, length: 1.85, thickness: 0.095 },
  }),
  preset('concrete-rubble', 'Concrete rubble', 'stone', 'rubble', 'Angular construction chunks with dusty variation.', {
    asset: { count: 13, seed: 3041, spread: 1.55 },
    shape: { brickRatio: 0.12, chunkSize: 0.48, detail: 0.72, sharpness: 0.8, stacking: 0.45 },
  }),
  preset('broken-red-bricks', 'Broken red bricks', 'stone', 'bricks', 'Recognizable brick fragments mixed with chips.', {
    asset: { count: 11, seed: 8211, spread: 1.45 },
    shape: { brickRatio: 0.92, chunkSize: 0.52, detail: 0.7, sharpness: 0.92, stacking: 0.42 },
    surface: { accentColor: [0.32, 0.19, 0.14], primaryColor: [0.45, 0.18, 0.11], secondaryColor: [0.68, 0.31, 0.18] },
  }),
  preset('slate-shards', 'Slate shards', 'stone', 'shards', 'Thin sharp fragments with cool stone tones.', {
    asset: { count: 17, seed: 1517, spread: 1.6 },
    shape: { brickRatio: 0, chunkSize: 0.38, detail: 0.86, sharpness: 0.95, stacking: 0.28 },
    surface: { accentColor: [0.2, 0.25, 0.26], primaryColor: [0.12, 0.16, 0.18], secondaryColor: [0.3, 0.36, 0.38] },
  }),
  preset('shattered-planks', 'Shattered planks', 'wood', 'planks', 'Snapped weathered boards with knotholes and warp.', {
    asset: { count: 7, seed: 5217, spread: 1.4 },
    shape: { branchiness: 0.6, crookedness: 0.55, length: 2.4, splinters: 0.7, thickness: 0.14 },
    surface: { accentColor: [0.3, 0.24, 0.16], primaryColor: [0.42, 0.33, 0.22], secondaryColor: [0.6, 0.5, 0.35] },
  }),
  preset('firewood-logs', 'Firewood logs', 'wood', 'logs', 'Short sawn logs with pale cut ends and branch stubs.', {
    asset: { count: 6, seed: 883, spread: 1.1 },
    shape: { branchiness: 0.5, crookedness: 0.35, length: 1.6, splinters: 0.2, thickness: 0.18 },
  }),
  preset('gathered-sticks', 'Gathered stick bundle', 'wood', 'twigPile', 'A tied-together bunch of dry sticks.', {
    asset: { arrangement: 'bundle', count: 14, messiness: 0.35, seed: 4471, spread: 0.5 },
    shape: { branchiness: 0.12, crookedness: 0.4, kinks: 0.35, length: 1.3, splinters: 0.5, thickness: 0.05 },
  }),
  preset('dead-root-stump', 'Dead root stump', 'wood', 'rootStump', 'Weathered root ball with twisting dead roots.', {
    asset: { count: 1, seed: 9925, spread: 0 },
    shape: { barkStripped: 0.75, branchiness: 0.7, crookedness: 0.8, kinks: 0.55, length: 2.2, splinters: 0.3, thickness: 0.14 },
    surface: { accentColor: [0.72, 0.65, 0.52], primaryColor: [0.3, 0.24, 0.17], secondaryColor: [0.52, 0.45, 0.34] },
  }),
  preset('bark-chip-litter', 'Bark chip litter', 'wood', 'barkChips', 'Curled bark flakes, dark outside and pale inside.', {
    asset: { arrangement: 'patch', count: 20, seed: 2210, spread: 1.5 },
    shape: { length: 1.4, thickness: 0.12 },
  }),
  preset('log-pile', 'Log pile', 'wood', 'logs', 'Firewood heaped into a loose stack.', {
    asset: { arrangement: 'heap', count: 9, messiness: 0.4, seed: 5150, spread: 1.3 },
    shape: { branchiness: 0.4, crookedness: 0.3, length: 1.5, splinters: 0.2, thickness: 0.17 },
  }),
  preset('sawdust-heap', 'Sawdust heap', 'ash', 'sawdust', 'Fresh pale sawdust with embedded slivers.', {
    asset: { count: 8, seed: 7302, spread: 0.55 },
    shape: { charcoal: 0.3, embers: 0, footprint: 1.2, moundHeight: 0.34, rim: 0.15 },
    surface: { accentColor: [0.55, 0.4, 0.24], primaryColor: [0.58, 0.47, 0.32], secondaryColor: [0.78, 0.66, 0.47] },
  }),
  preset('river-pebbles', 'River pebbles', 'stone', 'riverstones', 'Smooth flat skipping stones in cool greys.', {
    asset: { count: 15, seed: 3320, spread: 1.35 },
    shape: { banding: 0.3, chunkSize: 0.26, detail: 0.35, flatness: 0.7, sharpness: 0.1 },
  }),
  preset('obsidian-shards', 'Obsidian shards', 'stone', 'obsidian', 'Glassy tapered fragments with conchoidal ridges.', {
    asset: { count: 9, seed: 6644, spread: 1.2 },
    shape: { banding: 0.7, chunkSize: 0.3, detail: 0.55, flatness: 0.25, sharpness: 0.85 },
    surface: { accentColor: [0.16, 0.13, 0.22], primaryColor: [0.05, 0.05, 0.07], secondaryColor: [0.18, 0.19, 0.24] },
  }),
  preset('meteorite-fall', 'Meteorite fall', 'stone', 'meteor', 'Cratered pitted stones with a scorched crust.', {
    asset: { count: 5, seed: 7811, spread: 1.3 },
    shape: { banding: 0.1, chunkSize: 0.42, detail: 0.8, flatness: 0.15, sharpness: 0.2 },
    surface: { accentColor: [0.45, 0.2, 0.08], primaryColor: [0.1, 0.09, 0.09], secondaryColor: [0.24, 0.21, 0.19] },
  }),
  preset('rough-gems', 'Rough gems', 'stone', 'gems', 'Faceted uncut crystals with beveled edges.', {
    asset: { count: 8, seed: 1092, spread: 1.05 },
    shape: { banding: 0.5, chunkSize: 0.2, detail: 0.15, flatness: 0.1, sharpness: 0.75 },
    surface: { accentColor: [0.16, 0.5, 0.55], primaryColor: [0.1, 0.26, 0.36], secondaryColor: [0.36, 0.68, 0.72] },
  }),
  preset('rusted-sheet-metal', 'Rusted sheet metal', 'metal', 'sheets', 'Bent, corrugated sheets with oxidized edges.', {
    asset: { count: 5, seed: 5604, spread: 1.35 },
    shape: { bend: 0.82, corrugation: 0.62, rust: 0.82, sheetSize: 1.05, wireChance: 0.08 },
  }),
  preset('crushed-cans', 'Crushed cans', 'metal', 'cans', 'Low-sided dented cans scattered on the ground.', {
    asset: { count: 9, seed: 773, spread: 1.45 },
    shape: { bend: 0.74, corrugation: 0.16, rust: 0.34, sheetSize: 0.48, wireChance: 0 },
    surface: { accentColor: [0.8, 0.25, 0.07], primaryColor: [0.3, 0.42, 0.45], secondaryColor: [0.7, 0.78, 0.74] },
  }),
  preset('workshop-scrap', 'Workshop scrap', 'metal', 'scrapPile', 'Mixed plates, pipes, cans, and curled wire.', {
    asset: { count: 12, seed: 4690, spread: 1.5 },
    shape: { bend: 0.66, corrugation: 0.28, rust: 0.7, sheetSize: 0.62, wireChance: 0.62 },
  }),
  preset('autumn-leaf-litter', 'Autumn leaf litter', 'organic', 'leafLitter', 'A broad scatter of curled dry leaves.', {
    asset: { count: 28, seed: 9318, spread: 1.8 },
    shape: { coneRatio: 0.12, coverage: 1.45, curl: 0.66, dryness: 0.9, leafSize: 0.22 },
  }),
  preset('forest-pinecones', 'Forest pinecones', 'organic', 'pinecones', 'Layered cones with a few needles and husks.', {
    asset: { count: 10, seed: 3008, spread: 1.4 },
    shape: { coneRatio: 0.9, coverage: 0.85, curl: 0.24, dryness: 0.68, leafSize: 0.38 },
  }),
  preset('shoreline-shells', 'Shoreline shells', 'organic', 'shells', 'Fan shells and worn spiral fragments.', {
    asset: { count: 13, seed: 1182, spread: 1.55 },
    shape: { coneRatio: 0.45, coverage: 0.92, curl: 0.4, dryness: 0.5, leafSize: 0.3 },
    surface: { accentColor: [0.79, 0.46, 0.39], primaryColor: [0.68, 0.58, 0.48], secondaryColor: [0.92, 0.81, 0.67] },
  }),
  preset('cold-ash-pile', 'Cold ash pile', 'ash', 'ashPile', 'A soft grey mound with scattered black remains.', {
    asset: { count: 14, seed: 6721, spread: 0.65 },
    shape: { charcoal: 0.38, embers: 0, footprint: 1.5, moundHeight: 0.32, rim: 0.36 },
  }),
  preset('spent-campfire', 'Spent campfire', 'ash', 'campfire', 'Charred crossed wood, ash, and a faint ember accent.', {
    asset: { count: 10, seed: 2026, spread: 0.5 },
    shape: { charcoal: 0.76, embers: 0.18, footprint: 1.65, moundHeight: 0.24, rim: 0.68 },
  }),
  preset('charcoal-scatter', 'Charcoal scatter', 'ash', 'charcoal', 'Cracked black fuel pieces and powder.', {
    asset: { count: 18, seed: 8146, spread: 1.15 },
    shape: { charcoal: 0.94, embers: 0.04, footprint: 1.25, moundHeight: 0.12, rim: 0.2 },
  }),
]);

export function findDebrisPreset(id) {
  return BUILT_IN_DEBRIS_PRESETS.find((entry) => entry.id === id) ?? null;
}
