export function fallbackPostTexture(): any;
export function createBloomPrefilterNodeMaterial(): NodeMaterial;
/**
 * Bloom downsample: 5-tap box filter, one pyramid level narrower. TSL port
 * of bloomDownsampleFragmentShader.
 */
export function createBloomDownsampleNodeMaterial(): NodeMaterial;
/**
 * Bloom upsample: 8-tap tent filter, accumulating the narrower level back
 * onto the wider one. TSL port of bloomUpsampleFragmentShader.
 */
export function createBloomUpsampleNodeMaterial(): NodeMaterial;
/**
 * Final composite: motion blur, single-pass or pyramid bloom add, depth cue,
 * color grade, LUT, vertical grade, screen outline, vignette, strength
 * blend, dither. TSL port of FinalCompositeShader. `.uniforms` exposes every
 * GLSL uniform name so applyCompositeSettings() in postProcessing.js works
 * unchanged.
 */
export function createPostCompositeNodeMaterial(): NodeMaterial;
import { NodeMaterial } from 'three/webgpu';
