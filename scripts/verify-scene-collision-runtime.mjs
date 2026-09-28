import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  createSceneCollisionRuntime,
  sceneCollisionRuntimeFor,
} from '../src/runtime/sceneCollisionRuntime.js';
import { createWalkableCharacterRuntime } from '../src/character/walkableCharacterRuntime.js';
import { createSceneStyleRuntime } from '../src/styles/sceneStyleRuntime.js';
import { CALL_ME_SENSEI_STYLE_BUNDLE } from '../src/styles/styleBundle.js';
import {
  createCollisionMetadata,
  createCollisionAdapter,
  createRapierCollisionAdapter,
} from '../src/collisionMetadata.js';
import {
  labelStyleTarget,
} from '../src/styles/styleTargetDiscovery.js';

// styleTargetDiscovery intentionally does not re-export the label builder.
// Keep this fixture on the same public split a consumer uses.
import { createStyleTargetLabel as createLabel } from '../src/styles/styleTargetLabels.js';

function labeledBox(scene, id, domain, position, collision = undefined) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(2, 2, 2),
    new THREE.MeshBasicMaterial(),
  );
  mesh.name = id;
  mesh.position.fromArray(position);
  labelStyleTarget(mesh, createLabel(domain, {
    targetId: id,
    ...(collision === undefined ? {} : { collision }),
  }));
  scene.add(mesh);
  return mesh;
}

function characterFixture() {
  return {
    actions: {},
    dispose() {},
    update() {},
  };
}

function bodyFixture(position) {
  return {
    userData: { canJump: true },
    position: { ...position },
    velocity: { x: 0, y: 0, z: 0 },
    angular: { x: 0, y: 0, z: 0 },
    rotationValue: { x: 0, y: 0, z: 0, w: 1 },
    angvel() { return this.angular; },
    linvel() { return this.velocity; },
    rotation() { return this.rotationValue; },
    translation() { return this.position; },
    setAngvel(value) { this.angular = value; },
    setLinvel(value) { this.velocity = value; },
    setRotation(value) { this.rotationValue = value; },
    setTranslation(value) { this.position = { ...value }; },
  };
}

const scene = new THREE.Scene();
const rock = labeledBox(scene, 'collision/rock', 'natural.rock', [0, 1, 0]);
const bench = labeledBox(scene, 'collision/bench', 'manufactured.surface', [6, 1, 0], 'solid');
const tree = labeledBox(scene, 'collision/tree', 'vegetation.tree', [-6, 1, 0]);
const grass = labeledBox(scene, 'collision/grass', 'vegetation.grass', [0, 1, 6]);
const decorative = labeledBox(scene, 'collision/decorative', 'prop', [0, 1, -6], 'none');

const collision = createSceneCollisionRuntime({ heightAt: (x) => x * 0.05, scene });
assert.equal(sceneCollisionRuntimeFor(scene), collision);
let report = await collision.refresh();
assert.equal(report.ok, true);
assert.equal(report.stats.targets, 5);
assert.equal(report.stats.solid, 3);
assert.equal(report.stats.registered, 3);
assert.equal(collision.world.groundHeight(4, 0), 0.2);
assert.equal(report.targets.find(({ targetId }) => targetId === 'collision/rock').source, 'domain-default');
assert.equal(report.targets.find(({ targetId }) => targetId === 'collision/bench').source, 'explicit-solid');
assert.equal(report.targets.find(({ targetId }) => targetId === 'collision/grass').kind, 'none');
assert.equal(report.targets.find(({ targetId }) => targetId === 'collision/decorative').kind, 'none');

const embedded = { x: 0, y: 1, z: 0 };
collision.world.resolve(embedded, 0.28);
assert.ok(Math.hypot(embedded.x, embedded.z) > 1.6, 'default rock bounds must block the actor');

const walkable = await createWalkableCharacterRuntime({
  characterRuntime: characterFixture(),
  ground: () => 0,
  renderPasses: false,
  scene,
});
const body = bodyFixture({ x: 6, y: 1, z: 0 });
const frame = walkable.update({ body, grounded: true });
assert.equal(frame.collision.enabled, true);
assert.equal(frame.collision.corrected, true);
assert.ok(Math.abs(body.position.x - 6) > 1.6, 'walkable runtime must consume the scene binding');
walkable.dispose();

scene.remove(rock);
report = await collision.refresh();
assert.equal(report.stats.solid, 2);
assert.equal(report.stats.registered, 2);

const replacement = labeledBox(scene, 'collision/tree', 'vegetation.tree', [-10, 1, 0]);
scene.remove(tree);
report = await collision.refresh();
assert.equal(report.stats.solid, 2);
const oldTreePoint = { x: -6, y: 1, z: 0 };
collision.world.resolve(oldTreePoint, 0.28);
assert.equal(oldTreePoint.x, -6, 'replaced target must release its old blocker');
const newTreePoint = { x: -10, y: 1, z: 0 };
collision.world.resolve(newTreePoint, 0.28);
assert.notEqual(newTreePoint.x, -10, 'replacement target must register its new blocker');

const unsupported = labeledBox(
  scene,
  'collision/trimesh',
  'natural.rock',
  [12, 1, 0],
  createCollisionMetadata('trimesh', { source: 'render-mesh' }),
);
await assert.rejects(
  collision.refresh(),
  /No collision adapter supports "trimesh"/,
);
assert.equal(collision.report.ok, false);
scene.remove(unsupported);
report = await collision.refresh();
assert.equal(report.ok, true);

const routed = [];
const physicsAdapter = createCollisionAdapter('test/physics', {
  kinds: ['trimesh'],
  register({ targetId }) {
    routed.push(targetId);
    return { dispose() {}, registered: 1 };
  },
});
collision.dispose();
const physicsCollision = createSceneCollisionRuntime({ adapters: [physicsAdapter], scene });
scene.add(unsupported);
report = await physicsCollision.refresh();
assert.equal(report.ok, true);
assert.deepEqual(routed, ['collision/trimesh']);
assert.equal(report.stats.solid, 3);

physicsCollision.dispose();
assert.equal(sceneCollisionRuntimeFor(scene), null);

const integratedScene = new THREE.Scene();
labeledBox(integratedScene, 'collision/integrated-rock', 'natural.rock', [3, 1, 2]);
const styleRuntime = createSceneStyleRuntime({ scene: integratedScene });
await styleRuntime.apply(CALL_ME_SENSEI_STYLE_BUNDLE, {
  discovery: 'scene-labels',
  mode: 'strict',
  watch: false,
});
assert.equal(styleRuntime.collision.report.ok, true);
assert.equal(styleRuntime.collision.report.stats.solid, 1);
assert.equal(styleRuntime.collision.report.stats.registered, 1);
const integratedPoint = { x: 3, y: 1, z: 2 };
styleRuntime.collision.world.resolve(integratedPoint, 0.28);
assert.notDeepEqual(integratedPoint, { x: 3, y: 1, z: 2 });
await styleRuntime.dispose();
assert.equal(sceneCollisionRuntimeFor(integratedScene), null);
integratedScene.traverse((object) => {
  object.geometry?.dispose?.();
  object.material?.dispose?.();
});

const rapierDescriptions = [];
const rapierRemoved = [];
const descriptor = (kind, values) => ({
  kind,
  setTranslation(x, y, z) { this.translation = [x, y, z]; return this; },
  values,
});
const fakeRapier = {
  ColliderDesc: {
    cuboid: (...values) => descriptor('cuboid', values),
    cylinder: (...values) => descriptor('cylinder', values),
    convexHull: (vertices) => descriptor('convex', [vertices]),
    trimesh: (vertices, indices) => descriptor('trimesh', [vertices, indices]),
  },
};
const fakeRapierWorld = {
  createCollider(description) { rapierDescriptions.push(description); return description; },
  removeCollider(collider) { rapierRemoved.push(collider); },
};
const rapierAdapter = createRapierCollisionAdapter({ rapier: fakeRapier, world: fakeRapierWorld });
const rapierScene = new THREE.Scene();
const rapierRock = labeledBox(rapierScene, 'collision/rapier-rock', 'natural.rock', [2, 1, -4]);
const rapierRuntime = createSceneCollisionRuntime({
  adapter: rapierAdapter,
  collision: fakeRapierWorld,
  scene: rapierScene,
});
report = await rapierRuntime.refresh();
assert.equal(report.stats.registered, 1);
assert.equal(rapierDescriptions[0].kind, 'cuboid');
assert.deepEqual(rapierDescriptions[0].translation, [2, 1, -4]);
rapierRuntime.dispose();
assert.equal(rapierRemoved.length, 1, 'Rapier colliders must be removed on runtime disposal');
rapierRock.geometry.dispose();
rapierRock.material.dispose();

for (const object of [rock, bench, tree, grass, decorative, replacement, unsupported]) {
  object.geometry.dispose();
  object.material.dispose();
}

console.log('Scene collision runtime verified: lightweight and Rapier defaults, explicit none, replacement, disposal, adapters, and walkable auto-binding.');
