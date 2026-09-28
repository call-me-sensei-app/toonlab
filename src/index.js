export * from './version.js';
export * from './toon/toonMaterialAdapter.js';
export * from './toon/toonSettings.js';
export * from './toon/characterRenderPasses.js';
export * from './environment/environmentMaterialAdapter.js';
export * from './environment/environmentSettings.js';
export * from './environment/environmentAmbientProbe.js';
export * from './environment/environmentPlanarReflection.js';
export * from './environment/environmentPresets.js';
export * from './environment/environmentRigs.js';
export * from './environment/environmentTimeOfDay.js';
export * from './environment/environmentState.js';
export * from './environment/dayCurves.js';
export * from './environment/toonLabSourceLibrary.js';
export * from './environment/toonLabSourceMaterials.js';
export * from './environment/surfaceMaterialModes.js';
export * from './environment/toonLabRockMaterialResolver.js';
export * from './post/postProcessing.js';
export * from './post/postGenerator.js';
export * from './water/water.js';
// The sky and cloud subsystems come in through their own barrels rather than
// module by module. verify-public-api.mjs asserts the root mirrors './sky' and
// './cloud' exactly, and hand-listing each module meant every new one had to be
// added in two places or the root silently fell behind its own barrel.
export * from './sky/index.js';
export * from './sky/skyDayCycle.js';
export * from './cloud/index.js';
export * from './styles/index.js';
export * from './lighting/index.js';
export * from './asset-policy/index.js';
export * from './agents/index.js';
export * from './vegetation/index.js';
export * from './character/index.js';
export * from './renderer/index.js';
export * from './runtime/index.js';
export * from './rock-shader/index.js';
export * from './ground-shader/index.js';
export * from './rockgen/index.js';
export * from './worldCollision.js';
export * from './catalog/officialCatalog.js';

// --- names two `export *` clusters above both declare --------------------
//
// An `export *` name that arrives from two modules is not an error here: the
// ambiguous binding is silently omitted from the namespace object, so the
// symbol simply stops existing at the package root while both subpaths keep
// publishing it. Six names were being dropped that way, and nothing reported
// it. Each is republished below under a domain-qualified alias.
//
// Aliases rather than picking a winner, because in two of the three pairs the
// implementations genuinely differ and a bare name would silently hand a caller
// the other domain's semantics. Nothing is renamed for existing callers: none
// of these six resolved at the root before this block, and the subpaths
// (`/toon`, `/environment`, and the fauna / ambientfx clusters) still export
// every one of them under its original name.

// `usesAlphaCutout` differs by more than provenance: the character one takes
// (mat, roleInfo, settings) and honours the toon alpha policy, the environment
// one takes (mat) and classifies from material/texture naming. `sourceOpacity`
// happens to be identical in both, and is aliased alongside its partner so the
// pair stays readable as one decision.
export {
  sourceOpacity as toonSourceOpacity,
  usesAlphaCutout as toonUsesAlphaCutout,
} from './toon/settings/alphaSettings.js';
export {
  sourceOpacity as environmentSourceOpacity,
  usesAlphaCutout as environmentUsesAlphaCutout,
} from './environment/environmentMaterialClassifier.js';
