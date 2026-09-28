import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  CALL_ME_SENSEI_STYLE_BUNDLE,
  TOONLAB_MANNEQUIN_ASSET_URL,
  TOONLAB_VERSION,
  createCharacterControllerProfile,
  createSceneSurfaceRuntime,
  createSceneStyleRuntime,
  createSkySystem,
  createStyleMaterialContract,
  createStyleTargetLabel,
  createWalkableCharacterRuntime,
  labelStyleTarget,
} from '@call-me-sensei/toonlab';
import {
  createOfficialCatalogAssetRuntime,
  normalizeOfficialCatalogAsset,
} from '@call-me-sensei/toonlab/official-catalog';
import { PRESETS as SKY_PRESETS } from '@call-me-sensei/toonlab/sky';
import { StylizedFlowerField, StylizedTree } from '@call-me-sensei/toonlab/vegetation';

const params = new URLSearchParams(location.search);
const backend = params.get('renderer') === 'webgl' ? 'webgl' : 'webgpu';
const quality = params.get('quality') === 'performance' ? 'performance' : 'balanced';
const characterFormat = ['vrm', 'fbx'].includes(params.get('character')) ? params.get('character') : 'glb';
const status = document.querySelector('#status');
const keys = new Set();
const qaKeys = new Set();

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

function pressed(code) {
  return keys.has(code) || qaKeys.has(code);
}

function reloadWith(key, value) {
  const next = new URL(location.href);
  if (value === 'webgpu' || value === 'balanced' || value === 'glb') next.searchParams.delete(key);
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

function label(root, domain, targetId, materialAssignments = [], { collision } = {}) {
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
    ...(collision ? { collision } : {}),
    targetId,
  }));
  return root;
}

function terrainHeight(x, z) {
  const rolling = 0.16 * Math.sin(x * 0.22) * Math.cos(z * 0.27)
    + 0.06 * Math.sin((x + z) * 0.48);
  const riverDistance = Math.abs(x - 9);
  const riverCut = riverDistance < 5 ? -1.72 * (1 - THREE.MathUtils.smoothstep(riverDistance, 2.9, 5)) : 0;
  return rolling + riverCut;
}

function walkableHeight(x, z) {
  if (x > 3.1 && x < 14.8 && Math.abs(z - 1.8) < 1.15) return 0.82;
  return terrainHeight(x, z);
}

const surface = createSceneSurfaceRuntime({
  bounds: { min: { x: -24, z: -19 }, max: { x: 24, z: 19 } },
  heightAt: terrainHeight,
  waterLevel: -0.08,
});

function makeGround() {
  const geometry = new THREE.PlaneGeometry(48, 38, 72, 57);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  for (let index = 0; index < position.count; index += 1) {
    position.setY(index, surface.heightAt(position.getX(index), position.getZ(index)));
  }
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ color: 0x789c56, roughness: 0.96 });
  const ground = new THREE.Mesh(geometry, material);
  ground.name = 'Meadow Crossing ground';
  ground.receiveShadow = true;
  return label(ground, 'terrain.ground', 'scene-two/ground', [
    { id: 'MeadowGround', material, roles: ['ground'] },
  ]);
}

const OFFICIAL_ROCK = Object.freeze({
  id: 'rock-0002',
  name: 'Rounded Boulder 4',
  recipeHash: 'b15fd710d3f6b2c5b6894461238be799178a2e81059db92488c4f16123988534',
  sha256: '467a05cc9d6858ec73740c49bdbbed59d64129ad3ac6e5972af5f5067f2d6f65',
});

function officialRockAsset() {
  return normalizeOfficialCatalogAsset({
    artifacts: [{
      contentType: 'model/gltf-binary',
      download: `/catalog/rocks/${OFFICIAL_ROCK.id}/rock.glb`,
      name: 'rock.glb',
      sha256: OFFICIAL_ROCK.sha256,
    }],
    id: OFFICIAL_ROCK.id,
    kind: 'model',
    metadata: { catalog: 'rocks' },
    name: OFFICIAL_ROCK.name,
    recipe: {
      kind: 'toonlab/rock-recipe',
      lod: { count: 1, distances: [0], ratios: [1], role: 'boulder' },
    },
    recipeHash: OFFICIAL_ROCK.recipeHash,
    revision: 2,
    source: 'toonlab-rock',
  }, {
    baseUrl: location.origin,
    expectedId: OFFICIAL_ROCK.id,
    expectedSource: 'toonlab-rock',
    provider: 'level-d-immutable-official-fixture',
  });
}

async function makeRockFormation(renderer) {
  const root = new THREE.Group();
  root.name = 'Meadow Crossing rock formation';
  const material = new THREE.MeshStandardMaterial({ color: 0x878b8f, roughness: 0.92 });
  const forms = [
    [-11.2, -6.1, 1.45, 1.0, 1.25, 0.9],
    [-15.1, -7.2, 1.35, 0.95, 1.4, 1.6], [16.7, -8.3, 2.0, 1.55, 1.4, 0.4],
    [18.9, -6.7, 1.55, 1.15, 1.55, 1.1], [15.0, -10.4, 1.3, 1.05, 1.25, 2.0],
  ];
  const officialAsset = officialRockAsset();
  const assetRuntime = createOfficialCatalogAssetRuntime({
    provider: { getAsset: () => officialAsset },
    renderer,
  });
  const officialHandle = await assetRuntime.acquireAsset(OFFICIAL_ROCK.id);
  const officialRock = officialHandle.root;
  officialRock.name = 'Official catalog rock-0002';
  const officialMaterials = [];
  officialRock.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    for (const current of Array.isArray(object.material) ? object.material : [object.material]) {
      if (current && !officialMaterials.includes(current)) officialMaterials.push(current);
    }
  });
  const officialSize = new THREE.Box3().setFromObject(officialRock).getSize(new THREE.Vector3());
  if (!(officialSize.x > 0)) throw new Error('Official rock-0002 has invalid bounds.');
  officialRock.scale.multiplyScalar(3.8 / officialSize.x);
  root.add(label(officialRock, 'natural.rock', 'scene-two/rock-1', officialMaterials.map((current, index) => ({
    id: `OfficialRockMaterial${String(index + 1).padStart(3, '0')}`,
    material: current,
    roles: ['rock'],
  }))));
  surface.place(officialRock, { anchor: 'bounds', preserveTextures: true, x: -13.4, z: -5.4 });
  document.body.dataset.toonlabCollisionOfficialRock = 'rock-0002';
  forms.forEach(([x, z, scale, yScale, zScale, rotation], index) => {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 2), material);
    rock.scale.set(scale, scale * yScale, scale * zScale);
    rock.rotation.set(0.08, rotation, -0.05);
    rock.castShadow = true;
    rock.receiveShadow = true;
    root.add(label(rock, 'natural.rock', `scene-two/rock-${index + 2}`, [
      { id: 'CrossingRock', material, roles: ['rock'] },
    ]));
    surface.place(rock, { anchor: 'bounds', x, z });
  });
  return { assetRuntime, root };
}

function createStripedTexture(colors, size = 32) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const color = new THREE.Color(colors[(y + Math.floor(Math.sin(x * 0.42) * 2) + colors.length) % colors.length]);
      const offset = (y * size + x) * 4;
      data[offset] = Math.round(color.r * 255);
      data[offset + 1] = Math.round(color.g * 255);
      data[offset + 2] = Math.round(color.b * 255);
      data[offset + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 3);
  texture.needsUpdate = true;
  return texture;
}

function makeBridge() {
  const root = new THREE.Group();
  root.name = 'Meadow Crossing bridge';
  const wood = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: createStripedTexture([0x744427, 0x9f6840, 0xc18450]),
    roughness: 0.84,
  });
  const rope = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: createStripedTexture([0x403228, 0x63503d]),
    roughness: 0.98,
  });
  const add = (geometry, material, position, rotation = null) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    if (rotation) mesh.rotation.set(...rotation);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
  };
  for (let x = -5.5; x <= 5.5; x += 0.62) {
    add(new THREE.BoxGeometry(0.55, 0.12, 2.2), wood, [x, 0.1, 0], [0, 0, 0.025 * Math.sin(x + 9)]);
  }
  for (const z of [-1.08, 1.08]) {
    add(new THREE.BoxGeometry(11.8, 0.09, 0.09), rope, [0, 0.63, z]);
    for (const x of [-5.5, -2.8, 0, 2.8, 5.5]) add(new THREE.BoxGeometry(0.1, 0.66, 0.1), wood, [x, 0.36, z]);
  }
  return label(root, 'manufactured.surface', 'scene-two/bridge', [
    { id: 'BridgeWood', material: wood, roles: ['primaryMass'] },
    { id: 'BridgeRope', material: rope, roles: ['secondaryStructure'] },
  ], { collision: 'none' });
}

async function loadBench() {
  const gltf = await new GLTFLoader().loadAsync(
    '/props/cc0/quaternius/fantasy-props-megakit/bench.glb',
  );
  const root = gltf.scene;
  root.name = 'Imported Quaternius Fantasy Props bench';
  const materials = [];
  let meshCount = 0;
  root.traverse((object) => {
    if (!object.isMesh) return;
    meshCount += 1;
    object.castShadow = true;
    object.receiveShadow = true;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (material && !materials.includes(material)) materials.push(material);
    }
  });
  const sourceBounds = new THREE.Box3().setFromObject(root);
  const sourceSize = sourceBounds.getSize(new THREE.Vector3());
  if (!(sourceSize.x > 0)) throw new Error('Imported bench has invalid bounds.');
  root.scale.multiplyScalar(3.5 / sourceSize.x);
  document.body.dataset.toonlabImportedBenchParts = String(meshCount);
  document.body.dataset.toonlabImportedBenchMaterials = String(materials.length);
  return label(root, 'manufactured.surface', 'scene-two/bench', materials.map((material, index) => ({
    id: `ImportedBenchMaterial${String(index + 1).padStart(3, '0')}`,
    material,
    roles: ['primaryMass'],
  })));
}

function meadowPlacements() {
  const placements = [];
  for (let z = -17; z <= 17; z += 0.69) {
    for (let x = -22; x <= 22; x += 0.69) {
      const jitter = Math.sin(x * 12.9898 + z * 78.233) * 0.25;
      const px = x + jitter;
      const pz = z - jitter * 0.42;
      const pathDistance = Math.abs(pz - (2.25 + 0.05 * px));
      if (Math.abs(px - 9) < 5.25) continue;
      if (px > -12 && px < 15 && pathDistance < 0.72) continue;
      if (px > -12 && px < 15 && pathDistance < 1.45
        && Math.sin(px * 91.17 + pz * 27.31) > (pathDistance - 0.72) / 0.73 * 2 - 1) continue;
      if ((px + 13.5) ** 2 + (pz + 6) ** 2 < 15) continue;
      if ((px - 17) ** 2 + (pz + 8) ** 2 < 18) continue;
      placements.push({ x: px, z: pz });
    }
  }
  return placements;
}

function createBody(position) {
  const state = {
    angularVelocity: { x: 0, y: 0, z: 0 }, gravity: 1,
    position: { ...position }, rotation: { w: 1, x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
  };
  return {
    userData: { canJump: true },
    angvel: () => ({ ...state.angularVelocity }),
    gravityScale: () => state.gravity,
    linvel: () => ({ ...state.velocity }),
    rotation: () => ({ ...state.rotation }),
    setAngvel: (value) => { state.angularVelocity = { ...value }; },
    setGravityScale: (value) => { state.gravity = value; },
    setLinvel: (value) => { state.velocity = { ...value }; },
    setRotation: (value) => { state.rotation = { ...value }; },
    setTranslation: (value) => { state.position = { ...value }; },
    translation: () => ({ ...state.position }),
  };
}

async function main() {
  const renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL: backend === 'webgl' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setSize(innerWidth, innerHeight);
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute('aria-label', 'Meadow Crossing viewport');
  renderer.domElement.addEventListener('pointerdown', () => renderer.domElement.focus());
  document.querySelector('#scene').append(renderer.domElement);
  await renderer.init();

  const scene = new THREE.Scene();
  scene.background = null;
  const camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.1, 320);
  camera.position.set(-11, 3.8, 9);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(-2, 1.25, 1.8);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.48;

  const ground = makeGround();
  const catalogRocks = await makeRockFormation(renderer);
  const rocks = catalogRocks.root;
  const bridge = makeBridge();
  const bench = await loadBench();
  // The bridge spans the real river bed. Its top matches the separate
  // walkable-height contract while the terrain and water remain continuous
  // underneath it.
  surface.place(bridge, {
    anchor: 'bounds',
    offset: walkableHeight(9, 1.8) - surface.heightAt(9, 1.8) - 0.13,
    x: 9,
    z: 1.8,
  });
  bench.rotation.y = 0.32;
  surface.place(bench, { anchor: 'bounds', preserveTextures: true, x: -2, z: 8 });
  scene.add(ground, rocks, bridge, bench);
  addEventListener('pagehide', () => { void catalogRocks.assetRuntime.dispose(); }, { once: true });

  const water = surface.createWaterSurface({
    depth: 120, maxSegments: quality === 'performance' ? 72 : 108,
    position: { x: 9, z: 0 },
    preset: 'anime', quality: quality === 'performance' ? 'low' : 'medium',
    segmentsPerMeter: quality === 'performance' ? 2 : 3, width: 10,
  });
  scene.add(water);

  const meadow = await surface.createGrassField({
    placements: meadowPlacements(), quality, seed: 812, styleTarget: { targetId: 'scene-two/meadow' },
  });
  scene.add(meadow);

  const flowers = new StylizedFlowerField({
    placements: [
      [-10, 4], [-8, 6], [-6, 1], [-4, 8], [-1, -5], [1, 5],
      [16, 5], [18, 8], [19, -2], [-18, 5], [-16, 7], [-12, 11],
    ].map(([x, z], index) => surface.groundPlacements([{
      headHeight: 0.44 + (index % 3) * 0.04,
      size: 0.06 + (index % 2) * 0.01,
      x, z,
    }])[0]),
    preset: 'call_me_sensei', seed: 812,
    styleTarget: { targetId: 'scene-two/flowers' },
  });
  scene.add(flowers);

  const treeData = [
    [-19, -11, 12, 0x66af5c], [-19, 12, 21, 0x85b851], [-7, -13, 30, 0x4f9d68],
    [-2, 16.5, 39, 0x73aa50], [18, 11, 48, 0x62ad67], [20, 1, 57, 0x8ab85a],
  ];
  treeData.forEach(([x, z, seed, canopyColor], index) => {
    const tree = new StylizedTree({
      canopyColor, preset: 'call_me_sensei', seed, size: 2.15,
      styleTarget: { targetId: `scene-two/tree-${index + 1}` },
    });
    surface.place(tree, { anchor: 'origin', x, z });
    scene.add(tree);
  });

  const sky = await createSkySystem({ camera, quality: quality === 'performance' ? 'low' : 'medium', renderer, scene });
  const styleRuntime = createSceneStyleRuntime({
    collisionHeightAt: walkableHeight,
    quality,
    renderer,
    scene,
    sky,
    timeOfDay: 11,
    water,
  });

  const profile = createCharacterControllerProfile();
  const spawn = { x: -8, y: walkableHeight(-8, 2.3) + profile.bodyCenterAtRest, z: 2.3 };
  const body = createBody(spawn);

  const characterUrl = characterFormat === 'glb' ? TOONLAB_MANNEQUIN_ASSET_URL : `/characters/mannequin.${characterFormat}`;
  const walkable = await createWalkableCharacterRuntime({
    camera, ground: walkableHeight, renderer, scene,
    character: {
      animation: { roles: ['idle', 'walk', 'run', 'jump', 'swim'] }, parent: scene, renderer,
      styleTarget: { targetId: 'scene-two/character' }, toon: false, url: characterUrl,
    },
  });

  await styleRuntime.apply(CALL_ME_SENSEI_STYLE_BUNDLE, {
    discovery: 'scene-labels', mode: 'strict', watch: true,
  });
  await applySkyCondition(sky, styleRuntime, 'partly_cloudy');

  const collisionRuntime = styleRuntime.collision;
  const collision = collisionRuntime.world;
  const collisionReport = collisionRuntime.assertReady();
  const solidTargets = collisionReport.targets.filter(({ kind }) => kind !== 'none');
  const solidTargetIds = new Set(solidTargets.map(({ targetId }) => targetId));
  const expectedSolidTargets = [
    'scene-two/tree-1',
    'scene-two/rock-1',
    'scene-two/bench',
  ];
  const probeCollision = (x, z) => {
    const position = { x, y: walkableHeight(x, z) + profile.bodyCenterAtRest, z };
    collision.resolve(position, profile.capsuleRadius);
    return Math.hypot(position.x - x, position.z - z) > 0.001;
  };
  document.body.dataset.toonlabCollisionTreeProbe = probeCollision(-19, -11) ? 'pass' : 'fail';
  document.body.dataset.toonlabCollisionRockProbe = probeCollision(-13.4, -5.4) ? 'pass' : 'fail';
  document.body.dataset.toonlabCollisionBenchProbe = probeCollision(-2, 8) ? 'pass' : 'fail';
  document.body.dataset.toonlabCollisionReady = collisionReport.ok
    && expectedSolidTargets.every((targetId) => solidTargetIds.has(targetId))
    ? 'true'
    : 'false';
  document.body.dataset.toonlabCollisionRegistered = String(collisionReport.stats.registered);
  document.body.dataset.toonlabCollisionSolidTargets = String(collisionReport.stats.solid);

  const autoCollisionBody = createBody({
    x: -2,
    y: walkableHeight(-2, 8) + profile.bodyCenterAtRest,
    z: 8,
  });
  const autoCollisionFrame = walkable.update({ body: autoCollisionBody }, 1 / 60);
  document.body.dataset.toonlabWalkableAutoCollision = autoCollisionFrame.collision.corrected
    ? 'pass'
    : 'fail';

  const domains = document.querySelector('#domains');
  styleRuntime.inspector.subscribe((report) => {
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
        try { await styleRuntime.inspector.setDomainEnabled(entry.domain, toggle.checked); }
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
    await applySkyCondition(sky, styleRuntime, time.value);
    styleRuntime.shadowPass?.invalidate();
  });

  addEventListener('keydown', (event) => {
    keys.add(event.code);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
  });
  addEventListener('keyup', (event) => keys.delete(event.code));

  document.body.dataset.toonlabReady = 'false';
  document.body.dataset.toonlabBackend = backend;
  document.body.dataset.toonlabQuality = quality;
  document.body.dataset.toonlabCharacterFormat = walkable.character.format;
  document.body.dataset.toonlabIndependentScene = 'true';
  document.body.dataset.toonlabCollisionBlockers = String(collision.circles.length);

  const waterQuery = {
    contains: (x, z) => Math.abs(x - 9) <= 5 && Math.abs(z) <= 60 && Math.abs(z - 1.8) >= 1.2,
    getFlowAt: () => ({ x: 0, z: -0.12 }),
    getHeightAt: (x, z) => water.getHeightAt(x, z),
    getLevel: () => water.position.y,
  };
  const timer = new THREE.Timer();
  timer.connect(document);
  const cameraForward = new THREE.Vector3();
  const cameraRight = new THREE.Vector3();
  const move = new THREE.Vector3();
  let jumpInFlight = false;
  let previousJumpInput = false;
  let elapsed = 0;
  let renderedFrames = 0;
  let ready = false;
  let shadowDepthInspectionStarted = false;

  renderer.setAnimationLoop(() => {
    timer.update();
    const delta = Math.min(timer.getDelta(), 0.05);
    elapsed += delta;
    if (params.get('qa') === 'movement') {
      if (elapsed > 0.6 && elapsed < 2) qaKeys.add('KeyW');
      else qaKeys.delete('KeyW');
      if (elapsed >= 2.2) document.body.dataset.toonlabMovementProbe = 'complete';
    }
    const position = body.translation();
    const velocity = body.linvel();
    camera.getWorldDirection(cameraForward);
    cameraForward.y = 0;
    cameraForward.normalize();
    cameraRight.crossVectors(cameraForward, camera.up).normalize();
    const forwardInput = Number(pressed('KeyW')) - Number(pressed('KeyS'));
    const sideInput = Number(pressed('KeyD')) - Number(pressed('KeyA'));
    move.copy(cameraForward).multiplyScalar(forwardInput).addScaledVector(cameraRight, sideInput);
    if (move.lengthSq() > 1) move.normalize();
    const sprinting = pressed('ShiftLeft') || pressed('ShiftRight');
    const jumpInput = pressed('Space');
    const jumpPressed = jumpInput && !previousJumpInput;
    previousJumpInput = jumpInput;
    const swimming = Boolean(walkable.frame?.water.active);
    const speed = sprinting ? 5.2 : 3.2;
    if (!swimming) {
      velocity.x = move.x * speed;
      velocity.z = move.z * speed;
      velocity.y -= 9.81 * body.gravityScale() * delta;
      const groundY = collision.groundHeight(position.x, position.z) + profile.bodyCenterAtRest;
      if (jumpPressed && body.userData.canJump) {
        velocity.y = 5.4;
        body.userData.canJump = false;
        jumpInFlight = true;
      }
      position.x += velocity.x * delta;
      position.y += velocity.y * delta;
      position.z += velocity.z * delta;
      const settledY = collision.groundHeight(position.x, position.z) + profile.bodyCenterAtRest;
      if (position.y <= settledY) {
        position.y = settledY;
        velocity.y = 0;
        body.userData.canJump = true;
        jumpInFlight = false;
      }
      body.setTranslation(position);
      body.setLinvel(velocity);
    }

    const facingYaw = move.lengthSq() > 0.001 ? Math.atan2(move.x, move.z) : walkable.character.carrier.rotation.y;
    const frame = walkable.update({
      body, facingYaw, jumpPressed, jumpReleased: jumpInFlight,
      move: { x: move.x, z: move.z }, moving: move.lengthSq() > 0.001,
      rising: jumpInput, sprinting, swimSprinting: sprinting, water: waterQuery,
    }, delta);
    walkable.enforce(body);
    const finalPosition = body.translation();
    walkable.character.carrier.position.set(
      finalPosition.x, finalPosition.y + profile.modelOffsetY, finalPosition.z,
    );
    if (move.lengthSq() > 0.001) walkable.character.carrier.rotation.y = facingYaw;

    const target = new THREE.Vector3(finalPosition.x, finalPosition.y + 0.45, finalPosition.z);
    controls.target.lerp(target, 1 - Math.exp(-6 * delta));
    controls.update();
    meadow.update(delta, camera);
    flowers.update(delta);
    sky.update(delta);
    water.update(renderer, scene, camera, delta);
    styleRuntime.update(delta, camera);
    renderer.render(scene, camera);
    renderedFrames += 1;
    document.body.dataset.toonlabCharacterPosition = [
      finalPosition.x, finalPosition.y, finalPosition.z,
    ].map((value) => value.toFixed(3)).join(',');
    document.body.dataset.toonlabLocomotionState = frame?.locomotion.state ?? 'unknown';
    document.body.dataset.toonlabWaterState = frame?.water.state ?? 'unknown';
    const casterCoverage = styleRuntime.shadowPass?.casterCoverage;
    const characterCoverage = casterCoverage?.byDomain?.character;
    const treeCoverage = casterCoverage?.byDomain?.['vegetation.tree'];
    document.body.dataset.toonlabShadowCharacterCoverage = `${characterCoverage?.coveredTargetIds.length ?? 0}/${characterCoverage?.eligibleTargetIds.length ?? 0}`;
    document.body.dataset.toonlabShadowTreeCoverage = `${treeCoverage?.coveredTargetIds.length ?? 0}/${treeCoverage?.eligibleTargetIds.length ?? 0}`;
    document.body.dataset.toonlabShadowUncoveredTargets = casterCoverage?.uncoveredTargetIds.join(',') ?? '';
    if (!ready && (renderedFrames % 10 === 0 || renderedFrames === 180)) {
      const surfaceAudit = surface.audit({
        camera,
        requireShadowDomains: [
          'character',
          'manufactured.surface',
          'natural.rock',
          'vegetation.tree',
        ],
        styleRuntime,
      });
      document.body.dataset.toonlabSurfaceAudit = surfaceAudit.ok ? 'pass' : 'fail';
      document.body.dataset.toonlabSurfaceAuditIssues = surfaceAudit.issues.map(({ code }) => code).join(',');
      const collisionReady = document.body.dataset.toonlabCollisionReady === 'true'
        && document.body.dataset.toonlabCollisionTreeProbe === 'pass'
        && document.body.dataset.toonlabCollisionRockProbe === 'pass'
        && document.body.dataset.toonlabCollisionBenchProbe === 'pass'
        && document.body.dataset.toonlabWalkableAutoCollision === 'pass';
      if (surfaceAudit.ok && collisionReady) {
        if (!shadowDepthInspectionStarted) {
          shadowDepthInspectionStarted = true;
          void styleRuntime.shadowPass?.inspectDepthContent().then((report) => {
            document.body.dataset.toonlabShadowDepthSamples = `${report.writtenSampleCount}/${report.sampleCount}`;
          }).catch((error) => {
            document.body.dataset.toonlabShadowDepthSamples = `error:${error.message}`;
          });
        }
        ready = true;
        document.body.dataset.toonlabReady = 'true';
      } else if (renderedFrames === 180) {
        status.dataset.error = 'true';
        status.textContent = `Review scene blocked: ${surfaceAudit.issues.map(({ message }) => message).join(' ')}`;
      }
    }
    if (ready) {
      status.textContent = `${backend} · ${quality} · ${walkable.character.format}/${walkable.character.rig?.type ?? 'unknown'}\n`
        + `${frame?.water.active ? 'swimming' : 'grounded'} · surface aligned · swash connected · shadows covered · ready`;
    }
  });

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    sky.resize(innerWidth, innerHeight);
  });
  addEventListener('pagehide', () => {
    timer.disconnect();
    walkable.dispose();
    styleRuntime.dispose();
  }, { once: true });
}

main().catch((error) => {
  console.error(error);
  status.dataset.error = 'true';
  status.textContent = error.stack ?? error.message;
  document.body.dataset.toonlabReady = 'false';
});
