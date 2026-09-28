export type NaturalRockMapRole = 'ao' | 'baseColor' | 'heightMicro' | 'normalGL' | 'orm' | 'roughness' | 'smoothness';
export type NaturalRockVector = readonly [number, number, number];
export type NaturalRockBounds = NaturalRockVector | {
  dimensionsMetres?: readonly number[];
  dimensions?: readonly number[];
  minimum?: readonly number[];
  maximum?: readonly number[];
  min?: readonly number[];
  max?: readonly number[];
  width?: number;
  height?: number;
  depth?: number;
};
export interface NaturalRockProfile {
  readonly label: string;
  readonly lithology: string;
  readonly fabric: string;
  readonly requiresSemanticRegions?: boolean;
  readonly semanticRegionRoles?: readonly string[] | null;
  readonly baseTileMetres: number;
  readonly heightMicroSpanMetres: number;
  readonly [property: string]: unknown;
}
export interface NaturalRockBinding {
  familyId: string;
  profileId: string;
  surfaceRationale?: string;
  requiresSemanticRegions?: boolean;
}
export interface NaturalRockPackedMask {
  encoding: 'rle-u8-v1'; length: number; runs: readonly number[];
}
export interface NaturalRockSemanticRegions {
  schema: 'toonlab/c8-semantic-surface-regions'; version: 1;
  coordinateSpace: 'geometry-uv0'; geometrySha256: string; width: number; height: number;
  regions: readonly {
    id: string; role: string; materialProfileId: string; geometryRegionId: string;
    sourceKind: 'authored-geometry-semantic-mask';
    mask: Uint8Array | NaturalRockPackedMask; maskSha256?: string;
  }[];
}
export interface NaturalRockSurfaceOptions {
  assetId: string;
  profileId?: string | null;
  binding?: NaturalRockBinding | null;
  seed?: number | null;
  semanticRegions?: NaturalRockSemanticRegions | null;
  geometrySha256?: string | null;
}
export interface NaturalRockProjection {
  readonly mode: string;
  readonly upAxis: 'y';
  readonly scaleMetres?: number;
  readonly dimensionsMetres?: readonly number[];
  readonly mapRoleProjection: Readonly<Record<NaturalRockMapRole, Readonly<Record<string, unknown>>>>;
  readonly [property: string]: unknown;
}
export interface NaturalRockSurfaceSpecification {
  readonly assetId: string;
  readonly profileId: string;
  readonly schema: string;
  readonly version: number;
  readonly seed: number;
  readonly mapResolution: number;
  readonly geometrySha256: string;
  readonly projection: NaturalRockProjection;
  readonly semanticRegions?: NaturalRockSemanticRegions;
  readonly semanticRegionSurface?: Readonly<{ contractSha256: string; geometrySha256: string; [property: string]: unknown }>;
  readonly [property: string]: unknown;
}
export const C8_FIRST12_LITHOLOGY_PROFILES: Readonly<Record<string, NaturalRockProfile>>;
export const C8_FIRST12_MAP_ROLES: readonly NaturalRockMapRole[];
export const C8_FIRST12_ASSET_IDS: readonly string[];
export const C8_FIRST12_ASSET_SURFACE_BINDINGS: Readonly<Record<string, NaturalRockBinding>>;
export const C8_COMPOSITE_SURFACE_RECIPES: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
export const C8_FIRST12_SURFACE_SCHEMA: 'toonlab/c8-first12-geology-surface';
export const C8_FIRST12_SURFACE_VERSION: 2;
export const C8_SEMANTIC_SURFACE_REGIONS_SCHEMA: 'toonlab/c8-semantic-surface-regions';
export const C8_SEMANTIC_SURFACE_REGIONS_VERSION: 1;
export function c8First12SurfaceSeed(value: unknown): number;
export function normalizeC8First12EditedBounds(bounds: NaturalRockBounds): Readonly<{
  axisOrder: 'x-y-z'; dimensionsMetres: readonly number[];
  maximumMetres: readonly number[] | null; minimumMetres: readonly number[] | null; upAxis: 'y';
}>;
export function resolveC8First12Projection(options: {
  assetId: string; editedBoundsMetres: NaturalRockBounds;
  profileId?: string | null; binding?: NaturalRockBinding | null;
}): NaturalRockProjection;
export function createC8First12GeologyMapData(options: NaturalRockSurfaceOptions & {
  size?: number; projectionScaleMetres?: number | null;
}): Readonly<{
  maps: Readonly<Record<NaturalRockMapRole, Uint8Array>>;
  audit: Readonly<{ profileId: string; seed: number; size: number; byteHash: string; [property: string]: unknown }>;
  heightMicroDecode: Readonly<{ encoding: string; midlevel: number; physicalSpanMetres: number; [property: string]: unknown }>;
  normalGLDerivation: Readonly<Record<string, unknown>>;
}>;
export function createC8First12SurfaceSpecification(options: NaturalRockSurfaceOptions & {
  editedBoundsMetres: NaturalRockBounds; geometrySha256: string;
  mapResolution?: number; boundsAuthority?: string;
}): NaturalRockSurfaceSpecification;
