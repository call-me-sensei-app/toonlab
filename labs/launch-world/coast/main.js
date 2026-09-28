// Azure Headland — dev-server entry. Route: /labs/launch-world/coast/
//
// Query parameters:
//   ?shot=hero|promenade|swash|wide|bluff   camera preset (default hero)
//   ?quality=balanced|performance           scene quality profile
//   ?grass=N                                per-field grass placement cap
//   ?renderer=webgl                         force the WebGL fallback backend
//   ?nopost=1                               bypass the post pipeline
//   ?marks=1                                draw authoring marks (Yua's stance,
//                                           the shoreline curve, the promenade)

import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { SHOTS, TIME_OF_DAY, createAzureHeadland } from './scene.js';
import { YUA_FACING, YUA_MARK, pathZ, shoreZ } from './terrain.js';

const params = new URLSearchParams(location.search);
const backend = params.get('renderer') === 'webgl' ? 'webgl' : 'webgpu';
const quality = params.get('quality') === 'performance' ? 'performance' : 'balanced';
const grassCount = Number.isFinite(Number(params.get('grass')))
  && Number(params.get('grass')) > 0
  ? Math.min(Math.trunc(Number(params.get('grass'))), 18_000)
  : 18_000;
const requestedShot = SHOTS[params.get('shot')] ? params.get('shot') : 'hero';

const stage = document.querySelector('#stage');
const loading = document.querySelector('#loading');
const detail = document.querySelector('#loadingDetail');
const readout = document.querySelector('#readout');
const shotName = document.querySelector('#shotName');

function progress(text) {
  if (detail) detail.textContent = text;
}

// Authoring marks. Off by default — these are measurement aids, never set
// dressing, and nothing here stands in for an absent asset (§2).
function buildMarks(scene) {
  const group = new THREE.Group();
  group.name = 'Authoring marks';

  const curve = (fn, colour, y) => {
    const points = [];
    for (let x = -110; x <= 110; x += 1) points.push(new THREE.Vector3(x, y, fn(x)));
    return new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color: colour }),
    );
  };
  group.add(curve(shoreZ, 0xff4d3d, 0.12));
  group.add(curve(pathZ, 0xffd166, 0.35));

  const stance = new THREE.ArrowHelper(
    new THREE.Vector3(YUA_FACING.x, YUA_FACING.y, YUA_FACING.z).normalize(),
    new THREE.Vector3(YUA_MARK.x, YUA_MARK.y, YUA_MARK.z),
    6,
    0x3ddc84,
  );
  group.add(stance);
  scene.add(group);
  return group;
}

async function main() {
  const renderer = new THREE.WebGPURenderer({
    antialias: true,
    forceWebGL: backend === 'webgl',
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setSize(innerWidth, innerHeight);
  stage.append(renderer.domElement);
  await renderer.init();

  const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.1, 2400);

  const world = await createAzureHeadland({
    camera,
    grassCount,
    grassWashOpacity: params.has('grasswash') ? Number(params.get('grasswash')) : null,
    onProgress: progress,
    quality,
    renderer,
    cloudShadow: params.get('cloudshadow') !== '0',
    shadows: params.get('shadows') === '1',
  });

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 2;
  controls.maxDistance = 320;
  controls.maxPolarAngle = Math.PI * 0.495;

  function setShot(shotId) {
    controls.target.copy(world.applyShot(shotId));
    controls.update();
    if (shotName) shotName.textContent = shotId.toUpperCase();
    document.body.dataset.coastShot = shotId;
    for (const button of document.querySelectorAll('#hud [data-shot]')) {
      button.classList.toggle('active', button.dataset.shot === shotId);
    }
  }
  for (const button of document.querySelectorAll('#hud [data-shot]')) {
    button.addEventListener('click', () => setShot(button.dataset.shot));
  }
  setShot(requestedShot);

  if (params.get('marks') === '1') buildMarks(world.scene);
  // Review captures want the frame, not the chrome.
  if (params.get('ui') === '0') {
    for (const node of document.querySelectorAll('#hud, #panel')) node.remove();
  }

  const usePost = params.get('nopost') !== '1';
  loading?.remove();

  const backendName = renderer.backend?.isWebGPUBackend ? 'WebGPU' : 'WebGL2';
  const grassPlacements = world.census.grassClumps;
  document.body.dataset.coastBackend = backendName;
  document.body.dataset.coastQuality = quality;
  document.body.dataset.coastTimeOfDay = String(TIME_OF_DAY);
  document.body.dataset.coastGrassPlacements = String(grassPlacements);
  document.body.dataset.coastTrees = String(world.census.trees);
  document.body.dataset.coastCliffs = String(world.census.cliffs);
  document.body.dataset.coastBoulders = String(world.census.boulders);
  document.body.dataset.coastShadowPass = String(Boolean(world.runtime.shadowPass));
  document.body.dataset.coastGroundFieldPass = String(Boolean(world.runtime.groundFieldPass));
  document.body.dataset.coastSunElevation = (() => {
    const direction = world.runtime.lighting?.frame?.sunDirection;
    if (!direction) return 'unknown';
    const [x, y, z] = Array.isArray(direction) ? direction : direction.toArray();
    return (Math.atan2(y, Math.hypot(x, z)) * (180 / Math.PI)).toFixed(1);
  })();
  document.body.dataset.coastReady = 'false';

  const clock = new THREE.Clock();
  let frames = 0;
  let fpsFrames = 0;
  let fpsTime = 0;
  let fps = 0;
  renderer.setAnimationLoop(() => {
    const delta = Math.min(clock.getDelta(), 0.05);
    controls.update();
    world.update(delta);
    if (usePost) world.post.render(delta);
    else renderer.render(world.scene, camera);

    frames += 1;
    fpsFrames += 1;
    fpsTime += delta;
    if (fpsTime >= 0.5) {
      fps = Math.round(fpsFrames / fpsTime);
      fpsFrames = 0;
      fpsTime = 0;
      if (readout) {
        readout.textContent = `${fps} fps · ${backendName} · ${quality} · ${grassPlacements.toLocaleString()} grass clumps · ${world.census.trees} trees · ${world.census.cliffs + world.census.boulders} rocks · sun ${TIME_OF_DAY}h`;
      }
      document.body.dataset.coastFps = String(fps);
    }
    document.body.dataset.coastFrames = String(frames);

    if (frames === 90) {
      const audit = world.surface.audit({ camera, styleRuntime: world.runtime });
      document.body.dataset.coastSurfaceAudit = audit.ok ? 'pass' : 'fail';
      document.body.dataset.coastSurfaceAuditIssues = audit.issues
        .map(({ code }) => code).join(',');
      document.body.dataset.coastReady = 'true';
    }
  });

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    world.resize(innerWidth, innerHeight, Math.min(devicePixelRatio, 1.5));
  });

  globalThis.azureHeadland = world;
}

main().catch((error) => {
  console.error(error);
  document.body.dataset.coastReady = 'false';
  document.body.dataset.coastError = error.message ?? String(error);
  if (loading) {
    loading.innerHTML = '';
    const title = document.createElement('strong');
    title.textContent = 'Azure Headland failed to build';
    const message = document.createElement('pre');
    message.textContent = error.stack ?? error.message ?? String(error);
    loading.append(title, message);
    loading.dataset.error = 'true';
  }
});
