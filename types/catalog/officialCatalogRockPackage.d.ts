import type { Texture, TextureLoader } from 'three';

export const OFFICIAL_ROCK_GALLERY_RECIPE_SCHEMA: 'toonlab/rock-gallery-recipe';
export const OFFICIAL_ROCK_MATERIAL_SCHEMA: 'toonlab.pro-rock-material';

export interface OfficialCatalogArtifact {
  readonly byteSize: number;
  readonly contentType: string;
  readonly name: string;
  readonly sha256: string;
  readonly url: string | null;
}

export interface OfficialCatalogRockPackageFiles {
  readonly collisionModelUrl: string | null;
  readonly controlModelUrl: string | null;
  readonly lodModelUrls: readonly (string | null)[];
  readonly manifestUrl: string | null;
  readonly materialConfigUrl: string | null;
  readonly natureProvenanceUrl: string | null;
  readonly natureReferenceUrl: string | null;
  readonly realisticModelUrl: string;
  readonly realisticPreviewUrl: string | null;
  readonly recipeUrl: string | null;
  readonly retainedHighModelUrl: string | null;
  readonly stylizedModelUrl: string | null;
  readonly stylizedPreviewUrl: string | null;
}

export interface OfficialCatalogRockPackage {
  readonly asset: Readonly<Record<string, unknown>>;
  readonly files: OfficialCatalogRockPackageFiles;
  readonly manifest: Readonly<Record<string, unknown>> | null;
  readonly materialConfig: Readonly<Record<string, unknown>> | null;
  readonly natureProvenance: Readonly<Record<string, unknown>> | null;
  readonly recipe: Readonly<Record<string, unknown>> | null;
}

export interface OfficialCatalogRockShaderInput {
  readonly materialConfig: Readonly<Record<string, unknown>>;
  readonly settings: Readonly<Record<string, unknown>>;
  readonly textures: Readonly<Record<string, Texture>>;
}

export function findOfficialCatalogArtifact(
  asset: { readonly artifacts?: readonly OfficialCatalogArtifact[] },
  ...names: string[]
): OfficialCatalogArtifact | null;
export function getOfficialCatalogArtifactUrl(
  asset: { readonly artifacts?: readonly OfficialCatalogArtifact[] },
  ...names: string[]
): string | null;
export function loadOfficialCatalogRockPackage(
  asset: Readonly<Record<string, unknown>>,
  options?: {
    readonly fetchImpl?: typeof globalThis.fetch;
    readonly includeManifest?: boolean;
    readonly includeNatureProvenance?: boolean;
  },
): Promise<OfficialCatalogRockPackage>;
export function loadOfficialCatalogRockShaderInput(
  rockPackage: OfficialCatalogRockPackage,
  options?: { readonly textureLoader?: TextureLoader },
): Promise<OfficialCatalogRockShaderInput | null>;
export function createOfficialCatalogRockEditorDescriptor(
  asset: Readonly<Record<string, unknown>>,
  rockPackage?: OfficialCatalogRockPackage | null,
): Readonly<Record<string, unknown>> | null;
