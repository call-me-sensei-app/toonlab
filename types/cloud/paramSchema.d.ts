export function num(spec: any): Readonly<{
    options: readonly any[];
    derived: boolean;
    derive: any;
    description: any;
    fold: any;
    integer: boolean;
    label: any;
    limit: Readonly<{
        max: any;
        min: any;
    }>;
    range: Readonly<{
        max: any;
        min: any;
        step: any;
    }>;
    type: "number";
    unit: any;
    uniform: boolean;
    value: any;
    wrap: readonly any[];
}>;
export function col(spec: any): Readonly<{
    derived: false;
    derive: any;
    description: any;
    fold: any;
    integer: false;
    label: any;
    limit: Readonly<{
        max: any;
        min: 0;
    }>;
    type: "color";
    unit: "linear RGB";
    uniform: boolean;
    value: readonly any[];
    wrap: any;
}>;
export function bool(spec: any): Readonly<{
    derived: false;
    derive: any;
    description: any;
    fold: any;
    integer: false;
    label: any;
    limit: Readonly<{
        max: 1;
        min: 0;
    }>;
    type: "boolean";
    unit: "";
    uniform: false;
    value: any;
    wrap: any;
}>;
/**
 * Adapts an owner module's `{ range: { min, max, step }, type, unit, value }`
 * table into descriptors. The owner clamps to its own range, so that range is
 * both the slider domain and the hard limit here — otherwise the schema layer
 * would accept a value the owner then silently moves.
 */
export function fromOwnerSchema(schema: any, overrides?: {}, shared?: {}): Readonly<{}>;
/**
 * Fails loudly on a schema that cannot be authored: a slider domain outside the
 * hard clamp, or a default the clamp would move. Both were real defects, and
 * both are cheap to catch at import time rather than in a lab.
 */
export function assertSchemaInvariants(label: any, fields: any, path?: string): any;
export function isObject(value: any): boolean;
export function hasValue(value: any): boolean;
/**
 * A number, or null when the input is not one.
 *
 * Deliberately narrower than `Number(value)`: that reads `null`, `''`, `[]` and
 * `false` as 0 and `true` as 1, so every one of them can silently zero a
 * parameter. Only real numbers and non-blank numeric strings (JSON and URL
 * params produce those) get through.
 */
export function finiteNumber(value: any): number;
export function describe(value: any): string;
/**
 * Folds a periodic value into its representative interval, which is closed at
 * both ends. A compass bearing of −180 and one of +180 are the same direction,
 * and the spec's due-south noon azimuth has to store as the 180 the author
 * typed instead of flipping sign on every load, so an in-range value passes
 * through untouched and only an out-of-range one is folded.
 */
export function foldClosed(value: any, min: any, max: any): any;
export function clampNumber(field: any, value: any): any;
export function toChannels(value: any): any[];
export function clampChannels(field: any, channels: any): any;
export function channelsToColor(channels: any): THREE.Color;
/**
 * Reads a linear-RGB colour into a live THREE.Color, the way every live param
 * group promises to: an unusable value keeps the colour already there and says
 * so, and every channel is clamped to the field's declared limit.
 *
 * Built on toChannels and clampChannels — the same two the document layer
 * normalizes through — so `applyParams({ color })` and a serialized document
 * cannot disagree about what a colour is. They did, in both directions, for as
 * long as the live groups hand-wrote their own reader:
 *
 * - A SHORT array read as a *partial* write. `{ color: [7] }` set r = 7 and held
 *   g and b, where toChannels wants three channels and the document layer
 *   rejects the value outright.
 * - NOTHING CLAMPED. A live sun held r = 7 while the preset written from it
 *   carried the field's declared maximum of 4, so the sun in the lab and the sun
 *   in the file were different colours with nothing reporting it.
 *
 * `label` is the caller's `[module] group.field`. This is the live path, so it
 * warns rather than filling a report: applyParams has no report to fill, and a
 * dropped colour write is otherwise completely silent.
 */
export function readColorInto(label: any, field: any, value: any, target: any): any;
/** Live-params view of a normalized block: colour triples become THREE.Color. */
export function colorFieldsToColors(fields: any, params: any): any;
export function deepFreeze(value: any): any;
export function normalizeNumber(path: any, field: any, value: any, fallback: any, report: any): any;
export function normalizeBoolean(path: any, field: any, value: any, fallback: any, report: any): any;
export function normalizeChannels(path: any, field: any, value: any, fallback: any, report: any): any;
export function reportUnknownKeys(path: any, fields: any, source: any, report: any, ignored?: any[]): void;
/**
 * Reports a supplied value for a read-only derived field, but only when it
 * disagrees with what the rule derives. A document this module serialized
 * carries the derived value, so warning on its mere presence made every
 * round-trip of our own output look like a problem.
 */
export function reportDerived(path: any, supplied: any, derivedValue: any, report: any): void;
/**
 * Normalizes one flat block of fields into a plain params object. `fallback`
 * supplies the value for any field the input omits; without one the field
 * defaults are used.
 *
 * `rule` runs after the authored fields are written and before the derived ones
 * are computed, which is what lets a cross-field clamp (the melt window, the
 * far-fade band) settle before anything derives from it.
 */
export function normalizeBlock(path: any, fields: any, input: any, fallback: any, report: any, options?: {}): {};
export const DIMENSIONLESS: "";
import * as THREE from 'three';
