// ToonLab ambient-vfx demo — the smallest scene that exercises every effect:
// a procedural meadow with a pond basin (heightAt + waterLevel are the only
// terrain contract), a StylizedSky and a sun light driven by the canonical
// environmentTimeOfDay hour, two StylizedTrees registered as bloom volumes
// (pink → petals, autumn → leaves), and all five ambient effects with URL
// density toggles for perf/visual triage.
//
//   ?petals=0 &leaves=2 &fireflies=1.5 &pollen=0 &mist=1   (multiplier, 0=off)
//   ?time=19.5 &seed=7 &wind=45(deg) &windstrength=0.2 &preset=default
//   ?yaw=0.6 &pitch=0.32 &dist=34 &dpr=1
//
// NOTE: ambientfx is imported relatively — the package alias lands with the
// INTEGRATION.md wiring.

import * as THREE from 'three';
import { WebGPURenderer } from 'three/webgpu';

import { StylizedSky } from '@call-me-sensei/toonlab/sky';
import { StylizedTree } from '@call-me-sensei/toonlab/vegetation';
import { sampleEnvironmentTimeOfDay } from '@call-me-sensei/toonlab/environment';

import { createAmbientFx } from '@call-me-sensei/toonlab/ambientfx';

const params = new URLSearchParams(location.search);
const numberParam = (key, fallback) => {
  const raw = params.get(key);
  if (raw === null || raw === '') return fallback; // Number(null) is 0, not NaN
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
};

// ------------------------------------------------------------------ terrain
const WATER_LEVEL = -0.6;
const heightAt = (x, z) =>
  1.6 * Math.sin(x / 16) * Math.cos(z / 14) +
  2.4 * Math.sin(x / 43 + 1.7) * Math.cos(z / 38) -
  5.2 * Math.exp(-((x - 14) ** 2 + (z + 6) ** 2) / 320);

function buildGround() {
  const size = 260;
  const segments = 150;
  const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const grassDeep = new THREE.Color().setRGB(0.2, 0.42, 0.16, THREE.SRGBColorSpace);
  const grassLight = new THREE.Color().setRGB(0.45, 0.68, 0.27, THREE.SRGBColorSpace);
  const sand = new THREE.Color().setRGB(0.78, 0.7, 0.5, THREE.SRGBColorSpace);
  const pond = new THREE.Color().setRGB(0.12, 0.36, 0.42, THREE.SRGBColorSpace);
  const scratch = new THREE.Color();
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const z = position.getZ(i);
    const h = heightAt(x, z);
    position.setY(i, h);
    const t = THREE.MathUtils.clamp((h + 1) / 6, 0, 1);
    scratch.copy(grassDeep).lerp(grassLight, t);
    // Sand ring at the waterline; the basin floor reads as a still pond.
    // Band is wider than the mesh grid so the paint can't alias into zigzags.
    const shore = THREE.MathUtils.smoothstep(Math.abs(h - WATER_LEVEL), 0.15, 1.5);
    scratch.lerp(sand, 1 - shore);
    if (h < WATER_LEVEL - 0.1) scratch.copy(pond);
    colors[i * 3] = scratch.r;
    colors[i * 3 + 1] = scratch.g;
    colors[i * 3 + 2] = scratch.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    roughness: 1,
    vertexColors: true,
  }));
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}

// --------------------------------------------------------------------- app
async function main() {
  const renderer = new WebGPURenderer({
    antialias: true,
    forceWebGL: params.get('renderer') === 'webgl',
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, numberParam('dpr', 2)));
  renderer.shadowMap.enabled = true;
  (window.__toonlabHostMount ?? document.body).appendChild(renderer.domElement);
  await renderer.init();

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.2, 500);
  scene.add(buildGround());

  const sky = new StylizedSky({ radius: 320 });
  scene.add(sky);
  scene.fog = new THREE.Fog(0xa8c4e0, 70, 260);

  const sunLight = new THREE.DirectionalLight(0xffffff, 2);
  sunLight.castShadow = true;
  sunLight.shadow.camera.left = -40;
  sunLight.shadow.camera.right = 40;
  sunLight.shadow.camera.top = 40;
  sunLight.shadow.camera.bottom = -40;
  sunLight.shadow.mapSize.set(1024, 1024);
  scene.add(sunLight, sunLight.target);
  const fillLight = new THREE.HemisphereLight(0xbdd6f2, 0x4a5a3a, 0.55);
  scene.add(fillLight);

  // Two hero trees double as petal/leaf sources: their crowns become bloom
  // volumes so the fall visibly originates in the canopies.
  const blossomTree = new StylizedTree({ canopyColor: 0xf2a2c4, seed: 5, size: 3.4 });
  blossomTree.position.set(-7, heightAt(-7, -4), -4);
  const autumnTree = new StylizedTree({
    canopyColor: { from: 0xe8a33c, to: 0xd96f29 }, seed: 21, size: 3.1,
  });
  autumnTree.position.set(9, heightAt(9, 9), 9);
  scene.add(blossomTree, autumnTree);
  const bloomVolume = (tree, effect, color) => {
    tree.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(tree.canopyMesh);
    const center = box.getCenter(new THREE.Vector3());
    const extent = box.getSize(new THREE.Vector3());
    return {
      color,
      effect,
      radius: Math.max(extent.x, extent.y, extent.z) * 0.5,
      x: center.x, y: center.y, z: center.z,
    };
  };

  // ------------------------------------------------------------- ambient fx
  const effectParam = (key) => {
    if (!params.has(key)) return true;
    const density = Number(params.get(key));
    if (!Number.isFinite(density) || density <= 0) return false;
    return { density };
  };
  // Golden hour by default: warm light, petals/leaves/pollen all visible,
  // one click away from dusk fireflies or dawn mist via the time buttons.
  let hour = numberParam('time', 17.5);
  const orbitTarget = new THREE.Vector3(
    numberParam('tx', 0), numberParam('ty', 1.5), numberParam('tz', 0));
  const fx = createAmbientFx({
    bounds: { x: 128, z: 128 },
    effects: {
      fireflies: effectParam('fireflies'),
      leaves: effectParam('leaves'),
      mist: effectParam('mist'),
      petals: effectParam('petals'),
      pollen: effectParam('pollen'),
    },
    followTarget: orbitTarget,
    heightAt,
    preset: params.get('preset') ?? 'call_me_sensei',
    seed: numberParam('seed', 7),
    timeOfDay: () => hour,
    waterLevel: WATER_LEVEL,
  });
  fx.addBloomSources([
    bloomVolume(blossomTree, 'petals', [0.99, 0.66, 0.8]),
    bloomVolume(autumnTree, 'leaves', [0.93, 0.62, 0.16]),
  ]);
  if (params.has('wind') || params.has('windstrength')) {
    fx.setWind((numberParam('wind', 18) * Math.PI) / 180, numberParam('windstrength', 0.16));
  }
  // Height-fog layer: same parameters a full world would forward (the demo
  // world floor sits around the basin bottom).
  fx.setDistanceFog({ color: [0.63, 0.8, 0.98], density: 0.002, falloff: 400, floorY: -6 });
  scene.add(fx.root);

  // ------------------------------------------------- time-of-day appearance
  // One clock for everything: the canonical environmentTimeOfDay sample
  // drives sky, sun light, fog color, AND the fx gates (fx polls `hour`).
  const clockLabel = document.getElementById('clock');
  const zenithBase = new THREE.Color(0.28, 0.56, 0.92);
  const horizonBase = new THREE.Color(0.78, 0.92, 1.0);
  const scratchA = new THREE.Color();
  const scratchB = new THREE.Color();
  const applyHour = () => {
    const state = sampleEnvironmentTimeOfDay(hour);
    const luminance = 0.1 + 0.9 * Math.min(state.sunIntensity, 1);
    const ratios = state.sunSourceRatios;
    const sunDir = new THREE.Vector3(ratios.x, ratios.y, ratios.z).normalize();
    scratchA.copy(zenithBase).multiply(state.skyTopTint).multiplyScalar(luminance);
    scratchB.copy(horizonBase).multiply(state.skyGroundTint).multiplyScalar(luminance);
    sky.applySettings({
      cloudColor: [luminance, luminance, luminance],
      cloudCoverage: 0.4,
      cloudShadeColor: [0.68 * luminance, 0.78 * luminance, 0.92 * luminance],
      horizonColor: [scratchB.r, scratchB.g, scratchB.b],
      starsStrength: THREE.MathUtils.clamp(1 - state.sunIntensity * 4, 0, 1),
      sunColor: [state.sunColor.r, state.sunColor.g, state.sunColor.b],
      sunDirection: [sunDir.x, sunDir.y, sunDir.z],
      zenithColor: [scratchA.r, scratchA.g, scratchA.b],
    });
    sunLight.color.copy(state.sunColor);
    // Steep curve: dusk/night actually get DARK (fireflies need it).
    sunLight.intensity = 0.1 + Math.pow(state.sunIntensity, 1.4) * 2.4;
    sunLight.position.copy(sunDir).multiplyScalar(70);
    fillLight.intensity = 0.05 + 0.5 * state.ambientScale * Math.min(state.sunIntensity + 0.1, 1);
    scene.fog.color.copy(state.fogColor).multiplyScalar(0.4 + luminance * 0.6);
    // Trees carry their own canopy sun — follow the same clock or they stay
    // day-bright at midnight.
    const canopySun = [
      state.sunColor.r * (0.25 + 0.75 * luminance),
      state.sunColor.g * (0.25 + 0.75 * luminance),
      state.sunColor.b * (0.25 + 0.75 * luminance),
    ];
    const canopySky = [0.5 * luminance + 0.06, 0.55 * luminance + 0.06, 0.75 * luminance + 0.08];
    blossomTree.setSun({ color: canopySun, direction: [sunDir.x, sunDir.y, sunDir.z], sky: canopySky });
    autumnTree.setSun({ color: canopySun, direction: [sunDir.x, sunDir.y, sunDir.z], sky: canopySky });
    fx.setSun({ direction: [sunDir.x, sunDir.y, sunDir.z] });
    clockLabel.textContent = `${String(Math.floor(hour) % 24).padStart(2, '0')}:${String(Math.round((hour % 1) * 60)).padStart(2, '0')}`;
  };
  // One-click times of day — every effect has its hour, no URL editing.
  const timeButtons = [...document.querySelectorAll('#times button')];
  const markActiveTime = () => {
    for (const button of timeButtons) {
      button.classList.toggle('on', Math.abs(Number(button.dataset.hour) - hour) < 0.51);
    }
  };
  for (const button of timeButtons) {
    button.addEventListener('click', () => {
      hour = Number(button.dataset.hour);
      applyHour();
      markActiveTime();
    });
  }
  applyHour();
  markActiveTime();
  window.addEventListener('keydown', (event) => {
    if (event.key === '[') { hour = (hour + 23.75) % 24; applyHour(); markActiveTime(); }
    if (event.key === ']') { hour = (hour + 0.25) % 24; applyHour(); markActiveTime(); }
  });

  // ------------------------------------------------------------ orbit camera
  const orbit = {
    dist: numberParam('dist', 30),
    pitch: numberParam('pitch', 0.24),
    yaw: numberParam('yaw', 0.5),
  };
  const applyOrbit = () => {
    camera.position.set(
      orbitTarget.x + Math.cos(orbit.yaw) * Math.cos(orbit.pitch) * orbit.dist,
      orbitTarget.y + Math.sin(orbit.pitch) * orbit.dist,
      orbitTarget.z + Math.sin(orbit.yaw) * Math.cos(orbit.pitch) * orbit.dist,
    );
    camera.lookAt(orbitTarget);
  };
  applyOrbit();
  let dragging = false;
  renderer.domElement.addEventListener('pointerdown', (event) => {
    dragging = true;
    renderer.domElement.setPointerCapture(event.pointerId);
  });
  renderer.domElement.addEventListener('pointerup', () => { dragging = false; });
  renderer.domElement.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    orbit.yaw += event.movementX * 0.005;
    orbit.pitch = THREE.MathUtils.clamp(orbit.pitch + event.movementY * 0.004, -0.1, 1.35);
    applyOrbit();
  });
  renderer.domElement.addEventListener('wheel', (event) => {
    orbit.dist = THREE.MathUtils.clamp(orbit.dist * (1 + event.deltaY * 0.001), 6, 120);
    applyOrbit();
  }, { passive: true });
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  window.ambientFx = fx; // console/probe access
  document.getElementById('loading').remove();

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const delta = Math.min(clock.getDelta(), 0.05);
    sky.update(delta, camera);
    blossomTree.update(delta);
    autumnTree.update(delta);
    fx.update(delta, camera);
    renderer.render(scene, camera);
    if (document.body.dataset.demoReady !== 'true') {
      document.body.dataset.demoReady = 'true'; // headless captures key off this
      document.body.dataset.fxParticles = String(fx.stats.liveParticles);
      document.body.dataset.rendererBackend = renderer.backend?.isWebGPUBackend ? 'WebGPU' : 'WebGL2';
    }
  });
}

main().catch((error) => {
  console.error(error);
  document.body.dataset.demoReady = 'error';
  const loading = document.getElementById('loading');
  if (loading) loading.textContent = `Failed to start: ${error.message}`;
});
