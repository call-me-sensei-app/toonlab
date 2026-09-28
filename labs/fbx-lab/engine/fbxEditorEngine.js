// FBX editor stage: viewport, selection, gizmo, and the mesh operations the
// HUD exposes. Owns the live three.js graph; the store only ever receives
// plain snapshots (see store/fbxStore.js).

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';

import { createLabRenderer, whenRendererReady } from '../../shared/rendererFactory.js';
import { downloadBlob } from '../../shared/download.js';
import { parseFBX } from '../fbx/loadFBX.js';
import { exportSceneToFBX } from '../fbx/exportFBX.js';

const UNDO_LIMIT = 20;

function disposeSubtree(root) {
  root.traverse((object) => {
    object.geometry?.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!material) continue;
      for (const value of Object.values(material)) {
        if (value?.isTexture) value.dispose();
      }
      material.dispose();
    }
  });
}

function objectKind(object) {
  if (object.isSkinnedMesh) return 'skinned';
  if (object.isMesh) return 'mesh';
  if (object.isBone) return 'bone';
  return 'group';
}

function meshCounts(object) {
  const position = object.geometry?.getAttribute('position');
  if (!position) return { triangles: 0, vertices: 0 };
  const index = object.geometry.getIndex();
  return {
    triangles: Math.floor((index ? index.count : position.count) / 3),
    vertices: position.count,
  };
}

// Reverses triangle winding in place (adds a sequential index to non-indexed
// geometry first so the swap is uniform).
function reverseWinding(geometry) {
  if (!geometry.getIndex()) {
    const count = geometry.getAttribute('position').count;
    const index = new (count > 65535 ? Uint32Array : Uint16Array)(count);
    for (let i = 0; i < count; i += 1) index[i] = i;
    geometry.setIndex(new THREE.BufferAttribute(index, 1));
  }
  const index = geometry.getIndex();
  for (let i = 0; i < index.count; i += 3) {
    const b = index.getX(i + 1);
    index.setX(i + 1, index.getX(i + 2));
    index.setX(i + 2, b);
  }
  index.needsUpdate = true;
}

export function createFbxEditorEngine({ mount, store }) {
  const renderer = createLabRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(mount.clientWidth || window.innerWidth, mount.clientHeight || window.innerHeight);
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0f141c);

  const camera = new THREE.PerspectiveCamera(
    40,
    (mount.clientWidth || 1) / (mount.clientHeight || 1),
    0.01,
    5000,
  );
  camera.position.set(4, 3, 6);

  const grid = new THREE.GridHelper(20, 20, 0x33415a, 0x1d2637);
  grid.material.transparent = true;
  grid.material.opacity = 0.6;
  scene.add(grid);
  scene.add(new THREE.HemisphereLight(0xbdd7f5, 0x2d3a4d, 1.1));
  const keyLight = new THREE.DirectionalLight(0xfff2dd, 2.4);
  keyLight.position.set(-6, 9, 4);
  scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(0x9fc4ff, 0.7);
  rimLight.position.set(7, 4, -6);
  scene.add(rimLight);

  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true;
  orbit.target.set(0, 0.8, 0);

  const gizmo = new TransformControls(camera, renderer.domElement);
  scene.add(gizmo.getHelper());
  gizmo.addEventListener('dragging-changed', (event) => {
    orbit.enabled = !event.value;
  });

  const selectionBox = new THREE.BoxHelper(new THREE.Object3D(), 0x7ab8ff);
  selectionBox.visible = false;
  scene.add(selectionBox);

  const modelRoot = new THREE.Group();
  modelRoot.name = 'FBXRoot';
  scene.add(modelRoot);

  let selected = null;
  const undoStack = [];
  let loadedWarnings = [];

  // -------------------------------------------------------------- snapshots

  function buildTreeNode(object) {
    return {
      children: object.children.map(buildTreeNode),
      id: object.uuid,
      kind: objectKind(object),
      name: object.name || '(unnamed)',
      visible: object.visible,
      ...(object.isMesh ? meshCounts(object) : null),
    };
  }

  function publishTree() {
    let meshes = 0;
    let vertices = 0;
    let triangles = 0;
    let nodes = 0;
    const materials = new Set();
    modelRoot.traverse((object) => {
      if (object === modelRoot) return;
      nodes += 1;
      if (object.isMesh) {
        meshes += 1;
        const counts = meshCounts(object);
        vertices += counts.vertices;
        triangles += counts.triangles;
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          if (material) materials.add(material);
        }
      }
    });
    store.setState({
      stats: nodes === 0 ? null : {
        materials: materials.size, meshes, nodes, triangles, vertices,
      },
      tree: modelRoot.children.map(buildTreeNode),
      undoCount: undoStack.length,
      warnings: loadedWarnings,
    });
  }

  function publishSelection() {
    if (!selected) {
      store.setState({ selectedId: null, selectedInfo: null });
      return;
    }
    const degrees = THREE.MathUtils.radToDeg;
    store.setState({
      selectedId: selected.uuid,
      selectedInfo: {
        id: selected.uuid,
        isMesh: Boolean(selected.isMesh),
        kind: objectKind(selected),
        name: selected.name || '(unnamed)',
        position: [selected.position.x, selected.position.y, selected.position.z],
        rotationDeg: [
          degrees(selected.rotation.x),
          degrees(selected.rotation.y),
          degrees(selected.rotation.z),
        ],
        scale: [selected.scale.x, selected.scale.y, selected.scale.z],
        visible: selected.visible,
        ...(selected.isMesh ? meshCounts(selected) : null),
      },
    });
  }

  function refreshSelectionBox() {
    if (selected) {
      selectionBox.setFromObject(selected);
      selectionBox.visible = true;
    } else {
      selectionBox.visible = false;
    }
  }

  gizmo.addEventListener('objectChange', () => {
    refreshSelectionBox();
    publishSelection();
  });

  // -------------------------------------------------------------- selection

  function select(object) {
    selected = object ?? null;
    if (selected) {
      gizmo.attach(selected);
    } else {
      gizmo.detach();
    }
    refreshSelectionBox();
    publishSelection();
  }

  function findByUuid(uuid) {
    if (!uuid) return null;
    let found = null;
    modelRoot.traverse((object) => {
      if (!found && object.uuid === uuid && object !== modelRoot) found = object;
    });
    return found;
  }

  // Click-select (suppressed when the pointer dragged or hit the gizmo).
  const pointer = { down: false, x: 0, y: 0 };
  renderer.domElement.addEventListener('pointerdown', (event) => {
    pointer.down = true;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
  });
  const raycaster = new THREE.Raycaster();
  renderer.domElement.addEventListener('pointerup', (event) => {
    if (!pointer.down) return;
    pointer.down = false;
    if (gizmo.dragging) return;
    const moved = Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y);
    if (moved > 4) return;
    const bounds = renderer.domElement.getBoundingClientRect();
    raycaster.setFromCamera(new THREE.Vector2(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    ), camera);
    const hit = raycaster.intersectObjects(modelRoot.children, true)
      .find((candidate) => candidate.object.visible);
    select(hit ? hit.object : null);
  });

  // ---------------------------------------------------------------- framing

  function frame(target = null) {
    const box = new THREE.Box3();
    if (target) box.setFromObject(target);
    else if (modelRoot.children.length) box.setFromObject(modelRoot);
    else return;
    if (box.isEmpty()) return;
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const radius = Math.max(sphere.radius, 0.001);
    const distance = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.15;
    const direction = camera.position.clone().sub(orbit.target).normalize();
    if (!Number.isFinite(direction.lengthSq()) || direction.lengthSq() === 0) {
      direction.set(0.55, 0.45, 0.7).normalize();
    }
    orbit.target.copy(sphere.center);
    camera.position.copy(sphere.center).addScaledVector(direction, distance);
    camera.near = Math.max(distance / 1000, 0.001);
    camera.far = Math.max(distance * 100, 100);
    camera.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------- loading

  function clearScene() {
    select(null);
    undoStack.length = 0;
    for (const child of [...modelRoot.children]) {
      modelRoot.remove(child);
      disposeSubtree(child);
    }
  }

  function loadFromArrayBuffer(buffer, fileName) {
    store.setState({ error: null, fileName, status: 'loading' });
    try {
      const { root, warnings } = parseFBX(buffer, fileName);
      clearScene();
      loadedWarnings = warnings;
      // Adopt the loader group's children directly; its own transform is
      // identity, so hierarchy and transforms are preserved exactly.
      for (const child of [...root.children]) modelRoot.add(child);
      const baseName = fileName.replace(/\.fbx$/i, '');
      store.setState({
        exportName: `${baseName}-edited`,
        status: 'ready',
      });
      publishTree();
      frame();
    } catch (error) {
      console.error('FBX parse failed:', error);
      store.setState({ error: String(error?.message ?? error), status: 'error' });
    }
  }

  // ------------------------------------------------------------- operations

  function withObject(uuid, operation) {
    const object = findByUuid(uuid);
    if (object) operation(object);
  }

  function structuralChange() {
    refreshSelectionBox();
    publishTree();
    publishSelection();
  }

  const actions = {
    bakeTransform(uuid) {
      withObject(uuid, (object) => {
        if (!object.isMesh) return;
        object.updateMatrix();
        const determinantNegative = object.matrix.determinant() < 0;
        object.geometry.applyMatrix4(object.matrix);
        if (determinantNegative) reverseWinding(object.geometry);
        object.position.set(0, 0, 0);
        object.quaternion.identity();
        object.scale.set(1, 1, 1);
        object.updateMatrix();
        object.geometry.computeBoundingBox();
        object.geometry.computeBoundingSphere();
        structuralChange();
      });
    },
    centerPivot(uuid) {
      withObject(uuid, (object) => {
        if (!object.isMesh) return;
        object.geometry.computeBoundingBox();
        const center = object.geometry.boundingBox.getCenter(new THREE.Vector3());
        object.geometry.translate(-center.x, -center.y, -center.z);
        const delta = center.clone().multiply(object.scale).applyQuaternion(object.quaternion);
        object.position.add(delta);
        object.geometry.computeBoundingBox();
        object.geometry.computeBoundingSphere();
        structuralChange();
      });
    },
    deleteObject(uuid) {
      withObject(uuid, (object) => {
        const parent = object.parent;
        if (!parent) return;
        if (selected && (selected === object || isDescendant(object, selected))) select(null);
        parent.remove(object);
        undoStack.push({ object, parent });
        if (undoStack.length > UNDO_LIMIT) {
          disposeSubtree(undoStack.shift().object);
        }
        structuralChange();
      });
    },
    flipNormals(uuid) {
      withObject(uuid, (object) => {
        if (!object.isMesh) return;
        reverseWinding(object.geometry);
        const normal = object.geometry.getAttribute('normal');
        if (normal) {
          for (let i = 0; i < normal.count; i += 1) {
            normal.setXYZ(i, -normal.getX(i), -normal.getY(i), -normal.getZ(i));
          }
          normal.needsUpdate = true;
        }
        structuralChange();
      });
    },
    frameAll: () => frame(),
    frameSelection: () => frame(selected ?? null),
    loadFromArrayBuffer,
    recomputeNormals(uuid) {
      withObject(uuid, (object) => {
        if (!object.isMesh) return;
        object.geometry.computeVertexNormals();
        structuralChange();
      });
    },
    renameObject(uuid, name) {
      withObject(uuid, (object) => {
        object.name = name.trim() || object.name;
        structuralChange();
      });
    },
    selectById(uuid) {
      select(findByUuid(uuid));
    },
    setGizmoMode(mode) {
      gizmo.setMode(mode);
      store.setState({ gizmoMode: mode });
    },
    setPosition(axis, value) {
      if (!selected || !Number.isFinite(value)) return;
      selected.position[axis] = value;
      refreshSelectionBox();
      publishSelection();
    },
    setRotationDeg(axis, value) {
      if (!selected || !Number.isFinite(value)) return;
      selected.rotation[axis] = THREE.MathUtils.degToRad(value);
      refreshSelectionBox();
      publishSelection();
    },
    setScale(axis, value) {
      if (!selected || !Number.isFinite(value)) return;
      selected.scale[axis] = value;
      refreshSelectionBox();
      publishSelection();
    },
    setVisible(uuid, visible) {
      withObject(uuid, (object) => {
        object.visible = visible;
        structuralChange();
      });
    },
    undoDelete() {
      const entry = undoStack.pop();
      if (!entry) return;
      entry.parent.add(entry.object);
      structuralChange();
    },
  };

  function isDescendant(root, candidate) {
    let found = false;
    root.traverse((object) => { if (object === candidate) found = true; });
    return found;
  }

  // ----------------------------------------------------------------- export

  async function exportFBX(name) {
    const fileName = `${name || 'scene'}.fbx`;
    store.setState({ exporting: true });
    try {
      const result = await exportSceneToFBX(modelRoot, { fileName });
      downloadBlob(result.buffer, fileName, 'application/octet-stream');
      return { fileName, ok: true, ...result };
    } finally {
      store.setState({ exporting: false });
    }
  }

  async function exportGLB(name) {
    const fileName = `${name || 'scene'}.glb`;
    store.setState({ exporting: true });
    try {
      const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
      const buffer = await new GLTFExporter().parseAsync(modelRoot, { binary: true });
      downloadBlob(buffer, fileName, 'model/gltf-binary');
      return { fileName, ok: true };
    } finally {
      store.setState({ exporting: false });
    }
  }

  // ------------------------------------------------------------------- loop

  const resizeObserver = new ResizeObserver(() => {
    const width = mount.clientWidth || window.innerWidth;
    const height = mount.clientHeight || window.innerHeight;
    if (width < 1 || height < 1) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  });
  resizeObserver.observe(mount);

  async function start() {
    await whenRendererReady(renderer);
    renderer.setAnimationLoop(() => {
      orbit.update();
      renderer.render(scene, camera);
    });
    document.body.dataset.modelReady = 'true';
  }

  return {
    actions, camera, exportFBX, exportGLB, renderer, scene, start,
  };
}
