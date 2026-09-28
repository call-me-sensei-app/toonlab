export const ROCK_REGION_BINDING_SCHEMA: 'toonlab.rock-region-binding';
export const ROCK_REGION_BINDING_VERSION: 1;
export const ROCK_REGION_PROFILE: 'hoodoo-caprock-normalized-height-v1';
export const ROCK_REGION_GLTF_ATTRIBUTE: '_TL_ROCK_REGION';
export const ROCK_REGION_THREE_ATTRIBUTE: '_tl_rock_region';
export const ROCK_REGION_BINDING_KEY: 'toonlabRockRegionBinding';
export const ROCK_REGION_CHANNELS: readonly ['base', 'shaft', 'neck', 'cap'];
export const ROCK_REGION_BANDS: Readonly<{
  base: readonly [0.12, 0.30];
  cap: readonly [0.72, 0.86];
  neckEnter: readonly [0.60, 0.70];
  neckExit: readonly [0.80, 0.89];
}>;

export type RockRegionChannel = (typeof ROCK_REGION_CHANNELS)[number];

export interface RockRegionBindingDocument {
  readonly schema: typeof ROCK_REGION_BINDING_SCHEMA;
  readonly version: typeof ROCK_REGION_BINDING_VERSION;
  readonly profile: 'hoodoo-caprock-normalized-height-v1';
  readonly attribute: typeof ROCK_REGION_GLTF_ATTRIBUTE;
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

export interface RockRegionAttributeLike {
  readonly array: Uint8Array;
  readonly count: number;
  readonly itemSize: 4;
  readonly normalized: true;
}

export interface RockRegionMeshLike {
  readonly isMesh: true;
  readonly name?: string;
  readonly userData?: Record<string, unknown>;
  readonly geometry: {
    readonly isBufferGeometry: true;
    getAttribute(name: string): unknown;
  };
}

export interface RockRegionRootLike {
  traverse(callback: (object: unknown) => void): void;
}

export interface RockRegionInspection {
  readonly binding: RockRegionBindingDocument;
  readonly attribute: RockRegionAttributeLike;
  readonly attributeName: typeof ROCK_REGION_THREE_ATTRIBUTE;
  readonly count: number;
  readonly bytes: number;
  readonly primaryPartitionFailures: number;
  readonly compilerProfileMismatches: number;
  readonly neckSamples: number;
  readonly nonzeroSamples: readonly [number, number, number, number];
  readonly channelMinUnorm8: readonly [number, number, number, number];
  readonly channelMaxUnorm8: readonly [number, number, number, number];
  readonly passed: true;
}

export interface RockRegionTreeInspection {
  readonly passed: true;
  readonly meshCount: number;
  readonly totalVertices: number;
  readonly totalBytes: number;
  readonly records: readonly (RockRegionInspection & { readonly mesh: RockRegionMeshLike })[];
}

export function inspectRockRegionBinding(
  mesh: RockRegionMeshLike,
  options?: Readonly<{ sampleValues?: boolean }>,
): Readonly<RockRegionInspection>;

export function inspectRockRegionBindings(
  root: RockRegionRootLike,
  options?: Readonly<{ requireEveryMesh?: boolean; sampleValues?: boolean }>,
): Readonly<RockRegionTreeInspection>;
