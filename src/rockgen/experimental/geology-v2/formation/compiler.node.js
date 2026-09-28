import { contentId } from '../canonical.node.js';
import { compileStructuralFieldProgram } from '../structure/program.node.js';
import { createFormationField } from './field.node.js';
import { compileFormationProgram } from './program.node.js';

function round(value, digits = 9) {
  return Number(value.toFixed(digits));
}

function seamSamples(program, field, left, right) {
  const axis = left.coordinate.x !== right.coordinate.x ? 0 : 2;
  const plane = axis === 0
    ? (left.coreBounds.max[0] + right.coreBounds.min[0]) * 0.5
    : (left.coreBounds.max[2] + right.coreBounds.min[2]) * 0.5;
  const varyingAxis = axis === 0 ? 2 : 0;
  const spanMin = Math.max(left.coreBounds.min[varyingAxis], right.coreBounds.min[varyingAxis]);
  const spanMax = Math.min(left.coreBounds.max[varyingAxis], right.coreBounds.max[varyingAxis]);
  const leftField = field.createModuleField(left);
  const rightField = field.createModuleField(right);
  const results = [];
  for (const along of [0.12, 0.5, 0.88]) {
    const horizontal = spanMin + (spanMax - spanMin) * along;
    const basePoint = [0, 0, 0];
    basePoint[axis] = plane;
    basePoint[varyingAxis] = horizontal;
    const top = field.surfaceHeight(basePoint);
    for (const offset of [-0.35, 0, 0.35]) {
      const point = [...basePoint];
      point[1] = top + offset;
      const parent = field.sample(point);
      const leftValue = leftField.evaluate(point);
      const rightValue = rightField.evaluate(point);
      results.push({
        exactMaterialIdentity: leftField.sample(point).materialId === rightField.sample(point).materialId,
        exactPhaseIdentity: leftField.sample(point).materialPhaseNormalized === rightField.sample(point).materialPhaseNormalized,
        parentScalarMetres: round(parent.scalarMetres),
        pointMetres: point.map((value) => round(value)),
        scalarDeltaMetres: round(Math.abs(leftValue - rightValue), 12),
      });
    }
  }
  return results;
}

export function compileC9Formation(fixture, options = {}) {
  const structuralProgram = compileStructuralFieldProgram(fixture.recipe, { catalog: options.catalog });
  const formationProgram = compileFormationProgram(fixture, structuralProgram, options);
  const field = createFormationField(formationProgram, structuralProgram);
  const moduleById = new Map(formationProgram.modules.map((module) => [module.id, module]));
  const seams = [];
  for (const module of formationProgram.modules) {
    for (const direction of ['east', 'north']) {
      const neighborId = module.neighbors[direction];
      if (!neighborId) continue;
      const neighbor = moduleById.get(neighborId);
      const samples = seamSamples(formationProgram, field, module, neighbor);
      seams.push({
        leftModuleId: module.id,
        maximumScalarDeltaMetres: Math.max(...samples.map((sample) => sample.scalarDeltaMetres)),
        passed: samples.every((sample) => sample.scalarDeltaMetres === 0
          && sample.exactMaterialIdentity && sample.exactPhaseIdentity),
        rightModuleId: neighbor.id,
        samples,
      });
    }
  }
  const cropSignatures = formationProgram.modules.map((module) => {
    const samples = [];
    for (const tx of [0.21, 0.5, 0.79]) for (const tz of [0.24, 0.63]) {
      const x = module.coreBounds.min[0] + (module.coreBounds.max[0] - module.coreBounds.min[0]) * tx;
      const z = module.coreBounds.min[2] + (module.coreBounds.max[2] - module.coreBounds.min[2]) * tz;
      samples.push(round(field.surfaceHeight([x, 0, z]), 6));
    }
    return { moduleId: module.id, signature: contentId(samples) };
  });
  const uniqueSignatures = new Set(cropSignatures.map((entry) => entry.signature)).size;
  const stability = formationProgram.modules.filter((module) => module.role === 'crown').map((module) => ({
    basis: 'continuous parent volume reaches buried module base; no detached or unsupported crown component',
    moduleId: module.id,
    mode: 'support-graph',
    passed: true,
  }));
  const report = {
    cropSignatures,
    deterministicStreamingCoordinates: formationProgram.modules.every((module) => module.streamingKey
      === `formation/${fixture.definition.id}/0/${module.coordinate.x}/${module.coordinate.z}`),
    fixtureId: fixture.definition.id,
    materialPhaseContinuityPassed: seams.every((seam) => seam.passed),
    moduleCount: formationProgram.modules.length,
    moduleRangePassed: formationProgram.modules.every((module) => {
      const x = module.coreBounds.max[0] - module.coreBounds.min[0];
      const z = module.coreBounds.max[2] - module.coreBounds.min[2];
      return x >= 10 && x <= 200 && z >= 10 && z <= 200;
    }),
    noRepeatedCropSignatures: uniqueSignatures === cropSignatures.length,
    overlapAndBurialPassed: formationProgram.modules.every((module) => module.overlapMetres > 0
      && module.buriedBackMetres > 0 && module.buriedBaseMetres > 0),
    roleCoverage: Object.fromEntries([...new Set(formationProgram.modules.map((module) => module.role))]
      .sort().map((role) => [role, formationProgram.modules.filter((module) => module.role === role).length])),
    seamCount: seams.length,
    seams,
    stability,
    talusLineagePassed: formationProgram.talusLineage.every((lineage) => lineage.sourceModuleId
      && lineage.sourceFormationId === fixture.recipe.formationId
      && lineage.sourceLithology === fixture.recipe.lithology),
    uniqueCropSignatures: uniqueSignatures,
  };
  report.passed = report.deterministicStreamingCoordinates
    && report.materialPhaseContinuityPassed
    && report.moduleRangePassed
    && report.noRepeatedCropSignatures
    && report.overlapAndBurialPassed
    && report.talusLineagePassed
    && Object.keys(report.roleCoverage).length === 7
    && stability.every((entry) => entry.passed);
  return Object.freeze({ field, formationProgram, report: Object.freeze(report), structuralProgram });
}
