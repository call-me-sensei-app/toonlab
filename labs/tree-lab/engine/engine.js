// Tree Lab engine: the vanilla three.js half — scene, plant lifecycle,
// rebuild loop, live material applies, camera framing, GLB export, and the
// body-dataset flags the Playwright harness gates on. It consumes the
// designer store (subscribe + revision diffing) and never touches the DOM
// beyond its own canvas and body.dataset.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import {
  createPlantFromRecipe,
  compileTreeLodLevels,
  deriveCanopyPalette,
  disposeExportGroup,
  prepareTreeForExport,
  recipeFromSettings,
  resolveVegetationShaderPreset,
  resolveCanopyColor,
  windOptionsFromSettings,
} from '../../../src/vegetation/experimental.js';
import { downloadGLB } from '../exporters.js';
import { mergeSketchIntoRecipe } from '../store/docUtils.js';
import { createLabRenderer, whenRendererReady } from '../../shared/rendererFactory.js';
import { createEnvironmentSunShadowPass } from '../../../src/environment/environmentSunShadowPass.js';
import { createBarkMaterial } from './barkTextures.js';

const REBUILD_DEBOUNCE_MS = 140;

export function createTreeEngine({ mount = document.body, store, urlParams }) {
  const captureView = (urlParams.get('captureView') || '').toLowerCase();
  const deterministicCaptureViews = new Set(['front', 'side', 'back']);
  if (deterministicCaptureViews.has(captureView)) {
    document.body.dataset.captureView = captureView;
  }
  const renderer = createLabRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  // Tree Lab is an interactive authoring surface, not a final-frame render.
  // Uncapped Retina resolution doubles both dimensions and can quadruple the
  // fill cost while scrubbing dense foliage.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true; // no skinned MMD casters here — native shadows are safe on all backends
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x5da4e8);
  scene.fog = new THREE.Fog(0xa9d7ea, 90, 240);

  // Node backends: TSL grass/foliage sample the shared sun-shadow pass for
  // scene-shadow reception (built-in materials keep native shadows).
  const sunShadowPass = createEnvironmentSunShadowPass({ renderer, scene });

  const camera = new THREE.PerspectiveCamera(
    45, window.innerWidth / window.innerHeight, 0.1, 400);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const sunDirection = [0.45, 0.75, 0.5];
  const sun = new THREE.DirectionalLight(0xfff2dd, 1.6);
  sun.position.set(sunDirection[0] * 40, sunDirection[1] * 40, sunDirection[2] * 40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -20;
  sun.shadow.camera.right = 20;
  sun.shadow.camera.top = 20;
  sun.shadow.camera.bottom = -20;
  scene.add(sun);
  const ambient = new THREE.AmbientLight(0xe8f5ff, 0.55);
  scene.add(ambient);
  const hemi = new THREE.HemisphereLight(0xeaf6ff, 0xd4b678, 0.5);
  scene.add(hemi);

  // Double-sided so the world never vanishes if the camera grazes grade;
  // orbit is also clamped (below) to keep the eye above the ground.
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(140, 48).rotateX(-Math.PI / 2),
    new THREE.MeshToonMaterial({ color: 0x74c04b, side: THREE.DoubleSide }),
  );
  ground.receiveShadow = true;
  scene.add(ground);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  // Never orbit below grade — under-ground views make roots/trees "float".
  controls.maxPolarAngle = Math.PI / 2 - 0.03;

  // Move sub-modes: what LEFT-drag does (middle = zoom, right = pan stay
  // constant, so every camera action is always reachable).
  const MOVE_MODE_BUTTONS = {
    pan: THREE.MOUSE.PAN,
    rotate: THREE.MOUSE.ROTATE,
    zoom: THREE.MOUSE.DOLLY,
  };
  // Idle default (tool 'orbit'): left-drag rotates, no chrome. Explicitly
  // selected Move (tool 'move'): left-drag follows the Pan/Rotate/Zoom
  // sub-mode from the options bar.
  let lastLeftMapping = null;
  store.subscribe(() => {
    const { moveMode, tool } = store.getState();
    const mapping = tool === 'move'
      ? (MOVE_MODE_BUTTONS[moveMode] ?? THREE.MOUSE.ROTATE)
      : THREE.MOUSE.ROTATE;
    if (mapping !== lastLeftMapping) {
      lastLeftMapping = mapping;
      controls.mouseButtons.LEFT = mapping;
    }
  });

  // ?bakedPreview=1 renders the GLB-export group beside the live plant — a
  // one-screenshot A/B of what leaves the tool vs what runs in-engine.
  const bakedPreviewEnabled = urlParams.get('bakedPreview') === '1';
  let bakedPreview = null;

  let plant = null;
  let lodCompilation = null;
  let lodPreviewRoot = null;
  let lodPreviewTimer = 0;
  let rebuildCount = 0;
  let rebuildTimer = 0;
  const rebuildListeners = new Set();
  const previewListeners = new Set();

  function recipeFromStore() {
    const {
      animation, flowers, leafShape, leafStyle, roots, settings, sketch, trunkProfile,
      woodDetails,
    } = store.getState();
    return mergeSketchIntoRecipe(
      recipeFromSettings(settings), sketch,
      { animation, flowers, leafShape, leafStyle, roots, trunkProfile, woodDetails });
  }

  function disposeLodCompilation() {
    window.clearTimeout(lodPreviewTimer);
    if (lodPreviewRoot) scene.remove(lodPreviewRoot);
    lodPreviewRoot = null;
    lodCompilation?.dispose();
    lodCompilation = null;
  }

  function stampPreviewStats(level = null, report = null, error = null) {
    document.body.dataset.treePreviewLod = level === null ? 'edit' : `lod${level}`;
    if (report) {
      document.body.dataset.treePreviewTriangles = String(report.triangles);
      document.body.dataset.treePreviewMaterials = String(report.materials);
      document.body.dataset.treePreviewTriangleCap = String(report.triangleCap);
      document.body.dataset.treePreviewValid =
        String(report.triangles <= report.triangleCap);
    } else {
      delete document.body.dataset.treePreviewTriangles;
      delete document.body.dataset.treePreviewMaterials;
      delete document.body.dataset.treePreviewTriangleCap;
      delete document.body.dataset.treePreviewValid;
    }
    if (error) document.body.dataset.treePreviewError = error;
    else delete document.body.dataset.treePreviewError;
    for (const listener of [...previewListeners]) listener({
      error, level, report,
    });
  }

  function refreshLodPreview({ recompile = false } = {}) {
    const requested = store.getState().previewLod;
    if (requested === null) {
      disposeLodCompilation();
      if (plant) plant.visible = true;
      if (bakedPreview) bakedPreview.visible = true;
      stampPreviewStats();
      return;
    }
    try {
      if (recompile || !lodCompilation) {
        disposeLodCompilation();
        lodCompilation = compileTreeLodLevels(recipeFromStore());
      } else if (lodPreviewRoot) {
        scene.remove(lodPreviewRoot);
      }
      lodPreviewRoot = lodCompilation.levels[requested];
      scene.add(lodPreviewRoot);
      if (plant) plant.visible = false;
      if (bakedPreview) bakedPreview.visible = false;
      stampPreviewStats(requested, lodCompilation.report.levels[requested]);
    } catch (error) {
      console.warn(`LOD${requested} preview failed:`, error);
      disposeLodCompilation();
      if (plant) plant.visible = true;
      if (bakedPreview) bakedPreview.visible = true;
      const message = error instanceof Error ? error.message : String(error);
      stampPreviewStats(requested, null, message);
      store.actions.setStatus(`LOD${requested} preview failed: ${message}`);
    }
  }

  function scheduleLodPreviewRefresh() {
    window.clearTimeout(lodPreviewTimer);
    lodPreviewTimer = window.setTimeout(
      () => refreshLodPreview({ recompile: true }),
      REBUILD_DEBOUNCE_MS,
    );
  }

  function applyLiveColor() {
    if (!plant) return;
    const { settings } = store.getState();
    const color = settings.color;
    const overrides = {};
    if (color.pinLit) overrides.lit = [...color.lit];
    if (color.pinShadow) overrides.shadow = [...color.shadow];
    if (color.pinCrown) overrides.crown = [...color.crown];
    const canopySpec = Array.isArray(color.canopy) ? [...color.canopy] : color.canopy;
    const palette = deriveCanopyPalette(
      resolveCanopyColor(canopySpec, settings.plant.seed), overrides);
    const materials = [];
    plant.traverse((object) => {
      if (!object.isMesh) return;
      materials.push(...(Array.isArray(object.material) ? object.material : [object.material]));
    });
    const proceduralMaterial = plant.canopyMesh?.material;
    const uniforms = !Array.isArray(proceduralMaterial) && proceduralMaterial?.uniforms;
    if (uniforms?.uLitColor && uniforms?.uShadowColor && uniforms?.uCrownColor) {
      uniforms.uLitColor.value.copy(palette.lit);
      uniforms.uShadowColor.value.copy(palette.shadow);
      uniforms.uCrownColor.value.copy(palette.crown);
      return;
    }
    for (const material of new Set(materials)) {
      if (!/foliage|leaf|needle/i.test(material?.name ?? '') || !material.color) continue;
      material.color.copy(palette.lit);
      material.needsUpdate = true;
    }
  }

  function applyLiveWind() {
    if (!plant) return;
    const wind = windOptionsFromSettings(store.getState().settings);
    plant.setWind?.({
      direction: wind.windDirection,
      speed: wind.windSpeed,
      strength: wind.windStrength,
    });
  }

  function applyLiveStyle() {
    const state = store.getState();
    const galleryMonochrome = /^local_gallery_tree_\d+$/.test(String(state.presetId ?? ''));
    const overrides = galleryMonochrome
      ? {
        foliage: {
          // Gallery candidates are authored as one hue family. Keep the
          // renderer's per-card variation at zero so lighting changes value,
          // not hue, and never turns green into yellow/orange/red.
          hueShift: 0,
          hueVariation: 0,
          styleColorStrength: 0,
        },
      }
      : {};
    plant?.setVegetationShader?.(resolveVegetationShaderPreset(state.styleId, overrides));
    document.body.dataset.vegetationStyle = state.styleId;
    document.body.dataset.galleryMonochrome = String(galleryMonochrome);
  }

  function disposePlantRoot(root) {
    root?.dispose?.();
    const retired = root?.userData?.toonlabRetiredBarkMaterials;
    if (retired) {
      for (const material of retired) material?.dispose?.();
      retired.clear();
    }
  }

  function applyStructureBarkMaterial(root, choice, height, vegetationShader) {
    const replacement = createBarkMaterial(choice, { height, vegetationShader });
    const retired = root.userData.toonlabRetiredBarkMaterials
      ?? new Set();
    let applied = false;
    root.traverse((object) => {
      if (!object.isMesh) return;
      const source = Array.isArray(object.material) ? object.material : [object.material];
      const next = source.map((material) => {
        const semanticRole = object.userData?.toonlabVegetationRole ?? '';
        const structural = semanticRole === 'structuralSurface'
          || /bark|wood|structure|culm|stem|succulent/i.test(
            `${object.name ?? ''} ${material?.name ?? ''}`,
          );
        if (!structural) return material;
        applied = true;
        // WebGPU may still reference the previous material's binding buffers
        // for an already-submitted frame. Retire it with the plant and dispose
        // it when that plant leaves the scene instead of destroying it here.
        if (material && material !== replacement) retired.add(material);
        return replacement;
      });
      object.material = Array.isArray(object.material) ? next : next[0];
    });
    if (applied) root.userData.toonlabRetiredBarkMaterials = retired;
    else replacement.dispose();
    return applied;
  }

  function applyLiveBark() {
    if (!plant) return;
    const state = store.getState();
    applyStructureBarkMaterial(
      plant,
      state.barkTexture,
      state.settings.trunk.height,
      state.settings.plant.stylePreset,
    );
    if (plant.userData.treeRecipe) {
      plant.userData.treeRecipe = {
        ...plant.userData.treeRecipe,
        options: {
          ...(plant.userData.treeRecipe.options ?? {}),
          barkTexture: state.barkTexture,
        },
      };
    }
  }

  function rebuild() {
    const rebuildStartedAt = performance.now();
    window.clearTimeout(rebuildTimer);
    disposeLodCompilation();
    const state = store.getState();
    const {
      animation, barkTexture, flowers, glbMode, leafShape, leafStyle, roots, settings, sketch,
      trunkProfile, woodDetails,
    } = state;
    const recipe = mergeSketchIntoRecipe(
      recipeFromSettings(settings), sketch,
      {
        animation,
        barkTexture,
        flowers,
        leafShape,
        leafStyle,
        roots,
        trunkProfile,
        woodDetails,
      });
    if (plant) {
      scene.remove(plant);
      disposePlantRoot(plant);
    }
    plant = createPlantFromRecipe(recipe, {
      trunkMaterial: createBarkMaterial(store.getState().barkTexture, {
        height: settings.trunk.height,
        vegetationShader: settings.plant.stylePreset,
      }),
    });
    document.body.dataset.treeRuntime = plant?.plantGraph?.growthModel
      ?? (settings.plant.speciesProfileId ? 'threejs-plant-graph' : 'legacy-woody');
    plant.setSun?.({ direction: sunDirection, color: [1.0, 0.96, 0.86], sky: [0.72, 0.87, 1.0] });
    applyLiveStyle();
    applyLiveWind();
    scene.add(plant);
    // The editor can keep a stable wind shadow between geometry edits. Render
    // it once for the new plant instead of rebuilding a 2048px depth target on
    // every animation frame.
    sunShadowPass.invalidate();
    if (bakedPreviewEnabled) {
      if (bakedPreview) {
        scene.remove(bakedPreview);
        disposeExportGroup(bakedPreview);
      }
      bakedPreview = prepareTreeForExport(plant, { foliageMode: glbMode });
      bakedPreview.position.x = -settings.plant.size * 4;
      scene.add(bakedPreview);
    }
    refreshLodPreview({ recompile: store.getState().previewLod !== null });
    rebuildCount += 1;
    document.body.dataset.treeLastRebuildMs = (
      performance.now() - rebuildStartedAt
    ).toFixed(1);
    document.body.dataset.treeRebuildCount = String(rebuildCount);
    document.body.dataset.treeSeed = String(settings.plant.seed);
    document.body.dataset.treeCardCount =
      String((plant.canopyMesh.geometry.index?.count ?? 0) / 6);
    if (settings.skeleton.generator === 'drawn' && !sketch.branchSpines.length
      && settings.plant.type === 'tree') {
      store.actions.setStatus('Hand-drawn mode: use ✏️ Branch to draw the trunk up from the ground.');
    }
    for (const listener of [...rebuildListeners]) listener(plant);
    delete document.body.dataset.treeBaselineStatus;
    delete document.body.dataset.treeBaselineError;
    delete document.body.dataset.treeBaselineLod;
  }

  function scheduleRebuild() {
    window.clearTimeout(rebuildTimer);
    rebuildTimer = window.setTimeout(rebuild, REBUILD_DEBOUNCE_MS);
  }

  // Initial camera framing; user orbiting is preserved across rebuilds.
  // Legacy recipes can still produce crowns much larger than their nominal
  // `size`, so fit the actual plant bounds for every generated plant rather
  // than only for species-profile recipes. This keeps random procedural trees
  // fully visible and gives the gallery the same honest first frame as the
  // species catalog.
  function frameCamera() {
    const { settings } = store.getState();
    if (plant) {
      plant.updateWorldMatrix(true, true);
      const bounds = new THREE.Box3().setFromObject(plant);
      const center = bounds.getCenter(new THREE.Vector3());
      const dimensions = bounds.getSize(new THREE.Vector3());
      const span = Math.max(dimensions.x, dimensions.y, dimensions.z, 1);
      const viewWidth = captureView === 'side' ? dimensions.z : dimensions.x;
      const viewDepth = captureView === 'side' ? dimensions.x : dimensions.z;
      const halfVerticalFov = THREE.MathUtils.degToRad(camera.fov * 0.5);
      const fitVertical = dimensions.y / (2 * Math.tan(halfVerticalFov));
      const fitHorizontal = viewWidth
        / (2 * Math.tan(halfVerticalFov) * Math.max(0.1, camera.aspect));
      // Fit both dimensions instead of using one scalar span. Deterministic
      // review captures have no chrome over the canvas, so use a close 6%
      // safety margin and only a small perspective-depth allowance. The
      // interactive editor keeps its roomier orbit framing.
      const captureFraming = deterministicCaptureViews.has(captureView);
      const distance = Math.max(fitVertical, fitHorizontal)
        * (captureFraming ? 1.06 : 1.16)
        + viewDepth * (captureFraming ? 0.12 : 0.5);
      controls.target.copy(center);
      // Leave enough vertical safety for the persistent top/bottom chrome.
      // A mathematically tight 45° fit clipped tall palms and bamboo even
      // though their geometry bounds were correct.
      if (captureView === 'front') {
        camera.position.set(center.x, center.y + span * 0.08, center.z + distance);
      } else if (captureView === 'side') {
        camera.position.set(center.x + distance, center.y + span * 0.08, center.z);
      } else if (captureView === 'back') {
        camera.position.set(center.x, center.y + span * 0.08, center.z - distance);
      } else {
        camera.position.set(
          center.x + span * 0.32,
          center.y + span * 0.08,
          center.z + span * 1.48,
        );
      }
      controls.update();
      return;
    }
    const size = settings.plant.size;
    const eye = (settings.plant.type === 'bush' ? 0.9 : 1.75) * size;
    controls.target.set(0, eye, 0);
    camera.position.set(size * 1.2, eye + size * 0.4, 5.5 * size);
    controls.update();
  }

  // FNV-1a over both meshes' positions: cheap determinism fingerprint.
  function geometryHash() {
    let hash = 0x811c9dc5;
    const mix = (attribute) => {
      if (!attribute) return;
      const view = new Uint8Array(
        attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength);
      for (let i = 0; i < view.length; i += 1) {
        hash ^= view[i];
        hash = Math.imul(hash, 0x01000193) >>> 0;
      }
    };
    mix(plant?.trunkMesh?.geometry.attributes.position);
    mix(plant?.canopyMesh?.geometry.attributes.position);
    return hash >>> 0;
  }

  async function exportGlb({ filename, mode }) {
    const bytes = await downloadGLB(plant, { filename, mode });
    document.body.dataset.treeExportBytes = String(bytes);
    return bytes;
  }

  // ---- store subscription: revisions drive rebuilds ------------------------
  let lastDoc = store.getState().docRevision;
  let lastLive = store.getState().liveRevision;
  let lastLiveBark = store.getState().barkTexture;
  let lastLiveColor = store.getState().settings.color;
  let lastLiveWind = store.getState().settings.wind;
  let lastPreviewLod = store.getState().previewLod;
  let lastStyle = store.getState().styleId;
  store.subscribe(() => {
    const state = store.getState();
    if (state.docRevision !== lastDoc) {
      lastDoc = state.docRevision;
      if (state.lastChange.transient) {
        window.clearTimeout(rebuildTimer);
      } else if (state.lastChange.immediate) rebuild();
      else scheduleRebuild();
      if (state.lastChange.reframe && !state.lastChange.transient) frameCamera();
    }
    if (state.liveRevision !== lastLive) {
      lastLive = state.liveRevision;
      if (state.settings.color !== lastLiveColor) {
        lastLiveColor = state.settings.color;
        applyLiveColor();
      }
      if (state.barkTexture !== lastLiveBark) {
        lastLiveBark = state.barkTexture;
        applyLiveBark();
      }
      if (state.settings.wind !== lastLiveWind) {
        lastLiveWind = state.settings.wind;
        applyLiveWind();
      }
      if (state.previewLod !== null) scheduleLodPreviewRefresh();
    }
    if (state.previewLod !== lastPreviewLod) {
      lastPreviewLod = state.previewLod;
      refreshLodPreview();
    }
    if (state.styleId !== lastStyle) {
      lastStyle = state.styleId;
      applyLiveStyle();
    }
  });

  const frameListeners = new Set();

  async function start() {
    rebuild();
    frameCamera();
    // WebGPU backends boot asynchronously; the loop waits for init.
    await whenRendererReady(renderer);
    let firstFrame = true;
    const timer = new THREE.Timer();
    timer.connect(document);
    renderer.setAnimationLoop((timestamp) => {
      timer.update(timestamp);
      const delta = Math.min(timer.getDelta(), 0.05);
      plant?.update(delta);
      for (const listener of frameListeners) listener(delta);
      controls.update();
      sunShadowPass.update();
      renderer.render(scene, camera);
      if (firstFrame) {
        firstFrame = false;
        // Gates scripts/lab-probe.mjs and visual-check.mjs share with the labs.
        document.body.dataset.modelReady = 'true';
        document.body.dataset.treeLabReady = 'true';
      }
    });
  }

  return {
    ambient,
    camera,
    controls,
    exportGlb,
    frameCamera,
    hemi,
    sun,
    geometryHash,
    getPlant: () => plant,
    ground,
    onFrame: (listener) => {
      frameListeners.add(listener);
      return () => frameListeners.delete(listener);
    },
    onRebuilt: (listener) => {
      rebuildListeners.add(listener);
      return () => rebuildListeners.delete(listener);
    },
    onPreviewChanged: (listener) => {
      previewListeners.add(listener);
      return () => previewListeners.delete(listener);
    },
    projectToScreen: (point) => {
      const projected = new THREE.Vector3(...point).project(camera);
      return {
        x: ((projected.x + 1) / 2) * window.innerWidth,
        y: ((1 - projected.y) / 2) * window.innerHeight,
      };
    },
    rebuild,
    renderer,
    scene,
    start,
  };
}
