// Compute-only WebGPU PBF. The worker owns this device; the lab renderer receives
// ordinary mesh buffers, so it keeps the same WebGPU and WebGL presentation path.
const SHADER=/* wgsl */`
struct Params { lowerH:vec4f, upperRest:vec4f, grid:vec4u, physics:vec4f, bed:vec4f };
@group(0) @binding(0) var<uniform> cfg:Params;
@group(0) @binding(1) var<storage,read_write> p:array<vec4f>;
@group(0) @binding(2) var<storage,read_write> v:array<vec4f>;
@group(0) @binding(3) var<storage,read_write> old:array<vec4f>;
@group(0) @binding(4) var<storage,read_write> delta:array<vec4f>;
@group(0) @binding(5) var<storage,read_write> pressure:array<vec2f>;
@group(0) @binding(6) var<storage,read_write> counts:array<atomic<u32>>;
@group(0) @binding(7) var<storage,read_write> bins:array<u32>;
@group(0) @binding(8) var<storage,read_write> priorV:array<vec4f>;
fn cell(q:vec3f)->vec3i { return clamp(vec3i(floor((q-cfg.lowerH.xyz)/cfg.lowerH.w)),vec3i(0),vec3i(cfg.grid.xyz)-1); }
fn address(c:vec3i)->u32 {return u32((c.z*i32(cfg.grid.y)+c.y)*i32(cfg.grid.x)+c.x);}
fn weight(r2:f32)->f32 {let q=max(0.,cfg.lowerH.w*cfg.lowerH.w-r2);return cfg.physics.z*q*q*q;}
fn gradient(d:vec3f)->vec3f {let r=length(d);if(r<.000001||r>=cfg.lowerH.w){return vec3f(0.);}let h=cfg.lowerH.w-r;return d*(cfg.physics.w*h*h/(r*cfg.upperRest.w));}
fn bounded(q:vec3f)->vec3f {let r=cfg.physics.y*.43;var p=clamp(q,cfg.lowerH.xyz+vec3f(r),cfg.upperRest.xyz-vec3f(r));
 let raw=(p.z-cfg.bed.x-p.x*cfg.bed.w)*cfg.bed.y;let floor=cfg.lowerH.y+clamp(raw,0.,cfg.bed.z);let slope=select(0.,cfg.bed.y,raw>0.&&raw<cfg.bed.z);
 let normal=vec3f(slope*cfg.bed.w,1.,-slope);let depth=floor+r-p.y;if(depth>0.){p+=normal*(depth/dot(normal,normal));}return p;}
@compute @workgroup_size(128) fn clear(@builtin(global_invocation_id) id:vec3u){if(id.x<cfg.grid.x*cfg.grid.y*cfg.grid.z){atomicStore(&counts[id.x],0u);}}
@compute @workgroup_size(64) fn predict(@builtin(global_invocation_id) id:vec3u){let i=id.x;if(i>=cfg.grid.w){return;}old[i]=p[i];priorV[i]=v[i];v[i].y-=9.81*cfg.physics.x;p[i]=vec4f(bounded(p[i].xyz+v[i].xyz*cfg.physics.x),p[i].w);}
@compute @workgroup_size(64) fn hash(@builtin(global_invocation_id) id:vec3u){let i=id.x;if(i>=cfg.grid.w){return;}let c=address(cell(p[i].xyz));let slot=atomicAdd(&counts[c],1u);if(slot<128u){bins[c*128u+slot]=i;}else{atomicAdd(&counts[cfg.grid.x*cfg.grid.y*cfg.grid.z],1u);}}
@compute @workgroup_size(64) fn density(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;if(i>=cfg.grid.w){return;}let center=cell(p[i].xyz);var rho=weight(0.);var g=vec3f(0.);var sum=0.;
 for(var z=-1;z<=1;z++){for(var y=-1;y<=1;y++){for(var x=-1;x<=1;x++){
  let c=center+vec3i(x,y,z);if(any(c<vec3i(0))||any(c>=vec3i(cfg.grid.xyz))){continue;}let a=address(c);let size=min(128u,atomicLoad(&counts[a]));
  for(var q=0u;q<size;q++){let j=bins[a*128u+q];if(j==i){continue;}let d=p[i].xyz-p[j].xyz;rho+=weight(dot(d,d));let grad=gradient(d);g+=grad;sum+=dot(grad,grad);}
 }}}
 let ratio=rho/cfg.upperRest.w;pressure[i]=vec2f(-max(0.,ratio-1.)/(sum+dot(g,g)+.01),ratio);
}
@compute @workgroup_size(64) fn correct(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;if(i>=cfg.grid.w){return;}let center=cell(p[i].xyz);var d=vec3f(0.);
 for(var z=-1;z<=1;z++){for(var y=-1;y<=1;y++){for(var x=-1;x<=1;x++){
  let c=center+vec3i(x,y,z);if(any(c<vec3i(0))||any(c>=vec3i(cfg.grid.xyz))){continue;}let a=address(c);let size=min(128u,atomicLoad(&counts[a]));
  for(var q=0u;q<size;q++){let j=bins[a*128u+q];if(j==i){continue;}d+=(pressure[i].x+pressure[j].x)*gradient(p[i].xyz-p[j].xyz);}
 }}}
 d*=min(1.,cfg.physics.y*.2/max(length(d),.0000001));delta[i]=vec4f(d,0.);
}
@compute @workgroup_size(64) fn apply(@builtin(global_invocation_id) id:vec3u){let i=id.x;if(i>=cfg.grid.w){return;}p[i]=vec4f(bounded(p[i].xyz+delta[i].xyz),p[i].w);}
@compute @workgroup_size(64) fn velocity(@builtin(global_invocation_id) id:vec3u){let i=id.x;if(i>=cfg.grid.w){return;}v[i]=vec4f((p[i].xyz-old[i].xyz)/cfg.physics.x,0.);}
@compute @workgroup_size(64) fn viscosity(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;if(i>=cfg.grid.w){return;}let center=cell(p[i].xyz);var d=vec3f(0.);var shear=0.;
 for(var z=-1;z<=1;z++){for(var y=-1;y<=1;y++){for(var x=-1;x<=1;x++){
  let c=center+vec3i(x,y,z);if(any(c<vec3i(0))||any(c>=vec3i(cfg.grid.xyz))){continue;}let a=address(c);let size=min(128u,atomicLoad(&counts[a]));
  for(var q=0u;q<size;q++){let j=bins[a*128u+q];if(j==i){continue;}let diff=p[i].xyz-p[j].xyz;let w=weight(dot(diff,diff))/cfg.upperRest.w;let dv=v[j].xyz-v[i].xyz;d+=dv*(.004*w);shear+=dot(dv,dv)*w;}
 }}}
 delta[i]=vec4f(d,sqrt(shear));
}
fn missingSupport(distance:f32)->f32 {
 let t=clamp(distance/cfg.lowerH.w,0.,1.);let t2=t*t;
 return max(0.,.5-(315./256.)*t*(1.-(4./3.)*t2+(6./5.)*t2*t2-(4./7.)*t2*t2*t2+(1./9.)*t2*t2*t2*t2));
}
fn solidSupport(q:vec3f)->f32 {
 let floor=cfg.lowerH.y+clamp((q.z-cfg.bed.x-q.x*cfg.bed.w)*cfg.bed.y,0.,cfg.bed.z);
 let a=vec3f(q.x-cfg.lowerH.x,q.y-floor,q.z-cfg.lowerH.z);let b=cfg.upperRest.xyz-q;
 return 1.-(1.-missingSupport(a.x))*(1.-missingSupport(a.y))*(1.-missingSupport(a.z))*(1.-missingSupport(b.x))*(1.-missingSupport(b.y))*(1.-missingSupport(b.z));
}
@compute @workgroup_size(64) fn finish(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;if(i>=cfg.grid.w){return;}v[i]=vec4f(v[i].xyz+delta[i].xyz,0.);let speed=length(v[i].xyz);let acceleration=length(v[i].xyz-priorV[i].xyz)/cfg.physics.x;
 let exposed=clamp((.96-pressure[i].y-solidSupport(p[i].xyz))/.3,0.,1.);
 let generation=select(0.,exposed*(max(0.,acceleration-12.)*.09+max(0.,abs(v[i].y)-1.)*.65+delta[i].w*.7),max(speed,length(priorV[i].xyz))>1.5);
 p[i].w=min(1.,p[i].w*exp(-cfg.physics.x/3.)+generation*cfg.physics.x);
}
`;

export class GpuFluidSolver {
  static async create(reference) {
    if(!globalThis.navigator?.gpu)return null;
    const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});if(!adapter)return null;
    const device=await adapter.requestDevice({requiredLimits:{maxStorageBuffersPerShaderStage:8}});
    const solver=new GpuFluidSolver(reference,device);
    try {await solver.initialize();return solver;}catch(error){device.destroy();throw error;}
  }
  constructor(reference,device){this.reference=reference;this.device=device;this.buffers=[];}
  async initialize() {
    const s=this.reference,device=this.device,b=s.bounds;
    this.grid=[0,1,2].map(a=>Math.ceil((b[a*2+1]-b[a*2])/s.h));this.cells=this.grid.reduce((a,b)=>a*b,1);
    const storage=(size)=>{const buffer=device.createBuffer({size:Math.ceil(size/4)*4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC});this.buffers.push(buffer);return buffer;};
    this.params=device.createBuffer({size:80,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});this.buffers.push(this.params);
    const cfg=new ArrayBuffer(80),floats=new Float32Array(cfg),uints=new Uint32Array(cfg);
    floats.set([b[0],b[2],b[4],s.h,b[1],b[3],b[5],s.restDensity]);uints.set([...this.grid,s.count],8);floats.set([1/120,s.spacing,s.poly,s.spiky],12);floats.set(s.bathymetry?[s.bathymetry.start,s.bathymetry.slope,s.bathymetry.rise,s.bathymetry.peel]:[0,0,0,0],16);device.queue.writeBuffer(this.params,0,cfg);
    this.positions=storage(s.count*16);this.velocities=storage(s.count*16);this.old=storage(s.count*16);this.delta=storage(s.count*16);this.pressure=storage(s.count*8);this.counts=storage((this.cells+1)*4);this.bins=storage(this.cells*128*4);this.priorV=storage(s.count*16);
    const positions=new Float32Array(s.count*4),velocities=positions.slice();
    for(let i=0;i<s.count;i++){positions.set(s.position.subarray(i*3,i*3+3),i*4);positions[i*4+3]=s.foam[i];velocities.set(s.velocity.subarray(i*3,i*3+3),i*4);}
    device.queue.writeBuffer(this.positions,0,positions);device.queue.writeBuffer(this.velocities,0,velocities);
    const resources=[this.params,this.positions,this.velocities,this.old,this.delta,this.pressure,this.counts,this.bins,this.priorV];
    const layout=device.createBindGroupLayout({entries:resources.map((_,binding)=>({binding,visibility:GPUShaderStage.COMPUTE,buffer:{type:binding===0?'uniform':'storage'}}))});
    this.group=device.createBindGroup({layout,entries:resources.map((buffer,binding)=>({binding,resource:{buffer}}))});
    const pipelineLayout=device.createPipelineLayout({bindGroupLayouts:[layout]}),module=device.createShaderModule({code:SHADER});
    const info=await module.getCompilationInfo();const errors=info.messages.filter(m=>m.type==='error');if(errors.length)throw new Error(errors.map(m=>`WGSL ${m.lineNum}:${m.linePos}: ${m.message}`).join('; '));
    this.pipelines={};for(const name of ['clear','predict','hash','density','correct','apply','velocity','viscosity','finish'])this.pipelines[name]=await device.createComputePipelineAsync({layout:pipelineLayout,compute:{module,entryPoint:name}});
    this.readSize=s.count*40+4;this.readback=device.createBuffer({size:this.readSize,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});this.buffers.push(this.readback);
  }
  async advance(steps=2) {
    const s=this.reference,device=this.device,encoder=device.createCommandEncoder();
    encoder.clearBuffer(this.counts,this.cells*4,4);
    const run=name=>{const pass=encoder.beginComputePass();pass.setPipeline(this.pipelines[name]);pass.setBindGroup(0,this.group);pass.dispatchWorkgroups(Math.ceil(name==='clear'?(this.cells+1)/128:s.count/64));pass.end();};
    for(let step=0;step<steps;step++){
      run('predict');for(let i=0;i<s.iterations;i++){run('clear');run('hash');run('density');run('correct');run('apply');}run('velocity');run('viscosity');run('finish');
    }
    const n=s.count;encoder.copyBufferToBuffer(this.positions,0,this.readback,0,n*16);encoder.copyBufferToBuffer(this.velocities,0,this.readback,n*16,n*16);encoder.copyBufferToBuffer(this.pressure,0,this.readback,n*32,n*8);
    encoder.copyBufferToBuffer(this.counts,this.cells*4,this.readback,n*40,4);
    device.queue.submit([encoder.finish()]);await this.readback.mapAsync(GPUMapMode.READ);
    const mapped=this.readback.getMappedRange(),data=new Float32Array(mapped);
    for(let i=0;i<n;i++){s.position.set(data.subarray(i*4,i*4+3),i*3);s.foam[i]=data[i*4+3];s.velocity.set(data.subarray(n*4+i*4,n*4+i*4+3),i*3);s.density[i]=data[n*8+i*2+1];}
    const overflow=new Uint32Array(mapped)[n*10];
    this.readback.unmap();if(overflow)throw new Error('Fluid grid capacity exceeded');s.time+=steps/120;
  }
  dispose(){this.buffers.forEach(b=>b.destroy());this.device.destroy();}
}
