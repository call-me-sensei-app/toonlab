/** '#rrggbb' or '#rgb' -> [r, g, b] in 0..1, or null when not parseable. */
export function hexToRgb01(hex: any): number[];
export function rgb01ToHex(rgb: any): string;
/**
 * Builds a complete, clamped settings object. Unknown groups/keys in the
 * overrides are ignored; colors accept hex strings or [r,g,b] triplets.
 */
export function createTextureSettings(overrides?: {}): {
    image: {
        bands: number;
        dataUrl: any;
        heightBase: any;
        heightDetail: any;
        name: string;
        seamless: boolean;
    };
};
export function cloneTextureSettings(settings: any): {
    image: {
        bands: number;
        dataUrl: any;
        heightBase: any;
        heightDetail: any;
        name: string;
        seamless: boolean;
    };
};
/** Flattens settings to { 'group.key': value } — the AI patch space. */
export function flattenTextureSettings(settings: any): {};
/**
 * Applies { 'group.key': value } patches onto settings with schema
 * clamping. Returns { settings, applied, ignored } — ignored lists the
 * patch keys that named no known field.
 */
export function applyTextureSettingsPatch(settings: any, patch?: {}): {
    applied: string[];
    ignored: string[];
    settings: {
        image: {
            bands: number;
            dataUrl: any;
            heightBase: any;
            heightDetail: any;
            name: string;
            seamless: boolean;
        };
    };
};
export function createTextureRecipeDocument(settings: any, { name }?: {
    name?: string;
}): {
    kind: string;
    name: string;
    settings: {
        image: {
            bands: number;
            dataUrl: any;
            heightBase: any;
            heightDetail: any;
            name: string;
            seamless: boolean;
        };
    };
    version: number;
};
export function validateTextureRecipeDocument(document: any): {
    errors: string[];
    ok: boolean;
};
export const TEXTURE_DETAIL_BLENDS: readonly string[];
export const TEXTURE_ACCENT_BLENDS: readonly string[];
export const TEXTURE_EMISSIVE_SOURCES: readonly string[];
export const TEXTURE_SETTING_GROUPS: readonly (Readonly<{
    description: "Deterministic seed shared by every layer.";
    id: "global";
    label: "Seed";
}> | Readonly<{
    description: "The primary structure: pattern, frequency, warp.";
    id: "base";
    label: "Base pattern";
}> | Readonly<{
    description: "Mid-frequency relief blended over the base.";
    id: "detailA";
    label: "Detail layer A";
}> | Readonly<{
    description: "Fine grain, pores, chips.";
    id: "detailB";
    label: "Detail layer B";
}> | Readonly<{
    description: "Five-stop height ramp, painterly jitter, cavity & sheen, final grade.";
    id: "color";
    label: "Color";
}> | Readonly<{
    description: "One-knob damage and dirt macros layered over everything.";
    id: "wear";
    label: "Wear & tear";
}> | Readonly<{
    description: "Masked colored overlay: moss, rust, dirt, snow, lichen…";
    id: "accentA";
    label: "Overlay A";
}> | Readonly<{
    description: "Second masked overlay: grime, stains, scorch, drips…";
    id: "accentB";
    label: "Overlay B";
}> | Readonly<{
    description: "PBR response: relief, occlusion, roughness, metalness.";
    id: "surface";
    label: "Surface";
}> | Readonly<{
    description: "Optional emissive map.";
    id: "emissive";
    label: "Glow";
}>)[];
/** group id -> { fieldKey -> field descriptor } (UI SchemaGroup shape). */
export const TEXTURE_SETTING_FIELD_SCHEMA: Readonly<{
    [k: string]: any;
}>;
export const DEFAULT_TEXTURE_SETTINGS: Readonly<{
    [k: string]: any;
}>;
export const TEXTURE_RECIPE_KIND: "toonlab.textureRecipe";
