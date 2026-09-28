export function normalizeToonLabRockMaterialLibrarySchema(schema: any): string;
/** Returns the material basename without engine path/wrapper/clone syntax. */
export function normalizeToonLabRockMaterialReference(reference: any): string;
/**
 * Resolves a ToonLab object path, ToonLab material/slot name, or canonical profile ID
 * to a stable ToonLab profile descriptor. Missing ToonLab-only source variants are
 * rejected unless `allowFallback` is explicitly enabled.
 */
export function resolveToonLabRockProfile(reference: any, { allowFallback, sourceAssetName, }?: {
    allowFallback?: boolean;
    sourceAssetName?: any;
}): Readonly<{
    profileId: any;
    inputName: string;
    matchedName: any;
    matchKind: "profile-id";
    isExact: true;
    id: any;
    sourceName: any;
    toonLabMaterialName: any;
    assetPath: `Environment/Rocks/Materials/${any}`;
}> | Readonly<{
    profileId: any;
    inputName: string;
    matchedName: any;
    matchKind: "toonlab-material" | "toonlab-fbx-slot";
    isExact: true;
    id: any;
    sourceName: any;
    toonLabMaterialName: any;
    assetPath: `Environment/Rocks/Materials/${any}`;
}> | Readonly<{
    profileId: any;
    inputName: string;
    matchedName: any;
    matchKind: "source-asset-assignment" | "source-crosswalk";
    isExact: true;
    id: any;
    sourceName: any;
    toonLabMaterialName: any;
    assetPath: `Environment/Rocks/Materials/${any}`;
}> | Readonly<{
    profileId: any;
    inputName: string;
    matchedName: any;
    matchKind: "source-parent-fallback";
    isExact: false;
    id: any;
    sourceName: any;
    toonLabMaterialName: any;
    assetPath: `Environment/Rocks/Materials/${any}`;
}>;
/** Validates and indexes the extractor's stable v1 manifest contract. */
export function createToonLabRockMaterialIndex(manifest: any): Readonly<{
    byAssetPath: Map<any, any>;
    byGuid: Map<any, any>;
    byName: Map<any, any>;
    manifest: any;
    materials: any;
    schema: string;
    schemaVersion: number;
    sourceSchema: any;
}>;
/**
 * Fetches and validates the extracted ToonLab material library once per URL.
 * A failed request is removed from the cache so development-server retries
 * work after the extractor writes the file.
 */
export function loadToonLabRockMaterialLibrary({ fetchImpl, url, }?: {
    fetchImpl?: typeof fetch;
    url?: any;
}): Promise<any>;
export function loadToonLabRockMaterialIndex(options?: {}): Promise<Readonly<{
    byAssetPath: Map<any, any>;
    byGuid: Map<any, any>;
    byName: Map<any, any>;
    manifest: any;
    materials: any;
    schema: string;
    schemaVersion: number;
    sourceSchema: any;
}>>;
/**
 * Resolves identity and, when a manifest/index is supplied, returns the exact
 * raw material record that the ToonLab-profile normalizer should consume.
 */
export function resolveToonLabRockMaterial(reference: any, { allowFallback, index, manifest, sourceAssetName, strictManifest, }?: {
    allowFallback?: boolean;
    index?: any;
    manifest?: any;
    sourceAssetName?: any;
    strictManifest?: boolean;
}): Readonly<{
    materialRecord: any;
    profileId: any;
    inputName: string;
    matchedName: any;
    matchKind: "profile-id";
    isExact: true;
    id: any;
    sourceName: any;
    toonLabMaterialName: any;
    assetPath: `Environment/Rocks/Materials/${any}`;
} | {
    materialRecord: any;
    profileId: any;
    inputName: string;
    matchedName: any;
    matchKind: "toonlab-material" | "toonlab-fbx-slot";
    isExact: true;
    id: any;
    sourceName: any;
    toonLabMaterialName: any;
    assetPath: `Environment/Rocks/Materials/${any}`;
} | {
    materialRecord: any;
    profileId: any;
    inputName: string;
    matchedName: any;
    matchKind: "source-asset-assignment" | "source-crosswalk";
    isExact: true;
    id: any;
    sourceName: any;
    toonLabMaterialName: any;
    assetPath: `Environment/Rocks/Materials/${any}`;
} | {
    materialRecord: any;
    profileId: any;
    inputName: string;
    matchedName: any;
    matchKind: "source-parent-fallback";
    isExact: false;
    id: any;
    sourceName: any;
    toonLabMaterialName: any;
    assetPath: `Environment/Rocks/Materials/${any}`;
}>;
export function requireToonLabRockMaterial(reference: any, options?: {}): Readonly<{
    materialRecord: any;
    profileId: any;
    inputName: string;
    matchedName: any;
    matchKind: "profile-id";
    isExact: true;
    id: any;
    sourceName: any;
    toonLabMaterialName: any;
    assetPath: `Environment/Rocks/Materials/${any}`;
} | {
    materialRecord: any;
    profileId: any;
    inputName: string;
    matchedName: any;
    matchKind: "toonlab-material" | "toonlab-fbx-slot";
    isExact: true;
    id: any;
    sourceName: any;
    toonLabMaterialName: any;
    assetPath: `Environment/Rocks/Materials/${any}`;
} | {
    materialRecord: any;
    profileId: any;
    inputName: string;
    matchedName: any;
    matchKind: "source-asset-assignment" | "source-crosswalk";
    isExact: true;
    id: any;
    sourceName: any;
    toonLabMaterialName: any;
    assetPath: `Environment/Rocks/Materials/${any}`;
} | {
    materialRecord: any;
    profileId: any;
    inputName: string;
    matchedName: any;
    matchKind: "source-parent-fallback";
    isExact: false;
    id: any;
    sourceName: any;
    toonLabMaterialName: any;
    assetPath: `Environment/Rocks/Materials/${any}`;
}>;
export const TOONLAB_ROCK_MATERIAL_LIBRARY_SCHEMA: "toonlab.rock-material-library";
export const TOONLAB_ROCK_MATERIAL_LIBRARY_SCHEMA_VERSION: 1;
export const DEFAULT_TOONLAB_ROCK_MATERIAL_LIBRARY_URL: any;
/**
 * Stable IDs for all 42 ToonLab rock material assets. `sourceName` is the exact
 * ToonLab `.mat` material name consumed by the extracted material manifest.
 */
export const TOONLAB_ROCK_PROFILES: readonly Readonly<{
    id: any;
    sourceName: any;
    toonLabMaterialName: any;
    assetPath: `Environment/Rocks/Materials/${any}`;
}>[];
export const TOONLAB_ROCK_PROFILE_IDS: readonly any[];
export const TOONLAB_ROCK_MATERIAL_CROSSWALK: Readonly<{
    M_Rock: "rock-base";
    MI_Rock: "rock-base";
    M_Mountain: "mountain-base";
    MI_Mountain: "mountain";
    MI_RockClassic: "classic";
    MI_RockClassic_BoulderClumps: "classic-boulder-clumps";
    MI_RockClassic_Boulders: "classic-boulders";
    MI_RockClassic_Boulders_Snow: "classic-boulders-snow";
    MI_RockClassic_Cliff: "classic-cliff";
    MI_RockClassic_Cliff_NoGrass: "classic-cliff-no-grass";
    MI_RockClassic_Cliff_Snow: "classic-cliff-snow";
    MI_RockClassic_Platforms: "classic-platforms";
    MI_RockClassic_Rocks: "classic-rocks";
    MI_RockClassic_Rocks_MossWorld: "classic-rocks-moss";
    MI_RockClassic_Rocks_Snow: "classic-rocks-snow";
    MI_RockClassic_Shelves: "classic-shelves";
    MI_RockClassic_Shelves_NoGrass: "classic-shelves-no-grass";
    MI_RockClassic_Shelves_Snow: "classic-shelves-snow";
    MI_RockCubic: "cubic";
    MI_RockCubic_Cliff: "cubic-cliff";
    MI_RockCubic_Metric: "cubic-metric";
    MI_RockCubic_Rocks: "cubic-rocks";
    MI_RockDesert: "desert";
    MI_RockDesert_Cliff: "desert-cliff";
    MI_RockDesert_Hoodoo: "desert-hoodoo";
    MI_RockDesert_Rocks: "desert-rocks";
    MI_RockDesert_Shelves: "desert-shelves";
    MI_RockHexic: "hexic";
    MI_RockHexic_Pieces: "hexic-pieces";
    MI_RockHexic_Platforms: "hexic-platforms";
    MI_RockHexic_Rocks: "hexic-rocks";
    MI_RockHexic_RocksSlanted: "hexic-rock-slanted";
    MI_RockHexic_Rocks_MossWorld: "hexic-rocks-moss";
    MI_RockHexic_Spire: "hexic-spire";
    MI_RockHexic_Spire_MossWorld: "hexic-spire-moss";
    MI_RockSpire: "spire";
    MI_RockSpire_Rocks: "spire-rocks";
    MI_RockSpire_Rocks_MossWorld: "spire-rocks-moss";
    MI_RockSpire_Shelves: "spire-shelves";
    MI_RockSpire_Shelves_Snow: "spire-shelves-snow";
    MI_RockSpire_Spires: "spire-spires";
    MI_RockSpire_Spires_Snow: "spire-spires-snow";
}>;
export const TOONLAB_ROCK_MATERIAL_FALLBACKS: Readonly<{
    MI_RockClassic_BoulderClumps_Snow: "classic-boulder-clumps";
    MI_RockClassic_Boulders_MossWorld: "classic-boulders";
    MI_RockClassic_Boulders_Snow_Demo: "classic-boulders-snow";
    MI_RockClassic_Cliff_Demo: "classic-cliff";
    MI_RockClassic_Rocks_Demo: "classic-rocks";
    MI_RockClassic_Rocks_Snow_Demo: "classic-rocks-snow";
    MI_RockClassic_Shelves_Demo: "classic-shelves";
    MI_RockCubic_Grass: "cubic";
    MI_RockDesert_Cliff_Grass: "desert-cliff";
    MI_RockDesert_Cliff_NoTopLayer: "desert-cliff";
    MI_RockDesert_Rocks_Grass: "desert-rocks";
    MI_RockDesert_Shelves_Grass: "desert-shelves";
    MI_RockHexic_Pieces_Demo: "hexic-pieces";
    MI_RockHexic_Pieces_MossVertex: "hexic-pieces";
    MI_RockHexic_Platforms_Demo: "hexic-platforms";
    MI_RockHexic_Platforms_MossVertex: "hexic-platforms";
    MI_RockHexic_RocksSlanted_Demo: "hexic-rock-slanted";
    MI_RockHexic_Rocks_Demo: "hexic-rocks";
    MI_RockHexic_Rocks_MossVertex: "hexic-rocks-moss";
    MI_RockHexic_Spire_Demo: "hexic-spire";
    MI_RockHexic_Spire_MossVertex: "hexic-spire-moss";
    MI_Mountain_China: "mountain";
    MI_Mountain_Snowy: "mountain";
    MI_RockSpire_Rocks_Snow: "spire-rocks";
    MI_RockSpire_Shelves_Demo: "spire-shelves";
    MI_RockSpire_Shelves_GrassNoMask: "spire-shelves";
    MI_RockSpire_Shelves_NoGrass: "spire-shelves";
    MI_RockSpire_Spires_Grass: "spire-spires";
}>;
