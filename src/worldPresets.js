// Cross-cluster world presets. Import from '@call-me-sensei/toonlab'.
//
// A world preset is one named starting point that couples the per-cluster
// choices that must agree at a given camera scale — camera planes, sun/time
// rig, fog, rock meshing quality, vegetation scale and distribution, water
// and sky tone. Individual cluster defaults are authored at asset-lab scale
// (a single tree or rock filling the frame); at an open-world gameplay
// camera those values read wrong: default-size trees and ankle-height grass
// disappear, flat-normal rocks go near-black, and the sky dome sits inside
// the far plane. A world preset is the studio's answer for one scale,
// resolved as plain data the host spreads into each system.
//
// ToonLab world units are meters throughout.
//
//   import { resolveWorldPreset } from '@call-me-sensei/toonlab';
//
//   const world = resolveWorldPreset('outdoorGameplay');
//   const camera = new THREE.PerspectiveCamera(world.camera.fov, aspect, world.camera.near, world.camera.far);
//   const sky = new StylizedSky({ preset: world.sky.preset, ...world.sky.settings });
//   const water = new WaterSurface({ preset: world.water.preset, width: 400, depth: 400 });
//   const grass = await createCallMeSenseiGrassField({
//     variant: world.grass.variant,
//     placements: scatterGrassAround({ ...world.grass.scatter, center, heightAt, mask }),
//   });
//   for (const p of scatterForest({ ...world.trees.scatter, center, heightAt, mask })) {
//     const tree = new StylizedTree({ preset: world.trees.preset, seed: p.seed, ...world.trees.settings });
//     tree.position.set(p.x, p.y, p.z);
//   }
//   const rock = resolveRockgenPreset(world.rocks.preset);
//   rock.meshing = { ...rock.meshing, ...resolveRockgenQuality(world.rocks.quality) };
//   await applyEnvironmentShader(root, { ...resolveEnvironmentPreset(world.environment.preset), ...world.environment.overrides });

const WORLD_PRESET_DEFINITIONS = new Map([
  ['outdoorGameplay', Object.freeze({
    label: 'Outdoor Gameplay',
    description: 'Open-world outdoor scale for a 50–160 m third-person gameplay camera: far fog, gradient rock normals, meadow-height grass, 8–12 m trees, anime water tone.',
    // 1 unit = 1 meter. Third-person gameplay reads the world at 50–160 m.
    units: 'meters',
    camera: {
      // Generous far plane: fog owns the depth falloff, and a tight far
      // plane makes distant mountains pop in and out as the camera turns.
      far: 4000,
      fov: 45,
      near: 0.4,
    },
    environment: {
      style: 'call_me_sensei',
      // Production outdoor grade. These are intentionally opinionated: the
      // composed world must not inherit the dense asset-lab fog or the
      // near-zero ambient used by isolated material previews. The latter
      // turns cast shadows into black holes in a real valley.
      overrides: {
        parameters: {
          ambientProbeBlend: 0.45,
          ambientStrength: 0.38,
          directLightStrength: 1.12,
          exposure: 1.06,
          heightFogColor: [0.63, 0.8, 0.98],
          heightFogDensity: 0.00055,
          heightFogFalloff: 400,
          lightingInfluence: 0.96,
          saturation: 1.2,
          shadowLift: 0.42,
          shadowTintColor: [0.68, 0.74, 0.94],
          skyTintStrength: 0.16,
          sunShadowStrength: 0.72,
          triplanarDetail: 1,
          triplanarDetailScale: 28,
          triplanarEdgeHighlight: 0.7,
          untexturedGradientStrength: 0.52,
        },
      },
    },
    sky: {
      scenario: 'clear_day',
      style: 'call_me_sensei',
      // Dome must clear the far plane and the fog band.
      settings: {
        cloudColor: [1, 1, 1],
        cloudCoverage: 0.42,
        cloudScale: 1.12,
        cloudShadeColor: [0.58, 0.72, 0.95],
        horizonColor: [0.58, 0.84, 1],
        horizonScattering: 0.52,
        quality: 'high',
        radius: 400,
        sunColor: [1, 0.97, 0.88],
        sunDirection: [-0.4, 0.82, -0.3],
        zenithColor: [0.1, 0.46, 0.93],
      },
    },
    water: {
      preset: 'lake',
      style: 'call_me_sensei',
    },
    weather: {
      preset: 'partlyCloudy',
      style: 'call_me_sensei',
    },
    vegetationShader: {
      style: 'call_me_sensei',
    },
    grass: {
      mode: 'authored',
      preset: 'call_me_sensei_clump',
      variant: 'primary',
      // One placement is one low, composed tuft. This preserves readable
      // meadow masses and makes painted/scattered grass use the same unit.
      settings: {
        baseColor: [0.172518, 0.317708, 0.052621],
        bladeHeightRange: [0.14, 0.34],
        bladeWidthRange: [0.035, 0.075],
        bladesPerClump: 22,
        clumpRadius: 0.52,
        groundAdoptHeight: 0.82,
        groundAdoptStrength: 0.86,
        groundAdoptTint: [1.18, 1.26, 1.08],
        pushRadius: 1.2,
        shadowTint: [0.34, 0.49, 0.4],
        tipColor: [0.31, 0.47, 0.09],
      },
      // Source-style coverage is roughly 1.75 one-meter tufts per m². The
      // clump LOD field keeps the near/mid/far triangle budget bounded.
      scatter: { density: 1.75, maxCount: 18000, radius: 55 },
    },
    trees: {
      preset: 'call_me_sensei',
      // size 1 ≈ 3 m; open-world silhouettes want ~10 m canopies.
      canopyColors: [
        0x4f9844, 0x5ca64a, 0x6ab052, 0x438c3e, 0x71b85a,
        0x559c48, 0x7dbc62, 0x4c9241, 0x8bc46a, 0xb4ad54,
      ],
      lod: {
        castShadow: true,
        detailCount: 140,
        detailDistance: 165,
        variants: 10,
      },
      settings: { size: 3.25 },
      // Dense crowns, but with enough breathing room to avoid a continuous
      // billboard wall. Far trees are one volumetric instanced draw/variant.
      scatter: { jitter: 0.48, keepChance: 0.86, radius: 170, spacing: 6.6 },
    },
    understory: {
      enabled: true,
      scatter: {
        groundCoverPerTree: 3.2,
        maxGroundCover: 6200,
        maxShrubs: 2400,
        seed: 2309,
        shrubsPerTree: 1.35,
      },
      settings: {
        groundScaleRange: [0.5, 1.05],
        shrubScaleRange: [0.72, 1.5],
      },
    },
    contactShadows: {
      color: 0x395469,
      opacity: 0.15,
      treeRadius: 1.25,
    },
    rocks: {
      preset: 'boulder',
      style: 'call_me_sensei',
      // Gradient normals: flat facets read near-black at gameplay range.
      quality: 'gameplayHigh',
    },
  })],
]);

/**
 * Registers a named world preset (community presets sit alongside the
 * built-ins). `definition` follows the same shape as the built-ins: any of
 * `{ label, description, units, camera, environment, sky, water, grass,
 * trees, rocks, weather }`.
 */
export function registerWorldPreset(name, definition = {}, { overwrite = false } = {}) {
  const id = String(name ?? '').trim();
  if (!id) throw new Error('World preset name is required.');
  if (!overwrite && WORLD_PRESET_DEFINITIONS.has(id)) {
    throw new Error(`World preset "${id}" already exists.`);
  }
  const source = definition && typeof definition === 'object' ? definition : {};
  WORLD_PRESET_DEFINITIONS.set(id, Object.freeze({ ...source }));
  return { description: source.description ?? '', id, label: source.label ?? id };
}

/** Lists registered world presets as `{ id, label, description }` (for HUDs). */
export function getWorldPresetOptions() {
  return Array.from(WORLD_PRESET_DEFINITIONS.entries()).map(([id, preset]) => ({
    description: preset.description ?? '',
    id,
    label: preset.label ?? id,
  }));
}

/**
 * Returns a deep copy of a world preset, safe to mutate; unknown names
 * return null.
 */
export function resolveWorldPreset(name) {
  const preset = WORLD_PRESET_DEFINITIONS.get(String(name ?? '').trim());
  return preset ? structuredClone(preset) : null;
}
