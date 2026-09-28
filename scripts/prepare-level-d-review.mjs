import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('..', import.meta.url));
const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const outputRoot = resolve(process.argv[2] ?? join(root, '..', 'launch-plan', 'review'));
const temporaryRoot = await mkdtemp(join(tmpdir(), 'toonlab-level-d-'));

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...options,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}

async function availablePort() {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : null;
  await new Promise((resolveClose, reject) => server.close((error) => (error ? reject(error) : resolveClose())));
  assert.ok(Number.isInteger(port) && port > 0, 'Expected an available localhost port');
  return port;
}

async function waitForServer(url, child, output) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Review server exited before readiness.\n${output.join('')}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`Timed out waiting for ${url}.\n${output.join('')}`);
}

async function smokeReview(reviewRoot) {
  const port = await availablePort();
  const output = [];
  const server = spawn('npm', ['run', 'dev', '--', '--port', String(port), '--strictPort'], {
    cwd: reviewRoot,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (chunk) => output.push(String(chunk)));
  server.stderr.on('data', (chunk) => output.push(String(chunk)));
  let browser = null;
  try {
    const origin = `http://127.0.0.1:${port}`;
    await waitForServer(`${origin}/scene-three.html`, server, output);
    browser = await chromium.launch({
      args: ['--enable-unsafe-webgpu', '--enable-gpu'],
      channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || 'chrome',
      headless: true,
    });
    const results = [];
    for (const renderer of ['webgpu', 'webgl']) {
      const page = await browser.newPage({ viewport: { height: 720, width: 1280 } });
      const severe = [];
      page.on('console', (message) => {
        if (message.type() === 'error') severe.push(`console: ${message.text()}`);
      });
      page.on('pageerror', (error) => severe.push(`pageerror: ${error.stack ?? error.message}`));
      const suffix = renderer === 'webgl' ? '?renderer=webgl' : '';
      await page.goto(`${origin}/scene-three.html${suffix}`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.body.dataset.toonlabReady === 'true', null, {
        timeout: 180_000,
      });
      const capture = await page.screenshot({
        path: join(reviewRoot, `scene-three-${renderer}.png`),
        type: 'png',
      });
      const visual = await page.evaluate(async (dataUrl) => {
        const image = await createImageBitmap(await (await fetch(dataUrl)).blob());
        const canvas = new OffscreenCanvas(image.width, image.height);
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.drawImage(image, 0, 0);
        const sample = (x, y) => Array.from(context.getImageData(x, y, 1, 1).data.slice(0, 3));
        return {
          rockLit: sample(900, 400),
          rockShade: sample(1000, 500),
          // The partly-cloudy baseline deliberately crosses the upper frame.
          // Probe several top-row gaps so cloud pixels cannot masquerade as a
          // failed sky palette (or let one lucky gap hide a pale clear color).
          sky: [400, 480, 600, 800, 900, 1100].map((x) => sample(x, 20)),
        };
      }, `data:image/png;base64,${capture.toString('base64')}`);
      const baseline = await page.evaluate(() => ({
        audit: document.body.dataset.toonlabSurfaceAudit,
        auditIssues: document.body.dataset.toonlabSurfaceAuditIssues,
        canvas: Boolean(document.querySelector('canvas')),
        catalogAssets: document.body.dataset.toonlabCatalogAssets ?? '',
        cloudShadow: document.body.dataset.toonlabCloudShadow ?? '',
        cloudShadowMap: document.body.dataset.toonlabCloudShadowMap ?? '',
        cloudShadowSource: document.body.dataset.toonlabCloudShadowSource ?? '',
        grassPlacements: Number(document.body.dataset.toonlabGrassPlacements),
        rockSourceTextureCount: Number(document.body.dataset.toonlabRockSourceTextureCount),
        treeBarkProfile: document.body.dataset.toonlabTreeBarkProfile ?? '',
        treeBarkProfileCount: Number(document.body.dataset.toonlabTreeBarkProfileCount),
        treeShadowCasters: document.body.dataset.toonlabTreeShadowCasters ?? '',
        treeShadowCoverage: document.body.dataset.toonlabTreeShadowCoverage ?? '',
        treeShadowReceivers: document.body.dataset.toonlabTreeShadowReceivers ?? '',
        status: document.querySelector('#status')?.textContent ?? '',
        statusError: document.querySelector('#status')?.dataset.error ?? '',
      }));
      assert.equal(baseline.audit, 'pass', `${renderer}: composed surface audit must pass`);
      assert.equal(baseline.auditIssues, '', `${renderer}: composed surface audit must have zero issues`);
      assert.equal(baseline.canvas, true, `${renderer}: scene canvas must render`);
      assert.equal(baseline.catalogAssets, 'rock-0002,rock-0007,rock-0303',
        `${renderer}: review must render verified official 480-catalog assets`);
      assert.equal(baseline.cloudShadow, 'ready',
        `${renderer}: visible Sky System clouds must publish a shared receiver shadow`);
      assert.equal(baseline.cloudShadowMap, 'ToonLabCloudShadowMap',
        `${renderer}: cloud receivers must consume the authoritative volumetric transmittance map`);
      assert.equal(baseline.cloudShadowSource, 'sky-system-volumetric-transmittance',
        `${renderer}: procedural stand-ins cannot replace the visible Sky System cloud shadow`);
      assert.equal(baseline.rockSourceTextureCount, 9,
        `${renderer}: all three official 480 rocks must retain albedo, normal, and ORM lineage`);
      assert.equal(baseline.treeBarkProfile, 'call-me-sensei-bark-v1',
        `${renderer}: missing authored bark must select the registered Call Me Sensei fallback`);
      assert.equal(baseline.treeBarkProfileCount, 3,
        `${renderer}: every generated review tree must use the registered bark profile`);
      assert.equal(baseline.treeShadowCasters, '3/3',
        `${renderer}: every trunk must cast into the shared pass by package default`);
      assert.equal(baseline.treeShadowReceivers, '3/3',
        `${renderer}: every trunk must consume shared sun/cloud visibility by package default`);
      assert.equal(baseline.treeShadowCoverage, '3/3',
        `${renderer}: shared-pass telemetry must cover every labeled tree target`);
      assert.ok(baseline.grassPlacements >= 1_000, `${renderer}: expected the full meadow placement budget`);
      assert.equal(baseline.statusError, '', `${renderer}: review status must not be an error`);
      assert.match(baseline.status, /surface\/shadows\/sky ready/,
        `${renderer}: readiness must include composed surfaces, shadows, and sky`);
      const blueSkySamples = visual.sky.filter(([red, green, blue]) => (
        red < 50 && green >= 125 && green <= 185 && blue >= 195 && blue - green >= 35
      ));
      assert.ok(blueSkySamples.length >= 4,
        `${renderer}: strict default must visibly render the reviewed saturated blue sky`);
      // Rock color is gated in the fixed dedicated 480-rock view below. The
      // overview samples are retained in the report for diagnostics, but its
      // camera framing is intentionally allowed to evolve with scene layout.

      const toggles = page.locator('#domains input[type="checkbox"]');
      const domainCount = await toggles.count();
      assert.equal(domainCount, 9, `${renderer}: every expected shader domain must be inspectable`);
      for (let index = 0; index < domainCount; index += 1) {
        const toggle = toggles.nth(index);
        await toggle.uncheck();
        await toggle.check();
      }
      await page.waitForTimeout(250);
      assert.deepEqual(await toggles.evaluateAll((nodes) => nodes.map((node) => node.checked)),
        Array(domainCount).fill(true), `${renderer}: all shader domains must restore on`);

      const separator = suffix ? '&' : '?';
      await page.goto(`${origin}/scene-three.html${suffix}${separator}view=rocks`, {
        waitUntil: 'domcontentloaded',
      });
      await page.waitForFunction(() => document.body.dataset.toonlabReady === 'true', null, {
        timeout: 180_000,
      });
      const rockCapture = await page.screenshot({
        path: join(reviewRoot, `scene-three-${renderer}-rocks.png`),
        type: 'png',
      });
      const rockReview = await page.evaluate(async (dataUrl) => {
        const image = await createImageBitmap(await (await fetch(dataUrl)).blob());
        const canvas = new OffscreenCanvas(image.width, image.height);
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.drawImage(image, 0, 0);
        const sample = (x, y) => Array.from(context.getImageData(x, y, 1, 1).data.slice(0, 3));
        return {
          shadeFace: sample(855, 430),
          sunFace: sample(940, 285),
        };
      }, `data:image/png;base64,${rockCapture.toString('base64')}`);
      assert.ok(
        rockReview.sunFace[0] >= 205 && rockReview.sunFace[0] <= 240
          && rockReview.sunFace[1] >= 210 && rockReview.sunFace[1] <= 242
          && rockReview.sunFace[2] >= 220 && rockReview.sunFace[2] <= 250
          && rockReview.sunFace[2] - rockReview.sunFace[0] >= 12
          && rockReview.sunFace[2] - rockReview.sunFace[0] <= 38
          && rockReview.sunFace[1] > rockReview.sunFace[0],
        `${renderer}: dedicated 480-rock view must show the high-key blue-white Call Me Sensei sun face`,
      );
      assert.ok(
        rockReview.shadeFace[0] <= 90
          && rockReview.shadeFace[1] <= 105
          && rockReview.shadeFace[2] >= 105
          && rockReview.shadeFace[2] - rockReview.shadeFace[0] >= 45
          && rockReview.shadeFace[2] > rockReview.shadeFace[1],
        `${renderer}: dedicated 480-rock view must preserve the deep blue sky-probe crease`,
      );

      const receiverViews = {};
      for (const view of ['shadow-rock', 'shadow-bench', 'tree-bark', 'shore', 'sky']) {
        await page.goto(`${origin}/scene-three.html${suffix}${separator}view=${view}`, {
          waitUntil: 'domcontentloaded',
        });
        await page.waitForFunction(() => document.body.dataset.toonlabReady === 'true', null, {
          timeout: 180_000,
        });
        await page.screenshot({
          path: join(reviewRoot, `scene-three-${renderer}-${view}.png`),
          type: 'png',
        });
        const receiverState = await page.evaluate(() => ({
          audit: document.body.dataset.toonlabSurfaceAudit ?? '',
          auditIssues: document.body.dataset.toonlabSurfaceAuditIssues ?? '',
          cloudShadow: document.body.dataset.toonlabCloudShadow ?? '',
          cloudShadowMap: document.body.dataset.toonlabCloudShadowMap ?? '',
          cloudShadowSource: document.body.dataset.toonlabCloudShadowSource ?? '',
          statusError: document.querySelector('#status')?.dataset.error ?? '',
          treeBarkProfile: document.body.dataset.toonlabTreeBarkProfile ?? '',
          treeBarkProfileCount: Number(document.body.dataset.toonlabTreeBarkProfileCount),
          treeShadowCasters: document.body.dataset.toonlabTreeShadowCasters ?? '',
          treeShadowCoverage: document.body.dataset.toonlabTreeShadowCoverage ?? '',
          treeShadowReceivers: document.body.dataset.toonlabTreeShadowReceivers ?? '',
        }));
        assert.equal(receiverState.audit, 'pass', `${renderer}/${view}: surface audit must pass`);
        assert.equal(receiverState.auditIssues, '', `${renderer}/${view}: surface audit must have zero issues`);
        assert.equal(receiverState.cloudShadow, 'ready',
          `${renderer}/${view}: the visible clouds must cast through the shared receiver map`);
        assert.equal(receiverState.cloudShadowMap, 'ToonLabCloudShadowMap',
          `${renderer}/${view}: must bind the actual Sky System cloud-shadow texture`);
        assert.equal(receiverState.cloudShadowSource, 'sky-system-volumetric-transmittance',
          `${renderer}/${view}: cannot fall back to an unrelated procedural cloud field`);
        assert.equal(receiverState.statusError, '', `${renderer}/${view}: review status must not be an error`);
        assert.equal(receiverState.treeBarkProfile, 'call-me-sensei-bark-v1',
          `${renderer}/${view}: missing bark must resolve through the registered style profile`);
        assert.equal(receiverState.treeBarkProfileCount, 3,
          `${renderer}/${view}: all generated trees must retain the fallback surface`);
        assert.equal(receiverState.treeShadowCasters, '3/3',
          `${renderer}/${view}: all trunks must remain shared-pass casters`);
        assert.equal(receiverState.treeShadowReceivers, '3/3',
          `${renderer}/${view}: all trunks must remain shared-pass receivers`);
        assert.equal(receiverState.treeShadowCoverage, '3/3',
          `${renderer}/${view}: shadow telemetry must cover all tree targets`);
        receiverViews[view] = receiverState;
      }
      await page.goto(`${origin}/scene-two.html${suffix}`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.body.dataset.toonlabReady === 'true', null, {
        timeout: 180_000,
      });
      await page.screenshot({
        path: join(reviewRoot, `scene-two-${renderer}-collision.png`),
        type: 'png',
      });
      const collisionState = await page.evaluate(() => ({
        audit: document.body.dataset.toonlabSurfaceAudit ?? '',
        auditIssues: document.body.dataset.toonlabSurfaceAuditIssues ?? '',
        bench: document.body.dataset.toonlabCollisionBenchProbe ?? '',
        blockers: Number(document.body.dataset.toonlabCollisionBlockers),
        importedBenchMaterials: Number(document.body.dataset.toonlabImportedBenchMaterials),
        importedBenchParts: Number(document.body.dataset.toonlabImportedBenchParts),
        officialRock: document.body.dataset.toonlabCollisionOfficialRock ?? '',
        ready: document.body.dataset.toonlabCollisionReady ?? '',
        registered: Number(document.body.dataset.toonlabCollisionRegistered),
        rock: document.body.dataset.toonlabCollisionRockProbe ?? '',
        solidTargets: Number(document.body.dataset.toonlabCollisionSolidTargets),
        statusError: document.querySelector('#status')?.dataset.error ?? '',
        tree: document.body.dataset.toonlabCollisionTreeProbe ?? '',
        walkable: document.body.dataset.toonlabWalkableAutoCollision ?? '',
      }));
      assert.equal(collisionState.audit, 'pass', `${renderer}: collision scene surface audit must pass`);
      assert.equal(collisionState.auditIssues, '', `${renderer}: collision scene must have zero audit issues`);
      assert.equal(collisionState.ready, 'true', `${renderer}: package collision runtime must be ready`);
      assert.equal(collisionState.tree, 'pass', `${renderer}: tree trunk must block the character`);
      assert.equal(collisionState.rock, 'pass', `${renderer}: rock must block the character`);
      assert.equal(collisionState.bench, 'pass', `${renderer}: manufactured bench must block the character`);
      assert.equal(collisionState.walkable, 'pass',
        `${renderer}: walkable character must consume bound scene collision automatically`);
      assert.equal(collisionState.officialRock, 'rock-0002',
        `${renderer}: collision scene must use an official 480-catalog rock`);
      assert.ok(collisionState.importedBenchParts >= 2,
        `${renderer}: imported Quaternius bench must retain multiple modeled parts`);
      assert.ok(collisionState.importedBenchMaterials >= 2,
        `${renderer}: imported Quaternius bench must retain complete multi-material labeling`);
      assert.ok(collisionState.registered >= 13, `${renderer}: all solid targets must register collision`);
      assert.ok(collisionState.solidTargets >= 13, `${renderer}: collision report must expose all solid targets`);
      assert.equal(collisionState.blockers, collisionState.registered,
        `${renderer}: lightweight blocker count must match registered collision geometry`);
      assert.equal(collisionState.statusError, '', `${renderer}: collision review status must not be an error`);
      assert.deepEqual(severe, [], `${renderer}: exact packed scene must have zero browser errors`);
      results.push({
        collision: collisionState,
        domainCount,
        renderer,
        receiverViews,
        visual: { overview: visual, rocks: rockReview },
        ...baseline,
      });
      await page.close();
    }
    return results;
  } finally {
    await browser?.close();
    if (server.exitCode === null) server.kill('SIGTERM');
    await new Promise((resolveExit) => {
      if (server.exitCode !== null) resolveExit();
      else server.once('exit', resolveExit);
    });
  }
}

try {
  await mkdir(outputRoot, { recursive: true });
  const packed = JSON.parse(run('npm', [
    'pack', '--dry-run=false', '--json', '--ignore-scripts', '--pack-destination', temporaryRoot,
  ], { cwd: root, env: { ...process.env, npm_config_cache: join(temporaryRoot, 'npm-cache') } }))[0];
  const packedPath = join(temporaryRoot, packed.filename);
  const bytes = await readFile(packedPath);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const reviewName = `level-d-${packageJson.version}-${sha256.slice(0, 12)}`;
  const reviewRoot = join(outputRoot, reviewName);
  await rm(reviewRoot, { force: true, recursive: true });
  await mkdir(join(reviewRoot, 'public', 'characters'), { recursive: true });
  await mkdir(join(reviewRoot, 'public', 'catalog'), { recursive: true });
  await mkdir(join(reviewRoot, 'public', 'props', 'cc0', 'quaternius'), { recursive: true });
  await cp(join(root, 'quality', 'level-d-consumer', 'index.html'), join(reviewRoot, 'index.html'));
  await cp(join(root, 'quality', 'level-d-consumer', 'main.js'), join(reviewRoot, 'main.js'));
  await cp(join(root, 'quality', 'level-d-consumer', 'scene-two.html'), join(reviewRoot, 'scene-two.html'));
  await cp(join(root, 'quality', 'level-d-consumer', 'scene-two.js'), join(reviewRoot, 'scene-two.js'));
  await cp(join(root, 'quality', 'level-d-consumer', 'scene-three.html'), join(reviewRoot, 'scene-three.html'));
  await cp(join(root, 'examples', 'walkable-reference', 'main.js'), join(reviewRoot, 'scene-three.js'));
  await cp(
    join(root, 'examples', 'walkable-reference', 'polishExperiments.js'),
    join(reviewRoot, 'polishExperiments.js'),
  );
  await cp(join(root, 'quality', 'level-d-consumer', 'vite.config.js'), join(reviewRoot, 'vite.config.js'));
  await cp(packedPath, join(reviewRoot, packed.filename));
  for (const extension of ['vrm', 'fbx']) {
    await cp(join(root, 'public', 'characters', `mannequin.${extension}`), join(reviewRoot, 'public', 'characters', `mannequin.${extension}`));
  }
  await cp(join(root, 'public', 'characters', 'LICENSE.md'), join(reviewRoot, 'public', 'characters', 'LICENSE.md'));
  await cp(join(root, 'public', 'basis'), join(reviewRoot, 'public', 'basis'), { recursive: true });
  await cp(join(root, 'public', 'draco'), join(reviewRoot, 'public', 'draco'), { recursive: true });
  await cp(
    join(root, 'quality', 'level-d-consumer', 'public', 'catalog'),
    join(reviewRoot, 'public', 'catalog'),
    { recursive: true },
  );
  await cp(
    join(root, 'public', 'props', 'cc0', 'quaternius', 'fantasy-props-megakit'),
    join(reviewRoot, 'public', 'props', 'cc0', 'quaternius', 'fantasy-props-megakit'),
    { recursive: true },
  );

  const consumerPackage = {
    private: true,
    type: 'module',
    scripts: { build: 'vite build', dev: 'vite --host 127.0.0.1' },
    dependencies: {
      '@call-me-sensei/toonlab': `file:./${packed.filename}`,
      three: packageJson.peerDependencies.three,
    },
    devDependencies: {
      vite: packageJson.devDependencies.vite,
    },
  };
  await writeFile(join(reviewRoot, 'package.json'), `${JSON.stringify(consumerPackage, null, 2)}\n`);
  const sourceFiles = ['main.js', 'scene-two.js', 'scene-three.js'];
  const sources = await Promise.all(sourceFiles.map(async (file) => ({
    file,
    source: await readFile(join(reviewRoot, file), 'utf8'),
  })));
  const viteConfig = await readFile(join(reviewRoot, 'vite.config.js'), 'utf8');
  for (const { file, source } of sources) {
    assert.doesNotMatch(source, /(?:\.\.\/)+src\//, `${file} must not import repository src`);
    assert.doesNotMatch(source, /playground|shader-lab|p18/i, `${file} must not import Lab/showcase code`);
    assert.doesNotMatch(source, /from ['"]three['"]/, `${file} must share the three/webgpu module identity`);
    assert.match(source, /from ['"]three\/webgpu['"]/, `${file} must use the node-renderer Three entry point`);
    assert.match(source, /createStyleMaterialContract/, `${file} must carry material-role contracts`);
    assert.match(source, /toonlabMaterialId/, `${file} must assign stable IDs to material slots`);
    assert.match(source, /mode:\s*'strict'/, `${file} must prove strict bundle application`);
  }
  const secondScene = sources.find(({ file }) => file === 'scene-two.js').source;
  const thirdScene = sources.find(({ file }) => file === 'scene-three.js').source;
  const primaryScene = sources.find(({ file }) => file === 'main.js').source;
  assert.match(primaryScene, /createSceneSurfaceRuntime/,
    'Primary scene must use the public shared scene-surface runtime');
  assert.match(primaryScene, /surface\.createGrassField/,
    'Primary scene grass must be grounded by the shared surface runtime');
  assert.match(primaryScene, /surface\.createWaterSurface/,
    'Primary scene water must inherit bed, shore, and water-level state from the shared surface runtime');
  assert.match(primaryScene, /surface\.place\(bench, \{ anchor: 'bounds'/,
    'Primary scene bench must be bounds-grounded by the shared surface runtime');
  assert.match(primaryScene, /assertReviewFraming/,
    'Primary scene must fail closed when its default camera is outside the terrain framing');
  assert.match(primaryScene, /surface\.audit\(/,
    'Primary scene readiness must use the framework composition audit');
  assert.match(primaryScene, /'manufactured\.surface'/,
    'Primary scene readiness must require manufactured-surface shadow coverage');
  assert.match(primaryScene, /'vegetation\.tree'/,
    'Primary scene readiness must require tree shadow coverage');
  assert.match(primaryScene, /createBenchSourceTextures/,
    'Primary scene bench must carry deterministic source textures into the manufactured shader');
  assert.match(secondScene, /createSceneSurfaceRuntime/, 'Second scene must use an independent public scene-surface runtime');
  assert.match(secondScene, /surface\.createGrassField/, 'Second scene grass must derive placement from the shared surface');
  assert.match(secondScene, /surface\.createWaterSurface/, 'Second scene water must inherit the shared bed and shore contract');
  assert.match(secondScene, /surface\.audit\(/, 'Second scene must fail closed on composition readiness');
  assert.match(secondScene, /createWalkableCharacterRuntime/, 'Second scene must use the public walkable character runtime');
  assert.doesNotMatch(secondScene, /createWorldCollision|addCircles/u,
    'Second scene must prove package-default collision without consumer blocker wiring');
  assert.match(secondScene, /styleRuntime\.collision/u,
    'Second scene must inspect the collision runtime created by the high-level style runtime');
  assert.match(secondScene, /toonlabWalkableAutoCollision/u,
    'Second scene must prove the walkable character consumes package collision automatically');
  assert.match(secondScene, /createOfficialCatalogAssetRuntime/u,
    'Second scene collision must include an official 480-catalog asset');
  assert.match(secondScene, /quaternius\/fantasy-props-megakit\/bench\.glb/u,
    'Second scene collision must include the imported Quaternius multi-part bench');
  assert.match(thirdScene, /createSceneSurfaceRuntime/,
    'Third scene must use the public surface runtime rather than scene-local alignment glue');
  assert.match(thirdScene, /surface\.createGrassField/,
    'Third scene must delegate meadow scatter and finite-water exclusion to the package');
  assert.match(thirdScene, /runtime\.apply\(styleBundle\.document/,
    'Third scene must apply the user-selected resolved bundle through one strict public boundary');
  assert.match(thirdScene, /createOfficialCatalogAssetRuntime/,
    'Third scene must load real official catalog GLBs through the public asset runtime');
  assert.match(thirdScene, /toonlabCloudShadowSource/,
    'Third scene readiness must prove visible Sky System cloud shadows are shared by scene receivers');
  assert.match(thirdScene, /toonlabTreeBarkProfileCount/,
    'Third scene readiness must prove missing authored bark selects a registered style fallback');
  assert.match(thirdScene, /toonlabTreeShadowCoverage/,
    'Third scene readiness must prove every tree casts and receives without consumer repair flags');
  for (const assetId of ['rock-0002', 'rock-0007', 'rock-0303']) {
    assert.match(thirdScene, new RegExp(assetId),
      `Third scene must include verified official catalog asset ${assetId}`);
  }
  assert.match(thirdScene, /partly_cloudy:[\s\S]*preset:\s*'partlyCloudy'/,
    'Third scene must default to the reviewed partly-cloudy physical sky while exposing time changes');
  assert.match(thirdScene, /createWalkableCharacterRuntime/,
    'Third scene must use the public reusable walkable-character runtime');
  assert.match(thirdScene, /requestedCharacterUrl/,
    'Third scene must accept a developer-supplied character URL');
  assert.match(thirdScene, /runtime\.inspector\.setDomainEnabled/,
    'Third scene must keep reversible per-domain shader inspection');
  assert.match(viteConfig, /exclude:\s*\[[^\]]*'@call-me-sensei\/toonlab'[^\]]*'three'/s,
    'Level D consumer must prevent duplicate Three.js prebundle identities');
  assert.match(viteConfig, /dedupe:\s*\[['"]three['"]\]/,
    'Level D consumer must dedupe Three.js package resolution');

  run('npm', ['install', '--ignore-scripts'], {
    cwd: reviewRoot,
    env: { ...process.env, npm_config_cache: join(temporaryRoot, 'npm-cache') },
  });
  run('npm', ['audit', '--omit=dev'], {
    cwd: reviewRoot,
    env: { ...process.env, npm_config_cache: join(temporaryRoot, 'npm-cache') },
  });
  run('npm', ['run', 'build'], { cwd: reviewRoot });
  const runtimeSmoke = await smokeReview(reviewRoot);
  await rm(join(reviewRoot, 'node_modules'), { force: true, recursive: true });
  await rm(join(reviewRoot, 'dist'), { force: true, recursive: true });

  const manifest = {
    artifact: {
      filename: packed.filename,
      integrity: packed.integrity,
      name: packageJson.name,
      sha256,
      size: bytes.byteLength,
      version: packageJson.version,
    },
    audit: { command: 'npm audit --omit=dev', passed: true, scope: 'runtime' },
    build: { command: 'npm install --ignore-scripts && npm run build', passed: true },
    consumer: {
      forbiddenRepositoryImports: false,
      packageEntryPointsOnly: true,
      source: ['index.html', 'main.js', 'scene-two.html', 'scene-two.js', 'scene-three.html', 'scene-three.js', 'polishExperiments.js', 'vite.config.js'],
    },
    generatedAt: new Date().toISOString(),
    knownWarnings: [{
      disposition: 'Source-asset normalization by Three.js FBXLoader; readiness and animation pass, but the independent reviewer must still inspect deformation.',
      messages: [
        'THREE.FBXLoader: Vertex has more than 4 skinning weights assigned to vertex. Deleting additional weights.',
        'THREE.FBXLoader: You are loading an asset with a Z-UP coordinate system. The loader just rotates the asset to transform it into Y-UP. The vertex data are not converted.',
      ],
      scope: '?character=fbx',
    }],
    media: [
      'public/characters/mannequin.vrm',
      'public/characters/mannequin.fbx',
      'public/catalog/rocks/rock-0002/rock.glb',
      'public/props/cc0/quaternius/fantasy-props-megakit/bench.glb',
    ],
    runtimeSmoke: {
      command: 'exact packed scene-three visual review plus scene-two automatic collision review in WebGPU/WebGL',
      passed: true,
      results: runtimeSmoke,
    },
    reviewUrls: [
      'http://127.0.0.1:5173/',
      'http://127.0.0.1:5173/?renderer=webgl',
      'http://127.0.0.1:5173/?quality=performance',
      'http://127.0.0.1:5173/?renderer=webgl&quality=performance',
      'http://127.0.0.1:5173/?character=vrm',
      'http://127.0.0.1:5173/?character=fbx',
      'http://127.0.0.1:5173/scene-two.html',
      'http://127.0.0.1:5173/scene-two.html?renderer=webgl',
      'http://127.0.0.1:5173/scene-two.html?quality=performance',
      'http://127.0.0.1:5173/scene-two.html?renderer=webgl&quality=performance',
      'http://127.0.0.1:5173/scene-two.html?character=vrm',
      'http://127.0.0.1:5173/scene-two.html?character=fbx',
      'http://127.0.0.1:5173/scene-three.html',
      'http://127.0.0.1:5173/scene-three.html?renderer=webgl',
      'http://127.0.0.1:5173/scene-three.html?view=rocks',
      'http://127.0.0.1:5173/scene-three.html?renderer=webgl&view=rocks',
      'http://127.0.0.1:5173/scene-three.html?view=shadow-rock',
      'http://127.0.0.1:5173/scene-three.html?renderer=webgl&view=shadow-rock',
      'http://127.0.0.1:5173/scene-three.html?view=shadow-bench',
      'http://127.0.0.1:5173/scene-three.html?renderer=webgl&view=shadow-bench',
      'http://127.0.0.1:5173/scene-three.html?view=tree-bark',
      'http://127.0.0.1:5173/scene-three.html?renderer=webgl&view=tree-bark',
      'http://127.0.0.1:5173/scene-three.html?view=shore',
      'http://127.0.0.1:5173/scene-three.html?renderer=webgl&view=shore',
      'http://127.0.0.1:5173/scene-three.html?view=sky',
      'http://127.0.0.1:5173/scene-three.html?renderer=webgl&view=sky',
      'http://127.0.0.1:5173/scene-three.html?quality=performance',
      'http://127.0.0.1:5173/scene-three.html?renderer=webgl&quality=performance',
    ],
  };
  await writeFile(join(reviewRoot, 'review-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(join(reviewRoot, 'README.md'), `# ToonLab Level D review\n\n`
    + `Candidate: \`${packageJson.name}@${packageJson.version}\`  \n`
    + `SHA-256: \`${sha256}\`\n\n`
    + `This directory is a clean consumer. It contains the immutable npm tarball, public-API-only scene source, CC0 review media, lockfile, and evidence manifest.\n\n`
    + `## Run\n\n\`\`\`sh\nnpm install --ignore-scripts\nnpm run dev\n\`\`\`\n\n`
    + `Open the URLs in \`review-manifest.json\`, exercise every shader-domain toggle, then complete \`../../09-level-d-certification-scorecard.md\`. The implementation author must not approve that scorecard.\n\n`
    + `The original CC0 FBX emits the two source-normalization warnings listed in the manifest. Any additional warning or error is unexpected and must be recorded.\n`);
  console.log(JSON.stringify({ manifest, reviewRoot }, null, 2));
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}
