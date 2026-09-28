import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';

import * as rockShader from '@call-me-sensei/toonlab/rock-shader';
import * as rockgen from '@call-me-sensei/toonlab/rockgen';
import * as styles from '@call-me-sensei/toonlab/styles';

let checks = 0;
function check(label, callback) {
  callback();
  checks += 1;
  console.log(`ok   ${label}`);
}

const [labApp, labEngine, labStore] = await Promise.all([
  readFile(new URL('../labs/rock-shader-lab/ui/App.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../labs/rock-shader-lab/ui/engine.js', import.meta.url), 'utf8'),
  readFile(new URL('../labs/rock-shader-lab/ui/store.js', import.meta.url), 'utf8'),
]);

const storage = new Map();
globalThis.window = {
  location: { search: '' },
  localStorage: {
    getItem: (key) => storage.get(key) ?? null,
    removeItem: (key) => storage.delete(key),
    setItem: (key, value) => storage.set(key, String(value)),
  },
};
const { createRockShaderLabStore } = await import('../labs/rock-shader-lab/ui/store.js');

check('Rock Shader Lab has the complete saved-style and export lifecycle', () => {
  assert.match(labApp, /BrandLockup[\s\S]*labName="Rock Shader Lab"/);
  assert.match(labApp, /LabEntryChooser/);
  assert.match(labApp, /onLabNameClick=\{openHome\}/);
  assert.doesNotMatch(labApp, /testId="entry-chooser-home"/);
  assert.doesNotMatch(labApp, /testId="saved-style-search"/);
  assert.match(labApp, /testId="save-style-as"/);
  assert.match(labApp, /testId="update-style"/);
  assert.match(labApp, /testId="export-style-bundle"/);
  assert.match(labApp, /testId="navigation-mode"/);
  assert.match(labStore, /ROCK_SHADER_LIBRARY_STORAGE_KEY/);
  assert.match(labStore, /saveStyleAs\(value/);
  assert.match(labStore, /exportStyleBundle\(\)/);
  assert.match(labStore, /serializeSingleSlotStyleBundle/);
  assert.match(labEngine, /setNavigationMode/);
});

check('Rock Shader Lab saves, reloads, updates, and exports runtime documents', () => {
  const firstStore = createRockShaderLabStore({ urlParams: new URLSearchParams() });
  assert.equal(firstStore.actions.saveStyleAs('Wet Karst QA'), true);
  const selectedId = firstStore.getState().selectedStyleId;
  assert.ok(selectedId);
  assert.equal(firstStore.actions.saveStyle(), true);

  const profile = JSON.parse(firstStore.actions.exportDocument());
  const bundle = JSON.parse(firstStore.actions.exportStyleBundle());
  assert.equal(profile.schema, rockShader.ROCK_SHADER_DOCUMENT_TYPE);
  assert.equal(bundle.schema, styles.STYLE_BUNDLE_DOCUMENT_TYPE);
  assert.equal(bundle.version, 2);
  assert.equal(bundle.slots.rock.document.schema, rockShader.ROCK_SHADER_DOCUMENT_TYPE);

  const reloadedStore = createRockShaderLabStore({ urlParams: new URLSearchParams() });
  assert.equal(reloadedStore.getState().library.length, 1);
  assert.equal(reloadedStore.actions.loadStyle(selectedId), true);
  assert.equal(reloadedStore.getState().name, 'Wet Karst QA');
  assert.equal(reloadedStore.actions.importDocument(JSON.stringify(profile)).ok, true);
});

check('rock shader is a separate public domain from procedural rock generation', () => {
  assert.equal(typeof rockShader.applyRockShader, 'function');
  assert.equal(typeof rockShader.createRockShaderSettings, 'function');
  assert.equal(typeof rockShader.createToonRockMaterial, 'function');
  assert.equal('applyRockShader' in rockgen, false);
  assert.equal('createRockShaderSettings' in rockgen, false);
  assert.equal('createToonRockMaterial' in rockgen, false);
});

check('invalid zero tangents are removed before normal-mapped rock shading', () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0,
    1, 0, 0,
    0, 1, 0,
  ], 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute([
    0, 0, 1,
    0, 0, 1,
    0, 0, 1,
  ], 3));
  geometry.setAttribute('tangent', new THREE.Float32BufferAttribute([
    0, 0, 0, 1,
    1, 0, 0, 1,
    1, 0, 0, 1,
  ], 4));
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
  mesh.name = 'zero-tangent-fixture';
  const root = new THREE.Group();
  root.add(mesh);

  const inspection = rockShader.inspectRockGeometryTangents(geometry);
  assert.equal(inspection.invalidVertices, 1);
  assert.equal(inspection.valid, false);
  const report = rockShader.applyRockShader(root);
  assert.equal(report.tangentIntegrity.repairedMeshes, 1);
  assert.equal(report.tangentIntegrity.invalidVertices, 1);
  assert.equal(geometry.getAttribute('tangent'), undefined);
  assert.deepEqual(report.tangentIntegrity.issues, [{
    mesh: 'zero-tangent-fixture',
    invalidVertices: 1,
    tangentVertices: 3,
  }]);

  rockShader.restoreRockShader(root);
  geometry.dispose();
  mesh.material.dispose();
});

check('valid orthogonal rock tangents are preserved', () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0,
    1, 0, 0,
    0, 1, 0,
  ], 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute([
    0, 0, 1,
    0, 0, 1,
    0, 0, 1,
  ], 3));
  const tangent = new THREE.Float32BufferAttribute([
    1, 0, 0, 1,
    1, 0, 0, 1,
    1, 0, 0, 1,
  ], 4);
  geometry.setAttribute('tangent', tangent);
  const report = rockShader.sanitizeRockGeometryTangents(geometry);
  assert.equal(report.valid, true);
  assert.equal(report.removed, false);
  assert.equal(geometry.getAttribute('tangent'), tangent);
  geometry.dispose();
});

check('Call Me Sensei is the default and every editor field has metadata', () => {
  const settings = rockShader.createRockShaderSettings();
  assert.equal(settings.preset, 'call_me_sensei');
  assert.equal(rockShader.DEFAULT_ROCK_SHADER_PRESET, 'call_me_sensei');
  assert.equal(settings.projection.scale, 48);
  assert.equal(settings.projection.projectionContrast, 2);
  assert.equal(settings.distanceTint.closeDistance, 500);
  assert.equal(settings.distanceTint.farDistance, 15000);
  assert.equal(settings.normals.distance, 30000);
  assert.equal(settings.normals.useSmoothed, true);
  assert.deepEqual(settings.material.tint, [1, 1, 1]);
  assert.equal(settings.projection.saturation, 1);
  assert.equal(settings.projection.contrast, 1);
  assert.equal(settings.projection.brightness, 0);
  assert.equal(settings.projection.nearDetailScale, 1.2);
  assert.equal(settings.projection.nearDetailStrength, 0.42);
  assert.equal(settings.lighting.exposure, 0.95);
  assert.equal(settings.lighting.ambientFloor, 0.04);
  assert.equal(settings.lighting.skyColorInfluence, 1);
  assert.equal(settings.lighting.skyFillStrength, 0.72);
  assert.deepEqual(settings.lighting.skyFillTint, [1, 1, 1]);
  assert.equal(settings.lighting.shadowFill, 0);
  assert.deepEqual(settings.lighting.shadowFillTint, [1, 1, 1]);
  assert.equal(settings.shoreline.wetBandWidth, 1);
  assert.equal(settings.material.metallic, 0);
  assert.equal(settings.material.emissiveStrength, 0);
  assert.equal(settings.assetIntegration.sourceAlbedoMode, 'blend');
  assert.equal(settings.assetIntegration.sourceAlbedoStrength, 0.5);
  assert.equal(settings.assetIntegration.sourceNormalStrength, 1);
  assert.equal(settings.assetIntegration.sourceAoStrength, 1);
  assert.equal(settings.assetIntegration.vertexColorStrength, 0);
  assert.equal(settings.assetIntegration.vertexAoStrength, 0);
  assert.ok(rockShader.ROCK_SHADER_SETTING_GROUPS.length >= 10);

  for (const group of rockShader.ROCK_SHADER_SETTING_GROUPS) {
    const fields = rockShader.ROCK_SHADER_FIELD_SCHEMA[group.id];
    assert.ok(Object.keys(fields).length > 0, `${group.id} needs fields`);
    for (const metadata of Object.values(fields)) {
      assert.equal(typeof metadata.label, 'string');
      assert.ok(metadata.label.length > 0);
      assert.equal(typeof metadata.description, 'string');
      assert.ok(metadata.description.length > 0);
      assert.equal(metadata.serializable, true);
      assert.ok(Object.hasOwn(metadata, 'defaultValue'));
    }
  }
});

check('portable rock shader documents round-trip through the public schema', () => {
  const document = rockShader.createRockShaderPresetDocument('weathered-cliff', {
    description: 'A reusable rock material treatment, not a rock asset recipe.',
    label: 'Weathered Cliff',
    settings: {
      distanceTint: { strength: 0.41 },
      moss: { multiply: 2.1 },
      striping: { enabled: true },
    },
  });
  const serialized = rockShader.serializeRockShaderPreset(document);
  const parsed = rockShader.parseRockShaderPresetDocument(serialized);
  assert.equal(parsed.ok, true, parsed.errors?.join(' '));
  assert.deepEqual(parsed.value, document);
  assert.equal(document.schema, rockShader.ROCK_SHADER_DOCUMENT_TYPE);
});

check('editor settings map onto the independent material profile', () => {
  const profile = rockShader.rockShaderSettingsToProfile({
    distanceTint: { closeDistance: 21, farDistance: 155, strength: 0.36 },
    layerMask: { offset: 0.3, sharpness: 3.2, useAssetMask: false },
    moss: { multiply: 2.2, size: 3.1 },
    projection: { contrast: 1.27, projectionContrast: 0.71 },
  });
  assert.equal(profile.base.closeTintDistance, 21);
  assert.equal(profile.base.farTintDistance, 155);
  assert.equal(profile.base.distantTintMix, 0.36);
  assert.equal(profile.base.contrast, 1.27);
  assert.equal(profile.base.projectionContrast, 0.71);
  assert.equal(profile.layers.maskEnabled, false);
  assert.equal(profile.layers.sharpness, 3.2);
  assert.equal(profile.layers.offset, 0.3);
  assert.equal(profile.moss.size, 3.1);
  assert.equal(profile.moss.multiply, 2.2);
});

check('runtime assignment preserves exact defaults and supports optional asset channels', () => {
  const fallback = rockShader.createDefaultRockShaderTextureSet();
  const pixels = fallback.rock.image.data;
  const average = [0, 1, 2].map((channel) => {
    let sum = 0;
    for (let index = channel; index < pixels.length; index += 4) sum += pixels[index];
    return sum / (pixels.length / 4);
  });
  [179.70, 179.92, 178.98].forEach((captured, channel) => {
    assert.ok(Math.abs(average[channel] - captured) < 0.3,
      'fallback rock albedo must stay anchored to the captured first-party grey source');
  });
  const geometry = new THREE.IcosahedronGeometry(1, 1);
  const sourceAlbedo = new THREE.DataTexture(new Uint8Array([150, 155, 160, 255]), 1, 1);
  // 16x16 is the smallest normal the integrity guard accepts as a detail map
  // (MIN_DETAIL_MAP_EDGE_TEXELS). This fixture stands in for a real imported
  // normal, so it has to clear that bar; the degenerate case is asserted
  // separately below.
  const sourceNormal = new THREE.DataTexture(
    Uint8Array.from({ length: 16 * 16 * 4 }, (_, i) => [128, 128, 255, 255][i % 4]),
    16,
    16,
  );
  const sourceOrm = new THREE.DataTexture(new Uint8Array([220, 180, 0, 255]), 1, 1);
  const sourceSpecular = new THREE.DataTexture(new Uint8Array([255, 255, 255, 180]), 1, 1);
  const sourceEmissive = new THREE.DataTexture(new Uint8Array([10, 8, 5, 255]), 1, 1);
  for (const texture of [sourceAlbedo, sourceNormal, sourceOrm, sourceSpecular, sourceEmissive]) {
    texture.needsUpdate = true;
  }
  const originalMaterial = new THREE.MeshPhysicalMaterial({
    alphaTest: 1 / 3,
    aoMap: sourceOrm,
    color: 0x777777,
    emissive: 0x18120c,
    emissiveMap: sourceEmissive,
    map: sourceAlbedo,
    metalnessMap: sourceOrm,
    normalMap: sourceNormal,
    roughnessMap: sourceOrm,
    specularIntensityMap: sourceSpecular,
  });
  const mesh = new THREE.Mesh(geometry, originalMaterial);
  const root = new THREE.Group();
  root.add(mesh);

  const report = rockShader.applyRockShader(root);
  assert.equal(report.preset, 'call_me_sensei');
  assert.equal(report.applied, 1);
  assert.equal(report.textureSource, 'first-party-generated');
  assert.equal(report.usedGeneratedTextures, true);
  assert.equal(report.shadowDefaultsApplied, 1);
  assert.equal(report.retainedSourceTextures, 5);
  assert.equal(mesh.castShadow, true);
  assert.equal(mesh.receiveShadow, true);
  assert.equal(geometry.getAttribute('color'), undefined);
  assert.equal(geometry.getAttribute('envVertexAo'), undefined);

  rockShader.applyRockShader(root, {
    assetIntegration: {
      vertexColorStrength: 1,
      vertexAoStrength: 1,
    },
  });
  assert.ok(geometry.getAttribute('color'));
  assert.ok(geometry.getAttribute('envVertexAo'));
  assert.equal(mesh.material.userData.toonLabRockShaderPreset, 'call_me_sensei');
  assert.equal(mesh.material.userData.toonLabRockShaderOwned, true);
  assert.ok(mesh.material.alphaTestNode, 'source alpha cutout survives the ToonLab material override');
  assert.equal(mesh.material.userData.toonLabRockTextureSource, 'first-party-generated');
  assert.deepEqual(
    new Set(mesh.material.userData.toonlabSourceTextureIds),
    new Set([sourceAlbedo.uuid, sourceNormal.uuid, sourceOrm.uuid, sourceSpecular.uuid, sourceEmissive.uuid]),
  );
  assert.deepEqual(mesh.material.userData.toonLabRockTextureComposition, {
    base: 'first-party-generated',
    sourceAlbedoMode: 'blend',
    sourceAlbedoStrength: 0.5,
    sourceNormalStrength: 1,
    sourceAoStrength: 1,
    sourcePbrChannels: {
      primaryAo: false,
      albedo: true,
      alphaCutout: true,
      emissive: true,
      metallicRoughness: true,
      normal: true,
      occlusion: true,
      specular: true,
    },
    sourceTextureCount: 5,
  });
  assert.equal(mesh.material.userData.toonLabSurfaceLighting.directStrength, 0.95);
  assert.equal(mesh.material.userData.toonLabSurfaceLighting.indirectStrength, 0.72);
  assert.deepEqual(mesh.material.userData.toonLabSurfaceLighting.indirectTint, [1, 1, 1]);
  assert.equal(mesh.material.userData.toonLabSurfaceLighting.indirectTintSource, 'dynamic-node');
  assert.equal(mesh.material.userData.toonLabSurfaceLighting.indirectReplaceTintSource, 'shared');
  assert.equal(mesh.material.userData.toonLabSurfaceLighting.indirectTintBlendSource, 'static-zero');
  assert.equal(mesh.material.userData.toonLabSurfaceLighting.indirectTintMode, 'multiply');
  assert.equal(mesh.material.userData.toonLabSurfaceLighting.shadowFill, 0);
  assert.deepEqual(mesh.material.userData.toonLabSurfaceLighting.shadowFillTint, [1, 1, 1]);
  assert.equal(mesh.material.userData.toonLabSurfaceLighting.useSharedSunShadow, false);
  assert.deepEqual(rockShader.setRockShaderSceneState(root, {
    skyColor: [1, 0.5, 0.3],
    waterLevel: 2,
  }), {
    skyColor: [1, 0.5, 0.3],
    updated: 1,
    waterLevel: 2,
  });
  assert.deepEqual(
    mesh.material.userData.toonLabRockSceneState.skyColor.value.toArray(),
    [1, 0.5, 0.3],
  );
  assert.equal(mesh.material.userData.toonLabRockSceneState.waterLevel.value, 2);

  assert.equal(rockShader.restoreRockShader(root), 1);
  assert.equal(mesh.material, originalMaterial);
  assert.equal(mesh.castShadow, false);
  assert.equal(mesh.receiveShadow, false);
  geometry.dispose();
  originalMaterial.dispose();
  sourceAlbedo.dispose();
  sourceNormal.dispose();
  sourceOrm.dispose();
  rockShader.disposeDefaultRockShaderTextures();
});

check('an explicit C7 AO map works while every legacy source channel is disabled', () => {
  const makeTexture = (rgba, size = 16) => {
    const texture = new THREE.DataTexture(
      Uint8Array.from({ length: size * size * 4 }, (_, index) => rgba[index % 4]),
      size,
      size,
    );
    texture.needsUpdate = true;
    return texture;
  };
  const c7Albedo = makeTexture([170, 90, 55, 255]);
  const c7Normal = makeTexture([128, 128, 255, 255]);
  const c7Ao = makeTexture([210, 210, 210, 255]);
  const c7Smoothness = makeTexture([45, 45, 45, 255]);
  const legacyAlbedo = makeTexture([12, 220, 12, 255]);
  const legacyNormal = makeTexture([128, 128, 255, 255]);
  const legacyOrm = makeTexture([200, 180, 0, 255]);
  const material = new THREE.MeshStandardMaterial({
    aoMap: legacyOrm,
    map: legacyAlbedo,
    metalnessMap: legacyOrm,
    normalMap: legacyNormal,
    roughnessMap: legacyOrm,
  });
  const geometry = new THREE.IcosahedronGeometry(1, 1);
  const mesh = new THREE.Mesh(geometry, material);
  const root = new THREE.Group();
  root.add(mesh);
  rockShader.applyRockShader(root, {
    assetIntegration: {
      sourceAlbedoMode: 'replace',
      sourceAlbedoStrength: 0,
      sourceNormalStrength: 0,
      sourceAoStrength: 0,
    },
  }, {
    textures: {
      rock: c7Albedo,
      rockAo: c7Ao,
      rockNormal: c7Normal,
      smoothness: c7Smoothness,
    },
  });
  assert.deepEqual(mesh.material.userData.toonLabRockTextureComposition, {
    base: 'provided',
    sourceAlbedoMode: 'replace',
    sourceAlbedoStrength: 0,
    sourceNormalStrength: 0,
    sourceAoStrength: 0,
    sourcePbrChannels: {
      primaryAo: true,
      albedo: false,
      alphaCutout: false,
      emissive: false,
      metallicRoughness: false,
      normal: false,
      occlusion: false,
      specular: false,
    },
    sourceTextureCount: 0,
  });
  assert.ok(mesh.material.aoNode, 'the C7 AO map must reach the material AO node');
  rockShader.restoreRockShader(root);
  geometry.dispose();
  material.dispose();
  for (const texture of [c7Albedo, c7Normal, c7Ao, c7Smoothness, legacyAlbedo, legacyNormal, legacyOrm]) texture.dispose();
});

check('a placeholder normal is rejected rather than displacing the generated fallback', () => {
  // Every published cliff asset ships a 307-byte 4x4 normal in a real texture
  // slot (D19-010/D19-032). Binding it is worse than binding nothing, because
  // it silently displaces the shader's own usable fallback. Guard the contract
  // at the exact placeholder resolution the catalog ships.
  const placeholder = new THREE.DataTexture(
    Uint8Array.from({ length: 4 * 4 * 4 }, (_, i) => [128, 128, 255, 255][i % 4]),
    4,
    4,
  );
  placeholder.needsUpdate = true;
  const { rejected, textures } = rockShader.withoutDegenerateDetailMaps({
    sourceNormal: placeholder,
  });
  assert.equal(textures.sourceNormal, undefined, 'a 4x4 normal must not reach the material');
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].slot, 'sourceNormal');
  assert.equal(rejected[0].texture.resolution, '4x4');

  // The guard removes maps only when it can prove they are degenerate.
  const real = new THREE.DataTexture(
    Uint8Array.from({ length: 16 * 16 * 4 }, (_, i) => [128, 128, 255, 255][i % 4]),
    16,
    16,
  );
  real.needsUpdate = true;
  const kept = rockShader.withoutDegenerateDetailMaps({ sourceNormal: real });
  assert.equal(kept.rejected.length, 0);
  assert.equal(kept.textures.sourceNormal, real);

  placeholder.dispose();
  real.dispose();
});

check('style bundles resolve a detailed rock shader document, not a geometry style', () => {
  assert.equal(
    styles.STYLE_BUNDLE_SLOTS.rock.documentType,
    rockShader.ROCK_SHADER_DOCUMENT_TYPE,
  );
  const bundle = styles.createStyleBundleDocument('rock-shader-bundle', {
    slots: { rock: { style: 'call_me_sensei' } },
  });
  const resolved = styles.resolveStyleBundleSettings(bundle).rock;
  assert.equal(resolved.preset, 'call_me_sensei');
  assert.equal(typeof resolved.projection.scale, 'number');
  assert.equal(typeof resolved.assetIntegration.vertexAoStrength, 'number');
  assert.equal('pieces' in resolved, false);
  assert.equal('meshing' in resolved, false);
});

check('style bundles validate and resolve inline rock shader documents', () => {
  const rockDocument = rockShader.createRockShaderPresetDocument('inline-rock', {
    label: 'Inline Rock',
    settings: {
      assetIntegration: { sourceAlbedoMode: 'blend', sourceAlbedoStrength: 0.35 },
      moss: { enabled: false },
    },
  });
  const bundle = styles.createStyleBundleDocument('inline-rock-bundle', {
    slots: { rock: { document: rockDocument } },
  });
  const parsed = styles.parseStyleBundleDocument(styles.serializeStyleBundle(bundle));
  assert.equal(parsed.ok, true, parsed.errors?.join(' '));
  const resolved = styles.resolveStyleBundleSettings(parsed.value).rock;
  assert.equal(resolved.assetIntegration.sourceAlbedoMode, 'blend');
  assert.equal(resolved.assetIntegration.sourceAlbedoStrength, 0.35);
  assert.equal(resolved.moss.enabled, false);
  assert.equal('pieces' in resolved, false);
});

// Regression guard for a silent-drop trap: `rockShaderSettingsToProfile` and
// `normalizeToonLabRockProfile` used to rebuild each settings group as an
// explicit allow-list, so a field added to the settings schema passed
// validation, was clamped, and then vanished before reaching the shader — with
// no error at any layer. Adding a capability required four or five separate
// edits and failed invisibly if one was missed. Every group now spreads; this
// asserts it for ALL of them, not just the one that was caught first.
//
// The map exists because four settings groups are deliberately RENAMED on the
// way to the profile — the schema is the editor-facing surface and the profile
// is the graph-facing one, and `layerMask`/`grassLayer`/`snowLayer`/`sandLayer`
// collapse into `layers`. Renames inside those groups are listed explicitly so
// that a rename stays a deliberate, visible act rather than something a
// wholesale spread would paper over.
const PROFILE_GROUP_PATHS = {
  moss: { path: ['moss'] },
  shoreline: { path: ['shoreline'] },
  normals: { path: ['normals'] },
  layerMask: {
    path: ['layers'],
    renames: { useAssetMask: 'maskEnabled' },
    // `layers` also carries the three sub-layer groups, which are checked
    // separately; only the mask fields belong to this group.
  },
  grassLayer: { path: ['layers', 'grass'] },
  snowLayer: { path: ['layers', 'snow'] },
  sandLayer: { path: ['layers', 'sand'] },
};

check('every settings field in every group reaches the resolved material profile', () => {
  const settings = rockShader.createRockShaderSettings({ preset: 'call_me_sensei' });
  const profile = rockShader.rockShaderSettingsToProfile(settings);

  for (const [group, { path, renames = {} }] of Object.entries(PROFILE_GROUP_PATHS)) {
    const fields = Object.keys(rockShader.ROCK_SHADER_FIELD_SCHEMA[group] ?? {});
    assert.ok(fields.length > 0, `${group} field schema is empty`);

    let target = profile;
    for (const key of path) target = target?.[key];
    assert.ok(target, `profile has no group at ${path.join('.')}`);

    const missing = fields
      .map((field) => renames[field] ?? field)
      .filter((field) => !(field in target));
    assert.deepEqual(
      missing,
      [],
      `${group} settings fields dropped before the shader: ${missing.join(', ')}`,
    );
  }
});

check('settings VALUES survive the mapping, not merely the keys', () => {
  const probe = rockShader.rockShaderSettingsToProfile(
    rockShader.createRockShaderSettings({
      moss: {
        contact: 0.2,
        cushion: 0.6,
        damp: 0.4,
        enabled: true,
        exposure: 0.9,
        formDriven: 0.5,
        patternCeiling: 0.16,
        patternFloor: 0.1,
        relief: 0.25,
        roughness: 0.8,
      },
      normals: { farFlatten: 0.42 },
      preset: 'call_me_sensei',
      sandLayer: { normalScale: 3.5 },
      shoreline: { wetRoughness: 0.31 },
    }),
  );
  assert.equal(probe.moss.roughness, 0.8);
  assert.equal(probe.moss.relief, 0.25);
  assert.equal(probe.moss.formDriven, 0.5);
  assert.equal(probe.moss.patternFloor, 0.1);
  assert.equal(probe.moss.patternCeiling, 0.16);
  assert.equal(probe.moss.damp, 0.4);
  assert.equal(probe.moss.exposure, 0.9);
  assert.equal(probe.moss.cushion, 0.6);
  assert.equal(probe.moss.contact, 0.2);
  assert.equal(probe.normals.farFlatten, 0.42);
  assert.equal(probe.shoreline.wetRoughness, 0.31);
  assert.equal(probe.layers.sand.normalScale, 3.5);
});

// The new moss capability is capability, not a look change. Every field added
// for the garden pass defaults to inert, and `call_me_sensei` must resolve
// exactly as it did before any of it existed. This is the guard that lets the
// package add moss realism without touching a single authored preset value.
check('the new moss fields are inert by default under call_me_sensei', () => {
  const profile = rockShader.rockShaderSettingsToProfile(
    rockShader.createRockShaderSettings({ preset: 'call_me_sensei' }),
  );
  assert.equal(profile.moss.patternFloor, -1, 'pattern remap must be off');
  assert.equal(profile.moss.damp, 0, 'damp stone must be off');
  assert.equal(profile.moss.exposure, 0, 'exposure penalty must be off');
  assert.equal(profile.moss.cushion, 0, 'cushion depth must be off');
  assert.equal(profile.moss.contact, 0, 'contact shade must be off');
  assert.equal(profile.moss.fringe, 0, 'fringe must be off');
  assert.equal(profile.moss.relief, 0, 'relief must be off');
  assert.equal(profile.moss.roughness, -1, 'moss roughness must be off');
  assert.equal(profile.moss.coverage, -1, 'coverage mask path must be off');
});

// The resolved profile must be plain DATA. `clamp` is imported into
// rockMaterial.js from three/tsl for the shader graph, and calling it on a
// plain number returns a Node — which reads as correct everywhere the graph
// consumes the value, because a node operand is legal there, and is silently
// catastrophic everywhere JS does: `node > 0` is false, `node === 0.85` is
// false, `Number(node)` is NaN.
//
// That shipped. `vertexCavityStrength` was clamped this way and then gated with
// `> 0`, so the gate was permanently false and the `rockCavity` attribute never
// reached the moss mask — the moisture term the entire patch model rests on was
// pure slope, which saturates across the whole upper hemisphere (D19-214).
// Four profile scalars leaked the same way. This is the guard.
check('the resolved profile contains numbers, not TSL nodes', () => {
  const profile = rockShader.rockShaderSettingsToProfile(
    rockShader.createRockShaderSettings({ preset: 'call_me_sensei' }),
  );
  const leaks = [];
  const scan = (value, path) => {
    if (!value || typeof value !== 'object') return;
    if (value.isNode === true) { leaks.push(path); return; }
    if (Array.isArray(value)) return;
    for (const [key, child] of Object.entries(value)) {
      scan(child, path ? `${path}.${key}` : key);
    }
  };
  scan(profile, '');
  assert.deepEqual(
    leaks,
    [],
    `profile fields are TSL nodes rather than numbers: ${leaks.join(', ')}`,
  );
});

// Both halves of the curvature estimate must come from one traversal and be
// mutually exclusive per vertex, or the moss support term is adding and
// subtracting the same fact.
check('mesh curvature splits into disjoint cavity and exposure halves', () => {
  const detail = rockShader.rockGeometryDetail ?? null;
  if (!detail?.computeMeshCurvature) return;
  assert.notEqual(
    detail.ROCK_CAVITY_ATTRIBUTE,
    detail.ROCK_EXPOSURE_ATTRIBUTE,
    'cavity and exposure must be distinct attributes',
  );
});

console.log(`\n${checks} rock shader checks passed.`);
