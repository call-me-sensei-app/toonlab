import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { texture, screenUV, positionView, vec3, max, min, select, length, attribute } from 'three/tsl';

// The far water/air boundary supplies optical path length. A fixed thickness
// made thin lips look opaque and was multiplied fourfold by the tank's scale.
export class WaterVolumeOptics {
  constructor() {
    this.target=new THREE.RenderTarget(1,1,{type:THREE.HalfFloatType,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,depthBuffer:true});
    this.material=new MeshBasicNodeMaterial({side:THREE.BackSide});
    this.material.colorNode=vec3(positionView.z.negate());
    this.material.toneMapped=false;this.material.fog=false;
    this.material.isShadowPassMaterial=true;
    const back=texture(this.target.texture).sample(screenUV).r;
    const distance=back.add(positionView.z);
    this.thickness=select(distance.greaterThan(.002),min(distance.mul(length(positionView).div(max(positionView.z.negate(),.01))),12),max(.03,attribute('aWaterFallbackDepth','float')));
    this.size=new THREE.Vector2();this.clearColor=new THREE.Color();
  }
  capture(renderer,scene,camera) {
    renderer.getDrawingBufferSize(this.size);
    const width=Math.max(1,Math.round(this.size.x*.75)),height=Math.max(1,Math.round(this.size.y*.75));
    if(this.target.width!==width||this.target.height!==height)this.target.setSize(width,height);
    const hidden=[],materials=[];let count=0;
    scene.traverse(o=>{
      if(!(o.isMesh||o.isPoints||o.isSprite||o.isLine))return;
      if(o.userData.fluidVolume&&o.visible){count++;materials.push([o,o.material]);o.material=this.material;}
      else if(o.visible){hidden.push(o);o.visible=false;}
    });
    const target=renderer.getRenderTarget(),override=scene.overrideMaterial,background=scene.background,fog=scene.fog;
    const alpha=renderer.getClearAlpha();renderer.getClearColor(this.clearColor);
    try {
      // Direct substitution is intentional. scene.overrideMaterial plus
      // isShadowPassMaterial makes Three replace our depth color with the
      // source material's black shadow color and change the requested side.
      scene.overrideMaterial=null;scene.background=null;scene.fog=null;
      renderer.setRenderTarget(this.target);renderer.setClearColor(0x000000,0);renderer.clear();
      if(count)renderer.render(scene,camera);
    } finally {
      renderer.setRenderTarget(target);renderer.setClearColor(this.clearColor,alpha);
      scene.overrideMaterial=override;scene.background=background;scene.fog=fog;
      materials.forEach(([o,material])=>{o.material=material;});
      hidden.forEach(o=>{o.visible=true;});
    }
  }
  async audit(renderer,camera,point){
    const projected=new THREE.Vector3(...point).project(camera),x=Math.round((projected.x*.5+.5)*this.target.width),y=Math.round((.5-projected.y*.5)*this.target.height);
    const pixel=await renderer.readRenderTargetPixelsAsync(this.target,x,y,1,1);
    const viewPoint=new THREE.Vector3(...point).applyMatrix4(camera.matrixWorldInverse);
    return {backDepth:THREE.DataUtils.fromHalfFloat(pixel[0]),pointDepth:-viewPoint.z,pixel:[x,y],raw:Array.from(pixel)};
  }
  dispose(){this.target.dispose();this.material.dispose();}
}
