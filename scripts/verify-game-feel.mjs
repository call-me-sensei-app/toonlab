// Generator, runtime and standalone lab verification. Run directly with:
//   node scripts/verify-game-feel.mjs


import { stableStringify } from '../src/core/generation.js';
import {
  applyGameFeelQualityBudget,
  createGameFeelGeneratorRecipe,
  createGameFeelRuntime,
  createGeneratedGameFeelPresetDocument,
  getGameFeelEffectTypeOptions,
  getGameFeelEventOptions,
  parseGameFeelGeneratorRecipe,
  parseGameFeelPresetDocument,
  registerGameFeelEffectType,
  registerGameFeelEventType,
  resolveGameFeelGeneratorRecipe,
  sanitizeGameFeelSettings,
  serializeGameFeelGeneratorRecipe,
  serializeGameFeelPresetDocument,
  validateGameFeelGeneratorRecipe,
} from '../src/game-feel/index.js';

let failures = 0;
function check(label, condition, detail = '') {
  if (condition) console.log(`ok   ${label}`);
  else {
    failures += 1;
    console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const signature = (value) => stableStringify(value);

// --- generator breadth, locks and documents -------------------------------
const recipe = createGameFeelGeneratorRecipe('verify-game-feel', {
  family: 'arcade',
  label: 'Verifier game feel',
  seed: 91,
});
check('generator uses the shared recipe contract', recipe.type === 'toonlab/game-feel-generator');
check('built-in event channels are starting points, not the registry ceiling', getGameFeelEventOptions().length >= 4);
const sameA = resolveGameFeelGeneratorRecipe(recipe);
const sameB = resolveGameFeelGeneratorRecipe(recipe);
check('same seed resolves exactly', signature(sameA) === signature(sameB));

const signatures = new Set();
for (let seed = 1; seed <= 10000; seed += 1) {
  signatures.add(signature(resolveGameFeelGeneratorRecipe({ ...recipe, seed })));
}
check('10,000 seeds produce 10,000 distinct game-feel settings', signatures.size === 10000, `${signatures.size} unique`);

const current = resolveGameFeelGeneratorRecipe({ ...recipe, seed: 401 });
const lockedRecipe = createGameFeelGeneratorRecipe('verify-locked-game-feel', {
  configuration: current,
  domains: recipe.domains,
  locks: [
    'events.impact.effects.cameraImpulse.power',
    'events.damage.effects.screenFlash.color',
  ],
  seed: 9999,
});
const locked = resolveGameFeelGeneratorRecipe(lockedRecipe);
check('continuous locks survive generation', locked.events.impact.effects.cameraImpulse.power === current.events.impact.effects.cameraImpulse.power);
check('color locks survive generation', signature(locked.events.damage.effects.screenFlash.color) === signature(current.events.damage.effects.screenFlash.color));
check('unlocked fields continue to generate', locked.events.impact.effects.cameraImpulse.duration !== current.events.impact.effects.cameraImpulse.duration);

const recipeJson = serializeGameFeelGeneratorRecipe(recipe);
const parsedRecipe = parseGameFeelGeneratorRecipe(recipeJson);
check('generator JSON round-trips exactly', parsedRecipe.ok && serializeGameFeelGeneratorRecipe(parsedRecipe.value) === recipeJson);
check('future generator versions are rejected', !validateGameFeelGeneratorRecipe({ ...recipe, version: 999 }).ok);
const preset = createGeneratedGameFeelPresetDocument(recipe, { quality: 'mobile' });
const presetJson = serializeGameFeelPresetDocument(preset);
const parsedPreset = parseGameFeelPresetDocument(presetJson);
check('flat runtime preset JSON round-trips', parsedPreset.ok && serializeGameFeelPresetDocument(parsedPreset.value) === presetJson);
check('runtime preset contains no generator domains', !('domains' in parsedPreset.value) && !('locks' in parsedPreset.value));
check('future preset versions are rejected', !parseGameFeelPresetDocument({ ...preset, version: 999 }).ok);

const unconstrained = sanitizeGameFeelSettings({
  master: { maxConcurrentEffects: 99, maxEffectsPerTrigger: 50 },
});
check('mobile quality enforces both concurrency budgets',
  applyGameFeelQualityBudget(unconstrained, 'mobile').master.maxConcurrentEffects === 8
  && applyGameFeelQualityBudget(unconstrained, 'mobile').master.maxEffectsPerTrigger === 5);

const rawMobileRuntime = createGameFeelRuntime({
  quality: 'mobile',
  settings: { master: { maxConcurrentEffects: 200, maxEffectsPerTrigger: 100 } },
});
check('runtime quality caps tighten raw settings',
  rawMobileRuntime.stats().maxConcurrentEffects === 8 && rawMobileRuntime.stats().maxEffectsPerTrigger === 5);
rawMobileRuntime.dispose();
const presetMobileRuntime = createGameFeelRuntime({
  quality: 'mobile',
  settings: {
    ...preset,
    settings: { ...preset.settings, master: { maxConcurrentEffects: 200, maxEffectsPerTrigger: 100 } },
  },
});
check('runtime quality caps tighten resolved preset documents',
  presetMobileRuntime.stats().maxConcurrentEffects === 8 && presetMobileRuntime.stats().maxEffectsPerTrigger === 5);
presetMobileRuntime.dispose();

// --- open event/effect registries -----------------------------------------
registerGameFeelEventType('verify-late-default', {
  defaults: {
    cooldown: 0.777,
    effects: { latePulse: { amount: 3.5, duration: 0.09, enabled: true } },
  },
  label: 'Late default verifier',
});
const lateRecipe = createGameFeelGeneratorRecipe('verify-late-registration', { seed: 14 });
const lateSettings = resolveGameFeelGeneratorRecipe(lateRecipe);
check('late event cooldown defaults are embedded in portable recipes',
  lateRecipe.configuration.events['verify-late-default'].cooldown === 0.777);
check('late event defaults survive into generated runtime settings',
  lateSettings.events['verify-late-default'].cooldown === 0.777
  && lateSettings.events['verify-late-default'].effects.latePulse.amount === 3.5);

registerGameFeelEventType('verify-combo', {
  defaults: {
    effects: {
      verifySpark: { amount: 2, duration: 0.05, enabled: true },
    },
  },
  domains: {
    effects: {
      verifySpark: {
        amount: { $type: 'range', min: 1, max: 9, step: 0.01 },
      },
    },
  },
  label: 'Verifier combo',
});
let customUpdates = 0;
registerGameFeelEffectType('verifySpark', (context) => ({
  duration: context.effect.duration,
  update() { customUpdates += 1; },
}));
const customRecipe = createGameFeelGeneratorRecipe('verify-custom-event', { seed: 11 });
const customSettings = resolveGameFeelGeneratorRecipe(customRecipe, { quality: 'cinematic' });
check('registered events participate in generation', customSettings.events['verify-combo'].effects.verifySpark.amount >= 1);
check('registered effects are reported by the runtime registry', getGameFeelEffectTypeOptions().includes('verifySpark'));
const customRuntime = createGameFeelRuntime({ settings: customSettings });
customRuntime.trigger('verify-combo');
customRuntime.update(1 / 60);
check('custom serialized effect factory runs in the common scheduler', customUpdates === 1);
customRuntime.dispose();

let customPreviewOpacity = 0;
const customPreviewRuntime = createGameFeelRuntime({
  adapters: { setScreenFlash({ opacity }) { customPreviewOpacity = opacity; } },
  settings: {
    events: {
      'authored/custom-event': {
        cooldown: 0,
        enabled: true,
        intensity: 1,
        effects: {
          screenFlash: { color: [0.2, 0.8, 1], duration: 0.2, enabled: true, opacity: 0.7 },
        },
      },
    },
  },
});
customPreviewRuntime.trigger('authored/custom-event');
customPreviewRuntime.update(1 / 120);
check('arbitrary authored events preview through their declared effect adapters', customPreviewOpacity > 0);
customPreviewRuntime.dispose();

let capacityAudioCalls = 0;
const capacityRuntime = createGameFeelRuntime({
  adapters: { audioCue() { capacityAudioCalls += 1; } },
  settings: {
    events: {
      capacity: {
        cooldown: 0,
        enabled: true,
        intensity: 1,
        effects: {
          unknownPriorityEffect: { enabled: true, priority: 9999 },
          audioCue: { enabled: true, gain: 0.4, pitch: 1, priority: 1 },
        },
      },
    },
    master: { maxConcurrentEffects: 1, maxEffectsPerTrigger: 1 },
  },
});
const capacityTrigger = capacityRuntime.trigger('capacity');
check('unknown high-priority effects do not consume supported effect capacity',
  capacityTrigger.effectCount === 1 && capacityAudioCalls === 1);
check('unknown effects remain visible in diagnostics', capacityRuntime.stats().unknownEffects === 1);
capacityRuntime.dispose();

const declinedRuntime = createGameFeelRuntime({
  adapters: { audioCue: () => false, haptics: () => false },
  settings: {
    events: {
      declined: {
        cooldown: 0,
        enabled: true,
        intensity: 1,
        effects: {
          audioCue: { enabled: true, gain: 0.4, pitch: 1 },
          haptics: { duration: 0.02, enabled: true, highFrequency: 0.2, lowFrequency: 0.3 },
        },
      },
    },
    master: { maxConcurrentEffects: 2, maxEffectsPerTrigger: 2 },
  },
});
declinedRuntime.trigger('declined');
check('adapter return false is reported as unsupported',
  declinedRuntime.stats().unsupportedAudio === 1 && declinedRuntime.stats().unsupportedHaptics === 1);
declinedRuntime.dispose();

// --- built-in adapters, overlap, budgets and lifecycle --------------------
const adapterCalls = {
  audio: 0,
  camera: 0,
  flash: [],
  haptic: 0,
  scales: [],
  time: [],
};
const fakeTarget = {
  scale: {
    x: 1, y: 1, z: 1,
    set(x, y, z) { this.x = x; this.y = y; this.z = z; },
  },
};
const runtimeSettings = sanitizeGameFeelSettings(resolveGameFeelGeneratorRecipe({ ...recipe, seed: 812 }));
runtimeSettings.master.maxConcurrentEffects = 12;
runtimeSettings.master.maxEffectsPerTrigger = 12;
for (const effect of Object.values(runtimeSettings.events.impact.effects)) effect.enabled = true;
runtimeSettings.events.impact.cooldown = 0;
const runtime = createGameFeelRuntime({
  adapters: {
    applyScalePunch({ multiplier }) { adapterCalls.scales.push(multiplier); },
    audioCue() { adapterCalls.audio += 1; },
    cameraRig: { addImpulse() { adapterCalls.camera += 1; return { stop() {} }; } },
    haptics() { adapterCalls.haptic += 1; },
    setScreenFlash(value) { adapterCalls.flash.push(value); },
    setTimeScale(value) { adapterCalls.time.push(value); },
  },
  settings: runtimeSettings,
});
const trigger = runtime.trigger('impact', { target: fakeTarget }, { seed: 75 });
check('trigger starts the complete configured effect graph', trigger.accepted && trigger.effectCount === 6, `${trigger.effectCount} effects`);
check('cameraRig.addImpulse receives runtime feedback', adapterCalls.camera === 1);
check('one-shot audio and haptics dispatch through adapters', adapterCalls.audio === 1 && adapterCalls.haptic === 1);
const firstFrame = runtime.update(1 / 120);
check('time warp returns a scaled gameplay delta', firstFrame.delta < firstFrame.realDelta && firstFrame.timeScale < 1);
check('flash and scale punch compose into frame adapters', adapterCalls.flash.at(-1).opacity > 0 && adapterCalls.scales.at(-1) > 1);
for (let index = 0; index < 20; index += 1) runtime.trigger('impact', { target: fakeTarget }, { ignoreCooldown: true, seed: index + 100 });
check('overlapping triggers never exceed the concurrency budget', runtime.stats().activeEffects <= 12);
check('budget pressure is observable', runtime.stats().effectsDropped > 0);
runtime.configure({ ...runtimeSettings, master: { ...runtimeSettings.master, maxConcurrentEffects: 2, maxEffectsPerTrigger: 2 } });
check('configure applies a tighter budget to already-active effects', runtime.stats().activeEffects <= 2);
const updatesBeforeDispose = runtime.stats().updates;
runtime.dispose();
runtime.update(1 / 60);
check('dispose makes updates inert and restores adapter channels',
  runtime.stats().disposed && runtime.stats().updates === updatesBeforeDispose
  && adapterCalls.time.at(-1) === 1 && adapterCalls.flash.at(-1).opacity === 0);
check('disposed triggers are safely rejected', runtime.trigger('impact').reason === 'disposed');

// Browser feedback must remain optional in SSR, Node and unsupported devices.
const fallbackSettings = sanitizeGameFeelSettings();
fallbackSettings.events.impact.cooldown = 0;
for (const [type, effect] of Object.entries(fallbackSettings.events.impact.effects)) effect.enabled = type === 'haptics';
const fallbackRuntime = createGameFeelRuntime({ settings: fallbackSettings });
check('unsupported browser haptics degrades without throwing', fallbackRuntime.trigger('impact').accepted);
fallbackRuntime.dispose();

// --- real/scaled time frame-rate independence -----------------------------
function simulate(frameRate) {
  const settings = sanitizeGameFeelSettings();
  settings.master.maxConcurrentEffects = 8;
  settings.master.maxEffectsPerTrigger = 8;
  settings.events.impact.cooldown = 0;
  for (const [type, effect] of Object.entries(settings.events.impact.effects)) effect.enabled = type === 'timeWarp';
  Object.assign(settings.events.impact.effects.timeWarp, { duration: 0.37, hold: 0.43, scale: 0.17 });
  const simulation = createGameFeelRuntime({ settings });
  simulation.trigger('impact');
  for (let frame = 0; frame < frameRate; frame += 1) simulation.update(1 / frameRate);
  return simulation.stats();
}
const at30 = simulate(30);
const at120 = simulate(120);
check('real-time effect lifetimes are frame-rate independent', Math.abs(at30.elapsedReal - at120.elapsedReal) < 1e-12);
check('time-warp integration is frame-rate independent', Math.abs(at30.elapsedScaled - at120.elapsedScaled) < 1e-9, `${at30.elapsedScaled} vs ${at120.elapsedScaled}`);

if (failures > 0) {
  console.error(`\n${failures} game-feel verification check(s) failed.`);
  process.exit(1);
}
console.log('\nGame-feel generation, documents, registries, adapters, timing, budgets, and lifecycle verified.');
