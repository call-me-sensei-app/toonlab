// Skinned figure parts collector — the authoring primitive behind FILL-006.
//
// WHY THIS EXISTS
//   `parts.js` (CityParts) and `propgen`'s PartsBuilder both collect painted
//   primitives and merge them per material role. Neither can produce a SKINNED
//   mesh, and a crowd figure is skinned by definition: it has to deform with
//   the clip library it borrows.
//
//   This is the same collector shape with three additions that a figure needs
//   and a prop does not:
//     1. every primitive declares which bones drive it, and the collector
//        solves per-vertex skin indices/weights against the source skeleton's
//        BIND pose (segment distance, top 4, inverse-power falloff);
//     2. colour is carried as a palette index into a shared N x 1 palette
//        texture rather than as a vertex colour, because ToonLab's toon
//        material adapter reads `map` and ignores vertex colours — so one
//        material can hold a whole garment set and still be ONE draw call;
//     3. lofted cross-section primitives, because a torso, a coat, a skirt and
//        a sun hat are all "a stack of ellipses" and boxes cannot make a
//        silhouette that survives §13.
//
//   Roles are material names, and they are deliberately the tokens
//   `src/core/materialRoles.js` infers from: `Skin`, `Hair`, `Costume`. That is
//   what gives a background figure the same skin/hair/cloth material
//   separation §4 asks for at a glance.

import * as THREE from 'three/webgpu';

const UP = new THREE.Vector3(0, 1, 0);
const SIDE = new THREE.Vector3(1, 0, 0);

/** Deterministic PRNG. Same generator the city kit uses, so seeds behave alike. */
export function mulberry32(seed) {
  let state = (Math.trunc(seed) || 1) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Bone lookup key.
 *
 * D19-066. glTF node names are run through `PropertyBinding.sanitizeNodeName`
 * on import, which strips `. : / [ ]`, so the Rigify bone the file calls
 * `DEF-shin.L` arrives in the scene as `DEF-shinL` while every authoring tool,
 * every export and the analysis's own retarget tables still use the dotted
 * name. Anything that addresses bones by name — this module, a retarget map, a
 * user's attachment point — has to normalise or it silently misses. Keys are
 * compared with the separators removed so both spellings resolve.
 */
export function boneKey(name) {
  return String(name).replace(/[.:/[\]\s_-]/g, '').toLowerCase();
}

/**
 * Bind-pose view of a source skeleton.
 *
 * Everything an archetype authors is expressed in MODEL space at the bind
 * pose, so an archetype reads like a drawing ("hip band from y=0.86 to 1.02")
 * rather than like a chain of bone-local transforms. The rig resolves those
 * coordinates from the actual skeleton, so a different source humanoid with
 * different proportions still lands the garment on the body.
 */
export function createBindRig(skeleton) {
  const bones = skeleton.bones;
  const positions = new Map();
  const index = new Map();
  const parentOf = new Map();

  const matrix = new THREE.Matrix4();
  for (let i = 0; i < bones.length; i += 1) {
    matrix.copy(skeleton.boneInverses[i]).invert();
    const position = new THREE.Vector3().setFromMatrixPosition(matrix);
    positions.set(boneKey(bones[i].name), position);
    index.set(boneKey(bones[i].name), i);
  }
  for (const bone of bones) {
    if (bone.parent && index.has(boneKey(bone.parent.name))) {
      parentOf.set(boneKey(bone.name), boneKey(bone.parent.name));
    }
  }

  const childrenOf = new Map();
  for (const [child, parent] of parentOf) {
    if (!childrenOf.has(parent)) childrenOf.set(parent, []);
    childrenOf.get(parent).push(child);
  }

  // A bone's influence SEGMENT: head -> mean of its children's heads. Leaves
  // (hands, toes, head) extend along the direction they arrive from, so a hat
  // or a shoe still finds a segment rather than a point.
  const segments = new Map();
  for (const [name, head] of positions) {
    const children = childrenOf.get(name);
    let tail;
    if (children?.length) {
      tail = new THREE.Vector3();
      for (const child of children) tail.add(positions.get(child));
      tail.multiplyScalar(1 / children.length);
    } else {
      const parent = parentOf.get(name);
      const direction = parent
        ? head.clone().sub(positions.get(parent))
        : new THREE.Vector3(0, 0.1, 0);
      if (direction.lengthSq() < 1e-8) direction.set(0, 0.1, 0);
      tail = head.clone().add(direction.multiplyScalar(0.65));
    }
    segments.set(name, { head, tail });
  }

  const height = Math.max(...[...positions.values()].map((p) => p.y));

  return {
    bones,
    height,
    index,
    positions,
    segments,
    /** Bind-pose model-space position of a bone. */
    at(name) {
      const position = positions.get(boneKey(name));
      if (!position) throw new Error(`Unknown bone "${name}" on the crowd source skeleton.`);
      return position.clone();
    },
    /** Bind-pose Y of a bone — the coordinate archetypes author against most. */
    y(name) {
      return this.at(name).y;
    },
    segment(name) {
      const value = segments.get(boneKey(name));
      if (!value) throw new Error(`Unknown bone "${name}" on the crowd source skeleton.`);
      return value;
    },
    boneIndex(name) {
      const value = index.get(boneKey(name));
      if (value === undefined) throw new Error(`Unknown bone "${name}" on the crowd source skeleton.`);
      return value;
    },
  };
}

function distanceToSegment(px, py, pz, head, tail) {
  const ax = tail.x - head.x;
  const ay = tail.y - head.y;
  const az = tail.z - head.z;
  const bx = px - head.x;
  const by = py - head.y;
  const bz = pz - head.z;
  const lengthSq = ax * ax + ay * ay + az * az;
  const t = lengthSq > 1e-9
    ? Math.min(1, Math.max(0, (ax * bx + ay * by + az * bz) / lengthSq))
    : 0;
  const dx = bx - ax * t;
  const dy = by - ay * t;
  const dz = bz - az * t;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Collects painted, skinned primitives and merges them to ONE geometry per
 * material role.
 */
export class FigureParts {
  constructor({ rig, palette, falloff = 3.2 } = {}) {
    this.rig = rig;
    this.palette = palette;
    this.falloff = falloff;
    this.roles = new Map();
    this.pieceCount = 0;
  }

  /**
   * @param {string} role       material role — `Skin` | `Hair` | `Costume`
   * @param {number} colorIndex palette column
   * @param {THREE.BufferGeometry} geometry model-space, bind pose
   * @param {string|string[]} bones rigid bone name, or the candidate set to
   *        solve segment weights against
   */
  add(role, colorIndex, geometry, bones) {
    const positions = geometry.attributes.position;
    const count = positions.count;
    if (!geometry.attributes.normal) geometry.computeVertexNormals();

    const uv = new Float32Array(count * 2);
    const u = this.palette.u(colorIndex);
    for (let i = 0; i < count; i += 1) {
      uv[i * 2] = u;
      uv[i * 2 + 1] = 0.5;
    }
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));

    const skinIndex = new Uint16Array(count * 4);
    const skinWeight = new Float32Array(count * 4);

    if (typeof bones === 'string') {
      const bone = this.rig.boneIndex(bones);
      for (let i = 0; i < count; i += 1) {
        skinIndex[i * 4] = bone;
        skinWeight[i * 4] = 1;
      }
    } else {
      const candidates = bones.map((name) => ({
        index: this.rig.boneIndex(name),
        segment: this.rig.segment(name),
      }));
      const scores = new Array(candidates.length);
      for (let i = 0; i < count; i += 1) {
        const px = positions.getX(i);
        const py = positions.getY(i);
        const pz = positions.getZ(i);
        for (let c = 0; c < candidates.length; c += 1) {
          const distance = distanceToSegment(px, py, pz, candidates[c].segment.head, candidates[c].segment.tail);
          scores[c] = {
            index: candidates[c].index,
            weight: 1 / (Math.pow(distance, this.falloff) + 1e-5),
          };
        }
        scores.sort((a, b) => b.weight - a.weight);
        let total = 0;
        const take = Math.min(4, scores.length);
        for (let k = 0; k < take; k += 1) total += scores[k].weight;
        for (let k = 0; k < take; k += 1) {
          skinIndex[i * 4 + k] = scores[k].index;
          skinWeight[i * 4 + k] = scores[k].weight / total;
        }
      }
    }

    geometry.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4));
    geometry.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));

    const bucket = this.roles.get(role);
    if (bucket) bucket.push(geometry);
    else this.roles.set(role, [geometry]);
    this.pieceCount += 1;
    return this;
  }

  // -------------------------------------------------------------------------
  // Primitives
  // -------------------------------------------------------------------------

  /**
   * Vertical loft through elliptical cross-sections. The workhorse: torsos,
   * jackets, coats, skirts, dresses, hat crowns, backpacks.
   *
   * @param {{y:number, rx:number, rz:number, cx?:number, cz?:number}[]} sections
   *        bottom to top
   */
  loftY(role, colorIndex, sections, bones, {
    capBottom = true,
    capTop = true,
    radialSegments = 12,
    twist = 0,
  } = {}) {
    const rings = sections.length;
    const positions = [];
    const indices = [];

    for (let s = 0; s < rings; s += 1) {
      const { y, rx, rz, cx = 0, cz = 0 } = sections[s];
      const phase = twist * (s / Math.max(1, rings - 1));
      for (let r = 0; r < radialSegments; r += 1) {
        const angle = (r / radialSegments) * Math.PI * 2 + phase;
        positions.push(cx + Math.cos(angle) * rx, y, cz + Math.sin(angle) * rz);
      }
    }
    for (let s = 0; s < rings - 1; s += 1) {
      for (let r = 0; r < radialSegments; r += 1) {
        const a = s * radialSegments + r;
        const b = s * radialSegments + ((r + 1) % radialSegments);
        const c = a + radialSegments;
        const d = b + radialSegments;
        indices.push(a, c, b, b, c, d);
      }
    }
    if (capBottom) {
      const centre = positions.length / 3;
      const { y, cx = 0, cz = 0 } = sections[0];
      positions.push(cx, y, cz);
      for (let r = 0; r < radialSegments; r += 1) {
        indices.push(centre, (r + 1) % radialSegments, r);
      }
    }
    if (capTop) {
      const centre = positions.length / 3;
      const top = sections[rings - 1];
      positions.push(top.cx ?? 0, top.y, top.cz ?? 0);
      const base = (rings - 1) * radialSegments;
      for (let r = 0; r < radialSegments; r += 1) {
        indices.push(centre, base + r, base + ((r + 1) % radialSegments));
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return this.add(role, colorIndex, geometry, bones);
  }

  /**
   * Tapered tube between two points — limbs, straps, poles, ponytails.
   * `profile` is [t, radius] pairs from 0 (at `from`) to 1 (at `to`).
   */
  limb(role, colorIndex, from, to, profile, bones, {
    radialSegments = 8,
    flatten = 1,
    capEnds = true,
  } = {}) {
    const start = new THREE.Vector3().fromArray(from);
    const end = new THREE.Vector3().fromArray(to);
    const axis = end.clone().sub(start);
    const length = axis.length();
    if (length < 1e-6) return this;
    axis.normalize();
    const reference = Math.abs(axis.dot(UP)) > 0.94 ? SIDE : UP;
    const binormal = new THREE.Vector3().crossVectors(reference, axis).normalize();
    const normal = new THREE.Vector3().crossVectors(axis, binormal).normalize();

    const positions = [];
    const indices = [];
    for (let s = 0; s < profile.length; s += 1) {
      const [t, radius] = profile[s];
      const centre = start.clone().addScaledVector(axis, length * t);
      for (let r = 0; r < radialSegments; r += 1) {
        const angle = (r / radialSegments) * Math.PI * 2;
        const x = centre.x + binormal.x * Math.cos(angle) * radius + normal.x * Math.sin(angle) * radius * flatten;
        const y = centre.y + binormal.y * Math.cos(angle) * radius + normal.y * Math.sin(angle) * radius * flatten;
        const z = centre.z + binormal.z * Math.cos(angle) * radius + normal.z * Math.sin(angle) * radius * flatten;
        positions.push(x, y, z);
      }
    }
    for (let s = 0; s < profile.length - 1; s += 1) {
      for (let r = 0; r < radialSegments; r += 1) {
        const a = s * radialSegments + r;
        const b = s * radialSegments + ((r + 1) % radialSegments);
        indices.push(a, a + radialSegments, b, b, a + radialSegments, b + radialSegments);
      }
    }
    if (capEnds) {
      const first = positions.length / 3;
      positions.push(start.x, start.y, start.z);
      for (let r = 0; r < radialSegments; r += 1) indices.push(first, (r + 1) % radialSegments, r);
      const last = positions.length / 3;
      positions.push(end.x, end.y, end.z);
      const base = (profile.length - 1) * radialSegments;
      for (let r = 0; r < radialSegments; r += 1) indices.push(last, base + r, base + ((r + 1) % radialSegments));
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return this.add(role, colorIndex, geometry, bones);
  }

  /** Scaled sphere — heads, hair mass, shoulders, bag bodies. */
  blob(role, colorIndex, centre, radius, bones, { scale = [1, 1, 1], rotation = null, segments = 12, rings = 9 } = {}) {
    const geometry = new THREE.SphereGeometry(radius, segments, rings);
    geometry.scale(scale[0], scale[1], scale[2]);
    if (rotation) geometry.rotateX(rotation[0]).rotateY(rotation[1]).rotateZ(rotation[2]);
    geometry.translate(centre[0], centre[1], centre[2]);
    return this.add(role, colorIndex, geometry, bones);
  }

  /** Oriented box — soles, brims, straps, boards, book bags. */
  slab(role, colorIndex, size, centre, bones, { rotation = [0, 0, 0] } = {}) {
    const geometry = new THREE.BoxGeometry(size[0], size[1], size[2]);
    geometry.rotateY(rotation[1]).rotateX(rotation[0]).rotateZ(rotation[2]);
    geometry.translate(centre[0], centre[1], centre[2]);
    return this.add(role, colorIndex, geometry, bones);
  }

  /** Merged geometry per role, plus a triangle count. */
  build() {
    const result = {};
    let triangles = 0;
    for (const [role, geometries] of this.roles) {
      const merged = mergeSkinned(geometries);
      if (!merged) continue;
      result[role] = merged;
      triangles += merged.index.count / 3;
    }
    return { geometries: result, triangles };
  }
}

/**
 * Minimal merge for the exact attribute set this collector produces. The
 * package's `mergePainted` is colour-attribute shaped and drops skinning, and
 * three's BufferGeometryUtils merge is not reachable from the package surface,
 * so the merge lives here and moves with the module.
 */
function mergeSkinned(geometries) {
  if (!geometries.length) return null;
  let vertexCount = 0;
  let indexCount = 0;
  for (const geometry of geometries) {
    vertexCount += geometry.attributes.position.count;
    indexCount += geometry.index.count;
  }

  const position = new Float32Array(vertexCount * 3);
  const normal = new Float32Array(vertexCount * 3);
  const uv = new Float32Array(vertexCount * 2);
  const skinIndex = new Uint16Array(vertexCount * 4);
  const skinWeight = new Float32Array(vertexCount * 4);
  const index = vertexCount > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);

  let vertexOffset = 0;
  let indexOffset = 0;
  for (const geometry of geometries) {
    const count = geometry.attributes.position.count;
    position.set(geometry.attributes.position.array, vertexOffset * 3);
    normal.set(geometry.attributes.normal.array, vertexOffset * 3);
    uv.set(geometry.attributes.uv.array, vertexOffset * 2);
    skinIndex.set(geometry.attributes.skinIndex.array, vertexOffset * 4);
    skinWeight.set(geometry.attributes.skinWeight.array, vertexOffset * 4);
    const source = geometry.index.array;
    for (let i = 0; i < source.length; i += 1) index[indexOffset + i] = source[i] + vertexOffset;
    vertexOffset += count;
    indexOffset += source.length;
    geometry.dispose();
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(position, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  merged.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4));
  merged.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
  merged.setIndex(new THREE.BufferAttribute(index, 1));
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

/**
 * Palette strip. One N x 1 sRGB texture shared by every figure and every
 * material role, so a whole crowd's colour vocabulary is one 4 KB upload and
 * a garment set costs no extra draw call.
 */
export function createFigurePalette(colors) {
  const width = colors.length;
  const data = new Uint8Array(width * 4);
  // Hex bytes are written straight through, NOT via `THREE.Color`.
  //
  // With colour management on (the default since r155) `new Color('#e5b795')`
  // stores the LINEAR value, so `color.r * 255` writes 200 where the author
  // wrote 229 — every palette entry lands roughly a stop dark and noticeably
  // more saturated, and pale skin comes out terracotta. The texture is tagged
  // `SRGBColorSpace` below, so the byte the author typed is the byte the
  // texture must carry.
  colors.forEach((hex, i) => {
    const value = Number.parseInt(String(hex).replace('#', ''), 16);
    data[i * 4] = (value >> 16) & 255;
    data[i * 4 + 1] = (value >> 8) & 255;
    data[i * 4 + 2] = value & 255;
    data[i * 4 + 3] = 255;
  });
  const texture = new THREE.DataTexture(data, width, 1, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;

  const byName = new Map();
  return {
    texture,
    width,
    colors,
    /** Register a name for a column so archetypes read as colours, not indices. */
    name(key, indexValue) {
      byName.set(key, indexValue);
      return indexValue;
    },
    index(key) {
      const value = byName.get(key);
      if (value === undefined) throw new Error(`Unknown crowd palette entry "${key}".`);
      return value;
    },
    /**
     * Column centre in UV. A NearestFilter strip still gets sampled with a
     * derivative-driven LOD by some backends, so the centre is the only safe
     * coordinate.
     */
    u(indexValue) {
      const column = typeof indexValue === 'string' ? this.index(indexValue) : indexValue;
      return (column + 0.5) / width;
    },
    dispose() {
      texture.dispose();
    },
  };
}
