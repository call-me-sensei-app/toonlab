import type { Object3D } from 'three';
import type { ToonLabInspector } from '../styles/styleInspector.js';
import type { StyleApplicationResult } from '../styles/styleTypes.js';

export type CatalogVector3 = number | readonly [number, number, number];
export interface OfficialCatalogPlacementOptions {
  assetId: string;
  assetRuntime: { acquireAsset(assetId: string): Promise<unknown> };
  styleBundle: unknown;
  collision?: 'auto' | 'none' | boolean | Readonly<Record<string, unknown>>;
  collisionAdapter?: unknown;
  collisionWorld?: unknown;
  inspector?: ToonLabInspector | null;
  maxLodLevel?: number;
  parent?: Object3D | null;
  position?: CatalogVector3;
  quality?: string | Readonly<Record<string, unknown>> | null;
  rotation?: CatalogVector3;
  scale?: CatalogVector3;
  targetId?: string | null;
  textures?: Readonly<Record<string, unknown>>;
  usePublishedRockSurface?: boolean;
  variation?: number;
}
export interface OfficialCatalogPlacement {
  readonly asset: unknown;
  readonly collision: unknown;
  readonly container: Object3D;
  readonly handle: unknown;
  readonly lod: {
    readonly availableLevels: readonly number[];
    readonly level: number | null;
    readonly thresholds: readonly number[];
    update(options: { camera?: unknown; distance?: number }): unknown;
  };
  readonly normalization: Readonly<Record<string, unknown>>;
  readonly object: Object3D;
  readonly publishedRockSurface: unknown;
  readonly quality: unknown;
  readonly released: boolean;
  readonly style: StyleApplicationResult;
  readonly targetId: string;
  release(): Promise<boolean>;
  updateLod(options: { camera?: unknown; distance?: number }): unknown;
}

export function resolveCatalogLodDistancesForQuality(
  quality: string | Readonly<Record<string, unknown>> | null,
  fallback?: readonly number[],
): number[];
export function loadOfficialCatalogAsset(
  options: OfficialCatalogPlacementOptions,
): Promise<OfficialCatalogPlacement>;
