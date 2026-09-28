import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { chromium } from 'playwright';

const beforeDir = process.argv[2] || process.env.VISUAL_BASELINE_BEFORE;
const afterDir = process.argv[3] || process.env.VISUAL_BASELINE_AFTER;

function chromiumLaunchOptions() {
  const options = { headless: true };
  if (process.env.PLAYWRIGHT_BROWSER_CHANNEL) options.channel = process.env.PLAYWRIGHT_BROWSER_CHANNEL;
  if (process.env.PLAYWRIGHT_EXECUTABLE_PATH) options.executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
  return options;
}

if (!beforeDir || !afterDir) {
  console.error('Usage: npm run baseline:compare -- /path/to/before /path/to/after');
  process.exit(1);
}

if (!existsSync(beforeDir) || !existsSync(afterDir)) {
  console.error(`Both baseline directories must exist: ${beforeDir} ${afterDir}`);
  process.exit(1);
}

function listPngFiles(directory) {
  return readdirSync(directory)
    .filter((file) => file.endsWith('.png'))
    .sort();
}

function dataUrlForPng(path) {
  return `data:image/png;base64,${readFileSync(path, 'base64')}`;
}

const beforeFiles = listPngFiles(beforeDir);
const afterFiles = new Set(listPngFiles(afterDir));
const missing = beforeFiles.filter((file) => !afterFiles.has(file));
const sharedFiles = beforeFiles.filter((file) => afterFiles.has(file));

if (sharedFiles.length === 0) {
  console.error('No matching PNG files were found.');
  process.exit(1);
}

const browser = await chromium.launch(chromiumLaunchOptions());
const page = await browser.newPage();

const results = [];
for (const file of sharedFiles) {
  const beforeUrl = dataUrlForPng(join(beforeDir, file));
  const afterUrl = dataUrlForPng(join(afterDir, file));
  const metrics = await page.evaluate(async ({ afterUrl, beforeUrl }) => {
    const loadImage = (src) => new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = src;
    });

    const [beforeImage, afterImage] = await Promise.all([
      loadImage(beforeUrl),
      loadImage(afterUrl),
    ]);

    if (beforeImage.width !== afterImage.width || beforeImage.height !== afterImage.height) {
      return {
        afterHeight: afterImage.height,
        afterWidth: afterImage.width,
        beforeHeight: beforeImage.height,
        beforeWidth: beforeImage.width,
        diffPixels: null,
        maxDelta: null,
        meanDelta: null,
      };
    }

    const canvas = document.createElement('canvas');
    canvas.width = beforeImage.width;
    canvas.height = beforeImage.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(beforeImage, 0, 0);
    const beforePixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(afterImage, 0, 0);
    const afterPixels = context.getImageData(0, 0, canvas.width, canvas.height).data;

    let diffPixels = 0;
    let maxDelta = 0;
    let sumDelta = 0;
    const pixelCount = beforePixels.length / 4;
    for (let index = 0; index < beforePixels.length; index += 4) {
      const delta =
        Math.abs(beforePixels[index] - afterPixels[index]) +
        Math.abs(beforePixels[index + 1] - afterPixels[index + 1]) +
        Math.abs(beforePixels[index + 2] - afterPixels[index + 2]) +
        Math.abs(beforePixels[index + 3] - afterPixels[index + 3]);

      if (delta > 0) diffPixels += 1;
      if (delta > maxDelta) maxDelta = delta;
      sumDelta += delta;
    }

    return {
      afterHeight: afterImage.height,
      afterWidth: afterImage.width,
      beforeHeight: beforeImage.height,
      beforeWidth: beforeImage.width,
      diffPixels,
      maxDelta,
      meanDelta: sumDelta / pixelCount,
    };
  }, { afterUrl, beforeUrl });

  results.push({ file, ...metrics });
}

await browser.close();

const changed = results.filter((result) => result.diffPixels !== 0);
const summary = {
  after: afterDir,
  before: beforeDir,
  changed,
  changedCount: changed.length,
  comparedCount: results.length,
  missing,
};

console.log(JSON.stringify(summary, null, 2));

if (missing.length > 0) process.exitCode = 1;
