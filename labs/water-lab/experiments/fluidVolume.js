import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';
import { createPlungingSurfVolume } from './plungingWave.js';
import { TankFluidSolver } from './fluidSolver.js';

export function createSurfVolume(options={}) {
  if(options.breakerMode!=='spilling')return createPlungingSurfVolume(options);
  const spacing=options.spacing??.22,level=2.8,height=options.waveHeight??3,points=[],velocity=[];
  const spilling=options.breakerMode==='spilling';
  const bathymetry={start:spilling?-2:-.7,slope:spilling?.16:.55,rise:1.75,peel:.5};
  const speed=Math.sqrt(9.81*(level+height)),k=.43;
  for(let x=-6+spacing/2;x<6;x+=spacing)for(let z=-8+spacing/2;z<10;z+=spacing){
    const taper=Math.min(1,Math.max(0,(6-Math.abs(x))/1.25));
    const shift=x*.1,distance=z+(spilling?2.5:1.2)-shift,phase=k*distance,sech=1/Math.cosh(phase);
    const faceWidth=distance>0?.75:3.2;
    const eta=height*(spilling?sech*sech:Math.exp(-((distance/faceWidth)**2)))*taper,top=level+eta;
    const floor=Math.max(0,Math.min(bathymetry.rise,(z-bathymetry.start-x*bathymetry.peel)*bathymetry.slope));
    const slope=spilling?-2*k*eta*Math.tanh(phase):-2*distance/(faceWidth*faceWidth)*eta;
    for(let y=floor+spacing/2;y<top;y+=spacing){
      const relative=(y-floor)/(top-floor),crest=Math.max(0,(y-level)/height);
      const u=speed*eta/(level+eta)*(spilling?.8+.42*relative*relative:.9+.25*relative*relative)+(spilling?0:crest**3*4);
      points.push(x,y,z);velocity.push(u*.035,(u-speed)*slope*relative*(spilling?.65:.22)+(spilling?0:crest*2),u);
    }
  }
  const solver=new TankFluidSolver({spacing,points,velocity,bounds:[-6,6,0,8,-8,10],iterations:5,bathymetry});
  solver.waterLevel=level;solver.waveHeight=height;solver.isSurfVolume=true;
  return solver;
}

export class FluidVolumeMesher {
  constructor(solver,resolution=88) {
    this.solver=solver;this.n=resolution;
    this.min=[solver.bounds[0]-.5,solver.bounds[2]-.5,solver.bounds[4]-.5];
    this.extent=[0,1,2].map(a=>solver.bounds[a*2+1]-solver.bounds[a*2]+1);
    this.cell=this.extent.map(e=>e/resolution);
    this.surface=new MarchingCubes(resolution,{flatShading:false},false,false,resolution>112?300000:170000);
    this.surface.isolation=.48;this.scratch=new Float32Array(resolution**3);
    this.foamField=new Float32Array(resolution**3);
  }
  splat(px,py,pz,foam=0,nx=0,ny=0,nz=0,anisotropic=false) {
    const {n,cell,min,surface,solver}=this;
    const gx=(px-min[0])/cell[0],gy=(py-min[1])/cell[1],gz=(pz-min[2])/cell[2],h2=solver.h*solver.h,tangent=anisotropic?1.2:1,normal=anisotropic?.75:1,reach=solver.h*tangent,reach2=reach*reach;
    const z0=Math.max(1,Math.ceil(gz-reach/cell[2])),z1=Math.min(n-2,Math.floor(gz+reach/cell[2]));
    const coefficient=solver.poly/(solver.restDensity*tangent*tangent*normal);
    for(let z=z0;z<=z1;z++) {
      const dz=(z-gz)*cell[2],remainingY=reach2-dz*dz;if(remainingY<=0)continue;
      const ry=Math.sqrt(remainingY)/cell[1],y0=Math.max(1,Math.ceil(gy-ry)),y1=Math.min(n-2,Math.floor(gy+ry));
      for(let y=y0;y<=y1;y++) {
        const dy=(y-gy)*cell[1],remainingX=remainingY-dy*dy;if(remainingX<=0)continue;
        const rx=Math.sqrt(remainingX)/cell[0],x0=Math.max(1,Math.ceil(gx-rx)),x1=Math.min(n-2,Math.floor(gx+rx));
        let index=(z*n+y)*n+x0;
        for(let x=x0;x<=x1;x++,index++) {
          const dx=(x-gx)*cell[0],along=dx*nx+dy*ny+dz*nz;
          const r2=(dx*dx+dy*dy+dz*dz)/(tangent*tangent)+along*along*(1/(normal*normal)-1/(tangent*tangent));
          const q=Math.max(0,h2-r2),w=coefficient*q*q*q;
          surface.field[index]+=w;this.foamField[index]+=w*foam;
        }
      }
    }
  }
  update() {
    const {solver,surface,n,cell,min}=this,p=solver.position,b=solver.bounds;
    surface.reset();this.foamField.fill(0);solver.findNeighbors();const spray=[];
    for(let i=0;i<solver.count;i++){
      const k=i*3;let x=p[k],y=p[k+1],z=p[k+2];
      const neighbors=solver.neighborCounts[i],offset=i*solver.maxNeighbors;
      const solidDistance=Math.min(x-b[0],b[1]-x,y-solver.floor(x,z),z-b[4],b[5]-z);
      if(neighbors<7&&solver.time>0&&solidDistance>solver.spacing*1.1){if(Math.hypot(solver.velocity[k],solver.velocity[k+1],solver.velocity[k+2])>1.2)spray.push(x,y-(solver.isSurfVolume?solver.waterLevel:0),z);continue;}
      let mx=0,my=0,mz=0,total=0;
      for(let q=0;q<neighbors;q++){const j=solver.neighbors[offset+q]*3,d2=(x-p[j])**2+(y-p[j+1])**2+(z-p[j+2])**2,w=solver.kernel(d2);mx+=p[j]*w;my+=p[j+1]*w;mz+=p[j+2]*w;total+=w;}
      const floor=solver.floor(x,z);
      const wall=Math.min(x-b[0],b[1]-x,y-floor,z-b[4],b[5]-z);
      let nx=0,ny=0,nz=0,anisotropic=false;
      if(total>0&&wall>solver.h&&neighbors>=10){
        mx/=total;my/=total;mz/=total;nx=x-mx;ny=y-my;nz=z-mz;const length=Math.hypot(nx,ny,nz);
        if(length>solver.spacing*.08){nx/=length;ny/=length;nz/=length;anisotropic=true;x=x*.75+mx*.25;y=y*.75+my*.25;z=z*.75+mz*.25;}
      }
      const xs=[x],ys=[y],zs=[z];
      // Boundary support keeps stationary tank-contact surfaces flat.
      if(x-b[0]<solver.h)xs.push(2*b[0]-x);if(b[1]-x<solver.h)xs.push(2*b[1]-x);
      if(y-floor<solver.h)ys.push(2*floor-y);
      if(z-b[4]<solver.h)zs.push(2*b[4]-z);if(b[5]-z<solver.h)zs.push(2*b[5]-z);
      for(const xx of xs)for(const yy of ys)for(const zz of zs)this.splat(xx,yy,zz,solver.foam[i],nx,ny,nz,anisotropic);
    }
    // Smooth sub-particle reconstruction noise, then impose exact solid walls.
    const f=surface.field,tmp=this.scratch;
    for(const stride of [1,n,n*n]) {
      tmp.set(f);
      for(let i=n*n+n+1;i<f.length-n*n-n-1;i++)f[i]=(tmp[i-stride]+tmp[i]*2+tmp[i+stride])*.25;
      tmp.set(this.foamField);
      for(let i=n*n+n+1;i<f.length-n*n-n-1;i++)this.foamField[i]=(tmp[i-stride]+tmp[i]*2+tmp[i+stride])*.25;
    }
    for(let i=0;i<f.length;i++)this.foamField[i]=Math.min(1,this.foamField[i]/Math.max(.05,f[i])*5);
    for(let z=1;z<n-1;z++)for(let y=1;y<n-1;y++)for(let x=1;x<n-1;x++) {
      const xx=min[0]+x*cell[0],yy=min[1]+y*cell[1],zz=min[2]+z*cell[2];
      const wall=Math.min(xx-b[0],b[1]-xx,yy-solver.floor(xx,zz),b[3]-yy,zz-b[4],b[5]-zz);
      const i=(z*n+y)*n+x;f[i]=Math.min(f[i],.48+wall*10);
    }
    surface.update();const count=surface.geometry.drawRange.count;
    if(count>=surface.geometry.attributes.position.count)throw new Error('Fluid mesh exceeded its vertex budget');
    const rawPosition=surface.geometry.attributes.position.array,rawNormal=surface.geometry.attributes.normal.array;
    const outPosition=new Float32Array(count*3),outNormal=new Float32Array(count*3),outFoam=new Float32Array(count),outIndex=new Uint32Array(count),vertices=new Map();
    let unique=0;
    for(let vertex=0;vertex<count;vertex++) {
      const i=vertex*3,gx=(rawPosition[i]+1)*n/2,gy=(rawPosition[i+1]+1)*n/2,gz=(rawPosition[i+2]+1)*n/2;
      const wx=min[0]+gx*cell[0],wy=min[1]+gy*cell[1],wz=min[2]+gz*cell[2];
      const qx=Math.round(wx*1000)+16384,qy=Math.round(wy*1000)+16384,qz=Math.round(wz*1000)+16384;
      const key=qx*1073741824+qy*32768+qz;
      let id=vertices.get(key);
      if(id!==undefined){outIndex[vertex]=id;continue;}
      id=unique++;vertices.set(key,id);outIndex[vertex]=id;
      const k=id*3;outPosition[k]=wx;outPosition[k+1]=wy-(solver.isSurfVolume?solver.waterLevel:0);outPosition[k+2]=wz;
      const normalX=rawNormal[i]/this.extent[0],normalY=rawNormal[i+1]/this.extent[1],normalZ=rawNormal[i+2]/this.extent[2],normalLength=Math.hypot(normalX,normalY,normalZ)||1;
      outNormal[k]=normalX/normalLength;outNormal[k+1]=normalY/normalLength;outNormal[k+2]=normalZ/normalLength;
      if(solver.isSurfVolume&&Math.abs(outPosition[k+1])<.4&&outNormal[k+1]>.45){
        const edge=Math.min(wx-b[0],b[1]-wx,wz-b[4],b[5]-wz),blend=Math.min(1,Math.max(0,edge/.8));
        outPosition[k+1]*=blend;outNormal[k]*=blend;outNormal[k+2]*=blend;outNormal[k+1]=1+(outNormal[k+1]-1)*blend;
        const length=Math.hypot(outNormal[k],outNormal[k+1],outNormal[k+2]);outNormal[k]/=length;outNormal[k+1]/=length;outNormal[k+2]/=length;
      }
      const x0=Math.max(0,Math.min(n-2,Math.floor(gx))),y0=Math.max(0,Math.min(n-2,Math.floor(gy))),z0=Math.max(0,Math.min(n-2,Math.floor(gz)));
      const tx=Math.max(0,Math.min(1,gx-x0)),ty=Math.max(0,Math.min(1,gy-y0)),tz=Math.max(0,Math.min(1,gz-z0));
      let amount=0;
      for(let z=0;z<2;z++)for(let y=0;y<2;y++)for(let x=0;x<2;x++)amount+=this.foamField[((z0+z)*n+y0+y)*n+x0+x]*(x?tx:1-tx)*(y?ty:1-ty)*(z?tz:1-tz);
      const wall=Math.min(wx-b[0],b[1]-wx,wy-b[2],wz-b[4],b[5]-wz);
      outFoam[id]=amount*Math.min(1,Math.max(0,wall/.08));
    }
    const position=outPosition.slice(0,unique*3),normal=outNormal.slice(0,unique*3),foam=outFoam.slice(0,unique),index=unique<65536?Uint16Array.from(outIndex):outIndex;

    let opening=null;
    if(solver.isSurfVolume){
      const ix=Math.round(-min[0]/cell[0]);
      for(let z=1;z<n-1;z++){
        let wet=false,air=-1;
        for(let y=1;y<n-1;y++){
          const filled=f[(z*n+y)*n+ix]>.48;
          if(filled&&!wet)wet=true;
          else if(!filled&&wet&&air<0)air=y;
          else if(filled&&air>=0){const clearance=(y-air)*cell[1];if(clearance>.7&&min[1]+air*cell[1]>solver.waterLevel-.1&&(!opening||clearance>opening.clearance))opening={clearance,center:[0,min[1]+(air+y)*.5*cell[1]-solver.waterLevel,min[2]+z*cell[2]]};break;}
        }
      }
    }
    if(opening){
      const iy=Math.round((opening.center[1]+solver.waterLevel-min[1])/cell[1]),iz=Math.round((opening.center[2]-min[2])/cell[2]),ix=Math.round(-min[0]/cell[0]);
      let left=iz,right=iz;
      while(left>1&&f[(left*n+iy)*n+ix]<.48)left--;
      while(right<n-2&&f[(right*n+iy)*n+ix]<.48)right++;
      opening.closedAcross=left>1&&right<n-2;opening.width=(right-left)*cell[2];
      const roofAt=(x,z)=>{for(let y=iy+1;y<n-2;y++)if(f[(z*n+y)*n+x]>.48)return true;return false;};
      let span=0;
      for(let x=ix;x<n-2;x++){const z=Math.round(iz+(min[0]+x*cell[0])*.1/cell[2]);if(f[(z*n+iy)*n+x]>.48||!roofAt(x,z))break;span+=cell[0];}
      for(let x=ix-1;x>1;x--){const z=Math.round(iz+(min[0]+x*cell[0])*.1/cell[2]);if(f[(z*n+iy)*n+x]>.48||!roofAt(x,z))break;span+=cell[0];}
      opening.axialClearance=span;
    }
    return {position,normal,foam,index,spray:new Float32Array(spray),opening};
  }
}
