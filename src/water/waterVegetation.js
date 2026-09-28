import * as THREE from 'three';

import { createWaterKelpNodeMaterial } from '../shaders-tsl/water-kelp.js';
import { markFactorySystemOwned } from '../styles/styleMetadata.js';

function setSrgbColor(color, rgb) {
  color.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);
}

function mulberry32(seed) {
  let state = (Math.trunc(seed) || 1) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

// Instanced underwater kelp blades that sway with the water flow — a scale
// and motion reference for underwater camera work. Fully procedural.
//
//   const kelp = new WaterKelpField({
//     placements: positions.map((p) => ({ x: p.x, y: bedHeight(p), z: p.z })),
//   });
//   scene.add(kelp);
//   kelp.update(delta);                       // each frame
//   kelp.setFlow(settings.flowDirection, settings.flowSpeed);
export class WaterKelpField extends THREE.Mesh {
  constructor({
    placements = [],
    heightRange = [0.7, 1.6],
    widthRange = [0.1, 0.2],
    swayAmplitude = 0.24,
    kelpColor = [0.32, 0.7, 0.42],
    kelpShadeColor = [0.1, 0.36, 0.28],
    shadowStrength = 0.55,
    seed = 1,
  } = {}) {
    const count = Math.max(placements.length, 1);
    const blade = new THREE.PlaneGeometry(1, 1, 1, 6);
    blade.translate(0, 0.5, 0);

    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = blade.index;
    geometry.setAttribute('position', blade.attributes.position);
    geometry.setAttribute('uv', blade.attributes.uv);

    const origins = new Float32Array(count * 3);
    const infos = new Float32Array(count * 4);
    const random = mulberry32(seed);
    placements.forEach((placement, i) => {
      origins[i * 3] = placement.x ?? 0;
      origins[i * 3 + 1] = placement.y ?? 0;
      origins[i * 3 + 2] = placement.z ?? 0;
      infos[i * 4] = placement.height ??
        THREE.MathUtils.lerp(heightRange[0], heightRange[1], random());
      infos[i * 4 + 1] = random();
      infos[i * 4 + 2] = placement.width ??
        THREE.MathUtils.lerp(widthRange[0], widthRange[1], random());
      infos[i * 4 + 3] = random() * Math.PI * 2;
    });
    geometry.setAttribute('iOrigin', new THREE.InstancedBufferAttribute(origins, 3));
    geometry.setAttribute('iInfo', new THREE.InstancedBufferAttribute(infos, 4));
    geometry.instanceCount = placements.length;
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);

    // getShadowMask() comes from the shared sun-shadow pass on the node
    // backends (see water-kelp.js).
    const material = createWaterKelpNodeMaterial({ shadowStrength, swayAmplitude });
    setSrgbColor(material.uniforms.uKelpColor.value, kelpColor);
    setSrgbColor(material.uniforms.uKelpShadeColor.value, kelpShadeColor);

    super(geometry, material);
    this.name = 'WaterKelpField';
    markFactorySystemOwned(this, 'water', 'toonlab/water-kelp-field');
    this.castShadow = true;
    this.frustumCulled = false;
    this.receiveShadow = true;
  }

  setFlow(flowDirection, flowSpeed) {
    const direction = this.material.uniforms.uFlowDirection.value;
    direction.set(flowDirection?.[0] ?? flowDirection?.x ?? 1, flowDirection?.[1] ?? flowDirection?.y ?? 0);
    if (Number.isFinite(flowSpeed)) this.material.uniforms.uFlowSpeed.value = flowSpeed;
    return this;
  }

  update(delta) {
    this.material.uniforms.uTime.value += Math.min(Math.max(delta ?? 0.016, 0), 0.1);
    return this;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
