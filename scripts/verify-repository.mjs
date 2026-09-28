import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
  .split('\0').filter(Boolean);

// Check the Git index: .gitignore alone cannot remove already tracked files.
const rootFiles = new Set([
  '.env.example', '.gitignore', 'AGENTS.md', 'ATTRIBUTION.md', 'LICENSE',
  'NPM-LIBRARY.md', 'README.md', 'compose.yaml', 'index.html', 'package.json',
  'package-lock.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'vite.config.js',
]);
const hiddenFiles = new Set(['.env.example', '.gitignore', '.npmignore']);
const forbidden = files.filter((path) => {
  if (!path.includes('/') && !rootFiles.has(path)) return true;
  return path.split('/').some((part) => part.startsWith('.')
    && part !== '.github' && !hiddenFiles.has(part));
});
assert.deepEqual(forbidden, [], 'Public repository contains unexpected root files or hidden state');
const ignored = execFileSync('git', ['ls-files', '-ci', '--exclude-standard', '-z'], {
  cwd: root, encoding: 'utf8',
}).split('\0').filter(Boolean);
assert.deepEqual(ignored, [], 'Public repository contains tracked build output, local data, or credentials');

// Match credential values, never ordinary environment variable names.
const secretPatterns = [
  '-----BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY-----',
  '(ghp_|gho_)[A-Za-z0-9]{30,}',
  'AKIA[A-Z0-9]{16}',
  'sk_live_[A-Za-z0-9]{20,}',
];
const scan = spawnSync('git', [
  'grep', '--cached', '-I', '-l', '-E',
  ...secretPatterns.flatMap((pattern) => ['-e', pattern]),
  '--', '.', ':!scripts/verify-repository.mjs',
], { cwd: root, encoding: 'utf8' });
assert.ok(scan.status === 0 || scan.status === 1, scan.stderr || 'Credential scan failed');
assert.equal(scan.status, 1, `Possible credentials in tracked files: ${scan.stdout.trim()}`);

const tracked = new Set(files);
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
for (const [name, command] of Object.entries(packageJson.scripts)) {
  for (const match of command.matchAll(/\bscripts\/[\w./-]+\.(?:mjs|js|py)/g)) {
    assert.ok(tracked.has(match[0]), `npm script ${name} refers to untracked ${match[0]}`);
  }
}
console.log(`Public repository verified: ${files.length} tracked files, no private artifacts or credential patterns, npm script targets present.`);
