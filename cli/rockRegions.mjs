import {
  HOODOO_CAPROCK_REGION_PROFILE_ID,
  compileRockRegionGlbFile,
} from '../src/rockgen/node.js';

export function rockRegionsUsage() {
  return [
    'Usage: toonlab rock-regions compile --input <rock.glb> --input-sha256 <sha256> --output <rock-regions.glb> --audit <audit.json> [options]',
    '',
    'Options:',
    `  --profile <id>       Compiler profile (only: ${HOODOO_CAPROCK_REGION_PROFILE_ID})`,
    '  --overwrite          Explicitly replace output and audit files',
    '  --pretty             Pretty-print the audit written to stdout',
    '',
    'This representative compiler only annotates the admitted hoodoo LOD0 GLB.',
    'It does not generate geology and must not be used for other rock families.',
  ].join('\n');
}

function parse(argv) {
  const [operation, ...rest] = argv;
  if (operation !== 'compile') throw new Error(rockRegionsUsage());
  const options = {
    overwrite: false,
    pretty: false,
    profile: HOODOO_CAPROCK_REGION_PROFILE_ID,
  };
  for (let index = 0; index < rest.length; index += 1) {
    const name = rest[index];
    if (name === '--overwrite') options.overwrite = true;
    else if (name === '--pretty') options.pretty = true;
    else if (['--input', '--input-sha256', '--output', '--audit', '--profile'].includes(name)) {
      const value = rest[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${name} requires a value.\n\n${rockRegionsUsage()}`);
      options[name.slice(2).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase())] = value;
      index += 1;
    } else {
      throw new Error(`Unknown option "${name}".\n\n${rockRegionsUsage()}`);
    }
  }
  for (const required of ['input', 'inputSha256', 'output', 'audit']) {
    if (!options[required]) throw new Error(`--${required.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`)} is required.\n\n${rockRegionsUsage()}`);
  }
  return options;
}

export async function runRockRegionsCli(argv, { stdout = process.stdout } = {}) {
  const options = parse(argv);
  const audit = await compileRockRegionGlbFile({
    inputPath: options.input,
    outputPath: options.output,
    auditPath: options.audit,
    inputSha256: options.inputSha256,
    profile: options.profile,
    overwrite: options.overwrite,
  });
  stdout.write(`${JSON.stringify(audit, null, options.pretty ? 2 : 0)}\n`);
  return 0;
}
