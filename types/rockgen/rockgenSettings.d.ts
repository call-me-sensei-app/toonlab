/**
 * Returns full meshing settings for a quality tier merged over
 * {@link DEFAULT_ROCKGEN_MESHING_SETTINGS}; unknown names return the plain
 * defaults. Spread the result into a preset's `meshing`:
 *
 *   const preset = resolveRockgenPreset('boulder', { style: 'call_me_sensei' });
 *   preset.meshing = { ...preset.meshing, ...resolveRockgenQuality('gameplayHigh') };
 */
export function resolveRockgenQuality(name: any): any;
export function createRockShapeSettings(options?: any): {};
export function createRockNoiseSettings(options?: any): {};
export function createRockWarpSettings(options?: any): {};
export function createRockCutsSettings(options?: any): {};
export function createRockFacetSettings(options?: any): {};
export function createRockCracksSettings(options?: any): {};
export function createRockHeightfieldSettings(options?: any): {};
export function createRockStrataSettings(options?: any): {};
export function createRockColumnsSettings(options?: any): {};
export function createRockFalloffSettings(options?: any): {};
export function createRockSurfaceSettings(options?: any): {};
export function createRockgenMeshingSettings(options?: any): {};
/** All piece-level groups coerced from a partial `{ shape, noise, ... }`. */
export function createRockPieceSettings(options?: any): {
    columns: {};
    cracks: {};
    cuts: {};
    facet: {};
    heightfield: {};
    falloff: {};
    noise: {};
    shape: {};
    strata: {};
    warp: {};
};
/**
 * Base primitive the piece displaces. 'sketch' extrudes the piece's drawn
 * `outline` polygon (piece-level data, not a schema field) and falls back
 * to the ellipsoid until an outline exists.
 */
export const ROCK_SHAPE_TYPES: readonly string[];
/** Normal generation modes for meshed documents. */
export const ROCK_NORMALS_MODES: readonly string[];
/** Procedural albedo styles layered into baked vertex colors. */
export const ROCK_SURFACE_TEXTURE_STYLES: readonly string[];
/** Texture Lab recipes that make sense as tiled PBR maps on rocks and cliffs. */
export const ROCK_PBR_TEXTURE_PRESETS: readonly (Readonly<{
    id: "none";
    label: "None / authored GLB texture";
}> | Readonly<{
    id: any;
    label: `Stone \u2014 ${any}` | `Ground \u2014 ${any}`;
}>)[];
export const DEFAULT_ROCK_SHAPE_SETTINGS: Readonly<{
    capsuleLength: 1.5;
    cornerRadius: 0.25;
    sizeX: 1;
    sizeY: 0.75;
    sizeZ: 1;
    type: "ellipsoid";
}>;
export const DEFAULT_ROCK_NOISE_SETTINGS: Readonly<{
    amplitude: 0.08;
    enabled: true;
    frequency: 1.4;
    gain: 0.5;
    lacunarity: 2;
    octaves: 3;
    ridged: false;
    seedOffset: 0;
}>;
export const DEFAULT_ROCK_WARP_SETTINGS: Readonly<{
    enabled: true;
    frequency: 0.9;
    strength: 0.1;
}>;
/** Silhouette profiles for the eroded heightfield shape. */
export const ROCK_HEIGHTFIELD_PROFILES: readonly string[];
export const DEFAULT_ROCK_HEIGHTFIELD_SETTINGS: Readonly<{
    droplets: 0.5;
    erosion: 0.7;
    profile: "mesa";
    relief: 0.65;
    roughness: 0.5;
    seedOffset: 0;
    terrace: 0.35;
    terraceSteps: 6;
    thermal: 0.6;
}>;
export const DEFAULT_ROCK_CUTS_SETTINGS: Readonly<{
    bevel: 0.02;
    count: 6;
    depth: 0.3;
    enabled: false;
    seedOffset: 0;
    verticalBias: 0.6;
}>;
export const DEFAULT_ROCK_FACET_SETTINGS: Readonly<{
    enabled: false;
    jitter: 1;
    scale: 2.2;
    strength: 0.25;
}>;
export const DEFAULT_ROCK_CRACKS_SETTINGS: Readonly<{
    coverage: 0.55;
    depth: 0.08;
    enabled: false;
    scale: 0.9;
    width: 0.09;
}>;
export const DEFAULT_ROCK_STRATA_SETTINGS: Readonly<{
    enabled: false;
    frequency: 3;
    sharpness: 0.6;
    strength: 0.12;
    tiltDegrees: 8;
    warpAmount: 0.2;
}>;
export const DEFAULT_ROCK_COLUMNS_SETTINGS: Readonly<{
    enabled: false;
    grooveDepth: 0.14;
    grooveWidth: 0.25;
    heightVariation: 0.9;
    scale: 1.6;
}>;
export const DEFAULT_ROCK_FALLOFF_SETTINGS: Readonly<{
    bottomFlatten: 0;
    radialPinch: 0;
    topTaper: 0;
}>;
export const DEFAULT_ROCK_SURFACE_SETTINGS: Readonly<{
    baseColor: readonly number[];
    cavityColor: readonly number[];
    topColor: readonly number[];
    topCoatStrength: 1;
    topHeightStart: 0.55;
    topSlopeStart: 0.72;
    colorNoise: 0.06;
    textureStyle: "none";
    textureStrength: 0;
    textureScale: 1;
    pbrTexturePreset: "none";
    pbrTextureScale: 2;
    pbrNormalStrength: 1;
    pbrRoughness: 1;
    veinColor: readonly number[];
    veinStrength: 0;
    stainColor: readonly number[];
    stainStrength: 0;
    mossColor: readonly number[];
    mossCoverage: 0;
    lichenColor: readonly number[];
    lichenCoverage: 0;
    aoRadius: 0.5;
    aoStrength: 1;
}>;
export const ROCK_SURFACE_TEXTURE_PRESETS: Readonly<{
    bare: Readonly<{
        description: "Plain baked rock colors with only the height/cavity coat.";
        label: "Bare";
        surface: Readonly<{
            baseColor: readonly number[];
            cavityColor: readonly number[];
            colorNoise: 0.06;
            lichenCoverage: 0;
            mossCoverage: 0;
            stainStrength: 0;
            textureScale: 1;
            textureStrength: 0;
            textureStyle: "none";
            topCoatStrength: 1;
            topColor: readonly number[];
            topHeightStart: 0.55;
            topSlopeStart: 0.72;
            veinStrength: 0;
        }>;
    }>;
    granite: Readonly<{
        description: "Cool speckled stone with restrained pale flecks.";
        label: "Granite";
        surface: Readonly<{
            baseColor: readonly number[];
            cavityColor: readonly number[];
            colorNoise: 0.04;
            lichenCoverage: 0.04;
            mossCoverage: 0;
            stainStrength: 0.05;
            textureScale: 1.5;
            textureStrength: 0.32;
            textureStyle: "granite";
            topColor: readonly number[];
            veinStrength: 0.08;
        }>;
    }>;
    sandstone: Readonly<{
        description: "Warm sediment bands, dusted ledges, and light iron wash.";
        label: "Sandstone";
        surface: Readonly<{
            baseColor: readonly number[];
            cavityColor: readonly number[];
            colorNoise: 0.05;
            lichenCoverage: 0;
            mossCoverage: 0;
            stainColor: readonly number[];
            stainStrength: 0.22;
            textureScale: 1.35;
            textureStrength: 0.38;
            textureStyle: "sandstone";
            topColor: readonly number[];
            veinStrength: 0;
        }>;
    }>;
    basalt: Readonly<{
        description: "Dark volcanic stone with blocky crystal breakup.";
        label: "Basalt";
        surface: Readonly<{
            baseColor: readonly number[];
            cavityColor: readonly number[];
            colorNoise: 0.035;
            lichenCoverage: 0.06;
            mossCoverage: 0;
            stainStrength: 0;
            textureScale: 1.1;
            textureStrength: 0.34;
            textureStyle: "basalt";
            topColor: readonly number[];
            veinStrength: 0.03;
        }>;
    }>;
    limestone: Readonly<{
        description: "Warm sediment bands, chalky shelves, and dark limestone seams.";
        label: "Limestone";
        surface: Readonly<{
            baseColor: readonly number[];
            cavityColor: readonly number[];
            colorNoise: 0.045;
            lichenCoverage: 0.14;
            mossCoverage: 0;
            stainColor: readonly number[];
            stainStrength: 0.16;
            textureScale: 1.35;
            textureStrength: 0.58;
            textureStyle: "limestone";
            topColor: readonly number[];
            veinStrength: 0.04;
        }>;
    }>;
    veined: Readonly<{
        description: "Quartz/mineral seams over a cool rock base.";
        label: "Veined";
        surface: Readonly<{
            baseColor: readonly number[];
            cavityColor: readonly number[];
            colorNoise: 0.035;
            lichenCoverage: 0.02;
            mossCoverage: 0;
            textureScale: 1.05;
            textureStrength: 0.18;
            textureStyle: "veined";
            topColor: readonly number[];
            veinColor: readonly number[];
            veinStrength: 0.68;
        }>;
    }>;
    mossy: Readonly<{
        description: "Green ledge/cavity growth plus small pale lichen spots.";
        label: "Moss";
        surface: Readonly<{
            baseColor: readonly number[];
            cavityColor: readonly number[];
            colorNoise: 0.05;
            lichenCoverage: 0.16;
            mossColor: readonly number[];
            mossCoverage: 0.62;
            stainStrength: 0.06;
            textureScale: 1.2;
            textureStrength: 0.18;
            textureStyle: "granite";
            topColor: readonly number[];
            topHeightStart: 0.4;
            topSlopeStart: 0.5;
            veinStrength: 0.02;
        }>;
    }>;
    lichen: Readonly<{
        description: "Dry exposed-face lichen over pale rock.";
        label: "Lichen";
        surface: Readonly<{
            baseColor: readonly number[];
            cavityColor: readonly number[];
            colorNoise: 0.045;
            lichenColor: readonly number[];
            lichenCoverage: 0.48;
            mossCoverage: 0.08;
            stainStrength: 0.04;
            textureScale: 1.35;
            textureStrength: 0.24;
            textureStyle: "limestone";
            topColor: readonly number[];
            veinStrength: 0.02;
        }>;
    }>;
    snowcap: Readonly<{
        description: "Cold rock with a broken top-facing snow/dust cap.";
        label: "Snow Cap";
        surface: Readonly<{
            baseColor: readonly number[];
            cavityColor: readonly number[];
            colorNoise: 0.035;
            lichenCoverage: 0;
            mossCoverage: 0;
            stainStrength: 0;
            textureScale: 1;
            textureStrength: 0.18;
            textureStyle: "granite";
            topCoatStrength: 1;
            topColor: readonly number[];
            topHeightStart: 0.45;
            topSlopeStart: 0.52;
            veinStrength: 0.02;
        }>;
    }>;
}>;
export const DEFAULT_ROCKGEN_MESHING_SETTINGS: Readonly<{
    exportLods: true;
    exportResolution: 224;
    normalsMode: "gradient";
    previewResolution: 80;
    removeIslands: true;
    sharpFeatures: true;
}>;
export const ROCKGEN_QUALITY_LEVELS: readonly string[];
export const ROCKGEN_QUALITY_PRESETS: Readonly<{
    gameplayHigh: Readonly<{
        exportResolution: 224;
        normalsMode: "gradient";
        previewResolution: 96;
        sharpFeatures: true;
    }>;
    hero: Readonly<{
        exportResolution: 288;
        normalsMode: "flat";
        previewResolution: 128;
        sharpFeatures: true;
    }>;
    mobile: Readonly<{
        exportLods: false;
        exportResolution: 128;
        normalsMode: "gradient";
        previewResolution: 56;
        sharpFeatures: false;
    }>;
}>;
export const ROCKGEN_SETTING_GROUPS: readonly (Readonly<{
    description: "Base primitive the rock piece is displaced from.";
    id: "shape";
    label: "Base Shape";
}> | Readonly<{
    description: "Eroded landform for the Heightfield shape: relief, strata terracing, and real hydraulic/thermal erosion.";
    id: "heightfield";
    label: "Heightfield & Erosion";
}> | Readonly<{
    description: "FBM displacement that roughens the silhouette.";
    id: "noise";
    label: "Surface Noise";
}> | Readonly<{
    description: "Domain warp that swirls the shape before displacement, breaking symmetry.";
    id: "warp";
    label: "Domain Warp";
}> | Readonly<{
    description: "Seeded flat plane slices — dead-flat faces and sharp edges for slabs, shards, and cliff walls.";
    id: "cuts";
    label: "Planar Cuts";
}> | Readonly<{
    description: "Voronoi border grooves for a fractured look. Carves rounded creases, not flat planes — use Planar Cuts for slab faces.";
    id: "facet";
    label: "Voronoi Faceting";
}> | Readonly<{
    description: "Sparse deep fissures in weathered patches — big Voronoi borders gated by a coverage mask.";
    id: "cracks";
    label: "Cracks";
}> | Readonly<{
    description: "Sedimentary bands / terracing grooves along a tiltable axis.";
    id: "strata";
    label: "Strata";
}> | Readonly<{
    description: "Columnar jointing: vertical prismatic columns with stepped heights (basalt cliffs).";
    id: "columns";
    label: "Columns";
}> | Readonly<{
    description: "Shapes the silhouette: flatten the base, taper the top, pinch the sides.";
    id: "falloff";
    label: "Silhouette Falloff";
}> | Readonly<{
    description: "Procedural albedo layers, baked vertex colors, and SDF ambient occlusion (whole document).";
    id: "surface";
    label: "Surface Color & AO";
}> | Readonly<{
    description: "Grid resolutions and normal mode for preview and export meshing.";
    id: "meshing";
    label: "Meshing";
}>)[];
export const ROCKGEN_SETTING_DEFAULTS: Readonly<{
    columns: Readonly<{
        enabled: false;
        grooveDepth: 0.14;
        grooveWidth: 0.25;
        heightVariation: 0.9;
        scale: 1.6;
    }>;
    cracks: Readonly<{
        coverage: 0.55;
        depth: 0.08;
        enabled: false;
        scale: 0.9;
        width: 0.09;
    }>;
    cuts: Readonly<{
        bevel: 0.02;
        count: 6;
        depth: 0.3;
        enabled: false;
        seedOffset: 0;
        verticalBias: 0.6;
    }>;
    facet: Readonly<{
        enabled: false;
        jitter: 1;
        scale: 2.2;
        strength: 0.25;
    }>;
    heightfield: Readonly<{
        droplets: 0.5;
        erosion: 0.7;
        profile: "mesa";
        relief: 0.65;
        roughness: 0.5;
        seedOffset: 0;
        terrace: 0.35;
        terraceSteps: 6;
        thermal: 0.6;
    }>;
    falloff: Readonly<{
        bottomFlatten: 0;
        radialPinch: 0;
        topTaper: 0;
    }>;
    meshing: Readonly<{
        exportLods: true;
        exportResolution: 224;
        normalsMode: "gradient";
        previewResolution: 80;
        removeIslands: true;
        sharpFeatures: true;
    }>;
    noise: Readonly<{
        amplitude: 0.08;
        enabled: true;
        frequency: 1.4;
        gain: 0.5;
        lacunarity: 2;
        octaves: 3;
        ridged: false;
        seedOffset: 0;
    }>;
    shape: Readonly<{
        capsuleLength: 1.5;
        cornerRadius: 0.25;
        sizeX: 1;
        sizeY: 0.75;
        sizeZ: 1;
        type: "ellipsoid";
    }>;
    strata: Readonly<{
        enabled: false;
        frequency: 3;
        sharpness: 0.6;
        strength: 0.12;
        tiltDegrees: 8;
        warpAmount: 0.2;
    }>;
    surface: Readonly<{
        baseColor: readonly number[];
        cavityColor: readonly number[];
        topColor: readonly number[];
        topCoatStrength: 1;
        topHeightStart: 0.55;
        topSlopeStart: 0.72;
        colorNoise: 0.06;
        textureStyle: "none";
        textureStrength: 0;
        textureScale: 1;
        pbrTexturePreset: "none";
        pbrTextureScale: 2;
        pbrNormalStrength: 1;
        pbrRoughness: 1;
        veinColor: readonly number[];
        veinStrength: 0;
        stainColor: readonly number[];
        stainStrength: 0;
        mossColor: readonly number[];
        mossCoverage: 0;
        lichenColor: readonly number[];
        lichenCoverage: 0;
        aoRadius: 0.5;
        aoStrength: 1;
    }>;
    warp: Readonly<{
        enabled: true;
        frequency: 0.9;
        strength: 0.1;
    }>;
}>;
/** Groups that live on each piece (the rest belong to the document). */
export const ROCKGEN_PIECE_GROUP_IDS: readonly string[];
export const ROCKGEN_SETTING_FIELD_SCHEMA: Readonly<{
    [k: string]: Readonly<{
        [k: string]: Readonly<{
            defaultValue: any;
            description: any;
            group: any;
            id: string;
            key: any;
            label: any;
            optionLabels: any;
            options: any[];
            range: any;
            serializable: true;
            type: "number" | "boolean" | "color" | "select";
        }>;
    }>;
}>;
