import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import {
  CALL_ME_SENSEI_STYLE_BUNDLE,
  createOssStyleBundleProvider,
  createStyleBundleDocument,
  createUserStyleBundleProvider,
  resolveStyleBundleSelection,
} from '../src/styles/index.js';
import { runSceneStyleOperation } from '../src/agents/index.js';

const execFileAsync = promisify(execFile);
const projectRoot = new URL('..', import.meta.url);
const temporary = await mkdtemp(join(tmpdir(), 'toonlab-launch-dx-'));
const manifest = {
  schema: 'toonlab/scene-style-manifest',
  version: 1,
  name: 'Blank consumer scene',
  targets: [
    { domain: 'natural.rock', id: 'consumer-rock' },
    { domain: 'manufactured.surface', id: 'consumer-bench' },
  ],
};

try {
  const oss = createOssStyleBundleProvider();
  const ossSelection = await resolveStyleBundleSelection(oss, null);
  assert.equal(ossSelection.selected.id, 'call-me-sensei');
  assert.ok(ossSelection.options.some(({ id }) => id === 'call-me-sensei'));

  const personalBundle = createStyleBundleDocument('personal-ink', {
    label: 'Personal Ink',
    slots: { toon: { style: 'default' } },
  });
  let requestedUser = null;
  const pro = createUserStyleBundleProvider({
    loadUserBundles(user) {
      requestedUser = user;
      return [personalBundle];
    },
  });
  const anonymous = await pro.list({ user: null });
  assert.deepEqual(anonymous.map(({ id }) => id), ['call-me-sensei']);
  const authenticated = await pro.list({ user: { id: 'user-1' } });
  assert.equal(requestedUser.id, 'user-1');
  assert.deepEqual(new Set(authenticated.map(({ id }) => id)), new Set(['call-me-sensei', 'personal-ink']));

  for (const operation of ['inspect', 'audit', 'plan']) {
    const result = runSceneStyleOperation(operation, manifest, { mode: 'advisory' });
    assert.equal(result.ok, true);
    if (result.audit) assert.equal(result.audit.summary.targetCount, 2);
    if (result.plan) assert.equal(result.plan.operations.length, 2);
  }
  const applied = runSceneStyleOperation('apply', manifest, { mode: 'advisory' });
  assert.equal(applied.ok, true);
  assert.equal(applied.manifest.appliedStyle.bundle.id, CALL_ME_SENSEI_STYLE_BUNDLE.id);
  assert.equal(runSceneStyleOperation('verify', applied.manifest, { mode: 'advisory' }).ok, true);
  const forbidden = runSceneStyleOperation('audit', {
    ...manifest,
    targets: [{ domain: 'reference.p18', id: 'forbidden-reference' }],
  }, { mode: 'strict' });
  assert.equal(forbidden.ok, false);

  const inputPath = join(temporary, 'scene.json');
  const outputPath = join(temporary, 'applied.json');
  await writeFile(inputPath, `${JSON.stringify(manifest, null, 2)}\n`);
  for (const operation of ['inspect', 'audit', 'plan']) {
    const { stdout } = await execFileAsync(process.execPath, [
      new URL('../cli/toonlab.mjs', import.meta.url).pathname,
      operation,
      '--input', inputPath,
      '--mode', 'advisory',
    ]);
    assert.equal(JSON.parse(stdout).operation, operation);
  }
  await execFileAsync(process.execPath, [
    new URL('../cli/toonlab.mjs', import.meta.url).pathname,
    'apply', '--input', inputPath, '--out', outputPath, '--pretty',
  ]);
  const cliApplied = JSON.parse(await readFile(outputPath, 'utf8'));
  assert.equal(cliApplied.ok, true);
  await writeFile(inputPath, `${JSON.stringify(cliApplied.manifest, null, 2)}\n`);
  const verified = await execFileAsync(process.execPath, [
    new URL('../cli/toonlab.mjs', import.meta.url).pathname,
    'verify', '--input', inputPath,
  ]);
  assert.equal(JSON.parse(verified.stdout).ok, true);

  const child = spawn(process.execPath, [new URL('../mcp/server.mjs', import.meta.url).pathname, '--workspace', temporary], {
    cwd: projectRoot,
    env: { ...process.env, TOONLAB_LEGACY_WORKSPACE: '1' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let buffer = '';
  let sequence = 0;
  const pending = new Map();
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    let newline = buffer.indexOf('\n');
    while (newline >= 0) {
      const message = JSON.parse(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      pending.get(message.id)?.(message);
      pending.delete(message.id);
      newline = buffer.indexOf('\n');
    }
  });
  const request = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => reject(new Error(`MCP ${method} timed out.`)), 10_000);
    pending.set(id, (message) => { clearTimeout(timer); resolve(message); });
    child.stdin.write(`${JSON.stringify({ id, jsonrpc: '2.0', method, params })}\n`);
  });
  const listed = await request('tools/list');
  for (const operation of ['inspect', 'audit', 'plan', 'apply', 'verify']) {
    assert.ok(listed.result.tools.some(({ name }) => name === `${operation}_scene_style`));
  }
  const mcpApplied = await request('tools/call', {
    name: 'apply_scene_style',
    arguments: { manifest, mode: 'advisory' },
  });
  assert.deepEqual(mcpApplied.result.structuredContent, applied);
  child.kill();

  for (const example of [
    '../examples/style-bundle-vanilla/main.js',
    '../examples/style-bundle-react/main.jsx',
  ]) {
    const source = await readFile(new URL(example, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /(?:^|\/)labs\//i);
    assert.doesNotMatch(source, /p18|showcase/i);
    assert.ok(source.split('\n').length <= 35, `${example} remains minimal`);
  }
  await import('../src/react/index.js');

  for (const agent of ['codex', 'claude']) {
    const source = await readFile(new URL(`../agents/skills/${agent}/scene-style-application/SKILL.md`, import.meta.url), 'utf8');
    assert.match(source, /strict.*advisory/is);
    assert.match(source, /Never import from a ToonLab `labs\//);
    assert.match(source, /public package exports are the runtime authority/i);
  }

  console.log('Launch developer and agent workflow verification passed.');
} finally {
  await rm(temporary, { force: true, recursive: true });
}
