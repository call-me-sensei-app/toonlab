#!/usr/bin/env node

/**
 * Deterministic consolidation and visual-review builder for the 100 C8 rock
 * reference packages. Family packages are strictly read-only. The independent
 * verifier is always run first; this builder remains fail-closed until it and
 * the complete taxonomy inventory pass.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { deflateSync } from 'node:zlib';

import { decodePng } from './golden-image-metrics.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const morphologyRoot = path.join(
  repositoryRoot,
  'artifacts/research/rock-geology-v2/checkpoint-08-basis-families/morphology',
);
const finalRoot = path.join(morphologyRoot, 'reference-final');
const reviewRoot = path.join(finalRoot, 'review');
const contactRoot = path.join(reviewRoot, 'contact-sheets');
const taxonomyPath = path.join(
  repositoryRoot,
  'src/rockgen/experimental/geology-v2/morphology-taxonomy.v1.json',
);
const verifierPath = path.join(repositoryRoot, 'scripts/verify-rock-reference-final.mjs');
const verifierReportPath = path.join(finalRoot, 'audit/reference-final-audit.json');
const factoryRoot = path.join(morphologyRoot, 'reference-factory/batches');
const authoritativeVisualReportPath = path.join(reviewRoot, 'final-visual-100.json');
const authoritativeRightsReportPath = path.join(reviewRoot, 'source-rights-audit-100.json');

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
const PACKAGE_BY_FAMILY = Object.fromEntries(
  Object.entries(PACKAGE_FAMILIES).flatMap(([packageId, familyIds]) =>
    familyIds.map((familyId) => [familyId, packageId])),
);
const REQUIRED_FILES = ['source.json', 'prompt.txt', 'six-view.png', 'audit.json'];
const PAGE_SIZE = 16;
const COLUMNS = 4;
const TILE_WIDTH = 360;
const IMAGE_HEIGHT = 230;
const LABEL_HEIGHT = 34;
const TILE_HEIGHT = IMAGE_HEIGHT + LABEL_HEIGHT;
const TITLE_HEIGHT = 44;

const FONT = {
  ' ': ['00000','00000','00000','00000','00000','00000','00000'],
  '-': ['00000','00000','00000','11111','00000','00000','00000'],
  '_': ['00000','00000','00000','00000','00000','00000','11111'],
  '.': ['00000','00000','00000','00000','00000','01100','01100'],
  '/': ['00001','00010','00100','01000','10000','00000','00000'],
  '0': ['01110','10001','10011','10101','11001','10001','01110'],
  '1': ['00100','01100','00100','00100','00100','00100','01110'],
  '2': ['01110','10001','00001','00010','00100','01000','11111'],
  '3': ['11110','00001','00001','01110','00001','00001','11110'],
  '4': ['00010','00110','01010','10010','11111','00010','00010'],
  '5': ['11111','10000','10000','11110','00001','00001','11110'],
  '6': ['01110','10000','10000','11110','10001','10001','01110'],
  '7': ['11111','00001','00010','00100','01000','01000','01000'],
  '8': ['01110','10001','10001','01110','10001','10001','01110'],
  '9': ['01110','10001','10001','01111','00001','00001','01110'],
  'a': ['00000','01110','00001','01111','10001','10011','01101'],
  'b': ['10000','10000','10110','11001','10001','10001','11110'],
  'c': ['00000','01110','10001','10000','10000','10001','01110'],
  'd': ['00001','00001','01101','10011','10001','10001','01111'],
  'e': ['00000','01110','10001','11111','10000','10001','01110'],
  'f': ['00110','01001','01000','11100','01000','01000','01000'],
  'g': ['00000','01111','10001','10001','01111','00001','01110'],
  'h': ['10000','10000','10110','11001','10001','10001','10001'],
  'i': ['00100','00000','01100','00100','00100','00100','01110'],
  'j': ['00010','00000','00110','00010','00010','10010','01100'],
  'k': ['10000','10000','10010','10100','11000','10100','10010'],
  'l': ['01100','00100','00100','00100','00100','00100','01110'],
  'm': ['00000','11010','10101','10101','10101','10101','10101'],
  'n': ['00000','10110','11001','10001','10001','10001','10001'],
  'o': ['00000','01110','10001','10001','10001','10001','01110'],
  'p': ['00000','11110','10001','10001','11110','10000','10000'],
  'q': ['00000','01101','10011','10001','01111','00001','00001'],
  'r': ['00000','10110','11001','10000','10000','10000','10000'],
  's': ['00000','01111','10000','01110','00001','00001','11110'],
  't': ['01000','01000','11100','01000','01000','01001','00110'],
  'u': ['00000','10001','10001','10001','10001','10011','01101'],
  'v': ['00000','10001','10001','10001','10001','01010','00100'],
  'w': ['00000','10001','10001','10101','10101','10101','01010'],
  'x': ['00000','10001','01010','00100','01010','10001','10001'],
  'y': ['00000','10001','10001','01111','00001','00010','11100'],
  'z': ['00000','11111','00010','00100','01000','10000','11111'],
};

function readJson(filePath, fallback = null) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { return fallback; }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function sha256File(filePath) {
  return fs.existsSync(filePath)
    ? createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
    : null;
}

function relative(filePath) {
  return path.relative(repositoryRoot, filePath).split(path.sep).join('/');
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function urlsFrom(...values) {
  return unique(values.flatMap(asArray).filter((value) =>
    typeof value === 'string' && /^https?:\/\//u.test(value)));
}

function normalizeHash(value) {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/^sha256:/iu, '').trim().toLowerCase();
  return /^[0-9a-f]{64}$/u.test(cleaned) ? cleaned : null;
}

function findSourceImage(directory, source) {
  const names = unique([
    source?.sourceImage,
    source?.localImage,
    source?.localFile,
    source?.sourceLocalFile,
    ...fs.existsSync(directory)
      ? fs.readdirSync(directory).filter((name) => /^source-image\.(png|jpe?g|webp)$/iu.test(name)).sort()
      : [],
  ]);
  return names.map((name) => path.resolve(directory, name)).find((candidate) => fs.existsSync(candidate)) ?? null;
}

function packageProposal(packageId) {
  const proposal = readJson(path.join(factoryRoot, packageId, 'proposal-manifest.json'), {});
  return new Map((proposal.subtypes ?? []).map((record) => [record.subtypeId ?? record.id, record]));
}

function verifierRecordIndex(verifier) {
  return new Map((verifier?.packages ?? []).flatMap((pkg) =>
    (pkg.recordResults ?? []).map((record) => [record.subtypeId, record])));
}

function inspectEntry(subtype, family, index, proposals, verifierRecords) {
  const packageId = PACKAGE_BY_FAMILY[subtype.familyId];
  const directory = path.join(finalRoot, packageId ?? '__unmapped__', subtype.id);
  const sourcePath = path.join(directory, 'source.json');
  const promptPath = path.join(directory, 'prompt.txt');
  const sheetPath = path.join(directory, 'six-view.png');
  const auditPath = path.join(directory, 'audit.json');
  const source = readJson(sourcePath, {});
  const audit = readJson(auditPath, {});
  const sourceImagePath = findSourceImage(directory, source);
  const proposal = proposals[packageId]?.get(subtype.id) ?? {};
  const nature = proposal.sourceResearch?.naturePhoto ?? proposal.research?.naturePhoto ?? {};
  const authority = proposal.sourceResearch?.geologyAuthority ?? proposal.research?.geologyAuthority ?? {};
  const verifierRecord = verifierRecords.get(subtype.id) ?? null;
  const files = {
    source: fs.existsSync(sourcePath),
    sourceImage: Boolean(sourceImagePath),
    prompt: fs.existsSync(promptPath),
    sheet: fs.existsSync(sheetPath),
    audit: fs.existsSync(auditPath),
  };
  const hashes = {
    sourceRecord: sha256File(sourcePath),
    sourceImage: sourceImagePath ? sha256File(sourceImagePath) : null,
    prompt: sha256File(promptPath),
    sheet: sha256File(sheetPath),
    audit: sha256File(auditPath),
  };
  const declared = {
    sourceImage: normalizeHash(source.sourceContentHash ?? source.localSha256 ?? source.sourceSha256),
    prompt: normalizeHash(audit.promptSha256 ?? audit.promptHash ?? source.promptSha256),
    sheet: normalizeHash(audit.generatedContentHash ?? audit.sheetSha256 ?? audit.outputSha256 ?? audit.sha256),
  };
  let sheetDecoded = false;
  let sheetDimensions = null;
  if (files.sheet) {
    try {
      const decoded = decodePng(fs.readFileSync(sheetPath));
      sheetDecoded = true;
      sheetDimensions = { width: decoded.width, height: decoded.height };
    } catch { /* represented as a fail-closed entry below */ }
  }
  const missingFiles = Object.entries(files).filter(([, present]) => !present).map(([name]) => name);
  const declaredHashMismatches = [
    declared.sourceImage && declared.sourceImage !== hashes.sourceImage ? 'sourceImage' : null,
    declared.prompt && declared.prompt !== hashes.prompt ? 'prompt' : null,
    declared.sheet && declared.sheet !== hashes.sheet ? 'sheet' : null,
  ].filter(Boolean);
  return {
    ordinal: index + 1,
    id: subtype.id,
    label: subtype.label,
    familyId: subtype.familyId,
    familyLabel: family?.label ?? subtype.familyId,
    packageId: packageId ?? null,
    paths: {
      directory: relative(directory),
      sourceRecord: relative(sourcePath),
      sourceImage: sourceImagePath ? relative(sourceImagePath) : null,
      prompt: relative(promptPath),
      sheet: relative(sheetPath),
      audit: relative(auditPath),
    },
    files,
    hashes,
    declaredHashes: declared,
    declaredHashMismatches,
    sheet: { decoded: sheetDecoded, dimensions: sheetDimensions },
    provenance: {
      naturePageUrls: urlsFrom(
        source.stablePageUrl,
        source.stablePageUrls,
        source.provenance?.stablePageUrl,
        source.provenance?.stablePageUrls,
        source.provenance?.pageUrl,
        source.provenance?.pageUrls,
        nature.stablePageUrl,
        nature.pageUrl,
        nature.pageUrls,
      ),
      geologyAuthorityUrls: urlsFrom(
        source.geologyAuthority,
        source.geologyAuthority?.pageUrl,
        source.provenance?.geologyAuthority,
        source.provenance?.geologyAuthority?.pageUrl,
        authority.stablePageUrl,
        authority.pageUrl,
        authority.pageUrls,
      ),
      credit: source.credit ?? source.provenance?.credit ?? nature.credit ?? null,
      rights: source.rights ?? source.license ?? source.provenance?.rights ?? source.provenance?.license ?? nature.rights ?? null,
      proposalManifest: relative(path.join(factoryRoot, packageId ?? '__unmapped__', 'proposal-manifest.json')),
    },
    auditApproval: audit.approved === true || ['approved', 'pass', 'passed', 'shape-pass'].includes(String(audit.status ?? '').toLowerCase()),
    verifier: verifierRecord ? { passed: verifierRecord.passed === true, failures: verifierRecord.failures ?? [] } : { passed: false, failures: ['missing-independent-verifier-record'] },
    packageComplete: missingFiles.length === 0 && sheetDecoded && declaredHashMismatches.length === 0,
    missingFiles,
  };
}

let crcTable;
function crc32(buffer) {
  if (!crcTable) {
    crcTable = Array.from({ length: 256 }, (_, value) => {
      let crc = value;
      for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
      return crc >>> 0;
    });
  }
  let crc = 0xffffffff;
  for (const value of buffer) crc = crcTable[(crc ^ value) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function encodePng(rgba, width, height) {
  const signature = Buffer.from('89504e470d0a1a0a', 'hex');
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const scanlines = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y += 1) {
    const target = y * (width * 4 + 1);
    scanlines[target] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(scanlines, target + 1);
  }
  return Buffer.concat([
    signature,
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(scanlines, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function fill(data, width, x, y, w, h, color) {
  const [r, g, b, a = 255] = color;
  for (let yy = Math.max(0, y); yy < Math.min(y + h, data.length / 4 / width); yy += 1) {
    for (let xx = Math.max(0, x); xx < Math.min(x + w, width); xx += 1) {
      const offset = (yy * width + xx) * 4;
      data[offset] = r; data[offset + 1] = g; data[offset + 2] = b; data[offset + 3] = a;
    }
  }
}

function setPixel(data, width, height, x, y, color) {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const offset = (y * width + x) * 4;
  data[offset] = color[0]; data[offset + 1] = color[1]; data[offset + 2] = color[2]; data[offset + 3] = color[3] ?? 255;
}

function drawLine(data, width, height, x0, y0, x1, y1, color) {
  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let error = dx + dy;
  while (true) {
    setPixel(data, width, height, x0, y0, color);
    if (x0 === x1 && y0 === y1) break;
    const twice = 2 * error;
    if (twice >= dy) { error += dy; x0 += sx; }
    if (twice <= dx) { error += dx; y0 += sy; }
  }
}

function drawText(data, width, height, text, x, y, scale = 2, color = [24, 24, 24, 255]) {
  let cursor = x;
  for (const raw of text.toLowerCase()) {
    const glyph = FONT[raw] ?? FONT[' '];
    for (let gy = 0; gy < glyph.length; gy += 1) {
      for (let gx = 0; gx < glyph[gy].length; gx += 1) {
        if (glyph[gy][gx] !== '1') continue;
        fill(data, width, cursor + gx * scale, y + gy * scale, scale, scale, color);
      }
    }
    cursor += 6 * scale;
  }
  return cursor;
}

function textWidth(text, scale) {
  return text.length * 6 * scale;
}

function blitContain(target, targetWidth, targetHeight, source, x, y, width, height) {
  const scale = Math.min(width / source.width, height / source.height);
  const drawWidth = Math.max(1, Math.floor(source.width * scale));
  const drawHeight = Math.max(1, Math.floor(source.height * scale));
  const offsetX = x + Math.floor((width - drawWidth) / 2);
  const offsetY = y + Math.floor((height - drawHeight) / 2);
  for (let dy = 0; dy < drawHeight; dy += 1) {
    const sy = Math.min(source.height - 1, Math.floor((dy + 0.5) / scale));
    for (let dx = 0; dx < drawWidth; dx += 1) {
      const sx = Math.min(source.width - 1, Math.floor((dx + 0.5) / scale));
      const sourceOffset = (sy * source.width + sx) * 4;
      const targetOffset = ((offsetY + dy) * targetWidth + offsetX + dx) * 4;
      const alpha = source.data[sourceOffset + 3] / 255;
      for (let channel = 0; channel < 3; channel += 1) {
        target[targetOffset + channel] = Math.round(source.data[sourceOffset + channel] * alpha + 255 * (1 - alpha));
      }
      target[targetOffset + 3] = 255;
    }
  }
}

function renderContactSheet(entries, title, outputPath) {
  const rows = Math.max(1, Math.ceil(entries.length / COLUMNS));
  const width = COLUMNS * TILE_WIDTH;
  const height = TITLE_HEIGHT + rows * TILE_HEIGHT;
  const rgba = new Uint8Array(width * height * 4);
  fill(rgba, width, 0, 0, width, height, [250, 250, 250, 255]);
  const titleScale = textWidth(title, 2) <= width - 24 ? 2 : 1;
  drawText(rgba, width, height, title, 12, 12, titleScale, [16, 16, 16, 255]);
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const column = index % COLUMNS;
    const row = Math.floor(index / COLUMNS);
    const x = column * TILE_WIDTH;
    const y = TITLE_HEIGHT + row * TILE_HEIGHT;
    const pass = entry.verifier.passed && entry.packageComplete;
    fill(rgba, width, x, y, TILE_WIDTH, LABEL_HEIGHT, pass ? [224, 244, 229, 255] : [255, 231, 222, 255]);
    fill(rgba, width, x, y + LABEL_HEIGHT, TILE_WIDTH, IMAGE_HEIGHT, [255, 255, 255, 255]);
    const label = `${String(entry.ordinal).padStart(3, '0')} ${entry.id}`;
    const labelScale = textWidth(label, 2) <= TILE_WIDTH - 16 ? 2 : 1;
    drawText(rgba, width, height, label, x + 8, y + 9, labelScale, [18, 18, 18, 255]);
    if (entry.files.sheet && entry.sheet.decoded) {
      const decoded = decodePng(fs.readFileSync(path.join(repositoryRoot, entry.paths.sheet)));
      blitContain(rgba, width, height, decoded, x + 4, y + LABEL_HEIGHT + 4, TILE_WIDTH - 8, IMAGE_HEIGHT - 8);
    } else {
      drawLine(rgba, width, height, x + 30, y + LABEL_HEIGHT + 24, x + TILE_WIDTH - 30, y + TILE_HEIGHT - 24, [190, 40, 40, 255]);
      drawLine(rgba, width, height, x + TILE_WIDTH - 30, y + LABEL_HEIGHT + 24, x + 30, y + TILE_HEIGHT - 24, [190, 40, 40, 255]);
      drawText(rgba, width, height, 'missing or invalid sheet', x + 58, y + LABEL_HEIGHT + 100, 2, [150, 25, 25, 255]);
    }
    drawLine(rgba, width, height, x, y, x + TILE_WIDTH - 1, y, [190, 190, 190, 255]);
    drawLine(rgba, width, height, x, y, x, y + TILE_HEIGHT - 1, [190, 190, 190, 255]);
    drawLine(rgba, width, height, x + TILE_WIDTH - 1, y, x + TILE_WIDTH - 1, y + TILE_HEIGHT - 1, [190, 190, 190, 255]);
    drawLine(rgba, width, height, x, y + TILE_HEIGHT - 1, x + TILE_WIDTH - 1, y + TILE_HEIGHT - 1, [190, 190, 190, 255]);
  }
  fs.writeFileSync(outputPath, encodePng(rgba, width, height));
  return { path: relative(outputPath), sha256: sha256File(outputPath), width, height, entries: entries.map((entry) => entry.id) };
}

function runVerifier() {
  const result = spawnSync(process.execPath, [verifierPath], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return { exitCode: result.status ?? 1, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
}

const EXPECTED_PACKAGE_COUNTS = { clasts: 21, residuals: 21, cliffs: 23, forms: 35 };

function finalRootPath(relativePath) {
  if (typeof relativePath !== 'string' || !relativePath) return null;
  if (relativePath.startsWith('artifacts/')) return path.resolve(repositoryRoot, relativePath);
  return path.resolve(finalRoot, relativePath);
}

function validateAuthoritativeVisualReport(report) {
  const failures = [];
  const summary = report?.summary ?? {};
  const scope = report?.scope ?? {};
  const familyAudits = Array.isArray(report?.familyAudits) ? report.familyAudits : [];
  const seenIds = new Set();
  if (report?.schema !== 'toonlab/rock-reference-final-visual-100') failures.push('missing-or-wrong-visual-schema');
  if (report?.gate !== 'fail-closed') failures.push('visual-gate-not-fail-closed');
  if (scope.expectedIds !== 100) failures.push('visual-scope-count-not-100');
  if (scope.requiredGrid !== '3 columns x 2 rows') failures.push('visual-required-grid-mismatch');
  if (!Array.isArray(scope.requiredOrder) || scope.requiredOrder.length !== 6) failures.push('visual-required-order-missing');
  for (const field of ['recordedIds', 'uniqueIds', 'recordedVisualPasses', 'liveHashChecks', 'actualLandscapeThreeByTwoPasses']) {
    if (summary[field] !== 100) failures.push(`visual-summary-${field}-not-100`);
  }
  if (summary.staleInputFailures !== 0) failures.push('visual-stale-input-failures');
  if (summary.approved !== true) failures.push('visual-summary-not-approved');
  if (report?.staleInputPolicy?.result !== 'fail') failures.push('visual-stale-input-policy-missing');
  if (typeof report?.hypothesisDisclaimer !== 'string' || !report.hypothesisDisclaimer.length) failures.push('visual-hypothesis-disclaimer-missing');
  if (familyAudits.length !== Object.keys(EXPECTED_PACKAGE_COUNTS).length) failures.push('visual-family-audit-count-mismatch');

  for (const familyAudit of familyAudits) {
    const packageId = familyAudit?.packageId;
    const expected = EXPECTED_PACKAGE_COUNTS[packageId];
    if (!expected) { failures.push(`visual-unexpected-package-${packageId ?? 'missing'}`); continue; }
    if (familyAudit.result !== 'pass') failures.push(`visual-family-${packageId}-not-pass`);
    for (const field of ['recordedEntries', 'auditPasses', 'liveHashChecks']) {
      if (familyAudit[field] !== expected) failures.push(`visual-family-${packageId}-${field}-mismatch`);
    }
    if (!Array.isArray(familyAudit.staleInputFailures) || familyAudit.staleInputFailures.length) failures.push(`visual-family-${packageId}-stale-input`);
    const auditPath = finalRootPath(familyAudit.audit);
    if (!auditPath || !fs.existsSync(auditPath)) { failures.push(`visual-family-${packageId}-audit-missing`); continue; }
    if (normalizeHash(familyAudit.auditSha256) !== sha256File(auditPath)) failures.push(`visual-family-${packageId}-audit-hash-mismatch`);
    const audit = readJson(auditPath, {});
    const entries = Array.isArray(audit.entries) ? audit.entries : [];
    if (entries.length !== expected) failures.push(`visual-family-${packageId}-entry-count-mismatch`);
    for (const entry of entries) {
      const id = entry?.id;
      if (!id || seenIds.has(id)) { failures.push(`visual-duplicate-or-missing-id-${id ?? 'missing'}`); continue; }
      seenIds.add(id);
      const liveSheetPath = path.join(finalRoot, packageId, id, 'six-view.png');
      const recordedHash = normalizeHash(entry.inputSha256 ?? entry.sheetSha256 ?? entry.outputSha256);
      if (!recordedHash || recordedHash !== sha256File(liveSheetPath)) failures.push(`visual-live-sheet-hash-mismatch-${id}`);
      if (!(entry.passed === true || entry.result === 'pass')) failures.push(`visual-entry-not-pass-${id}`);
    }
  }
  if (seenIds.size !== 100) failures.push(`visual-unique-id-count-${seenIds.size}`);
  return { passed: failures.length === 0, failures };
}

function validateAuthoritativeRightsReport(report) {
  const failures = [];
  const summary = report?.summary ?? {};
  const scope = report?.scope ?? {};
  const records = Array.isArray(report?.records) ? report.records : [];
  const seenIds = new Set();
  if (report?.schema !== 'toonlab/rock-reference-source-rights-audit') failures.push('missing-or-wrong-rights-schema');
  const rightsFailClosed = report?.gate === 'fail-closed'
    || (typeof report?.method === 'string'
      && /^fail-closed\b/iu.test(report.method)
      && report?.gateLegend
      && ['image', 'page', 'hash', 'credit', 'license', 'rights', 'authority', 'rationale', 'shape'].every((key) => typeof report.gateLegend[key] === 'string'));
  if (!rightsFailClosed) failures.push('rights-gate-not-fail-closed');
  if (summary.total !== 100 || summary.passed !== 100 || summary.failed !== 0) failures.push('rights-summary-not-100-pass');
  if (!Array.isArray(summary.failedIds) || summary.failedIds.length) failures.push('rights-failed-ids-present');
  if (scope.total !== 100 || scope.imagesOrPackageMetadataModified !== false) failures.push('rights-scope-not-immutable-100');
  if (records.length !== 100) failures.push(`rights-record-count-${records.length}`);
  for (const [packageId, expected] of Object.entries(EXPECTED_PACKAGE_COUNTS)) {
    const packageSummary = summary.byPackage?.[packageId];
    if (!packageSummary || packageSummary.total !== expected || packageSummary.passed !== expected || packageSummary.failed !== 0) failures.push(`rights-package-${packageId}-not-pass`);
  }
  for (const record of records) {
    const id = record?.id;
    if (!id || seenIds.has(id)) { failures.push(`rights-duplicate-or-missing-id-${id ?? 'missing'}`); continue; }
    seenIds.add(id);
    if (record.status !== 'pass') failures.push(`rights-record-not-pass-${id}`);
    const gates = record.gates ?? {};
    for (const gate of ['image', 'page', 'hash', 'credit', 'license', 'rights', 'authority', 'rationale', 'shape']) {
      if (gates[gate] !== true) failures.push(`rights-${gate}-gate-failed-${id}`);
    }
    const source = record.source ?? {};
    const imagePath = finalRootPath(source.image);
    const sourceJsonPath = finalRootPath(source.json);
    const actualImageHash = imagePath && fs.existsSync(imagePath) ? sha256File(imagePath) : null;
    const actualSourceJsonHash = sourceJsonPath && fs.existsSync(sourceJsonPath) ? sha256File(sourceJsonPath) : null;
    if (source.hashRecomputed !== true || !actualImageHash || actualImageHash !== normalizeHash(source.sha256) || actualImageHash !== normalizeHash(source.actualSha256)) failures.push(`rights-live-source-image-hash-mismatch-${id}`);
    if (!actualSourceJsonHash || actualSourceJsonHash !== normalizeHash(source.sourceJsonSha256)) failures.push(`rights-live-source-json-hash-mismatch-${id}`);
  }
  if (seenIds.size !== 100) failures.push(`rights-unique-id-count-${seenIds.size}`);
  return { passed: failures.length === 0, failures };
}

function main() {
  fs.mkdirSync(contactRoot, { recursive: true });
  const verifierRun = runVerifier();
  const verifier = readJson(verifierReportPath, {});
  const taxonomy = readJson(taxonomyPath, {});
  const families = new Map((taxonomy.families ?? []).map((family) => [family.id, family]));
  const proposals = Object.fromEntries(Object.keys(PACKAGE_FAMILIES).map((packageId) => [packageId, packageProposal(packageId)]));
  const verifierRecords = verifierRecordIndex(verifier);
  const entries = (taxonomy.subtypes ?? []).map((subtype, index) =>
    inspectEntry(subtype, families.get(subtype.familyId), index, proposals, verifierRecords));

  const manifest = {
    schema: 'toonlab/rock-reference-final-review-manifest',
    version: 1,
    gate: 'fail-closed',
    taxonomy: {
      path: relative(taxonomyPath),
      sha256: sha256File(taxonomyPath),
      expectedCount: 100,
      actualCount: entries.length,
    },
    finalRoot: relative(finalRoot),
    ordering: 'taxonomy source order',
    counts: {
      expected: 100,
      entries: entries.length,
      completePackages: entries.filter((entry) => entry.packageComplete).length,
      verifierPassedEntries: entries.filter((entry) => entry.verifier.passed).length,
      missingPackageFiles: entries.reduce((sum, entry) => sum + entry.missingFiles.length, 0),
      declaredHashMismatches: entries.reduce((sum, entry) => sum + entry.declaredHashMismatches.length, 0),
    },
    entries,
  };
  writeJson(path.join(reviewRoot, 'master-manifest.json'), manifest);

  const sheets = [];
  for (let familyIndex = 0; familyIndex < (taxonomy.families ?? []).length; familyIndex += 1) {
    const family = taxonomy.families[familyIndex];
    const familyEntries = entries.filter((entry) => entry.familyId === family.id);
    const filename = `family-${String(familyIndex + 1).padStart(2, '0')}-${family.id}.png`;
    sheets.push({
      kind: 'family', familyId: family.id,
      ...renderContactSheet(familyEntries, `family ${String(familyIndex + 1).padStart(2, '0')} ${family.id}`, path.join(contactRoot, filename)),
    });
  }
  const pageCount = Math.ceil(entries.length / PAGE_SIZE);
  for (let page = 0; page < pageCount; page += 1) {
    const pageEntries = entries.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    const filename = `all-families-page-${String(page + 1).padStart(2, '0')}.png`;
    sheets.push({
      kind: 'all-families-page', page: page + 1, pageCount,
      ...renderContactSheet(pageEntries, `all families page ${page + 1} of ${pageCount}`, path.join(contactRoot, filename)),
    });
  }
  writeJson(path.join(reviewRoot, 'contact-sheet-index.json'), {
    schema: 'toonlab/rock-reference-final-contact-sheets',
    version: 1,
    labelsOutsideImageCells: true,
    ordering: 'taxonomy source order',
    pageSize: PAGE_SIZE,
    sheets,
  });

  const authoritativeVisualReport = readJson(authoritativeVisualReportPath, null);
  const authoritativeRightsReport = readJson(authoritativeRightsReportPath, null);
  const authoritativeVisual = validateAuthoritativeVisualReport(authoritativeVisualReport);
  const authoritativeRights = validateAuthoritativeRightsReport(authoritativeRightsReport);

  const visualReview = readJson(path.join(reviewRoot, 'visual-review.json'), null);
  const allFamilySheets = sheets.filter((sheet) => sheet.kind === 'all-families-page');
  const inspectedHashes = new Map((visualReview?.inspectedContactSheets ?? []).map((item) => [item.page, item.sha256]));
  const visualReviewCurrent = Boolean(visualReview)
    && allFamilySheets.length === pageCount
    && allFamilySheets.every((sheet) => inspectedHashes.get(sheet.page) === sheet.sha256);
  const visualReviewPassed = visualReviewCurrent && visualReview?.approved === true;

  const summary = {
    schema: 'toonlab/rock-reference-final-review-summary',
    version: 1,
    gate: 'fail-closed',
    passed: verifierRun.exitCode === 0
      && verifier.passed === true
      && entries.length === 100
      && entries.every((entry) => entry.packageComplete && entry.verifier.passed)
      && authoritativeVisual.passed
      && authoritativeRights.passed,
    independentVerifier: {
      command: 'node scripts/verify-rock-reference-final.mjs',
      exitCode: verifierRun.exitCode,
      report: relative(verifierReportPath),
      passed: verifier.passed === true,
      counts: verifier.counts ?? null,
      missingGlobalIds: verifier.missingGlobalIds ?? [],
      unexpectedGlobalIds: verifier.unexpectedGlobalIds ?? [],
      duplicateGlobalIds: verifier.duplicateGlobalIds ?? [],
    },
    consolidation: manifest.counts,
    contactSheets: { expectedFamilies: 12, familySheets: 12, allFamilyPages: pageCount },
    authoritativeAudits: {
      visual: {
        path: relative(authoritativeVisualReportPath),
        present: Boolean(authoritativeVisualReport),
        passed: authoritativeVisual.passed,
        failures: authoritativeVisual.failures,
        summary: authoritativeVisualReport?.summary ?? null,
      },
      sourceRights: {
        path: relative(authoritativeRightsReportPath),
        present: Boolean(authoritativeRightsReport),
        passed: authoritativeRights.passed,
        failures: authoritativeRights.failures,
        summary: authoritativeRightsReport?.summary ?? null,
      },
    },
    sourcePreAudit: {
      legacyPassed: verifier.sourcePreAudit?.passed === true,
      authoritativeSourceRightsPassed: authoritativeRights.passed,
      productionReports: verifier.sourcePreAudit?.productionReports ?? [],
    },
    visualReview: {
      path: relative(path.join(reviewRoot, 'visual-review.json')),
      present: Boolean(visualReview),
      current: visualReviewCurrent,
      approved: visualReview?.approved === true,
      passed: visualReviewPassed,
      authoritative: false,
      status: visualReview?.status ?? 'not-present',
    },
    blockers: unique([
      verifierRun.exitCode !== 0 ? 'independent-verifier-nonzero' : null,
      verifier.passed !== true ? 'independent-verifier-failed' : null,
      !authoritativeVisual.passed ? 'authoritative-visual-audit-missing-or-failed' : null,
      !authoritativeRights.passed ? 'authoritative-source-rights-audit-missing-or-failed' : null,
      entries.length !== 100 ? `taxonomy-entry-count-${entries.length}` : null,
      ...entries.filter((entry) => !entry.packageComplete).map((entry) => `incomplete-package:${entry.id}`),
      ...entries.filter((entry) => !entry.verifier.passed).map((entry) => `verifier-record-failed:${entry.id}`),
    ]),
  };
  writeJson(path.join(reviewRoot, 'verifier-summary.json'), summary);
  fs.writeFileSync(path.join(reviewRoot, 'README.md'), [
    '# Final rock-reference review',
    '',
    `Gate: **${summary.passed ? 'PASS' : 'FAIL-CLOSED'}**`,
    '',
    '- `master-manifest.json` is the deterministic taxonomy-ordered 100-ID inventory.',
    '- `contact-sheet-index.json` hashes every family and paginated review sheet.',
    '- Green label bands indicate an independently verified record; red bands indicate a blocker.',
    '- Labels occupy dedicated bands outside image cells.',
    '- `final-visual-100.json` and `source-rights-audit-100.json` are the authoritative fail-closed final gates.',
    '- `visual-review.json` is retained as a legacy diagnostic and does not replace the authoritative 100-entry audits.',
    '- Generated hidden views remain reconstruction hypotheses, not geological evidence.',
    '',
  ].join('\n'));

  console.log(JSON.stringify({
    passed: summary.passed,
    expected: 100,
    entries: entries.length,
    completePackages: manifest.counts.completePackages,
    verifierPassedEntries: manifest.counts.verifierPassedEntries,
    contactSheets: sheets.length,
    blockers: summary.blockers.length,
    reviewRoot: relative(reviewRoot),
  }, null, 2));
  if (!summary.passed) process.exitCode = 1;
}

main();
