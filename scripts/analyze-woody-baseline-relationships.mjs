#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const privateRoot = resolve(root, 'assets-local', 'TreeDesigner');
const inspectionPath = resolve(
  process.env.TOONLAB_WOODY_BASELINE_INSPECTION
    ?? resolve(privateRoot, 'research', 'inspection-2026-07-29.json'),
);
const adapterPath = resolve(
  process.env.TOONLAB_WOODY_BASELINE_ADAPTER
    ?? resolve(privateRoot, 'toonlab-woody-adapter.json'),
);
const outputPath = resolve(
  process.argv[2]
    ?? resolve(privateRoot, 'research', 'full-capability-analysis.json'),
);

const inspection = JSON.parse(readFileSync(inspectionPath, 'utf8'));
const adapter = JSON.parse(readFileSync(adapterPath, 'utf8'));
const controls = Object.entries(adapter.controlMap ?? {});
const assets = inspection.assets ?? [];

function sourceValue(asset, socket) {
  return asset.modifiers
    ?.find((modifier) => modifier.nodeGroup === 'TreeDesigner')
    ?.inputs?.[socket]?.value;
}

function neutralValue(spec, value) {
  if (!spec.enum) return value;
  const reverse = Object.fromEntries(
    Object.entries(spec.enum).map(([neutral, source]) => [source, neutral]),
  );
  return reverse[value] ?? value;
}

function quantile(sorted, fraction) {
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] * (upper - position) + sorted[upper] * (position - lower);
}

function summarize(values) {
  const usable = values.filter((value) => value !== null && value !== undefined);
  if (!usable.length) return { count: 0 };
  if (usable.every((value) => typeof value === 'number')) {
    const sorted = [...usable].sort((left, right) => left - right);
    return {
      count: sorted.length,
      min: sorted[0],
      q1: quantile(sorted, 0.25),
      median: quantile(sorted, 0.5),
      q3: quantile(sorted, 0.75),
      max: sorted.at(-1),
      unique: new Set(sorted).size,
    };
  }
  const counts = new Map();
  for (const value of usable) {
    const key = JSON.stringify(value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return {
    count: usable.length,
    values: Object.fromEntries(
      [...counts].sort((left, right) => right[1] - left[1]),
    ),
  };
}

function pearson(left, right) {
  const pairs = left
    .map((value, index) => [value, right[index]])
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
  if (pairs.length < 3) return null;
  const meanA = pairs.reduce((sum, [value]) => sum + value, 0) / pairs.length;
  const meanB = pairs.reduce((sum, [, value]) => sum + value, 0) / pairs.length;
  let numerator = 0;
  let squareA = 0;
  let squareB = 0;
  for (const [a, b] of pairs) {
    const deltaA = a - meanA;
    const deltaB = b - meanB;
    numerator += deltaA * deltaB;
    squareA += deltaA * deltaA;
    squareB += deltaB * deltaB;
  }
  const denominator = Math.sqrt(squareA * squareB);
  return denominator > 1e-12
    ? { samples: pairs.length, value: numerator / denominator }
    : null;
}

const valuesByControl = Object.fromEntries(controls.map(([id, spec]) => [
  id,
  assets.map((asset) => neutralValue(spec, sourceValue(asset, spec.socket))),
]));
const summaries = Object.fromEntries(
  controls.map(([id]) => [id, summarize(valuesByControl[id])]),
);
const numericControls = controls
  .map(([id]) => id)
  .filter((id) => valuesByControl[id].every((value) => typeof value === 'number'))
  .filter((id) => new Set(valuesByControl[id]).size > 1);
const relationships = [];
for (let leftIndex = 0; leftIndex < numericControls.length; leftIndex += 1) {
  for (let rightIndex = leftIndex + 1; rightIndex < numericControls.length; rightIndex += 1) {
    const left = numericControls[leftIndex];
    const right = numericControls[rightIndex];
    const correlation = pearson(valuesByControl[left], valuesByControl[right]);
    if (correlation && Math.abs(correlation.value) >= 0.65) {
      relationships.push({
        left,
        right,
        correlation: Number(correlation.value.toFixed(6)),
        samples: correlation.samples,
      });
    }
  }
}
relationships.sort(
  (left, right) => Math.abs(right.correlation) - Math.abs(left.correlation),
);

const exactIds = controls
  .filter(([, spec]) => spec.mode === 'exact')
  .map(([id]) => id);
const structuralFingerprints = new Set(assets.map((asset) =>
  JSON.stringify(exactIds.map((id) => valuesByControl[id][assets.indexOf(asset)]))));
const analysis = {
  schema: 'toonlabWoodyCapabilityAnalysis',
  version: 1,
  note: 'Neutral aggregate behavior evidence only; no source presets, object names, or socket identifiers.',
  assetsAudited: assets.length,
  cohortsAudited: Object.keys(inspection.assetFamilies ?? {}).length,
  connectedControlsAudited: controls.length,
  exactGraphControls: exactIds.length,
  uniqueExactControlConfigurations: structuralFingerprints.size,
  controls: summaries,
  strongNumericRelationships: relationships,
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(analysis, null, 2)}\n`);
console.log(JSON.stringify({
  output: outputPath,
  assetsAudited: analysis.assetsAudited,
  controlsAudited: analysis.connectedControlsAudited,
  uniqueExactControlConfigurations: analysis.uniqueExactControlConfigurations,
  strongNumericRelationships: analysis.strongNumericRelationships.length,
}, null, 2));

