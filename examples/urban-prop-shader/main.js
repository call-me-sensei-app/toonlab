import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import {
  MANUFACTURED_CONTENT_FLAGS,
  MANUFACTURED_MATERIAL_BASES,
  MANUFACTURED_MATERIAL_FINISHES,
  MANUFACTURED_MATERIAL_MANIFEST_TYPE,
  MANUFACTURED_MATERIAL_MANIFEST_VERSION,
  MANUFACTURED_RENDER_MODES,
  MANUFACTURED_STRUCTURAL_ROLES,
  classifyManufacturedMaterial,
  createManufacturedMaterialClassification,
} from '../../src/environment/manufacturedMaterialContract.js';
import {
  createManufacturedReflectionProbe,
} from '../../src/environment/manufacturedReflectionProvider.js';
import {
  loadImportedModel,
} from '../../src/assetlib/loadImported.js';
import {
  createImportedVegetationMaterial,
} from '../../src/vegetation/importedVegetationMaterial.js';
import {
  VEGETATION_MATERIAL_ROLES,
} from '../../src/vegetation/vegetationShaders.js';
import {
  applyUrbanPropShaderProfile,
  applyUrbanPropPalette,
  createUrbanAnimePropMaterial,
  createUrbanPropShaderProfileDocument,
  createUrbanPropShaderControls,
  snapshotUrbanPropShaderControls,
} from '../../src/environment/urbanPropMaterial.js';

const PASTEL_TARGET_STRENGTH = 0.10;
const SHADOW_PASTEL_TARGET_STRENGTH = 0.80;

const TEST_MODELS = {
  dumpster: {
    assetId: 'dumpster-free-game-asset-agustin-honnun',
    cameraScale: { single: 1, split: 1 },
    fitWidth: 2.9,
    label: 'dumpster',
    objectClass: 'prop',
    rotationY: -0.24,
    splitOffset: 1.85,
    targetY: 1.25,
    url: '/assets-local/labs/manufactured-material/test-cases/dumpster/model.glb',
  },
  streetcar: {
    assetId: 'broken-old-streetcar',
    cameraScale: { single: 0.8, split: 0.88 },
    fitWidth: 3.7,
    label: 'streetcar',
    objectClass: 'vehicle',
    rotationY: -0.24,
    splitOffset: 2.35,
    targetY: 0.72,
    url: '/assets-local/labs/manufactured-material/test-cases/streetcar/model.glb',
  },
  'burned-out-cars': {
    assetId: 'burned-out-cars',
    cameraScale: { single: 0.92, split: 1.18 },
    fitWidth: 4.4,
    label: 'burned-out cars',
    objectClass: 'vehicle',
    rotationY: -0.24,
    splitOffset: 2.85,
    targetY: 0.9,
    url: '/assets-local/labs/manufactured-material/test-cases/burned-out-cars/model.glb',
  },
  beach: {
    assetId: 'old-beach-props',
    cameraScale: { single: 0.74, split: 0.86 },
    fitWidth: 4.25,
    label: 'beach props',
    objectClass: 'prop',
    rotationY: -0.24,
    splitOffset: 2.65,
    targetY: 0.7,
    url: '/assets-local/labs/manufactured-material/test-cases/beach/model.glb',
  },
  'bus-station': {
    assetId: 'bus-station',
    cameraScale: { single: 0.82, split: 0.9 },
    fitWidth: 3.8,
    label: 'bus station',
    objectClass: 'infrastructure',
    rotationY: -0.24,
    splitOffset: 2.4,
    targetY: 1,
    url: '/assets-local/labs/manufactured-material/test-cases/bus-station/model.glb',
  },
  apartment: {
    assetId: 'modular-apartment-building',
    cameraScale: { single: 0.9, split: 1.38 },
    fitWidth: 4.8,
    label: 'apartment building',
    objectClass: 'buildingExterior',
    rotationY: -0.38,
    splitOffset: 3.05,
    targetY: 1.22,
    url: '/assets-local/labs/manufactured-material/test-cases/apartment/model.glb',
  },
  'ground-floor-kit': {
    assetId: 'modular-building-ground-floor-kit-wmfiaaldw-mid',
    cameraScale: { single: 1.15, split: 1.62 },
    fitWidth: 4.8,
    label: 'ground-floor kit',
    objectClass: 'buildingExterior',
    rotationY: -0.38,
    splitOffset: 3.05,
    targetY: 1.42,
    url: '/assets-local/labs/manufactured-material/test-cases/ground-floor-kit/model.glb',
  },
  'living-room': {
    assetId: 'living-room-with-curtains',
    cameraPosition: {
      single: [6.5, 1.8, 2.2],
      split: [9, 2.4, 3.5],
    },
    cameraScale: { single: 1, split: 1 },
    fitWidth: 4.8,
    label: 'living room',
    objectClass: 'interiorScene',
    rotationY: -0.20,
    singleOffsetX: 0.8,
    splitOffset: 2.65,
    targetY: 1.1,
    url: '/assets-local/labs/manufactured-material/test-cases/living-room/model.glb',
  },
  'bicycle-collection': {
    assetId: 'bicycle-collection',
    cameraScale: { single: 0.92, split: 1.18 },
    fitWidth: 4.4,
    label: 'bicycle collection',
    objectClass: 'vehicle',
    rotationY: -0.24,
    splitOffset: 2.85,
    targetY: 0.9,
    url: '/assets-local/labs/manufactured-material/test-cases/bicycle-collection/model.glb',
  },
  'wooden-crate-01': {
    assetId: 'polyhaven-wooden-crate-01',
    cameraScale: { single: 0.92, split: 1 },
    fitWidth: 2.2,
    label: 'Wooden Crate 01',
    objectClass: 'prop',
    rotationY: -0.24,
    splitOffset: 1.55,
    targetY: 0.52,
    url: '/manufactured-material-lab/cc0/polyhaven/wooden_crate_01/wooden_crate_01_1k.gltf',
  },
};

// These are import annotations for source GLBs that do not yet carry
// urbanMaterial in glTF extras. They describe material identity once; they
// are deliberately separate from the shader controls below.
const BENCHMARK_IMPORT_CLASSIFICATIONS = Object.freeze({
  dumpster: Object.freeze([
    { mesh: /^Container/, value: { baseMaterial: 'metal', finish: 'painted', structuralRole: 'primaryMass' } },
    { mesh: /^Wheels/, value: { baseMaterial: 'rubber', finish: 'matte', structuralRole: 'secondaryStructure' } },
    { mesh: /^Handle/, value: { baseMaterial: 'metal', finish: 'raw', structuralRole: 'fastener' } },
    { mesh: /^Side/, value: { baseMaterial: 'metal', finish: 'painted', structuralRole: 'trim' } },
    { mesh: /^Top/, value: { baseMaterial: 'metal', finish: 'painted', structuralRole: 'secondaryStructure' } },
  ]),
  streetcar: Object.freeze([
    {
      value: {
        baseMaterial: 'genericDielectric',
        confidence: 0.25,
        finish: 'matte',
        classificationSource: 'mixedAtlas',
        structuralRole: 'primaryMass',
      },
    },
  ]),
  'burned-out-cars': Object.freeze([
    {
      value: {
        baseMaterial: 'genericDielectric',
        confidence: 0.25,
        finish: 'matte',
        classificationSource: 'mixedAtlas',
        structuralRole: 'primaryMass',
      },
    },
  ]),
  'wooden-crate-01': Object.freeze([
    {
      value: {
        baseMaterial: 'genericDielectric',
        confidence: 0.35,
        finish: 'matte',
        classificationSource: 'mixedAtlas',
        structuralRole: 'primaryMass',
      },
    },
  ]),
  beach: Object.freeze([
    {
      value: {
        baseMaterial: 'genericDielectric',
        confidence: 0.2,
        finish: 'matte',
        classificationSource: 'mixedAtlas',
        structuralRole: 'primaryMass',
      },
    },
  ]),
  'bus-station': Object.freeze([
    {
      material: /^M_Electrical$/,
      value: {
        baseMaterial: 'composite',
        contentFlags: ['display'],
        finish: 'matte',
        structuralRole: 'secondaryStructure',
      },
    },
    { material: /^M_Body$/, value: { baseMaterial: 'metal', finish: 'painted', structuralRole: 'primaryMass' } },
    {
      material: /^M_Lights$/,
      value: {
        baseMaterial: 'polymer',
        contentFlags: ['emissive'],
        finish: 'polished',
        structuralRole: 'lightEmitter',
      },
    },
    {
      material: /^M_Signs$/,
      value: {
        baseMaterial: 'composite',
        contentFlags: ['graphic', 'emissive'],
        finish: 'matte',
        structuralRole: 'graphic',
      },
    },
    {
      material: /^M_Glass$/,
      value: {
        baseMaterial: 'glass',
        finish: 'polished',
        renderMode: 'translucent',
        structuralRole: 'window',
      },
    },
    { material: /^M_Floor$/, value: { baseMaterial: 'mineral', finish: 'raw', structuralRole: 'primaryMass' } },
  ]),
  apartment: Object.freeze([
    { material: /Trim_Kit/, value: { baseMaterial: 'mineral', finish: 'raw', structuralRole: 'trim' } },
    { material: /(Flat_Roof|Roof_Kit|Gable_Kit)/, value: { baseMaterial: 'mineral', finish: 'raw', structuralRole: 'secondaryStructure' } },
    { material: /Asphalt/, value: { baseMaterial: 'mineral', finish: 'raw', structuralRole: 'primaryMass' } },
    { material: /Marble/, value: { baseMaterial: 'mineral', finish: 'polished', structuralRole: 'primaryMass' } },
    { material: /Floor/, value: { baseMaterial: 'mineral', finish: 'raw', structuralRole: 'primaryMass' } },
  ]),
  'ground-floor-kit': Object.freeze([
    {
      value: {
        baseMaterial: 'genericDielectric',
        confidence: 0.3,
        finish: 'matte',
        classificationSource: 'mixedAtlas',
        structuralRole: 'primaryMass',
      },
    },
  ]),
  'living-room': Object.freeze([
    {
      material: /^Material\.019$/,
      value: {
        baseMaterial: 'metal',
        finish: 'raw',
        structuralRole: 'fastener',
      },
    },
    {
      material: /^WindowFrame__0$/,
      value: {
        baseMaterial: 'composite',
        finish: 'painted',
        structuralRole: 'trim',
      },
    },
    {
      material: /^Window_material$/,
      value: {
        baseMaterial: 'glass',
        finish: 'polished',
        renderMode: 'transmissive',
        structuralRole: 'window',
      },
    },
    {
      material: /^Curtain_(Thicker|SSS|Underside)$/,
      value: {
        baseMaterial: 'textile',
        finish: 'matte',
        structuralRole: 'secondaryStructure',
      },
    },
    {
      material: /^Material\.005$/,
      value: {
        baseMaterial: 'textile',
        finish: 'matte',
        renderMode: 'translucent',
        structuralRole: 'secondaryStructure',
      },
    },
    {
      material: /^Plastic_Handle_material$/,
      value: {
        baseMaterial: 'polymer',
        finish: 'matte',
        structuralRole: 'fastener',
      },
    },
    {
      material: /^Sill_material$/,
      value: {
        baseMaterial: 'composite',
        finish: 'painted',
        structuralRole: 'trim',
      },
    },
    {
      material: /^ground$/,
      value: {
        baseMaterial: 'mineral',
        finish: 'raw',
        structuralRole: 'primaryMass',
      },
    },
    {
      mesh: /^Cube001_Material006/,
      value: {
        baseMaterial: 'genericDielectric',
        finish: 'matte',
        structuralRole: 'trim',
      },
    },
    {
      material: /^mirror$/,
      value: {
        baseMaterial: 'glass',
        finish: 'mirror',
        structuralRole: 'secondaryStructure',
      },
    },
  ]),
  'bicycle-collection': Object.freeze([
    { material: /^Bicycle_Rusty$/, value: { baseMaterial: 'metal', finish: 'raw', structuralRole: 'primaryMass' } },
    { material: /^Bcycle_New$/, value: { baseMaterial: 'metal', finish: 'painted', structuralRole: 'primaryMass' } },
    { material: /^(Plaster|Concrete)$/, value: { baseMaterial: 'mineral', finish: 'raw', structuralRole: 'primaryMass' } },
  ]),
});

const BENCHMARK_VEGETATION_ROUTES = Object.freeze({
  'bicycle-collection': Object.freeze([
    {
      material: /^Arch-Leaf$/,
      role: VEGETATION_MATERIAL_ROLES.foliageCard,
    },
    {
      material: /^Arch-Twig$/,
      role: VEGETATION_MATERIAL_ROLES.woodySurface,
    },
  ]),
});

// Lab edits are an in-memory overlay. They intentionally do not mutate the
// GLB or its geometry; exporting creates the durable sidecar representation.
const temporaryMaterialClassifications = new Map();
const expandedMaterialGroups = new Set();

function materialClassificationKey(object, material) {
  return `${object?.name ?? ''}::${material?.name ?? ''}`;
}

const LIGHTING_PRESETS = Object.freeze({
  dawn: Object.freeze({
    background: 0xb7b5d2,
    backdrop: 0xd0b9ca,
    curb: 0x655f70,
    exposure: 1.02,
    fill: Object.freeze({
      color: 0x7799e8,
      intensity: 0.32,
    }),
    fog: 0xb7b5d2,
    ground: 0x858487,
    hemisphere: Object.freeze({
      ground: 0x665760,
      intensity: 0.64,
      sky: 0xc8d2f2,
    }),
    response: 0xb4c5ea,
    rim: Object.freeze({
      color: 0xff8fbd,
      intensity: 0.2,
    }),
    sun: Object.freeze({
      color: 0xffad72,
      intensity: 1.38,
      position: Object.freeze([-6.5, 3.2, 5.5]),
    }),
  }),
  day: Object.freeze({
    background: 0x9bc9e8,
    backdrop: 0xa8d4ed,
    curb: 0x607983,
    exposure: 1.04,
    fill: Object.freeze({
      color: 0xb9dcff,
      intensity: 0.14,
    }),
    fog: 0x9bc9e8,
    ground: 0x88a6a3,
    hemisphere: Object.freeze({
      ground: 0x78866e,
      intensity: 0.74,
      sky: 0xe6f5ff,
    }),
    response: 0xaacbe0,
    rim: Object.freeze({
      color: 0xffffff,
      intensity: 0.12,
    }),
    sun: Object.freeze({
      color: 0xfff8ea,
      intensity: 2.05,
      position: Object.freeze([-5.5, 9.5, 6.5]),
    }),
  }),
  sunset: Object.freeze({
    background: 0xc37e78,
    backdrop: 0x9c6672,
    curb: 0x584b58,
    exposure: 1.02,
    fill: Object.freeze({
      color: 0x638dff,
      intensity: 0.34,
    }),
    fog: 0xc37e78,
    ground: 0x766966,
    hemisphere: Object.freeze({
      ground: 0x5b474a,
      intensity: 0.58,
      sky: 0xc8a3b8,
    }),
    response: 0x8da5dd,
    rim: Object.freeze({
      color: 0xff65a9,
      intensity: 0.28,
    }),
    sun: Object.freeze({
      color: 0xff783c,
      intensity: 1.72,
      position: Object.freeze([-7, 2.4, 5.2]),
    }),
  }),
  night: Object.freeze({
    background: 0x0b1632,
    backdrop: 0x111c3b,
    curb: 0x27324a,
    exposure: 1.08,
    fill: Object.freeze({
      color: 0xa35fff,
      intensity: 0.42,
    }),
    fog: 0x0b1632,
    ground: 0x35465c,
    hemisphere: Object.freeze({
      ground: 0x20283b,
      intensity: 0.5,
      sky: 0x688bc6,
    }),
    response: 0x5c84bf,
    rim: Object.freeze({
      color: 0x47ddff,
      intensity: 0.48,
    }),
    sun: Object.freeze({
      color: 0x9bc8ff,
      intensity: 0.84,
      position: Object.freeze([-4.5, 7.5, 4.5]),
    }),
  }),
});

function cloneForComparison(source) {
  const clone = source.clone(true);
  clone.traverse((object) => {
    if (!object.isMesh) return;
    object.material = Array.isArray(object.material)
      ? object.material.map((material) => material.clone())
      : object.material.clone();
    object.castShadow = true;
    object.receiveShadow = true;
  });
  return clone;
}

function fitModelToMeters(root, widthMeters = 2.9) {
  root.updateWorldMatrix(true, true);
  const initialBox = new THREE.Box3().setFromObject(root);
  const initialSize = initialBox.getSize(new THREE.Vector3());
  const horizontalSpan = Math.max(initialSize.x, initialSize.z, 0.001);
  root.scale.multiplyScalar(widthMeters / horizontalSpan);
  root.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  root.position.x -= center.x;
  root.position.y -= box.min.y;
  root.position.z -= center.z;
  root.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(root);
}

function resolveBenchmarkClassification(modelId, object, sourceMaterial) {
  const temporary = temporaryMaterialClassifications
    .get(modelId)
    ?.get(materialClassificationKey(object, sourceMaterial));
  if (temporary) return temporary;
  const rules = BENCHMARK_IMPORT_CLASSIFICATIONS[modelId] ?? [];
  const rule = rules.find((candidate) => (
    (!candidate.mesh || candidate.mesh.test(object?.name ?? ''))
    && (!candidate.material || candidate.material.test(sourceMaterial?.name ?? ''))
  ));
  if (!rule) return classifyManufacturedMaterial(object, sourceMaterial);
  return createManufacturedMaterialClassification({
    renderMode: 'opaque',
    classificationSource: 'benchmarkImport',
    confidence: 1,
    ...rule.value,
  });
}

function resolveBenchmarkVegetationRole(modelId, object, sourceMaterial) {
  const rules = BENCHMARK_VEGETATION_ROUTES[modelId] ?? [];
  return rules.find((candidate) => (
    (!candidate.mesh || candidate.mesh.test(object?.name ?? ''))
    && (!candidate.material || candidate.material.test(sourceMaterial?.name ?? ''))
  ))?.role ?? null;
}

function stylizeModel(root, controls, modelId) {
  const meshes = [];
  const classifications = [];
  const vegetationRoutes = [];
  root.traverse((object) => {
    if (!object.isMesh || !object.material) return;
    const sourceMaterials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    const meshClassifications = [];
    const meshVegetationRoles = [];
    const styledMaterials = sourceMaterials.map((source) => {
      const vegetationRole = resolveBenchmarkVegetationRole(
        modelId,
        object,
        source,
      );
      if (vegetationRole) {
        meshVegetationRoles.push(vegetationRole);
        vegetationRoutes.push({
          material: source?.name ?? object.name ?? 'material',
          object: object.name ?? '',
          role: vegetationRole,
        });
        return createImportedVegetationMaterial(source, {
          role: vegetationRole,
        });
      }
      const classification = resolveBenchmarkClassification(modelId, object, source);
      meshClassifications.push(classification);
      classifications.push({
        material: source?.name ?? object.name ?? 'material',
        object: object.name ?? '',
        ...classification,
      });
      return createUrbanAnimePropMaterial(source, {
        classification,
        controls,
      });
    });
    object.material = Array.isArray(object.material)
      ? styledMaterials
      : styledMaterials[0];
    object.userData.urbanMaterialClassifications = meshClassifications;
    object.userData.vegetationMaterialRoles = meshVegetationRoles;
    if (meshVegetationRoles.length === 0) meshes.push(object);
    object.castShadow = true;
    object.receiveShadow = true;
  });

  const edgeMaterial = new THREE.LineBasicMaterial({
    color: 0x080b18,
    opacity: 0.5,
    transparent: true,
  });
  const silhouetteMaterial = new THREE.MeshBasicMaterial({
    color: 0x070a14,
    depthWrite: false,
    side: THREE.BackSide,
  });
  silhouetteMaterial.name = 'Locked urban · silhouette ink';
  silhouetteMaterial.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      'vec3 transformed = position + normal * 0.014;',
    );
  };
  silhouetteMaterial.customProgramCacheKey = () => 'locked-urban-silhouette-v2';

  for (const mesh of meshes) {
    const acceptsSolidSilhouette = (
      mesh.userData.urbanMaterialClassifications ?? []
    ).every((classification) => (
      classification.renderMode !== 'translucent'
      && classification.renderMode !== 'transmissive'
    ));
    const silhouette = new THREE.Mesh(mesh.geometry, silhouetteMaterial);
    silhouette.name = `${mesh.name || 'mesh'} · silhouette ink`;
    silhouette.renderOrder = 1;
    silhouette.userData.urbanLookControl = 'silhouetteInkEnabled';
    silhouette.userData.urbanLookEligible = acceptsSolidSilhouette;
    silhouette.visible = (
      controls.silhouetteInkEnabled.value > 0.5
      && acceptsSolidSilhouette
    );
    mesh.add(silhouette);

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry, 48),
      edgeMaterial,
    );
    edges.name = `${mesh.name || 'mesh'} · selective crease ink`;
    edges.renderOrder = 2;
    edges.userData.urbanLookControl = 'edgeInkEnabled';
    edges.visible = controls.edgeInkEnabled.value > 0.5;
    mesh.add(edges);
  }

  root.userData.urbanMaterialClassifications = classifications;
  root.userData.vegetationMaterialRoutes = vegetationRoutes;
  const uniqueClassifications = new Map();
  for (const classification of classifications) {
    const key = [
      classification.material,
      classification.object,
      classification.baseMaterial,
      classification.finish,
      classification.renderMode,
      classification.structuralRole,
      classification.contentFlags.join('+') || 'none',
    ].join('/');
    if (!uniqueClassifications.has(key)) uniqueClassifications.set(key, classification);
  }
  root.userData.urbanMaterialSummary = [...uniqueClassifications.values()];
}

function groupMaterialClassifications(classifications) {
  const materialGroups = new Map();
  for (const classification of classifications) {
    const key = [
      classification.material,
      classification.baseMaterial,
      classification.finish,
      classification.renderMode,
      classification.structuralRole,
      classification.contentFlags.join('+'),
      classification.classificationSource,
      classification.confidence,
    ].join('::');
    const group = materialGroups.get(key) ?? {
      classifications: [],
      objects: new Set(),
      representative: classification,
    };
    group.classifications.push(classification);
    if (classification.object) group.objects.add(classification.object);
    materialGroups.set(key, group);
  }
  return [...materialGroups.values()];
}

function formatMaterialSummary(root) {
  const classifications = root?.userData?.urbanMaterialSummary ?? [];
  const materialGroups = groupMaterialClassifications(classifications);
  const counts = new Map();
  for (const { representative: classification } of materialGroups) {
    const label = classification.baseMaterial;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const materialSummary = [...counts]
    .map(([label, count]) => `${label} × ${count}`)
    .join(' · ');
  const vegetationCounts = new Map();
  for (const route of root?.userData?.vegetationMaterialRoutes ?? []) {
    vegetationCounts.set(
      route.role,
      (vegetationCounts.get(route.role) ?? 0) + 1,
    );
  }
  const vegetationSummary = [...vegetationCounts]
    .map(([role, count]) => `nature ${role} × ${count}`)
    .join(' · ');
  const resolvedSummary = [materialSummary, vegetationSummary]
    .filter(Boolean)
    .join(' · ');
  if (!resolvedSummary) return 'No material classifications resolved.';
  const auditCount = materialGroups
    .filter(({ representative: classification }) => (
      classification.classificationSource === 'fallback'
      || classification.classificationSource === 'mixedAtlas'
    ))
    .length;
  return auditCount > 0
    ? `${resolvedSummary} · ${auditCount} classification audit${auditCount === 1 ? '' : 's'} required`
    : resolvedSummary;
}

const CLASSIFICATION_FIELDS = Object.freeze([
  Object.freeze({
    key: 'baseMaterial',
    label: 'Base material',
    values: MANUFACTURED_MATERIAL_BASES,
  }),
  Object.freeze({
    key: 'finish',
    label: 'Finish',
    values: MANUFACTURED_MATERIAL_FINISHES,
  }),
  Object.freeze({
    key: 'renderMode',
    label: 'Render mode',
    values: MANUFACTURED_RENDER_MODES,
  }),
  Object.freeze({
    key: 'structuralRole',
    label: 'Structural role',
    values: MANUFACTURED_STRUCTURAL_ROLES,
  }),
]);

const CONTENT_FLAG_OPTIONS = Object.freeze(
  Array.from({ length: 2 ** MANUFACTURED_CONTENT_FLAGS.length }, (_, mask) => (
    MANUFACTURED_CONTENT_FLAGS.filter((_, index) => (mask & (1 << index)) !== 0)
  )),
);

function appendClassificationSelect(container, {
  label,
  onChange,
  selected,
  values,
}) {
  const field = document.createElement('label');
  const caption = document.createElement('span');
  caption.textContent = label;
  const select = document.createElement('select');
  for (const value of values) {
    const option = document.createElement('option');
    const optionValue = Array.isArray(value) ? value.join('+') : value;
    option.value = optionValue;
    option.textContent = optionValue || 'none';
    option.selected = optionValue === selected;
    select.appendChild(option);
  }
  select.addEventListener('change', () => onChange(select.value));
  field.append(caption, select);
  container.appendChild(field);
}

function updateMaterialViewButtonLabel(count) {
  const materialViewButton = document.querySelector(
    '[data-panel-view-button="materials"]',
  );
  if (materialViewButton) {
    materialViewButton.textContent = `Material tags (${count})`;
  }
}

function reflectionProviderStatusText(state, consumerCount = 0) {
  if (state === 'capturing') return 'Capturing scene…';
  if (state === 'probe') {
    return consumerCount > 1
      ? `Scene probe active · ${consumerCount}`
      : 'Scene probe active';
  }
  if (state === 'error') return 'Scene probe failed';
  return 'No reflection provider';
}

function updateReflectionProviderStatus(state, consumerCount = 0) {
  document.body.dataset.reflectionProvider = state;
  document.body.dataset.reflectionConsumers = String(consumerCount);
  document.querySelectorAll('[data-reflection-provider-status]').forEach((status) => {
    status.dataset.state = state;
    status.textContent = reflectionProviderStatusText(state, consumerCount);
  });
}

function renderMaterialInspector(root, modelId, onClassificationChange) {
  const inspector = document.getElementById('material-inspector');
  if (!inspector) return;
  inspector.replaceChildren();
  const classifications = root?.userData?.urbanMaterialSummary ?? [];
  const vegetationRoutes = root?.userData?.vegetationMaterialRoutes ?? [];
  if (classifications.length === 0 && vegetationRoutes.length === 0) {
    updateMaterialViewButtonLabel(0);
    const empty = document.createElement('p');
    empty.className = 'inspector-empty';
    empty.textContent = 'No material classifications resolved.';
    inspector.appendChild(empty);
    inspector.dataset.model = modelId;
    return;
  }

  const materialGroups = groupMaterialClassifications(classifications);
  const vegetationGroups = new Map();
  for (const route of vegetationRoutes) {
    const key = `${route.material}::${route.role}`;
    const group = vegetationGroups.get(key) ?? {
      material: route.material,
      objects: new Set(),
      role: route.role,
    };
    if (route.object) group.objects.add(route.object);
    vegetationGroups.set(key, group);
  }
  updateMaterialViewButtonLabel(materialGroups.length + vegetationGroups.size);

  for (const route of vegetationGroups.values()) {
    const card = document.createElement('article');
    card.className = 'material-card';
    card.dataset.domain = 'vegetation';
    const head = document.createElement('div');
    head.className = 'material-card-head';
    const name = document.createElement('strong');
    name.textContent = route.material || '(unnamed material)';
    const source = document.createElement('small');
    source.textContent = 'nature shader route';
    head.append(name, source);
    const objectName = document.createElement('p');
    objectName.className = 'material-object';
    const objectNames = [...route.objects];
    objectName.title = objectNames.join(', ');
    objectName.textContent = objectNames.length > 1
      ? `${objectNames.length} meshes · ${objectNames.slice(0, 2).join(', ')}${objectNames.length > 2 ? '…' : ''}`
      : objectNames[0] || '(unnamed mesh)';
    const summary = document.createElement('div');
    summary.className = 'material-card-summary';
    const summaryText = document.createElement('span');
    summaryText.textContent = `${route.role} · vegetation profile`;
    summary.append(summaryText);
    card.append(head, objectName, summary);
    inspector.appendChild(card);
  }

  for (const group of materialGroups) {
    const { representative: classification } = group;
    const card = document.createElement('article');
    card.className = 'material-card';
    const head = document.createElement('div');
    head.className = 'material-card-head';
    const name = document.createElement('strong');
    name.textContent = classification.material || '(unnamed material)';
    const source = document.createElement('small');
    source.textContent =
      `${classification.classificationSource} · ${Math.round(classification.confidence * 100)}%`;
    head.append(name, source);
    const objectName = document.createElement('p');
    objectName.className = 'material-object';
    const objectNames = [...group.objects];
    objectName.title = objectNames.join(', ');
    objectName.textContent = objectNames.length > 1
      ? `${objectNames.length} meshes · ${objectNames.slice(0, 2).join(', ')}${objectNames.length > 2 ? '…' : ''}`
      : objectNames[0] || '(unnamed mesh)';
    const fields = document.createElement('div');
    fields.className = 'material-fields';
    const groupId = [
      modelId,
      classification.material,
      ...objectNames,
    ].join('::');
    const fieldsId = `material-fields-${modelId}-${inspector.childElementCount}`;
    fields.id = fieldsId;
    fields.hidden = !expandedMaterialGroups.has(groupId);

    for (const field of CLASSIFICATION_FIELDS) {
      appendClassificationSelect(fields, {
        label: field.label,
        onChange: (value) => onClassificationChange(
          group.classifications,
          field.key,
          value,
        ),
        selected: classification[field.key],
        values: field.values,
      });
    }
    appendClassificationSelect(fields, {
      label: 'Content flags',
      onChange: (value) => onClassificationChange(
        group.classifications,
        'contentFlags',
        value ? value.split('+') : [],
      ),
      selected: classification.contentFlags.join('+'),
      values: CONTENT_FLAG_OPTIONS,
    });
    const summary = document.createElement('div');
    summary.className = 'material-card-summary';
    const summaryText = document.createElement('span');
    summaryText.textContent = [
      classification.baseMaterial,
      classification.finish,
      classification.renderMode,
      classification.structuralRole,
      ...classification.contentFlags,
    ].join(' · ');
    const providerStatus = classification.finish === 'mirror'
      ? document.createElement('em')
      : null;
    if (providerStatus) {
      const providerState = document.body.dataset.reflectionProvider
        ?? 'not-required';
      const consumerCount = Number(
        document.body.dataset.reflectionConsumers ?? 0,
      );
      providerStatus.className = 'material-provider-status';
      providerStatus.dataset.reflectionProviderStatus = '';
      providerStatus.dataset.state = providerState;
      providerStatus.textContent = reflectionProviderStatusText(
        providerState,
        consumerCount,
      );
    }
    const toggle = document.createElement('button');
    const closedLabel = (
      classification.classificationSource === 'fallback'
      || classification.classificationSource === 'mixedAtlas'
    ) ? 'Review' : 'Edit';
    const syncExpandedState = (expanded) => {
      card.dataset.expanded = String(expanded);
      fields.hidden = !expanded;
      toggle.textContent = expanded ? 'Done' : closedLabel;
      toggle.setAttribute('aria-expanded', String(expanded));
    };
    toggle.type = 'button';
    toggle.setAttribute('aria-controls', fieldsId);
    toggle.addEventListener('click', () => {
      const expanded = fields.hidden;
      if (expanded) {
        expandedMaterialGroups.add(groupId);
      } else {
        expandedMaterialGroups.delete(groupId);
      }
      syncExpandedState(expanded);
    });
    syncExpandedState(expandedMaterialGroups.has(groupId));
    summary.append(summaryText);
    if (providerStatus) summary.append(providerStatus);
    summary.append(toggle);
    card.append(head, objectName, summary, fields);
    inspector.appendChild(card);
  }
  inspector.dataset.model = modelId;
}

function setPanelView(requestedView) {
  const sections = [
    ...document.querySelectorAll('.panel > [data-panel-view]'),
  ];
  const fallbackView = sections[0]?.dataset.panelView ?? 'look';
  const view = sections.some(
    (section) => section.dataset.panelView === requestedView,
  )
    ? requestedView
    : fallbackView;
  sections.forEach((section) => {
    section.hidden = section.dataset.panelView !== view;
  });
  document.querySelectorAll('[data-panel-view-button]').forEach((button) => {
    const isActive = button.dataset.panelViewButton === view;
    button.dataset.active = String(isActive);
    button.setAttribute('aria-selected', String(isActive));
  });
  updateMaterialViewButtonLabel(document.querySelectorAll('.material-card').length);
  document.body.dataset.panelView = view;
  document.querySelector('.panel')?.scrollTo({ top: 0 });
}

function manifestForModel(root, modelId) {
  const spec = TEST_MODELS[modelId];
  const assignments = (root?.userData?.urbanMaterialSummary ?? [])
    .map((classification) => {
      const selector = {};
      if (classification.object) selector.objectName = classification.object;
      if (classification.material) selector.materialName = classification.material;
      if (Object.keys(selector).length === 0) return null;
      return {
        selector,
        classification: {
          version: 1,
          baseMaterial: classification.baseMaterial,
          finish: classification.finish,
          renderMode: classification.renderMode,
          structuralRole: classification.structuralRole,
          contentFlags: [...classification.contentFlags],
        },
      };
    })
    .filter(Boolean);
  return {
    type: MANUFACTURED_MATERIAL_MANIFEST_TYPE,
    version: MANUFACTURED_MATERIAL_MANIFEST_VERSION,
    assetId: spec.assetId,
    objectClass: spec.objectClass,
    assignments,
  };
}

function downloadMaterialManifest(root, modelId) {
  const manifest = manifestForModel(root, modelId);
  const blob = new Blob([`${JSON.stringify(manifest, null, 2)}\n`], {
    type: 'application/json',
  });
  const link = document.createElement('a');
  link.download = `${manifest.assetId}.toonlab-materials.json`;
  link.href = URL.createObjectURL(blob);
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 0);
}

function addBenchmarkStage(scene) {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(24, 16),
    new THREE.MeshStandardMaterial({
      color: 0x697783,
      metalness: 0,
      roughness: 0.93,
    }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(24, 9),
    new THREE.MeshBasicMaterial({ color: 0x101425 }),
  );
  backdrop.position.set(0, 4.5, -4.1);
  backdrop.receiveShadow = true;
  scene.add(backdrop);

  const curb = new THREE.Mesh(
    new THREE.BoxGeometry(14, 0.26, 0.65),
    new THREE.MeshStandardMaterial({ color: 0x22283a, roughness: 0.9 }),
  );
  curb.position.set(0, 0.13, -2.5);
  curb.castShadow = true;
  curb.receiveShadow = true;
  scene.add(curb);

  return { backdrop, curb, ground };
}

async function main() {
  const params = new URLSearchParams(location.search);
  // This benchmark deliberately uses the classic renderer. The locked look is
  // a conventional toon shader now, so its output does not depend on WebGPU,
  // Three's node-material backend, or a browser-specific GPU implementation.
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, Number(params.get('dpr')) || 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  (document.getElementById('stage') ?? document.body).appendChild(renderer.domElement);
  document.body.dataset.rendererBackend = 'webgl2-fallback';

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x090b17);
  scene.fog = new THREE.Fog(new THREE.Color(0x090b17), 18, 42);

  const camera = new THREE.PerspectiveCamera(
    34,
    window.innerWidth / window.innerHeight,
    0.05,
    100,
  );
  const cameraPositions = {
    single: new THREE.Vector3(5.05, 3.05, 6.05),
    split: new THREE.Vector3(6.7, 3.7, 7.8),
  };
  camera.position.copy(cameraPositions.split);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.target.set(0, 1.25, 0);

  // Neutral key/fill preserve authored hue. The optional shader rim owns the
  // cyan/magenta accent, so source identity is never globally recolored.
  const hemisphere = new THREE.HemisphereLight(0xdce9f4, 0x353948, 1.05);
  scene.add(hemisphere);
  const sun = new THREE.DirectionalLight(0xfff4df, 3.25);
  sun.position.set(-5.5, 9.5, 6.5);
  sun.target.position.set(0, 0.8, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -8;
  sun.shadow.camera.right = 8;
  sun.shadow.camera.top = 7;
  sun.shadow.camera.bottom = -3;
  sun.shadow.camera.near = 0.1;
  sun.shadow.camera.far = 30;
  sun.shadow.bias = -0.00035;
  sun.shadow.normalBias = 0.025;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0xdce8ff, 0.68);
  fill.position.set(6, 4, -5);
  const cyanRim = new THREE.DirectionalLight(0xffffff, 0.38);
  cyanRim.position.set(-6, 3.5, -4);
  scene.add(fill, cyanRim);
  const stage = addBenchmarkStage(scene);
  let refreshManufacturedReflection = () => {};

  function applyLighting(requestedLighting) {
    const lighting = Object.hasOwn(LIGHTING_PRESETS, requestedLighting)
      ? requestedLighting
      : 'day';
    const preset = LIGHTING_PRESETS[lighting];

    scene.background.setHex(preset.background);
    scene.fog.color.setHex(preset.fog);
    renderer.toneMappingExposure = preset.exposure;
    stage.backdrop.material.color.setHex(preset.backdrop);
    stage.curb.material.color.setHex(preset.curb);
    stage.ground.material.color.setHex(preset.ground);

    hemisphere.color.setHex(preset.hemisphere.sky);
    hemisphere.groundColor.setHex(preset.hemisphere.ground);
    hemisphere.intensity = preset.hemisphere.intensity;

    sun.color.setHex(preset.sun.color);
    sun.intensity = preset.sun.intensity;
    sun.position.fromArray(preset.sun.position);
    fill.color.setHex(preset.fill.color);
    fill.intensity = preset.fill.intensity;
    cyanRim.color.setHex(preset.rim.color);
    cyanRim.intensity = preset.rim.intensity;
    shaderControls.materialResponseColor.value.setHex(preset.response);

    document.body.dataset.lighting = lighting;
    document.querySelectorAll('[data-lighting-button]').forEach((button) => {
      button.dataset.active = String(button.dataset.lightingButton === lighting);
    });
    refreshManufacturedReflection();
  }

  const shaderControls = createUrbanPropShaderControls('source');

  function notifyStyleChange() {
    window.dispatchEvent(new CustomEvent('toonlab:manufactured-style-change'));
  }

  function syncStyleControlElements() {
    document.querySelectorAll('[data-layer-button]').forEach((button) => {
      const control = shaderControls[button.dataset.layerButton];
      if (control) button.dataset.active = String(Number(control.value) > 0.5);
    });
    document.querySelectorAll('[data-control]').forEach((input) => {
      const control = shaderControls[input.dataset.control];
      if (!control) return;
      input.value = String(Number(control.value));
      const output = input.parentElement.querySelector('output');
      if (output) output.value = Number(control.value).toFixed(2);
    });
    styledRoots.forEach((root) => {
      root.traverse((object) => {
        const key = object.userData.urbanLookControl;
        if (!key || !shaderControls[key]) return;
        object.visible = Number(shaderControls[key].value) > 0.5
          && object.userData.urbanLookEligible !== false;
      });
    });
    syncBlueTreatmentCheckpoint();
  }

  function getStyleDocument(id = 'manufactured-surface', label = 'Manufactured surface') {
    return createUrbanPropShaderProfileDocument(id, {
      description: 'Manufactured-surface treatment authored in ToonLab.',
      label,
      settings: snapshotUrbanPropShaderControls(shaderControls),
    });
  }

  function applyStyleDocument(document) {
    applyUrbanPropShaderProfile(shaderControls, document);
    syncStyleControlElements();
    return getStyleDocument(document?.id, document?.label);
  }
  const loader = new GLTFLoader();
  const preparedModels = new Map();
  const styledRoots = new Set();
  const loading = document.getElementById('loading');
  let original = null;
  let styled = null;
  let currentModel = null;
  let currentMode = params.get('mode') ?? 'split';
  let modelRequest = 0;
  const manufacturedReflectionProbe = createManufacturedReflectionProbe({
    renderer,
    resolution: 256,
    scene,
  });
  shaderControls.reflectionProbeMap.value =
    manufacturedReflectionProbe.texture;

  refreshManufacturedReflection = () => {
    if (!styled) {
      shaderControls.reflectionProbeAvailable.value = 0;
      updateReflectionProviderStatus('not-required');
      return;
    }

    updateReflectionProviderStatus('capturing');
    const originalVisible = original?.visible;
    const styledVisible = styled.visible;
    if (original) original.visible = false;
    styled.visible = true;
    try {
      const result = manufacturedReflectionProbe.capture(styled);
      shaderControls.reflectionProbeMap.value = result.texture;
      shaderControls.reflectionProbeAvailable.value =
        result.consumerCount > 0 ? 1 : 0;
      updateReflectionProviderStatus(result.mode, result.consumerCount);
    } catch (error) {
      shaderControls.reflectionProbeAvailable.value = 0;
      updateReflectionProviderStatus('error');
      console.error('Failed to capture the manufactured reflection probe', error);
    } finally {
      if (original && originalVisible !== undefined) {
        original.visible = originalVisible;
      }
      styled.visible = styledVisible;
    }
  };

  function frameCamera(mode) {
    const view = mode === 'split' ? 'split' : 'single';
    const spec = TEST_MODELS[currentModel] ?? TEST_MODELS.dumpster;
    const modelCameraPosition = spec.cameraPosition?.[view];
    camera.position
      .copy(
        modelCameraPosition
          ? new THREE.Vector3().fromArray(modelCameraPosition)
          : cameraPositions[view],
      )
      .multiplyScalar(spec.cameraScale[view]);
    controls.target.set(0, spec.targetY, 0);
    controls.update();
  }

  function setNavigationMode(mode = 'rotate') {
    controls.mouseButtons.LEFT = mode === 'pan'
      ? THREE.MOUSE.PAN
      : mode === 'zoom'
        ? THREE.MOUSE.DOLLY
        : THREE.MOUSE.ROTATE;
  }

  function setMode(mode) {
    const resolved = ['original', 'split', 'styled'].includes(mode) ? mode : 'split';
    currentMode = resolved;
    document.body.dataset.mode = resolved;
    if (original && styled) {
      const spec = TEST_MODELS[currentModel] ?? TEST_MODELS.dumpster;
      const splitOffset = spec.splitOffset ?? 1.85;
      const singleOffsetX = spec.singleOffsetX ?? 0;
      const originalBaseX = original.userData.benchmarkBaseX ?? 0;
      const styledBaseX = styled.userData.benchmarkBaseX ?? 0;
      original.visible = resolved !== 'styled';
      styled.visible = resolved !== 'original';
      original.position.x = originalBaseX + (
        resolved === 'split' ? -splitOffset : singleOffsetX
      );
      styled.position.x = styledBaseX + (
        resolved === 'split' ? splitOffset : singleOffsetX
      );
    }
    frameCamera(resolved);
    document.querySelectorAll('[data-mode-button]').forEach((button) => {
      button.dataset.active = String(button.dataset.modeButton === resolved);
    });
    refreshManufacturedReflection();
  }

  async function prepareModel(modelId) {
    if (preparedModels.has(modelId)) return preparedModels.get(modelId);

    const spec = TEST_MODELS[modelId];
    const preparation = (async () => {
      const loadedModel = spec.download
        ? await loadImportedModel(spec.download)
        : (await loader.loadAsync(spec.url)).scene;
      const sourceModel = cloneForComparison(loadedModel);
      const lockedModel = cloneForComparison(loadedModel);
      fitModelToMeters(sourceModel, spec.fitWidth);
      fitModelToMeters(lockedModel, spec.fitWidth);
      sourceModel.userData.benchmarkBaseX = sourceModel.position.x;
      lockedModel.userData.benchmarkBaseX = lockedModel.position.x;
      sourceModel.rotation.y = lockedModel.rotation.y = spec.rotationY;
      stylizeModel(lockedModel, shaderControls, modelId);
      styledRoots.add(lockedModel);
      return { original: sourceModel, styled: lockedModel };
    })().catch((error) => {
      preparedModels.delete(modelId);
      throw error;
    });

    preparedModels.set(modelId, preparation);
    return preparation;
  }

  async function setModel(requestedModel) {
    const modelId = Object.hasOwn(TEST_MODELS, requestedModel)
      ? requestedModel
      : 'dumpster';
    if (currentModel === modelId) return;

    const request = ++modelRequest;
    const spec = TEST_MODELS[modelId];
    loading.hidden = false;
    loading.textContent = `Loading the ${spec.label} benchmark…`;
    document.body.dataset.modelLoading = modelId;
    document.body.dataset.modelReady = 'loading';

    try {
      const pair = await prepareModel(modelId);
      if (request !== modelRequest) return;

      if (original) scene.remove(original);
      if (styled) {
        scene.remove(styled);
        styledRoots.delete(styled);
      }
      original = pair.original;
      styled = pair.styled;
      currentModel = modelId;
      scene.add(original, styled);
      setMode(currentMode);

      document.body.dataset.model = modelId;
      document.body.dataset.modelReady = 'true';
      delete document.body.dataset.modelLoading;
      document.querySelectorAll('[data-model-button]').forEach((button) => {
        button.dataset.active = String(button.dataset.modelButton === modelId);
      });
      const classificationSummary = document.getElementById('classification-summary');
      if (classificationSummary) {
        classificationSummary.textContent = `Resolved materials: ${formatMaterialSummary(styled)}`;
      }
      renderMaterialInspector(styled, modelId, updateMaterialClassification);
      loading.hidden = true;
    } catch (error) {
      if (request !== modelRequest) return;
      delete document.body.dataset.modelLoading;
      document.body.dataset.modelReady = 'error';
      loading.hidden = true;
      console.error(`Failed to load ${modelId}`, error);
      throw error;
    }
  }

  function registerModel(modelId, spec) {
    const id = String(modelId ?? '').trim();
    if (!id) throw new Error('A preview asset id is required.');
    if (!spec?.url && !spec?.download) {
      throw new Error('A preview asset needs a URL or a saved-library download recipe.');
    }
    TEST_MODELS[id] = {
      assetId: spec.assetId ?? id,
      cameraScale: { single: 1, split: 1, ...(spec.cameraScale ?? {}) },
      fitWidth: spec.fitWidth ?? 3,
      label: spec.label ?? id,
      objectClass: spec.objectClass ?? 'prop',
      rotationY: spec.rotationY ?? -0.24,
      splitOffset: spec.splitOffset ?? 1.85,
      targetY: spec.targetY ?? 0.8,
      ...spec,
    };
    preparedModels.delete(id);
    return TEST_MODELS[id];
  }

  async function rebuildCurrentModel() {
    const modelId = currentModel;
    if (!modelId) return;
    preparedModels.delete(modelId);
    currentModel = null;
    await setModel(modelId);
  }

  let classificationQueue = Promise.resolve();
  function updateMaterialClassification(classificationGroup, key, value) {
    const modelId = currentModel || document.body.dataset.modelLoading;
    if (!modelId) return;
    classificationQueue = classificationQueue.catch(() => {}).then(async () => {
      const overrides = temporaryMaterialClassifications.get(modelId) ?? new Map();
      for (const classification of classificationGroup) {
        const identity = `${classification.object ?? ''}::${classification.material ?? ''}`;
        overrides.set(identity, createManufacturedMaterialClassification({
          ...(overrides.get(identity) ?? classification),
          [key]: value,
          classificationSource: 'labOverride',
          confidence: 1,
        }));
      }
      temporaryMaterialClassifications.set(modelId, overrides);
      preparedModels.delete(modelId);
      if (currentModel === modelId) await rebuildCurrentModel();
    }).catch((error) => {
      console.error('Failed to apply temporary material classification', error);
    });
  }

  document.querySelectorAll('[data-model-button]').forEach((button) => {
    button.addEventListener('click', () => {
      setModel(button.dataset.modelButton).catch((error) => {
        console.error(error);
      });
    });
  });
  document.querySelectorAll('[data-panel-view-button]').forEach((button) => {
    button.addEventListener('click', () => {
      setPanelView(button.dataset.panelViewButton);
    });
  });
  setPanelView('look');
  document.querySelectorAll('[data-mode-button]').forEach((button) => {
    button.addEventListener('click', () => setMode(button.dataset.modeButton));
  });
  document.getElementById('reset-material-tags')?.addEventListener('click', () => {
    if (!currentModel) return;
    temporaryMaterialClassifications.delete(currentModel);
    rebuildCurrentModel().catch((error) => {
      console.error('Failed to reset material classifications', error);
    });
  });
  document.getElementById('export-material-manifest')?.addEventListener('click', () => {
    if (!styled || !currentModel) return;
    downloadMaterialManifest(styled, currentModel);
  });
  document.querySelectorAll('[data-palette-button]').forEach((button) => {
    button.addEventListener('click', () => {
      const palette = button.dataset.paletteButton;
      applyUrbanPropPalette(shaderControls, palette);
      document.querySelectorAll('[data-palette-button]').forEach((candidate) => {
        candidate.dataset.active = String(candidate === button);
      });
    });
  });
  document.querySelectorAll('[data-lighting-button]').forEach((button) => {
    button.addEventListener('click', () => {
      applyLighting(button.dataset.lightingButton);
    });
  });

  function setBlueTreatment(treatment) {
    const pastelStrength = treatment === 'pastel'
      ? PASTEL_TARGET_STRENGTH
      : 0;
    const shadowPastelStrength = treatment === 'pastel'
      ? SHADOW_PASTEL_TARGET_STRENGTH
      : 0;
    shaderControls.pastelPaletteEnabled.value = 1;
    shaderControls.pastelStrength.value = pastelStrength;
    shaderControls.shadowPastelStrength.value = shadowPastelStrength;
    document.querySelectorAll('[data-look-button]').forEach((button) => {
      button.dataset.active = String(button.dataset.lookButton === treatment);
    });
    const pastelLayerButton = document.querySelector(
      '[data-layer-button="pastelPaletteEnabled"]',
    );
    if (pastelLayerButton) {
      pastelLayerButton.dataset.active = 'true';
    }
    const pastelInput = document.querySelector('[data-control="pastelStrength"]');
    if (pastelInput) {
      pastelInput.value = String(pastelStrength);
      pastelInput.parentElement.querySelector('output').value =
        pastelStrength.toFixed(2);
    }
    const shadowPastelInput = document.querySelector(
      '[data-control="shadowPastelStrength"]',
    );
    if (shadowPastelInput) {
      shadowPastelInput.value = String(shadowPastelStrength);
      shadowPastelInput.parentElement.querySelector('output').value =
        shadowPastelStrength.toFixed(2);
    }
  }

  function syncBlueTreatmentCheckpoint() {
    const pastelStrength = shaderControls.pastelStrength.value;
    const shadowPastelStrength = shaderControls.shadowPastelStrength.value;
    document.querySelectorAll('[data-look-button]').forEach((button) => {
      const isRoyal = button.dataset.lookButton === 'royal'
        && Math.abs(pastelStrength) < 0.005
        && Math.abs(shadowPastelStrength) < 0.005;
      const isPastel = button.dataset.lookButton === 'pastel'
        && Math.abs(pastelStrength - PASTEL_TARGET_STRENGTH) < 0.005
        && Math.abs(
          shadowPastelStrength - SHADOW_PASTEL_TARGET_STRENGTH
        ) < 0.005;
      button.dataset.active = String(isRoyal || isPastel);
    });
  }

  document.querySelectorAll('[data-look-button]').forEach((button) => {
    button.addEventListener('click', () => {
      setBlueTreatment(button.dataset.lookButton);
    });
  });
  document.querySelectorAll('[data-layer-button]').forEach((button) => {
    button.addEventListener('click', () => {
      const control = shaderControls[button.dataset.layerButton];
      if (!control) {
        button.disabled = true;
        console.warn(
          `Shader layer control "${button.dataset.layerButton}" is unavailable.`,
        );
        return;
      }
      const enabled = control.value <= 0.5;
      control.value = enabled ? 1 : 0;
      button.dataset.active = String(enabled);
      if (button.dataset.layerButton === 'pastelPaletteEnabled') {
        document.querySelectorAll('[data-look-button]').forEach((candidate) => {
          candidate.dataset.active = 'false';
        });
      }
      styledRoots.forEach((root) => {
        root.traverse((object) => {
          if (object.userData.urbanLookControl === button.dataset.layerButton) {
            object.visible = (
              enabled
              && object.userData.urbanLookEligible !== false
            );
          }
        });
      });
      notifyStyleChange();
    });
  });
  document.querySelectorAll('[data-control]').forEach((input) => {
    const output = input.parentElement.querySelector('output');
    const control = shaderControls[input.dataset.control];
    if (!control) {
      input.disabled = true;
      output.value = '—';
      console.warn(
        `Shader value control "${input.dataset.control}" is unavailable.`,
      );
      return;
    }
    const update = () => {
      const value = Number(input.value);
      control.value = value;
      output.value = value.toFixed(2);
      if (
        input.dataset.control === 'pastelStrength'
        || input.dataset.control === 'shadowPastelStrength'
      ) {
        syncBlueTreatmentCheckpoint();
      }
    };
    input.addEventListener('input', () => {
      update();
      notifyStyleChange();
    });
    update();
  });

  setMode(currentMode);
  applyLighting(params.get('lighting') ?? 'day');
  setBlueTreatment('pastel');
  const defaultModel = location.pathname.includes('/legacy/')
    ? 'dumpster'
    : 'wooden-crate-01';
  await setModel(params.get('model') ?? defaultModel);
  window.addEventListener('keydown', (event) => {
    if (event.key.toLowerCase() !== 'c') return;
    frameCamera(document.body.dataset.mode);
  });
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  document.body.dataset.stageReady = 'true';
  let renderFailed = false;
  renderer.setAnimationLoop(() => {
    if (renderFailed) return;
    try {
      controls.update();
      renderer.render(scene, camera);
    } catch (error) {
      renderFailed = true;
      renderer.setAnimationLoop(null);
      document.body.dataset.stageReady = 'error';
      console.error(error);
      const failure = document.createElement('div');
      failure.id = 'render-failure';
      failure.textContent =
        `The 3D renderer stopped: ${error.message}. Reload to retry with WebGL.`;
      document.body.appendChild(failure);
    }
  });

  return {
    applyStyleDocument,
    frameCamera: () => frameCamera(document.body.dataset.mode),
    getCurrentModel: () => currentModel,
    getStyleDocument,
    registerModel,
    resetStyle: () => applyStyleDocument(createUrbanPropShaderProfileDocument(
      'call_me_sensei',
      { label: 'Call Me Sensei' },
    )),
    setLighting: applyLighting,
    setMode,
    setModel,
    setNavigationMode,
    syncStyleControls: syncStyleControlElements,
  };
}

main()
  .then((api) => {
    window.__manufacturedMaterialLab = api;
    window.dispatchEvent(new CustomEvent('toonlab:manufactured-material-ready'));
  })
  .catch((error) => {
    console.error(error);
    document.body.dataset.stageReady = 'error';
    document.body.dataset.modelReady = 'error';
    const loading = document.getElementById('loading');
    if (loading) loading.textContent = `Failed to load the benchmark: ${error.message}`;
  });
