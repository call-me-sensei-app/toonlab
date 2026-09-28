// Invariants for the Water Shader Lab realism audit. These are conservative
// mathematical bounds, not a claim that Gerstner + authored swash solves fluids.
import assert from 'node:assert/strict';
import {
  WATER_PRESET_NAMES, buildGerstnerWaves, createWaterSettings,
  sampleGerstnerHeight, sampleSwashDistance, sampleSwashFrameState,
} from '../src/water/waterSettings.js';
import { resolveWaterUnderwaterAtmosphereState } from '../src/water/waterUnderwaterAtmosphere.js';
import { riverBedHeight, shallowRiverBedHeight, STAGE_BY_PRESET } from '../labs/water-lab/engine/waterLabEngine.js';
import { waterStageOverrides } from '../src/water/waterStageSettings.js';

let spectra = 0;
for (const preset of WATER_PRESET_NAMES) {
  for (const waveIntensity of [0, 0.01, 0.3, 0.7, 1]) {
    for (const waveSpeed of [0, 0.000001, 0.01, 0.35, 1, 4, 8]) {
      for (const waveAmplitude of [0, 0.3, 5]) {
        for (const waveLength of [1, 13, 120]) {
          const settings = createWaterSettings({
            preset, waveIntensity, waveSpeed, waveAmplitude, waveLength,
            waveSteepness: 1.4, waveSetStrength: 1, waveSetPeriod: 8,
          });
          const waves = buildGerstnerWaves(settings);
          const context = JSON.stringify({ preset, waveIntensity, waveSpeed, waveAmplitude, waveLength });
          assert.ok(waves.every(wave => Object.values(wave).every(Number.isFinite)), context);
          assert.ok(waves.reduce((sum, w) => sum + w.amplitude * w.waveNumber, 0) <= 0.8 + 1e-12, context);
          // Sufficient open-water condition: J = I - sum(Q k A sin(theta) dd^T)
          // remains positive definite for EVERY phase, including aligned crests.
          assert.ok(waves.reduce((sum, w) => sum + w.steepness * w.amplitude * w.waveNumber, 0) <= 0.85 + 1e-12, context);
          for (const w of waves) {
            assert.ok(Math.abs(w.omega ** 2 - 9.81 * w.waveNumber * waveSpeed ** 2) < 1e-8, context);
          }
          if (waveSpeed === 0) {
            assert.ok(waves.every(w => w.omega === 0), context);
            assert.equal(sampleGerstnerHeight(waves, 1.3, -4.8, 0), sampleGerstnerHeight(waves, 1.3, -4.8, 100));
          }
          if (waveIntensity === 0 || waveAmplitude === 0) {
            for (const time of [0, 1, 2, 11]) {
              assert.ok(sampleSwashDistance(waves, time, 10) === 0, context);
              const frame = sampleSwashFrameState(waves, time, 10);
              assert.equal(frame.activity, 0);
              assert.equal(frame.edgeDistanceSpeed, 0);
              assert.equal(frame.runupScale, 0);
              assert.ok(frame.startOffset === 0);
              assert.ok(frame.endOffset === 0);
            }
          }
          spectra++;
        }
      }
    }
  }
}
const column = { waterY: 0, surfaceY: 1, bedY: -2, width: 10, depth: 10 };
assert.equal(resolveWaterUnderwaterAtmosphereState({ ...column, cameraY: 0.5 }).active, true, 'A crest can submerge a camera above rest level');
assert.equal(resolveWaterUnderwaterAtmosphereState({ ...column, surfaceY: -1, cameraY: -0.5 }).active, false, 'Air above a trough is not underwater');
assert.equal(resolveWaterUnderwaterAtmosphereState({ ...column, cameraY: -3 }).active, false, 'No water below the bed');
assert.equal(resolveWaterUnderwaterAtmosphereState({ ...column, cameraX: 6, cameraY: -1 }).active, false, 'No water outside the footprint');
assert.equal(resolveWaterUnderwaterAtmosphereState({ ...column, surfaceY: 1, bedY: 2, cameraY: 0 }).active, false, 'No water under a dry bank');
assert.equal(STAGE_BY_PRESET.river, 'river');
for (const [stage, bed] of [['river', riverBedHeight], ['river-shallow', shallowRiverBedHeight]]) {
  assert.deepEqual(waterStageOverrides(stage).flowDirection, [1, 0]);
  assert.equal(waterStageOverrides(stage).runupDistance, 0);
  assert.equal(waterStageOverrides(stage).shorelineRunup, 0);
  for (const x of [-20, 0, 20]) {
    assert.ok(bed(x, -5) < 0.36, 'Wet channel center');
    assert.ok(bed(x, -15) > 0.36 && bed(x, 5) > 0.36, 'Dry banks on both sides');
    assert.equal(bed(x, -5), bed(0, -5), 'Uniform reach does not invent upstream/downstream steps');
  }
}
console.log(`Water physics invariants passed: ${spectra} spectra, zero-forcing swash, animated finite underwater column, and two river reaches.`);
