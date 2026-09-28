// Procedural rock/cliff/mountain generator barrel. Import from
// '@call-me-sensei/toonlab/rockgen'. The settings schema reuses Texture Lab's
// built-in material identities for source-GLB PBR selection; geometry remains
// independent from the rock-shader domain and environment AO baker.
export * from './rockDocument.js';
export * from './rockHelpers.js';
export * from './rockgenPresets.js';
export * from './rockgenSettings.js';
export * from './heightfield/heightfieldErosion.js';
export * from './heightfield/stylizedErosionSim.js';
export * from './sdf/fieldCompiler.js';
export * from './sdf/sculptEdits.js';
export * from './mesh/meshDocument.js';
export * from './lod/index.js';
export * from './export/glbExport.js';
export * from './surface/c7GeologySurface.js';

// Public names for the realistic material library; stored schema IDs stay compatible.
export {
  C8_FIRST12_LITHOLOGY_PROFILES as NATURAL_ROCK_SURFACE_PROFILES,
  C8_FIRST12_MAP_ROLES as NATURAL_ROCK_MAP_ROLES,
  createC8First12GeologyMapData as createNaturalRockMapData,
  createC8First12SurfaceSpecification as createNaturalRockSurfaceSpecification,
  resolveC8First12Projection as resolveNaturalRockProjection,
} from './surface/naturalRockSurface.js';
