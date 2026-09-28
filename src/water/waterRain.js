import * as THREE from 'three';

import { createWaterRainNodeMaterial } from '../shaders-tsl/water-rain.js';
import { markFactorySystemOwned } from '../styles/styleMetadata.js';

// Node-backend rain: WGSL has no gl_PointSize, so the streak POINTS become
// instanced billboard quads (dust-motes pattern; see water-rain.js). Same
// public API as the classic Points-based WaterRain — the WaterRain
// constructor returns an instance of this class on the TSL backend.
class WaterRainNodeMesh extends THREE.Mesh {
  constructor({
    count = 2400,
    areaSize = 30,
    fallHeight = 16,
    speed = 16,
    streakLength = 0.42,
    wind = [2.2, 0.8],
    color = [0.8, 0.88, 0.95],
    opacity = 0.34,
  } = {}) {
    const quad = new THREE.PlaneGeometry(1, 1);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = quad.index;
    geometry.setAttribute('position', quad.attributes.position);
    geometry.setAttribute('uv', quad.attributes.uv);
    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < count; i += 1) {
      seeds[i * 4] = Math.random();
      seeds[i * 4 + 1] = Math.random();
      seeds[i * 4 + 2] = Math.random();
      seeds[i * 4 + 3] = Math.random();
    }
    geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
    geometry.instanceCount = count;
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);

    const material = createWaterRainNodeMaterial({
      areaSize, color, fallHeight, opacity, speed, streakLength, wind,
    });

    super(geometry, material);
    this.name = 'WaterRain';
    markFactorySystemOwned(this, 'water', 'toonlab/water-rain');
    this.frustumCulled = false;
    this.renderOrder = 40;
    this.count = count;
    this.baseOpacity = opacity;
    this.intensity = 1;
    // Rain is an overlay effect: keep it out of the water's scene passes.
    this.userData.waterExclude = true;
  }

  setIntensity(intensity) {
    this.intensity = THREE.MathUtils.clamp(intensity, 0, 1);
    this.visible = this.intensity > 0.005;
    this.material.uniforms.uOpacity.value = this.baseOpacity * (0.4 + 0.6 * this.intensity);
    // Instanced quads: the draw-count scaling happens through instanceCount
    // (setDrawRange would trim the base quad, not the particle pool).
    this.geometry.instanceCount = Math.floor(this.count * this.intensity);
    return this;
  }

  update(delta, camera, renderer, waterLevel = 0) {
    const uniforms = this.material.uniforms;
    uniforms.uTime.value += Math.min(Math.max(delta ?? 0.016, 0), 0.1);
    if (camera) {
      const position = camera.getWorldPosition(new THREE.Vector3());
      uniforms.uCenter.value.set(position.x, waterLevel, position.z);
    }
    if (renderer) {
      uniforms.uPixelRatio.value = renderer.getPixelRatio();
      uniforms.uPointScale.value = (renderer.domElement?.clientHeight || 540) * 0.9;
    }
    return this;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}

// Procedural rain: GPU-looping streak particles in a volume that follows a
// center point (usually the camera over the water). No texture assets and no
// per-frame buffer writes; intensity scales draw count and opacity.
//
//   const rain = new WaterRain({ count: 2600 });
//   scene.add(rain);
//   rain.setIntensity(0.9);
//   rain.update(delta, camera, renderer, waterLevel);   // each frame
//
// Pair it with WaterSurface.addRipple(...) dimples for rain-pocked water.
export class WaterRain extends THREE.Points {
  constructor({
    count = 2400,
    areaSize = 30,
    fallHeight = 16,
    speed = 16,
    streakLength = 0.42,
    wind = [2.2, 0.8],
    color = [0.8, 0.88, 0.95],
    opacity = 0.34,
  } = {}) {
    // Derived constructors may skip super() when they return an object: the
    // instanced-quad implementation keeps the same public API surface, so call
    // sites stay `new WaterRain(...)`.
    return new WaterRainNodeMesh({
      areaSize, color, count, fallHeight, opacity, speed, streakLength, wind,
    });
  }

  setIntensity(intensity) {
    this.intensity = THREE.MathUtils.clamp(intensity, 0, 1);
    this.visible = this.intensity > 0.005;
    this.material.uniforms.uOpacity.value = this.baseOpacity * (0.4 + 0.6 * this.intensity);
    this.geometry.setDrawRange(0, Math.floor(this.count * this.intensity));
    return this;
  }

  update(delta, camera, renderer, waterLevel = 0) {
    const uniforms = this.material.uniforms;
    uniforms.uTime.value += Math.min(Math.max(delta ?? 0.016, 0), 0.1);
    if (camera) {
      const position = camera.getWorldPosition(new THREE.Vector3());
      uniforms.uCenter.value.set(position.x, waterLevel, position.z);
    }
    if (renderer) {
      uniforms.uPixelRatio.value = renderer.getPixelRatio();
      uniforms.uPointScale.value = (renderer.domElement?.clientHeight || 540) * 0.9;
    }
    return this;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
