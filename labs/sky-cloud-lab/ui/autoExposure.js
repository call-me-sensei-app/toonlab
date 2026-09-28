import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import {
  Fn,
  dot,
  float,
  max,
  texture,
  uniform,
  uv,
  vec3,
  vec4,
} from 'three/tsl';

const fullscreenCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const fullscreenGeometry = new THREE.PlaneGeometry(2, 2);

/** Percentile auto-exposure meter used by the sky lab. */
export class AutoExposure {
  enabled = false;
  key = 0.18;
  adaptationSpeed = 4;
  minExposure = 0.05;
  maxExposure = 8;
  lowClip = 0.5;
  highClip = 0.02;
  compensation = 1;
  fixedExposure = null;

  exposureUniform = uniform(1);

  constructor({
    resolution = 64,
    key,
    adaptationSpeed,
    minExposure,
    maxExposure,
    lowClip,
    highClip,
  } = {}) {
    this.resolution = resolution;
    if (key !== undefined) this.key = key;
    if (adaptationSpeed !== undefined) this.adaptationSpeed = adaptationSpeed;
    if (minExposure !== undefined) this.minExposure = minExposure;
    if (maxExposure !== undefined) this.maxExposure = maxExposure;
    if (lowClip !== undefined) this.lowClip = lowClip;
    if (highClip !== undefined) this.highClip = highClip;

    this.meterTarget = new THREE.RenderTarget(resolution, resolution, {
      type: THREE.FloatType,
      format: THREE.RGBAFormat,
      depthBuffer: false,
      magFilter: THREE.NearestFilter,
      minFilter: THREE.NearestFilter,
    });
    this.meterTarget.texture.name = 'ToonLabAutoExposureMeter';
    this.scratch = new Float32Array(resolution * resolution);
    this.scene = null;
    this.material = null;
    this.adaptedLuminance = 0.18;
    this.targetLuminance = 0.18;
    this.readbackPending = false;
  }

  setSource(sourceTexture) {
    this.material?.dispose();
    const source = texture(sourceTexture);
    const material = new MeshBasicNodeMaterial();
    material.depthTest = false;
    material.depthWrite = false;
    material.toneMapped = false;
    material.colorNode = Fn(() => {
      const color = source.sample(uv()).rgb;
      const luminance = max(dot(color, vec3(0.2126, 0.7152, 0.0722)), float(0));
      return vec4(luminance, luminance, luminance, float(1));
    })();
    const mesh = new THREE.Mesh(fullscreenGeometry, material);
    this.scene = new THREE.Scene();
    this.scene.add(mesh);
    this.material = material;
  }

  /** Locks exposure to a reviewed comparison value, or restores auto metering. */
  setFixedExposure(value = null) {
    this.fixedExposure = Number.isFinite(value) && value > 0 ? value : null;
    if (this.fixedExposure !== null) {
      this.exposureUniform.value = this.fixedExposure;
    }
  }

  update(renderer, delta, manualExposure) {
    // The authored value is a multiplier around the neutral exposure of 1.
    // Meter the pre-exposure image so adaptation cannot cancel this edit.
    const authoredExposure = Number.isFinite(manualExposure)
      ? Math.max(0, manualExposure)
      : 1;
    if (this.fixedExposure !== null) {
      this.exposureUniform.value = this.fixedExposure * authoredExposure;
      return;
    }
    if (!this.enabled) {
      this.exposureUniform.value = authoredExposure;
      return;
    }

    if (this.scene) {
      const previousTarget = renderer.getRenderTarget();
      renderer.setRenderTarget(this.meterTarget);
      renderer.render(this.scene, fullscreenCamera);
      renderer.setRenderTarget(previousTarget);
      this.readback(renderer);
    }

    const blend = 1 - Math.exp(-delta * Math.max(this.adaptationSpeed, 1e-4));
    this.adaptedLuminance += (
      this.targetLuminance - this.adaptedLuminance
    ) * blend;
    const exposure = (
      this.key / Math.max(this.adaptedLuminance, 1e-5)
    ) * this.compensation;
    this.exposureUniform.value = Math.min(
      Math.max(exposure, this.minExposure),
      this.maxExposure,
    ) * authoredExposure;
  }

  readback(renderer) {
    if (this.readbackPending) return;
    this.readbackPending = true;
    renderer.readRenderTargetPixelsAsync(
      this.meterTarget,
      0,
      0,
      this.resolution,
      this.resolution,
    ).then((data) => {
      this.targetLuminance = this.clippedGeometricMean(data);
    }).catch(() => {
      // Keep adapting toward the last successful meter value.
    }).finally(() => {
      this.readbackPending = false;
    });
  }

  clippedGeometricMean(data) {
    const count = this.resolution * this.resolution;
    const luminances = this.scratch;
    for (let index = 0; index < count; index += 1) {
      luminances[index] = data[index * 4];
    }
    luminances.sort();
    const low = Math.min(Math.floor(count * this.lowClip), count - 1);
    const high = Math.max(count - Math.floor(count * this.highClip), low + 1);
    let logSum = 0;
    let sampleCount = 0;
    for (let index = low; index < high; index += 1) {
      logSum += Math.log(Math.max(luminances[index], 1e-5));
      sampleCount += 1;
    }
    return sampleCount > 0
      ? Math.exp(logSum / sampleCount)
      : this.targetLuminance;
  }

  dispose() {
    this.meterTarget.dispose();
    this.material?.dispose();
  }
}
