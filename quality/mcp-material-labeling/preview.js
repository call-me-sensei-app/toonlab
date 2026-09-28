import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  CALL_ME_SENSEI_STYLE_BUNDLE,
  applyManufacturedStyleTargetLabelProposal,
  applyStyleBundle,
  collectStyleTargets,
  proposeManufacturedStyleTargetLabel,
} from '@call-me-sensei/toonlab/styles';

const fixtures = [
  {
    assetId: 'polyhaven:painted_wooden_bench',
    label: 'Painted Wooden Bench',
    path: './assets/painted_wooden_bench/painted_wooden_bench_1k.gltf',
    position: -3.9,
    result: 'Automatic',
  },
  {
    assetId: 'polyhaven:wooden_picnic_table',
    label: 'Wooden Picnic Table',
    path: './assets/wooden_picnic_table/wooden_picnic_table_1k.gltf',
    position: 0,
    result: 'Automatic',
  },
  {
    assetId: 'polyhaven:street_lamp_01',
    label: 'Street Lamp 01',
    overrides: {
      street_lamp_01: {
        baseMaterial: 'metal',
        contentFlags: [],
        finish: 'painted',
        renderMode: 'opaque',
        structuralRole: 'primaryMass',
      },
    },
    path: './assets/street_lamp_01/street_lamp_01_1k.gltf',
    position: 3.9,
    result: 'Assisted (1 override)',
  },
];

const cards = document.querySelector('#cards');
for (const fixture of fixtures) {
  fixture.card = document.createElement('article');
  fixture.card.className = 'card loading';
  fixture.card.innerHTML = `<h2>${fixture.label}</h2><p>Loading actual glTF…</p>`;
  cards.append(fixture.card);
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xaed8f2);
scene.fog = new THREE.Fog(0xaed8f2, 18, 34);
const camera = new THREE.PerspectiveCamera(39, innerWidth / innerHeight, 0.05, 100);
camera.position.set(0, 5.6, 15.5);
camera.lookAt(0, 1.6, 0);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.prepend(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xd9efff, 0x56704b, 2.2));
const sun = new THREE.DirectionalLight(0xfff3d7, 4.3);
sun.position.set(-6, 11, 7);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -12;
sun.shadow.camera.right = 12;
sun.shadow.camera.top = 10;
sun.shadow.camera.bottom = -5;
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(40, 22),
  new THREE.MeshStandardMaterial({ color: 0x7d9b63, roughness: 0.94 }),
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.03;
ground.receiveShadow = true;
scene.add(ground);

function fitModel(root, fixture) {
  const bounds = new THREE.Box3().setFromObject(root);
  const size = bounds.getSize(new THREE.Vector3());
  const scale = (fixture.assetId.includes('street_lamp') ? 4.2 : 3.2) / Math.max(size.x, size.y, size.z);
  root.scale.setScalar(scale);
  const scaled = new THREE.Box3().setFromObject(root);
  const center = scaled.getCenter(new THREE.Vector3());
  root.position.set(fixture.position - center.x, -scaled.min.y, -center.z);
  root.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
  });
}

const loader = new GLTFLoader();
for (const fixture of fixtures) {
  try {
    const gltf = await loader.loadAsync(fixture.path);
    const root = gltf.scene;
    root.name = fixture.assetId;
    const proposal = proposeManufacturedStyleTargetLabel(root, {
      assetId: fixture.assetId,
      materialOverrides: fixture.overrides,
      targetId: `qualification/${fixture.assetId}`,
    });
    if (!proposal.ready) throw new Error(proposal.issues.map(({ message }) => message).join(' '));
    applyManufacturedStyleTargetLabelProposal(root, proposal);
    fitModel(root, fixture);
    scene.add(root);
    await applyStyleBundle(CALL_ME_SENSEI_STYLE_BUNDLE, {
      mode: 'strict',
      targets: collectStyleTargets(root).targets,
    });
    fixture.card.className = 'card';
    const statusClass = fixture.result.startsWith('Automatic') ? 'pass' : 'assisted';
    fixture.card.innerHTML = `<h2>${fixture.label}</h2><p class="${statusClass}">${fixture.result}</p><p>${proposal.entries.length} material${proposal.entries.length === 1 ? '' : 's'} · strict bundle apply passed</p>`;
  } catch (error) {
    fixture.card.className = 'card';
    fixture.card.innerHTML = `<h2>${fixture.label}</h2><p style="color:#ff8585">FAIL · ${error.message}</p>`;
  }
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

renderer.setAnimationLoop((time) => {
  camera.position.x = Math.sin(time * 0.00008) * 0.8;
  camera.lookAt(0, 1.6, 0);
  renderer.render(scene, camera);
});
