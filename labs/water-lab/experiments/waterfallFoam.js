// A surface concentration field: impact sources, transport, spreading and decay.
// This is a whitewater appearance model, not an air/water pressure solver.
export class WaterfallFoamField {
  constructor({impactZ=0,resolution=128}={}) {
    this.n=resolution;this.minX=-6;this.minZ=impactZ-3;this.size=12;this.cell=this.size/(resolution-1);
    this.current=new Float32Array(resolution*resolution);this.next=this.current.slice();
  }
  sample(x,z,field=this.current) {
    const gx=(x-this.minX)/this.cell,gz=(z-this.minZ)/this.cell;
    if(gx<0||gz<0||gx>=this.n-1||gz>=this.n-1)return 0;
    const ix=Math.floor(gx),iz=Math.floor(gz),fx=gx-ix,fz=gz-iz,k=iz*this.n+ix;
    return (field[k]*(1-fx)+field[k+1]*fx)*(1-fz)+(field[k+this.n]*(1-fx)+field[k+this.n+1]*fx)*fz;
  }
  step(dt,{sources,energy=1,surface}={}) {
    dt=Math.min(dt,.05);if(dt<=0)return;
    const decay=Math.exp(-dt/5),n=this.n;
    for(let z=0;z<n;z++)for(let x=0;x<n;x++) {
      const wx=this.minX+x*this.cell,wz=this.minZ+z*this.cell,k=z*n+x;
      if(surface?.(wx,wz,.2)?.height>.015){this.next[k]=0;continue;}
      // Diverging plunge flow followed by downstream transport, with broad eddies.
      const vx=Math.tanh(wx)*.32+.14*Math.sin(wz*1.7),vz=.42+.15*Math.cos(wx*1.6);
      this.next[k]=Math.max(0,Math.min(1,this.sample(wx-vx*dt,wz-vz*dt)*decay*Math.exp(-dt*.32/(Math.cosh(wx)**2))));
    }
    for(const source of sources??[]) {
      const cx=(source[0]-this.minX)/this.cell,cz=(source[2]-this.minZ)/this.cell,radius=.6/this.cell;
      for(let z=Math.max(0,Math.floor(cz-radius*2));z<Math.min(n,Math.ceil(cz+radius*2));z++)for(let x=Math.max(0,Math.floor(cx-radius*2));x<Math.min(n,Math.ceil(cx+radius*2));x++) {
        const wx=this.minX+x*this.cell,wz=this.minZ+z*this.cell;
        if(surface?.(wx,wz,.2)?.height>.015)continue;
        const influence=Math.exp(-((x-cx)**2+(z-cz)**2)/(radius*radius));
        const k=z*n+x;this.next[k]=Math.min(1,this.next[k]+influence*dt*energy*3.5/Math.max(1,(sources??[]).length/5));
      }
    }
    [this.current,this.next]=[this.next,this.current];
  }
  reset(){this.current.fill(0);this.next.fill(0);}
}
