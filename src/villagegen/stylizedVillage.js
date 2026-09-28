// Seeded settlements: pure composition of 01 (streets ride the path
// system), 02 (props by role), and 03 (building recipes). Villages never
// flatten terrain — buildings rely on their foundation skirts, streets on
// the ribbon overlay — so sites are chosen flat enough that this holds
// (invariant, tested in verify-villagegen).

import * as THREE from 'three';

import { buildingAsset } from '../buildinggen/buildingAsset.js';
import { mergePainted } from '../propgen/propParts.js';
import {
  createPropAsset,
  placeAlongSpline,
  placeProps,
  propAssetFromObject,
} from '../propgen/index.js';
import { createDebrisAsset } from '../debrisgen/debrisGenerator.js';
import { resamplePolyline } from '../pathgen/pathRibbon.js';
import { POI_ARCHETYPES } from './villageArchetypes.js';
import { generatePlaceName } from './villageNames.js';

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

const STREET_HALF = 1.7; // matches the default ribbon width + shoulder

function slopeOf(heightAt, x, z, step = 1.2) {
  const dx = (heightAt(x + step, z) - heightAt(x - step, z)) / (2 * step);
  const dz = (heightAt(x, z + step) - heightAt(x, z - step)) / (2 * step);
  return Math.hypot(dx, dz);
}

function distanceToPolyline(samples, x, z) {
  let best = Infinity;
  for (let index = 0; index < samples.length - 1; index += 1) {
    const a = samples[index];
    const b = samples[index + 1];
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const lengthSq = abx * abx + abz * abz;
    const t = lengthSq > 1e-9
      ? Math.min(Math.max(((x - a.x) * abx + (z - a.z) * abz) / lengthSq, 0), 1)
      : 0;
    best = Math.min(best, Math.hypot(x - (a.x + abx * t), z - (a.z + abz * t)));
  }
  return best;
}

/**
 * Builds one settlement. See plans/04-villages.md — this is the composable
 * entry; `createStylizedWorld({ pois })` calls it per site and merges the
 * returned street routes into the world path network.
 *
 * @returns {{ root, name, archetype, center, radius, entries, streetRoutes,
 *   blockers, buildings, update, dispose, stats }}
 */
export function createStylizedVillage({
  seed = 1,
  center = { x: 0, z: 0 },
  radius = 34,
  heightAt,
  waterLevel = 0,
  archetype = 'village',
  collision = null,
  parent = null,
} = {}) {
  if (typeof heightAt !== 'function') throw new Error('createStylizedVillage needs heightAt(x, z).');
  const spec = POI_ARCHETYPES[archetype] ?? POI_ARCHETYPES.village;
  const random = mulberry32(seed * 747796405 + 21);
  const cx = Number(center.x) || 0;
  const cz = Number(center.z) || 0;
  const name = generatePlaceName(seed, archetype);

  const root = new THREE.Group();
  root.name = `POI ${archetype} ${name}`;
  const blockers = [];
  const updaters = [];

  // --- street ---------------------------------------------------------------
  // A gentle bent main street through the center, plus an optional branch.
  const heading = random() * Math.PI * 2;
  const dirX = Math.sin(heading);
  const dirZ = Math.cos(heading);
  const perpX = -dirZ;
  const perpZ = dirX;
  const streetLength = Math.max(radius * 1.6, spec.minRadius * 1.4);
  const bend = (random() - 0.5) * radius * 0.4;
  const streetPoints = [-0.5, -0.17, 0.17, 0.5].map((t) => [
    cx + dirX * streetLength * t + perpX * bend * Math.sin(t * Math.PI),
    cz + dirZ * streetLength * t + perpZ * bend * Math.sin(t * Math.PI),
  ]);
  // Shrink ends onto dry land so entries never start underwater.
  const dry = (point) => heightAt(point[0], point[1]) > waterLevel + 0.7;
  while (streetPoints.length > 2 && !dry(streetPoints[0])) streetPoints.shift();
  while (streetPoints.length > 2 && !dry(streetPoints[streetPoints.length - 1])) streetPoints.pop();

  const streetRoutes = [{ points: streetPoints, style: spec.layout.streetStyle, wander: false }];
  const branchRoll = random();
  const branchSide = random() < 0.5 ? -1 : 1;
  if (branchRoll < spec.layout.branchChance) {
    const mid = streetPoints[Math.floor(streetPoints.length / 2)];
    const branchEnd = [
      mid[0] + perpX * branchSide * radius * 0.9,
      mid[1] + perpZ * branchSide * radius * 0.9,
    ];
    if (dry(branchEnd)) {
      streetRoutes.push({
        points: [mid, [
          mid[0] + perpX * branchSide * radius * 0.45 + dirX * radius * 0.12,
          mid[1] + perpZ * branchSide * radius * 0.45 + dirZ * radius * 0.12,
        ], branchEnd],
        style: spec.layout.streetStyle,
        wander: false,
      });
    }
  }
  const streetSamples = streetRoutes.flatMap((route) => resamplePolyline(
    route.points.map(([x, z]) => ({ x, z })), 3,
  ));
  const streetCurve = new THREE.CatmullRomCurve3(
    resamplePolyline(streetPoints.map(([x, z]) => ({ x, z })), 4)
      .map((point) => new THREE.Vector3(point.x, heightAt(point.x, point.z), point.z)),
    false, 'catmullrom', 0.1,
  );

  // --- buildings ---------------------------------------------------------------
  const [minBuildings, maxBuildings] = spec.layout.buildingCount;
  const targetBuildings = minBuildings + Math.round(random() * (maxBuildings - minBuildings));
  const buildings = [];
  const acceptedCircles = [];
  const roleBuckets = { hi: new Map(), lo: new Map() };
  const roleMaterials = new Map();
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scratch = new THREE.Vector3();

  const pickType = () => {
    const roll = random();
    let sum = 0;
    for (const entry of spec.buildings) {
      sum += entry.weight;
      if (roll <= sum) return entry.type;
    }
    return spec.buildings[spec.buildings.length - 1]?.type ?? 'cottage';
  };

  const tryPlaceBuilding = (parcelCenter, facePoint) => {
    const type = pickType();
    const buildSeed = Math.floor(random() * 0xffffffff);
    const asset = buildingAsset({ seed: buildSeed, type });
    const built = asset.build(buildSeed);
    const y = heightAt(parcelCenter.x, parcelCenter.z);
    if (y < waterLevel + 0.6) return false; // never in water (invariant)
    if (slopeOf(heightAt, parcelCenter.x, parcelCenter.z) > 0.24) return false;
    // face the street: door normal rotates onto the direction to facePoint
    const toStreetX = facePoint.x - parcelCenter.x;
    const toStreetZ = facePoint.z - parcelCenter.z;
    const yaw = Math.atan2(toStreetX, toStreetZ) - Math.atan2(built.door.nx, built.door.nz);
    // world-frame footprint circles
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    const circles = built.footprint.circles.map((circle) => ({
      radius: circle.radius,
      x: parcelCenter.x + circle.x * cos + circle.z * sin,
      z: parcelCenter.z - circle.x * sin + circle.z * cos,
    }));
    // invariants at layout time: clear of the street ribbon, other
    // footprints, and the water — checked, not eyeballed
    for (const circle of circles) {
      if (distanceToPolyline(streetSamples, circle.x, circle.z) < circle.radius + STREET_HALF + 0.3) return false;
      if (heightAt(circle.x, circle.z) < waterLevel + 0.5) return false;
      for (const other of acceptedCircles) {
        const minDistance = circle.radius + other.radius + 0.4;
        if ((circle.x - other.x) ** 2 + (circle.z - other.z) ** 2 < minDistance ** 2) return false;
      }
    }
    acceptedCircles.push(...circles);
    blockers.push(...circles);
    buildings.push({ built, circles, type, x: parcelCenter.x, y, yaw, z: parcelCenter.z });

    // merge role geometries (hi and lo) with the placement transform baked
    for (const [level, object] of [['hi', built.object3D], ['lo', built.lod.far]]) {
      object.updateWorldMatrix(true, true);
      object.traverse((child) => {
        if (!child.isMesh) return;
        const role = child.name.replace('Building-', '') || 'wall';
        if (!roleMaterials.has(role)) roleMaterials.set(role, child.material);
        const geometry = child.geometry;
        quaternion.setFromAxisAngle(scratch.set(0, 1, 0), yaw);
        matrix.compose(
          new THREE.Vector3(parcelCenter.x, y, parcelCenter.z),
          quaternion,
          new THREE.Vector3(1, 1, 1),
        );
        geometry.applyMatrix4(child.matrixWorld);
        geometry.applyMatrix4(matrix);
        const bucket = roleBuckets[level].get(role);
        if (bucket) bucket.push(geometry);
        else roleBuckets[level].set(role, [geometry]);
      });
    }
    return true;
  };

  if (spec.buildings.length > 0) {
    if (archetype === 'shrine') {
      // one shrine BEYOND the head of the approach — far enough that its
      // footprint clears the street ribbon (the veranda and steps fill the
      // gap), facing back down the approach.
      const head = streetPoints[streetPoints.length - 1];
      const prev = streetPoints[streetPoints.length - 2];
      const forwardX = head[0] - prev[0];
      const forwardZ = head[1] - prev[1];
      const norm = Math.hypot(forwardX, forwardZ) || 1;
      for (const reach of [6.5, 8, 10]) {
        const shrineCenter = {
          x: head[0] + (forwardX / norm) * reach,
          z: head[1] + (forwardZ / norm) * reach,
        };
        if (tryPlaceBuilding(shrineCenter, { x: head[0], z: head[1] })) break;
      }
    } else {
      // parcels pace the street, alternating sides with jittered setbacks
      const strideBase = 8.5;
      let placedCount = 0;
      let guard = 0;
      const totalLength = streetCurve.getLength();
      while (placedCount < targetBuildings && guard < targetBuildings * 6) {
        guard += 1;
        const t = 0.08 + random() * 0.84;
        const at = streetCurve.getPointAt(t);
        const tangent = streetCurve.getTangentAt(t);
        const side = guard % 2 === 0 ? 1 : -1;
        const setback = spec.layout.parcelSetback[0]
          + random() * (spec.layout.parcelSetback[1] - spec.layout.parcelSetback[0]);
        const offset = STREET_HALF + setback + 3.4;
        const px = -tangent.z;
        const pz = tangent.x;
        const parcelCenter = {
          x: at.x + px * offset * side + tangent.x * (random() - 0.5) * strideBase * 0.4,
          z: at.z + pz * offset * side + tangent.z * (random() - 0.5) * strideBase * 0.4,
        };
        if (Math.hypot(parcelCenter.x - cx, parcelCenter.z - cz) > radius * 1.15) continue;
        if (tryPlaceBuilding(parcelCenter, { x: at.x, z: at.z })) placedCount += 1;
      }
    }
  }

  // one mesh per role per LOD level → a whole village stays ≤ 6 draw calls
  // for buildings; swap hi/lo by camera distance to the village center
  const lodGroups = { hi: new THREE.Group(), lo: new THREE.Group() };
  for (const level of ['hi', 'lo']) {
    lodGroups[level].name = `VillageBuildings-${level}`;
    for (const [role, geometries] of roleBuckets[level]) {
      const merged = mergePainted(geometries);
      const mesh = new THREE.Mesh(merged, roleMaterials.get(role));
      mesh.name = `Village-${role}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      lodGroups[level].add(mesh);
    }
    root.add(lodGroups[level]);
  }
  lodGroups.lo.visible = false;
  const lodDistanceSq = (radius * 6) ** 2;

  // --- props by role --------------------------------------------------------------
  const propSeedBase = seed * 31 + 7;
  const addPropUpdate = (placed) => {
    if (placed?.update) updaters.push(placed.update);
    if (placed?.blockers) blockers.push(...placed.blockers);
  };

  if (spec.props.lanternSpacing > 0) {
    const lantern = createPropAsset({
      asset: { seed: propSeedBase, type: 'lantern', variant: archetype === 'shrine' ? 'stoneToro' : 'woodPost' },
    });
    addPropUpdate(placeAlongSpline({
      asset: lantern,
      heightAt,
      mask: (x, z) => heightAt(x, z) > waterLevel + 0.4,
      offset: STREET_HALF + 0.5,
      parent: root,
      seed: propSeedBase + 1,
      sides: archetype === 'shrine' ? 2 : 1,
      spacing: spec.props.lanternSpacing,
      spline: streetCurve,
    }));
  }

  if (spec.props.torii) {
    const torii = createPropAsset({ asset: { seed: propSeedBase + 2, type: 'torii' } });
    const at = streetCurve.getPointAt(0.12);
    const tangent = streetCurve.getTangentAt(0.12);
    addPropUpdate(placeProps({
      asset: torii,
      heightAt,
      parent: root,
      positions: [{ x: at.x, yaw: Math.atan2(tangent.x, tangent.z) + Math.PI / 2, z: at.z }],
      seed: propSeedBase + 2,
      yaw: 'positions',
    }));
  }

  if (spec.props.well && buildings.length > 2) {
    const at = streetCurve.getPointAt(0.5);
    const tangent = streetCurve.getTangentAt(0.5);
    const well = createPropAsset({ asset: { seed: propSeedBase + 3, type: 'well' } });
    addPropUpdate(placeProps({
      asset: well,
      heightAt,
      parent: root,
      positions: [{
        x: at.x + -tangent.z * (STREET_HALF + 2.6) * branchSide * -1,
        z: at.z + tangent.x * (STREET_HALF + 2.6) * branchSide * -1,
      }],
      seed: propSeedBase + 3,
    }));
  }

  if (spec.props.pier) {
    // walk downhill from the center to the waterline, plant the pier there
    let px = cx;
    let pz = cz;
    for (let step = 0; step < 60 && heightAt(px, pz) > waterLevel + 0.35; step += 1) {
      const gx = (heightAt(px + 1, pz) - heightAt(px - 1, pz)) / 2;
      const gz = (heightAt(px, pz + 1) - heightAt(px, pz - 1)) / 2;
      const norm = Math.hypot(gx, gz) || 1;
      px -= (gx / norm) * 2.2;
      pz -= (gz / norm) * 2.2;
    }
    if (heightAt(px, pz) <= waterLevel + 0.6) {
      const gx = (heightAt(px + 1, pz) - heightAt(px - 1, pz)) / 2;
      const gz = (heightAt(px, pz + 1) - heightAt(px, pz - 1)) / 2;
      const yaw = Math.atan2(-gx, -gz);
      const pier = createPropAsset({ asset: { seed: propSeedBase + 4, type: 'pier' } });
      addPropUpdate(placeProps({
        asset: pier,
        heightAt: () => waterLevel + 0.1, // deck rides the waterline, not the bed
        parent: root,
        positions: [{ x: px, yaw, z: pz }],
        seed: propSeedBase + 4,
        yaw: 'positions',
      }));
    }
  }

  // rear-yard clutter: crates, firewood, benches behind houses
  const clutter = [
    ['crateStack', spec.props.crates],
    ['firewood', spec.props.firewood],
    ['bench', spec.props.benches],
  ];
  for (const [type, count] of clutter) {
    if (!count || buildings.length === 0) continue;
    const positions = [];
    for (let index = 0; index < count; index += 1) {
      const building = buildings[Math.floor(random() * buildings.length)];
      const angle = random() * Math.PI * 2;
      const reach = 3.6 + random() * 2.4;
      const x = building.x + Math.sin(angle) * reach;
      const z = building.z + Math.cos(angle) * reach;
      if (heightAt(x, z) < waterLevel + 0.5) continue;
      if (distanceToPolyline(streetSamples, x, z) < STREET_HALF + 0.8) continue;
      if (acceptedCircles.some((circle) => (circle.x - x) ** 2 + (circle.z - z) ** 2 < (circle.radius + 0.8) ** 2)) continue;
      positions.push({ x, z });
    }
    if (positions.length > 0) {
      addPropUpdate(placeProps({
        asset: createPropAsset({ asset: { seed: propSeedBase + 5, type } }),
        heightAt,
        parent: root,
        positions,
        seed: propSeedBase + 6,
      }));
    }
  }

  // parcel fences: three-sided yard ring, open to the street
  if (spec.props.fenceParcelChance > 0) {
    const fence = createPropAsset({ asset: { seed: propSeedBase + 8, type: 'fence', variant: 'picket' } });
    for (const building of buildings) {
      if (random() >= spec.props.fenceParcelChance) continue;
      const half = Math.max(...building.circles.map((circle) => circle.radius)) + 1.6;
      const sin = Math.sin(building.yaw);
      const cos = Math.cos(building.yaw);
      const corner = (lx, lz) => ({
        x: building.x + lx * cos + lz * sin,
        y: heightAt(building.x + lx * cos + lz * sin, building.z - lx * sin + lz * cos),
        z: building.z - lx * sin + lz * cos,
      });
      // door faces +local door normal; leave that side open
      const points = [
        corner(-half, half), corner(-half, -half),
        corner(half, -half), corner(half, half),
      ];
      const run = fence.buildAlong(points, { seed: propSeedBase + 9 });
      root.add(run.object3D);
      blockers.push(...run.footprints);
    }
  }

  // campsite / ruin dressing via debrisgen — the cross-cluster seam at work
  if (spec.props.campfire) {
    const fire = createDebrisAsset({ asset: { seed: propSeedBase + 10, type: 'ash', variant: 'campfire' } });
    const asset = propAssetFromObject(fire, { footprint: { radius: 1 } });
    addPropUpdate(placeProps({
      asset, heightAt, parent: root, positions: [{ x: cx, z: cz }], seed: propSeedBase + 10,
    }));
  }
  if (spec.props.brokenWalls) {
    const wall = createPropAsset({ asset: { seed: propSeedBase + 11, type: 'stoneWall' } });
    for (let arc = 0; arc < 3; arc += 1) {
      const angle = random() * Math.PI * 2;
      const reach = 4 + random() * radius * 0.4;
      const arcLength = 4 + random() * 6;
      const points = [0, 1, 2].map((step) => {
        const a = angle + (step - 1) * (arcLength / reach) * 0.5;
        const x = cx + Math.sin(a) * reach;
        const z = cz + Math.cos(a) * reach;
        return { x, y: heightAt(x, z), z };
      });
      if (points.some((point) => point.y < waterLevel + 0.5)) continue;
      const run = wall.buildAlong(points, { seed: propSeedBase + 12 + arc });
      root.add(run.object3D);
      blockers.push(...run.footprints);
    }
  }
  if (spec.props.milestone) {
    addPropUpdate(placeProps({
      asset: createPropAsset({ asset: { seed: propSeedBase + 13, type: 'milestone' } }),
      heightAt,
      parent: root,
      positions: [{ x: cx + 2, z: cz - 2 }],
      seed: propSeedBase + 13,
    }));
  }

  collision?.addCircles?.(blockers);
  parent?.add?.(root);

  const entries = [
    { x: streetPoints[0][0], z: streetPoints[0][1] },
    { x: streetPoints[streetPoints.length - 1][0], z: streetPoints[streetPoints.length - 1][1] },
  ];

  let disposed = false;
  return {
    archetype,
    blockers,
    buildings,
    center: { x: cx, z: cz },
    dispose() {
      if (disposed) return;
      disposed = true;
      root.parent?.remove(root);
      root.traverse((object) => { if (object.isMesh) object.geometry?.dispose(); });
    },
    entries,
    name,
    radius,
    root,
    stats: {
      blockers: blockers.length,
      buildings: buildings.length,
      routes: streetRoutes.length,
    },
    streetRoutes,
    /** Per frame: prop LOD + whole-village building LOD swap. */
    update(delta, camera) {
      for (const update of updaters) update(delta, camera);
      if (!camera) return;
      const dx = cx - camera.position.x;
      const dz = cz - camera.position.z;
      const far = dx * dx + dz * dz > lodDistanceSq;
      if (lodGroups.lo.visible !== far) {
        lodGroups.lo.visible = far;
        lodGroups.hi.visible = !far;
      }
    },
  };
}
