import { reviseEditableSourcePackage } from './sourcePackage.node.js';

function primitive(program, id) {
  const match = program.primitives.find((candidate) => candidate.id === id);
  if (!match) throw new RangeError(`Unknown authored control primitive: ${id}`);
  return match;
}

function manualProgram(source, edit) {
  const program = structuredClone(source.controlProgram);
  edit(program);
  return program;
}

const PLANS = Object.freeze({
  'rock-v2-tor-block-pile-001': Object.freeze({
    procedural: Object.freeze({
      direction: [1, 0, 0],
      parameter: 'blockOffsetFraction',
      targetIds: ['tor-upper-left', 'tor-crown'],
      value: 0.045,
    }),
    invalid: Object.freeze({
      direction: [1, 0, 0],
      parameter: 'blockOffsetFraction',
      targetIds: ['tor-crown'],
      value: 0.2,
    }),
    manual(source) {
      return manualProgram(source, (program) => {
        const upperLeft = primitive(program, 'tor-upper-left');
        upperLeft.centerMetres[0] -= 0.24;
        upperLeft.centerMetres[2] += 0.12;
        upperLeft.rotationDegrees[1] -= 3;
        const crown = primitive(program, 'tor-crown');
        crown.centerMetres[0] += 0.16;
        crown.rotationDegrees[2] -= 2;
      });
    },
  }),
  'rock-v2-pillar-residual-001': Object.freeze({
    procedural: Object.freeze({
      parameter: 'heightWidthRatioDelta',
      targetIds: [
        'pillar-body',
        'pillar-left-spine',
        'pillar-right-spine',
        'pillar-front-buttress',
        'pillar-ledge-low',
        'pillar-ledge-high',
        'pillar-crown',
      ],
      value: 0.04,
    }),
    invalid: Object.freeze({ parameter: 'heightWidthRatioDelta', value: 0.22 }),
    manual(source) {
      return manualProgram(source, (program) => {
        const body = primitive(program, 'pillar-body');
        body.rotationDegrees[2] -= 1.5;
        const middle = body.levels.find((level) => level.yMetres === 1.28);
        middle.verticesMetres = middle.verticesMetres.map(([x, z]) => [x + 0.12, z]);
        const highLedge = primitive(program, 'pillar-ledge-high');
        highLedge.centerMetres[0] += 0.18;
        highLedge.radiiMetres[0] *= 0.94;
        const crown = primitive(program, 'pillar-crown');
        crown.centerMetres[0] -= 0.18;
      });
    },
  }),
  'rock-v2-arch-sandstone-001': Object.freeze({
    procedural: Object.freeze({
      parameter: 'openingWidthDelta',
      targetIds: ['arch-opening'],
      value: 0.05,
    }),
    invalid: Object.freeze({ parameter: 'openingWidthDelta', targetIds: ['arch-opening'], value: 0.2 }),
    manual(source) {
      return manualProgram(source, (program) => {
        const opening = primitive(program, 'arch-opening');
        opening.centerMetres[0] += 0.22;
        opening.radiiMetres[0] *= 0.98;
        const right = primitive(program, 'arch-right-buttress');
        right.centerMetres[2] += 0.18;
        right.rotationDegrees[1] += 2;
        const crown = primitive(program, 'arch-crown');
        crown.centerMetres[0] -= 0.12;
      });
    },
  }),
  'rock-v2-cliff-module-straight-001': Object.freeze({
    procedural: Object.freeze({
      parameter: 'faceReliefFraction',
      targetIds: ['cliff-buttress-left', 'cliff-buttress-mid', 'cliff-buttress-right'],
      value: 0.045,
    }),
    invalid: Object.freeze({ parameter: 'faceReliefFraction', targetIds: ['cliff-buttress-mid'], value: 0.18 }),
    manual(source) {
      return manualProgram(source, (program) => {
        const middle = primitive(program, 'cliff-buttress-mid');
        middle.centerMetres[0] += 0.45;
        middle.centerMetres[2] += 0.26;
        const highLedge = primitive(program, 'cliff-ledge-high');
        highLedge.centerMetres[0] -= 0.55;
        highLedge.rotationDegrees[2] -= 0.8;
        const rightGully = primitive(program, 'cliff-gully-right');
        rightGully.centerMetres[0] += 0.18;
      });
    },
  }),
  'rock-v2-mountain-modular-bedrock-001': Object.freeze({
    procedural: Object.freeze({
      parameter: 'reliefFraction',
      targetIds: ['mountain-left-buttress', 'mountain-right-buttress', 'mountain-front-rib'],
      value: 0.035,
    }),
    invalid: Object.freeze({ parameter: 'reliefFraction', targetIds: ['mountain-front-rib'], value: 0.14 }),
    manual(source) {
      return manualProgram(source, (program) => {
        const frontRib = primitive(program, 'mountain-front-rib');
        frontRib.centerMetres[0] += 0.7;
        frontRib.centerMetres[2] += 0.45;
        frontRib.rotationDegrees[2] -= 1.5;
        const rightCrown = primitive(program, 'mountain-crown-right');
        rightCrown.centerMetres[0] += 0.5;
        rightCrown.halfHeightMetres *= 0.94;
      });
    },
  }),
  'rock-v2-hoodoo-caprock-001': Object.freeze({
    procedural: Object.freeze({
      parameter: 'heightWidthRatioDelta',
      targetIds: ['hoodoo-body'],
      value: 0.04,
    }),
    invalid: Object.freeze({ parameter: 'heightWidthRatioDelta', targetIds: ['hoodoo-body'], value: 0.22 }),
    manual(source) {
      return manualProgram(source, (program) => {
        const body = primitive(program, 'hoodoo-body');
        for (const level of body.levels) {
          const centre = level.verticesMetres.reduce(
            (sum, vertex) => [sum[0] + vertex[0] / level.verticesMetres.length, sum[1] + vertex[1] / level.verticesMetres.length],
            [0, 0],
          );
          level.verticesMetres = level.verticesMetres.map(([x, z]) => {
            if (level.morphologyZone === 'cap') return [centre[0] + (x - centre[0]) * 1.025 + 0.055, z];
            if (level.morphologyZone === 'neck') return [centre[0] + (x - centre[0]) * 0.97, z - 0.02];
            if (level.morphologyZone === 'shaft' && level.yMetres > -0.2) return [x + 0.035, z];
            return [x, z];
          });
        }
      });
    },
  }),
});

export function getAuthoredCanonicalVariationPlan(sourceId) {
  const plan = PLANS[sourceId];
  if (!plan) throw new RangeError(`No authored canonical variation plan for ${sourceId}.`);
  return plan;
}

export function createAuthoredCanonicalRevisions(fixture) {
  const plan = getAuthoredCanonicalVariationPlan(fixture.source.sourceId);
  const procedural = reviseEditableSourcePackage(fixture.source, {
    kind: 'procedural-modifier',
    label: 'safe-procedural-review-variation',
    modifier: plan.procedural,
  });
  const manual = reviseEditableSourcePackage(fixture.source, {
    controlProgram: plan.manual(fixture.source),
    kind: 'manual-control-program',
    label: 'manual-control-cage-review-variation',
  });
  return Object.freeze({
    canonical: fixture.source,
    manual,
    procedural,
  });
}

export function expectOutOfEnvelopeRejection(fixture) {
  const plan = getAuthoredCanonicalVariationPlan(fixture.source.sourceId);
  try {
    reviseEditableSourcePackage(fixture.source, {
      kind: 'procedural-modifier',
      label: 'intentional-out-of-envelope-fixture',
      modifier: plan.invalid,
    });
  } catch (error) {
    if (error?.code === 'modifier-outside-envelope') {
      return Object.freeze({ code: error.code, passed: true });
    }
    throw error;
  }
  return Object.freeze({ code: null, passed: false });
}
