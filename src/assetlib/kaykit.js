// CC0 asset source: KayKit (kaylousberg.com) — Kay Lousberg's stylized
// low-poly game packs, published as version-frozen GitHub repos under
// KayKit-Game-Assets. Everything is CC0 (each repo bundles LICENSE.txt);
// attribution is optional and we keep it anyway (house style stores
// provenance). Great toon-shader fit: authored low-poly like Poly Pizza,
// but keyless.
//
// Files are raw-downloadable from raw.githubusercontent.com (CORS `*`, no
// rate limit), so models load in the browser with no proxy. LISTING is the
// only rate-limited part: the GitHub REST API allows 60 unauthenticated
// req/h — so the known packs ship as a static index (kaykitStaticIndex.js,
// zero network) and the git-trees API is a fallback for packs without one
// (in-memory cached, clear rate-limit error).
//
// Pack layouts (all under addons/<slug>/):
//   "bits" packs      Assets/gltf/<name>.gltf + <name>.bin + one shared
//                     <pack>_texture.png the glTFs reference by relative uri
//   dungeon           Assets/gltf/<name>.gltf.glb (single-file)
//   character packs   Characters/gltf/<Name>.glb (single-file)
//   medieval-hexagon  Assets/gltf/<theme>/<sub>/… (nested → trees API)

import { KAYKIT_STATIC_INDEX } from './kaykitStaticIndex.js';

export const KAYKIT_GITHUB_ORG = 'KayKit-Game-Assets';
export const KAYKIT_API_URL = 'https://api.github.com';
export const KAYKIT_RAW_URL = 'https://raw.githubusercontent.com';

export const KAYKIT_ATTRIBUTION = Object.freeze({
  license: 'CC0',
  sourceLabel: 'KayKit',
  sourceUrl: 'https://kaylousberg.com',
  // CC0 needs no credit; ship the ready-made line anyway (same idea as
  // Poly Pizza's Attribution field).
  text: 'Assets by Kay Lousberg — kaylousberg.com (attribution optional under CC0)',
});

/** Curated pack index — repo + layout facts per pack. Flip `enabled: false`
 * to pull a whole pack out of listings with no code edit (same convention as
 * public/props/cc0/manifest.json). `bundled` names that manifest's pack key
 * for packs also shipped in this repo under public/props/cc0/<key>/;
 * listing/downloads still use the canonical GitHub urls so recipes stay
 * portable. */
export const KAYKIT_PACKS = Object.freeze([
  { bundled: 'kaykit-city', category: 'city', enabled: true, gltfPath: 'Assets/gltf', id: 'city-builder-bits', name: 'City Builder Bits', repo: 'KayKit-City-Builder-Bits-1.0', slug: 'kaykit_city_builder_bits' },
  { bundled: 'kaykit-furniture', category: 'furniture', enabled: true, gltfPath: 'Assets/gltf', id: 'furniture-bits', name: 'Furniture Bits', repo: 'KayKit-Furniture-Bits-1.0', slug: 'kaykit_furniture_bits' },
  { bundled: null, category: 'restaurant', enabled: true, gltfPath: 'Assets/gltf', id: 'restaurant-bits', name: 'Restaurant Bits', repo: 'KayKit-Restaurant-Bits-1.0', slug: 'kaykit_restaurant_bits' },
  { bundled: null, category: 'dungeon', enabled: true, gltfPath: 'Assets/gltf', id: 'dungeon-remastered', name: 'Dungeon Remastered', repo: 'KayKit-Dungeon-Remastered-1.0', slug: 'kaykit_dungeon_remastered' },
  { bundled: null, category: 'medieval', enabled: true, gltfPath: 'Assets/gltf', id: 'medieval-hexagon', name: 'Medieval Hexagon Pack', repo: 'KayKit-Medieval-Hexagon-Pack-1.0', slug: 'kaykit_medieval_hexagon_pack' },
  { bundled: null, category: 'halloween', enabled: true, gltfPath: 'Assets/gltf', id: 'halloween-bits', name: 'Halloween Bits', repo: 'KayKit-Halloween-Bits-1.0', slug: 'kaykit_halloween_bits' },
  { bundled: null, category: 'space', enabled: true, gltfPath: 'Assets/gltf', id: 'space-base-bits', name: 'Space Base Bits', repo: 'KayKit-Space-Base-Bits-1.0', slug: 'kaykit_space_base_bits' },
  { bundled: null, category: 'prototype', enabled: true, gltfPath: 'Assets/gltf', id: 'prototype-bits', name: 'Prototype Bits', repo: 'KayKit-Prototype-Bits-1.0', slug: 'kaykit_prototype_bits' },
  { bundled: null, category: 'characters', enabled: true, gltfPath: 'Characters/gltf', id: 'character-adventurers', name: 'Adventurers Characters', repo: 'KayKit-Character-Pack-Adventures-1.0', slug: 'kaykit_character_pack_adventures' },
  { bundled: null, category: 'characters', enabled: true, gltfPath: 'Characters/gltf', id: 'character-skeletons', name: 'Skeletons Characters', repo: 'KayKit-Character-Pack-Skeletons-1.0', slug: 'kaykit_character_pack_skeletons' },
].map(Object.freeze));

export function getKayKitPack(packId) {
  return KAYKIT_PACKS.find((pack) => pack.id === packId) ?? null;
}

export function kaykitRepoPageUrl(pack) {
  return `https://github.com/${KAYKIT_GITHUB_ORG}/${pack.repo}`;
}

/** Raw url for one file inside a pack's gltf directory (relative paths from
 * nested packs pass through unencoded-slash intact). */
export function kaykitRawFileUrl(pack, relativePath) {
  const encoded = String(relativePath).split('/').map(encodeURIComponent).join('/');
  return `${KAYKIT_RAW_URL}/${KAYKIT_GITHUB_ORG}/${pack.repo}/main/addons/${pack.slug}/${pack.gltfPath}/${encoded}`;
}

const MODEL_FILE = /\.(gltf|glb)$/i;

function modelBaseName(fileName) {
  // "chair_A_wood.gltf" → "chair_A_wood"; dungeon's "banner_blue.gltf.glb"
  // → "banner_blue"
  return fileName.replace(/\.gltf\.glb$/i, '').replace(MODEL_FILE, '');
}

/**
 * One model file inside a pack → loadable download:
 *   { format: 'gltf'|'glb', url, resources: { '<name>.bin': url, '<tex>.png': url } }
 * Multi-file .gltf models reference their .bin + shared texture by relative
 * uri in the SAME directory, so a plain fetch of the gltf url already works;
 * the explicit `resources` map keeps recipes self-describing (and covers
 * loaders that re-root relative uris), exactly like Poly Haven downloads.
 */
export function resolveKayKitDownload(pack, relativePath, { texture = null } = {}) {
  const url = kaykitRawFileUrl(pack, relativePath);
  if (!relativePath.toLowerCase().endsWith('.gltf')) {
    return { format: 'glb', resources: {}, url };
  }
  const bin = relativePath.replace(/\.gltf$/i, '.bin');
  const directory = relativePath.includes('/') ? `${relativePath.slice(0, relativePath.lastIndexOf('/') + 1)}` : '';
  const resources = { [bin]: kaykitRawFileUrl(pack, bin) };
  if (texture) resources[`${directory}${texture}`] = kaykitRawFileUrl(pack, `${directory}${texture}`);
  return { format: 'gltf', resources, url };
}

/**
 * File list of one pack (relative paths under its gltf directory) → sorted
 * normalized refs (kind is always 'model'; download embedded like
 * Poly Pizza's). The shared texture png is detected, not listed.
 */
export function normalizeKayKitFiles(files, pack) {
  const names = (files ?? []).map(String);
  // .gltf models reference ONE shared png per directory by relative uri
  // (flat packs: <pack>_texture.png at the root; the nested hexagon pack
  // keeps a hexagons_medieval.png copy per subdirectory). Map dir → png;
  // .glb models embed their textures and ignore this.
  const textureByDirectory = new Map();
  for (const name of names) {
    if (!/\.png$/i.test(name)) continue;
    const directory = name.includes('/') ? name.slice(0, name.lastIndexOf('/') + 1) : '';
    if (!textureByDirectory.has(directory)) textureByDirectory.set(directory, name.split('/').pop());
  }
  const refs = [];
  for (const relativePath of names) {
    if (!MODEL_FILE.test(relativePath)) continue;
    const directory = relativePath.includes('/') ? relativePath.slice(0, relativePath.lastIndexOf('/') + 1) : '';
    const texture = textureByDirectory.get(directory) ?? null;
    const base = modelBaseName(relativePath.split('/').pop());
    refs.push({
      attribution: KAYKIT_ATTRIBUTION,
      authors: ['Kay Lousberg'],
      categories: [pack.category],
      download: resolveKayKitDownload(pack, relativePath, { texture }),
      id: `${pack.id}/${base}`,
      kind: 'model',
      name: base.replace(/_/g, ' '),
      pack: pack.id,
      pageUrl: kaykitRepoPageUrl(pack),
      source: 'kaykit',
      tags: [pack.category, ...base.toLowerCase().split(/[_\s]+/).filter(Boolean)],
      // no per-model renders upstream — the pack cover is the honest preview
      thumbnailUrl: `${KAYKIT_RAW_URL}/${KAYKIT_GITHUB_ORG}/${pack.repo}/main/icon.png`,
    });
  }
  return refs.sort((a, b) => a.name.localeCompare(b.name));
}

const packCache = new Map();

/**
 * Relative model/texture file paths of one pack. Static index first (zero
 * network — the "-1.0" repos are version-frozen); otherwise ONE git-trees API
 * call (cached per session) with a clear rate-limit message on 403/429.
 */
export function fetchKayKitPackFiles(pack, { fetchImpl = fetch, headers = {} } = {}) {
  const staticEntry = KAYKIT_STATIC_INDEX[pack.id];
  if (staticEntry) {
    return Promise.resolve(
      staticEntry.texture ? [...staticEntry.models, staticEntry.texture] : [...staticEntry.models],
    );
  }
  if (!packCache.has(pack.id)) {
    const promise = (async () => {
      const response = await fetchImpl(
        `${KAYKIT_API_URL}/repos/${KAYKIT_GITHUB_ORG}/${pack.repo}/git/trees/main?recursive=1`,
        { headers },
      );
      if (response.status === 403 || response.status === 429) {
        throw new Error(`KayKit ${pack.id}: GitHub API rate limit hit (60 req/h unauthenticated) — the static packs still work; retry this one in an hour.`);
      }
      if (!response.ok) throw new Error(`KayKit ${pack.id}: GitHub trees API ${response.status}`);
      const payload = await response.json();
      const prefix = `addons/${pack.slug}/${pack.gltfPath}/`;
      return (payload?.tree ?? [])
        .filter((node) => node.type === 'blob' && node.path.startsWith(prefix))
        .map((node) => node.path.slice(prefix.length));
    })();
    // a failed fetch must not poison the session cache
    promise.catch(() => packCache.delete(pack.id));
    packCache.set(pack.id, promise);
  }
  return packCache.get(pack.id);
}

/**
 * Normalized refs across packs (packs flipped to `enabled: false` never
 * list). Static packs always work; API-listed packs that fail (rate limit,
 * offline) are skipped so one bad pack never blanks the browser — it throws
 * only when EVERY pack failed.
 */
export async function fetchKayKitIndex({ packs = KAYKIT_PACKS, fetchImpl = fetch, headers = {} } = {}) {
  const enabledPacks = packs.filter((pack) => pack.enabled !== false);
  const settled = await Promise.allSettled(
    enabledPacks.map(async (pack) => normalizeKayKitFiles(await fetchKayKitPackFiles(pack, { fetchImpl, headers }), pack)),
  );
  const refs = settled.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
  if (refs.length === 0 && settled[0]?.status === 'rejected') throw settled[0].reason;
  return refs;
}
