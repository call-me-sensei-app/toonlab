#!/usr/bin/env node
// Provenance guard: fails when the repository contains identifiers, numeric
// constants or product names that ToonLab's character shading must not carry.
// The forbidden values are stored as truncated SHA-256 hashes so this file
// does not reproduce them.
//
//   node scripts/verify-provenance.mjs

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SCAN = ['src', 'labs', 'scripts', 'docs', 'types', 'agents', 'mcp', 'examples', 'cli', 'README.md', 'package.json'];
const SKIP = new Set(['node_modules', 'assets-local', 'dist', 'build', '.git']);
const TEXT = new Set(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.json', '.md', '.mdc', '.html', '.css', '.glsl', '.wgsl']);
// Numeric constants are checked only where character shading lives.
const NUMERIC_SCOPE = [/^src\/toon\//, /^src\/shaders-tsl\/character\//, /^src\/shaders-tsl\/chunks\/character-/];

const FORBIDDEN_IDENTIFIERS = new Set(["916660f9bc515c85", "215f352b7fcc74d0", "cd76c6a9fcc75dae", "ae732c175584f455", "f5c413a4c87405f8", "34699376b2c1a93a", "11ad07ce238c6e02", "ef80dc2c48d12b22", "7567f72c40fe3ada", "c18264044f9bee3e", "f0f4e8a72adcb342", "66df9f36bdf0ba2a", "fee0ca2208b18e61", "786e26842f00d545", "39a47a950b81cec1", "5363fb2ab841cd28", "ac8306099eeac58c", "97cf2d2a79e45749", "ce415ec63152c530", "e887140a05be36b6", "c1dbae2891b9befb", "5ac61a1dc59ea290", "b438d646dc71614b", "06e4e9fb33b58bb0", "fd227953b41f5ab2", "8f5ef8a34f758692", "2eafcbfc3d25161e", "ad557a7529be5fed", "5038dce1171be374", "553c26b7bd1e43ea", "f0df084df3aa4492", "d4b6f0bf425d8062", "ba107c442c80e126", "53baff948266a269", "1872fe9d77628a50", "26e343157bbf352b", "bd891227bf83611d", "ba0d1c09e7b892f2", "bf73971e3311a452", "169132adffe30ade", "40f6b20cabd0b655", "52fca6ee27d878d9", "8e74180cc6378418", "fc085b2caecf9623", "8628423b2791cfe4", "e7a09c17c1637edd", "8f1808c994556302", "fda49a5d56c64cd0", "2e5f6a3f75ebc896", "542d7ec0a6f6e1d0", "412a616de6a9c24b", "341095c898d43dba", "c5e935ffda5ab4f4", "2c98e630caa61786"]);
const FORBIDDEN_NUMBERS = new Set(["001f1b33d6ab96b2", "31dd550a036488a5", "3110af3542c4bca0"]);
// A product name, assembled so this file does not contain it.
const NAME = String.fromCharCode(110, 105, 108, 111);

const hash = (value) => createHash('sha256').update(value).digest('hex').slice(0, 16);

function* files(path) {
  let stat;
  try {
    stat = statSync(path);
  } catch {
    return;
  }
  if (stat.isDirectory()) {
    for (const entry of readdirSync(path)) {
      if (!SKIP.has(entry)) yield* files(join(path, entry));
    }
  } else if (TEXT.has(extname(path)) || path.endsWith('package.json') || path.endsWith('README.md')) {
    yield path;
  }
}

const findings = [];
for (const top of SCAN) {
  for (const file of files(join(ROOT, top))) {
    const rel = relative(ROOT, file);
    if (rel === 'scripts/verify-provenance.mjs') continue;
    const text = readFileSync(file, 'utf8');
    const lines = text.split('\n');
    lines.forEach((line, index) => {
      const lower = line.toLowerCase();
      if (new RegExp(`(^|[^a-z])${NAME}`).test(lower)) findings.push(`${rel}:${index + 1}: product name`);
      for (const token of line.match(/[A-Za-z_$][A-Za-z0-9_$]*/g) ?? []) {
        if (FORBIDDEN_IDENTIFIERS.has(hash(token.toLowerCase()))) findings.push(`${rel}:${index + 1}: identifier ${token}`);
      }
      if (NUMERIC_SCOPE.some((pattern) => pattern.test(rel))) {
        for (const number of line.match(/\b\d+\.\d+\b/g) ?? []) {
          if (FORBIDDEN_NUMBERS.has(hash(number))) findings.push(`${rel}:${index + 1}: constant ${number}`);
        }
      }
    });
  }
}

if (findings.length) {
  console.error(`provenance: ${findings.length} finding(s)`);
  for (const line of findings.slice(0, 200)) console.error(`  ${line}`);
  process.exit(1);
}
console.log('provenance: clean');
