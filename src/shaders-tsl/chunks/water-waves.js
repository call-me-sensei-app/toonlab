// TSL port of src/shaders/chunks/water-waves.glsl — the Gerstner wave stack
// shared by the water vertex and fragment stages (and the breaker shells).
// Wave parameters are prebuilt on the CPU (buildGerstnerWaveUniforms in
// waterSettings.js) so the exact same spectrum can be evaluated in JS for
// buoyancy queries. Keep the math in sync with sampleGerstnerHeight.
//
// uWavesA[i] = (direction.x, direction.z, angularFrequency, waveNumber)
// uWavesB[i] = (amplitude, phaseOffset, steepness, crestWeight)
//
// Convention (docs/tsl-conventions.md): the wave count is a compile-time
// constant (the GLSL WATER_WAVE_COUNT define), so the chunk is a factory of
// plain JS composition functions whose loops unroll at graph-build time.
// The GLSL `i < 2 ? 1.0 : chopWeight` slot filter is a JS-side ternary per
// unrolled iteration — slots 0/1 (the dominant swell / set-beat pair) always
// pass at full strength, the shorter cross chop fades toward the surf zone.
// That amplitude filter is independent of nearshore phase applicability:
// slot 1 only shares q when WaterSurface marks it as an authored beat partner.

import {
  clamp,
  cross,
  cos,
  dot,
  float,
  fract,
  mix,
  length,
  max,
  normalize,
  sin,
  vec3,
} from 'three/tsl';

export function createWaterWavesChunk({ wavesA, wavesB, waveCount }) {
  const count = Math.max(1, Math.trunc(waveCount));

  // The primary swell and an eligible set-beat partner can replace their
  // deep-water plane coordinate with a CPU-baked mild-slope phase field.
  // `waveVector` is grad(q), in
  // multiples of the offshore wave number; it therefore supplies both the
  // refracted propagation direction and the shortened shallow wavelength.
  // This is a JS-side branch while the node graph is built, so the six short
  // cross-wave slots keep their original graph and cost.
  const spatialPhaseFrame = (slot, direction, restXZ, nearshore) => {
    const baseCoordinate = dot(direction, restXZ);
    if (!nearshore || slot >= 2) {
      return {
        coordinate: baseCoordinate,
        gradient: direction,
        orbitDirection: direction,
      };
    }
    // slotMask: 0 = disabled, 1 = primary only, 2 = same-direction beat pair.
    // Encoding both applicability bits in the existing attribute channel
    // avoids another varying/uniform and keeps cross-running slot 1 on its
    // authored plane phase when Wave Set Strength is zero.
    const slotMask = nearshore.slotMask ?? float(2.0);
    const slotWeight = slot === 0
      ? clamp(slotMask, 0.0, 1.0)
      : clamp(slotMask.sub(1.0), 0.0, 1.0);
    const blend = nearshore.blend.mul(slotWeight).toVar();
    const gradient = mix(direction, nearshore.waveVector, blend).toVar();
    return {
      coordinate: mix(baseCoordinate, nearshore.phaseCoordinate, blend),
      gradient,
      orbitDirection: normalize(gradient),
    };
  };

  // vec3 displacement of the rest position; chopWeight ∈ [0,1] filters the
  // short cross-running components (1 = full open-water spectrum).
  const gerstnerDisplacementFiltered = (restXZ, time, chopWeight, nearshore = null) => {
    const displacement = vec3(0.0).toVar();
    for (let i = 0; i < count; i += 1) {
      const a = wavesA.element(i).toVar();
      const b = wavesB.element(i).toVar();
      const direction = a.xy;
      const omega = a.z;
      const waveNumber = a.w;
      const amplitude = (i < 2 ? b.x : b.x.mul(chopWeight)).toVar();
      const phase = b.y;
      const steepness = b.z;
      const phaseFrame = spatialPhaseFrame(i, direction, restXZ, nearshore);
      const theta = waveNumber.mul(phaseFrame.coordinate)
        .sub(omega.mul(time)).add(phase).toVar();
      const sinTheta = sin(theta);
      const cosTheta = cos(theta);
      displacement.y.addAssign(amplitude.mul(sinTheta));
      displacement.xz.addAssign(
        phaseFrame.orbitDirection.mul(steepness.div(max(length(phaseFrame.gradient), 1.0)).mul(amplitude).mul(cosTheta)),
      );
    }
    return displacement;
  };

  const gerstnerDisplacement = (restXZ, time) => gerstnerDisplacementFiltered(restXZ, time, float(1.0));

  // Vertical signal of the two long swell slots that survive into the surf
  // zone. Swash evaluates this at the projected rest shoreline rather than at
  // every beach vertex, so one arriving swell produces one connected edge.
  const gerstnerSwellHeight = (restXZ, time, nearshore = null) => {
    const height = float(0.0).toVar();
    for (let i = 0; i < Math.min(2, count); i += 1) {
      const a = wavesA.element(i).toVar();
      const b = wavesB.element(i).toVar();
      const phaseFrame = spatialPhaseFrame(i, a.xy, restXZ, nearshore);
      const theta = a.w.mul(phaseFrame.coordinate).sub(a.z.mul(time)).add(b.y).toVar();
      height.addAssign(b.x.mul(sin(theta)));
    }
    return height;
  };

  // 0..1 cycle of the dominant crest at the rest shoreline. Cycle zero is
  // the instant that crest reaches the shoreline, so the breaker can hand
  // directly into uprush instead of looking like an unrelated animation.
  const primarySwellCycle = (time) => {
    const a = wavesA.element(0).toVar();
    const b = wavesB.element(0).toVar();
    return fract(a.z.mul(time).sub(b.y).add(Math.PI * 0.5).div(Math.PI * 2));
  };

  // Analytic surface frame at the rest position plus the 0..1 crest factor
  // used for whitecap foam (GLSL `out float crest` → returned alongside).
  const gerstnerNormalFiltered = (restXZ, time, chopWeight, nearshore = null) => {
    const tangent = vec3(1.0, 0.0, 0.0).toVar();
    const bitangent = vec3(0.0, 0.0, 1.0).toVar();
    const crestSum = float(0.0).toVar();
    const crestTotal = float(1e-4).toVar();
    for (let i = 0; i < count; i += 1) {
      const a = wavesA.element(i).toVar();
      const b = wavesB.element(i).toVar();
      const direction = a.xy;
      const omega = a.z;
      const waveNumber = a.w;
      const amplitude = (i < 2 ? b.x : b.x.mul(chopWeight)).toVar();
      const phase = b.y;
      const steepness = b.z;
      const crestWeight = b.w;
      const phaseFrame = spatialPhaseFrame(i, direction, restXZ, nearshore);
      const theta = waveNumber.mul(phaseFrame.coordinate)
        .sub(omega.mul(time)).add(phase).toVar();
      const sinTheta = sin(theta).toVar();
      const cosTheta = cos(theta).toVar();
      // Shortening wavelength must not amplify horizontal compression.
      // Match the orbital reduction in the displacement evaluation.
      const localSteepness = steepness.div(max(length(phaseFrame.gradient), 1.0));
      const waveKA = waveNumber.mul(amplitude).toVar();
      const phaseGradient = phaseFrame.gradient;
      const orbitDirection = phaseFrame.orbitDirection;
      tangent.x.subAssign(
        localSteepness.mul(orbitDirection.x).mul(phaseGradient.x).mul(waveKA).mul(sinTheta),
      );
      tangent.y.addAssign(phaseGradient.x.mul(waveKA).mul(cosTheta));
      tangent.z.subAssign(
        localSteepness.mul(orbitDirection.y).mul(phaseGradient.x).mul(waveKA).mul(sinTheta),
      );
      bitangent.x.subAssign(
        localSteepness.mul(orbitDirection.x).mul(phaseGradient.y).mul(waveKA).mul(sinTheta),
      );
      bitangent.y.addAssign(phaseGradient.y.mul(waveKA).mul(cosTheta));
      bitangent.z.subAssign(
        localSteepness.mul(orbitDirection.y).mul(phaseGradient.y).mul(waveKA).mul(sinTheta),
      );
      const crestPeak = sinTheta.mul(0.5).add(0.5).toVar();
      crestSum.addAssign(crestWeight.mul(amplitude).mul(crestPeak).mul(crestPeak));
      crestTotal.addAssign(crestWeight.mul(amplitude));
    }
    return {
      crest: clamp(crestSum.div(crestTotal), 0.0, 1.0).toVar(),
      normal: normalize(cross(bitangent, tangent)).toVar(),
    };
  };

  const gerstnerNormal = (restXZ, time) => gerstnerNormalFiltered(restXZ, time, float(1.0));

  return {
    gerstnerDisplacement,
    gerstnerDisplacementFiltered,
    gerstnerNormal,
    gerstnerNormalFiltered,
    gerstnerSwellHeight,
    primarySwellCycle,
  };
}
