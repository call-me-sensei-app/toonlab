// Three.js half of Landscape Lab: chunked terrain tiles over the store's
// editable field, the shared splat material, a dynamic foliage host (one
// LandscapeFoliageLayer per painted palette entry), stage water, and sun/sky
// dressing. The store owns the data; this engine reacts to
// `lastChange.changeKind` and refreshes only what a change touched —
// dirty-rect tile updates for strokes, uniform pokes for settings.

import * as THREE from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { clamp, float, positionWorld, texture, uniform, vec2 } from 'three/tsl';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { createWorldCollision } from '../../../src/worldCollision.js';
import { createEnvironmentGroundFieldPass } from '../../../src/environment/environmentGroundFieldPass.js';
import {
  createWalkPreviewActions,
  installWalkPreviewController,
} from '../../shared/walkPreview.js';

import {
  buildTunnelGeometries,
  buildTileGeometry,
  buildTileHoleSkirt,
  createLandscapeMaterial,
  GrassFoliageLayer,
  LandscapeFoliageLayer,
  rebuildTileIndicesForRect,
  resolveFoliageAsset,
  resolveLandscapeLayers,
  resolveLayerTexture,
  tilesForDirtyRect,
  updateTileGeometry,
} from '../../../src/landscape/index.js';
import { createLabRenderer, whenRendererReady } from '../../shared/rendererFactory.js';

const SKY_COLOR = 0x9cc4de;
const CAMERA_VIEWS = {
  default: { position: [0.55, 0.42, 0.72], target: [0, 0, 0] },
  low: { position: [0.32, 0.09, 0.45], target: [0, 0.02, 0] },
  top: { position: [0.02, 1.15, 0.02], target: [0, 0, 0] },
};

export function createLandscapeLabEngine({ mount, store }) {
  const renderer = createLabRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY_COLOR);
  const groundFieldPass = createEnvironmentGroundFieldPass({
    renderer,
    resolution: 1024,
    scene,
  });

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 3000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false;
  controls.maxPolarAngle = Math.PI * 0.495;

  const hemisphere = new THREE.HemisphereLight(0xcfe4f2, 0x64715a, 1.05);
  scene.add(hemisphere);
  const sun = new THREE.DirectionalLight(0xfff2dd, 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.5;
  scene.add(sun);
  scene.add(sun.target);

  const terrainGroup = new THREE.Group();
  terrainGroup.name = 'LandscapeTerrain';
  scene.add(terrainGroup);
  const foliageGroup = new THREE.Group();
  foliageGroup.name = 'LandscapeFoliage';
  scene.add(foliageGroup);
  // Swept tunnel meshes (terrain-look floors + dark rock walls).
  const tunnelGroup = new THREE.Group();
  tunnelGroup.name = 'LandscapeTunnels';
  scene.add(tunnelGroup);

  // Stage water: the surface plane fades out over painted DRY zones (the
  // per-quad water mask sampled by world XZ), and a second, deeper
  // groundwater plane appears ONLY inside dry zones — dig far enough down in
  // a dry cave and you still strike water.
  const waterMaskState = { texture: null };
  const waterMaskOrigin = uniform(new THREE.Vector2());
  const waterMaskExtent = uniform(new THREE.Vector2(1, 1));

  function waterMaskNode() {
    const worldUv = vec2(positionWorld.x, positionWorld.z)
      .sub(waterMaskOrigin)
      .div(waterMaskExtent);
    const inside = clamp(worldUv, 0.0, 1.0);
    return texture(waterMaskState.texture, inside).r;
  }

  function makeWaterMaterial(dryZoneSide) {
    const material = new MeshStandardNodeMaterial({
      color: 0x2e6f9e,
      transparent: true,
      roughness: 0.25,
      metalness: 0,
      depthWrite: false,
    });
    material.opacityNode = dryZoneSide
      ? float(1).sub(waterMaskNode()).mul(0.55)
      : waterMaskNode().mul(0.55);
    return material;
  }

  const water = new THREE.Mesh(new THREE.PlaneGeometry(1, 1));
  water.rotation.x = -Math.PI / 2;
  water.name = 'LandscapeStageWater';
  scene.add(water);
  const groundwater = new THREE.Mesh(new THREE.PlaneGeometry(1, 1));
  groundwater.rotation.x = -Math.PI / 2;
  groundwater.name = 'LandscapeGroundwater';
  scene.add(groundwater);

  function rebuildWaterMask() {
    const current = field();
    waterMaskState.texture?.dispose();
    const map = new THREE.DataTexture(current.water, current.splatW, current.splatD, THREE.RedFormat, THREE.UnsignedByteType);
    map.colorSpace = THREE.NoColorSpace;
    map.wrapS = THREE.ClampToEdgeWrapping;
    map.wrapT = THREE.ClampToEdgeWrapping;
    map.magFilter = THREE.LinearFilter;
    map.minFilter = THREE.LinearFilter;
    map.generateMipmaps = false;
    map.flipY = false;
    map.unpackAlignment = 1;
    map.needsUpdate = true;
    waterMaskState.texture = map;
    waterMaskOrigin.value.set(current.origin.x, current.origin.z);
    waterMaskExtent.value.set(current.extentX, current.extentZ);
    water.material?.dispose?.();
    groundwater.material?.dispose?.();
    water.material = makeWaterMaterial(false);
    groundwater.material = makeWaterMaterial(true);
  }

  function refreshWaterMask() {
    if (waterMaskState.texture) waterMaskState.texture.needsUpdate = true;
  }

  let material = null;
  let tileMeshes = [];
  const skirtMeshes = new Map(); // "tx,tz" -> Mesh (only tiles with hole edges)
  // Unlit vertex-color gradient: openings read as dark descending shafts.
  const skirtMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  let lastSeenRevision = store.getState().docRevision;

  const field = () => store.getDocument().field;

  function fitStage() {
    const current = field();
    const extent = Math.max(current.extentX, current.extentZ);
    scene.fog = new THREE.Fog(SKY_COLOR, extent * 1.4, extent * 4.5);
    sun.position.set(extent * 0.55, extent * 0.8, extent * 0.35);
    sun.target.position.set(0, 0, 0);
    const shadowCamera = sun.shadow.camera;
    shadowCamera.left = -extent * 0.78;
    shadowCamera.right = extent * 0.78;
    shadowCamera.top = extent * 0.78;
    shadowCamera.bottom = -extent * 0.78;
    shadowCamera.near = 1;
    shadowCamera.far = extent * 3;
    shadowCamera.updateProjectionMatrix();
    water.geometry.dispose();
    water.geometry = new THREE.PlaneGeometry(current.extentX * 1.35, current.extentZ * 1.35);
    water.geometry.rotateX(-Math.PI / 2);
    water.rotation.x = 0;
    groundwater.geometry.dispose();
    // Groundwater only exists inside the field (dry zones are per-quad).
    groundwater.geometry = new THREE.PlaneGeometry(current.extentX, current.extentZ);
    groundwater.geometry.rotateX(-Math.PI / 2);
    groundwater.rotation.x = 0;
    rebuildWaterMask();
  }

  function buildTerrain() {
    for (const mesh of tileMeshes) {
      terrainGroup.remove(mesh);
      mesh.geometry.dispose();
    }
    material?.userData.landscape.dispose();
    const current = field();
    material = createLandscapeMaterial({
      field: current,
      layers: resolveLandscapeLayers(store.getState().settings),
    });
    tileMeshes = [];
    for (let tz = 0; tz < current.tilesZ; tz += 1) {
      for (let tx = 0; tx < current.tilesX; tx += 1) {
        const mesh = new THREE.Mesh(buildTileGeometry(current, tx, tz), material);
        mesh.name = `LandscapeTile ${tx},${tz}`;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        // Ground-field pass contract: painted terrain is a ground writer.
        mesh.userData.groundFieldWrite = true;
        terrainGroup.add(mesh);
        tileMeshes.push(mesh);
      }
    }
    rebuildAllSkirts();
    rebuildTunnels();
    fitStage();
    groundFieldPass.invalidate();
  }

  function updateTerrainRect(rect) {
    const current = field();
    if (!rect) {
      for (const mesh of tileMeshes) {
        updateTileGeometry(current, mesh.geometry, {
          minX: 0, minZ: 0, maxX: current.gridW - 1, maxZ: current.gridD - 1,
        });
      }
      rebuildAllSkirts();
      groundFieldPass.invalidate();
      return;
    }
    const touched = tilesForDirtyRect(current, rect);
    for (const { tx, tz } of touched) {
      const mesh = tileMeshes[tz * current.tilesX + tx];
      if (mesh) updateTileGeometry(current, mesh.geometry, rect);
      // Skirt wall tops follow the terrain edge — sculpting near a hole must
      // re-drape them. No-op for tiles without hole boundaries.
      if (skirtMeshes.has(`${tx},${tz}`)) rebuildSkirtForTile(tx, tz);
    }
    groundFieldPass.invalidate();
  }

  function rebuildSkirtForTile(tx, tz) {
    const key = `${tx},${tz}`;
    const previous = skirtMeshes.get(key);
    if (previous) {
      terrainGroup.remove(previous);
      previous.geometry.dispose();
      skirtMeshes.delete(key);
    }
    const geometry = buildTileHoleSkirt(field(), tx, tz);
    if (!geometry) return;
    const mesh = new THREE.Mesh(geometry, skirtMaterial);
    mesh.name = `LandscapeHoleSkirt ${key}`;
    terrainGroup.add(mesh);
    skirtMeshes.set(key, mesh);
  }

  function rebuildAllSkirts() {
    for (const mesh of skirtMeshes.values()) {
      terrainGroup.remove(mesh);
      mesh.geometry.dispose();
    }
    skirtMeshes.clear();
    const current = field();
    for (let tz = 0; tz < current.tilesZ; tz += 1) {
      for (let tx = 0; tx < current.tilesX; tx += 1) rebuildSkirtForTile(tx, tz);
    }
  }

  function rebuildHoleIndices(rect) {
    const current = field();
    for (const mesh of tileMeshes) {
      if (rebuildTileIndicesForRect(current, mesh.geometry, rect ?? null)) {
        const { tx, tz } = mesh.geometry.userData.landscapeTile;
        rebuildSkirtForTile(tx, tz);
      }
    }
    groundFieldPass.invalidate();
  }

  function rebuildTunnels() {
    for (const child of [...tunnelGroup.children]) {
      tunnelGroup.remove(child);
      child.geometry.dispose();
    }
    if (!material) return;
    for (const tunnel of store.getDocument().tunnels) {
      const { floor, walls } = buildTunnelGeometries(field(), tunnel);
      const floorMesh = new THREE.Mesh(floor, material);
      floorMesh.name = `TunnelFloor ${tunnel.id}`;
      floorMesh.receiveShadow = true;
      floorMesh.userData.groundFieldWrite = true;
      const wallsMesh = new THREE.Mesh(walls, skirtMaterial);
      wallsMesh.name = `TunnelWalls ${tunnel.id}`;
      tunnelGroup.add(floorMesh, wallsMesh);
    }
    groundFieldPass.invalidate();
  }

  let splatRefreshQueued = false;
  function refreshSplat() {
    // Full-texture upload, throttled to one per frame (256 KB default — the
    // WebGPU-safe path; no partial writeTexture row-alignment traps).
    if (splatRefreshQueued) return;
    splatRefreshQueued = true;
    requestAnimationFrame(() => {
      splatRefreshQueued = false;
      material?.userData.landscape.refreshSplat();
      groundFieldPass.invalidate();
    });
  }

  function applySettings(settings) {
    const landscape = material?.userData.landscape;
    if (landscape) {
      const layers = resolveLandscapeLayers(settings);
      layers.forEach((layer, index) => landscape.setLayerTint(index, layer.tint));
      landscape.setMacro(settings.macroNoiseAmount, settings.macroNoiseScale);
      groundFieldPass.invalidate();
    }
    water.visible = Boolean(settings.showWater);
    water.position.y = settings.waterLevel;
    groundwater.visible = Boolean(settings.showWater) && settings.groundwaterOffset > 0;
    groundwater.position.y = settings.waterLevel - settings.groundwaterOffset;
  }

  // Async per-layer texture resolution. The per-index key doubles as the
  // staleness guard: if the layer changes again while a bake/decode is in
  // flight, the outdated resolution no longer matches and is dropped.
  const appliedLayerKeys = [null, null, null, null];
  function applyLayerTextures(materialLayers) {
    const landscape = material?.userData.landscape;
    if (!landscape || !Array.isArray(materialLayers)) return;
    materialLayers.forEach((layer, index) => {
      const key = layer.textureRef ? `${JSON.stringify(layer.textureRef)}@${layer.repeat}` : null;
      if (appliedLayerKeys[index] === key) return;
      appliedLayerKeys[index] = key;
      if (!key) {
        landscape.setLayerTexture(index, null);
        groundFieldPass.invalidate();
        return;
      }
      resolveLayerTexture(layer.textureRef).then((texture) => {
        if (appliedLayerKeys[index] !== key) return;
        landscape.setLayerTexture(index, texture, { repeat: layer.repeat });
        groundFieldPass.invalidate();
      }).catch((error) => {
        store.actions.setStatus(`Layer texture failed: ${error.message}`);
      });
    });
  }

  // --- foliage host ----------------------------------------------------------

  const foliageLayers = new Map(); // paletteId -> LandscapeFoliageLayer
  const layerLoads = new Map(); // paletteId -> Promise<layer>

  function paletteEntry(paletteId) {
    return store.getState().palette.find((entry) => entry.id === paletteId) ?? null;
  }

  async function ensureFoliageLayer(paletteId) {
    const existing = foliageLayers.get(paletteId);
    if (existing) return existing;
    if (layerLoads.has(paletteId)) return layerLoads.get(paletteId);
    const entry = paletteEntry(paletteId);
    if (!entry) return null;
    // Grass is a blade system, not a mesh prop — it gets its own layer type.
    if (entry.source?.kind === 'grass-preset') {
      const layer = new GrassFoliageLayer({
        paletteId,
        document: entry.source.document ?? null,
        heightAt: field().heightAt,
        rules: entry.rules,
      });
      foliageGroup.add(layer);
      foliageLayers.set(paletteId, layer);
      return layer;
    }
    const load = Promise.resolve(resolveFoliageAsset(entry)).then((asset) => {
      const layer = new LandscapeFoliageLayer({
        asset,
        paletteId,
        heightAt: field().heightAt,
        rules: entry.rules,
        seed: 1 + paletteId.length,
      });
      foliageGroup.add(layer);
      foliageLayers.set(paletteId, layer);
      layerLoads.delete(paletteId);
      return layer;
    }).catch((error) => {
      layerLoads.delete(paletteId);
      store.actions.setStatus(`Could not load "${entry.label}": ${error.message}`);
      return null;
    });
    layerLoads.set(paletteId, load);
    return load;
  }

  const foliageHost = {
    ensureLayer: ensureFoliageLayer,
    layerFor: (paletteId) => foliageLayers.get(paletteId) ?? null,
    apply(command, direction) {
      for (const layerCommand of command.layers) {
        const layer = foliageLayers.get(layerCommand.paletteId);
        if (!layer) continue;
        if (direction === 'apply') {
          layer.removeInstances(layerCommand.removed.map((record) => record.id));
          layer.addInstances(layerCommand.added);
        } else {
          layer.removeInstances(layerCommand.added.map((record) => record.id));
          layer.addInstances(layerCommand.removed);
        }
      }
    },
    recordsFor(paletteId) {
      const layer = foliageLayers.get(paletteId);
      return layer ? [...layer.records.values()].map((record) => ({ ...record })) : [];
    },
    serializeLayers() {
      const layers = [];
      for (const [paletteId, layer] of foliageLayers) {
        if (layer.count > 0) {
          layers.push({ paletteId, stride: 9, instances: layer.serializeInstances() });
        }
      }
      return layers;
    },
    totalCount() {
      let total = 0;
      for (const layer of foliageLayers.values()) total += layer.count;
      return total;
    },
  };
  store.attachFoliageHost(foliageHost);

  function disposeFoliage() {
    for (const layer of foliageLayers.values()) layer.dispose();
    foliageLayers.clear();
    layerLoads.clear();
  }

  async function loadPendingFoliage() {
    const pending = store.getDocument().pendingFoliageLayers ?? [];
    store.getDocument().pendingFoliageLayers = [];
    for (const saved of pending) {
      const layer = await ensureFoliageLayer(saved.paletteId);
      layer?.loadInstances(saved.instances, saved.stride);
    }
    if (pending.length) store.setState({ foliageTotal: foliageHost.totalCount() });
  }

  function syncPalette() {
    const palette = store.getState().palette;
    for (const [paletteId, layer] of [...foliageLayers]) {
      const entry = palette.find((candidate) => candidate.id === paletteId);
      if (!entry) {
        layer.dispose();
        foliageLayers.delete(paletteId);
      } else {
        layer.rules = entry.rules;
      }
    }
  }

  function rebuildAll() {
    disposeFoliage();
    buildTerrain();
    appliedLayerKeys.fill(null);
    applySettings(store.getState().settings);
    applyLayerTextures(store.getState().materialLayers);
    loadPendingFoliage();
  }

  // --- store reaction --------------------------------------------------------

  store.subscribe(() => {
    const current = store.getState();
    // Walk preview toggle: lazy-load the mannequin, sync camera mode +
    // visibility (first person hides the walker).
    if (current.walkPreview && !mannequin) ensureMannequin();
    applyWalkCameraMode();
    if (current.docRevision === lastSeenRevision) return;
    lastSeenRevision = current.docRevision;
    walkCollisionDirty = true; // terrain/foliage may have moved under the walker
    const { changeKind, dirtyRect } = current.lastChange ?? {};
    if (changeKind === 'load') {
      rebuildAll();
    } else if (changeKind === 'resize') {
      // Terrain grid changed but the world stayed put: rebuild tiles/stage,
      // keep the painted foliage and repoint its terrain sampler.
      buildTerrain();
      appliedLayerKeys.fill(null);
      applySettings(current.settings);
      applyLayerTextures(current.materialLayers);
      for (const layer of foliageLayers.values()) layer.heightAt = field().heightAt;
    } else if (changeKind === 'terrain') {
      updateTerrainRect(dirtyRect ?? null);
      refreshSplat();
    } else if (changeKind === 'splat') {
      refreshSplat();
    } else if (changeKind === 'holes') {
      rebuildHoleIndices(dirtyRect ?? null);
    } else if (changeKind === 'water') {
      refreshWaterMask();
    } else if (changeKind === 'tunnel') {
      rebuildHoleIndices(dirtyRect ?? null);
      refreshWaterMask();
      rebuildTunnels();
    } else if (changeKind === 'palette') {
      syncPalette();
      applySettings(current.settings);
    } else if (changeKind === 'layers') {
      applyLayerTextures(current.materialLayers);
    } else if (changeKind === 'settings') {
      applySettings(current.settings);
    }
    // 'terrainCommitted' / 'splatCommitted' / 'foliage*' are already live —
    // the tools updated geometry/instances during the stroke.
  });

  // --- camera / pointer helpers ---------------------------------------------

  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();

  function raycasterFor(event) {
    const bounds = renderer.domElement.getBoundingClientRect();
    pointerNdc.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointerNdc, camera);
    return raycaster;
  }

  function raycastTerrain(event) {
    const ray = raycasterFor(event).ray;
    return field().raycast(ray.origin, ray.direction);
  }

  /**
   * Placement raycast against terrain AND placed foliage meshes — nearest
   * hit wins. Returns `{ kind, point, normal, distance }` or null. This is
   * what lets the Single tool stick stalactites to prop-built cave ceilings.
   */
  const placementInstanceMatrix = new THREE.Matrix4();
  const placementWorldMatrix = new THREE.Matrix4();
  function raycastPlacement(event) {
    const raycaster = raycasterFor(event);
    raycaster.far = Infinity;
    const results = [];
    const terrainHit = field().raycast(raycaster.ray.origin, raycaster.ray.direction);
    if (terrainHit) {
      results.push({
        kind: 'terrain',
        distance: terrainHit.distance,
        point: terrainHit.point,
        normal: field().normalAt(terrainHit.point.x, terrainHit.point.z, { x: 0, y: 1, z: 0 }),
      });
    }
    const meshHit = raycaster
      .intersectObjects([...foliageGroup.children, ...tunnelGroup.children], true)
      .find((hit) => hit.object.visible !== false);
    if (meshHit) {
      const normal = (meshHit.face?.normal ?? new THREE.Vector3(0, 1, 0)).clone();
      placementWorldMatrix.copy(meshHit.object.matrixWorld);
      if (meshHit.object.isInstancedMesh && meshHit.instanceId !== undefined) {
        meshHit.object.getMatrixAt(meshHit.instanceId, placementInstanceMatrix);
        placementWorldMatrix.multiply(placementInstanceMatrix);
      }
      normal.transformDirection(placementWorldMatrix);
      results.push({
        kind: 'mesh',
        distance: meshHit.distance,
        point: { x: meshHit.point.x, y: meshHit.point.y, z: meshHit.point.z },
        normal: { x: normal.x, y: normal.y, z: normal.z },
      });
    }
    if (!results.length) return null;
    results.sort((a, b) => a.distance - b.distance);
    return results[0];
  }

  function setCameraView(id = 'default') {
    const view = CAMERA_VIEWS[id] ?? CAMERA_VIEWS.default;
    const extent = Math.max(field().extentX, field().extentZ);
    camera.position.set(
      view.position[0] * extent,
      view.position[1] * extent + Math.max(field().heightBounds.max, 0) * 0.5,
      view.position[2] * extent,
    );
    controls.target.set(
      view.target[0] * extent,
      view.target[1] * extent,
      view.target[2] * extent,
    );
    controls.update();
  }

  // --- walk preview ----------------------------------------------------------
  // Collision is mandatory in walk previews: the walker snaps to
  // field.heightAt and resolves against every painted foliage footprint
  // through the shared 2D-circle collision service.

  const frameCallbacks = [];
  function onFrame(callback) {
    frameCallbacks.push(callback);
  }

  let mannequin = null;
  let mannequinLoading = false;
  let walkMixer = null;
  let walkActions = null;
  let walkCollision = null;
  let walkCollisionDirty = true;

  function ensureMannequin() {
    if (mannequin || mannequinLoading) return;
    mannequinLoading = true;
    new GLTFLoader().load('/characters/mannequin.glb', (gltf) => {
      mannequin = gltf.scene;
      mannequin.name = 'Walk mannequin';
      const spawnY = field().heightAt(0, 0);
      mannequin.position.set(0, spawnY, 0);
      mannequin.visible = store.getState().walkPreview;
      mannequin.traverse((child) => {
        if (child.isMesh) child.castShadow = true;
      });
      scene.add(mannequin);
      walkMixer = new THREE.AnimationMixer(mannequin);
      walkActions = createWalkPreviewActions({ clips: gltf.animations, mixer: walkMixer });
      mannequinLoading = false;
    }, undefined, () => {
      mannequinLoading = false;
      store.actions.setStatus('Walk preview mannequin failed to load.');
    });
  }

  function refreshWalkCollision() {
    walkCollision = createWorldCollision({ heightAt: field().heightAt });
    for (const layer of foliageLayers.values()) {
      walkCollision.addCircles(layer.footprintCircles());
    }
    walkCollisionDirty = false;
  }

  // Inside a hole (cave opening) the heightfield is open air: ground the
  // walker on whatever placed meshes are below (cave floors built from
  // rocks); with nothing below, gravity wins and the respawn check catches
  // the fall.
  const downRay = new THREE.Raycaster();
  const DOWN = new THREE.Vector3(0, -1, 0);
  const downOrigin = new THREE.Vector3();
  function caveGroundHeight(x, z, fromY) {
    downOrigin.set(x, fromY, z);
    downRay.set(downOrigin, DOWN);
    downRay.far = 400;
    const hits = downRay.intersectObjects([...foliageGroup.children, ...tunnelGroup.children], true);
    for (const hit of hits) {
      if (hit.point.y <= fromY) return hit.point.y;
    }
    return field().heightBounds.min - 200;
  }

  const walkController = installWalkPreviewController({
    camera,
    controls,
    engine: { camera, controls, onFrame, renderer, scene },
    getActions: () => walkActions,
    getEnabled: () => store.getState().walkPreview,
    getWalker: () => mannequin,
    groundY: (x, z) => {
      const current = field();
      const walkerY = mannequin?.position.y ?? 0;
      const surface = current.heightAt(x, z);
      // The heightfield only grounds a walker who is actually on/above it.
      // In a hole quad, or UNDER the surface (inside a cave beneath a raised
      // dome), ground on placed meshes instead — with a small step-up
      // allowance so low cave floors are climbable.
      if (!current.isHole(x, z) && walkerY >= surface - 0.5) return surface;
      return caveGroundHeight(x, z, walkerY + 0.6);
    },
    moveHorizontal: (delta) => {
      if (!mannequin) return;
      mannequin.position.add(delta);
      if (walkCollisionDirty || !walkCollision) refreshWalkCollision();
      walkCollision.resolve(mannequin.position, 0.35);
    },
  });

  // --- walk camera: free orbit vs TPS follow-lock vs first person -----------
  //
  // 'third'  — free orbit; the shared controller lerps the target only while
  //            moving (an idle walker never hijacks the camera).
  // 'follow' — TPS lock: the target is pinned to the walker every frame, so
  //            the character stays centered and dragging orbits AROUND them.
  // 'first'  — camera pinned to the head, mannequin hidden.
  // While walking, the polar clamp opens to the full 0..π range so you can
  // look straight up overhead and straight down past the feet in any mode.

  const EYE_HEIGHT = 1.5;
  const FOLLOW_HEIGHT = 1.2;
  const cameraDistanceDefaults = { min: controls.minDistance, max: controls.maxDistance };
  const cameraPolarDefaults = { min: controls.minPolarAngle, max: controls.maxPolarAngle };
  let activeWalkCamera = null; // null | 'first' | 'follow'
  const anchorPosition = new THREE.Vector3();
  const lastAnchorPosition = new THREE.Vector3();
  const lookDirection = new THREE.Vector3();

  function walkerAnchor(height, out) {
    return out.set(mannequin.position.x, mannequin.position.y + height, mannequin.position.z);
  }

  function applyWalkCameraMode() {
    const current = store.getState();
    // Full vertical look range while walking; editor clamp otherwise.
    controls.minPolarAngle = current.walkPreview ? 0 : cameraPolarDefaults.min;
    controls.maxPolarAngle = current.walkPreview ? Math.PI : cameraPolarDefaults.max;
    const wanted = current.walkPreview && mannequin
      ? (current.walkCamera === 'first' ? 'first' : current.walkCamera === 'follow' ? 'follow' : null)
      : null;
    if (wanted === activeWalkCamera) {
      if (mannequin) mannequin.visible = current.walkPreview && wanted !== 'first';
      return;
    }
    const leavingFirst = activeWalkCamera === 'first';
    activeWalkCamera = wanted;
    if (wanted === 'first') {
      controls.minDistance = 0.3;
      controls.maxDistance = 0.32;
      camera.getWorldDirection(lookDirection);
      walkerAnchor(EYE_HEIGHT, lastAnchorPosition);
      controls.target.copy(lastAnchorPosition);
      camera.position.copy(lastAnchorPosition).addScaledVector(lookDirection, -0.3);
    } else {
      controls.minDistance = cameraDistanceDefaults.min;
      controls.maxDistance = cameraDistanceDefaults.max;
      if (leavingFirst) {
        // Back out of the head to a sensible over-the-shoulder distance.
        camera.getWorldDirection(lookDirection);
        camera.position.copy(controls.target).addScaledVector(lookDirection, -10);
        camera.position.y += 3;
      }
      if (wanted === 'follow') {
        // Keep the camera where it is; the target snaps to the character.
        walkerAnchor(FOLLOW_HEIGHT, lastAnchorPosition);
        controls.target.copy(lastAnchorPosition);
      }
    }
    controls.update();
    if (mannequin) mannequin.visible = current.walkPreview && wanted !== 'first';
  }

  // Runs AFTER the shared walk controller's frame callback, so the anchor
  // pinning wins over its idle-gated follow lerp.
  onFrame(() => {
    if (!store.getState().walkPreview || !mannequin) return;
    if (activeWalkCamera) {
      walkerAnchor(activeWalkCamera === 'first' ? EYE_HEIGHT : FOLLOW_HEIGHT, anchorPosition);
      camera.position.add(anchorPosition).sub(lastAnchorPosition);
      controls.target.copy(anchorPosition);
      lastAnchorPosition.copy(anchorPosition);
    }
    // Fell through a cave opening with no floor beneath: respawn.
    if (mannequin.position.y < field().heightBounds.min - 60) {
      mannequin.position.set(0, field().heightAt(0, 0), 0);
      walkController.resetJump(mannequin);
      store.actions.setStatus('Fell into the void — respawned. Build a cave floor from placed rocks.');
    }
  });

  // --- lifecycle -------------------------------------------------------------

  function resize() {
    const width = mount.clientWidth || window.innerWidth;
    const height = mount.clientHeight || window.innerHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(mount);

  const clock = new THREE.Clock();
  const engine = {
    camera,
    controls,
    renderer,
    scene,
    foliage: foliageHost,
    raycasterFor,
    raycastTerrain,
    raycastPlacement,
    updateTerrainRect,
    rebuildHoleIndices,
    refreshSplat,
    refreshWaterMask,
    setCameraView,
    resetCamera: () => setCameraView('default'),
    fieldExtent: () => Math.max(field().extentX, field().extentZ),

    /** Automation: applies a scripted stroke exactly like pointer input. */
    async runBrushStrokeForTest(worldPoints, tool = 'raise', { invert = false } = {}) {
      const { runScriptedStroke } = await import('./landscapeTools.js');
      return runScriptedStroke({ engine, store, worldPoints, tool, invert });
    },

    async runHoleStrokeForTest(worldPoints, { restore = false, dry = false } = {}) {
      const { runScriptedHoleStroke } = await import('./landscapeTools.js');
      return runScriptedHoleStroke({ engine, store, worldPoints, restore, dry });
    },

    async runTunnelForTest(a, b, options = {}) {
      const { runScriptedTunnel } = await import('./landscapeTools.js');
      return runScriptedTunnel({ engine, store, a, b, ...options });
    },

    async runDryStrokeForTest(worldPoints, { restore = false } = {}) {
      const { runScriptedDryStroke } = await import('./landscapeTools.js');
      return runScriptedDryStroke({ engine, store, worldPoints, restore });
    },

    async runSplatStrokeForTest(worldPoints, layer = 0, strength = null) {
      const { runScriptedSplatStroke } = await import('./landscapeTools.js');
      return runScriptedSplatStroke({ engine, store, worldPoints, layer, strength });
    },

    async runFoliageStrokeForTest(worldPoints, { erase = false } = {}) {
      const { runScriptedFoliageStroke } = await import('./landscapeTools.js');
      return runScriptedFoliageStroke({ engine, store, worldPoints, erase });
    },

    async start() {
      await whenRendererReady(renderer);
      resize();
      buildTerrain();
      applySettings(store.getState().settings);
      applyLayerTextures(store.getState().materialLayers);
      setCameraView('default');
      renderer.setAnimationLoop(() => {
        const delta = clock.getDelta();
        for (const layer of foliageLayers.values()) layer.update(delta, camera);
        walkMixer?.update(delta);
        for (const callback of frameCallbacks) callback(delta);
        groundFieldPass.update();
        renderer.render(scene, camera);
      });
      await loadPendingFoliage();
      document.body.dataset.modelReady = 'true';
    },
  };

  return engine;
}
