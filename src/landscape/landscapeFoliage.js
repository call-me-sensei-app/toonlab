// Landscape foliage layer — the paintable counterpart to PropInstances.
// One layer per palette entry: per-variant/per-source/per-LOD InstancedMesh
// pools with dynamic capacity (headroom + double-on-overflow + swap-remove),
// a 2D spatial hash for min-spacing and radius erase, and hi/lo LOD swap on
// an interval by true 3D camera distance (PropInstances conventions:
// DynamicDrawUsage, zero-scale hiding, frustumCulled = false).

import * as THREE from 'three';

import { bakeSources } from '../propgen/propPlacement.js';
import {
  FOLIAGE_INSTANCE_STRIDE,
  FOLIAGE_INSTANCE_STRIDE_V2,
} from './landscapeDocument.js';

const ZERO_SCALE = new THREE.Matrix4().makeScale(0, 0, 0);
const UP = new THREE.Vector3(0, 1, 0);
const scratchEuler = new THREE.Euler();
const scratchPosition = new THREE.Vector3();
const scratchQuaternion = new THREE.Quaternion();
const scratchTilt = new THREE.Quaternion();
const scratchNormal = new THREE.Vector3();
const scratchScale = new THREE.Vector3();
const HASH_CELL = 2;

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

// Deterministic per-position hash so an instance keeps its build variant
// across serialize/undo round-trips without storing it.
function positionHash(x, z) {
  const value = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return Math.abs(Math.floor((value - Math.floor(value)) * 0xffffffff));
}

export class LandscapeFoliageLayer extends THREE.Group {
  constructor({
    asset,
    paletteId,
    heightAt = null,
    rules = {},
    variants = 3,
    seed = 1,
    updateInterval = 0.4,
    initialCapacity = 128,
  } = {}) {
    super();
    if (!asset?.build) throw new Error('LandscapeFoliageLayer needs a PropAsset ({ build }).');
    this.name = `LandscapeFoliage ${paletteId ?? asset.type ?? 'asset'}`;
    this.paletteId = paletteId;
    this.heightAt = heightAt;
    this.rules = rules;
    this.updateInterval = updateInterval;
    this._timer = updateInterval;
    this._camera = null;
    this._nextId = 1;
    this.records = new Map(); // id -> { id, x, y, z, yaw, scale, variant }
    this._hash = new Map(); // "cx,cz" -> Set<id>

    const variantCount = Math.max(1, variants);
    const random = mulberry32(seed * 2246822519 + 3);
    this._builds = [];
    for (let index = 0; index < variantCount; index += 1) {
      const built = asset.build(Math.floor(random() * 0xffffffff));
      this._builds.push({
        anchor: built.anchor ?? 0,
        footprint: built.footprint ?? { radius: 0.3 },
        hi: bakeSources(built.object3D),
        lo: built.lod?.far ? bakeSources(built.lod.far) : null,
        lodDistance: built.lod?.distance ?? 55,
      });
    }

    this._pools = this._builds.map((build, variant) => ({
      build,
      variant,
      entries: [], // records, slot = array index
      capacity: 0,
      hi: [],
      lo: null,
      lodDistanceSq: build.lodDistance ** 2,
    }));
    for (const pool of this._pools) this._allocatePool(pool, initialCapacity);
  }

  _allocatePool(pool, capacity) {
    const previous = [...pool.hi, ...(pool.lo ?? [])];
    for (const mesh of previous) {
      this.remove(mesh);
      mesh.dispose(); // instanced buffers only; build geometry is shared
    }
    const makeLevel = (sources, level) => sources.map((source) => {
      const instanced = new THREE.InstancedMesh(source.geometry, source.material, capacity);
      instanced.name = `${this.name}-${pool.variant}-${level}`;
      instanced.castShadow = source.castShadow;
      instanced.receiveShadow = source.receiveShadow;
      instanced.userData.waterGrabExclude = true;
      instanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      for (let index = 0; index < capacity; index += 1) instanced.setMatrixAt(index, ZERO_SCALE);
      instanced.count = capacity;
      instanced.frustumCulled = false;
      this.add(instanced);
      return instanced;
    });
    pool.capacity = capacity;
    pool.hi = makeLevel(pool.build.hi, 'hi');
    pool.lo = pool.build.lo ? makeLevel(pool.build.lo, 'lo') : null;
    // Repaint every surviving entry into the fresh buffers.
    for (let slot = 0; slot < pool.entries.length; slot += 1) {
      this._writeSlot(pool, slot, this._camera);
    }
  }

  _composeMatrix(record, pool, out) {
    scratchEuler.set(0, record.yaw, 0, 'YXZ');
    scratchQuaternion.setFromEuler(scratchEuler);
    const alignToSlope = Number(this.rules.alignToSlope) || 0;
    if (record.tilt) {
      // Explicit surface-placement orientation (cave ceilings/walls) wins
      // over the slope-derived tilt.
      scratchTilt.set(record.tilt[0], record.tilt[1], record.tilt[2], record.tilt[3]);
      scratchQuaternion.premultiply(scratchTilt);
    } else if (alignToSlope > 0 && typeof this.heightAt === 'function') {
      const step = 0.6;
      const dx = (this.heightAt(record.x + step, record.z) - this.heightAt(record.x - step, record.z)) / (2 * step);
      const dz = (this.heightAt(record.x, record.z + step) - this.heightAt(record.x, record.z - step)) / (2 * step);
      scratchNormal.set(-dx, 1, -dz).normalize();
      scratchTilt.setFromUnitVectors(UP, scratchNormal);
      const angle = 2 * Math.acos(Math.min(Math.abs(scratchTilt.w), 1));
      const maxTilt = alignToSlope >= 1 ? 0.35 : alignToSlope;
      if (angle > maxTilt && angle > 1e-6) {
        scratchTilt.slerp(new THREE.Quaternion(), 1 - maxTilt / angle);
      }
      scratchQuaternion.premultiply(scratchTilt);
    }
    scratchPosition.set(record.x, record.y + pool.build.anchor * record.scale, record.z);
    scratchScale.setScalar(record.scale);
    return out.compose(scratchPosition, scratchQuaternion, scratchScale);
  }

  _writeSlot(pool, slot, camera) {
    const record = pool.entries[slot];
    if (!record) {
      for (const mesh of pool.hi) mesh.setMatrixAt(slot, ZERO_SCALE);
      if (pool.lo) for (const mesh of pool.lo) mesh.setMatrixAt(slot, ZERO_SCALE);
    } else {
      const matrix = this._composeMatrix(record, pool, new THREE.Matrix4());
      let useHi = true;
      if (camera && pool.lo) {
        const dx = record.x - camera.position.x;
        const dy = record.y - camera.position.y;
        const dz = record.z - camera.position.z;
        useHi = dx * dx + dy * dy + dz * dz < pool.lodDistanceSq;
      }
      for (const mesh of pool.hi) mesh.setMatrixAt(slot, useHi ? matrix : ZERO_SCALE);
      if (pool.lo) for (const mesh of pool.lo) mesh.setMatrixAt(slot, useHi ? ZERO_SCALE : matrix);
    }
    for (const mesh of pool.hi) mesh.instanceMatrix.needsUpdate = true;
    if (pool.lo) for (const mesh of pool.lo) mesh.instanceMatrix.needsUpdate = true;
  }

  _cellKey(x, z) {
    return `${Math.floor(x / HASH_CELL)},${Math.floor(z / HASH_CELL)}`;
  }

  _hashAdd(record) {
    const key = this._cellKey(record.x, record.z);
    let cell = this._hash.get(key);
    if (!cell) {
      cell = new Set();
      this._hash.set(key, cell);
    }
    cell.add(record.id);
  }

  _hashRemove(record) {
    const cell = this._hash.get(this._cellKey(record.x, record.z));
    cell?.delete(record.id);
  }

  get count() {
    return this.records.size;
  }

  /** Records with centers inside the world-space circle. */
  queryCircle(x, z, radius) {
    const results = [];
    const minCx = Math.floor((x - radius) / HASH_CELL);
    const maxCx = Math.floor((x + radius) / HASH_CELL);
    const minCz = Math.floor((z - radius) / HASH_CELL);
    const maxCz = Math.floor((z + radius) / HASH_CELL);
    const radiusSq = radius * radius;
    for (let cz = minCz; cz <= maxCz; cz += 1) {
      for (let cx = minCx; cx <= maxCx; cx += 1) {
        const cell = this._hash.get(`${cx},${cz}`);
        if (!cell) continue;
        for (const id of cell) {
          const record = this.records.get(id);
          if (!record) continue;
          const dx = record.x - x;
          const dz = record.z - z;
          if (dx * dx + dz * dz <= radiusSq) results.push(record);
        }
      }
    }
    return results;
  }

  /** True when no existing instance sits within `spacing` of (x, z). */
  hasClearance(x, z, spacing) {
    if (!(spacing > 0)) return true;
    return this.queryCircle(x, z, spacing).length === 0;
  }

  /**
   * Adds instance records (`{x, y, z, yaw, scale, id?}`). Missing ids are
   * assigned; missing y grounds via heightAt. Returns the stored records —
   * the foliage undo command's `added` payload.
   */
  addInstances(records) {
    const added = [];
    for (const input of records) {
      const record = {
        id: input.id ?? this._nextId,
        x: Number(input.x) || 0,
        y: Number.isFinite(input.y)
          ? Number(input.y)
          : (typeof this.heightAt === 'function' ? this.heightAt(input.x, input.z) : 0),
        z: Number(input.z) || 0,
        yaw: Number(input.yaw) || 0,
        scale: Number(input.scale) || 1,
        tilt: Array.isArray(input.tilt) && input.tilt.length === 4 ? [...input.tilt] : null,
      };
      this._nextId = Math.max(this._nextId, record.id + 1);
      record.variant = positionHash(record.x, record.z) % this._pools.length;
      const pool = this._pools[record.variant];
      if (pool.entries.length >= pool.capacity) {
        this._allocatePool(pool, Math.max(pool.capacity * 2, 128));
      }
      record.slot = pool.entries.length;
      pool.entries.push(record);
      this.records.set(record.id, record);
      this._hashAdd(record);
      this._writeSlot(pool, record.slot, this._camera);
      added.push(record);
    }
    return added;
  }

  /** Removes instances by id; returns the removed records (for undo). */
  removeInstances(ids) {
    const removed = [];
    for (const id of ids) {
      const record = this.records.get(id);
      if (!record) continue;
      const pool = this._pools[record.variant];
      const last = pool.entries[pool.entries.length - 1];
      pool.entries[record.slot] = last;
      pool.entries.pop();
      if (last !== record) {
        last.slot = record.slot;
        this._writeSlot(pool, last.slot, this._camera);
      }
      this._writeSlot(pool, pool.entries.length, this._camera);
      this.records.delete(id);
      this._hashRemove(record);
      removed.push(record);
    }
    return removed;
  }

  /**
   * Serializes all instances at the v2 stride (x, y, z, yaw, scale, tilt
   * quaternion; all-zero quaternion = slope-derived tilt).
   */
  serializeInstances() {
    const stride = FOLIAGE_INSTANCE_STRIDE_V2;
    const data = new Float32Array(this.records.size * stride);
    let offset = 0;
    for (const record of this.records.values()) {
      data[offset] = record.x;
      data[offset + 1] = record.y;
      data[offset + 2] = record.z;
      data[offset + 3] = record.yaw;
      data[offset + 4] = record.scale;
      if (record.tilt) {
        data[offset + 5] = record.tilt[0];
        data[offset + 6] = record.tilt[1];
        data[offset + 7] = record.tilt[2];
        data[offset + 8] = record.tilt[3];
      }
      offset += stride;
    }
    return data;
  }

  /** Loads instances from a document Float32Array (stride 5 legacy or 9). */
  loadInstances(data, stride = FOLIAGE_INSTANCE_STRIDE) {
    if (!(data instanceof Float32Array)) return;
    const resolvedStride = stride === FOLIAGE_INSTANCE_STRIDE_V2
      ? FOLIAGE_INSTANCE_STRIDE_V2
      : FOLIAGE_INSTANCE_STRIDE;
    const records = [];
    for (let offset = 0; offset + resolvedStride <= data.length; offset += resolvedStride) {
      const record = {
        x: data[offset],
        y: data[offset + 1],
        z: data[offset + 2],
        yaw: data[offset + 3],
        scale: data[offset + 4],
      };
      if (resolvedStride === FOLIAGE_INSTANCE_STRIDE_V2) {
        const tilt = [data[offset + 5], data[offset + 6], data[offset + 7], data[offset + 8]];
        if (tilt.some((component) => component !== 0)) record.tilt = tilt;
      }
      records.push(record);
    }
    this.addInstances(records);
  }

  /** World-frame collision circles for every instance (walk previews). */
  footprintCircles() {
    const circles = [];
    for (const pool of this._pools) {
      const radius = pool.build.footprint?.radius ?? 0.3;
      for (const record of pool.entries) {
        circles.push({ radius: radius * record.scale, x: record.x, z: record.z });
      }
    }
    return circles;
  }

  /** Per-frame LOD reassignment on an interval (cheap). */
  update(delta = 0.016, camera = null) {
    if (camera) this._camera = camera;
    this._timer += delta;
    if (this._timer < this.updateInterval) return;
    this._timer = 0;
    for (const pool of this._pools) {
      if (!pool.lo) continue;
      for (let slot = 0; slot < pool.entries.length; slot += 1) {
        this._writeSlot(pool, slot, this._camera);
      }
    }
  }

  dispose() {
    this.parent?.remove(this);
    for (const pool of this._pools) {
      for (const mesh of [...pool.hi, ...(pool.lo ?? [])]) {
        mesh.dispose();
      }
      for (const source of [...pool.build.hi, ...(pool.build.lo ?? [])]) {
        source.geometry.dispose();
      }
    }
    this.records.clear();
    this._hash.clear();
  }
}

/**
 * Plans one foliage paint sample: scatter candidates inside the brush disc,
 * reject against the entry's placement rules and the layer's spacing hash,
 * and return records ready for `layer.addInstances`. Pure planning — the
 * caller commits the result as a foliage undo command.
 */
export function planFoliagePaint({
  field,
  layer,
  x,
  z,
  radius = 6,
  density = 0.15,
  densityMultiplier = 1,
  waterLevel = null,
  groundwaterLevel = null,
  seed = 1,
  shape = 'round',
} = {}) {
  const rules = layer.rules ?? {};
  const random = mulberry32(seed * 1181783497 + 5);
  const area = shape === 'square' ? (radius * 2) ** 2 : Math.PI * radius * radius;
  const target = Math.max(1, Math.round(density * densityMultiplier * area));
  const spacing = Math.max(0, Number(rules.minSpacing) || 0);
  const spacingSq = spacing * spacing;
  const scaleRange = rules.scaleRange ?? [0.85, 1.25];
  const planned = [];
  let attempts = target * 6;
  while (planned.length < target && attempts > 0) {
    attempts -= 1;
    let px;
    let pz;
    if (shape === 'square') {
      px = x + (random() * 2 - 1) * radius;
      pz = z + (random() * 2 - 1) * radius;
    } else {
      const distance = radius * Math.sqrt(random());
      const angle = random() * Math.PI * 2;
      px = x + Math.cos(angle) * distance;
      pz = z + Math.sin(angle) * distance;
    }
    if (!field.contains(px, pz)) continue;
    if (field.isHole?.(px, pz)) continue; // no floating foliage over cave openings
    if (Number.isFinite(rules.maxSlope) && field.slopeAt(px, pz) > rules.maxSlope) continue;
    const height = field.heightAt(px, pz);
    if (Number.isFinite(rules.minHeight) && rules.minHeight !== null && height < rules.minHeight) continue;
    if (Number.isFinite(rules.maxHeight) && rules.maxHeight !== null && height > rules.maxHeight) continue;
    // Water placement mode. Painted dry zones suppress the stage water —
    // only the deeper groundwater level (if any) counts there.
    const waterPlacement = rules.waterPlacement
      ?? (rules.avoidWater !== false ? 'avoid' : 'any');
    const effectiveWater = field.isDry?.(px, pz)
      ? (Number.isFinite(groundwaterLevel) ? groundwaterLevel : null)
      : (Number.isFinite(waterLevel) ? waterLevel : null);
    let placementY = height;
    if (waterPlacement === 'avoid') {
      if (effectiveWater !== null && height <= effectiveWater + 0.15) continue;
    } else if (waterPlacement === 'bed') {
      // Riverbed/lakebed planting: only genuinely submerged ground.
      if (effectiveWater === null || height > effectiveWater - 0.1) continue;
    } else if (waterPlacement === 'surface') {
      // Float on the water plane (lily pads): needs water above the ground.
      if (effectiveWater === null || height >= effectiveWater) continue;
      placementY = effectiveWater + 0.02;
    } // 'any': no water constraint
    if (spacing > 0) {
      if (!layer.hasClearance(px, pz, spacing)) continue;
      if (planned.some((p) => (p.x - px) ** 2 + (p.z - pz) ** 2 < spacingSq)) continue;
    }
    planned.push({
      x: px,
      y: placementY,
      z: pz,
      yaw: rules.yawRandom !== false ? random() * Math.PI * 2 : 0,
      scale: scaleRange[0] + (scaleRange[1] - scaleRange[0]) * random(),
    });
  }
  return planned;
}
