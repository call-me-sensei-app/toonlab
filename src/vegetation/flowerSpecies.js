// Common-flower species catalog + canvas head-sprite builder. Shared by the
// tree lab's flower patch (canopy blossoms / ground stems) and the
// StylizedFlower plant, so every flower feature agrees on what a "daisy" or
// "poppy" looks like. Heads are procedural canvas sprites built from the
// same traceLeafShapePath silhouettes as leaves — no texture assets.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { traceLeafShapePath } from './stylizedTreeFoliage.js';

// Each species is a full head look: petal layers (outer → inner; `scale`
// shrinks a layer, `shade` darkens the petal color, `offset` rotates it
// between the previous layer's petals) plus an optional center disc.
// `color`/`height` are the defaults the UI applies when the species is
// picked — the user can still recolor or resize afterwards. `headDiameter`
// is the real-world bloom diameter in meters, so plants keep believable
// proportions at any plant size (headScale multiplies it). `faceUp` is the
// up-bias mixed into each bloom's twig direction — a WORLD-FIXED facing
// (blooms never track the camera): near 0 faces outward like a mature
// sunflower, large opens to the sky like a tulip cup.
// The first three ids (tulip/daisy/blossom) predate the catalog and must
// keep their ids so saved recipes still resolve.
export const FLOWER_SPECIES = Object.freeze([
  {
    color: [0.93, 0.4, 0.45],
    height: 0.4,
    icon: '🌷',
    headDiameter: 0.09,
    curl: 0.5,
    faceUp: 2.5,
    id: 'tulip',
    label: 'Tulip',
    layers: [{ count: 3, lift: 66, shape: 'round', width: 0.62 }, { count: 3, lift: 58, offset: 0.5, shade: 0.9, shape: 'round', width: 0.62 }],
  },
  {
    center: { color: '#f0c437', radius: 13 },
    color: [1, 0.98, 0.92],
    height: 0.3,
    icon: '🌼',
    headDiameter: 0.06,
    curl: 0.15,
    faceUp: 1.2,
    id: 'daisy',
    label: 'Daisy',
    layers: [{ count: 10, lift: 12, shape: 'teardrop', width: 0.3 }],
  },
  {
    center: { color: '#f0c437', radius: 13 },
    color: [0.97, 0.78, 0.86],
    height: 0.3,
    icon: '🌸',
    headDiameter: 0.05,
    curl: 0.2,
    faceUp: 0.5,
    id: 'blossom',
    label: 'Cherry Blossom',
    layers: [{ count: 5, lift: 24, shape: 'round', width: 0.5 }],
  },
  {
    center: { color: '#5c3a1e', radius: 26 },
    color: [0.99, 0.78, 0.18],
    height: 0.85,
    icon: '🌻',
    headDiameter: 0.28,
    curl: 0.1,
    faceUp: 0.25,
    id: 'sunflower',
    label: 'Sunflower',
    layers: [
      { count: 16, lift: 10, shape: 'teardrop', width: 0.24 },
      { count: 16, lift: 16, offset: 0.5, scale: 0.82, shade: 0.8, shape: 'teardrop', width: 0.24 },
    ],
  },
  {
    center: { color: '#2f2a33', radius: 11 },
    color: [0.86, 0.19, 0.14],
    height: 0.45,
    icon: '🌺',
    headDiameter: 0.1,
    curl: 0.3,
    faceUp: 1.0,
    id: 'poppy',
    label: 'Poppy',
    layers: [{ count: 4, lift: 40, shape: 'round', width: 1.0 }],
  },
  {
    color: [0.82, 0.16, 0.28],
    height: 0.5,
    icon: '🌹',
    headDiameter: 0.09,
    curl: 0.45,
    faceUp: 0.55,
    id: 'rose',
    label: 'Rose',
    layers: [
      { count: 7, lift: 30, shape: 'round', width: 0.62 },
      { count: 5, lift: 48, offset: 0.5, scale: 0.8, shade: 0.8, shape: 'round', width: 0.62 },
      { count: 3, lift: 68, offset: 0.25, scale: 0.55, shade: 0.62, shape: 'round', width: 0.62 },
    ],
  },
  {
    center: { color: '#3b3f7a', radius: 9 },
    color: [0.35, 0.47, 0.9],
    height: 0.4,
    icon: '💠',
    headDiameter: 0.05,
    curl: 0.2,
    faceUp: 0.9,
    id: 'cornflower',
    label: 'Cornflower',
    layers: [{ count: 8, lift: 26, shape: 'maple', width: 0.42 }],
  },
  {
    center: { color: '#e8a616', radius: 11 },
    color: [0.99, 0.85, 0.2],
    height: 0.25,
    icon: '✿',
    headDiameter: 0.045,
    curl: 0.3,
    faceUp: 1.2,
    id: 'buttercup',
    label: 'Buttercup',
    layers: [{ count: 5, lift: 36, shape: 'round', width: 0.55 }],
  },
]);

function channelHex(channel) {
  return Math.round(Math.min(Math.max(channel, 0), 1) * 255).toString(16).padStart(2, '0');
}

function toRgb(color) {
  if (Array.isArray(color)) return color;
  const int = parseInt(String(color).replace('#', ''), 16);
  return [((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255];
}

function rgbHex(rgb, shade = 1) {
  return `#${rgb.map((channel) => channelHex(channel * shade)).join('')}`;
}

function paintGeometry(geometry, [r, g, b], role = 0) {
  const count = geometry.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  const roles = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
    roles[i] = role;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  // 0 = petal, 1 = center. The shared flower shader uses this semantic
  // attribute instead of guessing from color, so recoloring never changes
  // the center/petal lighting relationship.
  geometry.setAttribute('flowerRole', new THREE.BufferAttribute(roles, 1));
  return geometry;
}

/**
 * Builds a real 3D head mesh for a species (EZ-Tree ships small flower
 * MODELS; ours are procedural): curved petal planes arranged in rings —
 * `lift` degrees above flat per layer (a daisy ring lies almost flat, a
 * tulip's petals stand up into a cup), species `curl` bowing each petal
 * toward the axis — plus a center dome. Unit size (head diameter ≈ 1,
 * axis = +Z), vertex-colored, ready for a vertexColors toon material.
 *
 * @param {Object} [options] `species` (FLOWER_SPECIES id) and optional
 *   `color` petal override (sRGB triplet or hex).
 * @returns {THREE.BufferGeometry} merged head geometry.
 */
export function createFlowerHeadGeometry({ species, color } = {}) {
  const spec = FLOWER_SPECIES.find((entry) => entry.id === species)
    ?? FLOWER_SPECIES[0];
  const rgb = toRgb(color ?? spec.color);
  const curl = spec.curl ?? 0.2;
  // Sprite center radii are px of a 128px canvas; 64px = unit head radius 0.5.
  const centerRadius = spec.center ? (spec.center.radius / 64) * 0.5 : 0;
  const petalBase = centerRadius * 0.75 + 0.02;
  const pieces = [];

  for (const layer of spec.layers) {
    const lift = THREE.MathUtils.degToRad(layer.lift ?? 20);
    const layerScale = layer.scale ?? 1;
    const length = Math.min(
      (0.5 * layerScale - petalBase) / Math.max(Math.cos(lift), 0.35),
      0.8 * layerScale,
    );
    const width = length * (layer.width ?? 0.5);
    const shade = layer.shade ?? 1;
    const petalColor = [rgb[0] * shade, rgb[1] * shade, rgb[2] * shade];

    for (let i = 0; i < layer.count; i += 1) {
      const petal = new THREE.PlaneGeometry(width, length, 1, 5);
      petal.translate(0, length / 2, 0); // base at the origin
      const position = petal.getAttribute('position');
      for (let v = 0; v < position.count; v += 1) {
        // PlaneGeometry's final segmented row can land a few ulps beyond
        // `length`. Clamp both inputs before the fractional power: raising a
        // tiny negative sine value to 0.7 yields NaN, which then poisons the
        // instanced flower bounds and any camera framing derived from them.
        const t = THREE.MathUtils.clamp(position.getY(v) / length, 0, 1);
        const silhouette = Math.max(
          Math.sin(Math.PI * (0.12 + 0.88 * t)),
          0,
        ) ** 0.7;
        // Rounded petal silhouette + curl bowing the tip toward the axis.
        position.setX(v, position.getX(v) * silhouette);
        position.setZ(v, curl * length * t * t);
      }
      petal.computeVertexNormals();
      const azimuth = ((i + (layer.offset ?? 0)) / layer.count) * Math.PI * 2;
      petal.applyMatrix4(new THREE.Matrix4()
        .makeRotationZ(azimuth)
        .multiply(new THREE.Matrix4().makeTranslation(0, petalBase, 0))
        .multiply(new THREE.Matrix4().makeRotationX(lift)));
      pieces.push(paintGeometry(petal, petalColor, 0));
    }
  }

  if (spec.center) {
    const dome = new THREE.SphereGeometry(centerRadius, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
    dome.rotateX(Math.PI / 2);
    dome.scale(1, 1, 0.45);
    pieces.push(paintGeometry(dome, toRgb(spec.center.color), 1));
  }

  const merged = mergeGeometries(pieces);
  pieces.forEach((piece) => piece.dispose());
  return merged;
}

/**
 * Builds a 128×128 head sprite for a species (or a hand-drawn petal
 * outline). `petal.preset` is a FLOWER_SPECIES id or 'custom' (with
 * `petal.outline`); `color` overrides the species petal color (sRGB triplet
 * or hex — falls back to the species default when null).
 */
export function createFlowerHeadTexture({ color, petal }) {
  const spec = FLOWER_SPECIES.find((entry) => entry.id === petal?.preset)
    ?? FLOWER_SPECIES[0];
  const outline = petal?.preset === 'custom' ? petal.outline : null;
  const rgb = toRgb(color ?? spec.color);
  const layers = outline
    ? [{ count: 5, shape: 'custom', width: 0.7 }]
    : spec.layers;

  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.translate(64, 64);
  layers.forEach((layer) => {
    const scale = layer.scale ?? 1;
    ctx.fillStyle = rgbHex(rgb, layer.shade ?? 1);
    for (let i = 0; i < layer.count; i += 1) {
      ctx.save();
      ctx.rotate(((i + (layer.offset ?? 0)) / layer.count) * Math.PI * 2);
      ctx.translate(0, -30 * scale);
      traceLeafShapePath(ctx, layer.shape, 58 * scale, 58 * scale * layer.width, outline);
      ctx.fill();
      ctx.restore();
    }
  });
  const center = outline ? { color: '#f0c437', radius: 13 } : spec.center;
  if (center) {
    ctx.fillStyle = center.color;
    ctx.beginPath();
    ctx.arc(0, 0, center.radius, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  // Semantic asset metadata for composite flower-head materials. The shader
  // uses this mask radius to shade center and petal roles independently; it
  // must not infer the role from color because every palette is valid.
  texture.userData.toonlabFlower = {
    centerRadius: center ? center.radius / canvas.width : 0,
  };
  return texture;
}
