// Derived vertex attributes for meshed documents. Everything here is a
// function of the compiled field (gradient normals, SDF ambient occlusion)
// or of deterministic seeded noise (color variation), so attributes can be
// re-derived after any re-mesh or decimation and stay bit-identical for a
// given document.

import { cellular3 } from '../noise/cellularNoise3.js';
import { fbm3, valueNoise3 } from '../noise/valueNoise3.js';

function clamp01(value) {
  return Math.min(Math.max(value, 0), 1);
}

function smoothstep(edge0, edge1, value) {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function fract(value) {
  return value - Math.floor(value);
}

// Surface colors are authored as display (sRGB) values in the settings UI
// but vertex colors feed the shader linearly, so convert once per bake
// (three colors, not per vertex — Math.pow stays out of the hot loop).
function srgbToLinear(color) {
  return color.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
}

/** Central-difference field gradient per vertex, normalized. */
export function computeGradientNormals(evaluate, positions, epsilon) {
  const normals = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    let nxv = evaluate(x + epsilon, y, z) - evaluate(x - epsilon, y, z);
    let nyv = evaluate(x, y + epsilon, z) - evaluate(x, y - epsilon, z);
    let nzv = evaluate(x, y, z + epsilon) - evaluate(x, y, z - epsilon);
    const length = Math.sqrt(nxv * nxv + nyv * nyv + nzv * nzv);
    if (length > 0) {
      nxv /= length;
      nyv /= length;
      nzv /= length;
    } else {
      nyv = 1;
    }
    normals[i] = nxv;
    normals[i + 1] = nyv;
    normals[i + 2] = nzv;
  }
  return normals;
}

/**
 * Five-tap SDF ambient occlusion along the vertex normal. Near-free since
 * the field is already compiled, deterministic, and baked into the
 * `envVertexAo` attribute (1 = open, matching environmentVertexAo.js).
 */
export function computeSdfAo(evaluate, positions, normals, { radius, strength }) {
  const ao = new Float32Array(positions.length / 3);
  const tapCount = 5;
  for (let v = 0; v < ao.length; v += 1) {
    const i = v * 3;
    let occlusion = 0;
    let weight = 0.5;
    let weightSum = 0;
    for (let tap = 1; tap <= tapCount; tap += 1) {
      const t = (radius * tap) / tapCount;
      const d = evaluate(
        positions[i] + normals[i] * t,
        positions[i + 1] + normals[i + 1] * t,
        positions[i + 2] + normals[i + 2] * t,
      );
      occlusion += weight * Math.max(t - d, 0) / t;
      weightSum += weight;
      weight *= 0.5;
    }
    ao[v] = clamp01(1 - strength * (occlusion / weightSum));
  }
  return ao;
}

/**
 * Baked stylized albedo: base color, cavity color mixed in by occlusion,
 * top (snow/moss/highlight) color by up-slope and height band, plus a low
 * amplitude seeded color variation.
 */
export function computeVertexColors(positions, normals, ao, surface, seed, bounds, tintAt = null) {
  const colors = new Float32Array(positions.length);
  const {
    aoRadius, colorNoise, textureStyle, topHeightStart, topSlopeStart,
  } = surface;
  const baseColor = srgbToLinear(surface.baseColor);
  const cavityColor = srgbToLinear(surface.cavityColor);
  const topColor = srgbToLinear(surface.topColor);
  const veinColor = srgbToLinear(surface.veinColor);
  const stainColor = srgbToLinear(surface.stainColor);
  const mossColor = srgbToLinear(surface.mossColor);
  const lichenColor = srgbToLinear(surface.lichenColor);
  const topCoatStrength = clamp01(surface.topCoatStrength ?? 1);
  const textureScale = Math.max(Number(surface.textureScale) || 1, 0.1);
  const textureStrength = clamp01(surface.textureStrength ?? 0);
  const veinStrength = clamp01(surface.veinStrength ?? 0);
  const stainStrength = clamp01(surface.stainStrength ?? 0);
  const mossCoverage = clamp01(surface.mossCoverage ?? 0);
  const lichenCoverage = clamp01(surface.lichenCoverage ?? 0);
  const minY = bounds.min[1];
  const invHeight = 1 / Math.max(bounds.max[1] - minY, 1e-6);
  // Noise frequency scales with AO radius so the mottling tracks rock size.
  const noiseFrequency = 2.4 / Math.max(aoRadius, 0.05);
  const textureFrequency = textureScale / Math.max(aoRadius, 0.05);
  const hasTexture = textureStyle !== 'none' && textureStrength > 0;
  const hasVeins = veinStrength > 0;
  const hasStain = stainStrength > 0;
  const hasMoss = mossCoverage > 0;
  const hasLichen = lichenCoverage > 0;

  const maskFrequency = 1.2 / Math.max(aoRadius, 0.05);
  for (let v = 0; v < ao.length; v += 1) {
    const i = v * 3;
    const cavity = clamp01((1 - ao[v]) * 1.4);
    const slope = smoothstep(topSlopeStart, Math.min(topSlopeStart + 0.2, 1), normals[i + 1]);
    const height = smoothstep(
      topHeightStart,
      Math.min(topHeightStart + 0.15, 1),
      (positions[i + 1] - minY) * invHeight,
    );
    // Break the top-coat edge up with noise so moss/snow reads as patches
    // instead of a painted-on waterline.
    const mask = valueNoise3(
      seed + 1,
      positions[i] * maskFrequency,
      positions[i + 1] * maskFrequency,
      positions[i + 2] * maskFrequency,
    );
    const top = smoothstep(0.25, 0.75, slope * height + mask * 0.3);
    const variation = 1 + colorNoise * valueNoise3(
      seed,
      positions[i] * noiseFrequency,
      positions[i + 1] * noiseFrequency,
      positions[i + 2] * noiseFrequency,
    );

    // Erosion story (heightfield pieces): sediment deposits read as light
    // dust settling in the gullies, water flow darkens its channels — the
    // hand-painted weathering look, straight from the sim's masks.
    let sedimentBlend = 0;
    let flowBlend = 0;
    if (tintAt) {
      const tint = tintAt(positions[i], positions[i + 1], positions[i + 2]);
      if (tint) {
        sedimentBlend = clamp01(tint.sediment) * 0.4;
        flowBlend = clamp01(tint.flow) * 0.3;
      }
    }

    let red = baseColor[0] + (cavityColor[0] - baseColor[0]) * cavity;
    let green = baseColor[1] + (cavityColor[1] - baseColor[1]) * cavity;
    let blue = baseColor[2] + (cavityColor[2] - baseColor[2]) * cavity;
    const topBlend = top * topCoatStrength;
    red += (topColor[0] - red) * topBlend;
    green += (topColor[1] - green) * topBlend;
    blue += (topColor[2] - blue) * topBlend;
    red += (topColor[0] - red) * sedimentBlend;
    green += (topColor[1] - green) * sedimentBlend;
    blue += (topColor[2] - blue) * sedimentBlend;
    red += (cavityColor[0] - red) * flowBlend;
    green += (cavityColor[1] - green) * flowBlend;
    blue += (cavityColor[2] - blue) * flowBlend;

    if (hasTexture) {
      const tx = positions[i] * textureFrequency;
      const ty = positions[i + 1] * textureFrequency;
      const tz = positions[i + 2] * textureFrequency;
      const grain = fbm3(seed + 17, tx, ty, tz, 4, 2, 0.52);
      if (textureStyle === 'granite') {
        const fine = fbm3(seed + 23, tx * 3.4, ty * 3.4, tz * 3.4, 3, 2.1, 0.45);
        const flecks = cellular3(seed + 29, tx * 4.2, ty * 4.2, tz * 4.2, 0.85);
        const paleFleck = (1 - smoothstep(0.06, 0.2, flecks.f1)) * textureStrength * 0.42;
        const darkFleck = smoothstep(0.45, 0.95, -fine) * textureStrength * 0.22;
        const tone = 1 + fine * textureStrength * 0.12;
        red *= tone;
        green *= tone;
        blue *= tone;
        red += (0.78 - red) * paleFleck;
        green += (0.77 - green) * paleFleck;
        blue += (0.72 - blue) * paleFleck;
        red += (0.24 - red) * darkFleck;
        green += (0.24 - green) * darkFleck;
        blue += (0.25 - blue) * darkFleck;
      } else if (textureStyle === 'sandstone') {
        const bandCoord = (positions[i + 1] - minY) * invHeight * (5 + textureScale * 3)
          + grain * 0.35;
        const band = 1 - Math.abs(fract(bandCoord) * 2 - 1);
        const layer = smoothstep(0.58, 0.92, band) * textureStrength;
        const dust = smoothstep(-0.2, 0.75, grain) * textureStrength * 0.22;
        red += (0.83 - red) * dust;
        green += (0.63 - green) * dust;
        blue += (0.42 - blue) * dust;
        red += (0.46 - red) * layer * 0.22;
        green += (0.27 - green) * layer * 0.22;
        blue += (0.17 - blue) * layer * 0.22;
      } else if (textureStyle === 'basalt') {
        const cells = cellular3(seed + 31, tx * 0.9, ty * 0.9, tz * 0.9, 0.65);
        const joint = (1 - smoothstep(0.08, 0.26, cells.f2 - cells.f1)) * textureStrength;
        const crystal = smoothstep(0.3, 0.82, cells.f1) * textureStrength * 0.16;
        red += (0.11 - red) * joint * 0.4;
        green += (0.12 - green) * joint * 0.4;
        blue += (0.14 - blue) * joint * 0.4;
        red += (0.45 - red) * crystal;
        green += (0.47 - green) * crystal;
        blue += (0.5 - blue) * crystal;
      } else if (textureStyle === 'limestone') {
        const cloud = (grain + 1) * 0.5;
        const chalk = smoothstep(0.34, 0.82, cloud) * textureStrength * 0.36;
        const pit = smoothstep(0.18, 0.64, -grain) * textureStrength * 0.18;
        // Limestone reads through sedimentation first, mottling second.
        // Normalize by piece height so every rock gets broad horizontal beds
        // regardless of its authored dimensions. Warped thin dark seams keep
        // the layers geological instead of decorative.
        const bandCoord = (positions[i + 1] - minY) * invHeight * (6 + textureScale * 3.5)
          + grain * 0.18;
        const bandPhase = fract(bandCoord);
        const seamDistance = Math.min(bandPhase, 1 - bandPhase) * 2;
        const seam = (1 - smoothstep(0.025, 0.16, seamDistance)) * textureStrength;
        const ochreShelf = smoothstep(0.2, 0.42, bandPhase)
          * (1 - smoothstep(0.55, 0.76, bandPhase)) * textureStrength;
        red += (0.79 - red) * chalk;
        green += (0.77 - green) * chalk;
        blue += (0.66 - blue) * chalk;
        red += (0.38 - red) * pit;
        green += (0.35 - green) * pit;
        blue += (0.28 - blue) * pit;
        red += (0.27 - red) * seam * 0.58;
        green += (0.22 - green) * seam * 0.58;
        blue += (0.16 - blue) * seam * 0.58;
        red += (0.76 - red) * ochreShelf * 0.18;
        green += (0.57 - green) * ochreShelf * 0.18;
        blue += (0.34 - blue) * ochreShelf * 0.18;
      } else if (textureStyle === 'veined') {
        const coolCloud = smoothstep(-0.25, 0.85, grain) * textureStrength * 0.18;
        red += (0.58 - red) * coolCloud;
        green += (0.6 - green) * coolCloud;
        blue += (0.64 - blue) * coolCloud;
      }
    }

    if (hasVeins) {
      const warp = fbm3(
        seed + 47,
        positions[i] * textureFrequency * 0.65,
        positions[i + 1] * textureFrequency * 0.65,
        positions[i + 2] * textureFrequency * 0.65,
        3,
        2,
        0.5,
      ) * 0.45;
      const coord = (
        positions[i] * 0.61 + positions[i + 1] * 0.24 - positions[i + 2] * 0.72
      ) * (0.9 + textureScale * 0.6) + warp;
      const centerLine = 1 - Math.abs(fract(coord) * 2 - 1);
      const vein = smoothstep(0.86, 0.985, centerLine) * veinStrength;
      red += (veinColor[0] - red) * vein;
      green += (veinColor[1] - green) * vein;
      blue += (veinColor[2] - blue) * vein;
    }

    if (hasStain) {
      const streakNoise = (valueNoise3(
        seed + 61,
        positions[i] * textureFrequency * 0.7,
        positions[i + 1] * textureFrequency * 0.18,
        positions[i + 2] * textureFrequency * 0.7,
      ) + 1) * 0.5;
      const exposedWall = (1 - slope) * 0.45 + cavity * 0.65 + streakNoise * 0.35;
      const stain = smoothstep(0.42, 1.05, exposedWall)
        * (0.6 + (1 - height) * 0.4)
        * stainStrength;
      red += (stainColor[0] - red) * stain;
      green += (stainColor[1] - green) * stain;
      blue += (stainColor[2] - blue) * stain;
    }

    if (hasLichen) {
      const lichenCells = cellular3(
        seed + 83,
        positions[i] * textureFrequency * 2.5,
        positions[i + 1] * textureFrequency * 2.5,
        positions[i + 2] * textureFrequency * 2.5,
        1,
      );
      const spots = (1 - smoothstep(0.07, 0.24, lichenCells.f1));
      const patchNoise = fbm3(
        seed + 89,
        positions[i] * textureFrequency,
        positions[i + 1] * textureFrequency,
        positions[i + 2] * textureFrequency,
        3,
        2,
        0.5,
      );
      const exposed = (1 - cavity * 0.55) * (0.72 + slope * 0.28);
      const lichen = spots
        * smoothstep(-0.3, 0.55, patchNoise)
        * exposed
        * lichenCoverage;
      red += (lichenColor[0] - red) * lichen;
      green += (lichenColor[1] - green) * lichen;
      blue += (lichenColor[2] - blue) * lichen;
    }

    if (hasMoss) {
      const mossNoise = fbm3(
        seed + 97,
        positions[i] * textureFrequency * 0.8,
        positions[i + 1] * textureFrequency * 0.3,
        positions[i + 2] * textureFrequency * 0.8,
        4,
        2,
        0.5,
      );
      const ledges = slope * (0.55 + height * 0.45);
      const support = ledges + cavity * 0.45 + (1 - height) * 0.1;
      const moss = smoothstep(0.32, 0.9, support)
        * smoothstep(-0.25, 0.65, mossNoise)
        * mossCoverage;
      red += (mossColor[0] - red) * moss;
      green += (mossColor[1] - green) * moss;
      blue += (mossColor[2] - blue) * moss;
    }

    colors[i] = clamp01(red * variation);
    colors[i + 1] = clamp01(green * variation);
    colors[i + 2] = clamp01(blue * variation);
  }
  return colors;
}

/**
 * De-indexes positions and emits per-face normals for the 'flat' normals
 * mode. Colors/AO are expanded alongside so the attribute contract holds.
 */
export function deindexWithFlatNormals({ ao, colors, indices, positions }) {
  const triangleCount = indices.length / 3;
  const flatPositions = new Float32Array(indices.length * 3);
  const flatNormals = new Float32Array(indices.length * 3);
  const flatColors = new Float32Array(indices.length * 3);
  const flatAo = new Float32Array(indices.length);

  for (let t = 0; t < triangleCount; t += 1) {
    const i0 = indices[t * 3];
    const i1 = indices[t * 3 + 1];
    const i2 = indices[t * 3 + 2];
    const ax = positions[i0 * 3];
    const ay = positions[i0 * 3 + 1];
    const az = positions[i0 * 3 + 2];
    const ux = positions[i1 * 3] - ax;
    const uy = positions[i1 * 3 + 1] - ay;
    const uz = positions[i1 * 3 + 2] - az;
    const vx = positions[i2 * 3] - ax;
    const vy = positions[i2 * 3 + 1] - ay;
    const vz = positions[i2 * 3 + 2] - az;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const length = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (length > 0) {
      nx /= length;
      ny /= length;
      nz /= length;
    }
    for (let corner = 0; corner < 3; corner += 1) {
      const source = indices[t * 3 + corner];
      const write = t * 3 + corner;
      flatPositions[write * 3] = positions[source * 3];
      flatPositions[write * 3 + 1] = positions[source * 3 + 1];
      flatPositions[write * 3 + 2] = positions[source * 3 + 2];
      flatNormals[write * 3] = nx;
      flatNormals[write * 3 + 1] = ny;
      flatNormals[write * 3 + 2] = nz;
      flatColors[write * 3] = colors[source * 3];
      flatColors[write * 3 + 1] = colors[source * 3 + 1];
      flatColors[write * 3 + 2] = colors[source * 3 + 2];
      flatAo[write] = ao[source];
    }
  }
  return {
    ao: flatAo, colors: flatColors, normals: flatNormals, positions: flatPositions,
  };
}
