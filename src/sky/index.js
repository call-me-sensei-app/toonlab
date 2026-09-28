// Sky barrel. Import from '@call-me-sensei/toonlab/sky'.
//
// One `export *` per module, each module exported exactly once. Two modules
// sharing a name does not error here — the ambiguous binding silently vanishes
// from the namespace object, and a direct named import of it is a hard
// `SyntaxError: conflicting star exports`. So every addition below is checked
// against the rest rather than assumed safe, and each param group has exactly
// one owner per docs/sky-cloud-parameters.md "Module ownership".
//
// Deliberately NOT exported:
//   skyQuality.js            SKY_QUALITY_TIERS, SKY_QUALITY_OPTIONS and
//   sceneOverrideLayers.js   resolveSkyQuality / SKY_SCENE_OVERRIDE_PRIORITIES
//                            are also exported by the legacy stylizedSky.js
//                            below. Adding either file would silently drop those
//                            four names. The rebuild's replacements are
//                            skyQualityTiers.js and renderLayers.js.
//   skyDayCycle.js           reaches the package root through src/index.js.

// --- legacy stylized sky: replaced by the modules below, still consumed by ---
// src/styles/styleBundle.js and src/stylizedWorld.js until the migration task.
export * from './stylizedSky.js';
export * from './skyShaderSettings.js';
export * from './skyTimeKeyframes.js';
export * from './atmosphereSky.js';

// --- the volumetric rebuild -------------------------------------------------

// The SkyParams envelope: validate / serialize / round-trip. Owns the envelope
// and none of the groups inside it.
export * from './skyParams.js';

// Param-group owners.
export * from './atmosphereParams.js';   // atmosphere
export * from './skyColor.js';           // atmosphere.style
export * from './sunDriver.js';          // sun (+ the direction solver/driver)
export * from './timeOfDay.js';          // time, including the nested moon block
export * from './godRays.js';            // godRays
export * from './nightSky.js';           // nightSky

// Atmosphere implementation: precomputed scattering tables and the sky dome.
export * from './atmosphereScattering.js';
export * from './atmosphereDome.js';

// Quality tiers (march budgets, cloud-shadow and env-map sizing, baseShapeDims)
// and the render-order layer map.
export * from './skyQualityTiers.js';
export * from './renderLayers.js';

// The eight shipped looks. Owns no param group — every entry is a complete
// SkyParams built from the groups above.
export * from './skyPresets.js';
export * from './skyStyleSnapshots.js';

// The orchestrator. Exported last because it composes every module above it,
// plus the cloud subsystem, and owns nothing they own.
export * from './skySystem.js';
