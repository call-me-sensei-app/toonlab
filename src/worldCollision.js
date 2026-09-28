// Lightweight world collision. Import from '@call-me-sensei/toonlab'.
//
// Not a physics engine — a walkability service for stylized worlds, so a
// third-person character can't stroll through tree trunks and boulders and
// always knows the ground height. createSceneStyleRuntime() constructs and
// populates this service automatically for labeled solid domains. Hosts may
// still construct it explicitly for custom worlds or standalone use:
//
//   collision.addCircles(rockBlockers);         // [{ x, z, radius }]
//   // in the controller, after applying movement:
//   collision.resolve(character.position, 0.35); // pushes out of blockers
//
// Blockers are 2D circles on a spatial hash — thousands resolve in
// microseconds. Hosts that outgrow this (dynamic bodies, ragdolls) graduate
// to a real physics engine; the two coexist fine.

export function createWorldCollision({ heightAt = null, cellSize = 16 } = {}) {
  const circles = [];
  const grid = new Map();
  const cell = Math.max(Number(cellSize) || 16, 1);
  const keyOf = (ix, iz) => `${ix},${iz}`;

  function addCircle(x, z, radius) {
    const circle = {
      radius: Math.max(Number(radius) || 0, 0),
      x: Number(x) || 0,
      z: Number(z) || 0,
    };
    if (circle.radius <= 0) return circle;
    circles.push(circle);
    const reach = Math.ceil(circle.radius / cell);
    const cx = Math.floor(circle.x / cell);
    const cz = Math.floor(circle.z / cell);
    for (let ix = cx - reach; ix <= cx + reach; ix += 1) {
      for (let iz = cz - reach; iz <= cz + reach; iz += 1) {
        const key = keyOf(ix, iz);
        const bucket = grid.get(key);
        if (bucket) bucket.push(circle);
        else grid.set(key, [circle]);
      }
    }
    return circle;
  }

  /** Registers `[{ x, z, radius }]` blockers in bulk. */
  function addCircles(list = []) {
    return list.map((entry) => addCircle(entry.x, entry.z, entry.radius));
  }

  /** Removes a previously returned blocker without rebuilding the service. */
  function removeCircle(circle) {
    const index = circles.indexOf(circle);
    if (index === -1) return false;
    circles.splice(index, 1);
    for (const [key, bucket] of grid) {
      const bucketIndex = bucket.indexOf(circle);
      if (bucketIndex !== -1) bucket.splice(bucketIndex, 1);
      if (bucket.length === 0) grid.delete(key);
    }
    return true;
  }

  function removeCircles(list = []) {
    let removed = 0;
    for (const circle of list) if (removeCircle(circle)) removed += 1;
    return removed;
  }

  function clear() {
    const removed = circles.length;
    circles.length = 0;
    grid.clear();
    return removed;
  }

  /**
   * Pushes a position (mutated in place) out of every overlapping blocker.
   * Two passes settle corner cases where one push slides into a neighbor.
   * Returns the position for chaining. `y` is untouched — pair with
   * `groundHeight(x, z)` for vertical placement.
   */
  function resolve(position, radius = 0.35) {
    const bodyRadius = Math.max(Number(radius) || 0, 0);
    for (let pass = 0; pass < 2; pass += 1) {
      const cx = Math.floor(position.x / cell);
      const cz = Math.floor(position.z / cell);
      let pushed = false;
      for (let ix = cx - 1; ix <= cx + 1; ix += 1) {
        for (let iz = cz - 1; iz <= cz + 1; iz += 1) {
          const bucket = grid.get(keyOf(ix, iz));
          if (!bucket) continue;
          for (const circle of bucket) {
            const dx = position.x - circle.x;
            const dz = position.z - circle.z;
            const minDistance = circle.radius + bodyRadius;
            const distanceSq = dx * dx + dz * dz;
            if (distanceSq >= minDistance * minDistance) continue;
            if (distanceSq <= 1e-12) {
              // The separation normal is undefined at the exact centre. Pick
              // one stable axis so identical inputs never jitter or remain
              // embedded in the blocker.
              position.x = circle.x + minDistance;
              pushed = true;
              continue;
            }
            const distance = Math.sqrt(distanceSq);
            const push = (minDistance - distance) / distance;
            position.x += dx * push;
            position.z += dz * push;
            pushed = true;
          }
        }
      }
      if (!pushed) break;
    }
    return position;
  }

  /** Terrain height at a point (0 without a heightAt sampler). */
  function groundHeight(x, z) {
    if (typeof heightAt !== 'function') return 0;
    const y = Number(heightAt(x, z));
    return Number.isFinite(y) ? y : 0;
  }

  return {
    addCircle,
    addCircles,
    circles,
    clear,
    groundHeight,
    removeCircle,
    removeCircles,
    resolve,
  };
}

export {
  COLLISION_METADATA_KINDS,
  COLLISION_METADATA_VERSION,
  createCollisionAdapter,
  createCollisionMetadata,
  createRapierCollisionAdapter,
  collectObjectTrimesh,
  LIGHTWEIGHT_WORLD_COLLISION_ADAPTER,
  registerCollisionTarget,
  TRIMESH_DATA_COLLISION_ADAPTER,
  validateCollisionMetadata,
} from './collisionMetadata.js';
