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
 */
export function applyToonShader(root: any, options?: {}): {
    autoRoles: {
        applied: boolean;
        reason: string;
        medianRgb?: undefined;
        referenceSkinFraction?: undefined;
        counts?: undefined;
        headVertexCount?: undefined;
        meshes?: undefined;
        faceFrame?: undefined;
        maskedMeshes?: undefined;
        method?: undefined;
        skinReference?: undefined;
        skinTolerance?: undefined;
    } | {
        applied: boolean;
        medianRgb: any[];
        reason: string;
        referenceSkinFraction: number;
        counts?: undefined;
        headVertexCount?: undefined;
        meshes?: undefined;
        faceFrame?: undefined;
        maskedMeshes?: undefined;
        method?: undefined;
        skinReference?: undefined;
        skinTolerance?: undefined;
    } | {
        applied: boolean;
        counts: {
            face: number;
            hair: number;
            skin: number;
        };
        headVertexCount: number;
        meshes: number;
        faceFrame: {
            rx: number;
            ry: number;
            x: number;
            y: number;
        };
        maskedMeshes: number;
        method: string;
        skinReference: any[];
        skinTolerance: number;
        reason?: undefined;
        medianRgb?: undefined;
        referenceSkinFraction?: undefined;
    };
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
    settings: {
        preset: string;
        presetDescription: string;
        presetLabel: string;
    };
    shaderMode: any;
    toonPreset: string;
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
