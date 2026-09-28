// One source-of-truth for the coordinate, UV, and tangent-normal conventions
// used by the supplied ToonLab assets. The reference scene is emitted by
// ToonLabSceneExport.cs, while the ToonLabShowcase bridge consumes the supplied ToonLab
// glTF. Those two geometry paths intentionally require different Texture.flipY
// values even when they sample the same source PNG bytes.

import {
  clamp,
  dot,
  float,
  max,
  mix,
  sqrt,
  vec2,
  vec3,
} from 'three/tsl';

const freeze = (value) => Object.freeze(value);

export const TOONLAB_NORMAL_INTEGRATION_CONTRACT = freeze({
  decode: freeze({
    channels: 'RG',
    importerGreenTransform: 'multiply decoded Y by -1 when flipGreenChannel=true',
    z: 'sqrt(max(1e-16, 1 - saturate(dot(xy, xy))))',
  }),
  environmentReferenceScene: freeze({
    geometryCoordinates: '(toonlab.x, toonlab.y, -toonlab.z)',
    tangent: '(toonlab.x, toonlab.y, -toonlab.z, -toonlab.w)',
    textureFlipY: true,
    triangleWinding: 'swap source triangle indices 1 and 2',
    uv: 'ToonLab UV copied unchanged by ToonLabSceneExport.cs',
    zSign: -1,
  }),
  toonLabShowcaseToonLabGltf: freeze({
    geometryRelationToEnvironmentReference: '(-environmentReference.x, environmentReference.y, -environmentReference.z)',
    tangentWRelationToEnvironmentReference: 'same',
    textureFlipY: false,
    uvRelationToEnvironmentReference: '(environmentReference.u, 1 - environmentReference.v)',
  }),
  tangentOutput: 'decoded tangent normal -> exported/reflected TBN -> Three view space',
});

function finite(value, fallback) {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function normalized3(value, label) {
  if (!Array.isArray(value) && !ArrayBuffer.isView(value)) {
    throw new TypeError(`${label} must be a three-component array.`);
  }
  const x = finite(value[0], Number.NaN);
  const y = finite(value[1], Number.NaN);
  const z = finite(value[2], Number.NaN);
  const length = Math.hypot(x, y, z);
  if (!Number.isFinite(length) || length <= 1e-12) {
    throw new RangeError(`${label} must contain a finite non-zero vector.`);
  }
  return [x / length, y / length, z / length];
}

/** ToonLab UnpackNormalMapRGorAG over the raw source texture sample. */
export function decodeToonLabNormalNode(sampleNode, greenSign = 1) {
  const signNode = greenSign?.isNode
    ? greenSign
    : float(finite(greenSign, 1) < 0 ? -1 : 1);
  const xy = vec2(
    sampleNode.r.mul(2).sub(1),
    sampleNode.g.mul(2).sub(1).mul(signNode),
  );
  const reconstructedZ = sqrt(max(
    float(1e-16),
    float(1).sub(clamp(dot(xy, xy), 0, 1)),
  ));
  return vec3(xy, reconstructedZ);
}

/** ToonLab graph Normal Strength node, including its sub-one Z interpolation. */
export function applyToonLabNormalStrengthNode(input, strength) {
  const strengthNode = strength?.isNode ? strength : float(finite(strength, 1));
  return vec3(
    input.xy.mul(strengthNode),
    mix(float(1), input.z, clamp(strengthNode, 0, 1)),
  );
}

/** TOONLAB UnpackNormalScale: scale decoded XY while retaining reconstructed Z. */
export function applyToonLabNormalScaleNode(input, strength) {
  const strengthNode = strength?.isNode ? strength : float(finite(strength, 1));
  return vec3(input.xy.mul(strengthNode), input.z);
}

/** CPU mirror used by deterministic source-integration gates. */
export function decodeToonLabNormalSample(sample, {
  flipGreenChannel = false,
  strength = 1,
  strengthMode = 'none',
} = {}) {
  const x = finite(sample?.[0], Number.NaN) * 2 - 1;
  const rawY = finite(sample?.[1], Number.NaN) * 2 - 1;
  if (!Number.isFinite(x) || !Number.isFinite(rawY)) {
    throw new TypeError('ToonLab normal sample must contain finite normalized R/G channels.');
  }
  const y = rawY * (flipGreenChannel ? -1 : 1);
  const z = Math.sqrt(Math.max(1e-16, 1 - Math.min(1, x * x + y * y)));
  const resolvedStrength = finite(strength, 1);
  if (strengthMode === 'none') return [x, y, z];
  if (strengthMode === 'unpack-scale') {
    return [x * resolvedStrength, y * resolvedStrength, z];
  }
  if (strengthMode === 'toonlab-graph') {
    const saturatedStrength = Math.min(1, Math.max(0, resolvedStrength));
    return [
      x * resolvedStrength,
      y * resolvedStrength,
      1 + (z - 1) * saturatedStrength,
    ];
  }
  throw new RangeError(`Unknown ToonLab normal strength mode: ${strengthMode}`);
}

/** Map a tangent-space normal through an exported glTF tangent basis. */
export function toonLabTangentNormalToWorld({
  normal,
  tangent,
  tangentNormal,
} = {}) {
  const n = normalized3(normal, 'normal');
  const t = normalized3(tangent, 'tangent');
  const handedness = finite(tangent?.[3], 1) < 0 ? -1 : 1;
  const b = normalized3([
    n[1] * t[2] - n[2] * t[1],
    n[2] * t[0] - n[0] * t[2],
    n[0] * t[1] - n[1] * t[0],
  ], 'bitangent').map((channel) => channel * handedness);
  const source = normalized3(tangentNormal, 'tangentNormal');
  return normalized3([
    t[0] * source[0] + b[0] * source[1] + n[0] * source[2],
    t[1] * source[0] + b[1] * source[1] + n[1] * source[2],
    t[2] * source[0] + b[2] * source[1] + n[2] * source[2],
  ], 'worldNormal');
}

export function reflectToonLabVector(vector, zSign = -1) {
  if ((!Array.isArray(vector) && !ArrayBuffer.isView(vector)) || vector.length < 3) {
    throw new TypeError('ToonLab vector reflection requires a three-component array.');
  }
  return [
    finite(vector[0], Number.NaN),
    finite(vector[1], Number.NaN),
    finite(vector[2], Number.NaN) * (finite(zSign, -1) < 0 ? -1 : 1),
  ];
}

export function createToonLabNormalIntegrationMetadata({
  coordinateZSign = -1,
  decode = 'geometry-only',
  family,
  flipGreenChannel = null,
  textureFlipY,
} = {}) {
  return {
    coordinateZSign: finite(coordinateZSign, -1) < 0 ? -1 : 1,
    decode,
    family: family ?? null,
    flipGreenChannel,
    outputSpace: 'view',
    tangentBasis: 'exported/reflected glTF NORMAL + TANGENT.w',
    textureFlipY: textureFlipY == null ? null : Boolean(textureFlipY),
  };
}
