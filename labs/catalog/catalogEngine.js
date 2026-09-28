// Live 3D preview for the catalog detail view: one small always-on stage
// that swaps in whatever entry is selected (spawned through the same
// catalog.spawn every game would use — the preview IS the contract test).

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { createLabRenderer } from '../shared/rendererFactory.js';
import { applyEnvironmentShader } from '@call-me-sensei/toonlab/environment';
import { createEnvironmentSunRig } from '@call-me-sensei/toonlab/environment';
import { catalog } from '@call-me-sensei/toonlab/catalog';
import { loadImportedAsset, rewriteAmbientcgDownloadUrl } from '@call-me-sensei/toonlab/assetlib';

export function createCatalogPreview({ mount }) {
  const renderer = createLabRenderer({ antialias: true });
  renderer.setSize(mount.clientWidth || 480, mount.clientHeight || 360);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x18222d);
  const camera = new THREE.PerspectiveCamera(40, 4 / 3, 0.1, 300);
  camera.position.set(4, 3, 6);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(16, 48),
    new THREE.MeshStandardMaterial({ color: 0x5d8f4e }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  scene.add(new THREE.HemisphereLight(0xbdd7f5, 0x3d5a3a, 0.85));
  const sun = new THREE.DirectionalLight(0xfff2dd, 2.2);
  sun.position.set(-6, 9, -4);
  sun.castShadow = true;
  scene.add(sun);

  let current = null;
  let token = 0;

  async function show(entryId, { seed } = {}) {
    const myToken = ++token;
    if (current) {
      scene.remove(current);
      current.traverse((object) => { if (object.isMesh) object.geometry?.dispose(); });
      current = null;
    }
    let built = null;
    try {
      const entry = catalog.get(entryId);
      if (entry?.kind === 'imported-glb' && entry.recipe) {
        // imported entries load async (remote GLB / texture set) — spawn()
        // stays sync-only, so the preview handles them directly
        const loaded = await loadImportedAsset(entry.recipe, {
          repeat: 3,
          rewriteUrl: rewriteAmbientcgDownloadUrl,
        });
        if (loaded.kind === 'model') {
          const box = new THREE.Box3().setFromObject(loaded.object3D);
          built = { anchor: -box.min.y, object3D: loaded.object3D };
        } else {
          const group = new THREE.Group();
          const sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), loaded.material);
          sphere.position.set(-1.4, 1, 0);
          const panel = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), loaded.material.clone());
          panel.position.set(1.4, 1.2, 0);
          group.add(sphere, panel);
          built = { anchor: 0, object3D: group };
        }
      } else {
        const asset = catalog.spawn(entryId, { seed });
        built = asset.build(seed);
      }
    } catch {
      return { spawnable: false };
    }
    if (myToken !== token) return { spawnable: true };
    const object = built.object3D;
    object.position.y = built.anchor ?? 0;
    // shade it the way a world would
    await applyEnvironmentShader(object, {
      bakeVertexAo: false,
      hasSun: true,
      parameters: { saturation: 1.15 },
    });
    if (myToken !== token) return { spawnable: true };
    scene.add(object);
    current = object;

    // frame it
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const reach = Math.max(size.x, size.y, size.z, 1);
    controls.target.copy(center);
    camera.position.set(
      center.x + reach * 1.1,
      center.y + reach * 0.75,
      center.z + reach * 1.35,
    );
    camera.near = Math.max(reach / 100, 0.05);
    camera.far = reach * 40;
    camera.updateProjectionMatrix();
    return { built, spawnable: true };
  }

  let disposed = false;
  const clock = new THREE.Clock();
  const tick = () => {
    if (disposed) return;
    clock.getDelta();
    controls.update();
    renderer.render(scene, camera);
  };
  renderer.setAnimationLoop(tick);

  const resize = () => {
    const width = mount.clientWidth || 480;
    const height = mount.clientHeight || 360;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  return {
    dispose() {
      disposed = true;
      window.removeEventListener('resize', resize);
      renderer.setAnimationLoop(null);
      renderer.domElement.remove();
    },
    getCurrentObject: () => current,
    show,
  };
}
