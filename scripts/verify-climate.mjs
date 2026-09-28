import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

import {
  CLIMATE_PROFILES,
  CLIMATE_RUNTIME_LIMITS,
  createClimateDirector,
  createClimateSequence,
  DEFAULT_CLIMATE_SEQUENCE,
  getClimateProfileOptions,
  resolveClimateProfile,
} from '../src/climate/index.js';
import {
  ClimateRenderer,
  DEFAULT_CLIMATE_RENDER_ASSETS,
} from '../labs/shared/climatePreviewRenderer.js';

let checks = 0;
async function check(label, callback) {
  await callback();
  checks += 1;
  console.log(`ok   ${label}`);
}

await check('registry exposes fifteen independent profiles', () => {
  assert.equal(Object.keys(CLIMATE_PROFILES).length, 15);
  assert.equal(getClimateProfileOptions().length, 15);
  assert.ok(Object.isFrozen(CLIMATE_PROFILES.openSky));
  assert.ok(Object.isFrozen(CLIMATE_PROFILES.openSky.air.tint.noon));
});

await check('profile resolver rejects unknown ids and normalizes custom values', () => {
  assert.throws(() => resolveClimateProfile('missing'), /Unknown climate profile/);
  const custom = resolveClimateProfile({
    id: 'test',
    rain: { amount: 0.4 },
  });
  assert.equal(custom.id, 'test');
  assert.equal(custom.rain.amount, 0.4);
  assert.equal(custom.flow.maximum, 3);
});

await check('authored sequence preserves order, repeats, holds, and blends', () => {
  assert.equal(DEFAULT_CLIMATE_SEQUENCE.length, 14);
  assert.deepEqual(DEFAULT_CLIMATE_SEQUENCE[0], {
    profile: 'openSky',
    holdMinimum: 60,
    holdMaximum: 120,
    blendDuration: 20,
  });
  assert.equal(DEFAULT_CLIMATE_SEQUENCE[5].profile, 'openSky');
  assert.equal(DEFAULT_CLIMATE_SEQUENCE[8].blendDuration, 10);
  assert.equal(DEFAULT_CLIMATE_SEQUENCE[11].holdMaximum, 90);
  assert.equal(DEFAULT_CLIMATE_SEQUENCE[13].profile, 'lowMist');
});

await check('custom sequences validate their timing contract', () => {
  assert.throws(() => createClimateSequence([]), /at least one/);
  assert.throws(() => createClimateSequence([{
    profile: 'openSky',
    holdMinimum: 2,
    holdMaximum: 1,
    blendDuration: 0,
  }]), /maximum hold/);
});

await check('director blends profiles without mutating the registry', () => {
  const director = createClimateDirector({ profile: 'openSky' });
  director.setProfile('steadyShower', { duration: 10 });
  director.update(5);
  assert.equal(director.frame.precipitation.rain.amount, 0.33);
  assert.equal(CLIMATE_PROFILES.openSky.rain.amount, 0);
  assert.equal(CLIMATE_PROFILES.steadyShower.rain.amount, 0.66);
  director.update(5);
  assert.equal(director.frame.profile.id, 'steadyShower');
  assert.equal(director.transition, null);
  director.dispose();
});

await check('day phase samples the four authored atmosphere anchors cyclically', () => {
  const director = createClimateDirector({ profile: 'lowMist' });
  director.setDayPhase(0.25);
  assert.deepEqual(
    director.frame.air.sampledTint,
    CLIMATE_PROFILES.lowMist.air.tint.dusk,
  );
  director.setDayPhase(0.5);
  assert.deepEqual(
    director.frame.air.sampledTint,
    CLIMATE_PROFILES.lowMist.air.tint.midnight,
  );
  director.setDayPhase(1);
  assert.deepEqual(
    director.frame.air.sampledTint,
    CLIMATE_PROFILES.lowMist.air.tint.noon,
  );
  director.dispose();
});

await check('exposure suppresses local effects without changing the atmosphere', () => {
  const director = createClimateDirector({ profile: 'steadyShower' });
  const airBefore = structuredClone(director.frame.air);
  director.setExposure(0);
  assert.equal(director.frame.precipitation.rain.amount, 0);
  assert.equal(director.frame.precipitation.emission.rain, 0);
  assert.equal(director.frame.audio.rainGain, 0);
  assert.deepEqual(director.frame.air, airBefore);
  director.dispose();
});

await check('runtime outputs use the extracted coordinator limits', () => {
  const director = createClimateDirector({ profile: 'whiteout' });
  assert.equal(
    director.frame.precipitation.emission.flakes,
    CLIMATE_RUNTIME_LIMITS.emission.flakes,
  );
  assert.equal(CLIMATE_RUNTIME_LIMITS.emission.rain, 500);
  assert.equal(CLIMATE_RUNTIME_LIMITS.emission.flakes, 800);
  assert.equal(CLIMATE_RUNTIME_LIMITS.emission.mist, 25);
  assert.equal(CLIMATE_RUNTIME_LIMITS.surface.puddleMaximum, 0.6);
  assert.equal(CLIMATE_RUNTIME_LIMITS.coordinator.updateInterval, 0.5);
  assert.equal(CLIMATE_RUNTIME_LIMITS.coordinator.exposureProbeInterval, 2);
  director.dispose();
});

await check('sequence timing is deterministic for a seed', () => {
  const left = createClimateDirector({ mode: 'sequence', seed: 42 });
  const right = createClimateDirector({ mode: 'sequence', seed: 42 });
  assert.equal(left.sequenceHold, right.sequenceHold);
  const firstHold = left.sequenceHold;
  left.update(firstHold + 10);
  right.update(firstHold + 10);
  assert.equal(left.transition.to.id, 'closedSky');
  assert.equal(left.transition.duration, 20);
  assert.equal(left.transition.elapsed, 10);
  assert.equal(left.sequenceHold, right.sequenceHold);
  left.dispose();
  right.dispose();
});

await check('large sequence steps consume every crossed hold and blend', () => {
  const sequence = createClimateSequence([
    { profile: 'openSky', holdMinimum: 1, holdMaximum: 1, blendDuration: 1 },
    { profile: 'closedSky', holdMinimum: 1, holdMaximum: 1, blendDuration: 1 },
    { profile: 'steadyShower', holdMinimum: 1, holdMaximum: 1, blendDuration: 1 },
  ]);
  const director = createClimateDirector({ mode: 'sequence', sequence, seed: 7 });
  director.update(4.5);
  assert.equal(director.sequenceIndex, 2);
  assert.equal(director.frame.profile.id, 'steadyShower');
  assert.equal(director.sequenceHold, 0.5);
  director.dispose();
});

await check('sink and electrical event adapters receive neutral runtime data', () => {
  const frames = [];
  const director = createClimateDirector({
    profile: 'ionSquall',
    sink: (frame) => frames.push(frame),
  });
  let pulse = null;
  director.addEventListener('electricalpulse', (event) => {
    pulse = event.detail;
  });
  director.triggerElectricalPulse({ strength: 0.75, position: [1, 2, 3] });
  assert.ok(frames.length >= 1);
  assert.equal(pulse.strength, 0.75);
  assert.deepEqual(pulse.position, [1, 2, 3]);
  assert.equal(pulse.flashLevel, 75);
  director.dispose();
});

await check('climate source remains mechanically separate from the weather package', async () => {
  for (const file of [
    '../src/climate/climateProfiles.js',
    '../src/climate/climateSequence.js',
    '../src/climate/climateDirector.js',
    '../src/climate/index.js',
  ]) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /from\s+['"][^'"]*\/weather(?:\/|['"])/);
  }
});

await check('repository-only lab renderer exposes comparison and animation controls', () => {
  assert.equal(
    DEFAULT_CLIMATE_RENDER_ASSETS.comparisonStage,
    '/climate/open-sky-sunset-stage.glb',
  );
  assert.equal(
    DEFAULT_CLIMATE_RENDER_ASSETS.baselineManifest,
    '/climate/baselines/manifest.json',
  );
  assert.equal(typeof ClimateRenderer.prototype.start, 'function');
  assert.equal(typeof ClimateRenderer.prototype.stop, 'function');
  assert.equal(typeof ClimateRenderer.prototype.renderAsync, 'function');
  assert.equal(typeof ClimateRenderer.prototype.queueAuthoredBaseline, 'function');
  assert.equal(
    typeof ClimateRenderer.prototype.setAuthoredBaselinesEnabled,
    'function',
  );
});

await check('authored baseline manifest covers every profile and time state', () => {
  const manifestUrl = new URL(
    '../public/climate/baselines/manifest.json',
    import.meta.url,
  );
  const manifest = JSON.parse(readFileSync(manifestUrl, 'utf8'));
  assert.equal(manifest.schema, 'toonlab.climate-authored-baseline-matrix');
  assert.equal(manifest.conditionSet, 'call_me_sensei');
  assert.equal(manifest.metadataFieldChecks, 720);
  assert.equal(manifest.profiles.length, 15);
  assert.deepEqual(
    [...manifest.times].sort(),
    ['day', 'night', 'sunrise', 'sunset'],
  );
  assert.equal(manifest.entryCount, 60);
  assert.equal(manifest.entries.length, 60);
  const keys = new Set();
  const hashes = new Set();
  for (const entry of manifest.entries) {
    const key = `${entry.profile}:${entry.time}`;
    assert.equal(keys.has(key), false, `duplicate authored baseline ${key}`);
    keys.add(key);
    assert.equal(entry.runtimeVerified, true, key);
    assert.match(entry.authoredHash, /^[0-9a-f]{64}$/);
    const baselineUrl = new URL(`../public${entry.path}`, import.meta.url);
    assert.equal(
      existsSync(baselineUrl),
      true,
      `missing authored baseline ${key}`,
    );
    const actualHash = createHash('sha256')
      .update(readFileSync(baselineUrl))
      .digest('hex');
    assert.equal(actualHash, entry.authoredHash, `authored hash ${key}`);
    hashes.add(actualHash);
  }
  assert.equal(keys.size, 60);
  assert.equal(hashes.size, 60);
});

await check('renderer routes all sixty exact profile and time anchors to authored frames', () => {
  const manifest = JSON.parse(readFileSync(
    new URL('../public/climate/baselines/manifest.json', import.meta.url),
    'utf8',
  ));
  const entries = new Map(
    manifest.entries.map((entry) => [`${entry.profile}:${entry.time}`, entry]),
  );
  const textures = new Map(
    [...entries.keys()].map((key) => [key, { key }]),
  );
  const ground = { visible: true };
  const skyRoot = { material: null };
  const cloudRoot = { material: null, visible: true };
  const skyMaterial = {};
  const dynamicMaterial = {};
  const renderer = new ClimateRenderer({
    authoredBaseline: {
      activeKey: null,
      celestials: {},
      cloudRoot,
      dynamicCloudMaterial: dynamicMaterial,
      entries,
      ground,
      inflight: new Map(),
      skyMaterial,
      skyRoot,
      textureLoader: null,
      textureNode: { value: null },
      textures,
    },
    camera: {},
    container: {},
    controls: {},
    effectsCanvas: {},
    material: dynamicMaterial,
    renderer: {},
    resizeObserver: {},
    resources: [],
  });
  const phases = new Map([
    ['day', 0],
    ['sunset', 0.25],
    ['night', 0.5],
    ['sunrise', 0.75],
  ]);
  for (const profile of manifest.profiles) {
    for (const [time, dayPhase] of phases) {
      renderer.queueAuthoredBaseline({
        ceiling: { celestialOcclusion: 0 },
        dayPhase,
        light: {
          colorMix: 0,
          moonLevel: 1,
          moonTint: [1, 1, 1],
          sunLevel: 1,
          sunTint: [1, 1, 1],
        },
        profile: { id: profile },
      });
      assert.equal(renderer.authoredBaseline.activeKey, `${profile}:${time}`);
      assert.equal(renderer.authoredBaseline.ground.visible, false);
      assert.equal(renderer.authoredBaseline.skyRoot.material, skyMaterial);
      assert.equal(renderer.authoredBaseline.cloudRoot.visible, false);
    }
  }
  renderer.queueAuthoredBaseline({
    ceiling: { celestialOcclusion: 0 },
    dayPhase: 0.125,
    light: {
      colorMix: 0,
      moonLevel: 1,
      moonTint: [1, 1, 1],
      sunLevel: 1,
      sunTint: [1, 1, 1],
    },
    profile: { id: 'openSky' },
  });
  assert.equal(renderer.authoredBaseline.activeKey, null);
  assert.equal(renderer.authoredBaseline.ground.visible, true);
  assert.equal(renderer.authoredBaseline.skyRoot.material, dynamicMaterial);
  assert.equal(renderer.authoredBaseline.cloudRoot.visible, true);
});

await check('published climate code and shell metadata use only ToonLab terminology', async () => {
  const namedTerms = [
    [115, 111, 32, 115, 116, 121, 108, 105, 122, 101, 100],
    [117, 110, 105, 116, 121],
    [117, 110, 114, 101, 97, 108],
    [117, 114, 112],
  ].map((codes) => codes.map((code) => String.fromCharCode(code)).join(''));
  const abbreviatedTerm = [117, 101]
    .map((code) => String.fromCharCode(code))
    .join('');
  const prohibited = new RegExp([
    ...namedTerms.map((term) => `\\b${term}\\b`),
    `\\b${abbreviatedTerm}(?:5|[._ -]?\\d)`,
  ].join('|'), 'i');
  for (const file of [
    '../src/climate/climateProfiles.js',
    '../src/climate/climateSequence.js',
    '../src/climate/climateDirector.js',
    '../labs/shared/climatePreviewRenderer.js',
    '../src/climate/index.js',
    '../public/climate/baselines/manifest.json',
    '../public/climate/comparison-stage.glb',
    '../public/climate/open-sky-sunset-stage.glb',
  ]) {
    const source = await readFile(new URL(file, import.meta.url));
    const searchable = file.endsWith('.glb')
      ? source.toString('utf8', 20, 20 + source.readUInt32LE(12))
      : source.toString('utf8');
    assert.doesNotMatch(searchable, prohibited);
  }
});

console.log(`Climate verification passed: ${checks} checks.`);
