import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveUnambiguousLibraryDeletion } from '../database/repository.mjs';
import {
  getLibraryState,
  importBrowserStorage,
  readBrowserStorage,
  saveLibraryEntry,
} from '../mcp/workspace.mjs';
import { CALL_ME_SENSEI_STRICT_ASSET_POLICY } from '../src/asset-policy/index.js';
import {
  ROCKGEN_MAX_MESH_EDIT_DELTAS,
  createRockDocument,
  deserializeRockDocument,
  serializeRockDocument,
} from '../src/rockgen/index.js';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const serverPath = fileURLToPath(new URL('../mcp/server.mjs', import.meta.url));
const galleryFetchFixture = fileURLToPath(new URL('./fixtures/mock-public-gallery-fetch.mjs', import.meta.url));
const packageVersion = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version;
const workspace = await mkdtemp(join(tmpdir(), 'toonlab-mcp-'));
let child = null;

assert.equal(
  resolveUnambiguousLibraryDeletion([{ id: 'row-1', type: 'toon-preset' }], 'shared-id'),
  'row-1',
);
assert.throws(
  () => resolveUnambiguousLibraryDeletion([
    { id: 'row-1', type: 'toon-preset' },
    { id: 'row-2', type: 'water-preset' },
  ], 'shared-id'),
  /ambiguous across types.*managementId/,
);

const packedRock = createRockDocument({
  reference: { id: 'weathered_fragment_0004', sourceMode: 'mesh-template' },
});
packedRock.reference.meshEdits = [{
  deltas: Array.from({ length: ROCKGEN_MAX_MESH_EDIT_DELTAS }, (_, index) => (
    [index, 0.123456789, -0.23456789, 0.3456789]
  )),
  meshIndex: 0,
}];
packedRock.reference.meshOperationOrder = [{ type: 'sculpt', index: 0 }];
const packedRockJson = serializeRockDocument(packedRock);
assert.ok(Buffer.byteLength(packedRockJson, 'utf8') < 256 * 1024, 'maximum packed Rock edit budget fits cloud storage');
const unpackedRock = deserializeRockDocument(packedRockJson);
assert.equal(unpackedRock.reference.meshEdits[0].deltas.length, ROCKGEN_MAX_MESH_EDIT_DELTAS);
assert.ok(Math.abs(unpackedRock.reference.meshEdits[0].deltas[0][1] - 0.123456789) < 1e-6);

function createClient(child) {
  let sequence = 0;
  let buffer = '';
  const pending = new Map();
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    let newline = buffer.indexOf('\n');
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) {
        const message = JSON.parse(line);
        const wait = pending.get(message.id);
        if (wait) {
          pending.delete(message.id);
          wait.resolve(message);
        }
      }
      newline = buffer.indexOf('\n');
    }
  });
  return {
    notify(method, params = {}) {
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
    },
    request(method, params = {}) {
      sequence += 1;
      const id = sequence;
      child.stdin.write(`${JSON.stringify({ id, jsonrpc: '2.0', method, params })}\n`);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`Timed out waiting for ${method}.`));
        }, 10_000);
        pending.set(id, {
          reject,
          resolve(message) {
            clearTimeout(timer);
            resolve(message);
          },
        });
      });
    },
  };
}

try {
  const empty = await readBrowserStorage(workspace);
  assert.equal(empty.initialized, false);

  const migrated = await importBrowserStorage(workspace, {
    'toonlab.prop-lab.presets.v1': JSON.stringify([{ id: 'local-lantern', label: 'Local lantern' }]),
    'toonlab.texture-lab.ai.v1': JSON.stringify({ keys: { openai: 'never-write-this' } }),
  });
  assert.equal(migrated.initialized, true);
  assert.equal('toonlab.texture-lab.ai.v1' in migrated.entries, false);

  await saveLibraryEntry(workspace, {
    cluster: 'propgen',
    id: 'user/test-entry',
    kind: 'recipe',
    label: 'Test entry',
    recipe: { settings: { asset: { seed: 1, type: 'lantern' } } },
    spawn: 'createPropAssetFromRecipe(entry.recipe)',
    tags: ['user'],
  });
  assert.equal((await getLibraryState(workspace)).entries.length, 1);

  const standaloneMcpEnv = { ...process.env };
  delete standaloneMcpEnv.DATABASE_URL;
  delete standaloneMcpEnv.TOONLAB_LEGACY_WORKSPACE;
  standaloneMcpEnv.TOONLAB_PUBLIC_GALLERY_URL = 'https://gallery.test/api/v1/creations';
  child = spawn(process.execPath, [
    '--import', galleryFetchFixture,
    serverPath, '--workspace', workspace,
  ], {
    cwd: workspace,
    env: standaloneMcpEnv,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const client = createClient(child);

  const initialized = await client.request('initialize', {
    capabilities: {},
    clientInfo: { name: 'toonlab-verifier', version: '1' },
    protocolVersion: '2025-11-25',
  });
  assert.equal(initialized.result.protocolVersion, '2025-11-25');
  assert.equal(initialized.result.serverInfo.name, 'toonlab-oss');
  assert.equal(initialized.result.serverInfo.version, packageVersion);
  assert.match(initialized.result.instructions, /anime-style games/i);
  client.notify('notifications/initialized');

  const listed = await client.request('tools/list');
  const toolNames = listed.result.tools.map((tool) => tool.name);
  assert.ok(toolNames.includes('search_assets'));
  assert.ok(toolNames.includes('search_public_gallery'));
  assert.ok(toolNames.includes('get_public_gallery_asset'));
  assert.ok(toolNames.includes('generate_asset'));
  for (const generationTool of [
    'generate_ai_asset',
    'get_generation_job',
    'get_generation_jobs',
    'save_generated_asset',
  ]) {
    assert.ok(toolNames.includes(generationTool), `MCP exposes ${generationTool}`);
  }
  assert.ok(toolNames.includes('import_cc0_asset'));
  assert.ok(toolNames.includes('get_anime_game_profile'));
  assert.ok(toolNames.includes('validate_asset_candidate'));
  assert.ok(toolNames.includes('record_asset_gap'));
  for (const managementTool of [
    'list_live_labs',
    'get_lab_features',
    'create_lab_document',
    'mutate_lab_creation',
    'update_creation',
    'delete_creation',
    'list_lab_state',
    'get_lab_state',
    'set_lab_state',
    'delete_lab_state',
  ]) {
    assert.ok(toolNames.includes(managementTool), `MCP exposes ${managementTool}`);
  }
  assert.equal(toolNames.includes('list_style_labs'), false);
  const searchTool = listed.result.tools.find((tool) => tool.name === 'search_assets');
  assert.ok(searchTool.inputSchema.properties.source.enum.includes('official'));
  assert.equal(searchTool.inputSchema.properties.offset.minimum, 0);
  assert.match(searchTool.description, /dimensions and taxonomy metadata/i);

  const firstBuiltinPage = await client.request('tools/call', {
    arguments: { limit: 1, offset: 0, source: 'builtin' },
    name: 'search_assets',
  });
  assert.equal(firstBuiltinPage.result.structuredContent.count, 1);
  assert.ok(firstBuiltinPage.result.structuredContent.total > 1);
  assert.equal(firstBuiltinPage.result.structuredContent.nextOffset, 1);
  const secondBuiltinPage = await client.request('tools/call', {
    arguments: { limit: 1, offset: 1, source: 'builtin' },
    name: 'search_assets',
  });
  assert.notEqual(
    firstBuiltinPage.result.structuredContent.items[0].id,
    secondBuiltinPage.result.structuredContent.items[0].id,
  );

  const packagedTrees = await client.request('tools/call', {
    arguments: { cluster: 'vegetation', source: 'builtin' },
    name: 'search_assets',
  });
  assert.equal(packagedTrees.result.structuredContent.total, 0);

  const galleryTrees = await client.request('tools/call', {
    arguments: { limit: 1, offset: 0, query: 'tree', type: 'tree-recipe' },
    name: 'search_public_gallery',
  });
  assert.equal(galleryTrees.result.isError, undefined);
  assert.equal(galleryTrees.result.structuredContent.count, 1);
  assert.equal(galleryTrees.result.structuredContent.items[0].id, 'gallery-tree-001');
  assert.equal(galleryTrees.result.structuredContent.items[0].license, 'CC0-1.0');
  assert.equal(galleryTrees.result.structuredContent.items[0].sourceClass, 'toonlab-gallery');
  assert.equal(galleryTrees.result.structuredContent.nextOffset, 1);

  const galleryTree = await client.request('tools/call', {
    arguments: { id: 'gallery-tree-001' },
    name: 'get_public_gallery_asset',
  });
  assert.equal(galleryTree.result.isError, undefined);
  assert.equal(galleryTree.result.structuredContent.document.schema, 'treeRecipe');
  assert.equal(galleryTree.result.structuredContent.document.options.seed, 101);
  assert.equal(galleryTree.result.structuredContent.files.length, 1);

  const animeProfile = await client.request('tools/call', {
    arguments: {},
    name: 'get_anime_game_profile',
  });
  assert.equal(animeProfile.result.structuredContent.artDirection.family, 'anime-game');
  assert.equal(animeProfile.result.structuredContent.defaultStyleBundle.version, 2);

  const liveLabs = await client.request('tools/call', {
    arguments: {},
    name: 'list_live_labs',
  });
  assert.equal(liveLabs.result.structuredContent.count, 15);
  assert.ok(liveLabs.result.structuredContent.labs.every((lab) => lab.featureCount > 0));
  assert.deepEqual(
    liveLabs.result.structuredContent.labs.find((lab) => lab.id === 'rock-shader').management.creationCrud,
    ['create', 'read', 'update', 'delete'],
  );

  const rockShaderFeatures = await client.request('tools/call', {
    arguments: { lab: 'rock-shader' },
    name: 'get_lab_features',
  });
  assert.ok(rockShaderFeatures.result.structuredContent.featureCount > 20);
  assert.equal(typeof rockShaderFeatures.result.structuredContent.schema, 'object');
  assert.equal(
    rockShaderFeatures.result.structuredContent.documentContract.discriminator.value,
    'toonlab/rock-shader-preset',
  );
  assert.equal(
    rockShaderFeatures.result.structuredContent.documentContract.starterDocument.schema,
    'toonlab/rock-shader-preset',
  );
  assert.equal(
    rockShaderFeatures.result.structuredContent.documentContract.creationType,
    'rock-shader-preset',
  );

  const rockFeatures = await client.request('tools/call', {
    arguments: { lab: 'rock' },
    name: 'get_lab_features',
  });
  assert.ok(rockFeatures.result.structuredContent.documentContract.jsonSchema.properties.reference.anyOf);
  assert.ok(
    rockFeatures.result.structuredContent.capabilities.authoring.structuralOperations.includes('append_mesh_edit'),
  );
  const sourceRock = await client.request('tools/call', {
    arguments: {
      doc_key: 'weathered-fragment-edit',
      lab: 'rock',
      label: 'Weathered Fragment Edit',
      source: {
        familyId: 'weathered-fragment',
        id: 'rock-0001',
        releaseWave: '2026-08',
        tags: ['prop', 'rocks'],
        variation: { id: 'weathered_fragment_0004' },
      },
    },
    name: 'create_lab_document',
  });
  assert.equal(sourceRock.result.structuredContent.document.reference.id, 'weathered_fragment_0004');
  assert.equal(sourceRock.result.structuredContent.document.reference.sourceMode, 'mesh-template');
  const savedSourceRock = await client.request('tools/call', {
    arguments: {
      document: sourceRock.result.structuredContent.document,
      filename: 'weathered-fragment-edit.json',
      kind: 'rock-project',
      name: 'Weathered Fragment Edit',
    },
    name: 'save_creation',
  });
  const grassTop = await client.request('tools/call', {
    arguments: {
      finish: 'grass',
      id: savedSourceRock.result.structuredContent.id,
      lab: 'rock',
      operation: 'set_top_finish',
    },
    name: 'mutate_lab_creation',
  });
  assert.equal(grassTop.result.isError, undefined);
  assert.equal(grassTop.result.structuredContent.creation.document.reference.topFinish, 'grass');
  const sculptedSourceRock = await client.request('tools/call', {
    arguments: {
      edit: { deltas: [[0, 0.1, 0.2, 0.3]], meshIndex: 0 },
      id: savedSourceRock.result.structuredContent.id,
      lab: 'rock',
      operation: 'append_mesh_edit',
    },
    name: 'mutate_lab_creation',
  });
  assert.equal(sculptedSourceRock.result.isError, undefined);
  assert.equal(
    sculptedSourceRock.result.structuredContent.creation.document.reference.meshEditsPacked.encoding,
    'base64-f32le-v1',
  );

  const stateKey = 'toonlab.mcp-verifier.presets.v1';
  const stateValue = [{ id: 'mcp-state', label: 'MCP state', settings: { value: 3 } }];
  const stateSet = await client.request('tools/call', {
    arguments: { key: stateKey, value: stateValue },
    name: 'set_lab_state',
  });
  assert.deepEqual(stateSet.result.structuredContent.value, stateValue);
  const stateRead = await client.request('tools/call', {
    arguments: { key: stateKey },
    name: 'get_lab_state',
  });
  assert.deepEqual(stateRead.result.structuredContent.value, stateValue);
  const legacyStateKey = 'threejs-toon-shader.toonPresets.v1';
  const legacyState = await client.request('tools/call', {
    arguments: { key: legacyStateKey, value: [{ id: 'legacy-compatible' }] },
    name: 'set_lab_state',
  });
  assert.equal(legacyState.result.isError, undefined);
  const secretState = await client.request('tools/call', {
    arguments: { key: 'toonlab.asset-lab.polypizza-key.v1', value: 'must-not-persist' },
    name: 'set_lab_state',
  });
  assert.equal(secretState.result.isError, true);
  const stateList = await client.request('tools/call', {
    arguments: { query: 'mcp-verifier' },
    name: 'list_lab_state',
  });
  assert.equal(stateList.result.structuredContent.count, 1);

  const savedFile = await client.request('tools/call', {
    arguments: {
      document: { label: 'Editable file', settings: { value: 1 } },
      kind: 'preset',
      name: 'Editable file',
    },
    name: 'save_creation',
  });
  const savedFileId = savedFile.result.structuredContent.id;
  const updatedFile = await client.request('tools/call', {
    arguments: { id: savedFileId, patch: { settings: { value: 8 } } },
    name: 'update_creation',
  });
  assert.equal(updatedFile.result.structuredContent.creation.document.settings.value, 8);
  assert.match(
    await readFile(updatedFile.result.structuredContent.creation.absolutePath, 'utf8'),
    /"value": 8/,
  );

  const capabilities = await client.request('tools/call', {
    arguments: {},
    name: 'get_generation_capabilities',
  });
  assert.equal(capabilities.result.isError, undefined);
  assert.deepEqual(
    capabilities.result.structuredContent.unsupportedStyleDomains,
    ['lighting', 'vfx', 'renderer'],
  );
  assert.equal(capabilities.result.structuredContent.managedLocal.modelProviders[0].id, 'meshy');
  assert.deepEqual(
    capabilities.result.structuredContent.managedLocal.modelProviders[0].kinds,
    ['text_to_model', 'image_to_model', 'multiview_to_model'],
  );
  assert.match(capabilities.result.structuredContent.managedLocal.meshyTextFlow, /image_model.*meshy-7/i);

  const searched = await client.request('tools/call', {
    arguments: { source: 'library', tags: ['user'] },
    name: 'search_assets',
  });
  assert.equal(searched.result.isError, undefined);
  assert.equal(searched.result.structuredContent.items[0].id, 'user/test-entry');
  assert.equal(searched.result.structuredContent.items[0].sourceClass, 'toonlab-library');
  assert.equal(searched.result.structuredContent.items[0].policyDecision.decision, 'warn');

  const updated = await client.request('tools/call', {
    arguments: {
      id: 'user/test-entry',
      label: 'Edited by MCP',
      patch: { settings: { asset: { seed: 9 } } },
      tags: ['hero prop', 'Forest'],
    },
    name: 'update_creation',
  });
  assert.equal(updated.result.isError, undefined);
  assert.equal(updated.result.structuredContent.creation.label, 'Edited by MCP');
  assert.equal(updated.result.structuredContent.creation.recipe.settings.asset.seed, 9);
  assert.deepEqual(updated.result.structuredContent.creation.tags, ['hero-prop', 'forest']);

  const taggedCreations = await client.request('tools/call', {
    arguments: { tags: ['forest'] },
    name: 'list_my_creations',
  });
  assert.equal(taggedCreations.result.structuredContent.total, 1);
  assert.equal(taggedCreations.result.structuredContent.items[0].id, 'user/test-entry');

  const strictDenied = await client.request('tools/call', {
    arguments: {
      candidate: { domain: 'natural.rock', sourceClass: 'procedural' },
      policy: CALL_ME_SENSEI_STRICT_ASSET_POLICY,
    },
    name: 'validate_asset_candidate',
  });
  assert.equal(strictDenied.result.structuredContent.result.allowed, false);
  const blockedGeneration = await client.request('tools/call', {
    arguments: {
      catalog_id: 'rock/boulder',
      domain: 'natural.rock',
      policy: CALL_ME_SENSEI_STRICT_ASSET_POLICY,
      save: false,
    },
    name: 'generate_asset',
  });
  assert.equal(blockedGeneration.result.isError, true);

  const generated = await client.request('tools/call', {
    arguments: { catalog_id: 'water/lake', name: 'MCP water', seed: 77 },
    name: 'generate_asset',
  });
  assert.equal(generated.result.isError, undefined);
  assert.equal(generated.result.structuredContent.document.seed, 77);
  const generatedPath = generated.result.structuredContent.file.absolutePath;
  assert.match(await readFile(generatedPath, 'utf8'), /"seed": 77/);

  const gap = await client.request('tools/call', {
    arguments: {
      attempts: [{ query: 'anime cloud mesh', tool: 'search_assets' }],
      domain: 'cloud',
      feedbackNeeded: 'Add a reusable anime cloud adapter.',
      id: 'custom-cloud-adapter',
      kind: 'custom-shader-adapter',
      reason: 'No supported adapter matched the host renderer.',
    },
    name: 'record_asset_gap',
  });
  assert.equal(gap.result.isError, undefined);
  assert.equal(gap.result.structuredContent.markdownPath, join(workspace, 'reports', 'asset-gaps.md'));
  assert.match(await readFile(gap.result.structuredContent.jsonPath, 'utf8'), /custom-cloud-adapter/);
  assert.match(await readFile(gap.result.structuredContent.markdownPath, 'utf8'), /Add a reusable anime cloud adapter/);

  const creations = await client.request('tools/call', {
    arguments: { query: 'mcp-water' },
    name: 'list_my_creations',
  });
  assert.equal(creations.result.structuredContent.count, 1);

  const resources = await client.request('resources/list');
  assert.ok(resources.result.resources.some((resource) => resource.name === 'Edited by MCP'));

  const stateDeleted = await client.request('tools/call', {
    arguments: { confirm: true, key: stateKey },
    name: 'delete_lab_state',
  });
  assert.equal(stateDeleted.result.structuredContent.deleted, true);
  const legacyStateDeleted = await client.request('tools/call', {
    arguments: { confirm: true, key: legacyStateKey },
    name: 'delete_lab_state',
  });
  assert.equal(legacyStateDeleted.result.structuredContent.deleted, true);
  const creationDeleted = await client.request('tools/call', {
    arguments: { confirm: true, id: 'user/test-entry' },
    name: 'delete_creation',
  });
  assert.equal(creationDeleted.result.structuredContent.deleted, true);
  const fileDeleted = await client.request('tools/call', {
    arguments: { confirm: true, id: savedFileId },
    name: 'delete_creation',
  });
  assert.equal(fileDeleted.result.structuredContent.deleted, true);

  child.stdin.end();
  await new Promise((resolve, reject) => {
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`MCP exited ${code}: ${stderr}`)));
  });

  console.log('MCP + workspace verification passed.');
} finally {
  if (child && child.exitCode == null) child.kill();
  await rm(workspace, { force: true, recursive: true });
}
