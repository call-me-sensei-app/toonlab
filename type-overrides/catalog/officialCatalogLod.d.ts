import type { Camera, Mesh, Object3D } from 'three';

export interface CatalogLodBinding {
  readonly level: number;
  readonly mesh: Mesh;
  readonly originalVisible: boolean;
}

export interface CatalogLodSelectionOptions {
  readonly availableLevels?: readonly number[];
  readonly distance?: number;
  readonly distances?: readonly number[];
  readonly maxLevel?: number;
  readonly currentLevel?: number | null;
  readonly hysteresis?: number;
}

export interface CatalogLodRuntimeOptions {
  readonly distances?: readonly number[];
  readonly hysteresis?: number;
  readonly maxLevel?: number;
  readonly namePattern?: RegExp;
}

export interface CatalogLodUpdateOptions {
  readonly camera?: Camera | null;
  readonly distance?: number | null;
}

export interface CatalogLodUpdateResult {
  readonly changed: boolean;
  readonly distance: number;
  readonly level: number;
}

export interface CatalogLodRuntime {
  readonly availableLevels: readonly number[];
  readonly bindings: readonly Readonly<CatalogLodBinding>[];
  readonly disposed: boolean;
  readonly level: number | null;
  readonly thresholds: readonly number[];
  readonly hysteresis: number;
  dispose(): void;
  setLevel(level: number): boolean;
  update(options?: CatalogLodUpdateOptions): Readonly<CatalogLodUpdateResult> | null;
}

export function collectCatalogLodBindings(
  root: Object3D,
  options?: Readonly<{ namePattern?: RegExp }>,
): readonly Readonly<CatalogLodBinding>[];

export function normalizeCatalogLodDistances(
  distances: readonly number[] | null | undefined,
  levelCount?: number | null,
): readonly number[];

export function selectCatalogLodLevel(options?: CatalogLodSelectionOptions): number | null;

export function createCatalogLodRuntime(
  root: Object3D,
  options?: CatalogLodRuntimeOptions,
): Readonly<CatalogLodRuntime>;
