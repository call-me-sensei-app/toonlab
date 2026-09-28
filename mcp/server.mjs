#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import { publicMcpCatalogEntries } from './public-catalog.mjs';
import {
  fetchPolyhavenFiles,
  fetchPolyhavenIndex,
  resolvePolyhavenModelDownload,
  resolvePolyhavenTextureDownload,
} from '../src/assetlib/polyhaven.js';
import { filterAssetRefs } from '../src/assetlib/assetRef.js';
import {
  resolveAmbientcgDownload,
  searchAmbientcg,
} from '../src/assetlib/ambientcg.js';
import {
  getWorkspaceInfo as getLegacyWorkspaceInfo,
  isPersistableStorageKey,
  listLibraryEntries as listLegacyLibraryEntries,
  listStorageDocuments as listLegacyStorageDocuments,
  listWorkspaceFiles as listLegacyWorkspaceFiles,
  matchesText,
  deleteBrowserStorageValue as deleteLegacyBrowserStorageValue,
  deleteLibraryEntry as deleteLegacyLibraryEntry,
  deleteWorkspaceFile as deleteLegacyWorkspaceFile,
  readBrowserStorage as readLegacyBrowserStorage,
  readWorkspaceFile as readLegacyWorkspaceFile,
  resolveWorkspacePath,
  saveCreation as saveLegacyCreation,
  saveLibraryEntry as saveLegacyLibraryEntry,
  setBrowserStorageValue as setLegacyBrowserStorageValue,
  writeWorkspaceFile as writeLegacyWorkspaceFile,
} from './workspace.mjs';
import {
  databaseInfo,
  deleteLabState,
  deleteLibraryEntry as deleteDatabaseLibraryEntry,
  getCatalogAsset as getDatabaseCatalogAsset,
  listCatalogAssets as listDatabaseCatalogAssets,
  listLibraryEntries as listDatabaseLibraryEntries,
  listObjects,
  normalizeCreationTags,
  providerConfiguration,
  readLabState,
  readObject,
  saveLibraryEntry as saveDatabaseLibraryEntry,
  saveCreationDocument,
  saveObject,
  setLabState,
} from '../database/repository.mjs';
import {
  getManagedGeneration,
  listManagedGenerations,
  saveManagedGeneration,
  startManagedGeneration,
} from '../database/generation-service.mjs';
import {
  LIVE_LAB_IDS,
  applyLabDocumentOperation,
  createLabDocument,
  getLabFeatures,
  listLiveLabs,
} from './lab-management.mjs';
import {
  ASSET_POLICY_MODES,
  ASSET_SOURCE_CLASSES,
  createAssetGapRecord,
  evaluateAssetCandidate,
  renderAssetGapReport,
  validateAssetSourcingPolicy,
} from '../src/asset-policy/index.js';
import {
  CALL_ME_SENSEI_STYLE_BUNDLE,
  STYLE_DOMAIN_SLOT_ROUTES,
  TOONLAB_ANIME_GAME_PROFILE,
} from '../src/styles/index.js';
import { runSceneStyleOperation } from '../src/agents/index.js';

const SERVER_NAME = 'toonlab-oss';
const SERVER_VERSION = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
).version;
const PUBLIC_GALLERY_ENDPOINT = process.env.TOONLAB_PUBLIC_GALLERY_URL
  ?? 'https://toonlab.io/api/v1/creations';
const LATEST_PROTOCOL_VERSION = '2025-11-25';
const SUPPORTED_PROTOCOL_VERSIONS = new Set([
  LATEST_PROTOCOL_VERSION,
  '2025-06-18',
  '2025-03-26',
]);

function parseArguments(argv) {
  const args = [...argv];
  if (args[0] === 'mcp') args.shift();
  let workspace = process.env.TOONLAB_WORKSPACE ?? '.toonlab';
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--workspace' && args[index + 1]) {
      workspace = args[index + 1];
      index += 1;
    }
  }
  return { workspace: resolveWorkspacePath(workspace) };
}

const { workspace } = parseArguments(process.argv.slice(2));
const legacyWorkspaceMode = process.env.TOONLAB_LEGACY_WORKSPACE;
const legacyWorkspace = legacyWorkspaceMode === '1'
  || (legacyWorkspaceMode !== '0' && !process.env.DATABASE_URL);

async function getWorkspaceInfo() {
  if (legacyWorkspace) return getLegacyWorkspaceInfo(workspace);
  return {
    database: await databaseInfo(),
    mode: 'postgres',
    path: workspace,
  };
}

async function listLibraryEntries() {
  if (legacyWorkspace) return listLegacyLibraryEntries(workspace);
  return listDatabaseLibraryEntries();
}

async function listStorageDocuments() {
  if (legacyWorkspace) return listLegacyStorageDocuments(workspace);
  const entries = await readLabStateEntries();
  const documents = [];
  for (const [key, raw] of Object.entries(entries)) {
    let parsed;
    try { parsed = JSON.parse(raw); } catch { continue; }
    const values = Array.isArray(parsed) ? parsed : [parsed];
    values.forEach((document, index) => {
      if (!document || typeof document !== 'object') return;
      documents.push({
        cluster: key.match(/^toonlab\.([a-z0-9-]+)/i)?.[1] ?? 'lab',
        document,
        id: `state:${key}:${document.id ?? document.presetId ?? index}`,
        key,
        kind: Array.isArray(parsed) ? 'preset' : 'document',
        label: String(document.label ?? document.name ?? document.id ?? `Document ${index + 1}`),
        source: 'workspace-storage',
      });
    });
  }
  return documents;
}

async function readLabStateEntries() {
  if (legacyWorkspace) return (await readLegacyBrowserStorage(workspace)).entries;
  const entries = await readLabState();
  return Object.fromEntries(
    Object.entries(entries).filter(([key, value]) => isPersistableStorageKey(key) && typeof value === 'string'),
  );
}

async function setLabStateEntry(key, value) {
  if (legacyWorkspace) return setLegacyBrowserStorageValue(workspace, key, value);
  await setLabState(key, value);
  return readLabState();
}

async function deleteLabStateEntry(key) {
  if (legacyWorkspace) return deleteLegacyBrowserStorageValue(workspace, key);
  await deleteLabState(key);
  return readLabState();
}

async function saveLibraryEntry(entry) {
  if (legacyWorkspace) return saveLegacyLibraryEntry(workspace, entry);
  return saveDatabaseLibraryEntry(entry);
}

async function deleteLibraryEntry(asset, type = null) {
  if (legacyWorkspace) return deleteLegacyLibraryEntry(workspace, asset.id);
  return deleteDatabaseLibraryEntry({
    creationId: asset._local?.creationId,
    docKey: asset.id,
    type: type ?? asset.type,
  });
}

async function deleteWorkspaceFile(relativePath) {
  if (!legacyWorkspace) throw new Error('Database-backed workspace objects are not editable creations.');
  return deleteLegacyWorkspaceFile(workspace, relativePath);
}

async function listWorkspaceFiles() {
  if (legacyWorkspace) return listLegacyWorkspaceFiles(workspace);
  return listObjects(workspace);
}

async function readWorkspaceFile(_workspace, relativePath) {
  if (legacyWorkspace) return readLegacyWorkspaceFile(workspace, relativePath);
  return readObject(workspace, relativePath);
}

async function saveCreation(_workspace, options) {
  if (legacyWorkspace) return saveLegacyCreation(workspace, options);
  return saveCreationDocument(options);
}

const MIME_BY_EXTENSION = {
  '.bin': 'application/octet-stream',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.json': 'application/json',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.zip': 'application/zip',
};

async function writeWorkspaceFile(_workspace, relativePath, data) {
  if (legacyWorkspace) return writeLegacyWorkspaceFile(workspace, relativePath, data);
  const bytes = typeof data === 'string' ? Buffer.from(data) : data;
  return saveObject(workspace, bytes, {
    contentType: MIME_BY_EXTENSION[extname(relativePath).toLowerCase()] ?? 'application/octet-stream',
    name: basename(relativePath),
  });
}

function jsonContent(value) {
  return {
    content: [{ text: JSON.stringify(value, null, 2), type: 'text' }],
    structuredContent: value,
  };
}

function errorContent(error) {
  return {
    content: [{ text: error?.message ?? String(error), type: 'text' }],
    isError: true,
  };
}

function limitValue(value, fallback = 25, max = 100) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(max, Math.floor(parsed))) : fallback;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function withSeed(recipe, seed) {
  const next = clone(recipe ?? {});
  if (next.settings?.asset) next.settings.asset.seed = seed;
  else if (next.options) next.options.seed = seed;
  else if (next.settings) next.settings.seed = seed;
  else next.seed = seed;
  return next;
}

const SOURCE_CLASS_BY_SOURCE = Object.freeze({
  builtin: 'procedural',
  library: 'toonlab-library',
  official: 'toonlab-library',
  workspace: 'project-library',
  'workspace-storage': 'project-library',
});

function sourceClassFor(entry) {
  return entry.sourceClass
    ?? SOURCE_CLASS_BY_SOURCE[entry.source]
    ?? 'project-library';
}

function animeStyleSupport(entry) {
  const tags = normalizeCreationTags(entry.tags);
  const explicit = entry.animeStyleSupport ?? entry.supportLevel;
  if (explicit) return explicit;
  if (tags.some((tag) => ['anime', 'cel-shaded', 'toon', 'stylized'].includes(tag))) {
    return 'reviewed-candidate';
  }
  return 'needs-in-scene-review';
}

function normalizeDiscovery(entry, summary, { domain = '', policy = null } = {}) {
  const sourceClass = sourceClassFor(entry);
  return {
    ...summary,
    animeStyleSupport: animeStyleSupport(entry),
    assetKind: entry.kind ?? entry.assetKind ?? null,
    license: entry.license ?? entry.attribution?.license ?? null,
    policyDecision: evaluateAssetCandidate(policy, { domain, sourceClass }),
    provenance: entry.provenance ?? entry.attribution ?? null,
    sourceClass,
  };
}

function publicGalleryUrl(path = '') {
  let endpoint;
  try {
    endpoint = new URL(PUBLIC_GALLERY_ENDPOINT);
  } catch {
    throw new Error('TOONLAB_PUBLIC_GALLERY_URL must be an absolute HTTP(S) URL.');
  }
  if (!['http:', 'https:'].includes(endpoint.protocol)) {
    throw new Error('TOONLAB_PUBLIC_GALLERY_URL must use HTTP(S).');
  }
  endpoint.search = '';
  endpoint.hash = '';
  if (!path) return endpoint;
  endpoint.pathname = `${endpoint.pathname.replace(/\/$/u, '')}/${encodeURIComponent(path)}`;
  return endpoint;
}

function absoluteGalleryReference(reference) {
  if (typeof reference !== 'string' || !reference.trim()) return null;
  return new URL(reference, publicGalleryUrl()).href;
}

async function fetchPublicGalleryJson(url) {
  let response;
  try {
    response = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (cause) {
    throw new Error(`ToonLab public Gallery request failed: ${cause?.message ?? String(cause)}`);
  }
  if (!response.ok) {
    throw new Error(`ToonLab public Gallery returned HTTP ${response.status}.`);
  }
  try {
    return await response.json();
  } catch {
    throw new Error('ToonLab public Gallery returned invalid JSON.');
  }
}

function normalizePublicGalleryItem(item, args = {}) {
  const id = String(item?.id ?? '').trim();
  if (!id) throw new Error('ToonLab public Gallery returned an item without an id.');
  const type = String(item.type ?? 'creation');
  const entry = {
    attribution: item.attribution ?? null,
    author: item.author ?? null,
    cluster: type,
    description: item.description ?? null,
    documentUrl: absoluteGalleryReference(item.download ?? item.documentUrl),
    id,
    kind: type,
    label: String(item.label ?? id),
    license: item.license ?? null,
    source: 'gallery',
    sourceClass: 'toonlab-gallery',
    tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
    thumbnail: absoluteGalleryReference(item.thumbnail),
    updatedAt: item.updated_at ?? null,
    url: absoluteGalleryReference(item.url ?? `/c/${item.slug ?? id}`),
  };
  return normalizeDiscovery(entry, entry, args);
}

async function searchPublicGallery(args = {}) {
  const limit = limitValue(args.limit, 20, 60);
  const offset = Math.max(0, Math.floor(Number(args.offset) || 0));
  const endpoint = publicGalleryUrl();
  endpoint.searchParams.set('limit', String(limit));
  endpoint.searchParams.set('offset', String(offset));
  if (String(args.query ?? '').trim()) endpoint.searchParams.set('q', String(args.query).trim());
  if (String(args.type ?? '').trim()) endpoint.searchParams.set('type', String(args.type).trim());
  const response = await fetchPublicGalleryJson(endpoint);
  if (!Array.isArray(response?.items)) {
    throw new Error('ToonLab public Gallery response is missing items.');
  }
  const items = response.items.map((item) => normalizePublicGalleryItem(item, args));
  return {
    count: items.length,
    items,
    limit,
    nextOffset: items.length === limit ? offset + items.length : null,
    offset,
    source: 'toonlab-public-gallery',
  };
}

async function getPublicGalleryAsset(args = {}) {
  const id = String(args.id ?? '').trim();
  if (!id) throw new Error('A public Gallery asset id or slug is required.');
  const item = await fetchPublicGalleryJson(publicGalleryUrl(id));
  const normalized = normalizePublicGalleryItem({
    ...item,
    download: item.documentUrl ?? null,
    thumbnail: item.thumbnail ?? null,
    url: item.url ?? `/c/${item.slug ?? id}`,
  }, args);
  return {
    ...normalized,
    document: item.document ?? null,
    files: Array.isArray(item.files) ? item.files : [],
  };
}

function summarizeCatalogEntry(entry) {
  const metadata = entry.metadata && typeof entry.metadata === 'object' && !Array.isArray(entry.metadata)
    ? entry.metadata
    : {};
  const searchableMetadata = Object.fromEntries([
    'catalog',
    'dimensionsMeters',
    'familyId',
    'profileId',
    'taxonomy',
    'releaseWave',
    'revision',
    'recipeHash',
  ].flatMap((key) => metadata[key] == null ? [] : [[key, metadata[key]]]));
  return {
    cluster: entry.cluster,
    description: entry.description ?? null,
    id: entry.id,
    kind: entry.kind,
    label: entry.label,
    managementId: entry._local?.creationId ?? entry.id,
    source: entry.source ?? 'builtin',
    tags: entry.tags ?? [],
    thumbnail: entry.thumbnail ?? null,
    ...(Object.keys(searchableMetadata).length > 0 ? { metadata: searchableMetadata } : {}),
  };
}

function summarizeStorageDocument(entry) {
  return {
    cluster: entry.cluster,
    id: entry.id,
    kind: entry.kind,
    label: entry.label,
    source: entry.source,
    storageKey: entry.key,
    tags: Array.isArray(entry.document?.tags) ? entry.document.tags : [],
  };
}

function normalizeOfficialCatalogAsset(asset) {
  const metadata = asset.metadata && typeof asset.metadata === 'object' && !Array.isArray(asset.metadata)
    ? asset.metadata
    : {};
  return {
    catalogProvider: asset.source,
    cluster: metadata.catalog ?? 'official',
    description: asset.description ?? null,
    downloadUrl: asset.download_url ?? null,
    files: asset.files ?? [],
    id: asset.id,
    kind: asset.kind,
    label: asset.name,
    license: asset.license,
    metadata,
    provenance: {
      attribution: asset.attribution ?? null,
      provider: asset.source,
      sourceId: asset.source_id ?? null,
      sourceUrl: asset.source_url ?? null,
    },
    source: 'official',
    sourceClass: 'toonlab-library',
    tags: asset.tags ?? [],
    thumbnail: asset.thumbnail_url ?? null,
  };
}

function withOfficialLabStart(asset) {
  const catalog = String(asset.metadata?.catalog ?? asset.cluster ?? '').toLowerCase();
  const isRock = catalog === 'rock' || catalog === 'rocks' || Boolean(asset.metadata?.variation?.id);
  return isRock
    ? { ...asset, labStart: createLabDocument('rock', { source: asset }) }
    : asset;
}

async function listOfficialCatalogEntries() {
  if (legacyWorkspace) return [];
  const entries = [];
  let offset = 0;
  let total = 1;
  while (offset < total) {
    const page = await listDatabaseCatalogAssets({ limit: 100, offset });
    entries.push(...page.items.map(normalizeOfficialCatalogAsset));
    total = page.total;
    offset += page.items.length;
    if (page.items.length === 0) break;
  }
  return entries;
}

async function allAssets(source = null) {
  const includes = (candidate) => source == null || source === candidate;
  const [library, official, storage, files] = await Promise.all([
    includes('library') ? listLibraryEntries(workspace) : [],
    includes('official') ? listOfficialCatalogEntries() : [],
    includes('workspace-storage') ? listStorageDocuments(workspace) : [],
    includes('workspace') ? listWorkspaceFiles(workspace) : [],
  ]);
  return [
    ...(includes('builtin') ? publicMcpCatalogEntries().map((entry) => ({ ...entry, source: 'builtin' })) : []),
    ...library.map((entry) => ({ ...entry, source: 'library' })),
    ...official,
    ...storage,
    ...files,
  ];
}

async function findAsset(id, source = null) {
  const assets = await allAssets(source);
  return assets.find((entry) => (
    (entry.id === id || entry._local?.creationId === id)
    && (!source || entry.source === source)
  )) ?? null;
}

async function findEditableAsset(id, type = null) {
  const library = (await listLibraryEntries(workspace)).filter((entry) => (
    (entry.id === id || entry._local?.creationId === id)
    && (!type || entry.type === type)
  ));
  if (library.length > 1) {
    throw new Error(
      `Creation document key "${id}" is ambiguous across types (${library.map((entry) => entry.type).join(', ')}). Use the managementId returned by list_my_creations, or pass type.`,
    );
  }
  if (library.length === 1) return { ...library[0], source: 'library' };
  const files = await listWorkspaceFiles(workspace);
  return files.find((entry) => entry.id === id) ?? null;
}

function matchesTags(entry, tags) {
  if (!Array.isArray(tags) || tags.length === 0) return true;
  const actual = new Set(normalizeCreationTags(entry.tags));
  return normalizeCreationTags(tags).every((tag) => actual.has(tag));
}

async function searchAssets(args) {
  const assets = await allAssets(args.source ?? null);
  const matched = assets.filter((entry) => {
    if (args.source && entry.source !== args.source) return false;
    if (args.cluster && entry.cluster !== args.cluster) return false;
    if (args.kind && entry.kind !== args.kind) return false;
    if (!matchesTags(entry, args.tags)) return false;
    return matchesText(entry, args.query);
  });
  const offset = Math.max(0, Math.floor(Number(args.offset) || 0));
  const limit = limitValue(args.limit);
  const results = matched.slice(offset, offset + limit);
  return {
    count: results.length,
    total: matched.length,
    offset,
    limit,
    nextOffset: offset + limit < matched.length ? offset + limit : null,
    items: results.map((entry) => {
      const summary = entry.source === 'workspace'
        ? entry
        : entry.source === 'workspace-storage'
          ? summarizeStorageDocument(entry)
          : summarizeCatalogEntry(entry);
      return normalizeDiscovery(entry, summary, args);
    }),
  };
}

async function getAsset(args) {
  if (args.source === 'official' && !legacyWorkspace) {
    const complete = await getDatabaseCatalogAsset(args.id);
    if (!complete) throw new Error(`Official asset "${args.id}" was not found.`);
    const normalized = withOfficialLabStart(normalizeOfficialCatalogAsset(complete));
    return normalizeDiscovery(normalized, normalized, args);
  }
  const asset = await findAsset(args.id, args.source);
  if (!asset) throw new Error(`Asset "${args.id}" was not found.`);
  if (asset.source === 'official' && !legacyWorkspace) {
    const complete = await getDatabaseCatalogAsset(asset.id);
    if (!complete) throw new Error(`Official asset "${args.id}" was not found.`);
    const normalized = withOfficialLabStart(normalizeOfficialCatalogAsset(complete));
    return normalizeDiscovery(normalized, normalized, args);
  }
  return normalizeDiscovery(asset, asset, args);
}

async function listMyCreations(args) {
  const [library, storage, files] = await Promise.all([
    listLibraryEntries(workspace),
    listStorageDocuments(workspace),
    listWorkspaceFiles(workspace, { roots: ['assets', 'creations', 'exports', 'imports', 'presets'] }),
  ]);
  const query = args.query ?? null;
  const matched = [
    ...library.map((entry) => summarizeCatalogEntry({ ...entry, source: 'library' })),
    ...storage.map(summarizeStorageDocument),
    ...files,
  ].filter((entry) => (
    matchesText(entry, query)
    && matchesTags(entry, args.tags)
    && (!args.kind || entry.kind === args.kind || entry.type === args.kind)
  ));
  const offset = Math.max(0, Math.floor(Number(args.offset) || 0));
  const limit = limitValue(args.limit, 50, 200);
  const items = matched.slice(offset, offset + limit);
  return {
    count: items.length,
    items,
    limit,
    nextOffset: offset + limit < matched.length ? offset + limit : null,
    offset,
    total: matched.length,
    workspace,
  };
}

async function getMyCreation(args) {
  const id = String(args.id ?? '').trim();
  const asset = await findEditableAsset(id, args.type ?? null)
    ?? await findAsset(id, 'workspace-storage');
  if (!asset || asset.source === 'builtin') throw new Error(`Workspace creation "${args.id}" was not found.`);
  if (asset.source !== 'workspace') return asset;
  const file = await readWorkspaceFile(workspace, asset.relativePath);
  if (file.data.length > 5 * 1024 * 1024) {
    return { ...asset, note: 'File is larger than 5 MB; use absolutePath to read it directly.' };
  }
  if (file.mimeType.startsWith('text/') || file.mimeType === 'application/json' || ['.gltf'].includes(extname(file.name))) {
    return { ...asset, content: file.data.toString('utf8') };
  }
  return { ...asset, base64: file.data.toString('base64'), encoding: 'base64' };
}

function mergePatch(target, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return clone(patch);
  const next = target && typeof target === 'object' && !Array.isArray(target) ? clone(target) : {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete next[key];
    else next[key] = mergePatch(next[key], value);
  }
  return next;
}

async function updateCreation(args) {
  const id = String(args.id ?? '').trim();
  const asset = await findEditableAsset(id, args.type ?? null);
  if (!asset) throw new Error(`Editable creation "${id}" was not found.`);
  const hasDocument = args.document && typeof args.document === 'object' && !Array.isArray(args.document);
  const hasPatch = args.patch && typeof args.patch === 'object' && !Array.isArray(args.patch);
  if (hasDocument && hasPatch) throw new Error('Pass document or patch, not both.');
  if (args.document !== undefined && !hasDocument) throw new Error('document must be a JSON object.');
  if (args.patch !== undefined && !hasPatch) throw new Error('patch must be a JSON object.');
  const hasMetadata = args.label !== undefined || args.description !== undefined || args.tags !== undefined;
  if (!hasDocument && !hasPatch && !hasMetadata) throw new Error('No creation changes were provided.');
  if (args.label !== undefined && !String(args.label).trim()) throw new Error('label cannot be empty.');
  if (args.tags !== undefined && !Array.isArray(args.tags)) throw new Error('tags must be an array.');
  if (asset.source === 'workspace') {
    if (!asset.relativePath?.startsWith('creations/')) {
      throw new Error('Only files below .toonlab/creations are editable through update_creation.');
    }
    const currentFile = await readWorkspaceFile(workspace, asset.relativePath);
    let currentDocument;
    try { currentDocument = JSON.parse(currentFile.data.toString('utf8')); } catch {
      throw new Error('Workspace creation is not a JSON document; replace it with save_creation instead.');
    }
    const document = hasDocument
      ? clone(args.document)
      : hasPatch ? mergePatch(currentDocument, args.patch) : clone(currentDocument);
    if (args.label !== undefined && document && typeof document === 'object') {
      document.label = String(args.label).trim().slice(0, 120);
    }
    if (args.description !== undefined && document && typeof document === 'object') {
      document.description = args.description === null ? null : String(args.description).slice(0, 2000);
    }
    if (args.tags !== undefined && document && typeof document === 'object') {
      document.tags = normalizeCreationTags(args.tags);
    }
    const file = await writeWorkspaceFile(workspace, asset.relativePath, `${JSON.stringify(document, null, 2)}\n`);
    return { creation: { ...file, document } };
  }
  const documentField = asset.document && typeof asset.document === 'object' && !Array.isArray(asset.document)
    ? 'document'
    : asset.recipe && typeof asset.recipe === 'object' && !Array.isArray(asset.recipe)
      ? 'recipe'
      : null;
  const currentDocument = documentField ? asset[documentField] : asset;
  const document = hasDocument
    ? clone(args.document)
    : hasPatch ? mergePatch(currentDocument, args.patch) : clone(currentDocument);
  const label = String(args.label ?? asset.label ?? document.label ?? document.name ?? id).trim().slice(0, 120);
  if (!label) throw new Error('label cannot be empty.');
  const next = documentField
    ? { ...asset, [documentField]: document, label }
    : { ...document, id: asset.id, label, type: asset.type ?? document.type ?? asset.kind };
  if (args.description !== undefined) next.description = String(args.description ?? '').slice(0, 2000);
  if (args.tags !== undefined) next.tags = normalizeCreationTags(args.tags);
  delete next._local;
  delete next.source;
  delete next.sourceClass;
  delete next.policyDecision;
  return { creation: await saveLibraryEntry(next) };
}

async function createLabDocumentTool(args) {
  let source = args.source;
  if (args.source_id) {
    source = await getAsset({ id: args.source_id, source: args.source_kind ?? 'official' });
  }
  return createLabDocument(args.lab, {
    docKey: args.doc_key,
    label: args.label,
    preset: args.preset,
    seed: args.seed,
    source,
    strength: args.strength,
    style: args.style,
    variation: args.variation,
  });
}

async function mutateLabCreation(args) {
  const id = String(args.id ?? '').trim();
  const asset = await findEditableAsset(id, args.type ?? null);
  if (!asset) throw new Error(`Editable creation "${id}" was not found.`);
  const expectedType = getLabFeatures(args.lab).documentContract.creationType;
  if (asset.type && asset.type !== expectedType && asset.kind !== expectedType) {
    throw new Error(`The ${args.lab} lab requires creation type "${expectedType}", not "${asset.type ?? asset.kind}".`);
  }
  let document;
  if (asset.source === 'workspace') {
    if (!asset.relativePath?.startsWith('creations/')) {
      throw new Error('Only JSON files below .toonlab/creations support semantic Lab mutation.');
    }
    const currentFile = await readWorkspaceFile(workspace, asset.relativePath);
    try { document = JSON.parse(currentFile.data.toString('utf8')); } catch {
      throw new Error('Workspace creation is not a JSON document.');
    }
  } else {
    document = asset.document && typeof asset.document === 'object'
      ? asset.document
      : asset.recipe && typeof asset.recipe === 'object'
        ? asset.recipe
        : asset;
  }
  const next = applyLabDocumentOperation(args.lab, document, args.operation, args);
  return updateCreation({ id, type: args.type ?? expectedType, document: next });
}

async function removeCreation(args) {
  if (args.confirm !== true) throw new Error('confirm must be true to delete a creation.');
  const id = String(args.id ?? '').trim();
  const asset = await findEditableAsset(id, args.type ?? null);
  if (!asset) throw new Error(`Editable creation "${id}" was not found.`);
  if (asset.source === 'workspace') {
    if (!asset.relativePath?.startsWith('creations/')) {
      throw new Error('Only files below .toonlab/creations can be deleted as creations.');
    }
    return { deleted: await deleteWorkspaceFile(asset.relativePath), id };
  }
  return { deleted: await deleteLibraryEntry(asset, args.type ?? null), id };
}

function validLabStateKey(value) {
  const key = String(value ?? '').trim();
  if (!/^(?:toonlab|threejs-toon-shader)\.[a-z0-9._-]{1,240}$/i.test(key) || !isPersistableStorageKey(key)) {
    throw new Error('Lab-state keys must be a non-secret ToonLab browser key using the "toonlab." or "threejs-toon-shader." prefix.');
  }
  return key;
}

function parseLabStateValue(value) {
  try { return JSON.parse(value); } catch { return value; }
}

async function listLabState(args) {
  const entries = await readLabStateEntries();
  const query = String(args.query ?? '').trim().toLowerCase();
  const items = Object.entries(entries)
    .filter(([key]) => isPersistableStorageKey(key))
    .filter(([key]) => !query || key.toLowerCase().includes(query))
    .map(([key, value]) => ({ key, value: parseLabStateValue(value) }));
  return { count: items.length, items };
}

async function getLabState(args) {
  const key = validLabStateKey(args.key);
  const entries = await readLabStateEntries();
  if (!(key in entries)) throw new Error(`Lab-state entry "${key}" was not found.`);
  return { key, value: parseLabStateValue(entries[key]) };
}

async function putLabState(args) {
  const key = validLabStateKey(args.key);
  if (args.value === undefined) throw new Error('value is required.');
  const serialized = typeof args.value === 'string' ? args.value : JSON.stringify(args.value);
  if (Buffer.byteLength(serialized, 'utf8') > 4 * 1024 * 1024) {
    throw new Error('Lab-state value exceeds the 4 MB limit.');
  }
  await setLabStateEntry(key, serialized);
  return { key, value: parseLabStateValue(serialized) };
}

async function removeLabState(args) {
  if (args.confirm !== true) throw new Error('confirm must be true to delete lab state.');
  const key = validLabStateKey(args.key);
  const entries = await readLabStateEntries();
  if (!(key in entries)) return { deleted: false, key };
  await deleteLabStateEntry(key);
  return { deleted: true, key };
}

async function generateAsset(args) {
  const entry = publicMcpCatalogEntries().find((item) => item.id === args.catalog_id);
  if (!entry) throw new Error(`Unknown built-in catalog asset "${args.catalog_id}".`);
  const policyDecision = evaluateAssetCandidate(args.policy ?? null, {
    domain: args.domain ?? entry.domain ?? entry.cluster ?? '',
    sourceClass: 'procedural',
  });
  if (!policyDecision.allowed) throw new Error(policyDecision.reason);
  const seed = Number.isFinite(Number(args.seed)) ? Number(args.seed) : Math.floor(Math.random() * 1_000_000);
  const name = String(args.name ?? `${entry.label} ${seed}`);
  const document = {
    catalog: {
      cluster: entry.cluster,
      id: entry.id,
      kind: entry.kind,
      label: entry.label,
    },
    generatedAt: new Date().toISOString(),
    recipe: withSeed(entry.recipe, seed),
    schema: 'toonlab/generated-asset',
    seed,
    spawn: entry.spawn,
    version: 1,
  };
  const file = args.save === false ? null : await saveCreation(workspace, {
    document,
    kind: entry.cluster,
    name,
  });
  return {
    document,
    file,
    policyDecision,
    next: entry.cluster === 'water' || entry.cluster === 'sky' || entry.cluster === 'post' || entry.cluster === 'toon'
      ? 'Use the spawn snippet in your project; this is a settings preset.'
      : 'Open the matching ToonLab lab to preview or export this recipe as GLB.',
  };
}

function compactCc0Ref(ref) {
  return {
    attribution: ref.attribution,
    authors: ref.authors,
    categories: ref.categories,
    id: ref.id,
    kind: ref.kind,
    name: ref.name,
    pageUrl: ref.pageUrl,
    source: ref.source,
    tags: ref.tags,
    thumbnailUrl: ref.thumbnailUrl,
    animeStyleSupport: 'needs-in-scene-review',
    assetKind: ref.kind,
    license: ref.attribution?.license ?? 'CC0',
    provenance: ref.attribution ?? null,
    sourceClass: 'external-cc0',
  };
}

function polyhavenType(kind) {
  return { hdri: 'hdris', model: 'models', texture: 'textures' }[kind] ?? 'models';
}

function ambientcgType(kind) {
  return { hdri: 'HDRI', model: 'Model', texture: 'Material' }[kind] ?? 'Model';
}

async function searchCc0Assets(args) {
  const provider = args.provider ?? 'all';
  const kind = args.kind ?? 'model';
  const limit = limitValue(args.limit, 20, 50);
  const searches = [];
  if (provider === 'all' || provider === 'polyhaven') {
    searches.push((async () => {
      const refs = await fetchPolyhavenIndex({ type: polyhavenType(kind) });
      return filterAssetRefs(refs, { kind, text: args.query ?? null }).slice(0, limit);
    })());
  }
  if (provider === 'all' || provider === 'ambientcg') {
    searches.push(searchAmbientcg({
      limit,
      query: args.query ?? '',
      type: ambientcgType(kind),
    }));
  }
  if (searches.length === 0) throw new Error('provider must be all, polyhaven, or ambientcg.');
  const settled = await Promise.allSettled(searches);
  const results = settled.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
  const errors = settled.flatMap((result) => result.status === 'rejected' ? [result.reason?.message ?? String(result.reason)] : []);
  return {
    count: Math.min(results.length, limit),
    errors,
    items: results.slice(0, limit).map((ref) => ({
      ...compactCc0Ref(ref),
      policyDecision: evaluateAssetCandidate(args.policy ?? null, {
        domain: args.domain ?? '',
        sourceClass: 'external-cc0',
      }),
    })),
  };
}

async function getCc0AssetDetails(args) {
  const {
    domain = '',
    id,
    kind = 'model',
    policy = null,
    provider,
    resolution = '1k',
  } = args;
  const policyDecision = evaluateAssetCandidate(policy, {
    domain,
    sourceClass: 'external-cc0',
  });
  if (provider === 'ambientcg') {
    const [ref] = await searchAmbientcg({ id });
    if (!ref) throw new Error(`ambientCG asset "${id}" was not found.`);
    const download = resolveAmbientcgDownload(ref, { resolution: resolution.toUpperCase() });
    return { download, policyDecision, ref: compactCc0Ref(ref) };
  }
  if (provider === 'polyhaven') {
    const refs = await fetchPolyhavenIndex({ type: polyhavenType(kind) });
    const ref = refs.find((item) => item.id === id);
    if (!ref) throw new Error(`Poly Haven asset "${id}" was not found.`);
    const files = await fetchPolyhavenFiles(id);
    const download = kind === 'model'
      ? resolvePolyhavenModelDownload(files, { resolution })
      : kind === 'texture'
        ? resolvePolyhavenTextureDownload(files, { resolution })
        : null;
    return { download, policyDecision, ref: compactCc0Ref(ref) };
  }
  throw new Error('provider must be polyhaven or ambientcg.');
}

async function fetchBytes(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed with ${response.status}: ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

function filenameFromUrl(url, fallback) {
  try {
    return basename(new URL(url).pathname) || fallback;
  } catch {
    return fallback;
  }
}

async function importCc0Asset(args) {
  const policyDecision = evaluateAssetCandidate(args.policy ?? null, {
    domain: args.domain ?? '',
    sourceClass: 'external-cc0',
  });
  if (!policyDecision.allowed) throw new Error(policyDecision.reason);
  const details = await getCc0AssetDetails(args);
  if (!details.download) {
    throw new Error('This asset kind does not yet expose a direct downloadable bundle. Use get_cc0_asset for its source page.');
  }
  const folder = `imports/${args.provider}/${String(args.id).replace(/[^a-z0-9._-]+/gi, '-')}`;
  const files = [];
  if (args.provider === 'ambientcg') {
    const name = filenameFromUrl(details.download.url, `${args.id}.zip`);
    files.push(await writeWorkspaceFile(workspace, `${folder}/${name}`, await fetchBytes(details.download.url)));
  } else if (details.download.url) {
    const name = filenameFromUrl(details.download.url, `${args.id}.gltf`);
    files.push(await writeWorkspaceFile(workspace, `${folder}/${name}`, await fetchBytes(details.download.url)));
    for (const [relativePath, url] of Object.entries(details.download.resources ?? {})) {
      files.push(await writeWorkspaceFile(workspace, `${folder}/${relativePath}`, await fetchBytes(url)));
    }
  } else {
    for (const [slot, file] of Object.entries(details.download.maps ?? {})) {
      const name = filenameFromUrl(file.url, `${slot}.jpg`);
      files.push(await writeWorkspaceFile(workspace, `${folder}/${name}`, await fetchBytes(file.url)));
    }
  }
  const manifest = await writeWorkspaceFile(workspace, `${folder}/toonlab-import.json`, `${JSON.stringify({
    importedAt: new Date().toISOString(),
    ...details,
  }, null, 2)}\n`);
  return { ...details, files: [...files, manifest], policyDecision, workspace };
}

async function recordAssetGap(args) {
  const record = createAssetGapRecord(args);
  const reportsDirectory = join(workspace, 'reports');
  const jsonPath = join(reportsDirectory, 'style-asset-gaps.json');
  const markdownPath = join(reportsDirectory, 'asset-gaps.md');
  let records = [];
  try {
    const existing = JSON.parse(await readFile(jsonPath, 'utf8'));
    records = Array.isArray(existing.records) ? existing.records : [];
  } catch {
    records = [];
  }
  const next = records.filter((entry) => entry.id !== record.id);
  next.push(record);
  next.sort((left, right) => left.id.localeCompare(right.id));
  await mkdir(reportsDirectory, { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify({
    records: next,
    schema: 'toonlab/asset-gap-report',
    version: 1,
  }, null, 2)}\n`, 'utf8');
  await writeFile(markdownPath, renderAssetGapReport(next), 'utf8');
  return { jsonPath, markdownPath, record, total: next.length };
}

const TOOLS = [
  ...['inspect', 'audit', 'plan', 'apply', 'verify'].map((operation) => ({
    annotations: {
      destructiveHint: false,
      idempotentHint: true,
      readOnlyHint: operation !== 'apply',
    },
    description: `${operation[0].toUpperCase()}${operation.slice(1)} a portable ToonLab scene-style manifest with the same contract used by the toonlab CLI.`,
    inputSchema: {
      additionalProperties: false,
      properties: {
        bundle: { default: 'call-me-sensei', type: ['string', 'object'] },
        manifest: { type: 'object' },
        mode: { default: 'advisory', enum: ['strict', 'advisory'], type: 'string' },
      },
      required: ['manifest'],
      type: 'object',
    },
    name: `${operation}_scene_style`,
    title: `${operation[0].toUpperCase()}${operation.slice(1)} scene style`,
  })),
  {
    annotations: { readOnlyHint: true },
    description: 'Return ToonLab\'s anime-game art direction, canonical Call Me Sensei bundle, and explicit shader-routing table.',
    inputSchema: { additionalProperties: false, properties: {}, type: 'object' },
    name: 'get_anime_game_profile',
    title: 'Get ToonLab anime-game profile',
  },
  {
    annotations: { readOnlyHint: true },
    description: 'Show the local .toonlab workspace path, migration status, and item counts.',
    inputSchema: { additionalProperties: false, properties: {}, type: 'object' },
    name: 'get_workspace_info',
    title: 'Get ToonLab workspace info',
  },
  {
    annotations: { readOnlyHint: true },
    description: 'List every public Beta Lab going live, its portable creation types, runtime package, management operations, and editable feature count.',
    inputSchema: { additionalProperties: false, properties: {}, type: 'object' },
    name: 'list_live_labs',
    title: 'List live ToonLab labs',
  },
  {
    annotations: { readOnlyHint: true },
    description: 'Return the complete machine-readable feature/settings schema plus the portable document discriminator, version, identity paths, JSON envelope, and a valid starter document for one live lab.',
    inputSchema: {
      additionalProperties: false,
      properties: { lab: { enum: LIVE_LAB_IDS, type: 'string' } },
      required: ['lab'],
      type: 'object',
    },
    name: 'get_lab_features',
    title: 'Get all editable lab features',
  },
  {
    annotations: { destructiveHint: false, idempotentHint: true, readOnlyHint: true },
    description: 'Build a validated portable starter document for any live Lab. A Rock source_id returned by official asset search loads that GLB template as the editable starting mesh instead of generating unrelated geometry.',
    inputSchema: {
      additionalProperties: false,
      properties: {
        doc_key: { type: 'string' },
        lab: { enum: LIVE_LAB_IDS, type: 'string' },
        label: { type: 'string' },
        preset: { type: 'string' },
        seed: { type: 'integer' },
        source: { type: 'object' },
        source_id: { type: 'string' },
        source_kind: { enum: ['official', 'library'], type: 'string' },
        strength: { maximum: 1, minimum: 0, type: 'number' },
        style: { type: 'string' },
        variation: { minimum: 0, type: 'integer' },
      },
      required: ['lab'],
      type: 'object',
    },
    name: 'create_lab_document',
    title: 'Create a Lab starter document',
  },
  {
    annotations: { readOnlyHint: true },
    description: 'Search approved built-in generator/settings entries, the local released official catalog, saved library entries, lab presets, and files on disk. Official rock summaries include compact dimensions and taxonomy metadata; follow nextOffset until null.',
    inputSchema: {
      additionalProperties: false,
      properties: {
        cluster: { type: 'string' },
        domain: { type: 'string' },
        kind: { type: 'string' },
        limit: { maximum: 100, minimum: 1, type: 'integer' },
        offset: { minimum: 0, type: 'integer' },
        policy: { type: 'object' },
        query: { type: 'string' },
        source: { enum: ['builtin', 'official', 'library', 'workspace', 'workspace-storage'], type: 'string' },
        tags: { items: { type: 'string' }, type: 'array' },
      },
      type: 'object',
    },
    name: 'search_assets',
    title: 'Search ToonLab assets',
  },
  {
    annotations: { openWorldHint: true, readOnlyHint: true },
    description: 'Search public ToonLab Gallery creations with their license, attribution, tags, thumbnail, and immutable portable-document URL. Authored tree recipes live here rather than in npm; use type="tree-recipe" and follow nextOffset until null.',
    inputSchema: {
      additionalProperties: false,
      properties: {
        domain: { type: 'string' },
        limit: { maximum: 60, minimum: 1, type: 'integer' },
        offset: { minimum: 0, type: 'integer' },
        policy: { type: 'object' },
        query: { type: 'string' },
        type: { type: 'string' },
      },
      type: 'object',
    },
    name: 'search_public_gallery',
    title: 'Search the ToonLab public Gallery',
  },
  {
    annotations: { openWorldHint: true, readOnlyHint: true },
    description: 'Get one public ToonLab Gallery creation by publication id or slug, including its complete portable document and immutable public files.',
    inputSchema: {
      additionalProperties: false,
      properties: {
        domain: { type: 'string' },
        id: { type: 'string' },
        policy: { type: 'object' },
      },
      required: ['id'],
      type: 'object',
    },
    name: 'get_public_gallery_asset',
    title: 'Get a ToonLab public Gallery asset',
  },
  {
    annotations: { readOnlyHint: true },
    description: 'Get a complete asset, recipe, preset, library entry, or workspace file descriptor by id.',
    inputSchema: {
      additionalProperties: false,
      properties: {
        domain: { type: 'string' },
        id: { type: 'string' },
        policy: { type: 'object' },
        source: { type: 'string' },
      },
      required: ['id'],
      type: 'object',
    },
    name: 'get_asset',
    title: 'Get a ToonLab asset',
  },
  {
    annotations: { readOnlyHint: true },
    description: 'Search the developer\'s saved library, lab documents, presets, imports, and exports by text, exact tags, or kind. Paginate with nextOffset.',
    inputSchema: {
      additionalProperties: false,
      properties: {
        kind: { type: 'string' },
        limit: { maximum: 200, minimum: 1, type: 'integer' },
        offset: { minimum: 0, type: 'integer' },
        query: { type: 'string' },
        tags: { items: { type: 'string' }, maxItems: 10, type: 'array' },
      },
      type: 'object',
    },
    name: 'list_my_creations',
    title: 'List my ToonLab creations',
  },
  {
    annotations: { readOnlyHint: true },
    description: 'Read a saved creation or small workspace file. Prefer the immutable managementId returned by list_my_creations; type disambiguates legacy document keys. Binary files are returned as base64 and always include a direct absolute path.',
    inputSchema: {
      additionalProperties: false,
      properties: { id: { type: 'string' }, type: { type: 'string' } },
      required: ['id'],
      type: 'object',
    },
    name: 'get_my_creation',
    title: 'Get my ToonLab creation',
  },
  {
    annotations: { destructiveHint: false, idempotentHint: true },
    description: 'Save a JSON or text creation into .toonlab/creations so labs and coding agents can share it.',
    inputSchema: {
      additionalProperties: false,
      properties: {
        document: {},
        description: { type: ['string', 'null'] },
        filename: { type: 'string' },
        kind: { type: 'string' },
        name: { type: 'string' },
        tags: { items: { maxLength: 32, type: 'string' }, maxItems: 10, type: 'array' },
      },
      required: ['document', 'name'],
      type: 'object',
    },
    name: 'save_creation',
    title: 'Save a ToonLab creation',
  },
  {
    annotations: { destructiveHint: false, idempotentHint: true },
    description: 'Replace or JSON-merge-patch any editable creation in the local OSS library. Local workspaces have no ownership boundary.',
    inputSchema: {
      additionalProperties: false,
      properties: {
        description: { type: ['string', 'null'] },
        document: { type: 'object' },
        id: { description: 'Immutable managementId from list_my_creations, or an unambiguous document key.', type: 'string' },
        label: { type: 'string' },
        patch: { description: 'RFC 7396 JSON merge patch applied to the portable document.', type: 'object' },
        tags: { items: { maxLength: 32, type: 'string' }, maxItems: 10, type: 'array' },
        type: { description: 'Creation type used to disambiguate a legacy document key.', type: 'string' },
      },
      required: ['id'],
      type: 'object',
    },
    name: 'update_creation',
    title: 'Update any local creation',
  },
  {
    annotations: { destructiveHint: false, idempotentHint: false },
    description: 'Apply one validated Lab operation to a saved portable creation. Supports set_feature for all 15 Labs and structural Rock operations advertised by get_lab_features.',
    inputSchema: {
      additionalProperties: false,
      properties: {
        edit: { type: 'object' },
        finish: { type: 'string' },
        id: { type: 'string' },
        lab: { enum: LIVE_LAB_IDS, type: 'string' },
        operation: { type: 'string' },
        path: { type: 'string' },
        piece: {},
        pieceId: { type: 'string' },
        pieceIndex: { minimum: 0, type: 'integer' },
        settings: { type: 'object' },
        source: { type: 'object' },
        toIndex: { minimum: 0, type: 'integer' },
        type: { type: 'string' },
        value: {},
      },
      required: ['id', 'lab', 'operation'],
      type: 'object',
    },
    name: 'mutate_lab_creation',
    title: 'Apply a semantic Lab edit',
  },
  {
    annotations: { destructiveHint: true, idempotentHint: true },
    description: 'Delete any editable creation from the local OSS library. Requires confirm=true.',
    inputSchema: {
      additionalProperties: false,
      properties: {
        confirm: { const: true, type: 'boolean' },
        id: { description: 'Immutable managementId from list_my_creations, or an unambiguous document key.', type: 'string' },
        type: { description: 'Creation type used to disambiguate a legacy document key.', type: 'string' },
      },
      required: ['id', 'confirm'],
      type: 'object',
    },
    name: 'delete_creation',
    title: 'Delete any local creation',
  },
  {
    annotations: { readOnlyHint: true },
    description: 'List raw persisted lab-state entries. This OSS-only surface covers drafts and lab collections that are not yet normalized creations.',
    inputSchema: {
      additionalProperties: false,
      properties: { query: { type: 'string' } },
      type: 'object',
    },
    name: 'list_lab_state',
    title: 'List local lab state',
  },
  {
    annotations: { readOnlyHint: true },
    description: 'Read one raw persisted ToonLab lab-state entry by its localStorage-compatible key.',
    inputSchema: {
      additionalProperties: false,
      properties: { key: { type: 'string' } },
      required: ['key'],
      type: 'object',
    },
    name: 'get_lab_state',
    title: 'Get local lab state',
  },
  {
    annotations: { destructiveHint: false, idempotentHint: true },
    description: 'Create or replace any non-secret ToonLab lab-state entry in the local OSS workspace.',
    inputSchema: {
      additionalProperties: false,
      properties: { key: { type: 'string' }, value: {} },
      required: ['key', 'value'],
      type: 'object',
    },
    name: 'set_lab_state',
    title: 'Set local lab state',
  },
  {
    annotations: { destructiveHint: true, idempotentHint: true },
    description: 'Delete one raw lab-state entry from the local OSS workspace. Requires confirm=true.',
    inputSchema: {
      additionalProperties: false,
      properties: { confirm: { const: true, type: 'boolean' }, key: { type: 'string' } },
      required: ['key', 'confirm'],
      type: 'object',
    },
    name: 'delete_lab_state',
    title: 'Delete local lab state',
  },
  {
    annotations: { destructiveHint: false, idempotentHint: false },
    description: 'Generate a deterministic editable asset recipe from a built-in ToonLab catalog entry and optionally save it to disk.',
    inputSchema: {
      additionalProperties: false,
      properties: {
        catalog_id: { type: 'string' },
        domain: { type: 'string' },
        name: { type: 'string' },
        policy: { type: 'object' },
        save: { default: true, type: 'boolean' },
        seed: { type: 'integer' },
      },
      required: ['catalog_id'],
      type: 'object',
    },
    name: 'generate_asset',
    title: 'Generate a procedural ToonLab asset',
  },
  {
    annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: true },
    description: 'Start local managed image, Fal Patina PBR material, or 3D generation with user-configured provider keys. Material jobs preserve the seamless preview and typed PBR maps as one durable local bundle.',
    inputSchema: {
      additionalProperties: false,
      properties: {
        aspect_ratio: { default: '1:1', enum: ['1:1', '16:9', '9:16', '4:3', '3:4'], type: 'string' },
        domain: { maxLength: 120, minLength: 1, type: 'string' },
        gap_id: { description: 'ID returned by record_asset_gap.', minLength: 1, type: 'string' },
        image_model: { enum: ['nano-banana-2-lite', 'nano-banana-2', 'nano-banana-pro'], type: 'string' },
        kind: { enum: ['image', 'texture_image', 'concept_image', 'material', 'text_to_model', 'image_to_model', 'multiview_to_model', 'model_segment'], type: 'string' },
        model_provider: { default: 'meshy', enum: ['meshy', 'tripo'], type: 'string' },
        policy: { description: 'Developer-approved asset-sourcing policy.', type: 'object' },
        prompt: { maxLength: 600, type: 'string' },
        reference_paths: { items: { type: 'string' }, maxItems: 6, type: 'array' },
        resolution: { default: '1k', enum: ['1k', '2k', '4k', '8k'], type: 'string' },
        maps: { description: 'material only; empty skips PBR estimation.', items: { enum: ['basecolor', 'normal', 'roughness', 'metalness', 'height'], type: 'string' }, maxItems: 5, type: 'array' },
        image_size: { description: 'material only; a Patina preset or {width,height}.', oneOf: [{ enum: ['square_hd', 'square', 'portrait_4_3', 'portrait_16_9', 'landscape_4_3', 'landscape_16_9'], type: 'string' }, { additionalProperties: false, properties: { width: { maximum: 2048, minimum: 256, type: 'integer' }, height: { maximum: 2048, minimum: 256, type: 'integer' } }, required: ['width', 'height'], type: 'object' }] },
        upscale_factor: { enum: [0, 2, 4], type: 'integer' },
        tiling_mode: { enum: ['both', 'horizontal', 'vertical'], type: 'string' },
        output_format: { enum: ['png', 'jpeg', 'webp'], type: 'string' },
        num_images: { maximum: 4, minimum: 1, type: 'integer' },
        num_inference_steps: { maximum: 8, minimum: 1, type: 'integer' },
        enable_prompt_expansion: { type: 'boolean' },
        enable_safety_checker: { type: 'boolean' },
        tile_size: { maximum: 256, minimum: 32, type: 'integer' },
        tile_stride: { maximum: 128, minimum: 16, type: 'integer' },
        seed: { type: 'integer' },
        image_url: { description: 'material only; public HTTPS source texture.', format: 'uri', type: 'string' },
        mask_url: { description: 'material only; public HTTPS inpainting mask. Requires image_url.', format: 'uri', type: 'string' },
        strength: { maximum: 1, minimum: 0, type: 'number' },
        source_image_path: { description: 'Workspace object path for image_to_model.', type: 'string' },
        source_job_id: { description: 'Succeeded image job for image_to_model, or Tripo model job for model_segment.', type: 'string' },
        style: { default: 'stylized', enum: ['stylized', 'cartoon', 'raw'], type: 'string' },
        view_paths: { description: 'multiview_to_model only: [front, left, back, right]. Front plus at least one other view is required.', items: { type: ['string', 'null'] }, maxItems: 4, type: 'array' },
      },
      required: ['kind', 'domain', 'policy', 'gap_id'],
      type: 'object',
    },
    name: 'generate_ai_asset',
    title: 'Generate an image, PBR material, or 3D asset with local provider keys',
  },
  {
    annotations: { readOnlyHint: true, openWorldHint: true },
    description: 'Poll one local managed generation job. Async Meshy/Tripo tasks are advanced and completed provider files are downloaded into the local workspace.',
    inputSchema: {
      additionalProperties: false,
      properties: { job_id: { type: 'string' } },
      required: ['job_id'],
      type: 'object',
    },
    name: 'get_generation_job',
    title: 'Get a local generation job',
  },
  {
    annotations: { readOnlyHint: true, openWorldHint: true },
    description: 'Poll up to 20 known local generation jobs, or list recent jobs when job_ids is omitted.',
    inputSchema: {
      additionalProperties: false,
      properties: {
        job_ids: { items: { type: 'string' }, maxItems: 20, minItems: 1, type: 'array' },
        kind: { type: 'string' },
        limit: { maximum: 100, minimum: 1, type: 'integer' },
        query: { type: 'string' },
      },
      type: 'object',
    },
    name: 'get_generation_jobs',
    title: 'Get local generation jobs',
  },
  {
    annotations: { destructiveHint: false, idempotentHint: true },
    description: 'Save a succeeded local 3D model or PBR material job into the editable ToonLab library with provider provenance and durable local files.',
    inputSchema: {
      additionalProperties: false,
      properties: { job_id: { type: 'string' }, label: { maxLength: 120, type: 'string' } },
      required: ['job_id'],
      type: 'object',
    },
    name: 'save_generated_asset',
    title: 'Save a generated model or material',
  },
  {
    annotations: { openWorldHint: true, readOnlyHint: true },
    description: 'Search CC0 models, textures, or HDRIs from Poly Haven and ambientCG.',
    inputSchema: {
      additionalProperties: false,
      properties: {
        domain: { type: 'string' },
        kind: { enum: ['model', 'texture', 'hdri'], type: 'string' },
        limit: { maximum: 50, minimum: 1, type: 'integer' },
        policy: { type: 'object' },
        provider: { enum: ['all', 'polyhaven', 'ambientcg'], type: 'string' },
        query: { type: 'string' },
      },
      type: 'object',
    },
    name: 'search_cc0_assets',
    title: 'Search public CC0 assets',
  },
  {
    annotations: { openWorldHint: true, readOnlyHint: true },
    description: 'Resolve source, attribution, and download metadata for one CC0 asset.',
    inputSchema: {
      additionalProperties: false,
      properties: {
        domain: { type: 'string' },
        id: { type: 'string' },
        kind: { enum: ['model', 'texture', 'hdri'], type: 'string' },
        policy: { type: 'object' },
        provider: { enum: ['polyhaven', 'ambientcg'], type: 'string' },
        resolution: { default: '1k', type: 'string' },
      },
      required: ['provider', 'id'],
      type: 'object',
    },
    name: 'get_cc0_asset',
    title: 'Get a public CC0 asset',
  },
  {
    annotations: { destructiveHint: false, openWorldHint: true },
    description: 'Download a CC0 asset and attribution manifest into .toonlab/imports for direct use by the project.',
    inputSchema: {
      additionalProperties: false,
      properties: {
        domain: { type: 'string' },
        id: { type: 'string' },
        kind: { enum: ['model', 'texture', 'hdri'], type: 'string' },
        policy: { type: 'object' },
        provider: { enum: ['polyhaven', 'ambientcg'], type: 'string' },
        resolution: { default: '1k', type: 'string' },
      },
      required: ['provider', 'id'],
      type: 'object',
    },
    name: 'import_cc0_asset',
    title: 'Import a public CC0 asset',
  },
  {
    annotations: { readOnlyHint: true },
    description: 'Validate a strict, advisory, or open sourcing policy and evaluate whether one candidate may be selected.',
    inputSchema: {
      additionalProperties: false,
      properties: {
        candidate: {
          additionalProperties: false,
          properties: {
            domain: { type: 'string' },
            sourceClass: { enum: ASSET_SOURCE_CLASSES, type: 'string' },
          },
          required: ['domain', 'sourceClass'],
          type: 'object',
        },
        policy: { type: 'object' },
      },
      required: ['candidate'],
      type: 'object',
    },
    name: 'validate_asset_candidate',
    title: 'Validate an asset candidate',
  },
  {
    annotations: { destructiveHint: false, idempotentHint: true },
    description: 'Record why a custom shader or asset was required and regenerate JSON plus Markdown feedback reports.',
    inputSchema: {
      additionalProperties: false,
      properties: {
        approvedBy: { type: ['string', 'null'] },
        attempts: { items: { type: 'object' }, type: 'array' },
        bundleSlot: { type: ['string', 'null'] },
        customImplementation: {},
        domain: { type: 'string' },
        feedbackNeeded: { type: 'string' },
        id: { type: 'string' },
        kind: { type: 'string' },
        provenance: {},
        reason: { type: 'string' },
        status: { type: 'string' },
        targetId: { type: ['string', 'null'] },
      },
      required: ['id', 'domain', 'kind', 'reason'],
      type: 'object',
    },
    name: 'record_asset_gap',
    title: 'Record a custom asset or shader gap',
  },
  {
    annotations: { readOnlyHint: true },
    description: 'Explain what asset generation is available in the open-source local server.',
    inputSchema: { additionalProperties: false, properties: {}, type: 'object' },
    name: 'get_generation_capabilities',
    title: 'Get local generation capabilities',
  },
];

async function callTool(name, args = {}) {
  switch (name) {
    case 'inspect_scene_style': return runSceneStyleOperation('inspect', args.manifest, args);
    case 'audit_scene_style': return runSceneStyleOperation('audit', args.manifest, args);
    case 'plan_scene_style': return runSceneStyleOperation('plan', args.manifest, args);
    case 'apply_scene_style': return runSceneStyleOperation('apply', args.manifest, args);
    case 'verify_scene_style': return runSceneStyleOperation('verify', args.manifest, args);
    case 'get_anime_game_profile': return {
      artDirection: TOONLAB_ANIME_GAME_PROFILE,
      defaultStyleBundle: CALL_ME_SENSEI_STYLE_BUNDLE,
      product: 'Anime-style game, character, and environment development for Three.js',
      routing: STYLE_DOMAIN_SLOT_ROUTES,
    };
    case 'get_workspace_info': return getWorkspaceInfo(workspace);
    case 'list_live_labs': return listLiveLabs();
    case 'get_lab_features': return getLabFeatures(args.lab);
    case 'create_lab_document': return createLabDocumentTool(args);
    case 'search_assets': return searchAssets(args);
    case 'search_public_gallery': return searchPublicGallery(args);
    case 'get_public_gallery_asset': return getPublicGalleryAsset(args);
    case 'get_asset': return getAsset(args);
    case 'list_my_creations': return listMyCreations(args);
    case 'get_my_creation': return getMyCreation(args);
    case 'save_creation': return saveCreation(workspace, args);
    case 'update_creation': return updateCreation(args);
    case 'mutate_lab_creation': return mutateLabCreation(args);
    case 'delete_creation': return removeCreation(args);
    case 'list_lab_state': return listLabState(args);
    case 'get_lab_state': return getLabState(args);
    case 'set_lab_state': return putLabState(args);
    case 'delete_lab_state': return removeLabState(args);
    case 'generate_asset': return generateAsset(args);
    case 'generate_ai_asset': {
      if (!String(args.gap_id ?? '').trim()) throw new Error('record_asset_gap is required before managed generation.');
      const policyDecision = evaluateAssetCandidate(args.policy ?? null, {
        domain: args.domain ?? '',
        sourceClass: 'custom',
      });
      if (!policyDecision.allowed) throw new Error(policyDecision.reason);
      const job = await startManagedGeneration(workspace, args);
      return {
        job,
        policyDecision,
        pollAfterMs: 5_000,
        next: job.status === 'running'
          ? 'Poll get_generation_job until succeeded, failed, or cancelled; then save a succeeded model or material job if it belongs in the Library.'
          : 'The provider completed inline. Save a succeeded model or material job if it belongs in the Library.',
      };
    }
    case 'get_generation_job': {
      const job = await getManagedGeneration(workspace, String(args.job_id ?? ''));
      if (!job) throw new Error('Generation job not found.');
      return { job, pollAfterMs: job.status === 'running' ? 5_000 : null };
    }
    case 'get_generation_jobs': {
      const ids = Array.isArray(args.job_ids) ? [...new Set(args.job_ids.map(String))].slice(0, 20) : [];
      const jobs = ids.length
        ? (await Promise.all(ids.map((id) => getManagedGeneration(workspace, id)))).filter(Boolean)
        : await listManagedGenerations({ kind: args.kind ?? '', limit: args.limit ?? 60, q: args.query ?? '' });
      return { jobs, pollAfterMs: jobs.some((job) => job.status === 'running') ? 5_000 : null };
    }
    case 'save_generated_asset': return {
      creation: await saveManagedGeneration(String(args.job_id ?? ''), { label: args.label }),
    };
    case 'search_cc0_assets': return searchCc0Assets(args);
    case 'get_cc0_asset': return getCc0AssetDetails(args);
    case 'import_cc0_asset': return importCc0Asset(args);
    case 'validate_asset_candidate': {
      const policyValidation = args.policy
        ? validateAssetSourcingPolicy(args.policy)
        : { ok: true, value: null };
      return {
        availableModes: ASSET_POLICY_MODES,
        policyValidation,
        result: policyValidation.ok
          ? evaluateAssetCandidate(policyValidation.value, args.candidate)
          : { allowed: false, decision: 'deny', reason: policyValidation.errors.join(' ') },
      };
    }
    case 'record_asset_gap': return recordAssetGap(args);
    case 'get_generation_capabilities': return {
      managedLocal: {
        ...providerConfiguration(),
        kinds: ['image', 'texture_image', 'concept_image', 'material', 'text_to_model', 'image_to_model', 'multiview_to_model', 'model_segment'],
        patinaMaterialFlow: 'prompt or source image -> seamless preview + typed PBR map bundle (1k-8k)',
        meshyTextFlow: 'selected image_model concept_image -> meshy-7 image_to_model',
        tools: ['generate_ai_asset', 'get_generation_job', 'get_generation_jobs', 'save_generated_asset'],
      },
      available: [
        'Generate deterministic recipes from the stable public ToonLab catalog entries.',
        'Save and retrieve editable lab documents through the shared .toonlab workspace.',
        'Search and retrieve authored public Gallery recipes with license and provenance.',
        'Search and import CC0 assets from Poly Haven and ambientCG.',
        'Use each recipe\'s spawn snippet to integrate it into a Three.js project.',
      ],
      unsupportedStyleDomains: ['lighting', 'vfx', 'renderer'],
      hostedProAdds: [
        'Hosted provider keys, credit billing, and durable background workers',
        'Cloud library and cross-device sync',
        'Remote Streamable HTTP transport with OAuth',
      ],
      mode: 'open-source-local',
    };
    default: throw new Error(`Unknown tool "${name}".`);
  }
}

async function listResources() {
  const assets = await allAssets();
  return assets.slice(0, 500).map((entry) => ({
    description: entry.description ?? `${entry.source} ToonLab asset`,
    mimeType: entry.mimeType ?? 'application/json',
    name: entry.label ?? entry.name ?? entry.id,
    uri: `toonlab://asset/${encodeURIComponent(entry.id)}`,
  }));
}

async function readResource(uri) {
  const parsed = new URL(uri);
  if (parsed.protocol !== 'toonlab:' || parsed.hostname !== 'asset') throw new Error(`Unsupported resource URI: ${uri}`);
  const id = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  const asset = await getAsset({ id });
  if (asset.source === 'workspace') {
    const file = await readWorkspaceFile(workspace, asset.relativePath);
    if (file.data.length > 5 * 1024 * 1024) throw new Error('Resource is larger than the 5 MB MCP inline limit. Use its absolutePath.');
    if (file.mimeType === 'application/json' || file.mimeType.startsWith('text/')) {
      return { contents: [{ mimeType: file.mimeType, text: file.data.toString('utf8'), uri }] };
    }
    return { contents: [{ blob: file.data.toString('base64'), mimeType: file.mimeType, uri }] };
  }
  return { contents: [{ mimeType: 'application/json', text: JSON.stringify(asset, null, 2), uri }] };
}

async function handleRequest(message) {
  const { id, method, params = {} } = message;
  if (method === 'initialize') {
    const requested = params.protocolVersion;
    return {
      id,
      jsonrpc: '2.0',
      result: {
        capabilities: { resources: {}, tools: {} },
        instructions: 'ToonLab builds anime-style games, characters, and environments for Three.js. Call list_live_labs and get_lab_features when authoring a Lab artifact, use create_lab_document for a valid starter, and prefer mutate_lab_creation over hand-editing structural arrays. Official Rock details include a source-GLB starter. This OSS server may edit any non-secret creation or lab-state entry in its local workspace; deletions require explicit confirmation. Load the selected style bundle first. If no asset-sourcing policy exists, ask the developer, then continue with library-first advisory discovery while recording the unresolved decision. Search the project and local library first, then search_public_gallery for reviewed authored assets such as tree recipes, before external sources. Generate or hand-author only when policy permits. Validate every candidate, preserve provenance, evaluate anime-fit in scene, and record a gap before adding a custom shader, texture, model, or adapter. When local provider keys are configured, generate_ai_asset exposes image generation, Meshy 7 image/multiview-to-3D, and Text -> selected image model -> Meshy 7 through MCP.',
        protocolVersion: SUPPORTED_PROTOCOL_VERSIONS.has(requested) ? requested : LATEST_PROTOCOL_VERSION,
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      },
    };
  }
  if (method === 'ping') return { id, jsonrpc: '2.0', result: {} };
  if (method === 'tools/list') return { id, jsonrpc: '2.0', result: { tools: TOOLS } };
  if (method === 'tools/call') {
    try {
      return { id, jsonrpc: '2.0', result: jsonContent(await callTool(params.name, params.arguments ?? {})) };
    } catch (error) {
      return { id, jsonrpc: '2.0', result: errorContent(error) };
    }
  }
  if (method === 'resources/list') return { id, jsonrpc: '2.0', result: { resources: await listResources() } };
  if (method === 'resources/read') {
    try {
      return { id, jsonrpc: '2.0', result: await readResource(params.uri) };
    } catch (error) {
      return { error: { code: -32002, message: error?.message ?? String(error) }, id, jsonrpc: '2.0' };
    }
  }
  return { error: { code: -32601, message: `Method not found: ${method}` }, id, jsonrpc: '2.0' };
}

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', async (chunk) => {
  input += chunk;
  let newline = input.indexOf('\n');
  while (newline >= 0) {
    const line = input.slice(0, newline).trim();
    input = input.slice(newline + 1);
    if (line) {
      try {
        const message = JSON.parse(line);
        if (message.id !== undefined && message.id !== null) {
          process.stdout.write(`${JSON.stringify(await handleRequest(message))}\n`);
        }
      } catch (error) {
        process.stdout.write(`${JSON.stringify({
          error: { code: -32700, message: error?.message ?? 'Parse error' },
          id: null,
          jsonrpc: '2.0',
        })}\n`);
      }
    }
    newline = input.indexOf('\n');
  }
});

process.stdin.on('end', () => process.exit(0));
