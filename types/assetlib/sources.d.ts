/** Registry lookup by source id ('polyhaven', 'kaykit', …). */
export function getAssetSource(id: any): Readonly<unknown>;
/**
 * Apply a source's optional curated include list: with `curated` set, only
 * listed ref ids survive (curation-first over volume — see header). Sources
 * without a list pass through untouched.
 */
export function curateAssetRefs(refs: any, source: any): any;
/**
 * Registry query: by integration level ('api' | 'manual' | 'linkout' |
 * 'reference' | array of those) and/or asset kind. Sources flipped to
 * `enabled: false` are hidden unless `includeDisabled` (moderation surfaces
 * pass true).
 */
export function listAssetSources({ integration, kind, includeDisabled }?: {
    integration?: any;
    kind?: any;
    includeDisabled?: boolean;
}): Readonly<unknown>[];
export const ASSET_SOURCE_INTEGRATIONS: readonly string[];
export const ASSET_SOURCE_QUALITY_TIERS: readonly string[];
export const ASSET_SOURCES: readonly Readonly<unknown>[];
