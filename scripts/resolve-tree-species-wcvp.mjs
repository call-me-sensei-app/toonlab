import { createInterface } from 'node:readline';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { TREE_SPECIES_ROSTER } from '../src/vegetation/treeSpeciesRoster.js';

const archivePath = resolve(process.argv[2] ?? '');
const outputPath = resolve(
  process.argv[3] ?? new URL('../src/vegetation/treeSpeciesTaxonomy.generated.js', import.meta.url).pathname,
);
if (!process.argv[2]) {
  throw new Error('Usage: node scripts/resolve-tree-species-wcvp.mjs <wcvp_dwca.zip> [output-file]');
}

function canonicalName(row) {
  return `${row[2] ?? ''} ${row[3] ?? ''}`.trim();
}

async function scan(predicate) {
  const unzip = spawn('unzip', ['-p', archivePath, 'wcvp_taxon.csv'], {
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const matches = [];
  const lines = createInterface({ input: unzip.stdout, crlfDelay: Infinity });
  let first = true;
  for await (const line of lines) {
    if (first) {
      first = false;
      continue;
    }
    const row = line.split('|');
    if (predicate(row)) matches.push(row);
  }
  const exitCode = await new Promise((complete) => unzip.on('close', complete));
  if (exitCode !== 0) throw new Error(`unzip exited with code ${exitCode}`);
  return matches;
}

const requested = new Map(TREE_SPECIES_ROSTER.map((entry) => [entry.scientificName, entry]));
const directRows = await scan((row) => requested.has(canonicalName(row)));
const directByName = new Map();
function matchScore(row) {
  return (row[8] === 'Accepted' ? 2 : 0) + (row[7] === 'Species' ? 1 : 0);
}
for (const row of directRows) {
  const name = canonicalName(row);
  const existing = directByName.get(name);
  if (!existing || matchScore(row) > matchScore(existing)) directByName.set(name, row);
}

const acceptedIds = new Set();
for (const entry of TREE_SPECIES_ROSTER) {
  const row = directByName.get(entry.scientificName);
  if (!row) continue;
  acceptedIds.add(row[8] === 'Accepted' ? row[0] : row[9]);
}
const acceptedRows = await scan((row) => acceptedIds.has(row[0]));
const acceptedById = new Map(acceptedRows.map((row) => [row[0], row]));

const unresolved = [];
const taxonomy = {};
for (const entry of TREE_SPECIES_ROSTER) {
  const matched = directByName.get(entry.scientificName);
  const acceptedId = matched?.[8] === 'Accepted' ? matched[0] : matched?.[9];
  const accepted = acceptedById.get(acceptedId);
  if (!matched || !accepted || accepted[8] !== 'Accepted') {
    unresolved.push(entry.scientificName);
    continue;
  }
  taxonomy[entry.id] = {
    taxonId: accepted[0],
    family: accepted[1],
    genus: accepted[2],
    specificEpithet: accepted[3],
    scientificName: accepted[5],
    scientificNameAuthorship: accepted[6],
    rank: accepted[7],
    taxonomicStatus: accepted[8].toLowerCase(),
    scientificNameId: accepted[15],
    references: accepted[17],
    matchedName: matched[5],
    matchedTaxonId: matched[0],
  };
}
if (unresolved.length) {
  throw new Error(`WCVP resolution failed for ${unresolved.length} taxa: ${unresolved.join(', ')}`);
}

const source = `// Generated from Kew WCVP Darwin Core archive 2026-06-04.
// Do not edit manually; run scripts/resolve-tree-species-wcvp.mjs.
export const TREE_SPECIES_TAXONOMY_SOURCE = Object.freeze({
  id: 'kew-wcvp',
  version: '2026-06-04',
  license: 'CC-BY-3.0',
  url: 'https://sftp.kew.org/pub/data-repositories/WCVP/wcvp_dwca.zip',
});

export const TREE_SPECIES_TAXONOMY = Object.freeze(${JSON.stringify(taxonomy, null, 2)});
`;
await writeFile(outputPath, source);
console.log(`Resolved ${Object.keys(taxonomy).length} accepted taxa to ${outputPath}`);
