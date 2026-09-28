import * as THREE from 'three';

import { environmentStateUniformNodes } from '../shaders-tsl/chunks/environment-state.js';

// Classic-uniform mirror + setter API for the scene-wide environment state.
// See src/shaders-tsl/chunks/environment-state.js for the field contract and
// writer-ownership rules. GLSL fallback materials register entries from
// environmentStateUniforms by reference; every setter writes both stores so
// one call updates all materials on either backend.

export const environmentStateUniforms = Object.fromEntries(
  Object.entries(environmentStateUniformNodes).map(([name, node]) => [
    name,
    { value: cloneValue(node.value) },
  ]),
);

function cloneValue(value) {
  return value?.clone?.() ?? value;
}

function writeBoth(name, apply) {
  apply(environmentStateUniforms[name].value, (next) => {
    environmentStateUniforms[name].value = next;
  });
  apply(environmentStateUniformNodes[name].value, (next) => {
    environmentStateUniformNodes[name].value = next;
  });
}

function writeNumber(name, value) {
  if (!Number.isFinite(value)) return;
  writeBoth(name, (_current, replace) => replace(value));
}

function writeColor(name, value) {
  if (value == null) return;
  writeBoth(name, (current) => {
    if (Array.isArray(value)) current.setRGB(value[0], value[1], value[2]);
    else current.set(value);
  });
}

function writeVector(name, value) {
  if (value == null) return;
  writeBoth(name, (current) => {
    if (Array.isArray(value)) current.fromArray(value);
    else current.copy(value);
  });
}

const FIELD_WRITERS = {};
for (const [name, node] of Object.entries(environmentStateUniformNodes)) {
  const value = node.value;
  if (value?.isColor) FIELD_WRITERS[name] = writeColor;
  else if (value?.isVector2 || value?.isVector3) FIELD_WRITERS[name] = writeVector;
  else FIELD_WRITERS[name] = writeNumber;
}

const warnedUnknownFields = new Set();

/**
 * Writes a partial state update into both uniform stores. Keys follow the
 * uniform names; colors accept THREE.Color / hex / [r, g, b], vectors accept
 * THREE.Vector* / arrays. Unknown keys warn once (typo guard) and are
 * otherwise ignored.
 */
export function setEnvironmentState(partial = {}) {
  for (const [name, value] of Object.entries(partial)) {
    const writer = FIELD_WRITERS[name];
    if (!writer) {
      if (!warnedUnknownFields.has(name)) {
        warnedUnknownFields.add(name);
        console.warn(`setEnvironmentState: unknown field "${name}".`);
      }
      continue;
    }
    writer(name, value);
  }
  if (partial.windAngle !== undefined && partial.windDirection === undefined) {
    const angle = environmentStateUniforms.windAngle.value;
    writeVector('windDirection', [Math.cos(angle), Math.sin(angle)]);
  }
}

/**
 * Global wind convenience writer — the one call world integrations use.
 * Angle is radians in the world XZ plane (0 = +X, counter-clockwise).
 */
export function setGlobalWind({
  angle,
  strength,
  speed,
  gustFrequency,
  gustSpeed,
  swayLean,
  swaySpeed,
  swayDamping,
} = {}) {
  setEnvironmentState({
    windAngle: angle,
    windStrength: strength,
    windSpeed: speed,
    gustFrequency,
    gustSpeed,
    swayLean,
    swaySpeed,
    swayDamping,
  });
}

export function setEnvironmentPlayer(position, { swayRadius } = {}) {
  setEnvironmentState({
    playerPosition: position,
    playerSwayRadius: swayRadius,
    playerActive: position ? 1 : 0,
  });
}

/**
 * Plain-value snapshot (numbers, [r,g,b] colors, arrays) for tests and
 * debugging; not a live view.
 */
export function getEnvironmentState() {
  const out = {};
  for (const [name, entry] of Object.entries(environmentStateUniforms)) {
    const value = entry.value;
    if (value?.isColor) out[name] = [value.r, value.g, value.b];
    else if (value?.isVector2 || value?.isVector3) out[name] = value.toArray();
    else out[name] = value;
  }
  return out;
}
