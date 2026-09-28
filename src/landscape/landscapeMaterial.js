// Landscape compatibility wrapper around the standalone Ground Shader.
// Landscape owns the field/splat project; Ground Shader owns rendering style.

import {
  createCompatibilityGroundShaderMaterial,
} from '../ground-shader/groundShaderMaterial.js';
import {
  createGroundShaderSettings as createCompatibilityGroundShaderSettings,
} from '../ground-shader/groundShaderSettings.js';

const TINT_KEYS = Object.freeze(['grassTint', 'dirtTint', 'rockTint', 'sandTint']);
const SCALE_KEYS = Object.freeze(['grassScale', 'dirtScale', 'rockScale', 'sandScale']);

/**
 * Builds the shared terrain material for a landscape field.
 *
 * New code should pass a portable `groundShader` profile. The historical
 * `layers`, `setLayerTint`, `setLayerTexture`, and `setMacro` surface remains
 * available so existing Landscape projects keep working during migration.
 */
export function createLandscapeMaterial({
  field,
  groundShader = {},
  layers = [],
} = {}) {
  const material = createCompatibilityGroundShaderMaterial({
    field,
    layers,
    settings: groundShader,
  });
  const ground = material.userData.toonlabGroundShader;
  let settings = createCompatibilityGroundShaderSettings({
    ...ground.settings,
    layers: {
      ...ground.settings.layers,
      ...Object.fromEntries(
        layers.map((layer, index) => [TINT_KEYS[index], layer?.tint])
          .filter(([, tint]) => Array.isArray(tint)),
      ),
    },
  });

  function apply(patch) {
    settings = createCompatibilityGroundShaderSettings({
      ...settings,
      ...patch,
    });
    ground.applySettings(settings);
  }

  material.userData.landscape = {
    splatTexture: ground.splatTexture,
    refreshSplat: ground.refreshSplat,
    setLayerTint(index, tint) {
      if (index < 0 || index > 3 || !Array.isArray(tint)) return;
      apply({
        layers: {
          ...settings.layers,
          [TINT_KEYS[index]]: tint,
        },
      });
    },
    setLayerTexture(index, map, { repeat = 0.35 } = {}) {
      if (index < 0 || index > 3) return;
      ground.setLayerTexture(index, map);
      const numericRepeat = Number(repeat);
      if (Number.isFinite(numericRepeat) && numericRepeat > 0) {
        apply({
          projection: {
            ...settings.projection,
            [SCALE_KEYS[index]]: 1 / numericRepeat,
          },
        });
      }
    },
    setMacro(amount, scale) {
      apply({
        macro: {
          ...settings.macro,
          ...(Number.isFinite(amount) ? { amount } : {}),
          ...(Number.isFinite(scale) ? { scale } : {}),
        },
      });
    },
    setGroundShader(next) {
      settings = createCompatibilityGroundShaderSettings(next);
      ground.applySettings(settings);
    },
    setSceneState: ground.setSceneState,
    dispose() {
      ground.splatTexture.dispose();
    },
  };

  return material;
}
