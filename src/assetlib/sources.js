// Source registry — the one list of every asset source the lab knows about,
// integrated or not. Honest capability levels instead of fake adapters:
//
//   api        a client module in this folder lists/downloads programmatically
//   manual     CC0 downloads exist but there is no public file API — the lab
//              links out and the user imports the downloaded file/zip
//   linkout    browsable site we deliberately do NOT automate (OAuth-only
//              APIs, or platform terms that forbid automated downloads)
//   reference  adjacent media (images/audio), listed for completeness only
//
// SAFEGUARD (product decision 2026-07-16): an open license clears only the
// rights it names, not trademarks, personality rights, or logos visible in
// scans — so moderation
// is a config flip, not a code edit, at both levels:
//   source `enabled: false`  hides the whole catalog (listAssetSources; same
//                            flag name as public/props/cc0/manifest.json uses
//                            for bundled packs)
//   ref    `disabled: true`  hides one asset (filterAssetRefs)
// and every ref keeps `source` + attribution provenance even for all-CC0
// providers, so anything surfaced is always traceable.
//
// CURATION POLICY (product call 2026-07-16): the bar is Genshin-Impact-level
// polish — flooding the platform with low-quality assets is worse than fewer
// sources, and blocky/chibi low-poly does NOT qualify (KayKit was reviewed
// in real scenes and rejected). Hence:
//   qualityTier  'reference' (Poly Haven-tier scans/PBR) | 'stylized'
//                (owner-approved stylization compatible with a polished
//                anime open-world look — currently NONE hold it) |
//                'unreviewed' (ships enabled: false until an owner pass)
//   curated      optional explicit include list of ref ids — when a source's
//                catalog is mixed-quality, list the keepers here instead of
//                enabling the whole firehose (curateAssetRefs applies it)

export const ASSET_SOURCE_INTEGRATIONS = Object.freeze(['api', 'manual', 'linkout', 'reference']);
export const ASSET_SOURCE_QUALITY_TIERS = Object.freeze(['reference', 'stylized', 'unreviewed']);

export const ASSET_SOURCES = Object.freeze([
  {
    enabled: true,
    goodFor: 'photoscanned props, PBR texture sets, HDRIs',
    id: 'polyhaven',
    integration: 'api',
    keyed: false,
    kinds: ['model', 'texture', 'hdri'],
    label: 'Poly Haven',
    license: 'CC0',
    notes: 'The current API page permits any use; live calls require visible Poly Haven credit and an identifying User-Agent — see polyhaven.js.',
    qualityTier: 'reference',
    url: 'https://polyhaven.com',
  },
  {
    enabled: true,
    goodFor: 'PBR material sets (bricks, wood, ground …)',
    id: 'ambientcg',
    integration: 'api',
    keyed: false,
    kinds: ['texture', 'hdri', 'model'],
    label: 'ambientCG',
    license: 'CC0',
    notes: 'Keyless API, zip downloads via the backend/dev-proxy route — see ambientcg.js.',
    qualityTier: 'reference',
    url: 'https://ambientcg.com',
  },
  {
    enabled: true,
    goodFor: 'georeferenced Japanese buildings and city architecture (3D Tiles + CityGML)',
    id: 'plateau',
    integration: 'api',
    keyed: false,
    kinds: ['model'],
    label: 'Project PLATEAU',
    license: 'PDL 1.0 / CC BY 4.0 compatible',
    notes: 'Official MLIT catalog with browser CORS. The client indexes one highest-LOD building dataset per municipality/ward and preserves mandatory source attribution.',
    qualityTier: 'reference',
    url: 'https://www.mlit.go.jp/plateau/opendata/',
  },
  {
    // Community corpus is mixed-quality → unreviewed under the 2026-07-16
    // curation policy despite shipping earlier; re-enable (or add a
    // `curated` list) after an owner pass in the asset-lab.
    enabled: false,
    goodFor: 'authored low-poly models — the best toon-shader fit',
    id: 'polypizza',
    integration: 'api',
    key: { env: 'TOONLAB_POLYPIZZA_KEY', url: 'https://poly.pizza/settings/api' },
    keyed: true,
    kinds: ['model'],
    label: 'Poly Pizza',
    license: 'CC0 + CC-BY',
    notes: 'BYO free key; corpus is CC0 or CC-BY — searchPolyPizza filters to CC0 by default. Hobby free, commercial pay-as-you-go.',
    qualityTier: 'unreviewed',
    url: 'https://poly.pizza',
  },
  {
    // Owner-reviewed in real scenes 2026-07-16 and rejected for the platform
    // bar (blocky low-poly ≠ Genshin-level polish). Adapter stays — this
    // flag is exactly how that call ships cheaply.
    enabled: false,
    goodFor: 'stylized low-poly packs: city, furniture, dungeon, characters',
    id: 'kaykit',
    integration: 'api',
    keyed: false,
    kinds: ['model'],
    label: 'KayKit',
    license: 'CC0',
    notes: 'Kay Lousberg’s GitHub packs, raw-downloadable; static pack index avoids the 60 req/h unauthenticated API limit — see kaykit.js.',
    qualityTier: 'unreviewed',
    url: 'https://kaylousberg.com',
  },
  {
    // Disabled pending quality review (product call 2026-07-16: collection
    // may be too low quality for us). The adapter works — flip this, or use
    // the lab's local "enable for evaluation" override, to browse it.
    enabled: false,
    goodFor: 'environment sets (park, museum, sci-fi, vaporwave) + creatures',
    id: 'opensource3d',
    integration: 'api',
    keyed: false,
    kinds: ['model'],
    label: 'Open Source 3D Assets',
    license: 'CC0',
    notes: 'Keyless JSON registry with direct GLB urls; per-collection licenses filtered to exactly CC0 — see opensource3d.js.',
    qualityTier: 'unreviewed',
    url: 'https://opensource3dassets.com',
  },
  {
    enabled: false,
    goodFor: 'museum-grade scans (fossils, sculpture, artifacts)',
    id: 'smithsonian',
    integration: 'api',
    keyed: false,
    kinds: ['model'],
    label: 'Smithsonian 3D Open Access',
    license: 'CC0',
    notes: 'Keyless 3d-api.si.edu file API with direct browser-ready GLBs; every returned file is published through Smithsonian Open Access — see smithsonian.js.',
    qualityTier: 'unreviewed',
    url: 'https://3d.si.edu',
  },
  {
    enabled: false,
    goodFor: 'huge CC0 subset of community models',
    id: 'sketchfab',
    integration: 'linkout',
    keyed: true,
    kinds: ['model'],
    label: 'Sketchfab',
    license: 'CC0 (filtered search)',
    notes: 'Download API needs per-user OAuth (not a server key), and developer terms require Sketchfab branding + creator-attribution UI in the app — deliberately NOT automated this pass. Browse the CC0 search, download, then import the file below.',
    qualityTier: 'unreviewed',
    restrictions: 'Do not wire a server-key download proxy: their API is OAuth-per-user and the developer terms impose branding/attribution UI requirements.',
    url: 'https://sketchfab.com/search?features=downloadable&licenses=cc0&type=models',
  },
  {
    enabled: false,
    goodFor: 'game-jam-ready 2D/3D/audio packs, consistent style',
    id: 'kenney',
    integration: 'manual',
    keyed: false,
    kinds: ['model', 'texture'],
    label: 'Kenney',
    license: 'CC0',
    notes: 'No public file API (downloads sit behind the site button). Download a pack, then import the zip/glb below.',
    qualityTier: 'unreviewed',
    url: 'https://kenney.nl/assets',
  },
  {
    enabled: false,
    goodFor: 'low-poly animals, characters, environments (also on Poly Pizza)',
    id: 'quaternius',
    integration: 'manual',
    keyed: false,
    kinds: ['model'],
    label: 'Quaternius',
    license: 'CC0',
    notes: 'No file API (packs are drive links). Most of the catalog is searchable through the Poly Pizza source; otherwise download and import below.',
    qualityTier: 'unreviewed',
    url: 'https://quaternius.com',
  },
  {
    enabled: false,
    goodFor: '1250+ clean base meshes (props, anatomy, primitives)',
    id: 'basemesh',
    integration: 'manual',
    keyed: false,
    kinds: ['model'],
    label: 'The Base Mesh',
    license: 'CC0',
    notes: 'No documented API. Download a mesh, then import the file below.',
    qualityTier: 'unreviewed',
    url: 'https://thebasemesh.com',
  },
  {
    enabled: false,
    goodFor: 'stylized/painterly PBR materials',
    id: 'threedtextures',
    integration: 'manual',
    keyed: false,
    kinds: ['texture'],
    label: '3DTextures.me',
    license: 'CC0',
    notes: 'All CC0 and the license explicitly permits redistribution, but downloads are per-page drive links (no API). A curated mirrored set is a future candidate; for now download and import below.',
    qualityTier: 'unreviewed',
    url: 'https://3dtextures.me',
  },
  {
    enabled: false,
    goodFor: 'PBR textures with per-map downloads',
    id: 'texturecan',
    integration: 'manual',
    keyed: false,
    kinds: ['texture'],
    label: 'TextureCan',
    license: 'CC0',
    notes: 'CC0 per their terms; no API. Download, then import below.',
    qualityTier: 'unreviewed',
    url: 'https://www.texturecan.com',
  },
  {
    enabled: false,
    goodFor: 'PBR materials (fabric, wood, wall …)',
    id: 'sharetextures',
    integration: 'linkout',
    keyed: false,
    kinds: ['texture'],
    label: 'ShareTextures',
    license: 'CC0 (files only)',
    notes: 'Files are CC0, but the PLATFORM terms prohibit automated downloads, API access, hotlinking, and embedding downloads in third-party tools. Browse manually only.',
    qualityTier: 'unreviewed',
    restrictions: 'Never automate: their terms prohibit automated downloads, API access, hotlinking, and embedding downloads in third-party tools — do not build an adapter or proxy for this source.',
    url: 'https://www.sharetextures.com',
  },
  {
    enabled: false,
    goodFor: 'openly licensed IMAGES (reference, decals, ui) — not 3D',
    id: 'openverse',
    integration: 'reference',
    keyed: false,
    kinds: [],
    label: 'Openverse',
    license: 'CC0/CC-BY (per-record)',
    notes: 'WordPress-run aggregator with a real keyless API (api.openverse.org) over 800M+ images/audio; out of scope for the 3D browser, listed for future image needs.',
    qualityTier: 'unreviewed',
    url: 'https://openverse.org',
  },
  {
    enabled: false,
    goodFor: 'sound effects — pairs with the soundscape cluster someday',
    id: 'freesound',
    integration: 'reference',
    keyed: true,
    kinds: [],
    label: 'Freesound',
    license: 'CC0/CC-BY (per-record)',
    notes: 'Audio, not 3D. Has a real API, but the free API tier is NON-COMMERCIAL only — a commercial deployment needs their commercial terms.',
    qualityTier: 'unreviewed',
    url: 'https://freesound.org',
  },
].map(Object.freeze));

/** Registry lookup by source id ('polyhaven', 'kaykit', …). */
export function getAssetSource(id) {
  return ASSET_SOURCES.find((source) => source.id === id) ?? null;
}

/**
 * Apply a source's optional curated include list: with `curated` set, only
 * listed ref ids survive (curation-first over volume — see header). Sources
 * without a list pass through untouched.
 */
export function curateAssetRefs(refs, source) {
  const curated = source?.curated;
  if (!Array.isArray(curated) || curated.length === 0) return refs ?? [];
  const keep = new Set(curated);
  return (refs ?? []).filter((ref) => keep.has(ref.id));
}

/**
 * Registry query: by integration level ('api' | 'manual' | 'linkout' |
 * 'reference' | array of those) and/or asset kind. Sources flipped to
 * `enabled: false` are hidden unless `includeDisabled` (moderation surfaces
 * pass true).
 */
export function listAssetSources({ integration = null, kind = null, includeDisabled = false } = {}) {
  const integrations = integration == null
    ? null
    : (Array.isArray(integration) ? integration : [integration]);
  return ASSET_SOURCES.filter((source) => {
    if (source.enabled === false && !includeDisabled) return false;
    if (integrations && !integrations.includes(source.integration)) return false;
    if (kind && !source.kinds.includes(kind)) return false;
    return true;
  });
}
