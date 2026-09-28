import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { createEnvironmentGroundFieldPass } from '../../../src/environment/environmentGroundFieldPass.js';
import {
  meshDocument,
} from '../../../src/rockgen/index.js';
import {
  createLabRenderer,
  whenRendererReady,
} from '../../shared/rendererFactory.js';
import { getRockVariationCatalogEntry } from './catalog.js';
import { installViewportNavigation } from './viewportNavigation.js';
import { createFramePointerQueue } from './framePointer.js';
import {
  auditCatalogSculptGeometry,
  catalogPreviewOffset,
  createC8CustomMeshCatalogEntry,
  createCatalogSourceLoader,
  createCatalogSculptWeights,
  createCatalogGrabSession,
  catalogEditableBounds,
  createCatalogVariation,
  decimateCatalogGeometry,
  drillCatalogGeometry,
  exportCatalogVariation,
  fillCatalogGeometry,
  fractureCatalogGeometry,
  inheritCatalogEditState,
  loadCatalogSource,
  mirrorCatalogGeometry,
  remeshCatalogGeometry,
  resizeCatalogGeometry,
  resizeCatalogMeshesToDimensions,
  rotateCatalogGeometry,
  serializeCatalogGeometry,
  settleCatalogGeometry,
  subdivideCatalogGeometry,
  trimCatalogGeometry,
  transferCatalogWeights,
  unionCatalogGeometryComponents,
  restoreCatalogGeometrySnapshot,
  sculptCatalogGeometry,
  whenCatalogTopologyReady,
} from './catalogSourceMesh.js';
import { applyRockPbrTexture } from './rockPbrTextures.js';
import {
  applyCatalogGeologySurface,
  disposeCatalogC7SurfaceCache,
} from './c7CatalogSurface.js';
import { createRockMeadowGrassPreview } from './rockGrassPreview.js';

import { tickHeldBrush } from './heldBrush.js';
import { createResizeHandles, createHandleResizeDrag } from './resizeHandles.js';
import { createViewportAxes } from './viewportAxes.js';

function axisVector(axis) { return axis === 'x' ? [1, 0, 0] : axis === 'z' ? [0, 0, 1] : [0, 1, 0]; }

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function triangleCount(geometry) {
  return Math.round((geometry.index?.count ?? geometry.getAttribute('position')?.count ?? 0) / 3);
}

function formatBounds(box) {
  const size = box.getSize(new THREE.Vector3());
  return `${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)} m`;
}

export async function createRockGenerationEngine({ mount, store }) {
  const renderer = createLabRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  mount.appendChild(renderer.domElement);
  await whenRendererReady(renderer);
  await whenCatalogTopologyReady();
  const catalogLoader = createCatalogSourceLoader(renderer);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#b8cce0');
  scene.fog = new THREE.Fog('#b8cce0', 28, 82);
  const groundFieldPass = createEnvironmentGroundFieldPass({ renderer, scene, resolution: 512 });
  const camera = new THREE.PerspectiveCamera(
    42,
    window.innerWidth / window.innerHeight,
    0.05,
    200,
  );
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.065;
  controls.maxPolarAngle = Math.PI - 0.01;
  controls.minDistance = 1.2;
  controls.maxDistance = 80;

  let navigationMode = 'rotate';
  let grabMetrics = null;
  let latestGrabInputTime = null;
  let orbitOverride = false;
  let comparison = null;
  let thumbnailKey = null;
  let originalTemplate = null;
  const sculptOptions = {
    resizeProportional: true,
    protectDeformation: false,
    rotateAxis: 'y',
    mirrorAxis: 'x',
    fractureAxis: 'surface',
    fractureGap: 0.075,
    decimatePercent: 50,
    remeshTarget: 0,
    preventFaceFlips: false,
    resizeAxis: 'uniform',
    drillDepth: 0.75,
    drillRoughness: 0.4,
    drillThrough: false,
    trimDepth: 0.25,
    enabled: false,
    radius: 0.5,
    strength: 0.35,
    tool: 'grab',
  };

  function setNavigationMode(mode = 'rotate') {
    navigationMode = mode;
    controls.mouseButtons.LEFT = sculptOptions.enabled && !orbitOverride && !comparison
      ? null
      : mode === 'pan'
        ? THREE.MOUSE.PAN
        : mode === 'zoom' ? THREE.MOUSE.DOLLY : THREE.MOUSE.ROTATE;
  }
  setNavigationMode();

  const world = new THREE.Group();
  world.name = 'ToonLab procedural rock generation stage';
  scene.add(world);

  const sculptCursor = new THREE.Mesh(
    new THREE.RingGeometry(0.88, 1, 64),
    new THREE.MeshBasicMaterial({
      color: '#ffb74d',
      depthTest: false,
      opacity: 0.9,
      side: THREE.DoubleSide,
      transparent: true,
    }),
  );
  sculptCursor.name = 'ToonLab sculpt brush cursor';
  sculptCursor.renderOrder = 1000;
  sculptCursor.visible = false;
  scene.add(sculptCursor);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(32, 64),
    new THREE.MeshStandardMaterial({ color: '#7f9278', roughness: 1 }),
  );
  floor.name = 'ToonLab generation floor';
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.025;
  floor.receiveShadow = true;
  scene.add(floor);

  const grid = new THREE.GridHelper(64, 64, '#718091', '#96a6b1');
  grid.position.y = -0.012;
  grid.material.opacity = 0.22;
  grid.material.transparent = true;
  scene.add(grid);

  const sun = new THREE.DirectionalLight('#fff0d2', 3.2);
  sun.position.set(10, 16, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -16;
  sun.shadow.camera.right = 16;
  sun.shadow.camera.top = 16;
  sun.shadow.camera.bottom = -16;
  sun.shadow.camera.near = 0.1;
  sun.shadow.camera.far = 60;
  const hemisphere = new THREE.HemisphereLight('#dceaff', '#566b59', 1.25);
  const fill = new THREE.AmbientLight('#9db7d2', 0.32);
  scene.add(sun, hemisphere, fill);

  let model = null;
  let modelDisposer = null;
  let previewGrass = null;
  let previewGrassToken = 0;
  let catalogSource = null;
  let catalogVariation = null;
  let remeshTimer = null;
  let disposed = false;
  let buildToken = 0;
  let requestedRevision = -1;
  let requestedViewRevision = -1;
  const deferredDisposals = new Set();
  const pointer = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  const cameraFacingPlane = new THREE.Plane();
  let sculptGesture = null;
  let activeSelection = null;
  let measurementStart = null;
  let catalogPlacement = null;
  let resizeMeshIndex = 0;
  const resizeHandles = createResizeHandles({ canvas: renderer.domElement, camera, onStart: beginHandleResize });
  const viewportAxes = createViewportAxes({ camera, scene });

  function resizeTarget() {
    if (!sculptOptions.enabled || sculptOptions.tool !== 'resize' || comparison || !catalogVariation) return null;
    const mesh = catalogVariation.meshes.find((entry) => entry.geometry === activeSelection?.geometry)
      ?? (catalogVariation.meshes[resizeMeshIndex]?.visible ? catalogVariation.meshes[resizeMeshIndex] : catalogVariation.previewMeshes[0]);
    return mesh ? { mesh, weights: activeSelection?.geometry === mesh.geometry ? activeSelection.weights : null } : null;
  }

  function beginHandleResize(event, { mesh, weights, bounds, handle }) {
    if (sculptGesture) return;
    pointerMoves.clear();
    mesh.updateWorldMatrix(true, false);
    const resizeDrag = createHandleResizeDrag({ bounds, handle, matrixWorld: mesh.matrixWorld,
      cameraDirection: camera.getWorldDirection(new THREE.Vector3()), ray: eventRay(event), proportional: sculptOptions.resizeProportional });
    if (!resizeDrag) {
      store.actions.adoptEngineState({ status: 'Orbit slightly to see and drag this handle from the side.' });
      return;
    }
    const geometry = mesh.geometry;
    sculptGesture = { tool: 'resize', before: geometrySnapshot(geometry), geometry, mesh,
      meshIndex: catalogVariation.meshes.indexOf(mesh), pointerId: event.pointerId, resizeDrag,
      weights: weights ?? new Float32Array(geometry.attributes.position.count).fill(1) };
    renderer.domElement.focus({ preventScroll: true });
    renderer.domElement.setPointerCapture?.(event.pointerId);
    store.actions.adoptEngineState({ status: 'Drag the handle; the opposite side stays fixed.' });
  }

  function eventRay(event) {
    const bounds = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((event.clientX - bounds.left) / Math.max(bounds.width, 1)) * 2 - 1,
      -(((event.clientY - bounds.top) / Math.max(bounds.height, 1)) * 2 - 1),
    );
    raycaster.setFromCamera(pointer, camera);
    return raycaster.ray;
  }

  function catalogHit(event) {
    if (!catalogVariation?.previewMeshes?.length) return null;
    eventRay(event);
    return raycaster.intersectObjects(catalogVariation.previewMeshes, false)[0] ?? null;
  }

  function localHitData(hit) {
    const mesh = hit.object;
    const point = mesh.worldToLocal(hit.point.clone());
    const normal = (hit.face?.normal ?? new THREE.Vector3(0, 1, 0)).clone().normalize();
    return { mesh, normal, point };
  }

  function drillCutFromHit(hit, sequenceOffset = 0) {
    const { mesh, normal, point } = localHitData(hit);
    const state = store.getState();
    const sequence = (state.document.reference?.meshCuts?.length ?? 0) + sequenceOffset + 1;
    return {
      kernel: 'manifold',
      depth: sculptOptions.drillDepth,
      meshIndex: catalogVariation.meshes.indexOf(mesh),
      normal: normal.toArray(),
      point: point.toArray(),
      radius: sculptOptions.radius,
      roughness: sculptOptions.drillRoughness,
      seed: (state.document.seed ^ Math.imul(sequence, 0x9e3779b1)) >>> 0,
      through: sculptOptions.drillThrough,
    };
  }

  function updateSculptCursor(hit) {
    if (!sculptOptions.enabled || !hit) {
      sculptCursor.visible = false;
      return;
    }
    const localNormal = (hit.face?.normal ?? new THREE.Vector3(0, 1, 0)).clone();
    const worldNormal = localNormal.transformDirection(hit.object.matrixWorld).normalize();
    const worldScale = hit.object.getWorldScale(new THREE.Vector3());
    const radius = sculptOptions.radius * ((worldScale.x + worldScale.y + worldScale.z) / 3);
    sculptCursor.position.copy(hit.point).addScaledVector(worldNormal, Math.max(radius * 0.006, 0.001));
    sculptCursor.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), worldNormal);
    sculptCursor.scale.setScalar(radius);
    sculptCursor.visible = true;
  }

  function geometrySnapshot(geometry) {
    const position = geometry.getAttribute('position');
    if (!position.isInterleavedBufferAttribute && !position.normalized && position.itemSize === 3) return Float32Array.from(position.array);
    const values = new Float32Array(position.count * 3);
    for (let index = 0; index < position.count; index += 1) {
      values[index * 3] = position.getX(index);
      values[(index * 3) + 1] = position.getY(index);
      values[(index * 3) + 2] = position.getZ(index);
    }
    return values;
  }

  function applySculptStamp(hit) {
    if (!sculptGesture || hit.object !== sculptGesture.mesh) return 0;
    const { normal, point } = localHitData(hit);
    // Flatten owns one plane for the entire gesture. Recomputing the plane at
    // every pointer sample merely follows the existing surface and makes the
    // tool indistinguishable from Smooth instead of cutting a real plateau.
    const stampNormal = sculptOptions.tool === 'flatten' ? sculptGesture.normal : normal;
    const stampPoint = sculptOptions.tool === 'flatten' ? sculptGesture.point : point;
    const touched = sculptCatalogGeometry(sculptGesture.geometry, {
      allowLargeDeformation: !sculptGesture.protectDeformation,
      maskWeights: sculptGesture.geometry.getAttribute('sculptMask')?.array ?? null,
      normal: stampNormal.toArray(),
      point: point.toArray(),
      planePoint: stampPoint.toArray(),
      radius: sculptOptions.radius,
      referenceSnapshot: sculptGesture.before,
      seedIndices: hit.face ? [hit.face.a, hit.face.b, hit.face.c] : [],
      strength: sculptOptions.strength,
      tool: sculptOptions.tool,
    });
    sculptGesture.lastPoint = point;
    sculptGesture.lastStampTime = performance.now();
    sculptGesture.stamps = (sculptGesture.stamps ?? 0) + 1;
    renderer.domElement.dataset.sculptStamps = String(sculptGesture.stamps);
    if (!touched) store.actions.adoptEngineState({ status: 'Brush made no change: outside the brush, masked, or invalid geometry. Increase the brush area or refine the mesh if needed.' });
    return touched;
  }

  function componentWeights(geometry, hit, point) {
    return createCatalogSculptWeights(geometry, {
      point: point.toArray(),
      radius: sculptOptions.radius,
      rigidConnectedComponent: true,
      seedIndices: hit.face ? [hit.face.a, hit.face.b, hit.face.c] : [],
      seedWeight: 1,
    });
  }

  function applyMaskStamp(hit) {
    const { mesh, point } = localHitData(hit);
    const geometry = mesh.geometry;
    const stamp = createCatalogSculptWeights(geometry, {
      point: point.toArray(),
      radius: sculptOptions.radius,
      seedIndices: hit.face ? [hit.face.a, hit.face.b, hit.face.c] : [],
      seedWeight: 1,
      topologyFalloff: 0.5,
      topologyRings: 3,
    });
    const mask = geometry.getAttribute('sculptMask')?.array ?? new Float32Array(stamp.length);
    let protectedCount = 0;
    for (let index = 0; index < mask.length; index += 1) {
      mask[index] = Math.max(mask[index], stamp[index]);
      if (mask[index] > 0) protectedCount += 1;
    }
    geometry.setAttribute('sculptMask', new THREE.Float32BufferAttribute(mask, 1));
    store.actions.adoptEngineState({ maskSummary: `${protectedCount.toLocaleString()} protected vertices` });
    return { point, protectedCount };
  }

  function commitTopologyGeometry(mesh, geometry, status) {
    if (!geometry || geometry === mesh.geometry) return false;
    const previous = mesh.geometry;
    inheritCatalogEditState(previous, geometry);
    mesh.geometry = geometry;
    const meshIndex = catalogVariation.meshes.indexOf(mesh);
    const snapshot = serializeCatalogGeometry(geometry, meshIndex);
    const snapshots = [snapshot].filter(Boolean);
    const committed = store.actions.commitCatalogMeshSnapshots(snapshots, status);
    if (committed) {
      previous.dispose();
      if (activeSelection?.geometry === previous) activeSelection = {
        geometry, weights: transferCatalogWeights(previous, geometry, activeSelection.weights),
      };
      measurementStart = null;
      resetCamera();
      return true;
    }
    mesh.geometry = previous;
    geometry.dispose();
    return false;
  }

  function runImmediateSculptTool(hit, geometry, mesh, point, normal) {
    const meshIndex = catalogVariation.meshes.indexOf(mesh);
    if (sculptOptions.tool === 'select') {
      const weights = componentWeights(geometry, hit, point);
      activeSelection = { geometry, weights };
      geometry.setAttribute('sculptSelection', new THREE.Float32BufferAttribute(weights, 1));
      const count = [...weights].filter((weight) => weight > 0).length;
      store.actions.adoptEngineState({ status: `Selected connected rock component · ${count.toLocaleString()} vertices.`, selectionSummary: `Component: ${count.toLocaleString()} vertices` });
      return true;
    }
    if (sculptOptions.tool === 'measure') {
      if (!measurementStart) {
        measurementStart = mesh.localToWorld(point.clone());
        store.actions.adoptEngineState({ status: 'Measure: choose the second point.' });
      } else {
        const end = mesh.localToWorld(point.clone());
        const distance = measurementStart.distanceTo(end);
        measurementStart = null;
        store.actions.adoptEngineState({ status: `Measured distance · ${distance.toFixed(3)} m.` });
      }
      return true;
    }
    if (sculptOptions.tool === 'fill') {
      store.actions.removeNearestCatalogMeshCut({ meshIndex, point: point.toArray() });
      return true;
    }
    if (!['trim', 'fracture', 'union', 'remesh', 'subdivide', 'decimate', 'mirror', 'settle'].includes(sculptOptions.tool)) return false;
    const selection = ['mirror', 'settle'].includes(sculptOptions.tool)
      ? activeSelection?.geometry === geometry ? activeSelection.weights : componentWeights(geometry, hit, point)
      : null;
    let replacement = null;
    let status = '';
    if (sculptOptions.tool === 'trim') {
      const cutPoint = point.clone().addScaledVector(normal, -sculptOptions.trimDepth);
      replacement = trimCatalogGeometry(geometry, { normal: normal.toArray(), point: cutPoint.toArray() });
      status = `Trimmed ${sculptOptions.trimDepth.toFixed(2)} m beneath the picked surface plane.`;
    } else if (sculptOptions.tool === 'fracture') {
      const fractureGuide = Math.abs(normal.y) < 0.9
        ? new THREE.Vector3(0, 1, 0)
        : new THREE.Vector3(1, 0, 0);
      const fractureNormal = new THREE.Vector3().crossVectors(normal, fractureGuide).normalize();
      if (sculptOptions.fractureAxis !== 'surface') fractureNormal.set(...axisVector(sculptOptions.fractureAxis));
      replacement = fractureCatalogGeometry(geometry, {
        normal: fractureNormal.toArray(),
        point: point.toArray(),
        width: sculptOptions.fractureGap,
      });
      status = 'Split the rock with a persistent fracture plane.';
    } else if (sculptOptions.tool === 'union') {
      replacement = unionCatalogGeometryComponents(geometry);
      status = 'Boolean-unioned the disconnected shells in this mesh.';
    } else if (sculptOptions.tool === 'remesh') {
      replacement = remeshCatalogGeometry(geometry, { targetTriangles: sculptOptions.remeshTarget || null });
      status = 'Remeshed toward the requested triangle count and relaxed the topology.';
    } else if (sculptOptions.tool === 'subdivide') {
      replacement = subdivideCatalogGeometry(geometry);
      status = 'Subdivided every triangle into four editable faces.';
    } else if (sculptOptions.tool === 'decimate') {
      replacement = decimateCatalogGeometry(geometry, sculptOptions.decimatePercent / 100);
      status = `Decimated toward ${sculptOptions.decimatePercent}% of the original triangle count.`;
    } else if (sculptOptions.tool === 'mirror') {
      replacement = geometry.clone();
      mirrorCatalogGeometry(replacement, selection, sculptOptions.mirrorAxis);
      status = `Mirrored the selected connected component across its local ${sculptOptions.mirrorAxis.toUpperCase()} axis.`;
    } else if (sculptOptions.tool === 'settle') {
      replacement = geometry.clone();
      settleCatalogGeometry(replacement, selection, { worldMatrix: mesh.matrixWorld });
      status = 'Settled the selected connected component onto local ground level.';
    } else {
      return false;
    }
    if (!commitTopologyGeometry(mesh, replacement, status)) {
      store.actions.adoptEngineState({ status: sculptOptions.tool === 'union'
        ? 'Union needs multiple closed disconnected shells in the same mesh; no valid union was produced.'
        : `${sculptOptions.tool} could not produce valid geometry. The rock is unchanged.` });
    }
    return true;
  }

  function beginSculpt(event) {
    const interactionStarted = performance.now();
    pointerMoves.clear();
    renderer.domElement.focus({ preventScroll: true });
    if (event.altKey || orbitOverride) {
      controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
      return;
    }
    if (comparison) return;
    if (!sculptOptions.enabled || event.button !== 0 || !catalogVariation) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const hit = catalogHit(event);
    updateSculptCursor(hit);
    if (!hit) return;
    const { mesh, normal, point } = localHitData(hit);
    const geometry = mesh.geometry;
    const position = geometry.getAttribute('position');
    if (!position) return;
    if (sculptOptions.tool === 'resize') {
      resizeMeshIndex = catalogVariation.meshes.indexOf(mesh);
      activeSelection = { geometry, weights: componentWeights(geometry, hit, point) };
      store.actions.adoptEngineState({ selectionSummary: 'Selected component — drag its resize handles.', status: 'Drag a side or corner handle to resize this component.' });
      return;
    }
    if (sculptOptions.tool !== 'mask' && runImmediateSculptTool(hit, geometry, mesh, point, normal)) return;
    const before = geometrySnapshot(geometry);
    if (sculptOptions.tool === 'mask') {
      const { protectedCount } = applyMaskStamp(hit);
      sculptGesture = {
        before,
        geometry,
        lastPoint: point,
        mesh,
        meshIndex: catalogVariation.meshes.indexOf(mesh),
        normal,
        point,
        pointerId: event.pointerId,
        tool: sculptOptions.tool,
      };
      renderer.domElement.setPointerCapture?.(event.pointerId);
      store.actions.adoptEngineState({ status: `Painting protected mask · ${protectedCount.toLocaleString()} vertices…` });
      return;
    }
    sculptGesture = {
      before,
      protectDeformation: Boolean(sculptOptions.protectDeformation),
      pointer: { clientX: event.clientX, clientY: event.clientY },
      geometry,
      lastPoint: point,
      mesh,
      meshIndex: catalogVariation.meshes.indexOf(mesh),
      normal,
      point,
      pointerId: event.pointerId,
      tool: sculptOptions.tool,
    };
    renderer.domElement.setPointerCapture?.(event.pointerId);
    if (sculptOptions.tool === 'drill') {
      const cut = drillCutFromHit(hit);
      const drilledGeometry = drillCatalogGeometry(geometry, cut);
      if (!drilledGeometry) {
        sculptGesture = null;
        renderer.domElement.releasePointerCapture?.(event.pointerId);
        store.actions.adoptEngineState({ status: 'Drill rejected: this surface could not produce a valid Boolean cut.' });
        return;
      }
      mesh.geometry = drilledGeometry;
      sculptGesture.cut = cut;
      sculptGesture.cuts = [cut];
      sculptGesture.drilledGeometry = drilledGeometry;
      sculptGesture.originalGeometry = geometry;
    } else if (sculptOptions.tool === 'grab' || sculptOptions.tool === 'resize' || sculptOptions.tool === 'rotate') {
      sculptGesture.preventFaceFlips = Boolean(sculptOptions.preventFaceFlips);
      sculptGesture.resizeAxis = sculptOptions.resizeAxis;
      sculptGesture.rotateAxis = sculptOptions.rotateAxis;
      const cameraNormal = camera.getWorldDirection(new THREE.Vector3());
      cameraFacingPlane.setFromNormalAndCoplanarPoint(cameraNormal, hit.point);
      sculptGesture.dragStartWorld = hit.point.clone();
      sculptGesture.dragStartClientY = event.clientY;
      sculptGesture.dragStartClientX = event.clientX;
      sculptGesture.weights = activeSelection?.geometry === geometry
        ? activeSelection.weights
        : createCatalogSculptWeights(geometry, {
            point: point.toArray(),
            radius: sculptOptions.radius,
            rigidConnectedComponent: sculptOptions.tool === 'resize' || sculptOptions.tool === 'rotate',
            rigidCoveredComponent: sculptOptions.strength >= 0.75,
            seedIndices: hit.face ? [hit.face.a, hit.face.b, hit.face.c] : [],
            seedWeight: 1,
            topologyFalloff: 0.62,
            topologyRings: 4,
          });
      if (sculptOptions.tool === 'grab') {
        const mask = geometry.getAttribute('sculptMask')?.array;
        sculptGesture.weights = Float32Array.from(sculptGesture.weights, (weight, index) => (
          weight * (1 - (mask?.[index] ?? 0))
        ));
        sculptGesture.grabSession = createCatalogGrabSession(geometry, {
          before, weights: sculptGesture.weights, strength: sculptOptions.strength,
          preventFaceFlips: sculptGesture.preventFaceFlips,
        });
        grabMetrics = { prepareMs: performance.now() - interactionStarted, samples: 0, maxUpdateMs: 0, maxInputToRenderMs: 0 };
        latestGrabInputTime = null;
      }
    } else {
      applySculptStamp(hit);
    }
    store.actions.adoptEngineState({ status: `Sculpting with ${sculptOptions.tool}…` });
  }

  function moveSculpt(event) {
    if (orbitOverride || comparison) { sculptCursor.visible = false; return; }
    if (!sculptOptions.enabled) return;
    if (!sculptGesture) {
      updateSculptCursor(catalogHit(event));
      return;
    }
    if (event.pointerId !== sculptGesture.pointerId) return;
    sculptGesture.pointer = { clientX: event.clientX, clientY: event.clientY };
    event.preventDefault();
    event.stopImmediatePropagation();
    if (sculptGesture.tool === 'mask') {
      const hit = catalogHit(event);
      updateSculptCursor(hit);
      if (!hit || hit.object !== sculptGesture.mesh) return;
      const point = hit.object.worldToLocal(hit.point.clone());
      if (point.distanceTo(sculptGesture.lastPoint) < sculptOptions.radius * 0.12) return;
      const { protectedCount } = applyMaskStamp(hit);
      sculptGesture.lastPoint = point;
      store.actions.adoptEngineState({ status: `Painting protected mask · ${protectedCount.toLocaleString()} vertices…` });
      return;
    }
    if (sculptOptions.tool === 'drill') {
      const hit = catalogHit(event);
      updateSculptCursor(hit);
      if (!hit || hit.object !== sculptGesture.mesh) return;
      const { point } = localHitData(hit);
      if (point.distanceTo(sculptGesture.lastPoint) < sculptOptions.radius * 0.42) return;
      const cut = drillCutFromHit(hit, sculptGesture.cuts.length);
      const currentGeometry = sculptGesture.mesh.geometry;
      const drilledGeometry = drillCatalogGeometry(currentGeometry, cut);
      if (!drilledGeometry) return;
      if (currentGeometry !== sculptGesture.originalGeometry) currentGeometry.dispose();
      sculptGesture.mesh.geometry = drilledGeometry;
      sculptGesture.drilledGeometry = drilledGeometry;
      sculptGesture.cuts.push(cut);
      sculptGesture.lastPoint = point;
      store.actions.adoptEngineState({ status: `Carving drill stroke · ${sculptGesture.cuts.length} stamps…` });
      return;
    }
    if (sculptOptions.tool === 'grab') {
      const intersection = eventRay(event).intersectPlane(cameraFacingPlane, new THREE.Vector3());
      if (!intersection) return;
      const mesh = sculptGesture.mesh;
      const localStart = mesh.worldToLocal(sculptGesture.dragStartWorld.clone());
      const localEnd = mesh.worldToLocal(intersection.clone());
      const delta = localEnd.sub(localStart);
      const updateStarted = performance.now();
      sculptGesture.grabSession.move(delta.toArray());
      if (sculptGesture.grabSession.appliedScale < 1) store.actions.adoptEngineState({
        status: 'Move limited by Prevent face folding. Turn it off for unrestricted dragging.',
      });
      grabMetrics.samples += 1;
      grabMetrics.maxUpdateMs = Math.max(grabMetrics.maxUpdateMs, performance.now() - updateStarted);
      latestGrabInputTime = event.timeStamp;
      return;
    }
    if (sculptOptions.tool === 'resize') {
      const scales = sculptGesture.resizeDrag?.sample(eventRay(event));
      if (!scales) return;
      const touched = resizeCatalogGeometry(sculptGesture.geometry, { before: sculptGesture.before,
        scales, pivot: sculptGesture.resizeDrag.pivot, weights: sculptGesture.weights });
      renderer.domElement.dataset.resizeMetrics = JSON.stringify({ scales, touched, meshIndex: sculptGesture.meshIndex,
        meshes: catalogVariation.meshes.length, vertices: sculptGesture.geometry.attributes.position.count });
      store.actions.adoptEngineState({ status: touched ? 'Resizing from the handle; opposite side fixed.' : 'Cannot resize to a collapsed or invalid shape.' });
      return;
    }
    if (sculptOptions.tool === 'rotate') {
      const angle = (event.clientX - sculptGesture.dragStartClientX) / 100;
      rotateCatalogGeometry(sculptGesture.geometry, {
        angle,
        axis: axisVector(sculptGesture.rotateAxis),
        before: sculptGesture.before,
        weights: sculptGesture.weights,
      });
      store.actions.adoptEngineState({ status: `Rotating selected rock/tier · ${THREE.MathUtils.radToDeg(angle).toFixed(1)}°…` });
      return;
    }
    const hit = catalogHit(event);
    updateSculptCursor(hit);
    if (!hit || hit.object !== sculptGesture.mesh) return;
    const point = hit.object.worldToLocal(hit.point.clone());
    if (point.distanceTo(sculptGesture.lastPoint) < sculptOptions.radius * 0.12) return;
    applySculptStamp(hit);
  }

  function finishSculpt(event) {
    pointerMoves.flush();
    if (!sculptGesture || event.pointerId !== sculptGesture.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const gesture = sculptGesture;
    sculptGesture = null;
    renderer.domElement.releasePointerCapture?.(event.pointerId);
    // Submit the final pointer position before auditing/persisting the stroke.
    // Dense snapshot serialization must not hold the last visible drag frame.
    if (gesture.grabSession) renderViewport();
    if (gesture.tool === 'mask') {
      commitTopologyGeometry(gesture.mesh, gesture.geometry.clone(), 'Mask painted. Protected vertices will ignore deformation brushes.');
      return;
    }
    if (gesture.tool === 'drill') {
      // Save the exact new topology once. Re-running every historical Boolean
      // after each edit is expensive, and changing kernels would invalidate
      // vertex-addressed edits in old documents. Legacy cut records continue
      // to replay with their original splitter; new cuts persist snapshots.
      const committed = store.actions.commitCatalogMeshSnapshots(
        [serializeCatalogGeometry(gesture.drilledGeometry, gesture.meshIndex)],
        `Drilled ${gesture.cuts.length} stamp${gesture.cuts.length === 1 ? '' : 's'}; saved the exact cut mesh.`,
      );
      if (committed) {
        gesture.originalGeometry.dispose();
      } else {
        gesture.mesh.geometry = gesture.originalGeometry;
        gesture.drilledGeometry.dispose();
      }
      return;
    }
    // Judge this gesture against the surface the user actually started from.
    // Comparing against the pristine variation makes later valid strokes fail
    // cumulative stretch thresholds and visibly snap back on pointer-up.
    const audit = auditCatalogSculptGeometry(gesture.geometry, gesture.before, {
      allowLargeDeformation: ['grab', 'resize', 'rotate'].includes(gesture.tool) || !gesture.protectDeformation,
      preventFaceFlips: gesture.tool === 'grab' && gesture.preventFaceFlips,
    });
    if (!audit.ok) {
      restoreCatalogGeometrySnapshot(gesture.geometry, gesture.before);
      store.actions.adoptEngineState({ status: `Sculpt rejected: ${audit.reason}.` });
      return;
    }
    gesture.grabSession?.finish();
    const position = gesture.geometry.getAttribute('position');
    const deltas = [];
    for (let index = 0; index < position.count; index += 1) {
      const dx = position.getX(index) - gesture.before[index * 3];
      const dy = position.getY(index) - gesture.before[(index * 3) + 1];
      const dz = position.getZ(index) - gesture.before[(index * 3) + 2];
      if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) < 1e-7) continue;
      deltas.push([
        index,
        Math.round(dx * 1e6) / 1e6,
        Math.round(dy * 1e6) / 1e6,
        Math.round(dz * 1e6) / 1e6,
      ]);
    }
    if (deltas.length > 0) {
      const committed = store.actions.commitCatalogMeshEdit({
        deltas,
        meshIndex: gesture.meshIndex,
      });
      if (!committed) {
        if (gesture.grabSession) gesture.grabSession.rollback();
        else restoreCatalogGeometrySnapshot(gesture.geometry, gesture.before);
      }
    } else {
      store.actions.adoptEngineState({ status: 'No vertices were inside the sculpt brush.' });
    }
  }

  const pointerMoves = createFramePointerQueue(moveSculpt);
  function queuePointerMove(event) {
    // Paint/cut samples describe a path and must not be dropped. Transforms
    // are absolute from stroke-start, so only the latest sample matters.
    if (sculptGesture && !['grab', 'resize', 'rotate'].includes(sculptGesture.tool)) { moveSculpt(event); return; }
    if (sculptGesture) { event.preventDefault(); event.stopImmediatePropagation(); }
    if (sculptGesture?.tool === 'grab' && !sculptGesture.firstMoveApplied) {
      sculptGesture.firstMoveApplied = true;
      moveSculpt(event);
      return;
    }
    pointerMoves.enqueue(event);
  }
  renderer.domElement.addEventListener('pointerdown', beginSculpt, { capture: true });
  renderer.domElement.addEventListener('pointermove', queuePointerMove, { capture: true });
  renderer.domElement.addEventListener('pointerup', finishSculpt, { capture: true });
  renderer.domElement.addEventListener('pointercancel', finishSculpt, { capture: true });

  function retireModel(disposer) {
    if (!disposer) return;
    const record = { disposer, timer: null };
    record.timer = window.setTimeout(() => {
      deferredDisposals.delete(record);
      disposer();
    }, 250);
    deferredDisposals.add(record);
  }

  function disposePreviewGrass({ immediate = false } = {}) {
    previewGrassToken += 1;
    if (!previewGrass) return;
    const retiringGrass = previewGrass;
    world.remove(retiringGrass);
    if (immediate) retiringGrass.dispose?.();
    else retireModel(() => retiringGrass.dispose?.());
    previewGrass = null;
  }

  async function rebuildPreviewGrass(options = store.getState().grassPreview) {
    disposePreviewGrass();
    const token = ++previewGrassToken;
    model?.traverse((object) => {
      if (object.isMesh) object.userData.groundFieldWrite = Boolean(options?.enabled);
    });
    groundFieldPass.invalidate();
    groundFieldPass.update();
    if (!options?.enabled || !model || !catalogVariation) {
      store.actions.adoptEngineState({ grassPreviewStats: { blades: 0, clumps: 0 } });
      return { blades: 0, clumps: 0 };
    }

    const state = store.getState();
    const field = await createRockMeadowGrassPreview(
      model,
      options,
      (state.document.seed ^ (state.document.reference?.variationSeed ?? 0x9e3779b9)) >>> 0,
    );
    if (disposed || token !== previewGrassToken || model !== catalogVariation?.root) {
      field?.dispose?.();
      return { blades: 0, clumps: 0 };
    }
    previewGrass = field;
    if (previewGrass) {
      world.add(previewGrass);
      previewGrass.updateLods?.(camera);
    }
    const stats = {
      blades: previewGrass?.bladeCount ?? 0,
      clumps: previewGrass?.instanceCount ?? 0,
    };
    store.actions.adoptEngineState({ grassPreviewStats: stats });
    return stats;
  }

  function disposeModel({ immediate = false } = {}) {
    if (!model) return;
    disposePreviewGrass({ immediate });
    world.remove(model);
    if (immediate) modelDisposer?.();
    else retireModel(modelDisposer);
    model = null;
    modelDisposer = null;
    catalogVariation = null;
  }

  function resetCamera(selectionOnly = false) {
    if (!model) {
      controls.target.set(0, 1, 0);
      camera.position.set(6, 4.5, 7.5);
      controls.update();
      return;
    }
    const bounds = !comparison && catalogVariation ? catalogEditableBounds(catalogVariation)
      : new THREE.Box3().setFromObject(comparison?.root ?? model, true);
    if (selectionOnly === true && activeSelection && !comparison) {
      const mesh = catalogVariation?.meshes.find((entry) => entry.geometry === activeSelection.geometry);
      if (mesh) {
        const selected = new THREE.Box3();
        activeSelection.weights.forEach((weight, index) => {
          if (weight > 0) selected.expandByPoint(new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, index).applyMatrix4(mesh.matrixWorld));
        });
        if (!selected.isEmpty()) bounds.copy(selected);
      }
    }
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const radius = Math.max(size.length() * 0.5, 0.1);
    const halfVerticalFov = THREE.MathUtils.degToRad(camera.fov * 0.5);
    const halfHorizontalFov = Math.atan(Math.tan(halfVerticalFov) * camera.aspect);
    const fitFov = Math.min(halfVerticalFov, halfHorizontalFov);
    const fitDistance = (radius / Math.sin(fitFov)) * 1.18;
    const viewDirection = new THREE.Vector3(1.28, 0.82, 1.5).normalize();
    controls.target.copy(center);
    camera.position.copy(center).addScaledVector(viewDirection, fitDistance);
    controls.minDistance = Math.max(radius * 0.2, 0.05);
    controls.maxDistance = Math.max(radius * 20, 80);
    camera.near = Math.max(radius / 100, 0.02);
    camera.far = Math.max(radius * 30, 100);
    camera.updateProjectionMatrix();
    // The Gallery spans hand-sized fragments through mountain backdrops. A
    // fixed 28-82 m fog range turns the large end into a sky-colored blank,
    // and the fixed 16 m shadow frustum clips its lighting. Keep the reviewed
    // small-rock rig unchanged, then expand both ranges from metre bounds.
    scene.fog.near = Math.max(28, radius * 3);
    scene.fog.far = Math.max(82, radius * 10);
    const shadowExtent = Math.max(16, radius * 3);
    sun.shadow.camera.left = -shadowExtent;
    sun.shadow.camera.right = shadowExtent;
    sun.shadow.camera.top = shadowExtent;
    sun.shadow.camera.bottom = -shadowExtent;
    sun.shadow.camera.far = Math.max(60, radius * 8);
    sun.shadow.camera.updateProjectionMatrix();
    controls.update();
  }

  async function buildCatalogModel(entry, state, started, token, reframe) {
    let source = catalogSource;
    if (source?.entry.id !== entry.id
      || source?.entry.sourceContentHash !== entry.sourceContentHash
      || source?.entry.admissionManifestFingerprint !== entry.admissionManifestFingerprint) {
      const loaded = await loadCatalogSource(entry, catalogLoader.loader);
      if (disposed || token !== buildToken) {
        loaded.dispose();
        return;
      }
      disposeModel();
      catalogSource?.dispose();
      catalogSource = loaded;
      source = loaded;
    }
    if (disposed || token !== buildToken) return;

    const geologySurfacePackage = state.document.reference?.surfacePackage;
    const usesGeologySurface = state.document.style === 'call_me_sensei'
      && [
        'toonlab/c7-geology-surface',
        'toonlab/c8-first12-geology-surface',
        'toonlab/c8-first100-geology-surface',
      ]
        .includes(geologySurfacePackage?.schema);
    const nextVariation = createCatalogVariation(source, {
      meshCuts: state.document.reference?.meshCuts ?? [],
      meshEdits: state.document.reference?.meshEdits ?? [],
      meshOperationOrder: state.document.reference?.meshOperationOrder ?? null,
      meshSnapshots: state.document.reference?.meshSnapshots ?? [],
      preserveSourceMaterial: state.document.style === 'call_me_sensei' && !usesGeologySurface,
      seed: state.document.reference?.variationSeed ?? state.document.seed,
      strength: state.document.reference?.variation ?? 0.3,
      variationSettings: state.document.reference?.variationSettings ?? {},
      surface: state.document.surface,
      surfaceMode: usesGeologySurface ? 'source' : state.document.reference?.surfaceMode ?? 'source',
    });
    const sourceBounds = catalogEditableBounds(nextVariation);
    const sourceDimensions = sourceBounds.getSize(new THREE.Vector3());
    const geologySurface = usesGeologySurface
      ? await applyCatalogGeologySurface(nextVariation.root, geologySurfacePackage, {
        depth: sourceDimensions.z,
        height: sourceDimensions.y,
        width: sourceDimensions.x,
      }, {
        materialConfigUrl: entry.materialConfigUrl,
        skyColor: scene.background,
      })
      : null;
    const disposePbrTexture = usesGeologySurface
      ? null
      : await applyRockPbrTexture(nextVariation.root, state.document.surface);
    if (disposed || token !== buildToken) {
      disposePbrTexture?.();
      geologySurface?.dispose();
      nextVariation.dispose();
      return;
    }
    if (entry.sourceMode === 'c8-custom-glb' && geologySurface) {
      store.actions.recordC8SurfaceReprojection?.({
        authoritySourceId: state.document.reference.authoritySourceId,
        documentRevision: state.docRevision,
        dimensionsMetres: [sourceDimensions.x, sourceDimensions.y, sourceDimensions.z],
        geology: geologySurfacePackage.geology,
        geometrySourceId: state.document.reference.geometrySourceId,
        mapResolution: geologySurfacePackage.mapResolution,
        projection: structuredClone(geologySurface.projection),
        seed: geologySurfacePackage.seed,
        sourceRevision: state.document.reference.sourceRevision,
        surfaceSourceId: state.document.reference.surfaceSourceId,
      });
    }
    const placementKey = JSON.stringify([entry.id, entry.sourceContentHash,
      state.document.reference?.variationSeed ?? state.document.seed,
      state.document.reference?.variation ?? 0.3]);
    if (catalogPlacement?.key !== placementKey) {
      const offset = catalogPreviewOffset(source, {
        seed: state.document.reference?.variationSeed ?? state.document.seed,
        strength: state.document.reference?.variation ?? 0.3,
      });
      catalogPlacement = { key: placementKey, offset };
    }
    nextVariation.root.position.copy(catalogPlacement.offset);
    nextVariation.root.name = state.document.name;
    nextVariation.root.updateWorldMatrix(true, true);
    const displayBounds = catalogEditableBounds(nextVariation);
    // Normal sculpt/surface rebuilds replace geometry objects, not selections.
    const sameSource = catalogVariation?.root.userData.toonlabCatalogVariation?.galleryId === entry.galleryId;
    for (let index = 0; index < nextVariation.meshes.length; index += 1) {
      const nextGeometry = nextVariation.meshes[index].geometry;
      const previous = sameSource ? catalogVariation?.meshes[index]?.geometry : null;
      if (previous && activeSelection?.geometry === previous) {
        activeSelection = { geometry: nextGeometry,
          weights: transferCatalogWeights(previous, nextGeometry, activeSelection.weights) };
      }
    }
    disposeModel();
    catalogVariation = nextVariation;
    model = nextVariation.root;
    modelDisposer = () => {
      disposePbrTexture?.();
      geologySurface?.dispose();
      nextVariation.dispose();
    };
    world.add(model);
    const grassStats = await rebuildPreviewGrass(state.grassPreview);

    store.actions.adoptEngineState({
      maskSummary: `${nextVariation.meshes.reduce((total, mesh) => total + [...(mesh.geometry.attributes.sculptMask?.array ?? [])].filter((weight) => weight > 0).length, 0).toLocaleString()} protected vertices`,
      selectionSummary: activeSelection ? `Component: ${[...activeSelection.weights].filter((weight) => weight > 0).length.toLocaleString()} vertices` : 'Selection: whole brush area',
      meshDimensions: { width: displayBounds.max.x - displayBounds.min.x, height: displayBounds.max.y - displayBounds.min.y, depth: displayBounds.max.z - displayBounds.min.z },
      meshStats: {
        bounds: formatBounds(displayBounds),
        milliseconds: Math.round(performance.now() - started),
        triangles: nextVariation.stats.triangles,
        vertices: nextVariation.stats.vertices,
      },
      status: `Loaded and decoded ${entry.label} ${entry.sourceMode === 'c8-custom-glb' ? 'content-bound rock control GLB' : 'Gallery GLB'} · ${Math.round(nextVariation.profile.strength * 100)}% bounded variation · ${(state.document.reference?.meshEdits?.length ?? 0).toLocaleString()} sculpt edit${state.document.reference?.meshEdits?.length === 1 ? '' : 's'} · ${(state.document.reference?.meshCuts?.length ?? 0).toLocaleString()} drill cut${state.document.reference?.meshCuts?.length === 1 ? '' : 's'}${((state.document.reference?.meshEdits?.length ?? 0) + (state.document.reference?.meshCuts?.length ?? 0)) > 0 ? ' · surface reprojected' : ''} · ${usesGeologySurface ? `Realistic ${geologySurfacePackage.geology ?? geologySurfacePackage.profileId} maps + Call Me Sensei shader · ${geologySurface.projection.scaleMetres.toFixed(2)} m ${geologySurface.projection.mode}` : state.document.surface.pbrTexturePreset !== 'none' ? `${state.document.surface.pbrTexturePreset} PBR texture` : state.document.reference?.surfaceMode === 'generated' ? 'editable surface' : 'source material'}${grassStats.clumps > 0 ? ` · ${grassStats.clumps.toLocaleString()} adaptive meadow clumps` : ''}.`,
    });
    if (reframe) resetCamera();
    const nextThumbnailKey = `${entry.id}:${state.document.style}:${JSON.stringify(state.document.surface)}:${JSON.stringify(geologySurfacePackage)}`;
    if (thumbnailKey !== nextThumbnailKey) {
      const original = createCatalogVariation(source, { strength: 0, preserveSourceMaterial: true,
        surface: state.document.surface, surfaceMode: usesGeologySurface ? 'source' : state.document.reference?.surfaceMode });
      const originalSize = new THREE.Box3().setFromObject(original.root, true).getSize(new THREE.Vector3());
      const originalSurface = usesGeologySurface ? await applyCatalogGeologySurface(original.root, geologySurfacePackage,
        { width: originalSize.x, height: originalSize.y, depth: originalSize.z }, { materialConfigUrl: entry.materialConfigUrl, skyColor: scene.background }) : null;
      const originalPbr = usesGeologySurface ? null : await applyRockPbrTexture(original.root, state.document.surface);
      const disposeOriginal = original.dispose.bind(original);
      original.dispose = () => { originalSurface?.dispose(); originalPbr?.(); disposeOriginal(); };
      if (disposed || token !== buildToken) { original.dispose(); return; }
      originalTemplate?.dispose(); originalTemplate = original;
      original.root.position.copy(model.position);
      if (original) {
        const thumbCamera = camera.clone();
        const bounds = new THREE.Box3().setFromObject(original.root, true);
        const radius = Math.max(bounds.getSize(new THREE.Vector3()).length() * 0.5, 0.1);
        const center = bounds.getCenter(new THREE.Vector3());
        thumbCamera.aspect = 1;
        thumbCamera.position.copy(center).addScaledVector(new THREE.Vector3(1.28, 0.82, 1.5).normalize(), radius * 3.5);
        thumbCamera.lookAt(center); thumbCamera.updateProjectionMatrix();
        const size = renderer.getSize(new THREE.Vector2());
        try {
          model.visible = false; world.add(original.root);
          renderer.setSize(128, 128, false); renderer.render(scene, thumbCamera);
          store.actions.adoptEngineState({ templateThumbnailUrl: renderer.domElement.toDataURL('image/png') });
          thumbnailKey = nextThumbnailKey;
        } catch (error) { console.warn('Template preview capture unavailable:', error.message); }
        finally { model.visible = true; world.remove(original.root); renderer.setSize(size.x, size.y, false); }
      }
    }
    document.body.dataset.meshTriangles = String(nextVariation.stats.triangles);
    document.body.dataset.meshResolution = 'source';
    document.body.dataset.previewAssetSource = 'toonlab-official-glb';
    if (entry.sourceMode === 'c8-custom-glb') {
      document.body.dataset.previewAssetSource = 'toonlab-c8-custom-glb';
    }
    document.body.dataset.modelReady = 'true';
  }

  function buildProceduralModel(state, started, reframe) {
    const geometry = meshDocument(state.document, {
      includeHelpers: false,
      resolution: state.document.meshing.previewResolution,
    });
    const bounds = geometry.boundingBox ?? new THREE.Box3().setFromBufferAttribute(
      geometry.getAttribute('position'),
    );
    const material = new THREE.MeshStandardMaterial({
      metalness: 0,
      roughness: 0.92,
      vertexColors: true,
    });
    material.name = 'ToonLab baked procedural rock preview';
    const nextMesh = new THREE.Mesh(geometry, material);
    nextMesh.name = state.document.name;
    nextMesh.position.set(
      -(bounds.min.x + bounds.max.x) * 0.5,
      -bounds.min.y,
      -(bounds.min.z + bounds.max.z) * 0.5,
    );
    nextMesh.castShadow = true;
    nextMesh.receiveShadow = true;
    disposeModel();
    model = nextMesh;
    modelDisposer = () => {
      geometry.dispose();
      material.dispose();
    };
    world.add(model);
    store.actions.adoptEngineState({
      meshStats: {
        bounds: formatBounds(bounds),
        milliseconds: Math.round(performance.now() - started),
        triangles: triangleCount(geometry),
        vertices: geometry.getAttribute('position').count,
      },
      status: `Generated ${state.document.name} at ${state.document.meshing.previewResolution} cells.`,
    });
    if (reframe) resetCamera();
    document.body.dataset.meshTriangles = String(triangleCount(geometry));
    document.body.dataset.meshResolution = String(state.document.meshing.previewResolution);
    document.body.dataset.previewAssetSource = 'toonlab-rockgen';
    document.body.dataset.modelReady = 'true';
  }

  async function remesh({ reframe = false } = {}) {
    if (disposed) return;
    const state = store.getState();
    const started = performance.now();
    const token = ++buildToken;
    document.body.dataset.modelReady = 'loading';
    try {
      const entry = state.document.reference?.sourceMode === 'c8-custom-mesh'
        ? createC8CustomMeshCatalogEntry(state.document.reference)
        : getRockVariationCatalogEntry(state.catalogSourceId ?? state.document.reference?.id);
      if (['mesh-template', 'c8-custom-mesh'].includes(state.document.reference?.sourceMode) && entry) {
        await buildCatalogModel(entry, state, started, token, reframe);
      } else {
        if (catalogSource) {
          disposeModel();
          catalogSource.dispose();
          catalogSource = null;
        }
        buildProceduralModel(state, started, reframe);
      }
    } catch (error) {
      if (token !== buildToken || disposed) return;
      console.error('Rock generation failed:', error);
      store.actions.adoptEngineState({ status: `Generation failed: ${error.message}` });
      document.body.dataset.modelReady = 'error';
    }
  }

  function scheduleRemesh(reframe = false) {
    setComparison(false);
    clearTimeout(remeshTimer);
    document.body.dataset.modelReady = 'loading';
    remeshTimer = setTimeout(() => { void remesh({ reframe }); }, 75);
  }

  const unsubscribe = store.subscribe(() => {
    const state = store.getState();
    if (state.docRevision === requestedRevision) return;
    requestedRevision = state.docRevision;
    // Invalidate the running async load/reprojection immediately; the debounce
    // must never leave an old build authorized against a newer document.
    buildToken += 1;
    const reframe = state.viewRevision !== requestedViewRevision;
    requestedViewRevision = state.viewRevision;
    scheduleRemesh(reframe);
  });

  function handleResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', handleResize);

  function finishActiveStroke() {
    if (sculptGesture) finishSculpt({ pointerId: sculptGesture.pointerId, preventDefault() {}, stopImmediatePropagation() {} });
  }
  function setComparison(enabled) {
    finishActiveStroke();
    if (comparison) { world.remove(comparison.root); comparison = null; }
    if (model) model.visible = true;
    if (enabled && originalTemplate && model) {
      comparison = originalTemplate;
      world.add(comparison.root); model.visible = false;
      sculptCursor.visible = false;
    }
    store.actions.adoptEngineState({ comparingOriginal: Boolean(comparison) });
    setNavigationMode(navigationMode);
  }
  const removeNavigation = installViewportNavigation({
    canvas: renderer.domElement, reset: () => resetCamera(), frame: () => resetCamera(true),
    finishStroke: finishActiveStroke,
    setOrbitOverride(enabled) { orbitOverride = enabled; setNavigationMode(navigationMode); },
    orbit(x, y) {
      const offset = camera.position.clone().sub(controls.target);
      const spherical = new THREE.Spherical().setFromVector3(offset);
      spherical.theta -= x * 0.08; spherical.phi = clamp(spherical.phi + y * 0.08, 0.01, Math.PI - 0.01);
      camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical)); controls.update();
    },
  });
  store.actions.registerCatalogRuntime({
    resizeDimensions(dimensions) {
      if (!catalogVariation || document.body.dataset.modelReady !== 'true') return false;
      return store.actions.commitCatalogMeshSnapshots(resizeCatalogMeshesToDimensions(catalogVariation.meshes, dimensions), 'Resized to target dimensions; base height, edits, and holes preserved.');
    },
    captureVariationBase() {
      if (!catalogVariation || document.body.dataset.modelReady !== 'true') return null;
      return catalogVariation.meshes.map((mesh, index) => serializeCatalogGeometry(mesh.geometry, index));
    },
    variationProfile() { return catalogVariation?.fullStrengthProfile; },
    validateVariation(reference) {
      if (!catalogSource) throw new Error('Wait for the template to finish loading.');
      const result = createCatalogVariation(catalogSource, { ...reference, seed: reference.variationSeed, strength: reference.variation });
      result.dispose();
    },
    fillHole({ meshIndex, point }) {
      const mesh = catalogVariation?.meshes[meshIndex];
      if (!mesh) return false;
      const filled = fillCatalogGeometry(mesh.geometry, point);
      if (!filled) {
        store.actions.adoptEngineState({ status: mesh.geometry.userData.toonlabFillPatches?.length
          ? 'This opening could not be filled without damaging the current mesh.'
          : 'No saved drill opening exists on this mesh.' });
        return false;
      }
      return commitTopologyGeometry(mesh, filled, 'Filled the opening while preserving later mesh edits.');
    },
    async exportGlb() {
      if (!catalogVariation?.root) throw new Error('The selected catalog GLB is still loading.');
      try {
        return await exportCatalogVariation(catalogVariation.root, renderer);
      } finally {
        handleResize();
      }
    },
    async setGrassPreview(options) {
      try {
        const stats = await rebuildPreviewGrass(options);
        store.actions.adoptEngineState({
          status: options?.enabled
            ? stats.clumps > 0
              ? `Previewing ${stats.clumps.toLocaleString()} meadow clumps (${stats.blades.toLocaleString()} blades) adapted to the rock surface.`
              : 'No upward-facing top area matches the meadow grass mask.'
            : 'Meadow grass preview hidden.',
        });
      } catch (error) {
        console.error('Rock meadow preview failed:', error);
        store.actions.adoptEngineState({ status: `Meadow preview failed: ${error.message}` });
      }
    },
  });

  function renderViewport() {
    renderer.render(scene, camera);
    if (grabMetrics && latestGrabInputTime !== null) {
      // Local diagnostic only: input to render submission, not GPU completion.
      grabMetrics.maxInputToRenderMs = Math.max(grabMetrics.maxInputToRenderMs, performance.now() - latestGrabInputTime);
      renderer.domElement.dataset.grabMetrics = JSON.stringify(grabMetrics);
      latestGrabInputTime = null;
    }
  }

  const clock = new THREE.Clock();
  function animate() {
    if (disposed) return;
    requestAnimationFrame(animate);
    controls.update();
    resizeHandles.update(resizeTarget());
    viewportAxes.update(['resize', 'rotate', 'mirror', 'fracture'].includes(sculptOptions.tool) && sculptOptions.enabled
      ? catalogVariation?.previewMeshes.find(mesh => mesh.geometry === activeSelection?.geometry) ?? catalogVariation?.previewMeshes[0]
      : null);
    // Airbrush-style buildup continues under a held pointer. Recast onto the
    // edited surface so repeated stamps follow the new geometry, not old hits.
    tickHeldBrush(sculptGesture, performance.now(), (pointer) => {
      const hit = catalogHit(pointer);
      if (hit?.object === sculptGesture.mesh) { updateSculptCursor(hit); applySculptStamp(hit); }
    });
    previewGrass?.update?.(clock.getDelta(), camera);
    renderViewport();
  }

  return {
    camera,
    setComparison,
    frameSelection: () => resetCamera(true),
    clearSculptMasks() {
      const snapshots = [];
      (catalogVariation?.meshes ?? []).forEach((mesh, meshIndex) => {
        if (!mesh.geometry.getAttribute('sculptMask')) return;
        mesh.geometry.deleteAttribute('sculptMask');
        snapshots.push(serializeCatalogGeometry(mesh.geometry, meshIndex));
      });
      if (snapshots.length) store.actions.commitCatalogMeshSnapshots(snapshots, 'Cleared all sculpt protection masks.');
      store.actions.adoptEngineState({ status: 'Cleared all sculpt protection masks.', maskSummary: 'No protected vertices' });
    },
    clearSculptSelection() {
      activeSelection = null;
      for (const mesh of catalogVariation?.meshes ?? []) mesh.geometry.deleteAttribute('sculptSelection');
      store.actions.adoptEngineState({ status: 'Cleared the connected-component selection.', selectionSummary: 'Selection: whole brush area' });
    },
    controls,
    dispose() {
      disposed = true;
      clearTimeout(remeshTimer);
      buildToken += 1;
      unsubscribe();
      pointerMoves.clear();
      removeNavigation();
      originalTemplate?.dispose(); originalTemplate = null; comparison = null;
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('pointerdown', beginSculpt, { capture: true });
      renderer.domElement.removeEventListener('pointermove', queuePointerMove, { capture: true });
      renderer.domElement.removeEventListener('pointerup', finishSculpt, { capture: true });
      renderer.domElement.removeEventListener('pointercancel', finishSculpt, { capture: true });
      disposeModel({ immediate: true });
      resizeHandles.dispose();
      viewportAxes.dispose();
      for (const record of deferredDisposals) {
        window.clearTimeout(record.timer);
        record.disposer();
      }
      deferredDisposals.clear();
      catalogSource?.dispose();
      catalogSource = null;
      catalogLoader.dispose();
      disposeCatalogC7SurfaceCache();
      groundFieldPass.dispose();
      floor.geometry.dispose();
      floor.material.dispose();
      grid.geometry.dispose();
      grid.material.dispose();
      sculptCursor.geometry.dispose();
      sculptCursor.material.dispose();
      renderer.dispose();
    },
    renderer,
    resetCamera,
    setNavigationMode,
    setSculptOptions(options = {}) {
      if ((options.tool && options.tool !== sculptOptions.tool)
        || (options.resizeAxis && options.resizeAxis !== sculptOptions.resizeAxis)
        || (options.resizeProportional !== undefined && options.resizeProportional !== sculptOptions.resizeProportional)
        || (options.rotateAxis && options.rotateAxis !== sculptOptions.rotateAxis)
        || (options.protectDeformation !== undefined && options.protectDeformation !== sculptOptions.protectDeformation)
        || (options.preventFaceFlips !== undefined && options.preventFaceFlips !== sculptOptions.preventFaceFlips)) {
        finishActiveStroke();
        measurementStart = null;
      }
      Object.assign(sculptOptions, options);
      sculptOptions.resizeAxis = ['x', 'y', 'z'].includes(sculptOptions.resizeAxis) ? sculptOptions.resizeAxis : 'uniform';
      sculptOptions.rotateAxis = ['x', 'y', 'z'].includes(sculptOptions.rotateAxis) ? sculptOptions.rotateAxis : 'y';
      sculptOptions.mirrorAxis = ['x', 'y', 'z'].includes(sculptOptions.mirrorAxis) ? sculptOptions.mirrorAxis : 'x';
      sculptOptions.fractureAxis = ['x', 'y', 'z'].includes(sculptOptions.fractureAxis) ? sculptOptions.fractureAxis : 'surface';
      sculptOptions.fractureGap = Math.max(Number(sculptOptions.fractureGap) || 0.075, 0.001);
      sculptOptions.decimatePercent = Number(sculptOptions.decimatePercent) > 0 ? Math.min(Number(sculptOptions.decimatePercent), 100) : 50;
      sculptOptions.remeshTarget = Number.isFinite(Number(sculptOptions.remeshTarget)) ? Math.max(0, Math.round(Number(sculptOptions.remeshTarget))) : 0;
      sculptOptions.drillDepth = Math.max(Number(sculptOptions.drillDepth) || 0.75, 0.01);
      sculptOptions.drillRoughness = clamp(Number(sculptOptions.drillRoughness) || 0, 0, 1);
      sculptOptions.drillThrough = Boolean(sculptOptions.drillThrough);
      sculptOptions.trimDepth = Math.max(Number(sculptOptions.trimDepth) || 0.25, 0.001);
      sculptOptions.enabled = Boolean(sculptOptions.enabled);
      sculptOptions.radius = Math.max(Number(sculptOptions.radius) || 0.5, 0.01);
      sculptOptions.strength = Math.max(Number(sculptOptions.strength) || 0, 0);
      renderer.domElement.style.cursor = sculptOptions.enabled ? 'crosshair' : '';
      if (!sculptOptions.enabled) sculptCursor.visible = false;
      setNavigationMode(navigationMode);
    },
    scene,
    start() {
      const state = store.getState();
      requestedRevision = state.docRevision;
      requestedViewRevision = state.viewRevision;
      void remesh({ reframe: true });
      animate();
    },
  };
}
