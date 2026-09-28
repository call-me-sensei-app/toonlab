import * as THREE from 'three';

import { setEnvironmentPlanarReflection } from './environmentShaderMaterials.js';

// One planar reflection pass for the dominant floor plane — the glossy-lobby
// look. Renders the scene mirrored across the floor into a half-res target
// each frame and publishes it to every glossFloor-role environment material
// through the shared planarReflectionMap/planarReflectionMatrix uniforms.
//
// Costs a second scene render while enabled; keep it preset/opt-in driven.

// Finds the world Y of the largest up-facing surface near the bottom of the
// environment — good enough to auto-place the reflection plane when the
// integrator does not pass floorY explicitly.
export function detectEnvironmentFloorY(root, environmentBox = null) {
  const box = environmentBox ?? new THREE.Box3().setFromObject(root);
  return box.min.y;
}

export function createEnvironmentPlanarReflection({
  renderer,
  scene,
  camera,
  floorY = 0,
  normal = new THREE.Vector3(0, 1, 0),
  resolutionScale = 0.5,
  clipBias = 0.003,
} = {}) {
  const planeNormal = normal.clone().normalize();
  const planePoint = new THREE.Vector3(0, floorY, 0);
  const reflectorPlane = new THREE.Plane();
  const virtualCamera = new THREE.PerspectiveCamera();
  const textureMatrix = new THREE.Matrix4();

  let renderTarget = new THREE.WebGLRenderTarget(2, 2, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
  });
  let enabled = true;

  const reflectorWorldPosition = new THREE.Vector3();
  const cameraWorldPosition = new THREE.Vector3();
  const lookAtPosition = new THREE.Vector3();
  const view = new THREE.Vector3();
  const target = new THREE.Vector3();
  const clipPlane = new THREE.Vector4();
  const q = new THREE.Vector4();

  function resizeToRenderer() {
    const size = renderer.getSize(new THREE.Vector2());
    const width = Math.max(2, Math.floor(size.x * renderer.getPixelRatio() * resolutionScale));
    const height = Math.max(2, Math.floor(size.y * renderer.getPixelRatio() * resolutionScale));
    if (renderTarget.width !== width || renderTarget.height !== height) {
      renderTarget.setSize(width, height);
    }
  }

  // Meshes that consume the reflection must not draw while it renders (WebGL
  // feedback loop); the oblique clip plane would discard their fragments but
  // the texture would still be bound.
  function collectConsumerMeshes() {
    const consumers = [];
    scene.traverse((obj) => {
      if (!obj.isMesh || !obj.material) return;
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      if (materials.some((mat) => mat?.defines?.USE_ENV_PLANAR_REFLECTION
        || mat?.userData?.environmentRole === 'glossFloor')) {
        consumers.push(obj);
      }
      if (obj.userData?.environmentReflectionExclude) consumers.push(obj);
    });
    return consumers;
  }

  function update() {
    if (!enabled) return;

    camera.getWorldPosition(cameraWorldPosition);
    reflectorWorldPosition.copy(planePoint);
    view.subVectors(reflectorWorldPosition, cameraWorldPosition);
    // Camera below the floor plane: nothing sensible to mirror.
    if (view.dot(planeNormal) > 0) return;

    resizeToRenderer();

    view.reflect(planeNormal).negate();
    view.add(reflectorWorldPosition);

    lookAtPosition.set(0, 0, -1).applyQuaternion(camera.quaternion).add(cameraWorldPosition);
    target.subVectors(reflectorWorldPosition, lookAtPosition);
    target.reflect(planeNormal).negate();
    target.add(reflectorWorldPosition);

    virtualCamera.coordinateSystem = camera.coordinateSystem;
    virtualCamera.position.copy(view);
    virtualCamera.up.set(0, 1, 0).applyQuaternion(camera.quaternion).reflect(planeNormal);
    virtualCamera.lookAt(target);
    virtualCamera.near = camera.near;
    virtualCamera.far = camera.far;
    virtualCamera.updateMatrixWorld();
    virtualCamera.projectionMatrix.copy(camera.projectionMatrix);

    // The classic pipeline samples render targets in GL orientation; the node
    // backends sample them with the origin flipped (same convention gap the
    // shared sun-shadow matrix adjusts for), so fold uv.y -> 1-uv.y into the
    // bias matrix there. Projective form: y' = -y + w.
    if (renderer.isWebGPURenderer) {
      textureMatrix.set(
        0.5, 0.0, 0.0, 0.5,
        0.0, -0.5, 0.0, 0.5,
        0.0, 0.0, 0.5, 0.5,
        0.0, 0.0, 0.0, 1.0,
      );
    } else {
      textureMatrix.set(
        0.5, 0.0, 0.0, 0.5,
        0.0, 0.5, 0.0, 0.5,
        0.0, 0.0, 0.5, 0.5,
        0.0, 0.0, 0.0, 1.0,
      );
    }
    textureMatrix.multiply(virtualCamera.projectionMatrix);
    textureMatrix.multiply(virtualCamera.matrixWorldInverse);

    // Oblique near-plane clip against the reflection plane so geometry below
    // the floor never leaks into the mirror image. The node renderer needs
    // three's ReflectorNode variant of the Lengyel formula: 1/dot scaling and
    // a coordinate-system-dependent third row (WebGPU clip z is 0..1, so the
    // GL +1.0 row-4 fold-in must not be applied there).
    reflectorPlane.setFromNormalAndCoplanarPoint(planeNormal, reflectorWorldPosition);
    reflectorPlane.applyMatrix4(virtualCamera.matrixWorldInverse);
    clipPlane.set(reflectorPlane.normal.x, reflectorPlane.normal.y, reflectorPlane.normal.z, reflectorPlane.constant);
    const projectionMatrix = virtualCamera.projectionMatrix;
    q.x = (Math.sign(clipPlane.x) + projectionMatrix.elements[8]) / projectionMatrix.elements[0];
    q.y = (Math.sign(clipPlane.y) + projectionMatrix.elements[9]) / projectionMatrix.elements[5];
    q.z = -1.0;
    q.w = (1.0 + projectionMatrix.elements[10]) / projectionMatrix.elements[14];
    if (renderer.isWebGPURenderer) {
      clipPlane.multiplyScalar(1.0 / clipPlane.dot(q));
      projectionMatrix.elements[10] = renderer.coordinateSystem === THREE.WebGPUCoordinateSystem
        ? clipPlane.z - clipBias
        : clipPlane.z + 1.0 - clipBias;
    } else {
      clipPlane.multiplyScalar(2.0 / clipPlane.dot(q));
      projectionMatrix.elements[10] = clipPlane.z + 1.0 - clipBias;
    }
    projectionMatrix.elements[2] = clipPlane.x;
    projectionMatrix.elements[6] = clipPlane.y;
    projectionMatrix.elements[14] = clipPlane.w;

    const consumers = collectConsumerMeshes();
    const previousVisibility = consumers.map((mesh) => mesh.visible);
    consumers.forEach((mesh) => { mesh.visible = false; });

    const currentRenderTarget = renderer.getRenderTarget();
    const currentXrEnabled = renderer.xr.enabled;
    const currentShadowAutoUpdate = renderer.shadowMap.autoUpdate;
    renderer.xr.enabled = false;
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(renderTarget);
    // renderer.state is a classic-WebGL-only surface; the node renderer
    // clears through autoClear inside render() instead.
    if (renderer.state) {
      renderer.state.buffers.depth.setMask(true);
      renderer.clear();
    }
    renderer.render(scene, virtualCamera);
    renderer.xr.enabled = currentXrEnabled;
    renderer.shadowMap.autoUpdate = currentShadowAutoUpdate;
    renderer.setRenderTarget(currentRenderTarget);

    consumers.forEach((mesh, index) => { mesh.visible = previousVisibility[index]; });

    setEnvironmentPlanarReflection({ texture: renderTarget.texture, matrix: textureMatrix });
  }

  function setEnabled(value) {
    enabled = Boolean(value);
    if (!enabled) setEnvironmentPlanarReflection({ texture: null });
  }

  function setFloorY(value) {
    if (Number.isFinite(value)) planePoint.y = value;
  }

  function dispose() {
    setEnvironmentPlanarReflection({ texture: null });
    renderTarget.dispose();
  }

  return {
    dispose,
    get enabled() { return enabled; },
    renderTarget: () => renderTarget,
    setEnabled,
    setFloorY,
    texture: () => renderTarget.texture,
    textureMatrix,
    update,
  };
}
