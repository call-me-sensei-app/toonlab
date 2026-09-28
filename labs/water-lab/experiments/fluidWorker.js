import { GpuFluidSolver } from './gpuFluidSolver.js';
import { TankFluidSolver } from './fluidSolver.js';
import { createSurfVolume, FluidVolumeMesher } from './fluidVolume.js';

let solver,mesher,gpu=null,generation=0,backend='CPU',duration=4;
function reconstruct() {
  const mesh=mesher.update();return {...mesh,stats:{...solver.diagnostics(),backend,duration,opening:mesh.opening??null,foamMean:solver.foam.reduce((a,b)=>a+b,0)/solver.count}};
}
function publish(frame,meta={},packed=false) {
  if(packed) {
    frame.spray=Int16Array.from(frame.spray,v=>Math.round(v*1000));
    frame.position=Int16Array.from(frame.position,v=>Math.round(v*1000));
    frame.normal=Int16Array.from(frame.normal,v=>Math.round(Math.max(-1,Math.min(1,v))*32767));
    frame.foam=Uint8Array.from(frame.foam,v=>Math.round(Math.max(0,Math.min(1,v))*255));
  }
  self.postMessage({...frame,...meta,packed},[frame.position.buffer,frame.normal.buffer,frame.foam.buffer,frame.index.buffer,frame.spray.buffer]);
}
self.onmessage=async({data})=>{
  try {
    if(data.type==='init') {
      const token=++generation;
      gpu?.dispose();gpu=null;backend='CPU';
      solver=data.options?.kind==='surf'?createSurfVolume(data.options):new TankFluidSolver({...data.options,spacing:data.options?.spacing??(data.options?.fluidQuality==='standard'?.12:.075),iterations:data.options?.fluidQuality==='standard'?4:5});
      if(data.options?.prepared){gpu=await GpuFluidSolver.create(solver);backend=gpu?'WebGPU':'CPU';}
      duration=data.options?.kind==='surf'?3:4;
      mesher=new FluidVolumeMesher(solver,solver.isSurfVolume?104:solver.spacing<.1?128:112);
      const cached=Boolean(data.options?.prepared);
      publish(reconstruct(),{id:data.id,frameIndex:0,progress:cached?0:1,complete:!cached},cached);
      if(cached) {
        let index=0;const frameCount=duration*60;
        const bake=async()=>{
          if(token!==generation)return;
          try {
            if(gpu)await gpu.advance(2);else{solver.step();solver.step();}index++;
            publish(reconstruct(),{frameIndex:index,progress:index/frameCount,complete:index===frameCount},true);
            if(index<frameCount)setTimeout(bake,0);else{gpu?.dispose();gpu=null;}
          } catch(error){gpu?.dispose();gpu=null;self.postMessage({error:error.message});}
        };
        setTimeout(bake,0);
      }
      return;
    }
    if(data.type==='reset'){generation++;solver.reset();}
    else if(data.type==='step')for(let i=0;i<data.steps;i++)solver.step();
    publish(reconstruct(),{id:data.id});
  } catch(error){self.postMessage({error:error.message,id:data.id});}
};
