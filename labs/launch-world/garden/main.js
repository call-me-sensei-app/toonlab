// Stillwater Garden — dev-server entry. Route: /labs/launch-world/garden/
//
// Query parameters:
//   ?shot=hero|pond|cascade|path|terrace|wide   camera preset (default hero)
//   ?quality=balanced|performance               scene quality profile
//   ?grass=N                                    moss-field placement cap
//   ?tex=N                                      ground-layer bake size (512|1024|2048)
//   ?renderer=webgl                             force the WebGL fallback backend
//   ?nopost=1                                   bypass the post pipeline
//   ?shadows=0                                  disengage the sun shadow pass (D19-235)
//   ?cloudshadow=0                              clear the cloud shadow pass
//   ?nograss=1                                  build no grass fields (ground diagnostic)
//   ?marks=1                                    draw authoring marks (spines, Yua)
//   ?ui=0                                       strip the HUD for captures
//   ?exposure= ?ambient= ?skyfill= ?groundfill=  value-structure sweep (D19-238)
//   ?splat=1                                    paint the splat channels as flat
//                                               primaries (red moss, green earth,
//                                               blue paving, white gravel)
//   ?splat=2                                    the same with the maps bound, so
//                                               the frame is `tint x detail` and a
//                                               channel whose albedo never reaches
//                                               the surface shows as a full primary
//   ?noreapply=1                                skip the post-bundle ground re-apply,
//                                               reproducing D19-236 — the negative
//                                               test for the configuration gate

import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { SHOTS, TIME_OF_DAY, createStillwaterGarden } from './scene.js';
import { BOUNDARY, PATH, POND_MARGIN, SPUR, YUA_MARK, gardenHeight } from './terrain.js';

const params = new URLSearchParams(location.search);
const backend = params.get('renderer') === 'webgl' ? 'webgl' : 'webgpu';
const quality = params.get('quality') === 'performance' ? 'performance' : 'balanced';
const numeric = (key, fallback, max) => {
  const value = Number(params.get(key));
  return Number.isFinite(value) && value > 0 ? Math.min(Math.trunc(value), max) : fallback;
};
const grassCount = params.get('nograss') === '1' ? 0 : numeric('grass', 15_000, 18_000);
const textureSize = numeric('tex', 1024, 2048);
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

  const spine = (frame, colour, lift) => {
    const points = [];
    const steps = 240;
    for (let index = 0; index <= steps; index += 1) {
      const along = frame.atArcLength((frame.length * index) / steps);
      const point = frame.pointAt(along);
      points.push(new THREE.Vector3(point.x, gardenHeight(point.x, point.z) + lift, point.z));
    }
    return new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color: colour }),
    );
  };
  group.add(spine(PATH, 0xffd166, 0.12));
  group.add(spine(SPUR, 0xc08457, 0.12));
  group.add(spine(POND_MARGIN, 0x4dd0ff, 0.06));
  group.add(spine(BOUNDARY, 0xff4d3d, 0.3));

  group.add(new THREE.ArrowHelper(
    new THREE.Vector3(Math.sin(YUA_MARK.facing), 0, Math.cos(YUA_MARK.facing)).normalize(),
    new THREE.Vector3(YUA_MARK.x, YUA_MARK.y + 0.1, YUA_MARK.z),
    3,
    0x3ddc84,
  ));
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

  // Near plane at 0.1 m: the foreground occluder is 6 m away and the pond
  // shot flies at 1.8 m, so a coarse near plane would clip the near read.
  const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 600);

  // Value-structure sweep controls (D19-204). These exist so exposure, ambient
  // fill and vegetation sky fill can be MEASURED across a range in one capture
  // run rather than hand-tuned one edit at a time. Omitted = the scene's
  // authored value, so a normal load is unaffected.
  const sweep = (key) => {
    const raw = params.get(key);
    if (raw === null) return undefined;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? value : undefined;
  };

  const world = await createStillwaterGarden({
    ambientIntensity: sweep('ambient'),
    // `?lane=0` builds the garden alone. Doc 21 §6: the street is additive and
    // must never drag the scene down to make itself fit, so dropping it has to
    // be a switch rather than a comment.
    buildLane: params.get('lane') !== '0',
    camera,
    cloudShadow: params.get('cloudshadow') !== '0',
    // FILL-018. `?envindirect=` is the environment family's `ambientStrength`
    // and `?probeblend=` is how far its ambient takes the six-axis probe's
    // direction. Both ship at 0 in the preset, which is why every surface
    // turned away from the sun rendered arithmetically black.
    envIndirect: sweep('envindirect'),
    envProbeBlend: sweep('probeblend'),
    envProbeChroma: sweep('probechroma'),
    exposure: sweep('exposure'),
    foliageStyle: params.get('foliage') === null ? null : Number(params.get('foliage')),
    grassCount,
    groundFill: sweep('groundfill'),
    onProgress: progress,
    quality,
    renderer,
    shadows: params.get('shadows') !== '0',
    skyFill: sweep('skyfill'),
    noReapply: params.get('noreapply') === '1',
    splatDebug: params.get('splat') ? Number(params.get('splat')) : false,
    treeStyleTargets: params.get('notarget') !== '1',
    textureSize,
  });

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 1;
  controls.maxDistance = 90;
  controls.maxPolarAngle = Math.PI * 0.495;

  function setShot(shotId) {
    controls.target.copy(world.applyShot(shotId));
    controls.update();
    if (shotName) shotName.textContent = shotId.toUpperCase();
    document.body.dataset.gardenShot = shotId;
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

  const backendName = renderer.backend?.isWebGPUBackend ? 'WebGPU' : 'WebGL2';
  const grassPlacements = world.census.grassClumps;
  const data = document.body.dataset;
  data.gardenBackend = backendName;
  data.gardenQuality = quality;
  data.gardenTimeOfDay = String(TIME_OF_DAY);
  data.gardenGrassPlacements = String(grassPlacements);
  data.gardenTrees = String(world.census.trees);
  data.gardenStone = String(world.census.stone);
  data.gardenStoneByClass = JSON.stringify(world.census.stoneByClass);
  data.gardenLane = JSON.stringify(world.census.lane ?? null);
  data.gardenLaneSurfaceLighting = String(world.census.laneSurfaceLighting ?? 0);
  data.gardenTextureSize = String(textureSize);
  data.gardenTexelDensity = world.groundLayers
    .map(({ pxPerCm, role }) => `${role}:${pxPerCm.toFixed(2)}`).join(',');
  // D19-041: this flag is `Boolean(runtime.shadowPass)` — true whenever the
  // object exists. It is NOT a shadow check. `renderCount` is.
  data.gardenShadowPass = String(Boolean(world.runtime.shadowPass));
  data.gardenShadowRenders = String(world.runtime.shadowPass?.renderCount ?? -1);
  data.gardenGroundFieldPass = String(Boolean(world.runtime.groundFieldPass));
  data.gardenSunElevation = (() => {
    // D19-065: `runtime.lighting.frame` has no scene-space sun direction, so
    // the elevation is read off the DirectionalLight itself.
    let light = null;
    world.scene.traverse((object) => { if (object.isDirectionalLight) light = object; });
    if (!light) return 'unknown';
    const position = light.getWorldPosition(new THREE.Vector3());
    return (Math.atan2(position.y, Math.hypot(position.x, position.z)) * (180 / Math.PI)).toFixed(1);
  })();
  data.gardenSunAzimuth = (() => {
    let light = null;
    world.scene.traverse((object) => { if (object.isDirectionalLight) light = object; });
    if (!light) return 'unknown';
    const position = light.getWorldPosition(new THREE.Vector3());
    const degrees = (Math.atan2(position.x, -position.z) * (180 / Math.PI) + 360) % 360;
    return degrees.toFixed(1);
  })();
  data.gardenReady = 'false';

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
        readout.textContent = `${fps} fps · ${backendName} · ${quality} · ${grassPlacements.toLocaleString()} clumps · ${world.census.trees} trees · ${world.census.stone} stones · sun ${TIME_OF_DAY}h`;
      }
      data.gardenFps = String(fps);
    }
    data.gardenFrames = String(frames);

    if (frames === 90) {
      const audit = world.surface.audit({ camera, styleRuntime: world.runtime });
      data.gardenSurfaceAudit = audit.ok ? 'pass' : 'fail';
      data.gardenSurfaceAuditIssues = audit.issues.map(({ code }) => code).join(',');
      data.gardenShadowRenders = String(world.runtime.shadowPass?.renderCount ?? -1);

      // The resolved-configuration audit is re-run HERE rather than only at
      // build time, because two of its checks (`shadowPass.renderCount`, the
      // ground-field pass readiness) are about things that have not happened
      // yet when the last line of assembly runs. A capture is gated on this
      // (`capture-launch-garden.mjs`), so a scene rendering with a system
      // silently off cannot produce a review frame at all.
      const config = world.auditConfiguration({ surfaceAudit: audit });
      data.gardenConfigAudit = config.ok ? 'pass' : 'fail';
      data.gardenConfigSummary = config.summary;
      data.gardenConfigFailures = JSON.stringify(config.failures.map((f) => ({
        id: f.id, expected: f.expected, resolved: f.resolved,
      })));
      data.gardenConfigReport = world.configAuditText;
      if (!config.ok) console.error(world.configAuditText);
      data.gardenReady = 'true';
    }
  });

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    world.resize(innerWidth, innerHeight, Math.min(devicePixelRatio, 1.5));
  });

  // The renderer is not part of the world object, but every lighting probe in
  // scripts/ needs it: `renderer.debug.getShaderAsync` is the only way to read
  // what a material's fragment stage ACTUALLY computes, and settings-level
  // introspection has been wrong twice on this scene already.
  world.renderer = renderer;
  globalThis.stillwaterGarden = world;
}

main().catch((error) => {
  console.error(error);
  document.body.dataset.gardenReady = 'false';
  document.body.dataset.gardenError = error.message ?? String(error);
  if (loading) {
    loading.innerHTML = '';
    const title = document.createElement('strong');
    title.textContent = 'Stillwater Garden failed to build';
    const message = document.createElement('pre');
    message.textContent = error.stack ?? error.message ?? String(error);
    loading.append(title, message);
    loading.dataset.error = 'true';
  }
});
