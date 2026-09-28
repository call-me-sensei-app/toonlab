// The universal placement pipeline: any PropAsset into a world, correctly —
// grounded via heightAt + anchor, instanced per variant, hi/lo LOD swapped
// by TRUE 3D camera distance, collision circles registered, shadow flags
// set. Extends the scatter.js discipline (seeded, deterministic,
// heightAt-driven) rather than replacing it.

import * as THREE from 'three';

function mulberry32(seed) {
  let state = (Math.trunc(seed) || 1) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ZERO_SCALE = new THREE.Matrix4().makeScale(0, 0, 0);
const scratchMatrix = new THREE.Matrix4();
const scratchPosition = new THREE.Vector3();
const scratchQuaternion = new THREE.Quaternion();
const scratchScale = new THREE.Vector3();
const scratchEuler = new THREE.Euler();
const scratchNormal = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

// Bake a built prop group into flat [{ geometry, material }] with mesh
// transforms applied — what instancing needs. Geometries are consumed
// (each asset.build() returns fresh ones).
export function bakeSources(object3D) {
  object3D.updateWorldMatrix(true, true);
  const sources = [];
  object3D.traverse((child) => {
    if (!child.isMesh) return;
    const geometry = child.geometry;
    if (!child.matrixWorld.equals(scratchMatrix.identity())) {
      geometry.applyMatrix4(child.matrixWorld);
    }
    sources.push({
      castShadow: child.castShadow,
      geometry,
      material: child.material,
      receiveShadow: child.receiveShadow,
    });
  });
  return sources;
}

export function slopeQuaternion(heightAt, x, z, maxTilt, out) {
  if (typeof heightAt !== 'function' || maxTilt <= 0) return out.identity();
  const step = 0.6;
  const dx = (heightAt(x + step, z) - heightAt(x - step, z)) / (2 * step);
  const dz = (heightAt(x, z + step) - heightAt(x, z - step)) / (2 * step);
  scratchNormal.set(-dx, 1, -dz).normalize();
  out.setFromUnitVectors(UP, scratchNormal);
  // Clamp the tilt so props never lie flat on cliffs.
  const angle = 2 * Math.acos(Math.min(Math.abs(out.w), 1));
  if (angle > maxTilt) out.slerp(scratchQuaternion.identity(), 1 - maxTilt / angle);
  return out;
}

/**
 * Instanced renderer for one PropAsset over many placements. Variants are
 * distinct seeded builds; hi/lo pools swap on an interval by true 3D camera
 * distance (aerial cameras demote everything, per AGENTS.md).
 */
export class PropInstances extends THREE.Group {
  constructor({
    asset,
    placements = [],
    variants = 4,
    updateInterval = 0.4,
    seed = 1,
  } = {}) {
    super();
    this.name = `PropInstances ${asset?.type ?? 'asset'}`;
    this.placements = placements;
    this.updateInterval = updateInterval;
    this._timer = updateInterval;
    this._camera = null;

    const variantCount = Math.max(1, Math.min(variants, Math.max(placements.length, 1)));
    const random = mulberry32(seed * 2246822519 + 3);
    this._builds = [];
    for (let index = 0; index < variantCount; index += 1) {
      const variantSeed = Math.floor(random() * 0xffffffff);
      const built = asset.build(variantSeed);
      this._builds.push({
        anchor: built.anchor ?? 0,
        footprint: built.footprint ?? { radius: 0.3 },
        hi: bakeSources(built.object3D),
        lo: built.lod?.far ? bakeSources(built.lod.far) : null,
        lodDistance: built.lod?.distance ?? 55,
      });
    }

    // Assign placements to variants and precompose matrices.
    this._entries = placements.map((placement, index) => {
      const variant = (placement.seed ?? index) % variantCount;
      const build = this._builds[variant];
      const yaw = placement.yaw ?? 0;
      const scale = placement.scale ?? 1;
      scratchEuler.set(0, yaw, 0, 'YXZ');
      scratchQuaternion.setFromEuler(scratchEuler);
      if (placement.tiltQuaternion) scratchQuaternion.premultiply(placement.tiltQuaternion);
      scratchPosition.set(
        placement.x,
        (placement.y ?? 0) + build.anchor * scale,
        placement.z,
      );
      scratchScale.setScalar(scale);
      return {
        matrix: new THREE.Matrix4().compose(scratchPosition, scratchQuaternion, scratchScale),
        variant,
        x: placement.x,
        y: placement.y ?? 0,
        z: placement.z,
      };
    });

    // One InstancedMesh per (variant, source, lod-level).
    this._pools = [];
    for (let variant = 0; variant < this._builds.length; variant += 1) {
      const entries = this._entries.filter((entry) => entry.variant === variant);
      const build = this._builds[variant];
      const makePool = (sources, level) => sources.map((source) => {
        const instanced = new THREE.InstancedMesh(
          source.geometry,
          source.material,
          Math.max(entries.length, 1),
        );
        instanced.name = `${this.name}-${variant}-${level}`;
        instanced.castShadow = source.castShadow;
        instanced.receiveShadow = source.receiveShadow;
        // Above-water dressing: skip the refraction grab (the expensive
        // half of the water cost at prop counts) but keep the reflection —
        // shoreline lanterns SHOULD mirror in the lake.
        instanced.userData.waterGrabExclude = true;
        instanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        for (let index = 0; index < Math.max(entries.length, 1); index += 1) {
          instanced.setMatrixAt(index, ZERO_SCALE);
        }
        instanced.count = Math.max(entries.length, 1);
        instanced.frustumCulled = false; // instances span arbitrary area; bounds go stale on swaps
        this.add(instanced);
        return instanced;
      });
      this._pools.push({
        entries,
        hi: makePool(build.hi, 'hi'),
        lo: build.lo ? makePool(build.lo, 'lo') : null,
        lodDistanceSq: build.lodDistance ** 2,
      });
    }
    this._assign(null); // everything hi until a camera shows up
  }

  _assign(camera) {
    for (const pool of this._pools) {
      for (let index = 0; index < pool.entries.length; index += 1) {
        const entry = pool.entries[index];
        let useHi = true;
        if (camera && pool.lo) {
          const dx = entry.x - camera.position.x;
          const dy = entry.y - camera.position.y;
          const dz = entry.z - camera.position.z;
          useHi = dx * dx + dy * dy + dz * dz < pool.lodDistanceSq;
        }
        for (const mesh of pool.hi) mesh.setMatrixAt(index, useHi ? entry.matrix : ZERO_SCALE);
        if (pool.lo) {
          for (const mesh of pool.lo) mesh.setMatrixAt(index, useHi ? ZERO_SCALE : entry.matrix);
        }
      }
      for (const mesh of pool.hi) mesh.instanceMatrix.needsUpdate = true;
      if (pool.lo) for (const mesh of pool.lo) mesh.instanceMatrix.needsUpdate = true;
    }
  }

  /** Call per frame (cheap: reassigns on an interval, not every frame). */
  update(delta = 0.016, camera = null) {
    if (camera) this._camera = camera;
    this._timer += delta;
    if (this._timer < this.updateInterval) return;
    this._timer = 0;
    this._assign(this._camera);
  }

  /** World-frame collision circles for every placement. */
  footprintCircles() {
    const circles = [];
    for (const pool of this._pools) {
      const build = this._builds[this._pools.indexOf(pool)];
      for (const entry of pool.entries) {
        const footprint = build.footprint;
        if (footprint.circles) {
          const position = new THREE.Vector3();
          const quaternion = new THREE.Quaternion();
          const scale = new THREE.Vector3();
          entry.matrix.decompose(position, quaternion, scale);
          for (const circle of footprint.circles) {
            scratchPosition.set(circle.x, 0, circle.z).applyQuaternion(quaternion).multiply(scale);
            circles.push({
              radius: circle.radius * scale.x,
              x: position.x + scratchPosition.x,
              z: position.z + scratchPosition.z,
            });
          }
        } else {
          const scale = entry.matrix.getMaxScaleOnAxis();
          circles.push({ radius: (footprint.radius ?? 0.3) * scale, x: entry.x, z: entry.z });
        }
      }
    }
    return circles;
  }

  dispose() {
    this.parent?.remove(this);
    for (const pool of this._pools) {
      for (const mesh of [...pool.hi, ...(pool.lo ?? [])]) {
        mesh.geometry.dispose();
        mesh.dispose();
      }
    }
  }
}

export function resolvePlacement(position, heightAt, random, { yawMode, scaleRange, alignToSlope }) {
  const x = Number(position.x ?? position[0]) || 0;
  const z = Number(position.z ?? position[1]) || 0;
  const y = typeof heightAt === 'function' ? (Number(heightAt(x, z)) || 0) : Number(position.y) || 0;
  const yaw = position.yaw ?? (
    yawMode === 'random' ? random() * Math.PI * 2
      : Number(yawMode) || 0
  );
  const scale = scaleRange
    ? scaleRange[0] + (scaleRange[1] - scaleRange[0]) * random()
    : 1;
  const placement = { scale, seed: Math.floor(random() * 0xffffffff), x, y, yaw, z };
  if (alignToSlope) {
    placement.tiltQuaternion = slopeQuaternion(
      heightAt, x, z,
      Number(alignToSlope) === 1 ? 0.35 : Number(alignToSlope) || 0.35,
      new THREE.Quaternion(),
    );
  }
  return placement;
}

/**
 * Explicit placement: `positions` are `{x, z, yaw?}` (or `[x, z]`) — y comes
 * from `heightAt`. Registers collision, parents the instances, returns
 * `{ root, placements, blockers, update, dispose }`.
 */
export function placeProps({
  asset,
  positions = [],
  heightAt = null,
  collision = null,
  parent = null,
  seed = 1,
  variants = 4,
  yaw = 'random',
  scaleRange = null,
  alignToSlope = false,
} = {}) {
  if (!asset?.build) throw new Error('placeProps needs a PropAsset ({ build }).');
  const random = mulberry32(seed * 340573321 + 7);
  const placements = positions.map((position) => resolvePlacement(position, heightAt, random, {
    alignToSlope,
    scaleRange,
    yawMode: yaw,
  }));
  const instances = new PropInstances({ asset, placements, seed, variants });
  const blockers = instances.footprintCircles();
  collision?.addCircles?.(blockers);
  parent?.add?.(instances);
  return {
    blockers,
    dispose: () => instances.dispose(),
    placements,
    root: instances,
    update: (delta, camera) => instances.update(delta, camera),
  };
}

/**
 * Density scatter in a disc — `scatterForest` for props. Same masks, same
 * determinism; adds min spacing and per-placement yaw/scale jitter.
 */
export function scatterProps({
  asset,
  center = { x: 0, z: 0 },
  radius = 30,
  density = 0.02,
  count = null,
  minSpacing = 2,
  seed = 1,
  heightAt = null,
  mask = null,
  collision = null,
  parent = null,
  variants = 4,
  scaleRange = [0.9, 1.1],
  alignToSlope = false,
} = {}) {
  const origin = center?.position ?? center ?? { x: 0, z: 0 };
  const random = mulberry32(seed * 1181783497 + 5);
  const target = count ?? Math.round((Number(density) || 0) * Math.PI * radius * radius);
  const spacingSq = Math.max(minSpacing, 0) ** 2;
  const accepted = [];
  let attempts = target * 8;
  while (accepted.length < target && attempts > 0) {
    attempts -= 1;
    const distance = radius * Math.sqrt(random());
    const angle = random() * Math.PI * 2;
    const x = (Number(origin.x) || 0) + Math.cos(angle) * distance;
    const z = (Number(origin.z) || 0) + Math.sin(angle) * distance;
    if (typeof mask === 'function' && !mask(x, z)) continue;
    if (spacingSq > 0 && accepted.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < spacingSq)) continue;
    accepted.push({ x, z });
  }
  return placeProps({
    alignToSlope,
    asset,
    collision,
    heightAt,
    parent,
    positions: accepted,
    scaleRange,
    seed,
    variants,
  });
}

/**
 * Placement along a spline (01's `paths.splines[n]`, or any THREE curve):
 * fences and walls build continuously; point props (lanterns, signposts)
 * repeat at `spacing` with optional perpendicular offset per side.
 *
 *   placeAlongSpline({ asset: fence, spline: paths.splines[0], offset: 2.4,
 *     heightAt: paths.heightAt, collision: world.collision, parent });
 */
export function placeAlongSpline({
  asset,
  spline,
  spacing = 6,
  jitter = 0,
  offset = 2.2,
  sides = 1,
  start = 0.02,
  end = 0.98,
  face = 'path',
  seed = 1,
  heightAt = null,
  mask = null,
  collision = null,
  parent = null,
  variants = 4,
  scaleRange = null,
} = {}) {
  if (!asset) throw new Error('placeAlongSpline needs a PropAsset.');
  if (typeof spline?.getPointAt !== 'function') {
    throw new Error('placeAlongSpline needs a curve with getPointAt (e.g. paths.splines[0]).');
  }
  const random = mulberry32(seed * 2654435761 + 13);
  const length = spline.getLength();
  const span = Math.max((end - start) * length, 0.1);
  const steps = Math.max(Math.floor(span / Math.max(spacing, 0.5)), 1);
  const sideList = Array.isArray(sides) ? sides : (sides === 2 ? [-1, 1] : [1]);

  const samplesFor = (side) => {
    const points = [];
    for (let index = 0; index <= steps; index += 1) {
      const jitterAlong = index > 0 && index < steps ? (random() - 0.5) * jitter * spacing * 0.5 : 0;
      const t = Math.min(Math.max(start + ((index * spacing + jitterAlong) / length), 0), end);
      const point = spline.getPointAt(t);
      const tangent = spline.getTangentAt(t);
      const sideX = -tangent.z;
      const sideZ = tangent.x;
      const norm = Math.hypot(sideX, sideZ) || 1;
      const x = point.x + (sideX / norm) * offset * side;
      const z = point.z + (sideZ / norm) * offset * side;
      const y = typeof heightAt === 'function' ? (Number(heightAt(x, z)) || 0) : point.y;
      points.push({
        heading: Math.atan2(tangent.x, tangent.z),
        masked: typeof mask === 'function' && !mask(x, z),
        x,
        y,
        z,
      });
    }
    return points;
  };

  const root = new THREE.Group();
  root.name = `PropsAlongSpline ${asset.type ?? ''}`;
  const blockers = [];
  const updaters = [];

  for (const side of sideList) {
    const samples = samplesFor(side);
    if (asset.buildAlong) {
      // Linear runs break where the mask rejects (a fence stops at the
      // river bank instead of marching into it).
      const runs = [];
      let current = [];
      for (const sample of samples) {
        if (sample.masked) {
          if (current.length > 1) runs.push(current);
          current = [];
        } else current.push(sample);
      }
      if (current.length > 1) runs.push(current);
      for (const run of runs) {
        const { object3D, footprints } = asset.buildAlong(run, { seed: seed + side * 31 });
        root.add(object3D);
        blockers.push(...footprints);
      }
    } else {
      const positions = samples.filter((sample) => !sample.masked).map((sample) => ({
        x: sample.x,
        // face the walkway ('path'), march with it ('along'), or spin free
        yaw: face === 'along' ? sample.heading
          : face === 'random' ? random() * Math.PI * 2
            : sample.heading + (side > 0 ? -Math.PI / 2 : Math.PI / 2) + Math.PI,
        z: sample.z,
      }));
      const placed = placeProps({
        asset,
        collision: null, // collected below so callers get one blocker list
        heightAt,
        parent: root,
        positions,
        scaleRange,
        seed: seed + side * 97,
        variants,
        yaw: 'positions',
      });
      blockers.push(...placed.blockers);
      updaters.push(placed.update);
    }
  }
  collision?.addCircles?.(blockers);
  parent?.add?.(root);
  return {
    blockers,
    dispose() {
      root.parent?.remove(root);
      root.traverse((object) => {
        if (object.isMesh) object.geometry?.dispose();
      });
    },
    root,
    update: (delta, camera) => { for (const update of updaters) update(delta, camera); },
  };
}
