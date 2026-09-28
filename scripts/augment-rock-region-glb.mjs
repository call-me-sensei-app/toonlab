#!/usr/bin/env node

// Compatibility wrapper retained for the C11 research command. The packaged,
// supported command is `toonlab rock-regions compile` and remains deliberately
// limited to the admitted hoodoo LOD0 profile.
import {
  HOODOO_CAPROCK_REGION_PROFILE_ID,
  compileHoodooResearchRockRegionGlbFile,
} from '../src/rockgen/rockRegionGlbCompiler.node.js';

function parseArguments(argv) {
  const result = {
    inputSha256: null,
    overwrite: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--overwrite') {
      result.overwrite = true;
      continue;
    }
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase());
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${token}`);
    result[key] = value;
    index += 1;
  }
  for (const required of ['input', 'output', 'audit']) {
    if (!result[required]) throw new Error(`Required argument missing: --${required}`);
  }
  return result;
}

try {
  const args = parseArguments(process.argv.slice(2));
  if (args.profile && args.profile !== HOODOO_CAPROCK_REGION_PROFILE_ID) {
    throw new Error(`Unsupported profile: ${args.profile}. Expected ${HOODOO_CAPROCK_REGION_PROFILE_ID}.`);
  }
  const audit = await compileHoodooResearchRockRegionGlbFile({
    inputPath: args.input,
    outputPath: args.output,
    auditPath: args.audit,
    inputSha256: args.inputSha256,
    overwrite: args.overwrite,
  });
  process.stdout.write(`${JSON.stringify(audit, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error?.code ? `${error.code}: ` : ''}${error?.message ?? String(error)}\n`);
  process.exitCode = 1;
}
