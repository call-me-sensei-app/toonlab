import { readFile } from 'node:fs/promises';

import { exportAutoRolesForFile } from '../src/toon/autoRolesGlb.node.js';

export function autoRolesUsage() {
  return [
    'Usage: toonlab auto-roles <model.glb> [<model.glb> ...] [options]',
    '',
    'Precomputes ToonLab automatic face/skin/hair roles so the runtime can apply them with',
    "applyToonShader(model, { autoRoles: { mode: 'precomputed', data } }) and never read texture",
    'pixels. Writes <name>.toonroles.json and <name>.toonroles.<mesh>.png next to each model.',
    '',
    'Options:',
    '  --options <file.json>  applyToonShader options the runtime converts with',
    '                         (materialRoles, alpha, autoRoles.skinTolerance, ...)',
    '  --forward <x,y,z>      Rest-pose facing the runtime declares (root.userData.toonForward)',
    '  --mask-size <px>       Cap the role mask size (box filter, e.g. 512 for phones)',
    '  --out-dir <dir>        Write next to this directory instead of next to each model',
    '  --pretty               Pretty-print the JSON written and printed',
    '',
    'Needs sharp to decode textures (npm install --save-dev sharp). Run it on the GLB with its',
    'source JPEG/PNG/WebP images; compress the base colour to KTX2 afterwards (UVs are unchanged).',
  ].join('\n');
}

function parseVector(text, name) {
  const values = String(text).split(',').map(Number);
  if (values.length !== 3 || values.some((value) => !Number.isFinite(value))) throw new Error(`${name} must be three numbers, e.g. -1,0,0.`);
  return values;
}

function parse(argv) {
  const options = { files: [], forward: null, maskSize: Infinity, optionsFile: null, outDir: null, pretty: false };
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (name === '--pretty') {
      options.pretty = true;
      continue;
    }
    if (['--options', '--forward', '--mask-size', '--out-dir'].includes(name)) {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${name} requires a value.\n\n${autoRolesUsage()}`);
      index += 1;
      if (name === '--options') options.optionsFile = value;
      else if (name === '--forward') options.forward = parseVector(value, name);
      else if (name === '--out-dir') options.outDir = value;
      else {
        options.maskSize = Number(value);
        if (!(options.maskSize >= 1)) throw new Error(`--mask-size must be a positive number of pixels.\n\n${autoRolesUsage()}`);
      }
      continue;
    }
    if (name.startsWith('--')) throw new Error(`Unknown option "${name}".\n\n${autoRolesUsage()}`);
    options.files.push(name);
  }
  if (!options.files.length) throw new Error(autoRolesUsage());
  return options;
}

export async function runAutoRolesCommand(argv) {
  const options = parse(argv);
  const toonOptions = options.optionsFile ? JSON.parse(await readFile(options.optionsFile, 'utf8')) : {};
  const results = [];
  for (const file of options.files) {
    const result = await exportAutoRolesForFile(file, {
      forward: options.forward,
      maskSize: options.maskSize,
      options: toonOptions,
      outDir: options.outDir ?? undefined,
      pretty: options.pretty,
    });
    const autoRoles = result.autoRoles;
    const warnings = result.report.filter((entry) => entry.level === 'warn').map((entry) => `${entry.code}: ${entry.message}`);
    results.push({
      analysisMs: result.analysisMs,
      applied: Boolean(autoRoles?.applied),
      file,
      files: result.files,
      maskedMeshes: autoRoles?.maskedMeshes ?? 0,
      method: autoRoles?.method ?? null,
      reason: autoRoles ? autoRoles.reason ?? null : 'a material is named as a face; automatic roles do not run',
      warnings,
    });
    for (const warning of warnings) process.stderr.write(`${file}: ${warning}\n`);
  }
  process.stdout.write(`${JSON.stringify(results, null, options.pretty ? 2 : 0)}\n`);
}
