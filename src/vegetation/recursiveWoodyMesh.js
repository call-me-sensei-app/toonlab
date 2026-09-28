import * as THREE from 'three';

// Mesh realization for the v3 recursive woody graph.
//
// This module is intentionally isolated from the classic Toonlab tree
// generator. It consumes semantic axes and organ attachments only. The
// structure is swept as closed curve tubes and the crown is populated from
// actual terminal shoots, so v3 woody species cannot silently fall back to
// the old trunk/canopy construction path.

const STRUCTURAL_SEMANTICS = new Set(['trunk', 'branch', 'twig']);
const TAU = Math.PI * 2;

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

function addTube({
  indices,
  partIds,
  positions,
  radii,
  radialSegments,
  ringPartIds,
  uvs,
  vertexColors,
  points,
  color,
  capStart = true,
  capEnd = true,
  uvScaleU = 1,
  uvScaleV = 1,
}) {
  if (points.length < 2) return;
  const ringBase = positions.length / 3;
  const tangents = points.map((point, index) => {
    if (index === 0) return points[1].clone().sub(point).normalize();
    if (index === points.length - 1) {
      return point.clone().sub(points[index - 1]).normalize();
    }
    return points[index + 1].clone().sub(points[index - 1]).normalize();
  });
  const normals = [];
  const binormals = [];
  const firstReference = Math.abs(tangents[0].y) > 0.9
    ? new THREE.Vector3(1, 0, 0)
    : new THREE.Vector3(0, 1, 0);
  normals.push(new THREE.Vector3().crossVectors(firstReference, tangents[0]).normalize());
  binormals.push(new THREE.Vector3().crossVectors(tangents[0], normals[0]).normalize());
  for (let index = 1; index < points.length; index += 1) {
    const transported = normals[index - 1].clone().applyQuaternion(
      new THREE.Quaternion().setFromUnitVectors(tangents[index - 1], tangents[index]),
    );
    transported.addScaledVector(tangents[index], -transported.dot(tangents[index]));
    if (transported.lengthSq() < 1e-8) transported.copy(normals[index - 1]);
    transported.normalize();
    normals.push(transported);
    binormals.push(new THREE.Vector3().crossVectors(tangents[index], transported).normalize());
  }

  const distances = [0];
  for (let index = 1; index < points.length; index += 1) {
    distances.push(distances[index - 1] + points[index].distanceTo(points[index - 1]));
  }
  for (let ring = 0; ring < points.length; ring += 1) {
    for (let side = 0; side < radialSegments; side += 1) {
      const angle = side / radialSegments * TAU;
      const vertex = points[ring].clone()
        .addScaledVector(normals[ring], Math.cos(angle) * radii[ring])
        .addScaledVector(binormals[ring], Math.sin(angle) * radii[ring]);
      positions.push(vertex.x, vertex.y, vertex.z);
      uvs.push(
        side / radialSegments * uvScaleU,
        distances[ring] * uvScaleV,
      );
      vertexColors.push(color.r, color.g, color.b);
      partIds.push(ringPartIds[ring]);
    }
  }
  for (let ring = 0; ring < points.length - 1; ring += 1) {
    const lower = ringBase + ring * radialSegments;
    const upper = lower + radialSegments;
    for (let side = 0; side < radialSegments; side += 1) {
      const next = (side + 1) % radialSegments;
      indices.push(
        lower + side,
        upper + side,
        lower + next,
        lower + next,
        upper + side,
        upper + next,
      );
    }
  }
  if (capStart) {
    const center = positions.length / 3;
    positions.push(points[0].x, points[0].y, points[0].z);
    uvs.push(0.5, 0);
    vertexColors.push(color.r, color.g, color.b);
    partIds.push(ringPartIds[0]);
    for (let side = 0; side < radialSegments; side += 1) {
      indices.push(center, ringBase + (side + 1) % radialSegments, ringBase + side);
    }
  }
  if (capEnd) {
    const center = positions.length / 3;
    const last = points.at(-1);
    const lastRing = ringBase + (points.length - 1) * radialSegments;
    positions.push(last.x, last.y, last.z);
    uvs.push(0.5, distances.at(-1));
    vertexColors.push(color.r, color.g, color.b);
    partIds.push(ringPartIds.at(-1));
    for (let side = 0; side < radialSegments; side += 1) {
      indices.push(center, lastRing + side, lastRing + (side + 1) % radialSegments);
    }
  }
}

function axisTubeData(segments, isTrunk) {
  const first = segments[0];
  const points = [new THREE.Vector3(...first.start)];
  const radii = [Math.max(
    0.001,
    first.radiusStart * (isTrunk ? first.baseFlare ?? 1 : 1.08),
  )];
  const partIds = [first.partId];
  if (isTrunk) {
    // The actual closure is more than one full base radius below grade. A
    // widened grade collar blends the bole into the terrain instead of
    // intersecting it as a straight open-looking cylinder.
    const grade = points[0].clone();
    grade.y = 0;
    const buried = grade.clone();
    buried.y = -Math.max(first.radiusStart * (first.baseFlare ?? 1) * 1.45, 0.08);
    const flareRadius = first.radiusStart * (first.baseFlare ?? 1);
    points[0] = buried;
    points.push(grade);
    radii[0] = Math.max(0.001, flareRadius * 1.34);
    radii.push(Math.max(0.001, flareRadius * 1.24));
    partIds.push(first.partId);
  }
  for (const segment of segments) {
    points.push(new THREE.Vector3(...segment.end));
    radii.push(Math.max(0.001, segment.radiusEnd));
    partIds.push(segment.partId);
  }
  return { partIds, points, radii };
}

function resampleTubeData(tube, subdivisions = 2) {
  if (tube.points.length < 3 || subdivisions <= 1) return tube;
  const sampleCount = (tube.points.length - 1) * subdivisions + 1;
  const curve = new THREE.CatmullRomCurve3(
    tube.points,
    false,
    'centripetal',
    0.5,
  );
  const points = [];
  const radii = [];
  const partIds = [];
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const t = sample / Math.max(1, sampleCount - 1);
    const sourcePosition = t * (tube.points.length - 1);
    const lower = Math.min(
      tube.points.length - 2,
      Math.max(0, Math.floor(sourcePosition)),
    );
    const localT = sourcePosition - lower;
    points.push(curve.getPoint(t));
    radii.push(THREE.MathUtils.lerp(
      tube.radii[lower],
      tube.radii[lower + 1],
      localT,
    ));
    partIds.push(tube.partIds[Math.min(
      tube.partIds.length - 1,
      Math.round(sourcePosition),
    )]);
  }
  return { partIds, points, radii };
}

function rootTubeData(segment) {
  const start = new THREE.Vector3(...segment.start);
  const end = new THREE.Vector3(...segment.end);
  const direction = end.clone().sub(start);
  const collar = start.clone().addScaledVector(direction, 0.2);
  return {
    partIds: [segment.partId, segment.partId, segment.partId],
    points: [start, collar, end],
    radii: [
      Math.max(0.001, segment.radiusStart * 0.82),
      Math.max(0.001, segment.radiusStart),
      Math.max(0.001, segment.radiusEnd),
    ],
  };
}

export function createRecursiveWoodyStructureGeometry(
  graph,
  {
    radialSegments = 10,
    sectionStride = 1,
    color = new THREE.Color(0x8a6545),
    mapping = null,
  } = {},
) {
  const positions = [];
  const uvs = [];
  const vertexColors = [];
  const partIds = [];
  const indices = [];
  const byAxis = new Map();
  for (const segment of graph.segments) {
    if (!STRUCTURAL_SEMANTICS.has(segment.semantic)) continue;
    const entries = byAxis.get(segment.axisId) ?? [];
    entries.push(segment);
    byAxis.set(segment.axisId, entries);
  }
  for (const segments of byAxis.values()) {
    const first = segments[0];
    const isTrunk = first.semantic === 'trunk' && first.parentPartId == null;
    const sourceTube = axisTubeData(segments, isTrunk);
    const stride = Math.max(1, Math.round(sectionStride));
    const retained = stride === 1
      ? sourceTube.points.map((_, index) => index)
      : sourceTube.points
        .map((_, index) => index)
        .filter((index) => (
          index === 0
          || index === sourceTube.points.length - 1
          || index % stride === 0
        ));
    const retainedTube = {
      points: retained.map((index) => sourceTube.points[index]),
      radii: retained.map((index) => sourceTube.radii[index]),
      partIds: retained.map((index) => sourceTube.partIds[index]),
    };
    const tube = resampleTubeData(
      retainedTube,
      stride === 1 ? (first.level <= 1 ? 3 : 2) : 1,
    );
    const axisRadialSegments = isTrunk
      ? radialSegments
      : Math.max(
        // Respect the LOD compiler's requested radial density. The former
        // six-sided floor made a requested 4/5-sided far tree denser in its
        // branches than in its trunk, defeating radial-only decimation for
        // sparse juvenile and young broadleaf scaffolds.
        3,
        Math.round(radialSegments * (first.level >= 3 ? 0.7 : 0.85)),
      );
    addTube({
      indices,
      partIds,
      positions,
      radialSegments: axisRadialSegments,
      ringPartIds: tube.partIds,
      uvs,
      vertexColors,
      points: tube.points,
      radii: tube.radii,
      color,
      // Every branch starts on the parent centerline and is intentionally
      // embedded into the parent pipe. Capping that internal cross-section
      // is what produced the dark circular seams and "assembled logs" look.
      capStart: isTrunk,
      capEnd: true,
      uvScaleU: isTrunk
        ? Number(mapping?.trunkTileScale) || 1
        : Number(mapping?.branchTileScale) || 1,
      uvScaleV: isTrunk
        ? (Number(mapping?.trunkTileScale) || 1) / (Number(mapping?.trunkStretch) || 1)
        : (Number(mapping?.branchTileScale) || 1) / (Number(mapping?.branchStretch) || 1),
    });
  }
  for (const root of graph.roots) {
    // Standard flare roots are authored below grade and only widen the bole.
    // Specialized buttress/prop/aerial roots remain visible.
    if (root.semantic === 'root-flare') continue;
    const tube = rootTubeData(root);
    addTube({
      indices,
      partIds,
      positions,
      radialSegments: Math.max(4, Math.round(radialSegments * 0.7)),
      ringPartIds: tube.partIds,
      uvs,
      vertexColors,
      points: tube.points,
      radii: tube.radii,
      color,
      capStart: true,
      capEnd: true,
      uvScaleU: Number(mapping?.trunkTileScale) || 1,
      uvScaleV: (Number(mapping?.trunkTileScale) || 1)
        / (Number(mapping?.trunkStretch) || 1),
    });
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(vertexColors, 3));
  geometry.setAttribute('toonlabPartId', new THREE.Float32BufferAttribute(partIds, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.generator = 'toonlab-recursive-woody-mesh-v1';
  return geometry;
}

export function createRecursiveWoodyDoodleStructureGeometry(
  spines = [],
  {
    color = new THREE.Color(0x8a6545),
    firstPartId = 1,
    mapping = null,
    radialSegments = 10,
  } = {},
) {
  const positions = [];
  const uvs = [];
  const vertexColors = [];
  const partIds = [];
  const indices = [];
  const manualParts = [];
  const manualTips = [];
  let nextPartId = firstPartId;
  for (const spine of spines) {
    const sourcePoints = Array.isArray(spine?.points) ? spine.points : [];
    const points = sourcePoints
      .filter((point) => Array.isArray(point) && point.length >= 3)
      .map((point) => new THREE.Vector3(
        Number(point[0]) || 0,
        Number(point[1]) || 0,
        Number(point[2]) || 0,
      ));
    if (points.length < 2) continue;
    const partId = nextPartId;
    nextPartId += 1;
    const startRadius = Math.max(0.003, Number(spine.radiusStart) || 0.06);
    const endRadius = Math.max(0.0015, Number(spine.radiusEnd) || startRadius * 0.24);
    const radii = points.map((_, index) => THREE.MathUtils.lerp(
      startRadius,
      endRadius,
      index / Math.max(1, points.length - 1),
    ));
    addTube({
      indices,
      partIds,
      positions,
      radialSegments: Math.max(4, Math.round(radialSegments)),
      ringPartIds: points.map(() => partId),
      uvs,
      vertexColors,
      points,
      radii,
      color,
      capStart: true,
      capEnd: true,
      uvScaleU: Number(mapping?.branchTileScale) || 1,
      uvScaleV: (Number(mapping?.branchTileScale) || 1)
        / (Number(mapping?.branchStretch) || 1),
    });
    const isRoot = points.at(-1).y < -0.04;
    manualParts.push(Object.freeze({
      id: partId,
      kind: 'segment',
      semantic: isRoot ? 'doodle-root' : spine.grow ? 'doodle-grown-axis' : 'doodle-axis',
      source: 'tree-lab',
    }));
    if (!isRoot && (spine.leafTip || spine.grow)) {
      manualTips.push({
        direction: points.at(-1).clone().sub(points.at(-2)).normalize().toArray(),
        position: points.at(-1).toArray(),
        sourceSemantic: spine.grow ? 'doodle-grown-foliage' : 'doodle-tip-foliage',
      });
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(vertexColors, 3));
  geometry.setAttribute('toonlabPartId', new THREE.Float32BufferAttribute(partIds, 1));
  geometry.setIndex(indices);
  if (positions.length) {
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  }
  geometry.userData.generator = 'toonlab-recursive-woody-doodle-mesh-v1';
  return { geometry, manualParts, manualTips, nextPartId };
}

function attachmentVectors(entry) {
  const direction = new THREE.Vector3(...entry.direction).normalize();
  const position = new THREE.Vector3(...entry.position);
  return { direction, position };
}

export function createRecursiveWoodyFoliageGeometry(
  graph,
  profile,
  traits,
  { foliageState = 'leaf-on', seed = 1 } = {},
) {
  if (foliageState === 'dormant') return new THREE.BufferGeometry();
  const attachments = graph.attachments.filter((entry) => entry.semantic !== 'spine');
  if (!attachments.length) return new THREE.BufferGeometry();
  const rng = mulberry32(hashString(
    `${graph.speciesProfileId}:${seed}:${traits.foliageSeed ?? 1}:native-foliage`,
  ));
  const centers = attachments.map((entry) => new THREE.Vector3(...entry.position));
  const bounds = new THREE.Box3().setFromPoints(centers);
  const canopyCenter = bounds.getCenter(new THREE.Vector3());
  canopyCenter.y -= bounds.getSize(new THREE.Vector3()).y * 0.12;
  const minY = bounds.min.y;
  const height = Math.max(0.001, bounds.max.y - bounds.min.y);
  const authoredCardRange = traits.foliageCardSizeRange ?? (
    profile.engine === 'whorled-conifer' ? [0.12, 0.24] : [0.075, 0.18]
  );
  const cardRange = profile.engine === 'whorled-conifer'
    ? [authoredCardRange[0] * 2.05, authoredCardRange[1] * 2.25]
    : [authoredCardRange[0] * 3.1, authoredCardRange[1] * 3.55];
  const conifer = profile.engine === 'whorled-conifer';
  const density = THREE.MathUtils.clamp(
    Number(traits.foliageDensityScale ?? traits.canopyDensity ?? 0.9),
    0.15,
    1.5,
  );
  const cards = [];
  const acceptedAttachmentCenters = [];
  for (const [attachmentIndex, entry] of attachments.entries()) {
    const { direction, position } = attachmentVectors(entry);
    const normalizedRadial = Math.hypot(
      (position.x - canopyCenter.x) / Math.max(bounds.max.x - bounds.min.x, 0.001),
      (position.z - canopyCenter.z) / Math.max(bounds.max.z - bounds.min.z, 0.001),
    ) * 2;
    if (
      traits.foliageCullInterior
      && normalizedRadial < Math.max(0, Number(traits.foliageInteriorThreshold) || 0)
    ) continue;
    if (
      traits.foliageCullExterior
      && normalizedRadial > Math.max(0, Number(traits.foliageExteriorThreshold) || 0)
    ) continue;
    const weldDistance = Math.max(0, Number(traits.foliageWeldDistance) || 0);
    if (
      weldDistance > 0
      && acceptedAttachmentCenters.some((center) => center.distanceTo(position) < weldDistance)
    ) continue;
    acceptedAttachmentCenters.push(position);
    const sprayScale = THREE.MathUtils.clamp(
      Number(entry.foliageSprayScale) || 1,
      0.2,
      2,
    );
    const authoredCount = Number(entry.cardsPerCluster)
      || Number(entry.metadata?.cardsPerCluster)
      || Number(traits.foliageCardsPerCluster);
    const cardCount = THREE.MathUtils.clamp(
      Math.round(
        (authoredCount || (conifer ? 8 : 9))
          * Math.max(0.05, Number(traits.leafTextureDensity) || 1)
          * (1 + Math.max(0, Number(traits.foliageSubdivisions) || 0) * 0.08),
      ),
      4,
      24,
    );
    const frameRight = new THREE.Vector3().crossVectors(
      Math.abs(direction.y) > 0.92 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0),
      direction,
    ).normalize();
    const frameUp = new THREE.Vector3().crossVectors(direction, frameRight).normalize();
    for (let index = 0; index < cardCount; index += 1) {
      const along = (index / Math.max(1, cardCount - 1) - 0.42)
        * (conifer ? 0.62 : 0.72) * sprayScale;
      const radial = (rng() - 0.5) * (conifer ? 0.34 : 0.78) * sprayScale;
      const angle = (rng() - 0.5)
        * TAU
        * Math.max(0, Number(traits.foliageRotationJitter) || 0)
        + (Number(traits.foliageRotationOffset) || 0);
      const center = position.clone()
        .addScaledVector(
          direction,
          traits.foliageCenterOnBranches === false ? sprayScale * 0.12 : 0,
        )
        .addScaledVector(direction, along)
        .addScaledVector(frameRight, Math.cos(angle) * radial)
        .addScaledVector(frameUp, Math.sin(angle) * radial);
      const normal = center.clone().sub(canopyCenter);
      if (normal.lengthSq() < 1e-8) normal.copy(direction);
      normal.normalize();
      const baseSize = THREE.MathUtils.lerp(cardRange[0], cardRange[1], rng());
      const heightT = THREE.MathUtils.clamp((center.y - minY) / height, 0, 1);
      const heightBias = 1 + (heightT - 0.5)
        * 2
        * (Number(traits.foliageHeightScaleBias) || 0);
      const scaleJitter = 1 + (rng() - 0.5)
        * Math.max(0, Number(traits.foliageScaleJitter) || 0)
        * 0.35;
      const width = Math.max(0.05, Number(traits.foliageWidth) || 1);
      const geometryVariant = traits.foliageGeometryVariant ?? 'single';
      const shape = conifer
        ? [0.72 * width, 1.2]
        : geometryVariant === 'box-cluster'
          ? [1.12 * width, 0.92]
          : geometryVariant === 'sphere-cluster'
            ? [1 * width, 1]
            : geometryVariant === 'half-sphere-cluster'
              ? [1.15 * width, 0.72]
              : geometryVariant === 'polyhedral-cluster'
                ? [0.88 * width, 1.14]
                : geometryVariant === 'blob-cluster'
                  ? [1.22 * width, 1.08]
                  : [(0.78 + rng() * 0.18) * width, 1.05 + rng() * 0.18];
      const deformation = Math.max(0, Number(traits.foliageDeformation) || 0);
      shape[0] *= 1 + (rng() - 0.5) * deformation * 0.24;
      shape[1] *= 1 + (rng() - 0.5) * deformation * 0.18;
      if (conifer) {
        // Deformation jitter must not turn a needle-bearing branchlet back
        // into a broadleaf puff. Preserve a readable 3:2 long-axis envelope
        // after both width styling and independent x/y jitter are applied.
        shape[0] = Math.min(shape[0], shape[1] / 1.5);
      }
      cards.push({
        attachment: attachmentIndex,
        basisUp: direction.clone().lerp(new THREE.Vector3(0, 1, 0), conifer ? 0.18 : 0.35).normalize(),
        center,
        frameMode: conifer && index % 3 === 0 ? 0 : 1,
        normal,
        partId: entry.partId,
        phase: rng(),
        shape,
        size: baseSize
          * sprayScale
          * Math.max(0.08, heightBias)
          * Math.max(0.2, scaleJitter)
          * (conifer ? 1 : 0.86 + rng() * 0.24),
        tint: rng(),
      });
    }
  }

  const positions = new Float32Array(cards.length * 4 * 3);
  const corners = new Float32Array(cards.length * 4 * 2);
  const uvs = new Float32Array(cards.length * 4 * 2);
  const normals = new Float32Array(cards.length * 4 * 3);
  const infos = new Float32Array(cards.length * 4 * 4);
  const shapes = new Float32Array(cards.length * 4 * 2);
  const frames = new Float32Array(cards.length * 4 * 4);
  const attachmentIds = new Float32Array(cards.length * 4);
  const semanticPartIds = new Float32Array(cards.length * 4);
  const indices = new Uint32Array(cards.length * 6);
  const cornerValues = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
  const leafTileScale = Math.max(0.01, Number(traits.leafTileScale) || 1);
  const uvValues = [
    [0, 0],
    [leafTileScale, 0],
    [leafTileScale, leafTileScale],
    [0, leafTileScale],
  ];
  for (const [cardIndex, card] of cards.entries()) {
    const heightT = traits.leafGradientMode === 'uv'
      ? card.phase
      : THREE.MathUtils.clamp((card.center.y - minY) / height, 0, 1);
    for (let corner = 0; corner < 4; corner += 1) {
      const vertex = cardIndex * 4 + corner;
      positions.set(card.center.toArray(), vertex * 3);
      corners.set(cornerValues[corner], vertex * 2);
      uvs.set(uvValues[corner], vertex * 2);
      normals.set(card.normal.toArray(), vertex * 3);
      infos.set([card.size, card.phase, card.tint, heightT], vertex * 4);
      shapes.set(card.shape, vertex * 2);
      frames.set([...card.basisUp.toArray(), card.frameMode], vertex * 4);
      attachmentIds[vertex] = card.attachment;
      semanticPartIds[vertex] = card.partId;
    }
    const base = cardIndex * 4;
    indices.set([base, base + 1, base + 2, base, base + 2, base + 3], cardIndex * 6);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aCorner', new THREE.BufferAttribute(corners, 2));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute('aShadeNormal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('aInfo', new THREE.BufferAttribute(infos, 4));
  geometry.setAttribute('aCardShape', new THREE.BufferAttribute(shapes, 2));
  geometry.setAttribute('aCardFrame', new THREE.BufferAttribute(frames, 4));
  geometry.setAttribute('aAttachment', new THREE.BufferAttribute(attachmentIds, 1));
  geometry.setAttribute('toonlabPartId', new THREE.BufferAttribute(semanticPartIds, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.boundingBox.expandByScalar(cardRange[1]);
  geometry.boundingSphere.radius += cardRange[1];
  geometry.userData.generator = 'toonlab-recursive-woody-foliage-v2';
  geometry.userData.cardCount = cards.length;
  return geometry;
}

export function createRecursiveWoodyReproductiveGeometry(
  graph,
  traits,
  { firstPartId = 1, seed = 1 } = {},
) {
  const density = Math.max(0, Number(traits.reproductiveDensity) || 0);
  const source = graph.attachments.filter((entry) => entry.semantic !== 'spine');
  if (!density || !source.length) {
    return {
      geometry: new THREE.BufferGeometry(),
      manualParts: [],
      nextPartId: firstPartId,
    };
  }
  const rng = mulberry32(hashString(
    `${graph.speciesProfileId}:${seed}:${traits.foliageSeed ?? 1}:reproductive`,
  ));
  const normalizedDensity = density <= 1
    ? density
    : THREE.MathUtils.clamp(density / 10, 0, 1);
  const bloomCount = THREE.MathUtils.clamp(
    Math.round(source.length * normalizedDensity),
    1,
    160,
  );
  const selected = [...source];
  if (traits.reproductiveDistribution === 'random') {
    selected.sort(() => rng() - 0.5);
  } else {
    selected.sort((left, right) => (
      right.position[1] - left.position[1]
      || left.partId - right.partId
    ));
  }
  selected.length = Math.min(bloomCount, selected.length);

  const positions = [];
  const colors = [];
  const partIds = [];
  const indices = [];
  const manualParts = [];
  let nextPartId = firstPartId;
  const petalColorA = new THREE.Color().setRGB(...(
    traits.flowerColorA ?? [0.86, 0.52, 0.62]
  ));
  const petalColorB = new THREE.Color().setRGB(...(
    traits.flowerColorB ?? [0.98, 0.78, 0.82]
  ));
  const coreColor = new THREE.Color().setRGB(...(
    traits.flowerCoreColor ?? [0.92, 0.68, 0.12]
  ));
  const stamenColor = new THREE.Color().setRGB(...(
    traits.flowerStamenColor ?? [0.96, 0.82, 0.28]
  ));
  const pushVertex = (point, color, partId) => {
    positions.push(point.x, point.y, point.z);
    colors.push(color.r, color.g, color.b);
    partIds.push(partId);
    return positions.length / 3 - 1;
  };
  const scale = Math.max(0.003, Number(traits.reproductiveScale) || 0.1);
  const petalScale = scale * Math.max(0.02, Number(traits.reproductivePetalScale) || 1);
  const petalCount = THREE.MathUtils.clamp(
    Math.round(Number(traits.reproductivePetalCount) || 7),
    1,
    64,
  );
  const layers = 1 + THREE.MathUtils.clamp(
    Math.round(Number(traits.reproductiveExtraPetalLayers) || 0),
    0,
    8,
  );
  for (const [bloomIndex, entry] of selected.entries()) {
    const partId = nextPartId;
    nextPartId += 1;
    manualParts.push(Object.freeze({
      id: partId,
      kind: 'organ',
      semantic: 'reproductive-organ',
      source: 'native-woody',
    }));
    const center = new THREE.Vector3(...entry.position);
    const direction = new THREE.Vector3(...entry.direction).normalize();
    const reference = Math.abs(direction.y) > 0.9
      ? new THREE.Vector3(1, 0, 0)
      : new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(reference, direction).normalize();
    const up = new THREE.Vector3().crossVectors(direction, right).normalize();
    for (let layer = 0; layer < layers; layer += 1) {
      const layerScale = 1 - layer * 0.11;
      const layerRotation = layer
        * (Number(traits.reproductiveExtraPetalAngle) || 0)
        * Math.PI / 180;
      for (let petal = 0; petal < petalCount; petal += 1) {
        const angle = petal / petalCount * TAU + layerRotation;
        const radial = right.clone().multiplyScalar(Math.cos(angle))
          .addScaledVector(up, Math.sin(angle)).normalize();
        const lateral = new THREE.Vector3().crossVectors(direction, radial).normalize();
        const inclination = Number(traits.reproductivePetalInclination) || 0;
        const lateralInclination = Number(
          traits.reproductivePetalLateralInclination,
        ) || 0;
        const reachDirection = radial.clone()
          .addScaledVector(direction, Math.sin(inclination))
          .addScaledVector(lateral, Math.sin(lateralInclination))
          .normalize();
        const lengthScale = traits.reproductivePetalForm === 'recurved'
          ? 1.18
          : traits.reproductivePetalForm === 'spherical'
            ? 0.78
            : 1;
        const length = petalScale * layerScale * lengthScale;
        const width = length
          * 0.28
          * Math.max(0.08, Number(traits.reproductivePetalWidth) || 1);
        const belly = Number(traits.reproductivePetalBelly) || 0;
        const edge = Number(traits.reproductivePetalEdge) || 0;
        const base = center.clone().addScaledVector(direction, layer * scale * 0.025);
        const color = petalColorA.clone().lerp(petalColorB, (
          petal / Math.max(1, petalCount - 1) + rng() * 0.25
        ) % 1);
        const petalResolution = THREE.MathUtils.clamp(
          Math.round((Number(traits.reproductivePetalResolution) || 8) / 2),
          2,
          12,
        );
        let previousLeft = null;
        let previousRight = null;
        for (let division = 0; division <= petalResolution; division += 1) {
          const t = division / petalResolution;
          const petalCenter = base.clone()
            .addScaledVector(reachDirection, length * t)
            .addScaledVector(
              direction,
              belly * length * Math.sin(Math.PI * t) * 0.12
                + edge * length * t * t * 0.08,
            );
          const halfWidth = width * Math.sin(Math.PI * t) ** 0.72;
          const left = pushVertex(
            petalCenter.clone().addScaledVector(lateral, halfWidth),
            color,
            partId,
          );
          const rightIndex = pushVertex(
            petalCenter.clone().addScaledVector(lateral, -halfWidth),
            color,
            partId,
          );
          if (previousLeft != null) {
            indices.push(
              previousLeft, previousRight, left,
              left, previousRight, rightIndex,
            );
          }
          previousLeft = left;
          previousRight = rightIndex;
        }
      }
    }
    const coreResolution = THREE.MathUtils.clamp(
      Math.round(Number(traits.reproductiveCoreResolution) || 8),
      3,
      32,
    );
    const coreRadius = scale * 0.2 * Math.max(
      0.05,
      Number(traits.reproductiveCoreRadius) || 0.45,
    );
    const coreHeight = coreRadius * Math.max(
      0.1,
      Number(traits.reproductiveCoreWidth) || 0.8,
    );
    const bottom = center.clone().addScaledVector(direction, -coreHeight * 0.2);
    const top = center.clone().addScaledVector(direction, coreHeight);
    const bottomIndex = pushVertex(bottom, coreColor, partId);
    const topIndex = pushVertex(top, coreColor, partId);
    for (let index = 0; index < coreResolution; index += 1) {
      const angle = index / coreResolution * TAU;
      const radial = right.clone().multiplyScalar(Math.cos(angle))
        .addScaledVector(up, Math.sin(angle));
      const current = pushVertex(
        center.clone().addScaledVector(radial, coreRadius),
        coreColor,
        partId,
      );
      const nextAngle = (index + 1) / coreResolution * TAU;
      const nextRadial = right.clone().multiplyScalar(Math.cos(nextAngle))
        .addScaledVector(up, Math.sin(nextAngle));
      const next = pushVertex(
        center.clone().addScaledVector(nextRadial, coreRadius),
        coreColor,
        partId,
      );
      indices.push(bottomIndex, next, current, topIndex, current, next);
    }
    const stamenCount = THREE.MathUtils.clamp(
      Math.round(Number(traits.reproductiveStamenCount) || 0),
      0,
      96,
    );
    const stamenLength = scale * Math.max(
      0,
      Number(traits.reproductiveStamenLength) || 0,
    );
    const stamenWidth = scale * 0.012 * Math.max(
      1,
      Number(traits.reproductiveStamenResolution) || 3,
    ) / 3;
    for (let stamen = 0; stamen < stamenCount; stamen += 1) {
      const angle = stamen / Math.max(1, stamenCount) * TAU + rng() * 0.12;
      const radial = right.clone().multiplyScalar(Math.cos(angle))
        .addScaledVector(up, Math.sin(angle));
      const start = center.clone().addScaledVector(radial, coreRadius * 0.6);
      const end = start.clone().addScaledVector(direction, stamenLength)
        .addScaledVector(radial, stamenLength * 0.16);
      const side = new THREE.Vector3().crossVectors(direction, radial)
        .normalize().multiplyScalar(stamenWidth);
      const a = pushVertex(start.clone().add(side), stamenColor, partId);
      const b = pushVertex(start.clone().sub(side), stamenColor, partId);
      const c = pushVertex(end, stamenColor, partId);
      indices.push(a, b, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('toonlabPartId', new THREE.Float32BufferAttribute(partIds, 1));
  geometry.setIndex(indices);
  if (positions.length) {
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  }
  geometry.userData.generator = 'toonlab-recursive-woody-reproductive-v1';
  return { geometry, manualParts, nextPartId };
}

function fallbackLeafTexture() {
  const data = new Uint8Array([
    255, 255, 255, 0,
    255, 255, 255, 255,
    255, 255, 255, 255,
    255, 255, 255, 0,
  ]);
  const texture = new THREE.DataTexture(data, 2, 2, THREE.RGBAFormat);
  texture.needsUpdate = true;
  return texture;
}

export function createRecursiveWoodyLeafTexture(profile, leafShape = profile.leafShape) {
  if (typeof document === 'undefined') return fallbackLeafTexture();
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, 128, 128);
  context.fillStyle = '#ffffff';
  context.beginPath();
  const maple = leafShape === 'maple' || profile.genus === 'Acer';
  const needle = profile.engine === 'whorled-conifer';
  if (needle) {
    context.strokeStyle = '#ffffff';
    context.lineCap = 'round';
    context.lineJoin = 'round';
    // A branchlet card represents a short, overlapping spray rather than a
    // single needle. Build a dense alpha silhouette with an opaque rachis and
    // tapered lateral needle bundles so mipmapping does not erase the foliage
    // at ordinary Tree Lab viewing distances.
    context.lineWidth = 10;
    context.moveTo(64, 120);
    context.quadraticCurveTo(62, 62, 64, 8);
    for (let index = 0; index < 18; index += 1) {
      const y = 16 + index * 5.4;
      const taper = 1 - Math.abs((y - 68) / 72);
      const spread = 13 + taper * 25;
      context.moveTo(64, y + 7);
      context.quadraticCurveTo(
        64 - spread * 0.48,
        y + 1,
        64 - spread,
        y - 4,
      );
      context.moveTo(64, y + 7);
      context.quadraticCurveTo(
        64 + spread * 0.48,
        y + 1,
        64 + spread,
        y - 4,
      );
    }
    context.stroke();
    // Secondary interleaved needles close the regular ladder-shaped gaps
    // without turning the sprite into a broadleaf blob.
    context.beginPath();
    context.lineWidth = 6;
    for (let index = 0; index < 17; index += 1) {
      const y = 19 + index * 5.5;
      const taper = 1 - Math.abs((y - 68) / 76);
      const spread = 9 + taper * 20;
      context.moveTo(63, y + 5);
      context.lineTo(64 - spread, y + 2);
      context.moveTo(65, y + 5);
      context.lineTo(64 + spread, y + 2);
    }
    context.stroke();
  } else if (maple) {
    const points = [
      [64, 6], [72, 31], [88, 19], [84, 46], [112, 38],
      [92, 61], [119, 70], [82, 77], [88, 111], [64, 88],
      [40, 111], [46, 77], [9, 70], [36, 61], [16, 38],
      [44, 46], [40, 19], [56, 31],
    ];
    context.moveTo(points[0][0], points[0][1]);
    for (const point of points.slice(1)) context.lineTo(point[0], point[1]);
    context.closePath();
    context.fill();
  } else if (profile.genus === 'Quercus') {
    context.moveTo(64, 8);
    context.bezierCurveTo(84, 16, 75, 29, 92, 34);
    context.bezierCurveTo(103, 46, 82, 50, 94, 62);
    context.bezierCurveTo(100, 78, 78, 78, 76, 99);
    context.lineTo(64, 119);
    context.lineTo(52, 99);
    context.bezierCurveTo(50, 78, 28, 78, 34, 62);
    context.bezierCurveTo(46, 50, 25, 46, 36, 34);
    context.bezierCurveTo(53, 29, 44, 16, 64, 8);
    context.closePath();
    context.fill();
  } else {
    context.moveTo(64, 7);
    context.bezierCurveTo(101, 27, 107, 73, 64, 119);
    context.bezierCurveTo(21, 73, 27, 27, 64, 7);
    context.closePath();
    context.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  texture.name = `RecursiveWoodyLeaf:${profile.id}`;
  return texture;
}
