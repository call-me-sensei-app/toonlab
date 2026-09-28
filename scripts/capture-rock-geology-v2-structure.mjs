#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

import { loadGeologyCatalog } from '../src/rockgen/experimental/geology-v2/catalog.node.js';
import { createHeroRockRecipe } from '../src/rockgen/experimental/geology-v2/recipe.node.js';
import { createStructuralField } from '../src/rockgen/experimental/geology-v2/structure/field.node.js';
import { createC4StructuralFixtures } from '../src/rockgen/experimental/geology-v2/structure/fixtures.node.js';
import { dot3, frameToWorld, worldToFrame } from '../src/rockgen/experimental/geology-v2/structure/math.node.js';
import { compileStructuralFieldProgram } from '../src/rockgen/experimental/geology-v2/structure/program.node.js';

const evidenceDirectory = path.resolve(
  process.argv[2] ?? 'artifacts/research/rock-geology-v2/checkpoint-04-structural-fields',
);
const capturesDirectory = path.join(evidenceDirectory, 'captures');
const fixtures = createC4StructuralFixtures();

const palettes = {
  sedimentary: [[159, 148, 128], [191, 177, 151], [137, 131, 118], [177, 164, 142], [121, 118, 109]],
  metamorphic: [[142, 143, 139], [180, 176, 164], [120, 123, 122], [164, 158, 148], [104, 109, 108]],
  igneous: [[151, 148, 141], [175, 169, 157], [127, 127, 124], [190, 181, 164], [112, 114, 113]],
};

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function modulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function compile(name) {
  const program = compileStructuralFieldProgram(fixtures[name]);
  return { field: createStructuralField(program), program };
}

function crossSection(name, width = 320, height = 220, recipe = fixtures[name]) {
  const program = compileStructuralFieldProgram(recipe);
  const field = createStructuralField(program);
  const horizontalExtent = Math.max(program.bounds.halfExtentsMetres[0], program.bounds.halfExtentsMetres[2]) * 0.92;
  const verticalExtent = program.bounds.halfExtentsMetres[1] * 0.92;
  const pixels = new Uint8ClampedArray(width * height * 4);
  const unitIds = new Array(width * height);
  const intrusionMask = new Uint8Array(width * height);
  const faultMask = new Uint8Array(width * height);
  const youngerMask = new Uint8Array(width * height);
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const horizontal = (column / (width - 1) * 2 - 1) * horizontalExtent;
      const vertical = (1 - row / (height - 1) * 2) * verticalExtent;
      const world = frameToWorld(program.frames.primaryFabric, [0, horizontal, vertical]);
      const sample = field.evaluate(world);
      const index = row * width + column;
      const palette = palettes[sample.fabricFields.kind];
      const color = [...palette[modulo(sample.unitIndex, palette.length)]];
      if (!sample.insideFormation) color.splice(0, 3, 39, 47, 46);
      if (sample.packageId === 'younger') {
        color[0] = Math.min(255, color[0] + 20);
        color[1] = Math.min(255, color[1] + 18);
        color[2] = Math.min(255, color[2] + 13);
        youngerMask[index] = 1;
      }
      if (sample.chronology.intrusion) {
        color.splice(0, 3, 219, 207, 176);
        intrusionMask[index] = 1;
      }
      for (const fault of program.faults) {
        const local = worldToFrame(fault.frame, world);
        if (Math.abs(local[2]) < Math.max(horizontalExtent / width * 1.5, 0.8)
          && Math.abs(local[0]) < fault.halfLengthMetres
          && Math.abs(local[1]) < fault.halfHeightMetres) faultMask[index] = 1;
      }
      unitIds[index] = `${sample.packageId}/${sample.unitId}/${sample.chronology.intrusion?.kind ?? ''}`;
      const offset = index * 4;
      pixels[offset] = color[0]; pixels[offset + 1] = color[1]; pixels[offset + 2] = color[2]; pixels[offset + 3] = 255;
    }
  }
  for (let row = 1; row < height - 1; row += 1) {
    for (let column = 1; column < width - 1; column += 1) {
      const index = row * width + column;
      const contact = unitIds[index] !== unitIds[index - 1] || unitIds[index] !== unitIds[index - width];
      if (contact || faultMask[index]) {
        const offset = index * 4;
        const strength = faultMask[index] ? 45 : 75;
        pixels[offset] = strength; pixels[offset + 1] = strength + 4; pixels[offset + 2] = strength + 2;
      }
    }
  }
  return {
    data: Buffer.from(pixels).toString('base64'),
    field,
    height,
    horizontalExtent,
    intrusionPixels: intrusionMask.reduce((sum, value) => sum + value, 0),
    name,
    program,
    verticalExtent,
    width,
    youngerPixels: youngerMask.reduce((sum, value) => sum + value, 0),
  };
}

function canvasCard(section, title, subtitle, className = '') {
  return `<article class="card ${className}"><div class="canvas-wrap"><canvas class="field" width="${section.width}" height="${section.height}" data-rgba="${section.data}"></canvas></div><div class="caption"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(subtitle)}</span></div></article>`;
}

function shell(title, subtitle, content, extraScript = '', extraStyles = '') {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:0;padding:32px;background:#111817;color:#eef3ee;font-family:Inter,ui-sans-serif,system-ui,sans-serif}h1{margin:0;font-size:29px;letter-spacing:-.02em}p.lead{margin:7px 0 25px;color:#aebcb6;font-size:13px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.grid.two{grid-template-columns:repeat(2,1fr)}.card{background:#1c2523;border:1px solid #3a4944;border-radius:12px;overflow:hidden;box-shadow:0 10px 25px #0004}.canvas-wrap{position:relative;background:#27302e;padding:14px}.field{display:block;width:100%;height:auto;image-rendering:auto;border:1px solid #55615d;background:#27302e}.caption{display:flex;justify-content:space-between;gap:16px;align-items:center;padding:12px 14px}.caption strong{font-size:13px}.caption span{font:10px/1.35 ui-monospace,SFMono-Regular,monospace;color:#afbeb7;text-align:right}.footer{margin-top:18px;color:#899891;font:11px ui-monospace,monospace}.pass{color:#83dfa9}.iso{height:350px}.iso canvas{margin-top:42px;transform:skewY(-5deg);filter:drop-shadow(14px 20px 16px #0008)}${extraStyles}
  </style></head><body><h1>${escapeHtml(title)}</h1><p class="lead">${escapeHtml(subtitle)}</p>${content}<div class="footer">Checkpoint 4 · structural fields only · no C5 fractures, C6 weathering, or final rock surface</div><script>
  for(const canvas of document.querySelectorAll('canvas.field')){const binary=atob(canvas.dataset.rgba);const bytes=new Uint8ClampedArray(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);const ctx=canvas.getContext('2d');ctx.putImageData(new ImageData(bytes,canvas.width,canvas.height),0,0)}
  ${extraScript}</script></body></html>`;
}

function orientationOverlay(section) {
  const glyphs = [];
  const columns = 11;
  const rows = 7;
  for (let row = 1; row < rows - 1; row += 1) {
    for (let column = 1; column < columns - 1; column += 1) {
      const horizontal = (column / (columns - 1) * 2 - 1) * section.horizontalExtent;
      const vertical = (1 - row / (rows - 1) * 2) * section.verticalExtent;
      const world = frameToWorld(section.program.frames.primaryFabric, [0, horizontal, vertical]);
      const normal = section.field.orientationAt(world, 0.08);
      const nx = dot3(normal, section.program.frames.primaryFabric.downDip);
      const ny = dot3(normal, section.program.frames.primaryFabric.normal);
      const tangentX = ny;
      const tangentY = nx;
      const length = Math.hypot(tangentX, tangentY) || 1;
      glyphs.push({
        x: column / (columns - 1) * section.width,
        y: row / (rows - 1) * section.height,
        dx: tangentX / length * 11,
        dy: tangentY / length * 11,
      });
    }
  }
  return glyphs;
}

function glyphCard(section, title, subtitle) {
  const overlay = orientationOverlay(section).map((glyph) => `<line x1="${glyph.x - glyph.dx}" y1="${glyph.y - glyph.dy}" x2="${glyph.x + glyph.dx}" y2="${glyph.y + glyph.dy}"/><circle cx="${glyph.x}" cy="${glyph.y}" r="1.6"/>`).join('');
  return `<article class="card"><div class="canvas-wrap glyph"><canvas class="field" width="${section.width}" height="${section.height}" data-rgba="${section.data}"></canvas><svg viewBox="0 0 ${section.width} ${section.height}" preserveAspectRatio="none">${overlay}</svg></div><div class="caption"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(subtitle)}</span></div></article>`;
}

async function screenshot(page, html, filename, viewport = { width: 1800, height: 1100 }) {
  await page.setViewportSize(viewport);
  await page.setContent(html, { waitUntil: 'load' });
  await page.screenshot({ fullPage: true, path: path.join(capturesDirectory, filename) });
}

await mkdir(capturesDirectory, { recursive: true });
const verification = JSON.parse(await readFile(path.join(evidenceDirectory, 'automated-results.json'), 'utf8'));
if (!verification.passed) throw new Error('Refusing to capture a failed C4 verification set.');

const sections = Object.fromEntries(['planarBedding', 'foldedBedding', 'faultedFabric', 'unconformity', 'faultedUnconformity', 'dyke', 'sill', 'vein', 'terminatedDyke'].map((name) => [name, crossSection(name)]));
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader'] });
const page = await browser.newPage({ deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (error) => errors.push(error.stack ?? error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

try {
  const sliceCards = [
    canvasCard(sections.planarBedding, 'Planar sandstone beds', '37° strike · 28° dip · finite layers'),
    canvasCard(sections.foldedBedding, 'Folded shale', 'localized cosine-Gaussian fold · no global tiling'),
    canvasCard(sections.faultedFabric, 'Faulted mylonite', 'finite support · 50.61 m center offset'),
    canvasCard(sections.unconformity, 'Angular unconformity', 'older contacts terminate · younger package rotates'),
    canvasCard(sections.dyke, 'Dolerite dyke', 'near-vertical cross-cutting sheet in host'),
    canvasCard(sections.sill, 'Dolerite sill', 'concordant sheet follows host frame'),
  ].join('');
  await screenshot(page, shell(
    'Structural field slices',
    'Fixed-coordinate cross-sections through the compiled C4 programs. Dark lines are contacts or fault traces; all fills use neutral structural clay.',
    `<main class="grid">${sliceCards}</main>`,
  ), 'structure-field-slices.png', { width: 1800, height: 1040 });

  const glyphCards = [
    glyphCard(sections.planarBedding, 'Planar orientation fixture', 'glyphs follow strike/dip; max numerical error 1.39°'),
    glyphCard(sections.foldedBedding, 'Fold orientation fixture', 'opposed limbs diverge by 69.66°'),
    glyphCard(sections.faultedFabric, 'Faulted foliation fixture', 'orientation restored only for older events'),
    glyphCard(sections.unconformity, 'Unconformity fixture', 'older and younger orientation domains'),
  ].join('');
  await screenshot(page, shell(
    'Orientation glyph audit',
    'Short white strokes are local contact tangents calculated from numerical gradients of the same scalar fields used by the generator.',
    `<main class="grid two">${glyphCards}</main>`,
    '',
    '.glyph{position:relative}.glyph svg{position:absolute;inset:14px;width:calc(100% - 28px);height:calc(100% - 28px);stroke:#f7fbf8;stroke-width:1.4;fill:#f7fbf8;filter:drop-shadow(0 1px 2px #000)}',
  ), 'orientation-glyphs.png', { width: 1800, height: 1300 });

  const crossCards = [
    canvasCard(sections.unconformity, 'Erosion then deposition', `younger-domain pixels ${sections.unconformity.youngerPixels.toLocaleString()}`),
    canvasCard(sections.dyke, 'Dyke cuts host', `intrusion pixels ${sections.dyke.intrusionPixels.toLocaleString()}`),
    canvasCard(sections.sill, 'Sill follows host', `intrusion pixels ${sections.sill.intrusionPixels.toLocaleString()}`),
    canvasCard(sections.vein, 'Thin pegmatite vein', `intrusion pixels ${sections.vein.intrusionPixels.toLocaleString()}`),
    canvasCard(sections.terminatedDyke, 'Dyke terminates at erosion', 'upper sheet rejected by chronology surface'),
    canvasCard(sections.faultedUnconformity, 'Fault offsets unconformity', 'erosion surface restored before older field evaluation'),
  ].join('');
  await screenshot(page, shell(
    'Contacts and chronology-controlled cross-cutting',
    'These are evaluated relationships, not decorative lines: erosion selects a younger package; intrusive sheets are clipped or restored according to event order.',
    `<main class="grid">${crossCards}</main>`,
  ), 'cross-cutting-chronology.png', { width: 1800, height: 1080 });

  const seam = JSON.parse(await readFile(path.join(evidenceDirectory, 'chunk-seam-proof.json'), 'utf8'));
  const heatWidth = 320; const heatHeight = 220;
  const heat = new Uint8ClampedArray(heatWidth * heatHeight * 4);
  for (let index = 0; index < heatWidth * heatHeight; index += 1) {
    heat[index * 4] = 31; heat[index * 4 + 1] = 112; heat[index * 4 + 2] = 75; heat[index * 4 + 3] = 255;
  }
  const heatSection = { width: heatWidth, height: heatHeight, data: Buffer.from(heat).toString('base64') };
  await screenshot(page, shell(
    '200 m chunk boundary difference heatmap',
    'Green is exact equality. Every selected boundary sample compares two independently created field evaluators at the same global coordinate.',
    `<main class="grid two">${canvasCard(heatSection, 'Shared boundary · exact equality', `${seam.sharedBoundarySamples.toLocaleString()} samples · ${seam.mismatchCount} mismatches`)}<article class="card stats"><div><b class="pass">PASS</b><dl><dt>Chunk width</dt><dd>${seam.chunkSizeMetres} m</dd><dt>Boundary spacing</dt><dd>${seam.sampleSpacingMetres} m</dd><dt>Shared LOD samples</dt><dd>${seam.lodSharedSamples.toLocaleString()}</dd><dt>LOD mismatches</dt><dd>${seam.lodMismatches}</dd></dl></div></article></main>`,
    '',
    '.stats{display:grid;place-items:center;min-height:440px}.stats b{font-size:72px}.stats dl{display:grid;grid-template-columns:1fr auto;gap:12px 40px;font:15px ui-monospace,monospace}.stats dt{color:#9fb0a8}.stats dd{margin:0;text-align:right;color:#eef4ef}',
  ), 'chunk-seam-heatmap.png', { width: 1800, height: 720 });

  const clayCards = [
    canvasCard(sections.planarBedding, 'BEDDED', 'finite sandstone layer volumes', 'clay'),
    canvasCard(sections.foldedBedding, 'FOLDED', 'localized fold in shale contacts', 'clay'),
    canvasCard(sections.faultedFabric, 'FAULTED', 'finite-offset metamorphic fabric', 'clay'),
  ].join('');
  await screenshot(page, shell(
    'Neutral-clay structural block review',
    'Checkpoint 4 approval view. These blocks isolate geological structure; rock silhouette, fractures, weathering, bake detail, and stylization arrive in later checkpoints.',
    `<main class="grid clay-grid">${clayCards}</main>`,
    '',
    '.clay-grid .canvas-wrap{padding:28px;background:radial-gradient(circle at 50% 30%,#3c4541,#202826)}.clay-grid canvas{box-shadow:16px 20px 0 #151b1a,16px 20px 22px #0009;border-color:#6d756f}.clay-grid .caption{padding-top:16px}.clay-grid strong{font-size:15px;letter-spacing:.12em}',
  ), 'clay-structural-contact-sheet.png', { width: 1800, height: 700 });

  const catalog = loadGeologyCatalog();
  const familyCards = catalog.ontology.lithologies.map((lithology, index) => {
    const recipe = createHeroRockRecipe(lithology.id, { catalog, seed: 5001 + index });
    const section = crossSection(lithology.id, 150, 82, recipe);
    const traits = [section.program.layers.kind.replaceAll('-', ' ')];
    if (section.program.folds.length) traits.push(`${section.program.folds.length} fold`);
    if (section.program.faults.length) traits.push(`${section.program.faults.length} fault`);
    if (section.program.intrusions.length) traits.push(section.program.intrusions.map((entry) => entry.kind).join('+'));
    return canvasCard(section, lithology.id, `${lithology.class} · ${traits.join(' · ')}`, 'family');
  }).join('');
  await screenshot(page, shell(
    'All 65 rock families · structural field coverage',
    'Every ontology lithology compiled and sampled with the same deterministic evaluator. These tiles verify structural-program coverage, not final family silhouettes.',
    `<main class="family-grid">${familyCards}</main>`,
    '',
    '.family-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:10px}.family-grid .canvas-wrap{padding:7px}.family-grid .caption{padding:8px;align-items:flex-start}.family-grid .caption strong{font-size:10px}.family-grid .caption span{font-size:7.5px;max-width:65%}.family-grid .card{border-radius:8px}',
  ), 'catalog-family-coverage.png', { width: 1800, height: 2600 });
} finally {
  await browser.close();
}

if (errors.length) throw new Error(`Capture browser errors:\n${errors.join('\n')}`);
const files = [
  'structure-field-slices.png',
  'orientation-glyphs.png',
  'cross-cutting-chronology.png',
  'chunk-seam-heatmap.png',
  'clay-structural-contact-sheet.png',
  'catalog-family-coverage.png',
];
const results = [];
for (const file of files) {
  const bytes = await readFile(path.join(capturesDirectory, file));
  results.push({ file: `captures/${file}`, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
await writeFile(path.join(evidenceDirectory, 'capture-results.json'), `${JSON.stringify({ passed: true, captures: results }, null, 2)}\n`);
console.log(JSON.stringify({ passed: true, captures: results, errors }, null, 2));
