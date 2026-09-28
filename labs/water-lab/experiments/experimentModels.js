// Repository-only initial conditions and analytic waterfall flow.
// Waterfall flow uses ballistic flight and continuity q = area * speed.
export const EXPERIMENT_STAGES = [
  {id:'barrel',label:'Surf · 3 m barrel & breaking wave'},
  {id:'waterfall',label:'Waterfall · plunge pool'},
  {id:'glass-box',label:'Glass box · collapsing water'},
];
export const isWaterExperiment = id => EXPERIMENT_STAGES.some(s => s.id === id);
export const GRAVITY = 9.81;
export const EXPERIMENT_DEFAULTS = Object.freeze({fluidQuality:'high',lighting:'cinematic',exposure:.92,mistAmount:1,foamAmount:1,aeration:.92,mistWind:.35,impactRocks:true,midLedge:true,timeScale:1,breakerMode:'barrel',waveHeight:3,surfer:true,height:10,fallWidth:6,discharge:3.6,speed:1.8,columnHeight:3.1,columnWidth:2.45});
export const EXPERIMENT_RANGES = Object.freeze({mistAmount:[0,2],foamAmount:[0,2],aeration:[0,1],mistWind:[-1.5,1.5],exposure:[.3,2],timeScale:[.1,1],waveHeight:[1.5,4],height:[2,16],fallWidth:[2,10],discharge:[.6,10],speed:[.5,3],columnHeight:[1,4],columnWidth:[1,4]});
export function normalizeExperimentSettings(input={}) {
  const result={...EXPERIMENT_DEFAULTS};
  if(!input||typeof input!=='object')return result;
  for(const [key,[min,max]] of Object.entries(EXPERIMENT_RANGES))if(Number.isFinite(input[key]))result[key]=Math.max(min,Math.min(max,input[key]));
  if(['barrel','spilling'].includes(input.breakerMode))result.breakerMode=input.breakerMode;
  if(['standard','high'].includes(input.fluidQuality))result.fluidQuality=input.fluidQuality;
  if(['cinematic','neutral'].includes(input.lighting))result.lighting=input.lighting;
  if(typeof input.midLedge==='boolean')result.midLedge=input.midLedge;
  if(typeof input.impactRocks==='boolean')result.impactRocks=input.impactRocks;
  if(typeof input.surfer==='boolean')result.surfer=input.surfer;
  return result;
}
export function waterfallPoint(flight, widthFraction, time, {height=5, speed=1.8, discharge=1.8, width=3}={}) {
  const velocity = Math.hypot(speed,GRAVITY*flight);
  const thickness = discharge/(width*velocity);
  // Material ripples travel with the flight time, not upward against gravity.
  const ripple = .012*Math.sin(widthFraction*29+(time-flight)*7)+.009*Math.sin(widthFraction*53-(time-flight)*11);
  return {x:widthFraction*width/2,y:height-.5*GRAVITY*flight*flight,z:-2+speed*flight+ripple,
    thickness,velocity,flight,impactTime:Math.sqrt(2*height/GRAVITY)};
}

export function ballisticParticle(origin, velocity, age) {
  return [origin[0]+velocity[0]*age,origin[1]+velocity[1]*age-.5*GRAVITY*age*age,origin[2]+velocity[2]*age];
}
