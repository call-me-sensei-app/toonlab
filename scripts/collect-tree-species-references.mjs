import {
  access,
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { extname, resolve } from 'node:path';
import { TREE_SPECIES_PROFILES } from '../src/vegetation/treeSpeciesProfiles.js';

const ROOT = resolve('docs/research/tree-species-references');
const IMAGE_ROOT = resolve(ROOT, 'images');
const MANIFEST_PATH = resolve(ROOT, 'manifest.json');
const RUNTIME_RESEARCH_PATH = resolve('src/vegetation/treeSpeciesResearch.generated.js');
const USER_AGENT = 'ToonlabSpeciesResearch/1.0 (local morphology reference collector)';
const REFRESH = process.argv.includes('--refresh');

function delay(milliseconds) {
  return new Promise((accept) => setTimeout(accept, milliseconds));
}

async function fetchWithRetry(url, options = {}, attempts = 6) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await fetch(url, {
      ...options,
      headers: {
        'user-agent': USER_AGENT,
        ...(options.headers ?? {}),
      },
    });
    if (response.ok) return response;
    if (response.status !== 429 || attempt === attempts - 1) {
      throw new Error(`${response.status} ${response.statusText}: ${url}`);
    }
    const retryAfter = Number(response.headers.get('retry-after'));
    await delay(Number.isFinite(retryAfter)
      ? Math.max(1500, retryAfter * 1000)
      : 2500 * (attempt + 1));
  }
  throw new Error(`Exhausted retries: ${url}`);
}

async function fetchJson(url) {
  const response = await fetchWithRetry(url, {
    headers: { accept: 'application/json' },
  });
  return response.json();
}

async function wikipediaSummary(profile) {
  const candidates = [
    profile.scientificName,
    profile.rosterScientificName,
  ];
  for (const name of candidates) {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name.replaceAll(' ', '_'))}`;
    try {
      const document = await fetchJson(url);
      if (document.type !== 'disambiguation' && document.extract) {
        return {
          description: document.description ?? null,
          extract: document.extract,
          pageUrl: document.content_urls?.desktop?.page ?? url,
          title: document.title,
        };
      }
    } catch {
      // Try the roster name before recording a missing description.
    }
  }
  return null;
}

function metadataValue(metadata, key) {
  return metadata?.[key]?.value ?? null;
}

function candidateScore(candidate, profile) {
  const title = candidate.title.toLocaleLowerCase();
  const scientific = profile.rosterScientificName.toLocaleLowerCase();
  const [genus, epithet] = scientific.split(/\s+/);
  let score = 0;
  if (title.includes(genus)) score += 8;
  if (title.includes(epithet)) score += 12;
  for (const token of ['tree', 'habit', 'whole', 'mature', 'plant', 'arboretum', 'garden']) {
    if (title.includes(token)) score += 5;
  }
  for (const token of ['leaf', 'leaves', 'flower', 'fruit', 'seed', 'bark', 'branch', 'herbarium', 'map']) {
    if (title.includes(token)) score -= 8;
  }
  const info = candidate.imageinfo?.[0];
  if (info?.height && info?.width) {
    const ratio = info.height / info.width;
    if (ratio >= 0.75 && ratio <= 1.8) score += 4;
    if (Math.min(info.height, info.width) >= 900) score += 3;
  }
  return score;
}

async function commonsReference(profile) {
  const query = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    generator: 'search',
    gsrnamespace: '6',
    gsrlimit: '30',
    gsrsearch: `"${profile.rosterScientificName}"`,
    iiprop: 'url|size|mime|extmetadata',
    iiurlwidth: '900',
    origin: '*',
    prop: 'imageinfo',
  });
  const document = await fetchJson(`https://commons.wikimedia.org/w/api.php?${query}`);
  const candidates = (document.query?.pages ?? [])
    .filter((candidate) => {
      const info = candidate.imageinfo?.[0];
      const license = metadataValue(info?.extmetadata, 'LicenseShortName') ?? '';
      return info?.thumburl
        && /^image\/(jpeg|png|webp)$/i.test(info.mime ?? '')
        && /(public domain|cc0|cc by|cc-by|cc by-sa|cc-by-sa)/i.test(license);
    })
    .sort((left, right) => candidateScore(right, profile) - candidateScore(left, profile));
  const candidate = candidates[0];
  if (!candidate) return null;
  const info = candidate.imageinfo[0];
  const extension = extname(new URL(info.thumburl).pathname).toLocaleLowerCase() || '.jpg';
  return {
    artist: metadataValue(info.extmetadata, 'Artist'),
    description: metadataValue(info.extmetadata, 'ImageDescription'),
    height: info.thumbheight,
    license: metadataValue(info.extmetadata, 'LicenseShortName'),
    licenseUrl: metadataValue(info.extmetadata, 'LicenseUrl'),
    originalUrl: info.url,
    pageUrl: info.descriptionurl,
    sourceTitle: candidate.title,
    thumbUrl: info.thumburl,
    width: info.thumbwidth,
    extension: ['.jpg', '.jpeg', '.png', '.webp'].includes(extension) ? extension : '.jpg',
    provider: 'Wikimedia Commons',
  };
}

function gbifCandidateScore(occurrence, medium, profile) {
  const title = `${medium.title ?? ''} ${medium.description ?? ''}`.toLocaleLowerCase();
  let score = 0;
  if (['HUMAN_OBSERVATION', 'OBSERVATION'].includes(occurrence.basisOfRecord)) score += 18;
  if (occurrence.scientificName?.toLocaleLowerCase().includes(
    profile.rosterScientificName.toLocaleLowerCase(),
  )) score += 12;
  if (occurrence.typeStatus) score -= 20;
  for (const token of ['tree', 'habit', 'whole', 'mature', 'plant', 'garden', 'arboretum']) {
    if (title.includes(token)) score += 5;
  }
  for (const token of ['leaf', 'flower', 'fruit', 'seed', 'bark', 'herbarium', 'specimen']) {
    if (title.includes(token)) score -= 7;
  }
  return score;
}

async function gbifReference(profile) {
  const query = new URLSearchParams({
    limit: '60',
    mediaType: 'StillImage',
    scientificName: profile.rosterScientificName,
  });
  const document = await fetchJson(`https://api.gbif.org/v1/occurrence/search?${query}`);
  const candidates = (document.results ?? []).flatMap((occurrence) => (
    (occurrence.media ?? []).map((medium) => ({ medium, occurrence }))
  )).filter(({ medium }) => (
    /^https?:\/\//.test(medium.identifier ?? '')
    && /(creativecommons|publicdomain|cc0)/i.test(medium.license ?? '')
  )).sort((left, right) => (
    gbifCandidateScore(right.occurrence, right.medium, profile)
    - gbifCandidateScore(left.occurrence, left.medium, profile)
  ));
  const candidate = candidates[0];
  if (!candidate) return null;
  const { medium, occurrence } = candidate;
  const extension = extname(new URL(medium.identifier).pathname).toLocaleLowerCase();
  return {
    artist: medium.creator ?? occurrence.recordedBy ?? null,
    description: medium.description ?? null,
    height: null,
    license: medium.license ?? occurrence.license ?? null,
    licenseUrl: medium.license ?? occurrence.license ?? null,
    originalUrl: medium.identifier,
    pageUrl: medium.references ?? occurrence.references
      ?? `https://www.gbif.org/occurrence/${occurrence.key}`,
    sourceTitle: medium.title ?? `${profile.scientificName} occurrence ${occurrence.key}`,
    thumbUrl: medium.identifier,
    width: null,
    extension: ['.jpg', '.jpeg', '.png', '.webp'].includes(extension) ? extension : '.jpg',
    provider: 'GBIF occurrence media',
    occurrenceKey: occurrence.key,
  };
}

async function downloadImage(reference, destination) {
  const response = await fetchWithRetry(reference.thumbUrl);
  await writeFile(destination, Buffer.from(await response.arrayBuffer()));
  const resized = spawnSync('/usr/bin/sips', ['-Z', '900', destination], {
    encoding: 'utf8',
  });
  if (resized.status !== 0) {
    throw new Error(`Failed to resize ${destination}: ${resized.stderr || resized.stdout}`);
  }
}

async function previousManifest() {
  try {
    return JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  } catch {
    return { species: {} };
  }
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

await mkdir(IMAGE_ROOT, { recursive: true });
const previous = await previousManifest();
const species = {};
const failures = [];
const warnings = [];
const profiles = [...TREE_SPECIES_PROFILES].sort((left, right) => (
  left.commonName.localeCompare(right.commonName, 'en', { sensitivity: 'base' })
));

for (const [index, profile] of profiles.entries()) {
  const cached = previous.species?.[profile.id];
  if (!REFRESH
    && cached?.referenceImage?.localPath
    && cached?.summary
    && await fileExists(resolve(ROOT, cached.referenceImage.localPath))) {
    species[profile.id] = cached;
    continue;
  }
  process.stdout.write(`[${index + 1}/${profiles.length}] ${profile.scientificName}\n`);
  const recordFailures = [];
  const summary = await wikipediaSummary(profile).catch((error) => {
    recordFailures.push(`summary: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  });
  await delay(350);
  let reference = await gbifReference(profile).catch((error) => {
    recordFailures.push(`GBIF image search: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  });
  if (!reference) {
    await delay(350);
    reference = await commonsReference(profile).catch((error) => {
      recordFailures.push(`Commons image search: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    });
  }
  const imageName = reference ? `${profile.id}${reference.extension}` : null;
  let downloaded = false;
  if (reference && imageName) {
    await delay(150);
    downloaded = await downloadImage(reference, resolve(IMAGE_ROOT, imageName)).then(
      () => true,
      (error) => {
      recordFailures.push(`image download: ${error instanceof Error ? error.message : String(error)}`);
        return false;
      },
    );
  }
  if (recordFailures.length) {
    warnings.push({ id: profile.id, errors: recordFailures });
  }
  if (!summary || !(reference && downloaded)) {
    failures.push({
      id: profile.id,
      errors: [
        ...(!summary ? ['missing descriptive summary'] : []),
        ...(!(reference && downloaded) ? ['missing local licensed image'] : []),
      ],
    });
  }
  try {
    species[profile.id] = {
      id: profile.id,
      commonName: profile.commonName,
      scientificName: profile.scientificName,
      rosterScientificName: profile.rosterScientificName,
      family: profile.family,
      genus: profile.genus,
      architectureId: profile.architectureId,
      engine: profile.engine,
      powoUrl: profile.powoUrl,
      taxonomyBackbone: profile.taxonomyBackbone,
      summary,
      referenceImage: reference && downloaded ? {
        ...reference,
        localPath: `images/${imageName}`,
      } : null,
      currentTraits: profile.structuralTraits,
      collectedAt: new Date().toISOString(),
    };
  } catch (error) {
    failures.push({ id: profile.id, errors: [error instanceof Error ? error.message : String(error)] });
    species[profile.id] = cached ?? {
      id: profile.id,
      commonName: profile.commonName,
      scientificName: profile.scientificName,
      powoUrl: profile.powoUrl,
      summary: null,
      referenceImage: null,
    };
  }
}

const manifest = {
  schema: 'toonlabTreeSpeciesReferenceManifest',
  version: 1,
  speciesCount: profiles.length,
  species,
  failures,
  warnings,
  generatedAt: new Date().toISOString(),
  sources: {
    taxonomy: 'Kew Plants of the World Online / pinned WCVP backbone',
    descriptiveText: 'English Wikipedia summaries, retained only as secondary morphology notes',
    visualEvidence: 'GBIF occurrence media and Wikimedia Commons openly licensed whole-plant imagery',
  },
};
await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
const runtimeRecords = Object.fromEntries(
  Object.entries(species).map(([id, record]) => [id, {
    powoUrl: record.powoUrl,
    summaryUrl: record.summary?.pageUrl ?? null,
    summaryTitle: record.summary?.title ?? null,
    referenceImagePageUrl: record.referenceImage?.pageUrl ?? null,
    referenceImagePath: record.referenceImage?.localPath
      ? `docs/research/tree-species-references/${record.referenceImage.localPath}`
      : null,
    referenceImageLicense: record.referenceImage?.license ?? null,
    referenceImageLicenseUrl: record.referenceImage?.licenseUrl ?? null,
    referenceImageProvider: record.referenceImage?.provider ?? null,
  }]),
);
const runtimeModule = `// Generated by scripts/collect-tree-species-references.mjs.
// Evidence metadata only: reference images are QA inputs, never runtime textures.
const RECORDS = ${JSON.stringify(runtimeRecords, null, 2)};

export const TREE_SPECIES_RESEARCH = Object.freeze(Object.fromEntries(
  Object.entries(RECORDS).map(([id, record]) => [
    id,
    Object.freeze({
      ...record,
      referenceSources: Object.freeze([
        record.powoUrl,
        record.summaryUrl,
        record.referenceImagePageUrl,
      ].filter(Boolean)),
    }),
  ]),
));
`;
await writeFile(RUNTIME_RESEARCH_PATH, runtimeModule);
process.stdout.write(
  `Stored ${Object.keys(species).length} species records; ${failures.length} failures, ${warnings.length} warnings.\n`,
);
