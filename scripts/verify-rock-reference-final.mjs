#!/usr/bin/env node

/**
 * Independent, fail-closed gate for the C8 final reference packages.
 *
 * This verifier intentionally does not mutate any package.  It reads the
 * taxonomy, proposal/production reports, and whatever has landed under
 * morphology/reference-final/{clasts,residuals,cliffs,forms}; it writes only
 * a compact JSON and Markdown report under reference-final/audit/.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

import { decodePng } from './golden-image-metrics.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const morphologyRoot = path.join(
  repositoryRoot,
  'artifacts/research/rock-geology-v2/checkpoint-08-basis-families/morphology',
);
const defaultFinalRoot = path.join(morphologyRoot, 'reference-final');
const defaultAuditRoot = path.join(defaultFinalRoot, 'audit');
const defaultTaxonomyPath = path.join(
  repositoryRoot,
  'src/rockgen/experimental/geology-v2/morphology-taxonomy.v1.json',
);
const defaultFactoryRoot = path.join(morphologyRoot, 'reference-factory');

const VIEW_ORDER = ['front', 'rear', 'left', 'right', 'top', 'bottom'];
const PACKAGE_FAMILIES = {
  clasts: ['detached-clasts', 'plateaus-and-badlands', 'coastal-residuals'],
  residuals: ['residuals-and-outcrops', 'rock-surfaces-and-steps'],
  cliffs: ['cliffs-and-scarps', 'caves-arches-and-bridges'],
  forms: [
    'fins-spires-and-hoodoos',
    'volcanic-and-cooling-forms',
    'ridges-and-massifs',
    'deposits-and-fields',
    'intrusions',
  ],
};

const MANIFEST_NAMES = [
  'package-manifest.json',
  'reference-manifest.json',
  'final-manifest.json',
  'production-manifest.json',
  'manifest.json',
  'index.json',
  'batch-manifest.json',
  'draft-manifest.json',
];

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

function parseArguments(argv) {
  const options = {
    finalRoot: defaultFinalRoot,
    auditRoot: defaultAuditRoot,
    taxonomyPath: defaultTaxonomyPath,
    factoryRoot: defaultFactoryRoot,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--final-dir') options.finalRoot = path.resolve(argv[++index] ?? '');
    else if (argument === '--audit-dir') options.auditRoot = path.resolve(argv[++index] ?? '');
    else if (argument === '--taxonomy') options.taxonomyPath = path.resolve(argv[++index] ?? '');
    else if (argument === '--factory-dir') options.factoryRoot = path.resolve(argv[++index] ?? '');
    else if (argument === '--help' || argument === '-h') {
      console.log([
        'Usage: node scripts/verify-rock-reference-final.mjs [options]',
        '',
        '--final-dir <dir>    final package root (default: reference-final)',
        '--audit-dir <dir>    report output directory (default: reference-final/audit)',
        '--taxonomy <file>    taxonomy source',
        '--factory-dir <dir>  proposal/production report root',
      ].join('\n'));
      process.exit(0);
    } else {
      throw new RangeError(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return { __readError: error instanceof Error ? error.message : String(error) };
  }
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function firstString(...values) {
  return values.find((value) => typeof value === 'string' && value.trim().length > 0)?.trim();
}

function boolTrue(...values) {
  return values.some((value) => value === true);
}

function statusPass(value) {
  if (value === true) return true;
  if (!isObject(value)) return false;
  if (value.pass === true || value.passed === true || value.approved === true) return true;
  const status = String(value.status ?? value.reviewStatus ?? '').toLowerCase();
  return ['pass', 'passed', 'approved', 'ok', 'shape-pass', 'visual-pass'].includes(status);
}

function sha256(bufferOrText) {
  return createHash('sha256').update(bufferOrText).digest('hex');
}

function isSha256(value) {
  return typeof value === 'string' && /^[0-9a-f]{64}$/iu.test(value);
}

function isUrl(value) {
  return typeof value === 'string' && /^https?:\/\/[^\s]+$/iu.test(value);
}

function firstUrl(...values) {
  for (const value of values) {
    if (isUrl(value)) return value;
    if (Array.isArray(value)) {
      const nested = value.find((candidate) => isUrl(candidate));
      if (nested) return nested;
    }
  }
  return null;
}

function sameArray(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((value, index) => value === expected[index]);
}

function unique(values) {
  return [...new Set(values)];
}

function duplicateValues(values) {
  return unique(values.filter((value, index) => values.indexOf(value) !== index));
}

function relativeToRepository(filePath) {
  return path.relative(repositoryRoot, filePath) || '.';
}

function safeResolve(baseDirectory, rawPath) {
  if (typeof rawPath !== 'string' || rawPath.trim().length === 0) return null;
  const cleaned = rawPath.replace(/^file:\/\//iu, '');
  return path.isAbsolute(cleaned) ? path.resolve(cleaned) : path.resolve(baseDirectory, cleaned);
}

function collectFiles(directory, extension, output = []) {
  if (!fs.existsSync(directory)) return output;
  const stat = fs.statSync(directory);
  if (!stat.isDirectory()) return output;
  for (const name of fs.readdirSync(directory)) {
    if (name === 'audit' || name === '.DS_Store') continue;
    const filePath = path.join(directory, name);
    const fileStat = fs.statSync(filePath);
    if (fileStat.isDirectory()) collectFiles(filePath, extension, output);
    else if (!extension || path.extname(name).toLowerCase() === extension) output.push(filePath);
  }
  return output;
}

function arrayFromManifest(manifest) {
  for (const key of ['entries', 'records', 'subtypes', 'assets', 'items', 'sheets']) {
    if (Array.isArray(manifest?.[key])) return manifest[key];
  }
  return [];
}

function candidateManifestScore(manifest, filename) {
  if (!isObject(manifest) || manifest.__readError) return -1;
  const records = arrayFromManifest(manifest);
  let score = records.length ? 10 + records.length : 0;
  if (manifest.schema) score += 2;
  if (manifest.viewOrder || manifest.requiredViewOrder) score += 5;
  if (manifest.generatedViewsAreGeologyEvidence === false) score += 5;
  if (/manifest/iu.test(filename)) score += 2;
  if (manifest.batchId || manifest.packageId || manifest.package) score += 1;
  return score;
}

function findPackageManifest(packageDirectory) {
  const candidates = [];
  for (const filename of MANIFEST_NAMES) {
    const filePath = path.join(packageDirectory, filename);
    if (!fs.existsSync(filePath)) continue;
    const manifest = readJson(filePath);
    candidates.push({ filePath, filename, manifest, score: candidateManifestScore(manifest, filename) });
  }
  candidates.sort((a, b) => b.score - a.score || a.filePath.localeCompare(b.filePath));
  return candidates[0] ?? null;
}

function indexRecordLike(value, index) {
  if (Array.isArray(value)) {
    for (const item of value) indexRecordLike(item, index);
    return;
  }
  if (!isObject(value)) return;
  const id = firstString(value.subtypeId, value.id, value.assetId, value.key);
  if (id) index.set(id, value);
  for (const key of ['entries', 'records', 'subtypes', 'assets', 'items', 'sheets']) {
    if (Array.isArray(value[key])) indexRecordLike(value[key], index);
  }
  for (const [key, child] of Object.entries(value)) {
    if (!isObject(child) || ['entries', 'records', 'subtypes', 'assets', 'items', 'sheets'].includes(key)) continue;
    const childId = firstString(child.subtypeId, child.id, child.assetId) ?? key;
    if (childId && (child.sourceResearch || child.research || child.audit || child.output || child.sheetPath)) {
      index.set(childId, child);
    }
  }
}

function mergeRecords(primary, supplement) {
  if (!isObject(primary)) return supplement;
  if (!isObject(supplement)) return primary;
  const merged = { ...primary };
  for (const [key, value] of Object.entries(supplement)) {
    if (isObject(value) && isObject(merged[key])) merged[key] = mergeRecords(merged[key], value);
    else if (merged[key] === undefined) merged[key] = value;
  }
  return merged;
}

function loadPackageData(packageId, packageDirectory) {
  const manifestCandidate = findPackageManifest(packageDirectory);
  if (!manifestCandidate) {
    const discoveredIds = fs.existsSync(packageDirectory)
      ? fs.readdirSync(packageDirectory)
        .filter((name) => !['audit', '.DS_Store'].includes(name))
        .filter((name) => fs.statSync(path.join(packageDirectory, name)).isDirectory())
        .filter((name) => fs.existsSync(path.join(packageDirectory, name, 'source.json')) || fs.existsSync(path.join(packageDirectory, name, 'audit.json')))
        .sort()
      : [];
    const records = discoveredIds.map((subtypeId) => {
      const subtypeDirectory = path.join(packageDirectory, subtypeId);
      const sourcePath = path.join(subtypeDirectory, 'source.json');
      const auditPath = path.join(subtypeDirectory, 'audit.json');
      const source = fs.existsSync(sourcePath) ? readJson(sourcePath) : {};
      const audit = fs.existsSync(auditPath) ? readJson(auditPath) : {};
      const localImage = firstString(source.localImage, source.localFile, 'source-image.jpg');
      return {
        ...source,
        subtypeId,
        id: subtypeId,
        outputFile: `${subtypeId}/six-view.png`,
        promptFile: `${subtypeId}/prompt.txt`,
        sourceLocalFile: localImage ? `${subtypeId}/${localImage}` : null,
        outputSha256: firstString(source.outputSha256, audit.sheetSha256, audit.sha256, audit.output?.sha256),
        promptSha256: firstString(source.promptSha256, audit.promptSha256, audit.promptHash),
        panelOrder: firstDefined(source.panelOrder, audit.panelOrder),
        audit,
        notes: firstDefined(source.notes, audit.notes),
      };
    });
    return { manifestCandidate: null, manifest: null, records, auxiliaryIndex: new Map(), jsonFiles: [] };
  }
  const manifest = manifestCandidate.manifest;
  const manifestRecords = arrayFromManifest(manifest);
  let listedIds = (Array.isArray(manifest.subtypes) ? manifest.subtypes : [])
    .map((value) => (typeof value === 'string' ? value : firstString(value?.subtypeId, value?.id)))
    .filter(Boolean);
  if (!listedIds.length && fs.existsSync(packageDirectory)) {
    listedIds = fs.readdirSync(packageDirectory)
      .filter((name) => !['audit', '.DS_Store'].includes(name))
      .filter((name) => fs.statSync(path.join(packageDirectory, name)).isDirectory())
      .filter((name) => fs.existsSync(path.join(packageDirectory, name, 'source.json')) || fs.existsSync(path.join(packageDirectory, name, 'audit.json')))
      .sort();
  }
  const directoryRecords = listedIds.map((subtypeId) => {
    const subtypeDirectory = path.join(packageDirectory, subtypeId);
    const sourcePath = path.join(subtypeDirectory, 'source.json');
    const auditPath = path.join(subtypeDirectory, 'audit.json');
    const source = fs.existsSync(sourcePath) ? readJson(sourcePath) : {};
    const audit = fs.existsSync(auditPath) ? readJson(auditPath) : {};
    const localImage = firstString(source.localImage, source.localFile, 'source-image.jpg');
    return {
      ...source,
      subtypeId,
      id: subtypeId,
      outputFile: `${subtypeId}/six-view.png`,
      promptFile: `${subtypeId}/prompt.txt`,
      sourceLocalFile: localImage ? `${subtypeId}/${localImage}` : null,
      outputSha256: firstString(
        source.outputSha256,
        audit.sheetSha256,
        audit.sha256,
        audit.output?.sha256,
      ),
      promptSha256: firstString(source.promptSha256, audit.promptSha256, audit.promptHash),
      panelOrder: firstDefined(source.panelOrder, audit.panelOrder),
      audit,
      notes: firstDefined(source.notes, audit.notes),
    };
  }).filter((record) => fs.existsSync(path.join(packageDirectory, record.subtypeId)));
  const records = manifestRecords.length && manifestRecords.every((record) => isObject(record))
    ? manifestRecords
    : directoryRecords;
  const auxiliaryIndex = new Map();
  const jsonFiles = collectFiles(packageDirectory, '.json');
  for (const filePath of jsonFiles) {
    const value = readJson(filePath);
    if (!value.__readError) indexRecordLike(value, auxiliaryIndex);
  }
  return { manifestCandidate, manifest, records, auxiliaryIndex, jsonFiles };
}

function resolveImagePath(record, packageDirectory) {
  const candidate = firstDefined(
    record.outputFile,
    record.sheetPath,
    record.sixViewPath,
    record.imagePath,
    record.file,
    record.output?.path,
    record.output?.file,
    record.sheet?.path,
    record.artifact?.path,
  );
  return typeof candidate === 'string' ? safeResolve(packageDirectory, candidate) : null;
}

function resolvePromptPath(record, packageDirectory) {
  const candidate = firstDefined(
    record.promptFile,
    record.promptPath,
    record.generation?.promptFile,
    record.generation?.promptPath,
  );
  return typeof candidate === 'string' ? safeResolve(packageDirectory, candidate) : null;
}

function declaredDimensions(record) {
  const value = firstDefined(
    record.outputPixelDimensions,
    record.outputDimensionsPx,
    record.dimensionsPx,
    record.output?.dimensionsPx,
    record.output?.dimensions,
    record.sheet?.dimensionsPx,
    record.image?.dimensionsPx,
  );
  if (Array.isArray(value) && value.length >= 2) return [Number(value[0]), Number(value[1])];
  if (isObject(value) && Number.isFinite(Number(value.width)) && Number.isFinite(Number(value.height))) {
    return [Number(value.width), Number(value.height)];
  }
  if (Number.isFinite(Number(record.width)) && Number.isFinite(Number(record.height))) {
    return [Number(record.width), Number(record.height)];
  }
  return null;
}

function readJpegDimensions(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) throw new Error('invalid JPEG signature');
  let offset = 2;
  let sawFrame = false;
  while (offset + 4 <= buffer.length) {
    while (offset < buffer.length && buffer[offset] !== 0xff) offset += 1;
    while (offset < buffer.length && buffer[offset] === 0xff) offset += 1;
    if (offset >= buffer.length) break;
    const marker = buffer[offset];
    offset += 1;
    if (marker === 0xd9) break;
    if (marker === 0xda) break;
    if (marker >= 0xd0 && marker <= 0xd7) continue;
    if (offset + 2 > buffer.length) throw new Error('truncated JPEG segment');
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) throw new Error('invalid JPEG segment length');
    const isFrame = (marker >= 0xc0 && marker <= 0xc3)
      || (marker >= 0xc5 && marker <= 0xc7)
      || (marker >= 0xc9 && marker <= 0xcb)
      || (marker >= 0xcd && marker <= 0xcf);
    if (isFrame) {
      if (length < 7) throw new Error('truncated JPEG frame');
      const height = buffer.readUInt16BE(offset + 3);
      const width = buffer.readUInt16BE(offset + 5);
      if (width < 1 || height < 1) throw new Error('invalid JPEG dimensions');
      sawFrame = true;
      return { format: 'jpeg', width, height };
    }
    offset += length;
  }
  if (!sawFrame) throw new Error('JPEG has no decodable frame');
  throw new Error('unreachable JPEG parser state');
}

function decodeImage(filePath) {
  const buffer = fs.readFileSync(filePath);
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.png') {
    const decoded = decodePng(buffer);
    if (decoded.width < 1 || decoded.height < 1) throw new Error('PNG has invalid dimensions');
    return { format: 'png', width: decoded.width, height: decoded.height, byteLength: buffer.length };
  }
  if (extension === '.jpg' || extension === '.jpeg') return { ...readJpegDimensions(buffer), byteLength: buffer.length };
  if (extension === '.webp') throw new Error('WebP decoding is not supported by the verifier; provide PNG or JPEG');
  throw new Error(`unsupported image extension ${extension}`);
}

function normalizeReferences(record, manifest = null) {
  const raw = firstDefined(
    record.natureReferences,
    record.research?.natureReferences,
    record.sourceResearch?.natureReferences,
    record.sourceResearch?.naturePhoto,
    record.naturePhoto,
    record.naturePhotoSource,
    record.exactNatureSource,
    record.source,
  );
  let nature = asArray(raw).filter((value) => value !== undefined);
  const authorityRaw = firstDefined(
    record.authorityReferences,
    record.research?.authorityReferences,
    record.sourceResearch?.authorityReferences,
    record.sourceResearch?.geologyAuthorityReferences,
    record.sourceResearch?.geologyAuthority,
    record.geologyAuthorityReferences,
    record.geologyAuthority,
    record.geologyAuthorities,
  );
  let authority = asArray(authorityRaw).filter((value) => value !== undefined);
  if (!nature.length && (record.stablePageUrl || record.pageUrl || record.localImage || record.sourceLocalFile)) nature = [record];
  if (!nature.length && Array.isArray(record.naturePhotoSourceIds) && isObject(manifest?.sources)) {
    nature = record.naturePhotoSourceIds.map((id) => manifest.sources[id]).filter(Boolean);
  }
  if (!authority.length && Array.isArray(record.geologyAuthoritySourceIds) && isObject(manifest?.authoritySources)) {
    const authorityRecords = isObject(manifest.authoritySourceRecords) ? manifest.authoritySourceRecords : {};
    authority = record.geologyAuthoritySourceIds.map((id) => {
      const metadata = isObject(authorityRecords[id]) ? authorityRecords[id] : {};
      const rawUrl = manifest.authoritySources[id];
      return {
        ...metadata,
        pageUrl: firstUrl(metadata.stablePageUrl, metadata.pageUrl, rawUrl),
        evidence: firstString(metadata.claim, metadata.evidence, 'authority source ID resolved in final manifest'),
      };
    }).filter((value) => value.pageUrl);
  }
  return { nature, authority };
}

function normalizeProposalReferences(proposal, record) {
  const direct = normalizeReferences(record);
  const natureIds = asArray(record.naturePhotoSourceIds ?? record.natureReferenceIds).filter((value) => typeof value === 'string');
  const authorityIds = asArray(record.geologyAuthoritySourceIds ?? record.authoritySourceIds).filter((value) => typeof value === 'string');
  const natureRegistry = isObject(proposal?.sources) ? proposal.sources : {};
  const authorityRegistry = isObject(proposal?.authoritySources) ? proposal.authoritySources : {};
  const authorityRecords = isObject(proposal?.authoritySourceRecords) ? proposal.authoritySourceRecords : {};
  const nature = direct.nature.length
    ? direct.nature
    : natureIds.map((id) => natureRegistry[id]).filter(Boolean);
  const authority = direct.authority.length
    ? direct.authority
    : authorityIds.map((id) => {
      const recordForId = isObject(authorityRecords[id]) ? authorityRecords[id] : {};
      const rawUrl = authorityRegistry[id];
      return {
        ...recordForId,
        pageUrl: firstUrl(recordForId.stablePageUrl, recordForId.pageUrl, rawUrl),
        evidence: firstString(recordForId.claim, recordForId.evidence, 'authority source ID resolved in proposal manifest'),
      };
    }).filter((value) => value.pageUrl);
  return { nature, authority };
}

function sourceMetadata(record, natureReference) {
  const local = isObject(natureReference?.local) ? natureReference.local : {};
  const sourceObject = isObject(record.source) ? record.source : {};
  const localSource = isObject(sourceObject.local) ? sourceObject.local : {};
  const localPath = firstString(
    record.sourceLocalFile,
    record.sourceLocalPath,
    record.localSourceFile,
    record.sourceFile,
    local.path,
    local.file,
    natureReference?.localFile,
    natureReference?.localPath,
    natureReference?.localImage?.path,
    natureReference?.localImage?.file,
    sourceObject.localFile,
    sourceObject.localPath,
    sourceObject.localImage?.path,
    sourceObject.localImage?.file,
    localSource.path,
    localSource.file,
  );
  const expectedHash = firstString(
    record.sourceSha256,
    record.sourceLocalSha256,
    record.localSourceSha256,
    record.localImageSha256,
    local.sha256,
    local.hash,
    natureReference?.sha256,
    natureReference?.localImageSha256,
    natureReference?.localImage?.sha256,
    sourceObject.sha256,
    sourceObject.sourceSha256,
    sourceObject.localImageSha256,
    sourceObject.localImage?.sha256,
    localSource.sha256,
  );
  const pageUrl = firstString(
    firstUrl(natureReference?.stablePageUrl, natureReference?.pageUrl, natureReference?.pageUrls),
    record.sourcePageUrl,
    record.natureSourcePageUrl,
    sourceObject.pageUrl,
  );
  const rights = firstString(
    natureReference?.rights,
    natureReference?.rightsStatus,
    natureReference?.license,
    record.sourceRights,
    record.rights,
    record.license,
    sourceObject.rights,
    sourceObject.license,
  );
  const credit = firstString(
    natureReference?.credit,
    natureReference?.author,
    natureReference?.photographer,
    record.sourceCredit,
    record.credit,
    record.attribution,
    sourceObject.credit,
    sourceObject.attribution,
  );
  return { localPath, expectedHash, pageUrl, rights, credit };
}

function authorityMetadata(reference) {
  return {
    pageUrl: firstUrl(reference?.stablePageUrl, reference?.pageUrl, reference?.pageUrls, reference?.url),
    evidence: firstString(reference?.claim, reference?.evidence, reference?.observation, reference?.description),
    rights: firstString(reference?.rightsStatus, reference?.rights, reference?.license),
  };
}

function auditObject(record) {
  return isObject(record.audit) ? record.audit : (isObject(record.visualAudit) ? record.visualAudit : {});
}

function perViewAudit(record, audit) {
  // Keep aggregate checks (identity/top/support/etc.) from masquerading as
  // six-view evidence.  A checks object is accepted here only when it really
  // contains every required panel key; otherwise the record remains
  // fail-closed for missing per-view audit fields.
  const explicitChecks = isObject(audit.checks)
    && VIEW_ORDER.every((view) => Object.prototype.hasOwnProperty.call(audit.checks, view))
    ? audit.checks
    : undefined;
  const candidate = firstDefined(
    audit.perViewIdentity,
    audit.viewAudit,
    audit.views,
    record.perViewIdentity,
    record.viewAudit,
    explicitChecks,
  );
  if (!isObject(candidate)) return null;
  return candidate;
}

function viewValue(candidate, view) {
  if (!candidate) return undefined;
  if (view === 'bottom') return firstDefined(candidate.bottom, candidate.bottomSupport, candidate['bottom-support']);
  return candidate[view];
}

function inheritedDisclaimer(manifest, record) {
  const evidenceFlag = firstDefined(
    record.generatedViewsAreGeologyEvidence,
    record.generatedAnglesAreGeologyEvidence,
    record.audit?.generatedViewsAreGeologyEvidence,
    record.audit?.generatedAnglesAreGeologyEvidence,
    record.audit?.geologyEvidence === false ? false : undefined,
    manifest.generatedViewsAreGeologyEvidence,
  );
  const hypothesisFlag = firstDefined(record.hypothesisOnly, manifest.hypothesisOnly);
  const text = [
    record.disclaimer,
    record.hypothesisDisclaimer,
    record.notes,
    record.audit?.notes,
    record.generatedAnglesRole,
    record.audit?.generatedAnglesRole,
    record.audit?.generatedViewsRole,
    manifest.disclaimer,
    manifest.hypothesisDisclaimer,
    manifest.notes,
  ].flatMap((value) => asArray(value)).filter((value) => typeof value === 'string').join(' ');
  return {
    evidenceFlag,
    hypothesisFlag,
    text,
    passed: evidenceFlag === false
      && (hypothesisFlag === true || /hypothes(?:is|e)|not\s+(?:geology\s+)?evidence/iu.test(text)),
  };
}

function topAndBottom(record, audit) {
  return {
    trueTop: boolTrue(
      audit.trueTop,
      audit.trueTopView,
      audit.trueTopVisible,
      audit.top?.trueTop,
      audit.checks?.trueOrthographicTop,
      record.trueTop,
      record.trueTopView,
      record.trueTopVisible,
    ),
    trueBottomSupport: boolTrue(
      audit.trueBottomSupport,
      audit.trueBottom,
      audit.trueBottomSupportVisible,
      audit.bottomSupport,
      audit.bottom?.trueBottomSupport,
      audit.bottom?.support,
      audit.checks?.meaningfulSupportView,
      record.trueBottomSupport,
      record.trueBottom,
      record.trueBottomSupportVisible,
    ),
  };
}

function approved(record, audit) {
  return boolTrue(
    audit.approved,
    audit.visualApproval,
    audit.shapeApproval,
    audit.productionApproved,
    record.approved,
    record.visualApproval,
    record.shapeApproval,
  );
}

function prohibitedDrift(record, audit) {
  return boolTrue(
    audit.prohibitedDrift,
    audit.noProhibitedDrift,
    audit.identityDrift === false,
    audit.checks?.forbiddenDriftAbsent,
    record.prohibitedDrift,
    record.noProhibitedDrift,
    record.identityDrift === false,
  );
}

function sourceCreditPresent(rights, credit) {
  return Boolean(credit)
    || /\b(?:credit|attribute|attribution|courtesy|author|photographer|public\s+domain|cc\s*[- ]?by|cc0|pd[- ]?usgov)\b/iu.test(rights ?? '');
}

function checkPrompt(record, packageDirectory) {
  const expected = firstString(
    record.promptSha256,
    record.promptHash,
    record.prompt?.sha256,
    record.generation?.promptSha256,
    record.audit?.promptSha256,
    record.audit?.promptHash,
  );
  const promptPath = resolvePromptPath(record, packageDirectory);
  const inlinePrompt = firstString(record.promptText, record.prompt?.text, record.generation?.promptText);
  const result = { expected, path: promptPath ? relativeToRepository(promptPath) : null, hashMode: null, actual: null, passed: false };
  if (!isSha256(expected)) {
    result.reason = 'missing-or-invalid-prompt-hash';
    return result;
  }
  let promptBuffer;
  if (promptPath && fs.existsSync(promptPath)) promptBuffer = fs.readFileSync(promptPath);
  else if (inlinePrompt) promptBuffer = Buffer.from(inlinePrompt, 'utf8');
  else {
    result.reason = 'prompt-hash-cannot-be-recomputed';
    return result;
  }
  const raw = sha256(promptBuffer);
  const trimmed = sha256(promptBuffer.toString('utf8').trim());
  result.actual = raw;
  if (expected === raw) result.hashMode = 'raw';
  else if (expected === trimmed) {
    result.actual = trimmed;
    result.hashMode = 'trimmed';
  } else {
    result.reason = 'prompt-hash-mismatch';
    return result;
  }
  result.passed = true;
  return result;
}

function checkSource(record, packageDirectory, natureReference) {
  const metadata = sourceMetadata(record, natureReference);
  const result = {
    pageUrl: metadata.pageUrl ?? null,
    localPath: metadata.localPath ?? null,
    expectedSha256: metadata.expectedHash ?? null,
    actualSha256: null,
    rights: Boolean(metadata.rights),
    credit: sourceCreditPresent(metadata.rights, metadata.credit),
    localHash: false,
    passed: false,
  };
  if (!isUrl(metadata.pageUrl)) result.reason = 'missing-stable-nature-photo-page-url';
  else if (!metadata.rights) result.reason = 'missing-nature-photo-rights-license';
  else if (!sourceCreditPresent(metadata.rights, metadata.credit)) result.reason = 'missing-nature-photo-credit';
  else if (!isSha256(metadata.expectedHash)) result.reason = 'missing-or-invalid-local-source-sha256';
  else if (!metadata.localPath) result.reason = 'missing-local-source-file';
  else {
    const localPath = safeResolve(packageDirectory, metadata.localPath);
    if (!localPath || !fs.existsSync(localPath) || !fs.statSync(localPath).isFile()) result.reason = 'local-source-file-missing';
    else {
      result.actualSha256 = sha256(fs.readFileSync(localPath));
      result.localHash = result.actualSha256 === metadata.expectedHash;
      if (!result.localHash) result.reason = 'local-source-sha256-mismatch';
    }
  }
  result.passed = !result.reason && result.localHash;
  return result;
}

function checkAuthority(record, manifest = null) {
  const { authority } = normalizeReferences(record, manifest);
  const details = authority.map(authorityMetadata);
  const malformed = details.find((item) => !isUrl(item.pageUrl) || !item.evidence);
  return {
    count: details.length,
    references: details.map((item) => ({ pageUrl: item.pageUrl ?? null, evidence: Boolean(item.evidence), rights: Boolean(item.rights) })),
    passed: details.length > 0 && !malformed,
    reason: details.length === 0 ? 'missing-geology-authority-reference' : malformed ? 'malformed-geology-authority-reference' : null,
  };
}

function checkRecord(record, packageId, packageDirectory, manifest, expectedFamilyById = {}) {
  const id = firstString(record.subtypeId, record.id, record.assetId, record.key);
  const audit = auditObject(record);
  const views = perViewAudit(record, audit);
  const disclaimer = inheritedDisclaimer(manifest, record);
  const topBottom = topAndBottom(record, audit);
  const { nature } = normalizeReferences(record, manifest);
  const natureSource = nature[0];
  const source = checkSource(record, packageDirectory, natureSource);
  const authority = checkAuthority(record, manifest);
  const prompt = checkPrompt(record, packageDirectory);
  const imagePath = resolveImagePath(record, packageDirectory);
  const declaredOutputHash = firstString(
    record.outputSha256,
    record.output?.sha256,
    record.output?.hash,
    record.sha256,
    audit.sheetSha256,
    audit.sha256,
    audit.output?.sha256,
  );
  const result = {
    subtypeId: id ?? null,
    packageId,
    image: { path: imagePath ? relativeToRepository(imagePath) : null, sha256: null, declaredSha256: declaredOutputHash ?? null, dimensions: null, declaredDimensions: declaredDimensions(record), passed: false },
    source,
    authority,
    disclaimer,
    prompt,
    audit: {
      approved: approved(record, audit),
      trueTop: topBottom.trueTop,
      trueBottomSupport: topBottom.trueBottomSupport,
      prohibitedDrift: prohibitedDrift(record, audit),
      perView: {},
      passed: false,
    },
    failures: [],
    passed: false,
  };

  if (!id) result.failures.push('missing-subtype-id');
  if (id && !firstString(record.familyId)) result.failures.push('missing-family-id');
  else if (id && expectedFamilyById[id] && record.familyId !== expectedFamilyById[id]) result.failures.push('family-id-mismatch');
  const entryViewOrder = firstDefined(record.viewOrder, record.requiredViewOrder, record.panelOrder, record.audit?.viewOrder);
  if (entryViewOrder !== undefined && !sameArray(entryViewOrder, VIEW_ORDER)) result.failures.push('entry-six-view-order-mismatch');
  if (!imagePath || !fs.existsSync(imagePath) || !fs.statSync(imagePath).isFile()) {
    result.failures.push('missing-sheet-file');
  } else {
    try {
      const image = decodeImage(imagePath);
      result.image.dimensions = { width: image.width, height: image.height, format: image.format, byteLength: image.byteLength };
      result.image.sha256 = sha256(fs.readFileSync(imagePath));
      if (!isSha256(declaredOutputHash)) result.failures.push('missing-or-invalid-output-sha256');
      else if (declaredOutputHash !== result.image.sha256) result.failures.push('output-sha256-mismatch');
      const declared = result.image.declaredDimensions;
      if (declared && (declared[0] !== image.width || declared[1] !== image.height)) result.failures.push('sheet-dimensions-metadata-mismatch');
      if (image.width < 512 || image.height < 512) result.failures.push('sheet-dimensions-below-review-floor');
      result.image.passed = !result.failures.includes('missing-or-invalid-output-sha256')
        && !result.failures.includes('output-sha256-mismatch')
        && !result.failures.includes('sheet-dimensions-metadata-mismatch')
        && !result.failures.includes('sheet-dimensions-below-review-floor');
    } catch (error) {
      result.failures.push('sheet-not-decodable');
      result.image.error = error instanceof Error ? error.message : String(error);
    }
  }

  for (const view of VIEW_ORDER) {
    const value = viewValue(views, view);
    result.audit.perView[view] = statusPass(value);
    if (!statusPass(value)) result.failures.push(`per-view-audit-${view}-not-pass`);
  }
  if (!result.audit.approved) result.failures.push('approved-true-required');
  if (!result.audit.trueTop) result.failures.push('true-top-required');
  if (!result.audit.trueBottomSupport) result.failures.push('true-bottom-support-required');
  if (!result.audit.prohibitedDrift) result.failures.push('prohibited-drift-gate-required');
  if (!disclaimer.passed) result.failures.push('generated-hypothesis-disclaimer-required');
  if (!source.passed) result.failures.push(`source-${source.reason ?? 'gate-failed'}`);
  if (!authority.passed) result.failures.push(`authority-${authority.reason ?? 'gate-failed'}`);
  if (!prompt.passed) result.failures.push(`prompt-${prompt.reason ?? 'gate-failed'}`);

  result.audit.passed = result.audit.approved
    && result.audit.trueTop
    && result.audit.trueBottomSupport
    && result.audit.prohibitedDrift
    && VIEW_ORDER.every((view) => result.audit.perView[view]);
  result.passed = result.failures.length === 0;
  return result;
}

function packageLevelChecks(packageId, packageDirectory, data, expectedIds) {
  const failures = [];
  const warnings = [];
  const manifest = data.manifest;
  const metadata = {
    viewOrder: firstDefined(manifest?.viewOrder, manifest?.requiredViewOrder, manifest?.panelOrder, manifest?.sheetContract?.viewOrder),
    generatedViewsAreGeologyEvidence: manifest?.generatedViewsAreGeologyEvidence,
    hypothesisOnly: manifest?.hypothesisOnly,
    lengthUnit: firstString(manifest?.lengthUnit, manifest?.sheetContract?.downstreamMetadata?.lengthUnit),
    referenceScale: firstDefined(manifest?.nominalReferenceScaleMetres, manifest?.scaleMetadata?.nominalReferenceScaleMetres, manifest?.sheetContract?.downstreamMetadata?.worldUnitMetres),
  };
  if (metadata.viewOrder === undefined) warnings.push('fixed-six-view-order-metadata-absent');
  else if (!sameArray(metadata.viewOrder, VIEW_ORDER)) failures.push('fixed-six-view-order-metadata-mismatch');
  if (metadata.generatedViewsAreGeologyEvidence === undefined) warnings.push('generated-hypothesis-flag-absent');
  else if (metadata.generatedViewsAreGeologyEvidence !== false) failures.push('generated-hypothesis-flag-must-be-false');
  if (metadata.lengthUnit === undefined) warnings.push('one-metre-length-unit-metadata-absent');
  else if (metadata.lengthUnit !== 'metre') failures.push('one-metre-length-unit-required');
  if (metadata.referenceScale === undefined) warnings.push('one-metre-reference-scale-metadata-absent');
  else if (Number(metadata.referenceScale) !== 1) failures.push('one-metre-reference-scale-required');
  const declaredCount = firstDefined(manifest?.expectedSubtypeCount, manifest?.completedSubtypeCount, manifest?.subtypeCount);
  if (declaredCount !== undefined && Number(declaredCount) !== expectedIds.length) failures.push('declared-subtype-count-mismatch');
  return { packageId, packageDirectory: relativeToRepository(packageDirectory), manifestPath: data.manifestCandidate ? relativeToRepository(data.manifestCandidate.filePath) : null, metadata, warnings, failures, expectedIds };
}

function inspectPackage(packageId, expectedIds, expectedFamilyById, finalRoot) {
  const packageDirectory = path.join(finalRoot, packageId);
  const data = fs.existsSync(packageDirectory) ? loadPackageData(packageId, packageDirectory) : { manifestCandidate: null, manifest: null, records: [], auxiliaryIndex: new Map(), jsonFiles: [] };
  const level = packageLevelChecks(packageId, packageDirectory, data, expectedIds);
  if (!fs.existsSync(packageDirectory)) level.failures.push('package-directory-missing');
  else if (!data.manifestCandidate) level.warnings.push('package-manifest-not-present-directory-records-used');

  const records = data.records.map((record) => {
    const id = firstString(record.subtypeId, record.id, record.assetId, record.key);
    const supplement = id ? data.auxiliaryIndex.get(id) : null;
    return mergeRecords(record, supplement);
  });
  const actualIds = records.map((record) => firstString(record.subtypeId, record.id, record.assetId, record.key)).filter(Boolean);
  const duplicateIds = duplicateValues(actualIds);
  const missingIds = expectedIds.filter((id) => !actualIds.includes(id));
  const unexpectedIds = actualIds.filter((id) => !expectedIds.includes(id));
  if (duplicateIds.length) level.failures.push('duplicate-subtype-ids');
  if (missingIds.length) level.failures.push('missing-subtype-ids');
  if (unexpectedIds.length) level.failures.push('unexpected-subtype-ids');
  if (records.length !== expectedIds.length) level.failures.push('package-record-count-mismatch');

  const imagePaths = new Map();
  const recordResults = [];
  for (const record of records) {
    const result = checkRecord(record, packageId, packageDirectory, data.manifest ?? {}, expectedFamilyById);
    if (result.subtypeId && imagePaths.has(result.image.path)) result.failures.push('duplicate-sheet-path');
    if (result.image.path) imagePaths.set(result.image.path, result.subtypeId);
    recordResults.push(result);
  }
  const failedRecords = recordResults.filter((record) => !record.passed).map((record) => record.subtypeId);
  if (failedRecords.length) level.failures.push('record-gates-failed');
  return {
    ...level,
    expectedIds,
    actualIds,
    duplicateIds,
    missingIds,
    unexpectedIds,
    failedRecords,
    recordResults,
    passed: level.failures.length === 0 && recordResults.length === expectedIds.length && recordResults.every((record) => record.passed),
  };
}

function auditProposal(packageId, expectedIds, factoryRoot) {
  const proposalPath = path.join(factoryRoot, 'batches', packageId, 'proposal-manifest.json');
  const proposal = readJson(proposalPath);
  const issues = [];
  if (proposal.__readError) return { packageId, path: relativeToRepository(proposalPath), missing: true, issues: ['proposal-manifest-missing-or-invalid'] };
  const records = Array.isArray(proposal.subtypes) ? proposal.subtypes : [];
  const ids = records.map((record) => firstString(record.subtypeId, record.id)).filter(Boolean);
  const missingIds = expectedIds.filter((id) => !ids.includes(id));
  const unexpectedIds = ids.filter((id) => !expectedIds.includes(id));
  const duplicates = duplicateValues(ids);
  if (missingIds.length) issues.push('proposal-missing-ids');
  if (unexpectedIds.length) issues.push('proposal-unexpected-ids');
  if (duplicates.length) issues.push('proposal-duplicate-ids');
  for (const record of records) {
    const { nature, authority } = normalizeProposalReferences(proposal, record);
    if (!nature.length) issues.push(`proposal-${record.subtypeId ?? record.id}-missing-nature-page`);
    if (!authority.length) issues.push(`proposal-${record.subtypeId ?? record.id}-missing-authority`);
    if (!firstString(record.shapeRationale, record.proposal?.shapeRationale, record.research?.shapeRationale)) issues.push(`proposal-${record.subtypeId ?? record.id}-missing-shape-rationale`);
    for (const reference of nature) {
      const rights = firstString(reference?.rights, reference?.rightsStatus, reference?.license);
      const credit = firstString(reference?.credit, reference?.author, reference?.photographer);
      if (!firstUrl(reference?.stablePageUrl, reference?.pageUrl, reference?.pageUrls)) issues.push(`proposal-${record.subtypeId ?? record.id}-nature-url-invalid`);
      if (!rights) issues.push(`proposal-${record.subtypeId ?? record.id}-nature-rights-missing`);
      if (!sourceCreditPresent(rights, credit)) issues.push(`proposal-${record.subtypeId ?? record.id}-nature-credit-missing`);
    }
    for (const reference of authority) {
      if (!firstUrl(reference?.stablePageUrl, reference?.pageUrl, reference?.pageUrls)) issues.push(`proposal-${record.subtypeId ?? record.id}-authority-url-invalid`);
      if (!firstString(reference?.claim, reference?.evidence, reference?.observation)) issues.push(`proposal-${record.subtypeId ?? record.id}-authority-evidence-missing`);
    }
  }
  return { packageId, path: relativeToRepository(proposalPath), declaredCount: proposal.scope?.subtypeCount ?? proposal.subtypeCount ?? records.length, actualCount: records.length, missingIds, unexpectedIds, duplicates, issues: unique(issues), passed: issues.length === 0 };
}

function auditProductionReports(expectedByPackage, factoryRoot) {
  const reports = [];
  const known = {
    clasts: ['production-drafts/clasts/production-manifest.json', 'production-drafts/clasts/draft-manifest.json'],
    residuals: ['production-drafts/residuals/draft-manifest.json', 'production-drafts/residuals/production-manifest.json'],
    cliffs: ['production-drafts/cliffs/production-manifest.json', 'production-drafts/cliffs/draft-manifest.json'],
    forms: ['production-drafts/forms/production-manifest.json', 'production-drafts/forms/draft-manifest.json'],
  };
  for (const [packageId, candidates] of Object.entries(known)) {
    const reportPath = candidates.map((candidate) => path.join(factoryRoot, candidate)).find((candidate) => fs.existsSync(candidate));
    if (!reportPath) {
      reports.push({ packageId, path: relativeToRepository(path.join(factoryRoot, candidates[0])), status: 'not-landed', issues: ['production-report-not-present'] });
      continue;
    }
    const report = readJson(reportPath);
    const records = Array.isArray(report.entries) ? report.entries : (Array.isArray(report.records) ? report.records : []);
    const ids = records.map((record) => firstString(record.subtypeId, record.id)).filter(Boolean);
    const excluded = asArray(report.excludedExistingPilots).filter((value) => typeof value === 'string');
    const failedAudits = records.filter((record) => record.audit?.status && !['pass', 'passed', 'approved', 'shape-pass'].includes(String(record.audit.status).toLowerCase())).map((record) => firstString(record.subtypeId, record.id));
    const missingIds = expectedByPackage[packageId].filter((id) => !ids.includes(id));
    reports.push({
      packageId,
      path: relativeToRepository(reportPath),
      status: 'present',
      generatedCount: ids.length,
      missingIds,
      excludedExistingPilots: excluded,
      failedAuditIds: failedAudits,
      issues: unique([
        ...(missingIds.length ? ['production-report-missing-final-ids'] : []),
        ...(failedAudits.length ? ['production-report-failed-audits'] : []),
      ]),
    });
  }
  return reports;
}

function renderMarkdown(result) {
  const lines = [
    '# C8 final rock-reference audit',
    '',
    `Status: **${result.passed ? 'PASS' : 'FAIL-CLOSED'}**`,
    '',
    `Checked: ${result.checkedAt}`,
    `Expected taxonomy IDs: **${result.counts.expectedIds}**; present unique IDs: **${result.counts.presentUniqueIds}**; approved records: **${result.counts.approvedRecords}**.`,
    '',
    'Generated sheets remain reconstruction hypotheses. A package can pass only when every required ID has a source/local hash, rights/credit, authority evidence, recomputable prompt hash, decodable sheet, fixed view-order metadata, per-view audit, explicit approval, true top, true bottom/support, and prohibited-drift approval.',
    '',
    '## Package gates',
    '',
    '| Package | Expected | Records | Missing | Unexpected | Failed records | Status |',
    '| --- | ---: | ---: | ---: | ---: | ---: | --- |',
  ];
  for (const pkg of result.packages) {
    lines.push(`| ${pkg.packageId} | ${pkg.expectedIds.length} | ${pkg.actualIds.length} | ${pkg.missingIds.length} | ${pkg.unexpectedIds.length} | ${pkg.failedRecords.length} | ${pkg.passed ? 'PASS' : 'FAIL'} |`);
    if (pkg.warnings?.length) lines.push(`  - warnings: ${pkg.warnings.join(', ')}`);
  }
  lines.push('', '## Coverage failures', '');
  const coverageIssues = result.packages.flatMap((pkg) => [
    ...pkg.missingIds.map((id) => `- **${pkg.packageId}** missing ${id}`),
    ...pkg.unexpectedIds.map((id) => `- **${pkg.packageId}** unexpected ${id}`),
    ...pkg.duplicateIds.map((id) => `- **${pkg.packageId}** duplicate subtype ${id}`),
  ]);
  lines.push(...(coverageIssues.length ? coverageIssues : ['- None.']));
  if (result.duplicateGlobalImagePaths.length) lines.push(`- Duplicate sheet paths: ${result.duplicateGlobalImagePaths.join(', ')}`);
  lines.push('', '## Source proposal / production pre-audit', '');
  for (const proposal of Object.values(result.sourcePreAudit.proposals)) {
    lines.push(`- Proposal **${proposal.packageId}**: ${proposal.passed ? 'PASS' : `issues: ${proposal.issues.join(', ') || 'none'}`}`);
  }
  for (const report of result.sourcePreAudit.productionReports) {
    lines.push(`- Production report **${report.packageId}**: ${report.status}${report.issues?.length ? ` — ${report.issues.join(', ')}` : ''}`);
  }
  lines.push('', '## Record failures', '');
  const failureGroups = new Map();
  for (const pkg of result.packages) {
    for (const record of pkg.recordResults) {
      for (const failure of record.failures) {
        const key = `${pkg.packageId}\u0000${failure}`;
        const group = failureGroups.get(key) ?? { packageId: pkg.packageId, failure, ids: [] };
        group.ids.push(record.subtypeId ?? 'unknown');
        failureGroups.set(key, group);
      }
    }
  }
  const failureLines = [...failureGroups.values()].map((group) => {
    const previewLimit = 6;
    const preview = group.ids.slice(0, previewLimit).join(', ');
    const remainder = group.ids.length > previewLimit ? `, +${group.ids.length - previewLimit} more` : '';
    return `- **${group.packageId}** ${group.failure} (${group.ids.length} record${group.ids.length === 1 ? '' : 's'}): ${preview}${remainder}`;
  });
  lines.push(...(failureLines.length ? failureLines : ['- None.']));
  lines.push('', '## Gate policy', '', '- This report is independent of batch-worker audits.', '- Technical generation completion never substitutes for visual approval.', '- Do not promote or declare 100/100 until this report is PASS.', '');
  return `${lines.join('\n')}\n`;
}

function run() {
  const options = parseArguments(process.argv.slice(2));
  fs.mkdirSync(options.auditRoot, { recursive: true });
  const taxonomy = readJson(options.taxonomyPath);
  const failures = [];
  if (taxonomy.__readError) failures.push({ code: 'taxonomy-read-failed', details: taxonomy.__readError });
  const taxonomySubtypes = Array.isArray(taxonomy.subtypes) ? taxonomy.subtypes : [];
  const taxonomyIds = taxonomySubtypes.map((subtype) => subtype.id).filter((id) => typeof id === 'string');
  const duplicateTaxonomyIds = duplicateValues(taxonomyIds);
  if (duplicateTaxonomyIds.length) failures.push({ code: 'taxonomy-duplicate-ids', details: duplicateTaxonomyIds });
  const expectedByPackage = Object.fromEntries(Object.entries(PACKAGE_FAMILIES).map(([packageId, familyIds]) => [
    packageId,
    taxonomySubtypes.filter((subtype) => familyIds.includes(subtype.familyId)).map((subtype) => subtype.id),
  ]));
  const expectedIds = unique(Object.values(expectedByPackage).flat());
  const expectedFamilyById = Object.fromEntries(taxonomySubtypes.map((subtype) => [subtype.id, subtype.familyId]));
  const packages = Object.entries(expectedByPackage).map(([packageId, expectedIdsForPackage]) => inspectPackage(packageId, expectedIdsForPackage, expectedFamilyById, options.finalRoot));
  const allActualIds = packages.flatMap((pkg) => pkg.actualIds);
  const allImagePaths = packages.flatMap((pkg) => pkg.recordResults.map((record) => record.image.path).filter(Boolean));
  const duplicateGlobalIds = duplicateValues(allActualIds);
  const duplicateGlobalImagePaths = duplicateValues(allImagePaths);
  const missingGlobalIds = expectedIds.filter((id) => !allActualIds.includes(id));
  const unexpectedGlobalIds = allActualIds.filter((id) => !expectedIds.includes(id));
  if (missingGlobalIds.length) failures.push({ code: 'global-missing-ids', details: missingGlobalIds });
  if (unexpectedGlobalIds.length) failures.push({ code: 'global-unexpected-ids', details: unexpectedGlobalIds });
  if (duplicateGlobalIds.length) failures.push({ code: 'global-duplicate-ids', details: duplicateGlobalIds });
  if (duplicateGlobalImagePaths.length) failures.push({ code: 'global-duplicate-sheet-paths', details: duplicateGlobalImagePaths });
  for (const pkg of packages) if (!pkg.passed) failures.push({ code: `package-${pkg.packageId}-failed`, details: pkg.failures });

  const proposals = Object.fromEntries(Object.entries(expectedByPackage).map(([packageId, ids]) => [packageId, auditProposal(packageId, ids, options.factoryRoot)]));
  const productionReports = auditProductionReports(expectedByPackage, options.factoryRoot);
  const sourcePreAudit = {
    passed: Object.values(proposals).every((proposal) => proposal.passed) && productionReports.every((report) => report.status === 'present' && !report.issues?.length),
    proposals,
    productionReports,
  };

  const approvedRecords = packages.reduce((sum, pkg) => sum + pkg.recordResults.filter((record) => record.audit.approved).length, 0);
  const result = {
    schema: 'toonlab/rock-reference-final-audit',
    version: 1,
    checkedAt: new Date().toISOString(),
    gate: 'fail-closed',
    passed: failures.length === 0 && packages.every((pkg) => pkg.passed) && expectedIds.length === 100 && allActualIds.length === 100 && duplicateGlobalIds.length === 0,
    finalRoot: relativeToRepository(options.finalRoot),
    taxonomyPath: relativeToRepository(options.taxonomyPath),
    counts: {
      expectedIds: expectedIds.length,
      presentRecords: allActualIds.length,
      presentUniqueIds: unique(allActualIds).length,
      approvedRecords,
      packages: packages.length,
      packageFailures: packages.filter((pkg) => !pkg.passed).length,
      globalMissing: missingGlobalIds.length,
      globalUnexpected: unexpectedGlobalIds.length,
      globalDuplicates: duplicateGlobalIds.length,
      globalDuplicateSheetPaths: duplicateGlobalImagePaths.length,
    },
    expectedByPackage,
    missingGlobalIds,
    unexpectedGlobalIds,
    duplicateGlobalIds,
    duplicateGlobalImagePaths,
    packages,
    sourcePreAudit,
    failures,
  };
  fs.writeFileSync(path.join(options.auditRoot, 'reference-final-audit.json'), `${JSON.stringify(result, null, 2)}\n`);
  fs.writeFileSync(path.join(options.auditRoot, 'reference-final-audit.md'), renderMarkdown(result));
  console.log(JSON.stringify({
    passed: result.passed,
    expectedIds: result.counts.expectedIds,
    presentUniqueIds: result.counts.presentUniqueIds,
    approvedRecords,
    packageFailures: result.counts.packageFailures,
    sourcePreAuditPassed: sourcePreAudit.passed,
    json: relativeToRepository(path.join(options.auditRoot, 'reference-final-audit.json')),
    markdown: relativeToRepository(path.join(options.auditRoot, 'reference-final-audit.md')),
  }, null, 2));
  if (!result.passed) process.exitCode = 1;
}

run();
