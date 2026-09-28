// Tree, Grass, and Flower Shader Labs share a first-party procedural garden.
// The authored profile is applied only to its ToonLab-generated target; asset
// choice, surrounding styles, visibility, camera, time, wind, and weather are
// preview state and never enter the exported shader document.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { attribute, dot, mix, normalWorld, positionWorld, uniform } from 'three/tsl';

import { createEnvironmentGroundFieldPass } from '../../../src/environment/environmentGroundFieldPass.js';
import { createEnvironmentSunShadowPass } from '../../../src/environment/environmentSunShadowPass.js';
import { sampleEnvironmentSunShadow } from '../../../src/shaders-tsl/chunks/environment-sun-shadow.js';
import { environmentGroundField } from '../../../src/shaders-tsl/chunks/environment-ground-field.js';
import {
  applyVegetationShaderScope,
  createPlantFromRecipe,
  VEGETATION_SHADER_SCOPES,
} from '../../../src/vegetation/experimental.js';
import { createCallMeSenseiGrassField } from '../../../src/vegetation/callMeSenseiGrass.js';
import { sampleLabPreviewReferenceState } from '../../shared/previewEnvironmentContract.js';
import { createLabRenderer, whenRendererReady } from '../../shared/rendererFactory.js';
import {
  DEFAULT_FLOWER_SHADER_PREVIEW_ASSET,
  DEFAULT_TREE_SHADER_PREVIEW_ASSET,
} from '../previewAssets.js';
import { resolveVegetationPreviewComponentStyles } from './previewSettings.js';

export const VEGETATION_PREVIEW_MODES = Object.freeze([
  Object.freeze({ id: 'composition', label: 'Composition' }),
  Object.freeze({ id: 'isolate', label: 'Isolate' }),
  Object.freeze({ id: 'top', label: 'Top' }),
]);

const SCOPE_COMPONENT = Object.freeze({
  flower: 'flowers',
  grass: 'grass',
  tree: 'tree',
  vegetation: Object.freeze(['tree', 'grass', 'flowers']),
});

const TARGET_SCOPE = Object.freeze({
  flowers: 'flower',
  grass: 'grass',
  tree: 'tree',
});

const COMPONENT_POSITION = Object.freeze({
  flowers: Object.freeze([2.25, 0, 0.75]),
  grass: Object.freeze([0, 0, 0]),
  tree: Object.freeze([-1.9, 0, -0.9]),
});

const MEADOW_GROUND_ZONES = Object.freeze([
  Object.freeze({ color: 0x4f7146, id: 'cool-green' }),
  Object.freeze({ color: 0x9a8a4f, id: 'warm-dry' }),
  Object.freeze({ color: 0x76583d, id: 'soil' }),
]);

function meadowHeight(x, z) {
  return Math.sin(x * 0.28) * Math.cos(z * 0.23) * 0.08
    + Math.sin((x + z) * 0.19) * 0.035;
}

function smooth01(value) {
  const clamped = THREE.MathUtils.clamp(value, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
}

function meadowGroundColor(x, z, target = new THREE.Color()) {
  const cool = new THREE.Color(MEADOW_GROUND_ZONES[0].color);
  const dry = new THREE.Color(MEADOW_GROUND_ZONES[1].color);
  const soil = new THREE.Color(MEADOW_GROUND_ZONES[2].color);
  const dryAmount = smooth01((x + 4.5) / 10.5)
    * (0.58 + smooth01((3.5 - z) / 9) * 0.34);
  const soilDistance = Math.abs(x + z * 0.48 - 0.45);
  const soilAmount = 1 - smooth01((soilDistance - 0.35) / 1.65);
  const broadVariation = 0.94
    + Math.sin(x * 0.61 + z * 0.17) * 0.035
    + Math.cos(z * 0.53 - x * 0.14) * 0.025;
  return target.copy(cool)
    .lerp(dry, dryAmount * 0.88)
    .lerp(soil, soilAmount * 0.94)
    .multiplyScalar(broadVariation);
}

function naturalMeadowColor(x, z, target = new THREE.Color()) {
  const variation = 0.94
    + Math.sin(x * 0.42 + z * 0.19) * 0.035
    + Math.cos(z * 0.37 - x * 0.11) * 0.025;
  const coolDrift = smooth01((z + 8) / 16) * 0.08;
  return target.set(0x56764b)
    .lerp(new THREE.Color(0x496b48), coolDrift)
    .multiplyScalar(variation);
}

function writeMeadowGroundColors(geometry, scenePreset) {
  const positions = geometry.getAttribute('position');
  const colors = geometry.getAttribute('color')
    ?? new THREE.BufferAttribute(new Float32Array(positions.count * 3), 3);
  const color = new THREE.Color();
  const zoned = scenePreset === 'ground_adoption_zones';
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const z = positions.getZ(index);
    (zoned ? meadowGroundColor : naturalMeadowColor)(x, z, color)
      .toArray(colors.array, index * 3);
  }
  if (!geometry.getAttribute('color')) geometry.setAttribute('color', colors);
  colors.needsUpdate = true;
  return zoned
    ? MEADOW_GROUND_ZONES.map(({ id }) => id)
    : ['natural-green'];
}

function createMeadowGroundGeometry(scenePreset) {
  const geometry = new THREE.PlaneGeometry(23, 19, 72, 60);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.getAttribute('position');
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const z = positions.getZ(index);
    positions.setY(index, meadowHeight(x, z));
  }
  positions.needsUpdate = true;
  writeMeadowGroundColors(geometry, scenePreset);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.name = 'ToonLab vegetation meadow terrain';
  return geometry;
}

function mulberry32(seed) {
  let value = seed;
  return () => {
    value |= 0;
    value = (value + 0x6d2b79f5) | 0;
    let next = Math.imul(value ^ (value >>> 15), 1 | value);
    next = (next + Math.imul(next ^ (next >>> 7), 61 | next)) ^ next;
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

async function createGrassPreview({ flowerClearing = false, soilLane = false } = {}) {
  const random = mulberry32(407);
  const placements = [];
  const spacing = 0.72;
  for (let z = -7.2; z <= 7.2; z += spacing) {
    for (let x = -9; x <= 9; x += spacing) {
      if ((x / 9.35) ** 2 + (z / 7.5) ** 2 > 1) continue;
      const px = x + (random() - 0.5) * spacing * 0.62;
      const pz = z + (random() - 0.5) * spacing * 0.62;
      if (flowerClearing && Math.hypot(px - 2.25, pz - 0.75) < 1.35) continue;
      // Leave a readable but still planted soil lane through the meadow.
      // Clumps on both shoulders continue to sample the soil zone, proving
      // that the color shift is ground-driven instead of a separate palette.
      const soilDistance = Math.abs(px + pz * 0.48 - 0.45);
      const keepChance = !soilLane
        ? 1
        : soilDistance < 0.48
          ? 0.18
          : soilDistance < 1.08
            ? 0.56
            : 1;
      if (random() > keepChance) continue;
      placements.push({
        normal: [0, 1, 0],
        phase: random(),
        scale: 0.86 + random() * 0.25,
        x: px,
        y: meadowHeight(px, pz) + 0.015,
        yaw: random() * Math.PI * 2,
        z: pz,
      });
    }
  }
  const field = await createCallMeSenseiGrassField({
    groundAdoptHeight: 0.92,
    groundAdoptStrength: 1,
    groundAdoptTint: [0.96, 1.02, 0.92],
    groundField: true,
    placements,
    variant: 'primary',
  });
  field.name = 'ToonLab Call Me Sensei meadow preview';
  field.userData.toonlabShaderPreviewAsset = {
    id: 'toonlab-call-me-sensei-meadow',
    kind: 'procedural',
    source: 'ToonLab createCallMeSenseiGrassField',
  };
  return field;
}

function createPlantPreview(asset, componentId) {
  const root = createPlantFromRecipe(asset.recipe);
  root.name = `${componentId === 'tree' ? 'Tree' : 'Flower'} Shader Preview · ${asset.label}`;
  root.userData.toonlabShaderPreviewAsset = {
    id: asset.id,
    kind: 'procedural',
    source: asset.source,
  };
  return root;
}

function alignToGround(root, componentId) {
  root.position.set(...COMPONENT_POSITION[componentId]);
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root, true);
  if (Number.isFinite(bounds.min.y)) root.position.y -= bounds.min.y;
  root.updateMatrixWorld(true);
}

function disposePreviewRoot(root) {
  root?.parent?.remove(root);
  if (typeof root?.dispose === 'function') {
    root.dispose();
    return;
  }
  root?.traverse?.((object) => {
    object.geometry?.dispose?.();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.filter(Boolean).forEach((material) => material.dispose?.());
  });
}

function srgbTriplet(hex) {
  const value = String(hex).replace('#', '');
  return [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255);
}

function authoredComponents(scope) {
  const component = SCOPE_COMPONENT[scope];
  return new Set(Array.isArray(component) ? component : [component]);
}

export async function createVegetationMaterialLabEngine({ mount, store }) {
  const renderer = createLabRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.BasicShadowMap;
  mount.appendChild(renderer.domElement);
  await whenRendererReady(renderer);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8ba8bd);
  scene.fog = new THREE.Fog(0x8ba8bd, 22, 58);
  const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.05,
    250,
  );
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.maxPolarAngle = Math.PI / 2 - 0.03;
  const cameraMouseButtons = {
    pan: THREE.MOUSE.PAN,
    rotate: THREE.MOUSE.ROTATE,
    zoom: THREE.MOUSE.DOLLY,
  };
  let appliedCameraMode = null;
  function syncCameraMode() {
    const cameraMode = store.getState().view.cameraMode ?? 'rotate';
    if (cameraMode === appliedCameraMode) return;
    appliedCameraMode = cameraMode;
    controls.mouseButtons.LEFT = cameraMouseButtons[cameraMode] ?? THREE.MOUSE.ROTATE;
    document.body.dataset.cameraMode = cameraMode;
  }
  syncCameraMode();
  const scope = store.getState().scope;

  const ambient = new THREE.HemisphereLight(0xc7dcff, 0x34452f, 0.6);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xfff0d2, 1.25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 0.1;
  sun.shadow.camera.far = 70;
  sun.shadow.camera.left = -14;
  sun.shadow.camera.right = 14;
  sun.shadow.camera.top = 14;
  sun.shadow.camera.bottom = -14;
  scene.add(sun);
  scene.add(sun.target);
  const sunShadowPass = createEnvironmentSunShadowPass({ renderer, scene });

  const groundMaterial = new MeshBasicNodeMaterial({
    color: 0xffffff,
  });
  const groundLight = {
    sunColor: uniform(new THREE.Color()),
    skyColor: uniform(new THREE.Color()),
    bottomColor: uniform(new THREE.Color()),
    direction: uniform(new THREE.Vector3()),
  };
  // Grass adopts visible ground color, including light and cast shadows.
  // The meadow and its field writer must therefore share the same graph.
  const groundDirect = dot(normalWorld, groundLight.direction).max(0)
    .mul(sampleEnvironmentSunShadow(positionWorld));
  const groundAmbient = mix(groundLight.bottomColor, groundLight.skyColor,
    normalWorld.y.mul(0.5).add(0.5));
  groundMaterial.colorNode = attribute('color', 'vec3')
    .mul(uniform(groundMaterial.color))
    .mul(groundAmbient.add(groundLight.sunColor.mul(groundDirect)));
  groundMaterial.roughness = 0.94;
  let groundColorVariant;
  groundMaterial.userData.createGroundColorVariant = () => {
    groundColorVariant ??= new MeshBasicNodeMaterial({ side: THREE.DoubleSide, fog: false });
    groundColorVariant.name = 'ToonLab meadow ground-field visible color writer';
    groundColorVariant.colorNode = groundMaterial.colorNode;
    return groundColorVariant;
  };
  groundMaterial.addEventListener('dispose', () => groundColorVariant?.dispose());
  const groundGeometry = createMeadowGroundGeometry(
    store.getState().preview.scenePreset,
  );
  const ground = new THREE.Mesh(
    groundGeometry,
    groundMaterial,
  );
  ground.name = 'ToonLab procedural meadow ground';
  ground.receiveShadow = true;
  ground.userData.groundFieldWrite = true;
  ground.userData.meadowGroundZones = store.getState().preview.scenePreset
    === 'ground_adoption_zones'
    ? MEADOW_GROUND_ZONES.map(({ id }) => id)
    : ['natural-green'];
  scene.add(ground);
  const snowMaterial = new THREE.MeshStandardMaterial({
    color: 0xdce8ef,
    opacity: 0,
    roughness: 0.98,
    transparent: true,
  });
  const snow = new THREE.Mesh(
    groundGeometry.clone(),
    snowMaterial,
  );
  snow.position.y = 0.012;
  snow.receiveShadow = true;
  scene.add(snow);

  const authored = authoredComponents(scope);
  const previewGroup = new THREE.Group();
  previewGroup.name = 'ToonLab procedural vegetation preview';
  scene.add(previewGroup);
  const roots = {
    flowers: createPlantPreview(DEFAULT_FLOWER_SHADER_PREVIEW_ASSET, 'flowers'),
    grass: await createGrassPreview({
      flowerClearing: scope === 'flower',
      soilLane: scope === 'grass',
    }),
    tree: createPlantPreview(DEFAULT_TREE_SHADER_PREVIEW_ASSET, 'tree'),
  };
  Object.entries(roots).forEach(([componentId, root]) => {
    previewGroup.add(root);
    if (componentId !== 'grass') alignToGround(root, componentId);
  });
  roots.tree.traverse?.((object) => { if (object.isMesh) object.castShadow = true; });
  roots.flowers.traverse?.((object) => { if (object.isMesh) object.castShadow = true; });

  environmentGroundField.colorMipLevel.value = 0;
  const groundFieldPass = createEnvironmentGroundFieldPass({
    renderer,
    resolution: 768,
    scene,
  });

  const interactionTarget = new THREE.Object3D();
  interactionTarget.position.set(0.5, 0, 0.4);
  scene.add(interactionTarget);
  const isolateDirection = new THREE.Vector3(0.82, 0.38, 1).normalize();
  const timer = new THREE.Timer();
  timer.connect(document);

  let appliedPreviewAsset = scope === 'tree'
    ? DEFAULT_TREE_SHADER_PREVIEW_ASSET
    : scope === 'flower'
      ? DEFAULT_FLOWER_SHADER_PREVIEW_ASSET
      : null;
  let appliedPreviewHour = null;
  let appliedPreviewState = null;
  let appliedRevision = -1;
  let appliedViewMode = null;
  let autoCycleAccumulator = 0;
  let disposed = false;
  let profileQueued = false;
  let profileRunning = false;
  let appliedGroundPalette = store.getState().preview.scenePreset;
  const retiredRoots = [];

  function retirePreviewRoot(root) {
    root?.parent?.remove(root);
    if (root) retiredRoots.push({ frames: 0, root });
  }

  function targetEntries({ all = false } = {}) {
    const entries = Object.entries(roots).map(([componentId, root]) => [
      TARGET_SCOPE[componentId],
      root,
    ]);
    if (all || scope === 'vegetation') return entries;
    const authoredComponent = SCOPE_COMPONENT[scope];
    return entries.filter(([, root]) => root === roots[authoredComponent]);
  }

  function boundsForTargets({ all = false } = {}) {
    const bounds = new THREE.Box3();
    targetEntries({ all }).forEach(([, root]) => bounds.expandByObject(root, true));
    return bounds;
  }

  function syncPreviewAsset() {
    if (scope !== 'tree' && scope !== 'flower') return false;
    const componentId = SCOPE_COMPONENT[scope];
    const asset = store.getState().view.previewAsset;
    // The store replaces this immutable asset on import/selection. Comparing
    // IDs alone misses edits to a recipe reimported under its existing ID.
    if (!asset?.recipe || asset === appliedPreviewAsset) return false;
    const previous = roots[componentId];
    const next = createPlantPreview(asset, componentId);
    roots[componentId] = next;
    previewGroup.add(next);
    alignToGround(next, componentId);
    // WebGPU can still have submitted work referencing the previous plant's
    // geometry. Retire it after several complete frames instead of destroying
    // its buffers in the same callback that swaps the preview asset.
    retirePreviewRoot(previous);
    appliedPreviewAsset = asset;
    document.body.dataset.previewAsset = asset.id;
    document.body.dataset.previewAssetKind = 'procedural';
    const bounds = new THREE.Box3().setFromObject(next, true);
    document.body.dataset.previewProceduralBoundsFinite = String([
      bounds.min.x, bounds.min.y, bounds.min.z,
      bounds.max.x, bounds.max.y, bounds.max.z,
    ].every(Number.isFinite));
    return true;
  }

  function frameMode(mode = store.getState().view.viewMode) {
    if (scope === 'grass' && mode !== 'top') {
      controls.target.set(0, 0.48, -0.2);
      camera.up.set(0, 1, 0);
      camera.position.set(
        mode === 'isolate' ? 10.4 : 12.8,
        mode === 'isolate' ? 5.8 : 8.2,
        mode === 'isolate' ? 12.2 : 15.5,
      );
      camera.lookAt(controls.target);
      controls.update();
      return;
    }
    if (scope === 'flower' && mode === 'composition') {
      controls.target.set(2.2, 0.54, 0.7);
      camera.up.set(0, 1, 0);
      camera.position.set(4.15, 1.45, 3.45);
      camera.lookAt(controls.target);
      controls.update();
      return;
    }
    const bounds = boundsForTargets({ all: mode === 'composition' });
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const radius = Math.max(size.length() * 0.5, 0.5);
    const verticalFov = THREE.MathUtils.degToRad(camera.fov);
    const horizontalFov = 2 * Math.atan(
      Math.tan(verticalFov * 0.5) * Math.max(camera.aspect, 0.1),
    );
    const fitDistance = radius / Math.max(Math.min(
      Math.tan(verticalFov * 0.5),
      Math.tan(horizontalFov * 0.5),
    ), 0.01) * 1.2;
    controls.target.copy(center);
    camera.up.set(0, 1, 0);
    if (mode === 'top') {
      camera.position.copy(center).add(new THREE.Vector3(0.01, fitDistance, 0.01));
      camera.up.set(0, 0, -1);
    } else {
      const minimumDistance = scope === 'flower' ? 3 : scope === 'tree' ? 7 : 9;
      camera.position.copy(center).addScaledVector(
        isolateDirection,
        Math.max(fitDistance, minimumDistance),
      );
    }
    camera.lookAt(controls.target);
    controls.update();
  }

  function applyContextStyle(componentId, style) {
    if (authored.has(componentId)) return;
    const targetScope = TARGET_SCOPE[componentId];
    if (!targetScope) return;
    applyVegetationShaderScope(
      roots[componentId],
      targetScope,
      style === 'call_me_sensei' ? { preset: 'call_me_sensei' } : {},
    );
  }

  function applyPreviewState() {
    const { preview, view } = store.getState();
    if (preview.scenePreset !== appliedGroundPalette) {
      appliedGroundPalette = preview.scenePreset;
      ground.userData.meadowGroundZones = writeMeadowGroundColors(
        ground.geometry,
        appliedGroundPalette,
      );
      // The snow overlay uses the same topology but not the meadow colors.
      groundFieldPass.invalidate();
      groundFieldPass.update();
    }
    const styles = resolveVegetationPreviewComponentStyles(preview);
    Object.entries(styles).forEach(([componentId, style]) => {
      applyContextStyle(componentId, style);
    });
    const isolate = view.viewMode === 'isolate';
    for (const [componentId, root] of Object.entries(roots)) {
      root.visible = authored.has(componentId)
        || (!isolate && preview.componentVisibility[componentId] !== false);
    }
    ground.visible = preview.componentVisibility.ground !== false;
    snow.visible = ground.visible && view.snowCover > 0;
    sun.visible = preview.componentVisibility.lighting !== false;
    ambient.visible = preview.componentVisibility.lighting !== false;
    appliedPreviewState = JSON.stringify(preview);
  }

  function syncWorldState() {
    const state = store.getState();
    const sampled = sampleLabPreviewReferenceState(state.previewHour);
    const angle = ((state.previewHour - 6) / 24) * Math.PI * 2;
    const rawHeight = Math.sin(angle);
    const dayAmount = THREE.MathUtils.clamp((rawHeight + 0.18) / 1.18, 0, 1);
    const lightingVisible = state.preview.componentVisibility.lighting !== false;
    const sunDirection = new THREE.Vector3(
      Math.cos(angle) * 0.72,
      Math.max(rawHeight, 0.08),
      Math.sin(angle) * 0.52,
    ).normalize();
    sun.color.set(sampled.directLightColor);
    sun.intensity = lightingVisible ? 0.14 + dayAmount * 0.98 : 0;
    sun.position.copy(sunDirection).multiplyScalar(24);
    sun.target.position.set(0, 0.7, 0);
    ambient.color.set(sampled.ambientColor);
    ambient.intensity = lightingVisible ? 0.2 + dayAmount * 0.32 : 0;
    groundLight.sunColor.value.copy(sun.color).multiplyScalar(sun.intensity);
    groundLight.skyColor.value.copy(ambient.color).multiplyScalar(ambient.intensity);
    groundLight.bottomColor.value.copy(ambient.groundColor).multiplyScalar(ambient.intensity);
    groundLight.direction.value.copy(sunDirection);
    const background = new THREE.Color(sampled.ambientColor)
      .multiplyScalar(0.48 + dayAmount * 0.3);
    scene.background.copy(background);
    scene.fog.color.copy(background);

    const sunColor = srgbTriplet(sampled.directLightColor);
    const skyColor = srgbTriplet(sampled.ambientColor);
    for (const root of Object.values(roots)) {
      root.setSun?.({
        color: sunColor,
        direction: sunDirection.toArray(),
        intensity: sun.intensity,
        sky: skyColor,
        skyIntensity: ambient.intensity,
      });
      root.setWind?.({ speed: 1, strength: 0.05 * state.view.windStrength });
      root.setCloudShadow?.({
        coverage: 0.58,
        scale: 0.035,
        strength: 0.45,
        velocity: [0.007, -0.004],
      });
      root.setSurfaceWeather?.({
        snowCover: state.view.snowCover,
        wetness: state.view.wetness,
      });
      root.setSceneFog?.(scene.fog);
    }
    roots.grass.setPushTarget?.(
      state.view.interactionAmount > 0 ? interactionTarget : null,
    );
    roots.grass.setPushRadius?.(1.7 * state.view.interactionAmount);
    const groundStyle = resolveVegetationPreviewComponentStyles(state.preview).ground;
    groundMaterial.color.set(groundStyle === 'neutral_review' ? 0xd2d0c5 : 0xffffff);
    groundMaterial.color.multiplyScalar(1 - state.view.wetness * 0.24);
    groundMaterial.roughness = 0.94 - state.view.wetness * 0.32;
    snowMaterial.opacity = state.view.snowCover * 0.78;
    snow.visible = ground.visible && state.view.snowCover > 0;
    const grassMaterial = roots.grass.lodMeshes?.[0]?.material;
    document.body.dataset.meadowGrassApi = 'createCallMeSenseiGrassField';
    document.body.dataset.meadowGrassGroundAdoption = String(
      grassMaterial?.uniforms?.uGroundAdoptStrength?.value ?? 0,
    );
    document.body.dataset.meadowGrassInstances = String(
      roots.grass.instanceCount ?? 0,
    );
    document.body.dataset.meadowGroundFieldReady = String(groundFieldPass.ready);
    document.body.dataset.meadowGroundPalette = appliedGroundPalette;
    document.body.dataset.meadowGroundZones = ground.userData.meadowGroundZones.join(',');
    document.body.dataset.previewGrassInteraction = String(state.view.interactionAmount);
    document.body.dataset.previewSnowCover = String(state.view.snowCover);
    document.body.dataset.previewWetness = String(state.view.wetness);
    appliedPreviewHour = state.previewHour;
  }

  async function applyProfileOnce() {
    syncPreviewAsset();
    const settings = store.getState().settings;
    const reports = targetEntries().map(([targetScope, root]) => ({
      ...applyVegetationShaderScope(root, targetScope, settings),
      adapter: 'canonical-vegetation-procedural',
      errors: [],
      fallback: 0,
    }));
    if (disposed) return;
    const coverage = reports.reduce((total, report) => ({
      applied: total.applied + report.applied,
      fallback: total.fallback + report.fallback,
      matched: total.matched + report.matched,
      unsupported: total.unsupported + report.unsupported.length,
      writes: total.writes + report.writes,
    }), { applied: 0, fallback: 0, matched: 0, unsupported: 0, writes: 0 });
    store.actions.adoptEngineState({
      coverage,
      runtimeAdapter: 'canonical-vegetation-procedural',
      runtimeErrors: [],
    });
    document.body.dataset.previewScene = 'toonlab-procedural-garden';
    document.body.dataset.shaderAdapter = 'canonical-vegetation-procedural';
    document.body.dataset.shaderFallbackCount = '0';
    document.body.dataset.shaderMatched = String(coverage.matched);
    document.body.dataset.shaderScope = scope;
    document.body.dataset.shaderUnsupported = String(coverage.unsupported);
    document.body.dataset.shaderWrites = String(coverage.writes);
    document.body.dataset.shaderRuntimeErrors = '0';
    syncWorldState();
  }

  async function applyProfile() {
    if (profileRunning) {
      profileQueued = true;
      return;
    }
    profileRunning = true;
    document.body.dataset.vegetationShaderLoading = 'true';
    try {
      do {
        profileQueued = false;
        await applyProfileOnce();
      } while (profileQueued && !disposed);
    } finally {
      profileRunning = false;
      document.body.dataset.vegetationShaderLoading = 'false';
    }
  }

  const unsubscribe = store.subscribe(() => {
    const state = store.getState();
    syncCameraMode();
    let profileNeedsApply = false;
    if (
      (scope === 'tree' || scope === 'flower')
      && state.view.previewAsset !== appliedPreviewAsset
    ) {
      syncPreviewAsset();
      profileNeedsApply = true;
      frameMode();
      applyPreviewState();
    }
    if (state.docRevision !== appliedRevision) {
      appliedRevision = state.docRevision;
      profileNeedsApply = true;
    }
    if (profileNeedsApply) void applyProfile();
    syncWorldState();
    if (JSON.stringify(state.preview) !== appliedPreviewState) applyPreviewState();
    if (state.view.viewMode !== appliedViewMode) {
      appliedViewMode = state.view.viewMode;
      frameMode();
      applyPreviewState();
    }
  });

  function animate(timestamp) {
    if (disposed) return;
    requestAnimationFrame(animate);
    timer.update(timestamp);
    const delta = Math.min(timer.getDelta(), 0.05);
    if (store.getState().previewAutoCycle) {
      autoCycleAccumulator += delta;
      if (autoCycleAccumulator >= 0.1) {
        const elapsed = autoCycleAccumulator;
        autoCycleAccumulator = 0;
        store.actions.setPreviewHour(store.getState().previewHour + elapsed * 0.5);
      }
    } else {
      autoCycleAccumulator = 0;
    }
    Object.values(roots).forEach((root) => root.update?.(delta, camera));
    controls.update();
    // Leaf positions animate even when the camera and light are unchanged.
    sunShadowPass.update({ camera, dynamic: true });
    document.body.dataset.previewSunShadowReady = String(sunShadowPass.ready);
    // Wind moves cast shadows over the meadow even with a stationary sun.
    groundFieldPass.invalidateColor();
    groundFieldPass.update();
    renderer.render(scene, camera);
    for (let index = retiredRoots.length - 1; index >= 0; index -= 1) {
      retiredRoots[index].frames += 1;
      if (retiredRoots[index].frames < 6) continue;
      disposePreviewRoot(retiredRoots[index].root);
      retiredRoots.splice(index, 1);
    }
  }

  function handleResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', handleResize);

  return {
    camera,
    controls,
    dispose() {
      disposed = true;
      unsubscribe();
      window.removeEventListener('resize', handleResize);
      Object.values(roots).forEach(disposePreviewRoot);
      retiredRoots.forEach(({ root }) => disposePreviewRoot(root));
      retiredRoots.length = 0;
      sunShadowPass.dispose();
      groundFieldPass.dispose();
      ground.geometry.dispose();
      groundMaterial.dispose();
      snow.geometry.dispose();
      snowMaterial.dispose();
      renderer.dispose();
    },
    renderer,
    resetCamera() {
      frameMode();
    },
    scene,
    async start() {
      const state = store.getState();
      appliedRevision = state.docRevision;
      appliedPreviewHour = state.previewHour;
      appliedPreviewState = JSON.stringify(state.preview);
      appliedViewMode = state.view.viewMode;
      syncPreviewAsset();
      applyPreviewState();
      groundFieldPass.update();
      syncWorldState();
      await applyProfile();
      frameMode();
      document.body.dataset.modelReady = 'true';
      requestAnimationFrame(animate);
    },
  };
}
