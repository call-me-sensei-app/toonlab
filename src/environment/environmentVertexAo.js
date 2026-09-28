import * as THREE from 'three';

// Conversion-time per-vertex ambient occlusion for environment meshes.
//
// This is the grounding lever for untextured/flat-color scenes: one bake at
// conversion, zero per-frame cost, consumed by the environment shader through
// the envVertexAo attribute (USE_ENV_VERTEX_AO). Deterministic by design —
// fixed hemisphere directions, no randomness — so captures are repeatable.
//
// Uses three-mesh-bvh for the occluder queries; if the dependency cannot be
// loaded the bake is skipped with a warning rather than falling back to a
// pathologically slow linear raycast.

const EPSILON_RATIO = 0.01;

// Fixed cosine-weighted hemisphere directions (golden-spiral layout) in
// tangent space (+Z = surface normal).
function hemisphereDirections(count) {
  const directions = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i += 1) {
    // Cosine-weighted: z = sqrt(1 - t) concentrates samples toward the pole.
    const t = (i + 0.5) / count;
    const z = Math.sqrt(1 - t);
    const radius = Math.sqrt(t);
    const angle = golden * i;
    directions.push(new THREE.Vector3(
      Math.cos(angle) * radius,
      Math.sin(angle) * radius,
      z,
    ));
  }
  return directions;
}

function buildOccluderGeometry(occluderRoot) {
  const positions = [];
  const vertex = new THREE.Vector3();
  occluderRoot.updateMatrixWorld(true);
  occluderRoot.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry?.attributes?.position) return;
    if (obj.userData?.environmentShaderExclude) return;
    if (obj.userData?.environmentVertexAoOccluderExclude) return;
    const geometry = obj.geometry;
    const position = geometry.attributes.position;
    const index = geometry.index;
    const count = index ? index.count : position.count;
    for (let i = 0; i < count; i += 1) {
      const vertexIndex = index ? index.getX(i) : i;
      vertex.fromBufferAttribute(position, vertexIndex).applyMatrix4(obj.matrixWorld);
      positions.push(vertex.x, vertex.y, vertex.z);
    }
  });
  if (positions.length === 0) return null;
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return merged;
}

export async function bakeEnvironmentVertexAo(meshes, {
  occluderRoot = null,
  environmentBox = null,
  rayCount = 12,
  maxDistance = null,
  vertexBudget = 200000,
  // Occlusion floor keeps fully-enclosed corners readable instead of black.
  occlusionFloor = 0.22,
  // Yield to the main thread between slices so big bakes do not jank a
  // running frame loop; pass 0 to bake synchronously (deterministic scripts).
  sliceSize = 6000,
  onProgress = null,
  shouldContinue = () => true,
} = {}) {
  const targets = (Array.isArray(meshes) ? meshes : [meshes]).filter((mesh) => mesh?.isMesh);
  if (targets.length === 0 || !occluderRoot) return { bakedMeshCount: 0, skippedMeshCount: 0 };

  let MeshBVH;
  try {
    ({ MeshBVH } = await import('three-mesh-bvh'));
  } catch (error) {
    console.warn('[environmentVertexAo] three-mesh-bvh unavailable; skipping vertex AO bake.', error);
    return { bakedMeshCount: 0, skippedMeshCount: targets.length };
  }

  const occluderGeometry = buildOccluderGeometry(occluderRoot);
  if (!occluderGeometry) return { bakedMeshCount: 0, skippedMeshCount: targets.length };
  const bvh = new MeshBVH(occluderGeometry);

  function abortedResult() {
    occluderGeometry.dispose();
    return {
      aborted: true,
      bakedMeshCount,
      skippedMeshCount: targets.length - bakedMeshCount,
    };
  }

  const size = environmentBox?.getSize(new THREE.Vector3()) ?? null;
  const reach = Number.isFinite(maxDistance) && maxDistance > 0
    ? maxDistance
    : size
      ? Math.max((size.x + size.y + size.z) / 3 * 0.35, 0.5)
      : 4;
  const epsilon = reach * EPSILON_RATIO;
  const directions = hemisphereDirections(Math.max(4, Math.round(rayCount)));

  const ray = new THREE.Ray();
  const normalMatrix = new THREE.Matrix3();
  const worldPosition = new THREE.Vector3();
  const worldNormal = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const bitangent = new THREE.Vector3();
  const sampleDir = new THREE.Vector3();

  let bakedMeshCount = 0;
  let skippedMeshCount = 0;
  let usedVertexBudget = 0;
  let processedSinceYield = 0;

  for (const mesh of targets) {
    if (!shouldContinue()) return abortedResult();
    const geometry = mesh.geometry;
    const position = geometry?.attributes?.position;
    const normal = geometry?.attributes?.normal;
    if (!position || !normal) {
      skippedMeshCount += 1;
      continue;
    }
    if (usedVertexBudget + position.count > vertexBudget) {
      skippedMeshCount += 1;
      console.warn(
        `[environmentVertexAo] Skipping "${mesh.name || 'unnamed mesh'}" (${position.count} verts): `
        + `vertex budget ${vertexBudget} exhausted. Raise vertexAoOptions.vertexBudget to include it.`,
      );
      continue;
    }
    usedVertexBudget += position.count;

    mesh.updateMatrixWorld(true);
    normalMatrix.getNormalMatrix(mesh.matrixWorld);
    const ao = new Float32Array(position.count);

    for (let i = 0; i < position.count; i += 1) {
      worldPosition.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
      worldNormal.fromBufferAttribute(normal, i).applyMatrix3(normalMatrix).normalize();

      // Orthonormal basis around the world normal.
      if (Math.abs(worldNormal.x) > 0.9) tangent.set(0, 1, 0);
      else tangent.set(1, 0, 0);
      bitangent.crossVectors(worldNormal, tangent).normalize();
      tangent.crossVectors(bitangent, worldNormal).normalize();

      let occlusion = 0;
      let totalWeight = 0;
      for (const dir of directions) {
        sampleDir.copy(tangent).multiplyScalar(dir.x)
          .addScaledVector(bitangent, dir.y)
          .addScaledVector(worldNormal, dir.z)
          .normalize();
        ray.origin.copy(worldPosition).addScaledVector(worldNormal, epsilon);
        ray.direction.copy(sampleDir);
        const weight = dir.z;
        totalWeight += weight;
        const hit = bvh.raycastFirst(ray, THREE.DoubleSide);
        if (hit && hit.distance < reach) {
          occlusion += weight * (1 - hit.distance / reach);
        }
      }
      const visibility = 1 - (totalWeight > 0 ? occlusion / totalWeight : 0);
      ao[i] = THREE.MathUtils.clamp(
        occlusionFloor + (1 - occlusionFloor) * visibility, 0, 1);

      processedSinceYield += 1;
      if (sliceSize > 0 && processedSinceYield >= sliceSize) {
        processedSinceYield = 0;
        onProgress?.(usedVertexBudget, vertexBudget);
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (!shouldContinue()) return abortedResult();
      }
    }

    geometry.setAttribute('envVertexAo', new THREE.BufferAttribute(ao, 1));
    bakedMeshCount += 1;
  }

  occluderGeometry.dispose();
  return { bakedMeshCount, skippedMeshCount };
}
