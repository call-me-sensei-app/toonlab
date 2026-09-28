/**
 * Resolves the whole-model material family used by Gallery and Asset Browser
 * previews. Explicit metadata wins. Manufactured signals intentionally run
 * before nature signals so assets such as "stone wall" and "wooden bridge"
 * remain objects rather than being mistaken for geology or vegetation.
 */
export function resolveGalleryMaterialFamily(asset: any, { fallback, }?: {
    fallback?: "urban";
}): any;
export const GALLERY_MATERIAL_FAMILY: Readonly<{
    environment: "environment";
    urban: "urban";
}>;
