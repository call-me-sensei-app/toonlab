// Real-gravity settling for debris compositions. The generator's
// deterministic placement gives each piece a near-rest starting pose;
// this pass hands the pieces to Rapier (convex-hull colliders, gravity,
// friction) and lets them fall, tumble, and slide until every body
// sleeps — so piles, bundles, and scatters rest the way they would in
// real life, with no interpenetration and no floaters. Runs in browser
// and Node (rapier3d-compat inlines its WASM).

import * as THREE from 'three';

const MAX_STEPS = 300;
const SLEEP_CHECK_EVERY = 20;
// Every vertex goes into the hull: a sampled subset leaves mesh vertices
// outside the collider, and once the body rotates during the sim those
// vertices swing below the contact surface — pieces visually sink into
// the ground. Rapier's quickhull chews through this budget in ~ms.
const HULL_POINT_BUDGET = 30000;

let rapierPromise = null;

// Optional peer dependency. The specifier is kept out of the import call so
// bundlers (vite/esbuild/rollup/webpack) do not try to resolve it at build
// time — consumers who never enable physics settling must not need the
// package installed just to bundle debrisgen.
const RAPIER_SPECIFIER = '@dimforge/rapier3d-compat';

function getRapier() {
  if (!rapierPromise) {
    rapierPromise = import(/* @vite-ignore */ /* webpackIgnore: true */ RAPIER_SPECIFIER)
      .then(async (module) => {
        const RAPIER = module.default ?? module;
        await RAPIER.init();
        return RAPIER;
      })
      .catch((error) => {
        rapierPromise = null;
        throw new Error(
          'Debris physics settling needs the optional peer dependency '
          + '"@dimforge/rapier3d-compat". Install it (npm install '
          + '@dimforge/rapier3d-compat) or disable physics settling.',
          { cause: error },
        );
      });
  }
  return rapierPromise;
}

// One point cloud PER SUB-MESH, in the piece's body frame. A single hull
// around a whole piece bridges concavities (a forked branch rides half a
// unit up on the invisible envelope between its prongs); a compound body
// with one hull per tube/cap/knot hugs the real shape.
function collectMeshClouds(piece) {
  const clouds = [];
  const vertex = new THREE.Vector3();
  const inverseRotation = piece.quaternion.clone().invert();
  piece.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const position = mesh.geometry.attributes.position;
    if (!position || position.count < 4) return;
    const stride = Math.max(1, Math.ceil(position.count / HULL_POINT_BUDGET));
    const points = [];
    for (let index = 0; index < position.count; index += stride) {
      vertex
        .fromBufferAttribute(position, index)
        .applyMatrix4(mesh.matrixWorld)
        .sub(piece.position)
        .applyQuaternion(inverseRotation);
      points.push(vertex.x, vertex.y, vertex.z);
    }
    if (points.length < 12) return;
    // Merged meshes (Tree Lab branches, SDF skulls) are one concave
    // geometry — slab-decompose along the longest axis so the hulls
    // follow trunk and forks instead of bridging them.
    for (const slab of splitCloudIntoSlabs(points)) clouds.push(slab);
  });
  return clouds;
}

function splitCloudIntoSlabs(points) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < points.length; index += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], points[index + axis]);
      max[axis] = Math.max(max[axis], points[index + axis]);
    }
  }
  const extents = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const longAxis = extents.indexOf(Math.max(...extents));
  const sorted = [...extents].sort((a, b) => b - a);
  const slabCount = Math.min(Math.max(Math.round(sorted[0] / Math.max(sorted[1], 1e-4)), 1), 8);
  if (slabCount <= 1) return [new Float32Array(points)];
  const buckets = Array.from({ length: slabCount }, () => []);
  const span = extents[longAxis] || 1e-4;
  for (let index = 0; index < points.length; index += 3) {
    const t = (points[index + longAxis] - min[longAxis]) / span;
    const bucket = Math.min(Math.floor(t * slabCount), slabCount - 1);
    buckets[bucket].push(points[index], points[index + 1], points[index + 2]);
  }
  const slabs = buckets.filter((bucket) => bucket.length >= 12).map((bucket) => new Float32Array(bucket));
  return slabs.length > 0 ? slabs : [new Float32Array(points)];
}

/**
 * Simulates the asset's pieces under gravity and bakes the resting
 * transforms. Deterministic for a given asset (fixed body order, fixed
 * timestep). Skips ash/pile assets (mound geometry is its own ground).
 */
export async function settleDebrisPhysics(root, { maxSteps = MAX_STEPS } = {}) {
  const recipe = root.userData.debrisRecipe;
  // Single pieces settle too — a lone branch balances on real contact
  // points only under real gravity.
  if (!recipe || recipe.asset.type === 'ash' || root.children.length === 0) return root;

  const RAPIER = await getRapier();
  // Physics runs in unscaled space; rest poses are scale-invariant, so
  // the asset scale is restored afterwards.
  const savedScale = root.scale.x;
  root.scale.setScalar(1);
  root.updateMatrixWorld(true);

  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(200, 1, 200).setTranslation(0, -1, 0).setFriction(0.9),
  );

  const bodies = [];
  for (const piece of root.children) {
    piece.updateMatrixWorld(true);
    const clouds = collectMeshClouds(piece);
    if (clouds.length === 0) continue;
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        // Tiny lift relieves any initial interpenetration without a pop.
        .setTranslation(piece.position.x, piece.position.y + 0.02, piece.position.z)
        .setRotation({
          w: piece.quaternion.w, x: piece.quaternion.x, y: piece.quaternion.y, z: piece.quaternion.z,
        })
        // Low angular damping: pieces caught mid-tip fall over to a truly
        // stable face instead of freezing upright on an end cap.
        .setLinearDamping(0.4)
        .setAngularDamping(0.25),
    );
    let attached = 0;
    for (const cloud of clouds) {
      const colliderDesc = RAPIER.ColliderDesc.convexHull(cloud);
      if (!colliderDesc) continue;
      world.createCollider(colliderDesc.setFriction(0.85).setRestitution(0.02), body);
      attached += 1;
    }
    if (attached === 0) {
      const bounds = new THREE.Box3().setFromObject(piece, true);
      const size = bounds.getSize(new THREE.Vector3());
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(
          Math.max(size.x / 2, 0.01), Math.max(size.y / 2, 0.01), Math.max(size.z / 2, 0.01),
        ).setFriction(0.85).setRestitution(0.02),
        body,
      );
    }
    bodies.push({ body, piece });
  }

  world.timestep = 1 / 60;
  const run = (steps) => {
    for (let step = 0; step < steps; step += 1) {
      world.step();
      if (step % SLEEP_CHECK_EVERY === SLEEP_CHECK_EVERY - 1
        && bodies.every(({ body }) => body.isSleeping())) break;
    }
  };
  const bake = () => {
    for (const { body, piece } of bodies) {
      const translation = body.translation();
      const rotation = body.rotation();
      piece.position.set(translation.x, translation.y, translation.z);
      piece.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
      piece.updateMatrixWorld(true);
    }
  };

  run(maxSteps);
  bake();

  // Balanced-on-end poses (a log standing on its sawn face) are stable
  // under pure gravity but almost never occur with real thrown debris —
  // pieces arrive with momentum. Detect anything resting taller than
  // wide, give it a deterministic tip-over impulse, and settle again.
  const bounds = new THREE.Box3();
  for (let round = 0; round < 3; round += 1) {
    const standing = bodies.filter(({ piece }) => {
      bounds.setFromObject(piece, true);
      const height = bounds.max.y - bounds.min.y;
      const footprint = Math.max(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z);
      return height > footprint * 1.25;
    });
    if (standing.length === 0) break;
    for (const [index, { body }] of standing.entries()) {
      body.wakeUp();
      // Strong deterministic shove, direction varied per round so a piece
      // wedged against neighbours eventually finds a way down.
      const magnitude = body.mass() * (0.45 + round * 0.3);
      const flip = (index + round) % 2 === 0 ? 1 : -1;
      body.applyTorqueImpulse({ x: magnitude * flip, y: 0, z: magnitude * 0.5 * -flip }, true);
    }
    run(220);
    bake();
  }
  world.free();

  root.scale.setScalar(savedScale);
  root.updateMatrixWorld(true);
  return root;
}
