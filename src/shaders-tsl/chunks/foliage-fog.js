// Manual linear scene fog for the world-anchored foliage cards (grass, tree
// canopies) on the node backends.
//
// Why not `material.fog = true`? Those materials override `vertexNode` with a
// custom world-space billboard, so their real rendered depth lives in a
// varying (viewPosition.z). three's built-in node fog instead reads the
// built-in `positionView` (modelViewMatrix * positionLocal), which is derived
// independently of the custom vertex — for a distant billboard that view-Z is
// wrong and the crown over-fogs into the sky (only visible under aggressive
// near fog like the water lab's). The classic GLSL path never had this: its
// `fog_vertex` chunk reads the same billboarded mvPosition the vertex outputs.
//
// So we mirror the GLSL `fog_fragment` exactly — linear smoothstep(near, far)
// on the true billboarded view depth — and set `material.fog = false`.
//
// Defaults are a no-op (far = 1e9), so a material whose lab never calls
// syncFoliageFog renders unfogged rather than wrong.

import * as THREE from 'three';
import { mix, smoothstep, uniform, vec3 } from 'three/tsl';

/** Fog uniform block for a foliage material. Default = effectively no fog. */
export function createFoliageFogUniforms() {
  return {
    uFogColor: uniform(new THREE.Color(0xffffff)),
    uFogNear: uniform(1),
    uFogFar: uniform(1e9),
  };
}

/**
 * Applies linear fog to `color` using the billboarded view depth.
 * @param {*} color   vec3 node (mutated via return)
 * @param {*} vViewZ  varying float: viewPosition.z (negative forward)
 * @param {*} u       the fog uniform block
 * @returns fogged vec3 node
 */
export function applyFoliageFog(color, vViewZ, u) {
  // GLSL fog_fragment uses vFogDepth = -mvPosition.z (positive). viewPosition.z
  // is negative forward, so depth = -vViewZ.
  const fogFactor = smoothstep(u.uFogNear, u.uFogFar, vViewZ.negate());
  return mix(color, vec3(u.uFogColor), fogFactor);
}

/**
 * Copies a scene's linear Fog into a foliage material's fog uniforms. Call
 * once per frame (fog color/range can change with time of day). A null/absent
 * fog, or a non-linear FogExp2, disables fog (far = 1e9).
 */
export function syncFoliageFog(material, fog) {
  const u = material?.uniforms;
  if (!u?.uFogFar) return;
  if (fog && fog.isFog && typeof fog.near === 'number') {
    u.uFogColor.value.copy(fog.color);
    u.uFogNear.value = fog.near;
    u.uFogFar.value = fog.far;
  } else {
    u.uFogFar.value = 1e9;
  }
}
