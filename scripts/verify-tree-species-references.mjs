import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { TREE_SPECIES_PROFILES } from '../src/vegetation/treeSpeciesProfiles.js';
import { TREE_SPECIES_RESEARCH } from '../src/vegetation/treeSpeciesResearch.generated.js';

const root = resolve('docs/research/tree-species-references');
const manifest = JSON.parse(await readFile(resolve(root, 'manifest.json'), 'utf8'));
const errors = [];

if (manifest.schema !== 'toonlabTreeSpeciesReferenceManifest' || manifest.version !== 1) {
  errors.push('Reference manifest schema/version is invalid.');
}
if (manifest.speciesCount !== TREE_SPECIES_PROFILES.length) {
  errors.push(`Expected ${TREE_SPECIES_PROFILES.length} species; received ${manifest.speciesCount}.`);
}
if ((manifest.failures?.length ?? 0) > 0) {
  errors.push(`Reference collection contains ${manifest.failures.length} unresolved failures.`);
}

for (const profile of TREE_SPECIES_PROFILES) {
  const record = manifest.species?.[profile.id];
  const runtimeRecord = TREE_SPECIES_RESEARCH[profile.id];
  if (!record) {
    errors.push(`${profile.id}: missing research record.`);
    continue;
  }
  if (!runtimeRecord
    || runtimeRecord.referenceSources.length < 3
    || runtimeRecord.referenceImagePath
      !== `docs/research/tree-species-references/${record.referenceImage?.localPath}`) {
    errors.push(`${profile.id}: generated runtime evidence metadata is missing or stale.`);
  }
  if (record.scientificName !== profile.scientificName) {
    errors.push(`${profile.id}: scientific name drift.`);
  }
  if (!record.powoUrl) errors.push(`${profile.id}: missing pinned Kew source.`);
  if (!record.summary?.pageUrl || !record.summary?.extract) {
    errors.push(`${profile.id}: missing descriptive research source.`);
  }
  const image = record.referenceImage;
  if (!image?.localPath || !image?.pageUrl || !image?.license) {
    errors.push(`${profile.id}: missing local licensed reference-image evidence.`);
    continue;
  }
  try {
    await access(resolve(root, image.localPath));
  } catch {
    errors.push(`${profile.id}: local reference image does not exist.`);
  }
}

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join('\n'));
  process.exit(1);
}

console.log(
  `Verified source metadata and local reference images for ${TREE_SPECIES_PROFILES.length} species.`,
);
