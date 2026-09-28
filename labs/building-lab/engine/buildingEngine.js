// Three.js half of Building Lab: deterministic recipe rebuilds, ToonLab
// environment-shader conversion, camera framing, and render/test gates.
// The building drops into a displaced terrain patch (gentle sinusoidal
// swell by default; the slope test swaps in a ~16° hillside so the buried
// foundation-skirt behavior shows); 'both' LOD preview builds hi and lo
// side by side.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import {
  advanceEnvironmentShaderTime,
  applyEnvironmentShader,
  resetEnvironmentShaderTime,
} from '../../../src/environment/environmentMaterialAdapter.js';
import { createEnvironmentSunShadowPass } from '../../../src/environment/environmentSunShadowPass.js';
import { createBuildingFromRecipe } from '../../../src/buildinggen/index.js';
import { createLabRenderer, whenRendererReady } from '../../shared/rendererFactory.js';

const REBUILD_DEBOUNCE_MS = 90;
// ~15.7° — steep enough that a floating corner would be obvious, still
// inside the foundation skirt's "≤ ~20° without floating corners" band.
const SLOPE_GRADE = 0.28;

// One terrain function for everything the preview grounds on: the ground
// disc vertices, the draped grid, and the building's y. Flat (and exactly
// zero) at the origin so the hero building sits clean; a gentle sinusoidal
// swell everywhere else — or the planar test slope when slopeTest is on.
export function terrainHeight(x, z, slopeTest = false) {
  if (slopeTest) return x * SLOPE_GRADE;
  return 0.5 * (1 - Math.cos(x * 0.16)) + 0.35 * (1 - Math.cos(z * 0.14));
}

function geometryHash(root) {
  let hash = 0x811c9dc5;
  root?.traverse((object) => {
    const attribute = object.isMesh ? object.geometry?.attributes?.position : null;
    if (!attribute) return;
    const view = new Uint8Array(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength);
    for (let index = 0; index < view.length; index += 1) {
      hash ^= view[index];
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
  });
  return hash >>> 0;
}

function previewStats(root) {
  let vertices = 0;
  let triangles = 0;
  root?.traverse((object) => {
    if (!object.isMesh) return;
    const position = object.geometry?.attributes?.position;
    vertices += position?.count ?? 0;
    const index = object.geometry?.index;
    triangles += (index ? index.count : position?.count ?? 0) / 3;
  });
  return { triangleCount: Math.round(triangles), vertexCount: Math.round(vertices) };
}

// Building role materials are cache-owned (five shared materials serve every
// building ever built) — a retired preview owns only its geometries and the
// converted environment materials applyEnvironmentShader swapped in.
function disposePreview(root, { materials = true } = {}) {
  root?.traverse((object) => {
    if (!object.isMesh) return;
    object.geometry?.dispose();
    if (!materials) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      material?.dispose?.();
    }
  });
}

export function createBuildingEngine({ mount, store }) {
  document.body.dataset.scene = 'building';
  document.body.dataset.modelReady = 'false';

  const renderer = createLabRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x7892a5);
  scene.fog = new THREE.Fog(0x9eb1bd, 30, 110);

  const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 200);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI / 2 - 0.025;
  controls.minDistance = 2;
  controls.maxDistance = 80;

  const ambient = new THREE.AmbientLight(0xdfe8f2, 0.55);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xffe4bf, 1.05);
  sun.position.set(16, 22, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -20;
  sun.shadow.camera.right = 20;
  sun.shadow.camera.top = 20;
  sun.shadow.camera.bottom = -20;
  sun.shadow.bias = -0.0004;
  scene.add(sun);

  // Ground disc displaced by the shared terrain function so the building
  // visibly sits ON the surface it was grounded against; the buried skirt
  // hides below it. Re-displaced in place when the slope test toggles.
  const groundGeometry = new THREE.RingGeometry(0.01, 60, 128, 48).rotateX(-Math.PI / 2);
  const ground = new THREE.Mesh(groundGeometry, new THREE.MeshToonMaterial({ color: 0x6d766b }));
  ground.receiveShadow = true;
  scene.add(ground);

  // GridHelper can't follow a displaced ground (2-vertex lines), so the grid
  // is subdivided line segments draped 2cm above the same terrain function.
  const gridGeometry = new THREE.BufferGeometry();
  {
    const size = 30;
    const step = 1;
    const subdivisions = 30;
    const half = size / 2;
    const positions = [];
    for (let line = 0; line <= Math.round(size / step); line += 1) {
      const offset = -half + line * step;
      for (let segment = 0; segment < subdivisions; segment += 1) {
        const a = -half + (size * segment) / subdivisions;
        const b = -half + (size * (segment + 1)) / subdivisions;
        positions.push(offset, 0, a, offset, 0, b);
        positions.push(a, 0, offset, b, 0, offset);
      }
    }
    gridGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const grid = new THREE.LineSegments(
      gridGeometry,
      new THREE.LineBasicMaterial({ color: 0x9aa69d, opacity: 0.16, transparent: true }),
    );
    scene.add(grid);
  }

  // Both terrain meshes carry world XZ per vertex, so swapping between the
  // swell and the test slope is a pure Y rewrite.
  let terrainSlope = null;
  function displaceTerrain(slopeTest) {
    if (terrainSlope === slopeTest) return;
    terrainSlope = slopeTest;
    const groundPosition = groundGeometry.attributes.position;
    for (let index = 0; index < groundPosition.count; index += 1) {
      groundPosition.setY(index, terrainHeight(groundPosition.getX(index), groundPosition.getZ(index), slopeTest) - 0.012);
    }
    groundPosition.needsUpdate = true;
    groundGeometry.computeVertexNormals();
    const gridPosition = gridGeometry.attributes.position;
    for (let index = 0; index < gridPosition.count; index += 1) {
      gridPosition.setY(index, terrainHeight(gridPosition.getX(index), gridPosition.getZ(index), slopeTest) + 0.02);
    }
    gridPosition.needsUpdate = true;
  }
  displaceTerrain(false);

  const environmentBox = new THREE.Box3(
    new THREE.Vector3(-30, -2, -30),
    new THREE.Vector3(30, 20, 30),
  );
  const sunShadowPass = createEnvironmentSunShadowPass({ renderer, scene });

  let asset = null;
  let rebuildTimer = 0;
  let rebuildToken = 0;
  let rebuildCount = 0;
  const rebuiltListeners = new Set();

  // WebGPU may still have the previous frame's bind groups in flight when a
  // recipe swap lands. Retire the detached preview after a few frames instead
  // of destroying its buffers in the same task as scene removal.
  function retireAsset(previous) {
    if (!previous) return;
    scene.remove(previous);
    window.setTimeout(() => disposePreview(previous), 180);
  }

  function frameComposition(view = 'hero') {
    if (!asset) return;
    const box = new THREE.Box3().setFromObject(asset);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    // Buildings read best filling ~two-thirds of the frame and vertically
    // centered: target the box center (towers would otherwise crowd the top
    // of the frame) and weight plan/height into one radius that covers wide
    // L-plans, side-by-side LOD pairs, and tall towers alike.
    const radius = Math.max(Math.max(size.x, size.z) * 0.62, size.y * 0.76, 2);
    controls.target.set(center.x, Math.max(center.y, 0.5), center.z);
    if (view === 'top') camera.position.set(center.x + 0.01, center.y + radius * 2.45, center.z + 0.01);
    else if (view === 'front') camera.position.set(center.x, center.y + radius * 0.62, center.z + radius * 2.3);
    else camera.position.set(center.x + radius * 1.5, center.y + radius * 0.72, center.z + radius * 1.85);
    camera.near = Math.max(0.05, radius / 80);
    camera.far = Math.max(150, radius * 30);
    camera.updateProjectionMatrix();
    controls.update();
  }

  // Builds the preview group for the current settings + view: the hero
  // building grounded on the terrain, plus a lo-detail sibling offset by
  // footprint width + 4m when the LOD preview is 'both'.
  function buildPreview(settings, view) {
    const next = new THREE.Group();
    next.name = 'BuildingPreview';
    const slope = Boolean(view.slopeTest);
    const detail = view.lodPreview === 'lo' ? 'lo' : 'hi';
    const primary = createBuildingFromRecipe(settings, { detail });
    next.add(primary.object3D);
    if (view.lodPreview === 'both') {
      const secondary = createBuildingFromRecipe(settings, { detail: 'lo' });
      const gap = (settings.footprint.width + 4) / 2;
      primary.object3D.position.set(-gap, terrainHeight(-gap, 0, slope), 0);
      secondary.object3D.position.set(gap, terrainHeight(gap, 0, slope), 0);
      next.add(secondary.object3D);
    } else {
      primary.object3D.position.setY(terrainHeight(0, 0, slope));
    }
    return next;
  }

  async function rebuild({ reframe = false } = {}) {
    window.clearTimeout(rebuildTimer);
    const token = ++rebuildToken;
    const { settings, view } = store.getState();
    displaceTerrain(Boolean(view.slopeTest));
    let next;
    try {
      next = buildPreview(settings, view);
    } catch (error) {
      console.error('Building build failed:', error);
      if (token === rebuildToken) document.body.dataset.modelReady = 'error';
      return;
    }
    try {
      await applyEnvironmentShader(next, {
        bakeVertexAo: false,
        environmentBox,
        hasSun: true,
        parameters: {
          ambientStrength: 0.62,
          aoWarmth: 0.52,
          shadowLift: 0.44,
          untexturedGradientStrength: 0.26,
          vertexAoStrength: 0.8,
        },
        scanStylize: false,
      });
    } catch (error) {
      console.error('Building shader conversion failed:', error);
      // Source materials are the shared role cache — geometry only.
      disposePreview(next, { materials: false });
      if (token === rebuildToken) document.body.dataset.modelReady = 'error';
      return;
    }
    if (token !== rebuildToken) {
      disposePreview(next);
      return;
    }
    if (asset) {
      retireAsset(asset);
    }
    asset = next;
    scene.add(asset);
    rebuildCount += 1;
    const stats = previewStats(asset);
    document.body.dataset.buildingRebuildCount = String(rebuildCount);
    document.body.dataset.buildingTriangleCount = String(stats.triangleCount);
    document.body.dataset.buildingVertexCount = String(stats.vertexCount);
    document.body.dataset.buildingSeed = String(settings.seed);
    document.body.dataset.buildingType = settings.type;
    document.body.dataset.buildingGeometryHash = String(geometryHash(asset));
    document.body.dataset.modelReady = 'true';
    if (reframe || rebuildCount === 1) frameComposition();
    for (const listener of [...rebuiltListeners]) listener(asset);
  }

  function scheduleRebuild(reframe) {
    window.clearTimeout(rebuildTimer);
    rebuildTimer = window.setTimeout(() => rebuild({ reframe }), REBUILD_DEBOUNCE_MS);
  }

  let lastRevision = store.getState().docRevision;
  store.subscribe(() => {
    const state = store.getState();
    if (state.docRevision === lastRevision) return;
    lastRevision = state.docRevision;
    if (state.lastChange.immediate) rebuild({ reframe: state.lastChange.reframe });
    else scheduleRebuild(state.lastChange.reframe);
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  async function start() {
    resetEnvironmentShaderTime();
    await rebuild({ reframe: true });
    await whenRendererReady(renderer);
    let previousTime = null;
    let firstFrame = true;
    renderer.setAnimationLoop((time) => {
      const delta = previousTime === null ? 0 : Math.min((time - previousTime) / 1000, 0.1);
      previousTime = time;
      advanceEnvironmentShaderTime(delta);
      controls.update();
      sunShadowPass.update({ dynamic: true });
      renderer.render(scene, camera);
      if (firstFrame) {
        firstFrame = false;
        document.body.dataset.buildingLabReady = 'true';
      }
    });
  }

  return {
    camera,
    controls,
    frameComposition,
    geometryHash: () => geometryHash(asset),
    getAsset: () => asset,
    onRebuilt(listener) {
      rebuiltListeners.add(listener);
      return () => rebuiltListeners.delete(listener);
    },
    rebuild,
    renderer,
    scene,
    start,
  };
}
