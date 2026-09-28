import { cloneSerializable } from '../core/generation.js';

export const MOTION_BLEND_NODE_TYPES = Object.freeze(['clip', 'blend1d', 'blend2d', 'weighted']);
export const MOTION_LAYER_MODES = Object.freeze(['additive', 'override']);
export const MOTION_PARAMETER_TYPES = Object.freeze(['number', 'boolean', 'trigger']);
export const MOTION_CONDITION_OPERATORS = Object.freeze(['>', '>=', '<', '<=', '==', '!=', 'truthy', 'falsy', 'triggered']);

const plain = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const cleanId = (value, fallback = '') => String(value ?? fallback).trim();

export const DEFAULT_MOTION_CLIP_SLOTS = Object.freeze({
  idle: Object.freeze({ source: 'preview/idle', loop: true, speed: 1, events: Object.freeze([]) }),
  walk: Object.freeze({ source: 'preview/walk', loop: true, speed: 1, events: Object.freeze([
    Object.freeze({ time: 0.1, name: 'footstep', payload: Object.freeze({ foot: 'left' }) }),
    Object.freeze({ time: 0.6, name: 'footstep', payload: Object.freeze({ foot: 'right' }) }),
  ]) }),
  run: Object.freeze({ source: 'preview/run', loop: true, speed: 1, events: Object.freeze([
    Object.freeze({ time: 0.05, name: 'footstep', payload: Object.freeze({ foot: 'left' }) }),
    Object.freeze({ time: 0.38, name: 'footstep', payload: Object.freeze({ foot: 'right' }) }),
  ]) }),
  airborne: Object.freeze({ source: 'preview/airborne', loop: true, speed: 1, events: Object.freeze([]) }),
  breathe: Object.freeze({ source: 'preview/breathe', loop: true, speed: 1, events: Object.freeze([]) }),
});

export const DEFAULT_MOTION_GRAPH = Object.freeze({
  id: 'responsive-locomotion',
  initial: 'locomotion',
  parameters: Object.freeze({
    speed: Object.freeze({ type: 'number', default: 0 }),
    turn: Object.freeze({ type: 'number', default: 0 }),
    verticalSpeed: Object.freeze({ type: 'number', default: 0 }),
    grounded: Object.freeze({ type: 'boolean', default: true }),
  }),
  states: Object.freeze({
    locomotion: Object.freeze({
      node: Object.freeze({
        type: 'blend1d',
        parameter: 'speed',
        children: Object.freeze([
          Object.freeze({ threshold: 0, slot: 'idle' }),
          Object.freeze({ threshold: 0.45, slot: 'walk' }),
          Object.freeze({ threshold: 1, slot: 'run' }),
        ]),
      }),
      layers: Object.freeze([
        Object.freeze({ id: 'breathing', mode: 'additive', node: Object.freeze({ type: 'clip', slot: 'breathe' }), weight: 0.3, mask: Object.freeze(['spine', 'chest', 'head']) }),
      ]),
      transitions: Object.freeze([
        Object.freeze({ to: 'air', conditions: Object.freeze([{ parameter: 'grounded', op: 'falsy' }]), duration: 0.1 }),
      ]),
    }),
    air: Object.freeze({
      node: Object.freeze({ type: 'clip', slot: 'airborne' }),
      transitions: Object.freeze([
        Object.freeze({ to: 'locomotion', conditions: Object.freeze([{ parameter: 'grounded', op: 'truthy' }]), duration: 0.12 }),
      ]),
      layers: Object.freeze([]),
    }),
  }),
});

function normalizeParameter(value) {
  const source = plain(value) ? value : { default: value };
  const inferredType = typeof source.default === 'boolean' ? 'boolean' : 'number';
  const type = MOTION_PARAMETER_TYPES.includes(source.type) ? source.type : inferredType;
  const fallback = type === 'boolean' || type === 'trigger' ? false : 0;
  return {
    type,
    default: type === 'boolean' || type === 'trigger'
      ? Boolean(source.default ?? fallback)
      : finite(source.default, fallback),
    ...(Number.isFinite(Number(source.min)) ? { min: Number(source.min) } : {}),
    ...(Number.isFinite(Number(source.max)) ? { max: Number(source.max) } : {}),
  };
}

function childNode(source) {
  if (plain(source?.node)) return normalizeBlendNode(source.node);
  if (source?.slot !== undefined) return normalizeBlendNode({ type: 'clip', slot: source.slot });
  return normalizeBlendNode({ type: 'clip', slot: '' });
}

/** Normalizes an arbitrary recursive clip/blend node. */
export function normalizeBlendNode(value = {}) {
  const source = plain(value) ? value : { type: 'clip', slot: String(value ?? '') };
  const type = MOTION_BLEND_NODE_TYPES.includes(source.type) ? source.type : 'clip';
  if (type === 'clip') {
    return {
      type,
      slot: cleanId(source.slot ?? source.clip),
      speed: Math.max(0, finite(source.speed, 1)),
      phase: finite(source.phase, 0),
    };
  }
  if (type === 'blend1d') {
    const children = (Array.isArray(source.children) ? source.children : [])
      .map((entry, index) => ({
        threshold: finite(entry?.threshold, index),
        node: childNode(entry),
      }))
      .sort((a, b) => a.threshold - b.threshold);
    return {
      type,
      parameter: cleanId(source.parameter, 'value'),
      children,
    };
  }
  if (type === 'blend2d') {
    return {
      type,
      parameterX: cleanId(source.parameterX ?? source.parameters?.[0], 'x'),
      parameterY: cleanId(source.parameterY ?? source.parameters?.[1], 'y'),
      children: (Array.isArray(source.children) ? source.children : []).map((entry) => ({
        x: finite(entry?.x ?? entry?.position?.[0], 0),
        y: finite(entry?.y ?? entry?.position?.[1], 0),
        node: childNode(entry),
      })),
    };
  }
  return {
    type,
    children: (Array.isArray(source.children) ? source.children : []).map((entry) => ({
      node: childNode(entry),
      weight: Math.max(0, finite(entry?.weight, 1)),
      weightParameter: cleanId(entry?.weightParameter),
    })),
  };
}

function normalizeCondition(value) {
  if (!plain(value)) return { parameter: cleanId(value), op: 'truthy' };
  if (Array.isArray(value.all)) return { all: value.all.map(normalizeCondition) };
  if (Array.isArray(value.any)) return { any: value.any.map(normalizeCondition) };
  if (value.not !== undefined) return { not: normalizeCondition(value.not) };
  return {
    parameter: cleanId(value.parameter ?? value.param),
    op: MOTION_CONDITION_OPERATORS.includes(value.op) ? value.op : 'truthy',
    ...(Object.hasOwn(value, 'value') ? { value: cloneSerializable(value.value) } : {}),
  };
}

function normalizeTransition(value, index) {
  const source = plain(value) ? value : { to: value };
  const conditions = Array.isArray(source.conditions)
    ? source.conditions.map(normalizeCondition)
    : source.when !== undefined
      ? [normalizeCondition(source.when)]
      : [];
  return {
    id: cleanId(source.id, `transition-${index}`),
    to: cleanId(source.to),
    conditions,
    duration: source.duration === undefined ? -1 : Math.max(0, finite(source.duration, 0)),
    priority: finite(source.priority, 0),
    exitTime: source.exitTime === undefined ? null : Math.min(Math.max(finite(source.exitTime, 0), 0), 1),
    interruptible: source.interruptible === undefined ? null : Boolean(source.interruptible),
    syncPhase: source.syncPhase === undefined ? null : Boolean(source.syncPhase),
  };
}

function normalizeLayer(value, index) {
  const source = plain(value) ? value : {};
  return {
    id: cleanId(source.id, `layer-${index}`),
    mode: MOTION_LAYER_MODES.includes(source.mode) ? source.mode : 'additive',
    node: normalizeBlendNode(source.node ?? source.blend ?? source.motion ?? {}),
    weight: Math.min(Math.max(finite(source.weight, 1), 0), 1),
    weightParameter: cleanId(source.weightParameter),
    enabledParameter: cleanId(source.enabledParameter),
    mask: Array.isArray(source.mask) ? source.mask.map(String) : [],
  };
}

function normalizeState(id, value) {
  const source = plain(value) ? value : {};
  return {
    id,
    node: normalizeBlendNode(source.node ?? source.blend ?? source.motion ?? source),
    speed: Math.max(0, finite(source.speed, 1)),
    transitions: (Array.isArray(source.transitions) ? source.transitions : [])
      .map(normalizeTransition)
      .sort((a, b) => b.priority - a.priority),
    layers: (Array.isArray(source.layers) ? source.layers : []).map(normalizeLayer),
    tags: Array.isArray(source.tags) ? source.tags.map(String) : [],
  };
}

/** Creates a graph with arbitrary state ids, topology, parameters, and layers. */
export function createMotionGraph(options = DEFAULT_MOTION_GRAPH) {
  const source = plain(options) ? options : {};
  const rawStates = plain(source.states) ? source.states : {};
  const states = Object.fromEntries(Object.entries(rawStates)
    .filter(([id]) => cleanId(id))
    .map(([id, state]) => [cleanId(id), normalizeState(cleanId(id), state)]));
  const firstState = Object.keys(states)[0] ?? '';
  return {
    id: cleanId(source.id, 'motion-graph'),
    initial: Object.hasOwn(states, source.initial) ? source.initial : firstState,
    parameters: Object.fromEntries(Object.entries(plain(source.parameters) ? source.parameters : {})
      .filter(([id]) => cleanId(id))
      .map(([id, parameter]) => [cleanId(id), normalizeParameter(parameter)])),
    states,
  };
}

function normalizeEvent(value, index) {
  const source = plain(value) ? value : { name: value };
  return {
    id: cleanId(source.id, `event-${index}`),
    name: cleanId(source.name ?? source.type, 'event'),
    time: Math.max(0, finite(source.time ?? source.at, 0)),
    normalized: Boolean(source.normalized),
    once: Boolean(source.once),
    payload: cloneSerializable(plain(source.payload) ? source.payload : {}),
  };
}

/** Creates serializable slot bindings independently from graph topology. */
export function createMotionClipSlots(options = DEFAULT_MOTION_CLIP_SLOTS) {
  const source = plain(options) ? options : {};
  return Object.fromEntries(Object.entries(source)
    .filter(([id]) => cleanId(id))
    .map(([id, value]) => {
      const slot = plain(value) ? value : { source: value };
      return [cleanId(id), {
        source: cloneSerializable(slot.source ?? slot.clip ?? id),
        loop: slot.loop === undefined ? true : Boolean(slot.loop),
        speed: Math.max(0, finite(slot.speed, 1)),
        phase: finite(slot.phase, 0),
        events: (Array.isArray(slot.events) ? slot.events : []).map(normalizeEvent).sort((a, b) => a.time - b.time),
        metadata: cloneSerializable(plain(slot.metadata) ? slot.metadata : {}),
      }];
    }));
}

function visitNode(node, visit) {
  visit(node);
  for (const child of node.children ?? []) visitNode(child.node, visit);
}

export function collectMotionGraphSlots(graph) {
  const output = new Set();
  const normalized = createMotionGraph(graph);
  for (const state of Object.values(normalized.states)) {
    visitNode(state.node, (node) => {
      if (node.type === 'clip' && node.slot) output.add(node.slot);
    });
    for (const layer of state.layers) visitNode(layer.node, (node) => {
      if (node.type === 'clip' && node.slot) output.add(node.slot);
    });
  }
  return [...output];
}

/** Structural validation. Missing slot bindings are warnings for graceful asset loading. */
export function validateMotionGraph(input, { clipSlots = null } = {}) {
  const errors = [];
  const warnings = [];
  if (!plain(input)) return { errors: ['Motion graph must be an object.'], ok: false, value: null, warnings };
  const graph = createMotionGraph(input);
  const stateIds = new Set(Object.keys(graph.states));
  if (stateIds.size === 0) errors.push('Motion graph must contain at least one state.');
  if (!stateIds.has(graph.initial)) errors.push(`Initial state "${graph.initial}" does not exist.`);
  for (const state of Object.values(graph.states)) {
    for (const transition of state.transitions) {
      if (!stateIds.has(transition.to)) errors.push(`State "${state.id}" transitions to missing state "${transition.to}".`);
      for (const condition of transition.conditions) {
        const queue = [condition];
        while (queue.length) {
          const current = queue.pop();
          if (current?.parameter && !Object.hasOwn(graph.parameters, current.parameter)) {
            warnings.push(`Transition "${transition.id}" reads undeclared parameter "${current.parameter}".`);
          }
          queue.push(...(current?.all ?? []), ...(current?.any ?? []));
          if (current?.not) queue.push(current.not);
        }
      }
    }
  }
  if (clipSlots) {
    const slots = createMotionClipSlots(clipSlots);
    for (const id of collectMotionGraphSlots(graph)) {
      if (!Object.hasOwn(slots, id)) warnings.push(`Graph references unbound clip slot "${id}".`);
    }
  }
  return { errors, ok: errors.length === 0, value: errors.length ? null : graph, warnings: [...new Set(warnings)] };
}

export function evaluateMotionCondition(condition, parameters, triggers = new Set()) {
  if (condition?.all) return condition.all.every((entry) => evaluateMotionCondition(entry, parameters, triggers));
  if (condition?.any) return condition.any.some((entry) => evaluateMotionCondition(entry, parameters, triggers));
  if (condition?.not) return !evaluateMotionCondition(condition.not, parameters, triggers);
  const value = parameters?.[condition?.parameter];
  switch (condition?.op) {
    case '>': return Number(value) > Number(condition.value);
    case '>=': return Number(value) >= Number(condition.value);
    case '<': return Number(value) < Number(condition.value);
    case '<=': return Number(value) <= Number(condition.value);
    case '==': return value === condition.value;
    case '!=': return value !== condition.value;
    case 'falsy': return !value;
    case 'triggered': return triggers.has(condition.parameter);
    case 'truthy':
    default: return Boolean(value);
  }
}
