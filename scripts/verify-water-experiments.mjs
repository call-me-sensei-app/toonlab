import assert from 'node:assert/strict';
import * as THREE from 'three';
import {WaterVolumeOptics} from '../labs/water-lab/experiments/volumeOptics.js';
import {WaterfallFoamField} from '../labs/water-lab/experiments/waterfallFoam.js';
import {sampleRockSurface,traceWaterfallStream} from '../labs/water-lab/experiments/waterfallContacts.js';
import { TankFluidSolver } from '../labs/water-lab/experiments/fluidSolver.js';
import { waterfallPoint, ballisticParticle } from '../labs/water-lab/experiments/experimentModels.js';
import { createSurfVolume, FluidVolumeMesher } from '../labs/water-lab/experiments/fluidVolume.js';

// A material override marked as a shadow pass rewrites custom depth colors
// to black in Three. The optical pass must use a direct, reversible swap.
const opticalScene=new THREE.Scene(),opticalCamera=new THREE.PerspectiveCamera();
const liquidMaterial=new THREE.MeshBasicMaterial(),liquid=new THREE.Mesh(new THREE.BoxGeometry(),liquidMaterial);
liquid.userData.fluidVolume=true;opticalScene.add(liquid);
const backdrop=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());opticalScene.add(backdrop);
const optics=new WaterVolumeOptics();let opticalTarget=null,rendered=false;
const renderer={getDrawingBufferSize:v=>v.set(32,32),getRenderTarget:()=>opticalTarget,setRenderTarget:t=>{opticalTarget=t;},getClearAlpha:()=>1,getClearColor:c=>c.set(0),setClearColor(){},clear(){},render(scene){
  assert.equal(scene.overrideMaterial,null);assert.equal(liquid.material,optics.material);assert.equal(liquid.material.side,THREE.BackSide);assert.equal(backdrop.visible,false);rendered=true;
}};
optics.capture(renderer,opticalScene,opticalCamera);assert.ok(rendered);assert.equal(liquid.material,liquidMaterial);assert.equal(backdrop.visible,true);
optics.dispose();liquid.geometry.dispose();liquidMaterial.dispose();backdrop.geometry.dispose();backdrop.material.dispose();

// Continuity and gravity must agree for every authored waterfall size.
for(const height of [2,5,10,16])for(const discharge of [.6,1.8,3])for(const speed of [.5,1.8,3]) {
  const options={height,discharge,speed,width:3},flight=Math.sqrt(2*height/9.81);
  let previousThickness=Infinity;
  for(let i=0;i<=20;i++) {
    const p=waterfallPoint(flight*i/20,.3,2,options);
    assert.ok(Math.abs(p.thickness*3*p.velocity-discharge)<1e-10,'Discharge must be conserved as the sheet accelerates');
    assert.ok(p.thickness<=previousThickness,'A falling sheet must thin as it accelerates');previousThickness=p.thickness;
    assert.ok(Math.abs(.5*p.velocity**2+9.81*p.y-(.5*speed**2+9.81*height))<1e-9,'Ballistic head must be conserved');
  }
  assert.ok(Math.abs(waterfallPoint(flight,0,0,options).y)<1e-10,'Fall must meet the pool');
}
assert.deepEqual(ballisticParticle([1,2,3],[4,5,6],0),[1,2,3]);
assert.equal(ballisticParticle([0,10,0],[0,0,0],1)[1],10-9.81/2);

// Collision sampling follows transformed rendered triangles and prevents runoff penetration.
const contactMesh=new THREE.Mesh(new THREE.SphereGeometry(.8,24,16));contactMesh.position.set(0,.2,-.5);contactMesh.updateMatrixWorld();
const rockSurface=sampleRockSurface([contactMesh],{step:.06});
assert.ok(rockSurface(0,-.5).height>.98);
const contactStream=traceWaterfallStream(0,{height:5,speed:1.8,surface:rockSurface});
assert.ok(contactStream.impact&&contactStream.impact.time<Math.sqrt(10/9.81));
for(const point of contactStream.path)assert.ok(point.position[1]>=rockSurface(point.position[0],point.position[2]).height+.024,'Runoff must remain outside the solid');
assert.equal(traceWaterfallStream(0,{height:5,speed:1.8}).impact,null,'Removing the rocks must restore a free fall');
contactMesh.geometry.dispose();contactMesh.material.dispose();

// Layered sampling must keep the pool below a projecting ledge accessible.
const upperMesh=new THREE.Mesh(new THREE.BoxGeometry(2,.6,2));upperMesh.position.set(0,6.4,0);upperMesh.updateMatrixWorld();
const lowerMesh=new THREE.Mesh(new THREE.BoxGeometry(3,.5,3));lowerMesh.position.set(0,.25,0);lowerMesh.updateMatrixWorld();
const layered=sampleRockSurface([upperMesh,lowerMesh],{step:.1});
assert.ok(Math.abs(layered(0,0).height-6.7)<.01);
assert.ok(Math.abs(layered(0,0,1).height-.5)<.01,'Upper ledge must not fill the space beneath it');
for(const mesh of [upperMesh,lowerMesh]){mesh.geometry.dispose();mesh.material.dispose();}
const foamField=new WaterfallFoamField();
for(let i=0;i<60;i++)foamField.step(1/30,{sources:[[0,0,0]]});
assert.ok(foamField.sample(0,0)>.5,'Impact must generate a concentrated whitewater field');
const foamBefore=foamField.current.reduce((a,b)=>a+b,0);
for(let i=0;i<150;i++)foamField.step(1/30,{sources:[]});
assert.ok(foamField.current.reduce((a,b)=>a+b,0)<foamBefore*.6,'Foam must decay after its source stops');
assert.ok(foamField.sample(0,1)>foamField.sample(0,-1),'Foam must travel downstream');
foamField.reset();assert.ok(foamField.current.every(v=>v===0));

// An incipient plunging crest must retain a bounded, person-sized air passage
// while its independently simulated lip descends. A mere overhang is insufficient.
const surf=createSurfVolume({spacing:.28}),surfMesher=new FluidVolumeMesher(surf,88);
const surfInitial=surf.diagnostics(),initialSurface=surfMesher.update();
assert.equal(surf.dimensions,3);
assert.ok(initialSurface.opening?.closedAcross);
const initialMesh=initialSurface.position.slice();
for(let i=0;i<30;i++)surf.step();
const barrel=surfMesher.update(),opening=barrel.opening,surfOpen=surf.diagnostics();
assert.ok(opening?.closedAcross&&opening.clearance>1.5&&opening.width>1&&opening.width<4,'The wave must have an enclosed cross-section with usable clearance');
assert.ok(opening.axialClearance>4,'The roof must continue along the wave, not exist in only one slice');
assert.equal(surfOpen.volume,surfInitial.volume);
assert.ok(surfOpen.kinetic+surfOpen.potential<(surfInitial.kinetic+surfInitial.potential)*1.06);
assert.notDeepEqual(barrel.position,initialMesh,'The crest must evolve through the fluid solve');
assert.ok(barrel.position.every(Number.isFinite));
assert.ok(surf.velocity.some((v,i)=>i%3===0&&Math.abs(v)>.1));
const spilling=createSurfVolume({breakerMode:'spilling',spacing:.34});
assert.ok(spilling.bathymetry&&spilling.floor(0,6)>spilling.floor(0,-6),'The spilling wave must shoal over a visible reef');

const fluid=new TankFluidSolver({spacing:.16});
const initial=fluid.diagnostics(),initialPosition=fluid.position.slice();
for(let i=0;i<180;i++)fluid.step();
const final=fluid.diagnostics();
assert.equal(final.particles,initial.particles);
assert.equal(final.volume,initial.volume,'A closed tank cannot create or discard water mass');
assert.ok(final.centerX>initial.centerX+.65,'The column must collapse into the receiving half of the tank');
assert.ok(final.maxSpeed<15,'The gravity-driven column must not explode');
assert.ok(final.maxCompression<.2,'The coarse solver must keep density error bounded');
assert.equal(final.neighborOverflow,0,'The neighbor list cannot silently truncate interactions');
assert.ok(final.kinetic+final.potential<initial.potential*1.06,'Projection must not inject material energy');
for(let i=0;i<fluid.position.length;i++) {
  const axis=i%3,p=fluid.position[i];assert.ok(Number.isFinite(p));
  assert.ok(p>=fluid.bounds[axis*2]&&p<=fluid.bounds[axis*2+1],'Water must stay inside the tank');
}
fluid.reset();assert.deepEqual(fluid.position,initialPosition);assert.ok(fluid.velocity.every(v=>v===0));assert.equal(fluid.time,0);
const repeat=new TankFluidSolver({spacing:.16});fluid.step();repeat.step();assert.deepEqual(fluid.position,repeat.position,'Replay must be deterministic');

// Exercise the actual worker meshing path without a GPU or browser.
let frame;
globalThis.self={postMessage(value){frame=value;}};
await import('../labs/water-lab/experiments/fluidWorker.js');
await self.onmessage({data:{type:'init',id:1,options:{spacing:.24}}});
assert.ok(!frame.error,frame.error);assert.ok(frame.position.length>1000);assert.equal(frame.position.length,frame.normal.length);
assert.ok(frame.position.every(Number.isFinite));assert.ok(frame.normal.every(Number.isFinite));
assert.ok(frame.index.every(i=>i<frame.position.length/3));assert.ok(frame.spray.every(Number.isFinite));
assert.ok(frame.position.length<90000*9,'The free surface must fit its declared mesh budget');
const startingMesh=frame.position.slice();
await self.onmessage({data:{type:'step',steps:10,id:2}});
assert.ok(!frame.error,frame.error);assert.notDeepEqual(frame.position,startingMesh);
await self.onmessage({data:{type:'reset',id:3}});assert.deepEqual(frame.position,startingMesh);
delete globalThis.self;
console.log('Water experiments passed: gravity/head, discharge, barrel geometry, spilling profile, closed tank mass/bounds/energy, deterministic replay, and worker surface reconstruction.');
console.log(JSON.stringify({tankTime:final.time,particleCount:final.particles,centerTravel:final.centerX-initial.centerX,maxCompression:final.maxCompression,energyRatio:(final.kinetic+final.potential)/initial.potential}));
