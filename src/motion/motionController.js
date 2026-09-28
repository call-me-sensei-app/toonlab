import {
  createMotionClipSlots,
  createMotionGraph,
  evaluateMotionCondition,
  validateMotionGraph,
} from './motionGraph.js';
import {
  blendMotionPoseList,
  blendMotionPoses,
  createEmptyMotionPose,
  layerMotionPose,
  normalizeMotionPose,
} from './motionClip.js';
import { createMotionSettings } from './motionSettings.js';

const plain = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp01 = (value) => Math.min(Math.max(finite(value), 0), 1);

const EMPTY_CLIP = Object.freeze({
  id: 'missing-clip',
  duration: 1,
  events: Object.freeze([]),
  sample: () => createEmptyMotionPose(),
  dispose() {},
});

function now() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}

function ease(value, mode) {
  const t = clamp01(value);
  if (mode === 'smoothstep') return t * t * (3 - 2 * t);
  if (mode === 'easeInOutCubic') return t < 0.5 ? 4 * t ** 3 : 1 - ((-2 * t + 2) ** 3) / 2;
  return t;
}

function addWeights(entries) {
  const total = entries.reduce((sum, entry) => sum + Math.max(0, finite(entry.weight, 0)), 0);
  if (total <= 0) return entries.map((entry) => ({ ...entry, weight: 0 }));
  return entries.map((entry) => ({ ...entry, weight: Math.max(0, finite(entry.weight, 0)) / total }));
}

function mergeContributions(entries) {
  const map = new Map();
  for (const entry of entries) {
    const key = entry.key;
    const previous = map.get(key);
    if (previous) previous.weight += entry.weight;
    else map.set(key, { ...entry });
  }
  return [...map.values()];
}

function clipDuration(sampler) {
  return Math.max(0.001, finite(sampler?.duration, 1));
}

function clipSourceKey(source) {
  if (typeof source === 'string' || typeof source === 'number') return String(source);
  if (plain(source)) return String(source.id ?? source.uri ?? source.url ?? source.asset ?? '');
  return '';
}

function normalizeSampler(value, fallbackId = 'clip') {
  if (!value || typeof value.sample !== 'function') return EMPTY_CLIP;
  return {
    id: String(value.id ?? fallbackId),
    duration: clipDuration(value),
    events: Array.isArray(value.events) ? value.events : [],
    sample: value.sample.bind(value),
    dispose: typeof value.dispose === 'function' ? value.dispose.bind(value) : () => {},
  };
}

function parameterValue(parameters, id, fallback = 0) {
  return id && Object.hasOwn(parameters, id) ? parameters[id] : fallback;
}

function transitionExitReady(transition, phase) {
  return transition.exitTime === null || phase >= transition.exitTime;
}

function eventTime(event, duration) {
  const time = finite(event.time ?? event.at, 0);
  return Math.min(Math.max(event.normalized ? time * duration : time, 0), duration);
}

function eventIdentity(event, index) {
  return String(event.id ?? `${event.name ?? event.type ?? 'event'}-${index}`);
}

function getRootTransform(pose) {
  return normalizeMotionPose(pose).root;
}

function subtractVector(a, b) {
  return a.map((value, index) => value - (b[index] ?? 0));
}

function addScaledVector(target, source, amount) {
  for (let index = 0; index < 3; index += 1) target[index] += finite(source[index], 0) * amount;
}

function shortestAngleDelta(from, to) {
  let delta = (finite(to, 0) - finite(from, 0)) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

function motionAtAbsoluteTime(sampler, absoluteTime, loop) {
  const duration = clipDuration(sampler);
  const time = Math.max(0, finite(absoluteTime, 0));
  if (!loop) {
    const root = getRootTransform(sampler.sample(Math.min(time, duration), { loop: false }));
    return { position: root.position, yaw: root.rotation[1] };
  }
  const cycleStart = getRootTransform(sampler.sample(0, { loop: false }));
  const cycleEnd = getRootTransform(sampler.sample(duration, { loop: false }));
  const cycleDelta = subtractVector(cycleEnd.position, cycleStart.position);
  const cycleYawDelta = shortestAngleDelta(cycleStart.rotation[1], cycleEnd.rotation[1]);
  const cycles = Math.floor(time / duration);
  const local = time - cycles * duration;
  const root = getRootTransform(sampler.sample(local, { loop: false }));
  return {
    position: root.position.map((value, index) => value + cycleDelta[index] * cycles),
    yaw: cycleStart.rotation[1]
      + cycleYawDelta * cycles
      + shortestAngleDelta(cycleStart.rotation[1], root.rotation[1]),
  };
}

/**
 * Reusable graph runtime. It has no animation-name enum and no Three.js
 * dependency: arbitrary samplers and a rig adapter are injected by the host.
 */
export function createMotionController({
  graph: graphOptions,
  clipSlots: clipSlotOptions,
  clips = {},
  resolveClip = null,
  rig = null,
  settings: settingOptions,
  onEvent = null,
  parameters = {},
} = {}) {
  let graph = createMotionGraph(graphOptions);
  let clipSlots = createMotionClipSlots(clipSlotOptions);
  let settings = createMotionSettings(settingOptions);
  let clipLibrary = clips;
  let clipResolver = typeof resolveClip === 'function' ? resolveClip : null;
  let rigAdapter = rig;
  let disposed = false;
  let clock = 0;
  let stateTime = 0;
  let currentState = graph.initial;
  let transition = null;
  let pose = createEmptyMotionPose();
  let lastUpdateMs = 0;
  let updateCount = 0;
  let totalEventCount = 0;
  let sampleCount = 0;
  let leanValue = 0;
  let squashValue = 0;
  const triggers = new Set();
  const eventListeners = new Set(typeof onEvent === 'function' ? [onEvent] : []);
  const eventCursors = new Map();
  const rootCursors = new Map();
  const firedOnce = new Set();
  const missingSlots = new Set();
  const parameterValues = {};

  function resetParameters(next = {}) {
    for (const [id, definition] of Object.entries(graph.parameters)) {
      parameterValues[id] = Object.hasOwn(next, id) ? next[id] : definition.default;
    }
    for (const [id, value] of Object.entries(next)) parameterValues[id] = value;
  }
  resetParameters(parameters);

  function libraryGet(key) {
    if (!key) return null;
    if (clipLibrary instanceof Map) return clipLibrary.get(key) ?? null;
    return plain(clipLibrary) ? clipLibrary[key] ?? null : null;
  }

  function resolveSampler(slotId) {
    const slot = clipSlots[slotId];
    if (!slot) {
      missingSlots.add(slotId || '(empty)');
      return { sampler: EMPTY_CLIP, slot: { source: slotId, speed: 1, phase: 0, loop: true, events: [] } };
    }
    const sourceKey = clipSourceKey(slot.source);
    const found = libraryGet(sourceKey) ?? libraryGet(slotId) ?? clipResolver?.(slot.source, slotId, slot) ?? null;
    if (!found) missingSlots.add(slotId);
    else missingSlots.delete(slotId);
    return { sampler: normalizeSampler(found, sourceKey || slotId), slot };
  }

  function sampleClipNode(node, time, prefix, weight = 1) {
    const { sampler, slot } = resolveSampler(node.slot);
    const duration = clipDuration(sampler);
    const speed = Math.max(0, finite(node.speed, 1) * finite(slot.speed, 1));
    const rawTime = time * speed + (finite(node.phase, 0) + finite(slot.phase, 0)) * duration;
    const sampledTime = settings.playback.cadence === 'stepped'
      ? Math.floor(rawTime * settings.playback.sampleRate + 1e-7) / settings.playback.sampleRate
      : rawTime;
    sampleCount += 1;
    return {
      pose: normalizeMotionPose(sampler.sample(sampledTime, { loop: slot.loop !== false })),
      contributions: [{
        key: `${prefix}:${node.slot}`,
        loop: slot.loop !== false,
        rawTime,
        sampler,
        slot,
        slotId: node.slot,
        weight,
      }],
    };
  }

  function sampleNode(node, time, prefix, inheritedWeight = 1) {
    if (!node || node.type === 'clip') return sampleClipNode(node ?? { slot: '' }, time, prefix, inheritedWeight);
    let weightedChildren = [];
    if (node.type === 'blend1d') {
      const value = finite(parameterValue(parameterValues, node.parameter, 0), 0);
      const children = node.children ?? [];
      if (children.length === 0) return { pose: createEmptyMotionPose(), contributions: [] };
      if (children.length === 1 || value <= children[0].threshold) weightedChildren = [{ child: children[0], weight: 1 }];
      else if (value >= children.at(-1).threshold) weightedChildren = [{ child: children.at(-1), weight: 1 }];
      else {
        let upper = 1;
        while (upper < children.length && children[upper].threshold < value) upper += 1;
        const a = children[upper - 1];
        const b = children[upper];
        const t = (value - a.threshold) / Math.max(b.threshold - a.threshold, 1e-6);
        weightedChildren = [{ child: a, weight: 1 - t }, { child: b, weight: t }];
      }
    } else if (node.type === 'blend2d') {
      const x = finite(parameterValue(parameterValues, node.parameterX, 0), 0);
      const y = finite(parameterValue(parameterValues, node.parameterY, 0), 0);
      const ranked = (node.children ?? []).map((child) => ({
        child,
        distance: Math.hypot(x - child.x, y - child.y),
      })).sort((a, b) => a.distance - b.distance);
      if (ranked[0]?.distance < 1e-6) weightedChildren = [{ child: ranked[0].child, weight: 1 }];
      else weightedChildren = addWeights(ranked.slice(0, 3).map((entry) => ({ child: entry.child, weight: 1 / Math.max(entry.distance ** 2, 1e-6) })));
    } else {
      weightedChildren = addWeights((node.children ?? []).map((child) => ({
        child,
        weight: child.weightParameter
          ? Math.max(0, finite(parameterValue(parameterValues, child.weightParameter, child.weight), child.weight))
          : child.weight,
      })));
    }
    const sampled = weightedChildren.map(({ child, weight }, index) => {
      const result = sampleNode(child.node, time, `${prefix}.${index}`, inheritedWeight * weight);
      return { ...result, weight };
    });
    return {
      pose: blendMotionPoseList(sampled.map((entry) => ({ pose: entry.pose, weight: entry.weight }))),
      contributions: mergeContributions(sampled.flatMap((entry) => entry.contributions)),
    };
  }

  function sampleState(stateId, time, prefix = stateId) {
    const state = graph.states[stateId];
    if (!state) return { pose: createEmptyMotionPose(), contributions: [], duration: 1 };
    const result = sampleNode(state.node, time * state.speed, `${prefix}.base`);
    let output = result.pose;
    const contributions = [...result.contributions];
    for (const layer of state.layers) {
      if (layer.enabledParameter && !parameterValue(parameterValues, layer.enabledParameter, false)) continue;
      const parameterWeight = layer.weightParameter
        ? finite(parameterValue(parameterValues, layer.weightParameter, layer.weight), layer.weight)
        : layer.weight;
      const weight = clamp01(parameterWeight);
      if (weight <= 0) continue;
      const sampled = sampleNode(layer.node, time * state.speed, `${prefix}.layer.${layer.id}`, weight);
      output = layerMotionPose(output, sampled.pose, { mask: layer.mask, mode: layer.mode, weight });
      contributions.push(...sampled.contributions);
    }
    const first = contributions[0];
    return {
      pose: output,
      contributions: mergeContributions(contributions),
      duration: first ? clipDuration(first.sampler) / Math.max(finite(first.slot.speed, 1) * state.speed, 1e-6) : 1,
    };
  }

  function statePhase(stateId, time) {
    const sampled = sampleState(stateId, time, `${stateId}.phase`);
    return sampled.duration > 0 ? (time % sampled.duration) / sampled.duration : 0;
  }

  function canInterrupt() {
    if (!transition) return true;
    if (transition.interruptible !== null) return transition.interruptible;
    return settings.transitions.allowInterrupt;
  }

  function findTransition() {
    if (!canInterrupt()) return null;
    const state = graph.states[currentState];
    if (!state) return null;
    const phase = statePhase(currentState, stateTime);
    return state.transitions.find((edge) => (
      transitionExitReady(edge, phase)
      && edge.conditions.every((condition) => evaluateMotionCondition(condition, parameterValues, triggers))
    )) ?? null;
  }

  function beginTransition(edge) {
    if (!edge || !graph.states[edge.to] || edge.to === currentState) return false;
    const fromState = currentState;
    const fromTime = stateTime;
    const shouldSync = edge.syncPhase ?? settings.transitions.syncPhase;
    const sourcePhase = shouldSync ? statePhase(fromState, fromTime) : 0;
    const targetDuration = sampleState(edge.to, 0, `${edge.to}.sync`).duration;
    currentState = edge.to;
    stateTime = sourcePhase * targetDuration;
    transition = {
      edgeId: edge.id,
      fromState,
      fromTime,
      elapsed: 0,
      duration: edge.duration >= 0 ? edge.duration : settings.transitions.duration,
      interruptible: edge.interruptible,
    };
    eventCursors.clear();
    rootCursors.clear();
    return true;
  }

  function dispatchEvents(contributions, delta) {
    const emitted = [];
    const maxEvents = settings.events.maxPerUpdate;
    for (const contribution of contributions) {
      if (emitted.length >= maxEvents || contribution.weight < settings.events.minimumWeight) continue;
      const duration = clipDuration(contribution.sampler);
      const events = [
        ...(Array.isArray(contribution.sampler.events) ? contribution.sampler.events : []),
        ...(Array.isArray(contribution.slot.events) ? contribution.slot.events : []),
      ];
      const current = Math.max(0, contribution.rawTime);
      const previous = eventCursors.has(contribution.key)
        ? eventCursors.get(contribution.key)
        : Math.max(0, current - delta * Math.max(contribution.slot.speed, 0));
      eventCursors.set(contribution.key, current);
      if (current < previous || events.length === 0) continue;
      const pendingEvents = events.map((event, index) => ({ event, index })).filter(({ event, index }) => (
        !event.once || !firedOnce.has(`${contribution.key}:${eventIdentity(event, index)}`)
      ));
      if (pendingEvents.length === 0) continue;
      const startCycle = contribution.loop ? Math.floor(previous / duration) : 0;
      const endCycle = contribution.loop ? Math.floor(current / duration) : 0;
      const cycleLimit = settings.events.fireOnLoop ? endCycle : Math.min(endCycle, startCycle);
      // A partial first cycle may contain no occurrence. Every later complete
      // cycle contains every pending clip-local event, so visiting at most one
      // more cycle than the remaining emission budget is sufficient. This
      // keeps tiny, very fast looping clips bounded even across huge deltas.
      const cycleBudget = Math.min(
        Math.max(0, cycleLimit - startCycle + 1),
        maxEvents - emitted.length + 1,
      );
      const visitedCycleLimit = startCycle + cycleBudget - 1;
      for (let cycle = startCycle; cycle <= visitedCycleLimit && emitted.length < maxEvents; cycle += 1) {
        for (const { event, index } of pendingEvents) {
          if (emitted.length >= maxEvents) break;
          const occurrence = eventTime(event, duration) + cycle * duration;
          const inclusiveStart = previous === 0 && occurrence === 0;
          if (!inclusiveStart && occurrence <= previous) continue;
          if (occurrence > current || (!contribution.loop && occurrence > duration)) continue;
          const onceKey = `${contribution.key}:${eventIdentity(event, index)}`;
          if (event.once && firedOnce.has(onceKey)) continue;
          if (event.once) firedOnce.add(onceKey);
          emitted.push({
            id: eventIdentity(event, index),
            name: String(event.name ?? event.type ?? 'event'),
            payload: plain(event.payload) ? { ...event.payload } : {},
            slot: contribution.slotId,
            state: currentState,
            time: occurrence,
            weight: contribution.weight,
          });
        }
      }
    }
    for (const event of emitted) {
      totalEventCount += 1;
      for (const listener of [...eventListeners]) listener(event);
    }
    return emitted;
  }

  function extractRootMotion(contributions) {
    const position = [0, 0, 0];
    let yaw = 0;
    for (const contribution of contributions) {
      if (contribution.weight <= 0) continue;
      const current = contribution.rawTime;
      const previous = rootCursors.has(contribution.key) ? rootCursors.get(contribution.key) : current;
      rootCursors.set(contribution.key, current);
      const from = motionAtAbsoluteTime(contribution.sampler, previous, contribution.loop);
      const to = motionAtAbsoluteTime(contribution.sampler, current, contribution.loop);
      addScaledVector(position, subtractVector(to.position, from.position), contribution.weight);
      yaw += (contribution.loop
        ? to.yaw - from.yaw
        : shortestAngleDelta(from.yaw, to.yaw)) * contribution.weight;
    }
    return {
      position: position.map((value, index) => (
        settings.rootMotion.axes[index] ? value * settings.rootMotion.scale : 0
      )),
      yaw,
    };
  }

  function applyModifiers(inputPose, delta) {
    const output = normalizeMotionPose(inputPose);
    const leanTarget = settings.lean.enabled
      ? Math.min(Math.max(finite(parameterValue(parameterValues, settings.lean.turnParameter, 0)), -1), 1) * settings.lean.maxAngle
      : 0;
    leanValue += (leanTarget - leanValue) * (1 - Math.exp(-settings.lean.response * delta));
    output.root.rotation[2] -= leanValue;
    const speed = Math.abs(finite(parameterValue(parameterValues, settings.bob.speedParameter, 0), 0));
    if (settings.bob.enabled && speed > 0.001) {
      const phase = clock * Math.PI * 2 * settings.bob.frequency * Math.max(speed, 0.15);
      output.root.position[1] += Math.abs(Math.sin(phase)) * settings.bob.amplitude * Math.min(speed, 1.5);
      output.root.position[0] += Math.sin(phase * 0.5) * settings.bob.lateral * Math.min(speed, 1.5);
    }
    const vertical = Math.abs(finite(parameterValue(parameterValues, settings.squash.verticalParameter, 0), 0));
    const squashTarget = settings.squash.enabled ? Math.min(vertical * settings.squash.amount * 0.12, settings.squash.amount) : 0;
    squashValue += (squashTarget - squashValue) * (1 - Math.exp(-settings.squash.response * delta));
    output.root.scale[1] *= 1 - squashValue;
    output.root.scale[0] *= 1 + squashValue * 0.5;
    output.root.scale[2] *= 1 + squashValue * 0.5;
    return output;
  }

  function update(deltaSeconds = 0) {
    if (disposed) return { events: [], pose, rootMotion: [0, 0, 0], state: currentState };
    const started = now();
    const unscaled = Math.min(Math.max(finite(deltaSeconds, 0), 0), settings.playback.maxDelta);
    const delta = unscaled * settings.playback.speed;
    clock += delta;
    sampleCount = 0;

    const edge = findTransition();
    if (edge) beginTransition(edge);
    stateTime += delta;
    let sampled = sampleState(currentState, stateTime);
    if (transition) {
      transition.elapsed += delta;
      transition.fromTime += delta;
      const source = sampleState(transition.fromState, transition.fromTime, `${transition.fromState}.out`);
      const amount = transition.duration <= 0 ? 1 : ease(transition.elapsed / transition.duration, settings.transitions.easing);
      sampled = {
        pose: blendMotionPoses(source.pose, sampled.pose, amount),
        contributions: mergeContributions([
          ...source.contributions.map((entry) => ({ ...entry, weight: entry.weight * (1 - amount) })),
          ...sampled.contributions.map((entry) => ({ ...entry, weight: entry.weight * amount })),
        ]),
        duration: sampled.duration,
      };
      if (amount >= 1) transition = null;
    }

    const rootDelta = extractRootMotion(sampled.contributions);
    const policy = settings.rootMotion.policy;
    pose = applyModifiers(sampled.pose, delta);
    if (policy === 'inPlace' || policy === 'extract' || policy === 'apply') pose.root.position = [0, 0, 0];
    if ((policy === 'extract' || policy === 'apply') && settings.rootMotion.applyYaw) pose.root.rotation[1] = 0;
    if (policy === 'apply') rigAdapter?.applyRootMotion?.(
      rootDelta.position,
      settings.rootMotion.applyYaw ? rootDelta.yaw : 0,
    );
    rigAdapter?.applyPose?.(pose);
    const events = dispatchEvents(sampled.contributions, delta);
    for (const [id, definition] of Object.entries(graph.parameters)) {
      if (definition.type === 'trigger') parameterValues[id] = false;
    }
    triggers.clear();
    updateCount += 1;
    lastUpdateMs = now() - started;
    return {
      events,
      pose,
      rootMotion: policy === 'extract' || policy === 'apply' ? rootDelta.position : [0, 0, 0],
      rootYaw: policy === 'extract' || policy === 'apply' ? rootDelta.yaw : 0,
      state: currentState,
      transitioning: Boolean(transition),
    };
  }

  function reset({ state = graph.initial, keepParameters = false } = {}) {
    currentState = graph.states[state] ? state : graph.initial;
    stateTime = 0;
    clock = 0;
    transition = null;
    pose = createEmptyMotionPose();
    leanValue = 0;
    squashValue = 0;
    triggers.clear();
    eventCursors.clear();
    rootCursors.clear();
    firedOnce.clear();
    missingSlots.clear();
    if (!keepParameters) resetParameters();
    rigAdapter?.reset?.();
  }

  const api = {
    update,
    reset,
    setParameter(id, value) {
      if (disposed) return api;
      const definition = graph.parameters[id];
      if (definition?.type === 'boolean') parameterValues[id] = Boolean(value);
      else if (definition?.type === 'trigger') {
        if (value) triggers.add(id);
        parameterValues[id] = Boolean(value);
      } else parameterValues[id] = finite(value, value);
      return api;
    },
    setParameters(values = {}) {
      for (const [id, value] of Object.entries(values)) api.setParameter(id, value);
      return api;
    },
    trigger(id) {
      triggers.add(String(id));
      parameterValues[id] = true;
      return api;
    },
    transitionTo(state, options = {}) {
      if (!graph.states[state]) return false;
      return beginTransition({
        id: options.id ?? 'manual',
        to: state,
        duration: Math.max(0, finite(options.duration, settings.transitions.duration)),
        interruptible: options.interruptible ?? null,
        syncPhase: options.syncPhase ?? false,
      });
    },
    setSettings(value) {
      settings = createMotionSettings(value);
      return api;
    },
    setGraph(value, { preserveState = true } = {}) {
      const result = validateMotionGraph(value, { clipSlots });
      if (!result.ok) throw new Error(result.errors.join(' '));
      const previousState = currentState;
      graph = result.value;
      resetParameters(parameterValues);
      reset({ state: preserveState && graph.states[previousState] ? previousState : graph.initial, keepParameters: true });
      return api;
    },
    setClipSlots(value) {
      clipSlots = createMotionClipSlots(value);
      missingSlots.clear();
      eventCursors.clear();
      rootCursors.clear();
      return api;
    },
    setClips(value, resolver = clipResolver) {
      clipLibrary = value ?? {};
      clipResolver = typeof resolver === 'function' ? resolver : null;
      missingSlots.clear();
      return api;
    },
    setRig(value) {
      rigAdapter = value;
      return api;
    },
    onEvent(listener) {
      eventListeners.add(listener);
      return () => eventListeners.delete(listener);
    },
    getState() {
      return {
        state: currentState,
        stateTime,
        transition: transition ? { ...transition } : null,
        parameters: { ...parameterValues },
        pose: normalizeMotionPose(pose),
      };
    },
    stats() {
      const rigStats = rigAdapter?.stats?.() ?? {};
      const slotIds = Object.keys(clipSlots);
      const missingBoundSlots = slotIds.filter((id) => missingSlots.has(id)).length;
      return {
        activeState: currentState,
        boundClipCount: slotIds.length - missingBoundSlots,
        clipSlotCount: slotIds.length,
        disposed,
        eventCount: totalEventCount,
        lastUpdateMs,
        missingBoneCount: rigStats.missingBoneCount ?? 0,
        missingBones: rigStats.missingBones ?? [],
        missingSlotCount: missingSlots.size,
        missingSlots: [...missingSlots],
        sampleCount,
        stateCount: Object.keys(graph.states).length,
        transition: transition?.edgeId ?? null,
        updateCount,
      };
    },
    dispose({ disposeClips = false, disposeRig = false } = {}) {
      if (disposed) return;
      disposed = true;
      eventListeners.clear();
      eventCursors.clear();
      rootCursors.clear();
      if (disposeClips) {
        const values = clipLibrary instanceof Map ? [...clipLibrary.values()] : Object.values(plain(clipLibrary) ? clipLibrary : {});
        for (const sampler of new Set(values)) sampler?.dispose?.();
      }
      if (disposeRig) rigAdapter?.dispose?.();
      clipLibrary = {};
      rigAdapter = null;
    },
  };
  return api;
}
