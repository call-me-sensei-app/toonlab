import { randomUUID } from 'node:crypto';
import {
  access,
  mkdir,
  readFile,
  readdir,
  rename,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { normalizeCreationTags } from '../database/creation-tags.mjs';

export const TOONLAB_WORKSPACE_VERSION = 1;
export const DEFAULT_WORKSPACE_DIRECTORY = '.toonlab';

const WORKSPACE_DIRECTORIES = Object.freeze([
  'assets',
  'creations',
  'exports',
  'imports',
  'library/entries',
  'presets',
  'storage',
]);

const WRITABLE_ROOTS = new Set(['assets', 'creations', 'exports', 'imports', 'presets']);
const SENSITIVE_STORAGE_KEYS = new Set([
  'toonlab.asset-lab.polypizza-key.v1',
  'toonlab.texture-lab.ai.v1',
]);

const MIME_BY_EXTENSION = Object.freeze({
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.json': 'application/json',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.zip': 'application/zip',
});

function now() {
  return new Date().toISOString();
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function writeJsonAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporary, path);
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
}

function assertWorkspaceChild(workspacePath, path) {
  const rel = relative(workspacePath, path);
  if (!rel || rel === '.') return path;
  if (rel.startsWith(`..${sep}`) || rel === '..' || isAbsolute(rel)) {
    throw new Error('Path escapes the ToonLab workspace.');
  }
  return path;
}

function normalizeRelativePath(value) {
  const parts = String(value ?? '')
    .replaceAll('\\', '/')
    .replace(/^\/+/, '')
    .split('/')
    .filter((part) => part && part !== '.');
  if (parts.includes('..')) throw new Error('Workspace paths cannot contain "..".');
  return parts.join('/');
}

function safeSlug(value, fallback = 'untitled') {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || fallback;
}

function libraryFilename(id) {
  return `${Buffer.from(String(id)).toString('base64url')}.json`;
}

function storagePath(workspacePath) {
  return join(workspacePath, 'storage', 'local-storage.json');
}

function manifestPath(workspacePath) {
  return join(workspacePath, 'toonlab.json');
}

export function isPersistableStorageKey(key) {
  const normalized = String(key ?? '');
  if (SENSITIVE_STORAGE_KEYS.has(normalized)) return false;
  if (/(?:api.?key|auth|credential|password|secret|token)/i.test(normalized)) return false;
  if (normalized.includes('.thumb') || normalized.endsWith('.__probe__')) return false;
  return normalized.startsWith('toonlab.') || normalized.startsWith('threejs-toon-shader.');
}

export function resolveWorkspacePath(input = DEFAULT_WORKSPACE_DIRECTORY, cwd = process.cwd()) {
  return resolve(cwd, input || DEFAULT_WORKSPACE_DIRECTORY);
}

export async function ensureWorkspace(workspacePath) {
  const root = resolve(workspacePath);
  await mkdir(root, { recursive: true });
  await Promise.all(WORKSPACE_DIRECTORIES.map((directory) => mkdir(join(root, directory), { recursive: true })));
  const path = manifestPath(root);
  if (!(await exists(path))) {
    await writeJsonAtomic(path, {
      createdAt: now(),
      migrations: {},
      updatedAt: now(),
      version: TOONLAB_WORKSPACE_VERSION,
    });
  }
  return root;
}

export async function readWorkspaceManifest(workspacePath) {
  const root = await ensureWorkspace(workspacePath);
  return readJson(manifestPath(root), {
    createdAt: now(),
    migrations: {},
    updatedAt: now(),
    version: TOONLAB_WORKSPACE_VERSION,
  });
}

export async function updateWorkspaceManifest(workspacePath, update) {
  const root = await ensureWorkspace(workspacePath);
  const current = await readWorkspaceManifest(root);
  const next = typeof update === 'function' ? update(current) : { ...current, ...update };
  next.updatedAt = now();
  next.version = TOONLAB_WORKSPACE_VERSION;
  await writeJsonAtomic(manifestPath(root), next);
  return next;
}

export async function getWorkspaceInfo(workspacePath) {
  const root = await ensureWorkspace(workspacePath);
  const manifest = await readWorkspaceManifest(root);
  const storageInitialized = await exists(storagePath(root));
  const library = await getLibraryState(root);
  return {
    libraryCount: library.entries.length,
    manifest,
    path: root,
    storageInitialized,
    version: TOONLAB_WORKSPACE_VERSION,
  };
}

export async function readBrowserStorage(workspacePath) {
  const root = await ensureWorkspace(workspacePath);
  const path = storagePath(root);
  if (!(await exists(path))) return { entries: {}, initialized: false };
  const parsed = await readJson(path, {});
  const entries = {};
  for (const [key, value] of Object.entries(parsed ?? {})) {
    if (isPersistableStorageKey(key) && typeof value === 'string') entries[key] = value;
  }
  return { entries, initialized: true };
}

export async function importBrowserStorage(workspacePath, input) {
  const root = await ensureWorkspace(workspacePath);
  const current = await readBrowserStorage(root);
  if (current.initialized) return current;
  const entries = {};
  for (const [key, value] of Object.entries(input ?? {})) {
    if (isPersistableStorageKey(key) && typeof value === 'string') entries[key] = value;
  }
  await writeJsonAtomic(storagePath(root), entries);
  await updateWorkspaceManifest(root, (manifest) => ({
    ...manifest,
    migrations: { ...manifest.migrations, browserLocalStorage: now() },
  }));
  return { entries, initialized: true };
}

export async function setBrowserStorageValue(workspacePath, key, value) {
  if (!isPersistableStorageKey(key)) throw new Error('This browser-storage key is not persisted.');
  if (typeof value !== 'string') throw new Error('Browser-storage values must be strings.');
  const root = await ensureWorkspace(workspacePath);
  const current = await readBrowserStorage(root);
  const entries = { ...current.entries, [key]: value };
  await writeJsonAtomic(storagePath(root), entries);
  return entries;
}

export async function deleteBrowserStorageValue(workspacePath, key) {
  const root = await ensureWorkspace(workspacePath);
  const current = await readBrowserStorage(root);
  if (!current.initialized) return {};
  const entries = { ...current.entries };
  delete entries[key];
  await writeJsonAtomic(storagePath(root), entries);
  return entries;
}

export async function clearBrowserStorage(workspacePath) {
  const root = await ensureWorkspace(workspacePath);
  await writeJsonAtomic(storagePath(root), {});
  return {};
}

export async function listLibraryEntries(workspacePath) {
  const root = await ensureWorkspace(workspacePath);
  const directory = join(root, 'library', 'entries');
  const files = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'));
  const entries = [];
  for (const file of files) {
    const entry = await readJson(join(directory, file.name), null);
    if (entry?.id && typeof entry.id === 'string') entries.push(entry);
  }
  return entries.sort((a, b) => String(a.label ?? a.id).localeCompare(String(b.label ?? b.id)));
}

export async function getLibraryState(workspacePath) {
  const root = await ensureWorkspace(workspacePath);
  const manifest = await readWorkspaceManifest(root);
  return {
    entries: await listLibraryEntries(root),
    migrated: Boolean(manifest.migrations?.indexedDbCatalog),
  };
}

export async function saveLibraryEntry(workspacePath, entry) {
  if (!entry || typeof entry !== 'object' || typeof entry.id !== 'string' || !entry.id.trim()) {
    throw new Error('A library entry with an id is required.');
  }
  const root = await ensureWorkspace(workspacePath);
  const path = join(root, 'library', 'entries', libraryFilename(entry.id));
  await writeJsonAtomic(path, entry);
  return entry;
}

export async function deleteLibraryEntry(workspacePath, id) {
  const root = await ensureWorkspace(workspacePath);
  const path = join(root, 'library', 'entries', libraryFilename(id));
  try {
    await unlink(path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

export async function migrateLibraryEntries(workspacePath, entries) {
  const root = await ensureWorkspace(workspacePath);
  const state = await getLibraryState(root);
  if (!state.migrated) {
    for (const entry of Array.isArray(entries) ? entries : []) {
      if (entry?.id) await saveLibraryEntry(root, entry);
    }
    await updateWorkspaceManifest(root, (manifest) => ({
      ...manifest,
      migrations: { ...manifest.migrations, indexedDbCatalog: now() },
    }));
  }
  return getLibraryState(root);
}

export function resolveWritableWorkspaceFile(workspacePath, relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  const [topLevel] = normalized.split('/');
  if (!normalized || !WRITABLE_ROOTS.has(topLevel)) {
    throw new Error(`Files must be saved below ${[...WRITABLE_ROOTS].join(', ')}.`);
  }
  const path = assertWorkspaceChild(resolve(workspacePath), resolve(workspacePath, normalized));
  return { path, relativePath: normalized };
}

export async function writeWorkspaceFile(workspacePath, relativePath, data) {
  const root = await ensureWorkspace(workspacePath);
  const resolved = resolveWritableWorkspaceFile(root, relativePath);
  await mkdir(dirname(resolved.path), { recursive: true });
  await writeFile(resolved.path, data);
  return describeWorkspaceFile(root, resolved.path);
}

export async function deleteWorkspaceFile(workspacePath, relativePath) {
  const root = await ensureWorkspace(workspacePath);
  const resolved = resolveWritableWorkspaceFile(root, relativePath.replace(/^file:/, ''));
  try {
    await unlink(resolved.path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function describeWorkspaceFile(workspacePath, path) {
  const info = await stat(path);
  const relativePath = relative(workspacePath, path).split(sep).join('/');
  return {
    absolutePath: path,
    id: `file:${relativePath}`,
    kind: extname(path).slice(1).toLowerCase() || 'file',
    mimeType: MIME_BY_EXTENSION[extname(path).toLowerCase()] ?? 'application/octet-stream',
    modifiedAt: info.mtime.toISOString(),
    name: basename(path),
    relativePath,
    sizeBytes: info.size,
    source: 'workspace',
  };
}

async function walkFiles(workspacePath, directory, output) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walkFiles(workspacePath, path, output);
    else if (entry.isFile()) output.push(await describeWorkspaceFile(workspacePath, path));
  }
}

export async function listWorkspaceFiles(workspacePath, { roots = [...WRITABLE_ROOTS] } = {}) {
  const root = await ensureWorkspace(workspacePath);
  const files = [];
  for (const directory of roots) {
    if (!WRITABLE_ROOTS.has(directory)) continue;
    await walkFiles(root, join(root, directory), files);
  }
  return files.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}

export async function readWorkspaceFile(workspacePath, relativePath) {
  const root = await ensureWorkspace(workspacePath);
  const normalized = normalizeRelativePath(relativePath.replace(/^file:/, ''));
  const [topLevel] = normalized.split('/');
  if (!WRITABLE_ROOTS.has(topLevel)) throw new Error('File is outside a readable workspace collection.');
  const path = assertWorkspaceChild(root, resolve(root, normalized));
  const description = await describeWorkspaceFile(root, path);
  return { ...description, data: await readFile(path) };
}

export async function saveCreation(workspacePath, {
  document,
  filename = null,
  kind = 'creation',
  name = 'Untitled',
  description = null,
  tags = null,
} = {}) {
  if (document === undefined) throw new Error('document is required.');
  const collection = safeSlug(kind, 'creation');
  const requested = filename ? safeSlug(basename(filename), `${safeSlug(name)}.json`) : `${safeSlug(name)}.json`;
  const finalName = extname(requested) ? requested : `${requested}.json`;
  const payloadDocument = typeof document === 'string'
    ? document
    : {
        ...document,
        ...(description == null ? {} : { description: String(description).slice(0, 2000) }),
        tags: normalizeCreationTags(Array.isArray(tags) ? tags : document.tags),
      };
  const payload = typeof payloadDocument === 'string'
    ? payloadDocument
    : `${JSON.stringify(payloadDocument, null, 2)}\n`;
  return writeWorkspaceFile(workspacePath, `creations/${collection}/${finalName}`, payload);
}

function inferStorageCluster(key) {
  const match = String(key).match(/^toonlab\.([a-z0-9-]+?)(?:\.document|\.presets|\.projects|$)/i);
  return match?.[1] ?? 'lab';
}

export async function listStorageDocuments(workspacePath) {
  const storage = await readBrowserStorage(workspacePath);
  const documents = [];
  for (const [key, raw] of Object.entries(storage.entries)) {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    const values = Array.isArray(parsed) ? parsed : [parsed];
    values.forEach((document, index) => {
      if (!document || typeof document !== 'object') return;
      const documentId = String(document.id ?? document.presetId ?? index);
      documents.push({
        cluster: inferStorageCluster(key),
        document,
        id: `storage:${Buffer.from(key).toString('base64url')}:${Buffer.from(documentId).toString('base64url')}`,
        key,
        kind: Array.isArray(parsed) ? 'preset' : 'document',
        label: String(document.label ?? document.name ?? document.id ?? `${inferStorageCluster(key)} ${index + 1}`),
        source: 'workspace-storage',
      });
    });
  }
  return documents;
}

export function matchesText(value, query) {
  if (!query) return true;
  return JSON.stringify(value).toLowerCase().includes(String(query).toLowerCase());
}
