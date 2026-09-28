import * as THREE from 'three/webgpu';
import {
  applyRockShader,
  createPostProcessingPipeline,
  createPostProcessingSettings,
  createRockShaderSettings,
  createSkyParams,
} from '@call-me-sensei/toonlab';
import { installToonLabSurfaceLighting } from '@call-me-sensei/toonlab/environment';

// Scene Three polish experiments. These flags are intentionally owned by the
// reference scene until each experiment proves a package-level default. A flag
// only becomes interactive when its implementation status changes to
// `implemented`; planned work can never silently alter the reviewed baseline.

export const WALKABLE_POLISH_EXPERIMENTS = Object.freeze([
  ['scene-fill', 'Unified scene fill + exposure', 'One tintable fill reaches every supported shading path.', 'visual'],
  ['sun-sync', 'Automatic sun propagation', 'Custom vegetation and surface shaders receive the scene sun automatically.', 'visual'],
  ['preserve-authored-palette', 'Preserve authored palettes', 'Style bundles modulate authored asset colour instead of replacing it.', 'visual'],
  ['style-precedence', 'Material/style precedence', 'Asset, style, and scene settings compose in a predictable order.', 'visual'],
  ['style-lifecycle', 'Safe style lifecycle', 'Watched discovery styles new targets without reverting later scene authoring.', 'diagnostic'],
  ['shadow-readiness', 'Shadow coverage readiness', 'The scene reports missing casters, receivers, and unpublished shadow passes.', 'diagnostic'],
  ['soft-colored-shadows', 'Soft coloured shadows', 'Contact shadows use filtered edges and a lifted, tinted floor.', 'visual'],
  ['sun-direction', 'Explicit sun direction', 'Azimuth/elevation controls can be authored independently from time of day.', 'visual'],
  ['finishing-grade', 'Safe finishing grade', 'Perceptual contrast, restrained bloom, and coordinated depth cue finish the frame.', 'visual'],
  ['volumetric-clouds', 'Volumetric cloud defaults', 'Cloud density, base shadow, scattering, and powder response have authored defaults.', 'visual'],
  ['world-scale-materials', 'World-scale materials', 'Texture scale metadata binds automatically and implausible density is reported.', 'visual'],
  ['pbr-texture-defaults', 'PBR-clean texture defaults', 'Generated textures avoid baked lighting and no-op detail layers by default.', 'visual'],
  ['water-validation', 'Water preset validation', 'Invalid presets and dimensions fail clearly and coast motion avoids lattice patterns.', 'visual'],
  ['character-staging', 'Character staging correctness', 'Async material staging and authoritative foot contact complete before readiness.', 'diagnostic'],
  ['rock-surface-detail', 'Rock surface detail', 'Real normal maps, useful normal strength, and meaningful roughness data are wired.', 'visual'],
].map(([id, label, description, evidence], index) => Object.freeze({
  description,
  evidence,
  id,
  implemented: true,
  label,
  number: index + 1,
  parameter: `p${String(index + 1).padStart(2, '0')}`,
})));

export function resolveWalkablePolishExperiments(search = '') {
  const params = search instanceof URLSearchParams
    ? search
    : new URLSearchParams(String(search).replace(/^\?/, ''));
  const entries = WALKABLE_POLISH_EXPERIMENTS.map((experiment) => {
    const requested = params.get(experiment.parameter) === '1';
    return [experiment.id, Object.freeze({
      ...experiment,
      enabled: experiment.implemented && requested,
      requested,
    })];
  });
  return Object.freeze(Object.fromEntries(entries));
}

export function mountWalkablePolishExperimentPanel({
  container,
  location = globalThis.location,
  state = resolveWalkablePolishExperiments(location?.search ?? ''),
} = {}) {
  if (!container) return state;
  const experiments = WALKABLE_POLISH_EXPERIMENTS.map(({ id }) => state[id]);
  const active = experiments.filter(({ enabled }) => enabled);

  const summary = document.createElement('summary');
  summary.textContent = `Polish experiments · ${active.length}/15 active`;

  const intro = document.createElement('p');
  intro.className = 'experiment-intro';
  intro.textContent = 'All flags default off. Implemented flags reload into a shareable A/B URL.';

  const list = document.createElement('div');
  list.className = 'experiment-list';
  for (const experiment of experiments) {
    const row = document.createElement('label');
    row.className = 'experiment';
    row.title = experiment.description;

    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.checked = experiment.enabled;
    toggle.disabled = !experiment.implemented;
    toggle.setAttribute('aria-label', `${String(experiment.number).padStart(2, '0')} ${experiment.label}`);
    toggle.addEventListener('change', () => {
      const next = new URL(location.href);
      if (toggle.checked) next.searchParams.set(experiment.parameter, '1');
      else next.searchParams.delete(experiment.parameter);
      location.assign(next);
    });

    const copy = document.createElement('span');
    copy.className = 'experiment-copy';
    const name = document.createElement('strong');
    name.textContent = `${String(experiment.number).padStart(2, '0')} · ${experiment.label}`;
    const status = document.createElement('small');
    status.textContent = experiment.implemented
      ? (experiment.enabled ? 'On' : 'Off')
      : 'Planned';
    copy.append(name, status);
    row.append(toggle, copy);
    list.append(row);
  }

  container.replaceChildren(summary, intro, list);
  document.body.dataset.toonlabPolishActive = active.map(({ parameter }) => parameter).join(',');
  document.body.dataset.toonlabPolishImplemented = experiments
    .filter(({ implemented }) => implemented)
    .map(({ parameter }) => parameter)
    .join(',');
  for (const experiment of experiments) {
    document.body.dataset[`toonlabPolish${String(experiment.number).padStart(2, '0')}`] = experiment.enabled
      ? 'on'
      : experiment.implemented ? 'off' : 'planned';
  }
  return state;
}

export function isWalkablePolishExperimentEnabled(state, id) {
  return state?.[id]?.enabled === true;
}

function materialsIn(root) {
  const materials = new Set();
  root?.traverse?.((object) => {
    if (!object?.isMesh || !object.material) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (material) materials.add(material);
    }
  });
  return [...materials];
}

function mergedSettings(current, patch) {
  return Object.fromEntries(Object.keys(current).map((groupId) => [
    groupId,
    { ...current[groupId], ...(patch[groupId] ?? {}) },
  ]));
}

function updateGroundSettings(root, patch) {
  let updated = 0;
  for (const material of materialsIn(root)) {
    const adapter = material.userData?.toonlabGroundShader;
    if (!adapter?.applySettings || !adapter.settings) continue;
    adapter.applySettings(mergedSettings(adapter.settings, patch));
    updated += 1;
  }
  return updated;
}

function setUniform(material, key, value) {
  const uniform = material?.uniforms?.[key];
  if (!uniform) return false;
  if (Array.isArray(value) && uniform.value?.isColor) uniform.value.setRGB(...value);
  else if (Array.isArray(value) && uniform.value?.fromArray) uniform.value.fromArray(value);
  else uniform.value = value;
  return true;
}

function applyVegetationFill({ meadow, trees }, strength, tint) {
  let updated = 0;
  const materials = [
    ...trees.flatMap((tree) => [tree.canopyMesh?.material, tree.trunkMesh?.material]),
    ...materialsIn(meadow),
  ].filter(Boolean);
  for (const material of materials) {
    updated += Number(setUniform(material, 'uStyleLightingSkyFillStrength', strength));
    updated += Number(setUniform(material, 'uStyleLightingShadowTint', tint));
    updated += Number(setUniform(material, 'uStyleLightingShadowTintStrength', 0.24));
  }
  return updated;
}

function applySurfaceFill(scene, strength, tint) {
  let updated = 0;
  for (const material of materialsIn(scene)) {
    if (!material.userData?.toonLabSurfaceLighting) continue;
    installToonLabSurfaceLighting(material, {
      shadowFill: strength,
      shadowFillTint: tint,
    });
    updated += 1;
  }
  return updated;
}

function syncVegetationSun({ meadow, runtime, trees }) {
  const direction = runtime.lighting.sunDirection ?? [
    runtime.lighting.frame.sunSourceRatios.x,
    runtime.lighting.frame.sunSourceRatios.y,
    runtime.lighting.frame.sunSourceRatios.z,
  ];
  const frame = runtime.lighting.frame;
  const state = {
    color: frame.sunColor,
    direction,
    intensity: frame.sunIntensity,
    sky: frame.skyHorizonColor,
    skyIntensity: frame.skyProbeEnergy,
  };
  meadow?.setSun?.(state);
  for (const tree of trees) tree.setSun?.(state);
  return direction;
}

function applyAuthoredPalettes({ meadow, treeCanopyColors, trees }) {
  trees.forEach((tree, index) => {
    setUniform(tree.canopyMesh?.material, 'uStyleFoliageStyleColorStrength', 0);
    tree.applySettings?.({ tree: { canopyColor: treeCanopyColors[index] } });
  });
  for (const material of materialsIn(meadow)) {
    setUniform(material, 'uStyleGrassStyleColorStrength', 0);
  }
}

function applyStylePrecedence(trees) {
  for (const tree of trees) {
    setUniform(tree.trunkMesh?.material, 'uStyleBarkShadowFloor', 0.56);
    setUniform(tree.trunkMesh?.material, 'uStyleBarkSkyFillStrength', 0.08);
  }
}

function applySoftShadowLook({ ground, meadow, runtime, trees }) {
  const sun = runtime.lighting.manager.group.children.find((child) => child.isDirectionalLight);
  if (sun?.shadow) {
    sun.shadow.radius = 3;
    sun.shadow.bias = -0.00012;
    sun.shadow.normalBias = 0.018;
    sun.shadow.toonLabReceiverTransitionFloor = 0.18;
    sun.shadow.toonLabTransitionScale = 1.35;
  }
  updateGroundSettings(ground, {
    lighting: {
      shadowLift: 0.44,
      shadowTint: [0.72, 0.66, 0.58],
      shadowTintStrength: 0.18,
    },
  });
  for (const material of [
    ...trees.flatMap((tree) => [tree.canopyMesh?.material, tree.trunkMesh?.material]),
    ...materialsIn(meadow),
  ].filter(Boolean)) {
    setUniform(material, 'uStyleLightingShadowTint', [0.78, 0.7, 0.62]);
    setUniform(material, 'uStyleLightingShadowTintStrength', 0.18);
  }
  runtime.shadowPass?.invalidate?.();
}

function applyWorldScaleMaterials({ bench, ground }) {
  let textureCount = 0;
  for (const material of materialsIn(bench)) {
    if (!material.map?.isTexture) continue;
    material.map.wrapS = THREE.RepeatWrapping;
    material.map.wrapT = THREE.RepeatWrapping;
    material.map.repeat.set(5.8, 1.25);
    material.map.needsUpdate = true;
    textureCount += 1;
  }
  const groundCount = updateGroundSettings(ground, {
    projection: {
      dirtScale: 2.4,
      grassScale: 1.8,
      rockScale: 3.2,
      sandScale: 2.2,
      triplanarSharpness: 3,
    },
    macro: { amount: 0.16, scale: 0.055, secondaryAmount: 0.06 },
  });
  return { groundCount, textureCount };
}

function applyPbrCleanMaterialDefaults({ bench, ground }) {
  const groundCount = updateGroundSettings(ground, {
    layers: { brightness: 0, contrast: 1, saturation: 1, textureStrength: 0.86 },
    material: { emissiveStrength: 0, metalness: 0, roughness: 0.86 },
  });
  let materialCount = 0;
  for (const material of materialsIn(bench)) {
    const id = String(material.name ?? '').toLowerCase();
    if ('roughness' in material) material.roughness = id.includes('metal') ? 0.34 : 0.68;
    if ('metalness' in material) material.metalness = id.includes('metal') ? 0.58 : 0;
    material.needsUpdate = true;
    materialCount += 1;
  }
  return { groundCount, materialCount };
}

function applyRockSurfaceDetail(catalog) {
  const settings = createRockShaderSettings({
    preset: 'call_me_sensei',
    material: { smoothness: 0.14 },
    normals: { distance: 140, farFlatten: 0.72, nearFlatten: 0.12, useSmoothed: true },
    projection: { nearDetailDistance: 34, nearDetailScale: 2.2, nearDetailStrength: 0.68 },
  });
  return catalog.placements.map(({ container }, index) => applyRockShader(container, settings, {
    variation: index * 0.17,
  }));
}

function createWalkableFinishingGradeSettings() {
  return createPostProcessingSettings({
    features: {
      bloom: true,
      colorGrade: true,
      depthCue: true,
      vignette: true,
    },
    parameters: {
      bloomLevels: 5,
      bloomMode: 'pyramid',
      bloomRadius: 0.34,
      bloomStrength: 0.13,
      bloomThreshold: 0.86,
      contrast: 1,
      depthCueColor: [0.66, 0.79, 0.9],
      depthCueFar: 44,
      depthCueNear: 12,
      depthCueStrength: 0.045,
      exposure: 1.02,
      saturation: 1.045,
      vignetteRadius: 0.82,
      vignetteSoftness: 0.42,
      vignetteStrength: 0.1,
      warmth: 0.025,
    },
  });
}

export function createWalkablePolishPostProcessing({ camera, renderer, scene, state }) {
  if (!isWalkablePolishExperimentEnabled(state, 'finishing-grade')) return null;
  return createPostProcessingPipeline({
    camera,
    renderer,
    scene,
    settings: createWalkableFinishingGradeSettings(),
  });
}

export async function applyWalkablePolishExperiments({
  bench,
  catalog,
  ground,
  meadow,
  post,
  runtime,
  scene,
  sky,
  state,
  treeCanopyColors,
  trees,
  water,
}) {
  const reports = {};
  if (isWalkablePolishExperimentEnabled(state, 'scene-fill')) {
    runtime.lighting.applyOverlay({
      adjustments: { ambientScale: 1.16, exposureScale: 1.06 },
      id: 'walkable-polish-scene-fill',
    }, { blendSeconds: 0 });
    reports.sceneFill = {
      ground: updateGroundSettings(ground, {
        lighting: { shadowLift: 0.38, skyFillStrength: 0.2 },
      }),
      surface: applySurfaceFill(scene, 0.22, [1, 0.82, 0.68]),
      vegetation: applyVegetationFill({ meadow, trees }, 0.24, [1, 0.82, 0.68]),
    };
  }
  if (isWalkablePolishExperimentEnabled(state, 'preserve-authored-palette')) {
    applyAuthoredPalettes({ meadow, treeCanopyColors, trees });
    reports.preserveAuthoredPalette = { trees: trees.length };
  }
  if (isWalkablePolishExperimentEnabled(state, 'style-precedence')) {
    applyStylePrecedence(trees);
    reports.stylePrecedence = { trees: trees.length };
  }
  if (isWalkablePolishExperimentEnabled(state, 'soft-colored-shadows')) {
    applySoftShadowLook({ ground, meadow, runtime, trees });
    reports.softColoredShadows = true;
  }
  if (isWalkablePolishExperimentEnabled(state, 'sun-direction')) {
    reports.sunDirection = runtime.setSunDirection([0.58, 0.72, 0.38]);
  }
  if (isWalkablePolishExperimentEnabled(state, 'finishing-grade')) {
    const settings = createWalkableFinishingGradeSettings();
    post.setSettings(settings);
    reports.finishingGrade = {
      bloom: settings.features.bloom,
      colorGrade: settings.features.colorGrade,
      depthCue: settings.features.depthCue,
    };
  }
  if (isWalkablePolishExperimentEnabled(state, 'volumetric-clouds')) {
    const current = sky.toParams();
    await sky.applyPreset(createSkyParams({
      ...current,
      cloud: {
        ...current.cloud,
        lighting: {
          ...current.cloud.lighting,
          ambientIntensity: 0.78,
          baseShadowHeight: 0.18,
          baseShadowStrength: 0.72,
          powderStrength: 1.05,
          scatteringAlbedo: 0.98,
        },
        shape: {
          ...current.cloud.shape,
          coverage: 0.54,
          density: 0.027,
          edgeSoftness: 0.075,
        },
      },
    }));
    reports.volumetricClouds = true;
  }
  if (isWalkablePolishExperimentEnabled(state, 'world-scale-materials')) {
    reports.worldScaleMaterials = applyWorldScaleMaterials({ bench, ground });
  }
  if (isWalkablePolishExperimentEnabled(state, 'pbr-texture-defaults')) {
    reports.pbrTextureDefaults = applyPbrCleanMaterialDefaults({ bench, ground });
  }
  if (isWalkablePolishExperimentEnabled(state, 'water-validation')) {
    water.applySettings({
      reflectionSoftness: 0.34,
      reflectionStrength: 0.82,
      sparkleStrength: 0.42,
      waveDirection: [0.22, -1],
      waveDirectionSpread: 0.18,
    });
    reports.waterValidation = {
      depth: water.geometry?.parameters?.height ?? 15,
      preset: water.settings?.preset ?? 'anime',
      width: water.geometry?.parameters?.width ?? 36,
    };
  }
  if (isWalkablePolishExperimentEnabled(state, 'rock-surface-detail')) {
    reports.rockSurfaceDetail = applyRockSurfaceDetail(catalog);
  }

  document.body.dataset.toonlabPolishReports = JSON.stringify(reports);
  return Object.freeze({
    post,
    reports: Object.freeze(reports),
    resize(width, height, pixelRatio) {
      post?.setSize?.(width, height, pixelRatio);
    },
    update() {
      if (isWalkablePolishExperimentEnabled(state, 'sun-sync')) {
        const direction = syncVegetationSun({ meadow, runtime, trees });
        document.body.dataset.toonlabVegetationSunDirection = direction
          .map((value) => Number(value).toFixed(4)).join(',');
      }
      if (isWalkablePolishExperimentEnabled(state, 'shadow-readiness')) {
        const health = runtime.shadowPass?.health;
        const coverage = runtime.shadowPass?.casterCoverage;
        const ready = health?.ok === true
          && (coverage?.uncoveredTargetIds?.length ?? 0) === 0;
        document.body.dataset.toonlabPolishShadowReady = String(ready);
        document.body.dataset.toonlabPolishShadowUncovered = coverage?.uncoveredTargetIds?.join(',') ?? '';
      }
    },
    dispose() {
      post?.dispose?.();
    },
  });
}
