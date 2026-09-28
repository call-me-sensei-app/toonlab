// Regression guard for the production-safety invariants of the signature
// world. These values are coupled deliberately: changing one in isolation can
// reintroduce pale fog, black shadows, putty cliffs, or dead flat lighting.

import assert from 'node:assert/strict';

import { resolveEnvironmentPreset } from '../src/environment/environmentPresets.js';
import { resolveRockgenPreset } from '../src/rockgen/rockgenPresets.js';
import { createWaterSettings } from '../src/water/waterSettings.js';
import { createStylizedTerrain } from '../src/stylizedTerrain.js';
import {
  CONTACT_SHADOW_AERIAL_FADE,
  combineMasks,
  createDensityWeightMask,
  createSlopeMask,
  createSurfaceWeightMask,
  createStylizedTreeSettings,
  deriveCanopyPalette,
  resolveVegetationShaderPreset,
  STYLIZED_FOREST_IMPOSTOR_QUALITY,
  TREE_RUNTIME_QUALITY_PROFILES,
  UNDERSTORY_AERIAL_FADE,
} from '../src/vegetation/index.js';
// The LOD compiler is repository-only. Keep this internal regression
// guard pointed at its owner instead of leaking the compiler through the
// stable public vegetation barrel.
import { TREE_LOD_TRIANGLE_CAPS } from '../src/vegetation/treeLodCompiler.js';
import { resolveWeatherPreset } from '../src/weather/weatherPresets.js';
import { resolveWorldPreset } from '../src/worldPresets.js';

const world = resolveWorldPreset('outdoorGameplay');
const environment = world.environment.overrides.parameters;
assert.ok(environment.ambientStrength >= 0.3, 'outdoor shade needs a nonzero ambient floor');
assert.ok(environment.sunShadowStrength <= 0.8, 'cast shadows must retain direct-light visibility');
assert.ok(environment.shadowTintColor[2] > environment.shadowTintColor[0], 'shadows must be sky-blue');
assert.ok(environment.heightFogDensity <= 0.0007, 'outdoor fog must not wash out aerial views');
assert.ok(environment.heightFogFalloff >= 200, 'height fog needs a world-scale vertical falloff');
assert.ok(environment.triplanarDetail >= 1, 'steep terrain must use triplanar detail by default');
assert.ok(environment.triplanarDetailScale >= 24, 'cliff texture scale must resist close-range moire');
assert.equal(world.vegetationShader.style, 'call_me_sensei');
assert.equal(world.water.preset, 'lake', 'world presets must keep the water body on the preset axis');
assert.equal(world.water.style, 'call_me_sensei', 'world presets must carry water identity on the style axis');
assert.equal(world.weather.preset, 'partlyCloudy', 'world presets must keep conditions on the preset axis');
assert.equal(world.weather.style, 'call_me_sensei', 'world presets must carry weather identity on the style axis');
assert.equal(world.rocks.preset, 'boulder', 'world presets must keep rock geometry on the preset axis');
assert.equal(world.rocks.style, 'call_me_sensei', 'world presets must carry rock identity on the style axis');
assert.ok(world.trees.canopyColors.length >= 6, 'forest palette needs curated green variation');
assert.ok(world.trees.lod.detailCount >= 120, 'near trees need a high-detail pool');
assert.ok(world.trees.lod.detailDistance >= 150, 'tree LOD must hold through gameplay range');
assert.ok(world.trees.scatter.spacing <= 7, 'forest canopy density must survive aerial views');
assert.ok(world.trees.scatter.radius >= 160, 'forest layering needs world-scale coverage');
assert.ok(world.grass.scatter.density * world.grass.settings.bladesPerClump >= 32,
  'close clump coverage must retain a dense effective blade count');
assert.ok(world.grass.scatter.maxCount * world.grass.settings.bladesPerClump >= 120000,
  'the bounded clump budget must retain the former meadow blade capacity');
assert.ok(world.grass.settings.bladeHeightRange[1] <= 0.55,
  'gameplay grass must not swallow a human character');
assert.equal(world.understory.enabled, true, 'signature world needs a middle vegetation layer');
assert.ok(world.understory.scatter.shrubsPerTree >= 1, 'understory must layer around canopy trees');
assert.ok(world.understory.scatter.maxShrubs <= 3000, 'understory needs a hard instancing budget');
assert.ok(world.contactShadows.opacity <= 0.18, 'contact pools must remain soft and luminous');
assert.ok(CONTACT_SHADOW_AERIAL_FADE.start < 0.4 && CONTACT_SHADOW_AERIAL_FADE.end < 0.75,
  'contact pools must disappear before minifying into aerial dirt');
assert.ok(UNDERSTORY_AERIAL_FADE.start < 0.35 && UNDERSTORY_AERIAL_FADE.end <= 0.5,
  'understory must disappear before tiny shaded plants become aerial dirt');

const grassSurfaceMask = createSurfaceWeightMask({
  threshold: 0.4,
  weightAt: (x) => (x < 0 ? 0.39 : 0.8),
});
assert.equal(grassSurfaceMask(-1, 0), false,
  'surface-weight masks must reject painted rock/dirt below the authored threshold');
assert.equal(grassSurfaceMask(1, 0), true,
  'surface-weight masks must retain authored meadow weights');
const flatHeight = (x) => (x > 1 ? x : 0);
const placementMask = combineMasks(
  grassSurfaceMask,
  createSlopeMask({ heightAt: flatHeight, maxSlope: 0.6, sampleDistance: 0.5 }),
);
assert.equal(placementMask(-1, 0), false,
  'surface classification must remain authoritative on otherwise flat terrain');
assert.equal(placementMask(2, 0), false,
  'slope rejection must remain active even where a grass layer is painted');

const densityMask = createDensityWeightMask({
  seed: 8045,
  weightAt: (x) => (x < -1 ? 0 : x > 1 ? 1 : 0.5),
});
assert.equal(densityMask(-2, 0), false,
  'density-weight masks must keep zero-coverage biome regions empty');
assert.equal(densityMask(2, 0), true,
  'density-weight masks must retain full-coverage biome regions');
const halfDensity = Array.from({ length: 400 }, (_, index) => densityMask(0, index / 7));
const retainedHalfDensity = halfDensity.filter(Boolean).length;
assert.ok(retainedHalfDensity > 150 && retainedHalfDensity < 250,
  'density-weight masks must turn a half-weight transition into natural thinning');
assert.deepEqual(halfDensity,
  Array.from({ length: 400 }, (_, index) => densityMask(0, index / 7)),
  'density-weight masks must be deterministic for repeatable captures');

assert.equal(STYLIZED_FOREST_IMPOSTOR_QUALITY.representation, 'instanced-low-poly',
  'far trees must use camera-independent volumetric proxies, never flat color billboards');
assert.equal(STYLIZED_FOREST_IMPOSTOR_QUALITY.microdetail, 'volumetric-crown',
  'far LODs must discard dirty near-leaf microdetail');
assert.ok(STYLIZED_FOREST_IMPOSTOR_QUALITY.maxTrianglesPerTree <= 140,
  'volumetric far trees need a strict geometry budget');
assert.ok(STYLIZED_FOREST_IMPOSTOR_QUALITY.colorFloor[1]
  > STYLIZED_FOREST_IMPOSTOR_QUALITY.colorFloor[2], 'far-tree shadow floor must stay green');
assert.deepEqual(TREE_LOD_TRIANGLE_CAPS, [12000, 7000, 3500, 140],
  'compiled tree levels must retain the authored launch budgets');
assert.deepEqual(TREE_RUNTIME_QUALITY_PROFILES.mobile,
  { detailedCount: 30, maxPlacements: 1500, variants: 3 },
  'mobile forest profile must stay within broad-range device budgets');
assert.deepEqual(TREE_RUNTIME_QUALITY_PROFILES.high,
  { detailedCount: 120, maxPlacements: 3000, variants: 8 },
  'desktop forest profile must retain the 3k/8/120 launch target');

const tree = createStylizedTreeSettings();
assert.equal(tree.tree.leafDensity, 1, 'neutral tree runtime must retain a usable canopy baseline');
assert.ok(tree.tree.trunkColor[0] > tree.tree.trunkColor[1]
  && tree.tree.trunkColor[1] > tree.tree.trunkColor[2], 'neutral bark must stay warm');

const rock = resolveRockgenPreset('boulder', { style: 'call_me_sensei' });
assert.equal(rock.surface.textureStyle, 'limestone', 'signature rocks need a geological material');
assert.ok(rock.surface.textureStrength >= 0.5, 'limestone banding must survive gameplay distance');
assert.ok(rock.piece.strata.enabled, 'signature rocks need physical sediment grooves');
assert.ok(rock.surface.cavityColor[0] < rock.surface.baseColor[0] * 0.55,
  'limestone crevices need readable value separation');
assert.ok(rock.surface.mossCoverage >= 0.25, 'signature hero rocks need ledge moss');

const terrain = createStylizedTerrain({ detailTexture: false, segments: 48, size: 320, seed: 771 });
assert.equal(terrain.archetype, 'lushKarst', 'default morphology should be meadow with karst outcrops');
assert.equal(terrain.landmarks.length, 1, 'default lush worlds need a horizon scale anchor');
const terrainAo = terrain.mesh.geometry.attributes.envVertexAo;
assert.ok(terrainAo && terrainAo.count > 0, 'terrain must ship generation-time vertex AO');
let minTerrainAo = 1;
for (let i = 0; i < terrainAo.count; i += 1) minTerrainAo = Math.min(minTerrainAo, terrainAo.getX(i));
assert.ok(minTerrainAo >= 0.75, 'terrain AO must ground cavities without crushing them');
terrain.dispose();

const signatureEnvironment = resolveEnvironmentPreset('call_me_sensei');
assert.ok(signatureEnvironment.parameters.ambientStrength >= 0.3);
assert.ok(signatureEnvironment.parameters.heightFogDensity <= 0.0007);
assert.ok(signatureEnvironment.parameters.cloudShadowStrength >= 0.45);
assert.ok(signatureEnvironment.parameters.triplanarDetailScale >= 24);

const vegetation = resolveVegetationShaderPreset('call_me_sensei');
assert.ok(vegetation.lighting.shadowTint[2] >= 0.9, 'vegetation shadow tint must stay luminous blue');
assert.ok(vegetation.lighting.shadowTintStrength <= 0.5, 'shadow tint must not crush albedo');
assert.ok(vegetation.grass.shadowFloor >= 0.5, 'grass roots must not collapse to black');
assert.ok(vegetation.bark.shadowFloor >= 0.4 && vegetation.bark.shadowFloor <= 0.5,
  'canonical bark must retain grounding without returning to the retained-graph washout');
assert.ok(vegetation.foliage.cloudShadowResponse >= 0.6, 'trees must participate in living light');

const canopy = deriveCanopyPalette(0x4f9f43);
const litLuma = canopy.lit.r * 0.299 + canopy.lit.g * 0.587 + canopy.lit.b * 0.114;
const shadowLuma = canopy.shadow.r * 0.299 + canopy.shadow.g * 0.587 + canopy.shadow.b * 0.114;
assert.ok(shadowLuma / litLuma >= 0.55, 'derived canopy shadow tone must not become a black underside');

const weather = resolveWeatherPreset(world.weather.preset, { style: world.weather.style }).settings;
assert.ok(weather.atmosphere.cloudShadowStrength >= 0.4);
assert.ok(weather.atmosphere.cloudShadowCoverage >= 0.45);
assert.ok(weather.atmosphere.cloudShadowScale <= 0.01, 'cloud shadows should form broad landscape pools');
assert.ok(weather.wind.speed >= 0.5 && weather.wind.direction.some((component) => Math.abs(component) > 0),
  'cloud shadows must move rather than baking a dead dark patch into the valley');

const water = createWaterSettings({ preset: world.water.preset, style: world.water.style });
assert.ok(water.deepColor[2] > water.deepColor[1] && water.deepColor[1] > water.deepColor[0],
  'deep water must stay blue rather than milky cyan');
assert.ok(water.reflectionStrength <= 0.5, 'soft reflection must not bleach the water body');
assert.ok(water.detailNormalStrength >= 0.3 && water.waveIntensity >= 0.3,
  'signature lake water needs visible small-wave life');
assert.ok(createWaterSettings({ preset: 'call_me_sensei' }).waveIntensity >= 0.3,
  'selecting the signature water style directly must retain lake wave life');

console.log('world quality invariants passed');
