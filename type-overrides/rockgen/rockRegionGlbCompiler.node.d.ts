export const ROCK_REGION_COMPILER_VERSION: 1;
export const HOODOO_CAPROCK_REGION_PROFILE_ID: 'hoodoo-caprock-normalized-height-v1';
export const HOODOO_CAPROCK_INPUT_SHA256: 'd8081bb45a413bbeaab912767c47328308e91e0250aba5213ccb4409fdbf310e';

export type HoodooCaprockRegionProfileId = typeof HOODOO_CAPROCK_REGION_PROFILE_ID;

export interface RockRegionCompilerErrorDetails {
  readonly [key: string]: unknown;
}

export class RockRegionCompilerError extends Error {
  readonly code: string;
  readonly details: RockRegionCompilerErrorDetails | null;
  constructor(code: string, message: string, details?: RockRegionCompilerErrorDetails | null);
}

export interface RockRegionBindingDocument {
  readonly schema: 'toonlab.rock-region-binding';
  readonly version: 1;
  readonly profile: HoodooCaprockRegionProfileId;
  readonly attribute: '_TL_ROCK_REGION';
  readonly encoding: 'unorm8';
  readonly channels: readonly ['base', 'shaft', 'neck', 'cap'];
  readonly space: 'mesh-local-normalized-height';
  readonly failClosed: true;
  readonly bands: Readonly<{
    base: readonly [number, number];
    cap: readonly [number, number];
    neckEnter: readonly [number, number];
    neckExit: readonly [number, number];
  }>;
}

export interface RockRegionPrimitiveAudit {
  readonly meshIndex: 0;
  readonly primitiveIndex: 0;
  readonly positionAccessor: number;
  readonly regionAccessor: number;
  readonly count: number;
  readonly byteOffset: number;
  readonly byteLength: number;
  readonly sourceHeightRange: readonly [number, number];
  readonly channelMinUnorm8: readonly [number, number, number, number];
  readonly channelMaxUnorm8: readonly [number, number, number, number];
  readonly primaryPartitionFailures: number;
  readonly neckSamples: number;
  readonly channelSamples: readonly [number, number, number, number];
}

export interface RockRegionGlbAudit {
  readonly schema: 'toonlab/rock-region-glb-audit';
  readonly version: 1;
  readonly compilerVersion: typeof ROCK_REGION_COMPILER_VERSION;
  readonly profile: HoodooCaprockRegionProfileId;
  readonly passed: true;
  readonly input: Readonly<{
    bytes: number;
    sha256: string;
    declaredBinaryBytes: number;
    declaredBinarySha256: string;
  }>;
  readonly output: Readonly<{
    bytes: number;
    sha256: string;
    declaredBinaryBytes: number;
    originalBinaryPrefixBytes: number;
    originalBinaryPrefixSha256: string;
    semanticBytes: number;
  }>;
  readonly binding: RockRegionBindingDocument;
  readonly primitiveAudits: readonly [RockRegionPrimitiveAudit];
}

export interface CompileRockRegionGlbOptions {
  readonly profile?: HoodooCaprockRegionProfileId;
  readonly inputSha256: typeof HOODOO_CAPROCK_INPUT_SHA256;
}

export interface CompileRockRegionGlbFileOptions extends CompileRockRegionGlbOptions {
  readonly inputPath: string;
  readonly outputPath: string;
  readonly auditPath: string;
  readonly overwrite?: boolean;
}

export interface CompiledRockRegionGlb {
  readonly bytes: Uint8Array;
  readonly audit: Readonly<RockRegionGlbAudit>;
}

export function compileRockRegionGlb(
  input: Uint8Array,
  options: CompileRockRegionGlbOptions,
): Readonly<CompiledRockRegionGlb>;

export function compileRockRegionGlbFile(
  options: CompileRockRegionGlbFileOptions,
): Promise<Readonly<RockRegionGlbAudit>>;

/** @internal Repository verifier hook; not exported by `@call-me-sensei/toonlab/rockgen/node`. */
export function compileRockRegionGlbWithProfile(
  input: Uint8Array,
  options?: Readonly<{ profile?: unknown; inputSha256?: string }>,
): Readonly<CompiledRockRegionGlb>;

/** @internal C11 regeneration hook; not exported by the public Node barrel. */
export function compileHoodooResearchRockRegionGlbFile(options?: Readonly<{
  inputPath?: string;
  outputPath?: string;
  auditPath?: string;
  inputSha256?: string | null;
  overwrite?: boolean;
}>): Promise<Readonly<RockRegionGlbAudit>>;
