// Sun shadow pass for the node backends (WebGPU / forced WebGL2).
//
// The classic pipeline gets scene shadows from three's shadow-map system via
// materials with lights:true; the TSL toon/environment materials never use
// the node lighting system, so nothing would render the sun's shadow map.
// This pass renders the scene from the shadow-casting directional light's
// own shadow camera (the sun rig configures its bounds) into a float color
// target holding linear window depth, then publishes map/matrix through the
// shared uniforms in src/shaders-tsl/chunks/environment-sun-shadow.js, which
// both the environment material (getShadowMask replacement) and the toon
// character (sceneShadowVisibility) sample.
//
// Classic WebGL path: unused — three's own shadow system keeps doing the job.

import * as THREE from 'three';

import {
  applyShadowClipAdjust,
  createPassDepthColorMaterial,
} from '../shaders-tsl/chunks/pass-depth-color.js';
import {
  environmentSunShadow,
  farSunShadowMapNode,
  sunShadowMapNode,
} from '../shaders-tsl/chunks/environment-sun-shadow.js';

export function createEnvironmentSunShadowPass({ renderer, scene } = {}) {
  if (!renderer || !scene) {
    throw new Error('createEnvironmentSunShadowPass requires { renderer, scene }.');
  }

  const isNodeBackend = Boolean(renderer.isWebGPURenderer);
  let shadowTarget = null;
  let farShadowTarget = null;
  const shadowMatrix = new THREE.Matrix4();
  const farShadowMatrix = new THREE.Matrix4();
  const lastFarRenderedMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
  const nearCoverageMatrix = new THREE.Matrix4();
  const farCoverageMatrix = new THREE.Matrix4();
  const nearCoverageFrustum = new THREE.Frustum();
  const farCoverageFrustum = new THREE.Frustum();
  const coverageSphere = new THREE.Sphere();
  const projectedCoverageCenter = new THREE.Vector3();
  const farShadowCamera = new THREE.OrthographicCamera();
  const farFocus = new THREE.Vector3();
  const farForward = new THREE.Vector3();
  const lightDirection = new THREE.Vector3();
  const depthMaterialCache = new WeakMap();
  const skinnedDepthMaterialCache = new WeakMap();
  // Swapped material (or material ARRAY) per mesh, keyed by the source
  // material identity: handing the renderer a fresh array every frame churns
  // its render-object cache, destroying object uniform buffers that queued
  // submits still reference (WebGPU validation error).
  const meshSwapCache = new WeakMap();
  const materialRestores = [];
  const visibilityRestores = [];
  // A mesh must render once with its primary material before an offscreen pass
  // substitutes a depth variant. WebGPU otherwise may retire the primary
  // render object's binding buffer while the first submit still references it
  // when an asynchronously loaded character joins an already-running scene.
  const warmedCasterSources = new WeakMap();
  let cachedSunLight = null;
  let renderCount = 0;
  // Real health, not "the object exists". D19-041 shipped a Gate 3 check
  // written as `Boolean(runtime.shadowPass)`, which is true from construction
  // and therefore cannot fail. These are the three things that actually have
  // to be true for a receiver to see a cast shadow.
  let lastCasterCount = 0;
  let lastSkippedNonCasterCount = 0;
  let lastFailure = 'pass has not run';
  let casterDepthSamplePoints = Object.freeze([]);
  let casterCoverage = Object.freeze({
    byDomain: Object.freeze({}),
    coveredTargetIds: Object.freeze([]),
    eligibleTargetIds: Object.freeze([]),
    farTargetIds: Object.freeze([]),
    nearTargetIds: Object.freeze([]),
    uncoveredTargetIds: Object.freeze([]),
  });
  let receiverCoverage = Object.freeze({
    byDomain: Object.freeze({}),
    coveredTargetIds: Object.freeze([]),
    eligibleTargetIds: Object.freeze([]),
    farTargetIds: Object.freeze([]),
    nearTargetIds: Object.freeze([]),
    uncoveredTargetIds: Object.freeze([]),
  });

  function findShadowSun() {
    if (cachedSunLight?.parent && cachedSunLight.visible && cachedSunLight.castShadow) {
      return cachedSunLight;
    }
    cachedSunLight = null;
    scene.traverse((obj) => {
      if (cachedSunLight) return;
      if (obj.isDirectionalLight && obj.visible && obj.castShadow) cachedSunLight = obj;
    });
    return cachedSunLight;
  }

  function styleTargetFor(object) {
    let current = object;
    while (current) {
      const label = current.userData?.toonlab;
      if (label?.targetId && label?.domain) return label;
      current = current.parent;
    }
    return null;
  }

  function updateCasterCoverage() {
    const eligible = new Set();
    const near = new Set();
    const far = new Set();
    const byDomain = new Map();
    const depthSamplePoints = [];
    scene.traverse((object) => {
      if (!object.isMesh || !object.visible || !object.castShadow) return;
      const target = styleTargetFor(object);
      if (!target) return;
      const id = target.targetId;
      let domain = byDomain.get(target.domain);
      if (!domain) {
        domain = { eligible: new Set(), far: new Set(), near: new Set() };
        byDomain.set(target.domain, domain);
      }
      eligible.add(id);
      domain.eligible.add(id);
      const geometry = object.geometry;
      if (!geometry) return;
      if (!geometry.boundingSphere) geometry.computeBoundingSphere();
      if (!geometry.boundingSphere) return;
      coverageSphere.copy(geometry.boundingSphere).applyMatrix4(object.matrixWorld);
      if (nearCoverageFrustum.intersectsSphere(coverageSphere)) {
        near.add(id);
        domain.near.add(id);
        projectedCoverageCenter.copy(coverageSphere.center).applyMatrix4(shadowMatrix);
        depthSamplePoints.push({
          cascade: 'near',
          targetId: id,
          u: projectedCoverageCenter.x * 0.5 + 0.5,
          v: projectedCoverageCenter.y * 0.5 + 0.5,
        });
      }
      if (farCoverageFrustum.intersectsSphere(coverageSphere)) {
        far.add(id);
        domain.far.add(id);
        projectedCoverageCenter.copy(coverageSphere.center).applyMatrix4(farShadowMatrix);
        depthSamplePoints.push({
          cascade: 'far',
          targetId: id,
          u: projectedCoverageCenter.x * 0.5 + 0.5,
          v: projectedCoverageCenter.y * 0.5 + 0.5,
        });
      }
    });
    const covered = new Set([...near, ...far]);
    const sorted = (values) => Object.freeze([...values].sort());
    const domainCoverage = {};
    for (const [domainId, values] of [...byDomain].sort(([left], [right]) => left.localeCompare(right))) {
      const domainCovered = new Set([...values.near, ...values.far]);
      domainCoverage[domainId] = Object.freeze({
        coveredTargetIds: sorted(domainCovered),
        eligibleTargetIds: sorted(values.eligible),
        farTargetIds: sorted(values.far),
        nearTargetIds: sorted(values.near),
        uncoveredTargetIds: sorted([...values.eligible].filter((id) => !domainCovered.has(id))),
      });
    }
    casterCoverage = Object.freeze({
      byDomain: Object.freeze(domainCoverage),
      coveredTargetIds: sorted(covered),
      eligibleTargetIds: sorted(eligible),
      farTargetIds: sorted(far),
      nearTargetIds: sorted(near),
      uncoveredTargetIds: sorted([...eligible].filter((id) => !covered.has(id))),
    });
    casterDepthSamplePoints = Object.freeze(depthSamplePoints.map(Object.freeze));
  }

  async function inspectDepthContent({ radius = 6 } = {}) {
    if (!environmentSunShadow.ready.value || typeof renderer.readRenderTargetPixelsAsync !== 'function') {
      return Object.freeze({ ready: false, sampleCount: 0, writtenSampleCount: 0 });
    }
    const sampleRadius = Math.max(1, Math.min(Math.trunc(Number(radius)) || 6, 16));
    const samples = [];
    for (const point of casterDepthSamplePoints) {
      const target = point.cascade === 'far' ? farShadowTarget : shadowTarget;
      if (!target) continue;
      const width = sampleRadius * 2 + 1;
      const x = THREE.MathUtils.clamp(
        Math.round(point.u * (target.width - 1)) - sampleRadius,
        0,
        target.width - width,
      );
      const logicalY = Math.round(point.v * (target.height - 1)) - sampleRadius;
      const yCandidates = new Set([
        THREE.MathUtils.clamp(logicalY, 0, target.height - width),
        THREE.MathUtils.clamp(target.height - width - logicalY, 0, target.height - width),
      ]);
      let minDepth = 1;
      for (const y of yCandidates) {
        const pixels = await renderer.readRenderTargetPixelsAsync(target, x, y, width, width);
        for (let index = 0; index < pixels.length; index += 4) {
          const depth = Number(pixels[index]);
          if (Number.isFinite(depth)) minDepth = Math.min(minDepth, depth);
        }
      }
      samples.push(Object.freeze({
        cascade: point.cascade,
        minDepth,
        targetId: point.targetId,
        written: minDepth < 0.999,
      }));
    }
    return Object.freeze({
      ready: true,
      sampleCount: samples.length,
      samples: Object.freeze(samples),
      writtenSampleCount: samples.filter(({ written }) => written).length,
    });
  }

  function updateReceiverCoverage() {
    const eligible = new Set();
    const near = new Set();
    const far = new Set();
    const byDomain = new Map();
    scene.traverse((object) => {
      if (!object.isMesh || !object.visible || !object.receiveShadow) return;
      const target = styleTargetFor(object);
      if (!target) return;
      const id = target.targetId;
      let domain = byDomain.get(target.domain);
      if (!domain) {
        domain = { eligible: new Set(), far: new Set(), near: new Set() };
        byDomain.set(target.domain, domain);
      }
      eligible.add(id);
      domain.eligible.add(id);
      const geometry = object.geometry;
      if (!geometry) return;
      if (!geometry.boundingSphere) geometry.computeBoundingSphere();
      if (!geometry.boundingSphere) return;
      coverageSphere.copy(geometry.boundingSphere).applyMatrix4(object.matrixWorld);
      if (nearCoverageFrustum.intersectsSphere(coverageSphere)) {
        near.add(id);
        domain.near.add(id);
      }
      if (farCoverageFrustum.intersectsSphere(coverageSphere)) {
        far.add(id);
        domain.far.add(id);
      }
    });
    const covered = new Set([...near, ...far]);
    const sorted = (values) => Object.freeze([...values].sort());
    const domainCoverage = {};
    for (const [domainId, values] of [...byDomain].sort(([left], [right]) => left.localeCompare(right))) {
      const domainCovered = new Set([...values.near, ...values.far]);
      domainCoverage[domainId] = Object.freeze({
        coveredTargetIds: sorted(domainCovered),
        eligibleTargetIds: sorted(values.eligible),
        farTargetIds: sorted(values.far),
        nearTargetIds: sorted(values.near),
        uncoveredTargetIds: sorted([...values.eligible].filter((id) => !domainCovered.has(id))),
      });
    }
    receiverCoverage = Object.freeze({
      byDomain: Object.freeze(domainCoverage),
      coveredTargetIds: sorted(covered),
      eligibleTargetIds: sorted(eligible),
      farTargetIds: sorted(far),
      nearTargetIds: sorted(near),
      uncoveredTargetIds: sorted([...eligible].filter((id) => !covered.has(id))),
    });
  }

  // three's WebGLShadowMap renders shadow depth with flipped culling unless
  // material.shadowSide overrides it (FrontSide casters render their back
  // faces). One-sided planes facing the light — the environments' baked
  // shadow-decal meshes — therefore never occlude in the classic map; the
  // pass must match or those decals black out the sunlit interior.
  const shadowSideFor = {
    [THREE.FrontSide]: THREE.BackSide,
    [THREE.BackSide]: THREE.FrontSide,
    [THREE.DoubleSide]: THREE.DoubleSide,
  };

  function cacheForDepthMaterial(object) {
    if (!object?.isSkinnedMesh) return depthMaterialCache;
    let cache = skinnedDepthMaterialCache.get(object);
    if (!cache) {
      cache = new WeakMap();
      skinnedDepthMaterialCache.set(object, cache);
    }
    return cache;
  }

  function depthMaterialFor(material, object = null) {
    const cache = cacheForDepthMaterial(object);
    let depthMaterial = cache.get(material);
    if (!depthMaterial) {
      if (typeof material?.userData?.createDepthColorVariant === 'function') {
        // Materials with custom vertex displacement (tree foliage cards)
        // provide their own cutout depth variant.
        depthMaterial = material.userData.createDepthColorVariant();
      } else {
        // Toon/environment TSL materials expose their cutout through the
        // same-name uniform surface; classic materials through alphaTest/map.
        const cutoff = material?.uniforms?.aCutoff?.value ??
          material?.uniforms?.alphaCutoff?.value ??
          (material?.alphaTest > 0 ? material.alphaTest : -1);
        const map = material?.uniforms?.base?.value ??
          material?.uniforms?.baseMap?.value ??
          material?.map ?? null;
        depthMaterial = createPassDepthColorMaterial({
          alphaTest: cutoff > 0 ? cutoff : 0,
          map: cutoff > 0 ? map : null,
          side: THREE.DoubleSide,
        });
        depthMaterial.side = material?.shadowSide ?? shadowSideFor[material?.side] ?? THREE.DoubleSide;
      }
      cache.set(material, depthMaterial);
    }
    // three's WebGLShadowMap skips invisible source materials per group
    // (multi-material building meshes carry their opened window panes as a
    // hidden group); keep the depth replacement in step every update.
    depthMaterial.visible = material?.visible !== false;
    return depthMaterial;
  }

  // Static scenes render the shadow map once: r185's render-object
  // revalidation churn (dispose + recreate) intermittently destroys buffers
  // that queued submits still reference, and a pass that stops submitting
  // when nothing changed sidesteps the race entirely. Callers pass
  // `dynamic: true` while animation moves casters.
  let lastRenderSignature = '';

  function renderSignature(sun) {
    return `${sun.uuid}:${sun.matrixWorld.elements.join(',')}:${sun.target?.matrixWorld.elements.join(',')}:${sun.shadow.camera.far}:${scene.children.length}`;
  }

  function update({ camera = null, dynamic = false } = {}) {
    if (!isNodeBackend) return;

    // Note: renderer.shadowMap stays DISABLED on the node backends (the labs
    // gate it) — three's own shadow-map pass would re-render every skinned
    // caster with built-in buffer skinning (the >256-bone UBO overflow) and
    // nothing consumes its maps here. The light's castShadow flag alone
    // drives this pass.
    const sun = findShadowSun();
    if (!sun) {
      environmentSunShadow.ready.value = false;
      environmentSunShadow.farReady.value = false;
      lastCasterCount = 0;
      lastFailure = 'no visible DirectionalLight with castShadow in the scene';
      return;
    }

    let needsPrimaryRenderWarmup = false;
    scene.traverse((obj) => {
      if (!obj.isMesh || !obj.visible || !obj.castShadow) return;
      const source = obj.material;
      if (warmedCasterSources.get(obj) === source) return;
      warmedCasterSources.set(obj, source);
      needsPrimaryRenderWarmup = true;
    });
    if (needsPrimaryRenderWarmup) {
      // The host's normal scene render follows this scheduled pass. Retain any
      // existing map for one frame and include the new caster on the next one.
      lastFailure = 'warming up a newly added caster';
      return;
    }

    if (!dynamic) {
      const signature = renderSignature(sun);
      if (signature === lastRenderSignature && environmentSunShadow.ready.value) return;
      lastRenderSignature = signature;
    } else {
      lastRenderSignature = '';
    }

    const shadow = sun.shadow;
    const mapSize = Math.max(shadow.mapSize?.x ?? 2048, 1);
    if (!shadowTarget || shadowTarget.width !== mapSize) {
      shadowTarget?.dispose();
      shadowTarget = new THREE.WebGLRenderTarget(mapSize, mapSize, {
        depthBuffer: true,
        stencilBuffer: false,
      });
      shadowTarget.texture.name = 'EnvironmentSunShadow.Depth';
      shadowTarget.texture.type = THREE.FloatType;
      shadowTarget.texture.minFilter = THREE.NearestFilter;
      shadowTarget.texture.magFilter = THREE.NearestFilter;
    }
    // Keep both cascade targets at the same dimensions. WebGPU backends may
    // reuse the render-pass depth attachment across consecutive offscreen
    // submissions; switching target dimensions inside this shared pass can
    // leave that attachment sized for the previous target and invalidate the
    // following scene pass. Resolution is controlled once by the lighting
    // quality contract, while the far cascade gains coverage through its
    // larger orthographic extent.
    const farMapSize = mapSize;
    if (!farShadowTarget || farShadowTarget.width !== farMapSize) {
      farShadowTarget?.dispose();
      farShadowTarget = new THREE.WebGLRenderTarget(farMapSize, farMapSize, {
        depthBuffer: true,
        stencilBuffer: false,
      });
      farShadowTarget.texture.name = 'EnvironmentSunShadow.FarDepth';
      farShadowTarget.texture.type = THREE.FloatType;
      farShadowTarget.texture.minFilter = THREE.NearestFilter;
      farShadowTarget.texture.magFilter = THREE.NearestFilter;
      environmentSunShadow.farReady.value = false;
    }

    // The sun rig frames the light's orthographic shadow camera bounds, but
    // POSING the camera (position/orientation from light + target) is a
    // side effect of three's own shadow pass — which is disabled on the node
    // backends. updateMatrices() is that pose step as a public API.
    sun.updateMatrixWorld(true);
    sun.target?.updateMatrixWorld(true);
    shadow.updateMatrices(sun);
    const shadowCamera = shadow.camera;
    shadowCamera.coordinateSystem = renderer.coordinateSystem;
    shadowCamera.updateProjectionMatrix();
    shadowCamera.updateMatrixWorld(true);
    nearCoverageMatrix.multiplyMatrices(
      shadowCamera.projectionMatrix,
      shadowCamera.matrixWorldInverse,
    );
    nearCoverageFrustum.setFromProjectionMatrix(
      nearCoverageMatrix,
      renderer.coordinateSystem,
    );
    shadowMatrix.multiplyMatrices(shadowCamera.projectionMatrix, shadowCamera.matrixWorldInverse);
    applyShadowClipAdjust(shadowMatrix, renderer);

    const farExtent = Math.max(Number(shadow.toonLabFarExtent) || 110, 40);
    if (camera?.getWorldDirection) {
      camera.getWorldDirection(farForward);
      farForward.y = 0;
      if (farForward.lengthSq() < 1e-6) farForward.set(0, 0, -1);
      else farForward.normalize();
      farFocus.copy(camera.position).addScaledVector(farForward, farExtent * 0.55);
      farFocus.y = sun.target.position.y;
      // Stabilize the far cascade in world space. Its purpose is broad scene
      // coverage, so moving it for sub-metre follow-camera jitter only burns
      // an extra full-scene depth pass and makes distant shadows shimmer.
      const farFocusSnap = 2;
      farFocus.x = Math.round(farFocus.x / farFocusSnap) * farFocusSnap;
      farFocus.z = Math.round(farFocus.z / farFocusSnap) * farFocusSnap;
    } else {
      farFocus.copy(sun.target.position);
    }
    lightDirection.copy(sun.position).sub(sun.target.position).normalize();
    farShadowCamera.left = -farExtent;
    farShadowCamera.right = farExtent;
    farShadowCamera.top = farExtent;
    farShadowCamera.bottom = -farExtent;
    farShadowCamera.near = 0.1;
    farShadowCamera.far = Math.max(
      Number(shadow.toonLabFarCameraFar) || 300,
      farExtent * 2.5,
    );
    farShadowCamera.position.copy(farFocus).addScaledVector(lightDirection, 100);
    farShadowCamera.up.set(0, 1, 0);
    farShadowCamera.lookAt(farFocus);
    farShadowCamera.coordinateSystem = renderer.coordinateSystem;
    farShadowCamera.updateProjectionMatrix();
    farShadowCamera.updateMatrixWorld(true);
    farCoverageMatrix.multiplyMatrices(
      farShadowCamera.projectionMatrix,
      farShadowCamera.matrixWorldInverse,
    );
    farCoverageFrustum.setFromProjectionMatrix(
      farCoverageMatrix,
      renderer.coordinateSystem,
    );
    farShadowMatrix.multiplyMatrices(
      farShadowCamera.projectionMatrix,
      farShadowCamera.matrixWorldInverse,
    );
    applyShadowClipAdjust(farShadowMatrix, renderer);

    scene.updateMatrixWorld(true);
    updateCasterCoverage();
    updateReceiverCoverage();

    // Swap every visible caster to a depth-color material (cutout-aware);
    // hide non-casters and derived hulls/shells for the duration.
    materialRestores.length = 0;
    visibilityRestores.length = 0;
    scene.traverse((obj) => {
      if (!obj.isMesh || !obj.visible) return;
      if (!obj.castShadow || obj.userData?.isToonOutline || obj.userData?.isToonFurShell) {
        obj.visible = false;
        visibilityRestores.push(obj);
        return;
      }
      // three's WebGLShadowMap skips materials with visible === false; the
      // environment's window-opening materials rely on that so sunlight can
      // stream through opened windows. Match it before the material swap.
      const sourceMaterials = Array.isArray(obj.material) ? obj.material : [obj.material];
      if (!sourceMaterials.some((mat) => mat && mat.visible !== false)) {
        obj.visible = false;
        visibilityRestores.push(obj);
        return;
      }
      if (obj.isSkinnedMesh) obj.skeleton?.update();
      materialRestores.push({ material: obj.material, mesh: obj });
      const customDepthMaterial = obj.customDepthMaterial ?? null;
      let swap = meshSwapCache.get(obj);
      if (!swap || swap.source !== obj.material || swap.customDepthMaterial !== customDepthMaterial) {
        swap = {
          customDepthMaterial,
          source: obj.material,
          swapped: customDepthMaterial ?? (
            Array.isArray(obj.material)
              ? obj.material.map((mat) => depthMaterialFor(mat, obj))
              : depthMaterialFor(obj.material, obj)
          ),
        };
        meshSwapCache.set(obj, swap);
      } else if (!customDepthMaterial && Array.isArray(swap.swapped)) {
        // Keep per-group visibility in step (depthMaterialFor refreshes the
        // single-material case internally).
        for (let i = 0; i < swap.source.length; i += 1) {
          depthMaterialFor(swap.source[i], obj);
        }
      } else if (!customDepthMaterial) {
        depthMaterialFor(swap.source, obj);
      }
      obj.material = swap.swapped;
    });

    const previousTarget = renderer.getRenderTarget();
    const previousBackground = scene.background;
    const previousClearColor = renderer.getClearColor(new THREE.Color());
    const previousClearAlpha = renderer.getClearAlpha();
    // If a lab keeps three's native shadows on alongside this pass (the water
    // playground does, for its MeshToonMaterial ground), rendering our
    // depth-swapped scene must not also trigger three's native shadow-map
    // render of that swapped scene — disable it just for this render.
    const previousShadowAutoUpdate = renderer.shadowMap.enabled;
    renderer.shadowMap.enabled = false;
    scene.background = null;
    const renderDepth = (target, cameraForPass) => {
      renderer.setRenderTarget(target);
      renderer.setClearColor(0xffffff, 1);
      renderer.clear();
      renderer.render(scene, cameraForPass);
    };
    renderDepth(shadowTarget, shadowCamera);
    const updateFar = !environmentSunShadow.farReady.value ||
      !farShadowMatrix.equals(lastFarRenderedMatrix);
    if (updateFar) {
      renderDepth(farShadowTarget, farShadowCamera);
      lastFarRenderedMatrix.copy(farShadowMatrix);
      environmentSunShadow.farMatrix.value.copy(farShadowMatrix);
      environmentSunShadow.farMapSize.value = farMapSize;
      farSunShadowMapNode().value = farShadowTarget.texture;
      environmentSunShadow.farReady.value = true;
    }
    renderer.setRenderTarget(previousTarget);
    renderer.setClearColor(previousClearColor, previousClearAlpha);
    renderer.shadowMap.enabled = previousShadowAutoUpdate;
    scene.background = previousBackground;

    lastCasterCount = materialRestores.length;
    lastSkippedNonCasterCount = visibilityRestores.length;
    lastFailure = lastCasterCount > 0 ? null : 'no visible castShadow mesh was drawn into the map';
    for (const { material, mesh } of materialRestores) mesh.material = material;
    for (const obj of visibilityRestores) obj.visible = true;
    materialRestores.length = 0;
    visibilityRestores.length = 0;

    environmentSunShadow.matrix.value.copy(shadowMatrix);
    environmentSunShadow.mapSize.value = mapSize;
    environmentSunShadow.normalBias.value = Math.max(shadow.normalBias ?? 0, 0);
    environmentSunShadow.radius.value = shadow.radius ?? 1;
    // Native shadow maps keep far more precision than the old packed-depth
    // approximation. Keep the shared node-backend pass in float precision too,
    // otherwise low sunset angles can collapse canopy-vs-grass depth and make
    // nearby tree shadows disappear while taller/farther trees still work.
    environmentSunShadow.bias.value = shadow.bias ?? -0.00004;
    environmentSunShadow.characterDepthBias.value = Math.max(
      shadow.toonLabConstantDepthBias ?? 0.001,
      0,
    );
    sunShadowMapNode().value = shadowTarget.texture;
    environmentSunShadow.ready.value = true;
    renderCount += 1;
  }

  // The static-scene signature only tracks the sun pose and child count —
  // swapping a subject for another with the same bounds (or retexturing a
  // cutout material) changes the casters without changing the signature.
  function invalidate() {
    lastRenderSignature = '';
    environmentSunShadow.farReady.value = false;
  }

  function dispose() {
    shadowTarget?.dispose();
    shadowTarget = null;
    farShadowTarget?.dispose();
    farShadowTarget = null;
    environmentSunShadow.ready.value = false;
    environmentSunShadow.farReady.value = false;
  }

  return {
    get casterCoverage() {
      return casterCoverage;
    },
    get receiverCoverage() {
      return receiverCoverage;
    },
    get ready() {
      return environmentSunShadow.ready.value === true;
    },
    /**
     * Whether the pass is actually producing a usable shadow map, and why not
     * when it is not. Hosts gating a review on shadows must read `ok` here
     * rather than testing that the pass object exists (D19-041).
     */
    get health() {
      const ready = environmentSunShadow.ready.value === true;
      const ok = ready && renderCount > 0 && lastCasterCount > 0;
      return Object.freeze({
        backend: isNodeBackend ? 'node' : 'classic-webgl-unused',
        casterCount: lastCasterCount,
        farReady: environmentSunShadow.farReady.value === true,
        hiddenNonCasterCount: lastSkippedNonCasterCount,
        ok,
        ready,
        reason: ok ? null : (lastFailure ?? (ready ? null : 'pass has not published a map')),
        renderCount,
        sunName: cachedSunLight?.name ?? null,
      });
    },
    get renderCount() {
      return renderCount;
    },
    get shadowTexture() {
      return shadowTarget?.texture ?? null;
    },
    // Render targets, for diagnostics that need to read the depth the pass
    // actually wrote (D19-041/D19-062). `inspectDepthContent` only samples
    // labelled style targets; these let a caller probe any world point.
    get nearShadowTarget() {
      return shadowTarget;
    },
    get farShadowTarget() {
      return farShadowTarget;
    },
    get shadowMatrix() {
      return shadowMatrix;
    },
    get farShadowTexture() {
      return farShadowTarget?.texture ?? null;
    },
    dispose,
    inspectDepthContent,
    invalidate,
    update,
  };
}
