import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const c11Root = path.join(
  repoRoot,
  'artifacts/research/rock-geology-v2/checkpoint-11-stylization/hoodoo-caprock',
);
const captureManifestFile = path.join(c11Root, 'final-captures/manifest.json');
const webGpuVerificationFile = path.join(c11Root, 'visible-webgpu/verification.json');
const webGpuSixViewManifestFile = path.join(c11Root, 'visible-webgpu/multiview/manifest.json');
const comparisonAuditFile = path.join(c11Root, 'review/hoodoo-neutral-vs-stylized-six-view.json');
const regionVerificationFile = path.join(c11Root, 'semantic-regions/verification.json');
const regionCaptureManifestFile = path.join(c11Root, 'semantic-regions/captures/manifest.json');
const regionComparisonAuditFile = path.join(c11Root, 'semantic-regions/hoodoo-regions-neutral-vs-stylized-six-view.json');
const productionWebGpuManifestFile = path.join(c11Root, 'production-scene/webgpu-six-view/manifest.json');
const productionWebGlManifestFile = path.join(c11Root, 'production-scene/captures/manifest.json');
const productionComparisonAuditFile = path.join(c11Root, 'production-scene/hoodoo-production-neutral-vs-stylized-six-view.json');
const regionGlbFile = path.join(c11Root, 'semantic-regions/hoodoo-caprock-lod0-desktop-4k-regions.glb');
const developerVisualDecisionFile = path.join(c11Root, 'developer-visual-decision.json');
const evidenceSourceFiles = [
  path.join(repoRoot, 'labs/rock-geology-v2-c11/main.js'),
  path.join(repoRoot, 'labs/rock-geology-v2-c11-production/index.html'),
  path.join(repoRoot, 'labs/rock-geology-v2-c11-production/main.js'),
  path.join(repoRoot, 'src/rock-shader/rockMaterial.js'),
  path.join(repoRoot, 'src/rock-shader/rockRegionRuntime.js'),
  path.join(repoRoot, 'src/rock-shader/rockShaderRuntime.js'),
];

const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
};
const hashFile = async (file) => {
  const bytes = await readFile(file);
  return { bytes: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex') };
};
const hashFileRecord = async (file) => ({ file, ...(await hashFile(file)) });
const hashCanonicalJson = (value) => {
  if (value === undefined) return null;
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex');
};

const [
  captureManifest,
  webGpuVerification,
  webGpuSixViewManifest,
  comparisonAudit,
  regionVerification,
  regionCaptureManifest,
  regionComparisonAudit,
  productionWebGpuManifest,
  productionWebGlManifest,
  productionComparisonAudit,
  developerVisualDecision,
] = await Promise.all([
  readJson(captureManifestFile),
  readJson(webGpuVerificationFile),
  readJson(webGpuSixViewManifestFile),
  readJson(comparisonAuditFile),
  readJson(regionVerificationFile),
  readJson(regionCaptureManifestFile),
  readJson(regionComparisonAuditFile),
  readJson(productionWebGpuManifestFile),
  readJson(productionWebGlManifestFile),
  readJson(productionComparisonAuditFile),
  readJson(developerVisualDecisionFile),
]);

const checks = [];
const check = (id, passed, evidence) => checks.push({ id, passed: Boolean(passed), evidence });
const regionStyledCaptures = regionCaptureManifest.captures
  ?.filter((capture) => capture.mode === 'styled') ?? [];
const productionWebGlStyledCaptures = productionWebGlManifest.captures
  ?.filter((capture) => capture.mode === 'styled') ?? [];
const presentedStyle = regionStyledCaptures[0]?.report?.style ?? null;
const productionWebGpuEvidenceComplete = Boolean(
  productionWebGpuManifest.version >= 3
  && productionWebGpuManifest.headed === true
  && productionWebGpuManifest.style
  && productionWebGpuManifest.sourceEvidence?.semanticGlb?.sha256
  && productionWebGpuManifest.sourceEvidence?.labIndex?.sha256
  && productionWebGpuManifest.sourceEvidence?.labMain?.sha256
  && productionWebGpuManifest.sourceEvidence?.rockMaterial?.sha256
  && productionWebGpuManifest.sourceEvidence?.rockRegionRuntime?.sha256
  && productionWebGpuManifest.sourceEvidence?.rockShaderRuntime?.sha256
  && Array.isArray(productionWebGpuManifest.pageErrors)
  && Array.isArray(productionWebGpuManifest.consoleErrors)
  && Array.isArray(productionWebGpuManifest.failedResponses)
  && Array.isArray(productionWebGpuManifest.stabilityRuns),
);
const productionWebGpuExpectedSources = {
  semanticGlb: regionGlbFile,
  labIndex: path.join(repoRoot, 'labs/rock-geology-v2-c11-production/index.html'),
  labMain: path.join(repoRoot, 'labs/rock-geology-v2-c11-production/main.js'),
  rockMaterial: path.join(repoRoot, 'src/rock-shader/rockMaterial.js'),
  rockRegionRuntime: path.join(repoRoot, 'src/rock-shader/rockRegionRuntime.js'),
  rockShaderRuntime: path.join(repoRoot, 'src/rock-shader/rockShaderRuntime.js'),
};
const productionWebGpuCurrentSources = Object.fromEntries(await Promise.all(
  Object.entries(productionWebGpuExpectedSources).map(async ([key, file]) => [
    key,
    { file, ...(await hashFile(file)) },
  ]),
));
const productionWebGpuSourceBindingsCurrent = Object.entries(
  productionWebGpuCurrentSources,
).every(([key, current]) => {
  const before = productionWebGpuManifest.sourceEvidence?.[key];
  const after = productionWebGpuManifest.sourceEvidenceAfter?.[key];
  return before?.file === current.file
    && before?.bytes === current.bytes
    && before?.sha256 === current.sha256
    && after?.file === current.file
    && after?.bytes === current.bytes
    && after?.sha256 === current.sha256;
});
const productionWebGpuImageBindings = await Promise.all(
  (productionWebGpuManifest.stabilityRuns ?? []).flatMap((run) => (
    (run.records ?? []).flatMap((record) => (
      ['neutral', 'styled', 'restored'].map(async (mode) => {
        const expected = record[mode];
        const current = expected?.file ? await hashFile(expected.file) : null;
        return {
          run: run.run,
          view: record.view,
          mode,
          file: expected?.file ?? null,
          expectedBytes: expected?.bytes ?? null,
          actualBytes: current?.bytes ?? null,
          expectedSha256: expected?.sha256 ?? null,
          actualSha256: current?.sha256 ?? null,
          passed: Boolean(current)
            && expected.bytes === current.bytes
            && expected.sha256 === current.sha256,
        };
      })
    ))
  )),
);
const developerEvidenceBindings = await Promise.all(
  (developerVisualDecision.evidence ?? []).map(async (record) => {
    const resolved = path.resolve(repoRoot, record.relativePath ?? '');
    const insideRepository = resolved === repoRoot || resolved.startsWith(`${repoRoot}${path.sep}`);
    const current = insideRepository ? await hashFile(resolved) : null;
    return {
      ...record,
      resolved,
      insideRepository,
      actualBytes: current?.bytes ?? null,
      actualSha256: current?.sha256 ?? null,
      passed: insideRepository
        && current?.bytes === record.bytes
        && current?.sha256 === record.sha256,
    };
  }),
);
const requiredDeveloperEvidenceRoles = [
  'semantic-neutral-vs-stylized-six-view',
  'production-neutral-vs-stylized-six-view',
  'presented-style-settings',
];
const developerVisualApproval = Boolean(
  developerVisualDecision.schema === 'toonlab/rock-geology-v2-developer-visual-decision'
  && developerVisualDecision.version === 1
  && developerVisualDecision.assetId === 'hoodoo-caprock'
  && developerVisualDecision.decision === 'approved'
  && developerVisualDecision.scope === 'mvp-v0.1-visual-benchmark'
  && developerVisualDecision.reviewer?.role === 'developer'
  && typeof developerVisualDecision.rationale === 'string'
  && developerVisualDecision.rationale.length > 0
  && typeof developerVisualDecision.attestation === 'string'
  && developerVisualDecision.attestation.length > 0
  && requiredDeveloperEvidenceRoles.every((role) => (
    developerEvidenceBindings.some((record) => record.role === role && record.passed)
  ))
  && developerEvidenceBindings.length === requiredDeveloperEvidenceRoles.length
);

check('webgl2-capture-manifest-passed', captureManifest.passed === true, captureManifestFile);
check('six-fixed-views-per-state',
  captureManifest.captures.length === 18
    && ['neutral', 'styled', 'restored'].every((mode) => (
      captureManifest.captures.filter((capture) => capture.mode === mode).length === 6
    )),
  { captures: captureManifest.captures.length });
check('webgl2-backend-explicit',
  captureManifest.captures.every((capture) => capture.actualBackend === 'webgl2-fallback'),
  [...new Set(captureManifest.captures.map((capture) => capture.actualBackend))]);
check('webgl2-six-view-pixel-restore-exact',
  captureManifest.restoredPixelChecks.length === 6
    && captureManifest.restoredPixelChecks.every((record) => record.exactPngBytesEqual === true),
  captureManifest.restoredPixelChecks);
check('protected-neutral-files-unchanged',
  captureManifest.sourceMutationFailures.length === 0
    && captureManifest.protectedInputsBefore.every((before, index) => (
      before.sha256 === captureManifest.protectedInputsAfter[index]?.sha256
      && before.bytes === captureManifest.protectedInputsAfter[index]?.bytes
    )),
  captureManifest.protectedInputsBefore);
check('canonical-glb-hash',
  captureManifest.protectedInputsBefore[0]?.sha256
    === 'd8081bb45a413bbeaab912767c47328308e91e0250aba5213ccb4409fdbf310e',
  captureManifest.protectedInputsBefore[0]);
check('developer-visual-benchmark-decision-bound', developerVisualApproval, {
  file: developerVisualDecisionFile,
  decision: developerVisualDecision.decision,
  scope: developerVisualDecision.scope,
  evidence: developerEvidenceBindings,
});

const styledCaptures = captureManifest.captures.filter((capture) => capture.mode === 'styled');
check('source-pbr-retained', styledCaptures.every((capture) => (
  capture.report.styleReport?.retainedSourceTextures === 3
  && capture.report.styleReport?.rejectedTextures?.length === 0
)), styledCaptures.map((capture) => ({ view: capture.view, report: capture.report.styleReport })));
check('material-only-no-geometry-detail',
  styledCaptures.every((capture) => capture.report.styleReport?.geometryDetail === null),
  styledCaptures.map((capture) => ({ view: capture.view, geometryDetail: capture.report.styleReport?.geometryDetail })));
check('twenty-cycle-identity-restore',
  captureManifest.captures.filter((capture) => capture.mode === 'restored').every((capture) => (
    capture.report.restore?.cycles === 20
    && capture.report.restore?.restoreCount === 20
    && capture.report.restore?.secondRestoreCount === 0
    && capture.report.restore?.identity?.passed === true
  )),
  captureManifest.captures.filter((capture) => capture.mode === 'restored')
    .map((capture) => ({ view: capture.view, restore: capture.report.restore })));

check('visible-webgpu-backend',
  webGpuVerification.passed === true && webGpuVerification.actualBackend === 'webgpu',
  webGpuVerificationFile);
check('visible-webgpu-same-page-pixel-restore-exact',
  webGpuVerification.exactSamePagePngBytesEqual === true
    && webGpuVerification.neutralPngSha256 === webGpuVerification.restoredPngSha256,
  {
    neutral: webGpuVerification.neutralPngSha256,
    restored: webGpuVerification.restoredPngSha256,
  });
check('visible-webgpu-object-identity-restore',
  webGpuVerification.restorationIdentity?.passed === true,
  webGpuVerification.restorationIdentity);
check('webgpu-webgl2-style-document-identical',
  JSON.stringify(canonicalize(webGpuVerification.style))
    === JSON.stringify(canonicalize(styledCaptures[0]?.report?.style)),
  {
    webgpu: webGpuVerification.style,
    webgl2: styledCaptures[0]?.report?.style,
  });
check('webgpu-six-view-manifest-passed',
  webGpuSixViewManifest.passed === true
    && webGpuSixViewManifest.records?.length === 6
    && JSON.stringify(webGpuSixViewManifest.records.map((record) => record.view))
      === JSON.stringify(['front', 'rear', 'left', 'right', 'top', 'bottom']),
  webGpuSixViewManifestFile);
check('webgpu-six-view-backend-explicit',
  webGpuSixViewManifest.records?.every((record) => record.actualBackend === 'webgpu'),
  [...new Set((webGpuSixViewManifest.records ?? []).map((record) => record.actualBackend))]);
check('webgpu-six-view-pixel-restore-exact',
  webGpuSixViewManifest.records?.every((record) => (
    record.restored?.exactPngBytesEqual === true
    && record.neutral?.sha256 === record.restored?.sha256
  )),
  (webGpuSixViewManifest.records ?? []).map((record) => ({
    view: record.view,
    neutral: record.neutral?.sha256,
    restored: record.restored?.sha256,
  })));
check('webgpu-six-view-runtime-identity-restore',
  webGpuSixViewManifest.records?.every((record) => record.restored?.identityPassed === true),
  (webGpuSixViewManifest.records ?? []).map((record) => ({
    view: record.view,
    identityPassed: record.restored?.identityPassed,
  })));
check('webgpu-six-view-source-pbr-retained-material-only',
  webGpuSixViewManifest.records?.every((record) => (
    record.styled?.retainedSourceTextures === 3
    && record.styled?.geometryDetail === null
    && record.styled?.rejectedTextures?.length === 0
    && record.errors?.length === 0
  )),
  (webGpuSixViewManifest.records ?? []).map((record) => ({
    view: record.view,
    retainedSourceTextures: record.styled?.retainedSourceTextures,
    geometryDetail: record.styled?.geometryDetail,
    rejectedTextures: record.styled?.rejectedTextures,
    errors: record.errors,
  })));
check('webgpu-six-view-style-document-identical',
  JSON.stringify(canonicalize(webGpuSixViewManifest.style))
    === JSON.stringify(canonicalize(styledCaptures[0]?.report?.style)),
  {
    webgpu: webGpuSixViewManifest.style,
    webgl2: styledCaptures[0]?.report?.style,
  });

check('semantic-region-four-lod-glbs-passed',
  regionVerification.passed === true && regionVerification.structural?.length === 4,
  regionVerificationFile);
check('semantic-region-original-binary-prefix-preserved',
  regionVerification.structural?.every((record) => (
    record.preservedBinaryBytes > 0
    && record.semanticBytes > 0
    && record.vertices > 0
  )),
  regionVerification.structural);
check('semantic-region-runtime-fail-closed-and-restorable',
  regionVerification.runtime?.failClosedCases >= 9
    && regionVerification.runtime?.immutableCompilerProfileValidated === true
    && regionVerification.runtime?.adversarialCases?.includes('all-shaft-one-neck')
    && regionVerification.runtime?.adversarialCases?.includes('tampered-byte')
    && regionVerification.runtime?.exactRestore === true
    && regionVerification.runtime?.sourceGeometryUnchanged === true
    && regionVerification.runtime?.sourceRegionAttributeUnchanged === true,
  regionVerification.runtime);
check('semantic-region-gltf-stored-component-bounds',
  regionVerification.standards?.accessorBoundsMatchStoredComponentValues === true
    && regionVerification.standards?.normalizedBoundsUseStoredIntegerDomain === true,
  regionVerification.standards);
check('semantic-region-capture-manifest-passed',
  regionCaptureManifest.passed === true
    && regionCaptureManifest.regionMode === true
    && regionCaptureManifest.captures?.length === 18,
  regionCaptureManifestFile);
check('semantic-region-six-view-consumed-with-source-pbr',
  regionStyledCaptures.every((capture) => (
      capture.report?.semanticMaskStatus?.passed === true
      && capture.report?.styleReport?.rockRegions?.totalVertices === 134_981
      && capture.report?.styleReport?.retainedSourceTextures === 3
      && capture.report?.styleReport?.geometryDetail === null
      && capture.report?.styleReport?.rejectedTextures?.length === 0
    )),
  regionStyledCaptures.map((capture) => ({ view: capture.view, report: capture.report?.styleReport })));
check('semantic-production-webgl-style-document-identical',
  Boolean(presentedStyle)
    && productionWebGlStyledCaptures.length === 6
    && productionWebGlStyledCaptures.every((capture) => (
      hashCanonicalJson(capture.report?.style) === hashCanonicalJson(presentedStyle)
    )),
  {
    semanticStyleSha256: presentedStyle ? hashCanonicalJson(presentedStyle) : null,
    productionWebglStyleSha256: productionWebGlStyledCaptures.map((capture) => ({
      view: capture.view,
      sha256: hashCanonicalJson(capture.report?.style),
    })),
  });
check('semantic-region-neutral-parent-pixel-identical',
  ['front', 'rear', 'left', 'right', 'top', 'bottom'].every((view) => {
    const parent = captureManifest.captures.find((capture) => capture.mode === 'neutral' && capture.view === view);
    const enriched = regionCaptureManifest.captures.find((capture) => capture.mode === 'neutral' && capture.view === view);
    return parent?.sha256 && parent.sha256 === enriched?.sha256 && parent.bytes === enriched.bytes;
  }),
  ['front', 'rear', 'left', 'right', 'top', 'bottom'].map((view) => ({
    view,
    parent: captureManifest.captures.find((capture) => capture.mode === 'neutral' && capture.view === view)?.sha256,
    enriched: regionCaptureManifest.captures.find((capture) => capture.mode === 'neutral' && capture.view === view)?.sha256,
  })));

const comparisonOutput = comparisonAudit.output?.file;
const comparisonHash = comparisonOutput ? await hashFile(comparisonOutput) : null;
check('comparison-board-hash-current',
  Boolean(comparisonHash) && comparisonHash.sha256 === comparisonAudit.output?.sha256,
  { file: comparisonOutput, expected: comparisonAudit.output?.sha256, actual: comparisonHash?.sha256 });
for (const input of comparisonAudit.inputs ?? []) {
  const current = await hashFile(input.file);
  check(`comparison-input-current:${input.state}:${input.view}`, current.sha256 === input.sha256, {
    file: input.file,
    expected: input.sha256,
    actual: current.sha256,
  });
}
const regionComparisonOutput = regionComparisonAudit.output?.file;
const regionComparisonHash = regionComparisonOutput ? await hashFile(regionComparisonOutput) : null;
check('semantic-region-comparison-board-hash-current',
  Boolean(regionComparisonHash) && regionComparisonHash.sha256 === regionComparisonAudit.output?.sha256,
  { file: regionComparisonOutput, expected: regionComparisonAudit.output?.sha256, actual: regionComparisonHash?.sha256 });
for (const input of regionComparisonAudit.inputs ?? []) {
  const current = await hashFile(input.file);
  check(`semantic-region-comparison-input-current:${input.state}:${input.view}`, current.sha256 === input.sha256, {
    file: input.file,
    expected: input.sha256,
    actual: current.sha256,
  });
}

check('production-scene-webgpu-six-view-passed',
  productionWebGpuManifest.passed === true
    && productionWebGpuManifest.renderer === 'webgpu'
    && productionWebGpuManifest.records?.length === 6,
  productionWebGpuManifestFile);
check('production-scene-webgpu-record-backends-explicit',
  productionWebGpuManifest.records?.length === 6
    && productionWebGpuManifest.records.every((record) => record.backend === 'webgpu'),
  productionWebGpuManifest.records?.map((record) => ({ view: record.view, backend: record.backend })));
check('production-scene-webgpu-two-run-stability',
  productionWebGpuManifest.validationRunCount === 2
    && productionWebGpuManifest.settledFrameCount >= 48
    && productionWebGpuManifest.stabilityRuns?.length === 2
    && productionWebGpuManifest.stabilityRuns.every((run) => (
      run.passed === true
      && run.records?.length === 6
      && run.records.every((record) => (
        record.backend === 'webgpu'
        && record.exactRestorePng === true
        && record.neutral?.sha256 === record.restored?.sha256
      ))
      && run.pageErrors?.length === 0
      && run.consoleErrors?.length === 0
      && run.failedResponses?.length === 0
    )),
  productionWebGpuManifest.stabilityRuns?.map((run) => ({
    run: run.run,
    passed: run.passed,
    records: run.records?.length,
    exactRestoreViews: run.records?.filter((record) => record.exactRestorePng).length,
    pageErrors: run.pageErrors,
    consoleErrors: run.consoleErrors,
    failedResponses: run.failedResponses,
  })));
check('production-scene-webgpu-image-hashes-current',
  productionWebGpuImageBindings.length === 36
    && productionWebGpuImageBindings.every((record) => record.passed),
  productionWebGpuImageBindings.filter((record) => !record.passed));
check('production-scene-webgpu-style-source-and-error-provenance',
  productionWebGpuEvidenceComplete
    && productionWebGpuSourceBindingsCurrent
    && productionWebGpuManifest.pageErrors.length === 0
    && productionWebGpuManifest.consoleErrors.length === 0
    && productionWebGpuManifest.failedResponses.length === 0
    && hashCanonicalJson(productionWebGpuManifest.style) === hashCanonicalJson(presentedStyle)
    && productionWebGpuManifest.sourceEvidence.semanticGlb.sha256
      === regionVerification.structural?.[0]?.outputSha256,
  {
    evidenceComplete: productionWebGpuEvidenceComplete,
    sourceBindingsCurrent: productionWebGpuSourceBindingsCurrent,
    styleSha256: productionWebGpuManifest.style
      ? hashCanonicalJson(productionWebGpuManifest.style) : null,
    expectedStyleSha256: presentedStyle ? hashCanonicalJson(presentedStyle) : null,
    sourceEvidence: productionWebGpuManifest.sourceEvidence ?? null,
    pageErrors: productionWebGpuManifest.pageErrors ?? null,
    consoleErrors: productionWebGpuManifest.consoleErrors ?? null,
    failedResponses: productionWebGpuManifest.failedResponses ?? null,
  });
check('production-scene-webgl2-six-view-passed',
  productionWebGlManifest.passed === true
    && productionWebGlManifest.requiredBackend === 'webgl2-fallback'
    && productionWebGlManifest.captures?.length === 18
    && productionWebGlManifest.stateChecks?.length === 6
    && productionWebGlManifest.stateChecks.every((record) => (
      record.sceneLookEqual === true && record.exactRestorePng === true
    )),
  productionWebGlManifestFile);
check('production-scene-frozen-look-exact-restore',
  productionWebGpuManifest.records?.every((record) => (
    record.exactRestorePng === true
    && record.sceneLookEqual === true
    && record.neutral?.sha256 === record.restored?.sha256
    && record.restored?.report?.cycles === 20
    && record.restored?.report?.restored === 20
    && record.restored?.report?.secondRestoreCount === 0
    && record.restored?.report?.identity?.passed === true
  )),
  productionWebGpuManifest.records?.map((record) => ({
    view: record.view,
    exactRestorePng: record.exactRestorePng,
    sceneLookEqual: record.sceneLookEqual,
    restore: record.restored?.report,
  })));
check('production-scene-shared-system-targets-only',
  productionWebGpuManifest.records?.every((record) => (
    JSON.stringify(record.application?.systemTargetIds) === JSON.stringify(['toonlab:lighting', 'toonlab:post', 'toonlab:sky'])
    && JSON.stringify(record.application?.objectTargetIds) === JSON.stringify(['c11/ground'])
    && record.application?.hoodooWasSceneStyleTarget === false
  )),
  productionWebGpuManifest.records?.map((record) => ({ view: record.view, application: record.application })));
check('production-scene-cloud-and-shadow-contract',
  productionWebGpuManifest.records?.every((record) => (
    record.diagnostics?.cloudShadows?.enabled === true
    && record.diagnostics?.cloudShadows?.ready === true
    && record.diagnostics?.cloudShadows?.mapName === 'ToonLabCloudShadowMap'
    && record.diagnostics?.cloudShadows?.source === 'sky-system-volumetric-transmittance'
    && record.shadowPass?.health?.ok === true
    && record.shadowPass?.casterCoverage?.coveredTargetIds?.includes('c11/hoodoo')
    && (['top', 'bottom'].includes(record.view)
      || record.shadowPass?.receiverCoverage?.coveredTargetIds?.includes('c11/ground'))
  )),
  productionWebGpuManifest.records?.map((record) => ({
    view: record.view,
    cloudShadows: record.diagnostics?.cloudShadows,
    shadowHealth: record.shadowPass?.health,
  })));
check('production-scene-region-style-retains-source-pbr',
  productionWebGpuManifest.records?.every((record) => (
    record.styled?.report?.retainedSourceTextures === 3
    && record.styled?.report?.rockRegions?.totalVertices === 134_981
    && record.styled?.report?.geometryDetail === null
    && record.styled?.report?.rejectedTextures?.length === 0
  )),
  productionWebGpuManifest.records?.map((record) => ({ view: record.view, style: record.styled?.report })));
const productionComparisonOutput = productionComparisonAudit.output?.file;
const productionComparisonHash = productionComparisonOutput ? await hashFile(productionComparisonOutput) : null;
check('production-scene-comparison-board-hash-current',
  Boolean(productionComparisonHash)
    && productionComparisonHash.sha256 === productionComparisonAudit.output?.sha256,
  {
    file: productionComparisonOutput,
    expected: productionComparisonAudit.output?.sha256,
    actual: productionComparisonHash?.sha256,
  });

const representativeTechnicalPassed = checks.every((record) => record.passed);
const blockers = [
  ...(!productionWebGpuEvidenceComplete || !productionWebGpuSourceBindingsCurrent ? [{
    id: 'production-webgpu-evidence-provenance',
    reason: 'The headed WebGPU matrix does not contain a current exact region-enabled style document, immutable semantic/source hashes, or complete page/console/HTTP error arrays. Recapture it before restoring the representative technical pass.',
  }] : []),
  ...(!developerVisualApproval ? [{
    id: 'developer-art-direction-approval',
    reason: 'The material style A/B requires explicit developer visual acceptance; automated checks cannot approve the ToonLab look.',
  }] : []),
  {
    id: 'full-catalog-input',
    reason: 'C8/C10 are incomplete, so neutral/stylized evidence for every family cannot exist yet.',
  },
];

const verification = {
  schema: 'toonlab/rock-geology-v2-c11-verification',
  version: 1,
  representativeTechnicalPassed,
  fullCheckpointApproved: false,
  technicalDecision: representativeTechnicalPassed
    ? 'representative reversible-stylization technical slice passed'
    : 'representative reversible-stylization technical slice failed',
  visualDecision: developerVisualApproval
    ? 'approved-as-mvp-v0.1-visual-benchmark'
    : 'await-developer-review',
  checks,
  blockers,
};
const status = {
  schema: 'toonlab/rock-geology-v2-checkpoint-status',
  version: 1,
  checkpoint: 11,
  state: representativeTechnicalPassed
    ? 'representative-c11-technical-slice-proven-full-checkpoint-open'
    : 'representative-proof-failed',
  approved: false,
  representativeVerticalSlice: true,
  representativeTechnicalPassed,
  developerVisualApproval,
  fullCatalogApproval: false,
  evidence: {
    verification: path.join(c11Root, 'verification.json'),
    comparisonBoard: comparisonOutput,
    webgl2Manifest: captureManifestFile,
    visibleWebgpuVerification: webGpuVerificationFile,
    visibleWebgpuSixViewManifest: webGpuSixViewManifestFile,
    semanticRegionVerification: regionVerificationFile,
    semanticRegionCaptureManifest: regionCaptureManifestFile,
    semanticRegionComparisonBoard: regionComparisonOutput,
    productionWebgpuManifest: productionWebGpuManifestFile,
    productionWebgl2Manifest: productionWebGlManifestFile,
    productionComparisonBoard: productionComparisonOutput,
    developerVisualDecision: developerVisualDecisionFile,
  },
  blockers,
};
const [
  regionCaptureManifestHash,
  regionComparisonBoardHash,
  productionWebGlManifestHash,
  productionComparisonBoardHash,
  productionWebGpuManifestHash,
  regionGlbHash,
  ...sourceEvidenceHashes
] = await Promise.all([
  hashFileRecord(regionCaptureManifestFile),
  hashFileRecord(regionComparisonOutput),
  hashFileRecord(productionWebGlManifestFile),
  hashFileRecord(productionComparisonOutput),
  hashFileRecord(productionWebGpuManifestFile),
  hashFileRecord(regionGlbFile),
  ...evidenceSourceFiles.map(hashFileRecord),
]);
const presentedStyleDocument = {
  schema: 'toonlab/rock-geology-v2-c11-presented-style',
  version: 2,
  style: presentedStyle,
  styleSha256: presentedStyle ? hashCanonicalJson(presentedStyle) : null,
  provenance: {
    semanticCaptureManifest: regionCaptureManifestHash,
    semanticComparisonBoard: regionComparisonBoardHash,
    productionWebglManifest: productionWebGlManifestHash,
    productionComparisonBoard: productionComparisonBoardHash,
    productionWebgpuManifest: productionWebGpuManifestHash,
    semanticGlb: regionGlbHash,
    sourceFiles: sourceEvidenceHashes,
  },
};

await Promise.all([
  writeFile(path.join(c11Root, 'verification.json'), `${JSON.stringify(verification, null, 2)}\n`),
  writeFile(path.join(c11Root, 'checkpoint-status.json'), `${JSON.stringify(status, null, 2)}\n`),
  writeFile(path.join(c11Root, 'presented-style-settings.json'), `${JSON.stringify(presentedStyleDocument, null, 2)}\n`),
  writeFile(path.join(c11Root, 'README.md'), `# Checkpoint 11 — hoodoo representative vertical slice\n\n`
    + `The reversible material-toggle proof is **${representativeTechnicalPassed ? 'technically passed' : 'failed'}**. `
    + 'This is not full Checkpoint 11 approval.\n\n'
    + '- Neutral source: untouched canonical 180k/4K GLB.\n'
    + '- Styled branch: real Call Me Sensei rock shader, source PBR retained, geometry detail disabled.\n'
    + '- Restore stress: 20 cycles on six WebGL2 views; material, texture, geometry-buffer, attribute, shadow, metadata, and PNG identity checked.\n'
    + `- Visible browser: ${productionWebGpuEvidenceComplete ? 'actual WebGPU provenance is complete' : 'the prior WebGPU pixels remain available, but a provenance-complete recapture is required'}.\n`
    + '- Semantic regions: four visual LOD GLBs carry immutable-profile base/shaft/neck/cap UNORM8 masks; stored UINT8 accessor bounds, original binary prefixes, and neutral pixels are checked independently.\n'
    + `- Khronos validator: ${regionVerification.standards?.khronosValidator?.available ? 'passed' : 'not installed locally; the standards fixture validates the accessor rule and the limitation remains recorded'}.\n`
    + '- Shared production scene: real WebGPU sun, probe, sky, cloud transmittance, shared shadow pass, ground shader, fog, and post are frozen across the six-view material A/B.\n'
    + `- Developer visual benchmark: ${developerVisualApproval ? 'approved for the hoodoo MVP benchmark' : 'awaiting review'}.\n`
    + '- Full approval remains open for the future full catalog and remaining runtime/device qualification.\n'),
]);

console.log(JSON.stringify({
  representativeTechnicalPassed,
  fullCheckpointApproved: false,
  checks: checks.length,
  blockers: blockers.map((blocker) => blocker.id),
  verification: path.join(c11Root, 'verification.json'),
}, null, 2));
if (!representativeTechnicalPassed) process.exitCode = 1;
