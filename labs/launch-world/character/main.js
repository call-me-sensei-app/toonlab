// Yua — §5 character review lab.
//
// This is the evidence rig for the launch character contract: one load, both
// looks, the real ToonLab lighting/sky/post stack the launch scene uses, the
// Stillwater Garden stone path under her feet, and the close framings §5 names
// (face, hair edge, lashes, outerwear, shoes, contact shadow).
//
// It renders the §11 wipe the way §11 demands it — one skeleton, one mixer, one
// set of geometry buffers, one camera, one light rig, one exposure, two scissored
// draws that differ only by which material set is bound.
//
//   /labs/launch-world/character/?shot=face&ground=stones&clip=walk&split=50
//
// Query: shot, ground (studio|stones|garden), clip (idle|walk|run), split (0-100),
//        hud (0|1), compare (0|1).

import * as THREE from 'three/webgpu';

import {
  CALL_ME_SENSEI_STYLE_BUNDLE,
  createSceneStyleRuntime,
  createSkySystem,
} from '@call-me-sensei/toonlab';
import {
  createGroundShaderMesh,
  createGroundShaderSettings,
  setGroundShaderSceneState,
} from '@call-me-sensei/toonlab/ground-shader';
import { createPostProcessingPipeline } from '@call-me-sensei/toonlab/post';
import { PRESETS as SKY_PRESETS } from '@call-me-sensei/toonlab/sky';

import { HUMANOID_ROLES, MIXAMO_BONE_BY_ROLE } from '../../../src/character/characterRig.js';
import { createCharacterRenderPasses } from '../../../src/toon/characterRenderPasses.js';
import { createLabRenderer, whenRendererReady } from '../../shared/rendererFactory.js';
import { createYuaCharacter } from './yuaCharacter.js';

/** The launch world's agreed hour: 8.5 resolves to a 42.0deg sun (§6.5). */
const TIME_OF_DAY = 8.5;
/**
 * D19-043: the lighting system rewrites `renderer.toneMappingExposure` from the
 * bundle's day curve every frame, so neither documented knob works. The scene-local
 * workaround is to write it back AFTER `runtime.update`, which is what the render
 * loop below does. Both wipe halves are drawn inside one frame with no exposure
 * change between them, so §11's "same exposure" holds by construction, not by luck.
 */
const EXPOSURE = 0.52;
const POST_EXPOSURE = 0.6;

const params = new URLSearchParams(location.search);
const stage = document.getElementById('stage');
const loadingDetail = document.getElementById('loadingDetail');
const report = document.getElementById('report');
const splitInput = document.getElementById('split');
const divider = document.getElementById('divider');

/**
 * §5's inspection list, as framings. Each is expressed in Yua's OWN frame
 * (metres, +Z is her forward, +Y up) so the same shot list works at both hero
 * marks and at any facing.
 */
const SHOTS = Object.freeze({
  // §11 S02 — locked three-quarter, the wipe shot.
  'three-quarter': { lens: 50, position: [1.75, 1.28, 2.45], target: [0, 1.02, 0] },
  front: { lens: 50, position: [0, 1.25, 3.1], target: [0, 1.0, 0] },
  side: { lens: 50, position: [3.0, 1.25, 0.15], target: [0, 1.0, 0] },
  // §11 S03 — face/hair/clothing close-up. Distances are derived, not guessed:
  // at lens L the vertical FOV of a 36 mm frame cropped to 16:9 is
  // 2*atan(tan(atan(18/L))/(16/9)), so the framed height at distance d is
  // 2*d*tan(fov/2) — 0.308*d at 70 mm, 0.253*d at 85 mm. A head-and-shoulders
  // read wants ~0.45 m of subject height, which is 1.45 m at 70 mm. Placing
  // these by eye put the camera inside the hair.
  face: { lens: 70, position: [0.55, 1.62, 1.42], target: [0, 1.585, 0.06] },
  // Hair edge + lash read: three-quarter rear so the silhouette edge and the
  // lash overhang are both against the sky rather than against skin.
  hair: { lens: 85, position: [-0.78, 1.72, 0.92], target: [0, 1.6, -0.03] },
  lashes: { lens: 85, position: [0.34, 1.635, 1.16], target: [0.02, 1.6, 0.06] },
  outerwear: { lens: 85, position: [1.45, 1.26, 2.02], target: [0.02, 1.16, 0] },
  shoes: { lens: 85, position: [0.78, 0.44, 1.46], target: [0, 0.08, 0] },
  // Grazing, near ground level: the only framing where a floating contact or a
  // missing contact shadow cannot hide.
  contact: { lens: 85, position: [1.02, 0.17, 1.55], target: [0, 0.04, 0] },
});

/**
 * FILL-YUA-01 — stepping-stone ground profile.
 *
 * Stillwater Garden puts Yua on an irregular stone path read at 70-85 mm with her
 * feet in frame, which is a far harder grounding case than any plane. The garden
 * owner has not landed the path geometry yet, so this reproduces its defining
 * property deterministically: flat stone tops at genuinely different heights,
 * separated by lower gravel, laid along the walk direction.
 *
 * It exists so per-foot contact can be *proved* before the real path arrives,
 * and it is replaced by the garden's own height field the moment that module
 * exists (see the `garden` ground below). Registered in
 * `docs/capability-status.md`.
 */
function steppingStoneHeight(x, z) {
  const GRAVEL = -0.06;
  const stones = [
    { h: 0.115, r: 0.42, x: 0, z: -1.7 },
    { h: 0.085, r: 0.40, x: 0.34, z: -0.85 },
    { h: 0.140, r: 0.45, x: -0.16, z: 0 },
    { h: 0.095, r: 0.41, x: 0.30, z: 0.82 },
    { h: 0.125, r: 0.44, x: -0.05, z: 1.68 },
    { h: 0.105, r: 0.43, x: 0.38, z: 2.55 },
  ];
  let height = GRAVEL + 0.012 * Math.sin(x * 5.7) * Math.cos(z * 6.3);
  for (const stone of stones) {
    const distance = Math.hypot(x - stone.x, z - stone.z);
    if (distance > stone.r) continue;
    // Flat top with a short chamfer at the rim, not a dome: a stone you can
    // stand on. `smoothstep` needs min < max — passing them reversed silently
    // returns 0 everywhere and flattens the whole path.
    const chamfer = 1 - THREE.MathUtils.smoothstep(distance, stone.r - 0.07, stone.r);
    height = Math.max(height, stone.h * chamfer);
  }
  return height;
}

/**
 * Stillwater Garden's height field, when the garden owner has published one.
 * Falls back to the stepping-stone profile so this rig never depends on another
 * workstream's in-flight module — the city scene 500'd mid-standdown and took
 * every lab that imported it down with it.
 */
async function resolveGardenHeight() {
  try {
    // Built from a variable and @vite-ignore'd on purpose: a literal specifier
    // is statically resolved at transform time, so a module that does not exist
    // yet is a hard 500 on this lab rather than a caught miss at runtime.
    const specifier = '../garden/terrain.js';
    const module = await import(/* @vite-ignore */ specifier);
    const heightAt = module.gardenHeight ?? module.heightAt ?? module.pathHeight;
    if (typeof heightAt === 'function') return { heightAt, source: 'garden' };
  } catch {
    // Not published yet.
  }
  return { heightAt: steppingStoneHeight, source: 'filler:stepping-stones' };
}

const garden = await resolveGardenHeight();

const GROUNDS = Object.freeze({
  // Yua on the stone path, facing back down it toward the gate and the camera
  // approach (SOUTH), which is the §2 near-play-space read.
  garden: { heightAt: garden.heightAt, mark: { bearing: 190, x: 0, z: 0 } },
  stones: { heightAt: steppingStoneHeight, mark: { bearing: 190, x: -0.16, z: 0 } },
  studio: { heightAt: () => 0, mark: { bearing: 202.5, x: 0, z: 0 } },
});

const shotId = SHOTS[params.get('shot')] ? params.get('shot') : 'three-quarter';
const groundId = GROUNDS[params.get('ground')] ? params.get('ground') : 'studio';
const clipId = ['idle', 'walk', 'run'].includes(params.get('clip')) ? params.get('clip') : 'idle';
const compareEnabled = params.get('compare') !== '0';
document.body.dataset.compare = String(compareEnabled);
document.body.dataset.hud = String(params.get('hud') !== '0');

/**
 * Lens -> vertical FOV for a 36 mm-wide frame cropped to 16:9. Same helper the
 * launch scenes use; `camera.fov` is vertical, so passing millimetres is wrong
 * by over ten degrees.
 */
function fovForLens(mm, aspect) {
  const horizontal = 2 * Math.atan(18 / mm);
  return (2 * Math.atan(Math.tan(horizontal / 2) / aspect)) * (180 / Math.PI);
}

/**
 * The review plate. Displaced by the active height field, so a character is only
 * ever proven grounded against the ground she will actually stand on.
 *
 * The tessellation is load-bearing at close range: a 0.42 m stepping stone needs
 * quads well under 5 cm or its edge becomes a staircase and the contact read is
 * measuring the plate, not the character. The stone grounds therefore use a small
 * dense plate; a flat studio plate can be large and coarse for free.
 */
function buildGroundGeometry(heightAt, center, { segments = 220, size = 90 } = {}) {
  const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index) + center.x;
    const z = position.getZ(index) + center.z;
    position.setY(index, heightAt(x, z));
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Four fixed splat roles (R grass, G dirt, B rock, A sand). Paving-dominant. */
function buildGroundField(resolution = 64) {
  const splat = new Uint8Array(resolution * resolution * 4);
  for (let index = 0; index < resolution * resolution; index += 1) {
    splat[index * 4 + 1] = 255;
  }
  return { splat, splatD: resolution, splatW: resolution };
}

const renderer = createLabRenderer({ antialias: true });
stage.prepend(renderer.domElement);
await whenRendererReady(renderer);

const scene = new THREE.Scene();
scene.background = null;
const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.02, 900);

loadingDetail.textContent = 'Laying the review plate…';
const ground = GROUNDS[groundId];
const groundMesh = createGroundShaderMesh({
  field: buildGroundField(),
  geometry: buildGroundGeometry(
    ground.heightAt,
    ground.mark,
    groundId === 'studio' ? { segments: 220, size: 90 } : { segments: 560, size: 14 },
  ),
  name: 'Yua review · ground',
  settings: createGroundShaderSettings({ preset: 'call_me_sensei', projection: { rockScale: 2.1 } }),
  styleTarget: { targetId: 'character-review/ground' },
});
groundMesh.position.set(ground.mark.x, 0, ground.mark.z);
groundMesh.receiveShadow = true;
scene.add(groundMesh);

loadingDetail.textContent = 'Building the sky…';
const sky = await createSkySystem({
  camera,
  godRays: true,
  quality: 'high',
  renderer,
  scene,
  timeOfDay: { autoAdvanceSecondsPerDay: 0, latitude: 38, time: TIME_OF_DAY / 24 },
});

const post = createPostProcessingPipeline({
  camera,
  renderer,
  scene,
  settings: { preset: 'call_me_sensei' },
});

const styleRuntime = createSceneStyleRuntime({
  collisionHeightAt: ground.heightAt,
  post,
  quality: 'balanced',
  renderer,
  rendererConfiguration: {
    toneMapping: THREE.ACESFilmicToneMapping,
    toneMappingExposure: 1.02,
  },
  scene,
  sky,
  timeOfDay: TIME_OF_DAY,
});

loadingDetail.textContent = 'Applying the Call Me Sensei bundle…';
// D19-087: `watch: true` re-discovers scene labels when objects are added, and
// `createCharacterRuntime` labels its carrier `toonlab/character`. So a character
// created after the bundle is applied gets the toon domain applied to it a SECOND
// time, on top of materials that are already toon NodeMaterials — 26 outline
// children for 13 meshes, and a re-derived material that has lost the source
// alpha cutoff (0.5 -> 0.35) and the base map. The character owns its own toon
// conversion through `createCharacterRuntime`; the bundle must not re-do it.
await styleRuntime.apply(CALL_ME_SENSEI_STYLE_BUNDLE, {
  discovery: 'scene-labels',
  mode: 'strict',
  watch: false,
});
await styleRuntime.setSkyPreset(SKY_PRESETS.partlyCloudy, { timeOfDay: TIME_OF_DAY });
post.setSettings({
  features: { bloom: true },
  parameters: {
    bloomRadius: 0.09,
    bloomStrength: 0.1,
    bloomThreshold: 0.94,
    exposure: POST_EXPOSURE,
  },
  preset: 'call_me_sensei',
});

const lightingFrame = styleRuntime.lighting?.frame ?? null;
setGroundShaderSceneState(groundMesh, {
  waterLevel: -60,
  ...(lightingFrame?.sunDirection ? { sunDirection: lightingFrame.sunDirection } : {}),
});

// The depth prepass and the character shadow map. Without them the depth rim
// falls back to the view-angle rim, and neither the character's own shadow nor
// the screen-space hair shadow (§5's contact shadow) exists — both are read out
// of these targets, not out of the scene's sun shadow map.
const renderPasses = createCharacterRenderPasses({ camera, renderer, scene });
if (renderPasses.characterMaskTexture) post.setCharacterMask(renderPasses.characterMaskTexture);

const yua = await createYuaCharacter({
  heightAt: ground.heightAt,
  onProgress: (message) => { loadingDetail.textContent = message; },
  parent: scene,
  renderPasses,
  renderer,
});
const placement = yua.placeAt(ground.mark);

let sun = null;
scene.traverse((object) => { if (object.isDirectionalLight && object.shadow) sun = object; });
if (sun) {
  // Character-scale cascade: this plate is metres across, so the shipped
  // contract's cascade numbers are right and only the map size is raised.
  // D19-041 (no cast shadows at launch-world scale) is a large-world failure;
  // whether it also bites here is exactly what the `contact` framing measures.
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.normalBias = 0.02;
  sun.shadow.bias = -0.0004;
}

function applyShot(id) {
  const shot = SHOTS[id] ?? SHOTS['three-quarter'];
  const aspect = camera.aspect || 16 / 9;
  camera.fov = fovForLens(shot.lens, aspect);
  camera.position.set(...shot.position).applyMatrix4(yua.carrier.matrixWorld);
  const target = new THREE.Vector3(...shot.target).applyMatrix4(yua.carrier.matrixWorld);
  camera.lookAt(target);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}

function applyClip(id) {
  yua.setLocomotion({ idle: id === 'idle' ? 1 : 0, run: id === 'run' ? 1 : 0, walk: id === 'walk' ? 1 : 0 });
}

applyClip(clipId);

function resize() {
  const width = Math.max(1, stage.clientWidth);
  const height = Math.max(1, stage.clientHeight);
  const pixelRatio = Math.min(devicePixelRatio, 2);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  applyShot(document.getElementById('shot').value || shotId);
  sky.resize?.(width, height);
  post.setSize(width, height, pixelRatio);
}

/**
 * §11's wipe. Both halves are the same draw of the same scene one frame apart in
 * nothing at all: the mixer is not advanced between them, the camera is not
 * touched, the lights are not touched, the exposure is not touched. Only
 * `mesh.material` changes.
 */
function renderComparison() {
  const width = renderer.domElement.width;
  const height = renderer.domElement.height;
  const fraction = compareEnabled ? THREE.MathUtils.clamp(Number(splitInput.value) / 100, 0, 1) : 0;
  divider.style.left = `${fraction * 100}%`;

  yua.setMaterialMode('toon');
  renderPasses.update();
  renderer.setScissorTest(false);
  post.render();

  if (fraction > 0) {
    yua.setMaterialMode('neutral');
    renderer.setScissorTest(true);
    renderer.setScissor(0, 0, Math.round(width * fraction), height);
    post.render();
    renderer.setScissorTest(false);
    yua.setMaterialMode('toon');
  }
}

// --- HUD ------------------------------------------------------------------
function fillSelect(id, values, active, onChange) {
  const element = document.getElementById(id);
  element.innerHTML = values.map((value) => `<option value="${value}">${value}</option>`).join('');
  element.value = active;
  element.addEventListener('change', () => onChange(element.value));
  return element;
}

fillSelect('shot', Object.keys(SHOTS), shotId, applyShot);
fillSelect('clip', ['idle', 'walk', 'run'], clipId, applyClip);
fillSelect('ground', Object.keys(GROUNDS), groundId, (value) => {
  const next = new URL(location.href);
  next.searchParams.set('ground', value);
  location.href = next;
});
splitInput.value = params.get('split') ?? '50';

resize();
addEventListener('resize', resize);

// --- Evidence -------------------------------------------------------------
const grounding = yua.groundReport();
// Unique morph names on drawn meshes only — outline and fur shells clone the
// geometry, so counting every dictionary triples the real figure.
const morphs = new Set();
const skinnedMeshes = new Set();
yua.runtime.modelRoot.traverse((object) => {
  if (object?.userData?.isToonOutline || object?.userData?.isToonFurShell) return;
  if (object?.isSkinnedMesh) skinnedMeshes.add(object.name);
  if (object?.morphTargetDictionary) for (const name of Object.keys(object.morphTargetDictionary)) morphs.add(name);
});
// `resolveCharacterRig` returns name maps, not a bone list. `targetToMixamo` is
// the authoritative record of how many humanoid roles actually resolved.
const mappedBones = yua.runtime.rig?.targetToMixamo ?? new Map();
const mappedNames = [...mappedBones.values()];
const fingerBones = mappedNames.filter((name) => /Hand(Thumb|Index|Middle|Ring|Pinky)\d$/.test(name));
const evidence = {
  animationSource: yua.runtime.animationSource,
  boundMaterialMasks: yua.boundMaterialMasks,
  clips: Object.fromEntries(Object.entries(yua.runtime.clips ?? {})
    .map(([role, clip]) => [role, Number(clip.duration.toFixed(3))])),
  contactErrorMm: Number((grounding.contactError * 1000).toFixed(2)),
  // Per-foot, because a single body-origin sample cannot detect one foot in the
  // air and the other inside a stepping stone. Positive = floating.
  feetClearanceMm: Object.fromEntries(Object.entries(grounding.feet).map(([side, foot]) => [
    side,
    Number((foot.clearance * 1000).toFixed(2)),
  ])),
  feetSupportY: Object.fromEntries(Object.entries(grounding.feet).map(([side, foot]) => [
    side,
    Number(foot.support.toFixed(4)),
  ])),
  convertedMeshCount: yua.runtime.toonState?.convertedMeshCount ?? 0,
  fittedHeight: Number((yua.runtime.bounds?.max.y - yua.runtime.bounds?.min.y).toFixed(5)),
  footOffset: {
    x: Number(yua.footOffset.x.toFixed(4)),
    y: Number(yua.footOffset.y.toFixed(4)),
    z: Number(yua.footOffset.z.toFixed(4)),
  },
  ground: groundId,
  groundY: Number(grounding.groundY.toFixed(4)),
  markErrorMm: Number((grounding.markError * 1000).toFixed(2)),
  materialRoles: yua.runtime.toonState?.materialRoleSummary?.counts ?? {},
  mixamoFingerBones: fingerBones.length,
  mixamoMappedBones: mappedBones.size,
  missingHumanoidRoles: HUMANOID_ROLES
    .filter((role) => !mappedNames.includes(MIXAMO_BONE_BY_ROLE[role])),
  morphTargetCount: morphs.size,
  neutralMaterialCount: yua.runtime.neutralSourceMaterialCount,
  rigType: yua.runtime.rig?.type ?? 'unknown',
  skinnedMeshCount: skinnedMeshes.size,
  toonPreset: yua.runtime.toonState?.toonPreset ?? 'none',
  yaw: Number(placement.yaw.toFixed(4)),
};
report.textContent = JSON.stringify(evidence, null, 1);

const timer = new THREE.Timer();
timer.connect(document);
let frames = 0;
renderer.setAnimationLoop(() => {
  timer.update();
  const delta = Math.min(timer.getDelta(), 0.05);
  yua.update(delta);
  sky.update(delta);
  styleRuntime.update(delta, camera);
  // After the lighting frame, never before — the lighting system owns
  // `renderer.toneMappingExposure` and rewrites it every frame (D19-043).
  renderer.toneMappingExposure = EXPOSURE;
  renderComparison();
  frames += 1;
  // Captures gate on the frame counter, not on first paint: the sky march, the
  // cloud deck and the post pipeline all need time to reach the steady state a
  // review frame is supposed to show.
  document.body.dataset.yuaFrames = String(frames);
  if (frames === 4) {
    document.body.dataset.yuaEvidence = JSON.stringify(evidence);
    document.body.dataset.ready = 'true';
  }
});

globalThis.__TOONLAB_YUA_REVIEW = { camera, evidence, renderer, scene, styleRuntime, yua };
