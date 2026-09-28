import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const migration = await readFile(new URL('../database/migrations/0001_local_workspace.sql', import.meta.url), 'utf8');
const compose = await readFile(new URL('../compose.yaml', import.meta.url), 'utf8');
const repository = await readFile(new URL('../database/repository.mjs', import.meta.url), 'utf8');
const cleanupMigration = await readFile(
  new URL('../database/migrations/0003_remove_autosaves_from_library.sql', import.meta.url),
  'utf8',
);
const packMigration = await readFile(
  new URL('../database/migrations/0004_catalog_asset_packs.sql', import.meta.url),
  'utf8',
);
const tagMigration = await readFile(
  new URL('../database/migrations/0005_creation_tag_discovery.sql', import.meta.url),
  'utf8',
);
const tagNormalizationMigration = await readFile(
  new URL('../database/migrations/0006_normalize_creation_tags.sql', import.meta.url),
  'utf8',
);
const revisionMigration = await readFile(
  new URL('../database/migrations/0007_creation_revisions.sql', import.meta.url),
  'utf8',
);
const revisionHardeningMigration = await readFile(
  new URL('../database/migrations/0008_creation_revision_hardening.sql', import.meta.url),
  'utf8',
);
const revisionDeleteIntegrityMigration = await readFile(
  new URL('../database/migrations/0009_creation_revision_delete_integrity.sql', import.meta.url),
  'utf8',
);
const externalCatalogMigration = await readFile(
  new URL('../database/migrations/0010_external_catalog_assets.sql', import.meta.url),
  'utf8',
);
const vitePlugin = await readFile(new URL('../mcp/vite-plugin.mjs', import.meta.url), 'utf8');
const workspaceModule = await readFile(new URL('../mcp/workspace.mjs', import.meta.url), 'utf8');
const mcpServer = await readFile(new URL('../mcp/server.mjs', import.meta.url), 'utf8');
const bootstrap = await readFile(new URL('../labs/shared/workspace-bootstrap.js', import.meta.url), 'utf8');
const gallery = await readFile(new URL('../labs/gallery/main.js', import.meta.url), 'utf8');
const galleryHtml = await readFile(new URL('../gallery/index.html', import.meta.url), 'utf8');
const assetPage = await readFile(new URL('../labs/asset-page/main.js', import.meta.url), 'utf8');
const assetLabMain = await readFile(new URL('../labs/asset-lab/ui/main.jsx', import.meta.url), 'utf8');
const assetLabEngine = await readFile(new URL('../labs/asset-lab/engine/assetEngine.js', import.meta.url), 'utf8');
const assetHtml = await readFile(new URL('../asset/index.html', import.meta.url), 'utf8');
const libraryPage = await readFile(new URL('../labs/library/main.js', import.meta.url), 'utf8');
const libraryHtml = await readFile(new URL('../library/index.html', import.meta.url), 'utf8');
const libraryAssetExtension = await readFile(new URL('../labs/library/assetExtension.js', import.meta.url), 'utf8');
const libraryEntry = await readFile(new URL('../labs/library/libraryEntry.js', import.meta.url), 'utf8');
const libraryCss = await readFile(new URL('../labs/library/library.css', import.meta.url), 'utf8');
const textureLabMain = await readFile(new URL('../labs/texture-lab/ui/main.jsx', import.meta.url), 'utf8');
const textureEngine = await readFile(new URL('../labs/texture-lab/engine/textureEngine.js', import.meta.url), 'utf8');
const stylesPage = await readFile(new URL('../labs/styles/main.js', import.meta.url), 'utf8');
const setup = await readFile(new URL('./setup-local.mjs', import.meta.url), 'utf8');
const sqlApplication = await readFile(new URL('../database/apply-sql.mjs', import.meta.url), 'utf8');
const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
for (const table of [
  'creations',
  'lab_drafts',
  'files',
  'catalog_assets',
  'generation_jobs',
  'schema_migrations',
  'catalog_seed_batches',
]) {
  assert.match(migration, new RegExp(`create table if not exists ${table}\\b`));
}
assert.match(migration, /references creations\(id\) on delete cascade/);
assert.match(migration, /search_tsv tsvector generated always/);
assert.match(packMigration, /create table if not exists catalog_asset_files/);
assert.match(tagMigration, /creations_tags.*using gin \(tags\)/);
assert.match(tagNormalizationMigration, /toonlab_normalize_creation_tags/);
assert.match(tagNormalizationMigration, /update creations/);
assert.match(tagNormalizationMigration, /limit 10/);
assert.match(revisionMigration, /create table if not exists creation_revisions/);
assert.match(revisionMigration, /unique \(creation_id, revision_number\)/);
assert.match(revisionMigration, /creation_revisions_unique_name/);
assert.match(revisionMigration, /restored_from_revision_id/);
assert.match(revisionMigration, /dependency_snapshot/);
assert.match(revisionHardeningMigration, /creation_revisions_immutable_snapshot/);
assert.match(revisionHardeningMigration, /creation_revisions_same_creation_restore/);
assert.match(revisionHardeningMigration, /creations_same_current_revision/);
assert.match(revisionDeleteIntegrityMigration, /on delete no action/);
assert.match(externalCatalogMigration, /alter column sha256 drop not null/);
assert.match(externalCatalogMigration, /alter column byte_size drop not null/);
assert.match(externalCatalogMigration, /alter column content_type drop not null/);
assert.match(externalCatalogMigration, /catalog_assets_integrity_matches_scope/);
assert.match(externalCatalogMigration, /redistribution_scope = 'external-only'/);
assert.match(repository, /locked\.rows\[0\]\.content_hash === contentHash/);
assert.match(repository, /force: true/);
assert.match(repository, /saveSource: 'restore'/);
assert.match(repository, /styleBundleDependencySnapshot/);
assert.match(repository, /resolveStyleBundleEntry/);
assert.match(repository, /saveSource: 'legacy-import'/);
assert.match(repository, /select count\(\*\)::int as total from creation_revisions/);
assert.match(repository, /The doc key is the stable identity/);
assert.match(repository, /tags = \$4/);
assert.match(repository, /from '\.\/creation-tags\.mjs'/);
assert.match(workspaceModule, /normalizeCreationTags/);
assert.doesNotMatch(workspaceModule, /replace\(\/\\s\+\/g, '-'/);
assert.doesNotMatch(mcpServer, /function normalizeCreationTags/);
assert.match(repository, /tags: row\.tags \?\? \[\]/);
assert.match(packMigration, /availability_status in \('active', 'withdrawn'\)/);
assert.match(compose, /127\.0\.0\.1:\$\{TOONLAB_POSTGRES_PORT:-55432\}:5432/);
assert.match(vitePlugin, /saveLibraryEntry\(entry\)/);
assert.doesNotMatch(vitePlugin, /saveLibraryEntry\(workspacePath,\s*entry\)/);
assert.match(vitePlugin, /deleteLibraryEntry\(id\)/);
assert.match(bootstrap, /if \(!migrated\?\.initialized\)/);
assert.match(repository, /setLabStateWithClient\(client, key, value\)/);
assert.doesNotMatch(repository, /for \(const \[key, value\].*await setLabState\(key, value\)/s);
assert.match(repository, /filter\(\(\[storeKey\]\) => !storeKey\.startsWith\('__'\)\)/);
assert.match(cleanupMigration, /\? '__current__'/);
assert.match(libraryPage, /\/asset\/\?src=library&id=/);
assert.match(libraryHtml, /Nothing saved yet/);
assert.match(libraryAssetExtension, /Comma-separated, up to 10/);
assert.match(libraryAssetExtension, /normalizeCreationTags/);
assert.match(libraryAssetExtension, /Name this version/);
assert.match(libraryAssetExtension, /\/restore/);
assert.match(libraryAssetExtension, /lib-revision-list/);
assert.match(vitePlugin, /annotateCreationRevision/);
assert.match(vitePlugin, /restoreCreationRevision/);
assert.match(vitePlugin, /getCreationRevision/);
assert.match(vitePlugin, /resolveStyleBundleEntry/);
assert.match(libraryHtml, /id="libraryType"/);
assert.match(libraryHtml, /id="libraryTag"/);
assert.match(libraryHtml, /id="libraryPager"/);
assert.match(libraryPage, /const PAGE_SIZE = 36/);
assert.match(libraryEntry, /manufactured-surface-profile/);
assert.match(libraryEntry, /setParam\('\/texture-lab\/', 'textureRecipe'/);
assert.doesNotMatch(libraryPage, /setupStage|detailPreview|livePreviewHref/);
assert.doesNotMatch(libraryHtml, /asset-screen|asset-stage|asset-panel|libraryDetail/);
assert.match(assetPage, /assetSource === 'library'/);
assert.match(assetPage, /bootLibraryAsset/);
assert.match(assetPage, /function setupEmbeddedStage/);
assert.match(libraryAssetExtension, /setupStage\('model'/);
assert.match(libraryAssetExtension, /setupEmbeddedStage\(\{/);
assert.match(libraryCss, /\.asset-library \.asset-panel[^}]*scrollbar-width:\s*thin/s);
assert.match(textureLabMain, /window\.__assetLabEngine = engine/);
assert.match(textureEngine, /setCompare\(enabled\)/);
assert.match(textureEngine, /setSplit\(fraction\)/);
for (const shellClass of ['asset-screen', 'asset-stage', 'asset-scrim', 'asset-crumb', 'asset-panel']) {
  const shellPattern = new RegExp(`class="[^"]*\\b${shellClass}\\b`);
  assert.match(assetHtml, shellPattern, `Gallery detail is missing ${shellClass}.`);
}
assert.match(libraryEntry, /const \{ _local, \.\.\.document \}/);
assert.match(stylesPage, /STYLE_BUNDLE_SLOTS/);
assert.match(stylesPage, /The Styles editor metadata is out of sync/);
assert.match(stylesPage, /Your saved documents/);
assert.match(readme, /\/api\/toonlab\/library\/<bundle-id>\/resolved/);
assert.match(gallery, /offset: String\(\(state\.page - 1\) \* PAGE_SIZE\)/);
assert.match(gallery, /\/api\/toonlab\/catalog-facets/);
assert.match(gallery, /params\.set\('source'/);
assert.match(gallery, /params\.set\('license'/);
assert.match(gallery, /params\.set\('kind'/);
assert.match(gallery, /params\.set\('size'/);
assert.doesNotMatch(gallery, /api\/polyhaven|fetchSmithsonianIndex|fetchPlateauBuildingIndex/);
assert.match(galleryHtml, /id="galSource"/);
assert.match(galleryHtml, /id="galLicense"/);
assert.match(galleryHtml, /id="galType"/);
assert.match(galleryHtml, /id="galSize"/);
assert.match(gallery, /externalDelivery: asset\.redistribution_scope === 'external-only'/);
assert.match(assetPage, /function externalMetadataFiles\(asset\)/);
assert.match(assetPage, /Open original download ↗/);
assert.match(assetPage, /relative_path === 'material-config\.json'/);
assert.match(assetPage, /rockMaterialConfigUrl=/);
assert.match(assetPage, /renderNatureEvidence\(asset\.metadata\?\.natureProvenance\)/);
assert.match(assetPage, /Nature evidence/);
assert.match(assetPage, /Morphology reference — not a copied texture/);
assert.match(assetPage, /provenance\.publicImageStatus === 'approved'/);
assert.match(assetLabMain, /rockMaterialConfig = await response\.json\(\)/);
assert.match(assetLabEngine, /applyRockShader\(object, settings/);
assert.match(assetLabEngine, /toonLabRockMaterialConfig/);
assert.match(repository, /group by source, license/);
assert.match(repository, /metadata->>'catalog' = 'rocks'/);
assert.match(vitePlugin, /url\.pathname === '\/api\/toonlab\/catalog-facets'/);
assert.equal(packageJson.scripts.update, 'node scripts/setup-local.mjs --update');
assert.match(setup, /applyMigrations\(\)/);
assert.match(setup, /applyCatalogSeeds\(\)/);
assert.match(setup, /Official catalog assets:/);
assert.match(setup, /no verified release seed is checked in yet/);
assert.match(setup, /Docker\.app\/Contents\/Resources\/cli-plugins\/docker-compose/);
assert.match(setup, /Docker Desktop is installed but its engine is not running/);
assert.match(setup, /ToonLab setup could not continue/);
assert.match(sqlApplication, /APPROVED_PRE_RELEASE_REPLACEMENTS/);
assert.match(sqlApplication, /reconciled-pre-release/);
assert.match(readme, /Never edit, rename, or replace a released migration or\s+seed file/);
assert.match(readme, /npm run update/);

const { isApprovedPreReleaseReplacement } = await import('../database/apply-sql.mjs');
assert.equal(isApprovedPreReleaseReplacement(
  'catalog_seed_batches',
  '0002_2026-08.sql',
  '08c9a8f921283cc04057cd42ece71f675c993b960398715f55026c62ae2fc7a0',
  '60cadd07df2b6942e77b823d7e3b1901cefdf48c76eded4ec0abceb1afab94ce',
), true);
assert.equal(isApprovedPreReleaseReplacement(
  'catalog_seed_batches',
  '0002_2026-08.sql',
  'unknown',
  '60cadd07df2b6942e77b823d7e3b1901cefdf48c76eded4ec0abceb1afab94ce',
), false);
assert.equal(isApprovedPreReleaseReplacement(
  'schema_migrations',
  '0002_2026-08.sql',
  '08c9a8f921283cc04057cd42ece71f675c993b960398715f55026c62ae2fc7a0',
  '60cadd07df2b6942e77b823d7e3b1901cefdf48c76eded4ec0abceb1afab94ce',
), false);
assert.equal(isApprovedPreReleaseReplacement(
  'catalog_seed_batches',
  'unknown.sql',
  '08c9a8f921283cc04057cd42ece71f675c993b960398715f55026c62ae2fc7a0',
  '60cadd07df2b6942e77b823d7e3b1901cefdf48c76eded4ec0abceb1afab94ce',
), false);
assert.equal(isApprovedPreReleaseReplacement(
  'catalog_seed_batches',
  '0002_2026-08.sql',
  '08c9a8f921283cc04057cd42ece71f675c993b960398715f55026c62ae2fc7a0',
  'unknown',
), false);

const { extractNamedLabStateDocuments, normalizeCreationTags } = await import('../database/repository.mjs');
assert.deepEqual(normalizeCreationTags([' Hero Prop ', 'FOREST', 'hero prop']), ['hero-prop', 'forest']);
assert.deepEqual(
  normalizeCreationTags(['Hero, Prop!', '  --  ', 'Ä Ö', 'a/b', 'hero prop']),
  ['hero-prop', 'a-o', 'a-b'],
);
assert.equal(normalizeCreationTags(Array.from({ length: 12 }, (_, index) => `tag-${index}`)).length, 10);
assert.deepEqual(
  extractNamedLabStateDocuments({
    __current__: { json: '{"id":"draft","label":"Draft"}' },
  }),
  [],
);
assert.deepEqual(
  extractNamedLabStateDocuments({
    'named-rock': { json: '{"type":"rock-project","label":"Named rock"}' },
  }),
  [{
    document: { type: 'rock-project', label: 'Named rock' },
    storeKey: 'named-rock',
  }],
);

const directory = await mkdtemp(join(tmpdir(), 'toonlab-seed-'));
try {
  const manifestPath = join(directory, 'release.json');
  const seedPath = join(directory, 'seed.sql');
  await writeFile(manifestPath, JSON.stringify({
    schema: 'toonlab.oss-catalog-release.v2',
    assets: [{
      attribution: 'Example',
      byteSize: 123,
      contentType: 'model/gltf-binary',
      downloadUrl: 'https://assets.toonlab.io/official/2026-08/example/asset.glb',
      id: 'example',
      kind: 'model',
      license: 'CC0-1.0',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
      redistributionScope: 'archive',
      reviewedAt: '2026-08-03',
      attributionRequired: false,
      licenseReview: {
        allowedScope: 'archive',
        evidenceSha256: 'b'.repeat(64),
        requiredCredit: 'None required',
        reviewedAt: '2026-08-03',
        reviewer: 'ToonLab verification',
      },
      name: 'Example',
      sha256: 'a'.repeat(64),
      source: 'test',
      sourceUrl: 'https://example.com/assets/example',
      tags: ['test'],
    }],
    publicBaseUrl: 'https://assets.toonlab.io',
    release: '2026-08',
  }));
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      new URL('./generate-catalog-seed.mjs', import.meta.url).pathname,
      '--manifest', manifestPath,
      '--out', seedPath,
    ], { stdio: 'ignore' });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`seed generator exited ${code}`)));
  });
  const seed = await readFile(seedPath, 'utf8');
  assert.match(seed, /insert into catalog_assets/);
  assert.match(seed, /on conflict \(id\) do update set/);
  assert.match(seed, /download_url = excluded\.download_url/);
  assert.match(seed, /delete from catalog_asset_files where asset_id in/);
  assert.doesNotMatch(seed, /on conflict \(id\) do nothing/);

  const externalManifestPath = join(directory, 'external-release.json');
  const externalSeedPath = join(directory, 'external-seed.sql');
  const externalManifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  externalManifest.assets[0] = {
    ...externalManifest.assets[0],
    attribution: 'Example Author — CC BY 4.0',
    attributionRequired: true,
    byteSize: null,
    contentType: null,
    downloadUrl: 'https://downloads.example.com/example.glb?variant=original',
    license: 'CC-BY-4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    metadata: { releaseDelivery: 'external-only' },
    redistributionScope: 'external-only',
    sha256: null,
    thumbnailUrl: 'https://images.example.com/example.webp',
    licenseReview: {
      ...externalManifest.assets[0].licenseReview,
      allowedScope: 'external-only',
      requiredCredit: 'Example Author — CC BY 4.0',
    },
  };
  await writeFile(externalManifestPath, JSON.stringify(externalManifest));
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      new URL('./generate-catalog-seed.mjs', import.meta.url).pathname,
      '--manifest', externalManifestPath,
      '--out', externalSeedPath,
    ], { stdio: 'ignore' });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`external seed generator exited ${code}`)));
  });
  const externalSeed = await readFile(externalSeedPath, 'utf8');
  assert.match(externalSeed, /'external-only'/);
  assert.match(externalSeed, /null, null, null/);

  const signedExternalPath = join(directory, 'signed-external-release.json');
  externalManifest.assets[0].thumbnailUrl += '?token=private';
  await writeFile(signedExternalPath, JSON.stringify(externalManifest));
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      new URL('./generate-catalog-seed.mjs', import.meta.url).pathname,
      '--manifest', signedExternalPath,
      '--out', join(directory, 'signed-external.sql'),
    ], { stdio: 'ignore' });
    child.once('error', reject);
    child.once('exit', (code) => code !== 0 ? resolve() : reject(new Error('signed external thumbnail URL was accepted')));
  });

  const missingRockDimensionsPath = join(directory, 'missing-rock-dimensions.json');
  const missingRockDimensions = JSON.parse(await readFile(manifestPath, 'utf8'));
  missingRockDimensions.assets[0].metadata = { catalog: 'rocks' };
  await writeFile(missingRockDimensionsPath, JSON.stringify(missingRockDimensions));
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      new URL('./generate-catalog-seed.mjs', import.meta.url).pathname,
      '--manifest', missingRockDimensionsPath,
      '--out', join(directory, 'missing-rock-dimensions.sql'),
    ], { stdio: 'ignore' });
    child.once('error', reject);
    child.once('exit', (code) => code !== 0 ? resolve() : reject(new Error('rock release without dimensions was accepted')));
  });

  const signedManifestPath = join(directory, 'signed-release.json');
  const signedManifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  signedManifest.assets[0].downloadUrl += '?sign=private';
  await writeFile(signedManifestPath, JSON.stringify(signedManifest));
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      new URL('./generate-catalog-seed.mjs', import.meta.url).pathname,
      '--manifest', signedManifestPath,
      '--out', join(directory, 'signed.sql'),
    ], { stdio: 'ignore' });
    child.once('error', reject);
    child.once('exit', (code) => code !== 0 ? resolve() : reject(new Error('signed catalog URL was accepted')));
  });

  const invalidManifestPath = join(directory, 'invalid-release.json');
  await writeFile(invalidManifestPath, JSON.stringify({
    schema: 'toonlab.oss-catalog-release.v2',
    assets: [{
      byteSize: 123,
      contentType: 'model/gltf-binary',
      downloadUrl: 'https://assets.toonlab.io/official/2026-08/example/asset.glb',
      id: 'example',
      kind: 'model',
      license: 'LicenseRef-UNREVIEWED-CUSTOM-ASSET',
      licenseUrl: 'https://dendewa.vercel.app/legal/assets-license',
      redistributionScope: 'archive-and-files',
      reviewedAt: '2026-08-03',
      attributionRequired: true,
      attribution: 'Required credit',
      licenseReview: {
        allowedScope: 'archive-and-files',
        permissionEvidence: 'unverified-placeholder',
        evidenceSha256: 'b'.repeat(64),
        requiredCredit: 'Required credit',
        reviewedAt: '2026-08-03',
        reviewer: 'ToonLab verification',
      },
      name: 'Example',
      sha256: 'a'.repeat(64),
      source: 'test',
      sourceUrl: 'https://example.com/assets/example',
    }],
    publicBaseUrl: 'https://assets.toonlab.io',
    release: '2026-08',
  }));
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      new URL('./generate-catalog-seed.mjs', import.meta.url).pathname,
      '--manifest', invalidManifestPath,
      '--out', join(directory, 'invalid.sql'),
    ], { stdio: 'ignore' });
    child.once('error', reject);
    child.once('exit', (code) => code !== 0 ? resolve() : reject(new Error('unreviewed custom-license redistribution was accepted')));
  });
} finally {
  await rm(directory, { force: true, recursive: true });
}

console.log('Local database and catalog-seed verification passed.');
