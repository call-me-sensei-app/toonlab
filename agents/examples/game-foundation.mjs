// Copyable host-game example, not a ToonLab export. Requires a bundler and canvas.
import * as THREE from 'three';
import { WebGPURenderer } from 'three/webgpu';
import {
  CALL_ME_SENSEI_STYLE_BUNDLE,
  createSceneStyleRuntime,
  createStyleMaterialContract,
  createStyleTargetLabel,
  labelStyleTarget,
} from '@call-me-sensei/toonlab/styles';
import { createCollisionMetadata } from '@call-me-sensei/toonlab/world-collision';

export async function startGame({ canvas, onState = () => {} }) {
  const renderer = new WebGPURenderer({ canvas, antialias: true });
  try { await renderer.init(); }
  catch (error) { renderer.dispose(); throw error; }
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#b7d8ec');
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(8, 10, 12);
  camera.lookAt(0, 0, 0);
  const objects = [];
  function add(id, domain, role, geometry, color, position, collision) {
    const material = new THREE.MeshStandardMaterial({ color });
    material.userData.toonlabMaterialId = id;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.fromArray(position);
    labelStyleTarget(mesh, createStyleTargetLabel(domain, {
      targetId: id,
      materials: createStyleMaterialContract(domain, { assignments: { [id]: { roles: [role] } } }),
      ...(collision ? { collision } : {}),
    }));
    scene.add(mesh); objects.push(mesh);
    return mesh;
  }
  const floor = add('floor', 'terrain.ground', 'ground', new THREE.PlaneGeometry(14, 14), '#a3be76', [0, 0, 0]);
  floor.rotation.x = -Math.PI / 2;
  add('blocker', 'natural.rock', 'rock', new THREE.BoxGeometry(2, 2, 2), '#b4aea0', [0, 1, 0]);
  const player = add('player', 'character', 'costume', new THREE.CapsuleGeometry(0.3, 0.8, 4, 8), '#bd6182', [-3, 0.7, 2]);
  const goal = add('goal', 'prop', 'metal', new THREE.SphereGeometry(0.25, 12, 8), '#f5c45a', [3, 0.6, -3], createCollisionMetadata('none'));
  scene.updateMatrixWorld(true);
  const styleRuntime = createSceneStyleRuntime({ renderer, scene });
  try {
    await styleRuntime.apply(CALL_ME_SENSEI_STYLE_BUNDLE, { discovery: 'scene-labels', mode: 'strict', watch: false });
    styleRuntime.collision.assertReady();
  } catch (error) {
    await styleRuntime.dispose();
    for (const mesh of objects) { mesh.geometry.dispose(); mesh.material.dispose(); }
    renderer.dispose(); throw error;
  }

  const keys = new Set();
  const listeners = new AbortController();
  let won = false, lastTime = null, disposed = false;
  function restart() {
    player.position.set(-3, 0.7, 2); goal.visible = true; won = false;
    keys.clear(); lastTime = null; onState({ won });
  }
  window.addEventListener('keydown', (event) => {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName) || event.target?.isContentEditable) return;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'].includes(event.code)) {
      event.preventDefault(); keys.add(event.code);
    }
    if (event.code === 'KeyR') restart();
  }, { signal: listeners.signal });
  window.addEventListener('keyup', (event) => keys.delete(event.code), { signal: listeners.signal });
  window.addEventListener('blur', () => { keys.clear(); lastTime = null; }, { signal: listeners.signal });
  function resize() {
    const width = Math.max(canvas.clientWidth, 1), height = Math.max(canvas.clientHeight, 1);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize, { signal: listeners.signal });
  resize(); restart();
  renderer.setAnimationLoop((time) => {
    const delta = lastTime === null ? 0 : Math.min((time - lastTime) / 1000, 0.05);
    lastTime = time;
    if (!won) {
      const x = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
      const z = Number(keys.has('KeyS') || keys.has('ArrowDown')) - Number(keys.has('KeyW') || keys.has('ArrowUp'));
      const length = Math.hypot(x, z) || 1;
      player.position.x = THREE.MathUtils.clamp(player.position.x + x / length * delta * 3, -6.5, 6.5);
      player.position.z = THREE.MathUtils.clamp(player.position.z + z / length * delta * 3, -6.5, 6.5);
      styleRuntime.collision.world.resolve(player.position, 0.3);
      if (Math.hypot(player.position.x - goal.position.x, player.position.z - goal.position.z) < 0.65) {
        won = true; goal.visible = false; onState({ won });
      }
    }
    styleRuntime.update(delta, camera);
    renderer.render(scene, camera);
  });
  return {
    restart,
    // Read-only telemetry is useful for a host smoke test and debugging.
    get state() { return { won, player: player.position.toArray(), collision: styleRuntime.collision.report }; },
    async dispose() {
      if (disposed) return; disposed = true;
      renderer.setAnimationLoop(null); listeners.abort();
      await styleRuntime.dispose();
      for (const mesh of objects) { mesh.geometry.dispose(); mesh.material.dispose(); }
      renderer.dispose();
    },
  };
}
