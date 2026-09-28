import { readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

import {
  comparePngBuffers,
  metricsPass,
} from './golden-image-metrics.mjs';

const referenceDir = resolve(process.argv[2] ?? process.env.GOLDEN_REFERENCE_DIR ?? '');
const candidateDir = resolve(process.argv[3] ?? process.env.GOLDEN_CANDIDATE_DIR ?? '');
if (!process.argv[2] && !process.env.GOLDEN_REFERENCE_DIR ||
    !process.argv[3] && !process.env.GOLDEN_CANDIDATE_DIR) {
  console.error('Usage: npm run golden:compare -- /path/to/reference /path/to/candidate');
  process.exit(1);
}

const matrix = JSON.parse(await readFile(
  new URL('../quality/call-me-sensei-golden-matrix.json', import.meta.url),
  'utf8',
));
const thresholds = {
  ...matrix.capture.thresholds,
  ...(process.env.GOLDEN_THRESHOLDS_JSON
    ? JSON.parse(process.env.GOLDEN_THRESHOLDS_JSON)
    : {}),
};

async function pngNames(directory) {
  return (await readdir(directory)).filter((name) => name.endsWith('.png')).sort();
}

const referenceNames = await pngNames(referenceDir);
const candidateNames = new Set(await pngNames(candidateDir));
const missing = referenceNames.filter((name) => !candidateNames.has(name));
const results = [];
for (const name of referenceNames.filter((entry) => candidateNames.has(entry))) {
  const [reference, candidate] = await Promise.all([
    readFile(join(referenceDir, name)),
    readFile(join(candidateDir, name)),
  ]);
  const metrics = comparePngBuffers(reference, candidate, thresholds);
  results.push({ file: name, metrics, pass: metricsPass(metrics, thresholds) });
}

const report = {
  candidateDir,
  failed: results.filter((result) => !result.pass).map((result) => result.file),
  missing,
  referenceDir,
  results,
  schema: 'toonlab/golden-comparison-report@1',
  thresholds,
};
const reportPath = process.env.GOLDEN_REPORT_PATH || join(candidateDir, 'comparison-report.json');
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  compared: results.length,
  failed: report.failed,
  missing,
  reportPath,
  thresholds,
}, null, 2));
if (missing.length > 0 || report.failed.length > 0 || results.length === 0) process.exitCode = 1;
