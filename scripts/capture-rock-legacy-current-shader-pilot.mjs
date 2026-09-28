#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { chromium } from 'playwright';

const repoRoot = path.resolve(process.cwd());
const baseUrl = process.env.ROCK_SHADER_BASE_URL || 'http://127.0.0.1:5173';
const pipeline = process.env.ROCK_SHADER_PIPELINE === 'c7' ? 'c7' : 'current-only';
const requestedTimeOfDay = Number(process.env.ROCK_SHADER_TIME ?? 13);
const timeOfDay = Number.isFinite(requestedTimeOfDay)
  ? ((requestedTimeOfDay % 24) + 24) % 24
  : 13;
const styledMode = pipeline === 'c7' ? 'styled-c7' : 'styled';
const reviewModes = pipeline === 'c7'
  ? ['source', 'pbr-c7', 'styled-c7']
  : ['source', 'styled'];
const sourceRoot = path.join(repoRoot, 'artifacts/research/rock-geology-v2/legacy-480-c7-pilot-v0.1');
const sourceReport = JSON.parse(await readFile(path.join(sourceRoot, 'pilot-report.json'), 'utf8'));
const outputRoot = path.join(
  repoRoot,
  pipeline === 'c7'
    ? `artifacts/research/rock-geology-v2/latest-480-c7-from-scratch-pilot-v0.2${timeOfDay === 13 ? '' : `-time-${timeOfDay}`}`
    : 'artifacts/research/rock-geology-v2/legacy-480-current-shader-pilot-v0.1',
);
const renderRoot = path.join(outputRoot, 'renders');
const captureRoot = path.join(outputRoot, 'captures');
const mapRoot = path.join(outputRoot, 'maps');
await mkdir(renderRoot, { recursive: true });
await mkdir(captureRoot, { recursive: true });
if (pipeline === 'c7') await mkdir(mapRoot, { recursive: true });

const allAssets = [
  { id: 'rock-0001', name: 'Weathered Fragment 4', family: 'weathered-limestone' },
  { id: 'rock-0287', name: 'Broad Cliff Wall 2', family: 'weathered-limestone' },
  { id: 'rock-0002', name: 'Rounded Boulder 4', family: 'blocky-granite' },
  { id: 'rock-0200', name: 'Fractured Block 9', family: 'blocky-granite' },
  { id: 'rock-0005', name: 'Layered Slab 9', family: 'layered-sandstone' },
  { id: 'rock-0358', name: 'Hoodoo 2', family: 'layered-sandstone' },
  { id: 'rock-0018', name: 'Rounded Boulder 14', family: 'alpine-granite' },
  { id: 'rock-0298', name: 'Cliff Termination 1', family: 'alpine-granite' },
  { id: 'rock-0362', name: 'Column Field 6', family: 'columnar-basalt' },
  { id: 'rock-0450', name: 'Column Kit 2', family: 'columnar-basalt' },
  { id: 'rock-0360', name: 'Spire 4', family: 'sharp-karst' },
  { id: 'rock-0364', name: 'Natural Arch 7', family: 'sharp-karst' },
];
const requestedAssetIds = new Set(
  String(process.env.ROCK_SHADER_ASSETS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
);
const assets = requestedAssetIds.size > 0
  ? allAssets.filter(({ id }) => requestedAssetIds.has(id))
  : allAssets;
if (assets.length === 0) {
  throw new Error(`ROCK_SHADER_ASSETS did not match a pilot asset: ${[...requestedAssetIds].join(', ')}`);
}
const families = [...new Set(assets.map((asset) => asset.family))];

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

const protectedBefore = await Promise.all(assets.map(async (asset) => {
  const file = path.join(sourceRoot, asset.id, 'original/rock.glb');
  const bytes = await readFile(file);
  return { assetId: asset.id, bytes: bytes.length, file, sha256: sha256(bytes) };
}));

const browserErrors = [];
const shots = [];
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ deviceScaleFactor: 1, viewport: { width: 900, height: 900 } });
  page.on('pageerror', (error) => browserErrors.push({ kind: 'pageerror', text: String(error) }));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push({ kind: 'console', text: message.text() });
  });
  for (const asset of assets) {
    for (const mode of reviewModes) {
      const query = new URLSearchParams({
        asset: asset.id,
        mode,
        renderer: 'webgl',
        time: String(timeOfDay),
      });
      await page.goto(`${baseUrl}/labs/rock-legacy-current-shader/?${query}`, {
        timeout: 120_000,
        waitUntil: 'domcontentloaded',
      });
      await page.waitForFunction(
        () => document.body.dataset.modelReady === 'true' && Boolean(document.body.dataset.rockReport),
        null,
        { timeout: 180_000 },
      );
      await page.waitForTimeout(200);
      const report = JSON.parse(await page.evaluate(() => document.body.dataset.rockReport));
      const directory = path.join(renderRoot, asset.id);
      await mkdir(directory, { recursive: true });
      const file = path.join(directory, `${mode}.png`);
      await page.locator('#stage').screenshot({ path: file });
      const mapFiles = [];
      if (mode === 'styled-c7') {
        const maps = await page.evaluate(() => window.exportC7GeologyMaps?.() ?? null);
        const directoryForMaps = path.join(mapRoot, asset.id);
        await mkdir(directoryForMaps, { recursive: true });
        for (const [role, dataUrl] of Object.entries(maps ?? {})) {
          const bytes = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
          const mapFile = path.join(directoryForMaps, `${role}.png`);
          await writeFile(mapFile, bytes);
          mapFiles.push({ role, file: mapFile, bytes: bytes.length, sha256: sha256(bytes) });
        }
      }
      shots.push({ asset, bytes: (await stat(file)).size, file, mapFiles, mode, report });
      console.log(`captured ${asset.id}/${mode}`);
    }
  }
  await page.close();

  const pageForBoards = await browser.newPage({ deviceScaleFactor: 1, viewport: { width: 1800, height: 1000 } });
  const css = `*{box-sizing:border-box}body{margin:0;padding:22px;background:#09100e;color:#edf3ef;font-family:Inter,system-ui,sans-serif}h1{font-size:27px;margin:0}.lead{margin:6px 0 16px;color:#a8b8af;font-size:12px}.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.pair{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:13px}.triple{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:13px}.card{position:relative;border:1px solid #34423b;border-radius:10px;overflow:hidden;background:#1b231f}.card img{display:block;width:100%}.label{position:absolute;left:9px;top:9px;background:#08100cdd;padding:7px 9px;border-radius:7px;font-weight:750;font-size:12px}.note{padding:8px 10px;background:#101713;color:#acbbb2;font:10px ui-monospace,monospace}.asset{margin:12px 0 7px;padding:8px 10px;border-left:3px solid #75a58d;background:#111a16;font-size:14px}.overviewAsset{border:1px solid #34423b;border-radius:10px;overflow:hidden;background:#111a16}.overviewAsset .asset{margin:0;border-left:0}.overviewAsset .triple{margin:0;padding:8px}.foot{margin-top:12px;padding:9px 11px;border:1px solid #2e3b35;border-radius:8px;color:#92a39a;font-size:10px}`;
  const relativeImage = (shot) => `../renders/${shot.asset.id}/${shot.mode}.png`;
  for (const family of families) {
    const cards = assets.filter((asset) => asset.family === family).map((asset) => {
      const source = shots.find((shot) => shot.asset.id === asset.id && shot.mode === 'source');
      const pbr = shots.find((shot) => shot.asset.id === asset.id && shot.mode === 'pbr-c7');
      const styled = shots.find((shot) => shot.asset.id === asset.id && shot.mode === styledMode);
      const styledLabel = pipeline === 'c7' ? 'C7 maps → current rock shader' : 'Current ToonLab rock shader';
      const styledNote = pipeline === 'c7'
        ? 'new BaseColor/NormalGL/Height/AO/Roughness → applyRockShader(call_me_sensei) · legacy maps 0%'
        : 'applyRockShader · call_me_sensei · geometry detail off';
      const pbrCard = pipeline === 'c7'
        ? `<div class="card"><div class="label">C7 neutral PBR</div><img src="${relativeImage(pbr)}"><div class="note">new BaseColor + NormalGL + AO + Roughness · no toon shader</div></div>`
        : '';
      return `<div class="asset">${asset.name} · ${asset.id}</div><div class="${pipeline === 'c7' ? 'triple' : 'pair'}"><div class="card"><div class="label">Raw mesh · neutral clay</div><img src="${relativeImage(source)}"><div class="note">latest-480 geometry · zero textures</div></div>${pbrCard}<div class="card"><div class="label">${styledLabel}</div><img src="${relativeImage(styled)}"><div class="note">${styledNote}</div></div></div>`;
    }).join('');
    const heading = pipeline === 'c7'
      ? `${family.replaceAll('-', ' ')} · C7 from-scratch PBR → current rock shader`
      : `${family.replaceAll('-', ' ')} · current ToonLab rock shader`;
    const lead = pipeline === 'c7'
      ? 'Same latest-480 mesh on both sides. Right panel uses only new family-specific C7 PBR maps; embedded legacy maps and the separate 60-texture library contribute 0%.'
      : 'Same immutable legacy geometry. Right panel uses the production Call Me Sensei rock shader and retains supported embedded source channels.';
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><h1>${heading}</h1><p class="lead">${lead}</p>${cards}<div class="foot">No custom preview shader · no remesh · no displacement · no texture-file mutation</div></body></html>`;
    const htmlFile = path.join(captureRoot, `${family}.html`);
    await writeFile(htmlFile, html);
    const artifactFolder = path.basename(outputRoot);
    await pageForBoards.goto(`${baseUrl}/artifacts/research/rock-geology-v2/${artifactFolder}/captures/${family}.html`, { waitUntil: 'networkidle' });
    const file = path.join(captureRoot, `${family}.png`);
    await pageForBoards.screenshot({ path: file, fullPage: true });
  }
  const overviewCards = assets.map((asset) => {
    const source = shots.find((entry) => entry.asset.id === asset.id && entry.mode === 'source');
    const pbr = shots.find((entry) => entry.asset.id === asset.id && entry.mode === 'pbr-c7');
    const styled = shots.find((entry) => entry.asset.id === asset.id && entry.mode === styledMode);
    const pbrCard = pipeline === 'c7'
      ? `<div class="card"><div class="label">C7 neutral PBR</div><img src="${relativeImage(pbr)}"></div>`
      : '';
    return `<section class="overviewAsset"><div class="asset">${asset.name} · ${asset.family} · ${asset.id}</div><div class="${pipeline === 'c7' ? 'triple' : 'pair'}"><div class="card"><div class="label">Raw mesh/clay</div><img src="${relativeImage(source)}"></div>${pbrCard}<div class="card"><div class="label">C7 + rock shader</div><img src="${relativeImage(styled)}"></div></div></section>`;
  }).join('');
  const overviewTitle = pipeline === 'c7'
    ? 'Latest 480 mesh samples · C7 from scratch → current rock shader'
    : 'Latest 480 mesh samples · actual current rock shader';
  const overviewLead = pipeline === 'c7'
    ? 'Two samples from each family. Fresh deterministic geology maps feed applyRockShader; embedded maps and the separate 60-texture library are preserved but ignored.'
    : 'Two samples from each family, rendered with applyRockShader and the unmodified Call Me Sensei preset.';
  const overviewHtml = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><h1>${overviewTitle}</h1><p class="lead">${overviewLead}</p><main class="grid">${overviewCards}</main><div class="foot">Production public rock shader · TSL WebGL2 fallback · geometry detail disabled · originals protected</div></body></html>`;
  await writeFile(path.join(captureRoot, 'overview.html'), overviewHtml);
  await pageForBoards.goto(`${baseUrl}/artifacts/research/rock-geology-v2/${path.basename(outputRoot)}/captures/overview.html`, { waitUntil: 'networkidle' });
  await pageForBoards.screenshot({ path: path.join(captureRoot, 'overview.png'), fullPage: true });
  await pageForBoards.close();
} finally {
  await browser.close();
}

const protectedAfter = await Promise.all(protectedBefore.map(async (before) => {
  const bytes = await readFile(before.file);
  return { ...before, afterBytes: bytes.length, afterSha256: sha256(bytes), passed: before.bytes === bytes.length && before.sha256 === sha256(bytes) };
}));
const styledShots = shots.filter((shot) => shot.mode === styledMode);
const pbrShots = shots.filter((shot) => shot.mode === 'pbr-c7');
const meshShots = shots.filter((shot) => shot.mode === 'source');
const failures = [];
if (browserErrors.length) failures.push({ browserErrors });
if (!protectedAfter.every((entry) => entry.passed)) failures.push({ sourceMutation: protectedAfter.filter((entry) => !entry.passed) });
for (const shot of styledShots) {
  if (shot.report.shaderRuntime !== 'applyRockShader' || shot.report.shaderPreset !== 'call_me_sensei') failures.push({ assetId: shot.asset.id, reason: 'wrong shader runtime or preset' });
  if (shot.report.styleReport?.applied < 1) failures.push({ assetId: shot.asset.id, reason: 'rock shader did not apply' });
  if (shot.report.styleReport?.geometryDetail !== null) failures.push({ assetId: shot.asset.id, reason: 'geometry detail was not disabled' });
  if (!shot.report.geometryIdentityPassed) failures.push({ assetId: shot.asset.id, reason: 'geometry signature changed' });
  const liveSkyColor = shot.report.lighting?.rockSkyResponse?.skyColor;
  const sceneSkyColor = shot.report.lighting?.skyHorizonColor;
  if (
    !Array.isArray(liveSkyColor)
    || !Array.isArray(sceneSkyColor)
    || liveSkyColor.length !== 3
    || liveSkyColor.some((value, index) => Math.abs(value - sceneSkyColor[index]) > 1e-6)
  ) failures.push({ assetId: shot.asset.id, reason: 'rock shader is not bound to the live scene sky color' });
  if (pipeline === 'c7') {
    if (!shot.report.c7GeologyMaps || shot.report.c7GeologyMaps.size !== 512) failures.push({ assetId: shot.asset.id, reason: 'C7 geology maps missing' });
    const expectedMapRoles = ['ao', 'baseColor', 'height', 'normalGL', 'ormHeight', 'roughness', 'smoothness'];
    if (JSON.stringify(shot.mapFiles.map(({ role }) => role).sort()) !== JSON.stringify(expectedMapRoles)) failures.push({ assetId: shot.asset.id, reason: 'C7 geology maps were not all persisted' });
    if (JSON.stringify(shot.report.pipeline) !== JSON.stringify(['latest-480-mesh', 'c7-from-scratch-realistic-pbr', 'call_me_sensei-rock-shader'])) failures.push({ assetId: shot.asset.id, reason: 'wrong C7-to-current-shader pipeline' });
    if (shot.report.styleReport?.textureSource !== 'provided') failures.push({ assetId: shot.asset.id, reason: 'current shader did not use provided C7 maps' });
    const composition = shot.report.styleReport?.materials?.[0]?.textureComposition
      ?? shot.report.textureCompositions?.[0]
      ?? null;
    if (shot.report.c7GeologyMaps?.embeddedTextureContribution !== 0 || shot.report.c7GeologyMaps?.standaloneTextureLibraryContribution !== 0) failures.push({ assetId: shot.asset.id, reason: 'legacy texture contribution is not explicitly zero' });
    if (!composition) failures.push({ assetId: shot.asset.id, reason: 'shader texture composition audit is missing' });
    if (composition && (
      composition.sourceAlbedoStrength !== 0
      || composition.sourceNormalStrength !== 0
      || composition.sourceAoStrength !== 0
      || composition.sourceTextureCount !== 0
      || composition.sourcePbrChannels?.albedo
      || composition.sourcePbrChannels?.normal
      || composition.sourcePbrChannels?.occlusion
      || composition.sourcePbrChannels?.metallicRoughness
    )) failures.push({ assetId: shot.asset.id, reason: 'shader still retains a legacy source texture channel' });
    if (composition && composition.sourcePbrChannels?.primaryAo !== true) failures.push({ assetId: shot.asset.id, reason: 'new C7 AO map is not active' });
  }
}
for (const shot of pbrShots) {
  if (shot.report.shaderRuntime !== 'THREE.MeshStandardNodeMaterial') failures.push({ assetId: shot.asset.id, reason: 'C7 neutral PBR did not use the triplanar standard PBR stage' });
  if (shot.report.c7PbrReport?.applied < 1 || shot.report.c7PbrReport?.sourceTextureCount !== 0) failures.push({ assetId: shot.asset.id, reason: 'C7 neutral PBR stage is missing or retained legacy textures' });
  if (!shot.report.geometryIdentityPassed) failures.push({ assetId: shot.asset.id, reason: 'geometry changed in C7 neutral PBR stage' });
  if (JSON.stringify(shot.report.pipeline) !== JSON.stringify(['latest-480-mesh', 'c7-from-scratch-realistic-pbr'])) failures.push({ assetId: shot.asset.id, reason: 'wrong neutral C7 PBR pipeline' });
}
for (const shot of meshShots) {
  if (shot.report.shaderRuntime !== 'THREE.MeshStandardMaterial-neutral-clay' || shot.report.meshStageReport?.textureCount !== 0) failures.push({ assetId: shot.asset.id, reason: 'raw mesh stage is not texture-free neutral clay' });
  if (!shot.report.geometryIdentityPassed) failures.push({ assetId: shot.asset.id, reason: 'geometry changed in raw mesh stage' });
  if (JSON.stringify(shot.report.pipeline) !== JSON.stringify(['latest-480-mesh', 'neutral-clay-no-textures'])) failures.push({ assetId: shot.asset.id, reason: 'wrong raw mesh review pipeline' });
}
if (pipeline === 'c7') {
  for (const asset of assets) {
    const pbr = pbrShots.find((shot) => shot.asset.id === asset.id);
    const styled = styledShots.find((shot) => shot.asset.id === asset.id);
    if (
      !pbr
      || !styled
      || pbr.report.c7GeologyMaps?.hash !== styled.report.c7GeologyMaps?.hash
      || pbr.report.c7GeologyMaps?.seed !== styled.report.c7GeologyMaps?.seed
      || pbr.report.c7GeologyMaps?.projectionScaleMetres !== styled.report.c7GeologyMaps?.projectionScaleMetres
      || JSON.stringify(pbr.report.geometryBefore) !== JSON.stringify(styled.report.geometryBefore)
    ) failures.push({ assetId: asset.id, reason: 'neutral PBR and Call Me Sensei stages do not share identical C7 maps, scale, and geometry' });
  }
}
const compactSourceReport = Object.fromEntries(sourceReport.results.map((entry) => [entry.asset.id, entry.asset]));
const report = {
  schema: pipeline === 'c7' ? 'toonlab/latest-480-c7-from-scratch-rock-shader-pilot' : 'toonlab/legacy-current-rock-shader-pilot',
  version: pipeline === 'c7' ? 2 : 1,
  generatedAt: new Date().toISOString(),
  passed: failures.length === 0,
  pipeline,
  timeOfDay,
  shader: { publicEntry: './rock-shader', runtime: 'applyRockShader', preset: 'call_me_sensei', presetOverrides: pipeline === 'c7' ? { assetIntegration: { sourceAlbedoMode: 'replace', sourceAlbedoStrength: 0, sourceNormalStrength: 0, sourceAoStrength: 0 }, material: { useSmoothnessTexture: true }, projection: 'per-family C7 metre scale' } : null, backend: 'tsl-webgl2-fallback' },
  policy: { geometryDetail: false, sourceGlbsMutable: false, originalTexturesMutable: false, embeddedTextureContribution: 0, standaloneTextureLibraryContribution: 0, massRolloutAuthorized: false },
  counts: { assets: assets.length, families: families.length, renders: shots.length, boards: families.length + 1 },
  browserErrors,
  failures,
  protectedSources: protectedAfter,
  assets: assets.map((asset) => compactSourceReport[asset.id] ?? asset),
  renders: shots.map((shot) => ({ asset: shot.asset, bytes: shot.bytes, maps: shot.mapFiles, mode: shot.mode, report: shot.report })),
};
await writeFile(path.join(outputRoot, 'pilot-report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ passed: report.passed, counts: report.counts, browserErrors: browserErrors.length, failures }, null, 2));
if (!report.passed) process.exitCode = 1;
