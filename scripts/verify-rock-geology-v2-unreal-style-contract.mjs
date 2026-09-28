import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const c11Root = path.join(
  repoRoot,
  'artifacts/research/rock-geology-v2/checkpoint-11-stylization/hoodoo-caprock',
);
const outputRoot = path.join(
  repoRoot,
  'artifacts/research/rock-geology-v2/checkpoint-12-unreal-engine-5-8/hoodoo-caprock/styled-material-contract',
);
const contractFile = path.join(outputRoot, 'contract.json');
const verificationFile = path.join(outputRoot, 'verification.json');
const contractOnly = process.argv.includes('--contract-only');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
};
const hashCanonicalJson = (value) => sha256(Buffer.from(JSON.stringify(canonicalize(value))));
const sameJson = (left, right) => JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
const hashFile = async (file) => {
  const bytes = await readFile(file);
  return { file, bytes: bytes.byteLength, sha256: sha256(bytes) };
};
const readOptionalJson = async (file) => {
  try {
    return { exists: true, document: await readJson(file) };
  } catch (error) {
    if (error?.code === 'ENOENT') return { exists: false, document: null };
    throw error;
  }
};

function parseGlb(bytes, file) {
  if (bytes.length < 20
    || bytes.readUInt32LE(0) !== 0x46546c67
    || bytes.readUInt32LE(4) !== 2
    || bytes.readUInt32LE(8) !== bytes.length) {
    throw new Error(`${file}: malformed GLB.`);
  }
  let offset = 12;
  let json = null;
  let binary = null;
  while (offset < bytes.length) {
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    const chunk = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8').trim());
    if (type === 0x004e4942) binary = chunk;
    offset += 8 + length;
  }
  if (!json || !binary) throw new Error(`${file}: JSON and BIN chunks are required.`);
  return { json, binary };
}

function textureImageHash(parsed, textureInfo) {
  const texture = parsed.json.textures?.[textureInfo?.index];
  const image = parsed.json.images?.[texture?.source];
  const view = parsed.json.bufferViews?.[image?.bufferView];
  if (!texture || !image || !view) return null;
  const start = view.byteOffset ?? 0;
  const bytes = parsed.binary.subarray(start, start + view.byteLength);
  return { bytes: bytes.byteLength, sha256: sha256(bytes) };
}

function regionAccessorHash(parsed) {
  const primitive = parsed.json.meshes?.[0]?.primitives?.[0];
  const accessorIndex = primitive?.attributes?._TL_ROCK_REGION;
  const accessor = parsed.json.accessors?.[accessorIndex];
  const view = parsed.json.bufferViews?.[accessor?.bufferView];
  if (!Number.isInteger(accessorIndex) || !accessor || !view) return null;
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const bytes = parsed.binary.subarray(start, start + accessor.count * 4);
  return {
    count: accessor.count,
    componentType: accessor.componentType,
    normalized: accessor.normalized,
    type: accessor.type,
    min: accessor.min,
    max: accessor.max,
    bytes: bytes.byteLength,
    bytesSha256: sha256(bytes),
  };
}

function srgbChannelToLinear(value) {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}
const linearColor = (value) => value.map(srgbChannelToLinear);

const contract = await readJson(contractFile);
const checks = [];
const check = (id, passed, evidence) => checks.push({ id, passed: Boolean(passed), evidence });

check('contract-schema-and-honest-unexecuted-status',
  contract.schema === 'toonlab/rock-geology-v2-c12-unreal-styled-material-contract'
    && contract.version === 1
    && contract.status?.contractPrepared === true
    && contract.status?.unrealMaterialAuthored === false
    && contract.status?.unrealMaterialCompiled === false
    && contract.status?.unrealCaptureQualified === false
    && contract.status?.fullStyledParityPassed === false,
  contract.status);

for (const [key, expected] of Object.entries({
  presentedStyleSettings: contract.inputs?.presentedStyleSettings,
  c11Verification: contract.inputs?.c11Verification,
  semanticRegionVerification: contract.inputs?.semanticRegionVerification,
  c12NeutralImportContract: contract.inputs?.c12NeutralImportContract,
})) {
  const current = expected?.file ? await hashFile(expected.file) : null;
  check(`input-current:${key}`,
    Boolean(current)
      && current.bytes === expected.bytes
      && current.sha256 === expected.sha256,
    { expected, current });
}

const [presentedStyle, c11Verification, regionVerification] = await Promise.all([
  readJson(contract.inputs.presentedStyleSettings.file),
  readJson(contract.inputs.c11Verification.file),
  readJson(contract.inputs.semanticRegionVerification.file),
]);
check('c11-representative-technical-source-passed',
  c11Verification.representativeTechnicalPassed === true
    && regionVerification.passed === true
    && regionVerification.structural?.length === 4,
  {
    representativeTechnicalPassed: c11Verification.representativeTechnicalPassed,
    regionPassed: regionVerification.passed,
    semanticGlbs: regionVerification.structural?.length,
  });
check('presented-style-hash-current',
  presentedStyle.styleSha256 === hashCanonicalJson(presentedStyle.style)
    && contract.inputs.styleSha256 === presentedStyle.styleSha256,
  {
    contract: contract.inputs.styleSha256,
    document: presentedStyle.styleSha256,
    current: hashCanonicalJson(presentedStyle.style),
  });

const semanticGlbs = contract.inputs?.semanticGlbs ?? [];
check('four-semantic-lods-bound',
  semanticGlbs.length === 4
    && sameJson(semanticGlbs.map((entry) => entry.lod), [0, 1, 2, 3])
    && sameJson(semanticGlbs.map((entry) => entry.inspection?.triangles), [180000, 60000, 20000, 6000])
    && semanticGlbs.every((entry) => entry.profile === 'hoodoo-caprock-normalized-height-v1'),
  semanticGlbs.map((entry) => ({
    lod: entry.lod,
    triangles: entry.inspection?.triangles,
    profile: entry.profile,
  })));

for (const entry of semanticGlbs) {
  const [glbBytes, currentGlb, currentAudit, currentParent] = await Promise.all([
    readFile(entry.glb.file),
    hashFile(entry.glb.file),
    hashFile(entry.audit.file),
    hashFile(entry.parentNeutralGlb.file),
  ]);
  const parsed = parseGlb(glbBytes, entry.glb.file);
  const material = parsed.json.materials?.[parsed.json.meshes?.[0]?.primitives?.[0]?.material ?? 0];
  const pbr = material?.pbrMetallicRoughness ?? {};
  const currentTextures = {
    baseColor: textureImageHash(parsed, pbr.baseColorTexture),
    normal: textureImageHash(parsed, material?.normalTexture),
    orm: textureImageHash(parsed, pbr.metallicRoughnessTexture),
  };
  const currentRegion = regionAccessorHash(parsed);
  check(`semantic-lod${entry.lod}-file-bindings-current`,
    currentGlb.bytes === entry.glb.bytes
      && currentGlb.sha256 === entry.glb.sha256
      && currentAudit.bytes === entry.audit.bytes
      && currentAudit.sha256 === entry.audit.sha256
      && currentParent.bytes === entry.parentNeutralGlb.bytes
      && currentParent.sha256 === entry.parentNeutralGlb.sha256,
    { currentGlb, currentAudit, currentParent });
  check(`semantic-lod${entry.lod}-neutral-texture-hashes-current`,
    ['baseColor', 'normal', 'orm'].every((role) => (
      currentTextures[role]?.bytes === entry.inspection.textures[role].bytes
      && currentTextures[role]?.sha256 === entry.inspection.textures[role].sha256
    )),
    { expected: entry.inspection.textures, current: currentTextures });
  check(`semantic-lod${entry.lod}-region-accessor-current`,
    currentRegion?.componentType === 5121
      && currentRegion.normalized === true
      && currentRegion.type === 'VEC4'
      && sameJson(currentRegion.min, [0, 0, 0, 0])
      && sameJson(currentRegion.max, [255, 255, 255, 255])
      && currentRegion.count === entry.inspection.regionAccessor.count
      && currentRegion.bytes === entry.inspection.regionAccessor.bytes
      && currentRegion.bytesSha256 === entry.inspection.regionAccessor.bytesSha256,
    { expected: entry.inspection.regionAccessor, current: currentRegion });
}

check('base-normal-orm-ue-channel-contract',
  contract.textureAndChannelContract?.baseColor?.sRGB === true
    && contract.textureAndChannelContract?.normal?.sRGB === false
    && contract.textureAndChannelContract?.normal?.flipGreenChannelOnImport === true
    && contract.textureAndChannelContract?.orm?.sRGB === false
    && sameJson(contract.textureAndChannelContract?.orm?.channels, {
      r: 'Ambient Occlusion',
      g: 'Roughness',
      b: 'Metallic',
      a: 'unused',
    }),
  contract.textureAndChannelContract);
const requiredParameters = [
  'TL_SourceBaseColor', 'TL_SourceNormal', 'TL_SourceORM', 'TL_StyleWeight',
  'TL_SourceAlbedoStrength', 'TL_SourceNormalStrength', 'TL_SourceAOStrength',
  'TL_RegionTintStrength', 'TL_RegionNeckOverlayStrength', 'TL_RegionBaseTintLinear',
  'TL_RegionShaftTintLinear', 'TL_RegionNeckTintLinear', 'TL_RegionCapTintLinear',
  'TL_Saturation', 'TL_Contrast', 'TL_Brightness', 'TL_GlobalTintLinear',
  'TL_StylizedMetallic', 'TL_StylizedSmoothness', 'TL_MobileFallback',
];
check('ue-parameter-definitions-complete',
  sameJson(contract.ueParameterDefinitions?.map((entry) => entry.name), requiredParameters)
    && contract.ueParameterDefinitions.every((entry) => entry.ueType && entry.group),
  contract.ueParameterDefinitions);

const bridge = contract.semanticRegionImportBridge;
check('semantic-import-bridge-fail-closed',
  bridge?.required === true
    && bridge.sourceAttribute === '_TL_ROCK_REGION'
    && bridge.stagingAttribute === 'COLOR_0'
    && sameJson(bridge.swizzle, {
      r: 'base',
      g: 'shaft',
      b: 'neck overlay',
      a: 'cap',
    })
    && bridge.procedure?.some((step) => step.includes('Fail if COLOR_0 already exists'))
    && sameJson(bridge.failClosedRequirements?.channelMinUnorm8, [0, 0, 0, 0])
    && sameJson(bridge.failClosedRequirements?.channelMaxUnorm8, [255, 255, 255, 255]),
  bridge);

const style = presentedStyle.style;
const ai = style.assetIntegration;
const expectedRegionColors = {
  base: linearColor(ai.regionBaseTint),
  shaft: linearColor(ai.regionShaftTint),
  neck: linearColor(ai.regionNeckTint),
  cap: linearColor(ai.regionCapTint),
};
const neutral = contract.parameterSets?.neutralIdentity;
const styled = contract.parameterSets?.c11PresentedStyle;
check('neutral-identity-parameter-set',
  neutral?.TL_StyleWeight === 0
    && neutral?.TL_SourceAlbedoStrength === 1
    && neutral?.TL_SourceNormalStrength === 1
    && neutral?.TL_SourceAOStrength === 1
    && neutral?.TL_RegionTintStrength === 0
    && neutral?.TL_RegionNeckOverlayStrength === 0
    && neutral?.TL_Saturation === 1
    && neutral?.TL_Contrast === 1
    && neutral?.TL_Brightness === 0
    && sameJson(neutral?.TL_GlobalTintLinear, [1, 1, 1])
    && neutral?.TL_MobileFallback === false,
  neutral);
check('styled-parameter-set-derived-exactly',
  styled?.TL_StyleWeight === 1
    && styled?.TL_SourceAlbedoStrength === ai.sourceAlbedoStrength
    && styled?.TL_SourceNormalStrength === ai.sourceNormalStrength
    && styled?.TL_SourceAOStrength === ai.sourceAoStrength
    && styled?.TL_RegionTintStrength === ai.regionTintStrength
    && styled?.TL_RegionNeckOverlayStrength === ai.regionNeckOverlayStrength
    && styled?.TL_Saturation === style.projection.saturation
    && styled?.TL_Contrast === style.projection.contrast
    && styled?.TL_Brightness === style.projection.brightness
    && styled?.TL_StylizedMetallic === style.material.metallic
    && styled?.TL_StylizedSmoothness === style.material.smoothness
    && sameJson(styled?.TL_GlobalTintLinear, linearColor(style.material.tint))
    && ['base', 'shaft', 'neck', 'cap'].every((region) => (
      sameJson(styled[`TL_Region${region[0].toUpperCase()}${region.slice(1)}TintLinear`], expectedRegionColors[region])
    )),
  styled);
check('reversible-output-rules-cover-all-pbr-outputs',
  contract.reversibleOutputRules?.styleControl === 'TL_StyleWeight'
    && contract.reversibleOutputRules?.neutralValue === 0
    && contract.reversibleOutputRules?.styledValue === 1
    && ['baseColor', 'normal', 'ambientOcclusion', 'roughness', 'metallic', 'specular']
      .every((key) => typeof contract.reversibleOutputRules?.[key] === 'string')
    && contract.reversibleOutputRules?.restoreRequirement?.includes('identical parameter bytes'),
  contract.reversibleOutputRules);
check('portable-pbr-math-keeps-neutral-explicit',
  contract.colorMath?.fullC11BaseColorFormula?.includes('TL_SourceAlbedoStrength')
    && contract.colorMath?.portableSubsetPolicy?.includes('not full C11 parity')
    && contract.pbrMath?.neutral?.normal?.includes('green-channel flip')
    && contract.pbrMath?.neutral?.roughness?.includes('TL_SourceORM.g')
    && contract.pbrMath?.neutral?.metallic?.includes('TL_SourceORM.b')
    && contract.pbrMath?.portableStyled?.smoothness?.includes('TL_SourceAlbedoStrength')
    && contract.pbrMath?.finalOutput?.includes('TL_StyleWeight'),
  { colorMath: contract.colorMath, pbrMath: contract.pbrMath });

check('sun-cloud-probe-owned-by-scene',
  contract.sceneLightingContract?.ownership === 'scene systems, not baked into Base/Normal/ORM'
    && contract.sceneLightingContract?.sun?.ueInput?.includes('Directional Light')
    && contract.sceneLightingContract?.cloudShadow?.ueInput?.includes('Volumetric Cloud')
    && contract.sceneLightingContract?.cloudShadow?.materialOverride?.includes('none')
    && contract.sceneLightingContract?.skyAndProbe?.ueInput?.includes('Sky Light')
    && contract.sceneLightingContract?.exposure?.ueRule?.includes('Lock auto exposure'),
  contract.sceneLightingContract);

check('mobile-fallback-preserves-semantic-pbr-subset',
  contract.mobileFallback?.semanticSourceLods?.length === 3
    && sameJson(
      contract.mobileFallback?.semanticSourceLods?.map((entry) => entry.triangles),
      [60000, 20000, 6000],
    )
    && contract.parameterSets?.mobileFallback?.TL_SourceAlbedoStrength === 1
    && contract.mobileFallback?.twoSided === false
    && contract.mobileFallback?.retainedFeatures?.includes('RGBA geological region tint')
    && contract.mobileFallback?.disabledFeatures?.includes('TSL macro triplanar projection')
    && contract.mobileFallback?.currentC12MobileInputLimitation?.includes('neutral-only'),
  contract.mobileFallback);

const requiredUnsupported = [
  'tsl-generated-macro-rock-texture',
  'tsl-triplanar-projection-and-near-detail',
  'tsl-normal-composition',
  'tsl-top-mask-smoothness',
  'toonlab-custom-brdf-and-scene-post',
];
check('tsl-only-features-explicitly-unsupported',
  sameJson(contract.unsupportedUntilPortedOrBaked?.map((entry) => entry.id), requiredUnsupported)
    && contract.unsupportedUntilPortedOrBaked.every((entry) => entry.reason && entry.consequence),
  contract.unsupportedUntilPortedOrBaked);
check('c11-c12-two-sided-conflict-disclosed',
  contract.textureAndChannelContract?.neutralMaterialFactors?.doubleSided === true
    && contract.unrealTargets?.desktopTwoSided === true
    && contract.unrealTargets?.existingNeutralC12Conflict?.includes('twoSided=false')
    && contract.mobileFallback?.twoSided === false
    && contract.mobileFallback?.twoSidedQualification?.includes('C11 source declares doubleSided=true'),
  {
    neutralMaterial: contract.textureAndChannelContract?.neutralMaterialFactors,
    mobile: contract.mobileFallback?.twoSidedQualification,
  });

const contractHash = await hashFile(contractFile);
const materialEvidenceFile = contract.expectedExecutionEvidence?.materialReport;
const captureEvidenceFile = contract.expectedExecutionEvidence?.captureManifest;
const [materialEvidence, captureEvidence] = await Promise.all([
  readOptionalJson(materialEvidenceFile),
  readOptionalJson(captureEvidenceFile),
]);
const materialEvidencePassed = materialEvidence.exists
  && materialEvidence.document?.schema === 'toonlab/rock-geology-v2-c12-unreal-styled-material-report'
  && materialEvidence.document?.version === 1
  && materialEvidence.document?.engineVersion === '5.8'
  && materialEvidence.document?.contractSha256 === contractHash.sha256
  && materialEvidence.document?.compiled === true
  && materialEvidence.document?.compileErrors?.length === 0
  && materialEvidence.document?.semanticReadback?.length === 4
  && semanticGlbs.every((entry) => materialEvidence.document.semanticReadback.some((readback) => (
    readback.lod === entry.lod
    && readback.vertexCount === entry.inspection.regionAccessor.count
    && readback.rgbaBytesSha256 === entry.inspection.regionAccessor.bytesSha256
  )));
const captureRecords = captureEvidence.document?.captures ?? [];
const captureEvidencePassed = captureEvidence.exists
  && captureEvidence.document?.schema === 'toonlab/rock-geology-v2-c12-unreal-styled-capture-manifest'
  && captureEvidence.document?.version === 1
  && captureEvidence.document?.engineVersion === '5.8'
  && captureEvidence.document?.contractSha256 === contractHash.sha256
  && captureEvidence.document?.styleSha256 === contract.inputs.styleSha256
  && captureEvidence.document?.passed === true
  && captureEvidence.document?.developerArtDirectionApproved === true
  && captureRecords.length >= 18
  && ['neutral', 'styled', 'restored'].every((mode) => (
    ['front', 'rear', 'left', 'right', 'top', 'bottom'].every((view) => (
      captureRecords.some((record) => record.mode === mode && record.view === view)
    ))
  ))
  && captureEvidence.document?.restoreChecks?.every((record) => (
    record.parameterBytesEqual === true
    && record.assetIdentityEqual === true
    && record.exactFrozenPixelsEqual === true
  ));

const contractPreparedPassed = checks.every((record) => record.passed);
const fullStyledParityPassed = contractPreparedPassed
  && materialEvidencePassed
  && captureEvidencePassed;
const blockers = [
  ...(!materialEvidencePassed ? [{
    id: 'ue-styled-material-execution',
    reason: materialEvidence.exists
      ? 'The UE material execution report does not satisfy the hash, compile, or semantic readback contract.'
      : 'No UE 5.8 styled material execution report exists.',
    file: materialEvidenceFile,
  }] : []),
  ...(!captureEvidencePassed ? [{
    id: 'ue-styled-parity-captures',
    reason: captureEvidence.exists
      ? 'The UE capture manifest does not satisfy the six-view restore and developer-approval contract.'
      : 'No UE neutral/styled/restored parity capture manifest exists.',
    file: captureEvidenceFile,
  }] : []),
  ...(!contractPreparedPassed ? [{
    id: 'style-contract-integrity',
    reason: 'One or more source, semantic, texture, parameter, or handoff checks failed.',
  }] : []),
];

const verification = {
  schema: 'toonlab/rock-geology-v2-c12-unreal-styled-material-contract-verification',
  version: 1,
  generatedAt: new Date().toISOString(),
  contract: contractHash,
  contractPreparedPassed,
  materialEvidencePassed,
  captureEvidencePassed,
  fullStyledParityPassed,
  passed: fullStyledParityPassed,
  expectedIncomplete: contractPreparedPassed && !fullStyledParityPassed,
  checks,
  executionEvidence: {
    material: { file: materialEvidenceFile, exists: materialEvidence.exists },
    captures: { file: captureEvidenceFile, exists: captureEvidence.exists },
  },
  blockers,
};
await writeFile(verificationFile, `${JSON.stringify(verification, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({
  contractPreparedPassed,
  checks: checks.length,
  failedChecks: checks.filter((record) => !record.passed).map((record) => record.id),
  fullStyledParityPassed,
  blockers: blockers.map((blocker) => blocker.id),
  mode: contractOnly ? 'contract-only' : 'full-styled-parity',
  verification: verificationFile,
}, null, 2)}\n`);

if (contractOnly) {
  if (!contractPreparedPassed) process.exitCode = 1;
} else if (!fullStyledParityPassed) {
  process.exitCode = 1;
}
