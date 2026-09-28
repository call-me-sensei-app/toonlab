// FILL-006 barrel. The import surface a scene owner mounts.
//
//   import { createCrowdPopulation, STILLWATER_GARDEN_FIGURE }
//     from '../crowd/index.js';
//
//   const crowd = await createCrowdPopulation({
//     parent: scene, renderer,
//     placements: STILLWATER_GARDEN_FIGURE,
//     heightAt: gardenHeight,
//     toon: { preset: 'call_me_sensei' },
//   });
//   // in the frame loop:  crowd.update(delta);
//
// Nothing in here reaches into a scene module, so mounting is additive and the
// scene owner's files stay untouched.

export { createCrowdPopulation } from './crowdRuntime.js';
export {
  CROWD_ACTIVITY_CLIPS,
  CROWD_FIGURES,
  CROWD_FIGURES_BY_ID,
  CROWD_PALETTE_COLORS,
  CROWD_PALETTE_NAMES,
} from './figureLibrary.js';
export {
  STILLWATER_GARDEN_FIGURE,
  buildReviewPlacements,
  groundHeightAt as crowdLabGroundHeightAt,
} from './placements.js';
export {
  FigureParts,
  createBindRig,
  createFigurePalette,
  mulberry32,
} from './figureParts.js';
