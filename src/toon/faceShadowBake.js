import * as THREE from 'three';

import { writeBakedFaceUv } from './bakeAttribute.js';
import { characterFrameInverse } from './headBone.js';
import { rasterizeTriangle as rasterize, readTexturePixels, sampleTexturePixel } from './texturePixels.js';

// Automatic face shadow map ("SDF" face map) for faces that ship without one.
//
// Anime faces are not lit by their normals: an artist-authored threshold map
// decides where the shadow falls as the light swings round the head, giving a
// clean terminator and a nose shadow instead of N·L noise. This bakes such a
// map from the face's own geometry:
//
//   1. Every face vertex gets a planar coordinate (the `toonBake` attribute's
//      xy, see bakeAttribute.js) — a front
//      projection in the character's frame, symmetric about the face centre
//      line. Real face UVs are often mirrored or atlased; this space never is,
//      so the shader can mirror the map for light from the other side.
//   2. The face is rasterised into that space (front-most surface per texel).
//   3. The light sweeps from the front, round the character's right, to the
//      back. A texel is lit while a sphere-dominant normal faces the light and
//      the nose does not block it. Anime face maps are deliberately simple —
//      one smooth terminator and a nose shadow — so the face's own normals
//      contribute little, and only the nose casts (brows and cheeks casting
//      into the eye sockets would ring the eyes in shadow).
//   4. Each texel stores the threshold at which it first falls into shadow,
//      (1 − cos θ) / 2 — the value the shader compares against — so the
//      shadow sweeps monotonically. The result is smoothed and edge-extended.
//
// Root space is the character's bind-pose frame: +Z forward, +Y up, so the
// character's right is −X (the same frame the head tracker calibrates to).


const RIGHT = new THREE.Vector3(-1, 0, 0);
const UP = new THREE.Vector3(0, 1, 0);
const FORWARD = new THREE.Vector3(0, 0, 1);

export const DEFAULT_FACE_SHADOW_BAKE = Object.freeze({
  angles: 48,
  // Cast shadows (nose, brow) use a key light raised this far above the
  // horizon so the nose shadow falls down the cheek; the terminator itself
  // uses the horizontal light, as the shader ignores elevation.
  castElevation: 25,
  depthSize: 192,
  // Nose casters: face geometry within this fraction of the face half-width
  // of the nose tip.
  noseRadius: 0.32,
  // Share of the head-sphere normal in the terminator normal; the rest is the
  // face's own normal (a hint of cheek and jaw shape).
  sphereBlend: 0.9,
  size: 256,
  smoothRadius: 2,
});

function toArray(material) {
  return Array.isArray(material) ? material : [material];
}


// Root-space positions/normals of every mesh carrying a face material — or,
// for faces found by automatic roles, per-vertex face weights — and the
// indices of its face triangles.
const ROLE_WEIGHTS_ATTRIBUTE = 'toonRoleWeights';

function collectFaceSurfaces(root, isFaceMaterial, isWeightEligible) {
  // Character frame (facing +Z): a VRM 0.x root is turned 180° by its importer.
  const rootInverse = characterFrameInverse(root);
  const surfaces = [];
  root.traverse((mesh) => {
    if (!mesh.isMesh || mesh.userData?.isToonOutline || !mesh.geometry?.attributes?.position) return;
    const materials = toArray(mesh.material);
    const faceSlots = materials.map((mat) => Boolean(mat && isFaceMaterial(mat)));
    const weights = mesh.geometry.attributes[ROLE_WEIGHTS_ATTRIBUTE];
    const weightSlots = materials.map((mat, slot) => Boolean(weights && mat && !faceSlots[slot] && isWeightEligible(mat)));
    if (!faceSlots.some(Boolean) && !weightSlots.some(Boolean)) return;
    const geometry = mesh.geometry;
    const position = geometry.attributes.position;
    const normal = geometry.attributes.normal;
    if (!normal) return;
    const toRoot = new THREE.Matrix4().multiplyMatrices(rootInverse, mesh.matrixWorld);
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(toRoot);
    const points = new Float32Array(position.count * 3);
    const normals = new Float32Array(position.count * 3);
    const p = new THREE.Vector3();
    for (let i = 0; i < position.count; i += 1) {
      p.fromBufferAttribute(position, i).applyMatrix4(toRoot);
      points.set([p.x, p.y, p.z], i * 3);
      p.fromBufferAttribute(normal, i).applyMatrix3(normalMatrix).normalize();
      normals.set([p.x, p.y, p.z], i * 3);
    }
    const index = geometry.index;
    const triangleCount = index ? index.count / 3 : position.count / 3;
    const vertexAt = (k) => (index ? index.getX(k) : k);
    const triangles = [];
    const triangleMaterials = [];
    const groups = geometry.groups.length && materials.length > 1
      ? geometry.groups
      : [{ count: triangleCount * 3, materialIndex: 0, start: 0 }];
    // A per-texel automatic role mask (low-poly heads) decides at the
    // triangle's UV centroid; otherwise all three vertices must be face.
    const roleMask = geometry.userData?.toonAutoRoleMask;
    const uv = geometry.attributes.uv;
    const maskFace = (a, b, c) => {
      const { data, width, height } = roleMask.image;
      const u = (uv.getX(a) + uv.getX(b) + uv.getX(c)) / 3;
      const v = (uv.getY(a) + uv.getY(b) + uv.getY(c)) / 3;
      const x = Math.min(width - 1, Math.max(0, Math.floor(u * width)));
      const y = Math.min(height - 1, Math.max(0, Math.floor(v * height)));
      return data[(y * width + x) * 4 + 1] > 127;
    };
    const isWeightedFace = (v) => weights.getY(v) > 0.5;
    const isFaceTriangle = (a, b, c) => (roleMask && uv
      ? maskFace(a, b, c)
      : isWeightedFace(a) && isWeightedFace(b) && isWeightedFace(c));
    for (const group of groups) {
      const slot = group.materialIndex ?? 0;
      if (!faceSlots[slot] && !weightSlots[slot]) continue;
      const end = Math.min(group.start + group.count, triangleCount * 3);
      for (let k = group.start; k + 2 < end; k += 3) {
        const a = vertexAt(k);
        const b = vertexAt(k + 1);
        const c = vertexAt(k + 2);
        if (!faceSlots[slot] && !isFaceTriangle(a, b, c)) continue;
        triangles.push(a, b, c);
        triangleMaterials.push(materials[slot]);
      }
    }
    if (triangles.length) surfaces.push({ geometry, mesh, normals, points, triangleMaterials, triangles });
  });
  return surfaces;
}

// Planar frame: a square window over the front of the face, centred on it.
function measureFaceFrame(surfaces) {
  const box = new THREE.Box3();
  let zSum = 0;
  let count = 0;
  for (const { normals, points, triangles } of surfaces) {
    for (const v of triangles) {
      if (normals[v * 3 + 2] < 0.3) continue;
      box.expandByPoint(new THREE.Vector3(points[v * 3], points[v * 3 + 1], points[v * 3 + 2]));
      zSum += points[v * 3 + 2];
      count += 1;
    }
  }
  if (count < 16 || box.isEmpty()) return null;
  const halfWidth = (box.max.x - box.min.x) / 2;
  const halfHeight = (box.max.y - box.min.y) / 2;
  if (!(halfWidth > 0) || !(halfHeight > 0)) return null;
  const extent = Math.max(halfWidth, halfHeight) * 1.1;
  const center = new THREE.Vector3((box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, zSum / count);
  // Head sphere behind the face: its normals give the smooth terminator sweep.
  const sphereCenter = center.clone().addScaledVector(FORWARD, -halfWidth);
  return { center, extent, halfWidth, sphereCenter };
}

function planarUv(frame, x, y, target) {
  // u grows toward the character's right (−X), matching the shader's
  // right = cross(forward, up).
  target[0] = 0.5 + ((x - frame.center.x) * RIGHT.x) / (2 * frame.extent);
  target[1] = 0.5 + (y - frame.center.y) / (2 * frame.extent);
  return target;
}

function writeFaceUvs(surfaces, frame) {
  const uv = [0, 0];
  for (const { geometry, points } of surfaces) {
    const count = points.length / 3;
    const data = new Float32Array(count * 2);
    for (let i = 0; i < count; i += 1) {
      planarUv(frame, points[i * 3], points[i * 3 + 1], uv);
      data[i * 2] = uv[0];
      data[i * 2 + 1] = uv[1];
    }
    writeBakedFaceUv(geometry, data);
  }
}

// Front-most face surface per texel of the planar map.
function rasterizeFace(surfaces, frame, size) {
  const valid = new Uint8Array(size * size);
  const depth = new Float32Array(size * size).fill(-Infinity);
  const position = new Float32Array(size * size * 3);
  const normal = new Float32Array(size * size * 3);
  const uv = [0, 0];
  for (const { normals, points, triangles } of surfaces) {
    for (let t = 0; t < triangles.length; t += 3) {
      const a = triangles[t];
      const b = triangles[t + 1];
      const c = triangles[t + 2];
      const pa = planarUv(frame, points[a * 3], points[a * 3 + 1], [0, 0]);
      const pb = planarUv(frame, points[b * 3], points[b * 3 + 1], [0, 0]);
      const pc = planarUv(frame, points[c * 3], points[c * 3 + 1], uv);
      rasterize(pa[0] * size, pa[1] * size, pb[0] * size, pb[1] * size, pc[0] * size, pc[1] * size, size, size, (x, y, w0, w1, w2) => {
        const z = points[a * 3 + 2] * w0 + points[b * 3 + 2] * w1 + points[c * 3 + 2] * w2;
        const texel = y * size + x;
        if (z <= depth[texel]) return;
        depth[texel] = z;
        valid[texel] = 1;
        for (let k = 0; k < 3; k += 1) {
          position[texel * 3 + k] = points[a * 3 + k] * w0 + points[b * 3 + k] * w1 + points[c * 3 + k] * w2;
          normal[texel * 3 + k] = normals[a * 3 + k] * w0 + normals[b * 3 + k] * w1 + normals[c * 3 + k] * w2;
        }
      });
    }
  }
  return { normal, position, valid };
}

// The nose tip: the front-most face point near the centre line, below the
// middle of the face, that clearly stands out from the face around it (the
// front pole of a smooth head is not a nose). Null when there is none.
const NOSE_RING = [0.25, 0.4];
const NOSE_MIN_PROTRUSION = 0.08;

function findNoseTip(surfaces, frame) {
  let best = null;
  let bestZ = -Infinity;
  for (const { points, triangles } of surfaces) {
    for (const v of triangles) {
      const x = points[v * 3];
      const y = points[v * 3 + 1];
      const z = points[v * 3 + 2];
      if (Math.abs(x - frame.center.x) > frame.halfWidth * 0.15) continue;
      if (y > frame.center.y + frame.halfWidth * 0.2 || y < frame.center.y - frame.halfWidth * 0.9) continue;
      if (z > bestZ) {
        bestZ = z;
        best = new THREE.Vector3(x, y, z);
      }
    }
  }
  if (!best) return null;
  // Surface depth on a ring around the candidate, in the face plane.
  let ringZ = 0;
  let ringCount = 0;
  for (const { points, triangles } of surfaces) {
    for (const v of triangles) {
      const d = Math.hypot(points[v * 3] - best.x, points[v * 3 + 1] - best.y) / frame.halfWidth;
      if (d < NOSE_RING[0] || d > NOSE_RING[1] || points[v * 3 + 2] < best.z - frame.halfWidth) continue;
      ringZ += points[v * 3 + 2];
      ringCount += 1;
    }
  }
  if (!ringCount) return null;
  return best.z - ringZ / ringCount > frame.halfWidth * NOSE_MIN_PROTRUSION ? best : null;
}

function noseSurfaces(surfaces, noseTip, radius) {
  const result = [];
  for (const surface of surfaces) {
    const { points, triangles } = surface;
    const kept = [];
    for (let t = 0; t < triangles.length; t += 3) {
      const a = triangles[t] * 3;
      const b = triangles[t + 1] * 3;
      const c = triangles[t + 2] * 3;
      const x = (points[a] + points[b] + points[c]) / 3;
      const y = (points[a + 1] + points[b + 1] + points[c + 1]) / 3;
      const z = (points[a + 2] + points[b + 2] + points[c + 2]) / 3;
      if (Math.hypot(x - noseTip.x, y - noseTip.y, z - noseTip.z) <= radius) kept.push(triangles[t], triangles[t + 1], triangles[t + 2]);
    }
    if (kept.length) result.push({ ...surface, triangles: kept });
  }
  return result;
}

// Orthographic depth of the face seen from the light (larger = nearer it).
function lightDepthMap(surfaces, light, depthSize) {
  const axisA = new THREE.Vector3().crossVectors(UP, light);
  if (axisA.lengthSq() < 1e-8) axisA.copy(RIGHT);
  axisA.normalize();
  const axisB = new THREE.Vector3().crossVectors(light, axisA).normalize();
  let minA = Infinity;
  let maxA = -Infinity;
  let minB = Infinity;
  let maxB = -Infinity;
  for (const { points, triangles } of surfaces) {
    for (const v of triangles) {
      const s = points[v * 3] * axisA.x + points[v * 3 + 1] * axisA.y + points[v * 3 + 2] * axisA.z;
      const t = points[v * 3] * axisB.x + points[v * 3 + 1] * axisB.y + points[v * 3 + 2] * axisB.z;
      minA = Math.min(minA, s);
      maxA = Math.max(maxA, s);
      minB = Math.min(minB, t);
      maxB = Math.max(maxB, t);
    }
  }
  const span = Math.max(maxA - minA, maxB - minB) * 1.02 || 1;
  const project = (x, y, z, out) => {
    out[0] = ((x * axisA.x + y * axisA.y + z * axisA.z) - minA) / span * depthSize;
    out[1] = ((x * axisB.x + y * axisB.y + z * axisB.z) - minB) / span * depthSize;
    out[2] = x * light.x + y * light.y + z * light.z;
    return out;
  };
  const depth = new Float32Array(depthSize * depthSize).fill(-Infinity);
  const pa = [0, 0, 0];
  const pb = [0, 0, 0];
  const pc = [0, 0, 0];
  for (const { points, triangles } of surfaces) {
    for (let t = 0; t < triangles.length; t += 3) {
      const a = triangles[t] * 3;
      const b = triangles[t + 1] * 3;
      const c = triangles[t + 2] * 3;
      project(points[a], points[a + 1], points[a + 2], pa);
      project(points[b], points[b + 1], points[b + 2], pb);
      project(points[c], points[c + 1], points[c + 2], pc);
      rasterize(pa[0], pa[1], pb[0], pb[1], pc[0], pc[1], depthSize, depthSize, (x, y, w0, w1, w2) => {
        const d = pa[2] * w0 + pb[2] * w1 + pc[2] * w2;
        const i = y * depthSize + x;
        if (d > depth[i]) depth[i] = d;
      });
    }
  }
  return { depth, project };
}

// Normalised box blur over valid texels, then edge extension into the rest so
// bilinear sampling near the face border never reads background.
function smoothAndExtend(values, valid, size, radius) {
  let current = values;
  for (let pass = 0; pass < 2; pass += 1) {
    const horizontal = new Float32Array(size * size);
    const weightH = new Float32Array(size * size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        let sum = 0;
        let weight = 0;
        for (let k = -radius; k <= radius; k += 1) {
          const xx = x + k;
          if (xx < 0 || xx >= size || !valid[y * size + xx]) continue;
          sum += current[y * size + xx];
          weight += 1;
        }
        horizontal[y * size + x] = sum;
        weightH[y * size + x] = weight;
      }
    }
    const next = new Float32Array(size * size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        if (!valid[y * size + x]) continue;
        let sum = 0;
        let weight = 0;
        for (let k = -radius; k <= radius; k += 1) {
          const yy = y + k;
          if (yy < 0 || yy >= size) continue;
          sum += horizontal[yy * size + x];
          weight += weightH[yy * size + x];
        }
        next[y * size + x] = weight ? sum / weight : current[y * size + x];
      }
    }
    current = next;
  }
  const filled = Uint8Array.from(valid);
  for (let pass = 0; pass < 16; pass += 1) {
    const grow = [];
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const i = y * size + x;
        if (filled[i]) continue;
        let sum = 0;
        let weight = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= size || yy >= size || !filled[yy * size + xx]) continue;
          sum += current[yy * size + xx];
          weight += 1;
        }
        if (weight) grow.push([i, sum / weight]);
      }
    }
    if (!grow.length) break;
    for (const [i, value] of grow) {
      current[i] = value;
      filled[i] = 1;
    }
  }
  return current;
}

/**
 * Bakes a face shadow threshold map for the face materials under `root` and
 * writes the planar face coordinates onto their geometries (bakeAttribute.js).
 * Returns null when no usable face surface is found.
 */
// Nose mark: the small leaf-shaped shadow anime faces paint beside the nose
// (the shader puts it on the side away from the light). Centred just below
// the tip in the planar face coordinates; size is [leaf width, half height]
// as fractions of the face half-width, matched to Genshin's Ganyu close-up
// (7 × 11 px there, rendered 6.8 × 11.3). `drawn` is true when the
// face texture already draws something there — a nose line or shadow — so
// the shader does not add a second one.
const NOSE_MARK_SIZE = [0.075, 0.065];
const NOSE_MARK_DROP = 0.03;
const NOSE_REGION = 0.12;
const NOSE_SURROUND = [0.2, 0.35];
// A drawn nose is often a thin line: the darkest 1% of the texels around the
// tip decides (VRoid's faint nose line sits at ~0.5 of the skin around it; an
// undrawn nose stays above ~0.9).
const NOSE_DRAWN_PERCENTILE = 0.01;
const NOSE_DRAWN_RATIO = 0.8;
const NOSE_SAMPLES_PER_TRIANGLE = 12;

function textureLumaSamples(surfaces, frame, noseTip, [inner, outer]) {
  const values = [];
  const texel = [0, 0, 0, 255];
  for (const { geometry, points, triangleMaterials, triangles } of surfaces) {
    const uv = geometry.attributes.uv;
    if (!uv) continue;
    for (let t = 0; t < triangles.length; t += 3) {
      const material = triangleMaterials[t / 3];
      const texture = material?.map?.isTexture ? material.map : null;
      const pixels = texture ? readTexturePixels(texture, { maxSize: 1024 }) : null;
      if (!pixels) continue;
      const [a, b, c] = [triangles[t], triangles[t + 1], triangles[t + 2]];
      const cx = (points[a * 3] + points[b * 3] + points[c * 3]) / 3;
      const cy = (points[a * 3 + 1] + points[b * 3 + 1] + points[c * 3 + 1]) / 3;
      const d = Math.hypot(cx - noseTip.x, cy - noseTip.y) / frame.halfWidth;
      if (d < inner || d > outer) continue;
      if (texture.matrixAutoUpdate) texture.updateMatrix();
      for (let k = 0; k < NOSE_SAMPLES_PER_TRIANGLE; k += 1) {
        // Deterministic spread over the triangle.
        let w0 = ((k * 0.618034) % 1);
        let w1 = ((k * 0.414214 + 0.3) % 1);
        if (w0 + w1 > 1) {
          w0 = 1 - w0;
          w1 = 1 - w1;
        }
        const w2 = 1 - w0 - w1;
        const u = uv.getX(a) * w0 + uv.getX(b) * w1 + uv.getX(c) * w2;
        const v = uv.getY(a) * w0 + uv.getY(b) * w1 + uv.getY(c) * w2;
        sampleTexturePixel(pixels, texture, u, v, texel);
        values.push(0.2126 * texel[0] + 0.7152 * texel[1] + 0.0722 * texel[2]);
      }
    }
  }
  return values.sort((x, y) => x - y);
}

function measureNoseMark(surfaces, frame, noseTip) {
  if (!noseTip) return null;
  const center = planarUv(frame, noseTip.x, noseTip.y - frame.halfWidth * NOSE_MARK_DROP, [0, 0]);
  const toUv = frame.halfWidth / (2 * frame.extent);
  const region = textureLumaSamples(surfaces, frame, noseTip, [0, NOSE_REGION]);
  const surround = textureLumaSamples(surfaces, frame, noseTip, NOSE_SURROUND);
  const drawn = region.length > 8 && surround.length > 8 &&
    region[Math.floor(region.length * NOSE_DRAWN_PERCENTILE)] < surround[Math.floor(surround.length / 2)] * NOSE_DRAWN_RATIO;
  return {
    center,
    drawn,
    evidence: {
      regionDarkest: region.length ? region[0] : null,
      regionDark: region.length ? region[Math.floor(region.length * NOSE_DRAWN_PERCENTILE)] : null,
      samples: [region.length, surround.length],
      surroundMedian: surround.length ? surround[Math.floor(surround.length / 2)] : null,
    },
    size: [NOSE_MARK_SIZE[0] * toUv, NOSE_MARK_SIZE[1] * toUv],
  };
}

export function bakeFaceShadowMap(root, { isFaceMaterial, isWeightEligible, ...options } = {}) {
  const config = { ...DEFAULT_FACE_SHADOW_BAKE, ...options };
  const surfaces = collectFaceSurfaces(root, isFaceMaterial ?? (() => false), isWeightEligible ?? (() => true));
  if (!surfaces.length) return null;
  const frame = measureFaceFrame(surfaces);
  if (!frame) return null;
  writeFaceUvs(surfaces, frame);

  const { size } = config;
  const face = rasterizeFace(surfaces, frame, size);
  let covered = 0;
  for (let i = 0; i < face.valid.length; i += 1) covered += face.valid[i];
  if (covered < 64) return null;

  const threshold = new Float32Array(size * size).fill(1);
  const sphereNormal = new THREE.Vector3();
  const faceNormal = new THREE.Vector3();
  const terminatorNormal = new THREE.Vector3();
  const horizontal = new THREE.Vector3();
  const cast = new THREE.Vector3();
  const projected = [0, 0, 0];
  const elevation = THREE.MathUtils.degToRad(config.castElevation);
  const bias = frame.halfWidth * 0.02;
  const noseTip = findNoseTip(surfaces, frame);
  const casters = noseTip ? noseSurfaces(surfaces, noseTip, frame.halfWidth * config.noseRadius) : [];
  const noseMark = measureNoseMark(surfaces, frame, noseTip);
  for (const { geometry } of surfaces) geometry.userData.toonNoseMark = noseMark;
  for (let k = 1; k < config.angles; k += 1) {
    const theta = (k / (config.angles - 1)) * Math.PI;
    const cut = (1 - Math.cos(theta)) / 2;
    horizontal.copy(RIGHT).multiplyScalar(Math.sin(theta)).addScaledVector(FORWARD, Math.cos(theta)).normalize();
    cast.copy(horizontal).multiplyScalar(Math.cos(elevation)).addScaledVector(UP, Math.sin(elevation)).normalize();
    const lightDepth = casters.length ? lightDepthMap(casters, cast, config.depthSize) : null;
    for (let texel = 0; texel < size * size; texel += 1) {
      if (!face.valid[texel] || threshold[texel] < cut) continue;
      const px = face.position[texel * 3];
      const py = face.position[texel * 3 + 1];
      const pz = face.position[texel * 3 + 2];
      sphereNormal.set(px, py, pz).sub(frame.sphereCenter).normalize();
      faceNormal.fromArray(face.normal, texel * 3).normalize();
      terminatorNormal.copy(sphereNormal).multiplyScalar(config.sphereBlend)
        .addScaledVector(faceNormal, 1 - config.sphereBlend).normalize();
      let lit = terminatorNormal.dot(horizontal) > 0;
      if (lit && lightDepth) {
        lightDepth.project(px, py, pz, projected);
        const x = Math.floor(projected[0]);
        const y = Math.floor(projected[1]);
        // Outside the nose's footprint seen from the light nothing can occlude.
        if (x >= 0 && y >= 0 && x < config.depthSize && y < config.depthSize) {
          const slope = 1 - Math.max(0, faceNormal.dot(cast));
          const occluder = lightDepth.depth[y * config.depthSize + x];
          lit = !Number.isFinite(occluder) || projected[2] >= occluder - bias * (1 + 3 * slope);
        }
      }
      if (!lit) threshold[texel] = cut;
    }
  }

  const smoothed = smoothAndExtend(threshold, face.valid, size, config.smoothRadius);
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i += 1) {
    const value = Math.round(THREE.MathUtils.clamp(smoothed[i], 0, 1) * 255);
    data[i * 4] = value;
    data[i * 4 + 1] = value;
    data[i * 4 + 2] = value;
    data[i * 4 + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.NoColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.name = 'toonAutoFaceShadowMap';
  texture.needsUpdate = true;

  return {
    coveredTexels: covered,
    noseMark,
    noseTip: noseTip?.toArray() ?? null,
    frame: { center: frame.center.toArray(), extent: frame.extent },
    meshes: surfaces.map(({ mesh }) => mesh),
    texture,
  };
}
