// Storage-buffer skinning for the toon character on the forced-WebGL2
// backend.
//
// three r185's built-in SkinningNode stores bone matrices in a uniform
// buffer; GL_MAX_UNIFORM_BLOCK_SIZE (16KB ≈ 256 bones) makes every MMD-scale
// skeleton (300-800 bones) fail to link on the WebGL2 backend. This chunk
// stores the same skeleton.boneMatrices array as a storage attribute with
// setPBO(true): the GLSL builder emits it as a float DataTexture + texelFetch
// (the classic boneTexture technique), while WebGPU would emit a real storage
// buffer. The math replicates three's getSkinnedPosition/NormalAndTangent.
//
// ToonAnimeNodeMaterial.setupPosition routes skinned meshes here on the
// WebGL2 backend only; WebGPU keeps the built-in path.

import * as THREE from 'three';
import {
  attribute,
  mat4,
  morphReference,
  normalLocal,
  positionLocal,
  storage,
  uniform,
  vec4,
} from 'three/tsl';

// One storage attribute per skeleton, shared by every material/mesh using it.
const boneStorageBySkeleton = new WeakMap();

function boneStorageEntry(skeleton) {
  let entry = boneStorageBySkeleton.get(skeleton);
  if (!entry) {
    // Make sure the matrices reflect the current pose before the first
    // texture upload (nothing else updates the skeleton on this path).
    skeleton.update();
    // Bone matrices as bones×4 vec4 columns (column-major float array).
    const attributeBuffer = new THREE.InstancedBufferAttribute(skeleton.boneMatrices, 4);
    const node = storage(attributeBuffer, 'vec4', skeleton.bones.length * 4)
      .setPBO(true)
      .toReadOnly();
    entry = { attributeBuffer, node };
    boneStorageBySkeleton.set(skeleton, entry);
  }
  return entry;
}

/**
 * Applies storage-buffer skinning to positionLocal/normalLocal in place.
 * Call inside setupPosition (an active stack is required).
 */
export function applyToonStorageSkinning(skinnedMesh) {
  const skeleton = skinnedMesh.skeleton;
  const bones = boneStorageEntry(skeleton).node;

  const bindMatrix = uniform(skinnedMesh.bindMatrix, 'mat4');
  const bindMatrixInverse = uniform(skinnedMesh.bindMatrixInverse, 'mat4');
  const skinIndex = attribute('skinIndex', 'uvec4');
  const skinWeight = attribute('skinWeight', 'vec4');

  const boneMatrix = (index) => {
    const base = index.mul(4);
    return mat4(
      bones.element(base),
      bones.element(base.add(1)),
      bones.element(base.add(2)),
      bones.element(base.add(3)),
    );
  };

  const boneMatX = boneMatrix(skinIndex.x);
  const boneMatY = boneMatrix(skinIndex.y);
  const boneMatZ = boneMatrix(skinIndex.z);
  const boneMatW = boneMatrix(skinIndex.w);

  // Position (three's getSkinnedPosition).
  const skinVertex = bindMatrix.mul(vec4(positionLocal, 1.0));
  const skinned = boneMatX.mul(skinVertex).mul(skinWeight.x)
    .add(boneMatY.mul(skinVertex).mul(skinWeight.y))
    .add(boneMatZ.mul(skinVertex).mul(skinWeight.z))
    .add(boneMatW.mul(skinVertex).mul(skinWeight.w));
  const skinPosition = bindMatrixInverse.mul(skinned).xyz;

  // Normal (three's getSkinnedNormalAndTangent, tangent omitted — the toon
  // shader derives its TBN from screen derivatives).
  let skinMatrix = boneMatX.mul(skinWeight.x)
    .add(boneMatY.mul(skinWeight.y))
    .add(boneMatZ.mul(skinWeight.z))
    .add(boneMatW.mul(skinWeight.w));
  skinMatrix = bindMatrixInverse.mul(skinMatrix).mul(bindMatrix);
  const skinNormal = skinMatrix.mul(vec4(normalLocal, 0.0)).xyz;

  positionLocal.assign(skinPosition);
  normalLocal.assign(skinNormal);
}

/**
 * Subclasses a node material so skinned meshes skin through the storage/PBO
 * path on non-WebGPU backends (built-in buffer skinning elsewhere). Used by
 * the anime material and by the character-pass depth/mask materials, which
 * render the same MMD-scale skeletons.
 */
export function withToonStorageSkinning(BaseNodeMaterial) {
  return class extends BaseNodeMaterial {
    setupPosition(builder) {
      const { object, geometry } = builder;
      const useStorageSkinning = object.isSkinnedMesh === true &&
        builder.renderer?.backend?.isWebGPUBackend !== true;
      if (!useStorageSkinning) return super.setupPosition(builder);

      // Mirrors NodeMaterial.setupPosition for the paths a skinned character
      // can hit (morphs, then skinning); batching/instancing/displacement do
      // not apply to skinned toon meshes.
      if (geometry.morphAttributes.position || geometry.morphAttributes.normal || geometry.morphAttributes.color) {
        morphReference(object);
      }
      applyToonStorageSkinning(object);
      return positionLocal;
    }
  };
}

/**
 * Per-frame CPU side: recompute bone matrices and re-upload the PBO texture.
 * Runs from the converted meshes' onBeforeRender (idempotent per frame).
 */
export function updateToonStorageSkinning(skinnedMesh) {
  const skeleton = skinnedMesh?.skeleton;
  if (!skeleton) return;
  const entry = boneStorageBySkeleton.get(skeleton);
  if (!entry) return;
  skeleton.update();
  const attributeBuffer = entry.attributeBuffer;
  // The GLSL builder's PBO setup REPLACES the attribute array with a padded
  // copy (pow2 texture dimensions) — mirror the live bone matrices into it
  // before flagging the wrapping DataTexture (attribute.pbo) for re-upload.
  if (attributeBuffer.array !== skeleton.boneMatrices) {
    attributeBuffer.array.set(skeleton.boneMatrices, 0);
  }
  if (attributeBuffer.pbo) attributeBuffer.pbo.needsUpdate = true;
}
