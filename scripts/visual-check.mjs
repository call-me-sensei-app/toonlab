import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { chromium } from 'playwright';

// The saturation threshold below is tuned against the colorful Ganyu test
// model, so the default URL pins it explicitly (the app default is now the
// neutral-gray CC0 mannequin, which reads as unsaturated on purpose). This is
// a maintainer tool: it assumes the private assets-local/ drop-in exists.
const appUrl = process.env.VISUAL_CHECK_URL
  || 'http://127.0.0.1:5175/shader-lab/legacy/?test=visual-check&model=assets-local/models/tests/pmx/ganyu/ganyu.pmx';
const outDir = process.env.VISUAL_OUT_DIR || '/private/tmp/threejs-toon-shader';
const appUrlObject = new URL(appUrl);
const checksWaterScene = appUrlObject.searchParams.get('scene') === 'water';
const requestedRenderer = (appUrlObject.searchParams.get('renderer') || 'webgpu').toLowerCase();
// Default WebGPU and `renderer=webgl|webgpu-forced-gl` all run the TSL
// renderer; headless WebGPU flags are safe for the fallback as well.

const viewports = [
  { name: 'desktop', width: 2048, height: 1160 },
  { name: 'mobile', width: 390, height: 844 },
];

await mkdir(outDir, { recursive: true });

function chromiumLaunchOptions() {
  const options = {
    args: ['--enable-unsafe-webgpu', '--enable-gpu'],
    headless: true,
  };
  if (process.env.PLAYWRIGHT_BROWSER_CHANNEL) options.channel = process.env.PLAYWRIGHT_BROWSER_CHANNEL;
  if (process.env.PLAYWRIGHT_EXECUTABLE_PATH) options.executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
  return options;
}

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function analyzePng(buffer) {
  const signature = '89504e470d0a1a0a';
  if (buffer.subarray(0, 8).toString('hex') !== signature) {
    return { ok: false, reason: 'not a png' };
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;

    if (type === 'IHDR') {
      width = buffer.readUInt32BE(dataStart);
      height = buffer.readUInt32BE(dataStart + 4);
      bitDepth = buffer[dataStart + 8];
      colorType = buffer[dataStart + 9];
    } else if (type === 'IDAT') {
      idatChunks.push(buffer.subarray(dataStart, dataEnd));
    } else if (type === 'IEND') {
      break;
    }

    offset = dataEnd + 4;
  }

  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
    return { ok: false, reason: `unsupported png format ${bitDepth}/${colorType}` };
  }

  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const inflated = inflateSync(Buffer.concat(idatChunks));
  let readOffset = 0;
  let previous = Buffer.alloc(stride);
  let activePixels = 0;
  let saturatedPixels = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[readOffset];
    readOffset += 1;
    const row = Buffer.from(inflated.subarray(readOffset, readOffset + stride));
    readOffset += stride;

    for (let i = 0; i < stride; i += 1) {
      const left = i >= channels ? row[i - channels] : 0;
      const up = previous[i];
      const upLeft = i >= channels ? previous[i - channels] : 0;
      let predicted = 0;

      if (filter === 1) predicted = left;
      else if (filter === 2) predicted = up;
      else if (filter === 3) predicted = Math.floor((left + up) / 2);
      else if (filter === 4) predicted = paethPredictor(left, up, upLeft);

      row[i] = (row[i] + predicted) & 0xff;
    }

    for (let x = 0; x < width; x += 1) {
      const i = x * channels;
      const r = row[i];
      const g = row[i + 1];
      const b = row[i + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;

      if ((luma > 42 && (max - min > 12 || luma > 100)) || max - min > 25) activePixels += 1;
      if (max - min > 25 && luma > 30) saturatedPixels += 1;
    }

    previous = row;
  }

  const total = width * height;
  return {
    ok: activePixels / total > 0.02 && saturatedPixels / total > 0.002,
    imageWidth: width,
    imageHeight: height,
    activeRatio: activePixels / total,
    saturatedRatio: saturatedPixels / total,
  };
}

const browser = await chromium.launch(chromiumLaunchOptions());

function urlForViewport(url, viewportName) {
  const nextUrl = new URL(url);
  nextUrl.searchParams.set('viewport', viewportName);
  return nextUrl.href;
}

const results = [];
let failed = false;

for (const viewport of viewports) {
  const messages = [];
  const page = await browser.newPage({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
  });

  page.on('console', (message) => {
    messages.push({ type: message.type(), text: message.text() });
  });
  page.on('pageerror', (error) => {
    messages.push({ type: 'pageerror', text: error.message });
  });

  await page.goto(urlForViewport(appUrl, viewport.name), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (
    document.body.dataset.modelReady === 'true' ||
    document.body.dataset.modelReady === 'error'
  ), { timeout: 25000 });
  if (checksWaterScene) {
    await page.waitForFunction(() => (
      document.body.dataset.waterReady === 'true' ||
      document.body.dataset.modelReady === 'error'
    ), { timeout: 25000 });
    await page.selectOption('#waterMode', 'ocean');
    await page.waitForFunction(() => document.body.dataset.waterMode === 'ocean', { timeout: 5000 });
    await page.click('.water-drop-button');
    await page.waitForFunction(() => Number(document.body.dataset.waterBallCount || 0) >= 2, { timeout: 5000 });
    await page.click('.water-sinker-button');
    await page.waitForFunction(() => Number(document.body.dataset.waterSplashCount || 0) >= 1, { timeout: 8000 });
  }
  await page.waitForTimeout(500);

  const screenshotPrefix = checksWaterScene ? 'water-playground' : 'toon-model';
  const screenshotPath = join(outDir, `${screenshotPrefix}-${viewport.name}.png`);
  const screenshot = await page.screenshot({ path: screenshotPath });
  const stats = analyzePng(screenshot);
  const modelState = await page.evaluate(() => ({
    convertedMeshCount: document.body.dataset.convertedMeshCount || null,
    environmentAoOverlayCount: document.body.dataset.environmentAoOverlayCount || null,
    environmentBackdropReady: document.body.dataset.environmentBackdropReady || null,
    environmentMeshCount: document.body.dataset.environmentMeshCount || null,
    environmentOpenWindowCount: document.body.dataset.environmentOpenWindowCount || null,
    environmentReady: document.body.dataset.environmentReady || null,
    environmentShadowMeshCount: document.body.dataset.environmentShadowMeshCount || null,
    environmentSunReady: document.body.dataset.environmentSunReady || null,
    ambientLightCount: document.body.dataset.ambientLightCount || null,
    directionalLightCount: document.body.dataset.directionalLightCount || null,
    ecctrlY: document.body.dataset.ecctrlY || null,
    hemisphereLightCount: document.body.dataset.hemisphereLightCount || null,
    modelFormat: document.body.dataset.modelFormat || null,
    modelReady: document.body.dataset.modelReady,
    pointLightCount: document.body.dataset.pointLightCount || null,
    scene: document.body.dataset.scene || null,
    spotLightCount: document.body.dataset.spotLightCount || null,
    toonDebugMode: document.body.dataset.toonDebugMode || null,
    toonDebugValue: document.body.dataset.toonDebugValue || null,
    totalLightCount: document.body.dataset.totalLightCount || null,
    waterBallCount: document.body.dataset.waterBallCount || null,
    waterControllerStabilized: document.body.dataset.waterControllerStabilized || null,
    rendererBackend: document.body.dataset.rendererBackend || null,
    rendererKind: document.body.dataset.rendererKind || null,
    waterLevel: document.body.dataset.waterLevel || null,
    waterMode: document.body.dataset.waterMode || null,
    waterReady: document.body.dataset.waterReady || null,
    waterSplashCount: document.body.dataset.waterSplashCount || null,
  }));

  const severeMessages = messages.filter((message) => (
    message.type === 'error' ||
    message.type === 'pageerror'
  ));

  // A silent fallback must fail the check, not impersonate the backend
  // under test (same rule as baseline-capture).
  const expectedBackend = {
    webgl: 'webgl2-fallback',
    webgpu: 'webgpu',
    'webgpu-forced-gl': 'webgl2-fallback',
  }[requestedRenderer];
  if (modelState.rendererBackend !== expectedBackend) {
    severeMessages.push({
      type: 'error',
      text: `renderer backend mismatch: requested ${requestedRenderer}, page reports ${modelState.rendererBackend}`,
    });
  }

  if (
    modelState.modelReady !== 'true' ||
    (checksWaterScene && modelState.waterReady !== 'true') ||
    (checksWaterScene && Number(modelState.ecctrlY) < -2) ||
    (checksWaterScene && Number(modelState.waterBallCount || 0) < 3) ||
    (checksWaterScene && Number(modelState.waterSplashCount || 0) < 1) ||
    !stats.ok ||
    severeMessages.length > 0
  ) failed = true;

  results.push({
    ...modelState,
    viewport: viewport.name,
    screenshotPath,
    stats,
    severeMessages,
  });

  await page.close();
}

await browser.close();

console.log(JSON.stringify(results, null, 2));

if (failed) {
  process.exitCode = 1;
}
