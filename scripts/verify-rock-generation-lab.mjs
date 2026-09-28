import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const index = await read('rock-lab/index.html');
const app = await read('labs/rock-generation-lab/ui/App.jsx');
const appCss = await read('labs/rock-generation-lab/ui/app.css');
const iconSource = await read('labs/shared/ui/components/Icon.jsx');
const engine = await read('labs/rock-generation-lab/ui/engine.js');
const main = await read('labs/rock-generation-lab/ui/main.jsx');
const store = await read('labs/rock-generation-lab/ui/store.js');
const catalog = await read('labs/rock-generation-lab/ui/catalog.js');
const catalogInventory = await read('labs/rock-generation-lab/ui/catalogInventory.generated.js');
const catalogSourceMesh = await read('labs/rock-generation-lab/ui/catalogSourceMesh.js');
const rockPbrTextures = await read('labs/rock-generation-lab/ui/rockPbrTextures.js');
const c7CatalogSurface = await read('labs/rock-generation-lab/ui/c7CatalogSurface.js');
const rockGrassPreview = await read('labs/rock-generation-lab/ui/rockGrassPreview.js');
const thumbnailAssets = await read('labs/rock-generation-lab/ui/thumbnailAssets.js');
const stylePreference = await read('labs/shared/stylePreference.js');
const source = [index, app, engine, main, store, catalog, catalogInventory, catalogSourceMesh, rockPbrTextures, rockGrassPreview, thumbnailAssets].join('\n');
const catalogModule = await import('../labs/rock-generation-lab/ui/catalog.js');
const { ROCK_GALLERY_INVENTORY } = await import(
  '../labs/rock-generation-lab/ui/catalogInventory.generated.js'
);
const catalogSourceMeshModule = await import('../labs/rock-generation-lab/ui/catalogSourceMesh.js');
await catalogSourceMeshModule.whenCatalogTopologyReady();
const rockPbrTexturesModule = await import('../labs/rock-generation-lab/ui/rockPbrTextures.js');
const rockGrassPreviewModule = await import('../labs/rock-generation-lab/ui/rockGrassPreview.js');
const rockgenModule = await import('../src/rockgen/index.js');

const tileableLayeredMaps = rockgenModule.createC7GeologyMapData({
  geology: 'layered-sandstone',
  seed: 811,
  size: 128,
});
assert.ok(
  tileableLayeredMaps.audit.tileEdgeMeanAbsoluteDelta.horizontal < 0.08
    && tileableLayeredMaps.audit.tileEdgeMeanAbsoluteDelta.vertical < 0.08,
  'legacy layered-sandstone maps must be seamless at both repeat boundaries',
);
assert.match(
  c7CatalogSurface,
  /surfacePackage\.geology === 'layered-sandstone'[\s\S]*\? 'directional-bedding'/,
  'layered sandstone must use the lateral directional-bedding sampler to avoid low-poly projection seams',
);
assert.match(
  c7CatalogSurface,
  /runtimeProjectionContrast[\s\S]*\? 0\.05/,
  'layered sandstone must use a face-independent lateral blend to avoid polygon-aligned projection seams',
);

const storage = new Map();
globalThis.window = {
  location: { search: '' },
  localStorage: {
    getItem: (key) => storage.get(key) ?? null,
    removeItem: (key) => storage.delete(key),
    setItem: (key, value) => storage.set(key, String(value)),
  },
};
const storeModule = await import('../labs/rock-generation-lab/ui/store.js');
const {
  CATALOG_SURFACE_PRESET_OPTIONS,
  catalogSurfacePresetValue,
  createRockGenerationStore,
} = storeModule;

assert.match(index, /labs\/rock-generation-lab\/ui\/main\.jsx/);
assert.match(index, /id="stage"/);
assert.doesNotMatch(index, /labs\/shared\/entry\.js/);

const allowedRockgenImports = new Set([
  '../../../src/rockgen/index.js',
  '../../../src/rockgen/experimental/geology-v2/surface/c8First12Surface.node.js',
]);
for (const moduleSource of [app, engine, store]) {
  for (const match of moduleSource.matchAll(/from ['"]([^'"]*rockgen[^'"]*)['"]/g)) {
    assert.ok(
      allowedRockgenImports.has(match[1]),
      'Rockgen calls must use its public barrel or the explicit repository-only C8 compiler.',
    );
  }
}

assert.match(engine, /meshDocument/);
assert.match(engine, /vertexColors: true/);
assert.match(engine, /previewAssetSource = 'toonlab-rockgen'/);
assert.match(engine, /previewAssetSource = 'toonlab-official-glb'/);
assert.match(catalogSourceMesh, /GLTFLoader/);
assert.match(catalogSourceMesh, /KTX2Loader/);
assert.match(catalogSourceMesh, /deformCatalogGeometry/);
assert.match(app, /testId="preset-select"/);
assert.match(app, /testId="style-select"/);
assert.match(app, /testId="seed-input"/);
assert.match(app, /testId="resolution-select"/);
assert.match(app, /<LabEditorHeader className="rg-topbar" menus=\{menus\}/);
assert.match(app, /<StyleBundlePicker onChange=\{\(\{ id \}\) => actions\.applyStyleBundle\(id\)\} \/>/);
assert.match(stylePreference, /const hostedLab = window\.location\.pathname\.startsWith\('\/labs\/'\)/);
assert.match(app, /from '\.\/thumbnailAssets\.js'/);
assert.match(thumbnailAssets, /catalog\/thumbs\/rock-boulder\.webp/);
assert.match(app, /'update-local' : 'save-local'/);
assert.match(app, /id: 'save-local-as'/);
assert.match(app, /id: 'delete-local'/);
assert.match(app, /id: 'export-glb'/);
assert.match(app, /label: 'File'/);
assert.match(app, /label: 'Edit'/);
assert.match(app, /label: 'View'/);
assert.match(app, /data-testid="rock-home-screen"/);
assert.match(app, /testId="home-saved-search"/);
assert.match(app, /testId="navigation-mode"/);
assert.match(app, /testId="catalog-top-finish"/);
assert.match(app, /testId="catalog-surface-preset"/);
assert.equal((app.match(/Vary current rock/g) ?? []).length, 1, 'Current-rock variation belongs only in the Variation inspector.');
assert.match(app, /Fresh variation from template/);
assert.match(app, /Compare with original/);
assert.match(app, /data-testid="catalog-surface-inspector"/);
assert.match(app, /PBR texture maps/);
assert.match(app, /Weathering overlays/);
assert.match(app, /Preview meadow grass/);
assert.match(app, /testId="catalog-grass-preview-toggle"/);
assert.match(app, /Surface color adaptation/);
assert.match(engine, /createEnvironmentGroundFieldPass/);
assert.match(engine, /createRockMeadowGrassPreview/);
assert.match(appCss, /\.rg-inspector > \.rg-quick-field \+ \.rg-quick-field/);
assert.match(app, /data-testid="catalog-sculpt-tool"/);
assert.match(app, /data-testid=\{`catalog-sculpt-tool-\$\{tool\.value\}`\}/);
assert.match(app, /label: 'Resize', value: 'resize'/);
assert.match(app, /label: 'Drill', value: 'drill'/);
for (const label of [
  'Clay build-up', 'Scrape / chisel', 'Pinch / crease', 'Crack', 'Noise / roughen',
  'Erode', 'Terrace / strata', 'Trim / slice', 'Split / fracture', 'Fill hole',
  'Boolean union', 'Remesh', 'Subdivide', 'Decimate', 'Mirror', 'Settle / ground',
  'Mask / protect', 'Select component', 'Rotate', 'Measure',
]) {
  assert.ok(app.includes(`label: '${label}'`), `${label} must be available in the floating tool palette`);
}
const sculptToolBlock = app.match(/const CATALOG_MESH_TOOLS = Object\.freeze\(\[([\s\S]*?)\n\]\);/);
assert.ok(sculptToolBlock, 'mesh tool definitions must remain inspectable');
const sculptToolIcons = [...sculptToolBlock[1].matchAll(/icon: '([^']+)'/g)].map((match) => match[1]);
assert.equal(sculptToolIcons.length, 27, 'the grouped palettes must expose all 27 mesh tools');
assert.equal(new Set(sculptToolIcons).size, sculptToolIcons.length, 'every sculpt tool must use a distinct icon');
for (const iconName of sculptToolIcons) {
  assert.ok(
    iconSource.includes(`'${iconName}':`) || iconSource.includes(`  ${iconName}:`),
    `${iconName} must exist in the shared Lab SVG icon set`,
  );
}
assert.match(app, /aria-label="Drill hole depth"/);
assert.match(app, /aria-label="Drill wall roughness"/);
assert.match(app, /testId="catalog-drill-through"/);
assert.match(store, /normalizedMeshOperationOrder\(current\.reference\)/);
assert.match(engine, /serializeCatalogGeometry\(gesture\.drilledGeometry, gesture\.meshIndex\)/);
assert.match(app, /click for one bore or drag to carve a connected freeform opening/);
assert.match(app, /aria-label=\{`\$\{tool\.label\}\. \$\{tool\.description\}`\}/);
assert.match(app, /aria-pressed=\{sculpt\.tool === tool\.value\}/);
assert.match(app, /className="rg-sculpt-tool-tooltip"/);
assert.doesNotMatch(app, /options=\{CATALOG_MESH_TOOLS\}/);
assert.doesNotMatch(app, /rg-sculpt-tool-menu__heading/);
assert.match(appCss, /\.rg-sculpt-tool-menu/);
assert.match(appCss, /grid-template-columns: repeat\(var\(--rg-tool-columns, 3\), 38px\)/);
assert.match(appCss, /\.rg-sculpt-tool-button:hover \.rg-sculpt-tool-tooltip/);
assert.match(app, /data-testid="catalog-sculpt-inspector"/);
assert.match(app, /Nature evidence/);
assert.match(app, /Morphology reference — not a copied texture/);
assert.doesNotMatch(app, /provenance\.image/);
assert.doesNotMatch(app, /Nature reference:/);
assert.match(app, /Nature referenced/);
assert.match(engine, /setSculptOptions/);
assert.match(engine, /commitCatalogMeshEdit/);
assert.match(app, /Stylized rock catalog/);
assert.match(app, /Generate without a physical template/);
assert.match(app, /Template-based procedural generation/);
assert.match(app, /ROCK_VARIATION_CATALOG\.length \|\| 580/);
assert.match(app, /BrandLockup[\s\S]*labName="Rock & Cliff Generation"/);
assert.match(app, /onLabNameClick=\{\(\) => actions\.setHomeOpen\(true\)\}|onLabNameClick=\{openHome\}/);
assert.doesNotMatch(app, /label="Open rock home"/);
assert.match(store, /serializeRockDocument/);
assert.match(store, /deserializeRockDocument/);
assert.match(store, /exportDocumentToGLB/);
assert.match(store, /LIBRARY_STORAGE_KEY/);
assert.match(store, /saveLocal\(\)/);
assert.match(store, /saveLocalAs\(value/);
assert.match(store, /deleteLocal\(\)/);
assert.match(store, /startCatalogVariation\(id/);
assert.match(store, /regenerateCatalogVariation\(\)/);
assert.match(store, /importDocument\(text\)/);
assert.match(store, /exportJson\(\)/);
assert.match(engine, /setNavigationMode/);
assert.match(catalog, /pathname[\s\S]*startsWith\('\/labs\/'\)[\s\S]*\/api\/v1\/rock-catalog/);
assert.equal(ROCK_GALLERY_INVENTORY.length, 480);
const C8_TAXONOMY = JSON.parse(await read(
  'src/rockgen/experimental/geology-v2/morphology-taxonomy.v1.json',
));
const C8_GALLERY_FIXTURES = C8_TAXONOMY.subtypes.map(({ familyId, id: assetId }, index) => {
  const id = `rock-c8-${assetId}`;
  const geometrySha256 = `${index + 10}`.padStart(64, '0');
  const releaseBase = `https://assets.toonlab.io/official/2026-09-c8-first100-v2/${id}`;
  return {
    download_url: `${releaseBase}/rock.glb`,
    id,
    metadata: {
      dimensionsMeters: { depth: 1.2, height: 2.4, width: 1.6 },
      familyId,
      natureProvenance: assetId === 'hoodoo-caprock' ? {
        authorities: [{
          claim: 'Recognized weathering morphology.',
          url: 'https://whc.unesco.org/en/list/640/',
        }],
        generatedViewsAreGeologyEvidence: false,
        publicImage: {
          sha256: 'a'.repeat(64),
          url: 'https://assets.toonlab.io/official/nature-evidence/hoodoo-caprock.jpg',
        },
        observedFeatures: ['resistant cap', 'narrower weathered column'],
        rationale: 'The resistant cap and narrower column establish the hoodoo morphology.',
        relationship: 'morphology-reference-not-texture-source',
        source: {
          author: 'Reference photographer',
          license: 'CC BY-SA 4.0',
          licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
          rights: 'Attribution required.',
          title: 'Hoodoo morphology reference',
          url: 'https://commons.wikimedia.org/wiki/File:Hoodoo.jpg',
        },
      } : null,
      packages: { callMeSenseiRuntime: `${releaseBase}/material-config.json` },
      profileId: `${assetId}-profile`,
      recipe: {
        generator: { kind: 'editable-control-mesh', seed: 81017 + (index * 12), unit: 'metre' },
        geometry: { control: 'control.glb', retainedHigh: 'retained-high.glb', sha256: geometrySha256 },
        material: {
          profileId: `${assetId}-profile`,
          projection: {
            characteristicMetres: 1.8,
            mode: 'triplanar',
            scaleMetres: 1.1,
            upAxis: 'y',
          },
          seed: 81017 + (index * 12),
        },
        output: { mapResolution: 1024 },
        schema: 'toonlab/rock-gallery-recipe',
        version: 1,
      },
      recipeHash: `${index + 480}`.padStart(64, '0'),
      revision: 1,
      taxonomy: { geology: `${assetId}-geology` },
    },
    name: assetId.replaceAll('-', ' '),
    release: '2026-09-c8-first100-v2',
    sha256: geometrySha256,
    source_id: assetId,
    tags: ['rock', familyId, 'realistic-geology', 'editable'],
    thumbnail_url: `${releaseBase}/thumbnail.png`,
  };
});
const LEGACY_GALLERY_FIXTURES = ROCK_GALLERY_INVENTORY.map((entry, index) => {
  const id = `rock-${String(index + 1).padStart(4, '0')}`;
  const familyId = entry.variationId.replace(/_\d{4}$/u, '').replaceAll('_', '-');
  return {
    download_url: `https://assets.toonlab.io/official/2026-08/${id}/rock.glb`,
    id,
    metadata: {
      dimensionsMeters: {
        depth: 0.8 + ((index % 5) * 0.1),
        height: 1.2 + ((index % 7) * 0.2),
        width: 1 + ((index % 3) * 0.15),
      },
      familyId,
      recipe: { generator: { seed: index + 1 } },
      recipeHash: `${index}`.padStart(64, '0'),
      revision: 1,
      taxonomy: { geology: entry.geology },
    },
    name: entry.label,
    release: '2026-08',
    tags: entry.tags,
    thumbnail_url: `https://assets.toonlab.io/official/2026-08/${id}/thumbnail.png`,
  };
});
const ALL_GALLERY_FIXTURES = [...LEGACY_GALLERY_FIXTURES, ...C8_GALLERY_FIXTURES];
const catalogRequests = [];
globalThis.fetch = async (url) => {
  catalogRequests.push(String(url));
  const offset = String(url).includes('offset=500') ? 500 : 0;
  return {
    ok: true,
    async json() {
      return {
        items: ALL_GALLERY_FIXTURES.slice(offset, offset + 500),
        total: ALL_GALLERY_FIXTURES.length,
      };
    },
  };
};
await catalogModule.loadRockVariationCatalog();
assert.deepEqual(catalogRequests, [
  '/api/toonlab/catalog?kind=model&source=toonlab-rock&limit=500',
  '/api/toonlab/catalog?kind=model&source=toonlab-rock&limit=500&offset=500',
]);
assert.equal(catalogModule.ROCK_VARIATION_CATALOG.length, 580);
assert.equal(new Set(catalogModule.ROCK_VARIATION_CATALOG.map((entry) => entry.id)).size, 580);
assert.equal(catalogModule.ROCK_VARIATION_CATALOG[0].id, 'rock-0001');
assert.equal(
  catalogModule.ROCK_VARIATION_CATALOG.at(-1).id,
  [...C8_GALLERY_FIXTURES].sort((left, right) => left.id.localeCompare(right.id)).at(-1).id,
);
assert.equal(catalogModule.ROCK_VARIATION_FAMILIES.length, 47);
for (const [entryIndex, sourceEntry] of ROCK_GALLERY_INVENTORY.entries()) {
  const adaptedEntry = catalogModule.ROCK_VARIATION_CATALOG[entryIndex];
  const galleryId = `rock-${String(entryIndex + 1).padStart(4, '0')}`;
  assert.equal(adaptedEntry.id, galleryId);
  assert.equal(adaptedEntry.variationId, galleryId);
  assert.equal(adaptedEntry.label, sourceEntry.label);
  assert.equal(adaptedEntry.file, 'rock.glb');
  assert.equal(adaptedEntry.geology, sourceEntry.geology);
  assert.equal(adaptedEntry.galleryId, galleryId);
  assert.equal(adaptedEntry.thumbnailUrl, `https://assets.toonlab.io/official/2026-08/${galleryId}/thumbnail.png`);
  assert.equal(adaptedEntry.modelUrl, `https://assets.toonlab.io/official/2026-08/${galleryId}/rock.glb`);
  assert.equal(adaptedEntry.sourceMode, 'official-glb');
  assert.equal(adaptedEntry.sourceVersion, '2026-08');
  assert.deepEqual(adaptedEntry.tags, sourceEntry.tags);
}

// ToonLab Pro exposes the same releases through its camelCase public API.
// Exercise that adapter independently so repository parity cannot mask a
// hosted-only boot failure.
const PRO_GALLERY_FIXTURES = ALL_GALLERY_FIXTURES.map((entry) => {
  const metadata = entry.metadata ?? {};
  const releaseBase = new URL('.', entry.download_url).href;
  const c8 = metadata.recipe?.schema === 'toonlab/rock-gallery-recipe';
  return {
    artifacts: [
      ...(c8 ? [{ download: entry.download_url, name: 'rock.glb', sha256: entry.sha256 }] : []),
      {
        download: c8 ? `${releaseBase}control.glb` : entry.download_url,
        name: c8 ? 'control.glb' : 'rock.glb',
        sha256: entry.sha256,
      },
      { download: `${releaseBase}material-config.json`, name: 'material-config.json' },
    ],
    dimensionsMeters: metadata.dimensionsMeters,
    editorPreset: entry.id === 'rock-c8-arch-sandstone' ? '' : metadata.editor?.preset,
    familyId: entry.id === 'rock-c8-arch-sandstone' ? 'arch-sandstone' : metadata.familyId,
    id: entry.id,
    name: entry.name,
    natureProvenance: metadata.natureProvenance,
    recipe: metadata.recipe,
    recipeHash: metadata.recipeHash,
    revision: metadata.revision,
    surfacePackage: metadata.surfacePackage,
    tags: entry.tags,
    taxonomy: metadata.taxonomy,
    thumbnailUrl: entry.thumbnail_url,
  };
});
const proCatalogRequests = [];
window.location.pathname = '/labs/rock';
globalThis.fetch = async (url) => {
  proCatalogRequests.push(String(url));
  return {
    ok: true,
    async json() { return { assets: PRO_GALLERY_FIXTURES }; },
  };
};
await catalogModule.loadRockVariationCatalog({ force: true });
assert.deepEqual(proCatalogRequests, ['/api/v1/rock-catalog']);
assert.equal(catalogModule.ROCK_VARIATION_CATALOG.length, 580);
assert.equal(catalogModule.getRockVariationCatalogEntry('rock-0001').modelUrl, LEGACY_GALLERY_FIXTURES[0].download_url);
assert.equal(
  catalogModule.getRockVariationCatalogEntry('rock-c8-hoodoo-caprock').modelUrl,
  'https://assets.toonlab.io/official/2026-09-c8-first100-v2/rock-c8-hoodoo-caprock/control.glb',
);
window.location.pathname = '';
assert.ok(catalogModule.searchRockVariationCatalog({ text: 'weathered-limestone' }).length > 0);
assert.ok(catalogModule.searchRockVariationCatalog({ text: 'fragments' }).length > 0);
assert.equal(
  catalogModule.searchRockVariationCatalog({ text: 'rock-0001' })[0].id,
  'rock-0001',
);
const generated = catalogModule.createCatalogVariationDocument('rock-0480', { variation: 2 });
assert.equal(generated.type, 'toonlab/rockgen-project');
assert.equal(generated.name, 'Isolated Peak 3 Variation 3');
assert.equal(generated.reference.sourceMode, 'mesh-template');
assert.equal(generated.reference.id, 'rock-0480');
assert.equal(generated.reference.variation, 0.3);
assert.equal(generated.reference.surfaceMode, 'generated');
assert.equal(generated.reference.topFinish, 'bare');
assert.equal(generated.reference.surfacePackage.schema, 'toonlab/c7-geology-surface');
assert.equal(generated.reference.surfacePackage.geology, 'alpine-granite');
assert.equal(generated.surface.pbrTexturePreset, 'none');
assert.equal(generated.surface.mossCoverage, 0);
const c8Generated = catalogModule.createCatalogVariationDocument('rock-c8-hoodoo-caprock');
assert.equal(c8Generated.reference.surfacePackage.schema, 'toonlab/c8-first100-geology-surface');
assert.equal(c8Generated.reference.surfacePackage.assetId, 'hoodoo-caprock');
assert.equal(
  c8Generated.reference.surfacePackage.geometrySha256,
  C8_GALLERY_FIXTURES.find((entry) => entry.id === 'rock-c8-hoodoo-caprock').sha256,
);
assert.equal(
  catalogModule.getRockVariationCatalogEntry('rock-c8-hoodoo-caprock').modelUrl,
  'https://assets.toonlab.io/official/2026-09-c8-first100-v2/rock-c8-hoodoo-caprock/control.glb',
);
const c8Provenance = catalogModule.getRockVariationCatalogEntry('rock-c8-hoodoo-caprock').natureProvenance;
assert.equal(c8Provenance.schema, 'toonlab/nature-provenance');
assert.equal(c8Provenance.publicImageStatus, 'approved');
assert.equal(c8Provenance.image.url, 'https://assets.toonlab.io/official/nature-evidence/hoodoo-caprock.jpg');
assert.deepEqual(c8Provenance.observedFeatures, ['resistant cap', 'narrower weathered column']);
assert.equal(c8Generated.reference.natureProvenance, undefined, 'Evidence belongs to the catalog entry, not the editable recipe.');
assert.equal(catalogModule.getRockVariationCatalogEntry('rock-c8-tor-block-pile').natureProvenance, null);
assert.ok(catalogModule.searchRockVariationCatalog({ text: 'resistant cap' })
  .some((entry) => entry.id === 'rock-c8-hoodoo-caprock'));
assert.ok(rockgenModule.ROCK_PBR_TEXTURE_PRESETS.length >= 10);
assert.ok(rockgenModule.ROCKGEN_SETTING_FIELD_SCHEMA.surface.pbrTexturePreset.options.includes('cliff-rock'));

globalThis.FileReader ??= class NodeFileReader {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((result) => {
      this.result = result;
      this.onloadend?.();
    }, (error) => {
      this.error = error;
      this.onloadend?.();
    });
  }
};
assert.match(catalogSourceMesh, /loader\.loadAsync\(entry\.modelUrl\)/);
assert.doesNotMatch(catalogSourceMesh, /createFirstPartyCatalogSourceGlb/);

const sourceGeometry = new (await import('three')).BoxGeometry(2, 3, 4, 2, 2, 2);
const variedGeometry = catalogSourceMeshModule.deformCatalogGeometry(sourceGeometry, {
  bulge: 0.03,
  leanX: 0.02,
  leanZ: -0.02,
  noiseAmplitude: 0.01,
  noiseFrequency: 1.7,
  phases: [0.1, 0.2, 0.3],
  scale: [1.02, 0.98, 1.01],
  strength: 0.3,
  taper: 0.02,
  twist: 0.03,
});
assert.equal(variedGeometry.getAttribute('position').count, sourceGeometry.getAttribute('position').count);
assert.equal(variedGeometry.index.count, sourceGeometry.index.count);
assert.notDeepEqual(
  [...variedGeometry.getAttribute('position').array],
  [...sourceGeometry.getAttribute('position').array],
);
const topologyBeforeSurface = {
  indices: variedGeometry.index.count,
  vertices: variedGeometry.getAttribute('position').count,
};
const serializedGeometry = catalogSourceMeshModule.serializeCatalogGeometry(variedGeometry, 0);
const restoredGeometry = catalogSourceMeshModule.deserializeCatalogGeometry(serializedGeometry);
assert.deepEqual(
  [...restoredGeometry.getAttribute('position').array],
  [...variedGeometry.getAttribute('position').array],
  'topology snapshots must round-trip exact edited positions',
);
assert.deepEqual([...restoredGeometry.index.array], [...variedGeometry.index.array]);
const snapshotDocument = structuredClone(generated);
snapshotDocument.reference.meshSnapshots = [serializedGeometry];
const snapshotRoundTrip = rockgenModule.deserializeRockDocument(
  rockgenModule.serializeRockDocument(snapshotDocument),
);
assert.deepEqual(snapshotRoundTrip.reference.meshSnapshots, [serializedGeometry]);
restoredGeometry.dispose();
assert.equal(catalogSourceMeshModule.applyCatalogGeneratedSurface(
  variedGeometry,
  generated.surface,
  generated.seed,
), true);
assert.ok(variedGeometry.getAttribute('color'));
assert.deepEqual({
  indices: variedGeometry.index.count,
  vertices: variedGeometry.getAttribute('position').count,
}, topologyBeforeSurface);
const authoredMaterial = new (await import('three')).MeshStandardMaterial({
  color: '#8da1b4',
  roughness: 0.47,
});
const authoredRoot = new (await import('three')).Group();
authoredRoot.add(new (await import('three')).Mesh(sourceGeometry, authoredMaterial));
const preservedVariation = catalogSourceMeshModule.createCatalogVariation({
  entry: {
    galleryId: 'qa-source',
    modelUrl: '/qa-source.glb',
    variationId: 'qa_source',
  },
  root: authoredRoot,
}, {
  preserveSourceMaterial: true,
  seed: 7,
  strength: 0,
  surface: {
    ...generated.surface,
    topColor: [0.34, 0.52, 0.2],
    topCoatStrength: 1,
  },
  surfaceMode: 'generated',
});
assert.equal(preservedVariation.meshes[0].material.color.getHex(), authoredMaterial.color.getHex());
assert.equal(preservedVariation.meshes[0].material.roughness, authoredMaterial.roughness);
assert.equal(preservedVariation.meshes[0].material.vertexColors, true);
assert.equal(preservedVariation.root.userData.toonlabCatalogVariation.preserveSourceMaterial, true);
const preservedGeometry = preservedVariation.meshes[0].geometry;
const preservedColors = preservedGeometry.getAttribute('color');
const preservedNormals = preservedGeometry.getAttribute('normal');
let tintedTopVertices = 0;
for (let index = 0; index < preservedColors.count; index += 1) {
  const color = [preservedColors.getX(index), preservedColors.getY(index), preservedColors.getZ(index)];
  if (preservedNormals.getY(index) <= generated.surface.topSlopeStart) {
    assert.deepEqual(color, [1, 1, 1], 'non-top vertices must preserve the source GLB color exactly');
  } else if (color.some((channel) => channel < 0.999)) {
    tintedTopVertices += 1;
  }
}
assert.ok(tintedTopVertices > 0, 'the top finish should tint upward-facing vertices');
preservedVariation.dispose();
authoredMaterial.dispose();
const textureRoot = new (await import('three')).Group();
const textureMesh = new (await import('three')).Mesh(
  new (await import('three')).BoxGeometry(1, 1, 1),
  new (await import('three')).MeshStandardMaterial({ color: '#714a2c' }),
);
textureMesh.geometry.getAttribute('uv').array.fill(0);
textureRoot.add(textureMesh);
const disposeTextureSet = await rockPbrTexturesModule.applyRockPbrTexture(textureRoot, {
  pbrNormalStrength: 0.7,
  pbrRoughness: 0.82,
  pbrTexturePreset: 'cliff-rock',
  pbrTextureScale: 3,
});
assert.equal(typeof disposeTextureSet, 'function');
assert.ok(textureMesh.geometry.getAttribute('uv'));
assert.ok(
  textureMesh.geometry.getAttribute('uv').array.some((value) => value !== 0),
  'generated PBR UV projection must rebake even when the sculpted source had authored UVs',
);
assert.ok(textureMesh.material.map?.isTexture);
assert.ok(textureMesh.material.normalMap?.isTexture);
assert.ok(textureMesh.material.roughnessMap?.isTexture);
assert.equal(textureMesh.material.color.getHex(), 0xffffff);
assert.equal(textureMesh.material.map.repeat.x, 3);
assert.equal(textureRoot.userData.toonlabRockPbrTexture.presetId, 'cliff-rock');
disposeTextureSet();
textureMesh.geometry.dispose();
textureMesh.material.dispose();
const meadowRoot = new (await import('three')).Group();
const meadowRock = new (await import('three')).Mesh(
  new (await import('three')).BoxGeometry(2, 1, 2),
  new (await import('three')).MeshStandardMaterial(),
);
meadowRoot.add(meadowRock);
const meadowSettings = {
  ...rockGrassPreviewModule.DEFAULT_ROCK_GRASS_PREVIEW,
  density: 18,
  enabled: true,
  heightStart: 0.4,
  maxClumps: 40,
  slopeStart: 0.5,
  spacing: 0.04,
};
const meadowPlacements = rockGrassPreviewModule.scatterRockMeadowGrass(
  meadowRoot,
  meadowSettings,
  42,
);
assert.ok(meadowPlacements.length > 0);
assert.ok(meadowPlacements.length <= meadowSettings.maxClumps);
assert.ok(meadowPlacements.every((placement) => placement.y > 0.49));
assert.ok(meadowPlacements.every((placement) => placement.normal[1] >= meadowSettings.slopeStart));
assert.deepEqual(
  rockGrassPreviewModule.scatterRockMeadowGrass(meadowRoot, meadowSettings, 42),
  meadowPlacements,
  'meadow placement must be deterministic',
);
assert.deepEqual(
  rockGrassPreviewModule.scatterRockMeadowGrass(meadowRoot, { ...meadowSettings, enabled: false }, 42),
  [],
);
meadowRock.geometry.dispose();
meadowRock.material.dispose();
for (const tool of [
  'inflate', 'deflate', 'smooth', 'flatten', 'clay', 'scrape', 'pinch', 'crack',
  'roughen', 'erode', 'terrace',
]) {
  const toolGeometry = variedGeometry.clone();
  const beforeTool = [...toolGeometry.getAttribute('position').array];
  let touched = 0;
  for (let stamp = 0; stamp < 12; stamp += 1) {
    touched += catalogSourceMeshModule.sculptCatalogGeometry(toolGeometry, {
      normal: [0, 1, 0],
      point: [0, 1.5, 0],
      radius: 3,
      referenceSnapshot: beforeTool,
      strength: 1,
      tool,
    });
  }
  assert.ok(touched > 0, `${tool} should touch vertices inside the brush`);
  assert.notDeepEqual(
    [...toolGeometry.getAttribute('position').array],
    beforeTool,
    `${tool} should deform the editable geometry`,
  );
  assert.equal(
    catalogSourceMeshModule.auditCatalogSculptGeometry(toolGeometry, beforeTool).ok,
    true,
    `${tool} must remain non-inverted after repeated maximum-strength stamps`,
  );
  toolGeometry.dispose();
}
const maskedGeometry = new (await import('three')).SphereGeometry(1, 16, 12);
const maskedBefore = [...maskedGeometry.getAttribute('position').array];
assert.equal(catalogSourceMeshModule.sculptCatalogGeometry(maskedGeometry, {
  maskWeights: new Float32Array(maskedGeometry.getAttribute('position').count).fill(1),
  normal: [0, 1, 0],
  point: [0, 1, 0],
  radius: 0.7,
  strength: 1,
  tool: 'inflate',
}), 0, 'fully protected vertices must ignore deformation brushes');
assert.deepEqual([...maskedGeometry.getAttribute('position').array], maskedBefore);
maskedGeometry.dispose();
const THREE = await import('three');
const brushResponseGeometry = new THREE.BufferGeometry();
brushResponseGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
  -1, 0, -1, 0, 0, -1, 1, 0, -1,
  -1, 0, 0, 0, 1, 0, 1, 0, 0,
  -1, 0, 1, 0, 0, 1, 1, 0, 1,
], 3));
brushResponseGeometry.setIndex([
  0, 1, 4, 0, 4, 3,
  1, 2, 5, 1, 5, 4,
  3, 4, 7, 3, 7, 6,
  4, 5, 8, 4, 8, 7,
]);
const brushResponses = new Map();
for (const tool of ['inflate', 'deflate', 'smooth', 'flatten']) {
  const toolGeometry = brushResponseGeometry.clone();
  const beforeTool = new Float32Array(toolGeometry.getAttribute('position').array);
  assert.ok(catalogSourceMeshModule.sculptCatalogGeometry(toolGeometry, {
    normal: [0, 1, 0],
    point: [0, 1, 0],
    radius: 0.5,
    seedIndices: [1, 4, 5],
    strength: 0.35,
    tool,
  }) > 0, `${tool} must operate at the default brush settings`);
  const afterTool = toolGeometry.getAttribute('position');
  const displacementY = [];
  let maximumToolDisplacement = 0;
  for (let index = 0; index < afterTool.count; index += 1) {
    displacementY.push(afterTool.getY(index) - beforeTool[index * 3 + 1]);
    maximumToolDisplacement = Math.max(maximumToolDisplacement, Math.hypot(
      afterTool.getX(index) - beforeTool[index * 3],
      afterTool.getY(index) - beforeTool[index * 3 + 1],
      afterTool.getZ(index) - beforeTool[index * 3 + 2],
    ));
  }
  assert.ok(
    maximumToolDisplacement >= 0.05,
    `${tool} must create a clearly visible terrain-scale response at the default radius and strength`,
  );
  assert.equal(
    catalogSourceMeshModule.auditCatalogSculptGeometry(toolGeometry, beforeTool).ok,
    true,
    `${tool} default response must remain topology-safe`,
  );
  brushResponses.set(tool, displacementY);
  toolGeometry.dispose();
}
const inflateResponse = brushResponses.get('inflate');
const deflateResponse = brushResponses.get('deflate');
const smoothResponse = brushResponses.get('smooth');
const flattenResponse = brushResponses.get('flatten');
assert.ok(
  inflateResponse[4] > 0.05 && inflateResponse.every((value) => value >= -1e-7),
  'inflate must move the brushed patch exclusively outward',
);
assert.ok(
  deflateResponse[4] < -0.05 && deflateResponse.every((value) => value <= 1e-7),
  'deflate must move the brushed patch exclusively inward',
);
assert.ok(
  smoothResponse[4] < -0.05
    && smoothResponse.some((value, index) => index !== 4 && value > 0.01),
  'smooth must reduce local curvature by lowering a peak while raising its neighbors',
);
assert.ok(
  Math.abs(flattenResponse[4]) < 1e-7
    && flattenResponse.some((value, index) => index !== 4 && value > 0.05),
  'flatten must preserve a vertex already on the target plane while pulling off-plane neighbors toward it',
);
assert.notDeepEqual(
  smoothResponse,
  flattenResponse,
  'smooth and flatten must have distinct displacement fields',
);
assert.match(
  engine,
  /stampNormal = sculptOptions\.tool === 'flatten' \? sculptGesture\.normal : normal/,
  'flatten must lock its plane normal at gesture start',
);
assert.match(
  engine,
  /stampPoint = sculptOptions\.tool === 'flatten' \? sculptGesture\.point : point/,
  'flatten must lock its plane origin at gesture start',
);
assert.match(
  engine,
  /crossVectors\(normal, fractureGuide\)\.normalize\(\)/,
  'fracture planes must run into the rock instead of lying tangent to the clicked surface',
);
assert.doesNotMatch(
  engine,
  /const fallbackNormals = \[/,
  'fracture must not silently replace the requested plane with a principal-axis cut',
);
brushResponseGeometry.dispose();
const normalFieldGeometry = new THREE.BufferGeometry();
normalFieldGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
  0, 0, 0,
  1, 0, 0,
  0, 1, 0,
], 3));
normalFieldGeometry.setAttribute('normal', new THREE.Float32BufferAttribute([
  1, 0, 0,
  0, 1, 0,
  0, 0, 1,
], 3));
for (const [tool, direction] of [['inflate', 1], ['deflate', -1]]) {
  const toolGeometry = normalFieldGeometry.clone();
  const beforeTool = new Float32Array(toolGeometry.getAttribute('position').array);
  catalogSourceMeshModule.sculptCatalogGeometry(toolGeometry, {
    normal: [0, 1, 0],
    point: [0.25, 0.25, 0],
    radius: 0.2,
    seedIndices: [0, 1, 2],
    strength: 0.1,
    tool,
  });
  const position = toolGeometry.getAttribute('position');
  assert.ok(
    (position.getX(0) - beforeTool[0]) * direction > 0.005,
    `${tool} must follow vertex 0's X-facing surface normal`,
  );
  assert.ok(
    (position.getY(1) - beforeTool[4]) * direction > 0.005,
    `${tool} must follow vertex 1's Y-facing surface normal`,
  );
  assert.ok(
    (position.getZ(2) - beforeTool[8]) * direction > 0.005,
    `${tool} must follow vertex 2's Z-facing surface normal`,
  );
  toolGeometry.dispose();
}
normalFieldGeometry.dispose();
const roughCutterOptions = { length: 2, radius: 0.5, roughness: 0.65, seed: 8142 };
const roughCutterA = catalogSourceMeshModule.createCatalogDrillCutterGeometry(roughCutterOptions);
const roughCutterB = catalogSourceMeshModule.createCatalogDrillCutterGeometry(roughCutterOptions);
const roughCutterC = catalogSourceMeshModule.createCatalogDrillCutterGeometry({
  ...roughCutterOptions,
  seed: roughCutterOptions.seed + 1,
});
assert.deepEqual(
  [...roughCutterA.getAttribute('position').array],
  [...roughCutterB.getAttribute('position').array],
  'irregular drill walls must replay deterministically from their saved seed',
);
assert.notDeepEqual(
  [...roughCutterA.getAttribute('position').array],
  [...roughCutterC.getAttribute('position').array],
  'different drill seeds must produce different natural wall profiles',
);
const roughRadii = [];
const roughCutterPosition = roughCutterA.getAttribute('position');
for (let index = 0; index < roughCutterPosition.count; index += 1) {
  const radial = Math.hypot(roughCutterPosition.getX(index), roughCutterPosition.getZ(index));
  if (radial > 0.1) roughRadii.push(radial);
}
assert.ok(
  Math.max(...roughRadii) - Math.min(...roughRadii) > roughCutterOptions.radius * 0.12,
  'wall roughness must visibly vary the bore radius around and along the stroke',
);
roughCutterA.dispose();
roughCutterB.dispose();
roughCutterC.dispose();
const drillSourceGeometry = new THREE.BoxGeometry(2, 2, 2, 4, 4, 4);
const blindDrillGeometry = catalogSourceMeshModule.drillCatalogGeometry(drillSourceGeometry, {
  depth: 0.75,
  normal: [0, 1, 0],
  point: [0, 1, 0],
  radius: 0.3,
  through: false,
});
assert.ok(blindDrillGeometry, 'blind drilling must return real cut topology');
// A solid Boolean may simplify the old planar faces. Test the actual wall,
// not a vertex-count increase that penalizes equivalent cleaner topology.
const blindWallMesh = new THREE.Mesh(blindDrillGeometry, new THREE.MeshBasicMaterial());
for (let sector = 0; sector < 16; sector += 1) {
  const angle = sector * Math.PI / 8;
  const wallHits = new THREE.Raycaster(new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)))
    .intersectObject(blindWallMesh, false);
  assert.ok(wallHits.length > 0 && Math.abs(wallHits[0].distance - 0.3) < 0.01, 'blind drilling must retain a continuous cylindrical wall');
}
blindWallMesh.material.dispose();
const blindDrillHits = new THREE.Raycaster(
  new THREE.Vector3(0, 3, 0),
  new THREE.Vector3(0, -1, 0),
).intersectObject(new THREE.Mesh(blindDrillGeometry, new THREE.MeshBasicMaterial()), false);
assert.ok(blindDrillHits.length > 0, 'a blind hole must retain a capped bottom');
assert.ok(
  blindDrillHits.every((hit) => Math.abs(hit.point.y - 0.25) < 1e-5),
  'the blind-hole bottom must match the selected 0.75 metre depth',
);
const throughDrillGeometry = catalogSourceMeshModule.drillCatalogGeometry(drillSourceGeometry, {
  depth: 0.75,
  normal: [0, 1, 0],
  point: [0, 1, 0],
  radius: 0.3,
  roughness: 0.45,
  seed: 923,
  through: true,
});
assert.ok(throughDrillGeometry, 'through drilling must return real cut topology');
assert.equal(
  throughDrillGeometry.index.count % 3,
  0,
  'indexed Boolean output must retain complete tunnel-wall triangles',
);
const throughDrillHits = new THREE.Raycaster(
  new THREE.Vector3(0, 3, 0),
  new THREE.Vector3(0, -1, 0),
).intersectObject(new THREE.Mesh(throughDrillGeometry, new THREE.MeshBasicMaterial()), false);
assert.equal(throughDrillHits.length, 0, 'a through-hole must have no cap blocking its centerline');
const throughEdgeCounts = new Map();
const throughPosition = throughDrillGeometry.getAttribute('position');
const throughIndex = throughDrillGeometry.index;
const throughVertexKey = (index) => [
  throughPosition.getX(index),
  throughPosition.getY(index),
  throughPosition.getZ(index),
].map((value) => Math.round(value * 1e5)).join(':');
for (let index = 0; index < throughIndex.count; index += 3) {
  const vertices = [
    throughVertexKey(throughIndex.getX(index)),
    throughVertexKey(throughIndex.getX(index + 1)),
    throughVertexKey(throughIndex.getX(index + 2)),
  ];
  for (const [left, right] of [[0, 1], [1, 2], [2, 0]]) {
    const edge = vertices[left] < vertices[right]
      ? `${vertices[left]}|${vertices[right]}`
      : `${vertices[right]}|${vertices[left]}`;
    throughEdgeCounts.set(edge, (throughEdgeCounts.get(edge) ?? 0) + 1);
  }
}
assert.ok(
  [...throughEdgeCounts.values()].every((count) => count === 2),
  'a through-hole must remain a closed two-manifold shell with a complete tunnel wall',
);
const throughDrillReplayGeometry = catalogSourceMeshModule.drillCatalogGeometry(drillSourceGeometry, {
  depth: 0.75,
  normal: [0, 1, 0],
  point: [0, 1, 0],
  radius: 0.3,
  roughness: 0.45,
  seed: 923,
  through: true,
});
assert.ok(throughDrillReplayGeometry, 'a saved irregular drill must replay successfully');
assert.deepEqual(
  [...throughDrillReplayGeometry.getAttribute('position').array],
  [...throughDrillGeometry.getAttribute('position').array],
  'deterministic Boolean retry phases must rebuild the exact same tunnel vertices',
);
assert.deepEqual(
  [...throughDrillReplayGeometry.index.array],
  [...throughDrillGeometry.index.array],
  'deterministic Boolean retry phases must rebuild the exact same tunnel topology',
);
const twoDrillCuts = [-0.55, 0.55].map((x) => ({
  depth: 0.75,
  meshIndex: 0,
  normal: [0, 1, 0],
  point: [x, 1, 0],
  radius: 0.25,
  roughness: 0.35,
  seed: x < 0 ? 101 : 102,
  through: false,
}));
const twoDrillGeometry = catalogSourceMeshModule.applyCatalogMeshOperations(
  drillSourceGeometry.clone(),
  {
    meshCuts: twoDrillCuts,
    meshIndex: 0,
    meshOperationOrder: [
      { index: 0, type: 'drill' },
      { index: 1, type: 'drill' },
    ],
  },
);
for (const cut of twoDrillCuts) {
  const hits = new THREE.Raycaster(
    new THREE.Vector3(cut.point[0], 3, 0),
    new THREE.Vector3(0, -1, 0),
  ).intersectObject(new THREE.Mesh(twoDrillGeometry, new THREE.MeshBasicMaterial()), false);
  assert.ok(hits.length > 0, 'each saved blind drill must retain its bottom after later cuts replay');
  assert.ok(
    hits.every((hit) => Math.abs(hit.point.y - 0.25) < 1e-5),
    'a later drill must not close or replace an earlier cavity',
  );
}
const orderedDrillGeometry = catalogSourceMeshModule.applyCatalogMeshOperations(
  drillSourceGeometry.clone(),
  {
    meshCuts: [{
      depth: 0.75,
      meshIndex: 0,
      normal: [0, 1, 0],
      point: [0, 1, 0],
      radius: 0.3,
      through: false,
    }],
    meshEdits: [{ deltas: [[0, 0.01, 0, 0]], meshIndex: 0 }],
    meshIndex: 0,
    meshOperationOrder: [
      { index: 0, type: 'drill' },
      { index: 0, type: 'sculpt' },
    ],
  },
);
assert.deepEqual(
  [...orderedDrillGeometry.index.array], [...blindDrillGeometry.index.array],
  'a later sculpt operation must not discard previously drilled topology during replay',
);
const drillDocument = structuredClone(generated);
drillDocument.reference.meshCuts = [{
  depth: 0.75,
  meshIndex: 0,
  normal: [0, 1, 0],
  point: [0, 1, 0],
  radius: 0.3,
  roughness: 0.4,
  seed: 2048,
  through: false,
}];
drillDocument.reference.meshOperationOrder = [{ index: 0, type: 'drill' }];
const drillRoundTrip = rockgenModule.deserializeRockDocument(
  rockgenModule.serializeRockDocument(drillDocument),
);
assert.deepEqual(drillRoundTrip.reference.meshCuts, drillDocument.reference.meshCuts);
assert.deepEqual(drillRoundTrip.reference.meshOperationOrder, drillDocument.reference.meshOperationOrder);
const unrestrictedHistoryDocument = structuredClone(generated);
unrestrictedHistoryDocument.reference.meshEdits = Array.from({ length: 205 }, (_, index) => ({
  deltas: [[0, index + 1, 0, 0]],
  meshIndex: 0,
}));
unrestrictedHistoryDocument.reference.meshCuts = Array.from({ length: 70 }, (_, index) => ({
  depth: index === 0 ? 500 : 0.75,
  meshIndex: 0,
  normal: [0, 1, 0],
  point: [index, 1, 0],
  radius: index === 0 ? 125 : 0.3,
  roughness: 0.4,
  seed: index,
  through: false,
}));
unrestrictedHistoryDocument.reference.meshOperationOrder = null;
const unrestrictedHistoryRoundTrip = rockgenModule.deserializeRockDocument(
  rockgenModule.serializeRockDocument(unrestrictedHistoryDocument),
);
assert.equal(unrestrictedHistoryRoundTrip.reference.meshEdits.length, 205, 'saved sculpt history must not be truncated');
assert.equal(unrestrictedHistoryRoundTrip.reference.meshCuts.length, 70, 'saved drill history must not be truncated');
assert.equal(unrestrictedHistoryRoundTrip.reference.meshCuts[0].depth, 500, 'saved hole depth must not be capped');
assert.equal(unrestrictedHistoryRoundTrip.reference.meshCuts[0].radius, 125, 'saved brush radius must not be capped');
blindDrillGeometry.dispose();
throughDrillGeometry.dispose();
throughDrillReplayGeometry.dispose();
twoDrillGeometry.dispose();
orderedDrillGeometry.dispose();
drillSourceGeometry.dispose();
const sparseSeamGeometry = new THREE.BufferGeometry();
sparseSeamGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
  -2, 0, -2,
  2, 0, -2,
  2, 0, 2,
  -2, 0, -2,
  2, 0, 2,
  -2, 0, 2,
], 3));
sparseSeamGeometry.setAttribute('normal', new THREE.Float32BufferAttribute([
  0, 1, 0,
  0, 1, 0,
  0, 1, 0,
  1, 0, 0,
  1, 0, 0,
  1, 0, 0,
], 3));
const variedSparseSeamGeometry = catalogSourceMeshModule.deformCatalogGeometry(
  sparseSeamGeometry,
  {
    bulge: 0,
    leanX: 0,
    leanZ: 0,
    noiseAmplitude: 0.15,
    noiseFrequency: 1.7,
    phases: [0.7, 0.3, 1.1],
    scale: [1, 1, 1],
    strength: 1,
    taper: 0,
    twist: 0,
  },
);
const variedSparsePosition = variedSparseSeamGeometry.getAttribute('position');
for (const [left, right] of [[0, 3], [2, 4]]) {
  for (const axis of ['X', 'Y', 'Z']) {
    assert.equal(
      variedSparsePosition[`get${axis}`](left),
      variedSparsePosition[`get${axis}`](right),
      'procedural variation must preserve split render-vertex welds before sculpting',
    );
  }
}
const variedSparseReference = new Float32Array(variedSparsePosition.array);
assert.ok(catalogSourceMeshModule.sculptCatalogGeometry(variedSparseSeamGeometry, {
  normal: [0, 1, 0],
  point: [0, 0, 0],
  radius: 0.1,
  seedIndices: [0, 1, 2],
  strength: 0.5,
  tool: 'smooth',
}) > 0, 'smooth must operate on a varied sparse face');
for (const [left, right] of [[0, 3], [2, 4]]) {
  for (const axis of ['X', 'Y', 'Z']) {
    assert.equal(
      variedSparsePosition[`get${axis}`](left),
      variedSparsePosition[`get${axis}`](right),
      'smooth must not reopen a procedural-variation seam',
    );
  }
}
assert.equal(
  catalogSourceMeshModule.auditCatalogSculptGeometry(
    variedSparseSeamGeometry,
    variedSparseReference,
    { allowLargeDeformation: true },
  ).ok,
  true,
  'smooth on a varied sparse mesh must preserve triangle integrity',
);
variedSparseSeamGeometry.dispose();
const sparseWeights = catalogSourceMeshModule.createCatalogSculptWeights(sparseSeamGeometry, {
  point: [0, 0, 0],
  radius: 0.1,
  seedIndices: [0, 1, 2],
});
const sparseReference = new Float32Array(sparseSeamGeometry.getAttribute('position').array);
assert.ok(sparseWeights.some((weight) => weight > 0), 'a face-center hit must select a sparse triangle');
assert.equal(sparseWeights[0], sparseWeights[3], 'split seam vertices must share grab weight');
assert.equal(sparseWeights[2], sparseWeights[4], 'split seam vertices must share grab weight');
const proportionalGrabWeights = catalogSourceMeshModule.createCatalogSculptWeights(sparseSeamGeometry, {
  point: [0, 0, 0],
  radius: 0.1,
  seedIndices: [0, 1, 2],
  seedWeight: 1,
  topologyFalloff: 0.62,
  topologyRings: 4,
});
assert.equal(proportionalGrabWeights[0], 1, 'grabbed face vertices must track the cursor at full weight');
assert.ok(
  proportionalGrabWeights.every((weight) => weight > 0),
  'grab must taper through connected topology instead of stopping after one ring',
);
const rigidTierWeights = catalogSourceMeshModule.createCatalogSculptWeights(sparseSeamGeometry, {
  point: [0, 0, 0],
  radius: 3,
  rigidCoveredComponent: true,
  seedIndices: [0, 1, 2],
});
assert.ok(
  rigidTierWeights.every((weight) => weight === 1),
  'a brush that fully covers a separate hoodoo tier must select it rigidly',
);
const rigidCoreWeights = catalogSourceMeshModule.createCatalogSculptWeights(sparseSeamGeometry, {
  point: [-2, 0, -2],
  radius: 0.1,
  rigidCoveredComponent: true,
  seedIndices: [0, 1, 2],
});
assert.equal(rigidCoreWeights[0], 1, 'high-falloff Grab must keep the brush core rigid');
assert.ok(catalogSourceMeshModule.sculptCatalogGeometry(sparseSeamGeometry, {
  normal: [0, 1, 0],
  point: [0, 0, 0],
  radius: 0.1,
  seedIndices: [0, 1, 2],
  strength: 0.5,
  tool: 'inflate',
}) > 0, 'inflate must work when the ray hits inside a sparse face');
const sparsePosition = sparseSeamGeometry.getAttribute('position');
assert.ok(sparsePosition.getY(0) > 0, 'inflate must move the selected surface');
assert.ok(sparsePosition.getY(0) >= 0.009, 'default inflate strength must create a visible terrain-scale stamp');
assert.equal(sparsePosition.getY(0), sparsePosition.getY(3), 'inflate must not tear a split seam');
assert.equal(sparsePosition.getY(2), sparsePosition.getY(4), 'inflate must not tear a split seam');
assert.equal(
  catalogSourceMeshModule.auditCatalogSculptGeometry(
    sparseSeamGeometry,
    sparseReference,
    { allowLargeDeformation: true },
  ).ok,
  true,
  'a topology-aware inflate stroke must preserve triangle integrity',
);
const unrestrictedStrokeGeometry = sparseSeamGeometry.clone();
const unrestrictedStrokeReference = new Float32Array(unrestrictedStrokeGeometry.getAttribute('position').array);
for (let stamp = 0; stamp < 40; stamp += 1) {
  catalogSourceMeshModule.sculptCatalogGeometry(unrestrictedStrokeGeometry, {
    normal: [0, 1, 0],
    point: [0, 0, 0],
    radius: 0.1,
    seedIndices: [0, 1, 2],
    strength: 1,
    tool: 'inflate',
  });
}
const unrestrictedStrokePosition = unrestrictedStrokeGeometry.getAttribute('position');
assert.ok(Math.hypot(
  unrestrictedStrokePosition.getX(0) - unrestrictedStrokeReference[0],
  unrestrictedStrokePosition.getY(0) - unrestrictedStrokeReference[1],
  unrestrictedStrokePosition.getZ(0) - unrestrictedStrokeReference[2],
) > 0.02, 'a continuous terrain-style stroke must not be capped by a hidden gesture envelope');
unrestrictedStrokeGeometry.dispose();
const sparseGrabBefore = new Float32Array(sparsePosition.array);
assert.ok(catalogSourceMeshModule.grabCatalogGeometry(sparseSeamGeometry, {
  before: sparseGrabBefore,
  delta: [0.4, -0.2, 0.1],
  strength: 0.5,
  weights: sparseWeights,
}) >= 3, 'grab must move a sparse hit face and its seam twins');
assert.notEqual(sparsePosition.getX(0), sparseGrabBefore[0], 'grab must produce visible vertex displacement');
assert.equal(
  sparsePosition.getX(0) - sparseGrabBefore[0],
  sparsePosition.getX(3) - sparseGrabBefore[9],
  'grab must keep split seam vertices together',
);
const unrestrictedGrabGeometry = sparseSeamGeometry.clone();
const unrestrictedGrabBefore = new Float32Array(unrestrictedGrabGeometry.getAttribute('position').array);
assert.ok(catalogSourceMeshModule.grabCatalogGeometry(unrestrictedGrabGeometry, {
  before: unrestrictedGrabBefore,
  delta: [20, -10, 5],
  strength: 1,
  weights: sparseWeights,
}) >= 3, 'a large grab must still move the selected surface');
const unrestrictedGrabPosition = unrestrictedGrabGeometry.getAttribute('position');
assert.ok(Math.hypot(
  unrestrictedGrabPosition.getX(0) - unrestrictedGrabBefore[0],
  unrestrictedGrabPosition.getY(0) - unrestrictedGrabBefore[1],
  unrestrictedGrabPosition.getZ(0) - unrestrictedGrabBefore[2],
) > 1, 'grab must not saturate at a hidden distance cap');
assert.equal(
  catalogSourceMeshModule.auditCatalogSculptGeometry(
    unrestrictedGrabGeometry,
    unrestrictedGrabBefore,
    { allowLargeDeformation: true },
  ).ok,
  true,
  'an unrestricted grab must remain finite and keep welded seams intact',
);
unrestrictedGrabGeometry.dispose();
const freeGrabGeometry = sparseSeamGeometry.clone();
const freeGrabBefore = new Float32Array(freeGrabGeometry.getAttribute('position').array);
assert.ok(catalogSourceMeshModule.grabCatalogGeometry(freeGrabGeometry, {
  before: freeGrabBefore,
  delta: [20, -10, 5],
  strength: 1,
  weights: proportionalGrabWeights,
}) >= 3, 'an unrestricted grab must move the selected surface');
const freeGrabPosition = freeGrabGeometry.getAttribute('position');
let freeGrabMaximum = 0;
for (let index = 0; index < freeGrabPosition.count; index += 1) {
  freeGrabMaximum = Math.max(freeGrabMaximum, Math.hypot(
    freeGrabPosition.getX(index) - freeGrabBefore[index * 3],
    freeGrabPosition.getY(index) - freeGrabBefore[index * 3 + 1],
    freeGrabPosition.getZ(index) - freeGrabBefore[index * 3 + 2],
  ));
}
assert.ok(freeGrabMaximum > 20, 'grab must follow a metre-scale cursor delta without a hidden movement cap');
assert.equal(
  catalogSourceMeshModule.auditCatalogSculptGeometry(
    freeGrabGeometry,
    freeGrabBefore,
    { allowLargeDeformation: true },
  ).ok,
  true,
  'an unrestricted grab must retain finite welded geometry after a large deformation',
);
freeGrabGeometry.dispose();
const sequentialStrokeGeometry = new THREE.BufferGeometry();
sequentialStrokeGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
  0, 0, 0,
  1, 0, 0,
  0, 1, 0,
], 3));
assert.equal(catalogSourceMeshModule.applyCatalogMeshEdits(sequentialStrokeGeometry, [
  { meshIndex: 0, deltas: [[1, 0.6, 0, 0]] },
  { meshIndex: 0, deltas: [[1, 0.6, 0, 0]] },
]), 2, 'safe sequential strokes must be validated from each gesture start, not the pristine mesh');
assert.ok(
  Math.abs(sequentialStrokeGeometry.getAttribute('position').getX(1) - 2.2) < 1e-6,
  'safe accumulated sculpt edits must survive replay instead of bouncing back',
);
sequentialStrokeGeometry.dispose();
const explodedGeometry = sparseSeamGeometry.clone();
catalogSourceMeshModule.createCatalogSculptWeights(explodedGeometry, {
  point: [0, 0, 0],
  radius: 0.1,
  seedIndices: [0, 1, 2],
});
explodedGeometry.getAttribute('position').setY(0, 12);
assert.equal(
  catalogSourceMeshModule.auditCatalogSculptGeometry(explodedGeometry, sparseReference).ok,
  false,
  'spikes and split seams like the reported legacy-rock failure must be rejected',
);
explodedGeometry.dispose();
const flippedGeometry = new THREE.BufferGeometry();
flippedGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
  0, 0, 0,
  1, 0, 0,
  0, 1, 0,
], 3));
const flippedReference = new Float32Array(flippedGeometry.getAttribute('position').array);
flippedGeometry.getAttribute('position').setXYZ(1, 0, 1, 0);
flippedGeometry.getAttribute('position').setXYZ(2, 1, 0, 0);
assert.equal(
  catalogSourceMeshModule.auditCatalogSculptGeometry(flippedGeometry, flippedReference).ok,
  false,
  'triangle orientation flips must be rejected even when area and edge length remain valid',
);
flippedGeometry.dispose();
sparseSeamGeometry.dispose();
const grabGeometry = variedGeometry.clone();
const grabBefore = new Float32Array(grabGeometry.getAttribute('position').array);
const grabWeights = new Float32Array(grabGeometry.getAttribute('position').count).fill(0);
grabWeights[0] = 1;
assert.equal(catalogSourceMeshModule.grabCatalogGeometry(grabGeometry, {
  before: grabBefore,
  delta: [0.4, -0.2, 0.1],
  strength: 0.5,
  weights: grabWeights,
}), 1);
assert.notDeepEqual([...grabGeometry.getAttribute('position').array], [...grabBefore]);
assert.ok(
  Math.abs(grabGeometry.getAttribute('position').getX(0) - (grabBefore[0] + 0.4)) < 1e-6,
  'the grab center must follow the cursor 1:1 instead of scaling travel by strength',
);
grabGeometry.dispose();
const resizeGeometry = variedGeometry.clone();
const resizeBefore = new Float32Array(resizeGeometry.getAttribute('position').array);
const resizeWeights = new Float32Array(resizeGeometry.getAttribute('position').count).fill(1);
resizeGeometry.computeBoundingBox();
const resizeBeforeWidth = resizeGeometry.boundingBox.max.x - resizeGeometry.boundingBox.min.x;
assert.equal(catalogSourceMeshModule.resizeCatalogGeometry(resizeGeometry, {
  before: resizeBefore,
  scale: 4,
  weights: resizeWeights,
}), resizeWeights.length, 'resize must affect every selected vertex');
resizeGeometry.computeBoundingBox();
assert.ok(Math.abs(
  (resizeGeometry.boundingBox.max.x - resizeGeometry.boundingBox.min.x) - (resizeBeforeWidth * 4),
) < 1e-4, 'resize must apply the full requested scale without a hidden ceiling');
resizeGeometry.dispose();
const rotateGeometry = new THREE.BoxGeometry(2, 1, 1, 2, 2, 2);
const rotateBefore = new Float32Array(rotateGeometry.getAttribute('position').array);
const rotateWeights = new Float32Array(rotateGeometry.getAttribute('position').count).fill(1);
assert.equal(catalogSourceMeshModule.rotateCatalogGeometry(rotateGeometry, {
  angle: Math.PI / 2,
  axis: [0, 1, 0],
  before: rotateBefore,
  weights: rotateWeights,
}), rotateWeights.length);
rotateGeometry.computeBoundingBox();
assert.ok(Math.abs(rotateGeometry.boundingBox.max.z - rotateGeometry.boundingBox.min.z - 2) < 1e-5);
rotateGeometry.translate(0, 5, 0);
assert.equal(catalogSourceMeshModule.settleCatalogGeometry(rotateGeometry, rotateWeights), rotateWeights.length);
rotateGeometry.computeBoundingBox();
assert.ok(Math.abs(rotateGeometry.boundingBox.min.y) < 1e-6);
assert.equal(catalogSourceMeshModule.mirrorCatalogGeometry(rotateGeometry, rotateWeights, 'x'), rotateWeights.length);
rotateGeometry.dispose();

const topologyGeometry = new THREE.BoxGeometry(2, 2, 2, 4, 4, 4);
const topologyTriangles = topologyGeometry.index.count / 3;
const subdividedGeometry = catalogSourceMeshModule.subdivideCatalogGeometry(topologyGeometry);
assert.equal(
  (subdividedGeometry.index?.count ?? subdividedGeometry.getAttribute('position').count) / 3,
  topologyTriangles * 4,
);
const decimatedGeometry = catalogSourceMeshModule.decimateCatalogGeometry(topologyGeometry, 0.5);
const decimatedTriangles = (decimatedGeometry.index?.count ?? decimatedGeometry.getAttribute('position').count) / 3;
assert.ok(decimatedTriangles <= topologyTriangles * 0.55 && decimatedTriangles > 0);
const remeshedGeometry = catalogSourceMeshModule.remeshCatalogGeometry(topologyGeometry);
const remeshedTriangles = (remeshedGeometry.index?.count ?? remeshedGeometry.getAttribute('position').count) / 3;
assert.ok(remeshedTriangles >= topologyTriangles * 0.7 && remeshedTriangles <= topologyTriangles * 1.3);
const trimmedGeometry = catalogSourceMeshModule.trimCatalogGeometry(topologyGeometry, {
  normal: [0, 1, 0],
  point: [0, 0.4, 0],
});
assert.ok(trimmedGeometry?.getAttribute('position').count > 0, 'trim must return valid cut geometry');
const fracturedGeometry = catalogSourceMeshModule.fractureCatalogGeometry(topologyGeometry, {
  normal: [1, 0, 0],
  point: [0, 0, 0],
  width: 0.08,
});
assert.ok(fracturedGeometry?.getAttribute('position').count > 0, 'fracture must return valid separated geometry');
const { mergeGeometries } = await import('three/examples/jsm/utils/BufferGeometryUtils.js');
const unionLeft = new THREE.BoxGeometry(1.5, 1.5, 1.5).translate(-0.35, 0, 0);
const unionRight = new THREE.BoxGeometry(1.5, 1.5, 1.5).translate(0.35, 0, 0);
const unionSource = mergeGeometries([unionLeft, unionRight], false);
const unionGeometry = catalogSourceMeshModule.unionCatalogGeometryComponents(unionSource);
assert.ok(unionGeometry?.getAttribute('position').count > 0, 'boolean union must produce valid geometry');
function topologyDefects(geometry) {
  const position = geometry.getAttribute('position');
  geometry.computeBoundingBox();
  const diagonal = Math.max(geometry.boundingBox.getSize(new THREE.Vector3()).length(), 1e-6);
  const tolerance = Math.max(diagonal * 1e-6, 1e-7);
  const weldedIds = new Map();
  const welded = [];
  for (let vertex = 0; vertex < position.count; vertex += 1) {
    const key = [position.getX(vertex), position.getY(vertex), position.getZ(vertex)]
      .map((value) => Math.round(value / tolerance)).join(':');
    if (!weldedIds.has(key)) weldedIds.set(key, weldedIds.size);
    welded[vertex] = weldedIds.get(key);
  }
  const edgeCounts = new Map();
  const index = geometry.index;
  const triangleCount = Math.floor((index?.count ?? position.count) / 3);
  let degenerateTriangles = 0;
  let finite = true;
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const sourceIds = [0, 1, 2].map((corner) => (
      index ? index.getX(triangle * 3 + corner) : triangle * 3 + corner
    ));
    const points = sourceIds.map((vertex) => new THREE.Vector3(
      position.getX(vertex), position.getY(vertex), position.getZ(vertex),
    ));
    if (!points.every((point) => point.toArray().every(Number.isFinite))) finite = false;
    if (points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).length()
      <= diagonal * diagonal * 1e-10) degenerateTriangles += 1;
    const ids = sourceIds.map((vertex) => welded[vertex]);
    for (const [left, right] of [[ids[0], ids[1]], [ids[1], ids[2]], [ids[2], ids[0]]]) {
      if (left === right) continue;
      const key = left < right ? `${left}:${right}` : `${right}:${left}`;
      edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
    }
  }
  return {
    boundaryEdges: [...edgeCounts.values()].filter((count) => count === 1).length,
    degenerateTriangles,
    finite,
    nonManifoldEdges: [...edgeCounts.values()].filter((count) => count > 2).length,
  };
}
for (const [label, geometry] of Object.entries({
  decimate: decimatedGeometry,
  fracture: fracturedGeometry,
  remesh: remeshedGeometry,
  subdivide: subdividedGeometry,
  trim: trimmedGeometry,
  union: unionGeometry,
})) {
  assert.deepEqual(
    topologyDefects(geometry),
    { boundaryEdges: 0, degenerateTriangles: 0, finite: true, nonManifoldEdges: 0 },
    `${label} must produce a closed two-manifold mesh`,
  );
}
const fractureStressSource = new THREE.TorusGeometry(1.5, 0.55, 12, 28);
for (const normal of [
  [1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 0.35, 1],
]) {
  const stressedFracture = catalogSourceMeshModule.fractureCatalogGeometry(fractureStressSource, {
    normal,
    point: [0, 0, 0],
    width: 0.12,
  });
  assert.ok(stressedFracture, `fracture must succeed for plane ${normal.join(',')}`);
  assert.deepEqual(
    topologyDefects(stressedFracture),
    { boundaryEdges: 0, degenerateTriangles: 0, finite: true, nonManifoldEdges: 0 },
    `fracture plane ${normal.join(',')} must produce closed valid shells`,
  );
  stressedFracture.dispose();
}
const repeatedFracture = catalogSourceMeshModule.fractureCatalogGeometry(fracturedGeometry, {
  normal: [0, 0, 1],
  point: [0, 0, 0],
  width: 0.06,
});
assert.ok(repeatedFracture, 'a second fracture must preserve the first fracture instead of resetting it');
assert.deepEqual(
  topologyDefects(repeatedFracture),
  { boundaryEdges: 0, degenerateTriangles: 0, finite: true, nonManifoldEdges: 0 },
  'repeated fractures must remain closed and manifold',
);
repeatedFracture.dispose();
const drilledThenFractured = catalogSourceMeshModule.fractureCatalogGeometry(throughDrillGeometry, {
  normal: [1, 0, 0],
  point: [0, 0, 0],
  width: 0.06,
});
assert.ok(drilledThenFractured, 'fracture must work after a through-hole Boolean');
assert.deepEqual(
  topologyDefects(drilledThenFractured),
  { boundaryEdges: 0, degenerateTriangles: 0, finite: true, nonManifoldEdges: 0 },
  'drill-then-fracture output must remain closed and manifold',
);
drilledThenFractured.dispose();
fractureStressSource.dispose();
for (const geometry of [
  subdividedGeometry, decimatedGeometry, remeshedGeometry, trimmedGeometry, fracturedGeometry,
  unionLeft, unionRight, unionSource, unionGeometry, topologyGeometry,
]) {
  geometry?.dispose();
}
const sculptBefore = [...variedGeometry.getAttribute('position').array];
assert.ok(catalogSourceMeshModule.sculptCatalogGeometry(variedGeometry, {
  point: [0, 1.5, 0],
  radius: 3,
  strength: 0.5,
  tool: 'inflate',
}) > 0);
const sculptAfter = [...variedGeometry.getAttribute('position').array];
assert.notDeepEqual(sculptAfter, sculptBefore);
const deltas = [];
for (let index = 0; index < sculptAfter.length / 3; index += 1) {
  const dx = sculptAfter[index * 3] - sculptBefore[index * 3];
  const dy = sculptAfter[(index * 3) + 1] - sculptBefore[(index * 3) + 1];
  const dz = sculptAfter[(index * 3) + 2] - sculptBefore[(index * 3) + 2];
  if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) > 1e-8) deltas.push([index, dx, dy, dz]);
}
const replayGeometry = variedGeometry.clone();
const replayPosition = replayGeometry.getAttribute('position');
for (let index = 0; index < sculptBefore.length / 3; index += 1) {
  replayPosition.setXYZ(
    index,
    sculptBefore[index * 3],
    sculptBefore[(index * 3) + 1],
    sculptBefore[(index * 3) + 2],
  );
}
assert.equal(catalogSourceMeshModule.applyCatalogMeshEdits(
  replayGeometry,
  [{ deltas, meshIndex: 0 }],
  0,
), deltas.length);
assert.deepEqual([...replayGeometry.getAttribute('position').array], sculptAfter);
sourceGeometry.dispose();
variedGeometry.dispose();
replayGeometry.dispose();

const firstStore = createRockGenerationStore({ urlParams: new URLSearchParams() });
assert.deepEqual(CATALOG_SURFACE_PRESET_OPTIONS.map((entry) => entry.label), [
  'Call Me Sensei',
  'Bare',
  'Granite',
  'Sandstone',
  'Basalt',
  'Limestone',
  'Veined',
  'Moss',
  'Lichen',
  'Snow Cap',
]);
assert.equal(firstStore.actions.startCatalogVariation('rock-0480', 2), true);
firstStore.actions.setCatalogGrassPreview({ enabled: true, colorAdaptation: 0.88 });
assert.equal(firstStore.getState().grassPreview.enabled, true);
assert.equal(firstStore.getState().grassPreview.colorAdaptation, 0.88);
assert.equal(firstStore.actions.applyCatalogTopFinish('sand'), true);
assert.equal(firstStore.getState().document.reference.surfaceMode, 'generated');
assert.equal(firstStore.getState().document.reference.topFinish, 'sand');
firstStore.actions.setField(
  rockgenModule.ROCKGEN_SETTING_FIELD_SCHEMA.surface.pbrTexturePreset,
  'cliff-rock',
);
assert.equal(firstStore.getState().document.surface.pbrTexturePreset, 'cliff-rock');
assert.equal(firstStore.getState().document.reference.topFinish, 'sand');
assert.equal(firstStore.getState().document.style, 'call_me_sensei');
assert.equal(firstStore.actions.applyCatalogSurfacePreset('sandstone'), true);
assert.equal(firstStore.getState().document.surface.pbrTexturePreset, 'none');
assert.equal(catalogSurfacePresetValue(firstStore.getState().document), 'sandstone');
assert.equal(firstStore.getState().document.surface.textureStyle, 'sandstone');
const sandstoneBase = {
  baseColor: [...firstStore.getState().document.surface.baseColor],
  cavityColor: [...firstStore.getState().document.surface.cavityColor],
  textureStrength: firstStore.getState().document.surface.textureStrength,
  textureStyle: firstStore.getState().document.surface.textureStyle,
};
assert.equal(firstStore.actions.applyCatalogTopFinish('snow'), true);
assert.deepEqual({
  baseColor: firstStore.getState().document.surface.baseColor,
  cavityColor: firstStore.getState().document.surface.cavityColor,
  textureStrength: firstStore.getState().document.surface.textureStrength,
  textureStyle: firstStore.getState().document.surface.textureStyle,
}, sandstoneBase);
assert.equal(catalogSurfacePresetValue(firstStore.getState().document), 'sandstone');
assert.equal(firstStore.actions.applyCatalogSurfacePreset('call_me_sensei'), true);
assert.equal(firstStore.getState().document.style, 'call_me_sensei');
assert.equal(firstStore.getState().document.reference.surfaceMode, 'generated');
assert.equal(firstStore.getState().document.reference.topFinish, 'bare');
assert.equal(catalogSurfacePresetValue(firstStore.getState().document), 'call_me_sensei');
assert.match(firstStore.getState().status, /C7 geology maps/);
assert.equal(firstStore.actions.applyCatalogTopFinish('sand'), true);
const sandRevision = firstStore.getState().docRevision;
assert.equal(firstStore.actions.applyCatalogTopFinish('source'), true);
assert.ok(firstStore.getState().docRevision > sandRevision);
assert.equal(firstStore.getState().document.reference.surfaceMode, 'source');
assert.equal(firstStore.actions.applyCatalogTopFinish('sand'), true);
assert.equal(firstStore.actions.commitCatalogMeshEdit({
  deltas: [[0, 0.125, 0, 0]],
  meshIndex: 0,
}), true);
assert.equal(firstStore.getState().document.reference.meshEdits.length, 1);
assert.equal(firstStore.actions.commitCatalogMeshCuts(twoDrillCuts), true);
assert.match(firstStore.getState().status, /2-stamp drill stroke/);
assert.deepEqual(firstStore.getState().document.reference.meshCuts, twoDrillCuts);
assert.deepEqual(firstStore.getState().document.reference.meshOperationOrder, [
  { index: 0, type: 'sculpt' },
  { index: 0, type: 'drill' },
  { index: 1, type: 'drill' },
]);
const draftReloadStore = createRockGenerationStore({ urlParams: new URLSearchParams() });
assert.equal(draftReloadStore.getState().catalogSourceId, 'rock-0480');
assert.equal(draftReloadStore.getState().document.reference.surfaceMode, 'generated');
assert.equal(draftReloadStore.getState().document.reference.meshEdits.length, 1);
assert.deepEqual(draftReloadStore.getState().document.reference.meshCuts, twoDrillCuts);
draftReloadStore.actions.applyCatalogSurfacePreset('sandstone');
assert.equal(draftReloadStore.getState().document.style, 'default');
const bundleReloadStore = createRockGenerationStore({
  urlParams: new URLSearchParams('styleBundle=call-me-sensei'),
});
assert.equal(bundleReloadStore.getState().document.style, 'call_me_sensei');
assert.equal(bundleReloadStore.getState().document.reference.surfaceMode, 'generated');
assert.equal(bundleReloadStore.getState().document.reference.surfacePackage.schema, 'toonlab/c7-geology-surface');
assert.deepEqual(bundleReloadStore.getState().document.reference.meshCuts, twoDrillCuts);
assert.equal(firstStore.actions.saveLocalAs('Peak QA'), true);
const reloadedStore = createRockGenerationStore({ urlParams: new URLSearchParams() });
assert.equal(reloadedStore.getState().library.length, 1);
assert.equal(reloadedStore.actions.loadLocal(reloadedStore.getState().library[0].id), true);
assert.equal(reloadedStore.getState().document.name, 'Peak QA');
assert.equal(reloadedStore.getState().document.type, 'toonlab/rockgen-project');
assert.equal(reloadedStore.getState().catalogSourceId, 'rock-0480');
assert.equal(reloadedStore.getState().catalogVariation, 2);
assert.equal(reloadedStore.getState().document.reference.surfaceMode, 'generated');
assert.equal(reloadedStore.getState().document.reference.topFinish, 'sand');
assert.deepEqual(reloadedStore.getState().document.reference.meshEdits, [{
  deltas: [[0, 0.125, 0, 0]],
  meshIndex: 0,
}]);

const topologyStore = createRockGenerationStore({ urlParams: new URLSearchParams() });
assert.equal(topologyStore.actions.startCatalogVariation('rock-0480', 0), true);
assert.equal(topologyStore.actions.commitCatalogMeshCuts(twoDrillCuts), true);
assert.equal(topologyStore.actions.removeNearestCatalogMeshCut({
  meshIndex: 0,
  point: twoDrillCuts[0].point,
}), true);
assert.deepEqual(topologyStore.getState().document.reference.meshCuts, [twoDrillCuts[1]]);
assert.deepEqual(topologyStore.getState().document.reference.meshOperationOrder, [{ index: 0, type: 'drill' }]);
assert.equal(topologyStore.actions.commitCatalogMeshSnapshots([serializedGeometry], 'Remeshed geometry.'), true);
assert.equal(topologyStore.getState().document.reference.meshSnapshots.length, 1);
assert.deepEqual(topologyStore.getState().document.reference.meshCuts, []);
assert.deepEqual(topologyStore.getState().document.reference.meshEdits, []);
const topologyReloadStore = createRockGenerationStore({ urlParams: new URLSearchParams() });
assert.deepEqual(
  topologyReloadStore.getState().document.reference.meshSnapshots,
  topologyStore.getState().document.reference.meshSnapshots,
  'topology-changing tools must persist through a page reload',
);
assert.equal(topologyReloadStore.actions.clearCatalogMeshEdits(), true);
assert.deepEqual(topologyReloadStore.getState().document.reference.meshSnapshots, []);

assert.doesNotMatch(
  source,
  /assets-local|\bP18\b|shared\/p18|rockgen\/reference/i,
  'The active Rock Generation graph must remain first-party and procedural.',
);
assert.doesNotMatch(source, /assets\.toonlab\.io\/official\/2026-08\/rock-/i);

console.log('Rock & Cliff Generation builds first-party GLB sources and supports editable surfaces, mesh sculpting, and adaptive meadow previews.');
