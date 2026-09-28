import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { whenRendererReady } from '../../shared/rendererFactory.js';
import { AZURE_HEADLAND_ROCKS, MOSS_ALBEDO_URL, resolveRockSurface } from '../../shared/azureHeadlandRocks.js';
import { applyRockShader } from '../../../src/rock-shader/rockShaderRuntime.js';
import { sampleRockSurface } from './waterfallContacts.js';
import { evaluateAssetCandidate } from '../../../src/asset-policy/index.js';

// Reuse the already-reviewed project-library limestone set. No new asset is
// generated, downloaded from a third party, or advertised as a production LOD kit.
export function createWaterfallCliffs(root,{renderer,height,width=6,speed=1.8,impactRocks=true,midLedge=true,onSurface}) {
  let disposed=false;const group=new THREE.Group();group.name='Waterfall · reviewed limestone';root.add(group);
  const textures=new Set(),materials=new Set(),geometries=new Set();let ktx=null;
  const policy={schema:'toonlab/asset-sourcing-policy',version:1,id:'call-me-sensei-strict',mode:'strict',rules:{'natural.rock':{allowedSources:['project-library','toonlab-library','toonlab-gallery']}}};
  const task=(async()=>{
    await whenRendererReady(renderer);if(disposed)return;
    ktx=new KTX2Loader().setTranscoderPath('/basis/').setWorkerLimit(1).detectSupport(renderer);
    const loader=new GLTFLoader().setKTX2Loader(ktx),textureLoader=new THREE.TextureLoader();
    const textureCache=new Map();
    async function texture(url,srgb){
      if(!textureCache.has(url))textureCache.set(url,textureLoader.loadAsync(url).then(t=>{t.colorSpace=srgb?THREE.SRGBColorSpace:THREE.NoColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;textures.add(t);return t;}));
      return textureCache.get(url);
    }
    const definitions=[AZURE_HEADLAND_ROCKS[0],AZURE_HEADLAND_ROCKS[2]];
    const prototypes=[];
    for(const entry of definitions) {
      const verdict=evaluateAssetCandidate(policy,{domain:'natural.rock',sourceClass:'project-library'});
      if(verdict.allowed===false)throw new Error(`Project rock ${entry.id} is not admitted by the sourcing policy`);
      if(entry.measured.some(value=>!(value>0)))throw new Error(`Missing dimensions for ${entry.id}`);
      const gltf=await loader.loadAsync(entry.url),object=gltf.scene;
      object.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material){materials.add(o.material);for(const v of Object.values(o.material))if(v?.isTexture)textures.add(v);}if(/_LOD\d$/.test(o.name))o.visible=o.name.endsWith('_LOD0');});
      const spec=resolveRockSurface(entry,{moss:true,mossCoverage:.72});
      const maps={moss:await texture(MOSS_ALBEDO_URL,true)};
      for(const [slot,url]of Object.entries(spec.textureUrls))maps[slot]=await texture(url,slot==='rock');
      applyRockShader(object,{preset:'call_me_sensei',...spec.settings},{name:`Waterfall · ${entry.label}`,textures:maps,variation:entry.variation});
      if(entry.id==='rock-0119')root.traverse(o=>{
        if(o.userData.waterfallFoundation)applyRockShader(o,{preset:'call_me_sensei',...spec.settings},{name:'Waterfall · continuous limestone bed',textures:maps,variation:entry.variation});
      });
      object.traverse(o=>{if(o.material)materials.add(o.material);});
      const bounds=new THREE.Box3().setFromObject(object),center=bounds.getCenter(new THREE.Vector3());
      object.position.set(-center.x,-bounds.min.y,-center.z);
      const prototype=new THREE.Group();prototype.add(object);prototype.userData={sourceClass:'project-library',catalogId:entry.id,dimensionsMeters:entry.measured};
      prototypes.push(prototype);
    }
    if(disposed)return;
    // Unequal overlapping masses, with both reviewed shapes and varied burial.
    // No regularly spaced row and no stretched procedural mountain surface.
    const h=(height+1)/5.93778,w=width/2;
    const placements=[
      {i:0,x:-w-2.1,y:-.55,z:-4.7,s:[1.05,h,1.25],yaw:.12},
      {i:1,x:w+2.8,y:-.4,z:-5.7,s:[1.6,(height+1.4)/3.69424,1.8],yaw:-.22},
      {i:1,x:-w-2.9,y:-.7,z:-12.8,s:[1.5,(height+.8)/3.69424,2.15],yaw:.14},
      {i:0,x:w+2.25,y:-.6,z:-15.1,s:[1.1,h*.97,2.9],yaw:-.09},
      {i:0,x:-w-2.2,y:-.45,z:-21.1,s:[1.08,h*.94,1.55],yaw:.04},
      {i:1,x:0,y:-.55,z:-24,s:[(width+3)/4.21991,(height+1)/3.69424,1.1],yaw:0},
      {i:1,x:-w-4.7,y:-.6,z:-2.6,s:[1.2,height*.48/3.69424,1.3],yaw:.62},
      {i:0,x:w+4.5,y:-.6,z:-3.1,s:[1.2,height*.57/5.93778,1.1],yaw:2.9},
    ];
    for(const p of placements){const object=prototypes[p.i].clone(true);object.scale.set(...p.s);object.rotation.y=p.yaw;object.position.set(p.x,p.y,p.z);group.add(object);object.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});}
    if(impactRocks||midLedge) {
      const impactZ=-2+speed*Math.sqrt(2*height/9.81),colliders=[];
      if(impactRocks)for(const p of [{x:-width*.22,z:impactZ-.36,scale:.37,yaw:1.3},{x:width*.2,z:impactZ+.15,scale:.29,yaw:-.55},{x:-width*.42,z:impactZ+1.4,scale:.19,yaw:2.2}]) {
        const object=prototypes[1].clone(true);object.scale.set(p.scale,p.scale*.8,p.scale);object.rotation.y=p.yaw;object.position.set(p.x,-.28,p.z);group.add(object);
        object.traverse(o=>{if(o.isMesh&&o.visible){o.castShadow=true;o.receiveShadow=true;colliders.push(o);}});
      }
      if(midLedge){
        const ledge=prototypes[1].clone(true);ledge.name='Waterfall · upper impact ledge';
        ledge.scale.set(.5,.4,.8);ledge.rotation.y=.08;
        ledge.position.set(-width*.25,height*2/3-1.3,-1.65);group.add(ledge);
        ledge.traverse(o=>{if(o.isMesh&&o.visible){o.castShadow=true;o.receiveShadow=true;colliders.push(o);}});
      }
      group.updateMatrixWorld(true);
      onSurface?.(sampleRockSurface(colliders,{minX:-width/2-3,maxX:width/2+3,minZ:-4,maxZ:impactZ+4}));
    }
    root.traverse(o=>{if(o.userData.waterfallPlaceholder)o.visible=false;});
  })();
  task.catch(error=>{if(!disposed)console.warn(`Waterfall surroundings: ${error.message}`);}).finally(()=>{ktx?.dispose();if(disposed)release();});
  function release(){group.removeFromParent();textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());geometries.forEach(g=>g.dispose());}
  return {dispose(){disposed=true;release();}};
}
