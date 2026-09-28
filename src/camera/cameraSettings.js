// Canonical, serializable settings for composable camera rigs. These values
// deliberately describe behaviour rather than named game genres: the named
// archetypes in cameraGenerator.js are only editable starting points.

export const DEFAULT_CAMERA_SETTINGS = Object.freeze({
  follow: Object.freeze({
    offset: Object.freeze([1.15, 2.8, 6.4]),
    targetOffset: Object.freeze([0, 1.45, 0]),
    yawOnly: true,
  }),
  framing: Object.freeze({
    screenX: 0.5,
    screenY: 0.54,
    horizontalScale: 0.72,
    verticalScale: 0.58,
  }),
  lens: Object.freeze({
    fov: 48,
    near: 0.1,
    far: 1200,
    speedFov: 3.5,
    speedReference: 8,
  }),
  damping: Object.freeze({
    position: 7.5,
    aim: 10,
    lens: 8,
    teleportDistance: 35,
  }),
  lookAhead: Object.freeze({
    enabled: true,
    time: 0.32,
    smoothing: 7,
    maxDistance: 3.2,
    horizontalOnly: true,
  }),
  collision: Object.freeze({
    enabled: true,
    radius: 0.28,
    padding: 0.14,
    minimumDistance: 0.75,
    recoveryDamping: 5.5,
  }),
  noise: Object.freeze({
    enabled: false,
    seed: 1,
    frequency: 0.8,
    positionAmplitude: 0.025,
    rotationAmplitude: 0.004,
    octaves: 2,
    persistence: 0.5,
    lacunarity: 1.9,
  }),
  impulse: Object.freeze({
    positionScale: 1,
    rotationScale: 1,
    decay: 12,
    maxPosition: 1.25,
    maxRotation: 0.18,
  }),
});

export const CAMERA_SETTING_GROUPS = Object.freeze([
  Object.freeze({ id: 'follow', label: 'Follow', description: 'Camera and aim offsets relative to the target.' }),
  Object.freeze({ id: 'framing', label: 'Framing', description: 'Screen-space composition without baking a camera genre.' }),
  Object.freeze({ id: 'lens', label: 'Lens', description: 'Perspective and speed-sensitive field of view.' }),
  Object.freeze({ id: 'damping', label: 'Damping', description: 'Frame-rate-independent response rates.' }),
  Object.freeze({ id: 'lookAhead', label: 'Look Ahead', description: 'Velocity prediction that remains independent of frame rate.' }),
  Object.freeze({ id: 'collision', label: 'Collision', description: 'Optional host-query camera obstruction response.' }),
  Object.freeze({ id: 'noise', label: 'Noise', description: 'Seeded, time-based procedural drift for handheld motion and environmental vibration.' }),
  Object.freeze({ id: 'impulse', label: 'Impulse', description: 'Layered recoil and shake limits.' }),
]);

const FIELD_DEFINITIONS = {
  follow: {
    offset: { label: 'Camera Offset', type: 'vector3', ranges: [[-8, 8, 0.05], [0, 12, 0.05], [0.2, 20, 0.05]], description: 'Right, up and backward offset in target-local meters.' },
    targetOffset: { label: 'Target Offset', type: 'vector3', ranges: [[-5, 5, 0.05], [-2, 8, 0.05], [-5, 5, 0.05]], description: 'Aim point relative to the target origin.' },
    yawOnly: { label: 'Yaw Only', type: 'boolean', description: 'Ignore target pitch and roll when rotating the follow offset.' },
  },
  framing: {
    screenX: { label: 'Screen X', range: [0.1, 0.9, 0.01], description: 'Desired horizontal target position in normalized screen space.' },
    screenY: { label: 'Screen Y', range: [0.1, 0.9, 0.01], description: 'Desired vertical target position in normalized screen space.' },
    horizontalScale: { label: 'Horizontal Strength', range: [0, 2, 0.01], description: 'World-space strength of horizontal composition.' },
    verticalScale: { label: 'Vertical Strength', range: [0, 2, 0.01], description: 'World-space strength of vertical composition.' },
  },
  lens: {
    fov: { label: 'Field of View', range: [15, 110, 0.1], unit: '°', description: 'Vertical perspective field of view.' },
    near: { label: 'Near Plane', range: [0.01, 5, 0.01], unit: 'm', description: 'Near clipping plane.' },
    far: { label: 'Far Plane', range: [50, 10000, 10], unit: 'm', description: 'Far clipping plane.' },
    speedFov: { label: 'Speed FOV', range: [-10, 30, 0.1], unit: '°', description: 'Additional FOV at reference speed.' },
    speedReference: { label: 'Reference Speed', range: [0.1, 50, 0.1], unit: 'm/s', description: 'Speed at which Speed FOV is fully applied.' },
  },
  damping: {
    position: { label: 'Position Response', range: [0, 40, 0.1], description: 'Exponential position response; zero snaps.' },
    aim: { label: 'Aim Response', range: [0, 40, 0.1], description: 'Exponential aim response; zero snaps.' },
    lens: { label: 'Lens Response', range: [0, 40, 0.1], description: 'Exponential field-of-view response; zero snaps.' },
    teleportDistance: { label: 'Teleport Threshold', range: [1, 500, 0.5], unit: 'm', description: 'Target movement that forces a clean rig reset.' },
  },
  lookAhead: {
    enabled: { label: 'Enabled', type: 'boolean', description: 'Enable velocity-based prediction.' },
    time: { label: 'Prediction Time', range: [0, 3, 0.01], unit: 's', description: 'Seconds ahead to predict the target.' },
    smoothing: { label: 'Velocity Response', range: [0, 40, 0.1], description: 'Exponential smoothing of measured target velocity.' },
    maxDistance: { label: 'Maximum Distance', range: [0, 30, 0.05], unit: 'm', description: 'Maximum look-ahead displacement.' },
    horizontalOnly: { label: 'Horizontal Only', type: 'boolean', description: 'Remove vertical velocity from prediction.' },
  },
  collision: {
    enabled: { label: 'Enabled', type: 'boolean', description: 'Call the optional host collision query.' },
    radius: { label: 'Camera Radius', range: [0, 2, 0.01], unit: 'm', description: 'Radius passed to sphere-aware host queries.' },
    padding: { label: 'Surface Padding', range: [0, 2, 0.01], unit: 'm', description: 'Extra distance kept from an obstruction.' },
    minimumDistance: { label: 'Minimum Distance', range: [0.05, 10, 0.01], unit: 'm', description: 'Closest allowed camera distance from the aim point.' },
    recoveryDamping: { label: 'Recovery Response', range: [0, 40, 0.1], description: 'Speed at which the camera moves back after an obstruction clears.' },
  },
  noise: {
    enabled: { label: 'Enabled', type: 'boolean', description: 'Enable continuous deterministic camera noise.' },
    seed: { label: 'Seed', range: [1, 1000000, 1], description: 'Stable phase seed; equal settings and elapsed time produce equal offsets.' },
    frequency: { label: 'Base Frequency', range: [0.01, 20, 0.01], unit: 'Hz', description: 'Base speed of the procedural noise.' },
    positionAmplitude: { label: 'Position Amplitude', range: [0, 1, 0.001], unit: 'm', description: 'Maximum normalized positional drift.' },
    rotationAmplitude: { label: 'Rotation Amplitude', range: [0, 0.4, 0.001], unit: 'rad', description: 'Maximum normalized angular drift.' },
    octaves: { label: 'Octaves', range: [1, 8, 1], description: 'Number of deterministic sine bands.' },
    persistence: { label: 'Persistence', range: [0, 1, 0.01], description: 'Amplitude retained by each higher-frequency band.' },
    lacunarity: { label: 'Lacunarity', range: [1, 4, 0.01], description: 'Frequency multiplier between bands.' },
  },
  impulse: {
    positionScale: { label: 'Position Scale', range: [0, 5, 0.01], description: 'Global multiplier for positional impulses.' },
    rotationScale: { label: 'Rotation Scale', range: [0, 5, 0.01], description: 'Global multiplier for rotational impulses.' },
    decay: { label: 'Default Decay', range: [0.1, 60, 0.1], description: 'Default exponential impulse decay.' },
    maxPosition: { label: 'Position Limit', range: [0, 10, 0.01], unit: 'm', description: 'Maximum summed positional shake.' },
    maxRotation: { label: 'Rotation Limit', range: [0, 1.2, 0.01], unit: 'rad', description: 'Maximum summed rotational shake.' },
  },
};

export const CAMERA_SETTING_FIELD_SCHEMA = Object.freeze(Object.fromEntries(
  CAMERA_SETTING_GROUPS.map((group) => [group.id, Object.freeze(Object.fromEntries(
    Object.entries(FIELD_DEFINITIONS[group.id]).map(([key, field]) => [key, Object.freeze({
      ...field,
      defaultValue: DEFAULT_CAMERA_SETTINGS[group.id][key],
      group: group.id,
      id: `${group.id}.${key}`,
      key,
      type: field.type ?? 'number',
    })]),
  ))]),
));

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};

function number(source, key, fallback, min, max) {
  return clamp(finite(source[key], fallback), min, max);
}

function vector(value, fallback, ranges) {
  if (!Array.isArray(value) || value.length < ranges.length) return [...fallback];
  return ranges.map(([min, max], index) => clamp(finite(value[index], fallback[index]), min, max));
}

/** Normalizes partial settings into a complete mutable plain object. */
export function createCameraSettings(options = {}) {
  const follow = object(options.follow);
  const framing = object(options.framing);
  const lens = object(options.lens);
  const damping = object(options.damping);
  const lookAhead = object(options.lookAhead);
  const collision = object(options.collision);
  const noise = object(options.noise);
  const impulse = object(options.impulse);
  const d = DEFAULT_CAMERA_SETTINGS;

  return {
    follow: {
      offset: vector(follow.offset, d.follow.offset, [[-50, 50], [-20, 50], [0.01, 100]]),
      targetOffset: vector(follow.targetOffset, d.follow.targetOffset, [[-50, 50], [-20, 50], [-50, 50]]),
      yawOnly: follow.yawOnly === undefined ? d.follow.yawOnly : Boolean(follow.yawOnly),
    },
    framing: {
      screenX: number(framing, 'screenX', d.framing.screenX, 0, 1),
      screenY: number(framing, 'screenY', d.framing.screenY, 0, 1),
      horizontalScale: number(framing, 'horizontalScale', d.framing.horizontalScale, 0, 4),
      verticalScale: number(framing, 'verticalScale', d.framing.verticalScale, 0, 4),
    },
    lens: {
      fov: number(lens, 'fov', d.lens.fov, 5, 150),
      near: number(lens, 'near', d.lens.near, 0.001, 20),
      far: number(lens, 'far', d.lens.far, 1, 100000),
      speedFov: number(lens, 'speedFov', d.lens.speedFov, -60, 90),
      speedReference: number(lens, 'speedReference', d.lens.speedReference, 0.01, 500),
    },
    damping: {
      position: number(damping, 'position', d.damping.position, 0, 100),
      aim: number(damping, 'aim', d.damping.aim, 0, 100),
      lens: number(damping, 'lens', d.damping.lens, 0, 100),
      teleportDistance: number(damping, 'teleportDistance', d.damping.teleportDistance, 0.01, 10000),
    },
    lookAhead: {
      enabled: lookAhead.enabled === undefined ? d.lookAhead.enabled : Boolean(lookAhead.enabled),
      time: number(lookAhead, 'time', d.lookAhead.time, 0, 10),
      smoothing: number(lookAhead, 'smoothing', d.lookAhead.smoothing, 0, 100),
      maxDistance: number(lookAhead, 'maxDistance', d.lookAhead.maxDistance, 0, 100),
      horizontalOnly: lookAhead.horizontalOnly === undefined ? d.lookAhead.horizontalOnly : Boolean(lookAhead.horizontalOnly),
    },
    collision: {
      enabled: collision.enabled === undefined ? d.collision.enabled : Boolean(collision.enabled),
      radius: number(collision, 'radius', d.collision.radius, 0, 20),
      padding: number(collision, 'padding', d.collision.padding, 0, 20),
      minimumDistance: number(collision, 'minimumDistance', d.collision.minimumDistance, 0.01, 100),
      recoveryDamping: number(collision, 'recoveryDamping', d.collision.recoveryDamping, 0, 100),
    },
    noise: {
      enabled: noise.enabled === undefined ? d.noise.enabled : Boolean(noise.enabled),
      seed: Math.round(number(noise, 'seed', d.noise.seed, 0, 0xffffffff)),
      frequency: number(noise, 'frequency', d.noise.frequency, 0.001, 100),
      positionAmplitude: number(noise, 'positionAmplitude', d.noise.positionAmplitude, 0, 20),
      rotationAmplitude: number(noise, 'rotationAmplitude', d.noise.rotationAmplitude, 0, Math.PI),
      octaves: Math.round(number(noise, 'octaves', d.noise.octaves, 1, 12)),
      persistence: number(noise, 'persistence', d.noise.persistence, 0, 1),
      lacunarity: number(noise, 'lacunarity', d.noise.lacunarity, 1, 8),
    },
    impulse: {
      positionScale: number(impulse, 'positionScale', d.impulse.positionScale, 0, 20),
      rotationScale: number(impulse, 'rotationScale', d.impulse.rotationScale, 0, 20),
      decay: number(impulse, 'decay', d.impulse.decay, 0.01, 200),
      maxPosition: number(impulse, 'maxPosition', d.impulse.maxPosition, 0, 100),
      maxRotation: number(impulse, 'maxRotation', d.impulse.maxRotation, 0, Math.PI),
    },
  };
}

export function mergeCameraSettings(base, overrides = {}) {
  const source = createCameraSettings(base);
  const merged = {};
  for (const group of CAMERA_SETTING_GROUPS) {
    merged[group.id] = { ...source[group.id], ...object(overrides[group.id]) };
  }
  return createCameraSettings(merged);
}
