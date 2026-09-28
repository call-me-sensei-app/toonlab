// Dev-only harness behind building-lab/thumbs.html: renders ONE building
// recipe with the real environment toon shader on a transparent canvas,
// framed for a gallery card. scripts/generate-building-thumbs.mjs drives it
// per preset and captures WebP card art. Not part of any build input.

import * as THREE from 'three';

import { applyEnvironmentShader } from '../../src/environment/environmentMaterialAdapter.js';
import { buildingSettingsFromRecipe, createBuildingFromRecipe } from '../../src/buildinggen/index.js';
import { createLabRenderer, whenRendererReady } from '../shared/rendererFactory.js';

const params = new URLSearchParams(window.location.search);
const width = Number(params.get('w')) || 512;
const height = Number(params.get('h')) || 356;

async function boot() {
  const recipe = JSON.parse(params.get('recipe'));
  const settings = buildingSettingsFromRecipe(recipe);

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
  sun.position.set(16, 22, 12);
  scene.add(sun);

  const asset = createBuildingFromRecipe(settings, { detail: 'hi' }).object3D;
  await applyEnvironmentShader(asset, {
    bakeVertexAo: false,
    environmentBox: new THREE.Box3(new THREE.Vector3(-30, -2, -30), new THREE.Vector3(30, 20, 30)),
    hasSun: true,
    parameters: {
      ambientStrength: 0.62,
      aoWarmth: 0.52,
      shadowLift: 0.44,
      untexturedGradientStrength: 0.26,
      vertexAoStrength: 0.8,
    },
    scanStylize: false,
  });
  // Source role materials are cache-owned (shared by every build) — unlike
  // prop thumbs, nothing to dispose after conversion.
  scene.add(asset);

  // Soft contact-shadow blob under the buried foundation skirt so the
  // building doesn't float on the card (bounds.min.y is the skirt bottom).
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
  shadow.scale.set(Math.max(size.x, 2) * 1.4, 1, Math.max(size.z, 2) * 1.4);
  shadow.position.set(center.x, bounds.min.y + 0.002, center.z);
  scene.add(shadow);

  // Frame the above-ground body — the buried skirt (bounds.min.y) hangs low
  // on the card as the base the shadow sits under, instead of pushing the
  // building up and shrinking it.
  center.y = bounds.max.y / 2;
  const camera = new THREE.PerspectiveCamera(38, width / height, 0.05, 200);
  const radius = Math.max(size.x, bounds.max.y * 1.15, size.z, 2) * 0.76;
  const distance = radius / Math.tan((camera.fov * Math.PI) / 360) * 0.98;
  const azimuth = 0.68;
  const elevation = 0.4;
  camera.position.set(
    center.x + Math.cos(azimuth) * Math.cos(elevation) * distance,
    center.y + Math.sin(elevation) * distance,
    center.z + Math.sin(azimuth) * Math.cos(elevation) * distance,
  );
  camera.lookAt(center.x, center.y * 0.78, center.z);

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
