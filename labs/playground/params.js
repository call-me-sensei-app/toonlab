// URL parameters and the tuning constants derived from them, shared by every
// playground module. Importing this module also runs the initial
// document.body.dataset instrumentation writes (load-bearing for tests).
import {
  CHARACTER_MODEL_OPTIONS,
  normalizeModelPath,
} from '../shared/sceneHub.js';
import { rootedAssetUrl } from '../shared/assetUrls.js';
import { takeLabHandoff } from '../shared/labHandoff.js';
import { createWaterSettings } from '@call-me-sensei/toonlab/water-settings';
import { waterStageOverrides } from '@call-me-sensei/toonlab/water';

// Default character: CC0 mannequin (Quaternius Universal Animation Library)
// with its own locomotion clips baked into the GLB, so a fresh checkout gets a
// moving character with no retargeting. `?model=` swaps in any other model.
// All asset URLs pass through rootedAssetUrl: this page is served from
// /playground/, so bare repo-root paths must not resolve page-relative.
const DEFAULT_MODEL_URL = '/characters/mannequin.glb';
const DEFAULT_IDLE_ANIMATION_URL = '/assets-local/animations/Idle.fbx';
const DEFAULT_WALKING_ANIMATION_URL = '/assets-local/animations/Walking.fbx';
const DEFAULT_JUMP_ANIMATION_URL = '/assets-local/animations/Jump.fbx';
const DEFAULT_RUNNING_ANIMATION_URL = '/assets-local/animations/Running.fbx';
const DEFAULT_SWIM_ANIMATION_URL = '/assets-local/animations/Swimming.fbx';
const DEFAULT_TREAD_ANIMATION_URL = '/assets-local/animations/Treading_Water.fbx';
const DEFAULT_DIVE_ANIMATION_URL = '/assets-local/animations/Swimming_To_Edge.fbx';
const DEFAULT_SIT_ANIMATION_URL = '/assets-local/animations/Sitting_Idle.fbx';
const URL_PARAMS = new URLSearchParams(window.location.search);
const GOLDEN_CAPTURE_ENABLED = URL_PARAMS.get('goldenCapture') === '1';
const MODEL_URL = rootedAssetUrl(URL_PARAMS.getAll('model')
  .find((url) => url && url.toLowerCase() !== 'none') || DEFAULT_MODEL_URL);
const SHADER_MODE = URL_PARAMS.get('shader') || 'anime';
const ECCTRL_MODE = URL_PARAMS.get('ecctrlMode') || null;
const SCENE_MODE = (URL_PARAMS.get('scene') || URL_PARAMS.get('controllerScene') || 'controller').toLowerCase();
const WATER_SCENE_ENABLED = SCENE_MODE === 'water';
// Indoor walkabout: the viewer's Liyue room, made walkable with trimesh
// colliders baked from the environment meshes.
const INDOOR_SCENE_ENABLED = SCENE_MODE === 'liyue' || SCENE_MODE === 'indoor';
const DEFAULT_INDOOR_ENVIRONMENT_URL = '/assets-local/environments/tests/indoor/Liyue/models/IndoorScene_Ly_Xyx2022.fbx';
const DEFAULT_INDOOR_BACKDROP_URL = '/assets-local/environments/tests/indoor/Liyue/backgrounds/background-afternoon.jpg';
const INDOOR_ENVIRONMENT_URL = (() => {
  const requested = URL_PARAMS.get('env');
  return rootedAssetUrl(requested && requested !== '1' ? requested : DEFAULT_INDOOR_ENVIRONMENT_URL);
})();
const INDOOR_BACKDROP_URL = (() => {
  const requested = URL_PARAMS.get('envBackdrop');
  if (requested === '0' || requested === 'none') return null;
  return rootedAssetUrl(requested && requested !== '1' ? requested : DEFAULT_INDOOR_BACKDROP_URL);
})();
// Largest room dimension in meters. The viewer stages the room at 7.2 for
// framed screenshots, but against a real 1.62 m character that leaves the
// furniture toy-sized. Calibrated against the Ming-style chairs: at 16.8 a
// chair back reaches ~1.1 m (character shoulder height), tables ~0.8 m.
const INDOOR_ENVIRONMENT_SIZE = Number(URL_PARAMS.get('envSize')) || 16.8;
// Room orientation in degrees. Applied BEFORE the collider bake (rotating a
// walkable room live would desync the physics trimesh), so the HUD slider
// reloads with ?roomYaw=.
const INDOOR_ROOM_YAW = Number(URL_PARAMS.get('roomYaw')) || 0;
const TARGET_MODEL_HEIGHT = Number(URL_PARAMS.get('modelHeight')) ||
  Number(URL_PARAMS.get('modelSize')) ||
  1.62;
const ENABLE_TOUCH_CONTROLS = URL_PARAMS.get('touch') === '1';
const REQUESTED_ANIMATION_MODE = (URL_PARAMS.get('anim') || URL_PARAMS.get('animation') || 'walking').toLowerCase();
const ENABLE_NATIVE_ANIMATION = REQUESTED_ANIMATION_MODE === 'native';
const ENABLE_IDLE_ANIMATION = ['idle', 'walk', 'walking', 'mixamo'].includes(REQUESTED_ANIMATION_MODE);
const ENABLE_WALKING_ANIMATION = ['walk', 'walking', 'mixamo'].includes(REQUESTED_ANIMATION_MODE);
const ENABLE_LOCOMOTION_ANIMATION = ENABLE_NATIVE_ANIMATION || ENABLE_WALKING_ANIMATION;
const ENABLE_JUMP_ANIMATION = ENABLE_LOCOMOTION_ANIMATION && URL_PARAMS.get('jumpAnim') !== 'none';
const ENABLE_RUNNING_ANIMATION = ENABLE_LOCOMOTION_ANIMATION && URL_PARAMS.get('runAnim') !== 'none';
const ENABLE_SWIM_ANIMATION = ENABLE_LOCOMOTION_ANIMATION && URL_PARAMS.get('swimAnim') !== 'none';
const IDLE_ANIMATION_URL = rootedAssetUrl(URL_PARAMS.get('idleAnim') || URL_PARAMS.get('idleAnimation') || DEFAULT_IDLE_ANIMATION_URL);
const WALKING_ANIMATION_URL = rootedAssetUrl(URL_PARAMS.get('walkAnim') || URL_PARAMS.get('walkingAnim') || DEFAULT_WALKING_ANIMATION_URL);
const JUMP_ANIMATION_URL = rootedAssetUrl((URL_PARAMS.get('jumpAnim') && URL_PARAMS.get('jumpAnim') !== 'none'
  ? URL_PARAMS.get('jumpAnim')
  : null) || DEFAULT_JUMP_ANIMATION_URL);
const RUNNING_ANIMATION_URL = rootedAssetUrl((URL_PARAMS.get('runAnim') && URL_PARAMS.get('runAnim') !== 'none'
  ? URL_PARAMS.get('runAnim')
  : null) || DEFAULT_RUNNING_ANIMATION_URL);
const ENABLE_ROOT_MOTION = URL_PARAMS.get('rootMotion') === '1';
const RETARGET_MODE = URL_PARAMS.get('retarget') || 'world';
// In the terrain sample the controller owns ground contact. Keep the idle
// motion above the hips so a weight-shift pose cannot lift both animated feet
// off an otherwise correctly sampled uneven surface.
const IDLE_BODY_MODE = URL_PARAMS.get('idleBody') || (WATER_SCENE_ENABLED ? 'upper' : 'full');
const WALKING_BODY_MODE = URL_PARAMS.get('walkBody') || 'full';
const JUMP_BODY_MODE = URL_PARAMS.get('jumpBody') || 'full';
const RUNNING_BODY_MODE = URL_PARAMS.get('runBody') || 'full';
// ecctrl maxVelLimit is 2.35 and sprintMult 1.55, but the physics body
// overshoots the walk cap (~2.6 measured on flat ground), so the
// must-be-sprinting fallback sits between real walk and sprint (~3.6) speeds.
const RUN_BLEND_MIN_SPEED = 3.1;
const SWIM_ANIMATION_URL = rootedAssetUrl((URL_PARAMS.get('swimAnim') && URL_PARAMS.get('swimAnim') !== 'none'
  ? URL_PARAMS.get('swimAnim')
  : null) || DEFAULT_SWIM_ANIMATION_URL);
const TREAD_ANIMATION_URL = rootedAssetUrl(URL_PARAMS.get('treadAnim') || DEFAULT_TREAD_ANIMATION_URL);
const DIVE_ANIMATION_URL = rootedAssetUrl(URL_PARAMS.get('diveAnim') || DEFAULT_DIVE_ANIMATION_URL);
const SIT_ANIMATION_URL = rootedAssetUrl(URL_PARAMS.get('sitAnim') || DEFAULT_SIT_ANIMATION_URL);
// How far the seated visual drops below the standing ground plane so the hips
// land on the seat surface: the sit clip holds hips at chair height (~0.44 of
// normalized model height) while the body capsule stands on the bench top.
// Tunable via ?sitDrop= while dialing in a new seat.
const SIT_VISUAL_DROP = optionalNumberParam('sitDrop') ?? 0.38;
// Swimming: the character switches from wading to swimming when the local
// water column passes SWIM_ENTER_DEPTH (with hysteresis on the way out), and
// by default floats at the wave surface. Holding the dive key swims down.
const SWIM_ENTER_DEPTH = 1.25;
const SWIM_EXIT_DEPTH = 1.02;
// How far below the wave surface the capsule center floats — one value for
// every model: the whole swim backend (kinematic vertical, enforce clamps,
// ecctrl ray geometry, wave-shell exposure) is tuned around it. Models that
// need to LOOK higher at the surface use swimVisualLift instead, which the
// physics never sees. ?swimSurfaceOffset= still overrides for tuning.
const SWIM_SURFACE_OFFSET = optionalNumberParam('swimSurfaceOffset') ?? 0.2;
// Per-model visual-only lift while swimming (blended with the swim state).
const SWIM_VISUAL_LIFT = optionalNumberParam('swimVisualLift')
  ?? CHARACTER_MODEL_OPTIONS.find((option) => normalizeModelPath(option.model) === normalizeModelPath(MODEL_URL))?.swimVisualLift
  ?? 0;
const SWIM_SPEED = 2.0;
const SWIM_SPRINT_SPEED = 3.0;
const SWIM_DIVE_SPEED = 1.7;
const SWIM_VERTICAL_SPEED = 1.7;
// RETIRED (kept at 0): shifting the swim visual back along the body centered
// the yaw pivot, but it also displaced the visible swimmer from the follow
// camera's anchor — the body sat off screen-center and swung when the
// container yawed. The facing gate (propulsion fades while the body points
// away from the steered direction) handles turns at near-zero speed instead,
// so the visual stays glued to the capsule axis.
const SWIM_VISUAL_PIVOT_SHIFT = 0;
// Seconds the surface stroke (and sprint crawl) holds after its input/speed
// conditions lapse — covers the input-cancel dip of a quick direction reversal.
const SWIM_STROKE_GRACE = 0.6;
const ANIMATION_REQUESTED = ENABLE_NATIVE_ANIMATION || ENABLE_IDLE_ANIMATION || ENABLE_WALKING_ANIMATION;
const ENABLE_POSE_DEBUG = URL_PARAMS.get('poseDebug') === '1';
const ARM_POSE_MODE = URL_PARAMS.get('armPose') || 'relaxed';
const RELAXED_ARM_Z_OFFSET = Number(URL_PARAMS.get('armRelax')) || 0.7;
const CAPSULE_HALF_HEIGHT = 0.54;
const CAPSULE_RADIUS = 0.28;
const FLOAT_HEIGHT = 0.18;
const BODY_CENTER_AT_REST = CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS + FLOAT_HEIGHT;
const WATER_SURFACE_SIZE_X = 220;
const WATER_SURFACE_SIZE_Z = 220;
const WATER_SURFACE_CENTER_Z = 95;
const SEA_BED_CENTER_Z = 90;

const keyboardMap = [
  { name: 'forward', keys: ['ArrowUp', 'KeyW'] },
  { name: 'backward', keys: ['ArrowDown', 'KeyS'] },
  { name: 'leftward', keys: ['ArrowLeft', 'KeyA'] },
  { name: 'rightward', keys: ['ArrowRight', 'KeyD'] },
  { name: 'jump', keys: ['Space'] },
  { name: 'run', keys: ['Shift'] },
];

function optionalNumberParam(name) {
  const value = URL_PARAMS.get(name);
  if (value === null || value === '') return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function createInitialWaterSettings() {
  // "Preview in scene" from the standalone Water Lab: the handoff carries a
  // full sanitized settings snapshot and wins over URL params for this boot.
  const handoff = takeLabHandoff('water-lab-preview');
  if (handoff?.settings) {
    return createWaterSettings({
      preset: handoff.preset ?? undefined,
      style: handoff.style ?? undefined,
      ...handoff.settings,
    });
  }
  const base = createWaterSettings({
    // The walkable sample is a shoreline lake, so its hidden water baseline
    // should be the package's gentle Calm preset rather than the balanced
    // swell used by the standalone Water Lab.
    mode: URL_PARAMS.get('waterMode') || URL_PARAMS.get('waterPreset') || 'calm',
    // Calm Lake keeps the package's normal connected swash. Setting
    // shorelineRunup to zero created a parallel path that did not match Water Lab.
    // Call Me Sensei's published water style owns the Anime color treatment.
    // The calm body preset still owns motion; style remains the orthogonal
    // rendition layer rather than another hand-tuned scene palette.
    style: URL_PARAMS.get('waterStyle') || 'call_me_sensei',
    colorTone: URL_PARAMS.get('waterTone') || undefined,
    flowSpeed: optionalNumberParam('waterFlowSpeed'),
    foamAmount: optionalNumberParam('waterFoam'),
    impulseStrength: optionalNumberParam('waterImpulse'),
    opacity: optionalNumberParam('waterOpacity'),
    quality: URL_PARAMS.get('waterQuality') || URL_PARAMS.get('quality') || undefined,
    reflectionStrength: optionalNumberParam('waterReflection'),
    rippleDamping: optionalNumberParam('waterDamping'),
    splashStrength: optionalNumberParam('waterSplash'),
    waterLevel: optionalNumberParam('waterLevel'),
    waveIntensity: optionalNumberParam('waterIntensity'),
    waveStrength: optionalNumberParam('waterWaveStrength'),
  });
  return createWaterSettings({
    ...base,
    ...waterStageOverrides('beach', base),
  });
}

const INITIAL_WATER_DEBUG_MODE = URL_PARAMS.get('waterDebug') || 'off';

// Absent renderer flag means native WebGPU. `renderer=webgl` keeps the TSL
// WebGL2 fallback available for compatibility captures.
const REQUESTED_RENDERER = (URL_PARAMS.get('renderer') || 'webgpu').toLowerCase();
const RENDERER_FALLBACK_NOTE = '';

document.body.dataset.controller = 'ecctrl';
document.body.dataset.goldenCapture = String(GOLDEN_CAPTURE_ENABLED);
document.body.dataset.scene = SCENE_MODE;
document.body.dataset.waterReady = WATER_SCENE_ENABLED ? 'false' : 'none';
document.body.dataset.modelReady = 'false';
document.body.dataset.environmentReady = 'none';
document.body.dataset.environmentBackdropReady = 'none';
document.body.dataset.environmentSunReady = 'none';
document.body.dataset.animationMode = ENABLE_NATIVE_ANIMATION
  ? 'native'
  : ENABLE_WALKING_ANIMATION
    ? 'walking'
    : ENABLE_IDLE_ANIMATION
      ? 'idle'
      : 'none';
document.body.dataset.animationReady = ANIMATION_REQUESTED ? 'false' : 'none';
document.body.dataset.animationPlayback = ANIMATION_REQUESTED ? 'on' : 'off';
document.body.dataset.idleAnimationWeight = '0';
document.body.dataset.walkingAnimationWeight = '0';

export {
  URL_PARAMS,
  GOLDEN_CAPTURE_ENABLED,
  MODEL_URL,
  SHADER_MODE,
  ECCTRL_MODE,
  SCENE_MODE,
  WATER_SCENE_ENABLED,
  INDOOR_SCENE_ENABLED,
  INDOOR_ENVIRONMENT_URL,
  INDOOR_BACKDROP_URL,
  INDOOR_ENVIRONMENT_SIZE,
  INDOOR_ROOM_YAW,
  TARGET_MODEL_HEIGHT,
  ENABLE_TOUCH_CONTROLS,
  REQUESTED_ANIMATION_MODE,
  ENABLE_NATIVE_ANIMATION,
  ENABLE_IDLE_ANIMATION,
  ENABLE_WALKING_ANIMATION,
  ENABLE_LOCOMOTION_ANIMATION,
  ENABLE_JUMP_ANIMATION,
  ENABLE_RUNNING_ANIMATION,
  ENABLE_SWIM_ANIMATION,
  IDLE_ANIMATION_URL,
  WALKING_ANIMATION_URL,
  JUMP_ANIMATION_URL,
  RUNNING_ANIMATION_URL,
  ENABLE_ROOT_MOTION,
  RETARGET_MODE,
  IDLE_BODY_MODE,
  WALKING_BODY_MODE,
  JUMP_BODY_MODE,
  RUNNING_BODY_MODE,
  RUN_BLEND_MIN_SPEED,
  SWIM_ANIMATION_URL,
  TREAD_ANIMATION_URL,
  DIVE_ANIMATION_URL,
  SIT_ANIMATION_URL,
  SIT_VISUAL_DROP,
  SWIM_ENTER_DEPTH,
  SWIM_EXIT_DEPTH,
  SWIM_SURFACE_OFFSET,
  SWIM_VISUAL_LIFT,
  SWIM_SPEED,
  SWIM_SPRINT_SPEED,
  SWIM_DIVE_SPEED,
  SWIM_VERTICAL_SPEED,
  SWIM_VISUAL_PIVOT_SHIFT,
  SWIM_STROKE_GRACE,
  ANIMATION_REQUESTED,
  ENABLE_POSE_DEBUG,
  ARM_POSE_MODE,
  RELAXED_ARM_Z_OFFSET,
  CAPSULE_HALF_HEIGHT,
  CAPSULE_RADIUS,
  FLOAT_HEIGHT,
  BODY_CENTER_AT_REST,
  WATER_SURFACE_SIZE_X,
  WATER_SURFACE_SIZE_Z,
  WATER_SURFACE_CENTER_Z,
  SEA_BED_CENTER_Z,
  keyboardMap,
  optionalNumberParam,
  createInitialWaterSettings,
  INITIAL_WATER_DEBUG_MODE,
  REQUESTED_RENDERER,
  RENDERER_FALLBACK_NOTE,
};
