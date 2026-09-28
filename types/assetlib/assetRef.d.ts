/** Source-native ids → catalog-safe id segments ("ArmChair_01" → "armchair-01"). */
export function slugifyAssetId(id: any): string;
/**
 * Shared search over normalized refs — mirrors catalog.list() semantics
 * (free text over id/name/tags/categories; exact kind/category match).
 * Refs flagged `disabled` (moderation: trademark/personality-rights concerns
 * CC0 does not clear) are dropped unless `includeDisabled`.
 */
export function filterAssetRefs(refs: any, { text, kind, category, includeDisabled }?: {
    text?: any;
    kind?: any;
    category?: any;
    includeDisabled?: boolean;
}): any[];
/** Distinct categories across refs, most-used first (the lab's filter chips). */
export function collectAssetCategories(refs: any): any[];
/**
 * Nearest available resolution key ('1k' | '2k' | …) to the wanted one.
 * Exact match wins; otherwise the closest by pixel count, preferring the
 * smaller side on ties (imports should err cheap).
 */
export function pickResolution(available: any, wanted?: string): string;
export const ASSET_REF_KINDS: readonly string[];
/** Identify server-side asset API requests. Browsers cannot override their
 * User-Agent, so browser integrations use the identifying dev/host proxy. */
export const ASSETLIB_USER_AGENT: "ToonLab/0.2 (+https://toonlab.io; contact=jack@hyperbond.studio)";
