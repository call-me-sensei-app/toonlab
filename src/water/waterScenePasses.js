import * as THREE from 'three';

import { createPassDepthColorMaterial } from '../shaders-tsl/chunks/pass-depth-color.js';

// Render passes that feed the water material:
//   grab pass  — scene color + depth in one render (refraction, absorption,
//                shoreline foam, caustics)
//   reflection — planar mirror render with oblique near-plane clipping
//
// Exclusion flags on object.userData:
//   waterExclude           — hidden from both passes
//   waterGrabExclude       — hidden from the above-water grab only
//   waterReflectionExclude — hidden from the reflection pass only
//   skipWaterReflection    — legacy alias of waterReflectionExclude
//   onWaterPass(camera, passKind) — optional synchronous hook for camera-facing
//                objects. `passKind` is `grab` or `reflection`. The hook may
//                adjust the object's transform for that pass and return a
//                cleanup function. ToonLab restores the object's transform and
//                visibility after the pass even when rendering throws.
//
// Node backends (docs/tsl-conventions.md):
// - The grab target keeps its texture linear (working space): rendering into
//   a user render target skips the renderer's output color transform, so the
//   texels are exactly the linear values the water shader's own output path
//   feeds the final screen pass — refraction stays an exact pass-through.
// - TSL shaders cannot portably sample depth ATTACHMENTS (WGSL/GLSL builders
//   type them differently), so scene depth comes from a second render into a
//   float COLOR target with swapped depth materials (pass-depth-color.js),
//   following environmentSunShadowPass's swap-cache lessons (no per-frame
//   allocations, cached swap arrays, visibility kept in step).
// - Node-backend RTs are written top-down: the projective reflection matrix
//   gets a CPU-side uv y-flip, and the oblique near-plane clip uses the
//   coordinate-system-aware construction from three's own ReflectorNode.

const BIAS_MATRIX = new THREE.Matrix4().set(
  0.5, 0, 0, 0.5,
  0, 0.5, 0, 0.5,
  0, 0, 0.5, 0.5,
  0, 0, 0, 1,
);

// uv' = (u, 1 - v): the node backends write render targets top-down, so the
// GL-convention projective uv needs a y-flip (composed after BIAS_MATRIX).
const FLIP_Y_UV_MATRIX = new THREE.Matrix4().set(
  1, 0, 0, 0,
  0, -1, 0, 1,
  0, 0, 1, 0,
  0, 0, 0, 1,
);

function hideFlagged(root, predicate) {
  const hidden = [];
  root.traverse((object) => {
    if (!object.visible || !predicate(object)) return;
    object.visible = false;
    hidden.push(object);
  });
  return () => {
    for (const object of hidden) object.visible = true;
  };
}

function isEffectivelyVisible(object, root) {
  for (let current = object; current; current = current.parent) {
    if (!current.visible) return false;
    if (current === root) break;
  }
  return true;
}

function activateWaterPassHooks(root, camera, passKind) {
  const active = [];
  const restore = () => {
    let cleanupError = null;
    for (let index = active.length - 1; index >= 0; index -= 1) {
      const entry = active[index];
      try {
        entry.cleanup?.();
      } catch (error) {
        cleanupError ??= error;
      } finally {
        const { object } = entry;
        object.visible = entry.visible;
        object.position.copy(entry.position);
        object.quaternion.copy(entry.quaternion);
        object.scale.copy(entry.scale);
        object.matrix.copy(entry.matrix);
        object.matrixWorld.copy(entry.matrixWorld);
        object.matrixAutoUpdate = entry.matrixAutoUpdate;
        object.matrixWorldAutoUpdate = entry.matrixWorldAutoUpdate;
        object.matrixWorldNeedsUpdate = entry.matrixWorldNeedsUpdate;
      }
    }
    active.length = 0;
    if (cleanupError) throw cleanupError;
  };

  try {
    root.traverse((object) => {
      const hook = object.userData?.onWaterPass;
      if (typeof hook !== 'function' || !isEffectivelyVisible(object, root)) return;
      const entry = {
        cleanup: null,
        matrix: object.matrix.clone(),
        matrixAutoUpdate: object.matrixAutoUpdate,
        matrixWorld: object.matrixWorld.clone(),
        matrixWorldAutoUpdate: object.matrixWorldAutoUpdate,
        matrixWorldNeedsUpdate: object.matrixWorldNeedsUpdate,
        object,
        position: object.position.clone(),
        quaternion: object.quaternion.clone(),
        scale: object.scale.clone(),
        visible: object.visible,
      };
      active.push(entry);
      const cleanup = hook.call(object, camera, passKind);
      if (typeof cleanup === 'function') entry.cleanup = cleanup;
      if (object.matrixAutoUpdate) object.updateMatrix();
      object.updateMatrixWorld(true);
    });
  } catch (error) {
    restore();
    throw error;
  }
  return restore;
}

function targetSize(target) {
  return target ? { height: target.height, width: target.width } : null;
}

export class WaterScenePasses {
  constructor({
    sceneColor = true,
    reflection = true,
    depthScale = 1,
    maxPasses = 3,
    sceneColorScale = 1,
    reflectionScale = 0.5,
    clipBias = 0.02,
  } = {}) {
    this.requestedSceneColor = sceneColor !== false;
    this.requestedReflection = reflection !== false;
    this.sceneColorEnabled = this.requestedSceneColor;
    this.reflectionEnabled = this.requestedReflection;
    this.depthScale = depthScale;
    this.sceneColorScale = sceneColorScale;
    this.reflectionScale = reflectionScale;
    this.maxPasses = maxPasses;
    this.clipBias = clipBias;

    this.grabTarget = null;
    this.reflectionTarget = null;
    this.transmissionCamera = new THREE.PerspectiveCamera();
    this.reflectionCamera = new THREE.PerspectiveCamera();
    this.reflectionMatrix = new THREE.Matrix4();
    this.reflectionValid = false;
    this.grabValid = false;
    this.depthValid = false;
    this.lastFrameStats = { passes: [], sceneRenders: 0 };

    // Scene-depth pass state for the TSL renderer path.
    this.depthTarget = null;
    this.depthMaterialCache = new WeakMap();
    // Swapped material (or material ARRAY) per mesh, keyed by the source
    // material identity: handing the renderer a fresh array every frame
    // churns its render-object cache (see environmentSunShadowPass).
    this.depthSwapCache = new WeakMap();
    this.depthMaterialRestores = [];
    this.depthVisibilityRestores = [];

    this.scratch = {
      drawingBufferSize: new THREE.Vector2(),
      cameraPosition: new THREE.Vector3(),
      cameraDirection: new THREE.Vector3(),
      cameraQuaternion: new THREE.Quaternion(),
      target: new THREE.Vector3(),
      plane: new THREE.Plane(),
      clipPlane: new THREE.Vector4(),
      q: new THREE.Vector4(),
      waterWorldPosition: new THREE.Vector3(),
      clearColor: new THREE.Color(),
    };
    this.setQualityBudget({ depthScale, maxPasses, reflectionScale, sceneColorScale });
  }

  get stats() {
    return {
      configuredMaximumSceneRenders:
        (this.sceneColorEnabled ? 2 : 0) + (this.reflectionEnabled ? 1 : 0),
      enabled: {
        reflection: this.reflectionEnabled,
        sceneColor: this.sceneColorEnabled,
      },
      quality: {
        depthScale: this.depthScale,
        maxPasses: this.maxPasses,
        reflectionScale: this.reflectionScale,
        sceneColorScale: this.sceneColorScale,
      },
      lastFrame: {
        passes: [...this.lastFrameStats.passes],
        sceneRenders: this.lastFrameStats.sceneRenders,
      },
      targets: {
        depth: targetSize(this.depthTarget),
        grab: targetSize(this.grabTarget),
        reflection: targetSize(this.reflectionTarget),
      },
    };
  }

  recordSceneRender(passKind) {
    this.lastFrameStats.sceneRenders += 1;
    this.lastFrameStats.passes.push(passKind);
  }

  setQualityBudget({
    depthScale = this.depthScale,
    maxPasses = this.maxPasses,
    reflectionScale = this.reflectionScale,
    sceneColorScale = this.sceneColorScale,
  } = {}) {
    const clampScale = (value, fallback) => THREE.MathUtils.clamp(
      Number.isFinite(Number(value)) ? Number(value) : fallback,
      0.1,
      1,
    );
    this.depthScale = clampScale(depthScale, 1);
    this.reflectionScale = clampScale(reflectionScale, 0.5);
    this.sceneColorScale = clampScale(sceneColorScale, 1);
    this.maxPasses = THREE.MathUtils.clamp(Math.floor(Number(maxPasses) || 0), 0, 3);
    this.sceneColorEnabled = this.requestedSceneColor && this.maxPasses >= 2;
    const usedBySceneColor = this.sceneColorEnabled ? 2 : 0;
    this.reflectionEnabled = this.requestedReflection && this.maxPasses - usedBySceneColor >= 1;
    return this.stats;
  }

  ensureGrabTarget(renderer) {
    renderer.getDrawingBufferSize(this.scratch.drawingBufferSize);
    const width = Math.max(1, Math.floor(this.scratch.drawingBufferSize.x * this.sceneColorScale));
    const height = Math.max(1, Math.floor(this.scratch.drawingBufferSize.y * this.sceneColorScale));
    if (!this.grabTarget) {
      this.grabTarget = new THREE.WebGLRenderTarget(width, height, {
        depthBuffer: true,
        stencilBuffer: false,
        generateMipmaps: false,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
      });
      // Working-space (linear) texels — see the node-backend notes above.
    } else if (this.grabTarget.width !== width || this.grabTarget.height !== height) {
      this.grabTarget.setSize(width, height);
    }
    const depthWidth = Math.max(1, Math.floor(this.scratch.drawingBufferSize.x * this.depthScale));
    const depthHeight = Math.max(1, Math.floor(this.scratch.drawingBufferSize.y * this.depthScale));
    if (!this.depthTarget) {
      this.depthTarget = new THREE.WebGLRenderTarget(depthWidth, depthHeight, {
        depthBuffer: true,
        stencilBuffer: false,
        generateMipmaps: false,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
      });
      this.depthTarget.texture.name = 'WaterScenePasses.Depth';
      this.depthTarget.texture.type = THREE.FloatType;
    } else if (this.depthTarget.width !== depthWidth || this.depthTarget.height !== depthHeight) {
      this.depthTarget.setSize(depthWidth, depthHeight);
    }
  }

  ensureReflectionTarget(renderer) {
    renderer.getDrawingBufferSize(this.scratch.drawingBufferSize);
    const width = Math.max(1, Math.floor(this.scratch.drawingBufferSize.x * this.reflectionScale));
    const height = Math.max(1, Math.floor(this.scratch.drawingBufferSize.y * this.reflectionScale));
    if (!this.reflectionTarget) {
      this.reflectionTarget = new THREE.WebGLRenderTarget(width, height, {
        depthBuffer: true,
        stencilBuffer: false,
        generateMipmaps: false,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        samples: 4,
      });
      // Keep the texture linear (see the grab-target notes).
    } else if (this.reflectionTarget.width !== width || this.reflectionTarget.height !== height) {
      this.reflectionTarget.setSize(width, height);
    }
  }

  // Depth replacement for one material, cached by source identity. Camera-view
  // depth pass: keep the source's side (unlike the shadow pass's flip) and
  // match the depth buffer's participation rules (visible + depthWrite).
  depthMaterialFor(material) {
    let depthMaterial = this.depthMaterialCache.get(material);
    if (!depthMaterial) {
      if (typeof material?.userData?.createDepthColorVariant === 'function') {
        // Materials with custom vertex displacement (tree foliage cards,
        // kelp blades) provide their own cutout depth variant.
        depthMaterial = material.userData.createDepthColorVariant();
      } else {
        const cutoff = material?.uniforms?.aCutoff?.value ??
          material?.uniforms?.alphaCutoff?.value ??
          (material?.alphaTest > 0 ? material.alphaTest : -1);
        const map = material?.uniforms?.base?.value ??
          material?.uniforms?.baseMap?.value ??
          material?.map ?? null;
        depthMaterial = createPassDepthColorMaterial({
          alphaTest: cutoff > 0 ? cutoff : 0,
          map: cutoff > 0 ? map : null,
          side: material?.side ?? THREE.FrontSide,
        });
      }
      // Depth-as-color must never be fogged: with scene.fog set, the node
      // pipeline's per-material fog mix would blend distant depth values
      // toward the fog color (the pass also nulls scene.fog — see below).
      depthMaterial.fog = false;
      this.depthMaterialCache.set(material, depthMaterial);
    }
    depthMaterial.visible = material?.visible !== false && material?.depthWrite !== false;
    return depthMaterial;
  }

  // Node backends only: render linear window depth into the float color
  // target with swapped materials. Runs inside renderGrabPass's hide window
  // (waterMesh + waterExclude objects are already invisible).
  renderDepthPass(renderer, scene, camera) {
    const materialRestores = this.depthMaterialRestores;
    const visibilityRestores = this.depthVisibilityRestores;
    materialRestores.length = 0;
    visibilityRestores.length = 0;

    scene.traverse((obj) => {
      if (!obj.visible) return;
      const renderable = obj.isMesh || obj.isPoints || obj.isLine || obj.isSprite;
      if (!renderable) return;
      // Points/lines/sprites would draw their color into the depth target;
      // outline shells hug the base mesh depth.
      if (!obj.isMesh || obj.userData?.isToonOutline || obj.userData?.isToonFurShell) {
        obj.visible = false;
        visibilityRestores.push(obj);
        return;
      }
      const sourceMaterials = Array.isArray(obj.material) ? obj.material : [obj.material];
      if (!sourceMaterials.some((mat) => mat && mat.visible !== false && mat.depthWrite !== false)) {
        obj.visible = false;
        visibilityRestores.push(obj);
        return;
      }
      // Instanced custom-attribute geometry without its own depth variant
      // (e.g. grass blades) would collapse to its base quads under the
      // generic swap — the ground behind still writes depth, so skip them.
      const primary = sourceMaterials.find(Boolean);
      if (
        obj.geometry?.isInstancedBufferGeometry &&
        !obj.isInstancedMesh &&
        typeof primary?.userData?.createDepthColorVariant !== 'function'
      ) {
        obj.visible = false;
        visibilityRestores.push(obj);
        return;
      }
      materialRestores.push({ material: obj.material, mesh: obj });
      let swap = this.depthSwapCache.get(obj);
      if (!swap || swap.source !== obj.material) {
        swap = {
          source: obj.material,
          swapped: Array.isArray(obj.material)
            ? obj.material.map((mat) => this.depthMaterialFor(mat))
            : this.depthMaterialFor(obj.material),
        };
        this.depthSwapCache.set(obj, swap);
      } else if (Array.isArray(swap.swapped)) {
        // Keep per-group visibility in step.
        for (let i = 0; i < swap.source.length; i += 1) this.depthMaterialFor(swap.source[i]);
      } else {
        this.depthMaterialFor(swap.source);
      }
      obj.material = swap.swapped;
    });

    const previousBackground = scene.background;
    // Scene fog would blend the encoded depth toward the fog color on any
    // depth variant that keeps material.fog on (e.g. foliage-provided
    // variants).
    const previousFog = scene.fog;
    const previousClearColor = renderer.getClearColor(this.scratch.clearColor);
    const previousClearAlpha = renderer.getClearAlpha();
    scene.background = null;
    scene.fog = null;
    renderer.setRenderTarget(this.depthTarget);
    // Depth clears to 1 (far plane / sky) like the classic depth buffer.
    renderer.setClearColor(0xffffff, 1);
    renderer.clear();
    this.recordSceneRender('depth');
    renderer.render(scene, camera);
    scene.background = previousBackground;
    scene.fog = previousFog;
    renderer.setClearColor(previousClearColor, previousClearAlpha);

    for (const { material, mesh } of materialRestores) mesh.material = material;
    for (const obj of visibilityRestores) obj.visible = true;
    materialRestores.length = 0;
    visibilityRestores.length = 0;
  }

  renderGrabPass(renderer, scene, camera, waterMesh) {
    this.ensureGrabTarget(renderer);
    this.scratch.waterWorldPosition.setFromMatrixPosition(waterMesh.matrixWorld);
    camera.getWorldPosition(this.scratch.cameraPosition);
    const cameraBelowUniform = waterMesh.material?.uniforms?.uCameraBelow;
    // Standalone meshes using WaterScenePasses may not run WaterSurface's
    // column update; retain their original rest-plane fallback.
    const hasSurfaceColumn = typeof waterMesh.getHeightAt === 'function'
      && typeof waterMesh.containsPoint === 'function';
    const cameraBelow = hasSurfaceColumn && cameraBelowUniform
      ? cameraBelowUniform.value > 0.5
      : this.scratch.cameraPosition.y < this.scratch.waterWorldPosition.y;
    // Above water the grab sees the submerged scene. Below water it becomes a
    // same-pose transmission camera clipped to the air side of the surface,
    // so clouds and above-water objects are genuinely visible through it.
    const grabCamera = cameraBelow
      ? this.updateTransmissionCamera(
        renderer,
        camera,
        this.scratch.waterWorldPosition.y,
      )
      : camera;
    // waterGrabExclude skips the refraction grab/depth renders only — for
    // above-water set dressing (cliffs, large rocks) whose reflection
    // matters but whose refracted contribution is invisible. From below,
    // that set dressing belongs in the transmitted above-water view.
    const restoreFlagged = hideFlagged(scene, (object) => object.userData?.waterExclude
      || (!cameraBelow && object.userData?.waterGrabExclude));
    const waterWasVisible = waterMesh.visible;
    waterMesh.visible = false;
    const previousTarget = renderer.getRenderTarget();
    const previousXr = renderer.xr.enabled;
    const previousShadowAutoUpdate = renderer.shadowMap.autoUpdate;
    let restorePassHooks = () => {};
    try {
      restorePassHooks = activateWaterPassHooks(scene, grabCamera, 'grab');
      renderer.xr.enabled = false;
      renderer.shadowMap.autoUpdate = false;
      renderer.setRenderTarget(this.grabTarget);
      renderer.clear();
      this.recordSceneRender('grab');
      renderer.render(scene, grabCamera);
      if (cameraBelow) {
        this.depthValid = false;
      } else {
        this.renderDepthPass(renderer, scene, grabCamera);
        this.depthValid = true;
      }
      this.grabValid = true;
    } finally {
      renderer.setRenderTarget(previousTarget);
      renderer.xr.enabled = previousXr;
      renderer.shadowMap.autoUpdate = previousShadowAutoUpdate;
      waterMesh.visible = waterWasVisible;
      try {
        restorePassHooks();
      } finally {
        restoreFlagged();
      }
    }
  }

  applyWaterClipPlane(renderer, camera, waterY, side = 1) {
    // Oblique near-plane clipping (Lengyel), matching THREE.Reflector's
    // coordinate-system-aware construction. The positive side of this plane
    // is the air volume, even when the virtual camera itself is underwater.
    const { plane, clipPlane, q } = this.scratch;
    plane.normal.set(0, side, 0);
    plane.constant = -waterY * side;
    plane.applyMatrix4(camera.matrixWorldInverse);
    clipPlane.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);

    const projectionMatrix = camera.projectionMatrix;
    q.x = (Math.sign(clipPlane.x) + projectionMatrix.elements[8]) / projectionMatrix.elements[0];
    q.y = (Math.sign(clipPlane.y) + projectionMatrix.elements[9]) / projectionMatrix.elements[5];
    q.z = -1.0;
    q.w = (1.0 + projectionMatrix.elements[10]) / projectionMatrix.elements[14];
    clipPlane.multiplyScalar(1.0 / clipPlane.dot(q));
    projectionMatrix.elements[2] = clipPlane.x;
    projectionMatrix.elements[6] = clipPlane.y;
    projectionMatrix.elements[10] = renderer.coordinateSystem === THREE.WebGPUCoordinateSystem
      ? clipPlane.z - this.clipBias
      : clipPlane.z + 1.0 - this.clipBias;
    projectionMatrix.elements[14] = clipPlane.w;
    camera.projectionMatrixInverse.copy(projectionMatrix).invert();
  }

  updateTransmissionCamera(renderer, camera, waterY) {
    const { cameraPosition, cameraQuaternion } = this.scratch;
    camera.getWorldPosition(cameraPosition);
    camera.getWorldQuaternion(cameraQuaternion);

    const transmissionCamera = this.transmissionCamera;
    transmissionCamera.coordinateSystem = renderer.coordinateSystem;
    transmissionCamera.position.copy(cameraPosition);
    transmissionCamera.quaternion.copy(cameraQuaternion);
    transmissionCamera.scale.set(1, 1, 1);
    transmissionCamera.near = camera.near;
    transmissionCamera.far = camera.far;
    transmissionCamera.layers.mask = camera.layers.mask;
    transmissionCamera.projectionMatrix.copy(camera.projectionMatrix);
    transmissionCamera.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
    transmissionCamera.updateMatrixWorld();
    transmissionCamera.matrixWorldInverse.copy(transmissionCamera.matrixWorld).invert();
    this.applyWaterClipPlane(renderer, transmissionCamera, waterY);
    return transmissionCamera;
  }

  updateReflectionCamera(renderer, camera, waterY) {
    const { cameraPosition, cameraDirection, target } = this.scratch;
    camera.getWorldPosition(cameraPosition);
    if (Math.abs(cameraPosition.y - waterY) < 1e-4) return false;
    const reflectionSide = cameraPosition.y < waterY ? -1 : 1;

    camera.getWorldDirection(cameraDirection);
    target.copy(cameraPosition).add(cameraDirection);

    const reflectionCamera = this.reflectionCamera;
    // Prevent the node renderer from rebuilding (and wiping) the oblique
    // projection: Renderer.render forces updateProjectionMatrix when the
    // camera's coordinate system mismatches.
    reflectionCamera.coordinateSystem = renderer.coordinateSystem;
    reflectionCamera.position.set(cameraPosition.x, 2 * waterY - cameraPosition.y, cameraPosition.z);
    reflectionCamera.up.copy(camera.up);
    reflectionCamera.up.y *= -1;
    reflectionCamera.lookAt(target.x, 2 * waterY - target.y, target.z);
    reflectionCamera.near = camera.near;
    reflectionCamera.far = camera.far;
    reflectionCamera.projectionMatrix.copy(camera.projectionMatrix);
    reflectionCamera.updateMatrixWorld();
    reflectionCamera.matrixWorldInverse.copy(reflectionCamera.matrixWorld).invert();

    this.applyWaterClipPlane(renderer, reflectionCamera, waterY, reflectionSide);

    this.reflectionMatrix
      .copy(BIAS_MATRIX)
      .multiply(reflectionCamera.projectionMatrix)
      .multiply(reflectionCamera.matrixWorldInverse);
    // Node-backend RTs are written top-down: flip the projective v.
    this.reflectionMatrix.premultiply(FLIP_Y_UV_MATRIX);
    return true;
  }

  renderReflectionPass(renderer, scene, camera, waterMesh) {
    this.ensureReflectionTarget(renderer);
    this.scratch.waterWorldPosition.setFromMatrixPosition(waterMesh.matrixWorld);
    if (!this.updateReflectionCamera(renderer, camera, this.scratch.waterWorldPosition.y)) {
      this.reflectionValid = false;
      return;
    }

    const restoreFlagged = hideFlagged(scene, (object) => object.userData?.waterExclude ||
      object.userData?.waterReflectionExclude ||
      object.userData?.skipWaterReflection);
    const waterWasVisible = waterMesh.visible;
    waterMesh.visible = false;
    const previousTarget = renderer.getRenderTarget();
    const previousXr = renderer.xr.enabled;
    const previousShadowAutoUpdate = renderer.shadowMap.autoUpdate;
    let restorePassHooks = () => {};
    try {
      restorePassHooks = activateWaterPassHooks(
        scene,
        this.reflectionCamera,
        'reflection',
      );
      renderer.xr.enabled = false;
      renderer.shadowMap.autoUpdate = false;
      renderer.setRenderTarget(this.reflectionTarget);
      renderer.clear();
      this.recordSceneRender('reflection');
      renderer.render(scene, this.reflectionCamera);
      this.reflectionValid = true;
    } finally {
      renderer.setRenderTarget(previousTarget);
      renderer.xr.enabled = previousXr;
      renderer.shadowMap.autoUpdate = previousShadowAutoUpdate;
      waterMesh.visible = waterWasVisible;
      try {
        restorePassHooks();
      } finally {
        restoreFlagged();
      }
    }
  }

  render(renderer, scene, camera, waterMesh) {
    this.lastFrameStats.passes.length = 0;
    this.lastFrameStats.sceneRenders = 0;
    if (waterMesh?.visible === false) {
      this.grabValid = false;
      this.depthValid = false;
      this.reflectionValid = false;
      return;
    }
    if (this.sceneColorEnabled) this.renderGrabPass(renderer, scene, camera, waterMesh);
    else {
      this.grabValid = false;
      this.depthValid = false;
    }
    if (this.reflectionEnabled) this.renderReflectionPass(renderer, scene, camera, waterMesh);
    else this.reflectionValid = false;
  }

  bindToMaterial(material) {
    const uniforms = material?.uniforms;
    if (!uniforms) return;
    if (this.grabValid && this.grabTarget) {
      uniforms.uSceneColor.value = this.grabTarget.texture;
      uniforms.uUseSceneColor.value = 1;
    } else {
      uniforms.uUseSceneColor.value = 0;
    }
    if (this.depthValid && this.depthTarget) {
      uniforms.uSceneDepth.value = this.depthTarget.texture;
      uniforms.uUseSceneDepth.value = 1;
    } else {
      uniforms.uUseSceneDepth.value = 0;
    }
    if (this.reflectionValid && this.reflectionTarget) {
      uniforms.uReflectionMap.value = this.reflectionTarget.texture;
      uniforms.uReflectionMatrix.value.copy(this.reflectionMatrix);
      uniforms.uUseReflectionMap.value = 1;
    } else {
      uniforms.uUseReflectionMap.value = 0;
    }
  }

  dispose() {
    this.grabTarget?.dispose();
    this.reflectionTarget?.dispose();
    this.depthTarget?.dispose();
    this.grabTarget = null;
    this.reflectionTarget = null;
    this.depthTarget = null;
  }
}
