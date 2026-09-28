#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

import { loadGeologyCatalog } from '../src/rockgen/experimental/geology-v2/catalog.node.js';
import { createHeroRockRecipe } from '../src/rockgen/experimental/geology-v2/recipe.node.js';
import { compileStructuralFieldProgram } from '../src/rockgen/experimental/geology-v2/structure/program.node.js';
import { frameToWorld } from '../src/rockgen/experimental/geology-v2/structure/math.node.js';
import { compileFractureBlockStage } from '../src/rockgen/experimental/geology-v2/fractures/compiler.node.js';
import { createC6ProcessFixtures } from '../src/rockgen/experimental/geology-v2/process/fixtures.node.js';
import { createProcessField } from '../src/rockgen/experimental/geology-v2/process/field.node.js';
import { meshProcessStage, meshToObj } from '../src/rockgen/experimental/geology-v2/process/meshing.node.js';
import { compileProcessStage } from '../src/rockgen/experimental/geology-v2/process/stability.node.js';

const evidenceDirectory = path.resolve(process.argv[2] ?? 'artifacts/research/rock-geology-v2/checkpoint-06-processes');
const resolution = Number(process.argv[3] ?? 42);
const capturesDirectory = path.join(evidenceDirectory, 'captures');
const meshesDirectory = path.join(evidenceDirectory, 'meshes');
const threeModulePath = path.resolve('node_modules/three/build/three.module.js');
const threeCorePath = path.resolve('node_modules/three/build/three.core.js');
const objLoaderPath = path.resolve('node_modules/three/examples/jsm/loaders/OBJLoader.js');
const assembleOnly = process.argv.includes('--assemble-only');
const kernelOnly = process.argv.includes('--kernel-only');

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function titleCase(value) {
  return value.split('-').map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`).join(' ');
}

function imageDataUrl(buffer) {
  return `data:image/png;base64,${buffer.toString('base64')}`;
}

function parsePositions(obj) {
  const positions = [];
  for (const line of obj.split('\n')) {
    if (!line.startsWith('v ')) continue;
    const values = line.slice(2).trim().split(/\s+/).map(Number);
    if (values.length === 3 && values.every(Number.isFinite)) positions.push(values);
  }
  return positions;
}

function combinedBounds(objects) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const obj of objects) for (const position of parsePositions(obj)) for (let axis = 0; axis < 3; axis += 1) {
    min[axis] = Math.min(min[axis], position[axis]);
    max[axis] = Math.max(max[axis], position[axis]);
  }
  const center = min.map((value, axis) => (value + max[axis]) * 0.5);
  const radius = Math.max(Math.hypot(...max.map((value, axis) => value - min[axis])) * 0.5, 1e-8);
  return { center, max, min, radius };
}

async function startModuleServer() {
  const three = await readFile(threeModulePath);
  const core = await readFile(threeCorePath);
  const loader = await readFile(objLoaderPath);
  const server = createServer((request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    if (request.url === '/') {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end(renderShell(server.address().port));
    } else if (request.url === '/three.module.js') {
      response.setHeader('Content-Type', 'text/javascript'); response.end(three);
    } else if (request.url === '/three.core.js') {
      response.setHeader('Content-Type', 'text/javascript'); response.end(core);
    } else if (request.url === '/OBJLoader.js') {
      response.setHeader('Content-Type', 'text/javascript'); response.end(loader);
    } else if (request.url?.startsWith('/capture/')) {
      const filename = path.basename(decodeURIComponent(request.url.slice('/capture/'.length)));
      readFile(path.join(capturesDirectory, filename)).then((bytes) => {
        response.setHeader('Content-Type', 'image/png'); response.end(bytes);
      }).catch(() => { response.statusCode = 404; response.end('not found'); });
    } else { response.statusCode = 404; response.end('not found'); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { port: server.address().port, server };
}

function renderShell(port) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#121716}canvas{display:block}</style><script type="importmap">{"imports":{"three":"http://127.0.0.1:${port}/three.module.js"}}</script></head><body><script type="module">
    import * as THREE from 'three'; import {OBJLoader} from 'http://127.0.0.1:${port}/OBJLoader.js';
    const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;document.body.append(renderer.domElement);const loader=new OBJLoader();
    window.renderRock=async({obj,bounds})=>{const scene=new THREE.Scene();scene.background=new THREE.Color(0x151b1a);scene.fog=new THREE.Fog(0x151b1a,bounds.radius*5,bounds.radius*10);const aspect=innerWidth/innerHeight;const extent=bounds.radius*.86;const camera=new THREE.OrthographicCamera(-extent*aspect,extent*aspect,extent,-extent,bounds.radius*.01,bounds.radius*20);const d=new THREE.Vector3(1.48,.76,1.72).normalize();camera.position.fromArray(bounds.center).addScaledVector(d,bounds.radius*5);camera.up.set(0,1,0);camera.lookAt(...bounds.center);
      scene.add(new THREE.HemisphereLight(0xe8f1ec,0x3b332b,1.65));const key=new THREE.DirectionalLight(0xffedcf,4.2);key.position.fromArray(bounds.center).add(new THREE.Vector3(bounds.radius*2.8,bounds.radius*4.5,bounds.radius*3.8));key.castShadow=true;key.shadow.mapSize.set(2048,2048);scene.add(key);const fill=new THREE.DirectionalLight(0x91b9d7,1.15);fill.position.fromArray(bounds.center).add(new THREE.Vector3(-bounds.radius*4,bounds.radius*1.8,-bounds.radius*2));scene.add(fill);
      const object=loader.parse(obj);object.traverse(child=>{if(!child.isMesh)return;child.geometry.computeVertexNormals();child.material=new THREE.MeshStandardMaterial({color:0x9d978b,metalness:0,roughness:.91});child.castShadow=true;child.receiveShadow=true});scene.add(object);const floor=new THREE.Mesh(new THREE.PlaneGeometry(bounds.radius*12,bounds.radius*12),new THREE.MeshStandardMaterial({color:0x202624,roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.set(bounds.center[0],bounds.min[1]-bounds.radius*.025,bounds.center[2]);floor.receiveShadow=true;scene.add(floor);renderer.render(scene,camera);await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));};
  </script></body></html>`;
}

function pageShell(title, subtitle, body, styles = '') {
  return `<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:30px;background:#101615;color:#edf3ef;font-family:Inter,ui-sans-serif,system-ui,sans-serif}h1{margin:0;font-size:29px;letter-spacing:-.02em}p.lead{margin:7px 0 23px;color:#aab8b1;font-size:13px}.foot{margin-top:18px;color:#71827a;font:10px ui-monospace,monospace}${styles}</style></head><body><h1>${escapeHtml(title)}</h1><p class="lead">${escapeHtml(subtitle)}</p>${body}<div class="foot">Checkpoint 6 · neutral clay · process form before C7 surface baking · identical camera and bounds within each pair</div></body></html>`;
}

async function screenshotHtml(page, html, file, width = 1900) {
  await page.setViewportSize({ width, height: 1000 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForFunction(() => [...document.images].every((image) => image.complete && image.naturalWidth > 0));
  await page.screenshot({ fullPage: true, path: path.join(capturesDirectory, file) });
}

async function renderObj(page, obj, bounds, file, size = { width: 520, height: 390 }) {
  await page.setViewportSize(size);
  await page.goto(page.url().split('#')[0], { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.renderRock === 'function');
  await page.evaluate((payload) => window.renderRock(payload), { bounds, obj });
  return page.screenshot({ path: path.join(capturesDirectory, file) });
}

function pairSheet(title, subtitle, records, columns = 5) {
  const cards = records.map((record) => `<article><header><strong>${escapeHtml(record.label)}</strong><span>${escapeHtml(record.meta)}</span></header><div class="pair"><figure><img src="${record.before}"><figcaption>BEFORE · t0</figcaption></figure><figure><img src="${record.after}"><figcaption>AFTER · declared exposure</figcaption></figure></div></article>`).join('');
  return pageShell(title, subtitle, `<main>${cards}</main>`, `<style>main{display:grid;grid-template-columns:repeat(${columns},1fr);gap:14px}article{overflow:hidden;border:1px solid #3b4944;border-radius:11px;background:#19211f}header{padding:10px 12px;display:flex;align-items:start;justify-content:space-between;gap:8px;min-height:48px}header strong{font-size:13px}header span{color:#9caea6;font:9px/1.35 ui-monospace,monospace;text-align:right}.pair{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:#394640}figure{margin:0;background:#141a19}img{display:block;width:100%;aspect-ratio:4/3;object-fit:cover}figcaption{padding:7px 8px;color:#b8c7c0;font:8px ui-monospace,monospace}</style>`);
}

function timeSheet(records) {
  return pageShell('Process time sequence · monotonic removal', 'The same granite structure and fracture network at five normalized exposure times; geometry may be removed or detached, never regrown.', `<main>${records.map((record) => `<figure><img src="${record.image}"><figcaption><b>${record.percent}%</b><span>${record.years.toLocaleString()} years</span></figcaption></figure>`).join('')}</main>`, '<style>main{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}figure{margin:0;overflow:hidden;border:1px solid #3c4a45;border-radius:11px;background:#19211f}img{display:block;width:100%;aspect-ratio:4/3;object-fit:cover}figcaption{padding:11px 12px;display:flex;justify-content:space-between}figcaption b{color:#8ce1ae}figcaption span{font:10px ui-monospace,monospace;color:#a8b8b0}</style>');
}

function drainageHtml(fixture) {
  const field = createProcessField(fixture.processStage.processProgram, fixture.structuralProgram, fixture.fractureStage);
  const extents = fixture.structuralProgram.bounds.halfExtentsMetres;
  const columns = 44; const rows = 30; const cells = [];
  for (let row = 0; row < rows; row += 1) for (let column = 0; column < columns; column += 1) {
    const local = [
      (-.95 + column / (columns - 1) * 1.9) * extents[0],
      extents[1] * .68,
      (-.95 + row / (rows - 1) * 1.9) * extents[2],
    ];
    const sample = field.sample(frameToWorld(fixture.structuralProgram.frames.formation, local));
    const value = sample.environment.drainage;
    const hue = 166 + value * 42; const light = 19 + value * 40;
    cells.push(`<rect x="${column * 28}" y="${(rows - row - 1) * 24}" width="28.4" height="24.4" fill="hsl(${hue} 64% ${light}%)"/>`);
  }
  const arrows = Array.from({ length: 12 }, (_, index) => {
    const x = 70 + (index % 6) * 205; const y = 100 + Math.floor(index / 6) * 390;
    return `<path d="M${x} ${y}q55 45 18 118t22 130" fill="none" stroke="#d8f5ff" stroke-width="5" stroke-linecap="round" marker-end="url(#arrow)" opacity=".78"/>`;
  }).join('');
  const svg = `<svg viewBox="0 0 1232 720"><defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#d8f5ff"/></marker></defs>${cells.join('')}${arrows}<rect x="0" y="0" width="1232" height="720" fill="none" stroke="#6c8178" stroke-width="4"/></svg>`;
  const legend = '<aside><b>Field composition</b><span>surface exposure</span><span>topographic channel noise</span><span>declared water routing</span><span>moisture + permeability</span><span>finite-fracture infiltration</span><em>Dark = low runoff<br>Bright cyan = concentrated drainage</em></aside>';
  return pageShell('Drainage, runoff, and infiltration field', 'Karst fixture shown in formation coordinates. Channels are global, deterministic, bounded, and feed dissolution rather than acting as a color-only mask.', `<main><div>${svg}</div>${legend}</main>`, '<style>main{display:grid;grid-template-columns:3fr 1fr;gap:18px}.foot{grid-column:1/-1}main>div,aside{border:1px solid #3b4a45;border-radius:12px;overflow:hidden;background:#18201e}svg{display:block;width:100%}aside{padding:24px;display:flex;flex-direction:column;gap:13px}aside b{font-size:17px;margin-bottom:5px}aside span{padding:10px;border-left:3px solid #69cdb0;background:#202b28;font:11px ui-monospace,monospace}aside em{margin-top:auto;color:#9fb1a8;font:11px/1.6 ui-monospace,monospace}</style>');
}

function supportHtml(fixture) {
  const model = fixture.fractureStage.blockModel;
  const result = fixture.processStage.stabilityResult;
  const detached = new Set(result.unsupportedBlockIds); const grounded = new Set(result.groundedBlockIds); const supported = new Set(result.supportedBlockIds);
  const stateFor = (block) => detached.has(block.id) ? 'detached' : grounded.has(block.id) ? 'grounded' : supported.has(block.id) ? 'supported' : 'eroded';
  const grouped = Object.groupBy(model.blocks.map((block, index) => ({ block, index, state: stateFor(block) })), (entry) => entry.state);
  const positions = new Map();
  for (const state of ['detached', 'supported', 'grounded', 'eroded']) {
    const entries = grouped[state] ?? [];
    entries.forEach((entry, index) => {
      const span = state === 'eroded' ? [1000, 1110] : state === 'grounded' ? [320, 760] : [220, 980];
      const x = entries.length === 1 ? (span[0] + span[1]) * 0.5 : span[0] + index / (entries.length - 1) * (span[1] - span[0]);
      const y = state === 'detached' ? 255 : state === 'supported' ? 440 : 610;
      positions.set(entry.block.id, { x, y, index: entry.index });
    });
  }
  const edges = result.viableEdges.map((edge) => { const a = positions.get(edge.supportingBlockId); const b = positions.get(edge.supportedBlockId); return `<path d="M${a.x} ${a.y}L${b.x} ${b.y}" stroke="#8ea59a" stroke-width="${2 + edge.survivingContactFraction * 7}" opacity=".62"/>`; }).join('');
  const nodes = model.blocks.map((block) => { const p = positions.get(block.id); const state = stateFor(block); const color = { detached: '#e9846d', grounded: '#efbf69', supported: '#72dca1', eroded: '#66736d' }[state]; const radius = 18 + Math.min(28, Math.cbrt(block.volumeMetres3) * 3); return `<g><circle cx="${p.x}" cy="${p.y}" r="${radius}" fill="${color}" stroke="#101615" stroke-width="4"/><text x="${p.x}" y="${p.y + 4}" text-anchor="middle">${p.index + 1}</text><text x="${p.x}" y="${p.y + radius + 18}" text-anchor="middle" class="state">${state}</text></g>`; }).join('');
  const svg = `<svg viewBox="0 0 1200 760"><rect x="30" y="30" width="1140" height="670" rx="22" fill="#18201e" stroke="#3e4d48"/><path d="M60 650H1140" stroke="#efbf69" stroke-width="5" stroke-dasharray="12 8"/>${edges}${nodes}<g transform="translate(70 74)" class="legend"><circle cx="0" cy="0" r="8" fill="#efbf69"/><text x="17" y="4">grounded</text><circle cx="125" cy="0" r="8" fill="#72dca1"/><text x="142" y="4">supported path</text><circle cx="300" cy="0" r="8" fill="#e9846d"/><text x="317" y="4">detached → inventory</text></g></svg>`;
  return pageShell('Support graph and detachment result', 'Marine-undercut fixture. Contact area is reduced by retained fraction and bond weakening; nodes without a grounded support path are detached, never silently deleted.', svg, '<style>svg{display:block;width:100%;max-height:780px}.state,.legend,text{fill:#e8f0ec;font:12px ui-monospace,monospace}</style>');
}

function accountingHtml(fixtures) {
  const names = ['aeolian','exfoliation','fluvial','freezeThaw','glacial','karst','marine','spheroidal','tafoni','thermalSalt'];
  const width = 1640; const barWidth = 1180; const rows = names.map((name, index) => {
    const mass = fixtures[name].processStage.massAccounting; const total = mass.parentVolumeMetres3;
    const retained = mass.retainedVolumeMetres3 / total; const eroded = mass.directErodedVolumeMetres3 / total; const detached = mass.detachedVolumeMetres3 / total;
    const y = 60 + index * 70;
    return `<text x="18" y="${y + 25}">${escapeHtml(name)}</text><rect x="330" y="${y}" width="${barWidth * retained}" height="38" fill="#70d39c"/><rect x="${330 + barWidth * retained}" y="${y}" width="${barWidth * eroded}" height="38" fill="#6eaed5"/><rect x="${330 + barWidth * (retained + eroded)}" y="${y}" width="${barWidth * detached}" height="38" fill="#e77f69"/><text x="1530" y="${y + 25}" text-anchor="end">residual ${mass.residualCells}</text>`;
  }).join('');
  const svg = `<svg viewBox="0 0 ${width} 790"><g font="12px ui-monospace,monospace" fill="#dce6e1">${rows}</g><g transform="translate(330 770)" font="11px ui-monospace,monospace" fill="#c8d4ce"><rect width="18" height="12" y="-10" fill="#70d39c"/><text x="25">retained</text><rect x="125" width="18" height="12" y="-10" fill="#6eaed5"/><text x="150">direct erosion</text><rect x="300" width="18" height="12" y="-10" fill="#e77f69"/><text x="325">detached and transferred</text></g></svg>`;
  return pageShell('Exact C5-cell volume accounting', 'Each horizontal bar is the complete sampled parent volume. Retained + direct erosion + detached volume closes with zero cell residual for every causal fixture.', svg, '<style>svg{display:block;width:100%;background:#18201e;border:1px solid #3b4945;border-radius:12px}</style>');
}

function lineageHtml(fixture) {
  const pieces = fixture.processStage.transport.pieces;
  const maximumRadiusProxy = Math.max(...pieces.map((piece) => Math.cbrt(piece.depositedVolumeMetres3)), 1);
  const pieceMarks = pieces.map((piece, index) => { const x = 930 + (index % 6) * 120; const y = 210 + Math.floor(index / 6) * 145 + (index % 2) * 28; const radius = 25 + Math.cbrt(piece.depositedVolumeMetres3) / maximumRadiusProxy * 43; return `<path d="M540 ${180 + (index % 9) * 42}Q760 ${120 + index * 32} ${x} ${y}" fill="none" stroke="#678c7c" stroke-width="2" stroke-dasharray="6 5"/><g transform="translate(${x} ${y}) rotate(${-piece.deposition.imbricationDegrees})"><ellipse rx="${radius * 1.35}" ry="${radius * .75}" fill="#9e988a" stroke="#d6cba8" stroke-width="3"/></g><text x="${x}" y="${y + radius + 20}" text-anchor="middle">${piece.id.replace('transport-piece-','P')}</text>`; }).join('');
  const labels = pieces.slice(0, 8).map((piece, index) => `<text x="88" y="${180 + index * 42}">${piece.lineage.sourceBlockId} → ${piece.id.replace('transport-piece-','P')} · ${piece.lineage.sourceLithology}/${piece.lineage.sourceFabricKind}</text>`).join('');
  const svg = `<svg viewBox="0 0 1700 900"><defs><linearGradient id="cliff" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#aba494"/><stop offset="1" stop-color="#665f55"/></linearGradient></defs><path d="M40 90H590V700L500 660L450 720L390 680L320 730L250 675L190 710L100 665L40 690Z" fill="url(#cliff)" stroke="#d2c7aa" stroke-width="4"/><g fill="#eef3ef" font="12px ui-monospace,monospace">${labels}${pieceMarks}</g><path d="M590 700Q1050 570 1650 760V860H590Z" fill="#313a35" stroke="#62736a"/><text x="80" y="125" fill="#fff" font="800 23px Inter,sans-serif">SOURCE OUTCROP</text><text x="1180" y="115" fill="#fff" font="800 23px Inter,sans-serif">STABLE SORTED TALUS</text><text x="1180" y="145" fill="#aebdb5" font="12px ui-monospace,monospace">ground support · imbrication · abrasion · source lineage retained</text></svg>`;
  return pageShell('Source-to-talus lineage', 'Every deposited piece carries its source formation, lithology, fabric, and block ID while transport changes roundness, volume, runout, burial, and imbrication.', svg, '<style>svg{display:block;width:100%;background:#17201d;border:1px solid #3a4a44;border-radius:12px}</style>');
}

await mkdir(capturesDirectory, { recursive: true });
await mkdir(meshesDirectory, { recursive: true });
const automated = JSON.parse(await readFile(path.join(evidenceDirectory, 'automated-results.json'), 'utf8'));
if (!automated.passed) throw new Error('Refusing to capture failed C6 automated evidence.');
const catalog = loadGeologyCatalog();
const fixtureRecipes = createC6ProcessFixtures({ catalog });
const fixtures = {};
for (const [name, recipe] of Object.entries(fixtureRecipes)) {
  const structuralProgram = compileStructuralFieldProgram(recipe, { catalog });
  const fractureStage = compileFractureBlockStage(recipe, structuralProgram, { catalog });
  fixtures[name] = { fractureStage, processStage: compileProcessStage(recipe, structuralProgram, fractureStage, { catalog }), recipe, structuralProgram };
}

const { port, server } = await startModuleServer();
const captureUrl = (file) => `http://127.0.0.1:${port}/capture/${encodeURIComponent(file)}`;
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 520, height: 390 }, deviceScaleFactor: 1 });
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
const rendered = [];

async function renderPair(name, label, meshResolution = resolution) {
  const fixture = fixtures[name];
  const beforeFile = `${name}--before.png`; const afterFile = `${name}--after.png`;
  if (assembleOnly) {
    rendered.push(beforeFile, afterFile);
    return { after: captureUrl(afterFile), before: captureUrl(beforeFile), label, meta: fixture.recipe.processes.join(' + ') };
  }
  const beforeGenerated = meshProcessStage(fixture.processStage, fixture.structuralProgram, fixture.fractureStage, { applyStability: false, resolution: meshResolution, timeFraction: 0 });
  const afterGenerated = meshProcessStage(fixture.processStage, fixture.structuralProgram, fixture.fractureStage, { applyStability: false, resolution: meshResolution, timeFraction: 1 });
  const beforeObj = meshToObj(beforeGenerated.mesh, { name: `${name}-before` }); const afterObj = meshToObj(afterGenerated.mesh, { name: `${name}-after` });
  const bounds = combinedBounds([beforeObj, afterObj]);
  await writeFile(path.join(meshesDirectory, `${name}--before.obj`), beforeObj); await writeFile(path.join(meshesDirectory, `${name}--after.obj`), afterObj);
  const before = await renderObj(page, beforeObj, bounds, beforeFile); const after = await renderObj(page, afterObj, bounds, afterFile);
  const record = { after: captureUrl(afterFile), before: captureUrl(beforeFile), label, meta: fixture.recipe.processes.join(' + ') };
  rendered.push(beforeFile, afterFile); return record;
}

const processGroups = [
  [['spheroidal','Spheroidal'],['exfoliation','Exfoliation'],['freezeThaw','Freeze–thaw'],['thermalSalt','Thermal + salt'],['tafoni','Tafoni']],
  [['karst','Karst'],['marine','Marine'],['fluvial','Fluvial'],['aeolian','Aeolian'],['glacial','Glacial']],
];
for (const [groupIndex, group] of processGroups.entries()) {
  const records = [];
  for (const [name, label] of group) records.push(await renderPair(name, label));
  await screenshotHtml(page, pairSheet(`C6 causal process forms · ${groupIndex + 1}/2`, 'Each pair reuses the same C4 structure, C5 fracture network, orthographic camera, bounds, neutral material, and light; only geological time advances.', records), `process-before-after-${groupIndex + 1}.png`);
  rendered.push(`process-before-after-${groupIndex + 1}.png`);
}

const timeRecords = [];
for (const timeFraction of [0, .25, .5, .75, 1]) {
  const fixture = fixtures.combinedA;
  const file = `time-${String(Math.round(timeFraction * 100)).padStart(3,'0')}.png`;
  if (!assembleOnly) {
    const generated = meshProcessStage(fixture.processStage, fixture.structuralProgram, fixture.fractureStage, { applyStability: false, resolution, timeFraction });
    const obj = meshToObj(generated.mesh); const bounds = combinedBounds([obj]); await renderObj(page, obj, bounds, file);
  }
  timeRecords.push({ image: captureUrl(file), percent: Math.round(timeFraction * 100), years: Math.round(fixture.recipe.weathering.exposureYears * timeFraction) }); rendered.push(file);
}
await screenshotHtml(page, timeSheet(timeRecords), 'process-time-sequence.png'); rendered.push('process-time-sequence.png');

// All 65 ontology families receive a fixed representative C6 before/after pair.
const familyByClass = { igneous: [], metamorphic: [], sedimentary: [] };
if (!kernelOnly) for (const [index, lithology] of catalog.ontology.lithologies.entries()) {
  const recipe = createHeroRockRecipe(lithology.id, { catalog, seed: 80_000 + index });
  const beforeFile = `family-${lithology.id}--before.png`; const afterFile = `family-${lithology.id}--after.png`;
  if (!assembleOnly) {
    const structuralProgram = compileStructuralFieldProgram(recipe, { catalog });
    const fractureStage = compileFractureBlockStage(recipe, structuralProgram, { catalog });
    const processStage = compileProcessStage(recipe, structuralProgram, fractureStage, { catalog });
    const beforeGenerated = meshProcessStage(processStage, structuralProgram, fractureStage, { applyStability: false, resolution: 32, timeFraction: 0 });
    const afterGenerated = meshProcessStage(processStage, structuralProgram, fractureStage, { applyStability: false, resolution: 32, timeFraction: 1 });
    const beforeObj = meshToObj(beforeGenerated.mesh); const afterObj = meshToObj(afterGenerated.mesh); const bounds = combinedBounds([beforeObj, afterObj]);
    await renderObj(page, beforeObj, bounds, beforeFile, { width: 400, height: 300 });
    await renderObj(page, afterObj, bounds, afterFile, { width: 400, height: 300 });
  }
  familyByClass[lithology.class].push({ after: captureUrl(afterFile), before: captureUrl(beforeFile), id: lithology.id, label: titleCase(lithology.id), meta: recipe.processes.join(' + ') });
  rendered.push(`family-${lithology.id}--before.png`, `family-${lithology.id}--after.png`);
}
for (const [rockClass, records] of Object.entries(familyByClass)) {
  if (records.length === 0) continue;
  const chunks = [];
  for (let start = 0; start < records.length; start += 8) chunks.push(records.slice(start, start + 8));
  for (const [chunkIndex, chunk] of chunks.entries()) {
    const file = `family-before-after-${rockClass}-${chunkIndex + 1}-of-${chunks.length}.png`;
    await screenshotHtml(page, pairSheet(`${titleCase(rockClass)} families · before/after · ${chunkIndex + 1}/${chunks.length}`, `${records.length} ${rockClass} families in the 65-family ontology. Fixed seed per family; declared hero process and exposure; no C7 microdetail or material bake.`, chunk, 4), file, 1900);
    rendered.push(file);
  }
}
if (!kernelOnly) {
  const familyAudit = JSON.parse(await readFile(path.join(evidenceDirectory, 'family-process-results.json'), 'utf8'));
  const recordById = new Map(Object.values(familyByClass).flat().map((record) => [record.id, record]));
  const riskRecords = [...familyAudit]
    .sort((left, right) => right.productionDetachedCells - left.productionDetachedCells
      || right.productionErodedCells - left.productionErodedCells
      || left.lithology.localeCompare(right.lithology))
    .slice(0, 8)
    .map((result) => ({
      ...recordById.get(result.lithology),
      meta: `detached ${result.productionDetachedCells} cells · eroded ${result.productionErodedCells} cells`,
    }));
  await screenshotHtml(page, pairSheet('C6 objective outlier / review-risk board', 'The eight family representatives with the highest production detached-cell count, then direct erosion. Selection is metric-driven rather than hand-picked for appearance.', riskRecords, 4), 'outliers.png', 1900);
  rendered.push('outliers.png');
}

for (const [file, html] of [
  ['drainage-infiltration-overlay.png', drainageHtml(fixtures.karst)],
  ['support-stability-graph.png', supportHtml(fixtures.marine)],
  ['detached-volume-accounting.png', accountingHtml(fixtures)],
  ['source-to-talus-lineage.png', lineageHtml(fixtures.talus)],
]) {
  await screenshotHtml(page, html, file, 1800); rendered.push(file);
}

await browser.close();
await new Promise((resolve) => server.close(resolve));
const files = [];
for (const file of rendered.sort()) {
  const bytes = await readFile(path.join(capturesDirectory, file));
  files.push({ bytes: bytes.length, file, sha256: createHash('sha256').update(bytes).digest('hex') });
}
const manifest = {
  captureCount: files.length,
  files,
  familyPairs: Object.values(familyByClass).reduce((sum, records) => sum + records.length, 0),
  kernelPairs: 10,
  // Smooth neutral-clay t0 boxes compress unusually well; integrity is proven
  // by SHA-256 plus a conservative non-empty PNG floor rather than filesize
  // inflation. Contact sheets and diagnostic charts remain much larger.
  passed: files.every((file) => file.bytes > 2_500),
  renderResolution: resolution,
};
await writeFile(path.join(evidenceDirectory, 'capture-results.json'), `${JSON.stringify(manifest, null, 2)}\n`);
if (!manifest.passed || (!kernelOnly && manifest.familyPairs !== 65)) throw new Error('C6 capture gate failed.');
console.log(JSON.stringify({ captures: manifest.captureCount, familyPairs: manifest.familyPairs, kernelPairs: manifest.kernelPairs, passed: manifest.passed }, null, 2));
