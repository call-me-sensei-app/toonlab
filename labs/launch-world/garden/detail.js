// Stillwater Garden — the near-field detail pass (PROP-GDN-03).
//
// WHY THIS FILE EXISTS, STATED AS THE DEFECT IT ANSWERS
//
// Graded against the Ananta plates, roughly 45% of the hero frame was
// undifferentiated grass carrying no information. Every reference plate uses its
// foreground for OCCLUDERS WITH DETAIL — something close, something with edges,
// something a person put there. And every one of them carries evidence that the
// place has been used, even with nobody in frame.
//
// Thirty-two props were already built and mounted by nobody. So this is not new
// content: it is the PROP-GDN-03 kit — split-granite path edging, five planters,
// the deer-scarer and the arched footbridge — placed into the bands that were
// empty. `dressing.js` owns the PROP-GDN-01/02 furniture (lanterns, tsukubai,
// bamboo screen) and is untouched; this is a second, later pass over the same
// surface runtime, kept separate so the two can be reasoned about apart.
//
// PLACEMENT RULE, THROUGHOUT: every object answers something. A planter marks a
// path edge or a corner, edging states where the paving stops, the deer-scarer
// stands where water arrives, the bridge crosses where the pond narrows. A
// scatter of props in a garden reads as litter; that is the failure this file is
// one edit away from at all times.

import * as THREE from 'three';

import {
  GARDEN_PATH_EDGING,
  gardenProp,
  loadGardenProp,
} from '../../shared/stillwaterGardenProps.js';

import { PATH, WATER_LEVEL, gardenHeight, pondQ } from './terrain.js';

/**
 * Planters. Five distinct forms, each sited against something.
 *
 * The first three sit in the HERO FOREGROUND — 8 to 12 m from the hero eye, on
 * the near side of the stone path, which is exactly the band the parity read
 * called dead space. They are 0.45-0.75 m objects at 10 m: big enough to carry
 * an edge and a cast shadow, small enough not to become the subject.
 *
 * `[id, x, z, yawDegrees, lod]`
 */
const PLANTERS = Object.freeze([
  ['planter-cylinder', -3.6, 11.4, 24, 0],
  ['planter-bowl', 1.7, 10.6, 0, 0],
  ['planter-pot', 2.6, 11.8, 68, 0],
  // The far pair, marking the terrace approach and the gravel court's east lip.
  ['planter-box', 7.9, -0.6, 196, 1],
  ['planter-trough', -7.4, 4.1, 112, 1],
]);

/**
 * The two features.
 *
 * The deer-scarer stands where water arrives, beside the tsukubai group that
 * `dressing.js` already sets at (6.15, -1.75) — the two are one arrangement and
 * placing them apart would make both read as ornaments.
 *
 * The bridge crosses the pond's east neck, on the bearing where `pondUnitRadius`
 * carries its deliberate pinch — the shallow neck the stepping-stone run already
 * uses. A bridge over the widest part of a pond is a bridge nobody would build.
 */
const FEATURES = Object.freeze([
  ['shishi-odoshi', 5.15, -2.95, 232, 0],
  ['bridge', 1.05, -2.35, 152, 0],
]);

/**
 * Builds the near-field detail.
 *
 * Called BEFORE the style bundle, like every other prop set in this scene, so
 * scene-label discovery visits these materials in the same pass.
 *
 * @param {object} options
 * @param {number} options.shadowFill      the scene's authored fill (D19-062)
 * @param {number[]} options.shadowFillTint
 * @param {(stage: string) => void} [options.onProgress]
 */
export async function createGardenDetail({
  shadowFill = 0.35,
  shadowFillTint = [1.16, 1.0, 0.86],
  onProgress = () => {},
}) {
  const group = new THREE.Group();
  group.name = 'Stillwater Garden · Near-field detail';
  const census = { edging: 0, planters: 0, features: 0 };
  let surfaceLightingMaterialCount = 0;

  const mount = async (record, { x, z, yaw, lod, y = null }) => {
    const loaded = await loadGardenProp(record, { lod, shadowFill, shadowFillTint });
    surfaceLightingMaterialCount += loaded.surfaceLightingMaterialCount;
    loaded.root.position.set(x, y ?? gardenHeight(x, z) - 0.02, z);
    loaded.root.rotation.y = THREE.MathUtils.degToRad(yaw);
    group.add(loaded.root);
    return loaded;
  };

  // --- Path edging ---------------------------------------------------------
  //
  // Doc 20 asks for a READABLE stone route. A paving band with no edge reads as
  // a texture change; a granite kerb bar along it reads as a built path, and it
  // is what makes the walking line legible from the gate.
  //
  // Stepped along the path's OWN curve frame at ±0.95 m — just outside the
  // 0.95/1.45 m paving ramp `roleWeights` paints — so the bars sit on the joint
  // rather than on the paving or out in the moss. All six forms alternate so no
  // two neighbours repeat (§13), and the run stops at t = 0.62 where the path
  // reaches the terrace and the paving widens.
  onProgress('Edging the stone path');
  {
    const bars = PATH.stepAlong({
      alongRange: [0.04, 0.62],
      heightAt: gardenHeight,
      jitterAlong: 0.06,
      jitterOffset: 0.05,
      offset: 0.95,
      seed: 6_601,
      spacing: 1.02,
    });
    const inner = PATH.stepAlong({
      alongRange: [0.06, 0.6],
      heightAt: gardenHeight,
      jitterAlong: 0.06,
      jitterOffset: 0.05,
      offset: -0.95,
      seed: 6_733,
      spacing: 1.02,
    });
    for (const [index, bar] of [...bars, ...inner].entries()) {
      const record = GARDEN_PATH_EDGING[index % GARDEN_PATH_EDGING.length];
      const loaded = await mount(record, {
        x: bar.x,
        z: bar.z,
        // Square to the run. `heading` is a yaw with 0 == +Z, and a bar's long
        // axis is its local X, so y = heading - 90 (the same solve the bamboo
        // fence uses in dressing.js).
        yaw: (bar.heading * 180) / Math.PI - 90,
        lod: 1,
      });
      loaded.root.name = `path-edging-${index}`;
      census.edging += 1;
    }
  }

  // --- Planters ------------------------------------------------------------
  onProgress('Setting the planters');
  for (const [id, x, z, yaw, lod] of PLANTERS) {
    const record = gardenProp(id);
    if (!record) continue;
    await mount(record, { x, z, yaw, lod });
    census.planters += 1;
  }

  // --- The two features ----------------------------------------------------
  onProgress('Setting the deer-scarer and the bridge');
  for (const [id, x, z, yaw, lod] of FEATURES) {
    const record = gardenProp(id);
    if (!record) continue;
    // The bridge spans water, so it is quoted against the WATERLINE rather than
    // against the bed under it — `gardenHeight` at the neck is a metre below the
    // surface and grounding on it would sink the deck.
    const overWater = pondQ(x, z) < 1.05;
    await mount(record, {
      x, z, yaw, lod, y: overWater ? WATER_LEVEL - 0.12 : null,
    });
    census.features += 1;
  }

  return {
    group,
    census: Object.freeze({ ...census }),
    // ASSERTED by the caller (D19-150 / D-018c), never eyeballed.
    surfaceLightingMaterialCount,
  };
}
