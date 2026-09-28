import assert from 'node:assert/strict';

import {
  getEnvironmentPresetOptions,
  registerEnvironmentPreset,
} from '../src/environment/environmentPresets.js';
import {
  getGroundShaderPresetOptions,
  registerGroundShaderPreset,
} from '../src/ground-shader/groundShaderSettings.js';
import {
  getRockShaderPresetOptions,
  registerRockShaderPreset,
} from '../src/rock-shader/rockShaderSettings.js';
import {
  getSkyShaderPresetOptions,
  registerSkyShaderPreset,
} from '../src/sky/skyShaderSettings.js';
import {
  getSkyPresetOptions,
  registerSkyPreset,
} from '../src/sky/stylizedSky.js';
import {
  isProtectedSystemStyleId,
  systemStyleLabel,
} from '../src/core/systemStylePolicy.js';
import {
  getToonPresetOptions,
  registerToonPreset,
} from '../src/toon/toonSettings.js';
import {
  getGrassPresetOptions,
  registerGrassPreset,
} from '../src/vegetation/stylizedGrass.js';
import {
  getVegetationShaderPresetOptions,
  registerVegetationShaderPreset,
} from '../src/vegetation/vegetationShaders.js';
import {
  getWaterStyleOptions,
  registerWaterStyle,
} from '../src/water/waterSettings.js';

const SYSTEM_ID = 'call_me_sensei';
const cases = [
  {
    get: () => getToonPresetOptions().find((entry) => entry.id === SYSTEM_ID),
    label: 'Character Shader',
    overwrite: () => registerToonPreset(SYSTEM_ID, { label: 'Broken' }, { overwrite: true }),
  },
  {
    get: () => getVegetationShaderPresetOptions().find((entry) => entry.id === SYSTEM_ID),
    label: 'Vegetation Shader',
    overwrite: () => registerVegetationShaderPreset(SYSTEM_ID, { label: 'Broken' }, { overwrite: true }),
  },
  {
    get: () => getGrassPresetOptions().find((entry) => entry.id === SYSTEM_ID),
    label: 'Grass',
    overwrite: () => registerGrassPreset(SYSTEM_ID, { label: 'Broken' }, { overwrite: true }),
  },
  {
    get: () => getGroundShaderPresetOptions().find((entry) => entry.value === SYSTEM_ID),
    label: 'Ground Shader',
    overwrite: () => registerGroundShaderPreset(SYSTEM_ID, { label: 'Broken' }, { overwrite: true }),
  },
  {
    get: () => getRockShaderPresetOptions().find((entry) => entry.value === SYSTEM_ID),
    label: 'Rock Shader',
    overwrite: () => registerRockShaderPreset(SYSTEM_ID, { label: 'Broken' }, { overwrite: true }),
  },
  {
    get: () => getWaterStyleOptions().find((entry) => entry.id === SYSTEM_ID),
    label: 'Water',
    overwrite: () => registerWaterStyle(SYSTEM_ID, { label: 'Broken' }, { overwrite: true }),
  },
  {
    get: () => getSkyPresetOptions().find((entry) => entry.id === SYSTEM_ID),
    label: 'Sky',
    overwrite: () => registerSkyPreset(SYSTEM_ID, { label: 'Broken' }, { overwrite: true }),
  },
  {
    get: () => getSkyShaderPresetOptions().find((entry) => entry.id === SYSTEM_ID),
    label: 'Sky Shader',
    overwrite: () => registerSkyShaderPreset(SYSTEM_ID, { label: 'Broken' }, { overwrite: true }),
  },
  {
    get: () => getEnvironmentPresetOptions().find((entry) => entry.value === SYSTEM_ID),
    label: 'Environment',
    overwrite: () => registerEnvironmentPreset(SYSTEM_ID, { label: 'Broken' }, { overwrite: true }),
  },
];

assert.equal(isProtectedSystemStyleId(SYSTEM_ID), true);
assert.equal(isProtectedSystemStyleId('call-me-sensei'), true);
assert.equal(systemStyleLabel('Call Me Sensei', SYSTEM_ID), 'Call Me Sensei · system');

for (const entry of cases) {
  const before = entry.get();
  assert.ok(before, `${entry.label} must ship Call Me Sensei.`);
  assert.equal(before.label, 'Call Me Sensei', `${entry.label} system label changed.`);
  assert.throws(entry.overwrite, /read-only/, `${entry.label} allowed its system style to be overwritten.`);
  assert.deepEqual(entry.get(), before, `${entry.label} system style changed after a rejected overwrite.`);
}

console.log(`System style policy verified across ${cases.length} public style registries.`);
