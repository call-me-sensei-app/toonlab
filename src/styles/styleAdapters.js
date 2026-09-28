import { applyToonShader } from '../toon/toonMaterialAdapter.js';
import { applyEnvironmentShader } from '../environment/environmentMaterialAdapter.js';
import {
  applyUrbanPropShaderProfile,
  classifyUrbanMaterial,
  createUrbanAnimePropMaterial,
  createUrbanAnimePropNodeMaterial,
  createUrbanPropShaderControls,
} from '../environment/urbanPropMaterial.js';
import { applyGroundShader } from '../ground-shader/groundShaderMaterial.js';
import { applyRockShader } from '../rock-shader/rockShaderRuntime.js';
import { applyVegetationShaderScope } from '../vegetation/vegetationShaders.js';

function applyWater(subject, settings) {
  if (settings?.style && typeof subject?.setStyle === 'function') {
    return subject.setStyle(settings.style);
  }
  if (typeof subject?.applySettings === 'function') return subject.applySettings(settings);
  throw new TypeError('The water style target must expose setStyle() or applySettings().');
}

function applySky(subject, settings) {
  if (settings?.style && typeof subject?.setStyle === 'function') {
    return subject.setStyle(settings.style);
  }
  if (typeof subject?.applySettings === 'function') return subject.applySettings(settings);
  if (typeof subject?.applyPreset === 'function') return subject.applyPreset(settings);
  throw new TypeError('The sky style target must expose setStyle(), applySettings(), or applyPreset().');
}

function applyCloud(subject, settings) {
  if (typeof subject?.toParams === 'function' && typeof subject?.applyPreset === 'function') {
    const current = subject.toParams();
    return subject.applyPreset({ ...current, cloud: { ...current.cloud, ...settings } });
  }
  if (typeof subject?.applySettings === 'function') return subject.applySettings(settings);
  throw new TypeError('The cloud style target must be a SkySystem or expose applySettings().');
}

function applyManufacturedSurface(root, settings, { target } = {}) {
  const controls = createUrbanPropShaderControls('source');
  applyUrbanPropShaderProfile(controls, settings);
  const useNodes = target?.renderer?.isWebGPURenderer === true
    || target?.labels?.renderer === 'webgpu';
  const createMaterial = useNodes
    ? createUrbanAnimePropNodeMaterial
    : createUrbanAnimePropMaterial;
  let applied = 0;
  root?.traverse?.((object) => {
    if (!object?.isMesh || !object.material) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    // `classifyUrbanPropSurface` returns a PROFILE ID string, and the adapter's
    // `classification` parameter takes a classification OBJECT. Passing the
    // string meant `classificationForAdapter` saw a non-object, found no
    // `surface` either, and fell all the way through to its
    // `paintedMetal` default — so every material converted through the
    // documented style-bundle path resolved to one profile regardless of its
    // semantic role. §8 requires the opposite ("every material receives
    // semantic ToonLab roles before the Manufactured Surface shader is
    // applied"), and the manifest written by
    // `applyManufacturedMaterialManifest` was reaching this call and then
    // being discarded one frame later. See D19-080.
    const next = materials.map((material) => createMaterial(material, {
      classification: classifyUrbanMaterial(object, material),
      controls,
    }));
    object.material = Array.isArray(object.material) ? next : next[0];
    object.castShadow = true;
    object.receiveShadow = true;
    applied += next.length;
  });
  return { applied, controls };
}

function applyPost(subject, settings) {
  if (typeof subject?.setSettings !== 'function') {
    throw new TypeError('The post style target must expose setSettings().');
  }
  return subject.setSettings(settings);
}

function applyLighting(subject, settings) {
  if (typeof subject?.setStyle !== 'function') {
    throw new TypeError('The lighting style target must expose setStyle().');
  }
  return subject.setStyle(settings);
}

function refreshCharacterRenderIntegration(root) {
  return root?.userData?.toonlabCharacterStyleIntegration?.refresh?.();
}

function applyCharacter(root, settings) {
  const result = applyToonShader(root, { settings });
  refreshCharacterRenderIntegration(root);
  return result;
}

function applyGround(subject, settings) {
  const report = applyGroundShader(subject, settings);
  if (report.applied === 0 || report.skipped > 0) {
    throw new Error(
      `Ground style target was not fully converted (${report.applied} applied, ${report.skipped} skipped).`,
    );
  }
  let groundFieldWriters = 0;
  subject?.traverse?.((object) => {
    if (!object?.isMesh) return;
    // The domain label is the developer's explicit classification. Make every
    // mesh beneath that target publish its unlit surface color so grass and
    // other bundle consumers work without a second scene-specific flag.
    object.userData.groundFieldWrite = true;
    groundFieldWriters += 1;
  });
  return { ...report, groundFieldWriters };
}

function applyGrass(subject, shaderSettings, { resolvedSettings } = {}) {
  const fieldSettings = resolvedSettings?.grass;
  const fieldResult = fieldSettings && typeof subject?.applySettings === 'function'
    ? subject.applySettings(fieldSettings)
    : null;
  const shaderResult = applyVegetationShaderScope(subject, 'grass', shaderSettings);
  return { field: fieldResult, shader: shaderResult };
}

function applyTree(subject, settings) {
  if (typeof subject?.setVegetationShader === 'function') {
    return subject.setVegetationShader(settings);
  }
  return applyVegetationShaderScope(subject, 'tree', settings);
}

export const BUILT_IN_STYLE_ADAPTERS = Object.freeze({
  character: Object.freeze({
    id: 'toonlab-character',
    afterRestore: refreshCharacterRenderIntegration,
    apply: applyCharacter,
  }),
  cloud: Object.freeze({ id: 'toonlab-cloud', apply: applyCloud }),
  equipment: Object.freeze({ id: 'toonlab-equipment', apply: (root, settings) => applyToonShader(root, { settings }) }),
  lighting: Object.freeze({ id: 'toonlab-lighting', apply: applyLighting }),
  'manufactured.environment': Object.freeze({ id: 'toonlab-manufactured-environment', apply: (root, settings) => applyEnvironmentShader(root, { settings }) }),
  'manufactured.surface': Object.freeze({ id: 'toonlab-manufactured-surface', apply: applyManufacturedSurface }),
  'natural.rock': Object.freeze({ id: 'toonlab-rock', apply: applyRockShader }),
  post: Object.freeze({ id: 'toonlab-post', apply: applyPost }),
  prop: Object.freeze({ id: 'toonlab-prop', apply: (root, settings) => applyToonShader(root, { settings }) }),
  sky: Object.freeze({ id: 'toonlab-sky', apply: applySky }),
  'terrain.ground': Object.freeze({ id: 'toonlab-ground', apply: applyGround }),
  'vegetation.flower': Object.freeze({ id: 'toonlab-flower', apply: (root, settings) => applyVegetationShaderScope(root, 'flower', settings) }),
  'vegetation.grass': Object.freeze({ id: 'toonlab-grass', apply: applyGrass }),
  'vegetation.tree': Object.freeze({ id: 'toonlab-tree', apply: applyTree }),
  water: Object.freeze({ id: 'toonlab-water', apply: applyWater }),
});

export function resolveStyleTargetAdapter(domain) {
  return BUILT_IN_STYLE_ADAPTERS[String(domain ?? '').trim()] ?? null;
}

/**
 * Labels a runtime subject for bundle application. No shader callback is
 * needed for supported domains; the package owns those adapters.
 */
export function createStyleTarget(id, domain, subject, {
  adapter = null,
  labels = {},
  renderer = null,
} = {}) {
  return {
    adapter: adapter ?? resolveStyleTargetAdapter(domain),
    domain,
    id,
    labels,
    renderer,
    subject,
  };
}
