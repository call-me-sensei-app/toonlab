import assert from 'node:assert/strict';

import {
  createGeneratorRecipeDocument,
  createSeededRandom,
  deepMerge,
  generateDomainValues,
  hashValue,
  parseGeneratorRecipeDocument,
  resolveGeneratorRecipe,
  sampleDomain,
  serializeGeneratorRecipeDocument,
  validateGeneratorDomains,
} from '../src/core/generation.js';

const domains = {
  enabled: { $type: 'boolean', probability: 0.7 },
  nested: {
    amount: { $type: 'range', min: -2, max: 3, step: 0.01 },
    color: { $type: 'color', from: [0.1, 0.2, 0.3], to: [0.8, 0.9, 1] },
    mode: { $type: 'choice', options: [{ value: 'soft', weight: 3 }, { value: 'hard', weight: 1 }] },
  },
};

const a = generateDomainValues(domains, { seed: 'demo' });
const b = generateDomainValues(domains, { seed: 'demo' });
assert.deepEqual(a, b, 'same domains and seed must reproduce exactly');
assert.notDeepEqual(a, generateDomainValues(domains, { seed: 'different' }));

const oldAmount = a.nested.amount;
const expanded = generateDomainValues({ ...domains, unrelated: { $type: 'range', min: 0, max: 1 } }, { seed: 'demo' });
assert.equal(expanded.nested.amount, oldAmount, 'named streams isolate fields from schema additions');

const locked = generateDomainValues(domains, {
  current: { nested: { amount: 99 } },
  locks: ['nested.amount'],
  seed: 'demo',
});
assert.equal(locked.nested.amount, 99);

const recipe = createGeneratorRecipeDocument('test', 'infinite-demo', {
  basePreset: 'default',
  configuration: { nested: { amount: 0.25 } },
  domains,
  locks: ['nested.amount'],
  seed: 'recipe-seed',
});
const serialized = serializeGeneratorRecipeDocument('test', recipe);
const parsed = parseGeneratorRecipeDocument(serialized, { domain: 'test' });
assert.equal(parsed.ok, true);
assert.deepEqual(parsed.value, recipe);

const resolved = resolveGeneratorRecipe(recipe, { baseSettings: { retained: true } });
assert.equal(resolved.retained, true);
assert.equal(resolved.nested.amount, 0.25);

assert.deepEqual(deepMerge({ a: { b: 1 }, list: [1] }, { a: { c: 2 }, list: [2] }), {
  a: { b: 1, c: 2 },
  list: [2],
});
assert.equal(sampleDomain({ $type: 'range', integer: true, min: 3, max: 3 }, createSeededRandom(1)), 3);

const signatures = new Set();
for (let seed = 1; seed <= 10_000; seed += 1) {
  const value = generateDomainValues(domains, { seed });
  assert.equal(Number.isFinite(value.nested.amount), true);
  assert.equal(value.nested.color.every(Number.isFinite), true);
  signatures.add(hashValue(value));
}
assert.ok(signatures.size > 9_500, `expected diverse generation; received ${signatures.size} signatures`);

const future = parseGeneratorRecipeDocument({ ...recipe, version: 999 }, { domain: 'test' });
assert.equal(future.ok, false);
assert.equal(parseGeneratorRecipeDocument('{bad json', { domain: 'test' }).ok, false);

for (const malformed of [
  { bad: { $type: 'wat' } },
  { bad: { $type: 'range', min: 2, max: 1 } },
  { bad: { $type: 'range', min: 0, max: 1, step: 0 } },
  { bad: { $type: 'range', distribution: 'log', min: 0, max: 1 } },
  { bad: { $type: 'choice', options: [] } },
  { bad: { $type: 'choice', options: [{ value: 'x', weight: -1 }] } },
  { bad: { $type: 'boolean', probability: 2 } },
  { bad: { $type: 'color', from: [0, Number.NaN, 1], to: [1, 1, 1] } },
  { bad: { $type: 'constant' } },
]) {
  assert.equal(validateGeneratorDomains(malformed).ok, false, JSON.stringify(malformed));
  assert.throws(() => createGeneratorRecipeDocument('test', 'bad-domain', { domains: malformed }));
}

const circularDomains = {};
circularDomains.loop = circularDomains;
assert.equal(validateGeneratorDomains(circularDomains).ok, false);

console.log(`generation verifier passed (${signatures.size} unique results / 10,000 seeds)`);
