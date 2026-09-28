import { BoxGeometry, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene } from 'three';
import WebGPURenderer from 'three/webgpu';
import { createSceneStyleRuntime, createStyleTargetLabel, labelStyleTarget } from '@call-me-sensei/toonlab';

const renderer = new WebGPURenderer({ canvas: document.querySelector('#scene') });
await renderer.init();
renderer.setSize(innerWidth, innerHeight);

const scene = new Scene();
const camera = new PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(4, 3, 6);
camera.lookAt(0, 0, 0);

const rock = new Mesh(new BoxGeometry(2, 1.4, 1.6), new MeshStandardMaterial({ color: '#888888' }));
labelStyleTarget(rock, createStyleTargetLabel('natural.rock', { targetId: 'example-rock' }));
scene.add(rock);

const toonlab = createSceneStyleRuntime({ renderer, scene, quality: 'balanced' });
await toonlab.apply('call-me-sensei', { discovery: 'scene-labels', watch: true });
renderer.setAnimationLoop((_time) => {
  toonlab.update(1 / 60, camera);
  renderer.render(scene, camera);
});
