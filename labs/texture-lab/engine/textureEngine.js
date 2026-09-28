// Three.js half of Texture Lab: bakes the current recipe into PBR maps
// (src/texgen), shows them on a preview mesh (3D) or as a tiled flat sheet
// (2D), and re-bakes on store revisions with cancellation. Neutral PBR is
// the exact-map reference; optional environment styles re-render those same
// maps for lookdev without changing the texture document or exports.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import {
  evaluateTextureMaps,
  syncTextureMapTextures,
} from '../../../src/texgen/index.js';
import {
  applyEnvironmentShader,
  resolveEnvironmentPreset,
} from '../../../src/environment/index.js';
import { createLabRenderer, whenRendererReady } from '../../shared/rendererFactory.js';
import { NEUTRAL_TEXTURE_PREVIEW_STYLE } from '../previewStyles.js';

const REBAKE_DEBOUNCE_MS = 110;

export const TEXTURE_PREVIEW_MESHES = Object.freeze([
  Object.freeze({ displacement: 0.05, id: 'sphere', label: 'Sphere' }),
  Object.freeze({ displacement: 0, id: 'cube', label: 'Cube' }),
  Object.freeze({ displacement: 0.045, id: 'cylinder', label: 'Cylinder' }),
  Object.freeze({ displacement: 0.05, id: 'torus', label: 'Torus' }),
  Object.freeze({ displacement: 0.04, id: 'knot', label: 'Knot' }),
  Object.freeze({ displacement: 0.09, id: 'plane', label: 'Plane' }),
]);

export const TEXTURE_VIEW_MAPS = Object.freeze([
  Object.freeze({ id: 'final', label: 'Lit material' }),
  Object.freeze({ id: 'albedo', label: 'Albedo' }),
  Object.freeze({ id: 'heightBytes', label: 'Height' }),
  Object.freeze({ id: 'normal', label: 'Normal' }),
  Object.freeze({ id: 'roughness', label: 'Roughness' }),
  Object.freeze({ id: 'metalness', label: 'Metalness' }),
  Object.freeze({ id: 'ao', label: 'Occlusion' }),
  Object.freeze({ id: 'emissive', label: 'Emissive' }),
]);

/**
 * Small procedural studio equirect (gradient dome, floor bounce, two
 * softboxes) so metals have something believable to reflect. Float values
 * above 1 give the softboxes real highlight energy. Zero assets.
 */
function createStudioEnvironment() {
  const width = 128;
  const height = 64;
  const data = new Float32Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const v = y / (height - 1); // 0 top (zenith) -> 1 bottom (nadir)
    for (let x = 0; x < width; x += 1) {
      const u = x / (width - 1);
      let r;
      let g;
      let b;
      if (v < 0.5) {
        const t = v / 0.5;
        r = 0.05 + 0.13 * t;
        g = 0.07 + 0.15 * t;
        b = 0.11 + 0.19 * t;
      } else {
        const t = (v - 0.5) / 0.5;
        r = 0.18 - 0.1 * t;
        g = 0.2 - 0.11 * t;
        b = 0.24 - 0.13 * t;
      }
      // Key softbox high on the left-front, cool rim strip behind-right.
      const key = Math.max(0, 1 - Math.abs(u - 0.22) * 9) * Math.max(0, 1 - Math.abs(v - 0.24) * 7);
      const rim = Math.max(0, 1 - Math.abs(u - 0.72) * 12) * Math.max(0, 1 - Math.abs(v - 0.38) * 6);
      r += key * 3.2 + rim * 0.9;
      g += key * 3.1 + rim * 1.05;
      b += key * 2.8 + rim * 1.5;
      const o = (y * width + x) * 4;
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = 1;
    }
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function buildPreviewGeometries() {
  return {
    cube: new THREE.BoxGeometry(1.24, 1.24, 1.24, 64, 64, 64),
    cylinder: new THREE.CylinderGeometry(0.62, 0.62, 1.34, 128, 96),
    knot: new THREE.TorusKnotGeometry(0.56, 0.24, 220, 36),
    plane: new THREE.PlaneGeometry(1.72, 1.72, 160, 160),
    sphere: new THREE.SphereGeometry(0.84, 160, 112),
    torus: new THREE.TorusGeometry(0.68, 0.3, 96, 160),
  };
}

export function createTextureEngine({ mount, store }) {
  document.body.dataset.scene = 'texture';
  document.body.dataset.modelReady = 'false';

  const renderer = createLabRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  mount.appendChild(renderer.domElement);

  // --- 3D stage
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d1015);
  scene.environment = createStudioEnvironment();
  if ('environmentIntensity' in scene) scene.environmentIntensity = 0.72;

  const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.05, 60);
  camera.position.set(1.75, 1.05, 2.15);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 1.1;
  controls.maxDistance = 7;
  controls.target.set(0, 0, 0);

  function resetCamera() {
    camera.position.set(1.75, 1.05, 2.15);
    controls.target.set(0, 0, 0);
    controls.update();
  }

  function setNavigationMode(mode = 'rotate') {
    controls.mouseButtons.LEFT = mode === 'pan'
      ? THREE.MOUSE.PAN
      : mode === 'zoom'
        ? THREE.MOUSE.DOLLY
        : THREE.MOUSE.ROTATE;
  }

  const hemi = new THREE.HemisphereLight(0xbdd0e8, 0x2b2823, 0.4);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff2df, 1.7);
  key.position.set(2.4, 3.2, 1.9);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fc0ff, 0.7);
  rim.position.set(-2.6, 1.2, -2.4);
  scene.add(rim);

  const neutralMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0x000000,
    metalness: 1,
    roughness: 1,
  });
  let activePreviewMaterial = neutralMaterial;
  let compare = false;
  let split = 0.2;

  const geometries = buildPreviewGeometries();
  const meshes = {};
  const meshGroup = new THREE.Group();
  for (const spec of TEXTURE_PREVIEW_MESHES) {
    const mesh = new THREE.Mesh(geometries[spec.id], neutralMaterial);
    mesh.visible = spec.id === 'sphere';
    if (spec.id === 'plane') mesh.rotation.x = -Math.PI * 0.42;
    meshes[spec.id] = mesh;
    meshGroup.add(mesh);
  }
  scene.add(meshGroup);

  // --- 2D stage (tiled sheet, fullbright)
  const scene2d = new THREE.Scene();
  scene2d.background = new THREE.Color(0x0d1015);
  const camera2d = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera2d.position.z = 2;
  const flatMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const flatMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), flatMaterial);
  scene2d.add(flatMesh);

  // --- bake state
  let textures = null;
  let lastMaps = null;
  let bakeToken = 0;
  let rebakeTimer = 0;
  let lastRevision = store.getState().docRevision;
  let lastView = null;
  let previewStyleToken = 0;
  const styledMaterials = new Map();
  const rebuiltListeners = new Set();

  function setPreviewMaterial(material) {
    activePreviewMaterial = material;
    for (const mesh of Object.values(meshes)) mesh.material = material;
  }

  function clearStyledMaterials() {
    setPreviewMaterial(neutralMaterial);
    previewStyleToken += 1;
    for (const material of styledMaterials.values()) material.dispose();
    styledMaterials.clear();
  }

  async function buildStyledMaterial(styleId) {
    const source = neutralMaterial.clone();
    const geometry = new THREE.PlaneGeometry(1, 1);
    const subject = new THREE.Mesh(geometry, source);
    const root = new THREE.Group();
    root.add(subject);
    const preset = resolveEnvironmentPreset(styleId);
    try {
      await applyEnvironmentShader(root, {
        bakeVertexAo: false,
        features: preset.features,
        hasSun: false,
        parameters: preset.parameters,
        scanStylize: false,
      });
      const styled = subject.material;
      styled.name = `TexturePreview:${styleId}`;
      return styled;
    } finally {
      source.dispose();
      geometry.dispose();
    }
  }

  async function applyPreviewStyle() {
    const styleId = store.getState().view.previewStyle;
    const token = ++previewStyleToken;
    if (styleId === NEUTRAL_TEXTURE_PREVIEW_STYLE) {
      setPreviewMaterial(neutralMaterial);
      document.body.dataset.texturePreviewStyle = styleId;
      return;
    }
    let styled = styledMaterials.get(styleId);
    if (!styled) {
      styled = await buildStyledMaterial(styleId);
      if (token !== previewStyleToken) {
        styled.dispose();
        return;
      }
      styledMaterials.set(styleId, styled);
    }
    if (token !== previewStyleToken) return;
    setPreviewMaterial(styled);
    document.body.dataset.texturePreviewStyle = styleId;
  }

  function requestPreviewStyle() {
    return applyPreviewStyle().catch((error) => {
      console.warn('Texture preview style failed:', error);
      setPreviewMaterial(neutralMaterial);
      document.body.dataset.texturePreviewStyle = NEUTRAL_TEXTURE_PREVIEW_STYLE;
      store.actions.setStatus('That preview style could not render; showing Neutral PBR.');
    });
  }

  // Decoded image-base cache (texgen stays DOM-free; decoding lives here).
  let imageCache = { dataUrl: null, pixels: null };
  async function ensureImagePixels(imageLayer) {
    if (!imageLayer?.dataUrl) return null;
    if (imageCache.dataUrl === imageLayer.dataUrl) return imageCache.pixels;
    const bitmap = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not decode the image.'));
      img.src = imageLayer.dataUrl;
    });
    const maxSide = 1024;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(8, Math.round(bitmap.width * scale));
    canvas.height = Math.max(8, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const data = context.getImageData(0, 0, canvas.width, canvas.height);
    imageCache = {
      dataUrl: imageLayer.dataUrl,
      pixels: { data: data.data, height: canvas.height, width: canvas.width },
    };
    return imageCache.pixels;
  }

  function applyRepeat(tiling) {
    if (!textures) return;
    for (const id of ['albedo', 'normal', 'roughness', 'metalness', 'ao', 'heightBytes', 'emissive', 'orm']) {
      textures[id].repeat.set(tiling, tiling);
    }
  }

  function applyView() {
    const state = store.getState();
    const view = state.view;
    const viewKey = `${view.mesh}|${view.map}|${view.mode}|${view.tiling}|${view.previewStyle}|${state.settings.surface.heightScale}`;
    if (viewKey === lastView) return;
    lastView = viewKey;

    for (const spec of TEXTURE_PREVIEW_MESHES) {
      meshes[spec.id].visible = spec.id === view.mesh && view.mode === '3d';
    }
    const meshSpec = TEXTURE_PREVIEW_MESHES.find((spec) => spec.id === view.mesh) ?? TEXTURE_PREVIEW_MESHES[0];
    neutralMaterial.displacementScale = meshSpec.displacement * state.settings.surface.heightScale;
    applyRepeat(view.tiling);
    if (textures) {
      const mapId = view.map === 'final' ? 'albedo' : view.map;
      flatMaterial.map = textures[mapId] ?? textures.albedo;
      flatMaterial.needsUpdate = true;
    }
    const aspect = window.innerWidth / window.innerHeight;
    camera2d.left = -Math.max(1, aspect);
    camera2d.right = Math.max(1, aspect);
    camera2d.top = Math.max(1, 1 / aspect);
    camera2d.bottom = -Math.max(1, 1 / aspect);
    camera2d.updateProjectionMatrix();
    const side = Math.min(2 * Math.max(1, aspect), 2 * Math.max(1, 1 / aspect)) * 0.92;
    flatMesh.scale.set(side / 2, side / 2, 1);
  }

  async function bake({ immediate = false } = {}) {
    const state = store.getState();
    const token = ++bakeToken;
    const size = state.view.hq ? 512 : 256;
    store.actions.setGen({ busy: true, progress: 0 });
    let imagePixels = null;
    if (state.settings.image?.dataUrl) {
      try {
        imagePixels = await ensureImagePixels(state.settings.image);
      } catch (error) {
        console.error('Texture Lab image decode failed:', error);
        store.actions.setStatus('Could not decode the image — baking procedurally.');
      }
      if (token !== bakeToken) return;
    }
    const maps = await evaluateTextureMaps(state.settings, {
      imagePixels,
      onProgress: (p) => {
        if (token === bakeToken) store.actions.setGen({ progress: p });
      },
      shouldCancel: () => token !== bakeToken,
      size,
      target: lastMaps && lastMaps.size === size ? lastMaps : null,
    });
    if (!maps || token !== bakeToken) return;
    lastMaps = maps;

    const synced = syncTextureMapTextures(maps, textures);
    textures = synced.textures;
    if (synced.recreated) {
      neutralMaterial.map = textures.albedo;
      neutralMaterial.normalMap = textures.normal;
      neutralMaterial.roughnessMap = textures.roughness;
      neutralMaterial.metalnessMap = textures.metalness;
      neutralMaterial.aoMap = textures.ao;
      neutralMaterial.displacementMap = textures.heightBytes;
      neutralMaterial.emissiveMap = textures.emissive;
      neutralMaterial.needsUpdate = true;
      clearStyledMaterials();
      lastView = null; // re-apply repeat + 2D map bindings
    }
    neutralMaterial.emissive.setScalar(maps.emissiveEnabled ? 1 : 0);
    neutralMaterial.emissiveIntensity = maps.emissiveEnabled ? maps.emissiveIntensity : 1;

    store.actions.setGen({ busy: false, ms: maps.ms, progress: 1, size });
    document.body.dataset.textureBakeMs = String(Math.round(maps.ms));
    document.body.dataset.textureBakeSize = String(size);
    applyView();
    if (synced.recreated) await requestPreviewStyle();
    for (const listener of rebuiltListeners) listener();
  }

  function scheduleBake() {
    window.clearTimeout(rebakeTimer);
    rebakeTimer = window.setTimeout(() => { bake(); }, REBAKE_DEBOUNCE_MS);
  }

  let lastHq = store.getState().view.hq;
  let lastPreviewStyle = store.getState().view.previewStyle;
  store.subscribe(() => {
    const state = store.getState();
    if (state.docRevision !== lastRevision) {
      lastRevision = state.docRevision;
      if (state.lastChange.immediate) bake({ immediate: true });
      else scheduleBake();
    }
    if (state.view.hq !== lastHq) {
      lastHq = state.view.hq;
      bake({ immediate: true });
    }
    if (state.view.previewStyle !== lastPreviewStyle) {
      lastPreviewStyle = state.view.previewStyle;
      requestPreviewStyle();
    }
    applyView();
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    lastView = null;
    applyView();
  });

  const clock = new THREE.Clock();
  let firstFrame = true;

  async function start() {
    await bake({ immediate: true });
    await whenRendererReady(renderer);
    renderer.setAnimationLoop(() => {
      const delta = clock.getDelta();
      const state = store.getState();
      if (state.view.mode === '2d') {
        renderer.render(scene2d, camera2d);
      } else if (compare && activePreviewMaterial !== neutralMaterial) {
        controls.update();
        if (state.view.spin) meshGroup.rotation.y += delta * 0.22;
        const width = mount.clientWidth || window.innerWidth;
        const height = mount.clientHeight || window.innerHeight;
        const splitX = Math.round(width * split);
        const styledMaterial = activePreviewMaterial;
        renderer.setScissorTest(true);
        setPreviewMaterial(neutralMaterial);
        renderer.setScissor(0, 0, splitX, height);
        renderer.render(scene, camera);
        setPreviewMaterial(styledMaterial);
        renderer.setScissor(splitX, 0, width - splitX, height);
        renderer.render(scene, camera);
        renderer.setScissorTest(false);
      } else {
        controls.update();
        if (state.view.spin) meshGroup.rotation.y += delta * 0.22;
        renderer.render(scene, camera);
      }
      if (firstFrame) {
        firstFrame = false;
        document.body.dataset.modelReady = 'true';
        document.body.dataset.textureLabReady = 'true';
      }
    });
  }

  return {
    camera,
    controls,
    /** Decodes (and caches) the document's image base for export bakes. */
    ensureImagePixels,
    /** Latest baked maps (preview resolution) — reused by quick exports. */
    getMaps: () => lastMaps,
    getPreviewMaterial: () => meshes[store.getState().view.mesh]?.material ?? neutralMaterial,
    onRebuilt(listener) {
      rebuiltListeners.add(listener);
      return () => rebuiltListeners.delete(listener);
    },
    rebake: () => bake({ immediate: true }),
    resetCamera,
    renderer,
    scene,
    setCompare(enabled) {
      compare = Boolean(enabled);
    },
    setNavigationMode,
    setSplit(fraction) {
      split = Math.min(0.98, Math.max(0.02, Number(fraction) || 0.2));
    },
    start,
  };
}
