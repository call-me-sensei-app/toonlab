// Engine-neutral pose, clip sampler, and object-rig adapters. A game can feed
// imported animation samplers, generated keyframes, or fully procedural
// harmonic clips through the same controller contract.

const plain = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp01 = (value) => Math.min(Math.max(finite(value), 0), 1);
const vector = (value, fallback, size = 3) => Array.isArray(value) && value.length >= size
  ? value.slice(0, size).map((entry, index) => finite(entry, fallback[index]))
  : [...fallback];

const IDENTITY_TRANSFORM = Object.freeze({
  position: Object.freeze([0, 0, 0]),
  rotation: Object.freeze([0, 0, 0]),
  scale: Object.freeze([1, 1, 1]),
});

export function normalizeMotionTransform(value = {}) {
  const source = plain(value) ? value : {};
  return {
    position: vector(source.position ?? source.p, IDENTITY_TRANSFORM.position),
    rotation: vector(source.rotation ?? source.r, IDENTITY_TRANSFORM.rotation),
    scale: vector(source.scale ?? source.s, IDENTITY_TRANSFORM.scale),
  };
}

export function createEmptyMotionPose() {
  return { bones: {}, root: normalizeMotionTransform() };
}

export function normalizeMotionPose(value = {}) {
  const source = plain(value) ? value : {};
  return {
    bones: Object.fromEntries(Object.entries(plain(source.bones) ? source.bones : {})
      .map(([role, transform]) => [role, normalizeMotionTransform(transform)])),
    root: normalizeMotionTransform(source.root),
  };
}

function lerpAngle(a, b, t) {
  let delta = (b - a) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return a + delta * t;
}

function blendTransform(a, b, t) {
  return {
    position: a.position.map((value, index) => value + (b.position[index] - value) * t),
    rotation: a.rotation.map((value, index) => lerpAngle(value, b.rotation[index], t)),
    scale: a.scale.map((value, index) => value + (b.scale[index] - value) * t),
  };
}

/** Blends two sparse poses while treating absent roles as identity transforms. */
export function blendMotionPoses(from, to, amount) {
  const a = normalizeMotionPose(from);
  const b = normalizeMotionPose(to);
  const t = clamp01(amount);
  const roles = new Set([...Object.keys(a.bones), ...Object.keys(b.bones)]);
  return {
    bones: Object.fromEntries([...roles].map((role) => [role, blendTransform(
      a.bones[role] ?? normalizeMotionTransform(),
      b.bones[role] ?? normalizeMotionTransform(),
      t,
    )])),
    root: blendTransform(a.root, b.root, t),
  };
}

/** Weighted normalized blend for arbitrary blend-space fan-in. */
export function blendMotionPoseList(entries = []) {
  const active = entries.filter((entry) => entry?.pose && finite(entry.weight, 0) > 0);
  if (active.length === 0) return createEmptyMotionPose();
  let output = normalizeMotionPose(active[0].pose);
  let total = finite(active[0].weight, 1);
  for (let index = 1; index < active.length; index += 1) {
    const weight = finite(active[index].weight, 0);
    output = blendMotionPoses(output, active[index].pose, weight / (total + weight));
    total += weight;
  }
  return output;
}

function maskMatches(role, mask) {
  if (!Array.isArray(mask) || mask.length === 0) return true;
  return mask.some((pattern) => {
    if (pattern === '*') return true;
    if (pattern.endsWith('*')) return role.startsWith(pattern.slice(0, -1));
    return role === pattern;
  });
}

/** Applies an additive or override layer with an arbitrary role mask. */
export function layerMotionPose(base, layer, { mode = 'additive', weight = 1, mask = [] } = {}) {
  const output = normalizeMotionPose(base);
  const source = normalizeMotionPose(layer);
  const amount = clamp01(weight);
  for (const [role, transform] of Object.entries(source.bones)) {
    if (!maskMatches(role, mask)) continue;
    const target = output.bones[role] ?? normalizeMotionTransform();
    if (mode === 'override') {
      output.bones[role] = blendTransform(target, transform, amount);
    } else {
      output.bones[role] = {
        position: target.position.map((value, index) => value + transform.position[index] * amount),
        rotation: target.rotation.map((value, index) => value + transform.rotation[index] * amount),
        scale: target.scale.map((value, index) => value * (1 + (transform.scale[index] - 1) * amount)),
      };
    }
  }
  if (maskMatches('root', mask)) {
    output.root = mode === 'override'
      ? blendTransform(output.root, source.root, amount)
      : {
        position: output.root.position.map((value, index) => value + source.root.position[index] * amount),
        rotation: output.root.rotation.map((value, index) => value + source.root.rotation[index] * amount),
        scale: output.root.scale.map((value, index) => value * (1 + (source.root.scale[index] - 1) * amount)),
      };
  }
  return output;
}

function normalizeKey(value, index, duration) {
  const source = plain(value) ? value : {};
  return {
    time: Math.min(Math.max(finite(source.time ?? source.at, duration ? index / Math.max(duration, 1) : index), 0), duration),
    transform: normalizeMotionTransform(source),
  };
}

function sampleTrack(track, time) {
  if (track.length === 0) return normalizeMotionTransform();
  if (track.length === 1 || time <= track[0].time) return normalizeMotionTransform(track[0].transform);
  if (time >= track.at(-1).time) return normalizeMotionTransform(track.at(-1).transform);
  let upper = 1;
  while (upper < track.length && track[upper].time < time) upper += 1;
  const a = track[upper - 1];
  const b = track[upper];
  return blendTransform(a.transform, b.transform, (time - a.time) / Math.max(b.time - a.time, 1e-6));
}

function normalizeClipEvents(events = [], duration = 1) {
  return (Array.isArray(events) ? events : []).map((entry, index) => {
    const source = plain(entry) ? entry : { name: entry };
    const rawTime = finite(source.time ?? source.at, 0);
    return {
      id: String(source.id ?? `event-${index}`),
      name: String(source.name ?? source.type ?? 'event'),
      time: Math.min(Math.max(source.normalized ? rawTime * duration : rawTime, 0), duration),
      once: Boolean(source.once),
      payload: plain(source.payload) ? { ...source.payload } : {},
    };
  }).sort((a, b) => a.time - b.time);
}

/**
 * Creates a serializable keyframe sampler. Tracks are keyed by semantic bone
 * role, so a missing role on a target skeleton is harmless.
 */
export function createKeyframeMotionClip(definition = {}) {
  const duration = Math.max(0.001, finite(definition.duration, 1));
  const tracks = Object.fromEntries(Object.entries(plain(definition.tracks) ? definition.tracks : {})
    .map(([role, values]) => [role, (Array.isArray(values) ? values : [])
      .map((entry, index) => normalizeKey(entry, index, duration))
      .sort((a, b) => a.time - b.time)]));
  const rootTrack = (Array.isArray(definition.root) ? definition.root : [])
    .map((entry, index) => normalizeKey(entry, index, duration))
    .sort((a, b) => a.time - b.time);
  const events = normalizeClipEvents(definition.events, duration);
  return {
    id: String(definition.id ?? 'keyframe-clip'),
    duration,
    events,
    sample(time, { loop = true } = {}) {
      const local = loop
        ? ((finite(time) % duration) + duration) % duration
        : Math.min(Math.max(finite(time), 0), duration);
      return {
        bones: Object.fromEntries(Object.entries(tracks).map(([role, track]) => [role, sampleTrack(track, local)])),
        root: sampleTrack(rootTrack, local),
      };
    },
    dispose() {},
  };
}

function sampleHarmonics(channels, time, base) {
  const output = [...base];
  for (const channel of Array.isArray(channels) ? channels : []) {
    const axis = Math.min(Math.max(Math.round(finite(channel.axis, 0)), 0), 2);
    const wave = channel.wave === 'triangle'
      ? (2 / Math.PI) * Math.asin(Math.sin((finite(channel.frequency, 1) * time + finite(channel.phase, 0)) * Math.PI * 2))
      : channel.wave === 'square'
        ? Math.sign(Math.sin((finite(channel.frequency, 1) * time + finite(channel.phase, 0)) * Math.PI * 2))
        : Math.sin((finite(channel.frequency, 1) * time + finite(channel.phase, 0)) * Math.PI * 2);
    output[axis] += finite(channel.offset, 0) + finite(channel.amplitude, 0) * wave;
  }
  return output;
}

function sampleHarmonicTransform(definition, time) {
  const source = plain(definition) ? definition : {};
  return {
    position: sampleHarmonics(source.position, time, [0, 0, 0]),
    rotation: sampleHarmonics(source.rotation, time, [0, 0, 0]),
    scale: sampleHarmonics(source.scale, time, [1, 1, 1]),
  };
}

/**
 * Infinite procedural clip primitive: every role may have any number of sine,
 * triangle, or square channels. It is useful for generated prototypes and is
 * not tied to a fixed animation-name catalog.
 */
export function createHarmonicMotionClip(definition = {}) {
  const duration = Math.max(0.001, finite(definition.duration, 1));
  const channels = plain(definition.channels) ? definition.channels : {};
  return {
    id: String(definition.id ?? 'harmonic-clip'),
    duration,
    events: normalizeClipEvents(definition.events, duration),
    sample(time, { loop = true } = {}) {
      const local = loop
        ? ((finite(time) % duration) + duration) % duration
        : Math.min(Math.max(finite(time), 0), duration);
      return {
        bones: Object.fromEntries(Object.entries(channels)
          .filter(([role]) => role !== 'root')
          .map(([role, track]) => [role, sampleHarmonicTransform(track, local)])),
        root: sampleHarmonicTransform(channels.root, local),
      };
    },
    dispose() {},
  };
}

function trackTarget(trackName) {
  const match = String(trackName).match(/^(.*)\.(position|quaternion|rotation|scale)$/);
  if (!match) return null;
  const path = match[1];
  const bracket = path.match(/\[([^\]]+)\]$/);
  const bone = bracket?.[1] ?? path.split(/[/.]/).filter(Boolean).at(-1) ?? path;
  return { bone, property: match[2] };
}

function quaternionToEuler(value) {
  const [x, y, z, w] = value;
  const test = 2 * (w * y - z * x);
  return [
    Math.atan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y)),
    Math.asin(Math.min(Math.max(test, -1), 1)),
    Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z)),
  ];
}

function relativeQuaternion(value, reference) {
  const [ax, ay, az, aw] = reference;
  const [bx, by, bz, bw] = value;
  // inverse(reference) * value; normalized animation quaternions make the
  // conjugate the inverse.
  return [
    aw * bx - ax * bw - ay * bz + az * by,
    aw * by + ax * bz - ay * bw - az * bx,
    aw * bz - ax * by + ay * bx - az * bw,
    aw * bw + ax * bx + ay * by + az * bz,
  ];
}

/**
 * Adapts a Three.js AnimationClip without coupling the graph to an
 * AnimationMixer. Track names are mapped to semantic roles, evaluated into
 * first-frame-relative transforms, then blended like any generated clip.
 */
export function createThreeAnimationClipSampler(animationClip, {
  events = [],
  roleMap = {},
  rootRole = 'root',
  reference = 'firstFrame',
} = {}) {
  if (!animationClip || !Array.isArray(animationClip.tracks)) {
    throw new TypeError('createThreeAnimationClipSampler requires a Three.js AnimationClip.');
  }
  const duration = Math.max(0.001, finite(animationClip.duration, 1));
  const roleByBone = new Map(Object.entries(roleMap).map(([role, bone]) => [String(bone), role]));
  const tracks = animationClip.tracks.map((track) => {
    const target = trackTarget(track.name);
    if (!target || typeof track.createInterpolant !== 'function') return null;
    const interpolant = track.createInterpolant();
    return {
      ...target,
      role: roleByBone.get(target.bone) ?? target.bone,
      interpolant,
      initial: Array.from(interpolant.evaluate(0)),
    };
  }).filter(Boolean);
  const explicitReference = plain(reference) ? normalizeMotionPose(reference) : null;

  function relativeValue(track, sampled) {
    const referenceTransform = track.role === rootRole
      ? explicitReference?.root
      : explicitReference?.bones?.[track.role];
    if (track.property === 'quaternion') {
      const base = referenceTransform?.rotation;
      return base
        ? quaternionToEuler(sampled).map((value, index) => value - base[index])
        : quaternionToEuler(reference === 'none' ? sampled : relativeQuaternion(sampled, track.initial));
    }
    if (track.property === 'rotation') {
      const base = referenceTransform?.rotation ?? (reference === 'none' ? [0, 0, 0] : track.initial);
      return sampled.map((value, index) => value - finite(base[index], 0));
    }
    if (track.property === 'position') {
      const base = referenceTransform?.position ?? (reference === 'none' ? [0, 0, 0] : track.initial);
      return sampled.map((value, index) => value - finite(base[index], 0));
    }
    const base = referenceTransform?.scale ?? (reference === 'none' ? [1, 1, 1] : track.initial);
    return sampled.map((value, index) => value / Math.max(Math.abs(finite(base[index], 1)), 1e-6));
  }

  return {
    id: String(animationClip.name || animationClip.uuid || 'three-animation-clip'),
    duration,
    events: normalizeClipEvents(events, duration),
    sample(time, { loop = true } = {}) {
      const local = loop
        ? ((finite(time) % duration) + duration) % duration
        : Math.min(Math.max(finite(time), 0), duration);
      const pose = createEmptyMotionPose();
      for (const track of tracks) {
        const sampled = Array.from(track.interpolant.evaluate(local));
        const target = track.role === rootRole ? pose.root : (pose.bones[track.role] ??= normalizeMotionTransform());
        const property = track.property === 'quaternion' ? 'rotation' : track.property;
        target[property] = relativeValue(track, sampled);
      }
      return pose;
    },
    dispose() {},
  };
}

function findNamed(root, name) {
  if (!root || !name) return null;
  if (root.name === name) return root;
  if (typeof root.getObjectByName === 'function') return root.getObjectByName(name) ?? null;
  let result = null;
  root.traverse?.((object) => {
    if (!result && object.name === name) result = object;
  });
  return result;
}

function readVector(target, fallback) {
  return target && ['x', 'y', 'z'].every((key) => Number.isFinite(target[key]))
    ? [target.x, target.y, target.z]
    : [...fallback];
}

function writeVector(target, values) {
  if (!target) return;
  if (typeof target.set === 'function') target.set(...values);
  else [target.x, target.y, target.z] = values;
}

/**
 * Adapts a Three.js-like object hierarchy to semantic role poses. Role values
 * may be objects or names. Missing roles are counted and ignored by design.
 */
export function createObjectMotionRig(root, { roles = {}, missingBonePolicy = 'ignore' } = {}) {
  const bindings = {};
  const reference = {};
  const missingBones = new Set();
  for (const [role, target] of Object.entries(roles)) {
    const object = typeof target === 'string' ? findNamed(root, target) : target;
    if (!object) {
      missingBones.add(role);
      if (missingBonePolicy === 'error') throw new Error(`Motion rig is missing role "${role}".`);
      continue;
    }
    bindings[role] = object;
    reference[role] = {
      position: readVector(object.position, [0, 0, 0]),
      rotation: readVector(object.rotation, [0, 0, 0]),
      scale: readVector(object.scale, [1, 1, 1]),
    };
  }
  const rootReference = {
    position: readVector(root?.position, [0, 0, 0]),
    rotation: readVector(root?.rotation, [0, 0, 0]),
    scale: readVector(root?.scale, [1, 1, 1]),
  };
  const worldOffset = [0, 0, 0];
  let yawOffset = 0;
  let disposed = false;

  function applyPose(value) {
    if (disposed) return;
    const pose = normalizeMotionPose(value);
    for (const [role, object] of Object.entries(bindings)) {
      const base = reference[role];
      const transform = pose.bones[role] ?? normalizeMotionTransform();
      writeVector(object.position, base.position.map((entry, index) => entry + transform.position[index]));
      writeVector(object.rotation, base.rotation.map((entry, index) => entry + transform.rotation[index]));
      writeVector(object.scale, base.scale.map((entry, index) => entry * transform.scale[index]));
    }
    for (const role of Object.keys(pose.bones)) {
      if (!bindings[role]) missingBones.add(role);
    }
    if (root) {
      writeVector(root.position, rootReference.position.map((entry, index) => entry + worldOffset[index] + pose.root.position[index]));
      writeVector(root.rotation, rootReference.rotation.map((entry, index) => entry + pose.root.rotation[index] + (index === 1 ? yawOffset : 0)));
      writeVector(root.scale, rootReference.scale.map((entry, index) => entry * pose.root.scale[index]));
    }
  }

  return {
    root,
    roles: bindings,
    applyPose,
    applyRootMotion(delta = [0, 0, 0], yaw = 0) {
      for (let index = 0; index < 3; index += 1) worldOffset[index] += finite(delta[index], 0);
      yawOffset += finite(yaw, 0);
    },
    reset() {
      worldOffset.fill(0);
      yawOffset = 0;
      applyPose(createEmptyMotionPose());
    },
    stats() {
      return {
        boundBoneCount: Object.keys(bindings).length,
        missingBoneCount: missingBones.size,
        missingBones: [...missingBones],
        rootOffset: [...worldOffset],
      };
    },
    dispose() {
      disposed = true;
    },
  };
}
