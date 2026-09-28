import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const outputDirectory = process.env.ROCK_REALISM_OUT
  || new URL('../artifacts/research/rock-realism-poc/captures/', import.meta.url).pathname;
const baseUrl = process.env.ROCK_REALISM_URL || 'http://localhost:5178';
const width = Number(process.env.ROCK_REALISM_WIDTH || 1440);
const height = Number(process.env.ROCK_REALISM_HEIGHT || 960);

const shots = [
  ...[1, 2, 3].map((seed) => ({
    name: `seed-${seed}-compiled-realistic-hero`,
    query: { material: 'realistic', pipeline: 'compiled', seed, view: 'hero' },
  })),
  {
    name: 'seed-1-compiled-realistic-close',
    query: { material: 'realistic', pipeline: 'compiled', seed: 1, view: 'close' },
  },
  {
    name: 'seed-1-compiled-wire-hero',
    query: { material: 'wire', pipeline: 'compiled', seed: 1, view: 'hero' },
  },
  ...[1, 2, 3].map((seed) => ({
    name: `seed-${seed}-reference-realistic-hero`,
    query: { material: 'realistic', mesher: 'vibe', seed, view: 'hero' },
  })),
  ...[1, 2, 3].map((seed) => ({
    name: `seed-${seed}-toonlab-realistic-hero`,
    query: { material: 'realistic', mesher: 'toonlab', seed, view: 'hero' },
  })),
  {
    name: 'seed-1-reference-clay-ortho',
    query: { material: 'clay', mesher: 'vibe', seed: 1, view: 'ortho' },
  },
  {
    name: 'seed-1-reference-realistic-close',
    query: { material: 'realistic', mesher: 'vibe', seed: 1, view: 'close' },
  },
  {
    name: 'seed-1-reference-wire-hero',
    query: { material: 'wire', mesher: 'vibe', seed: 1, view: 'hero' },
  },
  {
    name: 'seed-3-reference-clay-top',
    query: { material: 'clay', mesher: 'vibe', seed: 3, view: 'top' },
  },
  {
    name: 'seed-1-reference-mesh-normals-close',
    query: { detailNormals: 0, material: 'realistic', mesher: 'vibe', seed: 1, view: 'close' },
  },
];

await mkdir(outputDirectory, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  deviceScaleFactor: 1,
  viewport: { height, width },
});

const errors = [];
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});
page.on('pageerror', (error) => errors.push(`page: ${error.stack ?? error.message}`));

const manifest = [];
for (const shot of shots) {
  errors.length = 0;
  const query = new URLSearchParams({
    ...Object.fromEntries(Object.entries(shot.query).map(([key, value]) => [key, String(value)])),
    hud: '0',
    renderer: 'webgl',
    resolution: process.env.ROCK_REALISM_RESOLUTION || '64',
  });
  const url = `${baseUrl}/labs/rock-realism-poc/?${query}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(
    () => document.body.dataset.rockReady === 'true' || Boolean(document.body.dataset.rockError),
    { timeout: 180000 },
  );
  const state = await page.evaluate(() => ({
    error: document.body.dataset.rockError ?? null,
    report: document.body.dataset.rockReport ?? null,
  }));
  if (state.error) throw new Error(`${shot.name}: ${state.error}`);
  if (!state.report) throw new Error(`${shot.name}: ready without a report`);
  await page.waitForTimeout(350);
  const file = `${shot.name}.png`;
  await page.screenshot({ path: `${outputDirectory}/${file}` });
  if (errors.length > 0) throw new Error(`${shot.name}: ${errors.join('\n')}`);
  manifest.push({ file, report: JSON.parse(state.report), url });
  console.log(`captured ${shot.name}`);
}

await writeFile(
  `${outputDirectory}/manifest.json`,
  `${JSON.stringify({ capturedAt: new Date().toISOString(), shots: manifest }, null, 2)}\n`,
);
await browser.close();
console.log(`${manifest.length} captures written to ${outputDirectory}`);
