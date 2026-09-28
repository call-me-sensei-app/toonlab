// Runtime-safe motion style settings. These settings deliberately describe
// playback and presentation, not a catalog of animations: behavior topology
// and clip-slot bindings live in separate serializable documents.

export const MOTION_CADENCE_MODES = Object.freeze(['smooth', 'stepped']);
export const MOTION_ROOT_POLICIES = Object.freeze(['ignore', 'inPlace', 'extract', 'apply']);
export const MOTION_EASING_MODES = Object.freeze(['linear', 'smoothstep', 'easeInOutCubic']);

export const DEFAULT_MOTION_SETTINGS = Object.freeze({
  playback: Object.freeze({
    cadence: 'smooth',
    sampleRate: 24,
    speed: 1,
    maxDelta: 0.1,
  }),
  transitions: Object.freeze({
    duration: 0.18,
    easing: 'smoothstep',
    allowInterrupt: true,
    syncPhase: true,
  }),
  lean: Object.freeze({
    enabled: true,
    maxAngle: 0.2,
    response: 10,
    turnParameter: 'turn',
    forwardParameter: 'speed',
  }),
  bob: Object.freeze({
    enabled: true,
    amplitude: 0.035,
    frequency: 1.8,
    lateral: 0.012,
    speedParameter: 'speed',
  }),
  squash: Object.freeze({
    enabled: true,
    amount: 0.08,
    response: 14,
    verticalParameter: 'verticalSpeed',
  }),
  rootMotion: Object.freeze({
    policy: 'inPlace',
    axes: Object.freeze([true, false, true]),
    scale: 1,
    applyYaw: false,
  }),
  events: Object.freeze({
    maxPerUpdate: 32,
    fireOnLoop: true,
    minimumWeight: 0.05,
  }),
});

export const MOTION_SETTING_GROUPS = Object.freeze([
  Object.freeze({ id: 'playback', label: 'Playback', description: 'Global timing and frame cadence. Stepped cadence creates deliberately held animation frames without slowing simulation.' }),
  Object.freeze({ id: 'transitions', label: 'Transitions', description: 'Default cross-fade behavior for graph edges that do not provide their own values.' }),
  Object.freeze({ id: 'lean', label: 'Lean', description: 'Procedural directional lean driven by arbitrary named graph parameters.' }),
  Object.freeze({ id: 'bob', label: 'Bob', description: 'A subtle locomotion presentation layer applied after clip and graph blending.' }),
  Object.freeze({ id: 'squash', label: 'Squash', description: 'Velocity-driven squash and stretch with volume-preserving horizontal compensation.' }),
  Object.freeze({ id: 'rootMotion', label: 'Root Motion', description: 'Whether authored root travel is ignored, removed in place, extracted for gameplay, or applied through the rig adapter.' }),
  Object.freeze({ id: 'events', label: 'Events', description: 'Per-frame safety limits and filtering for arbitrary clip event tracks.' }),
]);

const FIELDS = Object.freeze({
  playback: Object.freeze({
    cadence: { label: 'Cadence', type: 'select', options: MOTION_CADENCE_MODES },
    sampleRate: { label: 'Held-frame rate', range: { min: 1, max: 120, step: 1 } },
    speed: { label: 'Global speed', range: { min: 0, max: 4, step: 0.01 } },
    maxDelta: { label: 'Maximum delta', range: { min: 0.016, max: 0.5, step: 0.001 } },
  }),
  transitions: Object.freeze({
    duration: { label: 'Default duration', range: { min: 0, max: 2, step: 0.01 } },
    easing: { label: 'Easing', type: 'select', options: MOTION_EASING_MODES },
    allowInterrupt: { label: 'Allow interruption', type: 'boolean' },
    syncPhase: { label: 'Synchronize phase', type: 'boolean' },
  }),
  lean: Object.freeze({
    enabled: { label: 'Enabled', type: 'boolean' },
    maxAngle: { label: 'Maximum angle', range: { min: 0, max: 0.8, step: 0.01 } },
    response: { label: 'Response', range: { min: 0, max: 40, step: 0.1 } },
    turnParameter: { label: 'Turn parameter', type: 'text' },
    forwardParameter: { label: 'Forward parameter', type: 'text' },
  }),
  bob: Object.freeze({
    enabled: { label: 'Enabled', type: 'boolean' },
    amplitude: { label: 'Vertical amplitude', range: { min: 0, max: 0.4, step: 0.001 } },
    frequency: { label: 'Frequency', range: { min: 0, max: 8, step: 0.01 } },
    lateral: { label: 'Lateral amplitude', range: { min: 0, max: 0.25, step: 0.001 } },
    speedParameter: { label: 'Speed parameter', type: 'text' },
  }),
  squash: Object.freeze({
    enabled: { label: 'Enabled', type: 'boolean' },
    amount: { label: 'Amount', range: { min: 0, max: 0.45, step: 0.001 } },
    response: { label: 'Response', range: { min: 0, max: 40, step: 0.1 } },
    verticalParameter: { label: 'Vertical parameter', type: 'text' },
  }),
  rootMotion: Object.freeze({
    policy: { label: 'Policy', type: 'select', options: MOTION_ROOT_POLICIES },
    axes: { label: 'Translation axes', type: 'boolean3' },
    scale: { label: 'Scale', range: { min: 0, max: 8, step: 0.01 } },
    applyYaw: { label: 'Apply yaw', type: 'boolean' },
  }),
  events: Object.freeze({
    maxPerUpdate: { label: 'Maximum events/update', range: { min: 1, max: 512, step: 1 } },
    fireOnLoop: { label: 'Fire across loops', type: 'boolean' },
    minimumWeight: { label: 'Minimum blend weight', range: { min: 0, max: 1, step: 0.01 } },
  }),
});

export const MOTION_SETTING_FIELD_SCHEMA = Object.freeze(Object.fromEntries(
  MOTION_SETTING_GROUPS.map((group) => [group.id, Object.freeze(Object.fromEntries(
    Object.entries(FIELDS[group.id]).map(([key, field]) => [key, Object.freeze({
      ...field,
      defaultValue: DEFAULT_MOTION_SETTINGS[group.id][key],
      group: group.id,
      id: `${group.id}.${key}`,
      key,
      type: field.type ?? 'number',
    })]),
  ))]),
));

const plain = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const text = (value, fallback) => typeof value === 'string' && value.trim() ? value.trim() : fallback;

function sourceGroup(options, id) {
  return plain(options?.[id]) ? options[id] : {};
}

function boolean3(value, fallback) {
  return Array.isArray(value) && value.length >= 3
    ? value.slice(0, 3).map(Boolean)
    : [...fallback];
}

/** Normalizes partial style settings into a complete mutable object. */
export function createMotionSettings(options = {}) {
  const p = sourceGroup(options, 'playback');
  const t = sourceGroup(options, 'transitions');
  const l = sourceGroup(options, 'lean');
  const b = sourceGroup(options, 'bob');
  const s = sourceGroup(options, 'squash');
  const r = sourceGroup(options, 'rootMotion');
  const e = sourceGroup(options, 'events');
  const d = DEFAULT_MOTION_SETTINGS;
  return {
    playback: {
      cadence: MOTION_CADENCE_MODES.includes(p.cadence) ? p.cadence : d.playback.cadence,
      sampleRate: clamp(finite(p.sampleRate, d.playback.sampleRate), 1, 240),
      speed: clamp(finite(p.speed, d.playback.speed), 0, 8),
      maxDelta: clamp(finite(p.maxDelta, d.playback.maxDelta), 0.001, 1),
    },
    transitions: {
      duration: clamp(finite(t.duration, d.transitions.duration), 0, 8),
      easing: MOTION_EASING_MODES.includes(t.easing) ? t.easing : d.transitions.easing,
      allowInterrupt: t.allowInterrupt === undefined ? d.transitions.allowInterrupt : Boolean(t.allowInterrupt),
      syncPhase: t.syncPhase === undefined ? d.transitions.syncPhase : Boolean(t.syncPhase),
    },
    lean: {
      enabled: l.enabled === undefined ? d.lean.enabled : Boolean(l.enabled),
      maxAngle: clamp(finite(l.maxAngle, d.lean.maxAngle), 0, Math.PI / 2),
      response: clamp(finite(l.response, d.lean.response), 0, 100),
      turnParameter: text(l.turnParameter, d.lean.turnParameter),
      forwardParameter: text(l.forwardParameter, d.lean.forwardParameter),
    },
    bob: {
      enabled: b.enabled === undefined ? d.bob.enabled : Boolean(b.enabled),
      amplitude: clamp(finite(b.amplitude, d.bob.amplitude), 0, 1),
      frequency: clamp(finite(b.frequency, d.bob.frequency), 0, 20),
      lateral: clamp(finite(b.lateral, d.bob.lateral), 0, 1),
      speedParameter: text(b.speedParameter, d.bob.speedParameter),
    },
    squash: {
      enabled: s.enabled === undefined ? d.squash.enabled : Boolean(s.enabled),
      amount: clamp(finite(s.amount, d.squash.amount), 0, 0.8),
      response: clamp(finite(s.response, d.squash.response), 0, 100),
      verticalParameter: text(s.verticalParameter, d.squash.verticalParameter),
    },
    rootMotion: {
      policy: MOTION_ROOT_POLICIES.includes(r.policy) ? r.policy : d.rootMotion.policy,
      axes: boolean3(r.axes, d.rootMotion.axes),
      scale: clamp(finite(r.scale, d.rootMotion.scale), 0, 20),
      applyYaw: r.applyYaw === undefined ? d.rootMotion.applyYaw : Boolean(r.applyYaw),
    },
    events: {
      maxPerUpdate: Math.round(clamp(finite(e.maxPerUpdate, d.events.maxPerUpdate), 1, 2048)),
      fireOnLoop: e.fireOnLoop === undefined ? d.events.fireOnLoop : Boolean(e.fireOnLoop),
      minimumWeight: clamp(finite(e.minimumWeight, d.events.minimumWeight), 0, 1),
    },
  };
}

/** Deep-merges grouped overrides and re-normalizes them. */
export function mergeMotionSettings(base = {}, overrides = {}) {
  const current = createMotionSettings(base);
  return createMotionSettings(Object.fromEntries(
    MOTION_SETTING_GROUPS.map(({ id }) => [id, {
      ...current[id],
      ...(plain(overrides?.[id]) ? overrides[id] : {}),
    }]),
  ));
}

export function interpolateMotionSettings(from, to, amount) {
  const a = createMotionSettings(from);
  const b = createMotionSettings(to);
  const t = clamp(finite(amount, 0), 0, 1);
  const output = {};
  for (const { id } of MOTION_SETTING_GROUPS) {
    output[id] = {};
    for (const key of Object.keys(a[id])) {
      const av = a[id][key];
      const bv = b[id][key];
      if (typeof av === 'number' && typeof bv === 'number') output[id][key] = av + (bv - av) * t;
      else output[id][key] = t < 0.5 ? av : bv;
    }
  }
  return createMotionSettings(output);
}
