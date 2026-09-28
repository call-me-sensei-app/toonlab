// Catalog thumbnail harness: ?entry=<id>&seed=&w=&h= renders one SPAWNABLE
// catalog entry on a transparent canvas with a soft contact shadow, then
// sets document.title = 'thumb-ready' (the capture script's gate). One
// harness for every cluster — consistent camera + lighting is what makes
// the grid read as one library.

import * as THREE from 'three';

import { createLabRenderer } from '../shared/rendererFactory.js';
import { applyEnvironmentShader } from '@call-me-sensei/toonlab/environment';
import { catalog } from '@call-me-sensei/toonlab/catalog';

const params = new URLSearchParams(location.search);
const entryId = params.get('entry');
const seed = Number(params.get('seed')) || 7;
const width = Number(params.get('w')) || 512;
const height = Number(params.get('h')) || 384;

async function main() {
  const renderer = createLabRenderer({ alpha: true, antialias: true });
  renderer.setSize(width, height);
  renderer.setClearColor(0x000000, 0);
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, width / height, 0.05, 500);
  scene.add(new THREE.HemisphereLight(0xcfe4ff, 0x4a5d43, 0.9));
  const sun = new THREE.DirectionalLight(0xfff2dd, 2.4);
  sun.position.set(-5, 8, -3);
  scene.add(sun);

  const asset = catalog.spawn(entryId, { seed });
  const built = asset.build(seed);
  const object = built.object3D;
  object.position.y = built.anchor ?? 0;
  await applyEnvironmentShader(object, {
    bakeVertexAo: false,
    hasSun: true,
    parameters: { saturation: 1.18 },
  });
  scene.add(object);

  // hero frame: three-quarter view sized to the bounds
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const reach = Math.max(size.x, size.y, size.z, 0.6);
  camera.position.set(center.x + reach * 1.05, center.y + reach * 0.7, center.z + reach * 1.3);
  camera.lookAt(center);

  // soft contact shadow blob (same trick as the debris harness)
  const blobSize = Math.max(size.x, size.z) * 0.9;
  const blobData = new Uint8Array(64 * 64 * 4);
  for (let y = 0; y < 64; y += 1) {
    for (let x = 0; x < 64; x += 1) {
      const dx = (x - 32) / 30;
      const dy = (y - 32) / 30;
      const alpha = Math.max(0, 1 - Math.hypot(dx, dy));
      const offset = (y * 64 + x) * 4;
      blobData[offset + 3] = Math.round(alpha * alpha * 130);
    }
  }
  const blobTexture = new THREE.DataTexture(blobData, 64, 64, THREE.RGBAFormat);
  blobTexture.needsUpdate = true;
  const blob = new THREE.Mesh(
    new THREE.PlaneGeometry(blobSize, blobSize),
    new THREE.MeshBasicMaterial({ depthWrite: false, map: blobTexture, transparent: true }),
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.set(center.x, 0.01, center.z);
  scene.add(blob);

  let frames = 0;
  renderer.setAnimationLoop(() => {
    renderer.render(scene, camera);
    frames += 1;
    if (frames === 12) document.title = 'thumb-ready';
  });
}

main().catch((error) => {
  console.error(error);
  document.title = 'thumb-error';
});
