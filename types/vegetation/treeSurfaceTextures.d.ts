import type { DataTexture } from 'three';

export type TreeSurfaceProfileId =
  | 'call-me-sensei-bark-v1'
  | 'oak-fissured-v1'
  | 'bamboo-waxy-v1'
  | 'yucca-fibrous-v1'
  | 'saguaro-waxy-v1';

export interface TreeSurfaceProfile {
  readonly id: TreeSurfaceProfileId;
  readonly label: string;
  readonly shader: Readonly<{
    bandSoftness: number;
    shadowFloor: number;
    skyFillStrength: number;
  }>;
  readonly textureVersion: number;
  readonly uvRepeat: readonly [number, number];
}

export interface TreeSurfaceTextureOptions {
  profileId: TreeSurfaceProfileId;
  resolution?: number;
  seed?: number;
}

export interface TreeSurfaceTextureData {
  readonly data: Uint8Array;
  readonly height: number;
  readonly profileId: TreeSurfaceProfileId;
  readonly seed: number;
  readonly version: number;
  readonly width: number;
}

export interface TreeSurfaceSpeciesReference {
  readonly id?: string;
}

export const TREE_SURFACE_TEXTURE_VERSION: 1;
export const TREE_SURFACE_PROFILES: Readonly<Record<TreeSurfaceProfileId, TreeSurfaceProfile>>;
export const TREE_SURFACE_PROFILE_DEFAULTS: Readonly<{
  call_me_sensei: 'call-me-sensei-bark-v1';
}>;

export function getTreeSurfaceProfileOptions(): Array<{
  id: TreeSurfaceProfileId;
  label: string;
  value: TreeSurfaceProfileId;
}>;

export function treeSurfaceProfileId(
  speciesProfileOrId: string | TreeSurfaceSpeciesReference | null | undefined,
): TreeSurfaceProfileId | null;

export function treeSurfaceProfile(
  speciesProfileOrId: string | TreeSurfaceSpeciesReference | null | undefined,
): TreeSurfaceProfile | null;

export function createTreeSurfaceTextureData(
  options: TreeSurfaceTextureOptions,
): TreeSurfaceTextureData;

export function createTreeSurfaceTexture(
  options: TreeSurfaceTextureOptions,
): DataTexture;

export function treeSurfaceTextureForSpecies(
  speciesProfileOrId: string | TreeSurfaceSpeciesReference | null | undefined,
  options?: Omit<TreeSurfaceTextureOptions, 'profileId'>,
): DataTexture | null;
