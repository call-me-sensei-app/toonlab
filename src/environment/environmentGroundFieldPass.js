// Ground-field pass for the node backends (WebGPU / forced WebGL2) — the
// runtime's stand-in for landscape runtime-virtual-texturing.
//
// Renders the scene's GROUND WRITERS (meshes tagged
// `userData.groundFieldWrite = true`: terrain, path ribbons, plazas) from a
// top-down orthographic camera into three targets — visible ground color, surface
// properties, and encoded world height — and publishes them through the
// shared uniforms in
// src/shaders-tsl/chunks/environment-ground-field.js. Grass, rock bases, and
// trunk bases sample those to adopt the ground's color and melt into it.
//
// Terrain is static, so the pass renders once and re-renders only when its
// signature changes (writer set / transforms / resolution); callers with
// mutating ground (path edits) call invalidate(). Classic WebGL path: no-op,
// `ready` stays false and every consumer blends by zero coverage.

import * as THREE from 'three';
import { positionWorld, uniform, vec3, vec4 } from 'three/tsl';

import { applyShadowClipAdjust, PassBasicNodeMaterial } from '../shaders-tsl/chunks/pass-depth-color.js';
import {
  environmentGroundField,
  groundFieldColorMapNode,
  groundFieldFilteredColorMapNode,
  groundFieldHeightMapNode,
  groundFieldSurfaceMapNode,
} from '../shaders-tsl/chunks/environment-ground-field.js';

const BOUNDS_PAD = 1.02;

export function createEnvironmentGroundFieldPass({ renderer, scene, resolution = 2048 } = {}) {
  if (!renderer || !scene) {
    throw new Error('createEnvironmentGroundFieldPass requires { renderer, scene }.');
  }

  const isNodeBackend = Boolean(renderer.isWebGPURenderer);
  let colorTarget = null;
  let filteredColorTarget = null;
  let surfaceTarget = null;
  let heightTarget = null;
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.up.set(0, 0, -1);
  const fieldMatrix = new THREE.Matrix4();
  const bounds = new THREE.Box3();
  const boundsSize = new THREE.Vector3();
  const boundsCenter = new THREE.Vector3();

  // Height swap material: encodes worldY into [0, 1] against the writer
  // bounds. Local uniforms (not the published chunk values) so the swap
  // render never depends on chunk state.
  const heightMin = uniform(0);
  const heightSpanInv = uniform(1);
  const heightMaterial = new PassBasicNodeMaterial({ side: THREE.DoubleSide });
  heightMaterial.isShadowPassMaterial = true;
  heightMaterial.colorNode = vec4(
    vec3(positionWorld.y.sub(heightMin).mul(heightSpanInv)),
    1.0,
  );

  // Color swap materials, keyed by source material. Ground writers provide
  // their visible sun/sky/shared-shadow color through
  // userData.createGroundColorVariant; anything else gets a best-effort
  // approximation from its base map/color.
  const colorMaterialCache = new WeakMap();
  const surfaceMaterialCache = new WeakMap();

  function colorMaterialFor(material) {
    let swapped = colorMaterialCache.get(material);
    if (!swapped) {
      if (typeof material?.userData?.createGroundColorVariant === 'function') {
        swapped = material.userData.createGroundColorVariant();
      } else {
        swapped = new PassBasicNodeMaterial({ side: THREE.DoubleSide });
        const map = material?.uniforms?.baseMap?.value ?? material?.uniforms?.base?.value ??
          material?.map ?? null;
        if (map) swapped.map = map;
        const color = material?.uniforms?.baseColor?.value ?? material?.color ?? null;
        if (color?.isColor) swapped.color = color.clone();
        swapped.vertexColors = Boolean(material?.vertexColors);
      }
      swapped.isShadowPassMaterial = true;
      colorMaterialCache.set(material, swapped);
    }
    return swapped;
  }

  function surfaceMaterialFor(material) {
    let swapped = surfaceMaterialCache.get(material);
    if (!swapped) {
      if (typeof material?.userData?.createGroundSurfaceVariant === 'function') {
        swapped = material.userData.createGroundSurfaceVariant();
      } else {
        swapped = new PassBasicNodeMaterial({ side: THREE.DoubleSide });
        swapped.colorNode = vec3(
          material?.roughnessNode ?? material?.roughness ?? 0.5,
          material?.specularIntensityNode ?? 0.5,
          material?.metalnessNode ?? material?.metalness ?? 0,
        );
      }
      swapped.isShadowPassMaterial = true;
      surfaceMaterialCache.set(material, swapped);
    }
    return swapped;
  }

  const writers = [];
  const materialRestores = [];
  const visibilityRestores = [];
  let lastRenderSignature = '';
  let lastColorSignature = '';
  let invalidateCounter = 0;
  let colorInvalidateCounter = 0;

  function collectWriters() {
    writers.length = 0;
    scene.traverse((obj) => {
      if (obj.isMesh && obj.visible && obj.userData?.groundFieldWrite) writers.push(obj);
    });
    return writers;
  }

  function renderSignature() {
    let signature = `${resolution}:${invalidateCounter}`;
    for (const mesh of writers) {
      signature += `|${mesh.uuid}:${mesh.matrixWorld.elements.join(',')}`;
    }
    return signature;
  }

  function frameCamera() {
    bounds.makeEmpty();
    for (const mesh of writers) bounds.expandByObject(mesh);
    if (bounds.isEmpty()) return false;
    bounds.getSize(boundsSize);
    bounds.getCenter(boundsCenter);
    const halfX = Math.max(boundsSize.x * BOUNDS_PAD, 1) / 2;
    const halfZ = Math.max(boundsSize.z * BOUNDS_PAD, 1) / 2;
    camera.left = -halfX;
    camera.right = halfX;
    camera.top = halfZ;
    camera.bottom = -halfZ;
    camera.near = 0.1;
    camera.far = Math.max(boundsSize.y, 1) + 20;
    camera.position.set(boundsCenter.x, bounds.max.y + 10, boundsCenter.z);
    camera.lookAt(boundsCenter.x, bounds.min.y, boundsCenter.z);
    camera.coordinateSystem = renderer.coordinateSystem;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    fieldMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    applyShadowClipAdjust(fieldMatrix, renderer);
    return true;
  }

  function ensureTargets() {
    if (colorTarget && colorTarget.width === resolution) return;
    colorTarget?.dispose();
    filteredColorTarget?.dispose();
    surfaceTarget?.dispose();
    heightTarget?.dispose();
    colorTarget = new THREE.WebGLRenderTarget(resolution, resolution, {
      depthBuffer: true,
      stencilBuffer: false,
    });
    colorTarget.texture.name = 'EnvironmentGroundField.Color';
    // Keep the exact target single-level. Authored RVT mip requests are
    // fulfilled by filteredColorTarget below because WebGPU render-target
    // mip generation is not reliable across the supported backends.
    colorTarget.texture.generateMipmaps = false;
    colorTarget.texture.minFilter = THREE.LinearFilter;
    colorTarget.texture.magFilter = THREE.LinearFilter;
    const authoredMipLevel = Math.max(
      0,
      Math.round(Number(environmentGroundField.colorMipLevel.value) || 0),
    );
    const filteredResolution = Math.max(1, Math.round(resolution / (2 ** authoredMipLevel)));
    filteredColorTarget = new THREE.WebGLRenderTarget(
      filteredResolution,
      filteredResolution,
      {
        depthBuffer: true,
        stencilBuffer: false,
      },
    );
    filteredColorTarget.texture.name =
      `EnvironmentGroundField.ColorMip${authoredMipLevel}`;
    filteredColorTarget.texture.generateMipmaps = false;
    filteredColorTarget.texture.minFilter = THREE.LinearFilter;
    filteredColorTarget.texture.magFilter = THREE.LinearFilter;
    surfaceTarget = new THREE.WebGLRenderTarget(resolution, resolution, {
      depthBuffer: true,
      stencilBuffer: false,
    });
    surfaceTarget.texture.name = 'EnvironmentGroundField.Surface';
    surfaceTarget.texture.generateMipmaps = false;
    surfaceTarget.texture.minFilter = THREE.LinearFilter;
    surfaceTarget.texture.magFilter = THREE.LinearFilter;
    heightTarget = new THREE.WebGLRenderTarget(resolution, resolution, {
      depthBuffer: true,
      stencilBuffer: false,
    });
    heightTarget.texture.name = 'EnvironmentGroundField.Height';
    heightTarget.texture.type = THREE.HalfFloatType;
    heightTarget.texture.minFilter = THREE.LinearFilter;
    heightTarget.texture.magFilter = THREE.LinearFilter;
  }

  function renderInto(target, swapMaterialFor) {
    materialRestores.length = 0;
    visibilityRestores.length = 0;
    scene.traverse((obj) => {
      if (!obj.visible) return;
      const isWriter = obj.isMesh && obj.userData?.groundFieldWrite;
      if (!isWriter) {
        // Hide leaf renderables only — hiding a group would also hide any
        // writer nested beneath it.
        if (obj.isMesh || obj.isPoints || obj.isLine || obj.isSprite) {
          obj.visible = false;
          visibilityRestores.push(obj);
        }
        return;
      }
      materialRestores.push({ material: obj.material, mesh: obj });
      obj.material = Array.isArray(obj.material)
        ? obj.material.map((mat) => swapMaterialFor(mat))
        : swapMaterialFor(obj.material);
    });

    const previousTarget = renderer.getRenderTarget();
    const previousBackground = scene.background;
    const previousShadowEnabled = renderer.shadowMap.enabled;
    renderer.shadowMap.enabled = false;
    scene.background = null;
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(previousTarget);
    renderer.shadowMap.enabled = previousShadowEnabled;
    scene.background = previousBackground;

    for (const { material, mesh } of materialRestores) mesh.material = material;
    for (const obj of visibilityRestores) obj.visible = true;
    materialRestores.length = 0;
    visibilityRestores.length = 0;
  }

  function update() {
    if (!isNodeBackend) return;

    scene.updateMatrixWorld(true);
    collectWriters();
    if (writers.length === 0) {
      environmentGroundField.ready.value = false;
      return;
    }

    const signature = renderSignature();
    const colorSignature = `${signature}:visible-color:${colorInvalidateCounter}`;
    const fullRenderRequired = signature !== lastRenderSignature
      || !environmentGroundField.ready.value;
    const colorRenderRequired = fullRenderRequired || colorSignature !== lastColorSignature;
    if (!fullRenderRequired && !colorRenderRequired) return;

    if (!frameCamera()) {
      environmentGroundField.ready.value = false;
      return;
    }
    ensureTargets();

    const minY = bounds.min.y;
    const spanY = Math.max(boundsSize.y, 0.001);
    heightMin.value = minY;
    heightSpanInv.value = 1 / spanY;

    // The swap render must never observe a "ready" field (a writer material
    // reading its own output would feed back); flip off for the duration.
    environmentGroundField.ready.value = false;
    if (colorRenderRequired) {
      renderInto(colorTarget, colorMaterialFor);
      renderInto(filteredColorTarget, colorMaterialFor);
    }
    if (fullRenderRequired) {
      renderInto(surfaceTarget, surfaceMaterialFor);
      renderInto(heightTarget, () => heightMaterial);
    }

    environmentGroundField.matrix.value.copy(fieldMatrix);
    environmentGroundField.heightMin.value = minY;
    environmentGroundField.heightSpan.value = spanY;
    groundFieldColorMapNode().value = colorTarget.texture;
    groundFieldFilteredColorMapNode().value = filteredColorTarget.texture;
    groundFieldSurfaceMapNode().value = surfaceTarget.texture;
    groundFieldHeightMapNode().value = heightTarget.texture;
    environmentGroundField.ready.value = true;
    lastRenderSignature = signature;
    lastColorSignature = colorSignature;
  }

  // The signature tracks writer identity and transforms — repainting a
  // writer's texture or vertex colors changes pixels without changing it.
  function invalidate() {
    invalidateCounter += 1;
  }

  // Lighting and the shared shadow map can change while ground geometry,
  // height, and surface properties remain static. Refresh only the two color
  // targets in that case instead of paying for all four field passes.
  function invalidateColor() {
    colorInvalidateCounter += 1;
  }

  function dispose() {
    colorTarget?.dispose();
    filteredColorTarget?.dispose();
    surfaceTarget?.dispose();
    heightTarget?.dispose();
    colorTarget = null;
    filteredColorTarget = null;
    surfaceTarget = null;
    heightTarget = null;
    environmentGroundField.ready.value = false;
  }

  return {
    get colorSemantics() {
      return 'visible-ground-color';
    },
    get ready() {
      return Boolean(environmentGroundField.ready.value);
    },
    get writerCount() {
      return writers.length;
    },
    get colorTexture() {
      return colorTarget?.texture ?? null;
    },
    get heightTexture() {
      return heightTarget?.texture ?? null;
    },
    get filteredColorTexture() {
      return filteredColorTarget?.texture ?? null;
    },
    get surfaceTexture() {
      return surfaceTarget?.texture ?? null;
    },
    get bounds() {
      return bounds;
    },
    dispose,
    invalidate,
    invalidateColor,
    update,
  };
}
