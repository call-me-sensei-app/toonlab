import * as THREE from 'three';

import { createTreeLeafNodeMaterial } from '../shaders-tsl/tree-leaf.js';

export const TREE_FOLIAGE_ARCHITECTURES = Object.freeze([
  'cloud-cards',
  'layered-sprays',
  'needle-whorls',
  'radial-fronds',
]);

function resolveFoliageArchitecture(value) {
  return TREE_FOLIAGE_ARCHITECTURES.includes(value) ? value : 'cloud-cards';
}

// Modern anime-style tree canopies: instead of a lumpy low-poly blob, the crown is
// built from hundreds of camera-facing leaf-cluster cards sampled over a set
// of overlapping sphere "blobs". Each card's shading normal is baked to point
// outward from the canopy core, so the toon ramp lights the whole crown as a
// single soft volume — the core trick behind modern anime style trees.
//
//   const geometry = createTreeFoliageGeometry({ seed: 3 });
//   const { material, depthMaterial } = createTreeFoliageMaterials({ color: 0x4da258 });
//   const canopy = new THREE.Mesh(geometry, material);
//   canopy.customDepthMaterial = depthMaterial;   // leafy cast shadows
//   canopy.castShadow = true;
//   material.uniforms.uTime.value += delta;       // each frame

// Deterministic RNG so tree variants are stable across reloads.
function mulberry32(seed) {
  let state = Math.floor(seed * 1e6) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fallback blob layout: one big core with satellite lobes. Prefer
// createCanopyBlobs() for real trees — identical blobs make every crown the
// same near-sphere.
export const TREE_FOLIAGE_BLOBS = [
  { offset: [0, 0, 0], radius: 1.0 },
  { offset: [-0.58, -0.3, 0.12], radius: 0.62 },
  { offset: [0.54, -0.34, -0.16], radius: 0.58 },
  { offset: [0.14, 0.48, 0.06], radius: 0.56 },
  { offset: [-0.2, -0.12, 0.55], radius: 0.5 },
  { offset: [0.08, -0.2, -0.56], radius: 0.48 },
];

// Seeded irregular crown layout, anime-style: wider than tall, asymmetric
// lobes ringing the core at varying heights, and sometimes an outrigger tuft
// on a long limb past the main mass. Feed the result to both
// createTreeSkeleton and createTreeFoliageGeometry so limbs and leaves agree.
//   spread  — horizontal reach of the lobes (1 ≈ core radius)
//   width   — X-axis reach multiplier; depth — Z-axis reach multiplier.
//             width 1.6 / depth 0.7 gives a wide, shallow hedge-like crown.
//   flatten — vertical squash; low values give the wide, layered look
export function createCanopyBlobs({
  lobeCount = 6,
  spread = 1.25,
  width = 1,
  depth = 1,
  flatten = 0.5,
  coreRadius = 0.9,
  lobeRadiusRange = [0.45, 0.78],
  outriggerChance = 0.65,
  seed = 1,
} = {}) {
  const rng = mulberry32(seed + 5.13);
  const blobs = [{ offset: [0, 0.05, 0], radius: coreRadius }];
  for (let i = 0; i < lobeCount; i += 1) {
    const angle = (i / lobeCount) * Math.PI * 2 + (rng() - 0.5) * 1.4;
    const distance = spread * (0.5 + rng() * 0.55);
    blobs.push({
      offset: [
        Math.cos(angle) * distance * width,
        (rng() * 2 - 0.65) * flatten,
        Math.sin(angle) * distance * depth,
      ],
      radius: THREE.MathUtils.lerp(lobeRadiusRange[0], lobeRadiusRange[1], rng()),
    });
  }
  if (rng() < outriggerChance) {
    const angle = rng() * Math.PI * 2;
    blobs.push({
      offset: [
        Math.cos(angle) * spread * 1.7 * width,
        (rng() - 0.6) * flatten,
        Math.sin(angle) * spread * 1.7 * depth,
      ],
      radius: lobeRadiusRange[0] * (0.8 + rng() * 0.4),
    });
  }
  return blobs;
}

// Alpha-cutout leaf-cluster sprite drawn at runtime (no texture assets).
// The card must read as FOLIAGE: a dense mass of many distinct small leaves.
// Heavy overlap keeps the middle solid (so crowns never look like confetti)
// while individual leaf silhouettes stay visible on the rim and as strong
// per-leaf luminance variation inside (so it never looks like a smooth
// cloud-blob either). Leaves are drawn inside-out: dark random-facing
// interior leaves first, bright outward-pointing rim leaves on top.
// RGB holds per-leaf luminance, alpha holds the cutout silhouette.
/**
 * Traces one leaf silhouette into the 2D context, centered at the origin,
 * `length` tall along Y and `width` wide. Shared by the crown sprite, the
 * designer's shape previews, and the falling-leaf particles, so a shape
 * choice looks identical everywhere.
 *
 * @param {string} shape 'teardrop'|'round'|'oak'|'maple'|'gingko'|'needle'|'custom'
 * @param {Array<[number, number]>|null} outline Normalized custom outline
 *   (points in -0.5..0.5 leaf-local space, y = tip direction).
 */
export function traceLeafShapePath(ctx, shape, length, width, outline = null) {
  ctx.beginPath();
  if (shape === 'custom' && outline?.length >= 3) {
    ctx.moveTo(outline[0][0] * width, outline[0][1] * length);
    for (let i = 1; i < outline.length; i += 1) {
      ctx.lineTo(outline[i][0] * width, outline[i][1] * length);
    }
  } else if (shape === 'round') {
    ctx.ellipse(0, 0, width * 0.52, length * 0.5, 0, 0, Math.PI * 2);
  } else if (shape === 'needle') {
    ctx.moveTo(0, -length * 0.5);
    ctx.quadraticCurveTo(width * 0.16, 0, 0, length * 0.5);
    ctx.quadraticCurveTo(-width * 0.16, 0, 0, -length * 0.5);
  } else if (shape === 'oak') {
    // Rounded, alternating lobes and a short tapered base. This is drawn
    // procedurally rather than sampled from any third-party alpha; keeping
    // the sinuses shallow also survives the stylized card mip chain.
    ctx.moveTo(0, -length * 0.5);
    ctx.quadraticCurveTo(width * 0.2, -length * 0.46, width * 0.13, -length * 0.35);
    ctx.quadraticCurveTo(width * 0.42, -length * 0.31, width * 0.22, -length * 0.17);
    ctx.quadraticCurveTo(width * 0.5, -length * 0.11, width * 0.25, length * 0.01);
    ctx.quadraticCurveTo(width * 0.48, length * 0.1, width * 0.2, length * 0.18);
    ctx.quadraticCurveTo(width * 0.34, length * 0.3, width * 0.08, length * 0.39);
    ctx.lineTo(0, length * 0.5);
    ctx.lineTo(-width * 0.08, length * 0.39);
    ctx.quadraticCurveTo(-width * 0.34, length * 0.3, -width * 0.2, length * 0.18);
    ctx.quadraticCurveTo(-width * 0.48, length * 0.1, -width * 0.25, length * 0.01);
    ctx.quadraticCurveTo(-width * 0.5, -length * 0.11, -width * 0.22, -length * 0.17);
    ctx.quadraticCurveTo(-width * 0.42, -length * 0.31, -width * 0.13, -length * 0.35);
    ctx.quadraticCurveTo(-width * 0.2, -length * 0.46, 0, -length * 0.5);
  } else if (shape === 'maple') {
    // Five-lobed star with pinched sinuses.
    const lobes = 5;
    for (let i = 0; i <= lobes * 2; i += 1) {
      const angle = -Math.PI / 2 + (i * Math.PI) / lobes;
      const radial = i % 2 === 0 ? 0.5 : 0.22;
      const x = Math.cos(angle) * width * radial;
      const y = Math.sin(angle) * length * radial;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
  } else if (shape === 'palmate') {
    // Acer palmatum. Seven deeply divided lobes, sinuses cutting almost to
    // the petiole, each lobe lanceolate with a serrated margin.
    //
    // This is NOT a variant of 'maple' above: that outline is a five-point
    // sugar-maple star with blunt lobes and shallow sinuses, which is a
    // correct Acer saccharum and a wrong Acer palmatum. The Japanese maple's
    // whole identity is that the crown reads as lace rather than as a mass of
    // leaf blades, and at 85 mm the difference between a five-point star and
    // a seven-lobe dissected leaf is the difference between the species.
    // The fan is nearly a full circle: on a real A. palmatum the outer pair of
    // lobes swings back past horizontal, almost touching the petiole, which is
    // what gives the leaf its star read rather than a hand read. A narrow fan
    // is the single most common way a stylized "maple" ends up looking like a
    // palm frond instead.
    const lobes = 7;
    const spread = 4.9;                       // full fan, radians (~281 deg)
    const sinus = 0.11;                       // sinus depth, as a radial fraction
    const half = (spread / (lobes - 1)) * 0.34;
    const steps = 10;                         // even → symmetric serration
    let started = false;
    const emit = (angle, radial) => {
      const x = Math.sin(angle) * width * radial;
      const y = -Math.cos(angle) * length * radial;
      if (started) ctx.lineTo(x, y);
      else { ctx.moveTo(x, y); started = true; }
    };
    for (let i = 0; i < lobes; i += 1) {
      const axis = ((i / (lobes - 1)) * 2 - 1) * spread * 0.5;
      for (let side = -1; side <= 1; side += 2) {
        for (let k = 0; k <= steps; k += 1) {
          // Left margin runs outward, right margin runs back in, so the
          // outline stays a single continuous closed loop.
          const step = side < 0 ? k : steps - k;
          const t = step / steps;
          // Lanceolate profile: pinched at the sinus, widest around 40% out,
          // drawn to a point at the tip.
          const body = Math.sin(Math.PI * Math.min(1, 0.08 + t * 0.9)) ** 0.62;
          // Alternating teeth along the margin.
          const tooth = step % 2 === 0 ? 1 : 0.74;
          emit(axis + side * half * body * tooth, sinus + (0.5 - sinus) * t);
        }
      }
    }
  } else if (shape === 'needle-fascicle') {
    // Pinus thunbergii. A black pine's foliage unit is a FASCICLE: two stiff
    // needles bound at a common sheath, diverging into a narrow V. Drawing a
    // pine from single 'needle' blades gives a scatter of loose hairs; the
    // paired V is what makes a card read as pine rather than as fur, and it
    // is also what carries the species' characteristic stiffness.
    // Black pine needles are 6-12 cm long and about 1.5 mm across, held stiff
    // and nearly parallel — the pair diverges by well under 20 deg. A wide V
    // reads as a grass tussock, not as a conifer.
    //
    // The thickness is deliberately far above botanical scale. A card that is
    // 0.5 m across renders about 40 px tall at the distance a garden pine is
    // actually seen from, and a true-scale needle is then a quarter of a pixel:
    // the mip chain averages it below the alpha cutoff and the whole card
    // collapses into a soft lobed blob — which is exactly what the first
    // version did, and it made the pine read as a broadleaf. Stylized conifers
    // exaggerate needle width for the same reason hand-painted ones do.
    const t = width * 0.23;
    const reach = width * 0.17;
    const sheathTop = length * 0.3;
    ctx.moveTo(-t * 1.7, length * 0.5);
    ctx.lineTo(-reach - t * 0.3, -length * 0.5);
    ctx.lineTo(-reach + t * 0.3, -length * 0.48);
    ctx.lineTo(-t * 0.3, sheathTop);
    ctx.lineTo(t * 0.3, sheathTop);
    ctx.lineTo(reach - t * 0.3, -length * 0.48);
    ctx.lineTo(reach + t * 0.3, -length * 0.5);
    ctx.lineTo(t * 1.7, length * 0.5);
  } else if (shape === 'gingko' || shape === 'fan') {
    // Fan: narrow stem base opening to a wide notched top edge.
    ctx.moveTo(0, length * 0.5);
    ctx.quadraticCurveTo(width * 0.55, length * 0.25, width * 0.5, -length * 0.3);
    ctx.quadraticCurveTo(width * 0.2, -length * 0.52, 0, -length * 0.34);
    ctx.quadraticCurveTo(-width * 0.2, -length * 0.52, -width * 0.5, -length * 0.3);
    ctx.quadraticCurveTo(-width * 0.55, length * 0.25, 0, length * 0.5);
  } else {
    // Teardrop (default): round base, pointed tip.
    ctx.moveTo(0, -length * 0.5);
    ctx.quadraticCurveTo(width * 0.62, -length * 0.1, 0, length * 0.5);
    ctx.quadraticCurveTo(-width * 0.62, -length * 0.1, 0, -length * 0.5);
  }
  ctx.closePath();
}

export const LEAF_SHAPE_PRESETS = Object.freeze([
  'teardrop', 'round', 'oak', 'maple', 'palmate', 'gingko', 'needle',
  'needle-fascicle',
]);

/**
 * Shapes whose card is a needle spray rather than a broadleaf cluster.
 *
 * Needles are an order of magnitude longer than they are wide, and on a real
 * shoot they radiate from the twig rather than facing every direction at
 * once. Painting them with the broadleaf arrangement below gives a fuzzy
 * felted disc; keying the arrangement off the shape keeps every existing
 * broadleaf sprite byte-identical while letting a conifer card look like a
 * conifer.
 */
export const NEEDLE_LEAF_SHAPES = Object.freeze(['needle', 'needle-fascicle']);

export function createLeafSpriteTexture({
  size = 512,
  leafCount = 170,
  seed = 7,
  shape = 'teardrop',
  customOutline = null,
} = {}) {
  const rng = mulberry32(seed);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);

  const center = size / 2;
  const drawLeaf = (x, y, length, width, angle, luminance) => {
    const value = Math.round(THREE.MathUtils.clamp(luminance, 0, 1) * 255);
    ctx.fillStyle = `rgb(${value},${value},${value})`;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    traceLeafShapePath(ctx, shape, length, width, customOutline);
    ctx.fill();
    ctx.restore();
  };

  const needleSpray = NEEDLE_LEAF_SHAPES.includes(shape);

  if (needleSpray) {
    // A conifer card is not a scatter of organs over a disc. Needles are borne
    // on SHOOTS: each year's growth is a short candle, and the fascicles stand
    // out from that candle along its own axis. Distributing them over a disc
    // and pointing each one at the card centre — the broadleaf arrangement —
    // gives a sea-urchin starburst, which is what the first version of this
    // card looked like. Building a handful of shoots and hanging needles off
    // each one is what turns the card back into a bough.
    // Enough shoots, started at enough different radii, that their needle
    // masses OVERLAP. Six evenly spaced candles left visible sky between them
    // and the card read as an asterisk of brushes; a real bough is a
    // continuous mass with structure inside it, not a ring of separate
    // brooms.
    const shootCount = 9;
    const shoots = Array.from({ length: shootCount }, (_, index) => ({
      axis: (index / shootCount) * Math.PI * 2 + (rng() - 0.5) * 0.9,
      base: size * (-0.02 + rng() * 0.14),
      reach: size * (0.2 + rng() * 0.2),
      // Shoots nearer the rim carry the crisp, bright silhouette needles.
      lift: rng(),
    }));
    // Fewer, bolder fascicles. Packing the card with hundreds of hairline
    // needles reads as felt once mipped; a stylized bough wants a countable
    // number of confident strokes.
    const perShoot = Math.max(5, Math.round((leafCount * 0.5) / shootCount));
    const needles = [];
    for (const shoot of shoots) {
      for (let i = 0; i < perShoot; i += 1) {
        // Along the candle, packed toward its outer half the way a real
        // year's growth is.
        const along = Math.pow(rng(), 0.72);
        const radius = shoot.base + along * shoot.reach;
        // Fascicles stand out from the shoot at a shallow angle, alternating
        // to either side, so the candle keeps a visible axis.
        const side = i % 2 === 0 ? 1 : -1;
        const flare = (0.24 + rng() * 0.42) * side;
        const lateral = (rng() - 0.5) * size * 0.07;
        needles.push({
          x: center + Math.cos(shoot.axis) * radius - Math.sin(shoot.axis) * lateral,
          y: center + Math.sin(shoot.axis) * radius + Math.cos(shoot.axis) * lateral,
          orientation: shoot.axis - Math.PI / 2 + flare,
          depth: radius,
          edgeT: Math.min(radius / (size * 0.4), 1),
          pick: rng(),
          spin: rng(),
          shade: rng(),
          lift: shoot.lift,
        });
      }
    }
    needles.sort((a, b) => a.depth - b.depth);
    for (const needle of needles) {
      const length = size * (0.24 + needle.pick * 0.16);
      const width = length * (0.4 + needle.spin * 0.16);
      const luminance = THREE.MathUtils.lerp(
        0.46 + needle.shade * 0.2,
        0.74 + needle.shade * 0.26,
        Math.min(1, needle.edgeT * 0.7 + needle.lift * 0.4),
      );
      drawLeaf(needle.x, needle.y, length, width, needle.orientation, luminance);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.name = `ToonLabLeafSprite.${shape}`;
    texture.colorSpace = THREE.NoColorSpace;
    texture.anisotropy = 4;
    return texture;
  }

  const leaves = [];
  for (let i = 0; i < leafCount; i += 1) {
    const angle = rng() * Math.PI * 2;
    // Clumpy reachable radius so the outline isn't a circle.
    const reach = 0.38 + 0.05 * Math.sin(angle * 3 + seed) + 0.04 * Math.sin(angle * 7 + 1.3);
    const radius = Math.pow(rng(), 0.52) * size * reach;
    const edgeT = Math.min(radius / (size * 0.4), 1);
    leaves.push({ angle, radius, edgeT, pick: rng(), spin: rng(), shade: rng() });
  }
  // Inside-out: rim leaves draw last, on top, with crisp silhouettes.
  leaves.sort((a, b) => a.radius - b.radius);
  leaves.forEach((leaf) => {
    const x = center + Math.cos(leaf.angle) * leaf.radius;
    const y = center + Math.sin(leaf.angle) * leaf.radius;
    const length = size * (0.095 + leaf.pick * 0.06);
    const width = length * (0.55 + leaf.spin * 0.3);
    // Interior leaves: darker, randomly oriented. Rim leaves: brighter,
    // pointing outward like real growth.
    const scatter = (1 - leaf.edgeT) * 2.6 + 0.5;
    const orientation = leaf.angle + Math.PI / 2 + (leaf.spin - 0.5) * scatter;
    const luminance = THREE.MathUtils.lerp(
      0.5 + leaf.shade * 0.22,
      0.76 + leaf.shade * 0.24,
      leaf.edgeT,
    );
    drawLeaf(x, y, length, width, orientation, luminance);
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.name = `ToonLabLeafSprite.${shape}`;
  texture.colorSpace = THREE.NoColorSpace;
  texture.anisotropy = 4;
  return texture;
}

const organLeafSprites = new Map();

// Fronds and bamboo sprays need a single blade per card. Reusing the normal
// canopy texture here would place an entire broadleaf cluster at every pinna
// or bamboo-leaf position, turning those organs into fuzzy disks.
export function createOrganLeafSpriteTexture({
  shape = 'pinna',
  size = 256,
} = {}) {
  const cacheKey = `${shape}:${size}`;
  if (organLeafSprites.has(cacheKey)) return organLeafSprites.get(cacheKey);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#ffffff';
  ctx.save();
  ctx.translate(size * 0.5, size * 0.5);
  if (shape === 'spruce-spray') {
    // A deliberately original, procedural alpha mask for a short
    // needle-bearing spruce branchlet. The geometry supplies its world
    // orientation and proportions; the mask supplies readable serrated
    // needle edges without using vendor or photographic texture pixels.
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(2.5, size * 0.022);
    ctx.beginPath();
    ctx.moveTo(0, size * 0.43);
    ctx.quadraticCurveTo(size * 0.018, 0, 0, -size * 0.44);
    ctx.stroke();
    const needlePairs = 23;
    for (let index = 0; index < needlePairs; index += 1) {
      const t = index / (needlePairs - 1);
      const y = size * (0.37 - t * 0.73);
      const taper = Math.sin(Math.PI * (0.12 + t * 0.8));
      const reach = size * (0.13 + taper * 0.16);
      const upward = size * (0.025 + t * 0.045);
      ctx.lineWidth = Math.max(1.5, size * (0.014 - t * 0.003));
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(-reach, y - upward);
      ctx.moveTo(0, y - size * 0.008);
      ctx.lineTo(reach * 0.94, y - upward * 1.08);
      ctx.stroke();
    }
    // Dense pointed leader at the branchlet end.
    ctx.lineWidth = Math.max(1.25, size * 0.007);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(0, -size * 0.31);
      ctx.lineTo(side * size * 0.12, -size * 0.46);
      ctx.stroke();
    }
    ctx.restore();
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.NoColorSpace;
    texture.anisotropy = 4;
    organLeafSprites.set(cacheKey, texture);
    return texture;
  }
  if (shape === 'giant-monocot') {
    // Original procedural traveller/banana-style blade. A broad continuous
    // lamina is kept for the stylized read, while a few shallow deterministic
    // edge tears prevent the perfect paddle silhouette seen in the first
    // generic implementation.
    ctx.beginPath();
    ctx.moveTo(0, size * 0.47);
    ctx.bezierCurveTo(
      -size * 0.13, size * 0.35,
      -size * 0.25, size * 0.08,
      -size * 0.23, -size * 0.16,
    );
    ctx.bezierCurveTo(
      -size * 0.2, -size * 0.34,
      -size * 0.09, -size * 0.45,
      0, -size * 0.49,
    );
    ctx.bezierCurveTo(
      size * 0.09, -size * 0.45,
      size * 0.2, -size * 0.34,
      size * 0.23, -size * 0.16,
    );
    ctx.bezierCurveTo(
      size * 0.25, size * 0.08,
      size * 0.13, size * 0.35,
      0, size * 0.47,
    );
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = 'destination-out';
    for (const side of [-1, 1]) {
      for (let tear = 0; tear < 4; tear += 1) {
        const y = size * (-0.22 + tear * 0.14);
        const edge = side * size * (0.205 + (tear % 2) * 0.018);
        ctx.beginPath();
        ctx.moveTo(edge, y - size * 0.025);
        ctx.lineTo(side * size * (0.08 + tear * 0.012), y);
        ctx.lineTo(edge, y + size * 0.02);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.NoColorSpace;
    texture.anisotropy = 4;
    organLeafSprites.set(cacheKey, texture);
    return texture;
  }
  if (shape === 'rosette-blade') {
    // Original procedural Yucca/Dracaena-style blade. The geometry controls
    // the extreme biological aspect ratio; this mask supplies a rigid,
    // slightly shouldered base and a sharp terminal point without borrowing
    // pixels from third-party assets or botanical photographs.
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.49);
    ctx.bezierCurveTo(
      size * 0.3, -size * 0.34,
      size * 0.34, size * 0.24,
      size * 0.17, size * 0.43,
    );
    ctx.quadraticCurveTo(0, size * 0.5, -size * 0.17, size * 0.43);
    ctx.bezierCurveTo(
      -size * 0.34, size * 0.24,
      -size * 0.3, -size * 0.34,
      0, -size * 0.49,
    );
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.NoColorSpace;
    texture.anisotropy = 4;
    organLeafSprites.set(cacheKey, texture);
    return texture;
  }
  if (shape === 'coconut-pinna-group') {
    // One runtime card represents a small group from the coconut frond's
    // much denser biological row. Three original lanceolate masks retain
    // visible gaps and a feathered edge while avoiding either a solid paddle
    // or hundreds of additional quads per frond.
    for (const blade of [-1, 0, 1]) {
      ctx.save();
      ctx.translate(blade * size * 0.26, Math.abs(blade) * size * 0.018);
      ctx.rotate(blade * 0.055);
      traceLeafShapePath(ctx, 'teardrop', size * 0.92, size * 0.3);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.NoColorSpace;
    texture.anisotropy = 4;
    organLeafSprites.set(cacheKey, texture);
    return texture;
  }
  if (shape === 'oak-leaf') {
    // One card represents one independently oriented English-oak leaf.
    // The rounded alternating lobes and short tapered base are traced from
    // Toonlab's own procedural outline; no reference or vendor pixels are
    // embedded in the runtime texture.
    traceLeafShapePath(ctx, 'oak', size * 0.9, size * 0.72);
    ctx.fill();
    ctx.restore();
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.NoColorSpace;
    texture.anisotropy = 4;
    organLeafSprites.set(cacheKey, texture);
    return texture;
  }
  const bladeLength = size * 0.9;
  // The geometry already supplies the biological leaflet aspect ratio. Fill
  // most of that narrow card here; applying a second 3:1 squeeze in the alpha
  // texture made palm pinnae disappear into one-pixel hairs at catalog scale.
  const bladeWidth = size * (
    shape === 'fern-pinna' ? 0.62
      : shape === 'bamboo-leaf' ? 0.32
        : 0.76
  );
  traceLeafShapePath(ctx, 'teardrop', bladeLength, bladeWidth);
  ctx.fill();
  ctx.restore();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.anisotropy = 4;
  organLeafSprites.set(cacheKey, texture);
  return texture;
}

// Merged quad soup: 4 verts per card, position = card center, corners spread
// in the vertex shader (billboarding). Cards sit on the blob surfaces so the
// canopy silhouette stays clumpy rather than spherical.
// Few LARGE heavily-overlapping cards — not many small ones — is what makes
// crowns read as one fluffy mass (the classic three.js "fluffy trees"
// recipe). Small-card swarms read as floating confetti.
export function createTreeFoliageGeometry({
  blobs = TREE_FOLIAGE_BLOBS,
  cardCount = 170,
  cardSizeRange = [1.0, 1.6],
  // Overall canopy size multiplier (1 ≈ 1.6 m crown radius). For large trees
  // prefer raising cardCount alongside size so clusters stay leaf-scaled
  // instead of ballooning with the crown.
  size = 1,
  // Final world scale the tree renders at (object transform × size). Leaves
  // must stay leaf-sized no matter how big the tree gets, so coverage comes
  // from MORE cards, never bigger ones: card count scales with
  // coverageScale^2 (crown surface area), card size stays put.
  coverageScale = 1,
  // 0..1 leaf coverage. 1 = a solid crown; lower values thin the cards
  // overall, open see-through gap pockets in the silhouette, and clear the
  // underside so branches and sky show through from the side or below.
  leafDensity = 1,
  // Branch attachment points ({ position: Vector3, direction: Vector3 } in
  // canopy-local space, e.g. from createTreeSkeleton). When given, leaf
  // clusters grow as tufts around these points — no floating leaves — and
  // gap culling removes whole tufts, exposing the wood beneath. Without
  // attachments, cards sample the blob shells directly.
  attachments = null,
  // Crown construction. cloud-cards is the historical spherical tuft path;
  // the other modes arrange the same leaf-card material along branch-local
  // planes, whorls, or frond rays. They remain camera-facing cards at render
  // time, but their centers form authored volumes rather than round puffs.
  architecture = 'cloud-cards',
  sprayLayers = 3,
  spraySpread = 0.8,
  sprayThickness = 0.18,
  // layered-sprays only. 0 (the default, and every historical tree) builds
  // each spray disc ACROSS THE TWIG: the disc's thickness axis is the branch
  // growth direction, so a twig rising at 50 deg carries a disc tilted at
  // 50 deg. Summed over a few hundred tips that is a dome of randomly tilted
  // discs — which is the correct read for most broadleaves.
  //
  // It is the wrong read for a tree whose identity IS horizontality. An Acer
  // palmatum, a dogwood, a layered Japanese hornbeam: the leaf layer is flat
  // WITH THE GROUND, not with the twig that carries it. 1 rotates each spray
  // basis all the way to world horizontal, so every tuft becomes a flat plate
  // however its twig is oriented, and the crown reads as stacked layers you
  // can see between instead of a shell you cannot.
  //
  // Only the DISC is realigned. Placement along the twig (the tuft's offset
  // from its attachment) still follows the branch, so foliage stays where the
  // wood puts it and the skeleton keeps its authority over the silhouette.
  plateAlignment = 0,
  // Drops the OUTER edge of each spray disc, as a fraction of the disc's own
  // radius, on a quadratic falloff from its centre. A perfectly flat plate is
  // a machined shelf: it is what a Cornus controversa or an acacia reads as,
  // and the reason a plated crown can look manufactured rather than grown.
  // Real tiers sag under their own weight and their outer twigs hang, so the
  // tier has a soft drooping edge instead of a cut one. 0 keeps the plate
  // flat, which is every historical tree.
  plateDroop = 0,
  whorlArms = 6,
  whorlRadius = 0.48,
  frondCount = 7,
  frondLength = 1.25,
  cardsPerCluster = 5,
  clusterRadius = 0.48,
  individualBroadleafCards = false,
  // Per-attachment overrides keyed by attachment index:
  //   { [index]: { cardsPerCluster?, clusterRadius?, densityScale? } }
  // cardsPerCluster/clusterRadius replace the globals for that tuft;
  // densityScale multiplies its card count (0 = bare branch — the mandatory
  // minimum is waived when an explicit override asks for it).
  attachmentOverrides = null,
  // false = no blob-shell fill between the attachment tufts: the crown is
  // ONLY bushes at the branch ends and the wood in between stays on show
  // (the Sumeru bare-limb look). Only meaningful with attachments.
  shellFill = null,
  // When set, the blob-shell fill ADDS this many cards (scaled by density
  // and coverage) on top of whatever the attachments produced, instead of
  // only topping up to cardCount. Scribbled foliage areas need this: a
  // branch-tuft-heavy tree already exceeds the top-up budget, so painted
  // blobs would otherwise get zero cards.
  shellBudget = null,
  seed = 1,
} = {}) {
  const resolvedArchitecture = resolveFoliageArchitecture(architecture);
  const resolvedShellFill = shellFill == null
    ? resolvedArchitecture === 'cloud-cards'
    : Boolean(shellFill);
  const rng = mulberry32(seed + 11.7);
  const density = THREE.MathUtils.clamp(leafDensity, 0.05, 2);
  // Gap/culling math below is written for 0..1 coverage; density above 1
  // means "extra lush" and must never produce negative gap counts.
  const openness = Math.max(0, 1 - density);
  const coverage = Math.min(Math.max(coverageScale, 0.4) ** 2, 9);

  // Gap pockets: a few random directions on the crown where cards are very
  // likely to be culled, so patches of sky read through the canopy.
  const gapCount = Math.max(0, Math.round(1 + openness * 5 + rng() * 2));
  const gaps = Array.from({ length: gapCount }, () => {
    const theta = rng() * Math.PI * 2;
    const cosPhi = rng() * 2 - 1;
    const sinPhi = Math.sqrt(Math.max(0, 1 - cosPhi * cosPhi));
    return {
      direction: new THREE.Vector3(Math.cos(theta) * sinPhi, cosPhi, Math.sin(theta) * sinPhi),
      // Cosine threshold: wider pockets as density drops.
      cosRadius: Math.cos(0.35 + rng() * 0.3 + openness * 0.45),
    };
  });

  // Weight blob selection by surface area so lobes get even coverage.
  const weights = blobs.map((blob) => blob.radius * blob.radius);
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);

  // Shading normals radiate from a core slightly below the canopy center,
  // which biases normals upward — tops read lit, undersides read shaded.
  const core = new THREE.Vector3(0, -0.35, 0);

  const cardCenter = new THREE.Vector3();
  const shadeNormal = new THREE.Vector3();
  let minY = Infinity;
  let maxY = -Infinity;

  const cardData = [];
  const targetCards = Math.round(cardCount * (0.4 + 0.6 * density) * coverage);

  // Gap pockets + underside thinning; culls by the card's direction from the
  // canopy core, so lower density opens believable holes instead of a
  // uniform thinning.
  const isCulled = (direction) => {
    for (const gap of gaps) {
      if (direction.dot(gap.direction) > gap.cosRadius && rng() < 0.55 + openness * 0.4) {
        return true;
      }
    }
    return direction.y < -0.25 && rng() < openness * 0.85;
  };

  // attachment = index of the tuft's branch end, -1 for shell-fill cards —
  // baked into the aAttachment vertex attribute so pointer picks can map a
  // leaf card back to its branch.
  const pushCard = (
    cardRng = rng,
    attachment = -1,
    cardSizeScale = 1,
    cardShape = [1, 1],
    phaseOverride = null,
    cardBasis = null,
  ) => {
    if (cardBasis?.normal) {
      shadeNormal.copy(cardBasis.normal).normalize();
    } else {
      shadeNormal.copy(cardCenter).sub(core).normalize();
    }
    cardCenter.multiplyScalar(size);
    minY = Math.min(minY, cardCenter.y);
    maxY = Math.max(maxY, cardCenter.y);
    cardData.push({
      attachment,
      basisUp: cardBasis?.up?.clone().normalize() ?? new THREE.Vector3(0, 1, 0),
      center: cardCenter.clone(),
      normal: shadeNormal.clone(),
      shape: cardShape,
      size: cardBasis?.size ?? (
        THREE.MathUtils.lerp(cardSizeRange[0], cardSizeRange[1], cardRng())
          * size * cardSizeScale
      ),
      phase: phaseOverride == null ? cardRng() : THREE.MathUtils.euclideanModulo(phaseOverride, 1),
      tint: cardRng(),
      worldOriented: Boolean(cardBasis),
    });
  };

  // Card on a blob shell — the base fill that keeps the crown a solid mass.
  const sampleShellCard = () => {
    let pick = rng() * totalWeight;
    let blobIndex = 0;
    while (pick > weights[blobIndex] && blobIndex < blobs.length - 1) {
      pick -= weights[blobIndex];
      blobIndex += 1;
    }
    const blob = blobs[blobIndex];
    const theta = rng() * Math.PI * 2;
    const cosPhi = rng() * 2 - 1;
    const sinPhi = Math.sqrt(Math.max(0, 1 - cosPhi * cosPhi));
    const shell = blob.radius * (0.72 + rng() * 0.3);
    cardCenter.set(
      Math.cos(theta) * sinPhi * shell + blob.offset[0],
      cosPhi * shell + blob.offset[1],
      Math.sin(theta) * sinPhi * shell + blob.offset[2],
    );
    shadeNormal.copy(cardCenter).sub(core).normalize();
    if (isCulled(shadeNormal)) return;
    pushCard();
  };

  const attachmentEntries = (attachments ?? []).map((attachment, attachmentIndex) => ({
    attachment,
    attachmentIndex,
  }));
  // A palm crown is one radial rosette at the highest leader. Repeating a
  // complete rosette at every twig tip turns a palm into a round broadleaf
  // ball and produces bare, disconnected-looking frond clusters.
  const preservedRadialCrowns = attachmentEntries.filter(
    (entry) => entry.attachment.preserveRadialCrown,
  );
  const foliageAttachmentEntries = resolvedArchitecture === 'radial-fronds'
    && attachmentEntries.length
    ? preservedRadialCrowns.length
      ? preservedRadialCrowns
      : [attachmentEntries.reduce((highest, entry) => (
        (entry.attachment.normalizedHeight ?? entry.attachment.position.y)
          > (highest.attachment.normalizedHeight ?? highest.attachment.position.y)
          ? entry : highest
      ))]
    : attachmentEntries;

  if (foliageAttachmentEntries.length) {
    // MANDATORY pass first: every attachment gets a full puff of cards
    // engulfing the branch end — dense terminal masses are what make the
    // anime look, and a skipped puff means a naked branch. Never culled,
    // never budget-capped. Each tuft draws from its OWN seeded rng so a
    // per-branch override reshapes only that tuft, never its neighbors.
    foliageAttachmentEntries.forEach(({ attachment, attachmentIndex }) => {
      const tuftRng = mulberry32(seed * 3.7 + 17.9 + attachmentIndex * 101.3);
      const override = attachmentOverrides?.[attachmentIndex] ?? null;
      const tuftCardsPerCluster = override?.cardsPerCluster ?? cardsPerCluster;
      const tuftRadius = override?.clusterRadius ?? clusterRadius;
      const densityScale = override?.densityScale ?? 1;
      const layerTotal = Math.max(1, Math.round(sprayLayers));
      const whorlTotal = Math.max(3, Math.round(whorlArms));
      const frondTotal = Math.max(3, Math.round(override?.frondCount ?? frondCount));
      const localFrondLength = Math.max(0.05, override?.frondLength ?? frondLength);
      const foliageSprayScale = THREE.MathUtils.clamp(
        override?.foliageSprayScale ?? attachment.foliageSprayScale ?? 1,
        0.4,
        1.25,
      );
      const organType = override?.organType ?? attachment.organType ?? 'rosette-leaf';
      const individualLeaf = Boolean(
        override?.individualLeaf ?? attachment.individualLeaf,
      );
      const individualRosette = Boolean(
        override?.individualRosette ?? attachment.individualRosette,
      );
      const juvenileEntireLeaf = Boolean(
        override?.juvenileEntireLeaf ?? attachment.juvenileEntireLeaf,
      );
      const leafletPairs = Math.max(
        3,
        Math.round(override?.leafletPairs ?? attachment.leafletPairs ?? 8),
      );
      const leafletLengthRatio = THREE.MathUtils.clamp(
        override?.leafletLengthRatio ?? attachment.leafletLengthRatio ?? 0.16,
        0.12,
        0.38,
      );
      const leafletLengthScale = THREE.MathUtils.clamp(
        override?.leafletLengthScale ?? attachment.leafletLengthScale ?? 1,
        0.65,
        1.5,
      );
      const emergingLeafletScale = THREE.MathUtils.clamp(
        override?.emergingLeafletScale ?? attachment.emergingLeafletScale ?? 1,
        0.15,
        1,
      );
      const leafletWidthScale = THREE.MathUtils.clamp(
        override?.leafletWidthScale ?? attachment.leafletWidthScale ?? 1,
        0.65,
        1.6,
      );
      const pinnaAlongJitter = THREE.MathUtils.clamp(
        override?.pinnaAlongJitter ?? attachment.pinnaAlongJitter ?? 0,
        0,
        0.9,
      );
      const pinnaDownfold = THREE.MathUtils.clamp(
        override?.pinnaDownfold ?? attachment.pinnaDownfold ?? 0.34,
        0.1,
        0.72,
      );
      const pinnaDownfoldJitter = THREE.MathUtils.clamp(
        override?.pinnaDownfoldJitter ?? attachment.pinnaDownfoldJitter ?? 0,
        0,
        0.18,
      );
      const pinnaLengthJitter = THREE.MathUtils.clamp(
        override?.pinnaLengthJitter ?? attachment.pinnaLengthJitter ?? 0,
        0,
        0.28,
      );
      const pinnaRoll = THREE.MathUtils.clamp(
        override?.pinnaRoll ?? attachment.pinnaRoll ?? 0.24,
        0,
        0.42,
      );
      const pinnaTipSweep = THREE.MathUtils.clamp(
        override?.pinnaTipSweep ?? attachment.pinnaTipSweep ?? 0.08,
        0,
        0.72,
      );
      const uprightFrondFraction = THREE.MathUtils.clamp(
        override?.uprightFrondFraction ?? attachment.uprightFrondFraction ?? 0.2,
        0,
        0.6,
      );
      const rawCount = Math.round(
        tuftCardsPerCluster * (0.8 + tuftRng() * 0.5) * coverage * densityScale *
        Math.max(1, density));
      // Only an explicit override may bare a branch.
      const architectureMinimum = resolvedArchitecture === 'radial-fronds'
          ? individualLeaf && organType === 'giant-monocot-leaf'
          ? 1
          : juvenileEntireLeaf && organType === 'pinnate-frond'
            ? frondTotal
          : organType === 'pinnate-frond' || organType === 'fern-frond'
          ? frondTotal * leafletPairs * 2
          : organType === 'fan-frond'
            ? frondTotal * 5
            : frondTotal
        : resolvedArchitecture === 'needle-whorls'
          ? organType === 'conifer-leader-tip' ? 3 : whorlTotal
          : 3;
      const allowBare = override?.densityScale === 0 || override?.cardsPerCluster === 0;
      const tuftCards = individualRosette && organType === 'rosette-leaf'
        ? frondTotal
        : allowBare
        ? Math.max(rawCount, 0)
        : Math.max(rawCount, architectureMinimum);
      const growth = (attachment.tangent ?? attachment.direction ?? new THREE.Vector3(0, 1, 0))
        .clone().normalize();
      const basisReference = Math.abs(growth.y) > 0.92
        ? new THREE.Vector3(1, 0, 0)
        : new THREE.Vector3(0, 1, 0);
      const branchRight = new THREE.Vector3().crossVectors(growth, basisReference).normalize();
      const branchForward = new THREE.Vector3().crossVectors(branchRight, growth).normalize();
      // The spray disc's own basis. At plateAlignment 0 these are exactly the
      // branch vectors above and nothing moves; at 1 the disc normal is world
      // up and the tuft is a horizontal plate. The blend is on the NORMAL, so
      // partial values tilt the plate rather than shearing it.
      const tuftPlateAlignment = THREE.MathUtils.clamp(
        override?.plateAlignment ?? attachment.plateAlignment ?? plateAlignment,
        0,
        1,
      );
      const tuftPlateDroop = Math.max(
        override?.plateDroop ?? attachment.plateDroop ?? plateDroop,
        0,
      );
      let sprayNormal = growth;
      let sprayRight = branchRight;
      let sprayForward = branchForward;
      if (tuftPlateAlignment > 0) {
        const worldUp = new THREE.Vector3(0, growth.y < 0 ? -1 : 1, 0);
        sprayNormal = growth.clone().lerp(worldUp, tuftPlateAlignment);
        // growth and worldUp are antipodal only when the twig points exactly
        // down, which the sign flip above already rules out; a degenerate
        // lerp result can still appear at float precision.
        if (sprayNormal.lengthSq() < 1e-8) sprayNormal.copy(worldUp);
        sprayNormal.normalize();
        // The plate's long axis follows its own limb's heading, so a plate is
        // elongated ALONG the branch that carries it (which is what a real
        // layered crown does) instead of every plate sharing one world axis —
        // a squash direction repeated over 300 tufts is visible as a grain.
        sprayRight = new THREE.Vector3(growth.x, 0, growth.z);
        if (sprayRight.lengthSq() < 1e-6) sprayRight.copy(branchRight);
        sprayRight.projectOnPlane(sprayNormal);
        if (sprayRight.lengthSq() < 1e-6) sprayRight.copy(branchRight).projectOnPlane(sprayNormal);
        sprayRight.normalize();
        sprayForward = new THREE.Vector3().crossVectors(sprayRight, sprayNormal).normalize();
      }
      for (let i = 0; i < tuftCards; i += 1) {
        let cardSizeScale = 1;
        let cardShape = [1, 1];
        let phaseOverride = null;
        let cardBasis = null;
        let secondaryCardBasis = null;
        if (resolvedArchitecture === 'layered-sprays') {
          const layer = i % layerTotal;
          const layerT = layerTotal === 1 ? 0 : layer / (layerTotal - 1) - 0.5;
          const radialT = Math.sqrt(tuftRng());
          const angle = tuftRng() * Math.PI * 2;
          cardCenter.copy(attachment.position)
            .addScaledVector(
              sprayRight,
              Math.cos(angle) * radialT * spraySpread * foliageSprayScale,
            )
            .addScaledVector(
              sprayForward,
              Math.sin(angle) * radialT * spraySpread * foliageSprayScale * 0.62,
            )
            .addScaledVector(sprayNormal, layerT * sprayThickness * foliageSprayScale)
            // Placement along the twig stays on the BRANCH axis whatever the
            // disc is aligned to: the tuft sits at the end of its own shoot.
            .addScaledVector(growth, tuftRadius * 0.16);
          if (tuftPlateDroop > 0) {
            // Quadratic in the radial coordinate, so the plate is level over
            // its inner half and only the rim hangs.
            cardCenter.y -= tuftPlateDroop * radialT * radialT
              * spraySpread * foliageSprayScale;
          }
          cardSizeScale = (0.88 + tuftRng() * 0.2)
            * (0.88 + foliageSprayScale * 0.12);
          if (individualBroadleafCards && organType === 'broad-leaf') {
            // Oak leaves grow alternately along short terminal shoots rather
            // than as compound, fern-like radial sprites. A golden-angle
            // divergence avoids artificial paired rows while preserving a
            // deterministic, readable terminal spray.
            const leafCount = Math.max(1, tuftCards);
            const along = leafCount === 1 ? 1 : i / (leafCount - 1);
            const divergence = i * Math.PI * (3 - Math.sqrt(5))
              + attachmentIndex * 0.73;
            const outward = branchRight.clone().multiplyScalar(Math.cos(divergence))
              .addScaledVector(branchForward, Math.sin(divergence))
              .normalize();
            const shootLength = Math.max(tuftRadius * 1.15, spraySpread * 0.7)
              * foliageSprayScale;
            cardCenter.copy(attachment.position)
              .addScaledVector(growth, (along - 0.62) * shootLength)
              .addScaledVector(
                outward,
                tuftRadius * (0.07 + 0.12 * along + tuftRng() * 0.035),
              );
            cardSizeScale = 0.82 + tuftRng() * 0.24;
            cardShape = [0.76, 1];
            const leafUp = growth.clone().multiplyScalar(0.38)
              .addScaledVector(outward, 0.88)
              .addScaledVector(new THREE.Vector3(0, 1, 0), 0.08)
              .normalize();
            const leafNormal = new THREE.Vector3().crossVectors(leafUp, growth);
            if (leafNormal.lengthSq() < 1e-6) {
              leafNormal.crossVectors(leafUp, branchRight);
            }
            cardBasis = { normal: leafNormal.normalize(), up: leafUp };
          } else if (organType === 'bamboo-leaf') {
            // One attachment represents a real leafy branch, not a spherical
            // tuft. Place alternating lanceolate leaves progressively along
            // the twig so node-born branch topology remains legible.
            const leafCount = Math.max(1, tuftCards);
            const rowCount = Math.ceil(leafCount / 2);
            const row = Math.floor(i / 2);
            const side = i % 2 === 0 ? -1 : 1;
            const rowT = (row + 0.72) / Math.max(1, rowCount);
            const leafRunLength = Math.max(
              tuftRadius * 1.8,
              override?.leafRunLength ?? attachment.leafRunLength ?? tuftRadius * 2.8,
            );
            const depthBand = (i % 3) - 1;
            const lateralJitter = (tuftRng() - 0.5) * tuftRadius * 0.16;
            cardCenter.copy(attachment.position)
              .addScaledVector(growth, -leafRunLength * (1 - rowT) * 0.9)
              .addScaledVector(branchRight, side * tuftRadius * (0.12 + rowT * 0.16))
              .addScaledVector(
                branchForward,
                depthBand * tuftRadius * (0.07 + rowT * 0.05) + lateralJitter,
              );
            // The alpha mask narrows the card again, so this restrained
            // geometry exaggeration keeps a real 1:7–1:10 bamboo blade
            // readable in the full-height stylized catalog capture.
            cardShape = [
              0.85 * THREE.MathUtils.clamp(
                override?.bambooLeafWidthScale ?? attachment.bambooLeafWidthScale ?? 1,
                0.75,
                1.35,
              ),
              1.35 * THREE.MathUtils.clamp(
                override?.bambooLeafLengthScale ?? attachment.bambooLeafLengthScale ?? 1,
                0.8,
                1.4,
              ),
            ];
            cardSizeScale *= 0.9 + tuftRng() * 0.16;
            const leafUp = growth.clone().multiplyScalar(0.62)
              .addScaledVector(branchRight, side * (0.62 + rowT * 0.18))
              .addScaledVector(
                branchForward,
                depthBand * 0.2 + (tuftRng() - 0.5) * 0.14,
              )
              .addScaledVector(new THREE.Vector3(0, 1, 0), 0.08 - rowT * 0.13)
              .normalize();
            const leafNormal = new THREE.Vector3().crossVectors(leafUp, growth);
            if (leafNormal.lengthSq() < 1e-6) leafNormal.crossVectors(leafUp, branchRight);
            leafNormal.normalize();
            cardBasis = { normal: leafNormal, up: leafUp };
            // Mature graph sprays already fork in three dimensions. Emitting
            // one world-oriented card per blade preserves the two-ranked
            // bamboo leaf arrangement; the previous crossed duplicate made
            // every blade read as a broad X-shaped fern leaflet.
            const singleBladeCards = Boolean(
              override?.bambooSingleBladeCards ?? attachment.bambooSingleBladeCards,
            );
            if (singleBladeCards) {
              secondaryCardBasis = null;
            } else {
              const leafRight = new THREE.Vector3()
                .crossVectors(leafUp, leafNormal)
                .normalize();
              const crossAngle = Math.PI * 0.34;
              const crossNormal = leafNormal.clone()
                .multiplyScalar(Math.cos(crossAngle))
                .addScaledVector(leafRight, Math.sin(crossAngle))
                .normalize();
              secondaryCardBasis = { normal: crossNormal, up: leafUp };
            }
          }
        } else if (resolvedArchitecture === 'needle-whorls') {
          const arm = i % whorlTotal;
          const ring = Math.floor(i / whorlTotal);
          const ringCount = Math.max(1, Math.ceil(tuftCards / whorlTotal));
          const angle = (arm / whorlTotal) * Math.PI * 2 + tuftRng() * 0.22;
          const localWhorlRadius = Math.max(
            0.015,
            override?.whorlRadius ?? attachment.whorlRadius ?? whorlRadius,
          );
          const radius = localWhorlRadius * (0.68 + tuftRng() * 0.34);
          const ringT = ringCount === 1 ? 0 : ring / (ringCount - 1) - 0.5;
          const radialDirection = branchRight.clone().multiplyScalar(Math.cos(angle))
            .addScaledVector(branchForward, Math.sin(angle))
            .normalize();
          cardCenter.copy(attachment.position)
            .addScaledVector(radialDirection, radius)
            .addScaledVector(growth, ringT * tuftRadius * 1.25);
          // The card represents a needle-bearing branchlet, so its long axis
          // follows the twig. Radial offset only separates overlapping
          // branchlets around that twig; using it as the long axis produced
          // starbursts and vertical strings instead of layered spruce boughs.
          const needleLong = growth.clone()
            .addScaledVector(
              radialDirection,
              organType === 'conifer-leader-tip' ? 0.32 : 0.1,
            )
            .normalize();
          const needleShort = radialDirection.clone()
            .addScaledVector(needleLong, -radialDirection.dot(needleLong))
            .normalize();
          const needleNormal = new THREE.Vector3()
            .crossVectors(needleShort, needleLong)
            .normalize();
          cardShape = organType === 'needle-fascicle' ? [0.18, 1.08] : [0.64, 1];
          cardSizeScale = organType === 'conifer-leader-tip'
            ? 0.62 + tuftRng() * 0.1
            : 0.78 + tuftRng() * 0.14;
          // One view-facing branchlet in each small cluster keeps the
          // stylized crown readable from front/side/back; the others retain
          // true world orientation and supply parallax and edge structure.
          cardBasis = i % 3 === 0
            ? null
            : {
              normal: needleNormal,
              up: needleLong,
            };
        } else if (resolvedArchitecture === 'radial-fronds') {
          const arm = i % frondTotal;
          const step = Math.floor(i / frondTotal);
          const stepCount = Math.max(1, Math.ceil(tuftCards / frondTotal));
          const angle = (arm / frondTotal) * Math.PI * 2 + tuftRng() * 0.045;
          const radialDirection = branchRight.clone().multiplyScalar(Math.cos(angle))
            .addScaledVector(branchForward, Math.sin(angle));
          const lateralDirection = branchRight.clone().multiplyScalar(-Math.sin(angle))
            .addScaledVector(branchForward, Math.cos(angle));
          const droop = Math.max(0, attachment.crownDroop ?? 0);
          const crownArch = Math.max(
            0,
            override?.crownArch ?? attachment.crownArch ?? 0.2,
          );
          const crownDropScale = THREE.MathUtils.clamp(
            override?.crownDropScale ?? attachment.crownDropScale ?? (
              organType === 'fern-frond' ? 0.34 : 0.25
            ),
            0.18,
            0.52,
          );
          const uprightT = (arm * 0.6180339887498949) % 1;
          const emergence = uprightT < uprightFrondFraction
            ? 1 - uprightT / Math.max(uprightFrondFraction, 1e-4)
            : 0;
          const radialReach = 1 - emergence * 0.48;
          if (individualRosette && organType === 'rosette-leaf') {
            // One card is one rigid biological blade. Arrange blades around
            // the terminal growth axis with most leaves spreading outward,
            // a smaller upright inner cohort, and a few retained older leaves
            // angled slightly back. This is a terminal rosette, not a generic
            // broadleaf tuft or a palm frond crown.
            const ageT = (arm * 0.6180339887498949 + tuftRng() * 0.08) % 1;
            const axial = THREE.MathUtils.lerp(
              -0.18,
              0.86,
              ageT ** 2.15,
            );
            const radialWeight = Math.sqrt(Math.max(0.08, 1 - axial * axial));
            const leafUp = radialDirection.clone()
              .multiplyScalar(radialWeight)
              .addScaledVector(growth, axial)
              .normalize();
            cardCenter.copy(attachment.position)
              .addScaledVector(leafUp, localFrondLength * 0.5);
            cardShape = [
              THREE.MathUtils.clamp(
                override?.leafWidthScale ?? attachment.leafWidthScale ?? 0.065,
                0.035,
                0.14,
              ),
              1,
            ];
            cardBasis = {
              normal: lateralDirection.clone().normalize(),
              size: localFrondLength * (0.87 + tuftRng() * 0.18),
              up: leafUp,
            };
            phaseOverride = angle / (Math.PI * 2);
          } else if (juvenileEntireLeaf && organType === 'pinnate-frond') {
            // Coconut seedlings first produce entire, pleated strap leaves;
            // the blade progressively splits into pinnae after the first
            // year. One continuous blade sits on one short petiole; adult
            // multi-segment feather logic is deliberately not reused here.
            const leafUp = radialDirection.clone()
              .multiplyScalar(radialReach)
              .addScaledVector(
                growth,
                0.42 + emergence * 0.55 - droop * (1 - emergence) * 0.12,
              )
              .normalize();
            cardCenter.copy(attachment.position)
              .addScaledVector(leafUp, localFrondLength * 0.48);
            cardShape = [0.26, 1];
            const juvenileNormal = new THREE.Vector3(
              arm % 2 === 0 ? 1 : -1,
              0,
              1,
            ).normalize();
            juvenileNormal
              .addScaledVector(leafUp, -juvenileNormal.dot(leafUp))
              .normalize();
            if (juvenileNormal.lengthSq() < 1e-6) {
              juvenileNormal.copy(lateralDirection).normalize();
            }
            cardBasis = {
              normal: juvenileNormal,
              size: localFrondLength * 1.05,
              up: leafUp,
            };
            phaseOverride = angle / (Math.PI * 2);
          } else if (individualLeaf && organType === 'giant-monocot-leaf') {
            const leafUp = growth.clone().normalize();
            const leafNormal = (
              override?.leafNormal
              ?? attachment.leafNormal
              ?? branchForward
            ).clone().normalize();
            // Keep the normal perpendicular to the long blade axis so the
            // card remains stable when a fan leaf approaches vertical.
            leafNormal
              .addScaledVector(leafUp, -leafNormal.dot(leafUp))
              .normalize();
            if (leafNormal.lengthSq() < 1e-6) leafNormal.copy(branchForward);
            cardCenter.copy(attachment.position);
            cardShape = [
              THREE.MathUtils.clamp(
                override?.leafWidthScale ?? attachment.leafWidthScale ?? 0.4,
                0.25,
                0.58,
              ),
              1,
            ];
            cardBasis = {
              normal: leafNormal,
              size: localFrondLength,
              up: leafUp,
            };
            phaseOverride = (attachment.fanAngle ?? 0) / (Math.PI * 2);
          } else if (attachment.fanPlane) {
            const along = (step + 1) / (stepCount + 0.5);
            const fanT = frondTotal === 1 ? 0.5 : arm / (frondTotal - 1);
            const fanAngle = THREE.MathUtils.lerp(-1.12, 1.12, fanT)
              + (tuftRng() - 0.5) * 0.05;
            cardCenter.copy(attachment.position)
              .addScaledVector(branchRight, Math.sin(fanAngle) * localFrondLength * along)
              .addScaledVector(growth, Math.cos(fanAngle) * localFrondLength * along)
              .addScaledVector(branchForward, (tuftRng() - 0.5) * tuftRadius * 0.12);
            cardShape = [0.42, 1.65];
            cardSizeScale = 0.82 + along * 0.25;
            phaseOverride = fanAngle / (Math.PI * 2);
          } else if (organType === 'pinnate-frond' || organType === 'fern-frond') {
            // A pinnate frond is a feather, not a chain of broadleaf puffs:
            // paired narrow pinnae flank a curved rachis and shrink toward
            // both its base and tip. The graph carries the matching rachis
            // axes, so these cards read as attached organs from every view.
            const side = step % 2 === 0 ? -1 : 1;
            const pair = Math.floor(step / 2);
            const pairCount = Math.max(1, Math.ceil(stepCount / 2));
            const pairInterval = 1 / Math.max(1, pairCount + 0.42);
            const along = THREE.MathUtils.clamp(
              (pair + 0.72) / (pairCount + 0.42)
                + (tuftRng() - 0.5) * pairInterval * pinnaAlongJitter,
              pairInterval * 0.42,
              1 - pairInterval * 0.28,
            );
            const leafletEnvelope = Math.sin(Math.PI * THREE.MathUtils.clamp(along, 0, 1));
            const leafletLength = localFrondLength * leafletLengthRatio
              * (0.35 + leafletEnvelope * 0.65)
              * leafletLengthScale
              * THREE.MathUtils.lerp(
                1,
                emergingLeafletScale,
                emergence ** 0.72,
              )
              * (1 + (tuftRng() - 0.5) * pinnaLengthJitter);
            const crownLift = localFrondLength * (
              Math.sin(Math.PI * along) * crownArch
              + emergence * along * (organType === 'fern-frond' ? 0.58 : 0.72)
              - droop * (1 - emergence) * along ** 1.7
                * crownDropScale
            );
            const rachisPosition = cardCenter.copy(attachment.position)
              .addScaledVector(radialDirection, localFrondLength * radialReach * along)
              .addScaledVector(growth, crownLift);
            const leafletLong = lateralDirection.clone().multiplyScalar(side)
              .addScaledVector(
                radialDirection,
                THREE.MathUtils.lerp(0.06, pinnaTipSweep, along ** 2.2),
              )
              // Palm and fern pinnae are not flat horizontal strips. A
              // downward fold makes the feather visible in side elevation
              // and produces the characteristic hanging coconut silhouette.
              .addScaledVector(
                growth,
                organType === 'fern-frond'
                  ? -0.14
                  : -(pinnaDownfold
                    + (tuftRng() - 0.5) * pinnaDownfoldJitter),
              )
              .normalize();
            const leafletShort = radialDirection.clone()
              .addScaledVector(growth, organType === 'fern-frond' ? 0.32 : 0.5);
            leafletShort
              .addScaledVector(leafletLong, -leafletShort.dot(leafletLong))
              .normalize();
            if (organType === 'pinnate-frond') {
              // Pinnae twist incrementally along a real coconut rachis. A
              // small deterministic four-step roll avoids an artificial
              // single flat comb and keeps the stylized feather readable
              // from front, side, and back without camera-facing billboards.
              const localPinnaRoll = ((pair % 4) - 1.5) * pinnaRoll + side * 0.06;
              leafletShort.applyAxisAngle(leafletLong, localPinnaRoll).normalize();
            }
            const leafletNormal = new THREE.Vector3()
              .crossVectors(leafletShort, leafletLong)
              .normalize();
            if (leafletNormal.y < 0) leafletNormal.multiplyScalar(-1);
            cardCenter.copy(rachisPosition)
              .addScaledVector(leafletLong, leafletLength * 0.48);
            cardShape = organType === 'fern-frond'
              ? [0.28, 1]
              : [0.32 * leafletWidthScale, 1];
            cardBasis = {
              normal: leafletNormal,
              size: leafletLength,
              up: leafletLong,
            };
            phaseOverride = (angle + side * Math.PI * 0.5) / (Math.PI * 2);
          } else if (organType === 'fan-frond') {
            const ray = step % 5;
            const along = 0.58 + ray / 5 * 0.42;
            const fanOffset = (ray - 2) * 0.105;
            cardCenter.copy(attachment.position)
              .addScaledVector(radialDirection, localFrondLength * along)
              .addScaledVector(lateralDirection, localFrondLength * fanOffset)
              .addScaledVector(
                growth,
                localFrondLength * (0.08 - droop * along ** 1.6 * 0.22),
              );
            cardShape = [0.68, 1.25];
            cardSizeScale = 0.48 + (1 - Math.abs(fanOffset)) * 0.08;
            phaseOverride = angle / (Math.PI * 2);
          } else {
            const along = (step + 1) / (stepCount + 0.5);
            cardCenter.copy(attachment.position)
              .addScaledVector(radialDirection, localFrondLength * along)
              .addScaledVector(
                growth,
                tuftRadius * (0.28 - along * 0.32)
                  - localFrondLength * along ** 1.7 * droop * 0.26,
              );
            cardShape = organType === 'giant-monocot-leaf' ? [0.38, 1.75] : [0.3, 1.55];
            cardSizeScale = organType === 'giant-monocot-leaf'
              ? 0.95 + along * 0.35
              : 0.58 + along * 0.24;
            phaseOverride = angle / (Math.PI * 2);
          }
        } else {
          // Historical cloud-card puff: preserve the existing seeded layout.
          const radius = tuftRadius * (0.35 + 0.65 * Math.cbrt(tuftRng()));
          const theta = tuftRng() * Math.PI * 2;
          const cosPhi = tuftRng() * 2 - 1;
          const sinPhi = Math.sqrt(Math.max(0, 1 - cosPhi * cosPhi));
          cardCenter.set(
            Math.cos(theta) * sinPhi,
            cosPhi,
            Math.sin(theta) * sinPhi,
          ).multiplyScalar(radius).add(attachment.position);
          if (attachment.direction) {
            cardCenter.addScaledVector(
              attachment.direction, (0.1 + tuftRng() * 0.35) * tuftRadius);
          }
        }
        pushCard(
          tuftRng,
          attachmentIndex,
          cardSizeScale,
          cardShape,
          phaseOverride,
          cardBasis,
        );
        if (secondaryCardBasis) {
          pushCard(
            tuftRng,
            attachmentIndex,
            cardSizeScale,
            cardShape,
            phaseOverride,
            secondaryCardBasis,
          );
        }
      }
    });
    // Then shell fill (gap-cullable) tops the crown up to a solid mass —
    // unless the caller wants bare wood between the tufts.
    if (resolvedShellFill) {
      const shellTarget = shellBudget != null
        ? cardData.length + Math.round(shellBudget * (0.4 + 0.6 * density) * coverage)
        : targetCards;
      let sampleBudget = cardCount * 4 * coverage;
      while (cardData.length < shellTarget && sampleBudget > 0) {
        sampleBudget -= 1;
        sampleShellCard();
      }
    }
  } else {
    let sampleBudget = cardCount * 4 * coverage;
    while (cardData.length < targetCards && sampleBudget > 0) {
      sampleBudget -= 1;
      sampleShellCard();
    }
  }

  const centers = new Float32Array(cardData.length * 4 * 3);
  const corners = new Float32Array(cardData.length * 4 * 2);
  const uvs = new Float32Array(cardData.length * 4 * 2);
  const shadeNormals = new Float32Array(cardData.length * 4 * 3);
  const infos = new Float32Array(cardData.length * 4 * 4);
  const cardShapes = new Float32Array(cardData.length * 4 * 2);
  // xyz = fixed organ-card up axis; w = 1 for fixed organ cards, 0 for
  // billboards. The right axis is recovered from up × aShadeNormal. Packing
  // this into one buffer keeps the WebGPU vertex-buffer count below eight.
  const cardFrames = new Float32Array(cardData.length * 4 * 4);
  const attachmentIds = new Float32Array(cardData.length * 4);
  const indices = new Uint32Array(cardData.length * 6);

  const cornerOffsets = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
  const cornerUvs = [[0, 0], [1, 0], [1, 1], [0, 1]];
  cardData.forEach((card, cardIndex) => {
    const heightT = (card.center.y - minY) / Math.max(maxY - minY, 1e-4);
    for (let corner = 0; corner < 4; corner += 1) {
      const vertex = cardIndex * 4 + corner;
      centers[vertex * 3] = card.center.x;
      centers[vertex * 3 + 1] = card.center.y;
      centers[vertex * 3 + 2] = card.center.z;
      corners[vertex * 2] = cornerOffsets[corner][0];
      corners[vertex * 2 + 1] = cornerOffsets[corner][1];
      uvs[vertex * 2] = cornerUvs[corner][0];
      uvs[vertex * 2 + 1] = cornerUvs[corner][1];
      shadeNormals[vertex * 3] = card.normal.x;
      shadeNormals[vertex * 3 + 1] = card.normal.y;
      shadeNormals[vertex * 3 + 2] = card.normal.z;
      infos[vertex * 4] = card.size;
      infos[vertex * 4 + 1] = card.phase;
      infos[vertex * 4 + 2] = card.tint;
      infos[vertex * 4 + 3] = heightT;
      cardShapes[vertex * 2] = card.shape?.[0] ?? 1;
      cardShapes[vertex * 2 + 1] = card.shape?.[1] ?? 1;
      cardFrames[vertex * 4] = card.basisUp.x;
      cardFrames[vertex * 4 + 1] = card.basisUp.y;
      cardFrames[vertex * 4 + 2] = card.basisUp.z;
      cardFrames[vertex * 4 + 3] = card.worldOriented ? 1 : 0;
      attachmentIds[vertex] = card.attachment;
    }
    const base = cardIndex * 4;
    indices.set([base, base + 1, base + 2, base, base + 2, base + 3], cardIndex * 6);
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.setAttribute('position', new THREE.BufferAttribute(centers, 3));
  geometry.setAttribute('aCorner', new THREE.BufferAttribute(corners, 2));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute('aShadeNormal', new THREE.BufferAttribute(shadeNormals, 3));
  geometry.setAttribute('aInfo', new THREE.BufferAttribute(infos, 4));
  geometry.setAttribute('aCardShape', new THREE.BufferAttribute(cardShapes, 2));
  geometry.setAttribute('aCardFrame', new THREE.BufferAttribute(cardFrames, 4));
  // Branch-end index per card (-1 = shell fill), for pointer picking.
  geometry.setAttribute('aAttachment', new THREE.BufferAttribute(attachmentIds, 1));
  geometry.userData.treeFoliageArchitecture = resolvedArchitecture;
  // Billboards expand past their centers; pad the bounds so culling and the
  // shadow camera keep the swaying crown fully inside.
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const maxCardExtent = cardData.reduce(
    (maximum, card) => Math.max(
      maximum,
      card.size * Math.hypot(card.shape?.[0] ?? 1, card.shape?.[1] ?? 1) * 0.56,
    ),
    0,
  );
  geometry.boundingBox.expandByScalar(maxCardExtent);
  geometry.boundingSphere.radius += maxCardExtent;
  return geometry;
}

function setSrgb(color, value) {
  if (Array.isArray(value)) {
    color.setRGB(value[0], value[1], value[2], THREE.SRGBColorSpace);
  } else {
    color.set(value);
  }
  return color;
}

// Flexible canopy color spec → concrete color. Accepts:
//   0x4da258 / '#4da258' / THREE.Color      — that color
//   [0.3, 0.63, 0.34]                       — sRGB triplet (all values ≤ 1)
//   [0x4da258, 0xe8c33c, '#d97b29']         — list: seeded random pick
//   { colors: [...] }                       — same as a list
//   { from: 0x4da258, to: 0xe8c33c }        — seeded random blend of the two
//   { hue: [0.08, 0.16], saturation: [0.6, 0.85], lightness: [0.45, 0.6] }
//                                           — seeded random HSL in ranges
// The same spec + seed always resolves to the same color, so forests are
// varied but stable across reloads.
export function resolveCanopyColor(spec, seed = 1) {
  const rng = mulberry32(seed * 3.71 + 9.23);
  const range = (value, fallback) => {
    if (Array.isArray(value)) {
      return THREE.MathUtils.lerp(value[0], value[1] ?? value[0], rng());
    }
    return value ?? fallback;
  };
  if (Array.isArray(spec)) {
    const isTriplet = spec.length === 3 &&
      spec.every((v) => typeof v === 'number' && v >= 0 && v <= 1);
    if (isTriplet) return setSrgb(new THREE.Color(), spec);
    return resolveCanopyColor(spec[Math.floor(rng() * spec.length)], seed + 1);
  }
  if (spec && typeof spec === 'object' && !spec.isColor) {
    if (spec.colors) {
      return resolveCanopyColor(spec.colors[Math.floor(rng() * spec.colors.length)], seed + 1);
    }
    if (spec.from !== undefined && spec.to !== undefined) {
      const from = setSrgb(new THREE.Color(), spec.from);
      const to = setSrgb(new THREE.Color(), spec.to);
      return from.lerp(to, rng());
    }
    return new THREE.Color().setHSL(
      range(spec.hue, 0.33),
      range(spec.saturation, 0.55),
      range(spec.lightness, 0.45),
      THREE.SRGBColorSpace,
    );
  }
  return setSrgb(new THREE.Color(), spec);
}

// Derive the anime three-tone palette from one canopy hue: cool dark
// shade, the base as the lit tone, and a warm bright crest for sun-struck
// crown tops (green trees crest toward yellow-green, yellow trees toward
// gold). Any tone can be pinned explicitly via `overrides` ({ lit, shadow,
// crown }) for full art direction.
export function deriveCanopyPalette(color, overrides = {}) {
  const lit = overrides.lit
    ? setSrgb(new THREE.Color(), overrides.lit)
    : setSrgb(new THREE.Color(), color);
  // The fixed hue rotations that work for greens break on warm canopies:
  // a gold tree's crown rotated -0.07 lands in salmon pink, and its shadow
  // rotated +0.045 lands in olive green — "why does my orange tree have
  // green leaves". Warm hues crest in place (paler gold, like a ginkgo)
  // and shade toward orange-brown; the crest also never rotates past gold.
  const GOLD_HUE = 0.118;
  const { h, l, s } = lit.getHSL({});
  const warm = h < 0.18 || h > 0.85;
  const shadow = overrides.shadow
    ? setSrgb(new THREE.Color(), overrides.shadow)
    : new THREE.Color().setHSL(
      (h + (warm ? -0.02 : 0.02) + 1) % 1,
      Math.min(s + 0.02, 1),
      // Keep shadow identity visibly below the lit value without returning
      // to the old near-black floor. The previous 0.74 ratio plus a fixed
      // 0.16 floor left ordinary green shadows almost as bright as the lit
      // palette after output conversion.
      Math.min(Math.max(l * 0.62, 0.1), l * 0.9),
    );
  const crownShift = warm ? 0 : Math.max(h - 0.035, GOLD_HUE) - h;
  const crown = overrides.crown
    ? setSrgb(new THREE.Color(), overrides.crown)
    : lit.clone().offsetHSL(crownShift, 0.02, 0.07);
  return { lit, shadow, crown };
}

const sharedLeafSprites = new Map();
function defaultLeafSprite(shape = 'teardrop') {
  if (!sharedLeafSprites.has(shape)) {
    sharedLeafSprites.set(shape, createLeafSpriteTexture({ shape }));
  }
  return sharedLeafSprites.get(shape);
}

// Shared uniform setters behind the setSun/setWind/... methods that every
// canopy-bearing class exposes (StylizedTree, StylizedTreeFoliage,
// StylizedBush): one implementation, thin delegates.
export function setCanopySun(
  uniforms,
  { direction, color, intensity, sky, skyIntensity } = {},
) {
  if (direction) {
    uniforms.uSunDirection.value.set(direction[0], direction[1], direction[2]).normalize();
  }
  if (color) setSrgb(uniforms.uSunColor.value, color);
  if (sky) setSrgb(uniforms.uSkyColor.value, sky);
  if (Number.isFinite(intensity) && uniforms.uSunIntensity) {
    uniforms.uSunIntensity.value = Math.max(intensity, 0);
  }
  if (Number.isFinite(skyIntensity) && uniforms.uSkyIntensity) {
    uniforms.uSkyIntensity.value = Math.max(skyIntensity, 0);
  }
}

export function setCanopyWind(uniforms, { direction, speed, strength } = {}) {
  if (direction) uniforms.uWindDirection.value.set(direction[0], direction[1]);
  if (Number.isFinite(speed)) uniforms.uWindSpeed.value = speed;
  if (Number.isFinite(strength)) uniforms.uWindStrength.value = strength;
}

export function setCanopySceneShadow(uniforms, { strength } = {}) {
  if (Number.isFinite(strength)) uniforms.uSceneShadowStrength.value = strength;
}

export function setCanopyCloudShadow(uniforms, { strength, coverage, scale, velocity } = {}) {
  if (Number.isFinite(strength)) uniforms.uCloudShadowStrength.value = strength;
  if (Number.isFinite(coverage)) uniforms.uCloudShadowCoverage.value = coverage;
  if (Number.isFinite(scale)) uniforms.uCloudShadowScale.value = scale;
  if (velocity) {
    uniforms.uCloudShadowVelocity.value.set(
      velocity[0] ?? velocity.x ?? 0, velocity[1] ?? velocity.y ?? 0);
  }
}

export function tickCanopyTime(uniforms, delta) {
  uniforms.uTime.value += Math.min(Math.max(delta ?? 0.016, 0), 0.1);
}

// Color + shadow-depth material pair. Pass `sharedUniforms` (e.g. one uTime /
// sun block reused across every tree material) to drive all canopies from a
// single per-frame update.
export function createTreeFoliageMaterials({
  // Any resolveCanopyColor spec: single color, list, {from,to} blend, or
  // HSL ranges — resolved deterministically with `seed`.
  color = 0x4da258,
  // Pin any of { lit, shadow, crown } explicitly; the rest derive from color.
  palette: paletteOverrides = {},
  seed = 1,
  leafMap = null,
  leafShape = 'teardrop',
  // Low enough that mipmap-averaged alpha doesn't erode distant crowns.
  alphaCutoff = 0.3,
  windDirection = [1, 0.3],
  windSpeed = 1.0,
  windStrength = 0.05,
  sunDirection = [0.35, 0.72, 0.42],
  sunColor = [1.0, 0.96, 0.84],
  skyColor = [0.62, 0.78, 0.95],
  // How strongly renderer shadow maps shift the crown toward its shadow tone.
  sceneShadowStrength = 0.55,
  // Translucent glow on leaves between the camera and the sun.
  backlitStrength = 0.35,
  // Drifting procedural cloud shadows across the crown. strength 0 disables;
  // velocity is noise-space drift per second (worldDrift = velocity / scale).
  cloudShadowStrength = 0,
  cloudShadowCoverage = 0.45,
  cloudShadowScale = 0.012,
  cloudShadowVelocity = [0.02, 0.006],
  vegetationShader = null,
  sharedUniforms = {},
} = {}) {
  const palette = deriveCanopyPalette(resolveCanopyColor(color, seed), paletteOverrides);
  const map = leafMap ?? defaultLeafSprite(leafShape);

  const material = createTreeLeafNodeMaterial({
    alphaCutoff,
    backlitStrength,
    cloudShadowCoverage,
    cloudShadowScale,
    cloudShadowStrength,
    cloudShadowVelocity,
    leafMap: map,
    sceneShadowStrength,
    windDirection,
    windSpeed,
    windStrength,
  }, vegetationShader);
  material.uniforms.uSunDirection.value.set(...sunDirection);
  setSrgb(material.uniforms.uSunColor.value, sunColor);
  setSrgb(material.uniforms.uSkyColor.value, skyColor);
  material.uniforms.uLitColor.value.copy(palette.lit);
  material.uniforms.uShadowColor.value.copy(palette.shadow);
  material.uniforms.uCrownColor.value.copy(palette.crown);

  // Shared classic uniform blocks (frozen playground callers) drive the
  // node uniforms through write-through wrappers: object values share the
  // instance, numeric values get accessor-backed sync.
  for (const [name, entry] of Object.entries(sharedUniforms)) {
    const node = material.uniforms[name];
    if (!node || !entry || typeof entry !== 'object') continue;
    if (entry.value !== null && typeof entry.value === 'object') {
      node.value = entry.value;
    } else {
      node.value = entry.value;
      Object.defineProperty(entry, 'value', {
        configurable: true,
        get: () => node.value,
        set: (next) => { node.value = next; },
      });
    }
  }

  // The mesh-level customDepthMaterial is the shared contract for both
  // three's native shadow pass and the Water Lab's node-backend sun pass.
  const depthMaterial = material.userData.createDepthColorVariant();
  return { material, depthMaterial, palette };
}

// Convenience mesh wrapper for non-React scenes.
export class StylizedTreeFoliage extends THREE.Mesh {
  constructor({ geometry: geometryOptions = {}, ...materialOptions } = {}) {
    const geometry = createTreeFoliageGeometry(geometryOptions);
    const { material, depthMaterial } = createTreeFoliageMaterials(materialOptions);
    super(geometry, material);
    this.name = 'StylizedTreeFoliage';
    this.customDepthMaterial = depthMaterial;
    this.castShadow = true;
    this.receiveShadow = true;
    this.frustumCulled = false;
    // Keep the loaded-scene material adapter from replacing the leaf shader.
    this.userData.environmentShaderExclude = true;
  }

  setSun(options) {
    setCanopySun(this.material.uniforms, options);
    return this;
  }

  setWind(options) {
    setCanopyWind(this.material.uniforms, options);
    return this;
  }

  // How strongly scene shadows (neighboring trees, the character) shift the
  // crown toward its shadow palette. 0 disables.
  setSceneShadow(options) {
    setCanopySceneShadow(this.material.uniforms, options);
    return this;
  }

  // Drifting procedural cloud shadows across the crown. strength 0 disables.
  setCloudShadow(options) {
    setCanopyCloudShadow(this.material.uniforms, options);
    return this;
  }

  update(delta) {
    tickCanopyTime(this.material.uniforms, delta);
    return this;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    this.customDepthMaterial?.dispose();
  }
}
