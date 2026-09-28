import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultRoot = fileURLToPath(new URL('../../', import.meta.url));
const entry = 'src/rockgen/surface/naturalRockSurface.js';
const helper = 'scripts/lib/rock-surface-provenance.mjs';
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** Hash the implementation, its local dependency closure, and this hash contract. */
export async function readRockSurfaceProvenance({ root = defaultRoot, readSource = readFile } = {}) {
  const pending = [entry];
  const records = new Map();
  while (pending.length) {
    const path = pending.pop();
    if (records.has(path)) continue;
    const bytes = await readSource(resolve(root, path));
    records.set(path, { path, sha256: digest(bytes) });
    for (const match of bytes.toString().matchAll(/(?:import|export)\s+(?:[^'";]*?\s+from\s*)?['"]([^'"]+)['"]/g)) {
      if (!match[1].startsWith('.')) throw new Error(`Surface provenance requires a local dependency: ${match[1]}`);
      const dependency = relative(root, resolve(root, dirname(path), match[1])).split(sep).join('/');
      if (dependency.startsWith('../')) throw new Error('Surface dependency escapes the repository');
      pending.push(dependency);
    }
  }
  records.set(helper, { path: helper, sha256: digest(await readSource(resolve(root, helper))) });
  const files = [...records.values()].sort((a, b) => a.path.localeCompare(b.path));
  const schema = 'toonlab/rock-surface-implementation-v1';
  return { schema, files, sha256: digest(JSON.stringify({ schema, files })) };
}
