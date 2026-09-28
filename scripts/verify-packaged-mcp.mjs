import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, rename, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNaturalRockSurfaceSpecification } from '../src/rockgen/index.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), 'toonlab-packed-mcp-'));
let child;
function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}
try {
  const packed = JSON.parse(run('npm', ['pack', '--ignore-scripts', '--json', '--cache', join(temporary, 'cache'), '--pack-destination', temporary]))[0];
  const scope = join(temporary, 'node_modules', '@call-me-sensei');
  await mkdir(scope, { recursive: true });
  run('tar', ['-xzf', join(temporary, packed.filename), '-C', scope]);
  await rename(join(scope, 'package'), join(scope, 'toonlab'));
  for (const name of ['three', 'pg', '3d-tiles-renderer']) {
    await symlink(join(root, 'node_modules', name), join(temporary, 'node_modules', name));
  }
  const env = { ...process.env };
  delete env.DATABASE_URL;
  delete env.TOONLAB_LEGACY_WORKSPACE;
  child = spawn(process.execPath, [join(scope, 'toonlab/mcp/server.mjs'), '--workspace', join(temporary, 'workspace')], { cwd: temporary, env, stdio: ['pipe', 'pipe', 'pipe'] });
  let buffer = '', errors = '', id = 0;
  const pending = new Map();
  child.stderr.on('data', (chunk) => { errors += chunk; });
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    for (let end; (end = buffer.indexOf('\n')) >= 0;) {
      const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
      if (!line.trim()) continue;
      const response = JSON.parse(line);
      pending.get(response.id)?.resolve(response);
    }
  });
  child.on('exit', (code) => { for (const job of pending.values()) job.reject(new Error(`Packaged MCP exited ${code}: ${errors}`)); });
  async function request(method, params) {
    const requestId = ++id;
    let timeout;
    try {
      return await new Promise((resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(`Packaged MCP timed out: ${errors}`)), 15000);
        pending.set(requestId, { resolve, reject });
        child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: requestId, method, params }) + '\n');
      });
    } finally { clearTimeout(timeout); pending.delete(requestId); }
  }
  const initialized = await request('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'release-check', version: '1' } });
  assert.ok(initialized.result.serverInfo);
  const surfacePackage = createNaturalRockSurfaceSpecification({ assetId: 'packed-granite', profileId: 'coarse-granite-jointed', editedBoundsMetres: [1, 1, 1], geometrySha256: 'b'.repeat(64) });
  const rock = await request('tools/call', { name: 'create_lab_document', arguments: { lab: 'rock', source: { id: 'packed-granite', surfacePackage } } });
  assert.deepEqual(rock.result.structuredContent.document.reference.surfacePackage, surfacePackage);
  const tree = await request('tools/call', { name: 'create_lab_document', arguments: { lab: 'tree' } });
  assert.equal(tree.result.isError, undefined);
  assert.ok(tree.result.structuredContent.document);
  console.log('Packaged MCP initialization and rock/tree authoring passed without repository-only modules.');
} finally {
  if (child && child.exitCode === null) {
    const exited = new Promise((resolve) => child.once('exit', resolve));
    child.kill(); await exited;
  }
  await rm(temporary, { recursive: true, force: true });
}
