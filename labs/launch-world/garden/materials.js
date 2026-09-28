// Stillwater Garden — the four ground surfaces, authored as ToonLab texture
// recipes and baked at load time.
//
// §2 of the scene brief asks for "four genuinely distinct surfaces meeting in
// frame": raked gravel, moss, stone paving and packed earth. They are ToonLab
// Texture Lab recipes rather than photographs, for three reasons:
//
//   1. Every camera in this garden is close. A landscape photograph bound at a
//      1.2–2.2 m world tile reads as a photograph of a landscape, at the wrong
//      scale, with baked-in lighting from somewhere else.
//   2. The recipes are seeded and pure, so the ground is bit-identical run to
//      run — the filler register's determinism precondition, met by
//      construction rather than by discipline.
//   3. Ground is a ToonLab-owned surface, and the product owns the generator
//      that makes it. Using a photograph here would demo somebody else's tool.
//
// D19-058: the Ground Shader accepts `map` only and throws on the rest of the
// PBR set, so only the albedo is bound. The recipes still bake normal and
// roughness — they are correct, they are simply unreachable from this consumer
// until FILL-012 lands. Do not delete them; they are the merge's test data.
//
// `worldTile` is the metre period each recipe is authored for. FILL-011 exists
// because a recipe cannot yet declare that itself (D19-052), so it is declared
// here and consumed by the Ground Shader's `projection` scales in scene.js —
// one table, two consumers, no chance of them disagreeing.

import * as THREE from 'three';

import { evaluateTextureMaps } from '@call-me-sensei/toonlab/texgen';
import { syncTextureMapTextures } from '../../../src/texgen/textureThree.js';

// The §9 material workstream's authored garden set. Every entry is baked at
// 4096 against a declared world tile, so the four splat surfaces clear §8's
// texel bar with margin — MAT-GDN-02 moss measures 51.20 px/cm against a 10.24
// bar, where the in-repo recipes below reach 3–5 px/cm at a 512 bake.
//
// It lives under `assets-local/`, which is dev-only and gitignored, so the
// recipes are NOT deleted: they are the fallback that keeps this lab buildable
// for anyone without the licensed tree, and they are what the merged
// `worldTile` API (FILL-011) will be tested against. `buildGardenGroundLayers`
// prefers the authored map and falls back to the bake, per layer, and reports
// which it used.
const MATERIAL_ROOT = '/assets-local/launch-world/materials';

/**
 * Ordered to match the Ground Shader's four fixed splat channels
 * (D19-022): R grass, G dirt, B rock, A sand. The `role` field is the garden's
 * own vocabulary; `channel` is what the shader calls the same slot.
 */
export const GARDEN_GROUND_LAYERS = Object.freeze([
  Object.freeze({
    channel: 'grass',
    label: 'Garden moss bed',
    // Declared world tile of the AUTHORED map (material-set.json). The recipe
    // document cannot carry it yet — that is exactly D19-052 / FILL-011 — so it
    // is mirrored here and consumed by the Ground Shader's projection scales.
    authoredTile: 0.8,
    materialId: 'MAT-GDN-02',
    role: 'moss',
    // Moss is a clumped colony, not a noise field: inverted Worley gives the
    // rounded cushions, the fbm detail gives the velvet, and the speckle is
    // the fine leaf structure that keeps it from reading as painted felt.
    settings: Object.freeze({
      accentA: Object.freeze({
        blend: 'normal', color: '#6d7a3a', colorB: '#8a8f4a', coverage: 0.2,
        creviceBias: -0.35, enabled: true, generator: 'fbm', roughnessShift: 0.06,
        scale: 4, softness: 0.35, warp: 0.45,
      }),
      base: Object.freeze({
        cellJitter: 1, cellVariation: 0.6, contrast: 0.18, generator: 'worley',
        invert: true, scale: 19, warp: 0.4, warpScale: 6,
      }),
      color: Object.freeze({
        cavity: 0.44, color0: '#132a0d', color1: '#1e3f13', color2: '#2d5c1a',
        color3: '#3f7d24', color4: '#5c9d36', jitterCellVariety: 0.45,
        jitterHue: 0.05, jitterValue: 0.13, pos1: 0.18, saturation: 1.14,
      }),
      detailA: Object.freeze({
        amount: 0.42, blend: 'add', detail: 5, detailGain: 0.55, enabled: true,
        generator: 'fbm', scale: 34,
      }),
      detailB: Object.freeze({
        amount: 0.24, blend: 'add', cellVariation: 0.7, enabled: true,
        generator: 'speckle', scale: 74,
      }),
      global: Object.freeze({ seed: 20_811 }),
      surface: Object.freeze({ heightScale: 0.4, roughness: 1, roughnessContrast: 0.14 }),
      wear: Object.freeze({ dirt: 0.08 }),
    }),
    worldTile: 1.5,
  }),
  Object.freeze({
    channel: 'dirt',
    label: 'Swept garden earth',
    authoredTile: 1.2,
    materialId: 'MAT-GDN-04',
    role: 'earth',
    // A swept garden path is not open dirt: it is compacted, damp, and carries
    // the fine grit that gets swept to its edges. Warmer and darker than the
    // shipped dry-dirt preset, with the speckle carrying the grit.
    settings: Object.freeze({
      accentA: Object.freeze({
        blend: 'multiply', color: '#40331f', colorB: '#54452c', coverage: 0.32,
        creviceBias: 0.55, enabled: true, generator: 'turbulence', scale: 6,
        softness: 0.3, warp: 0.35,
      }),
      base: Object.freeze({
        detail: 5, detailGain: 0.52, generator: 'fbm', scale: 11, warp: 0.22,
        warpScale: 4,
      }),
      color: Object.freeze({
        cavity: 0.42, color0: '#241a12', color1: '#3a2a1c', color2: '#4e3b28',
        color3: '#63503a', color4: '#7a6752', jitterHue: 0.04, jitterValue: 0.12,
        saturation: 0.94,
      }),
      detailB: Object.freeze({
        amount: 0.3, blend: 'add', cellVariation: 0.6, edgeWidth: 0.3,
        enabled: true, generator: 'speckle', scale: 52,
      }),
      global: Object.freeze({ seed: 20_812 }),
      surface: Object.freeze({ heightScale: 0.34, roughness: 0.96, roughnessContrast: 0.22 }),
    }),
    worldTile: 2.2,
  }),
  Object.freeze({
    channel: 'rock',
    label: 'Cut granite flagging',
    authoredTile: 1.6,
    materialId: 'MAT-GDN-03',
    role: 'paving',
    // Irregular cut flags with tight joints — the nobedan paving of a stone
    // path. Worley at a low cell jitter gives polygonal flags rather than the
    // rounded cobbles the shipped cobblestone preset produces; the fbm overlay
    // is the granite's own grain across the flag faces.
    settings: Object.freeze({
      base: Object.freeze({
        cellJitter: 0.62, cellVariation: 0.34, contrast: 0.12, edgeWidth: 0.07,
        generator: 'worley', scale: 4.4, warp: 0.12, warpScale: 3,
      }),
      color: Object.freeze({
        cavity: 0.62, color0: '#2b2a29', color1: '#4d4a46', color2: '#6a665f',
        color3: '#847f75', color4: '#9d978a', jitterCellVariety: 0.55,
        jitterCells: true, jitterHue: 0.02, jitterValue: 0.14, pos1: 0.14,
        saturation: 0.82, sheen: 0.14,
      }),
      detailA: Object.freeze({
        amount: 0.32, blend: 'overlay', detail: 4, enabled: true,
        generator: 'fbm', scale: 26,
      }),
      detailB: Object.freeze({
        amount: 0.16, blend: 'add', cellVariation: 0.5, enabled: true,
        generator: 'speckle', scale: 90,
      }),
      global: Object.freeze({ seed: 20_813 }),
      surface: Object.freeze({ heightScale: 0.66, roughness: 0.82, roughnessContrast: 0.36 }),
      wear: Object.freeze({ dirt: 0.14 }),
    }),
    worldTile: 2.4,
  }),
  Object.freeze({
    channel: 'sand',
    label: 'Raked granite gravel',
    // `-straight` rather than `-curved`: the gravel sea here is a rectangle of
    // open court read at a grazing angle, and concentric raking belongs around
    // the stone islands, which is a scene concern the tile cannot own.
    authoredTile: 1.0,
    materialId: 'MAT-GDN-01-straight',
    role: 'gravel',
    // Pale crushed granite, raked. The rake is a stretched `stripes` layer at
    // an overlay blend, deliberately shallow: real samon furrows are a few
    // centimetres of relief and read as a value modulation, not as corduroy.
    // Their spacing is the recipe's, and the world tile below is what makes it
    // land at a believable 11 cm on the ground.
    settings: Object.freeze({
      base: Object.freeze({
        cellJitter: 1, cellVariation: 0.42, contrast: 0.06, generator: 'worley',
        scale: 58,
      }),
      color: Object.freeze({
        cavity: 0.34, color0: '#8d887f', color1: '#a49f95', color2: '#b6b1a6',
        color3: '#c6c1b6', color4: '#d6d1c6', jitterCells: true,
        jitterCellVariety: 0.22, jitterScale: 34, jitterValue: 0.08, pos1: 0.16,
        saturation: 0.5,
      }),
      detailA: Object.freeze({
        amount: 0.22, blend: 'overlay', enabled: true, generator: 'stripes',
        rows: 11, scale: 11, stretchX: 1, stretchY: 1, warp: 0.05, warpScale: 8,
      }),
      detailB: Object.freeze({
        amount: 0.16, blend: 'add', cellVariation: 0.5, enabled: true,
        generator: 'speckle', scale: 130,
      }),
      global: Object.freeze({ seed: 20_814 }),
      surface: Object.freeze({ heightScale: 0.28, roughness: 0.94, roughnessContrast: 0.16 }),
    }),
    // 1.1 m: raked granite gravel is 5–8 mm chip, so the base cell has to land
    // near 2 cm on the ground. Pass 1 authored 1.8 m against a scale-34 Worley
    // and the sea read as a cobbled yard from 25 m away.
    worldTile: 1.1,
  }),
]);

/**
 * Bakes every ground layer and wraps the albedo as a THREE texture.
 *
 * @param {object} [options]
 * @param {number} [options.size] Bake resolution per side.
 * @param {(role: string, index: number) => void} [options.onProgress]
 * @returns {Promise<Array<{ id, label, maps, role, texture, textures, worldTile, pxPerCm }>>}
 */
async function loadAuthoredAlbedo(materialId) {
  if (!materialId) return null;
  const url = `${MATERIAL_ROOT}/${materialId}/maps/albedo.png`;
  try {
    const texture = await new THREE.TextureLoader().loadAsync(url);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 8;
    return { texture };
  } catch {
    return null;
  }
}

export async function buildGardenGroundLayers({
  authored = true,
  onProgress = () => {},
  size = 512,
} = {}) {
  const layers = [];
  for (const [index, layer] of GARDEN_GROUND_LAYERS.entries()) {
    onProgress(layer.role, index);
    const source = authored ? await loadAuthoredAlbedo(layer.materialId) : null;
    if (source) {
      const worldTile = Number.isFinite(layer.authoredTile) ? layer.authoredTile : layer.worldTile;
      const resolution = source.texture.image?.width ?? 4096;
      layers.push({
        ...layer,
        maps: null,
        pxPerCm: resolution / (worldTile * 100),
        source: 'authored',
        texture: source.texture,
        textures: null,
        worldTile,
      });
      continue;
    }
    const maps = await evaluateTextureMaps(layer.settings, { size });
    const { textures } = syncTextureMapTextures(maps);
    textures.albedo.anisotropy = 8;
    layers.push({
      ...layer,
      maps,
      // §8's bar is resolution / (tile x 100) px/cm. Reported rather than
      // asserted here — the gate lives in the capture harness (FILL-011).
      pxPerCm: size / (layer.worldTile * 100),
      source: 'recipe',
      texture: textures.albedo,
      textures,
    });
  }
  return layers;
}

/**
 * Ground Shader `projection` scales derived from the same `worldTile` table the
 * bakes used, so the painted period and the authored period cannot drift.
 *
 * The `call_me_sensei` preset ships landscape periods — grass 16 m, dirt 13 m,
 * rock 25 m, sand 10 m — tuned against mountain-scale reference meshes. In a
 * garden where every camera is inside 30 m those read as a boulder field
 * (city stand-down §4.4, observed again here).
 */
export function groundProjectionScales(layers) {
  const scales = {};
  for (const layer of layers) scales[`${layer.channel}Scale`] = layer.worldTile;
  return scales;
}

/**
 * The garden's shared moss ramp, re-exported from the §9 material set so the
 * ground's moss layer, the moss painted into MAT-GDN-03's paving joints and the
 * moss on the set stones are all the same species. Picking a green here instead
 * would change species at every stone/ground meeting.
 */
export const GARDEN_MOSS_STOPS = Object.freeze([
  Object.freeze([0.055, 0.098, 0.055]),
  Object.freeze([0.118, 0.212, 0.096]),
  Object.freeze([0.196, 0.322, 0.132]),
  Object.freeze([0.302, 0.436, 0.176]),
  Object.freeze([0.436, 0.556, 0.238]),
]);
export const GARDEN_MOSS_MID = GARDEN_MOSS_STOPS[2];
export const GARDEN_MOSS_HIGH = GARDEN_MOSS_STOPS[3];
