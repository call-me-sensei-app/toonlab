#!/usr/bin/env node

import { createServer } from 'node:http';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { chromium } from 'playwright';

const root = path.resolve(process.argv[2] ?? 'artifacts/research/rock-geology-v2/legacy-480-c7-pilot-v0.1');
const capturesDirectory = path.join(root, 'captures');
const report = JSON.parse(await readFile(path.join(root, 'pilot-report.json'), 'utf8'));
await mkdir(capturesDirectory, { recursive: true });

const moduleFiles = new Map([
  ['/three.module.js', path.resolve('node_modules/three/build/three.module.js')],
  ['/three.core.js', path.resolve('node_modules/three/build/three.core.js')],
  ['/basis/basis_transcoder.js', path.resolve('node_modules/three/examples/jsm/libs/basis/basis_transcoder.js')],
  ['/basis/basis_transcoder.wasm', path.resolve('node_modules/three/examples/jsm/libs/basis/basis_transcoder.wasm')],
]);

function html(port) {
  const clientData = report.results.map((entry) => ({
    asset: entry.asset,
    controlAuthority: entry.c7.controlAuthority,
    compilerPassed: entry.c7.compilerPassed,
    originalTextureCount: entry.original.images.length,
  }));
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#0c1110;color:#eef2ef;font-family:Inter,ui-sans-serif,system-ui,sans-serif}body{padding:24px}h1{margin:0;font-size:30px;letter-spacing:-.03em}.lead{margin:6px 0 18px;color:#aebbb4;font-size:13px}.matrix{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.panel{position:relative;height:430px;border:1px solid #33413b;border-radius:12px;overflow:hidden;background:#18201d}.panel canvas{display:block;width:100%;height:100%}.label{position:absolute;z-index:3;left:12px;top:11px;background:#0b100edb;padding:7px 9px;border-radius:7px;font-size:13px;font-weight:750}.note{position:absolute;z-index:3;left:12px;right:12px;bottom:10px;background:#0b100edb;padding:7px 9px;border-radius:7px;color:#b8c4bd;font:11px/1.35 ui-monospace,SFMono-Regular,monospace}.asset{grid-column:1/-1;margin:5px 0 -4px;padding:9px 11px;border-left:3px solid #708f7f;background:#121917;color:#dce4df;font-size:14px}.asset span{color:#92a39a;margin-left:8px;font:11px ui-monospace,SFMono-Regular,monospace}.legend{margin-top:15px;padding:11px 13px;border:1px solid #2d3934;border-radius:9px;color:#8fa097;font-size:11px;line-height:1.45}
  </style><script type="importmap">{"imports":{"three":"http://127.0.0.1:${port}/three.module.js"}}</script></head><body><h1 id="title"></h1><p class="lead" id="lead"></p><main class="matrix" id="matrix"></main><div class="legend">Original = exact legacy GLB with its embedded KTX2 material. C7 clay and C7 bake are discardable review derivatives. “Basis reconstruction” means the legacy LOD0 could not pass the C7 scalar/UV path and the matched C8 geology basis was used instead; it is not a preserved legacy silhouette.</div><script type="module">
    import * as THREE from 'three';
    import {GLTFLoader} from '/three-examples/loaders/GLTFLoader.js';
    import {KTX2Loader} from '/three-examples/loaders/KTX2Loader.js';
    import {OBJLoader} from '/three-examples/loaders/OBJLoader.js';
    const records=${JSON.stringify(clientData)};
    const objLoader=new OBJLoader();const textureLoader=new THREE.TextureLoader();
    function panel(label,note){const element=document.createElement('section');element.className='panel';element.innerHTML='<div class="label">'+label+'</div><div class="note">'+note+'</div>';return element}
    function largestMeshOnly(root){const meshes=[];root.traverse(object=>{if(object.isMesh)meshes.push(object)});meshes.sort((a,b)=>((b.geometry.index?.count??b.geometry.attributes.position.count)-(a.geometry.index?.count??a.geometry.attributes.position.count)));meshes.forEach((mesh,index)=>{mesh.visible=index===0});}
    async function loadOriginal(url,renderer){const ktx2=new KTX2Loader().setTranscoderPath('/basis/');ktx2.detectSupport(renderer);const loader=new GLTFLoader().setKTX2Loader(ktx2);const gltf=await loader.loadAsync(url);largestMeshOnly(gltf.scene);return gltf.scene}
    async function loadObj(url){return objLoader.loadAsync(url)}
    async function loadTexture(url,color=false){const texture=await textureLoader.loadAsync(url);texture.colorSpace=color?THREE.SRGBColorSpace:THREE.NoColorSpace;texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;return texture}
    async function renderPanel(config){const element=panel(config.label,config.note);const width=520,height=430;const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(1);renderer.setSize(width,height,false);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.04;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;element.append(renderer.domElement);const scene=new THREE.Scene();scene.background=new THREE.Color(0x202824);let object;if(config.kind==='original')object=await loadOriginal(config.url,renderer);else object=await loadObj(config.url);object.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(object);const center=box.getCenter(new THREE.Vector3());const size=box.getSize(new THREE.Vector3());const radius=Math.max(size.length()*.5,.01);if(config.kind!=='original'){let material;if(config.kind==='baked'){const [base,normal,orm]=await Promise.all([loadTexture(config.base,true),loadTexture(config.normal),loadTexture(config.orm)]);material=new THREE.MeshStandardMaterial({map:base,normalMap:normal,aoMap:orm,roughnessMap:orm,normalScale:new THREE.Vector2(.86,.86),aoMapIntensity:.8,roughness:.9,metalness:0})}else material=new THREE.MeshStandardMaterial({color:0xaaa9a2,roughness:.93,metalness:0});object.traverse(child=>{if(!child.isMesh)return;if(child.geometry.attributes.uv&&!child.geometry.attributes.uv1)child.geometry.setAttribute('uv1',child.geometry.attributes.uv);child.material=material})}object.traverse(child=>{if(child.isMesh){child.castShadow=true;child.receiveShadow=true}});scene.add(object);const aspect=width/height;const extent=radius*.72;const camera=new THREE.OrthographicCamera(-extent*aspect,extent*aspect,extent,-extent,radius*.01,radius*30);const direction=new THREE.Vector3(1.55,.82,1.85).normalize();camera.position.copy(center).addScaledVector(direction,radius*5);camera.up.set(0,1,0);camera.lookAt(center);scene.add(new THREE.HemisphereLight(0xdbe8e1,0x28251f,1.55));const key=new THREE.DirectionalLight(0xffe8ca,4.3);key.position.copy(center).add(new THREE.Vector3(radius*2.8,radius*4.5,radius*3.5));key.castShadow=true;key.shadow.mapSize.set(2048,2048);key.shadow.camera.left=key.shadow.camera.bottom=-radius*2;key.shadow.camera.right=key.shadow.camera.top=radius*2;scene.add(key);const rim=new THREE.DirectionalLight(0x8fb8d0,1.35);rim.position.copy(center).add(new THREE.Vector3(-radius*3,radius*1.2,-radius*2.6));scene.add(rim);const floor=new THREE.Mesh(new THREE.PlaneGeometry(radius*9,radius*9),new THREE.MeshStandardMaterial({color:0x303732,roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.set(center.x,box.min.y-radius*.025,center.z);floor.receiveShadow=true;scene.add(floor);renderer.render(scene,camera);await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));return element}
    window.renderFamily=async family=>{const familyRecords=records.filter(record=>record.asset.geology===family);document.querySelector('#title').textContent=family.replaceAll('-',' ')+' · legacy 480 → C7 method';document.querySelector('#lead').textContent='Two scoped samples. Same review rig: original textured asset, C7 clay, and C7 neutral PBR bake.';const matrix=document.querySelector('#matrix');for(const record of familyRecords){const id=record.asset.id;const status=record.controlAuthority.startsWith('immutable')?'legacy silhouette control':'C8 basis reconstruction';const heading=document.createElement('div');heading.className='asset';heading.textContent=record.asset.name+' · '+record.asset.role;const meta=document.createElement('span');meta.textContent=id+' · '+status;heading.append(meta);matrix.append(heading);matrix.append(await renderPanel({kind:'original',label:'Original · textures retained',note:record.originalTextureCount+' embedded KTX2 images · immutable GLB',url:'/'+id+'/original/rock.glb'}));matrix.append(await renderPanel({kind:'clay',label:'C7 clay',note:status+' · visual review only',url:'/'+id+'/c7/meshes/render-mesh-uv.obj'}));matrix.append(await renderPanel({kind:'baked',label:'C7 neutral bake',note:'Base Color + NormalGL + AO/Roughness · compiler production='+record.compilerPassed,url:'/'+id+'/c7/meshes/render-mesh-uv.obj',base:'/'+id+'/c7/textures/baseColor.png',normal:'/'+id+'/c7/textures/normal.png',orm:'/'+id+'/c7/textures/ormHeight.png'}));}document.body.dataset.ready='true'};
  </script></body></html>`;
}

const server = createServer(async (request, response) => {
  try {
    if (request.url === '/') {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end(html(server.address().port));
      return;
    }
    const moduleFile = moduleFiles.get(request.url);
    if (moduleFile) {
      response.setHeader('Content-Type', moduleFile.endsWith('.wasm') ? 'application/wasm' : 'text/javascript; charset=utf-8');
      response.end(await readFile(moduleFile));
      return;
    }
    if (request.url.startsWith('/three-examples/')) {
      const relativeModule = decodeURIComponent(request.url.slice('/three-examples/'.length));
      const examplesRoot = path.resolve('node_modules/three/examples/jsm');
      const moduleFilePath = path.resolve(examplesRoot, relativeModule);
      if (!moduleFilePath.startsWith(`${examplesRoot}${path.sep}`)) throw new Error('outside Three.js examples root');
      response.setHeader('Content-Type', 'text/javascript; charset=utf-8');
      response.end(await readFile(moduleFilePath));
      return;
    }
    const relative = decodeURIComponent(request.url).replace(/^\/+/, '');
    const file = path.resolve(root, relative);
    if (!file.startsWith(`${root}${path.sep}`)) throw new Error('outside pilot root');
    const bytes = await readFile(file);
    const contentType = file.endsWith('.png') ? 'image/png'
      : file.endsWith('.glb') ? 'model/gltf-binary'
        : 'text/plain; charset=utf-8';
    response.setHeader('Content-Type', contentType);
    response.end(bytes);
  } catch (error) {
    response.statusCode = 404;
    response.end(error.message);
  }
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });

const families = [...new Set(report.results.map((entry) => entry.asset.geology))];
const captures = [];
const browser = await chromium.launch({ headless: true });
try {
  for (const family of families) {
    const page = await browser.newPage({ deviceScaleFactor: 1, viewport: { width: 1660, height: 1080 } });
    await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'networkidle' });
    await page.evaluate((value) => window.renderFamily(value), family);
    await page.waitForFunction(() => document.body.dataset.ready === 'true');
    const file = path.join(capturesDirectory, `${family}.png`);
    await page.screenshot({ path: file, fullPage: true });
    const info = await stat(file);
    captures.push({ bytes: info.size, family, file: `captures/${family}.png` });
    await page.close();
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

const captureReport = {
  captures,
  expected: families.length,
  passed: captures.length === families.length && captures.every((entry) => entry.bytes > 30_000),
  reviewStatus: 'awaiting-user-visual-approval; no mass rollout authorized',
};
await writeFile(path.join(root, 'capture-report.json'), `${JSON.stringify(captureReport, null, 2)}\n`);
console.log(JSON.stringify(captureReport, null, 2));
if (!captureReport.passed) process.exitCode = 1;
