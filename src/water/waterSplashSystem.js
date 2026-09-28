import * as THREE from 'three';

import {
  createWaterSplashDropletsNodeMaterial,
  createWaterSplashSheetsNodeMaterial,
} from '../shaders-tsl/water-splash.js';
import { createWaterSettings } from './waterSettings.js';
import { markFactorySystemOwned } from '../styles/styleMetadata.js';

const SHEET_KIND_CROWN = 0;
const SHEET_KIND_RING = 1;

function setSrgbColor(color, rgb) {
  color.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);
}

// Procedural splash VFX: ballistic droplet points, a cylindrically billboarded
// spray crown, and expanding foam rings. Every sprite shape is drawn in the
// fragment shaders — the system ships with zero texture assets. Particles are
// GPU-resident: emitting writes spawn attributes once and trajectories are
// evaluated analytically per frame.
export class WaterSplashSystem extends THREE.Group {
  constructor({
    dropletPoolSize = 768,
    sheetPoolSize = 96,
    settings,
  } = {}) {
    super();
    this.name = 'WaterSplashSystem';
    markFactorySystemOwned(this, 'water', 'toonlab/water-splash-system');
    this.dropletPoolSize = dropletPoolSize;
    this.sheetPoolSize = sheetPoolSize;
    this.dropletCursor = 0;
    this.sheetCursor = 0;
    this.time = 0;
    this.settings = createWaterSettings(settings);

    this.buildDroplets();
    this.buildSheets();
    this.applySettings(this.settings);
  }

  buildDroplets() {
    const count = this.dropletPoolSize;

    // WGSL has no gl_PointSize: droplet points are instanced billboard quads
    // (dust-motes pattern). Attribute names/layout stay identical so
    // writeDroplet works unchanged; only the attribute class is instanced.
    const quad = new THREE.PlaneGeometry(1, 1);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = quad.index;
    geometry.setAttribute('position', quad.attributes.position);
    geometry.setAttribute('uv', quad.attributes.uv);
    const info = new Float32Array(count * 4);
    for (let i = 0; i < count; i += 1) info[i * 4] = -1e6;
    geometry.setAttribute('aSpawnOrigin', new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('aVelocity', new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('aInfo', new THREE.InstancedBufferAttribute(info, 4).setUsage(THREE.DynamicDrawUsage));
    geometry.instanceCount = count;
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);

    this.dropletMaterial = createWaterSplashDropletsNodeMaterial();
    this.droplets = new THREE.Mesh(geometry, this.dropletMaterial);
    this.droplets.frustumCulled = false;
    this.droplets.renderOrder = 30;
    this.add(this.droplets);
  }

  buildSheets() {
    const count = this.sheetPoolSize;
    // Subdivided so foam rings can drape over wave curvature in the vertex
    // shader instead of lying flat across a swell.
    const plane = new THREE.PlaneGeometry(1, 1, 6, 6);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = plane.index;
    geometry.setAttribute('position', plane.attributes.position);
    geometry.setAttribute('uv', plane.attributes.uv);

    const info = new Float32Array(count * 4);
    for (let i = 0; i < count; i += 1) info[i * 4] = -1e6;
    geometry.setAttribute('iOrigin', new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('iInfo', new THREE.InstancedBufferAttribute(info, 4).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('iKind', new THREE.InstancedBufferAttribute(new Float32Array(count), 1).setUsage(THREE.DynamicDrawUsage));
    // Local wave-motion scale at the sheet center (written per frame by the
    // owning WaterSurface); damps the drape in shallows/on the beach film.
    geometry.setAttribute('iSurface', new THREE.InstancedBufferAttribute(new Float32Array(count), 1).setUsage(THREE.DynamicDrawUsage));
    geometry.instanceCount = count;
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);

    this.sheetMaterial = createWaterSplashSheetsNodeMaterial();

    this.sheets = new THREE.Mesh(geometry, this.sheetMaterial);
    this.sheets.frustumCulled = false;
    this.sheets.renderOrder = 28;
    this.add(this.sheets);
  }

  applySettings(options = {}) {
    this.settings = createWaterSettings({ ...this.settings, ...options });
    setSrgbColor(this.dropletMaterial.uniforms.uDropletColor.value, this.settings.splashShadeColor);
    setSrgbColor(this.dropletMaterial.uniforms.uHighlightColor.value, this.settings.splashColor);
    setSrgbColor(this.sheetMaterial.uniforms.uSprayColor.value, this.settings.splashColor);
    setSrgbColor(this.sheetMaterial.uniforms.uSprayShadeColor.value, this.settings.splashShadeColor);
    return this;
  }

  writeDroplet(origin, velocity, life, size, delay = 0) {
    const i = this.dropletCursor;
    this.dropletCursor = (this.dropletCursor + 1) % this.dropletPoolSize;
    const spawn = this.droplets.geometry.attributes.aSpawnOrigin;
    const vel = this.droplets.geometry.attributes.aVelocity;
    const info = this.droplets.geometry.attributes.aInfo;
    spawn.setXYZ(i, origin.x, origin.y, origin.z);
    vel.setXYZ(i, velocity.x, velocity.y, velocity.z);
    info.setXYZW(i, this.time + delay, life, size, Math.random());
    spawn.needsUpdate = true;
    vel.needsUpdate = true;
    info.needsUpdate = true;
  }

  writeSheet(kind, origin, scale, life, delay = 0) {
    const i = this.sheetCursor;
    this.sheetCursor = (this.sheetCursor + 1) % this.sheetPoolSize;
    const originAttribute = this.sheets.geometry.attributes.iOrigin;
    const info = this.sheets.geometry.attributes.iInfo;
    const kindAttribute = this.sheets.geometry.attributes.iKind;
    originAttribute.setXYZ(i, origin.x, origin.y, origin.z);
    info.setXYZW(i, this.time + delay, life, scale, Math.random());
    kindAttribute.setX(i, kind);
    originAttribute.needsUpdate = true;
    info.needsUpdate = true;
    kindAttribute.needsUpdate = true;
  }

  // Emits droplets in a cone. position is local to this system's parent.
  emitDroplets(position, {
    count = 12,
    strength = 1,
    coneRadius = 0.16,
    upwardBias = 1,
  } = {}) {
    const scale = this.settings.splashScale;
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const radial = (0.45 + Math.random() * 1.25) * Math.pow(strength, 0.6) * scale;
      const upward = (1.5 + Math.random() * 1.9) * Math.pow(Math.min(strength, 2.2), 0.7) * upwardBias * scale;
      const origin = {
        x: position.x + Math.cos(angle) * coneRadius * Math.random() * scale,
        y: position.y + 0.02,
        z: position.z + Math.sin(angle) * coneRadius * Math.random() * scale,
      };
      const velocity = {
        x: Math.cos(angle) * radial,
        y: upward,
        z: Math.sin(angle) * radial,
      };
      const life = 0.5 + Math.random() * 0.5;
      const size = (0.02 + Math.random() * 0.04) * scale * (0.8 + 0.4 * Math.min(strength, 2));
      this.writeDroplet(origin, velocity, life, size);
    }
  }

  // Full composite splash: droplets + spray crown + expanding foam rings.
  emitSplash(position, { strength = 1 } = {}) {
    const settings = this.settings;
    const effective = strength * settings.splashStrength;
    if (effective <= 0.01) return;

    const dropletCount = Math.round(
      settings.splashDropletCount * Math.min(Math.max(effective, 0.25), 2.4));
    this.emitDroplets(position, { count: dropletCount, strength: effective });

    // A couple of chunky slow blobs read as the heavy core of the splash.
    this.emitDroplets(position, {
      count: Math.max(2, Math.round(dropletCount * 0.15)),
      strength: effective * 0.6,
      coneRadius: 0.05,
      upwardBias: 1.25,
    });

    const crownScale = (0.26 + 0.28 * Math.min(effective, 2.2)) * settings.splashScale;
    this.writeSheet(SHEET_KIND_CROWN, position, crownScale, 0.62);

    for (let i = 0; i < settings.splashRingCount; i += 1) {
      const ringScale = (0.55 + 0.4 * i + 0.34 * Math.min(effective, 2.2)) * settings.splashScale;
      this.writeSheet(SHEET_KIND_RING, position, ringScale, 0.85 + 0.3 * i, i * 0.09);
    }
  }

  // Re-anchors live surface-hugging sheets to the animated wave height.
  // heightSampler(localX, localZ) returns the surface height in parent-local
  // space; waveScaleSampler (optional) returns the local 0..1 wave-motion
  // scale used to drape ring geometry over the swell.
  updateSurfaceHeights(heightSampler, waveScaleSampler = null) {
    const origin = this.sheets.geometry.attributes.iOrigin;
    const surface = this.sheets.geometry.attributes.iSurface;
    const info = this.sheets.geometry.attributes.iInfo;
    let dirty = false;
    for (let i = 0; i < this.sheetPoolSize; i += 1) {
      const spawnTime = info.getX(i);
      if (spawnTime < -1e5) continue;
      const age = this.time - spawnTime;
      if (age < -0.5 || age > info.getY(i)) continue;
      const x = origin.getX(i);
      const z = origin.getZ(i);
      origin.setY(i, heightSampler(x, z));
      if (waveScaleSampler) surface.setX(i, waveScaleSampler(x, z));
      dirty = true;
    }
    if (dirty) {
      origin.needsUpdate = true;
      if (waveScaleSampler) surface.needsUpdate = true;
    }
  }

  // Shares the owning water material's Gerstner uniforms with the sheet
  // shader so rings can evaluate the same spectrum. Uniform objects are
  // shared by reference, keeping preset changes live.
  attachWaveUniforms(sourceMaterial) {
    const waveCount = sourceMaterial?.defines?.WATER_WAVE_COUNT;
    if (!waveCount || !sourceMaterial?.uniforms?.uWavesA) return this;
    // Rebuild the sheet material with the surface's wave uniform nodes in the
    // graph. Own uniforms are carried over so applySettings writes persist.
    this.sheetMaterial = createWaterSplashSheetsNodeMaterial({
      previous: this.sheetMaterial.uniforms,
      waves: {
        waveCount,
        wavesA: sourceMaterial.uniforms.uWavesA,
        wavesB: sourceMaterial.uniforms.uWavesB,
      },
    });
    this.sheets.material = this.sheetMaterial;
    return this;
  }

  update(time, renderer) {
    this.time = time;
    this.dropletMaterial.uniforms.uTime.value = time;
    this.sheetMaterial.uniforms.uTime.value = time;
    if (renderer) {
      this.dropletMaterial.uniforms.uPixelRatio.value = renderer.getPixelRatio();
      const height = renderer.domElement?.clientHeight || 540;
      this.dropletMaterial.uniforms.uPointScale.value = height * 0.9;
    }
  }

  dispose() {
    this.droplets.geometry.dispose();
    this.dropletMaterial.dispose();
    this.sheets.geometry.dispose();
    this.sheetMaterial.dispose();
  }
}
