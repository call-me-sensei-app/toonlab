#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const ROOT = path.resolve(
  'artifacts/research/rock-geology-v2/checkpoint-08-basis-families/reference-profile-cliff-bake-pilot',
);
const CAPTURES = path.join(ROOT, 'captures');
const EXPECTED_FIELD = 'sha256:c01447205e96f783561cc4a2685e846b40cccd553c5df5550dabfe39d788e07d';
const decisionArgument = process.argv.find((argument) => argument.startsWith('--decision='))?.split('=')[1] ?? 'pending';
if (!['pending', 'improves', 'does-not-improve'].includes(decisionArgument)) {
  throw new RangeError('--decision must be pending, improves, or does-not-improve.');
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function dataUrl(bytes) {
  return `data:image/png;base64,${bytes.toString('base64')}`;
}

function parsePositions(obj) {
  return obj.split('\n').filter((line) => line.startsWith('v ')).map((line) => line.slice(2).trim().split(/\s+/).map(Number));
}

function objBounds(obj) {
  const points = parsePositions(obj);
  const minimum = [0, 1, 2].map((axis) => Math.min(...points.map((point) => point[axis])));
  const maximum = [0, 1, 2].map((axis) => Math.max(...points.map((point) => point[axis])));
  const center = minimum.map((value, axis) => (value + maximum[axis]) * 0.5);
  const radius = Math.max(Math.hypot(...maximum.map((value, axis) => value - minimum[axis])) * 0.5, 1e-6);
  return { center, maximum, minimum, radius };
}

async function startServer() {
  const [three, core, loader] = await Promise.all([
    readFile(path.resolve('node_modules/three/build/three.module.js')),
    readFile(path.resolve('node_modules/three/build/three.core.js')),
    readFile(path.resolve('node_modules/three/examples/jsm/loaders/OBJLoader.js')),
  ]);
  const server = createServer((request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    if (request.url === '/') {
      response.setHeader('Content-Type', 'text/html');
      response.end(renderShell(server.address().port));
    } else if (request.url === '/three.module.js') {
      response.setHeader('Content-Type', 'text/javascript');
      response.end(three);
    } else if (request.url === '/three.core.js') {
      response.setHeader('Content-Type', 'text/javascript');
      response.end(core);
    } else if (request.url === '/OBJLoader.js') {
      response.setHeader('Content-Type', 'text/javascript');
      response.end(loader);
    } else {
      response.statusCode = 404;
      response.end('not found');
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server;
}

function renderShell(port) {
  return String.raw`<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#151917}canvas{display:block}</style><script type="importmap">{"imports":{"three":"http://127.0.0.1:${port}/three.module.js"}}</script></head><body><script type="module">
import * as THREE from 'three'; import {OBJLoader} from 'http://127.0.0.1:${port}/OBJLoader.js';
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true}); renderer.setSize(innerWidth,innerHeight); renderer.setPixelRatio(1); renderer.outputColorSpace=THREE.SRGBColorSpace; renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.08; renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap; document.body.append(renderer.domElement);
const loader=new OBJLoader(), textureLoader=new THREE.TextureLoader();
function texture(url,color=false){return new Promise((resolve,reject)=>textureLoader.load(url,t=>{t.colorSpace=color?THREE.SRGBColorSpace:THREE.NoColorSpace;t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping;t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;t.generateMipmaps=true;resolve(t)},undefined,reject));}
async function pbr(textures){const [base,normal,orm]=await Promise.all([texture(textures.baseColor,true),texture(textures.normal),texture(textures.orm)]);return new THREE.MeshStandardMaterial({map:base,normalMap:normal,normalScale:new THREE.Vector2(1,1),aoMap:orm,aoMapIntensity:.85,roughnessMap:orm,roughness:1,metalness:0});}
function worldDirection(local,basis){return new THREE.Vector3(local[0]*basis.strike[0]+local[2]*basis.acrossStrike[0],local[1],local[0]*basis.strike[2]+local[2]*basis.acrossStrike[2]).normalize();}
window.renderRock=async payload=>{const {basis,bounds,mode,obj,textures,view}=payload;const scene=new THREE.Scene();scene.background=new THREE.Color(0x171c19);const views={front:{d:[0,.08,1]},rear:{d:[0,.08,-1]},left:{d:[-1,.08,0]},right:{d:[1,.08,0]},top:{d:[0,1,.025]},bottom:{d:[0,-1,.025]},threeQuarter:{d:[1.25,.67,1.55]},benchCloseup:{d:[.18,.13,1],offset:[-.35,-.72,0],zoom:.48}};const spec=views[view];const aspect=innerWidth/innerHeight;const extent=bounds.radius*.74*(spec.zoom??1);const camera=new THREE.OrthographicCamera(-extent*aspect,extent*aspect,extent,-extent,bounds.radius*.01,bounds.radius*20);const target=new THREE.Vector3(...bounds.center);if(spec.offset){target.x+=spec.offset[0]*basis.strike[0]+spec.offset[2]*basis.acrossStrike[0];target.y+=spec.offset[1];target.z+=spec.offset[0]*basis.strike[2]+spec.offset[2]*basis.acrossStrike[2];}const direction=worldDirection(spec.d,basis);camera.position.copy(target).addScaledVector(direction,bounds.radius*5);if(view==='top')camera.up.copy(worldDirection([0,0,-1],basis));else if(view==='bottom')camera.up.copy(worldDirection([0,0,1],basis));else camera.up.set(0,1,0);camera.lookAt(target);scene.add(new THREE.HemisphereLight(0xe8eee9,0x292821,1.35));const key=new THREE.DirectionalLight(0xffe5c4,4.25);key.position.copy(target).add(worldDirection([-1.2,2.6,2.2],basis).multiplyScalar(bounds.radius*3.4));key.castShadow=true;key.shadow.mapSize.set(2048,2048);key.shadow.camera.left=key.shadow.camera.bottom=-bounds.radius*2;key.shadow.camera.right=key.shadow.camera.top=bounds.radius*2;scene.add(key);const fill=new THREE.DirectionalLight(0x86aec9,1.05);fill.position.copy(target).add(worldDirection([2,1,-2],basis).multiplyScalar(bounds.radius*2.4));scene.add(fill);const object=loader.parse(obj);const material=mode==='clay'?new THREE.MeshStandardMaterial({color:0xa69e8f,metalness:0,roughness:.94}):await pbr(textures);object.traverse(child=>{if(!child.isMesh)return;child.geometry.computeVertexNormals();if(child.geometry.attributes.uv&&!child.geometry.attributes.uv1)child.geometry.setAttribute('uv1',child.geometry.attributes.uv);child.material=material;child.castShadow=true;child.receiveShadow=true;});scene.add(object);if(!['top','bottom','benchCloseup'].includes(view)){const floor=new THREE.Mesh(new THREE.PlaneGeometry(bounds.radius*12,bounds.radius*12),new THREE.MeshStandardMaterial({color:0x242a25,roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.set(bounds.center[0],bounds.minimum[1]-bounds.radius*.012,bounds.center[2]);floor.receiveShadow=true;scene.add(floor);}renderer.render(scene,camera);await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));};
</script></body></html>`;
}

async function captureHtml(page, html, filename, viewport) {
  await page.setViewportSize(viewport);
  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForFunction(() => [...document.images].every((image) => image.complete && image.naturalWidth > 0));
  await page.screenshot({ fullPage: true, path: filename });
}

async function fileRecord(file) {
  const bytes = await readFile(file);
  return {
    bytes: (await stat(file)).size,
    path: path.relative(ROOT, file).replaceAll(path.sep, '/'),
    sha256: sha256(bytes),
  };
}

const technicalReport = JSON.parse(await readFile(path.join(ROOT, 'technical-report.json'), 'utf8'));
if (technicalReport.field.expectedFieldContentId !== EXPECTED_FIELD || !technicalReport.gates.previewTechnicalPassed) {
  throw new Error('Capture refused: exact field or preview technical gate is not green.');
}
const obj = await readFile(path.join(ROOT, 'meshes/render-mesh-uv.obj'), 'utf8');
const textureIds = ['baseColor', 'normal', 'orm'];
const textureBytes = Object.fromEntries(await Promise.all(textureIds.map(async (id) => [
  id,
  await readFile(path.join(ROOT, `textures/${id}.png`)),
])));
const textures = Object.fromEntries(textureIds.map((id) => [id, dataUrl(textureBytes[id])]));
const strikeRadians = 32 * Math.PI / 180;
const basis = {
  acrossStrike: [Math.cos(strikeRadians), 0, -Math.sin(strikeRadians)],
  strike: [Math.sin(strikeRadians), 0, Math.cos(strikeRadians)],
};
const bounds = objBounds(obj);
const views = ['front', 'threeQuarter', 'top', 'rear', 'left', 'right', 'bottom', 'benchCloseup'];
await mkdir(CAPTURES, { recursive: true });
const server = await startServer();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on('pageerror', (error) => console.error(`capture page error: ${error.message}`));
const outputs = [];
try {
  for (const view of views) for (const mode of ['clay', 'baked']) {
    const filename = path.join(CAPTURES, `${view}--${mode}.png`);
    await page.setViewportSize({ height: 720, width: 900 });
    await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.renderRock === 'function');
    await page.evaluate((payload) => window.renderRock(payload), { basis, bounds, mode, obj, textures, view });
    await page.screenshot({ path: filename });
    outputs.push(filename);
  }

  const image = async (filename) => dataUrl(await readFile(filename));
  const primaryViews = ['front', 'threeQuarter', 'top'];
  const primaryRows = [];
  for (const view of primaryViews) primaryRows.push(`<section><h2>${escapeHtml(view)}</h2><div><figure><img src="${await image(path.join(CAPTURES, `${view}--clay.png`))}"><figcaption>UNBAKED · same UV render mesh · neutral clay</figcaption></figure><figure><img src="${await image(path.join(CAPTURES, `${view}--baked.png`))}"><figcaption>BAKED PBR · Base Color + NormalGL + AO/Roughness</figcaption></figure></div></section>`);
  const board = `<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:30px;background:#101512;color:#edf1ee;font-family:Inter,system-ui,sans-serif}h1{font-size:28px;margin:0}.lead{color:#aab7b0;font-size:12px;margin:7px 0 20px}.warn{border:1px solid #725f34;background:#272316;color:#ebd8a5;padding:10px 12px;border-radius:7px;font-size:11px;margin-bottom:18px}section{border:1px solid #33413a;border-radius:10px;overflow:hidden;margin:0 0 16px;background:#171e1a}h2{margin:0;padding:9px 12px;font-size:12px;text-transform:uppercase;letter-spacing:.08em}section>div{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:#36433c}figure{margin:0;background:#121714}img{width:100%;display:block}figcaption{padding:7px 9px;font:9px ui-monospace,monospace;color:#b7c2bc}.foot{font:10px ui-monospace,monospace;color:#7f9087}</style></head><body><h1>Sandstone cliff r5d · matched unbaked / baked pilot</h1><p class="lead">Exact field ${escapeHtml(EXPECTED_FIELD)} · bundle ${escapeHtml(technicalReport.bake.signature)}</p><div class="warn">2048² review preview only. The compiler requests 16384 / 16-tile UDIM or virtual texturing. The bake can add surface definition; it cannot repair the silhouette or authorize a Megascans-quality claim.</div>${primaryRows.join('')}<p class="foot">Fixed camera, same UV mesh, same lighting. Signed height is audited separately and is not used to displace these comparison renders.</p></body></html>`;
  const boardFile = path.join(CAPTURES, 'matched-unbaked-vs-baked-primary.png');
  await captureHtml(page, board, boardFile, { height: 900, width: 1900 });
  outputs.push(boardFile);

  const six = ['front', 'rear', 'left', 'right', 'top', 'bottom'];
  const cells = [];
  for (const view of six) for (const mode of ['clay', 'baked']) cells.push(`<figure><img src="${await image(path.join(CAPTURES, `${view}--${mode}.png`))}"><figcaption>${escapeHtml(view)} · ${mode === 'clay' ? 'UNBAKED CLAY' : 'BAKED PBR'}</figcaption></figure>`);
  const sixBoard = `<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:26px;background:#101512;color:#edf1ee;font-family:Inter,system-ui,sans-serif}h1{font-size:25px;margin:0}.lead{font-size:11px;color:#aeb9b3;margin:6px 0 17px}main{display:grid;grid-template-columns:repeat(4,1fr);gap:2px;background:#35423b;border:1px solid #35423b}figure{margin:0;background:#121714}img{display:block;width:100%}figcaption{padding:6px 8px;font:8px ui-monospace,monospace;color:#b4c0b9}.foot{font:9px ui-monospace,monospace;color:#77877f;margin-top:12px}</style></head><body><h1>Six-view silhouette and bake audit</h1><p class="lead">Paired images use identical mesh and camera; top/bottom are included to prevent front-only approval.</p><main>${cells.join('')}</main><p class="foot">Preview-only 2K atlas · no height displacement · no stylization · no loose talus added.</p></body></html>`;
  const sixBoardFile = path.join(CAPTURES, 'matched-six-view-board.png');
  await captureHtml(page, sixBoard, sixBoardFile, { height: 900, width: 2200 });
  outputs.push(sixBoardFile);

  const detailCells = [];
  for (const mode of ['clay', 'baked']) detailCells.push(`<figure><img src="${await image(path.join(CAPTURES, `benchCloseup--${mode}.png`))}"><figcaption>${mode === 'clay' ? 'UNBAKED CLAY' : 'BAKED PBR'} · bench / joint / recess crop</figcaption></figure>`);
  const detailBoard = `<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:25px;background:#101512;color:#edf1ee;font-family:Inter,system-ui,sans-serif}h1{font-size:24px;margin:0}.lead{font-size:11px;color:#aeb9b3;margin:6px 0 16px}main{display:grid;grid-template-columns:1fr 1fr;gap:2px;background:#35423b;border:1px solid #35423b}figure{margin:0;background:#121714}img{display:block;width:100%}figcaption{padding:7px 9px;font:9px ui-monospace,monospace;color:#b4c0b9}.foot{font:9px ui-monospace,monospace;color:#77877f;margin-top:11px}</style></head><body><h1>Definition crop · same mesh</h1><p class="lead">This crop is the visual-improvement test. A successful material pass should reveal bedding/mineral/cavity structure without changing the silhouette.</p><main>${detailCells.join('')}</main><p class="foot">NormalGL + lighting-free Base Color + independent AO/Roughness. Signed height remains an audited data channel, not render-time displacement here.</p></body></html>`;
  const detailBoardFile = path.join(CAPTURES, 'matched-definition-closeup.png');
  await captureHtml(page, detailBoard, detailBoardFile, { height: 850, width: 1800 });
  outputs.push(detailBoardFile);

  const channelCells = [];
  for (const id of ['baseColor', 'normal', 'orm', 'signedHeight', 'cavity', 'fabric', 'fracture', 'weathering']) {
    channelCells.push(`<figure><img src="${dataUrl(await readFile(path.join(ROOT, `textures/${id}.png`)))}"><figcaption>${escapeHtml(id)}</figcaption></figure>`);
  }
  const channelBoard = `<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:24px;background:#101512;color:#edf1ee;font-family:Inter,system-ui,sans-serif}h1{font-size:24px;margin:0}.lead{font-size:11px;color:#aeb9b3;margin:6px 0 16px}main{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}figure{margin:0;background:#171e1a;border:1px solid #34413a}img{display:block;width:100%;aspect-ratio:1;object-fit:contain;background:#0e1210}figcaption{padding:7px 9px;font:9px ui-monospace,monospace}</style></head><body><h1>Independent bake channels</h1><p class="lead">ORM is R=AO, G=Roughness, B=0 metallic. Signed height is a separate signed residual channel.</p><main>${channelCells.join('')}</main></body></html>`;
  const channelBoardFile = path.join(CAPTURES, 'bake-channel-board.png');
  await captureHtml(page, channelBoard, channelBoardFile, { height: 850, width: 1800 });
  outputs.push(channelBoardFile);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

const visualReport = {
  bakeLegitimatelyImprovesDefinition: decisionArgument === 'pending' ? null : decisionArgument === 'improves',
  comparisonContract: {
    heightDisplacementUsed: false,
    identicalCamera: true,
    identicalLighting: true,
    identicalUvMesh: true,
    pbrChannelsUsed: ['baseColor', 'normal', 'orm'],
  },
  fieldContentId: EXPECTED_FIELD,
  megascansParity: false,
  observedLimitations: [
    'Broad repetitive diagonal banding reads like wood or fabric rather than irregular sedimentary bedding.',
    'Bedding phase and direction continue implausibly across the front, top, and side faces instead of expressing bounded bed packages and face-specific intersections.',
    'Two prominent vertical marks read as drips or tool strokes instead of joint-controlled weathering.',
    'Base colour and roughness are too pale and uniform, while near-black cavities exaggerate contrast instead of reading as naturally exposed quartz arenite.',
    'Surface definition remains soft: close inspection exposes coarse preview facets and lacks grain, cement, edge wear, and multi-scale erosion.',
    'The bake does not and must not repair the slab-like macro silhouette; silhouette approval remains a separate C8 clay decision.',
  ],
  outcome: 'technical pass / visual fail',
  recommendedCorrection: {
    baseGeometry: 'Retain the current macro silhouette for this bake diagnosis. Change base geometry only if a dense-clay isolation proves the two narrow vertical joint recesses themselves are wrong; if so, replace Gaussian slot-like recesses with finite, bed-terminated, irregular joint faces.',
    denseDetailField: 'Primary fix. Replace the single global sinusoidal bedding mask with bounded, nonperiodic multiscale bed packages in geology space; vary thickness, phase, continuity, and cross-set extent, then add sandstone-specific granular/cement/edge-wear detail at smaller amplitudes.',
    materialSemantics: 'Reduce direct bedding-to-colour contrast, introduce lithology-bounded cement/mineral/oxidation variation, and keep roughness/cavity variation independent and geology-correlated.',
    renderer: 'No renderer or lighting correction is recommended; identical-camera clay/PBR comparison proves the defects originate in source fields and baked channels.',
  },
  sourceLevelDiagnosis: {
    bedding: 'basis/field.node.js surfaceSemantics uses one unbounded sine of warpedY + 0.31*x + 0.07*z, so phase is globally regular and carried across every exposed face.',
    detail: 'bake/detailField.node.js adds mostly isotropic broad/grain/pit noise and maps the sandstone bedding scalar strongly into base colour; it does not create a bounded hierarchy of bed packages.',
    verticalMarks: 'The dense-to-render normal transfer exposes two narrow finite joint recesses as smooth slot-like streaks. Confirm in dense clay before deciding whether their base field or only their meso breakup must change.',
  },
  visualApproval: false,
  visualProductionApproval: false,
  remainingDecision: decisionArgument === 'pending'
    ? 'manual visual inspection required'
    : 'manual pilot inspection recorded; correction is required and visual approval is withheld',
  userVisualApproval: false,
  visualDecision: decisionArgument,
};
const visualReportFile = path.join(ROOT, 'visual-report.json');
await writeFile(visualReportFile, `${JSON.stringify(visualReport, null, 2)}\n`);
outputs.push(visualReportFile);
const manifest = {
  files: await Promise.all(outputs.sort().map(fileRecord)),
  schema: 'toonlab/rock-geology-v2-cliff-bake-pilot-visual-files',
  version: 1,
};
await writeFile(path.join(ROOT, 'visual-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({
  decision: decisionArgument,
  files: manifest.files.length,
  primaryBoard: path.join(CAPTURES, 'matched-unbaked-vs-baked-primary.png'),
  sixViewBoard: path.join(CAPTURES, 'matched-six-view-board.png'),
}, null, 2));
