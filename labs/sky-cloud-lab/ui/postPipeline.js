import * as THREE from 'three/webgpu';
import {
  acesFilmicToneMapping,
  float,
  hash,
  pass,
  renderOutput,
  rtt,
  screenUV,
  time,
  vec3,
  vec4,
} from 'three/tsl';

import { AutoExposure } from './autoExposure.js';

/** Scene -> sky composite -> exposure -> ACES -> dither graph. */
export class SkyPostPipeline {
  constructor({ renderer, scene, camera, sky }) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.sky = sky;
    this.pipeline = null;
    this.autoExposure = new AutoExposure({
      key: 0.25,
      adaptationSpeed: 4,
      minExposure: 0.05,
      maxExposure: 4,
      lowClip: 0.5,
      highClip: 0.02,
    });
    this.autoExposure.enabled = true;
    this.autoExposure.compensation = 1;
  }

  build() {
    this.pipeline?.dispose();
    const scenePass = pass(this.scene, this.camera);
    let output = scenePass.getTextureNode('output');
    output = this.sky.applyTo(output, scenePass);

    const hdrComposite = rtt(output);
    this.autoExposure.setSource(hdrComposite.value);
    output = hdrComposite.sample(screenUV);
    output = vec4(output.rgb.mul(this.autoExposure.exposureUniform), output.a);

    let sdr = vec4(acesFilmicToneMapping(output.rgb, float(1)), output.a);
    sdr = renderOutput(sdr);

    const frameOffset = hash(time.mul(float(60)).add(float(1))).mul(float(16777216));
    const seed = screenUV.x
      .mul(float(4096))
      .add(screenUV.y.mul(float(16777216)))
      .add(frameOffset);
    const dither = hash(seed)
      .sub(hash(seed.add(float(7919))))
      .div(float(255));
    sdr = vec4(sdr.rgb.add(vec3(dither, dither, dither)), sdr.a);

    this.pipeline = new THREE.RenderPipeline(this.renderer, sdr);
    this.pipeline.outputColorTransform = false;
  }

  setComparisonExposure(value = null) {
    this.autoExposure.setFixedExposure(value);
  }

  render(delta) {
    this.pipeline?.render();
    this.autoExposure.update(this.renderer, delta, this.sky.atmosphere.exposure.value);
  }

  dispose() {
    this.pipeline?.dispose();
    this.autoExposure.dispose();
  }
}
