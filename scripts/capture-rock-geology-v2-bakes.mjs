#!/usr/bin/env node

import { createServer } from 'node:http';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const evidenceDirectory = path.resolve(process.argv[2] ?? 'artifacts/research/rock-geology-v2/checkpoint-07-bake-compiler');
const capturesDirectory = path.join(evidenceDirectory, 'captures');
const threeModulePath = path.resolve('node_modules/three/build/three.module.js');
const threeCorePath = path.resolve('node_modules/three/build/three.core.js');
const objLoaderPath = path.resolve('node_modules/three/examples/jsm/loaders/OBJLoader.js');

await mkdir(capturesDirectory, { recursive: true });

function shell(port) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#111615;color:#e9ece7;font-family:Inter,ui-sans-serif,system-ui,sans-serif}body{padding:24px}.title{font-size:30px;font-weight:760;letter-spacing:-.03em}.subtitle{color:#aab5ad;margin:5px 0 18px}.grid{display:grid;gap:16px}.two{grid-template-columns:repeat(2,1fr)}.three{grid-template-columns:repeat(3,1fr)}.panel{position:relative;overflow:hidden;border-radius:14px;border:1px solid #34403a;background:#1a211e;min-height:420px}.panel canvas{display:block;width:100%;height:100%}.label{position:absolute;z-index:2;left:14px;top:12px;padding:7px 10px;border-radius:7px;background:#101512d9;color:#fff;font-size:14px;font-weight:700}.note{position:absolute;z-index:2;left:14px;bottom:12px;padding:6px 9px;border-radius:6px;background:#101512c7;color:#bdc8c0;font-size:12px}.channels{display:grid;grid-template-columns:repeat(3,1fr);gap:15px}.channel{background:#181f1c;border:1px solid #34403a;border-radius:12px;padding:10px;min-width:0}.channel img{display:block;width:100%;aspect-ratio:1;object-fit:contain;background:#0c100e;border-radius:7px}.channel b{display:block;margin:8px 2px 0;font-size:13px}.footer{margin-top:15px;color:#89968e;font-size:12px}
  </style><script type="importmap">{"imports":{"three":"http://127.0.0.1:${port}/three.module.js"}}</script></head><body><div id="app"></div><script type="module">
    import * as THREE from 'three'; import {OBJLoader} from 'http://127.0.0.1:${port}/OBJLoader.js';
    const loader=new OBJLoader(); const textureLoader=new THREE.TextureLoader();
    const loadObj=url=>new Promise((resolve,reject)=>loader.load(url,resolve,undefined,reject));
    const loadTexture=(url,color=false)=>new Promise((resolve,reject)=>textureLoader.load(url,t=>{t.colorSpace=color?THREE.SRGBColorSpace:THREE.NoColorSpace;t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping;t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;t.generateMipmaps=true;resolve(t)},undefined,reject));
    function panel(label,note=''){const el=document.createElement('div');el.className='panel';el.innerHTML='<div class="label">'+label+'</div>'+(note?'<div class="note">'+note+'</div>':'');return el}
    async function rockPanel(config){const el=panel(config.label,config.note);const width=config.width??700,height=config.height??650;el.style.height=height+'px';const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true});renderer.setSize(width,height,false);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.06;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.domElement.style.width='100%';renderer.domElement.style.height='100%';el.append(renderer.domElement);
      const scene=new THREE.Scene();scene.background=new THREE.Color(config.background??0x202723);const object=await loadObj(config.obj);const box=new THREE.Box3().setFromObject(object);const center=box.getCenter(new THREE.Vector3());const size=box.getSize(new THREE.Vector3());const radius=Math.max(size.length()*.5,.01);const direction=new THREE.Vector3(...(config.direction??[1.6,.85,1.8])).normalize();const extent=radius*(config.extent??.72);const camera=new THREE.OrthographicCamera(-extent*width/height,extent*width/height,extent,-extent,radius*.01,radius*30);camera.position.copy(center).addScaledVector(direction,radius*5);camera.up.set(0,1,0);camera.lookAt(center.x+(config.targetOffset?.[0]??0),center.y+(config.targetOffset?.[1]??0),center.z+(config.targetOffset?.[2]??0));
      let material;if(config.textured){const suffix=config.mip?'-mip-'+String(config.mip).padStart(2,'0'):'';const prefix=config.mip?'/mips/':'/textures/';const [base,normal,orm]=await Promise.all([loadTexture(prefix+'baseColor'+suffix+'.png',true),loadTexture(prefix+'normal'+suffix+'.png'),loadTexture(prefix+'ormHeight'+suffix+'.png')]);material=new THREE.MeshStandardMaterial({map:base,normalMap:normal,aoMap:orm,roughnessMap:orm,normalScale:new THREE.Vector2(.82,.82),aoMapIntensity:.72,roughness:.9,metalness:0});}else material=new THREE.MeshStandardMaterial({color:config.color??0xaaa79f,roughness:.92,metalness:0});
      object.traverse(child=>{if(!child.isMesh)return;if(child.geometry.attributes.uv&&!child.geometry.attributes.uv1)child.geometry.setAttribute('uv1',child.geometry.attributes.uv);child.material=material;child.castShadow=true;child.receiveShadow=true});scene.add(object);scene.add(new THREE.HemisphereLight(0xdbe8e1,0x29251f,1.45));const key=new THREE.DirectionalLight(config.grazing?0xffd19c:0xffead0,config.grazing?5.4:4.1);key.position.copy(center).add(new THREE.Vector3(radius*(config.grazing?4.8:2.8),radius*(config.grazing?.45:4.5),radius*(config.grazing?.25:3.8)));key.castShadow=true;key.shadow.mapSize.set(2048,2048);key.shadow.camera.left=key.shadow.camera.bottom=-radius*2;key.shadow.camera.right=key.shadow.camera.top=radius*2;scene.add(key);const rim=new THREE.DirectionalLight(0x8bb5d2,1.25);rim.position.copy(center).add(new THREE.Vector3(-radius*3.4,radius*1.2,-radius*2.8));scene.add(rim);const floor=new THREE.Mesh(new THREE.PlaneGeometry(radius*10,radius*10),new THREE.MeshStandardMaterial({color:0x303631,roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.set(center.x,box.min.y-radius*.035,center.z);floor.receiveShadow=true;scene.add(floor);renderer.render(scene,camera);await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));return el}
    window.renderBoard=async kind=>{const app=document.querySelector('#app');app.innerHTML='';const title=document.createElement('div');title.className='title';const sub=document.createElement('div');sub.className='subtitle';app.append(title,sub);if(kind==='comparison'){title.textContent='C7 neutral realistic boulder — before / after';sub.textContent='Identical render mesh and lighting. Only the procedural high-to-low surface bake changes.';const grid=document.createElement('div');grid.className='grid two';app.append(grid);grid.append(await rockPanel({label:'Before — clay mesh',note:'12,820 triangles · no surface maps',obj:'/meshes/render-mesh-uv.obj'}),await rockPanel({label:'After — neutral realistic bake',note:'Base color + tangent normal + AO + roughness',obj:'/meshes/render-mesh-uv.obj',textured:true}));}
      else if(kind==='single-clay'||kind==='single-realistic'){const realistic=kind==='single-realistic';title.textContent=realistic?'C7 granodiorite boulder — realistic neutral':'C7 granodiorite boulder — v2 clay';sub.textContent=realistic?'Procedural 2048² high-to-low bake under the fixed review rig.':'Untextured render mesh under the fixed review rig.';const grid=document.createElement('div');grid.className='grid';app.append(grid);grid.append(await rockPanel({label:realistic?'Neutral realistic bake':'V2 clay geometry',note:realistic?'460.98 px/m · minimum view 0.66 m':'12,820 triangles · 12.14 mm dense-source error',obj:'/meshes/render-mesh-uv.obj',textured:realistic,height:760,width:1200,extent:.72}));}
      else if(kind==='stress'){title.textContent='C7 seam and mip stress views';sub.textContent='Close crop, grazing light, automatic minification, and explicit mip level 4.';const grid=document.createElement('div');grid.className='grid two';app.append(grid);grid.append(await rockPanel({label:'Close surface',note:'Near-view texture/normal inspection',obj:'/meshes/render-mesh-uv.obj',textured:true,extent:.45,targetOffset:[.14,.08,.05],direction:[1.2,.36,1.9]}),await rockPanel({label:'Grazing angle',note:'Glancing light exposes projection/seam faults',obj:'/meshes/render-mesh-uv.obj',textured:true,grazing:true,direction:[2.8,.18,.5]}),await rockPanel({label:'Minified full atlas',note:'Object reduced to exercise automatic mips',obj:'/meshes/render-mesh-uv.obj',textured:true,extent:1.9}),await rockPanel({label:'Explicit mip 4',note:'128² source pages magnified for seam audit',obj:'/meshes/render-mesh-uv.obj',textured:true,mip:4,extent:.72}));}
      else if(kind==='lod'){title.textContent='C7 derived geometry roles';sub.textContent='Dense source, render mesh, three fallbacks, and collision mesh under identical clay lighting.';const grid=document.createElement('div');grid.className='grid three';app.append(grid);for(const item of [{id:'dense-source',label:'Dense source',note:'19,500 tris'},{id:'render-mesh',label:'Render mesh',note:'12,820 tris'},{id:'fallback-1',label:'Fallback 1',note:'8,412 tris'},{id:'fallback-2',label:'Fallback 2',note:'5,460 tris'},{id:'fallback-3',label:'Fallback 3',note:'3,248 tris'},{id:'collision',label:'Collision',note:'1,868 tris'}])grid.append(await rockPanel({label:item.label,note:item.note,obj:'/meshes/'+item.id+'.obj',height:390,width:520,extent:.72,color:item.id==='collision'?0x9b8d70:0xa9a69e}));}
      else if(kind==='channels'){title.textContent='C7 channel and diagnostic sheet';sub.textContent='Base color is sRGB and lighting-free. Every other page is linear data.';const channels=document.createElement('div');channels.className='channels';app.append(channels);for(const item of [{id:'baseColor',label:'Base color — sRGB'},{id:'normal',label:'Tangent normal — linear +Y'},{id:'ormHeight',label:'AO / roughness / height'},{id:'cavityCurvature',label:'Cavity / curvature / height'},{id:'materialFabric',label:'Material / fabric / deposition'},{id:'fracture',label:'Fracture / cavity / curvature'},{id:'weathering',label:'Weathering / exposure / wetness'},{id:'uv-coverage',label:'UV coverage / packing'},{id:'cage-height-diagnostic',label:'Projection cage height'}]){const card=document.createElement('div');card.className='channel';card.innerHTML='<img src="/textures/'+item.id+'.png"><b>'+item.label+'</b>';channels.append(card)}const footer=document.createElement('div');footer.className='footer';footer.textContent='2048² · production-selected atlas · 100% high-source hits · zero projection conflicts · 36 dilation passes';app.append(footer);await Promise.all([...document.images].map(img=>img.decode()));}
      document.body.dataset.ready='true';};
  </script></body></html>`;
}

const three = await readFile(threeModulePath);
const core = await readFile(threeCorePath);
const loader = await readFile(objLoaderPath);
const server = createServer(async (request, response) => {
  try {
    if (request.url === '/') {
      response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(shell(server.address().port)); return;
    }
    if (request.url === '/three.module.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(three); return; }
    if (request.url === '/three.core.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(core); return; }
    if (request.url === '/OBJLoader.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(loader); return; }
    const relative = decodeURIComponent(request.url).replace(/^\/+/, '');
    const file = path.resolve(evidenceDirectory, relative);
    if (!file.startsWith(`${evidenceDirectory}${path.sep}`)) throw new Error('outside evidence directory');
    const bytes = await readFile(file);
    response.setHeader('Content-Type', file.endsWith('.png') ? 'image/png' : 'text/plain; charset=utf-8');
    response.end(bytes);
  } catch {
    response.statusCode = 404; response.end('not found');
  }
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });

const browser = await chromium.launch({ headless: true });
const captures = [];
try {
  for (const board of [
    { id: 'contact-sheet', kind: 'comparison', viewport: { width: 1600, height: 830 } },
    { id: 'outliers', kind: 'stress', viewport: { width: 1500, height: 1420 } },
    { id: 'geometry-roles', kind: 'lod', viewport: { width: 1700, height: 990 } },
    { id: 'channel-sheet', kind: 'channels', viewport: { width: 1500, height: 1900 } },
    { id: 'c7-granodiorite-boulder-v2-clay', kind: 'single-clay', viewport: { width: 1250, height: 900 } },
    { id: 'c7-granodiorite-boulder-v2-realistic', kind: 'single-realistic', viewport: { width: 1250, height: 900 } },
  ]) {
    const page = await browser.newPage({ deviceScaleFactor: 1, viewport: board.viewport });
    await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'networkidle' });
    await page.evaluate((kind) => window.renderBoard(kind), board.kind);
    await page.waitForFunction(() => document.body.dataset.ready === 'true');
    const file = path.join(capturesDirectory, `${board.id}.png`);
    await page.screenshot({ path: file, fullPage: true });
    const info = await stat(file);
    captures.push({ bytes: info.size, height: board.viewport.height, id: board.id, path: path.relative(evidenceDirectory, file).replaceAll(path.sep, '/'), width: board.viewport.width });
    await page.close();
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

const result = {
  captureCount: captures.length,
  captures,
  expectedCaptures: 6,
  passed: captures.length === 6 && captures.every((capture) => capture.bytes > 20_000),
  status: 'candidate-awaiting-developer-approval',
};
await writeFile(path.join(evidenceDirectory, 'capture-results.json'), `${JSON.stringify(result, null, 2)}\n`);
await writeFile(path.join(capturesDirectory, 'manifest.json'), `${JSON.stringify({
  schema: 'toonlab/rock-geology-capture-manifest',
  version: 1,
  asset: {
    dimensionsMetres: [2, 1.4, 1.2],
    lithology: 'granodiorite',
    recipeId: 'c7-neutral-realistic-granodiorite-boulder',
    transform: { positionMetres: [0, 0, 0], rotationDegrees: [0, 0, 0], scale: [1, 1, 1] },
  },
  camera: {
    defaultDirectionNormalized: [0.625, 0.332, 0.703],
    projection: 'orthographic',
    variants: ['default', 'close-crop', 'grazing-angle', 'minified'],
  },
  captures,
  materialModes: ['clay', 'neutral-realistic-pbr', 'diagnostic-channels'],
  readiness: { browserNetworkIdle: true, stableAnimationFrames: 2 },
  renderer: {
    antialias: true,
    outputColorSpace: 'sRGB',
    path: 'Three.js WebGL2 headless Chromium',
    shadowMap: 'PCFSoftShadowMap 2048',
    toneMapping: 'ACESFilmic',
    toneMappingExposure: 1.06,
  },
  triangleCounts: { collision: 1868, denseSource: 19500, fallback1: 8412, fallback2: 5460, fallback3: 3248, render: 12820 },
}, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
if (!result.passed) process.exitCode = 1;
