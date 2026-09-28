// Deterministic, texture-free procedural debris meshes. The output uses
// MeshStandardMaterial + baked vertex colors so host apps can either export
// it directly or pass it through ToonLab's environment material adapter.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { createDebrisSettings } from './debrisSettings.js';
import {
  createJawField,
  createLongBoneField,
  createMasonryChunkField,
  createSkullField,
  createStoneField,
  meshDebrisField,
} from './debrisFields.js';
import {
  debrisTextureAuto,
  ensureDebrisUvs,
  getCustomDebrisTexture,
  getDebrisDetailTexture,
} from './debrisTextures.js';
import { hashCombine } from '../rockgen/noise/prng.js';
import { simplexNoise3 } from '../rockgen/noise/simplexNoise3.js';
import { fbm3 } from '../rockgen/noise/valueNoise3.js';
import {
  createBranchingTreeSkeleton,
  createBranchTubeGeometry,
} from '../vegetation/stylizedTree.js';

function lowbias32(value) {
  let hash = value >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 15), 0x846ca68b) >>> 0;
  return (hash ^ (hash >>> 16)) >>> 0;
}

export function createDebrisRandom(seed) {
  let a = lowbias32(seed);
  let b = lowbias32(seed + 1);
  let c = lowbias32(seed + 2);
  let d = lowbias32(seed + 3);
  for (let warm = 0; warm < 8; warm += 1) {
    const t = (a + b + d) >>> 0;
    d = (d + 1) >>> 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) >>> 0;
    c = ((c << 21) | (c >>> 11)) >>> 0;
    c = (c + t) >>> 0;
  }
  return () => {
    const t = (a + b + d) >>> 0;
    d = (d + 1) >>> 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) >>> 0;
    c = ((c << 21) | (c >>> 11)) >>> 0;
    c = (c + t) >>> 0;
    return t / 4294967296;
  };
}

const signed = (random) => random() * 2 - 1;
const mix = (a, b, amount) => a + (b - a) * amount;

function paletteColor(settings, slot) {
  const values = slot === 2
    ? settings.surface.accentColor
    : slot === 1
      ? settings.surface.secondaryColor
      : settings.surface.primaryColor;
  return new THREE.Color(values[0], values[1], values[2]);
}

function paintGeometry(geometry, settings, random, slot = 0) {
  if (!geometry.attributes.normal) geometry.computeVertexNormals();
  const normal = geometry.attributes.normal;
  const colors = new Float32Array(geometry.attributes.position.count * 3);
  const base = paletteColor(settings, slot);
  for (let index = 0; index < geometry.attributes.position.count; index += 1) {
    const drift = 1 + signed(random) * settings.surface.variation;
    const upward = Math.max(0, normal.getY(index));
    const edge = 1 + upward * settings.surface.edgeLight * 0.28;
    const color = base.clone().multiplyScalar(drift * edge);
    colors[index * 3] = Math.min(color.r, 1);
    colors[index * 3 + 1] = Math.min(color.g, 1);
    colors[index * 3 + 2] = Math.min(color.b, 1);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function createMaterial(settings, { doubleSided = false, metalness = 0 } = {}) {
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness,
    roughness: settings.surface.roughness,
    side: doubleSided ? THREE.DoubleSide : THREE.FrontSide,
    vertexColors: true,
  });
  material.name = 'Debris Toon Source';
  material.userData.envRole = 'standard';
  return material;
}

function addMesh(parent, geometry, settings, random, {
  doubleSided = false, metalness = 0, name = 'Debris piece', slot = 0,
} = {}) {
  paintGeometry(geometry, settings, random, slot);
  const mesh = new THREE.Mesh(geometry, createMaterial(settings, { doubleSided, metalness }));
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

// Piece placement by arrangement mode. Pieces build along the X axis, so
// 'bundle' aligns them side by side like gathered firewood (the photoscan catalogs
// "bunch of sticks" read), 'heap' stacks a dense center-biased mound,
// 'patch' spreads a flat ground layer, and 'scatter' keeps the loose
// natural throw.
function scatterObject(object, settings, random, index, { stacked = 0, tilt = 0.28 } = {}) {
  const { arrangement, messiness, spread } = settings.asset;
  // Messiness scales every chaos source; 0.5 reproduces the base look.
  const chaos = mix(0.35, 1.65, messiness);
  const rotation = settings.asset.rotationJitter * chaos;
  object.scale.multiplyScalar(mix(1 - 0.3 * messiness, 1 + 0.35 * messiness, random()));
  if (arrangement === 'bundle') {
    const gauge = Math.max(stacked, 0.05);
    const row = index % 3;
    const layer = Math.floor(index / 3);
    object.position.set(
      signed(random) * Math.max(spread, 0.2) * 0.18,
      layer * gauge * 0.85,
      (row - 1) * gauge * 1.05 + (layer % 2) * gauge * 0.5 + signed(random) * gauge * 0.2,
    );
    // Mostly parallel; the odd piece thrown across sells "gathered".
    const crossing = random() < 0.14 ? (random() < 0.5 ? 1 : -1) * mix(0.35, 0.8, random()) : 0;
    object.rotation.set(
      signed(random) * 0.04 * rotation,
      signed(random) * 0.09 * rotation + crossing,
      signed(random) * 0.05 * rotation,
    );
    return;
  }
  if (arrangement === 'heap') {
    // Mild center bias over a real footprint: too tight and the support
    // settle stacks everything into a tower instead of a mound.
    const radius = random() ** 0.9 * spread * 0.6;
    const angle = random() * Math.PI * 2;
    // Layered fill (3 pieces per layer) keeps late pieces from spawning
    // high over empty air; per-piece lift-only settle handles sinkers.
    const layer = Math.floor(index / 3);
    object.position.set(
      Math.cos(angle) * radius,
      layer * Math.max(stacked, 0.03) * 0.5 + random() * Math.max(stacked, 0.03) * 0.2,
      Math.sin(angle) * radius,
    );
    // Tumble respects the piece's tilt hint: chunks roll freely, but
    // elongated pieces (logs, planks, bones) stay near-horizontal — real
    // piles don't balance logs on end.
    const tumble = Math.min(tilt * 2.2, 1.2) * rotation;
    object.rotation.set(
      signed(random) * tumble,
      random() * Math.PI * 2,
      signed(random) * tumble,
    );
    return;
  }
  if (arrangement === 'patch') {
    const radius = Math.sqrt(random()) * spread;
    const angle = random() * Math.PI * 2;
    object.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    object.rotation.set(
      signed(random) * tilt * 0.4 * rotation,
      random() * Math.PI * 2,
      signed(random) * tilt * 0.4 * rotation,
    );
    object.scale.multiplyScalar(mix(0.6, 1.3, random()));
    return;
  }
  const radius = Math.sqrt(random()) * spread;
  const angle = random() * Math.PI * 2;
  object.position.set(
    Math.cos(angle) * radius,
    index === 0 ? 0 : random() * stacked,
    Math.sin(angle) * radius,
  );
  object.rotation.set(
    signed(random) * tilt * rotation,
    random() * Math.PI * 2 * rotation,
    signed(random) * tilt * rotation,
  );
}

// Rests a piece on the ground plane. `drop` also pulls floating pieces
// DOWN to contact (not just lifting sinkers) — pieces float otherwise,
// because spines/joints rarely put the geometry's lowest point at y=0.
function settleOnGround(object, clearance = 0.012, { drop = false } = {}) {
  object.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(object, true);
  if (!Number.isFinite(bounds.min.y)) return;
  if (drop || bounds.min.y < clearance) {
    object.position.y += clearance - bounds.min.y;
    object.updateMatrixWorld(true);
  }
}

// Physical plausibility pass: flat and elongated pieces (planks, chips,
// sheets, sticks, leaves, bones) cannot balance on a corner — dropped on
// flat ground they rotate until they LIE FLAT. Pieces are measured level
// (yaw only): if the piece is much wider than tall, its pitch/roll gets
// clamped to a few degrees; chunky pieces (rocks, skulls) keep their
// tumble. Without this, corner-grazing AABB contact reads as floating.
function stabilizeFlatPieces(pieces) {
  const box = new THREE.Box3();
  for (const piece of pieces) {
    const pitch = piece.rotation.x;
    const roll = piece.rotation.z;
    piece.rotation.x = 0;
    piece.rotation.z = 0;
    piece.updateMatrixWorld(true);
    box.setFromObject(piece, true);
    if (!Number.isFinite(box.min.y)) continue;
    const height = box.max.y - box.min.y;
    // Judge against the LONGEST plan axis: a 3-unit branch with bushy
    // prongs is still a stick and must lie flat — only pieces that are
    // genuinely as tall as they are long (rocks, skulls, cones) may rest
    // tilted.
    const footprint = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
    if (height < footprint * 0.45) {
      piece.rotation.x = Math.min(Math.max(pitch, -0.08), 0.08);
      piece.rotation.z = Math.min(Math.max(roll, -0.08), 0.08);
    } else {
      piece.rotation.x = pitch;
      piece.rotation.z = roll;
    }
    piece.updateMatrixWorld(true);
  }
}

// Ground-contact settling for a whole composition. Scatter/patch pieces
// ALWAYS drop to the ground plane — mutual interpenetration reads as
// natural ground clutter, whereas resting pieces on each other's mostly-
// empty bounding boxes reads as floating. Heaps and bundles stack, but
// only when the CENTERS of two pieces overlap (boxes shrunk 30% toward
// their middles), so nothing hovers on a phantom AABB corner.
const SETTLE_UP = new THREE.Vector3(0, 1, 0);
const SETTLE_DOWN = new THREE.Vector3(0, -1, 0);

function settleComposition(pieces, { clearance = 0.012, stacking = false } = {}) {
  const raycaster = new THREE.Raycaster();
  const origin = new THREE.Vector3();
  const placedMeshes = [];
  const entries = pieces
    .map((piece) => {
      piece.updateMatrixWorld(true);
      return { box: new THREE.Box3().setFromObject(piece, true), piece };
    })
    .filter((entry) => Number.isFinite(entry.box.min.y))
    .sort((a, b) => a.box.min.y - b.box.min.y);

  for (const { box, piece } of entries) {
    let drop = null;
    if (stacking && placedMeshes.length > 0) {
      // Real contact: sample a grid of columns over the piece footprint.
      // In each column, find the piece's actual UNDERSIDE (upward ray into
      // itself) and the actual TOP SURFACE of whatever lies below
      // (downward ray onto placed pieces). The piece drops by the smallest
      // gap — first true geometric contact, never a phantom AABB corner.
      const samples = 4;
      const insetX = (box.max.x - box.min.x) * 0.12;
      const insetZ = (box.max.z - box.min.z) * 0.12;
      for (let gx = 0; gx < samples; gx += 1) {
        for (let gz = 0; gz < samples; gz += 1) {
          const x = box.min.x + insetX + (gx / (samples - 1)) * (box.max.x - box.min.x - insetX * 2);
          const z = box.min.z + insetZ + (gz / (samples - 1)) * (box.max.z - box.min.z - insetZ * 2);
          origin.set(x, box.min.y - 0.5, z);
          raycaster.set(origin, SETTLE_UP);
          const selfHit = raycaster.intersectObject(piece, true)[0];
          if (!selfHit) continue;
          const underside = selfHit.point.y;
          origin.set(x, box.max.y + 0.5, z);
          raycaster.set(origin, SETTLE_DOWN);
          const supportHit = raycaster.intersectObjects(placedMeshes, true)[0];
          const support = supportHit && supportHit.point.y <= underside + 1e-4
            ? supportHit.point.y
            : supportHit
              ? underside // already interpenetrating at this column: can't drop
              : 0;
          const gap = underside - Math.max(support, 0) - clearance;
          drop = drop === null ? gap : Math.min(drop, gap);
        }
      }
    }
    if (drop !== null) {
      // Drop-only: settling never pushes a piece upward.
      piece.position.y -= Math.max(drop, 0);
    } else {
      // Ground contact for scatter/patch (and the first stacked piece).
      piece.position.y += clearance - box.min.y;
    }
    piece.updateMatrixWorld(true);
    piece.traverse((object) => {
      if (object.isMesh) placedMeshes.push(object);
    });
  }
}

function orientAlong(mesh, start, end) {
  const direction = new THREE.Vector3().subVectors(end, start);
  mesh.position.copy(start).addScaledVector(direction, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
  return direction.length();
}

function tube(points, radius, radialSegments = 7) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  return new THREE.TubeGeometry(curve, Math.max(6, points.length * 3), radius, radialSegments, false);
}

// Coherent lumpy solid: vertices displace by simplex noise sampled at
// their direction, so neighbouring vertices move together and the result
// reads as one weathered chunk. Uncorrelated per-vertex jitter (the old
// approach) reads as crumpled tinfoil at any detail level.
function irregularGeometry(radius, random, angularity = 0.7, detail = 1, seed = 0) {
  const geometry = new THREE.IcosahedronGeometry(radius, detail);
  const noiseSeed = hashCombine(seed >>> 0, Math.floor(random() * 0xffff));
  const position = geometry.attributes.position;
  for (let index = 0; index < position.count; index += 1) {
    const length = new THREE.Vector3().fromBufferAttribute(position, index).length() || 1;
    const dx = position.getX(index) / length;
    const dy = position.getY(index) / length;
    const dz = position.getZ(index) / length;
    const lump = 0.65 * simplexNoise3(noiseSeed, dx * 1.35, dy * 1.35, dz * 1.35)
      + 0.35 * simplexNoise3(hashCombine(noiseSeed, 7), dx * 3.1, dy * 3.1, dz * 3.1);
    const factor = 1 + lump * mix(0.1, 0.34, angularity);
    position.setXYZ(index, dx * radius * factor, dy * radius * factor, dz * radius * factor);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function addSplinters(parent, point, direction, settings, random, amount, radius) {
  const count = Math.round(amount * 4);
  for (let index = 0; index < count; index += 1) {
    const length = radius * mix(1.8, 4.2, random());
    const start = point.clone().add(new THREE.Vector3(
      signed(random) * radius * 0.34,
      signed(random) * radius * 0.34,
      signed(random) * radius * 0.34,
    ));
    const end = start.clone().add(direction.clone().normalize().multiplyScalar(length));
    end.add(new THREE.Vector3(signed(random), signed(random) * 0.35, signed(random)).multiplyScalar(radius * 0.8));
    const middle = start.clone().lerp(end, 0.55).add(new THREE.Vector3(
      signed(random) * radius * 0.28,
      random() * radius * 0.24,
      signed(random) * radius * 0.28,
    ));
    const swept = createBranchTubeGeometry({
      irregularity: 0.12,
      points: [start.toArray(), middle.toArray(), end.toArray()],
      radialSegments: 5,
      radiusEnd: radius * 0.018,
      radiusStart: radius * mix(0.1, 0.18, random()),
      ringSpacing: Math.max(radius * 0.35, 0.025),
      seed: settings.asset.seed + index * 23 + Math.floor(random() * 997),
    });
    if (swept) addMesh(parent, swept.geometry, settings, random, {
      name: 'Tree Lab broken wood fiber', slot: index % 3 === 0 ? 2 : 1,
    });
  }
}

// Sharp elbow breaks at old fork points: rotate the polyline tail around
// a joint by a hard angle. Smooth `crookedness` wander can never produce
// the angular direction breaks that make scanned dead branches read.
function applyKinks(points, kinks, random) {
  if (kinks <= 0.02) return points;
  const axis = new THREE.Vector3();
  const pivot = new THREE.Vector3();
  const tail = new THREE.Vector3();
  for (let joint = 1; joint < points.length - 1; joint += 1) {
    if (random() > kinks * 0.55) continue;
    const angle = (random() < 0.5 ? -1 : 1) * mix(0.25, 0.95, random()) * kinks;
    axis.set(signed(random) * 0.4, 1, signed(random) * 0.4).normalize();
    pivot.copy(points[joint]);
    for (let after = joint + 1; after < points.length; after += 1) {
      tail.copy(points[after]).sub(pivot).applyAxisAngle(axis, angle);
      points[after].copy(tail).add(pivot);
    }
  }
  return points;
}

// Bark condition: coherent lengthwise mask splits each piece into
// bark-dark and weathered-pale zones (bark-on vs bark-stripped is most of
// the visual variety in scanned driftwood). Runs on baked vertex colors,
// so pooled/shared geometry stays untouched elsewhere.
function applyBarkStripping(geometry, settings, seed, amount) {
  if (amount <= 0.02 || !geometry.attributes.color) return;
  const position = geometry.attributes.position;
  const colors = geometry.attributes.color;
  const pale = paletteColor(settings, 2).lerp(new THREE.Color(1, 1, 1), 0.25);
  const maskSeed = hashCombine(seed >>> 0, 57);
  const swatch = new THREE.Color();
  for (let index = 0; index < position.count; index += 1) {
    const mask = 0.5 + 0.5 * simplexNoise3(
      maskSeed,
      position.getX(index) * 1.6,
      position.getY(index) * 3.2,
      position.getZ(index) * 3.2,
    );
    if (mask >= amount) continue;
    const strength = Math.min((amount - mask) / 0.18, 1);
    swatch.setRGB(colors.getX(index), colors.getY(index), colors.getZ(index)).lerp(pale, strength * 0.85);
    colors.setXYZ(index, swatch.r, swatch.g, swatch.b);
  }
  colors.needsUpdate = true;
}

// Root stump: central mass with radiating twisted roots — the photoscan catalogs
// "Coast Rauk Root Dead" silhouette. Roots are Tree Lab sweeps curling
// down and outward, a few upturned at the tips.
function createRootStumpPiece(settings, random, index) {
  const piece = new THREE.Group();
  piece.name = 'Procedural root stump';
  const { barkStripped, branchiness, crookedness, kinks, length, thickness } = settings.shape;
  const size = length * 0.5;
  const seed = settings.asset.seed + index * 97;

  const core = addMesh(piece, irregularGeometry(size * 0.3, random, 0.55, 2, seed), settings, random, {
    name: 'Root core', slot: 0,
  });
  core.position.y = size * 0.26;
  core.scale.set(1.15, 0.72, 1.05);

  // Snapped trunk stub rising from the core.
  const stub = createBranchTubeGeometry({
    irregularity: 0.3,
    points: [
      [0, size * 0.2, 0],
      [signed(random) * size * 0.1, size * mix(0.5, 0.75, random()), signed(random) * size * 0.1],
    ],
    radialSegments: 8,
    radiusEnd: thickness * mix(0.9, 1.2, random()),
    radiusStart: thickness * 1.6,
    ringSpacing: size / 8,
    seed: seed + 1,
  });
  if (stub) {
    const mesh = addMesh(piece, stub.geometry, settings, random, { name: 'Trunk stub', slot: 0 });
    applyBarkStripping(mesh.geometry, settings, seed + 1, barkStripped);
  }

  const rootCount = 7 + Math.round(branchiness * 6);
  for (let root = 0; root < rootCount; root += 1) {
    const azimuth = (root / rootCount) * Math.PI * 2 + signed(random) * 0.6;
    const dirX = Math.cos(azimuth);
    const dirZ = Math.sin(azimuth);
    const reach = size * mix(0.5, 1.35, random());
    const upturn = random() < 0.3 ? size * mix(0.15, 0.4, random()) : 0;
    const points = [
      new THREE.Vector3(dirX * size * 0.16, size * mix(0.16, 0.3, random()), dirZ * size * 0.16),
      new THREE.Vector3(
        dirX * reach * 0.45 + signed(random) * crookedness * size * 0.2,
        size * mix(0.04, 0.14, random()),
        dirZ * reach * 0.45 + signed(random) * crookedness * size * 0.2,
      ),
      new THREE.Vector3(
        dirX * reach + signed(random) * crookedness * size * 0.15,
        0.012 + upturn,
        dirZ * reach + signed(random) * crookedness * size * 0.15,
      ),
    ];
    applyKinks(points, kinks, random);
    const swept = createBranchTubeGeometry({
      irregularity: 0.24 + crookedness * 0.14,
      points: points.map((point) => point.toArray()),
      radialSegments: 6,
      radiusEnd: thickness * 0.06,
      radiusStart: thickness * mix(0.5, 0.75, random()),
      ringSpacing: Math.max(reach / 9, 0.03),
      seed: seed + 3 + root * 11,
    });
    if (!swept) continue;
    const mesh = addMesh(piece, swept.geometry, settings, random, {
      name: 'Dead root', slot: root % 3 === 0 ? 1 : 0,
    });
    applyBarkStripping(mesh.geometry, settings, seed + 3 + root * 11, barkStripped);
    // Rootlets on some roots.
    if (random() < 0.4) {
      const at = points[1];
      const rootlet = createBranchTubeGeometry({
        irregularity: 0.2,
        points: [
          at.toArray(),
          [at.x + signed(random) * reach * 0.3, Math.max(at.y * 0.5, 0.01), at.z + signed(random) * reach * 0.3],
        ],
        radialSegments: 5,
        radiusEnd: thickness * 0.04,
        radiusStart: thickness * 0.22,
        ringSpacing: Math.max(reach / 10, 0.03),
        seed: seed + 200 + root,
      });
      if (rootlet) addMesh(piece, rootlet.geometry, settings, random, { name: 'Rootlet', slot: 1 });
    }
  }
  scatterObject(piece, settings, random, index, { stacked: size * 0.4, tilt: 0.25 });
  settleOnGround(piece);
  return piece;
}

// Bark chip: a small curved ragged slab — bark side dark, inner wood
// pale — matching the scanned bark collections. Cylindrical curl across
// the width remembers the trunk it flaked off.
function createBarkChipPiece(settings, random, index) {
  const piece = new THREE.Group();
  piece.name = 'Procedural bark chip';
  const { length, thickness } = settings.shape;
  const chipLength = length * mix(0.16, 0.32, random());
  const chipWidth = chipLength * mix(0.35, 0.6, random());
  const chipThickness = Math.max(thickness * 0.22, 0.008);
  const seed = hashCombine(settings.asset.seed, 1300 + index * 53);
  const curlRadius = chipWidth / mix(0.5, 1.6, random());
  const edgeSeed = hashCombine(seed, 3);
  const cells = 10;

  const inside = (x, z) => {
    const u = x / chipLength;
    const v = z / chipWidth;
    const radial = Math.max(Math.abs(u), Math.abs(v) * 1.15) * 2;
    const wobble = 0.78 + 0.3 * simplexNoise3(edgeSeed, u * 3.2, 0, v * 3.2);
    return radial < wobble;
  };
  const bark = paletteColor(settings, 0);
  const inner = paletteColor(settings, 2).lerp(new THREE.Color(1, 1, 1), 0.18);
  const positions = [];
  const colors = [];
  const deform = (x, z) => {
    const arc = z / curlRadius;
    return [x, (1 - Math.cos(arc)) * curlRadius + chipThickness, Math.sin(arc) * curlRadius];
  };
  const pushVertex = (x, z, lift, color) => {
    const [dx, dy, dz] = deform(x, z);
    positions.push(dx, dy + lift, dz);
    const drift = 1 + signed(random) * settings.surface.variation;
    colors.push(
      Math.min(color.r * drift, 1),
      Math.min(color.g * drift, 1),
      Math.min(color.b * drift, 1),
    );
  };
  for (let cz = 0; cz < cells; cz += 1) {
    for (let cx = 0; cx < cells; cx += 1) {
      const x0 = (cx / cells - 0.5) * chipLength;
      const x1 = ((cx + 1) / cells - 0.5) * chipLength;
      const z0 = (cz / cells - 0.5) * chipWidth;
      const z1 = ((cz + 1) / cells - 0.5) * chipWidth;
      if (!inside((x0 + x1) / 2, (z0 + z1) / 2)) continue;
      // Bark top, pale inner-wood bottom.
      pushVertex(x0, z0, chipThickness, bark); pushVertex(x0, z1, chipThickness, bark); pushVertex(x1, z1, chipThickness, bark);
      pushVertex(x0, z0, chipThickness, bark); pushVertex(x1, z1, chipThickness, bark); pushVertex(x1, z0, chipThickness, bark);
      pushVertex(x0, z0, 0, inner); pushVertex(x1, z0, 0, inner); pushVertex(x1, z1, 0, inner);
      pushVertex(x0, z0, 0, inner); pushVertex(x1, z1, 0, inner); pushVertex(x0, z1, 0, inner);
    }
  }
  if (positions.length === 0) return piece;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, createMaterial(settings, { doubleSided: true }));
  mesh.name = 'Bark chip';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  piece.add(mesh);
  scatterObject(piece, settings, random, index, { stacked: chipThickness * 6, tilt: 0.5 });
  settleOnGround(piece);
  return piece;
}

// Broken plank, per DebrisMaker2's recipe: a thick slab whose ragged ends
// are CARVED (cells discarded past a noisy break line — raggedness only
// along the length, like grain snapping), knotholes punched through,
// then lengthwise warp + bend + twist. Emitted as one slab mesh: top and
// bottom vertex layers plus side skirts around every boundary cell.
function createPlankPiece(settings, random, index) {
  const piece = new THREE.Group();
  piece.name = 'Procedural broken plank';
  const { branchiness, crookedness, length, splinters, thickness } = settings.shape;
  const plankLength = length * mix(0.8, 1.15, random());
  const plankWidth = Math.max(thickness * mix(2.2, 3.2, random()), plankLength * 0.08);
  const plankThickness = Math.max(thickness * 0.55, 0.02);
  const seed = hashCombine(settings.asset.seed, 1000 + index * 43);
  const cellsX = 36;
  const cellsZ = 8;

  // Break lines: each end snaps along a jagged noise curve; `splinters`
  // deepens the bite. Knotholes: 0-2 grain-elongated discs.
  const breakSeed = hashCombine(seed, 3);
  const endBite = [mix(0.02, 0.16, splinters) * (0.4 + random()), mix(0.02, 0.16, splinters) * (0.4 + random())];
  const holes = [];
  const holeCount = Math.round(branchiness * 2 * random());
  for (let i = 0; i < holeCount; i += 1) {
    holes.push([
      signed(random) * plankLength * 0.3,
      signed(random) * plankWidth * 0.22,
      plankWidth * mix(0.1, 0.2, random()),
    ]);
  }
  const inside = (x, z) => {
    const across = z / plankWidth;
    const jag0 = simplexNoise3(breakSeed, 0.5, across * 6, 0) * 0.5 + 0.5;
    if (x < -plankLength * (0.5 - endBite[0] * jag0)) return false;
    const jag1 = simplexNoise3(breakSeed, 7.5, across * 6, 0) * 0.5 + 0.5;
    if (x > plankLength * (0.5 - endBite[1] * jag1)) return false;
    for (const [hx, hz, radius] of holes) {
      if (((x - hx) / 1.6) ** 2 + (z - hz) ** 2 < radius * radius) return false;
    }
    return true;
  };

  // Warp/bend/twist. Boards are STIFF: DM2's warp is ~0.5% of length —
  // anything stronger reads as rubber, not lumber.
  const warpSeed = hashCombine(seed, 11);
  const bendAngle = signed(random) * crookedness * 0.2;
  const twistAngle = signed(random) * crookedness * 0.55;
  const deform = (x, y, z) => {
    let py = y + crookedness * plankThickness * 0.6
      * simplexNoise3(warpSeed, x * 1.2 / plankLength, 0, z * 0.6 / plankWidth);
    py += Math.sin((x / plankLength) * Math.PI) * bendAngle * plankLength * 0.1;
    const angle = twistAngle * (x / plankLength);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return [x, py * cos - z * sin + plankThickness, py * sin + z * cos];
  };

  const positions = [];
  const cellAt = new Array(cellsX * cellsZ).fill(false);
  const cellCorner = (cx, cz) => [
    (cx / cellsX - 0.5) * plankLength,
    (cz / cellsZ - 0.5) * plankWidth,
  ];
  for (let cz = 0; cz < cellsZ; cz += 1) {
    for (let cx = 0; cx < cellsX; cx += 1) {
      const [x0, z0] = cellCorner(cx, cz);
      const [x1, z1] = cellCorner(cx + 1, cz + 1);
      if (!inside((x0 + x1) / 2, (z0 + z1) / 2)) continue;
      cellAt[cz * cellsX + cx] = true;
      const half = plankThickness / 2;
      const quad = (a, b, c, d) => positions.push(...a, ...b, ...c, ...a, ...c, ...d);
      quad(deform(x0, half, z0), deform(x0, half, z1), deform(x1, half, z1), deform(x1, half, z0));
      quad(deform(x0, -half, z0), deform(x1, -half, z0), deform(x1, -half, z1), deform(x0, -half, z1));
    }
  }
  // Side skirts wherever a kept cell borders a dropped one.
  const has = (cx, cz) => cx >= 0 && cz >= 0 && cx < cellsX && cz < cellsZ && cellAt[cz * cellsX + cx];
  for (let cz = 0; cz < cellsZ; cz += 1) {
    for (let cx = 0; cx < cellsX; cx += 1) {
      if (!has(cx, cz)) continue;
      const [x0, z0] = cellCorner(cx, cz);
      const [x1, z1] = cellCorner(cx + 1, cz + 1);
      const half = plankThickness / 2;
      const wall = (ax, az, bx, bz) => {
        positions.push(
          ...deform(ax, half, az), ...deform(bx, half, bz), ...deform(bx, -half, bz),
          ...deform(ax, half, az), ...deform(bx, -half, bz), ...deform(ax, -half, az),
        );
      };
      if (!has(cx - 1, cz)) wall(x0, z1, x0, z0);
      if (!has(cx + 1, cz)) wall(x1, z0, x1, z1);
      if (!has(cx, cz - 1)) wall(x0, z0, x1, z0);
      if (!has(cx, cz + 1)) wall(x1, z1, x0, z1);
    }
  }
  if (positions.length === 0) return piece;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geometry.computeVertexNormals();
  addMesh(piece, geometry, settings, random, { name: 'Broken plank', slot: index % 3 === 0 ? 1 : 0 });
  scatterObject(piece, settings, random, index, { stacked: plankThickness * 3, tilt: 0.35 });
  settleOnGround(piece);
  return piece;
}

// Sawn-end disc with baked growth rings: pale cut face, darker concentric
// rings, bark-colored rim. This is THE firewood read — a log without ring
// ends is just a fat lumpy branch.
function buildLogEndCapGeometry(radius, settings, random) {
  const rings = 4;
  const sectors = 14;
  const face = paletteColor(settings, 2).multiplyScalar(1.1);
  const ringLine = paletteColor(settings, 1).multiplyScalar(0.85);
  const bark = paletteColor(settings, 0);
  const positions = new Float32Array((rings * sectors + 1) * 3);
  const colors = new Float32Array((rings * sectors + 1) * 3);
  const swatch = new THREE.Color();
  const writeColor = (offset, color) => {
    colors[offset] = Math.min(color.r, 1);
    colors[offset + 1] = Math.min(color.g, 1);
    colors[offset + 2] = Math.min(color.b, 1);
  };
  positions[2] = radius * 0.06;
  writeColor(0, face);
  const wobbleSeed = Math.floor(random() * 0xffff);
  for (let ring = 1; ring <= rings; ring += 1) {
    const t = ring / rings;
    for (let sector = 0; sector < sectors; sector += 1) {
      const angle = (sector / sectors) * Math.PI * 2;
      const wobble = 1 + 0.05 * simplexNoise3(wobbleSeed, Math.cos(angle) * 1.2, t, Math.sin(angle) * 1.2);
      const r = radius * t * wobble;
      const vertex = 1 + (ring - 1) * sectors + sector;
      positions[vertex * 3] = Math.cos(angle) * r;
      positions[vertex * 3 + 1] = Math.sin(angle) * r;
      positions[vertex * 3 + 2] = radius * 0.06 * (1 - t * t);
      swatch.copy(face);
      if (ring === rings) swatch.copy(bark);
      else if (ring % 2 === 0) swatch.lerp(ringLine, 0.65);
      writeColor(vertex * 3, swatch);
    }
  }
  const indices = [];
  for (let sector = 0; sector < sectors; sector += 1) {
    indices.push(0, 1 + sector, 1 + ((sector + 1) % sectors));
  }
  for (let ring = 0; ring < rings - 1; ring += 1) {
    for (let sector = 0; sector < sectors; sector += 1) {
      const a = 1 + ring * sectors + sector;
      const b = 1 + ring * sectors + ((sector + 1) % sectors);
      indices.push(a, a + sectors, b, b, a + sectors, b + sectors);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// Sawn firewood log: slim straight core (length ~4.5x diameter — fat
// stubby sweeps read as crumpled blobs under the toon shader), bark as
// lengthwise ridges via the sweep's cross-section profile (DM2's
// stretched bark noise), and growth-ring caps aligned to the true end
// tangents.
function createLogPiece(settings, random, index) {
  const piece = new THREE.Group();
  piece.name = 'Procedural sawn log';
  const { branchiness, crookedness, length, thickness } = settings.shape;
  const radius = thickness * mix(1.15, 1.45, random());
  const logLength = Math.max(length * mix(0.55, 0.75, random()), radius * 3.6);
  const bow = crookedness * logLength * 0.03;
  const points = [
    [-logLength / 2, radius, 0],
    [0, radius + bow, signed(random) * crookedness * radius * 0.15],
    [logLength / 2, radius, 0],
  ];
  // Bark ridges: a wavy radius profile constant along the run.
  const profileSeed = hashCombine(settings.asset.seed, 1100 + index * 71);
  const ridgePhase = random() * Math.PI * 2;
  const profile = [];
  for (let k = 0; k < 16; k += 1) {
    const angle = (k / 16) * Math.PI * 2;
    profile.push(
      1
      + 0.05 * Math.sin(angle * 5 + ridgePhase)
      + 0.05 * simplexNoise3(profileSeed, Math.cos(angle) * 1.4, 0, Math.sin(angle) * 1.4),
    );
  }
  const swept = createBranchTubeGeometry({
    irregularity: 0.05,
    points,
    profile,
    radialSegments: 12,
    radiusEnd: radius * 0.97,
    radiusStart: radius,
    ringSpacing: Math.max(logLength / 6, 0.05),
    seed: settings.asset.seed + index * 67,
  });
  if (swept) addMesh(piece, swept.geometry, settings, random, { name: 'Log bark', slot: 0 });
  for (const side of [-1, 1]) {
    const capGeometry = buildLogEndCapGeometry(radius * 1.02, settings, random);
    const cap = new THREE.Mesh(capGeometry, createMaterial(settings, { doubleSided: true }));
    cap.name = 'Sawn end';
    cap.castShadow = true;
    cap.receiveShadow = true;
    const end = points[side < 0 ? 0 : 2];
    const inner = points[1];
    const tangent = new THREE.Vector3(end[0] - inner[0], end[1] - inner[1], end[2] - inner[2]).normalize();
    cap.position.set(end[0], end[1], end[2]).addScaledVector(tangent, -radius * 0.02);
    cap.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent);
    piece.add(cap);
  }
  const knotCount = Math.round(branchiness * 2 * random());
  for (let knot = 0; knot < knotCount; knot += 1) {
    const stubLength = radius * mix(0.3, 0.5, random());
    const stub = addMesh(piece, new THREE.CylinderGeometry(radius * 0.13, radius * 0.2, stubLength, 6), settings, random, {
      name: 'Branch stub', slot: 1,
    });
    const t = mix(0.25, 0.75, random());
    const angle = random() * Math.PI;
    stub.position.set(
      (t - 0.5) * logLength,
      radius + Math.cos(angle) * radius,
      Math.sin(angle) * radius * (random() < 0.5 ? -1 : 1),
    );
    stub.rotation.x = Math.PI / 2 - angle;
  }
  scatterObject(piece, settings, random, index, { stacked: radius * 1.1, tilt: 0.2 });
  settleOnGround(piece);
  return piece;
}

function createWoodPiece(settings, random, index) {
  if (settings.asset.variant === 'planks') return createPlankPiece(settings, random, index);
  if (settings.asset.variant === 'logs') return createLogPiece(settings, random, index);
  if (settings.asset.variant === 'rootStump') return createRootStumpPiece(settings, random, index);
  if (settings.asset.variant === 'barkChips') return createBarkChipPiece(settings, random, index);
  const piece = new THREE.Group();
  piece.name = 'Procedural wood piece';
  const { branchiness, crookedness, kinks, length, splinters, thickness } = settings.shape;
  const twig = settings.asset.variant === 'twigPile';
  const pieceLength = length * (twig ? mix(0.55, 1, random()) : mix(0.82, 1.12, random()));
  const radius = thickness * (twig ? mix(0.55, 0.9, random()) : mix(0.85, 1.15, random()));
  const points = [];
  const segments = twig ? 4 : 6;
  for (let step = 0; step < segments; step += 1) {
    const t = step / (segments - 1);
    points.push(new THREE.Vector3(
      (t - 0.5) * pieceLength,
      radius + Math.sin(t * Math.PI) * crookedness * pieceLength * 0.08 + signed(random) * crookedness * radius,
      signed(random) * crookedness * pieceLength * 0.12,
    ));
  }
  applyKinks(points, kinks, random);
  if (twig) {
    const swept = createBranchTubeGeometry({
      irregularity: 0.18 + crookedness * 0.12,
      points: points.map((point) => point.toArray()),
      radialSegments: 6,
      radiusEnd: radius * 0.22,
      radiusStart: radius * 1.08,
      ringSpacing: Math.max(0.035, radius * 0.7),
      seed: settings.asset.seed + index * 19,
    });
    if (swept) addMesh(piece, swept.geometry, settings, random, { name: 'Tree Lab twig sweep', slot: 0 });
  } else {
    // This is the same central-leader branch builder Tree Lab uses. A
    // horizontal hand-drawn spine becomes the fallen limb; Tree Lab grows
    // radius-continuous child forks and tapered terminal twigs from it.
    const grown = createBranchingTreeSkeleton({
      branchAngle: mix(48, 76, branchiness),
      branchStart: mix(0.18, 0.32, random()),
      canopyScale: 1,
      childrenCount: Math.max(1, Math.round(1 + branchiness * 4)),
      forceStrength: 0,
      gnarliness: 0.06 + crookedness * 0.22,
      leafSpacing: 10,
      lengthRatio: 0.26 + branchiness * 0.16,
      levels: branchiness > 0.67 ? 2 : 1,
      maxAttachments: 1,
      maxBranches: branchiness > 0.67 ? 18 : Math.max(3, Math.round(2 + branchiness * 5)),
      radialSegments: 8,
      radiusRatio: 0.58,
      seed: settings.asset.seed + index * 37,
      tipRadius: Math.max(radius * 0.075, 0.006),
      trunk: { gnarl: crookedness * 0.25, radiusBottom: radius * 1.08 },
      trunkSpine: points.map((point) => point.toArray()),
    });
    const grownMesh = addMesh(piece, grown.geometry, settings, random, {
      name: settings.asset.variant === 'driftwood' ? 'Tree Lab driftwood branch' : 'Tree Lab fallen branch',
      slot: 0,
    });
    applyBarkStripping(grownMesh.geometry, settings, settings.asset.seed + index * 37, settings.shape.barkStripped);

    // Knuckles use the same embedded-bulge language as Tree Lab wood
    // details. They break the silhouette without faking branches as pipes.
    const knotCount = Math.round(branchiness * 3);
    for (let knotIndex = 0; knotIndex < knotCount; knotIndex += 1) {
      const pointIndex = 1 + Math.floor(random() * (points.length - 2));
      const knot = addMesh(piece, new THREE.IcosahedronGeometry(radius * mix(0.55, 0.82, random()), 1), settings, random, {
        name: 'Branch knuckle', slot: knotIndex % 3 === 0 ? 1 : 0,
      });
      knot.position.copy(points[pointIndex]);
      knot.scale.set(1.25, 0.82, 1.05);
    }
  }
  if (splinters > 0.08) {
    // The detached base is the visibly broken end; terminal forks keep the
    // natural taper produced by Tree Lab's branch builder.
    const brokenDirection = points[0].clone().sub(points[1]);
    if (!twig) {
      const cap = addMesh(piece, new THREE.CircleGeometry(radius * 1.07, 8), settings, random, {
        doubleSided: true, name: 'Broken branch end', slot: 2,
      });
      cap.position.copy(points[0]);
      cap.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), brokenDirection.clone().normalize());
    }
    addSplinters(piece, points[0], brokenDirection, settings, random, splinters, radius);
    // Structural prongs: big tapered forks at the break, not just fibers —
    // the splayed multi-prong driftwood read.
    if (!twig && splinters > 0.35) {
      const prongCount = 1 + Math.round(splinters * 2);
      const direction = brokenDirection.clone().normalize();
      for (let prong = 0; prong < prongCount; prong += 1) {
        const prongLength = radius * mix(3, 6, random());
        const cone = new THREE.Vector3(
          signed(random) * 0.5, mix(0.1, 0.5, random()), signed(random) * 0.5,
        ).multiplyScalar(0.6);
        const end = points[0].clone()
          .addScaledVector(direction, prongLength)
          .addScaledVector(cone, prongLength * 0.6);
        const middle = points[0].clone().lerp(end, 0.5).add(new THREE.Vector3(
          signed(random) * radius * 0.5, random() * radius * 0.6, signed(random) * radius * 0.5,
        ));
        const sweptProng = createBranchTubeGeometry({
          irregularity: 0.2,
          points: [points[0].toArray(), middle.toArray(), end.toArray()],
          radialSegments: 6,
          radiusEnd: radius * 0.03,
          radiusStart: radius * mix(0.28, 0.42, random()),
          ringSpacing: Math.max(prongLength / 8, 0.03),
          seed: settings.asset.seed + index * 37 + prong * 13 + 5,
        });
        if (!sweptProng) continue;
        const prongMesh = addMesh(piece, sweptProng.geometry, settings, random, {
          name: 'Broken prong', slot: prong % 2 === 0 ? 1 : 0,
        });
        applyBarkStripping(prongMesh.geometry, settings, settings.asset.seed + prong * 91, settings.shape.barkStripped);
      }
    }
  }
  scatterObject(piece, settings, random, index, { stacked: twig ? radius * 5 : radius * 2, tilt: 0.4 });
  settleOnGround(piece);
  return piece;
}

// SDF bone forms are meshed once per unique variant and shared across
// instances (Quixel packs ship 2-4 scan variants and scatter them; nobody
// notices at debris scale, and it keeps slider drags interactive). The
// per-instance read comes from rotation, mirroring, scale, and a small
// material tint.
const BONE_FIELD_BUILDERS = Object.freeze({
  jawBone: { builder: createJawField, name: 'SDF jaw bone', unique: 2 },
  longBone: { builder: createLongBoneField, name: 'SDF long bone', unique: 3 },
  skull: { builder: createSkullField, name: 'SDF skull', unique: 2 },
});

function buildBonePool(settings, count) {
  const entry = BONE_FIELD_BUILDERS[settings.asset.variant] ?? BONE_FIELD_BUILDERS.longBone;
  const geometries = [];
  const uniqueCount = Math.min(count, entry.unique);
  for (let unique = 0; unique < uniqueCount; unique += 1) {
    const fieldSeed = hashCombine(settings.asset.seed, 977 + unique * 131);
    const field = entry.builder(settings.shape, fieldSeed);
    // High cavity tint: toon banding compresses shading, so sockets and
    // grooves need their darkening baked strongly into vertex color.
    const geometry = meshDebrisField(field, settings.surface, fieldSeed, { cavityTint: 0.95 });
    if (geometry) geometries.push(geometry);
  }
  return geometries.length > 0 ? { geometries, name: entry.name } : null;
}

function createPooledPiece(pool, geometry, settings, random, index, { mirror = false, stacked, tilt }) {
  const piece = new THREE.Group();
  piece.name = pool.name;
  const mesh = new THREE.Mesh(geometry, createMaterial(settings));
  mesh.name = pool.name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  // Per-instance variation without re-meshing: value tint, size jitter,
  // and Z-mirroring (chiral bones come from both sides of the animal).
  mesh.material.color.setScalar(1 + signed(random) * settings.surface.variation * 0.4);
  mesh.scale.setScalar(mix(0.86, 1.14, random()));
  if (mirror && random() < 0.5) mesh.scale.z *= -1;
  piece.add(mesh);
  scatterObject(piece, settings, random, index, { stacked, tilt });
  settleOnGround(piece);
  return piece;
}

function samplePolyline(points, t) {
  const scaled = Math.min(Math.max(t, 0), 1) * (points.length - 1);
  const index = Math.min(Math.floor(scaled), points.length - 2);
  const local = scaled - index;
  const a = points[index];
  const b = points[index + 1];
  return [
    a[0] + (b[0] - a[0]) * local,
    a[1] + (b[1] - a[1]) * local,
    a[2] + (b[2] - a[2]) * local,
  ];
}

// Antlers are branches: a curling main beam swept with Tree Lab's tube
// builder (organic cross-section, taper) and forward-curving tines that
// shorten toward the tip.
function createAntler(settings, random, index) {
  const piece = new THREE.Group();
  piece.name = 'Procedural antler';
  const { curvature, jointSize, length, thickness } = settings.shape;
  const sweepAngle = 0.7 + curvature * 1.6;
  const arcRadius = length / sweepAngle;
  const wobblePhase = random() * Math.PI * 2;
  const beamPoints = [];
  for (let step = 0; step < 7; step += 1) {
    const t = step / 6;
    const angle = sweepAngle * t;
    beamPoints.push([
      arcRadius * Math.sin(angle),
      thickness + arcRadius * (1 - Math.cos(angle)),
      length * 0.05 * (0.4 + curvature) * Math.sin(t * Math.PI * 2 + wobblePhase),
    ]);
  }
  const beam = createBranchTubeGeometry({
    irregularity: 0.18,
    points: beamPoints,
    radialSegments: 7,
    radiusEnd: thickness * 0.2,
    radiusStart: thickness * 1.05,
    ringSpacing: Math.max(length / 26, 0.03),
    seed: settings.asset.seed + index * 53,
  });
  if (beam) addMesh(piece, beam.geometry, settings, random, { name: 'Antler beam', slot: 0 });
  const burr = addMesh(piece, irregularGeometry(thickness * 1.45, random, 0.5, 1, settings.asset.seed + index), settings, random, {
    name: 'Antler burr', slot: 1,
  });
  burr.position.set(beamPoints[0][0], beamPoints[0][1], beamPoints[0][2]);
  burr.scale.set(1, 0.55, 1);
  const tineCount = 2 + Math.round(jointSize * 2.5);
  for (let tine = 0; tine < tineCount; tine += 1) {
    const along = 0.16 + 0.62 * (tine / Math.max(tineCount - 1, 1));
    const base = samplePolyline(beamPoints, along);
    const tineLength = length * mix(0.2, 0.34, random()) * (1 - along * 0.45);
    const side = (tine % 2 ? -1 : 1) * mix(0.2, 0.5, random());
    const mid = [
      base[0] - tineLength * 0.12,
      base[1] + tineLength * 0.5,
      base[2] + side * tineLength * 0.4,
    ];
    const end = [
      base[0] - tineLength * 0.38,
      base[1] + tineLength * 0.92,
      base[2] + side * tineLength * 0.55,
    ];
    const swept = createBranchTubeGeometry({
      irregularity: 0.14,
      points: [base, mid, end],
      radialSegments: 6,
      radiusEnd: thickness * 0.07,
      radiusStart: thickness * mix(0.45, 0.62, 1 - along),
      ringSpacing: Math.max(tineLength / 8, 0.02),
      seed: settings.asset.seed + index * 53 + tine * 7 + 1,
    });
    if (swept) addMesh(piece, swept.geometry, settings, random, {
      name: 'Antler tine', slot: 1,
    });
  }
  scatterObject(piece, settings, random, index, { stacked: thickness, tilt: 0.6 });
  settleOnGround(piece);
  return piece;
}

// Masonry fragments are mini-rocks: base solid + planar fracture cuts +
// cellular facet creases, meshed once per unique variant and shared.
function buildStonePool(settings, count) {
  const geometries = [];
  const uniqueCount = Math.min(count, settings.asset.variant === 'gems' ? 3 : 4);
  for (let unique = 0; unique < uniqueCount; unique += 1) {
    const fieldSeed = hashCombine(settings.asset.seed, 1201 + unique * 157);
    const field = createStoneField(settings.shape, settings.asset.variant, fieldSeed);
    const geometry = meshDebrisField(field, settings.surface, fieldSeed, {
      cavityTint: settings.asset.variant === 'gems' ? 0.2 : 0.5,
    });
    if (geometry) geometries.push(geometry);
  }
  return geometries.length > 0 ? { geometries, name: `SDF ${settings.asset.variant}` } : null;
}

const MASONRY_VARIANTS = new Set(['rubble', 'bricks', 'shards']);

// The merged stone type exposes unified sliders; masonry builders keep
// their historical parameter names via this adapter.
function masonryShapeAdapter(shape) {
  return { ...shape, angularity: shape.sharpness, fracture: shape.detail };
}

function buildMasonryPool(settings, count) {
  const variant = settings.asset.variant;
  const kinds = variant === 'bricks'
    ? [['brick', 3]]
    : variant === 'shards'
      ? [['shard', Math.min(count, 4)]]
      : [['chunk', Math.min(count, 3)], ['brick', 2]];
  const pool = { brick: [], chunk: [], shard: [] };
  for (const [kind, uniqueCount] of kinds) {
    for (let unique = 0; unique < uniqueCount; unique += 1) {
      const fieldSeed = hashCombine(settings.asset.seed, 449 + unique * 173 + kind.length);
      const field = createMasonryChunkField(masonryShapeAdapter(settings.shape), kind, fieldSeed);
      const geometry = meshDebrisField(field, settings.surface, fieldSeed, { cavityTint: 0.45 });
      if (geometry) pool[kind].push(geometry);
    }
  }
  return pool.brick.length + pool.chunk.length + pool.shard.length > 0 ? pool : null;
}

function createMasonryPiece(settings, random, index, pool) {
  const { brickRatio, chunkSize, stacking } = settings.shape;
  const variant = settings.asset.variant;
  const wantBrick = variant === 'bricks' || (variant === 'rubble' && random() < brickRatio);
  const kind = variant === 'shards' ? 'shard' : wantBrick && pool.brick.length > 0 ? 'brick' : 'chunk';
  const geometries = pool[kind].length > 0 ? pool[kind] : pool.chunk.length > 0 ? pool.chunk : pool.brick;
  const geometry = geometries[(index + Math.floor(random() * geometries.length)) % geometries.length];
  return createPooledPiece(
    { name: kind === 'brick' ? 'Broken brick' : kind === 'shard' ? 'Stone shard' : 'Concrete chunk' },
    geometry, settings, random, index,
    { mirror: true, stacked: chunkSize * stacking * 1.5, tilt: 0.8 },
  );
}

// Torn metal sheet, following DebrisMaker2's corrugated-metal recipe:
// the silhouette is CARVED (corner slices + noisy edge bites + punched
// rust-hole clusters remove triangles, leaving raw jagged borders), the
// corrugation is a rounded sine with amplitude ~= 0.27x wavelength, and
// crumpling is layered AFTER corrugation as low-frequency coherent noise
// plus a few straight crease folds. A rectangle with sine bumps reads as
// a rubber mat; a torn outline is what says "sheet metal".
function buildTornSheetGeometry(settings, random, seed) {
  const { bend, corrugation, rust, sheetSize } = settings.shape;
  const width = sheetSize * mix(0.8, 1.25, random());
  const length = width * mix(1.25, 1.85, random());
  const cellsX = 30;
  const cellsZ = 42;

  // Silhouette cutters, all in the sheet's XZ plane.
  const slices = [];
  const sliceCount = 1 + Math.floor(random() * 3);
  for (let i = 0; i < sliceCount; i += 1) {
    const theta = random() * Math.PI * 2;
    const nx = Math.cos(theta);
    const nz = Math.sin(theta);
    const support = Math.abs(nx) * width * 0.5 + Math.abs(nz) * length * 0.5;
    slices.push([nx, nz, support * (1 - mix(0.1, 0.4, random()))]);
  }
  const bites = [];
  const biteCount = 1 + Math.floor(random() * 2);
  for (let i = 0; i < biteCount; i += 1) {
    const edge = random() * Math.PI * 2;
    bites.push([
      Math.cos(edge) * width * 0.5,
      Math.sin(edge) * length * 0.5,
      width * mix(0.14, 0.32, random()),
      hashCombine(seed, 41 + i),
    ]);
  }
  const holes = [];
  const clusterCount = Math.round(rust * 3);
  for (let cluster = 0; cluster < clusterCount; cluster += 1) {
    const cx = signed(random) * width * 0.32;
    const cz = signed(random) * length * 0.34;
    const count = 3 + Math.floor(random() * 5);
    for (let i = 0; i < count; i += 1) {
      holes.push([
        cx + signed(random) * width * 0.1,
        cz + signed(random) * width * 0.1,
        width * mix(0.02, 0.055, random()),
      ]);
    }
  }
  const inside = (x, z) => {
    for (const [nx, nz, d] of slices) if (nx * x + nz * z > d) return false;
    for (const [bx, bz, radius, biteSeed] of bites) {
      const wobble = 1 + 0.45 * simplexNoise3(biteSeed, x * 3 / width, 0, z * 3 / width);
      if ((x - bx) ** 2 + (z - bz) ** 2 < (radius * wobble) ** 2) return false;
    }
    for (const [hx, hz, radius] of holes) {
      if ((x - hx) ** 2 + (z - hz) ** 2 < radius * radius) return false;
    }
    return true;
  };

  // Height field: rounded-sine corrugation + coherent crumple + creases.
  const waveCount = 4 + corrugation * 8;
  const wavelength = width / waveCount;
  const amplitude = corrugation * wavelength * 0.27;
  const crumpleSeed = hashCombine(seed, 7);
  const creases = [];
  const creaseCount = 1 + Math.round(bend * 2);
  for (let i = 0; i < creaseCount; i += 1) {
    const theta = random() * Math.PI * 2;
    creases.push([
      Math.cos(theta), Math.sin(theta),
      signed(random) * width * 0.25,
      (i % 2 ? -1 : 1) * bend * sheetSize * mix(0.04, 0.09, random()),
    ]);
  }
  const heightAt = (x, z) => {
    let y = amplitude * Math.sin((x / wavelength) * Math.PI * 2);
    y += bend * sheetSize * 0.1 * fbm3(crumpleSeed, x * 1.5 / sheetSize, 0, z * 1.5 / sheetSize, 2, 2, 0.5);
    for (const [nx, nz, offset, lift] of creases) {
      const distance = Math.abs(nx * x + nz * z - offset);
      y += lift * Math.max(0, 1 - distance / (sheetSize * 0.45));
    }
    return y;
  };

  const positions = [];
  const colors = [];
  const primary = paletteColor(settings, 1);
  const rustColor = paletteColor(settings, 2);
  const rustSeed = hashCombine(seed, 19);
  const swatch = new THREE.Color();
  const pushVertex = (x, z) => {
    positions.push(x, heightAt(x, z), z);
    // Rust patches: coherent-noise mask blending toward the oxidized
    // accent, denser as `rust` rises (DM2 pairs holes with rust zones).
    const mask = 0.5 + 0.5 * simplexNoise3(rustSeed, x * 2.6 / width, 0, z * 2.6 / width);
    swatch.copy(primary);
    if (mask < rust * 0.62) swatch.lerp(rustColor, mix(0.45, 0.9, 1 - mask / Math.max(rust * 0.62, 0.001)));
    swatch.multiplyScalar(1 + signed(random) * settings.surface.variation * 0.5);
    colors.push(Math.min(swatch.r, 1), Math.min(swatch.g, 1), Math.min(swatch.b, 1));
  };
  for (let cz = 0; cz < cellsZ; cz += 1) {
    for (let cx = 0; cx < cellsX; cx += 1) {
      const x0 = (cx / cellsX - 0.5) * width;
      const x1 = ((cx + 1) / cellsX - 0.5) * width;
      const z0 = (cz / cellsZ - 0.5) * length;
      const z1 = ((cz + 1) / cellsZ - 0.5) * length;
      const xm = (x0 + x1) / 2;
      const zm = (z0 + z1) / 2;
      if (!inside(xm, zm)) continue;
      pushVertex(x0, z0); pushVertex(x0, z1); pushVertex(x1, z1);
      pushVertex(x0, z0); pushVertex(x1, z1); pushVertex(x1, z0);
    }
  }
  if (positions.length === 0) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
  geometry.computeVertexNormals();
  return geometry;
}

function createSheet(settings, random, index) {
  const piece = new THREE.Group();
  const geometry = buildTornSheetGeometry(settings, random, hashCombine(settings.asset.seed, 600 + index * 37));
  if (!geometry) return piece;
  const mesh = new THREE.Mesh(geometry, createMaterial(settings, { doubleSided: true, metalness: 0.72 }));
  mesh.name = 'Torn sheet metal';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  piece.add(mesh);
  scatterObject(piece, settings, random, index, { stacked: settings.shape.sheetSize * 0.12, tilt: 0.48 });
  settleOnGround(piece);
  return piece;
}

// Shrapnel fragment, following DebrisMaker2's recipe: a flat plate whose
// silhouette is carved by a noisy blob, then folded hard (30-200 deg)
// around an arbitrary in-plane axis — the fold is what reads as torn,
// twisted metal.
function createShrapnelPiece(settings, random, index) {
  const piece = new THREE.Group();
  const { sheetSize } = settings.shape;
  const size = sheetSize * mix(0.3, 0.55, random());
  const seed = hashCombine(settings.asset.seed, 700 + index * 41);
  const cells = 16;
  const blobSeed = hashCombine(seed, 3);
  const inside = (x, z) => {
    const angle = Math.atan2(z, x);
    const edge = size * 0.5 * (1 + 0.55 * simplexNoise3(blobSeed, Math.cos(angle) * 1.3, 0, Math.sin(angle) * 1.3));
    return Math.sqrt(x * x + z * z) < edge;
  };
  const foldTheta = random() * Math.PI * 2;
  const foldN = [Math.cos(foldTheta), Math.sin(foldTheta)];
  const foldAngle = mix(0.5, 2.6, random());
  const foldRadius = size / foldAngle;
  const noiseSeed = hashCombine(seed, 11);
  const positions = [];
  const pushVertex = (x, z) => {
    // Cylindrical bend about the fold axis.
    const along = foldN[0] * x + foldN[1] * z;
    const arc = along / foldRadius;
    const bentAlong = Math.sin(arc) * foldRadius;
    const y = (1 - Math.cos(arc)) * foldRadius
      + size * 0.05 * simplexNoise3(noiseSeed, x * 3 / size, 0, z * 3 / size);
    const across = -foldN[1] * x + foldN[0] * z;
    positions.push(
      foldN[0] * bentAlong - foldN[1] * across,
      y,
      foldN[1] * bentAlong + foldN[0] * across,
    );
  };
  for (let cz = 0; cz < cells; cz += 1) {
    for (let cx = 0; cx < cells; cx += 1) {
      const x0 = (cx / cells - 0.5) * size;
      const x1 = ((cx + 1) / cells - 0.5) * size;
      const z0 = (cz / cells - 0.5) * size;
      const z1 = ((cz + 1) / cells - 0.5) * size;
      if (!inside((x0 + x1) / 2, (z0 + z1) / 2)) continue;
      pushVertex(x0, z0); pushVertex(x0, z1); pushVertex(x1, z1);
      pushVertex(x0, z0); pushVertex(x1, z1); pushVertex(x1, z0);
    }
  }
  if (positions.length === 0) return piece;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geometry.computeVertexNormals();
  addMesh(piece, geometry, settings, random, {
    doubleSided: true,
    metalness: 0.78,
    name: 'Shrapnel fragment',
    slot: random() < settings.shape.rust ? 2 : 1,
  });
  scatterObject(piece, settings, random, index, { stacked: size * 0.2, tilt: 0.85 });
  settleOnGround(piece);
  return piece;
}

function createCan(settings, random, index) {
  const piece = new THREE.Group();
  const size = settings.shape.sheetSize * mix(0.7, 1.05, random());
  const height = size * mix(0.8, 1.35, random());
  const radius = size * 0.28;
  // Crush dents: coherent radial noise displacement (uniform squash alone
  // reads as a clean cylinder, not a kicked can).
  const bodyGeometry = new THREE.CylinderGeometry(radius, radius * mix(0.9, 1.05, random()), height, 10, 4);
  const dentSeed = hashCombine(settings.asset.seed, 900 + index * 31);
  const bodyPosition = bodyGeometry.attributes.position;
  for (let vertex = 0; vertex < bodyPosition.count; vertex += 1) {
    const px = bodyPosition.getX(vertex);
    const py = bodyPosition.getY(vertex);
    const pz = bodyPosition.getZ(vertex);
    const radial = Math.hypot(px, pz) || 1;
    const dent = settings.shape.bend * 0.3
      * Math.min(simplexNoise3(dentSeed, px * 2.4 / radius, py * 1.2 / radius, pz * 2.4 / radius), 0.15);
    bodyPosition.setX(vertex, px * (1 + dent * radius / radial));
    bodyPosition.setZ(vertex, pz * (1 + dent * radius / radial));
  }
  bodyGeometry.computeVertexNormals();
  const body = addMesh(piece, bodyGeometry, settings, random, {
    metalness: 0.74, name: 'Crushed can', slot: random() < settings.shape.rust ? 2 : 1,
  });
  body.position.y = radius;
  body.rotation.z = Math.PI / 2 + signed(random) * settings.shape.bend * 0.35;
  body.scale.y = 1 - settings.shape.bend * mix(0.08, 0.35, random());
  for (const side of [-1, 1]) {
    const ring = addMesh(piece, new THREE.TorusGeometry(radius, radius * 0.07, 5, 10), settings, random, {
      metalness: 0.8, name: 'Can rim', slot: 1,
    });
    ring.rotation.y = Math.PI / 2;
    ring.position.x = side * height * body.scale.y * 0.5;
    ring.position.y = radius;
  }
  scatterObject(piece, settings, random, index, { stacked: radius * 0.7, tilt: 0.75 });
  return piece;
}

function createWire(settings, random, index) {
  const piece = new THREE.Group();
  const size = settings.shape.sheetSize;
  const points = [];
  for (let step = 0; step < 10; step += 1) {
    const t = step / 9;
    const angle = t * Math.PI * mix(2.5, 5.5, random());
    points.push(new THREE.Vector3(
      (t - 0.5) * size,
      0.04 + Math.sin(angle) * size * 0.12,
      Math.cos(angle) * size * 0.2,
    ));
  }
  addMesh(piece, tube(points, size * 0.025, 5), settings, random, {
    metalness: 0.8, name: 'Curled wire', slot: random() < settings.shape.rust ? 2 : 0,
  });
  scatterObject(piece, settings, random, index, { stacked: size * 0.08, tilt: 0.7 });
  return piece;
}

function createMetalPiece(settings, random, index) {
  if (settings.asset.variant === 'sheets') return createSheet(settings, random, index);
  if (settings.asset.variant === 'cans') return createCan(settings, random, index);
  if (random() < settings.shape.wireChance) return createWire(settings, random, index);
  const roll = random();
  if (roll < 0.4) return createShrapnelPiece(settings, random, index);
  if (roll < 0.72) return createSheet(settings, random, index);
  return createCan(settings, random, index);
}

// Leaf silhouettes as width profiles along the mid-vein (t = stem -> tip).
// DebrisMaker2 ships scanned meshes per species; at toon scale a lobed
// width profile carries the same read for free.
const LEAF_PROFILES = [
  { lobeDepth: 0, lobes: 0, tip: 0.85 }, // ovate (birch/elm)
  { lobeDepth: 0.38, lobes: 3, tip: 0.7 }, // maple-like
  { lobeDepth: 0.26, lobes: 5, tip: 0.95 }, // oak-like
];

// Deform pipeline order copied from DebrisMaker2 Leaves: crease (V-fold
// along the mid-vein), skew, twist around the stem axis, then coherent
// noise. Flat fans read as paper cutouts; the crease+twist combination is
// what makes a dry curled leaf.
function buildLeafGeometry(settings, random, seed) {
  const { curl, dryness, leafSize } = settings.shape;
  const size = leafSize * mix(0.7, 1.25, random());
  const length = size * mix(1.5, 1.9, random());
  const profile = LEAF_PROFILES[Math.floor(random() * LEAF_PROFILES.length)];
  const segsL = 9;
  const segsW = 4;

  const crease = Math.tan(mix(0.25, 0.85, curl * mix(0.6, 1.3, random())));
  const twist = signed(random) * mix(0.4, 1.6, curl) * mix(0.5, 1.1, dryness);
  const skew = signed(random) * 0.22;
  const tipCurl = curl * size * mix(0.3, 0.6, random());
  const noiseSeed = hashCombine(seed, 5);

  const positions = new Float32Array((segsL + 1) * (segsW + 1) * 3);
  let write = 0;
  for (let i = 0; i <= segsL; i += 1) {
    const t = i / segsL;
    const reach = Math.min(t / profile.tip, 1);
    let halfWidth = size * 0.5 * Math.sin(Math.PI * reach ** 0.85) ** 0.9;
    if (profile.lobes > 0) {
      halfWidth *= 1 + profile.lobeDepth * Math.sin(profile.lobes * Math.PI * t);
    }
    for (let j = 0; j <= segsW; j += 1) {
      const u = j / segsW - 0.5;
      let x = u * 2 * halfWidth;
      let y = Math.abs(x) * crease
        + tipCurl * t * t
        + size * 0.08 * dryness * simplexNoise3(noiseSeed, x * 2.4 / size, 0, t * 2.4);
      const z = (t - 0.2) * length;
      // Twist around the stem axis grows toward the tip.
      const angle = twist * t;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const tx = x * cos - y * sin;
      y = x * sin + y * cos;
      x = tx + t * length * skew;
      positions[write] = x;
      positions[write + 1] = y + 0.012;
      positions[write + 2] = z;
      write += 3;
    }
  }
  const indices = [];
  for (let i = 0; i < segsL; i += 1) {
    for (let j = 0; j < segsW; j += 1) {
      const a = i * (segsW + 1) + j;
      const b = a + segsW + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createLeaf(settings, random, index) {
  const piece = new THREE.Group();
  const size = settings.shape.leafSize;
  const geometry = buildLeafGeometry(settings, random, hashCombine(settings.asset.seed, 800 + index * 29));
  addMesh(piece, geometry, settings, random, {
    doubleSided: true, name: 'Dry leaf', slot: random() < settings.shape.dryness ? (random() < 0.45 ? 2 : 1) : 0,
  });
  scatterObject(piece, settings, random, index, { stacked: size * 0.15, tilt: 0.38 });
  return piece;
}

// Real pinecone construction: woody scales wind around a spindle core in
// golden-angle spiral phyllotaxis (each scale ~137.5deg around and a step
// up from the last), tilting from downswept at the base to closed at the
// tip. Dozens of overlapping shields make the read; neat sparse rings of
// cones never will. Everything merges into ONE geometry so a cone is one
// draw call and can be pooled/instanced.
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function buildPineconeGeometry(settings, random) {
  const size = settings.shape.leafSize;
  const openness = mix(0.55, 1, settings.shape.curl);
  const coneLength = size * 1.6;
  const coreRadius = size * 0.34;
  const profileAt = (t) => 0.22 + 0.78 * Math.sin(Math.PI * t ** 0.75) ** 0.9;

  const parts = [];
  const corePoints = [];
  for (let step = 0; step <= 8; step += 1) {
    const t = step / 8;
    corePoints.push(new THREE.Vector2(
      Math.max(coreRadius * profileAt(t) * 0.85, 0.001),
      (t - 0.5) * coneLength,
    ));
  }
  const core = new THREE.LatheGeometry(corePoints, 8);
  paintGeometry(core, settings, random, 0);
  parts.push(core);

  const scaleCount = 52;
  const secondary = paletteColor(settings, 1);
  const apexDir = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const twist = new THREE.Quaternion();
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const scaleVec = new THREE.Vector3();
  for (let index = 0; index < scaleCount; index += 1) {
    const t = 0.04 + 0.92 * (index / (scaleCount - 1));
    const theta = index * GOLDEN_ANGLE + random() * 0.07;
    const ringRadius = coreRadius * profileAt(t);
    const scaleLength = size * 0.34 * (0.6 + 0.5 * Math.sin(Math.PI * t ** 0.9));
    // Tilt from the axis: base scales sweep down and open, tip scales
    // close up. `openness` (curl) flares the whole cone.
    const tilt = mix(1.5, 0.55, t) * openness;

    const scale = new THREE.ConeGeometry(scaleLength * 0.56, scaleLength, 4, 1);
    paintGeometry(scale, settings, random, 0);
    // Woody apophysis read: lighten the outer half of each scale toward
    // the secondary tan, brightest at the very tip.
    const colors = scale.attributes.color;
    const verts = scale.attributes.position;
    for (let v = 0; v < verts.count; v += 1) {
      const along = verts.getY(v) / scaleLength + 0.5;
      if (along > 0.45) {
        const lightness = (along - 0.45) / 0.55;
        colors.setXYZ(
          v,
          mix(colors.getX(v), secondary.r * 1.08, lightness),
          mix(colors.getY(v), secondary.g * 1.08, lightness),
          mix(colors.getZ(v), secondary.b * 1.08, lightness),
        );
      }
    }

    apexDir.set(Math.sin(tilt) * Math.cos(theta), Math.cos(tilt), -Math.sin(tilt) * Math.sin(theta));
    quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), apexDir);
    twist.setFromAxisAngle(apexDir, signed(random) * 0.15);
    quaternion.premultiply(twist);
    position
      .set(Math.cos(theta) * ringRadius * 0.7, (t - 0.5) * coneLength, -Math.sin(theta) * ringRadius * 0.7)
      .addScaledVector(apexDir, scaleLength * 0.42);
    scaleVec.set(1, 1, 0.28);
    matrix.compose(position, quaternion, scaleVec);
    scale.applyMatrix4(matrix);
    parts.push(scale);
  }

  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  merged.computeBoundingBox();
  return merged;
}

function buildPineconePool(settings, count) {
  const geometries = [];
  const uniqueCount = Math.min(Math.max(count, 1), 3);
  for (let unique = 0; unique < uniqueCount; unique += 1) {
    const rng = createDebrisRandom(hashCombine(settings.asset.seed, 503 + unique * 149));
    const scaled = createDebrisSettings(settings);
    scaled.shape.leafSize = settings.shape.leafSize * mix(0.78, 1.2, rng());
    geometries.push(buildPineconeGeometry(scaled, rng));
  }
  return { geometries, name: 'Pinecone' };
}

// Scallop fan shell as ONE parametric surface: a domed fan whose radial
// ribs and scalloped rim are baked into the surface itself (ridges glued
// onto a hemisphere read as a toy). Umbo (hinge) at the origin, fan
// opening toward +Z.
function createShell(settings, random, index) {
  const piece = new THREE.Group();
  const size = settings.shape.leafSize * mix(0.78, 1.2, random());
  const ribCount = 8 + Math.floor(random() * 4);
  const arc = Math.PI * mix(0.62, 0.74, random());
  const domeHeight = size * (0.24 + settings.shape.curl * 0.2);
  const ribDepth = mix(0.045, 0.08, random());
  const angularSegs = 26;
  const radialSegs = 7;

  const positions = new Float32Array((angularSegs + 1) * (radialSegs + 1) * 3);
  let write = 0;
  for (let a = 0; a <= angularSegs; a += 1) {
    const theta = (a / angularSegs - 0.5) * arc;
    const rib = Math.cos(ribCount * (theta / arc) * Math.PI * 2);
    const rimRadius = size * (1 + ribDepth * 0.7 * rib);
    for (let k = 0; k <= radialSegs; k += 1) {
      const t = k / radialSegs;
      const radius = t * rimRadius;
      // Dome profile with ribs growing toward the rim.
      const y = domeHeight * Math.sin((Math.PI / 2) * t) * (1 - t * 0.25)
        * (1 + ribDepth * 2.6 * rib * t)
        + 0.01;
      positions[write] = Math.sin(theta) * radius;
      positions[write + 1] = y;
      positions[write + 2] = Math.cos(theta) * radius - size * 0.12;
      write += 3;
    }
  }
  const indices = [];
  for (let a = 0; a < angularSegs; a += 1) {
    for (let k = 0; k < radialSegs; k += 1) {
      const i0 = a * (radialSegs + 1) + k;
      const i1 = i0 + radialSegs + 1;
      indices.push(i0, i1, i0 + 1, i0 + 1, i1, i1 + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  addMesh(piece, geometry, settings, random, {
    doubleSided: true, name: 'Fan shell', slot: random() < 0.3 ? 2 : 1,
  });
  scatterObject(piece, settings, random, index, { stacked: size * 0.12, tilt: 0.32 });
  return piece;
}

function createOrganicPiece(settings, random, index, pineconePool) {
  const size = settings.shape.leafSize;
  const wantCone = settings.asset.variant === 'pinecones'
    || (settings.asset.variant === 'leafLitter' && random() < settings.shape.coneRatio * 0.28);
  if (wantCone && pineconePool) {
    const geometry = pineconePool.geometries[index % pineconePool.geometries.length];
    return createPooledPiece(pineconePool, geometry, settings, random, index, {
      mirror: true, stacked: size * 0.2, tilt: 0.85,
    });
  }
  if (settings.asset.variant === 'shells') return createShell(settings, random, index);
  return createLeaf(settings, random, index);
}

function createCharcoalChunk(parent, settings, random, index, footprint, moundHeight = 0) {
  const radius = footprint * mix(0.055, 0.15, random());
  const geometry = irregularGeometry(radius, random, 0.92, 1, settings.asset.seed + index * 17);
  geometry.scale(mix(0.8, 1.8, random()), mix(0.35, 0.8, random()), mix(0.65, 1.25, random()));
  const mesh = addMesh(parent, geometry, settings, random, {
    name: 'Charcoal fragment', slot: random() < settings.shape.embers ? 2 : 0,
  });
  const radiusFromCenter = Math.sqrt(random()) * footprint;
  const angle = random() * Math.PI * 2;
  // Rest chunks ON the mound (matching its falloff profile) so they read
  // as half-sunk remains instead of vanishing inside the ash.
  const radial = radiusFromCenter / Math.max(footprint, 0.01);
  const moundSurface = moundHeight * Math.max(0, 1 - radial * radial) ** 1.4 * 0.85;
  mesh.position.set(
    Math.cos(angle) * radiusFromCenter,
    moundSurface + radius * 0.3 + index * 0.0001,
    Math.sin(angle) * radiusFromCenter,
  );
  mesh.rotation.set(signed(random), random() * Math.PI * 2, signed(random));
}

// Ash mound: a polar heightfield — squashed-cosine falloff profile with
// coherent lumps and a wobbled rim, like a real poured pile — instead of
// the old scaled hemisphere (which reads as a lens, not powder). Vertex
// colors bake fine light ash at the crown, base grey on the slopes, and
// the scorched-rim darkening the `rim` setting always promised.
function createAshMoundGeometry(settings, seed) {
  const { footprint, moundHeight, rim } = settings.shape;
  const { accentColor, edgeLight, primaryColor, secondaryColor } = settings.surface;
  const rings = 18;
  const sectors = 44;
  const lumpSeed = hashCombine(seed, 313);
  const rimSeed = hashCombine(seed, 631);
  const vertexCount = rings * sectors + 1;
  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const primary = new THREE.Color(...primaryColor);
  const secondary = new THREE.Color(...secondaryColor);
  // Scorch is carbon, not ember: a fixed near-black, never the accent red.
  const char = new THREE.Color(0.02, 0.018, 0.016);
  const swatch = new THREE.Color();

  const heightAt = (x, z, radial) => {
    const profile = Math.max(0, 1 - radial * radial) ** 1.4;
    const lumps = 1 + 0.4 * fbm3(lumpSeed, (x / footprint) * 1.8, 0, (z / footprint) * 1.8, 3, 2, 0.5);
    return Math.max(moundHeight * profile * lumps, 0.004);
  };

  const writeVertex = (vertex, x, y, z, radial) => {
    positions[vertex * 3] = x;
    positions[vertex * 3 + 1] = y;
    positions[vertex * 3 + 2] = z;
    // Crown = fine pale ash, slopes = base grey, rim = scorch band.
    swatch.copy(secondary).lerp(primary, Math.min(radial * 1.35, 1));
    const scorch = rim * Math.max(0, radial - 0.68) / 0.32;
    swatch.lerp(char, Math.min(scorch, 1));
    const crest = 1 + Math.max(0, 1 - radial) * edgeLight * 0.3;
    colors[vertex * 3] = Math.min(swatch.r * crest, 1);
    colors[vertex * 3 + 1] = Math.min(swatch.g * crest, 1);
    colors[vertex * 3 + 2] = Math.min(swatch.b * crest, 1);
  };

  writeVertex(0, 0, heightAt(0, 0, 0), 0, 0);
  for (let ring = 0; ring < rings; ring += 1) {
    const radial = (ring + 1) / rings;
    for (let sector = 0; sector < sectors; sector += 1) {
      const angle = (sector / sectors) * Math.PI * 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const wobble = 1 + 0.09 * simplexNoise3(rimSeed, cos * 1.4, radial * 0.8, sin * 1.4);
      const radius = radial * footprint * wobble;
      const x = cos * radius;
      const z = sin * radius;
      const y = ring === rings - 1 ? 0.003 : heightAt(x, z, radial);
      writeVertex(1 + ring * sectors + sector, x, y, z, radial);
    }
  }

  const indices = [];
  for (let sector = 0; sector < sectors; sector += 1) {
    indices.push(0, 1 + sector, 1 + ((sector + 1) % sectors));
  }
  for (let ring = 0; ring < rings - 1; ring += 1) {
    for (let sector = 0; sector < sectors; sector += 1) {
      const a = 1 + ring * sectors + sector;
      const b = 1 + ring * sectors + ((sector + 1) % sectors);
      const c = a + sectors;
      const d = b + sectors;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createAshAsset(settings, random) {
  const root = new THREE.Group();
  root.name = 'Procedural ash and char';
  const { footprint, moundHeight } = settings.shape;
  if (settings.asset.variant !== 'charcoal') {
    const mound = new THREE.Mesh(
      createAshMoundGeometry(settings, settings.asset.seed),
      createMaterial(settings),
    );
    mound.name = 'Ash mound';
    mound.castShadow = true;
    mound.receiveShadow = true;
    root.add(mound);
  }
  if (settings.asset.variant === 'campfire') {
    // Half-burnt firewood: crooked tapered sweeps (Tree Lab tube builder)
    // leaned across the mound at irregular angles, ends poking out of the
    // ash — not four identical arcs on a carousel.
    for (let logIndex = 0; logIndex < 4; logIndex += 1) {
      const across = footprint * mix(0.5, 0.72, random());
      const sag = moundHeight * mix(0.35, 0.65, random());
      const drift = signed(random) * footprint * 0.14;
      const swept = createBranchTubeGeometry({
        irregularity: 0.24,
        points: [
          [-across, moundHeight * mix(0.1, 0.3, random()), drift],
          [signed(random) * footprint * 0.12, sag + moundHeight * 0.35, -drift * 0.6],
          [across * mix(0.75, 1, random()), moundHeight * mix(0.15, 0.45, random()), signed(random) * footprint * 0.1],
        ],
        radialSegments: 6,
        radiusEnd: footprint * mix(0.045, 0.07, random()),
        radiusStart: footprint * mix(0.075, 0.1, random()),
        ringSpacing: Math.max(footprint / 14, 0.03),
        seed: settings.asset.seed + logIndex * 61,
      });
      if (!swept) continue;
      // Logs stay char-dark; ember accents belong to the charcoal chunks,
      // not to a whole glowing log.
      const log = addMesh(root, swept.geometry, settings, random, {
        name: 'Charred firewood', slot: 0,
      });
      log.rotation.y = (logIndex / 4) * Math.PI * 2 + signed(random) * 0.5;
    }
  }
  // Sawdust reads as powder with a few embedded slivers, not a char bed.
  const chunkShare = settings.asset.variant === 'sawdust' ? 0.35 : 1;
  const chunkCount = Math.max(2, Math.round(settings.asset.count * mix(0.45, 1.15, settings.shape.charcoal) * chunkShare));
  const chunkFootprint = footprint * (settings.asset.variant === 'charcoal' ? 1 : 0.75);
  const chunkMound = settings.asset.variant === 'charcoal' ? 0 : moundHeight;
  for (let index = 0; index < chunkCount; index += 1) {
    createCharcoalChunk(root, settings, random, index, chunkFootprint, chunkMound);
  }
  return root;
}

function countStats(root) {
  let meshCount = 0;
  let triangleCount = 0;
  let vertexCount = 0;
  root.traverse((object) => {
    if (!object.isMesh) return;
    meshCount += 1;
    const geometry = object.geometry;
    vertexCount += geometry.attributes.position?.count ?? 0;
    triangleCount += geometry.index
      ? geometry.index.count / 3
      : (geometry.attributes.position?.count ?? 0) / 3;
  });
  return { meshCount, triangleCount: Math.round(triangleCount), vertexCount };
}

// Universal Damage dial: shifts each type's own wear parameters around
// their authored values (0.5 = neutral, 0 = pristine, 1 = wrecked). The
// recipe keeps the user's per-field values; this derives the effective
// shape fed to the builders.
const DAMAGE_KEYS = Object.freeze({
  ash: ['charcoal', 'rim'],
  bone: ['damage'],
  metal: ['bend', 'rust'],
  organic: ['curl', 'dryness'],
  stone: ['detail'],
  wood: ['barkStripped', 'splinters'],
});

function applyDamageDial(settings) {
  const shift = (settings.asset.damage - 0.5) * 0.8;
  if (Math.abs(shift) < 0.01) return settings;
  const keys = DAMAGE_KEYS[settings.asset.type] ?? [];
  for (const key of keys) {
    if (typeof settings.shape[key] !== 'number') continue;
    settings.shape[key] = Math.min(Math.max(settings.shape[key] + shift, 0), 1);
  }
  return settings;
}

export function createDebrisAsset(inputSettings = {}) {
  const settings = applyDamageDial(createDebrisSettings(inputSettings));
  const random = createDebrisRandom(settings.asset.seed);
  const root = new THREE.Group();
  root.name = `Debris ${settings.asset.type} ${settings.asset.variant}`;
  root.userData.debrisRecipe = settings;

  if (settings.asset.type === 'ash') {
    root.add(createAshAsset(settings, random));
  } else {
    const pieces = [];
    const effectiveCount = settings.asset.type === 'organic'
      ? Math.min(32, Math.max(1, Math.round(settings.asset.count * settings.shape.coverage)))
      : settings.asset.count;
    // Unique SDF geometries are meshed once up front and shared across
    // instances; per-piece variation comes from the scatter transform.
    const bonePool = settings.asset.type === 'bone' && settings.asset.variant !== 'antler'
      ? buildBonePool(settings, effectiveCount)
      : null;
    const isMasonryVariant = settings.asset.type === 'stone' && MASONRY_VARIANTS.has(settings.asset.variant);
    const masonryPool = isMasonryVariant ? buildMasonryPool(settings, effectiveCount) : null;
    const stonePool = settings.asset.type === 'stone' && !isMasonryVariant
      ? buildStonePool(settings, effectiveCount)
      : null;
    const pineconePool = settings.asset.type === 'organic'
      && (settings.asset.variant === 'pinecones'
        || (settings.asset.variant === 'leafLitter' && settings.shape.coneRatio > 0))
      ? buildPineconePool(settings, effectiveCount)
      : null;
    for (let index = 0; index < effectiveCount; index += 1) {
      let piece;
      if (settings.asset.type === 'wood') piece = createWoodPiece(settings, random, index);
      else if (settings.asset.type === 'bone') {
        if (settings.asset.variant === 'antler') piece = createAntler(settings, random, index);
        else if (bonePool) {
          const geometry = bonePool.geometries[index % bonePool.geometries.length];
          piece = createPooledPiece(bonePool, geometry, settings, random, index, {
            mirror: true,
            stacked: settings.shape.thickness * 1.5,
            tilt: settings.asset.variant === 'longBone' ? 0.65 : 0.3,
          });
        } else piece = createAntler(settings, random, index);
      } else if (masonryPool) {
        piece = createMasonryPiece(settings, random, index, masonryPool);
      } else if (stonePool) {
        const geometry = stonePool.geometries[index % stonePool.geometries.length];
        piece = createPooledPiece(stonePool, geometry, settings, random, index, {
          mirror: true,
          stacked: settings.shape.chunkSize * 0.8,
          tilt: 0.8,
        });
      } else if (settings.asset.type === 'metal') piece = createMetalPiece(settings, random, index);
      else piece = createOrganicPiece(settings, random, index, pineconePool);
      root.add(piece);
      pieces.push(piece);
    }
    // Universal ground contact: flat/elongated pieces lie flat (no
    // corner-balancing), then every piece rests on the ground
    // (scatter/patch) or on the ground/another piece (heap/bundle).
    const stacking = settings.asset.arrangement === 'heap' || settings.asset.arrangement === 'bundle';
    if (!stacking) stabilizeFlatPieces(pieces);
    settleComposition(pieces, { stacking });
  }

  // Procedural detail texture pass: every mesh gets UVs (box projection
  // where the builder didn't provide them) and the type's tileable detail
  // map. The map multiplies baked vertex colors, so the palette sliders
  // stay authoritative; textures are cache-owned — dispose must not
  // touch material.map.
  const auto = debrisTextureAuto(settings.asset.type, settings.asset.variant);
  const style = settings.surface.textureStyle === 'auto' ? auto.style : settings.surface.textureStyle;
  const scale = settings.surface.textureScale;
  // A user-uploaded texture overrides the procedural detail map entirely.
  const customTexture = getCustomDebrisTexture(settings.surface.customTexture, scale);
  const detailTexture = customTexture
    ?? getDebrisDetailTexture(auto.kind, settings.asset.seed, style, scale);
  const fiberTexture = !customTexture && auto.kind === 'leaf'
    ? getDebrisDetailTexture('organicFiber', settings.asset.seed, 'fiber', scale)
    : null;
  root.traverse((object) => {
    if (!object.isMesh) return;
    ensureDebrisUvs(object.geometry);
    object.material.map = fiberTexture && object.name === 'Pinecone' ? fiberTexture : detailTexture;
    object.material.needsUpdate = true;
  });

  root.scale.setScalar(settings.asset.scale);
  root.userData.stats = countStats(root);
  return root;
}

export function disposeDebrisAsset(root) {
  const materials = new Set();
  root?.traverse((object) => {
    if (!object.isMesh) return;
    object.geometry?.dispose();
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (material) materials.add(material);
    }
  });
  for (const material of materials) material.dispose?.();
}
