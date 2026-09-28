import * as THREE from 'three';

// Visual continuation around a finite coastal solve. Boundary vertices are
// shared exactly; incoming wave phases continue offshore as a heightfield.
// This adds distant context, not extra simulated volume or interactive cells.
export class WaterRenderExtension {
  constructor(dynamics, extent) {
    this.dynamics = dynamics;
    const d = dynamics;
    const axis = (center, width, count) => {
      const low = center - width / 2, high = center + width / 2;
      const inner = Array.from({length:count},(_,i)=>low+i*width/(count-1));
      const distances = [1, 3, 7, 15, 31, 63, 127, extent / 2];
      return [...distances.map(v=>low-v).reverse(), ...inner, ...distances.map(v=>high+v)];
    };
    this.xs = axis(d.x, d.surface.width, d.columns);
    this.zs = axis(d.z, d.surface.depth, d.rows);
    const nx=this.xs.length, nz=this.zs.length;
    const positions=[], indices=[];
    for(const z of this.zs)for(const x of this.xs) positions.push(x-d.x,0,z-d.z);
    for(let z=0;z<nz-1;z++)for(let x=0;x<nx-1;x++) {
      // Omit every face already covered by the physical grid.
      if(x>=8&&x<8+d.columns-1&&z>=8&&z<8+d.rows-1) continue;
      const a=z*nx+x,b=a+1,c=a+nx,e=c+1;
      indices.push(a,c,b,b,c,e);
    }
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    this.geometry.setIndex(indices);
    this.geometry.computeVertexNormals();
    this.states = new Float32Array(nx*nz*4);
    this.normals = new Float32Array(nx*nz*3);
    this.wetDistances = new Float32Array(nx*nz);
    this.geometry.setAttribute('aWaterState',new THREE.BufferAttribute(this.states,4).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('aWaterNormal',new THREE.BufferAttribute(this.normals,3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('aWaterWetDistance',new THREE.BufferAttribute(this.wetDistances,1).setUsage(THREE.DynamicDrawUsage));
    this.mesh = new THREE.Mesh(this.geometry,d.surface.material);
    this.mesh.name = 'WaterLabCoastalContinuation';
    this.mesh.frustumCulled = false;
    this.mesh.userData.waterExclude = true;
    d.surface.add(this.mesh);
    this.sample = {};
  }
  incoming(x,z,stepX=0,stepZ=0) {
    const d=this.dynamics;
    let h=0;
    for(const w of d.incidentWaves ?? []) {
      const frequency=w.waveNumber*(Math.abs(w.dirX)*stepX+Math.abs(w.dirZ)*stepZ);
      const resolved=1-THREE.MathUtils.smoothstep(frequency,Math.PI*.45,Math.PI*.95);
      h+=resolved*w.amplitude*Math.sin(w.waveNumber*(w.dirX*x+w.dirZ*z)-w.omega*d.time+w.phase);
    }
    return h;
  }
  update() {
    const d=this.dynamics,nx=this.xs.length,nz=this.zs.length;
    this.mesh.material=d.surface.material;
    for(let z=0;z<nz;z++)for(let x=0;x<nx;x++) {
      const wx=this.xs[x],wz=this.zs[z],i=z*nx+x;
      const cx=THREE.MathUtils.clamp((wx-d.minX)/d.dx,0,d.columns-1),ix=Math.min(d.columns-2,Math.floor(cx));
      this.wetDistances[i]=THREE.MathUtils.lerp(d.shoreContour[ix],d.shoreContour[ix+1],cx-ix)-wz;
      if(x>=8&&x<8+d.columns&&z>=8&&z<8+d.rows) {
        const source=((z-8)*d.columns+x-8)*4;
        this.states.set(d.state.subarray(source,source+4),i*4);
        continue;
      }
      const bx=THREE.MathUtils.clamp(wx,d.minX,d.minX+d.surface.width);
      const bz=THREE.MathUtils.clamp(wz,d.minZ,d.minZ+d.surface.depth);
      const distance=Math.hypot(wx-bx,wz-bz);
      const boundary=d.sample(bx,bz,this.sample);
      const bed=d.bed(wx,wz), restDepth=Math.max(0,d.level-bed);
      const stepX=(this.xs[Math.min(nx-1,x+1)]-this.xs[Math.max(0,x-1)])/2;
      const stepZ=(this.zs[Math.min(nz-1,z+1)]-this.zs[Math.max(0,z-1)])/2;
      const incoming=this.incoming(wx,wz,stepX,stepZ);
      // Match the solved boundary exactly, then smoothly remove its local
      // correction as incoming waves extend into the distant context.
      const correction=(boundary.height-d.level-this.incoming(bx,bz))*Math.exp(-((distance/18)**2));
      const allowance=0.35*restDepth;
      const farHeight=d.level+(allowance>1e-5?allowance*Math.tanh((incoming+correction)/allowance):0);
      // Continue the measured shore profile alongshore. Fading it to a
      // rest-depth wave offshore formula on dry sand cut the run-up off at
      // the two side boundaries. Only deep context tends to that formula.
      const blend=THREE.MathUtils.smoothstep(distance,0,8)*THREE.MathUtils.smoothstep(restDepth,.5,2.5);
      const height=THREE.MathUtils.lerp(boundary.height,farHeight,blend);
      this.states[i*4]=Math.max(bed,height);
      this.states[i*4+1]=Math.max(0,height-bed);
      this.states[i*4+2]=boundary.velocityX;
      this.states[i*4+3]=boundary.velocityZ;
    }
    for(let z=0;z<nz;z++)for(let x=0;x<nx;x++) {
      const i=z*nx+x, left=Math.max(0,x-1),right=Math.min(nx-1,x+1),down=Math.max(0,z-1),up=Math.min(nz-1,z+1);
      const gx=(this.states[(z*nx+right)*4]-this.states[(z*nx+left)*4])/(this.xs[right]-this.xs[left]);
      const gz=(this.states[(up*nx+x)*4]-this.states[(down*nx+x)*4])/(this.zs[up]-this.zs[down]);
      const inv=1/Math.hypot(gx,1,gz);
      this.normals[i*3]=-gx*inv;this.normals[i*3+1]=inv;this.normals[i*3+2]=-gz*inv;
      // At the seam also match the original displayed normal, so there is
      // no abrupt reflection line despite different outer tessellation.
      if(x>=8&&x<8+d.columns&&z>=8&&z<8+d.rows) {
        const source=((z-8)*d.columns+x-8)*3;
        this.normals.set(d.normals.subarray(source,source+3),i*3);
      }
    }
    this.geometry.attributes.aWaterState.needsUpdate=true;
    this.geometry.attributes.aWaterNormal.needsUpdate=true;
    this.geometry.attributes.aWaterWetDistance.needsUpdate=true;
  }
  dispose() {this.mesh.removeFromParent();this.geometry.dispose();}
}
