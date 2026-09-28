import * as THREE from 'three';

function materialsFor(object) {
  if (!object?.material) return [];
  return Array.isArray(object.material) ? object.material : [object.material];
}

export function collectManufacturedMirrorMeshes(root) {
  const mirrors = [];
  root?.traverse?.((object) => {
    if (!object.isMesh) return;
    if (materialsFor(object).some((material) => (
      material?.userData?.urbanMaterial?.finish === 'mirror'
    ))) {
      mirrors.push(object);
    }
  });
  return mirrors;
}

export function createManufacturedReflectionProbe({
  far = 80,
  near = 0.05,
  renderer,
  resolution = 256,
  scene,
} = {}) {
  if (!renderer || !scene) {
    throw new Error('renderer and scene are required for a manufactured reflection probe.');
  }

  const renderTarget = new THREE.WebGLCubeRenderTarget(resolution, {
    depthBuffer: true,
    generateMipmaps: true,
    magFilter: THREE.LinearFilter,
    minFilter: THREE.LinearMipmapLinearFilter,
    type: THREE.HalfFloatType,
  });
  renderTarget.texture.mapping = THREE.CubeReflectionMapping;
  renderTarget.texture.name = 'ToonLab manufactured reflection probe';

  const camera = new THREE.CubeCamera(near, far, renderTarget);
  camera.name = 'ToonLab manufactured reflection probe camera';
  const captureBounds = new THREE.Box3();
  const captureCenter = new THREE.Vector3();
  let disposed = false;

  function capture(root) {
    if (disposed) {
      throw new Error('Cannot capture with a disposed manufactured reflection probe.');
    }
    const consumers = collectManufacturedMirrorMeshes(root);
    if (consumers.length === 0) {
      return {
        consumerCount: 0,
        mode: 'not-required',
        position: null,
        texture: renderTarget.texture,
      };
    }

    captureBounds.makeEmpty();
    for (const consumer of consumers) {
      consumer.updateWorldMatrix(true, false);
      captureBounds.expandByObject(consumer, true);
    }
    captureBounds.getCenter(captureCenter);
    camera.position.copy(captureCenter);

    const previousVisibility = consumers.map((consumer) => consumer.visible);
    consumers.forEach((consumer) => {
      consumer.visible = false;
    });
    const previousRenderTarget = renderer.getRenderTarget();
    const previousXrEnabled = renderer.xr.enabled;
    const previousShadowAutoUpdate = renderer.shadowMap.autoUpdate;
    renderer.xr.enabled = false;
    renderer.shadowMap.autoUpdate = false;
    try {
      camera.update(renderer, scene);
    } finally {
      renderer.setRenderTarget(previousRenderTarget);
      renderer.xr.enabled = previousXrEnabled;
      renderer.shadowMap.autoUpdate = previousShadowAutoUpdate;
      consumers.forEach((consumer, index) => {
        consumer.visible = previousVisibility[index];
      });
    }

    return {
      consumerCount: consumers.length,
      mode: 'probe',
      position: captureCenter.clone(),
      texture: renderTarget.texture,
    };
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    renderTarget.dispose();
  }

  return {
    camera,
    capture,
    dispose,
    get disposed() {
      return disposed;
    },
    renderTarget,
    texture: renderTarget.texture,
  };
}
