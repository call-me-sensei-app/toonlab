export function getToonSettingGroupMetadata(groupId: any): Readonly<{
    description: "Strengths of the source material's normal, AO, emissive, matcap, detail, roughness/metalness and specular colour maps.";
    id: "maps";
    label: "Material Maps";
}> | Readonly<{
    description: "Face-map shading, smoothed face normals and painted face details.";
    id: "face";
    label: "Face";
}> | Readonly<{
    description: "Stylised specular, the hair ring, the eye glint and the stocking streak.";
    id: "highlights";
    label: "Highlights";
}> | Readonly<{
    description: "How the scene's sun, sky, probes and local lights reach the character.";
    id: "light";
    label: "Light";
}> | Readonly<{
    description: "Inverted-hull ink outlines: widths, ink colour and screen-space behaviour.";
    id: "outline";
    label: "Outline";
}> | Readonly<{
    description: "Shadow tones per kind of surface and the warm band just inside the terminator.";
    id: "ramp";
    label: "Shadow Tones";
}> | Readonly<{
    description: "The depth rim on the lit side and the faint silhouette rim.";
    id: "rim";
    label: "Rim";
}> | Readonly<{
    description: "The terminator between light and shadow and the lighting map that shifts it.";
    id: "shading";
    label: "Shading";
}> | Readonly<{
    description: "Cast shadows from the scenery, the character's own shadow map and the screen-space hair shadow.";
    id: "shadows";
    label: "Cast Shadows";
}> | Readonly<{
    description: "Cutout, blend and draw-order policy for the model's materials.";
    id: "alpha";
    label: "Alpha";
}> | Readonly<{
    description: "Automatic face, skin and hair roles for models whose materials name none.";
    id: "autoRoles";
    label: "Automatic Roles";
}> | Readonly<{
    description: "How the source base texture and material colour become the albedo.";
    id: "baseTexture";
    label: "Base Texture";
}> | Readonly<{
    description: "Shell fur on opted-in materials.";
    id: "fur";
    label: "Fur";
}> | Readonly<{
    description: "A decal texture blended into the albedo before lighting.";
    id: "sticker";
    label: "Sticker";
}>;
/** Field metadata by group and dotted key (`getToonSettingFieldSchema('light', 'cameraLight.strength')`). */
export function getToonSettingFieldSchema(groupId: any, key?: any): Readonly<{}>;
/** Resolves a preset name (`'Call Me Sensei'`, `'call-me-sensei'`, …) to a registered id, else `'default'`. */
export function normalizeToonPresetName(value: any): string;
export function getToonPresetIds(): string[];
export function getToonPresetMetadata(id: any): {
    builtIn: boolean;
    description: string;
    id: string;
    label: string;
};
export function getToonPresetOptions(): {
    builtIn: boolean;
    description: string;
    id: string;
    label: string;
}[];
/** The preset's partial settings (relative to the defaults), deep-copied. */
export function getToonPresetDefinition(id: any): {
    description: string;
    id: string;
    label: string;
    settings: {};
};
/**
 * Resolves complete settings: the defaults, then the preset's settings, then
 * any per-group overrides. Accepts a preset id, a settings object with
 * `preset`, or settings previously returned by this function.
 */
export function createToonSettings(input?: {}): {
    preset: string;
    presetDescription: string;
    presetLabel: string;
};
/**
 * Keeps only schema-known, serialisable settings (coerced), dropping textures,
 * unknown groups and unknown keys. Partial input stays partial.
 */
export function sanitizeToonPresetSettings(settings?: {}): {};
/**
 * Validates a parsed toon preset document. Never throws. Documents written
 * before schema version 2 use the retired settings groups and are rejected;
 * they are not converted.
 */
export function validateToonPresetDocument(input: any): {
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
export function parseToonPresetDocument(input: any): any;
/** Builds a validated preset document; `definition` carries `settings`, `label`, `description`. */
export function createToonPresetDocument(id: any, definition?: {}): any;
export function serializeToonPreset(idOrDocument: any, definition?: {}, options?: {}, ...args: any[]): string;
/**
 * Registers a preset usable anywhere a built-in one is. The definition is
 * sanitised through the document pipeline. Replacing an existing id needs
 * `overwrite`; the system style (`call_me_sensei`) is read-only.
 */
export function registerToonPreset(id: any, definition?: {}, { overwrite }?: {
    overwrite?: boolean;
}): {
    description: string;
    id: string;
    label: string;
    settings: {};
};
/** Parses a serialised preset document and registers it. */
export function registerSerializedToonPreset(input: any, options?: {}): {
    description: string;
    id: string;
    label: string;
    settings: {};
};
/** Setting groups in display order: `{ id, label, description }`. */
export const TOON_SETTING_GROUPS: readonly (Readonly<{
    description: "Strengths of the source material's normal, AO, emissive, matcap, detail, roughness/metalness and specular colour maps.";
    id: "maps";
    label: "Material Maps";
}> | Readonly<{
    description: "Face-map shading, smoothed face normals and painted face details.";
    id: "face";
    label: "Face";
}> | Readonly<{
    description: "Stylised specular, the hair ring, the eye glint and the stocking streak.";
    id: "highlights";
    label: "Highlights";
}> | Readonly<{
    description: "How the scene's sun, sky, probes and local lights reach the character.";
    id: "light";
    label: "Light";
}> | Readonly<{
    description: "Inverted-hull ink outlines: widths, ink colour and screen-space behaviour.";
    id: "outline";
    label: "Outline";
}> | Readonly<{
    description: "Shadow tones per kind of surface and the warm band just inside the terminator.";
    id: "ramp";
    label: "Shadow Tones";
}> | Readonly<{
    description: "The depth rim on the lit side and the faint silhouette rim.";
    id: "rim";
    label: "Rim";
}> | Readonly<{
    description: "The terminator between light and shadow and the lighting map that shifts it.";
    id: "shading";
    label: "Shading";
}> | Readonly<{
    description: "Cast shadows from the scenery, the character's own shadow map and the screen-space hair shadow.";
    id: "shadows";
    label: "Cast Shadows";
}> | Readonly<{
    description: "Cutout, blend and draw-order policy for the model's materials.";
    id: "alpha";
    label: "Alpha";
}> | Readonly<{
    description: "Automatic face, skin and hair roles for models whose materials name none.";
    id: "autoRoles";
    label: "Automatic Roles";
}> | Readonly<{
    description: "How the source base texture and material colour become the albedo.";
    id: "baseTexture";
    label: "Base Texture";
}> | Readonly<{
    description: "Shell fur on opted-in materials.";
    id: "fur";
    label: "Fur";
}> | Readonly<{
    description: "A decal texture blended into the albedo before lighting.";
    id: "sticker";
    label: "Sticker";
}>)[];
/** Group metadata keyed by group id. */
export const TOON_SETTING_GROUP_METADATA: Readonly<{
    [k: string]: Readonly<{
        description: "Strengths of the source material's normal, AO, emissive, matcap, detail, roughness/metalness and specular colour maps.";
        id: "maps";
        label: "Material Maps";
    }> | Readonly<{
        description: "Face-map shading, smoothed face normals and painted face details.";
        id: "face";
        label: "Face";
    }> | Readonly<{
        description: "Stylised specular, the hair ring, the eye glint and the stocking streak.";
        id: "highlights";
        label: "Highlights";
    }> | Readonly<{
        description: "How the scene's sun, sky, probes and local lights reach the character.";
        id: "light";
        label: "Light";
    }> | Readonly<{
        description: "Inverted-hull ink outlines: widths, ink colour and screen-space behaviour.";
        id: "outline";
        label: "Outline";
    }> | Readonly<{
        description: "Shadow tones per kind of surface and the warm band just inside the terminator.";
        id: "ramp";
        label: "Shadow Tones";
    }> | Readonly<{
        description: "The depth rim on the lit side and the faint silhouette rim.";
        id: "rim";
        label: "Rim";
    }> | Readonly<{
        description: "The terminator between light and shadow and the lighting map that shifts it.";
        id: "shading";
        label: "Shading";
    }> | Readonly<{
        description: "Cast shadows from the scenery, the character's own shadow map and the screen-space hair shadow.";
        id: "shadows";
        label: "Cast Shadows";
    }> | Readonly<{
        description: "Cutout, blend and draw-order policy for the model's materials.";
        id: "alpha";
        label: "Alpha";
    }> | Readonly<{
        description: "Automatic face, skin and hair roles for models whose materials name none.";
        id: "autoRoles";
        label: "Automatic Roles";
    }> | Readonly<{
        description: "How the source base texture and material colour become the albedo.";
        id: "baseTexture";
        label: "Base Texture";
    }> | Readonly<{
        description: "Shell fur on opted-in materials.";
        id: "fur";
        label: "Fur";
    }> | Readonly<{
        description: "A decal texture blended into the albedo before lighting.";
        id: "sticker";
        label: "Sticker";
    }>;
}>;
/**
 * Field metadata per group, nested like the group's values; every leaf is
 * `{ id, group, key, label, description, type, range, options, optionLabels,
 * defaultValue, serializable }` (`key` is the dotted path within the group).
 */
export const TOON_SETTING_FIELD_SCHEMA: Readonly<{
    [k: string]: Readonly<{}>;
}>;
/** The built-in preset ids. */
export const TOON_PRESET_IDS: readonly string[];
/** Default-preset settings for every group. */
export const TOON_SETTING_DEFAULTS: Readonly<{
    preset: string;
    presetDescription: string;
    presetLabel: string;
}>;
export const TOON_PRESET_DOCUMENT_TYPE: "toonlab/toon-preset";
export const TOON_PRESET_SCHEMA_VERSION: 2;
