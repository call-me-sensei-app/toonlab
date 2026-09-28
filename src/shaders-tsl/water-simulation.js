// TSL port of src/shaders/waterSimulation.vert.glsl + waterSimulation.frag.glsl
// — the fullscreen ripple heightfield simulation material (ping-pong render
// targets, decision D3: stays fragment-based, no compute).
// State texture: R = height, G = vertical velocity, B = foam energy.
//
// Porting notes (docs/tsl-conventions.md):
// - The GLSL early return (region shift moving the source uv off the state)
//   becomes var + If — the fragment root stays a plain vec4 var.
// - uPrevState is the RT being ping-ponged: every sample is .level(0).
// - The impulse loop (WATER_SIM_MAX_IMPULSES) unrolls at graph build; the
//   `i >= uImpulseCount break` / `distanceSq > 4 continue` guards become
//   nested Ifs (impulses are packed from slot 0, so the guard is equivalent).
// - uImpulses is a uniformArray (vec4 slots, GLSL layout preserved).

import * as THREE from 'three';
import {
  abs,
  dot,
  exp,
  clamp,
  Fn,
  If,
  max,
  min,
  mix,
  positionGeometry,
  pow,
  smoothstep,
  texture,
  uniform,
  uniformArray,
  uv,
  vec2,
  vec4,
} from 'three/tsl';
import { NodeMaterial } from 'three/webgpu';

import { waterArrayUniformEntry } from './water.js';

let fallbackStateTexture = null;
function getFallbackStateTexture() {
  if (!fallbackStateTexture) {
    fallbackStateTexture = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat);
    fallbackStateTexture.needsUpdate = true;
  }
  return fallbackStateTexture;
}

export function createWaterSimulationNodeMaterial({ maxImpulses, resolution }) {
  // uImpulses[i] = (centerU, centerV, worldRadius, strength)
  const impulsesNode = uniformArray(
    Array.from({ length: maxImpulses }, () => new THREE.Vector4()), 'vec4',
  );
  const u = {
    uPrevState: texture(getFallbackStateTexture()),
    uTexel: uniform(new THREE.Vector2(1 / resolution, 1 / resolution)),
    uDelta: uniform(1 / 120),
    uPropagation: uniform(1),
    uDamping: uniform(0.985),
    uHeightRelaxation: uniform(0.9985),
    uFoamDecay: uniform(0.94),
    uFoamGain: uniform(2.4),
    uRegionShiftTexels: uniform(new THREE.Vector2(0, 0)),
    uRegionWorldSize: uniform(new THREE.Vector2(20, 20)),
    uImpulseCount: uniform(0, 'int'),
    // Array uniform wrapper: `.value[i].set(...)` writes land on the node's
    // authoring array (see waterArrayUniformEntry).
    uImpulses: waterArrayUniformEntry(impulsesNode),
  };

  const material = new NodeMaterial();
  material.name = 'WaterRippleSimulation';
  material.lights = false;
  material.fog = false;
  material.depthTest = false;
  material.depthWrite = false;

  // Fullscreen pass: clip position straight from the quad's xy.
  material.vertexNode = Fn(() => vec4(positionGeometry.xy, 0.0, 1.0))();

  const vUv = uv();

  material.fragmentNode = Fn(() => {
    const result = vec4(0.0, 0.0, 0.0, 1.0).toVar();

    // Texel-aligned region shift so the simulation window can follow a
    // character while ripples stay put in world space.
    const sourceUv = vUv.add(u.uRegionShiftTexels.mul(u.uTexel)).toVar();
    const inRange = sourceUv.x.greaterThanEqual(0.0).and(sourceUv.x.lessThanEqual(1.0))
      .and(sourceUv.y.greaterThanEqual(0.0)).and(sourceUv.y.lessThanEqual(1.0));
    If(inRange, () => {
      const state = u.uPrevState.sample(sourceUv).level(0).rgb.toVar();
      const height = state.r.toVar();
      const velocity = state.g.toVar();
      const foam = state.b.toVar();

      const left = u.uPrevState.sample(sourceUv.sub(vec2(u.uTexel.x, 0.0))).level(0).r;
      const right = u.uPrevState.sample(sourceUv.add(vec2(u.uTexel.x, 0.0))).level(0).r;
      const down = u.uPrevState.sample(sourceUv.sub(vec2(0.0, u.uTexel.y))).level(0).r;
      const up = u.uPrevState.sample(sourceUv.add(vec2(0.0, u.uTexel.y))).level(0).r;
      const laplacian = left.add(right).add(up).add(down).sub(height.mul(4.0));

      velocity.addAssign(laplacian.mul(u.uPropagation).mul(u.uDelta));
      velocity.mulAssign(pow(u.uDamping, u.uDelta.mul(60.0)));

      for (let i = 0; i < maxImpulses; i += 1) {
        If(u.uImpulseCount.greaterThan(i), () => {
          const impulse = impulsesNode.element(i).toVar();
          const delta = vUv.sub(impulse.xy).mul(u.uRegionWorldSize).div(max(impulse.z, 1e-4));
          const distanceSq = dot(delta, delta).toVar();
          If(distanceSq.lessThanEqual(4.0), () => {
            const falloff = exp(distanceSq.mul(-3.0)).toVar();
            velocity.addAssign(impulse.w.mul(falloff));
            height.subAssign(impulse.w.mul(falloff).mul(0.12));
          });
        });
      }

      height.addAssign(velocity.mul(u.uDelta));
      height.mulAssign(pow(u.uHeightRelaxation, u.uDelta.mul(60.0)));

      // Absorbing border so waves never bounce off the region edge.
      const borderDistance = min(vUv, vUv.oneMinus()).toVar();
      const border = smoothstep(0.0, 0.05, min(borderDistance.x, borderDistance.y)).toVar();
      height.mulAssign(mix(0.9, 1.0, border));
      velocity.mulAssign(mix(0.82, 1.0, border));

      foam.assign(foam.mul(pow(u.uFoamDecay, u.uDelta.mul(60.0)))
        .add(abs(velocity).mul(u.uFoamGain).mul(u.uDelta)));
      foam.assign(clamp(foam, 0.0, 1.5));

      result.assign(vec4(height, velocity, foam, 1.0));
    });

    return result;
  })();

  material.uniforms = u;
  return material;
}
