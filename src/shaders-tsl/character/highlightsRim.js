// Highlights and rim (spec §5.7, §5.8).

import {
  abs,
  atan,
  screenUV,
  cameraViewMatrix,
  clamp,
  cross,
  dot,
  float,
  fwidth,
  If,
  length,
  max,
  mix,
  normalize,
  pow,
  sin,
  smoothstep,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';

import { decodeStoredDepth, prepassDistance, uvPerMetre } from './castShadows.js';

/** A thresholded highlight from N·H: a flat shape, not a smooth lobe. */
export function stylizedSpecular({ intensity, normal, halfVector, size, softness, threshold }) {
  const lobe = pow(max(dot(normal, halfVector), 0), size);
  const half = softness.mul(0.5);
  return smoothstep(threshold.sub(half), threshold.add(half), lobe).mul(intensity);
}

/**
 * The hair ring: strands run along the head's up axis projected onto the
 * surface, and the ring sits where that strand direction is at a fixed angle
 * to the view — a band around the head that stays put as the light moves.
 * It breaks into strands by a vertical offset that varies smoothly around
 * the head (no steps between strands).
 */
export function hairRing(u, { head, normal, viewDirection, worldPosition }) {
  const axis = normalize(mix(vec3(0, 1, 0), head.up, u.hairRingLean));
  const strandRaw = axis.sub(normal.mul(dot(normal, axis)));
  const strandLength = length(strandRaw);
  const strand = strandRaw.div(max(strandLength, 1e-3));
  const coordinate = dot(strand, viewDirection).negate();
  const relative = worldPosition.sub(head.center);
  const around = atan(dot(relative, head.right), dot(relative, head.forward));
  const phase = around.mul(u.hairRingStrands);
  const wobble = sin(phase).mul(0.6).add(sin(phase.mul(1.73).add(1.3)).mul(0.4)).mul(u.hairRingJitter);
  const distance = abs(coordinate.sub(u.hairRingOffset).sub(wobble));
  const halfWidth = u.hairRingWidth.mul(0.5);
  const edge = max(fwidth(coordinate), 0.004);
  const band = float(1).sub(smoothstep(halfWidth.mul(0.55), halfWidth.add(edge), distance));
  const strands = sin(phase.mul(2.37).add(0.4)).mul(0.3).add(0.7);
  const facing = smoothstep(0.05, 0.35, dot(normal, viewDirection));
  // The ring belongs to the crown: locks hanging below the head centre
  // do not take it.
  const crown = smoothstep(-0.01, 0.04, dot(relative, head.up));
  return band.mul(strands).mul(facing).mul(crown).mul(smoothstep(0.15, 0.45, strandLength));
}

/** Matcap lookup from the view-space normal (stable against view rotation). */
export function matcapUV(normalWorld, viewPosition) {
  const normalView = normalize(cameraViewMatrix.mul(vec4(normalWorld, 0)).xyz);
  const toCamera = normalize(viewPosition.negate());
  const x = normalize(vec3(toCamera.z, 0, toCamera.x.negate()));
  const y = cross(toCamera, x);
  return vec2(dot(x, normalView), dot(y, normalView)).mul(0.495).add(0.5);
}

function farther(state, uv, ownDistance) {
  const stored = decodeStoredDepth(state.depthMap.sample(uv).level(0).x);
  return prepassDistance(stored.depth).sub(ownDistance);
}

/**
 * Rim amount. Depth mode samples the prepass `width` metres (projected at the
 * pixel's depth) toward the light's screen direction and draws a rim where
 * the surface there is farther by more than the threshold; the silhouette rim
 * does the same outward along the screen-space normal. Both are skipped where
 * the opposite side is clear too (a strand thinner than the rim). View mode —
 * and the fallback without a prepass — is a view-angle rim on the lit side.
 */
export function rimAmount(u, state, { lightDirection, normal, normalView, silhouette, viewDirection, viewPosition }) {
  const ownDistance = viewPosition.z.negate();
  const useDepth = float(1).sub(u.rimMode).mul(state.depthReady);
  const depthRim = float(0).toVar('toonDepthRim');
  // Depth edges belong to surfaces turning away from the view; pixels that
  // face the camera skip the prepass taps.
  const grazing = float(1).sub(smoothstep(0.55, 0.78, dot(normal, viewDirection)));
  If(useDepth.greaterThan(0.5).and(grazing.greaterThan(0.001)), () => {
    const lightView = cameraViewMatrix.mul(vec4(lightDirection, 0)).xyz;
    const lightLength = length(lightView.xy);
    const toward = lightView.xy.div(max(lightLength, 1e-4));
    const side = smoothstep(0.03, 0.25, lightLength);
    const threshold = u.rimThreshold;
    const softness = u.rimSoftness;
    const clear = (gap) => smoothstep(threshold, threshold.add(softness), gap);
    // Lateral offsets: `width` metres at this pixel's depth, in screen UV.
    const perMetre = uvPerMetre(viewPosition).mul(u.rimWidth);
    const offsetLight = toward.mul(perMetre);
    const lightRim = clear(farther(state, screenUV.add(offsetLight), ownDistance))
      .mul(float(1).sub(clear(farther(state, screenUV.sub(offsetLight), ownDistance))))
      .mul(side);
    const silhouetteRim = float(0).toVar('toonSilhouetteRim');
    // The silhouette proper is where the surface turns fully away.
    const edgeOn = float(1).sub(smoothstep(0.25, 0.42, dot(normal, viewDirection)));
    If(silhouette.mul(edgeOn).greaterThan(0.001), () => {
      const outward = normalView.xy.div(max(length(normalView.xy), 1e-4));
      const offsetOut = outward.mul(perMetre);
      silhouetteRim.assign(clear(farther(state, screenUV.add(offsetOut), ownDistance))
        .mul(float(1).sub(clear(farther(state, screenUV.sub(offsetOut), ownDistance))))
        .mul(silhouette).mul(edgeOn));
    });
    const fade = float(1).sub(smoothstep(u.rimFadeStart, u.rimFadeEnd, ownDistance));
    depthRim.assign(max(lightRim, silhouetteRim).mul(fade).mul(grazing));
  });
  const facingAway = float(1).sub(clamp(dot(normal, viewDirection), 0, 1));
  const viewRim = smoothstep(0.62, 0.86, facingAway).mul(clamp(dot(normal, lightDirection).add(0.35), 0, 1));
  return { depthRim, rim: mix(viewRim, depthRim, useDepth) };
}
