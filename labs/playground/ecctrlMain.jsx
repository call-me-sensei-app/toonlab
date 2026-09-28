import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { KeyboardControls, MapControls } from '@react-three/drei';
import {
  CuboidCollider,
  Physics,
  RigidBody,
  TrimeshCollider,
} from '@react-three/rapier';
import Ecctrl, { EcctrlJoystick } from 'ecctrl';

import {
  registerModelTextureAssetPaths,
} from '@call-me-sensei/toonlab/loaders';
import { NIGHT_SKY_DEFAULT_RADIUS } from '@call-me-sensei/toonlab/sky';
import { createSceneStyleRuntime } from '@call-me-sensei/toonlab/styles';
import {
  createWaterSettings,
  rebaseWaterSettingsStyle,
} from '@call-me-sensei/toonlab/water-settings';
import { createLabRenderer, whenRendererReady } from '../shared/rendererFactory.js';
import { installGoldenSceneCapture } from '../shared/goldenSceneCapture.js';
import { LOCAL_CHARACTER_ASSET_MANIFEST } from '../shared/localModelCatalog.js';
import { updateAnimationToggle, updateModeLabel } from './hud.js';
import { WALKABLE_QUALITY_ID } from './quality.js';
import { ShowcaseCharacter } from './ShowcaseCharacter.jsx';
import {
  ENABLE_TOUCH_CONTROLS,
  GOLDEN_CAPTURE_ENABLED,
  INDOOR_SCENE_ENABLED,
  INITIAL_WATER_DEBUG_MODE,
  RENDERER_FALLBACK_NOTE,
  WATER_SCENE_ENABLED,
  createInitialWaterSettings,
} from './params.js';
import {
  INITIAL_WATER_ENVIRONMENT,
  WATER_ENVIRONMENT_PRESETS,
} from './scenes/stage.js';
import {
  WalkableSampleHud,
} from './scenes/waterScenes.jsx';
import { resolveShowcaseScene } from './scenes/showcases/sceneRegistry.js';

registerModelTextureAssetPaths(LOCAL_CHARACTER_ASSET_MANIFEST.texturePaths);

// Ecctrl's float spring settles about 0.04 m below its requested rest height under
// gravity (measured at rest on flat ground), so every scene lifts the visual
// group by the same amount — without it characters stand heel-deep in the
// floor.
const FLOAT_SPRING_SAG = 0.04;

function CallMeSenseiSceneLook({ onInspectorReady, sky, timeOfDay, water }) {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const runtime = useMemo(() => createSceneStyleRuntime({
    quality: WALKABLE_QUALITY_ID,
    renderer: gl,
    scene,
    timeOfDay,
  }), [gl, scene]);

  useEffect(() => {
    onInspectorReady?.(runtime.inspector);
    return () => onInspectorReady?.(null);
  }, [onInspectorReady, runtime]);

  useEffect(() => {
    let cancelled = false;
    document.body.dataset.sceneLook = 'loading';
    runtime.apply('call-me-sensei', {
      discovery: 'scene-labels',
      mode: 'advisory',
      watch: true,
    }).then(() => {
      if (cancelled) return;
      document.body.dataset.sceneLook = 'call-me-sensei';
      document.body.dataset.sceneLightingContract = 'call-me-sensei-reference';
      document.body.dataset.rendererConfigured = 'true';
      document.body.dataset.rendererConfigurationBackend = runtime.rendererConfiguration?.backend ?? 'none';
      document.body.dataset.sceneQuality = runtime.quality.id;
    }).catch((error) => {
      if (cancelled) return;
      document.body.dataset.sceneLook = 'error';
      console.error('Call Me Sensei scene look failed to apply:', error);
    });
    return () => {
      cancelled = true;
      void runtime.dispose().catch((error) => {
        console.error('Call Me Sensei scene look failed to dispose cleanly:', error);
      });
    };
  }, [runtime]);

  useEffect(() => {
    if (!sky || !water) return undefined;
    let cancelled = false;
    runtime.setSystems({ sky, water }).catch((error) => {
      if (cancelled) return;
      document.body.dataset.sceneLook = 'error';
      console.error('Call Me Sensei scene systems failed to bind:', error);
    });
    return () => { cancelled = true; };
  }, [runtime, sky, water]);

  useEffect(() => {
    runtime.setTimeOfDay(timeOfDay);
  }, [runtime, timeOfDay]);

  useFrame((_, delta) => {
    const schedulerFrame = runtime.update(delta, camera);
    document.body.dataset.sceneUpdateOrder = schedulerFrame.completedTaskIds.join('>');
    const pass = runtime.groundFieldPass;
    document.body.dataset.groundFieldReady = String(pass?.ready === true);
    document.body.dataset.groundFieldWriters = String(pass?.writerCount ?? 0);
    const sun = runtime.lighting.manager.group.children.find((child) => child.isDirectionalLight);
    document.body.dataset.shadowPassReady = String(Boolean(runtime.shadowPass?.shadowTexture));
    document.body.dataset.shadowSunReady = String(Boolean(sun?.castShadow));
    document.body.dataset.shadowCameraExtent = sun?.shadow?.camera
      ? String(sun.shadow.camera.right - sun.shadow.camera.left)
      : '0';
    const casterCoverage = runtime.shadowPass?.casterCoverage;
    document.body.dataset.shadowCasterTargets = String(casterCoverage?.eligibleTargetIds.length ?? 0);
    document.body.dataset.shadowCoveredTargets = String(casterCoverage?.coveredTargetIds.length ?? 0);
    document.body.dataset.shadowUncoveredTargets = casterCoverage?.uncoveredTargetIds.join(',') ?? '';
    const treeCasterCoverage = casterCoverage?.byDomain?.['vegetation.tree'];
    document.body.dataset.shadowTreeCasterTargets = String(treeCasterCoverage?.eligibleTargetIds.length ?? 0);
    document.body.dataset.shadowTreeCoveredTargets = String(treeCasterCoverage?.coveredTargetIds.length ?? 0);
    document.body.dataset.shadowTreeUncoveredTargets = treeCasterCoverage?.uncoveredTargetIds.join(',') ?? '';
  }, -90);
  return null;
}

// Frame stats overlay. WebGPU keeps renderer.info counters cumulative even
// when reset() is requested, so measure per-frame deltas instead of presenting
// the lifetime totals as one frame. Keeping autoReset disabled also lets each
// delta include every package pass (ground field, sun shadow, water, and main).
// DOM is written directly to keep React out of the measurement loop.
function PerfMonitor({ note }) {
  const { gl } = useThree();
  const statsRef = useRef({
    drawCalls: 0,
    frames: 0,
    lastRenderCalls: null,
    lastRenderTriangles: null,
    lastSample: 0,
    lastTime: 0,
    maxMs: 0,
    renderSamples: 0,
    triangles: 0,
  });

  useEffect(() => {
    const previousAutoReset = gl.info.autoReset;
    gl.info.autoReset = false;
    return () => {
      gl.info.autoReset = previousAutoReset;
      gl.info.reset();
    };
  }, [gl]);

  useFrame(() => {
    const stats = statsRef.current;
    const now = performance.now();
    if (stats.lastTime > 0) stats.maxMs = Math.max(stats.maxMs, now - stats.lastTime);
    stats.lastTime = now;
    stats.frames += 1;
    if (stats.lastSample === 0) stats.lastSample = now;

    const render = gl.info.render;
    if (stats.lastRenderCalls !== null) {
      // Also tolerate a backend or host resetting the counters independently.
      stats.drawCalls += render.calls >= stats.lastRenderCalls
        ? render.calls - stats.lastRenderCalls
        : render.calls;
      stats.triangles += render.triangles >= stats.lastRenderTriangles
        ? render.triangles - stats.lastRenderTriangles
        : render.triangles;
      stats.renderSamples += 1;
    }
    stats.lastRenderCalls = render.calls;
    stats.lastRenderTriangles = render.triangles;

    const elapsed = now - stats.lastSample;
    if (elapsed >= 500 && stats.frames > 0) {
      const element = document.getElementById('ecctrlPerfHud');
      if (element) {
        const fps = (stats.frames * 1000) / elapsed;
        const avgMs = elapsed / stats.frames;
        const drawCalls = stats.renderSamples > 0
          ? Math.round(stats.drawCalls / stats.renderSamples)
          : 0;
        const trianglesPerFrame = stats.renderSamples > 0
          ? stats.triangles / stats.renderSamples
          : 0;
        const triangles = trianglesPerFrame >= 1e6
          ? (trianglesPerFrame / 1e6).toFixed(1) + 'm'
          : Math.round(trianglesPerFrame / 1000) + 'k';
        const backend = gl.isWebGPURenderer
          ? (gl.backend?.isWebGPUBackend === true ? 'WebGPU' : 'WebGL2 fallback')
          : 'WebGL2';
        element.innerHTML = [
          '<b>' + Math.round(fps) + '</b> fps',
          avgMs.toFixed(1) + ' ms avg &middot; ' + stats.maxMs.toFixed(1) + ' ms max',
          drawCalls + ' draw calls/frame &middot; ' + triangles + ' tris/frame',
          backend + ' &middot; DPR ' + gl.getPixelRatio().toFixed(2) +
            (note ? '<br/><span class="perf-hud-note">' + note + '</span>' : ''),
        ].join('<br/>');
        document.body.dataset.perfFps = String(Math.round(fps));
        document.body.dataset.perfDrawCalls = String(drawCalls);
      }
      stats.drawCalls = 0;
      stats.frames = 0;
      stats.maxMs = 0;
      stats.renderSamples = 0;
      stats.triangles = 0;
      stats.lastSample = now;
    }
  }, -100);

  return null;
}

function ControllerTelemetry({ controllerRef }) {
  useFrame(() => {
    const body = controllerRef.current?.group;
    if (!body) return;

    const position = body.translation();
    const velocity = body.linvel();
    document.body.dataset.ecctrlCanJump = String(Boolean(body.userData?.canJump));
    document.body.dataset.ecctrlX = position.x.toFixed(3);
    document.body.dataset.ecctrlY = position.y.toFixed(3);
    document.body.dataset.ecctrlZ = position.z.toFixed(3);
    document.body.dataset.ecctrlVelocityY = velocity.y.toFixed(3);
    document.body.dataset.ecctrlPlanarSpeed = Math.hypot(velocity.x, velocity.z).toFixed(3);
  });

  return null;
}

const freeCamScratch = new THREE.Vector3();

// Free inspection camera (camera mode "free", toggled with V): the character
// follow-cam is disabled and MapControls takes over — left-drag pans across
// the ground, right-drag orbits, wheel zooms, no tether to the character.
// On entry the orbit pivot starts at the character so the view doesn't jump.
function FreeCameraControls({ controllerRef }) {
  const controlsRef = useRef(null);
  const camera = useThree((state) => state.camera);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    // ?freecam=x,y,z,tx,ty,tz pins an exact camera pose (shareable views,
    // deterministic screenshots). Otherwise pivot on the character.
    const pinned = new URLSearchParams(window.location.search).get('freecam');
    const pose = pinned?.split(',').map(Number);
    if (pose?.length === 6 && pose.every(Number.isFinite)) {
      camera.position.set(pose[0], pose[1], pose[2]);
      controls.target.set(pose[3], pose[4], pose[5]);
      controls.update();
      return;
    }
    const body = controllerRef?.current?.group;
    if (body?.translation) {
      const position = body.translation();
      controls.target.set(position.x, position.y + 0.6, position.z);
    } else {
      camera.getWorldDirection(freeCamScratch);
      controls.target.copy(camera.position).addScaledVector(freeCamScratch, 10);
    }
    controls.update();
  }, [camera, controllerRef]);

  return (
    <MapControls
      ref={controlsRef}
      enableDamping
      dampingFactor={0.12}
      screenSpacePanning={false}
      minDistance={0.4}
      maxDistance={380}
      zoomSpeed={1.2}
      panSpeed={1.1}
      rotateSpeed={0.8}
    />
  );
}

function EcctrlApp() {
  const activeShowcase = resolveShowcaseScene(
    INDOOR_SCENE_ENABLED ? 'indoor-room' : 'controller',
  );
  const ActiveShowcaseScene = activeShowcase.Component;
  const [waterSettings, setWaterSettings] = useState(() => createInitialWaterSettings());
  const [waterDebugMode, setWaterDebugMode] = useState(INITIAL_WATER_DEBUG_MODE);
  const [waterEnvPreset, setWaterEnvPreset] = useState(INITIAL_WATER_ENVIRONMENT);
  // 'follow' = third-person camera locked to the character (full body in
  // frame); 'free' = detached MapControls — pan, orbit, zoom anywhere.
  const [cameraMode, setCameraMode] = useState('follow');
  const [sceneInspector, setSceneInspector] = useState(null);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.repeat || (event.key !== 'v' && event.key !== 'V')) return;
      const tag = event.target?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      setCameraMode((mode) => (mode === 'free' ? 'follow' : 'free'));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    document.body.dataset.cameraMode = cameraMode;
  }, [cameraMode]);

  useEffect(() => {
    document.body.dataset.showcaseScene = activeShowcase.id;
  }, [activeShowcase.id]);

  // Environment presets co-tune the water's sun/sky settings.
  const applyEnvironmentPreset = useCallback((presetName) => {
    const environment = WATER_ENVIRONMENT_PRESETS[presetName];
    if (!environment) return;
    setWaterEnvPreset(presetName);
    setWaterSettings((current) => createWaterSettings({ ...current, ...environment.water }));
  }, []);

  const applyStyleBundle = useCallback((bundleId) => {
    const waterStyle = bundleId === 'call-me-sensei' ? 'call_me_sensei' : 'default';
    setWaterSettings((current) => rebaseWaterSettingsStyle(current, waterStyle));
  }, []);

  useEffect(() => {
    if (!WATER_SCENE_ENABLED) return;
    const environment = WATER_ENVIRONMENT_PRESETS[INITIAL_WATER_ENVIRONMENT];
    if (environment && INITIAL_WATER_ENVIRONMENT !== 'noon') {
      setWaterSettings((current) => createWaterSettings({ ...current, ...environment.water }));
    }
  }, []);
  const [ballSpawnToken, setBallSpawnToken] = useState(0);
  const [sinkerSpawnToken, setSinkerSpawnToken] = useState(0);

  useEffect(() => {
    updateModeLabel('loading');
    return updateAnimationToggle({ label: 'Controller Loading' });
  }, []);

  useEffect(() => {
    if (!WATER_SCENE_ENABLED) return;
    document.body.dataset.waterMode = waterSettings.mode;
    document.body.dataset.waterStyle = waterSettings.style;
    document.body.dataset.waterTone = waterSettings.colorTone;
    document.body.dataset.waterLevel = waterSettings.waterLevel.toFixed(3);
  }, [waterSettings]);

  return (
    <>
      {WATER_SCENE_ENABLED && (
        <WalkableSampleHud
          cameraMode={cameraMode}
          envPreset={waterEnvPreset}
          inspector={sceneInspector}
          onCameraModeChange={setCameraMode}
          onEnvPresetChange={applyEnvironmentPreset}
          onStyleBundleChange={applyStyleBundle}
        />
      )}
      <div className="perf-hud" id="ecctrlPerfHud"><b>—</b> fps</div>
      <div className="controls-hud">
        <div className="controls-hud-title">Controls</div>
        <div><kbd>W A S D</kbd> Move · swim direction in water</div>
        <div><kbd>Shift</kbd> Sprint / fast swim</div>
        <div><kbd>Space</kbd> Jump · swim up in water</div>
        {WATER_SCENE_ENABLED && (
          <>
            <div><kbd>C</kbd> or <kbd>Ctrl</kbd> Hold to dive underwater</div>
            <div><kbd>F</kbd> Sit / stand at the bench</div>
          </>
        )}
        <div><kbd>Drag</kbd> Orbit camera (left mouse / trackpad)</div>
        <div><kbd>Scroll</kbd> Zoom camera (wheel / two-finger)</div>
        <div>
          <kbd>V</kbd> Camera: {cameraMode === 'free'
            ? 'free — left-drag pan, right-drag orbit'
            : 'follow (third person)'}
        </div>
      </div>
      {ENABLE_TOUCH_CONTROLS && (
        <EcctrlJoystick
          buttonNumber={1}
          joystickHeightAndWidth={150}
          buttonHeightAndWidth={150}
          joystickPositionLeft={16}
          joystickPositionBottom={16}
          buttonPositionRight={16}
          buttonPositionBottom={16}
        />
      )}
      <Canvas
        camera={{
          fov: 44,
          near: 0.05,
          // SkySystem's package night sphere is an angular carrier. Keeping the
          // host far plane at twice its public default avoids clipping without
          // copying the Sky & Cloud Lab's much larger aerial-review frustum.
          far: NIGHT_SKY_DEFAULT_RADIUS * 2,
          position: [0, 1.4, 4.8],
        }}
        gl={async (defaultProps) => {
          // Shared renderer factory honors ?renderer=. The default is native
          // WebGPU; renderer=webgl keeps the TSL WebGL2 fallback available.
          const renderer = createLabRenderer({
            ...defaultProps,
            antialias: true,
            // Automated golden captures need the last presented GPU frame to
            // remain readable. Normal interactive scenes keep the faster
            // default swap-chain behavior.
            preserveDrawingBuffer: GOLDEN_CAPTURE_ENABLED,
          });
          await whenRendererReady(renderer);
          return renderer;
        }}
        onCreated={(state) => {
          const { gl } = state;
          // Debug/automation handle (same pattern as tree-lab's __treeDesigner).
          window.__playground = state;
          installGoldenSceneCapture(state, { enabled: GOLDEN_CAPTURE_ENABLED });
          gl.setClearColor(0x1a1a1a);
        }}
      >
        <PerfMonitor note={RENDERER_FALLBACK_NOTE} />
        <ActiveShowcaseScene
          ballSpawnToken={ballSpawnToken}
          cameraMode={cameraMode}
          debugMode={waterDebugMode}
          envPreset={waterEnvPreset}
          inspector={sceneInspector}
          onInspectorReady={setSceneInspector}
          services={{
            Character: ShowcaseCharacter,
            FreeCamera: FreeCameraControls,
            SceneLook: CallMeSenseiSceneLook,
            Telemetry: ControllerTelemetry,
          }}
          settings={waterSettings}
          sinkerSpawnToken={sinkerSpawnToken}
          visualYOffset={FLOAT_SPRING_SAG}
        />
      </Canvas>
    </>
  );
}

if (WATER_SCENE_ENABLED) {
  const params = new URLSearchParams(window.location.search);
  params.delete('scene');
  params.delete('sample');
  params.delete('controller');
  const query = params.toString();
  const destination = window.location.pathname.startsWith('/labs/')
    ? '/labs/walkable-reference'
    : '/examples/walkable-reference/';
  window.location.replace(`${destination}${query ? `?${query}` : ''}${window.location.hash}`);
} else {
  createRoot(document.getElementById('app')).render(<EcctrlApp />);
}
