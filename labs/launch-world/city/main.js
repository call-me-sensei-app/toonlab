// Nova Promenade — dev-server entry. Route: /labs/launch-world/city/
//
// Query parameters:
//   ?shot=s01|s05|s10|west|east|plan   camera preset (default s01)
//   ?quality=balanced|performance      scene quality profile
//   ?renderer=webgl                    force the WebGL fallback backend
//   ?nopost=1                          bypass the post pipeline
//   ?shadows=1                         engage the package sun-shadow pass
//                                      (currently produces an empty depth map
//                                      and shadows the whole city — D19-041)
//   ?ui=0                              strip the chrome for review captures
//   ?marks=1                           draw authoring marks (hero parcels,
//                                      Yua's mark, street voids)

import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { SHOTS, TIME_OF_DAY, createNovaPromenade, fovForLens } from './scene.js';
import { HERO_BLOCKS, YUA_MARK } from './massing.js';

const params = new URLSearchParams(location.search);
const backend = params.get('renderer') === 'webgl' ? 'webgl' : 'webgpu';
const quality = params.get('quality') === 'performance' ? 'performance' : 'balanced';
const requestedShot = SHOTS[params.get('shot')] ? params.get('shot') : 's01';

const stage = document.querySelector('#stage');
const loading = document.querySelector('#loading');
const detail = document.querySelector('#loadingDetail');
const readout = document.querySelector('#readout');
const shotName = document.querySelector('#shotName');

function progress(text) {
  if (detail) detail.textContent = text;
}

// Authoring marks. Off by default — measurement aids, never set dressing, and
// nothing here stands in for an absent asset (§2).
function buildMarks(scene) {
  const group = new THREE.Group();
  group.name = 'Authoring marks';

  for (const hero of HERO_BLOCKS) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(hero.reserve - 0.35, hero.reserve, 64).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffd166, side: THREE.DoubleSide }),
    );
    ring.position.set(hero.x, 0.08, hero.z);
    group.add(ring);
  }
  const yua = new THREE.ArrowHelper(
    new THREE.Vector3(-0.55, 0, 0.84).normalize(),
    new THREE.Vector3(YUA_MARK.x, 0, YUA_MARK.z),
    6,
    0x3ddc84,
  );
  group.add(yua);
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

  const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 2400);

  const world = await createNovaPromenade({
    camera,
    onProgress: progress,
    quality,
    renderer,
    shadows: params.get('shadows') === '1',
  });

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 2;
  controls.maxDistance = 420;
  controls.maxPolarAngle = Math.PI * 0.499;

  function setShot(shotId) {
    controls.target.copy(world.applyShot(shotId));
    controls.update();
    if (shotName) shotName.textContent = shotId.toUpperCase();
    document.body.dataset.cityShot = shotId;
    for (const button of document.querySelectorAll('#hud [data-shot]')) {
      button.classList.toggle('active', button.dataset.shot === shotId);
    }
  }
  for (const button of document.querySelectorAll('#hud [data-shot]')) {
    button.addEventListener('click', () => setShot(button.dataset.shot));
  }
  setShot(requestedShot);

  if (params.get('marks') === '1') buildMarks(world.scene);
  if (params.get('ui') === '0') {
    for (const node of document.querySelectorAll('#hud, #panel')) node.remove();
  }

  const usePost = params.get('nopost') !== '1';
  loading?.remove();

  const { audit, stats } = world.massing;
  const backendName = renderer.backend?.isWebGPUBackend ? 'WebGPU' : 'WebGL2';

  // Acceptance evidence, published on the document so a capture harness can
  // read it without scraping the console.
  document.body.dataset.cityBackend = backendName;
  document.body.dataset.cityQuality = quality;
  document.body.dataset.cityTimeOfDay = String(TIME_OF_DAY);
  document.body.dataset.cityMasses = String(stats.masses);
  document.body.dataset.cityVolumes = String(stats.volumes);
  document.body.dataset.cityTriangles = String(stats.triangles);
  document.body.dataset.cityDrawCalls = String(stats.drawCalls);
  document.body.dataset.cityPeakHeight = String(stats.peakHeight);
  document.body.dataset.cityBands = JSON.stringify(stats.bands);
  document.body.dataset.cityColourStructure = JSON.stringify(audit.colourStructure);
  document.body.dataset.cityLayoutIssues = String(audit.layoutIssues.length);
  document.body.dataset.cityVariationIssues = String(audit.variation.issues.length);
  document.body.dataset.cityGrammarViolations = String(audit.grammarInvariants.length);
  document.body.dataset.cityShadows = String(world.shadows);
  document.body.dataset.cityStreetInstances = String(world.street.stats.instances);
  document.body.dataset.cityStreetParts = String(world.street.stats.parts);
  document.body.dataset.cityDecorParts = String(stats.decorParts);
  document.body.dataset.cityReady = 'false';

  if (audit.layoutIssues.length > 0) console.warn('[city] layout issues', audit.layoutIssues);
  if (audit.variation.issues.length > 0) console.warn('[city] variation issues', audit.variation.issues);
  if (audit.grammarInvariants.length > 0) console.warn('[city] grammar invariants', audit.grammarInvariants);
  console.info('[city] massing', stats, audit.variation.archetypes, audit.colourStructure);

  const clock = new THREE.Clock();
  let frames = 0;
  let fpsFrames = 0;
  let fpsTime = 0;
  renderer.setAnimationLoop(() => {
    const delta = Math.min(clock.getDelta(), 0.05);
    controls.update();
    world.update(delta);
    // D19-042: the package sun-shadow pass and the god-ray pass allocate their
    // render targets lazily, so the first few submissions can reach a material
    // whose bound texture is still null and throw out of the animation loop —
    // which then never restarts. Swallow only that startup window, and report
    // anything that survives it instead of hiding it.
    try {
      if (usePost) world.post.render(delta);
      else renderer.render(world.scene, camera);
    } catch (error) {
      if (frames > 12) throw error;
      if (!document.body.dataset.cityWarmupError) {
        document.body.dataset.cityWarmupError = error.message ?? String(error);
        console.warn('[city] warm-up frame threw', error);
      }
    }

    frames += 1;
    fpsFrames += 1;
    fpsTime += delta;
    if (fpsTime >= 0.5) {
      const fps = Math.round(fpsFrames / fpsTime);
      fpsFrames = 0;
      fpsTime = 0;
      if (readout) {
        readout.textContent = `${fps} fps · ${backendName} · ${stats.masses} masses / ${stats.volumes} volumes · ${world.street.stats.instances} street instances · ${(stats.triangles / 1000).toFixed(0)}k tris · ${stats.drawCalls} draw calls`;
      }
      document.body.dataset.cityFps = String(fps);
    }
    document.body.dataset.cityFrames = String(frames);
    if (frames === 60) document.body.dataset.cityReady = 'true';
  });

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    // Lens is the authored quantity, not vertical FOV — re-derive it so the
    // framing stays a 28 mm frame at every aspect (see scene.js fovForLens).
    const shot = SHOTS[document.body.dataset.cityShot ?? 's01'] ?? SHOTS.s01;
    camera.fov = fovForLens(shot.lens, camera.aspect);
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    world.resize(innerWidth, innerHeight, Math.min(devicePixelRatio, 1.5));
  });

  globalThis.novaPromenade = world;
}

main().catch((error) => {
  console.error(error);
  document.body.dataset.cityShadows = String(world.shadows);
  document.body.dataset.cityStreetInstances = String(world.street.stats.instances);
  document.body.dataset.cityStreetParts = String(world.street.stats.parts);
  document.body.dataset.cityDecorParts = String(stats.decorParts);
  document.body.dataset.cityReady = 'false';
  document.body.dataset.cityError = error.message ?? String(error);
  if (loading) {
    loading.innerHTML = '';
    const title = document.createElement('strong');
    title.textContent = 'Nova Promenade failed to build';
    const message = document.createElement('pre');
    message.textContent = error.stack ?? error.message ?? String(error);
    loading.append(title, message);
    loading.dataset.error = 'true';
  }
});
