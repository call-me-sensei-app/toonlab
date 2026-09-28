import {
  createUrbanPropShaderProfileDocument,
  createUrbanPropShaderProfileSettings,
} from '../src/environment/index.js';
import {
  createGrassPresetDocument,
  GRASS_SETTING_FIELD_SCHEMA,
} from '../src/vegetation/index.js';
import {
  createGroundShaderPresetDocument,
  GROUND_SHADER_FIELD_SCHEMA,
} from '../src/ground-shader/index.js';
import {
  createRockShaderPresetDocument,
  ROCK_SHADER_FIELD_SCHEMA,
} from '../src/rock-shader/index.js';
import {
  addPieceToDocument,
  applySculptEdit,
  bumpDocumentRevision,
  createRockDocument,
  createRockPiece,
  deserializeRockDocument,
  removePieceFromDocument,
  ROCKGEN_MAX_MESH_EDIT_DELTAS,
  ROCKGEN_MAX_MESH_EDIT_OPERATIONS,
  ROCKGEN_SETTING_FIELD_SCHEMA,
  serializeRockDocument,
} from '../src/rockgen/index.js';
import {
  createSkyParamsDocument,
  SKY_PARAMS_FIELD_SCHEMA,
} from '../src/sky/index.js';
import {
  createTextureRecipeDocument,
  TEXTURE_SETTING_FIELD_SCHEMA,
} from '../src/texgen/index.js';
import {
  createToonPresetDocument,
  TOON_SETTING_FIELD_SCHEMA,
} from '../src/toon/index.js';
import { treeContract } from './tree-lab-contract.mjs';
import {
  createVegetationShaderScopePresetDocument,
  getVegetationShaderScopeFieldSchema,
} from '../src/vegetation/vegetationShaders.js';
import {
  createWaterPresetDocument,
  WATER_SETTING_FIELD_SCHEMA_BY_GROUP,
} from '../src/water/index.js';

const CRUD = Object.freeze(['create', 'read', 'update', 'delete']);

function titleCaseSetting(key) {
  return String(key)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, (letter) => letter.toUpperCase());
}

function manufacturedSurfaceFieldSchema() {
  return Object.freeze({
    settings: Object.freeze(Object.fromEntries(
      Object.entries(createUrbanPropShaderProfileSettings()).map(([key, defaultValue]) => [key, Object.freeze({
        defaultValue: key.endsWith('Enabled') ? Boolean(defaultValue) : defaultValue,
        description: `Configures ${titleCaseSetting(key).toLowerCase()} in the manufactured-surface shader profile.`,
        group: 'settings',
        id: `settings.${key}`,
        key,
        label: titleCaseSetting(key),
        options: null,
        range: null,
        serializable: true,
        type: typeof defaultValue === 'string' && /^#[0-9a-f]{6}$/i.test(defaultValue)
          ? 'color'
          : key.endsWith('Enabled') ? 'boolean' : 'number',
      })]),
    )),
  });
}

const MANUFACTURED_SURFACE_FIELD_SCHEMA = manufacturedSurfaceFieldSchema();

const STARTER_ID = 'mcp-starter';
const STARTER_LABEL = 'MCP starter';

const STARTER_DOCUMENTS = Object.freeze({
  shader: createToonPresetDocument(STARTER_ID, { label: STARTER_LABEL }),
  'tree-shader': createVegetationShaderScopePresetDocument('tree', STARTER_ID, { label: STARTER_LABEL }),
  'grass-shader': createVegetationShaderScopePresetDocument('grass', STARTER_ID, { label: STARTER_LABEL }),
  'flower-shader': createVegetationShaderScopePresetDocument('flower', STARTER_ID, { label: STARTER_LABEL }),
  'rock-shader': createRockShaderPresetDocument(STARTER_ID, { label: STARTER_LABEL }),
  'terrain-shader': createGroundShaderPresetDocument(STARTER_ID, { label: STARTER_LABEL }),
  'manufactured-material': createUrbanPropShaderProfileDocument(STARTER_ID, { label: STARTER_LABEL }),
  water: createWaterPresetDocument(STARTER_ID, { label: STARTER_LABEL }),
  sky: createSkyParamsDocument(STARTER_ID, { label: STARTER_LABEL }),
  'cloud-shader': createSkyParamsDocument(STARTER_ID, { label: STARTER_LABEL }),
  'sky-cloud': createSkyParamsDocument(STARTER_ID, { label: STARTER_LABEL }),
  rock: createRockDocument({ name: STARTER_LABEL, preset: 'boulder', seed: 0, style: 'default' }),
  tree: Object.assign(structuredClone(treeContract.starter), { id: STARTER_ID, label: STARTER_LABEL }),
  grass: createGrassPresetDocument(STARTER_ID, { label: STARTER_LABEL }),
  texture: Object.assign(createTextureRecipeDocument(undefined, { name: STARTER_LABEL }), { id: STARTER_ID }),
});

const FEATURE_ROOTS = Object.freeze({
  shader: 'settings',
  'tree-shader': 'settings',
  'grass-shader': 'settings',
  'flower-shader': 'settings',
  'rock-shader': 'settings',
  'terrain-shader': 'settings',
  'manufactured-material': 'settings',
  water: 'settings',
  sky: 'params',
  'cloud-shader': 'params',
  'sky-cloud': 'params',
  rock: null,
  tree: 'options',
  grass: 'settings',
  texture: 'settings',
});

const ROCK_TOP_FINISHES = Object.freeze({
  bare: Object.freeze({ topCoatStrength: 0 }),
  grass: Object.freeze({ topCoatStrength: 1, topColor: [0.34, 0.52, 0.2], topHeightStart: 0.22, topSlopeStart: 0.42 }),
  sand: Object.freeze({ topCoatStrength: 1, topColor: [0.78, 0.64, 0.42], topHeightStart: 0.24, topSlopeStart: 0.46 }),
  snow: Object.freeze({ topCoatStrength: 1, topColor: [0.9, 0.94, 0.98], topHeightStart: 0.28, topSlopeStart: 0.48 }),
});

function clone(value) {
  return structuredClone(value);
}

function jsonSchemaFromValue(value) {
  if (Array.isArray(value)) {
    return {
      items: value.length > 0 ? jsonSchemaFromValue(value[0]) : {},
      type: 'array',
    };
  }
  // A starter document cannot reveal the intended non-null type for an empty
  // optional slot. Keep the location explicit without incorrectly claiming
  // that every nullable value is an object (descriptions and preset ids are
  // common nullable strings).
  if (value === null) return { type: ['array', 'boolean', 'number', 'object', 'string', 'null'] };
  if (value && typeof value === 'object') {
    const properties = Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, jsonSchemaFromValue(child)]),
    );
    return {
      additionalProperties: true,
      properties,
      required: Object.keys(properties),
      type: 'object',
    };
  }
  if (typeof value === 'number') return { type: Number.isInteger(value) ? 'integer' : 'number' };
  return { type: typeof value };
}

const ROCK_REFERENCE_JSON_SCHEMA = Object.freeze({
  anyOf: [
    { type: 'null' },
    {
      additionalProperties: true,
      properties: {
        archetype: { type: 'string' },
        catalogVersion: { minimum: 1, type: 'integer' },
        family: { type: 'string' },
        id: { minLength: 1, type: 'string' },
        lodRatios: { items: { maximum: 1, exclusiveMinimum: 0, type: 'number' }, maxItems: 3, type: 'array' },
        lodTriangles: { items: { minimum: 1, type: 'integer' }, maxItems: 3, type: 'array' },
        meshEdits: { description: 'Runtime array form; portable serialization may replace this with meshEditsPacked.', type: 'array' },
        meshEditsPacked: {
          additionalProperties: false,
          properties: {
            data: { contentEncoding: 'base64', type: 'string' },
            deltaCount: { maximum: ROCKGEN_MAX_MESH_EDIT_DELTAS, minimum: 0, type: 'integer' },
            encoding: { const: 'base64-f32le-v1' },
            operationCount: { maximum: ROCKGEN_MAX_MESH_EDIT_OPERATIONS, minimum: 0, type: 'integer' },
          },
          required: ['data', 'deltaCount', 'encoding', 'operationCount'],
          type: 'object',
        },
        role: { type: 'string' },
        series: { type: 'string' },
        sourceMode: { const: 'mesh-template' },
        surfaceMode: { enum: ['generated', 'source'], type: 'string' },
        targetTriangles: { minimum: 0, type: 'integer' },
        topFinish: { enum: ['bare', 'custom', 'grass', 'sand', 'snow', 'source'], type: 'string' },
        variation: { maximum: 1, minimum: 0, type: 'number' },
        variationSeed: { minimum: 0, type: 'integer' },
      },
      required: ['catalogVersion', 'id', 'sourceMode', 'surfaceMode', 'topFinish', 'variation', 'variationSeed'],
      type: 'object',
    },
  ],
});

function fullDocumentJsonSchema(entry, starterDocument) {
  const schema = jsonSchemaFromValue(starterDocument);
  const discriminator = discriminatorFor(starterDocument);
  const versionPath = Object.hasOwn(starterDocument, 'version') ? 'version' : 'schemaVersion';
  const labelPath = Object.hasOwn(starterDocument, 'label') ? 'label' : 'name';
  schema.properties[discriminator.path] = { const: discriminator.value, type: 'string' };
  schema.properties[versionPath] = { const: starterDocument[versionPath], type: 'integer' };
  schema.properties[labelPath] = { minLength: 1, type: 'string' };
  if (Object.hasOwn(starterDocument, 'id')) schema.properties.id = { minLength: 1, type: 'string' };
  if (entry.id === 'rock') {
    schema.properties.reference = ROCK_REFERENCE_JSON_SCHEMA;
    schema.properties.pieces = {
      description: 'Ordered SDF pieces. Use mutate_lab_creation structural operations instead of hand-editing this array.',
      items: jsonSchemaFromValue(starterDocument.pieces[0]),
      minItems: 1,
      type: 'array',
    };
    schema.properties.sculptEdits = {
      description: 'Ordered procedural add/subtract sculpt operations.',
      items: { type: 'object' },
      type: 'array',
    };
  }
  return schema;
}

function discriminatorFor(document) {
  if (typeof document.kind === 'string') return { path: 'kind', value: document.kind };
  if (typeof document.schema === 'string') return { path: 'schema', value: document.schema };
  return { path: 'type', value: document.type };
}

function portableDocumentContract(entry) {
  const starterDocument = STARTER_DOCUMENTS[entry.id];
  const discriminator = discriminatorFor(starterDocument);
  const versionPath = Object.hasOwn(starterDocument, 'version') ? 'version' : 'schemaVersion';
  const idPath = Object.hasOwn(starterDocument, 'id') ? 'id' : null;
  const labelPath = Object.hasOwn(starterDocument, 'label') ? 'label' : 'name';
  return {
    creationType: entry.creationTypes[0],
    discriminator,
    docKey: idPath
      ? { path: idPath, requiredSeparately: false }
      : { path: null, requiredSeparately: true },
    featureApplication: entry.id === 'tree' ? 'compiled-authoring-state' : 'direct',
    featureRoot: FEATURE_ROOTS[entry.id],
    idPath,
    labelPath,
    schemaVersion: starterDocument[versionPath],
    starterDocument,
    versionPath,
    jsonSchema: fullDocumentJsonSchema(entry, starterDocument),
  };
}

function lab(definition) {
  return Object.freeze({
    management: Object.freeze({
      creationCrud: definition.creationTypes.length > 0 ? CRUD : [],
      featureDiscovery: true,
    }),
    status: 'beta',
    ...definition,
  });
}

/**
 * The public Beta Labs boundary. Keep this data-only list in the published
 * MCP graph: browser-only `labs/home` is deliberately excluded from npm.
 */
export const LIVE_LABS = Object.freeze([
  lab({ id: 'shader', label: 'Character & Creature Shader Lab', creationTypes: ['toon-preset'], runtime: '@call-me-sensei/toonlab/toon' }),
  lab({ id: 'tree-shader', label: 'Tree Shader Lab', creationTypes: ['vegetation-shader-preset'], runtime: '@call-me-sensei/toonlab/vegetation-shaders', scope: 'tree' }),
  lab({ id: 'grass-shader', label: 'Grass Shader Lab', creationTypes: ['vegetation-shader-preset'], runtime: '@call-me-sensei/toonlab/vegetation-shaders', scope: 'grass' }),
  lab({ id: 'flower-shader', label: 'Flower Shader Lab', creationTypes: ['vegetation-shader-preset'], runtime: '@call-me-sensei/toonlab/vegetation-shaders', scope: 'flower' }),
  lab({ id: 'rock-shader', label: 'Rock & Geology Shader Lab', creationTypes: ['rock-shader-preset'], runtime: '@call-me-sensei/toonlab/rock-shader' }),
  lab({ id: 'terrain-shader', label: 'Terrain & Ground Shader Lab', creationTypes: ['ground-shader-preset'], runtime: '@call-me-sensei/toonlab/ground-shader' }),
  lab({ id: 'manufactured-material', label: 'Manufactured Surface Shader Lab', creationTypes: ['manufactured-surface-profile'], runtime: '@call-me-sensei/toonlab/environment' }),
  lab({ id: 'water', label: 'Water & Liquid Shader Lab', creationTypes: ['water-preset'], runtime: '@call-me-sensei/toonlab/water' }),
  lab({ id: 'sky', label: 'Sky Shader Lab', creationTypes: ['sky-params'], runtime: '@call-me-sensei/toonlab/sky', ownedPaths: ['atmosphere', 'godRays', 'nightSky', 'sun', 'time'] }),
  lab({ id: 'cloud-shader', label: 'Cloud Shader Lab', creationTypes: ['sky-params'], runtime: '@call-me-sensei/toonlab/cloud', ownedPaths: ['cloud'] }),
  lab({ id: 'sky-cloud', label: 'Sky & Cloud Lab', creationTypes: ['sky-params'], runtime: '@call-me-sensei/toonlab/sky', ownedPaths: ['cloud', 'noise', 'sun', 'time'] }),
  lab({ id: 'rock', label: 'Rock & Cliff Generation Lab', creationTypes: ['rock-project'], runtime: '@call-me-sensei/toonlab/rockgen' }),
  lab({ id: 'tree', label: 'Tree & Shrub Generation Lab', creationTypes: ['tree-recipe'], runtime: '@call-me-sensei/toonlab/vegetation' }),
  lab({ id: 'grass', label: 'Grass & Groundcover Generation Lab', creationTypes: ['grass-preset'], runtime: '@call-me-sensei/toonlab/grass' }),
  lab({ id: 'texture', label: 'Texture & Material Map Generation Lab', creationTypes: ['texture-recipe'], runtime: '@call-me-sensei/toonlab/texgen' }),
]);

export const LIVE_LAB_IDS = Object.freeze(LIVE_LABS.map(({ id }) => id));

const FEATURE_SCHEMAS = Object.freeze({
  shader: TOON_SETTING_FIELD_SCHEMA,
  'tree-shader': getVegetationShaderScopeFieldSchema('tree'),
  'grass-shader': getVegetationShaderScopeFieldSchema('grass'),
  'flower-shader': getVegetationShaderScopeFieldSchema('flower'),
  'rock-shader': ROCK_SHADER_FIELD_SCHEMA,
  'terrain-shader': GROUND_SHADER_FIELD_SCHEMA,
  'manufactured-material': MANUFACTURED_SURFACE_FIELD_SCHEMA,
  water: WATER_SETTING_FIELD_SCHEMA_BY_GROUP,
  sky: Object.freeze(Object.fromEntries(['atmosphere', 'godRays', 'nightSky', 'sun', 'time']
    .flatMap((key) => SKY_PARAMS_FIELD_SCHEMA[key] ? [[key, SKY_PARAMS_FIELD_SCHEMA[key]]] : []))),
  'cloud-shader': Object.freeze(Object.fromEntries(['cloud']
    .flatMap((key) => SKY_PARAMS_FIELD_SCHEMA[key] ? [[key, SKY_PARAMS_FIELD_SCHEMA[key]]] : []))),
  'sky-cloud': Object.freeze(Object.fromEntries(['cloud', 'noise', 'sun', 'time']
    .flatMap((key) => SKY_PARAMS_FIELD_SCHEMA[key] ? [[key, SKY_PARAMS_FIELD_SCHEMA[key]]] : []))),
  rock: ROCKGEN_SETTING_FIELD_SCHEMA,
  tree: treeContract.fields,
  grass: GRASS_SETTING_FIELD_SCHEMA,
  texture: TEXTURE_SETTING_FIELD_SCHEMA,
});

const OUTPUTS_BY_LAB = Object.freeze({
  shader: ['portable-preset', 'runtime-style-bundle'],
  'tree-shader': ['portable-preset', 'runtime-style-bundle'],
  'grass-shader': ['portable-preset', 'runtime-style-bundle'],
  'flower-shader': ['portable-preset', 'runtime-style-bundle'],
  'rock-shader': ['portable-preset', 'runtime-style-bundle'],
  'terrain-shader': ['portable-preset', 'runtime-style-bundle'],
  'manufactured-material': ['portable-profile', 'runtime-style-bundle'],
  water: ['portable-preset'],
  sky: ['portable-params'],
  'cloud-shader': ['portable-params'],
  'sky-cloud': ['portable-params'],
  rock: ['portable-project', 'glb', 'lod-glb'],
  tree: ['portable-recipe', 'glb'],
  grass: ['portable-preset', 'glb'],
  texture: ['portable-recipe', 'albedo', 'normal', 'roughness', 'metalness', 'ao', 'orm', 'height'],
});

function labCapabilities(entry) {
  const isRock = entry.id === 'rock';
  const catalog = entry.id === 'rock' ? 'rock' : entry.id === 'tree' ? 'tree' : null;
  return {
    authoring: {
      featureMutation: 'set_feature',
      structuralOperations: isRock
        ? ['add_piece', 'remove_piece', 'move_piece', 'add_sculpt_edit', 'clear_sculpt_edits', 'append_mesh_edit', 'clear_mesh_edits', 'set_source', 'set_top_finish']
        : [],
    },
    outputs: OUTPUTS_BY_LAB[entry.id],
    preview: {
      clientOwned: true,
      persisted: false,
      transientFeatures: isRock ? ['adaptive-meadow-grass', 'camera', 'lighting', 'navigation'] : ['camera', 'lighting', 'navigation'],
    },
    sources: catalog
      ? { catalog, discoveryTool: 'search_assets', detailTool: 'get_asset', startTool: 'create_lab_document' }
      : null,
    storage: isRock
      ? {
          meshEditEncoding: 'base64-f32le-v1',
          maxMeshEditDeltas: ROCKGEN_MAX_MESH_EDIT_DELTAS,
          maxMeshEditOperations: ROCKGEN_MAX_MESH_EDIT_OPERATIONS,
        }
      : null,
  };
}

function hash32(value) {
  let result = 0x811c9dc5;
  for (const character of String(value)) {
    result ^= character.charCodeAt(0);
    result = Math.imul(result, 0x01000193);
  }
  return result >>> 0;
}

function portableRockDocument(document) {
  return JSON.parse(serializeRockDocument(document));
}

function sourceValue(source, key) {
  return source?.[key] ?? source?.metadata?.[key] ?? null;
}

export function createRockCatalogStartDocument(source, options = {}) {
  if (!source || typeof source !== 'object') throw new Error('A catalog source object is required.');
  const variation = sourceValue(source, 'variation');
  const sourceId = String(variation?.id ?? source.id ?? '').trim();
  if (!sourceId) throw new Error('The catalog source has no stable rock variation id.');
  const family = String(sourceValue(source, 'familyId') ?? sourceId.replace(/_\d+$/u, '')).trim();
  const variationIndex = Math.max(0, Math.round(Number(options.variation) || 0));
  const variationSeed = hash32(`${sourceId}:${variationIndex}`);
  const label = String(options.label ?? source.label ?? source.name ?? sourceId).trim();
  const surfacePackage = sourceValue(source, 'surfacePackage');
  const document = createRockDocument({
    name: label,
    preset: 'boulder',
    reference: {
      archetype: family,
      catalogVersion: 1,
      family,
      id: sourceId,
      role: Array.isArray(source.tags) ? String(source.tags[0] ?? 'rock') : 'rock',
      series: String(sourceValue(source, 'releaseWave') ?? ''),
      sourceMode: 'mesh-template',
      surfaceMode: surfacePackage ? 'generated' : 'source',
      surfacePackage: surfacePackage ? structuredClone(surfacePackage) : null,
      topFinish: 'source',
      variation: Math.min(Math.max(Number(options.strength ?? 0.3) || 0, 0), 1),
      variationSeed,
    },
    seed: variationSeed,
    style: 'call_me_sensei',
  });
  if (surfacePackage && !document.reference?.surfacePackage) {
    throw new Error("Catalog source has an invalid realistic surface recipe.");
  }
  Object.assign(document.surface, {
    lichenCoverage: 0,
    mossCoverage: 0,
    pbrTexturePreset: 'none',
    stainStrength: 0,
    topCoatStrength: 0,
    veinStrength: 0,
  });
  bumpDocumentRevision(document);
  return portableRockDocument(document);
}

export function createLabDocument(id, options = {}) {
  const entry = LIVE_LABS.find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`Unknown live lab "${id}". Expected one of: ${LIVE_LAB_IDS.join(', ')}.`);
  let document;
  if (id === 'rock' && options.source) {
    document = createRockCatalogStartDocument(options.source, options);
  } else if (id === 'rock') {
    document = portableRockDocument(createRockDocument({
      name: String(options.label ?? STARTER_LABEL),
      preset: options.preset ?? 'boulder',
      seed: Math.round(Number(options.seed) || 0) >>> 0,
      style: options.style ?? 'default',
    }));
  } else {
    document = clone(STARTER_DOCUMENTS[id]);
    const contract = portableDocumentContract(entry);
    document[contract.labelPath] = String(options.label ?? document[contract.labelPath]);
    if (contract.idPath) document[contract.idPath] = String(options.docKey ?? options.id ?? document[contract.idPath]);
  }
  return {
    creationType: entry.creationTypes[0],
    docKey: String(options.docKey ?? options.id ?? document.id ?? `${id}-${Math.round(Number(options.seed) || 0)}`),
    document,
    lab: id,
  };
}

function featureFieldIndex(schema, trail = [], index = new Map()) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return index;
  if (typeof schema.type === 'string') {
    index.set(String(schema.id ?? trail.join('.')), schema);
    index.set(trail.join('.'), schema);
    return index;
  }
  for (const [key, value] of Object.entries(schema)) featureFieldIndex(value, [...trail, key], index);
  return index;
}

function coerceFeatureValue(field, value) {
  if (field.type === 'boolean') {
    if (typeof value !== 'boolean') throw new Error(`${field.id ?? field.key} requires a boolean.`);
    return value;
  }
  if (field.type === 'number') {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error(`${field.id ?? field.key} requires a finite number.`);
    return Math.min(Math.max(number, field.range?.min ?? -Infinity), field.range?.max ?? Infinity);
  }
  if (field.type === 'select') {
    if (!field.options?.includes(value)) throw new Error(`${field.id ?? field.key} must be one of: ${field.options.join(', ')}.`);
    return value;
  }
  if (field.type === 'color') {
    if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
    if (!Array.isArray(value) || value.length < 3 || !value.slice(0, 3).every((part) => Number.isFinite(Number(part)))) {
      throw new Error(`${field.id ?? field.key} requires an RGB array.`);
    }
    return value.slice(0, 3).map((part) => Math.min(Math.max(Number(part), 0), 1));
  }
  if (/^vector[234]$/.test(field.type)) {
    const size = Number(field.type.at(-1));
    if (!Array.isArray(value) || value.length < size || !value.slice(0, size).every((part) => Number.isFinite(Number(part)))) {
      throw new Error(`${field.id ?? field.key} requires a ${size}-component numeric array.`);
    }
    return value.slice(0, size).map(Number);
  }
  if (field.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`${field.id ?? field.key} requires an object.`);
    }
    return clone(value);
  }
  if (field.type === 'texture') {
    if (value !== null && typeof value !== 'string' && (typeof value !== 'object' || Array.isArray(value))) {
      throw new Error(`${field.id ?? field.key} requires a texture id, texture descriptor, or null.`);
    }
    return value && typeof value === 'object' ? clone(value) : value;
  }
  return value;
}

function setNestedValue(target, path, value) {
  const parts = path.split('.').filter(Boolean);
  let cursor = target;
  for (const part of parts.slice(0, -1)) {
    if (!cursor[part] || typeof cursor[part] !== 'object') cursor[part] = {};
    cursor = cursor[part];
  }
  cursor[parts.at(-1)] = value;
}

function setLabFeature(id, document, args) {
  const path = String(args.path ?? '').trim();
  const field = featureFieldIndex(FEATURE_SCHEMAS[id]).get(path);
  if (!field) throw new Error(`Unknown ${id} feature path "${path}".`);
  const value = coerceFeatureValue(field, args.value);
  if (id === 'rock') {
    const group = String(field.group ?? path.split('.')[0]);
    const key = String(field.key ?? path.split('.').at(-1));
    const target = ['surface', 'meshing'].includes(group)
      ? document
      : document.pieces[Math.max(0, Math.round(Number(args.pieceIndex) || 0))];
    if (!target?.[group]) throw new Error(`Rock feature group "${group}" is unavailable on that piece.`);
    target[group][key] = value;
    bumpDocumentRevision(document);
    return document;
  }
  const root = FEATURE_ROOTS[id];
  const targetPath = root && path.startsWith(`${root}.`) ? path.slice(root.length + 1) : path;
  setNestedValue(root ? document[root] : document, targetPath, value);
  return document;
}

function applyRockOperation(document, operation, args) {
  const next = deserializeRockDocument(document);
  if (operation === 'set_feature') return setLabFeature('rock', next, args);
  if (operation === 'add_piece') {
    addPieceToDocument(next, createRockPiece(args.piece ?? args.value ?? 'boulder'));
  } else if (operation === 'remove_piece') {
    if (next.pieces.length <= 1) throw new Error('A rock project must retain at least one piece.');
    if (!removePieceFromDocument(next, String(args.pieceId ?? ''))) throw new Error('Rock piece was not found.');
  } else if (operation === 'move_piece') {
    const from = next.pieces.findIndex((piece) => piece.id === args.pieceId);
    if (from < 0) throw new Error('Rock piece was not found.');
    const to = Math.min(Math.max(Math.round(Number(args.toIndex) || 0), 0), next.pieces.length - 1);
    const [piece] = next.pieces.splice(from, 1);
    next.pieces.splice(to, 0, piece);
    bumpDocumentRevision(next);
  } else if (operation === 'add_sculpt_edit') {
    applySculptEdit(next, args.edit ?? args.value ?? {});
  } else if (operation === 'clear_sculpt_edits') {
    next.sculptEdits = [];
    bumpDocumentRevision(next);
  } else if (operation === 'append_mesh_edit') {
    if (next.reference?.sourceMode !== 'mesh-template') throw new Error('Mesh edits require a source-mesh rock project.');
    const edit = args.edit ?? args.value ?? {};
    const existingDeltaCount = next.reference.meshEdits
      .reduce((total, entry) => total + (Array.isArray(entry.deltas) ? entry.deltas.length : 0), 0);
    const incomingDeltaCount = Array.isArray(edit.deltas) ? edit.deltas.length : 0;
    if (incomingDeltaCount === 0) throw new Error('A mesh edit requires at least one vertex delta.');
    if (next.reference.meshEdits.length + 1 > ROCKGEN_MAX_MESH_EDIT_OPERATIONS
      || existingDeltaCount + incomingDeltaCount > ROCKGEN_MAX_MESH_EDIT_DELTAS) {
      throw new Error(
        `Rock mesh edits are limited to ${ROCKGEN_MAX_MESH_EDIT_OPERATIONS} operations and ${ROCKGEN_MAX_MESH_EDIT_DELTAS} vertex deltas per portable project.`,
      );
    }
    next.reference.meshOperationOrder.push({ type: 'sculpt', index: next.reference.meshEdits.length });
    next.reference.meshEdits.push(edit);
    bumpDocumentRevision(next);
  } else if (operation === 'clear_mesh_edits') {
    if (next.reference?.sourceMode !== 'mesh-template') throw new Error('Mesh edits require a source-mesh rock project.');
    next.reference.meshEdits = [];
    next.reference.meshOperationOrder = next.reference.meshOperationOrder.filter((entry) => entry.type !== 'sculpt');
    bumpDocumentRevision(next);
  } else if (operation === 'set_source') {
    return deserializeRockDocument(createRockCatalogStartDocument(args.source ?? args.value, args));
  } else if (operation === 'set_top_finish') {
    if (next.reference?.sourceMode !== 'mesh-template') throw new Error('Top finishes require a source-mesh rock project.');
    const finish = String(args.finish ?? args.value ?? 'source');
    if (finish === 'source') {
      next.reference.surfaceMode = 'source';
      next.reference.topFinish = 'source';
    } else {
      const settings = finish === 'custom' ? args.settings : ROCK_TOP_FINISHES[finish];
      if (!settings) throw new Error('Top finish must be source, bare, grass, sand, snow, or custom.');
      next.reference.surfaceMode = 'generated';
      next.reference.topFinish = finish;
      Object.assign(next.surface, clone(settings));
    }
    bumpDocumentRevision(next);
  } else {
    throw new Error(`Operation "${operation}" is not supported by the rock lab.`);
  }
  return next;
}

export function applyLabDocumentOperation(id, document, operation, args = {}) {
  if (!LIVE_LAB_IDS.includes(id)) throw new Error(`Unknown live lab "${id}".`);
  if (!document || typeof document !== 'object' || Array.isArray(document)) throw new Error('A portable document object is required.');
  if (id === 'rock') return portableRockDocument(applyRockOperation(document, operation, args));
  if (operation !== 'set_feature') throw new Error(`The ${id} lab supports set_feature; it has no structural operations.`);
  const next = clone(document);
  setLabFeature(id, next, args);
  return next;
}

function countFields(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 0;
  if (typeof value.type === 'string') return 1;
  return Object.values(value).reduce((total, entry) => total + countFields(entry), 0);
}

export function listLiveLabs() {
  return {
    count: LIVE_LABS.length,
    labs: LIVE_LABS.map((entry) => ({
      ...entry,
      capabilities: labCapabilities(entry),
      featureCount: countFields(FEATURE_SCHEMAS[entry.id]),
    })),
  };
}

export function getLabFeatures(id) {
  const entry = LIVE_LABS.find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`Unknown live lab "${id}". Expected one of: ${LIVE_LAB_IDS.join(', ')}.`);
  return {
    capabilities: labCapabilities(entry),
    documentContract: portableDocumentContract(entry),
    lab: entry,
    featureCount: countFields(FEATURE_SCHEMAS[id]),
    schema: FEATURE_SCHEMAS[id],
  };
}
