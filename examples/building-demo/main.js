// Building grammar demo: all five types in a row on undulating ground —
// the fastest way to LOOK at grammar output (and the target of
// scripts/capture-buildings.mjs). ?seed= re-rolls, ?type= isolates one,
// ?lo=1 shows the far LOD, ?slope=1 exaggerates the ground.

import * as THREE from 'three';
import { WebGPURenderer } from 'three/webgpu';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { applyEnvironmentShader } from '@call-me-sensei/toonlab/environment';
import { createEnvironmentSunRig } from '@call-me-sensei/toonlab/environment';
import { StylizedSky } from '@call-me-sensei/toonlab/sky';
import {
  BUILDING_TYPES,
  buildingAsset,
} from '@call-me-sensei/toonlab/buildinggen';
import { placeProps } from '@call-me-sensei/toonlab/propgen';

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed')) || 7;
const slopeScale = params.has('slope') ? 2.2 : 1;
const detail = params.get('lo') ? 'lo' : 'hi';

const heightAt = (x, z) => slopeScale * (
  1.4 * Math.sin(x / 17) * Math.cos(z / 23) + 0.6 * Math.sin(z / 9 + 1.7)
);

async function main() {
  const renderer = new WebGPURenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  document.body.appendChild(renderer.domElement);
  await renderer.init();

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 600);
  camera.position.set(14, 12, 30);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 2, 0);

  // ground: displaced plane under everything
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 60, 96, 48),
    new THREE.MeshStandardMaterial({ color: 0x6da55a }),
  );
  ground.rotation.x = -Math.PI / 2;
  const positions = ground.geometry.attributes.position;
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const z = -positions.getY(index); // plane local → world before rotation
    positions.setZ(index, heightAt(x, z));
  }
  ground.geometry.computeVertexNormals();
  ground.receiveShadow = true;
  const root = new THREE.Group();
  root.add(ground);
  scene.add(root);

  const sky = new StylizedSky({ style: 'call_me_sensei' });
  scene.add(sky);

  // buildings: one of each type (or ?type= isolates)
  const requested = params.get('type');
  const types = requested && BUILDING_TYPES[requested] ? [requested] : Object.keys(BUILDING_TYPES);
  const spacingX = 18;
  const updaters = [];
  types.forEach((type, index) => {
    const asset = buildingAsset({ seed: seed + index, type });
    const x = (index - (types.length - 1) / 2) * spacingX;
    const placed = placeProps({
      asset,
      heightAt,
      parent: root,
      positions: [{ x, yaw: 0.35, z: 0 }],
      seed: seed + index * 7,
      variants: 1,
    });
    updaters.push(placed.update);
  });

  await applyEnvironmentShader(root, {
    hasSun: true,
    parameters: {
      heightFogColor: [0.63, 0.8, 0.98],
      heightFogDensity: 0.0008,
      heightFogFalloff: 400,
      saturation: 1.18,
    },
  });
  createEnvironmentSunRig({
    environmentBox: new THREE.Box3().setFromObject(root),
    scene,
    sourceRatios: { x: -0.4, y: 0.8, z: -0.3 },
  });
  renderer.shadowMap.enabled = true;

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const delta = clock.getDelta();
    controls.update();
    if (detail === 'lo') camera.updateMatrixWorld(); // lo preview forces far pools via distance
    for (const update of updaters) update(delta, camera);
    sky.update(delta, camera);
    renderer.render(scene, camera);
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
  document.body.dataset.demoReady = 'true';
}

main().catch((error) => {
  console.error(error);
  document.body.dataset.demoReady = 'error';
});
