import * as THREE from 'three';

let cached;
// Packed bubble membranes and separated small bubbles. Generated once;
// this is surface detail, not glowing spray points or a scrolling photograph.
export function getWaterFoamTexture() {
  if (cached) return cached;
  const n=512, cells=32, data=new Uint8Array(n*n*4);
  const hash=(x,y,salt=0)=>{const v=Math.sin(x*127.1+y*311.7+salt*91.3)*43758.5453;return v-Math.floor(v);};
  const wrap=v=>(v%cells+cells)%cells;
  const smooth=(a,b,v)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};
  const noise=(x,y)=>{
    const ix=Math.floor(x),iy=Math.floor(y),tx=smooth(0,1,x-ix),ty=smooth(0,1,y-iy);
    const h=(a,b)=>hash((a%8+8)%8,(b%8+8)%8,9);
    return (h(ix,iy)*(1-tx)+h(ix+1,iy)*tx)*(1-ty)+(h(ix,iy+1)*(1-tx)+h(ix+1,iy+1)*tx)*ty;
  };
  for(let y=0;y<n;y++)for(let x=0;x<n;x++) {
    const px=x/n*cells,py=y/n*cells,ix=Math.floor(px),iy=Math.floor(py);
    let d1=Infinity,d2=Infinity,radius=.4;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++) {
      const sx=ix+dx,sy=iy+dy,hx=wrap(sx),hy=wrap(sy);
      const ox=sx+.15+.7*hash(hx,hy),oy=sy+.15+.7*hash(hx,hy,1);
      const d=Math.hypot(px-ox,py-oy);
      if(d<d1){d2=d1;d1=d;radius=.23+.18*hash(hx,hy,2);}else if(d<d2)d2=d;
    }
    const rim=1-smooth(.025,.11,d2-d1);
    const disk=1-smooth(radius-.04,radius+.025,d1);
    const i=(y*n+x)*4;
    data[i]=Math.round(255*(.68+.32*rim));
    data[i+1]=Math.round(255*disk);
    data[i+2]=Math.round(255*noise(x/n*8,y/n*8));
    // A second, coarser cellular field stores only narrow shared borders.
    // These are the connected foam strands around clear-water pockets.
    // Two periodic shears curve the cell walls without collapsing their
    // area. Straight Voronoi bisectors otherwise read as cracked ice.
    const mx=x/n*6+.20*Math.sin(y/n*Math.PI*6)+.07*Math.sin(y/n*Math.PI*14+1.2);
    const my=y/n*6+.20*Math.sin(mx/6*Math.PI*6+.8)+.08*Math.sin(mx/6*Math.PI*10);
    const bx=Math.floor(mx),by=Math.floor(my);
    let m1=Infinity,m2=Infinity;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++) {
      const sx=bx+dx,sy=by+dy,hx=(sx%6+6)%6,hy=(sy%6+6)%6;
      const ox=sx+.15+.7*hash(hx,hy,31),oy=sy+.15+.7*hash(hx,hy,37);
      const distance=Math.hypot(mx-ox,my-oy);
      if(distance<m1){m2=m1;m1=distance;}else if(distance<m2)m2=distance;
    }
    const gap=m2-m1,width=.045+.11*noise(x/n*8,y/n*8);
    const core=1-smooth(.012,.04,gap);
    const fringe=(1-smooth(.014,width,gap))*(.45+.55*disk);
    data[i+3]=Math.round(255*Math.max(core,fringe));
  }
  cached=new THREE.DataTexture(data,n,n,THREE.RGBAFormat);
  cached.name='WaterFoamBubbles';
  cached.wrapS=cached.wrapT=THREE.RepeatWrapping;
  cached.minFilter=THREE.LinearMipmapLinearFilter;cached.magFilter=THREE.LinearFilter;
  cached.generateMipmaps=true;cached.needsUpdate=true;
  return cached;
}
