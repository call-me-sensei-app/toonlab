// Toon Review — a dev probe for judging the character toon shader on real
// characters, one A/B split at a time.
//
//   ?model=/assets-local/models/yua/yua.glb      any loadable character
//   &view=full|face|head                          camera framing (head = aimed at
//                                                  the detected head)
//   &yaw=90                                       character turn in degrees
//   &a={"ramp":{...}}  &b={...}                  JSON toon settings; with both,
//                                                  left half = a, right half = b
//   &split=50                                     A/B split position (percent)
//   &debug=litAmount                              setToonDebugOutput mode
//   &preset=call_me_sensei                        toon preset for both halves
//   &light=az,el,intensity  &ambient=r,g,b        key light and flat ambient
//   &bg=1c2c5e  &floor=0                          background colour (hex); no floor
//   &pose=down                                    arms lowered (humanoid rig, or
//                                                  MMD / Mixamo-style bone names)
//   &env=call-me-sensei@18                        a lighting style's sun, sky probe
//                                                  and ambient at that hour, as the
//                                                  lighting system gives them (light=
//                                                  still sets the sun's direction)
//   &shade=1                                      an overhead slab casts the scene
//                                                  sun shadow over the character
//   &passes=0                                     skip character render passes
//   &facepush=0.02                                prepass face depth push (metres)
//   &post=showcase  &postp={"bloomStrength":0.4}  post pipeline preset (+ JSON
//                                                  parameter overrides), with the
//                                                  character mask wired; ignored
//                                                  in A/B splits
//
// window.__TOON_REVIEW exposes the runtimes for inspection.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { createCharacterRuntime } from '../../src/character/characterRuntime.js';
import { createEnvironmentSunShadowPass } from '../../src/environment/environmentSunShadowPass.js';
import {
  configureCallMeSenseiDirectionalLight,
  createCallMeSenseiSkyLightProbe,
  updateCallMeSenseiSkyLightProbe,
} from '../../src/lighting/callMeSenseiLightingContract.js';
import { resolveLightingStylePreset, sampleLightingStyle } from '../../src/lighting/lightingStyle.js';
import { createPostProcessingPipeline } from '../../src/post/postProcessing.js';
import { createCharacterRenderPasses } from '../../src/toon/characterRenderPasses.js';
import { findHeadBone } from '../../src/toon/headBone.js';
import { setToonDebugOutput } from '../../src/toon/toonMaterialAdapter.js';
import { createLabRenderer, whenRendererReady } from '../shared/rendererFactory.js';

const params = new URLSearchParams(location.search);
const modelUrl = params.get('model') || '/characters/mannequin.glb';
const view = (params.get('view') || 'full').toLowerCase();
const yaw = Number(params.get('yaw') || 0);
const preset = params.get('preset') || 'call_me_sensei';
const debugMode = params.get('debug') || 'off';
const usePasses = params.get('passes') !== '0';
const settingsA = parseSettings(params.get('a'));
const settingsB = parseSettings(params.get('b'));
const compare = Boolean(settingsA && settingsB);
const split = THREE.MathUtils.clamp(Number(params.get('split') || 50), 0, 100) / 100;
// capture=WxH renders the canvas alone at exactly that size (pixel ratio 1),
// without the HUD or reference image, for scripted captures.
const captureSize = params.get('capture')?.split('x').map(Number) ?? null;

const stage = document.getElementById('stage');
const status = document.getElementById('status');

function parseSettings(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (error) {
    console.error('Invalid settings JSON', text, error);
    return null;
  }
}

function numberList(text, fallback) {
  if (!text) return fallback;
  const values = text.split(',').map(Number);
  return fallback.map((value, index) => (Number.isFinite(values[index]) ? values[index] : value));
}

function createScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(`#${params.get('bg') ?? '9aa3ad'}`);
  const [azimuth, elevation, intensity] = numberList(params.get('light'), [35, 40, 1.6]);
  const envFrame = environmentFrame();
  if (envFrame) {
    const { frame, style } = envFrame;
    if (style.ambientLight.enabled) {
      scene.add(new THREE.AmbientLight(new THREE.Color(...style.ambientLight.color), style.ambientLight.intensity * frame.ambientScale));
    }
    const probe = createCallMeSenseiSkyLightProbe();
    updateCallMeSenseiSkyLightProbe(probe, { color: frame.skyProbeColor, energy: frame.skyProbeEnergy, intensity: style.skyProbe.intensity });
    scene.add(probe);
    if (!params.get('bg')) scene.background = new THREE.Color().setRGB(...frame.skyHorizonColor);
  } else {
    const ambient = numberList(params.get('ambient'), [0.42, 0.44, 0.5]);
    scene.add(new THREE.AmbientLight(new THREE.Color(...ambient), 1));
  }
  const key = new THREE.DirectionalLight('#fff4e6', intensity);
  if (envFrame) {
    key.color.setRGB(...envFrame.frame.sunColor);
    key.intensity = envFrame.frame.sunIntensity;
  }
  const az = THREE.MathUtils.degToRad(azimuth);
  const el = THREE.MathUtils.degToRad(elevation);
  key.position.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { bottom: -0.5, far: 12, left: -2, near: 0.1, right: 2, top: 2.5 });
  key.shadow.bias = -0.0003;
  scene.add(key);

  if (params.get('shade') === '1') {
    // A slab between the sun and the character: the environment sun-shadow
    // pass (the one scene shadows reach toon characters through) covers her.
    configureCallMeSenseiDirectionalLight(key);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(3, 0.05, 3), new THREE.MeshBasicMaterial({ color: '#444' }));
    slab.position.copy(key.position).normalize().multiplyScalar(2.6).add(new THREE.Vector3(0, 0.9, 0));
    slab.lookAt(slab.position.clone().add(key.position));
    slab.rotateX(Math.PI / 2);
    slab.castShadow = true;
    // Hidden from the view camera; the sun's shadow camera still draws it.
    slab.layers.set(2);
    key.shadow.camera.layers.enable(2);
    scene.add(slab);
  }
  if (params.get('floor') === '0') return scene;
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(3, 48),
    new THREE.MeshStandardMaterial({ color: '#7d858e', roughness: 0.9 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  return scene;
}

// env=<style>@<hour>: the lighting style frame the lighting system would apply.
function environmentFrame() {
  const value = params.get('env');
  if (!value) return null;
  const [id, hour] = value.split('@');
  const style = resolveLightingStylePreset(id);
  return { frame: sampleLightingStyle(style, Number(hour ?? 12)), style };
}

function createCamera() {
  const camera = new THREE.PerspectiveCamera(view === 'face' || view === 'head' ? 24 : 30, 1, 0.02, 40);
  if (view === 'face') {
    camera.position.set(0, 1.52, 1.25);
  } else {
    camera.position.set(0, 0.95, 4.2);
  }
  return camera;
}

// Frames the head found the same way face lighting finds it (head bone, else
// the automatic-roles head estimate), sized by the head's span to the top of
// the model so chibi and short characters frame like a normal face shot.
function aimAtHead(camera, controls, root) {
  root.updateMatrixWorld(true);
  const bone = findHeadBone(root);
  const estimate = root.userData?.toonHeadEstimate?.center;
  const head = bone
    ? bone.getWorldPosition(new THREE.Vector3())
    : estimate ? new THREE.Vector3().fromArray(estimate).applyMatrix4(root.matrixWorld) : null;
  if (!head) return;
  const top = new THREE.Box3().setFromObject(root).max.y;
  const span = Math.max(top - head.y, 0.12);
  const visibleHeight = span * 2;
  const distance = visibleHeight / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const targetY = head.y + span * 0.35;
  controls.target.set(head.x, targetY, head.z);
  camera.position.set(head.x, targetY, head.z + distance);
  controls.update();
}

// Upper and lower arm bones by name, for rigs without a humanoid map: MMD
// (左腕 / 左ひじ, with twist bones in between) and Mixamo-style names.
const UPPER_ARM_NAME = /^[左右]腕$|upper_?arm|^(mixamorig:)?(left|right)arm$/i;
const LOWER_ARM_NAME = /^[左右]ひじ$|lower_?arm|fore_?arm|elbow/i;

function armBonesByName(root) {
  const arms = [];
  root.traverse((object) => {
    if (!object.isBone || !UPPER_ARM_NAME.test(object.name)) return;
    let lower = null;
    object.traverse((child) => {
      if (!lower && child !== object && LOWER_ARM_NAME.test(child.name)) lower = child;
    });
    if (lower) arms.push({ lower, upper: object });
  });
  return arms;
}

// Rotates each upper arm so the arm hangs at (0.3·x, -0.95, 0).
function lowerArms(runtime, { byName = false } = {}) {
  const humanoid = runtime.asset?.vrm?.humanoid;
  if (!humanoid && !byName) return;
  const arms = humanoid
    ? ['left', 'right'].map((side) => ({
      lower: humanoid.getRawBoneNode(`${side}LowerArm`),
      upper: humanoid.getRawBoneNode(`${side}UpperArm`),
    }))
    : armBonesByName(runtime.modelRoot);
  runtime.modelRoot.updateMatrixWorld(true);
  for (const { lower, upper } of arms) {
    if (!upper || !lower) continue;
    const upperPosition = upper.getWorldPosition(new THREE.Vector3());
    const direction = lower.getWorldPosition(new THREE.Vector3()).sub(upperPosition).normalize();
    const desired = new THREE.Vector3(direction.x * 0.3, -0.95, 0).normalize();
    const worldTurn = new THREE.Quaternion().setFromUnitVectors(direction, desired);
    const parentWorld = upper.parent.getWorldQuaternion(new THREE.Quaternion());
    const upperWorld = upper.getWorldQuaternion(new THREE.Quaternion());
    upper.quaternion.copy(parentWorld.invert().multiply(worldTurn.multiply(upperWorld)));
    upper.updateMatrixWorld(true);
  }
}

async function createHalf(renderer, camera, settings) {
  const scene = createScene();
  const facePush = params.get('facepush');
  const passes = usePasses ? createCharacterRenderPasses({ camera, renderer, scene, ...(facePush !== null ? { faceDepthPush: Number(facePush) } : {}) }) : null;
  const toon = { preset, ...(settings ?? {}) };
  const runtime = await createCharacterRuntime({
    animation: false,
    onStage: async ({ detail, stage: stageName }) => {
      status.textContent = `loading… ${stageName} @ ${Math.round(performance.now())}ms`;
    },
    parent: scene,
    renderer,
    renderPasses: passes,
    targetHeight: 1.7,
    toon,
    url: modelUrl,
  });
  if (params.get('pose') === 'down') lowerArms(runtime, { byName: true });
  runtime.carrier.rotation.y = THREE.MathUtils.degToRad(yaw);
  runtime.carrier.updateMatrixWorld(true);
  if (debugMode !== 'off') setToonDebugOutput(runtime.modelRoot, debugMode);
  return { passes, runtime, scene, settings: toon };
}

async function main() {
  const renderer = createLabRenderer({ antialias: true, alpha: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  await whenRendererReady(renderer);

  const camera = createCamera();
  stage.append(renderer.domElement);

  if (captureSize) status.style.display = 'none';

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, view === 'face' ? 1.5 : 0.9, 0);
  controls.update();

  const halves = [await createHalf(renderer, camera, compare ? settingsA : settingsA ?? settingsB)];
  if (compare) halves.push(await createHalf(renderer, camera, settingsB));
  if (view === 'head') aimAtHead(camera, controls, halves[0].runtime.modelRoot);

  const resize = () => {
    let pixelRatio = Math.min(devicePixelRatio, 2);
    let width = stage.clientWidth;
    let height = stage.clientHeight;
    if (captureSize) {
      [width, height] = captureSize;
      pixelRatio = 1;
    }
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height);
    if (camera.isPerspectiveCamera) {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
    for (const half of halves) half.passes?.setSize(width, height, pixelRatio);
  };
  addEventListener('resize', resize);
  resize();

  const postPreset = compare ? null : params.get('post');
  const post = postPreset
    ? createPostProcessingPipeline({
      camera,
      renderer,
      scene: halves[0].scene,
      settings: { parameters: parseSettings(params.get('postp')) ?? {}, preset: postPreset },
    })
    : null;
  if (post) {
    halves[0].passes?.setCharacterMaskEnabled(true);
    const sizePost = () => post.setSize(renderer.domElement.width / renderer.getPixelRatio(), renderer.domElement.height / renderer.getPixelRatio(), renderer.getPixelRatio());
    sizePost();
    addEventListener('resize', sizePost);
  }

  const sunShadowPasses = params.get('shade') === '1'
    ? halves.map((half) => createEnvironmentSunShadowPass({ renderer, scene: half.scene }))
    : [];
  const renderHalf = (half) => {
    sunShadowPasses[halves.indexOf(half)]?.update({ camera });
    half.passes?.update();
    if (post) {
      post.setCharacterMask(half.passes?.characterMaskTexture ?? null);
      post.render();
    } else {
      renderer.render(half.scene, camera);
    }
  };

  const frame = () => {
    const width = renderer.domElement.width;
    const height = renderer.domElement.height;
    renderer.setScissorTest(false);
    renderHalf(halves[halves.length - 1]);
    if (compare) {
      const splitPixels = Math.round(width * split);
      renderer.setScissorTest(true);
      renderer.setScissor(0, 0, splitPixels / renderer.getPixelRatio(), height / renderer.getPixelRatio());
      renderHalf(halves[0]);
      renderer.setScissorTest(false);
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  const summary = halves[0].runtime.toonState?.materialRoleSummary ?? {};
  status.textContent = [
    `model ${modelUrl}`,
    `view ${view}  yaw ${yaw}  preset ${preset}  debug ${debugMode}`,
    compare ? `left: ${JSON.stringify(settingsA)}\nright: ${JSON.stringify(settingsB)}` : '',
    `roles ${JSON.stringify(summary.counts ?? {})}`,
    ...(halves[0].runtime.toonState?.report ?? [])
      .filter((entry) => entry.level === 'warn' || entry.code.startsWith('auto-roles'))
      .map((entry) => `${entry.level}: ${entry.message}`),
  ].filter(Boolean).join('\n');
  // Ready once a few frames have presented (render passes need one frame).
  let framesUntilReady = 4;
  const markReady = () => {
    framesUntilReady -= 1;
    if (framesUntilReady > 0) requestAnimationFrame(markReady);
    else document.body.dataset.ready = 'true';
  };
  requestAnimationFrame(markReady);
  window.__TOON_REVIEW = {
    camera,
    controls,
    halves,
    renderer,
    setDebug(mode) {
      for (const half of halves) setToonDebugOutput(half.runtime.modelRoot, mode);
      return mode;
    },
  };
}

main().catch((error) => {
  console.error(error);
  status.textContent = `error: ${error?.message ?? error}`;
  document.body.dataset.ready = 'error';
});
