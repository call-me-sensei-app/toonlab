// Volumetric cloud barrel. Import from '@call-me-sensei/toonlab/cloud'.
//
// docs/sky-cloud-parameters.md describes the public cloud system. The current
// raymarcher is configured through `cloud.shape` and `cloud.lighting` on a
// SkyParams document; legacy flat cloud settings are not part of this barrel.
//
// The volumetric surface below is one `export *` per module, each exported
// exactly once. Two modules sharing a name does not error at the barrel — the
// ambiguous binding silently disappears from the namespace object — so a new
// entry here has to be checked against the others rather than assumed safe.
//
// Intentionally NOT exported, and reachable through their importers instead:
//   paramSchema.js            shared descriptor/normalizer plumbing for both
//                             param layers. Its helpers are generically named
//                             (num, col, bool, hasValue, isObject, describe),
//                             and src/index.js flattens this barrel into the
//                             package root where names that generic would be a
//                             standing collision hazard.
//   noise/periodicNoise3.js   periodic Perlin/Worley primitives, and
//   noise/noiseVolume.js      the Data3DTexture wrapper — both internal to
//                             src/cloud/noise/ per their author's note.

// Cloud parameters: the six spec param groups (shape, lighting, wind, cirrus,
// haze, fade) and their sole definition.
export * from './cloudParams.js';
export * from './cloudStyle.js';
export * from './cloudStyleSnapshots.js';
export * from './heroCloudRecipe.js';

// Procedural generation for the raymarcher's volumes and coverage field.
export * from './noise/baseShapeVolume.js';
export * from './noise/cirrusMap.js';
export * from './noise/erosionVolume.js';
export * from './noise/weatherMap.js';
export * from './noise/curlNoise.js';

// The raymarcher: the scattering model, the marcher, and the temporal
// reconstruction that lets a quality tier march fewer rays without changing the
// fixed 128-primary / 6-light budget per ray.
export * from './cloudLighting.js';
export * from './cloudVolume.js';
export * from './cloudReprojection.js';
