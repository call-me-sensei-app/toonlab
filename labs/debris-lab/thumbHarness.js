// Dev-only harness behind debris-lab/thumbs.html: renders ONE debris
// recipe with the real environment toon shader on a transparent canvas,
// framed for a gallery card. scripts/generate-debris-thumbs.mjs drives it
// per preset and captures WebP card art. Not part of any build input.

import * as THREE from 'three';

import { applyEnvironmentShader } from '../../src/environment/environmentMaterialAdapter.js';
import { createDebrisAsset, settleDebrisPhysics } from '../../src/debrisgen/index.js';
import { createDebrisSettings } from '../../src/debrisgen/debrisSettings.js';
import { createLabRenderer, whenRendererReady } from '../shared/rendererFactory.js';

const params = new URLSearchParams(window.location.search);
const width = Number(params.get('w')) || 512;
const height = Number(params.get('h')) || 356;

async function boot() {
  const recipe = JSON.parse(params.get('recipe'));
  const settings = createDebrisSettings(recipe.settings);

  const renderer = createLabRenderer({ antialias: true });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height);
  renderer.setClearColor(0x000000, 0);
  document.getElementById('stage').appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = null;

  // Match the lab's key/fill so cards read like the editor.
  scene.add(new THREE.AmbientLight(0xdfe8f2, 0.55));
  const sun = new THREE.DirectionalLight(0xffe4bf, 1.05);
  sun.position.set(8, 12, 7);
  scene.add(sun);

  const asset = createDebrisAsset(settings);
  await settleDebrisPhysics(asset).catch(() => {});
  const originals = new Set();
  asset.traverse((object) => {
    if (!object.isMesh) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (material) originals.add(material);
    }
  });
  const contrast = settings.surface.toonContrast;
  await applyEnvironmentShader(asset, {
    bakeVertexAo: false,
    environmentBox: new THREE.Box3(new THREE.Vector3(-20, -1, -20), new THREE.Vector3(20, 12, 20)),
    hasSun: true,
    parameters: {
      ambientStrength: 0.58 + (1 - contrast) * 0.16,
      aoWarmth: 0.52,
      shadowLift: 0.58 - contrast * 0.34,
      untexturedGradientStrength: 0.2 + settings.surface.edgeLight * 0.28,
      vertexAoStrength: 0.8,
    },
    scanStylize: false,
  });
  for (const material of originals) material.dispose();
  scene.add(asset);

  // Soft contact-shadow blob so pieces don't float on the card.
  const bounds = new THREE.Box3().setFromObject(asset);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const shadowSize = 64;
  const shadowData = new Uint8Array(shadowSize * shadowSize * 4);
  for (let y = 0; y < shadowSize; y += 1) {
    for (let x = 0; x < shadowSize; x += 1) {
      const dx = (x / (shadowSize - 1)) * 2 - 1;
      const dy = (y / (shadowSize - 1)) * 2 - 1;
      const alpha = Math.max(0, 1 - Math.hypot(dx, dy)) ** 1.8;
      shadowData[(y * shadowSize + x) * 4 + 3] = Math.round(alpha * 105);
    }
  }
  const shadowTexture = new THREE.DataTexture(shadowData, shadowSize, shadowSize, THREE.RGBAFormat);
  shadowTexture.needsUpdate = true;
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ depthWrite: false, map: shadowTexture, transparent: true }),
  );
  shadow.scale.set(Math.max(size.x, 0.4) * 1.5, 1, Math.max(size.z, 0.4) * 1.5);
  shadow.position.set(center.x, 0.002, center.z);
  scene.add(shadow);

  const camera = new THREE.PerspectiveCamera(38, width / height, 0.05, 200);
  const radius = Math.max(size.x, size.y * 1.7, size.z, 0.3) * 0.62;
  const distance = radius / Math.tan((camera.fov * Math.PI) / 360) * 0.98;
  const azimuth = 0.68;
  const elevation = 0.4;
  camera.position.set(
    center.x + Math.cos(azimuth) * Math.cos(elevation) * distance,
    center.y + Math.sin(elevation) * distance,
    center.z + Math.sin(azimuth) * Math.cos(elevation) * distance,
  );
  camera.lookAt(center.x, center.y * 0.9, center.z);

  await whenRendererReady(renderer);
  let frames = 0;
  function tick() {
    renderer.render(scene, camera);
    frames += 1;
    // A few frames so async pipeline compiles settle before capture.
    if (frames === 12) document.title = 'thumb-ready';
    requestAnimationFrame(tick);
  }
  tick();
}

boot().catch((error) => {
  console.error(error);
  document.title = `thumb-error:${error.message}`;
});
