import { CatmullRomCurve3, Vector3 } from 'three';
import { TankFluidSolver } from './fluidSolver.js';

// Authored incipient plunging crest. This is an initial water volume and
// velocity field, not a mesh animation: pressure and gravity advance every
// particle after release. The forward lip descends while the rear face rises.
export function createPlungingSurfVolume(options={}) {
  const spacing=options.spacing??.22,level=2.8,height=options.waveHeight??3,points=[],velocity=[];
  const interfacePoints=[[20,0],[5,0],[3.4,-.05],[1.4,0],[.5,.28],[-.05,.85],[-.15,1.5],[.1,2.05],[.6,2.42],[1.25,2.5],[1.85,2.28],[2.2,1.9],[2.2,1.35],[2.55,1.15],[2.8,1.8],[2.65,2.45],[2.05,2.95],[1.25,3.2],[.45,3.1],[-.4,2.75],[-1.3,2.1],[-2.7,1.2],[-4.4,.35],[-6.5,.03],[-20,0]];
  const curve=new CatmullRomCurve3(interfacePoints.map(([z,y])=>new Vector3(z,y,0)),false,'centripetal');
  const shape=[[-20,-level],[20,-level],...curve.getPoints(220).map(p=>[p.x,p.y*height/3.2])];
  for(let x=-6+spacing/2;x<6;x+=spacing)for(let z=-8+spacing/2;z<14;z+=spacing){
    const taper=Math.min(1,Math.max(.1,(6-Math.abs(x))/1.4)),localZ=z-x*.1-.1*Math.sin(x*.73),cuts=[];
    for(let a=0;a<shape.length;a++){
      const p=shape[a],q=shape[(a+1)%shape.length];
      if((p[0]<=localZ&&q[0]>localZ)||(q[0]<=localZ&&p[0]>localZ)){
        const y=p[1]+(q[1]-p[1])*(localZ-p[0])/(q[0]-p[0]);
        const lipWeight=Math.exp(-(((localZ-2.5)/.5)**2))*Math.max(0,Math.min(1,(y-.5)/.6))*Math.max(0,Math.min(1,(height*.9-y)/(height*.2)));
        cuts.push(y>0?y*taper*(.97+.03*Math.cos(x*.7))+.08*x*lipWeight:y);
      }
    }
    cuts.sort((a,b)=>a-b);
    for(let k=0;k<cuts.length-1;k+=2){
      const first=Math.ceil((cuts[k]+level-spacing/2)/spacing)*spacing+spacing/2;
      for(let y=first;y<cuts[k+1]+level;y+=spacing){
        const relative=y-level,gate=Math.exp(-((localZ/4)**2))*taper,upper=Math.max(0,Math.min(1,relative/(height*.5)));
        const rotation=1.4*Math.sqrt(3/height),translation=2.4*Math.sqrt(height/3);
        points.push(x,y,z);
        velocity.push(.15*gate,-rotation*(localZ-1.1)*upper*gate,(translation+rotation*Math.max(0,relative-height/3))*gate);
      }
    }
  }
  const solver=new TankFluidSolver({spacing,points,velocity,bounds:[-6,6,0,8,-8,14],iterations:5});
  solver.waterLevel=level;solver.waveHeight=height;solver.isSurfVolume=true;solver.waveModel='incipient plunging crest';
  // The crest already carries entrained whitewater at the beginning of this
  // plunging phase. That concentration then travels with the solver particles.
  for(let i=0;i<solver.count;i++){
    const x=solver.position[i*3],y=solver.position[i*3+1]-level,z=solver.position[i*3+2]-x*.1;
    const lip=Math.exp(-(((z-2.45)/.45)**2))*Math.max(0,Math.min(1,(y-height*.3)/(height*.22)));
    solver.foam[i]=lip*.48;
  }
  solver.initialFoam=solver.foam.slice();return solver;
}
