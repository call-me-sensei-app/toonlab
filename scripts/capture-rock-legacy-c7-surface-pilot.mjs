#!/usr/bin/env node

/**
 * Geometry-preserving C7/Vibe3D surface pilot for twelve legacy catalog rocks.
 *
 * This deliberately does not invoke the C7 scalar-field compiler. Every panel
 * loads the same immutable legacy GLB. The review treatment is material-only:
 * source KTX2 maps remain bound, source albedo luminance is remapped into a
 * geology-neutral palette, and deterministic metre-scale normal/roughness
 * breakup is added in the fragment shader. No vertex or index buffer is edited.
 */

import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { chromium } from 'playwright';

const sourceRoot = path.resolve(process.argv[2] ?? 'artifacts/research/rock-geology-v2/legacy-480-c7-pilot-v0.1');
const outputRoot = path.resolve(process.argv[3] ?? 'artifacts/research/rock-geology-v2/legacy-480-c7-surface-pilot-v0.2');
const capturesDirectory = path.join(outputRoot, 'captures');
const multiviewDirectory = path.join(outputRoot, 'multiview');
const sourceReport = JSON.parse(await readFile(path.join(sourceRoot, 'pilot-report.json'), 'utf8'));
await mkdir(capturesDirectory, { recursive: true });
await mkdir(multiviewDirectory, { recursive: true });

const moduleFiles = new Map([
  ['/three.module.js', path.resolve('node_modules/three/build/three.module.js')],
  ['/three.core.js', path.resolve('node_modules/three/build/three.core.js')],
  ['/basis/basis_transcoder.js', path.resolve('node_modules/three/examples/jsm/libs/basis/basis_transcoder.js')],
  ['/basis/basis_transcoder.wasm', path.resolve('node_modules/three/examples/jsm/libs/basis/basis_transcoder.wasm')],
]);

const FAMILY_PROFILES = Object.freeze({
  'weathered-limestone': {
    low: [0.105, 0.115, 0.10], high: [0.49, 0.47, 0.39],
    scale: 0.32, microScale: 0.055, relief: 0.010, fabric: 1, roughness: [0.64, 0.96],
  },
  'blocky-granite': {
    low: [0.095, 0.105, 0.12], high: [0.49, 0.47, 0.43],
    scale: 0.42, microScale: 0.075, relief: 0.008, fabric: 2, roughness: [0.56, 0.91],
  },
  'layered-sandstone': {
    low: [0.115, 0.055, 0.022], high: [0.54, 0.32, 0.12],
    scale: 0.30, microScale: 0.045, relief: 0.008, fabric: 3, roughness: [0.68, 0.96],
  },
  'alpine-granite': {
    low: [0.075, 0.095, 0.12], high: [0.51, 0.50, 0.46],
    scale: 0.46, microScale: 0.070, relief: 0.009, fabric: 4, roughness: [0.54, 0.90],
  },
  'columnar-basalt': {
    low: [0.018, 0.022, 0.024], high: [0.16, 0.18, 0.17],
    scale: 0.27, microScale: 0.065, relief: 0.010, fabric: 5, roughness: [0.56, 0.90],
  },
  'sharp-karst': {
    low: [0.075, 0.09, 0.082], high: [0.45, 0.47, 0.41],
    scale: 0.29, microScale: 0.050, relief: 0.011, fabric: 6, roughness: [0.65, 0.97],
  },
});

const clientRecords = await Promise.all(sourceReport.results.map(async (entry) => {
  const originalManifest = JSON.parse(await readFile(path.join(sourceRoot, entry.asset.id, 'original', 'manifest.json'), 'utf8'));
  return {
    asset: entry.asset,
    original: {
      bytes: originalManifest.bytes,
      images: originalManifest.images.map((image) => ({ bytes: image.bytes, name: image.name, sha256: image.sha256 })),
      sha256: originalManifest.sha256,
    },
    profile: FAMILY_PROFILES[entry.asset.geology],
  };
}));

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function html(port) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#0b100f;color:#eef3ef;font-family:Inter,ui-sans-serif,system-ui,sans-serif}body{padding:22px}h1{margin:0;font-size:28px;letter-spacing:-.03em}.lead{margin:6px 0 16px;color:#a9b8b0;font-size:13px}.matrix{display:grid;grid-template-columns:repeat(3,1fr);gap:11px}.panel{position:relative;height:430px;border:1px solid #33413b;border-radius:12px;overflow:hidden;background:#18201d}.panel canvas{display:block;width:100%;height:100%}.label{position:absolute;z-index:3;left:11px;top:10px;background:#09100ddb;padding:7px 9px;border-radius:7px;font-size:13px;font-weight:750}.note{position:absolute;z-index:3;left:11px;right:11px;bottom:9px;background:#09100dde;padding:7px 9px;border-radius:7px;color:#bdc8c2;font:10.5px/1.35 ui-monospace,SFMono-Regular,monospace}.asset{grid-column:1/-1;margin:5px 0 -4px;padding:9px 11px;border-left:3px solid #71a189;background:#121917;color:#dce5df;font-size:14px}.asset span{color:#91a49a;margin-left:8px;font:10.5px ui-monospace,SFMono-Regular,monospace}.legend{margin-top:14px;padding:10px 12px;border:1px solid #2d3934;border-radius:9px;color:#93a39b;font-size:11px;line-height:1.5}.views{display:grid;grid-template-columns:repeat(7,1fr);gap:7px}.viewCard{position:relative;height:214px;border:1px solid #33413b;border-radius:8px;overflow:hidden;background:#18201d}.viewCard canvas{display:block;width:100%;height:100%}.viewCard .label{font-size:10px;padding:5px 6px;left:6px;top:6px}.viewHeader{grid-column:1/-1;padding:8px 10px;border-left:3px solid #71a189;background:#121917;font-size:13px}.overview{display:grid;grid-template-columns:repeat(4,1fr);gap:9px}.overview .panel{height:330px}.overview .note{font-size:9.5px}
  </style><script type="importmap">{"imports":{"three":"http://127.0.0.1:${port}/three.module.js"}}</script></head><body><h1 id="title"></h1><p class="lead" id="lead"></p><main id="app"></main><div class="legend" id="legend"></div><script type="module">
    import * as THREE from 'three';
    import {GLTFLoader} from '/three-examples/loaders/GLTFLoader.js';
    import {KTX2Loader} from '/three-examples/loaders/KTX2Loader.js';
    const records=${JSON.stringify(clientRecords)};
    const VIEWS=[
      {id:'three-quarter',direction:[1.55,.82,1.85],up:[0,1,0]},
      {id:'front',direction:[0,.12,1],up:[0,1,0]},
      {id:'rear',direction:[0,.12,-1],up:[0,1,0]},
      {id:'left',direction:[-1,.12,0],up:[0,1,0]},
      {id:'right',direction:[1,.12,0],up:[0,1,0]},
      {id:'top',direction:[0,1,0.001],up:[0,0,-1]},
      {id:'bottom-support',direction:[0,-1,0.001],up:[0,0,1]},
    ];
    const dummyBump=new THREE.DataTexture(new Uint8Array([128,128,128,255]),1,1,THREE.RGBAFormat);dummyBump.needsUpdate=true;dummyBump.colorSpace=THREE.NoColorSpace;
    function panel(label,note,compact=false){const element=document.createElement('section');element.className=compact?'viewCard':'panel';element.innerHTML='<div class="label">'+label+'</div>'+(compact?'':'<div class="note">'+note+'</div>');return element}
    function largestMeshOnly(root){const meshes=[];root.traverse(object=>{if(object.isMesh&&object.geometry?.attributes?.position)meshes.push(object)});meshes.sort((a,b)=>((b.geometry.index?.count??b.geometry.attributes.position.count)-(a.geometry.index?.count??a.geometry.attributes.position.count)));meshes.forEach((mesh,index)=>{mesh.visible=index===0});return meshes[0]}
    async function loadSource(url,renderer){const ktx2=new KTX2Loader().setTranscoderPath('/basis/');ktx2.detectSupport(renderer);const loader=new GLTFLoader().setKTX2Loader(ktx2);const gltf=await loader.loadAsync(url);largestMeshOnly(gltf.scene);return gltf.scene}
    function fnv(value,hash){hash^=value;return Math.imul(hash,16777619)>>>0}
    function geometrySignature(root){let hash=2166136261>>>0,vertices=0,indices=0,meshes=0;root.updateMatrixWorld(true);root.traverse(object=>{if(!object.isMesh||!object.visible||!object.geometry?.attributes?.position)return;meshes++;const p=object.geometry.attributes.position;vertices+=p.count;const dv=new DataView(p.array.buffer,p.array.byteOffset,p.array.byteLength);for(let i=0;i<dv.byteLength;i++)hash=fnv(dv.getUint8(i),hash);const index=object.geometry.index;if(index){indices+=index.count;const idv=new DataView(index.array.buffer,index.array.byteOffset,index.array.byteLength);for(let i=0;i<idv.byteLength;i++)hash=fnv(idv.getUint8(i),hash)}for(const value of object.matrixWorld.elements){const bytes=new DataView(new Float32Array([value]).buffer);for(let i=0;i<4;i++)hash=fnv(bytes.getUint8(i),hash)}});return {hash:hash.toString(16).padStart(8,'0'),indices,meshes,vertices}}
    function clayMaterial(){return new THREE.MeshStandardMaterial({color:0xb7b1a3,roughness:.86,metalness:0})}
    function c7Material(source,profile,seed){const sourceMaterial=Array.isArray(source)?source[0]:source;const sourceMap=sourceMaterial?.map??null;const material=new THREE.MeshStandardMaterial({color:new THREE.Color().fromArray(profile.low).lerp(new THREE.Color().fromArray(profile.high),.52),normalMap:sourceMaterial?.normalMap??null,roughnessMap:sourceMaterial?.roughnessMap??null,aoMap:sourceMaterial?.aoMap??null,roughness:.82,metalness:0});material.bumpMap=dummyBump;material.bumpScale=1;material.normalScale.set(.72,.72);material.aoMapIntensity=.72;material.envMapIntensity=.75;material.userData.c7SurfaceProfile=profile;material.userData.sourceAlbedoRetained=sourceMap;material.customProgramCacheKey=()=>JSON.stringify(profile)+'-'+seed;material.onBeforeCompile=shader=>{
        const low=profile.low.map(v=>Number(v).toFixed(5)).join(',');const high=profile.high.map(v=>Number(v).toFixed(5)).join(',');
        const scale=profile.scale.toFixed(6),microScale=profile.microScale.toFixed(6),relief=profile.relief.toFixed(6),fabric=profile.fabric.toFixed(1),seedMacro=(seed*.137).toFixed(6),seedMicro=(seed*.419).toFixed(6),seedRough=(seed*.293).toFixed(6),roughLow=profile.roughness[0].toFixed(5),roughHigh=profile.roughness[1].toFixed(5);
        shader.uniforms.tlSourceMap={value:sourceMap??dummyBump};shader.uniforms.tlHasSourceMap={value:sourceMap?1:0};
        shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\\nvarying vec3 vTlLocalPosition;\\nvarying vec2 vTlUv;').replace('#include <begin_vertex>','#include <begin_vertex>\\nvTlLocalPosition = transformed;\\nvTlUv = uv;');
        const common='#include <common>\\nvarying vec3 vTlLocalPosition;\\nvarying vec2 vTlUv;\\nuniform sampler2D tlSourceMap;\\nuniform float tlHasSourceMap;\\nfloat tlHash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}\\nfloat tlNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(mix(tlHash(i),tlHash(i+vec3(1,0,0)),f.x),mix(tlHash(i+vec3(0,1,0)),tlHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(tlHash(i+vec3(0,0,1)),tlHash(i+vec3(1,0,1)),f.x),mix(tlHash(i+vec3(0,1,1)),tlHash(i+vec3(1,1,1)),f.x),f.y),f.z);}\\nfloat tlFbm(vec3 p){float a=.56,n=0.0;for(int i=0;i<4;i++){n+=a*tlNoise(p);p=p*2.03+vec3(7.1,3.7,5.9);a*=.48;}return n;}\\nfloat tlSurfaceHeight(vec3 p){float macro=tlFbm(p/'+scale+'+'+seedMacro+');float micro=tlFbm(p/'+microScale+'+'+seedMicro+');float h=mix(macro,micro,.38);float fabric='+fabric+';if(fabric==1.0){float pits=1.0-smoothstep(.12,.43,micro);h-=pits*.22;}else if(fabric==2.0||fabric==4.0){float grains=smoothstep(.71,.91,micro);h+=grains*.06;}else if(fabric==3.0){h+=sin((p.y+p.x*.16+p.z*.05)*34.0)*.055;}else if(fabric==5.0){float vesicles=1.0-smoothstep(.08,.32,micro);h-=vesicles*.18;}else if(fabric==6.0){float etch=1.0-smoothstep(.10,.38,micro);h-=etch*.24;}return h*'+relief+';}';
        shader.fragmentShader=shader.fragmentShader.replace('#include <common>',common);
        shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\\nvec3 tlSourceColor=texture2D(tlSourceMap,vTlUv).rgb;float tlSourceLuma=mix(.5,dot(tlSourceColor,vec3(.2126,.7152,.0722)),tlHasSourceMap);float tlMacro=tlFbm(vTlLocalPosition/'+scale+'+'+seedMacro+');float tlMicro=tlFbm(vTlLocalPosition/'+microScale+'+'+seedMicro+');float tlFine=tlNoise(vTlLocalPosition/('+microScale+'*.34)+'+seedRough+');float tlValue=clamp(.5+(tlSourceLuma-.5)*.14+(tlMacro-.5)*.38+(tlMicro-.5)*.34+(tlFine-.5)*.18,0.0,1.0);vec3 tlLow=vec3('+low+');vec3 tlHigh=vec3('+high+');diffuseColor.rgb=mix(tlLow,tlHigh,smoothstep(.06,.94,tlValue));if('+fabric+'==2.0||'+fabric+'==4.0){float tlDarkGrain=smoothstep(.82,.96,tlFine);float tlQuartz=smoothstep(.83,.96,tlNoise(vTlLocalPosition/('+microScale+'*.24)+'+seedMacro+'));diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.035,.04,.045),tlDarkGrain*.62);diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.66,.64,.60),tlQuartz*.52);}if('+fabric+'==3.0){float tlBed=.5+.5*sin((vTlLocalPosition.y+vTlLocalPosition.x*.16)*18.0);diffuseColor.rgb*=mix(.82,1.10,tlBed);float tlSandGrain=smoothstep(.90,.98,tlFine);diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.055,.025,.012),tlSandGrain*.36);}if('+fabric+'==1.0||'+fabric+'==6.0){float tlPit=smoothstep(.90,.98,1.0-tlFine);diffuseColor.rgb=mix(diffuseColor.rgb,tlLow*.42,tlPit*.42);}if('+fabric+'==5.0){float tlVesicle=smoothstep(.88,.98,1.0-tlFine);diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.008,.010,.012),tlVesicle*.72);}');
        shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>','#include <normal_fragment_maps>\\nfloat tlHeight=tlSurfaceHeight(vTlLocalPosition);normal=perturbNormalArb(-vViewPosition,normal,vec2(dFdx(tlHeight),dFdy(tlHeight)),faceDirection);');
        shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\\nfloat tlRoughNoise=tlFbm(vTlLocalPosition/'+microScale+'+'+seedRough+');float tlTargetRough=mix('+roughLow+','+roughHigh+',tlRoughNoise);roughnessFactor=clamp(mix(roughnessFactor,tlTargetRough,.78),.38,1.0);');
      };return material}
    function applyMode(root,mode,profile,seed){root.traverse(child=>{if(!child.isMesh||!child.visible)return;child.castShadow=true;child.receiveShadow=true;if(mode==='clay')child.material=clayMaterial();else if(mode==='c7')child.material=c7Material(child.material,profile,seed)})}
    async function renderPanel(config){const element=panel(config.label,config.note,config.compact);const width=config.width??520,height=config.height??430;const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(1);renderer.setSize(width,height,false);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;element.append(renderer.domElement);const scene=new THREE.Scene();scene.background=new THREE.Color(0x202824);const object=await loadSource(config.url,renderer);const signatureBefore=geometrySignature(object);applyMode(object,config.mode,config.profile,config.seed);const signatureAfter=geometrySignature(object);object.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(object);const center=box.getCenter(new THREE.Vector3());const size=box.getSize(new THREE.Vector3());const radius=Math.max(size.length()*.5,.01);scene.add(object);const aspect=width/height;const extent=radius*(config.extent??.72);const camera=new THREE.OrthographicCamera(-extent*aspect,extent*aspect,extent,-extent,radius*.01,radius*30);const view=config.view??VIEWS[0];const direction=new THREE.Vector3(...view.direction).normalize();camera.position.copy(center).addScaledVector(direction,radius*5);camera.up.set(...view.up);camera.lookAt(center);scene.add(new THREE.HemisphereLight(0xcddbd5,0x24211d,1.30));const key=new THREE.DirectionalLight(0xffe1bd,4.8);key.position.copy(center).add(new THREE.Vector3(radius*2.8,radius*4.5,radius*3.5));key.castShadow=true;key.shadow.mapSize.set(2048,2048);key.shadow.camera.left=key.shadow.camera.bottom=-radius*2;key.shadow.camera.right=key.shadow.camera.top=radius*2;scene.add(key);const fill=new THREE.DirectionalLight(0x8caec8,1.45);fill.position.copy(center).add(new THREE.Vector3(-radius*3,radius*1.4,-radius*2.8));scene.add(fill);const floor=new THREE.Mesh(new THREE.PlaneGeometry(radius*9,radius*9),new THREE.MeshStandardMaterial({color:0x303733,roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.set(center.x,box.min.y-radius*.025,center.z);floor.receiveShadow=true;scene.add(floor);renderer.render(scene,camera);await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));return {element,signatureBefore,signatureAfter}}
    function sourceUrl(id){return '/source/'+id+'/original/rock.glb'}
    window.renderFamily=async family=>{const familyRecords=records.filter(record=>record.asset.geology===family);document.querySelector('#title').textContent=family.replaceAll('-',' ')+' · legacy geometry + C7/Vibe surface';document.querySelector('#lead').textContent='Two scoped samples. Every panel loads the same immutable GLB; only the final panel changes material response.';document.querySelector('#legend').textContent='Original textures remain embedded and byte-identical. Clay proves the source silhouette. C7/Vibe is a separate material-only derivative: no voxelization, remesh, basis substitution, subdivision, or vertex displacement.';const app=document.querySelector('#app');app.className='matrix';const evidence=[];for(const [assetIndex,record] of familyRecords.entries()){const id=record.asset.id;const signatureTag=record.original.sha256.slice(0,12);const heading=document.createElement('div');heading.className='asset';heading.textContent=record.asset.name+' · '+record.asset.role;const meta=document.createElement('span');meta.textContent=id+' · source SHA '+signatureTag;heading.append(meta);app.append(heading);const configs=[{mode:'original',label:'Original · untouched texture variant',note:record.original.images.length+' embedded KTX2 · original GLB '+signatureTag},{mode:'clay',label:'Source clay · exact original geometry',note:'same vertices + indices + transforms · material override only'},{mode:'c7',label:'C7/Vibe surface · same geometry',note:'source pattern + micro NormalGL + roughness · zero vertex displacement'}];let expected=null;for(const config of configs){const result=await renderPanel({...config,profile:record.profile,seed:assetIndex+family.length,url:sourceUrl(id)});app.append(result.element);expected??=result.signatureBefore;const same=JSON.stringify(expected)===JSON.stringify(result.signatureBefore)&&JSON.stringify(result.signatureBefore)===JSON.stringify(result.signatureAfter);evidence.push({id,mode:config.mode,same,signature:result.signatureAfter})}}document.body.dataset.ready='true';return evidence};
    window.renderMultiview=async assetId=>{const familyRecords=records.filter(record=>record.asset.id===assetId);const family=familyRecords[0].asset.geology;document.querySelector('#title').textContent=family.replaceAll('-',' ')+' · seven-view geometry identity gate';document.querySelector('#lead').textContent='Clay row then C7/Vibe row for one source asset. Front, rear, left, right, top, and bottom-support are mandatory; the three-quarter view is included.';document.querySelector('#legend').textContent='All fourteen views use the same source GLB buffers. Material changes may alter shading but not silhouette, footprint, voids, column spacing, or support relationships.';const app=document.querySelector('#app');app.className='views';const evidence=[];for(const [assetIndex,record] of familyRecords.entries()){for(const mode of ['clay','c7']){const heading=document.createElement('div');heading.className='viewHeader';heading.textContent=record.asset.name+' · '+record.asset.id+' · '+(mode==='clay'?'source clay':'C7/Vibe material-only');app.append(heading);for(const view of VIEWS){const result=await renderPanel({compact:true,height:214,label:view.id,mode,profile:record.profile,seed:assetIndex+family.length,url:sourceUrl(record.asset.id),view,width:250,extent:.79});app.append(result.element);evidence.push({id:record.asset.id,mode,same:JSON.stringify(result.signatureBefore)===JSON.stringify(result.signatureAfter),signature:result.signatureAfter,view:view.id})}}}document.body.dataset.ready='true';return evidence};
    window.renderOverview=async()=>{document.querySelector('#title').textContent='Legacy 480 · C7/Vibe material-only pilot';document.querySelector('#lead').textContent='Two samples from each of six legacy rock families. These are unchanged source shapes with a separate realism treatment.';document.querySelector('#legend').textContent='This sheet reviews material direction only. Family sheets retain the original textured and source-clay controls; multiview sheets prove top/bottom and side silhouettes.';const app=document.querySelector('#app');app.className='overview';const evidence=[];for(const [index,record] of records.entries()){const result=await renderPanel({height:330,label:record.asset.name,note:record.asset.geology+' · '+record.asset.id+' · material-only',mode:'c7',profile:record.profile,seed:index+11,url:sourceUrl(record.asset.id),width:440});app.append(result.element);evidence.push({id:record.asset.id,same:JSON.stringify(result.signatureBefore)===JSON.stringify(result.signatureAfter),signature:result.signatureAfter})}document.body.dataset.ready='true';return evidence};
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
      const modulePath = path.resolve(examplesRoot, relativeModule);
      if (!modulePath.startsWith(`${examplesRoot}${path.sep}`)) throw new Error('outside Three.js examples root');
      response.setHeader('Content-Type', 'text/javascript; charset=utf-8');
      response.end(await readFile(modulePath));
      return;
    }
    if (request.url.startsWith('/source/')) {
      const relative = decodeURIComponent(request.url.slice('/source/'.length));
      const file = path.resolve(sourceRoot, relative);
      if (!file.startsWith(`${sourceRoot}${path.sep}`)) throw new Error('outside source pilot root');
      response.setHeader('Content-Type', file.endsWith('.glb') ? 'model/gltf-binary' : 'application/octet-stream');
      response.end(await readFile(file));
      return;
    }
    throw new Error('not found');
  } catch (error) {
    console.error(`[server] ${error.stack ?? error.message}`);
    response.statusCode = 404;
    response.end(error.message);
  }
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });

const families = [...new Set(clientRecords.map((entry) => entry.asset.geology))];
const captures = [];
const geometryEvidence = [];
const browser = await chromium.launch({ headless: true });
try {
  for (const family of families) {
    const page = await browser.newPage({ deviceScaleFactor: 1, viewport: { width: 1660, height: 1080 } });
    page.on('pageerror', (error) => console.error(`[family:${family}] ${error.stack ?? error.message}`));
    page.on('console', (message) => { if (message.type() === 'error') console.error(`[family:${family}] ${message.text()}`); });
    page.on('response', (response) => { if (!response.ok()) console.error(`[family:${family}] HTTP ${response.status()} ${response.url()}`); });
    await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'networkidle' });
    const evidence = await page.evaluate((value) => window.renderFamily(value), family);
    geometryEvidence.push(...evidence.map((entry) => ({ ...entry, family, sheet: 'family' })));
    await page.waitForFunction(() => document.body.dataset.ready === 'true');
    const file = path.join(capturesDirectory, `${family}.png`);
    await page.screenshot({ path: file, fullPage: true });
    const info = await stat(file);
    captures.push({ bytes: info.size, family, kind: 'family', path: path.relative(outputRoot, file) });
    await page.close();

    for (const record of clientRecords.filter((entry) => entry.asset.geology === family)) {
      const multiviewPage = await browser.newPage({ deviceScaleFactor: 1, viewport: { width: 1840, height: 820 } });
      multiviewPage.on('pageerror', (error) => console.error(`[multiview:${record.asset.id}] ${error.stack ?? error.message}`));
      multiviewPage.on('console', (message) => { if (message.type() === 'error') console.error(`[multiview:${record.asset.id}] ${message.text()}`); });
      await multiviewPage.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'networkidle' });
      const multiviewEvidence = await multiviewPage.evaluate((value) => window.renderMultiview(value), record.asset.id);
      geometryEvidence.push(...multiviewEvidence.map((entry) => ({ ...entry, family, sheet: 'multiview' })));
      await multiviewPage.waitForFunction(() => document.body.dataset.ready === 'true');
      const multiviewFile = path.join(multiviewDirectory, `${record.asset.id}.png`);
      await multiviewPage.screenshot({ path: multiviewFile, fullPage: true });
      const multiviewInfo = await stat(multiviewFile);
      captures.push({ assetId: record.asset.id, bytes: multiviewInfo.size, family, kind: 'multiview', path: path.relative(outputRoot, multiviewFile) });
      await multiviewPage.close();
    }
  }

  const overviewPage = await browser.newPage({ deviceScaleFactor: 1, viewport: { width: 1840, height: 1080 } });
  overviewPage.on('pageerror', (error) => console.error(`[overview] ${error.stack ?? error.message}`));
  overviewPage.on('console', (message) => { if (message.type() === 'error') console.error(`[overview] ${message.text()}`); });
  await overviewPage.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'networkidle' });
  const overviewEvidence = await overviewPage.evaluate(() => window.renderOverview());
  geometryEvidence.push(...overviewEvidence.map((entry) => ({ ...entry, sheet: 'overview' })));
  await overviewPage.waitForFunction(() => document.body.dataset.ready === 'true');
  const overviewFile = path.join(capturesDirectory, 'overview.png');
  await overviewPage.screenshot({ path: overviewFile, fullPage: true });
  const overviewInfo = await stat(overviewFile);
  captures.push({ bytes: overviewInfo.size, kind: 'overview', path: path.relative(outputRoot, overviewFile) });
  await overviewPage.close();
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

const sourceAudit = await Promise.all(clientRecords.map(async (record) => {
  const bytes = await readFile(path.join(sourceRoot, record.asset.id, 'original', 'rock.glb'));
  return {
    assetId: record.asset.id,
    actualBytes: bytes.length,
    actualSha256: sha256(bytes),
    expectedBytes: record.original.bytes,
    expectedSha256: record.original.sha256,
    passed: bytes.length === record.original.bytes && sha256(bytes) === record.original.sha256,
    embeddedTextures: record.original.images,
  };
}));
const report = {
  schema: 'toonlab/legacy-c7-surface-pilot',
  version: 2,
  generatedAt: new Date().toISOString(),
  policy: {
    geometryAuthority: 'immutable legacy GLB LOD0',
    geometryTreatment: 'none; material-only fragment response',
    originalsImmutable: true,
    massRolloutAuthorized: false,
    texturePreservation: 'original GLBs and embedded KTX2 hashes unchanged',
  },
  counts: { assets: clientRecords.length, families: families.length, captures: captures.length },
  captures,
  geometryEvidence,
  geometryIdentityPassed: geometryEvidence.every((entry) => entry.same),
  sourceAudit,
  sourceIntegrityPassed: sourceAudit.every((entry) => entry.passed),
  technicalPassed: geometryEvidence.every((entry) => entry.same) && sourceAudit.every((entry) => entry.passed) && captures.every((entry) => entry.bytes > 30_000),
  visualStatus: 'awaiting explicit user review; no mass rollout authorized',
};
await writeFile(path.join(outputRoot, 'pilot-report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  assets: report.counts.assets,
  captures: report.counts.captures,
  families: report.counts.families,
  geometryIdentityPassed: report.geometryIdentityPassed,
  sourceIntegrityPassed: report.sourceIntegrityPassed,
  technicalPassed: report.technicalPassed,
}, null, 2));
if (!report.technicalPassed) process.exitCode = 1;
