/** Lists the canonical scenarios as `{ id, label, description }` (for HUDs). */
export function getSkyScenarioOptions(): {
    description: "Crisp daylight with sparse, slow-moving clouds." | "Low warm sun, glowing horizon, and softly lit evening clouds." | "Dense cloud cover with broad, low-contrast daylight." | "Deep night with a cool moon glow, quiet clouds, and stars.";
    id: "overcast" | "clear_day" | "golden_hour" | "moonlit";
    label: "Overcast" | "Clear Day" | "Golden Hour" | "Moonlit Night";
}[];
/**
 * Registers a named sky style so it resolves in `createSkySettings({
 * preset, scenario })` exactly like the built-ins. Accepts `{ label?,
 * description?, settings?, scenarios? }` or flat settings. `settings` is the
 * style's base identity; `scenarios` maps canonical scenario ids to partial
 * settings layered over that base. Scenarios the style does not author
 * inherit the canonical rendition (the Default style's variant keys) over
 * the style base, so every style resolves in every scenario either way.
 */
export function registerSkyPreset(name: any, preset?: {}, { overwrite }?: {
    overwrite?: boolean;
}): {
    description: string;
    id: any;
    label: string;
};
/**
 * Lists registered sky styles as `{ id, label, description, scenarios }`,
 * where `scenarios` reports per-scenario coverage: `'authored'` when the
 * style ships its own variant, `'inherited'` when the canonical rendition
 * fills in. Every style always covers every scenario.
 */
export function getSkyPresetOptions(): {
    description: any;
    id: any;
    label: any;
    scenarios: {
        [k: string]: string;
    };
}[];
/** Preferred style-axis normalizer; legacy scenario aliases fold to Default. */
export function resolveSkyStyleName(name: any): any;
/**
 * Validates and merges partial sky options over {@link DEFAULT_SKY_SETTINGS}.
 * Unknown keys are ignored; malformed values fall back to their defaults.
 * `createSkySettings()` deep-equals the defaults object.
 *
 * `style` names a sky STYLE (`preset` is the compatibility alias) and
 * `scenario` one of {@link SKY_SCENARIOS};
 * every style resolves in every scenario. Legacy single-look ids
 * (`clear_day`, `golden_hour`, `overcast`, `moonlit`) resolve as the Default
 * style at that scenario with identical settings.
 *
 * @param {Object} [options] Partial settings (legacy constructor options are
 *   the same flat shape, so they work unchanged).
 * @returns {Object} A complete, plain sky settings object.
 */
export function createSkySettings(options?: any): any;
/**
 * Normalizes a sky look into a complete, JSON-safe settings object. Runtime
 * construction state such as the dome radius is intentionally excluded.
 */
export function sanitizeSkyPresetSettings(settings?: {}): {
    [k: string]: any;
};
/** Validates and normalizes a portable sky preset document. Never throws. */
export function validateSkyPresetDocument(input: any): {
    errors: string[];
    ok: boolean;
    value: {
        description: string;
        id: any;
        label: string;
        settings: any;
        type: any;
        version: any;
    };
    warnings: any[];
};
/** Parses JSON text or an object into a validated sky preset document. */
export function parseSkyPresetDocument(input: any): any;
/** Creates a canonical, versioned sky preset document. */
export function createSkyPresetDocument(id: any, definition?: {}): {
    description: string;
    id: any;
    label: string;
    settings: any;
    type: any;
    version: any;
};
/** Serializes a sky preset id/definition or document-like object as JSON. */
export function serializeSkyPreset(idOrDocument: any, definition?: {}, { pretty }?: {
    pretty?: boolean;
}, ...args: any[]): string;
/** Registers a portable preset document, overwriting an existing id by default. */
export function registerSerializedSkyPreset(input: any, options?: {}): {
    description: string;
    id: any;
    label: string;
};
export function applySkySettingsToMaterial(material: any, options?: {}): any;
export function createSkyMaterial(options?: {}): any;
export { SKY_SCENE_OVERRIDE_PRIORITIES } from "./sceneOverrideLayers.js";
/**
 * Default sky settings. Every value equals the historical hardcoded/
 * constructor default, so `new StylizedSky()` renders identically to
 * previous releases. `radius` is construction-only (dome geometry).
 */
export const DEFAULT_SKY_SETTINGS: Readonly<{
    radius: 100;
    zenithColor: number[];
    horizonColor: number[];
    groundColor: number[];
    sunDirection: number[];
    sunColor: number[];
    sunSize: 0.026;
    sunDiscSoftness: 0.5;
    sunGlowStrength: 1;
    sunDiscIntensity: 2.4;
    sunGlowSpread: 5;
    sunGlowCoreSharpness: 60;
    sunGlowBroadStrength: 0.16;
    sunGlowCoreStrength: 0.5;
    sunCloudOcclusionStrength: 1;
    horizonScattering: 0.5;
    zenithExponent: 0.48;
    groundExponent: 0.55;
    horizonBandSize: 0.42;
    horizonSunPower: 5;
    cloudCoverage: 0.42;
    cloudScale: 1.6;
    cloudSpeed: 1;
    cloudDirection: readonly number[];
    cloudSeed: 0;
    cloudProjection: 0.22;
    cloudSoftness: 0.1;
    cloudEdgeOpacity: 0.65;
    cloudOpacity: 1;
    cloudShadeStrength: 0.85;
    cloudShadeThreshold: 0.02;
    cloudShadeSoftness: 0.06;
    cloudLightOffset: 0.4;
    cloudSilverLiningStrength: 0.3;
    cloudSunPower: 10;
    cloudHorizonFade: 0.16;
    cloudColor: number[];
    cloudShadeColor: number[];
    starsStrength: 0;
    starsColor: readonly number[];
    starsSeed: 0;
    starsScale: 14;
    starsDensity: 0.28;
    starsSize: 0.06;
    starsTwinkleStrength: 0.8;
    starsTwinkleSpeed: 1;
    starsHorizonFade: 0.24;
}>;
/** Document `type` discriminator for portable sky-look presets. */
export const SKY_PRESET_DOCUMENT_TYPE: "toonlab/sky-preset";
/** Current portable sky preset schema version. v2 adds per-scenario variants. */
export const SKY_PRESET_SCHEMA_VERSION: 2;
/**
 * Canonical sky scenarios — the world-state axis (time of day / weather
 * condition), deliberately separate from the style axis. A sky preset is a
 * STYLE (an identity: palette bias, cloud character, glow personality) and
 * every style resolves in every scenario, exactly like a lighting style's
 * `dayCycle` covers every hour. Selecting "Call Me Sensei" never means
 * "daytime only"; it means the Call Me Sensei rendition of whichever
 * scenario the scene is in.
 */
export const SKY_SCENARIOS: readonly (Readonly<{
    description: "Crisp daylight with sparse, slow-moving clouds.";
    id: "clear_day";
    label: "Clear Day";
}> | Readonly<{
    description: "Low warm sun, glowing horizon, and softly lit evening clouds.";
    id: "golden_hour";
    label: "Golden Hour";
}> | Readonly<{
    description: "Dense cloud cover with broad, low-contrast daylight.";
    id: "overcast";
    label: "Overcast";
}> | Readonly<{
    description: "Deep night with a cool moon glow, quiet clouds, and stars.";
    id: "moonlit";
    label: "Moonlit Night";
}>)[];
/** The scenario a style shows when no scenario is requested. */
export const DEFAULT_SKY_SCENARIO: "clear_day";
/**
 * Historical single-look preset ids. Each was really the Default style's
 * rendition of one scenario, so they now resolve as exactly that — settings
 * are byte-identical to the old flat presets. Kept indefinitely: saved
 * style bundles, lab links, and downstream games reference these ids.
 */
export const SKY_PRESET_ALIASES: Readonly<{
    clear_day: Readonly<{
        preset: "default";
        scenario: "clear_day";
    }>;
    golden_hour: Readonly<{
        preset: "default";
        scenario: "golden_hour";
    }>;
    moonlit: Readonly<{
        preset: "default";
        scenario: "moonlit";
    }>;
    overcast: Readonly<{
        preset: "default";
        scenario: "overcast";
    }>;
}>;
/**
 * Panel group metadata for the sky settings, in display order. Settings
 * themselves stay flat; each group lists which flat keys it owns via
 * {@link SKY_SETTING_FIELD_SCHEMA}.
 */
export const SKY_SETTING_GROUPS: readonly (Readonly<{
    description: "Sky dome geometry. Construction-only.";
    id: "dome";
    label: "Dome";
}> | Readonly<{
    description: "Vertical zenith-to-horizon-to-ground gradient and horizon scattering.";
    id: "gradient";
    label: "Gradient";
}> | Readonly<{
    description: "Sun disc position, size, tint, and glow halo.";
    id: "sun";
    label: "Sun";
}> | Readonly<{
    description: "Painterly two-tone procedural clouds.";
    id: "clouds";
    label: "Clouds";
}> | Readonly<{
    description: "Procedural star field for night skies.";
    id: "stars";
    label: "Stars";
}>)[];
/**
 * Field metadata (id/group/key/label/description/type/range/defaultValue/
 * serializable) per settings group, in the shape consumed by
 * `createSettingsPanel`. Keys are the flat {@link DEFAULT_SKY_SETTINGS} keys.
 */
export const SKY_SETTING_FIELD_SCHEMA: Readonly<{
    [k: string]: Readonly<{
        [k: string]: Readonly<{
            defaultValue: any;
            description: any;
            group: any;
            id: `${any}.${any}`;
            integer: any;
            key: any;
            label: any;
            optionLabels: any;
            options: any;
            range: any;
            serializable: any;
            type: any;
        }>;
    }>;
}>;
export class StylizedSky extends THREE.Mesh<THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>, THREE.Material<THREE.MaterialEventMap> | THREE.Material<THREE.MaterialEventMap>[], THREE.Object3DEventMap> {
    /**
     * @param {Object} [options] Flat sky settings (see
     *   {@link DEFAULT_SKY_SETTINGS}); legacy individual constructor options
     *   are the same keys, so existing callers keep working unchanged.
     */
    constructor(options?: any);
    _authoredSettings: any;
    _style: any;
    _scenario: any;
    _quality: any;
    _retiredMaterials: any[];
    _sceneOverrideLayers: Map<any, any>;
    _sceneOverrideSequence: number;
    _sceneOverrides: {};
    get settings(): any;
    /** Current authored IP-wide style identity. */
    get style(): any;
    /** Current authored world-state scenario. */
    get scenario(): any;
    /** Current compile-time deployment tier; not part of the authored preset. */
    get quality(): any;
    /** The settings currently uploaded after transient scene overrides. */
    get renderedSettings(): any;
    /** Current transient scene overrides, kept separate from authored settings. */
    get sceneOverrides(): {};
    /** Ordered runtime layer metadata, without exposing mutable resolvers. */
    get sceneOverrideLayers(): {
        id: any;
        priority: any;
    }[];
    _composeSceneSettings(): any;
    _applyComposedSceneSettings(): any;
    /**
     * Runtime re-tune: merges `options` into the current settings and pushes
     * every value into the material uniforms. `radius` is construction-only
     * (baked into the dome geometry); a new value is stored but the dome is
     * not rebuilt.
     *
     * @param {Object} [options] Partial flat settings, same keys as
     *   {@link DEFAULT_SKY_SETTINGS}.
     * @returns {Object} The updated settings object.
     */
    applySettings(options?: any): any;
    /**
     * Replaces the authored look from a registered style, then recomposes
     * runtime layers. `overrides.scenario` selects which canonical scenario of
     * the style to show (defaults to {@link DEFAULT_SKY_SCENARIO}).
     */
    setPreset(name: any, overrides?: {}): any;
    /** Preferred style-axis name; setPreset() remains the compatibility alias. */
    setStyle(name: any, overrides?: {}): any;
    /** Changes the world-state moment without changing the selected style. */
    setScenario(name: any, overrides?: {}): any;
    /**
     * Adds or replaces one transient world-state layer. A resolver receives the
     * result of all lower-priority layers, which lets Weather tint the current
     * Lighting time-of-day instead of competing with it.
     */
    setSceneOverrideLayer(id: any, optionsOrResolver?: {}, { priority, replace, }?: {
        priority?: 300;
        replace?: boolean;
    }): any;
    /** Removes one runtime owner without disturbing any other active layer. */
    clearSceneOverrideLayer(id: any): any;
    /**
     * Applies transient Lighting/Weather/world-state inputs without modifying
     * the authored sky preset returned by {@link settings}.
     */
    setSceneOverrides(options?: {}, { replace }?: {
        replace?: boolean;
    }): any;
    /** Clears only the compatibility/manual `scene` layer. */
    clearSceneOverrides(): any;
    /** Explicit full teardown for hosts that own every runtime Sky layer. */
    clearAllSceneOverrideLayers(): any;
    /** Rebuilds only the material graph for a new deployment-quality tier. */
    setQuality(value: any): this;
    update(delta: any, camera: any): this;
    dispose(): void;
}
import * as THREE from 'three';
export { SKY_QUALITY_OPTIONS, SKY_QUALITY_TIERS, resolveSkyQuality } from "./skyQuality.js";
