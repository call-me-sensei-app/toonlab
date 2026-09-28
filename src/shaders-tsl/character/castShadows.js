// Cast shadows on the character (spec §5.5). Each returns a visibility
// (1 lit, 0 shadowed) that multiplies the lit amount — a cast shadow moves a
// pixel into the shadow tone, it never darkens the tone.

import {
  abs,
  mix,
  cameraFar,
  cameraNear,
  cameraProjectionMatrix,
  cameraViewMatrix,
  clamp,
  dot,
  float,
  If,
  max,
  min,
  orthographicDepthToViewZ,
  perspectiveDepthToViewZ,
  screenUV,
  select,
  smoothstep,
  step,
  vec2,
  vec4,
} from 'three/tsl';

// Screen UV (top-left origin, like screenUV) of a view-space point.
export function viewToScreenUV(viewPosition) {
  const clip = cameraProjectionMatrix.mul(vec4(viewPosition, 1));
  const ndc = clip.xy.div(max(clip.w, 1e-6));
  return vec2(ndc.x.mul(0.5).add(0.5), ndc.y.mul(-0.5).add(0.5));
}

/** Screen UV of this pixel shifted by a view-space offset at `viewPosition`. */
export function offsetScreenUV(viewPosition, viewOffset, baseUV = viewToScreenUV(viewPosition)) {
  return screenUV.add(viewToScreenUV(viewPosition.add(viewOffset)).sub(baseUV));
}

/**
 * Screen-UV change per metre of a lateral (view-plane) offset at this
 * pixel's depth: exact for perspective and orthographic cameras.
 */
export function uvPerMetre(viewPosition) {
  const orthographic = cameraProjectionMatrix.element(3).w.equal(1);
  const w = select(orthographic, float(1), viewPosition.z.negate().max(1e-4));
  return vec2(cameraProjectionMatrix.element(0).x, cameraProjectionMatrix.element(1).y.negate()).mul(0.5).div(w);
}

// The character passes store window depth in [0, 1], plus 2 on face (and
// eye) surfaces so face receivers can ignore them; node materials clamp
// their output at 0, so the flag must stay positive.
export const FACE_DEPTH_OFFSET = 2;

/** `{ depth, face }` from a value stored by the character passes. */
export function decodeStoredDepth(stored) {
  const face = stored.greaterThan(1.5);
  return { depth: select(face, stored.sub(FACE_DEPTH_OFFSET), stored), face };
}

/** Window depth written by the depth prepass → distance in front of the camera. */
export function prepassDistance(windowDepth) {
  const orthographic = cameraProjectionMatrix.element(3).w.equal(1);
  const viewZ = select(
    orthographic,
    orthographicDepthToViewZ(windowDepth, cameraNear, cameraFar),
    perspectiveDepthToViewZ(windowDepth, cameraNear, cameraFar),
  );
  return viewZ.negate();
}

/**
 * The character's own orthographic shadow map (characterRenderPasses.js):
 * normal-offset and slope-scaled bias, bilinear filtering, and a fade toward the
 * edge of the map's coverage.
 */
export function characterShadowVisibility(u, state, worldPosition, geometryNormal, faceLike, gate) {
  const visibility = float(1).toVar('toonCharacterShadow');
  If(state.shadowReady.greaterThan(0.5).and(gate), () => {
    // Offset along the normal side that faces the light (thin, two-sided
    // cards such as hair are lit from either side).
    const facingSigned = dot(geometryNormal, state.shadowDirection);
    const towardLight = geometryNormal.mul(select(facingSigned.lessThan(0), float(-1), float(1)));
    const facing = abs(facingSigned).clamp(0, 1);
    const receiver = worldPosition.add(towardLight.mul(u.characterShadowNormalBias));
    const clip = state.shadowMatrix.mul(vec4(receiver, 1));
    const coord = clip.xyz.div(clip.w).mul(0.5).add(0.5).toVar();
    const inside = coord.x.greaterThanEqual(0).and(coord.x.lessThanEqual(1))
      .and(coord.y.greaterThanEqual(0)).and(coord.y.lessThanEqual(1))
      .and(coord.z.greaterThanEqual(0)).and(coord.z.lessThanEqual(1));
    If(inside, () => {
      const slope = float(1).add(float(1).sub(facing).mul(3));
      const reference = coord.z.sub(u.characterShadowDepthBias.mul(slope).div(max(state.shadowDepthRange, 1e-4)));
      // Bilinearly weighted comparisons of the 2×2 (softness-scaled) texels
      // around the receiver: smooth edges from four taps.
      const grid = state.shadowMapSize.div(max(u.characterShadowSoftness, 0.25));
      const cell = coord.xy.mul(grid).sub(0.5);
      const base = cell.floor();
      const blend = cell.sub(base);
      // Faces and eyes ignore face occluders (layered lashes, brows and
      // eye whites a few millimetres apart must not shadow each other).
      const ignoreFace = faceLike.greaterThan(0.5);
      const tap = (x, y) => {
        const stored = decodeStoredDepth(state.shadowMap.sample(base.add(vec2(x, y)).add(0.5).div(grid)).level(0).x);
        return select(stored.face.and(ignoreFace), float(1), step(reference, stored.depth));
      };
      const lit = mix(
        mix(tap(0, 0), tap(1, 0), blend.x),
        mix(tap(0, 1), tap(1, 1), blend.x),
        blend.y,
      );
      const edge = max(abs(coord.x.sub(0.5)), abs(coord.y.sub(0.5))).mul(2);
      const coverage = float(1).sub(smoothstep(0.9, 1, edge));
      visibility.assign(mix1(lit, coverage));
    });
  });
  return visibility;
}

function mix1(value, amount) {
  return float(1).add(value.sub(1).mul(amount));
}

/**
 * Screen-space shadow toward the light against the depth prepass: something
 * in front of the short ray toward the light (bangs over the forehead, hair
 * on the cheek) shadows the pixel. Face receivers ignore face occluders
 * (`faceWeight`), so a face never shadows itself.
 */
export function screenSpaceShadowVisibility(u, state, viewPosition, lightDirectionWorld, faceWeight, gate) {
  const occlusion = float(0).toVar('toonScreenShadow');
  If(state.depthReady.greaterThan(0.5).and(gate), () => {
    const lightView = cameraViewMatrix.mul(vec4(lightDirectionWorld, 0)).xyz;
    const baseUV = viewToScreenUV(viewPosition);
    for (const fraction of [0.5, 1]) {
      const rayPoint = viewPosition.add(lightView.mul(u.screenShadowWidth.mul(fraction)));
      const stored = decodeStoredDepth(state.depthMap.sample(offsetScreenUV(viewPosition, lightView.mul(u.screenShadowWidth.mul(fraction)), baseUV)).level(0).x);
      const nearer = rayPoint.z.negate().sub(prepassDistance(stored.depth));
      const faceOccluder = select(stored.face, float(1), float(0));
      const hit = smoothstep(0.002, 0.006, nearer)
        .mul(float(1).sub(smoothstep(0.12, 0.25, nearer)))
        .mul(float(1).sub(faceOccluder.mul(min(faceWeight.mul(2), 1))));
      occlusion.assign(max(occlusion, hit));
    }
  });
  return float(1).sub(occlusion);
}
