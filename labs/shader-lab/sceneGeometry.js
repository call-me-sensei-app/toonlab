// Stateless scene-geometry helpers: model bounds, floor probing, backdrop
// sizing, and small material/mesh utilities.

import * as THREE from 'three';

export function materialList(material) {
  return Array.isArray(material) ? material.filter(Boolean) : [material].filter(Boolean);
}

export function environmentRelativePoint(environmentBox, vector) {
  const center = environmentBox.getCenter(new THREE.Vector3());
  const size = environmentBox.getSize(new THREE.Vector3());
  return new THREE.Vector3(
    center.x + size.x * vector.x,
    environmentBox.min.y + size.y * vector.y,
    environmentBox.min.z + size.z * vector.z,
  );
}

export function setShaderOpacity(mesh, opacity) {
  if (!mesh?.material) return;
  if (mesh.material.uniforms?.opacity) mesh.material.uniforms.opacity.value = opacity;
  if ('opacity' in mesh.material) mesh.material.opacity = opacity;
  mesh.visible = opacity > 0.002;
}

export function setShaderColor(mesh, color) {
  if (!mesh?.material) return;
  if (mesh.material.uniforms?.color) mesh.material.uniforms.color.value.copy(color);
  if (mesh.material.color?.isColor) mesh.material.color.copy(color);
}

export function scaleModelToSceneSize(root, targetSize) {
  const box = computeModelBounds(root);
  if (!box) return null;

  const size = box.getSize(new THREE.Vector3());
  const referenceSize = Math.max(size.x, size.y, size.z);
  if (referenceSize > 0) root.scale.multiplyScalar(targetSize / referenceSize);
  root.updateMatrixWorld(true);
  return computeModelBounds(root);
}

export function computeBackdropDimensions(environmentBox, imageAspect, distance, scale) {
  const size = environmentBox.getSize(new THREE.Vector3());
  const minimumWidth = Math.max(size.x * 1.08, size.x * scale, distance * 1.55);
  const minimumHeight = size.y * Math.max(1.15, scale * 0.38);
  let width = minimumWidth;
  let height = width / imageAspect;
  if (height < minimumHeight) {
    height = minimumHeight;
    width = height * imageAspect;
  }
  return { height, width };
}

export function defaultBackdropDistance(environmentBox) {
  const size = environmentBox.getSize(new THREE.Vector3());
  return Math.max(size.z * 2.1, size.y * 2.8);
}

export function defaultBackdropScale(environmentBox, distance) {
  const size = environmentBox.getSize(new THREE.Vector3());
  return Math.max(3.2, 1.0 + distance / Math.max(size.z, 0.001) * 1.35);
}

export function computeModelBounds(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const meshBox = new THREE.Box3();
  let hasBounds = false;

  root.traverse((obj) => {
    if (obj.userData?.isToonOutline || !obj.isMesh || !obj.geometry) return;
    if (!obj.geometry.boundingBox) obj.geometry.computeBoundingBox();
    if (!obj.geometry.boundingBox) return;

    meshBox.copy(obj.geometry.boundingBox).applyMatrix4(obj.matrixWorld);
    if (!Number.isFinite(meshBox.min.x) || !Number.isFinite(meshBox.max.x)) return;
    box.union(meshBox);
    hasBounds = true;
  });

  return hasBounds ? box : null;
}

export function writeModelBoundsDataset(box) {
  if (!box) return;

  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  document.body.dataset.modelBounds = JSON.stringify({
    center: [center.x, center.y, center.z],
    max: [box.max.x, box.max.y, box.max.z],
    min: [box.min.x, box.min.y, box.min.z],
    size: [size.x, size.y, size.z],
  });
}

export function clampInside(value, min, max) {
  return min <= max ? THREE.MathUtils.clamp(value, min, max) : value;
}

function collectGroundingMeshes(root) {
  const meshes = [];
  root?.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry || !obj.visible) return;
    if (obj.userData?.isEnvironmentBackdrop || obj.userData?.isSunHelper) return;
    meshes.push(obj);
  });
  return meshes;
}

export function findEnvironmentFloorYAt(environmentRoot, environmentBox, x, z) {
  if (!environmentRoot || !environmentBox) return null;

  const size = environmentBox.getSize(new THREE.Vector3());
  const origin = new THREE.Vector3(
    x,
    environmentBox.max.y + Math.max(0.2, size.y * 0.2),
    z,
  );
  const raycaster = new THREE.Raycaster(origin, new THREE.Vector3(0, -1, 0), 0, size.y * 1.8);
  const hits = raycaster.intersectObjects(collectGroundingMeshes(environmentRoot), false);
  const lowFloorCeiling = environmentBox.min.y + Math.max(0.18, size.y * 0.12);
  const broadFloorCeiling = environmentBox.min.y + size.y * 0.36;
  const lowWalkableHits = [];
  const broadWalkableHits = [];

  for (const hit of hits) {
    if (!hit.face || hit.point.y > broadFloorCeiling) continue;

    const normalMatrix = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld);
    const worldNormal = hit.face.normal.clone().applyMatrix3(normalMatrix).normalize();
    if (worldNormal.y < 0.35) continue;

    broadWalkableHits.push(hit.point.y);
    if (hit.point.y <= lowFloorCeiling) lowWalkableHits.push(hit.point.y);
  }

  if (lowWalkableHits.length > 0) return Math.max(...lowWalkableHits);
  if (broadWalkableHits.length > 0) return Math.min(...broadWalkableHits);
  return null;
}
