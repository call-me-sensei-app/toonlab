import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { createPlantGraph } from './plantGraph.js';
import {
  createRecursiveWoodyDoodleStructureGeometry,
  createRecursiveWoodyFoliageGeometry,
  createRecursiveWoodyLeafTexture,
  createRecursiveWoodyReproductiveGeometry,
  createRecursiveWoodyStructureGeometry,
} from './recursiveWoodyMesh.js';
import { createBranchTubeGeometry } from './stylizedTree.js';
import { getTreeSpeciesProfile } from './treeSpeciesProfiles.js';
import { resolveWoodyBaselineThreeRuntime } from './woodyBaselineControls.js';
import {
  treeSurfaceProfile,
  treeSurfaceProfileId,
  treeSurfaceTextureForSpecies,
} from './treeSurfaceTextures.js';
import {
  createOrganLeafSpriteTexture,
  createTreeFoliageGeometry,
  createTreeFoliageMaterials,
  setCanopyCloudShadow,
  setCanopySceneShadow,
  setCanopySun,
  setCanopyWind,
  tickCanopyTime,
} from './stylizedTreeFoliage.js';
import { applyVegetationShader } from './vegetationShaders.js';
import { createWoodySurfaceNodeMaterial, setWoodySurfaceSun } from '../shaders-tsl/woody-surface.js';
import { syncFoliageFog } from '../shaders-tsl/chunks/foliage-fog.js';

function jsonClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function materialColor(profile, foliageState, canopyColor) {
  const color = Array.isArray(canopyColor)
    ? [...canopyColor]
    : [...profile.foliageColor];
  if (foliageState === 'autumn') return [0.72, 0.31, 0.08];
  if (foliageState === 'dry' || foliageState === 'dormant') return [0.42, 0.36, 0.17];
  if (foliageState === 'wet') return color.map((channel) => channel * 0.76);
  return color;
}

function addPartId(geometry, partId) {
  const position = geometry.getAttribute('position');
  geometry.setAttribute(
    'toonlabPartId',
    new THREE.Float32BufferAttribute(new Float32Array(position.count).fill(partId), 1),
  );
  return geometry;
}

function addVertexColor(geometry, color) {
  const position = geometry.getAttribute('position');
  const values = new Float32Array(position.count * 3);
  for (let index = 0; index < position.count; index += 1) {
    values[index * 3] = color.r;
    values[index * 3 + 1] = color.g;
    values[index * 3 + 2] = color.b;
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(values, 3));
  return geometry;
}

function applyRibProfile(geometry, ribCount, grooveDepth = 0.16) {
  const position = geometry.getAttribute('position');
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const z = position.getZ(index);
    const radial = Math.hypot(x, z);
    if (radial < 1e-7) continue;
    const angle = Math.atan2(z, x);
    const ridge = (Math.cos(angle * ribCount) + 1) * 0.5;
    const factor = 1 - grooveDepth * (1 - ridge * ridge);
    position.setX(index, x * factor);
    position.setZ(index, z * factor);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function createCulmSheathGeometry(segment, length, radialSegments) {
  const sections = Math.max(6, Math.round(radialSegments * 0.9));
  const wrap = THREE.MathUtils.clamp(
    segment.sheathWrap ?? Math.PI * 1.7,
    Math.PI * 1.2,
    Math.PI * 1.9,
  );
  const azimuth = Number(segment.sheathAzimuth) || 0;
  const positions = [];
  const uvs = [];
  const indices = [];
  const ringCount = 4;
  const sheathTwist = Number(segment.sheathTwist) || 0;
  for (let ring = 0; ring < ringCount; ring += 1) {
    const t = ring / (ringCount - 1);
    const radius = THREE.MathUtils.lerp(
      segment.radiusStart,
      segment.radiusEnd,
      t,
    ) * (1 + Math.sin(Math.PI * t) * 0.035);
    const y = THREE.MathUtils.lerp(-length * 0.5, length * 0.5, t);
    for (let section = 0; section <= sections; section += 1) {
      const u = section / sections;
      const angle = azimuth
        + sheathTwist * Math.sin(Math.PI * t)
        - wrap * 0.5
        + wrap * u;
      positions.push(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
      uvs.push(u, t);
    }
  }
  for (let ring = 0; ring < ringCount - 1; ring += 1) {
    for (let section = 0; section < sections; section += 1) {
      const lowerLeft = ring * (sections + 1) + section;
      const lowerRight = lowerLeft + 1;
      const upperLeft = (ring + 1) * (sections + 1) + section;
      const upperRight = upperLeft + 1;
      indices.push(lowerLeft, upperLeft, lowerRight);
      indices.push(lowerRight, upperLeft, upperRight);
    }
  }

  // The sheath blade is a pointed continuation of the wrap, not foliage.
  // Duplicate its reverse face so the thin blade remains legible from every
  // catalog view without changing the woody material's global side mode.
  const bladeHalfAngle = Math.min(
    Math.PI * 0.28,
    Math.max(0.22, segment.radiusEnd > 1e-5 ? 0.72 : 0.22),
  );
  const bladeLength = Math.max(
    length * 0.25,
    Number(segment.sheathBladeLength) || length * 0.5,
  );
  const bladeOutset = Math.max(1.05, Number(segment.sheathBladeOutset) || 1.3);
  const bladeRadius = segment.radiusEnd * 1.02;
  const bladeTipRadius = segment.radiusEnd * bladeOutset;
  const bladeVertices = [
    [
      Math.cos(azimuth - bladeHalfAngle) * bladeRadius,
      length * 0.5,
      Math.sin(azimuth - bladeHalfAngle) * bladeRadius,
    ],
    [
      Math.cos(azimuth) * bladeTipRadius,
      length * 0.5 + bladeLength,
      Math.sin(azimuth) * bladeTipRadius,
    ],
    [
      Math.cos(azimuth + bladeHalfAngle) * bladeRadius,
      length * 0.5,
      Math.sin(azimuth + bladeHalfAngle) * bladeRadius,
    ],
  ];
  const bladeStart = positions.length / 3;
  for (const vertex of [...bladeVertices, ...bladeVertices]) positions.push(...vertex);
  uvs.push(0, 0, 0.5, 1, 1, 0, 0, 0, 0.5, 1, 1, 0);
  indices.push(bladeStart, bladeStart + 1, bladeStart + 2);
  indices.push(bladeStart + 5, bladeStart + 4, bladeStart + 3);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createOpenJunctionTubeGeometry(segment, length, radialSegments) {
  const transition = THREE.MathUtils.clamp(
    Number(segment.junctionTransition) || 0.2,
    0.06,
    0.45,
  );
  const bulge = THREE.MathUtils.clamp(
    Number(segment.junctionBulge) || 1,
    1,
    1.3,
  );
  const rings = [
    { radius: segment.radiusStart * bulge, t: 0 },
    {
      radius: THREE.MathUtils.lerp(
        segment.radiusStart,
        segment.radiusEnd,
        transition,
      ),
      t: transition,
    },
    { radius: segment.radiusEnd, t: 1 },
  ];
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let ring = 0; ring < rings.length; ring += 1) {
    const entry = rings[ring];
    const y = THREE.MathUtils.lerp(-length * 0.5, length * 0.5, entry.t);
    for (let radial = 0; radial < radialSegments; radial += 1) {
      const u = radial / radialSegments;
      const angle = u * Math.PI * 2;
      positions.push(
        Math.cos(angle) * entry.radius,
        y,
        Math.sin(angle) * entry.radius,
      );
      uvs.push(u, entry.t);
    }
  }
  for (let ring = 0; ring < rings.length - 1; ring += 1) {
    for (let radial = 0; radial < radialSegments; radial += 1) {
      const next = (radial + 1) % radialSegments;
      const lower = ring * radialSegments + radial;
      const lowerNext = ring * radialSegments + next;
      const upper = (ring + 1) * radialSegments + radial;
      const upperNext = (ring + 1) * radialSegments + next;
      indices.push(lower, upper, lowerNext, lowerNext, upper, upperNext);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function segmentRadialSegmentCount(segment, radialSegments) {
  const branchLevel = Number(segment.level) || 0;
  if (segment.semantic === 'twig' || branchLevel >= 3) return 3;
  if (segment.semantic === 'node') {
    return Math.max(3, Math.round(radialSegments * 0.75));
  }
  if (branchLevel === 2) return Math.max(3, Math.round(radialSegments * 0.625));
  return radialSegments;
}

function createContinuousAxisTubeGeometry(
  segments,
  radialSegments,
  color,
  { capStart = true, capEnd = true } = {},
) {
  const first = segments[0];
  const points = [];
  const radii = [];
  const partIds = [];
  const lengths = [];
  let totalLength = 0;
  const pushRing = (point, radius, partId) => {
    if (points.length) totalLength += point.distanceTo(points.at(-1));
    points.push(point);
    radii.push(Math.max(0.001, radius));
    partIds.push(partId);
    lengths.push(totalLength);
  };

  const firstStart = new THREE.Vector3(...first.start);
  const firstEnd = new THREE.Vector3(...first.end);
  const firstDirection = firstEnd.clone().sub(firstStart);
  const firstLength = firstDirection.length();
  let junctionResumeT = 0;
  const branchJunction = first.junctionBulge
    && Number(first.junctionInset) > 0
    && first.parentPartId != null
    && firstLength > 1e-6;
  if (branchJunction) {
    // Keep the junction's hidden rings inside the parent, but near its
    // surface. Sweeping the child all the way from the parent centerline
    // creates large coincident surfaces and dark polygon patches. The next
    // authored ring remains farther along the child, so this is a monotonic
    // collar rather than a backwards hook.
    const direction = firstDirection.normalize();
    const transition = THREE.MathUtils.clamp(
      Number(first.junctionTransition) || 0.22,
      0.08,
      0.42,
    );
    const transitionDistance = firstLength * transition;
    const parentRadius = Math.max(
      first.radiusStart,
      Number(first.junctionParentRadius) || first.radiusStart * 1.8,
    );
    const collarDistance = Math.min(
      firstLength * 0.58,
      parentRadius * THREE.MathUtils.clamp(
        Number(first.junctionInset) || 0.78,
        0.72,
        0.92,
      ),
    );
    const embeddedDistance = collarDistance * 0.48;
    junctionResumeT = THREE.MathUtils.clamp(
      Math.max(transition, collarDistance / firstLength + 0.18),
      0.32,
      0.82,
    );
    pushRing(
      firstStart.clone().addScaledVector(direction, embeddedDistance),
      first.radiusStart * 0.72,
      first.partId,
    );
    pushRing(
      firstStart.clone().addScaledVector(direction, collarDistance),
      first.radiusStart,
      first.partId,
    );
  } else {
    const baseFlare = THREE.MathUtils.clamp(Number(first.baseFlare) || 1, 1, 1.45);
    const groundedStart = firstStart.clone();
    if (first.parentPartId == null) {
      // The cap is perpendicular to the first tangent. On a leaning trunk its
      // ring therefore has vertical extent; merely nudging the center below
      // grade leaves the upper half exposed as a dark hollow arch. Sink the
      // complete boundary ring below grade so the visible ground intersection
      // is always the closed tube wall.
      const direction = firstDirection.lengthSq() > 1e-12
        ? firstDirection.clone().normalize()
        : new THREE.Vector3(0, 1, 0);
      const flaredRadius = first.radiusStart
        * THREE.MathUtils.clamp(Number(first.junctionBulge) || 1, 1, 1.3)
        * baseFlare;
      const verticalRingExtent = flaredRadius
        * Math.sqrt(Math.max(0, 1 - direction.y * direction.y));
      groundedStart.y = Math.min(firstStart.y, 0)
        - verticalRingExtent
        - flaredRadius * 1.1;
    }
    pushRing(
      groundedStart,
      first.radiusStart
        * THREE.MathUtils.clamp(Number(first.junctionBulge) || 1, 1, 1.3)
        * baseFlare,
      first.partId,
    );
  }
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const start = new THREE.Vector3(...segment.start);
    const end = new THREE.Vector3(...segment.end);
    const transition = index === 0 && branchJunction
      ? junctionResumeT
      : index === 0 && (segment.junctionBulge || segment.baseFlare > 1)
        ? THREE.MathUtils.clamp(
        Number(segment.baseFlareTransition)
          || Number(segment.junctionTransition)
          || 0.2,
        0.08,
        0.42,
      )
      : 0.5;
    const intermediate = start.clone().lerp(end, transition);
    const intermediateRadius = THREE.MathUtils.lerp(
      segment.radiusStart,
      segment.radiusEnd,
      transition,
    );
    pushRing(intermediate, intermediateRadius, segment.partId);
    pushRing(end, segment.radiusEnd, segment.partId);
  }

  const tangents = points.map((point, index) => {
    if (index === 0) return points[1].clone().sub(point).normalize();
    if (index === points.length - 1) return point.clone().sub(points[index - 1]).normalize();
    return points[index + 1].clone().sub(points[index - 1]).normalize();
  });
  const normals = [];
  const binormals = [];
  const initialReference = Math.abs(tangents[0].y) > 0.92
    ? new THREE.Vector3(1, 0, 0)
    : new THREE.Vector3(0, 1, 0);
  normals.push(new THREE.Vector3().crossVectors(initialReference, tangents[0]).normalize());
  binormals.push(new THREE.Vector3().crossVectors(tangents[0], normals[0]).normalize());
  for (let index = 1; index < points.length; index += 1) {
    const transported = normals[index - 1].clone().applyQuaternion(
      new THREE.Quaternion().setFromUnitVectors(tangents[index - 1], tangents[index]),
    );
    transported.addScaledVector(
      tangents[index],
      -transported.dot(tangents[index]),
    ).normalize();
    if (transported.lengthSq() < 1e-8) transported.copy(normals[index - 1]);
    normals.push(transported);
    binormals.push(new THREE.Vector3().crossVectors(tangents[index], transported).normalize());
  }

  const positions = [];
  const uvs = [];
  const colors = [];
  const vertexPartIds = [];
  const indices = [];
  // Do not restart the same bark row at every child axis. A synchronized
  // V=0 cross-break painted a dark ring around every branch insertion and
  // made continuous joints look like sawn, reattached limbs.
  const uvVOffset = THREE.MathUtils.euclideanModulo(
    first.partId * 0.61803398875,
    1,
  ) * 1.37;
  for (let ring = 0; ring < points.length; ring += 1) {
    for (let radial = 0; radial < radialSegments; radial += 1) {
      const u = radial / radialSegments;
      const angle = u * Math.PI * 2;
      const vertex = points[ring].clone()
        .addScaledVector(normals[ring], Math.cos(angle) * radii[ring])
        .addScaledVector(binormals[ring], Math.sin(angle) * radii[ring]);
      positions.push(vertex.x, vertex.y, vertex.z);
      uvs.push(u, lengths[ring] + uvVOffset);
      colors.push(color.r, color.g, color.b);
      vertexPartIds.push(partIds[ring]);
    }
  }
  for (let ring = 0; ring < points.length - 1; ring += 1) {
    for (let radial = 0; radial < radialSegments; radial += 1) {
      const next = (radial + 1) % radialSegments;
      const lower = ring * radialSegments + radial;
      const lowerNext = ring * radialSegments + next;
      const upper = (ring + 1) * radialSegments + radial;
      const upperNext = (ring + 1) * radialSegments + next;
      indices.push(lower, upper, lowerNext, lowerNext, upper, upperNext);
    }
  }
  if (capStart) {
    // Structural axes are closed solids even when their first ring is hidden
    // inside a parent or below grade. This internal plug prevents a grazing
    // camera, imperfect overlap, or exported backface view from revealing a
    // black hollow tube at the trunk base or a branch insertion.
    const centerIndex = positions.length / 3;
    const start = points[0];
    positions.push(start.x, start.y, start.z);
    uvs.push(0.5, lengths[0] + uvVOffset);
    colors.push(color.r, color.g, color.b);
    vertexPartIds.push(partIds[0]);
    for (let radial = 0; radial < radialSegments; radial += 1) {
      indices.push(
        centerIndex,
        (radial + 1) % radialSegments,
        radial,
      );
    }
  }
  if (capEnd) {
    const centerIndex = positions.length / 3;
    const end = points.at(-1);
    positions.push(end.x, end.y, end.z);
    uvs.push(0.5, lengths.at(-1));
    colors.push(color.r, color.g, color.b);
    vertexPartIds.push(partIds.at(-1));
    const ringStart = (points.length - 1) * radialSegments;
    for (let radial = 0; radial < radialSegments; radial += 1) {
      indices.push(centerIndex, ringStart + radial, ringStart + (radial + 1) % radialSegments);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute(
    'toonlabPartId',
    new THREE.Float32BufferAttribute(vertexPartIds, 1),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function segmentGeometry(segment, radialSegments, color = new THREE.Color(0x8a6545)) {
  const start = new THREE.Vector3(...segment.start);
  const end = new THREE.Vector3(...segment.end);
  let vector = end.clone().sub(start);
  if (
    segment.openEnded
    && segment.geometryKind !== 'pad'
    && segment.geometryKind !== 'ribbed-apex'
  ) {
    // Adjacent curved sections meet at an angle. A very small hidden overlap
    // closes the otherwise visible wedge between their open rims without
    // adding joint blobs or changing the semantic centerline.
    const originalLength = vector.length();
    if (originalLength > 1e-5) {
      const overlap = Math.min(
        originalLength * 0.06,
        Math.max(segment.radiusStart, segment.radiusEnd, 0.01) * 0.24,
      );
      const overlapDirection = vector.clone().multiplyScalar(1 / originalLength);
      start.addScaledVector(overlapDirection, -overlap);
      end.addScaledVector(overlapDirection, overlap);
      vector = end.clone().sub(start);
    }
  }
  const length = Math.max(vector.length(), 1e-4);
  // Terminal twigs need another branch order for a credible dormant
  // silhouette, but not the same round-section budget as the trunk. Four
  // sides at LOD0 (three thereafter) preserve the stylized taper and stable
  // semantic part while paying roughly half the triangles of a full tube.
  const segmentRadialSegments = segmentRadialSegmentCount(segment, radialSegments);
  let geometry;
  if (segment.geometryKind === 'culm-sheath') {
    geometry = createCulmSheathGeometry(segment, length, segmentRadialSegments);
  } else if (segment.geometryKind === 'pad') {
    geometry = new THREE.SphereGeometry(
      1,
      Math.max(8, segmentRadialSegments * 2),
      Math.max(6, segmentRadialSegments),
    );
    const padPosition = geometry.attributes.position;
    for (let index = 0; index < padPosition.count; index += 1) {
      const localY = THREE.MathUtils.clamp((padPosition.getY(index) + 1) * 0.5, 0, 1);
      padPosition.setX(
        index,
        padPosition.getX(index) * THREE.MathUtils.lerp(0.82, 1.08, localY),
      );
    }
    padPosition.needsUpdate = true;
    geometry.scale(
      segment.padWidth ?? Math.max(segment.radiusStart, segment.radiusEnd) * 1.9,
      length * 0.5,
      segment.padThickness ?? Math.max(segment.radiusStart, segment.radiusEnd) * 0.22,
    );
  } else if (segment.geometryKind === 'ribbed-apex') {
    const ribScale = THREE.MathUtils.clamp(radialSegments / 8, 0.35, 1);
    const ribCount = Math.max(5, Math.round((segment.ribCount ?? 16) * ribScale));
    geometry = new THREE.SphereGeometry(
      1,
      Math.max(10, ribCount * 2),
      Math.max(5, Math.round(ribCount * 0.65)),
      0,
      Math.PI * 2,
      0,
      Math.PI * 0.5,
    );
    const radius = Math.max(segment.radiusStart, segment.radiusEnd, 0.02);
    geometry.scale(radius, length, radius);
    applyRibProfile(geometry, ribCount, segment.grooveDepth ?? 0.15);
  } else {
    const ribScale = THREE.MathUtils.clamp(radialSegments / 8, 0.35, 1);
    const ribCount = segment.geometryKind === 'ribbed'
      ? Math.max(5, Math.round((segment.ribCount ?? 16) * ribScale))
      : null;
    geometry = segment.openEnded && !ribCount
      ? createOpenJunctionTubeGeometry(segment, length, segmentRadialSegments)
      : new THREE.CylinderGeometry(
        segment.radiusEnd,
        segment.radiusStart,
        length,
        ribCount ? Math.max(10, ribCount * 2) : segmentRadialSegments,
        1,
        segment.semantic === 'node' || Boolean(segment.openEnded),
      );
    if (ribCount) applyRibProfile(geometry, ribCount, segment.grooveDepth ?? 0.15);
  }
  let orientation;
  if (segment.geometryKind === 'pad' && Array.isArray(segment.padNormal)) {
    const yAxis = vector.normalize();
    const requestedNormal = new THREE.Vector3(...segment.padNormal).normalize();
    const xAxis = new THREE.Vector3().crossVectors(yAxis, requestedNormal).normalize();
    const zAxis = new THREE.Vector3().crossVectors(xAxis, yAxis).normalize();
    orientation = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis),
    );
  } else {
    orientation = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      vector.normalize(),
    );
    if (segment.geometryKind === 'pad' && Number.isFinite(segment.padRoll)) {
      orientation.multiply(new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        segment.padRoll,
      ));
    }
  }
  geometry.applyQuaternion(orientation);
  const centerAmount = segment.geometryKind === 'ribbed-apex' ? 0 : 0.5;
  geometry.translate(
    THREE.MathUtils.lerp(start.x, end.x, centerAmount),
    THREE.MathUtils.lerp(start.y, end.y, centerAmount),
    THREE.MathUtils.lerp(start.z, end.z, centerAmount),
  );
  addPartId(geometry, segment.partId);
  addVertexColor(geometry, color);
  return geometry;
}

function spineGeometry(attachment, radialSegments, color) {
  const start = new THREE.Vector3(...attachment.position);
  if (attachment.glochidOnly || attachment.areole) {
    const radius = Math.max(attachment.size * (attachment.glochidOnly ? 0.72 : 0.38), 0.004);
    const geometry = new THREE.SphereGeometry(radius, 5, 4);
    geometry.scale(1, 0.38, 1);
    geometry.translate(start.x, start.y, start.z);
    addPartId(geometry, attachment.partId);
    addVertexColor(geometry, color);
    return geometry;
  }
  const direction = new THREE.Vector3(...attachment.direction).normalize();
  const end = start.clone().addScaledVector(direction, Math.max(attachment.size, 0.02));
  return segmentGeometry({
    start: start.toArray(),
    end: end.toArray(),
    radiusStart: Math.max(attachment.size * 0.055, 0.003),
    radiusEnd: 0.001,
    partId: attachment.partId,
  }, Math.max(3, Math.floor(radialSegments * 0.5)), color);
}

function remeshedSegments(graph, sectionStride, mergeTerminalChains = false) {
  const stride = Math.max(1, Math.round(sectionStride || 1));
  if (stride === 1) return graph.segments;
  const runs = [];
  const lastRunByAxis = new Map();
  const connected = (left, right) => left.every(
    (value, index) => Math.abs(value - right[index]) <= 1e-6,
  );
  let retainedLeafIndex = 0;
  for (const segment of graph.segments) {
    if (segment.semantic === 'retained-leaf-base') {
      const keepRetainedLeaf = retainedLeafIndex % stride === 0;
      retainedLeafIndex += 1;
      if (!keepRetainedLeaf) continue;
    }
    const previous = lastRunByAxis.get(segment.axisId);
    const continuesTerminalChain = mergeTerminalChains
      && previous?.semantic === 'branch'
      && segment.semantic === 'twig';
    if (
      previous
      && (previous.semantic === segment.semantic || continuesTerminalChain)
      && previous.geometryKind === segment.geometryKind
      && connected(previous.segments.at(-1).end, segment.start)
    ) {
      previous.segments.push(segment);
      continue;
    }
    const run = {
      axisId: segment.axisId,
      geometryKind: segment.geometryKind,
      semantic: segment.semantic,
      segments: [segment],
    };
    runs.push(run);
    lastRunByAxis.set(segment.axisId, run);
  }
  return runs.flatMap((run) => {
    if (run.geometryKind === 'pad') return run.segments;
    const remeshed = [];
    for (let index = 0; index < run.segments.length; index += stride) {
      const chunk = run.segments.slice(index, index + stride);
      const first = chunk[0];
      const last = chunk.at(-1);
      remeshed.push({
        ...first,
        end: last.end,
        radiusEnd: last.radiusEnd,
      });
    }
    return remeshed;
  });
}

function structureGeometry(graph, radialSegments, options, profile) {
  const barkColor = new THREE.Color(
    profile.engine === 'culm-colony'
      ? 0x8aa33c
      : profile.id === 'cocos-nucifera'
        ? 0x756e62
        : 0x8a6545,
  );
  const succulentColor = new THREE.Color().setRGB(
    ...materialColor(profile, options.foliageState ?? profile.validFoliageStates[0]),
    THREE.SRGBColorSpace,
  );
  const organAxisColor = new THREE.Color().setRGB(
    ...(profile.structuralTraits.palmRachisColor ?? [
      profile.foliageColor[0] * 0.72,
      profile.foliageColor[1] * 0.72,
      profile.foliageColor[2] * 0.72,
    ]),
    THREE.SRGBColorSpace,
  );
  const petioleColor = new THREE.Color().setRGB(
    Math.min(1, profile.foliageColor[0] * 0.96),
    Math.min(1, profile.foliageColor[1] * 0.96),
    Math.min(1, profile.foliageColor[2] * 0.88),
    THREE.SRGBColorSpace,
  );
  const scarColor = barkColor.clone().multiplyScalar(
    profile.id === 'cocos-nucifera' ? 0.88 : 0.68,
  );
  const corkColor = new THREE.Color(0x78644c);
  const areoleColor = new THREE.Color(0x85735f);
  const spineColor = new THREE.Color(0xd5cdb6);
  const culmSheathColor = new THREE.Color().setRGB(
    ...(profile.structuralTraits.culmSheathColor ?? [0.38, 0.43, 0.12]),
    THREE.SRGBColorSpace,
  );
  const segmentColor = (segment) => {
    if (segment.semantic === 'succulent-cork') return corkColor;
    if (profile.engine === 'succulent-axis') {
      if (segment.semantic === 'pad') {
        const variation = 0.92 + ((segment.partId * 37) % 11) / 100;
        return succulentColor.clone().multiplyScalar(variation);
      }
      return succulentColor;
    }
    if (segment.semantic === 'frond-rachis') return organAxisColor;
    if (segment.semantic === 'petiole') return petioleColor;
    if (segment.semantic === 'leaf-scar-ring') return scarColor;
    if (segment.semantic === 'culm-sheath') return culmSheathColor;
    return barkColor;
  };
  const bambooMaxStructuralLevel = Number(
    options.skeleton?.bambooMaxStructuralLevel,
  );
  const meshSegments = remeshedSegments(
    graph,
    options.skeleton?.meshSectionStride,
    profile.engine === 'culm-colony'
      && Number(options.skeleton?.meshSectionStride) >= 6,
  ).filter((segment) => (
    profile.engine !== 'culm-colony'
      || !Number.isFinite(bambooMaxStructuralLevel)
      || !Number.isFinite(Number(segment.level))
      || Number(segment.level) <= bambooMaxStructuralLevel
  ));
  const continuousEngine = profile.engine === 'woody-axis'
    || profile.engine === 'whorled-conifer';
  const continuousSemantics = new Set(['trunk', 'branch', 'twig']);
  const axisById = new Map(graph.axes.map((axis) => [axis.id, axis]));
  const visualAxisIdByAxisId = new Map();
  const visualAxisId = (axisId) => {
    if (visualAxisIdByAxisId.has(axisId)) {
      return visualAxisIdByAxisId.get(axisId);
    }
    const axis = axisById.get(axisId);
    // A recursive terminal continuation is the distal section of the same
    // visible branch, even though it remains a separate semantic axis in the
    // plant graph. Sweep that chain as one tube so an area-preserving taper
    // does not render as a stack of cut branch stumps.
    const id = axis?.terminalContinuation && axis.parentAxisId
      ? visualAxisId(axis.parentAxisId)
      : axisId;
    visualAxisIdByAxisId.set(axisId, id);
    return id;
  };
  const continuousByAxis = new Map();
  const discreteSegments = [];
  for (const segment of meshSegments) {
    if (
      continuousEngine
      && segment.openEnded
      && !segment.geometryKind
      && continuousSemantics.has(segment.semantic)
    ) {
      const visibleAxisId = visualAxisId(segment.axisId);
      const entries = continuousByAxis.get(visibleAxisId) ?? [];
      entries.push(segment);
      continuousByAxis.set(visibleAxisId, entries);
    } else {
      discreteSegments.push(segment);
    }
  }
  const structuralParentPartIds = new Set(
    meshSegments
      .filter((segment) => continuousSemantics.has(segment.semantic))
      .map((segment) => segment.parentPartId)
      .filter((partId) => partId != null),
  );
  const pieces = discreteSegments.map((segment) =>
    segmentGeometry(segment, radialSegments, segmentColor(segment)));
  for (const entries of continuousByAxis.values()) {
    const first = entries[0];
    pieces.push(createContinuousAxisTubeGeometry(
      entries,
      segmentRadialSegmentCount(first, radialSegments),
      segmentColor(first),
      { capEnd: !structuralParentPartIds.has(entries.at(-1).partId) },
    ));
  }
  const spineStride = Math.max(1, Math.round(options.skeleton?.meshSectionStride ?? 1));
  pieces.push(...graph.attachments
    .filter((attachment, index) => (
      attachment.semantic === 'spine' && index % spineStride === 0
    ))
    .map((attachment) => spineGeometry(
      attachment,
      radialSegments,
      profile.engine === 'succulent-axis'
        ? attachment.glochidOnly || attachment.areole ? areoleColor : spineColor
        : barkColor,
    )));
  const manualParts = [];
  const manualTips = [];
  let nextPartId = Math.max(0, ...graph.parts.map((part) => part.id)) + 1;
  for (const [index, spine] of (options.branchSpines ?? []).entries()) {
    const tube = createBranchTubeGeometry({
      ...spine,
      radialSegments,
      seed: (options.geometrySeed ?? options.seed ?? 1) * 13.7 + index * 5.3,
      flareBase: spine.points?.[0]?.[1] <= 0.02,
    });
    if (!tube) continue;
    const partId = nextPartId;
    nextPartId += 1;
    const isRoot = spine.points?.at(-1)?.[1] < -0.04;
    addPartId(tube.geometry, partId);
    addVertexColor(tube.geometry, barkColor);
    pieces.push(tube.geometry);
    manualParts.push(Object.freeze({
      id: partId,
      kind: 'segment',
      semantic: isRoot ? 'doodle-root' : spine.grow ? 'doodle-grown-axis' : 'doodle-axis',
      source: 'tree-lab',
    }));
    if (!isRoot && (spine.leafTip || spine.grow)) {
      manualTips.push({
        direction: tube.tipTangent.toArray(),
        position: tube.tip.toArray(),
        sourceSemantic: spine.grow ? 'doodle-grown-foliage' : 'doodle-tip-foliage',
      });
    }
  }
  if (!pieces.length) {
    const fallback = new THREE.CylinderGeometry(0.02, 0.03, 0.2, 5);
    fallback.translate(0, 0.1, 0);
    addPartId(fallback, 0);
    addVertexColor(fallback, barkColor);
    pieces.push(fallback);
  }
  const geometry = pieces.length === 1 ? pieces[0] : mergeGeometries(pieces, false);
  if (pieces.length > 1) pieces.forEach((piece) => piece.dispose());
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return { geometry, manualParts, manualTips, nextPartId };
}

function foliageAttachments(graph) {
  return graph.attachments
    .filter((entry) => entry.semantic !== 'spine')
    .map((entry) => ({
      position: new THREE.Vector3(...entry.position),
      direction: new THREE.Vector3(...entry.direction),
      tangent: new THREE.Vector3(...entry.direction),
      depth: 1,
      normalizedHeight: 1,
      branchRadius: Math.max(entry.size * 0.08, 0.01),
      azimuth: Math.atan2(entry.direction[2], entry.direction[0]),
      crownDropScale: entry.crownDropScale,
      crownDroop: entry.crownDroop ?? 0,
      crownArch: entry.crownArch ?? 0,
      fanPlane: Boolean(entry.fanPlane),
      frondCount: entry.frondCount,
      foliageSprayScale: entry.foliageSprayScale,
      individualLeaf: Boolean(entry.individualLeaf),
      individualRosette: Boolean(entry.individualRosette),
      leafDamage: entry.leafDamage,
      leafNormal: entry.leafNormal ? new THREE.Vector3(...entry.leafNormal) : null,
      leafWidthScale: entry.leafWidthScale,
      cardsPerCluster: entry.cardsPerCluster,
      clusterRadius: entry.clusterRadius,
      densityScale: entry.densityScale,
      emergingLeafletScale: entry.emergingLeafletScale,
      leafletLengthScale: entry.leafletLengthScale,
      leafletPairs: entry.leafletPairs,
      leafletWidthScale: entry.leafletWidthScale,
      organType: entry.organType ?? entry.semantic,
      organSize: entry.size,
      preserveRadialCrown: Boolean(entry.terminalCrown || entry.rosetteHead),
      uprightFrondFraction: entry.uprightFrondFraction,
      whorlRadius: entry.whorlRadius,
    }));
}

function addFoliagePartIds(geometry, organAttachments, fallbackPartId = 0) {
  const attachmentAttribute = geometry.getAttribute('aAttachment');
  const position = geometry.getAttribute('position');
  const values = new Float32Array(position.count);
  for (let index = 0; index < position.count; index += 1) {
    const attachmentIndex = attachmentAttribute ? Math.round(attachmentAttribute.getX(index)) : -1;
    values[index] = organAttachments[attachmentIndex]?.partId ?? fallbackPartId;
  }
  geometry.setAttribute('toonlabPartId', new THREE.Float32BufferAttribute(values, 1));
}

function foliageGeometry(graph, profile, options, firstPartId, manualTips) {
  const attachments = foliageAttachments(graph);
  const manualParts = [];
  let nextPartId = firstPartId;
  const extraAttachments = [...manualTips, ...(options.extraAttachments ?? [])];
  for (const [index, attachment] of extraAttachments.entries()) {
    if (!Array.isArray(attachment.position) || attachment.position.length < 3) continue;
    const partId = nextPartId;
    nextPartId += 1;
    const direction = Array.isArray(attachment.direction) && attachment.direction.length >= 3
      ? new THREE.Vector3(...attachment.direction).normalize()
      : new THREE.Vector3(0, 1, 0);
    attachments.push({
      position: new THREE.Vector3(...attachment.position),
      direction,
      tangent: direction.clone(),
      depth: 1,
      normalizedHeight: 1,
      branchRadius: 0.02,
      azimuth: Math.atan2(direction.z, direction.x),
      partId,
    });
    manualParts.push(Object.freeze({
      id: partId,
      kind: 'organ',
      semantic: attachment.sourceSemantic ?? 'doodle-foliage-attachment',
      source: 'tree-lab',
      attachmentIndex: index,
    }));
  }
  const manualBlobs = [
    ...(options.canopy?.blobs ?? []),
    ...(options.extraBlobs ?? []),
  ];
  const blobPartId = manualBlobs.length ? nextPartId : 0;
  if (manualBlobs.length) {
    nextPartId += 1;
    manualParts.push(Object.freeze({
      id: blobPartId,
      kind: 'organ',
      semantic: 'doodle-foliage-area',
      source: 'tree-lab',
    }));
  }
  // Dormancy is structural, not a brown recolor. Deciduous species must
  // expose their branch graph instead of retaining a full card canopy.
  // Keep the attachment metadata so editing and semantic inspection remain
  // stable while emitting no organ geometry for the live or exported asset.
  if (options.foliageState === 'dormant') {
    return {
      attachments,
      geometry: new THREE.BufferGeometry(),
      manualParts,
    };
  }
  const isSucculent = profile.engine === 'succulent-axis';
  const traits = {
    ...profile.structuralTraits,
    ...(options.traitOverrides ?? {}),
  };
  const frondCount = Math.max(
    5,
    ...graph.attachments.map((entry) => entry.frondCount ?? 0),
    traits.frondCount ?? 0,
  );
  const attachmentOverrides = Object.fromEntries(
    graph.attachments
      .filter((entry) => entry.semantic !== 'spine')
      .map((entry, index) => [index, {
        frondCount: entry.frondCount,
        frondLength: entry.size,
        foliageSprayScale: entry.foliageSprayScale,
        individualLeaf: Boolean(entry.individualLeaf),
        individualRosette: Boolean(entry.individualRosette),
        leafDamage: entry.leafDamage,
        leafNormal: entry.leafNormal ? new THREE.Vector3(...entry.leafNormal) : null,
        leafWidthScale: entry.leafWidthScale,
        bambooLeafLengthScale: entry.bambooLeafLengthScale,
        bambooSingleBladeCards: entry.bambooSingleBladeCards,
        bambooLeafWidthScale: entry.bambooLeafWidthScale,
        cardsPerCluster: entry.cardsPerCluster,
        clusterRadius: entry.clusterRadius,
        crownArch: entry.crownArch,
        crownDropScale: entry.crownDropScale,
        densityScale: entry.densityScale,
        emergingLeafletScale: entry.emergingLeafletScale,
        juvenileEntireLeaf: Boolean(entry.juvenileEntireLeaf),
        leafRunLength: entry.leafRunLength,
        leafletLengthScale: entry.leafletLengthScale,
        leafletLengthRatio: entry.leafletLengthRatio,
        leafletPairs: entry.leafletPairs,
        leafletWidthScale: entry.leafletWidthScale,
        pinnaAlongJitter: entry.pinnaAlongJitter,
        pinnaDownfold: entry.pinnaDownfold,
        pinnaDownfoldJitter: entry.pinnaDownfoldJitter,
        pinnaLengthJitter: entry.pinnaLengthJitter,
        pinnaRoll: entry.pinnaRoll,
        pinnaTipSweep: entry.pinnaTipSweep,
        organType: entry.organType ?? entry.semantic,
        uprightFrondFraction: entry.uprightFrondFraction,
        whorlRadius: entry.whorlRadius,
      }]),
  );
  const geometry = createTreeFoliageGeometry({
    architecture: profile.foliageArchitecture,
    attachments,
    attachmentOverrides,
    blobs: manualBlobs,
    cardCount: !attachments.length && !manualBlobs.length
      ? 0
      : isSucculent && !manualBlobs.length && !extraAttachments.length
      ? 0
      : Math.max(40, attachments.length * 6),
    cardsPerCluster: options.canopy?.cardsPerCluster ?? (
      traits.foliageCardsPerCluster
      ?? (profile.engine === 'culm-colony' ? 5 : profile.engine === 'woody-axis' ? 7 : 4)
    ),
    cardSizeRange: options.canopy?.cardSizeRange ?? (
      traits.foliageCardSizeRange
      ?? (profile.engine === 'culm-colony' ? [0.18, 0.34] : [0.28, 0.58])
    ),
    clusterRadius: options.canopy?.clusterRadius ?? (
      traits.foliageClusterRadius
      ?? (profile.engine === 'culm-colony' ? 0.32 : 0.5)
    ),
    individualBroadleafCards: Boolean(traits.individualBroadleafCards),
    frondCount: options.canopy?.frondCount ?? frondCount,
    frondLength: options.canopy?.frondLength ?? Math.max(0.65, traits.crownWidth * 0.28),
    leafDensity: options.leafDensity ?? traits.canopyDensity,
    seed: (options.geometrySeed ?? options.seed ?? 1) * 7.31 + 1.7,
    shellFill: false,
    sprayLayers: options.canopy?.sprayLayers ?? traits.foliageSprayLayers ?? 3,
    spraySpread: options.canopy?.spraySpread ?? traits.foliageSpraySpread ?? 0.72,
    sprayThickness: options.canopy?.sprayThickness ?? traits.foliageSprayThickness ?? 0.15,
    whorlArms: options.canopy?.whorlArms ?? Math.max(5, traits.children ?? 6),
    whorlRadius: options.canopy?.whorlRadius ?? traits.foliageWhorlRadius ?? 0.42,
  });
  const organAttachments = graph.attachments
    .filter((entry) => entry.semantic !== 'spine')
    .concat(manualParts
      .filter((part) => part.kind === 'organ' && part.attachmentIndex !== undefined)
      .map((part) => ({ partId: part.id })));
  addFoliagePartIds(geometry, organAttachments, blobPartId);
  return { attachments, geometry, manualParts };
}

function serializeOptions(options) {
  const copy = { ...options };
  if (copy.foliage) {
    copy.foliage = { ...copy.foliage };
    delete copy.foliage.leafMap;
  }
  delete copy.trunkMaterial;
  delete copy.vegetationShader;
  return jsonClone(copy);
}

export class ProceduralSpeciesTree extends THREE.Group {
  constructor(options = {}) {
    super();
    const profile = getTreeSpeciesProfile(options.speciesProfileId);
    const baselineRuntime = resolveWoodyBaselineThreeRuntime(profile, options);
    if (baselineRuntime) {
      options = {
        ...options,
        canopy: {
          ...(options.canopy ?? {}),
          ...baselineRuntime.canopy,
        },
        canopyColor: baselineRuntime.canopyColor ?? options.canopyColor,
        foliage: {
          ...(options.foliage ?? {}),
          ...baselineRuntime.wind,
        },
        radialSegments: baselineRuntime.radialSegments,
        traitOverrides: {
          ...(options.traitOverrides ?? {}),
          ...baselineRuntime.traits,
        },
      };
    }
    const lifeStage = options.lifeStage ?? options.lifeStageSlot ?? profile.supportedStages[2];
    const foliageState = options.foliageState ?? profile.validFoliageStates[0];
    if (!profile.validFoliageStates.includes(foliageState)) {
      throw new Error(
        `Foliage state "${foliageState}" is not valid for ${profile.id}; expected ${profile.validFoliageStates.join(', ')}.`,
      );
    }
    const geometrySeed = options.geometrySeed ?? options.seed ?? 1;
    const graph = createPlantGraph({
      speciesProfileId: profile.id,
      lifeStage,
      developmentProgress: options.developmentProgress,
      geometrySeed,
      traitOverrides: options.traitOverrides,
    });
    this.name = `${profile.commonName} (${graph.lifeStageSlot})`;
    this.profile = profile;
    this.plantGraph = graph;
    this.config = {
      ...options,
      speciesProfileId: profile.id,
      lifeStage: graph.lifeStageSlot,
      developmentProgress: graph.developmentProgress,
      geometrySeed,
      foliageState,
    };
    this.scale.setScalar(options.size ?? 1);

    const requestedRadialSegments = Math.max(
      3,
      Math.round(options.skeleton?.radialSegments ?? options.radialSegments ?? 8),
    );
    const radialSegments = baselineRuntime?.radialSegments != null
      ? requestedRadialSegments
      : Math.max(
        3,
        Math.min(
          requestedRadialSegments,
          Math.round(profile.structuralTraits.radialSegments ?? requestedRadialSegments),
        ),
      );
    const surfaceProfileId = treeSurfaceProfileId(profile);
    const surfaceTexture = surfaceProfileId
      ? treeSurfaceTextureForSpecies(profile, { seed: geometrySeed })
      : null;
    const evaluatedTraits = graph.resolvedTraits ?? profile.structuralTraits;
    let evaluatedBarkColor = Array.isArray(evaluatedTraits.barkColor)
      ? evaluatedTraits.barkColor
      : [1, 1, 1];
    if (evaluatedTraits.mossEnabled && Array.isArray(evaluatedTraits.mossColor)) {
      const mossBlend = THREE.MathUtils.clamp(
        0.12 * (Number(evaluatedTraits.mossScale) || 1),
        0.04,
        0.42,
      );
      evaluatedBarkColor = evaluatedBarkColor.map((channel, index) => (
        THREE.MathUtils.lerp(channel, evaluatedTraits.mossColor[index], mossBlend)
      ));
    }
    // Bark colors from the woody baseline controls are authored in LINEAR
    // space ([0.2, 0.105, 0.045] is the default #7c5b3c bark brown). Passing
    // the raw array into createWoodySurfaceNodeMaterial re-declared it as
    // sRGB, collapsing the albedo to a near-black #331b0b; construct the
    // Color here so the authored values pass through unconverted.
    const authoredBarkColor = new THREE.Color().setRGB(...evaluatedBarkColor);
    // The structure geometry bakes SEMANTIC vertex albedo around a generic
    // per-engine bark constant (see structureGeometry: bark, leaf-scar, cork,
    // petiole tints). A plain material color multiplies that absolute bake,
    // double-applying brown and reading near-black. Tint by
    // authored / generic instead: bark segments land exactly on the authored
    // species color while scars and cork keep their relative contrast.
    const genericBakeColor = new THREE.Color(
      profile.engine === 'culm-colony'
        ? 0x8aa33c
        : profile.id === 'cocos-nucifera'
          ? 0x756e62
          : 0x8a6545,
    );
    const structureMaterial = options.trunkMaterial ?? (
      surfaceTexture
        ? createWoodySurfaceNodeMaterial({
          color: authoredBarkColor,
          height: profile.structuralTraits.height,
          map: surfaceTexture,
          vegetationShader: options.vegetationShader,
        })
        : new THREE.MeshStandardMaterial({
          color: new THREE.Color(
            authoredBarkColor.r / Math.max(genericBakeColor.r, 1e-3),
            authoredBarkColor.g / Math.max(genericBakeColor.g, 1e-3),
            authoredBarkColor.b / Math.max(genericBakeColor.b, 1e-3),
          ),
          roughness: 0.92,
          metalness: 0,
          vertexColors: true,
        })
    );
    if (surfaceTexture) {
      structureMaterial.userData.treeSurfaceProfileId = surfaceProfileId;
      structureMaterial.userData.treeSurfaceTextureOwnsColor = true;
      // A generated surface owns a deliberately narrow readability floor.
      // Explicit Tree Shader settings still win, so this never fights a
      // user-authored style.
      if (!options.vegetationShader) {
        const shader = treeSurfaceProfile(profile)?.shader;
        if (shader) {
          structureMaterial.uniforms.uStyleBarkBandSoftness.value = shader.bandSoftness;
          structureMaterial.uniforms.uStyleBarkShadowFloor.value = shader.shadowFloor;
          structureMaterial.uniforms.uStyleBarkSkyFillStrength.value = shader.skyFillStrength;
        }
      }
    }
    structureMaterial.name = profile.engine === 'succulent-axis'
      ? 'StylizedSucculentSurface'
      : profile.engine === 'culm-colony'
        ? 'StylizedCulmSurface'
        : 'StylizedWoodySurface';
    const recursiveWoody = graph.growthModel === 'toonlab-recursive-woody-v3';
    let structure;
    let nativeFoliageGraph = graph;
    if (recursiveWoody) {
      const nativeGeometry = createRecursiveWoodyStructureGeometry(graph, {
        color: new THREE.Color(0x8a6545),
        mapping: evaluatedTraits,
        radialSegments,
        sectionStride: options.skeleton?.meshSectionStride ?? 1,
      });
      const doodle = createRecursiveWoodyDoodleStructureGeometry(
        options.branchSpines ?? [],
        {
          color: new THREE.Color(0x8a6545),
          firstPartId: Math.max(0, ...graph.parts.map((part) => part.id)) + 1,
          mapping: evaluatedTraits,
          radialSegments,
        },
      );
      let geometry = nativeGeometry;
      if (doodle.geometry.getAttribute('position')?.count) {
        geometry = mergeGeometries([nativeGeometry, doodle.geometry], false);
        nativeGeometry.dispose();
        doodle.geometry.dispose();
      } else {
        doodle.geometry.dispose();
      }
      structure = {
        geometry,
        manualParts: [...doodle.manualParts],
        manualTips: [...doodle.manualTips],
        nextPartId: doodle.nextPartId,
      };

      const nativeAttachments = [...graph.attachments];
      const nativeFoliageParts = [];
      let nextPartId = structure.nextPartId;
      const extraAttachments = [
        ...structure.manualTips,
        ...(options.extraAttachments ?? []),
      ];
      for (const attachment of extraAttachments) {
        if (!Array.isArray(attachment.position) || attachment.position.length < 3) continue;
        const direction = Array.isArray(attachment.direction)
          && attachment.direction.length >= 3
          ? new THREE.Vector3(...attachment.direction).normalize().toArray()
          : [0, 1, 0];
        const partId = nextPartId;
        nextPartId += 1;
        nativeAttachments.push(Object.freeze({
          cardsPerCluster: graph.resolvedTraits?.foliageCardsPerCluster ?? 8,
          direction,
          foliageSprayScale: 1,
          partId,
          position: [...attachment.position],
          semantic: profile.foliageOrgan,
          size: Math.max(0.05, graph.resolvedTraits?.crownWidth * 0.012 || 0.08),
        }));
        nativeFoliageParts.push(Object.freeze({
          id: partId,
          kind: 'organ',
          semantic: attachment.sourceSemantic ?? 'doodle-foliage-attachment',
          source: 'tree-lab',
        }));
      }
      const manualBlobs = [
        ...(options.canopy?.blobs ?? []),
        ...(options.extraBlobs ?? []),
      ];
      for (const blob of manualBlobs) {
        if (!Array.isArray(blob.offset) || blob.offset.length < 3) continue;
        const partId = nextPartId;
        nextPartId += 1;
        const radius = Math.max(0.08, Number(blob.radius) || 0.4);
        nativeAttachments.push(Object.freeze({
          cardsPerCluster: Math.max(
            8,
            Math.round((graph.resolvedTraits?.foliageCardsPerCluster ?? 8) * 1.4),
          ),
          direction: [0, 1, 0],
          foliageSprayScale: THREE.MathUtils.clamp(radius / 0.38, 0.45, 2.2),
          partId,
          position: [...blob.offset],
          semantic: profile.foliageOrgan,
          size: radius,
        }));
        nativeFoliageParts.push(Object.freeze({
          id: partId,
          kind: 'organ',
          semantic: 'doodle-foliage-area',
          source: 'tree-lab',
        }));
      }
      structure.manualFoliageParts = nativeFoliageParts;
      structure.nextPartId = nextPartId;
      nativeFoliageGraph = { ...graph, attachments: nativeAttachments };
    } else {
      structure = structureGeometry(graph, radialSegments, this.config, profile);
    }
    this.trunkMesh = new THREE.Mesh(structure.geometry, structureMaterial);
    this.trunkMesh.name = 'Structure';
    this.trunkMesh.castShadow = true;
    this.trunkMesh.receiveShadow = true;
    this.trunkMesh.userData.toonlabVegetationRole = 'structuralSurface';
    this.trunkMesh.userData.generationPipeline = recursiveWoody
      ? 'recursive-woody-v3'
      : 'legacy-architecture';

    const foliage = recursiveWoody
      ? {
        attachments: foliageAttachments(nativeFoliageGraph),
        geometry: createRecursiveWoodyFoliageGeometry(
          nativeFoliageGraph,
          profile,
          graph.resolvedTraits,
          {
            foliageState,
            seed: geometrySeed,
          },
        ),
        manualParts: structure.manualFoliageParts ?? [],
      }
      : foliageGeometry(
        graph,
        profile,
        this.config,
        structure.nextPartId,
        structure.manualTips,
      );
    const canopyGeometry = foliage.geometry;
    // Architecture-owned organs must never inherit a broadleaf editor shape
    // left behind by another species. Bamboo blades, needles, fronds, and
    // rosette leaves have dedicated geometry/sprites and stay authoritative.
    const architectureOwnedOrgans = new Set([
      'bamboo-leaf',
      'fan-frond',
      'fern-frond',
      'giant-monocot-leaf',
      'needle-fascicle',
      'pinnate-frond',
      'rosette-leaf',
      'scale-spray',
      'single-needle',
      'spine',
    ]);
    const architectureOwnsLeaf = architectureOwnedOrgans.has(profile.foliageOrgan);
    const authoredLeafShape = architectureOwnsLeaf
      ? profile.leafShape
      : options.leafShape?.preset ?? profile.leafShape;
    const materials = createTreeFoliageMaterials({
      color: materialColor(profile, foliageState, options.canopyColor),
      backlitStrength: evaluatedTraits.leafTranslucency,
      leafShape: authoredLeafShape,
      leafMap: options.foliage?.leafMap ?? (recursiveWoody
        ? createRecursiveWoodyLeafTexture(profile, authoredLeafShape)
        : (
        (architectureOwnsLeaf || !options.leafShape) && (
          profile.structuralTraits.individualBroadleafCards
        || profile.foliageOrgan === 'single-needle'
        || profile.foliageOrgan === 'giant-monocot-leaf'
        || profile.foliageOrgan === 'pinnate-frond'
        || profile.foliageOrgan === 'fern-frond'
        || profile.foliageOrgan === 'bamboo-leaf'
        || profile.foliageOrgan === 'rosette-leaf'
        )
          ? createOrganLeafSpriteTexture({
            shape: profile.structuralTraits.individualBroadleafCards ? 'oak-leaf'
              : profile.foliageOrgan === 'single-needle' ? 'spruce-spray'
              : profile.foliageOrgan === 'giant-monocot-leaf' ? 'giant-monocot'
              : profile.foliageOrgan === 'fern-frond' ? 'fern-pinna'
              : profile.foliageOrgan === 'bamboo-leaf' ? 'bamboo-leaf'
                : profile.foliageOrgan === 'rosette-leaf' ? 'rosette-blade'
                : profile.id === 'cocos-nucifera'
                  && graph.lifeStageSlot !== 'juvenile-rosette'
                  ? 'coconut-pinna-group'
                : 'pinna',
          })
          : undefined
        )
      ),
      seed: geometrySeed,
      vegetationShader: options.vegetationShader,
      ...(options.foliage ?? {}),
    });
    if (
      evaluatedTraits.leafGradientEnabled
      && Array.isArray(evaluatedTraits.leafColorA)
      && Array.isArray(evaluatedTraits.leafColorB)
    ) {
      materials.material.uniforms.uLitColor.value.setRGB(
        ...evaluatedTraits.leafColorA,
      );
      materials.material.uniforms.uShadowColor.value.setRGB(
        ...evaluatedTraits.leafColorB,
      );
      materials.material.uniforms.uCrownColor.value
        .copy(materials.material.uniforms.uLitColor.value)
        .lerp(materials.material.uniforms.uShadowColor.value, 0.35);
    } else if (Array.isArray(evaluatedTraits.leafColorA)) {
      materials.material.uniforms.uLitColor.value.setRGB(...evaluatedTraits.leafColorA);
      materials.material.uniforms.uShadowColor.value
        .copy(materials.material.uniforms.uLitColor.value);
      materials.material.uniforms.uCrownColor.value
        .copy(materials.material.uniforms.uLitColor.value);
    }
    if (Number(evaluatedTraits.leafEmission) > 0) {
      const emission = THREE.MathUtils.clamp(
        Number(evaluatedTraits.leafEmission),
        0,
        2,
      );
      for (const key of ['uLitColor', 'uShadowColor', 'uCrownColor']) {
        materials.material.uniforms[key].value
          .multiplyScalar(1 + emission * 0.25);
      }
    }
    this.canopyMesh = new THREE.Mesh(canopyGeometry, materials.material);
    this.canopyMesh.name = 'Organs';
    this.canopyMesh.customDepthMaterial = materials.depthMaterial;
    this.canopyMesh.castShadow = true;
    this.canopyMesh.receiveShadow = true;
    this.canopyMesh.frustumCulled = false;
    this.canopyMesh.userData.environmentShaderExclude = true;
    this.canopyMesh.userData.toonlabVegetationRole = 'foliageOrgans';
    this.canopyMesh.userData.generationPipeline = recursiveWoody
      ? 'recursive-woody-v3'
      : 'legacy-architecture';

    const reproductive = recursiveWoody
      ? createRecursiveWoodyReproductiveGeometry(nativeFoliageGraph, evaluatedTraits, {
        firstPartId: structure.nextPartId,
        seed: geometrySeed,
      })
      : {
        geometry: new THREE.BufferGeometry(),
        manualParts: [],
        nextPartId: structure.nextPartId,
      };
    this.reproductiveMesh = new THREE.Mesh(
      reproductive.geometry,
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        metalness: 0,
        roughness: 0.72,
        side: THREE.DoubleSide,
        vertexColors: true,
      }),
    );
    this.reproductiveMesh.name = 'ReproductiveOrgans';
    this.reproductiveMesh.castShadow = true;
    this.reproductiveMesh.userData.toonlabVegetationRole = 'reproductiveOrgans';
    this.reproductiveMesh.userData.generationPipeline = recursiveWoody
      ? 'recursive-woody-v3'
      : 'legacy-architecture';

    const manualParts = [
      ...structure.manualParts,
      ...foliage.manualParts,
      ...reproductive.manualParts,
    ];
    const semanticParts = Object.fromEntries(
      [...graph.parts, ...manualParts].map((part) => [part.id, part]),
    );
    this.userData.plantGraph = graph;
    this.userData.woodyBaselineControls = baselineRuntime?.controls ?? null;
    this.userData.realizeInstances = evaluatedTraits.realizeInstances;
    this.userData.motion = baselineRuntime?.wind ?? null;
    this.userData.shedding = evaluatedTraits.sheddingEnabled ? {
      burstCount: evaluatedTraits.sheddingBurstCount,
      burstInterval: evaluatedTraits.sheddingBurstInterval,
      fade: evaluatedTraits.sheddingFade,
      fallSpeed: evaluatedTraits.sheddingFallSpeed,
      lifetime: evaluatedTraits.sheddingLifetime,
      scale: evaluatedTraits.sheddingScale,
      windInfluence: evaluatedTraits.sheddingWindInfluence,
    } : null;
    this.userData.doodleParts = manualParts;
    this.userData.structuralHash = graph.structuralHash;
    this.userData.toonlabSemanticParts = semanticParts;
    this.trunkMesh.userData.toonlabSemanticRole = 'structure';
    this.trunkMesh.userData.toonlabSemanticParts = semanticParts;
    this.canopyMesh.userData.toonlabSemanticRole = 'organs';
    this.canopyMesh.userData.toonlabSemanticParts = semanticParts;
    this.reproductiveMesh.userData.toonlabSemanticRole = 'reproductive-organs';
    this.reproductiveMesh.userData.toonlabSemanticParts = semanticParts;
    this.foliageAttachments = foliage.attachments;
    this.add(this.trunkMesh);
    if (recursiveWoody && evaluatedTraits.outlineEnabled && evaluatedTraits.outlineWidth > 0) {
      this.outlineMesh = new THREE.Mesh(
        structure.geometry,
        new THREE.MeshBasicMaterial({
          color: new THREE.Color().setRGB(...evaluatedTraits.outlineColor),
          side: THREE.BackSide,
        }),
      );
      this.outlineMesh.name = 'StructureOutline';
      this.outlineMesh.scale.setScalar(1 + evaluatedTraits.outlineWidth);
      this.outlineMesh.userData.toonlabVegetationRole = 'outline';
      this.add(this.outlineMesh);
    }
    if (
      !evaluatedTraits.curvePreviewOnly
      && canopyGeometry.getAttribute('position')?.count
    ) this.add(this.canopyMesh);
    if (
      !evaluatedTraits.curvePreviewOnly
      && reproductive.geometry.getAttribute('position')?.count
    ) {
      this.add(this.reproductiveMesh);
    }
    if (evaluatedTraits.curvePreviewOnly) {
      structureMaterial.wireframe = true;
      this.userData.curvePreviewOnly = true;
    }
  }

  setSun(options = {}) {
    setCanopySun(this.canopyMesh.material.uniforms, options);
    setWoodySurfaceSun(this.trunkMesh.material, options);
    return this;
  }

  setWind(options = {}) {
    setCanopyWind(this.canopyMesh.material.uniforms, options);
    return this;
  }

  setSceneShadow(options = {}) {
    setCanopySceneShadow(this.canopyMesh.material.uniforms, options);
    return this;
  }

  setCloudShadow(options = {}) {
    setCanopyCloudShadow(this.canopyMesh.material.uniforms, options);
    return this;
  }

  /** Transient weather does not change the authored recipe or shader profile. */
  setSurfaceWeather({ wetness, snowCover } = {}) {
    for (const material of [this.canopyMesh.material, this.trunkMesh.material]) {
      const uniforms = material?.uniforms;
      if (uniforms?.uWetness && wetness !== undefined) {
        uniforms.uWetness.value = THREE.MathUtils.clamp(Number(wetness) || 0, 0, 1);
      }
      if (uniforms?.uSnowCover && snowCover !== undefined) {
        uniforms.uSnowCover.value = THREE.MathUtils.clamp(Number(snowCover) || 0, 0, 1);
      }
    }
    return this;
  }

  setSceneFog(fog) {
    syncFoliageFog(this.canopyMesh.material, fog);
    return this;
  }

  setVegetationShader(profile) {
    return applyVegetationShader(this, profile);
  }

  update(delta) {
    tickCanopyTime(this.canopyMesh.material.uniforms, delta);
    return this;
  }

  toJSON() {
    return {
      schema: 'treeRecipe',
      version: 3,
      type: 'tree',
      speciesProfileId: this.profile.id,
      architecture: {
        id: this.profile.architectureId,
        engine: this.profile.engine,
        version: this.profile.architectureVersion,
      },
      lifeStageSlot: this.plantGraph.lifeStageSlot,
      rootProfile: this.profile.rootProfile,
      organProfiles: [this.profile.foliageOrgan],
      structuralHash: this.plantGraph.structuralHash,
      options: serializeOptions(this.config),
      taxonomy: {
        acceptedScientificName: this.profile.scientificName,
        aliases: this.profile.aliases,
        commonName: this.profile.commonName,
        family: this.profile.family,
        genus: this.profile.genus,
        powoTaxonId: this.profile.taxonId,
        backboneVersion: this.profile.taxonomyBackbone.version,
      },
    };
  }

  dispose() {
    this.trunkMesh.geometry.dispose();
    this.trunkMesh.material.dispose();
    this.canopyMesh.geometry.dispose();
    this.canopyMesh.material.dispose();
    this.canopyMesh.customDepthMaterial?.dispose();
    this.reproductiveMesh.geometry.dispose();
    this.reproductiveMesh.material.dispose();
    this.outlineMesh?.material.dispose();
  }
}
