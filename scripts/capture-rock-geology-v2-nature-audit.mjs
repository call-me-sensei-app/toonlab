#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const evidenceDirectory = path.resolve(process.argv[2] ?? 'artifacts/research/rock-geology-v2/checkpoint-08-basis-families');
const mediaDirectory = path.resolve(process.argv[3] ?? '/tmp/toonlab-c8-nature-references/images');
const capturesDirectory = path.join(evidenceDirectory, 'captures');

const FORM_REFERENCES = Object.freeze({
  'granite-boulder': ['nps-joshua-tree-granite-boulders-photo', 'granite-boulders.jpg'],
  'granite-tor': ['nps-serpentine-granite-tors', 'granite-tor.jpg'],
  'sandstone-cliff': ['nps-zion-sandstone-crossbedding', 'sandstone-crossbeds.jpg'],
  'sandstone-arch': ['nps-natural-bridges-arch', 'sandstone-arch.webp'],
  'basalt-colonnade': ['nps-columnar-jointing', 'basalt-entablature.jpg'],
  'basalt-entablature': ['nps-columnar-jointing', 'basalt-entablature.jpg'],
  'limestone-spire': ['usgs-kaibab-limestone-pinnacles', 'limestone-pinnacles.jpg'],
  'limestone-cave': ['nps-coronado-limestone-cave-entrance', 'limestone-cave.jpg'],
  'shale-slope': ['nps-florissant-shale-outcrop', 'shale-outcrop.jpg'],
  'slate-outcrop': ['nps-florissant-shale-outcrop', 'shale-outcrop.jpg'],
  'gneiss-outcrop': ['usgs-catalina-gneiss-outcrop', 'gneiss-outcrop.jpg'],
  'schist-outcrop': ['usgs-schist-specimen', 'schist.jpg'],
  'conglomerate-outcrop': ['usgs-lake-mead-fanglomerate', 'conglomerate.jpg'],
  'volcanic-breccia-outcrop': ['usgs-tolay-volcanic-breccia', 'volcanic-breccia.jpg'],
  'river-boulder': ['usgs-colorado-river-boulder', 'river-boulder.jpg'],
  'talus-assembly': ['usgs-devils-tower-talus-blocks', 'talus.jpg'],
});

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function titleCase(value) {
  return value.split('-').map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`).join(' ');
}

function mimeFor(file) {
  if (file.endsWith('.webp')) return 'image/webp';
  if (file.endsWith('.png')) return 'image/png';
  return 'image/jpeg';
}

function dataUrl(bytes, mime) {
  return `data:${mime};base64,${bytes.toString('base64')}`;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function pageHtml(records, pageNumber) {
  const cards = records.map((record) => `<article>
    <header><b>${escapeHtml(titleCase(record.variantId))}</b><span>${escapeHtml(record.referenceId)}</span></header>
    <div class="pair"><figure><img src="${record.natureDataUrl}"><figcaption>NATURE REFERENCE · crop only for review</figcaption></figure><figure><img src="${record.clayDataUrl}"><figcaption>TOONLAB C8 · FIXED CLAY RIG</figcaption></figure></div>
    <div class="traits">${record.reviewTraits.map((trait) => `<span>${escapeHtml(trait)}</span>`).join('')}</div>
    <footer>${escapeHtml(record.rightsStatus)}</footer>
  </article>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:0;padding:26px;background:#0d1312;color:#edf2ef;font-family:Inter,ui-sans-serif,system-ui,sans-serif}h1{margin:0;font-size:28px;letter-spacing:-.025em}.lead{margin:7px 0 19px;color:#aebbb5;font-size:12px}.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}article{overflow:hidden;border:1px solid #394741;border-radius:12px;background:#17201d}header{display:flex;justify-content:space-between;gap:12px;padding:10px 12px}header b{font-size:13px}header span{color:#9baca4;font:9px ui-monospace,monospace}.pair{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:#3a4842}figure{margin:0;background:#111716}img{display:block;width:100%;height:300px;object-fit:cover}figcaption{padding:6px 8px;color:#bdc9c3;font:8px ui-monospace,monospace}.traits{display:flex;flex-wrap:wrap;gap:5px;padding:9px 11px 5px}.traits span{padding:4px 6px;border-radius:5px;background:#27332f;color:#cfdbd5;font-size:9px}footer{padding:3px 11px 11px;color:#83948c;font-size:8px}.policy{margin-top:15px;color:#788981;font:10px ui-monospace,monospace}
  </style></head><body><h1>C8 geology silhouette audit · nature vs clay · ${pageNumber} of 2</h1><p class="lead">Reference traits are acceptance targets, not texture inputs. Match geological organization and silhouette; do not copy a particular specimen.</p><main class="grid">${cards}</main><div class="policy">Review-only evidence · no AI training/generation input · no texture synthesis · no external photo redistributed as a ToonLab asset</div></body></html>`;
}

await mkdir(capturesDirectory, { recursive: true });
const [heroIndex, referenceIndex] = await Promise.all([
  readFile(path.join(evidenceDirectory, 'hero-output-index.json'), 'utf8').then(JSON.parse),
  readFile('src/rockgen/experimental/geology-v2/reference-index.v1.json', 'utf8').then(JSON.parse),
]);
const references = new Map(referenceIndex.references.map((reference) => [reference.id, reference]));
const selected = heroIndex.filter((record) => ['median', 'challenging'].includes(record.heroRole));
const records = [];
for (const record of selected) {
  const mapping = FORM_REFERENCES[record.variantId];
  if (!mapping) throw new Error(`No nature-reference mapping for ${record.variantId}.`);
  const [referenceId, mediaFile] = mapping;
  const reference = references.get(referenceId);
  if (!reference) throw new Error(`Unknown nature reference ${referenceId}.`);
  const naturePath = path.join(mediaDirectory, mediaFile);
  const clayPath = path.join(capturesDirectory, `${record.familyId}--${record.variantId}--${record.heroRole}--clay--threeQuarter.png`);
  const [natureBytes, clayBytes] = await Promise.all([readFile(naturePath), readFile(clayPath)]);
  records.push({
    clayCapture: path.relative(evidenceDirectory, clayPath).replaceAll(path.sep, '/'),
    clayDataUrl: dataUrl(clayBytes, 'image/png'),
    familyId: record.familyId,
    localReviewMedia: { file: mediaFile, sha256: sha256(natureBytes) },
    natureDataUrl: dataUrl(natureBytes, mimeFor(mediaFile)),
    referenceId,
    reviewTraits: reference.reviewTraits ?? [],
    rightsStatus: reference.rightsStatus,
    sourceUrl: reference.url,
    variantId: record.variantId,
  });
}

const browser = await chromium.launch({ headless: true });
const captures = [];
try {
  for (let pageIndex = 0; pageIndex < 2; pageIndex += 1) {
    const page = await browser.newPage({ viewport: { width: 2200, height: 1200 } });
    await page.setContent(pageHtml(records.slice(pageIndex * 8, pageIndex * 8 + 8), pageIndex + 1), { waitUntil: 'load' });
    await page.waitForFunction(() => [...document.images].every((image) => image.complete && image.naturalWidth > 0));
    const file = path.join(capturesDirectory, `nature-vs-clay-${pageIndex + 1}-of-2.png`);
    await page.screenshot({ path: file, fullPage: true });
    const info = await stat(file);
    captures.push({ bytes: info.size, path: path.relative(evidenceDirectory, file).replaceAll(path.sep, '/') });
    await page.close();
  }
} finally {
  await browser.close();
}

const audit = {
  checkpoint: 8,
  policy: referenceIndex.policy,
  records: records.map(({ clayDataUrl: _clay, natureDataUrl: _nature, ...record }) => record),
  captures,
  passed: records.length === 16
    && records.every((record) => record.reviewTraits.length > 0 && record.sourceUrl && record.rightsStatus)
    && captures.every((capture) => capture.bytes > 20_000),
};
await writeFile(path.join(evidenceDirectory, 'nature-reference-audit.json'), `${JSON.stringify(audit, null, 2)}\n`);
console.log(JSON.stringify({ captures: captures.length, forms: records.length, passed: audit.passed }, null, 2));
if (!audit.passed) process.exitCode = 1;
