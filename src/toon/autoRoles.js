import * as THREE from 'three';

import { characterFrameInverse, characterFrameToRoot, characterForward } from './headBone.js';
import { isSkinLikeColor } from './skinEvidence.js';
import { rasterizeTriangle, readTexturePixels, sampleTexturePixel } from './texturePixels.js';

// Automatic per-vertex roles for characters whose materials say nothing about
// what they are — one atlased material from an image-to-3D generator, an
// exported "Material_0". Without this, a face is shaded with the body cel
// threshold (harsh nose and eye-socket shapes) and skin gets generic HSV
// shadows.
//
// Evidence, in order:
//   1. The head: vertices skinned to the head bone (and its descendants) on a
//      rigged model — plus, inside the head's footprint, everything above the
//      neck joint, because low-poly rigs often weight the jaw to the neck —
//      otherwise everything above the neck, where the neck is the narrowest
//      horizontal slice below the widest part of the head.
//   2. The model's own skin tone, sampled from the cheek/chin band of the
//      front of the head — a region that is skin on essentially every
//      character. The band must itself look like skin (skinEvidence.js), so a
//      helmet visor or a robot face is not taken as one; glasses or a lock of
//      hair across the band may outnumber the skin in it, so a band that is
//      mostly skin-coloured texels by a clear share still counts. Brown,
//      auburn and blond hair is skin-coloured by hue too, and hair framing a
//      chibi face fills much of the band: when the band's skin-coloured texels
//      form two clearly different lightness groups and the crown's lightness
//      matches the darker one, that group is hair and the lighter one is the
//      skin, and from then on only texels on the skin's side of the lightness
//      boundary count as skin-toned. Hair as light as the skin is not split.
//   3. Face = the front face zone of the head. Below the brow line everything
//      is face (eyes, brows and mouth belong to it); above it only texels in
//      the model's skin tone (so bangs over the forehead are not face).
//   4. Hair = head texels outside the face that are not skin-toned; body skin
//      = body texels in the face's skin tone.
//
// The result is a normalized Uint8 vec4 `toonRoleWeights` (R skin, G face,
// B hair; a partition — they sum to at most 1, the rest is the material's own
// role) per vertex, consumed by the toon shader, and an estimated head frame
// on the root for face lighting on unrigged models. When the head is low-poly
// (a face of a few large polygons, where per-vertex weights smear the
// face/hair boundary across whole triangles), the same classification is also
// baked per texel into a role mask on the mesh's own UVs
// (`geometry.userData.toonAutoRoleMask`), which the converter uses instead.

export const AUTO_ROLE_ATTRIBUTE = 'toonRoleWeights';

const UP = new THREE.Vector3(0, 1, 0);
const SLICE_COUNT = 160;

function smoothstep(edge0, edge1, x) {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function srgbToLinear(value) {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

// Chromaticity plus log-luminance: painted shading on skin changes brightness
// far more than it changes hue, so brightness is weighted down.
function colorSignature(rgba, target = [0, 0, 0]) {
  const r = srgbToLinear(rgba[0]);
  const g = srgbToLinear(rgba[1]);
  const b = srgbToLinear(rgba[2]);
  const sum = Math.max(r + g + b, 1e-4);
  target[0] = r / sum;
  target[1] = g / sum;
  target[2] = Math.log(Math.max(r * 0.2126 + g * 0.7152 + b * 0.0722, 1e-4));
  return target;
}

// Oklab lightness (0 black – 1 white) of an sRGB texel. Perceptual, unlike the
// down-weighted log-luminance above: it is what separates skin from hair of
// the same warm hue.
function oklabLightness(rgba) {
  const r = srgbToLinear(rgba[0]);
  const g = srgbToLinear(rgba[1]);
  const b = srgbToLinear(rgba[2]);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
}

function signatureDistance(a, b) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const dl = (a[2] - b[2]) * 0.06;
  return Math.sqrt(dr * dr + dg * dg + dl * dl);
}

function median(values) {
  const sorted = [...values].sort((x, y) => x - y);
  return sorted[Math.floor(sorted.length / 2)];
}

function collectTargets(root, isEligible) {
  const targets = [];
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry?.attributes?.position || obj.userData?.isToonOutline) return;
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
    if (!materials.some((mat) => mat && isEligible(mat))) return;
    targets.push(obj);
  });
  return targets;
}

// Texture (or material) colour at a vertex, 0-255 RGBA into `target`.
function sampleVertexColor(mesh, i, target) {
  const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  const texture = material?.map;
  const uv = mesh.geometry.attributes.uv;
  const pixels = texture ? readTexturePixels(texture, { maxSize: 1024 }) : null;
  if (!pixels || !uv) {
    const color = material?.color ?? new THREE.Color(1, 1, 1);
    target[0] = color.r * 255; target[1] = color.g * 255; target[2] = color.b * 255; target[3] = 255;
    return target;
  }
  return sampleTexturePixel(pixels, texture, uv.getX(i), uv.getY(i), target);
}

function updateMapMatrices(meshes) {
  for (const mesh of meshes) {
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (material?.map?.matrixAutoUpdate) material.map.updateMatrix();
  }
}

// Rest-pose facing. Every classification here works in the character frame
// (facing +Z), which a model states with `root.userData.toonForward`; without
// it +Z is assumed. A rig whose rest pose faces elsewhere while its animations
// turn it forward (the Sensei Run chibis face -X at rest) was analysed from
// the side of the head: the face put on one cheek and the hair over the eyes.
// The face is where the head's bright skin-coloured surface points: measured
// on five chibis (2026-10-13), its mean horizontal normal is 0.21-0.41 long
// and within 9 degrees of an axis; brown hair (skin-coloured by hue) is
// excluded by lightness. Rigged models only (the head comes from the skin
// weights); bald or masked heads give no clear direction and keep +Z. Light
// warm hair is not excluded (Yuxi's ash-grey hair, 2026-10-16, pointed it at
// -Z), so inferAutoRoleWeights consults it only after the +Z analysis fails.
const FORWARD_MIN_SAMPLES = 64;
const FORWARD_MIN_STRENGTH = 0.12;
const FORWARD_SKIN_MIN_LIGHTNESS = 0.6;

function estimateRestForward(root, targets, headBones) {
  if (headBones.size === 0) return null;
  updateMapMatrices(targets);
  const rootInverse = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const normal = new THREE.Vector3();
  const texel = [0, 0, 0, 255];
  let sumX = 0;
  let sumZ = 0;
  let count = 0;
  for (const mesh of targets) {
    const headness = skinnedHeadness(mesh, headBones);
    const normals = mesh.geometry.attributes.normal;
    if (!headness || !normals) continue;
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(new THREE.Matrix4().multiplyMatrices(rootInverse, mesh.matrixWorld));
    const stride = Math.max(1, Math.floor(normals.count / 20000));
    for (let i = 0; i < normals.count; i += stride) {
      if (headness[i] < 0.9) continue;
      sampleVertexColor(mesh, i, texel);
      if (!isSkinLikeColor(texel[0] / 255, texel[1] / 255, texel[2] / 255)) continue;
      if (oklabLightness(texel) < FORWARD_SKIN_MIN_LIGHTNESS) continue;
      normal.fromBufferAttribute(normals, i).applyMatrix3(normalMatrix).normalize();
      sumX += normal.x;
      sumZ += normal.z;
      count += 1;
    }
  }
  if (count < FORWARD_MIN_SAMPLES) return null;
  const x = sumX / count;
  const z = sumZ / count;
  const strength = Math.hypot(x, z);
  if (strength < FORWARD_MIN_STRENGTH) return null;
  // Rigs are authored axis-aligned: the nearest horizontal axis.
  const forward = Math.abs(x) > Math.abs(z) ? [Math.sign(x), 0, 0] : [0, 0, Math.sign(z)];
  return { forward, samples: count, strength };
}

function headBoneSet(headBone) {
  const bones = new Set();
  headBone?.traverse((node) => {
    if (node.isBone) bones.add(node);
  });
  return bones;
}

// Per-vertex "headness" from the rig: for a skinned mesh, the share of skin
// weight carried by the head bone and its descendants (hair and accessory
// bones included) — zero everywhere when none of its bones is in the head; for
// a rigid mesh attached under a bone, one when that bone is in the head, zero
// otherwise. Null only for meshes the rig says nothing about (unrigged).
function skinnedHeadness(mesh, headBones) {
  if (headBones.size === 0) return null;
  const index = mesh.geometry.attributes.skinIndex;
  const weight = mesh.geometry.attributes.skinWeight;
  const bones = mesh.skeleton?.bones;
  if (!mesh.isSkinnedMesh || !index || !weight || !bones) return rigidHeadness(mesh, headBones);
  const isHeadBone = bones.map((bone) => headBones.has(bone));
  const headness = new Float32Array(index.count);
  if (!isHeadBone.some(Boolean)) return headness;
  for (let i = 0; i < index.count; i += 1) {
    let sum = 0;
    for (let k = 0; k < 4; k += 1) {
      if (isHeadBone[index.getComponent(i, k)]) sum += weight.getComponent(i, k);
    }
    headness[i] = sum;
  }
  return headness;
}

function rigidHeadness(mesh, headBones) {
  let underBone = false;
  for (let node = mesh.parent; node; node = node.parent) {
    if (headBones.has(node)) return new Float32Array(mesh.geometry.attributes.position.count).fill(1);
    if (node.isBone) underBone = true;
  }
  return underBone ? new Float32Array(mesh.geometry.attributes.position.count) : null;
}

// Low-poly and generated rigs often weight the jaw and lower face to the neck,
// leaving the head bone's region as mostly hair. Inside the head's horizontal
// footprint (from the weighted head vertices), anything above a point just
// over the neck joint is head as well.
const NECK_TO_HEAD_FLOOR = 0.25;
const FOOTPRINT_PERCENTILE = 0.8;
// The cheek band must look like skin: its median colour skin-coloured, and at
// least this share of it (large painted features — a chibi nose and lips —
// take the rest).
const REFERENCE_MIN_SKIN_FRACTION = 0.3;
// When the band's median colour is not skin (glasses frames and lenses, or a
// lock of hair, cover much of it), a larger share of skin-coloured texels is
// required instead (Keisuke, glasses: 42 %; Akika, hair over the cheeks: 38 %).
const REFERENCE_MIN_SKIN_FRACTION_MIXED = 0.35;
const SATURATED_REFERENCE_CHROMA = 0.2;
// Skin-coloured hair in the cheek band: its skin-coloured texels split into
// two lightness groups (1-D two-means on Oklab lightness) at least this far
// apart, the smaller holding at least SKIN_SPLIT_MIN_SHARE of them. Measured
// on six chibis with brown hair (2026-10-13): group centres skin 0.72–0.84,
// hair 0.32–0.46 (black hair is not skin-coloured and never splits). The
// boundary is softened by SKIN_SPLIT_SOFTNESS either side.
const SKIN_SPLIT_MIN_GAP = 0.2;
const SKIN_SPLIT_MIN_SHARE = 0.1;
const SKIN_SPLIT_SOFTNESS = 0.04;
// Crown: head texels this far above the head's centre (fraction of its height
// radius) give the hair's lightness.
const CROWN_Y = 0.7;

function extendHeadAboveNeck(meshes, headBone, rootInverse) {
  const neckBone = headBone?.parent?.isBone ? headBone.parent : null;
  if (!neckBone) return;
  const head = headBone.getWorldPosition(new THREE.Vector3()).applyMatrix4(rootInverse);
  const neck = neckBone.getWorldPosition(new THREE.Vector3()).applyMatrix4(rootInverse);
  if (!(head.y > neck.y)) return;
  const distances = [];
  for (const { headness, points } of meshes) {
    for (let i = 0; i < headness.length; i += 1) {
      if (headness[i] >= 0.5) distances.push(Math.hypot(points[i * 3] - head.x, points[i * 3 + 2] - head.z));
    }
  }
  if (distances.length === 0) return;
  distances.sort((a, b) => a - b);
  const radius = distances[Math.floor((distances.length - 1) * FOOTPRINT_PERCENTILE)];
  const floorY = neck.y + (head.y - neck.y) * NECK_TO_HEAD_FLOOR;
  for (const { headness, points } of meshes) {
    for (let i = 0; i < headness.length; i += 1) {
      if (points[i * 3 + 1] >= floorY && Math.hypot(points[i * 3] - head.x, points[i * 3 + 2] - head.z) <= radius) headness[i] = 1;
    }
  }
}

const FACE_FRAME_MIN_VERTICES = 32;
const FACE_FRAME_PERCENTILE = 0.03;
const FACE_FRAME_PADDING = 1.08;
const FACE_MAX_HEIGHT_TO_WIDTH = 1.1;

function percentileOf(sorted, fraction) {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * fraction)))];
}

// Two lightness groups among the band's skin-coloured texels — skin and darker
// hair of the same warm hue — or null when they form one group. The darker
// group is the hair only when the crown's median lightness is nearer to it.
// Hair as light as the skin or lighter (ash, silver, platinum) is never split
// off: its crown matches the lighter group, which is then the skin itself
// (Yuxi, 2026-10-16: crown and cheeks both about 0.8, the darker group her
// lips and lashes), so such models keep the unsplit skin reference. (A bald
// head with a brown beard would be read the wrong way round; name its face
// material to skip automatic roles.)
function splitSkinFromHair(lightness, crownLightness) {
  if (lightness.length < 32 || crownLightness.length < 16) return null;
  const sorted = [...lightness].sort((a, b) => a - b);
  let low = percentileOf(sorted, 0.2);
  let high = percentileOf(sorted, 0.8);
  let lowCount = 0;
  for (let iteration = 0; iteration < 16; iteration += 1) {
    const boundary = (low + high) / 2;
    let lowSum = 0;
    let highSum = 0;
    lowCount = 0;
    for (const value of sorted) {
      if (value < boundary) {
        lowSum += value;
        lowCount += 1;
      } else {
        highSum += value;
      }
    }
    if (lowCount === 0 || lowCount === sorted.length) return null;
    low = lowSum / lowCount;
    high = highSum / (sorted.length - lowCount);
  }
  const smallerShare = Math.min(lowCount, sorted.length - lowCount) / sorted.length;
  if (high - low < SKIN_SPLIT_MIN_GAP || smallerShare < SKIN_SPLIT_MIN_SHARE) return null;
  const crown = median(crownLightness);
  if (Math.abs(crown - low) > Math.abs(crown - high)) return null;
  const boundary = (low + high) / 2;
  // 1 on the skin's (lighter) side of the boundary.
  const weight = (value) => smoothstep(boundary - SKIN_SPLIT_SOFTNESS, boundary + SKIN_SPLIT_SOFTNESS, value);
  return { boundary, groups: [low, high], hair: 'darker', isSkinSide: (value) => weight(value) >= 0.5, weight };
}

// Centre and radii (root space, x/y) of the visible face: head vertices that
// face forward, sit on the front half of the head and match the skin tone.
function measureFaceFrame(meshes, headnessAt, isSkinToned, center, radiusX) {
  const xs = [];
  const ys = [];
  for (const entry of meshes) {
    for (let i = 0; i < entry.points.length / 3; i += 1) {
      if (headnessAt(entry, i) < 0.5 || entry.normals[i * 3 + 2] < 0.3) continue;
      if (entry.points[i * 3 + 2] - center.z < -0.1 * radiusX) continue;
      if (!isSkinToned(entry, i)) continue;
      xs.push(entry.points[i * 3]);
      ys.push(entry.points[i * 3 + 1]);
    }
  }
  if (xs.length < FACE_FRAME_MIN_VERTICES) return null;
  xs.sort((a, b) => a - b);
  ys.sort((a, b) => a - b);
  const left = percentileOf(xs, FACE_FRAME_PERCENTILE);
  const right = percentileOf(xs, 1 - FACE_FRAME_PERCENTILE);
  const bottom = percentileOf(ys, FACE_FRAME_PERCENTILE);
  const width = right - left;
  const top = Math.min(percentileOf(ys, 1 - FACE_FRAME_PERCENTILE), bottom + width * FACE_MAX_HEIGHT_TO_WIDTH);
  if (!(width > 0) || !(top > bottom)) return null;
  return {
    rx: (width / 2) * FACE_FRAME_PADDING,
    ry: ((top - bottom) / 2) * FACE_FRAME_PADDING,
    x: (left + right) / 2,
    y: (bottom + top) / 2,
  };
}

// Per-texel role mask for low-poly heads: the same classification evaluated
// at every texel the mesh covers in its own UV space, with position, normal
// and headness interpolated across each triangle and the colour read from the
// texture itself. Only for single-material textured meshes, whose UV space
// belongs to one texture.
const TEXEL_MASK_MAX_HEAD_VERTICES = 20000;
const TEXEL_MASK_SIZE = 1024;
const TEXEL_MASK_PADDING = 4;

function bakeTexelRoleMask(entry, headnessAt, classify) {
  const { mesh, normals, points } = entry;
  if (Array.isArray(mesh.material) && mesh.material.length > 1) return null;
  const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  const texture = material?.map;
  const uv = mesh.geometry.attributes.uv;
  if (!texture?.isTexture || !uv) return null;
  const pixels = readTexturePixels(texture, { maxSize: TEXEL_MASK_SIZE });
  if (!pixels) return null;
  if (texture.matrixAutoUpdate) texture.updateMatrix();

  const size = TEXEL_MASK_SIZE;
  const data = new Uint8Array(size * size * 4);
  const covered = new Uint8Array(size * size);
  const index = mesh.geometry.index;
  const triangleCount = index ? index.count / 3 : uv.count / 3;
  const rgba = [0, 0, 0, 255];
  const headness = new Float32Array(uv.count);
  for (let i = 0; i < uv.count; i += 1) headness[i] = headnessAt(entry, i);

  for (let t = 0; t < triangleCount; t += 1) {
    const a = index ? index.getX(t * 3) : t * 3;
    const b = index ? index.getX(t * 3 + 1) : t * 3 + 1;
    const c = index ? index.getX(t * 3 + 2) : t * 3 + 2;
    const ua = uv.getX(a);
    const va = uv.getY(a);
    const ub = uv.getX(b);
    const vb = uv.getY(b);
    const uc = uv.getX(c);
    const vc = uv.getY(c);
    rasterizeTriangle(ua * size, va * size, ub * size, vb * size, uc * size, vc * size, size, size, (x, y, w0, w1, w2) => {
      const lerp = (array, k) => array[a * 3 + k] * w0 + array[b * 3 + k] * w1 + array[c * 3 + k] * w2;
      sampleTexturePixel(pixels, texture, ua * w0 + ub * w1 + uc * w2, va * w0 + vb * w1 + vc * w2, rgba);
      const roles = classify(
        lerp(points, 0),
        lerp(points, 1),
        lerp(points, 2),
        lerp(normals, 2),
        headness[a] * w0 + headness[b] * w1 + headness[c] * w2,
        rgba,
      );
      const texelIndex = y * size + x;
      // Overlapping UVs (mirrored halves) keep the strongest evidence.
      for (let k = 0; k < 3; k += 1) {
        data[texelIndex * 4 + k] = Math.max(data[texelIndex * 4 + k], Math.round(roles[k] * 255));
      }
      data[texelIndex * 4 + 3] = 255;
      covered[texelIndex] = 1;
    });
  }

  // Pad past UV island borders so bilinear sampling at seams reads the island.
  for (let pass = 0; pass < TEXEL_MASK_PADDING; pass += 1) {
    const grow = [];
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const i = y * size + x;
        if (covered[i]) continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= size || yy >= size || !covered[yy * size + xx]) continue;
          grow.push([i, yy * size + xx]);
          break;
        }
      }
    }
    if (!grow.length) break;
    for (const [i, from] of grow) {
      data.copyWithin(i * 4, from * 4, from * 4 + 4);
      covered[i] = 1;
    }
  }

  const mask = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  mask.colorSpace = THREE.NoColorSpace;
  mask.magFilter = THREE.LinearFilter;
  mask.minFilter = THREE.LinearFilter;
  mask.generateMipmaps = false;
  mask.name = 'toonAutoRoleMask';
  mask.needsUpdate = true;
  return mask;
}

// Neck height from the silhouette profile: scan down from the top, record the
// widest slice of the head, then the narrowest slice before the body widens
// past it again.
function findNeckHeight(slices, minY, sliceHeight) {
  let headWidest = 0;
  let neck = -1;
  let neckWidth = Infinity;
  for (let s = SLICE_COUNT - 1; s >= 0; s -= 1) {
    const width = slices[s];
    if (!Number.isFinite(width)) continue;
    const fromTop = (SLICE_COUNT - 1 - s) / SLICE_COUNT;
    if (fromTop < 0.02) continue;
    if (neck < 0 && width >= headWidest) {
      headWidest = width;
      continue;
    }
    if (width < neckWidth) {
      neckWidth = width;
      neck = s;
    }
    if (width > headWidest * 1.15 && neck >= 0) break;
  }
  if (neck < 0 || neckWidth > headWidest * 0.9) return null;
  return minY + (neck + 0.5) * sliceHeight;
}

// Analysis failures that mean "no skin where the face should be", after which
// an undeclared rest-pose facing is estimated and the analysis retried.
const RETRY_WITH_INFERRED_FORWARD = new Set(['no-skin-reference', 'reference-not-skin']);

/**
 * Infers per-vertex role weights for the eligible meshes under `root`.
 * `isEligible(material)` selects materials whose roles are unknown.
 * Returns a report; `applied` is false (with a `reason`) when evidence is
 * insufficient, in which case nothing is modified.
 *
 * The analysis runs in the declared character frame (`root.userData.toonForward`,
 * +Z when none is declared). Only when a model declares nothing and its +Z
 * analysis finds no skin in the cheek band is its rest-pose facing estimated
 * (estimateRestForward) and the analysis retried from that side. The estimate
 * is a fallback, never an override: light warm hair (ash, silver, blond) is
 * skin-coloured by hue and can outweigh the face in it. The inferred axis is
 * kept, and written to the root so later bakes and head tracking agree, only
 * when the retry succeeds.
 */
export function inferAutoRoleWeights(root, {
  headBone = null,
  isEligible = () => true,
  skinTolerance = 0.07,
} = {}) {
  const targets = collectTargets(root, isEligible);
  if (targets.length === 0) return { applied: false, reason: 'no-eligible-meshes' };

  root.updateMatrixWorld(true);
  const headBones = headBoneSet(headBone);
  const analyse = (forwardInferred) => analyseRoles(root, targets, headBone, headBones, skinTolerance, forwardInferred);
  const result = analyse(null);
  if (result.applied || !RETRY_WITH_INFERRED_FORWARD.has(result.reason)) return result;
  if (Array.isArray(root.userData?.toonForward)) return result;

  const estimate = estimateRestForward(root, targets, headBones);
  if (!estimate || estimate.forward[2] === 1) return result;
  const previousForward = root.userData.toonForward;
  root.userData.toonForward = estimate.forward;
  const retried = analyse(estimate);
  if (retried.applied) return retried;
  if (previousForward === undefined) delete root.userData.toonForward;
  else root.userData.toonForward = previousForward;
  return result;
}

/**
 * One analysis in the root's current character frame. Returns before
 * modifying anything when the evidence is insufficient.
 * @param {THREE.Mesh[]} targets
 * @param {{ forward: number[], samples: number, strength: number } | null} forwardInferred
 */
function analyseRoles(root, targets, headBone, headBones, skinTolerance, forwardInferred) {
  // The character frame (facing +Z), not the root's raw frame: a VRM 0.x
  // root is turned 180° by its importer.
  const rootInverse = characterFrameInverse(root);

  // Gather every eligible vertex in root space once.
  const meshes = targets.map((mesh) => {
    const position = mesh.geometry.attributes.position;
    const normal = mesh.geometry.attributes.normal;
    const toRoot = new THREE.Matrix4().multiplyMatrices(rootInverse, mesh.matrixWorld);
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(toRoot);
    const points = new Float32Array(position.count * 3);
    const normals = new Float32Array(position.count * 3);
    const p = new THREE.Vector3();
    const n = new THREE.Vector3();
    for (let i = 0; i < position.count; i += 1) {
      p.fromBufferAttribute(position, i).applyMatrix4(toRoot);
      points[i * 3] = p.x;
      points[i * 3 + 1] = p.y;
      points[i * 3 + 2] = p.z;
      if (normal) {
        n.fromBufferAttribute(normal, i).applyMatrix3(normalMatrix).normalize();
        normals[i * 3] = n.x;
        normals[i * 3 + 1] = n.y;
        normals[i * 3 + 2] = n.z;
      }
    }
    return { headness: skinnedHeadness(mesh, headBones), mesh, normals, points };
  });

  const bounds = new THREE.Box3();
  for (const { points } of meshes) {
    for (let i = 0; i < points.length; i += 3) {
      bounds.min.x = Math.min(bounds.min.x, points[i]);
      bounds.min.y = Math.min(bounds.min.y, points[i + 1]);
      bounds.min.z = Math.min(bounds.min.z, points[i + 2]);
      bounds.max.x = Math.max(bounds.max.x, points[i]);
      bounds.max.y = Math.max(bounds.max.y, points[i + 1]);
      bounds.max.z = Math.max(bounds.max.z, points[i + 2]);
    }
  }
  const height = bounds.max.y - bounds.min.y;
  if (!(height > 0)) return { applied: false, reason: 'empty-bounds' };

  // Head region: skin weights when every mesh has them, else the neck search.
  const rigged = meshes.every((entry) => entry.headness);
  let neckY = null;
  if (!rigged) {
    const centerX = (bounds.min.x + bounds.max.x) / 2;
    const centerZ = (bounds.min.z + bounds.max.z) / 2;
    const sliceHeight = height / SLICE_COUNT;
    const slices = new Array(SLICE_COUNT).fill(-Infinity);
    for (const { points } of meshes) {
      for (let i = 0; i < points.length; i += 3) {
        const s = Math.min(SLICE_COUNT - 1, Math.floor((points[i + 1] - bounds.min.y) / sliceHeight));
        const radius = Math.hypot(points[i] - centerX, points[i + 2] - centerZ);
        if (radius > slices[s]) slices[s] = radius;
      }
    }
    neckY = findNeckHeight(slices, bounds.min.y, sliceHeight);
    if (neckY === null) return { applied: false, reason: 'no-neck-found' };
  }
  if (rigged) extendHeadAboveNeck(meshes, headBone, rootInverse);
  const headnessAt = (entry, i) => (rigged
    ? entry.headness[i]
    : smoothstep(neckY - height * 0.004, neckY + height * 0.004, entry.points[i * 3 + 1]));

  // Head frame: centroid, horizontal and vertical radii of the head region.
  const center = new THREE.Vector3();
  let headCount = 0;
  const headBox = new THREE.Box3();
  const point = new THREE.Vector3();
  for (const entry of meshes) {
    for (let i = 0; i < entry.points.length / 3; i += 1) {
      if (headnessAt(entry, i) < 0.5) continue;
      point.fromArray(entry.points, i * 3);
      center.add(point);
      headBox.expandByPoint(point);
      headCount += 1;
    }
  }
  if (headCount < 64) return { applied: false, reason: 'head-too-small' };
  center.divideScalar(headCount);
  const radiusX = Math.max((headBox.max.x - headBox.min.x) / 2, 1e-4);
  const radiusY = Math.max((headBox.max.y - headBox.min.y) / 2, 1e-4);

  // Skin reference from the cheek/chin band on the front of the head.
  const sampleColor = sampleVertexColor;
  updateMapMatrices(targets);

  const texel = [0, 0, 0, 255];
  const signature = [0, 0, 0];
  // Skin-coloured band texels: signature and Oklab lightness each.
  const bandSkin = [];
  const referenceRgb = [[], [], []];
  const crownLightness = [];
  for (const entry of meshes) {
    const stride = Math.max(1, Math.floor(entry.points.length / 3 / 20000));
    for (let i = 0; i < entry.points.length / 3; i += stride) {
      if (headnessAt(entry, i) < 0.9) continue;
      const x = (entry.points[i * 3] - center.x) / radiusX;
      const y = (entry.points[i * 3 + 1] - center.y) / radiusY;
      if (y > CROWN_Y) crownLightness.push(oklabLightness(sampleColor(entry.mesh, i, texel)));
      const facing = entry.normals[i * 3 + 2];
      if (facing < 0.55 || Math.abs(x) > 0.45 || y > -0.1 || y < -0.65) continue;
      colorSignature(sampleColor(entry.mesh, i, texel), signature);
      for (let k = 0; k < 3; k += 1) referenceRgb[k].push(texel[k]);
      // The skin tone itself is the median of the skin-coloured texels only:
      // a big red nose, dark lips and eyes in this zone otherwise pulled it
      // off the skin, leaving the forehead and outer cheeks part hair.
      if (!isSkinLikeColor(texel[0] / 255, texel[1] / 255, texel[2] / 255)) continue;
      bandSkin.push({ signature: [signature[0], signature[1], signature[2]], lightness: oklabLightness(texel) });
    }
  }
  const sampled = referenceRgb[0].length;
  if (sampled < 16) return { applied: false, reason: 'no-skin-reference' };
  const medianRgb = referenceRgb.map(median);
  const medianIsSkin = isSkinLikeColor(medianRgb[0] / 255, medianRgb[1] / 255, medianRgb[2] / 255);
  const minSkinFraction = medianIsSkin ? REFERENCE_MIN_SKIN_FRACTION : REFERENCE_MIN_SKIN_FRACTION_MIXED;
  if (bandSkin.length < 16 || bandSkin.length < sampled * minSkinFraction) {
    return { applied: false, medianRgb, reason: 'reference-not-skin', referenceSkinFraction: bandSkin.length / sampled };
  }
  const skinSplit = splitSkinFromHair(bandSkin.map((sample) => sample.lightness), crownLightness);
  const skinSamples = skinSplit ? bandSkin.filter((sample) => skinSplit.isSkinSide(sample.lightness)) : bandSkin;
  const skinReference = [0, 1, 2].map((k) => median(skinSamples.map((sample) => sample.signature[k])));
  // 1 on the skin's side of a lightness split (always 1 without one).
  const skinSideAt = (rgba) => (skinSplit ? skinSplit.weight(oklabLightness(rgba)) : 1);
  // Linear chromaticity spreads saturated colours apart: painted shading on an
  // orange-brown skin moves further in it than on pale skin. The tolerance
  // grows with the reference's own distance from neutral (pale and typical
  // anime skin stay at the base tolerance).
  const referenceChroma = Math.hypot(skinReference[0] - 1 / 3, skinReference[1] - 1 / 3);
  const tolerance = skinTolerance * Math.max(1, referenceChroma / SATURATED_REFERENCE_CHROMA);

  // Face frame from the visible face itself — front-facing, skin-toned head
  // texels — rather than the whole head box, which hair (a tall quiff, long
  // side hair) inflates and shifts. Its height is capped relative to its width
  // so the scalp of a bald head is not all face.
  const faceFrame = measureFaceFrame(meshes, headnessAt, (entry, i) => {
    colorSignature(sampleColor(entry.mesh, i, texel), signature);
    return signatureDistance(signature, skinReference) <= tolerance && skinSideAt(texel) >= 0.5;
  }, center, radiusX);
  // The upper half fades out over the forehead rather than at a hard edge:
  // face shading follows the face map (light azimuth only) and the scalp
  // follows N·L, and on a bald head a sharp oval top would show where the two
  // terminators disagree. Hair normally covers this band.
  const ovalAt = (px, py) => (faceFrame
    ? 1 - (py > faceFrame.y
      ? smoothstep(0.55, 1.1, Math.hypot((px - faceFrame.x) / faceFrame.rx, (py - faceFrame.y) / faceFrame.ry))
      : smoothstep(0.92, 1.05, Math.hypot((px - faceFrame.x) / faceFrame.rx, (py - faceFrame.y) / faceFrame.ry)))
    : 1 - smoothstep(0.85, 1.0, Math.hypot((px - center.x) / radiusX / 0.72, ((py - center.y) / radiusY + 0.2) / 0.95)));
  // Below the brow everything in the face zone is face (eyes, brows, mouth);
  // above it only skin-toned texels, so bangs over the forehead stay hair.
  const lowerFaceAt = (py) => (faceFrame
    ? 1 - smoothstep(0.45, 0.75, (py - faceFrame.y) / faceFrame.ry)
    : 1 - smoothstep(0.08, 0.22, (py - center.y) / radiusY));

  // Classification of one surface point (root space) — shared by the
  // per-vertex weights and the per-texel mask.
  const roles = [0, 0, 0];
  const classify = (px, py, pz, facing, headness, rgba) => {
    colorSignature(rgba, signature);
    const skinLike = (1 - smoothstep(tolerance * 0.6, tolerance, signatureDistance(signature, skinReference))) * skinSideAt(rgba);
    const z = pz - center.z;
    // On the front of the face either by normal or by position: recessed eye
    // sockets, nose sides and lips face sideways, but sit well in front of the
    // head's centre — the sides and back of the head do not.
    const front = Math.max(smoothstep(0.05, 0.35, facing), smoothstep(0.35, 0.6, z / radiusX));
    const frontZone = headness * ovalAt(px, py) * front * (z > -0.1 * radiusX ? 1 : 0);
    const face = frontZone * Math.max(lowerFaceAt(py), skinLike);
    // The weights partition the surface: the shader blends each role's full
    // parameters by its weight and gives the material's own role the
    // remainder (characterMaterial.js createBlend). Skin is the skin-coloured
    // share that is not face, so a skin-coloured cheek is fully face plus skin
    // with no cloth remainder, and a face texel is not also counted as skin
    // (that summed the skin and face terminators, tones and outline widths,
    // washing faces out).
    roles[0] = (1 - face) * skinLike;
    roles[1] = face;
    roles[2] = headness * (1 - face) * (1 - skinLike);
    return roles;
  };

  // Weights.
  let faceVertices = 0;
  let hairVertices = 0;
  let skinVertices = 0;
  for (const entry of meshes) {
    const count = entry.points.length / 3;
    const weights = new Uint8Array(count * 4);
    let meshHasHair = false;
    for (let i = 0; i < count; i += 1) {
      const [skin, face, hair] = classify(
        entry.points[i * 3],
        entry.points[i * 3 + 1],
        entry.points[i * 3 + 2],
        entry.normals[i * 3 + 2],
        headnessAt(entry, i),
        sampleColor(entry.mesh, i, texel),
      );

      weights[i * 4] = Math.round(skin * 255);
      weights[i * 4 + 1] = Math.round(face * 255);
      weights[i * 4 + 2] = Math.round(hair * 255);
      weights[i * 4 + 3] = 255;
      if (face > 0.5) faceVertices += 1;
      if (hair > 0.5) {
        hairVertices += 1;
        meshHasHair = true;
      }
      if (skin > 0.5) skinVertices += 1;
    }
    entry.mesh.geometry.setAttribute(AUTO_ROLE_ATTRIBUTE, new THREE.BufferAttribute(weights, 4, true));
    entry.mesh.geometry.userData.toonRoleWeightsHasHair = meshHasHair;
  }

  let maskedMeshes = 0;
  if (headCount < TEXEL_MASK_MAX_HEAD_VERTICES) {
    for (const entry of meshes) {
      const mask = bakeTexelRoleMask(entry, headnessAt, classify);
      if (!mask) continue;
      entry.mesh.geometry.userData.toonAutoRoleMask = mask;
      maskedMeshes += 1;
    }
  }

  // Estimated head frame (root space) for face lighting when no head bone
  // exists; the render passes attach to it like a bone.
  root.userData.toonHeadEstimate = {
    center: center.clone().applyMatrix4(characterFrameToRoot(root)).toArray(),
    forward: characterForward(root).toArray(),
    up: UP.toArray(),
  };

  return {
    applied: true,
    counts: { face: faceVertices, hair: hairVertices, skin: skinVertices },
    headVertexCount: headCount,
    meshes: meshes.length,
    faceFrame,
    forwardInferred,
    head: { center: center.toArray(), radiusX, radiusY },
    maskedMeshes,
    method: rigged ? 'skin-weights' : 'silhouette',
    referenceSkinFraction: bandSkin.length / sampled,
    skinReference,
    skinSplit: skinSplit ? { boundary: skinSplit.boundary, groups: skinSplit.groups, hair: skinSplit.hair } : null,
    skinTolerance: tolerance,
  };
}
