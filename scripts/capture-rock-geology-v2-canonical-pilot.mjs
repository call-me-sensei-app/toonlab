#!/usr/bin/env node

import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const evidenceDirectory = path.resolve(process.argv[2]
  ?? 'artifacts/research/rock-geology-v2/checkpoint-08-basis-families/morphology/canonical-pilot');
const capturesDirectory = path.join(evidenceDirectory, 'captures');
const threeModulePath = path.resolve('node_modules/three/build/three.module.js');
const threeCorePath = path.resolve('node_modules/three/build/three.core.js');
const objLoaderPath = path.resolve('node_modules/three/examples/jsm/loaders/OBJLoader.js');

const LABELS = Object.freeze({
  'rock-v2-tor-block-pile-001': 'Granite block-pile tor',
  'rock-v2-pillar-residual-001': 'Wulingyuan-type residual pillar',
  'rock-v2-arch-sandstone-001': 'Sandstone natural arch',
  'rock-v2-cliff-module-straight-001': 'Continuous sandstone cliff module',
  'rock-v2-mountain-modular-bedrock-001': 'Stratified bedrock mountain module',
  'rock-v2-hoodoo-caprock-001': "Thor's Hammer-type caprock hoodoo",
});

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function parsePositions(obj) {
  return obj.split('\n').filter((line) => line.startsWith('v ')).map((line) => line.slice(2).trim().split(/\s+/).map(Number));
}

function boundsForObj(obj) {
  const points = parsePositions(obj);
  const min = [0, 1, 2].map((axis) => Math.min(...points.map((point) => point[axis])));
  const max = [0, 1, 2].map((axis) => Math.max(...points.map((point) => point[axis])));
  const center = min.map((value, axis) => (value + max[axis]) * 0.5);
  const radius = Math.max(Math.hypot(...max.map((value, axis) => value - min[axis])) * 0.5, 1e-6);
  return { center, max, min, radius };
}

function imageDataUrl(bytes) {
  return `data:image/png;base64,${bytes.toString('base64')}`;
}

async function startServer() {
  const [three, core, loader] = await Promise.all([readFile(threeModulePath), readFile(threeCorePath), readFile(objLoaderPath)]);
  const server = createServer((request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    if (request.url === '/') {
      response.setHeader('Content-Type', 'text/html');
      response.end(renderShell(server.address().port));
    } else if (request.url === '/three.module.js') {
      response.setHeader('Content-Type', 'text/javascript'); response.end(three);
    } else if (request.url === '/three.core.js') {
      response.setHeader('Content-Type', 'text/javascript'); response.end(core);
    } else if (request.url === '/OBJLoader.js') {
      response.setHeader('Content-Type', 'text/javascript'); response.end(loader);
    } else {
      response.statusCode = 404; response.end('not found');
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server;
}

function renderShell(port) {
  return String.raw`<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#111615}canvas{display:block}</style><script type="importmap">{"imports":{"three":"http://127.0.0.1:${port}/three.module.js"}}</script></head><body><script type="module">
    import * as THREE from 'three'; import {OBJLoader} from 'http://127.0.0.1:${port}/OBJLoader.js';
    const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;document.body.append(renderer.domElement);const loader=new OBJLoader();
    window.renderRock=async({obj,bounds,view})=>{const scene=new THREE.Scene();scene.background=new THREE.Color(0x111615);const aspect=innerWidth/innerHeight;const extent=bounds.radius*1.08;const camera=new THREE.OrthographicCamera(-extent*aspect,extent*aspect,extent,-extent,bounds.radius*.01,bounds.radius*20);const directions={threeQuarter:[1.42,.72,1.7],front:[0,.08,1],rear:[0,.08,-1],left:[-1,.08,0],right:[1,.08,0],top:[.04,1,.03],bottom:[.04,-1,.03]};const direction=new THREE.Vector3(...directions[view]).normalize();camera.position.fromArray(bounds.center).addScaledVector(direction,bounds.radius*5);camera.up.set(0,1,0);if(view==='top')camera.up.set(0,0,-1);if(view==='bottom')camera.up.set(0,0,1);camera.lookAt(...bounds.center);scene.add(new THREE.HemisphereLight(0xeaf1ec,0x24231f,1.65));const key=new THREE.DirectionalLight(0xffe2ba,4.8);key.position.fromArray(bounds.center).add(new THREE.Vector3(bounds.radius*2.8,bounds.radius*4.5,bounds.radius*3.4));key.castShadow=true;key.shadow.mapSize.set(2048,2048);scene.add(key);const fill=new THREE.DirectionalLight(0x7ba8c5,1.05);fill.position.fromArray(bounds.center).add(new THREE.Vector3(-bounds.radius*3,bounds.radius*1.25,-bounds.radius*2.2));scene.add(fill);if(view==='bottom'){const inspection=new THREE.DirectionalLight(0xe7f0ec,3.4);inspection.position.copy(camera.position);scene.add(inspection);}const object=loader.parse(obj);const material=new THREE.MeshStandardMaterial({color:0xa59b88,metalness:0,roughness:.92});object.traverse(child=>{if(!child.isMesh)return;child.geometry.computeVertexNormals();child.material=material;child.castShadow=true;child.receiveShadow=true});scene.add(object);if(view!=='top'&&view!=='bottom'){const floor=new THREE.Mesh(new THREE.PlaneGeometry(bounds.radius*14,bounds.radius*14),new THREE.MeshStandardMaterial({color:0x202724,roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.set(bounds.center[0],bounds.min[1]-bounds.radius*.015,bounds.center[2]);floor.receiveShadow=true;scene.add(floor);}renderer.render(scene,camera);await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));};
  </script></body></html>`;
}

async function renderObj(page, server, sourceId, kind, view, obj) {
  const filename = `${sourceId}--${kind}--${view}.png`;
  await page.setViewportSize({ width: 720, height: 540 });
  await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.renderRock === 'function');
  await page.evaluate((payload) => window.renderRock(payload), { bounds: boundsForObj(obj), obj, view });
  await page.screenshot({ path: path.join(capturesDirectory, filename) });
  return filename;
}

async function screenshotHtml(page, html, filename, width) {
  await page.setViewportSize({ width, height: 1000 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForFunction(() => [...document.images].every((image) => image.complete && image.naturalWidth > 0));
  await page.screenshot({ fullPage: true, path: path.join(capturesDirectory, filename) });
}

await mkdir(capturesDirectory, { recursive: true });
const report = JSON.parse(await readFile(path.join(evidenceDirectory, 'canonical-pilot-report.json'), 'utf8'));
const server = await startServer();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on('pageerror', (error) => console.error(`Canonical pilot page error: ${error.message}`));

try {
  const rendered = [];
  for (const result of report.results) {
    const files = {};
    for (const kind of ['canonical', 'procedural', 'manual']) {
      const obj = await readFile(path.join(evidenceDirectory, result.sourceId, `${kind}-source`, 'clay-mesh.obj'), 'utf8');
      files[kind] = {};
      const views = kind === 'canonical' ? ['threeQuarter', 'front', 'rear', 'left', 'right', 'top', 'bottom'] : ['threeQuarter'];
      for (const view of views) files[kind][view] = await renderObj(page, server, result.sourceId, kind, view, obj);
    }
    rendered.push({ ...result, files });
  }

  const dataUrl = async (filename) => imageDataUrl(await readFile(path.join(capturesDirectory, filename)));
  const rows = [];
  for (const item of rendered) {
    const cells = [];
    for (const [kind, label] of [['canonical', 'Canonical editable source'], ['procedural', 'Bounded procedural edit'], ['manual', 'Manual cage edit']]) {
      cells.push(`<figure><img src="${await dataUrl(item.files[kind].threeQuarter)}"><figcaption><b>${escapeHtml(label)}</b><span>${escapeHtml(item.revisions[kind].identity.passed ? 'identity pass' : 'identity fail')} · ${item.revisions[kind].mesh.vertices.toLocaleString()} vertices</span></figcaption></figure>`);
    }
    rows.push(`<article><header><b>${escapeHtml(LABELS[item.sourceId] ?? item.sourceId)}</b><span>${escapeHtml(item.subtypeId)} · ${escapeHtml(item.visualStatus)}</span></header><div>${cells.join('')}</div></article>`);
  }
  const board = `<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:26px;background:#0d1312;color:#edf1ee;font-family:Inter,ui-sans-serif,system-ui,sans-serif}h1{margin:0;font-size:28px;font-weight:700;letter-spacing:-.02em}.lead{margin:7px 0 20px;color:#a9b7b0;font-size:12px}main{display:grid;gap:14px}article{border:1px solid #394640;border-radius:11px;overflow:hidden;background:#171f1d}header{padding:10px 13px;display:flex;justify-content:space-between;gap:16px;align-items:baseline}header b{font-size:13px}header span{font:9px ui-monospace,monospace;color:#9dacA5}article>div{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:#394640}figure{margin:0;background:#111716}img{display:block;width:100%;aspect-ratio:4/3;object-fit:cover}figcaption{padding:7px 9px;display:flex;justify-content:space-between;gap:12px}figcaption b{font-size:9px}figcaption span{font:8px ui-monospace,monospace;color:#a4b1ab}.foot{margin-top:15px;color:#718079;font:10px ui-monospace,monospace}</style></head><body><h1>C8 canonical morphology pilot · clay comparison</h1><p class="lead">Exact compiled meshes. Surface treatment is intentionally removed so silhouette, support, openings, ledges, and module continuity cannot hide behind a bake.</p><main>${rows.join('')}</main><div class="foot">5 authored / 892 planned · 887 remain unassigned · existing 480 contribution: 0 · visual approval still required</div></body></html>`;
  await screenshotHtml(page, board, 'canonical-procedural-manual-clay.png', 2100);

  const multiviewRows = [];
  for (const item of rendered) {
    const cells = [];
    for (const view of ['threeQuarter', 'front', 'rear', 'left', 'right', 'top', 'bottom']) {
      cells.push(`<figure><img src="${await dataUrl(item.files.canonical[view])}"><figcaption>${escapeHtml(view)}</figcaption></figure>`);
    }
    multiviewRows.push(`<article><header>${escapeHtml(LABELS[item.sourceId] ?? item.sourceId)}</header><div>${cells.join('')}</div></article>`);
  }
  const multiview = `<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:26px;background:#0d1312;color:#edf1ee;font-family:Inter,ui-sans-serif,system-ui,sans-serif}h1{margin:0;font-size:28px}.lead{margin:7px 0 20px;color:#a9b7b0;font-size:12px}main{display:grid;gap:14px}article{border:1px solid #394640;border-radius:11px;overflow:hidden;background:#171f1d}header{padding:9px 12px;font-size:12px;font-weight:700}article>div{display:grid;grid-template-columns:repeat(7,1fr);gap:1px;background:#394640}figure{margin:0;background:#111716}img{display:block;width:100%;aspect-ratio:4/3;object-fit:cover}figcaption{padding:6px 8px;color:#acb8b2;font:8px ui-monospace,monospace}</style></head><body><h1>C8 canonical morphology pilot · seven-view audit</h1><p class="lead">Three-quarter plus front, rear, left, right, top, and bottom/support views of every canonical source before baking.</p><main>${multiviewRows.join('')}</main></body></html>`;
  await screenshotHtml(page, multiview, 'canonical-clay-multiview.png', 3200);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

console.log(`Canonical pilot captures written to ${capturesDirectory}`);
