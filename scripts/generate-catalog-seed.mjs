import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

import { assertCatalogLicenseRelease } from '../src/asset-policy/catalogLicenses.js';

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function sqlString(value) {
  return value == null ? 'null' : `'${String(value).replaceAll("'", "''")}'`;
}

function sqlArray(values) {
  return `array[${(values ?? []).map(sqlString).join(',')}]::text[]`;
}

function immutablePrefix(baseUrl, release, assetId) {
  return `${baseUrl.replace(/\/+$/, '')}/official/${encodeURIComponent(release)}/${encodeURIComponent(assetId)}/`;
}

const reusableFiles = new Map();

function assetUrlPrefix(asset, url, prefix, integrity = null) {
  const previous = reusableFiles.get(`${asset.id}\0${url}`);
  if (!previous) return prefix;
  if (previous.license !== asset.license || previous.scope !== asset.redistributionScope) {
    throw new Error(`${asset.id}: reused file license and redistribution scope must match the base manifest`);
  }
  if (integrity) {
    for (const field of ['sha256', 'byteSize', 'contentType']) {
      const current = field === 'sha256' ? String(integrity[field]).toLowerCase() : integrity[field];
      const original = field === 'sha256' ? String(previous[field]).toLowerCase() : previous[field];
      if (current !== original) throw new Error(`${asset.id}: reused file ${field} differs from the base manifest`);
    }
  }
  return previous.prefix;
}

function assertSha(value, label) {
  if (!/^[a-f0-9]{64}$/i.test(String(value ?? ''))) throw new Error(`${label}: invalid SHA-256`);
}

function assertBytes(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label}: invalid byteSize`);
}

function assertUrl(value, prefix, label, { optional = false } = {}) {
  if (optional && !value) return;
  if (typeof value !== 'string') {
    throw new Error(`${label}: URL must use immutable prefix ${prefix}`);
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label}: URL must use immutable prefix ${prefix}`);
  }
  const prefixUrl = new URL(prefix);
  const relativePath = decodeURIComponent(url.pathname.slice(prefixUrl.pathname.length));
  if (
    url.origin !== prefixUrl.origin
    || !url.pathname.startsWith(prefixUrl.pathname)
    || url.username
    || url.password
    || url.search
    || url.hash
  ) {
    throw new Error(`${label}: URL must use immutable prefix ${prefix}`);
  }
  assertSafePath(relativePath, label);
}

function assertSafePath(value, label) {
  const path = String(value ?? '');
  if (!path || path.startsWith('/') || path.includes('\\') || /[\0-\x1f]/.test(path)) {
    throw new Error(`${label}: unsafe relative path`);
  }
  const parts = path.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`${label}: unsafe relative path`);
  }
  return path;
}

function assertContentType(value, label) {
  if (!/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i.test(String(value ?? ''))) {
    throw new Error(`${label}: invalid contentType`);
  }
}

function assertPublicHttpsUrl(value, label, { optional = false } = {}) {
  if (optional && !value) return;
  let url;
  try {
    url = new URL(String(value ?? ''));
  } catch {
    throw new Error(`${label}: must be public HTTPS`);
  }
  if (
    url.protocol !== 'https:'
    || url.username
    || url.password
    || /[?&](?:sign|signature|token|X-Amz-Credential|X-Amz-Signature)=/i.test(url.search)
  ) throw new Error(`${label}: must be public HTTPS`);
}

function assertReview(asset, policy) {
  const review = asset.licenseReview;
  if (!review || typeof review !== 'object') throw new Error(`${asset.id}: licenseReview is required`);
  for (const field of ['reviewer', 'reviewedAt', 'allowedScope', 'requiredCredit']) {
    if (!String(review[field] ?? '').trim()) throw new Error(`${asset.id}: licenseReview.${field} is required`);
  }
  assertSha(
    review.evidenceSha256 ?? review.readmeSha256,
    `${asset.id}: licenseReview.evidenceSha256`,
  );
  if (!policy.spdx && !String(review.permissionEvidence ?? '').trim()) {
    throw new Error(`${asset.id}: custom license requires licenseReview.permissionEvidence`);
  }
  if (review.allowedScope !== asset.redistributionScope) {
    throw new Error(`${asset.id}: reviewed allowedScope must match redistributionScope`);
  }
  if (review.reviewedAt !== asset.reviewedAt) {
    throw new Error(`${asset.id}: reviewed dates must match`);
  }
}

function assertRockDimensions(asset) {
  if (asset.metadata?.catalog !== 'rocks') return;
  const dimensions = asset.metadata?.dimensionsMeters;
  if (!dimensions || typeof dimensions !== 'object' || Array.isArray(dimensions)) {
    throw new Error(`${asset.id}: rock metadata.dimensionsMeters is required`);
  }
  for (const axis of ['width', 'height', 'depth']) {
    if (!Number.isFinite(dimensions[axis]) || dimensions[axis] <= 0) {
      throw new Error(`${asset.id}: rock metadata.dimensionsMeters.${axis} must be a positive number in meters`);
    }
  }
}

function assertAsset(asset, release, baseUrl) {
  const required = [
    'id', 'source', 'kind', 'name', 'license', 'licenseUrl', 'downloadUrl',
    'redistributionScope', 'reviewedAt',
  ];
  for (const field of required) {
    if (asset[field] == null || asset[field] === '') throw new Error(`${asset.id ?? 'asset'}: ${field} is required`);
  }
  if (!['external-only', 'archive', 'archive-and-files'].includes(asset.redistributionScope)) {
    throw new Error(`${asset.id}: invalid redistributionScope`);
  }
  const policy = assertCatalogLicenseRelease({
    evidence: asset.licenseReview?.permissionEvidence,
    id: asset.license,
    redistributionScope: asset.redistributionScope,
  });
  assertReview(asset, policy);
  if (policy.canonicalUrl && asset.licenseUrl !== policy.canonicalUrl) {
    throw new Error(`${asset.id}: licenseUrl must match the reviewed policy URL`);
  }
  if (asset.attributionRequired && !String(asset.attribution ?? '').trim()) {
    throw new Error(`${asset.id}: attribution text is required`);
  }
  const externalOnly = asset.redistributionScope === 'external-only';
  if (!externalOnly) {
    assertSha(asset.sha256, asset.id);
    assertBytes(asset.byteSize, asset.id);
    assertContentType(asset.contentType, asset.id);
  } else if (asset.sha256 != null || asset.byteSize != null || asset.contentType != null) {
    throw new Error(`${asset.id}: external-only assets must not claim release-owned integrity metadata`);
  }
  assertRockDimensions(asset);
  assertPublicHttpsUrl(asset.sourceUrl, `${asset.id}: sourceUrl`);
  const prefix = immutablePrefix(baseUrl, release, asset.id);
  if (externalOnly) {
    assertPublicHttpsUrl(asset.downloadUrl, `${asset.id}: external-only downloadUrl`);
    assertPublicHttpsUrl(asset.thumbnailUrl, `${asset.id}: external-only thumbnailUrl`, { optional: true });
  } else {
    assertUrl(asset.downloadUrl, assetUrlPrefix(asset, asset.downloadUrl, prefix, asset), `${asset.id}: downloadUrl`);
    assertUrl(asset.thumbnailUrl, assetUrlPrefix(asset, asset.thumbnailUrl, prefix), `${asset.id}: thumbnailUrl`, { optional: true });
  }
  const paths = new Set();
  const files = asset.files ?? [];
  if (!Array.isArray(files)) throw new Error(`${asset.id}: files must be an array`);
  if (asset.redistributionScope === 'archive-and-files' && files.length === 0) {
    throw new Error(`${asset.id}: archive-and-files scope requires extracted files`);
  }
  for (const file of files) {
    const path = assertSafePath(file.path, `${asset.id}: file`);
    if (paths.has(path)) throw new Error(`${asset.id}: duplicate extracted path ${path}`);
    paths.add(path);
    if (asset.redistributionScope !== 'archive-and-files') {
      throw new Error(`${asset.id}: extracted files require archive-and-files scope`);
    }
    const filePrefix = assetUrlPrefix(asset, file.downloadUrl, prefix, file);
    assertUrl(file.downloadUrl, filePrefix, `${asset.id}/${path}`);
    assertSha(file.sha256, `${asset.id}/${path}`);
    assertBytes(file.byteSize, `${asset.id}/${path}`);
    assertContentType(file.contentType, `${asset.id}/${path}`);
    const encodedPath = path.split('/').map(encodeURIComponent).join('/');
    const approvedUrls = new Set([
      `${filePrefix}${encodedPath}`,
      `${filePrefix}files/${encodedPath}`,
    ]);
    if (!approvedUrls.has(file.downloadUrl)) {
      throw new Error(`${asset.id}/${path}: downloadUrl does not preserve an approved immutable relative path`);
    }
  }
  return policy;
}

const manifestPath = argument('--manifest');
const outputPath = argument('--out');
if (!manifestPath || !outputPath) {
  throw new Error('Usage: node scripts/generate-catalog-seed.mjs --manifest release.json --out database/seeds/catalog/NNNN_release.sql [--base-manifest previous-release.json]');
}
const manifest = JSON.parse(await readFile(resolve(manifestPath), 'utf8'));
if (manifest.schema !== 'toonlab.oss-catalog-release.v2') {
  throw new Error('Manifest schema must be toonlab.oss-catalog-release.v2');
}
const release = String(manifest.release ?? '').trim();
const publicBaseUrl = String(manifest.publicBaseUrl ?? process.env.R2_PUBLIC_BASE_URL ?? '').trim();
if (!/^[a-z0-9][a-z0-9._-]*$/i.test(release)) throw new Error('Manifest release is invalid');
let publicBase;
try {
  publicBase = new URL(publicBaseUrl);
} catch {
  throw new Error('publicBaseUrl must be a valid HTTPS URL');
}
if (
  publicBase.protocol !== 'https:'
  || publicBase.pathname !== '/'
  || publicBase.username
  || publicBase.password
  || publicBase.search
  || publicBase.hash
  || publicBase.hostname !== 'assets.toonlab.io'
) {
  throw new Error('publicBaseUrl must use the public immutable origin https://assets.toonlab.io');
}
if (!Array.isArray(manifest.assets)) throw new Error('Manifest assets must be an array');

const baseManifestPath = argument('--base-manifest');
if (baseManifestPath) {
  const base = JSON.parse(await readFile(resolve(baseManifestPath), 'utf8'));
  if (base.schema !== manifest.schema || base.publicBaseUrl !== publicBaseUrl
    || !/^[a-z0-9][a-z0-9._-]*$/i.test(String(base.release ?? ''))
    || !Array.isArray(base.assets)) throw new Error('Invalid base manifest');
  const baseIds = new Set();
  // Validate the base without reuse exceptions before trusting its file identities.
  for (const asset of base.assets) {
    assertAsset(asset, base.release, publicBaseUrl);
    if (baseIds.has(asset.id)) throw new Error(`Duplicate base asset id: ${asset.id}`);
    baseIds.add(asset.id);
  }
  const withdrawn = new Set((base.withdrawals ?? []).map((entry) => entry.id));
  for (const asset of base.assets) {
    if (asset.redistributionScope === 'external-only' || withdrawn.has(asset.id)) continue;
    const shared = {
      license: asset.license,
      scope: asset.redistributionScope,
      prefix: immutablePrefix(publicBaseUrl, base.release, asset.id),
    };
    if (asset.thumbnailUrl) reusableFiles.set(`${asset.id}\0${asset.thumbnailUrl}`, shared);
    for (const file of [asset, ...(asset.files ?? [])]) {
      const key = `${asset.id}\0${file.downloadUrl}`;
      const entry = { ...shared, sha256: file.sha256, byteSize: file.byteSize, contentType: file.contentType };
      const previous = reusableFiles.get(key);
      if (previous?.sha256 && ['sha256', 'byteSize', 'contentType'].some((field) => previous[field] !== entry[field])) {
        throw new Error(`${asset.id}: conflicting base file integrity`);
      }
      reusableFiles.set(key, entry);
    }
  }
}

const ids = new Set();
for (const asset of manifest.assets) {
  assertAsset(asset, release, publicBaseUrl);
  if (ids.has(asset.id)) throw new Error(`Duplicate asset id: ${asset.id}`);
  ids.add(asset.id);
}

const rows = manifest.assets.map((asset) => `(
  ${sqlString(asset.id)}, ${sqlString(release)}, ${sqlString(asset.source)},
  ${sqlString(asset.sourceId)}, ${sqlString(asset.kind)}, ${sqlString(asset.name)},
  ${sqlString(asset.description)}, ${sqlString(asset.license)}, ${sqlString(asset.attribution)},
  ${sqlString(asset.sourceUrl)}, ${sqlString(asset.downloadUrl)}, ${sqlString(asset.thumbnailUrl)},
  ${sqlString(asset.sha256?.toLowerCase())}, ${asset.byteSize == null ? 'null' : Number(asset.byteSize)}, ${sqlString(asset.contentType)},
  ${sqlArray(asset.tags)}, ${sqlString(JSON.stringify(asset.metadata ?? {}))}::jsonb,
  ${sqlString(asset.licenseUrl)}, ${asset.attributionRequired === true},
  ${sqlString(asset.redistributionScope)}, ${sqlString(asset.reviewedAt)}, 'active'
)`);

const fileRows = manifest.assets.flatMap((asset) => (asset.files ?? []).map((file) => `(
  ${sqlString(asset.id)}, ${sqlString(file.path)}, ${sqlString(file.kind ?? 'file')},
  ${sqlString(file.downloadUrl)}, ${sqlString(file.sha256.toLowerCase())},
  ${Number(file.byteSize)}, ${sqlString(file.contentType)}, ${sqlString(file.notice)},
  ${sqlString(JSON.stringify(file.compatibility ?? {}))}::jsonb
)`));

if (!Array.isArray(manifest.withdrawals ?? [])) throw new Error('Manifest withdrawals must be an array');
const withdrawalIds = new Set();
const withdrawals = (manifest.withdrawals ?? []).map((entry) => {
  if (!String(entry.id ?? '').trim() || !String(entry.reason ?? '').trim()) {
    throw new Error('Every withdrawal requires id and reason');
  }
  if (withdrawalIds.has(entry.id)) throw new Error(`Duplicate withdrawal id: ${entry.id}`);
  withdrawalIds.add(entry.id);
  return `update catalog_assets set availability_status = 'withdrawn', withdrawal_reason = ${sqlString(entry.reason)}, download_url = null where id = ${sqlString(entry.id)};\nupdate catalog_asset_files set download_url = null where asset_id = ${sqlString(entry.id)};`;
});

const assetInsert = rows.length ? `insert into catalog_assets (
  id, release, source, source_id, kind, name, description, license, attribution,
  source_url, download_url, thumbnail_url, sha256, byte_size, content_type, tags, metadata,
  license_url, attribution_required, redistribution_scope, license_reviewed_at, availability_status
) values
${rows.join(',\n')}
on conflict (id) do update set
  release = excluded.release,
  source = excluded.source,
  source_id = excluded.source_id,
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  license = excluded.license,
  attribution = excluded.attribution,
  source_url = excluded.source_url,
  download_url = excluded.download_url,
  thumbnail_url = excluded.thumbnail_url,
  sha256 = excluded.sha256,
  byte_size = excluded.byte_size,
  content_type = excluded.content_type,
  tags = excluded.tags,
  metadata = excluded.metadata,
  license_url = excluded.license_url,
  attribution_required = excluded.attribution_required,
  redistribution_scope = excluded.redistribution_scope,
  license_reviewed_at = excluded.license_reviewed_at,
  availability_status = 'active',
  withdrawal_reason = null;` : '';
const fileReset = manifest.assets.length
  ? `delete from catalog_asset_files where asset_id in (${manifest.assets.map((asset) => sqlString(asset.id)).join(', ')});`
  : '';

const sql = `-- Generated from ${basename(manifestPath)}.
-- Release: ${release}
-- Asset count: ${manifest.assets.length}
-- R2 objects must be uploaded and verified before this seed is committed.
${assetInsert}
${fileReset}
${fileRows.length ? `insert into catalog_asset_files (
  asset_id, relative_path, kind, download_url, sha256, byte_size, content_type, notice, compatibility
) values
${fileRows.join(',\n')}
on conflict (asset_id, relative_path) do update set
  kind = excluded.kind,
  download_url = excluded.download_url,
  sha256 = excluded.sha256,
  byte_size = excluded.byte_size,
  content_type = excluded.content_type,
  notice = excluded.notice,
  compatibility = excluded.compatibility;` : ''}
${withdrawals.join('\n')}
`.trimEnd() + '\n';
await writeFile(resolve(outputPath), sql, 'utf8');
process.stdout.write(`${JSON.stringify({
  assets: manifest.assets.length,
  files: fileRows.length,
  output: resolve(outputPath),
  release,
  sha256: createHash('sha256').update(sql).digest('hex'),
  withdrawals: withdrawals.length,
}, null, 2)}\n`);
