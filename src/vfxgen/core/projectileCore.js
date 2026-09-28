// The fireball's flame-core billboard: one pooled quad per projectile in
// flight, shaded by an analytic two-band toon flame (no texture, no noise
// fetch — angular sine licks over an SDF body, same policy as spriteShapes).
// vfxSystem moves the center uniform each frame; everything else is a pure
// function of the shared clock.

import * as THREE from 'three';
import { NodeMaterial } from 'three/webgpu';
import {
  cameraProjectionMatrix, cameraViewMatrix, clamp, Discard, Fn, length, mix, positionLocal,
  sin, smoothstep, step, uniform, uv, vec2, vec4,
} from 'three/tsl';

import { flameLicks } from './spriteShapes.js';

/**
 * One pooled projectile core. `sharedUniforms` is the burst backbone's set
 * (uTime + camera billboard basis) so the flame animates on the same clock.
 */
export function createProjectileCore({ sharedUniforms }) {
  const u = sharedUniforms;
  const look = {
    uCenter: uniform(new THREE.Vector3()),
    uCoreColor: uniform(new THREE.Color(1.0, 0.95, 0.6)),
    uFlameColor: uniform(new THREE.Color(1.0, 0.45, 0.12)),
    uIntensity: uniform(1.2),
    uSeed: uniform(0),
    uSize: uniform(0.42),
  };

  const material = new NodeMaterial();
  material.name = 'VfxProjectileCore';
  material.transparent = true;
  material.blending = THREE.AdditiveBlending;
  material.depthWrite = false;
  material.fog = false;

  material.vertexNode = Fn(() => {
    // Camera-facing billboard around the CPU-fed center; quad is 1×1 so the
    // world size is uSize · 2 across.
    const position = look.uCenter
      .add(u.uCamRight.mul(positionLocal.x).mul(look.uSize).mul(2.0))
      .add(u.uCamUp.mul(positionLocal.y).mul(look.uSize).mul(2.0));
    return cameraProjectionMatrix.mul(cameraViewMatrix).mul(vec4(position, 1.0));
  })();

  material.fragmentNode = Fn(() => {
    const p = uv().mul(2.0).sub(1.0).toVar();
    const t = u.uTime.add(look.uSeed.mul(37.0));
    const body = flameLicks(p, t, look.uSeed).toVar();
    Discard(body.lessThan(0.01));

    // Two hard toon bands: hot core inside, flame skin outside, plus a
    // flicker so the ball feels alive even in a straight throw.
    const hot = smoothstep(0.7, 0.15, length(p.mul(vec2(1.0, 0.9))));
    const banded = mix(look.uFlameColor, look.uCoreColor, step(0.55, hot));
    const flicker = sin(t.mul(11.0)).mul(0.06).add(0.97);
    const alpha = clamp(body, 0.0, 1.0).mul(look.uIntensity).mul(flicker);
    return vec4(banded.mul(alpha), alpha);
  })();
  material.uniforms = look;

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  mesh.name = 'VfxProjectileCore';
  mesh.frustumCulled = false;
  mesh.renderOrder = 7;
  mesh.visible = false;

  return {
    mesh,
    uniforms: look,
    /** Re-tints and shows the core for a new projectile. */
    arm({ coreColor, flameColor, coreSize, intensity, seed } = {}) {
      if (Array.isArray(coreColor)) look.uCoreColor.value.setRGB(...coreColor, THREE.SRGBColorSpace);
      if (Array.isArray(flameColor)) look.uFlameColor.value.setRGB(...flameColor, THREE.SRGBColorSpace);
      if (Number.isFinite(coreSize)) look.uSize.value = Math.max(coreSize, 0.01);
      if (Number.isFinite(intensity)) look.uIntensity.value = Math.max(intensity, 0);
      if (Number.isFinite(seed)) look.uSeed.value = seed;
      mesh.visible = true;
    },
    setCenter(position) {
      look.uCenter.value.copy(position);
    },
    reset() {
      mesh.visible = false;
    },
    dispose() {
      mesh.geometry.dispose();
      material.dispose();
    },
  };
}
