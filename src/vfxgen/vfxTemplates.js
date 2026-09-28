// Intent taxonomy and guided VFX Effect template registry.
//
// Templates create complete portable effect documents. The public metadata
// never exposes executable factories; runtime compilation returns a plain,
// immutable-ready definition consumed by createVfxSystem.

import { cloneSerializable } from '../core/generation.js';
import {
  createVfxEffectDocument,
  getVfxEffectParameterValues,
  validateVfxEffectDocument,
} from './vfxEffectDocuments.js';
import {
  DEFAULT_VFX_ENERGY_MOTION_THEME_ID,
  VFX_ENERGY_MOTION_DIRECTIONS,
  VFX_ENERGY_MOTION_CUSTOM_THEME_ID,
  VFX_ENERGY_MOTION_THEMES,
} from './vfxEnergyMotion.js';
import { resolveVfxStyle } from './vfxPresets.js';
import { DEFAULT_VFX_SILHOUETTE_PROFILE } from './vfxShapeProfiles.js';

const plain = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const cleanId = (value) => String(value ?? '').trim().replace(/[^a-zA-Z0-9._/-]+/g, '_');

function slug(label) {
  return String(label).trim().toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function intentGroup(id, label, entries) {
  return Object.freeze({
    id,
    label,
    entries: Object.freeze(entries.map((entry) => Object.freeze({
      id: typeof entry === 'string' ? slug(entry) : entry.id,
      label: typeof entry === 'string' ? entry : entry.label,
      status: typeof entry === 'string' ? 'planned' : (entry.status ?? 'planned'),
    }))),
  });
}

/** Complete initial intent catalog. Status reports implementation truth. */
export const VFX_INTENT_TAXONOMY = Object.freeze([
  intentGroup('combat-ranged', 'Combat · Ranged', [
    'Basic projectile', { id: 'charged-projectile', label: 'Charged projectile', status: 'available' },
    'Piercing projectile', 'Homing projectile', 'Ricocheting projectile',
    'Bouncing projectile', 'Lobbed projectile', 'Missile or rocket', 'Grenade',
    'Shotgun spread', 'Hitscan tracer', 'Sniper trail', 'Continuous beam',
    'Pulsed beam', 'Laser sweep', 'Chain lightning', 'Tether',
    'Returning or boomerang projectile', 'Orbiting projectile',
    'Deployable projectile', 'Projectile shield',
  ]),
  intentGroup('combat-melee', 'Combat · Melee', [
    'Weapon trail', 'Slash arc', 'Thrust streak', 'Spin attack', 'Ground slam',
    'Aerial plunge', 'Charged strike', 'Critical strike', 'Parry', 'Block',
    'Shield hit', 'Weapon enchantment', 'Weapon transformation',
    'Grab or grapple', 'Execution hit',
  ]),
  intentGroup('impacts-explosions', 'Impacts & Explosions', [
    'Generic hit', 'Critical hit', 'Armor hit', 'Shield absorption',
    'Shield break', 'Flesh impact', 'Metal impact', 'Stone impact', 'Wood impact',
    'Glass impact', 'Water impact', 'Sand impact', 'Snow impact',
    'Vegetation impact', 'Explosion', 'Implosion', 'Shockwave',
    'Elemental detonation', 'Delayed detonation', 'Area pulse', 'Ground crack',
    'Scorch mark', 'Debris burst', 'Disintegration', 'Freeze and shatter',
  ]),
  intentGroup('abilities-magic', 'Abilities & Magic', [
    'Cast anticipation', 'Charge-up', 'Release', 'Aura', 'Buff', 'Debuff',
    'Healing', 'Shield', 'Barrier dome', 'Summon', 'Teleport', 'Portal',
    'Persistent area', 'Trap', 'Mine', 'Target marker',
    'Area-of-effect telegraph', 'Transformation', 'Elemental infusion',
    'Drain or siphon', 'Resurrection',
  ]),
  intentGroup('character-movement-state', 'Character Movement & State', [
    'Dash', 'Air dash', 'Double jump', 'Landing', 'Wall jump', 'Slide',
    'Roll or dodge', 'Sprint', 'Footstep', 'Swimming', 'Flying', 'Spawn',
    'Despawn', 'Death', 'Revive', 'Hurt', 'Invulnerability', 'Stun', 'Poison',
    'Burn', 'Freeze', 'Shock', 'Corruption', 'Sleep', 'Stealth', 'Reveal',
  ]),
  intentGroup('environment-surfaces', 'Environment & Surfaces', [
    'Fire', 'Smoke', 'Steam', 'Embers', 'Ash', 'Dust', 'Sand', 'Leaves',
    'Petals', 'Pollen', 'Rain', 'Snow', 'Hail', 'Mist', 'Waterfall', 'Splash',
    'Wake', 'Foam', 'Bubbles', 'Wind gust', 'Magic zone', 'Lava or magma',
    'Electrical equipment', 'Environmental hazard', 'Footprint',
    'Tire or skid interaction', 'Wetness splash', 'Destruction dust',
    'Destruction debris',
  ]),
  intentGroup('vehicles-technology', 'Vehicles & Technology', [
    'Engine glow', 'Thruster', 'Exhaust', 'Contrail', 'Boost', 'Brake', 'Warp',
    'Vehicle shield', 'Muzzle effect', 'Damage smoke', 'Electrical sparks',
    'Wheel interaction', 'Track interaction', 'Mech movement',
    'Reactor or energy core',
  ]),
  intentGroup('world-feedback-presentation', 'World Feedback & Presentation', [
    'Pickup', 'Loot rarity', 'Objective marker', 'Checkpoint',
    'Interactable highlight', 'Target lock', 'Selection outline', 'Level-up',
    'Achievement', 'Spawn point', 'Quest completion', 'Boss phase transition',
    'Cinematic transition', 'Screen-space hit flash', 'Victory flourish',
    'Defeat flourish',
  ]),
]);

export const VFX_INTENT_MODIFIERS = Object.freeze({
  camera: Object.freeze([
    'third-person-gameplay', 'first-person', 'top-down', 'side-view', 'close-up', 'cinematic',
  ]),
  collision: Object.freeze([
    'disappear', 'detonate', 'pierce', 'bounce', 'stick', 'split', 'return', 'continue',
  ]),
  element: Object.freeze([
    'neutral-energy', 'fire', 'ice', 'electric', 'wind', 'water', 'earth',
    'poison', 'dark', 'holy', 'technological',
  ]),
  medium: Object.freeze(['air', 'ground', 'water', 'wall', 'target-bound', 'screen-space']),
  motion: Object.freeze([
    'straight', 'ballistic', 'homing', 'orbiting', 'turbulent', 'tethered',
    'surface-following', 'stationary', 'target-bound',
  ]),
  rendition: Object.freeze([
    'anime', 'painterly', 'graphic', 'pixelated', 'holographic', 'realistic', 'inked',
  ]),
  scale: Object.freeze(['micro', 'character', 'encounter', 'boss', 'environment', 'cinematic']),
});

const templateRegistry = new Map();

function publicTemplate(entry) {
  return cloneSerializable({
    capabilities: entry.capabilities,
    description: entry.description,
    id: entry.id,
    intent: entry.intent,
    label: entry.label,
    parameters: entry.parameters,
    questions: entry.questions,
    sourceSlots: entry.sourceSlots,
    status: entry.status,
    version: entry.version,
  });
}

export function registerVfxEffectTemplate(id, definition = {}, { overwrite = false } = {}) {
  const templateId = cleanId(id);
  if (!templateId) throw new Error('VFX effect template id is required.');
  if (!overwrite && templateRegistry.has(templateId)) {
    throw new Error(`VFX effect template "${templateId}" already exists.`);
  }
  if (typeof definition.createEffect !== 'function') {
    throw new Error(`VFX effect template "${templateId}" requires createEffect().`);
  }
  if (typeof definition.compile !== 'function') {
    throw new Error(`VFX effect template "${templateId}" requires compile().`);
  }
  const entry = {
    capabilities: cloneSerializable(definition.capabilities ?? {}),
    compile: definition.compile,
    createEffect: definition.createEffect,
    description: String(definition.description ?? ''),
    id: templateId,
    intent: cloneSerializable(definition.intent ?? {}),
    label: String(definition.label || templateId),
    parameters: cloneSerializable(definition.parameters ?? []),
    questions: cloneSerializable(definition.questions ?? []),
    sourceSlots: cloneSerializable(definition.sourceSlots ?? []),
    status: String(definition.status ?? 'available'),
    version: Math.max(1, Math.round(Number(definition.version) || 1)),
  };
  templateRegistry.set(templateId, entry);
  return publicTemplate(entry);
}

export function getVfxEffectTemplate(id) {
  const entry = templateRegistry.get(cleanId(id));
  return entry ? publicTemplate(entry) : null;
}

export function getVfxEffectTemplateOptions({ includePlanned = false } = {}) {
  return [...templateRegistry.values()]
    .filter((entry) => includePlanned || entry.status === 'available')
    .map((entry) => ({
      description: entry.description,
      id: entry.id,
      intent: cloneSerializable(entry.intent),
      label: entry.label,
      status: entry.status,
      sourceSlots: cloneSerializable(entry.sourceSlots),
      version: entry.version,
    }));
}

export function getVfxIntentOptions({ includePlanned = true } = {}) {
  return VFX_INTENT_TAXONOMY.flatMap((group) => group.entries
    .filter((entry) => includePlanned || entry.status === 'available')
    .map((entry) => ({
      groupId: group.id,
      groupLabel: group.label,
      id: entry.id,
      label: entry.label,
      status: entry.status,
    })));
}

function normalizeAnswers(template, answers = {}) {
  const source = plain(answers) ? answers : {};
  const normalized = {};
  for (const question of template.questions) {
    const options = Array.isArray(question.options) ? question.options : [];
    const requested = source[question.id] ?? question.default;
    const option = options.find((candidate) => candidate.value === requested);
    if (!option) {
      throw new Error(`Template "${template.id}" question "${question.id}" does not accept "${requested}".`);
    }
    if (option.supported === false) {
      throw new Error(`Template "${template.id}" option "${question.id}:${requested}" is planned but not implemented.`);
    }
    normalized[question.id] = requested;
  }
  return normalized;
}

export function createVfxEffectFromTemplate(templateId, options = {}) {
  const template = templateRegistry.get(cleanId(templateId));
  if (!template) throw new Error(`Unknown VFX effect template "${templateId}".`);
  if (template.status !== 'available') throw new Error(`VFX effect template "${templateId}" is not available.`);
  const answers = normalizeAnswers(template, options.answers);
  const document = template.createEffect({
    answers,
    id: options.id,
    label: options.label,
    parameters: plain(options.parameters) ? options.parameters : {},
    style: options.style,
  });
  const result = validateVfxEffectDocument(document);
  if (!result.ok) throw new Error(result.errors.join(' '));
  return result.value;
}

/**
 * Compiles a validated effect document into a runtime-ready plain definition.
 * Compilation is deterministic and has no renderer side effects.
 */
export function compileVfxEffectDocument(documentInput) {
  const result = validateVfxEffectDocument(documentInput);
  if (!result.ok) throw new Error(result.errors.join(' '));
  const document = result.value;
  const template = templateRegistry.get(document.template.id);
  if (!template) throw new Error(`Effect "${document.id}" requires unknown template "${document.template.id}".`);
  if (document.template.version > template.version) {
    throw new Error(`Effect "${document.id}" template version ${document.template.version} is newer than supported ${template.version}.`);
  }
  const compiled = template.compile(document);
  if (!plain(compiled) || !compiled.spawnType) {
    throw new Error(`Template "${template.id}" returned an invalid compiled definition.`);
  }
  return {
    effectId: document.id,
    inputs: cloneSerializable(document.inputs),
    label: document.label,
    parameters: getVfxEffectParameterValues(document),
    quality: cloneSerializable(compiled.quality ?? document.quality),
    sourceAssets: cloneSerializable(compiled.sourceAssets ?? {}),
    spawnType: cleanId(compiled.spawnType),
    settings: cloneSerializable(compiled.settings ?? {}),
    style: document.style,
    template: { id: template.id, version: template.version },
  };
}

const CHARGED_PARAMETERS = Object.freeze([
  Object.freeze({
    id: 'length', type: 'number', group: 'shape', label: 'Length',
    description: 'World-space projectile length at full charge.', min: 0.6, max: 4, step: 0.01, default: 1.8,
  }),
  Object.freeze({
    id: 'radius', type: 'number', group: 'shape', label: 'Radius',
    description: 'World-space projectile radius at full charge.', min: 0.12, max: 1.2, step: 0.01, default: 0.46,
  }),
  Object.freeze({
    id: 'frontTaper', type: 'number', group: 'shape', label: 'Front Taper',
    description: 'Sharpness of the projectile nose along its forward axis.', min: 0, max: 1, step: 0.01, default: 0.72,
  }),
  Object.freeze({
    id: 'backTaper', type: 'number', group: 'shape', label: 'Rear Taper',
    description: 'Sharpness of the trailing end, independent from the nose.', min: 0, max: 1, step: 0.01, default: 0.32,
  }),
  Object.freeze({
    id: 'widestPoint', type: 'number', group: 'shape', label: 'Widest Point',
    description: 'Where maximum radius sits from front (0) to rear (1).', min: 0.15, max: 0.85, step: 0.01, default: 0.56,
  }),
  Object.freeze({
    id: 'customProfileEnabled', type: 'boolean', group: 'shape', label: 'Use Drawn Profile',
    description: 'Use the mirrored half-profile instead of the guided taper controls.', default: false,
  }),
  Object.freeze({
    id: 'silhouetteProfile', type: 'profile', group: 'shape', label: 'Mirrored Silhouette Profile',
    description: 'Normalized front-to-rear half-profile mirrored around the centerline.',
    default: DEFAULT_VFX_SILHOUETTE_PROFILE,
  }),
  Object.freeze({
    id: 'coreIntensity', type: 'number', group: 'appearance', label: 'Core Intensity',
    description: 'Emission multiplier for the directional inner body.', min: 0, max: 5, step: 0.05, default: 2.4,
  }),
  Object.freeze({
    id: 'shellIntensity', type: 'number', group: 'appearance', label: 'Shell Intensity',
    description: 'Emission multiplier for the outer energy volume.', min: 0, max: 4, step: 0.05, default: 1.35,
  }),
  Object.freeze({
    id: 'filamentDensity', type: 'number', group: 'appearance', label: 'Filament Density',
    description: 'Density of animated shell veins.', min: 0.25, max: 3, step: 0.05, default: 1.25,
  }),
  Object.freeze({
    id: 'circulationEnabled', type: 'boolean', group: 'energy-motion', label: 'Circulating Energy',
    description: 'Enable the procedural surface-energy layer.', default: true,
  }),
  Object.freeze({
    id: 'energyMotionTheme', type: 'enum', group: 'energy-motion', label: 'Motion Theme',
    description: 'Named starting point for surface-energy motion; custom values remain fully portable.',
    options: [
      ...VFX_ENERGY_MOTION_THEMES.map((theme) => theme.id),
      VFX_ENERGY_MOTION_CUSTOM_THEME_ID,
    ],
    default: DEFAULT_VFX_ENERGY_MOTION_THEME_ID,
  }),
  Object.freeze({
    id: 'circulationCount', type: 'number', group: 'energy-motion', label: 'Arc Count',
    description: 'Primary circulating arcs before deterministic branch forks.', min: 1, max: 12, step: 1, default: 6,
  }),
  Object.freeze({
    id: 'circulationSpeed', type: 'number', group: 'energy-motion', label: 'Circulation Speed',
    description: 'How quickly arcs cycle around the projectile surface.', min: 0, max: 4, step: 0.01, default: 1.6,
  }),
  Object.freeze({
    id: 'circulationDirection', type: 'enum', group: 'energy-motion', label: 'Direction',
    description: 'Clockwise, counter-clockwise, or alternating per seeded arc.',
    options: VFX_ENERGY_MOTION_DIRECTIONS,
    default: 'alternating',
  }),
  Object.freeze({
    id: 'circulationCoverage', type: 'number', group: 'energy-motion', label: 'Arc Length',
    description: 'Fraction of a complete orbit covered by each visible arc.', min: 0.08, max: 1, step: 0.01, default: 0.3,
  }),
  Object.freeze({
    id: 'circulationIrregularity', type: 'number', group: 'energy-motion', label: 'Irregularity',
    description: 'Breaks circular paths with seeded angular and axial noise.', min: 0, max: 1, step: 0.01, default: 0.72,
  }),
  Object.freeze({
    id: 'circulationBranching', type: 'number', group: 'energy-motion', label: 'Branching',
    description: 'Probability and reach of connected lightning forks.', min: 0, max: 1, step: 0.01, default: 0.42,
  }),
  Object.freeze({
    id: 'circulationThickness', type: 'number', group: 'energy-motion', label: 'Arc Thickness',
    description: 'Normalized width of the bright ribbon core.', min: 0.006, max: 0.08, step: 0.001, default: 0.022,
  }),
  Object.freeze({
    id: 'circulationSurfaceOffset', type: 'number', group: 'energy-motion', label: 'Orbit Clearance',
    description: 'Separates lightning from the main body; larger values can reach or clear the outer shell.', min: 1.05, max: 2.4, step: 0.01, default: 1.68,
  }),
  Object.freeze({
    id: 'circulationAxialWander', type: 'number', group: 'energy-motion', label: 'Front–Rear Wander',
    description: 'How far arcs travel between the projectile nose and tail.', min: 0, max: 1, step: 0.01, default: 0.52,
  }),
  Object.freeze({
    id: 'circulationPlaneVariation', type: 'number', group: 'energy-motion', label: '3D Plane Variation',
    description: 'Tilts every orbit onto a different seeded plane and adds non-planar depth wobble.', min: 0, max: 1, step: 0.01, default: 0.78,
  }),
  Object.freeze({
    id: 'circulationFlicker', type: 'number', group: 'energy-motion', label: 'Reformation',
    description: 'Controls seeded disappearance and reformation instead of uniform continuous bands.', min: 0, max: 1, step: 0.01, default: 0.68,
  }),
  Object.freeze({
    id: 'filamentSpeed', type: 'number', group: 'motion', label: 'Filament Speed',
    description: 'Flow speed of shell veins and internal streaks.', min: 0, max: 4, step: 0.05, default: 1.2,
  }),
  Object.freeze({
    id: 'turbulence', type: 'number', group: 'motion', label: 'Turbulence',
    description: 'Internal motion and boundary instability.', min: 0, max: 2, step: 0.05, default: 0.7,
  }),
  Object.freeze({
    id: 'trailLength', type: 'number', group: 'motion', label: 'Trail Length',
    description: 'Lifetime and visual reach of shed trail particles.', min: 0, max: 3, step: 0.05, default: 1.15,
  }),
  Object.freeze({
    id: 'particleRate', type: 'number', group: 'particles', label: 'Particle Amount',
    description: 'Boundary and internal particles emitted per second.', min: 0, max: 500, step: 5, default: 160,
  }),
  Object.freeze({
    id: 'releaseDepth', type: 'number', group: 'release', label: 'Ring Depth',
    description: 'Out-of-plane depth along the firing axis; zero would be a flat ring.', min: 0.05, max: 0.65, step: 0.01, default: 0.28,
  }),
  Object.freeze({
    id: 'releaseIrregularity', type: 'number', group: 'release', label: 'Ring Irregularity',
    description: 'Restrained seeded variation around the ring radius and ribbon width.', min: 0, max: 0.75, step: 0.01, default: 0.38,
  }),
  Object.freeze({
    id: 'releaseLobes', type: 'number', group: 'release', label: 'Ring Ripples',
    description: 'Number of gentle seeded undulations around the closed loop.', min: 2, max: 7, step: 1, default: 3,
  }),
  Object.freeze({
    id: 'impactPower', type: 'number', group: 'impact', label: 'Impact Power',
    description: 'Presentation power handed to the impact sub-effect.', min: 0, max: 5, step: 0.05, default: 2.2,
  }),
  Object.freeze({
    id: 'coreColor', type: 'color', group: 'palette', label: 'Core Color',
    description: 'Hot inner energy color.', default: [0.9, 0.98, 1],
  }),
  Object.freeze({
    id: 'edgeColor', type: 'color', group: 'palette', label: 'Edge Color',
    description: 'Outer shell and trail color.', default: [0.28, 0.62, 1],
  }),
  Object.freeze({
    id: 'accentColor', type: 'color', group: 'palette', label: 'Accent Color',
    description: 'Filament, release-ring, and impact accent.', default: [0.55, 0.82, 1],
  }),
  Object.freeze({
    id: 'lightIntensity', type: 'number', group: 'lighting', label: 'Local Light',
    description: 'Optional local-light intensity at full charge.', min: 0, max: 8, step: 0.1, default: 2.4,
  }),
  Object.freeze({
    id: 'bloomContribution', type: 'number', group: 'post', label: 'Bloom Contribution',
    description: 'Authored bloom contribution recommendation for compatible host post stacks.', min: 0, max: 2, step: 0.05, default: 0.8,
  }),
]);

const question = (id, label, defaultValue, values) => Object.freeze({
  default: defaultValue,
  id,
  label,
  options: Object.freeze(values.map(([value, optionLabel, supported = false]) => Object.freeze({
    label: optionLabel,
    supported,
    value,
  }))),
});

const CHARGED_QUESTIONS = Object.freeze([
  question('chargeModel', 'How does it charge?', 'continuous', [
    ['continuous', 'Continuous scalar', true],
    ['tiers', 'Discrete tiers'],
    ['automatic', 'Automatic'],
    ['none', 'No visible charge'],
  ]),
  question('motion', 'How does it travel?', 'straight', [
    ['straight', 'Straight', true],
    ['ballistic', 'Ballistic'],
    ['homing', 'Homing'],
    ['piercing', 'Piercing'],
    ['ricochet', 'Ricocheting'],
    ['steered', 'Player-steered'],
  ]),
  question('silhouette', 'What is its silhouette?', 'capsule', [
    ['capsule', 'Energy capsule', true],
    ['orb', 'Orb'],
    ['spear', 'Spear'],
    ['disk', 'Disk'],
    ['wave', 'Wave'],
    ['cone', 'Cone'],
    ['custom', 'Custom mesh'],
  ]),
  question('contact', 'What happens on contact?', 'detonate', [
    ['detonate', 'Detonate', true],
    ['pierce', 'Pierce'],
    ['dissipate', 'Dissipate'],
    ['stick', 'Stick'],
    ['split', 'Split'],
    ['bounce', 'Bounce'],
  ]),
  question('energyLanguage', 'What visual language?', 'unstable-energy', [
    ['unstable-energy', 'Unstable energy', true],
    ['clean-energy', 'Clean energy'],
    ['electrical', 'Electrical'],
    ['crystalline', 'Crystalline'],
    ['liquid', 'Liquid'],
    ['technological', 'Technological'],
  ]),
  question('importance', 'How important is it?', 'charged', [
    ['regular', 'Regular attack'],
    ['charged', 'Charged attack', true],
    ['ultimate', 'Ultimate'],
    ['boss', 'Boss attack'],
    ['cinematic', 'Cinematic'],
  ]),
  question('targetTier', 'Target quality?', 'desktop-high', [
    ['mobile', 'Mobile', true],
    ['desktop-fallback', 'Desktop fallback', true],
    ['desktop-high', 'Desktop high', true],
    ['cinematic', 'Cinematic', true],
  ]),
]);

function parameterDefinitions(values = {}, style = 'call_me_sensei') {
  const styleValues = resolveVfxStyle(style).chargedShot ?? {};
  return CHARGED_PARAMETERS.map((parameter) => ({
    ...cloneSerializable(parameter),
    value: Object.hasOwn(values, parameter.id)
      ? cloneSerializable(values[parameter.id])
      : cloneSerializable(styleValues[parameter.id] ?? parameter.default),
  }));
}

function chargedShotDocument({ answers, id, label, parameters, style }) {
  const effectId = cleanId(id || 'charged-energy-shot');
  const targetTier = answers.targetTier;
  return createVfxEffectDocument(effectId, {
    label: label || 'Charged Energy Shot',
    description: 'Layered three-dimensional charged projectile with a directional core, animated shell filaments, seeded circulating energy, internal motes, travel shedding, local light, and impact presentation.',
    template: { answers, id: 'charged-energy-shot', version: 7 },
    intent: {
      path: ['combat', 'ranged', 'charged-projectile'],
      modifiers: {
        collision: answers.contact,
        element: 'neutral-energy',
        motion: answers.motion,
        rendition: 'anime',
        scale: 'character',
        silhouette: answers.silhouette,
      },
    },
    style: style || 'call_me_sensei',
    tags: ['combat', 'projectile', 'charged', 'energy', 'layered'],
    parameters: parameterDefinitions(parameters, style),
    inputs: [
      { id: 'from', label: 'Spawn position', type: 'vec3', required: true },
      { id: 'velocity', label: 'Velocity', type: 'vec3', required: true },
      { id: 'charge', label: 'Charge', type: 'number', required: false, default: 1 },
      {
        id: 'chargeDuration', label: 'Charge duration', type: 'number',
        required: false, default: 0,
      },
      {
        id: 'collisionMode', label: 'Collision mode', type: 'enum',
        required: false, default: answers.contact, options: ['detonate'],
      },
      {
        id: 'qualityTier', label: 'Quality tier', type: 'enum',
        required: false, default: targetTier,
        options: ['mobile', 'desktop-fallback', 'desktop-high', 'cinematic'],
      },
      { id: 'maxLife', label: 'Maximum lifetime', type: 'number', required: false, default: 3 },
      { id: 'look', label: 'Presentation overrides', type: 'object', required: false },
    ],
    phases: [
      {
        id: 'charge', label: 'Charge / anticipation', mode: 'loop', duration: null,
        description: 'Emitter-anchored energy gathering while the charge input is held.',
      },
      {
        id: 'release', label: 'Release', mode: 'once', duration: 0.28,
        description: 'One-shot warped source ring and launch transition; it does not follow the shot.',
      },
      {
        id: 'travel', label: 'Travel', mode: 'loop', duration: null,
        description: 'Projectile body, directional flow, shedding, and trail.',
      },
      {
        id: 'impact', label: 'Impact', mode: 'once', duration: 0.55,
        description: 'Target-anchored flash, sparks, shockwave, and smoke.',
      },
      {
        id: 'pierce', label: 'Pierce overlay', mode: 'once', duration: 0.18,
        description: 'Reduced contact overlay while the travel body continues.',
      },
      {
        id: 'expire', label: 'Expire / cleanup', mode: 'once', duration: 0.25,
        description: 'Non-contact collapse and pooled-resource retirement.',
      },
    ],
    layers: [
      {
        id: 'directional-core', label: 'Directional core', order: 100, type: 'mesh-volume',
        phases: ['charge', 'release', 'travel', 'expire'],
        renderer: { profile: 'toonlab.vfx.energy-core' },
        source: { asset: 'toonlab.primitive.sphere' },
        settings: {
          coreColor: [0.9, 0.98, 1],
          edgeColor: [0.28, 0.62, 1],
          intensity: 2.4,
          length: 1.8,
          radius: 0.46,
          backTaper: 0.32,
          customProfileEnabled: false,
          frontTaper: 0.72,
          silhouetteProfile: DEFAULT_VFX_SILHOUETTE_PROFILE,
          widestPoint: 0.56,
        },
      },
      {
        id: 'core-streaks', label: 'Core streaks', order: 200, type: 'mesh-volume',
        phases: ['charge', 'release', 'travel', 'expire'],
        renderer: { profile: 'toonlab.vfx.energy-streak' },
        source: { asset: 'toonlab.primitive.tapered-strip' },
        settings: { accentColor: [0.55, 0.82, 1], count: 3, speed: 1.2 },
      },
      {
        id: 'energy-shell', label: 'Energy shell', order: 300, type: 'mesh-volume',
        phases: ['charge', 'release', 'travel', 'expire'],
        renderer: { profile: 'toonlab.vfx.energy-shell' },
        source: { asset: 'toonlab.primitive.sphere' },
        settings: {
          edgeColor: [0.28, 0.62, 1],
          intensity: 1.35,
          maskAsset: `${effectId}.shell-pattern`,
          scale: 1.12,
        },
      },
      {
        id: 'shell-filaments', label: 'Shell filaments', order: 400, type: 'mesh-volume',
        phases: ['charge', 'release', 'travel', 'expire'],
        renderer: { profile: 'toonlab.vfx.energy-filament' },
        source: { asset: 'toonlab.primitive.sphere' },
        settings: {
          accentColor: [0.55, 0.82, 1],
          density: 1.25,
          maskAsset: `${effectId}.filament-pattern`,
          speed: 1.2,
        },
      },
      {
        id: 'circulating-energy', label: 'Circulating energy', order: 450, type: 'mesh-volume',
        phases: ['charge', 'release', 'travel', 'expire'],
        renderer: { profile: 'toonlab.vfx.circulating-energy' },
        source: { asset: 'toonlab.procedural.circulating-ribbon' },
        settings: {
          accentColor: [0.55, 0.82, 1],
          branching: 0.42,
          count: 6,
          coverage: 0.3,
          direction: 'alternating',
          enabled: true,
          flicker: 0.68,
          irregularity: 0.72,
          speed: 1.6,
          surfaceOffset: 1.68,
          axialWander: 0.52,
          planeVariation: 0.78,
          theme: DEFAULT_VFX_ENERGY_MOTION_THEME_ID,
          thickness: 0.022,
        },
      },
      {
        id: 'internal-motes', label: 'Internal motes', order: 500, type: 'sprite-particle',
        phases: ['travel'],
        renderer: { profile: 'toonlab.vfx.energy-mote' },
        source: { asset: 'toonlab.sdf.ember-dot' },
        settings: { color: [0.28, 0.62, 1], rate: 80, turbulence: 0.7 },
      },
      {
        id: 'boundary-sparks', label: 'Boundary sparks', order: 600, type: 'sprite-particle',
        phases: ['travel'],
        renderer: { profile: 'toonlab.vfx.energy-spark' },
        source: { asset: 'toonlab.sdf.streak-dot' },
        settings: { color: [0.55, 0.82, 1], rate: 80, turbulence: 0.7 },
      },
      {
        id: 'travel-trail', label: 'Travel trail', order: 700, type: 'trail',
        phases: ['travel', 'expire'],
        renderer: { profile: 'toonlab.vfx.energy-trail' },
        settings: { color: [0.28, 0.62, 1], lifetime: 1.15 },
      },
      {
        id: 'leading-compression', label: 'Source release ring', order: 800, type: 'mesh-volume',
        phases: ['release'],
        renderer: { profile: 'toonlab.vfx.energy-ring-3d' },
        source: { asset: 'toonlab.procedural.warped-ring' },
        settings: {
          color: [0.55, 0.82, 1],
          depth: 0.28,
          intensity: 1,
          irregularity: 0.38,
          lobes: 3,
          radius: 0.46,
        },
      },
      {
        id: 'local-light', label: 'Local light', order: 900, type: 'light',
        phases: ['charge', 'release', 'travel', 'impact'],
        settings: { color: [0.55, 0.82, 1], distance: 4, intensity: 2.4 },
      },
      {
        id: 'bloom-contribution', label: 'Bloom contribution', order: 1000, type: 'post-process',
        phases: ['release', 'travel', 'impact'],
        settings: { contribution: 0.8, hostFeature: 'bloom' },
      },
      {
        id: 'contact-burst', label: 'Contact burst', order: 1100, type: 'sub-effect',
        phases: ['impact', 'pierce'],
        settings: { effect: 'impact', power: 2.2 },
      },
    ],
    bindings: [
      { parameter: 'length', target: { layer: 'directional-core', path: ['settings', 'length'] }, transform: { type: 'linear', input: [0.6, 4], output: [0.6, 4] } },
      { parameter: 'radius', target: { layer: 'directional-core', path: ['settings', 'radius'] }, transform: { type: 'linear', input: [0.12, 1.2], output: [0.12, 1.2] } },
      { parameter: 'frontTaper', target: { layer: 'directional-core', path: ['settings', 'frontTaper'] }, transform: { type: 'linear', input: [0, 1], output: [0, 1] } },
      { parameter: 'backTaper', target: { layer: 'directional-core', path: ['settings', 'backTaper'] }, transform: { type: 'linear', input: [0, 1], output: [0, 1] } },
      { parameter: 'widestPoint', target: { layer: 'directional-core', path: ['settings', 'widestPoint'] }, transform: { type: 'linear', input: [0.15, 0.85], output: [0.15, 0.85] } },
      { parameter: 'customProfileEnabled', target: { layer: 'directional-core', path: ['settings', 'customProfileEnabled'] }, transform: { type: 'identity' } },
      { parameter: 'silhouetteProfile', target: { layer: 'directional-core', path: ['settings', 'silhouetteProfile'] }, transform: { type: 'identity' } },
      { parameter: 'radius', target: { layer: 'leading-compression', path: ['settings', 'radius'] }, transform: { type: 'linear', input: [0.12, 1.2], output: [0.12, 1.2] } },
      { parameter: 'releaseDepth', target: { layer: 'leading-compression', path: ['settings', 'depth'] }, transform: { type: 'linear', input: [0.05, 0.65], output: [0.05, 0.65] } },
      { parameter: 'releaseIrregularity', target: { layer: 'leading-compression', path: ['settings', 'irregularity'] }, transform: { type: 'linear', input: [0, 0.75], output: [0, 0.75] } },
      { parameter: 'releaseLobes', target: { layer: 'leading-compression', path: ['settings', 'lobes'] }, transform: { type: 'linear', input: [2, 7], output: [2, 7] } },
      { parameter: 'coreIntensity', target: { layer: 'directional-core', path: ['settings', 'intensity'] }, transform: { type: 'linear', input: [0, 5], output: [0, 5] } },
      { parameter: 'shellIntensity', target: { layer: 'energy-shell', path: ['settings', 'intensity'] }, transform: { type: 'linear', input: [0, 4], output: [0, 4] } },
      { parameter: 'shellIntensity', target: { layer: 'leading-compression', path: ['settings', 'intensity'] }, transform: { type: 'linear', input: [0, 4], output: [0, 4] } },
      { parameter: 'filamentDensity', target: { layer: 'shell-filaments', path: ['settings', 'density'] }, transform: { type: 'linear', input: [0.25, 3], output: [0.25, 3] } },
      { parameter: 'circulationEnabled', target: { layer: 'circulating-energy', path: ['settings', 'enabled'] }, transform: { type: 'identity' } },
      { parameter: 'energyMotionTheme', target: { layer: 'circulating-energy', path: ['settings', 'theme'] }, transform: { type: 'identity' } },
      { parameter: 'circulationCount', target: { layer: 'circulating-energy', path: ['settings', 'count'] }, transform: { type: 'linear', input: [1, 12], output: [1, 12] } },
      { parameter: 'circulationSpeed', target: { layer: 'circulating-energy', path: ['settings', 'speed'] }, transform: { type: 'linear', input: [0, 4], output: [0, 4] } },
      { parameter: 'circulationDirection', target: { layer: 'circulating-energy', path: ['settings', 'direction'] }, transform: { type: 'identity' } },
      { parameter: 'circulationCoverage', target: { layer: 'circulating-energy', path: ['settings', 'coverage'] }, transform: { type: 'linear', input: [0.08, 1], output: [0.08, 1] } },
      { parameter: 'circulationIrregularity', target: { layer: 'circulating-energy', path: ['settings', 'irregularity'] }, transform: { type: 'linear', input: [0, 1], output: [0, 1] } },
      { parameter: 'circulationBranching', target: { layer: 'circulating-energy', path: ['settings', 'branching'] }, transform: { type: 'linear', input: [0, 1], output: [0, 1] } },
      { parameter: 'circulationThickness', target: { layer: 'circulating-energy', path: ['settings', 'thickness'] }, transform: { type: 'linear', input: [0.006, 0.08], output: [0.006, 0.08] } },
      { parameter: 'circulationSurfaceOffset', target: { layer: 'circulating-energy', path: ['settings', 'surfaceOffset'] }, transform: { type: 'linear', input: [0.9, 1.4], output: [0.9, 1.4] } },
      { parameter: 'circulationAxialWander', target: { layer: 'circulating-energy', path: ['settings', 'axialWander'] }, transform: { type: 'linear', input: [0, 1], output: [0, 1] } },
      { parameter: 'circulationPlaneVariation', target: { layer: 'circulating-energy', path: ['settings', 'planeVariation'] }, transform: { type: 'linear', input: [0, 1], output: [0, 1] } },
      { parameter: 'circulationFlicker', target: { layer: 'circulating-energy', path: ['settings', 'flicker'] }, transform: { type: 'linear', input: [0, 1], output: [0, 1] } },
      { parameter: 'filamentSpeed', target: { layer: 'shell-filaments', path: ['settings', 'speed'] }, transform: { type: 'linear', input: [0, 4], output: [0, 4] } },
      { parameter: 'filamentSpeed', target: { layer: 'core-streaks', path: ['settings', 'speed'] }, transform: { type: 'linear', input: [0, 4], output: [0, 4] } },
      { parameter: 'turbulence', target: { layer: 'internal-motes', path: ['settings', 'turbulence'] }, transform: { type: 'linear', input: [0, 2], output: [0, 2] } },
      { parameter: 'turbulence', target: { layer: 'boundary-sparks', path: ['settings', 'turbulence'] }, transform: { type: 'linear', input: [0, 2], output: [0, 2] } },
      { parameter: 'trailLength', target: { layer: 'travel-trail', path: ['settings', 'lifetime'] }, transform: { type: 'linear', input: [0, 3], output: [0, 3] } },
      { parameter: 'particleRate', target: { layer: 'internal-motes', path: ['settings', 'rate'] }, transform: { type: 'linear', input: [0, 500], output: [0, 250] } },
      { parameter: 'particleRate', target: { layer: 'boundary-sparks', path: ['settings', 'rate'] }, transform: { type: 'linear', input: [0, 500], output: [0, 250] } },
      { parameter: 'impactPower', target: { layer: 'contact-burst', path: ['settings', 'power'] }, transform: { type: 'linear', input: [0, 5], output: [0, 5] } },
      { parameter: 'lightIntensity', target: { layer: 'local-light', path: ['settings', 'intensity'] }, transform: { type: 'linear', input: [0, 8], output: [0, 8] } },
      { parameter: 'bloomContribution', target: { layer: 'bloom-contribution', path: ['settings', 'contribution'] }, transform: { type: 'linear', input: [0, 2], output: [0, 2] } },
      { parameter: 'coreColor', target: { layer: 'directional-core', path: ['settings', 'coreColor'] }, transform: { type: 'identity' } },
      { parameter: 'edgeColor', target: { layer: 'directional-core', path: ['settings', 'edgeColor'] }, transform: { type: 'identity' } },
      { parameter: 'edgeColor', target: { layer: 'energy-shell', path: ['settings', 'edgeColor'] }, transform: { type: 'identity' } },
      { parameter: 'edgeColor', target: { layer: 'internal-motes', path: ['settings', 'color'] }, transform: { type: 'identity' } },
      { parameter: 'edgeColor', target: { layer: 'travel-trail', path: ['settings', 'color'] }, transform: { type: 'identity' } },
      { parameter: 'accentColor', target: { layer: 'core-streaks', path: ['settings', 'accentColor'] }, transform: { type: 'identity' } },
      { parameter: 'accentColor', target: { layer: 'shell-filaments', path: ['settings', 'accentColor'] }, transform: { type: 'identity' } },
      { parameter: 'accentColor', target: { layer: 'boundary-sparks', path: ['settings', 'color'] }, transform: { type: 'identity' } },
      { parameter: 'accentColor', target: { layer: 'leading-compression', path: ['settings', 'color'] }, transform: { type: 'identity' } },
      { parameter: 'accentColor', target: { layer: 'local-light', path: ['settings', 'color'] }, transform: { type: 'identity' } },
    ],
    quality: {
      defaultTier: targetTier,
      tiers: [
        {
          id: 'mobile', label: 'Mobile',
          budgets: { circulationArcs: 0, particles: 48, projectiles: 4, streaks: 1 },
          features: {
            circulatingEnergy: false, distortion: false, localLight: false, shellFilaments: false,
          },
        },
        {
          id: 'desktop-fallback', label: 'Desktop fallback',
          budgets: { circulationArcs: 4, particles: 128, projectiles: 8, streaks: 2 },
          features: {
            circulatingEnergy: true, distortion: false, localLight: true, shellFilaments: true,
          },
        },
        {
          id: 'desktop-high', label: 'Desktop high',
          budgets: { circulationArcs: 8, particles: 256, projectiles: 12, streaks: 3 },
          features: {
            circulatingEnergy: true, distortion: true, localLight: true, shellFilaments: true,
          },
        },
        {
          id: 'cinematic', label: 'Cinematic',
          budgets: { circulationArcs: 12, particles: 512, projectiles: 16, streaks: 5 },
          features: {
            circulatingEnergy: true, distortion: true, localLight: true, shellFilaments: true,
          },
        },
      ],
    },
  });
}

registerVfxEffectTemplate('charged-energy-shot', {
  capabilities: {
    backends: ['webgpu', 'webgl2'],
    collisionModes: ['detonate'],
    layerTypes: ['mesh-volume', 'sprite-particle', 'trail', 'light', 'post-process', 'sub-effect'],
    qualityTiers: ['mobile', 'desktop-fallback', 'desktop-high', 'cinematic'],
  },
  description: 'Layered three-dimensional charged projectile with a directional core, animated energy shell, procedural circulating arcs, internal motes, boundary sparks, travel trail, light, and impact.',
  intent: { group: 'combat-ranged', id: 'charged-projectile' },
  label: 'Charged Energy Shot',
  parameters: CHARGED_PARAMETERS,
  questions: CHARGED_QUESTIONS,
  sourceSlots: [
    {
      acceptedMimeTypes: ['image/gif', 'image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/webm'],
      channel: 'mask',
      description: 'Animated grayscale input that breaks up the outer energy shell.',
      generators: ['flow-bands', 'lightning-veins', 'radial-shards'],
      id: 'shell-pattern',
      label: 'Shell pattern',
      layer: 'energy-shell',
      settingsPath: ['maskAsset'],
    },
    {
      acceptedMimeTypes: ['image/gif', 'image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/webm'],
      channel: 'mask',
      description: 'Animated grayscale input that shapes the bright surface filaments.',
      generators: ['lightning-veins', 'flow-bands', 'radial-shards'],
      id: 'filament-pattern',
      label: 'Filament pattern',
      layer: 'shell-filaments',
      settingsPath: ['maskAsset'],
    },
  ],
  status: 'available',
  version: 7,
  createEffect: chargedShotDocument,
  compile(document) {
    const layerById = new Map(document.layers.map((layer) => [layer.id, layer]));
    return {
      quality: document.quality,
      sourceAssets: {
        filaments: layerById.get('shell-filaments')?.settings?.maskAsset,
        shell: layerById.get('energy-shell')?.settings?.maskAsset,
      },
      spawnType: 'chargedShot',
      settings: {
        ...(resolveVfxStyle(document.style).chargedShot ?? {}),
        ...getVfxEffectParameterValues(document),
      },
    };
  },
});
