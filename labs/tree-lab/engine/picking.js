// Branch-end picking for the redesigned UI: click a leaf tuft in orbit mode
// → store.selection. The React popover renders from selection; this module
// owns the raycast (tuft SPHERES — foliage cards are shader-expanded
// billboards a mesh raycast can never hit) and the world-space marker.

import * as THREE from 'three';

const PICK_TOLERANCE_PX = 5;

export function installBranchPicking({ engine, store }) {
  const {
    camera, getPlant, onRebuilt, renderer, scene,
  } = engine;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const pickSphere = new THREE.Sphere();

  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 12, 10),
    new THREE.MeshBasicMaterial({
      color: 0x8fc6ff, depthTest: false, opacity: 0.9, transparent: true,
    }),
  );
  marker.renderOrder = 20;
  marker.visible = false;
  scene.add(marker);

  function positionMarker(index) {
    const plant = getPlant();
    const attachment = plant?.foliageAttachments?.[index];
    if (!attachment) return false;
    plant.canopyMesh.updateWorldMatrix(true, false);
    marker.position.copy(attachment.position);
    plant.canopyMesh.localToWorld(marker.position);
    marker.scale.setScalar(plant.canopyMesh.getWorldScale(new THREE.Vector3()).x);
    marker.visible = true;
    return true;
  }

  function pick(event) {
    const plant = getPlant();
    if (!plant?.canopyMesh || !plant.foliageAttachments?.length) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    plant.canopyMesh.updateWorldMatrix(true, false);
    const worldScale = plant.canopyMesh.getWorldScale(new THREE.Vector3()).x;
    const { settings, sketch } = store.getState();
    let bestIndex = -1;
    let bestDistance = Infinity;
    plant.foliageAttachments.forEach((attachment, index) => {
      pickSphere.center.copy(attachment.position);
      plant.canopyMesh.localToWorld(pickSphere.center);
      const radius = sketch.branchOverrides[index]?.clusterRadius
        ?? settings.leaves.clusterRadius;
      pickSphere.radius = Math.max(radius * worldScale * 1.15, 0.15);
      if (!raycaster.ray.intersectsSphere(pickSphere)) return;
      const distance = pickSphere.center.distanceTo(raycaster.ray.origin);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    if (bestIndex >= 0) store.actions.select(bestIndex, { x: event.clientX, y: event.clientY });
    else store.actions.clearSelection();
  }

  // Click = down/up pair with < tolerance movement, primary button, orbit
  // mode only (sketch tools own the pointer otherwise).
  let downAt = null;
  renderer.domElement.addEventListener('pointerdown', (event) => {
    const activeTool = store.getState().tool;
    if (event.button !== 0 || (activeTool !== 'orbit' && activeTool !== 'move')) {
      downAt = null;
      return;
    }
    downAt = { x: event.clientX, y: event.clientY };
  });
  renderer.domElement.addEventListener('pointerup', (event) => {
    if (!downAt) return;
    const moved = Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y);
    downAt = null;
    if (moved <= PICK_TOLERANCE_PX) pick(event);
  });

  // Marker follows selection; rebuilds re-anchor or clear a dead selection.
  store.subscribe(() => {
    const { selection } = store.getState();
    if (!selection) marker.visible = false;
    else positionMarker(selection.branchIndex);
  });
  onRebuilt(() => {
    const { selection } = store.getState();
    if (selection && !positionMarker(selection.branchIndex)) {
      store.actions.clearSelection();
    }
  });
}
