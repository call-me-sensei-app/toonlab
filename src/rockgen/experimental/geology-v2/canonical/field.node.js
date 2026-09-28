import { contentId } from '../canonical.node.js';
import { clamp, hash01, smootherstep01 } from '../structure/math.node.js';
import {
  deriveC8EditedBoundsMetres,
  validateEditableSourcePackage,
} from './sourcePackage.node.js';
import { assertVerifiedC8CustomMeshAuthority } from './customMeshSampler.node.js';

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothMinimum(a, b, radius) {
  if (!Number.isFinite(a)) return b;
  if (!Number.isFinite(b)) return a;
  if (!(radius > 0)) return Math.min(a, b);
  const h = clamp(0.5 + 0.5 * (b - a) / radius, 0, 1);
  return lerp(b, a, h) - radius * h * (1 - h);
}

function smoothMaximum(a, b, radius) {
  return -smoothMinimum(-a, -b, radius);
}

function rotateX(point, radians) {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return [point[0], point[1] * cosine - point[2] * sine, point[1] * sine + point[2] * cosine];
}

function rotateY(point, radians) {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return [point[0] * cosine - point[2] * sine, point[1], point[0] * sine + point[2] * cosine];
}

function rotateZ(point, radians) {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return [point[0] * cosine - point[1] * sine, point[0] * sine + point[1] * cosine, point[2]];
}

function primitivePoint(worldPoint, primitive) {
  let point = worldPoint.map((value, axis) => value - primitive.centerMetres[axis]);
  point = rotateZ(point, -primitive.rotationDegrees[2] * Math.PI / 180);
  point = rotateY(point, -primitive.rotationDegrees[1] * Math.PI / 180);
  point = rotateX(point, -primitive.rotationDegrees[0] * Math.PI / 180);
  return point;
}

function signedDistanceRoundedBox(point, halfExtents, radius) {
  const safeRadius = Math.min(radius, ...halfExtents);
  const q = point.map((value, axis) => Math.abs(value) - halfExtents[axis] + safeRadius);
  return Math.hypot(Math.max(q[0], 0), Math.max(q[1], 0), Math.max(q[2], 0))
    + Math.min(Math.max(q[0], q[1], q[2]), 0) - safeRadius;
}

function signedDistanceEllipsoid(point, radii) {
  const k0 = Math.hypot(...point.map((value, axis) => value / radii[axis]));
  const k1 = Math.hypot(...point.map((value, axis) => value / (radii[axis] * radii[axis])));
  return k1 > 1e-12 ? k0 * (k0 - 1) / k1 : -Math.min(...radii);
}

function signedDistanceSuperellipsoid(point, primitive) {
  const normalized = point.map((value, axis) => Math.abs(value / primitive.radiiMetres[axis]));
  const norm = normalized.reduce((sum, value) => sum + value ** primitive.exponent, 0) ** (1 / primitive.exponent);
  return (norm - 1) * Math.min(...primitive.radiiMetres);
}

function signedDistancePolygon2(point, vertices) {
  let minimumSquared = Infinity;
  let inside = false;
  for (let index = 0, previous = vertices.length - 1; index < vertices.length; previous = index, index += 1) {
    const a = vertices[previous];
    const b = vertices[index];
    const edge = [b[0] - a[0], b[1] - a[1]];
    const relative = [point[0] - a[0], point[1] - a[1]];
    const fraction = clamp((relative[0] * edge[0] + relative[1] * edge[1]) / Math.max(edge[0] ** 2 + edge[1] ** 2, 1e-12), 0, 1);
    const delta = [relative[0] - edge[0] * fraction, relative[1] - edge[1] * fraction];
    minimumSquared = Math.min(minimumSquared, delta[0] ** 2 + delta[1] ** 2);
    const crosses = (a[1] > point[1]) !== (b[1] > point[1]);
    if (crosses && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / Math.max(Math.abs(b[1] - a[1]), 1e-12) * Math.sign(b[1] - a[1]) + a[0]) {
      inside = !inside;
    }
  }
  return Math.sqrt(minimumSquared) * (inside ? -1 : 1);
}

function signedDistanceExtrudedPolygon(point, primitive) {
  const silhouette = signedDistancePolygon2([point[0], point[1]], primitive.verticesMetres);
  const depth = Math.abs(point[2]) - primitive.halfDepthMetres;
  return Math.hypot(Math.max(silhouette, 0), Math.max(depth, 0)) + Math.min(Math.max(silhouette, depth), 0);
}

function signedDistancePolygonalLoft(point, primitive) {
  const levels = primitive.levels;
  let lower = levels[0];
  let upper = levels[1];
  if (point[1] >= levels.at(-1).yMetres) {
    lower = levels.at(-2);
    upper = levels.at(-1);
  } else if (point[1] > levels[0].yMetres) {
    for (let index = 1; index < levels.length; index += 1) {
      lower = levels[index - 1];
      upper = levels[index];
      if (point[1] <= upper.yMetres) break;
    }
  }
  const fraction = clamp((point[1] - lower.yMetres) / Math.max(upper.yMetres - lower.yMetres, 1e-9), 0, 1);
  const crossSection = lerp(
    signedDistancePolygon2([point[0], point[2]], lower.verticesMetres),
    signedDistancePolygon2([point[0], point[2]], upper.verticesMetres),
    fraction,
  );
  const vertical = Math.max(levels[0].yMetres - point[1], point[1] - levels.at(-1).yMetres);
  return Math.hypot(Math.max(crossSection, 0), Math.max(vertical, 0))
    + Math.min(Math.max(crossSection, vertical), 0);
}

function signedDistanceTaperedColumn(point, primitive) {
  const halfHeight = primitive.halfHeightMetres;
  const normalizedHeight = clamp((point[1] + halfHeight) / (halfHeight * 2), 0, 1);
  const radiusX = lerp(primitive.baseRadiiMetres[0], primitive.topRadiiMetres[0], normalizedHeight);
  const radiusZ = lerp(primitive.baseRadiiMetres[1], primitive.topRadiiMetres[1], normalizedHeight);
  const radial = (Math.hypot(point[0] / radiusX, point[2] / radiusZ) - 1) * Math.min(radiusX, radiusZ);
  const vertical = Math.abs(point[1]) - halfHeight;
  return Math.hypot(Math.max(radial, 0), Math.max(vertical, 0)) + Math.min(Math.max(radial, vertical), 0);
}

function signedDistanceTaperedBox(point, primitive) {
  const halfHeight = primitive.halfHeightMetres;
  const normalizedHeight = clamp((point[1] + halfHeight) / (halfHeight * 2), 0, 1);
  const offsetX = primitive.topOffsetMetres[0] * normalizedHeight;
  const offsetZ = primitive.topOffsetMetres[1] * normalizedHeight;
  const halfX = lerp(primitive.bottomHalfExtentsMetres[0], primitive.topHalfExtentsMetres[0], normalizedHeight);
  const halfZ = lerp(primitive.bottomHalfExtentsMetres[1], primitive.topHalfExtentsMetres[1], normalizedHeight);
  return signedDistanceRoundedBox(
    [point[0] - offsetX, point[1], point[2] - offsetZ],
    [halfX, halfHeight, halfZ],
    primitive.roundingMetres,
  );
}

function signedDistanceProfiledColumn(point, primitive) {
  const levels = primitive.levels;
  let lower = levels[0];
  let upper = levels[1];
  for (let index = 1; index < levels.length; index += 1) {
    lower = levels[index - 1];
    upper = levels[index];
    if (point[1] <= upper.yMetres) break;
  }
  const fraction = clamp((point[1] - lower.yMetres) / Math.max(upper.yMetres - lower.yMetres, 1e-9), 0, 1);
  const halfX = lerp(lower.halfExtentsMetres[0], upper.halfExtentsMetres[0], fraction);
  const halfZ = lerp(lower.halfExtentsMetres[1], upper.halfExtentsMetres[1], fraction);
  const offsetX = lerp(lower.offsetMetres[0], upper.offsetMetres[0], fraction);
  const offsetZ = lerp(lower.offsetMetres[1], upper.offsetMetres[1], fraction);
  const vertical = Math.max(levels[0].yMetres - point[1], point[1] - levels.at(-1).yMetres);
  const radius = Math.min(primitive.roundingMetres, halfX, halfZ, (levels.at(-1).yMetres - levels[0].yMetres) * 0.5);
  const q = [Math.abs(point[0] - offsetX) - halfX + radius, vertical + radius, Math.abs(point[2] - offsetZ) - halfZ + radius];
  return Math.hypot(Math.max(q[0], 0), Math.max(q[1], 0), Math.max(q[2], 0))
    + Math.min(Math.max(q[0], q[1], q[2]), 0) - radius;
}

function evaluatePrimitive(point, primitive, customMeshBinding = null, sparseSculptDeltas = []) {
  const local = primitivePoint(point, primitive);
  if (primitive.kind === 'custom-mesh') {
    if (!customMeshBinding || typeof customMeshBinding.evaluateSignedDistanceMetres !== 'function') {
      throw Object.assign(new Error(`No content-bound signed-distance sampler is available for ${primitive.artifactId}.`), {
        code: 'missing-custom-mesh-sampler',
        details: { artifactId: primitive.artifactId },
      });
    }
    const scaled = local.map((value, axis) => value / primitive.scale[axis]);
    const distance = customMeshBinding.evaluateSignedDistanceMetres(scaled, {
      primitive,
      sparseSculptDeltas,
    });
    if (!Number.isFinite(distance)) {
      throw Object.assign(new Error(`Custom-mesh sampler ${primitive.artifactId} returned a non-finite distance.`), {
        code: 'invalid-custom-mesh-distance',
      });
    }
    return distance * Math.min(...primitive.scale);
  }
  if (primitive.kind === 'rounded-box') {
    return signedDistanceRoundedBox(local, primitive.halfExtentsMetres, primitive.roundingMetres);
  }
  if (primitive.kind === 'ellipsoid') return signedDistanceEllipsoid(local, primitive.radiiMetres);
  if (primitive.kind === 'superellipsoid') return signedDistanceSuperellipsoid(local, primitive);
  if (primitive.kind === 'extruded-polygon') return signedDistanceExtrudedPolygon(local, primitive);
  if (primitive.kind === 'polygonal-loft') return signedDistancePolygonalLoft(local, primitive);
  if (primitive.kind === 'profiled-column') return signedDistanceProfiledColumn(local, primitive);
  if (primitive.kind === 'tapered-box') return signedDistanceTaperedBox(local, primitive);
  return signedDistanceTaperedColumn(local, primitive);
}

function valueNoise3(seed, point, frequency, channel = 0) {
  const p = point.map((value) => value * frequency);
  const cell = p.map(Math.floor);
  const f = p.map((value, axis) => smootherstep01(value - cell[axis]));
  const sample = (x, y, z) => hash01(seed, cell[0] + x, cell[1] + y, cell[2] + z, channel) * 2 - 1;
  const x00 = lerp(sample(0, 0, 0), sample(1, 0, 0), f[0]);
  const x10 = lerp(sample(0, 1, 0), sample(1, 1, 0), f[0]);
  const x01 = lerp(sample(0, 0, 1), sample(1, 0, 1), f[0]);
  const x11 = lerp(sample(0, 1, 1), sample(1, 1, 1), f[0]);
  return lerp(lerp(x00, x10, f[1]), lerp(x01, x11, f[1]), f[2]);
}

export function resolveControlProgram(sourcePackage) {
  const controlProgram = structuredClone(sourcePackage.controlProgram);
  for (const modifier of sourcePackage.modifierStack) {
    const targetIds = new Set(modifier.targetIds ?? controlProgram.primitives.map((primitive) => primitive.id));
    for (const primitive of controlProgram.primitives) {
      if (!targetIds.has(primitive.id)) continue;
      if (modifier.parameter === 'uniformScale') {
        primitive.centerMetres = primitive.centerMetres.map((value) => value * modifier.value);
        if (primitive.halfExtentsMetres) primitive.halfExtentsMetres = primitive.halfExtentsMetres.map((value) => value * modifier.value);
        if (primitive.scale) primitive.scale = primitive.scale.map((value) => value * modifier.value);
        if (primitive.radiiMetres) primitive.radiiMetres = primitive.radiiMetres.map((value) => value * modifier.value);
        if (primitive.verticesMetres) primitive.verticesMetres = primitive.verticesMetres.map((vertex) => vertex.map((value) => value * modifier.value));
        if (primitive.halfDepthMetres) primitive.halfDepthMetres *= modifier.value;
        if (primitive.baseRadiiMetres) primitive.baseRadiiMetres = primitive.baseRadiiMetres.map((value) => value * modifier.value);
        if (primitive.topRadiiMetres) primitive.topRadiiMetres = primitive.topRadiiMetres.map((value) => value * modifier.value);
        if (primitive.bottomHalfExtentsMetres) primitive.bottomHalfExtentsMetres = primitive.bottomHalfExtentsMetres.map((value) => value * modifier.value);
        if (primitive.topHalfExtentsMetres) primitive.topHalfExtentsMetres = primitive.topHalfExtentsMetres.map((value) => value * modifier.value);
        if (primitive.topOffsetMetres) primitive.topOffsetMetres = primitive.topOffsetMetres.map((value) => value * modifier.value);
        if (primitive.levels) primitive.levels = primitive.kind === 'polygonal-loft'
          ? primitive.levels.map((level) => ({
              ...level,
              verticesMetres: level.verticesMetres.map((vertex) => vertex.map((value) => value * modifier.value)),
              yMetres: level.yMetres * modifier.value,
            }))
          : primitive.levels.map((level) => ({
              ...level,
              halfExtentsMetres: level.halfExtentsMetres.map((value) => value * modifier.value),
              offsetMetres: level.offsetMetres.map((value) => value * modifier.value),
              yMetres: level.yMetres * modifier.value,
            }));
        if (primitive.halfHeightMetres) primitive.halfHeightMetres *= modifier.value;
        if (primitive.roundingMetres) primitive.roundingMetres *= modifier.value;
        primitive.smoothingMetres *= modifier.value;
      } else if (modifier.parameter === 'heightWidthRatioDelta') {
        const yScale = 1 + modifier.value;
        const horizontalScale = 1 - modifier.value * 0.35;
        primitive.centerMetres = [primitive.centerMetres[0] * horizontalScale, primitive.centerMetres[1] * yScale, primitive.centerMetres[2] * horizontalScale];
        if (primitive.halfExtentsMetres) primitive.halfExtentsMetres = [primitive.halfExtentsMetres[0] * horizontalScale, primitive.halfExtentsMetres[1] * yScale, primitive.halfExtentsMetres[2] * horizontalScale];
        if (primitive.scale) primitive.scale = [primitive.scale[0] * horizontalScale, primitive.scale[1] * yScale, primitive.scale[2] * horizontalScale];
        if (primitive.radiiMetres) primitive.radiiMetres = [primitive.radiiMetres[0] * horizontalScale, primitive.radiiMetres[1] * yScale, primitive.radiiMetres[2] * horizontalScale];
        if (primitive.verticesMetres) primitive.verticesMetres = primitive.verticesMetres.map((vertex) => [vertex[0] * horizontalScale, vertex[1] * yScale]);
        if (primitive.halfDepthMetres) primitive.halfDepthMetres *= horizontalScale;
        if (primitive.halfHeightMetres) primitive.halfHeightMetres *= yScale;
        if (primitive.baseRadiiMetres) primitive.baseRadiiMetres = primitive.baseRadiiMetres.map((value) => value * horizontalScale);
        if (primitive.topRadiiMetres) primitive.topRadiiMetres = primitive.topRadiiMetres.map((value) => value * horizontalScale);
        if (primitive.bottomHalfExtentsMetres) primitive.bottomHalfExtentsMetres = primitive.bottomHalfExtentsMetres.map((value) => value * horizontalScale);
        if (primitive.topHalfExtentsMetres) primitive.topHalfExtentsMetres = primitive.topHalfExtentsMetres.map((value) => value * horizontalScale);
        if (primitive.topOffsetMetres) primitive.topOffsetMetres = primitive.topOffsetMetres.map((value) => value * horizontalScale);
        if (primitive.levels) primitive.levels = primitive.kind === 'polygonal-loft'
          ? primitive.levels.map((level) => ({
              ...level,
              verticesMetres: level.verticesMetres.map((vertex) => vertex.map((value) => value * horizontalScale)),
              yMetres: level.yMetres * yScale,
            }))
          : primitive.levels.map((level) => ({
              ...level,
              halfExtentsMetres: level.halfExtentsMetres.map((value) => value * horizontalScale),
              offsetMetres: level.offsetMetres.map((value) => value * horizontalScale),
              yMetres: level.yMetres * yScale,
            }));
      } else if (modifier.parameter === 'blockOffsetFraction') {
        const direction = modifier.direction ?? [1, 0, 0];
        const scale = Math.max(...sourcePackage.targetDimensionsMetres);
        primitive.centerMetres = primitive.centerMetres.map((value, axis) => value + direction[axis] * modifier.value * scale);
      } else if (modifier.parameter === 'openingWidthDelta' && primitive.role === 'opening') {
        const factor = 1 + modifier.value;
        if (primitive.radiiMetres) primitive.radiiMetres[0] *= factor;
        if (primitive.verticesMetres) primitive.verticesMetres = primitive.verticesMetres.map((vertex) => [vertex[0] * factor, vertex[1]]);
        if (primitive.halfExtentsMetres) primitive.halfExtentsMetres[0] *= factor;
        if (primitive.scale) primitive.scale[0] *= factor;
      } else if (modifier.parameter === 'openingHeightDelta' && primitive.role === 'opening') {
        const factor = 1 + modifier.value;
        if (primitive.radiiMetres) primitive.radiiMetres[1] *= factor;
        if (primitive.halfExtentsMetres) primitive.halfExtentsMetres[1] *= factor;
        if (primitive.scale) primitive.scale[1] *= factor;
      } else if (modifier.parameter === 'faceReliefFraction') {
        primitive.centerMetres[2] += modifier.value * Math.max(...sourcePackage.targetDimensionsMetres);
      } else if (modifier.parameter === 'reliefFraction') {
        primitive.centerMetres[2] += modifier.value * Math.max(...sourcePackage.targetDimensionsMetres);
      } else if (modifier.parameter === 'moduleLengthDelta' || modifier.parameter === 'ridgeLengthDelta') {
        const factor = 1 + modifier.value;
        primitive.centerMetres[0] *= factor;
        if (primitive.halfExtentsMetres) primitive.halfExtentsMetres[0] *= factor;
        if (primitive.scale) primitive.scale[0] *= factor;
        if (primitive.radiiMetres) primitive.radiiMetres[0] *= factor;
        if (primitive.baseRadiiMetres) primitive.baseRadiiMetres[0] *= factor;
        if (primitive.topRadiiMetres) primitive.topRadiiMetres[0] *= factor;
        if (primitive.bottomHalfExtentsMetres) primitive.bottomHalfExtentsMetres[0] *= factor;
        if (primitive.topHalfExtentsMetres) primitive.topHalfExtentsMetres[0] *= factor;
        if (primitive.topOffsetMetres) primitive.topOffsetMetres[0] *= factor;
        if (primitive.levels) primitive.levels = primitive.kind === 'polygonal-loft'
          ? primitive.levels.map((level) => ({
              ...level,
              verticesMetres: level.verticesMetres.map((vertex) => [vertex[0] * factor, vertex[1]]),
            }))
          : primitive.levels.map((level) => ({
              ...level,
              halfExtentsMetres: [level.halfExtentsMetres[0] * factor, level.halfExtentsMetres[1]],
              offsetMetres: [level.offsetMetres[0] * factor, level.offsetMetres[1]],
            }));
      }
    }
  }
  return controlProgram;
}

function semanticDistance(point, descriptor) {
  const value = point[0] * descriptor.normal[0] + point[1] * descriptor.normal[1] + point[2] * descriptor.normal[2] - descriptor.offsetMetres;
  return Math.exp(-(value * value) / Math.max(descriptor.widthMetres ** 2, 1e-12)) * descriptor.strength;
}

function customMeshSamplerBindings(sourcePackage, options) {
  if (!sourcePackage.customMeshSource) return new Map();
  const candidates = options?.customMeshAuthorities ?? options?.customMeshSamplers;
  const bindings = candidates instanceof Map
    ? candidates
    : new Map(Object.entries(candidates ?? {}));
  const artifact = sourcePackage.customMeshSource.control;
  const authority = bindings.get(artifact.id);
  if (!authority) return new Map();
  assertVerifiedC8CustomMeshAuthority(authority, sourcePackage.customMeshSource);
  return new Map([[artifact.id, authority.controlSampler]]);
}

export function createAuthoredCanonicalField(sourcePackage, processField, options = {}) {
  const validated = validateEditableSourcePackage(sourcePackage);
  if (!processField || typeof processField.sample !== 'function') throw new TypeError('Authored canonical field requires a geology process field.');
  const resolved = resolveControlProgram(validated.package);
  const customMeshSamplers = customMeshSamplerBindings(validated.package, options);
  const sparseSculptDeltas = validated.package.sparseSculptDeltas ?? [];
  const roughness = validated.package.controlProgram.macroRoughness ?? { amplitudeMetres: 0, frequencyCyclesPerMetre: 1, seed: 0 };

  function evaluate(x, y, z) {
    const point = [x, y, z];
    let result = Infinity;
    for (const primitive of resolved.primitives) {
      const primitiveDistance = evaluatePrimitive(
        point,
        primitive,
        primitive.kind === 'custom-mesh' ? customMeshSamplers.get(primitive.artifactId) : null,
        sparseSculptDeltas,
      );
      result = primitive.operation === 'union'
        ? smoothMinimum(result, primitiveDistance, primitive.smoothingMetres)
        : smoothMaximum(result, -primitiveDistance, primitive.smoothingMetres);
    }
    if (roughness.amplitudeMetres > 0) {
      const low = valueNoise3(roughness.seed, point, roughness.frequencyCyclesPerMetre, 901);
      const high = valueNoise3(roughness.seed ^ 0x9e3779b9, point, roughness.frequencyCyclesPerMetre * 2.7, 902);
      result += Math.abs(low * 0.72 + high * 0.28) * roughness.amplitudeMetres;
    }
    return result;
  }

  function sample(point) {
    const base = processField.sample(point);
    return {
      ...base,
      signedDistanceMetres: evaluate(...point),
    };
  }

  function surfaceSemantics(point) {
    const semantics = validated.package.semanticProgram ?? {};
    return {
      bedding: Math.min(1, Math.max(0, ...(semantics.beddingPlanes ?? []).map((descriptor) => semanticDistance(point, descriptor)))),
      clast: 0,
      clastEdge: 0,
      cleavage: Math.min(1, Math.max(0, ...(semantics.cleavagePlanes ?? []).map((descriptor) => semanticDistance(point, descriptor)))),
      coolingFracture: Math.min(1, Math.max(0, ...(semantics.coolingPlanes ?? []).map((descriptor) => semanticDistance(point, descriptor)))),
      foliation: Math.min(1, Math.max(0, ...(semantics.foliationPlanes ?? []).map((descriptor) => semanticDistance(point, descriptor)))),
      joint: Math.min(1, Math.max(0, ...(semantics.jointPlanes ?? []).map((descriptor) => semanticDistance(point, descriptor)))),
    };
  }

  return Object.freeze({
    descriptor: Object.freeze({
      fieldContentId: contentId({
        customMeshBindings: validated.package.customMeshSource
          ? {
              authorityContractHash: (options?.customMeshAuthorities ?? options?.customMeshSamplers)
                ?.get?.(validated.package.customMeshSource.control.id)?.authorityContractHash
                ?? (options?.customMeshAuthorities ?? options?.customMeshSamplers)
                  ?.[validated.package.customMeshSource.control.id]?.authorityContractHash
                ?? null,
              controlContentHash: validated.package.customMeshSource.control.contentHash,
              controlTopologyHash: validated.package.customMeshSource.control.topologyHash,
              highDetailContentHash: validated.package.customMeshSource.highDetail.contentHash,
              highDetailTopologyHash: validated.package.customMeshSource.highDetail.topologyHash,
              sparseSculptDeltas,
            }
          : null,
        resolved,
        sourceContentId: validated.contentId,
        version: 2,
      }),
      sourceContentId: validated.contentId,
      subtypeId: validated.package.subtypeId,
      version: 2,
    }),
    evaluate,
    processField,
    resolvedControlProgram: resolved,
    sample,
    surfaceSemantics,
  });
}

export function authoredCanonicalBounds(sourcePackage, paddingFraction = 0.12) {
  const validated = validateEditableSourcePackage(sourcePackage);
  if (validated.package.customMeshSource) {
    const measured = deriveC8EditedBoundsMetres(validated.package);
    const padding = Math.max(...measured.dimensionsMetres) * paddingFraction;
    return {
      max: measured.max.map((value) => value + padding),
      min: measured.min.map((value) => value - padding),
    };
  }
  const half = validated.package.targetDimensionsMetres.map((value) => value * 0.5);
  const padding = Math.max(...half) * paddingFraction;
  return {
    max: half.map((value) => value + padding),
    min: half.map((value) => -value - padding),
  };
}
