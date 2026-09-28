// Three.js half of Prop Lab: deterministic recipe rebuilds, ToonLab
// environment-shader conversion, camera framing, and render/test gates.
// Point types build one hero prop (hi / lo / side-by-side); linear types
// build along a gentle sloped S-curve so the terrain-following read shows;
// the scatter toggle rehearses scatterProps over the same terrain swell.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import {
  advanceEnvironmentShaderTime,
  applyEnvironmentShader,
  resetEnvironmentShaderTime,
} from '../../../src/environment/environmentMaterialAdapter.js';
import { createEnvironmentSunShadowPass } from '../../../src/environment/environmentSunShadowPass.js';
import {
  PROP_TYPES,
  buildProp,
  buildPropAlong,
  createPropAsset,
  disposeProp,
  scatterProps,
} from '../../../src/propgen/index.js';
import { createLabRenderer, whenRendererReady } from '../../shared/rendererFactory.js';

const REBUILD_DEBOUNCE_MS = 90;
const LINEAR_RUN_SPAN = 8;
const SCATTER_COUNT = 24;
const SCATTER_RADIUS = 9;

// One terrain function for everything the preview grounds on: the ground
// disc vertices, the linear run points, and the scatter heightAt. Flat (and
// exactly zero) at the origin so hero props sit clean; a gentle sinusoidal
// swell everywhere else.
export function terrainHeight(x, z) {
  return 0.34 * (1 - Math.cos(x * 0.4)) + 0.26 * (1 - Math.cos(z * 0.33));
}

// The linear preview spline: 5 points on a gentle S-curve spanning ~8m,
// sampled onto the terrain swell — posts and courses must step with it.
function linearRunPoints(offsetZ = 0) {
  const points = [];
  for (let index = 0; index < 5; index += 1) {
    const x = -LINEAR_RUN_SPAN / 2 + (LINEAR_RUN_SPAN / 4) * index;
    const z = Math.sin(x * 0.55) * 1.15 + offsetZ;
    points.push({ x, y: terrainHeight(x, z), z });
  }
  return points;
}

function sourceMaterials(root) {
  const result = new Set();
  root.traverse((object) => {
    if (!object.isMesh) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (material) result.add(material);
    }
  });
  return result;
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
    const instances = object.isInstancedMesh ? object.count : 1;
    const position = object.geometry?.attributes?.position;
    vertices += (position?.count ?? 0) * instances;
    const index = object.geometry?.index;
    triangles += ((index ? index.count : position?.count ?? 0) / 3) * instances;
  });
  return { triangleCount: Math.round(triangles), vertexCount: Math.round(vertices) };
}

export function createPropEngine({ mount, store }) {
  document.body.dataset.scene = 'prop';
  document.body.dataset.modelReady = 'false';

  const renderer = createLabRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x7892a5);
  scene.fog = new THREE.Fog(0x9eb1bd, 20, 65);

  const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.05, 120);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI / 2 - 0.025;
  controls.minDistance = 0.8;
  controls.maxDistance = 35;

  const ambient = new THREE.AmbientLight(0xdfe8f2, 0.55);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xffe4bf, 1.05);
  sun.position.set(8, 12, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -12;
  sun.shadow.camera.right = 12;
  sun.shadow.camera.top = 12;
  sun.shadow.camera.bottom = -12;
  sun.shadow.bias = -0.0004;
  scene.add(sun);

  // Ground disc displaced by the shared terrain function so linear runs and
  // scattered props visibly sit ON the swell they were grounded against.
  const groundGeometry = new THREE.RingGeometry(0.01, 38, 128, 32).rotateX(-Math.PI / 2);
  {
    const position = groundGeometry.attributes.position;
    for (let index = 0; index < position.count; index += 1) {
      position.setY(index, terrainHeight(position.getX(index), position.getZ(index)) - 0.012);
    }
    groundGeometry.computeVertexNormals();
  }
  const ground = new THREE.Mesh(groundGeometry, new THREE.MeshToonMaterial({ color: 0x6d766b }));
  ground.receiveShadow = true;
  scene.add(ground);

  // GridHelper can't follow a displaced ground (2-vertex lines), so the grid
  // is subdivided line segments draped 2cm above the same terrain function.
  {
    const size = 18;
    const step = 0.5;
    const subdivisions = 36;
    const half = size / 2;
    const positions = [];
    for (let line = 0; line <= Math.round(size / step); line += 1) {
      const offset = -half + line * step;
      for (let segment = 0; segment < subdivisions; segment += 1) {
        const a = -half + (size * segment) / subdivisions;
        const b = -half + (size * (segment + 1)) / subdivisions;
        positions.push(offset, terrainHeight(offset, a) + 0.02, a, offset, terrainHeight(offset, b) + 0.02, b);
        positions.push(a, terrainHeight(a, offset) + 0.02, offset, b, terrainHeight(b, offset) + 0.02, offset);
      }
    }
    const gridGeometry = new THREE.BufferGeometry();
    gridGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const grid = new THREE.LineSegments(
      gridGeometry,
      new THREE.LineBasicMaterial({ color: 0x9aa69d, opacity: 0.16, transparent: true }),
    );
    scene.add(grid);
  }

  const environmentBox = new THREE.Box3(
    new THREE.Vector3(-20, -1, -20),
    new THREE.Vector3(20, 12, 20),
  );
  const sunShadowPass = createEnvironmentSunShadowPass({ renderer, scene });

  let asset = null;
  let scatterUpdate = null;
  let rebuildTimer = 0;
  let rebuildToken = 0;
  let rebuildCount = 0;
  const rebuiltListeners = new Set();

  // WebGPU may still have the previous frame's bind groups in flight when a
  // recipe swap lands. Retire the detached preview after a few frames instead
  // of destroying its material buffers in the same task as scene removal.
  function retireAsset(previous) {
    if (!previous) return;
    scene.remove(previous);
    window.setTimeout(() => {
      previous.traverse((object) => {
        if (object.isInstancedMesh) object.dispose();
      });
      disposeProp(previous);
    }, 180);
  }

  function frameComposition(view = 'hero') {
    if (!asset) return;
    const box = new THREE.Box3().setFromObject(asset);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    // Long thin runs (fences, walls, piers) read tiny with a plain
    // max-dimension radius — weight the plan dimensions down so the hero
    // view fills the frame for them without changing compact props.
    const radius = Math.max(Math.max(size.x, size.z) * 0.66, size.y, 0.75);
    controls.target.set(center.x, Math.max(center.y * 0.55, 0.15), center.z);
    if (view === 'top') camera.position.set(center.x + 0.01, center.y + radius * 2.45, center.z + 0.01);
    else if (view === 'front') camera.position.set(center.x, center.y + radius * 0.62, center.z + radius * 2.3);
    else camera.position.set(center.x + radius * 1.5, center.y + radius, center.z + radius * 1.85);
    camera.near = Math.max(0.02, radius / 100);
    camera.far = Math.max(80, radius * 30);
    camera.updateProjectionMatrix();
    controls.update();
  }

  // Builds the preview group for the current settings + view: hero prop
  // (point), sloped S-curve run (linear), or a scatterProps rehearsal.
  function buildPreview(settings, view) {
    const next = new THREE.Group();
    next.name = 'PropPreview';
    let nextScatterUpdate = null;
    const linear = Boolean(PROP_TYPES[settings.asset.type]?.linear);
    if (view.scatter) {
      const scattered = scatterProps({
        asset: createPropAsset(settings),
        center: { x: 0, z: 0 },
        count: SCATTER_COUNT,
        heightAt: terrainHeight,
        minSpacing: linear ? 3.4 : 1.7,
        parent: next,
        radius: SCATTER_RADIUS,
        seed: settings.asset.seed + 1,
      });
      nextScatterUpdate = scattered.update;
    } else if (linear) {
      const detail = view.lodPreview === 'lo' ? 'lo' : 'hi';
      next.add(buildPropAlong(settings, linearRunPoints(), { detail }).object3D);
      if (view.lodPreview === 'both') {
        next.add(buildPropAlong(settings, linearRunPoints(3), { detail: 'lo' }).object3D);
      }
    } else {
      const detail = view.lodPreview === 'lo' ? 'lo' : 'hi';
      const primary = buildProp(settings, { detail });
      next.add(primary.object3D);
      if (view.lodPreview === 'both') {
        const secondary = buildProp(settings, { detail: 'lo' });
        const size = new THREE.Box3().setFromObject(primary.object3D).getSize(new THREE.Vector3());
        const gap = Math.max(size.x, 0.9) * 0.62 + 0.45;
        primary.object3D.position.set(-gap, terrainHeight(-gap, 0), 0);
        secondary.object3D.position.set(gap, terrainHeight(gap, 0), 0);
        next.add(secondary.object3D);
      }
    }
    return { next, nextScatterUpdate };
  }

  async function rebuild({ reframe = false } = {}) {
    window.clearTimeout(rebuildTimer);
    const token = ++rebuildToken;
    const { settings, view } = store.getState();
    let next;
    let nextScatterUpdate;
    try {
      ({ next, nextScatterUpdate } = buildPreview(settings, view));
    } catch (error) {
      console.error('Prop build failed:', error);
      if (token === rebuildToken) document.body.dataset.modelReady = 'error';
      return;
    }
    const originals = sourceMaterials(next);
    try {
      await applyEnvironmentShader(next, {
        bakeVertexAo: false,
        environmentBox,
        hasSun: true,
        parameters: {
          ambientStrength: 0.62,
          aoWarmth: 0.52,
          shadowLift: 0.44,
          untexturedGradientStrength: 0.2 + settings.surface.edgeLight * 0.28,
          vertexAoStrength: 0.8,
        },
        scanStylize: false,
      });
    } catch (error) {
      console.error('Prop shader conversion failed:', error);
      disposeProp(next);
      if (token === rebuildToken) document.body.dataset.modelReady = 'error';
      return;
    } finally {
      for (const material of originals) material.dispose();
    }
    if (token !== rebuildToken) {
      disposeProp(next);
      return;
    }
    if (asset) {
      retireAsset(asset);
    }
    asset = next;
    scatterUpdate = nextScatterUpdate;
    scene.add(asset);
    rebuildCount += 1;
    const stats = previewStats(asset);
    document.body.dataset.propRebuildCount = String(rebuildCount);
    document.body.dataset.propTriangleCount = String(stats.triangleCount);
    document.body.dataset.propVertexCount = String(stats.vertexCount);
    document.body.dataset.propSeed = String(settings.asset.seed);
    document.body.dataset.propType = settings.asset.type;
    document.body.dataset.propVariant = settings.asset.variant;
    document.body.dataset.propGeometryHash = String(geometryHash(asset));
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
      scatterUpdate?.(delta, camera);
      sunShadowPass.update({ dynamic: true });
      renderer.render(scene, camera);
      if (firstFrame) {
        firstFrame = false;
        document.body.dataset.propLabReady = 'true';
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
