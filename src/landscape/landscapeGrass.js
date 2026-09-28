// Grass foliage layer — every paint record is one StylizedGrassClumpField
// tuft, not one blade. It keeps the same interface as LandscapeFoliageLayer:
// add/erase/undo operate on stable clump placements while the field owns the
// shared tapered geometry, Grass Shader material, wind, ground adoption, and
// camera LOD assignment.

import * as THREE from 'three';

import {
  createGrassSettings,
} from '../vegetation/stylizedGrass.js';
import { StylizedGrassClumpField } from '../vegetation/grassClump.js';
import {
  FOLIAGE_INSTANCE_STRIDE,
  FOLIAGE_INSTANCE_STRIDE_V2,
} from './landscapeDocument.js';

const HASH_CELL = 2;

export class GrassFoliageLayer extends THREE.Group {
  constructor({
    paletteId,
    document = null,
    heightAt = null,
    rules = {},
  } = {}) {
    super();
    this.name = `LandscapeGrass ${paletteId ?? 'grass'}`;
    this.paletteId = paletteId;
    this.heightAt = heightAt;
    this.rules = rules;
    this.settings = createGrassSettings(document?.settings ?? {
      preset: 'call_me_sensei_clump',
    });
    this._nextId = 1;
    this.records = new Map();
    this._hash = new Map();
    this._field = null;
    this._rebuildQueued = false;
    this._retired = []; // [{ field, ticks }] — disposed a few frames later
  }

  _cellKey(x, z) {
    return `${Math.floor(x / HASH_CELL)},${Math.floor(z / HASH_CELL)}`;
  }

  // Rebuilds are coalesced to one per frame (a paint stroke batches many
  // samples) and replaced fields are disposed a few frames later — tearing a
  // field down while WebGPU is still compiling its pipeline invalidates the
  // in-flight render (GPUValidationError churn).
  _rebuild() {
    this._rebuildQueued = true;
  }

  _rebuildNow() {
    this._rebuildQueued = false;
    if (this._field) {
      this.remove(this._field);
      this._retired.push({ field: this._field, ticks: 0 });
      this._field = null;
    }
    if (!this.records.size) return;
    const placements = [...this.records.values()].map((record) => ({
      scale: record.scale,
      x: record.x,
      y: record.y,
      yaw: record.yaw,
      z: record.z,
    }));
    this._field = new StylizedGrassClumpField({ ...this.settings, placements });
    // r185: building the grass NodeMaterial against a scene with fog emits
    // WGSL referencing an undeclared uniform (GPUValidationError,
    // "unresolved value nodeUniformN") — grass-lab never hits it because its
    // stage has no fog. Grass sits near the camera; skipping fog is invisible.
    for (const mesh of this._field.lodMeshes) mesh.material.fog = false;
    this.add(this._field);
  }

  get count() {
    return this.records.size;
  }

  queryCircle(x, z, radius) {
    const results = [];
    const radiusSq = radius * radius;
    for (let cz = Math.floor((z - radius) / HASH_CELL); cz <= Math.floor((z + radius) / HASH_CELL); cz += 1) {
      for (let cx = Math.floor((x - radius) / HASH_CELL); cx <= Math.floor((x + radius) / HASH_CELL); cx += 1) {
        const cell = this._hash.get(`${cx},${cz}`);
        if (!cell) continue;
        for (const id of cell) {
          const record = this.records.get(id);
          if (record && (record.x - x) ** 2 + (record.z - z) ** 2 <= radiusSq) results.push(record);
        }
      }
    }
    return results;
  }

  hasClearance(x, z, spacing) {
    if (!(spacing > 0)) return true;
    return this.queryCircle(x, z, spacing).length === 0;
  }

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
        tilt: null,
      };
      this._nextId = Math.max(this._nextId, record.id + 1);
      this.records.set(record.id, record);
      const key = this._cellKey(record.x, record.z);
      if (!this._hash.has(key)) this._hash.set(key, new Set());
      this._hash.get(key).add(record.id);
      added.push(record);
    }
    if (added.length) this._rebuild();
    return added;
  }

  removeInstances(ids) {
    const removed = [];
    for (const id of ids) {
      const record = this.records.get(id);
      if (!record) continue;
      this.records.delete(id);
      this._hash.get(this._cellKey(record.x, record.z))?.delete(id);
      removed.push(record);
    }
    if (removed.length) this._rebuild();
    return removed;
  }

  /** Grass never blocks the walker. */
  footprintCircles() {
    return [];
  }

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
      offset += stride;
    }
    return data;
  }

  loadInstances(data, stride = FOLIAGE_INSTANCE_STRIDE) {
    if (!(data instanceof Float32Array)) return;
    const resolvedStride = stride === FOLIAGE_INSTANCE_STRIDE_V2
      ? FOLIAGE_INSTANCE_STRIDE_V2
      : FOLIAGE_INSTANCE_STRIDE;
    const records = [];
    for (let offset = 0; offset + resolvedStride <= data.length; offset += resolvedStride) {
      records.push({
        x: data[offset],
        y: data[offset + 1],
        z: data[offset + 2],
        yaw: data[offset + 3],
        scale: data[offset + 4],
      });
    }
    this.addInstances(records);
  }

  update(delta, camera = null) {
    if (this._rebuildQueued) this._rebuildNow();
    for (let i = this._retired.length - 1; i >= 0; i -= 1) {
      this._retired[i].ticks += 1;
      if (this._retired[i].ticks > 4) {
        this._retired[i].field.dispose?.();
        this._retired.splice(i, 1);
      }
    }
    this._field?.update?.(delta, camera);
  }

  dispose() {
    this.parent?.remove(this);
    for (const retired of this._retired) retired.field.dispose?.();
    this._retired = [];
    if (this._field) {
      this._field.dispose?.();
      this._field = null;
    }
    this.records.clear();
    this._hash.clear();
  }
}
