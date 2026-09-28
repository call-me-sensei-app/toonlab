/** Lists the canonical scenarios as `{ id, label, description }` (for HUDs). */
export function getEnvironmentScenarioOptions(): {
    description: "Sunlit interior at midday." | "Warm lamps balanced against low evening sun." | "Lamp-lit interior after dark, sun off." | "Open-air daylight with sky tint and height fog.";
    id: "interiorDay" | "interiorEvening" | "interiorNight" | "exteriorDay";
    label: "Interior Day" | "Interior Evening" | "Interior Night" | "Exterior Day";
}[];
export function registerEnvironmentPreset(name: any, preset: any, { overwrite }?: {
    overwrite?: boolean;
}): string;
/**
 * Folds any reference — style id, legacy single-look id, or unknown — to a
 * resolvable id. Legacy scenario ids stay themselves (they resolve through
 * {@link ENVIRONMENT_PRESET_ALIASES}); unknown ids fall back to 'default'.
 */
export function normalizeEnvironmentPresetName(name: any): string;
/**
 * Lists registered environment STYLES as `{ label, value, scenarios }`,
 * where `scenarios` reports per-scenario coverage (`'authored'` vs
 * `'inherited'`). Every style covers every scenario either way.
 */
export function getEnvironmentPresetOptions(): {
    label: any;
    scenarios: {
        [k: string]: string;
    };
    value: any;
}[];
/**
 * Returns { features, materialLook, parameters, rig } ready to spread into
 * applyEnvironmentShader options and the rig constructors.
 *
 * `name` selects a STYLE; the optional `scenario` (one of
 * {@link ENVIRONMENT_SCENARIOS}) selects that style's rendition of a venue ×
 * time of day. Without a scenario the style's base look is returned
 * unchanged. Legacy single-look ids (`interiorDay`, `interiorEvening`,
 * `interiorNight`, `exteriorDay`) resolve as the Default style at that
 * scenario with identical settings.
 */
export function resolveEnvironmentPreset(name: any, scenario?: any): {
    features: any;
    materialLook: {
        version: number;
        default: {
            features: {};
            parameters: {};
        };
        baseMaterials: {};
        finishes: {};
        renderModes: {};
        structuralRoles: {};
        contentFlags: {};
        objectClasses: {};
        assets: {};
    };
    parameters: any;
    rig: any;
};
/**
 * Validates and coerces an environment preset definition against the
 * environment settings schema. Feature values are coerced to booleans and
 * must name known feature toggles; parameter values must be finite numbers
 * (or `[r, g, b]` arrays for color parameters, or `null` for auto) and must
 * name known shader parameters; rig hints must be JSON scalars (boolean,
 * finite number, or string) — unknown rig keys are kept but produce a warning.
 *
 * @param {object} preset Preset definition ({ label, description, features, parameters, rig }).
 * @returns {{ ok: boolean, errors: string[], warnings: string[], value: object | null }}
 *   `value` is the sanitized `{ label, description, features, parameters, rig }` when `ok`.
 */
export function sanitizeEnvironmentPreset(preset: object): {
    ok: boolean;
    errors: string[];
    warnings: string[];
    value: object | null;
};
/**
 * Serializes a registered environment preset into a shareable JSON document
 * (`{ type, schemaVersion, id, label, description, preset }`, with
 * `preset.scenarios` when the style authors variants). The registered
 * preset itself is untouched; `label`/`description` overrides only affect the
 * emitted document.
 *
 * @param {string} name Registered preset name (e.g. 'call_me_sensei').
 * @param {{ label?: string, description?: string }} [overrides] Optional label/description overrides.
 * @returns {object} Environment preset document ready for `JSON.stringify`.
 * @throws {Error} If the preset is not registered or fails sanitization.
 */
export function createEnvironmentPresetDocument(name: string, { description, label }?: {
    label?: string;
    description?: string;
}): object;
/**
 * Validates an environment preset document (a parsed object or a JSON string)
 * without registering it. Mirrors `validateToonPresetDocument` in
 * toonSettings.js.
 *
 * @param {object | string} input Document object or JSON string.
 * @returns {{ ok: boolean, errors: string[], warnings: string[], value: object | null }}
 *   On `ok`, `value` is `{ id, label, description, features, parameters, rig }`,
 *   ready to pass to `registerEnvironmentPreset(value.id, value)`.
 */
export function validateEnvironmentPresetDocument(input: object | string): {
    ok: boolean;
    errors: string[];
    warnings: string[];
    value: object | null;
};
/**
 * Validates an environment preset document and registers it in one call.
 *
 * @param {object | string} document Document object or JSON string.
 * @param {{ overwrite?: boolean }} [options] Pass `overwrite: true` to replace an existing preset.
 * @returns {string} The registered preset name.
 * @throws {Error} If the document fails validation or the name is taken and `overwrite` is false.
 */
export function registerEnvironmentPresetDocument(document: object | string, { overwrite }?: {
    overwrite?: boolean;
}): string;
/** Document type tag stamped on shareable environment preset JSON documents. */
export const ENVIRONMENT_PRESET_DOCUMENT_TYPE: "toonlab/environment-preset";
/**
 * Current schema version for environment preset documents.
 * v2 adds `preset.scenarios`; v3 adds `preset.materialLook`.
 */
export const ENVIRONMENT_PRESET_SCHEMA_VERSION: 3;
/**
 * Canonical environment scenarios — the world-state axis (venue × time of
 * day). Every style resolves in every scenario via
 * `resolveEnvironmentPreset(style, scenario)`; styles author variants under
 * `scenarios` and inherit the canonical rendition for the rest.
 */
export const ENVIRONMENT_SCENARIOS: readonly (Readonly<{
    description: "Sunlit interior at midday.";
    id: "interiorDay";
    label: "Interior Day";
}> | Readonly<{
    description: "Warm lamps balanced against low evening sun.";
    id: "interiorEvening";
    label: "Interior Evening";
}> | Readonly<{
    description: "Lamp-lit interior after dark, sun off.";
    id: "interiorNight";
    label: "Interior Night";
}> | Readonly<{
    description: "Open-air daylight with sky tint and height fog.";
    id: "exteriorDay";
    label: "Exterior Day";
}>)[];
/**
 * Historical single-look preset ids. Each was the Default style's rendition
 * of one scenario; they now resolve as exactly that, byte-identical. Kept
 * indefinitely for saved bundles, lab links, and downstream games.
 */
export const ENVIRONMENT_PRESET_ALIASES: Readonly<{
    exteriorDay: Readonly<{
        preset: "default";
        scenario: "exteriorDay";
    }>;
    interiorDay: Readonly<{
        preset: "default";
        scenario: "interiorDay";
    }>;
    interiorEvening: Readonly<{
        preset: "default";
        scenario: "interiorEvening";
    }>;
    interiorNight: Readonly<{
        preset: "default";
        scenario: "interiorNight";
    }>;
}>;
