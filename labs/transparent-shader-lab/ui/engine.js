import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { createTransparentProfile } from '../transparentProfile.js';

function createFixture(material) {
  const group = new THREE.Group();
  group.name = 'ToonLab transparent procedural fixtures';

  const pane = new THREE.Mesh(new THREE.BoxGeometry(2.7, 2.7, 0.16), material);
  pane.name = 'Window pane';
  pane.position.set(-2.25, 1.65, 0);

  const orb = new THREE.Mesh(new THREE.SphereGeometry(1.22, 64, 40), material);
  orb.name = 'Solid glass orb';
  orb.position.set(0.35, 1.4, 0);

  const crystal = new THREE.Mesh(new THREE.IcosahedronGeometry(1.32, 1), material);
  crystal.name = 'Faceted crystal';
  crystal.position.set(2.9, 1.45, 0);
  crystal.rotation.set(0.18, 0.42, 0.1);

  group.add(pane, orb, crystal);
  return group;
}

function createMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: 0xbdebf2,
    roughness: 0.12,
    metalness: 0,
    transmission: 0.92,
    thickness: 0.75,
    ior: 1.45,
    attenuationColor: 0x78c7d8,
    attenuationDistance: 3.5,
    clearcoat: 0.72,
    clearcoatRoughness: 0.12,
    envMapIntensity: 1.15,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

function applySettings(material, input) {
  const profile = createTransparentProfile(input);
  const settings = profile.settings;
  material.color.set(settings.color);
  material.attenuationColor.set(settings.attenuationColor);
  material.attenuationDistance = settings.attenuationDistance;
  material.clearcoat = settings.clearcoat;
  material.clearcoatRoughness = settings.clearcoatRoughness;
  material.envMapIntensity = settings.envMapIntensity;
  material.ior = settings.ior;
  material.metalness = settings.metalness;
  material.opacity = settings.transmission > 0.01 ? 1 : settings.opacity;
  material.roughness = settings.roughness;
  material.thickness = settings.thickness;
  material.transmission = settings.transmission;
  material.depthWrite = settings.depthWrite;
  material.needsUpdate = true;
  return profile;
}

export function createTransparentPreview({ container }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0c1420);
  const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.05, 100);
  camera.position.set(7.8, 4.8, 9.2);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0.4, 1.3, 0);

  scene.add(new THREE.HemisphereLight(0xcce6ff, 0x273142, 2.2));
  const sun = new THREE.DirectionalLight(0xfff2d1, 4.2);
  sun.position.set(-4, 8, 6);
  sun.castShadow = true;
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x6fd5ff, 3.2);
  rim.position.set(7, 4, -6);
  scene.add(rim);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(24, 16),
    new THREE.MeshStandardMaterial({ color: 0x283746, roughness: 0.82, metalness: 0.04 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const colorCards = [0xe26a72, 0xf2c86f, 0x66b6c8, 0x7c79c9].map((color, index) => {
    const card = new THREE.Mesh(
      new THREE.BoxGeometry(1.15, 2.2, 0.22),
      new THREE.MeshStandardMaterial({ color, roughness: 0.62 }),
    );
    card.position.set(-3.3 + index * 2.15, 1.1, -1.7);
    scene.add(card);
    return card;
  });

  const material = createMaterial();
  const fixture = createFixture(material);
  fixture.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
  });
  scene.add(fixture);

  let spin = true;
  let profile = applySettings(material, {});
  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', resize);

  renderer.setAnimationLoop((time) => {
    if (spin) fixture.rotation.y = Math.sin(time * 0.00018) * 0.22;
    controls.update();
    renderer.render(scene, camera);
  });

  document.body.dataset.rendererBackend = 'webgl';
  document.body.dataset.stageReady = 'true';
  return {
    apply(next) {
      profile = applySettings(material, next);
      return profile;
    },
    dispose() {
      renderer.setAnimationLoop(null);
      window.removeEventListener('resize', resize);
      controls.dispose();
      material.dispose();
      colorCards.forEach((mesh) => {
        mesh.geometry.dispose();
        mesh.material.dispose();
      });
      renderer.dispose();
      renderer.domElement.remove();
    },
    frame() {
      camera.position.set(7.8, 4.8, 9.2);
      controls.target.set(0.4, 1.3, 0);
      controls.update();
    },
    getProfile: () => profile,
    setBackdrop(mode) {
      scene.background.set(mode === 'light' ? 0xb8c8d2 : 0x0c1420);
      ground.material.color.set(mode === 'light' ? 0x778d9a : 0x283746);
    },
    setSpin(value) {
      spin = Boolean(value);
      if (!spin) fixture.rotation.y = 0;
    },
  };
}
