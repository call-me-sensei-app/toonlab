import { readTexturePixels, sampleSurfaceUvs, sampleTexturePixel } from './texturePixels.js';

// What a material's base-texture alpha actually contains, measured where the
// mesh samples it. The cutout/blend rules infer intent from names, roles and
// importer flags; this is the evidence they must agree with before the shader
// discards pixels:
//
//   mask    — near-binary coverage (holes, lace, hair-card gaps): cut as asked.
//   opaque  — nothing on the surface is below the cutout band: cutting is a
//             no-op that only costs early-z and routes hair to the cutout
//             outline width, so don't.
//   data    — a broad intermediate population with almost no true holes: a
//             channel-packed map (AO, wrinkles) riding in alpha. Neither cut
//             nor blend with it.
//   unknown — pixels unreadable; callers keep their inferred behaviour.
//   soft    — not measured but resolved: data-like alpha on a material whose
//             author declared alpha blending (glTF BLEND), e.g. a soft eye
//             overlay. It is blended as coverage.
//
// Measured on the launch character (D19-171): a genuine cutout mask puts
// ~0.5 % of its texels in the intermediate band, a packed wrinkle/AO channel
// ~39 %.
export const ALPHA_COVERAGE_KINDS = Object.freeze({
  data: 'data',
  mask: 'mask',
  opaque: 'opaque',
  soft: 'soft',
  unknown: 'unknown',
});

const TRANSPARENT_BELOW = 0.06 * 255;
const SOLID_ABOVE = 0.94 * 255;
const OPAQUE_LIMIT = 0.0005;
const DATA_INTERMEDIATE_MIN = 0.2;
const DATA_TRANSPARENT_MAX = 0.05;

const UNKNOWN = Object.freeze({ kind: ALPHA_COVERAGE_KINDS.unknown, sampleCount: 0 });

export function classifyAlphaSamples({ intermediate, total, transparent }) {
  if (!total) return ALPHA_COVERAGE_KINDS.unknown;
  const intermediateFraction = intermediate / total;
  const transparentFraction = transparent / total;
  if (intermediateFraction + transparentFraction < OPAQUE_LIMIT) return ALPHA_COVERAGE_KINDS.opaque;
  if (intermediateFraction > DATA_INTERMEDIATE_MIN && transparentFraction < DATA_TRANSPARENT_MAX) {
    return ALPHA_COVERAGE_KINDS.data;
  }
  return ALPHA_COVERAGE_KINDS.mask;
}

/**
 * Measures the alpha of `texture` over the surface of `geometry` drawn by the
 * slot `materialIndex` (null = whole geometry).
 */
export function measureAlphaCoverage(texture, geometry, { materialIndex = null, samples = 16384 } = {}) {
  if (!texture?.isTexture || !geometry) return UNKNOWN;
  const pixels = readTexturePixels(texture);
  if (!pixels) return UNKNOWN;
  if (pixels.channels < 4) {
    return { intermediateFraction: 0, kind: ALPHA_COVERAGE_KINDS.opaque, sampleCount: 0, transparentFraction: 0 };
  }

  const uvs = sampleSurfaceUvs(geometry, { count: samples, materialIndex });
  if (uvs.length === 0) return UNKNOWN;
  if (texture.matrixAutoUpdate) texture.updateMatrix();

  const texel = [0, 0, 0, 255];
  let transparent = 0;
  let intermediate = 0;
  const total = uvs.length / 3;
  for (let sample = 0; sample < total; sample += 1) {
    const alpha = sampleTexturePixel(pixels, texture, uvs[sample * 3], uvs[sample * 3 + 1], texel)[3];
    if (alpha < TRANSPARENT_BELOW) transparent += 1;
    else if (alpha <= SOLID_ABOVE) intermediate += 1;
  }

  return {
    intermediateFraction: intermediate / total,
    kind: classifyAlphaSamples({ intermediate, total, transparent }),
    sampleCount: total,
    transparentFraction: transparent / total,
  };
}
