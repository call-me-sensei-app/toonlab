export function resolveToonLabGrassVariant(profile: any): false | "grass" | "snow" | "desert";
export function isToonLabGrassProfile(profile: any): boolean;
export function toonLabGrassCastsShadow(profile: any): boolean;
export function loadToonLabTerrainTextures(options?: {}): Promise<any>;
/**
 * Exact connected MV_Grass graph outputs adapted to Three's physical material.
 * Lighting integration is the engine bridge; color/alpha/WPO/PBR inputs remain
 * literal ToonLab graph logic and values.
 */
export function buildToonLabGrassMaterial(profile: any, { baseUrl, hasVertexColors, state, }?: {
    baseUrl?: any;
    hasVertexColors?: boolean;
    state?: any;
}): Promise<MeshPhysicalNodeMaterial>;
export const DEFAULT_TOONLAB_ENVIRONMENT_BASE_URL: any;
export const TOONLAB_GRASS: Readonly<{
    sourceMaterial: "MV_Grass";
    sourceGraph: "S_FoliageShader";
    shaderGuid: "9def86e0e2fee9a4a8b1dbb313e05b9f";
    bottomColor: readonly number[];
    tipColor: readonly number[];
    specularColor: readonly number[];
    smoothness: 0.05;
    emissiveStrength: 0.03;
    hueVariationScale: 50;
    startFadeDistance: 80;
    endFadeDistance: 100;
    alphaClipThreshold: 0.9;
    additionalYOffset: 0.2;
    windIntensity: 10;
    windSpeed: 0.1;
    windWeight: 0.05;
    hueVariation: 0;
    hueShift: 0;
    useSolidTipColor: false;
    gradient: readonly (Readonly<{
        color: readonly number[];
        position: 0;
    }> | Readonly<{
        color: readonly number[];
        position: 0.2735332;
    }> | Readonly<{
        color: readonly number[];
        position: 0.6558785;
    }> | Readonly<{
        color: readonly number[];
        position: 0.9499962;
    }>)[];
}>;
export const TOONLAB_GRASS_VARIANTS: Readonly<{
    grass: Readonly<{
        sourceMaterial: "MV_Grass";
    }>;
    snow: Readonly<{
        sourceMaterial: "MV_GrassSnow";
        bottomColor: readonly number[];
        tipColor: readonly number[];
        specularColor: readonly number[];
        smoothness: 0.039;
        hueVariation: 0.08;
        useSolidTipColor: true;
    }>;
    desert: Readonly<{
        sourceMaterial: "MV_GrassDesert";
        bottomColor: readonly number[];
        tipColor: readonly number[];
        specularColor: readonly number[];
        smoothness: 0.253;
        hueVariation: 0.02;
        useSolidTipColor: true;
    }>;
}>;
export const TOONLAB_TERRAIN_LAYERS: Readonly<{
    DesertDirt: Readonly<{
        diffuse: "T_DesertDirt_BC.png";
        normal: any;
        tileSize: 26;
        metallic: 0.438;
        smoothness: 0.38;
        normalScale: 1;
    }>;
    DesertGrass: Readonly<{
        diffuse: "T_DesertGrass_BC.png";
        normal: any;
        tileSize: 10;
        metallic: 0.499;
        smoothness: 0.405;
        normalScale: 0.2;
    }>;
    DesertSand: Readonly<{
        diffuse: "T_DesertSand_BC.png";
        normal: "T_DesertSand_N.png";
        tileSize: 20;
        metallic: 0.499;
        smoothness: 0.405;
        normalScale: 0.2;
    }>;
    Dirt: Readonly<{
        diffuse: "T_Dirt_BC.png";
        normal: "T_Dirt_N.png";
        tileSize: 16;
        metallic: 0;
        smoothness: 0;
        normalScale: 1;
    }>;
    Grass: Readonly<{
        diffuse: "T_Grass2_BC.png";
        normal: any;
        tileSize: 12;
        metallic: 0.099;
        smoothness: 0.25;
        normalScale: 1;
    }>;
    Rock: Readonly<{
        diffuse: "T_RockClassic_BC.PNG";
        normal: "T_RockClassic_N.PNG";
        tileSize: 32;
        metallic: 0;
        smoothness: 0;
        normalScale: 1;
    }>;
    Sand: Readonly<{
        diffuse: "T_Sand.png";
        normal: "T_Sand_N.png";
        tileSize: 12;
        metallic: 0.614;
        smoothness: 0.228;
        normalScale: 1;
    }>;
    Snow: Readonly<{
        diffuse: "T_Snow_BC.PNG";
        normal: any;
        tileSize: 32;
        metallic: 0.791;
        smoothness: 0;
        normalScale: 1;
    }>;
}>;
import { MeshPhysicalNodeMaterial } from 'three/webgpu';
