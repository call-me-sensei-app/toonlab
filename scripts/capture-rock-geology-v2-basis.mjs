#!/usr/bin/env node

import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const evidenceDirectory = path.resolve(process.argv[2] ?? 'artifacts/research/rock-geology-v2/checkpoint-08-basis-families');
const bakeDirectory = path.resolve(process.argv[3] ?? path.join(evidenceDirectory, 'bakes'));
const capturesDirectory = path.join(evidenceDirectory, 'captures');
const threeModulePath = path.resolve('node_modules/three/build/three.module.js');
const threeCorePath = path.resolve('node_modules/three/build/three.core.js');
const objLoaderPath = path.resolve('node_modules/three/examples/jsm/loaders/OBJLoader.js');

const FAMILY_PALETTES = Object.freeze({
  'jointed-exfoliating-granite': ['#45433f', '#938b82', '#c8bdb0'],
  'cross-bedded-sandstone': ['#382319', '#9b6741', '#d4a16d'],
  'columnar-entablature-basalt': ['#11171a', '#343c3e', '#706a5e'],
  'bedded-karst-limestone': ['#46483e', '#9a9985', '#d4cfb5'],
  'fissile-shale-slate': ['#151a1d', '#3b4448', '#777872'],
  'folded-foliated-metamorphic': ['#1d1b1b', '#6d625b', '#c1b7a6'],
  'coarse-clastic-conglomerate-breccia': ['#332820', '#806d5c', '#b9a083'],
  'transported-river-talus': ['#292a28', '#77746d', '#b3ada2'],
});

const BASELINE_LITHOLOGY = Object.freeze({
  'granite-boulder': 'granite', 'granite-tor': 'granite',
  'sandstone-cliff': 'quartz-arenite', 'sandstone-arch': 'quartz-arenite',
  'basalt-colonnade': 'basalt', 'basalt-entablature': 'basalt',
  'limestone-spire': 'micritic-limestone', 'limestone-cave': 'micritic-limestone',
  'shale-slope': 'shale', 'slate-outcrop': 'slate',
  'gneiss-outcrop': 'gneiss', 'schist-outcrop': 'mica-schist',
  'conglomerate-outcrop': 'conglomerate', 'volcanic-breccia-outcrop': 'volcanic-breccia',
  'river-boulder': 'granodiorite', 'talus-assembly': 'quartzite',
});

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function titleCase(value) {
  return value.split('-').map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`).join(' ');
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

function morphologyBasis(recipe) {
  const radians = recipe.geologyTransform.strikeDegrees * Math.PI / 180;
  return {
    acrossStrike: [Math.cos(radians), 0, -Math.sin(radians)],
    strike: [Math.sin(radians), 0, Math.cos(radians)],
  };
}

function imageDataUrl(bytes) {
  return `data:image/png;base64,${bytes.toString('base64')}`;
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
  return String.raw`<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#111716}canvas{display:block}</style><script type="importmap">{"imports":{"three":"http://127.0.0.1:${port}/three.module.js"}}</script></head><body><script type="module">
    import * as THREE from 'three'; import {OBJLoader} from 'http://127.0.0.1:${port}/OBJLoader.js';
    const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true}); renderer.setSize(innerWidth,innerHeight); renderer.setPixelRatio(1); renderer.outputColorSpace=THREE.SRGBColorSpace; renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.05; renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap; document.body.append(renderer.domElement); const loader=new OBJLoader(); const textureLoader=new THREE.TextureLoader();
    function loadTexture(url,color=false){return new Promise((resolve,reject)=>textureLoader.load(url,texture=>{texture.colorSpace=color?THREE.SRGBColorSpace:THREE.NoColorSpace;texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=true;resolve(texture)},undefined,reject));}
    async function bakedMaterial(textures){const [base,normal,orm]=await Promise.all([loadTexture(textures.baseColor,true),loadTexture(textures.normal),loadTexture(textures.ormHeight)]);return new THREE.MeshStandardMaterial({map:base,normalMap:normal,normalScale:new THREE.Vector2(.82,.82),aoMap:orm,aoMapIntensity:.72,roughnessMap:orm,roughness:.9,metalness:0});}
    function detailedMaterial(palette,scale){const material=new THREE.MeshStandardMaterial({color:0xffffff,metalness:0,roughness:.82}); material.onBeforeCompile=shader=>{shader.uniforms.uRockScale={value:scale};shader.uniforms.uPalette0={value:new THREE.Color(palette[0])};shader.uniforms.uPalette1={value:new THREE.Color(palette[1])};shader.uniforms.uPalette2={value:new THREE.Color(palette[2])};shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vRockPosition;').replace('#include <begin_vertex>','#include <begin_vertex>\nvRockPosition=position;');shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vRockPosition; uniform float uRockScale; uniform vec3 uPalette0; uniform vec3 uPalette1; uniform vec3 uPalette2;\nfloat h31(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}\nfloat n3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),f.x),mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x),f.y),mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x),mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x),f.y),f.z);}\nfloat fbm(vec3 p){float v=0.,a=.55;for(int i=0;i<4;i++){v+=n3(p)*a;p=p*2.07+7.1;a*=.48;}return v;}'); shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\nfloat broad=fbm(vRockPosition/max(uRockScale,.001)*8.0);float grain=fbm(vRockPosition/max(uRockScale,.001)*38.0);float fleck=smoothstep(.72,.93,grain);vec3 rock=mix(uPalette0,uPalette1,smoothstep(.12,.78,broad));rock=mix(rock,uPalette2,fleck*.62);diffuseColor.rgb*=rock;');};return material;}
    window.renderRock=async({obj,basis,bounds,mode,palette,textures,view})=>{const scene=new THREE.Scene();scene.background=new THREE.Color(0x151b19);const aspect=innerWidth/innerHeight;const extent=bounds.radius*.8;const camera=new THREE.OrthographicCamera(-extent*aspect,extent*aspect,extent,-extent,bounds.radius*.01,bounds.radius*20);const dirs={threeQuarter:[1.48,.78,1.72],front:[.08,.2,1],top:[.8,3,.65]};const local=dirs[view];const d=new THREE.Vector3(local[0]*basis.strike[0]+local[2]*basis.acrossStrike[0],local[1],local[0]*basis.strike[2]+local[2]*basis.acrossStrike[2]).normalize();camera.position.fromArray(bounds.center).addScaledVector(d,bounds.radius*5);camera.up.set(0,1,0);if(view==='top')camera.up.set(0,0,-1);camera.lookAt(...bounds.center);scene.add(new THREE.HemisphereLight(0xe9f0ec,0x282622,1.55));const key=new THREE.DirectionalLight(0xffe7c7,4.6);key.position.fromArray(bounds.center).add(new THREE.Vector3(bounds.radius*2.8,bounds.radius*4.4,bounds.radius*3.4));key.castShadow=true;key.shadow.mapSize.set(2048,2048);scene.add(key);const fill=new THREE.DirectionalLight(0x86abc5,1.0);fill.position.fromArray(bounds.center).add(new THREE.Vector3(-bounds.radius*3,bounds.radius*1.4,-bounds.radius*2.5));scene.add(fill);const object=loader.parse(obj);const material=mode==='clay'?new THREE.MeshStandardMaterial({color:0xa39c8e,metalness:0,roughness:.93}):mode==='baked'?await bakedMaterial(textures):detailedMaterial(palette,bounds.radius);object.traverse(child=>{if(!child.isMesh)return;child.geometry.computeVertexNormals();if(child.geometry.attributes.uv&&!child.geometry.attributes.uv1)child.geometry.setAttribute('uv1',child.geometry.attributes.uv);child.material=material;child.castShadow=true;child.receiveShadow=true});scene.add(object);if(view!=='top'){const floor=new THREE.Mesh(new THREE.PlaneGeometry(bounds.radius*12,bounds.radius*12),new THREE.MeshStandardMaterial({color:0x202724,roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.set(bounds.center[0],bounds.min[1]-bounds.radius*.015,bounds.center[2]);floor.receiveShadow=true;scene.add(floor);}renderer.render(scene,camera);await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));};
  </script></body></html>`;
}

function pageShell(title, subtitle, body, styles = '') {
  return `<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:26px;background:#0f1514;color:#edf2ef;font-family:Inter,ui-sans-serif,system-ui,sans-serif}h1{margin:0;font-size:27px;letter-spacing:-.02em}.lead{margin:7px 0 20px;color:#aebbb5;font-size:12px}.foot{margin-top:15px;color:#71827a;font:10px ui-monospace,monospace}${styles}</style></head><body><h1>${escapeHtml(title)}</h1><p class="lead">${escapeHtml(subtitle)}</p>${body}<div class="foot">Checkpoint 8 · neutral geology only · no ToonLab stylization · bounded specimen proof before C9 formations</div></body></html>`;
}

async function screenshotHtml(page, html, filename, width = 2200) {
  await page.setViewportSize({ width, height: 1000 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForFunction(() => [...document.images].every((image) => image.complete && image.naturalWidth > 0));
  await page.screenshot({ fullPage: true, path: path.join(capturesDirectory, filename) });
}

async function renderObj(page, server, record, obj, basis, mode, view, textures = null) {
  const filename = `${record.familyId}--${record.variantId}--${record.heroRole}--${mode}--${view}.png`;
  await page.setViewportSize({ width: 680, height: 510 });
  await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.renderRock === 'function');
  await page.evaluate((payload) => window.renderRock(payload), {
    basis, bounds: boundsForObj(obj), mode, obj, palette: FAMILY_PALETTES[record.familyId], textures, view,
  });
  await page.screenshot({ path: path.join(capturesDirectory, filename) });
  return filename;
}

await mkdir(capturesDirectory, { recursive: true });
const [heroIndex, referenceIndex] = await Promise.all([
  readFile(path.join(evidenceDirectory, 'hero-output-index.json'), 'utf8').then(JSON.parse),
  readFile('src/rockgen/experimental/geology-v2/reference-index.v1.json', 'utf8').then(JSON.parse),
]);
const selected = heroIndex.filter((record) => ['median', 'challenging', 'worst-passing'].includes(record.heroRole));
const visualSelected = selected.filter((record) => ['median', 'challenging'].includes(record.heroRole));
const referenceByFamily = new Map(referenceIndex.basisCoverage.map((entry, index) => [
  Object.keys(FAMILY_PALETTES)[index], entry.referenceIds,
]));
const server = await startServer();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on('pageerror', (error) => console.error(`C8 capture page error: ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') console.error(`C8 capture console error: ${message.text()}`);
});

try {
  const rendered = [];
  for (const record of selected) {
    const assetId = `${record.familyId}--${record.variantId}`;
    let obj = await readFile(path.join(evidenceDirectory, record.file), 'utf8');
    let bakedTextures = null;
    if (record.heroRole !== 'worst-passing') try {
      obj = await readFile(path.join(bakeDirectory, assetId, 'meshes', 'render-mesh-uv.obj'), 'utf8');
      bakedTextures = Object.fromEntries(await Promise.all(['baseColor', 'normal', 'ormHeight'].map(async (id) => [
        id,
        imageDataUrl(await readFile(path.join(bakeDirectory, assetId, 'textures', `${id}.png`))),
      ])));
    } catch {
      bakedTextures = null;
    }
    const program = await readFile(path.join(evidenceDirectory, 'programs', `${record.recipeId}.json`), 'utf8').then(JSON.parse);
    const basis = morphologyBasis(program.recipe);
    const modes = record.heroRole === 'worst-passing' ? ['clay', 'realistic'] : ['clay', bakedTextures ? 'baked' : 'realistic'];
    const views = record.heroRole === 'worst-passing' ? ['threeQuarter'] : ['threeQuarter', 'front', 'top'];
    const files = {};
    for (const mode of modes) for (const view of views) files[`${mode}-${view}`] = await renderObj(page, server, record, obj, basis, mode, view, bakedTextures);
    rendered.push({ ...record, afterMode: bakedTextures ? 'baked' : 'realistic', files });
  }

  const baselineCache = new Map();
  for (const record of visualSelected) {
    const lithology = BASELINE_LITHOLOGY[record.variantId];
    if (!baselineCache.has(lithology)) {
      const file = path.resolve(`artifacts/research/rock-geology-v2/checkpoint-06-processes/captures/family-${lithology}--after.png`);
      baselineCache.set(lithology, imageDataUrl(await readFile(file)));
    }
  }
  const renderDataUrl = async (filename) => imageDataUrl(await readFile(path.join(capturesDirectory, filename)));
  const cards = [];
  for (const record of rendered.filter((entry) => ['median', 'challenging'].includes(entry.heroRole))) {
    const references = referenceByFamily.get(record.familyId) ?? [];
    cards.push(`<article><header><b>${escapeHtml(titleCase(record.variantId))}</b><span>${escapeHtml(record.lithology)} · ${escapeHtml(record.heroRole)}</span></header><div class="trip"><figure><img src="${baselineCache.get(BASELINE_LITHOLOGY[record.variantId])}"><figcaption>BEFORE · generic C6 envelope</figcaption></figure><figure><img src="${await renderDataUrl(record.files['clay-threeQuarter'])}"><figcaption>C8 · geology clay</figcaption></figure><figure><img src="${await renderDataUrl(record.files[`${record.afterMode}-threeQuarter`])}"><figcaption>${record.afterMode === 'baked' ? 'C8 · actual C7 bake (preview resolution)' : 'C8 · fallback procedural preview'}</figcaption></figure></div><p>${escapeHtml(record.mechanism)}</p><code>${escapeHtml(references.join(' · '))}</code></article>`);
  }
  const comparisonStyle = '<style>main{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}article{overflow:hidden;border:1px solid #3a4843;border-radius:11px;background:#18201e}header{padding:10px 12px;display:flex;justify-content:space-between}header b{font-size:13px}header span,code{font:9px ui-monospace,monospace;color:#9fb0a8}.trip{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:#394641}figure{margin:0;background:#121817}img{display:block;width:100%;aspect-ratio:4/3;object-fit:cover}figcaption{padding:6px;color:#bdc9c3;font:8px ui-monospace,monospace}article p{margin:9px 12px 5px;color:#c7d1cc;font-size:10px}article code{display:block;margin:0 12px 11px}</style>';
  await screenshotHtml(page, pageShell('C8 basis families · before / clay / neutral preview · 1 of 2', 'Paired forms are separate bounded specimens. Baseline is the prior generic C6 family envelope; the middle panel is the approval-critical clay structure.', `<main>${cards.slice(0, 8).join('')}</main>`, comparisonStyle), 'comparison-1-of-2.png');
  await screenshotHtml(page, pageShell('C8 basis families · before / clay / neutral preview · 2 of 2', 'Surface color is a neutral procedural preview for review, never a substitute for clay recognizability or the C7 production bake gate.', `<main>${cards.slice(8).join('')}</main>`, comparisonStyle), 'comparison-2-of-2.png');

  const multiCards = [];
  for (const record of rendered.filter((entry) => ['median', 'challenging'].includes(entry.heroRole))) {
    const views = [];
    for (const view of ['threeQuarter', 'front', 'top']) {
      views.push(`<figure><img src="${await renderDataUrl(record.files[`clay-${view}`])}"><figcaption>${view}</figcaption></figure>`);
    }
    multiCards.push(`<article><header>${escapeHtml(titleCase(record.variantId))}</header><div>${views.join('')}</div></article>`);
  }
  await screenshotHtml(page, pageShell('Clay multi-view audit · all 16 basis forms', 'Three-quarter, front, and top views expose accidental stripes, unsupported openings, hidden generic envelopes, and repetition.', `<main>${multiCards.join('')}</main>`, '<style>main{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}article{border:1px solid #394741;border-radius:10px;overflow:hidden;background:#18201e}header{padding:8px 10px;font-size:12px;font-weight:700}article>div{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:#36433e}figure{margin:0;background:#121817}img{display:block;width:100%;aspect-ratio:4/3;object-fit:cover}figcaption{padding:5px 7px;font:8px ui-monospace,monospace;color:#acbbb4}</style>'), 'clay-multiview.png');

  const outlierCards = [];
  for (const record of rendered.filter((entry) => entry.heroRole === 'worst-passing')) {
    outlierCards.push(`<article><header><b>${escapeHtml(titleCase(record.familyId))}</b><span>${escapeHtml(record.variantId)}</span></header><div><figure><img src="${await renderDataUrl(record.files['clay-threeQuarter'])}"><figcaption>CLAY</figcaption></figure><figure><img src="${await renderDataUrl(record.files['realistic-threeQuarter'])}"><figcaption>NEUTRAL PREVIEW</figcaption></figure></div><p>Predeclared hero role: worst-passing. Not selected after viewing.</p></article>`);
  }
  await screenshotHtml(page, pageShell('C8 outlier board · predeclared worst-passing hero seeds', 'Every family is represented. A visually weak but technically passing seed remains visible; it is not replaced by a prettier seed.', `<main>${outlierCards.join('')}</main>`, '<style>main{display:grid;grid-template-columns:repeat(2,1fr);gap:13px}article{border:1px solid #3a4843;border-radius:11px;overflow:hidden;background:#18201e}header{padding:9px 11px;display:flex;justify-content:space-between}header b{font-size:12px}header span{font:9px ui-monospace,monospace;color:#a8b7b0}article>div{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:#394641}figure{margin:0}img{display:block;width:100%;aspect-ratio:4/3;object-fit:cover}figcaption{padding:6px;font:8px ui-monospace,monospace}p{margin:8px 11px 10px;color:#9fb0a8;font-size:9px}</style>'), 'outliers.png');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

console.log(`C8 captures written to ${capturesDirectory}`);
