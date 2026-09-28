// Generates WebP card art for every built-in debris preset by driving
// debris-lab/thumbs.html (real environment toon shader, transparent
// background) and encoding the captured canvas to WebP inside Chromium
// (native encoder, alpha preserved — no sharp/cwebp dependency).
// Requires a dev server: `npx vite --port 5199`.
// Usage: node scripts/generate-debris-thumbs.mjs [presetIdFilter,...]

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

import { BUILT_IN_DEBRIS_PRESETS } from '../src/debrisgen/debrisPresets.js';
import { createDebrisRecipeDocument } from '../src/debrisgen/debrisSettings.js';

const base = process.env.DEBRIS_LAB_URL || 'http://localhost:5199/debris-lab/thumbs.html';
const outDir = resolve(dirname(fileURLToPath(import.meta.url)), '../labs/debris-lab/ui/thumbs');
const only = process.argv[2] ? process.argv[2].split(',') : null;
const WIDTH = 512;
const HEIGHT = 356;

mkdirSync(outDir, { recursive: true });

const launchOptions = { args: ['--enable-unsafe-webgpu', '--enable-gpu'], headless: true };
if (process.env.PLAYWRIGHT_BROWSER_CHANNEL) launchOptions.channel = process.env.PLAYWRIGHT_BROWSER_CHANNEL;
if (process.env.PLAYWRIGHT_EXECUTABLE_PATH) launchOptions.executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;

const browser = await chromium.launch(launchOptions);
const page = await browser.newPage({ viewport: { height: HEIGHT, width: WIDTH } });

for (const preset of BUILT_IN_DEBRIS_PRESETS) {
  if (only && !only.some((token) => preset.id.includes(token))) continue;
  const recipe = createDebrisRecipeDocument(preset.settings, { name: preset.label });
  const url = `${base}?w=${WIDTH}&h=${HEIGHT}&recipe=${encodeURIComponent(JSON.stringify(recipe))}`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.title.startsWith('thumb-'), null, { timeout: 30000 });
  const title = await page.title();
  if (title !== 'thumb-ready') {
    console.error(`FAIL ${preset.id}: ${title}`);
    continue;
  }
  const png = await page.locator('canvas').screenshot({ omitBackground: true });
  // Encode to WebP in-page: Chromium's canvas encoder keeps alpha.
  const webpDataUrl = await page.evaluate(async (pngBase64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${pngBase64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext('2d').drawImage(image, 0, 0);
    return canvas.toDataURL('image/webp', 0.88);
  }, png.toString('base64'));
  const webp = Buffer.from(webpDataUrl.split(',')[1], 'base64');
  writeFileSync(`${outDir}/${preset.id}.webp`, webp);
  console.log(`${preset.id.padEnd(24)} ${(webp.length / 1024).toFixed(1)} KB`);
}

await browser.close();
console.log('done ->', outDir);
