import assert from 'node:assert/strict';

import {
  createPlantGraph,
  validatePlantGraph,
} from '../src/vegetation/experimental.js';

const REPRESENTATIVE_ARCHITECTURES = Object.freeze([
  { id: 'broadleaf-decurrent', speciesProfileId: 'quercus-robur' },
  { id: 'vase', speciesProfileId: 'ulmus-americana' },
  {
    id: 'columnar',
    speciesProfileId: 'populus-nigra',
    traitOverrides: { crownMode: 'columnar' },
  },
  {
    id: 'weeping',
    speciesProfileId: 'salix-alba',
    traitOverrides: { crownMode: 'weeping' },
  },
  {
    id: 'spreading',
    speciesProfileId: 'samanea-saman',
    traitOverrides: { crownMode: 'spreading' },
  },
  { id: 'pine', speciesProfileId: 'pinus-sylvestris' },
  { id: 'spruce', speciesProfileId: 'picea-abies' },
  { id: 'fir', speciesProfileId: 'abies-alba' },
]);

const SEEDS = Object.freeze([13, 41, 97]);
const DEVELOPMENT_SAMPLES = Object.freeze([0.28, 0.5, 0.88]);
const STRUCTURAL_SEMANTICS = new Set(['trunk', 'branch', 'twig']);

function graphBounds(graph) {
  const points = graph.segments.flatMap((segment) => [segment.start, segment.end]);
  const axes = [0, 1, 2].map((component) => {
    const values = points.map((point) => point[component]);
    return [Math.min(...values), Math.max(...values)];
  });
  return {
    height: axes[1][1] - Math.min(0, axes[1][0]),
    span: Math.max(axes[0][1] - axes[0][0], axes[2][1] - axes[2][0]),
  };
}

function structuralTopology(graph) {
  const axisIds = new Set(
    graph.segments
      .filter((segment) => STRUCTURAL_SEMANTICS.has(segment.semantic))
      .map((segment) => segment.axisId),
  );
  return graph.axes
    .filter((axis) => axisIds.has(axis.id))
    .map((axis) => ({
      id: axis.id,
      kind: axis.kind,
      level: axis.level ?? null,
      parentAxisId: axis.parentAxisId,
    }));
}

function directionOf(segment) {
  const vector = segment.end.map((value, index) => value - segment.start[index]);
  const length = Math.hypot(...vector);
  return vector.map((value) => value / Math.max(length, 1e-8));
}

function terminalBranchHeight(graph) {
  const parentIds = new Set(graph.segments.map((segment) => segment.parentPartId));
  const tips = graph.segments.filter(
    (segment) => (
      (segment.semantic === 'branch' || segment.semantic === 'twig')
      && !parentIds.has(segment.partId)
    ),
  );
  return tips.reduce((sum, segment) => sum + segment.end[1], 0)
    / Math.max(1, tips.length);
}

let graphCount = 0;
for (const architecture of REPRESENTATIVE_ARCHITECTURES) {
  for (const geometrySeed of SEEDS) {
    const graphs = DEVELOPMENT_SAMPLES.map((developmentProgress) => createPlantGraph({
      speciesProfileId: architecture.speciesProfileId,
      lifeStage: 'mature',
      developmentProgress,
      geometrySeed,
      traitOverrides: architecture.traitOverrides,
    }));
    graphCount += graphs.length;

    for (const graph of graphs) {
      const validation = validatePlantGraph(graph);
      assert.equal(
        validation.ok,
        true,
        `${architecture.id}/${geometrySeed}: ${validation.errors.join(' ')}`,
      );
      assert.equal(graph.growthModel, 'toonlab-recursive-woody-v3');
      assert.ok(graph.pipeModel?.exponent >= 1.6 && graph.pipeModel?.exponent <= 3.2);
      assert.ok(
        graph.segments
          .filter((segment) => STRUCTURAL_SEMANTICS.has(segment.semantic))
          .every((segment) => segment.openEnded),
        `${architecture.id} keeps graph junction tubes open`,
      );
    }

    const heights = graphs.map((graph) => graphBounds(graph).height);
    assert.ok(
      heights[0] < heights[1] && heights[1] < heights[2],
      `${architecture.id}/${geometrySeed} grows continuously with age`,
    );
    assert.deepEqual(
      structuralTopology(graphs[2]),
      structuralTopology(graphs[1]),
      `${architecture.id}/${geometrySeed} preserves its mature scaffold`,
    );

    const repeat = createPlantGraph({
      speciesProfileId: architecture.speciesProfileId,
      lifeStage: 'mature',
      developmentProgress: DEVELOPMENT_SAMPLES[1],
      geometrySeed,
      traitOverrides: architecture.traitOverrides,
    });
    assert.equal(repeat.structuralHash, graphs[1].structuralHash);
    assert.deepEqual(repeat.segments, graphs[1].segments);
  }
}

const curvedOak = createPlantGraph({
  speciesProfileId: 'quercus-robur',
  lifeStage: 'mature',
  geometrySeed: 41,
});
const trunkDirections = curvedOak.segments
  .filter((segment) => segment.semantic === 'trunk')
  .map(directionOf);
assert.ok(trunkDirections.length >= 7, 'woody trunks use multiple curve segments');
assert.ok(
  new Set(trunkDirections.map((vector) => vector.map((value) => value.toFixed(3)).join(':')))
    .size >= 4,
  'woody trunks carry a changing tangent instead of one straight cylinder',
);
assert.ok(
  Math.max(...curvedOak.axes.map((axis) => axis.level ?? 0)) >= 4,
  'mature broadleaf topology reaches fine terminal branch orders',
);
const childAxisStarts = curvedOak.segments.filter((segment) => (
  STRUCTURAL_SEMANTICS.has(segment.semantic) && segment.junctionBulge != null
));
assert.ok(childAxisStarts.length > 10, 'branch axes carry explicit junction transitions');
assert.ok(
  childAxisStarts.every((segment) => (
    segment.junctionBulge >= 1
    && segment.junctionInset >= 0.35
    && segment.junctionTransition > 0
  )),
  'every child axis starts with an embedded smooth parent-radius transition',
);
const oakTrunkBase = curvedOak.segments.find(
  (segment) => segment.semantic === 'trunk' && segment.sectionIndex === 0,
);
assert.ok(oakTrunkBase?.baseFlare >= 1.2, 'standard woody trunks widen into the root crown');
const oakRootFlares = curvedOak.roots.filter((segment) => segment.semantic === 'root-flare');
assert.equal(oakRootFlares.length, 5, 'standard woody roots expose five structural flare axes');
assert.ok(
  oakRootFlares.every((segment) => (
    segment.openEnded
    && segment.start[1] < 0
    && segment.end[1] < segment.start[1]
    && segment.start[1] + segment.radiusStart < -0.005
    && segment.end[1] + segment.radiusEnd < -0.005
    && Math.hypot(segment.start[0], segment.start[2]) < oakTrunkBase.radiusStart * 0.4
    && segment.radiusEnd <= segment.radiusStart * 0.05
  )),
  'standard roots remain below grade, begin inside the trunk crown, and taper without exposed caps',
);
const structuralParentPartIds = new Set(
  curvedOak.segments
    .filter((segment) => STRUCTURAL_SEMANTICS.has(segment.semantic))
    .map((segment) => segment.parentPartId),
);
const terminalSegments = curvedOak.segments.filter((segment) => (
  STRUCTURAL_SEMANTICS.has(segment.semantic)
  && !structuralParentPartIds.has(segment.partId)
));
assert.ok(terminalSegments.length > 20, 'mature oak exposes a fine terminal scaffold');
assert.ok(
  terminalSegments.every((segment) => segment.radiusEnd <= segment.radiusStart * 0.205),
  'terminal axes taper to living tips instead of pollarded cut ends',
);

const columnar = createPlantGraph({
  speciesProfileId: 'quercus-robur',
  lifeStage: 'mature',
  geometrySeed: 41,
  traitOverrides: { crownMode: 'columnar' },
});
const spreading = createPlantGraph({
  speciesProfileId: 'quercus-robur',
  lifeStage: 'mature',
  geometrySeed: 41,
  traitOverrides: { crownMode: 'spreading' },
});
const vase = createPlantGraph({
  speciesProfileId: 'quercus-robur',
  lifeStage: 'mature',
  geometrySeed: 41,
  traitOverrides: { crownMode: 'vase' },
});
assert.ok(
  graphBounds(columnar).span < graphBounds(columnar).height * 0.42,
  'columnar mode constrains lateral crown spread',
);
assert.ok(
  graphBounds(spreading).span > graphBounds(columnar).span * 4,
  'spreading mode allocates a materially wider crown envelope',
);
assert.ok(
  graphBounds(vase).span > graphBounds(columnar).span * 2,
  'vase mode opens above a compact lower crown',
);

const unsagged = createPlantGraph({
  speciesProfileId: 'quercus-robur',
  lifeStage: 'mature',
  geometrySeed: 41,
  traitOverrides: {
    branchSag: 0,
    gravitropism: 0,
    phototropism: 0,
    tipUpturn: 0,
  },
});
const sagged = createPlantGraph({
  speciesProfileId: 'quercus-robur',
  lifeStage: 'mature',
  geometrySeed: 41,
  traitOverrides: {
    branchSag: 0.18,
    gravitropism: 0,
    phototropism: 0,
    tipUpturn: 0,
  },
});
assert.ok(
  terminalBranchHeight(sagged) < terminalBranchHeight(unsagged) - 0.5,
  'branch sag acts on axis growth rather than being a UI-only parameter',
);

const denseInternodes = createPlantGraph({
  speciesProfileId: 'quercus-rubra',
  lifeStage: 'mature',
  geometrySeed: 41,
  traitOverrides: { branchInternodeSpacing: 0.2, crownMode: 'monopodial' },
});
const sparseInternodes = createPlantGraph({
  speciesProfileId: 'quercus-rubra',
  lifeStage: 'mature',
  geometrySeed: 41,
  traitOverrides: { branchInternodeSpacing: 1.4, crownMode: 'monopodial' },
});
const primaryBranchCount = (graph) => {
  const trunkAxis = graph.axes.find((axis) => axis.kind === 'primary-trunk');
  return graph.axes.filter(
    (axis) => axis.kind === 'branch' && axis.parentAxisId === trunkAxis.id,
  ).length;
};
assert.ok(
  primaryBranchCount(denseInternodes) > primaryBranchCount(sparseInternodes) * 2,
  'internode spacing controls primary branch density',
);

const whorledOak = createPlantGraph({
  speciesProfileId: 'quercus-robur',
  lifeStage: 'mature',
  geometrySeed: 41,
  traitOverrides: { branchWhorlSize: 3, primaryBranchCount: 6 },
});
const firstSegmentByAxis = new Map();
for (const segment of whorledOak.segments.filter(
  (entry) => entry.semantic === 'branch' && entry.level === 1,
)) {
  if (!firstSegmentByAxis.has(segment.axisId)) firstSegmentByAxis.set(segment.axisId, segment);
}
const starts = new Map();
for (const segment of firstSegmentByAxis.values()) {
  const key = segment.start.map((value) => value.toFixed(5)).join(':');
  starts.set(key, (starts.get(key) ?? 0) + 1);
}
assert.ok(
  [...starts.values()].filter((count) => count >= 3).length >= 2,
  'whorl size creates co-located branch complements on successive internodes',
);

const shortTree = createPlantGraph({
  speciesProfileId: 'quercus-robur',
  lifeStage: 'mature',
  geometrySeed: 41,
  traitOverrides: { height: 6 },
});
const tallTree = createPlantGraph({
  speciesProfileId: 'quercus-robur',
  lifeStage: 'mature',
  geometrySeed: 41,
  traitOverrides: { height: 12 },
});
assert.ok(
  graphBounds(tallTree).height > graphBounds(shortTree).height * 1.7,
  'height changes the grown scaffold rather than camera scale',
);

console.log(
  `Verified ${graphCount} woody development probes across `
  + `${REPRESENTATIVE_ARCHITECTURES.length} architectures, `
  + `${SEEDS.length} seeds, and ${DEVELOPMENT_SAMPLES.length} ages.`,
);
