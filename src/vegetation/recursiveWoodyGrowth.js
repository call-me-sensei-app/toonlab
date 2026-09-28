// Native curve-based woody growth evaluator.
//
// ToonLab's first-party Three.js implementation uses a smoothed leader curve,
// repeated branch orders distributed over finite spawn bands,
// generation-dependent width/length decay, crown profiles, axis deformation,
// and foliage carried by the resulting terminal shoots. It consumes only the
// neutral Toonlab trait contract and emits the public semantic plant graph.

const TAU = Math.PI * 2;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

const MODE_RULES = Object.freeze({
  monopodial: { trunkFraction: 1, primaryAngle: 0.78, reach: 0.82, leaderStrength: 1 },
  excurrent: { trunkFraction: 1, primaryAngle: 0.82, reach: 0.86, leaderStrength: 1 },
  'sparse-excurrent': { trunkFraction: 1, primaryAngle: 0.9, reach: 0.92, leaderStrength: 1 },
  layered: { trunkFraction: 0.98, primaryAngle: 0.96, reach: 0.96, leaderStrength: 0.92 },
  decurrent: { trunkFraction: 0.88, primaryAngle: 1.05, reach: 1.08, leaderStrength: 0.62 },
  sympodial: { trunkFraction: 0.72, primaryAngle: 1.08, reach: 1.12, leaderStrength: 0.48 },
  vase: { trunkFraction: 0.58, primaryAngle: 1.2, reach: 1.72, leaderStrength: 0.42 },
  colonized: { trunkFraction: 0.86, primaryAngle: 1.04, reach: 1.1, leaderStrength: 0.64 },
  umbrella: { trunkFraction: 0.82, primaryAngle: 1.22, reach: 1.52, leaderStrength: 0.54 },
  spreading: { trunkFraction: 0.76, primaryAngle: 1.18, reach: 1.5, leaderStrength: 0.5 },
  columnar: { trunkFraction: 1, primaryAngle: 0.52, reach: 0.54, leaderStrength: 1 },
  weeping: { trunkFraction: 0.82, primaryAngle: 1.12, reach: 1.12, leaderStrength: 0.58 },
  dense: { trunkFraction: 1, primaryAngle: 1, reach: 1.08, leaderStrength: 1 },
  open: { trunkFraction: 1, primaryAngle: 0.98, reach: 1.18, leaderStrength: 1 },
  sparse: { trunkFraction: 1, primaryAngle: 0.96, reach: 1.04, leaderStrength: 1 },
  'scale-spray': { trunkFraction: 1, primaryAngle: 0.88, reach: 0.74, leaderStrength: 1 },
  deciduous: { trunkFraction: 1, primaryAngle: 0.98, reach: 1.02, leaderStrength: 1 },
  giant: { trunkFraction: 1, primaryAngle: 1, reach: 1.16, leaderStrength: 1 },
  relict: { trunkFraction: 1, primaryAngle: 0.94, reach: 1.08, leaderStrength: 1 },
});

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, Number(value) || 0));
}

function clamp01(value) {
  return clamp(value, 0, 1);
}

function length(vector) {
  return Math.hypot(vector[0], vector[1], vector[2]);
}

function normalize(vector, fallback = [0, 1, 0]) {
  const magnitude = length(vector);
  return magnitude > 1e-8
    ? vector.map((component) => component / magnitude)
    : [...fallback];
}

function add(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scale(vector, amount) {
  return vector.map((component) => component * amount);
}

function mix(a, b, amount) {
  return [
    a[0] * (1 - amount) + b[0] * amount,
    a[1] * (1 - amount) + b[1] * amount,
    a[2] * (1 - amount) + b[2] * amount,
  ];
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function frame(direction) {
  const forward = normalize(direction);
  const reference = Math.abs(forward[1]) > 0.92 ? [1, 0, 0] : [0, 1, 0];
  const right = normalize(cross(reference, forward), [1, 0, 0]);
  return { forward, right, up: normalize(cross(forward, right), [0, 0, 1]) };
}

function radialDirection(parentDirection, azimuth, angle) {
  const basis = frame(parentDirection);
  const radial = add(
    scale(basis.right, Math.cos(azimuth)),
    scale(basis.up, Math.sin(azimuth)),
  );
  return normalize(add(
    scale(basis.forward, Math.cos(angle)),
    scale(radial, Math.sin(angle)),
  ));
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function axisRandom(graph, label) {
  const traits = graph.resolvedTraits ?? {};
  const controlSeed = label.startsWith('foliage')
    ? traits.foliageSeed
    : label.startsWith('structure') || label.startsWith('crown-attraction')
      ? (traits.branchSeed ?? traits.formSeed)
      : traits.branchSeed;
  const seedToken = Number.isFinite(controlSeed) ? `:${controlSeed}` : '';
  return mulberry32(hashString(
    `${graph.speciesProfileId}:${graph.geometrySeed}${seedToken}:${label}`,
  ));
}

function smoothstep(edge0, edge1, value) {
  if (edge1 <= edge0) return value >= edge1 ? 1 : 0;
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function crownProfileValue(profile, normalizedHeight) {
  const t = clamp01(normalizedHeight);
  const spherical = Math.sqrt(Math.max(0, 1 - (t * 2 - 1) ** 2));
  const softLinear = 1 - t * 0.72;
  const curved = Math.sin(t * Math.PI * 0.5);
  const profiles = {
    linear: 1 - t,
    'soft-linear': softLinear,
    curved,
    'soft-curve': 0.34 + Math.sin(t * Math.PI) * 0.66,
    spherical,
    'inverse-soft-linear': 0.38 + t * 0.62,
    'inverse-curved': 1 - curved * 0.72,
    'inverse-soft-curve': 0.9 - Math.sin(t * Math.PI) * 0.42,
    'inverse-spherical': 0.44 + (1 - spherical) * 0.56,
  };
  return clamp(profiles[profile] ?? spherical, 0.12, 1.2);
}

function pointOnRings(rings, fraction) {
  const scaled = clamp01(fraction) * Math.max(1, rings.length - 1);
  const index = Math.min(rings.length - 2, Math.floor(scaled));
  const alpha = scaled - index;
  const start = rings[index];
  const end = rings[index + 1];
  return {
    direction: normalize(mix(start.direction, end.direction, alpha)),
    parentPartId: end.parentPartId,
    position: mix(start.position, end.position, alpha),
    radius: start.radius * (1 - alpha) + end.radius * alpha,
  };
}

function crownLimit(mode, traits, stageScale, y, treeHeight) {
  const crownBottom = treeHeight * clamp(traits.branchStart ?? 0.32, 0.04, 0.9);
  const t = clamp01((y - crownBottom) / Math.max(0.01, treeHeight - crownBottom));
  const profile = mode === 'columnar' ? 0.42 + Math.sin(Math.PI * t) * 0.12
    : mode === 'vase' ? 0.24 + t * 0.9
      : mode === 'umbrella' || mode === 'spreading' ? 0.78 + t * 0.42
        : mode === 'monopodial' || mode === 'excurrent' || mode === 'sparse-excurrent'
          ? 0.3 + (1 - t) * 0.86
          : 0.52 + Math.sin(Math.PI * t) * 0.5;
  return {
    x: Math.max(0.2, traits.crownWidth * stageScale * 0.5 * profile),
    z: Math.max(0.2, traits.crownDepth * stageScale * 0.5 * profile),
  };
}

function steerInsideCrown(direction, position, step, mode, traits, stageScale, treeHeight) {
  if (mode === 'umbrella' || mode === 'spreading' || mode === 'vase') return direction;
  const candidate = add(position, scale(direction, step));
  const limit = crownLimit(mode, traits, stageScale, candidate[1], treeHeight);
  const score = Math.hypot(candidate[0] / limit.x, candidate[2] / limit.z);
  if (score <= 1) return direction;
  const inward = normalize([-candidate[0], Math.max(-0.08, direction[1]), -candidate[2]]);
  return normalize(mix(direction, inward, clamp((score - 1) * 0.46, 0.08, 0.52)));
}

function deformedDirection({
  baseDirection,
  mode,
  noise,
  order,
  progress,
  rng,
  traits,
}) {
  const basis = frame(baseDirection);
  const phase = progress * TAU * (1.1 + order * 0.42) + rng() * 0.2;
  const radial = add(
    scale(basis.right, Math.sin(phase)),
    scale(basis.up, Math.cos(phase * 0.83)),
  );
  let result = normalize(add(baseDirection, scale(radial, noise)));
  const sag = clamp(
    traits.branchSag ?? (mode === 'weeping' ? 0.16 : 0.018),
    0,
    0.32,
  );
  if (order > 0 && sag > 0) {
    result = normalize([
      result[0],
      result[1] - sag * 2.15 * progress ** 1.45 * (0.7 + order * 0.22),
      result[2],
    ]);
  }
  const upturn = clamp(traits.tipUpturn ?? 0.08, 0, 0.52)
    * smoothstep(0.55, 1, progress);
  if (upturn > 0 && mode !== 'umbrella') {
    result = normalize(mix(result, [result[0] * 0.3, 1, result[2] * 0.3], upturn));
  }
  if (mode === 'columnar') {
    result = normalize([result[0] * 0.58, Math.max(0.12, result[1]), result[2] * 0.58]);
  }
  return result;
}

export function growRecursiveWoody(builder, profile, traits, _rng, stageScale, stageSlot) {
  const { axis, attachment, segment } = builder;
  const mode = traits.crownMode ?? profile.axisMode ?? 'decurrent';
  const modeRules = MODE_RULES[mode] ?? MODE_RULES.decurrent;
  // Ginkgo remains a gymnosperm taxonomically, but its long/short shoot
  // architecture is a woody branching crown rather than a needle-bearing
  // annual whorl system.
  const conifer = profile.engine === 'whorled-conifer'
    && !traits.ginkgoBranching
    && profile.foliageOrgan !== 'broad-leaf';
  const development = clamp01(builder.graph.developmentProgress ?? stageSlot / 4);
  const treeHeight = Math.max(0.25, traits.height * stageScale);
  const baseRadius = Math.max(
    0.008,
    traits.trunkRadius * Math.max(0.44, stageScale ** 0.72),
  );
  const orderCount = clamp(Math.round(traits.levels ?? 3), 1, 4);
  const branchDensity = clamp(
    traits.branchDensity ?? traits.children * (conifer ? 1.4 : 1.75),
    1,
    48,
  );
  const densityExponent = clamp(traits.branchDensityExponent ?? 1, 0.05, 1.8);
  const lengthDecay = clamp(traits.lengthRatio ?? traits.levelLengthDecay ?? 0.52, 0.26, 0.82);
  const widthDecay = clamp(traits.radiusRatio ?? traits.levelRadiusDecay ?? 0.68, 0.42, 0.9);
  const angleJitter = clamp(traits.branchAngleJitter ?? 18, 0, 45) * Math.PI / 180;
  const phyllotaxis = Number.isFinite(traits.phyllotaxisAngle)
    ? traits.phyllotaxisAngle * Math.PI / 180
    : GOLDEN_ANGLE;
  const crownProfile = traits.baselineCrownProfile ?? (
    conifer ? 'linear'
      : mode === 'vase' ? 'curved'
        : mode === 'spreading' || mode === 'umbrella' ? 'inverse-soft-linear'
          : mode === 'monopodial' || mode === 'excurrent' ? 'soft-linear'
            : 'spherical'
  );
  // Conifer identity comes from complete annual whorls plus explicit
  // needle-bearing sprays. Spending the broadleaf recursion budget on hidden
  // third-order twigs only bloats the source mesh and obscures those tiers.
  // Reserve that detail for the semantic sprays and cap intermediary woody
  // axes at a reviewed native-conifer budget.
  const maxAxes = conifer
    ? clamp(Math.round(traits.axisBudget ?? 160), 110, 160)
    : clamp(Math.round(traits.axisBudget ?? 420), 80, 900);
  const structureRng = axisRandom(builder.graph, 'structure');
  let emittedAxes = 0;

  const smoothnessScale = 1 + clamp(traits.surfaceSmoothness ?? 0, 0, 1) * 0.65;
  const trunkSections = clamp(
    Math.round((traits.trunkSections ?? 14) * smoothnessScale),
    8,
    40,
  );
  const trunkAxis = axis('primary-trunk', null, {
    algorithm: 'recursive-curve-growth',
    level: 0,
    mode,
  });
  const trunkRings = [{
    direction: [0, 1, 0],
    parentPartId: null,
    position: [0, 0, 0],
    radius: baseRadius,
  }];
  let trunkPosition = [0, 0, 0];
  let trunkDirection = [0, 1, 0];
  let trunkParentPartId = null;
  const leanHeading = structureRng() * TAU;
  const leanAmount = (traits.lean <= 0.3 ? traits.lean * treeHeight : traits.lean)
    * (0.45 + development * 0.55);
  const trunkNoise = clamp(traits.trunkNoise ?? 0.04, 0, 0.28);
  const helicalTurns = Number(traits.helicalTurns ?? 0) || Number(traits.twist ?? 0) / TAU;
  const helicalSpan = Number(traits.helicalSpan ?? traits.bend ?? 0);
  for (let sectionIndex = 0; sectionIndex < trunkSections; sectionIndex += 1) {
    const startT = sectionIndex / trunkSections;
    const endT = (sectionIndex + 1) / trunkSections;
    const helicalPhase = endT * TAU * helicalTurns + leanHeading;
    const leanVector = [
      Math.cos(leanHeading) * leanAmount * (1.15 * endT ** 1.42),
      0,
      Math.sin(leanHeading) * leanAmount * (1.15 * endT ** 1.42),
    ];
    const helicalVector = [
      Math.cos(helicalPhase) * helicalSpan * Math.sin(Math.PI * endT),
      0,
      Math.sin(helicalPhase) * helicalSpan * Math.sin(Math.PI * endT),
    ];
    const target = [
      leanVector[0] + helicalVector[0],
      treeHeight * endT,
      leanVector[2] + helicalVector[2],
    ];
    const targetDirection = normalize([
      target[0] - trunkPosition[0],
      target[1] - trunkPosition[1],
      target[2] - trunkPosition[2],
    ]);
    const noiseBasis = frame(targetDirection);
    const phase = endT * TAU * (2.4 + stageSlot * 0.17);
    trunkDirection = normalize(add(
      targetDirection,
      scale(add(
        scale(noiseBasis.right, Math.sin(phase)),
        scale(noiseBasis.up, Math.cos(phase * 0.73)),
      ), trunkNoise * baseRadius),
    ));
    const end = sectionIndex === trunkSections - 1
      ? target
      : add(trunkPosition, scale(trunkDirection, treeHeight / trunkSections));
    const tipExponent = traits.tipProfile === 'sharp'
      ? 1.45
      : traits.tipProfile === 'linear'
        ? 1
        : 0.72;
    const radiusStart = baseRadius * Math.pow(1 - startT * 0.72, tipExponent);
    const radiusEnd = Math.max(
      baseRadius * (traits.tipProfile === 'sharp' ? 0.01 : 0.025),
      baseRadius * Math.pow(1 - endT * 0.82, tipExponent),
    );
    const entry = segment(
      trunkAxis,
      'trunk',
      trunkPosition,
      end,
      radiusStart,
      radiusEnd,
      {
        algorithm: 'recursive-curve-growth',
        baseFlare: sectionIndex === 0 ? clamp(traits.baseFlare ?? 1.2, 1, 1.5) : 1,
        baseFlareTransition: sectionIndex === 0
          ? clamp(traits.baseFlareTransition ?? 0.28, 0.12, 0.46)
          : undefined,
        level: 0,
        openEnded: true,
        parentPartId: trunkParentPartId,
        sectionIndex,
      },
    );
    trunkPosition = end;
    trunkParentPartId = entry.partId;
    trunkRings.push({
      direction: trunkDirection,
      parentPartId: entry.partId,
      position: end,
      radius: radiusEnd,
    });
  }

  const terminalAxes = [];
  const foliageAxes = [];
  const colonizationPoints = [];
  if (mode === 'colonized') {
    const attractionRng = axisRandom(builder.graph, 'crown-attraction-field');
    const crownBase = treeHeight * clamp(traits.branchStart ?? 0.32, 0.08, 0.82);
    const halfWidth = Math.max(0.25, traits.crownWidth * stageScale * 0.5);
    const halfDepth = Math.max(0.25, traits.crownDepth * stageScale * 0.5);
    const attractionCount = clamp(Math.round(traits.attractionCount ?? 96), 32, 180);
    for (let index = 0; index < attractionCount; index += 1) {
      const heightT = Math.pow(attractionRng(), 0.78);
      const radius = Math.sqrt(attractionRng());
      const angle = attractionRng() * TAU;
      const envelope = 0.42 + Math.sin(heightT * Math.PI) * 0.58;
      colonizationPoints.push([
        Math.cos(angle) * halfWidth * radius * envelope,
        crownBase + (treeHeight - crownBase) * heightT,
        Math.sin(angle) * halfDepth * radius * envelope,
      ]);
    }
  }
  // Branch orders are expanded breadth-first. A depth-first budget spends
  // the whole tree on the first few scaffold limbs, leaving later whorls and
  // crown sectors bare even though their primary axes were valid.
  const pendingBranches = [];
  const emitBranch = ({
    angle,
    azimuth,
    axisKind = null,
    length: requestedLength,
    order,
    originRing,
    parentAxisId,
    seedLabel,
    whorl = null,
  }) => {
    if (emittedAxes >= maxAxes || order > orderCount || requestedLength < treeHeight * 0.012) {
      return null;
    }
    const birthThreshold = 0.08 + order * 0.08;
    const growth = smoothstep(birthThreshold, Math.min(0.86, birthThreshold + 0.28), development);
    if (growth <= 0.015) return null;
    emittedAxes += 1;
    const localRng = axisRandom(builder.graph, `${seedLabel}:o${order}`);
    const grownLength = requestedLength * (0.08 + growth * 0.92);
    const sectionCount = clamp(
      Math.round(
        (traits.branchSections ?? 6)
          * (order === 1 ? 1 : 0.78)
          * smoothnessScale,
      ),
      order === orderCount ? 3 : 4,
      12,
    );
    const branchAxis = axis(
      axisKind ?? (order >= orderCount ? 'terminal-shoot' : 'branch'),
      parentAxisId,
      {
      algorithm: mode === 'colonized'
        ? 'space-colonization'
        : 'recursive-curve-growth',
      birthProgress: Number(birthThreshold.toFixed(4)),
      level: order,
      mode,
      whorl,
      },
    );
    let currentDirection = radialDirection(
      originRing.direction,
      azimuth,
      clamp(angle + (localRng() - 0.5) * angleJitter, 0.05, Math.PI * 0.49),
    );
    const radialOutward = normalize(
      [originRing.position[0], 0, originRing.position[2]],
      [Math.cos(azimuth), 0, Math.sin(azimuth)],
    );
    // Higher-order branches should colonize the available crown volume rather
    // than repeatedly folding back across the trunk. Preserve the local
    // phyllotactic direction, but bias fine axes toward their radial sector.
    currentDirection = normalize(mix(
      currentDirection,
      [radialOutward[0], Math.max(-0.12, currentDirection[1]), radialOutward[2]],
      order === 1 ? 0.12 : 0.38,
    ));
    if (mode === 'umbrella' || mode === 'spreading') {
      currentDirection = normalize([currentDirection[0], currentDirection[1] * 0.34, currentDirection[2]]);
    } else if (mode === 'weeping') {
      currentDirection = normalize([currentDirection[0], currentDirection[1] - 0.2, currentDirection[2]]);
    }
    let currentPosition = [...originRing.position];
    let currentPartId = originRing.parentPartId;
    let colonizationTarget = null;
    if (colonizationPoints.length) {
      let bestScore = Infinity;
      for (const candidate of colonizationPoints) {
        const toCandidate = [
          candidate[0] - currentPosition[0],
          candidate[1] - currentPosition[1],
          candidate[2] - currentPosition[2],
        ];
        const distance = Math.max(length(toCandidate), 1e-5);
        const candidateDirection = scale(toCandidate, 1 / distance);
        const alignment = currentDirection[0] * candidateDirection[0]
          + currentDirection[1] * candidateDirection[1]
          + currentDirection[2] * candidateDirection[2];
        const score = distance * (1.35 - clamp(alignment, -1, 1) * 0.55);
        if (score < bestScore) {
          bestScore = score;
          colonizationTarget = candidate;
        }
      }
      if (colonizationTarget) {
        currentDirection = normalize(mix(
          currentDirection,
          normalize([
            colonizationTarget[0] - currentPosition[0],
            colonizationTarget[1] - currentPosition[1],
            colonizationTarget[2] - currentPosition[2],
          ]),
          order === 1 ? 0.28 : 0.48,
        ));
      }
    }
    const initialRadius = Math.max(baseRadius * 0.008, originRing.radius * widthDecay);
    const rings = [{
      direction: currentDirection,
      parentPartId: currentPartId,
      position: currentPosition,
      radius: initialRadius,
    }];
    const step = grownLength / sectionCount;
    const axisNoise = clamp(
      (traits.branchNoise ?? 0.1) * (0.45 + order * 0.38),
      0,
      0.42,
    );
    for (let sectionIndex = 0; sectionIndex < sectionCount; sectionIndex += 1) {
      const startT = sectionIndex / sectionCount;
      const endT = (sectionIndex + 1) / sectionCount;
      currentDirection = deformedDirection({
        baseDirection: currentDirection,
        mode,
        noise: axisNoise * (0.6 + localRng() * 0.8),
        order,
        progress: endT,
        rng: localRng,
        traits,
      });
      if (colonizationTarget) {
        currentDirection = normalize(mix(
          currentDirection,
          normalize([
            colonizationTarget[0] - currentPosition[0],
            colonizationTarget[1] - currentPosition[1],
            colonizationTarget[2] - currentPosition[2],
          ]),
          0.2 + order * 0.04,
        ));
      }
      currentDirection = steerInsideCrown(
        currentDirection,
        currentPosition,
        step,
        mode,
        traits,
        stageScale,
        treeHeight,
      );
      const end = add(currentPosition, scale(currentDirection, step));
      const branchTipExponent = traits.tipProfile === 'sharp'
        ? 1.5
        : traits.tipProfile === 'linear'
          ? 1
          : 0.74;
      const radiusStart = Math.max(
        baseRadius * 0.004,
        initialRadius * Math.pow(1 - startT * 0.72, branchTipExponent),
      );
      const radiusEnd = Math.max(
        baseRadius * (traits.uniformBranchTips ? 0.0035 : 0.002),
        initialRadius * Math.pow(1 - endT * 0.88, branchTipExponent),
      );
      const entry = segment(
        branchAxis,
        order >= orderCount ? 'twig' : 'branch',
        currentPosition,
        end,
        radiusStart,
        radiusEnd,
        {
          algorithm: mode === 'colonized'
            ? 'space-colonization'
            : 'recursive-curve-growth',
          level: order,
          openEnded: true,
          parentPartId: currentPartId,
          sectionIndex,
          whorl,
        },
      );
      currentPosition = end;
      currentPartId = entry.partId;
      rings.push({
        direction: currentDirection,
        parentPartId: entry.partId,
        position: end,
        radius: radiusEnd,
      });
    }

    // Conifers carry needles along living primary and secondary branchlets,
    // not only on whichever last-order axes happened to fit inside the
    // geometry budget. Register every biologically foliage-bearing axis so
    // upper whorls cannot become bare when a dense lower crown uses more
    // recursive children.
    if (conifer && order >= clamp(traits.foliageFirstBranchOrder ?? 1, 1, orderCount)) {
      foliageAxes.push({ axis: branchAxis, rings, order });
    }

    if (order >= orderCount) {
      terminalAxes.push({ axis: branchAxis, rings });
      if (!conifer) foliageAxes.push({ axis: branchAxis, rings, order });
      return { axis: branchAxis, rings };
    }

    const nextOrder = order + 1;
    const orderDensity = branchDensity
      * Math.pow(0.54, Math.max(0, order - 1) * densityExponent);
    const researchedChildTarget = Number(traits.lateralChildTarget);
    const childCount = clamp(
      Math.round(
        (Number.isFinite(researchedChildTarget) && order <= 2
          ? researchedChildTarget
          : 1.2 + orderDensity * 0.18)
        * (0.94 + localRng() * 0.12),
      ),
      2,
      order === 1 ? 5 : order === 2 ? 3 : 2,
    );
    const spawnStart = clamp(0.18 + order * 0.05, 0.16, 0.52);
    const spawnEnd = clamp(0.9 - order * 0.04, spawnStart + 0.16, 0.94);
    for (let childIndex = 0; childIndex < childCount; childIndex += 1) {
      const fraction = spawnStart
        + ((childIndex + 0.38 + localRng() * 0.24) / childCount) * (spawnEnd - spawnStart);
      const childRing = pointOnRings(rings, fraction);
      const childAzimuth = azimuth
        + childIndex * phyllotaxis
        + order * GOLDEN_ANGLE
        + (localRng() - 0.5) * 0.48;
      const childAngle = clamp(
        (traits.branchAngle * Math.PI / 180)
          * (nextOrder === 2 ? 0.82 : 0.68)
          * (0.86 + localRng() * 0.24),
        0.22,
        Math.PI * 0.47,
      );
      const lengthProfile = 0.58 + Math.sin(Math.PI * fraction) * 0.42;
      pendingBranches.push({
        angle: childAngle,
        azimuth: childAzimuth,
        // Development changes the length of an already-established axis, not
        // whether its children exist. Derive child potential from the mature
        // requested length so medium and old stages retain stable topology.
        length: requestedLength * lengthDecay * lengthProfile * (0.86 + localRng() * 0.25),
        order: nextOrder,
        originRing: childRing,
        parentAxisId: branchAxis.id,
        seedLabel: `${seedLabel}:c${childIndex}`,
        whorl,
      });
    }
    return { axis: branchAxis, rings };
  };

  const crownStart = clamp(traits.branchStart ?? 0.32, 0.04, 0.9);
  const crownEnd = clamp(
    Math.max(
      traits.branchSpawnEnd ?? 0.94,
      conifer || ['monopodial', 'excurrent', 'sparse-excurrent', 'columnar'].includes(mode)
        ? 0.93
        : 0,
    ),
    crownStart + 0.08,
    0.98,
  );
  const primaryWhorlSize = clamp(
    Math.round(
      traits.branchWhorlSize
      ?? traits.whorlArmCount
      ?? (conifer ? 3 : 1),
    ),
    1,
    8,
  );
  const researchedTierCount = conifer
    ? clamp(
      Math.round(
        traits.whorlCountMax
        ?? (traits.height * (crownEnd - crownStart)
          / Math.max(0.08, traits.branchInternodeSpacing ?? 0.72)),
      ),
      5,
      18,
    )
    : null;
  const primaryCount = conifer
    ? researchedTierCount * primaryWhorlSize
    : clamp(
      Math.round(
        traits.primaryBranchCount
          ?? (Number.isFinite(traits.branchInternodeSpacing)
            ? traits.height * (crownEnd - crownStart)
              / Math.max(0.08, traits.branchInternodeSpacing)
            : branchDensity * 1.08),
      ),
      Number.isFinite(traits.primaryBranchCount)
        ? 1
        : mode === 'vase' ? 5 : 7,
      20,
    );
  const primaryAngle = clamp(
    traits.branchAngle * modeRules.primaryAngle * Math.PI / 180,
    0.16,
    Math.PI * 0.49,
  );
  const crownRadius = Math.max(
    0.2,
    Math.max(traits.crownWidth, traits.crownDepth) * stageScale * 0.5,
  );
  const primaryTierCount = Math.ceil(primaryCount / primaryWhorlSize);
  for (let primaryIndex = 0; primaryIndex < primaryCount; primaryIndex += 1) {
    const tierIndex = Math.floor(primaryIndex / primaryWhorlSize);
    const whorlIndex = primaryIndex % primaryWhorlSize;
    let heightFraction = crownStart
      + ((tierIndex + 0.5) / Math.max(1, primaryTierCount)) * (crownEnd - crownStart);
    if (primaryWhorlSize === 1 && !traits.evenBranchDistribution) {
      heightFraction += (structureRng() - 0.5)
        * (crownEnd - crownStart)
        / Math.max(3, primaryTierCount);
    }
    const normalizedCrownHeight = (heightFraction - crownStart)
      / Math.max(0.01, crownEnd - crownStart);
    if (mode === 'vase') heightFraction = crownStart + (heightFraction - crownStart) * 0.26;
    if (mode === 'umbrella') heightFraction = Math.max(0.7, heightFraction);
    if (mode === 'layered' || conifer) {
      const layerCount = conifer ? primaryTierCount : 5;
      heightFraction = crownStart + Math.round(
        ((heightFraction - crownStart) / (crownEnd - crownStart)) * (layerCount - 1),
      ) / Math.max(1, layerCount - 1) * (crownEnd - crownStart);
    }
    const originRing = pointOnRings(trunkRings, heightFraction);
    const profileScale = crownProfileValue(crownProfile, normalizedCrownHeight);
    const primaryLength = crownRadius
      * modeRules.reach
      * profileScale
      * (0.82 + structureRng() * 0.3);
    emitBranch({
      angle: primaryAngle,
      azimuth: primaryWhorlSize > 1
        ? tierIndex * phyllotaxis + whorlIndex / primaryWhorlSize * TAU
        : primaryIndex * phyllotaxis + heightFraction * (traits.twist ?? 0),
      axisKind: conifer ? 'whorl-branch' : null,
      length: primaryLength,
      order: 1,
      originRing,
      parentAxisId: trunkAxis.id,
      seedLabel: `primary:${primaryIndex}`,
      whorl: conifer ? tierIndex : null,
    });
  }

  // Decurrent and sympodial forms divide the leader into a few co-dominant
  // scaffold axes. They use the same recursive evaluator instead of an
  // unrelated crown-filling fallback.
  if (!conifer && !['monopodial', 'excurrent', 'sparse-excurrent', 'columnar'].includes(mode)) {
    const leaderCount = clamp(Math.round(traits.crownLeaderCount ?? 2), 2, 5);
    const leaderOrigin = pointOnRings(
      trunkRings,
      clamp(crownStart * modeRules.trunkFraction, 0.18, 0.76),
    );
    for (let leaderIndex = 0; leaderIndex < leaderCount; leaderIndex += 1) {
      emitBranch({
        angle: primaryAngle * (mode === 'vase' ? 0.86 : 0.62),
        azimuth: leaderIndex / leaderCount * TAU + structureRng() * 0.3,
        axisKind: 'crown-leader',
        length: treeHeight
          * (1 - crownStart)
          * modeRules.leaderStrength
          * (0.82 + structureRng() * 0.24),
        order: 1,
        originRing: leaderOrigin,
        parentAxisId: trunkAxis.id,
        seedLabel: `crown-leader:${leaderIndex}`,
      });
    }
  }

  while (pendingBranches.length && emittedAxes < maxAxes) {
    emitBranch(pendingBranches.shift());
  }

  // A conifer bough carries explicit short needle-bearing sprays. They are
  // semantic axes (and real swept twig geometry), not broadleaf cards glued
  // directly to the primary branch. Keeping exactly three stable sprays on
  // every authored whorl bough gives LOD/export and downstream tools the
  // topology they need while preserving the characteristic layered crown.
  if (conifer) {
    const whorlBoughs = foliageAxes.filter((entry) => entry.axis.kind === 'whorl-branch');
    const sprays = [];
    for (const [boughIndex, bough] of whorlBoughs.entries()) {
      for (let sprayIndex = 0; sprayIndex < 3; sprayIndex += 1) {
        const fraction = [0.38, 0.68, 0.93][sprayIndex];
        const originRing = pointOnRings(bough.rings, fraction);
        const localFrame = frame(originRing.direction);
        const side = sprayIndex % 2 === 0 ? 1 : -1;
        const outward = normalize(add(
          scale(localFrame.right, side * (0.44 + sprayIndex * 0.08)),
          scale(localFrame.up, 0.18 + sprayIndex * 0.08),
        ));
        const direction = normalize(mix(originRing.direction, outward, 0.48));
        const sprayLength = Math.max(
          treeHeight * 0.012,
          crownRadius * (0.055 + sprayIndex * 0.012),
        );
        const sprayAxis = axis('needle-spray', bough.axis.id, {
          algorithm: 'recursive-curve-growth',
          level: Math.min(orderCount + 1, 5),
          mode,
          sprayIndex,
          whorl: bough.axis.whorl,
        });
        const end = add(originRing.position, scale(direction, sprayLength));
        const startRadius = Math.max(baseRadius * 0.004, originRing.radius * 0.38);
        const spraySegment = segment(
          sprayAxis,
          'twig',
          originRing.position,
          end,
          startRadius,
          Math.max(baseRadius * 0.0015, startRadius * 0.24),
          {
            algorithm: 'recursive-curve-growth',
            level: Math.min(orderCount + 1, 5),
            openEnded: true,
            parentPartId: originRing.parentPartId,
            sectionIndex: 0,
            sprayIndex,
            whorl: bough.axis.whorl,
          },
        );
        sprays.push({
          axis: sprayAxis,
          order: Math.min(orderCount + 1, 5),
          rings: [
            {
              direction,
              parentPartId: originRing.parentPartId,
              position: originRing.position,
              radius: startRadius,
            },
            {
              direction,
              parentPartId: spraySegment.partId,
              position: end,
              radius: Math.max(baseRadius * 0.0015, startRadius * 0.24),
            },
          ],
        });
      }
    }
    // The explicit sprays now own the needles. Do not also coat every parent
    // bough and recursive structural branch with duplicate cards; that was
    // the broadleaf-like fallback responsible for opaque conifer blobs and
    // doubled LOD budgets.
    foliageAxes.splice(0, foliageAxes.length, ...sprays);
  }

  const foliageRng = axisRandom(builder.graph, 'foliage-sites');
  const densityScale = clamp(
    Array.isArray(traits.foliageDensityScaleStages)
      ? traits.foliageDensityScaleStages[
        Math.min(stageSlot, traits.foliageDensityScaleStages.length - 1)
      ]
      : traits.foliageDensityScale ?? 1,
    0,
    2,
  );
  const foliageSprayScale = Array.isArray(traits.foliageSprayScaleStages)
    ? traits.foliageSprayScaleStages[
      Math.min(stageSlot, traits.foliageSprayScaleStages.length - 1)
    ]
    : 1;
  const cardsPerCluster = clamp(
    Math.round(conifer
      ? traits.foliageCardsPerCluster ?? 4
      : traits.foliageCardsPerCluster ?? 8),
    1,
    16,
  );
  for (const [terminalIndex, terminal] of foliageAxes.entries()) {
    const siteCount = clamp(
      conifer
        // Needle-bearing shoots need several overlapping age classes along
        // the twig. Two sparse cards read as a bare pole at normal preview
        // distance even when the underlying whorl topology is correct.
        ? Math.round(4.2 * densityScale + foliageRng() * 2)
        : Math.round(1.45 * densityScale + foliageRng() * 0.8),
      conifer ? 3 : 1,
      conifer ? 7 : 3,
    );
    for (let siteIndex = 0; siteIndex < siteCount; siteIndex += 1) {
      const fraction = 0.22
        + ((siteIndex + 0.45 + foliageRng() * 0.18) / siteCount) * 0.76;
      const ring = pointOnRings(terminal.rings, fraction);
      attachment(
        profile.foliageOrgan,
        ring.position,
        ring.direction,
        Math.max(0.045, traits.crownWidth * stageScale * (conifer ? 0.018 : 0.012)),
        ring.parentPartId,
        {
          algorithm: 'recursive-curve-growth',
          cardsPerCluster,
          densityScale,
          foliageSprayScale,
          individualLeaf: !conifer && profile.foliageOrgan === 'broad-leaf',
          level: orderCount,
          terminal: siteIndex === siteCount - 1,
          terminalAxis: terminalIndex,
        },
      );
    }
  }

  // Conifer leaders carry several successively younger sprays rather than a
  // single pom-pom at the apex.
  if (conifer) {
    const leaderSprayCount = clamp(Math.round(traits.leaderSprayCount ?? 3), 1, 8);
    const leaderSprayStart = clamp(traits.leaderSprayStart ?? 0.86, 0.65, 0.98);
    for (let sprayIndex = 0; sprayIndex < leaderSprayCount; sprayIndex += 1) {
      const fraction = leaderSprayStart
        + (sprayIndex / Math.max(1, leaderSprayCount - 1)) * (1 - leaderSprayStart);
      const tip = pointOnRings(trunkRings, fraction);
      attachment(
        profile.foliageOrgan,
        tip.position,
        tip.direction,
        Math.max(0.06, traits.crownWidth * stageScale * 0.018),
        tip.parentPartId,
        {
          algorithm: 'recursive-curve-growth',
          cardsPerCluster: clamp(
            Math.round(traits.leaderCardsPerCluster ?? cardsPerCluster),
            1,
            16,
          ),
          densityScale,
          foliageSprayScale,
          individualLeaf: false,
          leaderTip: true,
          organType: 'conifer-leader-tip',
          sprayIndex,
        },
      );
    }
  } else if (['monopodial', 'excurrent', 'sparse-excurrent', 'columnar'].includes(mode)) {
    const tip = trunkRings.at(-1);
    attachment(
      profile.foliageOrgan,
      tip.position,
      tip.direction,
      Math.max(0.06, traits.crownWidth * stageScale * 0.018),
      tip.parentPartId,
      {
        algorithm: 'recursive-curve-growth',
        cardsPerCluster,
        densityScale,
        foliageSprayScale,
        individualLeaf: !conifer && profile.foliageOrgan === 'broad-leaf',
        leaderTip: true,
      },
    );
  }

  builder.graph.growthDiagnostics = {
    axisBudget: maxAxes,
    emittedAxes,
    evaluator: 'recursive-curve-growth',
    orderCount,
    primaryCount,
    terminalAxes: terminalAxes.length,
    foliageAxes: foliageAxes.length,
  };
}
