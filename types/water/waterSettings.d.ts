/** Lists the canonical scenarios as `{ id, label, description }` (for HUDs). */
export function getWaterScenarioOptions(): {
    description: "Balanced still-water body: light swell, anime-blue palette." | "Fast aligned current with chop, foam lines, and strong caustics." | "Onshore swell with rolling surf and contact foam." | "Big open-water swell in sets, whitecaps, curling breakers.";
    id: "lake" | "river" | "coast" | "ocean";
    label: "Lake" | "River" | "Coast" | "Ocean";
}[];
export function resolveWaterColorToneName(requested: any): string;
export function resolveWaterPresetName(name: any): any;
export function resolveWaterStyleName(name: any): string;
export function createWaterSettings(options?: {}): {
    preset: any;
    style: string;
    mode: any;
    colorTone: string;
    quality: any;
    waveIntensity: number;
    waterLevel: any;
    waveAmplitude: number;
    waveLength: number;
    waveSteepness: number;
    waveSpeed: number;
    waveDirection: any;
    waveDirectionSpread: number;
    shoalingDepth: number;
    shorelineWaves: number;
    shorelineRunup: number;
    runupDistance: number;
    breakerEnabled: any;
    breakerAmount: number;
    breakerCurl: number;
    breakerScale: number;
    breakerPeel: number;
    waveSetPeriod: number;
    waveSetStrength: number;
    detailNormalStrength: number;
    detailScale: number;
    flowDirection: any;
    flowSpeed: number;
    shallowColor: any;
    midColor: any;
    deepColor: any;
    depthFadeDistance: number;
    deepFadeDistance: number;
    opacity: number;
    refractionStrength: number;
    indexOfRefraction: number;
    underwaterTransmission: number;
    underwaterTintStrength: number;
    causticsStrength: number;
    causticsScale: number;
    causticsSpeed: number;
    foamColor: any;
    foamAmount: number;
    swashFoamAmount: number;
    swashFoamLifetime: number;
    swashFoamResidueLifetime: number;
    wetSandDryTime: number;
    wetSandDarkening: number;
    wetSandSheen: number;
    foamContactDistance: number;
    foamLineSpacing: number;
    foamNoiseScale: number;
    whitecapAmount: number;
    rippleFoamStrength: number;
    sunDirection: any;
    sunColor: any;
    specularStrength: number;
    specularShininess: number;
    specularStretch: number;
    sparkleStrength: number;
    sparkleScale: number;
    sparkleSpeed: number;
    sunGlowStrength: number;
    sceneShadowStrength: number;
    fresnelStrength: number;
    fresnelPower: number;
    fresnelBias: number;
    fresnelColor: any;
    skyZenithColor: any;
    skyHorizonColor: any;
    reflectionStrength: number;
    reflectionDistortion: number;
    reflectionSoftness: number;
    rippleStrength: number;
    rippleDamping: number;
    ripplePropagation: number;
    rippleHeightScale: number;
    rippleFoamDecay: number;
    rippleFoamGain: number;
    splashStrength: number;
    splashScale: number;
    splashDropletCount: number;
    splashRingCount: number;
    splashColor: any;
    splashShadeColor: any;
};
/**
 * Rebase authored Water settings onto another IP-wide style while retaining
 * only the user's actual overrides. This prevents a complete serialized
 * preset from masking every field supplied by the newly selected style.
 */
export function rebaseWaterSettingsStyle(settings?: {}, style?: string): {
    preset: any;
    style: string;
    mode: any;
    colorTone: string;
    quality: any;
    waveIntensity: number;
    waterLevel: any;
    waveAmplitude: number;
    waveLength: number;
    waveSteepness: number;
    waveSpeed: number;
    waveDirection: any;
    waveDirectionSpread: number;
    shoalingDepth: number;
    shorelineWaves: number;
    shorelineRunup: number;
    runupDistance: number;
    breakerEnabled: any;
    breakerAmount: number;
    breakerCurl: number;
    breakerScale: number;
    breakerPeel: number;
    waveSetPeriod: number;
    waveSetStrength: number;
    detailNormalStrength: number;
    detailScale: number;
    flowDirection: any;
    flowSpeed: number;
    shallowColor: any;
    midColor: any;
    deepColor: any;
    depthFadeDistance: number;
    deepFadeDistance: number;
    opacity: number;
    refractionStrength: number;
    indexOfRefraction: number;
    underwaterTransmission: number;
    underwaterTintStrength: number;
    causticsStrength: number;
    causticsScale: number;
    causticsSpeed: number;
    foamColor: any;
    foamAmount: number;
    swashFoamAmount: number;
    swashFoamLifetime: number;
    swashFoamResidueLifetime: number;
    wetSandDryTime: number;
    wetSandDarkening: number;
    wetSandSheen: number;
    foamContactDistance: number;
    foamLineSpacing: number;
    foamNoiseScale: number;
    whitecapAmount: number;
    rippleFoamStrength: number;
    sunDirection: any;
    sunColor: any;
    specularStrength: number;
    specularShininess: number;
    specularStretch: number;
    sparkleStrength: number;
    sparkleScale: number;
    sparkleSpeed: number;
    sunGlowStrength: number;
    sceneShadowStrength: number;
    fresnelStrength: number;
    fresnelPower: number;
    fresnelBias: number;
    fresnelColor: any;
    skyZenithColor: any;
    skyHorizonColor: any;
    reflectionStrength: number;
    reflectionDistortion: number;
    reflectionSoftness: number;
    rippleStrength: number;
    rippleDamping: number;
    ripplePropagation: number;
    rippleHeightScale: number;
    rippleFoamDecay: number;
    rippleFoamGain: number;
    splashStrength: number;
    splashScale: number;
    splashDropletCount: number;
    splashRingCount: number;
    splashColor: any;
    splashShadeColor: any;
};
export function buildGerstnerWaves(settings: any): {
    dirX: number;
    dirZ: number;
    omega: number;
    waveNumber: number;
    amplitude: number;
    phase: number;
    steepness: number;
    crestWeight: number;
}[];
export function sampleGerstnerHeight(waves: any, x: any, z: any, time: any, chopWeight?: number, nearshore?: any): number;
export function sampleGerstnerSwellHeight(waves: any, x: any, z: any, time: any, nearshore?: any): number;
export function samplePrimarySwellSequence(waves: any, time: any): {
    cycle: number;
    index: number;
};
export function samplePrimarySwellCycle(waves: any, time: any): number;
export function shapeSwashProgress(cycle: any, uprushFraction?: number): number;
export function sampleSwashEventShape(cycleIndex: any): {
    phase: number;
    frequency: number;
    amplitude: number;
};
export function sampleSwashCycleVariation(cycleIndex: any): {
    backwashStrength: number;
    backwashCarry: number;
    baseRunupScale: number;
    rundownOffset: number;
    runupScale: number;
};
export function sampleSwashDistance(waves: any, time: any, runupDistance: any, uprushFraction?: number): number;
export function sampleSwashFrameState(waves: any, time: any, runupDistance?: number, uprushFraction?: number): {
    cycle: number;
    cycleSpeed: number;
    edgeDistance: number;
    edgeDistanceSpeed: number;
    eventIndex: number;
    isUprush: boolean;
    primaryDirectionX: any;
    primaryDirectionZ: any;
    progress: number;
    progressSpeed: number;
    activity: number;
    runupScale: number;
    startOffset: number;
    endOffset: number;
    edgeShape: {
        phase: number;
        frequency: number;
        amplitude: number;
    };
};
export function sampleSwashEdgeOffset(x: any, time: any, progress: any, waveDirectionX?: number, cycle?: number, edgeShape?: any): number;
/**
 * Coerces a flat water settings object down to the serializable schema:
 * numbers stay finite numbers, booleans/selects are validated, and colors and
 * direction vectors are normalized to plain [r, g, b] / [x, y] / [x, y, z]
 * arrays (THREE.Color / Vector inputs included). Unknown and runtime-only
 * keys are dropped; legacy key aliases (e.g. `normalStrength`) are resolved
 * to their canonical names first.
 *
 * Note: presets cannot change the Gerstner wave count —
 * WATER_GERSTNER_WAVE_COUNT is baked into the shader and the CPU mirror.
 *
 * @param {object} [settings] Flat settings overrides keyed like DEFAULT_WATER_SETTINGS.
 * @returns {object} Sanitized JSON-safe settings object.
 */
export function sanitizeWaterPresetSettings(settings?: object): object;
/**
 * Validates (and migrates) a water preset document. Never throws.
 *
 * @param {object} input Parsed preset document (or a loose legacy shape).
 * @returns {{ok: boolean, errors: string[], warnings: string[], value: object|null}}
 *   `value` is the normalized document (sanitized settings, canonical type
 *   and version) when `ok` is true, otherwise null.
 */
export function validateWaterPresetDocument(input: object): {
    ok: boolean;
    errors: string[];
    warnings: string[];
    value: object | null;
};
/**
 * Parses a JSON string (or already-parsed object) into a validated water
 * preset document. Never throws; JSON errors are reported in `errors`.
 *
 * @param {string|object} input Preset JSON text or object.
 * @returns {{ok: boolean, errors: string[], warnings: string[], value: object|null}}
 */
export function parseWaterPresetDocument(input: string | object): {
    ok: boolean;
    errors: string[];
    warnings: string[];
    value: object | null;
};
/**
 * Builds a normalized water preset document from a preset id and definition.
 * The definition may carry a nested `settings` object or flat setting keys
 * (e.g. `{ waveIntensity: 0.5 }`); either way the result is validated and
 * sanitized. Throws when the document is invalid (e.g. missing id).
 *
 * @param {string} id Preset id (normalized to snake_case lowercase).
 * @param {object} [definition] `{ label?, description?, settings? }` or flat settings.
 * @returns {object} `{ type, version, id, label, description, settings }`.
 */
export function createWaterPresetDocument(id: string, definition?: object): object;
/**
 * Serializes a water preset to a JSON string. Accepts either
 * `serializeWaterPreset(id, definition)` or a single document-like object.
 *
 * @param {string|object} idOrDocument Preset id, or a document-like object.
 * @param {object} [definition] Preset definition when the first argument is an id.
 * @param {{pretty?: boolean}} [options] `pretty` (default true) pretty-prints the JSON.
 * @returns {string} Preset document JSON.
 */
export function serializeWaterPreset(idOrDocument: string | object, definition?: object, { pretty }?: {
    pretty?: boolean;
}, ...args: any[]): string;
/**
 * Registers a named water preset so it resolves in createWaterSettings /
 * createWaterMaterial exactly like the built-ins:
 *
 *   registerWaterPreset('bioluminescent_bay', {
 *     label: 'Bioluminescent Bay',
 *     waveIntensity: 0.1,
 *     deepColor: [0.01, 0.09, 0.2],
 *   });
 *   const settings = createWaterSettings({ preset: 'bioluminescent_bay' });
 *
 * Settings are sanitized to serializable values (see
 * sanitizeWaterPresetSettings). Presets cannot change the Gerstner wave
 * count — WATER_GERSTNER_WAVE_COUNT is baked into the shader.
 *
 * @param {string} name Preset id (normalized to snake_case lowercase).
 * @param {object} [preset] `{ label?, description?, settings? }` or flat settings.
 * @param {{overwrite?: boolean}} [options] Set `overwrite: true` to replace an
 *   existing preset (including built-ins); otherwise re-registering throws.
 * @returns {{id: string, label: string, description: string}} Registered preset metadata.
 */
export function registerWaterPreset(name: string, preset?: object, { overwrite }?: {
    overwrite?: boolean;
}): {
    id: string;
    label: string;
    description: string;
};
/** Registers an IP-wide water rendition that composes over every preset. */
export function registerWaterStyle(name: any, definition?: {}, { overwrite }?: {
    overwrite?: boolean;
}): {
    description: string;
    id: string;
    label: string;
};
/**
 * Registers a preset from serialized JSON (string or parsed document), as
 * produced by serializeWaterPreset. Overwrites by default so re-importing a
 * saved preset always takes effect. Throws when the document is invalid.
 *
 * @param {string|object} input Preset document JSON or object.
 * @param {{overwrite?: boolean}} [options]
 * @returns {{id: string, label: string, description: string}} Registered preset metadata.
 */
export function registerSerializedWaterPreset(input: string | object, options?: {
    overwrite?: boolean;
}): {
    id: string;
    label: string;
    description: string;
};
/**
 * Lists every registered water preset (built-ins first, then user-registered)
 * as `{ id, label, description }` entries — ready for a preset picker.
 *
 * @returns {Array<{id: string, label: string, description: string}>}
 */
export function getWaterPresetOptions(): Array<{
    id: string;
    label: string;
    description: string;
}>;
/**
 * Lists water STYLES only — IP identities that resolve over every water
 * preset — as `{ id, label, description, presets }`, where `presets` reports
 * whether each preset has a dedicated variant or inherits the style base.
 */
export function getWaterStyleOptions(): {
    description: any;
    id: any;
    label: any;
    presets: {
        [k: string]: string;
    };
}[];
export const WATER_PRESET_NAMES: readonly string[];
/**
 * Canonical body-of-water presets used by focused scenario pickers. They are
 * a subset of WATER_PRESET_NAMES; the style axis is always separate and
 * applies across every preset, including mirror/calm/storm.
 */
export const WATER_SCENARIOS: readonly (Readonly<{
    description: "Balanced still-water body: light swell, anime-blue palette.";
    id: "lake";
    label: "Lake";
}> | Readonly<{
    description: "Fast aligned current with chop, foam lines, and strong caustics.";
    id: "river";
    label: "River";
}> | Readonly<{
    description: "Onshore swell with rolling surf and contact foam.";
    id: "coast";
    label: "Coast";
}> | Readonly<{
    description: "Big open-water swell in sets, whitecaps, curling breakers.";
    id: "ocean";
    label: "Ocean";
}>)[];
/** The body preset used by legacy style-as-preset calls with no scenario. */
export const DEFAULT_WATER_SCENARIO: "lake";
export const WATER_QUALITY_LEVELS: readonly string[];
export const WATER_COLOR_TONES: Readonly<{
    classic: Readonly<{}>;
    anime: Readonly<{
        shallowColor: number[];
        midColor: number[];
        deepColor: number[];
        depthFadeDistance: 1.8;
        deepFadeDistance: 4.2;
        fresnelColor: number[];
        fresnelBias: 0.07;
        reflectionStrength: 0.46;
        reflectionSoftness: 0.36;
        causticsStrength: 0.3;
        detailNormalStrength: 0.38;
    }>;
    teal: Readonly<{
        shallowColor: number[];
        midColor: number[];
        deepColor: number[];
        depthFadeDistance: 1.4;
        deepFadeDistance: 3;
        fresnelColor: number[];
    }>;
    caribbean: Readonly<{
        shallowColor: number[];
        midColor: number[];
        deepColor: number[];
        depthFadeDistance: 1.9;
        deepFadeDistance: 4.2;
        fresnelColor: number[];
    }>;
    lagoon: Readonly<{
        shallowColor: number[];
        midColor: number[];
        deepColor: number[];
        depthFadeDistance: 1.5;
        deepFadeDistance: 3.2;
        fresnelColor: number[];
    }>;
    deepOcean: Readonly<{
        shallowColor: number[];
        midColor: number[];
        deepColor: number[];
        depthFadeDistance: 0.9;
        deepFadeDistance: 2;
        fresnelColor: number[];
    }>;
}>;
export const WATER_COLOR_TONE_NAMES: readonly string[];
export const WATER_DEBUG_MODES: Readonly<{
    off: 0;
    depth: 1;
    foam: 2;
    normal: 3;
    ripple: 4;
    reflection: 5;
    caustics: 6;
    specular: 7;
    fresnel: 8;
    crest: 9;
    shoreState: 10;
}>;
export const WATER_GERSTNER_WAVE_COUNT: 8;
export const DEFAULT_WATER_SETTINGS: Readonly<{
    preset: "lake";
    colorTone: "classic";
    waveIntensity: 0.25;
    waterLevel: 0.36;
    waveAmplitude: 0.3;
    waveLength: 7.5;
    waveSteepness: 0.75;
    waveSpeed: 1;
    waveDirection: number[];
    waveDirectionSpread: 0.65;
    shoalingDepth: 1.4;
    shorelineWaves: 0.35;
    shorelineRunup: 0.6;
    runupDistance: 0;
    breakerEnabled: true;
    breakerAmount: 0;
    breakerCurl: 0.8;
    breakerScale: 1;
    breakerPeel: 1;
    waveSetPeriod: 60;
    waveSetStrength: 0.5;
    detailNormalStrength: 0.32;
    detailScale: 1.15;
    flowDirection: number[];
    flowSpeed: 0.3;
    shallowColor: number[];
    midColor: number[];
    deepColor: number[];
    depthFadeDistance: 1;
    deepFadeDistance: 2.2;
    opacity: 0.8;
    refractionStrength: 0.35;
    indexOfRefraction: 1.333;
    underwaterTransmission: 1;
    underwaterTintStrength: 0.35;
    causticsStrength: 0.55;
    causticsScale: 0.8;
    causticsSpeed: 0.6;
    foamColor: number[];
    foamAmount: 1;
    swashFoamAmount: 1.15;
    swashFoamLifetime: 4;
    swashFoamResidueLifetime: 10;
    wetSandDryTime: 120;
    wetSandDarkening: 0.58;
    wetSandSheen: 0.78;
    foamContactDistance: 0.4;
    foamLineSpacing: 0.55;
    foamNoiseScale: 0.6;
    whitecapAmount: 0.05;
    rippleFoamStrength: 0.8;
    sunDirection: number[];
    sunColor: number[];
    specularStrength: 0.8;
    specularShininess: 150;
    specularStretch: 0.35;
    sparkleStrength: 0.5;
    sparkleScale: 1.5;
    sparkleSpeed: 1;
    sunGlowStrength: 0.85;
    sceneShadowStrength: 0.6;
    fresnelStrength: 0.9;
    fresnelPower: 4.5;
    fresnelBias: 0.16;
    fresnelColor: number[];
    skyZenithColor: number[];
    skyHorizonColor: number[];
    reflectionStrength: 0.62;
    reflectionDistortion: 0.04;
    reflectionSoftness: 0.55;
    rippleStrength: 1;
    rippleDamping: 0.985;
    ripplePropagation: 11;
    rippleHeightScale: 1;
    rippleFoamDecay: 0.94;
    rippleFoamGain: 2.4;
    splashStrength: 1;
    splashScale: 1;
    splashDropletCount: 26;
    splashRingCount: 2;
    splashColor: number[];
    splashShadeColor: number[];
    quality: "high";
}>;
export const WATER_SETTING_GROUPS: readonly (Readonly<{
    id: "waves";
    label: "Waves";
    description: "Gerstner swell and detail ripple shaping.";
}> | Readonly<{
    id: "surface";
    label: "Surface";
    description: "Water body color, refraction, and caustics.";
}> | Readonly<{
    id: "foam";
    label: "Foam";
    description: "Shoreline foam, whitecaps, and wake foam.";
}> | Readonly<{
    id: "lighting";
    label: "Lighting";
    description: "Authored fallback sun/sky plus water-specific glint, fresnel, and reflection response.";
}> | Readonly<{
    id: "ripples";
    label: "Ripples";
    description: "Interactive ripple simulation response.";
}> | Readonly<{
    id: "splashes";
    label: "Splashes";
    description: "Procedural splash droplets, spray, and rings.";
}> | Readonly<{
    id: "quality";
    label: "Quality";
    description: "Shader quality tier gating caustics, sparkles, and noise octaves.";
}>)[];
export const WATER_SETTING_FIELD_SCHEMA: Readonly<{
    [k: string]: Readonly<{
        key: string;
        id: `${string}.${string}`;
        group: string;
        label: string;
        type: any;
        min: any;
        max: any;
        step: any;
        range: Readonly<{
            min: any;
            max: any;
            step: any;
        }>;
        options: any;
        optionLabels: any;
        description: string;
        defaultValue: any;
        serializable: true;
    }>;
}>;
/**
 * WATER_SETTING_FIELD_SCHEMA regrouped by setting-group id so it plugs
 * straight into the schema-driven debug panel, which looks fields up per
 * group (mirrors the nested shape of TOON_SETTING_FIELD_SCHEMA):
 *
 *   createSettingsPanel({
 *     groups: WATER_SETTING_GROUPS,
 *     fieldSchema: WATER_SETTING_FIELD_SCHEMA_BY_GROUP,
 *     ...
 *   });
 *
 * Water settings are flat (no per-group nesting), so hosts read values with
 * `settings[field.key]` rather than `settings[field.group][field.key]`.
 */
export const WATER_SETTING_FIELD_SCHEMA_BY_GROUP: Readonly<{
    [k: string]: Readonly<{
        [k: string]: Readonly<{
            key: string;
            id: `${string}.${string}`;
            group: string;
            label: string;
            type: any;
            min: any;
            max: any;
            step: any;
            range: Readonly<{
                min: any;
                max: any;
                step: any;
            }>;
            options: any;
            optionLabels: any;
            description: string;
            defaultValue: any;
            serializable: true;
        }>;
    }>;
}>;
/** Document `type` discriminator for serialized water presets. */
export const WATER_PRESET_DOCUMENT_TYPE: "toonlab/water-preset";
/** Current water preset document schema version. v2 adds per-scenario variants. */
export const WATER_PRESET_SCHEMA_VERSION: 2;
