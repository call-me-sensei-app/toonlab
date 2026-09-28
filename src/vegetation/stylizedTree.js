import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import {
  TREE_FOLIAGE_BLOBS,
  createCanopyBlobs,
  createLeafSpriteTexture,
  createTreeFoliageGeometry,
  createTreeFoliageMaterials,
  deriveCanopyPalette,
  resolveCanopyColor,
  setCanopyCloudShadow,
  setCanopySceneShadow,
  setCanopySun,
  setCanopyWind,
  tickCanopyTime,
} from './stylizedTreeFoliage.js';
import {
  createWoodySurfaceNodeMaterial,
  setWoodySurfaceSun,
} from '../shaders-tsl/woody-surface.js';
import { applyVegetationShader } from './vegetationShaders.js';
import {
  createTreeSurfaceTexture,
  TREE_SURFACE_PROFILES,
  TREE_SURFACE_PROFILE_DEFAULTS,
} from './treeSurfaceTextures.js';
import { syncFoliageFog } from '../shaders-tsl/chunks/foliage-fog.js';
import {
  attachFactoryStyleTarget,
  markFactoryStyleMaterial,
} from '../styles/styleMetadata.js';

// Modern anime-style stylized trees, fully parameterized for drop-in use:
//
//   const tree = new StylizedTree({ size: 2, canopyColor: 0x4da258 });
//   scene.add(tree);
//   tree.update(delta);                          // each frame (wind/flutter)
//   tree.setSun({ direction, color, sky });      // match your lighting
//
// Every visual knob is exposed with tuned defaults: trunk shape (bend, lean,
// twist, gnarl — crank gnarl/twist for bonsai-like trunks), branches, canopy
// blobs/cards/density, palette, wind. Trunk generation is deterministic per
// seed, so the same options always produce the same tree.

/**
 * Converts a drawn closed outline (normalized -0.5..0.5 points) into a
 * radius-per-angle profile for createBranchTubeGeometry: 24 samples of
 * centroid distance, normalized to mean 1 and softly clamped so drawn
 * trunk cross-sections stay buildable.
 */
export function polarProfileFromOutline(outline, samples = 24) {
  if (!Array.isArray(outline) || outline.length < 3) return null;
  let cx = 0;
  let cy = 0;
  for (const [x, y] of outline) {
    cx += x;
    cy += y;
  }
  cx /= outline.length;
  cy /= outline.length;
  // Max centroid distance per angular slot (handles concave outlines by
  // taking the reachable silhouette).
  const slots = new Array(samples).fill(0);
  for (const [x, y] of outline) {
    const angle = Math.atan2(y - cy, x - cx);
    const slot = Math.floor(((angle + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * samples) % samples;
    slots[slot] = Math.max(slots[slot], Math.hypot(x - cx, y - cy));
  }
  // Fill empty slots from neighbors, then normalize to mean 1.
  for (let i = 0; i < samples; i += 1) {
    if (slots[i] === 0) {
      slots[i] = slots[(i + samples - 1) % samples] || slots[(i + 1) % samples] || 0.3;
    }
  }
  const mean = slots.reduce((sum, value) => sum + value, 0) / samples;
  return slots.map((value) => Math.min(Math.max(value / mean, 0.45), 1.9));
}

// Leaf-sprite cache per silhouette: rebuilds are debounced-frequent in the
// designer and the sprite is deterministic per shape, so one texture per
// distinct shape/outline is plenty.
const leafSpriteCache = new Map();
function leafSpriteForShape(leafShape) {
  const shape = leafShape?.preset ?? 'teardrop';
  const outline = shape === 'custom' ? leafShape?.outline ?? null : null;
  const key = shape + (outline ? JSON.stringify(outline) : '');
  if (!leafSpriteCache.has(key)) {
    leafSpriteCache.set(key, createLeafSpriteTexture({ customOutline: outline, shape }));
  }
  return leafSpriteCache.get(key);
}

function seededRandom(seed) {
  return (k) => {
    const value = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453;
    return value - Math.floor(value);
  };
}

/**
 * Canopy pruning — decide which branch tips carry foliage and which are bared.
 *
 * A recursive skeleton puts a tuft on every terminal twig, and terminal twigs
 * fill the crown volume evenly. The result is always a dome, however the
 * individual tufts are shaped: a hundred small masses packed shoulder to
 * shoulder is a dome, and forty larger ones is a bigger dome. That is correct
 * for a broadleaf and it is wrong for anything whose identity is DISCRETE
 * foliage masses with sky and bare limb between them.
 *
 * Three independent policies, applied in this order. Each is off by default,
 * so a caller that passes nothing — or a bare `padCount`, the original
 * signature — gets exactly the geometry it always did.
 *
 *   crownBase   Bare every tip below this fraction of the crown's own
 *               vertical extent. A skeleton that branches low enough to read
 *               multi-stemmed also hangs foliage all the way down that low
 *               wood and buries the trunk it just built; on a garden tree the
 *               trunk is half the subject. This lifts the skirt WITHOUT
 *               raising `branches.start`, so the limb structure keeps its low
 *               fork and only the foliage moves.
 *
 *   layers      Horizontal PLATES: keep tips inside `count` bands across the
 *               crown height and bare the tips between them. Pad pruning
 *               (below) spaces masses isotropically, which is right for a
 *               cloud-pruned pine — a pine's pads are a 3D scatter. It is
 *               wrong for the layered broadleaves, whose signature is flat
 *               tiers with sky and limb showing BETWEEN them: an Acer
 *               palmatum, a dogwood, a Japanese hornbeam. Isotropic spacing
 *               can never produce that structure at any count, because the
 *               structure is anisotropic. Bands are placed edge to edge
 *               across the crown (the lowest sits at the crown base, the
 *               highest at the apex) so pruning never decapitates the tree.
 *
 *   padCount    Keep this many well-separated survivors by farthest-point
 *               sampling, seeded from the topmost tip, so kept pads spread
 *               over the whole crown instead of clumping. This is what makes
 *               a cloud-pruned pine possible at all.
 *
 * Every policy is a pure function of the skeleton: same tree, same pruning,
 * every build. Bared attachments use the existing `densityScale: 0` override,
 * which is already the documented way to strip a branch, so nothing new is
 * needed downstream. `densityBoost` multiplies the survivors' card counts, so
 * a crown can be restructured into plates at an unchanged card total instead
 * of simply losing the foliage the pruning removed.
 *
 * A caller's own override for an attachment always wins: pruning is a layout
 * policy, not an authority over explicit per-branch authoring.
 */
export function resolvePadPruning(attachments, options = null, existingOverrides = null) {
  const total = Array.isArray(attachments) ? attachments.length : 0;
  if (!total) return existingOverrides;

  // The original signature took the pad count positionally.
  const config = (options && typeof options === 'object') ? options : { padCount: options };
  const padCount = Number.isFinite(config.padCount) ? Math.round(config.padCount) : 0;
  const crownBase = Number.isFinite(config.crownBase)
    ? THREE.MathUtils.clamp(config.crownBase, 0, 0.95)
    : 0;
  const layers = config.layers && typeof config.layers === 'object' ? config.layers : null;
  const layerCount = layers && Number.isFinite(layers.count) ? Math.round(layers.count) : 0;
  const layerThickness = layers && Number.isFinite(layers.thickness)
    ? THREE.MathUtils.clamp(layers.thickness, 0.02, 1)
    : 0.5;
  const layerJitter = layers && Number.isFinite(layers.jitter)
    ? THREE.MathUtils.clamp(layers.jitter, 0, 1)
    : 0;
  const densityBoost = Number.isFinite(config.densityBoost)
    ? THREE.MathUtils.clamp(config.densityBoost, 0.1, 12)
    : 1;
  const hasHeightPolicy = crownBase > 0 || layerCount >= 2;
  const hasPadPolicy = padCount > 0 && padCount < total;
  if (!hasHeightPolicy && !hasPadPolicy && densityBoost === 1) return existingOverrides;

  let alive = new Array(total);
  for (let i = 0; i < total; i += 1) alive[i] = true;

  if (hasHeightPolicy) {
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < total; i += 1) {
      const { y } = attachments[i].position;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const span = Math.max(maxY - minY, 1e-4);
    // Crown height is measured on the attachments themselves, not on the
    // trunk anchor: it is the foliage envelope that is being restructured,
    // and a leaning or gnarled trunk makes anchor-relative height a
    // different quantity per variant.
    const heights = new Float64Array(total);
    for (let i = 0; i < total; i += 1) heights[i] = (attachments[i].position.y - minY) / span;

    if (crownBase > 0) {
      for (let i = 0; i < total; i += 1) if (heights[i] < crownBase) alive[i] = false;
    }

    if (layerCount >= 2) {
      // Re-normalize above the lifted skirt so the plates divide the foliage
      // that actually survives rather than the empty band below it.
      const base = crownBase > 0 ? crownBase : 0;
      const usable = Math.max(1 - base, 1e-4);
      const pitch = 1 / (layerCount - 1);
      const halfWidth = (layerThickness * pitch) / 2;
      const centres = new Float64Array(layerCount);
      for (let k = 0; k < layerCount; k += 1) {
        // Deterministic per-plate wobble: real tiers are not a comb.
        const wobble = layerJitter
          ? (Math.sin((k + 1) * 12.9898) * 43758.5453 % 1 + 1) % 1 - 0.5
          : 0;
        centres[k] = k * pitch + wobble * layerJitter * pitch;
      }
      for (let i = 0; i < total; i += 1) {
        if (!alive[i]) continue;
        const t = (heights[i] - base) / usable;
        let inside = false;
        for (let k = 0; k < layerCount; k += 1) {
          if (Math.abs(t - centres[k]) <= halfWidth) { inside = true; break; }
        }
        if (!inside) alive[i] = false;
      }
      // A band-pass that keeps nothing is a bug, not a style. Fall back to
      // the un-plated crown rather than shipping an invisible tree.
      if (!alive.some(Boolean)) alive = new Array(total).fill(true);
    }
  }

  if (hasPadPolicy) {
    const candidates = [];
    for (let i = 0; i < total; i += 1) if (alive[i]) candidates.push(i);
    if (candidates.length > padCount) {
      // Seed from the highest surviving tip: a garden tree's uppermost mass
      // is the one a viewer registers first, so it is never the one pruned.
      let firstSlot = 0;
      for (let s = 1; s < candidates.length; s += 1) {
        if (attachments[candidates[s]].position.y > attachments[candidates[firstSlot]].position.y) {
          firstSlot = s;
        }
      }
      const chosen = [firstSlot];
      const nearest = new Float64Array(candidates.length);
      for (let s = 0; s < candidates.length; s += 1) {
        nearest[s] = attachments[candidates[s]].position
          .distanceToSquared(attachments[candidates[firstSlot]].position);
      }
      nearest[firstSlot] = -1;
      while (chosen.length < padCount) {
        let best = -1;
        let bestDistance = -1;
        for (let s = 0; s < candidates.length; s += 1) {
          if (nearest[s] > bestDistance) { bestDistance = nearest[s]; best = s; }
        }
        if (best < 0 || bestDistance <= 0) break;
        chosen.push(best);
        nearest[best] = -1;
        for (let s = 0; s < candidates.length; s += 1) {
          if (nearest[s] < 0) continue;
          const distance = attachments[candidates[s]].position
            .distanceToSquared(attachments[candidates[best]].position);
          if (distance < nearest[s]) nearest[s] = distance;
        }
      }
      const keptSlots = new Set(chosen);
      for (let s = 0; s < candidates.length; s += 1) {
        if (!keptSlots.has(s)) alive[candidates[s]] = false;
      }
    }
  }

  const overrides = { ...(existingOverrides ?? {}) };
  for (let i = 0; i < total; i += 1) {
    if (overrides[i]) continue;
    if (!alive[i]) {
      overrides[i] = { densityScale: 0, cardsPerCluster: 0 };
    } else if (densityBoost !== 1) {
      overrides[i] = { densityScale: densityBoost };
    }
  }
  return overrides;
}

// Curved trunk along a seeded 3D spine. Returns { geometry, canopyAnchor }:
// the anchor is the spine's top, so the crown follows the trunk's lean.
//
// Shape parameters (all in meters / radians, defaults give a gentle lean):
//   bend  — mid-trunk bow that returns toward center (S-curve amplitude)
//   lean  — drift that accumulates toward the top (tree grows off vertical)
//   bendDirection — world heading of the bow in radians (default: seeded)
//   leanOffset    — lean heading relative to the bow; Math.PI pulls the top
//           exactly opposite the mid-bow, guaranteeing a serpentine S-trunk
//           (the Liyue gingko silhouette) instead of leaving it to seed luck
//   twist — Y-rotation of the cross-section over the full height; spirals
//           the bark texture like wrung wood
//   gnarl — extra high-frequency 3D wiggle + radius bulges; 0 is a clean
//           park tree, 1+ reads like an old bonsai
//   gnarlFrequencyXRange / gnarlFrequencyZRange — seeded min/max wave count
//           of the gnarl wiggle over the trunk height, per horizontal axis
//   gnarlAmplitude — meters of wiggle (and radius bulge fraction) per unit
//           of gnarl
//   radialGnarlFrequency — wave count of the radius bulges (old-wood
//           knuckles) over the trunk height
export function createTreeTrunkGeometry({
  height = 1.55,
  radiusBottom = 0.19,
  radiusTop = 0.085,
  radialSegments = 10,
  heightSegments = 14,
  bend = 0.12,
  lean = 0.16,
  twist = 0,
  gnarl = 0,
  gnarlFrequencyXRange = [4.2, 7.6],
  gnarlFrequencyZRange = [3.1, 6.7],
  gnarlAmplitude = 0.16,
  radialGnarlFrequency = 9.3,
  bendDirection = null,
  leanOffset = null,
  branchCount = 2,
  branchLength = 0.55,
  branchRadius = 0.055,
  seed = 1,
} = {}) {
  const rand = seededRandom(seed);
  const bendHeading = bendDirection ?? rand(1) * Math.PI * 2;
  const leanHeading = bendHeading + (leanOffset ?? (rand(3) - 0.5) * 2.6);
  const bendX = Math.cos(bendHeading);
  const bendZ = Math.sin(bendHeading);
  const leanX = Math.cos(leanHeading);
  const leanZ = Math.sin(leanHeading);
  const gnarlPhaseX = rand(7) * Math.PI * 2;
  const gnarlPhaseZ = rand(8) * Math.PI * 2;
  const gnarlFreqX = THREE.MathUtils.lerp(
    gnarlFrequencyXRange[0], gnarlFrequencyXRange[1], rand(9));
  const gnarlFreqZ = THREE.MathUtils.lerp(
    gnarlFrequencyZRange[0], gnarlFrequencyZRange[1], rand(10));

  // Mid-trunk bow returning toward center + accumulating lean + gnarl
  // wiggle on two independent horizontal axes (a 3D snake, not a 2D arc).
  // sin^2 bow: zero slope at the ground, so the base always leaves the dirt
  // vertical and the curve builds above the root flare.
  const bow = (t) => Math.sin(t * Math.PI) ** 2;
  const spineX = (t) => bendX * bow(t) * bend +
    leanX * t * t * lean +
    Math.sin(t * gnarlFreqX + gnarlPhaseX) * gnarl * gnarlAmplitude * Math.min(1, t * 3);
  const spineZ = (t) => bendZ * bow(t) * bend +
    leanZ * t * t * lean +
    Math.sin(t * gnarlFreqZ + gnarlPhaseZ) * gnarl * gnarlAmplitude * Math.min(1, t * 3);
  // Taper with optional gnarl bulges (old-wood knuckles).
  const radiusAt = (t) => THREE.MathUtils.lerp(radiusBottom, radiusTop, t) *
    (1 + Math.sin(t * radialGnarlFrequency + gnarlPhaseX) * gnarl * gnarlAmplitude);

  const trunk = new THREE.CylinderGeometry(1, 1, height, radialSegments, heightSegments);
  trunk.translate(0, height / 2, 0);
  const positions = trunk.attributes.position;
  const vertex = new THREE.Vector3();
  for (let i = 0; i < positions.count; i += 1) {
    vertex.fromBufferAttribute(positions, i);
    const t = THREE.MathUtils.clamp(vertex.y / height, 0, 1);
    const radius = radiusAt(t);
    const spin = twist * t;
    const x = vertex.x * radius;
    const z = vertex.z * radius;
    vertex.x = x * Math.cos(spin) - z * Math.sin(spin) + spineX(t);
    vertex.z = x * Math.sin(spin) + z * Math.cos(spin) + spineZ(t);
    positions.setXYZ(i, vertex.x, vertex.y, vertex.z);
  }
  trunk.computeVertexNormals();

  const pieces = [trunk];
  for (let i = 0; i < branchCount; i += 1) {
    const t = 0.6 + (i / Math.max(branchCount - 1, 1)) * 0.24;
    const length = branchLength * (0.8 + rand(20 + i) * 0.4);
    const radius = branchRadius * (0.85 + rand(30 + i) * 0.3);
    const tilt = (i % 2 === 0 ? 1 : -1) * (0.7 + (rand(40 + i) - 0.5) * 0.3);
    const branch = new THREE.CylinderGeometry(radius * 0.55, radius, length, 7);
    branch.translate(0, length / 2, 0);
    branch.rotateZ(tilt);
    branch.rotateY(seed * 2.1 + i * 2.4);
    branch.translate(spineX(t), t * height, spineZ(t));
    pieces.push(branch);
  }

  const merged = mergeGeometries(pieces);
  pieces.forEach((piece) => piece.dispose());
  return {
    geometry: merged,
    canopyAnchor: new THREE.Vector3(spineX(1), height + 0.42, spineZ(1)),
  };
}

// Tree skeleton grown by SPACE COLONIZATION (Runions et al. 2007) — the same
// family of growth algorithms behind SpeedTree/ToonLab-style foliage. Attraction
// points fill the crown volume (the blob layout); the trunk grows toward
// them, forking and curving organically wherever points pull in different
// directions; branch radii follow the pipe model (a parent's cross-section
// carries its children's), so the trunk tapers into limbs into twigs instead
// of a straight pole with stubs. Returns:
//   geometry     — merged bark mesh (trunk + every limb and twig)
//   canopyAnchor — crown center in trunk space (where the canopy mesh goes)
//   attachments  — twig tips in CANOPY-LOCAL space; feed to
//                  createTreeFoliageGeometry so each leaf tuft grows off wood
// Trunk style (bend/lean/twist/gnarl from TREE_TRUNK_STYLES) is applied as a
// post-growth deform of the whole skeleton, so bonsai twists carry the crown
// with them.
export function createTreeSkeleton({
  trunk = {},
  blobs = TREE_FOLIAGE_BLOBS,
  canopyScale = 0.85,
  // Growth controls (trunk-space meters). Tuned for MAJOR LIMBS ONLY:
  // Modern anime-style trees show a trunk forking into a few clean limbs that
  // vanish into a solid leaf mass — never an interior twig lattice (interior
  // twigs only poke through the foliage as dark clutter).
  attractionCount = 90,
  segmentLength = 0.3,
  influenceRadius = 1.2,
  killRadius = 0.42,
  maxSteps = 48,
  maxNodes = 140,
  // Bark mesh controls.
  radialSegments = 8,
  tipRadius = 0.03,
  minLimbRadius = 0.028,     // twigs thinner than this are left to the leaves
  attachmentTwigRadius = 0.09, // nodes thinner than this sprout leaf tufts
  // 'canopy' (default) dresses every crown-interior limb so the crown reads
  // as one solid leaf mass. 'tips' puts leaves ONLY at the branch ends —
  // limbs grow farther out and stay bare, ending in bushes (the Sumeru
  // bare-branch silhouette). Pair with the canopy's shellFill: false.
  leafPlacement = 'canopy',
  // How deep into each blob attraction points sample (fraction of blob
  // radius). Default keeps limbs buried in the leaf mass; 'tips' reaches
  // near the shell so bare limbs stretch visibly before their end bush.
  attractionReach = null,
  seed = 1,
} = {}) {
  const {
    height = 1.55,
    radiusBottom = 0.19,
    bend = 0.12,
    lean = 0.16,
    twist = 0,
    gnarl = 0,
    bendDirection: bendHeadingOption = null,
    leanOffset = null,
  } = trunk;
  const rand = seededRandom(seed * 1.93 + 4.7);
  const anchorY = height + 0.42;

  // Attraction points: uniform inside the blob volumes, in trunk space.
  const blobWeights = blobs.map((blob) => blob.radius ** 3);
  const totalWeight = blobWeights.reduce((sum, w) => sum + w, 0);
  const points = [];
  for (let i = 0; i < attractionCount; i += 1) {
    let pick = rand(i * 3.1) * totalWeight;
    let blobIndex = 0;
    while (pick > blobWeights[blobIndex] && blobIndex < blobs.length - 1) {
      pick -= blobWeights[blobIndex];
      blobIndex += 1;
    }
    const blob = blobs[blobIndex];
    const theta = rand(i * 3.1 + 1) * Math.PI * 2;
    const cosPhi = rand(i * 3.1 + 2) * 2 - 1;
    const sinPhi = Math.sqrt(Math.max(0, 1 - cosPhi * cosPhi));
    // Sample well inside the blob so limbs never poke out of the leaf mass
    // (near the shell in tips mode, so bare limbs reach out to their bush).
    const reach = attractionReach ?? (leafPlacement === 'tips' ? 0.92 : 0.65);
    const radius = blob.radius * reach * Math.cbrt(rand(i * 7.7));
    points.push(new THREE.Vector3(
      (Math.cos(theta) * sinPhi * radius + blob.offset[0]) * canopyScale,
      (cosPhi * radius + blob.offset[1]) * canopyScale + anchorY,
      (Math.sin(theta) * sinPhi * radius + blob.offset[2]) * canopyScale,
    ));
  }

  // Grow. Each node: { position, direction, parent, childCount }.
  const nodes = [{
    position: new THREE.Vector3(0, 0, 0),
    direction: new THREE.Vector3(0, 1, 0),
    parent: -1,
    childCount: 0,
    depth: 0,
  }];
  const centroid = new THREE.Vector3();
  const accumulator = nodes.map(() => new THREE.Vector3());
  const spawn = (parentIndex, direction, stepKey) => {
    const parent = nodes[parentIndex];
    // Smoothness is a style choice: gnarl 0 grows clean elegant curves
    // (swooping Liyue-style trunks), higher gnarl grows knotted wood.
    const jitter = new THREE.Vector3(
      rand(stepKey) - 0.5, (rand(stepKey + 1) - 0.5) * 0.5, rand(stepKey + 2) - 0.5,
    ).multiplyScalar(0.08 + gnarl * 0.55);
    const grown = direction.clone().add(jitter).normalize();
    nodes.push({
      position: parent.position.clone().addScaledVector(grown, segmentLength),
      direction: grown,
      parent: parentIndex,
      childCount: 0,
      depth: parent.depth + 1,
    });
    parent.childCount += 1;
    accumulator.push(new THREE.Vector3());
  };

  for (let step = 0; step < maxSteps && points.length > 6 && nodes.length < maxNodes; step += 1) {
    accumulator.forEach((a) => a.set(0, 0, 0));
    const influenced = new Array(nodes.length).fill(0);
    let anyInfluence = false;
    for (const point of points) {
      let nearest = -1;
      let nearestDistance = influenceRadius;
      for (let n = 0; n < nodes.length; n += 1) {
        const distance = point.distanceTo(nodes[n].position);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = n;
        }
      }
      if (nearest >= 0) {
        accumulator[nearest].add(
          point.clone().sub(nodes[nearest].position).normalize());
        influenced[nearest] += 1;
        anyInfluence = true;
      }
    }

    if (!anyInfluence) {
      // Bootstrap: no point in reach yet — extend the highest tip toward the
      // remaining crown mass (this is what forms the lower bole).
      centroid.set(0, 0, 0);
      points.forEach((p) => centroid.add(p));
      centroid.divideScalar(points.length);
      let top = 0;
      nodes.forEach((node, index) => {
        if (node.position.y > nodes[top].position.y) top = index;
      });
      spawn(top, centroid.clone().sub(nodes[top].position).normalize(), step * 13.7);
      continue;
    }

    const nodeCount = nodes.length;
    for (let n = 0; n < nodeCount && nodes.length < maxNodes; n += 1) {
      if (!influenced[n]) continue;
      // Slight upward bias keeps growth arching instead of drooping.
      const direction = accumulator[n].divideScalar(influenced[n])
        .addScaledVector(nodes[n].direction, 0.35)
        .add(new THREE.Vector3(0, 0.08, 0));
      spawn(n, direction.normalize(), step * 13.7 + n * 3.3);
    }

    for (let p = points.length - 1; p >= 0; p -= 1) {
      for (let n = nodeCount; n < nodes.length; n += 1) {
        if (points[p].distanceTo(nodes[n].position) < killRadius) {
          points.splice(p, 1);
          break;
        }
      }
    }
  }

  // Pipe-model radii: tips are thin; a parent's cross-section carries the
  // sum of its children's. Normalized so the root hits radiusBottom.
  const radii = new Float32Array(nodes.length).fill(0);
  for (let n = nodes.length - 1; n >= 0; n -= 1) {
    if (radii[n] === 0) radii[n] = tipRadius;
    const parent = nodes[n].parent;
    if (parent >= 0) {
      radii[parent] = (radii[parent] ** 2.4 + radii[n] ** 2.4) ** (1 / 2.4);
    }
  }
  const rootScale = radiusBottom / Math.max(radii[0], 1e-4);
  radii[0] = radiusBottom;
  // Strict taper: every child is thinner than its parent, so the trunk
  // always narrows toward the top and no branch ends in a thick stump.
  // (nodes are topologically ordered — a parent always precedes its children)
  for (let n = 1; n < nodes.length; n += 1) {
    radii[n] = THREE.MathUtils.clamp(
      radii[n] * rootScale, tipRadius * 0.8, radii[nodes[n].parent] * 0.9);
  }

  // Post-growth style deform: bow + lean + twist over height, so bonsai
  // trunks corkscrew and the crown rides along.
  const bendDirection = bendHeadingOption ?? rand(1) * Math.PI * 2;
  const leanDirection = bendDirection + (leanOffset ?? (rand(3) - 0.5) * 2.6);
  const deform = (position) => {
    // Clamped at the anchor height: nodes inside the crown displace exactly
    // like the crown itself, so limbs can never shear out of the leaf mass.
    const t = THREE.MathUtils.clamp(position.y / anchorY, 0, 1);
    const spin = twist * t;
    const x = position.x * Math.cos(spin) - position.z * Math.sin(spin);
    const z = position.x * Math.sin(spin) + position.z * Math.cos(spin);
    // sin^2 bow (vertical at the ground) + accumulating lean.
    const bowAmount = Math.sin(t * Math.PI) ** 2 * bend;
    position.x = x + Math.cos(bendDirection) * bowAmount +
      Math.cos(leanDirection) * t * t * lean;
    position.z = z + Math.sin(bendDirection) * bowAmount +
      Math.sin(leanDirection) * t * t * lean;
    return position;
  };
  const anchor = deform(new THREE.Vector3(0, anchorY, 0));

  // Bark mesh: one tapered tube per edge, ends overlapped to hide joints.
  // Built in growth space, then every VERTEX runs through the style deform —
  // with several rings per tube a strong swooping S bends the wood smoothly
  // instead of kinking a polyline at the node joints.
  const up = new THREE.Vector3(0, 1, 0);
  // Where does VISIBLE wood end? A node whose children are all below
  // minLimbRadius is a wood tip even though the skeleton continues — its
  // subtree gets no tubes. Those ends must taper (not stop at a sawn-off
  // cap) and, in tips mode, they are where the bushes belong.
  const hasWood = nodes.map((_, n) => n > 0 && radii[n] >= minLimbRadius);
  const hasWoodenChild = new Array(nodes.length).fill(false);
  for (let n = 1; n < nodes.length; n += 1) {
    if (hasWood[n]) hasWoodenChild[nodes[n].parent] = true;
  }
  const pieces = [];
  for (let n = 1; n < nodes.length; n += 1) {
    const node = nodes[n];
    const parent = nodes[node.parent];
    const direction = node.position.clone().sub(parent.position);
    const length = direction.length();
    if (length < 1e-4) continue;
    direction.divideScalar(length);

    if (hasWood[n]) {
      const overlap = radii[n] * 0.8;
      // Wood ends (no tube continues past this node) taper to a point
      // instead of a sawn-off cap.
      const topRadius = hasWoodenChild[n] ? radii[n] : tipRadius * 0.4;
      const heightSegments = THREE.MathUtils.clamp(
        Math.round((length + overlap) / 0.1), 2, 6);
      const segment = new THREE.CylinderGeometry(
        topRadius, radii[node.parent], length + overlap, radialSegments, heightSegments);
      segment.translate(0, (length + overlap) / 2, 0);
      // Tile bark along the branch instead of stretching one texture per
      // segment (keeps bark grain consistent from bole to twig).
      const uv = segment.attributes.uv;
      for (let i = 0; i < uv.count; i += 1) {
        uv.setY(i, uv.getY(i) * (length + overlap) * 2.2);
      }
      segment.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, direction));
      segment.translate(parent.position.x, parent.position.y, parent.position.z);
      pieces.push(segment);
    }
  }
  const geometry = mergeGeometries(pieces);
  pieces.forEach((piece) => piece.dispose());
  const barkPositions = geometry.attributes.position;
  const barkVertex = new THREE.Vector3();
  for (let i = 0; i < barkPositions.count; i += 1) {
    barkVertex.fromBufferAttribute(barkPositions, i);
    deform(barkVertex);
    barkPositions.setXYZ(i, barkVertex.x, barkVertex.y, barkVertex.z);
  }
  geometry.computeVertexNormals();

  // Leaves dress (in deformed space): thin limb sections, every terminal
  // node (a thick limb that stops growing must still end in a puff, never a
  // bare stub), and ANY wood inside the crown volume — a thick limb arcing
  // through the canopy gets covered like everything else. Deduped so puffs
  // stay chunky rather than smeared.
  nodes.forEach((node) => deform(node.position));
  const attachments = [];
  const blobLocals = blobs.map((blob) => ({
    center: new THREE.Vector3(blob.offset[0], blob.offset[1], blob.offset[2]),
    radius: blob.radius,
  }));
  for (let n = 1; n < nodes.length; n += 1) {
    const node = nodes[n];
    const parent = nodes[node.parent];
    const direction = node.position.clone().sub(parent.position);
    if (direction.lengthSq() < 1e-8) continue;
    direction.normalize();
    const local = node.position.clone().sub(anchor).divideScalar(canopyScale);
    const insideCrown = blobLocals.some(
      (blob) => local.distanceTo(blob.center) < blob.radius * 0.85);
    // 'tips': branch ends carry leaves and mid-limb wood stays bare — but
    // only OUTSIDE the crown volume. Interior limb runs cresting through the
    // upper canopy read as floating debris between the clouds, so they get
    // dressed like canopy mode; the low sitting limbs stay naked. The end
    // that matters is the end of VISIBLE wood: a bush on a culled
    // (tube-less) twig node would float a full segment past the bark.
    const wantsLeaves = leafPlacement === 'tips'
      ? hasWood[n] && (!hasWoodenChild[n] || insideCrown)
      : (radii[n] <= attachmentTwigRadius || node.childCount === 0 || insideCrown);
    if (wantsLeaves) {
      // Tips mode spaces bushes far apart so bare limb runs stay visible
      // between them instead of the clouds merging into one solid crown.
      const spacing = leafPlacement === 'tips' ? 0.85 : 0.4;
      const near = attachments.find((a) => a.position.distanceTo(local) < spacing);
      if (!near) {
        attachments.push({
          position: local,
          direction,
          tangent: direction.clone(),
          depth: node.depth,
          normalizedHeight: THREE.MathUtils.clamp(node.position.y / Math.max(anchorY, 1e-4), 0, 1),
          branchRadius: radii[n] / Math.max(canopyScale, 1e-4),
          azimuth: Math.atan2(direction.z, direction.x),
          merged: 1,
        });
      } else if (leafPlacement === 'tips' && !hasWoodenChild[n]) {
        // A crowded tip must still end inside foliage — dropping it leaves
        // its bark stub floating bare past the neighbor's cloud. Merge it
        // into that cloud by re-centering on the running average of tips.
        // (Crowded INTERIOR nodes are simply dropped — pulling a shared
        // bush off the tips it guards would expose them instead.)
        near.merged += 1;
        near.position.lerp(local, 1 / near.merged);
        near.direction.lerp(direction, 1 / near.merged).normalize();
      }
    }
  }
  // Degenerate seeds can theoretically end twigless; keep the contract.
  if (!attachments.length) {
    attachments.push({
      position: new THREE.Vector3(0, 0, 0),
      direction: up.clone(),
      tangent: up.clone(),
      depth: 0,
      normalizedHeight: 1,
      branchRadius: tipRadius,
      azimuth: 0,
    });
  }

  return { geometry, canopyAnchor: anchor, attachments };
}

// Tapered bark tube swept along an arbitrary 3D polyline (hand-drawn branch
// strokes from Tree Lab, scripted limbs, roots). Returns
// { geometry, tip, tipTangent } — tip/tipTangent are where a leaf tuft
// belongs — or null for degenerate input.
//   points — [[x, y, z], ...] in tree-local space (pre-`size` scale)
export function createBranchTubeGeometry({
  points = [],
  radiusStart = 0.07,
  radiusEnd = 0.02,
  radialSegments = 7,
  ringSpacing = 0.09,
  // Organic cross-section: two low harmonics warp each ring away from a
  // perfect circle (real trunks never are), drifting in phase along the
  // run for a gentle twist. 0 restores exact circles.
  irregularity = 0.14,
  // Grounded stems: widen the first rings into a root flare so the base
  // reads as growing FROM the ground instead of resting on it.
  flareBase = false,
  // Custom cross-section: radius multiplier per ring angle (from a drawn
  // outline via polarProfileFromOutline). Overrides the circular profile;
  // the organic warp still applies on top.
  profile = null,
  seed = 5,
} = {}) {
  // Near-duplicate consecutive points produce degenerate tangents (the real
  // sweep failure mode) — drop them before curve construction.
  const filtered = [];
  for (const point of points) {
    const vector = Array.isArray(point)
      ? new THREE.Vector3(point[0], point[1], point[2])
      : new THREE.Vector3(point.x, point.y, point.z);
    if (!filtered.length || filtered[filtered.length - 1].distanceToSquared(vector) > 1e-6) {
      filtered.push(vector);
    }
  }
  if (filtered.length < 2) return null;

  // Centripetal parameterization avoids the cusps/loops uniform Catmull-Rom
  // produces on unevenly spaced sketch points; three's computeFrenetFrames
  // already minimizes rotation between rings, so no hand-rolled RMF.
  const curve = new THREE.CatmullRomCurve3(filtered, false, 'centripetal');
  const length = curve.getLength();
  if (length < 1e-3) return null;
  const segments = Math.max(3, Math.ceil(length / ringSpacing));
  const frames = curve.computeFrenetFrames(segments, false);

  const ringVertices = radialSegments + 1; // duplicated seam column for UVs
  // Grid vertices + 2 cap centers (base + tip): tubes must read as SOLID
  // wood — an open base ring shows the hollow interior the moment the
  // camera looks up the trunk.
  const gridCount = (segments + 1) * ringVertices;
  const positions = new Float32Array((gridCount + 2) * 3);
  const normals = new Float32Array((gridCount + 2) * 3);
  const uvs = new Float32Array((gridCount + 2) * 2);

  const phase1 = seed * 1.7;
  const phase2 = seed * 2.9 + 1.1;
  const center = new THREE.Vector3();
  const radial = new THREE.Vector3();
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    curve.getPointAt(t, center);
    // Taper along the run, closing to a near-point tip (the trunk-tip
    // convention) instead of a sawn-off cap.
    let radius = i === segments
      ? radiusEnd * 0.3
      : THREE.MathUtils.lerp(radiusStart, radiusEnd, t);
    if (flareBase) {
      const flareT = Math.min(t / 0.16, 1);
      radius *= 1 + 0.45 * (1 - flareT * flareT * (3 - 2 * flareT));
    }
    for (let j = 0; j <= radialSegments; j += 1) {
      const theta = (j / radialSegments) * Math.PI * 2;
      // Seam column (j === radialSegments) must warp exactly like j === 0.
      const warpTheta = (j % radialSegments) / radialSegments * Math.PI * 2;
      let warp = 1 + irregularity * (
        0.6 * Math.sin(3 * warpTheta + phase1 + t * 2.1)
        + 0.4 * Math.sin(5 * warpTheta + phase2 - t * 1.4));
      if (profile) {
        const slot = (warpTheta / (Math.PI * 2)) * profile.length;
        const i0 = Math.floor(slot) % profile.length;
        const i1 = (i0 + 1) % profile.length;
        warp *= THREE.MathUtils.lerp(profile[i0], profile[i1], slot - Math.floor(slot));
      }
      radial.copy(frames.normals[i]).multiplyScalar(Math.cos(theta))
        .addScaledVector(frames.binormals[i], Math.sin(theta));
      const out = (i * ringVertices + j) * 3;
      const r = radius * warp;
      positions[out] = center.x + radial.x * r;
      positions[out + 1] = center.y + radial.y * r;
      positions[out + 2] = center.z + radial.z * r;
      normals[out] = radial.x;
      normals[out + 1] = radial.y;
      normals[out + 2] = radial.z;
      const uvOut = (i * ringVertices + j) * 2;
      uvs[uvOut] = j / radialSegments;
      // Tile bark along the branch (same 2.2/meter convention as the
      // skeleton's limb tubes) instead of stretching one texture per branch.
      uvs[uvOut + 1] = t * length * 2.2;
    }
  }

  // Cap centers: base (t=0) and tip (t=1), normals along ∓tangent.
  const baseCenterIndex = gridCount;
  const tipCenterIndex = gridCount + 1;
  const baseCenter = curve.getPointAt(0);
  const tipCenter = curve.getPointAt(1);
  const baseTangent = curve.getTangentAt(0);
  const tipTangentVector = curve.getTangentAt(1);
  positions.set([baseCenter.x, baseCenter.y, baseCenter.z], baseCenterIndex * 3);
  positions.set([tipCenter.x, tipCenter.y, tipCenter.z], tipCenterIndex * 3);
  normals.set([-baseTangent.x, -baseTangent.y, -baseTangent.z], baseCenterIndex * 3);
  normals.set([tipTangentVector.x, tipTangentVector.y, tipTangentVector.z], tipCenterIndex * 3);
  uvs.set([0.5, 0], baseCenterIndex * 2);
  uvs.set([0.5, 1], tipCenterIndex * 2);

  const indexList = [];
  for (let i = 0; i < segments; i += 1) {
    for (let j = 0; j < radialSegments; j += 1) {
      const a = i * ringVertices + j;
      const b = a + ringVertices;
      indexList.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  // Cap fans (base winds toward -tangent, tip toward +tangent).
  for (let j = 0; j < radialSegments; j += 1) {
    indexList.push(baseCenterIndex, j + 1, j);
    const tipRing = segments * ringVertices;
    indexList.push(tipCenterIndex, tipRing + j, tipRing + j + 1);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indexList), 1));
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return {
    geometry,
    tip: curve.getPointAt(1),
    tipTangent: curve.getTangentAt(1),
  };
}

// Recursive central-leader tree skeleton (open broadleaf silhouettes):
// the trunk runs the full height as a leader, child branches sprout along
// it at golden-angle azimuths, and each level subdivides into shorter,
// thinner children. Foliage attachments are distributed along the OUTER
// branches (not one puff per crown), giving the open, airy broadleaf
// silhouette that blob crowns can't make. Same return contract as
// createTreeSkeleton — { geometry, canopyAnchor, attachments } — so
// StylizedTree swaps generators via skeleton.generator.
//   levels           — recursion depth (1..4)
//   childrenPerBranch— average children sprouting along each parent
//   lengthRatio      — child length as a fraction of its parent
//   radiusRatio      — child radius as a fraction of its parent
//   spreadAngle      — radians a child angles away from its parent
//   upBias           — gravitropism per growth step (negative droops)
// Recursive branching skeleton for open, realistic silhouettes, built on
// classic procedural-botany techniques (random-walk branch wander, tropism
// growth forces, stratified attachment sampling — the Weber & Penn lineage)
// and restyled for toon foliage. Branches
// are tubes of rings whose orientation evolves per section, which is where
// the organic quality comes from:
//   1. gnarliness — a random walk on the ring orientation whose amplitude
//      grows as branches thin (max(1, sqrt(r0/r))): trunks stay stately,
//      twigs wander.
//   2. growth force — every section steers toward a global direction with
//      compliance 1/radius, clamped so it never overshoots. Positive
//      strength sweeps tips skyward into a rounded broadleaf crown;
//      negative droops them (pines, willows).
//   3. terminal continuation — a parent's last ring spawns the next level
//      IN PLACE with the same segment count, so the trunk flows into a
//      leader instead of ending in a stump; only the deepest level pinches.
//   4. stratified children/leaves — attach points are jittered within even
//      slots along the parent (and around it, with a shuffled azimuth
//      permutation), starting at a bare `branchStart` fraction: even
//      coverage, no clumps, no spirals.
// Foliage is OUR leaf-card system: attachments stratified along the deepest
// branches plus every terminal tip.
//   conifer    — evergreen behavior: full taper, child length scaled by
//                (1 - attach fraction) → the layered cone silhouette
//   trunkSpine — optional hand-drawn trunk polyline (tree-local): level-0
//                rings follow the doodle, children grow off it procedurally
export function createBranchingTreeSkeleton({
  trunk = {},
  seed = 1,
  canopyScale = 0.85,
  levels = 3,
  childrenCount = 6,
  branchAngle = 55,
  branchStart = 0.4,
  lengthRatio = 0.45,
  radiusRatio = 0.7,
  gnarliness = 0.15,
  forceStrength = 0.02,
  conifer = false,
  trunkSpine = null,
  radialSegments = 8,
  meshSectionStride = 1,
  meshLevelLimit = Infinity,
  tipRadius = 0.012,
  maxBranches = 420,
  leafSpacing = 0.3,
  leafStart = 0.15,
  maxAttachments = 380,
} = {}) {
  const {
    height = 1.55,
    radiusBottom = 0.19,
    radiusTop = Math.max(radiusBottom * 0.32, 0.012),
    bend = 0,
    twist = 0,
    gnarl = 0,
    lean = 0,
    // World heading of the bow, and the lean heading relative to it — the same
    // meaning they carry on the space-colonization generator. Without them a
    // stand of wind-shaped trees leans a different way per seed, which reads
    // as damage rather than as wind. null keeps the historical seeded pick.
    bendDirection = null,
    leanOffset = null,
  } = trunk;
  const rand = seededRandom(seed * 4.87 + 2.3);
  let randKey = 0;
  const next = () => rand((randKey += 1) * 1.93);
  const range = (max, min = 0) => min + next() * (max - min);

  const maxLevel = THREE.MathUtils.clamp(Math.round(levels), 1, 4);
  const spinePoints = Array.isArray(trunkSpine) && trunkSpine.length >= 2
    ? trunkSpine.map((p) => new THREE.Vector3(p[0], p[1], p[2]))
    : null;
  const trunkLength = spinePoints
    ? spinePoints.reduce((sum, p, i) => (i ? sum + p.distanceTo(spinePoints[i - 1]) : 0), 0)
    : height;

  // Per-level tables derived from the flat sliders (recipes stay compact;
  // the curves echo real broadleaf proportions).
  const degToRad = THREE.MathUtils.degToRad;
  const lengths = [trunkLength, trunkLength * lengthRatio,
    trunkLength * lengthRatio * 0.75, trunkLength * lengthRatio * 0.3];
  const childCounts = [Math.max(1, Math.round(childrenCount)),
    Math.max(2, Math.round(childrenCount * 0.6)), 3, 0];
  const angles = [0, degToRad(branchAngle),
    degToRad(Math.min(85, branchAngle * 1.05)), degToRad(branchAngle * 0.6)];
  const starts = [0, THREE.MathUtils.clamp(branchStart, 0, 0.9), 0.25, 0.15];
  const gnarlLevels = [gnarliness * 0.25 + gnarl * 0.08, gnarliness,
    gnarliness * 1.2, gnarliness * 0.7];
  const tapers = conifer ? [1, 1, 1, 1] : [0.72, 0.68, 0.78, 0.88];
  const sectionCounts = [10, 7, 5, 4];
  // Radial detail must remain authored per LOD all the way into the twig
  // hierarchy. Historic hard minimums of 6/5/4/4 meant compiler requests
  // for 5- or 3-sided branch tubes changed only the trunk and barely reduced
  // triangles. Three sides is the safe volumetric floor; LOD0 still uses the
  // supplied 8-sided profile while LOD1/2 can halve branch cost without
  // moving a single centerline or foliage attachment.
  const segmentCounts = [Math.max(3, radialSegments),
    Math.max(3, radialSegments - 2), Math.max(3, radialSegments - 4), 3];

  // Shared tube builder state (one merged geometry for all branches).
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  const rawAttachments = [];
  let branchBudget = maxBranches;

  const UP = new THREE.Vector3(0, 1, 0);
  const workVector = new THREE.Vector3();
  const workAxis = new THREE.Vector3();
  const workQuaternion = new THREE.Quaternion();
  // The bow's world heading. Tilting about a horizontal axis displaces the
  // trunk 90° away from that axis, so an authored heading is stored rotated
  // back by a quarter turn — that way `bendDirection` means "the direction the
  // trunk bows toward", identical to the space-colonization generator.
  const seededBendHeading = seededRandom(seed * 9.17 + 4.3)(17) * Math.PI * 2;
  const trunkBowHeading = bendDirection == null
    ? seededBendHeading + Math.PI / 2
    : bendDirection;
  const trunkBendAxisHeading = trunkBowHeading - Math.PI / 2;
  const trunkBendAxis = new THREE.Vector3(
    Math.cos(trunkBendAxisHeading),
    0,
    Math.sin(trunkBendAxisHeading),
  );

  // { origin, quaternion, length, radius, level, segments } — BFS like EZ.
  const queue = [];

  const buildBranch = (branch) => {
    const level = branch.level;
    const table = Math.min(level, 3);
    const sectionCount = sectionCounts[table];
    const segments = branch.segments ?? segmentCounts[table];
    const taper = tapers[table];
    const sectionLength = branch.length / sectionCount;
    const isLeafLevel = level >= maxLevel;

    const origin = branch.origin.clone();
    const orientation = branch.quaternion.clone();
    const rings = [];

    // Hand-drawn trunk: rings follow the doodle polyline instead of the
    // procedural walk; children still attach along it like any branch.
    const spine = level === 0 ? spinePoints : null;
    const spineSampler = spine ? (fraction) => {
      const total = trunkLength * fraction;
      let acc = 0;
      for (let i = 1; i < spine.length; i += 1) {
        const span = spine[i].distanceTo(spine[i - 1]);
        if (acc + span >= total || i === spine.length - 1) {
          const local = THREE.MathUtils.clamp((total - acc) / Math.max(span, 1e-6), 0, 1);
          return {
            point: spine[i - 1].clone().lerp(spine[i], local),
            tangent: spine[i].clone().sub(spine[i - 1]).normalize(),
          };
        }
        acc += span;
      }
      return { point: spine[spine.length - 1].clone(), tangent: UP.clone() };
    } : null;

    for (let i = 0; i <= sectionCount; i += 1) {
      const t = i / sectionCount;
      let ringRadius = i === sectionCount && isLeafLevel
        ? tipRadius * 0.3
        : Math.max(tipRadius * 0.5, branch.radius * (1 - taper * t));
      if (level === 0 && !spineSampler) {
        ringRadius = THREE.MathUtils.lerp(
          radiusBottom,
          Math.max(radiusTop, tipRadius * 0.5),
          t,
        );
      }

      if (spineSampler) {
        const sample = spineSampler(t);
        origin.copy(sample.point);
        workQuaternion.setFromUnitVectors(UP, sample.tangent);
        orientation.copy(workQuaternion);
      }
      const ringQuaternion = orientation.clone();
      if (level === 0 && !spineSampler && twist) {
        ringQuaternion.multiply(new THREE.Quaternion().setFromAxisAngle(UP, twist * t));
      }
      rings.push({
        origin: origin.clone(),
        quaternion: ringQuaternion,
        radius: ringRadius,
      });

      if (i === sectionCount) break;

      if (!spineSampler) {
        // Advance the growth state — the core growth loop.
        workVector.set(0, sectionLength, 0).applyQuaternion(orientation);
        origin.add(workVector);

        // BranchTree's portable trunk bend is a deliberate world-space arc,
        // independent of the thin-branch random walk below. Apply it only to
        // the load-bearing level-0 leader so child/twig gnarliness does not
        // reinterpret the authored trunk silhouette.
        if (level === 0 && bend) {
          workQuaternion.setFromAxisAngle(trunkBendAxis, bend / sectionCount);
          orientation.premultiply(workQuaternion);
        }

        // 1. Gnarliness random walk, amplified as the branch thins.
        const wobble = gnarlLevels[table] *
          Math.max(1, Math.sqrt(radiusBottom / Math.max(ringRadius, 1e-4)));
        workQuaternion.setFromAxisAngle(
          workAxis.set(1, 0, 0), range(wobble, -wobble));
        orientation.multiply(workQuaternion);
        workQuaternion.setFromAxisAngle(
          workAxis.set(0, 0, 1), range(wobble, -wobble));
        orientation.multiply(workQuaternion);

        // 2. Growth force: steer toward straight up with 1/radius
        //    compliance, clamped so thin twigs never overshoot. Negative
        //    strength pushes away (droop).
        workVector.copy(UP).applyQuaternion(orientation);
        workAxis.crossVectors(workVector, UP);
        const sinFull = workAxis.length();
        if (sinFull > 1e-6) {
          const fullAngle = Math.atan2(sinFull, workVector.dot(UP));
          const step = THREE.MathUtils.clamp(
            forceStrength * (radiusBottom / Math.max(ringRadius, 1e-3)),
            -fullAngle, fullAngle);
          workQuaternion.setFromAxisAngle(workAxis.divideScalar(sinFull), step);
          orientation.premultiply(workQuaternion);
        }
      }
    }

    // LOD meshes retain every procedural centerline and attachment, but may
    // emit fewer longitudinal rings. This is materially different from
    // deleting disconnected tube components: every retained branch remains
    // continuous from base to tip and the tree does not change shape.
    if (level <= meshLevelLimit) {
      const stride = Math.max(1, Math.round(meshSectionStride));
      const retainedRings = [];
      for (let ringIndex = 0; ringIndex <= sectionCount; ringIndex += stride) {
        retainedRings.push(ringIndex);
      }
      if (retainedRings[retainedRings.length - 1] !== sectionCount) {
        retainedRings.push(sectionCount);
      }
      const vertexBase = positions.length / 3;
      for (const ringIndex of retainedRings) {
        const ring = rings[ringIndex];
        for (let j = 0; j <= segments; j += 1) {
          const angle = (j / segments) * Math.PI * 2;
          workVector.set(Math.cos(angle), 0, Math.sin(angle));
          workVector.applyQuaternion(ring.quaternion);
          normals.push(workVector.x, workVector.y, workVector.z);
          positions.push(
            ring.origin.x + workVector.x * ring.radius,
            ring.origin.y + workVector.y * ring.radius,
            ring.origin.z + workVector.z * ring.radius,
          );
          uvs.push(j / segments, branch.length * (ringIndex / sectionCount) * 2.2);
        }
      }
      for (let ring = 0; ring < retainedRings.length - 1; ring += 1) {
        for (let j = 0; j < segments; j += 1) {
          const a = vertexBase + ring * (segments + 1) + j;
          const b = a + segments + 1;
          indices.push(a, b, a + 1, b, b + 1, a + 1);
        }
      }
    }

    // Ring sampling for children/leaves (position + orientation + radius
    // interpolated between the bracketing rings).
    const ringAt = (fraction) => {
      const scaled = fraction * sectionCount;
      const index = Math.min(Math.floor(scaled), sectionCount - 1);
      const alpha = scaled - index;
      const a = rings[index];
      const b = rings[index + 1];
      return {
        origin: a.origin.clone().lerp(b.origin, alpha),
        quaternion: a.quaternion.clone().slerp(b.quaternion, alpha),
        radius: THREE.MathUtils.lerp(a.radius, b.radius, alpha),
      };
    };

    if (isLeafLevel) {
      // Leaves live on the deepest level: stratified along [leafStart, 1]
      // plus one at the pinched tip — the open along-the-branch foliage.
      const usable = branch.length * (1 - leafStart);
      const leafCount = THREE.MathUtils.clamp(Math.round(usable / leafSpacing), 1, 4);
      for (let i = 0; i < leafCount; i += 1) {
        if (rawAttachments.length >= maxAttachments) break;
        const fraction = leafStart + ((i + next()) / leafCount) * (1 - leafStart);
        const ring = ringAt(Math.min(fraction, 1));
        const direction = UP.clone().applyQuaternion(ring.quaternion);
        rawAttachments.push({
          position: ring.origin,
          direction,
          tangent: direction.clone(),
          depth: level,
          normalizedHeight: THREE.MathUtils.clamp(ring.origin.y / Math.max(trunkLength, 1e-4), 0, 1),
          branchRadius: ring.radius,
          azimuth: Math.atan2(direction.z, direction.x),
        });
      }
      if (rawAttachments.length < maxAttachments) {
        const tip = rings[rings.length - 1];
        const direction = UP.clone().applyQuaternion(tip.quaternion);
        rawAttachments.push({
          position: tip.origin.clone(),
          direction,
          tangent: direction.clone(),
          depth: level,
          normalizedHeight: THREE.MathUtils.clamp(tip.origin.y / Math.max(trunkLength, 1e-4), 0, 1),
          branchRadius: tip.radius,
          azimuth: Math.atan2(direction.z, direction.x),
        });
      }
      return;
    }

    // Terminal continuation: the next level takes over from the last ring
    // in place, same segment count — the trunk flows into a leader.
    const last = rings[rings.length - 1];
    if (branchBudget > 0) {
      branchBudget -= 1;
      queue.push({
        origin: last.origin.clone(),
        quaternion: last.quaternion.clone(),
        length: lengths[Math.min(level + 1, 3)] * (conifer ? 0.5 : 1),
        radius: last.radius,
        level: level + 1,
        segments,
      });
    }

    // Lateral children: stratified heights along [start, 1], stratified
    // azimuth slots decorrelated by a Fisher-Yates shuffle.
    const childLevel = level + 1;
    const count = childCounts[Math.min(level, 3)];
    if (!count) return;
    const startFraction = starts[Math.min(childLevel, 3)];
    const heightStep = (1 - startFraction) / count;
    const radialOffset = next();
    const slots = Array.from({ length: count }, (_, i) => i);
    for (let i = slots.length - 1; i > 0; i -= 1) {
      const j = Math.floor(next() * (i + 1));
      [slots[i], slots[j]] = [slots[j], slots[i]];
    }
    for (let i = 0; i < count; i += 1) {
      if (branchBudget <= 0) break;
      const attachFraction = startFraction + (i + next()) * heightStep;
      const ring = ringAt(Math.min(attachFraction, 1));
      const azimuth = Math.PI * 2 *
        (radialOffset + (slots[i] + range(0.5, -0.5)) / count);
      const pitch = angles[Math.min(childLevel, 3)] * (0.9 + next() * 0.2);
      const childQuaternion = ring.quaternion.clone()
        .multiply(new THREE.Quaternion().setFromAxisAngle(UP, azimuth))
        .multiply(new THREE.Quaternion().setFromAxisAngle(
          workAxis.set(1, 0, 0), pitch));
      // Conifer crowns: children shorten toward the top → layered cone.
      const childLength = lengths[Math.min(childLevel, 3)] *
        (conifer ? (1 - attachFraction) : 1) * (0.85 + next() * 0.3);
      if (childLength < 0.08) continue;
      branchBudget -= 1;
      queue.push({
        origin: ring.origin,
        quaternion: childQuaternion,
        length: childLength,
        radius: Math.max(tipRadius, ring.radius * radiusRatio),
        level: childLevel,
        segments: null,
      });
    }
  };

  // Trunk: optional initial lean carries the classic trunk styles over.
  const rootQuaternion = new THREE.Quaternion();
  if (!spinePoints && lean) {
    // The seeded draw is consumed either way, so pinning the lean direction
    // never shifts the rest of this tree's random stream and every existing
    // seed keeps its exact geometry.
    const seededLeanHeading = next() * Math.PI * 2;
    const leanHeading = leanOffset == null
      ? seededLeanHeading + Math.PI / 2
      : trunkBowHeading + leanOffset;
    const leanAxisHeading = leanHeading - Math.PI / 2;
    rootQuaternion.setFromAxisAngle(
      new THREE.Vector3(Math.cos(leanAxisHeading), 0, Math.sin(leanAxisHeading)),
      lean * 0.45,
    );
  }
  queue.push({
    origin: new THREE.Vector3(0, 0, 0),
    quaternion: rootQuaternion,
    length: trunkLength,
    radius: radiusBottom,
    level: 0,
    segments: null,
  });
  while (queue.length) buildBranch(queue.shift());

  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(indices);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));

  const anchor = new THREE.Vector3();
  rawAttachments.forEach((attachment) => anchor.add(attachment.position));
  anchor.divideScalar(Math.max(rawAttachments.length, 1));
  const attachments = rawAttachments.map((attachment) => ({
    position: attachment.position.clone().sub(anchor).divideScalar(canopyScale),
    direction: attachment.direction,
    tangent: attachment.tangent,
    depth: attachment.depth,
    normalizedHeight: attachment.normalizedHeight,
    branchRadius: attachment.branchRadius / Math.max(canopyScale, 1e-4),
    azimuth: attachment.azimuth,
  }));
  if (!attachments.length) {
    attachments.push({
      position: new THREE.Vector3(),
      direction: new THREE.Vector3(0, 1, 0),
      tangent: new THREE.Vector3(0, 1, 0),
      depth: 0,
      normalizedHeight: 1,
      branchRadius: tipRadius,
      azimuth: 0,
    });
  }
  return { geometry, canopyAnchor: anchor, attachments };
}

// A few ready-made trunk personalities. Spread one into trunk options and
// override from there: { ...TREE_TRUNK_STYLES.gnarled, seed: 4 }.
export const TREE_TRUNK_STYLES = Object.freeze({
  straight: { bend: 0.04, lean: 0.05, twist: 0, gnarl: 0 },
  leaning: { bend: 0.12, lean: 0.22, twist: 0, gnarl: 0 },
  curved: { bend: 0.2, lean: 0.12, twist: 0.4, gnarl: 0.25 },
  gnarled: { bend: 0.16, lean: 0.18, twist: 1.2, gnarl: 0.8 },
  bonsai: { bend: 0.26, lean: 0.3, twist: 2.2, gnarl: 1.25, height: 1.2, radiusBottom: 0.24 },
  // The dramatic Liyue silhouette: one smooth serpentine trunk — a hard
  // mid-bow one way, the top swept far back the other (leanOffset PI pins
  // the reversal), crown carried well off the base.
  swooping: { bend: 0.6, lean: 0.85, twist: 0.5, gnarl: 0, leanOffset: Math.PI,
    height: 1.8, radiusBottom: 0.24 },
});

// Recipe documents: a plant serialized as { schema, version, type, options }.
// The options are exactly what the constructor takes, so a recipe rebuilds
// the identical plant (generation is deterministic per seed). Defined here —
// not in treeRecipe.js — so toJSON() below has no circular import.
export const TREE_RECIPE_SCHEMA = 'treeRecipe';
export const TREE_RECIPE_VERSION = 3;

// Recursively convert constructor options to plain JSON data: THREE.Color →
// '#hex' string (resolveCanopyColor accepts it back), vectors → arrays,
// functions dropped.
function toSerializable(value) {
  if (value === null || typeof value !== 'object') {
    return typeof value === 'function' ? undefined : value;
  }
  if (value.isColor) return `#${value.getHexString(THREE.SRGBColorSpace)}`;
  if (value.isVector2 || value.isVector3 || value.isVector4) return value.toArray();
  if (Array.isArray(value)) return value.map((entry) => toSerializable(entry));
  const out = {};
  for (const [key, entry] of Object.entries(value)) {
    const converted = toSerializable(entry);
    if (converted !== undefined) out[key] = converted;
  }
  return out;
}

// Whitelist copy of StylizedTree/StylizedBush constructor options with the
// live objects stripped (trunkMaterial, foliage.leafMap/sharedUniforms) —
// everything a recipe file may carry.
export function serializableTreeOptions(options = {}) {
  const { trunkMap, trunkMaterial, foliage, ...rest } = options;
  void trunkMap;
  void trunkMaterial;
  const out = toSerializable(rest);
  if (foliage) {
    const { leafMap, sharedUniforms, ...foliageRest } = foliage;
    void leafMap;
    void sharedUniforms;
    const serializedFoliage = toSerializable(foliageRest);
    if (Object.keys(serializedFoliage).length) out.foliage = serializedFoliage;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Tree settings: DEFAULT_STYLIZED_TREE_SETTINGS / createStylizedTreeSettings mirror the
// StylizedTree constructor options as a grouped settings object (tree, trunk,
// skeleton, canopy, foliage), following the toonSettings pattern. Values not
// listed in the defaults (canopy.blobs, foliage.leafMap, foliage.
// sharedUniforms, ...) pass through createStylizedTreeSettings untouched, so every
// legacy option keeps working.

function cleanObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function finiteNumber(value, fallback, { min = -Infinity, max = Infinity } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function integerNumber(value, fallback, options) {
  return Math.round(finiteNumber(value, fallback, options));
}

// Numbers where `null` is a meaningful "seeded / automatic" default.
function nullableNumber(value, fallback, options) {
  if (value === undefined) return fallback;
  if (value === null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? finiteNumber(number, fallback, options) : fallback;
}

function booleanOption(value, fallback) {
  return value === undefined ? fallback : Boolean(value);
}

// `canopy.padLayers` — the horizontal-plate band-pass. A count below 2 is not
// a plate structure (one band is the whole crown), so it resolves to null
// rather than silently pruning to a single slab.
function padLayerOption(value, fallback) {
  if (value === undefined) return fallback;
  if (value === null || typeof value !== 'object') return null;
  const count = integerNumber(value.count, 0, { min: 0, max: 24 });
  if (count < 2) return null;
  return Object.freeze({
    count,
    // Fraction of each band's pitch that carries foliage; the rest is the
    // gap a viewer sees sky and limb through.
    thickness: finiteNumber(value.thickness, 0.5, { min: 0.02, max: 1 }),
    // Deterministic per-band height wobble, as a fraction of the pitch.
    jitter: finiteNumber(value.jitter, 0, { min: 0, max: 1 }),
  });
}

function colorArray(value, fallback) {
  if (value?.isColor) return value.clone().convertLinearToSRGB().toArray();
  if (Array.isArray(value) && value.length >= 3) {
    const next = value.slice(0, 3).map(Number);
    return next.every(Number.isFinite) ? next : fallback.slice();
  }
  if (typeof value === 'number' || typeof value === 'string') {
    try {
      const color = new THREE.Color(value);
      // Public tree color arrays are authored sRGB values. THREE.Color stores
      // constructor inputs in linear working space, so returning its raw
      // channels here causes the material's sRGB setter to decode them a
      // second time. Preserve the documented authored color space.
      return color.convertLinearToSRGB().toArray();
    } catch {
      return fallback.slice();
    }
  }
  return fallback.slice();
}

function vectorArray(value, fallback, size) {
  const keys = ['x', 'y', 'z', 'w'];
  const read = (index) => {
    if (Array.isArray(value)) return Number(value[index]);
    if (value && typeof value === 'object') return Number(value[keys[index]]);
    return NaN;
  };
  const next = Array.from({ length: size }, (_, index) => read(index));
  return next.every(Number.isFinite) ? next : fallback.slice(0, size);
}

/**
 * Default StylizedTree settings, grouped as { tree, trunk, skeleton, canopy,
 * foliage }. Every value equals the historical hardcoded/parameter default,
 * so `new StylizedTree()` renders identically to previous releases.
 *
 * Groups `trunk`, `skeleton`, and `canopy` bake geometry and are
 * construction-only; the `foliage` group (and the tree palette/
 * trunkReceiveShadow) can be re-applied at runtime via
 * `StylizedTree#applySettings`.
 */
export const DEFAULT_STYLIZED_TREE_SETTINGS = Object.freeze({
  tree: Object.freeze({
    // 0x4da258 as an sRGB triplet; accepts any resolveCanopyColor spec.
    canopyColor: Object.freeze([0x4d / 255, 0xa2 / 255, 0x58 / 255]),
    canopyDepth: 1,
    canopyLayout: Object.freeze({}),
    canopyPalette: Object.freeze({}),
    canopyScale: 1,
    canopyWidth: 1,
    leafDensity: 1,
    leafPlacement: 'canopy',
    seed: 1,
    size: 1,
    trunkColor: Object.freeze([0xc9 / 255, 0xab / 255, 0x8a / 255]),
    trunkReceiveShadow: true,
  }),
  trunk: Object.freeze({
    bend: 0.12,
    bendDirection: null,
    branchCount: 2,
    branchLength: 0.55,
    branchRadius: 0.055,
    gnarl: 0,
    gnarlAmplitude: 0.16,
    gnarlFrequencyXRange: Object.freeze([4.2, 7.6]),
    gnarlFrequencyZRange: Object.freeze([3.1, 6.7]),
    height: 1.55,
    heightSegments: 14,
    lean: 0.16,
    leanOffset: null,
    radialGnarlFrequency: 9.3,
    radialSegments: 10,
    radiusBottom: 0.19,
    radiusTop: 0.085,
    twist: 0,
  }),
  skeleton: Object.freeze({
    attachmentTwigRadius: 0.09,
    attractionCount: 90,
    attractionReach: null,
    branchAngle: 55,
    branchStart: 0.4,
    childrenCount: 6,
    conifer: false,
    generator: 'limbs',
    influenceRadius: 1.2,
    killRadius: 0.42,
    forceStrength: 0.02,
    gnarliness: 0.15,
    lengthRatio: 0.45,
    levels: 3,
    maxNodes: 140,
    maxSteps: 48,
    minLimbRadius: 0.028,
    radialSegments: 8,
    radiusRatio: 0.7,
    segmentLength: 0.3,
    tipRadius: 0.03,
  }),
  canopy: Object.freeze({
    architecture: 'cloud-cards',
    cardCount: 170,
    cardSizeRange: Object.freeze([1.0, 1.6]),
    cardsPerCluster: 5,
    clusterRadius: 0.48,
    frondCount: 7,
    frondLength: 1.25,
    // Bare every branch tip below this fraction of the crown's own vertical
    // extent, lifting the foliage skirt so the trunk and the lower limb
    // structure read as form. 0 = no lift, which is every historical tree.
    crownBase: 0,
    // Keep only this many well-separated foliage attachments and bare the
    // rest, so the crown reads as discrete pads with visible limb between
    // them. null = no pruning, which is every historical tree.
    padCount: null,
    // Multiplies the card count of every tip that SURVIVES pruning, so a
    // crown can be restructured into plates or pads at an unchanged card
    // total instead of simply losing the foliage the pruning removed.
    padDensityBoost: 1,
    // Horizontal plates: { count, thickness, jitter }. Keeps tips inside
    // `count` bands across the crown height and bares the tips between them,
    // which is the structure of a layered broadleaf and the one thing
    // isotropic pad pruning cannot produce. null = no plating.
    padLayers: null,
    // 0..1, layered-sprays only. Rotates each tuft's spray disc from
    // across-the-twig (0) to world-horizontal (1). See stylizedTreeFoliage.
    plateAlignment: 0,
    // Drops the outer edge of each spray disc as a fraction of its radius, so
    // a plate sags rather than reading as a machined shelf. 0 = flat.
    plateDroop: 0,
    shellFill: true,
    sprayLayers: 3,
    spraySpread: 0.8,
    sprayThickness: 0.18,
    whorlArms: 6,
    whorlRadius: 0.48,
  }),
  foliage: Object.freeze({
    alphaCutoff: 0.3,
    backlitStrength: 0.35,
    cloudShadowCoverage: 0.45,
    cloudShadowScale: 0.012,
    cloudShadowStrength: 0,
    cloudShadowVelocity: Object.freeze([0.02, 0.006]),
    sceneShadowStrength: 0.55,
    skyColor: Object.freeze([0.62, 0.78, 0.95]),
    sunColor: Object.freeze([1.0, 0.96, 0.84]),
    sunDirection: Object.freeze([0.35, 0.72, 0.42]),
    windDirection: Object.freeze([1, 0.3]),
    windSpeed: 1.0,
    windStrength: 0.05,
  }),
});

// Named runtime settings: npm ships only the neutral baseline. Authored tree
// recipes live in the public Gallery and may be registered explicitly after
// MCP discovery when an application wants name-based selection.
const stylizedTreePresetRegistry = new Map([
  ['default', Object.freeze({
    description: 'Baseline stylized tree.',
    label: 'Default',
    settings: Object.freeze({}),
  })],
]);

/**
 * Registers a named tree preset so it resolves in
 * `createStylizedTreeSettings({ preset })` (and therefore
 * `new StylizedTree({ preset })`) exactly like the built-ins. `settings` is a
 * grouped partial (`{ tree, trunk, skeleton, canopy, foliage }`).
 */
export function registerStylizedTreePreset(name, preset = {}, { overwrite = false } = {}) {
  const id = String(name ?? '').trim();
  if (!id) throw new Error('Tree preset name is required.');
  if (!overwrite && stylizedTreePresetRegistry.has(id)) {
    throw new Error(`Tree preset "${id}" already exists.`);
  }
  const { label, description, settings, ...flat } = cleanObject(preset);
  const entry = Object.freeze({
    description: typeof description === 'string' ? description : '',
    label: typeof label === 'string' && label ? label : id,
    settings: Object.freeze({ ...cleanObject(settings ?? flat) }),
  });
  stylizedTreePresetRegistry.set(id, entry);
  return { description: entry.description, id, label: entry.label };
}

/** Lists registered tree presets as `{ id, label, description }` (for HUDs). */
export function getStylizedTreePresetOptions() {
  return Array.from(stylizedTreePresetRegistry.entries()).map(([id, preset]) => ({
    description: preset.description,
    id,
    label: preset.label,
  }));
}

/**
 * Validates and merges partial tree options over
 * {@link DEFAULT_STYLIZED_TREE_SETTINGS}. Accepts both the legacy flat constructor
 * shape (`{ size, seed, trunk: {...}, ... }`) and the grouped settings shape
 * (`{ tree: { size, seed }, trunk: {...}, ... }`); flat keys and the `tree`
 * group are the same fields. Unknown keys inside trunk/skeleton/canopy/
 * foliage pass through untouched (blobs, leafMap, sharedUniforms, ...), so
 * existing callers keep working. `createStylizedTreeSettings()` deep-equals the
 * defaults object. `preset` resolves a registered preset under the overrides.
 *
 * @param {Object} [options] Partial settings or legacy constructor options.
 * @returns {Object} A complete, plain grouped tree settings object.
 */
export function createStylizedTreeSettings(options = {}) {
  const raw = cleanObject(options);
  const presetSettings = cleanObject(stylizedTreePresetRegistry.get(raw.preset)?.settings);
  const source = {
    ...presetSettings,
    ...raw,
    tree: { ...cleanObject(presetSettings.tree), ...cleanObject(raw.tree) },
    trunk: { ...cleanObject(presetSettings.trunk), ...cleanObject(raw.trunk) },
    skeleton: { ...cleanObject(presetSettings.skeleton), ...cleanObject(raw.skeleton) },
    canopy: { ...cleanObject(presetSettings.canopy), ...cleanObject(raw.canopy) },
    foliage: { ...cleanObject(presetSettings.foliage), ...cleanObject(raw.foliage) },
  };
  const treeSource = { ...source, ...cleanObject(source.tree) };
  const trunkSource = cleanObject(source.trunk);
  const skeletonSource = cleanObject(source.skeleton);
  const canopySource = cleanObject(source.canopy);
  const foliageSource = cleanObject(source.foliage);
  const base = DEFAULT_STYLIZED_TREE_SETTINGS;

  return {
    tree: {
      canopyColor: treeSource.canopyColor !== undefined
        ? treeSource.canopyColor
        : [...base.tree.canopyColor],
      canopyDepth: finiteNumber(treeSource.canopyDepth, base.tree.canopyDepth, { min: 0.01 }),
      canopyLayout: { ...cleanObject(treeSource.canopyLayout) },
      canopyPalette: { ...cleanObject(treeSource.canopyPalette) },
      canopyScale: finiteNumber(treeSource.canopyScale, base.tree.canopyScale, { min: 0.01 }),
      canopyWidth: finiteNumber(treeSource.canopyWidth, base.tree.canopyWidth, { min: 0.01 }),
      leafDensity: finiteNumber(treeSource.leafDensity, base.tree.leafDensity, { min: 0.05, max: 2 }),
      leafPlacement: treeSource.leafPlacement === 'tips' ? 'tips' : base.tree.leafPlacement,
      seed: finiteNumber(treeSource.seed, base.tree.seed),
      size: finiteNumber(treeSource.size, base.tree.size, { min: 0.01 }),
      trunkColor: colorArray(treeSource.trunkColor, base.tree.trunkColor),
      trunkReceiveShadow: booleanOption(treeSource.trunkReceiveShadow, base.tree.trunkReceiveShadow),
    },
    trunk: {
      ...trunkSource,
      bend: finiteNumber(trunkSource.bend, base.trunk.bend),
      bendDirection: nullableNumber(trunkSource.bendDirection, base.trunk.bendDirection),
      branchCount: integerNumber(trunkSource.branchCount, base.trunk.branchCount, { min: 0 }),
      branchLength: finiteNumber(trunkSource.branchLength, base.trunk.branchLength, { min: 0 }),
      branchRadius: finiteNumber(trunkSource.branchRadius, base.trunk.branchRadius, { min: 0 }),
      gnarl: finiteNumber(trunkSource.gnarl, base.trunk.gnarl, { min: 0 }),
      gnarlAmplitude: finiteNumber(trunkSource.gnarlAmplitude, base.trunk.gnarlAmplitude, { min: 0 }),
      gnarlFrequencyXRange: vectorArray(trunkSource.gnarlFrequencyXRange, base.trunk.gnarlFrequencyXRange, 2),
      gnarlFrequencyZRange: vectorArray(trunkSource.gnarlFrequencyZRange, base.trunk.gnarlFrequencyZRange, 2),
      height: finiteNumber(trunkSource.height, base.trunk.height, { min: 0.01 }),
      heightSegments: integerNumber(trunkSource.heightSegments, base.trunk.heightSegments, { min: 1 }),
      lean: finiteNumber(trunkSource.lean, base.trunk.lean),
      leanOffset: nullableNumber(trunkSource.leanOffset, base.trunk.leanOffset),
      radialGnarlFrequency: finiteNumber(trunkSource.radialGnarlFrequency, base.trunk.radialGnarlFrequency, { min: 0 }),
      radialSegments: integerNumber(trunkSource.radialSegments, base.trunk.radialSegments, { min: 3 }),
      radiusBottom: finiteNumber(trunkSource.radiusBottom, base.trunk.radiusBottom, { min: 0.001 }),
      radiusTop: finiteNumber(trunkSource.radiusTop, base.trunk.radiusTop, { min: 0.001 }),
      twist: finiteNumber(trunkSource.twist, base.trunk.twist),
    },
    skeleton: {
      ...skeletonSource,
      attachmentTwigRadius: finiteNumber(skeletonSource.attachmentTwigRadius, base.skeleton.attachmentTwigRadius, { min: 0 }),
      attractionCount: integerNumber(skeletonSource.attractionCount, base.skeleton.attractionCount, { min: 1 }),
      attractionReach: nullableNumber(skeletonSource.attractionReach, base.skeleton.attractionReach, { min: 0, max: 1 }),
      branchAngle: finiteNumber(skeletonSource.branchAngle, base.skeleton.branchAngle, { min: 10, max: 130 }),
      branchStart: finiteNumber(skeletonSource.branchStart, base.skeleton.branchStart, { min: 0, max: 0.9 }),
      childrenCount: finiteNumber(skeletonSource.childrenCount, base.skeleton.childrenCount, { min: 1, max: 90 }),
      conifer: booleanOption(skeletonSource.conifer, base.skeleton.conifer),
      forceStrength: finiteNumber(skeletonSource.forceStrength, base.skeleton.forceStrength, { min: -0.08, max: 0.15 }),
      gnarliness: finiteNumber(skeletonSource.gnarliness, base.skeleton.gnarliness, { min: 0, max: 0.6 }),
      generator: ['limbs', 'branching', 'drawn'].includes(skeletonSource.generator)
        ? skeletonSource.generator : base.skeleton.generator,
      lengthRatio: finiteNumber(skeletonSource.lengthRatio, base.skeleton.lengthRatio, { min: 0.15, max: 0.95 }),
      levels: integerNumber(skeletonSource.levels, base.skeleton.levels, { min: 1, max: 4 }),
      radiusRatio: finiteNumber(skeletonSource.radiusRatio, base.skeleton.radiusRatio, { min: 0.3, max: 0.9 }),
      influenceRadius: finiteNumber(skeletonSource.influenceRadius, base.skeleton.influenceRadius, { min: 0.01 }),
      killRadius: finiteNumber(skeletonSource.killRadius, base.skeleton.killRadius, { min: 0.01 }),
      maxNodes: integerNumber(skeletonSource.maxNodes, base.skeleton.maxNodes, { min: 2 }),
      maxSteps: integerNumber(skeletonSource.maxSteps, base.skeleton.maxSteps, { min: 1 }),
      minLimbRadius: finiteNumber(skeletonSource.minLimbRadius, base.skeleton.minLimbRadius, { min: 0 }),
      radialSegments: integerNumber(skeletonSource.radialSegments, base.skeleton.radialSegments, { min: 3 }),
      segmentLength: finiteNumber(skeletonSource.segmentLength, base.skeleton.segmentLength, { min: 0.01 }),
      tipRadius: finiteNumber(skeletonSource.tipRadius, base.skeleton.tipRadius, { min: 0.001 }),
    },
    canopy: {
      ...canopySource,
      architecture: ['cloud-cards', 'layered-sprays', 'needle-whorls', 'radial-fronds']
        .includes(canopySource.architecture)
        ? canopySource.architecture : base.canopy.architecture,
      cardCount: integerNumber(canopySource.cardCount, base.canopy.cardCount, { min: 0 }),
      cardSizeRange: vectorArray(canopySource.cardSizeRange, base.canopy.cardSizeRange, 2),
      cardsPerCluster: integerNumber(canopySource.cardsPerCluster, base.canopy.cardsPerCluster, { min: 1 }),
      clusterRadius: finiteNumber(canopySource.clusterRadius, base.canopy.clusterRadius, { min: 0.01 }),
      frondCount: integerNumber(canopySource.frondCount, base.canopy.frondCount, { min: 3, max: 24 }),
      frondLength: finiteNumber(canopySource.frondLength, base.canopy.frondLength, { min: 0.1, max: 4 }),
      crownBase: finiteNumber(canopySource.crownBase, base.canopy.crownBase, { min: 0, max: 0.95 }),
      padCount: nullableNumber(canopySource.padCount, base.canopy.padCount, { min: 1, max: 2000 }),
      padDensityBoost: finiteNumber(canopySource.padDensityBoost, base.canopy.padDensityBoost, { min: 0.1, max: 12 }),
      padLayers: padLayerOption(canopySource.padLayers, base.canopy.padLayers),
      plateAlignment: finiteNumber(canopySource.plateAlignment, base.canopy.plateAlignment, { min: 0, max: 1 }),
      plateDroop: finiteNumber(canopySource.plateDroop, base.canopy.plateDroop, { min: 0, max: 2 }),
      shellFill: booleanOption(canopySource.shellFill, base.canopy.shellFill),
      sprayLayers: integerNumber(canopySource.sprayLayers, base.canopy.sprayLayers, { min: 1, max: 12 }),
      spraySpread: finiteNumber(canopySource.spraySpread, base.canopy.spraySpread, { min: 0.05, max: 4 }),
      sprayThickness: finiteNumber(canopySource.sprayThickness, base.canopy.sprayThickness, { min: 0, max: 2 }),
      whorlArms: integerNumber(canopySource.whorlArms, base.canopy.whorlArms, { min: 3, max: 24 }),
      whorlRadius: finiteNumber(canopySource.whorlRadius, base.canopy.whorlRadius, { min: 0.05, max: 3 }),
    },
    foliage: {
      ...foliageSource,
      alphaCutoff: finiteNumber(foliageSource.alphaCutoff, base.foliage.alphaCutoff, { min: 0, max: 1 }),
      backlitStrength: finiteNumber(foliageSource.backlitStrength, base.foliage.backlitStrength, { min: 0 }),
      cloudShadowCoverage: finiteNumber(foliageSource.cloudShadowCoverage, base.foliage.cloudShadowCoverage, { min: 0, max: 1 }),
      cloudShadowScale: finiteNumber(foliageSource.cloudShadowScale, base.foliage.cloudShadowScale, { min: 0.0001 }),
      cloudShadowStrength: finiteNumber(foliageSource.cloudShadowStrength, base.foliage.cloudShadowStrength, { min: 0, max: 1 }),
      cloudShadowVelocity: vectorArray(foliageSource.cloudShadowVelocity, base.foliage.cloudShadowVelocity, 2),
      sceneShadowStrength: finiteNumber(foliageSource.sceneShadowStrength, base.foliage.sceneShadowStrength, { min: 0, max: 1 }),
      skyColor: colorArray(foliageSource.skyColor, base.foliage.skyColor),
      sunColor: colorArray(foliageSource.sunColor, base.foliage.sunColor),
      sunDirection: vectorArray(foliageSource.sunDirection, base.foliage.sunDirection, 3),
      windDirection: vectorArray(foliageSource.windDirection, base.foliage.windDirection, 2),
      windSpeed: finiteNumber(foliageSource.windSpeed, base.foliage.windSpeed),
      windStrength: finiteNumber(foliageSource.windStrength, base.foliage.windStrength, { min: 0 }),
    },
  };
}

/**
 * Panel group metadata for the tree settings, in display order. Group ids
 * match the {@link DEFAULT_STYLIZED_TREE_SETTINGS} top-level keys.
 */
export const STYLIZED_TREE_SETTING_GROUPS = Object.freeze([
  Object.freeze({
    description: 'Overall scale, seed, crown reach, leaf coverage, and canopy palette. Everything except the palette and trunk shadow flag bakes geometry at construction.',
    id: 'tree',
    label: 'Tree',
  }),
  Object.freeze({
    description: 'Trunk silhouette (bend, lean, twist, gnarl) shared by the skeleton grower and the classic curved-trunk generator. Construction-only.',
    id: 'trunk',
    label: 'Trunk',
  }),
  Object.freeze({
    description: 'Space-colonization limb growth and bark mesh controls. Construction-only.',
    id: 'skeleton',
    label: 'Skeleton',
  }),
  Object.freeze({
    description: 'Leaf-card canopy geometry: card counts, tuft clusters, and shell fill. Construction-only.',
    id: 'canopy',
    label: 'Canopy Cards',
  }),
  Object.freeze({
    description: 'Leaf material response: wind, sun, alpha cutout, scene and cloud shadows. Applies at runtime via applySettings.',
    id: 'foliage',
    label: 'Foliage Material',
  }),
]);

const STYLIZED_TREE_FIELD_DEFINITIONS = Object.freeze({
  tree: {
    size: {
      description: 'Overall tree multiplier (1 ≈ 3 m tree, 2 ≈ 6 m, 3+ large). Construction-only: also densifies canopy cards so leaves stay leaf-sized.',
      label: 'Size',
      range: { max: 6, min: 0.2, step: 0.05 },
      type: 'number',
    },
    seed: {
      description: 'Deterministic generation seed; the same options and seed always grow the same tree. Construction-only.',
      label: 'Seed',
      range: { max: 999, min: 1, step: 1 },
      type: 'number',
    },
    canopyColor: {
      description: 'Canopy base color; the lit/shadow/crown palette derives from it. Also accepts richer resolveCanopyColor specs (color lists, {from,to} blends, HSL ranges) resolved per seed.',
      label: 'Canopy Color',
      type: 'color',
    },
    canopyPalette: {
      description: 'Optional explicit { lit, shadow, crown } tone overrides; unset tones derive from the canopy color.',
      label: 'Canopy Palette',
      serializable: false,
      type: 'object',
    },
    canopyWidth: {
      description: 'X-axis crown reach multiplier. Construction-only: shapes the blob layout.',
      label: 'Canopy Width',
      range: { max: 2.5, min: 0.3, step: 0.05 },
      type: 'number',
    },
    canopyDepth: {
      description: 'Z-axis crown reach multiplier. Construction-only: shapes the blob layout.',
      label: 'Canopy Depth',
      range: { max: 2.5, min: 0.3, step: 0.05 },
      type: 'number',
    },
    canopyLayout: {
      description: 'Optional createCanopyBlobs overrides (lobeCount, spread, flatten, coreRadius, ...). Construction-only.',
      label: 'Canopy Layout',
      serializable: false,
      type: 'object',
    },
    leafDensity: {
      description: 'Crown leaf coverage. Below ~0.9 see-through gap pockets open and branches read through; above 1 packs extra cards (and fatter tufts) for lush crowns. Construction-only.',
      label: 'Leaf Density',
      range: { max: 2, min: 0.05, step: 0.01 },
      type: 'number',
    },
    canopyScale: {
      description: 'Canopy-only scale relative to the trunk. Construction-only.',
      label: 'Canopy Scale',
      range: { max: 3, min: 0.2, step: 0.05 },
      type: 'number',
    },
    leafPlacement: {
      description: 'canopy: solid leaf mass hiding interior wood. tips: bushes only at branch ends with bare limbs between them (Sumeru silhouette). Construction-only.',
      label: 'Leaf Placement',
      optionLabels: Object.freeze({ canopy: 'Solid Canopy', tips: 'Branch Tips' }),
      options: Object.freeze(['canopy', 'tips']),
      type: 'select',
    },
    trunkReceiveShadow: {
      description: 'Whether the bark receives shadow maps. Massive pale-limbed trees read better with this off.',
      label: 'Trunk Receive Shadow',
      type: 'boolean',
    },
    trunkColor: {
      description: 'Warm bark base color used by the generated trunk, branches, and roots.',
      label: 'Trunk Color',
      type: 'color',
    },
  },
  trunk: {
    height: {
      description: 'Trunk height in meters (before the overall size multiplier). Construction-only.',
      label: 'Height',
      range: { max: 3, min: 0.4, step: 0.05 },
      type: 'number',
    },
    radiusBottom: {
      description: 'Trunk radius at the root flare in meters. Construction-only.',
      label: 'Radius Bottom',
      range: { max: 0.6, min: 0.05, step: 0.005 },
      type: 'number',
    },
    radiusTop: {
      description: 'Trunk radius at the top in meters. Classic trunk generator (createTreeTrunkGeometry) only. Construction-only.',
      label: 'Radius Top',
      range: { max: 0.3, min: 0.02, step: 0.005 },
      type: 'number',
    },
    bend: {
      description: 'Mid-trunk bow amplitude that returns toward center (S-curve) in meters. Construction-only.',
      label: 'Bend',
      range: { max: 0.8, min: 0, step: 0.01 },
      type: 'number',
    },
    lean: {
      description: 'Off-vertical drift that accumulates toward the top, in meters. Construction-only.',
      label: 'Lean',
      range: { max: 1.2, min: 0, step: 0.01 },
      type: 'number',
    },
    twist: {
      description: 'Y-rotation of the cross-section over the full height in radians; spirals the bark like wrung wood. Construction-only.',
      label: 'Twist',
      range: { max: 4, min: -4, step: 0.05 },
      type: 'number',
    },
    gnarl: {
      description: 'High-frequency wiggle and radius bulges: 0 is a clean park tree, 1+ reads like an old bonsai. Construction-only.',
      label: 'Gnarl',
      range: { max: 2, min: 0, step: 0.01 },
      type: 'number',
    },
    gnarlFrequencyXRange: {
      description: 'Seeded min/max wave count of the gnarl wiggle over the trunk height on the X axis. Classic trunk generator only. Construction-only.',
      label: 'Gnarl Frequency X Range',
      type: 'vector2',
    },
    gnarlFrequencyZRange: {
      description: 'Seeded min/max wave count of the gnarl wiggle over the trunk height on the Z axis. Classic trunk generator only. Construction-only.',
      label: 'Gnarl Frequency Z Range',
      type: 'vector2',
    },
    gnarlAmplitude: {
      description: 'Meters of gnarl wiggle (and radius bulge fraction) per unit of gnarl. Classic trunk generator only. Construction-only.',
      label: 'Gnarl Amplitude',
      range: { max: 0.5, min: 0, step: 0.005 },
      type: 'number',
    },
    radialGnarlFrequency: {
      description: 'Wave count of the gnarl radius bulges (old-wood knuckles) over the trunk height. Classic trunk generator only. Construction-only.',
      label: 'Radial Gnarl Frequency',
      range: { max: 20, min: 0, step: 0.1 },
      type: 'number',
    },
    bendDirection: {
      description: 'World heading of the bow in radians; null/unset picks a seeded heading. Construction-only.',
      label: 'Bend Direction',
      range: { max: 6.283, min: -6.283, step: 0.01 },
      type: 'number',
    },
    leanOffset: {
      description: 'Lean heading relative to the bow in radians (PI pins a serpentine S-trunk); null/unset picks a seeded offset. Construction-only.',
      label: 'Lean Offset',
      range: { max: 6.283, min: -6.283, step: 0.01 },
      type: 'number',
    },
    radialSegments: {
      description: 'Cross-section segment count of the trunk tube. Classic trunk generator only. Construction-only.',
      label: 'Radial Segments',
      range: { max: 16, min: 3, step: 1 },
      type: 'number',
    },
    heightSegments: {
      description: 'Vertical segment count of the trunk tube. Classic trunk generator only. Construction-only.',
      label: 'Height Segments',
      range: { max: 24, min: 2, step: 1 },
      type: 'number',
    },
    branchCount: {
      description: 'Number of stub branches near the top. Classic trunk generator only. Construction-only.',
      label: 'Branch Count',
      range: { max: 6, min: 0, step: 1 },
      type: 'number',
    },
    branchLength: {
      description: 'Base branch length in meters. Classic trunk generator only. Construction-only.',
      label: 'Branch Length',
      range: { max: 1.5, min: 0, step: 0.01 },
      type: 'number',
    },
    branchRadius: {
      description: 'Base branch radius in meters. Classic trunk generator only. Construction-only.',
      label: 'Branch Radius',
      range: { max: 0.2, min: 0, step: 0.005 },
      type: 'number',
    },
  },
  skeleton: {
    generator: {
      description: 'limbs: space-colonization growth toward the crown blobs (solid anime-style crowns). branching: recursive central-leader branching (open, realistic broadleaf/conifer silhouettes). drawn: no procedural wood at all — the tree is exactly the hand-drawn branchSpines (Tree Lab sketch mode). Construction-only.',
      label: 'Generator',
      optionLabels: Object.freeze({ limbs: 'Grown Limbs', branching: 'Recursive Branching', drawn: 'Hand-Drawn' }),
      options: Object.freeze(['limbs', 'branching', 'drawn']),
      type: 'select',
    },
    levels: {
      description: 'Recursion depth of the branching generator; each level subdivides into thinner children. Branching generator only. Construction-only.',
      label: 'Branch Levels',
      range: { max: 4, min: 1, step: 1 },
      type: 'number',
    },
    childrenCount: {
      description: 'Lateral child branches sprouting along the trunk (deeper levels derive from them). The central leader continues separately, so children=1 forms one lateral limb plus the leader. Conifers use high counts (60-90) for dense whorled fronds. Branching generator only. Construction-only.',
      label: 'Children',
      range: { max: 90, min: 1, step: 1 },
      type: 'number',
    },
    branchAngle: {
      description: 'Child pitch away from the parent axis, in degrees. Past 90 points branches below horizontal (conifer fronds ~110). Branching generator only. Construction-only.',
      label: 'Branch Angle',
      range: { max: 130, min: 10, step: 1 },
      type: 'number',
    },
    branchStart: {
      description: 'Fraction of the trunk kept bare before children begin — real trees hold their crown off the ground. Branching generator only. Construction-only.',
      label: 'Branch Start',
      range: { max: 0.9, min: 0, step: 0.01 },
      type: 'number',
    },
    lengthRatio: {
      description: 'Child branch length as a fraction of the trunk (deeper levels shorten from it). Branching generator only. Construction-only.',
      label: 'Length Ratio',
      range: { max: 0.95, min: 0.15, step: 0.01 },
      type: 'number',
    },
    radiusRatio: {
      description: 'Child radius as a fraction of the parent\\u2019s radius at the attach point — radius continuity is what makes forks read as one tree. Branching generator only. Construction-only.',
      label: 'Radius Ratio',
      range: { max: 0.9, min: 0.3, step: 0.01 },
      type: 'number',
    },
    gnarliness: {
      description: 'Random-walk curvature per growth section, amplified as branches thin: trunks stay stately, twigs wander. Branching generator only. Construction-only.',
      label: 'Gnarliness',
      range: { max: 0.6, min: 0, step: 0.01 },
      type: 'number',
    },
    forceStrength: {
      description: 'Growth force: every section steers toward vertical with 1/radius compliance. Positive sweeps tips skyward (broadleaf crowns); negative droops them (pines, willows). Branching generator only. Construction-only.',
      label: 'Growth Force',
      range: { max: 0.15, min: -0.08, step: 0.005 },
      type: 'number',
    },
    conifer: {
      description: 'Evergreen behavior: branches taper fully and children shorten toward the top \\u2014 the layered cone silhouette. Pair with high Children, Branch Angle ~110, negative Growth Force. Branching generator only. Construction-only.',
      label: 'Conifer',
      type: 'boolean',
    },
    attractionCount: {
      description: 'Number of crown attraction points the limbs grow toward; more points grow more, finer limbs. Construction-only.',
      label: 'Attraction Count',
      range: { max: 200, min: 10, step: 1 },
      type: 'number',
    },
    segmentLength: {
      description: 'Growth step length in meters; shorter steps grow smoother, curvier limbs. Construction-only.',
      label: 'Segment Length',
      range: { max: 0.8, min: 0.1, step: 0.01 },
      type: 'number',
    },
    influenceRadius: {
      description: 'How far an attraction point can pull on a growing limb, in meters. Construction-only.',
      label: 'Influence Radius',
      range: { max: 2.5, min: 0.3, step: 0.05 },
      type: 'number',
    },
    killRadius: {
      description: 'Distance at which a limb consumes an attraction point and stops growing toward it. Construction-only.',
      label: 'Kill Radius',
      range: { max: 1, min: 0.1, step: 0.01 },
      type: 'number',
    },
    maxSteps: {
      description: 'Growth iteration cap. Construction-only.',
      label: 'Max Steps',
      range: { max: 96, min: 4, step: 1 },
      type: 'number',
    },
    maxNodes: {
      description: 'Skeleton node cap; lower keeps trees to a few clean limbs. Construction-only.',
      label: 'Max Nodes',
      range: { max: 400, min: 20, step: 1 },
      type: 'number',
    },
    radialSegments: {
      description: 'Cross-section segment count of each bark tube. Construction-only.',
      label: 'Radial Segments',
      range: { max: 16, min: 3, step: 1 },
      type: 'number',
    },
    tipRadius: {
      description: 'Radius of the thinnest twigs in meters; pipe-model radii grow from here toward the root. Construction-only.',
      label: 'Tip Radius',
      range: { max: 0.15, min: 0.005, step: 0.001 },
      type: 'number',
    },
    minLimbRadius: {
      description: 'Limbs thinner than this get no bark tube and are left to the leaves. Construction-only.',
      label: 'Min Limb Radius',
      range: { max: 0.15, min: 0, step: 0.001 },
      type: 'number',
    },
    attachmentTwigRadius: {
      description: 'Wood thinner than this sprouts leaf tufts in canopy mode. Construction-only.',
      label: 'Attachment Twig Radius',
      range: { max: 0.3, min: 0, step: 0.005 },
      type: 'number',
    },
    attractionReach: {
      description: 'How deep into each crown blob attraction points sample (fraction of blob radius); null/unset is automatic (0.65 canopy mode, 0.92 tips mode). Construction-only.',
      label: 'Attraction Reach',
      range: { max: 1, min: 0, step: 0.01 },
      type: 'number',
    },
  },
  canopy: {
    architecture: {
      description: 'Branch-attached foliage layout: historical round clouds, stacked sprays, conifer whorls, or palm-like radial fronds. Construction-only.',
      label: 'Architecture',
      optionLabels: Object.freeze({
        'cloud-cards': 'Cloud Cards',
        'layered-sprays': 'Layered Sprays',
        'needle-whorls': 'Needle Whorls',
        'radial-fronds': 'Radial Fronds',
      }),
      options: Object.freeze(['cloud-cards', 'layered-sprays', 'needle-whorls', 'radial-fronds']),
      type: 'select',
    },
    cardCount: {
      description: 'Base leaf-card count before density and coverage scaling; few LARGE overlapping cards keep the crown one fluffy mass. Construction-only.',
      label: 'Card Count',
      range: { max: 600, min: 20, step: 1 },
      type: 'number',
    },
    cardSizeRange: {
      description: 'Min/max leaf-cluster card size in meters. Construction-only.',
      label: 'Card Size Range',
      type: 'vector2',
    },
    cardsPerCluster: {
      description: 'Cards per leaf tuft around each branch attachment. Construction-only. (In tips placement the built-in default becomes 9.)',
      label: 'Cards Per Cluster',
      range: { max: 20, min: 1, step: 1 },
      type: 'number',
    },
    clusterRadius: {
      description: 'Radius in meters of each leaf tuft around its branch end. Construction-only. (In tips placement the built-in default becomes 0.62.)',
      label: 'Cluster Radius',
      range: { max: 1.5, min: 0.1, step: 0.01 },
      type: 'number',
    },
    sprayLayers: {
      description: 'Number of stacked foliage planes at each layered-spray attachment. Construction-only.',
      label: 'Spray Layers',
      range: { max: 12, min: 1, step: 1 },
      type: 'number',
    },
    spraySpread: {
      description: 'Branch-local radius of each layered spray in meters. Construction-only.',
      label: 'Spray Spread',
      range: { max: 4, min: 0.05, step: 0.01 },
      type: 'number',
    },
    sprayThickness: {
      description: 'Separation between the stacked spray planes in meters. Construction-only.',
      label: 'Spray Thickness',
      range: { max: 2, min: 0, step: 0.01 },
      type: 'number',
    },
    whorlArms: {
      description: 'Radial arm count around a conifer foliage attachment. Construction-only.',
      label: 'Whorl Arms',
      range: { max: 24, min: 3, step: 1 },
      type: 'number',
    },
    whorlRadius: {
      description: 'Radius of each conifer foliage whorl in meters. Construction-only.',
      label: 'Whorl Radius',
      range: { max: 3, min: 0.05, step: 0.01 },
      type: 'number',
    },
    frondCount: {
      description: 'Number of radial frond directions at each attachment. Construction-only.',
      label: 'Frond Count',
      range: { max: 24, min: 3, step: 1 },
      type: 'number',
    },
    frondLength: {
      description: 'Maximum radial frond reach in meters. Construction-only.',
      label: 'Frond Length',
      range: { max: 4, min: 0.1, step: 0.01 },
      type: 'number',
    },
    shellFill: {
      description: 'Fill the blob shells between tufts so the crown reads as one solid mass; off leaves bare wood between end bushes. Construction-only. (Tips placement turns this off by default.)',
      label: 'Shell Fill',
      type: 'boolean',
    },
  },
  foliage: {
    alphaCutoff: {
      description: 'Alpha-cutout threshold for the leaf sprite; low enough that mipmap-averaged alpha does not erode distant crowns.',
      label: 'Alpha Cutoff',
      range: { max: 1, min: 0, step: 0.01 },
      type: 'number',
    },
    windDirection: {
      description: 'Horizontal (XZ) heading the canopy flutter drifts toward.',
      label: 'Wind Direction',
      type: 'vector2',
    },
    windSpeed: {
      description: 'How fast the leaf-card flutter oscillates.',
      label: 'Wind Speed',
      range: { max: 4, min: 0, step: 0.01 },
      type: 'number',
    },
    windStrength: {
      description: 'How far leaf cards sway with the wind.',
      label: 'Wind Strength',
      range: { max: 0.5, min: 0, step: 0.005 },
      type: 'number',
    },
    sunDirection: {
      description: 'World-space direction toward the sun. Match your main directional light.',
      label: 'Sun Direction',
      type: 'vector3',
    },
    sunColor: {
      description: 'Sunlight tint applied to lit leaf cards.',
      label: 'Sun Color',
      type: 'color',
    },
    skyColor: {
      description: 'Ambient sky tint mixed into shaded leaf cards.',
      label: 'Sky Color',
      type: 'color',
    },
    sceneShadowStrength: {
      description: 'How strongly renderer shadow maps shift the crown toward its shadow palette. 0 disables.',
      label: 'Scene Shadow Strength',
      range: { max: 1, min: 0, step: 0.01 },
      type: 'number',
    },
    backlitStrength: {
      description: 'Translucent glow on leaves between the camera and the sun.',
      label: 'Backlit Strength',
      range: { max: 2, min: 0, step: 0.01 },
      type: 'number',
    },
    cloudShadowStrength: {
      description: 'How strongly drifting procedural cloud shadows darken the crown. 0 disables the effect.',
      label: 'Cloud Shadow Strength',
      range: { max: 1, min: 0, step: 0.01 },
      type: 'number',
    },
    cloudShadowCoverage: {
      description: 'Fraction of the world covered by cloud shadow at any moment.',
      label: 'Cloud Shadow Coverage',
      range: { max: 1, min: 0, step: 0.01 },
      type: 'number',
    },
    cloudShadowScale: {
      description: 'World-to-noise scale of the cloud shadow pattern; smaller values give larger cloud shapes.',
      label: 'Cloud Shadow Scale',
      range: { max: 0.1, min: 0.001, step: 0.001 },
      type: 'number',
    },
    cloudShadowVelocity: {
      description: 'Cloud shadow drift in noise-space units per second (world drift = velocity / scale).',
      label: 'Cloud Shadow Velocity',
      type: 'vector2',
    },
  },
});

function createTreeFieldMetadata(group, key, field) {
  const defaultValue = DEFAULT_STYLIZED_TREE_SETTINGS[group.id][key];
  return Object.freeze({
    defaultValue: Array.isArray(defaultValue) ? [...defaultValue] : defaultValue,
    description: field.description,
    group: group.id,
    id: `${group.id}.${key}`,
    key,
    label: field.label,
    optionLabels: field.optionLabels ?? null,
    options: field.options ?? null,
    range: field.range ?? null,
    serializable: field.serializable ?? true,
    type: field.type,
  });
}

/**
 * Field metadata (id/group/key/label/description/type/range/defaultValue/
 * serializable) per settings group, in the shape consumed by
 * `createSettingsPanel`. Group ids and keys match
 * {@link DEFAULT_STYLIZED_TREE_SETTINGS}.
 */
export const STYLIZED_TREE_SETTING_FIELD_SCHEMA = Object.freeze(
  Object.fromEntries(
    STYLIZED_TREE_SETTING_GROUPS.map((group) => [
      group.id,
      Object.freeze(
        Object.fromEntries(
          Object.entries(STYLIZED_TREE_FIELD_DEFINITIONS[group.id] ?? {})
            .map(([key, field]) => [key, createTreeFieldMetadata(group, key, field)]),
        ),
      ),
    ]),
  ),
);

function sameSettingValue(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((value, index) => value === b[index]);
  }
  return a === b;
}

// Complete tree: curved trunk + leaf-card canopy in one Object3D.
// All options forwarded, all optional:
//   size         — overall multiplier (1 ≈ 3 m tree, 2 ≈ 6 m, 3+ large)
//   canopyColor  — any resolveCanopyColor spec: one color, a list to pick
//                  from, { from, to } blend, or HSL ranges — resolved
//                  deterministically per seed, so a forest built from one
//                  spec gets stable per-tree variation
//   canopyPalette— pin { lit, shadow, crown } tones explicitly (partial ok)
//   canopyWidth / canopyDepth — X / Z crown reach multipliers (a 1.6 / 0.7
//                  tree is wide from the front but shallow from the side)
//   leafDensity  — 0..1 crown coverage; below ~0.9 see-through gaps open
//   leafPlacement— 'canopy' (default): solid leaf mass hiding interior wood;
//                  'tips': bushes only at the branch ends, long bare limbs
//                  on show between them (Sumeru-style silhouettes)
//   trunk        — createTreeTrunkGeometry options (or a TREE_TRUNK_STYLES spread)
//   skeleton     — createTreeSkeleton options (limbsPerBlob, limbRadius, ...)
//   canopy       — createTreeFoliageGeometry options (blobs, cardCount, ...)
//   foliage      — createTreeFoliageMaterials options (cutoff, wind, sun, ...)
//   trunkMaterial— any THREE material; default is a stylized woody material
//   trunkSurfaceProfile — registered generated bark profile. Call Me Sensei
//                  selects its package-owned fissured bark when neither this
//                  option nor an authored trunkMap is supplied. Use 'none' to
//                  make an intentional flat-color trunk.
export class StylizedTree extends THREE.Group {
  constructor(options = {}) {
    super();
    // Sketch-tool data rides beside the grouped settings (all plain JSON,
    // serialized by toJSON, so hand-drawn recipes stay deterministic):
    //   branchSpines     — [{ points, radiusStart, radiusEnd, leafTip }]:
    //                      bark tubes swept along drawn curves (tree-local,
    //                      pre-size); leafTip !== false grows a leaf tuft at
    //                      the end via the mandatory-attachment pass
    //   extraBlobs       — [{ offset, radius }] canopy-local blobs appended
    //                      to the layout (closed-silhouette fills)
    //   extraAttachments — [{ position, direction }] canopy-local leaf tufts
    //                      along an open drawn stroke
    //   branchOverrides  — { [attachmentIndex]: { cardsPerCluster?,
    //                      clusterRadius?, densityScale? } }: per-branch
    //                      foliage tuft overrides (Tree Lab's branch
    //                      inspector). Indices follow generation order, so
    //                      they are stable per seed + skeleton settings.
    //   leafShape        — { preset: 'teardrop'|'round'|'maple'|'gingko'|
    //                      'needle'|'custom', outline?: [[x,y],...] }: the
    //                      single-leaf silhouette the crown sprite (and the
    //                      designer's falling-leaf particles) stamp from.
    //                      Plain JSON; an explicit foliage.leafMap wins.
    //   roots            — { preset: 'none'|'small'|'medium'|'large' }:
    //                      procedural surface roots radiating from the base
    //                      collar (a complete tree meets the ground).
    const {
      trunkMaterial = null,
      trunkMap = null,
      trunkSurfaceProfile = null,
      vegetationShader = null,
      branchSpines = [],
      extraBlobs = [],
      extraAttachments = [],
      branchOverrides = null,
      leafShape = null,
      roots = null,
      styleTarget = {},
      trunkProfile = null,
      woodDetails = null,
    } = cleanObject(options);
    const settings = createStylizedTreeSettings(options);
    const {
      size,
      seed,
      canopyColor,
      canopyPalette,
      canopyWidth,
      canopyDepth,
      leafDensity,
      canopyScale,
      leafPlacement,
      trunkColor,
      // Massive pale-limbed trees read better without the canopy shadow-mapping
      // onto their own wood (the anime look keeps exposed limbs bright).
      trunkReceiveShadow,
      // createCanopyBlobs options (lobeCount, spread, flatten, coreRadius, ...)
      // so the crown layout stays declarative in recipes; pinning explicit
      // blobs via canopy.blobs still wins.
      canopyLayout,
    } = settings.tree;
    this.name = 'StylizedTree';
    // Kept for toJSON() so the tree can serialize itself into a recipe.
    // Not cloned; mutating it after construction is undefined behavior.
    this.config = options;
    // Fully-resolved grouped settings (see DEFAULT_STYLIZED_TREE_SETTINGS); the
    // runtime-applicable slice can be re-tuned via applySettings().
    this.settings = settings;

    // Every tree gets its own irregular, wider-than-tall crown layout unless
    // the caller pins an explicit blob set. Sketch blobs extend the layout,
    // steering both the skeleton growth and the leaf-card fill.
    const blobs = [
      ...(settings.canopy.blobs ??
        createCanopyBlobs({ seed, width: canopyWidth, depth: canopyDepth, ...canopyLayout })),
      ...extraBlobs,
    ];
    // skeleton.generator picks the wood: 'limbs' grows toward the crown
    // blobs (solid anime crowns), 'branching' recurses a central leader
    // (open realistic silhouettes), 'drawn' skips procedural wood
    // entirely — the tree is exactly the hand-drawn branchSpines.
    const generator = settings.skeleton.generator;
    const trunkResult = generator === 'branching'
      ? createBranchingTreeSkeleton({
        seed,
        trunk: settings.trunk,
        canopyScale,
        ...settings.skeleton,
      })
      : generator === 'drawn'
        ? { geometry: null, canopyAnchor: null, attachments: [] }
        : createTreeSkeleton({
          seed,
          trunk: settings.trunk,
          canopyScale,
          blobs,
          leafPlacement,
          ...settings.skeleton,
        });

    // Hand-drawn branches: sweep a bark tube along each spine; leaf-tipped
    // spines contribute a mandatory tuft attachment so leaves engulf the
    // drawn branch end automatically. Swept before attachment conversion
    // because in drawn mode the crown anchor derives from the spine tips.
    const spineTubes = [];
    // grow:true spines (Grow from Doodle on an existing tree) sprout a mini
    // EZ-style skeleton ALONG the stroke — sub-branches + foliage — instead
    // of a bare tube, composing with whatever generator built the trunk.
    const grownSpines = [];
    for (const spine of branchSpines) {
      if (spine.grow) {
        grownSpines.push(createBranchingTreeSkeleton({
          trunk: { radiusBottom: Math.max(spine.radiusStart ?? 0.06, 0.02) },
          trunkSpine: spine.points,
          seed: seed * 3.7 + grownSpines.length * 11.3,
          canopyScale: 1,
          levels: 2,
          childrenCount: 3,
          branchStart: 0.3,
          branchAngle: settings.skeleton.branchAngle,
          lengthRatio: settings.skeleton.lengthRatio,
          radiusRatio: settings.skeleton.radiusRatio,
          gnarliness: settings.skeleton.gnarliness,
          forceStrength: settings.skeleton.forceStrength,
          radialSegments: settings.skeleton.radialSegments,
          tipRadius: settings.skeleton.tipRadius,
          maxBranches: 60,
          maxAttachments: 70,
        }));
        continue;
      }
      // Grounded stems grow FROM the earth: sink the base below grade (no
      // visible cap, ever) and flare the first rings like a real root
      // collar. Branch spines starting on wood are untouched.
      const grounded = spine.points[0][1] <= 0.02;
      const points = grounded
        ? [
          [spine.points[0][0], -0.12, spine.points[0][2]],
          ...spine.points,
        ]
        : spine.points;
      const tube = createBranchTubeGeometry({
        radialSegments: settings.skeleton.radialSegments,
        ...spine,
        flareBase: grounded,
        points,
        // A drawn trunk cross-section applies to grounded stems only.
        ...(grounded && trunkProfile?.outline
          ? { profile: polarProfileFromOutline(trunkProfile.outline) }
          : {}),
      });
      if (tube) spineTubes.push({ spine, tube });
    }
    // Drawn mode anchors the canopy at the ORIGIN (canopy-local equals
    // tree-local): scribbled foliage and tuft positions stay stable no
    // matter what wood is drawn later.
    const canopyAnchor = trunkResult.canopyAnchor ?? new THREE.Vector3(0, 0, 0);
    const attachments = [...trunkResult.attachments];
    for (const { spine, tube } of spineTubes) {
      if (spine.leafTip !== false) {
        const direction = tube.tipTangent.clone().normalize();
        attachments.push({
          position: tube.tip.clone().sub(canopyAnchor).divideScalar(canopyScale),
          direction,
          tangent: direction.clone(),
          depth: 1,
          normalizedHeight: THREE.MathUtils.clamp(tube.tip.y / Math.max(settings.trunk.height, 1e-4), 0, 1),
          branchRadius: Math.max(spine.radiusEnd ?? settings.skeleton.tipRadius, 0),
          azimuth: Math.atan2(direction.z, direction.x),
        });
      }
    }
    for (const grown of grownSpines) {
      for (const attachment of grown.attachments) {
        attachments.push({
          position: attachment.position.clone().add(grown.canopyAnchor)
            .sub(canopyAnchor).divideScalar(canopyScale),
          direction: attachment.direction,
          tangent: attachment.tangent ?? attachment.direction,
          depth: attachment.depth,
          normalizedHeight: attachment.normalizedHeight,
          branchRadius: attachment.branchRadius / Math.max(canopyScale, 1e-4),
          azimuth: attachment.azimuth,
        });
      }
    }
    for (const extra of extraAttachments) {
      const direction = extra.direction
        ? new THREE.Vector3(...extra.direction).normalize()
        : new THREE.Vector3(0, 1, 0);
      attachments.push({
        position: new THREE.Vector3(...extra.position),
        direction,
        tangent: direction.clone(),
        depth: Number.isFinite(extra.depth) ? extra.depth : 0,
        normalizedHeight: Number.isFinite(extra.normalizedHeight) ? extra.normalizedHeight : 1,
        branchRadius: Number.isFinite(extra.branchRadius) ? extra.branchRadius : settings.skeleton.tipRadius,
        azimuth: Number.isFinite(extra.azimuth) ? extra.azimuth : Math.atan2(direction.z, direction.x),
      });
    }

    const woodPieces = [
      ...(trunkResult.geometry ? [trunkResult.geometry] : []),
      ...spineTubes.map(({ tube }) => tube.geometry),
      ...grownSpines.map((grown) => grown.geometry),
    ];

    // Surface roots: seeded tubes arcing out from the base collar and
    // burying their tips. Scaled off the trunk radius so they stay
    // proportionate for every tree size.
    const ROOT_PRESETS = {
      large: { count: 7, length: 5.5, radius: 0.62 },
      medium: { count: 5, length: 4.2, radius: 0.52 },
      small: { count: 4, length: 3, radius: 0.42 },
    };
    // Hand-drawn top-down layout: each drawn path IS one root — direction,
    // bend, and length exactly as authored ([-1,1] plan space around the
    // trunk; 1.0 spans ~6 trunk radii, matching the preset footprint).
    if (roots?.preset === 'custom' && Array.isArray(roots.paths) && roots.paths.length) {
      const groundedSpines = branchSpines.filter((spine) => spine.points[0][1] <= 0.02);
      const baseRadius = generator === 'drawn'
        ? Math.max(0.08, ...groundedSpines.map((spine) => spine.radiusStart), 0.08)
        : settings.trunk.radiusBottom;
      const baseX = generator === 'drawn' && groundedSpines.length
        ? groundedSpines[0].points[0][0] : 0;
      const baseZ = generator === 'drawn' && groundedSpines.length
        ? groundedSpines[0].points[0][2] : 0;
      const collarY = Math.min(baseRadius * 0.5, 0.14);
      const planScale = baseRadius * 6;
      for (let i = 0; i < roots.paths.length; i += 1) {
        const path = roots.paths[i];
        // Anchor at the collar regardless of where the stroke began, then
        // follow the drawn plan; height eases collar -> grade -> buried tip.
        const points = [[baseX, collarY, baseZ]];
        for (let j = 0; j < path.length; j += 1) {
          const t = (j + 1) / path.length;
          points.push([
            baseX + path[j][0] * planScale,
            collarY * Math.max(0, 1 - t * 2.2) - 0.18 * Math.max(0, t - 0.55) / 0.45,
            baseZ + path[j][1] * planScale,
          ]);
        }
        const tube = createBranchTubeGeometry({
          flareBase: false,
          irregularity: 0.2,
          points,
          radialSegments: 7,
          radiusEnd: baseRadius * 0.5 * 0.4,
          radiusStart: baseRadius * 0.5,
          seed: seed + i * 13,
        });
        if (tube) woodPieces.push(tube.geometry);
      }
    }
    const rootSpec = ROOT_PRESETS[roots?.preset];
    if (rootSpec) {
      const groundedSpines = branchSpines.filter((spine) => spine.points[0][1] <= 0.02);
      const baseRadius = generator === 'drawn'
        ? Math.max(0.08, ...groundedSpines.map((spine) => spine.radiusStart))
        : settings.trunk.radiusBottom;
      const baseX = generator === 'drawn' && groundedSpines.length
        ? groundedSpines[0].points[0][0] : 0;
      const baseZ = generator === 'drawn' && groundedSpines.length
        ? groundedSpines[0].points[0][2] : 0;
      const rootRng = seededRandom(seed + 31);
      // Roots emerge AT THE BOTTOM of the trunk (the collar sits just above
      // grade regardless of trunk thickness) and hug the ground on the way
      // out, tips buried.
      const collarY = Math.min(baseRadius * 0.5, 0.14);
      for (let i = 0; i < rootSpec.count; i += 1) {
        const azimuth = (i / rootSpec.count) * Math.PI * 2 + rootRng(i) * 0.8;
        const length = baseRadius * rootSpec.length * (0.75 + rootRng(i + 40) * 0.5);
        // Serpentine drift so roots snake instead of radiating like spokes.
        const drift = (rootRng(i + 70) - 0.5) * 0.9;
        const pointAt = (t, y) => {
          const bend = azimuth + drift * t * t;
          return [
            baseX + Math.cos(bend) * (baseRadius * 0.2 + length * t),
            y,
            baseZ + Math.sin(bend) * (baseRadius * 0.2 + length * t),
          ];
        };
        // The tip has to end UNDER the surface. The historical profile dived
        // to a fixed -0.18 however far the root ran, so every preset beyond a
        // stub laid a long tapered spike flat on the ground in full view —
        // this is why `medium` and `large` read as black spider legs around
        // the collar in any frame low enough to see the base, and it lands
        // squarely on the Gate 1 ground-contact shot. Diving in proportion to
        // the root's own reach keeps the collar flare on show and puts the
        // rest of the root where a root belongs.
        const dive = Math.max(0.18, length * 0.44);
        const tube = createBranchTubeGeometry({
          flareBase: false,
          irregularity: 0.2,
          points: [
            pointAt(0, collarY),
            pointAt(0.2, collarY * 0.45),
            pointAt(0.4, -dive * 0.1),
            pointAt(0.6, -dive * 0.3),
            pointAt(0.8, -dive * 0.6),
            pointAt(1, -dive),
          ],
          radialSegments: 7,
          radiusEnd: baseRadius * rootSpec.radius * 0.4,
          radiusStart: baseRadius * rootSpec.radius,
          seed: seed + i * 13,
        });
        if (tube) woodPieces.push(tube.geometry);
      }
    }

    // Wood details: seeded knots (squashed bulges) and scar welts (tall thin
    // ridges) embedded in the lower trunk, so trunks never look
    // factory-perfect. Centers sit inside the trunk surface — details can
    // bulge, never float.
    const knotAmount = Math.max(0, Math.min(1, woodDetails?.knots ?? 0));
    const scarAmount = Math.max(0, Math.min(1, woodDetails?.scars ?? 0));
    if ((knotAmount > 0 || scarAmount > 0) && woodPieces.length) {
      const groundedSpines = branchSpines.filter((spine) => spine.points[0][1] <= 0.02);
      const detailBaseRadius = generator === 'drawn'
        ? Math.max(0.08, ...groundedSpines.map((spine) => spine.radiusStart), 0.08)
        : settings.trunk.radiusBottom;
      const detailBaseX = generator === 'drawn' && groundedSpines.length
        ? groundedSpines[0].points[0][0] : 0;
      const detailBaseZ = generator === 'drawn' && groundedSpines.length
        ? groundedSpines[0].points[0][2] : 0;
      const trunkSpan = generator === 'drawn' && groundedSpines.length
        ? Math.max(0.6, ...groundedSpines[0].points.map((point) => point[1]))
        : settings.trunk.height;
      const detailRng = seededRandom(seed + 57);
      const placeDetail = (index, scaleVec) => {
        const azimuth = detailRng(index) * Math.PI * 2;
        const t = 0.08 + detailRng(index + 100) * 0.45;
        const y = detailBaseRadius * 0.4 + t * trunkSpan * 0.5;
        // Local trunk radius estimate (taper + base flare); embed the center
        // at 80% of it so the bump always pokes out of, and stays glued to,
        // the bark.
        const localRadius = detailBaseRadius * (1 - 0.3 * t)
          * (y < detailBaseRadius ? 1.18 : 1);
        const size = localRadius * (0.35 + detailRng(index + 200) * 0.3);
        const bump = new THREE.SphereGeometry(size, 8, 6);
        bump.scale(...scaleVec);
        const normal = new THREE.Vector3(Math.cos(azimuth), 0.12, Math.sin(azimuth)).normalize();
        bump.lookAt(normal);
        bump.rotateZ(detailRng(index + 300) * Math.PI);
        bump.translate(
          detailBaseX + Math.cos(azimuth) * localRadius * 0.8,
          y,
          detailBaseZ + Math.sin(azimuth) * localRadius * 0.8,
        );
        woodPieces.push(bump);
      };
      const knotCount = Math.round(knotAmount * 8);
      for (let i = 0; i < knotCount; i += 1) placeDetail(i, [1, 1, 0.75]);
      const scarCount = Math.round(scarAmount * 5);
      for (let i = 0; i < scarCount; i += 1) placeDetail(i + 50, [0.35, 2.4, 0.4]);
    }
    let trunkGeometry;
    if (!woodPieces.length) {
      // Blank hand-drawn tree: a sapling stub so there's something to see
      // before the first stroke.
      trunkGeometry = new THREE.CylinderGeometry(0.02, 0.035, 0.3, 6);
      trunkGeometry.translate(0, 0.15, 0);
    } else if (woodPieces.length === 1) {
      trunkGeometry = woodPieces[0];
    } else {
      trunkGeometry = mergeGeometries(woodPieces);
      woodPieces.forEach((piece) => piece.dispose());
    }
    // Only forward canopy values that differ from the defaults, so the
    // tips-placement geometry presets below keep winning unless the caller
    // explicitly overrides them (exactly the legacy sparse-options behavior).
    //
    // That difference test cannot distinguish "not supplied" from "supplied,
    // and equal to the module default", so a caller that authors the
    // documented default gets the preset instead — cardsPerCluster: 5 lands
    // as the branching preset's 2, silently halving the canopy. Callers that
    // do know which fields they were handed may declare them in
    // `canopy.explicit`, and those are forwarded whatever their value.
    // Nothing that omits `explicit` changes behaviour.
    const explicitCanopyKeys = new Set(
      Array.isArray(settings.canopy.explicit) ? settings.canopy.explicit : [],
    );
    const canopyOverrides = {};
    for (const [key, value] of Object.entries(settings.canopy)) {
      if (key === 'explicit') continue;
      if (explicitCanopyKeys.has(key) ||
          !(key in DEFAULT_STYLIZED_TREE_SETTINGS.canopy) ||
          !sameSettingValue(value, DEFAULT_STYLIZED_TREE_SETTINGS.canopy[key])) {
        canopyOverrides[key] = value;
      }
    }
    const canopyGeometry = createTreeFoliageGeometry({
      seed: seed * 7.31 + 1.7,
      leafDensity,
      attachments,
      // The group is scaled by `size`; cards must stay leaf-sized, so the
      // geometry densifies instead (see coverageScale).
      coverageScale: size * canopyScale,
      ...(leafPlacement === 'tips'
        ? { shellFill: false, cardsPerCluster: 9, clusterRadius: 0.62 }
        : {}),
      // Branching trees carry their foliage on the branches:
      // no blob-shell fill, small tufts. Explicit canopy overrides still win.
      // Branching trees carry their foliage on the branches (no blob-shell
      // crown) — EXCEPT scribbled foliage areas (extraBlobs, e.g. converted
      // leaf doodles), which become the fill layout so painted leaves render.
      ...(generator === 'branching'
        ? {
          shellFill: extraBlobs.length > 0,
          shellBudget: extraBlobs.length ? extraBlobs.length * 8 : null,
          cardsPerCluster: 2, clusterRadius: 0.17, cardSizeRange: [0.27, 0.45],
        }
        : {}),
      ...canopyOverrides,
      // Hand-drawn trees have no generated crown. Scribbled foliage blobs
      // (extraBlobs) become the whole layout and are shell-filled — leaves
      // appear exactly where scribbled. Without scribbles, leaves grow only
      // at drawn branch tips, and not at all before any strokes.
      ...(generator === 'drawn'
        ? (extraBlobs.length
          ? { shellFill: true, shellBudget: extraBlobs.length * 8 }
          : { shellFill: false, ...(attachments.length ? {} : { cardCount: 0 }) })
        : {}),
      attachmentOverrides: resolvePadPruning(
        attachments,
        {
          crownBase: settings.canopy.crownBase,
          densityBoost: settings.canopy.padDensityBoost,
          layers: settings.canopy.padLayers,
          padCount: settings.canopy.padCount,
        },
        branchOverrides,
      ),
      blobs: (generator === 'drawn' || generator === 'branching') && extraBlobs.length
        ? extraBlobs : blobs,
    });
    const materials = createTreeFoliageMaterials({
      color: canopyColor,
      palette: canopyPalette,
      seed,
      ...(leafShape && !settings.foliage.leafMap
        ? { leafMap: leafSpriteForShape(leafShape) }
        : {}),
      ...settings.foliage,
      vegetationShader,
    });

    // A caller can select the style either as `preset` or by handing over the
    // vegetation shader profile itself (a string, or { style } / { preset } —
    // the same shape setVegetationShader accepts). Testing only `options.preset`
    // meant every generator that forwards `vegetationShader` but not `preset` —
    // BranchTree among them — silently built a bare, untextured trunk.
    const requestedStyleId = String(
      options.preset
      ?? (typeof vegetationShader === 'string'
        ? vegetationShader
        : vegetationShader?.style ?? vegetationShader?.preset ?? ''),
    ).trim();
    const styleDefaultSurfaceProfile = TREE_SURFACE_PROFILE_DEFAULTS[requestedStyleId] ?? null;

    this.trunkMesh = new THREE.Mesh(
      trunkGeometry,
      trunkMaterial ?? createWoodySurfaceNodeMaterial({
        color: trunkColor,
        height: settings.trunk.height,
        map: trunkMap ?? (
          trunkSurfaceProfile && trunkSurfaceProfile !== 'none'
            ? createTreeSurfaceTexture({ profileId: trunkSurfaceProfile, seed })
            : styleDefaultSurfaceProfile
              ? createTreeSurfaceTexture({ profileId: styleDefaultSurfaceProfile, seed })
              : null
        ),
        sceneShadowStrength: trunkReceiveShadow ? 1 : 0,
        vegetationShader,
      }),
    );
    this.trunkMaterialAuthored = trunkMaterial != null;
    this.trunkMesh.userData.toonlabVegetationRole = 'woodySurface';
    const authoredTrunkMap = trunkMap ?? trunkMaterial?.map ?? null;
    const selectedTrunkSurfaceProfile = authoredTrunkMap
      ? null
      : trunkSurfaceProfile && trunkSurfaceProfile !== 'none'
        ? trunkSurfaceProfile
        : styleDefaultSurfaceProfile;
    this.trunkMesh.material.userData.toonlabBarkSurface = {
      profileId: selectedTrunkSurfaceProfile,
      source: authoredTrunkMap
        ? 'authored-texture'
        : selectedTrunkSurfaceProfile ? 'registered-profile' : 'flat-color',
    };
    this.trunkSurfaceProfile = trunkSurfaceProfile === 'none'
      ? 'none'
      : selectedTrunkSurfaceProfile;
    this.trunkMesh.castShadow = true;
    this.trunkMesh.receiveShadow = trunkReceiveShadow;

    this.canopyMesh = new THREE.Mesh(canopyGeometry, materials.material);
    this.canopyMesh.customDepthMaterial = materials.depthMaterial;
    this.canopyMesh.castShadow = true;
    this.canopyMesh.receiveShadow = true;
    this.canopyMesh.frustumCulled = false;
    this.canopyMesh.position.copy(canopyAnchor);
    this.canopyMesh.scale.setScalar(canopyScale);
    this.canopyMesh.userData.environmentShaderExclude = true;
    markFactoryStyleMaterial(this.trunkMesh.material, 'TreeTrunk', {
      managed: trunkMaterial == null,
    });
    markFactoryStyleMaterial(this.canopyMesh.material, 'TreeFoliage');
    // Branch-end tuft anchors in canopyMesh-local space, index-aligned with
    // the aAttachment card attribute — the designer's branch picker uses
    // both to map a clicked leaf back to its branch.
    this.foliageAttachments = attachments;

    this.add(this.trunkMesh, this.canopyMesh);
    attachFactoryStyleTarget(this, 'vegetation.tree', {
      targetId: 'toonlab/tree',
      ...styleTarget,
      materials: {
        assignments: {
          TreeFoliage: { roles: ['foliageCard'] },
          TreeTrunk: { roles: ['woodySurface'] },
        },
        ...(styleTarget.materials ?? {}),
      },
    });
    this.scale.setScalar(size);
  }

  /**
   * Runtime re-tune: merges partial grouped settings ({ tree, trunk,
   * skeleton, canopy, foliage }) into the current settings and pushes every
   * runtime-applicable value into the live materials:
   *
   * - `foliage.*` — wind, sun, alpha cutoff, backlit, scene/cloud shadows
   *   (shared with the shadow-depth material).
   * - `tree.canopyColor` / `tree.canopyPalette` — the lit/shadow/crown
   *   palette is re-derived and written into the canopy uniforms.
   * - `tree.trunkReceiveShadow` — toggles bark shadow receiving.
   *
   * Geometry-baked groups (`trunk`, `skeleton`, `canopy`) and the tree
   * topology fields (`size`, `seed`, `canopyWidth/Depth/Scale/Layout`,
   * `leafDensity`, `leafPlacement`) are construction-only: new values are
   * stored on `this.settings` but the meshes are not regrown — build a new
   * StylizedTree for those. Note that the convenience setters (setWind,
   * setSun, ...) write uniforms directly without updating `this.settings`.
   *
   * @param {Object} [options] Partial grouped settings, same shape as
   *   {@link DEFAULT_STYLIZED_TREE_SETTINGS}.
   * @returns {Object} The updated settings object.
   */
  applySettings(options = {}) {
    const source = cleanObject(options);
    const merged = {};
    for (const groupId of Object.keys(DEFAULT_STYLIZED_TREE_SETTINGS)) {
      merged[groupId] = { ...this.settings[groupId] };
      for (const [key, value] of Object.entries(cleanObject(source[groupId]))) {
        if (value !== undefined) merged[groupId][key] = value;
      }
    }
    const settings = createStylizedTreeSettings(merged);
    this.settings = settings;

    const foliage = settings.foliage;
    const uniforms = this.canopyMesh.material.uniforms;
    uniforms.uWindDirection.value.set(foliage.windDirection[0], foliage.windDirection[1]);
    uniforms.uWindSpeed.value = foliage.windSpeed;
    uniforms.uWindStrength.value = foliage.windStrength;
    uniforms.uAlphaCutoff.value = foliage.alphaCutoff;
    uniforms.uSunDirection.value.set(...foliage.sunDirection);
    uniforms.uSunColor.value.setRGB(...foliage.sunColor, THREE.SRGBColorSpace);
    uniforms.uSkyColor.value.setRGB(...foliage.skyColor, THREE.SRGBColorSpace);
    uniforms.uSceneShadowStrength.value = foliage.sceneShadowStrength;
    uniforms.uBacklitStrength.value = foliage.backlitStrength;
    uniforms.uCloudShadowStrength.value = foliage.cloudShadowStrength;
    uniforms.uCloudShadowCoverage.value = foliage.cloudShadowCoverage;
    uniforms.uCloudShadowScale.value = foliage.cloudShadowScale;
    uniforms.uCloudShadowVelocity.value.set(
      foliage.cloudShadowVelocity[0], foliage.cloudShadowVelocity[1]);
    setWoodySurfaceSun(this.trunkMesh.material, {
      color: foliage.sunColor,
      direction: foliage.sunDirection,
      sky: foliage.skyColor,
    });

    // Re-derive the three-tone palette from the (possibly updated) canopy
    // color/palette pins. Constructor-only foliage.color/palette overrides
    // are not tracked here; prefer tree.canopyColor / tree.canopyPalette.
    const palette = deriveCanopyPalette(
      resolveCanopyColor(settings.tree.canopyColor, settings.tree.seed),
      settings.tree.canopyPalette,
    );
    uniforms.uLitColor.value.copy(palette.lit);
    uniforms.uShadowColor.value.copy(palette.shadow);
    uniforms.uCrownColor.value.copy(palette.crown);

    if (this.trunkMesh.receiveShadow !== settings.tree.trunkReceiveShadow) {
      this.trunkMesh.receiveShadow = settings.tree.trunkReceiveShadow;
      this.trunkMesh.material.needsUpdate = true;
    }
    if (this.trunkMesh.material.uniforms?.uSceneShadowStrength) {
      this.trunkMesh.material.uniforms.uSceneShadowStrength.value =
        settings.tree.trunkReceiveShadow ? 1 : 0;
    }
    return this.settings;
  }

  setSun(options) {
    setCanopySun(this.canopyMesh.material.uniforms, options ?? {});
    setWoodySurfaceSun(this.trunkMesh.material, options ?? {});
    return this;
  }

  setWind(options) {
    setCanopyWind(this.canopyMesh.material.uniforms, options);
    return this;
  }

  // How strongly scene shadows shift the crown toward its shadow palette.
  setSceneShadow(options) {
    setCanopySceneShadow(this.canopyMesh.material.uniforms, options);
    return this;
  }

  // Drifting procedural cloud shadows across the crown. strength 0 disables.
  setCloudShadow(options) {
    setCanopyCloudShadow(this.canopyMesh.material.uniforms, options);
    return this;
  }

  /** Current world surface state; material response coefficients stay in the vegetation shader profile. */
  setSurfaceWeather({ wetness, snowCover } = {}) {
    for (const material of [this.canopyMesh?.material, this.trunkMesh?.material]) {
      const uniforms = material?.uniforms;
      if (uniforms?.uWetness && wetness !== undefined) {
        uniforms.uWetness.value = THREE.MathUtils.clamp(Number(wetness) || 0, 0, 1);
      }
      if (uniforms?.uSnowCover && snowCover !== undefined) {
        uniforms.uSnowCover.value = THREE.MathUtils.clamp(Number(snowCover) || 0, 0, 1);
      }
    }
    return this;
  }

  setVegetationShader(profile) {
    const styleId = String(profile?.style ?? profile?.preset ?? '').trim();
    const surface = styleId === 'call_me_sensei'
      ? this.ensureTrunkSurface({
        profileId: TREE_SURFACE_PROFILE_DEFAULTS.call_me_sensei,
        vegetationShader: profile,
      })
      : null;
    const report = applyVegetationShader(this, profile);
    if (surface) report.surface = surface;
    return report;
  }

  /**
   * Ensures a generated tree never falls back to an accidental bare trunk.
   * Authored maps and an explicit `trunkSurfaceProfile: 'none'` always win.
   */
  ensureTrunkSurface({
    profileId = TREE_SURFACE_PROFILE_DEFAULTS.call_me_sensei,
    vegetationShader = null,
  } = {}) {
    if (!TREE_SURFACE_PROFILES[profileId]) {
      throw new Error(`Unknown tree surface profile "${profileId}".`);
    }
    if (this.trunkSurfaceProfile === 'none') {
      return { applied: false, profileId: null, reason: 'explicit-none' };
    }
    if (this.trunkMaterialAuthored) {
      return { applied: false, profileId: null, reason: 'authored-material' };
    }
    const current = this.trunkMesh?.material;
    if (current?.map) {
      return {
        applied: false,
        profileId: current.userData?.toonlabBarkSurface?.profileId ?? null,
        reason: current.userData?.toonlabBarkSurface?.source ?? 'authored-texture',
      };
    }
    const map = createTreeSurfaceTexture({
      profileId,
      seed: this.settings.tree.seed,
    });
    const replacement = createWoodySurfaceNodeMaterial({
      color: current?.uniforms?.uBaseColor?.value ?? this.settings.tree.trunkColor,
      height: this.settings.trunk.height,
      map,
      sceneShadowStrength: this.settings.tree.trunkReceiveShadow ? 1 : 0,
      vegetationShader,
    });
    replacement.userData.toonlabManagedMaterial = true;
    replacement.userData.toonlabBarkSurface = {
      profileId,
      source: 'style-fallback',
    };
    markFactoryStyleMaterial(replacement, 'TreeTrunk', { managed: true });
    this.trunkMesh.material = replacement;
    return { applied: true, profileId, reason: 'style-fallback' };
  }

  /** Mirrors the host's linear THREE.Fog onto the true billboarded leaf depth. */
  setSceneFog(fog) {
    syncFoliageFog(this.canopyMesh?.material, fog);
    return this;
  }

  update(delta) {
    tickCanopyTime(this.canopyMesh.material.uniforms, delta);
    return this;
  }

  // Recipe document that rebuilds this exact tree (generation is
  // deterministic per seed): new StylizedTree(tree.toJSON().options).
  // Deliberately shadows Object3D.toJSON — the recipe IS the serialization
  // for procedural plants; ObjectLoader round-trips are not supported.
  toJSON() {
    return {
      schema: TREE_RECIPE_SCHEMA,
      version: TREE_RECIPE_VERSION,
      type: 'tree',
      architecture: { id: 'legacy-woody', engine: 'legacy-woody', version: 2 },
      options: serializableTreeOptions(this.config),
    };
  }

  dispose() {
    this.trunkMesh.geometry.dispose();
    this.trunkMesh.material.dispose();
    this.canopyMesh.geometry.dispose();
    this.canopyMesh.material.dispose();
    this.canopyMesh.customDepthMaterial?.dispose();
  }
}
