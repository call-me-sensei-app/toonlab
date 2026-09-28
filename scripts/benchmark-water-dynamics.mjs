// CPU field-update costs only: excludes GPU shading, assets and compositor.
import { WaterSurface } from '../src/water/waterSurface.js';
import { beachBedHeight, obstacleRiverBedHeight } from '../labs/water-lab/engine/waterLabEngine.js';
const cases = [
  {name:'spectral-ocean',mode:'spectral',preset:'ocean',width:180,columns:128,bed:()=>-8},
  {name:'conservative-beach',mode:'coast',preset:'coast',width:96,columns:80,bed:beachBedHeight},
  {name:'river-island',mode:'river',preset:'river',width:96,columns:80,bed:obstacleRiverBedHeight},
];
const results=[];
for(const test of cases){
  const water=new WaterSurface({width:test.width,depth:test.width,preset:test.preset,simulation:false,passes:false,splashes:false,volumeDepth:0,
    bedHeight:test.bed,dynamics:{mode:test.mode,columns:test.columns,rows:96,spectralResolution:32}});
  water.position.set(0,0.36,-20);
  for(let i=0;i<20;i++)water.dynamics.update(1/60);
  const samples=[];
  for(let i=0;i<120;i++){const start=performance.now();water.dynamics.update(1/60);samples.push(performance.now()-start);}
  samples.sort((a,b)=>a-b);
  results.push({case:test.name,columns:test.columns,rows:96,medianMs:samples[60],p95Ms:samples[114],diagnostics:water.dynamics.diagnostics()});
  water.dispose();
}
console.log(JSON.stringify({date:'2026-09-05',scope:'CPU field-update timings; excludes rendering',node:process.version,platform:process.platform,arch:process.arch,results},null,2));
