import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WaterHydrodynamics } from '../src/water/waterHydrodynamics.js';
import { WaterSpectralOcean, inverseFFT2D } from '../src/water/waterSpectralOcean.js';
import { WaterSurface } from '../src/water/waterSurface.js';
import { WaterDetailSpectrum } from '../src/water/waterDetailSpectrum.js';
import { WaterFoamParticles } from '../src/water/waterFoamParticles.js';
import { getWaterFoamTexture } from '../src/water/waterFoamTexture.js';
import { buildBedMesh, waterLabGrid, waterLabFishBounds, beachBedHeight, obstacleRiverBedHeight } from '../labs/water-lab/engine/waterLabEngine.js';
import { createFaunaSimulation } from '../src/fauna/boids.js';
// FFT against the closed-form transform of a conjugate frequency pair.
const real = new Float64Array(64), imag = new Float64Array(64);
real[1] = 32;
real[7] = 32;
inverseFFT2D(real, imag, 8);
for (let z = 0; z < 8; z++)
    for (let x = 0; x < 8; x++)
        assert.ok(Math.abs(real[z * 8 + x] - Math.cos(x * Math.PI / 4)) < 1e-12);
const a = new WaterSpectralOcean({ resolution: 32 }), b = new WaterSpectralOcean({ resolution: 32 });
const settings = { waveAmplitude: 0.5, waveIntensity: 1, waveLength: 20, waveDirection: [1, 0], waveDirectionSpread: 0.3 };
const detailA = new WaterDetailSpectrum(), detailB = new WaterDetailSpectrum();
for (const detail of [detailA, detailB]) {detail.configure({...settings,detailScale:1.15});detail.update(7);}
assert.deepEqual(detailA.bands.map(b=>b.data),detailB.bands.map(b=>b.data),'Short-wave phases are deterministic');
for (const band of detailA.bands) {
    const energy=band.r.map((r,i)=>(r*r+band.i[i]**2)*(band.kx[i]**2+band.kz[i]**2));
    assert.ok(energy.filter(e=>e>0).length>100,'Short waves require a broadband field');
    assert.ok(Math.max(...energy)/energy.reduce((a,b)=>a+b,0)<.1,'No single ripple may carry a tenth of the surface-detail energy');
    assert.ok(Math.max(...band.xi.map(Math.abs),...band.zi.map(Math.abs))<1e-10,'Spectral slopes must be real');
    const point=detailA.sample(band.length*.2,band.length*.4,{x:0,z:0});
    assert.ok(Number.isFinite(point.x)&&Number.isFinite(point.z));
}
const savedDetail=detailA.bands[0].data.slice();detailA.update(7);
assert.deepEqual(detailA.bands[0].data,savedDetail,'Paused detail must remain stationary');
detailA.update(7.1);assert.notDeepEqual(detailA.bands[0].data,savedDetail,'Detail evolves through wave dispersion');
detailA.dispose();detailB.dispose();
a.configure(settings);
b.configure(settings);
a.update(7);
b.update(7);
assert.deepEqual(a.bands.map(b => b.real), b.bands.map(b => b.real), 'Deterministic seeded wave fields');
for (const band of a.bands)
    assert.ok(Math.max(...band.imag.map(Math.abs)) < 1e-10, 'Hermitian spectrum produces a real height');
a.configure({ ...settings, waveIntensity: 0 });
a.update(99);
assert.equal(a.sample(1, 4), 0, 'No spectral motion without energy');
// Lake at rest over rough bathymetry including dry banks: no spurious motion.
const rest = new WaterHydrodynamics({ columns: 20, rows: 20, width: 12, depth: 12, waterLevel: 0.2, bedHeight: (x, z) => 0.15 * z + 0.2 * Math.sin(x) });
const initial = rest.h.slice();
rest.advance(2);
assert.ok(Math.max(...rest.h.map((h, i) => Math.abs(h - initial[i]))) < 1e-12);
assert.ok(Math.max(...rest.qx.map(Math.abs), ...rest.qz.map(Math.abs)) < 1e-12);
assert.ok(Math.abs(rest.diagnostics().massError) < 1e-10);
rest.impulse(0, 0, 2, 1);
rest.advance(3);
assert.ok(Math.abs(rest.diagnostics().massError) < 1e-8, 'Splash momentum must not add water');
assert.ok(rest.diagnostics().minDepth >= 0, 'No negative water column at advancing/receding shore');
// Dam break into a dry bed: genuinely transports mass and wets new cells.
const dam = new WaterHydrodynamics({ columns: 48, rows: 8, width: 24, depth: 4, waterLevel: 0, bedHeight: () => 0, friction: 0 });
for (let z = 0; z < dam.rows; z++)
    for (let x = 0; x < 16; x++)
        dam.h[z * dam.columns + x] = 1;
dam.initialVolume = dam.volume();
dam.advance(2);
assert.ok(dam.h[4 * dam.columns + 23] > 0.01, 'Wet front must propagate');
assert.ok(Math.abs(dam.diagnostics().massError) < 1e-8, 'Closed-domain dam break must conserve mass');
assert.ok(dam.diagnostics().roundoffVolume < 1e-8, 'Positivity must not rely on injecting clamped water');
// A moving wet/dry front must carry its aeration instead of interpolating
// dry zero-concentration samples into newly arrived water.
const aerated = new WaterHydrodynamics({columns:40,rows:6,width:12,depth:2,waterLevel:0,bedHeight:()=>0,friction:0});
for(let z=0;z<aerated.rows;z++)for(let x=0;x<12;x++){
 const i=z*aerated.columns+x;aerated.h[i]=.3;aerated.qx[i]=.3;aerated.foam[i]=.6;
}
aerated.foamLifetime=1e9;aerated.initialVolume=aerated.volume();aerated.advance(.8);
let wetted=0;
for(let x=12;x<aerated.columns;x++){
 const i=3*aerated.columns+x;
 if(aerated.h[i]>.003){wetted++;assert.ok(aerated.foam[i]>.58,'Foam must reach each newly wetted front cell');}
}
assert.ok(wetted>3,'The foam test must actually advance into dry ground');
// An impermeable island diverts water; no cross-island flux leaks through it.
const island = new WaterHydrodynamics({ columns: 24, rows: 16, width: 12, depth: 8, waterLevel: 0, bedHeight: (x, z) => Math.abs(x) < 1 && Math.abs(z) < 1 ? 2 : -1 });
for (let i = 0; i < island.length; i++)
    island.qx[i] = island.h[i] * 0.7;
island.advance(1);
for (let i = 0; i < island.length; i++)
    if (island.bed[i] > 0)
        assert.equal(island.h[i], 0);
assert.ok(Math.abs(island.diagnostics().massError) < 1e-8);
// CPU queries interpolate the rendered triangle, including non-planar quads.
const surface = new WaterSurface({ width: 12, depth: 12, bedHeight: () => -2, simulation: false, passes: false, splashes: false, volumeDepth: 0,
    dynamics: { mode: 'tank', columns: 12, rows: 12 } });
surface.dynamics.update(0);
const d = surface.dynamics, i = 4 * 12 + 4;
d.state[i * 4] = 1;
d.state[(i + 1) * 4] = 2;
d.state[(i + 12) * 4] = 4;
d.state[(i + 13) * 4] = 8;
assert.ok(Math.abs(d.sample(d.minX + (4.2) * d.dx, d.minZ + (4.3) * d.dz).height - (1 * 0.5 + 2 * 0.2 + 4 * 0.3)) < 1e-12);
assert.ok(Math.abs(d.sample(d.minX + 4.8 * d.dx, d.minZ + 4.7 * d.dz).height - (8 * 0.5 + 4 * 0.2 + 2 * 0.3)) < 1e-12);
const volume = surface.dynamics.hydro.volume();
surface.addRipple({ x: 0, z: 0 }, { strength: 1 });
surface.dynamics.update(0.1);
assert.ok(Math.abs(surface.dynamics.hydro.volume() - volume) < 1e-8);
surface.prepareDynamics(1 / 60);
const preparedTime = surface.dynamics.time;
surface.update({ getDrawingBufferSize: out => out.set(640, 480), coordinateSystem: THREE.WebGPUCoordinateSystem }, new THREE.Scene(), new THREE.PerspectiveCamera(), 1 / 60);
assert.equal(surface.dynamics.time, preparedTime, 'Preparing contacts and rendering must not advance water twice');
const frozen = surface.dynamics.state.slice();
surface.dynamics.reference = true;
surface.dynamics.update(0);
assert.deepEqual(surface.dynamics.state, frozen, 'Switching appearance must not change motion');
surface.dispose();
for (const intensity of [0, 0.5, 1]) {
    const sea = new WaterSurface({ width: 48, depth: 48, waveAmplitude: 5, waveIntensity: intensity, waveLength: 1, bedHeight: () => -8,
        simulation: false, passes: false, splashes: false, volumeDepth: 0, dynamics: { mode: 'spectral', columns: 32, rows: 32 } });
    for (let frame = 0; frame < 5; frame++)
        sea.dynamics.update(1 / 30);
    assert.ok(sea.dynamics.state.every(Number.isFinite), 'Extreme sea state stays finite');
    for (let i = 0; i < sea.dynamics.state.length; i += 4)
        assert.ok(sea.dynamics.state[i + 1] >= 0, 'Spectral water never enters the bed');
    const before = sea.dynamics.state.slice();
    sea.dynamics.paused = true;
    sea.dynamics.update(1);
    assert.deepEqual(sea.dynamics.state, before, 'Pause freezes geometry');
    sea.dispose();
}
// A passive foam patch must travel downstream, independently of noise scale.
const tracerSea = new WaterSurface({width:12,depth:12,waveAmplitude:0,waveIntensity:0,flowDirection:[1,0],flowSpeed:1,
  bedHeight:()=>-2,simulation:false,passes:false,splashes:false,volumeDepth:0,dynamics:{mode:'spectral',columns:12,rows:12}});
tracerSea.dynamics.update(0);
const td=tracerSea.dynamics;
td.history[(5*12+5)*4+2]=1;
const centroid=()=>{let sum=0,weighted=0;for(let i=0;i<144;i++){const f=td.history[i*4+2];sum+=f;weighted+=f*(td.minX+(i%12)*td.dx);}return weighted/sum;};
const xBefore=centroid();td.update(0.1);
assert.ok(Math.abs(centroid()-xBefore-0.1)<1e-6,'Foam moves at the declared current speed');
tracerSea.dispose();

// The displayed terrain uses identical coordinates/diagonals to the water.
const grid=waterLabGrid('river-obstacle');
const bedMesh=buildBedMesh(0.36,obstacleRiverBedHeight,new THREE.MeshBasicMaterial(),grid);
const positions=bedMesh.geometry.attributes.position;
for(let z=0;z<grid.rows;z++)for(let x=0;x<grid.columns;x++) {
  const i=(z+3)*(grid.columns+6)+x+3;
  const wx=grid.centerX-grid.width/2+x*grid.width/(grid.columns-1);
  const wz=grid.centerZ-grid.depth/2+z*grid.depth/(grid.rows-1);
  assert.ok(Math.abs(positions.getX(i)-wx)<1e-5 && Math.abs(positions.getZ(i)-wz)<1e-5);
  assert.ok(Math.abs(positions.getY(i)-obstacleRiverBedHeight(wx,wz))<1e-5);
}
bedMesh.geometry.dispose();bedMesh.material.dispose();
const opticalTank = new WaterSurface({width:16,depth:16,bedHeight:()=>-2,waterLevel:0,
 simulation:false,passes:false,splashes:false,volumeDepth:0,
 dynamics:{mode:'tank',columns:8,rows:8},causticsStrength:1});
opticalTank.dynamics.update(0);
let flatFocusing=0;
for(let i=0;i<opticalTank.dynamics.light.length;i+=4)flatFocusing=Math.max(flatFocusing,opticalTank.dynamics.light[i]);
assert.ok(flatFocusing<1e-5,'A flat interface must not invent caustic focusing');
opticalTank.dispose();
const dryCoast = new WaterSurface({width:8,depth:8,bedHeight:()=>1,waterLevel:0,
 simulation:false,passes:false,splashes:false,volumeDepth:0,
 dynamics:{mode:'coast',columns:8,rows:8},waveIntensity:1,waveAmplitude:3});
dryCoast.dynamics.update(.1);
assert.ok(dryCoast.dynamics.hydro.h.every(h=>h===0),'A dry incoming boundary cannot inject water or NaN');
dryCoast.dispose();
const extended = new WaterSurface({width:12,depth:12,bedHeight:(x,z)=>-.5+.08*z,waterLevel:0,
 simulation:false,passes:false,splashes:false,volumeDepth:0,
 dynamics:{mode:'coast',columns:9,rows:13,renderExtent:600},causticsStrength:0});
for (const dt of [0,.1,.1]) {
 extended.dynamics.update(dt);
 const d=extended.dynamics,e=d.renderExtension,nx=e.xs.length;
 assert.ok(e.xs.at(-1)-e.xs[0]>600&&e.zs.at(-1)-e.zs[0]>600,'Context must extend well beyond the solver');
 for(let z=0;z<d.rows;z++)for(let x=0;x<d.columns;x++) {
  if(x!==0&&z!==0&&x!==d.columns-1&&z!==d.rows-1)continue;
  const original=z*d.columns+x,outer=(z+8)*nx+x+8;
  assert.deepEqual(e.states.slice(outer*4,outer*4+4),d.state.slice(original*4,original*4+4),'Boundary heights and depths must match exactly');
  assert.deepEqual(e.normals.slice(outer*3,outer*3+3),d.normals.slice(original*3,original*3+3),'Boundary reflections must match exactly');
 }
 assert.ok(e.states.every(Number.isFinite));
 for(let i=1;i<e.states.length;i+=4)assert.ok(e.states[i]>=0);
 const ids=e.geometry.index.array;
 for(let i=0;i<ids.length;i+=3) {
  const xs=[ids[i]%nx,ids[i+1]%nx,ids[i+2]%nx];
  const zs=[Math.floor(ids[i]/nx),Math.floor(ids[i+1]/nx),Math.floor(ids[i+2]/nx)];
  assert.ok(!(Math.min(...xs)>=8&&Math.max(...xs)<8+d.columns&&Math.min(...zs)>=8&&Math.max(...zs)<8+d.rows),'Continuation cannot overlap solved triangles');
 }
}
const outerMesh=extended.dynamics.renderExtension.mesh;extended.dispose();assert.equal(outerMesh.parent,null);
// An oblique planar shore has a straight wet contour, independent of which
// diagonal each wet/dry cell uses. Clipping interpolated nonnegative depths
// instead produces the visible sawtooth reported in the close-up.
const contourWater=new WaterSurface({width:6,depth:6,waterLevel:.08,bedHeight:(x,z)=>.08*(z-.12*x),
 simulation:false,passes:false,splashes:false,volumeDepth:0,
 dynamics:{mode:'coast',columns:5,rows:13,shorelineAxis:'z'},causticsStrength:0});
contourWater.position.y=.08;contourWater.dynamics.update(0);
const cd=contourWater.dynamics;
for(let x=0;x<cd.columns;x++) {
 const wx=cd.minX+x*cd.dx,expected=1+.12*wx-.002/.08;
 assert.ok(Math.abs(cd.shoreContour[x]-expected)<1e-5,'Planar shoreline contour must remain straight');
 assert.equal(cd.sample(wx,expected-.01).wet,true);
 assert.equal(cd.sample(wx,expected+.01).wet,false);
}
// Material coordinates move at flow speed, rather than periodically
// resetting or stretching by velocity times an ever-growing phase.
cd.history.fill(.5);
for(let i=0;i<cd.state.length;i+=4){cd.state[i+2]=.7;cd.state[i+3]=-.2;}
const centre=(6*cd.columns+2)*4,beforeCoords=cd.foamCoordinates.slice(centre,centre+2);
cd.updateFoamCoordinates(.1);
assert.ok(Math.abs(cd.foamCoordinates[centre]-(beforeCoords[0]-.07))<1e-5);
assert.ok(Math.abs(cd.foamCoordinates[centre+1]-(beforeCoords[1]+.02))<1e-5);
const pausedCoordinates=cd.foamCoordinates.slice();cd.updateFoamCoordinates(0);
assert.deepEqual(cd.foamCoordinates,pausedCoordinates);
contourWater.dispose();
const foamWater=new WaterSurface({width:32,depth:24,bedHeight:()=>-.05,simulation:false,passes:false,splashes:false,
 volumeDepth:0,dynamics:{mode:'coast',columns:12,rows:12},causticsStrength:0});
const fd=foamWater.dynamics;fd.update(0);
const particles=new WaterFoamParticles(fd,128);
particles.update(.1);assert.equal(particles.alive,0,'Clear water must not emit foam particles');
fd.hydro.foam.fill(.5);particles.update(.1);particles.update(.1);
assert.ok(particles.alive>100&&particles.alpha.some(a=>a>0),'Aerated surface must emit visible clusters');
const frozenParticles=particles.points.slice();particles.update(0);assert.deepEqual(particles.points,frozenParticles,'Pause freezes foam particles');
for(let i=0;i<fd.state.length;i+=4){fd.state[i+2]=.4;fd.state[i+3]=.1;}
const px=particles.points[0],pz=particles.points[1];particles.update(.1);
assert.ok(Math.abs(particles.points[0]-px-.04)<1e-5&&Math.abs(particles.points[1]-pz-.01)<1e-5,'Particles follow the solved current');
const matrix=particles.mesh.instanceMatrix.array;
assert.ok(Math.abs(matrix[13]-(fd.sample(particles.points[0],particles.points[1]).height-fd.level+.0015))<1e-6,'Foam stays on the surface');
fd.hydro.foam.fill(0);particles.update(.1);assert.equal(particles.alive,0);
particles.dispose();foamWater.dispose();
// Fresh foam follows the oblique shoreline, not a uniformly populated
// rectangle behind a single centreline edge.
const rimWater=new WaterSurface({width:32,depth:24,bedHeight:(x,z)=>.05*(z-.15*x),
 simulation:false,passes:false,splashes:false,volumeDepth:0,causticsStrength:0,
 dynamics:{mode:'coast',columns:12,rows:49,shorelineAxis:'z'}});
rimWater.dynamics.update(0);rimWater.dynamics.hydro.foam.fill(.5);
const rimParticles=new WaterFoamParticles(rimWater.dynamics,2048);rimParticles.update(.2);
let frontCount=0,emittedCount=0,trailCount=0,farTrailCount=0;
for(let i=0;i<rimParticles.count;i++) {
 const j=i*6;if(rimParticles.points[j+2]<0)continue;
 const distance=rimParticles.edgeAt(rimParticles.points[j])-rimParticles.points[j+1];
 assert.ok(distance>=0&&distance<3.2,'Foam must occupy the wet sheet without crossing onto dry sand');
 if(distance<.35)frontCount++;
 if(distance>.55)trailCount++;
 if(distance>1.2)farTrailCount++;
 emittedCount++;
}
assert.ok(emittedCount>600&&frontCount/emittedCount>.4&&frontCount/emittedCount<.8,'Keep a strong rim without collapsing all foam into a narrow stripe');
assert.ok(trailCount/emittedCount>.18&&farTrailCount/emittedCount>.03,`The sheet needs substantial trails behind the lip: ${trailCount}/${emittedCount}, far ${farTrailCount}`);
assert.ok(Math.max(...rimParticles.thickness)>.015,'Aerated rim clusters must have centimetre-scale thickness');
assert.ok(rimParticles.mesh.geometry.attributes.position.count>4,'Foam volume must come from a curved mesh rather than flat cards');
const foamGeometry=rimParticles.mesh.geometry.attributes.position;
let crown=0,base=Infinity;
for(let i=0;i<foamGeometry.count;i++){crown=Math.max(crown,foamGeometry.getY(i));base=Math.min(base,foamGeometry.getY(i));}
assert.ok(crown>.9&&Math.abs(base)<1e-6,'Foam caps rise above their contact base');
const laceImage=getWaterFoamTexture().image,nlace=laceImage.width,visited=new Uint8Array(nlace*nlace);
let occupied=0,largest=0;
for(let i=0;i<visited.length;i++)if(laceImage.data[i*4+3]>128)occupied++;
for(let i=0;i<visited.length;i++) {
 if(visited[i]||laceImage.data[i*4+3]<=128)continue;
 const queue=[i];visited[i]=1;
 for(let q=0;q<queue.length;q++) {
  const index=queue[q],x=index%nlace,y=Math.floor(index/nlace);
  for(const next of [y*nlace+(x+1)%nlace,y*nlace+(x+nlace-1)%nlace,((y+1)%nlace)*nlace+x,((y+nlace-1)%nlace)*nlace+x]) {
   if(!visited[next]&&laceImage.data[next*4+3]>128){visited[next]=1;queue.push(next);}
  }
 }
 largest=Math.max(largest,queue.length);
}
assert.ok(occupied/visited.length>.07&&occupied/visited.length<.3,'Lace must leave substantial clear-water pockets');
assert.ok(largest/occupied>.9,'Foam strands must form a connected network rather than separate dots');
for(let i=0;i<rimWater.dynamics.state.length;i+=4)rimWater.dynamics.state[i+3]=-.5;
let trailingIndex=-1;
for(let i=0;i<rimParticles.count;i++) {
 const j=i*6;
 if(rimParticles.points[j+2]>=0&&rimParticles.edgeAt(rimParticles.points[j])-rimParticles.points[j+1]>.4){trailingIndex=i;break;}
}
assert.ok(trailingIndex>=0);
const firstZ=rimParticles.points[trailingIndex*6+1];rimParticles.update(.1);
assert.ok(rimParticles.points[trailingIndex*6+1]<firstZ-.049,'Older foam must trail with backwash instead of snapping onto the edge');
let rimIndex=-1;
for(let i=0;i<rimParticles.count;i++) {
 const j=i*6,distance=rimParticles.edgeAt(rimParticles.points[j])-rimParticles.points[j+1];
 if(rimParticles.points[j+2]>=0&&distance>.02&&distance<.14&&Math.abs(rimParticles.points[j])<6){rimIndex=i;break;}
}
assert.ok(rimIndex>=0);
const rimZ=rimParticles.points[rimIndex*6+1];
for(let i=0;i<rimWater.dynamics.shoreContour.length;i++)rimWater.dynamics.shoreContour[i]-=.12;
rimWater.dynamics.hydro.foam.fill(.001);
rimParticles.update(.2);
assert.ok(Math.abs(rimParticles.points[rimIndex*6+1]-(rimZ-.12))<1e-5,'Near-edge foam follows a receding contact line');
assert.ok(rimParticles.alpha[rimIndex]>0&&rimParticles.alpha[rimIndex]<=.401,'Return foam remains visible but thinner');
assert.ok(rimParticles.sampleFront(0,2)>.4&&rimParticles.sampleFront(0,2)<.5,'Retreat remembers and decays existing foam');
const remembered=rimParticles.frontState.slice();rimParticles.update(0);
assert.deepEqual(rimParticles.frontState,remembered,'Pausing also freezes edge history');
rimParticles.dispose();rimWater.dispose();
const beachSchool=createFaunaSimulation({bounds:waterLabFishBounds('beach'),heightAt:beachBedHeight,
 waterLevel:.36,seed:7,species:{fish:40,birds:0,butterflies:0,dragonflies:0}});
for(let i=0;i<150;i++)beachSchool.update(1/30);
const initialHeadings=beachSchool.species.fish.arrays.heading.slice();
for(let i=0;i<750;i++)beachSchool.update(1/30);
const school=beachSchool.species.fish.arrays;
assert.equal(beachSchool.species.fish.count,40);
assert.ok([...school.pz].filter(z=>Math.abs(z-beachSchool.bounds.minZ)<.05).length<4,'The school must not collect in a line on the offshore boundary');
const turns=[...school.heading].filter((heading,i)=>Math.abs(Math.atan2(Math.sin(heading-initialHeadings[i]),Math.cos(heading-initialHeadings[i])))>.2).length;
assert.ok(turns>20,'Fish must have room to change heading');
console.log('Water dynamics passed: FFT analytic solution, deterministic real spectrum, lake at rest, wet/dry dam break, mass-neutral impulses, impermeable island, and exact triangle contacts.');
