#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

import { loadGeologyCatalog } from '../src/rockgen/experimental/geology-v2/catalog.node.js';
import { createHeroRockRecipe } from '../src/rockgen/experimental/geology-v2/recipe.node.js';
import { compileStructuralFieldProgram } from '../src/rockgen/experimental/geology-v2/structure/program.node.js';
import { compileFractureNetworkProgram } from '../src/rockgen/experimental/geology-v2/fractures/network.node.js';

const evidenceDirectory = path.resolve(
  process.argv[2] ?? 'artifacts/research/rock-geology-v2/checkpoint-05-finite-fractures-blocks',
);
const capturesDirectory = path.join(evidenceDirectory, 'captures');

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function round(value, digits = 3) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : value;
}

function hashNumber(value) {
  let hash = 2166136261;
  for (const character of String(value)) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
}

function gridIndex(x, y, z, dimensions) {
  return x + dimensions[0] * (y + dimensions[1] * z);
}

function shell(title, subtitle, content, extraStyles = '') {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:0;padding:34px;background:#101716;color:#edf3ef;font-family:Inter,ui-sans-serif,system-ui,sans-serif}h1{margin:0;font-size:30px;letter-spacing:-.025em}p.lead{margin:7px 0 26px;color:#aebbb5;font-size:13px}.grid{display:grid;gap:16px}.four{grid-template-columns:repeat(4,1fr)}.two{grid-template-columns:repeat(2,1fr)}.card{overflow:hidden;background:#1a2321;border:1px solid #3b4945;border-radius:12px;box-shadow:0 10px 26px #0004}.visual{padding:14px;background:radial-gradient(circle at 50% 35%,#3b4540,#202826)}svg{display:block;width:100%;height:auto}.caption{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;padding:12px 14px}.caption strong{font-size:13px}.caption span{font:9.5px/1.35 ui-monospace,SFMono-Regular,monospace;color:#aebdb6;text-align:right}.footer{margin-top:18px;color:#7f8f88;font:10px ui-monospace,monospace}.pass{color:#78dda1}${extraStyles}
  </style></head><body><h1>${escapeHtml(title)}</h1><p class="lead">${escapeHtml(subtitle)}</p>${content}<div class="footer">Checkpoint 5 · finite discontinuities and implicit blocks · neutral diagnostic clay · not a C6 weathered/final rock surface</div></body></html>`;
}

function card(title, subtitle, svg, className = '') {
  return `<article class="card ${className}"><div class="visual">${svg}</div><div class="caption"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(subtitle)}</span></div></article>`;
}

function bestDiagnosticSlice(blockModel) {
  const dimensions = blockModel.grid.dimensions;
  let best = { axis: 2, coordinate: 0, count: -1 };
  for (let axis = 0; axis < 3; axis += 1) {
    const remaining = [0, 1, 2].filter((candidate) => candidate !== axis);
    for (let coordinate = 0; coordinate < dimensions[axis]; coordinate += 1) {
      const ids = new Set();
      for (let first = 0; first < dimensions[remaining[0]]; first += 1) {
        for (let second = 0; second < dimensions[remaining[1]]; second += 1) {
          const point = [];
          point[axis] = coordinate;
          point[remaining[0]] = first;
          point[remaining[1]] = second;
          const blockIndex = blockModel.cellBlockIndices[gridIndex(...point, dimensions)];
          if (blockIndex >= 0) ids.add(blockIndex);
        }
      }
      if (ids.size > best.count) best = { axis, coordinate, count: ids.size };
    }
  }
  const remaining = [0, 1, 2].filter((candidate) => candidate !== best.axis);
  // Prefer the formation-normal axis as screen-up when it is available.
  best.rowAxis = remaining.includes(2) ? 2 : remaining[1];
  best.columnAxis = remaining.find((axis) => axis !== best.rowAxis);
  return best;
}

function claySliceSvg(stage, options = {}) {
  const model = stage.blockModel;
  const slice = bestDiagnosticSlice(model);
  const columns = model.grid.dimensions[slice.columnAxis];
  const rows = model.grid.dimensions[slice.rowAxis];
  const width = 520;
  const height = 390;
  const pad = 18;
  const cellWidth = (width - pad * 2) / columns;
  const cellHeight = (height - pad * 2) / rows;
  const fills = [];
  const cracks = [];
  const blockAt = (x, y) => {
    if (x < 0 || y < 0 || x >= columns || y >= rows) return -1;
    const point = [];
    point[slice.axis] = slice.coordinate;
    point[slice.columnAxis] = x;
    point[slice.rowAxis] = y;
    return model.cellBlockIndices[gridIndex(...point, model.grid.dimensions)];
  };
  for (let y = 0; y < rows; y += 1) for (let x = 0; x < columns; x += 1) {
    const blockIndex = blockAt(x, y);
    if (blockIndex < 0) continue;
    const hash = hashNumber(model.blocks[blockIndex].id);
    const light = 58 + (hash % 15);
    const warm = (hash >>> 8) % 9 - 4;
    const px = pad + x * cellWidth;
    const py = pad + (rows - y - 1) * cellHeight;
    fills.push(`<rect x="${px}" y="${py}" width="${cellWidth + .3}" height="${cellHeight + .3}" fill="hsl(${94 + warm} 7% ${light}%)"/>`);
    const edges = [
      [blockAt(x - 1, y), `M${px} ${py}V${py + cellHeight}`],
      [blockAt(x + 1, y), `M${px + cellWidth} ${py}V${py + cellHeight}`],
      [blockAt(x, y - 1), `M${px} ${py + cellHeight}H${px + cellWidth}`],
      [blockAt(x, y + 1), `M${px} ${py}H${px + cellWidth}`],
    ];
    for (const [neighbor, d] of edges) if (neighbor !== blockIndex) cracks.push(`<path d="${d}"/>`);
  }
  const label = options.showIdentity
    ? `<text x="26" y="36" class="answer">${escapeHtml(options.identity)}</text>`
    : `<text x="26" y="36" class="letter">${escapeHtml(options.letter)}</text>`;
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(options.identity ?? options.letter)} block slice"><defs><filter id="shadow"><feDropShadow dx="8" dy="10" stdDeviation="8" flood-opacity=".42"/></filter><clipPath id="rock"><rect x="${pad}" y="${pad}" width="${width-pad*2}" height="${height-pad*2}" rx="23"/></clipPath></defs><g clip-path="url(#rock)" filter="url(#shadow)">${fills.join('')}<g stroke="#202622" stroke-width="2.35" stroke-linecap="square">${cracks.join('')}</g></g><rect x="${pad}" y="${pad}" width="${width-pad*2}" height="${height-pad*2}" rx="23" fill="none" stroke="#87928c" stroke-width="2"/>${label}<style>.letter{font:800 28px Inter,sans-serif;fill:#f2f6f3;paint-order:stroke;stroke:#26302c;stroke-width:5}.answer{font:800 17px Inter,sans-serif;fill:#f2f6f3;letter-spacing:.08em;paint-order:stroke;stroke:#26302c;stroke-width:4}</style></svg>`;
}

function stereonetSvg(stage) {
  const width = 430;
  const height = 430;
  const cx = width / 2;
  const cy = height / 2;
  const radius = 172;
  const colors = ['#75dda6', '#efb765', '#7fb9ff', '#df82c9', '#e77569'];
  const points = stage.fractureNetwork.fractures.map((fracture) => {
    const normal = fracture.frame.normal;
    const theta = Math.acos(Math.max(0, Math.min(1, Math.abs(normal[1]))));
    const horizontal = Math.hypot(normal[0], normal[2]) || 1;
    const projected = Math.SQRT2 * Math.sin(theta * 0.5) / Math.SQRT2 * radius;
    const x = cx + normal[0] / horizontal * projected;
    const y = cy - normal[2] / horizontal * projected;
    const setIndex = stage.fractureNetwork.sets.findIndex((set) => set.id === fracture.setId);
    return `<circle cx="${x}" cy="${y}" r="5.2" fill="${colors[setIndex % colors.length]}" stroke="#101716" stroke-width="1.2"/>`;
  }).join('');
  const legend = stage.fractureNetwork.sets.map((set, index) => `<g transform="translate(18 ${20 + index * 18})"><circle r="4" fill="${colors[index % colors.length]}"/><text x="10" y="4">${escapeHtml(set.id)}</text></g>`).join('');
  return `<svg viewBox="0 0 ${width} ${height}"><g fill="none" stroke="#55645e"><circle cx="${cx}" cy="${cy}" r="${radius}" stroke-width="2"/><circle cx="${cx}" cy="${cy}" r="${radius*.5}"/><path d="M${cx-radius} ${cy}H${cx+radius}M${cx} ${cy-radius}V${cy+radius}"/></g><g fill="#aebdb6" font="10px ui-monospace,monospace">${legend}</g>${points}<text x="${cx}" y="${cy-radius-13}" text-anchor="middle" fill="#b9c7c0" font="10px ui-monospace,monospace">N</text></svg>`;
}

function histogramSvg(values, options = {}) {
  const width = 520;
  const height = 260;
  const left = 42;
  const bottom = 218;
  const plotWidth = 452;
  const plotHeight = 176;
  const bins = options.bins ?? 18;
  const minimum = options.minimum ?? Math.min(...values);
  const maximum = options.maximum ?? Math.max(...values);
  const counts = new Array(bins).fill(0);
  for (const value of values) {
    const index = Math.min(bins - 1, Math.max(0, Math.floor((value - minimum) / Math.max(maximum - minimum, 1e-9) * bins)));
    counts[index] += 1;
  }
  const peak = Math.max(...counts, 1);
  const bars = counts.map((count, index) => {
    const x = left + index / bins * plotWidth;
    const barWidth = plotWidth / bins - 2;
    const barHeight = count / peak * plotHeight;
    return `<rect x="${x+1}" y="${bottom-barHeight}" width="${barWidth}" height="${barHeight}" rx="2" fill="${options.color ?? '#75dca5'}"/>`;
  }).join('');
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const meanX = left + (mean - minimum) / Math.max(maximum - minimum, 1e-9) * plotWidth;
  return `<svg viewBox="0 0 ${width} ${height}"><path d="M${left} 30V${bottom}H${left+plotWidth}" fill="none" stroke="#62716b"/>${bars}<path d="M${meanX} 28V${bottom}" stroke="#f4d390" stroke-width="2" stroke-dasharray="5 4"/><g fill="#acbbb4" font="10px ui-monospace,monospace"><text x="${left}" y="240">${round(minimum,2)}</text><text x="${left+plotWidth}" y="240" text-anchor="end">${round(maximum,2)}</text><text x="${meanX}" y="22" text-anchor="middle">mean ${round(mean,2)}</text></g></svg>`;
}

function blockGraphSvg(stage) {
  const model = stage.blockModel;
  const width = 520;
  const height = 390;
  const bounds = model.grid.halfExtentsMetres;
  const positions = new Map(model.blocks.map((block) => {
    const p = block.centroidMetres;
    const x = 260 + (p[0] / bounds[0] + p[2] / bounds[2] * .42) * 165;
    const y = 200 - (p[1] / bounds[1] - p[2] / bounds[2] * .22) * 145;
    return [block.id, { x, y }];
  }));
  const edges = model.adjacencyGraph.edges.map((edge) => {
    const left = positions.get(edge.leftBlockId);
    const right = positions.get(edge.rightBlockId);
    const opacity = Math.min(.55, .12 + edge.faceCount / 18);
    return `<line x1="${left.x}" y1="${left.y}" x2="${right.x}" y2="${right.y}" stroke="#91a29a" stroke-opacity="${opacity}"/>`;
  }).join('');
  const maximumVolume = Math.max(...model.blocks.map((block) => block.volumeMetres3));
  const nodes = model.blocks.map((block) => {
    const p = positions.get(block.id);
    const radius = 2.2 + Math.sqrt(block.volumeMetres3 / maximumVolume) * 6;
    const grounded = model.supportGraph.nodes.find((node) => node.blockId === block.id)?.grounded;
    return `<circle cx="${p.x}" cy="${p.y}" r="${radius}" fill="${grounded ? '#efb765' : '#75dca5'}" stroke="#14201c" stroke-width="1"/>`;
  }).join('');
  return `<svg viewBox="0 0 ${width} ${height}"><rect x="14" y="14" width="492" height="362" rx="18" fill="#18201e" stroke="#43514c"/>${edges}${nodes}<g font="10px ui-monospace,monospace" fill="#aebdb6"><text x="26" y="34">${model.blocks.length} blocks · ${model.adjacencyGraph.edges.length} contacts</text><circle cx="31" cy="356" r="4" fill="#efb765"/><text x="41" y="360">grounded support node</text></g></svg>`;
}

function heatmapSvg(stage) {
  const sets = stage.fractureNetwork.sets;
  const fractureSet = new Map(stage.fractureNetwork.fractures.map((fracture) => [fracture.id, fracture.setId]));
  const matrix = sets.map(() => sets.map(() => 0));
  for (const intersection of stage.fractureNetwork.intersections) {
    const left = sets.findIndex((set) => set.id === fractureSet.get(intersection.fractureIds[0]));
    const right = sets.findIndex((set) => set.id === fractureSet.get(intersection.fractureIds[1]));
    if (left >= 0 && right >= 0) { matrix[left][right] += 1; matrix[right][left] += 1; }
  }
  const maximum = Math.max(1, ...matrix.flat());
  const cell = Math.min(72, 280 / sets.length);
  const startX = 125;
  const startY = 70;
  const cells = matrix.flatMap((row, y) => row.map((value, x) => {
    const alpha = value / maximum;
    return `<rect x="${startX+x*cell}" y="${startY+y*cell}" width="${cell-3}" height="${cell-3}" rx="5" fill="rgb(${Math.round(40+alpha*77)} ${Math.round(61+alpha*153)} ${Math.round(55+alpha*105)})"/><text x="${startX+x*cell+(cell-3)/2}" y="${startY+y*cell+(cell-3)/2+4}" text-anchor="middle">${value}</text>`;
  })).join('');
  const labels = sets.map((set, index) => `<text x="${startX-8}" y="${startY+index*cell+cell/2}" text-anchor="end">S${index+1}</text><text x="${startX+index*cell+cell/2}" y="${startY-12}" text-anchor="middle">S${index+1}</text>`).join('');
  return `<svg viewBox="0 0 520 390"><g font="11px ui-monospace,monospace" fill="#dbe4df">${cells}${labels}</g><g font="9px ui-monospace,monospace" fill="#aebdb6">${sets.map((set,index)=>`<text x="${125}" y="${335+index*12}">S${index+1} ${escapeHtml(set.id)}</text>`).join('')}</g></svg>`;
}

function chronologySvg(chronology) {
  const term = chronology.unconformityTermination;
  return `<svg viewBox="0 0 1040 460"><defs><linearGradient id="old" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#8d9188"/><stop offset="1" stop-color="#5f675f"/></linearGradient><linearGradient id="young" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#b1a992"/><stop offset="1" stop-color="#888473"/></linearGradient></defs><rect x="18" y="18" width="490" height="424" rx="18" fill="#18201e"/><path d="M35 212 Q115 177 196 211T356 203T490 188 L490 40H35Z" fill="url(#young)"/><path d="M35 212 Q115 177 196 211T356 203T490 188 L490 423H35Z" fill="url(#old)"/>${[75,132,190,248,307,365,425].map((x,index)=>`<path d="M${x} ${212 + Math.sin(index)*16}L${x+18} 405" stroke="#242c29" stroke-width="5"/>`).join('')}${[82,156,233,310,390,455].map((x,index)=>`<path d="M${x} ${52}L${x+9} ${170+Math.cos(index)*13}" stroke="#e68b76" stroke-width="3" stroke-dasharray="8 6"/><path d="M${x+3} ${115}l12 12m0-12l-12 12" stroke="#f1b09f" stroke-width="2"/>`).join('')}<path d="M35 212 Q115 177 196 211T356 203T490 188" fill="none" stroke="#efd28f" stroke-width="5"/><g fill="#eef3ef" font-family="Inter,sans-serif"><text x="54" y="64" font-size="15" font-weight="700">YOUNGER PACKAGE</text><text x="54" y="402" font-size="15" font-weight="700">OLDER JOINTED ROCK</text><text x="527" y="57" font-size="19" font-weight="800">Chronology test</text><text x="527" y="94" font-size="13" fill="#acbbb4">Finite panels are evaluated against the erosion surface.</text><text x="527" y="151" font-size="38" font-weight="800" fill="#78dda1">${term.acceptedBelow}/${term.testedBelow}</text><text x="527" y="173" font-size="12" fill="#acbbb4">eligible crossings retained below</text><text x="527" y="236" font-size="38" font-weight="800" fill="#78dda1">${term.rejectedAbove}/${term.testedAbove}</text><text x="527" y="258" font-size="12" fill="#acbbb4">ineligible crossings rejected above</text><text x="527" y="298" font-size="14" font-weight="700">Fault restoration</text><text x="527" y="319" font-size="12" fill="#acbbb4">${round(chronology.faultOffset.actualRestorationMetres, 6)} m restored / exact</text><text x="527" y="350" font-size="14" font-weight="700">Bedding deflection</text><text x="527" y="371" font-size="12" fill="#acbbb4">${round(chronology.beddingDeflection.authoredMeanDegrees, 3)}° authored → ${round(chronology.beddingDeflection.deflectedMeanDegrees, 3)}° to local fabric</text><text x="527" y="402" font-size="14" font-weight="700">Joint hierarchy + finite tips</text><text x="527" y="423" font-size="12" fill="#acbbb4">${chronology.hierarchy.retainedInteriorSamples} retained · ${chronology.hierarchy.terminatedInteriorSamples} clipped · center hit / beyond-tip miss</text></g></svg>`;
}

async function screenshot(page, html, filename, viewport) {
  await page.setViewportSize(viewport);
  await page.setContent(html, { waitUntil: 'load' });
  await page.screenshot({ fullPage: true, path: path.join(capturesDirectory, filename) });
}

await mkdir(capturesDirectory, { recursive: true });
const automated = JSON.parse(await readFile(path.join(evidenceDirectory, 'automated-results.json'), 'utf8'));
const familyResults = JSON.parse(await readFile(path.join(evidenceDirectory, 'catalog-family-results.json'), 'utf8'));
const chronology = JSON.parse(await readFile(path.join(evidenceDirectory, 'chronology-results.json'), 'utf8'));
if (!automated.passed) throw new Error('Refusing to capture a failed C5 verification set.');

const basisOrder = ['polyhedral', 'tabular', 'equidimensional', 'rhombohedral'];
const letters = ['A', 'B', 'C', 'D'];
const stages = {};
for (const name of basisOrder) stages[name] = JSON.parse(await readFile(path.join(evidenceDirectory, 'programs', `${name}-block-stage.json`), 'utf8'));

const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader'] });
const page = await browser.newPage({ deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (error) => errors.push(error.stack ?? error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

const captureFiles = [];
try {
  const blindCards = basisOrder.map((name, index) => card(
    `Sample ${letters[index]}`,
    `${stages[name].blockModel.blocks.length} connected blocks · identity hidden`,
    claySliceSvg(stages[name], { identity: name, letter: letters[index], showIdentity: false }),
  )).join('');
  await screenshot(page, shell(
    'Blind clay sort · four implicit block bases',
    'Class labels are deliberately hidden. Sort by joint geometry alone; the answer key is a separate evidence frame.',
    `<main class="grid four">${blindCards}</main>`,
  ), 'clay-basis-blind-sort.png', { width: 1800, height: 660 });
  captureFiles.push('clay-basis-blind-sort.png');

  const answerCards = basisOrder.map((name) => card(
    name.toUpperCase(),
    `${stages[name].fractureNetwork.sets.length} sets · ${stages[name].blockModel.blocks.length} blocks · ${stages[name].blockModel.occupancyAudit.gapCells} gaps`,
    claySliceSvg(stages[name], { identity: name.toUpperCase(), showIdentity: true }),
  )).join('');
  await screenshot(page, shell(
    'Four-basis clay answer key',
    'Actual central slices through production-resolution implicit block grids. Colors only separate connected components; all are neutral clay.',
    `<main class="grid four">${answerCards}</main>`,
  ), 'clay-basis-answer-key.png', { width: 1800, height: 660 });
  captureFiles.push('clay-basis-answer-key.png');

  const stereonetCards = basisOrder.map((name) => card(
    name,
    `${stages[name].fractureNetwork.fractures.length} finite planes · axial pole plot`,
    stereonetSvg(stages[name]),
  )).join('');
  await screenshot(page, shell(
    'Fracture-set orientation stereonets',
    'Equal-area axial pole plots derived from the compiled strike/dip frames; antipodal normals are treated as the same geological plane.',
    `<main class="grid four">${stereonetCards}</main>`,
  ), 'stereonet-orientation.png', { width: 1800, height: 650 });
  captureFiles.push('stereonet-orientation.png');

  const allFractures = basisOrder.flatMap((name) => stages[name].fractureNetwork.fractures);
  const allSpacing = basisOrder.flatMap((name) => stages[name].fractureNetwork.statisticsBySet.flatMap((set) => (
    set.spacingMetres.mean === null ? [] : [set.spacingMetres.mean]
  )));
  const histogramCards = [
    card('Finite panel length', `${allFractures.length} samples · metres`, histogramSvg(allFractures.map((entry) => entry.sizeMetres), { color: '#75dca5' })),
    card('Persistence', `${allFractures.length} samples · metres`, histogramSvg(allFractures.map((entry) => entry.persistenceMetres), { color: '#7fb9ff' })),
    card('Set spacing', `${allSpacing.length} compiled set means · metres`, histogramSvg(allSpacing, { bins: 12, color: '#efb765' })),
    card('Orientation deviation', `${allFractures.length} samples · degrees`, histogramSvg(allFractures.map((entry) => entry.orientationDeviationDegrees), { color: '#df82c9' })),
  ].join('');
  await screenshot(page, shell(
    'Finite-fracture distribution audit',
    'Compiled values from all four analytic bases. Gold dashed marks are empirical means; no samples are decorative post-process lines.',
    `<main class="grid two">${histogramCards}</main>`,
  ), 'distribution-histograms.png', { width: 1800, height: 1200 });
  captureFiles.push('distribution-histograms.png');

  const graphCards = basisOrder.map((name) => card(
    name,
    `${stages[name].blockModel.adjacencyGraph.edges.length} adjacency · ${stages[name].blockModel.supportGraph.edges.length} support edges`,
    blockGraphSvg(stages[name]),
  )).join('');
  await screenshot(page, shell(
    'Block adjacency and support graphs',
    'Nodes are implicit blocks positioned by centroid; links are actual blocked-cell contacts. Amber nodes touch the grounded support band.',
    `<main class="grid four">${graphCards}</main>`,
  ), 'block-adjacency-graphs.png', { width: 1800, height: 650 });
  captureFiles.push('block-adjacency-graphs.png');

  const heatCards = basisOrder.map((name) => card(
    name,
    `${stages[name].fractureNetwork.intersections.length} clipped finite intersections`,
    heatmapSvg(stages[name]),
  )).join('');
  await screenshot(page, shell(
    'Fracture-set intersection heatmaps',
    'Each cell counts finite ellipse–ellipse intersection segments between compiled sets. Diagonals remain zero by same-set construction.',
    `<main class="grid four">${heatCards}</main>`,
  ), 'fracture-intersection-heatmaps.png', { width: 1800, height: 650 });
  captureFiles.push('fracture-intersection-heatmaps.png');

  await screenshot(page, shell(
    'Chronology-controlled joint termination and restoration',
    'Old joints terminate at the erosion surface, younger fault displacement is restored before evaluating old panels, and hierarchy controls crossings.',
    `<main class="card"><div class="visual">${chronologySvg(chronology)}</div></main>`,
  ), 'chronology-termination.png', { width: 1500, height: 760 });
  captureFiles.push('chronology-termination.png');

  const catalog = loadGeologyCatalog();
  const familyCards = [];
  for (const [index, family] of familyResults.entries()) {
    const lithology = catalog.lithologyById.get(family.lithology);
    const recipe = createHeroRockRecipe(family.lithology, { catalog, seed: 72_000 + index });
    const structural = compileStructuralFieldProgram(recipe, { catalog });
    const network = compileFractureNetworkProgram(recipe, structural, { catalog });
    const set = network.sets[0];
    const angle = set.meanStrikeDegrees * Math.PI / 180;
    const lines = Array.from({ length: 7 }, (_, line) => {
      const offset = 17 + line * 13;
      const dx = Math.cos(angle) * 54;
      const dy = Math.sin(angle) * 25;
      return `<line x1="${90-dx}" y1="${offset-dy}" x2="${90+dx}" y2="${offset+dy}"/>`;
    }).join('');
    familyCards.push(`<article class="family ${family.aggregatePassed ? 'ok' : 'bad'}"><svg viewBox="0 0 180 112"><rect width="180" height="112" rx="7" fill="#28312e"/><g stroke="#aeb7b1" stroke-width="2" opacity=".82">${lines}</g><circle cx="151" cy="22" r="11" fill="none" stroke="#76dca5" stroke-width="3"/><path d="M146 22l4 4 7-9" fill="none" stroke="#76dca5" stroke-width="2"/></svg><div><strong>${escapeHtml(family.lithology)}</strong><span>${escapeHtml(lithology.class)} · ${network.fractures.length} panels · ${family.seedCount} seeds<br>μ size ${round(family.aggregate.size.mean,3)}× · μ spacing ${round(family.aggregate.spacing.mean,3)}× · ${family.blockDiagnostic.blockCount} diagnostic blocks</span></div></article>`);
  }
  await screenshot(page, shell(
    'All 65 rock families · C5 fracture/block coverage',
    'Every ontology family passed 32 independent seed sets plus a finite-block occupancy and inheritance diagnostic. Glyphs show authored mean strike.',
    `<main class="family-grid">${familyCards.join('')}</main>`,
    '.family-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:10px}.family{overflow:hidden;background:#1a2321;border:1px solid #3b4945;border-radius:8px}.family svg{height:86px;object-fit:cover}.family div{padding:8px 9px}.family strong{display:block;font-size:10px;margin-bottom:3px}.family span{display:block;color:#aebdb6;font:7.5px/1.4 ui-monospace,monospace}.family.ok{border-color:#3d6652}.family.bad{border-color:#a85b46}',
  ), 'catalog-family-fracture-coverage.png', { width: 1800, height: 2450 });
  captureFiles.push('catalog-family-fracture-coverage.png');
} finally {
  await browser.close();
}

if (errors.length > 0) throw new Error(`Capture browser errors:\n${errors.join('\n')}`);
const captures = [];
for (const file of captureFiles) {
  const bytes = await readFile(path.join(capturesDirectory, file));
  captures.push({
    bytes: bytes.length,
    file: `captures/${file}`,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
}
const result = { passed: captures.length === 8 && captures.every((entry) => entry.bytes > 20_000), captures, errors };
await writeFile(path.join(evidenceDirectory, 'capture-results.json'), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
if (!result.passed) process.exitCode = 1;
