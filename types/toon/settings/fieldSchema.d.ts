/**
 * A number with an inclusive range.
 * @param {number} defaultValue
 * @param {number} min
 * @param {number} max
 * @param {string} description
 * @param {{ label?: string, step?: number | null }} [options]
 */
export function numberField(defaultValue: number, min: number, max: number, description: string, { label, step }?: {
    label?: string;
    step?: number | null;
}): SettingField;
/**
 * @param {boolean} defaultValue
 * @param {string} description
 * @param {{ label?: string }} [options]
 */
export function booleanField(defaultValue: boolean, description: string, { label }?: {
    label?: string;
}): SettingField;
/**
 * An [r, g, b] colour, components 0–1.
 * @param {number[]} defaultValue
 * @param {string} description
 * @param {{ label?: string }} [options]
 */
export function colorField(defaultValue: number[], description: string, { label }?: {
    label?: string;
}): SettingField;
/**
 * @param {string | number} defaultValue
 * @param {Array<string | number>} options
 * @param {string} description
 * @param {{ label?: string, optionLabels?: Record<string, string> | null, numeric?: boolean }} [settings]
 */
export function selectField(defaultValue: string | number, options: Array<string | number>, description: string, { label, optionLabels, numeric }?: {
    label?: string;
    optionLabels?: Record<string, string> | null;
    numeric?: boolean;
}): SettingField;
/**
 * An [x, y] pair.
 * @param {number[]} defaultValue
 * @param {number} min
 * @param {number} max
 * @param {string} description
 * @param {{ label?: string }} [options]
 */
export function vector2Field(defaultValue: number[], min: number, max: number, description: string, { label }?: {
    label?: string;
}): SettingField;
/**
 * A list of strings (material names, patterns, roles).
 * @param {string} description
 * @param {{ label?: string }} [options]
 */
export function listField(description: string, { label }?: {
    label?: string;
}): SettingField;
/**
 * A texture: runtime-only, never written into a preset document.
 * @param {string} description
 * @param {{ label?: string }} [options]
 */
export function textureField(description: string, { label }?: {
    label?: string;
}): SettingField;
export function isFieldDefinition(value: any): value is SettingField;
export function coerceColor(value: any, fallback: any): any[];
/** Normalises one value against its field definition. */
export function coerceFieldValue(value: any, definition: any): any;
/**
 * Builds a complete values object for a group: every field present, each
 * normalised. `input` may be partial; unknown keys are dropped. A boolean
 * input toggles the group's `enabled` field.
 */
export function createGroupValues(fields: any, input: any): {};
/** Default values of a group. */
export function groupDefaults(fields: any): {};
/**
 * The public field schema of a group: the same nesting as its values, with a
 * frozen metadata record at every leaf.
 */
export function describeGroupFields(groupId: any, fields: any, prefix?: string): Readonly<{}>;
/**
 * Keeps only schema-known, serialisable keys present in `input`, coerced to
 * their field types. Partial input stays partial.
 */
export function sanitizeGroupValues(fields: any, input: any): {
    enabled: boolean;
} | {
    enabled?: undefined;
};
/** Unknown or runtime-only keys in `input`, as dotted paths. */
export function unknownGroupKeys(fields: any, input: any, prefix?: string): any;
/** Deep merge of plain settings objects (arrays, colours and textures replace). */
export function mergeSettings(...sources: any[]): {};
/** One field's definition: type, default, range/options, description. */
export class SettingField {
    constructor(definition: any);
}
