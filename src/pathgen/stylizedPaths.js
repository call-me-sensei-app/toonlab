// Seeded path networks. Import from '@call-me-sensei/toonlab' (root) or
// '@call-me-sensei/toonlab/pathgen'.
//
// The whole contract is the existing pure `heightAt(x, z)` + `waterLevel`:
// routes are cost-field routed around slopes, ribbons overlay the terrain
// (never modifying its mesh), bridges appear where water must be crossed,
// and the network exposes its own `heightAt` (flattened on-path, raw
// off-path) plus `maskAt` (0..1 on-path) so collision, the minimap, and the
// scatter systems all follow the same ground truth.
//
//   const paths = createStylizedPaths({
//     seed: 42,
//     heightAt: terrain.heightAt,
//     waterLevel: terrain.waterLevel,
//     size: terrain.meshExtent,
//     auto: { count: 4, styles: ['dirt', 'stone'] },
//   });
//   terrainRoot.add(paths.root);        // before createStylizedWorld, or…
//   await createStylizedWorld({ ..., paths });   // …one option wires it all
//
// Same seed → identical network, bridges, and mask, forever.

import * as THREE from 'three';

import {
  addCenterlineWander,
  connectPointsOfInterest,
  createRoutingGrid,
  markRouteUsed,
  pickPointsOfInterest,
  routeBetween,
  smoothWaypoints,
} from './pathRouter.js';
import {
  buildRibbonGeometry,
  buildRouteProfile,
  buildStairsGeometry,
  mergePathGeometries,
} from './pathRibbon.js';
import { buildBridge } from './pathBridge.js';
import { getPathDetailTexture } from './pathTextures.js';
import {
  PATH_RECIPE_SCHEMA,
  PATH_RECIPE_VERSION,
  createPathRecipeDocument,
  createPathSettings,
  normalizeRouteSpec,
  validatePathRecipeDocument,
} from './pathSettings.js';

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

const smoothstep = (edge0, edge1, value) => {
  const t = Math.min(Math.max((value - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
};

/**
 * Spatial index over route samples: heightAt/maskAt resolve in O(bucket).
 * Segments are inserted into every cell their inflated AABB touches, so a
 * query only ever reads the one cell containing the point.
 */
function createRouteIndex(routes, { lift, blendMargin, maskMargin }) {
  const reach = Math.max(blendMargin, maskMargin);
  let cell = 8;
  for (const route of routes) {
    for (const point of route.samples) {
      cell = Math.max(cell, (point.half + reach) * 1.05);
    }
  }
  const buckets = new Map();
  const keyOf = (ix, iz) => `${ix},${iz}`;
  for (const route of routes) {
    const { samples } = route;
    for (let index = 0; index < samples.length - 1; index += 1) {
      const a = samples[index];
      const b = samples[index + 1];
      const pad = Math.max(a.half, b.half) + reach;
      const minX = Math.min(a.x, b.x) - pad;
      const maxX = Math.max(a.x, b.x) + pad;
      const minZ = Math.min(a.z, b.z) - pad;
      const maxZ = Math.max(a.z, b.z) + pad;
      const segment = { a, b };
      for (let ix = Math.floor(minX / cell); ix <= Math.floor(maxX / cell); ix += 1) {
        for (let iz = Math.floor(minZ / cell); iz <= Math.floor(maxZ / cell); iz += 1) {
          const key = keyOf(ix, iz);
          const bucket = buckets.get(key);
          if (bucket) bucket.push(segment);
          else buckets.set(key, [segment]);
        }
      }
    }
  }

  return (x, z) => {
    const bucket = buckets.get(keyOf(Math.floor(x / cell), Math.floor(z / cell)));
    if (!bucket) return null;
    let best = null;
    for (const { a, b } of bucket) {
      const abx = b.x - a.x;
      const abz = b.z - a.z;
      const lengthSq = abx * abx + abz * abz;
      const t = lengthSq > 1e-9
        ? Math.min(Math.max(((x - a.x) * abx + (z - a.z) * abz) / lengthSq, 0), 1)
        : 0;
      const cx = a.x + abx * t;
      const cz = a.z + abz * t;
      const across = Math.hypot(x - cx, z - cz);
      const half = a.half + (b.half - a.half) * t;
      const surface = a.profile + (b.profile - a.profile) * t + lift;
      const rank = across - half; // signed distance to the ribbon edge
      if (!best || rank < best.rank) best = { across, half, rank, surface };
    }
    return best;
  };
}

/**
 * Builds a seeded path network. See module header for the golden path.
 *
 * @param {Object} options
 * @param {number} [options.seed]
 * @param {Function} options.heightAt Pure `(x, z) => meters` terrain sampler.
 * @param {number} [options.waterLevel]
 * @param {number|{x,z}|{width,depth}} [options.size] Terrain extent in meters.
 * @param {Array} [options.routes] Explicit `{ from: [x,z], to: [x,z], style }` specs.
 * @param {Object} [options.auto] `{ count, styles }` — probe POIs and connect them.
 * @param {Object} [options.settings] Partial PATH settings overrides.
 * @returns {Object} `{ root, heightAt, maskAt, splines, routes, bridges,
 *   blockers, pointsOfInterest, recipe, stats, dispose }`
 */
export function createStylizedPaths({
  seed = 1,
  heightAt,
  waterLevel = 0,
  size = 1000,
  routes = null,
  auto = null,
  settings: settingsOverrides = {},
} = {}) {
  if (typeof heightAt !== 'function') {
    throw new Error('createStylizedPaths needs a heightAt(x, z) sampler.');
  }
  const settings = createPathSettings(settingsOverrides);
  const routeSeed = Math.round(Number(seed) || 1);
  const random = mulberry32(routeSeed * 48271 + 11);

  const grid = createRoutingGrid({
    gridStep: settings.routing.gridStep,
    heightAt,
    shoreMargin: settings.routing.shoreMargin,
    size,
    waterLevel,
  });

  // Resolve the route list: explicit specs, then auto network.
  const specs = [];
  if (Array.isArray(routes)) {
    for (const route of routes) {
      const spec = normalizeRouteSpec(route);
      if (spec) specs.push(spec);
    }
  }
  let pointsOfInterest = [];
  if (auto && typeof auto === 'object') {
    const count = Math.min(12, Math.max(2, Math.round(Number(auto.count) || settings.routing.pointCount)));
    const styles = Array.isArray(auto.styles) && auto.styles.length > 0 ? auto.styles : ['dirt'];
    pointsOfInterest = pickPointsOfInterest({
      count,
      heightAt,
      seed: routeSeed,
      shoreMargin: settings.routing.shoreMargin,
      size,
      waterLevel,
    });
    const edges = connectPointsOfInterest(pointsOfInterest, {
      loopChance: settings.routing.loopChance,
      seed: routeSeed,
    });
    for (const [fromIndex, toIndex] of edges) {
      const from = pointsOfInterest[fromIndex];
      const to = pointsOfInterest[toIndex];
      specs.push({
        from: [from.x, from.z],
        style: styles[Math.floor(random() * styles.length) % styles.length],
        to: [to.x, to.z],
      });
    }
  }

  // Route, smooth, profile. Explicit-points specs skip the router (and
  // optionally the wander) — village streets are laid, not found.
  const built = [];
  for (const spec of specs) {
    let waypoints;
    if (spec.points) {
      waypoints = spec.points.map(([x, z]) => ({ x, z }));
    } else {
      waypoints = routeBetween(grid, { x: spec.from[0], z: spec.from[1] }, { x: spec.to[0], z: spec.to[1] }, {
        reuseBonus: settings.routing.reuseBonus,
        slopeCost: settings.routing.slopeCost,
        waterCost: settings.routing.waterCost,
      });
    }
    if (!waypoints || waypoints.length < 2) continue;
    markRouteUsed(grid, waypoints, 1);
    const smoothed = spec.points && spec.wander === false
      ? smoothWaypoints(waypoints, { iterations: 2 })
      : addCenterlineWander(
        smoothWaypoints(waypoints, { iterations: 2 }),
        { amplitude: settings.ribbon.width * 0.5, seed: routeSeed + built.length * 17 },
      );
    const profile = buildRouteProfile({
      heightAt,
      points: smoothed,
      seed: routeSeed + built.length * 131,
      settings,
      waterLevel,
    });
    if (!profile) continue;
    built.push({ profile, spec });
  }

  // Meshes: one draw call per style, one per bridge, one for all stairs.
  const root = new THREE.Group();
  root.name = 'StylizedPaths';
  const materials = [];
  const byStyle = new Map();
  const stairGeometries = [];
  const bridgeMeshes = [];
  const blockers = [];
  const routeInfos = [];

  for (let index = 0; index < built.length; index += 1) {
    const { profile, spec } = built[index];
    const ribbonGeometry = buildRibbonGeometry(profile, {
      heightAt,
      seed: routeSeed + index * 131,
      settings,
      style: spec.style,
    });
    if (ribbonGeometry) {
      const bucket = byStyle.get(spec.style);
      if (bucket) bucket.push(ribbonGeometry);
      else byStyle.set(spec.style, [ribbonGeometry]);
    }
    const stairsGeometry = buildStairsGeometry(profile, {
      seed: routeSeed + index * 131 + 7,
      settings,
    });
    if (stairsGeometry) stairGeometries.push(stairsGeometry);

    const routeBridges = [];
    for (const crossing of profile.bridges) {
      const result = buildBridge({
        crossing,
        heightAt,
        samples: profile.samples,
        seed: routeSeed + index * 131 + crossing.startIndex,
        settings,
        waterLevel,
      });
      routeBridges.push(result);
      blockers.push(...result.blockers);
    }

    const spline = new THREE.CatmullRomCurve3(
      profile.samples.map((point) => new THREE.Vector3(
        point.x,
        point.profile + settings.ribbon.lift,
        point.z,
      )),
      false,
      'catmullrom',
      0.1,
    );
    routeInfos.push({
      bridges: routeBridges,
      samples: profile.samples,
      spline,
      stairRuns: profile.stairRuns,
      style: spec.style,
    });
  }

  for (const [style, geometries] of byStyle) {
    const merged = geometries.length === 1 ? geometries[0] : mergePathGeometries(geometries);
    if (geometries.length > 1) for (const geometry of geometries) geometry.dispose();
    const material = new THREE.MeshStandardMaterial({
      map: getPathDetailTexture(style, routeSeed),
      metalness: 0,
      roughness: 0.96,
      vertexColors: true,
    });
    material.name = `Path ${style}`;
    material.userData.envRole = 'standard';
    materials.push(material);
    const mesh = new THREE.Mesh(merged, material);
    mesh.name = `PathRibbon-${style}`;
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.userData.groundFieldWrite = true;
    mesh.userData.isPathRibbon = true;
    // Ground-hugging overlay: its contribution to the water grab/depth
    // passes is invisible at gameplay angles, and those passes redraw
    // everything (waterExclude is the AGENTS.md idiom for this).
    mesh.userData.waterExclude = true;
    root.add(mesh);
  }

  if (stairGeometries.length) {
    const merged = stairGeometries.length === 1
      ? stairGeometries[0]
      : mergePathGeometries(stairGeometries);
    if (stairGeometries.length > 1) for (const geometry of stairGeometries) geometry.dispose();
    const material = new THREE.MeshStandardMaterial({
      map: getPathDetailTexture('stone', routeSeed),
      metalness: 0,
      roughness: 0.95,
      vertexColors: true,
    });
    material.name = 'Path stairs';
    material.userData.envRole = 'standard';
    materials.push(material);
    const mesh = new THREE.Mesh(merged, material);
    mesh.name = 'PathStairs';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.waterExclude = true;
    root.add(mesh);
  }

  const bridgeGroups = [];
  if (routeInfos.some((route) => route.bridges.length > 0)) {
    const bridgeMaterial = new THREE.MeshStandardMaterial({
      map: getPathDetailTexture('planks', routeSeed),
      metalness: 0,
      roughness: 0.9,
      vertexColors: true,
    });
    bridgeMaterial.name = 'Path bridge wood';
    bridgeMaterial.userData.envRole = 'standard';
    materials.push(bridgeMaterial);
    for (const route of routeInfos) {
      for (const result of route.bridges) {
        const mesh = new THREE.Mesh(result.geometry, bridgeMaterial);
        mesh.name = 'PathBridge';
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        // Bridges keep their reflection (they stand IN the water) but skip
        // the refraction grab — the visible half of the cost.
        mesh.userData.waterGrabExclude = true;
        const group = new THREE.Group();
        group.name = 'PathBridgeGroup';
        group.add(mesh);
        root.add(group);
        bridgeGroups.push(group);
        bridgeMeshes.push(mesh);
      }
    }
  }

  // Shared ground truth: flattened height + on-path mask.
  const queryIndex = createRouteIndex(routeInfos, {
    blendMargin: settings.ribbon.edgeSkirt + 0.6,
    lift: settings.ribbon.lift,
    maskMargin: settings.ribbon.edgeFade,
  });
  const blend = settings.ribbon.edgeSkirt + 0.6;
  const fade = settings.ribbon.edgeFade;

  const pathHeightAt = (x, z) => {
    const raw = Number(heightAt(x, z)) || 0;
    const hit = queryIndex(x, z);
    if (!hit) return raw;
    const weight = 1 - smoothstep(hit.half * 0.55, hit.half + blend, hit.across);
    if (weight <= 0) return raw;
    return raw * (1 - weight) + hit.surface * weight;
  };

  const maskAt = (x, z) => {
    const hit = queryIndex(x, z);
    if (!hit) return 0;
    return 1 - smoothstep(hit.half, hit.half + fade, hit.across);
  };

  const stats = {
    bridgeCount: bridgeGroups.length,
    routeCount: routeInfos.length,
    triangles: [...byStyle.values()].flat().length === 0 ? 0 : undefined,
  };
  let triangles = 0;
  root.traverse((object) => {
    if (object.isMesh && object.geometry?.index) triangles += object.geometry.index.count / 3;
  });
  stats.triangles = Math.round(triangles);

  let disposed = false;
  return {
    blockers,
    bridges: bridgeGroups,
    dispose() {
      if (disposed) return;
      disposed = true;
      root.parent?.remove(root);
      root.traverse((object) => {
        if (object.isMesh) object.geometry?.dispose();
      });
      // Detail textures are cache-owned — dispose materials only.
      for (const material of materials) material.dispose();
    },
    heightAt: pathHeightAt,
    maskAt,
    pointsOfInterest,
    recipe: createPathRecipeDocument({
      auto,
      routes: Array.isArray(routes) ? routes : null,
      seed: routeSeed,
      settings,
    }),
    root,
    routes: routeInfos,
    get splines() { return routeInfos.map((route) => route.spline); },
    stats,
  };
}

/**
 * Deterministic rebuild from a recipe document plus the host's terrain
 * context (heightAt is the host's and is never serialized).
 */
export function createStylizedPathsFromRecipe(recipe, { heightAt, waterLevel = 0, size = 1000 } = {}) {
  const { ok, errors } = validatePathRecipeDocument(recipe);
  if (!ok) throw new Error(`Invalid path recipe: ${errors.join(' ')}`);
  return createStylizedPaths({
    auto: recipe.auto ?? null,
    heightAt,
    routes: recipe.routes ?? null,
    seed: recipe.seed,
    settings: recipe.settings,
    size,
    waterLevel,
  });
}

export { PATH_RECIPE_SCHEMA, PATH_RECIPE_VERSION };
