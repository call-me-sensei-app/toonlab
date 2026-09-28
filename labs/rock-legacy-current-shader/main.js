import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { float } from 'three/tsl';

import {
  applyRockShader,
  setRockShaderSceneState,
} from '../../src/rock-shader/rockShaderRuntime.js';
import {
  tangentNormalToView,
  toonLabTriplanarColor,
  toonLabTriplanarNormal,
} from '../../src/rock-shader/rockMaterial.js';
import { createPostProcessingPipeline } from '../../src/post/index.js';
import {
  createSkySystem,
  matchSkyStyleSnapshot,
} from '../../src/sky/index.js';
import {
  CALL_ME_SENSEI_STYLE_BUNDLE,
  createSceneStyleRuntime,
  createStyleTarget,
} from '../../src/styles/index.js';
import { createLabRenderer, whenRendererReady } from '../shared/rendererFactory.js';

const ASSETS = Object.freeze([
  { id: 'rock-0001', name: 'Weathered Fragment 4', family: 'weathered-limestone' },
  { id: 'rock-0287', name: 'Broad Cliff Wall 2', family: 'weathered-limestone' },
  { id: 'rock-0002', name: 'Rounded Boulder 4', family: 'blocky-granite' },
  { id: 'rock-0200', name: 'Fractured Block 9', family: 'blocky-granite' },
  { id: 'rock-0005', name: 'Layered Slab 9', family: 'layered-sandstone' },
  { id: 'rock-0358', name: 'Hoodoo 2', family: 'layered-sandstone' },
  { id: 'rock-0018', name: 'Rounded Boulder 14', family: 'alpine-granite' },
  { id: 'rock-0298', name: 'Cliff Termination 1', family: 'alpine-granite' },
  { id: 'rock-0362', name: 'Column Field 6', family: 'columnar-basalt' },
  { id: 'rock-0450', name: 'Column Kit 2', family: 'columnar-basalt' },
  { id: 'rock-0360', name: 'Spire 4', family: 'sharp-karst' },
  { id: 'rock-0364', name: 'Natural Arch 7', family: 'sharp-karst' },
]);

const params = new URLSearchParams(location.search);
const asset = ASSETS.find((entry) => entry.id === params.get('asset')) ?? ASSETS[0];
const mode = ['source', 'pbr-c7', 'styled', 'styled-c7'].includes(params.get('mode'))
  ? params.get('mode')
  : 'styled-c7';
const variation = ASSETS.findIndex((entry) => entry.id === asset.id);
const requestedTimeOfDay = Number(params.get('time') ?? 13);
const timeOfDay = Number.isFinite(requestedTimeOfDay)
  ? THREE.MathUtils.euclideanModulo(requestedTimeOfDay, 24)
  : 13;
const requestedExposure = params.has('rockExposure')
  ? Number(params.get('rockExposure'))
  : Number.NaN;
const requestedSkyFillStrength = params.has('rockSkyFill')
  ? Number(params.get('rockSkyFill'))
  : Number.NaN;
const requestedAmbientFloor = params.has('rockAmbient')
  ? Number(params.get('rockAmbient'))
  : Number.NaN;
const requestedSkyFillTint = params.get('rockSkyTint')
  ?.split(',')
  .map(Number);
const lightingOverrides = {
  ...(Number.isFinite(requestedExposure) ? { exposure: requestedExposure } : {}),
  ...(Number.isFinite(requestedAmbientFloor) ? { ambientFloor: requestedAmbientFloor } : {}),
  ...(Number.isFinite(requestedSkyFillStrength)
    ? { skyFillStrength: requestedSkyFillStrength }
    : {}),
  ...(requestedSkyFillTint?.length === 3 && requestedSkyFillTint.every(Number.isFinite)
    ? { skyFillTint: requestedSkyFillTint }
    : {}),
};
const sourceUrl = `/artifacts/research/rock-geology-v2/legacy-480-c7-pilot-v0.1/${asset.id}/original/rock.glb`;

const C7_PROFILES = Object.freeze({
  'weathered-limestone': { low: [0.24, 0.23, 0.18], high: [0.72, 0.67, 0.54], scale: 2.8, microScale: 0.075, fabric: 1, roughness: [0.68, 0.94], normal: 1.5 },
  'blocky-granite': { low: [0.18, 0.20, 0.23], high: [0.63, 0.59, 0.53], scale: 2.5, microScale: 0.095, fabric: 2, roughness: [0.58, 0.88], normal: 1.2 },
  'layered-sandstone': {
    low: [0.26, 0.035, 0.018],
    high: [0.86, 0.24, 0.09],
    strataDark: [0.10, 0.008, 0.006],
    strataLight: [0.90, 0.46, 0.22],
    scale: 3.2,
    microScale: 0.08,
    fabric: 3,
    roughness: [0.68, 0.96],
    normal: 0.95,
  },
  'alpine-granite': { low: [0.17, 0.20, 0.24], high: [0.67, 0.65, 0.59], scale: 2.7, microScale: 0.10, fabric: 4, roughness: [0.56, 0.88], normal: 1.25 },
  'columnar-basalt': { low: [0.025, 0.03, 0.034], high: [0.24, 0.27, 0.26], scale: 3.0, microScale: 0.09, fabric: 5, roughness: [0.60, 0.90], normal: 1.3 },
  'sharp-karst': { low: [0.21, 0.24, 0.20], high: [0.68, 0.71, 0.61], scale: 2.4, microScale: 0.075, fabric: 6, roughness: [0.70, 0.96], normal: 1.55 },
});

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(minimum, maximum, value) {
  const t = clamp01((value - minimum) / Math.max(1e-6, maximum - minimum));
  return t * t * (3 - (2 * t));
}

function latticeHash(x, y, period, seed) {
  const wrappedX = ((x % period) + period) % period;
  const wrappedY = ((y % period) + period) % period;
  const value = Math.sin((wrappedX * 127.1) + (wrappedY * 311.7) + (seed * 74.7)) * 43758.5453;
  return value - Math.floor(value);
}

function tileNoise(u, v, frequency, seed) {
  const x = u * frequency;
  const y = v * frequency;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx0 = x - x0;
  const fy0 = y - y0;
  const fx = fx0 * fx0 * (3 - (2 * fx0));
  const fy = fy0 * fy0 * (3 - (2 * fy0));
  const a = latticeHash(x0, y0, frequency, seed);
  const b = latticeHash(x0 + 1, y0, frequency, seed);
  const c = latticeHash(x0, y0 + 1, frequency, seed);
  const d = latticeHash(x0 + 1, y0 + 1, frequency, seed);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(a, b, fx), THREE.MathUtils.lerp(c, d, fx), fy);
}

function tileFbm(u, v, baseFrequency, seed, octaves = 4) {
  let amplitude = 0.56;
  let total = 0;
  let weight = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    const frequency = baseFrequency * (2 ** octave);
    total += tileNoise(u, v, frequency, seed + (octave * 19)) * amplitude;
    weight += amplitude;
    amplitude *= 0.48;
  }
  return total / weight;
}

function c7Field(u, v, profile, seed) {
  const macro = tileFbm(u, v, 3, seed + 3, 4);
  const micro = tileFbm(u, v, 17, seed + 11, 3);
  const fine = tileNoise(u, v, 61, seed + 29);
  let height = (macro * 0.70) + (micro * 0.24) + (fine * 0.06);
  if (profile.fabric === 1 || profile.fabric === 6) {
    const pitMask = 1 - smoothstep(0.10, 0.30, micro);
    const pitBreakup = smoothstep(0.34, 0.68, tileFbm(u, v, 7, seed + 53, 2));
    height -= pitMask * pitBreakup * (profile.fabric === 6 ? 0.10 : 0.075);
  } else if (profile.fabric === 2 || profile.fabric === 4) {
    const mineralPatch = smoothstep(0.48, 0.70, tileFbm(u, v, 5, seed + 67, 2));
    height += smoothstep(0.88, 0.975, fine) * mineralPatch * 0.014;
  } else if (profile.fabric === 3) {
    const beddingAmplitude = THREE.MathUtils.lerp(0.009, 0.024, macro);
    height += Math.sin((v * 8.5 + u * 0.62) * Math.PI * 2) * beddingAmplitude;
  } else if (profile.fabric === 5) {
    height -= (1 - smoothstep(0.08, 0.26, micro)) * 0.085;
  }
  let value = clamp01(0.5 + ((macro - 0.5) * 0.44) + ((micro - 0.5) * 0.34) + ((fine - 0.5) * 0.18));
  if (profile.fabric === 3) value = clamp01(value + Math.sin((v * 9 + u * 0.5) * Math.PI * 2) * 0.08);
  return { fine, height, macro, micro, value };
}

function pointToSegmentDistance(px, py, segment) {
  const dx = segment.bx - segment.ax;
  const dy = segment.by - segment.ay;
  const lengthSquared = (dx * dx) + (dy * dy);
  const t = clamp01((((px - segment.ax) * dx) + ((py - segment.ay) * dy)) / Math.max(1e-6, lengthSquared));
  return Math.hypot(px - (segment.ax + (dx * t)), py - (segment.ay + (dy * t)));
}

function createFractureSegments(profile, seed) {
  const segments = [];
  const primaryCount = profile.fabric === 3 ? 4 : 3;
  for (let index = 0; index < primaryCount; index += 1) {
    const cx = 0.14 + (latticeHash(index, 17, 97, seed + 151) * 0.72);
    const cy = 0.14 + (latticeHash(index, 31, 101, seed + 163) * 0.72);
    const randomAngle = latticeHash(index, 47, 103, seed + 179);
    let angle;
    if (profile.fabric === 3) {
      angle = (randomAngle - 0.5) * 0.34;
    } else if (profile.fabric === 5) {
      angle = (Math.PI * 0.5) + ((randomAngle - 0.5) * 0.48);
    } else if (profile.fabric === 2 || profile.fabric === 4) {
      angle = index % 2 === 0
        ? (Math.PI * 0.5) + ((randomAngle - 0.5) * 0.72)
        : 0.55 + (randomAngle * 0.58);
    } else {
      angle = randomAngle * Math.PI;
    }
    const length = profile.fabric === 2 || profile.fabric === 4
      ? 0.10 + (latticeHash(index, 59, 107, seed + 191) * 0.19)
      : 0.20 + (latticeHash(index, 59, 107, seed + 191) * 0.30);
    const half = length * 0.5;
    const width = profile.fabric === 2 || profile.fabric === 4
      ? 0.0011 + (latticeHash(index, 71, 109, seed + 211) * 0.0018)
      : 0.0018 + (latticeHash(index, 71, 109, seed + 211) * 0.0028);
    const start = {
      x: cx - (Math.cos(angle) * half),
      y: cy - (Math.sin(angle) * half),
    };
    const end = {
      x: cx + (Math.cos(angle) * half),
      y: cy + (Math.sin(angle) * half),
    };
    const perpendicularX = -Math.sin(angle);
    const perpendicularY = Math.cos(angle);
    const points = [start];
    for (let step = 1; step < 4; step += 1) {
      const t = step / 4;
      const jitter = (latticeHash(index * 7 + step, 79, 131, seed + 217) - 0.5)
        * (profile.fabric === 3 ? 0.022 : 0.055);
      points.push({
        x: THREE.MathUtils.lerp(start.x, end.x, t) + (perpendicularX * jitter),
        y: THREE.MathUtils.lerp(start.y, end.y, t) + (perpendicularY * jitter),
      });
    }
    points.push(end);
    for (let step = 0; step < points.length - 1; step += 1) {
      segments.push({
        ax: points[step].x,
        ay: points[step].y,
        bx: points[step + 1].x,
        by: points[step + 1].y,
        width: width * THREE.MathUtils.lerp(1, 0.72, step / (points.length - 2)),
      });
    }
    if (index < 2 && profile.fabric !== 3) {
      const branchStart = 0.40 + (latticeHash(index, 83, 113, seed + 223) * 0.28);
      const branchX = THREE.MathUtils.lerp(start.x, end.x, branchStart);
      const branchY = THREE.MathUtils.lerp(start.y, end.y, branchStart);
      const branchAngle = angle + (index % 2 === 0 ? 0.78 : -0.92);
      const branchLength = 0.10 + (latticeHash(index, 97, 127, seed + 227) * 0.13);
      segments.push({
        ax: branchX,
        ay: branchY,
        bx: branchX + (Math.cos(branchAngle) * branchLength),
        by: branchY + (Math.sin(branchAngle) * branchLength),
        width: width * 0.58,
      });
    }
  }
  return segments;
}

function fractureField(u, v, segments, seed) {
  let fracture = 0;
  for (const segment of segments) {
    const distance = pointToSegmentDistance(u, v, segment);
    fracture = Math.max(fracture, 1 - smoothstep(segment.width, segment.width * 2.8, distance));
  }
  const continuity = THREE.MathUtils.lerp(
    0.22,
    1,
    smoothstep(0.28, 0.70, tileFbm(u, v, 11, seed + 241, 2)),
  );
  return fracture * continuity;
}

function createC7GeologyMaps(profile, seed, size = 512) {
  const fields = new Array(size * size);
  const colorBytes = new Uint8Array(size * size * 4);
  const normalBytes = new Uint8Array(size * size * 4);
  const heightBytes = new Uint8Array(size * size * 4);
  const aoBytes = new Uint8Array(size * size * 4);
  const roughnessBytes = new Uint8Array(size * size * 4);
  const smoothnessBytes = new Uint8Array(size * size * 4);
  const ormHeightBytes = new Uint8Array(size * size * 4);
  const fractureSegments = createFractureSegments(profile, seed);
  let minimumHeight = Infinity;
  let maximumHeight = -Infinity;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const field = c7Field(x / size, y / size, profile, seed);
      field.fracture = fractureField(x / size, y / size, fractureSegments, seed);
      const fractureDepth = profile.fabric === 3
        ? 0.018
        : profile.fabric === 2 || profile.fabric === 4
          ? 0.024
          : 0.034;
      field.height -= field.fracture * fractureDepth;
      fields[(y * size) + x] = field;
      minimumHeight = Math.min(minimumHeight, field.height);
      maximumHeight = Math.max(maximumHeight, field.height);
    }
  }
  const sampleHeight = (x, y) => fields[
    ((((y % size) + size) % size) * size) + (((x % size) + size) % size)
  ].height;
  let hash = 2166136261 >>> 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const pixel = (y * size) + x;
      const index = pixel * 4;
      const field = fields[pixel];
      let color = profile.low.map((channel, channelIndex) => THREE.MathUtils.lerp(channel, profile.high[channelIndex], smoothstep(0.06, 0.94, field.value)));
      if (profile.fabric === 2 || profile.fabric === 4) {
        const u = x / size;
        const v = y / size;
        const darkPatch = smoothstep(0.50, 0.72, tileFbm(u, v, 5, seed + 67, 2));
        const quartzPatch = smoothstep(0.46, 0.68, tileFbm(u, v, 4, seed + 73, 2));
        const darkGrain = smoothstep(0.91, 0.985, field.fine) * darkPatch;
        const quartz = smoothstep(0.92, 0.985, tileNoise(u, v, 83, seed + 47)) * quartzPatch;
        color = color.map((channel) => THREE.MathUtils.lerp(channel, 0.055, darkGrain * 0.46));
        color = color.map((channel) => THREE.MathUtils.lerp(channel, 0.72, quartz * 0.34));
      }
      if (profile.fabric === 3) {
        const u = x / size;
        const v = y / size;
        const warpedBed = (v * 6.4)
          + (u * 0.26)
          + ((field.macro - 0.5) * 1.35)
          + (Math.sin(u * Math.PI * 4) * 0.12);
        const bed = 0.5 + (0.5 * Math.sin(warpedBed * Math.PI * 2));
        const seamVariation = THREE.MathUtils.lerp(
          0.12,
          1,
          tileNoise(u, v, 5, seed + 91),
        );
        const fineBed = 0.5 + (0.5 * Math.sin((
          (v * 16)
          + (u * 0.42)
          + ((field.micro - 0.5) * 0.72)
        ) * Math.PI * 2));
        const broadCream = smoothstep(0.90, 0.992, bed) * seamVariation;
        const fineCream = smoothstep(0.955, 0.998, fineBed) * 0.34;
        const creamSeam = Math.max(broadCream, fineCream);
        const burgundySeam = 1 - smoothstep(0.025, 0.18, bed);
        color = color.map((channel, channelIndex) => THREE.MathUtils.lerp(
          channel,
          profile.strataLight[channelIndex],
          creamSeam * 0.72,
        ));
        color = color.map((channel, channelIndex) => THREE.MathUtils.lerp(
          channel,
          profile.strataDark[channelIndex],
          burgundySeam * 0.58,
        ));
      }
      const topLeft = sampleHeight(x - 1, y + 1);
      const top = sampleHeight(x, y + 1);
      const topRight = sampleHeight(x + 1, y + 1);
      const left = sampleHeight(x - 1, y);
      const right = sampleHeight(x + 1, y);
      const bottomLeft = sampleHeight(x - 1, y - 1);
      const bottom = sampleHeight(x, y - 1);
      const bottomRight = sampleHeight(x + 1, y - 1);
      const gradientX = (topLeft + (2 * left) + bottomLeft) - (topRight + (2 * right) + bottomRight);
      const gradientY = (bottomLeft + (2 * bottom) + bottomRight) - (topLeft + (2 * top) + topRight);
      const normal = new THREE.Vector3(
        gradientX * profile.normal * 0.55,
        gradientY * profile.normal * 0.55,
        1,
      ).normalize();
      const neighbourAverage = (left + right + top + bottom) * 0.25;
      const concavity = clamp01(((neighbourAverage - field.height) * 18) + ((0.5 - field.micro) * 0.18));
      const ao = clamp01(1 - (concavity * 0.68) - ((1 - field.macro) * 0.08) - (field.fracture * 0.16));
      const roughness = clamp01(
        THREE.MathUtils.lerp(profile.roughness[0], profile.roughness[1], field.micro)
        + (concavity * 0.06)
        + (field.fracture * 0.025),
      );
      const smoothness = 1 - roughness;
      const height = clamp01((field.height - minimumHeight) / Math.max(1e-6, maximumHeight - minimumHeight));
      const encodedColor = new THREE.Color(
        clamp01(color[0]),
        clamp01(color[1]),
        clamp01(color[2]),
      ).convertLinearToSRGB();
      colorBytes[index] = Math.round(clamp01(encodedColor.r) * 255);
      colorBytes[index + 1] = Math.round(clamp01(encodedColor.g) * 255);
      colorBytes[index + 2] = Math.round(clamp01(encodedColor.b) * 255);
      colorBytes[index + 3] = 255;
      normalBytes[index] = Math.round((normal.x * 0.5 + 0.5) * 255);
      normalBytes[index + 1] = Math.round((normal.y * 0.5 + 0.5) * 255);
      normalBytes[index + 2] = Math.round((normal.z * 0.5 + 0.5) * 255);
      normalBytes[index + 3] = 255;
      const heightByte = Math.round(height * 255);
      const aoByte = Math.round(ao * 255);
      const roughnessByte = Math.round(roughness * 255);
      const smoothnessByte = Math.round(clamp01(smoothness) * 255);
      heightBytes[index] = heightByte;
      heightBytes[index + 1] = heightByte;
      heightBytes[index + 2] = heightByte;
      heightBytes[index + 3] = 255;
      aoBytes[index] = aoByte;
      aoBytes[index + 1] = aoByte;
      aoBytes[index + 2] = aoByte;
      aoBytes[index + 3] = 255;
      roughnessBytes[index] = roughnessByte;
      roughnessBytes[index + 1] = roughnessByte;
      roughnessBytes[index + 2] = roughnessByte;
      roughnessBytes[index + 3] = 255;
      smoothnessBytes[index] = smoothnessByte;
      smoothnessBytes[index + 1] = smoothnessByte;
      smoothnessBytes[index + 2] = smoothnessByte;
      smoothnessBytes[index + 3] = 255;
      ormHeightBytes[index] = aoByte;
      ormHeightBytes[index + 1] = roughnessByte;
      ormHeightBytes[index + 2] = 0;
      ormHeightBytes[index + 3] = heightByte;
      hash = fnv(colorBytes[index], hash);
      hash = fnv(colorBytes[index + 1], hash);
      hash = fnv(colorBytes[index + 2], hash);
      hash = fnv(normalBytes[index], hash);
      hash = fnv(normalBytes[index + 1], hash);
      hash = fnv(heightByte, hash);
      hash = fnv(aoByte, hash);
      hash = fnv(roughnessByte, hash);
      hash = fnv(smoothnessByte, hash);
    }
  }
  const makeTexture = (bytes, colorSpace, name) => {
    const texture = new THREE.DataTexture(bytes, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
    texture.colorSpace = colorSpace;
    texture.flipY = false;
    texture.generateMipmaps = true;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.name = name;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.needsUpdate = true;
    return texture;
  };
  return {
    audit: {
      hash: hash.toString(16).padStart(8, '0'),
      heightRange: [minimumHeight, maximumHeight],
      profile: asset.family,
      roles: ['baseColor', 'normalGL', 'height', 'ao', 'roughness', 'smoothness', 'ormHeight'],
      fractureSegments: fractureSegments.length,
      seed,
      size,
    },
    height: makeTexture(heightBytes, THREE.NoColorSpace, `C7_${asset.family}_Height`),
    ormHeight: makeTexture(ormHeightBytes, THREE.NoColorSpace, `C7_${asset.family}_ORMHeight`),
    rock: makeTexture(colorBytes, THREE.SRGBColorSpace, `C7_${asset.family}_BaseColor`),
    rockAo: makeTexture(aoBytes, THREE.NoColorSpace, `C7_${asset.family}_AO`),
    rockNormal: makeTexture(normalBytes, THREE.NoColorSpace, `C7_${asset.family}_NormalGL`),
    roughness: makeTexture(roughnessBytes, THREE.NoColorSpace, `C7_${asset.family}_Roughness`),
    smoothness: makeTexture(smoothnessBytes, THREE.NoColorSpace, `C7_${asset.family}_Smoothness`),
  };
}

function fnv(value, hash) {
  return Math.imul((hash ^ value) >>> 0, 16777619) >>> 0;
}

function geometrySignature(root) {
  let hash = 2166136261 >>> 0;
  let indices = 0;
  let meshes = 0;
  let vertices = 0;
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    if (!object.isMesh || !object.visible || !object.geometry?.attributes?.position) return;
    meshes += 1;
    const position = object.geometry.attributes.position;
    vertices += position.count;
    const positionBytes = new Uint8Array(
      position.array.buffer,
      position.array.byteOffset,
      position.array.byteLength,
    );
    for (const value of positionBytes) hash = fnv(value, hash);
    const index = object.geometry.index;
    if (index) {
      indices += index.count;
      const indexBytes = new Uint8Array(index.array.buffer, index.array.byteOffset, index.array.byteLength);
      for (const value of indexBytes) hash = fnv(value, hash);
    }
    for (const value of object.matrixWorld.elements) {
      const bytes = new Uint8Array(new Float32Array([value]).buffer);
      for (const byte of bytes) hash = fnv(byte, hash);
    }
  });
  return { hash: hash.toString(16).padStart(8, '0'), indices, meshes, vertices };
}

const stage = document.getElementById('stage');
const renderer = createLabRenderer({ alpha: false, antialias: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.03;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.append(renderer.domElement);

const scene = new THREE.Scene();
scene.background = null;

await whenRendererReady(renderer);
const ktx2 = new KTX2Loader().setTranscoderPath('/basis/').setWorkerLimit(2).detectSupport(renderer);
const gltf = await new GLTFLoader().setKTX2Loader(ktx2).loadAsync(sourceUrl);
const root = gltf.scene;
const meshes = [];
root.traverse((object) => {
  if (!object.isMesh) return;
  object.castShadow = true;
  object.receiveShadow = true;
  meshes.push(object);
});
if (meshes.length === 0) throw new Error(`${asset.id} has no renderable mesh`);

const initialBounds = new THREE.Box3().setFromObject(root);
const sourceDimensions = initialBounds.getSize(new THREE.Vector3());
root.position.sub(initialBounds.getCenter(new THREE.Vector3()));
root.updateMatrixWorld(true);
const geometryBefore = geometrySignature(root);
let meshStageReport = null;
if (mode === 'source') {
  let applied = 0;
  root.traverse((object) => {
    if (!object.isMesh) return;
    const sourceMaterials = Array.isArray(object.material) ? object.material : [object.material];
    const materials = sourceMaterials.map((sourceMaterial, materialIndex) => new THREE.MeshStandardMaterial({
      color: 0xb9b6ad,
      metalness: 0,
      name: `Latest-480 neutral clay · ${asset.id} · ${materialIndex}`,
      roughness: 0.92,
      side: sourceMaterial?.side ?? THREE.FrontSide,
    }));
    object.material = Array.isArray(object.material) ? materials : materials[0];
    applied += 1;
  });
  meshStageReport = {
    applied,
    material: 'THREE.MeshStandardMaterial',
    textureCount: 0,
  };
}
const c7Profile = C7_PROFILES[asset.family];
const macroProjectionScale = Math.max(
  c7Profile.scale,
  Math.max(sourceDimensions.x, sourceDimensions.y, sourceDimensions.z) * 0.92,
);
const c7Maps = mode === 'styled-c7' || mode === 'pbr-c7'
  ? createC7GeologyMaps(c7Profile, variation + 101)
  : null;
function dataTexturePng(texture) {
  const canvas = document.createElement('canvas');
  canvas.width = texture.image.width;
  canvas.height = texture.image.height;
  const context = canvas.getContext('2d');
  const pixels = new Uint8ClampedArray(
    texture.image.data.buffer,
    texture.image.data.byteOffset,
    texture.image.data.byteLength,
  );
  context.putImageData(new ImageData(pixels, texture.image.width, texture.image.height), 0, 0);
  return canvas.toDataURL('image/png');
}
window.exportC7GeologyMaps = () => c7Maps ? {
  ao: dataTexturePng(c7Maps.rockAo),
  baseColor: dataTexturePng(c7Maps.rock),
  height: dataTexturePng(c7Maps.height),
  normalGL: dataTexturePng(c7Maps.rockNormal),
  ormHeight: dataTexturePng(c7Maps.ormHeight),
  roughness: dataTexturePng(c7Maps.roughness),
  smoothness: dataTexturePng(c7Maps.smoothness),
} : null;
let c7PbrReport = null;
if (mode === 'pbr-c7') {
  let applied = 0;
  root.traverse((object) => {
    if (!object.isMesh) return;
    const sourceMaterials = Array.isArray(object.material) ? object.material : [object.material];
    const materials = sourceMaterials.map((sourceMaterial, materialIndex) => {
      const material = new MeshStandardNodeMaterial();
      material.name = `C7 neutral triplanar PBR · ${asset.id} · ${materialIndex}`;
      material.colorNode = toonLabTriplanarColor(c7Maps.rock, macroProjectionScale, 1, { zSign: 1 });
      material.normalNode = tangentNormalToView(toonLabTriplanarNormal(
        c7Maps.rockNormal,
        macroProjectionScale,
        1,
        1,
        { zSign: 1 },
      ));
      material.aoNode = toonLabTriplanarColor(c7Maps.rockAo, macroProjectionScale, 1, { zSign: 1 }).r;
      material.roughnessNode = toonLabTriplanarColor(c7Maps.roughness, macroProjectionScale, 1, { zSign: 1 }).r;
      material.metalnessNode = float(0);
      material.side = sourceMaterial?.side ?? THREE.FrontSide;
      return material;
    });
    object.material = Array.isArray(object.material) ? materials : materials[0];
    applied += 1;
  });
  c7PbrReport = {
    applied,
    material: 'THREE.MeshStandardNodeMaterial',
    maps: ['baseColor', 'normalGL', 'ao', 'roughness'],
    metalness: 0,
    projection: 'metre-scale triplanar',
    sourceTextureCount: 0,
  };
}
const styleReport = mode === 'styled' || mode === 'styled-c7'
  ? applyRockShader(root, {
    preset: 'call_me_sensei',
    ...(Object.keys(lightingOverrides).length > 0 ? { lighting: lightingOverrides } : {}),
    ...(c7Maps ? {
      assetIntegration: {
        sourceAlbedoMode: 'replace',
        sourceAlbedoStrength: 0,
        sourceNormalStrength: 0,
        sourceAoStrength: 0,
        vertexColorStrength: 0,
        vertexAoStrength: 0,
      },
      material: { useSmoothnessTexture: true },
      projection: {
        scale: macroProjectionScale,
        nearDetailScale: c7Profile.microScale,
        nearDetailStrength: 0.02,
      },
    } : {}),
  }, {
    castShadow: true,
    detail: null,
    name: `ToonLab current rock shader · ${asset.id}`,
    receiveShadow: true,
    textures: c7Maps ? {
      rock: c7Maps.rock,
      rockAo: c7Maps.rockAo,
      rockNormal: c7Maps.rockNormal,
      smoothness: c7Maps.smoothness,
    } : {},
    variation,
  })
  : null;
root.updateMatrixWorld(true);
const geometryAfter = geometrySignature(root);
const geometryIdentityPassed = JSON.stringify(geometryBefore) === JSON.stringify(geometryAfter);
const textureCompositions = [];
root.traverse((object) => {
  if (!object.isMesh) return;
  const materials = Array.isArray(object.material) ? object.material : [object.material];
  for (const material of materials) {
    const composition = material?.userData?.toonLabRockTextureComposition;
    if (composition) textureCompositions.push(composition);
  }
});
scene.add(root);

const bounds = new THREE.Box3().setFromObject(root);
const center = bounds.getCenter(new THREE.Vector3());
const size = bounds.getSize(new THREE.Vector3());
const radius = Math.max(size.length() * 0.5, 0.01);
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(radius * 10, radius * 10),
  new THREE.MeshStandardMaterial({ color: '#42443d', roughness: 1, metalness: 0 }),
);
ground.rotation.x = -Math.PI / 2;
ground.position.set(center.x, bounds.min.y - radius * 0.015, center.z);
ground.receiveShadow = true;
scene.add(ground);

const aspect = Math.max(1, stage.clientWidth || innerWidth) / Math.max(1, stage.clientHeight || innerHeight);
const extent = radius * 1.08;
const camera = new THREE.PerspectiveCamera(34, aspect, radius * 0.01, radius * 80);
camera.position.copy(center).addScaledVector(new THREE.Vector3(1.55, 0.82, 1.85).normalize(), radius * 5);
camera.up.set(0, 1, 0);
camera.lookAt(center);

const sky = await createSkySystem({
  camera,
  godRays: true,
  quality: 'medium',
  renderer,
  scene,
  timeOfDay: { autoAdvanceSecondsPerDay: 0, latitude: 38, time: timeOfDay / 24 },
});
const post = createPostProcessingPipeline({
  camera,
  renderer,
  scene,
  settings: { preset: 'off' },
});
const runtime = createSceneStyleRuntime({
  collision: false,
  post,
  quality: 'balanced',
  renderer,
  scene,
  sky,
  timeOfDay,
});
await runtime.apply(CALL_ME_SENSEI_STYLE_BUNDLE, {
  discovery: 'manual',
  mode: 'strict',
  targets: [createStyleTarget('legacy-rock-proof/ground', 'terrain.ground', ground)],
});
const lightingFrame = runtime.setTimeOfDay(timeOfDay);
const rockSkyResponse = mode === 'styled' || mode === 'styled-c7'
  ? setRockShaderSceneState(root, { skyColor: lightingFrame.skyHorizonColor })
  : null;

function resize() {
  const width = stage.clientWidth || innerWidth;
  const height = stage.clientHeight || innerHeight;
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  sky.resize?.(width, height);
  post.setSize(width, height, 1);
}
resize();
let warmupFrames = 0;
let resolveWarmup;
const warmup = new Promise((resolve) => { resolveWarmup = resolve; });
renderer.setAnimationLoop(() => {
  sky.update(0);
  runtime.update(1 / 60, camera);
  post.render(0);
  warmupFrames += 1;
  if (warmupFrames === 32) resolveWarmup();
});
await warmup;

const report = {
  schema: 'toonlab/legacy-current-rock-shader-browser-proof',
  version: 1,
  asset,
  mode,
  sourceUrl,
  rendererBackend: document.body.dataset.rendererBackend,
  rendererKind: document.body.dataset.rendererKind,
  shaderRuntime: mode === 'pbr-c7'
    ? 'THREE.MeshStandardNodeMaterial'
    : mode === 'source'
      ? 'THREE.MeshStandardMaterial-neutral-clay'
      : 'applyRockShader',
  shaderPreset: mode === 'styled' || mode === 'styled-c7' ? 'call_me_sensei' : null,
  lighting: {
    source: 'createSceneStyleRuntime(call-me-sensei) + SkySystem',
    timeOfDay,
    skyHorizonColor: lightingFrame.skyHorizonColor,
    skyProbeColor: lightingFrame.skyProbeColor,
    skyProbeEnergy: lightingFrame.skyProbeEnergy,
    sunColor: lightingFrame.sunColor,
    sunIntensity: lightingFrame.sunIntensity,
    rockOverrides: lightingOverrides,
    rockSkyResponse,
  },
  visibleSky: {
    source: 'SkySystem + call_me_sensei style snapshot',
    styleSnapshot: matchSkyStyleSnapshot(sky.toParams()),
    derived: {
      eveningLight: sky.timeOfDay.eveningLight.value,
      morningLight: sky.timeOfDay.morningLight.value,
      skyDarkness: sky.timeOfDay.skyDarkness.value,
    },
    params: sky.toParams(),
  },
  pipeline: mode === 'styled-c7'
    ? ['latest-480-mesh', 'c7-from-scratch-realistic-pbr', 'call_me_sensei-rock-shader']
    : mode === 'pbr-c7'
      ? ['latest-480-mesh', 'c7-from-scratch-realistic-pbr']
      : mode === 'source'
        ? ['latest-480-mesh', 'neutral-clay-no-textures']
        : ['original-embedded-textures', 'call_me_sensei-rock-shader'],
  c7GeologyMaps: c7Maps ? {
    ...c7Maps.audit,
    projectionScaleMetres: macroProjectionScale,
    nearDetailScaleMetres: c7Profile.microScale,
    embeddedTextureContribution: 0,
    standaloneTextureLibraryContribution: 0,
  } : null,
  geometryBefore,
  geometryAfter,
  geometryIdentityPassed,
  styleReport,
  c7PbrReport,
  meshStageReport,
  textureCompositions,
};
document.body.dataset.rockReport = JSON.stringify(report);
document.body.dataset.modelReady = 'true';
