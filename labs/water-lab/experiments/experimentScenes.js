import * as THREE from 'three';
import { MeshPhysicalNodeMaterial, MeshStandardNodeMaterial, PMREMGenerator } from 'three/webgpu';
import { cameraViewMatrix, normalWorld, positionWorld, texture, vec2, vec3, normalize, transformDirection, uniform, uv, attribute, smoothstep, length, mix, max } from 'three/tsl';
import { waterfallPoint, ballisticParticle, GRAVITY } from './experimentModels.js';
import { sampleEnvironmentSunShadowWithNormal } from '../../../src/shaders-tsl/chunks/environment-sun-shadow.js';
import { getWaterFoamTexture } from '../../../src/water/waterFoamTexture.js';
import { fluidCacheKey, getPreparedFluid, retainPreparedFluid, loadPreparedFluid, persistPreparedFluid } from './preparedFluidCache.js';
import { WaterVolumeOptics } from './volumeOptics.js';
import { WaterfallFoamField } from './waterfallFoam.js';
import { traceWaterfallStream } from './waterfallContacts.js';
import { createWaterfallCliffs } from './waterfallCliffs.js';
import { WaterDetailSpectrum } from '../../../src/water/waterDetailSpectrum.js';

const sunVisibility=()=>mix(.35,1,sampleEnvironmentSunShadowWithNormal(positionWorld,normalWorld));
function shadowedStone(color,roughness=.94){const material=new MeshStandardNodeMaterial({color,roughness});material.colorNode=uniform(new THREE.Color(color)).mul(sunVisibility());return material;}
const foamMaterial = () => {const m=new THREE.MeshStandardMaterial({color:0xe9f6f4,roughness:.83});m.userData.experimentFoam=true;return m;};
function box(root, size, position, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size),material);
  mesh.position.set(...position);root.add(mesh);mesh.receiveShadow=true;mesh.castShadow=!material.transmission&&!material.transparent;return mesh;
}
function plane(root, size, y, material) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(...size),material);
  mesh.geometry.setAttribute('aWaterFallbackDepth',new THREE.BufferAttribute(new Float32Array(mesh.geometry.attributes.position.count).fill(3),1));
  mesh.geometry.setAttribute('aFluidFoam',new THREE.BufferAttribute(new Float32Array(mesh.geometry.attributes.position.count),1));
  mesh.rotation.x=-Math.PI/2;mesh.position.y=y;root.add(mesh);mesh.receiveShadow=true;mesh.castShadow=!material.transmission&&!material.transparent;return mesh;
}
function disposeRoot(root) {
  const geometries=new Set(),materials=new Set();
  root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);});
  geometries.forEach(g=>g.dispose());materials.forEach(m=>{m.userData.detailSpectrum?.dispose();m.userData.optics?.dispose();m.dispose();});root.removeFromParent();
}
export function makeWaterMaterial() {
  const material=new MeshPhysicalNodeMaterial({color:0xffffff,roughness:.035,metalness:0,transmission:1,
    thickness:1.8,ior:1.333,attenuationColor:0x258b91,attenuationDistance:3,side:THREE.DoubleSide});
  const detail=new WaterDetailSpectrum();detail.configure({waveDirection:[0,1],detailScale:1});detail.update(0);
  const detailStrength=uniform(.38);
  const slopes=texture(detail.bands[0].texture).sample(positionWorld.xz.div(17))
    .add(texture(detail.bands[1].texture).sample(positionWorld.xz.div(7.3))).mul(detailStrength);
  material.normalNode=transformDirection(normalize(normalWorld.add(vec3(slopes.r,0,slopes.g))),cameraViewMatrix);
  const optics=new WaterVolumeOptics();material.thicknessNode=optics.thickness;material.userData.optics=optics;
  const scatter=uniform(new THREE.Color(.015,.1,.15));
  material.emissiveNode=scatter.mul(optics.thickness.mul(-.12).exp().oneMinus());material.userData.scatter=scatter;
  material.userData.detailSpectrum=detail;
  const foamAmount=attribute('aFluidFoam','float');
  const baseRoughness=uniform(.025),foamColor=uniform(new THREE.Color(.88,.95,.94)),waterTint=uniform(new THREE.Color(1,1,1));
  material.userData.waterTint=waterTint;
  const weights=normalWorld.abs(),weightSum=max(.001,weights.x.add(weights.y).add(weights.z));
  const bubbleX=texture(getWaterFoamTexture()).sample(positionWorld.yz.mul(2.1)).g;
  const bubbleY=texture(getWaterFoamTexture()).sample(positionWorld.xz.mul(2.1)).g;
  const bubbleZ=texture(getWaterFoamTexture()).sample(positionWorld.xy.mul(2.1)).g;
  const bubble=bubbleX.mul(weights.x).add(bubbleY.mul(weights.y)).add(bubbleZ.mul(weights.z)).div(weightSum);
  const aeration=foamAmount.mul(mix(.65,1,bubble));
  material.transmissionNode=aeration.mul(.97).oneMinus();
  material.roughnessNode=mix(baseRoughness,.65,aeration);
  material.colorNode=mix(waterTint,foamColor,aeration).mul(sunVisibility());
  material.userData.baseRoughness=baseRoughness;material.userData.foamColor=foamColor;
  material.userData.detailStrength=detailStrength;
  return material;
}
class Spray {
  constructor(root,count=900) {
    this.count=count;this.cursor=0;this.seed=527;
    this.data=new Float32Array(count*8);for(let i=0;i<count;i++)this.data[i*8+6]=-1;
    this.mesh=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),foamMaterial(),count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.mesh.frustumCulled=false;
    root.add(this.mesh);this.dummy=new THREE.Object3D();
    this.update(0);
  }
  random(){this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;return this.seed/4294967296;}
  emit(origin,velocity,size=.028,lifetime=1.5) {
    const i=(this.cursor++%this.count)*8;
    this.data.set([...origin,...velocity,0,lifetime],i);this.data[i+7]=lifetime;
    // Size has a deterministic per-slot variation below, no growing droplets.
  }
  update(dt) {
    for(let i=0;i<this.count;i++) {
      const k=i*8;
      if(this.data[k+6]>=0) this.data[k+6]+=dt;
      const age=this.data[k+6];
      if(age<0||age>this.data[k+7]){this.dummy.scale.setScalar(0);}
      else {
        const p=ballisticParticle(this.data.subarray(k,k+3),this.data.subarray(k+3,k+6),age);
        if(p[1]<.02||(this.surface&&p[1]<this.surface(p[0],p[2],p[1]+.1).height+.02)){this.data[k+6]=-1;this.dummy.scale.setScalar(0);}
        else {this.dummy.position.set(...p);this.dummy.scale.setScalar(.006+.012*((i*17%101)/101));}
      }
      this.dummy.updateMatrix();this.mesh.setMatrixAt(i,this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate=true;
  }
  clear(){for(let i=0;i<this.count;i++)this.data[i*8+6]=-1;this.cursor=0;this.seed=527;this.update(0);}
}
function ruler(root,height,x,z) {
  const mat=new THREE.MeshStandardMaterial({color:0xf8f1d8,roughness:.8});
  box(root,[.025,height,.025],[x,height/2,z],mat);
  for(let y=0;y<=height;y+=.5)box(root,[y%1===0?.25:.13,.018,.025],[x,y,z],mat);
}
export function createSurfScene({root,waterMaterial,options={},onError,renderer}) {
  const height=options.waveHeight??3;
  plane(root,[160,160],-2.8,new THREE.MeshStandardMaterial({color:0x747e69,roughness:.95}));
  const front=options.breakerMode==='spilling'?10:14,depth=front+8,center=(front-8)/2;
  for(const [size,x,z] of [[[150,67],0,-41.5],[[150,65],0,front+32.5],[[69,depth],-40.5,center],[[69,depth],40.5,center]]) {
    const sea=plane(root,size,0,waterMaterial);sea.position.x=x;sea.position.z=z;
  }
  if(options.breakerMode==='spilling'){const reef=new THREE.PlaneGeometry(12,18,48,72);reef.rotateX(-Math.PI/2);const rp=reef.attributes.position;
  for(let i=0;i<rp.count;i++){const x=rp.getX(i),z=rp.getZ(i)+1,start=options.breakerMode==='spilling'?-2:-.7,slope=options.breakerMode==='spilling'?.16:.55;rp.setXYZ(i,x,-2.8+Math.max(0,Math.min(1.75,(z-start-x*.5)*slope)),z);}
  reef.computeVertexNormals();root.add(new THREE.Mesh(reef,new THREE.MeshStandardMaterial({color:0x747e69,roughness:.95})));}
  const fluid=createFluidSurface({root,material:waterMaterial,options:{...options,kind:'surf'},onError,renderer});
  return {...fluid,getView(key){if(key!=='barrel')return null;return options.breakerMode==='spilling'?{position:[7,2.6,5],target:[0,1.1,0]}:fluid.getBarrelView();},camera:[8,2.25,6.5],target:[0,1.25,1.4],
    views:{barrel:{position:[4,1.1,2.1],target:[-2,1.1,2.1]},side:{position:[8,3.3,1.5],target:[0,1.2,1.5]},overview:{position:[11,13,14],target:[0,0,1]}},
    dispose(){fluid.dispose();disposeRoot(root);}};
}

export function createWaterfallScene({root,waterMaterial,options:initial={},renderer}) {
  const height=initial.height??10,speed=initial.speed??1.8,width=initial.fallWidth??6;
  const sourceDepth=(initial.discharge??3.6)/(width*speed);
  const bed=shadowedStone(0x939e88);
  const terrainGeometry=new THREE.PlaneGeometry(100,100,160,160);terrainGeometry.rotateX(-Math.PI/2);
  const terrainPositions=terrainGeometry.attributes.position;
  for(let i=0;i<terrainPositions.count;i++){
    const x=terrainPositions.getX(i),z=terrainPositions.getZ(i),r=Math.hypot(x,z*.85);
    const basin=Math.max(-.7,Math.min(2.5,(r-5.5)*.65));
    const outflow=z>1?Math.max(-.45,(Math.abs(x)-width*.5)*.8):10;
    terrainPositions.setY(i,Math.min(basin,outflow)+.12*Math.sin(x*1.5)*Math.sin(z*.8));
  }
  terrainGeometry.computeVertexNormals();const terrain=new THREE.Mesh(terrainGeometry,bed);terrain.receiveShadow=true;root.add(terrain);
  // Continuous rock backing closes gaps; reviewed outcrops supply the visible
  // silhouette. Preserve the natural setting rather than changing the fixture.
  const stone=shadowedStone(0x626c63);
  const bedTop=height-sourceDepth/2;
  const foundation=box(root,[width+2,bedTop+.7,20],[0,(bedTop-.7)/2,-12.55],stone);foundation.userData.waterfallFoundation=true;
  const channelBed=box(root,[width,.35,20],[0,bedTop-.175,-12],stone);channelBed.userData.waterfallFoundation=true;
  for(const side of [-1,1]){
    const bank=box(root,[1.3,1.1,20],[side*(width/2+.6),height+.12,-12],stone);bank.userData.waterfallFoundation=true;
  }
  let rockSurface=null,streams=null;
  const cliffs=renderer?createWaterfallCliffs(root,{renderer,height,width,speed,impactRocks:initial.impactRocks!==false,midLedge:initial.midLedge!==false,onSurface:surface=>{rockSurface=surface;streams=Array.from({length:65},(_,i)=>traceWaterfallStream(-width/2+width*i/64,{height,speed,surface}));}}):null;
  const sourceWater=box(root,[width,sourceDepth,20],[0,height,-12],waterMaterial);
  sourceWater.geometry.setAttribute('aWaterFallbackDepth',new THREE.BufferAttribute(new Float32Array(sourceWater.geometry.attributes.position.count).fill(sourceDepth),1));
  sourceWater.geometry.setAttribute('aFluidFoam',new THREE.BufferAttribute(new Float32Array(sourceWater.geometry.attributes.position.count),1));
  sourceWater.userData.fluidVolume=true;
  const poolGeometry=new THREE.PlaneGeometry(40,60,130,156);poolGeometry.rotateX(-Math.PI/2);
  poolGeometry.setAttribute('aWaterFallbackDepth',new THREE.BufferAttribute(new Float32Array(poolGeometry.attributes.position.count).fill(.7),1));
  poolGeometry.setAttribute('aFluidFoam',new THREE.BufferAttribute(new Float32Array(poolGeometry.attributes.position.count),1));
  const pool=new THREE.Mesh(poolGeometry,waterMaterial);pool.position.z=1;root.add(pool);
  const rest=poolGeometry.attributes.position.array.slice();
  const nx=65,ny=97,positions=new Float32Array(nx*ny*2*3),index=[];
  // Front and rear sheet faces joined around their perimeter: finite optical thickness.
  for(let side=0;side<2;side++)for(let y=0;y<ny-1;y++)for(let x=0;x<nx-1;x++) {
    const a=side*nx*ny+y*nx+x,b=a+nx;
    if(side===0)index.push(a,b,a+1,b,b+1,a+1);else index.push(a,a+1,b,b,a+1,b+1);
  }
  const edges=[];for(let x=0;x<nx;x++)edges.push(x);for(let y=1;y<ny;y++)edges.push(y*nx+nx-1);
  for(let x=nx-2;x>=0;x--)edges.push((ny-1)*nx+x);for(let y=ny-2;y>0;y--)edges.push(y*nx);
  for(let i=0;i<edges.length;i++){const a=edges[i],b=edges[(i+1)%edges.length],o=nx*ny;index.push(a,b,a+o,b,b+o,a+o);}
  const sheetGeometry=new THREE.BufferGeometry();sheetGeometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));sheetGeometry.setIndex(index);
  const ages=new Float32Array(nx*ny*2);
  for(let side=0;side<2;side++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++)ages[(side*ny+y)*nx+x]=y/(ny-1);
  sheetGeometry.setAttribute('aFallAge',new THREE.BufferAttribute(ages,1));
  const sheetMaterial=new MeshPhysicalNodeMaterial({color:0xd8f0f1,transmission:.96,roughness:.07,ior:1.333,thickness:.1,side:THREE.DoubleSide});
  sheetMaterial.normalNode=waterMaterial.normalNode;sheetMaterial.userData.thinSheet=true;
  const flowTime=uniform(0),age=attribute('aFallAge','float');
  const flowUv=vec2(positionWorld.x.mul(.38),flowTime.sub(age.mul(Math.sqrt(2*height/GRAVITY))).mul(.8));
  const flowNoise=texture(getWaterFoamTexture()).sample(flowUv).b;
  const fine=texture(getWaterFoamTexture()).sample(flowUv.mul(vec2(3.5,1.4))).g;
  const aerationAmount=uniform(.9);
  const aeration=smoothstep(.015,.6,age).mul(mix(.65,1,smoothstep(.12,.68,flowNoise))).mul(aerationAmount);
  sheetMaterial.transmissionNode=aeration.oneMinus();sheetMaterial.roughnessNode=mix(.025,.56,aeration);
  sheetMaterial.colorNode=vec3(.91,.97,.97).mul(sunVisibility());
  // Aeration changes scattering/transmission instead of punching circular holes.
  sheetMaterial.opacityNode=mix(.94,1,fine);
  const sheet=new THREE.Mesh(sheetGeometry,sheetMaterial);sheet.frustumCulled=false;root.add(sheet);
  // Connected runoff surfaces share normals; split only where streams diverge.
  const runoffGeometry=new THREE.BufferGeometry(),runoffPositions=new Float32Array(65*96*3);
  runoffGeometry.setAttribute('position',new THREE.BufferAttribute(runoffPositions,3));
  const runoffMaterial=new MeshPhysicalNodeMaterial({color:0xe7eeeb,roughness:.32,transmission:.35,thickness:.04,ior:1.333,side:THREE.DoubleSide});
  const runoffUv=new Float32Array(65*96*2);
  for(let x=0;x<65;x++)for(let y=0;y<96;y++){const i=(x*96+y)*2;runoffUv[i]=x/64;runoffUv[i+1]=y/95;}
  runoffGeometry.setAttribute('uv',new THREE.BufferAttribute(runoffUv,2));
  const runoffNoise=texture(getWaterFoamTexture()).sample(uv().mul(vec2(5,2)).sub(vec2(0,flowTime.mul(2))));
  runoffMaterial.transmissionNode=mix(.08,.28,runoffNoise.b);runoffMaterial.roughnessNode=mix(.32,.58,runoffNoise.g);
  const runoff=new THREE.Mesh(runoffGeometry,runoffMaterial);runoff.visible=false;runoff.frustumCulled=false;root.add(runoff);
  let runoffBuilt=false;
  const spray=new Spray(root,3000);
  let time=0,budget=0,foamBudget=0;
  const foamField=new WaterfallFoamField({impactZ:-2+speed*Math.sqrt(2*height/GRAVITY)});
  const flight=Math.sqrt(2*height/GRAVITY),impactZ=-2+speed*flight;
  // Soft, irregular airborne puffs: a separate 3D population from surface foam.
  const mistCanvas=document.createElement('canvas');mistCanvas.width=mistCanvas.height=128;
  const ctx=mistCanvas.getContext('2d'),pixels=ctx.createImageData(128,128);
  for(let y=0;y<128;y++)for(let x=0;x<128;x++){
    const nx=(x-64)/64,ny=(y-64)/64,r=Math.hypot(nx,ny),i=(y*128+x)*4;
    const noise=.65+.16*Math.sin(x*.17+Math.sin(y*.11)*2)+.12*Math.sin(y*.23+x*.07)+.07*Math.sin(x*.53-y*.37);
    pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=255;pixels.data[i+3]=Math.round(255*Math.max(0,1-r*r)**2*Math.max(.1,noise));
  }
  ctx.putImageData(pixels,0,0);
  const mistMap=new THREE.CanvasTexture(mistCanvas),mist=[];
  for(let i=0;i<240;i++){const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:mistMap,color:0xd6e5ee,transparent:true,depthWrite:false,opacity:.14}));root.add(sprite);mist.push(sprite);}
  const runoffSprayPositions=new Float32Array(6500*3),runoffSprayGeometry=new THREE.BufferGeometry();
  runoffSprayGeometry.setAttribute('position',new THREE.BufferAttribute(runoffSprayPositions,3));
  const runoffSpray=new THREE.Points(runoffSprayGeometry,new THREE.PointsMaterial({color:0xf0f5f5,size:.12,map:mistMap,transparent:true,opacity:.6,depthWrite:false}));runoffSpray.frustumCulled=false;root.add(runoffSpray);
  ruler(root,height,width/2+.7,-2);
  function update(dt,options={}) {
    time+=dt;flowTime.value=time;const discharge=options.discharge??3.6;
    aerationAmount.value=options.aeration??.92;
    const impactEnergy=discharge*height/(width*3);
    const sources=streams?streams.filter((_,i)=>i%4===0).map(s=>s.end):Array.from({length:9},(_,i)=>[-width/2+i*width/8,.02,impactZ]);
    foamBudget+=dt;while(foamBudget>=1/30){foamField.step(1/30,{sources,energy:impactEnergy*(options.foamAmount??1),surface:rockSurface});foamBudget-=1/30;}
    for(let side=0;side<2;side++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++) {
      const endTime=streams?.[x]?.impact?.time??flight;
      const t=endTime*y/(ny-1),p=waterfallPoint(t,2*x/(nx-1)-1,time,{discharge,height,speed,width});
      const k=((side*ny+y)*nx+x)*3;
      const vz=speed,vy=-GRAVITY*t,velocity=Math.hypot(vz,vy);
      positions[k]=p.x;positions[k+1]=p.y+(side-.5)*p.thickness*vz/velocity;
      positions[k+2]=p.z-(side-.5)*p.thickness*vy/velocity;
    }
    sheetGeometry.attributes.position.needsUpdate=true;sheetGeometry.computeVertexNormals();
    if(streams) {
      runoff.visible=true;spray.surface=rockSurface;
      for(let x=0;x<65;x++) {
        const stream=streams[x],start=stream.impact?stream.path.findIndex(p=>p.time>=stream.impact.time):stream.path.length-1;
        for(let y=0;y<96;y++) {
          const offset=start+(stream.path.length-1-start)*y/95,lo=Math.floor(offset),blend=offset-lo;
          const a=stream.path[lo].position,b=stream.path[Math.min(lo+1,stream.path.length-1)].position,k=(x*96+y)*3;
          const px=a[0]+(b[0]-a[0])*blend,pz=a[2]+(b[2]-a[2])*blend;
          runoffPositions[k]=px;runoffPositions[k+1]=Math.max(a[1]+(b[1]-a[1])*blend+.03+.006*Math.sin(x*.6+y*.3-time*19),rockSurface(px,pz,a[1]+(b[1]-a[1])*blend+.1).height+.035);runoffPositions[k+2]=pz;
        }
      }
      if(!runoffBuilt){
        const indices=[];
        for(let x=0;x<64;x++)for(let y=0;y<95;y++){
          const a=x*96+y,b=a+96;
          if(!streams[x].impact||!streams[x+1].impact)continue;
          const distance=i=>Math.hypot(runoffPositions[i*3]-runoffPositions[(i+96)*3],runoffPositions[i*3+1]-runoffPositions[(i+96)*3+1],runoffPositions[i*3+2]-runoffPositions[(i+96)*3+2]);
          if(distance(a)<.25&&distance(a+1)<.25)indices.push(a,b,a+1,b,b+1,a+1);
        }
        runoffGeometry.setIndex(indices);runoffBuilt=true;
      }
      runoffGeometry.attributes.position.needsUpdate=true;runoffGeometry.computeVertexNormals();
    }
    const p=poolGeometry.attributes.position;
    for(let i=0;i<p.count;i++) {
      const x=rest[i*3],z=rest[i*3+2]+1,r=Math.hypot(Math.max(0,Math.abs(x)-width*.4),z-impactZ),angle=Math.atan2(z-impactZ,x);
      poolGeometry.attributes.aFluidFoam.setX(i,foamField.sample(x,z));
      p.setY(i,.03*discharge*Math.sin(r*6-time*5+Math.sin(angle*3)*.6)*Math.exp(-r*.55)+.015*Math.sin(x*3+time*2)*Math.sin(z*4-time*1.2));
    }
    p.needsUpdate=true;poolGeometry.attributes.aFluidFoam.needsUpdate=true;poolGeometry.computeVertexNormals();
    budget+=dt*discharge*650;
    while(budget>=1){budget--;const a=spray.random()*Math.PI*2,speed=.8+spray.random()*1.4;
      const stream=streams?.[Math.floor(spray.random()*65)],contact=stream?.contacts[Math.floor(spray.random()*(stream?.contacts.length??0))];
      const origin=contact?contact.point:[(spray.random()-.5)*width,.08,impactZ+(spray.random()-.5)*.2];
      spray.emit(origin,[Math.cos(a)*speed,1+spray.random()*(contact?contact.speed*.38:2.7),Math.sin(a)*speed+.5]);}
    spray.update(dt);
    for(let i=0;i<mist.length;i++) {
      const hash=s=>{const v=Math.sin(s*91.7+12.98)*43758.5453;return v-Math.floor(v);};
      const life=3+hash(i*3)*2,age=(time+hash(i*11)*life)%life,a=hash(i*7)*Math.PI*2;
      const stream=streams?.[i%65],contact=stream?.contacts[Math.floor(i/65)%Math.max(1,stream?.contacts.length??1)];
      const origin=contact?.point??[(hash(i*13)-.5)*width,.1,impactZ];
      const spread=(1-Math.exp(-age*1.1)),wind=options.mistWind??.35;
      mist[i].position.set(origin[0]+Math.cos(a)*spread*1.4+age*wind,
        origin[1]+.2+Math.sin(age/life*Math.PI)*(.7+hash(i*17)*.8),
        origin[2]+Math.sin(a)*spread*.8+age*.3);
      mist[i].scale.setScalar((.35+age*.62)*(1+hash(i*19)*.5));
      mist[i].material.rotation=hash(i*23)*Math.PI*2+age*.08;
      mist[i].material.opacity=.16*Math.sin(age/life*Math.PI)*Math.min(1.8,impactEnergy)*(options.mistAmount??1);
    }
    runoffSpray.visible=Boolean(streams);
    if(streams)for(let i=0;i<6500;i++){
      const stream=streams[i%65],first=stream.impact?.time;
      if(first===undefined){runoffSprayPositions[i*3+1]=-100;continue;}
      const last=stream.path.at(-1).time,duration=Math.max(.02,last-first),age=(time+i*.6180339)%duration;
      const offset=Math.min(stream.path.length-1,(first+age)*180),lo=Math.floor(offset),f=offset-lo;
      const a=stream.path[lo].position,b=stream.path[Math.min(lo+1,stream.path.length-1)].position;
      const spread=.014+age*.03;
      runoffSprayPositions[i*3]=a[0]+(b[0]-a[0])*f+Math.sin(i*17.3)*spread;
      runoffSprayPositions[i*3+1]=a[1]+(b[1]-a[1])*f+.035;
      runoffSprayPositions[i*3+2]=a[2]+(b[2]-a[2])*f+Math.cos(i*23.1)*spread;
    }
    runoffSprayGeometry.attributes.position.needsUpdate=true;
    const contacts=streams?.flatMap(s=>s.contacts)??[],upper=contacts.filter(c=>c.point[1]>height*.35).length,lower=contacts.length-upper;
    return {time,upperContacts:upper,lowerContacts:lower,phase:`${height.toFixed(1)} m drop × ${width.toFixed(1)} m wide · ${discharge.toFixed(1)} m³/s · ${upper} upper / ${lower} lower impacts`,rockContacts:streams?.filter(s=>s.impact).length??0,model:'Gravity sheet + triangle contact + surface runoff'};
  }
  update(0);
  return {update,reset(){time=0;budget=0;foamBudget=0;foamField.reset();spray.clear();update(0);},camera:[10,height*.52,height*1.65],target:[0,height*.46,-1.2],
    views:{side:{position:[height*1.7,height*.55,4],target:[0,height*.48,-1.5]},barrel:{position:[4,height*.65,7],target:[0,height*.6,-.4]},overview:{position:[height*1.5,height*1.8,height*1.6],target:[0,height*.35,-4]}},
    dispose(){cliffs?.dispose();mistMap.dispose();disposeRoot(root);}};
}

export function createGlassScene({root,waterMaterial,onError,options={},renderer}) {
  const frame=new THREE.MeshStandardMaterial({color:0x243449,metalness:.75,roughness:.27});
  const floor=new THREE.MeshStandardMaterial({color:0x2a3448,metalness:.15,roughness:.36});
  box(root,[7.1,.35,4.3],[0,-.23,0],floor);plane(root,[70,70],-.45,new THREE.MeshStandardMaterial({color:0x101a2e,roughness:.65}));
  const roomMaterial=new THREE.MeshStandardMaterial({color:0x08101c,roughness:.8});
  box(root,[24,12,.2],[0,5,-7],roomMaterial);
  box(root,[.2,12,24],[-11,5,0],roomMaterial);box(root,[.2,12,24],[11,5,0],roomMaterial);
  for(const x of [-3.07,3.07])for(const z of [-1.67,1.67])box(root,[.075,4.8,.075],[x,2.4,z],frame);
  for(const y of [0,4.8]) {
    for(const z of [-1.67,1.67])box(root,[6.2,.07,.07],[0,y,z],frame);
    for(const x of [-3.07,3.07])box(root,[.07,.07,3.4],[x,y,0],frame);
  }
  // Subtle tinted panels with clear outlines; avoid nested transmission passes
  // (water itself uses true transmission). Panels still show the container.
  const glass=new THREE.MeshPhysicalMaterial({color:0x83bdd6,transparent:true,opacity:.065,roughness:.07,metalness:.15,depthWrite:false,side:THREE.DoubleSide});
  for(const z of [-1.65,1.65])box(root,[6,.01+4.8,.025],[0,2.4,z],glass);
  for(const x of [-3.05,3.05])box(root,[.025,4.8,3.3],[x,2.4,0],glass);
  // The solver is a closed tank. Make its upper collision boundary visible
  // as a glass lid rather than letting droplets hit an invisible ceiling.
  box(root,[6.1,.025,3.3],[0,4.81,0],glass);
  for(const [x,color] of [[-4,0x24ccef],[4,0xffa64a]]) {
    const mat=new THREE.MeshBasicMaterial({color});box(root,[.13,5,.1],[x,2.4,-4],mat);
    const light=new THREE.PointLight(color,35,14,2);light.position.set(x,3,-3);root.add(light);
  }
  ruler(root,4.5,-3.18,1.8);
  const material=waterMaterial;
  const fluid=createFluidSurface({root,material,options,onError,renderer});
  let environment=null,pmrem=null;
  return {...fluid,camera:[9,5.6,9],target:[0,1.7,0],views:{side:{position:[8,3,0],target:[0,2,0]},barrel:{position:[7,3.5,7],target:[0,1.7,0]},overview:{position:[8,11,9],target:[0,1,0]}},
    prepare(renderer,scene) {
      if(!environment) {
        const studio=new THREE.Scene();studio.background=new THREE.Color(.006,.009,.014);
        const panel=(size,pos,color,rotation=0)=>{
          const m=new THREE.Mesh(new THREE.PlaneGeometry(...size),new THREE.MeshBasicMaterial({color:new THREE.Color(...color),side:THREE.DoubleSide}));
          m.position.set(...pos);m.rotation.x=rotation;studio.add(m);
        };
        panel([5,3],[1,7,0],[2.5,2.7,3],Math.PI/2);
        panel([.2,5],[-4,3,-4],[.05,3.5,6]);panel([.2,5],[4,3,-4],[6,2.1,.12]);
        pmrem=new PMREMGenerator(renderer);environment=pmrem.fromScene(studio,.03);disposeRoot(studio);
      }
      scene.environment=environment.texture;scene.environmentIntensity=1;
    },
    dispose(){fluid.dispose();environment?.dispose();pmrem?.dispose();disposeRoot(root);}};
}

function createFluidSurface({root,material,options,onError,renderer}) {
  const initialGeometry=new THREE.BufferGeometry();initialGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(3),3));initialGeometry.setAttribute('normal',new THREE.BufferAttribute(new Float32Array([0,1,0]),3));initialGeometry.setAttribute('aWaterFallbackDepth',new THREE.BufferAttribute(new Float32Array([.03]),1));initialGeometry.setAttribute('aFluidFoam',new THREE.BufferAttribute(new Float32Array(1),1));initialGeometry.setDrawRange(0,0);
  const mesh=new THREE.Mesh(initialGeometry,material);mesh.visible=false;mesh.userData.fluidVolume=true;mesh.frustumCulled=false;root.add(mesh);
  const cacheKey=fluidCacheKey(options),cached=getPreparedFluid(cacheKey);
  let droplets=null;const dropletDummy=new THREE.Object3D();
  const duration=options.kind==='surf'?3:4;
  let worker=null;
  const frames=cached??[];let cacheState=cached?'memory':'loading',progress=cached?1:0,complete=Boolean(cached),error=null,disposed=false,time=0,shown=-1;
  function show(index) {
    if(index===shown||!frames[index])return;
    shown=index;const frame=frames[index];
    const position=frame.packed?Float32Array.from(frame.position,v=>v/1000):frame.position;
    const normal=frame.packed?Float32Array.from(frame.normal,v=>v/32767):frame.normal;
    const count=position.length/3;
    let geometry=mesh.geometry;
    if(!geometry.userData.preparedCapacity){
      const vertexCapacity=Math.max(count,...frames.filter(Boolean).map(f=>f.position.length/3));
      const indexCapacity=Math.max(frame.index.length,...frames.filter(Boolean).map(f=>f.index.length));
      geometry=new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(vertexCapacity*3),3).setUsage(THREE.DynamicDrawUsage));
      geometry.setAttribute('normal',new THREE.BufferAttribute(new Float32Array(vertexCapacity*3),3).setUsage(THREE.DynamicDrawUsage));
      geometry.setAttribute('aFluidFoam',new THREE.BufferAttribute(new Float32Array(vertexCapacity),1).setUsage(THREE.DynamicDrawUsage));
      geometry.setAttribute('aWaterFallbackDepth',new THREE.BufferAttribute(new Float32Array(vertexCapacity).fill(.03),1));
      geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indexCapacity),1).setUsage(THREE.DynamicDrawUsage));
      geometry.userData.preparedCapacity=complete;
      const previous=mesh.geometry;mesh.geometry=geometry;
      // The first preview uses one frame; retire it after the queue is no longer using it.
      const queue=renderer?.backend?.device?.queue;
      if(queue?.onSubmittedWorkDone)queue.onSubmittedWorkDone().then(()=>previous.dispose(),()=>previous.dispose());else previous.dispose();
    }
    geometry.attributes.position.array.set(position);geometry.attributes.normal.array.set(normal);
    const foam=frame.packed?Float32Array.from(frame.foam,v=>v/255):frame.foam;
    geometry.attributes.aFluidFoam.array.set(foam);geometry.index.array.set(frame.index);
    for(const [attribute,length] of [[geometry.attributes.position,position.length],[geometry.attributes.normal,normal.length],[geometry.attributes.aFluidFoam,foam.length],[geometry.index,frame.index.length]]){
      attribute.clearUpdateRanges();attribute.addUpdateRange(0,length);attribute.needsUpdate=true;
    }
    geometry.setDrawRange(0,frame.index.length);
    mesh.visible=true;
    if(frame.spray?.length){
      const positions=frame.packed?Float32Array.from(frame.spray,v=>v/1000):frame.spray;
      if(!droplets){droplets=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),new THREE.MeshPhysicalMaterial({color:0xc1e7eb,roughness:.12,transmission:.35,thickness:.025,ior:1.333}),Math.max(4096,...frames.filter(Boolean).map(f=>(f.spray?.length??0)/3)));droplets.frustumCulled=false;root.add(droplets);}
      droplets.count=Math.min(droplets.instanceMatrix.count,positions.length/3);
      for(let i=0;i<droplets.count;i++){dropletDummy.position.fromArray(positions,i*3);const size=.006+(i*17%23)/23*.014;dropletDummy.scale.set(size,size*1.3,size);dropletDummy.updateMatrix();droplets.setMatrixAt(i,dropletDummy.matrix);}droplets.instanceMatrix.needsUpdate=true;
    } else if(droplets)droplets.count=0;
  }
  const onWorkerMessage=({data})=>{
    if(disposed)return;
    if(data.error){error=data.error;onError?.(error);return;}
    frames[data.frameIndex]=data;progress=data.progress;complete=data.complete;
    if(shown<0)show(0);
    if(complete){shown=-1;retainPreparedFluid(cacheKey,frames);cacheState='saving';persistPreparedFluid(cacheKey,frames).then(result=>{cacheState=result;}).catch(error=>{cacheState={stored:false,reason:error.message};});worker.terminate();worker=null;}
  };
  function startWorker(){
    if(disposed)return;
    cacheState='computing';worker=new Worker(new URL('./fluidWorker.js',import.meta.url),{type:'module'});worker.onmessage=onWorkerMessage;
    worker.onerror=e=>{if(disposed)return;error=e.message||'The fluid worker could not load. Replay to retry.';onError?.(error);};
    worker.postMessage({type:'init',options:{...options,prepared:true},id:1});
  }
  if(cached)show(0);else loadPreparedFluid(cacheKey).then(saved=>{
    if(disposed)return;
    if(saved){cacheState='disk';frames.push(...saved);progress=1;complete=true;shown=-1;show(0);}else startWorker();
  }).catch(startWorker);
  return {
    update(dt,settings={}) {
      if(complete)time=Math.min(duration,time+Math.max(0,dt));
      const index=complete?Math.min(duration*60,Math.floor((time+1e-7)*60)):0;show(index);
      const stats=frames[index]?.stats??{time:0,particles:0};
      return {...stats,cacheState,time:complete?time:0,ended:complete&&time>=duration,preparing:!complete&&!error,error,
        phase:error?`Simulation error: ${error}`:!complete?`Preparing ${frames[0]?.stats.backend??'3D'} motion · ${Math.round(progress*100)}%`:time>=duration?'Motion complete · Replay':`${stats.particles.toLocaleString()} particles · ${stats.backend??'3D'} fluid`,model:'3D particle fluid'};
    },
    getBarrelView(){
      if(!complete)return null;
      let best=-1;for(let i=15;i<frames.length;i++){
        const opening=frames[i].opening;if(!opening?.closedAcross||opening.width<1||opening.axialClearance<4)continue;
        if(best<0||opening.clearance>frames[best].opening.clearance)best=i;
      }
      if(best<0)return null;
      const opening=frames[best]?.opening;if(!opening)return null;time=best/60;shown=-1;show(best);
      const [x,y,z]=opening.center;return {position:[3.8,y,z+.38],target:[-3.8,y,z-.38]};
    },
    seek(value){if(complete){time=Math.max(0,Math.min(duration,value));show(Math.min(duration*60,Math.round(time*60)));}},
    reset(){time=0;shown=-1;show(0);},
    dispose(){disposed=true;if(!complete)frames.length=0;if(worker){worker.onmessage=null;worker.onerror=null;worker.terminate();}},
  };
}
