// GLB export for legacy procedurally generated rocks. Exports carry the field-derived vertex
// colors and SDF ambient occlusion (asset-intrinsic self-occlusion only —
// no scene/ground contact baked in), so the asset is portable and re-imports
// into this repo's environment pipeline cleanly.
//
// Browser-only: GLTFExporter assembles the GLB container through FileReader,
// which node lacks. Everything else in the cluster (meshing, hashing,
// serialization) runs in node — see scripts/verify-rockgen.mjs.

import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

import { planRockLodMeshes } from '../lod/rockLodPlanner.js';
import { meshDocument } from '../mesh/meshDocument.js';

// glTF requires custom attribute names to start with an underscore.
const AO_EXPORT_ATTRIBUTE = '_ROCK_AO';

const LEGACY_PRESET_LOD_POLICY = Object.freeze({
  'basalt-columns': Object.freeze({ role: 'landmark', targetTriangles: 2048 }),
  boulder: Object.freeze({ role: 'boulder', targetTriangles: 320 }),
  'canyon-ridge': Object.freeze({ role: 'landmark', targetTriangles: 2048 }),
  'cliff-face': Object.freeze({ role: 'landmark', targetTriangles: 2048 }),
  'cliff-wall': Object.freeze({ role: 'landmark', targetTriangles: 2048 }),
  'column-arch': Object.freeze({ role: 'landmark', targetTriangles: 2048 }),
  'eroded-mesa': Object.freeze({ role: 'landmark', targetTriangles: 2048 }),
  'granite-boulder': Object.freeze({ role: 'boulder', targetTriangles: 320 }),
  'karst-spire': Object.freeze({ role: 'landmark', targetTriangles: 1280 }),
  'lowpoly-boulder': Object.freeze({ role: 'boulder', targetTriangles: 320 }),
  'mossy-boulder': Object.freeze({ role: 'boulder', targetTriangles: 320 }),
  'river-boulder': Object.freeze({ role: 'boulder', targetTriangles: 320 }),
  'scree-cluster': Object.freeze({ role: 'cluster', targetTriangles: 960 }),
  'sea-stack': Object.freeze({ role: 'landmark', targetTriangles: 1280 }),
  'shard-monolith': Object.freeze({ role: 'cliff', targetTriangles: 512 }),
});

function legacyLodPolicyForDocument(document) {
  return LEGACY_PRESET_LOD_POLICY[document?.preset]
    ?? Object.freeze({ role: 'boulder', targetTriangles: 320 });
}

/** Compact, JSON-safe LOD telemetry used by the Lab and glTF extras. */
export function summarizeRockLodPlan(plan, { levelCount = 3 } = {}) {
  const levels = plan.levels.slice(0, levelCount).map((level) => ({
    actualRatio: level.actualRatio,
    level: level.level,
    limitedByMinimum: level.limitedByMinimum,
    method: level.method ?? (level.level === 0 ? 'surface-nets' : null),
    removedVertices: level.removedVertices ?? 0,
    resolution: level.resolution,
    retainedTopology: level.retainedTopology,
    retentionReason: level.retentionReason,
    targetRatio: level.targetRatio,
    targetTriangles: level.targetTriangles,
    triangleBudget: level.triangleBudget,
    triangleCount: level.triangleCount,
  }));
  const relevantValidationEntries = (entries = []) => entries.filter((entry) => (
    entry.level === null || entry.level === undefined || entry.level < levelCount
  ));
  const validationErrors = relevantValidationEntries(plan.validation?.errors);
  const validationWarnings = relevantValidationEntries(plan.validation?.warnings);
  return {
    levels,
    policy: {
      ratios: [...plan.policy.ratios].slice(0, levelCount),
      role: plan.policy.role,
      triangleBudgets: [...plan.policy.triangleBudgets].slice(0, levelCount),
    },
    sampledResolutions: [...plan.sampledResolutions],
    valid: plan.validation ? validationErrors.length === 0 : null,
    validationErrors: validationErrors.map((entry) => entry.text),
    validationWarnings: validationWarnings.map((entry) => entry.text),
  };
}

function packAoIntoColorAlpha(geometry) {
  const color = geometry.getAttribute('color');
  const ao = geometry.getAttribute('envVertexAo');
  const rgba = new Float32Array((color.count) * 4);
  for (let v = 0; v < color.count; v += 1) {
    rgba[v * 4] = color.getX(v);
    rgba[v * 4 + 1] = color.getY(v);
    rgba[v * 4 + 2] = color.getZ(v);
    rgba[v * 4 + 3] = ao ? ao.getX(v) : 1;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(rgba, 4));
}

/**
 * Prepares an export copy of a rockgen geometry: AO is packed per `ao` —
 * 'colorAlpha' (default; COLOR_0 alpha, portable and round-trippable),
 * 'attribute' (`_ROCK_AO` custom attribute for in-house pipelines), or
 * 'omit'. The nonstandard `envVertexAo` attribute never ships raw.
 */
// Box-projection UVs from the bounding box: each vertex projects along
// its normal's dominant axis. Seams land on the (already sharp) axis
// creases — fine for detail/tiling textures; engines wanting seamless
// texturing should triplanar in-shader instead.
function addBoxProjectionUvs(geometry) {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const size = [
    Math.max(box.max.x - box.min.x, 1e-6),
    Math.max(box.max.y - box.min.y, 1e-6),
    Math.max(box.max.z - box.min.z, 1e-6),
  ];
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const uv = new Float32Array(position.count * 2);
  for (let v = 0; v < position.count; v += 1) {
    const nx = Math.abs(normal.getX(v));
    const ny = Math.abs(normal.getY(v));
    const nz = Math.abs(normal.getZ(v));
    let u;
    let w;
    if (nx >= ny && nx >= nz) {
      u = (position.getZ(v) - box.min.z) / size[2];
      w = (position.getY(v) - box.min.y) / size[1];
    } else if (ny >= nx && ny >= nz) {
      u = (position.getX(v) - box.min.x) / size[0];
      w = (position.getZ(v) - box.min.z) / size[2];
    } else {
      u = (position.getX(v) - box.min.x) / size[0];
      w = (position.getY(v) - box.min.y) / size[1];
    }
    uv[v * 2] = u;
    uv[v * 2 + 1] = w;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

export function prepareGeometryForExport(geometry, { ao = 'colorAlpha', uv = 'none' } = {}) {
  const exportGeometry = geometry.clone();
  if (ao === 'colorAlpha' && exportGeometry.getAttribute('color')) {
    packAoIntoColorAlpha(exportGeometry);
  } else if (ao === 'attribute' && exportGeometry.getAttribute('envVertexAo')) {
    exportGeometry.setAttribute(AO_EXPORT_ATTRIBUTE, exportGeometry.getAttribute('envVertexAo'));
  }
  exportGeometry.deleteAttribute('envVertexAo');
  if (uv === 'box') addBoxProjectionUvs(exportGeometry);
  return exportGeometry;
}

/**
 * Exports a geometry (or a ready-made mesh/scene) as a binary GLB.
 * Geometries are wrapped in a vertex-colored standard material so viewers
 * outside this repo show the baked look.
 *
 * @returns {Promise<ArrayBuffer>}
 */
export async function exportGeometryToGLB(geometryOrObject, {
  ao = 'colorAlpha', name = 'rock', uv = 'none',
} = {}) {
  let target = geometryOrObject;
  if (target?.isBufferGeometry) {
    const material = new THREE.MeshStandardMaterial({
      metalness: 0,
      roughness: 0.95,
      vertexColors: true,
    });
    target = new THREE.Mesh(prepareGeometryForExport(target, { ao, uv }), material);
    target.name = name;
  }
  const exporter = new GLTFExporter();
  return exporter.parseAsync(target, { binary: true });
}

/**
 * Meshes the document at export resolution and exports it as GLB.
 *
 * With `lods` (default: the document's meshing.exportLods, on unless
 * disabled) the GLB carries meshes named <name>_LOD0/1/2. Each level is an
 * independent SDF re-mesh selected by adaptive triangle-budget search (about
 * 100% / 50% / 25% of LOD0), not by blindly halving grid resolution. This
 * keeps clean toon silhouettes and correctly baked colors/AO at every level.
 *
 * `uv: 'box'` adds box-projection UVs for detail textures (see
 * addBoxProjectionUvs for the trade-off).
 *
 * @returns {Promise<ArrayBuffer>}
 */
export async function exportDocumentToGLB(document, {
  ao = 'colorAlpha',
  lodPolicy = null,
  lods = null,
  name = null,
  normals = null,
  onLodPlan = null,
  resolution = null,
  strictLods = null,
  uv = 'none',
} = {}) {
  if (document?.reference?.sourceMode === 'mesh-template') {
    throw new Error(
      'Source-mesh rock references must be exported with exportRockReferenceAssetToGLB() '
      + 'so their authored geometry, UVs, materials, and LODs are preserved.',
    );
  }
  const exportResolution = resolution ?? document.meshing.exportResolution;
  const exportName = name ?? document.name;
  const wantLods = lods ?? document.meshing.exportLods !== false;

  const makeMesh = (geometry, meshName) => {
    const material = new THREE.MeshStandardMaterial({
      metalness: 0,
      roughness: 0.95,
      vertexColors: true,
    });
    const mesh = new THREE.Mesh(prepareGeometryForExport(geometry, { ao, uv }), material);
    mesh.name = meshName;
    return mesh;
  };

  if (!wantLods) {
    const geometry = meshDocument(document, { includeHelpers: false, normals, resolution: exportResolution });
    return exportGeometryToGLB(geometry, { ao, name: exportName, uv });
  }

  const requestedLevelCount = Array.isArray(document.reference?.lodRatios)
    ? Math.min(Math.max(document.reference.lodRatios.length, 1), 3)
    : 3;
  const resolvedPolicy = lodPolicy
    ?? (document.reference ? null : legacyLodPolicyForDocument(document));
  const plan = planRockLodMeshes(document, {
    maxResolution: exportResolution,
    meshOptions: {
      normals,
    },
    policy: resolvedPolicy,
  });
  const report = summarizeRockLodPlan(plan, { levelCount: requestedLevelCount });
  onLodPlan?.(report);
  const shouldRejectInvalid = strictLods ?? Boolean(document.reference);
  if (shouldRejectInvalid && report.valid === false) {
    throw new Error(`Rock LOD validation failed: ${report.validationErrors.join(' ')}`);
  }

  const root = new THREE.Group();
  root.name = exportName;
  root.userData.toonlabRockLod = report;
  plan.levels.slice(0, requestedLevelCount).forEach((planned) => {
    const mesh = makeMesh(planned.geometry, `${exportName}_LOD${planned.level}`);
    mesh.userData.toonlabRockLod = {
      level: planned.level,
      resolution: planned.resolution,
      targetTriangles: planned.targetTriangles,
      triangleBudget: planned.triangleBudget,
      triangleCount: planned.triangleCount,
    };
    root.add(mesh);
  });
  const exporter = new GLTFExporter();
  return exporter.parseAsync(root, { binary: true });
}

/** Browser download helper for exported buffers (no-op outside browsers). */
export function downloadArrayBuffer(buffer, filename, mimeType = 'application/octet-stream') {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const blob = new Blob([buffer], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
