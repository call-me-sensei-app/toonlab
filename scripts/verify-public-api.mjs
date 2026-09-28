import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import * as root from '@call-me-sensei/toonlab';
import * as cloud from '@call-me-sensei/toonlab/cloud';
import * as character from '@call-me-sensei/toonlab/character';
import * as environment from '@call-me-sensei/toonlab/environment';
import * as grass from '@call-me-sensei/toonlab/grass';
import * as grassPalettes from '@call-me-sensei/toonlab/grass-palettes';
import * as rockShader from '@call-me-sensei/toonlab/rock-shader';
import * as rockgen from '@call-me-sensei/toonlab/rockgen';
import * as renderer from '@call-me-sensei/toonlab/renderer';
import * as runtime from '@call-me-sensei/toonlab/runtime';
import * as sky from '@call-me-sensei/toonlab/sky';
import * as styles from '@call-me-sensei/toonlab/styles';
import * as vegetation from '@call-me-sensei/toonlab/vegetation';
import * as vegetationShaders from '@call-me-sensei/toonlab/vegetation-shaders';
import * as water from '@call-me-sensei/toonlab/water';

import {
  createEnvironmentLabStore,
  ENVIRONMENT_LAB_PRESET_QUERY_PARAM,
  ENVIRONMENT_LAB_SCENARIO_QUERY_PARAM,
  ENVIRONMENT_LAB_STYLE_QUERY_PARAM,
} from '../labs/environment-lab/ui/store.js';
import * as grassLabStore from '../labs/grass-lab/grassPresetStore.js';

let checks = 0;
function check(label, callback) {
  callback();
  checks += 1;
  console.log(`ok   ${label}`);
}

const packageJson = JSON.parse(await readFile(
  new URL('../package.json', import.meta.url),
  'utf8',
));
const grassShaderSource = await readFile(
  new URL('../src/shaders-tsl/grass.js', import.meta.url),
  'utf8',
);
const rootSource = await readFile(new URL('../src/index.js', import.meta.url), 'utf8');
const rockgenSource = await readFile(new URL('../src/rockgen/index.js', import.meta.url), 'utf8');

function exportCondition(key, condition = 'default') {
  const definition = packageJson.exports[key];
  return typeof definition === 'string' ? definition : definition?.[condition];
}

check('runtime package version matches package.json', () => {
  assert.equal(root.TOONLAB_VERSION, packageJson.version);
});

check('styles publish versioned target and material contracts', () => {
  assert.equal(styles.STYLE_TARGET_LABEL_SCHEMA_VERSION, 2);
  assert.equal(styles.STYLE_MATERIAL_CONTRACT_SCHEMA_VERSION, 1);
  assert.equal(typeof styles.createStyleTargetLabel, 'function');
  assert.equal(typeof styles.createStyleMaterialContract, 'function');
  assert.equal(typeof styles.proposeManufacturedStyleTargetLabel, 'function');
  assert.equal(typeof styles.applyManufacturedStyleTargetLabelProposal, 'function');
  assert.equal(typeof styles.labelManufacturedStyleTarget, 'function');
  assert.equal(typeof styles.collectStyleTargets, 'function');
  assert.equal(typeof styles.auditSceneStyleContract, 'function');
  assert.equal(typeof styles.createSceneContentDocument, 'function');
  assert.equal(typeof styles.createSceneScenarioDocument, 'function');
  assert.equal(typeof styles.createSceneQualityDocument, 'function');
  assert.equal(typeof styles.resolveSceneQualityProfile, 'function');
  assert.equal(typeof styles.validateSceneQualityProfile, 'function');
  assert.equal(styles.SCENE_QUALITY_PROFILE_VERSION, 1);
  assert.equal(styles.TOONLAB_INSPECTOR_VERSION, 1);
  assert.equal(typeof styles.createToonLabInspector, 'function');
  assert.equal(typeof styles.createSceneOverrideDocument, 'function');
  assert.equal(typeof styles.resolveSceneLook, 'function');
  assert.equal(typeof styles.captureStyleTargetSnapshot, 'function');
  assert.equal(typeof styles.restoreStyleTargetSnapshot, 'function');
  assert.equal(typeof styles.StyleBundleTransactionError, 'function');
  assert.equal(typeof styles.labelStyleTarget, 'function');
  assert.equal(typeof styles.readStyleTargetLabel, 'function');
  assert.equal(typeof styles.removeStyleTargetLabel, 'function');
  assert.equal(typeof styles.validateStyleTargetLabel, 'function');
  assert.equal(typeof styles.validateStyleMaterialContract, 'function');
  assert.equal(root.createStyleTargetLabel, styles.createStyleTargetLabel);
  assert.equal(root.auditSceneStyleContract, styles.auditSceneStyleContract);
  assert.equal(root.createStyleMaterialContract, styles.createStyleMaterialContract);
  assert.equal(root.proposeManufacturedStyleTargetLabel, styles.proposeManufacturedStyleTargetLabel);
  assert.equal(root.collectStyleTargets, styles.collectStyleTargets);
  assert.equal(root.labelStyleTarget, styles.labelStyleTarget);
  assert.equal(typeof root.createWorldCollision, 'function');
  assert.equal(typeof root.createCollisionMetadata, 'function');
  assert.equal(typeof root.createCollisionAdapter, 'function');
  assert.equal(typeof root.createRapierCollisionAdapter, 'function');
  assert.equal(typeof root.registerCollisionTarget, 'function');
  assert.equal(typeof root.resolveCatalogLodDistancesForQuality, 'function');
  assert.equal(root.COLLISION_METADATA_VERSION, 1);
});

check('package export map publishes the stable system entry points', () => {
  assert.equal(exportCondition('./vegetation'), './src/vegetation/index.js');
  assert.equal(exportCondition('./vegetation-shaders'), './src/vegetation/vegetationShaders.js');
  assert.equal(exportCondition('./grass-palettes'), './src/vegetation/grassPalettes.js');
  assert.equal(exportCondition('./grass'), './src/vegetation/grass.js');
  assert.equal(exportCondition('./water'), './src/water/index.js');
  assert.equal(exportCondition('./sky'), './src/sky/index.js');
  assert.equal(exportCondition('./cloud'), './src/cloud/index.js');
  assert.equal(exportCondition('./asset-policy'), './src/asset-policy/index.js');
  assert.equal(exportCondition('./character'), './src/character/index.js');
  assert.equal(exportCondition('./renderer'), './src/renderer/index.js');
  assert.equal(exportCondition('./runtime'), './src/runtime/index.js');
  assert.equal(exportCondition('./world-collision'), './src/worldCollision.js');
  assert.equal(exportCondition('./rock-shader'), './src/rock-shader/index.js');
  assert.equal(exportCondition('./lighting'), './src/lighting/index.js');
  for (const [key, definition] of Object.entries(packageJson.exports)) {
    if (key === './agents/*') continue;
    assert.equal(typeof definition.types, 'string', `${key} must publish a types condition`);
  }
  for (const preBetaExport of [
    './biome',
    './ambientfx',
    './atmospheric-condition',
    './buildinggen',
    './camera',
    './climate',
    './debrisgen',
    './debug',
    './fauna',
    './game-feel',
    './landscape',
    './motion',
    './pathgen',
    './propgen',
    './rockgen/node',
    './soundscape',
    './vfxgen',
    './villagegen',
    './weather',
  ]) {
    assert.equal(packageJson.exports[preBetaExport], undefined);
  }
  assert.equal(packageJson.exports['./agents/*'], './agents/*');
  assert.ok(packageJson.files.includes('agents/references/runtime-entry-points.md'));
  assert.equal(packageJson.files.some((path) => path === 'public' || path.startsWith('public/')), false);
  assert.equal(packageJson.files.some((path) => path === 'labs' || path.startsWith('labs/')), false);
});

check('repository-only rock compilers do not reach the npm API', () => {
  assert.equal(root.compileRockRegionGlb, undefined);
  assert.equal(rockgen.compileRockRegionGlb, undefined);
  assert.doesNotMatch(rootSource, /rockgen\/node|rockRegionGlbCompiler/u);
  assert.doesNotMatch(rockgenSource, /rockgen\/node|rockRegionGlbCompiler/u);
});

check('renderer publishes reversible backend-aware configuration', () => {
  assert.equal(renderer.TOONLAB_RENDERER_CONFIGURATION_VERSION, 1);
  assert.equal(typeof renderer.configureToonLabRenderer, 'function');
  assert.equal(typeof renderer.createToonLabRendererOptions, 'function');
  assert.equal(typeof renderer.createToonLabRendererProfile, 'function');
  assert.equal(typeof renderer.detectToonLabRendererBackend, 'function');
  assert.equal(typeof renderer.stabilizeToonLabWebGPUResourceLifetime, 'function');
  assert.equal(root.configureToonLabRenderer, renderer.configureToonLabRenderer);
  assert.equal(
    root.stabilizeToonLabWebGPUResourceLifetime,
    renderer.stabilizeToonLabWebGPUResourceLifetime,
  );
});

check('runtime publishes deterministic scheduling and strict scene surfaces', () => {
  assert.equal(runtime.SCENE_UPDATE_SCHEDULER_VERSION, 1);
  assert.equal(typeof runtime.createSceneUpdateScheduler, 'function');
  assert.equal(typeof runtime.SceneUpdateSchedulerError, 'function');
  assert.equal(root.createSceneUpdateScheduler, runtime.createSceneUpdateScheduler);
  assert.equal(typeof runtime.createSceneSurfaceRuntime, 'function');
  assert.equal(root.createSceneSurfaceRuntime, runtime.createSceneSurfaceRuntime);
  assert.equal(runtime.SCENE_COLLISION_RUNTIME_VERSION, 1);
  assert.equal(typeof runtime.createSceneCollisionRuntime, 'function');
  assert.equal(typeof runtime.sceneCollisionRuntimeFor, 'function');
  assert.equal(typeof runtime.SceneCollisionRuntimeError, 'function');
  assert.equal(root.createSceneCollisionRuntime, runtime.createSceneCollisionRuntime);
  assert.equal(root.sceneCollisionRuntimeFor, runtime.sceneCollisionRuntimeFor);
});

check('character publishes the immutable public-R2 mannequin contract', () => {
  assert.equal(typeof character.createCharacterRuntime, 'function');
  assert.equal(typeof character.createGroundSampler, 'function');
  assert.equal(typeof character.createGroundStabilizer, 'function');
  assert.equal(typeof character.applyGroundStabilizerFrame, 'function');
  assert.equal(typeof character.createLocomotionStateMachine, 'function');
  assert.equal(typeof character.applyLocomotionFrame, 'function');
  assert.equal(typeof character.createWaterInteractionController, 'function');
  assert.equal(typeof character.applyWaterInteractionFrame, 'function');
  assert.equal(typeof character.enforceWaterInteractionFrame, 'function');
  assert.equal(typeof character.createCharacterControllerProfile, 'function');
  assert.equal(typeof character.createWalkableCharacterRuntime, 'function');
  assert.equal(typeof character.createWalkableCharacterSlot, 'function');
  assert.deepEqual(character.DEFAULT_CHARACTER_ANIMATION_ROLES, [
    'idle', 'walk', 'run', 'jump', 'swim', 'tread', 'dive', 'sit',
  ]);
  assert.equal(root.createCharacterRuntime, character.createCharacterRuntime);
  assert.equal(root.createGroundStabilizer, character.createGroundStabilizer);
  assert.equal(root.createLocomotionStateMachine, character.createLocomotionStateMachine);
  assert.equal(root.createWaterInteractionController, character.createWaterInteractionController);
  assert.equal(root.createWalkableCharacterRuntime, character.createWalkableCharacterRuntime);
  assert.equal(character.TOONLAB_MANNEQUIN_ASSET.animationClipCount, 46);
  assert.equal(character.TOONLAB_MANNEQUIN_ASSET.byteSize, 6670948);
  assert.equal(character.TOONLAB_MANNEQUIN_ASSET.license, 'CC0');
  assert.match(character.TOONLAB_MANNEQUIN_ASSET.licenseUrl, /creativecommons\.org/);
  assert.match(character.TOONLAB_MANNEQUIN_ASSET.sourceUrl, /quaternius\.com/);
  assert.equal(
    character.TOONLAB_MANNEQUIN_ASSET.url,
    character.TOONLAB_MANNEQUIN_ASSET_URL,
  );
  assert.equal(
    character.TOONLAB_MANNEQUIN_ASSET_URL,
    'https://assets.toonlab.io/runtime/characters/mannequin/v1-37925f7d8278d5a7/mannequin.glb',
  );
});

check('root mirrors the published vegetation, water, sky, cloud, and rock shader barrels', () => {
  for (const module of [vegetation, water, sky, cloud, rockShader]) {
    for (const [name, value] of Object.entries(module)) {
      assert.equal(root[name], value, `root export ${name} must match its system barrel`);
    }
  }
});

check('environment publishes the manufactured-surface profile contract', () => {
  for (const name of [
    'applyUrbanPropShaderProfile',
    'createUrbanPropShaderProfileDocument',
    'createUrbanPropShaderProfileSettings',
    'parseUrbanPropShaderProfileDocument',
    'serializeUrbanPropShaderProfile',
    'snapshotUrbanPropShaderControls',
  ]) {
    assert.equal(typeof environment[name], 'function', `${name} must be public`);
  }
  assert.equal(
    environment.URBAN_PROP_SHADER_PROFILE_DOCUMENT_TYPE,
    'toonlab/manufactured-surface-profile',
  );
  assert.equal(environment.URBAN_PROP_SHADER_PROFILE_SCHEMA_VERSION, 1);
});

// The 31-field flat cloud-shader profile keyed on `call_me_sensei` was retired
// with the volumetric renderer documented in docs/sky-cloud-parameters.md. Its
// replacement is the six-group `cloud` block of a SkyParams document, so each
// claim below is the same claim about that surface: how many fields, which
// groups, what the defaults are, and how a caller applies them.
check('cloud publishes the six volumetric parameter groups', () => {
  assert.deepEqual(
    cloud.CLOUD_PARAM_GROUP_IDS,
    ['shape', 'lighting', 'wind', 'cirrus', 'haze', 'fade'],
  );
  assert.deepEqual(
    cloud.CLOUD_PARAM_GROUPS.map((group) => group.id),
    cloud.CLOUD_PARAM_GROUP_IDS,
  );
  assert.equal(
    Object.values(cloud.CLOUD_PARAMS_FIELD_SCHEMA)
      .flatMap((group) => Object.values(group))
      .length,
    38,
  );
  // Defaults are the reference's published ones, and they are the same numbers
  // whether read off the frozen table or off a freshly built live group.
  assert.equal(cloud.DEFAULT_CLOUD_PARAMS.shape.altitude, 1400);
  assert.equal(cloud.DEFAULT_CLOUD_PARAMS.shape.density, 0.048);
  assert.equal(cloud.DEFAULT_CLOUD_PARAMS.lighting.scatteringAlbedo, 0.9);
  const live = cloud.createCloudParams();
  assert.equal(live.shape.altitude.value, 1400);
  assert.equal(live.shape.density.value, 0.048);
  assert.equal(typeof live.applyParams, 'function');
  assert.equal(typeof live.toParams, 'function');
  // `maxMarchDist` is derived, so it is published read-only rather than as a
  // 39th authorable field.
  assert.equal(cloud.CLOUD_PARAMS_FIELD_SCHEMA.fade.maxMarchDist.derived, true);
  assert.equal(
    cloud.DEFAULT_CLOUD_PARAMS.fade.maxMarchDist,
    cloud.DEFAULT_CLOUD_PARAMS.fade.horizonMeltEnd + cloud.MAX_MARCH_DIST_MARGIN,
  );
});

check('cloud publishes placement-free hero-cloud authoring', () => {
  assert.equal(cloud.HERO_CLOUD_RECIPE_TYPE, 'toonlab/hero-cloud-recipe');
  assert.equal(cloud.HERO_CLOUD_RECIPE_VERSION, 1);
  assert.equal(typeof cloud.createHeroCloudRecipe, 'function');
  assert.equal(typeof cloud.parseHeroCloudRecipe, 'function');
  assert.equal(typeof cloud.serializeHeroCloudRecipe, 'function');
  assert.equal(typeof cloud.rasterizeHeroCloudFootprint, 'function');
  assert.equal(typeof cloud.createHeroCloudWeatherTexture, 'function');
  assert.equal(typeof cloud.heroCloudSkyOverrides, 'function');
  assert.equal(typeof sky.SkySystem.prototype.setCloudWeatherTexture, 'function');
  const recipe = cloud.createHeroCloudRecipe({
    bounds: { baseAltitude: 9000, diameter: 5000, height: 2200 },
  });
  assert.deepEqual(recipe.bounds, { diameter: 5000, height: 2200 });
  assert.equal(recipe.position, undefined);
  assert.equal(recipe.bounds.baseAltitude, undefined);
  const parsed = cloud.parseHeroCloudRecipe(JSON.parse(cloud.serializeHeroCloudRecipe(recipe)));
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.value, recipe);
  assert.equal(cloud.parseHeroCloudRecipe({ ...recipe, version: 999 }).ok, false);
});

check('the retired cloud-shader surface is gone from the cloud barrel', () => {
  // A deleted module that a barrel still re-exports is invisible until a host
  // imports the name, so the absence is asserted rather than assumed.
  for (const retired of [
    'CALL_ME_SENSEI_CLOUD_SHADER_SETTINGS',
    'CLOUD_COMPOSITION_DOCUMENT_TYPE',
    'CLOUD_SHADER_DOCUMENT_TYPE',
    'CLOUD_SHADER_FIELD_COUNT',
    'CLOUD_SHADER_FIELD_SCHEMA',
    'CLOUD_SHADER_SETTING_GROUPS',
    'CLOUD_SOURCE_DOCUMENT_TYPE',
    'CloudField',
    'DEFAULT_CLOUD_SHADER_PRESET',
    'DEFAULT_CLOUD_SHADER_SETTINGS',
    'applyCloudShaderSettings',
    'createCloudField',
    'createCloudShaderSettings',
    'createCumulusVolumeGeometry',
    'generateCloudSourceMaps',
    'parseCloudShaderPresetDocument',
    'resolveCloudPlacements',
  ]) {
    assert.equal(cloud[retired], undefined, `retired cloud export ${retired} is still published`);
    assert.equal(root[retired], undefined, `retired cloud export ${retired} still reaches the root`);
  }
});

check('sky and water publish their runtime composition and quality contracts', () => {
  assert.equal(sky.SKY_QUALITY_TIERS.low.cloudOctaves, 2);
  assert.equal(sky.SKY_QUALITY_TIERS.medium.cloudOctaves, 3);
  assert.equal(sky.SKY_QUALITY_TIERS.high.cloudOctaves, 4);
  assert.equal(sky.resolveSkyQuality({ cloudOctaves: 5 }).cloudOctaves, 5);
  assert.equal(sky.SKY_SCENE_OVERRIDE_PRIORITIES.lighting, 100);
  assert.equal(sky.SKY_SCENE_OVERRIDE_PRIORITIES.weather, 200);
  assert.equal(water.WATER_SCENE_OVERRIDE_PRIORITIES.lighting, 100);
  assert.equal(water.WATER_SCENE_OVERRIDE_PRIORITIES.weather, 200);
});

check('focused vegetation subpaths share identities with the main barrel', () => {
  for (const module of [grass, vegetationShaders, grassPalettes]) {
    for (const [name, value] of Object.entries(module)) {
      assert.equal(vegetation[name], value, `vegetation export ${name} must be the same binding`);
    }
  }
});

check('grass exposes paintable clump geometry, material, field, and LOD contracts', () => {
  for (const name of [
    'createCallMeSenseiGrassField',
    'createCallMeSenseiGrassMaterial',
    'createGrassClumpGeometry',
    'createGrassClumpMaterial',
    'loadCallMeSenseiGrassClump',
    'RetainedGrassClumpField',
    'StylizedGrassClumpField',
  ]) {
    assert.equal(typeof grass[name], 'function', `missing grass clump API ${name}`);
  }
  assert.equal(grass.GRASS_CLUMP_LODS.length, 3);
  assert.equal(grass.DEFAULT_CALL_ME_SENSEI_GRASS_CLUMP, 'primary');
  assert.deepEqual(
    Object.keys(grass.CALL_ME_SENSEI_GRASS_CLUMP_VARIANTS),
    ['primary', 'secondary'],
  );
  assert.deepEqual(
    Object.values(grass.CALL_ME_SENSEI_GRASS_CLUMP_VARIANTS)
      .map(({ bladeCount, seed }) => ({ bladeCount, seed })),
    [{ bladeCount: 40, seed: 1337 }, { bladeCount: 56, seed: 7331 }],
  );
  assert.equal(
    Object.values(grass.CALL_ME_SENSEI_GRASS_MATERIAL_TEXTURE_URLS).length,
    0,
  );
  const geometry = grass.createGrassClumpGeometry();
  assert.equal(geometry.userData.grassClump.triangleCount, 280);
  assert.equal(geometry.userData.grassClump.role, 'static-mesh-equivalent');
  const meadow = grass.createGrassSettings({ preset: 'call_me_sensei_clump' });
  assert.equal(meadow.bladesPerClump, 40);
  assert.equal(meadow.groundAdoptStrength, 1);
  assert.deepEqual(meadow.groundAdoptTint, [1, 1, 1]);
  assert.equal(meadow.leanStrength, 0.24);
  assert.equal(meadow.washLift, 0.68);
  assert.equal(meadow.washOpacity, 0.82);
  const callMeSenseiVegetation = vegetationShaders.resolveVegetationShaderPreset('call_me_sensei');
  assert.equal(callMeSenseiVegetation.grass.tipHueShift, 0);
  assert.equal(callMeSenseiVegetation.grass.tipDesaturation, 0);
  geometry.dispose();
});

check('vegetation exposes semantic contracts and every shipped material factory', () => {
  for (const name of [
    'createGrassNodeMaterial',
    'createTreeLeafNodeMaterial',
    'createFlowerNodeMaterial',
    'createFlowerHeadNodeMaterial',
    'createFlowerHeadBillboardNodeMaterial',
    'createFlowerBloomNodeMaterial',
    'createFlowerStemNodeMaterial',
    'createWoodySurfaceNodeMaterial',
    'setWoodySurfaceSun',
  ]) {
    assert.equal(typeof vegetation[name], 'function', `missing vegetation material API ${name}`);
  }
  assert.deepEqual(
    Object.values(vegetation.VEGETATION_MATERIAL_ROLES).sort(),
    ['flowerCenter', 'flowerPetal', 'foliageCard', 'grassBlade', 'herbaceousStem', 'woodySurface'].sort(),
  );
  assert.equal(vegetation.VEGETATION_MATERIAL_CONTRACT_VERSION, 1);
});

check('vegetation exposes tree construction but no predefined tree assets or experimental species roster', () => {
  for (const name of [
    'LEGACY_TREE_IDS',
    'LEGACY_TREE_PRESETS',
    'STYLIZED_TREE_EXAMPLES',
    'createLegacyTree',
    'getLegacyTreePreset',
    'getLegacyTreePresetOptions',
    'layoutTreeRow',
  ]) {
    assert.equal(name in vegetation, false, `predefined tree asset API leaked: ${name}`);
  }
  for (const name of [
    'StylizedTree',
    'createStylizedTreeSettings',
    'getStylizedTreePresetOptions',
    'registerStylizedTreePreset',
  ]) {
    assert.equal(typeof vegetation[name], 'function', `missing tree construction API ${name}`);
  }
  assert.deepEqual(
    vegetation.getStylizedTreePresetOptions(),
    [{ description: 'Baseline stylized tree.', id: 'default', label: 'Default' }],
    'npm tree settings registry must contain only the neutral runtime baseline',
  );
  for (const name of [
    'BranchTree',
    'createBranchTree',
    'createBranchTreeDocument',
    'createBranchTreeSettings',
    'parseBranchTreeDocument',
  ]) {
    assert.equal(typeof vegetation[name], 'function', `missing stable BranchTree API ${name}`);
  }
  assert.deepEqual(
    vegetation.BRANCH_TREE_LEAF_SHAPES,
    ['teardrop', 'round', 'oak', 'maple', 'palmate', 'gingko', 'needle', 'needle-fascicle'],
  );
  assert.deepEqual(
    vegetation.BRANCH_TREE_CANOPY_ARCHITECTURES,
    ['cloud-cards', 'layered-sprays', 'needle-whorls'],
  );
  assert.equal(
    vegetation.TREE_SURFACE_PROFILE_DEFAULTS.call_me_sensei,
    'call-me-sensei-bark-v1',
  );
  assert.ok(
    vegetation.getTreeSurfaceProfileOptions()
      .some(({ id }) => id === 'call-me-sensei-bark-v1'),
    'developers and coding agents must be able to enumerate the registered bark fallback',
  );
  assert.equal(typeof vegetation.createTreeSurfaceTexture, 'function');
  assert.equal(typeof vegetation.createTreeSurfaceTextureData, 'function');
  for (const name of [
    'TREE_SPECIES_PROFILES',
    'TREE_SPECIES_ROSTER',
    'createTreeSpeciesRecipe',
    'createPlantGraph',
    'ProceduralSpeciesTree',
  ]) {
    assert.equal(vegetation[name], undefined, `${name} is experimental and must not be public`);
  }
});

check('vegetation shader profiles round-trip through the public package', () => {
  const document = vegetation.createVegetationShaderPresetDocument('public-api-profile', {
    label: 'Public API Profile',
    settings: {
      flower: { unlitPetalLift: 0.63 },
      lighting: { shadowTint: [0.38, 0.22, 0.58] },
    },
  });
  const parsed = vegetation.parseVegetationShaderPresetDocument(
    vegetation.serializeVegetationShaderPreset(document),
  );
  assert.equal(parsed.ok, true, parsed.errors.join(' '));
  assert.deepEqual(parsed.value, document);
  assert.equal(document.type, vegetation.VEGETATION_SHADER_DOCUMENT_TYPE);
});

check('grass palettes repaint the coordinated base, tip, and shadow set only', () => {
  assert.ok(grassPalettes.GRASS_COLOR_PALETTES.length >= 8);
  const palette = grassPalettes.resolveGrassColorPalette('wisteria');
  assert.ok(palette);
  const painted = grassPalettes.applyGrassColorPalette({
    shadowStrength: 0.37,
    windResponse: 1.8,
    windStrength: 0.24,
  }, palette);
  assert.deepEqual(painted.baseColor, [...palette.baseColor]);
  assert.deepEqual(painted.tipColor, [...palette.tipColor]);
  assert.deepEqual(painted.shadowTint, [...palette.shadowTint]);
  assert.equal(painted.shadowStrength, 0.37);
  assert.equal(painted.windResponse, 1.8);
  assert.equal(painted.windStrength, 0.24);
  assert.equal(grassPalettes.matchGrassColorPalette(painted)?.id, 'wisteria');
});

check('grass preset v2 stores asset response and excludes every current-scene input', () => {
  for (const [group, keys] of Object.entries({
    interaction: ['pushRadius'],
    sceneCloudShadow: ['cloudShadowCoverage', 'cloudShadowScale', 'cloudShadowStrength', 'cloudShadowVelocity'],
    sceneLight: ['skyColor', 'sunColor', 'sunDirection'],
    sceneWind: ['gustFrequency', 'gustSpeed', 'windDirection', 'windSpeed', 'windStrength'],
  })) {
    for (const key of keys) {
      assert.equal(grass.GRASS_SETTING_FIELD_SCHEMA[group][key].serializable, false,
        `${group}.${key} must be current-scene state`);
    }
  }
  assert.equal(grass.GRASS_SETTING_FIELD_SCHEMA.wind.windResponse.serializable, true);
  assert.equal(grass.GRASS_SETTING_FIELD_SCHEMA.wind.gustResponse.serializable, true);

  const document = grass.createGrassPresetDocument('portable-wisteria', {
    description: 'Portable purple grass.',
    label: 'Portable Wisteria',
    settings: {
      baseColor: [0.35, 0.2, 0.62],
      cloudShadowStrength: 0.8,
      gustFrequency: 0.9,
      gustResponse: 0.65,
      pushRadius: 1.4,
      skyColor: [1, 0, 0],
      sunColor: [0, 0, 0],
      sunDirection: [0, -1, 0],
      tipColor: [0.72, 0.58, 0.94],
      windDirection: [-1, 0.2],
      windResponse: 1.75,
      windSpeed: 2.2,
      windStrength: 0.28,
    },
  });
  assert.equal(document.type, grass.GRASS_PRESET_DOCUMENT_TYPE);
  assert.equal(document.version, grass.GRASS_PRESET_SCHEMA_VERSION);
  assert.equal(document.settings.windResponse, 1.75);
  assert.equal(document.settings.gustResponse, 0.65);
  for (const key of [
    'cloudShadowStrength', 'gustFrequency', 'pushRadius', 'skyColor', 'sunColor',
    'sunDirection', 'windDirection', 'windSpeed', 'windStrength',
  ]) {
    assert.equal(key in document.settings, false, `${key} must remain scene-owned`);
  }

  const parsed = grass.parseGrassPresetDocument(grass.serializeGrassPreset(document));
  assert.equal(parsed.ok, true, parsed.errors.join(' '));
  assert.deepEqual(parsed.value, document);

  const legacyV1 = grass.parseGrassPresetDocument({
    description: 'Old authored wind amplitude.',
    id: 'legacy-wind',
    label: 'Legacy Wind',
    settings: {
      baseColor: [0.2, 0.4, 0.1],
      cloudShadowStrength: 0.72,
      gustFrequency: 0.8,
      pushRadius: 1.2,
      windDirection: [-1, 0],
      windStrength: 0.32,
    },
    type: grass.GRASS_PRESET_DOCUMENT_TYPE,
    version: 1,
  });
  assert.equal(legacyV1.ok, true, legacyV1.errors.join(' '));
  assert.equal(legacyV1.value.version, 2);
  assert.equal(legacyV1.value.settings.windResponse, 2,
    'v1 windStrength migrates relative to its historical 0.16 world-wind default');
  for (const key of ['cloudShadowStrength', 'gustFrequency', 'pushRadius', 'windDirection', 'windStrength']) {
    assert.equal(key in legacyV1.value.settings, false, `${key} must be removed during v1 migration`);
  }
  assert.ok(legacyV1.warnings.some((warning) => warning.includes('windStrength')
    && warning.includes('scene-owned')));
  const legacyRoundTrip = grass.parseGrassPresetDocument(
    grass.serializeGrassPreset(legacyV1.value),
  );
  assert.equal(legacyRoundTrip.ok, true, legacyRoundTrip.errors.join(' '));
  assert.deepEqual(legacyRoundTrip.value, legacyV1.value);

  const v2WithSceneWind = grass.parseGrassPresetDocument({
    ...document,
    settings: { ...document.settings, windResponse: undefined, windStrength: 0.32 },
  });
  assert.equal(v2WithSceneWind.ok, true, v2WithSceneWind.errors.join(' '));
  assert.equal(v2WithSceneWind.value.settings.windResponse, grass.DEFAULT_GRASS_SETTINGS.windResponse,
    'v2 scene wind must not be reinterpreted as an asset response');

  const normalized = grass.validateGrassPresetDocument({
    ...document,
    settings: { ...document.settings, mystery: 1, sunColor: [0, 0, 0] },
  });
  assert.equal(normalized.ok, true);
  assert.ok(normalized.warnings.some((warning) => warning.includes('scene-owned')));
  assert.ok(normalized.warnings.some((warning) => warning.includes('mystery')));

  const future = grass.parseGrassPresetDocument({ ...document, version: 999 });
  assert.equal(future.ok, false);
  assert.match(future.errors.join(' '), /newer than supported/);

  const wrongType = grass.parseGrassPresetDocument({
    ...document,
    type: sky.SKY_PRESET_DOCUMENT_TYPE,
  });
  assert.equal(wrongType.ok, false);
  assert.match(wrongType.errors.join(' '), /Grass preset type/);
});

check('serialized grass presets register asset response while scene inputs stay local', () => {
  const serialized = grass.serializeGrassPreset('public-api-grass', {
    label: 'Public API Grass',
    settings: {
      baseColor: [0.24, 0.12, 0.48],
      shadowTint: [0.18, 0.15, 0.31],
      sunColor: [0, 0, 0],
      tipColor: [0.68, 0.48, 0.86],
      gustResponse: 0.4,
      windResponse: 1.9375,
      windStrength: 0.31,
    },
  });
  grass.registerSerializedGrassPreset(serialized);
  const resolved = grass.createGrassSettings('public-api-grass');
  assert.deepEqual(resolved.baseColor, [0.24, 0.12, 0.48]);
  assert.deepEqual(resolved.tipColor, [0.68, 0.48, 0.86]);
  assert.deepEqual(resolved.shadowTint, [0.18, 0.15, 0.31]);
  assert.equal(resolved.windResponse, 1.9375);
  assert.equal(resolved.gustResponse, 0.4);
  assert.equal(resolved.windStrength, grass.DEFAULT_GRASS_SETTINGS.windStrength);
  assert.deepEqual(resolved.sunColor, [...grass.DEFAULT_GRASS_SETTINGS.sunColor]);
});

check('grass runtime composes scene wind with live asset response uniforms', () => {
  const field = new grass.StylizedGrassField({
    gustResponse: 0.45,
    placements: [{ x: 0, y: 0, z: 0 }],
    windResponse: 2.25,
  });
  assert.equal(field.material.uniforms.uWindResponse.value, 2.25);
  assert.equal(field.material.uniforms.uGustResponse.value, 0.45);
  field.setWind({ strength: 0.3 });
  assert.equal(field.material.uniforms.uWindStrength.value, 0.3);
  assert.equal(field.material.uniforms.uWindResponse.value, 2.25,
    'setting current wind must not overwrite the grass response');
  field.applySettings({ gustResponse: 0.7, windResponse: 1.5 });
  assert.equal(field.material.uniforms.uWindResponse.value, 1.5);
  assert.equal(field.material.uniforms.uGustResponse.value, 0.7);
  field.setPushRadius(1.7);
  assert.equal(field.material.uniforms.uPushRadius.value, 1.7);
  field.dispose();

  assert.match(grassShaderSource, /u\.uWindStrength\.mul\(u\.uWindResponse\)/,
    'vertex displacement must multiply current wind by asset response');
  assert.match(grassShaderSource, /vGust\.mul\(1\.1\)\.mul\(u\.uGustResponse\)/,
    'gust contribution must use the asset gust response');
});

check('Grass Lab persistence re-exports the npm grass document contract', () => {
  for (const name of [
    'GRASS_PRESET_DOCUMENT_TYPE',
    'GRASS_PRESET_SCHEMA_VERSION',
    'sanitizeGrassPresetSettings',
    'validateGrassPresetDocument',
    'parseGrassPresetDocument',
    'createGrassPresetDocument',
    'serializeGrassPreset',
    'registerSerializedGrassPreset',
  ]) {
    assert.equal(grassLabStore[name], grass[name], `Grass Lab must reuse ${name}`);
  }
});

check('style bundles accept and resolve typed inline grass shader documents', () => {
  const grassDocument = vegetation.createGrassShaderProfilePresetDocument('bundle-grass', {
    settings: {
      grass: { baseColor: [0.16, 0.3, 0.52] },
      lighting: { shadowTint: [0.12, 0.18, 0.34] },
    },
  });
  assert.equal(
    styles.STYLE_BUNDLE_SLOTS.grassShader.documentType,
    vegetation.GRASS_SHADER_PROFILE_DOCUMENT_TYPE,
  );
  assert.equal(
    styles.STYLE_BUNDLE_SLOTS.grassShader.parseDocument,
    vegetation.parseGrassShaderProfilePresetDocument,
  );
  const bundle = styles.createStyleBundleDocument('grass-bundle', {
    slots: { grassShader: { document: grassDocument } },
  });
  const resolved = styles.resolveStyleBundleSettings(bundle);
  assert.deepEqual(resolved.grassShader.grass.baseColor, [0.16, 0.3, 0.52]);
  assert.deepEqual(resolved.grassShader.lighting.shadowTint, [0.12, 0.18, 0.34]);
});

check('manufactured-surface profiles round-trip and resolve through style bundles', () => {
  const document = environment.createUrbanPropShaderProfileDocument('painted-steel', {
    description: 'Portable manufactured-surface look.',
    label: 'Painted steel',
    settings: {
      bodyColor: '#2b79cf',
      paletteOverride: 0.82,
      wearAmount: 0.46,
    },
  });
  const parsed = environment.parseUrbanPropShaderProfileDocument(
    environment.serializeUrbanPropShaderProfile(document),
  );
  assert.equal(parsed.ok, true, parsed.errors?.join(' '));
  assert.equal(parsed.value.type, environment.URBAN_PROP_SHADER_PROFILE_DOCUMENT_TYPE);
  assert.equal(parsed.value.settings.bodyColor, '#2b79cf');
  assert.equal(parsed.value.settings.wearAmount, 0.46);
  assert.equal(parsed.value.settings.reflectionProbeMap, undefined,
    'runtime-only probe objects must never enter portable style JSON');

  assert.equal(
    styles.STYLE_BUNDLE_SLOTS.manufacturedSurface.documentType,
    environment.URBAN_PROP_SHADER_PROFILE_DOCUMENT_TYPE,
  );
  const bundle = styles.createStyleBundleDocument('manufactured-bundle', {
    slots: { manufacturedSurface: { document: parsed.value } },
  });
  const resolved = styles.resolveStyleBundleSettings(bundle);
  assert.equal(resolved.manufacturedSurface.bodyColor, '#2b79cf');
  assert.equal(resolved.manufacturedSurface.paletteOverride, 0.82);
  assert.equal(resolved.manufacturedSurface.wearAmount, 0.46);
});

check('style bundles keep IP-wide styles separate from asset presets', () => {
  assert.equal(styles.STYLE_BUNDLE_SLOTS.landscapeMaterial, undefined);
  assert.equal(styles.STYLE_BUNDLE_SLOTS.lighting.selectionKind, 'style');
  assert.equal(styles.STYLE_BUNDLE_SLOTS.tree, undefined);
  assert.equal(
    styles.STYLE_BUNDLE_SLOTS.grass.documentType,
    vegetation.GRASS_PRESET_DOCUMENT_TYPE,
  );
  assert.equal(styles.STYLE_BUNDLE_SLOTS.flowers, undefined);
  assert.equal(styles.STYLE_BUNDLE_SLOTS.vegetationShader, undefined);
  for (const slotId of [
    'toon', 'treeShader', 'grass', 'grassShader', 'flowerShader',
    'groundShader', 'manufacturedSurface',
    'rock', 'water', 'sky', 'cloud', 'environment', 'lighting', 'post',
  ]) {
    assert.equal(styles.STYLE_BUNDLE_SLOTS[slotId].selectionKind, 'style');
  }

  const bundle = styles.createStyleBundleDocument('identity-bundle', {
    slots: {
      environment: { style: 'call_me_sensei' },
      cloud: { style: 'call_me_sensei' },
      rock: { style: 'call_me_sensei' },
      sky: { style: 'call_me_sensei' },
      water: { style: 'call_me_sensei' },
    },
  });
  assert.equal(bundle.version, 2);
  assert.equal(bundle.artDirection.family, 'anime-game');
  assert.deepEqual(bundle.slots.water, { style: 'call_me_sensei' });
  const resolved = styles.resolveStyleBundleSettings(bundle);
  assert.equal(resolved.rock.preset, 'call_me_sensei');
  assert.deepEqual(
    resolved.rock,
    rockShader.createRockShaderSettings({ preset: 'call_me_sensei' }),
  );
  assert.deepEqual(resolved.water, { style: 'call_me_sensei' });
  assert.deepEqual(resolved.sky, { style: 'call_me_sensei' });
  // A { style } cloud selection used to resolve to the shipped call_me_sensei
  // cloud-shader profile. The rebuild retired that look without replacing it
  // (decision 1: "not carried over in this pass"), so the slot resolves to the
  // SkyParams cloud defaults and keeps the identity the bundle asked for —
  // which is the claim worth pinning, because a slot that silently invented a
  // look would be indistinguishable from one that had a preset.
  assert.equal(resolved.cloud.style, 'call_me_sensei');
  assert.deepEqual(
    Object.keys(resolved.cloud).sort(),
    ['cirrus', 'fade', 'haze', 'lighting', 'shape', 'style', 'wind'],
  );
  assert.equal(resolved.cloud.shape.altitude, cloud.DEFAULT_CLOUD_PARAMS.shape.altitude);
  assert.equal(resolved.cloud.shape.density, cloud.DEFAULT_CLOUD_PARAMS.shape.density);
  assert.deepEqual(resolved.environment, { style: 'call_me_sensei' });

  // A bundle style must compose over every runtime axis; returning one fully
  // resolved default look here would silently pin Lake / Clear Day / Clear.
  for (const preset of water.WATER_PRESET_NAMES) {
    assert.deepEqual(
      water.createWaterSettings({ preset, ...resolved.water }),
      water.createWaterSettings({ preset, style: 'call_me_sensei' }),
      `Water bundle style must cover ${preset}`,
    );
  }
  for (const { id } of sky.getSkyScenarioOptions()) {
    assert.deepEqual(
      sky.createSkySettings({ ...resolved.sky, scenario: id }),
      sky.createSkySettings({ preset: 'call_me_sensei', scenario: id }),
      `Sky bundle style must cover ${id}`,
    );
  }
  for (const { id } of root.ENVIRONMENT_SCENARIOS) {
    assert.deepEqual(
      root.resolveEnvironmentPreset(resolved.environment.style, id),
      root.resolveEnvironmentPreset('call_me_sensei', id),
      `Environment bundle style must cover ${id}`,
    );
  }

  // Old bundles remain compatible: a Water preset still means the asset /
  // scenario axis and does not get reinterpreted as a new style payload.
  const legacy = styles.createStyleBundleDocument('legacy-water-bundle', {
    slots: { water: { preset: 'river' } },
  });
  assert.deepEqual(
    styles.resolveStyleBundleSettings(legacy).water,
    water.createWaterSettings({ preset: 'river' }),
  );
  const legacyScenarios = styles.createStyleBundleDocument('legacy-scenario-bundle', {
    slots: {
      environment: { preset: 'interiorNight' },
      sky: { preset: 'moonlit' },
    },
  });
  const legacyResolved = styles.resolveStyleBundleSettings(legacyScenarios);
  assert.deepEqual(
    legacyResolved.sky,
    { ...sky.createSkySettings({ preset: 'moonlit' }), style: 'default' },
  );
  const legacyEnvironment = root.resolveEnvironmentPreset('interiorNight');
  assert.deepEqual(
    legacyResolved.environment,
    {
      ...root.createEnvironmentSettings({
        features: legacyEnvironment.features,
        parameters: legacyEnvironment.parameters,
      }),
      materialLook: legacyEnvironment.materialLook,
      style: 'default',
    },
  );
});

check('Environment Lab exposes canonical Style × Scenario links with legacy compatibility', () => {
  assert.equal(ENVIRONMENT_LAB_STYLE_QUERY_PARAM, 'envStyle');
  assert.equal(ENVIRONMENT_LAB_PRESET_QUERY_PARAM, 'envPreset');
  assert.equal(ENVIRONMENT_LAB_SCENARIO_QUERY_PARAM, 'envScenario');

  const previousWindow = globalThis.window;
  const values = new Map();
  globalThis.window = {
    location: { search: '' },
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      removeItem: (key) => values.delete(key),
      setItem: (key, value) => values.set(key, String(value)),
    },
  };
  try {
    values.set('toonlab.environmentLab.document.v1', JSON.stringify({
      name: 'Unrelated draft',
      presetId: 'default',
      scenarioId: 'exteriorDay',
      settings: root.createEnvironmentSettings(),
    }));
    const linked = createEnvironmentLabStore({
      urlParams: new URLSearchParams(
        'envStyle=call_me_sensei&envPreset=default&envScenario=interiorNight',
      ),
    });
    assert.equal(linked.getState().bootSource, 'url');
    assert.equal(linked.getState().presetId, 'call_me_sensei');
    assert.equal(linked.getState().scenarioId, 'interiorNight');
    linked.actions.setScenario('exteriorDay');
    assert.equal(linked.getState().presetId, 'call_me_sensei');
    assert.equal(linked.getState().scenarioId, 'exteriorDay');

    const legacy = createEnvironmentLabStore({
      urlParams: new URLSearchParams('envPreset=interiorDay'),
    });
    assert.equal(legacy.getState().presetId, 'default');
    assert.equal(legacy.getState().scenarioId, 'interiorDay');
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

check('water exports the complete portable runtime surface', () => {
  for (const name of [
    'WaterSurface',
    'WaterCurrentField',
    'WaterRippleSimulation',
    'WaterSplashSystem',
    'WaterBreakerSystem',
    'WaterScenePasses',
    'WaterInteractionManager',
    'WaterShoreStateField',
    'WaterRain',
    'WaterKelpField',
    'createWaterMaterial',
    'createWaterPresetDocument',
    'parseWaterPresetDocument',
    'serializeWaterPreset',
  ]) {
    assert.ok(name in water, `missing water API ${name}`);
  }
  const document = water.createWaterPresetDocument('public-api-water', {
    settings: { waveIntensity: 0.17 },
  });
  const parsed = water.parseWaterPresetDocument(water.serializeWaterPreset(document));
  assert.equal(parsed.ok, true, parsed.errors.join(' '));
  assert.deepEqual(parsed.value, document);
});

check('style bundles resolve independent Tree, Grass, and Flower shader documents', () => {
  const treeDocument = vegetationShaders.createTreeShaderPresetDocument('bundle-tree', {
    settings: { bark: { shadowFloor: 0.63 } },
  });
  const grassDocument = vegetationShaders.createGrassShaderProfilePresetDocument('bundle-grass-shader', {
    settings: { grass: { rootOcclusionStrength: 0.24 } },
  });
  const flowerDocument = vegetationShaders.createFlowerShaderProfilePresetDocument('bundle-flower', {
    settings: { flower: { unlitPetalLift: 0.58 } },
  });
  const bundle = styles.createStyleBundleDocument('vegetation-family-bundle', {
    slots: {
      flowerShader: { document: flowerDocument },
      grassShader: { document: grassDocument },
      treeShader: { document: treeDocument },
    },
  });
  const resolved = styles.resolveStyleBundleSettings(bundle);
  assert.equal(resolved.treeShader.bark.shadowFloor, 0.63);
  assert.equal(resolved.grassShader.grass.rootOcclusionStrength, 0.24);
  assert.equal(resolved.flowerShader.flower.unlitPetalLift, 0.58);
  assert.equal(resolved.treeShader.grass, undefined);
  assert.equal(resolved.grassShader.bark, undefined);
  assert.equal(resolved.flowerShader.bark, undefined);
});

check('style bundle v1 migrates legacy aggregate vegetation styles explicitly', () => {
  const waterDocument = water.createWaterPresetDocument('bundle-water', {
    settings: { waveIntensity: 0.91 },
  });
  const parsed = styles.parseStyleBundleDocument({
    description: 'Legacy aggregate migration fixture.',
    id: 'system-bundle',
    label: 'System bundle',
    schema: styles.STYLE_BUNDLE_DOCUMENT_TYPE,
    slots: {
      vegetationShader: { style: 'call_me_sensei' },
      water: { document: waterDocument },
    },
    version: 1,
  });
  assert.equal(parsed.ok, true, parsed.errors?.join(' '));
  assert.ok(parsed.warnings.some((warning) => warning.includes('expanded')));
  const resolved = styles.resolveStyleBundleSettings(parsed.value);
  const { style: treeStyle, ...treeShaderSettings } = resolved.treeShader;
  assert.equal(treeStyle, 'call_me_sensei',
    'tree shader selections retain identity so the adapter can select missing bark inputs');
  assert.deepEqual(
    treeShaderSettings,
    vegetation.createTreeShaderSettings({ preset: 'call_me_sensei' }),
  );
  assert.deepEqual(
    resolved.grassShader,
    vegetation.createGrassShaderProfileSettings({ preset: 'call_me_sensei' }),
  );
  assert.deepEqual(
    resolved.flowerShader,
    vegetation.createFlowerShaderProfileSettings({ preset: 'call_me_sensei' }),
  );
  assert.equal(resolved.water.waveIntensity, 0.91);
});

check('sky presets are styles that resolve in every canonical scenario', () => {
  const options = sky.getSkyPresetOptions();
  const ids = new Set(options.map((option) => option.id));
  for (const id of ['default', 'call_me_sensei']) {
    assert.ok(ids.has(id), `missing sky style ${id}`);
  }
  const scenarioIds = sky.getSkyScenarioOptions().map((option) => option.id);
  assert.deepEqual(scenarioIds, ['clear_day', 'golden_hour', 'overcast', 'moonlit']);
  // The core preset contract: a style is an identity, not a moment — every
  // style must produce a distinct look for every canonical scenario.
  for (const option of options) {
    assert.deepEqual(Object.keys(option.scenarios), scenarioIds);
    const looks = new Set(scenarioIds.map((scenario) => JSON.stringify(
      sky.sanitizeSkyPresetSettings(sky.createSkySettings({ preset: option.id, scenario })),
    )));
    assert.equal(looks.size, scenarioIds.length,
      `sky style ${option.id} must render distinctly in every scenario`);
  }
  // Legacy flat ids stay stable: each resolves as Default at that scenario.
  for (const [legacyId, alias] of Object.entries(sky.SKY_PRESET_ALIASES)) {
    assert.deepEqual(
      sky.createSkySettings({ preset: legacyId }),
      sky.createSkySettings({ preset: alias.preset, scenario: alias.scenario }),
      `legacy sky preset ${legacyId} must alias ${alias.preset}/${alias.scenario}`,
    );
  }
  assert.ok(sky.createSkySettings('moonlit').starsStrength > 0);
  assert.ok(sky.createSkySettings('golden_hour').sunDirection[1] < 0.3);
  const senseiNight = sky.createSkySettings({ preset: 'call_me_sensei', scenario: 'moonlit' });
  assert.ok(senseiNight.starsStrength > 1 && senseiNight.zenithColor[2] < 0.3,
    'the signature style must ship a real night, not a tinted day');
});

check('sky preset documents round-trip without construction-owned radius', () => {
  const document = sky.createSkyPresetDocument('portable-moonlight', {
    description: 'Portable night look.',
    settings: {
      radius: 720,
      starsStrength: 1.35,
      zenithColor: [0.02, 0.04, 0.13],
    },
  });
  assert.equal(document.type, sky.SKY_PRESET_DOCUMENT_TYPE);
  assert.equal(document.version, sky.SKY_PRESET_SCHEMA_VERSION);
  assert.equal('radius' in document.settings, false);

  const parsed = sky.parseSkyPresetDocument(sky.serializeSkyPreset(document));
  assert.equal(parsed.ok, true, parsed.errors.join(' '));
  assert.deepEqual(parsed.value, document);

  const normalized = sky.validateSkyPresetDocument({
    ...document,
    settings: { ...document.settings, mystery: 1, radius: 900 },
  });
  assert.equal(normalized.ok, true);
  assert.equal('radius' in normalized.value.settings, false);
  assert.ok(normalized.warnings.some((warning) => warning.includes('construction-only')));
  assert.ok(normalized.warnings.some((warning) => warning.includes('mystery')));

  const future = sky.parseSkyPresetDocument({ ...document, version: 999 });
  assert.equal(future.ok, false);
  assert.match(future.errors.join(' '), /newer than supported/);
});

check('serialized sky presets register and resolve with scene scale left local', () => {
  const serialized = sky.serializeSkyPreset('public-api-sky', {
    label: 'Public API Sky',
    settings: {
      cloudCoverage: 0.19,
      radius: 480,
      zenithColor: [0.11, 0.24, 0.52],
    },
  });
  sky.registerSerializedSkyPreset(serialized);
  const resolved = sky.createSkySettings({ preset: 'public-api-sky' });
  assert.deepEqual(resolved.zenithColor, [0.11, 0.24, 0.52]);
  assert.equal(resolved.cloudCoverage, 0.19);
  assert.equal(resolved.radius, sky.DEFAULT_SKY_SETTINGS.radius);
});

check('style bundles accept and resolve typed inline sky documents', () => {
  const skyDocument = sky.createSkyPresetDocument('bundle-sky', {
    settings: { starsStrength: 0.72, zenithColor: [0.04, 0.08, 0.2] },
  });
  assert.equal(styles.STYLE_BUNDLE_SLOTS.sky.documentType, sky.SKY_PRESET_DOCUMENT_TYPE);
  assert.equal(styles.STYLE_BUNDLE_SLOTS.sky.parseDocument, sky.parseSkyPresetDocument);
  const bundle = styles.createStyleBundleDocument('sky-bundle', {
    slots: { sky: { document: skyDocument } },
  });
  const resolved = styles.resolveStyleBundleSettings(bundle);
  assert.deepEqual(resolved.sky.zenithColor, [0.04, 0.08, 0.2]);
  assert.equal(resolved.sky.starsStrength, 0.72);
  assert.equal(resolved.sky.radius, sky.DEFAULT_SKY_SETTINGS.radius);
});

// The cloud slot's portable document is a SkyParams one now: the retired
// `toonlab/cloud-shader-preset` had no volumetric fields to carry, and a
// separate cloud-only document type would put a second envelope owner next to
// src/sky/skyParams.js. The slot still resolves only the block a style bundle
// owns — sun, time and the clock are world state, not art direction.
check('style bundles accept and resolve typed inline cloud documents', () => {
  const cloudDocument = sky.createSkyParamsDocument('bundle-cloud', {
    params: {
      cloud: {
        shape: { coverage: 0.61, density: 0.043 },
        lighting: { powderStrength: 0.43 },
      },
    },
  });
  assert.equal(
    styles.STYLE_BUNDLE_SLOTS.cloud.documentType,
    sky.SKY_PARAMS_DOCUMENT_TYPE,
  );
  assert.equal(
    styles.STYLE_BUNDLE_SLOTS.cloud.parseDocument,
    sky.parseSkyParamsDocument,
  );
  const bundle = styles.createStyleBundleDocument('cloud-bundle', {
    slots: { cloud: { document: cloudDocument } },
  });
  const resolved = styles.resolveStyleBundleSettings(bundle);
  assert.equal(resolved.cloud.shape.coverage, 0.61);
  assert.equal(resolved.cloud.shape.density, 0.043);
  assert.equal(resolved.cloud.lighting.powderStrength, 0.43);
  // Fields the document left out fall back to the schema default, and the
  // resolved block is complete: every group, every field, no partials.
  assert.deepEqual(
    Object.keys(resolved.cloud).sort(),
    [...cloud.CLOUD_PARAM_GROUP_IDS, 'style'].sort(),
  );
  assert.equal(
    cloud.CLOUD_PARAM_GROUP_IDS.flatMap((groupId) => Object.values(resolved.cloud[groupId])).length,
    38,
  );
  assert.equal(resolved.cloud.style.enabled, false);
  assert.equal(resolved.cloud.style.tone.enabled, false);
  assert.equal(resolved.cloud.shape.altitude, cloud.DEFAULT_CLOUD_PARAMS.shape.altitude);
  // Linear THREE.Color, not an [r, g, b] triple: the schema layer converts at
  // the document boundary and the resolved settings are the live shape.
  assert.equal(resolved.cloud.lighting.groundBounceAlbedo.isColor, true);
  // Nothing outside the cloud block leaks into the slot.
  assert.equal(resolved.cloud.sun, undefined);
  assert.equal(resolved.cloud.time, undefined);
});

// Lab deep-link precedence is part of the Pro/Open-in-Lab contract. Keep a
// saved Default draft in the input and prove an explicit signature-style
// link wins instead of silently reopening that draft.
const { resolveCharacterShaderBoot } = await import(
  '../labs/shader-lab/ui/characterShaderBoot.js'
);
check('Character Shader explicit style links beat the autosaved draft', () => {
  const boot = resolveCharacterShaderBoot({
    savedDocument: {
      name: 'Saved Default draft',
      presetId: 'default',
      settings: root.createToonSettings({ preset: 'default' }),
    },
    urlParams: new URLSearchParams('toonPreset=call_me_sensei'),
  });
  assert.equal(boot.bootSource, 'url');
  assert.equal(boot.presetId, 'call_me_sensei');
});

console.log(`public API verifier passed (${checks} contract groups)`);
