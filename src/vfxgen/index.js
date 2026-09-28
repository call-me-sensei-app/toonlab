// Gameplay-VFX cluster — event-driven combat/movement effects, organized by
// category (weapon / magic / movement). Entry point: createVfxSystem
// (vfxSystem.js). core/vfxRandom.js is deliberately NOT re-exported (its
// names would collide with ambientfx/fauna on the root package surface).
export * from './vfxSettings.js';
export * from './vfxPresets.js';
export * from './vfxEffectDocuments.js';
export * from './vfxSourceAssets.js';
export * from './vfxSourceRuntime.js';
export * from './vfxShapeProfiles.js';
export * from './vfxEnergyMotion.js';
export * from './vfxTemplates.js';
export * from './vfxSystem.js';
export { BURST_KIND, GROUP_FOR_BURST_KIND, createBurstBackbone } from './core/burstBackbone.js';
export { createChargedShotCore } from './core/chargedShotCore.js';
export { createTrailRibbon } from './core/trailRibbon.js';
export {
  DEFAULT_GLOW_RING_SETTINGS,
  createGlowRing,
  createGlowRingSettings,
} from './core/glowRing.js';
export {
  DEFAULT_MOTION_TRAIL_SETTINGS,
  createMotionTrailSettings,
  createMotionTrails,
} from './core/motionTrails.js';
export { createProjectileCore } from './core/projectileCore.js';
export { emitImpact, emitSlashSparkle } from './effects/weaponEffects.js';
export { emitFireballEmbers, emitFireballExplosion } from './effects/magicEffects.js';
export {
  emitChargedShotExpiration,
  emitChargedShotImpact,
  emitChargedShotTrail,
} from './effects/chargedShotEffects.js';
export { emitFootstep, emitLanding } from './effects/movementEffects.js';
export { createStylizedWeapon, getWeaponOptions, WEAPON_IDS } from './weapons/stylizedWeapons.js';
export {
  collectMoveEvents, getMove, getMoveOptions, MOVE_IDS, moveDuration, sampleMovePose,
} from './moves/moveLibrary.js';
export { createMoveController } from './moves/moveController.js';
