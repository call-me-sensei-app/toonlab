import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const c11Root = path.join(
  repoRoot,
  'artifacts/research/rock-geology-v2/checkpoint-11-stylization/hoodoo-caprock',
);
const c12Root = path.join(
  repoRoot,
  'artifacts/research/rock-geology-v2/checkpoint-12-unreal-engine-5-8/hoodoo-caprock',
);
const outputRoot = path.join(c12Root, 'styled-material-contract');
const contractFile = path.join(outputRoot, 'contract.json');
const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
};
const hashCanonicalJson = (value) => sha256(Buffer.from(JSON.stringify(canonicalize(value))));
const hashFile = async (file) => {
  const bytes = await readFile(file);
  return {
    file,
    repoRelativeFile: path.relative(repoRoot, file),
    bytes: bytes.byteLength,
    sha256: sha256(bytes),
  };
};

function parseGlb(bytes, file) {
  if (bytes.length < 20 || bytes.readUInt32LE(0) !== 0x46546c67) {
    throw new Error(`${file}: invalid GLB magic.`);
  }
  if (bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) {
    throw new Error(`${file}: invalid GLB version or declared length.`);
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
  if (!json || !binary) throw new Error(`${file}: embedded JSON and BIN chunks are required.`);
  return { json, binary };
}

function pngDimensions(bytes, label) {
  const signature = '89504e470d0a1a0a';
  if (bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== signature) {
    throw new Error(`${label}: expected an embedded PNG image.`);
  }
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

function imageForTexture(parsed, textureInfo, role, file) {
  if (!Number.isInteger(textureInfo?.index)) throw new Error(`${file}: ${role} texture is missing.`);
  const texture = parsed.json.textures?.[textureInfo.index];
  const image = parsed.json.images?.[texture?.source];
  const bufferView = parsed.json.bufferViews?.[image?.bufferView];
  if (!texture || !image || !bufferView || (bufferView.buffer ?? 0) !== 0) {
    throw new Error(`${file}: ${role} must use an embedded image buffer view.`);
  }
  const start = bufferView.byteOffset ?? 0;
  const bytes = parsed.binary.subarray(start, start + bufferView.byteLength);
  const sampler = parsed.json.samplers?.[texture.sampler] ?? {};
  return {
    role,
    textureIndex: textureInfo.index,
    imageIndex: texture.source,
    imageName: image.name ?? null,
    mimeType: image.mimeType ?? null,
    bytes: bytes.byteLength,
    sha256: sha256(bytes),
    dimensions: pngDimensions(bytes, `${file}:${role}`),
    texCoord: textureInfo.texCoord ?? 0,
    sampler: {
      magFilter: sampler.magFilter ?? 9729,
      minFilter: sampler.minFilter ?? 9987,
      wrapS: sampler.wrapS ?? 10497,
      wrapT: sampler.wrapT ?? 10497,
    },
  };
}

function inspectSemanticGlb(bytes, file, audit) {
  const parsed = parseGlb(bytes, file);
  const primitive = parsed.json.meshes?.[0]?.primitives?.[0];
  const material = parsed.json.materials?.[primitive?.material ?? 0];
  if (!primitive || !material) throw new Error(`${file}: one material-bearing primitive is required.`);
  const indexAccessor = parsed.json.accessors?.[primitive.indices];
  if (!indexAccessor || (primitive.mode ?? 4) !== 4 || indexAccessor.count % 3 !== 0) {
    throw new Error(`${file}: an indexed triangle primitive is required.`);
  }
  const regionAccessorIndex = primitive.attributes?._TL_ROCK_REGION;
  const regionAccessor = parsed.json.accessors?.[regionAccessorIndex];
  if (!Number.isInteger(regionAccessorIndex)
    || regionAccessor?.componentType !== 5121
    || regionAccessor?.normalized !== true
    || regionAccessor?.type !== 'VEC4') {
    throw new Error(`${file}: valid normalized UINT8 _TL_ROCK_REGION VEC4 is required.`);
  }
  const regionBufferView = parsed.json.bufferViews?.[regionAccessor.bufferView];
  const regionByteOffset = (regionBufferView?.byteOffset ?? 0) + (regionAccessor.byteOffset ?? 0);
  const regionByteLength = regionAccessor.count * 4;
  if (!regionBufferView
    || (regionBufferView.buffer ?? 0) !== 0
    || regionByteOffset + regionByteLength > parsed.binary.length) {
    throw new Error(`${file}: region accessor bytes are outside the embedded BIN chunk.`);
  }
  const regionBytes = parsed.binary.subarray(
    regionByteOffset,
    regionByteOffset + regionByteLength,
  );
  const pbr = material.pbrMetallicRoughness ?? {};
  const baseColor = imageForTexture(parsed, pbr.baseColorTexture, 'baseColor', file);
  const normal = imageForTexture(parsed, material.normalTexture, 'normal', file);
  const orm = imageForTexture(parsed, pbr.metallicRoughnessTexture, 'orm', file);
  const occlusionTextureIndex = material.occlusionTexture?.index;
  if (occlusionTextureIndex !== pbr.metallicRoughnessTexture?.index) {
    throw new Error(`${file}: AO and metallic/roughness must share the admitted ORM texture.`);
  }
  const extras = parsed.json.asset?.extras ?? {};
  if (extras.toonlabRockRegionProfile !== audit.profile
    || extras.toonlabRockRegionParentGlbSha256 !== audit.input.sha256) {
    throw new Error(`${file}: compiler profile/parent binding differs from its audit.`);
  }
  return {
    generator: parsed.json.asset?.generator ?? null,
    meshCount: parsed.json.meshes?.length ?? 0,
    primitiveCount: parsed.json.meshes?.reduce(
      (sum, mesh) => sum + (mesh.primitives?.length ?? 0),
      0,
    ) ?? 0,
    triangles: indexAccessor.count / 3,
    material: {
      name: material.name ?? null,
      toonlabMaterialId: material.extras?.toonlabMaterialId ?? null,
      alphaMode: material.alphaMode ?? 'OPAQUE',
      alphaCutoff: material.alphaCutoff ?? 0.5,
      doubleSided: material.doubleSided === true,
      baseColorFactor: pbr.baseColorFactor ?? [1, 1, 1, 1],
      metallicFactor: pbr.metallicFactor ?? 1,
      roughnessFactor: pbr.roughnessFactor ?? 1,
      normalScale: material.normalTexture?.scale ?? 1,
      occlusionStrength: material.occlusionTexture?.strength ?? 1,
      specularFactor: material.extensions?.KHR_materials_specular?.specularFactor ?? 1,
    },
    textures: { baseColor, normal, orm },
    regionAccessor: {
      accessorIndex: regionAccessorIndex,
      count: regionAccessor.count,
      componentType: 'UNSIGNED_BYTE',
      normalized: true,
      type: 'VEC4',
      bytes: regionBytes.byteLength,
      bytesSha256: sha256(regionBytes),
      minStoredUnorm8: regionAccessor.min,
      maxStoredUnorm8: regionAccessor.max,
    },
  };
}

function srgbChannelToLinear(value) {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}
const linearColor = (value) => value.map(srgbChannelToLinear);

const presentedStyleFile = path.join(c11Root, 'presented-style-settings.json');
const c11VerificationFile = path.join(c11Root, 'verification.json');
const regionVerificationFile = path.join(c11Root, 'semantic-regions/verification.json');
const c12ImportContractFile = path.join(c12Root, 'import-contract.json');
const [presentedStyle, c11Verification, regionVerification, c12ImportContract] = await Promise.all([
  readJson(presentedStyleFile),
  readJson(c11VerificationFile),
  readJson(regionVerificationFile),
  readJson(c12ImportContractFile),
]);

if (c11Verification.representativeTechnicalPassed !== true) {
  throw new Error('Current C11 representative technical verification must pass before C12 handoff.');
}
if (regionVerification.passed !== true || regionVerification.structural?.length !== 4) {
  throw new Error('Current C11 semantic-region verification must pass all four visual LOD GLBs.');
}
if (presentedStyle.styleSha256 !== hashCanonicalJson(presentedStyle.style)) {
  throw new Error('C11 presented style hash is stale.');
}

const semanticGlbs = [];
for (const structural of regionVerification.structural) {
  const glbFile = structural.output;
  const auditFile = glbFile.replace(/\.glb$/u, '.audit.json');
  const [glbBytes, audit, glbHash, auditHash] = await Promise.all([
    readFile(glbFile),
    readJson(auditFile),
    hashFile(glbFile),
    hashFile(auditFile),
  ]);
  if (glbHash.sha256 !== structural.outputSha256
    || audit.output?.sha256 !== glbHash.sha256
    || audit.passed !== true) {
    throw new Error(`${glbFile}: semantic GLB/audit hash binding is stale.`);
  }
  semanticGlbs.push({
    role: path.basename(glbFile).match(/lod(\d)-([^.]*)-regions\.glb$/u)?.[2] ?? null,
    lod: Number(path.basename(glbFile).match(/lod(\d)/u)?.[1]),
    glb: glbHash,
    audit: auditHash,
    parentNeutralGlb: {
      file: audit.input.file ?? structural.input,
      bytes: audit.input.bytes,
      sha256: audit.input.sha256,
    },
    profile: audit.profile,
    binding: audit.binding,
    inspection: inspectSemanticGlb(glbBytes, glbFile, audit),
  });
}
semanticGlbs.sort((left, right) => left.lod - right.lod);

const style = presentedStyle.style;
const assetIntegration = style.assetIntegration;
const regionColors = {
  base: { serializedSrgb: assetIntegration.regionBaseTint, workingLinear: linearColor(assetIntegration.regionBaseTint) },
  shaft: { serializedSrgb: assetIntegration.regionShaftTint, workingLinear: linearColor(assetIntegration.regionShaftTint) },
  neck: { serializedSrgb: assetIntegration.regionNeckTint, workingLinear: linearColor(assetIntegration.regionNeckTint) },
  cap: { serializedSrgb: assetIntegration.regionCapTint, workingLinear: linearColor(assetIntegration.regionCapTint) },
};
const globalTint = {
  serializedSrgb: style.material.tint,
  workingLinear: linearColor(style.material.tint),
};

const neutralParameters = {
  TL_StyleWeight: 0,
  TL_SourceAlbedoStrength: 1,
  TL_SourceNormalStrength: 1,
  TL_SourceAOStrength: 1,
  TL_RegionTintStrength: 0,
  TL_RegionNeckOverlayStrength: 0,
  TL_Saturation: 1,
  TL_Contrast: 1,
  TL_Brightness: 0,
  TL_GlobalTintLinear: [1, 1, 1],
  TL_StylizedMetallic: 0,
  TL_StylizedSmoothness: 0,
  TL_MobileFallback: false,
};
const styledParameters = {
  TL_StyleWeight: 1,
  TL_SourceAlbedoStrength: assetIntegration.sourceAlbedoStrength,
  TL_SourceNormalStrength: assetIntegration.sourceNormalStrength,
  TL_SourceAOStrength: assetIntegration.sourceAoStrength,
  TL_RegionTintStrength: assetIntegration.regionTintStrength,
  TL_RegionNeckOverlayStrength: assetIntegration.regionNeckOverlayStrength,
  TL_Saturation: style.projection.saturation,
  TL_Contrast: style.projection.contrast,
  TL_Brightness: style.projection.brightness,
  TL_GlobalTintLinear: globalTint.workingLinear,
  TL_StylizedMetallic: style.material.metallic,
  TL_StylizedSmoothness: style.material.smoothness,
  TL_MobileFallback: false,
};

const contract = {
  schema: 'toonlab/rock-geology-v2-c12-unreal-styled-material-contract',
  version: 1,
  generatedAt: new Date().toISOString(),
  checkpoint: 12,
  assetId: c12ImportContract.assetId,
  sourceApprovalScope: 'c11-representative-technical-pass; developer art-direction approval still pending',
  status: {
    contractPrepared: true,
    unrealMaterialAuthored: false,
    unrealMaterialCompiled: false,
    unrealCaptureQualified: false,
    fullStyledParityPassed: false,
    claim: 'implementation-ready contract only; no UE styled material or parity capture is claimed',
  },
  inputs: {
    presentedStyleSettings: await hashFile(presentedStyleFile),
    c11Verification: await hashFile(c11VerificationFile),
    semanticRegionVerification: await hashFile(regionVerificationFile),
    c12NeutralImportContract: await hashFile(c12ImportContractFile),
    styleSha256: presentedStyle.styleSha256,
    semanticGlbs,
  },
  unrealTargets: {
    engineVersion: '5.8',
    contentRoot: '/Game/ToonLab/RockGeologyV2/C12/Hoodoo/Materials',
    masterMaterial: '/Game/ToonLab/RockGeologyV2/C12/Hoodoo/Materials/M_HoodooCaprock_Stylizable',
    neutralInstance: '/Game/ToonLab/RockGeologyV2/C12/Hoodoo/Materials/MI_HoodooCaprock_Neutral',
    styledInstance: '/Game/ToonLab/RockGeologyV2/C12/Hoodoo/Materials/MI_HoodooCaprock_Styled',
    mobileInstance: '/Game/ToonLab/RockGeologyV2/C12/Hoodoo/Materials/MI_HoodooCaprock_Styled_Mobile',
    materialDomain: 'Surface',
    blendMode: 'Opaque',
    shadingModel: 'Default Lit',
    desktopTwoSided: true,
    desktopTwoSidedReason: 'The admitted C11 neutral glTF material declares doubleSided=true; preserve it for exact desktop neutral identity until a qualified one-sided reimport supersedes it.',
    existingNeutralC12Conflict: 'The current neutral-only C12 import contract declares twoSided=false and therefore cannot by itself prove exact C11 material-state identity.',
  },
  ueParameterDefinitions: [
    { name: 'TL_SourceBaseColor', ueType: 'TextureSampleParameter2D', group: 'Source PBR', required: true },
    { name: 'TL_SourceNormal', ueType: 'TextureSampleParameter2D', group: 'Source PBR', required: true },
    { name: 'TL_SourceORM', ueType: 'TextureSampleParameter2D', group: 'Source PBR', required: true },
    { name: 'TL_StyleWeight', ueType: 'ScalarParameter', group: 'Reversible Style', min: 0, max: 1 },
    { name: 'TL_SourceAlbedoStrength', ueType: 'ScalarParameter', group: 'Reversible Style', min: 0, max: 1 },
    { name: 'TL_SourceNormalStrength', ueType: 'ScalarParameter', group: 'Source PBR', min: 0, max: 2 },
    { name: 'TL_SourceAOStrength', ueType: 'ScalarParameter', group: 'Source PBR', min: 0, max: 2 },
    { name: 'TL_RegionTintStrength', ueType: 'ScalarParameter', group: 'Geological Regions', min: 0, max: 1 },
    { name: 'TL_RegionNeckOverlayStrength', ueType: 'ScalarParameter', group: 'Geological Regions', min: 0, max: 1 },
    { name: 'TL_RegionBaseTintLinear', ueType: 'VectorParameter', group: 'Geological Regions' },
    { name: 'TL_RegionShaftTintLinear', ueType: 'VectorParameter', group: 'Geological Regions' },
    { name: 'TL_RegionNeckTintLinear', ueType: 'VectorParameter', group: 'Geological Regions' },
    { name: 'TL_RegionCapTintLinear', ueType: 'VectorParameter', group: 'Geological Regions' },
    { name: 'TL_Saturation', ueType: 'ScalarParameter', group: 'Color Grade', min: 0, max: 2 },
    { name: 'TL_Contrast', ueType: 'ScalarParameter', group: 'Color Grade', min: 0, max: 2 },
    { name: 'TL_Brightness', ueType: 'ScalarParameter', group: 'Color Grade', min: -1, max: 1 },
    { name: 'TL_GlobalTintLinear', ueType: 'VectorParameter', group: 'Color Grade' },
    { name: 'TL_StylizedMetallic', ueType: 'ScalarParameter', group: 'Surface', min: 0, max: 1 },
    { name: 'TL_StylizedSmoothness', ueType: 'ScalarParameter', group: 'Surface', min: 0, max: 1 },
    { name: 'TL_MobileFallback', ueType: 'StaticSwitchParameter', group: 'Platform' },
  ],
  semanticRegionImportBridge: {
    required: true,
    reason: 'UE Interchange does not currently have qualified support for the custom _TL_ROCK_REGION glTF attribute.',
    sourceAttribute: '_TL_ROCK_REGION',
    stagingAttribute: 'COLOR_0',
    encoding: 'normalized UINT8 VEC4',
    swizzle: {
      r: 'base',
      g: 'shaft',
      b: 'neck overlay',
      a: 'cap',
    },
    materialRead: 'VertexColor RGBA',
    procedure: [
      'Verify the semantic GLB and audit hashes before transformation.',
      'Fail if COLOR_0 already exists; never overwrite unrelated vertex color.',
      'In a staging GLB JSON chunk only, move the accessor reference from _TL_ROCK_REGION to COLOR_0.',
      'Preserve the accessor and BIN chunk byte-for-byte; remove only the custom attribute key.',
      'Import vertex colors with Replace, never Ignore or Override.',
      'Read back MeshDescription vertex-instance colors and prove all RGBA bytes and vertex counts match the source accessor.',
    ],
    failClosedRequirements: {
      profile: 'hoodoo-caprock-normalized-height-v1',
      accessorComponentType: 5121,
      normalized: true,
      accessorType: 'VEC4',
      channelMinUnorm8: [0, 0, 0, 0],
      channelMaxUnorm8: [255, 255, 255, 255],
      channelsRequiredNonzero: ['base', 'shaft', 'neck', 'cap'],
    },
  },
  textureAndChannelContract: {
    baseColor: {
      parameter: 'TL_SourceBaseColor',
      ueCompression: 'Default',
      sRGB: true,
      sample: 'TextureCoordinate0',
      output: 'Base Color',
    },
    normal: {
      parameter: 'TL_SourceNormal',
      sourceConvention: 'OpenGL +Y',
      ueCompression: 'Normalmap',
      sRGB: false,
      flipGreenChannelOnImport: true,
      sample: 'TextureCoordinate0',
      output: 'Normal',
    },
    orm: {
      parameter: 'TL_SourceORM',
      ueCompression: 'Masks',
      sRGB: false,
      sample: 'TextureCoordinate0',
      channels: {
        r: 'Ambient Occlusion',
        g: 'Roughness',
        b: 'Metallic',
        a: 'unused',
      },
    },
    neutralMaterialFactors: semanticGlbs[0].inspection.material,
    sourceLodTextureSets: semanticGlbs.map(({ lod, role, inspection }) => ({
      lod,
      role,
      textures: inspection.textures,
    })),
  },
  colorMath: {
    workingSpace: 'linear RGB',
    serializedColorSpace: 'sRGB inspector values; convert each channel with the IEC 61966-2-1 transfer function',
    saturationLuma: [0.2126729, 0.7151522, 0.072175],
    contrastMidpoint: 0.217637640824031,
    fullC11BaseColorFormula: 'graded input is lerp(TSL macro projection, source BaseColor, TL_SourceAlbedoStrength) before region tint and near-detail modulation',
    portableSubsetPolicy: 'Until the hash-bound macro input exists, substitute macro projection with source BaseColor; the mix collapses to source and is not full C11 parity.',
    portableBaseColorFormula: [
      'source = Sample(TL_SourceBaseColor, UV0).rgb',
      'graded = ((lerp(dot(source, saturationLuma), source, TL_Saturation) - contrastMidpoint) * TL_Contrast + contrastMidpoint + TL_Brightness) * TL_GlobalTintLinear',
      'primaryRegion = TL_RegionBaseTintLinear*VertexColor.r + TL_RegionShaftTintLinear*VertexColor.g + TL_RegionCapTintLinear*VertexColor.a',
      'region = lerp(primaryRegion, TL_RegionNeckTintLinear, VertexColor.b*TL_RegionNeckOverlayStrength)',
      'portableStyled = graded * lerp(1, region, TL_RegionTintStrength)',
      'BaseColor = lerp(source, portableStyled, TL_StyleWeight)',
    ],
    regionColors,
    globalTint,
  },
  pbrMath: {
    neutral: {
      normal: 'Decode TL_SourceNormal after UE import green-channel flip; use strength 1.',
      ambientOcclusion: 'saturate(lerp(1, TL_SourceORM.r, TL_SourceAOStrength))',
      roughness: 'saturate(TL_SourceORM.g * glTF roughnessFactor)',
      metallic: 'saturate(TL_SourceORM.b * glTF metallicFactor)',
      specular: 'saturate(glTF KHR_materials_specular.specularFactor * 0.5)',
    },
    portableStyled: {
      normal: 'Use source tangent normal at TL_SourceNormalStrength; full TSL normal composition is blocked.',
      ambientOcclusion: 'saturate(lerp(1, TL_SourceORM.r, TL_SourceAOStrength))',
      smoothness: 'lerp(TL_StylizedSmoothness, 1 - saturate(TL_SourceORM.g * glTF roughnessFactor), TL_SourceAlbedoStrength)',
      roughness: '1 - portableStyled.smoothness; TSL top-mask parity remains blocked',
      metallic: 'lerp(TL_StylizedMetallic, saturate(TL_SourceORM.b * glTF metallicFactor), TL_SourceAlbedoStrength)',
      specular: '0.5 for the portable styled dielectric branch',
    },
    finalOutput: 'For each PBR output, lerp(neutral, portableStyled, TL_StyleWeight).',
  },
  parameterSets: {
    neutralIdentity: neutralParameters,
    c11PresentedStyle: {
      ...styledParameters,
      TL_RegionBaseTintLinear: regionColors.base.workingLinear,
      TL_RegionShaftTintLinear: regionColors.shaft.workingLinear,
      TL_RegionNeckTintLinear: regionColors.neck.workingLinear,
      TL_RegionCapTintLinear: regionColors.cap.workingLinear,
    },
    mobileFallback: {
      ...styledParameters,
      TL_SourceAlbedoStrength: 1,
      TL_MobileFallback: true,
      TL_RegionBaseTintLinear: regionColors.base.workingLinear,
      TL_RegionShaftTintLinear: regionColors.shaft.workingLinear,
      TL_RegionNeckTintLinear: regionColors.neck.workingLinear,
      TL_RegionCapTintLinear: regionColors.cap.workingLinear,
    },
  },
  reversibleOutputRules: {
    styleControl: 'TL_StyleWeight',
    neutralValue: 0,
    styledValue: 1,
    baseColor: 'lerp(exact neutral source BaseColor, styled BaseColor, TL_StyleWeight)',
    normal: 'lerp/angle-correct between exact neutral decoded source normal and styled normal; neutral branch must be bit-identical before material compilation',
    ambientOcclusion: 'lerp(exact ORM.r, styled AO, TL_StyleWeight)',
    roughness: 'lerp(exact ORM.g*source roughnessFactor, styled roughness, TL_StyleWeight)',
    metallic: 'lerp(exact ORM.b*source metallicFactor, styled metallic, TL_StyleWeight)',
    specular: 'neutral glTF KHR_materials_specular factor maps to UE Specular = clamp(specularFactor*0.5, 0, 1); styled portable branch uses UE dielectric default 0.5',
    neutralInstanceRequirement: 'All neutral values are explicit parameters; no static switch may compile away or alter the neutral source branch.',
    restoreRequirement: 'Restoring the neutral parameter snapshot must restore identical parameter bytes, texture object paths, static-switch state, mesh, LODs, collision, and frozen-scene pixels.',
  },
  sceneLightingContract: {
    ownership: 'scene systems, not baked into Base/Normal/ORM',
    sun: {
      ueInput: 'Directional Light using Default Lit shading',
      c11Source: 'shared ToonLab sun/shadow pass',
      materialOverride: 'none in neutral or mobile fallback',
    },
    cloudShadow: {
      ueInput: 'Volumetric Cloud transmittance shadowing on the Directional Light',
      c11Source: 'ToonLabCloudShadowMap from sky-system volumetric transmittance',
      materialOverride: 'none; custom multiplication would double-shadow',
    },
    skyAndProbe: {
      ueInput: 'Sky Light diffuse probe plus Reflection Capture/Lumen reflection environment',
      c11Settings: {
        skyFillStrength: style.lighting.skyFillStrength,
        skyFillTintSerializedSrgb: style.lighting.skyFillTint,
        skyFillTintWorkingLinear: linearColor(style.lighting.skyFillTint),
        ambientFloor: style.lighting.ambientFloor,
      },
      parityRule: 'Do not translate these scalars directly into emissive; calibrate UE scene lighting and capture it independently.',
    },
    exposure: {
      c11ToneMappingExposure: style.lighting.exposure,
      ueRule: 'Lock auto exposure for qualification; no exact numeric UE EV mapping is claimed.',
    },
  },
  mobileFallback: {
    semanticSourceLods: semanticGlbs.filter((entry) => entry.lod > 0).map((entry) => ({
      lod: entry.lod,
      role: entry.role,
      triangles: entry.inspection.triangles,
      glb: entry.glb,
    })),
    requiredTriangleRoles: ['mobile-near', 'mobile-mid', 'mobile-far'],
    textureSamples: ['TL_SourceBaseColor', 'TL_SourceNormal', 'TL_SourceORM'],
    retainedFeatures: ['neutral identity branch', 'RGBA geological region tint', 'source normal', 'source AO/roughness/metallic'],
    disabledFeatures: ['TSL macro triplanar projection', 'TSL near-detail octave', 'custom sky-fill/ambient material terms', 'custom cloud-shadow texture sampling'],
    twoSided: false,
    twoSidedQualification: 'C11 source declares doubleSided=true while the existing C12 neutral import contract declares twoSided=false; keep mobile one-sided only after backside/cull validation.',
    currentC12MobileInputLimitation: 'The current combined C12 mobile GLB is neutral-only and is not claimed to carry the semantic region accessor. Assemble UE LODs from the hash-bound C11 semantic LOD1/2/3 staging conversions.',
  },
  unsupportedUntilPortedOrBaked: [
    {
      id: 'tsl-generated-macro-rock-texture',
      reason: 'The 24% non-source contribution implied by sourceAlbedoStrength=0.76 uses a first-party generated TSL texture that is not a hash-bound portable texture in this handoff.',
      consequence: 'Portable UE region style is not full C11 Base Color parity.',
    },
    {
      id: 'tsl-triplanar-projection-and-near-detail',
      reason: `projectionContrast=${style.projection.projectionContrast}, nearDetailStrength=${style.projection.nearDetailStrength}, and nearDetailScale=${style.projection.nearDetailScale} depend on TSL projection/runtime coordinates.`,
      consequence: 'Export/bake the macro and near-detail inputs or author and qualify an equivalent UE material function.',
    },
    {
      id: 'tsl-normal-composition',
      reason: 'TSL combines projected crack normals, source tangent normals, distance flattening, and guarded tangent handling; only the source normal is portable now.',
      consequence: 'UE styled normal parity remains unexecuted.',
    },
    {
      id: 'tsl-top-mask-smoothness',
      reason: 'The TSL top mask participates in final smoothness even with optional surface layers disabled; it is not represented by the neutral ORM.',
      consequence: 'UE styled roughness parity remains unexecuted.',
    },
    {
      id: 'toonlab-custom-brdf-and-scene-post',
      reason: 'Ambient floor, sky fill, cloud shadow, fog, tone mapping, SSAO, TAA, and post processing are renderer/scene behavior, not transferable material constants.',
      consequence: 'Cross-engine pixels require a controlled UE scene capture and developer visual approval.',
    },
  ],
  expectedExecutionEvidence: {
    materialReport: path.join(outputRoot, 'unreal/material-report.json'),
    captureManifest: path.join(outputRoot, 'unreal/captures/manifest.json'),
    requirements: [
      'UE 5.8 master material and three instances exist and compile without warnings.',
      'Every texture, semantic staging GLB, UE asset, parameter value, and material graph export is hash-bound.',
      'Desktop neutral/styled/restored six-view captures use a frozen shared sun/sky/cloud/ground/post scene.',
      'Neutral and restored parameter snapshots, asset identities, and frozen pixels are exact.',
      'Desktop Nanite, forced fallback, and authored mobile LOD0/1/2 styled captures pass.',
      'Mobile shader stats and target-device GPU timing are recorded.',
      'A developer approves the UE styled result; automated checks cannot grant art-direction approval.',
    ],
  },
  blockers: [
    'No UE 5.8 stylizable material or material-instance execution report exists yet.',
    'No UE neutral/styled/restored six-view parity capture exists yet.',
    'TSL-only macro, near-detail, normal, smoothness, BRDF, and scene terms require a port, bake, or explicit visual waiver.',
    'C11 developer art-direction approval and full-catalog qualification remain pending.',
  ],
};

await mkdir(outputRoot, { recursive: true });
await writeFile(contractFile, `${JSON.stringify(contract, null, 2)}\n`);
await writeFile(path.join(outputRoot, 'README.md'), `# C11 → C12 styled material contract\n\n`
  + `This directory contains a hash-bound, implementation-ready UE 5.8 handoff for the representative hoodoo. It does not claim that the styled material has been authored, compiled, captured, or approved in Unreal.\n\n`
  + `The neutral Base/Normal/ORM inputs and four geological region masks are exact. The UE import bridge must stage \`_TL_ROCK_REGION\` as \`COLOR_0\` without changing accessor bytes. A single style-weight parameter preserves an explicit neutral branch and a reversible region-style branch.\n\n`
  + `Full visual parity is blocked because several visible C11 terms are TSL/runtime-only and no UE styled evidence exists. Run \`node scripts/verify-rock-geology-v2-unreal-style-contract.mjs --contract-only\` to verify the handoff itself. The verifier intentionally exits non-zero without \`--contract-only\` until the required UE material and capture evidence exists.\n`);

process.stdout.write(`${JSON.stringify({
  prepared: true,
  contract: contractFile,
  semanticGlbs: semanticGlbs.length,
  fullStyledParityPassed: false,
  blockers: contract.blockers,
}, null, 2)}\n`);
