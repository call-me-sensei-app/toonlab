// Repository-only generic compiler contract. Families provide their own low
// and detailed sources; this module owns meshing handoff, UV atlas, channel
// bake, acceptance reporting, and deterministic artifact identity.

import { hashGeometry } from '../mesh/meshDocument.js';
import { auditIndexedMesh, evaluateGenericRockGate } from './meshAudit.js';
import { createSixChartRockAtlas } from './surfaceAtlas.js';
import { bakeRockSurface } from './surfaceBakeCompiler.js';

export const REALISTIC_ROCK_ARTIFACT_TYPE = 'toonlab/experimental-baked-rock';
export const REALISTIC_ROCK_ARTIFACT_VERSION = 1;

function hashBytes(chunks) {
  let hash = 0x811c9dc5;
  for (const chunk of chunks) {
    const bytes = new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    for (let index = 0; index < bytes.length; index += 1) {
      hash ^= bytes[index];
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
  }
  return hash.toString(16).padStart(8, '0');
}

function serializeGeometry(geometry) {
  return {
    index: Array.from(geometry.index.array),
    normal: Array.from(geometry.getAttribute('normal').array),
    position: Array.from(geometry.getAttribute('position').array),
    uv: Array.from(geometry.getAttribute('uv').array),
  };
}

export function compileRealisticRock(source, {
  atlasResolution = 512,
  meshResolution = 52,
  rejectUnqualified = true,
} = {}) {
  if (!source || typeof source.createLowGeometry !== 'function'
    || typeof source.evaluateHigh !== 'function') {
    throw new Error('Realistic rock compilation requires a valid high/low source profile.');
  }
  const started = performance.now();
  const lowGeometry = source.createLowGeometry(meshResolution);
  const geometryAudit = auditIndexedMesh(lowGeometry);
  const familyGate = (source.evaluateFamilyGate ?? evaluateGenericRockGate)(geometryAudit);
  if (rejectUnqualified && !familyGate.accepted) {
    lowGeometry.dispose();
    throw new Error(
      `${source.family} seed ${source.seed} failed its family gate: ${familyGate.failures.join('; ')}`,
    );
  }

  const atlas = createSixChartRockAtlas(lowGeometry, { atlasResolution });
  const bake = bakeRockSurface({
    atlas,
    atlasResolution,
    evaluateHigh: source.evaluateHigh,
    maxProjectionDistance: source.maxProjectionDistance,
    regionAt: source.regionAt,
  });
  const bakeFailures = [];
  if (bake.stats.hitRate < 0.985) bakeFailures.push('surface trace hit rate is below 98.5%');
  if (bake.stats.atlasCoverage < 0.06) bakeFailures.push('atlas coverage is below 6%');
  if (bake.stats.projectionConflictRate > 0.025) {
    bakeFailures.push('six-chart projection conflict rate exceeds 2.5%');
  }
  const acceptance = {
    ...familyGate,
    accepted: familyGate.accepted && bakeFailures.length === 0,
    bakeFailures,
  };
  if (rejectUnqualified && !acceptance.accepted) {
    atlas.geometry.dispose();
    lowGeometry.dispose();
    throw new Error(
      `${source.family} seed ${source.seed} failed its bake gate: ${bakeFailures.join('; ')}`,
    );
  }
  const geometryHash = hashGeometry(atlas.geometry);
  const contentHash = hashBytes([
    atlas.geometry.getAttribute('position').array,
    atlas.geometry.getAttribute('normal').array,
    atlas.geometry.getAttribute('uv').array,
    atlas.geometry.index.array,
    bake.normalAo,
    bake.surface,
  ]);
  atlas.geometry.computeBoundingBox();
  const bounds = atlas.geometry.boundingBox;
  const manifest = {
    acceptance,
    atlas: {
      gutterTexels: atlas.gutterTexels,
      height: bake.height,
      layout: 'six-chart-box-3x2',
      stats: bake.stats,
      width: bake.width,
    },
    bounds: {
      max: bounds.max.toArray(),
      min: bounds.min.toArray(),
    },
    buildMs: Math.round((performance.now() - started) * 10) / 10,
    channels: {
      normalAo: ['normal-object-x', 'normal-object-y', 'normal-object-z', 'ambient-occlusion'],
      surface: ['signed-height', 'signed-curvature', 'semantic-region', 'coverage'],
    },
    compiler: 'toonlab-high-to-low-v1',
    contentHash,
    family: source.family,
    geology: source.geology,
    geometry: {
      hash: geometryHash,
      sourceAudit: geometryAudit,
      triangles: atlas.geometry.index.count / 3,
      vertices: atlas.geometry.getAttribute('position').count,
    },
    meshResolution,
    provenance: 'ToonLab-owned procedural field, QEF surface nets, atlas, and channel bake',
    seed: source.seed,
    type: REALISTIC_ROCK_ARTIFACT_TYPE,
    variation: source.variation,
    version: REALISTIC_ROCK_ARTIFACT_VERSION,
  };

  const artifact = {
    bake,
    geometry: serializeGeometry(atlas.geometry),
    manifest,
  };
  atlas.geometry.dispose();
  lowGeometry.dispose();
  return artifact;
}
