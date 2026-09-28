import * as THREE from 'three';

// Per-vertex results of the conversion-time bakes share one vec4 attribute:
//   xy — planar face coordinates (faceShadowBake.js), zero off the face
//   z  — local occlusion for the automatic shading grade (occlusionBake.js)
//   w  — a per-material detail value (featureBakes.js): the position below the
//        upper lid on an eye white, the sheer-fabric weight on stockings. The
//        material decides how it reads w; no vertex carries both.
// WebGPU allows only 8 vertex buffers per draw; a skinned mesh already spends
// five on position, normal, uv and skinning, and role weights take another, so
// each bake must not add its own.
export const BAKE_ATTRIBUTE = 'toonBake';
const STRIDE = 4;

function bakeAttribute(geometry) {
  const count = geometry.attributes.position.count;
  let attribute = geometry.attributes[BAKE_ATTRIBUTE];
  if (!attribute || attribute.count !== count || attribute.itemSize !== STRIDE) {
    const next = new THREE.BufferAttribute(new Float32Array(count * STRIDE), STRIDE);
    if (attribute?.count === count) {
      for (let i = 0; i < count; i += 1) {
        for (let k = 0; k < Math.min(attribute.itemSize, STRIDE); k += 1) {
          next.array[i * STRIDE + k] = attribute.array[i * attribute.itemSize + k];
        }
      }
    }
    attribute = next;
    geometry.setAttribute(BAKE_ATTRIBUTE, attribute);
  }
  return attribute;
}

/** Writes planar face coordinates (2 per vertex) into the bake attribute. */
export function writeBakedFaceUv(geometry, faceUv) {
  const attribute = bakeAttribute(geometry);
  for (let i = 0; i < attribute.count; i += 1) {
    attribute.array[i * STRIDE] = faceUv[i * 2];
    attribute.array[i * STRIDE + 1] = faceUv[i * 2 + 1];
  }
  attribute.needsUpdate = true;
  geometry.userData.toonHasFaceUv = true;
}

/** Writes local occlusion (1 per vertex) into the bake attribute. */
export function writeBakedOcclusion(geometry, occlusion) {
  const attribute = bakeAttribute(geometry);
  for (let i = 0; i < attribute.count; i += 1) attribute.array[i * STRIDE + 2] = occlusion[i];
  attribute.needsUpdate = true;
  geometry.userData.toonHasOcclusion = true;
}

/**
 * Writes a per-material detail value into w for the given vertices only
 * (`values` is indexed by vertex; NaN leaves a vertex untouched). `kind`
 * names what the materials on those vertices read ('lid' or 'sheer').
 */
export function writeBakedDetail(geometry, values, kind) {
  const attribute = bakeAttribute(geometry);
  for (let i = 0; i < attribute.count; i += 1) {
    if (!Number.isNaN(values[i])) attribute.array[i * STRIDE + 3] = values[i];
  }
  attribute.needsUpdate = true;
  geometry.userData.toonBakedDetails = { ...(geometry.userData.toonBakedDetails ?? {}), [kind]: true };
}

export function hasBakedFaceUv(geometry) {
  return Boolean(geometry?.userData?.toonHasFaceUv && geometry.attributes?.[BAKE_ATTRIBUTE]);
}

export function hasBakedOcclusion(geometry) {
  return Boolean(geometry?.userData?.toonHasOcclusion && geometry.attributes?.[BAKE_ATTRIBUTE]);
}

export function hasBakedDetail(geometry, kind) {
  return Boolean(geometry?.userData?.toonBakedDetails?.[kind] && geometry.attributes?.[BAKE_ATTRIBUTE]);
}

/** Baked occlusion of one vertex (tests, tooling). */
export function bakedOcclusionAt(geometry, index) {
  return geometry.attributes[BAKE_ATTRIBUTE].getZ(index);
}

/** Baked detail value (w) of one vertex (tests, tooling). */
export function bakedDetailAt(geometry, index) {
  return geometry.attributes[BAKE_ATTRIBUTE].getW(index);
}
