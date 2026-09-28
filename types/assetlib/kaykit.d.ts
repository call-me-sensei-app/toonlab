export function getKayKitPack(packId: any): Readonly<unknown>;
export function kaykitRepoPageUrl(pack: any): string;
/** Raw url for one file inside a pack's gltf directory (relative paths from
 * nested packs pass through unencoded-slash intact). */
export function kaykitRawFileUrl(pack: any, relativePath: any): string;
/**
 * One model file inside a pack → loadable download:
 *   { format: 'gltf'|'glb', url, resources: { '<name>.bin': url, '<tex>.png': url } }
 * Multi-file .gltf models reference their .bin + shared texture by relative
 * uri in the SAME directory, so a plain fetch of the gltf url already works;
 * the explicit `resources` map keeps recipes self-describing (and covers
 * loaders that re-root relative uris), exactly like Poly Haven downloads.
 */
export function resolveKayKitDownload(pack: any, relativePath: any, { texture }?: {
    texture?: any;
}): {
    format: string;
    resources: {
        [x: number]: string;
    };
    url: string;
};
/**
 * File list of one pack (relative paths under its gltf directory) → sorted
 * normalized refs (kind is always 'model'; download embedded like
 * Poly Pizza's). The shared texture png is detected, not listed.
 */
export function normalizeKayKitFiles(files: any, pack: any): {
    attribution: Readonly<{
        license: "CC0";
        sourceLabel: "KayKit";
        sourceUrl: "https://kaylousberg.com";
        text: "Assets by Kay Lousberg — kaylousberg.com (attribution optional under CC0)";
    }>;
    authors: string[];
    categories: any[];
    download: {
        format: string;
        resources: {
            [x: number]: string;
        };
        url: string;
    };
    id: string;
    kind: string;
    name: any;
    pack: any;
    pageUrl: string;
    source: string;
    tags: any[];
    thumbnailUrl: string;
}[];
/**
 * Relative model/texture file paths of one pack. Static index first (zero
 * network — the "-1.0" repos are version-frozen); otherwise ONE git-trees API
 * call (cached per session) with a clear rate-limit message on 403/429.
 */
export function fetchKayKitPackFiles(pack: any, { fetchImpl, headers }?: {
    fetchImpl?: typeof fetch;
    headers?: {};
}): any;
/**
 * Normalized refs across packs (packs flipped to `enabled: false` never
 * list). Static packs always work; API-listed packs that fail (rate limit,
 * offline) are skipped so one bad pack never blanks the browser — it throws
 * only when EVERY pack failed.
 */
export function fetchKayKitIndex({ packs, fetchImpl, headers }?: {
    packs?: readonly Readonly<unknown>[];
    fetchImpl?: typeof fetch;
    headers?: {};
}): Promise<{
    attribution: Readonly<{
        license: "CC0";
        sourceLabel: "KayKit";
        sourceUrl: "https://kaylousberg.com";
        text: "Assets by Kay Lousberg — kaylousberg.com (attribution optional under CC0)";
    }>;
    authors: string[];
    categories: any[];
    download: {
        format: string;
        resources: {
            [x: number]: string;
        };
        url: string;
    };
    id: string;
    kind: string;
    name: any;
    pack: any;
    pageUrl: string;
    source: string;
    tags: any[];
    thumbnailUrl: string;
}[]>;
export const KAYKIT_GITHUB_ORG: "KayKit-Game-Assets";
export const KAYKIT_API_URL: "https://api.github.com";
export const KAYKIT_RAW_URL: "https://raw.githubusercontent.com";
export const KAYKIT_ATTRIBUTION: Readonly<{
    license: "CC0";
    sourceLabel: "KayKit";
    sourceUrl: "https://kaylousberg.com";
    text: "Assets by Kay Lousberg — kaylousberg.com (attribution optional under CC0)";
}>;
/** Curated pack index — repo + layout facts per pack. Flip `enabled: false`
 * to pull a whole pack out of listings with no code edit (same convention as
 * public/props/cc0/manifest.json). `bundled` names that manifest's pack key
 * for packs also shipped in this repo under public/props/cc0/<key>/;
 * listing/downloads still use the canonical GitHub urls so recipes stay
 * portable. */
export const KAYKIT_PACKS: readonly Readonly<unknown>[];
