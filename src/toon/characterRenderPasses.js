import * as THREE from 'three';

import { applyShadowClipAdjust } from '../shaders-tsl/chunks/pass-depth-color.js';
import { createSceneDepthColorPass } from '../shaders-tsl/chunks/scene-depth-color-pass.js';
import {
  characterPassFallbackTexture,
  characterStateOfMaterial,
  peekCharacterShadingState,
} from '../shaders-tsl/character/characterState.js';
import { findToonMainLight } from '../shaders-tsl/character/sceneLights.js';
import { cameraShadowDirection } from './characterParameters.js';
import { characterForward, createHeadTracker } from './headBone.js';

// Character render passes (spec §6). Registered characters get:
//
// 1. a depth prepass of the whole scene (float colour target, drawing-buffer
//    size) for the depth rim and the screen-space shadow — characters write
//    it through their own variants, which also mark face pixels;
// 2. an orthographic shadow map of the registered characters only, fitted to
//    their bounds, from the sun or a camera-relative direction;
// 3. head tracking for the face map, face normals and hair ring;
// 4. an optional coverage mask for character-aware post effects.
//
// Each pass runs only when some registered material needs it. Materials read
// the results through their character's shared state (characterState.js).

/** Render layer the registered characters' meshes join (shadow map, mask). */
export const TOON_CHARACTER_LAYER = 30;

const FORWARD = new THREE.Vector3(0, 0, 1);

function toMaterialArray(material) {
  return Array.isArray(material) ? material : [material].filter(Boolean);
}

// One float channel: window depth (offset by 2 on face surfaces).
function createFloatTarget(width, height) {
  const target = new THREE.RenderTarget(Math.max(1, width), Math.max(1, height), {
    depthBuffer: true,
    format: THREE.RedFormat,
    generateMipmaps: false,
    magFilter: THREE.NearestFilter,
    minFilter: THREE.NearestFilter,
    type: THREE.FloatType,
  });
  target.texture.colorSpace = THREE.NoColorSpace;
  target.texture.name = 'ToonCharacterPassTarget';
  return target;
}

function createMaskTarget(width, height) {
  const target = new THREE.RenderTarget(Math.max(1, width), Math.max(1, height), {
    depthBuffer: true,
    format: THREE.RGBAFormat,
    generateMipmaps: false,
    magFilter: THREE.LinearFilter,
    minFilter: THREE.LinearFilter,
    type: THREE.UnsignedByteType,
  });
  target.texture.colorSpace = THREE.NoColorSpace;
  target.texture.name = 'ToonCharacterMask';
  return target;
}

function uniformValue(uniforms, name) {
  const value = uniforms?.[name]?.value;
  return Number.isFinite(value) ? value : 0;
}

function anyRole(uniforms, name) {
  return Math.max(
    uniformValue(uniforms, name),
    uniformValue(uniforms, `${name}Skin`),
    uniformValue(uniforms, `${name}Face`),
    uniformValue(uniforms, `${name}Hair`),
  );
}

// What a registered material asks of the passes.
function materialNeeds(material) {
  const uniforms = material.uniforms;
  if (!material.isToonCharacterMaterial || material.visible === false || material.userData?.toonFlags?.isOutline) {
    return { depth: false, shadow: false };
  }
  const depthRim = uniformValue(uniforms, 'rimMode') < 0.5 &&
    (anyRole(uniforms, 'rimIntensity') > 0) &&
    uniformValue(uniforms, 'rimWidth') > 0;
  const screenShadow = anyRole(uniforms, 'screenShadowStrength') > 0 && uniformValue(uniforms, 'screenShadowWidth') > 0;
  return { depth: depthRim || screenShadow, shadow: anyRole(uniforms, 'characterShadowStrength') > 0 };
}

/**
 * Creates the character render passes for one scene and camera. Call
 * `update()` every frame before rendering the scene, `setSize()` when the
 * drawing buffer changes.
 * @param {{ camera: THREE.Camera, renderer: any, scene: THREE.Scene, shadowMapSize?: number, shadowMargin?: number, [option: string]: any }} options
 */
export function createCharacterRenderPasses({
  camera,
  renderer,
  scene,
  shadowMapSize = 2048,
  shadowMargin = 0.12,
} = /** @type {any} */ ({})) {
  if (!renderer || !scene || !camera) {
    throw new TypeError('createCharacterRenderPasses requires { renderer, scene, camera }.');
  }
  const records = new Map();
  const depthPass = createSceneDepthColorPass({ scene });
  const size = { height: 0, pixelRatio: 1, width: 0 };
  let depthTarget = null;
  let shadowTarget = null;
  let maskTarget = null;
  let maskEnabled = false;
  let disposed = false;
  const shadowCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 10);
  shadowCamera.layers.set(TOON_CHARACTER_LAYER);
  const shadowMatrix = new THREE.Matrix4();
  const variantCache = new WeakMap();
  const swapCache = new WeakMap();
  const clearColor = new THREE.Color();
  const scratch = {
    box: new THREE.Box3(),
    center: new THREE.Vector3(),
    direction: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    sphere: new THREE.Sphere(),
    vector: new THREE.Vector3(),
  };

  function statesOf(root) {
    const states = new Set();
    const own = peekCharacterShadingState(root);
    if (own) states.add(own);
    root.traverse((object) => {
      if (!object.isMesh || !object.material) return;
      for (const material of toMaterialArray(object.material)) {
        const state = characterStateOfMaterial(material);
        if (state) states.add(state);
      }
    });
    return states;
  }

  function bodyMeshes(root) {
    const meshes = [];
    root.traverse((object) => {
      if (!object.isMesh || object.userData?.isToonOutline || object.userData?.isToonFurShell) return;
      meshes.push(object);
    });
    return meshes;
  }

  function registerCharacterRoot(root) {
    if (!root || disposed) return null;
    unregisterCharacterRoot(root);
    root.updateMatrixWorld(true);
    const states = statesOf(root);
    const meshes = bodyMeshes(root);
    for (const mesh of meshes) mesh.layers.enable(TOON_CHARACTER_LAYER);

    // Bounds in the root's own frame, re-placed every frame.
    const inverseRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const localBox = new THREE.Box3();
    for (const mesh of meshes) {
      const geometry = mesh.geometry;
      if (!geometry?.attributes?.position) continue;
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      scratch.box.copy(geometry.boundingBox).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverseRoot, mesh.matrixWorld));
      localBox.union(scratch.box);
    }
    const localSphere = localBox.isEmpty() ? new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1) : localBox.getBoundingSphere(new THREE.Sphere());

    // Head frame: calibrated in the character's own frame, so a character
    // that is already turned still tracks its face.
    const tracker = createHeadTracker(root);
    let sphereInHead = null;
    const faceFrame = [...states].find((state) => state.faceFrame)?.faceFrame ?? null;
    if (tracker && faceFrame) {
      const world = faceFrame.sphereCenterRoot.clone().applyMatrix4(root.matrixWorld);
      tracker.headBone.updateMatrixWorld(true);
      sphereInHead = world.applyMatrix4(new THREE.Matrix4().copy(tracker.headBone.matrixWorld).invert());
    }

    if (localBox.isEmpty()) localBox.setFromCenterAndSize(new THREE.Vector3(0, 0.9, 0), new THREE.Vector3(1, 1.8, 1));
    const record = { localBox, localSphere, meshes, root, sphereInHead, states, tracker };
    records.set(root, record);
    bindTargets(record);
    return record;
  }

  function unregisterCharacterRoot(root) {
    const record = records.get(root);
    if (!record) return false;
    records.delete(root);
    for (const mesh of record.meshes) mesh.layers.disable(TOON_CHARACTER_LAYER);
    for (const state of record.states) {
      state.depthReady.value = 0;
      state.shadowReady.value = 0;
      state.depthMap.value = characterPassFallbackTexture();
      state.shadowMap.value = characterPassFallbackTexture();
    }
    return true;
  }

  function bindTargets(record) {
    for (const state of record.states) {
      if (depthTarget) state.depthMap.value = depthTarget.texture;
      if (shadowTarget) state.shadowMap.value = shadowTarget.texture;
    }
  }

  function drawingBufferSize() {
    if (size.width > 0 && size.height > 0) {
      return [Math.round(size.width * size.pixelRatio), Math.round(size.height * size.pixelRatio)];
    }
    const buffer = renderer.getDrawingBufferSize?.(new THREE.Vector2());
    return buffer ? [buffer.x, buffer.y] : [1, 1];
  }

  function ensureDepthTarget() {
    const [width, height] = drawingBufferSize();
    if (!depthTarget) {
      depthTarget = createFloatTarget(width, height);
      depthTarget.texture.name = 'ToonCharacterDepthPrepass';
      for (const record of records.values()) bindTargets(record);
    } else if (depthTarget.width !== width || depthTarget.height !== height) {
      depthTarget.setSize(width, height);
    }
    return depthTarget;
  }

  function ensureShadowTarget() {
    if (!shadowTarget) {
      shadowTarget = createFloatTarget(shadowMapSize, shadowMapSize);
      shadowTarget.texture.name = 'ToonCharacterShadowMap';
      for (const record of records.values()) bindTargets(record);
    }
    return shadowTarget;
  }

  function ensureMaskTarget() {
    const [width, height] = drawingBufferSize();
    if (!maskTarget) maskTarget = createMaskTarget(width, height);
    else if (maskTarget.width !== width || maskTarget.height !== height) maskTarget.setSize(width, height);
    return maskTarget;
  }

  function updateHeads() {
    for (const record of records.values()) {
      const { root, sphereInHead, states, tracker } = record;
      root.getWorldQuaternion(scratch.quaternion);
      const restForward = characterForward(root).applyQuaternion(scratch.quaternion).normalize();
      const restUp = new THREE.Vector3(0, 1, 0).applyQuaternion(scratch.quaternion).normalize();
      if (tracker) tracker.update();
      for (const state of states) {
        state.headRestForward.value.copy(restForward);
        state.headRestUp.value.copy(restUp);
        if (!tracker) continue;
        state.headForward.value.copy(tracker.state.forward);
        state.headUp.value.copy(tracker.state.up);
        state.headPosition.value.copy(tracker.state.position);
        if (sphereInHead) state.headSphereCenter.value.copy(sphereInHead).applyMatrix4(tracker.headBone.matrixWorld);
        else state.headSphereCenter.value.copy(tracker.state.position).addScaledVector(tracker.state.up, 0.08);
        state.headReady.value = 1;
      }
    }
  }

  function collectNeeds() {
    const needs = { depth: false, shadow: false, shadowSettings: null };
    for (const record of records.values()) {
      for (const state of record.states) {
        if (state.shadowSettings && !needs.shadowSettings) needs.shadowSettings = state.shadowSettings;
        for (const material of state.materials) {
          const need = materialNeeds(material);
          needs.depth ||= need.depth;
          needs.shadow ||= need.shadow;
        }
      }
    }
    return needs;
  }

  function setReady(key, value) {
    for (const record of records.values()) {
      for (const state of record.states) state[key].value = value;
    }
  }

  function variantFor(material, kind) {
    let entry = variantCache.get(material);
    if (!entry) {
      entry = {};
      variantCache.set(material, entry);
    }
    if (!entry[kind]) {
      const factory = kind === 'mask' ? material?.userData?.createMaskVariant : material?.userData?.createDepthColorVariant;
      entry[kind] = typeof factory === 'function' ? factory() : null;
    }
    if (entry[kind]) entry[kind].visible = material?.visible !== false;
    return entry[kind];
  }

  // Swaps each registered mesh to its cached per-mesh pass variant (keyed by
  // the source material, so the renderer sees stable material arrays).
  function swapMaterials(kind) {
    const restores = [];
    for (const record of records.values()) {
      for (const mesh of record.meshes) {
        const source = mesh.material;
        let swaps = swapCache.get(mesh);
        if (!swaps) {
          swaps = {};
          swapCache.set(mesh, swaps);
        }
        let swap = swaps[kind];
        if (!swap || swap.source !== source) {
          const swapped = Array.isArray(source)
            ? source.map((material) => variantFor(material, kind) ?? hiddenMaterial)
            : variantFor(source, kind) ?? hiddenMaterial;
          swap = { source, swapped };
          swaps[kind] = swap;
        } else {
          for (const material of toMaterialArray(source)) variantFor(material, kind);
        }
        restores.push([mesh, source]);
        mesh.material = swap.swapped;
      }
    }
    return () => {
      for (const [mesh, material] of restores) mesh.material = material;
    };
  }

  function renderCharacterLayer(target, renderCamera, kind, clear) {
    const restoreMaterials = swapMaterials(kind);
    const previousTarget = renderer.getRenderTarget();
    const previousBackground = scene.background;
    const previousFog = scene.fog;
    const previousOverride = scene.overrideMaterial;
    const previousLayers = renderCamera.layers.mask;
    renderer.getClearColor(clearColor);
    const previousAlpha = renderer.getClearAlpha();
    const previousShadow = renderer.shadowMap?.enabled;
    try {
      scene.background = null;
      scene.fog = null;
      scene.overrideMaterial = null;
      if (renderer.shadowMap) renderer.shadowMap.enabled = false;
      renderCamera.layers.set(TOON_CHARACTER_LAYER);
      renderer.setRenderTarget(target);
      renderer.setClearColor(clear.color, clear.alpha);
      renderer.clear();
      renderer.render(scene, renderCamera);
    } finally {
      restoreMaterials();
      renderCamera.layers.mask = previousLayers;
      scene.background = previousBackground;
      scene.fog = previousFog;
      scene.overrideMaterial = previousOverride;
      renderer.setRenderTarget(previousTarget);
      renderer.setClearColor(clearColor, previousAlpha);
      if (renderer.shadowMap) renderer.shadowMap.enabled = previousShadow;
    }
  }

  function shadowDirection(settings, out) {
    if (settings?.direction === 'camera') {
      camera.updateMatrixWorld();
      return out.copy(cameraShadowDirection(settings)).transformDirection(camera.matrixWorld);
    }
    const sun = findToonMainLight(scene);
    if (!sun) return null;
    sun.getWorldPosition(out);
    if (sun.target) {
      sun.target.updateMatrixWorld();
      out.sub(sun.target.getWorldPosition(scratch.vector));
    }
    return out.lengthSq() > 1e-12 ? out.normalize() : null;
  }

  function renderShadowMap(settings) {
    const direction = shadowDirection(settings, scratch.direction);
    if (!direction) {
      setReady('shadowReady', 0);
      return false;
    }
    // Fit tightly to every registered character's bounds as seen from the
    // light: aim at the bounds' centre, then size the frustum to the box
    // corners in the light's view.
    const bounds = new THREE.Box3();
    for (const record of records.values()) {
      scratch.sphere.copy(record.localSphere).applyMatrix4(record.root.matrixWorld);
      bounds.union(scratch.sphere.getBoundingBox(scratch.box));
    }
    if (bounds.isEmpty()) return false;
    const sphere = bounds.getBoundingSphere(scratch.sphere);
    const reach = Math.max(sphere.radius, 0.05) * 2;
    shadowCamera.position.copy(sphere.center).addScaledVector(direction, reach);
    shadowCamera.up.set(0, 1, 0);
    if (Math.abs(direction.y) > 0.999) shadowCamera.up.set(0, 0, 1);
    shadowCamera.lookAt(sphere.center);
    shadowCamera.updateMatrixWorld(true);
    const inverse = shadowCamera.matrixWorldInverse;
    const fit = new THREE.Box3();
    const corner = scratch.vector;
    for (const record of records.values()) {
      const toLight = new THREE.Matrix4().multiplyMatrices(inverse, record.root.matrixWorld);
      const { max: hi, min: lo } = record.localBox;
      for (let i = 0; i < 8; i += 1) {
        corner.set(i & 1 ? hi.x : lo.x, i & 2 ? hi.y : lo.y, i & 4 ? hi.z : lo.z).applyMatrix4(toLight);
        fit.expandByPoint(corner);
      }
    }
    const margin = shadowMargin * Math.max(fit.max.x - fit.min.x, fit.max.y - fit.min.y) * 0.5;
    shadowCamera.left = fit.min.x - margin;
    shadowCamera.right = fit.max.x + margin;
    shadowCamera.bottom = fit.min.y - margin;
    shadowCamera.top = fit.max.y + margin;
    shadowCamera.near = Math.max(0.001, -fit.max.z - margin);
    shadowCamera.far = -fit.min.z + margin;
    shadowCamera.coordinateSystem = renderer.coordinateSystem;
    shadowCamera.updateProjectionMatrix();
    shadowCamera.updateMatrixWorld(true);
    const texelsPerMetre = shadowMapSize / Math.max(shadowCamera.right - shadowCamera.left, shadowCamera.top - shadowCamera.bottom);
    shadowMatrix.multiplyMatrices(shadowCamera.projectionMatrix, shadowCamera.matrixWorldInverse);
    applyShadowClipAdjust(shadowMatrix, renderer);

    const target = ensureShadowTarget();
    renderCharacterLayer(target, shadowCamera, 'depth', { alpha: 1, color: 0xffffff });
    for (const record of records.values()) {
      for (const state of record.states) {
        state.shadowMatrix.value.copy(shadowMatrix);
        state.shadowDepthRange.value = shadowCamera.far - shadowCamera.near;
        state.shadowMapSize.value = shadowMapSize;
        state.shadowTexelsPerMetre = texelsPerMetre;
        state.shadowDirection.value.copy(direction);
        state.shadowMap.value = target.texture;
        state.shadowReady.value = 1;
      }
    }
    return true;
  }

  function renderDepthPrepass() {
    const target = ensureDepthTarget();
    depthPass.render(renderer, camera, target);
    for (const record of records.values()) {
      for (const state of record.states) {
        state.depthMap.value = target.texture;
        state.depthReady.value = 1;
      }
    }
  }

  function renderMask() {
    const target = ensureMaskTarget();
    renderCharacterLayer(target, camera, 'mask', { alpha: 0, color: 0x000000 });
  }

  /** Runs the passes the registered materials need. Call once per frame, before rendering. */
  function update() {
    if (disposed || records.size === 0) return;
    scene.updateMatrixWorld();
    camera.updateMatrixWorld();
    updateHeads();
    const needs = collectNeeds();
    if (needs.shadow) renderShadowMap(needs.shadowSettings);
    else setReady('shadowReady', 0);
    if (needs.depth) renderDepthPrepass();
    else setReady('depthReady', 0);
    if (maskEnabled) renderMask();
  }

  function setSize(width, height, pixelRatio = 1) {
    size.width = width;
    size.height = height;
    size.pixelRatio = pixelRatio;
    if (depthTarget) ensureDepthTarget();
    if (maskTarget) ensureMaskTarget();
  }

  function setCharacterMaskEnabled(enabled = true) {
    maskEnabled = Boolean(enabled);
    if (maskEnabled) ensureMaskTarget();
    return maskEnabled;
  }

  function dispose() {
    if (disposed) return;
    for (const root of [...records.keys()]) unregisterCharacterRoot(root);
    disposed = true;
    depthPass.dispose();
    depthTarget?.dispose();
    shadowTarget?.dispose();
    maskTarget?.dispose();
    depthTarget = null;
    shadowTarget = null;
    maskTarget = null;
  }

  return {
    get characterMaskTexture() {
      return maskEnabled && maskTarget ? maskTarget.texture : null;
    },
    get depthTexture() {
      return depthTarget?.texture ?? null;
    },
    dispose,
    get registeredRoots() {
      return [...records.keys()];
    },
    registerCharacterRoot,
    setCharacterMaskEnabled,
    setSize,
    get shadowTexture() {
      return shadowTarget?.texture ?? null;
    },
    TOON_CHARACTER_LAYER,
    unregisterCharacterRoot,
    update,
  };
}

const hiddenMaterial = new THREE.MeshBasicMaterial({ visible: false });
hiddenMaterial.name = 'ToonCharacterPass:Hidden';
