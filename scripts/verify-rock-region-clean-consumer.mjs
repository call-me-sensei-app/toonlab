import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { copyFile, cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('..', import.meta.url));
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const fixture = join(
  root,
  'artifacts/research/rock-geology-v2/checkpoint-09-tripo-p1-pilot/hoodoo-caprock/',
  'v31-scan-assisted-runtime-package/exports/hoodoo-caprock-lod0-desktop-4k.glb',
);
const inputSha256 = 'd8081bb45a413bbeaab912767c47328308e91e0250aba5213ccb4409fdbf310e';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
    ...options,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function sourceFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    else files.push(path);
  }
  return files;
}

async function waitForServer(url) {
  let lastError;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw lastError ?? new Error(`Preview server did not become ready at ${url}.`);
}

const temporaryRoot = await mkdtemp(join(tmpdir(), 'toonlab-rock-region-consumer-'));
const npmEnvironment = {
  ...process.env,
  npm_config_cache: join(temporaryRoot, 'npm-cache'),
  npm_config_logs_dir: join(temporaryRoot, 'npm-logs'),
  npm_config_update_notifier: 'false',
};
let preview = null;
let browser = null;
try {
  const pack = JSON.parse(run(npmCommand, [
    'pack', '--json', '--ignore-scripts', '--pack-destination', temporaryRoot,
  ], { cwd: root, env: npmEnvironment }))[0];
  const tarball = join(temporaryRoot, pack.filename);
  const consumer = join(temporaryRoot, 'consumer');
  await mkdir(consumer, { recursive: true });
  await writeFile(join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module' }, null, 2));
  run(npmCommand, [
    'install', tarball, 'three@0.185.1',
    '--ignore-scripts', '--no-audit', '--no-fund', '--legacy-peer-deps',
  ], { cwd: consumer, env: npmEnvironment });

  await cp(join(root, 'quality/rock-region-consumer'), consumer, { recursive: true });
  await copyFile(fixture, join(consumer, 'hoodoo.glb'));
  await mkdir(join(consumer, 'public'), { recursive: true });
  const cli = join(consumer, 'node_modules/.bin/toonlab');
  run(cli, [
    'rock-regions', 'compile',
    '--input', join(consumer, 'hoodoo.glb'),
    '--input-sha256', inputSha256,
    '--output', join(consumer, 'public/hoodoo-regions.glb'),
    '--audit', join(consumer, 'public/hoodoo-regions.audit.json'),
  ], { cwd: consumer });

  const forbidden = /(?:\.\.\/\.\.\/src|\/labs\/|CascadeProjects|artifacts\/research|\/Users\/)/u;
  for (const path of await sourceFiles(consumer)) {
    if (!/\.(?:html|js|json)$/u.test(path) || path.includes('/node_modules/')) continue;
    const source = await readFile(path, 'utf8');
    assert.doesNotMatch(source, forbidden, `clean consumer leaks a repository path in ${path}`);
  }

  const vite = join(root, 'node_modules/vite/bin/vite.js');
  run(process.execPath, [vite, 'build', '--config', join(consumer, 'vite.config.js')], { cwd: consumer });
  const port = 5197;
  preview = spawn(process.execPath, [
    vite, 'preview', '--config', join(consumer, 'vite.config.js'), '--host', '127.0.0.1', '--port', String(port),
  ], { cwd: consumer, stdio: ['ignore', 'pipe', 'pipe'] });
  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForServer(baseUrl);

  browser = await chromium.launch({
    headless: true,
    args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,UseSkiaRenderer'],
  });
  const backendResults = [];
  const views = ['front', 'rear', 'left', 'right', 'top', 'bottom'];
  for (const backend of ['webgl', 'webgpu']) {
    const page = await browser.newPage({ viewport: { width: 720, height: 720 }, deviceScaleFactor: 1 });
    await page.goto(`${baseUrl}/?renderer=${backend}`, { waitUntil: 'networkidle', timeout: 120_000 });
    await page.waitForFunction(() => document.body.dataset.rockRegionReady === 'true', null, { timeout: 120_000 });
    const initial = JSON.parse(await page.locator('body').getAttribute('data-rock-region-report'));
    assert.equal(initial.passed, true);
    assert.equal(initial.regionVertices, 134_981);
    assert.equal(initial.exactRestore, true);
    assert.equal(initial.restoreCycles, 20);
    assert.equal(initial.restoreCount, 20);
    assert.equal(initial.backendRequested, backend);
    await page.locator('#status').evaluate((element) => { element.style.display = 'none'; });

    let exactViewRestores = 0;
    for (const view of views) {
      await page.evaluate(async (selectedView) => {
        window.__rockRegionQa.setView(selectedView);
        await window.__rockRegionQa.setMode('neutral');
      }, view);
      await page.waitForTimeout(250);
      const neutral = await page.locator('canvas').screenshot({ type: 'png' });
      const styled = await page.evaluate(() => window.__rockRegionQa.setMode('styled'));
      assert.equal(styled.regionVertices, 134_981);
      assert.equal(styled.retainedSourceTextures, 3);
      assert.equal(styled.geometryDetail, null);
      const restored = await page.evaluate(() => window.__rockRegionQa.setMode('restored'));
      assert.equal(restored.exactRestore, true);
      await page.waitForTimeout(250);
      const restoredPng = await page.locator('canvas').screenshot({ type: 'png' });
      assert.equal(sha256(restoredPng), sha256(neutral), `${backend}/${view} neutral and restored pixels differ`);
      exactViewRestores += 1;
    }
    backendResults.push({
      requested: backend,
      actual: initial.backendActual,
      exactViewRestores,
      regionVertices: initial.regionVertices,
    });
    await page.close();
  }
  assert.equal(backendResults[0].actual, 'webgl');

  console.log(`Rock-region clean-consumer verification passed: ${JSON.stringify({
    install: 'npm-tarball',
    publicImportsOnly: true,
    build: true,
    backendResults,
    viewsPerBackend: views.length,
    restoreCycles: 20,
  })}`);
} finally {
  if (browser) await browser.close();
  if (preview) preview.kill('SIGTERM');
  await rm(temporaryRoot, { recursive: true, force: true });
}
