import * as THREE from 'three';

import { createWaterSimulationNodeMaterial } from '../shaders-tsl/water-simulation.js';

export const WATER_SIM_MAX_IMPULSES = 16;

const FIXED_TIMESTEP = 1 / 120;
const MAX_SUBSTEPS_PER_FRAME = 6;

// GPU ping-pong heightfield for interactive ripples (character wakes, splash
// rings, rain, projectiles). State texture: R = height, G = velocity,
// B = foam energy. The simulated window can follow a moving target via
// setCenter(); the reprojection shift is texel-exact so ripples stay put in
// world space while the window travels.
export class WaterRippleSimulation {
  constructor({
    resolution = 256,
    worldWidth = 20,
    worldDepth = 20,
    centerX = 0,
    centerZ = 0,
  } = {}) {
    this.resolution = Math.max(16, Math.floor(resolution));
    this.worldWidth = Math.max(0.1, worldWidth);
    this.worldDepth = Math.max(0.1, worldDepth);
    this.centerX = centerX;
    this.centerZ = centerZ;

    this.parameters = {
      rippleDamping: 0.985,
      ripplePropagation: 11,
      rippleFoamDecay: 0.94,
      rippleFoamGain: 2.4,
    };

    this.targets = [this.createTarget(), this.createTarget()];
    this.readIndex = 0;
    this.initialized = false;
    this.timeAccumulator = 0;
    this.pendingImpulses = [];
    this.pendingShiftTexels = new THREE.Vector2(0, 0);

    // Same fullscreen ping-pong contract and uniform-name surface as the
    // retired ShaderMaterial path; the update loop writes `.value`s unchanged.
    this.material = createWaterSimulationNodeMaterial({
      maxImpulses: WATER_SIM_MAX_IMPULSES,
      resolution: this.resolution,
    });
    this.material.uniforms.uDamping.value = this.parameters.rippleDamping;
    this.material.uniforms.uFoamDecay.value = this.parameters.rippleFoamDecay;
    this.material.uniforms.uFoamGain.value = this.parameters.rippleFoamGain;
    this.material.uniforms.uRegionWorldSize.value.set(this.worldWidth, this.worldDepth);

    this.fullscreenScene = new THREE.Scene();
    this.fullscreenCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    quad.frustumCulled = false;
    this.fullscreenScene.add(quad);
  }

  createTarget() {
    const target = new THREE.WebGLRenderTarget(this.resolution, this.resolution, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false,
    });
    target.texture.name = 'waterRippleState';
    return target;
  }

  get texture() {
    return this.targets[this.readIndex].texture;
  }

  get texelSize() {
    return this.material.uniforms.uTexel.value;
  }

  // (centerX, centerZ, halfWidth, halfDepth) for the surface shader.
  getRegion(out = new THREE.Vector4()) {
    return out.set(this.centerX, this.centerZ, this.worldWidth * 0.5, this.worldDepth * 0.5);
  }

  setParameters(parameters = {}) {
    for (const key of Object.keys(this.parameters)) {
      if (Number.isFinite(parameters[key])) this.parameters[key] = parameters[key];
    }
    return this;
  }

  // Moves the simulated window; existing ripples remain fixed in world space.
  setCenter(x, z) {
    const texelWorldX = this.worldWidth / this.resolution;
    const texelWorldZ = this.worldDepth / this.resolution;
    const quantizedX = Math.round(x / texelWorldX) * texelWorldX;
    const quantizedZ = Math.round(z / texelWorldZ) * texelWorldZ;
    this.pendingShiftTexels.x += (quantizedX - this.centerX) / texelWorldX;
    this.pendingShiftTexels.y += (quantizedZ - this.centerZ) / texelWorldZ;
    this.centerX = quantizedX;
    this.centerZ = quantizedZ;
    return this;
  }

  containsPoint(worldX, worldZ, margin = 0) {
    return Math.abs(worldX - this.centerX) <= this.worldWidth * 0.5 - margin &&
      Math.abs(worldZ - this.centerZ) <= this.worldDepth * 0.5 - margin;
  }

  // Queues a gaussian impulse at a world position. strength is a vertical
  // velocity kick in m/s; negative values push the surface down.
  addImpulse(worldX, worldZ, { radius = 0.35, strength = 0.6 } = {}) {
    if (!this.containsPoint(worldX, worldZ)) return this;
    if (this.pendingImpulses.length >= WATER_SIM_MAX_IMPULSES * 4) return this;
    this.pendingImpulses.push({ worldX, worldZ, radius, strength });
    return this;
  }

  // Queues a ring of impulses, used by splashes for an outward-running wave.
  addRingImpulse(worldX, worldZ, { radius = 0.5, strength = 0.6, points = 6 } = {}) {
    for (let i = 0; i < points; i += 1) {
      const angle = (i / points) * Math.PI * 2;
      this.addImpulse(
        worldX + Math.cos(angle) * radius,
        worldZ + Math.sin(angle) * radius,
        { radius: radius * 0.8, strength: strength / points * 2.4 },
      );
    }
    return this;
  }

  writeImpulseUniforms() {
    const impulses = this.material.uniforms.uImpulses.value;
    const count = Math.min(this.pendingImpulses.length, WATER_SIM_MAX_IMPULSES);
    for (let i = 0; i < count; i += 1) {
      const impulse = this.pendingImpulses[i];
      impulses[i].set(
        (impulse.worldX - this.centerX) / this.worldWidth + 0.5,
        (impulse.worldZ - this.centerZ) / this.worldDepth + 0.5,
        Math.max(impulse.radius, 1e-3),
        impulse.strength,
      );
    }
    this.material.uniforms.uImpulseCount.value = count;
    this.pendingImpulses.splice(0, count);
  }

  clearTargets(renderer) {
    const previousTarget = renderer.getRenderTarget();
    const previousClearColor = renderer.getClearColor(new THREE.Color());
    const previousClearAlpha = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 0);
    for (const target of this.targets) {
      renderer.setRenderTarget(target);
      renderer.clear(true, false, false);
    }
    renderer.setRenderTarget(previousTarget);
    renderer.setClearColor(previousClearColor, previousClearAlpha);
  }

  step(renderer) {
    const uniforms = this.material.uniforms;
    uniforms.uPrevState.value = this.targets[this.readIndex].texture;
    const writeTarget = this.targets[1 - this.readIndex];
    renderer.setRenderTarget(writeTarget);
    renderer.render(this.fullscreenScene, this.fullscreenCamera);
    this.readIndex = 1 - this.readIndex;
  }

  update(renderer, delta) {
    if (!this.initialized) {
      this.clearTargets(renderer);
      this.initialized = true;
    }

    this.timeAccumulator += Math.min(Math.max(delta, 0), 0.1);
    let substeps = Math.floor(this.timeAccumulator / FIXED_TIMESTEP);
    if (substeps <= 0 && this.pendingImpulses.length === 0) return;
    substeps = Math.min(substeps, MAX_SUBSTEPS_PER_FRAME);
    this.timeAccumulator = Math.max(
      0, Math.min(this.timeAccumulator - substeps * FIXED_TIMESTEP, FIXED_TIMESTEP));

    const uniforms = this.material.uniforms;
    const texelWorld = this.worldWidth / this.resolution;
    // Explicit heightfield stability (CFL): c * dt / dx must stay under ~0.7.
    const maxPropagationSpeed = (texelWorld * 0.7) / FIXED_TIMESTEP;
    const speed = Math.min(this.parameters.ripplePropagation, maxPropagationSpeed);
    uniforms.uPropagation.value = (speed / texelWorld) * (speed / texelWorld);
    uniforms.uDamping.value = this.parameters.rippleDamping;
    uniforms.uFoamDecay.value = this.parameters.rippleFoamDecay;
    uniforms.uFoamGain.value = this.parameters.rippleFoamGain;
    uniforms.uDelta.value = FIXED_TIMESTEP;
    uniforms.uRegionWorldSize.value.set(this.worldWidth, this.worldDepth);

    const previousTarget = renderer.getRenderTarget();
    const previousXrEnabled = renderer.xr.enabled;
    renderer.xr.enabled = false;
    try {
      for (let i = 0; i < Math.max(substeps, this.pendingImpulses.length > 0 ? 1 : 0); i += 1) {
        // Region shift and queued impulses apply on the first substep only.
        if (i === 0) {
          uniforms.uRegionShiftTexels.value.copy(this.pendingShiftTexels);
          this.pendingShiftTexels.set(0, 0);
          this.writeImpulseUniforms();
        } else {
          uniforms.uRegionShiftTexels.value.set(0, 0);
          uniforms.uImpulseCount.value = 0;
        }
        this.step(renderer);
      }
    } finally {
      renderer.setRenderTarget(previousTarget);
      renderer.xr.enabled = previousXrEnabled;
    }
  }

  dispose() {
    for (const target of this.targets) target.dispose();
    this.material.dispose();
    this.fullscreenScene.traverse((object) => object.geometry?.dispose?.());
  }
}
