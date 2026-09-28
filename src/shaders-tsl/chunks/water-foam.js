// TSL port of src/shaders/chunks/water-fragment-foam.glsl — shoreline contact
// foam, offset lapping foam lines, open-water whitecaps, and the shared toon
// shaping that gives foam its crisp dissolve-dot edge.
//
// foamOctaves is the GLSL WATER_FOAM_OCTAVES define (compile-time; the fbm
// loop unrolls at graph-build time). GLSL early returns become var + If.

import {
  clamp,
  float,
  fract,
  If,
  max,
  min,
  mix,
  smoothstep,
} from 'three/tsl';

import { waterFbm, waterToonStep, waterValueNoise } from './water-common.js';

export function createWaterFoamChunk({ u, foamOctaves }) {
  // Raw shoreline foam mask. The shoreline bands are driven by the vertical
  // water-column depth so they hug the shore identically from any camera
  // angle; a tight view-space silhouette band handles objects standing in the
  // water. `pierce` gates the contact bands to true waterline contacts.
  const shoreFoam = (columnDepth, viewDepthDiff, restXZ, time, pierce) => {
    const result = float(0.0).toVar();
    If(u.uUseSceneDepth.greaterThanEqual(0.5), () => {
      const flowOffset = u.uFlowDirection.mul(time).mul(u.uFlowSpeed).toVar();
      const breakup = waterFbm(restXZ.sub(flowOffset).mul(u.uFoamNoiseScale), foamOctaves).toVar();

      // A tight ungated core keeps a crisp waterline rim on any contact.
      const contactTight = smoothstep(0.0, min(u.uFoamContactDistance.mul(0.5), 0.07), columnDepth).oneMinus();
      const contactCore = max(
        smoothstep(0.0, u.uFoamContactDistance.mul(0.5), columnDepth).oneMinus().mul(pierce),
        contactTight,
      ).toVar();
      const contactHalo = smoothstep(0.0, u.uFoamContactDistance.mul(1.2), columnDepth).oneMinus()
        .mul(smoothstep(0.34, 0.66, breakup)).mul(0.4).mul(pierce).toVar();
      // The silhouette band additionally requires deep water below this pixel
      // so a floating body is not painted solid white from above.
      const silhouette = smoothstep(0.0, u.uFoamContactDistance.mul(0.4), viewDepthDiff).oneMinus()
        .mul(pierce)
        .mul(smoothstep(u.uFoamContactDistance.mul(0.6), u.uFoamContactDistance.mul(1.3), columnDepth))
        .toVar();

      // Lapping lines march toward the shore and dissolve into dashes.
      const lineDistance = columnDepth.div(max(u.uFoamLineSpacing, 1e-3))
        .add(breakup.sub(0.5).mul(0.7)).sub(time.mul(0.32));
      const lineBand = fract(lineDistance).toVar();
      const line = smoothstep(0.8, 0.93, lineBand)
        .mul(smoothstep(0.93, 1.0, lineBand).oneMinus()).toVar();
      const lineFalloff = smoothstep(1.3, 2.4, columnDepth.div(max(u.uFoamLineSpacing, 1e-3))).oneMinus();
      const dashes = waterValueNoise(restXZ.sub(flowOffset).mul(u.uFoamNoiseScale).mul(2.6));
      line.mulAssign(lineFalloff.mul(smoothstep(0.36, 0.6, breakup)).mul(smoothstep(0.3, 0.55, dashes)));

      result.assign(clamp(
        contactCore.mul(1.3).add(silhouette.mul(1.2)).add(contactHalo).add(line),
        0.0,
        1.0,
      ));
    });
    return result;
  };

  // Whitecaps on open water crests: driven by the Gerstner crest factor and
  // surface steepness, broken into patches, scaled by the storminess amount.
  const whitecaps = (crest, gerstnerNormalY, restXZ, time) => {
    const result = float(0.0).toVar();
    If(u.uWhitecapAmount.greaterThan(0.002), () => {
      const drift = u.uFlowDirection.mul(time).mul(u.uFlowSpeed);
      const patches = waterFbm(restXZ.sub(drift).mul(u.uFoamNoiseScale).mul(0.6), foamOctaves).toVar();
      const steepness = clamp(gerstnerNormalY.oneMinus().mul(9.0), 0.0, 1.0);
      const energy = crest.mul(steepness.mul(0.45).add(0.55)).mul(patches.mul(0.85).add(0.45)).toVar();
      const threshold = mix(float(0.985), float(0.32), clamp(u.uWhitecapAmount, 0.0, 1.0)).toVar();
      result.assign(smoothstep(threshold, threshold.add(0.22), energy));
    });
    return result;
  };

  // Shared toon shaping: a solid band plus a sparse dissolve-dot fringe so
  // foam edges read as hand-drawn dots rather than a soft alpha gradient.
  const foamShape = (rawMask, restXZ, time) => {
    const dotNoise = waterValueNoise(
      restXZ.sub(u.uFlowDirection.mul(time).mul(u.uFlowSpeed)).mul(u.uFoamNoiseScale).mul(5.2),
    );
    const solid = waterToonStep(0.56, 0.12, rawMask);
    const dots = waterToonStep(0.74, 0.06, rawMask.mul(dotNoise.mul(0.75).add(0.35)));
    return clamp(max(solid, dots), 0.0, 1.0);
  };

  return { foamShape, shoreFoam, whitecaps };
}
