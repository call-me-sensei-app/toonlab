import fs from 'node:fs';
import path from 'node:path';

import { canonicalizeJson, contentId } from '../canonical.node.js';
import {
  createC8SurfaceReprojection,
  invalidateC8GeometryDerivatives,
  markC8SurfaceReprojectionCurrent,
  validateC8CustomMeshSource,
  validateC8SparseSculptDelta,
  validateC8SparseSculptSequence,
} from './customMesh.node.js';
import { createMorphologyInspirationRegister } from './inspirationRegister.node.js';

const sourceDirectory = path.resolve(import.meta.dirname, '..');
const taxonomy = JSON.parse(fs.readFileSync(path.join(sourceDirectory, 'morphology-taxonomy.v1.json'), 'utf8'));
const subtypeById = new Map(taxonomy.subtypes.map((subtype) => [subtype.id, subtype]));
const profileById = new Map(taxonomy.variationProfiles.map((profile) => [profile.id, profile]));
const inspirationBySubtypeId = new Map(
  createMorphologyInspirationRegister().entries.map((entry) => [entry.subtypeId, entry]),
);

export const EDITABLE_SOURCE_PACKAGE_SCHEMA = 'toonlab/editable-rock-source-package';
export const EDITABLE_SOURCE_PACKAGE_VERSION = 1;

function fail(code, message, details = {}) {
  throw Object.assign(new Error(message), { code, details });
}

function validateVector(name, value, length, { positive = false } = {}) {
  if (!Array.isArray(value) || value.length !== length || !value.every(Number.isFinite)) {
    fail('invalid-vector', `${name} must contain ${length} finite numbers.`, { name, value });
  }
  if (positive && !value.every((item) => item > 0)) {
    fail('invalid-positive-vector', `${name} must contain positive numbers.`, { name, value });
  }
}

function geometrySourceContentId(sourcePackage) {
  return contentId({
    controlProgram: sourcePackage.controlProgram,
    customMeshSource: sourcePackage.customMeshSource ?? null,
    manualHighDetail: sourcePackage.manualHighDetail ?? null,
    modifierStack: sourcePackage.modifierStack,
    sparseSculptDeltas: sourcePackage.sparseSculptDeltas ?? [],
  });
}

function validatePrimitive(primitive, index) {
  if (!primitive?.id || !['custom-mesh', 'ellipsoid', 'extruded-polygon', 'polygonal-loft', 'profiled-column', 'rounded-box', 'superellipsoid', 'tapered-box', 'tapered-column'].includes(primitive.kind)) {
    fail('invalid-control-primitive', `Control primitive ${index + 1} has an unsupported kind or no ID.`, { primitive });
  }
  if (!['union', 'subtract'].includes(primitive.operation)) {
    fail('invalid-control-operation', `${primitive.id} must use union or subtract.`, { primitive });
  }
  validateVector(`${primitive.id}.centerMetres`, primitive.centerMetres, 3);
  validateVector(`${primitive.id}.rotationDegrees`, primitive.rotationDegrees, 3);
  if (primitive.kind === 'custom-mesh') {
    if (typeof primitive.artifactId !== 'string' || !primitive.artifactId.trim()) {
      fail('invalid-custom-mesh-artifact-binding', `${primitive.id} requires an artifactId.`, { primitive });
    }
    validateVector(`${primitive.id}.scale`, primitive.scale, 3, { positive: true });
    validateVector(`${primitive.id}.halfExtentsMetres`, primitive.halfExtentsMetres, 3, { positive: true });
  } else if (primitive.kind === 'rounded-box') {
    validateVector(`${primitive.id}.halfExtentsMetres`, primitive.halfExtentsMetres, 3, { positive: true });
    if (!(primitive.roundingMetres >= 0) || !Number.isFinite(primitive.roundingMetres)) {
      fail('invalid-rounding', `${primitive.id}.roundingMetres must be finite and non-negative.`, { primitive });
    }
  } else if (primitive.kind === 'ellipsoid' || primitive.kind === 'superellipsoid') {
    validateVector(`${primitive.id}.radiiMetres`, primitive.radiiMetres, 3, { positive: true });
    if (primitive.kind === 'superellipsoid' && (!Number.isFinite(primitive.exponent) || primitive.exponent < 1.5 || primitive.exponent > 8)) {
      fail('invalid-superellipsoid-exponent', `${primitive.id}.exponent must be between 1.5 and 8.`, { primitive });
    }
  } else if (primitive.kind === 'extruded-polygon') {
    if (!Array.isArray(primitive.verticesMetres) || primitive.verticesMetres.length < 3) {
      fail('invalid-extruded-polygon', `${primitive.id}.verticesMetres must contain at least three vertices.`, { primitive });
    }
    for (const [vertexIndex, vertex] of primitive.verticesMetres.entries()) {
      validateVector(`${primitive.id}.verticesMetres[${vertexIndex}]`, vertex, 2);
    }
    if (!(primitive.halfDepthMetres > 0) || !Number.isFinite(primitive.halfDepthMetres)) {
      fail('invalid-extruded-polygon-depth', `${primitive.id}.halfDepthMetres must be positive.`, { primitive });
    }
  } else if (primitive.kind === 'polygonal-loft') {
    if (!Array.isArray(primitive.levels) || primitive.levels.length < 3) {
      fail('invalid-polygonal-loft-levels', `${primitive.id}.levels must contain at least three traced cross-sections.`, { primitive });
    }
    let previousY = -Infinity;
    for (const [levelIndex, level] of primitive.levels.entries()) {
      if (!Number.isFinite(level.yMetres) || level.yMetres <= previousY) {
        fail('invalid-polygonal-loft-order', `${primitive.id}.levels must use strictly increasing finite yMetres.`, { levelIndex, primitive });
      }
      if (!Array.isArray(level.verticesMetres) || level.verticesMetres.length < 3) {
        fail('invalid-polygonal-loft-section', `${primitive.id}.levels[${levelIndex}] must contain at least three vertices.`, { primitive });
      }
      for (const [vertexIndex, vertex] of level.verticesMetres.entries()) {
        validateVector(`${primitive.id}.levels[${levelIndex}].verticesMetres[${vertexIndex}]`, vertex, 2);
      }
      previousY = level.yMetres;
    }
  } else if (primitive.kind === 'profiled-column') {
    if (!Array.isArray(primitive.levels) || primitive.levels.length < 3) {
      fail('invalid-profiled-column-levels', `${primitive.id}.levels must contain at least three authored levels.`, { primitive });
    }
    let previousY = -Infinity;
    for (const [levelIndex, level] of primitive.levels.entries()) {
      if (!Number.isFinite(level.yMetres) || level.yMetres <= previousY) {
        fail('invalid-profiled-column-order', `${primitive.id}.levels must use strictly increasing finite yMetres.`, { levelIndex, primitive });
      }
      validateVector(`${primitive.id}.levels[${levelIndex}].halfExtentsMetres`, level.halfExtentsMetres, 2, { positive: true });
      validateVector(`${primitive.id}.levels[${levelIndex}].offsetMetres`, level.offsetMetres, 2);
      previousY = level.yMetres;
    }
    if (!(primitive.roundingMetres >= 0) || !Number.isFinite(primitive.roundingMetres)) {
      fail('invalid-rounding', `${primitive.id}.roundingMetres must be finite and non-negative.`, { primitive });
    }
  } else if (primitive.kind === 'tapered-column') {
    if (!(primitive.halfHeightMetres > 0) || !Number.isFinite(primitive.halfHeightMetres)) {
      fail('invalid-tapered-column-height', `${primitive.id}.halfHeightMetres must be positive.`, { primitive });
    }
    validateVector(`${primitive.id}.baseRadiiMetres`, primitive.baseRadiiMetres, 2, { positive: true });
    validateVector(`${primitive.id}.topRadiiMetres`, primitive.topRadiiMetres, 2, { positive: true });
  } else {
    if (!(primitive.halfHeightMetres > 0) || !Number.isFinite(primitive.halfHeightMetres)) {
      fail('invalid-tapered-box-height', `${primitive.id}.halfHeightMetres must be positive.`, { primitive });
    }
    validateVector(`${primitive.id}.bottomHalfExtentsMetres`, primitive.bottomHalfExtentsMetres, 2, { positive: true });
    validateVector(`${primitive.id}.topHalfExtentsMetres`, primitive.topHalfExtentsMetres, 2, { positive: true });
    validateVector(`${primitive.id}.topOffsetMetres`, primitive.topOffsetMetres, 2);
    if (!(primitive.roundingMetres >= 0) || !Number.isFinite(primitive.roundingMetres)) {
      fail('invalid-rounding', `${primitive.id}.roundingMetres must be finite and non-negative.`, { primitive });
    }
  }
  if (!(primitive.smoothingMetres >= 0) || !Number.isFinite(primitive.smoothingMetres)) {
    fail('invalid-smoothing', `${primitive.id}.smoothingMetres must be finite and non-negative.`, { primitive });
  }
}

function validateCustomMeshEditEnvelope(sourcePackage, customMeshSource, primitive) {
  const near = (value, expected) => Math.abs(value - expected) <= 1e-9;
  if (!primitive.centerMetres.every((value) => near(value, 0))
    || !primitive.rotationDegrees.every((value) => near(value, 0))
    || !primitive.scale.every((value) => near(value, 1))) {
    fail('custom-mesh-base-transform', 'The admitted C8 control GLB must keep its exact metre-space transform; use bounded modifiers or edit/re-hash the control source.', {
      centerMetres: primitive.centerMetres,
      rotationDegrees: primitive.rotationDegrees,
      scale: primitive.scale,
    });
  }
  const center = [0, 0, 0];
  const scale = [1, 1, 1];
  let variationMagnitude = 0;
  for (const modifier of sourcePackage.modifierStack) {
    const targets = modifier.targetIds ?? [primitive.id];
    if (!targets.includes(primitive.id)) {
      fail('custom-mesh-modifier-no-effect', `${modifier.parameter} does not target the C8 control primitive.`, { modifier });
    }
    const value = modifier.value;
    if (modifier.parameter === 'uniformScale') {
      center.forEach((entry, axis) => { center[axis] = entry * value; });
      scale.forEach((entry, axis) => { scale[axis] = entry * value; });
      variationMagnitude += Math.abs(value - 1);
    } else if (modifier.parameter === 'heightWidthRatioDelta') {
      const horizontalScale = 1 - value * 0.35;
      const verticalScale = 1 + value;
      center[0] *= horizontalScale;
      center[1] *= verticalScale;
      center[2] *= horizontalScale;
      scale[0] *= horizontalScale;
      scale[1] *= verticalScale;
      scale[2] *= horizontalScale;
      variationMagnitude += Math.abs(value);
    } else if (modifier.parameter === 'blockOffsetFraction') {
      const direction = modifier.direction ?? [1, 0, 0];
      validateVector('modifier.direction', direction, 3);
      const extent = Math.max(...sourcePackage.targetDimensionsMetres);
      center.forEach((entry, axis) => { center[axis] = entry + direction[axis] * value * extent; });
      variationMagnitude += Math.abs(value);
    } else if (modifier.parameter === 'openingWidthDelta' && primitive.role === 'opening') {
      scale[0] *= 1 + value;
      variationMagnitude += Math.abs(value);
    } else if (modifier.parameter === 'openingHeightDelta' && primitive.role === 'opening') {
      scale[1] *= 1 + value;
      variationMagnitude += Math.abs(value);
    } else if (modifier.parameter === 'faceReliefFraction' || modifier.parameter === 'reliefFraction') {
      center[2] += value * Math.max(...sourcePackage.targetDimensionsMetres);
      variationMagnitude += Math.abs(value);
    } else if (modifier.parameter === 'moduleLengthDelta' || modifier.parameter === 'ridgeLengthDelta') {
      const factor = 1 + value;
      center[0] *= factor;
      scale[0] *= factor;
      variationMagnitude += Math.abs(value);
    } else {
      fail('unsupported-custom-mesh-modifier', `${modifier.parameter} has no deterministic C8 control-mesh transform implementation; use a bounded sparse sculpt or re-hashed manual control edit.`, {
        modifier,
      });
    }
  }
  if (variationMagnitude > customMeshSource.editEnvelope.maximumVariationStrength + 1e-9) {
    fail('custom-mesh-variation-outside-envelope', 'Cumulative C8 modifier strength exceeds the admitted variation envelope.', {
      maximum: customMeshSource.editEnvelope.maximumVariationStrength,
      variationMagnitude,
    });
  }
  let maximumDisplacementMetres = 0;
  const bounds = customMeshSource.control.boundsMetres;
  for (const x of [bounds.min[0], bounds.max[0]]) {
    for (const y of [bounds.min[1], bounds.max[1]]) {
      for (const z of [bounds.min[2], bounds.max[2]]) {
        maximumDisplacementMetres = Math.max(maximumDisplacementMetres, Math.hypot(
          x * scale[0] + center[0] - x,
          y * scale[1] + center[1] - y,
          z * scale[2] + center[2] - z,
        ));
      }
    }
  }
  const transformedBounds = {
    max: customMeshSource.control.boundsMetres.max.map((value, axis) => value * scale[axis] + center[axis]),
    min: customMeshSource.control.boundsMetres.min.map((value, axis) => value * scale[axis] + center[axis]),
  };
  return Object.freeze({
    maximumResolvedScale: Math.max(...scale),
    maximumTransformDisplacementMetres: maximumDisplacementMetres,
    resolvedCenterMetres: Object.freeze(center),
    resolvedScale: Object.freeze(scale),
    transformedBoundsMetres: Object.freeze({
      max: Object.freeze(transformedBounds.max),
      min: Object.freeze(transformedBounds.min),
    }),
    variationMagnitude,
  });
}

function c8EditedBoundsFromValidated(sourcePackage) {
  const customMeshSource = sourcePackage.customMeshSource;
  const primitive = sourcePackage.controlProgram.primitives.find((entry) => entry.kind === 'custom-mesh');
  const transformAudit = validateCustomMeshEditEnvelope(sourcePackage, customMeshSource, primitive);
  const sculptAudit = validateC8SparseSculptSequence(sourcePackage.sparseSculptDeltas ?? [], customMeshSource);
  const macroRoughnessAmplitudeMetres = Number(sourcePackage.controlProgram.macroRoughness?.amplitudeMetres) || 0;
  const editPaddingMetres = (
    sculptAudit.maximumAccumulatedDisplacementMetres * transformAudit.maximumResolvedScale
  ) + macroRoughnessAmplitudeMetres;
  const min = transformAudit.transformedBoundsMetres.min.map((value) => value - editPaddingMetres);
  const max = transformAudit.transformedBoundsMetres.max.map((value) => value + editPaddingMetres);
  return Object.freeze({
    dimensionsMetres: Object.freeze(max.map((value, axis) => value - min[axis])),
    editPaddingMetres,
    max: Object.freeze(max),
    min: Object.freeze(min),
    sculptAudit,
    transformAudit,
  });
}

function validateShapeRationale(sourcePackage, subtype) {
  if (!Array.isArray(sourcePackage.shapeRationale) || sourcePackage.shapeRationale.length < 3) {
    fail('missing-shape-rationale', 'Editable source packages must explain at least three authored shape features.', {
      subtypeId: subtype.id,
    });
  }
  const inspirations = inspirationBySubtypeId.get(subtype.id);
  const validReferencesByKind = {
    'approved-geology-authority': new Map(inspirations.authorityReferences.map((reference) => [reference.pageUrl, reference.label])),
    'approved-nature-image': new Map(inspirations.approvedReferences.map((reference) => [reference.pageUrl, reference.label])),
    'art-direction': new Map(inspirations.artDirectionReferences.map((reference) => [reference.pageUrl, reference.label])),
  };
  const featureIds = new Set();
  let approvedNatureCount = 0;
  for (const item of sourcePackage.shapeRationale) {
    if (!item?.featureId || featureIds.has(item.featureId)) {
      fail('invalid-shape-feature-id', 'Shape-rationale feature IDs must be present and unique.', { item });
    }
    featureIds.add(item.featureId);
    if (!Object.hasOwn(validReferencesByKind, item.referenceKind)) {
      fail('invalid-shape-reference-kind', `Unsupported shape-rationale reference kind: ${item.referenceKind}`, { item });
    }
    const registeredLabel = validReferencesByKind[item.referenceKind].get(item.referenceUrl);
    if (!item.referenceLabel || registeredLabel !== item.referenceLabel) {
      fail('unregistered-shape-reference', `${item.featureId} does not point to a vetted subtype reference.`, {
        item,
        subtypeId: subtype.id,
      });
    }
    if (typeof item.rationale !== 'string' || item.rationale.trim().length < 24) {
      fail('insufficient-shape-rationale', `${item.featureId} requires a concrete feature-level rationale.`, { item });
    }
    if (item.referenceKind === 'art-direction' && item.geologyOverrideAllowed !== false) {
      fail('art-direction-geology-override', 'Art direction must explicitly be forbidden from overriding geology.', { item });
    }
    if (item.referenceKind === 'approved-nature-image') approvedNatureCount += 1;
  }
  if (approvedNatureCount === 0) {
    fail('missing-approved-shape-image', 'Canonical authoring requires at least one approved nature-image reference.', {
      subtypeId: subtype.id,
    });
  }
}

function validateSilhouetteTrace(sourcePackage, subtype) {
  const trace = sourcePackage.silhouetteTrace;
  if (trace === undefined) return;
  if (!trace || trace.method !== 'multi-view-authored-control-cage') {
    fail('invalid-silhouette-trace', 'silhouetteTrace must identify the multi-view authored control-cage method.', { trace });
  }
  const inspirations = inspirationBySubtypeId.get(subtype.id);
  const approvedNature = new Map(inspirations.approvedReferences.map((reference) => [reference.pageUrl, reference.label]));
  if (approvedNature.get(trace.primaryNatureReference?.pageUrl) !== trace.primaryNatureReference?.label) {
    fail('unregistered-silhouette-reference', 'The primary silhouette trace must point to an approved nature image for this subtype.', {
      subtypeId: subtype.id,
      trace,
    });
  }
  if (!Array.isArray(trace.projections) || !trace.projections.includes('front') || trace.projections.length < 2) {
    fail('insufficient-silhouette-projections', 'A multi-view trace must include front and at least one depth-constraining projection.', { trace });
  }
  if (trace.generatedTurnaround) {
    if (trace.generatedTurnaround.generatedViewsAreEvidence !== false) {
      fail('generated-view-evidence-leak', 'Generated turnaround views are hypotheses and must never be marked as geology evidence.', { trace });
    }
    if (typeof trace.generatedTurnaround.assetPath !== 'string' || !trace.generatedTurnaround.assetPath.trim()) {
      fail('missing-generated-turnaround-asset', 'Generated turnaround metadata requires a project asset path.', { trace });
    }
    if (trace.generatedTurnaround.status !== 'approved-shape-hypothesis') {
      fail('unapproved-generated-turnaround', 'Generated turnaround must be explicitly approved as a shape hypothesis before it constrains a cage.', { trace });
    }
  }
}

export function validateEditableSourcePackage(sourcePackage) {
  if (sourcePackage?.schema !== EDITABLE_SOURCE_PACKAGE_SCHEMA || sourcePackage.version !== EDITABLE_SOURCE_PACKAGE_VERSION) {
    fail('invalid-source-schema', 'Editable source package schema or version is unsupported.', {
      schema: sourcePackage?.schema,
      version: sourcePackage?.version,
    });
  }
  const subtype = subtypeById.get(sourcePackage.subtypeId);
  if (!subtype) fail('unknown-subtype', `Unknown morphology subtype: ${sourcePackage.subtypeId}`, { subtypeId: sourcePackage.subtypeId });
  if (sourcePackage.unit !== 'metre') fail('invalid-unit', 'Editable source packages must use metres.', { unit: sourcePackage.unit });
  validateVector('targetDimensionsMetres', sourcePackage.targetDimensionsMetres, 3, { positive: true });
  if (!Array.isArray(sourcePackage.controlProgram?.primitives) || sourcePackage.controlProgram.primitives.length === 0) {
    fail('missing-control-program', 'Editable source package must contain at least one control primitive.');
  }
  sourcePackage.controlProgram.primitives.forEach(validatePrimitive);
  const primitiveIds = sourcePackage.controlProgram.primitives.map((primitive) => primitive.id);
  if (new Set(primitiveIds).size !== primitiveIds.length) fail('duplicate-control-primitive', 'Control primitive IDs must be unique.', { primitiveIds });
  if (!sourcePackage.controlProgram.primitives.some((primitive) => primitive.operation === 'union')) {
    fail('missing-solid', 'Control program must contain at least one union solid.');
  }
  if (!Array.isArray(sourcePackage.identityLandmarks) || sourcePackage.identityLandmarks.length < 3) {
    fail('missing-landmarks', 'Editable source package must declare at least three identity landmarks.');
  }
  for (const landmark of sourcePackage.identityLandmarks) validateVector(`landmark.${landmark.id}`, landmark.positionMetres, 3);
  const landmarkIds = sourcePackage.identityLandmarks.map((landmark) => landmark.id);
  if (new Set(landmarkIds).size !== landmarkIds.length) fail('duplicate-landmark', 'Identity landmark IDs must be unique.', { landmarkIds });
  if (!Array.isArray(sourcePackage.modifierStack)) fail('invalid-modifier-stack', 'modifierStack must be an array.');
  const customPrimitives = sourcePackage.controlProgram.primitives.filter((primitive) => primitive.kind === 'custom-mesh');
  if (sourcePackage.customMeshSource !== undefined || customPrimitives.length > 0) {
    if (customPrimitives.length === 0) {
      fail('missing-custom-mesh-control-primitive', 'A C8 custom mesh source requires a bound custom-mesh control primitive.');
    }
    const customMeshSource = validateC8CustomMeshSource(sourcePackage.customMeshSource, {
      identityLandmarks: sourcePackage.identityLandmarks,
    });
    if (customPrimitives.length !== 1 || sourcePackage.controlProgram.primitives.length !== 1) {
      fail('ambiguous-custom-mesh-control-program', 'A C8 imported control package must contain exactly one custom-mesh authority; combine manual geometry in Blender and re-hash it.', {
        primitiveCount: sourcePackage.controlProgram.primitives.length,
      });
    }
    for (const primitive of customPrimitives) {
      if (primitive.artifactId !== customMeshSource.control.id) {
        fail('custom-mesh-control-binding-mismatch', `${primitive.id} is not bound to the admitted control GLB.`, {
          artifactId: primitive.artifactId,
          expected: customMeshSource.control.id,
        });
      }
      const expectedHalfExtents = customMeshSource.control.dimensionsMetres.map((value) => value * 0.5);
      if (!primitive.halfExtentsMetres.every((value, axis) => Math.abs(value - expectedHalfExtents[axis]) <= 1e-6)) {
        fail('custom-mesh-control-bounds-mismatch', `${primitive.id} half extents must match the admitted control GLB dimensions.`, {
          actual: primitive.halfExtentsMetres,
          expected: expectedHalfExtents,
        });
      }
    }
    if (customMeshSource.control.sourceRevision > sourcePackage.sourceRevision
      || customMeshSource.highDetail.sourceRevision > sourcePackage.sourceRevision) {
      fail('custom-mesh-package-revision-mismatch', 'Custom mesh artifacts cannot claim a future source revision.', {
        controlRevision: customMeshSource.control.sourceRevision,
        highDetailRevision: customMeshSource.highDetail.sourceRevision,
        packageRevision: sourcePackage.sourceRevision,
      });
    }
    if (!sourcePackage.targetDimensionsMetres.every((value, axis) => (
      Math.abs(value - customMeshSource.control.dimensionsMetres[axis]) <= Math.max(1e-6, value * 1e-5)
    ))) {
      fail('custom-mesh-target-dimensions-mismatch', 'C8 target dimensions must come from the decoded, content-bound control GLB.', {
        actual: sourcePackage.targetDimensionsMetres,
        expected: customMeshSource.control.dimensionsMetres,
      });
    }
    const roughness = sourcePackage.controlProgram.macroRoughness ?? {
      amplitudeMetres: 0,
      frequencyCyclesPerMetre: 1,
      seed: 0,
    };
    if (!Number.isFinite(roughness.amplitudeMetres) || roughness.amplitudeMetres < 0
      || !Number.isFinite(roughness.frequencyCyclesPerMetre) || roughness.frequencyCyclesPerMetre <= 0
      || !Number.isInteger(roughness.seed)) {
      fail('invalid-custom-mesh-macro-roughness', 'C8 macro roughness requires a non-negative metre amplitude, positive cycles-per-metre frequency, and integer seed.', {
        roughness,
      });
    }
    const transformAudit = validateCustomMeshEditEnvelope(sourcePackage, customMeshSource, customPrimitives[0]);
    const sculptAudit = validateC8SparseSculptSequence(sourcePackage.sparseSculptDeltas ?? [], customMeshSource);
    const combinedDisplacementMetres = transformAudit.maximumTransformDisplacementMetres
      + (sculptAudit.maximumAccumulatedDisplacementMetres * transformAudit.maximumResolvedScale)
      + roughness.amplitudeMetres;
    if (combinedDisplacementMetres > customMeshSource.editEnvelope.maximumDisplacementMetres + 1e-9) {
      fail('custom-mesh-combined-deformation-outside-envelope', 'The combined procedural transform, accumulated sparse sculpt, and macro roughness exceed the single admitted metre-space edit envelope.', {
        combinedDisplacementMetres,
        macroRoughnessAmplitudeMetres: roughness.amplitudeMetres,
        maximum: customMeshSource.editEnvelope.maximumDisplacementMetres,
        maximumAccumulatedSculptMetres: sculptAudit.maximumAccumulatedDisplacementMetres,
        maximumResolvedScale: transformAudit.maximumResolvedScale,
        maximumTransformDisplacementMetres: transformAudit.maximumTransformDisplacementMetres,
      });
    }
  }
  validateShapeRationale(sourcePackage, subtype);
  validateSilhouetteTrace(sourcePackage, subtype);
  const profile = profileById.get(subtype.variationProfileId);
  for (const modifier of sourcePackage.modifierStack) {
    const safeRange = profile.safeRanges[modifier.parameter];
    if (!safeRange) fail('unsupported-modifier', `${modifier.parameter} is not allowed for ${subtype.id}.`, { modifier, profileId: profile.id });
    if (!Number.isFinite(modifier.value) || modifier.value < safeRange[0] || modifier.value > safeRange[1]) {
      fail('modifier-outside-envelope', `${modifier.parameter} is outside the ${subtype.id} safe envelope.`, { modifier, safeRange });
    }
  }
  if (!sourcePackage.provenance?.origin || sourcePackage.provenance.existing480CatalogAsset === true) {
    fail('invalid-provenance', 'The new canonical library requires independent provenance and cannot count an old 480 asset.', { provenance: sourcePackage.provenance });
  }
  const canonical = canonicalizeJson(sourcePackage);
  return Object.freeze({
    contentId: contentId(canonical),
    package: canonical,
    profile,
    subtype,
  });
}

export function reviseEditableSourcePackage(sourcePackage, edit) {
  const validated = validateEditableSourcePackage(sourcePackage);
  if (!['procedural-modifier', 'manual-control-program', 'manual-custom-mesh', 'manual-high-detail', 'sparse-sculpt-delta', 'explicit-reclassification'].includes(edit?.kind)) {
    fail('invalid-edit-kind', 'Source edit kind is unsupported.', { kind: edit?.kind });
  }
  const next = structuredClone(validated.package);
  next.parentContentId = validated.contentId;
  next.sourceRevision += 1;
  next.edit = canonicalizeJson(edit);
  if (edit.kind === 'procedural-modifier') next.modifierStack = [...next.modifierStack, edit.modifier];
  if (edit.kind === 'manual-control-program') next.controlProgram = canonicalizeJson(edit.controlProgram);
  if (edit.kind === 'manual-custom-mesh') {
    next.customMeshSource = canonicalizeJson(edit.customMeshSource);
    next.controlProgram = canonicalizeJson(edit.controlProgram ?? next.controlProgram);
    next.sparseSculptDeltas = [];
  }
  if (edit.kind === 'manual-high-detail') {
    next.manualHighDetail = canonicalizeJson(edit.manualHighDetail);
    if (next.customMeshSource && edit.manualHighDetail?.role === 'retained-high-detail') {
      next.customMeshSource = canonicalizeJson({
        ...next.customMeshSource,
        highDetail: edit.manualHighDetail,
      });
    }
  }
  if (edit.kind === 'sparse-sculpt-delta') {
    if (!next.customMeshSource) fail('missing-custom-mesh-source', 'Sparse sculpt edits require a C8 custom mesh source.');
    const delta = validateC8SparseSculptDelta(edit.delta, next.customMeshSource);
    next.sparseSculptDeltas = [...(next.sparseSculptDeltas ?? []), delta];
  }
  if (edit.kind === 'explicit-reclassification') next.subtypeId = edit.subtypeId;
  if (edit.kind !== 'explicit-reclassification') {
    next.derivedArtifactState = invalidateC8GeometryDerivatives(next.derivedArtifactState, {
      reason: edit.kind,
      sourceContentId: geometrySourceContentId(next),
      sourceRevision: next.sourceRevision,
    });
    delete next.surfaceReprojection;
  }
  return validateEditableSourcePackage(next).package;
}

export function reapplyEditableSourceSurface(sourcePackage, {
  dimensionsMetres,
  geology,
  mapResolution = 512,
  seed,
} = {}) {
  const validated = validateEditableSourcePackage(sourcePackage);
  if (!validated.package.customMeshSource) {
    fail('missing-custom-mesh-source', 'C8 surface reprojection requires a custom mesh source.');
  }
  const measuredBounds = c8EditedBoundsFromValidated(validated.package);
  if (dimensionsMetres !== undefined) {
    validateVector('dimensionsMetres', dimensionsMetres, 3, { positive: true });
    if (!dimensionsMetres.every((value, axis) => (
      Math.abs(value - measuredBounds.dimensionsMetres[axis]) <= Math.max(1e-6, measuredBounds.dimensionsMetres[axis] * 1e-5)
    ))) {
      fail('c8-surface-dimensions-not-authoritative', 'C8 surface reprojection dimensions are derived from the verified control bounds and resolved edit envelope, not caller input.', {
        actual: dimensionsMetres,
        expected: measuredBounds.dimensionsMetres,
      });
    }
  }
  const surfaceReprojection = createC8SurfaceReprojection({
    dimensionsMetres: measuredBounds.dimensionsMetres,
    geology,
    mapResolution,
    seed,
    sourceContentId: geometrySourceContentId(validated.package),
    sourceId: validated.package.sourceId,
    sourceRevision: validated.package.sourceRevision,
  });
  const next = structuredClone(validated.package);
  next.surfaceReprojection = surfaceReprojection;
  next.derivedArtifactState = markC8SurfaceReprojectionCurrent(
    next.derivedArtifactState ?? invalidateC8GeometryDerivatives({}, {
      reason: 'surface-reprojection-initialized',
      sourceContentId: surfaceReprojection.sourceContentId,
      sourceRevision: next.sourceRevision,
    }),
    surfaceReprojection,
  );
  return validateEditableSourcePackage(next).package;
}

/** Conservative edited bounds derived from the decoded-and-bound control manifest plus admitted edits. */
export function deriveC8EditedBoundsMetres(sourcePackage) {
  const validated = validateEditableSourcePackage(sourcePackage);
  if (!validated.package.customMeshSource) {
    fail('missing-custom-mesh-source', 'C8 edited bounds require a custom mesh source.');
  }
  return c8EditedBoundsFromValidated(validated.package);
}

export function getMorphologySubtype(id) {
  return subtypeById.get(id) ?? null;
}
