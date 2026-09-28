import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { attribute, clamp, dot, length, max, mix, normalWorld, positionWorld, smoothstep, texture, uniform, uv } from 'three/tsl';
import { getWaterFoamTexture } from './waterFoamTexture.js';
import { sampleEnvironmentSunShadow } from '../shaders-tsl/chunks/environment-sun-shadow.js';
import { sampleEnvironmentCloudShadow } from '../sky/cloudShadow.js';

// Small floating foam rafts, each resolving several bubbles. They translate
// with solved flow but do not stretch into polygons with a texture mapping.
export class WaterFoamParticles {
  constructor(dynamics, count=12000) {
    this.dynamics=dynamics;this.count=count;this.seed=6297;
    this.points=new Float32Array(count*6); // x,z,age,lifetime,size,rotation
    this.thickness=new Float32Array(count);
    for(let i=0;i<count;i++)this.points[i*6+2]=-1;
    this.alpha=new Float32Array(count);
    const seeds=new Float32Array(count);
    for(let i=0;i<count;i++)seeds[i]=this.random()*8;
    // A rounded cap, not a flat card: its base touches the water and its
    // crown gives the aerated lip a centimetre-scale silhouette and shading.
    const geometry=new THREE.PlaneGeometry(1,1,4,4);geometry.rotateX(-Math.PI/2);
    const position=geometry.attributes.position;
    for(let i=0;i<position.count;i++) {
      const r2=4*(position.getX(i)**2+position.getZ(i)**2);
      position.setY(i,Math.max(0,1-r2)**.7);
    }
    geometry.computeVertexNormals();
    geometry.setAttribute('aFoamAlpha',new THREE.InstancedBufferAttribute(this.alpha,1).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('aFoamSeed',new THREE.InstancedBufferAttribute(seeds,1));
    this.color=uniform(new THREE.Color());
    this.sun=uniform(new THREE.Vector3(0,1,0));
    const material=new MeshBasicNodeMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide});
    const bubble=texture(getWaterFoamTexture()).sample(uv().mul(.25));
    const seed=attribute('aFoamSeed','float');
    const shape=texture(getWaterFoamTexture()).sample(uv().mul(.3).add(seed)).b;
    const radius=shape.mul(.22).add(.22);
    const disk=smoothstep(radius.sub(.035),radius.add(.015),length(uv().sub(.5))).oneMinus();
    const visibility=sampleEnvironmentSunShadow(positionWorld).mul(sampleEnvironmentCloudShadow(positionWorld,1));
    const diffuse=max(dot(normalWorld,this.sun),0).mul(.38).add(.62);
    material.colorNode=this.color.mul(bubble.r).mul(mix(.6,1,visibility)).mul(diffuse);
    material.opacityNode=clamp(attribute('aFoamAlpha','float').mul(disk).mul(mix(.15,1,bubble.g)),0,1);
    this.mesh=new THREE.InstancedMesh(geometry,material,count);
    this.mesh.name='FloatingSwashFoam';this.mesh.frustumCulled=false;this.mesh.renderOrder=3;
    this.mesh.userData.waterExclude=true;this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    dynamics.surface.add(this.mesh);
    this.focus=new THREE.Vector3();this.sample={};this.alive=0;
    this.frontState=new Float32Array(dynamics.columns*4);
    this.previousEdges=new Float32Array(dynamics.columns);
    this.frontReady=false;
    this.frontTexture=new THREE.DataTexture(this.frontState,dynamics.columns,1,THREE.RGBAFormat,THREE.FloatType);
    this.frontTexture.minFilter=this.frontTexture.magFilter=THREE.LinearFilter;
    this.frontTexture.generateMipmaps=false;
  }
  random(){this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;return (this.seed+.5)/4294967296;}
  concentration(x,z) {
    const d=this.dynamics;
    return d.hydro.sampleArray(d.hydro.foam,(x-d.minX)/d.dx,(z-d.minZ)/d.dz);
  }
  edgeAt(x) {
    const d=this.dynamics;
    if(d.options.shorelineAxis!=='z')return d.shoreEdgeAt(x);
    const gx=THREE.MathUtils.clamp((x-d.minX)/d.dx,0,d.columns-1),i=Math.min(d.columns-2,Math.floor(gx));
    return THREE.MathUtils.lerp(d.shoreContour[i],d.shoreContour[i+1],gx-i);
  }
  sampleFront(x,component,previous=false) {
    const d=this.dynamics,gx=THREE.MathUtils.clamp((x-d.minX)/d.dx,0,d.columns-1),i=Math.min(d.columns-2,Math.floor(gx));
    const a=previous?this.previousEdges[i]:this.frontState[i*4+component];
    const b=previous?this.previousEdges[i+1]:this.frontState[(i+1)*4+component];
    return THREE.MathUtils.lerp(a,b,gx-i);
  }
  updateFront(dt) {
    const d=this.dynamics;
    if(d.options.shorelineAxis!=='z')return;
    for(let i=0;i<d.columns;i++) {
      const x=d.minX+i*d.dx,edge=this.edgeAt(x),j=i*4;
      const previous=this.frontReady?this.frontState[j]:edge;
      this.previousEdges[i]=previous;
      if(dt>0&&this.frontReady) {
        const speed=THREE.MathUtils.clamp((edge-previous)/dt,-5,5);
        this.frontState[j+1]=THREE.MathUtils.lerp(this.frontState[j+1],speed,1-Math.exp(-dt/.18));
      }
      this.frontState[j]=edge;
      const concentration=Math.max(this.concentration(x,edge-.025),this.concentration(x,edge-.15),this.concentration(x,edge-.3));
      // Remember existing aeration through the drain. This is a visual
      // contact-line reservoir; it neither creates water nor refills a calm
      // shore. Its contribution fades and is thinner during retreat.
      this.frontState[j+2]=Math.max(concentration,this.frontState[j+2]*Math.exp(-dt/5));
      this.frontState[j+3]+=d.sample(x,edge-.2,this.sample).velocityZ*dt;
    }
    this.frontReady=true;this.frontTexture.needsUpdate=true;
    d.surface.material.uniforms.uFoamFrontState.value=this.frontTexture;
    d.surface.material.uniforms.uUseFoamFrontState.value=1;
  }
  retreatAt(x) {return this.frontReady?THREE.MathUtils.smoothstep(-this.sampleFront(x,1),.02,.18):0;}
  patchAt(x,edge) {
    // Smooth packet-scale variation, transported with the changing front.
    // The aeration field still decides whether any foam can exist here.
    return .5+.5*Math.sin(x*1.31+edge*.27)*Math.sin(x*.47-edge*.19+2.1);
  }
  networkAt(x,z) {
    const {data,width:n}=getWaterFoamTexture().image;
    const flow=this.frontReady?this.sampleFront(x,3):0;
    const gx=((x/2.4%1)+1)%1*n,gz=(((z-flow)/2.4%1)+1)%1*n;
    const ix=Math.floor(gx),iz=Math.floor(gz),tx=gx-ix,tz=gz-iz;
    const at=(a,b)=>data[((b%n)*n+a%n)*4+3]/255;
    return (at(ix,iz)*(1-tx)+at(ix+1,iz)*tx)*(1-tz)+(at(ix,iz+1)*(1-tx)+at(ix+1,iz+1)*tx)*tz;
  }
  availableFoam(x,z) {
    const current=this.concentration(x,z),edge=this.edgeAt(x);
    if(!this.frontReady||edge==null)return current;
    return Math.max(current,this.sampleFront(x,2)*this.retreatAt(x)*Math.exp(-Math.max(0,edge-z)/.4));
  }
  update(dt) {
    const d=this.dynamics,s=d.surface,settings=s.renderedSettings??s.settings;
    this.updateFront(dt);
    if(typeof s.followTarget==='function')s.followTarget(this.focus);
    const cx=THREE.MathUtils.clamp(this.focus.x,d.minX+12,d.minX+s.width-12);
    const cz=(this.edgeAt(cx)??0)-1.5;
    const gain=settings.foamAmount*settings.swashFoamAmount;
    this.color.value.setRGB(...settings.foamColor,THREE.SRGBColorSpace);
    this.sun.value.set(...settings.sunDirection).normalize();
    const matrices=this.mesh.instanceMatrix.array;
    let budget=dt>0?Math.min(this.count,Math.ceil(dt*18000)):0,alive=0,packetRemaining=0,packetX=cx,packetZ=cz;
    let packetRim=true,packetPatch=1,packetSpread=.035;
    for(let i=0;i<this.count;i++) {
      const j=i*6;
      let x=this.points[j],z=this.points[j+1],age=this.points[j+2];
      if(age>=0&&dt>0) {
        const oldX=x,oldZ=z,oldEdge=this.frontReady?this.sampleFront(x,0,true):null;
        const flow=d.sample(x,z,this.sample);
        x+=flow.velocityX*dt;z+=flow.velocityZ*dt;age+=dt;
        if(oldEdge!=null&&oldEdge-oldZ>=0&&oldEdge-oldZ<.35) {
          const newEdge=this.edgeAt(x),edgeDelta=newEdge-this.sampleFront(oldX,0,true);
          // The narrow rim remains with the receding contact line. Foam
          // farther into the sheet continues to follow the bulk current.
          if(edgeDelta<0)z=oldZ+edgeDelta;
        }
        if(age>this.points[j+3]||Math.abs(x-cx)>13||Math.abs(z-cz)>5)age=-1;
      }
      if(age<0&&budget>0&&gain>0) {
        budget--;
        if(packetRemaining--<=0){
          packetRemaining=4+Math.floor(this.random()*9);
          packetX=cx+(this.random()-.5)*23.6;
          const front=this.edgeAt(packetX);
          packetPatch=front==null?1:this.patchAt(packetX,front);
          packetRim=front==null||this.random()<.42;
          const drain=1-.5*this.retreatAt(packetX);
          const width=(.18-.11*packetPatch)*drain;
          const distance=packetRim ? .018+Math.min(.65,-Math.log(this.random())*width)
            : .35+this.random()**1.25*(.6+1.65*packetPatch)*drain;
          packetZ=front==null?cz+(this.random()-.5)*7.6:front-distance;
          packetSpread=packetRim?.035:.25+.45*packetPatch;
        }
        x=packetX+(this.random()-.5)*.24;
        const localFront=this.edgeAt(x),packetFront=this.edgeAt(packetX);
        z=packetZ+(localFront!=null&&packetFront!=null?localFront-packetFront:0)+(this.random()-.5)*packetSpread;
        const column=d.sample(x,z,this.sample),foam=this.availableFoam(x,z),retreat=this.retreatAt(x);
        const patchDensity=localFront==null?1:(packetRim?.65:.3)+(packetRim?.35:.7)*packetPatch;
        const network=localFront==null||packetRim?1:.25+.75*this.networkAt(x,z);
        if(column.wet&&column.depth<.3&&foam>(retreat>.1?.008:.04)&&this.random()<(1-.6*retreat)*patchDensity*network) {
          age=0;this.points[j+3]=2.5+this.random()*3;
          const lip=localFront!=null&&localFront-z<.35;
          this.points[j+4]=lip?.055+(.055+.13*packetPatch)*this.random():.035+this.random()*.1;
          this.thickness[i]=lip?.006+.025*packetPatch**1.5*(.5+.5*this.random()):.0015+this.random()*.005;
          this.points[j+5]=lip?this.random()*Math.PI*2:Math.atan2(column.velocityX,column.velocityZ)+(this.random()-.5);
        }
      }
      this.points[j]=x;this.points[j+1]=z;this.points[j+2]=age;
      if(age<0){this.alpha[i]=0;continue;}
      const column=d.sample(x,z,this.sample),foam=this.availableFoam(x,z);
      if(!column.wet||foam<.008){this.points[j+2]=-1;this.alpha[i]=0;continue;}
      const life=this.points[j+3];
      const fade=THREE.MathUtils.smoothstep(age,0,.18)*(1-THREE.MathUtils.smoothstep(age,life-.6,life));
      const edge=(1-THREE.MathUtils.smoothstep(Math.abs(x-cx),10,12))*(1-THREE.MathUtils.smoothstep(Math.abs(z-cz),3,4));
      this.alpha[i]=fade*edge*(1-.6*this.retreatAt(x))*THREE.MathUtils.clamp(foam*5*gain,0,1);
      const size=this.points[j+4],angle=this.points[j+5],c=Math.cos(angle),sn=Math.sin(angle),k=i*16;
      const distance=(this.edgeAt(x)??z)-z,filament=distance>.35;
      const sx=size*(filament?.45:1),sz=size*(filament?1.8:1);
      const nx=THREE.MathUtils.clamp(Math.round((x-d.minX)/d.dx),0,d.columns-1);
      const nz=THREE.MathUtils.clamp(Math.round((z-d.minZ)/d.dz),0,d.rows-1),ni=(nz*d.columns+nx)*3;
      const gx=-d.normals[ni]/Math.max(d.normals[ni+1],.1),gz=-d.normals[ni+2]/Math.max(d.normals[ni+1],.1);
      const height=this.thickness[i]*(1-.65*this.retreatAt(x))*(.5+.5*fade);
      matrices[k]=c*sx;matrices[k+2]=-sn*sx;matrices[k+5]=height;matrices[k+8]=sn*sz;matrices[k+10]=c*sz;
      matrices[k+1]=(gx*c-gz*sn)*sx;matrices[k+9]=(gx*sn+gz*c)*sz;
      matrices[k+12]=x-d.x;matrices[k+13]=column.height-d.level+.0015;matrices[k+14]=z-d.z;matrices[k+15]=1;
      alive++;
    }
    this.alive=alive;
    this.mesh.visible=gain>0;
    this.mesh.geometry.attributes.aFoamAlpha.needsUpdate=true;this.mesh.instanceMatrix.needsUpdate=true;
    s.material.uniforms.uFoamParticleRegion.value.set(cx,cz,12,4);
    s.material.uniforms.uFoamParticleCoverage.value=gain>0?Math.min(1,alive/4500):0;
  }
  dispose(){this.dynamics.surface.material.uniforms.uUseFoamFrontState.value=0;this.frontTexture.dispose();this.mesh.removeFromParent();this.mesh.geometry.dispose();this.mesh.material.dispose();}
}
