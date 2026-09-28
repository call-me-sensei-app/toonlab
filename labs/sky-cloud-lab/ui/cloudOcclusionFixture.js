// Repository QA fixture (?occlusion=1): opaque cards before, inside, and
// beyond the cloud shell. These deliberately unlit colors test occlusion,
// not the style bundle's material/lighting treatment.
import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { positionView, vec4 } from 'three/tsl';

export function createCloudOcclusionFixture({ scene, camera, renderer, sky }) {
  const root = new THREE.Group();
  root.name = 'CloudOcclusionQA';
  const geometry = new THREE.PlaneGeometry(1, 1);
  const forward = camera.getWorldDirection(new THREE.Vector3());
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  const materials = [];
  for (const [index, distance] of [500, 25000, 70000].entries()) {
    const material = new MeshBasicNodeMaterial({ color: [0xff00ff, 0x00ff00, 0xff3300][index] });
    material.toneMapped = false;
    materials.push(material);
    const card = new THREE.Mesh(geometry, material);
    card.name = ['Near opaque card', 'Intersecting opaque card', 'Far opaque card'][index];
    card.position.copy(camera.position).addScaledVector(forward, distance)
      .addScaledVector(right, (index - 1) * distance * 0.45);
    card.quaternion.copy(camera.quaternion);
    card.scale.set(distance * 0.25, distance * 0.55, 1);
    root.add(card);
  }
  scene.add(root);
  const depthMaterial = new MeshBasicNodeMaterial();
  depthMaterial.colorNode = vec4(positionView.z.negate(), 0, 0, 1);
  depthMaterial.toneMapped = false;
  const depth = new THREE.RenderTarget(1, 1, {
    type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
  });
  depth.name = 'CloudOpaqueDepthQA';
  depth.texture.colorSpace = THREE.NoColorSpace;
  sky.setSceneDepthTexture(depth.texture);
  const oldColor = new THREE.Color();
  const size = new THREE.Vector2();
  return {
    render() {
      // Keep the diagnostic cards visible beyond the normal world-rim fade.
      sky.atmosphere.fogDensity.value = 0;
      sky.atmosphere.fogFarFadeStart.value = 100000;
      sky.atmosphere.fogFarFadeEnd.value = 120000;
      renderer.getDrawingBufferSize(size);
      if (depth.width !== size.x || depth.height !== size.y) depth.setSize(size.x, size.y);
      const target = renderer.getRenderTarget();
      const override = scene.overrideMaterial;
      const background = scene.background;
      const autoClear = renderer.autoClear;
      renderer.getClearColor(oldColor);
      const alpha = renderer.getClearAlpha();
      const hidden = scene.children.filter((child) => child !== root && child.visible);
      try {
        hidden.forEach((child) => { child.visible = false; });
        scene.background = null;
        scene.overrideMaterial = depthMaterial;
        renderer.autoClear = true;
        renderer.setClearColor(new THREE.Color(65000, 0, 0), 1);
        renderer.setRenderTarget(depth);
        renderer.render(scene, camera);
      } finally {
        renderer.setRenderTarget(target);
        renderer.setClearColor(oldColor, alpha);
        renderer.autoClear = autoClear;
        scene.background = background;
        scene.overrideMaterial = override;
        hidden.forEach((child) => { child.visible = true; });
      }
    },
    dispose() {
      sky.setSceneDepthTexture(null);
      root.removeFromParent();
      geometry.dispose();
      materials.forEach((material) => material.dispose());
      depthMaterial.dispose();
      depth.dispose();
    },
  };
}
