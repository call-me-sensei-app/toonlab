// Layered mesh-led core for the Charged Energy Shot template.
//
// One pooled instance owns a directional core, internal streak geometry,
// translucent energy shell, procedural filament shell, source-anchored release
// ring, and optional local light. Travel particles and impact records stay in
// the shared burst backbone so the complete effect remains bounded.

import * as THREE from 'three';
import { NodeMaterial } from 'three/webgpu';
import {
  abs,
  cameraPosition,
  clamp,
  distance,
  Discard,
  exp,
  Fn,
  max,
  mix,
  normalLocal,
  positionLocal,
  positionWorld,
  pow,
  sin,
  smoothstep,
  texture,
  uniform,
  uv,
  vec3,
  vec4,
} from 'three/tsl';
import {
  createVfxAxialProfile,
  normalizeVfxSilhouetteProfile,
  sampleVfxSilhouetteProfile,
} from '../vfxShapeProfiles.js';
import { resolveVfxEnergyMotionSettings } from '../vfxEnergyMotion.js';

// The authored projectile tapers toward local -X. Keeping this semantic axis
// explicit prevents the mesh silhouette and shader flow from silently facing
// opposite the runtime velocity.
const LOCAL_VISUAL_FORWARD = new THREE.Vector3(-1, 0, 0);
const RELEASE_RING_DURATION = 0.28;
const RELEASE_RING_SEGMENTS = 48;
const MAX_CIRCULATION_ARCS = 12;
const MAX_CIRCULATION_BRANCHES = 12;
const CIRCULATION_SEGMENTS = 18;
const TAU = Math.PI * 2;
const directionScratch = new THREE.Vector3();
const inverseQuaternionScratch = new THREE.Quaternion();
const localPositionScratch = new THREE.Vector3();
const circulationPointScratch = new THREE.Vector3();
const circulationPreviousScratch = new THREE.Vector3();
const circulationNextScratch = new THREE.Vector3();
const circulationTangentScratch = new THREE.Vector3();
const circulationNormalScratch = new THREE.Vector3();
const circulationSideScratch = new THREE.Vector3();

function applyAxialVolumeProfile(geometry, profileInput) {
  const profile = normalizeVfxSilhouetteProfile(profileInput);
  const { axialSegments, radialSegments } = geometry.userData;
  const positions = geometry.getAttribute('position');
  let cursor = 0;
  for (let axial = 0; axial <= axialSegments; axial += 1) {
    const u = axial / axialSegments;
    const scaled = u * (profile.length - 1);
    const lower = Math.floor(scaled);
    const upper = Math.min(lower + 1, profile.length - 1);
    const mix = scaled - lower;
    const radius = (profile[lower] + (profile[upper] - profile[lower]) * mix) * 0.5;
    const x = u - 0.5;
    for (let radial = 0; radial <= radialSegments; radial += 1) {
      const angle = (radial / radialSegments) * Math.PI * 2;
      positions.setXYZ(cursor, x, Math.cos(angle) * radius, Math.sin(angle) * radius);
      cursor += 1;
    }
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.axialProfile = profile.slice();
  return geometry;
}

function createAxialVolumeGeometry(axialSegments = 48, radialSegments = 24) {
  const vertexCount = (axialSegments + 1) * (radialSegments + 1);
  const positions = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  let uvCursor = 0;
  for (let axial = 0; axial <= axialSegments; axial += 1) {
    const u = axial / axialSegments;
    for (let radial = 0; radial <= radialSegments; radial += 1) {
      uvs[uvCursor] = u;
      uvs[uvCursor + 1] = radial / radialSegments;
      uvCursor += 2;
    }
  }
  const indices = [];
  const ringSize = radialSegments + 1;
  for (let axial = 0; axial < axialSegments; axial += 1) {
    for (let radial = 0; radial < radialSegments; radial += 1) {
      const a = axial * ringSize + radial;
      const b = a + ringSize;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.name = 'VfxChargedShotAxialVolume';
  geometry.userData.axialSegments = axialSegments;
  geometry.userData.radialSegments = radialSegments;
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return applyAxialVolumeProfile(geometry, createVfxAxialProfile());
}

function seededUnit(seed, index, salt) {
  const value = Math.sin(
    (Number(seed) || 0) * 12347.17
      + (index + 1) * 9187.13
      + salt * 3571.79,
  ) * 43758.5453123;
  return value - Math.floor(value);
}

function createCirculationRibbonGeometry(
  maxStrips = MAX_CIRCULATION_ARCS + MAX_CIRCULATION_BRANCHES,
  segments = CIRCULATION_SEGMENTS,
) {
  const verticesPerStrip = (segments + 1) * 2;
  const positions = new Float32Array(maxStrips * verticesPerStrip * 3);
  const indices = new Uint32Array(maxStrips * segments * 6);
  let indexCursor = 0;
  for (let strip = 0; strip < maxStrips; strip += 1) {
    const base = strip * verticesPerStrip;
    for (let segment = 0; segment < segments; segment += 1) {
      const a = base + segment * 2;
      const b = a + 2;
      indices[indexCursor] = a;
      indices[indexCursor + 1] = b;
      indices[indexCursor + 2] = a + 1;
      indices[indexCursor + 3] = b;
      indices[indexCursor + 4] = b + 1;
      indices[indexCursor + 5] = a + 1;
      indexCursor += 6;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.name = 'VfxChargedShotCirculationRibbon';
  geometry.userData.maxStrips = maxStrips;
  geometry.userData.segments = segments;
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage),
  );
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.setDrawRange(0, 0);
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1.4);
  return geometry;
}

function createReleaseRingGeometry(name) {
  const geometry = createCirculationRibbonGeometry(1, RELEASE_RING_SEGMENTS);
  geometry.name = name;
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 0.9);
  return geometry;
}

function updateReleaseRingGeometry(
  geometry,
  seed,
  depth,
  irregularity,
  ripples,
  widthScale,
) {
  const positions = geometry.getAttribute('position');
  const { segments } = geometry.userData;
  const phaseA = seededUnit(seed, 0, 71) * TAU;
  const phaseB = seededUnit(seed, 0, 72) * TAU;
  const tiltY = (seededUnit(seed, 0, 73) - 0.5) * 0.28;
  const tiltZ = (seededUnit(seed, 0, 74) - 0.5) * 0.28;
  const sample = (angle, target) => {
    const radiusNoise = 1 + (
      Math.sin(angle * ripples + phaseA) * 0.075
        + Math.sin(angle * (ripples + 2) - phaseB) * 0.028
    ) * irregularity;
    const y = Math.cos(angle) * 0.5 * radiusNoise;
    const z = Math.sin(angle) * 0.5 * radiusNoise;
    const axialWarp = (
      Math.sin(angle * 2 + phaseA) * 0.72
        + Math.sin(angle * ripples - phaseB) * irregularity * 0.28
    ) * depth;
    return target.set(
      axialWarp + y * tiltY + z * tiltZ,
      y,
      z,
    );
  };
  for (let segment = 0; segment <= segments; segment += 1) {
    const angle = segment / segments * TAU;
    const beforeAngle = Math.max(segment - 1, 0) / segments * TAU;
    const afterAngle = Math.min(segment + 1, segments) / segments * TAU;
    sample(angle, circulationPointScratch);
    sample(beforeAngle, circulationPreviousScratch);
    sample(afterAngle, circulationNextScratch);
    circulationTangentScratch.copy(circulationNextScratch)
      .sub(circulationPreviousScratch)
      .normalize();
    circulationNormalScratch.set(
      circulationPointScratch.x * 0.22,
      circulationPointScratch.y,
      circulationPointScratch.z,
    ).normalize();
    circulationSideScratch.crossVectors(
      circulationTangentScratch,
      circulationNormalScratch,
    );
    if (circulationSideScratch.lengthSq() < 1e-8) {
      circulationSideScratch.set(1, 0, 0);
    } else {
      circulationSideScratch.normalize();
    }
    const width = 0.018 * widthScale * (
      1 + Math.sin(angle * ripples + phaseA) * irregularity * 0.12
    );
    circulationSideScratch.multiplyScalar(width);
    const cursor = segment * 2 * 3;
    positions.array[cursor] = circulationPointScratch.x + circulationSideScratch.x;
    positions.array[cursor + 1] = circulationPointScratch.y + circulationSideScratch.y;
    positions.array[cursor + 2] = circulationPointScratch.z + circulationSideScratch.z;
    positions.array[cursor + 3] = circulationPointScratch.x - circulationSideScratch.x;
    positions.array[cursor + 4] = circulationPointScratch.y - circulationSideScratch.y;
    positions.array[cursor + 5] = circulationPointScratch.z - circulationSideScratch.z;
  }
  positions.needsUpdate = true;
  geometry.setDrawRange(0, segments * 6);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.visibleStrips = 1;
}

function createCirculationDescriptors(seed, settings, arcBudget = MAX_CIRCULATION_ARCS) {
  const count = Math.min(
    Math.max(Math.round(Number(settings.circulationCount) || 1), 1),
    Math.max(Math.round(Number(arcBudget) || 0), 0),
    MAX_CIRCULATION_ARCS,
  );
  const descriptors = [];
  for (let index = 0; index < count; index += 1) {
    let direction = 1;
    if (settings.circulationDirection === 'counter-clockwise') direction = -1;
    else if (settings.circulationDirection === 'alternating') {
      direction = (index + Math.floor(seededUnit(seed, index, 2) * 2)) % 2 === 0 ? 1 : -1;
    }
    const planeVariation = settings.circulationPlaneVariation;
    const randomX = seededUnit(seed, index, 31) * 2 - 1;
    const randomAzimuth = seededUnit(seed, index, 32) * TAU;
    const randomRadius = Math.sqrt(Math.max(1 - randomX * randomX, 0));
    const randomY = Math.cos(randomAzimuth) * randomRadius;
    const randomZ = Math.sin(randomAzimuth) * randomRadius;
    let normalX = THREE.MathUtils.lerp(1, randomX, planeVariation);
    let normalY = randomY * planeVariation;
    let normalZ = randomZ * planeVariation;
    const normalLength = Math.hypot(normalX, normalY, normalZ) || 1;
    normalX /= normalLength;
    normalY /= normalLength;
    normalZ /= normalLength;
    let axisAX;
    let axisAY;
    let axisAZ;
    if (Math.abs(normalX) < 0.9) {
      axisAX = 0;
      axisAY = normalZ;
      axisAZ = -normalY;
    } else {
      axisAX = -normalZ;
      axisAY = 0;
      axisAZ = normalX;
    }
    const axisALength = Math.hypot(axisAX, axisAY, axisAZ) || 1;
    axisAX /= axisALength;
    axisAY /= axisALength;
    axisAZ /= axisALength;
    const axisBX = normalY * axisAZ - normalZ * axisAY;
    const axisBY = normalZ * axisAX - normalX * axisAZ;
    const axisBZ = normalX * axisAY - normalY * axisAX;
    descriptors.push({
      axialCenter: 0.12 + seededUnit(seed, index, 3) * 0.76,
      axisAX,
      axisAY,
      axisAZ,
      axisBX,
      axisBY,
      axisBZ,
      branch: false,
      coverageScale: 0.72 + seededUnit(seed, index, 4) * 0.56,
      direction,
      flickerRate: 2.7 + seededUnit(seed, index, 5) * 5.8,
      noiseA: seededUnit(seed, index, 6) * TAU,
      noiseB: seededUnit(seed, index, 7) * TAU,
      noiseFrequency: 1.6 + seededUnit(seed, index, 8) * 4.2,
      normalX,
      normalY,
      normalZ,
      phase: seededUnit(seed, index, 9) * TAU,
      speedScale: 0.68 + seededUnit(seed, index, 10) * 0.7,
    });
  }
  const branchCount = Math.min(
    Math.round(count * settings.circulationBranching),
    count,
    MAX_CIRCULATION_BRANCHES,
  );
  for (let index = 0; index < branchCount; index += 1) {
    const parentIndex = Math.min(
      Math.floor(seededUnit(seed, index, 21) * Math.max(count, 1)),
      Math.max(count - 1, 0),
    );
    descriptors.push({
      branch: true,
      branchAxial: (seededUnit(seed, index, 22) - 0.5) * 2,
      branchDirection: seededUnit(seed, index, 23) > 0.5 ? 1 : -1,
      branchSpan: 0.16 + seededUnit(seed, index, 24) * 0.3,
      branchStart: 0.18 + seededUnit(seed, index, 25) * 0.5,
      flickerRate: 4.2 + seededUnit(seed, index, 26) * 7,
      parentIndex,
      phase: seededUnit(seed, index, 27) * TAU,
    });
  }
  return descriptors;
}

function samplePrimaryCirculationPoint(
  descriptor,
  t,
  age,
  settings,
  profile,
  target,
) {
  const irregularity = settings.circulationIrregularity;
  const sweep = (t - 0.5)
    * settings.circulationCoverage
    * descriptor.coverageScale
    * TAU
    * descriptor.direction;
  const travel = age
    * settings.circulationSpeed
    * descriptor.speedScale
    * descriptor.direction;
  const angularNoise = (
    Math.sin(t * TAU * descriptor.noiseFrequency + age * 2.1 + descriptor.noiseA) * 0.16
      + Math.sin(t * TAU * 8.3 - age * 3.7 + descriptor.noiseB) * 0.055
  ) * irregularity;
  const angle = descriptor.phase + travel + sweep + angularNoise;
  const planeWobble = (
    Math.sin(
      angle * (1.7 + descriptor.noiseFrequency * 0.11)
        + t * TAU * 2.3
        + descriptor.noiseB,
    ) * 0.38
      + Math.sin(t * TAU * 7.1 - age * 2.9 + descriptor.noiseA) * 0.11
  ) * irregularity * settings.circulationPlaneVariation;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  let orbitX = descriptor.axisAX * cosine
    + descriptor.axisBX * sine
    + descriptor.normalX * planeWobble;
  let orbitY = descriptor.axisAY * cosine
    + descriptor.axisBY * sine
    + descriptor.normalY * planeWobble;
  let orbitZ = descriptor.axisAZ * cosine
    + descriptor.axisBZ * sine
    + descriptor.normalZ * planeWobble;
  const orbitLength = Math.hypot(orbitX, orbitY, orbitZ) || 1;
  orbitX /= orbitLength;
  orbitY /= orbitLength;
  orbitZ /= orbitLength;
  const axialNoise = Math.sin(
    t * TAU * 5.3 + age * 1.7 + descriptor.noiseA,
  ) * irregularity * 0.045;
  const axialRange = 0.08 + settings.circulationAxialWander * 0.38;
  const u = THREE.MathUtils.clamp(
    descriptor.axialCenter + orbitX * axialRange + axialNoise,
    0.025,
    0.975,
  );
  const baseRadius = sampleVfxSilhouetteProfile(profile, u) * 0.5;
  const radialNoise = 1 + Math.sin(
    t * TAU * 5.7 + age * 4.3 + descriptor.noiseB,
  ) * irregularity * 0.055;
  const radius = baseRadius * settings.circulationSurfaceOffset * radialNoise;
  const radialAngle = Math.atan2(orbitZ, orbitY)
    + Math.sin(t * TAU * 11.3 + descriptor.noiseA) * irregularity * 0.055;
  return target.set(
    u - 0.5,
    Math.cos(radialAngle) * radius,
    Math.sin(radialAngle) * radius,
  );
}

function sampleCirculationPoint(descriptor, descriptors, t, age, settings, profile, target) {
  if (!descriptor.branch) {
    return samplePrimaryCirculationPoint(descriptor, t, age, settings, profile, target);
  }
  const parent = descriptors[descriptor.parentIndex];
  const parentT = THREE.MathUtils.clamp(
    descriptor.branchStart + t * descriptor.branchSpan,
    0,
    1,
  );
  samplePrimaryCirculationPoint(parent, parentT, age, settings, profile, target);
  const divergence = t * t * settings.circulationBranching;
  const angle = Math.atan2(target.z, target.y)
    + descriptor.branchDirection * divergence * 1.08;
  const u = THREE.MathUtils.clamp(
    target.x + 0.5 + descriptor.branchAxial * divergence * 0.16,
    0.025,
    0.975,
  );
  const radius = Math.hypot(target.y, target.z) * (1 + divergence * 0.22);
  return target.set(u - 0.5, Math.cos(angle) * radius, Math.sin(angle) * radius);
}

function visibleCirculationDescriptors(descriptors, age, settings) {
  if (settings.circulationFlicker <= 0.01) return descriptors;
  const threshold = 0.04 + settings.circulationFlicker * 0.58;
  const visible = descriptors.filter((descriptor, index) => {
    const pulse = 0.5 + Math.sin(
      age * descriptor.flickerRate + descriptor.phase * 1.7 + index * 0.83,
    ) * 0.5;
    return pulse >= threshold;
  });
  if (visible.some((descriptor) => !descriptor.branch) || descriptors.length === 0) return visible;
  const primary = descriptors.find((descriptor) => !descriptor.branch);
  return primary ? [primary, ...visible.filter((descriptor) => descriptor.branch)] : visible;
}

function updateCirculationRibbonGeometry(
  geometry,
  descriptors,
  allDescriptors,
  age,
  settings,
  profile,
  widthScale = 1,
) {
  const positions = geometry.getAttribute('position');
  const { segments } = geometry.userData;
  const count = Math.min(descriptors.length, geometry.userData.maxStrips);
  for (let strip = 0; strip < count; strip += 1) {
    const descriptor = descriptors[strip];
    for (let segment = 0; segment <= segments; segment += 1) {
      const t = segment / segments;
      const before = Math.max(segment - 1, 0) / segments;
      const after = Math.min(segment + 1, segments) / segments;
      sampleCirculationPoint(
        descriptor,
        allDescriptors,
        t,
        age,
        settings,
        profile,
        circulationPointScratch,
      );
      sampleCirculationPoint(
        descriptor,
        allDescriptors,
        before,
        age,
        settings,
        profile,
        circulationPreviousScratch,
      );
      sampleCirculationPoint(
        descriptor,
        allDescriptors,
        after,
        age,
        settings,
        profile,
        circulationNextScratch,
      );
      circulationTangentScratch.copy(circulationNextScratch)
        .sub(circulationPreviousScratch)
        .normalize();
      circulationNormalScratch.set(
        circulationPointScratch.x * 0.32,
        circulationPointScratch.y,
        circulationPointScratch.z,
      ).normalize();
      circulationSideScratch.crossVectors(
        circulationTangentScratch,
        circulationNormalScratch,
      );
      if (circulationSideScratch.lengthSq() < 1e-8) {
        circulationSideScratch.set(0, 1, 0);
      } else {
        circulationSideScratch.normalize();
      }
      const endFade = Math.sin(Math.PI * t);
      const width = settings.circulationThickness * widthScale * (0.3 + endFade * 0.7);
      circulationSideScratch.multiplyScalar(width);
      const cursor = (strip * (segments + 1) * 2 + segment * 2) * 3;
      positions.array[cursor] = circulationPointScratch.x + circulationSideScratch.x;
      positions.array[cursor + 1] = circulationPointScratch.y + circulationSideScratch.y;
      positions.array[cursor + 2] = circulationPointScratch.z + circulationSideScratch.z;
      positions.array[cursor + 3] = circulationPointScratch.x - circulationSideScratch.x;
      positions.array[cursor + 4] = circulationPointScratch.y - circulationSideScratch.y;
      positions.array[cursor + 5] = circulationPointScratch.z - circulationSideScratch.z;
    }
  }
  positions.needsUpdate = true;
  geometry.setDrawRange(0, count * segments * 6);
  geometry.userData.visibleStrips = count;
  return count;
}

function additiveFogVisibility(sharedUniforms) {
  const heightFalloff = exp(
    max(positionWorld.y.sub(sharedUniforms.uFogFloorY), 0.0)
      .div(max(sharedUniforms.uFogFalloff, 0.001))
      .negate(),
  );
  const depthTerm = exp(
    distance(positionWorld, cameraPosition).mul(sharedUniforms.uFogDensity).negate(),
  ).oneMinus();
  return clamp(depthTerm.mul(heightFalloff), 0.0, 1.0).oneMinus();
}

function colorUniform(value) {
  return uniform(new THREE.Color(...value));
}

function whiteSourceTexture() {
  const textureValue = new THREE.DataTexture(
    new Uint8Array([255, 255, 255, 255]),
    1,
    1,
    THREE.RGBAFormat,
  );
  textureValue.colorSpace = THREE.NoColorSpace;
  textureValue.needsUpdate = true;
  textureValue.wrapS = THREE.RepeatWrapping;
  textureValue.wrapT = THREE.RepeatWrapping;
  return textureValue;
}

function createCoreMaterial(sharedUniforms) {
  const look = {
    uCoreColor: colorUniform([0.9, 0.98, 1]),
    uEdgeColor: colorUniform([0.28, 0.62, 1]),
    uIntensity: uniform(2.4),
    uSeed: uniform(0),
  };
  const material = new NodeMaterial();
  material.name = 'VfxChargedShotCore';
  material.transparent = true;
  material.blending = THREE.AdditiveBlending;
  material.depthWrite = false;
  material.fog = false;
  material.fragmentNode = Fn(() => {
    const axial = clamp(abs(positionLocal.x).mul(2.0), 0.0, 1.0);
    const center = pow(axial.oneMinus(), 0.32);
    const flow = sin(
      positionLocal.x.mul(38.0)
        .add(sharedUniforms.uTime.mul(19.0))
        .add(look.uSeed.mul(23.0)),
    ).mul(0.08).add(0.94);
    const color = mix(look.uEdgeColor, look.uCoreColor, center)
      .mul(look.uIntensity)
      // Preserve internal structure under a no-tonemapping host contract.
      // The authored intensity remains a meaningful 0..5 macro, while the
      // shader maps it into headroom that bloom can gather without turning
      // the entire projectile into a clipped white oval.
      .mul(0.45)
      .mul(flow)
      .mul(additiveFogVisibility(sharedUniforms));
    return vec4(color, 0.94);
  })();
  material.uniforms = look;
  return { look, material };
}

function createShellMaterial(sharedUniforms) {
  const fallbackTexture = whiteSourceTexture();
  const sourceMap = texture(fallbackTexture, uv());
  const look = {
    uEdgeColor: colorUniform([0.28, 0.62, 1]),
    uIntensity: uniform(1.35),
    uSeed: uniform(0),
    uSpeed: uniform(1.2),
  };
  const material = new NodeMaterial();
  material.name = 'VfxChargedShotShell';
  material.transparent = true;
  material.blending = THREE.AdditiveBlending;
  material.depthWrite = false;
  material.side = THREE.DoubleSide;
  material.fog = false;
  material.fragmentNode = Fn(() => {
    const side = abs(normalLocal.x).oneMinus();
    const rim = pow(clamp(side, 0.0, 1.0), 1.25);
    const pulse = sin(
      positionLocal.x.mul(17.0)
        .add(sharedUniforms.uTime.mul(look.uSpeed).mul(5.0))
        .add(look.uSeed.mul(31.0)),
    ).mul(0.12).add(0.88);
    const authoredMask = mix(0.24, 1.0, sourceMap.r);
    const alpha = clamp(rim.mul(0.46).add(0.08), 0.0, 0.62)
      .mul(look.uIntensity)
      .mul(pulse)
      .mul(authoredMask);
    const visibility = additiveFogVisibility(sharedUniforms);
    return vec4(look.uEdgeColor.mul(alpha).mul(visibility), alpha.mul(visibility));
  })();
  material.uniforms = look;
  return { fallbackTexture, look, material, sourceMap };
}

function createFilamentMaterial(sharedUniforms) {
  const fallbackTexture = whiteSourceTexture();
  const sourceMap = texture(fallbackTexture, uv());
  const look = {
    uAccentColor: colorUniform([0.55, 0.82, 1]),
    uDensity: uniform(1.25),
    uIntensity: uniform(1.35),
    uSeed: uniform(0),
    uSpeed: uniform(1.2),
  };
  const material = new NodeMaterial();
  material.name = 'VfxChargedShotFilaments';
  material.transparent = true;
  material.blending = THREE.AdditiveBlending;
  material.depthWrite = false;
  material.side = THREE.DoubleSide;
  material.fog = false;
  material.fragmentNode = Fn(() => {
    const time = sharedUniforms.uTime.mul(look.uSpeed);
    const a = sin(
      positionLocal.x.mul(41.0).mul(look.uDensity)
        .add(positionLocal.y.mul(19.0))
        .add(time.mul(11.0))
        .add(look.uSeed.mul(17.0)),
    );
    const b = sin(
      positionLocal.x.mul(29.0).mul(look.uDensity)
        .sub(positionLocal.z.mul(23.0))
        .add(time.mul(8.0))
        .add(look.uSeed.mul(43.0)),
    );
    const interference = abs(a.add(b).mul(0.5));
    const authoredMask = smoothstep(0.12, 0.88, sourceMap.r);
    const line = smoothstep(0.76, 0.97, interference).mul(authoredMask);
    Discard(line.lessThan(0.035));
    const brightness = line.mul(look.uIntensity).mul(1.35);
    const visibility = additiveFogVisibility(sharedUniforms);
    return vec4(
      look.uAccentColor.mul(brightness).mul(visibility),
      line.mul(0.94).mul(visibility),
    );
  })();
  material.uniforms = look;
  return { fallbackTexture, look, material, sourceMap };
}

function createAccentMaterial(sharedUniforms, name = 'VfxChargedShotAccent') {
  const look = {
    uAccentColor: colorUniform([0.55, 0.82, 1]),
    uIntensity: uniform(1.4),
    uOpacity: uniform(1),
    uSeed: uniform(0),
  };
  const material = new NodeMaterial();
  material.name = name;
  material.transparent = true;
  material.blending = THREE.AdditiveBlending;
  material.depthWrite = false;
  material.side = THREE.DoubleSide;
  material.fog = false;
  material.fragmentNode = Fn(() => {
    const pulse = sin(
      sharedUniforms.uTime.mul(16.0).add(look.uSeed.mul(29.0)),
    ).mul(0.16).add(0.9);
    const intensity = look.uIntensity.mul(pulse).mul(look.uOpacity);
    const visibility = additiveFogVisibility(sharedUniforms);
    return vec4(
      look.uAccentColor.mul(intensity).mul(visibility),
      clamp(intensity, 0.0, 1.0).mul(visibility),
    );
  })();
  material.uniforms = look;
  return { look, material };
}

function createCirculationMaterial(
  sharedUniforms,
  name,
  { intensity = 1, opacity = 1, pulseRate = 1 } = {},
) {
  const look = {
    uAccentColor: colorUniform([0.55, 0.82, 1]),
    uIntensity: uniform(intensity),
    uOpacity: uniform(opacity),
    uSeed: uniform(0),
    uFlicker: uniform(0.68),
  };
  const material = new NodeMaterial();
  material.name = name;
  material.transparent = true;
  material.blending = THREE.AdditiveBlending;
  material.depthWrite = false;
  material.side = THREE.DoubleSide;
  material.fog = false;
  material.fragmentNode = Fn(() => {
    const pulse = sin(
      sharedUniforms.uTime.mul(23.0 * pulseRate)
        .add(positionLocal.x.mul(47.0))
        .add(positionLocal.y.mul(31.0))
        .add(look.uSeed.mul(37.0)),
    ).mul(0.5).add(0.5);
    const shapedPulse = mix(1.0, pulse.mul(0.7).add(0.3), look.uFlicker);
    const brightness = look.uIntensity.mul(shapedPulse);
    const visibility = additiveFogVisibility(sharedUniforms);
    return vec4(
      look.uAccentColor.mul(brightness).mul(visibility),
      clamp(brightness.mul(look.uOpacity), 0.0, 1.0).mul(visibility),
    );
  })();
  material.uniforms = look;
  return { look, material };
}

function setLookColor(target, value) {
  if (Array.isArray(value)) target.value.setRGB(...value, THREE.SRGBColorSpace);
}

/**
 * Creates one pooled charged-shot visual. `sharedUniforms` must provide uTime
 * so every mesh layer and the burst backbone share one deterministic clock.
 */
export function createChargedShotCore({ sharedUniforms }) {
  const core = createCoreMaterial(sharedUniforms);
  const shell = createShellMaterial(sharedUniforms);
  const filaments = createFilamentMaterial(sharedUniforms);
  const accent = createAccentMaterial(sharedUniforms);
  const releaseAccent = createAccentMaterial(
    sharedUniforms,
    'VfxChargedShotReleaseRingCoreMaterial',
  );
  const releaseGlow = createAccentMaterial(
    sharedUniforms,
    'VfxChargedShotReleaseRingGlowMaterial',
  );
  const circulationGlow = createCirculationMaterial(
    sharedUniforms,
    'VfxChargedShotCirculationGlowMaterial',
    { intensity: 0.7, opacity: 0.36, pulseRate: 0.82 },
  );
  const circulationCore = createCirculationMaterial(
    sharedUniforms,
    'VfxChargedShotCirculationCoreMaterial',
    { intensity: 1.8, opacity: 0.96, pulseRate: 1.17 },
  );

  const root = new THREE.Group();
  root.name = 'VfxChargedShot';
  root.visible = false;
  root.userData.waterExclude = true;

  const volumeGeometry = createAxialVolumeGeometry();
  const coreMesh = new THREE.Mesh(volumeGeometry, core.material);
  coreMesh.name = 'VfxChargedShotDirectionalCore';
  coreMesh.renderOrder = 7;
  root.add(coreMesh);

  const streakGroup = new THREE.Group();
  streakGroup.name = 'VfxChargedShotCoreStreaks';
  const streakGeometry = new THREE.CylinderGeometry(0.012, 0.045, 1, 6, 1, true);
  streakGeometry.rotateZ(Math.PI / 2);
  const streakOffsets = [
    [0, 0.24, 0],
    [-0.08, -0.12, 0.2],
    [0.1, -0.1, -0.22],
  ];
  for (let index = 0; index < streakOffsets.length; index += 1) {
    const streak = new THREE.Mesh(streakGeometry, accent.material);
    streak.name = `VfxChargedShotCoreStreak${index + 1}`;
    streak.position.fromArray(streakOffsets[index]);
    streak.renderOrder = 8;
    streakGroup.add(streak);
  }
  root.add(streakGroup);

  const shellMesh = new THREE.Mesh(volumeGeometry, shell.material);
  shellMesh.name = 'VfxChargedShotEnergyShell';
  shellMesh.renderOrder = 9;
  root.add(shellMesh);

  const filamentMesh = new THREE.Mesh(volumeGeometry, filaments.material);
  filamentMesh.name = 'VfxChargedShotShellFilaments';
  filamentMesh.renderOrder = 10;
  root.add(filamentMesh);

  const circulationGroup = new THREE.Group();
  circulationGroup.name = 'VfxChargedShotCirculatingEnergy';
  const circulationGlowGeometry = createCirculationRibbonGeometry();
  const circulationGlowMesh = new THREE.Mesh(
    circulationGlowGeometry,
    circulationGlow.material,
  );
  circulationGlowMesh.name = 'VfxChargedShotCirculationGlow';
  circulationGlowMesh.renderOrder = 11;
  circulationGroup.add(circulationGlowMesh);
  const circulationCoreGeometry = createCirculationRibbonGeometry();
  const circulationCoreMesh = new THREE.Mesh(
    circulationCoreGeometry,
    circulationCore.material,
  );
  circulationCoreMesh.name = 'VfxChargedShotCirculationCore';
  circulationCoreMesh.renderOrder = 12;
  circulationGroup.add(circulationCoreMesh);
  root.add(circulationGroup);

  const releaseRingAnchor = new THREE.Group();
  releaseRingAnchor.name = 'VfxChargedShotReleaseRingAnchor';
  const releaseRingGroup = new THREE.Group();
  releaseRingGroup.name = 'VfxChargedShotReleaseRing';
  releaseRingGroup.userData.spatialType = 'warped-ring';
  const releaseRingGlowGeometry = createReleaseRingGeometry(
    'VfxChargedShotReleaseRingGlowGeometry',
  );
  const releaseRingGlowMesh = new THREE.Mesh(
    releaseRingGlowGeometry,
    releaseGlow.material,
  );
  releaseRingGlowMesh.name = 'VfxChargedShotReleaseRingGlow';
  releaseRingGlowMesh.renderOrder = 11;
  releaseRingGroup.add(releaseRingGlowMesh);
  const releaseRingCoreGeometry = createReleaseRingGeometry(
    'VfxChargedShotReleaseRingCoreGeometry',
  );
  const releaseRingCoreMesh = new THREE.Mesh(
    releaseRingCoreGeometry,
    releaseAccent.material,
  );
  releaseRingCoreMesh.name = 'VfxChargedShotReleaseRingCore';
  releaseRingCoreMesh.renderOrder = 12;
  releaseRingGroup.add(releaseRingCoreMesh);
  releaseRingAnchor.add(releaseRingGroup);
  root.add(releaseRingAnchor);

  const pointLight = new THREE.PointLight(0x72b5ff, 0, 4, 2);
  pointLight.name = 'VfxChargedShotLocalLight';
  pointLight.castShadow = false;
  root.add(pointLight);

  const layers = Object.freeze({
    'core-streaks': streakGroup,
    'directional-core': coreMesh,
    'energy-shell': shellMesh,
    'circulating-energy': circulationGroup,
    'leading-compression': releaseRingGroup,
    'local-light': pointLight,
    'shell-filaments': filamentMesh,
  });

  let active = false;
  let charge = 1;
  let length = 1.8;
  let radius = 0.46;
  let releaseAge = 0;
  let releaseRingEnabled = true;
  let releasePoseCaptured = false;
  let releaseDepth = 0.28;
  let releaseIrregularity = 0.38;
  let releaseRipples = 3;
  const releaseWorldPosition = new THREE.Vector3();
  const releaseWorldQuaternion = new THREE.Quaternion();
  let spin = 0;
  let circulationAge = 0;
  let circulationArcBudget = MAX_CIRCULATION_ARCS;
  let circulationAuthoredEnabled = true;
  let circulationLayerEnabled = true;
  let circulationQualityEnabled = true;
  let circulationSeed = 0;
  let circulationSettings = resolveVfxEnergyMotionSettings();
  let circulationDescriptors = [];
  let silhouetteProfile = createVfxAxialProfile();

  const syncCirculationVisibility = () => {
    circulationGroup.visible = circulationAuthoredEnabled
      && circulationLayerEnabled
      && circulationQualityEnabled
      && circulationArcBudget > 0;
  };

  const rebuildCirculation = () => {
    circulationDescriptors = createCirculationDescriptors(
      circulationSeed,
      circulationSettings,
      circulationArcBudget,
    );
    circulationGroup.userData.configuredArcs = circulationDescriptors
      .filter((descriptor) => !descriptor.branch).length;
    circulationGroup.userData.configuredBranches = circulationDescriptors
      .filter((descriptor) => descriptor.branch).length;
    const visible = visibleCirculationDescriptors(
      circulationDescriptors,
      circulationAge,
      circulationSettings,
    );
    updateCirculationRibbonGeometry(
      circulationGlowGeometry,
      visible,
      circulationDescriptors,
      circulationAge,
      circulationSettings,
      silhouetteProfile,
      3.2,
    );
    updateCirculationRibbonGeometry(
      circulationCoreGeometry,
      visible,
      circulationDescriptors,
      circulationAge,
      circulationSettings,
      silhouetteProfile,
      1,
    );
    syncCirculationVisibility();
  };

  const applyShape = () => {
    const chargeScale = THREE.MathUtils.lerp(0.62, 1, charge);
    const chargeRadius = THREE.MathUtils.lerp(0.78, 1, charge);
    const resolvedLength = length * chargeScale;
    const resolvedRadius = radius * chargeRadius;
    coreMesh.scale.set(resolvedLength * 0.92, resolvedRadius * 1.12, resolvedRadius * 1.12);
    shellMesh.scale.set(resolvedLength * 1.06, resolvedRadius * 2.34, resolvedRadius * 2.34);
    filamentMesh.scale.set(resolvedLength * 1.075, resolvedRadius * 2.46, resolvedRadius * 2.46);
    circulationGroup.scale.set(resolvedLength * 0.92, resolvedRadius * 1.12, resolvedRadius * 1.12);
    streakGroup.scale.set(resolvedLength * 0.78, resolvedRadius, resolvedRadius);
    if (!releasePoseCaptured) releaseRingAnchor.position.x = resolvedLength * 0.48;
    releaseRingGroup.scale.setScalar(resolvedRadius * 2.3);
    pointLight.position.x = resolvedLength * 0.08;
    pointLight.distance = resolvedRadius * 9;
  };

  const api = {
    root,
    layers,
    get active() { return active; },
    get drawCalls() {
      if (!root.visible) return 0;
      let draws = 0;
      root.traverse((object) => {
        if (!object.isMesh || !object.visible) return;
        let ancestor = object.parent;
        while (ancestor && ancestor !== root) {
          if (!ancestor.visible) return;
          ancestor = ancestor.parent;
        }
        draws += 1;
      });
      return draws;
    },
    arm({
      charge: nextCharge = 1,
      deferRelease = false,
      seed = 0,
      settings = {},
    } = {}) {
      charge = THREE.MathUtils.clamp(Number(nextCharge) || 0, 0, 1);
      length = Math.max(Number(settings.length) || 1.8, 0.05);
      radius = Math.max(Number(settings.radius) || 0.46, 0.01);

      setLookColor(core.look.uCoreColor, settings.coreColor);
      setLookColor(core.look.uEdgeColor, settings.edgeColor);
      setLookColor(shell.look.uEdgeColor, settings.edgeColor);
      setLookColor(filaments.look.uAccentColor, settings.accentColor);
      setLookColor(accent.look.uAccentColor, settings.accentColor);
      setLookColor(releaseAccent.look.uAccentColor, settings.accentColor);
      setLookColor(releaseGlow.look.uAccentColor, settings.accentColor);
      setLookColor(circulationGlow.look.uAccentColor, settings.accentColor);
      setLookColor(circulationCore.look.uAccentColor, settings.accentColor);
      if (Array.isArray(settings.accentColor)) {
        pointLight.color.setRGB(...settings.accentColor, THREE.SRGBColorSpace);
      }

      core.look.uIntensity.value = Math.max(Number(settings.coreIntensity) || 0, 0)
        * THREE.MathUtils.lerp(0.48, 1, charge);
      shell.look.uIntensity.value = Math.max(Number(settings.shellIntensity) || 0, 0)
        * THREE.MathUtils.lerp(0.4, 1, charge);
      shell.look.uSpeed.value = Math.max(Number(settings.filamentSpeed) || 0, 0);
      filaments.look.uDensity.value = Math.max(Number(settings.filamentDensity) || 0.05, 0.05);
      filaments.look.uIntensity.value = Math.max(Number(settings.shellIntensity) || 0, 0)
        * THREE.MathUtils.lerp(0.35, 1, charge);
      filaments.look.uSpeed.value = Math.max(Number(settings.filamentSpeed) || 0, 0);
      accent.look.uIntensity.value = Math.max(Number(settings.shellIntensity) || 0, 0)
        * THREE.MathUtils.lerp(0.5, 1.15, charge);
      releaseAccent.look.uIntensity.value = Math.max(Number(settings.shellIntensity) || 0, 0)
        * THREE.MathUtils.lerp(0.44, 0.92, charge);
      releaseAccent.look.uOpacity.value = 1;
      releaseGlow.look.uIntensity.value = Math.max(Number(settings.shellIntensity) || 0, 0)
        * THREE.MathUtils.lerp(0.2, 0.46, charge);
      releaseGlow.look.uOpacity.value = 0.42;
      releaseDepth = THREE.MathUtils.clamp(Number(settings.releaseDepth) || 0.28, 0.05, 0.65);
      releaseIrregularity = THREE.MathUtils.clamp(
        Number(settings.releaseIrregularity) || 0.38,
        0,
        0.75,
      );
      releaseRipples = Math.round(THREE.MathUtils.clamp(
        Number(settings.releaseLobes) || 3,
        2,
        7,
      ));
      circulationSettings = resolveVfxEnergyMotionSettings(settings);
      circulationAuthoredEnabled = circulationSettings.circulationEnabled;
      circulationSeed = seed;
      circulationGlow.look.uIntensity.value = Math.max(
        Number(settings.shellIntensity) || 0,
        0,
      ) * 0.72;
      circulationGlow.look.uFlicker.value = circulationSettings.circulationFlicker;
      circulationCore.look.uIntensity.value = Math.max(
        Number(settings.shellIntensity) || 0,
        0,
      ) * 1.5;
      circulationCore.look.uFlicker.value = circulationSettings.circulationFlicker;
      core.look.uSeed.value = seed;
      shell.look.uSeed.value = seed;
      filaments.look.uSeed.value = seed;
      accent.look.uSeed.value = seed;
      releaseAccent.look.uSeed.value = seed;
      releaseGlow.look.uSeed.value = seed;
      circulationGlow.look.uSeed.value = seed;
      circulationCore.look.uSeed.value = seed;
      pointLight.intensity = Math.max(Number(settings.lightIntensity) || 0, 0)
        * THREE.MathUtils.lerp(0.25, 1, charge);
      root.userData.bloomContribution = Math.max(Number(settings.bloomContribution) || 0, 0);
      silhouetteProfile = settings.customProfileEnabled
        ? normalizeVfxSilhouetteProfile(settings.silhouetteProfile)
        : createVfxAxialProfile({
          backTaper: settings.backTaper,
          frontTaper: settings.frontTaper,
          widestPoint: settings.widestPoint,
        });
      applyAxialVolumeProfile(volumeGeometry, silhouetteProfile);
      updateReleaseRingGeometry(
        releaseRingGlowGeometry,
        seed,
        releaseDepth,
        releaseIrregularity,
        releaseRipples,
        3.4,
      );
      updateReleaseRingGeometry(
        releaseRingCoreGeometry,
        seed,
        releaseDepth,
        releaseIrregularity,
        releaseRipples,
        1,
      );
      root.userData.silhouetteMode = settings.customProfileEnabled ? 'drawn-mirrored' : 'guided';
      root.userData.energyMotion = {
        direction: circulationSettings.circulationDirection,
        seed,
        theme: circulationSettings.energyMotionTheme,
      };

      for (const layer of Object.values(layers)) layer.visible = true;
      for (const streak of streakGroup.children) streak.visible = true;
      releaseAge = 0;
      releaseRingEnabled = true;
      releasePoseCaptured = false;
      spin = 0;
      circulationAge = 0;
      circulationLayerEnabled = true;
      applyShape();
      rebuildCirculation();
      active = true;
      root.visible = true;
      root.scale.setScalar(deferRelease ? 0.24 : 1);
      releaseRingGroup.visible = !deferRelease;
      root.userData.phase = deferRelease ? 'charge' : 'release';
      return api;
    },
    beginRelease() {
      releaseAge = 0;
      releasePoseCaptured = false;
      releaseAccent.look.uOpacity.value = 1;
      releaseGlow.look.uOpacity.value = 0.42;
      releaseRingGroup.visible = releaseRingEnabled;
      root.scale.setScalar(1);
      root.userData.phase = 'release';
      applyShape();
      return api;
    },
    setChargeProgress(progress) {
      const value = THREE.MathUtils.clamp(Number(progress) || 0, 0, 1);
      root.scale.setScalar(THREE.MathUtils.lerp(0.24, 0.72, value));
      releaseRingGroup.visible = false;
      root.userData.phase = 'charge';
      return api;
    },
    setQuality({ budgets = {}, features = {} } = {}) {
      pointLight.visible = features.localLight !== false;
      filamentMesh.visible = features.shellFilaments !== false;
      circulationQualityEnabled = features.circulatingEnergy !== false;
      const circulationBudget = Number(budgets.circulationArcs);
      circulationArcBudget = Number.isFinite(circulationBudget)
        ? Math.max(0, Math.min(MAX_CIRCULATION_ARCS, Math.round(circulationBudget)))
        : MAX_CIRCULATION_ARCS;
      const streakBudget = Number(budgets.streaks);
      if (Number.isFinite(streakBudget)) {
        const count = Math.max(0, Math.min(streakGroup.children.length, Math.round(streakBudget)));
        streakGroup.visible = count > 0;
        streakGroup.children.forEach((streak, index) => {
          streak.visible = index < count;
        });
      }
      rebuildCirculation();
      return api;
    },
    setPose(position, velocity) {
      root.position.copy(position);
      directionScratch.copy(velocity);
      if (directionScratch.lengthSq() > 1e-8) {
        directionScratch.normalize();
        root.quaternion.setFromUnitVectors(LOCAL_VISUAL_FORWARD, directionScratch);
      }

      // The ring belongs to the release source, not the projectile. Capture
      // its world transform once, then counter-transform it under the moving
      // pooled root until the short release phase retires it.
      if (!releasePoseCaptured) {
        releaseWorldPosition.copy(releaseRingAnchor.position)
          .applyQuaternion(root.quaternion)
          .add(root.position);
        releaseWorldQuaternion.copy(root.quaternion);
        releasePoseCaptured = true;
      } else if (releaseRingEnabled && releaseAge < RELEASE_RING_DURATION) {
        inverseQuaternionScratch.copy(root.quaternion).invert();
        releaseRingAnchor.position.copy(
          localPositionScratch.copy(releaseWorldPosition).sub(root.position),
        ).applyQuaternion(inverseQuaternionScratch);
        releaseRingAnchor.quaternion.copy(inverseQuaternionScratch)
          .multiply(releaseWorldQuaternion);
      }
      return api;
    },
    setLayerEnabled(id, enabled) {
      const layer = layers[id];
      if (layer) layer.visible = Boolean(enabled);
      if (id === 'leading-compression') releaseRingEnabled = Boolean(enabled);
      if (id === 'circulating-energy') {
        circulationLayerEnabled = Boolean(enabled);
        syncCirculationVisibility();
      }
      return api;
    },
    setSourceTextures({ filaments: filamentTexture = null, shell: shellTexture = null } = {}) {
      filaments.sourceMap.value = filamentTexture ?? filaments.fallbackTexture;
      shell.sourceMap.value = shellTexture ?? shell.fallbackTexture;
      return api;
    },
    update(delta, turbulence = 0.7) {
      if (!active) return api;
      const dt = Math.max(Number(delta) || 0, 0);
      const charging = root.userData.phase === 'charge';
      if (!charging) releaseAge += dt;
      spin += dt * (0.7 + Math.max(Number(turbulence) || 0, 0) * 0.8);
      circulationAge += dt * (charging ? 0.45 : 1);
      shellMesh.rotation.x = spin * 0.65;
      filamentMesh.rotation.x = -spin;
      streakGroup.rotation.x = spin * 1.4;
      releaseRingGroup.rotation.x = spin * 0.12;
      const visibleCirculation = circulationGroup.visible
        ? visibleCirculationDescriptors(
          circulationDescriptors,
          circulationAge,
          circulationSettings,
        )
        : [];
      if (circulationGroup.visible) {
        updateCirculationRibbonGeometry(
          circulationGlowGeometry,
          visibleCirculation,
          circulationDescriptors,
          circulationAge,
          circulationSettings,
          silhouetteProfile,
          3.2,
        );
        updateCirculationRibbonGeometry(
          circulationCoreGeometry,
          visibleCirculation,
          circulationDescriptors,
          circulationAge,
          circulationSettings,
          silhouetteProfile,
          1,
        );
      } else {
        circulationGlowGeometry.setDrawRange(0, 0);
        circulationCoreGeometry.setDrawRange(0, 0);
      }
      circulationGroup.userData.visibleArcs = visibleCirculation
        .filter((descriptor) => !descriptor.branch).length;
      circulationGroup.userData.visibleBranches = visibleCirculation
        .filter((descriptor) => descriptor.branch).length;
      if (!charging) {
        const releaseProgress = THREE.MathUtils.clamp(
          releaseAge / RELEASE_RING_DURATION,
          0,
          1,
        );
        const releaseOpacity = 1 - THREE.MathUtils.smoothstep(releaseProgress, 0.12, 1);
        releaseAccent.look.uOpacity.value = releaseOpacity;
        releaseGlow.look.uOpacity.value = releaseOpacity * 0.42;
        releaseRingGroup.visible = releaseRingEnabled && releaseOpacity > 0.001;
        root.userData.phase = releaseProgress < 1 ? 'release' : 'travel';
      }
      // Re-derive the exact base shape before applying breathing so
      // multiplicative scale never accumulates.
      applyShape();
      if (!charging) {
        const releaseProgress = THREE.MathUtils.clamp(
          releaseAge / RELEASE_RING_DURATION,
          0,
          1,
        );
        const releaseExpansion = THREE.MathUtils.smoothstep(releaseProgress, 0, 1);
        releaseRingGroup.scale.x *= THREE.MathUtils.lerp(0.92, 1.08, releaseExpansion);
        releaseRingGroup.scale.y *= THREE.MathUtils.lerp(0.9, 1.16, releaseExpansion);
        releaseRingGroup.scale.z *= THREE.MathUtils.lerp(0.92, 1.12, releaseExpansion)
          * (1 + Math.sin(spin * 4.7 + releaseGlow.look.uSeed.value * 13) * 0.015);
      }
      const breathing = 1 + Math.sin(spin * 3.7 + core.look.uSeed.value * 17) * 0.035;
      shellMesh.scale.y *= breathing;
      shellMesh.scale.z *= breathing;
      return api;
    },
    reset() {
      active = false;
      root.visible = false;
      pointLight.intensity = 0;
      circulationCoreGeometry.setDrawRange(0, 0);
      circulationGlowGeometry.setDrawRange(0, 0);
      return api;
    },
    dispose() {
      api.reset();
      volumeGeometry.dispose();
      circulationCoreGeometry.dispose();
      circulationGlowGeometry.dispose();
      streakGeometry.dispose();
      releaseRingGlowGeometry.dispose();
      releaseRingCoreGeometry.dispose();
      core.material.dispose();
      shell.material.dispose();
      filaments.material.dispose();
      circulationCore.material.dispose();
      circulationGlow.material.dispose();
      shell.fallbackTexture.dispose();
      filaments.fallbackTexture.dispose();
      accent.material.dispose();
      releaseAccent.material.dispose();
      releaseGlow.material.dispose();
      root.parent?.remove(root);
    },
  };

  return api;
}
