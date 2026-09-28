import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  CALL_ME_SENSEI_STYLE_BUNDLE,
  TOONLAB_MANNEQUIN_ASSET_URL,
  TOONLAB_VERSION,
  createCharacterRuntime,
  createSceneSurfaceRuntime,
  createSceneStyleRuntime,
  createStyleMaterialContract,
  createSkySystem,
  createStyleTargetLabel,
  labelStyleTarget,
} from '@call-me-sensei/toonlab';
import { PRESETS as SKY_PRESETS } from '@call-me-sensei/toonlab/sky';
import {
  StylizedTree,
} from '@call-me-sensei/toonlab/vegetation';

const params = new URLSearchParams(location.search);
const backend = params.get('renderer') === 'webgl' ? 'webgl' : 'webgpu';
const quality = params.get('quality') === 'performance' ? 'performance' : 'balanced';
const characterFormat = ['vrm', 'fbx'].includes(params.get('character')) ? params.get('character') : 'glb';
const status = document.querySelector('#status');

const CALL_ME_SENSEI_SKY_CONDITIONS = Object.freeze({
  partly_cloudy: Object.freeze({ hour: 11, preset: 'partlyCloudy' }),
  golden_hour: Object.freeze({ hour: 18.5, preset: 'stunningSunset' }),
  moonlit: Object.freeze({ hour: 0.5, preset: 'moonlitNight' }),
  overcast: Object.freeze({ hour: 13, preset: 'thunderstorm' }),
});

async function applySkyCondition(sky, runtime, conditionId) {
  const condition = CALL_ME_SENSEI_SKY_CONDITIONS[conditionId]
    ?? CALL_ME_SENSEI_SKY_CONDITIONS.partly_cloudy;
  if (!runtime) throw new Error('Sky conditions require the scene style runtime.');
  await runtime.setSkyPreset(SKY_PRESETS[condition.preset], { timeOfDay: condition.hour });
  const current = sky.toParams();
  document.body.dataset.toonlabSkyCondition = conditionId;
  document.body.dataset.toonlabCloudCoverage = String(current.cloud.shape.coverage);
}

function reloadWith(key, value) {
  const next = new URL(location.href);
  if (value === 'webgpu') next.searchParams.delete(key);
  else next.searchParams.set(key, value);
  location.href = next;
}

function bindReloadSelect(id, key, value) {
  const select = document.querySelector(id);
  select.value = value;
  select.addEventListener('change', () => reloadWith(key, select.value));
}

bindReloadSelect('#backend', 'renderer', backend);
bindReloadSelect('#quality', 'quality', quality);
bindReloadSelect('#character', 'character', characterFormat);
document.querySelector('#package').textContent = `@call-me-sensei/toonlab v${TOONLAB_VERSION}`;

const REVIEW_VIEWS = Object.freeze({
  overview: Object.freeze({ position: [0, 3.8, 11.5], target: [0, 1.7, -2.8] }),
  character: Object.freeze({ position: [-4.8, 2.75, 6.4], target: [0, 1.05, 1.5] }),
  ground: Object.freeze({ position: [-5.8, 3.1, 7.2], target: [-2.2, 0.15, -0.2] }),
  water: Object.freeze({ position: [0, 4.1, 1.8], target: [0, -0.05, -11.5] }),
  underwater: Object.freeze({ position: [16.2, -0.48, -11.5], target: [0, -0.48, -11.5] }),
  bench: Object.freeze({ position: [9.1, 3.2, 7.3], target: [5.1, 0.9, 3.1] }),
});

function terrainHeight(x, z) {
  const rolling = 0.14 * Math.sin(x * 0.32) * Math.cos(z * 0.29)
    + 0.035 * Math.sin((x + z) * 0.61);
  if (z >= -5.2) return rolling;
  if (z <= -8.2) return -1.15 + rolling * 0.12;
  const shore = THREE.MathUtils.smoothstep(z, -8.2, -5.2);
  return THREE.MathUtils.lerp(-1.15 + rolling * 0.12, rolling, shore);
}

const surface = createSceneSurfaceRuntime({
  bounds: { min: { x: -17, z: -16 }, max: { x: 17, z: 16 } },
  heightAt: terrainHeight,
  waterLevel: -0.02,
});

function createSourceTexture(draw) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  draw(context, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  return texture;
}

function createBenchSourceTextures() {
  const wood = createSourceTexture((context, width, height) => {
    context.fillStyle = '#9b633b';
    context.fillRect(0, 0, width, height);
    for (let y = 4; y < height; y += 9) {
      context.strokeStyle = y % 27 === 4 ? '#6e4027' : '#bb7d4c';
      context.lineWidth = y % 27 === 4 ? 2 : 1;
      context.beginPath();
      for (let x = 0; x <= width; x += 8) {
        const grainY = y + Math.sin(x * 0.075 + y * 0.11) * 2.2;
        if (x === 0) context.moveTo(x, grainY);
        else context.lineTo(x, grainY);
      }
      context.stroke();
    }
  });
  const metal = createSourceTexture((context, width, height) => {
    context.fillStyle = '#59636b';
    context.fillRect(0, 0, width, height);
    for (let index = 0; index < 180; index += 1) {
      const x = (index * 73) % width;
      const y = (index * 151) % height;
      const shade = 74 + (index % 4) * 11;
      context.fillStyle = `rgb(${shade} ${shade + 7} ${shade + 12})`;
      context.fillRect(x, y, 1 + (index % 3), 1);
    }
  });
  return { metal, wood };
}

function label(root, domain, targetId, materialAssignments = []) {
  const assignments = {};
  materialAssignments.forEach(({ id, material, roles }) => {
    material.userData ??= {};
    material.userData.toonlabMaterialId = id;
    assignments[id] = { roles };
  });
  labelStyleTarget(root, createStyleTargetLabel(domain, {
    ...(materialAssignments.length > 0 ? {
      materials: createStyleMaterialContract(domain, { assignments }),
    } : {}),
    targetId,
  }));
  return root;
}

function makeBench() {
  const root = new THREE.Group();
  root.name = 'Quaternius-style review bench';
  const textures = createBenchSourceTextures();
  const wood = new THREE.MeshStandardMaterial({ color: 0xffffff, map: textures.wood, roughness: 0.82 });
  const metal = new THREE.MeshStandardMaterial({ color: 0xffffff, map: textures.metal, metalness: 0.55, roughness: 0.48 });
  const add = (geometry, material, position, rotation = null) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    if (rotation) mesh.rotation.set(...rotation);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
  };
  add(new THREE.BoxGeometry(3.4, 0.18, 0.62), wood, [0, 1.05, 0]);
  add(new THREE.BoxGeometry(3.4, 0.18, 0.55), wood, [0, 1.75, 0.38], [-0.15, 0, 0]);
  for (const x of [-1.28, 1.28]) {
    add(new THREE.BoxGeometry(0.16, 1.15, 0.16), metal, [x, 0.52, 0]);
    add(new THREE.BoxGeometry(0.16, 1.35, 0.16), metal, [x, 1.18, 0.42], [-0.15, 0, 0]);
  }
  return label(root, 'manufactured.surface', 'review/bench', [
    { id: 'BenchWood', material: wood, roles: ['primaryMass'] },
    { id: 'BenchMetal', material: metal, roles: ['secondaryStructure'] },
  ]);
}

function makeGround() {
  const geometry = new THREE.PlaneGeometry(34, 32, 48, 48);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const z = position.getZ(index);
    position.setY(index, surface.heightAt(x, z));
  }
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ color: 0x77995a, roughness: 0.94 });
  const ground = new THREE.Mesh(geometry, material);
  ground.receiveShadow = true;
  return label(ground, 'terrain.ground', 'review/ground', [
    { id: 'GroundSurface', material, roles: ['ground'] },
  ]);
}

function makeRocks() {
  const root = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: 0x858b91, roughness: 0.9 });
  [
    [-6.2, -1.5, 1.8], [-4.2, -2.3, 1.2], [7.1, -2.7, 2.2],
  ].forEach(([x, z, scale], index) => {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 1), material);
    rock.name = `480-catalog review form ${index + 1}`;
    rock.scale.set(scale, scale * 0.72, scale * 1.15);
    rock.rotation.set(0.08 * index, 0.65 * index, -0.06 * index);
    rock.castShadow = true;
    rock.receiveShadow = true;
    root.add(rock);
    surface.place(rock, { anchor: 'bounds', x, z });
  });
  return label(root, 'natural.rock', 'review/rocks', [
    { id: 'RockSurface', material, roles: ['rock'] },
  ]);
}

async function main() {
  const renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL: backend === 'webgl' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setSize(innerWidth, innerHeight);
  document.querySelector('#scene').append(renderer.domElement);
  await renderer.init();

  const scene = new THREE.Scene();
  scene.background = null;
  const camera = new THREE.PerspectiveCamera(44, innerWidth / innerHeight, 0.1, 300);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minDistance = 4;
  controls.maxDistance = 34;
  controls.maxPolarAngle = Math.PI * 0.48;
  const applyReviewView = (viewId) => {
    const view = REVIEW_VIEWS[viewId] ?? REVIEW_VIEWS.overview;
    camera.position.set(...view.position);
    controls.target.set(...view.target);
    controls.update();
  };
  const view = document.querySelector('#view');
  view.addEventListener('change', () => applyReviewView(view.value));
  applyReviewView('overview');

  const assertReviewFraming = () => {
    const insideGround = Math.abs(camera.position.x) < 16.5
      && Math.abs(camera.position.z) < 15.5;
    const looksDown = controls.target.y < camera.position.y - 2;
    if (!insideGround || !looksDown) {
      throw new Error('Level D default review camera must begin above and inside the finite terrain footprint.');
    }
    document.body.dataset.toonlabFraming = 'pass';
  };
  assertReviewFraming();

  const ground = makeGround();
  scene.add(ground, makeRocks());

  // Register the finite water footprint before ToonLab scatters the meadow.
  // The surface runtime then excludes only submerged points inside this body,
  // rather than treating every low point in the world as water.
  const water = surface.createWaterSurface({
    depth: 15, maxSegments: quality === 'performance' ? 72 : 110,
    position: { x: 0, z: -13 },
    preset: 'anime', quality: quality === 'performance' ? 'low' : 'medium',
    segmentsPerMeter: quality === 'performance' ? 2 : 3, width: 34,
  });
  scene.add(water);

  const meadow = await surface.createGrassField({
    count: 1050,
    mask: (x, z) => !(x > 2.2 && x < 7.2 && z > 0.8),
    max: { x: 15, z: 7 },
    min: { x: -15, z: -9 },
    minSpacing: 0.36,
    quality,
    seed: 410,
    styleTarget: { targetId: 'review/meadow' },
  });
  scene.add(meadow);
  document.body.dataset.toonlabGrassTotalPlacements = String(meadow.placements.length);

  [
    [-9.5, 0.1, -3.5, 11, 0x69b95b],
    [9.6, 0.1, -4.8, 27, 0x8cbc50],
    [5.8, 0.1, 4.9, 43, 0x4d9b67],
  ].forEach(([x, y, z, seed, canopyColor], index) => {
    const tree = new StylizedTree({
      canopyColor, preset: 'call_me_sensei', seed, size: 2.25,
      styleTarget: { targetId: `review/tree-${index + 1}` },
    });
    surface.place(tree, { anchor: 'origin', x, z });
    tree.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = true;
      object.receiveShadow = true;
    });
    scene.add(tree);
  });

  const bench = makeBench();
  bench.rotation.y = -0.4;
  surface.place(bench, { anchor: 'bounds', x: 5.1, z: 3.1 });
  scene.add(bench);

  const sky = await createSkySystem({ camera, quality: quality === 'performance' ? 'low' : 'medium', renderer, scene });
  const runtime = createSceneStyleRuntime({ quality, renderer, scene, sky, timeOfDay: 11, water });

  const characterUrl = characterFormat === 'glb'
    ? TOONLAB_MANNEQUIN_ASSET_URL
    : `/characters/mannequin.${characterFormat}`;
  const character = await createCharacterRuntime({
    animation: { roles: ['idle', 'walk'] }, parent: scene, renderer,
    styleTarget: { targetId: 'review/character' }, toon: false, url: characterUrl,
  });
  surface.place(character.carrier, { anchor: 'origin', offset: 0.02, x: 0, z: 1.5 });
  character.carrier.rotation.y = Math.PI;
  character.actions?.walk?.play?.();

  await runtime.apply(CALL_ME_SENSEI_STYLE_BUNDLE, {
    discovery: 'scene-labels', mode: 'strict', watch: true,
  });
  await applySkyCondition(sky, runtime, 'partly_cloudy');
  if (params.get('shadowDebug') === '1') {
    const groundAdapter = ground.material.userData?.toonlabGroundShader;
    document.body.dataset.toonlabShadowDebugAdapter = groundAdapter ? 'found' : 'missing';
    groundAdapter?.setSceneState({ shadowDebug: true });
  }

  const domains = document.querySelector('#domains');
  runtime.inspector.subscribe((report) => {
    domains.replaceChildren(...report.domains.map((entry) => {
      const row = document.createElement('label');
      row.className = 'domain';
      const name = document.createElement('span');
      name.textContent = `${entry.domain} (${entry.targets.length})`;
      const toggle = document.createElement('input');
      toggle.type = 'checkbox';
      toggle.checked = entry.enabled;
      toggle.disabled = !entry.controllable;
      toggle.addEventListener('change', async () => {
        toggle.disabled = true;
        try { await runtime.inspector.setDomainEnabled(entry.domain, toggle.checked); }
        catch (error) { status.dataset.error = 'true'; status.textContent = error.stack ?? error.message; }
        finally { toggle.disabled = false; }
      });
      row.append(name, toggle);
      return row;
    }));
    document.body.dataset.toonlabTargetCount = String(report.targets.length);
  });

  const time = document.querySelector('#time');
  time.addEventListener('change', async () => {
    await applySkyCondition(sky, runtime, time.value);
    runtime.shadowPass?.invalidate();
  });

  status.textContent = `${backend} · ${quality} · ${character.format}/${character.rig?.type ?? 'unknown'} · validating frame and shadows`;
  document.body.dataset.toonlabReady = 'false';
  document.body.dataset.toonlabBackend = backend;
  document.body.dataset.toonlabQuality = quality;
  document.body.dataset.toonlabCharacterFormat = character.format;

  const timer = new THREE.Timer();
  timer.connect(document);
  let renderedFrames = 0;
  let ready = false;
  let shadowDepthInspectionStarted = false;
  renderer.setAnimationLoop(() => {
    timer.update();
    const delta = Math.min(timer.getDelta(), 0.05);
    controls.update();
    character.update(delta);
    meadow.update(delta, camera);
    sky.update(delta);
    water.update(renderer, scene, camera, delta);
    runtime.update(delta, camera);
    renderer.render(scene, camera);
    renderedFrames += 1;
    if (renderedFrames % 10 === 0) {
      const grassStats = meadow.cullingStats;
      document.body.dataset.toonlabGrassVisibleInstances = String(grassStats.visibleInstances);
      document.body.dataset.toonlabGrassDistanceCulledInstances = String(
        grassStats.distanceCulledInstances,
      );
      document.body.dataset.toonlabGrassFrustumCulledInstances = String(
        grassStats.culledInstances - grassStats.budgetCulledInstances,
      );
      document.body.dataset.toonlabGrassVisibleChunks = String(grassStats.visibleChunks);
    }
    if (ready || (renderedFrames % 10 !== 0 && renderedFrames !== 180)) return;
    const surfaceAudit = surface.audit({
      camera,
      requireShadowDomains: [
        'character',
        'manufactured.surface',
        'natural.rock',
        'vegetation.tree',
      ],
      styleRuntime: runtime,
    });
    document.body.dataset.toonlabSurfaceAudit = surfaceAudit.ok ? 'pass' : 'fail';
    document.body.dataset.toonlabSurfaceAuditIssues = surfaceAudit.issues.map(({ code }) => code).join(',');
    if (surfaceAudit.ok) {
      if (!shadowDepthInspectionStarted) {
        shadowDepthInspectionStarted = true;
        void runtime.shadowPass?.inspectDepthContent().then((report) => {
          document.body.dataset.toonlabShadowDepthSamples = `${report.writtenSampleCount}/${report.sampleCount}`;
        }).catch((error) => {
          document.body.dataset.toonlabShadowDepthSamples = `error:${error.message}`;
        });
      }
      ready = true;
      document.body.dataset.toonlabReady = 'true';
      status.textContent = `${backend} · ${quality} · ${character.format}/${character.rig?.type ?? 'unknown'} · surface aligned · textures preserved · shadows covered · ready`;
    } else if (renderedFrames === 180) {
      status.dataset.error = 'true';
      status.textContent = `Review scene blocked: ${surfaceAudit.issues.map(({ message }) => message).join(' ')}`;
    }
  });

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    sky.resize(innerWidth, innerHeight);
  });
  addEventListener('pagehide', () => timer.disconnect(), { once: true });
}

main().catch((error) => {
  console.error(error);
  status.dataset.error = 'true';
  status.textContent = error.stack ?? error.message;
  document.body.dataset.toonlabReady = 'false';
});
