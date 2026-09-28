import assert from 'node:assert/strict';
import { WaterSurface } from '../src/water/waterSurface.js';
import { createWaterSettings } from '../src/water/waterSettings.js';
import { waterStageOverrides } from '../src/water/waterStageSettings.js';
import { beachBedHeight, waterLabGrid } from '../labs/water-lab/engine/waterLabEngine.js';
const grid=waterLabGrid('beach');
function make(intensity=.6) {
 const settings=createWaterSettings({preset:'coast',style:'call_me_sensei',...waterStageOverrides('beach'),waveIntensity:intensity});
 const water=new WaterSurface({width:grid.width,depth:grid.depth,...settings,bedHeight:beachBedHeight,
 simulation:false,passes:false,splashes:false,volumeDepth:0,dynamics:{mode:'coast',columns:grid.columns,rows:grid.rows,warmupSeconds:22,shorelineAxis:'z'}});
 water.position.set(grid.centerX,settings.waterLevel,grid.centerZ);return water;
}
const water=make();const d=water.dynamics;
assert.equal(water.settings.causticsStrength,1.25,'The authored Coast gain must survive its Anime colour tone');
// Exercise the same incremental pre-roll and frame update as the lab.
for(let i=0;i<88;i++)d.update(1/60);
assert.equal(d.warmupRemaining,0);
let causticPeak=0;
for(let i=0;i<d.light.length;i+=4)causticPeak=Math.max(causticPeak,d.light[i]);
assert.ok(causticPeak>0.2, `Surface ripples must resolve visible focusing: ${causticPeak}`);
let min=Infinity,max=-Infinity,previous=d.shoreEdgeAt(),advance=0,retreat=0,foam=0,offshoreFoam=0,offshoreSamples=0;
const series=[];
for(let frame=0;frame<300;frame++){
 d.update(.1);const edge=d.shoreEdgeAt();min=Math.min(min,edge);max=Math.max(max,edge);
 if(edge>previous+.003)advance++;if(edge<previous-.003)retreat++;previous=edge;
 for(let z=0;z<d.rows;z++) {
  const i=z*d.columns+Math.floor(d.columns/2),position=d.minZ+z*d.dz;
  if(position>=0)foam=Math.max(foam,d.history[i*4+2]);
  if(position<-20){offshoreFoam+=d.history[i*4+2];offshoreSamples++;}
 }
 if(frame%20===0)series.push({time:+d.time.toFixed(1),edge:+edge.toFixed(2)});
}
assert.ok(max>5,`Default beach needs visible inland run-up: ${max}`);
assert.ok(max-min>3,`Default beach must retreat as well as flood: ${max-min}`);
assert.ok(advance>10&&retreat>10,`Both phases must recur: ${advance}/${retreat}`);
assert.ok(Math.abs(d.hydro.diagnostics().massError)<1e-6);
assert.ok(max<grid.centerZ+grid.depth/2-2,'Default swash must not hit the inland grid edge');
assert.ok(foam>.15,'Advancing bores must produce visible aeration');
assert.ok(offshoreFoam/offshoreSamples<.08,'Ordinary offshore swell must not produce a foam blanket');
console.log(JSON.stringify({min,max,advance,retreat,foam,offshoreFoam:offshoreFoam/offshoreSamples,causticPeak,massError:d.hydro.diagnostics().massError,series},null,2));
const before=d.light.slice();d.update(0);assert.deepEqual(d.light,before,'Paused optics must stay registered');
water.applySettings({...water.settings,causticsStrength:0});d.update(0);assert.ok(d.light.every(v=>v===0),'Caustics zero must turn the field off');
water.dispose();
const calm=make(0);for(let i=0;i<90;i++)calm.dynamics.update(1/60);
assert.ok(calm.dynamics.shoreEdgeAt()<0,'No run-up without waves');
assert.ok(Math.abs(calm.dynamics.hydro.diagnostics().boundaryVolume)<1e-8);
calm.dispose();
console.log('Beach swash verified: default recipe advances and retreats, zero-energy beach stays at rest.');
