import * as THREE from 'three';
import { GRAVITY } from './experimentModels.js';

// Sample the rendered LOD0 triangles, not a separate approximate rock shape.
// This heightfield resolves exposed upper faces; it is a surface-runoff model.
export function sampleRockSurface(objects, {minX=-3,maxX=3,minZ=-3,maxZ=4,step=.045}={}) {
  const nx=Math.ceil((maxX-minX)/step)+1,nz=Math.ceil((maxZ-minZ)/step)+1;
  const layers=4,data=new Float32Array(nx*nz*layers*4),ray=new THREE.Raycaster();
  for(let i=0;i<nx*nz*layers;i++)data[i*4]=-1;
  objects.forEach(object=>object.updateWorldMatrix(true,true));
  for(let z=0;z<nz;z++)for(let x=0;x<nx;x++) {
    ray.set(new THREE.Vector3(minX+x*step,32,minZ+z*step),new THREE.Vector3(0,-1,0));
    let layer=0,lastHeight=Infinity;
    for(const hit of ray.intersectObjects(objects,false)) {
      const normal=hit.face.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)).normalize();
      if(normal.y<.03||Math.abs(lastHeight-hit.point.y)<.035)continue;
      data.set([hit.point.y,normal.x,normal.y,normal.z],((z*nx+x)*layers+layer)*4);
      lastHeight=hit.point.y;if(++layer===layers)break;
    }
  }
  return (x,z,ceiling=Infinity)=>{
    const ix=Math.round((x-minX)/step),iz=Math.round((z-minZ)/step);
    if(ix<0||ix>=nx||iz<0||iz>=nz)return {height:-1,normal:[0,1,0]};
    for(let layer=0;layer<layers;layer++){
      const k=((iz*nx+ix)*layers+layer)*4;
      if(data[k]<=ceiling)return {height:data[k],normal:[data[k+1],data[k+2],data[k+3]]};
    }
    return {height:-1,normal:[0,1,0]};
  };
}
export function traceWaterfallStream(x,{height,speed,surface}) {
  let p=new THREE.Vector3(x,height,-2),v=new THREE.Vector3(0,0,speed),impact=null,lastContact=-1;
  const contacts=[];
  const path=[],dt=1/180;
  for(let i=0;i<1080;i++) {
    const time=i*dt,previousY=p.y;v.y-=GRAVITY*dt;p.addScaledVector(v,dt);
    const rock=surface?.(p.x,p.z,previousY+.1),floor=rock?.height??-1;
    if(floor>0&&p.y<floor+.025) {
      const normal=new THREE.Vector3(...rock.normal).normalize();
      if(time-lastContact>.06){const contact={point:[p.x,floor+.035,p.z],normal:normal.toArray(),time,speed:v.length()};contacts.push(contact);impact??=contact;
        // Resolve incoming normal momentum into an outward fan at first impact.
        v.x+=(x>=0?1:-1)*Math.abs(v.y)*.12;v.z+=Math.abs(v.y)*.08;
      }
      lastContact=time;p.y=floor+.025;
      const inward=v.dot(normal);if(inward<0)v.addScaledVector(normal,-inward);
      v.y=Math.min(v.y,.35);v.multiplyScalar(.978);
    }
    path.push({position:p.toArray(),time,speed:v.length()});
    if(p.y<=.025)break;
  }
  return {impact,contacts,path,end:path.at(-1)?.position??[x,0,0]};
}
