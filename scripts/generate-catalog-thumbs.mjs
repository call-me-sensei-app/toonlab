// Renders a webp thumbnail for every SPAWNABLE catalog entry through the
// catalog thumb harness (catalog/thumbs.html). The generalized successor to
// generate-debris-thumbs.mjs — one camera/lighting rig across clusters.
//
// Usage (dev server already running):
//   BASE_URL=http://localhost:5175 node scripts/generate-catalog-thumbs.mjs
//   ONLY=prop  node ...          # substring filter on entry ids

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

import { builtinCatalogEntries } from '../src/catalog/builtinEntries.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'labs', 'catalog', 'thumbs');
const BASE = process.env.BASE_URL ?? 'http://localhost:5175';
const ONLY = process.env.ONLY ?? null;

const SPAWNABLE = new Set(['propgen', 'vegetation', 'rockgen', 'debrisgen']);

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const entries = builtinCatalogEntries()
    .filter((entry) => SPAWNABLE.has(entry.cluster))
    .filter((entry) => !ONLY || entry.id.includes(ONLY));

  const browser = await chromium.launch({
    args: ['--enable-unsafe-webgpu', '--enable-gpu'],
    headless: true,
  });
  const page = await browser.newPage({ viewport: { height: 384, width: 512 } });

  let done = 0;
  for (const entry of entries) {
    const url = `${BASE}/catalog/thumbs.html?entry=${encodeURIComponent(entry.id)}&w=512&h=384`;
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(
        () => ['thumb-ready', 'thumb-error'].includes(document.title),
        { timeout: 60000 },
      );
      const title = await page.title();
      if (title === 'thumb-error') {
        console.error(`skip ${entry.id}: harness error`);
        continue;
      }
      // encode webp in-page: keeps alpha, no native deps
      const dataUrl = await page.evaluate(() => document
        .querySelector('canvas')
        .toDataURL('image/webp', 0.88));
      const buffer = Buffer.from(dataUrl.split(',')[1], 'base64');
      const file = path.join(OUT_DIR, `${entry.id.replaceAll('/', '-')}.webp`);
      writeFileSync(file, buffer);
      done += 1;
      console.log(`ok   ${entry.id} → ${path.relative(ROOT, file)} (${(buffer.length / 1024).toFixed(0)} kB)`);
    } catch (error) {
      console.error(`skip ${entry.id}: ${error.message.split('\n')[0]}`);
    }
  }
  await browser.close();
  console.log(`\n${done}/${entries.length} thumbnails written to ${path.relative(ROOT, OUT_DIR)}`);
  process.exit(done > 0 ? 0 : 1);
}

main();
