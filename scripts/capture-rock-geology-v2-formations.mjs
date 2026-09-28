#!/usr/bin/env node

import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const evidenceDirectory = path.resolve(process.argv[2] ?? 'artifacts/research/rock-geology-v2/checkpoint-09-formations');
const rockEvidenceRoot = path.resolve('artifacts/research/rock-geology-v2');
const capturesDirectory = path.join(evidenceDirectory, 'captures');
const threeModulePath = path.resolve('node_modules/three/build/three.module.js');
const threeCorePath = path.resolve('node_modules/three/build/three.core.js');
const objLoaderPath = path.resolve('node_modules/three/examples/jsm/loaders/OBJLoader.js');
const views = ['top-down', 'flyover', 'base-of-cliff', 'silhouette', 'gameplay'];

function imageDataUrl(bytes) {
  return `data:image/png;base64,${bytes.toString('base64')}`;
}

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function titleCase(value) {
  return value.split('-').map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`).join(' ');
}

async function startServer() {
  const [three, core, loader] = await Promise.all([readFile(threeModulePath), readFile(threeCorePath), readFile(objLoaderPath)]);
  const server = createServer((request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    if (request.url === '/') { response.setHeader('Content-Type', 'text/html'); response.end(renderShell(server.address().port)); }
    else if (request.url === '/three.module.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(three); }
    else if (request.url === '/three.core.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(core); }
    else if (request.url === '/OBJLoader.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(loader); }
    else { response.statusCode = 404; response.end('not found'); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return server;
}

function renderShell(port) {
  return String.raw`<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#111715}canvas{display:block}</style><script type="importmap">{"imports":{"three":"http://127.0.0.1:${port}/three.module.js"}}</script></head><body><script type="module">
import * as THREE from 'three'; import {OBJLoader} from 'http://127.0.0.1:${port}/OBJLoader.js';
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;document.body.append(renderer.domElement);const loader=new OBJLoader();
function clay(){const m=new THREE.MeshStandardMaterial({color:0xa29a89,roughness:.91,metalness:0});m.onBeforeCompile=s=>{s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vWorldRock;').replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvWorldRock=(modelMatrix*vec4(transformed,1.0)).xyz;');s.fragmentShader=s.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vWorldRock;').replace('#include <color_fragment>','#include <color_fragment>\nfloat broad=.5+.5*sin(vWorldRock.y*.045+vWorldRock.x*.013);float fine=.5+.5*sin(vWorldRock.x*.17+vWorldRock.z*.11);diffuseColor.rgb*=mix(.83,1.08,broad*.72+fine*.28);');};return m;}
window.renderFormation=({obj,view})=>{const scene=new THREE.Scene();scene.background=new THREE.Color(0x16201d);const object=loader.parse(obj);const box=new THREE.Box3().setFromObject(object);const center=box.getCenter(new THREE.Vector3());const size=box.getSize(new THREE.Vector3());const radius=Math.max(size.x,size.y,size.z)*.58;object.traverse(c=>{if(c.isMesh){c.material=clay();c.castShadow=true;c.receiveShadow=true;}});scene.add(object);const aspect=innerWidth/innerHeight;const extent=radius*(view==='top-down'?.86:view==='base-of-cliff'?.67:.78);const camera=new THREE.OrthographicCamera(-extent*aspect,extent*aspect,extent,-extent,radius*.015,radius*20);const dirs={'top-down':[.25,4.6,.18],'flyover':[1.55,.93,1.75],'base-of-cliff':[.24,.12,1.18],'silhouette':[-1.75,.42,.58],'gameplay':[1.08,.28,1.45]};const d=new THREE.Vector3(...dirs[view]).normalize();camera.position.copy(center).addScaledVector(d,radius*5.2);camera.up.set(0,1,0);if(view==='top-down')camera.up.set(0,0,-1);camera.lookAt(center);scene.add(new THREE.HemisphereLight(0xdbe9e2,0x2a2722,1.48));const key=new THREE.DirectionalLight(0xffe0bd,4.8);key.position.copy(center).add(new THREE.Vector3(radius*1.8,radius*3.7,radius*2.4));key.castShadow=true;key.shadow.mapSize.set(2048,2048);const shadowExtent=radius*1.5;key.shadow.camera.left=-shadowExtent;key.shadow.camera.right=shadowExtent;key.shadow.camera.top=shadowExtent;key.shadow.camera.bottom=-shadowExtent;scene.add(key);const rim=new THREE.DirectionalLight(0x7ca9c4,1.4);rim.position.copy(center).add(new THREE.Vector3(-radius*2.7,radius*1.1,-radius*2.1));scene.add(rim);const ground=new THREE.Mesh(new THREE.PlaneGeometry(radius*8,radius*8),new THREE.MeshStandardMaterial({color:0x29332d,roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.set(center.x,box.min.y+size.y*.1,center.z);ground.receiveShadow=true;scene.add(ground);renderer.render(scene,camera);return {bounds:{min:box.min.toArray(),max:box.max.toArray()},dataUrl:renderer.domElement.toDataURL('image/png')};};
</script></body></html>`;
}

async function screenshotHtml(page, html, filename, dimensions = { width: 2400, height: 2100 }) {
  await page.setViewportSize(dimensions);
  await page.setContent(html, { waitUntil: 'load' });
  await page.screenshot({ path: path.join(capturesDirectory, filename), fullPage: true });
}

await mkdir(capturesDirectory, { recursive: true });
const index = JSON.parse(await readFile(path.join(evidenceDirectory, 'output-index.json'), 'utf8'));
const server = await startServer();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const rendered = [];
  for (const record of index) {
    const obj = await readFile(path.join(evidenceDirectory, record.meshFile), 'utf8');
    const files = {};
    for (const view of views) {
      await page.setViewportSize({ width: 960, height: 540 });
      const capture = await page.evaluate(({ objText, viewId }) => window.renderFormation({ obj: objText, view: viewId }), { objText: obj, viewId: view });
      const bytes = Buffer.from(capture.dataUrl.split(',')[1], 'base64');
      const filename = `${record.fixtureId}--${view}.png`;
      await writeFile(path.join(capturesDirectory, filename), bytes);
      files[view] = filename;
    }
    rendered.push({ ...record, files });
  }

  const rows = [];
  for (const record of rendered) {
    const reference = imageDataUrl(await readFile(path.join(rockEvidenceRoot, record.referencePackage, 'six-view.png')));
    const panels = [`<figure class="reference"><img src="${reference}"><figcaption>NATURE-BOUND SIX-VIEW REFERENCE</figcaption></figure>`];
    for (const view of views) panels.push(`<figure><img src="${imageDataUrl(await readFile(path.join(capturesDirectory, record.files[view])))}"><figcaption>${escapeHtml(view.toUpperCase())}</figcaption></figure>`);
    rows.push(`<article><header><b>${escapeHtml(titleCase(record.fixtureId))}</b><span>${record.moduleCount} modules · ${record.topology.triangles.toLocaleString()} tris · ${record.seamCount} seams · Δ0m</span></header><div>${panels.join('')}</div></article>`);
  }
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:24px;background:#101614;color:#eef4f0;font-family:Inter,system-ui,sans-serif}h1{font-size:25px;margin:0 0 6px}p{margin:0 0 20px;color:#9fb0a8;font-size:12px}main{display:grid;gap:12px}article{border:1px solid #394740;border-radius:10px;overflow:hidden;background:#18201d}header{padding:8px 11px;display:flex;justify-content:space-between;align-items:center}header b{font-size:12px}header span{font:9px ui-monospace,monospace;color:#aab9b2}article>div{display:grid;grid-template-columns:repeat(6,1fr);gap:1px;background:#3a4741}figure{margin:0;background:#121817}img{display:block;width:100%;aspect-ratio:16/9;object-fit:cover}.reference img{object-fit:contain;background:#e4e1d9}figcaption{padding:5px 7px;font:8px ui-monospace,monospace;color:#afbeb7}</style></head><body><h1>C9 continuous formations · nature reference plus five review views</h1><p>Neutral audit meshes from one parent field. Visual approval is fail-closed; these are checkpoint evidence, not Megascans-quality production assets.</p><main>${rows.join('')}</main></body></html>`;
  await screenshotHtml(page, html, 'formation-review-board.png');
  await writeFile(path.join(capturesDirectory, 'capture-index.json'), `${JSON.stringify({ browserErrors: errors, passed: errors.length === 0, records: rendered, views }, null, 2)}\n`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

console.log(JSON.stringify({ capturesDirectory, errors: errors.length, formations: index.length, views: views.length }, null, 2));
if (errors.length > 0) process.exitCode = 1;
