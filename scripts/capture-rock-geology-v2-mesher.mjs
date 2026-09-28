#!/usr/bin/env node

import { createServer } from 'node:http';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const evidenceDirectory = path.resolve(
  process.argv[2] ?? 'artifacts/research/rock-geology-v2/checkpoint-03-topology-mesher',
);
const meshesDirectory = path.join(evidenceDirectory, 'meshes');
const capturesDirectory = path.join(evidenceDirectory, 'captures');
const threeModulePath = path.resolve('node_modules/three/build/three.module.js');
const threeCorePath = path.resolve('node_modules/three/build/three.core.js');
const objLoaderPath = path.resolve('node_modules/three/examples/jsm/loaders/OBJLoader.js');
const selectedCandidate = 'toonlab-manifold-dual-contouring';
const candidates = [
  { id: 'surface-nets-baseline', label: 'Existing QEF Surface Nets' },
  { id: 'vega-mc33-reference', label: 'Vega MC33 v5.5 reference' },
  { id: selectedCandidate, label: 'ToonLab Manifold Dual Contouring' },
];

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
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
  for (const obj of objects) for (const position of parsePositions(obj)) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], position[axis]);
      max[axis] = Math.max(max[axis], position[axis]);
    }
  }
  const center = min.map((value, axis) => (value + max[axis]) * 0.5);
  const radius = Math.max(Math.hypot(...max.map((value, axis) => value - min[axis])) * 0.5, 1e-8);
  return { center, max, min, radius };
}

function imageDataUrl(buffer) {
  return `data:image/png;base64,${buffer.toString('base64')}`;
}

async function startModuleServer() {
  const three = await readFile(threeModulePath);
  const threeCore = await readFile(threeCorePath);
  const loader = await readFile(objLoaderPath);
  const server = createServer((request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    if (request.url === '/') {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end(renderShell(server.address().port));
    } else if (request.url === '/three.module.js') {
      response.setHeader('Content-Type', 'text/javascript; charset=utf-8');
      response.end(three);
    } else if (request.url === '/three.core.js') {
      response.setHeader('Content-Type', 'text/javascript; charset=utf-8');
      response.end(threeCore);
    } else if (request.url === '/OBJLoader.js') {
      response.setHeader('Content-Type', 'text/javascript; charset=utf-8');
      response.end(loader);
    }
    else {
      response.statusCode = 404;
      response.end('not found');
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return { port: server.address().port, server };
}

function renderShell(port) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#111719;color:#eef3ee;font-family:Inter,ui-sans-serif,system-ui,sans-serif}
    canvas{display:block;width:100%;height:100%}.hud{position:fixed;left:22px;right:22px;display:flex;justify-content:space-between;gap:20px;z-index:3;pointer-events:none;text-shadow:0 2px 8px #000}
    #top{top:18px;align-items:flex-start}#bottom{bottom:18px;align-items:flex-end}.title{font-size:20px;font-weight:800;letter-spacing:.01em}.sub{font-size:12px;color:#cbd5d0;margin-top:4px}.badge{padding:7px 10px;border:1px solid #577064;border-radius:999px;background:#18241fdd;color:#bfe9cf;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em}.badge.fail{color:#ffd0c4;border-color:#935541;background:#311d19dd}.metrics{font:11px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;color:#dde8e2;background:#0c1112c9;border:1px solid #40504a;border-radius:8px;padding:8px 10px}
  </style><script type="importmap">{"imports":{"three":"http://127.0.0.1:${port}/three.module.js"}}</script></head><body>
  <div class="hud" id="top"><div><div class="title" id="title"></div><div class="sub" id="subtitle"></div></div><div class="badge" id="badge"></div></div>
  <div class="hud" id="bottom"><div class="metrics" id="metrics"></div><div class="sub">Orthographic · neutral clay · fixed union bounds</div></div>
  <script type="module">
    import * as THREE from 'three';
    import { OBJLoader } from 'http://127.0.0.1:${port}/OBJLoader.js';
    const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
    renderer.setPixelRatio(1);renderer.setSize(innerWidth,innerHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;document.body.prepend(renderer.domElement);
    const loader=new OBJLoader();
    window.renderRock=async ({bounds,candidate,fixture,metrics,obj,status,view})=>{
      const scene=new THREE.Scene();scene.background=new THREE.Color(0x111719);scene.fog=new THREE.Fog(0x111719,bounds.radius*6,bounds.radius*11);
      const aspect=innerWidth/innerHeight;const extent=bounds.radius*1.18;const camera=new THREE.OrthographicCamera(-extent*aspect,extent*aspect,extent,-extent,bounds.radius*.01,bounds.radius*20);
      const directions={hero:[1.4,.8,1.55],front:[0,.12,1],side:[1,.12,0],top:[.06,1,.08]};const d=new THREE.Vector3(...directions[view]).normalize();camera.position.fromArray(bounds.center).addScaledVector(d,bounds.radius*5);camera.up.set(0,1,0);if(view==='top')camera.up.set(0,0,-1);camera.lookAt(...bounds.center);
      scene.add(new THREE.HemisphereLight(0xdceeff,0x4d4239,1.25));const key=new THREE.DirectionalLight(0xfff0d6,3.1);key.position.fromArray(bounds.center).add(new THREE.Vector3(bounds.radius*3,bounds.radius*5,bounds.radius*4));scene.add(key);const rim=new THREE.DirectionalLight(0xa7c9ff,1.4);rim.position.fromArray(bounds.center).add(new THREE.Vector3(-bounds.radius*4,bounds.radius*2,-bounds.radius*2));scene.add(rim);
      const object=loader.parse(obj);const geometries=[];object.traverse(child=>{if(child.isMesh)geometries.push(child.geometry)});const group=new THREE.Group();
      const failed=status>0;for(const geometry of geometries){geometry.computeVertexNormals();const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:failed?0xb96c56:0x9ca7a1,metalness:0,roughness:.82}));group.add(mesh);const edges=new THREE.LineSegments(new THREE.EdgesGeometry(geometry,failed?8:24),new THREE.LineBasicMaterial({color:failed?0xff6b4a:0x26332f,transparent:true,opacity:failed?.72:.34}));group.add(edges)}scene.add(group);
      const floor=new THREE.Mesh(new THREE.PlaneGeometry(bounds.radius*12,bounds.radius*12),new THREE.MeshStandardMaterial({color:0x18201e,roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.set(bounds.center[0],bounds.min[1]-bounds.radius*.07,bounds.center[2]);scene.add(floor);
      document.querySelector('#title').textContent=fixture;document.querySelector('#subtitle').textContent=candidate+' · '+view+' view';const badge=document.querySelector('#badge');badge.textContent=failed?status+' topology failures':'topology clean';badge.className='badge'+(failed?' fail':'');document.querySelector('#metrics').textContent=metrics;
      renderer.render(scene,camera);await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));document.body.dataset.ready='true';
    };
  </script></body></html>`;
}

async function screenshotCards(page, cards, {
  columns = 3,
  description,
  file,
  title,
}) {
  const body = cards.map((card) => `<article class="${card.failed ? 'failed' : ''}"><img src="${card.dataUrl}"><div><strong>${escapeHtml(card.heading)}</strong><span>${escapeHtml(card.caption)}</span></div></article>`).join('');
  await page.setViewportSize({ width: 1800, height: 1000 });
  await page.setContent(`<!doctype html><html><head><style>
    *{box-sizing:border-box}body{margin:0;padding:30px;background:#151b1b;color:#eef4f0;font-family:Inter,system-ui,sans-serif}h1{margin:0 0 7px;font-size:27px}p{margin:0 0 24px;color:#aebbb5;font-size:13px}main{display:grid;grid-template-columns:repeat(${columns},1fr);gap:15px}article{overflow:hidden;background:#202929;border:1px solid #41504b;border-radius:10px}article.failed{border-color:#a45f49}img{display:block;width:100%;aspect-ratio:4/3;object-fit:cover}article div{display:flex;justify-content:space-between;gap:12px;padding:9px 11px;align-items:center}strong{font-size:12px}span{font:10px/1.3 ui-monospace,monospace;color:#adc0b6;text-align:right}.failed span{color:#ffbba8}
  </style></head><body><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p><main>${body}</main></body></html>`, { waitUntil: 'load' });
  await page.waitForFunction(() => [...document.images].every((image) => image.complete && image.naturalWidth > 0));
  await page.screenshot({ fullPage: true, path: path.join(capturesDirectory, file) });
}

async function screenshotDashboard(page, html, file, viewport = { width: 1800, height: 1100 }) {
  await page.setViewportSize(viewport);
  await page.setContent(html, { waitUntil: 'load' });
  await page.screenshot({ fullPage: true, path: path.join(capturesDirectory, file) });
}

function topologyHeatmapHtml(threeWay) {
  const fixtures = [...new Set(threeWay.records.map((entry) => entry.fixture))];
  const header = candidates.map((entry) => `<th>${escapeHtml(entry.label)}</th>`).join('');
  const rows = fixtures.map((fixture) => {
    const cells = candidates.map((candidate) => {
      const record = threeWay.records.find((entry) => entry.fixture === fixture && entry.candidate === candidate.id);
      const failures = record.topology.topologyFailures;
      const parts = [
        `${failures} total`,
        `${record.topology.nonManifoldEdges} non-manifold E`,
        `${record.topology.degenerateTriangles} degenerate`,
        `${record.topology.selfIntersectionPairs} self-X`,
      ];
      return `<td class="${failures ? 'fail' : 'pass'}"><b>${failures ? 'FAIL' : 'CLEAN'}</b><span>${parts.join('<br>')}</span></td>`;
    }).join('');
    return `<tr><th>${escapeHtml(fixture)}</th>${cells}</tr>`;
  }).join('');
  return `<!doctype html><html><head><style>*{box-sizing:border-box}body{margin:0;padding:36px;background:#141a1b;color:#eef4ef;font-family:Inter,system-ui,sans-serif}h1{margin:0 0 8px;font-size:30px}p{margin:0 0 27px;color:#aab8b2}table{width:100%;border-collapse:separate;border-spacing:8px}th{text-align:left;font-size:12px;color:#cdd8d3;padding:8px}td{height:100px;border-radius:10px;padding:13px 15px;border:1px solid}td.pass{background:#173126;border-color:#3d7f5e}td.fail{background:#3b211c;border-color:#a95942}td b{display:block;font-size:15px;margin-bottom:7px}td span{font:10px/1.5 ui-monospace,monospace;color:#bfd0c8}.fail span{color:#f0b6a5}</style></head><body><h1>Topology audit heat map</h1><p>Nine adversarial scalar fields, identical sampled grids and identical audits. Red cells reproduce why the existing Surface Nets baseline is not accepted.</p><table><thead><tr><th>Fixture</th>${header}</tr></thead><tbody>${rows}</tbody></table></body></html>`;
}

function convergenceHtml(sweep) {
  const width = 1580; const height = 760; const left = 100; const top = 80; const plotW = 1380; const plotH = 560;
  const fixtureIds = [...new Set(sweep.fixtureRecords.map((entry) => entry.fixture))];
  const colors = ['#76d6a2','#ecb66f','#7fb9ff','#dc83c9','#ef796d','#b2d470','#ad93ef','#62d0d5','#d7cc7c'];
  const recordsByFixture = fixtureIds.map((fixture) => sweep.fixtureRecords.filter((entry) => entry.fixture === fixture).sort((a,b)=>a.resolution-b.resolution));
  const values = recordsByFixture.flatMap((records) => {
    const baseline = records[0].hausdorff.maximum || 1;
    return records.map((entry) => entry.hausdorff.maximum / baseline);
  });
  const yMax = Math.max(1, ...values); const yMin = Math.max(0.02, Math.min(...values) * .8);
  const x = (resolution) => left + (resolution - 16) / 24 * plotW;
  const y = (value) => top + (Math.log(yMax)-Math.log(value))/(Math.log(yMax)-Math.log(yMin))*plotH;
  const grid = [1,.75,.5,.25,.1,.05].filter(v=>v>=yMin&&v<=yMax).map(v=>`<line x1="${left}" y1="${y(v)}" x2="${left+plotW}" y2="${y(v)}" stroke="#33413e"/><text x="${left-15}" y="${y(v)+4}" fill="#aebbb6" text-anchor="end" font-size="12">${v}</text>`).join('');
  const lines = recordsByFixture.map((records,index)=>{const baseline=records[0].hausdorff.maximum||1;const points=records.map(r=>`${x(r.resolution)},${y(r.hausdorff.maximum/baseline)}`).join(' ');return `<polyline points="${points}" fill="none" stroke="${colors[index]}" stroke-width="4"/>${records.map(r=>`<circle cx="${x(r.resolution)}" cy="${y(r.hausdorff.maximum/baseline)}" r="5" fill="${colors[index]}"/>`).join('')}`}).join('');
  const legend=fixtureIds.map((name,index)=>`<span><i style="background:${colors[index]}"></i>${escapeHtml(name)}</span>`).join('');
  return `<!doctype html><html><head><style>*{box-sizing:border-box}body{margin:0;padding:34px;background:#141a1b;color:#eef4ef;font-family:Inter,system-ui,sans-serif}h1{margin:0 0 7px;font-size:29px}p{margin:0 0 12px;color:#aab8b2}.legend{display:flex;flex-wrap:wrap;gap:8px 18px;margin:0 0 8px}.legend span{font-size:11px;color:#c4d0cb}.legend i{display:inline-block;width:16px;height:3px;margin:0 7px 3px 0}svg{width:100%;background:#18201f;border:1px solid #35433f;border-radius:12px}</style></head><body><h1>Resolution convergence · selected MDC mesher</h1><p>Symmetric sampled Hausdorff error in world units, normalized to each fixture’s resolution-16 error. Lower is better; topology failures are zero at every point.</p><div class="legend">${legend}</div><svg viewBox="0 0 ${width} ${height}">${grid}${[16,24,32,40].map(r=>`<line x1="${x(r)}" y1="${top}" x2="${x(r)}" y2="${top+plotH}" stroke="#2c3936"/><text x="${x(r)}" y="${top+plotH+34}" fill="#b9c6c0" text-anchor="middle" font-size="14">${r}</text>`).join('')}${lines}<text x="${left+plotW/2}" y="${height-35}" fill="#d4ded9" text-anchor="middle" font-size="14">longest-axis grid resolution</text><text x="25" y="${top+plotH/2}" fill="#d4ded9" text-anchor="middle" font-size="14" transform="rotate(-90 25 ${top+plotH/2})">relative Hausdorff error (log scale)</text></svg></body></html>`;
}

function performanceHtml(threeWay, automated, environment) {
  const maximumTime = Math.max(...Object.values(threeWay.summary).map((entry) => entry.extractionMilliseconds));
  const rows = candidates.map((candidate) => {
    const entry = threeWay.summary[candidate.id];
    const width = entry.extractionMilliseconds / maximumTime * 100;
    return `<tr><th>${escapeHtml(candidate.label)}</th><td><div class="bar"><i style="width:${width}%"></i></div></td><td>${entry.extractionMilliseconds.toFixed(1)} ms</td><td>${(entry.extractionMilliseconds/entry.fixtures).toFixed(1)} ms</td><td>${entry.totalVertices.toLocaleString()}</td><td>${entry.totalTriangles.toLocaleString()}</td><td class="${entry.topologyFailures?'bad':'good'}">${entry.topologyFailures}</td></tr>`;
  }).join('');
  return `<!doctype html><html><head><style>*{box-sizing:border-box}body{margin:0;padding:38px;background:#141a1b;color:#eef4ef;font-family:Inter,system-ui,sans-serif}h1{margin:0 0 8px;font-size:30px}p{margin:0 0 26px;color:#aab8b2}table{width:100%;border-collapse:collapse;background:#1a2221;border:1px solid #35433f;border-radius:12px;overflow:hidden}th,td{padding:16px 14px;border-bottom:1px solid #303d39;text-align:right;font-size:13px}th:first-child{text-align:left}.bar{width:100%;min-width:260px;height:13px;background:#26322f;border-radius:8px;overflow:hidden}.bar i{display:block;height:100%;background:linear-gradient(90deg,#62c58d,#8ddbb0)}.good{color:#7ee3aa;font-weight:800}.bad{color:#ff9b80;font-weight:800}.facts{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-top:20px}.fact{padding:18px;background:#1a2221;border:1px solid #35433f;border-radius:10px}.fact b{display:block;font-size:22px}.fact span{font-size:11px;color:#9fb0a8}</style></head><body><h1>Mesher timing, volume, and gate summary</h1><p>Nine adversarial fields on ${escapeHtml(environment.cpus[0])}; extraction only. Audit time is intentionally excluded from the candidate timing bars.</p><table><thead><tr><th>Candidate</th><th>Relative extraction time</th><th>Total</th><th>Mean/fixture</th><th>Vertices</th><th>Triangles</th><th>Topology failures</th></tr></thead><tbody>${rows}</tbody></table><div class="facts"><div class="fact"><b>${automated.matrix.meshes}</b><span>family/seed meshes</span></div><div class="fact"><b>${automated.matrix.topologyFailures}</b><span>matrix topology failures</span></div><div class="fact"><b>${(automated.matrix.sliverFraction*100).toFixed(4)}%</b><span>triangles below 0.5°</span></div><div class="fact"><b>${environment.maxRssRaw.toLocaleString()}</b><span>process maxRSS raw (${escapeHtml(environment.platform)})</span></div></div></body></html>`;
}

async function main() {
  await mkdir(capturesDirectory, { recursive: true });
  const threeWay = JSON.parse(await readFile(path.join(evidenceDirectory, 'three-way-metrics.json'), 'utf8'));
  const sweep = JSON.parse(await readFile(path.join(evidenceDirectory, 'resolution-sweep.json'), 'utf8'));
  const automated = JSON.parse(await readFile(path.join(evidenceDirectory, 'automated-results.json'), 'utf8'));
  const environment = JSON.parse(await readFile(path.join(evidenceDirectory, 'environment.json'), 'utf8'));
  if (!automated.allPassed) throw new Error('Refusing to capture a failed C3 evidence set.');
  const fixtures = [...new Set(threeWay.records.map((entry) => entry.fixture))];
  const objectTexts = new Map();
  for (const fixture of fixtures) for (const candidate of candidates) {
    const key = `${fixture}--${candidate.id}`;
    objectTexts.set(key, await readFile(path.join(meshesDirectory, `${key}.obj`), 'utf8'));
  }
  const fixtureBounds = new Map(fixtures.map((fixture) => [fixture, combinedBounds(candidates.map((candidate) => objectTexts.get(`${fixture}--${candidate.id}`)))]));
  const { port, server } = await startModuleServer();
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 720 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.stack ?? error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
  try {
    await page.waitForFunction(() => typeof window.renderRock === 'function', { timeout: 30_000 });
  } catch (error) {
    const debug = await page.evaluate(() => ({
      bodyText: document.body.innerText,
      resources: performance.getEntriesByType('resource').map((entry) => entry.name),
      scripts: [...document.scripts].map((script) => ({ src: script.src, type: script.type })),
    }));
    throw new Error(`${error.message}\n${errors.join('\n')}\n${JSON.stringify(debug, null, 2)}`);
  }

  const threeWayCards = [];
  const multiviewCards = [];
  for (const fixture of fixtures) {
    for (const candidate of candidates) {
      const record = threeWay.records.find((entry) => entry.fixture === fixture && entry.candidate === candidate.id);
      const file = `${fixture}--${candidate.id}--hero.png`;
      await page.evaluate((payload) => window.renderRock(payload), {
        bounds: fixtureBounds.get(fixture),
        candidate: candidate.label,
        fixture,
        metrics: `${record.topology.vertices} vertices · ${record.topology.triangles} triangles\nHausdorff ${record.hausdorff.normalizedMaximum.toFixed(3)} cells`,
        obj: objectTexts.get(`${fixture}--${candidate.id}`),
        status: record.topology.topologyFailures,
        view: 'hero',
      });
      const buffer = await page.screenshot({ path: path.join(capturesDirectory, file) });
      threeWayCards.push({
        caption: `${record.topology.topologyFailures} failures · H ${record.hausdorff.normalizedMaximum.toFixed(3)} cells`,
        dataUrl: imageDataUrl(buffer),
        failed: record.topology.topologyFailures > 0,
        heading: `${fixture} · ${candidate.label}`,
      });
    }
    const selectedRecord = threeWay.records.find((entry) => entry.fixture === fixture && entry.candidate === selectedCandidate);
    for (const view of ['front', 'side', 'top']) {
      const file = `${fixture}--${selectedCandidate}--${view}.png`;
      await page.evaluate((payload) => window.renderRock(payload), {
        bounds: fixtureBounds.get(fixture),
        candidate: 'Selected ToonLab MDC',
        fixture,
        metrics: `${selectedRecord.topology.vertices} vertices · ${selectedRecord.topology.triangles} triangles`,
        obj: objectTexts.get(`${fixture}--${selectedCandidate}`),
        status: selectedRecord.topology.topologyFailures,
        view,
      });
      const buffer = await page.screenshot({ path: path.join(capturesDirectory, file) });
      multiviewCards.push({
        caption: `${view} · topology clean`,
        dataUrl: imageDataUrl(buffer),
        failed: false,
        heading: fixture,
      });
    }
  }
  await screenshotCards(page, threeWayCards, {
    description: 'Identical scalar grid, union bounds, orthographic camera, neutral clay, lighting, and audit. Red panels reproduce rejected baseline defects.',
    file: 'adversarial-three-way-contact-sheet.png',
    title: 'Checkpoint 3 · three-way adversarial mesher bake-off',
  });
  await screenshotCards(page, multiviewCards, {
    description: 'Front, side, and top orthographic views of the selected ToonLab Manifold Dual Contouring candidate. The source indexed mesh—not crease-split render vertices—is the topology authority.',
    file: 'selected-mesher-multiview-contact-sheet.png',
    title: 'Selected mesher · geometry visibility review',
  });
  await screenshotDashboard(page, topologyHeatmapHtml(threeWay), 'topology-heatmap.png');
  await screenshotDashboard(page, convergenceHtml(sweep), 'resolution-convergence.png');
  await screenshotDashboard(page, performanceHtml(threeWay, automated, environment), 'timing-memory-summary.png');
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  if (errors.length > 0) throw new Error(`Capture browser errors:\n${errors.join('\n')}`);
  const important = [
    'adversarial-three-way-contact-sheet.png',
    'selected-mesher-multiview-contact-sheet.png',
    'topology-heatmap.png',
    'resolution-convergence.png',
    'timing-memory-summary.png',
  ];
  const manifest = { files: [], ok: true };
  for (const file of important) {
    const info = await stat(path.join(capturesDirectory, file));
    manifest.files.push({ bytes: info.size, file });
    if (info.size < 20_000) manifest.ok = false;
  }
  await writeFile(path.join(capturesDirectory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  if (!manifest.ok) throw new Error('One or more C3 visual artifacts are suspiciously small.');
  console.log(`C3 visual evidence written to ${capturesDirectory}`);
}

await main();
