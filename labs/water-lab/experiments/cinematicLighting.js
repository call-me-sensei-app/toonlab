import * as THREE from 'three';
import { PMREMGenerator } from 'three/webgpu';
import { createEnvironmentSunShadowPass } from '../../../src/environment/environmentSunShadowPass.js';

export function createCinematicWaterLighting({renderer,scene,sun,hemi}) {
  const rim=new THREE.DirectionalLight(0xa9d8ff,0);rim.position.set(-9,7,-8);scene.add(rim);
  const fill=new THREE.DirectionalLight(0xc4dfff,0);fill.position.set(9,4,8);scene.add(fill);
  const shadow=createEnvironmentSunShadowPass({renderer,scene});
  let frame=0,enabled=false,environment=null,generator=null;
  const originalExposure=renderer.toneMappingExposure,originalToneMapping=renderer.toneMapping;
  sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-16;sun.shadow.camera.right=16;
  sun.shadow.camera.top=15;sun.shadow.camera.bottom=-15;sun.shadow.camera.near=.5;sun.shadow.camera.far=100;
  sun.shadow.bias=-.0003;sun.shadow.normalBias=.045;sun.shadow.radius=3;
  return {
    apply(stage,mode,exposure=.92) {
      enabled=Boolean(stage)&&mode==='cinematic';
      // The shared node shadow pass owns the map; a second built-in shadow pass
      // can retain retired geometry during scene changes.
      renderer.shadowMap.enabled=false;sun.castShadow=enabled;
      rim.intensity=enabled?(stage==='glass-box'?1.5:2.3):0;
      fill.intensity=enabled?.22:0;
      renderer.toneMapping=enabled?THREE.ACESFilmicToneMapping:originalToneMapping;
      renderer.toneMappingExposure=enabled?exposure:originalExposure;
      if(enabled){sun.position.set(-18,24,12);sun.target.position.set(0,1,-1);sun.color.set(0xffddb1);sun.intensity=stage==='glass-box'?1.3:3.6;hemi.intensity=.12;}
      if(typeof document!=='undefined')document.body.dataset.waterLighting=enabled?'cinematic':'neutral';
    },
    prepare(stage) {
      if(!enabled)return;
      shadow.update({dynamic:frame++%60===0});
      if(stage==='glass-box')return; // Tank owns its matching studio reflections.
      if(!environment) {
        const studio=new THREE.Scene();studio.background=new THREE.Color(.065,.10,.16);
        const panels=[];
        const panel=(size,position,color)=>{const mesh=new THREE.Mesh(new THREE.PlaneGeometry(...size),new THREE.MeshBasicMaterial({color:new THREE.Color(...color),side:THREE.DoubleSide}));mesh.position.set(...position);mesh.lookAt(0,0,0);studio.add(mesh);panels.push(mesh);};
        panel([22,12],[-18,24,12],[3.8,3.2,2.5]);
        panel([12,16],[-9,7,-8],[.8,1.4,2.4]);
        panel([30,30],[0,30,0],[.2,.32,.5]);
        generator=new PMREMGenerator(renderer);environment=generator.fromScene(studio,.025);
        panels.forEach(p=>{p.geometry.dispose();p.material.dispose();});
      }
      scene.environment=environment.texture;scene.environmentIntensity=.7;
    },
    dispose(){shadow.dispose();environment?.dispose();generator?.dispose();rim.removeFromParent();fill.removeFromParent();}
  };
}
