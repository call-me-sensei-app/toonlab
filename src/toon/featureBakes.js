import * as THREE from 'three';

import { writeBakedDetail } from './bakeAttribute.js';
import { characterFrameInverse } from './headBone.js';
import { isSkinLikeColor } from './skinEvidence.js';
import { readTexturePixels, sampleTexturePixel } from './texturePixels.js';

// Conversion-time bakes for character details an anime game paints into its
// per-character lighting maps, derived here from the model itself so any
// character gets them:
//
// - Eye-white lid shade: each vertex of an eye white records how far below the
//   top edge of its eye opening it sits (0 at the upper lid, 1 at the lower),
//   and the shader shades a band under the lid. Skipped when the eye-white
//   texture already paints that shade.
// - Sheer fabric: dark cloth that is the leg's own surface down most of the
//   shin — stockings, tights — records a per-vertex weight, and the shader
//   draws the narrow highlight streak such fabric shows along the leg. The
//   cloth must fit tight around the shin bone (trousers, suits and skirts
//   stand off it) and cover most of the shin's length (shorts, capris and
//   shoe collars do not); materials named as trousers or footwear are left
//   alone.
//
// Both write the w channel of the shared bake attribute (bakeAttribute.js);
// the material decides which meaning it reads.

function toArray(material) {
  return Array.isArray(material) ? material : [material];
}

// Vertices used by each material slot of a mesh.
function slotVertices(geometry, materials) {
  const index = geometry.index;
  const count = index ? index.count : geometry.attributes.position.count;
  const vertexAt = (k) => (index ? index.getX(k) : k);
  const groups = geometry.groups.length && materials.length > 1
    ? geometry.groups
    : [{ count, materialIndex: 0, start: 0 }];
  const slots = materials.map(() => new Set());
  for (const group of groups) {
    const slot = group.materialIndex ?? 0;
    if (!slots[slot]) continue;
    const end = Math.min(group.start + group.count, count);
    for (let k = group.start; k < end; k += 1) slots[slot].add(vertexAt(k));
  }
  return slots;
}

function sRGBColorOf(material) {
  const color = material?.color?.isColor ? material.color.clone().convertLinearToSRGB() : new THREE.Color(1, 1, 1);
  return [color.r, color.g, color.b];
}

// Visible colour of a vertex (sRGB, 0–1): base texture at its UV × material
// colour; target[3] is the texel's alpha. VRoid cuts shorts and sleeves out
// of full-length template meshes with texture alpha, so callers skip
// transparent texels.
function createColorSampler(material, geometry) {
  const factor = sRGBColorOf(material);
  const texture = material?.map?.isTexture ? material.map : null;
  const pixels = texture ? readTexturePixels(texture, { maxSize: 1024 }) : null;
  const uv = geometry.attributes.uv;
  if (texture?.matrixAutoUpdate) texture.updateMatrix();
  const texel = [0, 0, 0, 255];
  return (vertex, target) => {
    if (pixels && uv) {
      sampleTexturePixel(pixels, texture, uv.getX(vertex), uv.getY(vertex), texel);
      for (let k = 0; k < 3; k += 1) target[k] = (texel[k] / 255) * factor[k];
      target[3] = texel[3] / 255;
    } else {
      for (let k = 0; k < 3; k += 1) target[k] = factor[k];
      target[3] = 1;
    }
    return target;
  };
}

const luma = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

function characterPositions(mesh, root) {
  const toFrame = new THREE.Matrix4().multiplyMatrices(characterFrameInverse(root), mesh.matrixWorld);
  const position = mesh.geometry.attributes.position;
  const points = new Float32Array(position.count * 3);
  const p = new THREE.Vector3();
  for (let i = 0; i < position.count; i += 1) {
    p.fromBufferAttribute(position, i).applyMatrix4(toFrame);
    points[i * 3] = p.x;
    points[i * 3 + 1] = p.y;
    points[i * 3 + 2] = p.z;
  }
  return points;
}

// ---------------------------------------------------------------------------
// Eye-white lid shade

const LID_BINS = 10;
// The eye-white texture already paints a lid shade when its top band is this
// much darker than its lower half.
const PAINTED_LID_RATIO = 0.88;

// One eye or two: split at the widest gap in x when it is a real gap.
function splitEyes(vertices, points) {
  const sorted = [...vertices].sort((a, b) => points[a * 3] - points[b * 3]);
  const xs = sorted.map((v) => points[v * 3]);
  const span = xs[xs.length - 1] - xs[0];
  let gap = 0;
  let at = -1;
  for (let i = 1; i < xs.length; i += 1) {
    if (xs[i] - xs[i - 1] > gap) {
      gap = xs[i] - xs[i - 1];
      at = i;
    }
  }
  return span > 0 && gap > span * 0.2 ? [sorted.slice(0, at), sorted.slice(at)] : [sorted];
}

// Top and bottom edge of one eye's white as functions of x (binned, gaps filled).
function lidEdges(eye, points) {
  let minX = Infinity;
  let maxX = -Infinity;
  for (const v of eye) {
    minX = Math.min(minX, points[v * 3]);
    maxX = Math.max(maxX, points[v * 3]);
  }
  const width = Math.max(maxX - minX, 1e-6);
  const top = new Array(LID_BINS).fill(-Infinity);
  const bottom = new Array(LID_BINS).fill(Infinity);
  const binOf = (x) => Math.min(LID_BINS - 1, Math.max(0, Math.floor(((x - minX) / width) * LID_BINS)));
  for (const v of eye) {
    const bin = binOf(points[v * 3]);
    top[bin] = Math.max(top[bin], points[v * 3 + 1]);
    bottom[bin] = Math.min(bottom[bin], points[v * 3 + 1]);
  }
  for (let i = 0; i < LID_BINS; i += 1) {
    if (Number.isFinite(top[i])) continue;
    let near = -1;
    for (let d = 1; d < LID_BINS && near < 0; d += 1) {
      if (i - d >= 0 && Number.isFinite(top[i - d])) near = i - d;
      else if (i + d < LID_BINS && Number.isFinite(top[i + d])) near = i + d;
    }
    if (near >= 0) {
      top[i] = top[near];
      bottom[i] = bottom[near];
    }
  }
  // Linear between bin centres.
  const at = (edges, x) => {
    const f = ((x - minX) / width) * LID_BINS - 0.5;
    const i = Math.min(LID_BINS - 1, Math.max(0, Math.floor(f)));
    const j = Math.min(LID_BINS - 1, i + 1);
    const t = THREE.MathUtils.clamp(f - i, 0, 1);
    return edges[i] + (edges[j] - edges[i]) * t;
  };
  return { bottomAt: (x) => at(bottom, x), topAt: (x) => at(top, x) };
}

/**
 * Bakes the lid coordinate onto every eye-white material's vertices.
 * @returns {{ meshes: number, eyes: number, painted: string[] } | null}
 */
export function bakeEyeWhiteLid(root, { isScleraMaterial }) {
  let meshes = 0;
  let eyes = 0;
  const painted = [];
  root.traverse((mesh) => {
    if (!mesh.isMesh || mesh.userData?.isToonOutline || !mesh.geometry?.attributes?.position) return;
    const materials = toArray(mesh.material);
    const slots = materials.map((mat) => Boolean(mat && isScleraMaterial(mat)));
    if (!slots.some(Boolean)) return;
    const geometry = mesh.geometry;
    const vertexSets = slotVertices(geometry, materials);
    const points = characterPositions(mesh, root);
    const values = new Float32Array(geometry.attributes.position.count).fill(NaN);
    let wrote = false;
    materials.forEach((mat, slot) => {
      if (!slots[slot] || vertexSets[slot].size < 6) return;
      const lid = new Float32Array(geometry.attributes.position.count).fill(NaN);
      const eyeGroups = splitEyes(vertexSets[slot], points);
      for (const eye of eyeGroups) {
        const { bottomAt, topAt } = lidEdges(eye, points);
        for (const v of eye) {
          const x = points[v * 3];
          const top = topAt(x);
          const height = Math.max(top - bottomAt(x), 1e-6);
          lid[v] = THREE.MathUtils.clamp((top - points[v * 3 + 1]) / height, 0, 1);
        }
      }
      // A texture that already shades the top of the eye white keeps its own.
      const sample = createColorSampler(mat, geometry);
      const color = [0, 0, 0, 1];
      let topLuma = 0;
      let topCount = 0;
      let lowLuma = 0;
      let lowCount = 0;
      for (const v of vertexSets[slot]) {
        const sampled = sample(v, color);
        if (sampled[3] < 0.5) continue;
        const l = luma(sampled);
        if (lid[v] < 0.25) {
          topLuma += l;
          topCount += 1;
        } else if (lid[v] > 0.55) {
          lowLuma += l;
          lowCount += 1;
        }
      }
      if (topCount && lowCount && topLuma / topCount < (lowLuma / lowCount) * PAINTED_LID_RATIO) {
        painted.push(mat.name || '(unnamed)');
        return;
      }
      for (const v of vertexSets[slot]) values[v] = lid[v];
      eyes += eyeGroups.length;
      wrote = true;
      mat.userData.toonLidShadeBaked = true;
    });
    if (!wrote) return;
    writeBakedDetail(geometry, values, 'lid');
    meshes += 1;
  });
  return meshes || painted.length ? { eyes, meshes, painted } : null;
}

// ---------------------------------------------------------------------------
// Sheer fabric

const FOOT_BONE = /foot|toe|つま先|足先|趾|ball/i;
const LOWER_LEG_BONE = /lower_?\s?leg|calf|shin|knee|ankle|ひざ|膝|足首|小腿|^(mixamorig\d*:)?(left|right)leg$/i;
const UPPER_LEG_BONE = /upper_?\s?leg|up_?leg|thigh|大腿|腿|(^|[^a-z])leg([^a-z]|$)|[左右]足[dｄDＤ]?$/i;
const TROUSERS_NAME = /pant|trouser|jean|slack|shoe|boot|sneaker|sandal|ズボン|靴|裤|褲|鞋/i;
const STOCKINGS_NAME = /stocking|tights|pantyhose|legwear|nylon|ストッキング|タイツ|ニーソ|袜|襪/i;
// Dark cloth: value (sRGB max channel) below this starts to count; fully at SHEER_DARK_FULL.
const SHEER_DARK_START = 0.45;
const SHEER_DARK_FULL = 0.3;
// Along the shin (knee → ankle), the share of its length the cloth must cover,
// and how far from the shin bone it may sit, relative to the shin's length —
// a slim anime calf is ~0.1, trousers and boots stand well off it.
const SHEER_MIN_SHIN_COVERAGE = 0.6;
const SHEER_MAX_SHIN_RADIUS = 0.2;
const SHIN_BINS = 10;

// Shin segments (knee → ankle) in world space, one per lower-leg bone that
// has a child bone to end at.
function shinSegments(skeleton, kinds) {
  const segments = new Map();
  skeleton.bones.forEach((bone, index) => {
    if (kinds[index] !== 2) return;
    const child = bone.children.find((object) => object.isBone);
    if (!child) return;
    const start = bone.getWorldPosition(new THREE.Vector3());
    const end = child.getWorldPosition(new THREE.Vector3());
    const length = start.distanceTo(end);
    if (length > 1e-5) segments.set(index, { end, length, start });
  });
  return segments;
}

function legBoneKinds(skeleton) {
  return skeleton.bones.map((bone) => {
    const name = bone.name ?? '';
    if (FOOT_BONE.test(name)) return 0;
    if (LOWER_LEG_BONE.test(name)) return 2;
    if (UPPER_LEG_BONE.test(name)) return 1;
    return 0;
  });
}

const smoothstep = (edge0, edge1, x) => {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * Bakes a sheer-fabric weight onto stockings and tights.
 * @returns {{ materials: string[] } | null}
 */
export function bakeSheerFabric(root, { isEligibleMaterial }) {
  const found = [];
  root.traverse((mesh) => {
    if (!mesh.isSkinnedMesh || mesh.userData?.isToonOutline || !mesh.skeleton) return;
    const geometry = mesh.geometry;
    const skinIndex = geometry.attributes.skinIndex;
    const skinWeight = geometry.attributes.skinWeight;
    if (!skinIndex || !skinWeight) return;
    const kinds = legBoneKinds(mesh.skeleton);
    if (!kinds.some(Boolean)) return;
    mesh.updateMatrixWorld(true);
    const shins = shinSegments(mesh.skeleton, kinds);
    const position = geometry.attributes.position;
    const world = new THREE.Vector3();
    const along = new THREE.Vector3();
    const materials = toArray(mesh.material);
    const vertexSets = slotVertices(geometry, materials);
    const values = new Float32Array(geometry.attributes.position.count).fill(NaN);
    let wrote = false;
    materials.forEach((mat, slot) => {
      if (!mat || (mat.isMToonMaterial && mat.isOutline) || !isEligibleMaterial(mat) || TROUSERS_NAME.test(mat.name ?? '')) return;
      const namedStockings = STOCKINGS_NAME.test(mat.name ?? '');
      const sample = createColorSampler(mat, geometry);
      const color = [0, 0, 0, 1];
      const weights = new Map();
      const covered = new Map();
      const radii = [];
      for (const v of vertexSets[slot]) {
        let leg = 0;
        let mainBone = -1;
        let mainWeight = 0;
        for (let k = 0; k < 4; k += 1) {
          const bone = skinIndex.getComponent(v, k);
          const weight = skinWeight.getComponent(v, k);
          if (kinds[bone]) leg += weight;
          if (weight > mainWeight) {
            mainWeight = weight;
            mainBone = bone;
          }
        }
        if (leg <= 0.05) continue;
        sample(v, color);
        if (color[3] < 0.5) continue;
        const value = Math.max(color[0], color[1], color[2]);
        if (isSkinLikeColor(color[0], color[1], color[2])) continue;
        const dark = smoothstep(SHEER_DARK_START, SHEER_DARK_FULL, value);
        if (dark <= 0) continue;
        weights.set(v, Math.min(1, leg) * dark);
        // Fit and coverage along the shin this vertex mainly follows.
        const shin = shins.get(mainBone);
        if (!shin || dark < 0.5) continue;
        world.fromBufferAttribute(position, v).applyMatrix4(mesh.matrixWorld);
        along.subVectors(shin.end, shin.start);
        const t = world.clone().sub(shin.start).dot(along) / (shin.length * shin.length);
        if (t < 0 || t > 1) continue;
        const closest = shin.start.clone().addScaledVector(along, t);
        radii.push(world.distanceTo(closest) / shin.length);
        const bins = covered.get(mainBone) ?? new Set();
        bins.add(Math.min(SHIN_BINS - 1, Math.floor(t * SHIN_BINS)));
        covered.set(mainBone, bins);
      }
      if (!weights.size) return;
      if (!namedStockings) {
        const coverage = Math.max(0, ...[...covered.values()].map((bins) => bins.size / SHIN_BINS));
        radii.sort((a, b) => a - b);
        const radius = radii.length ? radii[Math.floor(radii.length / 2)] : Infinity;
        if (coverage < SHEER_MIN_SHIN_COVERAGE || radius > SHEER_MAX_SHIN_RADIUS) return;
      }
      for (const v of vertexSets[slot]) values[v] = weights.get(v) ?? 0;
      mat.userData.toonSheerBaked = true;
      found.push(mat.name || '(unnamed)');
      wrote = true;
    });
    if (wrote) writeBakedDetail(geometry, values, 'sheer');
  });
  return found.length ? { materials: found } : null;
}
