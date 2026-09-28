import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

function mergePlaced(entries) {
  const geometries = entries.map(({ geometry, position = [0, 0, 0], rotationY = 0, scale = [1, 1, 1] }) => {
    const copy = geometry.clone();
    geometry.dispose();
    copy.scale(...scale);
    copy.rotateY(rotationY);
    copy.translate(...position);
    return copy;
  });
  const merged = mergeGeometries(geometries, false);
  for (const geometry of geometries) geometry.dispose();
  return merged;
}

/**
 * A restrained, low-draw-call horizon castle: large enough to establish
 * human scale, simple enough to remain a clean silhouette through fog. It is
 * intentionally a world-composition anchor rather than a traversable POI.
 */
export function createHorizonCastle({
  position = { x: 0, y: 0, z: 0 },
  scale = 1,
  facing = 0,
  stoneColor = 0x6d7e89,
  roofColor = 0x334a5b,
} = {}) {
  const root = new THREE.Group();
  root.name = 'HorizonCastleLandmark';
  root.position.set(position.x ?? 0, position.y ?? 0, position.z ?? 0);
  root.rotation.y = facing;
  root.scale.setScalar(Math.max(Number(scale) || 1, 0.1));
  root.userData.worldLandmark = 'castle';

  const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
  const stoneGeometry = mergePlaced([
    { geometry: box(15, 19, 11), position: [0, 9.5, 1] },
    { geometry: box(29, 7.5, 5), position: [0, 3.75, 0] },
    { geometry: new THREE.CylinderGeometry(3.2, 3.55, 15, 8), position: [-11.5, 7.5, 0] },
    { geometry: new THREE.CylinderGeometry(3.2, 3.55, 15, 8), position: [11.5, 7.5, 0] },
    { geometry: box(4.5, 12, 5), position: [-4.8, 6, -3.4] },
    { geometry: box(4.5, 12, 5), position: [4.8, 6, -3.4] },
  ]);
  const roofGeometry = mergePlaced([
    { geometry: new THREE.ConeGeometry(10.2, 5.5, 4), position: [0, 21.75, 1], rotationY: Math.PI / 4 },
    { geometry: new THREE.ConeGeometry(5.1, 5.8, 8), position: [-11.5, 17.9, 0] },
    { geometry: new THREE.ConeGeometry(5.1, 5.8, 8), position: [11.5, 17.9, 0] },
    { geometry: new THREE.ConeGeometry(5.1, 5.8, 8), position: [-4.8, 14.9, -3.4], scale: [0.72, 0.78, 0.72] },
    { geometry: new THREE.ConeGeometry(5.1, 5.8, 8), position: [4.8, 14.9, -3.4], scale: [0.72, 0.78, 0.72] },
  ]);

  const stoneMaterial = new THREE.MeshStandardMaterial({ color: stoneColor, roughness: 1 });
  stoneMaterial.name = 'Castle stone';
  const roofMaterial = new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.92 });
  roofMaterial.name = 'Castle roof';
  const stoneMesh = new THREE.Mesh(stoneGeometry, stoneMaterial);
  const roofMesh = new THREE.Mesh(roofGeometry, roofMaterial);
  for (const mesh of [stoneMesh, roofMesh]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    root.add(mesh);
  }

  root.dispose = () => {
    stoneGeometry.dispose();
    roofGeometry.dispose();
    stoneMaterial.dispose();
    roofMaterial.dispose();
    root.parent?.remove(root);
  };
  return root;
}
