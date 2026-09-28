// World-anchored persistent shoreline state shared by water foam and wet
// terrain materials. RGBA = moisture, surface film, active foam, residue.

import {
  clamp,
  float,
  mix,
  smoothstep,
  vec2,
} from 'three/tsl';

export function createWaterShoreStateChunk({ u }) {
  const shoreStateUv = (worldXZ) => worldXZ
    .sub(u.uShoreStateRegion.xy)
    .div(u.uShoreStateRegion.zw.mul(2.0))
    .add(0.5);

  const shoreStateSample = (worldXZ) => {
    const fieldUv = shoreStateUv(worldXZ).toVar();
    // Fade over two percent of the atlas instead of revealing a rectangular
    // edge when a world uses a finite shore-state tile.
    const border = smoothstep(vec2(0.0), vec2(0.02), fieldUv)
      .mul(smoothstep(vec2(0.98), vec2(1.0), fieldUv).oneMinus());
    const side = mix(border.x,1.0,u.uContinueShoreAlongX ?? float(0));
    const mask = side.mul(border.y).mul(u.uUseShoreState).toVar();
    return u.uShoreStateMap
      .sample(clamp(fieldUv, vec2(0.0), vec2(1.0)))
      .level(0)
      .mul(mask)
      .toVar();
  };

  const shoreStateCoverage = (worldXZ) => {
    const fieldUv = shoreStateUv(worldXZ).toVar();
    const border = smoothstep(vec2(0.0), vec2(0.02), fieldUv)
      .mul(smoothstep(vec2(0.98), vec2(1.0), fieldUv).oneMinus());
    return mix(border.x,1.0,u.uContinueShoreAlongX ?? float(0)).mul(border.y).mul(u.uUseShoreState).toVar();
  };

  return { shoreStateCoverage, shoreStateSample, shoreStateUv };
}
