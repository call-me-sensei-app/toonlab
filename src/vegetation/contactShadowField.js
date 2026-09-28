import * as THREE from 'three';
import { markFactorySystemOwned } from '../styles/styleMetadata.js';

export const CONTACT_SHADOW_AERIAL_FADE = Object.freeze({ end: 0.68, start: 0.34 });

function radialAlphaTexture(size = 64) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (x + 0.5) / size * 2 - 1;
      const dy = (y + 0.5) / size * 2 - 1;
      const radius = Math.hypot(dx, dy);
      const t = THREE.MathUtils.clamp(1 - radius, 0, 1);
      const alpha = Math.round(255 * t * t * (3 - 2 * t));
      const index = (y * size + x) * 4;
      // MeshBasicMaterial alphaMap samples the green channel. Populate all
      // channels so WebGL and WebGPU texture swizzles produce the same pool.
      data[index] = alpha;
      data[index + 1] = alpha;
      data[index + 2] = alpha;
      data[index + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.NoColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

/**
 * One-draw soft contact pools for vegetation and rocks. The low opacity and
 * cool sky tint are deliberate: these anchor objects without ever becoming
 * the pitch-black decals that stylized outdoor scenes commonly inherit.
 */
export class StylizedContactShadowField extends THREE.InstancedMesh {
  constructor({ placements = [], color = 0x395469, opacity = 0.16 } = {}) {
    const geometry = new THREE.CircleGeometry(1, 24);
    geometry.rotateX(-Math.PI / 2);
    const alphaMap = radialAlphaTexture();
    const material = new THREE.MeshBasicMaterial({
      alphaMap,
      color,
      depthWrite: false,
      fog: true,
      opacity: Math.min(Math.max(Number(opacity) || 0, 0), 0.22),
      polygonOffset: true,
      polygonOffsetFactor: -1,
      side: THREE.DoubleSide,
      transparent: true,
    });
    super(geometry, material, Math.max(placements.length, 1));
    this.name = 'StylizedContactShadowField';
    this.count = placements.length;
    this.frustumCulled = false;
    this.renderOrder = -1;
    this.userData.environmentShaderExclude = true;
    this.userData.waterExclude = true;
    markFactorySystemOwned(this, 'lighting', 'toonlab/vegetation-contact-shadows');
    this._alphaMap = alphaMap;
    this._baseOpacity = material.opacity;
    this._cameraDirection = new THREE.Vector3();
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    placements.forEach((placement, index) => {
      const radius = THREE.MathUtils.clamp(Number(placement.radius) || 1, 0.18, 9);
      scale.set(radius, 1, radius * (Number(placement.aspect) || 0.72));
      quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Number(placement.rotation) || 0);
      matrix.compose(
        new THREE.Vector3(placement.x, (placement.y ?? 0) + 0.035, placement.z),
        quaternion,
        scale,
      );
      this.setMatrixAt(index, matrix);
    });
    this.instanceMatrix.needsUpdate = true;
  }

  /**
   * Contact pools are a gameplay-range grounding cue. From steep flyover and
   * top-down views they minify into dark one-pixel dirt, so fade the entire
   * bounded field as the camera turns downward.
   */
  update(camera) {
    if (!camera) return this;
    camera.getWorldDirection(this._cameraDirection);
    const downwardness = THREE.MathUtils.clamp(-this._cameraDirection.y, 0, 1);
    const aerial = THREE.MathUtils.smoothstep(
      downwardness,
      CONTACT_SHADOW_AERIAL_FADE.start,
      CONTACT_SHADOW_AERIAL_FADE.end,
    );
    this.material.opacity = this._baseOpacity * (1 - aerial);
    this.visible = this.material.opacity > 0.002;
    return this;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    this._alphaMap.dispose();
    this.parent?.remove(this);
  }
}
