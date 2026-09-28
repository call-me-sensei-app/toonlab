// §11 signature product moment — the single-load neutral↔ToonLab wipe.
//
//   /labs/launch-world/wipe/?shot=S02        locked 50 mm Yua three-quarter
//   /labs/launch-world/wipe/?shot=S07        locked 50 mm whole-scene
//   /labs/launch-world/wipe/?split=50&hud=0  capture framing
//   /labs/launch-world/wipe/?verify=1        run the pixel-identity proof on load
//
// Automation contract (capture scripts assert these, do not rename):
//   document.body.dataset.wipeReady    — 'true' once both variants are captured
//   document.body.dataset.wipeReport   — JSON: subjects, variants, structural audit
//   document.body.dataset.shotReport   — JSON: lens, fov, motion-blur policy
//   document.body.dataset.wipeVerify   — JSON: pixel-identity proof result
//   globalThis.__TOONLAB_LAUNCH_WIPE   — { verify(), wipe, rig, comparison }

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { createCharacterRenderPasses } from '../../../src/toon/characterRenderPasses.js';
import { registerNeutralStylePresets } from '../../../src/styles/neutralStylePresets.js';
import { createYuaCharacter } from '../character/yuaCharacter.js';
import { createLabRenderer, whenRendererReady } from '../../shared/rendererFactory.js';
import { createGroundWipeSubject, groundHeightAt } from './groundSubject.js';
import {
  createLaunchShotRig,
  createLaunchStyleWipe,
  mountWipeDivider,
  resolveLaunchShot,
  solveDistanceForSubjectBand,
} from './index.js';

registerNeutralStylePresets();

const params = new URLSearchParams(location.search);
const shotId = (params.get('shot') || 'S02').toUpperCase();
const modelUrl = params.get('model') || '/assets-local/models/yua/yua.glb';
const initialSplit = params.has('split') ? Number(params.get('split')) / 100 : 0.5;
const wantsVerification = params.get('verify') === '1';
document.body.dataset.hud = String(params.get('hud') !== '0');

const stage = document.getElementById('stage');
const loadingDetail = document.getElementById('loadingDetail');
const shotLabel = document.getElementById('shotLabel');
const lensLabel = document.getElementById('lensLabel');
const progress = (text) => { loadingDetail.textContent = text; };

const renderer = createLabRenderer({ alpha: false, antialias: params.get('aa') !== '0' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
// §11: exposure is STABLE and shared by both halves. It is set once here and
// never touched again — not per shot, not per frame, not per variant.
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = params.get('shadows') !== '0';
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#8fcfe8');
const camera = new THREE.PerspectiveCamera(35, 16 / 9, 0.05, 500);
const rig = createLaunchShotRig({ camera });

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 0.8;
controls.maxDistance = 60;
controls.maxPolarAngle = Math.PI * 0.49;

// One light rig, shared by both halves. Nothing below is per-variant.
const sun = new THREE.DirectionalLight('#fff2d6', 2.8);
sun.position.set(-14, 20, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -24;
sun.shadow.camera.right = 24;
sun.shadow.camera.top = 24;
sun.shadow.camera.bottom = -24;
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 90;
sun.shadow.bias = -0.0002;
sun.shadow.normalBias = 0.03;
scene.add(sun);
scene.add(new THREE.HemisphereLight('#e6f6ff', '#6f8a72', 1.05));

await whenRendererReady(renderer);

progress('Building the ground…');
const ground = createGroundWipeSubject();
scene.add(ground.root);

progress('Loading Yua once…');
// SINGLE LOAD, owned by the §5 character module. `createYuaCharacter` builds
// BOTH material sets over the same meshes and exposes `setMaterialMode`, which
// rebinds mesh.material, the matching onBeforeRender, the outline/fur children
// and the depth-prepass binding. It starts in `neutral` here so the comparison
// can snapshot the baseline before the ToonLab set is ever mounted. Material
// modes keep both halves live, which is what lets `activate()` flip between
// them per frame.
//
// The character render passes are required, not optional: the character's own
// shadow map (`shadows.character`) is what casts the fringe onto the forehead,
// and the screen-space hair shadow (`shadows.hairOnFace`) and the depth rim
// read the depth prepass. With no passes registered the shader draws neither
// character shadow and falls back to the view-angle rim — no fringe shadow in
// the one shot the whole launch video is built around. The §5 character lab
// (`labs/launch-world/character/main.js`) runs the same passes.
//
// Safe for the §11 identity proof: `update()` is called ONCE per frame in the
// animation loop, before the composite, and never between the composite's two
// `renderer.render` calls. Both halves therefore read the same pass targets in
// the same state, which is exactly the invariant the proof asserts.
const renderPasses = createCharacterRenderPasses({ camera, renderer, scene });

const character = await createYuaCharacter({
  heightAt: groundHeightAt,
  materialMode: 'neutral',
  onProgress: progress,
  parent: scene,
  renderPasses,
  renderer,
});

const shot = resolveLaunchShot(shotId);

// The §10.2-style mark travels with the shot data, so the garden scene and this
// harness place her from one source. `placeAt` takes a COMPASS BEARING and
// grounds per foot against the height field — never set carrier.position.
const mark = shot.subjectMark ?? { bearingDeg: 337.5, position: [0, 0, 0] };
character.placeAt({ bearing: mark.bearingDeg ?? 337.5, x: mark.position[0], z: mark.position[2] });
character.setLocomotion({ idle: 1 });

const subjects = [
  {
    // The wipe's whole contract in one line: flip the live material set on a
    // model that was loaded once.
    applyStyle: () => ({ materialMode: character.setMaterialMode('toon') }),
    id: 'yua',
    mixer: character.runtime.mixer,
    root: character.carrier,
  },
];
// S02 is the character wipe; S07 is the whole-scene conversion, so the ground
// joins the comparison there.
if (shot.subject === 'scene') subjects.push(ground);

const wipe = await createLaunchStyleWipe({
  axis: shot.ab || 'vertical',
  camera,
  onProgress: progress,
  renderer,
  scene,
  split: Number.isFinite(initialSplit) ? initialSplit : 0.5,
  subjects,
});

// The ground is always in the frame; when it is not a comparison subject it
// simply renders styled in both halves, which is the honest reading of "only
// the intended treatment differs".
if (shot.subject !== 'scene') ground.applyStyle();

rig.setShot(shot.id);
const divider = mountWipeDivider(stage, wipe);

// Yua's facing, as a unit heading. Compass bearing to world direction with
// -Z as north and +X as east — the same convention `bearingToYaw` uses.
const FACING_BEARING_DEG = mark.bearingDeg ?? 337.5;
const facing = new THREE.Vector3(
  Math.sin(THREE.MathUtils.degToRad(FACING_BEARING_DEG)),
  0,
  -Math.cos(THREE.MathUtils.degToRad(FACING_BEARING_DEG)),
);

function frameShot() {
  const feet = character.groundReport?.feet
    ? new THREE.Vector3(...character.groundReport.feet)
    : character.carrier.position.clone();
  if (shot.subject === 'scene') {
    // S07: the whole-scene wipe. Locked 50 mm pulled back far enough that
    // terrain, ground and character all flip inside one frame — at 22.9 deg
    // vertical, a wide read costs distance rather than a wider lens.
    // 8 m subject band -> 19.8 m at 50 mm, which `assertShotFitsFootprint`
    // confirms is inside the garden's 28.3 m interior reach. A 12 m band would
    // need 29.6 m and does not exist in this scene.
    const band = 8;
    const distance = solveDistanceForSubjectBand(band, camera.fov);
    const back = facing.clone().multiplyScalar(-1);
    camera.position.copy(feet).addScaledVector(back, distance * 0.86)
      .add(new THREE.Vector3(distance * 0.34, distance * 0.4, 0));
    controls.target.set(feet.x, feet.y + band * 0.16, feet.z - 4);
  } else {
    // S02: locked 50 mm THREE-QUARTER — a view angle, not a shot length. The
    // camera stands in FRONT of her and 35 deg off her facing, so the frame
    // reads face + near shoulder. Distance is solved from the lens rather than
    // guessed: at 22.9 deg vertical a 1.6 m tall subject band needs
    // 1.6 / (2*tan(fov/2)) metres, which is what keeps her head inside frame
    // when the aspect changes.
    const offset = facing.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(35));
    const distance = solveDistanceForSubjectBand(1.62, camera.fov);
    camera.position.copy(feet).addScaledVector(offset, distance).add(new THREE.Vector3(0, 1.24, 0));
    controls.target.set(feet.x, feet.y + 0.98, feet.z);
  }
  controls.update();
}
frameShot();

function resize() {
  const width = Math.max(1, stage.clientWidth);
  const height = Math.max(1, stage.clientHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(width, height, false);
  // The depth prepass target is a screen-space buffer; a resize that only
  // touched the canvas would leave the contact shadow sampling a stale
  // resolution and drifting off the silhouette.
  renderPasses.setSize(width, height);
  // Re-derive the lens: fov follows focal length AND aspect, so a resize that
  // only touched camera.aspect would silently change the lens.
  rig.setAspect(width / height);
  // The lens just changed, so the solved distance changed with it.
  frameShot();
  divider.paint();
}
resize();
addEventListener('resize', resize);

shotLabel.textContent = `${shot.id} · ${shot.label}`;
lensLabel.textContent = `${shot.lensMm} mm · ${camera.fov.toFixed(2)}° V · motion blur ${rig.policy.motionBlur ? 'on' : 'OFF'}`;

const report = wipe.report();
document.body.dataset.wipeReport = JSON.stringify({
  identity: {
    issues: report.identity.issues,
    ok: report.identity.ok,
    sharedGeometryNodes: report.identity.sharedGeometryNodes,
    trackedNodes: report.identity.trackedNodes,
    trackedRoots: report.identity.trackedRoots,
    variantsWithDivergentMaterials: report.identity.variantsWithDivergentMaterials,
  },
  subjects: report.subjects,
  variants: report.variants,
});
document.body.dataset.shotReport = JSON.stringify(rig.describe());
document.body.dataset.characterAnimationSource = character.runtime.animationSource;
document.body.dataset.characterMaterialMode = character.materialMode;
document.body.dataset.wipeReady = 'true';
loadingDetail.textContent = 'Ready';

let verifying = false;
async function verify(options) {
  if (verifying) return null;
  verifying = true;
  document.body.dataset.wipeVerifying = 'true';
  try {
    const result = await wipe.verify(options);
    document.body.dataset.wipeVerify = JSON.stringify({
      checks: result.checks.map((check) => ({
        changedPixels: check.changedPixels,
        description: check.description,
        differences: check.differences,
        differingPixels: check.differingPixels,
        id: check.id,
        maxChannelDelta: check.maxChannelDelta,
        ok: check.ok,
        totalPixels: check.totalPixels,
        treatedPixels: check.treatedPixels,
      })),
      ok: result.ok,
      resolution: result.resolution,
      variants: result.variants,
    });
    return result;
  } finally {
    verifying = false;
    document.body.dataset.wipeVerifying = 'false';
  }
}

globalThis.__TOONLAB_LAUNCH_WIPE = {
  camera, character, comparison: wipe.comparison, ground, renderer, rig, scene, verify, wipe,
};

document.getElementById('verifyButton')?.addEventListener('click', () => { verify(); });

const timer = new THREE.Timer();
timer.connect(document);
renderer.setAnimationLoop(() => {
  if (verifying) return;
  timer.update();
  const delta = Math.min(timer.getDelta(), 0.05);
  // ONE clock advance per frame, BEFORE the composite render. Both scissored
  // renders therefore see the identical skeleton pose — the property two
  // separately loaded models can never provide.
  character.update(delta);
  controls.update();
  // ONE pass update per frame, also BEFORE the composite. The prepass and the
  // character shadow map are inputs to both halves, so they are refreshed here
  // and then held frozen across the two scissored renders.
  renderPasses.update();
  wipe.render();
});

if (wantsVerification) await verify();

addEventListener('pagehide', () => {
  timer.disconnect();
  wipe.dispose();
  character.dispose();
  renderPasses.dispose();
  ground.dispose();
}, { once: true });
