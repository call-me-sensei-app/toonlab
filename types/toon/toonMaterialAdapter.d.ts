/** Resolves a debug view by name, alias or value: `{ name, label, value }`. */
export function resolveToonDebugOutputMode(value: any): {
    label: any;
    name: string;
    value: number;
};
export function waitForTexture(texture: any): Promise<any>;
export function waitForObjectTextures(root: any): Promise<any[]>;
export function setObjectTextureColorSpaces(root: any): void;
export function findPrimarySkinnedMesh(root: any): any;
/**
 * Converts every mesh under `root` to the toon character material. Options:
 * `preset`, `settings` (settings object or preset id), per-group overrides
 * (`light`, `shading`, `ramp`, `face`, `shadows`, `rim`, `highlights`,
 * `outline`, `maps`, `baseTexture`, `alpha`, `autoRoles`, `sticker`, `fur`),
 * `materialRoles`, `debugOutputMode`, `shaderMode` ('anime' | 'basic' |
 * 'toon' | 'normal'). Returns the conversion report and resolved settings.
 *
 * `autoRoles: { mode: 'precomputed', data }` applies a record made offline
 * by exportAutoRoles (parsed with parseAutoRoles / loadAutoRoles) instead of
 * analysing the textures: no texture pixel is read on the CPU, so base-colour
 * maps may be GPU-compressed (KTX2/Basis `CompressedTexture`).
 */
export function applyToonShader(root: any, options?: {}): any;
/**
 * Runs the automatic-role analysis, and records every other piece of texture
 * evidence conversion measures (alpha coverage, the skin check on materials
 * named as skin, the colour checks of the face-map, eye-white and stocking
 * bakes, MMD ramp tones), on `root` and returns it as a record for
 * `applyToonShader(model, { autoRoles: { mode: 'precomputed', data } })`.
 * Pass the options the runtime will convert with (`materialRoles`, `alpha`,
 * `autoRoles.skinTolerance`, ...) and the model in the state the runtime
 * converts it in (its `userData.toonForward`, rest pose). The model is
 * converted in the process, as applyToonShader would; export from a copy you
 * do not render. Returns `{ record, conversion }`: the record (raw role
 * weights and mask texels; see serializeAutoRoles to save it) and
 * applyToonShader's result for this live conversion.
 */
export function exportAutoRoles(root: any, options?: {}): {
    conversion: {
        autoRoles: any;
        convertedMeshCount: number;
        debugOutputMode: {
            label: any;
            name: string;
            value: number;
        };
        materialRoleSummary: {
            counts: {};
            materials: any[];
            total: number;
        };
        primarySkinnedMesh: any;
        report: any[];
        settings: any;
        shaderMode: any;
        toonPreset: any;
    };
    record: {
        autoRoles: any;
        evidence: any;
        format: string;
        forward: any[];
        forwardInferred: boolean;
        headEstimate: any;
        inputs: any;
        meshes: any[];
        model: {
            meshes: any;
            vertices: number;
        };
        toonlab: string;
        version: number;
    };
};
/**
 * Live retune: writes new settings into converted materials without
 * rebuilding them. Per-material authored values (MToon, MMD ramps, userData)
 * are re-applied on top. Maps and features that change the graph (a new
 * texture, turning the automatic face map on) need a new conversion.
 */
export function applyToonSettingsToMaterial(target: any, settingsInput?: {}): {
    settings: {
        preset: string;
        presetDescription: string;
        presetLabel: string;
    };
    updatedMaterialCount: number;
};
/** Selects a debug view on every converted material under `root` (a uniform write). */
export function setToonDebugOutput(root: any, debugOutputMode?: string): {
    label: any;
    name: string;
    value: number;
};
export function setToonDitherOpacity(target: any, opacity?: number): number;
/** Debug view name → value of the material's `debugMode` uniform. */
export const TOON_DEBUG_OUTPUT_MODES: Readonly<{
    [k: string]: number;
}>;
/** Debug view name → label. */
export const TOON_DEBUG_OUTPUT_LABELS: any;
export { alphaTestForMaterial, createAlphaSettings, DEFAULT_ALPHA_SETTINGS, resolveAlphaForMaterial, sourceOpacity, usesAlphaBlend, usesAlphaCutout } from "./settings/alphaSettings.js";
export { BASE_TEXTURE_MATERIAL_COLOR_MODES, BASE_TEXTURE_SATURATION_MODES, createBaseTextureSettings, DEFAULT_BASE_TEXTURE_SETTINGS } from "./settings/baseTextureSettings.js";
export { createFurSettings, DEFAULT_FUR_SETTINGS, materialUsesFur } from "./settings/furSettings.js";
export { AUTO_ROLES_DATA_FORMAT, AUTO_ROLES_DATA_VERSION, downsampleRoleMask, loadAutoRoles, parseAutoRoles, serializeAutoRoles } from "./autoRolesData.js";
export { createStickerSettings, DEFAULT_STICKER_SETTINGS, resolveStickerForMaterial, STICKER_BLEND_MODES } from "./settings/stickerSettings.js";
export { createLightSettings, DEFAULT_LIGHT_SETTINGS } from "./settings/lightSettings.js";
export { createShadingSettings, DEFAULT_SHADING_SETTINGS } from "./settings/shadingSettings.js";
export { createRampSettings, DEFAULT_RAMP_SETTINGS } from "./settings/rampSettings.js";
export { createFaceSettings, DEFAULT_FACE_SETTINGS, FACE_HEAD_SPACE_MODES } from "./settings/faceSettings.js";
export { CHARACTER_SHADOW_DIRECTIONS, createShadowSettings, DEFAULT_SHADOW_SETTINGS } from "./settings/shadowSettings.js";
export { createRimSettings, DEFAULT_RIM_SETTINGS, RIM_MODES } from "./settings/rimSettings.js";
export { createHighlightSettings, DEFAULT_HIGHLIGHT_SETTINGS } from "./settings/highlightSettings.js";
export { createOutlineSettings, DEFAULT_OUTLINE_SETTINGS } from "./settings/outlineSettings.js";
export { createMapsSettings, DEFAULT_MAPS_SETTINGS } from "./settings/mapsSettings.js";
export { createToonPresetDocument, createToonSettings, getToonPresetDefinition, getToonPresetIds, getToonPresetMetadata, getToonPresetOptions, getToonSettingFieldSchema, getToonSettingGroupMetadata, normalizeToonPresetName, parseToonPresetDocument, registerSerializedToonPreset, registerToonPreset, sanitizeToonPresetSettings, serializeToonPreset, TOON_PRESET_DOCUMENT_TYPE, TOON_PRESET_IDS, TOON_PRESET_SCHEMA_VERSION, TOON_SETTING_DEFAULTS, TOON_SETTING_FIELD_SCHEMA, TOON_SETTING_GROUP_METADATA, TOON_SETTING_GROUPS, validateToonPresetDocument } from "./toonSettings.js";
export { classifyMaterialRole, materialRoleName, materialRoleValue, MATERIAL_ROLE_LABELS, MATERIAL_ROLE_NAMES_BY_VALUE, MATERIAL_ROLES, normalizeMaterialRole, normalizeMaterialRoleOverrides, roleIsCatchlight, roleIsEye, roleIsEyeHighlight, roleIsIris, roleIsPupil, roleIsSclera } from "../core/materialRoles.js";
