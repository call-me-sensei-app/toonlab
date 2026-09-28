// Rock document: the JSON-serializable source of truth for one rock /
// cliff / mountain project. Legacy procedural documents use a flat ordered
// list of SDF pieces (left-folded with their combine ops) plus sculpt edits.
// Source-mesh reference documents instead carry `reference.sourceMode =
// 'mesh-template'`; their required piece is compatibility-only and is never
// meshed by the SDF path.
// `revision` is a runtime dirty counter (never serialized); every mutation
// helper bumps it so compileDocument's cache and the lab's schedulers can
// tell stale work from fresh.

import {
  createRockPieceSettings,
  createRockSurfaceSettings,
  createRockgenMeshingSettings,
} from './rockgenSettings.js';
import {
  normalizeRockgenPresetName,
  normalizeRockgenStyleName,
  resolveRockgenPreset,
} from './rockgenPresets.js';
import { compileDocument } from './sdf/fieldCompiler.js';
import { resolveC7Projection } from './surface/c7GeologySurface.js';

/** Document type tag stamped on saved rockgen project JSON. */
export const ROCKGEN_PROJECT_DOCUMENT_TYPE = 'toonlab/rockgen-project';

/** Current schema version for rockgen project documents. */
export const ROCKGEN_PROJECT_SCHEMA_VERSION = 9;

/** Legacy MCP request budgets. The interactive Rock Lab editor no longer uses
 * these as sculpt, drill, persistence, or replay ceilings. */
export const ROCKGEN_MAX_MESH_EDIT_OPERATIONS = 200;
export const ROCKGEN_MAX_MESH_EDIT_DELTAS = 10_000;
export const ROCKGEN_MAX_MESH_CUT_OPERATIONS = 64;
export const ROCKGEN_MESH_EDIT_ENCODING = 'base64-f32le-v1';

const COMBINE_OPS = Object.freeze(['union', 'smoothUnion', 'subtract', 'intersect']);

function positiveInteger(value, fallback = 0) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function lodRatiosOption(value) {
  if (!Array.isArray(value) || value.length === 0) return [1, 0.5, 0.25];
  const ratios = value
    .map(Number)
    .filter((ratio) => Number.isFinite(ratio) && ratio > 0 && ratio <= 1)
    .sort((left, right) => right - left);
  if (ratios.length === 0) return [1, 0.5, 0.25];
  if (ratios[0] !== 1) ratios.unshift(1);
  return [...new Set(ratios)].slice(0, 3);
}

function lodTrianglesOption(value, targetTriangles, lodRatios) {
  if (Array.isArray(value)) {
    const levels = value
      .slice(0, 3)
      .map((entry) => positiveInteger(entry, 0))
      .filter((entry) => entry > 0);
    if (levels.length > 0) {
      for (let index = 1; index < levels.length; index += 1) {
        levels[index] = Math.min(levels[index], levels[index - 1]);
      }
      return levels;
    }
  }
  const lod0 = positiveInteger(targetTriangles, 0);
  return lod0 > 0
    ? lodRatios.map((ratio) => Math.max(Math.round(lod0 * ratio), 1))
    : [];
}

function surfacePackageOption(value) {
  if (!value || typeof value !== 'object') return null;
  const c8SurfaceVersion = Number(value.version);
  if (value.schema === 'toonlab/c8-first12-geology-surface'
    && (c8SurfaceVersion === 1 || c8SurfaceVersion === 2)) {
    const assetId = String(value.assetId ?? '').trim();
    const geometrySha256 = String(value.geometrySha256 ?? '').toLowerCase();
    const profileId = String(value.profileId ?? '').trim();
    const mapResolution = Math.round(Number(value.mapResolution));
    if (!assetId || !profileId || !/^[a-f0-9]{64}$/u.test(geometrySha256)
      || !Number.isInteger(mapResolution) || mapResolution < 1024 || mapResolution > 4096) return null;
    return {
      ...structuredClone(value),
      assetId,
      geometrySha256,
      mapResolution,
      profileId,
      schema: 'toonlab/c8-first12-geology-surface',
      seed: Math.round(Number(value.seed) || 0) >>> 0,
      version: c8SurfaceVersion,
    };
  }
  const schema = String(value.schema ?? '').trim();
  const profileId = String(value.profileId ?? '').trim();
  const assetId = String(value.assetId ?? '').trim();
  const projectionMode = String(value.projection?.mode ?? '').trim();
  const projectionScaleMetres = Number(value.projection?.scaleMetres);
  const genericMapResolution = Math.round(Number(value.mapResolution));
  if (schema.startsWith('toonlab/')
    && Number.isInteger(c8SurfaceVersion) && c8SurfaceVersion >= 1
    && assetId && profileId
    && ['triplanar', 'directional-bedding', 'world-metre-triplanar-isotropic'].includes(projectionMode)
    && Number.isFinite(projectionScaleMetres) && projectionScaleMetres > 0
    && Number.isInteger(genericMapResolution)
    && genericMapResolution >= 32 && genericMapResolution <= 4096) {
    return {
      ...structuredClone(value),
      assetId,
      mapResolution: genericMapResolution,
      profileId,
      schema,
      seed: Math.round(Number(value.seed) || 0) >>> 0,
      version: c8SurfaceVersion,
    };
  }
  if (value.schema !== 'toonlab/c7-geology-surface' || Number(value.version) !== 1) return null;
  const geology = String(value.geology ?? '').trim();
  if (!geology) return null;
  const mapResolution = Math.max(32, Math.min(2048, Math.round(Number(value.mapResolution) || 512)));
  return {
    geology,
    mapResolution,
    schema: 'toonlab/c7-geology-surface',
    seed: Math.round(Number(value.seed) || 0) >>> 0,
    version: 1,
  };
}

const SHA256_CONTENT_HASH = /^sha256:[0-9a-f]{64}$/u;

function contentHashOption(value) {
  return SHA256_CONTENT_HASH.test(value ?? '') ? value : null;
}

function customMeshArtifactOption(value, role) {
  if (!value || typeof value !== 'object' || value.role !== role) return null;
  if (value.mimeType !== 'model/gltf-binary' || value.unit !== 'metre'
    || Number(value.metreUnitScale) !== 1 || value.coordinateSystem !== 'right-handed-y-up') return null;
  const dimensionsMetres = vector3Option(value.dimensionsMetres, [0, 0, 0]);
  const min = vector3Option(value.boundsMetres?.min, [0, 0, 0]);
  const max = vector3Option(value.boundsMetres?.max, [0, 0, 0]);
  const contentHash = contentHashOption(value.contentHash);
  const topologyHash = contentHashOption(value.topologyHash);
  const uri = String(value.uri ?? '').trim();
  const id = String(value.id ?? '').trim();
  const byteLength = positiveInteger(value.byteLength, 0);
  const geometryAudit = {
    meshVertexCounts: Array.isArray(value.geometryAudit?.meshVertexCounts)
      ? value.geometryAudit.meshVertexCounts.map((entry) => positiveInteger(entry, 0))
      : [],
    topologyHash: contentHashOption(value.geometryAudit?.topologyHash),
    triangleCount: positiveInteger(value.geometryAudit?.triangleCount, 0),
    vertexCount: positiveInteger(value.geometryAudit?.vertexCount, 0),
  };
  if (!contentHash || !topologyHash || !uri.toLowerCase().endsWith('.glb')
    || !id || byteLength < 20
    || dimensionsMetres.some((entry) => entry <= 0)
    || !min.every((entry, axis) => entry < max[axis])
    || !dimensionsMetres.every((entry, axis) => (
      Math.abs(entry - (max[axis] - min[axis])) <= Math.max(1e-6, entry * 1e-5)
    ))
    || geometryAudit.topologyHash !== topologyHash
    || geometryAudit.vertexCount < 4 || geometryAudit.triangleCount < 4
    || geometryAudit.meshVertexCounts.length === 0
    || geometryAudit.meshVertexCounts.some((entry) => entry <= 0)) return null;
  return {
    boundsMetres: { max, min },
    byteLength,
    contentHash,
    coordinateSystem: 'right-handed-y-up',
    dimensionsMetres,
    geometryAudit: { ...geometryAudit, topologyHash },
    id,
    metreUnitScale: 1,
    mimeType: 'model/gltf-binary',
    role,
    sourceRevision: positiveInteger(value.sourceRevision, 1),
    topologyHash,
    unit: 'metre',
    uri,
  };
}

function identityLandmarksOption(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const id = String(entry?.id ?? '').trim();
    if (!id) return [];
    return [{
      id,
      positionMetres: vector3Option(entry.positionMetres, [0, 0, 0]),
      role: String(entry.role ?? 'identity').trim(),
    }];
  });
}

function semanticRegionsOption(value, landmarkIds) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const id = String(entry?.id ?? '').trim();
    const attribute = String(entry?.selector?.attribute ?? '').trim();
    const selectorValue = Math.round(Number(entry?.selector?.value));
    if (!id || !/^_[A-Z0-9_]+$/u.test(attribute) || !Number.isInteger(selectorValue) || selectorValue < 0) return [];
    return [{
      id,
      label: String(entry.label ?? id),
      landmarkIds: Array.isArray(entry.landmarkIds)
        ? entry.landmarkIds.map(String).filter((landmarkId) => landmarkIds.has(landmarkId))
        : [],
      role: String(entry.role ?? 'primary-mass'),
      selector: { attribute, kind: 'gltf-attribute', value: selectorValue },
    }];
  });
}

function customMeshSourceOption(value, identityLandmarks) {
  if (!value || value.schema !== 'toonlab/c8-custom-mesh-source' || Number(value.version) !== 1) return null;
  if (value.authority !== 'toonlab-editable-control-plus-retained-high') return null;
  const control = customMeshArtifactOption(value.control, 'editable-control');
  const highDetail = customMeshArtifactOption(value.highDetail, 'retained-high-detail');
  if (!control || !highDetail || !control.id || !highDetail.id || control.id === highDetail.id
    || control.contentHash === highDetail.contentHash
    || control.geometryAudit.meshVertexCounts.some((entry) => entry <= 0)
    || highDetail.geometryAudit.meshVertexCounts.some((entry) => entry <= 0)
    || control.geometryAudit.meshVertexCounts.reduce((sum, entry) => sum + entry, 0) !== control.geometryAudit.vertexCount
    || highDetail.geometryAudit.meshVertexCounts.reduce((sum, entry) => sum + entry, 0) !== highDetail.geometryAudit.vertexCount
    || highDetail.geometryAudit.vertexCount <= control.geometryAudit.vertexCount
    || highDetail.geometryAudit.triangleCount <= control.geometryAudit.triangleCount
    || control.byteLength < 20 || highDetail.byteLength < 20) return null;
  const landmarkIds = new Set(identityLandmarks.map((landmark) => landmark.id));
  if (landmarkIds.size < 3 || landmarkIds.size !== identityLandmarks.length) return null;
  const semanticRegions = semanticRegionsOption(value.semanticRegions, landmarkIds);
  const maximumDisplacementMetres = Number(value.editEnvelope?.maximumDisplacementMetres);
  const maximumVariationStrength = Number(value.editEnvelope?.maximumVariationStrength);
  const semanticRegionIds = new Set(semanticRegions.map((region) => region.id));
  const semanticSelectors = new Set(semanticRegions.map((region) => `${region.selector.attribute}:${region.selector.value}`));
  const supportToleranceMetres = Math.max(...control.dimensionsMetres) * 1e-5;
  const highCorrespondenceToleranceMetres = Math.max(...control.dimensionsMetres) * 0.05;
  if (semanticRegions.length < 3 || semanticRegionIds.size !== semanticRegions.length
    || semanticSelectors.size !== semanticRegions.length
    || !semanticRegions.some((region) => region.role === 'base-support')
    || Math.abs(control.boundsMetres.min[1]) > Math.max(1e-6, supportToleranceMetres)
    || ['min', 'max'].some((key) => control.boundsMetres[key].some((entry, axis) => (
      Math.abs(entry - highDetail.boundsMetres[key][axis]) > highCorrespondenceToleranceMetres
    )))
    || !Number.isFinite(maximumDisplacementMetres)
    || maximumDisplacementMetres <= 0 || !Number.isFinite(maximumVariationStrength)
    || maximumVariationStrength <= 0 || maximumVariationStrength > 1) return null;
  return {
    authority: 'toonlab-editable-control-plus-retained-high',
    control,
    editEnvelope: {
      maximumDisplacementMetres,
      maximumVariationStrength,
      mode: 'bounded-source-space',
    },
    highDetail,
    schema: 'toonlab/c8-custom-mesh-source',
    semanticRegions,
    version: 1,
  };
}

export function isRockSourceMeshReference(reference) {
  return reference?.sourceMode === 'mesh-template'
    || Boolean(reference?.sourceMode === 'c8-custom-mesh' && reference.customMeshSource);
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return globalThis.btoa(binary);
}

function base64ToBytes(value) {
  const binary = globalThis.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function unpackMeshEdits(value, { strict = false } = {}) {
  if (value === null || value === undefined) return [];
  if (typeof value !== 'object' || value.encoding !== ROCKGEN_MESH_EDIT_ENCODING
    || typeof value.data !== 'string' || value.data.length === 0) {
    if (strict) throw new Error('C8 packed mesh edits require the exact supported encoding and non-empty data.');
    return [];
  }
  try {
    const bytes = base64ToBytes(value.data);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let offset = 0;
    const readUint32 = () => {
      if (offset + 4 > view.byteLength) throw new Error('truncated mesh-edit stream');
      const result = view.getUint32(offset, true);
      offset += 4;
      return result;
    };
    const readFloat32 = () => {
      if (offset + 4 > view.byteLength) throw new Error('truncated mesh-edit stream');
      const result = view.getFloat32(offset, true);
      offset += 4;
      return result;
    };
    const operationCount = readUint32();
    if (value.operationCount !== undefined && Number(value.operationCount) !== operationCount) {
      throw new Error('operation count metadata does not match the packed stream');
    }
    const edits = [];
    let totalDeltaCount = 0;
    for (let operationIndex = 0; operationIndex < operationCount; operationIndex += 1) {
      const meshIndex = readUint32();
      const storedDeltaCount = readUint32();
      if (storedDeltaCount === 0) throw new Error('delta count is empty');
      const deltas = [];
      for (let deltaIndex = 0; deltaIndex < storedDeltaCount; deltaIndex += 1) {
        const delta = [readUint32(), readFloat32(), readFloat32(), readFloat32()];
        if (!delta.slice(1).every(Number.isFinite)) throw new Error('packed delta contains a non-finite value');
        deltas.push(delta);
      }
      edits.push({ deltas, meshIndex });
      totalDeltaCount += deltas.length;
    }
    if (value.deltaCount !== undefined && Number(value.deltaCount) !== totalDeltaCount) {
      throw new Error('delta count metadata does not match the packed stream');
    }
    if (offset !== view.byteLength) {
      throw new Error('packed mesh-edit stream contains trailing bytes');
    }
    return edits;
  } catch (error) {
    if (strict) throw new Error(`Invalid C8 packed mesh edits: ${error.message}`);
    return [];
  }
}

function meshEditsOption(value, packedValue = null, { strict = false } = {}) {
  if (strict && Array.isArray(value) && packedValue) {
    throw new Error('C8 mesh edits must use either the unpacked or packed representation, never both.');
  }
  const source = Array.isArray(value) ? value : unpackMeshEdits(packedValue, { strict });
  if (!Array.isArray(source)) return [];
  if (strict) {
    return source.map((entry) => {
      if (!entry || typeof entry !== 'object' || !Array.isArray(entry.deltas) || entry.deltas.length === 0
        || !Number.isInteger(entry.meshIndex) || entry.meshIndex < 0) {
        throw new Error('C8 mesh edits require a non-negative integer mesh index and non-empty delta array.');
      }
      const deltas = entry.deltas.map((delta) => {
        if (!Array.isArray(delta) || delta.length !== 4
          || !Number.isInteger(delta[0]) || delta[0] < 0
          || !delta.slice(1).every(Number.isFinite)
          || (delta[1] === 0 && delta[2] === 0 && delta[3] === 0)) {
          throw new Error('C8 mesh edits require exact [vertexIndex, x, y, z] finite non-zero deltas.');
        }
        return [delta[0], Number(delta[1]), Number(delta[2]), Number(delta[3])];
      });
      return { deltas, meshIndex: entry.meshIndex };
    });
  }
  return source.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || !Array.isArray(entry.deltas)) return [];
    const deltas = entry.deltas.flatMap((delta) => {
      if (!Array.isArray(delta) || delta.length < 4) return [];
      const vertexIndex = Math.round(Number(delta[0]));
      const x = Number(delta[1]);
      const y = Number(delta[2]);
      const z = Number(delta[3]);
      if (vertexIndex < 0 || ![vertexIndex, x, y, z].every(Number.isFinite)) return [];
      if (x === 0 && y === 0 && z === 0) return [];
      return [[vertexIndex, x, y, z]];
    });
    if (deltas.length === 0) return [];
    return [{
      deltas,
      meshIndex: Math.max(0, Math.round(Number(entry.meshIndex) || 0)),
    }];
  });
}

function meshCutsOption(value, { strict = false } = {}) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') {
      if (strict) throw new Error('Drill cuts must be objects.');
      return [];
    }
    const point = Array.isArray(entry.point) ? entry.point.slice(0, 3).map(Number) : [];
    const normal = Array.isArray(entry.normal) ? entry.normal.slice(0, 3).map(Number) : [];
    const radius = Number(entry.radius);
    const roughness = Math.min(Math.max(Number(entry.roughness) || 0, 0), 1);
    const seed = Math.round(Number(entry.seed) || 0) >>> 0;
    const depth = Number(entry.depth);
    const meshIndex = Math.round(Number(entry.meshIndex));
    const valid = point.length === 3 && normal.length === 3
      && [...point, ...normal, radius, depth, meshIndex].every(Number.isFinite)
      && Math.hypot(...normal) > 1e-6
      && meshIndex >= 0 && radius >= 0.01
      && depth >= 0.01;
    if (!valid) {
      if (strict) throw new Error('Drill cuts require finite point/normal vectors, mesh index, radius, and depth.');
      return [];
    }
    const length = Math.hypot(...normal);
    return [{
      depth,
      meshIndex,
      normal: normal.map((component) => component / length),
      point,
      radius,
      roughness,
      seed,
      through: Boolean(entry.through),
    }];
  });
}

const ROCKGEN_MESH_SNAPSHOT_FLOAT_ENCODING = 'f32-base64-le';
const ROCKGEN_MESH_SNAPSHOT_INDEX_ENCODING = 'u32-base64-le';

function unpackMeshSnapshots(value, { strict = false } = {}) {
  if (value === null || value === undefined) return [];
  const reject = (message) => {
    if (strict) throw new Error(message);
    return [];
  };
  if (!Array.isArray(value)) return reject('Packed mesh snapshots must be an array.');
  try {
    return value.map((entry) => {
      const attributes = {};
      for (const [name, attribute] of Object.entries(entry?.attributes ?? {})) {
        if (attribute?.encoding !== ROCKGEN_MESH_SNAPSHOT_FLOAT_ENCODING
          || typeof attribute.data !== 'string' || !Number.isInteger(attribute.count)
          || !Number.isInteger(attribute.itemSize) || attribute.count <= 0 || attribute.itemSize <= 0) {
          throw new Error(`packed attribute ${name || '(unnamed)'} is invalid`);
        }
        const bytes = base64ToBytes(attribute.data);
        if (bytes.byteLength !== attribute.count * attribute.itemSize * 4) {
          throw new Error(`packed attribute ${name} has the wrong byte length`);
        }
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const data = Array.from(
          { length: attribute.count * attribute.itemSize },
          (_, index) => view.getFloat32(index * 4, true),
        );
        attributes[name] = {
          data,
          itemSize: attribute.itemSize,
          normalized: Boolean(attribute.normalized),
        };
      }
      let index = null;
      if (entry?.index !== null && entry?.index !== undefined) {
        if (entry.index.encoding !== ROCKGEN_MESH_SNAPSHOT_INDEX_ENCODING
          || typeof entry.index.data !== 'string' || !Number.isInteger(entry.index.count)
          || entry.index.count <= 0) throw new Error('packed indices are invalid');
        const bytes = base64ToBytes(entry.index.data);
        if (bytes.byteLength !== entry.index.count * 4) throw new Error('packed indices have the wrong byte length');
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        index = Array.from({ length: entry.index.count }, (_, offset) => view.getUint32(offset * 4, true));
      }
      return {
        attributes,
        groups: entry?.groups,
        index,
        meshIndex: entry?.meshIndex,
        ...(entry?.variationOrigin ? { variationOrigin: variationOriginOption(entry.variationOrigin) } : {}),
        ...(entry?.fillPatches?.length ? { fillPatches: entry.fillPatches.map((patch) => ({
          point: patch.point,
          geometry: unpackMeshSnapshots([{ ...patch.geometry, fillPatches: [] }], { strict })[0],
        })) } : {}),
      };
    });
  } catch (error) {
    return reject(`Invalid packed mesh snapshot: ${error.message}.`);
  }
}

function variationSettingsOption(value = {}) {
  const settings = {};
  if (value?.version === 2) settings.version = 2;
  if (value?.scope !== undefined) settings.scope = value.scope === 'component' ? 'component' : 'whole';
  if (value?.anchorBase !== undefined) settings.anchorBase = value.anchorBase !== false;
  if (value?.locks) settings.locks = {};
  for (const key of ['width', 'height', 'depth', 'leanX', 'leanZ', 'twist', 'taper', 'bulge', 'noiseAmplitude', 'noiseFrequency']) {
    if (Number.isFinite(value?.[key])) settings[key] = value[key];
    if (value?.locks?.[key]) settings.locks[key] = true;
  }
  return settings;
}

function variationOriginOption(value) {
  return value ? { strength: Number(value.strength) || 0, seed: Math.round(Number(value.seed) || 0) >>> 0,
    settings: variationSettingsOption(value.settings) } : undefined;
}

function meshSnapshotsOption(value, packedValue = null, { strict = false } = {}) {
  const source = Array.isArray(value) ? value : unpackMeshSnapshots(packedValue, { strict });
  if (!Array.isArray(source)) return [];
  return source.flatMap((entry) => {
    const reject = (message) => {
      if (strict) throw new Error(message);
      return [];
    };
    if (!entry || typeof entry !== 'object' || !Number.isInteger(entry.meshIndex) || entry.meshIndex < 0
      || !entry.attributes || typeof entry.attributes !== 'object') {
      return reject('Mesh snapshots require a non-negative mesh index and geometry attributes.');
    }
    const attributes = {};
    for (const [name, attribute] of Object.entries(entry.attributes)) {
      const itemSize = Math.round(Number(attribute?.itemSize));
      const data = Array.isArray(attribute?.data) ? attribute.data.map(Number) : [];
      if (!name || itemSize < 1 || itemSize > 4 || data.length === 0
        || data.length % itemSize !== 0 || !data.every(Number.isFinite)) {
        return reject(`Mesh snapshot attribute ${name || '(unnamed)'} is invalid.`);
      }
      attributes[name] = { data, itemSize, normalized: Boolean(attribute.normalized) };
    }
    const position = attributes.position;
    if (!position || position.itemSize !== 3) return reject('Mesh snapshots require a vec3 position attribute.');
    const vertexCount = position.data.length / 3;
    const index = entry.index === null || entry.index === undefined
      ? null
      : Array.isArray(entry.index) ? entry.index.map(Number) : [];
    if (index && (index.length === 0 || index.some((value) => (
      !Number.isInteger(value) || value < 0 || value >= vertexCount
    )))) return reject('Mesh snapshot indices must reference existing vertices.');
    const groups = Array.isArray(entry.groups) ? entry.groups.flatMap((group) => {
      const start = Math.round(Number(group?.start));
      const count = Math.round(Number(group?.count));
      const materialIndex = Math.max(0, Math.round(Number(group?.materialIndex) || 0));
      return start >= 0 && count > 0 ? [{ count, materialIndex, start }] : [];
    }) : [];
    const fillPatches = (Array.isArray(entry.fillPatches) ? entry.fillPatches : []).flatMap((patch) => {
      if (!Array.isArray(patch?.point) || patch.point.length !== 3 || !patch.point.every(Number.isFinite)) {
        return reject('Fill patches require a finite three-dimensional point.');
      }
      const geometry = meshSnapshotsOption([{ ...patch.geometry, fillPatches: [] }], null, { strict })[0];
      return geometry ? [{ point: [...patch.point], geometry }] : [];
    });
    return [{ attributes, groups, index, meshIndex: entry.meshIndex,
      ...(entry.variationOrigin ? { variationOrigin: variationOriginOption(entry.variationOrigin) } : {}),
      ...(fillPatches.length ? { fillPatches } : {}),
    }];
  });
}

function packMeshSnapshots(value) {
  return meshSnapshotsOption(value).map((entry) => {
    const attributes = Object.fromEntries(Object.entries(entry.attributes).map(([name, attribute]) => {
      const bytes = new Uint8Array(attribute.data.length * 4);
      const view = new DataView(bytes.buffer);
      for (let index = 0; index < attribute.data.length; index += 1) {
        view.setFloat32(index * 4, attribute.data[index], true);
      }
      return [name, {
        count: attribute.data.length / attribute.itemSize,
        data: bytesToBase64(bytes),
        encoding: ROCKGEN_MESH_SNAPSHOT_FLOAT_ENCODING,
        itemSize: attribute.itemSize,
        normalized: attribute.normalized,
      }];
    }));
    let index = null;
    if (entry.index) {
      const bytes = new Uint8Array(entry.index.length * 4);
      const view = new DataView(bytes.buffer);
      for (let offset = 0; offset < entry.index.length; offset += 1) {
        view.setUint32(offset * 4, entry.index[offset], true);
      }
      index = {
        count: entry.index.length,
        data: bytesToBase64(bytes),
        encoding: ROCKGEN_MESH_SNAPSHOT_INDEX_ENCODING,
      };
    }
    return {
      attributes,
      groups: entry.groups,
      index,
      meshIndex: entry.meshIndex,
      ...(entry.variationOrigin ? { variationOrigin: variationOriginOption(entry.variationOrigin) } : {}),
      ...(entry.fillPatches?.length ? { fillPatches: entry.fillPatches.map((patch) => ({
        point: patch.point,
        geometry: packMeshSnapshots([patch.geometry])[0],
      })) } : {}),
    };
  });
}

function meshOperationOrderOption(value, meshEdits, meshCuts, { strict = false } = {}) {
  const fallback = [
    ...meshEdits.map((_, index) => ({ index, type: 'sculpt' })),
    ...meshCuts.map((_, index) => ({ index, type: 'drill' })),
  ];
  if (!Array.isArray(value)) return fallback;
  const seen = new Set();
  const normalized = [];
  for (const entry of value) {
    const type = entry?.type === 'drill' ? 'drill' : entry?.type === 'sculpt' ? 'sculpt' : null;
    const index = Math.round(Number(entry?.index));
    const limit = type === 'drill' ? meshCuts.length : meshEdits.length;
    const key = `${type}:${index}`;
    if (!type || !Number.isFinite(index) || index < 0 || index >= limit || seen.has(key)) {
      if (strict) throw new Error('Mesh operation order contains an invalid or duplicate operation reference.');
      return fallback;
    }
    seen.add(key);
    normalized.push({ index, type });
  }
  if (normalized.length !== fallback.length) {
    if (strict) throw new Error('Mesh operation order must reference every sculpt and drill operation exactly once.');
    return fallback;
  }
  return normalized;
}

function stableJsonValue(value) {
  if (Array.isArray(value)) return `[${value.map(stableJsonValue).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJsonValue(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function fnv1a64(value) {
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}

/** Deterministic browser-safe identity for the complete saved C8 control/high/semantic authority. */
export function createC8ReferenceAuthoritySourceId(reference) {
  if (reference?.sourceMode !== 'c8-custom-mesh' || !reference.customMeshSource) return null;
  return `c8-authority-v1:fnv1a64:${fnv1a64(stableJsonValue(reference.customMeshSource))}`;
}

/** Deterministic browser-safe identity for the exact live C8 control geometry. */
export function createC8ReferenceGeometrySourceId(reference) {
  if (reference?.sourceMode !== 'c8-custom-mesh' || !reference.customMeshSource?.control) return null;
  const payload = {
    authoritySourceId: createC8ReferenceAuthoritySourceId(reference),
    controlContentHash: reference.customMeshSource.control.contentHash,
    controlTopologyHash: reference.customMeshSource.control.topologyHash,
    meshCuts: reference.meshCuts ?? [],
    meshEdits: reference.meshEdits ?? [],
    meshOperationOrder: reference.meshOperationOrder ?? [],
    meshSnapshots: reference.meshSnapshots ?? [],
    variation: Number(reference.variation) || 0,
    variationSeed: Math.round(Number(reference.variationSeed) || 0) >>> 0,
    ...(reference.variationSettings ? { variationSettings: variationSettingsOption(reference.variationSettings) } : {}),
  };
  return `c8-geometry-v2:fnv1a64:${fnv1a64(stableJsonValue(payload))}`;
}

/** Surface derivative identity, separate from geometry and explicit about the C7 recipe. */
export function createC8ReferenceSurfaceSourceId(reference) {
  if (reference?.sourceMode !== 'c8-custom-mesh') return null;
  const payload = {
    authoritySourceId: createC8ReferenceAuthoritySourceId(reference),
    geometrySourceId: reference.geometrySourceId ?? createC8ReferenceGeometrySourceId(reference),
    geology: String(reference.geology ?? ''),
    surfaceMode: reference.surfaceMode === 'generated' ? 'generated' : 'source',
    surfacePackage: reference.surfacePackage ?? null,
    topFinish: reference.topFinish ?? 'source',
  };
  return `c8-surface-v1:fnv1a64:${fnv1a64(stableJsonValue(payload))}`;
}

function c8SurfaceReprojectionOption(value, {
  authoritySourceId,
  controlContentHash,
  geometrySourceId,
  geology,
  meshEditCount,
  sourceId,
  sourceRevision,
  surfacePackage,
  surfaceSourceId,
}) {
  if (value === null || value === undefined) return null;
  if (!value || typeof value !== 'object'
    || value.schema !== 'toonlab/c8-surface-reprojection'
    || Number(value.version) !== 1
    || value.method !== 'deterministic-metre-triplanar-map-reprojection'
    || value.trueHighToLowBake !== false) {
    throw new Error('C8 surface reprojection metadata must use the deterministic metre-triplanar schema and can never claim a true high-to-low bake.');
  }
  if (Number(value.sourceRevision) !== sourceRevision) {
    throw new Error('C8 surface reprojection metadata is stale for the saved source revision.');
  }
  if (value.controlContentHash && value.controlContentHash !== controlContentHash) {
    throw new Error('C8 surface reprojection metadata is stale for the admitted control GLB.');
  }
  if (value.geometrySourceId && value.geometrySourceId !== geometrySourceId) {
    throw new Error('C8 surface reprojection metadata is stale for the saved geometry content ID.');
  }
  if (value.authoritySourceId && value.authoritySourceId !== authoritySourceId) {
    throw new Error('C8 surface reprojection metadata is stale for the complete control/high authority.');
  }
  if (value.surfaceSourceId && value.surfaceSourceId !== surfaceSourceId) {
    throw new Error('C8 surface reprojection metadata is stale for the saved surface recipe.');
  }
  const dimensionsMetres = vector3Option(value.dimensionsMetres ?? value.projection?.dimensionsMetres, [0, 0, 0]);
  if (dimensionsMetres.some((entry) => entry <= 0)) throw new Error('C8 surface reprojection requires positive metre dimensions.');
  const projection = value.projection;
  const scaleMetres = Number(projection?.scaleMetres);
  const axisScale = vector3Option(projection?.axisScale, [0, 0, 0]);
  if (projection?.mode !== 'world-metre-triplanar-isotropic'
    || !Number.isFinite(scaleMetres) || scaleMetres <= 0
    || axisScale.some((entry) => Math.abs(entry - scaleMetres) > 1e-9)) {
    throw new Error('C8 surface reprojection must remain metre-isotropic on all three axes.');
  }
  const expectedProjection = resolveC7Projection({ dimensionsMetres, geology });
  if (stableJsonValue(projection) !== stableJsonValue(expectedProjection)) {
    throw new Error('C8 surface reprojection projection must be deterministically derived from its saved metre dimensions and geology.');
  }
  const mapResolution = Math.round(Number(value.mapResolution));
  if (!Number.isInteger(mapResolution) || mapResolution < 32 || mapResolution > 2048) {
    throw new Error('C8 surface reprojection resolution must be between 32 and 2048.');
  }
  const resolvedGeology = String(value.geology ?? '').trim();
  if (!resolvedGeology || resolvedGeology !== geology) throw new Error('C8 surface reprojection geology does not match its saved surface package.');
  const resolvedSeed = Math.round(Number(value.seed) || 0) >>> 0;
  if (!surfacePackage || surfacePackage.geology !== resolvedGeology
    || surfacePackage.mapResolution !== mapResolution || surfacePackage.seed !== resolvedSeed) {
    throw new Error('C8 surface reprojection must exactly match the saved C7 geology surface package.');
  }
  const record = {
    authoritySourceId,
    controlContentHash,
    dimensionsMetres,
    editOperationCount: meshEditCount,
    geology: resolvedGeology,
    geometrySourceId,
    mapResolution,
    method: 'deterministic-metre-triplanar-map-reprojection',
    projection: structuredClone(expectedProjection),
    schema: 'toonlab/c8-surface-reprojection',
    seed: resolvedSeed,
    sourceContentId: geometrySourceId,
    sourceId,
    sourceRevision,
    surfaceSourceId,
    trueHighToLowBake: false,
    version: 1,
  };
  return { ...record, reprojectionContentId: `c8-reprojection-v1:fnv1a64:${fnv1a64(stableJsonValue(record))}` };
}

function portableDerivedArtifactState(value, {
  authoritySourceId,
  customMeshSource,
  geometrySourceId,
  sourceRevision,
  surfaceReprojection,
  surfaceSourceId,
}) {
  const source = value && typeof value === 'object' ? value : {};
  const result = {};
  for (const role of ['collision', 'geometricResidual', 'lods', 'pbrBake', 'runtimePackage']) {
    const entry = source[role] && typeof source[role] === 'object' ? source[role] : {};
    const status = entry.status === 'current' ? 'current' : 'stale';
    if (status === 'current') {
      const boundGeometryId = entry.geometrySourceId ?? entry.sourceGeometryContentId ?? entry.sourceContentId;
      if (boundGeometryId !== geometrySourceId || !contentHashOption(entry.contentHash)
        || entry.authoritySourceId !== authoritySourceId
        || Number(entry.sourceRevision) !== sourceRevision) {
        throw new Error(`Current C8 ${role} metadata must carry a content hash bound to the exact geometry source ID.`);
      }
      if (['pbrBake', 'runtimePackage'].includes(role) && entry.surfaceSourceId !== surfaceSourceId) {
        throw new Error(`Current C8 ${role} metadata must be bound to the exact surface recipe ID.`);
      }
      if (role === 'pbrBake' && (entry.method !== 'blender-high-to-low-bake'
        || entry.trueHighToLowBake !== true
        || entry.highDetailContentHash !== customMeshSource.highDetail.contentHash)) {
        throw new Error('A current C8 PBR bake must be an explicit Blender high-to-low bake bound to the retained high-detail GLB.');
      }
      if (role === 'geometricResidual' && (entry.method !== 'blender-signed-high-to-lod-residual'
        || entry.highDetailContentHash !== customMeshSource.highDetail.contentHash)) {
        throw new Error('A current C8 geometric residual must be an explicit Blender signed high-to-LOD residual bound to the retained high-detail GLB.');
      }
    }
    result[role] = {
      authoritySourceId,
      contentHash: contentHashOption(entry.contentHash),
      geometrySourceId,
      reason: String(entry.reason ?? (status === 'current' ? 'verified-derived-artifact' : 'geometry-source-not-baked')),
      sourceRevision,
      status,
      ...(['pbrBake', 'runtimePackage'].includes(role) ? { surfaceSourceId } : {}),
      ...(role === 'pbrBake' && status === 'current' ? {
        highDetailContentHash: customMeshSource.highDetail.contentHash,
        method: 'blender-high-to-low-bake',
        trueHighToLowBake: true,
      } : {}),
      ...(role === 'geometricResidual' && status === 'current' ? {
        highDetailContentHash: customMeshSource.highDetail.contentHash,
        method: 'blender-signed-high-to-lod-residual',
      } : {}),
    };
  }
  result.surfaceReprojection = surfaceReprojection
    ? {
        authoritySourceId,
        contentHash: surfaceReprojection.reprojectionContentId,
        geometrySourceId,
        method: surfaceReprojection.method,
        sourceRevision,
        status: 'current',
        surfaceSourceId,
        trueHighToLowBake: false,
      }
    : {
        authoritySourceId,
        contentHash: null,
        geometrySourceId,
        reason: 'geometry-source-not-reprojected',
        sourceRevision,
        status: 'stale',
        surfaceSourceId,
        trueHighToLowBake: false,
      };
  return result;
}

function validateC8MeshEditSequence(meshEdits, customMeshSource) {
  const meshVertexCounts = customMeshSource.control.geometryAudit.meshVertexCounts;
  for (const edit of meshEdits) {
    const meshVertexCount = meshVertexCounts[edit.meshIndex];
    if (!Number.isInteger(meshVertexCount)) {
      throw new Error(`C8 sparse sculpt references missing control mesh ${edit.meshIndex}.`);
    }
    const operationVertices = new Set();
    for (const [vertexIndex, x, y, z] of edit.deltas) {
      if (vertexIndex >= meshVertexCount) {
        throw new Error(`C8 sparse sculpt references missing vertex ${vertexIndex} on control mesh ${edit.meshIndex}.`);
      }
      if (operationVertices.has(vertexIndex)) {
        throw new Error('C8 sparse sculpt operations may target each vertex only once.');
      }
      operationVertices.add(vertexIndex);
    }
  }
  return meshEdits;
}

function packMeshEdits(value) {
  const edits = meshEditsOption(value);
  if (edits.length === 0) return null;
  const deltaCount = edits.reduce((total, entry) => total + entry.deltas.length, 0);
  const bytes = new Uint8Array(4 + edits.length * 8 + deltaCount * 16);
  const view = new DataView(bytes.buffer);
  let offset = 0;
  const writeUint32 = (number) => {
    view.setUint32(offset, number >>> 0, true);
    offset += 4;
  };
  const writeFloat32 = (number) => {
    view.setFloat32(offset, number, true);
    offset += 4;
  };
  writeUint32(edits.length);
  for (const edit of edits) {
    writeUint32(edit.meshIndex);
    writeUint32(edit.deltas.length);
    for (const [vertexIndex, x, y, z] of edit.deltas) {
      writeUint32(vertexIndex);
      writeFloat32(x);
      writeFloat32(y);
      writeFloat32(z);
    }
  }
  return {
    data: bytesToBase64(bytes),
    deltaCount,
    encoding: ROCKGEN_MESH_EDIT_ENCODING,
    operationCount: edits.length,
  };
}

/**
 * Portable identity for a source-GLB project. Geometry stays outside the JSON
 * document; the document stores either the stable catalog id or the exact C8
 * control/high hashes, plus deterministic edit state needed to rebuild and
 * decode the source GLB.
 */
export function createRockReferenceIdentity(options = null) {
  if (!options || typeof options !== 'object') return null;
  const c8Intent = options.sourceMode === 'c8-custom-mesh'
    || (options.customMeshSource !== null && options.customMeshSource !== undefined);
  const id = String(options.id ?? '').trim();
  if (!id) {
    if (c8Intent) throw new Error('C8 custom-mesh documents require a stable source ID.');
    return null;
  }
  if (c8Intent && options.sourceMode !== 'c8-custom-mesh') {
    throw new Error('A C8 custom-mesh manifest cannot silently downgrade to a legacy mesh-template reference.');
  }
  const lodRatios = lodRatiosOption(options.lodRatios);
  const lodTriangles = lodTrianglesOption(
    options.lodTriangles,
    options.targetTriangles,
    lodRatios,
  );
  const topFinish = ['bare', 'custom', 'grass', 'sand', 'snow', 'source']
    .includes(options.topFinish)
    ? options.topFinish
    : 'source';
  const identityLandmarks = identityLandmarksOption(options.identityLandmarks);
  const customMeshSource = customMeshSourceOption(options.customMeshSource, identityLandmarks);
  if (options.sourceMode === 'c8-custom-mesh' && !customMeshSource) {
    throw new Error('C8 custom-mesh documents require valid content-bound control/high GLBs, landmarks, semantic regions, and edit bounds.');
  }
  if (options.sourceMode === 'c8-custom-mesh'
    && !String(options.geology ?? options.surfacePackage?.geology ?? '').trim()) {
    throw new Error('C8 custom-mesh documents require an explicit geology surface profile.');
  }
  const sourceMode = options.sourceMode === 'c8-custom-mesh' && customMeshSource
    ? 'c8-custom-mesh'
    : 'mesh-template';
  const sourceRevision = positiveInteger(options.sourceRevision, 1);
  if (sourceMode === 'c8-custom-mesh'
    && (customMeshSource.control.sourceRevision > sourceRevision
      || customMeshSource.highDetail.sourceRevision > sourceRevision)) {
    throw new Error('C8 control/high artifacts cannot claim a future source revision.');
  }
  const surfacePackage = surfacePackageOption(options.surfacePackage);
  const geology = String(options.geology ?? options.surfacePackage?.geology ?? '').trim();
  if (sourceMode === 'c8-custom-mesh' && (!surfacePackage || surfacePackage.geology !== geology)) {
    throw new Error('C8 custom-mesh documents require one exact saved C7 geology surface package.');
  }
  const meshCuts = meshCutsOption(options.meshCuts, { strict: true });
  const meshSnapshots = meshSnapshotsOption(options.meshSnapshots, options.meshSnapshotsPacked, {
    strict: options.sourceMode === 'c8-custom-mesh',
  });
  // Sparse edits made after a Boolean cut address the cut result rather than
  // the admitted control topology, so they cannot be range-checked against
  // the original manifest here. Runtime replay still audits every operation.
  const hasCuts = meshCuts.length > 0;
  const hasSnapshots = meshSnapshots.length > 0;
  let meshEdits = meshEditsOption(options.meshEdits, options.meshEditsPacked, {
    strict: sourceMode === 'c8-custom-mesh' && !hasCuts && !hasSnapshots,
  });
  if (sourceMode === 'c8-custom-mesh') {
    meshEdits = meshEdits.map((edit) => ({
      ...edit,
      deltas: edit.deltas.map(([vertexIndex, x, y, z]) => [vertexIndex, Math.fround(x), Math.fround(y), Math.fround(z)]),
    }));
    if (!hasCuts && !hasSnapshots) validateC8MeshEditSequence(meshEdits, customMeshSource);
  }
  const meshOperationOrder = meshOperationOrderOption(
    options.meshOperationOrder,
    meshEdits,
    meshCuts,
    { strict: true },
  );
  const maximumVariationStrength = sourceMode === 'c8-custom-mesh'
    ? customMeshSource.editEnvelope.maximumVariationStrength
    : 1;
  const variation = Math.min(Math.max(Number(options.variation) || 0, 0), maximumVariationStrength);
  const variationSeed = Math.round(Number(options.variationSeed) || 0) >>> 0;
  const surfaceMode = options.surfaceMode === 'generated' ? 'generated' : 'source';
  const authoritySourceId = sourceMode === 'c8-custom-mesh'
    ? createC8ReferenceAuthoritySourceId({ customMeshSource, sourceMode })
    : null;
  const geometrySourceId = sourceMode === 'c8-custom-mesh'
    ? createC8ReferenceGeometrySourceId({
        customMeshSource,
        meshCuts,
        meshEdits,
        meshOperationOrder,
        meshSnapshots,
        sourceMode,
        variation,
        variationSeed,
      })
    : null;
  const surfaceSourceId = sourceMode === 'c8-custom-mesh'
    ? createC8ReferenceSurfaceSourceId({
        customMeshSource,
        geology,
        geometrySourceId,
        sourceMode,
        surfaceMode,
        surfacePackage,
        topFinish,
      })
    : null;
  if (sourceMode === 'c8-custom-mesh'
    && ((options.authoritySourceId && options.authoritySourceId !== authoritySourceId)
      || (options.geometrySourceId && options.geometrySourceId !== geometrySourceId)
      || (options.surfaceSourceId && options.surfaceSourceId !== surfaceSourceId))) {
    throw new Error('Saved C8 authority, geometry, or surface identity is stale for the admitted source and edits.');
  }
  const surfaceReprojection = sourceMode === 'c8-custom-mesh'
    ? c8SurfaceReprojectionOption(options.surfaceReprojection, {
        authoritySourceId,
        controlContentHash: customMeshSource.control.contentHash,
        geology,
        geometrySourceId,
        meshEditCount: meshOperationOrder.length + meshSnapshots.length,
        sourceId: id,
        sourceRevision,
        surfacePackage,
        surfaceSourceId,
      })
    : null;
  const derivedArtifactState = sourceMode === 'c8-custom-mesh'
    ? portableDerivedArtifactState(options.derivedArtifactState, {
        authoritySourceId,
        customMeshSource,
        geometrySourceId,
        sourceRevision,
        surfaceReprojection,
        surfaceSourceId,
      })
    : null;
  return {
    archetype: String(options.archetype ?? '').trim(),
    catalogVersion: positiveInteger(options.catalogVersion, 1),
    family: String(options.family ?? '').trim(),
    id,
    lodRatios: lodTriangles.length > 0
      ? lodTriangles.map((triangles) => triangles / lodTriangles[0])
      : lodRatios,
    lodTriangles,
    meshCuts,
    meshEdits,
    meshOperationOrder,
    meshSnapshots,
    ...(sourceMode === 'c8-custom-mesh' ? {
      authoritySourceId,
      customMeshSource,
      derivedArtifactState,
      geology,
      geometrySourceId,
      identityLandmarks,
      label: String(options.label ?? id),
      sourceRevision,
      surfaceSourceId,
      surfaceReprojection,
      thumbnailUrl: String(options.thumbnailUrl ?? ''),
    } : {}),
    role: String(options.role ?? '').trim(),
    series: String(options.series ?? '').trim(),
    sourceMode,
    surfacePackage,
    surfaceMode,
    targetTriangles: positiveInteger(options.targetTriangles, lodTriangles[0] ?? 0),
    topFinish,
    variation,
    variationSeed,
    ...(options.variationSettings ? { variationSettings: variationSettingsOption(options.variationSettings) } : {}),
  };
}

function vector3Option(value, fallback) {
  if (Array.isArray(value) && value.length >= 3) {
    const parts = value.slice(0, 3).map(Number);
    if (parts.every(Number.isFinite)) return parts;
  }
  return [...fallback];
}

function createRockTransform(options = null) {
  const source = options && typeof options === 'object' ? options : {};
  const scale = vector3Option(source.scale, [1, 1, 1]).map((entry) => Math.max(entry, 0.001));
  return {
    position: vector3Option(source.position, [0, 0, 0]),
    rotation: vector3Option(source.rotation, [0, 0, 0]),
    scale,
  };
}

// Drawn outline for 'sketch' shapes: [[x, y], ...] in the piece's local XY
// plane (3+ points, implicit close). Invalid or missing -> null; the
// compiler falls back to the ellipsoid until an outline is drawn.
function outlineOption(value) {
  if (!Array.isArray(value) || value.length < 3) return null;
  const points = [];
  for (const entry of value) {
    if (!Array.isArray(entry) || entry.length < 2) return null;
    const px = Number(entry[0]);
    const py = Number(entry[1]);
    if (!Number.isFinite(px) || !Number.isFinite(py)) return null;
    points.push([px, py]);
  }
  return points;
}

function createCombine(options = null) {
  const source = options && typeof options === 'object' ? options : {};
  return {
    blend: Math.max(Number(source.blend) || 0, 0),
    op: COMBINE_OPS.includes(source.op) ? source.op : 'union',
  };
}

function helperOption(value) {
  if (!value || typeof value !== 'object') return null;
  const kind = String(value.kind ?? '').trim();
  return kind ? { kind } : null;
}

function nextId(prefix, entries) {
  let highest = 0;
  for (const entry of entries) {
    const match = /^\w+-(\d+)$/.exec(String(entry.id ?? ''));
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return `${prefix}-${highest + 1}`;
}

/**
 * Creates one rock piece. Accepts a registered piece-preset name, or a
 * partial piece object (`{ name, seed, combine, transform, shape, noise,
 * warp, facet, strata, falloff }`). Ids are assigned when the piece is
 * added to a document.
 */
export function createRockPiece(optionsOrPresetName = null) {
  let source = optionsOrPresetName;
  if (typeof source === 'string') {
    source = resolveRockgenPreset(source).piece;
  }
  source = source && typeof source === 'object' ? source : {};
  const helper = helperOption(source.helper);
  return {
    combine: createCombine(source.combine),
    ...(helper ? { helper } : {}),
    hidden: Boolean(source.hidden),
    id: typeof source.id === 'string' ? source.id : null,
    name: String(source.name ?? 'Rock'),
    outline: outlineOption(source.outline),
    seed: Math.round(Number(source.seed) || 0),
    transform: createRockTransform(source.transform),
    ...createRockPieceSettings(source),
  };
}

/**
 * Creates a rock document. `options` may be a preset name string or
 * `{ seed, preset, style, reference, name, pieces, sculptEdits, surface,
 * meshing }`.
 * With no explicit pieces, one piece is built from the preset (default
 * 'boulder').
 */
export function createRockDocument(options = null) {
  const source = typeof options === 'string'
    ? { preset: options }
    : options && typeof options === 'object' ? options : {};
  // Preset and style are portable identity, not merely Lab UI metadata. A
  // custom/scratch document may explicitly use `preset: null`; otherwise the
  // historical no-argument default remains Boulder.
  const presetId = source.preset === null ? null : normalizeRockgenPresetName(source.preset);
  const styleId = normalizeRockgenStyleName(source.style);
  const preset = resolveRockgenPreset(presetId ?? 'boulder', { style: styleId });

  const document = {
    meshing: createRockgenMeshingSettings(source.meshing ?? preset.meshing),
    name: String(source.name ?? preset.label ?? 'Untitled Rock'),
    pieces: [],
    preset: presetId,
    reference: createRockReferenceIdentity(source.reference),
    revision: 0,
    schemaVersion: ROCKGEN_PROJECT_SCHEMA_VERSION,
    sculptEdits: [],
    seed: Math.round(Number(source.seed) || 0) >>> 0,
    style: styleId,
    surface: createRockSurfaceSettings(source.surface ?? preset.surface),
    type: ROCKGEN_PROJECT_DOCUMENT_TYPE,
  };

  const pieceSources = Array.isArray(source.pieces) && source.pieces.length > 0
    ? source.pieces
    : preset.kind === 'document' && Array.isArray(preset.pieces) && preset.pieces.length > 0
      ? preset.pieces
      : [preset.piece ?? {}];
  for (const pieceSource of pieceSources) {
    addPieceToDocument(document, createRockPiece(pieceSource));
  }
  for (const edit of Array.isArray(source.sculptEdits) ? source.sculptEdits : []) {
    applySculptEdit(document, edit);
  }
  document.revision = 0;
  return document;
}

function rockValuesEqual(left, right) {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => rockValuesEqual(value, right[index]));
  }
  if (left && right && typeof left === 'object' && typeof right === 'object') {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    return leftKeys.length === rightKeys.length
      && leftKeys.every((key) => Object.hasOwn(right, key)
        && rockValuesEqual(left[key], right[key]));
  }
  return false;
}

function rebaseRockValue(current, oldBase, newBase) {
  if (rockValuesEqual(current, oldBase)) return structuredClone(newBase);
  if (Array.isArray(current)) {
    if (!Array.isArray(oldBase) || !Array.isArray(newBase)) return structuredClone(current);
    const keyedObjects = current.every((entry) => entry && typeof entry === 'object' && entry.id)
      && oldBase.every((entry) => entry && typeof entry === 'object' && entry.id)
      && newBase.every((entry) => entry && typeof entry === 'object' && entry.id);
    if (!keyedObjects) return structuredClone(current);
    const oldById = new Map(oldBase.map((entry) => [entry.id, entry]));
    const newById = new Map(newBase.map((entry) => [entry.id, entry]));
    return current.map((entry) => (
      oldById.has(entry.id) && newById.has(entry.id)
        ? rebaseRockValue(entry, oldById.get(entry.id), newById.get(entry.id))
        : structuredClone(entry)
    ));
  }
  if (current && typeof current === 'object'
    && oldBase && typeof oldBase === 'object'
    && newBase && typeof newBase === 'object') {
    return Object.fromEntries(Object.keys(current).map((key) => [
      key,
      Object.hasOwn(oldBase, key) && Object.hasOwn(newBase, key)
        ? rebaseRockValue(current[key], oldBase[key], newBase[key])
        : structuredClone(current[key]),
    ]));
  }
  return structuredClone(current);
}

/**
 * Apply another IP-wide rock style without replacing the selected asset or
 * destroying edits. Values still equal to the old style baseline adopt the
 * new baseline; authored differences remain intact.
 */
export function rebaseRockDocumentStyle(document, style = 'default') {
  const current = createRockDocument(document);
  const oldBase = createRockDocument({
    preset: current.preset,
    seed: current.seed,
    style: current.style,
  });
  const nextStyle = normalizeRockgenStyleName(style);
  const newBase = createRockDocument({
    preset: current.preset,
    seed: current.seed,
    style: nextStyle,
  });
  const rebased = rebaseRockValue(current, oldBase, newBase);
  const normalized = createRockDocument({
    ...rebased,
    preset: current.preset,
    reference: current.reference,
    style: nextStyle,
  });
  normalized.revision = Math.max(Number(document?.revision) || 0, 0) + 1;
  return normalized;
}

/** Marks the document dirty after direct settings mutation. */
export function bumpDocumentRevision(document) {
  document.revision += 1;
  return document.revision;
}

/** Adds a piece (assigning a unique id if needed) and returns it. */
export function addPieceToDocument(document, piece) {
  if (!piece.id || document.pieces.some((entry) => entry.id === piece.id)) {
    piece.id = nextId('piece', document.pieces);
  }
  document.pieces.push(piece);
  bumpDocumentRevision(document);
  return piece;
}

/** Removes a piece by id; returns true when a piece was removed. */
export function removePieceFromDocument(document, pieceId) {
  const index = document.pieces.findIndex((entry) => entry.id === pieceId);
  if (index === -1) return false;
  document.pieces.splice(index, 1);
  bumpDocumentRevision(document);
  return true;
}

/** Appends a sculpt edit (assigning a unique id) and returns it. */
export function applySculptEdit(document, edit) {
  const applied = {
    blend: Math.max(Number(edit.blend) || 0, 0),
    center: vector3Option(edit.center, [0, 0, 0]),
    end: edit.end ? vector3Option(edit.end, [0, 0, 0]) : null,
    id: null,
    radius: Math.max(Number(edit.radius) || 0.1, 0.001),
    shape: edit.shape === 'capsule' ? 'capsule' : 'sphere',
    tool: edit.tool === 'subtract' ? 'subtract' : 'add',
  };
  applied.id = nextId('edit', document.sculptEdits);
  document.sculptEdits.push(applied);
  bumpDocumentRevision(document);
  return applied;
}

/** Removes the most recent sculpt edit; returns it (or null). */
export function undoLastSculptEdit(document) {
  const edit = document.sculptEdits.pop() ?? null;
  if (edit) bumpDocumentRevision(document);
  return edit;
}

/** World-space AABB of the document's surface: `{ min: [3], max: [3] }`. */
export function computeDocumentBounds(document) {
  const { bounds } = compileDocument(document, { includeHelpers: false });
  return { max: [...bounds.max], min: [...bounds.min] };
}

/** Serializes a document to JSON (dropping the runtime `revision`). */
export function serializeRockDocument(document, { pretty = false } = {}) {
  const { revision, ...serializable } = document;
  if (isRockSourceMeshReference(serializable.reference)) {
    const { meshEdits, meshSnapshots, ...reference } = serializable.reference;
    serializable.reference = {
      ...reference,
      ...(meshEdits?.length > 0 ? { meshEditsPacked: packMeshEdits(meshEdits) } : { meshEdits: [] }),
      ...(meshSnapshots?.length > 0
        ? { meshSnapshotsPacked: packMeshSnapshots(meshSnapshots) }
        : { meshSnapshots: [] }),
    };
  }
  return JSON.stringify(serializable, null, pretty ? 2 : undefined);
}

// Ordered migrations: index N upgrades a version-N document to N+1.
// v2 moves the selected asset preset and IP-wide style into the portable
// project itself. Old projects had those values only in browser-local entry
// metadata, so standalone v1 JSON safely falls back to custom/default.
// v3 adds optional descriptor-only reference identity and its LOD contract.
// v4 adds sparse vertex deltas for editable source-mesh projects. v5 packs
// those deltas as float32 binary in portable JSON so normal sculpt sessions
// fit the hosted creation limit. v6 adds the optional deterministic C7 surface
// package identity used by the 480 source-mesh catalog. Existing
// preset/custom projects remain reference-free. v7 preserves the content-bound
// C8 control/high GLBs, semantic regions, landmarks, and derivative state. v8
// adds ordered, replayable Boolean drill cuts alongside sparse sculpt edits.
// v9 packs topology-changing geometry snapshots into portable base64 typed
// arrays so local drafts and hosted project payloads do not overflow JSON
// storage after remesh, union, subdivision, or fracture operations.
const MIGRATIONS = Object.freeze([
  (document) => ({
    ...document,
    preset: typeof document.preset === 'string' ? document.preset : null,
    schemaVersion: 2,
    style: typeof document.style === 'string' ? document.style : 'default',
  }),
  (document) => ({
    ...document,
    reference: document.reference && typeof document.reference === 'object'
      ? document.reference
      : null,
    schemaVersion: 3,
  }),
  (document) => ({
    ...document,
    reference: document.reference && typeof document.reference === 'object'
      ? { ...document.reference, meshEdits: document.reference.meshEdits ?? [] }
      : null,
    schemaVersion: 4,
  }),
  (document) => {
    if (!document.reference || typeof document.reference !== 'object') {
      return { ...document, schemaVersion: 5 };
    }
    const { meshEdits, ...reference } = document.reference;
    return {
      ...document,
      reference: {
        ...reference,
        ...(Array.isArray(meshEdits) && meshEdits.length > 0
          ? { meshEditsPacked: packMeshEdits(meshEdits) }
          : { meshEdits: [] }),
      },
      schemaVersion: 5,
    };
  },
  (document) => ({
    ...document,
    reference: document.reference && typeof document.reference === 'object'
      ? { ...document.reference, surfacePackage: document.reference.surfacePackage ?? null }
      : null,
    schemaVersion: 6,
  }),
  (document) => ({
    ...document,
    reference: document.reference && typeof document.reference === 'object'
      ? {
          ...document.reference,
          customMeshSource: document.reference.customMeshSource ?? null,
          derivedArtifactState: document.reference.derivedArtifactState ?? null,
          identityLandmarks: document.reference.identityLandmarks ?? [],
          sourceRevision: document.reference.sourceRevision ?? 1,
          surfaceReprojection: document.reference.surfaceReprojection ?? null,
        }
      : null,
    schemaVersion: 7,
  }),
  (document) => ({
    ...document,
    reference: document.reference && typeof document.reference === 'object'
      ? {
          ...document.reference,
          meshCuts: document.reference.meshCuts ?? [],
          meshOperationOrder: document.reference.meshOperationOrder ?? null,
        }
      : null,
    schemaVersion: 8,
  }),
  (document) => ({
    ...document,
    reference: document.reference && typeof document.reference === 'object'
      ? {
          ...document.reference,
          meshSnapshots: document.reference.meshSnapshots ?? [],
        }
      : null,
    schemaVersion: 9,
  }),
]);

/**
 * Parses, validates, and coerces a rock document from JSON (string or
 * already-parsed object). Unknown fields are dropped, missing fields get
 * defaults, and older schema versions are migrated. Throws with a
 * descriptive message on structural problems.
 */
export function deserializeRockDocument(jsonOrObject) {
  let source = jsonOrObject;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch (error) {
      throw new Error(`Invalid rock document JSON: ${error.message}`);
    }
  }
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new Error('Rock document must be a JSON object.');
  }
  if (source.type !== ROCKGEN_PROJECT_DOCUMENT_TYPE) {
    throw new Error(`Rock document type must be "${ROCKGEN_PROJECT_DOCUMENT_TYPE}".`);
  }
  let version = Number(source.schemaVersion);
  if (!Number.isFinite(version)) version = ROCKGEN_PROJECT_SCHEMA_VERSION;
  if (version > ROCKGEN_PROJECT_SCHEMA_VERSION) {
    throw new Error(
      `Rock document schema version ${version} is newer than supported version ${ROCKGEN_PROJECT_SCHEMA_VERSION}.`,
    );
  }
  let migrated = source;
  for (; version < ROCKGEN_PROJECT_SCHEMA_VERSION; version += 1) {
    migrated = MIGRATIONS[version - 1](migrated);
  }
  if (!Array.isArray(migrated.pieces) || migrated.pieces.length === 0) {
    throw new Error('Rock document must contain at least one piece.');
  }
  return createRockDocument({
    meshing: migrated.meshing,
    name: migrated.name,
    pieces: migrated.pieces,
    preset: migrated.preset,
    reference: migrated.reference,
    sculptEdits: migrated.sculptEdits,
    seed: migrated.seed,
    style: migrated.style,
    surface: migrated.surface,
  });
}
