// Shared ground-field sampling for TSL materials — the runtime's stand-in
// for engine runtime-virtual-texturing of the landscape. A dedicated pass
// (src/environment/environmentGroundFieldPass.js) renders the ground writers
// (terrain, path ribbons, plazas) top-down into three targets — albedo,
// surface properties, and world height — and fills these shared uniforms.
// Grass tints itself to the ground beneath it and inherits the authored RVT
// specular response, while mesh bases (rocks, trunks) melt into the terrain,
// by sampling here.
//
// Projection reuses the sun-shadow convention: worldPos through a CPU-composed
// ortho view-projection (clip-adjusted per backend), `*0.5+0.5` remap in the
// shader. Until the pass runs `ready` stays false: colors sample as
// zero-coverage and blend factors as 0 — identical to a scene without the
// pass.

import * as THREE from 'three';
import {
  clamp,
  float,
  Fn,
  If,
  mix,
  smoothstep,
  step,
  texture,
  uniform,
  vec4,
} from 'three/tsl';

export const environmentGroundField = {
  colorMap: null, // TextureNode, created lazily (needs a fallback texture)
  // Deterministically prefiltered color target used when a source material
  // requests an RVT mip. WebGPU render targets do not expose a populated mip
  // chain reliably, so the pass renders the requested footprint directly.
  filteredColorMap: null,
  // rgb = roughness, specular, metalness. Coverage remains authoritative in
  // colorMap.a so a missing/cleared surface target can never create coverage.
  surfaceMap: null,
  heightMap: null,
  matrix: uniform(new THREE.Matrix4()),
  // World-height encoding of the height target: worldY = texel * span + min.
  heightMin: uniform(0),
  heightSpan: uniform(1),
  // Mip level for color samples. The exact ground texel can contrast harshly
  // against a blade/mesh tint; a positive level softens toward the local
  // average (the reference implementation exposes the same knob on its
  // virtual-texture blend).
  colorMipLevel: uniform(0),
  ready: uniform(false, 'bool'),
};

let fallbackColorTexture = null;
let fallbackSurfaceTexture = null;
let fallbackHeightTexture = null;

function fallback(data) {
  const tex = new THREE.DataTexture(data, 1, 1);
  tex.needsUpdate = true;
  return tex;
}

export function groundFieldColorMapNode() {
  if (!environmentGroundField.colorMap) {
    fallbackColorTexture ??= fallback(new Uint8Array([0, 0, 0, 0]));
    environmentGroundField.colorMap = texture(fallbackColorTexture);
  }
  return environmentGroundField.colorMap;
}

export function groundFieldFilteredColorMapNode() {
  if (!environmentGroundField.filteredColorMap) {
    fallbackColorTexture ??= fallback(new Uint8Array([0, 0, 0, 0]));
    environmentGroundField.filteredColorMap = texture(fallbackColorTexture);
  }
  return environmentGroundField.filteredColorMap;
}

export function groundFieldHeightMapNode() {
  if (!environmentGroundField.heightMap) {
    fallbackHeightTexture ??= fallback(new Uint8Array([0, 0, 0, 255]));
    environmentGroundField.heightMap = texture(fallbackHeightTexture);
  }
  return environmentGroundField.heightMap;
}

export function groundFieldSurfaceMapNode() {
  if (!environmentGroundField.surfaceMap) {
    // ToonLab defaults: roughness .5, specular .5, metalness 0.
    fallbackSurfaceTexture ??= fallback(new Uint8Array([128, 128, 0, 255]));
    environmentGroundField.surfaceMap = texture(fallbackSurfaceTexture);
  }
  return environmentGroundField.surfaceMap;
}

const groundFieldCoord = /*@__PURE__*/ Fn(([worldPosition]) => {
  const clip = environmentGroundField.matrix.mul(vec4(worldPosition, 1.0));
  return clip.xyz.div(clip.w).mul(0.5).add(0.5);
});

/**
 * Ground albedo under a world position: rgb = color, a = coverage (0 where
 * no ground writer rendered, outside the field bounds, or before the pass
 * has run). Callers mix toward their own base color by alpha.
 */
export const sampleGroundColor = /*@__PURE__*/ Fn(([worldPosition]) => {
  const result = vec4(0.0).toVar();
  If(environmentGroundField.ready, () => {
    const coord = groundFieldCoord(worldPosition).toVar();
    const inside = coord.x.greaterThanEqual(0.0).and(coord.x.lessThanEqual(1.0))
      .and(coord.y.greaterThanEqual(0.0)).and(coord.y.lessThanEqual(1.0));
    If(inside, () => {
      const exact = groundFieldColorMapNode().sample(coord.xy).level(0);
      const filtered = groundFieldFilteredColorMapNode().sample(coord.xy).level(0);
      result.assign(mix(
        exact,
        filtered,
        step(0.5, environmentGroundField.colorMipLevel),
      ));
    });
  });
  return result;
});

/**
 * Ground surface properties under a world position:
 * rgb = roughness, specular, metalness; a = the color target's coverage.
 * This mirrors the landscape RVT material fields consumed by M_Foliage.
 */
export const sampleGroundSurface = /*@__PURE__*/ Fn(([worldPosition]) => {
  const result = vec4(0.5, 0.5, 0.0, 0.0).toVar();
  If(environmentGroundField.ready, () => {
    const coord = groundFieldCoord(worldPosition).toVar();
    const inside = coord.x.greaterThanEqual(0.0).and(coord.x.lessThanEqual(1.0))
      .and(coord.y.greaterThanEqual(0.0)).and(coord.y.lessThanEqual(1.0));
    If(inside, () => {
      const surface = groundFieldSurfaceMapNode().sample(coord.xy).level(0);
      const coverage = groundFieldColorMapNode().sample(coord.xy).level(0).a;
      result.assign(vec4(surface.rgb, coverage));
    });
  });
  return result;
});

/**
 * World-space ground height under a position. Returns a far-below sentinel
 * (heightMin - heightSpan) when unavailable so naive height differences
 * produce zero blend rather than false contact.
 */
export const sampleGroundHeight = /*@__PURE__*/ Fn(([worldPosition]) => {
  const sentinel = environmentGroundField.heightMin.sub(environmentGroundField.heightSpan);
  const height = float(sentinel).toVar();
  If(environmentGroundField.ready, () => {
    const coord = groundFieldCoord(worldPosition).toVar();
    const inside = coord.x.greaterThanEqual(0.0).and(coord.x.lessThanEqual(1.0))
      .and(coord.y.greaterThanEqual(0.0)).and(coord.y.lessThanEqual(1.0));
    If(inside, () => {
      const texel = groundFieldHeightMapNode().sample(coord.xy).level(0);
      height.assign(texel.x.mul(environmentGroundField.heightSpan).add(environmentGroundField.heightMin));
    });
  });
  return height;
});

/**
 * Contact-blend weight for melting a mesh base into the ground: 1 at or
 * below the ground surface, easing to 0 at blendHeight above it, scaled by
 * ground coverage. The mesh-base equivalent of the reference VT blend.
 */
export const groundBlendFactor = /*@__PURE__*/ Fn(([worldPosition, blendHeight]) => {
  const coverage = sampleGroundColor(worldPosition).a;
  const heightAbove = worldPosition.y.sub(sampleGroundHeight(worldPosition));
  const contact = float(1.0).sub(smoothstep(float(0.0), blendHeight.max(0.001), heightAbove));
  return clamp(contact.mul(coverage), 0.0, 1.0);
});
