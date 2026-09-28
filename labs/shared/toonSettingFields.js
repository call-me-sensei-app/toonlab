// Flat views of the character toon settings for the Labs' settings panels.
//
// `TOON_SETTING_FIELD_SCHEMA` nests fields the way the settings nest
// (`light.cameraLight.strength`, `ramp.tone.skin`), and every leaf carries its
// dotted `key`. A panel lists a group's leaves in schema order, labelled with
// their path ("Tone · Skin"), and reads and writes each one by that key.

import {
  TOON_DEBUG_OUTPUT_LABELS,
  TOON_DEBUG_OUTPUT_MODES,
  TOON_SETTING_FIELD_SCHEMA,
  TOON_SETTING_GROUPS,
} from '../../src/toon/toonMaterialAdapter.js';

function labelFromKey(key) {
  return String(key)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, (letter) => letter.toUpperCase());
}

function isFieldLeaf(entry) {
  return typeof entry?.id === 'string' && typeof entry?.type === 'string' && typeof entry?.key === 'string';
}

function collectLeaves(node, parents, out) {
  for (const [name, entry] of Object.entries(node ?? {})) {
    if (isFieldLeaf(entry)) {
      out[entry.key] = Object.freeze({ ...entry, label: [...parents, entry.label].join(' · ') });
    } else if (entry && typeof entry === 'object') {
      collectLeaves(entry, [...parents, labelFromKey(name)], out);
    }
  }
  return out;
}

/** Leaf field metadata per group, keyed by dotted key, in schema order. */
export const TOON_SETTING_FIELDS_BY_GROUP = Object.freeze(Object.fromEntries(
  TOON_SETTING_GROUPS.map((group) => [
    group.id,
    Object.freeze(collectLeaves(TOON_SETTING_FIELD_SCHEMA[group.id], [], {})),
  ]),
));

/** Every leaf field of every group, in display order. */
export const TOON_SETTING_FIELD_LIST = Object.freeze(
  TOON_SETTING_GROUPS.flatMap((group) => Object.values(TOON_SETTING_FIELDS_BY_GROUP[group.id])),
);

function readPath(values, key) {
  let node = values;
  for (const part of String(key).split('.')) {
    if (node === null || typeof node !== 'object') return undefined;
    node = node[part];
  }
  return node;
}

/** A group's value at a dotted key (`readToonGroupValue(settings.rim, 'intensity.hair')`). */
export function readToonGroupValue(groupValues, key) {
  return readPath(groupValues, key);
}

/** The value a settings object holds for a leaf field (its default when absent). */
export function readToonSettingValue(settings, field) {
  const value = readPath(settings?.[field.group], field.key);
  return value === undefined ? field.defaultValue : value;
}

/** A copy of a group's values with the dotted key set; untouched branches are shared. */
export function withToonGroupValue(groupValues, key, value) {
  const [head, ...rest] = String(key).split('.');
  const source = groupValues && typeof groupValues === 'object' && !Array.isArray(groupValues) ? groupValues : {};
  return {
    ...source,
    [head]: rest.length ? withToonGroupValue(source[head], rest.join('.'), value) : value,
  };
}

/** How many serialisable leaf fields differ between two settings objects. */
export function countToonSettingDifferences(a, b) {
  let count = 0;
  for (const field of TOON_SETTING_FIELD_LIST) {
    if (!field.serializable) continue;
    if (JSON.stringify(readToonSettingValue(a, field)) !== JSON.stringify(readToonSettingValue(b, field))) count += 1;
  }
  return count;
}

/** Fills a debug-view `<select>` with every view the character material has. */
export function fillToonDebugSelect(select) {
  if (!select) return;
  select.replaceChildren();
  for (const name of Object.keys(TOON_DEBUG_OUTPUT_MODES)) {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = TOON_DEBUG_OUTPUT_LABELS[name] ?? name;
    select.append(option);
  }
}
