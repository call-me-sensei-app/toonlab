// Stylized water module barrel. Import from '@call-me-sensei/toonlab/water'.
//
// Quick start:
//   import { WaterSurface } from '@call-me-sensei/toonlab/water';
//   const water = new WaterSurface({ width: 20, depth: 20, preset: 'lake' });
//   water.position.y = 0.4;
//   scene.add(water);
//   // each frame, before renderer.render(scene, camera):
//   water.update(renderer, scene, camera, delta);

export * from './waterSettings.js';
export * from './sceneOverrideLayers.js';
export * from './waterMaterial.js';
export * from './waterCurrentField.js';
export * from './waterNearshorePhase.js';
export * from './waterRippleSimulation.js';
export * from './waterSplashSystem.js';
export * from './waterBreakerSystem.js';
export * from './waterScenePasses.js';
export * from './waterInteraction.js';
export * from './waterSurface.js';
export * from './waterShoreStateField.js';
export * from './waterShoreMaterial.js';
export * from './waterStageSettings.js';
export * from './waterRain.js';
export * from './waterVegetation.js';
export * from './waterUnderwaterAtmosphere.js';
