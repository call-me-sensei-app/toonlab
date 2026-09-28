#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';

import { SCENE_STYLE_OPERATION_NAMES, runSceneStyleOperation } from '../src/agents/index.js';

function usage() {
  return [
    'Usage: toonlab <inspect|audit|plan|apply|verify> --input <scene.json> [options]',
    '',
    'Options:',
    '  --bundle <id>       Style bundle id (default: call-me-sensei)',
    '  --mode <mode>       strict or advisory (default: advisory)',
    '  --out <path>        Write the operation JSON to a file',
    '  --write-manifest    With apply, replace --input with the styled manifest',
    '  --pretty            Pretty-print JSON',
  ].join('\n');
}

function parse(argv) {
  const [operation, ...rest] = argv;
  if (!SCENE_STYLE_OPERATION_NAMES.includes(operation)) throw new Error(usage());
  const options = { bundle: 'call-me-sensei', mode: 'advisory', pretty: false, writeManifest: false };
  for (let index = 0; index < rest.length; index += 1) {
    const name = rest[index];
    if (name === '--pretty') options.pretty = true;
    else if (name === '--write-manifest') options.writeManifest = true;
    else if (['--bundle', '--input', '--mode', '--out'].includes(name)) {
      if (!rest[index + 1]) throw new Error(`${name} requires a value.\n\n${usage()}`);
      options[name.slice(2)] = rest[index + 1];
      index += 1;
    } else throw new Error(`Unknown option "${name}".\n\n${usage()}`);
  }
  if (!options.input) throw new Error(`--input is required.\n\n${usage()}`);
  return { operation, options };
}

try {
  const argv = process.argv.slice(2);
  const { operation, options } = parse(argv);
  const input = JSON.parse(await readFile(options.input, 'utf8'));
  const result = runSceneStyleOperation(operation, input, options);
  const json = `${JSON.stringify(result, null, options.pretty ? 2 : 0)}\n`;
  if (options.out) await writeFile(options.out, json, 'utf8');
  else process.stdout.write(json);
  if (operation === 'apply' && options.writeManifest && result.ok) {
    await writeFile(options.input, `${JSON.stringify(result.manifest, null, 2)}\n`, 'utf8');
  }
  if (!result.ok) process.exitCode = 2;
} catch (error) {
  process.stderr.write(`${error?.code ? `${error.code}: ` : ''}${error?.message ?? String(error)}\n`);
  process.exitCode = 1;
}
