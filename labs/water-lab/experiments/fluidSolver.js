// Repository-only 3D fluid experiment. Equal-mass particles, PBF density
// projection (Macklin/Müller 2013), fixed steps, and solid tank boundaries.
// This is a coarse free-surface solve, not an air/water multiphase solver.
export class TankFluidSolver {
  constructor({ spacing = .18, iterations = 4, columnHeight = 3.1, columnWidth = 2.45,
    points: suppliedPoints, bounds = [-3,3,0,4.8,-1.6,1.6], dimensions = 3, velocity: initialVelocity, bathymetry = null } = {}) {
    this.bathymetry=bathymetry;
    this.spacing = spacing;
    this.h = spacing * 2;
    this.iterations = iterations;
    this.bounds = bounds; this.dimensions = dimensions;
    const points = suppliedPoints ?? [];
    // A retained water column on the left and a shallow receiving pool.
    if (!suppliedPoints) for (let z = -1.6 + spacing / 2; z < 1.6; z += spacing)
      for (let y = spacing / 2; y < columnHeight; y += spacing)
        for (let x = -3 + spacing / 2; x < (y < .45 ? 3 : -3+columnWidth); x += spacing)
          points.push(x, y, z);
    this.initial = new Float32Array(points);
    this.position = this.initial.slice();
    this.previous = this.initial.slice();
    this.velocity = new Float32Array(points.length);
    if(initialVelocity) this.velocity.set(initialVelocity);
    this.initialVelocity = this.velocity.slice();
    this.previousVelocity = this.velocity.slice();
    this.correction = new Float32Array(points.length);
    this.count = points.length / 3;
    this.lambda = new Float32Array(this.count);
    this.density = new Float32Array(this.count);
    this.foam = new Float32Array(this.count);this.shear=new Float32Array(this.count);
    this.next = new Int32Array(this.count);
    this.gridSize = [0,1,2].map(axis=>Math.ceil((bounds[axis*2+1]-bounds[axis*2])/this.h)+3);
    this.head = new Int32Array(this.gridSize.reduce((a, b) => a * b));
    this.maxNeighbors = 100;
    this.neighbors = new Int32Array(this.count * this.maxNeighbors);
    this.neighborCounts = new Uint8Array(this.count);
    this.poly = 315 / (64 * Math.PI * this.h ** 9);
    this.spiky = -45 / (Math.PI * this.h ** 6);
    // Match the kernel's discrete lattice density, rather than assuming
    // continuum integration is exact with only a few dozen neighbors.
    this.restDensity = 0;
    for (let z = dimensions===2?0:-2; z <= (dimensions===2?0:2); z++) for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++)
      this.restDensity += this.kernel((x*x + y*y + z*z) * spacing*spacing);
    this.time = 0;
    this.overflow = 0;
  }
  kernel(r2) { return r2 < this.h*this.h ? this.poly * (this.h*this.h - r2) ** 3 : 0; }
  cell(x, y, z) {
    const a = Math.floor((x - this.bounds[0]) / this.h) + 1;
    const b = Math.floor((y - this.bounds[2]) / this.h) + 1;
    const c = Math.floor((z - this.bounds[4]) / this.h) + 1;
    return (c * this.gridSize[1] + b) * this.gridSize[0] + a;
  }
  floor(x,z) {
    const b=this.bathymetry;if(!b)return this.bounds[2];
    return this.bounds[2]+Math.max(0,Math.min(b.rise,(z-b.start-x*b.peel)*b.slope));
  }
  solidSupport(x,y,z) {
    const missing=d=>{const t=Math.max(0,Math.min(1,d/this.h)),t2=t*t;return Math.max(0,.5-315/256*t*(1-4/3*t2+6/5*t2*t2-4/7*t2*t2*t2+1/9*t2*t2*t2*t2));};
    const b=this.bounds;return 1-(1-missing(x-b[0]))*(1-missing(b[1]-x))*(1-missing(y-this.floor(x,z)))*(1-missing(b[3]-y))*(1-missing(z-b[4]))*(1-missing(b[5]-z));
  }
  constrain(i) {
    const p = this.position, r = this.spacing * .43;
    for (let a = 0; a < 3; a++) p[i+a] = Math.max(this.bounds[a*2]+r, Math.min(this.bounds[a*2+1]-r, p[i+a]));
    if(this.bathymetry){const b=this.bathymetry,raw=(p[i+2]-b.start-p[i]*b.peel)*b.slope,slope=raw>0&&raw<b.rise?b.slope:0,depth=this.floor(p[i],p[i+2])+r-p[i+1];
      if(depth>0){const nx=slope*b.peel,nz=-slope,k=depth/(1+nx*nx+nz*nz);p[i]+=nx*k;p[i+1]+=k;p[i+2]+=nz*k;}}

  }
  findNeighbors() {
    const p = this.position, nx = this.gridSize[0], ny = this.gridSize[1];
    this.head.fill(-1); this.overflow = 0;
    for (let i = 0; i < this.count; i++) {
      const k = i*3, cell = this.cell(p[k], p[k+1], p[k+2]);
      this.next[i] = this.head[cell]; this.head[cell] = i;
    }
    for (let i = 0; i < this.count; i++) {
      const k = i*3, cell = this.cell(p[k], p[k+1], p[k+2]);
      let count = 0;
      for (let z = -1; z <= 1; z++) for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) {
        let j = this.head[cell + z*nx*ny + y*nx + x];
        while (j >= 0) {
          const b = j*3;
          if (j !== i && (p[k]-p[b])**2 + (p[k+1]-p[b+1])**2 + (p[k+2]-p[b+2])**2 < this.h*this.h) {
            if (count < this.maxNeighbors) this.neighbors[i*this.maxNeighbors + count++] = j;
            else this.overflow++;
          }
          j = this.next[j];
        }
      }
      this.neighborCounts[i] = count;
    }
  }
  step(dt = 1/120) {
    if (!(dt > 0 && dt <= 1/60)) throw new Error('Fluid steps must be positive and at most 1/60 s');
    const p = this.position, v = this.velocity, n = this.count, inv = 1/this.restDensity;
    this.previous.set(p);
    this.previousVelocity.set(v);
    for (let i = 0; i < n; i++) {
      const k = i*3;
      v[k+1] -= 9.81*dt;
      for (let a = 0; a < 3; a++) p[k+a] += v[k+a]*dt;
      this.constrain(k);
    }
    for (let iteration = 0; iteration < this.iterations; iteration++) {
      this.findNeighbors();
      for (let i = 0; i < n; i++) {
        const k = i*3, offset = i*this.maxNeighbors;
        let rho = this.kernel(0), gx = 0, gy = 0, gz = 0, sum = 0;
        for (let q = 0; q < this.neighborCounts[i]; q++) {
          const j = this.neighbors[offset+q]*3;
          const x = p[k]-p[j], y = p[k+1]-p[j+1], z = p[k+2]-p[j+2];
          const r2 = x*x+y*y+z*z, r = Math.sqrt(r2);
          rho += this.kernel(r2);
          if (r < 1e-7 || r >= this.h) continue;
          const g = this.spiky * (this.h-r)**2 / r * inv;
          gx += g*x; gy += g*y; gz += g*z; sum += g*g*r2;
        }
        this.density[i] = rho * inv;
        // Free surfaces are not forced to expand to the rest density.
        this.lambda[i] = -Math.max(0, rho*inv-1)/(sum+gx*gx+gy*gy+gz*gz+.01);
      }
      for (let i = 0; i < n; i++) {
        const k = i*3, offset = i*this.maxNeighbors;
        let dx = 0, dy = 0, dz = 0;
        for (let q = 0; q < this.neighborCounts[i]; q++) {
          const j = this.neighbors[offset+q], b = j*3;
          const x = p[k]-p[b], y = p[k+1]-p[b+1], z = p[k+2]-p[b+2], r = Math.sqrt(x*x+y*y+z*z);
          if (r < 1e-7 || r >= this.h) continue;
          const g = (this.lambda[i]+this.lambda[j])*inv*this.spiky*(this.h-r)**2/r;
          dx += x*g; dy += y*g; dz += z*g;
        }
        const limit = Math.min(1, this.spacing*.2/Math.max(Math.hypot(dx,dy,dz),1e-8));
        this.correction[k] = dx*limit; this.correction[k+1] = dy*limit; this.correction[k+2] = dz*limit;
      }
      for (let i = 0; i < n; i++) {
        const k = i*3;
        for (let a = 0; a < 3; a++) p[k+a] += this.correction[k+a];
        this.constrain(k);
      }
    }
    for (let k = 0; k < p.length; k++) v[k] = (p[k]-this.previous[k])/dt;
    // XSPH viscosity is a velocity difference, not a global velocity damper.
    this.correction.fill(0);this.shear.fill(0);
    for (let i = 0; i < n; i++) {
      const k = i*3, offset = i*this.maxNeighbors;
      for (let q = 0; q < this.neighborCounts[i]; q++) {
        const b = this.neighbors[offset+q]*3;
        const w = .004*this.kernel((p[k]-p[b])**2+(p[k+1]-p[b+1])**2+(p[k+2]-p[b+2])**2)*inv;
        for (let a = 0; a < 3; a++){const dv=v[b+a]-v[k+a];this.correction[k+a] += dv*w;this.shear[i]+=dv*dv*w/.004;}
      }
    }
    for (let k = 0; k < v.length; k++) v[k] += this.correction[k];
    for(let i=0;i<n;i++) {
      const k=i*3,speed=Math.hypot(v[k],v[k+1],v[k+2]);
      const acceleration=Math.hypot(v[k]-this.previousVelocity[k],v[k+1]-this.previousVelocity[k+1],v[k+2]-this.previousVelocity[k+2])/dt;
      const exposed=Math.max(0,Math.min(1,(.96-this.density[i]-this.solidSupport(p[k],p[k+1],p[k+2]))/.3));
      const priorSpeed=Math.hypot(this.previousVelocity[k],this.previousVelocity[k+1],this.previousVelocity[k+2]);
      const generation=Math.max(speed,priorSpeed)>1.5?exposed*(Math.max(0,acceleration-12)*.09+Math.max(0,Math.abs(v[k+1])-1)*.65+Math.sqrt(this.shear[i])*.7):0;
      this.foam[i]=Math.min(1,this.foam[i]*Math.exp(-dt/3)+generation*dt);
    }
    this.time += dt;
  }
  reset() { this.position.set(this.initial); this.velocity.set(this.initialVelocity); if(this.initialFoam)this.foam.set(this.initialFoam);else this.foam.fill(0); this.time = 0; }
  diagnostics() {
    let kinetic = 0, potential = 0, maxSpeed = 0, compression = 0, centerX = 0;
    for (let i = 0; i < this.count; i++) {
      const k = i*3, speed = Math.hypot(...this.velocity.subarray(k,k+3));
      kinetic += .5*speed*speed; potential += 9.81*this.position[k+1];
      centerX += this.position[k]; maxSpeed = Math.max(maxSpeed,speed); compression = Math.max(compression,this.density[i]-1);
    }
    const mass = 1000*this.spacing**this.dimensions;
    return { time:this.time, particles:this.count, volume:this.count*this.spacing**this.dimensions, dimensions:this.dimensions, kinetic:kinetic*mass,
      potential:potential*mass, maxSpeed, maxCompression:compression, centerX:centerX/this.count, neighborOverflow:this.overflow };
  }
}
