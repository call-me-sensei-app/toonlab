// assetlib verification — pure-Node, OFFLINE by design: fixtures mirror real
// API payloads captured 2026-07-14 (Poly Haven / ambientCG / Poly Pizza) and
// 2026-07-16 (KayKit GitHub listings, Open Source 3D Assets registry JSON)
// and 2026-07-19 (Smithsonian 3D file search),
// shapes asserted against the live APIs — so normalization, download
// resolution, donation-vault filtering, the source registry, and the
// catalog-entry contract are checked without touching the network.
// Run: node scripts/verify-assetlib.mjs

import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';

import {
  ASSETLIB_USER_AGENT,
  collectAssetCategories,
  filterAssetRefs,
  pickResolution,
  slugifyAssetId,
} from '../src/assetlib/assetRef.js';
import {
  POLYHAVEN_BROWSER_API_URL,
  fetchPolyhavenFiles,
  fetchPolyhavenIndex,
  normalizePolyhavenIndex,
  polyhavenThumbnailUrl,
  resolvePolyhavenModelDownload,
  resolvePolyhavenTextureDownload,
} from '../src/assetlib/polyhaven.js';
import {
  normalizeAmbientcgAssets,
  resolveAmbientcgDownload,
} from '../src/assetlib/ambientcg.js';
import { importedAssetCatalogEntry } from '../src/assetlib/importedEntry.js';
import {
  GALLERY_MATERIAL_FAMILY,
  resolveGalleryMaterialFamily,
} from '../src/assetlib/galleryMaterialFamily.js';
import {
  normalizePolyPizzaModel,
  rewritePolyPizzaDownloadUrl,
  searchPolyPizza,
} from '../src/assetlib/polypizza.js';
import {
  KAYKIT_PACKS,
  fetchKayKitIndex,
  fetchKayKitPackFiles,
  getKayKitPack,
  normalizeKayKitFiles,
  resolveKayKitDownload,
} from '../src/assetlib/kaykit.js';
import { KAYKIT_STATIC_INDEX } from '../src/assetlib/kaykitStaticIndex.js';
import {
  fetchOs3dIndex,
  normalizeOs3dAssets,
  normalizeOs3dProjects,
} from '../src/assetlib/opensource3d.js';
import {
  SMITHSONIAN_3D_API_URL,
  fetchSmithsonianAsset,
  fetchSmithsonianFileRows,
  isSmithsonianGalleryReady,
  normalizeSmithsonianModels,
  normalizeSmithsonianThumbnails,
} from '../src/assetlib/smithsonian.js';
import {
  fetchPlateauBuildingIndex,
  normalizePlateauBuildingDatasets,
} from '../src/assetlib/plateau.js';
import {
  findPlateauLandmark,
  searchPlateauLandmarks,
} from '../src/assetlib/plateauLandmarks.js';
import {
  ASSET_SOURCES,
  ASSET_SOURCE_INTEGRATIONS,
  ASSET_SOURCE_QUALITY_TIERS,
  curateAssetRefs,
  getAssetSource,
  listAssetSources,
} from '../src/assetlib/sources.js';
import { readZipEntries } from '../src/assetlib/zip.js';
import { validateCatalogEntry } from '../src/catalog/manifest.js';
import { createCatalog } from '../src/catalog/index.js';

let failures = 0;
function check(label, condition, detail = '') {
  if (condition) console.log(`ok   ${label}`);
  else {
    failures += 1;
    console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

// --- fixtures (shape-faithful subsets of live payloads) ----------------------------

const NOW = 1_752_000_000; // fixed epoch seconds — determinism discipline

const POLYHAVEN_INDEX = {
  ArmChair_01: {
    authors: { 'Kirill Sannikov': 'All' },
    categories: ['furniture', 'seating'],
    date_published: NOW - 1000,
    name: 'Arm Chair 01',
    polycount: 5626,
    tags: ['gothic', 'chair', 'Wood'],
    type: 2,
  },
  vault_asset: {
    authors: {},
    categories: ['props'],
    date_published: NOW + 99_999, // donation vault / early access — must drop
    name: 'Vault Asset',
    tags: [],
    type: 2,
  },
  wooden_crate_01: {
    authors: { 'James Ray Cock': 'All' },
    categories: ['props', 'storage'],
    date_published: NOW - 5000,
    name: 'Wooden Crate 01',
    polycount: 2000,
    tags: ['crate', 'wood'],
    type: 2,
  },
};

const POLYHAVEN_MODEL_FILES = {
  blend: {},
  gltf: {
    '1k': {
      gltf: {
        include: {
          'textures/wooden_crate_01_diff_1k.jpg': { size: 711_292, url: 'https://dl.polyhaven.org/m/diff_1k.jpg' },
          'wooden_crate_01.bin': { size: 189_408, url: 'https://dl.polyhaven.org/m/model.bin' },
        },
        size: 5612,
        url: 'https://dl.polyhaven.org/m/model_1k.gltf',
      },
    },
    '4k': {
      gltf: { include: {}, size: 6000, url: 'https://dl.polyhaven.org/m/model_4k.gltf' },
    },
  },
};

const POLYHAVEN_TEXTURE_FILES = {
  AO: { '1k': { jpg: { size: 100, url: 'https://dl.polyhaven.org/t/ao_1k.jpg' } } },
  Diffuse: {
    '1k': {
      jpg: { size: 694_500, url: 'https://dl.polyhaven.org/t/diff_1k.jpg' },
      png: { size: 2_208_159, url: 'https://dl.polyhaven.org/t/diff_1k.png' },
    },
    '2k': { jpg: { size: 900_000, url: 'https://dl.polyhaven.org/t/diff_2k.jpg' } },
  },
  Rough: { '1k': { png: { size: 200, url: 'https://dl.polyhaven.org/t/rough_1k.png' } } },
  arm: { '1k': { jpg: { size: 776_699, url: 'https://dl.polyhaven.org/t/arm_1k.jpg' } } },
  nor_gl: { '1k': { jpg: { size: 594_076, url: 'https://dl.polyhaven.org/t/nor_1k.jpg' } } },
};

const AMBIENTCG_PAYLOAD = {
  foundAssets: [{
    assetId: 'Bricks097',
    dataType: 'Material',
    displayCategory: 'Bricks',
    displayName: 'Bricks 097',
    downloadFolders: {
      default: {
        downloadFiletypeCategories: {
          zip: {
            downloads: [
              { attribute: '1K-JPG', downloadLink: 'https://ambientcg.com/get?file=Bricks097_1K-JPG.zip', fileName: 'Bricks097_1K-JPG.zip', filetype: 'zip', size: 5_172_084 },
              { attribute: '2K-JPG', downloadLink: 'https://ambientcg.com/get?file=Bricks097_2K-JPG.zip', fileName: 'Bricks097_2K-JPG.zip', filetype: 'zip', size: 15_930_202 },
            ],
          },
        },
      },
    },
    previewImage: { '256-PNG': 'https://acg-media.struffelproductions.com/Bricks097_256.png' },
    shortLink: 'https://ambientcg.com/a/Bricks097',
    tags: ['brick', 'red'],
  }],
};

const PLATEAU_PAYLOAD = {
  datasets: [
    { id: '13101_bldg_lod3_no_texture', format: '3D Tiles', year: 2025 },
    { id: '01101_bldg_lod2', format: '3D Tiles', year: 2020 },
  ],
  latest_citygml: [{
    city: '千代田区',
    city_code: '13101',
    feature_types: ['bldg', 'tran'],
    file_size: 9000,
    id: '13101',
    url: 'https://api.plateauview.mlit.go.jp/datacatalog/citygml/13101-latest/citygml.zip',
  }],
  latest_datasets: [
    {
      city: '千代田区', city_code: '13101', file_size: 1000, format: '3D Tiles',
      format_version: '1.0', id: '13101_bldg_lod2', lod: '2',
      pref: '東京都', pref_code: '13', texture: true, type_en: 'bldg',
      url: 'https://api.plateauview.mlit.go.jp/datacatalog/3dtiles/13101-bldg-lod2-texture-latest/tileset.json',
      ward: null, ward_code: null,
    },
    {
      city: '千代田区', city_code: '13101', file_size: 2000, format: '3D Tiles',
      format_version: '1.0', id: '13101_bldg_lod3_no_texture', lod: '3',
      pref: '東京都', pref_code: '13', texture: false, type_en: 'bldg',
      url: 'https://api.plateauview.mlit.go.jp/datacatalog/3dtiles/13101-bldg-lod3-notexture-latest/tileset.json',
      ward: null, ward_code: null,
    },
    {
      city: '札幌市', city_code: '01100', file_size: 3000, format: '3D Tiles',
      format_version: '1.0', id: '01101_bldg_lod2', lod: '2',
      pref: '北海道', pref_code: '01', texture: true, type_en: 'bldg',
      url: 'https://api.plateauview.mlit.go.jp/datacatalog/3dtiles/01101-bldg-lod2-texture-latest/tileset.json',
      ward: '中央区', ward_code: '01101',
    },
  ],
};

// --- normalization -----------------------------------------------------------------

const refs = normalizePolyhavenIndex(POLYHAVEN_INDEX, { now: NOW, type: 'models' });
check('polyhaven: vault (future-dated) assets are dropped',
  refs.length === 2 && !refs.some((ref) => ref.id === 'vault_asset'));
check('polyhaven: refs normalized (kind, lowercase tags, attribution, authors)', (() => {
  const chair = refs.find((ref) => ref.id === 'ArmChair_01');
  return chair.kind === 'model'
    && chair.tags.includes('wood')
    && chair.attribution.license === 'CC0'
    && chair.authors[0] === 'Kirill Sannikov'
    && chair.pageUrl.includes('polyhaven.com/a/ArmChair_01');
})());
check('polyhaven: thumbnail constructed when absent',
  refs.every((ref) => ref.thumbnailUrl === polyhavenThumbnailUrl(ref.id)));
check('polyhaven: sorted by name', refs[0].name <= refs[1].name);

check('filterAssetRefs: text + category + kind', (() => {
  const wood = filterAssetRefs(refs, { text: 'wood' });
  const props = filterAssetRefs(refs, { category: 'props' });
  const none = filterAssetRefs(refs, { kind: 'texture' });
  return wood.length === 2 && props.length === 1 && none.length === 0;
})());
check('collectAssetCategories: most-used first', collectAssetCategories(refs)[0] !== undefined
  && collectAssetCategories(refs).length === 4);
check('slugifyAssetId: catalog-safe', slugifyAssetId('ArmChair_01') === 'armchair-01');

// --- download resolution -----------------------------------------------------------

check('pickResolution: exact, nearest, empty',
  pickResolution({ '1k': 1, '4k': 1 }, '1k') === '1k'
  && pickResolution({ '1k': 1, '4k': 1 }, '2k') === '1k'
  && pickResolution({ '4k': 1, '8k': 1 }, '1k') === '4k'
  && pickResolution({}, '1k') === null);

const modelDownload = resolvePolyhavenModelDownload(POLYHAVEN_MODEL_FILES, { resolution: '1k' });
check('polyhaven model download: url + resources + size sum',
  modelDownload.url.endsWith('model_1k.gltf')
  && Object.keys(modelDownload.resources).length === 2
  && modelDownload.sizeBytes === 5612 + 711_292 + 189_408);
check('polyhaven model download: nearest resolution fallback',
  resolvePolyhavenModelDownload(POLYHAVEN_MODEL_FILES, { resolution: '8k' }).resolution === '4k');

const textureSet = resolvePolyhavenTextureDownload(POLYHAVEN_TEXTURE_FILES, { resolution: '1k' });
check('polyhaven texture set: diffuse/normal/arm resolved + png fallback',
  textureSet.maps.diffuse.url.endsWith('diff_1k.jpg')
  && textureSet.maps.normal.url.endsWith('nor_1k.jpg')
  && textureSet.maps.arm.url.endsWith('arm_1k.jpg')
  && textureSet.maps.roughness.url.endsWith('rough_1k.png'));
check('polyhaven texture set: throws without diffuse', (() => {
  try {
    resolvePolyhavenTextureDownload({ nor_gl: POLYHAVEN_TEXTURE_FILES.nor_gl });
    return false;
  } catch {
    return true;
  }
})());

// --- ambientCG ---------------------------------------------------------------------

const acgRefs = normalizeAmbientcgAssets(AMBIENTCG_PAYLOAD);
check('ambientcg: normalized ref with downloads',
  acgRefs.length === 1
  && acgRefs[0].kind === 'texture'
  && acgRefs[0].downloads.length === 2
  && acgRefs[0].thumbnailUrl.includes('256'));
check('ambientcg: exact attribute download',
  resolveAmbientcgDownload(acgRefs[0], { format: 'JPG', resolution: '2K' }).fileName === 'Bricks097_2K-JPG.zip');
check('ambientcg: smallest-zip fallback',
  resolveAmbientcgDownload(acgRefs[0], { format: 'EXR', resolution: '16K' }).fileName === 'Bricks097_1K-JPG.zip');

// --- Project PLATEAU ---------------------------------------------------------------

const plateauRefs = normalizePlateauBuildingDatasets(PLATEAU_PAYLOAD);
check('plateau: one highest-LOD building dataset per municipality/ward',
  plateauRefs.length === 2
  && plateauRefs.find((ref) => ref.id === '13101-bldg')?.metadata.lod === 3
  && plateauRefs.find((ref) => ref.id === '01101-bldg')?.metadata.lod === 2);
check('plateau: stable latest 3D Tiles + CityGML links and data year survive',
  plateauRefs.find((ref) => ref.id === '13101-bldg')?.download.url.includes('-latest/tileset.json')
  && plateauRefs.find((ref) => ref.id === '13101-bldg')?.citygml.url.includes('citygml.zip')
  && plateauRefs.find((ref) => ref.id === '13101-bldg')?.metadata.dataYear === 2025);
check('plateau: open-data license requires attribution and is not mislabeled CC0',
  plateauRefs.every((ref) => ref.attribution.requiresAttribution === true
    && ref.attribution.license.includes('PDL 1.0')
    && ref.attribution.text.startsWith('出典：国土交通省 Project PLATEAU')));

let plateauRequest = null;
const fetchedPlateau = await fetchPlateauBuildingIndex({
  apiUrl: 'https://plateau-proxy.example/datacatalog/plateau-datasets',
  fetchImpl: async (url, options) => {
    plateauRequest = { options, url };
    return { json: async () => PLATEAU_PAYLOAD, ok: true };
  },
});
check('plateau: live client identifies Node requests and uses the catalog payload',
  fetchedPlateau.length === 2
  && plateauRequest.url.includes('plateau-datasets')
  && plateauRequest.options.headers.get('user-agent') === ASSETLIB_USER_AGENT);

const tokyoTower = findPlateauLandmark('landmark-tokyo-tower');
const tokyoTowerGlb = readFileSync(resolve(
  fileURLToPath(import.meta.url),
  '../../public/plateau-landmarks/tokyo-tower.glb',
));
check('plateau landmarks: Tokyo Tower is searchable by English, Japanese, and building id',
  searchPlateauLandmarks('Tokyo Tower')[0]?.id === 'landmark-tokyo-tower'
  && searchPlateauLandmarks('東京タワー')[0]?.id === 'landmark-tokyo-tower'
  && searchPlateauLandmarks('13103-bldg-6915')[0]?.id === 'landmark-tokyo-tower');
check('plateau landmarks: metadata identifies one processed PLATEAU feature',
  tokyoTower.metadata.payloadType === 'glb'
  && tokyoTower.metadata.processed === true
  && tokyoTower.metadata.sourceGmlId === 'bldg_7aff4a51-be8b-405b-abe4-ac489697cbc8'
  && tokyoTower.metadata.measuredHeight === 332.1
  && tokyoTower.metadata.triangleCount === 460);
check('plateau landmarks: bundled artifact is a nonempty GLB matching the manifest',
  tokyoTowerGlb.subarray(0, 4).toString('utf8') === 'glTF'
  && tokyoTowerGlb.byteLength === tokyoTower.download.sizeBytes);

// --- Poly Pizza ----------------------------------------------------------------------

const POLYPIZZA_PAYLOAD = {
  results: [
    {
      Attribution: 'Pine Tree by Quaternius',
      Category: 'Nature',
      Creator: { Username: 'Quaternius' },
      Download: 'https://static.poly.pizza/abc123.glb',
      ID: 'abc123',
      Licence: 'CC0',
      Tags: ['Tree', 'Forest'],
      Thumbnail: 'https://static.poly.pizza/thumbs/abc123.webp',
      Title: 'Pine Tree',
      'Tri Count': 512,
    },
    {
      Attribution: 'Old Car by Somebody [CC-BY] via Poly Pizza',
      Creator: { Username: 'Somebody' },
      Download: 'https://static.poly.pizza/def456.glb',
      ID: 'def456',
      Licence: 'CC-BY',
      Title: 'Old Car',
    },
  ],
  total: 2,
};

const ppRef = normalizePolyPizzaModel(POLYPIZZA_PAYLOAD.results[0]);
check('polypizza: normalized ref (kind, license, attribution text, download)',
  ppRef.kind === 'model'
  && ppRef.attribution.license === 'CC0'
  && ppRef.attribution.text === 'Pine Tree by Quaternius'
  && ppRef.download.url.endsWith('abc123.glb')
  && ppRef.polycount === 512
  && ppRef.tags.includes('tree'));
check('polypizza: proxy url rewrite',
  rewritePolyPizzaDownloadUrl('https://static.poly.pizza/abc123.glb') === '/api/polypizza-static/abc123.glb');

const ppStub = async () => ({ json: async () => POLYPIZZA_PAYLOAD, ok: true, status: 200 });
check('polypizza: cc0Only default drops CC-BY',
  (await searchPolyPizza({ fetchImpl: ppStub, query: 'tree' })).length === 1
  && (await searchPolyPizza({ cc0Only: false, fetchImpl: ppStub, query: 'tree' })).length === 2);
check('polypizza: 401 explains the missing key', await searchPolyPizza({
  fetchImpl: async () => ({ ok: false, status: 401 }),
  query: 'tree',
}).then(() => false, (error) => error.message.includes('poly.pizza/settings/api')));

const ppEntry = importedAssetCatalogEntry(ppRef, { download: ppRef.download });
check('polypizza: imported entry validates', validateCatalogEntry(ppEntry).ok
  && ppEntry.id === 'imported/polypizza/abc123');

// --- source registry -----------------------------------------------------------------

check('sources: ids unique + shapes complete', (() => {
  const ids = new Set(ASSET_SOURCES.map((source) => source.id));
  return ids.size === ASSET_SOURCES.length && ASSET_SOURCES.every((source) => source.id
    && source.label
    && source.url?.startsWith('https://')
    && source.license
    && typeof source.enabled === 'boolean'
    && typeof source.keyed === 'boolean'
    && Array.isArray(source.kinds)
    && ASSET_SOURCE_INTEGRATIONS.includes(source.integration)
    && ASSET_SOURCE_QUALITY_TIERS.includes(source.qualityTier)
    && source.notes
    && source.goodFor);
})());
check('sources: curation policy — reviewed sources ship enabled',
  ASSET_SOURCES.filter((source) => source.enabled).map((source) => source.id).sort().join(',')
    === 'ambientcg,plateau,polyhaven');
check('sources: enabled ⇒ reviewed tier; unreviewed ⇒ disabled', ASSET_SOURCES.every((source) => (source.enabled
  ? source.qualityTier !== 'unreviewed'
  : source.qualityTier === 'unreviewed')));
check('sources: keyed api sources say where the key comes from',
  getAssetSource('polypizza').key.env === 'TOONLAB_POLYPIZZA_KEY'
  && getAssetSource('polypizza').key.url.includes('poly.pizza'));
check('sources: sketchfab is a link-out that explains why (OAuth + branding terms)', (() => {
  const sketchfab = getAssetSource('sketchfab');
  return sketchfab.integration === 'linkout'
    && sketchfab.url.includes('licenses=cc0')
    && /OAuth/i.test(sketchfab.restrictions)
    && /branding/i.test(sketchfab.restrictions);
})());
check('sources: sharetextures carries the never-automate warning', (() => {
  const sharetextures = getAssetSource('sharetextures');
  return sharetextures.integration === 'linkout' && /automated downloads/i.test(sharetextures.restrictions);
})());
check('sources: freesound notes the non-commercial API tier',
  /non-commercial/i.test(getAssetSource('freesound').notes));
check('sources: Smithsonian uses the dedicated keyless 3D API', (() => {
  const smithsonian = getAssetSource('smithsonian');
  return smithsonian.integration === 'api'
    && smithsonian.keyed === false
    && /3d-api\.si\.edu/.test(smithsonian.notes);
})());
check('sources: PLATEAU is an enabled keyless model API with attribution license', (() => {
  const plateau = getAssetSource('plateau');
  return plateau.enabled
    && plateau.integration === 'api'
    && plateau.kinds.includes('model')
    && plateau.license.includes('PDL 1.0');
})());
check('listAssetSources: hides disabled by default, includeDisabled shows all, filters work',
  listAssetSources().every((source) => source.enabled)
  && listAssetSources({ includeDisabled: true }).length === ASSET_SOURCES.length
  && listAssetSources({ includeDisabled: true, integration: 'api' }).every((source) => source.integration === 'api')
  && listAssetSources({ includeDisabled: true, integration: ['manual', 'linkout'] }).length > 3
  && listAssetSources({ kind: 'texture' }).some((source) => source.id === 'ambientcg'));
check('filterAssetRefs: per-asset disabled flag respected', (() => {
  const flagged = [{ ...refs[0], disabled: true }, refs[1]];
  return filterAssetRefs(flagged).length === 1
    && filterAssetRefs(flagged, { includeDisabled: true }).length === 2;
})());
check('curateAssetRefs: include list keeps only the keepers, no list passes through',
  curateAssetRefs(refs, { curated: [refs[0].id] }).length === 1
  && curateAssetRefs(refs, { curated: null }).length === refs.length
  && curateAssetRefs(refs, getAssetSource('polyhaven')).length === refs.length);

// --- KayKit --------------------------------------------------------------------------

const furniturePack = getKayKitPack('furniture-bits');
const furnitureFiles = await fetchKayKitPackFiles(furniturePack, {
  fetchImpl: () => { throw new Error('static packs must not fetch'); },
});
check('kaykit: static pack lists without network', furnitureFiles.includes('armchair_pillows.gltf')
  && furnitureFiles.includes('furniturebits_texture.png'));

// the static index must cover every file we bundle at public/props/cc0/
const repoRoot = resolve(fileURLToPath(import.meta.url), '../..');
check('kaykit: static index covers the bundled packs', ['kaykit-city', 'kaykit-furniture'].every((dir) => {
  const pack = KAYKIT_PACKS.find((candidate) => candidate.bundled === dir);
  const staticEntry = KAYKIT_STATIC_INDEX[pack.id];
  return readdirSync(resolve(repoRoot, 'public/props/cc0', dir))
    .filter((name) => /\.(gltf|png)$/i.test(name))
    .every((name) => staticEntry.models.includes(name) || staticEntry.texture === name);
}));

const kkRefs = normalizeKayKitFiles(furnitureFiles, furniturePack);
const armchair = kkRefs.find((ref) => ref.id === 'furniture-bits/armchair_pillows');
check('kaykit: refs normalized (kind, category, attribution, provenance)', armchair
  && armchair.kind === 'model'
  && armchair.source === 'kaykit'
  && armchair.categories.includes('furniture')
  && armchair.attribution.license === 'CC0'
  && armchair.attribution.text.includes('kaylousberg.com')
  && armchair.authors.includes('Kay Lousberg')
  && armchair.pageUrl.includes('KayKit-Furniture-Bits-1.0'));
check('kaykit: gltf download resolves raw urls for gltf + bin + shared texture',
  armchair.download.format === 'gltf'
  && armchair.download.url === 'https://raw.githubusercontent.com/KayKit-Game-Assets/KayKit-Furniture-Bits-1.0/main/addons/kaykit_furniture_bits/Assets/gltf/armchair_pillows.gltf'
  && armchair.download.resources['armchair_pillows.bin'].endsWith('/armchair_pillows.bin')
  && armchair.download.resources['furniturebits_texture.png'].endsWith('/furniturebits_texture.png'));
const dungeonPack = getKayKitPack('dungeon-remastered');
const dungeonRefs = normalizeKayKitFiles(
  await fetchKayKitPackFiles(dungeonPack, { fetchImpl: () => { throw new Error('static packs must not fetch'); } }),
  dungeonPack,
);
check('kaykit: single-file ".gltf.glb" packs resolve as glb without resources', (() => {
  const banner = dungeonRefs.find((ref) => ref.id === 'dungeon-remastered/banner_blue');
  return banner
    && banner.download.format === 'glb'
    && banner.download.url.endsWith('/banner_blue.gltf.glb')
    && Object.keys(banner.download.resources).length === 0;
})());

check('kaykit: nested paths keep their directory in urls and resources', (() => {
  const download = resolveKayKitDownload(getKayKitPack('medieval-hexagon'), 'tiles/base/hex_grass.gltf', { texture: 'hexagons_medieval.png' });
  return download.url.endsWith('/Assets/gltf/tiles/base/hex_grass.gltf')
    && download.resources['tiles/base/hex_grass.bin'].endsWith('/tiles/base/hex_grass.bin')
    && download.resources['tiles/base/hexagons_medieval.png'].endsWith('/tiles/base/hexagons_medieval.png');
})());

const KAYKIT_TREES_PAYLOAD = {
  tree: [
    { path: 'addons/kaykit_test_pack/Assets/gltf/tiles/hex_grass.gltf', type: 'blob' },
    { path: 'addons/kaykit_test_pack/Assets/gltf/tiles/hex_grass.bin', type: 'blob' },
    { path: 'addons/kaykit_test_pack/Assets/gltf/tiles', type: 'tree' },
    { path: 'README.md', type: 'blob' },
  ],
};
const testPack = { bundled: null, category: 'test', enabled: true, gltfPath: 'Assets/gltf', id: 'test-pack', name: 'Test', repo: 'KayKit-Test-1.0', slug: 'kaykit_test_pack' };
let kkCalls = 0;
const kkStub = async () => { kkCalls += 1; return { json: async () => KAYKIT_TREES_PAYLOAD, ok: true, status: 200 }; };
const treeFiles = await fetchKayKitPackFiles(testPack, { fetchImpl: kkStub });
await fetchKayKitPackFiles(testPack, { fetchImpl: kkStub });
check('kaykit: trees API path filters blobs under the pack root + caches per session',
  kkCalls === 1
  && treeFiles.length === 2
  && treeFiles[0] === 'tiles/hex_grass.gltf');
check('kaykit: rate-limit 403 explains the 60 req/h limit', await fetchKayKitPackFiles(
  { ...testPack, id: 'test-pack-limited', repo: 'KayKit-Test-2.0' },
  { fetchImpl: async () => ({ ok: false, status: 403 }) },
).then(() => false, (error) => error.message.includes('60 req/h')));
check('kaykit: index skips failing packs and drops enabled:false packs', (await fetchKayKitIndex({
  fetchImpl: async () => ({ ok: false, status: 403 }),
  packs: [furniturePack, { ...testPack, enabled: false, id: 'test-pack-off' }],
})).every((ref) => ref.pack === 'furniture-bits'));

const kkEntry = importedAssetCatalogEntry(armchair, { download: armchair.download });
check('kaykit: imported entry validates with provenance', validateCatalogEntry(kkEntry).ok
  && kkEntry.id === 'imported/kaykit/furniture-bits-armchair-pillows'
  && kkEntry.recipe.attribution.sourceLabel === 'KayKit');

// --- Open Source 3D Assets -----------------------------------------------------------

const OS3D_PROJECTS = [
  { asset_data_file: 'assets/pm-momuspark.json', creator_id: 'Polygonal Mind', description: 'Park assets', github_url: 'https://github.com/ToxSam/cc0-models-Polygonal-Mind/tree/main/projects/MomusPark', id: 'pm-momuspark', is_public: true, license: 'CC0', name: 'MomusPark' },
  { asset_data_file: 'assets/other.json', id: 'other-ccby', is_public: true, license: 'CC-BY', name: 'Other' },
  { asset_data_file: 'assets/hidden.json', id: 'hidden', is_public: false, license: 'CC0', name: 'Hidden' },
];
const OS3D_ASSETS = [
  {
    format: 'GLB',
    id: 'momuspark-001',
    is_draft: false,
    is_public: true,
    metadata: { attributes: [{ trait_type: 'Type', value: 'Bench' }], file_size: 878104 },
    model_file_url: 'https://raw.githubusercontent.com/ToxSam/cc0-models-Polygonal-Mind/main/projects/MomusPark/Bench_01_Art.glb',
    name: 'Bench_01_Art',
    thumbnail_url: 'https://raw.githubusercontent.com/ToxSam/cc0-models-Polygonal-Mind/main/projects/MomusPark/Bench_01_Art_thumbnail.png',
  },
  { format: 'GLB', id: 'momuspark-002', is_draft: true, model_file_url: 'https://x/draft.glb', name: 'Draft' },
  { format: 'FBX', id: 'momuspark-003', model_file_url: 'https://x/mesh.fbx', name: 'NotGltf' },
];

const os3dProjects = normalizeOs3dProjects(OS3D_PROJECTS);
check('opensource3d: only public CC0 collections survive (exact match, no CC-BY)',
  os3dProjects.length === 1 && os3dProjects[0].id === 'pm-momuspark');
const os3dRefs = normalizeOs3dAssets(OS3D_ASSETS, os3dProjects[0]);
check('opensource3d: refs normalized; drafts and non-glTF formats dropped',
  os3dRefs.length === 1
  && os3dRefs[0].kind === 'model'
  && os3dRefs[0].source === 'opensource3d'
  && os3dRefs[0].attribution.license === 'CC0'
  && os3dRefs[0].authors[0] === 'Polygonal Mind'
  && os3dRefs[0].download.url.endsWith('Bench_01_Art.glb')
  && os3dRefs[0].download.format === 'glb'
  && os3dRefs[0].download.sizeBytes === 878104
  && os3dRefs[0].tags.includes('bench')
  && os3dRefs[0].thumbnailUrl.endsWith('_thumbnail.png'));

let os3dCalls = 0;
const os3dStub = async (url) => {
  os3dCalls += 1;
  return {
    json: async () => (url.endsWith('projects.json') ? OS3D_PROJECTS : OS3D_ASSETS),
    ok: true,
    status: 200,
  };
};
const os3dIndex = await fetchOs3dIndex({ fetchImpl: os3dStub });
await fetchOs3dIndex({ fetchImpl: os3dStub });
check('opensource3d: index fetches projects + CC0 collections once, cached',
  os3dCalls === 2 && os3dIndex.length === 1);
const os3dEntry = importedAssetCatalogEntry(os3dRefs[0], { download: os3dRefs[0].download });
check('opensource3d: imported entry validates with provenance', validateCatalogEntry(os3dEntry).ok
  && os3dEntry.id === 'imported/opensource3d/momuspark-001'
  && os3dEntry.recipe.attribution.sourceLabel === 'Open Source 3D Assets');

// --- Smithsonian 3D Open Access -----------------------------------------------------

const SMITHSONIAN_PACKAGE_ID = 'b0bf6d44-af22-40dc-bd85-7d66255be4a7';
const SMITHSONIAN_THUMB_ROWS = [{
  title: 'Blue Crab',
  content: {
    file_type: 'jpg',
    model_url: `3d_package:${SMITHSONIAN_PACKAGE_ID}`,
    quality: 'Thumb',
    uri: `https://3d-api.si.edu/content/document/3d_package:${SMITHSONIAN_PACKAGE_ID}/scene-image-thumb.jpg`,
    usage: 'Image2D',
  },
}];
const SMITHSONIAN_MODEL_ROWS = [
  {
    title: 'Blue Crab',
    content: {
      draco_compressed: true,
      file_size: 123456,
      file_type: 'glb',
      model_type: 'glb',
      model_url: `3d_package:${SMITHSONIAN_PACKAGE_ID}`,
      owning_unit: 'NMNHINV',
      quality: 'Low',
      uri: `https://3d-api.si.edu/content/document/3d_package:${SMITHSONIAN_PACKAGE_ID}/model-low.glb`,
      usage: 'Web3D',
    },
  },
  {
    title: 'High model is not browser index content',
    content: {
      file_type: 'glb',
      model_type: 'glb',
      model_url: '3d_package:high-model',
      quality: 'High',
      uri: 'https://3d-api.si.edu/content/model-high.glb',
      usage: 'Web3D',
    },
  },
];

const smithsonianThumbnails = normalizeSmithsonianThumbnails(SMITHSONIAN_THUMB_ROWS);
const smithsonianRefs = normalizeSmithsonianModels(SMITHSONIAN_MODEL_ROWS, smithsonianThumbnails);
check('smithsonian: only low Web3D GLBs survive and thumbnails join by package',
  smithsonianRefs.length === 1
  && smithsonianRefs[0].id === SMITHSONIAN_PACKAGE_ID
  && smithsonianRefs[0].kind === 'model'
  && smithsonianRefs[0].source === 'smithsonian'
  && smithsonianRefs[0].attribution.license === 'CC0'
  && smithsonianRefs[0].download.format === 'glb'
  && smithsonianRefs[0].download.sizeBytes === 123456
  && smithsonianRefs[0].thumbnailUrl.endsWith('scene-image-thumb.jpg')
  && smithsonianRefs[0].pageUrl.includes('blue-crab%3A'));
check('smithsonian: untrusted file hosts are rejected', normalizeSmithsonianModels([{
  title: 'Bad host',
  content: {
    file_type: 'glb',
    model_type: 'glb',
    model_url: '3d_package:bad-host',
    quality: 'Low',
    uri: 'https://example.com/model.glb',
    usage: 'Web3D',
  },
}]).length === 0);
check('smithsonian: gallery drops thumbnail-less and UUID-title file rows',
  isSmithsonianGalleryReady(smithsonianRefs[0])
  && !isSmithsonianGalleryReady({ ...smithsonianRefs[0], thumbnailUrl: null })
  && !isSmithsonianGalleryReady({ ...smithsonianRefs[0], name: SMITHSONIAN_PACKAGE_ID }));

let smithsonianPageCalls = 0;
let smithsonianRequest = null;
const smithsonianPaged = await fetchSmithsonianFileRows({
  apiUrl: 'https://smithsonian-proxy.example/api/v1.0',
  fileType: 'glb',
  pageSize: 1,
  quality: 'Low',
  fetchImpl: async (url, options) => {
    smithsonianPageCalls += 1;
    smithsonianRequest = { options, url };
    const start = Number(new URL(url).searchParams.get('start'));
    return {
      json: async () => ({ rowCount: 2, rows: [SMITHSONIAN_MODEL_ROWS[start] ?? SMITHSONIAN_MODEL_ROWS[0]] }),
      ok: true,
      status: 200,
    };
  },
});
check('smithsonian: file search paginates and identifies Node requests',
  smithsonianPageCalls === 2
  && smithsonianPaged.length === 2
  && smithsonianRequest.options.headers.get('user-agent') === ASSETLIB_USER_AGENT
  && smithsonianRequest.url.includes('start=1'));
let smithsonianAssetCalls = 0;
const smithsonianAsset = await fetchSmithsonianAsset(SMITHSONIAN_PACKAGE_ID, {
  apiUrl: 'https://smithsonian-detail.example/api/v1.0',
  fetchImpl: async (url) => {
    smithsonianAssetCalls += 1;
    const isThumb = new URL(url).searchParams.get('file_type') === 'jpg';
    return {
      json: async () => ({ rowCount: 1, rows: isThumb ? SMITHSONIAN_THUMB_ROWS : [SMITHSONIAN_MODEL_ROWS[0]] }),
      ok: true,
      status: 200,
    };
  },
});
check('smithsonian: detail lookup joins one model and thumbnail by model_url',
  smithsonianAssetCalls === 2
  && smithsonianAsset?.id === SMITHSONIAN_PACKAGE_ID
  && isSmithsonianGalleryReady(smithsonianAsset));
check('smithsonian: browser endpoint is the keyless upstream API',
  SMITHSONIAN_3D_API_URL === 'https://3d-api.si.edu/api/v1.0');

// --- gallery material-family routing ---------------------------------------------

check('gallery materials: PLATEAU landmark uses the urban shader',
  resolveGalleryMaterialFamily(findPlateauLandmark('tokyo-tower'))
    === GALLERY_MATERIAL_FAMILY.urban);
check('gallery materials: manufactured props default to the urban shader',
  resolveGalleryMaterialFamily({
    categories: ['props'],
    id: 'wooden_crate_01',
    kind: 'model',
    name: 'Wooden crate',
    source: 'polyhaven',
  }) === GALLERY_MATERIAL_FAMILY.urban);
check('gallery materials: uncategorized models default urban and explicit metadata wins',
  resolveGalleryMaterialFamily({
    kind: 'model',
    name: 'Uncatalogued display object',
  }) === GALLERY_MATERIAL_FAMILY.urban
  && resolveGalleryMaterialFamily({
    kind: 'model',
    materialFamily: GALLERY_MATERIAL_FAMILY.environment,
    name: 'Curated natural asset',
  }) === GALLERY_MATERIAL_FAMILY.environment);
check('gallery materials: manufactured context wins for stone walls',
  resolveGalleryMaterialFamily({
    categories: ['stone', 'architecture'],
    kind: 'model',
    name: 'Old stone wall',
  }) === GALLERY_MATERIAL_FAMILY.urban);
check('gallery materials: vegetation and geology retain environment shading',
  resolveGalleryMaterialFamily({
    categories: ['nature'],
    kind: 'model',
    name: 'Forest fern plant',
  }) === GALLERY_MATERIAL_FAMILY.environment
  && resolveGalleryMaterialFamily({
    categories: ['rocks'],
    kind: 'model',
    name: 'Granite boulder',
  }) === GALLERY_MATERIAL_FAMILY.environment);
check('gallery materials: natural museum specimens retain environment shading',
  resolveGalleryMaterialFamily({
    categories: ['natural history', 'specimen'],
    kind: 'model',
    name: 'Blue crab',
    source: 'smithsonian',
  }) === GALLERY_MATERIAL_FAMILY.environment);
check('gallery materials: texture entries do not use the object shader',
  resolveGalleryMaterialFamily({
    categories: ['brick'],
    kind: 'texture',
    name: 'Brick wall',
  }) === GALLERY_MATERIAL_FAMILY.environment);

// --- catalog entry contract ---------------------------------------------------------

const crate = refs.find((ref) => ref.id === 'wooden_crate_01');
const entry = importedAssetCatalogEntry(crate, { download: modelDownload });
check('imported entry validates against the frozen manifest', validateCatalogEntry(entry).ok,
  validateCatalogEntry(entry).errors.join(' '));
check('imported entry shape: id/kind/cluster/tags',
  entry.id === 'imported/polyhaven/wooden-crate-01'
  && entry.kind === 'imported-glb'
  && entry.cluster === 'assetlib'
  && entry.tags.includes('imported') && entry.tags.includes('polyhaven'));
check('imported entry recipe carries re-download + attribution',
  entry.recipe.download.url === modelDownload.url
  && entry.recipe.attribution.license === 'CC0'
  && entry.recipe.attribution.sourceLabel === 'Poly Haven');

const isolated = createCatalog();
isolated.register(entry, { source: 'library' });
check('imported entry registers + lists in the catalog',
  isolated.list({ tags: ['imported'] }).length === 1);
check('imported entry refuses sync spawn with the async snippet', (() => {
  try {
    isolated.spawn(entry.id);
    return false;
  } catch (error) {
    return error.message.includes('loadImportedAsset');
  }
})());

const texEntry = importedAssetCatalogEntry(
  { ...acgRefs[0] },
  { textureSet: { format: 'jpg', maps: { diffuse: { url: 'https://x/diff.jpg' } }, resolution: '1k' } },
);
check('texture imports produce valid entries too', validateCatalogEntry(texEntry).ok
  && texEntry.id === 'imported/ambientcg/bricks097');

// --- zip reader (archive built in-memory — still offline) ----------------------------

function buildTestZip(files) {
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const [name, content, method] of files) {
    const nameBytes = Buffer.from(name, 'utf8');
    const raw = Buffer.from(content, 'utf8');
    const data = method === 8 ? deflateRawSync(raw) : raw;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    chunks.push(local, nameBytes, data);
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50, 0);
    record.writeUInt16LE(method, 10);
    record.writeUInt32LE(data.length, 20);
    record.writeUInt32LE(raw.length, 24);
    record.writeUInt16LE(nameBytes.length, 28);
    record.writeUInt32LE(offset, 42);
    central.push(record, nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const centralBytes = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBytes.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, centralBytes, eocd]);
}

const zipEntries = await readZipEntries(buildTestZip([
  ['Bricks_Color.jpg', 'stored-bytes', 0],
  ['Bricks_NormalGL.jpg', 'deflated-bytes-deflated-bytes', 8],
]));
check('zip reader: STORE + DEFLATE entries decode', zipEntries.length === 2
  && new TextDecoder().decode(zipEntries[0].data) === 'stored-bytes'
  && new TextDecoder().decode(zipEntries[1].data) === 'deflated-bytes-deflated-bytes');
check('zip reader: rejects non-zip input', await readZipEntries(new Uint8Array(64)).then(() => false, () => true));

// --- fetch cache seam (stubbed — still offline) --------------------------------------

let calls = 0;
let indexRequest = null;
const stubFetch = async (url, options) => {
  calls += 1;
  indexRequest = { options, url };
  return { json: async () => POLYHAVEN_INDEX, ok: true };
};
const first = await fetchPolyhavenIndex({ fetchImpl: stubFetch, now: NOW, type: 'models' });
await fetchPolyhavenIndex({ fetchImpl: stubFetch, now: NOW, type: 'models' });
check('index fetch is cached per type per session', calls === 1 && first.length === 2);
check('polyhaven: Node requests identify ToonLab by default',
  indexRequest.url === 'https://api.polyhaven.com/assets?type=models'
  && indexRequest.options.headers.get('user-agent') === ASSETLIB_USER_AGENT);
check('polyhaven: browser endpoint uses the identifying same-origin proxy',
  POLYHAVEN_BROWSER_API_URL === '/api/polyhaven');

let filesRequest = null;
await fetchPolyhavenFiles('wooden_crate_01', {
  apiUrl: 'https://polyhaven-proxy.example/',
  fetchImpl: async (url, options) => {
    filesRequest = { options, url };
    return { json: async () => POLYHAVEN_MODEL_FILES, ok: true };
  },
  headers: { 'User-Agent': 'CallerOverride/1.0' },
});
check('polyhaven: custom endpoint and User-Agent override are preserved',
  filesRequest.url === 'https://polyhaven-proxy.example/files/wooden_crate_01'
  && filesRequest.options.headers.get('user-agent') === 'CallerOverride/1.0');

console.log(failures === 0 ? '\nverify-assetlib: all checks passed' : `\nverify-assetlib: ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
