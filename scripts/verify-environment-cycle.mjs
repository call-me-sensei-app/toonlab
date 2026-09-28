// Environment-state + day-cycle contract verification: the shared uniform
// block mirrors both stores, writer conventions hold, and the day-cycle
// progress remap / looping curve sampler behave at the phase boundaries.

import assert from 'node:assert/strict';
import * as THREE from 'three';

import * as root from '../src/index.js';
import {
  DAY_CYCLE_PHASE,
  dayCycleProgressFromTime,
  fiveStopCurve,
  hourFromDayCycleTime,
  sampleDayCurve,
} from '../src/environment/dayCurves.js';
import {
  environmentStateUniforms,
  getEnvironmentState,
  setEnvironmentPlayer,
  setEnvironmentState,
  setGlobalWind,
} from '../src/environment/environmentState.js';
import { environmentStateUniformNodes } from '../src/shaders-tsl/chunks/environment-state.js';

let checks = 0;
function check(label, callback) {
  callback();
  checks += 1;
  console.log(`ok   ${label}`);
}

check('environment state API is available from the root export', () => {
  assert.equal(root.setEnvironmentState, setEnvironmentState);
  assert.equal(root.sampleDayCurve, sampleDayCurve);
  assert.equal(typeof root.setGlobalWind, 'function');
});

check('classic store and node store share field names and value kinds', () => {
  const classicKeys = Object.keys(environmentStateUniforms).sort();
  const nodeKeys = Object.keys(environmentStateUniformNodes).sort();
  assert.deepEqual(classicKeys, nodeKeys);
  for (const key of classicKeys) {
    const classic = environmentStateUniforms[key].value;
    const node = environmentStateUniformNodes[key].value;
    assert.equal(Boolean(classic?.isColor), Boolean(node?.isColor), key);
    assert.equal(Boolean(classic?.isVector2), Boolean(node?.isVector2), key);
    assert.equal(Boolean(classic?.isVector3), Boolean(node?.isVector3), key);
    assert.notEqual(
      classic !== null && typeof classic === 'object' ? classic : null,
      node !== null && typeof node === 'object' ? node : NaN,
      `${key} must not share one object between stores`,
    );
  }
});

check('setEnvironmentState writes numbers, colors, and vectors into both stores', () => {
  setEnvironmentState({
    weatherOvercast: 0.4,
    atmosphereFogColor: [0.9, 0.4, 0.2],
    sunDirection: new THREE.Vector3(0, 1, 0),
  });
  assert.equal(environmentStateUniforms.weatherOvercast.value, 0.4);
  assert.equal(environmentStateUniformNodes.weatherOvercast.value, 0.4);
  assert.ok(environmentStateUniforms.atmosphereFogColor.value.equals(new THREE.Color(0.9, 0.4, 0.2)));
  assert.ok(environmentStateUniformNodes.atmosphereFogColor.value.equals(new THREE.Color(0.9, 0.4, 0.2)));
  assert.equal(environmentStateUniformNodes.sunDirection.value.y, 1);
});

check('setGlobalWind derives windDirection from the angle', () => {
  setGlobalWind({ angle: Math.PI, strength: 2 });
  const snap = getEnvironmentState();
  assert.ok(Math.abs(snap.windDirection[0] + 1) < 1e-6);
  assert.ok(Math.abs(snap.windDirection[1]) < 1e-6);
  assert.equal(snap.windStrength, 2);
});

check('player writer toggles playerActive with the position', () => {
  setEnvironmentPlayer(new THREE.Vector3(3, 0, 4), { swayRadius: 3 });
  assert.equal(environmentStateUniforms.playerActive.value, 1);
  assert.equal(environmentStateUniforms.playerSwayRadius.value, 3);
  setEnvironmentPlayer(null);
  assert.equal(environmentStateUniforms.playerActive.value, 0);
});

check('unknown state fields are ignored (with a one-time warning)', () => {
  const before = getEnvironmentState();
  setEnvironmentState({ definitelyNotAField: 12 });
  assert.deepEqual(getEnvironmentState(), before);
});

const CYCLE = { dayLength: 600, nightLength: 480 };

check('day-cycle progress hits the four phase anchors', () => {
  assert.equal(dayCycleProgressFromTime(0, CYCLE), DAY_CYCLE_PHASE.sunrise);
  assert.equal(dayCycleProgressFromTime(300, CYCLE), DAY_CYCLE_PHASE.day);
  assert.equal(dayCycleProgressFromTime(600, CYCLE), DAY_CYCLE_PHASE.sunset);
  assert.equal(dayCycleProgressFromTime(600 + 240, CYCLE), DAY_CYCLE_PHASE.night);
});

check('day-cycle progress holds day and night between transitions', () => {
  for (const t of [120, 300, 480]) {
    assert.equal(dayCycleProgressFromTime(t, CYCLE), DAY_CYCLE_PHASE.day, `day hold at ${t}`);
  }
  for (const t of [760, 840, 990]) {
    assert.equal(dayCycleProgressFromTime(t, CYCLE), DAY_CYCLE_PHASE.night, `night hold at ${t}`);
  }
});

check('day-cycle progress is monotonic through each transition and wraps', () => {
  let previous = -1;
  for (let t = 530; t <= 700; t += 5) {
    const p = dayCycleProgressFromTime(t, CYCLE);
    assert.ok(p >= previous, `sunset/dusk monotonic at ${t}`);
    previous = p;
  }
  const beforeWrap = dayCycleProgressFromTime(1079, CYCLE);
  assert.ok(beforeWrap > 0.7 && beforeWrap < 1);
  assert.equal(dayCycleProgressFromTime(1080, CYCLE), dayCycleProgressFromTime(0, CYCLE));
});

check('pseudo-hour maps day to 06-18 and night to 18-06', () => {
  assert.equal(hourFromDayCycleTime(0, CYCLE), 6);
  assert.equal(hourFromDayCycleTime(300, CYCLE), 12);
  assert.equal(hourFromDayCycleTime(600, CYCLE), 18);
  assert.equal(hourFromDayCycleTime(600 + 240, CYCLE), 0);
});

check('day curves loop, interpolate, and support color targets', () => {
  const curve = fiveStopCurve([1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 0]);
  assert.deepEqual(sampleDayCurve(curve, 0), [1, 0, 0]);
  assert.deepEqual(sampleDayCurve(curve, 0.5), [0, 0, 1]);
  const mid = sampleDayCurve(curve, 0.125);
  assert.ok(Math.abs(mid[0] - 0.5) < 1e-6 && Math.abs(mid[1] - 0.5) < 1e-6);
  const wrap = sampleDayCurve(curve, 0.875);
  assert.ok(Math.abs(wrap[0] - 1) < 1e-6 && Math.abs(wrap[1] - 0.5) < 1e-6);
  const target = new THREE.Color();
  const sampled = sampleDayCurve(
    [{ at: 0, value: new THREE.Color(1, 0, 0) }, { at: 0.5, value: new THREE.Color(0, 0, 1) }],
    0.25,
    { target },
  );
  assert.equal(sampled, target);
  assert.ok(Math.abs(target.r - 0.5) < 1e-6 && Math.abs(target.b - 0.5) < 1e-6);
});

check('array-stop curves write into a THREE.Color target', () => {
  const curve = fiveStopCurve([1, 0, 0], [0, 1, 0], [0.1, 0.1, 0.4], [1, 1, 0]);
  const target = new THREE.Color(1, 1, 1);
  const sampled = sampleDayCurve(curve, 0.5, { target });
  assert.equal(sampled, target, 'must return the provided target');
  assert.ok(Math.abs(target.r - 0.1) < 1e-6 && Math.abs(target.b - 0.4) < 1e-6);
});

check('scalar curves interpolate numbers', () => {
  const curve = fiveStopCurve(1, 0.2, 0, 0.6);
  assert.equal(sampleDayCurve(curve, DAY_CYCLE_PHASE.night), 0);
  assert.ok(Math.abs(sampleDayCurve(curve, 0.125) - 0.6) < 1e-6);
});

console.log(`\nverify-environment-cycle: ${checks} checks passed`);
