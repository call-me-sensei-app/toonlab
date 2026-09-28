// Landscape splat blending for TSL materials. The landscape field keeps one
// global RGBA weight brick (one texel per terrain quad, channels summing to
// 255); tile geometry carries world-normalized UVs over exactly that brick,
// so `uv()` addresses the splat texture directly with zero per-tile
// bookkeeping and no cross-tile filtering seams.

import { float, mix, texture, uv, vec2, vec3, vec4 } from 'three/tsl';

import { worldFbm2 } from './world-noise.js';

/**
 * Blended splat albedo node.
 *
 * `splatTexture` — the field's RGBA weight DataTexture.
 * `layerColorNodes` — 4 vec3 nodes (flat tints or texture samples).
 * `macroAmount`/`macroScale` — uniforms for world-space brightness breakup.
 * `worldPositionNode` — world position (positionWorld for the terrain).
 */
export function landscapeSplatColorNode({
  splatTexture,
  layerColorNodes,
  macroAmount,
  macroScale,
  worldPositionNode,
}) {
  const weights = texture(splatTexture, uv());
  // Weights are stored summing to 255, but renormalize anyway so linear
  // filtering across texel edges can never darken the blend.
  const total = weights.r.add(weights.g).add(weights.b).add(weights.a).max(1e-4);
  let color = vec3(0.0);
  const channels = [weights.r, weights.g, weights.b, weights.a];
  for (let i = 0; i < 4; i += 1) {
    color = color.add(layerColorNodes[i].mul(channels[i].div(total)));
  }
  const macro = worldFbm2(vec2(worldPositionNode.x, worldPositionNode.z).mul(macroScale));
  const variation = mix(float(1.0).sub(macroAmount.mul(0.5)), float(1.0).add(macroAmount.mul(0.35)), macro);
  return vec4(color.mul(variation), 1.0);
}
