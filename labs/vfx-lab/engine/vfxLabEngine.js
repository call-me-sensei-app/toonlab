// Three.js half of the single-effect VFX editor. It previews only the active
// Effect document, resolves that effect's procedural/uploaded Source textures,
// and repeats only that effect when loop is enabled. Source/seed changes
// rebuild bounded renderer resources; macro changes atomically re-register the
// compiled document so unrelated project effects never enter this workspace.
//
// Automation contract (capture scripts assert these, do not rename):
//   document.body.dataset.vfxLabReady          — 'true' after the first frame
//   document.body.dataset.vfxLiveGlow/LivePuff/DrawCalls/Spawns — per frame
//   document.body.dataset.vfxMovePhase         — active move phase id or ''

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import {
  createVfxSourceRuntime,
  createVfxSystem,
} from '../../../src/vfxgen/index.js';
import {
  createPostProcessingPipeline,
  createPostProcessingSettings,
} from '../../../src/post/postProcessing.js';
import { createLabRenderer, whenRendererReady } from '../../shared/rendererFactory.js';
import { applyLabPreviewEnvironment } from '../../shared/previewEnvironmentRig.js';

const REBUILD_DEBOUNCE_MS = 90;
const PREVIEW_SOURCE = Object.freeze([3.4, 1.15, 0]);

export function createVfxLabEngine({ mount, store }) {
  document.body.dataset.scene = 'vfx';
  document.body.dataset.vfxLabReady = 'false';

  const renderer = createLabRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x121722);

  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, 4.2, 11);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 1.1, 0);
  controls.maxPolarAngle = Math.PI / 2 - 0.03;
  controls.minDistance = 3;
  controls.maxDistance = 30;

  // Universal preview illumination. The selected hour is host/preview state;
  // it never enters the portable VFX Effect document.
  const hemisphereLight = new THREE.HemisphereLight(0xc7dcff, 0x647fbd, 0.65);
  const sun = new THREE.DirectionalLight(0xfff0d2, 1.4);
  sun.position.set(-6, 9, 5);
  scene.add(hemisphereLight, sun);

  // Arena dressing.
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(11, 48).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x273247, metalness: 0.08, roughness: 0.9 }),
  );
  scene.add(floor);
  const inner = new THREE.Mesh(
    new THREE.CircleGeometry(6.5, 48).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x364663, metalness: 0.12, roughness: 0.82 }),
  );
  inner.position.y = 0.005;
  scene.add(inner);
  const dummy = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.32, 1.0, 4, 12),
    new THREE.MeshStandardMaterial({ color: 0x526789, metalness: 0.25, roughness: 0.62 }),
  );
  dummy.position.set(-2.4, 0.85, 0);
  scene.add(dummy);
  // Effect-local bloomContribution remains portable advice. The actual post
  // stack is host-owned preview infrastructure and is intentionally fixed.
  const post = createPostProcessingPipeline({
    camera,
    pixelRatio: Math.min(window.devicePixelRatio, 2),
    renderer,
    scene,
    settings: createPostProcessingSettings({
      preset: 'custom',
      features: { bloom: true, enabled: true, vignette: true },
      parameters: {
        bloomLevels: 4,
        bloomMode: 'pyramid',
        bloomRadius: 0.3,
        bloomStrength: 0.24,
        bloomThreshold: 0.88,
        strength: 1,
        vignetteStrength: 0.035,
      },
    }),
  });
  document.body.dataset.vfxPostProcessing = post.enabled ? 'true' : 'false';

  // --- vfx system lifecycle ----------------------------------------------------
  let vfx = null;
  let sourceRuntime = null;
  const rebuiltListeners = new Set();

  function retireSystem(previousVfx, previousSourceRuntime) {
    previousVfx?.root?.parent?.remove(previousVfx.root);
    const dispose = () => {
      previousVfx?.dispose();
      previousSourceRuntime?.dispose();
    };
    const queue = renderer.backend?.device?.queue;
    if (queue?.onSubmittedWorkDone) {
      queue.onSubmittedWorkDone()
        .then(() => queue.onSubmittedWorkDone())
        .then(dispose)
        .catch(() => requestAnimationFrame(() => requestAnimationFrame(dispose)));
      return;
    }
    requestAnimationFrame(() => requestAnimationFrame(dispose));
  }

  function buildSystem() {
    const state = store.getState();
    const previousVfx = vfx;
    const previousSourceRuntime = sourceRuntime;
    sourceRuntime = createVfxSourceRuntime({
      runtimeUrls: state.sourceRuntimeUrls,
      sourceAssets: state.sourceAssets,
    });
    vfx = createVfxSystem({
      effectDocuments: [state.effectDocument],
      heightAt: () => 0,
      seed: state.seed,
      settings: state.overrides,
      sourceTextures: sourceRuntime.textures,
      style: state.styleId,
    });
    scene.add(vfx.root);
    retireSystem(previousVfx, previousSourceRuntime);
    for (const listener of [...rebuiltListeners]) listener();
  }

  let lastSignature = null;
  let lastEffectSignature = null;
  let rebuildTimer = null;
  function signatureOf(state) {
    return `${state.seed}|${state.styleId}|${state.sourceRevision}|${JSON.stringify(state.overrides)}`;
  }
  function effectSignatureOf(state) {
    return JSON.stringify(state.effectDocument);
  }
  store.subscribe(() => {
    const state = store.getState();
    const signature = signatureOf(state);
    const effectSignature = effectSignatureOf(state);
    if (signature !== lastSignature) {
      lastSignature = signature;
      lastEffectSignature = effectSignature;
      clearTimeout(rebuildTimer);
      rebuildTimer = setTimeout(buildSystem, REBUILD_DEBOUNCE_MS);
      return;
    }
    if (effectSignature !== lastEffectSignature) {
      lastEffectSignature = effectSignature;
      try {
        vfx?.registerEffectDocument(state.effectDocument, { overwrite: true });
      } catch (error) {
        store.actions.setStatus(`Effect update rejected: ${error.message}`);
      }
    }
  });

  // --- isolated effect preview -------------------------------------------------
  let clockTime = 0;
  const liveChargedPreviews = [];
  let displayedPhase = '';
  let displayedPhaseUntil = 0;
  let previewAutoHour = store.getState().previewHour;
  let previewStateCommit = 0;

  function launchChargedShot(segment = store.getState().previewSegment ?? 'sequence') {
    if (!vfx) return;
    const state = store.getState();
    const isSequence = segment === 'sequence';
    const from = segment === 'impact'
      ? [dummy.position.x + 0.35, 1.15, dummy.position.z]
      : PREVIEW_SOURCE;
    const handle = vfx.spawn(state.effectDocument.id, {
      charge: state.chargePreview,
      chargeDuration: isSequence
        ? THREE.MathUtils.lerp(0.35, 0.85, state.chargePreview)
        : segment === 'charge' ? 999 : 0,
      from,
      maxLife: segment === 'expire' ? 0.08 : 1.6,
      velocity: [-7.4, 0, 0],
    });
    if (!handle) return;

    if (segment === 'impact') {
      handle.explode(
        [dummy.position.x + 0.35, 1.15, dummy.position.z],
        [1, 0, 0],
      );
      displayedPhase = 'impact';
      displayedPhaseUntil = clockTime + 0.55;
      return;
    }

    liveChargedPreviews.push({
      handle,
      segment,
      stopAt: segment === 'charge'
        ? clockTime + 1.25
        : segment === 'release' ? clockTime + 0.34 : Infinity,
    });
    displayedPhase = isSequence ? 'charge' : segment;
    displayedPhaseUntil = Infinity;
  }

  const api = {
    onRebuilt(listener) {
      rebuiltListeners.add(listener);
      return () => rebuiltListeners.delete(listener);
    },
    get system() { return vfx; },
    /** Preview only the active effect document. */
    trigger(type = 'activeEffect', segment = store.getState().previewSegment ?? 'sequence') {
      if (type === 'activeEffect' || type === 'chargedShot') launchChargedShot(segment);
    },
  };

  // --- auto loop: repeat only the active effect --------------------------------
  let lastChargedShot = -1;

  function runLoop(t) {
    const chargedId = Math.floor((t + 0.5) / 2.8);
    if (chargedId !== lastChargedShot) {
      lastChargedShot = chargedId;
      launchChargedShot(store.getState().previewSegment ?? 'sequence');
    }
  }

  // --- loop ------------------------------------------------------------------------
  const timer = new THREE.Timer();
  timer.connect(document);
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    post.setSize(window.innerWidth, window.innerHeight, Math.min(window.devicePixelRatio, 2));
  });

  async function start() {
    await whenRendererReady(renderer);
    lastSignature = signatureOf(store.getState());
    lastEffectSignature = effectSignatureOf(store.getState());
    buildSystem();
    renderer.setAnimationLoop((timestamp) => {
      timer.update(timestamp);
      const delta = Math.min(timer.getDelta(), 0.1);
      clockTime += delta;
      const labState = store.getState();
      if (labState.previewAutoCycle) {
        previewAutoHour = (previewAutoHour + delta * 0.35) % 24;
        previewStateCommit += delta;
        if (previewStateCommit >= 0.2) {
          previewStateCommit = 0;
          store.actions.setPreviewHour(previewAutoHour);
        }
      } else {
        previewAutoHour = labState.previewHour;
      }
      const preview = applyLabPreviewEnvironment(previewAutoHour, {
        background: true,
        hemisphereIntensity: 0.85,
        hemisphereLight,
        renderer,
        scene,
        sun,
        sunDistance: 12,
        sunIntensity: 1.45,
      });
      if (vfx) {
        const fog = preview.timeState.fogColor;
        vfx.setDistanceFog({
          color: [fog.r, fog.g, fog.b],
          density: 0.008,
          falloff: 55,
          floorY: 0,
        });
      }
      controls.update();
      if (vfx) {
        if (labState.loop) runLoop(clockTime);
        sourceRuntime?.update(clockTime);
        vfx.update(delta, camera);
        for (let i = liveChargedPreviews.length - 1; i >= 0; i -= 1) {
          const previewEntry = liveChargedPreviews[i];
          const shot = previewEntry.handle;
          if (!shot.alive) {
            if (previewEntry.segment === 'expire') {
              displayedPhase = 'expire';
              displayedPhaseUntil = clockTime + 0.25;
            }
            liveChargedPreviews.splice(i, 1);
          } else if (clockTime >= previewEntry.stopAt) {
            shot.cancel();
            displayedPhase = '';
            displayedPhaseUntil = clockTime;
            liveChargedPreviews.splice(i, 1);
          } else if (shot.position.x <= dummy.position.x + 0.45) {
            if (previewEntry.segment === 'travel') {
              shot.cancel();
              displayedPhase = '';
              displayedPhaseUntil = clockTime;
            } else {
              shot.explode(
                [dummy.position.x + 0.35, 1.15, dummy.position.z],
                [1, 0, 0],
              );
              displayedPhase = 'impact';
              displayedPhaseUntil = clockTime + 0.55;
            }
            liveChargedPreviews.splice(i, 1);
          } else {
            displayedPhase = previewEntry.segment === 'sequence'
              ? (shot.phase || 'travel')
              : previewEntry.segment;
          }
        }
        if (clockTime >= displayedPhaseUntil && liveChargedPreviews.length === 0) {
          displayedPhase = '';
        }
      }
      post.render(delta);
      if (vfx) {
        const stats = vfx.stats;
        document.body.dataset.vfxLabReady = 'true';
        document.body.dataset.vfxLiveGlow = String(stats.live.glow);
        document.body.dataset.vfxLivePuff = String(stats.live.puff);
        document.body.dataset.vfxLiveChargedShots = String(stats.live.chargedShots);
        document.body.dataset.vfxDrawCalls = String(stats.drawCalls);
        document.body.dataset.vfxSpawns = String(stats.spawnsTotal);
        document.body.dataset.vfxMovePhase = displayedPhase;
      }
    });
  }

  return { ...api, camera, renderer, scene, start };
}
